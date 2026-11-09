// VENOM KONTROLÜ (6 Kasım, Patron kuralı): Kemal (kanal) ve Selin (site) HİÇBİR ŞEYİ kontrolsüz yayınlamaz.
// Bu modül Venom'un kuralıdır; Kemal ve Selin yayından hemen önce çağırır (aynı kural iki botta, ağ bağımlılığı yok).
// Kontroller: marka (kesin değilse durur), renk (Patron/iş rengiyle), beden ve EN/FR alt yazı, fiyat, aynı gün aynı renkle
// tekrar, yapay zekâ kolajı. Görselin içine bakılmaz (ücretli olurdu): "renk fotoğrafla uyuşuyor mu" yazıdaki renk ile işin
// rengi karşılaştırılarak yapılır. Durdurulan her iş KV "venom:kontrol:engel" (Venom akşam raporu) + Patron'a kısa sebep.
import { MARKA_KARARLARI } from "./kurallar.js";
// 6 Kasım (Patron): kesin marka kararı — kural kitabı + KV "venom:markaKarar" ({ kod: "VOLONTE"|"BLACKROSE" }). Her şeyden önce gelir.
export async function markaKarari(env, kod) {
  const k = String(kod);
  if (MARKA_KARARLARI[k]) return MARKA_KARARLARI[k];
  const kv = env && env.KAYIT ? await env.KAYIT.get("venom:markaKarar", "json").catch(() => null) : null;
  return kv && ["VOLONTE", "BLACKROSE"].includes(kv[k]) ? kv[k] : null;
}
const stokSor = async (env, yol, govde) => {
  const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(govde) });
  return r.json();
};
export const FIYAT = /(\$\s?\d|\d+(?:[.,]\d+)?\s?(?:\$|usd|eur|€|tl|₺)(?![a-z])|\bprice\b|\bprix\b|fiyat)/i;
const TR_EN = { siyah: "black", beyaz: "white", bordo: "burgundy", "kırmızı": "red", lacivert: "navy", mavi: "blue", "yeşil": "green", bej: "beige", krem: "cream", ekru: "ecru", pembe: "pink", pudra: "powder pink", mor: "purple", lila: "lilac", gri: "grey", antrasit: "anthracite", kahverengi: "brown", kahve: "brown", vizon: "mink", taba: "tan", haki: "khaki", "zümrüt": "emerald", mint: "mint", "fuşya": "fuchsia", "sarı": "yellow", hardal: "mustard", turuncu: "orange", somon: "salmon", mercan: "coral", "altın": "gold", "gümüş": "silver", petrol: "teal" };
// "koyu bordo" → "dark burgundy"; bilinmiyorsa null
export function renkIngilizce(tr) {
  const t = String(tr || "").toLocaleLowerCase("tr").trim();
  const m = t.match(/^(koyu|açık|acik)\s+(.+)$/);
  if (m && TR_EN[m[2]]) return `${m[1] === "koyu" ? "dark" : "light"} ${TR_EN[m[2]]}`;
  return TR_EN[t] || null;
}
// Marka KESİN mi? Sami'nin deposu okunamazsa VARSAYILAN YOK (önceden sessizce VOLONTE sayılıyordu → Black Rose'a VOLONTE imzası)
export async function markaKesin(env, kod, { defterden = true } = {}) {
  const pk = await markaKarari(env, kod);
  if (pk) return { marka: pk, kaynak: "Patron kararı" };
  if (defterden) { // 6 Kasım: TEK DOĞRU LİSTE (site defteri) önce
    const d = await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null);
    const m = d && d.modeller && d.modeller[String(kod)];
    if (m && ["BLACKROSE", "VOLONTE"].includes(m.marka)) return { marka: m.marka, kaynak: "site defteri" };
  }
  const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
  if (kart && ["BLACKROSE", "VOLONTE"].includes(kart.marka)) return { marka: kart.marka, kaynak: "model kartı" };
  if (!env.STOK) return { marka: "VOLONTE", kaynak: "varsayılan" };
  for (let i = 0; i < 2; i++) {
    try {
      const b = await stokSor(env, "/bilgi", { kod });
      const m = [...new Set(((b && b.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))].filter(Boolean);
      if (m.length === 1) return { marka: m[0] === "BLACKROSE" ? "BLACKROSE" : "VOLONTE", kaynak: "Sami deposu" };
      if (m.length > 1) return { marka: null, hata: `iki mağazada da kaydı var (${m.join(", ")}) — marka belirsiz` };
      return { marka: "VOLONTE", kaynak: "Vegawin (Black Rose kaydı yok)" };
    } catch { /* bir kez daha */ }
  }
  return { marka: null, hata: "marka okunamadı (Sami'nin deposuna ulaşılamadı)" };
}
// Son paylaşımlar (kod → [{ zaman, renk }]) — aynı gün aynı renk tekrarını yakalamak için
export async function paylasimGecmisi(env) { return (await env.KAYIT.get("kemal:paylasimGecmisi", "json").catch(() => null)) || {}; }
export async function paylasimKaydet(env, kod, renk, simdi) {
  const g = await paylasimGecmisi(env);
  g[kod] = [{ zaman: simdi, renk: String(renk || "").toLowerCase() || null }, ...(g[kod] || [])].filter((x) => simdi - x.zaman < 3 * 86400).slice(0, 10);
  for (const k of Object.keys(g)) if (!g[k].length || simdi - g[k][0].zaman > 3 * 86400) delete g[k];
  await env.KAYIT.put("kemal:paylasimGecmisi", JSON.stringify(g), { expirationTtl: 7 * 86400 }).catch(() => null);
}
const saatYaz = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(11, 16);
// Kanal paketi kontrolü. p: { kod, marka, renkler[], bedenler, en, fr, medya[], adlar[] }; beklenen: { renk (TR) }
export async function kanalKontrol(env, p, { renk = null, simdi = Math.floor(Date.now() / 1000), kopya = false } = {}) {
  const sorunlar = [], uyarilar = [];
  const kod = String(p.kod);
  const mk = await markaKesin(env, kod);
  if (!mk.marka) sorunlar.push(mk.hata);
  else if (!kopya && p.marka && mk.marka !== p.marka) sorunlar.push(`marka yanlış: yazıda ${p.marka === "BLACKROSE" ? "BLACK ROSE" : p.marka}, model ${mk.marka === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"}`);
  else if (kopya && mk.marka === "BLACKROSE") sorunlar.push("Black Rose modeli eski gönderiden KOPYALANAMAZ (eski yazıda VOLONTE imzası olabilir)");
  const yaziRenk = (p.renkler || []).map((x) => String(x).toLowerCase());
  if (!kopya) {
    if (renk) {
      const en = renkIngilizce(renk);
      if (en && yaziRenk.length && !yaziRenk.includes(en)) sorunlar.push(`renk uyuşmuyor: iş/Patron rengi ${renk} (${en}), yazıda ${yaziRenk.join(", ")}`);
      if (en && !yaziRenk.length) uyarilar.push(`yazıda renk satırı yok (beklenen ${en})`);
    } else if (!yaziRenk.length) uyarilar.push("yazıda renk satırı yok");
    if (!String(p.bedenler || "").match(/\d{2}/)) sorunlar.push("beden satırı yok");
    if (!String(p.en || "").trim() || !String(p.fr || "").trim()) sorunlar.push("EN/FR açıklama eksik");
    const baska = ["black", "white", "burgundy", "red", "navy", "blue", "green", "beige", "pink", "purple", "grey", "brown"].filter((c) => new RegExp(`\\b${c}\\b`, "i").test(String(p.en || "")) && !yaziRenk.some((r) => r.split(/\s+/).includes(c)));
    if (yaziRenk.length && baska.length) sorunlar.push(`açıklamada başka renk geçiyor (${baska.join(", ")})`);
    if (FIYAT.test(`${p.en || ""} ${p.fr || ""}`)) sorunlar.push("yazıda FİYAT var");
    // 9 Kasım: Pelin'in yazılı detay sayfası ("detay 1/2", ör. "ELEGANT TWO-PIECE SET") da yapay zekâ kolajıdır
    if ((p.adlar || []).some((a) => /kolaj|collage|infografik|infographic|^detay\s*\d+$/i.test(String(a))) || (p.medya || []).some((m) => /kolaj|collage|infografik/i.test(String(m.media || "")))) sorunlar.push("yapay zekâ kolajı var (kanala konmaz)");
    if (!(p.medya || []).length) sorunlar.push("medya yok");
  }
  // aynı gün tekrar: aynı renk (renk bilinmiyorsa aynı model) son 24 saatte paylaşıldıysa
  const g = (await paylasimGecmisi(env))[kod] || [];
  const benzer = g.find((x) => simdi - x.zaman < 86400 && (kopya || !x.renk || !yaziRenk.length || x.renk === yaziRenk.join(",")));
  if (benzer) sorunlar.push(`bugün ${saatYaz(benzer.zaman)}'de ${benzer.renk ? `aynı renkle (${benzer.renk}) ` : ""}zaten paylaşıldı`);
  const ok = !sorunlar.length;
  return { ok, sorunlar, uyarilar, marka: mk.marka, satir: ok ? `✅ Venom kontrolü tamam${uyarilar.length ? ` (not: ${uyarilar.join("; ")})` : ""}` : `⚠️ Venom kontrolü: ${sorunlar.join("; ")}` };
}
// Durdurulan işin kaydı (Venom akşam raporu + Patron'a kısa sebep)
export async function engelKaydet(env, bot, kod, sorunlar, simdi = Math.floor(Date.now() / 1000)) {
  const l = (await env.KAYIT.get("venom:kontrol:engel", "json").catch(() => null)) || [];
  await env.KAYIT.put("venom:kontrol:engel", JSON.stringify([...l, { zaman: simdi, bot, kod: String(kod), sorunlar }].slice(-50)), { expirationTtl: 7 * 86400 }).catch(() => null);
}
// Site kaydı kontrolü (Selin, siteyeYaz'dan önce): aynı fotoğraf/video iki kez → teki çıkarılır; kolaj → çıkarılır; fiyat → durur
export function siteKontrol(liste, dosyalar = []) {
  const notlar = [], sorunlar = [];
  const icerik = new Map(); // yeni dosyaların içeriği aynıysa
  for (const d of dosyalar) if (d.b64) { const k = d.b64.length + ":" + d.b64.slice(0, 64) + d.b64.slice(-64); if (icerik.has(k)) d.ayni = icerik.get(k); else icerik.set(k, d.yol); }
  const ayniYol = new Map(dosyalar.filter((d) => d.ayni).map((d) => [d.yol, d.ayni]));
  const yeni = liste.map((u) => {
    const f0 = u.fotolar || [], v0 = u.videolar || [];
    const f = [...new Set(f0.filter((x) => !ayniYol.has(x) && !/kolaj|collage/i.test(x)))];
    const v = [...new Set(v0)];
    if (f.length !== f0.length) notlar.push(`${u.kod}: ${f0.length - f.length} tekrar/kolaj fotoğraf çıkarıldı`);
    if (v.length !== v0.length) notlar.push(`${u.kod}: ${v0.length - v.length} tekrar video çıkarıldı`);
    if (FIYAT.test(JSON.stringify(u.aciklama || ""))) sorunlar.push(`${u.kod}: açıklamada fiyat var`);
    return f.length !== f0.length || v.length !== v0.length ? { ...u, fotolar: f, videolar: v } : u;
  });
  return { liste: yeni, dosyalar: dosyalar.filter((d) => !d.ayni), notlar, sorunlar, ok: !sorunlar.length };
}
