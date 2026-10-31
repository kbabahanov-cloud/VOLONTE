// VOLONTE sitesi (Cloudflare Worker). İki yerde çalışır:
//  CANLI (env.CANLI = "1", Worker "www" → https://www.volonte.workers.dev): ana sayfa D · Sinema; eski sitenin linkleri
//    (urun.html?kod=…, urunler.html, iletisim.html, index.html) yeni sayfalara yönlenir; arama motorlarına açık.
//  TASLAK (volonte-taslak): / seçim sayfası, /a /b /c /d taslaklar (noindex).
// Ortak yollar:
//  /veri       → modeller (FİYAT ÇIKARILIR, gizli modeller yok)
//  /img/...    → galeri fotoğrafı, telefona göre küçültülmüş WebP (Cloudflare Images), önbellekli
//  /galeri/... → fotoğrafın kendisi (Kemal/Sami Telegram'a bu adresle gönderir)
//  /olcum      → gizlilik dostu sayım: ülke (ağdan), dil, bakılan model. IP, çerez, kişisel veri YOK.
//  /ses/slogan.mp3 → kendi ses kaydımız (depoya konunca); yoksa 404 (tarayıcı sesiyle okunur)
// Veri ve fotoğraflar GitHub deposundan Selin'in iç bağlantısıyla okunur (SELIN_DEPO; depo gizli olsa da çalışır).
// Haftalık ziyaret özeti: Sami iç bağlantıyla (SiteIc.ozet) okur, pazartesi sadece Murat'a gönderir.
import { WorkerEntrypoint } from "cloudflare:workers";
import { SAYFALAR } from "./dist/sayfalar.js";
import SECIM from "./kaynak/secim.json";

const HAM = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/main/";
const GENISLIK = [120, 160, 320, 480, 720, 960, 1280, 1600];
const bugun = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

// Depodan dosya: Selin'in iç bağlantısıyla; bağlantı yoksa (taslak/yerel deneme) herkese açık ham adres.
async function depo(env, yol) {
  if (env.SELIN_DEPO) {
    const r = await env.SELIN_DEPO.dosya(yol);
    return new Response(r.ok ? r.govde : null, { status: r.ok ? 200 : 404, headers: { "content-type": r.tur } });
  }
  return fetch(HAM + yol, { cf: { cacheTtl: /\.json$/.test(yol) ? 60 : 86400, cacheEverything: true } });
}

// Afiş = üzerinde yazı olan tanıtım görseli (elle seçildi: kaynak/secim.json). Listede olmayan yeni modelde ilk fotoğraf afiş sayılır.
const AFIS = new Set(SECIM.afisler);
const BILINEN = new Set(SECIM.bilinen);
const fotoAnahtar = (f) => String(f).replace(/^galeri\//, "").replace(/\.\w+$/, "");
function temizle(kod, fotolar) {
  let temiz = BILINEN.has(kod) ? fotolar.filter((f) => !AFIS.has(fotoAnahtar(f))) : fotolar.slice(fotolar.length > 1 ? 1 : 0);
  if (!temiz.length) temiz = fotolar.slice(0, 1);
  return { temiz, fotolar: [...temiz, ...fotolar.filter((f) => !temiz.includes(f))] }; // model sayfasında afişler en sonda
}
async function veri(env) {
  const r = await depo(env, "veri/urunler.json");
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

async function sayfa(t, env, canli) {
  const l = await veri(env).catch(() => []);
  const gomulu = `window.VOLONTE_VERI=${JSON.stringify(l).replace(/</g, "\\u003c")};window.VOLONTE_SINEMA=${JSON.stringify(sinema(l)).replace(/</g, "\\u003c")};${canli ? "" : "window.VOLONTE_TASLAK=1;"}`;
  let html = SAYFALAR[t].replace("/*VERI*/", gomulu).replace("<!--ON_YUKLE-->", "");
  if (canli) html = html.replace('<meta name="robots" content="noindex">\n', "");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...(canli ? {} : { "x-robots-tag": "noindex" }) } });
}

async function resim(istek, url, ctx, env) {
  const yol = decodeURIComponent(url.pathname.slice(5));
  if (!/^galeri\/[\w-]+\/[\w-]+\.(jpe?g|png|webp)$/i.test(yol)) return new Response("yok", { status: 404 });
  const iste = Number(url.searchParams.get("w")) || 720;
  const w = GENISLIK.find((x) => x >= iste) || 1600;
  const webp = /image\/webp/.test(istek.headers.get("accept") || "");
  const anahtar = new Request(`https://site-onbellek/${yol}?w=${w}&f=${webp ? "webp" : "jpeg"}`);
  const onbellek = caches.default;
  const var_ = await onbellek.match(anahtar);
  if (var_) return var_;
  const kaynak = await depo(env, yol);
  if (!kaynak.ok) return new Response("yok", { status: 404 });
  const bayt = await kaynak.arrayBuffer();
  let cevap;
  try {
    const sonuc = await env.IMAGES.input(new Blob([bayt]).stream()).transform({ width: w, fit: "scale-down" }).output({ format: webp ? "image/webp" : "image/jpeg", quality: 74 });
    cevap = new Response(sonuc.response().body, { headers: { "content-type": webp ? "image/webp" : "image/jpeg" } });
  } catch {
    cevap = new Response(bayt, { headers: { "content-type": "image/jpeg" } }); // küçültülemezse fotoğrafın kendisi
  }
  cevap.headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  cevap.headers.set("vary", "accept");
  ctx.waitUntil(onbellek.put(anahtar, cevap.clone()));
  return cevap;
}

// Fotoğrafın / eski css'in kendisi (Kemal ve Sami Telegram'a bu adresle gönderir; Selin önizlemesi eski css'i kullanır)
async function dosya(yol, ctx, env) {
  const anahtar = new Request(`https://site-onbellek/ham/${yol}`);
  const var_ = await caches.default.match(anahtar);
  if (var_) return var_;
  const r = await depo(env, yol);
  if (!r.ok) return new Response("yok", { status: 404 });
  const cevap = new Response(await r.arrayBuffer(), { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" } });
  ctx.waitUntil(caches.default.put(anahtar, cevap.clone()));
  return cevap;
}

// Eski site (GitHub Pages) linkleri → yeni sayfalar
function eskiLink(url) {
  const p = url.pathname.replace(/^\/VOLONTE/, "");
  if (/^\/urun\.html$/.test(p)) { const kod = (url.searchParams.get("kod") || "").replace(/[^\w-]/g, ""); return kod ? `/#model/${kod}` : "/#new"; }
  if (/^\/urunler\.html$/.test(p)) return "/#new";
  if (/^\/(iletisim|index)\.html$/.test(p)) return "/";
  return null;
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
  const l = [];
  if (g.t === "v") {
    l.push(["ulke", ulke], ["dil", ["en", "fr", "tr"].includes(g.dil) ? g.dil : "?"]);
    if (env.CANLI !== "1") l.push(["taslak", ((istek.headers.get("referer") || "").match(/\/([abcd])(\/|$|\?|#)/) || [])[1] || "-"]);
  }
  if (g.t === "m" && /^\d{3,6}$/.test(String(g.kod))) l.push(["model", String(g.kod)]);
  if (l.length) await env.SAYIM.get(env.SAYIM.idFromName("sayim")).fetch("https://sayim/ekle", { method: "POST", body: JSON.stringify(l) });
  return new Response(null, { status: 204 });
}

async function istekIsle(istek, env, ctx) {
  const url = new URL(istek.url);
  const p = url.pathname;
  const canli = env.CANLI === "1";
  if (canli) {
    if (p === "/" || p === "") return sayfa("d", env, true);
    const eski = eskiLink(url);
    if (eski) return Response.redirect(new URL(eski, url).toString(), 301);
  } else {
    if (p === "/" || p === "") return new Response(SAYFALAR.secim, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
    const t = (p.match(/^\/([abcd])\/?$/) || [])[1];
    if (t) return sayfa(t, env, false);
  }
  if (p === "/veri") return Response.json(await veri(env), { headers: { "cache-control": "public, max-age=60" } });
  if (p.startsWith("/img/")) return resim(istek, url, ctx, env);
  if (/^\/(galeri\/[\w-]+\/[\w-]+\.(jpe?g|png|webp)|css\/style\.css)$/i.test(p)) return dosya(p.slice(1), ctx, env);
  if (p === "/olcum" && istek.method === "POST") return olcum(istek, env);
  if (p === "/ses/slogan.mp3") {
    const r = await depo(env, "site-taslak/ses/slogan.mp3");
    return r.ok ? new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=3600" } }) : new Response("yok", { status: 404 });
  }
  if (p === "/robots.txt") return new Response(canli ? "User-agent: *\nAllow: /\n" : "User-agent: *\nDisallow: /\n");
  return new Response("yok", { status: 404 });
}

// İç bağlantı (sadece diğer Workers; internetten erişilemez): haftalık sayım özeti ve kendini deneme
export class SiteIc extends WorkerEntrypoint {
  async ozet(bas, bit) {
    const r = await this.env.SAYIM.get(this.env.SAYIM.idFromName("sayim")).fetch(`https://sayim/ozet?bas=${encodeURIComponent(bas)}&bit=${encodeURIComponent(bit)}`);
    return r.json();
  }
  async dene(yollar) {
    const sonuc = [];
    for (const y of yollar) {
      const r = await istekIsle(new Request(`https://www.volonte.workers.dev${y}`, { headers: { accept: "image/webp,*/*" }, redirect: "manual" }), this.env, this.ctx);
      const tur = r.headers.get("content-type") || "";
      const metin = /text|json/.test(tur) ? await r.text() : "";
      sonuc.push({ yol: y, durum: r.status, tur, boyut: metin ? metin.length : (await r.arrayBuffer()).byteLength, yer: r.headers.get("location"),
        fiyat: /"fiyat"|\bprice\b|\$\s?\d/i.test(metin), kargo: /shipping|kargo|livraison/i.test(metin), model: (metin.match(/"kod":"\d+"/g) || []).length });
    }
    return sonuc;
  }
}

export default { fetch: istekIsle };
