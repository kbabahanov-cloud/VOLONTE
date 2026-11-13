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
import { defterKur, satirEksigi } from "./defter-mantik.js";

export const stokKodu = (kod) => String(kod || "").trim().toUpperCase();
// İndirimli mal kodları (kullanıcı kararı 30 Ekim): 2000 = CRY'den toplu alınan indirimli malların ortak kodu, gerçek model
// değil, tekrar alınmaz. SİLİNMEZ: stoğu ve satışı izlenir; ama eksik listesine (Hemra/Merdan/fabrika), stok-bitti
// sorularına (🔁 Repete / 🗑 Sil), Selin'in fotoğraf isteğine ve Kemal'in model seçimi/repete paylaşımına girmez.
// Satışı Murat'a ayrı tek satır gider. İleride BR/VL DISCOUNT kanalında kullanılacak (fiyatı orada elle yazılır).
export const INDIRIMLI = ["2000"];
export const indirimliMi = (kod) => INDIRIMLI.includes(stokKodu(kod));
// 12 Kasım (Patron): CELAL — Vegawin kodu "CELAL" ile biten kartlar (köprü işaretler) + "Celal İndirim" carisindeki 3000 ve 3002 Celal'in malıdır.
// Patron'un verdiği liste ("Celal Kayran": 5068, 5067, 9334, 5074, 5076, 5078 · "Celal İndirim": 3000, 3002). 5078'in Vegawin kartında "CELAL" yazmıyor.
export const CELAL_KODLAR = ["3000", "3002", "5068", "5067", "9334", "5074", "5076", "5078"];
// 12 Kasım (Patron): Celal'in modellerinin fotoğrafı yok, 1-2 ay sonra eklenecek — o zamana kadar fotoğraf isteme listesine ve "fotoğraf yok" uyarılarına girmez (false yapınca girer)
export const CELAL_FOTO_BEKLE = true;
export const celalKoduMu = (kod) => CELAL_KODLAR.includes(stokKodu(kod));

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
  // 12 Kasım (Patron, TEK DEFTER): botların doğrudan yazdığı iş satırları (kart olmayan işler: Venom görevi / bot işi, Pelin üretimi,
  // Kemal kanal kuyruğu …). Her işin TEK satırı: ne, kim, marka, durum (acik / beklemede / bitti), kanıt. Kartlar, fabrika ve repete
  // kayıtları zaten bu depoda; "/defter" hepsini tek listede verir.
  `CREATE TABLE IF NOT EXISTS isler (id TEXT PRIMARY KEY, yazan TEXT NOT NULL, tur TEXT, kod TEXT, marka TEXT, ne TEXT, kim TEXT, durum TEXT NOT NULL,
     kanit TEXT, bot TEXT, acildi INTEGER, guncel INTEGER)`,
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
      .map(({ kod }) => { const m = this.hepsi("SELECT DISTINCT magaza FROM urun WHERE kod = ?", kod).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")); return { kod, adet: this.toplam(kod), ad: (this.tek("SELECT ad FROM urun WHERE kod = ? LIMIT 1", kod) || {}).ad || "", magaza: m.length === 1 ? m[0] : m.includes("VOLONTE") ? "VOLONTE" : m[0] || null }; });
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
      .filter((r) => !silinen.has(r.kod) && !indirimliMi(r.kod)).map((r) => (celalKoduMu(r.kod) ? { ...r, tedarikci: "CELAL" } : r))
      .filter((r) => !(CELAL_FOTO_BEKLE && r.tedarikci === "CELAL")); // Selin'in fotoğraf listesi, fotoğrafsız uyarıları ve paylaşılmayanlar bu listeden okur
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
  // 10 Kasım (Patron): TEK SATIŞ SAYIMI — ofis ve Sami aynı yöntemle sayar: o günün o mağazadaki bütün satış satırları (iadeler düşülmüş),
  // indirimli mal (2000) ayrı; toplam BÜTÜN modellerden (ilk 8 değil); liste çoktan aza.
  satisSayim(gun, magaza) {
    const l = this.satislar(gun, magaza);
    const nor = l.filter((x) => !indirimliMi(x.kod)), ind = l.filter((x) => indirimliMi(x.kod));
    const top = (a) => a.reduce((t, x) => t + (Number(x.satilan) || 0), 0);
    return { gun, magaza, toplam: top(nor), model: nor.length, indirimliAdet: top(ind), liste: nor.sort((a, b) => b.satilan - a.satilan || String(a.kod).localeCompare(String(b.kod))).map((x) => ({ kod: x.kod, satilan: x.satilan, kalan: x.kalan })) };
  }
  tedarikci(kod) {
    const r = this.tek("SELECT MAX(tedarikci) AS t, MAX(ikikart) AS i FROM urun WHERE kod = ?", stokKodu(kod)) || {};
    return { tedarikci: r.t || (celalKoduMu(kod) ? "CELAL" : null), ikiKart: Boolean(r.i) };
  }

  // Fabrika "Bitti" → "Sil" kararı: model gizlenir (site/Telegram turlarında görünmez). Vegawin'e dokunmaz.
  gizle(kod, kim, simdi) {
    this.sql.exec("INSERT INTO karar (kod, durum, kim, zaman) VALUES (?, 'gizli', ?, ?) ON CONFLICT (kod) DO UPDATE SET durum = 'gizli', kim = excluded.kim, zaman = excluded.zaman", stokKodu(kod), kim, simdi);
    return { ok: true };
  }

  // 10 Kasım (KESİN KURAL): stok varken kaldırılan model geri — "Sil" gizlemesi kalkar (Telegram turları / site hazırlığı yeniden görür)
  goster(kod) { this.sql.exec("DELETE FROM karar WHERE kod = ? AND durum = 'gizli'", stokKodu(kod)); return { ok: true }; }

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

  // 10 Kasım (Sinem / fabrika zinciri): açık siparişler tek çağrıda (her biri ayrı istek olmasın — Cloudflare istek sınırı)
  // 13 Kasım (Patron, B1): HAFTALIK LİSTE verisi (sadece okur) — hızlı satanlar: son 7 günün satışı (iki mağaza toplamı), fabrikada açık
  // isteği olan model girmez; hiç satmayanlar: stokta var, son 30 günde 0 satış, son 30 günde mağazaya gelen (yeni / yeniden gelen) model girmez.
  haftalikListe({ bugun, simdi }) {
    const gunEk = (g, n) => new Date(Date.parse(`${g}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const b7 = gunEk(bugun, -6), b30 = gunEk(bugun, -29);
    const ilkGun = (this.tek("SELECT MIN(gun) AS g FROM satis") || {}).g || null;
    const stok = new Map();
    for (const r of this.hepsi("SELECT magaza, kod, adet FROM urun")) {
      const k = String(r.kod), x = stok.get(k) || { toplam: 0, magazalar: {} };
      x.toplam += Number(r.adet) || 0; if ((Number(r.adet) || 0) > 0) x.magazalar[r.magaza] = (x.magazalar[r.magaza] || 0) + Number(r.adet);
      stok.set(k, x);
    }
    const marka = (k) => { const m = Object.keys((stok.get(k) || {}).magazalar || {}); return m.length ? m.sort().reverse().join("+") : null; }; // "VOLONTE", "BLACKROSE", "VOLONTE+BLACKROSE"
    const acik = new Set(this.fsAcikler().filter((r) => !r.deneme && !r.mod && ["bekliyor", "gelecek", "repete", "sureSoruluyor"].includes(r.durum)).map((r) => String(r.kod)));
    const hizli = this.hepsi("SELECT kod, SUM(adet) AS n FROM satis WHERE gun >= ? AND gun <= ? GROUP BY kod HAVING n > 0 ORDER BY n DESC, kod LIMIT 80", b7, bugun)
      .filter((r) => !indirimliMi(r.kod) && !acik.has(String(r.kod))).slice(0, 5)
      .map((r) => ({ kod: String(r.kod), satis7: r.n, kalan: Math.max(0, (stok.get(String(r.kod)) || {}).toplam || 0), marka: marka(String(r.kod)) }));
    const satan30 = new Set(this.hepsi("SELECT kod, SUM(adet) AS n FROM satis WHERE gun >= ? AND gun <= ? GROUP BY kod HAVING n > 0", b30, bugun).map((r) => String(r.kod)));
    const yeniGelen = new Set(this.hepsi("SELECT DISTINCT kod FROM olay WHERE tur = 'geldi' AND zaman >= ?", simdi - 30 * 86400).map((r) => String(r.kod)));
    const sonSatis = Object.fromEntries(this.hepsi("SELECT kod, MAX(gun) AS g FROM satis WHERE adet > 0 GROUP BY kod").map((r) => [String(r.kod), r.g]));
    const tg = Object.fromEntries(this.hepsi("SELECT kod, son FROM tg").map((r) => [String(r.kod), r.son]));
    const hic = [...stok.entries()].filter(([k, x]) => x.toplam > 0 && !satan30.has(k) && !yeniGelen.has(k) && !indirimliMi(k))
      .map(([k, x]) => ({ kod: k, marka: marka(k), kalan: x.toplam, sonSatis: sonSatis[k] || null, tgSon: tg[k] || null, celal: this.tedarikci(k).tedarikci === "CELAL" }))
      .sort((a, b) => String(a.kod).localeCompare(String(b.kod), "tr", { numeric: true }));
    return { bugun, b7, b30, ilkGun, hizli, hic };
  }
  fsAcikler() { return JSON.parse(this.ayarOku("fs:acik") || "[]").map((id) => { try { return JSON.parse(this.ayarOku(`fs:${id}`) || "null"); } catch { return null; } }).filter(Boolean); }
  // Kodun en son açık siparişi (deneme hariç; chat verilirse o kişiye gitmiş olan)
  fsKod({ kod, chat = null, deneme = false }) {
    const l = this.fsAcikler().filter((r) => String(r.kod) === String(kod) && Boolean(r.deneme) === Boolean(deneme) && (!chat || (r.mesajlar || []).some((m) => String(m[0]) === String(chat))));
    return l.sort((a, b) => (b.gonderim || 0) - (a.gonderim || 0))[0] || null;
  }
  // Kişiye giden, cevap bekleyen açık siparişler (toplu cevap "hepsi 5 gün")
  fsKisi({ chat, durum = "bekliyor" }) { return this.fsAcikler().filter((r) => r.durum === durum && (r.mesajlar || []).some((m) => String(m[0]) === String(chat))).map((r) => r.id).slice(0, 60); }
  // Sinem'e günlük özet: açık siparişlerin kısa hali (fiyat/stok yok)
  fsOzet() { return this.fsAcikler().map((r) => ({ id: r.id, kod: r.kod, ...(r.mod ? { mod: true } : {}), ...(r.deneme ? { deneme: true } : {}), magaza: r.magaza || null, grup: r.grup || "fabrika", durum: r.durum, gonderim: r.gonderim, hazirGun: r.hazirGun || null, teslimSure: r.teslimSure || null, karar: r.karar || null, kararZaman: r.kararZaman || (r.patronKarar && r.patronKarar.zaman) || (r.hemraOneri && r.hemraOneri.zaman) || null, kararVeren: r.patronKarar ? "Patron" : r.kararVeren || (r.hemraOneri && r.hemraOneri.kim) || null, oneri: r.hemraOneri ? r.hemraOneri.oneri : null, oneriZaman: r.hemraOneri ? r.hemraOneri.zaman : null, deneme: Boolean(r.deneme), chats: [...new Set((r.mesajlar || []).map((m) => String(m[0])))] })); }
  // 10 Kasım KANIT DEFTERİ: bir kodun fabrika kayıtları (mühürlü arşivden; silinemez)
  arsivKod(tur, mt) { return this.hepsi("SELECT sira, zaman, icerik FROM arsiv WHERE tur = ? AND mt = ? ORDER BY sira LIMIT 300", String(tur), String(mt)); }

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
      if (!x.deneme && !x.mod) fs.push({ id: x.id, kod: x.kod, durum: x.durum, gonderim: x.gonderim, hazirGun: x.hazirGun || null, cevaplayan: x.cevaplayan || null, renkler: x.renkler || [], grup: x.grup || null }); // 13 Kasım: deneme modu kaydı rapora girmez
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
      if (!x.deneme && !x.mod && String(x.kod) === k) fs.push({ durum: x.durum, gonderim: x.gonderim, hazirGun: x.hazirGun || null, cevaplayan: x.cevaplayan || null, renkler: x.renkler || [] });
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
      // 12 Kasım (TEK DEFTER, kaynağında): yazıyla verilen cevap o kişinin o modeldeki bekleyen kartını kapatır; aynı kart (aynı kişi, aynı
      // düğmeler) yeniden gönderilirse eskisi kapanır — cevaplanan soru bir daha sorulmaz, aynı iş iki kez durmaz
      if (k.tur === "karar" && !k.cb && k.kod && k.kime != null && /: "|^"/.test(String(k.ozet || ""))) this.sql.exec("UPDATE isd SET durum = 'cevaplandi', sonuc = ? WHERE tur = 'kart' AND durum = 'bekliyor' AND bot = ? AND kime = ? AND kod = ? AND zaman <= ?", String(k.ozet || "").slice(0, 200), String(k.bot || "?"), String(k.kime), String(k.kod), z);
      if (k.tur === "karar" && k.kesin && k.kod && !k.deneme) this.kararKapat({ kod: String(k.kod), kim: k.kimAd || String(k.kime || ""), ne: String(k.ozet || ""), zaman: z, haricCb: k.cb || null });
      if (k.tur === "kart" && (k.cbler || []).length && k.kime != null && !k.deneme) this.sql.exec("UPDATE isd SET durum = 'yenilendi' WHERE tur = 'kart' AND durum = 'bekliyor' AND deneme = 0 AND bot = ? AND kime = ? AND cb = ?", String(k.bot || "?"), String(k.kime), `|${k.cbler.map((x) => String(x).replace(/[%_|]/g, "")).join("|")}|`);
      this.sql.exec("INSERT INTO isd (zaman, bot, tur, kime, kod, ozet, chat, mesaj, durum, sonuc, deneme, cb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        z, String(k.bot || "?"), String(k.tur || "is"), k.kime != null ? String(k.kime) : null, k.kod ? String(k.kod) : null, String(k.ozet || "").slice(0, 300),
        k.chat != null ? String(k.chat) : null, k.mesaj != null ? Number(k.mesaj) : null, k.tur === "kart" ? "bekliyor" : null, k.sonuc ? String(k.sonuc).slice(0, 200) : null, k.deneme ? 1 : 0,
        k.tur === "kart" && (k.cbler || []).length ? `|${k.cbler.map((x) => String(x).replace(/[%_|]/g, "")).join("|")}|` : null);
    }
    if (Math.random() < 0.02) this.sql.exec("DELETE FROM isd WHERE zaman < ?", Math.floor(Date.now() / 1000) - 35 * 86400);
    // 12 Kasım (TEK DEFTER): depo kendi bakımını kendisi yapar — yarım saatte bir, bir yazma sırasında (yeni zamanlayıcı yok):
    // kapanması gereken kartlar kapanır, anlık görüntü ("defter:tek") yenilenir. Hata olursa yazma etkilenmez.
    try {
      const simdi = Math.floor(Date.now() / 1000);
      if (simdi - (Number(this.ayarOku("defter:son")) || 0) >= 1800) { this.ayarYaz("defter:son", String(simdi)); this.defter({ simdi, adlar: JSON.parse(this.ayarOku("defter:adlar") || "{}") }); }
    } catch { /* bakım yazmayı durdurmaz */ }
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
    if (alan === "durum" && deger === "yenilendi") return { ok: true, atlandi: true }; // 12 Kasım: "yenilendi" kararını SADECE depo verir (aynı kişi + aynı düğmeler); dışarıdan gelen kaba işaret (model bazlı) uygulanmaz
    for (const id of idler.slice(0, 200)) this.sql.exec(`UPDATE isd SET ${izin[alan]} = ? WHERE id = ?`, deger ?? Math.floor(Date.now() / 1000), Number(id));
    return { ok: true };
  }
  // 12 Kasım (Patron, C10): bir model için KARAR verildi → o modelin bütün açık kartları (Hemra, Merdan, Aziz, fabrika, Patron) kapanır.
  // Defterde hemen kapanır; telefondaki kartların düğmesi her botun kendi sırasında kalkar (kuyruk "kartKapat:<bot>"). Son karar "karar:son:<kod>".
  kararKapat({ kod, kim = "", ne = "", zaman = Math.floor(Date.now() / 1000), haricCb = null }) {
    const l = this.hepsi("SELECT id, bot, chat, mesaj, cb FROM isd WHERE tur = 'kart' AND durum = 'bekliyor' AND deneme = 0 AND kod = ? AND zaman <= ?", String(kod), zaman);
    const yazi = `Karar verildi${kim ? ` (${String(kim).slice(0, 30)})` : ""}`;
    for (const r of l) {
      this.sql.exec("UPDATE isd SET durum = 'karar', sonuc = ? WHERE id = ?", `${yazi}: ${String(ne).slice(0, 120)}`, r.id);
      if (haricCb && String(r.cb || "").includes(`|${String(haricCb).replace(/[%_|]/g, "")}|`)) continue; // basılan kartı kendi botu zaten güncelledi
      if (!r.chat || !r.mesaj) continue;
      const k = `kuyruk:kartKapat:${r.bot}`, q = JSON.parse(this.ayarOku(k) || "[]");
      q.push({ id: `kk:${r.id}`, chat: r.chat, mesaj: r.mesaj, yazi: `✔ ${yazi}` });
      this.ayarYaz(k, JSON.stringify(q.slice(-200)));
    }
    this.ayarYaz(`karar:son:${kod}`, JSON.stringify({ zaman, kim, ne: String(ne).slice(0, 160), kapanan: l.length }));
    return { ok: true, kapanan: l.length };
  }
  // 12 Kasım: düğmeleri kalkan (düzenlenen) kart defterde kapanır — bütün botlar kendi Telegram sarmalayıcısından bildirir
  isdKartKapat({ chat, mesaj, neden = "kapandi" }) {
    if (chat == null || mesaj == null) return { ok: false };
    this.sql.exec("UPDATE isd SET durum = ? WHERE tur = 'kart' AND durum = 'bekliyor' AND chat = ? AND mesaj = ?", String(neden).slice(0, 20), String(chat), Number(mesaj));
    return { ok: true };
  }
  // 12 Kasım (bir kez): 11 Kasım'daki kaba kural aynı modelin iki AYRI kaydını (ör. büyük / küçük beden) "yenilendi" diye kapatmıştı;
  // gerçekten yenisi (aynı kişi, aynı düğmeler) olmayanlar yeniden "bekliyor" olur. Sonra "/defter" kuralları yeniden uygular.
  isdOnar({ simdi = Math.floor(Date.now() / 1000) } = {}) {
    const l = this.hepsi("SELECT id FROM isd a WHERE a.tur = 'kart' AND a.durum = 'yenilendi' AND a.zaman >= ? AND NOT EXISTS (SELECT 1 FROM isd b WHERE b.tur = 'kart' AND b.bot = a.bot AND b.kime = a.kime AND b.cb = a.cb AND b.id > a.id)", simdi - 3 * 86400);
    for (const r of l) this.sql.exec("UPDATE isd SET durum = 'bekliyor' WHERE id = ?", r.id);
    return { ok: true, acilan: l.length };
  }
  // İş satırları: yaz (aynı kimlik = aynı satır; esitle: bu yazanın listede OLMAYAN açık satırları silinir), liste
  isYaz({ yazan, satirlar = [], esitle = false }) {
    const y = String(yazan || "?").slice(0, 20), simdi = Math.floor(Date.now() / 1000), idler = [];
    const reddedilen = [];
    for (const s0 of (satirlar || []).slice(0, 300)) {
      const s = s0 && { ...s0, acildi: Number(s0.acildi) || simdi };
      const eksik = satirEksigi(s); // 12 Kasım: zorunlu alanı boş satır YAZILAMAZ (tarih, kişi adı, durum, kanıt)
      if (eksik.length) { reddedilen.push({ id: s && s.id, eksik }); continue; }
      const id = String(s.id).slice(0, 120); idler.push(id);
      this.sql.exec("INSERT INTO isler (id, yazan, tur, kod, marka, ne, kim, durum, kanit, bot, acildi, guncel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET tur = excluded.tur, kod = excluded.kod, marka = excluded.marka, ne = excluded.ne, kim = excluded.kim, durum = excluded.durum, kanit = excluded.kanit, guncel = excluded.guncel",
        id, y, s.tur ? String(s.tur).slice(0, 20) : null, s.kod ? String(s.kod).slice(0, 12) : null, s.marka ? String(s.marka).slice(0, 12) : null, String(s.ne || "").slice(0, 240), String(s.kim || "").slice(0, 60), ["acik", "beklemede", "bitti"].includes(s.durum) ? s.durum : "acik", s.kanit ? String(s.kanit).slice(0, 240) : null, String(s.bot || y).slice(0, 20), Number(s.acildi) || simdi, Number(s.guncel) || simdi);
    }
    if (esitle) for (const r of this.hepsi("SELECT id FROM isler WHERE yazan = ?", y)) if (!idler.includes(r.id)) this.sql.exec("DELETE FROM isler WHERE id = ?", r.id);
    this.sql.exec("DELETE FROM isler WHERE durum = 'bitti' AND guncel < ?", simdi - 7 * 86400);
    return { ok: true, n: idler.length, reddedilen };
  }
  isListe({ yazan = null } = {}) { return yazan ? this.hepsi("SELECT * FROM isler WHERE yazan = ? ORDER BY acildi", String(yazan)) : this.hepsi("SELECT * FROM isler ORDER BY acildi"); }
  // TEK DEFTER (kaynağında): bütün işlerin tek listesi; kapanması gereken kartlar burada kapanır (kuru = sadece göster)
  defter({ simdi = Math.floor(Date.now() / 1000), kuru = false, adlar = {} } = {}) {
    if (adlar && Object.keys(adlar).length) this.ayarYaz("defter:adlar", JSON.stringify(adlar)); // kişi adları (bakım için saklanır; depoda kalır)
    else { try { adlar = JSON.parse(this.ayarOku("defter:adlar") || "{}"); } catch { adlar = {}; } }
    const isd = this.hepsi("SELECT * FROM isd WHERE zaman >= ? AND deneme = 0 ORDER BY zaman LIMIT 5000", simdi - 6 * 86400);
    const rk = [];
    for (const id of JSON.parse(this.ayarOku("rk:acik") || "[]").slice(-40)) { try { const r = JSON.parse(this.ayarOku(`rk:${id}`) || "null"); if (r && !r.deneme && !r.mod) rk.push(r); } catch { /* bozuk kayıt atlanır */ } }
    const r = defterKur({ isd, fs: this.fsOzet().filter((x) => !x.mod), rk, ek: this.isListe(), simdi, adlar: adlar || {} });
    // marka: Vegawin kartından (model tek mağazadaysa o; ikisinde de varsa stoğu olan) — "marka kayıtsız" ancak kart hiç yoksa
    const markaOn = new Map();
    for (const x of r.satirlar) {
      if (x.marka || !x.kod) continue;
      if (!markaOn.has(x.kod)) { const m = this.hepsi("SELECT magaza, SUM(adet) AS a FROM urun WHERE kod = ? GROUP BY magaza ORDER BY a DESC", String(x.kod)); markaOn.set(x.kod, m.length ? String(m[0].magaza).toUpperCase().replace(/\s+/g, "") : null); }
      x.marka = markaOn.get(x.kod);
    }
    if (!kuru) {
      for (const x of r.kapanan) this.sql.exec("UPDATE isd SET durum = ? WHERE id = ? AND durum = 'bekliyor'", String(x.neden).slice(0, 20), Number(x.id));
      this.ayarYaz("defter:tek", JSON.stringify({ ...r.ozet, satirlar: r.satirlar.slice(0, 400) }));
      this.ayarYaz("defter:son", String(simdi));
    }
    return r;
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

  // 13 Kasım (Patron): mağaza mağaza stok özeti — stoktaki model, toplam adet, bugün biten / gelen (olay kaydı; model hangi mağazadaysa oraya yazılır)
  magazaOzet({ basla, bitis }) {
    const magazalar = this.hepsi("SELECT magaza, SUM(CASE WHEN adet > 0 THEN 1 ELSE 0 END) AS model, SUM(CASE WHEN adet > 0 THEN adet ELSE 0 END) AS adet FROM urun GROUP BY magaza ORDER BY magaza").map((m) => ({ magaza: m.magaza, model: Number(m.model) || 0, adet: Number(m.adet) || 0, biten: [], gelen: [] }));
    const sonOlay = new Map();
    for (const o of this.olaylar(basla, bitis)) if (o.tur === "bitti" || o.tur === "geldi") sonOlay.set(String(o.kod), o.tur); // gün içinde bitip gelen model son durumuyla sayılır
    for (const [kod, tur] of sonOlay) {
      if (indirimliMi(kod)) continue;
      for (const r of this.hepsi("SELECT magaza, adet FROM urun WHERE kod = ?", kod)) {
        const m = magazalar.find((x) => x.magaza === r.magaza);
        if (!m) continue;
        if (tur === "bitti" && !(Number(r.adet) > 0)) m.biten.push(kod);
        if (tur === "geldi" && Number(r.adet) > 0) m.gelen.push(kod);
      }
    }
    return { magazalar, kopruler: this.hepsi("SELECT magaza, son FROM kopru ORDER BY magaza") };
  }
  // Celal'in Vegawin'deki bütün modelleri: köprünün "CELAL" işaretlediği kartlar + Patron'un listesi (kural 31)
  celalListe() {
    const kodlar = new Set([...this.hepsi("SELECT DISTINCT kod FROM urun WHERE tedarikci = 'CELAL'").map((r) => String(r.kod)), ...CELAL_KODLAR]);
    return [...kodlar].sort().map((kod) => ({ kod, adet: Number((this.tek("SELECT SUM(adet) AS a FROM urun WHERE kod = ?", kod) || {}).a) || 0, isaretli: Boolean(this.tek("SELECT 1 AS v FROM urun WHERE kod = ? AND tedarikci = 'CELAL'", kod)), listede: CELAL_KODLAR.includes(kod) }));
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
    if (yol === "/goster") return cevap(d.goster(g.kod));
    if (yol === "/satis-yaz") return cevap(d.satisYaz(g.magaza, g.gun, g.kalemler || []));
    if (yol === "/satislar") return cevap(d.satislar(g.gun, g.magaza || null));
    if (yol === "/satis-sayim") return cevap(d.satisSayim(g.gun, g.magaza || "VOLONTE"));
    if (yol === "/tedarikci") return cevap(Object.fromEntries((g.kodlar || []).slice(0, 200).map((k) => [k, d.tedarikci(k)])));
    if (yol === "/tg-yaz") return cevap(d.tgYaz(g.kayitlar));
    if (yol === "/tg-hepsi") return cevap(d.tgHepsi());
    if (yol === "/satis-donem") return cevap(d.satisDonem(g.basla, g.bitis));
    if (yol === "/geldiler") return cevap(d.geldiler(g.basla || 0));
    if (yol === "/fs-yaz") return cevap(d.fsYaz(g));
    if (yol === "/fs-kod") return cevap(d.fsKod(g));
    if (yol === "/fs-kisi") return cevap(d.fsKisi(g));
    if (yol === "/fs-ozet") return cevap(d.fsOzet());
    if (yol === "/arsiv-kod") return cevap(d.arsivKod(g.tur, g.mt));
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
    if (yol === "/isd-kart-kapat") return cevap(d.isdKartKapat(g));
    if (yol === "/karar-kapat") return cevap(d.kararKapat(g));
    if (yol === "/isd-kod") return cevap(d.hepsi("SELECT * FROM isd WHERE kod = ? AND zaman >= ? AND deneme = 0 ORDER BY zaman LIMIT 400", String(g.kod), Number(g.basla) || 0));
    if (yol === "/isd-onar") return cevap(d.isdOnar(g));
    if (yol === "/is-yaz") return cevap(d.isYaz(g));
    if (yol === "/is-liste") return cevap(d.isListe(g));
    if (yol === "/defter") return cevap(d.defter(g));
    if (yol === "/repete-karar") return cevap(d.repeteKarar(g));
    if (yol === "/bilgi") return cevap(d.bilgi(stokKodu(g.kod)));
    if (yol === "/ozet") return cevap(d.ozet());
    if (yol === "/magaza-ozet") return cevap(d.magazaOzet(g));
    if (yol === "/haftalik-liste") return cevap(d.haftalikListe({ bugun: g.bugun, simdi: Number(g.simdi) || Math.floor(Date.now() / 1000) })); // 13 Kasım (B1): sadece okuma
    if (yol === "/celal-liste") return cevap(d.celalListe());
    return new Response("?", { status: 404 });
  }
}
