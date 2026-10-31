// VOLONTE yeni site — DENEME ADRESİ (volonte-taslak). Canlı siteye (GitHub Pages) dokunmaz.
//  /           → üç taslağın seçim sayfası          /a /b /c → taslaklar (tek HTML, veri içine gömülü)
//  /veri       → modeller (veri/urunler.json; FİYAT ÇIKARILIR, gizli modeller yok)
//  /img/...    → galeri fotoğrafı, telefona göre küçültülmüş WebP (Cloudflare Images), önbellekli
//  /olcum      → gizlilik dostu sayım: ülke (ağdan), dil, bakılan model. IP, çerez, kişisel veri YOK.
//  /ses/slogan.mp3 → kendi ses kaydımız (depoya konunca); yoksa 404 (taslak tarayıcı sesiyle okur)
import { SAYFALAR } from "./dist/sayfalar.js";
import SECIM from "./kaynak/secim.json";

const HAM = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/main/";
const GENISLIK = [120, 160, 320, 480, 720, 960, 1280, 1600];
const bugun = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

// Afiş = üzerinde yazı olan tanıtım görseli (elle seçildi: kaynak/secim.json). Listede olmayan yeni modelde ilk fotoğraf afiş sayılır.
const AFIS = new Set(SECIM.afisler);
const BILINEN = new Set(SECIM.bilinen);
const fotoAnahtar = (f) => String(f).replace(/^galeri\//, "").replace(/\.\w+$/, "");
function temizle(kod, fotolar) {
  let temiz = BILINEN.has(kod) ? fotolar.filter((f) => !AFIS.has(fotoAnahtar(f))) : fotolar.slice(fotolar.length > 1 ? 1 : 0);
  if (!temiz.length) temiz = fotolar.slice(0, 1);
  return { temiz, fotolar: [...temiz, ...fotolar.filter((f) => !temiz.includes(f))] }; // model sayfasında afişler en sonda
}
async function veri() {
  const r = await fetch(`${HAM}veri/urunler.json`, { cf: { cacheTtl: 60, cacheEverything: true } });
  const l = r.ok ? await r.json() : [];
  return (Array.isArray(l) ? l : []).filter((u) => !u.gizli).map((u) => ({
    kod: String(u.kod), baslik: u.baslik || String(u.kod), kategori: u.kategori || "", bedenler: u.bedenler || "",
    aciklama: { en: (u.aciklama && u.aciklama.en) || "", fr: (u.aciklama && u.aciklama.fr) || "" },
    ...temizle(String(u.kod), (u.fotolar || []).filter((f) => /^galeri\//.test(f))), videolar: u.videolar || [], eklenme: u.eklenme || null,
  })); // fiyat bilerek yok
}
// Sinema girişi kesitleri: elle seçilenler (sitede olanlar), eksikse en yeni modellerin temiz fotoğrafıyla tamamlanır
function sinema(l) {
  const var_ = new Map(l.map((u) => [u.kod, u]));
  const k = SECIM.sinema.map(([f, tur]) => ({ f: `galeri/${f}.jpg`, tur, kod: f.split("/")[0] })).filter((x) => var_.has(x.kod) && var_.get(x.kod).fotolar.includes(x.f));
  const turler = ["savrulma", "yuruyus", "yakin"];
  for (const u of l) { if (k.length >= 7) break; if (!k.some((x) => x.kod === u.kod) && u.temiz[0]) k.push({ f: u.temiz[0], tur: turler[k.length % 3], kod: u.kod }); }
  return k;
}

async function sayfa(t, istek, ctx) {
  const l = await veri().catch(() => []);
  const ulke = String((istek.cf && istek.cf.country) || "").replace(/[^A-Z]/g, "").slice(0, 2);
  const gomulu = `window.VOLONTE_VERI=${JSON.stringify(l).replace(/</g, "\\u003c")};window.VOLONTE_SINEMA=${JSON.stringify(sinema(l)).replace(/</g, "\\u003c")};window.VOLONTE_ULKE="${ulke}";window.VOLONTE_TASLAK=1;`;
  const html = SAYFALAR[t].replace("/*VERI*/", gomulu)
    .replace("<!--ON_YUKLE-->", ""); // kesitler sayfa açılınca telefonun boyutuna göre sırayla iner
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

async function resim(istek, url, ctx, env) {
  const yol = decodeURIComponent(url.pathname.slice(5));
  if (!/^galeri\/[\w-]+\/[\w-]+\.(jpe?g|png|webp)$/i.test(yol)) return new Response("yok", { status: 404 });
  const iste = Number(url.searchParams.get("w")) || 720;
  const w = GENISLIK.find((x) => x >= iste) || 1600;
  const webp = /image\/webp/.test(istek.headers.get("accept") || "");
  const anahtar = new Request(`https://taslak-onbellek/${yol}?w=${w}&f=${webp ? "webp" : "jpeg"}`);
  const onbellek = caches.default;
  const var_ = await onbellek.match(anahtar);
  if (var_) return var_;
  const kaynak = await fetch(HAM + yol, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!kaynak.ok) return new Response("yok", { status: 404 });
  let cevap;
  try {
    const sonuc = await env.IMAGES.input(kaynak.body).transform({ width: w, fit: "scale-down" }).output({ format: webp ? "image/webp" : "image/jpeg", quality: 74 });
    cevap = new Response(sonuc.response().body, { headers: { "content-type": webp ? "image/webp" : "image/jpeg" } });
  } catch {
    const yedek = await fetch(HAM + yol, { cf: { cacheTtl: 86400, cacheEverything: true } });
    cevap = new Response(yedek.body, { headers: { "content-type": "image/jpeg" } });
  }
  cevap.headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  cevap.headers.set("vary", "accept");
  ctx.waitUntil(onbellek.put(anahtar, cevap.clone()));
  return cevap;
}

// Sayım: sadece toplam sayılar (gün × tür × anahtar). Kim olduğu, IP, cihaz kimliği tutulmaz.
export class SayimDO {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS sayim (gun TEXT, tur TEXT, anahtar TEXT, n INTEGER, PRIMARY KEY (gun, tur, anahtar))");
  }
  async fetch(istek) {
    const url = new URL(istek.url);
    if (url.pathname === "/ekle") {
      const l = await istek.json();
      for (const [tur, anahtar] of l) this.sql.exec("INSERT INTO sayim (gun, tur, anahtar, n) VALUES (?, ?, ?, 1) ON CONFLICT (gun, tur, anahtar) DO UPDATE SET n = n + 1", bugun(), tur, anahtar);
      return new Response("ok");
    }
    if (url.pathname === "/ozet") {
      const bas = url.searchParams.get("bas") || "0000", bit = url.searchParams.get("bit") || "9999";
      return Response.json(this.sql.exec("SELECT tur, anahtar, SUM(n) AS n FROM sayim WHERE gun >= ? AND gun <= ? GROUP BY tur, anahtar ORDER BY n DESC", bas, bit).toArray());
    }
    return new Response("?", { status: 404 });
  }
}
async function olcum(istek, env) {
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(istek.headers.get("user-agent") || "")) return new Response(null, { status: 204 });
  let g = {};
  try { g = JSON.parse((await istek.text()).slice(0, 300)); } catch { return new Response(null, { status: 204 }); }
  const ulke = String((istek.cf && istek.cf.country) || "XX").replace(/[^A-Z]/g, "").slice(0, 2) || "XX";
  const taslak = ((istek.headers.get("referer") || "").match(/\/([abcd])(\/|$|\?|#)/) || [])[1] || "-";
  const l = [];
  if (g.t === "v") l.push(["ulke", ulke], ["dil", ["en", "fr", "tr"].includes(g.dil) ? g.dil : "?"], ["taslak", taslak]);
  if (g.t === "m" && /^\d{3,6}$/.test(String(g.kod))) l.push(["model", String(g.kod)]);
  if (l.length) await env.SAYIM.get(env.SAYIM.idFromName("sayim")).fetch("https://sayim/ekle", { method: "POST", body: JSON.stringify(l) });
  return new Response(null, { status: 204 });
}

export default {
  async fetch(istek, env, ctx) {
    const url = new URL(istek.url);
    const p = url.pathname;
    if (p === "/" || p === "") return new Response(SAYFALAR.secim, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
    const t = (p.match(/^\/([abcd])\/?$/) || [])[1];
    if (t) return sayfa(t, istek, ctx);
    if (p === "/veri") return Response.json(await veri(), { headers: { "cache-control": "public, max-age=60" } });
    if (p.startsWith("/img/")) return resim(istek, url, ctx, env);
    if (p === "/olcum" && istek.method === "POST") return olcum(istek, env);
    if (p === "/sayim" && env.SAYIM_ANAHTAR && istek.headers.get("authorization") === `Bearer ${env.SAYIM_ANAHTAR}`) {
      return env.SAYIM.get(env.SAYIM.idFromName("sayim")).fetch(`https://sayim/ozet${url.search}`);
    }
    if (p === "/ses/slogan.mp3") {
      const r = await fetch(`${HAM}site-taslak/ses/slogan.mp3`, { cf: { cacheTtl: 3600, cacheEverything: true } });
      return r.ok ? new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=3600" } }) : new Response("yok", { status: 404 });
    }
    if (p === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");
    return new Response("yok", { status: 404 });
  },
};
