// 13 Kasım (Patron, B1) — HAFTALIK LİSTE (Hemra'ya her pazartesi 10:00, TEK mesaj dizisi): 🔥 hızlı satan 5 + 🧊 hiç satmayanlar.
// Kararı Hemra verir; bu listeden para harcayan hiçbir iş otomatik başlamaz. Fiyat / ciro yazılmaz (sadece adet ve tarih).
const MARKA = { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose", "VOLONTE+BLACKROSE": "VOLONTE + Black Rose" };
const gunKisa = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}` : null);
const zamanKisa = (t) => { if (!t) return null; const d = new Date((Number(t) + 3 * 3600) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };

export function hizliSatanMetni(v) {
  if (!v || !Array.isArray(v.hizli)) return "🔥 Haftanın en çok satan 5 modeli: satış kaydı okunamadı.";
  if (!v.hizli.length) return "🔥 Haftanın en çok satan 5 modeli: bu hafta satış kaydı yok.";
  return ["🔥 Haftanın en çok satan 5 modeli:", ...v.hizli.map((x, i) => `${i + 1}) ${x.kod} — 7 günde ${x.satis7} satış · kalan ${x.kalan}`), "(Repetesi açık olan modeller listede yok.)"].join("\n");
}
export const hizliSatanSatiri = (v) => (v && Array.isArray(v.hizli) && v.hizli.length ? `🔥 Hızlı satan 5: ${v.hizli.map((x) => x.kod).join(", ")}` : null);

// Hiç satmayanlar: her model tek satır — kod · marka · kalan stok · son satış · kanalda son paylaşım. Celal modelleri ayrı başlıkta.
export function hicSatmayanMetni(v) {
  if (!v || !Array.isArray(v.hic)) return ["🧊 Hiç satmayanlar: kayıt okunamadı."];
  const eksikVeri = v.ilkGun && v.ilkGun > v.b30; // satış kaydı 30 günden yeni
  const satir = (x) => `${x.kod} · ${MARKA[x.marka] || x.marka || "marka?"} · kalan ${x.kalan} · son satış: ${gunKisa(x.sonSatis) || (eksikVeri ? `kayıtta yok (${gunKisa(v.ilkGun)} tarihinden beri)` : "30 günden eski")} · kanal: ${zamanKisa(x.tgSon) || "hiç paylaşılmadı"}`;
  const normal = v.hic.filter((x) => !x.celal), celal = v.hic.filter((x) => x.celal);
  const bas = `🧊 Hiç satmayanlar — stokta var, ${eksikVeri ? `${gunKisa(v.ilkGun)} tarihinden beri (satış kaydının başı)` : "son 30 günde"} hiç satış yok: ${v.hic.length} model`;
  if (!v.hic.length) return [`🧊 Hiç satmayanlar: stokta olup son 30 günde hiç satmayan model yok.`];
  const satirlar = [bas, "(Son 30 günde mağazaya gelen modeller listede yok. Karar sizde.)", ...normal.map(satir), ...(celal.length ? ["", `👤 Celal'in modelleri (${celal.length}):`, ...celal.map(satir)] : [])];
  // Telegram sınırı: 3800 karakterlik parçalara böl
  const parcalar = []; let p = [];
  for (const s of satirlar) { if ([...p, s].join("\n").length > 3800) { parcalar.push(p.join("\n")); p = []; } p.push(s); }
  if (p.length) parcalar.push(p.join("\n"));
  return parcalar;
}
