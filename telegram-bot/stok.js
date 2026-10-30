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

export const stokKodu = (kod) => String(kod || "").trim().toUpperCase();

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
    for (const [sutun, tur] of [["tedarikci", "TEXT"], ["ikikart", "INTEGER"]]) {
      try { this.sql.exec(`ALTER TABLE urun ADD COLUMN ${sutun} ${tur}`); } catch { /* zaten var */ }
    }
  }
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
          `INSERT INTO urun (magaza, kod, ad, adet, fiyat, guncel, tedarikci, ikikart) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (magaza, kod) DO UPDATE SET ad = excluded.ad, adet = excluded.adet, fiyat = excluded.fiyat, guncel = excluded.guncel,
             tedarikci = excluded.tedarikci, ikikart = excluded.ikikart`,
          magaza, kod, String(u.ad || "").slice(0, 120), Number(u.adet) || 0, u.fiyat == null ? null : Number(u.fiyat), simdi,
          u.celal ? "CELAL" : null, u.ikiKart ? 1 : 0,
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
      } else if (!ilkMi && once != null && once > 0 && !karar) {
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

  // Stokta (toplam > 0) ve satış fiyatı olan, gizlenmemiş modeller (Selin'in toplu yüklemesi için).
  stoktakiler() {
    const silinen = new Set(this.hepsi("SELECT kod FROM karar WHERE durum = 'gizli'").map((r) => r.kod));
    return this.hepsi("SELECT kod, SUM(adet) AS toplam, MAX(fiyat) AS fiyat, MAX(tedarikci) AS tedarikci FROM urun GROUP BY kod HAVING SUM(adet) > 0 AND MAX(fiyat) IS NOT NULL ORDER BY kod")
      .filter((r) => !silinen.has(r.kod));
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
    if (yol === "/ayar-oku") return cevap({ v: d.ayarOku(g.k) });
    if (yol === "/ayar-yaz") return cevap(d.ayarYaz(g.k, g.v) || { ok: true });
    if (yol === "/toplu") return cevap(d.toplu(g.kodlar || []));
    if (yol === "/bilgi") return cevap(d.bilgi(stokKodu(g.kod)));
    if (yol === "/ozet") return cevap(d.ozet());
    return new Response("?", { status: 404 });
  }
}
