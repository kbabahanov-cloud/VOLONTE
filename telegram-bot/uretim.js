// SELİN ÜRETİM ATÖLYESİ (kullanıcı kararı, 28 Ekim)
// Gerçek fotoğraf ve videolardan kıyafeti öğrenip AYNI manken + AYNI kıyafetle yeni HD fotoğraflar ve video üretir.
// Birden çok araç denenir (tek hesap: fal.ai — anahtar Cloudflare'de FAL_KEY), her üretim orijinalle yan yana
// gösterilir; Claude renk / desen / kesim / yüz benzerliğini puanlar, tutmayan elenir.
// KESİN KURAL: renk, desen, kesim birebir aynı. Hiçbir şey onaysız siteye çıkmaz (site kilidi + Telegram onayı).
// Bütçe: deneme sınırı DENEME_SINIR_USD, toplam 60 $ kasa (Pelin/Arda/ChatGPT ile ortak) KASA_USD.

import Anthropic from "@anthropic-ai/sdk";
import { sinirAsildiMi, harcamaEkle } from "./harcama.js";

export const KASA_USD = 60;
export const DENEME_SINIR_USD = 15;
export const DENEME_KODLARI = ["3618", "3592"]; // düz renk ceket + çiçek desenli elbise (kolay + zor desen)

// Araçlar (fal.ai uç noktaları). Fiyatlar yaklaşık; harcama bu tahminle tutulur, gerçek fatura fal.ai panelinde.
export const ARACLAR = {
  nano: { ad: "Google Nano Banana 2.1", tur: "foto", uc: "google/nano-banana-2.1/edit", fiyat: 0.05 },
  nanopro: { ad: "Google Nano Banana Pro", tur: "foto", uc: "fal-ai/nano-banana-pro/edit", fiyat: 0.15 },
  fashn: { ad: "FASHN giydirme (Nano ile pozun üstüne orijinal kıyafet)", tur: "foto", uc: "fal-ai/fashn/tryon/v1.6", fiyat: 0.075, sonra: "nano" },
  kling: { ad: "Kling video", tur: "video", uc: "fal-ai/kling-video/v2.1/pro/image-to-video", fiyat: 0.49 },
  veo: { ad: "Google Veo 3.1 Fast video", tur: "video", uc: "fal-ai/veo3.1/fast/image-to-video", fiyat: 1.2 },
};

const POZLAR = [
  "full-length front view, standing naturally, hands relaxed",
  "three-quarter side view, one hand on hip",
  "full-length back view, looking slightly over the shoulder",
  "walking towards the camera, mid-step",
];
const KURAL = "The outfit must stay EXACTLY identical to the reference photos: same colors, same print/pattern with the same motif size and placement, same fabric texture, same cut, length, sleeves, collar and details. Do not redesign, recolor or simplify the garment. Keep the SAME woman with the SAME face, skin tone, hair and body. Photorealistic professional fashion catalog photo, sharp high resolution, soft natural light, clean elegant background. No text, no logo, no watermark.";
const VIDEO_KURAL = "The woman in the photo moves naturally and elegantly to show the outfit: a slow turn and a few steps. Static camera with a gentle push-in. The outfit keeps exactly the same colors, print and cut in every frame. Realistic, natural motion, no morphing, no text, no logo.";

const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const yaz = (env, k, v) => env.KAYIT.put(k, JSON.stringify(v));

// Harcama (yaklaşık): selin:uretimHarcama { toplam, deneme }
export async function uretimHarcanan(env) {
  return oku(env, "selin:uretimHarcama", { toplam: 0, deneme: 0 });
}
async function harcamaYaz(env, usd, deneme) {
  const h = await uretimHarcanan(env);
  h.toplam = Math.round((h.toplam + usd) * 1000) / 1000;
  if (deneme) h.deneme = Math.round((h.deneme + usd) * 1000) / 1000;
  await yaz(env, "selin:uretimHarcama", h);
}

// fal.ai kuyruk API'si: gönder → durum → sonuç.
async function falGonder(env, uc, girdi) {
  const r = await fetch(`https://queue.fal.run/${uc}`, {
    method: "POST", headers: { authorization: `Key ${String(env.FAL_KEY).trim()}`, "content-type": "application/json" }, body: JSON.stringify(girdi),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.request_id) throw new Error(`fal ${uc} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return { id: j.request_id, durumUrl: j.status_url, sonucUrl: j.response_url };
}
async function falDurum(env, is) {
  const r = await fetch(is.durumUrl, { headers: { authorization: `Key ${String(env.FAL_KEY).trim()}` } });
  const j = await r.json().catch(() => ({}));
  if (j.status !== "COMPLETED") return { bitti: false };
  const s = await fetch(is.sonucUrl, { headers: { authorization: `Key ${String(env.FAL_KEY).trim()}` } });
  const c = await s.json().catch(() => ({}));
  if (!s.ok) return { bitti: true, hata: JSON.stringify(c).slice(0, 200) };
  const url = (c.images && c.images[0] && c.images[0].url) || (c.video && c.video.url) || (c.image && c.image.url) || null;
  return url ? { bitti: true, url } : { bitti: true, hata: `sonuç yok: ${JSON.stringify(c).slice(0, 150)}` };
}

// İş planı: her model için foto araçları × 4 poz + video araçları × 1.
export function isPlani(kod, araclar = ARACLAR) {
  const isler = [];
  for (const [a, x] of Object.entries(araclar)) {
    if (x.tur === "foto") POZLAR.forEach((poz, i) => isler.push({ kod, arac: a, poz: i, durum: "bekliyor" }));
    else isler.push({ kod, arac: a, poz: 0, durum: "bekliyor" });
  }
  return isler;
}

function girdiHazirla(is, referanslar, onceki) {
  const x = ARACLAR[is.arac];
  if (is.arac === "fashn") {
    // Nano'nun ürettiği yeni pozun üstüne orijinal kıyafet (FASHN kıyafeti çizmez, aktarır → desen daha iyi korunur)
    return { model_image: onceki, garment_image: referanslar[0], category: "auto", garment_photo_type: "model", mode: "quality", output_format: "png" };
  }
  if (x.tur === "foto") return { prompt: `New photo of the same woman wearing the same outfit. Pose: ${POZLAR[is.poz]}. ${KURAL}`, image_urls: referanslar.slice(0, 3), num_images: 1, output_format: "png", ...(is.arac === "nanopro" ? { resolution: "2K" } : {}) };
  if (is.arac === "veo") return { prompt: VIDEO_KURAL, image_url: referanslar[0], duration: "8s", generate_audio: false, resolution: "1080p" };
  return { prompt: VIDEO_KURAL, image_url: referanslar[0], duration: "5", negative_prompt: "blur, distort, morphing, color change, pattern change, text, logo, watermark" };
}

// Bir çalışma: en fazla birkaç gönderim + bekleyenlerin durumu (ücretsiz pakette 50 istek sınırı).
export async function uretimAdimi(env, simdi, { referansAl, bildir }) {
  if (!env.FAL_KEY) return;
  let u = await oku(env, "selin:uretim", null);
  if (!u) {
    u = { surum: "d1", kodlar: DENEME_KODLARI, isler: DENEME_KODLARI.flatMap((k) => isPlani(k)), basla: simdi, deneme: true };
    await yaz(env, "selin:uretim", u);
  }
  if (u.durum === "bitti") return;
  const h = await uretimHarcanan(env);
  let gonderilen = 0;
  let sorulan = 0;
  for (const is of u.isler) {
    if (is.durum === "gonderildi") {
      if (sorulan++ >= 8) continue; // çalışma başına istek sınırı
      const d = await falDurum(env, is.fal).catch((e) => ({ bitti: true, hata: String(e.message) }));
      if (d.bitti) Object.assign(is, d.url ? { durum: "hazir", url: d.url } : { durum: "hata", hata: d.hata });
      continue;
    }
    if (is.durum !== "bekliyor" || gonderilen >= 2) continue;
    const x = ARACLAR[is.arac];
    if (h.toplam + x.fiyat > KASA_USD || (u.deneme && h.deneme + x.fiyat > DENEME_SINIR_USD)) { is.durum = "butce"; continue; }
    let onceki = null;
    if (x.sonra) {
      const o = u.isler.find((y) => y.kod === is.kod && y.arac === x.sonra && y.poz === is.poz);
      if (!o || ["bekliyor", "gonderildi"].includes(o.durum)) continue; // önce Nano pozu bitsin
      if (o.durum !== "hazir") { is.durum = "hata"; is.hata = "önceki adım yok"; continue; }
      onceki = o.url;
    }
    try {
      const refs = await referansAl(is.kod);
      if (!refs.length) { is.durum = "hata"; is.hata = "referans fotoğraf yok"; continue; }
      is.fal = await falGonder(env, x.uc, girdiHazirla(is, refs, onceki));
      is.durum = "gonderildi";
      is.zaman = simdi;
      h.toplam += x.fiyat; if (u.deneme) h.deneme += x.fiyat;
      await harcamaYaz(env, x.fiyat, u.deneme);
    } catch (e) {
      is.durum = "hata";
      is.hata = String(e.message).slice(0, 200);
    }
    gonderilen++;
  }
  await yaz(env, "selin:uretim", u);
  const acik = u.isler.filter((is) => ["bekliyor", "gonderildi"].includes(is.durum));
  if (acik.length) return;
  // Hepsi bitti: Claude karşılaştırması, sonra bildirim.
  for (const kod of u.kodlar) {
    if (u.puan && u.puan[kod]) continue;
    u.puan = u.puan || {};
    u.puan[kod] = await karsilastir(env, simdi, kod, await referansAl(kod, true), u.isler.filter((is) => is.kod === kod && is.durum === "hazir" && ARACLAR[is.arac].tur === "foto")).catch((e) => ({ hata: String(e.message).slice(0, 200) }));
    await yaz(env, "selin:uretim", u);
    return; // bir çalışmada bir model (süre sınırı)
  }
  u.durum = "bitti";
  u.bitis = simdi;
  await yaz(env, "selin:uretim", u);
  await bildir(u);
}

// Claude: orijinal ↔ üretim (renk, desen, kesim, yüz) 0-10; 8 altı → elenir.
async function karsilastir(env, simdi, kod, orijinaller, uretimler) {
  if (!env.ANTHROPIC_API_KEY || !uretimler.length || (await sinirAsildiMi(env, simdi))) return {};
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const icerik = [{ type: "text", text: `Orijinal fotoğraflar (VOLONTE modeli ${kod}):` }];
  for (const o of orijinaller.slice(0, 2)) icerik.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: o } });
  uretimler.forEach((is, i) => {
    icerik.push({ type: "text", text: `Üretim ${i + 1} (${ARACLAR[is.arac].ad}):` });
    icerik.push({ type: "image", source: { type: "url", url: is.url } });
  });
  icerik.push({ type: "text", text: `Her üretimi orijinalle karşılaştır. Kıyafetin rengi, deseni (motif, büyüklük, yerleşim), kesimi (boy, kol, yaka, detay) ve mankenin yüzü ne kadar aynı? Çok titiz ol: küçük renk kayması veya desen basitleşmesi puan düşürür. Sadece JSON: {"uretimler":[{"no":1,"renk":0-10,"desen":0-10,"kesim":0-10,"yuz":0-10,"not":"kısa Türkçe"}]}` });
  const r = await client.messages.create({ model, max_tokens: 1500, messages: [{ role: "user", content: icerik }] });
  await harcamaEkle(env, model, r.usage, simdi);
  const metin = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const j = JSON.parse(metin.slice(metin.indexOf("{"), metin.lastIndexOf("}") + 1));
  const sonuc = {};
  for (const p of j.uretimler || []) {
    const is = uretimler[p.no - 1];
    if (!is) continue;
    const enAz = Math.min(p.renk, p.desen, p.kesim, p.yuz);
    sonuc[`${is.arac}:${is.poz}`] = { ...p, uygun: enAz >= 8 };
  }
  return sonuc;
}

// Araç karşılaştırma özeti: araç → { adet, uygun, ortalama desen/renk }
export function aracOzeti(u) {
  const oz = {};
  for (const is of u.isler) {
    const a = (oz[is.arac] = oz[is.arac] || { ad: ARACLAR[is.arac].ad, tur: ARACLAR[is.arac].tur, uretilen: 0, hata: 0, uygun: 0, desen: [], renk: [], fiyat: ARACLAR[is.arac].fiyat });
    if (is.durum === "hazir") a.uretilen++;
    if (is.durum === "hata") a.hata++;
    const p = u.puan && u.puan[is.kod] && u.puan[is.kod][`${is.arac}:${is.poz}`];
    if (p) { a.desen.push(p.desen); a.renk.push(p.renk); if (p.uygun) a.uygun++; }
  }
  const ort = (l) => (l.length ? Math.round((l.reduce((x, y) => x + y, 0) / l.length) * 10) / 10 : null);
  return Object.fromEntries(Object.entries(oz).map(([k, a]) => [k, { ...a, desen: ort(a.desen), renk: ort(a.renk) }]));
}
