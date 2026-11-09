// VENOM KISA MODEL KARTI (9 Kasım, Patron): "3629 kaç adet var?", sesli "36 29" ya da kodsuz fotoğraf → tek mesajda kısa kart.
// Bu dosya saf yardımcılar (test edilebilir): koddan anlama, kart metni (en fazla 6 satır), gizlilik süzgeci.
// Kartta ASLA: fiyat, alış, kâr, ciro, müşteri adı (bunlar sadece ofiste Patron şifresiyle). Repete ASLA doğrudan sipariş değil.
const MARKA_AD = { BLACKROSE: "BLACK ROSE", VOLONTE: "VOLONTE" };
const gunYaz = (t) => { const d = new Date((t + 3 * 3600) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
const gunStr = (g) => (g ? `${String(g).slice(8, 10)}.${String(g).slice(5, 7)}` : "");

// Metindeki model kodları: "3629", "3629 ve 3627", sesli "36 29" / "3 6 2 9" (bitişik iki/dört parça birleştirilir)
export function kodlariBul(metin) {
  const t = String(metin || "");
  const kodlar = [...t.matchAll(/(?<![\d.,])(\d{3,6})(?![\d.,])/g)].map((m) => m[1]);
  for (const m of t.matchAll(/(?<![\d])(\d{2})\s+(\d{2})(?![\d])/g)) kodlar.push(m[1] + m[2]); // "36 29" → 3629
  for (const m of t.matchAll(/(?<![\d])(\d)\s(\d)\s(\d)\s(\d)(?![\d])/g)) kodlar.push(m.slice(1, 5).join(""));
  return [...new Set(kodlar)].filter((k) => !/^(19|20)\d{2}$/.test(k) || k === "2000").slice(0, 5);
}
// Model sorusu mu? (paylaş / video / sil gibi başka bir iş istenmiyorsa ve soru ya da sadece kod varsa)
const BASKA_IS = /paylaş|paylas|kanala|siteye|video|üret|uret|fotoğrafını yap|sil\b|kaldır|repete|fuat|merdan|hemra|mutabakat|hatırlat|indirim|kampanya/i;
const SORU = /kaç|adet|stok|var\s*m[ıi]|ne\s*durumda|nasıl|göster|bilgi|satış|satıyor|bitti\s*mi|durum|\?/i;
export function modelSorusuMu(metin) {
  const t = String(metin || "").trim();
  const kodlar = kodlariBul(t);
  if (!kodlar.length || BASKA_IS.test(t)) return null;
  const kalan = t.replace(/\d/g, "").replace(/[\s,.;:+&-]|\bve\b/gi, "");
  if (SORU.test(t) || kalan.length <= 2) return kodlar;
  return null;
}
// Fotoğraf yazısı kodsuz model sorusu mu? ("bu kaç adet?", "bu hangi model")
export const fotoSorusuMu = (metin) => !kodlariBul(metin).length && /kaç|adet|stok|hangi\s*model|bu\s*ne|var\s*m[ıi]|\?/i.test(String(metin || ""));

// o: { kod, marka, stok: { VOLONTE?: n, BLACKROSE?: n }, s7, s14, gun14, fs: [...], sitede, fotoYok }
export function kartSatirlari(o) {
  const ad = MARKA_AD[o.marka] || null;
  const st = o.marka && o.stok[o.marka] != null ? o.stok[o.marka] : null;
  const satirlar = [`📦 ${o.kod} · ${ad || "marka belirsiz"}`];
  if (st != null) {
    const hiz = o.s14 / Math.max(1, o.gun14 || 14);
    const bitis = st > 0 && hiz > 0 ? Math.max(1, Math.round(st / hiz)) : null;
    satirlar.push(`Stok: ${st} adet (${ad} Vegawin) · son 7 gün ${o.s7} satış${bitis ? ` · ~${bitis} günde biter` : st <= 0 ? " · BİTTİ" : ""}`);
  } else {
    const parca = Object.entries(o.stok).map(([m, n]) => `${MARKA_AD[m] || m} ${n}`);
    satirlar.push(parca.length ? `Stok (mağazalar ayrı): ${parca.join(" · ")} · son 7 gün ${o.s7} satış` : "Vegawin'de stok kaydı yok");
  }
  const f = (o.fs || []).sort((a, b) => (b.gonderim || 0) - (a.gonderim || 0))[0];
  const ne = f && ({ bekliyor: "cevap bekliyor", gelecek: "gelecek", repete: "repete olacak", bitti: "fabrika bitti dedi" }[f.durum] || f.durum);
  satirlar.push(f ? `Fabrika: ${gunYaz(f.gonderim)} sipariş · ${ne}${f.hazirGun ? ` (${gunStr(f.hazirGun)} hazır)` : ""}` : "Fabrikada bekleyen sipariş yok");
  satirlar.push(o.sitede ? "Sitede: var" : "Sitede: yok");
  if (o.fotoYok) satirlar.push("📷 Fotoğraf yok — Selin'in fotoğraf listesine ekledim.");
  return satirlar.slice(0, 6);
}
// Düğmeler (Detay: ofisteki model sayfası hazır olunca açılır — şimdilik gizli)
export const kartDugmeleri = (kod, onek = "") => [
  [{ text: `${onek}📣 Kanalda paylaş`, callback_data: `vmk:p:${kod}` }, { text: `${onek}🔁 Repete al`, callback_data: `vmk:r:${kod}` }],
  [{ text: `${onek}🎬 Pelin video`, callback_data: `vmk:v:${kod}` }],
];
