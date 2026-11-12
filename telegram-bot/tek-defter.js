// TEK DEFTER — okuma / yazma (12 Kasım, Patron: "tek defter bütün botlarda tamamlansın").
// Defterin KENDİSİ ortak depoda (StokDO, stok.js): iş defteri "isd" (her botun her kartı, cevabı, bitirdiği iş), fabrika kayıtları,
// repete kayıtları ve botların doğrudan yazdığı iş satırları ("isler" tablosu). Depo "/defter" ile TEK listeyi KAYNAĞINDA kurar ve
// kapanması gereken kartları orada kapatır (mantık: defter-mantik.js). Bu dosya botların o deftere okuma / yazma kapısıdır.
import { stokIste } from "./stokbot.js";
export * from "./defter-mantik.js";

const kml = (x) => String(x || "").split(",").map((y) => y.trim()).filter(Boolean);
const ayar = async (env, k, bos = null) => { try { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); } catch { return bos; } };
const kisalt = (t, n = 110) => { const d = String(t || "").replace(/\s+/g, " ").trim(); return d.length <= n ? d : `${d.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
const zamanYaz = (t) => { const d = new Date((t + 3 * 3600) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`; };
// Kişi adları: ekip + fabrika (kimlikler gizli kayıttan; burada sadece ad gösterilir)
export async function kisiAdlari(env) {
  const ad = {};
  for (const [k, a] of [["MURAT_ID", "Patron"], ["HEMRA_ID", "Hemra"], ["FABRIKA_SORUMLU", "Hemra"], ["AZIZ_ID", "Aziz"], ["BR_SORUMLU", "Merdan"], ["FUAT_ID", "Fuat"], ["NURI_ID", "Nuri"]]) for (const id of kml(env[k])) ad[id] = ad[id] || a;
  for (const anahtar of ["sami:fabrikaKisiler", "sami:fiyatKisiler", "sami:stokKisiler"]) {
    const l = (await env.KAYIT.get(anahtar, "json").catch(() => null)) || [];
    for (const p of Array.isArray(l) ? l : []) if (p && p.id != null && p.ad) ad[String(p.id)] = ad[String(p.id)] || String(p.ad).split(" ")[0];
  }
  return ad;
}

// Açık / beklemedeki repeteler (rk:acik). kod verilirse o modelin kapanmış kayıtları da (kimlik "<kod>-…" ile başlar) — az okuma
export async function repeteKayitlari(env, kod = null) {
  const idler = new Set((await ayar(env, "rk:acik", [])) || []);
  if (kod) for (const id of ((await ayar(env, "rk:hepsi", [])) || [])) if (String(id).startsWith(`${kod}-`)) idler.add(id);
  const l = [];
  for (const id of [...idler].slice(-25)) { const r = await ayar(env, `rk:${id}`, null); if (r && !r.deneme && (!kod || String(r.kod) === String(kod))) l.push(r); } // kod verildiyse SADECE o modelin kayıtları
  return l;
}
// Venom'un botlara verdiği işler ve ekibe verdiği görevler (ortak kayıt, KV) → satır. Görev: her MODEL ayrı satır (kim, durum, kanıt).
const SECIM_AD = { c: "bugün çekerim", f: "fabrikada", b: "satıldı / bitti", y: "bulamadım / yapamadım", a: "açıklama yazdı", h: "hallettim", z: "Aziz'e verildi" };
const buyukIlk = (k) => String(k)[0].toLocaleUpperCase("tr") + String(k).slice(1);
export async function venomSatirlari(env, simdi) {
  const s = [];
  const isler = (await env.KAYIT.get("venom:bot:isler", "json").catch(() => null)) || [];
  for (const x of isler) {
    if (["eskidi", "iptal"].includes(x.durum) || simdi - (x.zaman || 0) > 3 * 86400) continue;
    const bitti = x.durum === "bitti";
    s.push({ id: `botis:${x.id}`, tur: "bot", kod: (String(x.ne).match(/\b\d{4,5}\b/) || [null])[0], marka: null, ne: kisalt(x.ne), kim: { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" }[x.bot] || buyukIlk(x.bot), durum: bitti ? "bitti" : "acik", bot: "venom", acildi: x.zaman, guncel: x.bitis || x.zaman,
      kanit: x.kanit || (bitti ? `bot cevap verdi ${zamanYaz(x.bitis || x.zaman)}` : `Venom işi ${zamanYaz(x.zaman)} verdi; cevap bekleniyor`) });
  }
  const gorevler = (await env.KAYIT.get("venom:gorevler", "json").catch(() => null)) || [];
  let sitede = null; // "fotoğraf yok" görevi: model siteye eklendiyse iş bitmiştir (kart basılmamış olsa da cevapsız görünmez)
  for (const g of gorevler) {
    if (g.durum === "kapandi" || simdi - (g.zaman || 0) > 3 * 86400) continue; // 3 günden eski görev listeden düşer
    const kimler = (g.kimler || []).map(buyukIlk).join(", ");
    const fotoIsi = /foto[gğ]raf/i.test(String(g.metin || g.baslik || ""));
    if (fotoIsi && sitede === null) sitede = ((await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null)) || {}).modeller || {};
    for (const k of g.kalemler || []) {
      if (fotoIsi && !k.secim && sitede && sitede[String(k.kod)]) { s.push({ id: `gorev:${g.id}:${k.kod}`, tur: "gorev", kod: String(k.kod), marka: null, ne: kisalt(String(g.metin || g.baslik).replace(/^Patron'dan:\s*/, ""), 90), kim: kimler, durum: "bitti", bot: "venom", acildi: g.zaman, guncel: simdi, kanit: "model siteye eklendi (site defteri); fotoğraf işi bitti" }); continue; }
      s.push({ id: `gorev:${g.id}:${k.kod}`, tur: "gorev", kod: /^\d{3,6}$/.test(String(k.kod)) ? String(k.kod) : null, marka: null, ne: kisalt(String(g.metin || g.baslik).replace(/^Patron'dan:\s*/, ""), 90), kim: k.secim ? k.kim || kimler : kimler, durum: k.secim || g.durum === "bitti" ? "bitti" : "acik", bot: "venom", acildi: g.zaman, guncel: k.zaman || g.bitis || g.zaman,
        kanit: k.secim ? `${k.kim || "?"}: ${SECIM_AD[k.secim] || k.secim}${k.aciklama ? ` — ${String(k.aciklama).slice(0, 60)}` : ""} (${zamanYaz(k.zaman || g.zaman)})` : `görev kartı ${zamanYaz(g.zaman)} gitti, son saat ${zamanYaz(g.son || g.zaman)}${g.durum === "yapilmadi" ? "; süre doldu" : ""}` });
    }
  }
  return s;
}
// Venom kendi işlerini (botlara verdiği iş, ekibe verdiği görev) deftere YAZAR: her kayıt değişiminde ve her okumadan önce
export async function venomDefterEsitle(env, simdi) {
  const satirlar = await venomSatirlari(env, simdi).catch(() => null);
  if (!satirlar) return null;
  return stokIste(env, "/is-yaz", { yazan: "venom", esitle: true, satirlar }).catch(() => null);
}
// Bir botun kendi iş satırlarını deftere yazması (Pelin üretim işleri, Kemal kanal kuyruğu …)
export const defterSatirYaz = (env, yazan, satirlar, esitle = false) => (env && env.STOK ? stokIste(env, "/is-yaz", { yazan, esitle, satirlar: [].concat(satirlar) }).catch(() => null) : null);

// ---------- OKUMA: tek liste (ortak depodan) ----------
// kapat=true: kapanması gereken kartlar depoda kapanır (kök temizlik). kuru=true: hiçbir şey yazılmaz.
export async function defterOku(env, simdi, { kapat = true, kuru = false, venom = false } = {}) {
  const adlar = await kisiAdlari(env);
  if (venom && !kuru) await venomDefterEsitle(env, simdi);
  const r = await stokIste(env, "/defter", { simdi, kuru: kuru || !kapat, adlar });
  return { satirlar: (r && r.satirlar) || [], kapanan: (r && r.kapanan) || [], ozet: (r && r.ozet) || { zaman: simdi }, adlar };
}
