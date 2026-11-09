// SAYIM SAMİ — Vegawin stok köprüsünün Venom tarafı.
//
// Mağaza bilgisayarındaki köprü (sami/) Vegawin'den SADECE OKUR ve değişen ürünleri
// POST /kopru ile gönderir. Kayıtlar KV'ye değil bu Durable Object'in SQLite deposuna yazılır.
// Her mağaza (VOLONTE, ileride BLACKROSE) ayrı köprü ve ayrı gizli anahtarla gelir; bir modelin
// adedi mağazaların toplamıdır.
//
// Kurallar (kullanıcı kararı, 23 Ekim):
//  - Toplam adedi 0 ya da eksi olan model sitede ve Telegram'da görünmez.
//  - Adet 0'a düşünce (önceden stokta olduğunu bildiğimiz model) ekibe soru: 🔁 Repete olacak /
//    🗑 Sil / ⏳ Beklesin. Repete: gizli bekler, stok gelince kendiliğinden görünür. Sil: siteden
//    ve Telegram turlarından gizlenir (kanal paylaşımları silinmez, Vegawin'e dokunulmaz).
//    Beklesin: 7 gün sonra hâlâ stok yoksa tekrar sorulur.
//  - İlk eşitlemede zaten 0 olanlar için soru gelmez (yüzlerce soru olmasın); sadece gizlenir.

export const BEKLESIN_STOK_GUN = 7;

import { sha256 } from "./sha256.js";
import { MARKA_KARARLARI } from "./kurallar.js";

export const stokKodu = (kod) => String(kod || "").trim().toUpperCase();
// İndirimli mal kodları (kullanıcı kararı 30 Ekim): 2000 = CRY'den toplu alınan indirimli malların ortak kodu, gerçek model
// değil, tekrar alınmaz. SİLİNMEZ: stoğu ve satışı izlenir; ama eksik listesine (Hemra/Merdan/fabrika), stok-bitti
// sorularına (🔁 Repete / 🗑 Sil), Selin'in fotoğraf isteğine ve Kemal'in model seçimi/repete paylaşımına girmez.
// Satışı Murat'a ayrı tek satır gider. İleride BR/VL DISCOUNT kanalında kullanılacak (fiyatı orada elle yazılır).
export const INDIRIMLI = ["2000"];
export const indirimliMi = (kod) => INDIRIMLI.includes(stokKodu(kod));

const TABLOLAR = [
  `CREATE TABLE IF NOT EXISTS urun (magaza TEXT NOT NULL, kod TEXT NOT NULL, ad TEXT, adet REAL, fiyat REAL,
     guncel INTEGER, PRIMARY KEY (magaza, kod))`,
  `CREATE TABLE IF NOT EXISTS karar (kod TEXT PRIMARY KEY, durum TEXT NOT NULL, kim TEXT, zaman INTEGER,
     sonraki INTEGER, mesajlar TEXT)`,
  `CREATE TABLE IF NOT EXISTS kopru (magaza TEXT PRIMARY KEY, son INTEGER, adet INTEGER)`,
  // Sami'nin günlük raporu için: stok bitti / geldi / fiyat değişti olayları.
  `CREATE TABLE IF NOT EXISTS olay (kod TEXT NOT NULL, tur TEXT NOT NULL, onceki REAL, sonraki REAL, zaman INTEGER NOT NULL)`,
  // Kanal paylaşımları (Sami kanalı izler): paylaşıldığı anda stok ve fiyat — kontrol için.
  `CREATE TABLE IF NOT EXISTS paylasim (mesaj INTEGER PRIMARY KEY, kod TEXT, zaman INTEGER, toplam REAL, fiyat REAL)`,
  `CREATE TABLE IF NOT EXISTS ayar (k TEXT PRIMARY KEY, v TEXT)`,
  // Arama dizinleri (28 Ekim): kod ile sorgular tablonun tamamını taramasın (Cloudflare ücretsiz pakette günlük
  // 5 milyon okunan satır sınırı; dizinsiz her kod sorgusu ~500 satır okuyordu). Kayıtlara dokunmaz.
  // Günlük satış (fabrika eksik listesi için): köprü belge tipi 21 satış faturalarından model başına toplamı gönderir.
  `CREATE TABLE IF NOT EXISTS satis (magaza TEXT NOT NULL, gun TEXT NOT NULL, kod TEXT NOT NULL, adet REAL, PRIMARY KEY (magaza, gun, kod))`,
  // Telegram'da son paylaşım tarihi (29 Ekim): Kemal paylaşınca yazar; stok tablosunda sütun olarak görünür.
  `CREATE TABLE IF NOT EXISTS tg (kod TEXT PRIMARY KEY, son INTEGER)`,
  // Fuat/Nuri Black Rose stok sorguları (30 Ekim): her sorgu kayıtlı (kim, kod, ne zaman, Hemra/Murat kararı).
  `CREATE TABLE IF NOT EXISTS sorgu (id TEXT PRIMARY KEY, kisi TEXT, ad TEXT, kod TEXT, gun TEXT, zaman INTEGER, stok REAL,
     durum TEXT, karar_kim TEXT, karar_zaman INTEGER, murat INTEGER, mesajlar TEXT)`,
  // Mutabakat arşivi (2 Kasım): SADECE EKLENİR. Her kayıt bir öncekinin mührünü (SHA-256) taşır → arada bir kayıt
  // değiştirilir/silinirse zincir bozulur ve /arsiv-dogrula yakalar. Silme/değiştirme yolu yok; veritabanı tetikleyicisi de engeller.
  `CREATE TABLE IF NOT EXISTS arsiv (sira INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL, tur TEXT NOT NULL, mt TEXT,
     icerik TEXT NOT NULL, onceki TEXT NOT NULL, muhur TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS arsiv_dosya (mt TEXT NOT NULL, tur TEXT NOT NULL, zaman INTEGER NOT NULL, muhur TEXT NOT NULL, veri TEXT NOT NULL)`,
  // 9 Kasım (Patron): İŞ DEFTERİ — botların yaptığı HER iş (mesaj, kart, karar, iş, hata). Venom "kim ne yaptı"yı buradan bilir.
  `CREATE TABLE IF NOT EXISTS isd (id INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL, bot TEXT NOT NULL, tur TEXT NOT NULL,
     kime TEXT, kod TEXT, ozet TEXT, chat TEXT, mesaj INTEGER, durum TEXT, sonuc TEXT, deneme INTEGER DEFAULT 0, hatirlatildi INTEGER, cb TEXT)`,
  `CREATE INDEX IF NOT EXISTS isd_zaman ON isd (zaman)`,
  `CREATE INDEX IF NOT EXISTS isd_kart ON isd (chat, mesaj)`,
  `CREATE INDEX IF NOT EXISTS urun_kod ON urun (kod)`,
  `CREATE INDEX IF NOT EXISTS olay_zaman ON olay (zaman)`,
  `CREATE INDEX IF NOT EXISTS paylasim_zaman ON paylasim (zaman)`,
];

// Saf mantık: SQL ile çalışan depo (Durable Object içinde ya da testte node:sqlite ile).
export class StokDeposu {
  constructor(sql) {
    this.sql = sql;
    for (const t of TABLOLAR) this.sql.exec(t);
    // Köprü: "son" = son temas (her gönderim), "degisim" = son değişiklikli gönderim, "kalp" = son boş gönderim
    // (yeni köprünün "çalışıyorum" sinyali). Eski tabloya sütun ekler; kayıtlara dokunmaz.
    for (const sutun of ["degisim", "kalp"]) {
      try { this.sql.exec(`ALTER TABLE kopru ADD COLUMN ${sutun} INTEGER`); } catch { /* zaten var */ }
    }
    // Tedarikçi (29 Ekim): Vegawin kodunda "CELAL" geçen kartlar Celal'in malı (köprü sadece işaret gönderir, ek yazıyı değil).
    // Black Rose adedi (30 Ekim): Vegawin kodu "B" ile biten kartların (3900B, 3900B20) adedi; köprü sadece sayıyı gönderir,
    // ek yazının kendisini değil. null = o modelin Black Rose kartı yok.
    for (const [sutun, tur] of [["tedarikci", "TEXT"], ["ikikart", "INTEGER"], ["bradet", "REAL"]]) {
      try { this.sql.exec(`ALTER TABLE urun ADD COLUMN ${sutun} ${tur}`); } catch { /* zaten var */ }
    }
    for (const tablo of ["arsiv", "arsiv_dosya"]) for (const islem of ["UPDATE", "DELETE"]) {
      try { this.sql.exec(`CREATE TRIGGER IF NOT EXISTS ${tablo}_${islem.toLowerCase()}_yok BEFORE ${islem} ON ${tablo} BEGIN SELECT RAISE(ABORT, 'arşiv değiştirilemez'); END`); } catch { /* tetikleyici desteklenmiyorsa kod yine silmez */ }
    }
  }

  // ---- Mutabakat arşivi (sadece ekleme) ----
  arsivEkle(tur, mt, icerik, zaman) {
    const son = this.tek("SELECT muhur FROM arsiv ORDER BY sira DESC LIMIT 1");
    const onceki = son ? son.muhur : "0".repeat(64);
    const metin = typeof icerik === "string" ? icerik : JSON.stringify(icerik);
    const z = Math.floor(Number(zaman) || Date.now() / 1000);
    const muhur = sha256(`${onceki}|${z}|${tur}|${mt || ""}|${metin}`);
    this.sql.exec("INSERT INTO arsiv (zaman, tur, mt, icerik, onceki, muhur) VALUES (?, ?, ?, ?, ?, ?)", z, String(tur), mt ? String(mt) : null, metin, onceki, muhur);
    return { sira: this.tek("SELECT MAX(sira) AS s FROM arsiv").s, muhur };
  }
  arsivListe(basla = 0, enFazla = 500) { return this.hepsi("SELECT sira, zaman, tur, mt, icerik, onceki, muhur FROM arsiv WHERE sira > ? ORDER BY sira LIMIT ?", Number(basla) || 0, Math.min(Number(enFazla) || 500, 2000)); }
  arsivDogrula() {
    let onceki = "0".repeat(64), n = 0;
    for (const r of this.hepsi("SELECT sira, zaman, tur, mt, icerik, onceki, muhur FROM arsiv ORDER BY sira")) {
      if (r.onceki !== onceki || sha256(`${r.onceki}|${r.zaman}|${r.tur}|${r.mt || ""}|${r.icerik}`) !== r.muhur) return { tamam: false, bozuk: r.sira, kayit: n };
      onceki = r.muhur; n++;
    }
    return { tamam: true, kayit: n, son: onceki };
  }
  // Dosya (PDF, ödeme dekontu): base64; sadece eklenir
  arsivDosyaEkle(mt, tur, veri, zaman) {
    const muhur = sha256(String(veri));
    this.sql.exec("INSERT INTO arsiv_dosya (mt, tur, zaman, muhur, veri) VALUES (?, ?, ?, ?, ?)", String(mt), String(tur), Math.floor(Number(zaman) || Date.now() / 1000), muhur, String(veri));
    return { muhur };
  }
  arsivDosyalar(mt) { return this.hepsi("SELECT mt, tur, zaman, muhur FROM arsiv_dosya WHERE mt = ? ORDER BY zaman", String(mt)); }
  hepsi(sorgu, ...p) { return this.sql.exec(sorgu, ...p).toArray(); }
  tek(sorgu, ...p) { return this.hepsi(sorgu, ...p)[0] || null; }

  toplam(kod) {
    const r = this.tek("SELECT SUM(adet) AS t, COUNT(*) AS n FROM urun WHERE kod = ?", kod);
    return r && r.n ? r.t : null; // null: Vegawin'de yok (bilinmiyor)
  }

  // Köprüden gelen değişiklikler. urunler: [{ kod, ad, adet, fiyat }] ya da { kod, yok: true }.
  yaz(magaza, urunler, simdi) {
    let yazilan = 0;
    let yeniSoru = 0;
    const ilkMi = !this.tek("SELECT magaza FROM kopru WHERE magaza = ?", magaza);
    for (const u of urunler) {
      const kod = stokKodu(u.kod);
      if (!kod) continue;
      const once = this.toplam(kod);
      const onceFiyat = (this.tek("SELECT MAX(fiyat) AS f FROM urun WHERE kod = ?", kod) || {}).f ?? null;
      if (u.yok) this.sql.exec("DELETE FROM urun WHERE magaza = ? AND kod = ?", magaza, kod);
      else {
        this.sql.exec(
          `INSERT INTO urun (magaza, kod, ad, adet, fiyat, guncel, tedarikci, ikikart, bradet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (magaza, kod) DO UPDATE SET ad = excluded.ad, adet = excluded.adet, fiyat = excluded.fiyat, guncel = excluded.guncel,
             tedarikci = excluded.tedarikci, ikikart = excluded.ikikart, bradet = excluded.bradet`,
          magaza, kod, String(u.ad || "").slice(0, 120), Number(u.adet) || 0, u.fiyat == null ? null : Number(u.fiyat), simdi,
          u.celal ? "CELAL" : null, u.ikiKart ? 1 : 0, u.brAdet == null || !Number.isFinite(Number(u.brAdet)) ? null : Number(u.brAdet),
        );
      }
      yazilan += 1;
      const sonra = this.toplam(kod);
      if (!ilkMi) {
        const olay = (tur, a, b) => this.sql.exec("INSERT INTO olay (kod, tur, onceki, sonraki, zaman) VALUES (?, ?, ?, ?, ?)", kod, tur, a, b, simdi);
        if (once != null && once > 0 && (sonra == null || sonra <= 0)) olay("bitti", once, sonra);
        else if ((once == null || once <= 0) && sonra != null && sonra > 0) olay("geldi", once, sonra);
        const yeniFiyat = (this.tek("SELECT MAX(fiyat) AS f FROM urun WHERE kod = ?", kod) || {}).f ?? null;
        if (onceFiyat != null && yeniFiyat != null && onceFiyat !== yeniFiyat) olay("fiyat", onceFiyat, yeniFiyat);
      }
      const karar = this.tek("SELECT durum FROM karar WHERE kod = ?", kod);
      if (sonra != null && sonra > 0) {
        // Stok geldi: repete/beklesin/soru kapanır, model yeniden görünür. "Sil" (gizli) kalır.
        if (karar && karar.durum !== "gizli") this.sql.exec("DELETE FROM karar WHERE kod = ?", kod);
      } else if (!ilkMi && once != null && once > 0 && !karar && !indirimliMi(kod)) { // indirimli mal (2000): soru yok
        this.sql.exec("INSERT INTO karar (kod, durum, zaman) VALUES (?, 'soru', ?)", kod, simdi);
        yeniSoru += 1;
      }
    }
    const bos = !urunler.length;
    this.sql.exec(
      `INSERT INTO kopru (magaza, son, adet, degisim, kalp) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (magaza) DO UPDATE SET son = excluded.son, adet = excluded.adet,
         degisim = COALESCE(excluded.degisim, kopru.degisim), kalp = COALESCE(excluded.kalp, kopru.kalp)`,
      magaza, simdi, this.tek("SELECT COUNT(*) AS n FROM urun WHERE magaza = ?", magaza).n, bos ? null : simdi, bos ? simdi : null,
    );
    return { yazilan, yeniSoru };
  }

  // Gönderilmeyi bekleyen sorular (Beklesin süresi dolup hâlâ stoksuz olanlar dahil).
  sorular(simdi, enFazla) {
    const dolan = this.hepsi("SELECT kod FROM karar WHERE durum = 'beklesin' AND sonraki <= ?", simdi);
    for (const { kod } of dolan) {
      const t = this.toplam(kod);
      if (t != null && t > 0) this.sql.exec("DELETE FROM karar WHERE kod = ?", kod);
      else this.sql.exec("UPDATE karar SET durum = 'soru', mesajlar = NULL, zaman = ? WHERE kod = ?", simdi, kod);
    }
    return this.hepsi("SELECT kod FROM karar WHERE durum = 'soru' AND mesajlar IS NULL ORDER BY zaman LIMIT ?", enFazla)
      .map(({ kod }) => ({ kod, adet: this.toplam(kod), ad: (this.tek("SELECT ad FROM urun WHERE kod = ? LIMIT 1", kod) || {}).ad || "" }));
  }

  soruGonderildi(kod, mesajlar) {
    this.sql.exec("UPDATE karar SET mesajlar = ? WHERE kod = ? AND durum = 'soru'", JSON.stringify(mesajlar), kod);
  }

  // islem: "r" repete, "s" sil (gizle), "b" beklesin. İlk basan geçerli.
  karar(kod, islem, kim, simdi) {
    const k = this.tek("SELECT * FROM karar WHERE kod = ?", kod);
    if (!k || k.durum !== "soru") return { ok: false, kim: k && k.kim, durum: k && k.durum };
    const durum = { r: "repete", s: "gizli", b: "beklesin" }[islem];
    if (!durum) return { ok: false };
    this.sql.exec("UPDATE karar SET durum = ?, kim = ?, zaman = ?, sonraki = ? WHERE kod = ?",
      durum, kim, simdi, islem === "b" ? simdi + BEKLESIN_STOK_GUN * 86400 : null, kod);
    return { ok: true, durum, mesajlar: JSON.parse(k.mesajlar || "[]") };
  }

  // Görünmeyen modeller: toplam adedi ≤ 0 olanlar ve "Sil" ile gizlenenler.
  gizliler() {
    const stoksuz = this.hepsi("SELECT kod FROM urun GROUP BY kod HAVING SUM(adet) <= 0").map((r) => r.kod);
    const silinen = this.hepsi("SELECT kod FROM karar WHERE durum = 'gizli'").map((r) => r.kod);
    return [...new Set([...stoksuz, ...silinen])];
  }

  // Selin için: kod → { toplam, fiyat (en yüksek satış $), gizli }. Vegawin'de olmayan kod listede yer almaz.
  toplu(kodlar) {
    const sonuc = {};
    const silinen = new Set(this.hepsi("SELECT kod FROM karar WHERE durum = 'gizli'").map((r) => r.kod));
    for (const ham of kodlar.slice(0, 3000)) {
      const kod = stokKodu(ham);
      const r = this.tek("SELECT SUM(adet) AS t, MAX(fiyat) AS f, COUNT(*) AS n FROM urun WHERE kod = ?", kod);
      if (!r || !r.n) continue;
      sonuc[kod] = { toplam: r.t, fiyat: r.f, gizli: r.t <= 0 || silinen.has(kod) };
    }
    return sonuc;
  }

  // Black Rose stoğu: sadece "B" kartlarının adedi (VOLONTE stoğu karışmaz). null = Black Rose kartı yok.
  // Black Rose kodu (kullanıcı kararı 31 Ekim): İKİ mağazada da Vegawin kodu "B" ile biten kartlar (bradet) + Murat'ın
  // "Black Rose say" dediği B'siz modeller (ayar "br:say"; o modelin Black Rose mağazasındaki adedi). 2000 hariç.
  brSayListesi() { return JSON.parse(this.ayarOku("br:say") || "[]"); }
  // 6 Kasım (Patron): kesin marka kararı VOLONTE olan kod (ör. 907) "B" kartı olsa da Black Rose stoğu SAYILMAZ
  volonteKarari(k) { let kv = {}; try { kv = JSON.parse(this.ayarOku("marka:karar") || "{}"); } catch { kv = {}; } return (MARKA_KARARLARI[k] || kv[k]) === "VOLONTE"; }
  brStokDetay(kod) {
    const k = stokKodu(kod);
    if (indirimliMi(k) || this.volonteKarari(k)) return null;
    const say = this.brSayListesi().includes(k);
    const d = {};
    for (const r of this.hepsi("SELECT magaza, bradet, adet FROM urun WHERE kod = ?", k)) {
      const v = r.bradet != null ? r.bradet : say && r.magaza === "BLACKROSE" ? r.adet : null;
      if (v != null) d[r.magaza] = (d[r.magaza] || 0) + v;
    }
    return Object.keys(d).length ? d : null;
  }
  brStok(kod) {
    const d = this.brStokDetay(kod);
    return d ? Object.values(d).reduce((s, x) => s + x, 0) : null;
  }
  // Cuma mutabakatı için: mağaza başına Black Rose kodlarının stoğu (adet > 0), kod sırasıyla
  brStoklar() {
    const say = new Set(this.brSayListesi());
    const sonuc = { BLACKROSE: [], VOLONTE: [] };
    for (const r of this.hepsi("SELECT magaza, kod, bradet, adet FROM urun ORDER BY kod")) {
      if (indirimliMi(r.kod) || !sonuc[r.magaza] || this.volonteKarari(r.kod)) continue;
      const v = r.bradet != null ? r.bradet : say.has(r.kod) && r.magaza === "BLACKROSE" ? r.adet : null;
      if (v != null && v > 0) sonuc[r.magaza].push([r.kod, v]);
    }
    for (const l of Object.values(sonuc)) l.sort((a, b) => a[0].localeCompare(b[0], "tr", { numeric: true }));
    return sonuc;
  }

  // ---- Fuat/Nuri stok sorguları ----
  // Günlük sınır dolmadıysa sorgu açılır (o anki Black Rose stoğuyla). Sınır kişi başı, gün içinde açılan bütün sorgular.
  sorguAc({ id, kisi, ad, kod, gun, zaman, sinir }) {
    const n = (this.tek("SELECT COUNT(*) AS n FROM sorgu WHERE kisi = ? AND gun = ?", String(kisi), gun) || {}).n || 0;
    if (n >= sinir) return { sinir: true, sayi: n };
    const stok = this.brStok(kod);
    this.sql.exec("INSERT INTO sorgu (id, kisi, ad, kod, gun, zaman, stok, durum) VALUES (?, ?, ?, ?, ?, ?, ?, 'bekliyor')", id, String(kisi), ad, stokKodu(kod), gun, zaman, stok);
    return { id, stok, detay: this.brStokDetay(kod), sayi: n + 1 };
  }
  sorguOku(id) {
    const r = this.tek("SELECT * FROM sorgu WHERE id = ?", id);
    return r ? { ...r, mesajlar: r.mesajlar ? JSON.parse(r.mesajlar) : [], detay: this.brStokDetay(r.kod) } : null;
  }
  sorguMesaj(id, mesajlar, murat = null) {
    if (murat) this.sql.exec("UPDATE sorgu SET mesajlar = ?, murat = ? WHERE id = ?", JSON.stringify(mesajlar), murat, id);
    else this.sql.exec("UPDATE sorgu SET mesajlar = ? WHERE id = ?", JSON.stringify(mesajlar), id);
    return { ok: true };
  }
  // İlk karar geçerli. Gösterilecekse stok karar anında yeniden okunur (en güncel adet).
  sorguKarar(id, durum, kim, zaman) {
    const r = this.sorguOku(id);
    if (!r || r.durum !== "bekliyor") return { ok: false, kayit: r };
    const stok = durum === "gosterildi" ? this.brStok(r.kod) : r.stok;
    this.sql.exec("UPDATE sorgu SET durum = ?, karar_kim = ?, karar_zaman = ?, stok = ? WHERE id = ?", durum, kim, zaman, stok, id);
    return { ok: true, kayit: this.sorguOku(id) };
  }
  // Hemra'nın cevaplamadığı (Murat'a henüz sorulmamış) ve süresi dolan sorgular.
  sorguBekleyen(muratSiniri, sureSiniri) {
    const murataSor = this.hepsi("SELECT id FROM sorgu WHERE durum = 'bekliyor' AND murat IS NULL AND zaman <= ? LIMIT 5", muratSiniri).map((r) => this.sorguOku(r.id));
    const suresi = this.hepsi("SELECT id FROM sorgu WHERE durum = 'bekliyor' AND zaman <= ? LIMIT 5", sureSiniri).map((r) => r.id);
    for (const id of suresi) this.sql.exec("UPDATE sorgu SET durum = 'suresi' WHERE id = ?", id);
    return { murataSor, suresi: suresi.map((id) => this.sorguOku(id)) };
  }
  sorguListe(basla, bitis) {
    return this.hepsi("SELECT id FROM sorgu WHERE gun >= ? AND gun <= ? ORDER BY zaman", basla, bitis).map((r) => this.sorguOku(r.id));
  }

  // Stokta (toplam > 0) ve satış fiyatı olan, gizlenmemiş modeller (Selin'in toplu yüklemesi için).
  stoktakiler() {
    const silinen = new Set(this.hepsi("SELECT kod FROM karar WHERE durum = 'gizli'").map((r) => r.kod));
    return this.hepsi("SELECT kod, SUM(adet) AS toplam, MAX(fiyat) AS fiyat, MAX(tedarikci) AS tedarikci FROM urun GROUP BY kod HAVING SUM(adet) > 0 AND MAX(fiyat) IS NOT NULL ORDER BY kod")
      .filter((r) => !silinen.has(r.kod) && !indirimliMi(r.kod));
  }

  olaylar(basla, bitis) {
    return this.hepsi("SELECT kod, tur, onceki, sonraki, zaman FROM olay WHERE zaman >= ? AND zaman < ? ORDER BY zaman", basla, bitis);
  }

  // Sami kanalda bir paylaşım görünce: o andaki stok ve fiyatla kaydeder (Vegawin'de olmayan: null).
  paylasimKaydet(mesaj, kod, zaman) {
    const k = stokKodu(kod);
    const fiyat = (this.tek("SELECT MAX(fiyat) AS f, COUNT(*) AS n FROM urun WHERE kod = ?", k) || {});
    this.sql.exec("INSERT OR IGNORE INTO paylasim (mesaj, kod, zaman, toplam, fiyat) VALUES (?, ?, ?, ?, ?)",
      mesaj, k, zaman, this.toplam(k), fiyat.n ? fiyat.f : null);
  }
  paylasimlar(basla, bitis) {
    return this.hepsi("SELECT mesaj, kod, zaman, toplam, fiyat FROM paylasim WHERE zaman >= ? AND zaman < ? ORDER BY zaman", basla, bitis);
  }

  // Bütün bilinen modeller (Sami'nin kontrolleri için): kod → { toplam, fiyat, gizli }.
  tum() {
    const silinen = new Set(this.hepsi("SELECT kod FROM karar WHERE durum = 'gizli'").map((r) => r.kod));
    return Object.fromEntries(this.hepsi("SELECT kod, SUM(adet) AS t, MAX(fiyat) AS f FROM urun GROUP BY kod")
      .map((r) => [r.kod, { toplam: r.t, fiyat: r.f, gizli: r.t <= 0 || silinen.has(r.kod) }]));
  }

  // Köprü o günün satış toplamını her seferinde baştan gönderir (gün içinde artar): günün kayıtları yenilenir.
  satisYaz(magaza, gun, kalemler) {
    this.sql.exec("DELETE FROM satis WHERE magaza = ? AND gun = ?", magaza, gun);
    for (const k of kalemler.slice(0, 2000)) {
      const kod = stokKodu(k.kod);
      const adet = Number(k.adet) || 0;
      if (!kod || adet <= 0) continue;
      this.sql.exec("INSERT INTO satis (magaza, gun, kod, adet) VALUES (?, ?, ?, ?) ON CONFLICT (magaza, gun, kod) DO UPDATE SET adet = satis.adet + excluded.adet", magaza, gun, kod, adet);
    }
    return { ok: true };
  }
  // Günün satılan modelleri: kod, satılan adet (mağazalar toplamı), stokta kalan.
  // magaza verilirse sadece o mağazanın satışları (VOLONTE → Hemra, Black Rose → Merdan; 30 Ekim).
  satislar(gun, magaza = null) {
    return (magaza ? this.hepsi("SELECT kod, SUM(adet) AS satilan FROM satis WHERE gun = ? AND magaza = ? GROUP BY kod ORDER BY kod", gun, magaza)
      : this.hepsi("SELECT kod, SUM(adet) AS satilan FROM satis WHERE gun = ? GROUP BY kod ORDER BY kod", gun))
      .map((r) => ({ kod: r.kod, satilan: r.satilan, kalan: this.toplam(r.kod), ...this.tedarikci(r.kod) }));
  }
  tedarikci(kod) {
    const r = this.tek("SELECT MAX(tedarikci) AS t, MAX(ikikart) AS i FROM urun WHERE kod = ?", stokKodu(kod)) || {};
    return { tedarikci: r.t || null, ikiKart: Boolean(r.i) };
  }

  // Fabrika "Bitti" → "Sil" kararı: model gizlenir (site/Telegram turlarında görünmez). Vegawin'e dokunmaz.
  gizle(kod, kim, simdi) {
    this.sql.exec("INSERT INTO karar (kod, durum, kim, zaman) VALUES (?, 'gizli', ?, ?) ON CONFLICT (kod) DO UPDATE SET durum = 'gizli', kim = excluded.kim, zaman = excluded.zaman", stokKodu(kod), kim, simdi);
    return { ok: true };
  }

  // Telegram son paylaşım: { kod: unix } — sadece daha yeni tarih yazılır.
  tgYaz(kayitlar) {
    for (const [ham, t] of Object.entries(kayitlar || {}).slice(0, 3000)) {
      const kod = stokKodu(ham);
      if (!kod || !(Number(t) > 0)) continue;
      this.sql.exec("INSERT INTO tg (kod, son) VALUES (?, ?) ON CONFLICT (kod) DO UPDATE SET son = MAX(tg.son, excluded.son)", kod, Math.floor(Number(t)));
    }
    return { ok: true };
  }
  tgHepsi() { return Object.fromEntries(this.hepsi("SELECT kod, son FROM tg").map((r) => [r.kod, r.son])); }
  // Dönem satışı (çok satan etiketi için): kod → adet, gün aralığı dahil.
  satisDonem(basla, bitis) {
    return Object.fromEntries(this.hepsi("SELECT kod, SUM(adet) AS a FROM satis WHERE gun >= ? AND gun <= ? GROUP BY kod", basla, bitis).map((r) => [r.kod, r.a]));
  }
  // Stoğun 0'dan geri geldiği son zaman (🔁 etiketi için).
  geldiler(basla) {
    return Object.fromEntries(this.hepsi("SELECT kod, MAX(zaman) AS z FROM olay WHERE tur = 'geldi' AND zaman >= ? GROUP BY kod", basla).map((r) => [r.kod, r.z]));
  }

  // Fabrika siparişi tek çağrıda (30 Ekim): kayıt + açıklar + zamanlı işler dizini + haftalık özet (Sami'nin istek sınırı için).
  fsYaz({ rec, kapali, takip, hafta, ozet }) {
    const oku = (k, bos) => { const v = this.ayarOku(k); return v == null ? bos : JSON.parse(v); };
    this.ayarYaz(`fs:${rec.id}`, JSON.stringify(rec));
    const acik = oku("fs:acik", []);
    const yeni = kapali ? acik.filter((x) => x !== rec.id) : acik.includes(rec.id) ? acik : [...acik, rec.id];
    if (yeni.length !== acik.length) this.ayarYaz("fs:acik", JSON.stringify(yeni));
    const tk = oku("fs:takip", {});
    if (takip ? tk[rec.id] !== takip : rec.id in tk) {
      if (takip) tk[rec.id] = takip; else delete tk[rec.id];
      this.ayarYaz("fs:takip", JSON.stringify(tk));
    }
    if (hafta) {
      const h = oku(`fs:hafta:${hafta}`, {});
      h[rec.id] = ozet;
      this.ayarYaz(`fs:hafta:${hafta}`, JSON.stringify(h));
    }
    return { ok: true };
  }

  ayarOku(k) { return (this.tek("SELECT v FROM ayar WHERE k = ?", k) || {}).v ?? null; }
  ayarYaz(k, v) { this.sql.exec("INSERT INTO ayar (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, String(v)); }

  // 9 Kasım (Patron): REPETE RAPORU verisi tek çağrıda — mağaza başına stok ve satış (ASLA toplanmaz), açık fabrika siparişleri,
  // repete kararları, sitede bakılma (Sami günlük yazar). Fiyat/maliyet yok.
  repeteVeri({ bas14, bas7, bitis, basKarar = null }) {
    const satis = (bas) => this.hepsi("SELECT magaza, kod, SUM(adet) AS a FROM satis WHERE gun >= ? AND gun <= ? GROUP BY magaza, kod", bas, bitis);
    const fs = [];
    for (const id of JSON.parse(this.ayarOku("fs:acik") || "[]").slice(-80)) {
      const r = this.ayarOku(`fs:${id}`); if (!r) continue;
      const x = JSON.parse(r);
      if (!x.deneme) fs.push({ id: x.id, kod: x.kod, durum: x.durum, gonderim: x.gonderim, hazirGun: x.hazirGun || null, cevaplayan: x.cevaplayan || null, renkler: x.renkler || [], grup: x.grup || null });
    }
    return {
      urun: this.hepsi("SELECT magaza, kod, adet FROM urun"),
      s14: satis(bas14), s7: satis(bas7), sKarar: basKarar ? satis(basKarar) : [],
      ilkGun: (this.tek("SELECT MIN(gun) AS g FROM satis") || {}).g || null,
      fs,
      kararlar: JSON.parse(this.ayarOku("repete:kararlar") || "[]"),
      bakis: JSON.parse(this.ayarOku("site:modelBakis") || "null"),
      gizli: this.hepsi("SELECT kod, durum FROM karar"),
    };
  }
  // 9 Kasım (Patron): Venom kısa model kartı — tek model: mağaza mağaza stok ve satış (ASLA toplanmaz), açık fabrika siparişi
  modelOzet({ kod, bas7, bas14, bitis }) {
    const k = stokKodu(kod);
    const sat = (bas) => Object.fromEntries(this.hepsi("SELECT magaza, SUM(adet) AS a FROM satis WHERE kod = ? AND gun >= ? AND gun <= ? GROUP BY magaza", k, bas, bitis).map((r) => [r.magaza, Number(r.a) || 0]));
    const fs = [];
    for (const id of JSON.parse(this.ayarOku("fs:acik") || "[]").slice(-80)) {
      const r = this.ayarOku(`fs:${id}`); if (!r) continue;
      const x = JSON.parse(r);
      if (!x.deneme && String(x.kod) === k) fs.push({ durum: x.durum, gonderim: x.gonderim, hazirGun: x.hazirGun || null, cevaplayan: x.cevaplayan || null, renkler: x.renkler || [] });
    }
    return { kod: k, satirlar: this.hepsi("SELECT magaza, adet FROM urun WHERE kod = ?", k), s7: sat(bas7), s14: sat(bas14), ilkGun: (this.tek("SELECT MIN(gun) AS g FROM satis") || {}).g || null, fs, karar: this.tek("SELECT durum FROM karar WHERE kod = ?", k) || null };
  }
  // ---- 9 Kasım: İŞ DEFTERİ ----
  // kayit: { zaman, bot, tur: "kart"|"mesaj"|"is"|"karar"|"hata", kime, kod, ozet, chat, mesaj, deneme }
  // "karar" (düğmeye basıldı) aynı sohbetteki aynı mesajın kartını kapatır (durum bitti, sonuc = kim + ne)
  isdYaz(kayitlar) {
    for (const k of (kayitlar || []).slice(0, 50)) {
      const z = Number(k.zaman) || Math.floor(Date.now() / 1000);
      if (k.tur === "karar" && k.cb) { // düğme verisiyle eşleşen bekleyen kart(lar) kapanır (aynı kart iki kişiye gittiyse ikisi de: ilk basan geçerli)
        this.sql.exec("UPDATE isd SET durum = 'bitti', sonuc = ? WHERE tur = 'kart' AND durum = 'bekliyor' AND cb LIKE ?", String(k.sonuc || k.ozet || "").slice(0, 200), `%|${String(k.cb).replace(/[%_|]/g, "")}|%`);
      }
      this.sql.exec("INSERT INTO isd (zaman, bot, tur, kime, kod, ozet, chat, mesaj, durum, sonuc, deneme, cb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        z, String(k.bot || "?"), String(k.tur || "is"), k.kime != null ? String(k.kime) : null, k.kod ? String(k.kod) : null, String(k.ozet || "").slice(0, 300),
        k.chat != null ? String(k.chat) : null, k.mesaj != null ? Number(k.mesaj) : null, k.tur === "kart" ? "bekliyor" : null, k.sonuc ? String(k.sonuc).slice(0, 200) : null, k.deneme ? 1 : 0,
        k.tur === "kart" && (k.cbler || []).length ? `|${k.cbler.map((x) => String(x).replace(/[%_|]/g, "")).join("|")}|` : null);
    }
    if (Math.random() < 0.02) this.sql.exec("DELETE FROM isd WHERE zaman < ?", Math.floor(Date.now() / 1000) - 35 * 86400);
    return { ok: true };
  }
  isdOku({ basla = 0, bitis = 9e9, bot = null, denemeDahil = false }) {
    const q = `SELECT * FROM isd WHERE zaman >= ? AND zaman <= ?${bot ? " AND bot = ?" : ""}${denemeDahil ? "" : " AND deneme = 0"} ORDER BY zaman LIMIT 2000`;
    return bot ? this.hepsi(q, basla, bitis, bot) : this.hepsi(q, basla, bitis);
  }
  isdBekleyen({ bot = null, enEski = 0 }) {
    const q = `SELECT * FROM isd WHERE tur = 'kart' AND durum = 'bekliyor' AND deneme = 0 AND zaman >= ?${bot ? " AND bot = ?" : ""} ORDER BY zaman`;
    return bot ? this.hepsi(q, enEski, bot) : this.hepsi(q, enEski);
  }
  isdIsaretle({ idler = [], alan = "hatirlatildi", deger = null }) {
    const izin = { hatirlatildi: "hatirlatildi", durum: "durum" };
    if (!izin[alan]) return { ok: false };
    for (const id of idler.slice(0, 200)) this.sql.exec(`UPDATE isd SET ${izin[alan]} = ? WHERE id = ?`, deger ?? Math.floor(Date.now() / 1000), Number(id));
    return { ok: true };
  }
  repeteKarar(k) {
    const l = JSON.parse(this.ayarOku("repete:kararlar") || "[]");
    l.push(k);
    this.ayarYaz("repete:kararlar", JSON.stringify(l.slice(-400)));
    return { ok: true };
  }

  // 6 Kasım (Patron, sadece rapor): iki mağazanın Vegawin'inde de satırı olan kodlar — kart bilgisi + mağaza başına satış özeti
  ikiMagaza() {
    const kodlar = this.hepsi("SELECT kod FROM urun GROUP BY kod HAVING COUNT(DISTINCT magaza) > 1 ORDER BY kod").map((r) => r.kod);
    return kodlar.map((kod) => ({
      kod,
      satirlar: this.hepsi("SELECT magaza, ad, adet, guncel, tedarikci, ikikart, bradet FROM urun WHERE kod = ? ORDER BY magaza", kod),
      satis: this.hepsi("SELECT magaza, COUNT(*) AS gun, SUM(adet) AS adet, MIN(gun) AS ilk, MAX(gun) AS son FROM satis WHERE kod = ? GROUP BY magaza ORDER BY magaza", kod),
      karar: this.tek("SELECT durum, kim, zaman FROM karar WHERE kod = ?", kod) || null,
    }));
  }

  bilgi(kod) {
    const satirlar = this.hepsi("SELECT magaza, ad, adet, fiyat, guncel FROM urun WHERE kod = ?", kod);
    const karar = this.tek("SELECT durum, kim, zaman, sonraki FROM karar WHERE kod = ?", kod);
    return { kod, satirlar, toplam: this.toplam(kod), karar };
  }

  ozet() {
    return {
      kopruler: this.hepsi("SELECT magaza, son, adet, degisim, kalp FROM kopru ORDER BY magaza"),
      stokta: this.tek("SELECT COUNT(*) AS n FROM (SELECT kod FROM urun GROUP BY kod HAVING SUM(adet) > 0)").n,
      stoksuz: this.tek("SELECT COUNT(*) AS n FROM (SELECT kod FROM urun GROUP BY kod HAVING SUM(adet) <= 0)").n,
      kararlar: this.hepsi("SELECT durum, COUNT(*) AS n FROM karar GROUP BY durum"),
    };
  }
}

export class StokDO {
  constructor(state) {
    this.depo = new StokDeposu(state.storage.sql);
  }
  async fetch(istek) {
    const yol = new URL(istek.url).pathname;
    const g = istek.method === "POST" ? await istek.json() : {};
    const d = this.depo;
    const cevap = (x) => Response.json(x);
    if (yol === "/yaz") return cevap(d.yaz(g.magaza, g.urunler || [], g.simdi));
    if (yol === "/sorular") return cevap(d.sorular(g.simdi, g.enFazla || 6));
    if (yol === "/soru-gonderildi") return cevap(d.soruGonderildi(g.kod, g.mesajlar) || { ok: true });
    if (yol === "/karar") return cevap(d.karar(g.kod, g.islem, g.kim, g.simdi));
    if (yol === "/gizliler") return cevap(d.gizliler());
    if (yol === "/karar-liste") return cevap(d.hepsi("SELECT kod, durum, kim, zaman FROM karar WHERE durum = ? AND zaman >= ? ORDER BY zaman", String(g.durum || "gizli"), Number(g.basla) || 0));
    if (yol === "/stoktakiler") return cevap(d.stoktakiler());
    if (yol === "/olaylar") return cevap(d.olaylar(g.basla, g.bitis));
    if (yol === "/paylasim-kaydet") return cevap(d.paylasimKaydet(g.mesaj, g.kod, g.zaman) || { ok: true });
    if (yol === "/paylasimlar") return cevap(d.paylasimlar(g.basla, g.bitis));
    if (yol === "/tum") return cevap(d.tum());
    if (yol === "/gizle") return cevap(d.gizle(g.kod, g.kim, g.simdi));
    if (yol === "/satis-yaz") return cevap(d.satisYaz(g.magaza, g.gun, g.kalemler || []));
    if (yol === "/satislar") return cevap(d.satislar(g.gun, g.magaza || null));
    if (yol === "/tedarikci") return cevap(Object.fromEntries((g.kodlar || []).slice(0, 200).map((k) => [k, d.tedarikci(k)])));
    if (yol === "/tg-yaz") return cevap(d.tgYaz(g.kayitlar));
    if (yol === "/tg-hepsi") return cevap(d.tgHepsi());
    if (yol === "/satis-donem") return cevap(d.satisDonem(g.basla, g.bitis));
    if (yol === "/geldiler") return cevap(d.geldiler(g.basla || 0));
    if (yol === "/fs-yaz") return cevap(d.fsYaz(g));
    if (yol === "/arsiv-ekle") return cevap(d.arsivEkle(g.tur, g.mt, g.icerik, g.zaman));
    if (yol === "/arsiv-liste") return cevap(d.arsivListe(g.basla, g.enFazla));
    if (yol === "/arsiv-dogrula") return cevap(d.arsivDogrula());
    if (yol === "/arsiv-dosya-ekle") return cevap(d.arsivDosyaEkle(g.mt, g.tur, g.veri, g.zaman));
    if (yol === "/arsiv-dosyalar") return cevap(d.arsivDosyalar(g.mt));
    if (yol === "/ayar-oku") return cevap({ v: d.ayarOku(g.k) });
    if (yol === "/ayar-yaz") return cevap(d.ayarYaz(g.k, g.v) || { ok: true });
    // Botlar arası iş kuyruğu (3 Kasım, Venom): ekleme ve alma tek adımda (KV gibi gecikmeli değil → iş kaybolmaz, iki kez gitmez)
    if (yol === "/kuyruk-ekle") {
      const k = `kuyruk:${g.ad}`, l = JSON.parse(d.ayarOku(k) || "[]");
      if (g.kayit && g.kayit.id && l.some((x) => x.id === g.kayit.id)) return cevap({ ok: true, ayni: true });
      l.push(g.kayit); d.ayarYaz(k, JSON.stringify(l.slice(-200)));
      return cevap({ ok: true, boy: l.length });
    }
    if (yol === "/kuyruk-al") {
      const k = `kuyruk:${g.ad}`, l = JSON.parse(d.ayarOku(k) || "[]");
      if (l.length) d.ayarYaz(k, "[]");
      return cevap(l);
    }
    if (yol === "/toplu") return cevap(d.toplu(g.kodlar || []));
    if (yol === "/br-stok") return cevap({ stok: d.brStok(g.kod), detay: d.brStokDetay(g.kod) });
    if (yol === "/br-stoklar") return cevap(d.brStoklar());
    if (yol === "/sorgu-ac") return cevap(d.sorguAc(g));
    if (yol === "/sorgu-oku") return cevap(d.sorguOku(g.id));
    if (yol === "/sorgu-mesaj") return cevap(d.sorguMesaj(g.id, g.mesajlar || [], g.murat || null));
    if (yol === "/sorgu-karar") return cevap(d.sorguKarar(g.id, g.durum, g.kim, g.zaman));
    if (yol === "/sorgu-bekleyen") return cevap(d.sorguBekleyen(g.murat, g.sure));
    if (yol === "/sorgu-liste") return cevap(d.sorguListe(g.basla, g.bitis));
    if (yol === "/iki-magaza") return cevap(d.ikiMagaza());
    if (yol === "/repete-veri") return cevap(d.repeteVeri(g));
    if (yol === "/model-ozet") return cevap(d.modelOzet(g));
    if (yol === "/isd-yaz") return cevap(d.isdYaz(g.kayitlar));
    if (yol === "/isd-oku") return cevap(d.isdOku(g));
    if (yol === "/isd-bekleyen") return cevap(d.isdBekleyen(g));
    if (yol === "/isd-isaretle") return cevap(d.isdIsaretle(g));
    if (yol === "/repete-karar") return cevap(d.repeteKarar(g));
    if (yol === "/bilgi") return cevap(d.bilgi(stokKodu(g.kod)));
    if (yol === "/ozet") return cevap(d.ozet());
    return new Response("?", { status: 404 });
  }
}
