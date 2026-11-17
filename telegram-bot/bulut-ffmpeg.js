// BULUT FFMPEG (17 Kasım, Patron): fal.ai olmadan, ÜCRETSİZ video işleri — GitHub Actions (herkese açık depo, dakika ücreti yok).
// Akış: Pelin işi kuyruğa yazar (KV "ffmpeg:isler") → depodaki ".github/workflows/video-yazi.yml" her 5 dakikada bir Pelin'in herkese açık
// "/ffmpeg/isler" ucunu okur → ffmpeg ile işler (yazı: "MARKA · KOD" katmanı videonun tamamına, sesi AYNEN kopyalar; kare: ilk/orta/son
// kare) → sonucu depodaki "ffmpeg-cikti" dalına yazar (<id>.json + dosyalar) → Pelin o dalı okuyup sonucu alır. Video yeniden ÜRETİLMEZ.
// Kuyrukta gizli bilgi yok (sadece video adresi, kod, marka); sonuç sadece depoya yazabilen iş akışından gelir.
export const BULUT_DEPO = "kbabahanov-cloud/VOLONTE";
export const BULUT_DAL = "ffmpeg-cikti";
const ISLER = "ffmpeg:isler";
const ham = (yol) => `https://raw.githubusercontent.com/${BULUT_DEPO}/${BULUT_DAL}/${yol}`;

// is: { id, islem: "yazi" | "kare" | "muzik", video, kod, marka, ses: "koru" | "sessiz", muzik?: ses dosyası adresi }
export async function bulutIsEkle(env, is, simdi = Math.floor(Date.now() / 1000)) {
  const l = ((await env.KAYIT.get(ISLER, "json").catch(() => null)) || []).filter((x) => x.id !== is.id && simdi - (x.zaman || 0) < 2 * 86400);
  l.push({ id: String(is.id), islem: is.islem, video: String(is.video), kod: String(is.kod || ""), marka: String(is.marka || ""), ses: is.ses === "sessiz" ? "sessiz" : "koru", ...(is.muzik ? { muzik: String(is.muzik) } : {}), zaman: simdi });
  await env.KAYIT.put(ISLER, JSON.stringify(l.slice(-30)), { expirationTtl: 3 * 86400 });
}
export async function bulutIsler(env) { return (await env.KAYIT.get(ISLER, "json").catch(() => null)) || []; }
export async function bulutIsSil(env, id) {
  const l = (await bulutIsler(env)).filter((x) => x.id !== String(id));
  await env.KAYIT.put(ISLER, JSON.stringify(l), { expirationTtl: 3 * 86400 });
}
// Sonuç: null (henüz yok) | { ok: false, hata } | { ok: true, video?: url, kareler?: [url…] }
export async function bulutSonuc(env, id) {
  const r = await fetch(`${ham(`${id}.json`)}?t=${Date.now()}`).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j) return null;
  if (!j.ok) return { ok: false, hata: String(j.hata || "ffmpeg hatası").slice(0, 200) };
  return { ok: true, ...(j.video ? { video: ham(j.video) } : {}), ...(Array.isArray(j.kareler) ? { kareler: j.kareler.map(ham) } : {}) };
}
