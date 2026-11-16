// FABRİKA KARTI KONTROLÜ (16 Kasım, Patron) — fabrikaya (Fuat / Celal / Sinem / Nuri) giden her kart gitmeden ÖNCE Venom'dan geçer.
// Kontroller: (a) kişinin yazdığı mesajdaki model kodu kartla aynı mı · (b) son 7 günde satış 0 ise repete mantıklı mı (kişi uyarıyı görüp
// "evet" dediyse geçer) · (c) renk ve beden kayıtta var mı (kural 87) · (d) kişi o işten sonra "hayır / yanlış / iptal" yazdı mı.
// Uyuşmazlık varsa kart GİTMEZ; kişiye sorulur (Sami üzerinden), çözülmezse Patron'a tek satır. Bu dosya saf mantıktır; veri kaynakları
// (Venom'da ya da Sami'de) dışarıdan verilir.
import { uyumKaydi, uyumKontrol } from "./repete-uyum.js";

// "hayır", "yanlış", "iptal", "vazgeç", "olmaz" (kısa mesajda ya da başta) → geri al / iptal niyeti
export const RET_KALIP = /(?<![\p{L}])(hay[ıi]r|yanl[ıi][şs]\p{L}*|yanlis\p{L}*|iptal\p{L}*|vazge[çc]\p{L}*|olmaz)(?![\p{L}])/iu; // "vazgeçtim", "iptal", "yanlış" (ekli de); "hayırlı" değil
export const retMi = (metin) => {
  const t = String(metin || "").trim();
  if (!t) return false;
  const kel = t.split(/\s+/);
  return RET_KALIP.test(t) && (kel.length <= 6 || RET_KALIP.test(kel.slice(0, 2).join(" ")));
};
export const iptalMi = (metin) => /(?<![\p{L}])(iptal\p{L}*|vazge[çc]\p{L}*)(?![\p{L}])/iu.test(String(metin || ""));
export const evetMi = (metin) => /^\s*(evet|do[ğg]ru|tamam|onay(l[ıi]yorum)?|ok|olur|aynen)\s*[.!]*\s*$/iu.test(String(metin || ""));
// Mesajdaki model kodları: 4–6 haneli sayılar; 3 haneli sayı sadece başta ve yanında adet / beden kelimesi yoksa (907 gibi)
export function modelKodlari(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  const l = [];
  for (const m of t.matchAll(/(?<![\d.,])(\d{3,6})(?![\d.,])/g)) {
    const s = m[1], once = t.slice(Math.max(0, m.index - 12), m.index), sonra = t.slice(m.index + s.length, m.index + s.length + 10);
    if (s.length === 3 && (m.index > 0 || /^\s*(adet|tane|ad\b)/.test(sonra) || /(b[üu]y[üu]k|k[üu][çc][üu]k|buyuk|kucuk)\s*$/.test(once))) continue;
    l.push(s);
  }
  return [...new Set(l)];
}
const dagilimYaz = (d) => (d || []).map((x) => `${x.renk} · ${[x.buyuk ? `büyük ${x.buyuk}` : null, x.kucuk ? `küçük ${x.kucuk}` : null].filter(Boolean).join(", ")}`).join(" / ");
// g = { kod, tur: "repete" | "eksik", dagilim, satis7, satisOnay, kaynakMetin, kaynakZaman, hayirZaman, kim }
// kaynaklar = repete-uyum.js uyumKaydi kaynakları ({ ayarOku, fsKod, site, kart })
export async function fabrikaKontrolu(g, kaynaklar) {
  const sorun = [];
  const kod = String(g.kod || "");
  // (a) mesajdaki model kodu
  if (g.kaynakMetin) {
    const kodlar = modelKodlari(g.kaynakMetin);
    const baska = kodlar.filter((k) => k !== kod);
    if (baska.length && !kodlar.includes(kod)) sorun.push(`kod uyuşmuyor — yazılan mesajda ${baska.join(", ")} var, kart ${kod} için`);
  }
  // (b) satış 0 → repete mantıklı mı
  if (g.tur === "repete" && g.satis7 != null && !(Number(g.satis7) > 0) && !g.satisOnay) sorun.push(`son 7 günde satış yok — ${kod} için repete mantıklı mı, onay alınmadı`);
  // (c) renk / beden (kural 87)
  if (Array.isArray(g.dagilim) && g.dagilim.length && kaynaklar) {
    const u = uyumKontrol(g.dagilim, await uyumKaydi(kod, kaynaklar).catch(() => ({ renkler: [], bedenler: null })));
    if (!u.ok) sorun.push(`renk/beden uyuşmuyor — ${u.sorun.join("; ")}`);
  }
  // (d) kişi "hayır / yanlış / iptal" yazdı mı
  if (g.hayirZaman && Number(g.hayirZaman) >= Number(g.kaynakZaman || 0)) sorun.push(`${g.kim || "kişi"} "hayır / yanlış / iptal" yazdı`);
  return { ok: !sorun.length, sorun, ozet: `${kod}${g.dagilim ? ` · ${dagilimYaz(g.dagilim)}` : ""}` };
}
// Kişiye gidecek "Şunu anladım: 3627 · siyah · büyük · 40 adet. Doğru mu?" satırı (uyarılar altında)
export function anladimSatiri(kod, d, uyarilar = []) {
  const parca = (d || []).flatMap((x) => [x.buyuk ? `${x.renk} · büyük · ${x.buyuk} adet` : null, x.kucuk ? `${x.renk} · küçük · ${x.kucuk} adet` : null].filter(Boolean));
  return [`Şunu anladım: ${kod} · ${parca.join(" + ")}. Doğru mu?`, ...uyarilar.map((u) => `⚠️ ${u}`)].join("\n");
}
