// ASKI + DETAY (4 Kasım, Patron — KALICI KURAL, tüm modellerde): elbise YENİDEN ÇİZİLMEZ.
// • Askı ön/arka: Patron'un mankende çektiği GERÇEK ön/arka fotoğraftan elbise kesilir (fal bria/guided-remove-background:
//   arka plan + manken/ayak silinir, elbise pikselleri aynen kalır), BEMBEYAZ fona, burada çizilen sade askıya asılır, tam boy,
//   sağ altta küçük "MARKA · kod".
// • Detay: 2 kolaj — (1) yaka + bel/öne çıkan işleme, (2) kol ucu + kumaş dokusu + arka/kapanış. Gerçek fotoğraftan yakın kesit
//   (SAM-3 ile yer bulunur; sadece kırpma + büyütme + hafif netleştirme), kısa EN/FR etiket, beyaz zemin.
// • Askı videosu YOK (tek video: mankenli).
import { GLIFLER, GLIF_YUKSEKLIK } from "./marka-glifler.js";
import { pngRgbaSikistir, etiketPng, ETIKET_ORANI } from "./marka.js";

export const KESIM = { uc: "bria/guided-remove-background", fiyat: 0.03, autocrop: false, // boyut korunur → SAM kutuları kesik görselde de geçerli
  istem: "keep ONLY the dress/garment itself; remove the mannequin, dress form, its neck knob, stand, legs and base, the hanger and everything in the background" };
export const BUL = { uc: "fal-ai/sam-3/image", fiyat: 0.005 };
// Detay yerleri (SAM-3 metin istemi). "on" = ön fotoğraf, "arka" = arka fotoğraf.
// 4 Kasım (Patron): "Ayrı detay çerçevesi YAPILMASIN" → kolaj KAPALI; sadece elbise kutuları (askı kırpımı için) aranır
export const KOLAJ = false;
const TUM_YERLER = [
  { k: "elbise", foto: "on", istem: "dress" },
  { k: "yaka", foto: "on", istem: "collar", en: "COLLAR", fr: "COL" },
  { k: "isleme", foto: "on", istem: "lace or embroidery or sequins", en: "EMBELLISHMENT", fr: "ORNEMENT" },
  { k: "kol", foto: "on", istem: "sleeve cuff", en: "CUFF", fr: "POIGNET" },
  { k: "arkaElbise", foto: "arka", istem: "dress" },
];
export const DETAY_YERLERI = KOLAJ ? TUM_YERLER : TUM_YERLER.filter((y) => /elbise/i.test(y.k));
export const DETAY_ETIKET = Object.fromEntries(TUM_YERLER.map((y) => [y.k, y]));
export const ASKI_DETAY_FIYAT = 2 * KESIM.fiyat + DETAY_YERLERI.length * BUL.fiyat;

// fal SAM-3 sonucundaki kutular: "boxes" = [merkezX, merkezY, genişlik, yükseklik] (0-1; canlıda doğrulandı 4 Kasım);
// {x_min,…} nesneleri köşe. Skor varsa en yükseği, yoksa en büyüğü. Döner: [x0,y0,x1,y1] piksel.
export function kutuSec(c, W, H) {
  const kutular = [];
  const gez = (o, yol = "") => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o) && o.length === 4 && o.every((n) => typeof n === "number") && /box/i.test(yol)) { const [cx, cy, w, h] = o; kutular.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]); return; }
    if (!Array.isArray(o) && ["x_min", "y_min", "x_max", "y_max"].every((k) => typeof o[k] === "number")) { kutular.push([o.x_min, o.y_min, o.x_max, o.y_max]); return; }
    for (const [k, v] of Object.entries(o)) gez(v, `${yol}.${k}`);
  };
  gez({ boxes: c && c.boxes, metadata: c && !c.boxes ? c.metadata : null, masks: c && !c.boxes ? c.masks : null });
  const ol = kutular.map(([a, b, x, y]) => (Math.max(a, b, x, y) <= 1.5 ? [a * W, b * H, x * W, y * H] : [a, b, x, y]))
    .map(([a, b, x, y]) => [Math.max(0, Math.min(a, x)), Math.max(0, Math.min(b, y)), Math.min(W, Math.max(a, x)), Math.min(H, Math.max(b, y))])
    .filter(([a, b, x, y]) => x - a > 8 && y - b > 8);
  if (!ol.length) return null;
  const skorlar = Array.isArray(c && c.scores) ? c.scores : null;
  if (skorlar && skorlar.length === ol.length) return ol[skorlar.indexOf(Math.max(...skorlar))];
  return ol.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
}
// Kutuyu genişlet, karo oranına getir, görselin içinde tut → { left, top, width, height } (tam sayı)
export function kirpimAlani(kutu, W, H, oran, pay = 0.25, enAz = 160) {
  let [a, b, x, y] = kutu;
  let w = (x - a) * (1 + 2 * pay), h = (y - b) * (1 + 2 * pay);
  w = Math.max(w, enAz); h = Math.max(h, enAz);
  if (w / h > oran) h = w / oran; else w = h * oran;
  if (w > W) { w = W; h = Math.min(H, w / oran); }
  if (h > H) { h = H; w = Math.min(W, h * oran); }
  const cx = (a + x) / 2, cy = (b + y) / 2;
  const left = Math.round(Math.min(Math.max(0, cx - w / 2), W - w)), top = Math.round(Math.min(Math.max(0, cy - h / 2), H - h));
  return { left, top, width: Math.round(w), height: Math.round(h) };
}
// Kumaş dokusu: elbise kutusunun etek ortası; arka/kapanış: arka elbise kutusunun üst kısmı
export const kumasKutusu = ([a, b, x, y]) => [a + (x - a) * 0.36, b + (y - b) * 0.66, a + (x - a) * 0.64, b + (y - b) * 0.84];
// SAM bulamazsa elbise kutusundan: yaka = üst orta, işleme = bel bölgesi
export const yakaKutusu = ([a, b, x, y]) => [a + (x - a) * 0.32, b, a + (x - a) * 0.68, b + (y - b) * 0.14];
export const islemeKutusu = ([a, b, x, y]) => [a + (x - a) * 0.18, b + (y - b) * 0.36, a + (x - a) * 0.82, b + (y - b) * 0.52];
export const arkaKutusu = ([a, b, x, y]) => [a + (x - a) * 0.18, b, a + (x - a) * 0.82, b + (y - b) * 0.42];

// ---- Çizimler (PNG, Workers'ta; ücretsiz) ----
function dolu(W, H, r, g, b, a = 255) { const p = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) { p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b; p[i * 4 + 3] = a; } return p; }
export async function beyazPng(W, H) { return pngRgbaSikistir(W, H, dolu(W, H, 255, 255, 255)); }
// Sade askı: kanca + omuz kolları + alt çubuk (ince, gümüş-gri), saydam zemin. Boyut: genişlik W.
export async function askiPng(W) {
  W = Math.max(200, Math.round(W)); const H = Math.round(W * 0.62);
  const p = new Uint8Array(W * H * 4);
  const kal = Math.max(5, W * 0.016), cx = W / 2;
  const boyun = H * 0.36, omuzY = H * 0.9, sol = W * 0.03, sag = W * 0.97;
  const parcalar = [[cx, boyun, sol, omuzY], [cx, boyun, sag, omuzY], [sol + W * 0.02, omuzY, sag - W * 0.02, omuzY], [cx, boyun, cx, H * 0.24]];
  const kancaR = H * 0.11, kancaX = cx + kancaR * 0.0, kancaY = H * 0.13;
  const seg = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = Math.min(...parcalar.map(([a, b, c, e]) => seg(x + 0.5, y + 0.5, a, b, c, e)));
    // kanca: üstte açık yay (soldan sağa, alt-sol açık)
    const ax = x + 0.5 - kancaX, ay = y + 0.5 - kancaY, aci = Math.atan2(ay, ax);
    if (aci < 2.2 || aci > 2.9) d = Math.min(d, Math.abs(Math.hypot(ax, ay) - kancaR));
    const al = Math.max(0, Math.min(1, kal / 2 + 0.5 - d));
    if (al > 0) { const k = (y * W + x) * 4; const ton = 150 + Math.round(40 * (1 - y / H)); p[k] = ton; p[k + 1] = ton; p[k + 2] = ton + 6; p[k + 3] = Math.round(al * 255); }
  }
  return { png: await pngRgbaSikistir(W, H, p), W, H, boyunY: boyun, omuzY };
}
// Koyu yazı (saydam zemin) — kolaj etiketleri
export async function yaziPng(metin, renk = [40, 36, 30]) {
  const harfler = []; let x = 0;
  for (const ch of String(metin).toLocaleUpperCase("tr")) {
    if (ch === " ") { x += 14; continue; }
    const g = GLIFLER[ch]; if (!g) continue;
    const ham = atob(g.a), a = new Uint8Array(ham.length); for (let i = 0; i < ham.length; i++) a[i] = ham.charCodeAt(i);
    harfler.push({ w: g.w, a, x }); x += g.w + 3;
  }
  const W = Math.max(1, x), H = GLIF_YUKSEKLIK, p = new Uint8Array(W * H * 4);
  for (const h of harfler) for (let y = 0; y < H; y++) for (let i = 0; i < h.w; i++) {
    const v = h.a[y * h.w + i]; if (!v) continue; const k = (y * W + h.x + i) * 4;
    p[k] = renk[0]; p[k + 1] = renk[1]; p[k + 2] = renk[2]; p[k + 3] = Math.max(p[k + 3], v);
  }
  return { png: await pngRgbaSikistir(W, H, p), W, H };
}
// İnce altın çizgi (kolaj başlık altı)
async function cizgiPng(W, H = 3) { return pngRgbaSikistir(W, H, dolu(W, H, 191, 160, 90)); }

const akis = (b) => new Blob([b]).stream();
async function jpeg(sonuc) { return new Uint8Array(await (await sonuc.output({ format: "image/jpeg", quality: 92 })).response().arrayBuffer()); }
// Cloudflare Images: bir işlemde en fazla 10 dönüşüm → her katman önce AYRI işlemde son boyutuna getirilir (bayt), sonra
// tabana 3'erli gruplar halinde basılır (ara sonuç kayıpsız PNG)
async function donustur(env, bayt, tr, tur = "image/png") { return new Uint8Array(await (await env.IMAGES.input(akis(bayt)).transform(tr).output({ format: tur, ...(tur === "image/jpeg" ? { quality: 94 } : {}) })).response().arrayBuffer()); }
async function bas(env, taban, katmanlar) {
  let b = taban;
  for (let i = 0; i < katmanlar.length; i += 3) {
    let r = env.IMAGES.input(akis(b));
    for (const k of katmanlar.slice(i, i + 3)) r = r.draw(env.IMAGES.input(akis(k.bayt)), k.yer);
    const son = i + 3 >= katmanlar.length;
    b = new Uint8Array(await (await r.output(son ? { format: "image/jpeg", quality: 92 } : { format: "image/png" })).response().arrayBuffer());
  }
  return b;
}

// Askı görseli: beyaz 1200×1800, askı + kesilmiş elbise (oranı korunur, ortalanır), sağ altta "MARKA · kod"
// Kesik görseli elbise kutusuna (biraz pay) kırp → askıya gidecek temiz elbise (dışarıda kalan kırıntılar atılır)
export async function elbiseKirp(env, kesik, kutu, W, H) {
  const [a, b, x, y] = kutu, px = (x - a) * 0.03, py = (y - b) * 0.02;
  const left = Math.max(0, Math.round(a - px)), top = Math.max(0, Math.round(b - py));
  return donustur(env, kesik, { trim: { left, top, width: Math.min(W - left, Math.round(x - a + 2 * px)), height: Math.min(H - top, Math.round(y - b + 2 * py)) } });
}
export async function askiGorseli(env, kesik, kod, marka, { etiketsiz = false } = {}) {
  const W = 1200, H = 1800, ust = 250, alt = 70, yan = 110;
  const bilgi = await env.IMAGES.info(akis(kesik));
  const kw = bilgi.width || 800, kh = bilgi.height || 1200;
  const s = Math.min((W - 2 * yan) / kw, (H - ust - alt) / kh);
  const dw = Math.round(kw * s), dh = Math.round(kh * s), dx = Math.round((W - dw) / 2), dy = ust;
  const ask = await askiPng(Math.min(W - 2 * yan, Math.max(360, dw * 0.62)));
  const ax = Math.round((W - ask.W) / 2), ay = Math.round(dy + Math.min(60, dh * 0.04) - ask.omuzY);
  const kenar = Math.round(W * 0.03);
  const elbise = await donustur(env, kesik, { width: dw, height: dh, fit: "contain" });
  const isim = await donustur(env, etiketPngMarka(kod, marka), { width: Math.round(W * ETIKET_ORANI) });
  return bas(env, await beyazPng(W, H), [{ bayt: ask.png, yer: { top: Math.max(0, ay), left: ax } }, { bayt: elbise, yer: { top: dy, left: dx } }, ...(etiketsiz ? [] : [{ bayt: isim, yer: { bottom: kenar, right: kenar } }])]);
}
let etiketPngMarka = (kod, marka) => etiketPng(kod, marka);
export function _etiketDegistir(f) { etiketPngMarka = f; } // testler için

// Kolaj: beyaz 1600×1600; karolar yan yana (2 ya da 3), altında EN · FR etiket; üstte "MARKA · KOD" başlık + altın çizgi
export async function kolaj(env, karolar, kod, marka, etiketMarka) {
  const W = 1600, H = 1600, pay = 60, ust = 170, araliK = 36, yaziH = 70;
  const n = karolar.length; if (!n) return null;
  const kw = Math.floor((W - 2 * pay - (n - 1) * araliK) / n), bos = H - ust - pay - yaziH - 40, kh = Math.min(bos, Math.round(kw * 1.45));
  const ty = ust + Math.round((bos - kh) / 2);
  const katman = [];
  const baslik = await yaziPng(etiketMarka || `${marka} · ${kod}`);
  const bw = Math.min(W - 2 * pay, Math.round(baslik.W * 0.9)), bh = Math.round((baslik.H * bw) / baslik.W);
  katman.push({ bayt: await donustur(env, baslik.png, { width: bw }), yer: { top: 60, left: Math.round((W - bw) / 2) } });
  katman.push({ bayt: await cizgiPng(220), yer: { top: 60 + bh + 18, left: Math.round((W - 220) / 2) } });
  for (let i = 0; i < n; i++) {
    const k = karolar[i], left = pay + i * (kw + araliK);
    const alan = kirpimAlani(k.kutu, k.W, k.H, kw / kh);
    // Kaynak kesik (saydam) görsel → beyaz karo üstüne (mağaza arka planı ve manken görünmez)
    const kirpim = await donustur(env, k.bayt, { trim: alan, width: kw, height: kh, fit: "cover", sharpen: 1 });
    katman.push({ bayt: await bas(env, await beyazPng(kw, kh), [{ bayt: kirpim, yer: { top: 0, left: 0 } }]), yer: { top: ty, left } });
    const y = await yaziPng(k.etiket);
    const yw = Math.min(kw, Math.round(y.W * 0.62));
    katman.push({ bayt: await donustur(env, y.png, { width: yw }), yer: { top: ty + kh + 26, left: left + Math.round((kw - yw) / 2) } });
  }
  return bas(env, await beyazPng(W, H), katman);
}
