// MODEL SATIŞ FİYATI (14 Kasım, Patron — acil): Venom ve Sami model koduyla Vegawin'deki SATIŞ fiyatını (dolar, tek adet) okur ve
// SADECE Patron'a verir. Kaynak: mağaza köprüsünün gönderdiği stok kartı (Sami'nin deposu, /bilgi) — Janet'in fiyat sorusuyla
// (kural 48) AYNI kaynak. Kanala ve herkese açık siteye fiyat YAZILMAZ kuralı aynen sürer; alış / maliyet / kâr burada yoktur.
import { stokIste } from "./stokbot.js";

const MAGAZA_AD = (m) => (String(m || "").toUpperCase().replace(/\s+/g, "") === "BLACKROSE" ? "Black Rose" : "VOLONTE");
export const dolarYaz = (n) => `${(Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ",")} $`;
export const fiyatKodlari = (girdi) => [...new Set((Array.isArray(girdi) ? girdi : [girdi]).flatMap((k) => String(k || "").match(/\d{3,6}/g) || []))].slice(0, 15);
// Dönen: [{ kod, var, satir, magazalar: [{ magaza, fiyatlar: [..], adet }] }]
export async function modelFiyatlari(env, girdi) {
  const sonuc = [];
  for (const kod of fiyatKodlari(girdi)) {
    const b = await stokIste(env, "/bilgi", { kod }).catch(() => null);
    const l = ((b && b.satirlar) || []).filter((r) => r.fiyat != null && Number(r.fiyat) > 0);
    if (!l.length) { sonuc.push({ kod, var: false, satir: `${kod}: Vegawin'de satış fiyatı kayıtlı değil${b && (b.satirlar || []).length ? " (kart var, fiyat boş)" : " (bu kod yok)"}` }); continue; }
    const m = {};
    for (const r of l) { const ad = MAGAZA_AD(r.magaza); m[ad] = m[ad] || { magaza: ad, fiyatlar: [], adet: 0 }; if (!m[ad].fiyatlar.includes(Number(r.fiyat))) m[ad].fiyatlar.push(Number(r.fiyat)); m[ad].adet += Number(r.adet) || 0; }
    const magazalar = Object.values(m);
    const parca = magazalar.map((x) => `${x.magaza} ${x.fiyatlar.sort((a, c) => a - c).map(dolarYaz).join(" / ")} (stok ${x.adet})`);
    sonuc.push({ kod, var: true, magazalar, satir: `${kod} · satış fiyatı (Vegawin, tek adet): ${parca.join(" · ")}` });
  }
  return sonuc;
}
export async function modelFiyatMetni(env, girdi) {
  const l = await modelFiyatlari(env, girdi);
  return l.length ? l.map((x) => x.satir).join("\n") : "Geçerli model kodu yok.";
}
