// KURAL 99 (18 Kasım, Patron) — SOLD OUT KÖK KAPISI. Hiçbir bot Sami'nin GÜNCEL stoğuna bakmadan SOLD OUT yapamaz:
// iki mağaza toplamı 0 değilse SOLD OUT yoktur; stok okunamazsa (kayıt yok / köprü verisi eski / depo cevap vermedi) ne SOLD OUT ne
// silme yapılır, sadece deftere "okunamadı" yazılır. Aynı karar iki yerde verilir: önce bot (Kemal), sonra Venom (kendi okumasıyla).
import { magazaAcik } from "./magaza-saat.js";

// Son köprü sinyalinden bu yana mağazanın AÇIK olduğu saat (yarım saat adımıyla; kapalı saatler sayılmaz: gece ve hafta sonu stok değişmez)
export function acikSaatGecen(son, simdi) {
  let n = 0;
  for (let t = Number(son) || 0; t < simdi && n <= 400; t += 1800) if (magazaAcik(t)) n += 0.5;
  return n;
}
// Stok "güncel" mi: her mağaza köprüsü son sinyalinden beri en fazla 3 AÇIK saat susmuş olmalı (10 günden eski sinyal hiç sayılmaz)
export const stokGuncelMi = (sonlar, simdi) => Array.isArray(sonlar) && sonlar.length > 0 && sonlar.every((s) => Number(s) > 0 && simdi - Number(s) < 10 * 86400 && acikSaatGecen(Number(s), simdi) <= 3);

// iste(yol, govde) → StokDO cevabı. Dönüş: { izin: true, toplam: 0 } | { izin: false, neden, toplam? }
export async function soldOutStokKarari(iste, kod, simdi) {
  const k = String(kod || "").trim();
  if (!k) return { izin: false, neden: "stok okunamadı (kod yok)" };
  let r = null, oz = null;
  try { r = await iste("/toplu", { kodlar: [k] }); oz = await iste("/ozet", {}); } catch { return { izin: false, neden: "stok okunamadı (depo cevap vermedi)" }; }
  if (!r || typeof r !== "object" || !oz || !Array.isArray(oz.kopruler)) return { izin: false, neden: "stok okunamadı (depo cevap vermedi)" };
  const st = Object.values(r)[0];
  if (!st) return { izin: false, neden: "stok okunamadı (Vegawin'de bu kodun kaydı yok)" };
  if (Number(st.toplam) > 0) return { izin: false, neden: `stok var (iki mağaza toplamı ${st.toplam} adet)`, toplam: Number(st.toplam) };
  if (!stokGuncelMi(oz.kopruler.map((x) => x.son), simdi)) return { izin: false, neden: "stok okunamadı (mağaza köprüsünün verisi güncel değil)" };
  return { izin: true, toplam: 0 };
}
