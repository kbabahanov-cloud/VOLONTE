// REPETE RENK / BEDEN KONTROLÜ (16 Kasım, Patron — kalıcı, kural 87)
// Repete kartı fabrikaya (Fuat / Celal) gitmeden ÖNCE dağılımdaki renk ve beden kayıtla karşılaştırılır; uyuşmuyorsa kart GİTMEZ,
// Hemra'ya ve Patron'a "renk/beden uyuşmuyor" satırı gider (repete-kart.js fuataGonder → rec.hata).
// Kaynaklar (Vegawin'den bize renk ve beden GELMEZ: köprü sadece kod / ad / adet / fiyat okur; ad'daki "B" Black Rose kartı işaretidir):
//   • renk: bu modelin fabrikaya daha önce istenen renkleri (eksik listesi kayıtları, son istek), sitedeki renkler (kart görselinden),
//     model kartı (Patron'un düzelttiği renk);
//   • beden: sitedeki beden aralığı (38–44 küçük, 44–50 büyük).
// Kayıt hiç yoksa engellenmez (doğrulanamaz) — sonuçta "kayıt yok" yazar.
const harf = { ı: "i", İ: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };
export const renkNorm = (r) => String(r || "").toLocaleLowerCase("tr").replace(/[ıİşğüöçâîû]/g, (c) => harf[c] || c).replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
export const renkUyar = (a, b) => { const x = renkNorm(a), y = renkNorm(b); return Boolean(x && y && (x === y || x.includes(y) || y.includes(x))); };
// "38-40-42-44-46-48-50" → { kucuk: true, buyuk: true }; bilinmiyorsa null
export function bedenAraligi(bedenler) {
  const l = String(bedenler || "").match(/\d{2}/g);
  if (!l || !l.length) return null;
  const n = l.map(Number);
  return { kucuk: n.some((x) => x <= 42), buyuk: n.some((x) => x >= 46) };
}
// Saf karşılaştırma. dagilim: [{ renk, buyuk, kucuk }] · kayit: { renkler: [..], bedenler: "38-..-50" | null }
export function uyumKontrol(dagilim, kayit) {
  const sorun = [];
  const renkler = [...new Set((kayit.renkler || []).map((r) => String(r || "").trim()).filter(Boolean))];
  if (renkler.length) for (const d of dagilim || []) if (d.renk && !renkler.some((r) => renkUyar(r, d.renk))) sorun.push(`dağılımda ${d.renk} var, kayıtlarda yok (kayıtlı renkler: ${renkler.join(", ")})`);
  const ar = bedenAraligi(kayit.bedenler);
  if (ar) {
    if ((dagilim || []).some((d) => d.buyuk > 0) && !ar.buyuk) sorun.push(`dağılımda büyük beden var, sitede sadece ${kayit.bedenler}`);
    if ((dagilim || []).some((d) => d.kucuk > 0) && !ar.kucuk) sorun.push(`dağılımda küçük beden var, sitede sadece ${kayit.bedenler}`);
  }
  return { ok: !sorun.length, sorun, renkKaydi: renkler.length > 0, bedenKaydi: Boolean(ar) };
}
// Kayıtları toplar. f: { ayarOku(k, bos), fsKod(kod), site() , kart(kod) } — testte sahte verilir
export async function uyumKaydi(kod, f) {
  const renkler = [];
  const ekle = (r) => { if (r && typeof r === "object") r = r.renk; if (r) renkler.push(String(r)); };
  const son = ((await f.ayarOku("fabrika:sonIstek", {}).catch(() => ({}))) || {})[kod];
  if (Array.isArray(son)) son.forEach(ekle); else if (son && son.gruplar) for (const g of Object.values(son.gruplar)) (g || []).forEach(ekle);
  const fs = await f.fsKod(kod).catch(() => null);
  for (const r of [].concat(fs || [])) (r && r.renkler ? r.renkler : []).forEach(ekle);
  const sl = await f.site().catch(() => []);
  const site = (Array.isArray(sl) ? sl : []).find((u) => u && String(u.kod) === String(kod)) || null;
  (site && Array.isArray(site.renkler) ? site.renkler : []).forEach(ekle);
  const kart = await f.kart(kod).catch(() => null);
  if (kart) [].concat(kart.renk || [], kart.renkler || []).forEach(ekle);
  return { renkler, bedenler: site ? site.bedenler || null : null };
}
export const uyumSatiri = (u) => `renk/beden uyuşmuyor — ${u.sorun.join("; ")}`;
