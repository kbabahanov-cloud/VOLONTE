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

export function etiketMetni(kod) {
  return kod && !String(kod).startsWith("~") ? `VOLONTE · ${String(kod).toUpperCase()}` : "VOLONTE";
}

// "VOLONTE" harfleri arası daha açık (marka görünümü), kod sıkı.
function dizilim(metin) {
  const harfler = [];
  let x = 0;
  [...metin].forEach((ch, i) => {
    const g = alfa(ch);
    if (!g) return;
    harfler.push({ g, x });
    x += g.w + (i < 7 ? 4 : 1);
  });
  return { harfler, genislik: Math.max(1, x - 1) };
}

export function etiketPng(kod) {
  const { harfler, genislik } = dizilim(etiketMetni(kod));
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
  return pngYaz(W, H, rgba);
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
export async function markaBas(env, foto, genislik, kod) {
  const png = etiketPng(kod);
  const hedef = Math.max(140, Math.round(genislik * ETIKET_ORANI));
  const kenar = Math.max(12, Math.round(genislik * 0.03));
  const etiket = env.IMAGES.input(new Blob([png]).stream()).transform({ width: hedef });
  const sonuc = await env.IMAGES.input(new Blob([foto]).stream())
    .draw(etiket, { bottom: kenar, right: kenar })
    .output({ format: "image/jpeg" });
  return new Uint8Array(await sonuc.response().arrayBuffer());
}
