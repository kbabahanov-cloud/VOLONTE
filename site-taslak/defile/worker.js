// VOLONTE DEFİLE — DENEME (4 Kasım, Patron isteği). Ayrı önizleme adresi; canlı siteye dokunmaz.
// Sahne: siyah zemin, yansımalı podyum, bizim mankenlerimiz (sitedeki fotoğraflardan arka planı ayrılmış kesimler).
// Kesimler KV'de "defile:<ad>" (sadece bu önek dışarı verilir). Sayfa: sayfa.html (derlemede gömülür).
import SAYFA from "./sayfa.html";

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method !== "GET" && istek.method !== "HEAD") return new Response("yok", { status: 405 });
    const g = url.pathname.match(/^\/g\/([a-z0-9_-]{1,40})\.webp$/i);
    if (g) {
      const onbellek = caches.default;
      const eski = await onbellek.match(istek);
      if (eski) return eski;
      const veri = await env.KAYIT.get(`defile:${g[1]}`, "arrayBuffer");
      if (!veri) return new Response("yok", { status: 404 });
      const r = new Response(veri, { headers: { "content-type": "image/webp", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" } });
      await onbellek.put(istek, r.clone());
      return r;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(SAYFA, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-robots-tag": "noindex, nofollow" } });
    }
    return new Response("yok", { status: 404 });
  },
};
