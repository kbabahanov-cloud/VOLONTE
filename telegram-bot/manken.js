// MANKEN KURALI (9 Kasım, Patron — kural kitabında): büyük bedeni (46 ve üstü) olan BÜTÜN modeller — 38-50 gibi iki seriyi kapsayanlar
// dahil — dolgun büyük beden manken; yüz = 5 Kasım'da onaylanan 3627 beyaz ön fotoğrafındaki manken. Sadece küçük seri (38-44) modeller
// küçük seri yüzüyle. Pelin üretimde, Venom model kartında aynı kuralı kullanır.
export function seriBul(bedenler) {
  const n = (String(bedenler || "").match(/\b\d{2}\b/g) || []).map(Number).filter((x) => x >= 32 && x <= 60);
  return n.length && Math.max(...n) > 44 ? "buyuk" : "kucuk";
}
export const mankenSatiri = (seri, bedenler = null) => `👤 Manken: ${seri === "buyuk" ? "büyük beden (dolgun) yüzü" : "küçük seri yüzü"}${bedenler ? ` — bedenler ${bedenler}` : ""}`;
