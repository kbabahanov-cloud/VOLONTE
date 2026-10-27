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
];

// Saf mantık: SQL ile çalışan depo (Durable Object içinde ya da testte node:sqlite ile).
export class StokDeposu {
  constructor(sql) {
    this.sql = sql;
    for (const t of TABLOLAR) this.sql.exec(t);
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
      if (u.yok) this.sql.exec("DELETE FROM urun WHERE magaza = ? AND kod = ?", magaza, kod);
      else {
        this.sql.exec(
          `INSERT INTO urun (magaza, kod, ad, adet, fiyat, guncel) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (magaza, kod) DO UPDATE SET ad = excluded.ad, adet = excluded.adet, fiyat = excluded.fiyat, guncel = excluded.guncel`,
          magaza, kod, String(u.ad || "").slice(0, 120), Number(u.adet) || 0, u.fiyat == null ? null : Number(u.fiyat), simdi,
        );
      }
      yazilan += 1;
      const sonra = this.toplam(kod);
      const karar = this.tek("SELECT durum FROM karar WHERE kod = ?", kod);
      if (sonra != null && sonra > 0) {
        // Stok geldi: repete/beklesin/soru kapanır, model yeniden görünür. "Sil" (gizli) kalır.
        if (karar && karar.durum !== "gizli") this.sql.exec("DELETE FROM karar WHERE kod = ?", kod);
      } else if (!ilkMi && once != null && once > 0 && !karar) {
        this.sql.exec("INSERT INTO karar (kod, durum, zaman) VALUES (?, 'soru', ?)", kod, simdi);
        yeniSoru += 1;
      }
    }
    this.sql.exec(
      `INSERT INTO kopru (magaza, son, adet) VALUES (?, ?, ?)
       ON CONFLICT (magaza) DO UPDATE SET son = excluded.son, adet = excluded.adet`,
      magaza, simdi, this.tek("SELECT COUNT(*) AS n FROM urun WHERE magaza = ?", magaza).n,
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
    return this.hepsi("SELECT kod, SUM(adet) AS toplam, MAX(fiyat) AS fiyat FROM urun GROUP BY kod HAVING SUM(adet) > 0 AND MAX(fiyat) IS NOT NULL ORDER BY kod")
      .filter((r) => !silinen.has(r.kod));
  }

  bilgi(kod) {
    const satirlar = this.hepsi("SELECT magaza, ad, adet, fiyat, guncel FROM urun WHERE kod = ?", kod);
    const karar = this.tek("SELECT durum, kim, zaman, sonraki FROM karar WHERE kod = ?", kod);
    return { kod, satirlar, toplam: this.toplam(kod), karar };
  }

  ozet() {
    return {
      kopruler: this.hepsi("SELECT magaza, son, adet FROM kopru ORDER BY magaza"),
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
    if (yol === "/toplu") return cevap(d.toplu(g.kodlar || []));
    if (yol === "/bilgi") return cevap(d.bilgi(stokKodu(g.kod)));
    if (yol === "/ozet") return cevap(d.ozet());
    return new Response("?", { status: 404 });
  }
}
