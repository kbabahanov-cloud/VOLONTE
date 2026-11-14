// GÜNLÜK SATIŞ (11 Kasım, Patron): "Bugün Black Rose kaç adet sattı, kaç dolarlık?" — marka marka ADET ve CİRO, Vegawin'den.
// Adet: köprünün günlük satış sayımı (ofisle aynı yöntem, /satis-sayim). Ciro: köprünün günlük fatura toplamları
// (ciro.js gunlukCiro: satış faturası − satıştan iade = net; para birimi ayrı). İki mağaza ASLA toplanmaz, karşılaştırılmaz.
// Gider (12 Kasım): Vegawin'de gider sadece KASA DEFTERİNDE ("gider" sütunu) — o günün kasa gideri; net = ciro − kasa gideri
// (aynı para biriminde; başka para birimi ayrı yazılır, çevrilmez). SADECE Patron'a.
// 14 Kasım (Patron): fabrika / cari ödemesi borç ödemesidir, günlük gider DEĞİLDİR → giderden ve net'ten HARİÇ; ayrı satır
// "🏭 Fabrikaya ödeme: …" (o gün Black Rose cari hesaplarına yazılan ödemeler; mutabakattaki ödeme satırıyla aynı kaynak).
import { stokIste } from "./stokbot.js";
import { gunlukCiro, kasaGideri, kasaCariOdeme, paraYaz } from "./ciro.js";
import { fabrikaOdemesi } from "./cari-takip.js";

const SAAT_FARKI = 3 * 3600;
const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saatYaz = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
const AD = { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose" };
const ayar = async (env, k) => { try { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v ? JSON.parse(v) : null; } catch { return null; } };

export async function gunlukSatis(env, simdi, gun = gunA(simdi)) {
  const s = { gun };
  const ozet = await stokIste(env, "/ozet", {}).catch(() => null);
  for (const m of ["VOLONTE", "BLACKROSE"]) {
    const say = await stokIste(env, "/satis-sayim", { gun, magaza: m }).catch(() => null);
    const kopru = ((ozet && ozet.kopruler) || []).find((k) => String(k.magaza).toUpperCase() === m) || null;
    const c = await ayar(env, `ciro:${m}`);
    s[m] = { adet: say ? Number(say.toplam) || 0 : null, model: say ? Number(say.model) || 0 : null, indirimli: say ? Number(say.indirimliAdet) || 0 : 0, ciro: gunlukCiro(c, gun), gider: kasaGideri(c, gun), cariOdeme: kasaCariOdeme(c, gun), fabrika: fabrikaOdemesi(await ayar(env, `cari:${m}`), gun), sinyal: kopru ? Math.max(Number(kopru.son) || 0, Number(kopru.kalp) || 0) : null };
  }
  return s;
}
export function ciroYazi(c) {
  if (!c) return "ciro: Vegawin'den günlük fatura toplamı henüz gelmedi";
  if (!c.satirlar.length) return "ciro: bugün kesilmiş fatura yok";
  return `ciro: ${c.satirlar.map((y) => `${paraYaz(y.net)} ${y.birim}${y.iade ? ` (satış ${paraYaz(y.satis)}, iade ${paraYaz(y.iade)})` : ""} · ${y.fatura} fatura`).join(" + ")}`;
}
// Gider + net: "gider 120,00 $ · net 1.080,00 $"; gider başka para birimindeyse ayrı yazılır (net'e katılmaz). "" = gider kaydı gelmiyor
export function giderNetYazi(x) {
  if (!x || !x.gider) return "";
  if (!x.gider.length) return "günlük gider yok";
  const g = x.gider.map((y) => `${paraYaz(y.tutar)} ${y.birim}`).join(" + ");
  const c = x.ciro && x.ciro.satirlar.length === 1 ? x.ciro.satirlar[0] : null, ayni = c ? x.gider.find((y) => y.birim === c.birim) : null;
  return `günlük gider ${g}${c && (ayni || x.gider.length) ? ` · net ${paraYaz(c.net - (ayni ? ayni.tutar : 0))} ${c.birim}${x.gider.some((y) => y.birim !== c.birim) ? " (başka para birimindeki gider düşülmedi)" : ""}` : ""}`;
}
// "🏭 Fabrikaya ödeme: 34.447,00 $ (VOLONTE defteri 23.447,00 $ · Black Rose defteri 11.000,00 $)"; ödeme yoksa null.
// Kasadan başka carilere de ödeme çıktıysa sonuna "· diğer cari ödemeleri X $" eklenir (bunlar da gider sayılmaz).
export function fabrikaOdemeSatiri(v) {
  const p = ["VOLONTE", "BLACKROSE"].map((m) => ({ m, t: v[m] && v[m].fabrika ? v[m].fabrika.tutar : 0 })).filter((x) => x.t > 0.005);
  const kasaCari = ["VOLONTE", "BLACKROSE"].reduce((a, m) => a + ((v[m] && v[m].cariOdeme) || []).filter((y) => y.birim === "$").reduce((b, y) => b + y.tutar, 0), 0);
  const top = p.reduce((a, x) => a + x.t, 0), diger = kasaCari - top;
  if (!p.length && !(diger > 0.5)) return null;
  const ek = diger > 0.5 ? `${p.length ? " · " : ""}diğer cari ödemeleri ${paraYaz(diger)} $` : "";
  return `🏭 Fabrikaya ödeme: ${p.length ? `${paraYaz(top)} $ (${p.map((x) => `${AD[x.m]} defteri ${paraYaz(x.t)} $`).join(" · ")})` : ""}${ek}`.replace(": · ", ": ");
}
// Tek mağaza satırı: "Black Rose: 6 adet (2 model) · ciro: 1.250,00 $ · 3 fatura"
export function magazaSatiri(v, m) {
  const x = v[m];
  if (!x || x.adet == null) return `${AD[m]}: satış kaydı okunamadı`;
  const gn = giderNetYazi(x);
  const fb = x.fabrika && x.fabrika.tutar > 0.005 ? ` · fabrikaya ödeme ${paraYaz(x.fabrika.tutar)} $ (gider sayılmaz)` : "";
  return `${AD[m]}: ${x.adet} adet (${x.model} model)${x.indirimli ? ` + indirimli ${x.indirimli}` : ""} · ${ciroYazi(x.ciro)}${gn ? ` · ${gn}` : ""}${fb}`;
}
// Patron'un sorusuna cevap (en fazla 4 satır). magaza: "VOLONTE" | "BLACKROSE" | null (ikisi AYRI satır)
export function gunlukSatisMetni(v, simdi, magaza = null) {
  const bugun = v.gun === gunA(simdi);
  const ne = bugun ? `Bugün (saat ${saatYaz(simdi)} itibarıyla)` : v.gun === gunA(simdi - 86400) ? "Dün" : v.gun.split("-").reverse().join(".");
  const l = (magaza ? [magaza] : ["VOLONTE", "BLACKROSE"]).map((m) => magazaSatiri(v, m));
  const okuma = (magaza ? [magaza] : ["VOLONTE", "BLACKROSE"]).map((m) => v[m] && v[m].ciro && v[m].ciro.okuma).filter(Boolean);
  const eksik = (magaza ? [magaza] : ["VOLONTE", "BLACKROSE"]).some((m) => v[m] && !v[m].ciro);
  return [`${ne} satış — Vegawin:`, ...l, okuma.length ? `Ciro okuma saati: ${saatYaz(Math.min(...okuma))}.` : null, eksik ? "Günlük ciro köprüden henüz gelmedi (köprü güncellemesi gerekiyor); gelince bu satırda yazar." : null].filter(Boolean).slice(0, 5).join("\n");
}
// Akşam raporu satırı (tek satır, markalar ayrı): "Satış: VOLONTE 12 adet, 840,00 $ · Black Rose 6 adet, 410,00 $"
export function raporSatisSatiri(v) {
  const b = (m) => { const x = v[m]; if (!x || x.adet == null) return `${AD[m]} ?`; const c = x.ciro && x.ciro.satirlar.length ? `, ${x.ciro.satirlar.map((y) => `${paraYaz(y.net)} ${y.birim}`).join(" + ")}` : ""; const gn = c ? giderNetYazi(x).replace(/ \(başka para birimindeki gider düşülmedi\)/, "") : ""; return `${AD[m]} ${x.adet} adet${c}${gn ? ` (${gn})` : ""}`; };
  return `Satış: ${b("VOLONTE")} · ${b("BLACKROSE")}`;
}
// Soru kalıbı: "bugün Black Rose kaç adet sattı, kaç dolarlık" / "dünkü satış" / "bugünkü ciro"
export function satisSorusu(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (!/(sat[ıi][şs]|satt[ıi]|ciro|ka[çc] dolar|dolarl[ıi]k|has[ıi]lat|gider|(?<![\p{L}])net(?![\p{L}]))/u.test(t)) return null;
  if (!/(bug[üu]n|d[üu]n|g[üu]nl[üu]k)/.test(t) || /\b\d{3,5}\b/.test(t.replace(/\d{1,2}[.:]\d{2}/g, ""))) return null; // model kodlu soru başka yoldan
  if (/(y[ıi]ll[ıi]k|bu y[ıi]l|ayl[ıi]k|hafta)/.test(t)) return null;
  return { dun: /d[üu]n/.test(t) && !/bug[üu]n/.test(t), magaza: /black\s*rose|\bbr\b/.test(t) && /volonte/.test(t) ? null : /black\s*rose|\bbr\b/.test(t) ? "BLACKROSE" : /volonte/.test(t) ? "VOLONTE" : null };
}
