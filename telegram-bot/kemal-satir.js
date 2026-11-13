// 13 Kasım (Patron): "Kemal'i çalıştır" komutunun Patron'a giden TEK satırı (Venom ve Kemal aynı metni kullanır)
export function calistirSatiri(r) {
  if (!r || !r.ok) return `Kemal çalışamadı: ${(r && r.hata) || "bilinmeyen sebep"}.`;
  if (r.planlandi) return `Kemal şu an paylaşım saati dışında (09:00–21:00); istek sabah 09:00 turuna planlandı${r.enAzGun ? ` (en az ${r.enAzGun} gündür paylaşılmayanlar)` : ""}.`;
  if (!r.n) return `Kemal çalıştı ama öneri çıkmadı — sebep: ${r.neden || "uygun model yok"}.`;
  const e = r.enEski;
  return `Kemal çalıştı: ${r.n} model Hemra'nın onayında (en eskisi ${e.kod}, ${e.gun == null ? "hiç paylaşılmamış" : `${e.gun} gün önce`}).`;
}
