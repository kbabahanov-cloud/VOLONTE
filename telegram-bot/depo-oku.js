// SİTE VERİSİ VE FOTOĞRAFLAR — GitHub deposundan okuma (31 Ekim). Depo GİZLİ yapılınca herkese açık ham adresler
// (raw.githubusercontent.com) kapanır; bu yüzden okuma Selin'in GitHub anahtarıyla yapılır. Diğer botlar ve yeni site
// Selin'e Cloudflare iç bağlantısıyla (SELIN_DEPO, internetten erişilemez) sorar. Bağlantı yoksa (testler) ham adres.
// Sadece site dosyaları okunabilir: veri/urunler.json, galeri/<kod>/<dosya>, eski sitenin css/style.css'i, slogan ses kaydı.

// Canlı sitenin adresi (31 Ekim'den itibaren; eski GitHub Pages adresi buraya yönlenir). Alan adı alınınca değişecek.
export const SITE_ADRESI = "https://www.volonte.workers.dev";

export const SITE_DOSYASI = /^(veri\/urunler\.json|galeri\/[\w-]+\/[\w.-]+\.(jpe?g|png|webp)|css\/style\.css|site-taslak\/ses\/[\w-]+\.mp3)$/i;
const TUR = (yol) => (/\.json$/i.test(yol) ? "application/json" : /\.mp3$/i.test(yol) ? "audio/mpeg" : /\.css$/i.test(yol) ? "text/css" : /\.png$/i.test(yol) ? "image/png" : /\.webp$/i.test(yol) ? "image/webp" : "image/jpeg");

// Selin içinde çalışır (anahtar Selin'de): { ok, tur, govde: ArrayBuffer }
export async function depoDosya(env, yol) {
  yol = String(yol || "").replace(/^\/+/, "");
  if (!SITE_DOSYASI.test(yol) || yol.includes("..")) return { ok: false, tur: "text/plain", govde: new ArrayBuffer(0) };
  const onbellek = typeof caches !== "undefined" ? caches.default : null;
  const anahtar = new Request(`https://selin-depo/${yol}`);
  const eski = onbellek && (await onbellek.match(anahtar));
  if (eski) return { ok: true, tur: TUR(yol), govde: await eski.arrayBuffer() };
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${yol}?ref=main`, {
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github.raw+json", "user-agent": "volonte-selin", "x-github-api-version": "2022-11-28" },
  });
  if (!r.ok) return { ok: false, tur: "text/plain", govde: new ArrayBuffer(0) };
  const govde = await r.arrayBuffer();
  // ürün listesi 60 sn, fotoğraf ve css 1 gün önbellekte (GitHub istek sınırı)
  if (onbellek) await onbellek.put(anahtar, new Response(govde.slice(0), { headers: { "cache-control": `max-age=${/\.json$/i.test(yol) ? 60 : 86400}` } }));
  return { ok: true, tur: TUR(yol), govde };
}

// Botlarda ve sitede: ürün listesi (tam hâli; fiyat dahil — dışarıya bu fonksiyonla verilmez)
export async function siteVerisi(env) {
  try {
    if (env && env.SELIN_DEPO) {
      const r = await env.SELIN_DEPO.dosya("veri/urunler.json");
      return r.ok ? JSON.parse(new TextDecoder().decode(r.govde)) : [];
    }
    const r = await fetch(`https://raw.githubusercontent.com/${(env && env.GITHUB_REPO) || "kbabahanov-cloud/VOLONTE"}/main/veri/urunler.json`, { cf: { cacheTtl: 60 } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
