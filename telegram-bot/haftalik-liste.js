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

// 16 Kasım (Patron): "GELECEK" TAKİBİ — fabrikanın "gelecek" dediği ama 7 günde gelmeyen modeller, haftada bir Hemra'ya TEK liste.
// Fabrikaya otomatik soru gitmez. Kaynak: Sami'nin açık fabrika kayıtları (StokDO /fs-ozet). Fiyat / satış yazılmaz.
export const GELECEK_GUN = 7;
const tarihKisa = (t) => { const d = new Date((Number(t) + 3 * 3600) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
export function gelecekGecikenler(fs, simdi) {
  const l = (Array.isArray(fs) ? fs : []).filter((r) => r && r.durum === "gelecek" && !r.deneme && !r.mod && (Number(r.cevapZaman) || Number(r.gonderim) || simdi) <= simdi - GELECEK_GUN * 86400);
  const tek = new Map(); // aynı model birden fazla kayıtla görünürse en eskisi + kaç sipariş
  for (const r of l.sort((a, b) => (a.cevapZaman || a.gonderim) - (b.cevapZaman || b.gonderim))) { const k = String(r.kod); if (tek.has(k)) tek.get(k).siparis++; else tek.set(k, { ...r, siparis: 1 }); }
  // marka: kayıttaki mağaza; eski kayıtta yoksa Black Rose listesi ("-BR") — yine yoksa Venom Vegawin'den doldurur (markaBul)
  return [...tek.values()].map((r) => ({ ...r, magaza: r.magaza || (/-BR$/.test(String(r.liste || "")) ? "BLACKROSE" : null) }));
}
export function gelecekListeMetni(l, simdi) {
  if (!l.length) return null;
  // 16 Kasım (denetim, kural 23/75): marka belli değilse TAHMİN EDİLMEZ — ayrı satırda "marka belli değil" yazar
  const mk = (r) => String(r.magaza || "").toUpperCase().replace(/\s+/g, "");
  const grup = (m) => l.filter((r) => (m === "?" ? !["VOLONTE", "BLACKROSE"].includes(mk(r)) : mk(r) === m));
  const satir = (r) => `${r.kod} (${tarihKisa(r.cevapZaman || r.gonderim)}${r.grup === "celal" ? ", Celal" : ""})`;
  const bloklar = [["VOLONTE", "🟦 VOLONTE"], ["BLACKROSE", "🌹 BLACK ROSE"], ["?", "❔ Marka belli değil"]].map(([m, ad]) => { const g = grup(m); return g.length ? `${ad} (${g.length}): ${g.map(satir).join(" · ")}` : null; }).filter(Boolean);
  return [`📦 Fabrika "gelecek" dedi, ${GELECEK_GUN} günde gelmedi (${tarihKisa(simdi)}):`, ...bloklar, "Fabrikaya otomatik soru gitmedi; gerekirse arayın. Mal geldiyse kartındaki düğmeden \"geldi\" işaretleyin. (Parantezde: fabrikanın \"gelecek\" dediği ilk gün)"].join("\n");
}
