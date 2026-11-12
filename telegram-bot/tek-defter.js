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
  for (const id of [...idler].slice(-25)) { const r = await ayar(env, `rk:${id}`, null); if (r && !r.deneme) l.push(r); }
  return l;
}
// Venom'un botlara verdiği işler ve ekibe verdiği görevler (ortak kayıt, KV) → satır
export async function venomSatirlari(env, simdi) {
  const s = [];
  const isler = (await env.KAYIT.get("venom:bot:isler", "json").catch(() => null)) || [];
  for (const x of isler) {
    if (["eskidi", "iptal"].includes(x.durum) || simdi - (x.zaman || 0) > 3 * 86400) continue;
    s.push({ id: `botis:${x.id}`, tur: "bot", kod: (String(x.ne).match(/\b\d{4,5}\b/) || [null])[0], marka: null, ne: kisalt(x.ne), kim: { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" }[x.bot] || x.bot, durum: x.durum === "bitti" ? "bitti" : "acik", bot: "venom", acildi: x.zaman, guncel: x.bitis || x.zaman, kanit: x.kanit || (x.durum === "bitti" ? `bot cevap verdi (${zamanYaz(x.bitis || x.zaman)})` : null) });
  }
  const gorevler = (await env.KAYIT.get("venom:gorevler", "json").catch(() => null)) || [];
  for (const g of gorevler) {
    if (g.durum === "bitti" && simdi - (g.bitis || g.zaman || 0) > 86400) continue;
    if (g.durum === "kapandi") continue;
    const kalan = (g.kalemler || []).filter((k) => !k.secim).length, hepsi = (g.kalemler || []).length;
    s.push({ id: `gorev:${g.id}`, tur: "gorev", kod: hepsi === 1 ? String(g.kalemler[0].kod) : null, marka: null, ne: kisalt(g.baslik || g.metin), kim: (g.kimler || []).map((k) => k[0].toLocaleUpperCase("tr") + k.slice(1)).join(", "), durum: g.durum === "bitti" ? "bitti" : "acik", bot: "venom", acildi: g.zaman, guncel: g.bitis || g.zaman,
      kanit: g.durum === "bitti" ? `${hepsi} modelin hepsi cevaplandı` : `${hepsi - kalan}/${hepsi} cevaplandı${g.durum === "yapilmadi" ? ", süre doldu" : ""}` });
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
