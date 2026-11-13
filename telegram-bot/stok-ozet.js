// 13 Kasım (Patron): "İki mağazanın stoğunu ver" → Vegawin'den TEK özet, mağaza mağaza (VOLONTE / Black Rose ayrı, toplanmaz):
// stoktaki model sayısı, toplam adet, bugün biten, bugün gelen. En fazla 8 satır; model kodu sorulmaz. Venom ve Sami aynı metni verir.
// Kaynak: StokDO "/magaza-ozet" (Vegawin köprüsünün yazdığı kayıt). Fiyat / ciro YOK (kural 24).
const AD = { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose" };
const sayiYaz = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const saatYaz = (t) => new Date((Number(t) + 3 * 3600) * 1000).toISOString().slice(11, 16);
const gunYaz = (t) => { const d = new Date((Number(t) + 3 * 3600) * 1000).toISOString().slice(0, 10).split("-"); return `${d[2]}.${d[1]}`; };
const kodlar = (l) => (l.length ? ` (${l.slice(0, 6).join(", ")}${l.length > 6 ? ` +${l.length - 6}` : ""})` : "");
export function magazaOzetMetni(o, simdi) {
  if (!o || !Array.isArray(o.magazalar) || !o.magazalar.length) return "Mağaza stoğu şu an okunamadı (Vegawin kaydı boş).";
  const sirali = ["VOLONTE", "BLACKROSE"].map((m) => o.magazalar.find((x) => String(x.magaza).toUpperCase().replace(/\s+/g, "") === m)).filter(Boolean);
  const satirlar = [`📦 Mağaza stoğu — Vegawin (${gunYaz(simdi)} ${saatYaz(simdi)})`];
  for (const m of sirali) {
    const ad = AD[String(m.magaza).toUpperCase().replace(/\s+/g, "")] || m.magaza;
    satirlar.push(`${ad}: stokta ${sayiYaz(m.model)} model · toplam ${sayiYaz(m.adet)} adet`);
    satirlar.push(`   bugün biten ${m.biten.length}${kodlar(m.biten)} · bugün gelen ${m.gelen.length}${kodlar(m.gelen)}`);
  }
  const k = (o.kopruler || []).filter((x) => x.son).map((x) => `${AD[String(x.magaza).toUpperCase().replace(/\s+/g, "")] || x.magaza} ${saatYaz(x.son)}`);
  if (k.length) satirlar.push(`Son Vegawin okuması: ${k.join(" · ")}`);
  return satirlar.slice(0, 8).join("\n");
}
// Celal'in Vegawin'deki modelleri (kodu CELAL ile biten kartlar + Patron'un listesi) — "başka Celal modeli var mı" sorusunun tek kaynağı
export function celalListeMetni(l) {
  if (!Array.isArray(l) || !l.length) return "Vegawin'de Celal'e ait model kaydı bulunamadı.";
  return `Celal'in Vegawin'deki modelleri (${l.length}): ${l.map((x) => `${x.kod} (stok ${sayiYaz(x.adet)})`).join(", ")}. Vegawin'de bunların dışında Celal modeli yok; Celal sorularında liste budur.`;
}
