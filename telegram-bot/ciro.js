// YILLIK CİRO (2 Kasım, Patron): /ciro — SADECE Patron. Her mağaza AYRI bölümde; iki mağaza toplanmaz, karşılaştırılmaz
// (kalıcı kural). Kaynak: köprülerin gönderdiği satış faturası başlıkları (BELGETIPI 21, iptaller hariç, TUTAR) ve satıştan
// iade (alış fatura tablosunda BELGETIPI 22). Net = satış − iade. Para birimi karışıksa her biri ayrı satır.
// Alış fiyatı, maliyet, kâr hiçbir yerde yok.
import { stokIste } from "./stokbot.js";
import { muratMi } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const para = (x) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tarihSaat = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`; };
const birim = (d) => (!d || d === "$" || /^usd$/i.test(d) ? "$" : d);
const gunlukMu = (s) => /^GUN:\d{4}-\d{2}-\d{2}$/.test(String((s && s.tablo) || ""));
// 11 Kasım (Patron): GÜNLÜK ciro — köprünün gönderdiği "GUN:<gün>" satırları (satış faturası 21, satıştan iade 22), para birimi ayrı.
// Dönen: null = o gün için köprüden günlük satır hiç gelmemiş; yoksa { okuma, satirlar: [{ birim, satis, iade, net, fatura, iadeAdet }] }
export function gunlukCiro(c, gun) {
  if (!c || !(c.satirlar || []).some(gunlukMu)) return null; // köprü günlük satır göndermiyor (eski sürüm)
  const b = {};
  for (const s of c.satirlar) {
    if (String(s.tablo) !== `GUN:${gun}`) continue;
    const y = (b[birim(s.doviz)] = b[birim(s.doviz)] || { birim: birim(s.doviz), satis: 0, iade: 0, fatura: 0, iadeAdet: 0 });
    if (s.kaynak === "iade") { y.iade += Number(s.tutar) || 0; y.iadeAdet += s.n || 0; }
    else if (String(s.tur) === "21") { y.satis += Number(s.tutar) || 0; y.fatura += s.n || 0; }
  }
  return { okuma: c.zaman, satirlar: Object.values(b).map((y) => ({ ...y, net: y.satis - y.iade })).sort((x, y) => x.birim.localeCompare(y.birim)) };
}
export const paraYaz = (x) => para(x);
export function ciroBolumu(ad, c) {
  if (!c || !(c.satirlar || []).filter((s) => !gunlukMu(s)).length) return [`🏬 ${ad}`, "Köprü ciro verisini henüz göndermedi."];
  const yillar = {};
  let digerBelge = 0;
  for (const s of c.satirlar) {
    if (gunlukMu(s)) continue; // 11 Kasım: günlük satırlar (GUN:yyyy-aa-gg) yıllık toplamda zaten var → ayrıca sayılmaz
    const k = `${s.yil}|${birim(s.doviz)}`;
    const y = (yillar[k] = yillar[k] || { yil: s.yil, birim: birim(s.doviz), satis: 0, iade: 0, fatura: 0, iadeAdet: 0 });
    if (s.kaynak === "iade") { y.iade += Number(s.tutar) || 0; y.iadeAdet += s.n || 0; }
    else if (String(s.tur) === "21") { y.satis += Number(s.tutar) || 0; y.fatura += s.n || 0; }
    else digerBelge += s.n || 0; // satış dışı belge (ör. tür 23 alıştan iade): alış tarafı → tutarı GÖSTERİLMEZ
  }
  const satirlar = Object.values(yillar).sort((a, b) => a.yil - b.yil || a.birim.localeCompare(b.birim))
    .map((y) => `${y.yil}: satış ${para(y.satis)} ${y.birim} · iade ${para(y.iade)} ${y.birim} · NET ${para(y.satis - y.iade)} ${y.birim} (${y.fatura} fatura${y.iadeAdet ? `, ${y.iadeAdet} iade` : ""})`);
  return [`🏬 ${ad} (son okuma ${tarihSaat(c.zaman)})`, ...satirlar, ...(digerBelge ? [`(satış dışı ${digerBelge} belge ciroya katılmadı)`] : [])];
}
export async function ciroKomutu(env, m, tg) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu rapor sadece Patron'da." });
  const oku = async (k) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v ? JSON.parse(v) : null; };
  const [vl, br] = await Promise.all([oku("ciro:VOLONTE"), oku("ciro:BLACKROSE")]);
  const metin = ["📈 Yıllık ciro — sadece siz görüyorsunuz (her mağaza ayrı; iptal edilen faturalar hariç)", "", ...ciroBolumu("VOLONTE", vl), "", ...ciroBolumu("BLACK ROSE", br)].join("\n");
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: metin.slice(0, 4000) });
}
