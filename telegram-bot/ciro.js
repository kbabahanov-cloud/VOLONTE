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
const gunlukMu = (s) => /^(GUN:\d{4}-\d{2}-\d{2}$|KASA:|KASAISLEM:)/.test(String((s && s.tablo) || "")); // günlük ciro ve kasa satırları yıllık toplama girmez
// 12 Kasım (Patron): KASA GİDERİ — Vegawin kasa defterinde o gün "gider" yazılan toplam (para birimi ayrı). null = köprü kasa satırı göndermiyor
// 14 Kasım (Patron): fabrika / cari ödemesi BORÇ ÖDEMESİDİR, günlük gider DEĞİLDİR. Köprü kasa giderini gün × işlem türü olarak da
// gönderir ("KASA:<gün>#<tür>"); Vegawin kasa defterinde cari hesaba ödeme türü "-3"tür (cari hareketleriyle karşılaştırılıp doğrulandı).
// Tür ayrımı gelmeyen gün için gider YAZILMAZ (null): yanlış sayı yazmaktansa hiç yazılmaz.
export const KASA_CARI_TUR = "-3";
function kasaTur(c, gun, cariMi) {
  if (!c || !(c.satirlar || []).some((s) => /^KASA(ISLEM)?:/.test(String(s.tablo || "")))) return null;
  const on = `KASA:${gun}#`;
  const ayri = c.satirlar.filter((s) => String(s.tablo || "").startsWith(on));
  if (!ayri.length) return c.satirlar.some((s) => String(s.tablo) === `KASA:${gun}`) ? null : [];
  const b = {};
  for (const s of ayri) { if ((String(s.tablo).slice(on.length) === KASA_CARI_TUR) !== cariMi) continue; const k = birim(s.doviz); b[k] = b[k] || { birim: k, tutar: 0, n: 0 }; b[k].tutar += Number(s.tutar) || 0; b[k].n += s.n || 0; }
  return Object.values(b).sort((x, y) => x.birim.localeCompare(y.birim));
}
export const kasaGideri = (c, gun) => kasaTur(c, gun, false);   // günlük gider: cari / fabrika ödemeleri HARİÇ
export const kasaCariOdeme = (c, gun) => kasaTur(c, gun, true); // kasadan cari hesaplara ödenen (borç ödemesi)
export const kasaIslemleri = (c) => ((c && c.satirlar) || []).filter((s) => /^KASAISLEM:/.test(String(s.tablo || ""))).map((s) => ({ islem: String(s.tablo).slice(10), birim: birim(s.doviz), n: s.n || 0, tutar: Number(s.tutar) || 0 })).sort((a, b) => b.tutar - a.tutar);
// 11 Kasım (Patron): GÜNLÜK ciro — köprünün gönderdiği "GUN:<gün>" satırları (satış faturası 21, satıştan iade 22), para birimi ayrı.
// Dönen: null = o gün için köprüden günlük satır hiç gelmemiş; yoksa { okuma, satirlar: [{ birim, satis, iade, net, fatura, iadeAdet }] }
export function gunlukCiro(c, gun) {
  if (!c || !(c.satirlar || []).some((s) => /^GUN:/.test(String(s.tablo || "")))) return null; // köprü günlük satır göndermiyor (eski sürüm)
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
