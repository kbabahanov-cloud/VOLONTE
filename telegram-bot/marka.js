// Fotoğrafa marka: sağ alt köşeye küçük, yarı saydam "VOLONTE · <kod>" etiketi.
// Etiket burada (PNG olarak) çizilir, fotoğrafın üstüne Cloudflare Images ile basılır
// (ücretsiz pakette ayda 5.000 işlem; aşılırsa ücret yok, işlem başarısız olur → Kemal
// markasız kopyaya döner). Videolara marka basılamaz; olduğu gibi paylaşılır.

import { GLIFLER, GLIF_YUKSEKLIK } from "./marka-glifler.js";

const ARKA_ALFA = 0.42; // etiket zemini (siyah) saydamlığı
const DOLGU_X = 22;
const DOLGU_Y = 12;
const KOSE = 14;
export const ETIKET_ORANI = 0.3; // etiket genişliği / fotoğraf genişliği

const alfalar = {};
function alfa(ch) {
  if (!alfalar[ch]) {
    const g = GLIFLER[ch];
    if (!g) return null;
    const ham = atob(g.a);
    const a = new Uint8Array(ham.length);
    for (let i = 0; i < ham.length; i++) a[i] = ham.charCodeAt(i);
    alfalar[ch] = { w: g.w, a };
  }
  return alfalar[ch];
}

// 4 Kasım (Patron): marka model kartından — "VOLONTE · kod" ya da "BLACK ROSE · kod" (iki ayrı mağaza, karıştırılmaz)
export const MARKA_ETIKET = { VOLONTE: "VOLONTE", BLACKROSE: "BLACK ROSE" };
export function etiketMetni(kod, marka = "VOLONTE") {
  const m = MARKA_ETIKET[marka] || MARKA_ETIKET.VOLONTE;
  return kod && !String(kod).startsWith("~") ? `${m} · ${String(kod).toUpperCase()}` : m;
}

// "VOLONTE" harfleri arası daha açık (marka görünümü), kod sıkı.
function dizilim(metin) {
  const harfler = [];
  let x = 0;
  const markaSonu = metin.indexOf(" ·") >= 0 ? metin.indexOf(" ·") : metin.length; // marka harfleri arası açık, kod sıkı
  [...metin].forEach((ch, i) => {
    if (ch === " ") { if (i < markaSonu) x += 16; return; } // boşluk glifi yok (VOLONTE etiketi eskisiyle aynı kalır)
    const g = alfa(ch);
    if (!g) return;
    harfler.push({ g, x });
    x += g.w + (i < markaSonu ? 4 : 1);
  });
  return { harfler, genislik: Math.max(1, x - 1) };
}

export function etiketPng(kod, marka = "VOLONTE") {
  const { W, H, rgba } = etiketRgba(kod, marka);
  return pngYaz(W, H, rgba);
}
export function etiketRgba(kod, marka = "VOLONTE") {
  const { harfler, genislik } = dizilim(etiketMetni(kod, marka));
  const W = genislik + 2 * DOLGU_X;
  const H = GLIF_YUKSEKLIK + 2 * DOLGU_Y;
  const metinAlfa = new Float32Array(W * H);
  for (const { g, x } of harfler) {
    for (let y = 0; y < GLIF_YUKSEKLIK; y++) {
      for (let i = 0; i < g.w; i++) {
        const v = g.a[y * g.w + i] / 255;
        const k = (y + DOLGU_Y) * W + (x + DOLGU_X + i);
        if (v > metinAlfa[k]) metinAlfa[k] = v;
      }
    }
  }
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.max(KOSE - x, x - (W - 1 - KOSE), 0);
      const dy = Math.max(KOSE - y, y - (H - 1 - KOSE), 0);
      const zemin = dx * dx + dy * dy <= KOSE * KOSE ? ARKA_ALFA : 0;
      const t = metinAlfa[y * W + x];
      const a = t + zemin * (1 - t);
      const k = (y * W + x) * 4;
      const renk = a > 0 ? Math.round((255 * t) / a) : 0; // beyaz yazı, siyah zemin
      rgba[k] = rgba[k + 1] = rgba[k + 2] = renk;
      rgba[k + 3] = Math.round(a * 255);
    }
  }
  return { W, H, rgba };
}

// ---- VİDEO ETİKETİ (4 Kasım, Patron): "MARKA · kod" videonun TAMAMINDA sağ alt köşede, küçük ve okunur ----
// Workers'ta ffmpeg yok; fal "workflow-utilities/blend-video" (hardlight) ile basılır. Bu katman videonun boyunda bir
// görseldir: her yer NÖTR gri (hardlight'ta videoyu değiştirmez), sağ altta etiket (beyaz yazı + %42 siyah zemin,
// fotoğraflardakiyle aynı görünüm). Yani video yeniden üretilmez; sadece köşesine yazı eklenir.
export const KATMAN_GRI = 129; // ffmpeg "overlay" karışımında ~128 = nötr: video değişmez (renk farkı %1 altı, yerel ffmpeg ile ölçüldü)
export const VIDEO_ETIKET_ORANI = 0.26;
export async function katmanPng(w, h, kod, marka = "VOLONTE", oran = VIDEO_ETIKET_ORANI) {
  const e = etiketRgba(kod, marka);
  const ew = Math.max(120, Math.round(w * oran));
  const eh = Math.max(1, Math.round((e.H * ew) / e.W));
  const kenar = Math.max(12, Math.round(w * 0.035));
  const x0 = w - kenar - ew, y0 = h - kenar - eh;
  const rgb = new Uint8Array(w * h * 3).fill(KATMAN_GRI);
  for (let y = 0; y < eh; y++) {
    const sy = Math.min(e.H - 1, ((y + 0.5) * e.H) / eh - 0.5);
    const y1 = Math.max(0, Math.floor(sy)), y2 = Math.min(e.H - 1, y1 + 1), fy = Math.max(0, sy - y1);
    for (let x = 0; x < ew; x++) {
      const sx = Math.min(e.W - 1, ((x + 0.5) * e.W) / ew - 0.5);
      const x1 = Math.max(0, Math.floor(sx)), x2 = Math.min(e.W - 1, x1 + 1), fx = Math.max(0, sx - x1);
      // önçarpımlı (premultiplied) çift doğrusal örnekleme
      let a = 0, c = 0;
      for (const [xx, yy, wgt] of [[x1, y1, (1 - fx) * (1 - fy)], [x2, y1, fx * (1 - fy)], [x1, y2, (1 - fx) * fy], [x2, y2, fx * fy]]) {
        const k = (yy * e.W + xx) * 4, al = e.rgba[k + 3] / 255;
        a += al * wgt; c += (e.rgba[k] / 255) * al * wgt;
      }
      const v = Math.round(255 * c + KATMAN_GRI * (1 - a));
      const k = ((y0 + y) * w + (x0 + x)) * 3;
      rgb[k] = rgb[k + 1] = rgb[k + 2] = v;
    }
  }
  return pngSikistir(w, h, rgb, 3);
}
export const pngRgbaSikistir = (W, H, rgba) => pngSikistir(W, H, rgba, 4);
// Büyük görsel için sıkıştırılmış PNG (RGB ya da RGBA, zlib = CompressionStream "deflate")
async function pngSikistir(W, H, px, kanal = 3) {
  const satir = W * kanal + 1;
  const ham = new Uint8Array(H * satir);
  for (let y = 0; y < H; y++) ham.set(px.subarray(y * W * kanal, (y + 1) * W * kanal), y * satir + 1);
  const zlib = new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const parcaB = (tur, veri) => {
    const govde = new Uint8Array(4 + veri.length);
    for (let i = 0; i < 4; i++) govde[i] = tur.charCodeAt(i);
    govde.set(veri, 4);
    const out = new Uint8Array(12 + veri.length);
    out.set(u32(veri.length), 0); out.set(govde, 4); out.set(u32(crc32(govde)), 8 + veri.length);
    return out;
  };
  const ihdr = new Uint8Array([...u32(W), ...u32(H), 8, kanal === 4 ? 6 : 2, 0, 0, 0]);
  const parcalar = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), parcaB("IHDR", ihdr), parcaB("IDAT", zlib), parcaB("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parcalar.reduce((t, x) => t + x.length, 0));
  let o = 0; for (const x of parcalar) { out.set(x, o); o += x.length; }
  return out;
}

// ---- Küçük PNG yazıcı (sıkıştırmasız deflate; etiket küçük olduğu için yeterli) ----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(b) {
  let a = 1;
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    a = (a + b[i]) % 65521;
    s = (s + a) % 65521;
  }
  return ((s << 16) | a) >>> 0;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function parca(tur, veri) {
  const ad = [...tur].map((c) => c.charCodeAt(0));
  const govde = new Uint8Array([...ad, ...veri]);
  return [...u32(veri.length), ...govde, ...u32(crc32(govde))];
}
export function pngYaz(W, H, rgba) {
  const ham = new Uint8Array(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    ham[y * (W * 4 + 1)] = 0;
    ham.set(rgba.subarray(y * W * 4, (y + 1) * W * 4), y * (W * 4 + 1) + 1);
  }
  const zlib = [0x78, 0x01];
  for (let i = 0; i < ham.length; i += 65535) {
    const blok = ham.subarray(i, i + 65535);
    const son = i + 65535 >= ham.length ? 1 : 0;
    zlib.push(son, blok.length & 255, blok.length >> 8, ~blok.length & 255, (~blok.length >> 8) & 255);
    for (const b of blok) zlib.push(b);
  }
  zlib.push(...u32(adler32(ham)));
  const ihdr = [...u32(W), ...u32(H), 8, 6, 0, 0, 0];
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...parca("IHDR", ihdr), ...parca("IDAT", zlib), ...parca("IEND", [])]);
}

// Fotoğrafın (JPEG baytları) sağ alt köşesine etiketi basar → JPEG baytları.
export async function markaBas(env, foto, genislik, kod, marka = "VOLONTE") {
  const png = etiketPng(kod, marka);
  const hedef = Math.max(140, Math.round(genislik * ETIKET_ORANI));
  const kenar = Math.max(12, Math.round(genislik * 0.03));
  const etiket = env.IMAGES.input(new Blob([png]).stream()).transform({ width: hedef });
  const sonuc = await env.IMAGES.input(new Blob([foto]).stream())
    .draw(etiket, { bottom: kenar, right: kenar })
    .output({ format: "image/jpeg" });
  return new Uint8Array(await sonuc.response().arrayBuffer());
}
