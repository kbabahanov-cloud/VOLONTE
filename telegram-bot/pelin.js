// PELİN (@VolontePelinBot) — VOLONTE'nin görsel/video yapımcısı. Cloudflare Worker "volonte-pelin".
//
// Kullanıcı kararları (29–30 Ekim):
//  - Beyin: Sonnet (tek ayarla Opus: /beyin opus). Komutsuz, normal sohbet; soru sorar, fikir verir.
//  - Bütçe: ekibin 80 $'ından AYRI, aylık 150 $; 120 $'da (%80) Murat'a uyarı. Her üretimden önce maliyet önizlemesi +
//    ✅ Onayla / ❌ İptal (sadece Murat). Onaysız harcama YOK. "fal hazır" yazılmadan hiçbir üretim başlamaz.
//  - Deneme sırası: (a) 3 manken yüzü (beyaz, siyahi, Büyük seri için dolgun) — Murat onaylamadan devam yok;
//    (b) 3592 (desenli) + 3577 (düz siyah): aynı başlangıç karesi, aynı süre, aynı ayarla Veo 3.1 Lite / Kling 3.0 Pro /
//    Seedance 2.0; (c) kör test: harfler karışık, askı fotoğrafı + renk/desen puanı; gerçek mankenli kanal videosu da
//    karışık bir harfle kıyasa girer; araç adları ve maliyet oylamadan sonra açılır. Kazananı Murat + Hemra seçer.
//  - Kesin kurallar: renk, desen, kesim asla değişmez; manken yüzü hep aynı; fiyat/maliyet/stok hiçbir görsele yazılmaz;
//    videoya AI notu basılmaz. Kod + VOLONTE yazısı üretimden SONRA paketlemede eklenir (video araçları başlangıç karesindeki
//    yazıyı bozar; bu yüzden ham karede yazı yok).
//  - Sonuçlar Telegram'dan telefona.
//
// Ayarlar (Cloudflare volonte-pelin): BOT_TOKEN, FAL_KEY, ANTHROPIC_API_KEY (secret, kullanıcı girer), WEBHOOK_SECRET (kurulumda
// rastgele), KAYIT (ortak KV), PELIN (Durable Object), MURAT_ID, HEMRA_ID, ALLOWED_IDS, SELF_URL, KEMAL_URL.

import Anthropic from "@anthropic-ai/sdk";
import { karmaDepo } from "./depo.js";
import { patronDenemesi } from "./venom.js";
import { siteVerisi } from "./depo-oku.js";

export const AYLIK_SINIR_USD = 150;
export const UYARI_ORANI = 0.8;
const SAAT_FARKI = 3 * 3600;
const GUNCELLEMELER = ["message", "callback_query"];
export const BEYINLER = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
const CLAUDE_FIYAT = { "claude-sonnet-5-5": { giris: 2, cikis: 10, okuma: 0.2 }, "claude-opus-5-5": { giris: 4, cikis: 20, okuma: 0.2 } };
const GUNLUK_SOHBET = 100;

// Araçlar (fal.ai). Fiyatlar fal sayfalarındaki yaklaşık değerler; harcama bu tahminle tutulur, gerçek fatura fal panelinde.
export const SURE_SN = 6; // üç araçta ortak süre (Veo Lite: 4/6/8 s; Kling 3.0: 3–15; Seedance 2.0: 4–15)
export const ARACLAR = {
  veo: { ad: "Google Veo 3.1 Lite", uc: "fal-ai/veo3.1/lite/image-to-video", saniye: 0.05 },
  kling: { ad: "Kling 3.0 Pro", uc: "fal-ai/kling-video/v3/pro/image-to-video", saniye: 0.112 },
  seedance: { ad: "Seedance 2.0", uc: "bytedance/seedance-2.0/image-to-video", saniye: 0.3024 },
};
export const GORSEL = { metin: "fal-ai/nano-banana-pro", duzenle: "fal-ai/nano-banana-pro/edit", fiyat: 0.15 };
const KARE = { uc: "fal-ai/ffmpeg-api/extract-frame", saniye: 0.0002 };
const PUANLAMA_TAHMIN = 0.05; // model başına Claude puanlaması (yaklaşık)

export const MANKENLER = {
  beyaz: { ad: "Beyaz kız", tarif: "a young modern woman in her mid-20s with fair skin and long brown hair" },
  siyahi: { ad: "Siyahi kız", tarif: "a young modern Black African woman in her mid-20s with deep brown skin and natural black hair styled elegantly" },
  dolgun: { ad: "Dolgun (Büyük seri)", tarif: "a curvy plus-size (EU size 48-50) modern woman in her late 20s with warm brown skin and long dark hair, confident and elegant" },
};
// Deneme modelleri ve mankenleri (bir deneme siyahi mankenle — kullanıcı kararı).
export const DENEME_MODELLERI = { 3592: { manken: "siyahi", ad: "desenli" }, 3577: { manken: "beyaz", ad: "düz siyah" } };
export const ADAY_SAYISI = 2; // her yüz için aday

const YUZ_ISTEMI = (m) => `Photorealistic fashion catalog reference portrait of ${m.tarif}. Head and upper body, looking at the camera with a soft natural smile, natural makeup, plain fitted black top, clean light-grey studio background, soft professional studio light, sharp focus, 3:4. She is an ORIGINAL, fictional person: she must not resemble any celebrity, model, actress, influencer or other real public figure. No text, no logo, no watermark.`;
const FOTO_ISTEMI = `Full-length vertical (9:16) fashion catalog photo of the SAME woman as in the first image (same face, skin tone, hair and body), wearing EXACTLY the garment shown in the other image(s). The garment must stay identical: same colors, same print/pattern with the same motif size and placement, same fabric texture, same cut, length, sleeves, collar and every detail. Do not redesign, recolor, simplify or add anything. She stands naturally, full body visible from head to toe, clean light studio background, soft natural light, photorealistic, sharp. No text, no logo, no watermark.`;
const VIDEO_ISTEMI = "The woman stands still for a moment, then turns slowly and gracefully to show the outfit from the front and side, then faces the camera again. Static camera, gentle slow motion, soft studio light. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no text, no logo, no watermark.";
const NEGATIF = "blur, distortion, morphing, color change, pattern change, extra limbs, text, logo, watermark";

export function videoGirdisi(arac, kare) {
  if (arac === "veo") return { prompt: VIDEO_ISTEMI, image_url: kare, duration: `${SURE_SN}s`, resolution: "720p", aspect_ratio: "9:16" };
  if (arac === "kling") return { prompt: VIDEO_ISTEMI, start_image_url: kare, duration: String(SURE_SN), negative_prompt: NEGATIF, generate_audio: false };
  return { prompt: VIDEO_ISTEMI, image_url: kare, duration: String(SURE_SN), resolution: "720p", aspect_ratio: "9:16", generate_audio: false };
}

const yuvarla = (x) => Math.round(x * 1000) / 1000;
export const para = (x) => `${(Math.round(x * 100) / 100).toFixed(2).replace(".", ",")} $`;

// Adımların maliyet tahmini: [{ ad, adet, birim }] + toplam.
export function maliyet(adim, d = {}) {
  const k = [];
  if (adim === "yuz") for (const m of d.mankenler || Object.keys(MANKENLER)) k.push({ ad: `Yüz adayı — ${MANKENLER[m].ad} (Nano Banana Pro)`, adet: ADAY_SAYISI, birim: GORSEL.fiyat });
  if (adim === "foto") for (const kod of d.kodlar || Object.keys(DENEME_MODELLERI)) k.push({ ad: `${kod} başlangıç karesi (mankene giydirme, Nano Banana Pro)`, adet: 1, birim: GORSEL.fiyat });
  if (adim === "video") {
    const kodlar = d.kodlar || Object.keys(DENEME_MODELLERI);
    for (const [a, x] of Object.entries(ARACLAR)) k.push({ ad: `${x.ad} — ${SURE_SN} sn × ${kodlar.length} model`, adet: kodlar.length, birim: yuvarla(x.saniye * SURE_SN) });
    k.push({ ad: "Kare çıkarma (puanlama için, video başına 3 kare)", adet: kodlar.length * 4 * 3, birim: yuvarla(KARE.saniye * SURE_SN) });
    k.push({ ad: "Claude renk/desen/kesim puanlaması", adet: kodlar.length, birim: PUANLAMA_TAHMIN });
  }
  const toplam = yuvarla(k.reduce((t, x) => t + x.adet * x.birim, 0));
  return { kalemler: k, toplam };
}

// ---------- Harcama (ekipten ayrı) ----------
const ay = (simdi) => new Date((simdi + SAAT_FARKI) * 1000).toISOString().slice(0, 7);
export async function buAyHarcanan(env, simdi) {
  const fal = Number((await env.KAYIT.get(`uretim-harcama:${ay(simdi)}`)) || 0); // aylık rapor bu kaydı okur
  const claude = Number((await env.KAYIT.get(`pelin-claude:${ay(simdi)}`)) || 0);
  const openai = Number((await env.KAYIT.get(`pelin-openai:${ay(simdi)}`)) || 0);
  return yuvarla(fal + claude + openai);
}
async function harcamaYaz(env, usd, simdi, tur = "fal") {
  const k = tur === "fal" ? `uretim-harcama:${ay(simdi)}` : tur === "openai" ? `pelin-openai:${ay(simdi)}` : `pelin-claude:${ay(simdi)}`;
  const once = Number((await env.KAYIT.get(k)) || 0);
  await env.KAYIT.put(k, String(yuvarla(once + usd)), { expirationTtl: 400 * 86400 });
  const toplam = await buAyHarcanan(env, simdi);
  if (toplam >= AYLIK_SINIR_USD * UYARI_ORANI && !(await env.KAYIT.get(`pelin:uyari:${ay(simdi)}`))) {
    await env.KAYIT.put(`pelin:uyari:${ay(simdi)}`, "1", { expirationTtl: 40 * 86400 });
    await tg(env, "sendMessage", { chat_id: murat(env), text: `⚠️ Pelin bu ay ${para(toplam)} harcadı (aylık sınır ${AYLIK_SINIR_USD} $, %80'e ulaştı). Kalan: ${para(AYLIK_SINIR_USD - toplam)}.` });
  }
}
async function claudeHarcama(env, model, u, simdi) {
  const f = CLAUDE_FIYAT[model] || CLAUDE_FIYAT["claude-opus-5-5"];
  const usd = ((u.input_tokens || 0) * f.giris + (u.cache_creation_input_tokens || 0) * f.giris * 1.25 + (u.cache_read_input_tokens || 0) * f.okuma + (u.output_tokens || 0) * f.cikis) / 1e6;
  await harcamaYaz(env, usd, simdi, "claude");
}

// ---------- Kişiler ----------
const kimlikler = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
// MURAT_ID listesi: ilk = Patron hesabı (mesajlar oraya); hepsi Murat yetkisinde (kimlikler ortamdan, KV venom:kimlikler)
export const murat = (env) => String(env.MURAT_ID || "").split(",").map((x) => x.trim()).filter(Boolean)[0] || "";
const muratMi = (env, id) => String(env.MURAT_ID || "").split(",").map((x) => x.trim()).includes(String(id));
export const hemra = (env) => String(env.HEMRA_ID || "");
const yonetici = (env, id) => muratMi(env, id) || kimlikler(env.ALLOWED_IDS).includes(String(id));
const oylayan = (env, id) => muratMi(env, id) || String(id) === hemra(env);

// ---------- Telegram ----------
export async function tg(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  return r.json().catch(() => ({ ok: false }));
}
const yaz = (env, chat, text, ek = {}) => tg(env, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...ek });

// ---------- Kayıt ----------
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);
export const PELIN_YEREL = { anahtarlar: [], onekler: ["pelin:"], haric: ["pelin:hata", "pelin:webhook"] };
const yeniDeneme = () => ({ asama: "fal", yuzler: {}, modeller: Object.fromEntries(Object.keys(DENEME_MODELLERI).map((k) => [k, { aski: [], oylar: {} }])), isler: [] });
const denemeOku = async (env) => (await oku(env, "pelin:deneme", null)) || yeniDeneme();

// ---------- fal.ai kuyruk API'si ----------
const falBaslik = (env) => ({ authorization: `Key ${String(env.FAL_KEY || "").trim()}`, "content-type": "application/json" });
async function falGonder(env, uc, girdi) {
  const r = await fetch(`https://queue.fal.run/${uc}`, { method: "POST", headers: falBaslik(env), body: JSON.stringify(girdi) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.request_id) throw new Error(`fal ${uc} ${r.status}: ${JSON.stringify(j.detail || j).slice(0, 300)}`);
  return { durumUrl: j.status_url, sonucUrl: j.response_url };
}
async function falDurum(env, f) {
  const r = await fetch(f.durumUrl, { headers: falBaslik(env) });
  const j = await r.json().catch(() => ({}));
  if (j.status && j.status !== "COMPLETED") return { bitti: false };
  const s = await fetch(f.sonucUrl, { headers: falBaslik(env) });
  const c = await s.json().catch(() => ({}));
  if (!s.ok) return { bitti: true, hata: JSON.stringify(c.detail || c).slice(0, 300) };
  const resimler = (c.images || []).map((x) => x.url).filter(Boolean);
  const video = c.video && c.video.url;
  return resimler.length || video ? { bitti: true, resimler, video } : { bitti: true, hata: `sonuç yok: ${JSON.stringify(c).slice(0, 200)}` };
}

// ---------- Maliyet önizlemesi ve onay (sadece Murat) ----------
export async function onizlemeGonder(env, adim, simdi) {
  const d = await denemeOku(env);
  const engel = adimEngeli(env, d, adim);
  if (engel) return yaz(env, murat(env), `⏸ ${engel}`);
  const m = maliyet(adim, adimVerisi(d, adim));
  const harcanan = await buAyHarcanan(env, simdi);
  const no = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await kaydet(env, `pelin:onizleme:${no}`, { adim, toplam: m.toplam, zaman: simdi, veri: adimVerisi(d, adim) }, 3 * 86400);
  const asar = harcanan + m.toplam > AYLIK_SINIR_USD;
  const metin = [
    `💰 Maliyet önizlemesi — ${ADIM_AD[adim]}`,
    ...m.kalemler.map((x) => `• ${x.ad}: ${x.adet} × ${para(x.birim)} = ${para(x.adet * x.birim)}`),
    `Toplam (yaklaşık): ${para(m.toplam)}`,
    `Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $ (kalan ${para(AYLIK_SINIR_USD - harcanan)})`,
    asar ? "⛔ Bu üretim aylık sınırı aşar; onaylanamaz." : "Onaylamadan hiçbir harcama yapılmaz.",
  ].join("\n");
  return yaz(env, murat(env), metin, asar ? {} : { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `po:${no}` }, { text: "❌ İptal", callback_data: `pi:${no}` }]] } });
}
const ADIM_AD = { yuz: "3 manken yüzü", foto: "başlangıç kareleri (mankene giydirme)", video: "video denemesi (3 araç × 2 model) + puanlama" };
function adimVerisi(d, adim) {
  if (adim === "yuz") return { mankenler: Object.keys(MANKENLER).filter((m) => !(d.yuzler[m] && d.yuzler[m].secilen)) };
  if (adim === "foto") return { kodlar: Object.keys(DENEME_MODELLERI).filter((k) => !d.modeller[k].foto) };
  return { kodlar: Object.keys(DENEME_MODELLERI) };
}
function adimEngeli(env, d, adim) {
  if (!env.FAL_KEY) return "FAL_KEY henüz girilmedi (Cloudflare → volonte-pelin → Variables and Secrets).";
  if (d.asama === "fal") return "Önce \"fal hazır\" yazın (fal.ai hesabı ve 20 $ yükleme).";
  if (d.isler.some((i) => i.durum === "gonderildi")) return "Devam eden bir üretim var; bitmesini bekleyin.";
  if (adim !== "yuz" && Object.keys(MANKENLER).some((m) => !(d.yuzler[m] && d.yuzler[m].secilen))) return "Önce 3 manken yüzünü onaylayın.";
  if (adim === "foto" && Object.keys(DENEME_MODELLERI).some((k) => !d.modeller[k].aski.length)) return `Askı fotoğrafları eksik: ${Object.keys(DENEME_MODELLERI).filter((k) => !d.modeller[k].aski.length).join(", ")}. Fotoğrafı yazısına "3592 askı" yazarak gönderin.`;
  if (adim === "video" && Object.keys(DENEME_MODELLERI).some((k) => !d.modeller[k].fotoOnay)) return "Önce iki modelin başlangıç karesini onaylayın.";
  return null;
}

async function onizlemeKarari(env, cq, simdi) {
  const [islem, no] = cq.data.split(":");
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Harcama onayı sadece Murat'ta.");
  const o = await oku(env, `pelin:onizleme:${no}`, null);
  if (!o || o.durum) return cevap("Bu önizleme artık geçerli değil.");
  o.durum = islem;
  await kaydet(env, `pelin:onizleme:${no}`, o, 3 * 86400); // önce kilitle
  const duzenle = (ek) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${cq.message.text}\n\n${ek}` });
  if (islem === "pi") { await cevap("İptal"); return duzenle("❌ İptal edildi, harcama yapılmadı."); }
  const d = await denemeOku(env);
  const engel = adimEngeli(env, d, o.adim);
  if (engel) { await cevap("Başlatılamadı"); return duzenle(`⏸ ${engel}`); }
  if ((await buAyHarcanan(env, simdi)) + o.toplam > AYLIK_SINIR_USD) { await cevap("Sınır"); return duzenle("⛔ Aylık sınır aşılır; başlatılmadı."); }
  await cevap("Başladı");
  await duzenle(`✅ Onaylandı (${kisiAdi(cq.from)}). Üretim başladı; bitince buraya gönderirim.`);
  return adimBaslat(env, d, o.adim, simdi);
}

// İşler oluşturulur ve fal'a gönderilir (gönderilen işin tahmini maliyeti hemen harcamaya yazılır).
async function adimBaslat(env, d, adim, simdi) {
  const yeni = [];
  if (adim === "yuz") {
    for (const m of adimVerisi(d, "yuz").mankenler) yeni.push({ adim, hedef: m, uc: GORSEL.metin, fiyat: GORSEL.fiyat * ADAY_SAYISI, girdi: { prompt: YUZ_ISTEMI(MANKENLER[m]), num_images: ADAY_SAYISI, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" } });
  } else if (adim === "foto") {
    for (const kod of adimVerisi(d, "foto").kodlar) {
      const yuz = d.yuzler[DENEME_MODELLERI[kod].manken].secilen;
      const aski = d.modeller[kod].aski.map((a) => dosyaUrl(env, a.anahtar));
      yeni.push({ adim, hedef: kod, uc: GORSEL.duzenle, fiyat: GORSEL.fiyat, girdi: { prompt: FOTO_ISTEMI, image_urls: [yuz, ...aski].slice(0, 4), num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" } });
    }
  } else if (adim === "video") {
    for (const kod of Object.keys(DENEME_MODELLERI)) {
      d.modeller[kod].videolar = {};
      for (const [a, x] of Object.entries(ARACLAR)) yeni.push({ adim, hedef: `${kod}:${a}`, uc: x.uc, fiyat: yuvarla(x.saniye * SURE_SN), girdi: videoGirdisi(a, d.modeller[kod].foto) });
    }
    d.asama = "video";
  }
  if (adim === "yuz") d.asama = "yuz";
  if (adim === "foto") d.asama = "foto";
  for (const is of yeni) {
    try {
      is.fal = await falGonder(env, is.uc, is.girdi);
      is.durum = "gonderildi";
      is.zaman = simdi;
      await harcamaYaz(env, is.fiyat, simdi);
    } catch (e) {
      is.durum = "hata";
      is.hata = String(e.message).slice(0, 300);
    }
    delete is.girdi;
    d.isler.push(is);
  }
  await kaydet(env, "pelin:deneme", d);
  const hatalar = yeni.filter((i) => i.durum === "hata");
  if (hatalar.length) await yaz(env, murat(env), `⚠️ ${hatalar.length} iş fal'a gönderilemedi (ücret alınmaz):\n${hatalar.map((i) => `• ${i.hedef}: ${i.hata}`).join("\n")}`);
}

// ---------- 5 dakikalık görev: işlerin durumu ----------
export async function pelinCron(env, simdi) {
  await webhookKur(env);
  if (env.FAL_KEY) {
    for (const f of [kurulumCron, uretimCron, ornekCron]) { try { await f(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: f.name, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  }
  const d = await oku(env, "pelin:deneme", null);
  if (!d || !env.FAL_KEY) return;
  let degisti = false;
  let sorulan = 0;
  for (const is of d.isler) {
    if (is.durum !== "gonderildi" || sorulan >= 12) continue;
    sorulan++;
    const s = await falDurum(env, is.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti) {
      if (simdi - is.zaman > 3 * 3600) Object.assign(is, { durum: "hata", hata: "3 saatte bitmedi (fal panelinden kontrol edin)" });
      else continue;
    } else if (s.hata) {
      Object.assign(is, { durum: "hata", hata: s.hata });
      await harcamaYaz(env, -is.fiyat, simdi); // başarısız iş ücretlendirilmez (fal sadece başarılı sonucu ücretlendirir)
    }
    else Object.assign(is, { durum: "hazir", resimler: s.resimler, video: s.video });
    degisti = true;
  }
  if (degisti) await kaydet(env, "pelin:deneme", d);
  const bekleyen = (adim) => d.isler.some((i) => i.adim === adim && i.durum === "gonderildi");
  const yeniBiten = (adim) => d.isler.filter((i) => i.adim === adim && i.durum !== "gonderildi" && !i.bildirildi);
  if (d.asama === "yuz" && !bekleyen("yuz") && yeniBiten("yuz").length) return yuzleriGonder(env, d);
  if (d.asama === "foto" && !bekleyen("foto") && yeniBiten("foto").length) return fotolariGonder(env, d);
  if (d.asama === "video" && !bekleyen("video") && yeniBiten("video").length) return puanlamaBaslat(env, d, simdi);
  if (d.asama === "kare" && !bekleyen("kare")) return puanla(env, d, simdi);
}

// (a) Yüzler: her manken için adaylar + "✅ 1 / ✅ 2 / 🔄 Yeniden".
async function yuzleriGonder(env, d) {
  for (const is of d.isler.filter((i) => i.adim === "yuz" && !i.bildirildi)) {
    is.bildirildi = true;
    const m = MANKENLER[is.hedef];
    if (is.durum !== "hazir") { await yaz(env, murat(env), `⚠️ ${m.ad} üretilemedi: ${is.hata}`); continue; }
    d.yuzler[is.hedef] = { adaylar: is.resimler };
    await tg(env, "sendMediaGroup", { chat_id: murat(env), media: is.resimler.map((u, i) => ({ type: "photo", media: u, caption: i === 0 ? `👤 ${m.ad} — ${is.resimler.length} aday` : undefined })) });
    await yaz(env, murat(env), `${m.ad}: hangisi? Ünlüye ya da tanıdığınız birine benziyorsa seçmeyin, yeniden üretin.`, { reply_markup: { inline_keyboard: [[
      ...is.resimler.map((_, i) => ({ text: `✅ ${i + 1}`, callback_data: `py:${is.hedef}:${i}` })),
      { text: `🔄 Yeniden (${para(GORSEL.fiyat * ADAY_SAYISI)})`, callback_data: `pr:${is.hedef}` },
    ]] } });
  }
  await kaydet(env, "pelin:deneme", d);
  await yaz(env, murat(env), "Not: Yapay zekâ (Claude dahil) yüzlerden kişi tanıyamaz ve \"ünlüye benziyor mu\" kontrolünü güvenilir yapamaz. Yüzler hiçbir gerçek kişi referans alınmadan, sadece yazıyla üretildi; son kontrol sizin gözünüz.");
}

async function yuzSecimi(env, cq) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Yüz onayı sadece Murat'ta.");
  const [islem, m, i] = cq.data.split(":");
  const d = await denemeOku(env);
  const y = d.yuzler[m];
  if (!y || y.secilen) return cevap(y ? "Zaten seçildi." : "Geçersiz.");
  if (islem === "pr") {
    await cevap("Maliyet önizlemesi geliyor");
    delete d.yuzler[m];
    d.isler = d.isler.filter((x) => !(x.adim === "yuz" && x.hedef === m));
    await kaydet(env, "pelin:deneme", d);
    return onizlemeGonder(env, "yuz", Math.floor(Date.now() / 1000));
  }
  y.secilen = y.adaylar[Number(i)];
  await kaydet(env, "pelin:deneme", d);
  await cevap("Seçildi");
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `✅ ${MANKENLER[m].ad}: ${Number(i) + 1}. aday seçildi. Bu yüz bundan sonra hep aynı kalacak.` });
  const kalan = Object.keys(MANKENLER).filter((x) => !(d.yuzler[x] && d.yuzler[x].secilen));
  if (kalan.length) return;
  d.asama = "aski";
  await kaydet(env, "pelin:deneme", d);
  const eksik = Object.keys(DENEME_MODELLERI).filter((k) => !d.modeller[k].aski.length);
  if (eksik.length) return yaz(env, murat(env), `🎉 3 yüz onaylandı.\nSıradaki: ${eksik.join(" ve ")} askı fotoğrafları. Beyaz ya da açık renk düz duvar önünde, askıda düz, gün ışığında, ürünün tamamı görünsün. "Dosya olarak" gönderin, yazısına "3592 askı" yazın. İsterseniz kumaş yakın çekimi: "3592 kumaş".`);
  return onizlemeGonder(env, "foto", Math.floor(Date.now() / 1000));
}

// (b) Başlangıç kareleri: askı fotoğrafıyla yan yana, "✅ Uygun / 🔄 Yeniden".
async function fotolariGonder(env, d) {
  for (const is of d.isler.filter((i) => i.adim === "foto" && !i.bildirildi)) {
    is.bildirildi = true;
    const kod = is.hedef;
    if (is.durum !== "hazir") { await yaz(env, murat(env), `⚠️ ${kod} başlangıç karesi üretilemedi: ${is.hata}`); continue; }
    d.modeller[kod].foto = is.resimler[0];
    const aski = d.modeller[kod].aski[0];
    await tg(env, "sendMediaGroup", { chat_id: murat(env), media: [
      { type: "photo", media: aski.file_id, caption: `${kod}: solda askı (gerçek), sağda başlangıç karesi. Videolar bu kareden üretilecek.` },
      { type: "photo", media: is.resimler[0] },
    ] });
    await yaz(env, murat(env), `${kod}: renk, desen ve kesim askıdakiyle aynı mı?`, { reply_markup: { inline_keyboard: [[
      { text: "✅ Aynı, devam", callback_data: `pf:${kod}` }, { text: `🔄 Yeniden (${para(GORSEL.fiyat)})`, callback_data: `pfr:${kod}` },
    ]] } });
  }
  await kaydet(env, "pelin:deneme", d);
}
async function fotoKarari(env, cq) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Murat.");
  const [islem, kod] = cq.data.split(":");
  const d = await denemeOku(env);
  const m = d.modeller[kod];
  if (!m || !m.foto || m.fotoOnay) return cevap("Geçersiz ya da zaten onaylandı.");
  if (islem === "pfr") {
    delete m.foto;
    d.isler = d.isler.filter((x) => !(x.adim === "foto" && x.hedef === kod));
    await kaydet(env, "pelin:deneme", d);
    await cevap("Maliyet önizlemesi geliyor");
    return onizlemeGonder(env, "foto", Math.floor(Date.now() / 1000));
  }
  m.fotoOnay = true;
  await kaydet(env, "pelin:deneme", d);
  await cevap("Onaylandı");
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `✅ ${kod} başlangıç karesi onaylandı.` });
  if (Object.keys(DENEME_MODELLERI).every((k) => d.modeller[k].fotoOnay)) return onizlemeGonder(env, "video", Math.floor(Date.now() / 1000));
}

// (c) Puanlama: her videodan 3 kare (başlangıç / orta / son) → Claude askı fotoğrafıyla karşılaştırır.
async function puanlamaBaslat(env, d, simdi) {
  for (const is of d.isler.filter((i) => i.adim === "video" && !i.bildirildi)) {
    is.bildirildi = true;
    const [kod, arac] = is.hedef.split(":");
    d.modeller[kod].videolar[arac] = is.durum === "hazir" ? { url: is.video, fiyat: is.fiyat } : { hata: is.hata, fiyat: 0 };
  }
  // Gerçek mankenli kanal videosu (Kemal kanaldan verir; tek kullanımlık anahtar ortak kayıtta).
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    const t = crypto.randomUUID().replace(/-/g, "");
    await env.KAYIT.put(`pelinvideo:${t}`, JSON.stringify({ kod }), { expirationTtl: 14 * 86400 });
    d.modeller[kod].videolar.gercek = { url: `${env.KEMAL_URL || "https://volonte-asistan.volonte.workers.dev"}/kanal-video/${t}`, fiyat: 0 };
  }
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    for (const [arac, v] of Object.entries(d.modeller[kod].videolar)) {
      if (!v.url) continue;
      for (const frame of ["first", "middle", "last"]) {
        const is = { adim: "kare", hedef: `${kod}:${arac}:${frame}`, uc: KARE.uc, fiyat: yuvarla(KARE.saniye * SURE_SN) };
        try {
          is.fal = await falGonder(env, KARE.uc, { video_url: v.url, frame_type: frame });
          is.durum = "gonderildi";
          is.zaman = simdi;
          await harcamaYaz(env, is.fiyat, simdi);
        } catch (e) { Object.assign(is, { durum: "hata", hata: String(e.message).slice(0, 200) }); }
        d.isler.push(is);
      }
    }
  }
  d.asama = "kare";
  await kaydet(env, "pelin:deneme", d);
  await yaz(env, murat(env), "🎬 Videolar hazır. Renk/desen/kesim puanlaması yapılıyor; birkaç dakika içinde kör test gelecek (size ve Hemra'ya).");
}

async function puanla(env, d, simdi) {
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    const m = d.modeller[kod];
    if (m.puan) continue;
    const kareler = {};
    for (const is of d.isler.filter((i) => i.adim === "kare" && i.hedef.startsWith(`${kod}:`) && i.durum === "hazir")) {
      const arac = is.hedef.split(":")[1];
      (kareler[arac] = kareler[arac] || []).push(is.resimler[0]);
    }
    m.puan = await claudePuan(env, kod, m, kareler, simdi).catch((e) => ({ hata: String(e.message).slice(0, 200) }));
    await kaydet(env, "pelin:deneme", d);
    return; // bir çalışmada bir model (süre)
  }
  d.asama = "oylama";
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    const v = d.modeller[kod].videolar;
    // Kanalda gerçek video bulunamadıysa (kare çıkmadı) kör testten düşer.
    if (v.gercek && !d.isler.some((i) => i.adim === "kare" && i.hedef.startsWith(`${kod}:gercek:`) && i.durum === "hazir")) v.gercek = { hata: "kanalda bu modelin videosu bulunamadı", fiyat: 0 };
    d.modeller[kod].harfler = harfDagit(Object.keys(v).filter((a) => v[a].url));
  }
  await kaydet(env, "pelin:deneme", d);
  for (const kisi of [murat(env), hemra(env)]) await korTestGonder(env, d, kisi);
}

async function claudePuan(env, kod, m, kareler, simdi) {
  const araclar = Object.keys(kareler);
  if (!env.ANTHROPIC_API_KEY || !araclar.length) return {};
  const model = BEYINLER.sonnet;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 90_000 });
  const icerik = [{ type: "text", text: `VOLONTE modeli ${kod}. Gerçek askı fotoğrafı:` }];
  for (const a of m.aski.slice(0, 2)) icerik.push({ type: "image", source: { type: "url", url: dosyaUrl(env, a.anahtar) } });
  araclar.forEach((a, i) => {
    icerik.push({ type: "text", text: `Video ${i + 1} (3 kare):` });
    for (const u of kareler[a]) icerik.push({ type: "image", source: { type: "url", url: u } });
  });
  icerik.push({ type: "text", text: "Her videodaki kıyafeti askıdaki gerçek kıyafetle karşılaştır. Renk (ton, parlaklık), desen (motif, büyüklük, yerleşim; düz kumaşta dikiş ve doku), kesim (boy, kol, yaka, detay) ne kadar aynı? Kareler arasında değişiyorsa (morphing) puan düşür. Çok titiz ol. Her video için 0-10 puan ve kısa Türkçe not." });
  const r = await client.messages.create({
    model, max_tokens: 3000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["videolar"], properties: { videolar: { type: "array", items: { type: "object", additionalProperties: false, required: ["no", "renk", "desen", "kesim", "not"], properties: { no: { type: "integer" }, renk: { type: "integer" }, desen: { type: "integer" }, kesim: { type: "integer" }, not: { type: "string" } } } } } } } },
    messages: [{ role: "user", content: icerik }],
  });
  await claudeHarcama(env, model, r.usage || {}, simdi);
  if (r.stop_reason === "refusal") return {};
  const j = JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  const sonuc = {};
  for (const p of j.videolar || []) if (araclar[p.no - 1]) sonuc[araclar[p.no - 1]] = { renk: p.renk, desen: p.desen, kesim: p.kesim, not: String(p.not || "").slice(0, 200) };
  return sonuc;
}

// Harfler karışık dağıtılır (kör test).
export function harfDagit(araclar, rastgele = Math.random) {
  const l = [...araclar];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rastgele() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return Object.fromEntries(l.map((a, i) => [String.fromCharCode(65 + i), a]));
}

async function korTestGonder(env, d, kisi) {
  await yaz(env, kisi, "🎬 Pelin — KÖR TEST. Her model için videolar harflerle (hangi araç olduğu ve maliyet oylamadan sonra açılır). Biri gerçek mankenli kanal videomuz. Telefonda izleyin, her model için en beğendiğinize 🏆 basın.");
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    const m = d.modeller[kod];
    await tg(env, "sendPhoto", { chat_id: kisi, photo: m.aski[0].file_id, caption: `${kod} (${DENEME_MODELLERI[kod].ad}) — gerçek askı fotoğrafı` });
    for (const [harf, arac] of Object.entries(m.harfler)) {
      const p = m.puan && m.puan[arac];
      const puan = p ? `renk ${p.renk}/10 · desen ${p.desen}/10 · kesim ${p.kesim}/10` : "puan yok";
      const r = await tg(env, "sendVideo", { chat_id: kisi, video: m.videolar[arac].url, caption: `${kod} · ${harf} · ${puan}`, supports_streaming: true });
      if (!r.ok) await yaz(env, kisi, `${kod} · ${harf}: video gönderilemedi (${r.description || "?"}).`);
    }
    await yaz(env, kisi, `${kod}: en iyisi hangisi?`, { reply_markup: { inline_keyboard: [Object.keys(m.harfler).map((h) => ({ text: `🏆 ${h}`, callback_data: `pv:${kod}:${h}` }))] } });
  }
  if (kisi === murat(env)) await yaz(env, kisi, "Oylar tamamlanınca sonuç kendiliğinden açılır. Beklemeden açmak için:", { reply_markup: { inline_keyboard: [[{ text: "🔓 Sonucu göster", callback_data: "pa" }]] } });
}

async function oyVer(env, cq) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!oylayan(env, cq.from.id)) return cevap("Oylamayı Murat ve Hemra yapar.");
  const d = await denemeOku(env);
  if (cq.data === "pa") {
    if (!muratMi(env, cq.from.id)) return cevap("Sadece Murat.");
    await cevap("Açılıyor");
    return sonucAc(env, d);
  }
  const [, kod, harf] = cq.data.split(":");
  const m = d.modeller[kod];
  if (!m || !m.harfler || !m.harfler[harf] || d.asama !== "oylama") return cevap("Oylama kapalı.");
  m.oylar[muratMi(env, cq.from.id) ? murat(env) : String(cq.from.id)] = harf; // Murat hangi hesabından oylarsa oylasın
  await kaydet(env, "pelin:deneme", d);
  await cevap(`Oyunuz: ${kod} → ${harf}`);
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${kod}: oyunuz 🏆 ${harf} (değiştirmek için tekrar basabilirsiniz)`, reply_markup: { inline_keyboard: [Object.keys(m.harfler).map((h) => ({ text: `${h === harf ? "✓ " : ""}🏆 ${h}`, callback_data: `pv:${kod}:${h}` }))] } });
  const tamam = Object.keys(DENEME_MODELLERI).every((k) => [murat(env), hemra(env)].every((k2) => d.modeller[k].oylar[k2]));
  if (tamam) return sonucAc(env, d);
}

export function sonucMetni(d, env) {
  const satir = ["🔓 KÖR TEST SONUCU"];
  for (const kod of Object.keys(DENEME_MODELLERI)) {
    const m = d.modeller[kod];
    satir.push("", `${kod} (${DENEME_MODELLERI[kod].ad}, ${MANKENLER[DENEME_MODELLERI[kod].manken].ad} manken):`);
    for (const [harf, arac] of Object.entries(m.harfler || {})) {
      const p = m.puan && m.puan[arac];
      const oy = Object.entries(m.oylar).filter(([, h]) => h === harf).map(([k]) => (k === murat(env) ? "Murat" : "Hemra"));
      satir.push(`${harf} = ${arac === "gercek" ? "Gerçek kanal videosu" : ARACLAR[arac].ad} · ${arac === "gercek" ? "—" : para(m.videolar[arac].fiyat)} · ${p ? `renk ${p.renk} desen ${p.desen} kesim ${p.kesim}${p.not ? ` (${p.not})` : ""}` : "puan yok"}${oy.length ? ` · 🏆 ${oy.join(" + ")}` : ""}`);
    }
    for (const [arac, v] of Object.entries(m.videolar || {})) if (v.hata) satir.push(`(${ARACLAR[arac] ? `${ARACLAR[arac].ad}: üretilemedi` : "Gerçek video"} — ${v.hata})`);
  }
  satir.push("", "Kazananı siz seçin; temel aşama seçilen araçla kurulacak.");
  return satir.join("\n");
}
async function sonucAc(env, d) {
  if (d.asama === "bitti") return;
  d.asama = "bitti";
  await kaydet(env, "pelin:deneme", d);
  const metin = sonucMetni(d, env);
  for (const kisi of [murat(env), hemra(env)]) await yaz(env, kisi, metin);
}

// ---------- Dosyalar: askı fotoğrafı (Telegram) → fal ve Claude için geçici adres ----------
export const dosyaUrl = (env, anahtar) => `${env.SELF_URL}/dosya/${anahtar}`;
async function dosyaVer(env, anahtar) {
  const k = await oku(env, `pelindosya:${anahtar}`, null);
  if (!k) return new Response("yok", { status: 404 });
  const f = await tg(env, "getFile", { file_id: k.file_id });
  if (!f.ok) return new Response("yok", { status: 404 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Response(r.body, { headers: { "content-type": k.tur || "image/jpeg", "cache-control": "private, max-age=3600" } });
}

// "3592 askı" / "3577 kumaş" yazılı fotoğraf (ya da dosya) → kayıt.
async function fotoAl(env, m) {
  const foto = m.photo ? m.photo[m.photo.length - 1] : m.document && /^image\//.test(m.document.mime_type || "") ? m.document : null;
  if (!foto) return false;
  const yazi = String(m.caption || "").toLocaleLowerCase("tr");
  const kod = (yazi.match(/\b(\d{3,6})\b/) || [])[1];
  const rol = /kumaş|kumas/.test(yazi) ? "kumas" : "aski";
  if (!kod) { await yaz(env, m.chat.id, "Fotoğrafın yazısına model kodunu yazın: \"3592 askı\" ya da \"3592 kumaş\"."); return true; }
  const d = await denemeOku(env);
  if (!d.modeller[kod]) { await yaz(env, m.chat.id, `${kod} denemede yok (deneme: ${Object.keys(DENEME_MODELLERI).join(", ")}). Kaydettim ama denemede kullanılmaz.`); }
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await kaydet(env, `pelindosya:${anahtar}`, { file_id: foto.file_id, tur: m.document ? m.document.mime_type : "image/jpeg" }, 60 * 86400);
  if (d.modeller[kod]) {
    const l = d.modeller[kod].aski;
    if (rol === "aski") l.unshift({ file_id: foto.file_id, anahtar, rol }); else l.push({ file_id: foto.file_id, anahtar, rol });
    await kaydet(env, "pelin:deneme", d);
  }
  await yaz(env, m.chat.id, `✅ ${kod} ${rol === "aski" ? "askı" : "kumaş"} fotoğrafı alındı.${m.photo ? " (İpucu: \"Dosya olarak\" gönderirseniz renk ve doku daha net kalır.)" : ""}`);
  if (d.asama === "aski" && Object.keys(DENEME_MODELLERI).every((k) => d.modeller[k].aski.some((a) => a.rol === "aski"))) await onizlemeGonder(env, "foto", Math.floor(Date.now() / 1000));
  return true;
}

// ---------- Sohbet (Claude; komutsuz) ----------
const SISTEM = `Sen Pelin'sin: VOLONTE'nin (İstanbul Laleli, kaliteli kadın giyim toptancısı; ana pazar Afrika, dünya geneli) görsel ve video yapımcısı. Hollywood seviyesinde bir yapımcı gibi düşünürsün: ışık, kadraj, hareket, müzik, ilk 2 saniyede dikkat çekme, Telegram/Instagram/WhatsApp için dikey video.
Sade, kısa, samimi Türkçe konuş (Rusça yazılırsa Rusça). Sohbet gibi konuş: soru sor, fikir ver, daha iyi bir yol görürsen söyle. Komut bekleme.
Kesin kurallar (asla esnemez): kıyafetin rengi, deseni ve kesimi asla değişmez; manken yüzleri hep aynı; fiyat, maliyet, alış fiyatı, kâr ve stok hiçbir görsele/yazıya girmez; videoya AI notu basılmaz; model kodu VOLONTE yazısının altında ya da üstünde net okunur (paketlemede eklenir). Onaysız harcama yok: her üretimden önce maliyet önizlemesi gider, sadece Murat onaylar. Para harcayan bir işi sen başlatamazsın; sadece "onizleme_gonder" ile maliyet kartını gönderebilirsin.
Üretim akışı (2 Kasım, Patron): /kurulum → 3 manken yüzü + 3 ortam önerisi, Patron seçer, kalıcı kaydedilir. /uret <kod> → ürün fotoğrafı (site ya da Hemra'nın "<kod>" yazılı fotoğrafı) → sabit yüzle fotoğraf → aynı fotoğraftan 6 sn video → kalite kontrol (sen + ikinci göz OpenAI) → renk/desen/kesim farkı varsa otomatik yeniden; 2 denemede olmazsa Patron'a ⚠️ → Patron [✅ Onayla] [🔄 Yeniden üret] [❌ İptal] → onaylanınca Selin siteye, Kemal kanala. /maliyettesti 5 kod → model başı maliyet raporu. Örnek video ("bunun gibi yap, 3557"): kamera, ışık, hız, poz ve ortam havasını tarif olarak çıkarırsın; birebir kopya yok, başkasının yüzü/logosu/müziği yok; beğenilen tarif şablon olur (/sablonlar).
Yapay zekâ yüzden kişi tanıyamaz; "ünlüye benziyor mu" kontrolünü kullanıcının gözü yapar — bunu dürüstçe söyle.`;

const ARAC_ONIZLEME = { name: "onizleme_gonder", description: "Murat'a bir sonraki üretim adımının maliyet önizlemesini (✅ Onayla / ❌ İptal düğmeli) gönderir. Para harcamaz.", strict: true,
  input_schema: { type: "object", additionalProperties: false, required: ["adim"], properties: { adim: { type: "string", enum: ["yuz", "foto", "video"] } } } };

async function durumMetni(env, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const anahtar = `Anahtarlar: BOT ✅ · FAL ${env.FAL_KEY ? "✅" : "❌"} · ANTHROPIC ${env.ANTHROPIC_API_KEY ? "✅" : "❌"} · OPENAI ${env.OPENAI_API_KEY ? "✅" : "❌ (ikinci göz kapalı)"}.`;
  const kur = secim ? `Kurulum: yüz ${MANKENLER[secim.yuz.manken].ad}, ortam ${secim.ortamlar.map((x) => x.ad).join(", ")}, video ${ARACLAR[secim.arac || "veo"].ad}.` : "Kurulum: yapılmadı (/kurulum).";
  const d = await denemeOku(env);
  if (secim || (d.asama === "fal" && !env.FAL_KEY)) return `${anahtar} ${kur} Bu ay harcanan: ${para(await buAyHarcanan(env, simdi))} / ${AYLIK_SINIR_USD} $. Beyin: ${(await env.KAYIT.get("pelin:beyin")) || "sonnet"}.`;
  const yuz = Object.keys(MANKENLER).map((m) => `${MANKENLER[m].ad}: ${d.yuzler[m] && d.yuzler[m].secilen ? "onaylı" : d.yuzler[m] ? "aday bekliyor" : "yok"}`).join(", ");
  const mod = Object.keys(DENEME_MODELLERI).map((k) => `${k}: askı ${d.modeller[k].aski.length ? "var" : "yok"}, kare ${d.modeller[k].fotoOnay ? "onaylı" : d.modeller[k].foto ? "bekliyor" : "yok"}`).join("; ");
  return `Aşama: ${d.asama}${d.asama === "fal" ? " (fal hazır bekleniyor)" : ""}. FAL_KEY: ${env.FAL_KEY ? "var" : "yok"}. Yüzler: ${yuz}. Modeller: ${mod}. Devam eden iş: ${d.isler.filter((i) => i.durum === "gonderildi").length}. Bu ay harcanan: ${para(await buAyHarcanan(env, simdi))} / ${AYLIK_SINIR_USD} $. Beyin: ${(await env.KAYIT.get("pelin:beyin")) || "sonnet"}.`;
}

async function sohbet(env, m, simdi) {
  if (!env.ANTHROPIC_API_KEY) return yaz(env, m.chat.id, "Beynim (ANTHROPIC_API_KEY) henüz bağlı değil. /durum ile durumu görebilirsiniz.");
  const gun = new Date((simdi + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
  const sayi = Number((await env.KAYIT.get(`pelin:ai:${gun}`)) || 0);
  if (sayi >= GUNLUK_SOHBET) return yaz(env, m.chat.id, "Bugünkü sohbet sınırı doldu; yarın devam edelim.");
  if ((await buAyHarcanan(env, simdi)) >= AYLIK_SINIR_USD) return yaz(env, m.chat.id, `Bu ayın ${AYLIK_SINIR_USD} $ sınırı doldu; gelecek ay devam ederim.`);
  await env.KAYIT.put(`pelin:ai:${gun}`, String(sayi + 1), { expirationTtl: 3 * 86400 });
  await tg(env, "sendChatAction", { chat_id: m.chat.id, action: "typing" });
  const model = BEYINLER[(await env.KAYIT.get("pelin:beyin")) || "sonnet"] || BEYINLER.sonnet;
  const gecmis = await oku(env, `pelin:sohbet:${m.from.id}`, []);
  const mesajlar = [...gecmis, { role: "user", content: String(m.text).slice(0, 2000) }];
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
  const sistem = [{ type: "text", text: SISTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: `Şu anki durum: ${await durumMetni(env, simdi)}\nKonuşan: ${m.from.first_name || ""} (${yonetici(env, m.from.id) ? "yönetici" : "ekip"}).` }];
  let cevapMetni = "";
  for (let tur = 0; tur < 3; tur++) {
    const r = await client.messages.create({ model, max_tokens: 2000, system: sistem, tools: [ARAC_ONIZLEME], output_config: { effort: "low" }, messages: mesajlar });
    await claudeHarcama(env, model, r.usage || {}, simdi);
    const metin = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (metin) cevapMetni = metin;
    const araclar = r.content.filter((b) => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !araclar.length) break;
    mesajlar.push({ role: "assistant", content: r.content });
    const sonuclar = [];
    for (const a of araclar) {
      await onizlemeGonder(env, a.input.adim, simdi);
      sonuclar.push({ type: "tool_result", tool_use_id: a.id, content: "Önizleme Murat'a gönderildi (onaylarsa başlar)." });
    }
    mesajlar.push({ role: "user", content: sonuclar });
  }
  if (cevapMetni) await yaz(env, m.chat.id, cevapMetni.slice(0, 4000));
  const yeniGecmis = [...gecmis, { role: "user", content: String(m.text).slice(0, 2000) }, { role: "assistant", content: (cevapMetni || "…").slice(0, 2000) }].slice(-10);
  await kaydet(env, `pelin:sohbet:${m.from.id}`, yeniGecmis, 2 * 86400);
}

// ---------- Güncellemeler ----------
const kisiAdi = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "Biri";

export async function guncelleme(u, env) {
  const simdi = Math.floor(Date.now() / 1000);
  if (u.callback_query) {
    const cq = u.callback_query;
    const v = String(cq.data || "");
    if (/^(po|pi):/.test(v)) return onizlemeKarari(env, cq, simdi);
    if (/^(py|pr):/.test(v)) return yuzSecimi(env, cq);
    if (/^(pf|pfr):/.test(v)) return fotoKarari(env, cq);
    if (/^pv:/.test(v) || v === "pa") return oyVer(env, cq);
    if (/^pk:/.test(v)) return kurulumDugmesi(env, cq, simdi);
    if (/^pu:/.test(v)) return uretimDugmesi(env, cq, simdi);
    if (/^ps:/.test(v)) return sablonDugmesi(env, cq, simdi);
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Geçersiz düğme." });
  }
  const m = u.message;
  if (!m || m.chat.type !== "private" || !m.from) return;
  const id = String(m.from.id);
  if (!yonetici(env, id) && !oylayan(env, id)) {
    await env.KAYIT.put(`pelin:bekleyen:${id}`, JSON.stringify({ ad: kisiAdi(m.from), zaman: m.date }), { expirationTtl: 7 * 86400 });
    return;
  }
  if (await ornekVideo(env, m, simdi)) return;
  if (await urunFotoAl(env, m)) return;
  if (await fotoAl(env, m)) return;
  const metin = String(m.text || "").trim();
  if (!metin) return;
  const komut = metin.split(/[\s@]/)[0].toLowerCase();
  if (komut === "/start") return yaz(env, m.chat.id, `Merhaba ${m.from.first_name || ""}! Ben Pelin, VOLONTE'nin görsel ve video yapımcısıyım. Benimle normal konuşabilirsiniz. Para harcayan her iş önce maliyet önizlemesiyle Murat'ın onayına gelir.`);
  if (komut === "/durum") return yaz(env, m.chat.id, await durumMetni(env, simdi));
  if (komut === "/kurulum") return kurulumKomutu(env, m, simdi);
  if (komut === "/uret") return uretKomutu(env, m, simdi);
  if (komut === "/maliyettesti") return uretKomutu(env, m, simdi, true);
  if (komut === "/sablonlar") { const s = await oku(env, "pelin:sablonlar", {}); return yaz(env, m.chat.id, Object.keys(s).length ? ["Kayıtlı şablonlar:", ...Object.values(s).map((x) => `• ${x.ad}: ${x.ozet}`), "Kullanım: /uret 3557 şablon:ad"].join("\n") : "Henüz şablon yok. Örnek videoyu \"bunun gibi yap, 3557\" yazısıyla atın."); }
  if (komut === "/arac") {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "Bu ayar sadece Patron'da.");
    const a = (metin.split(/\s+/)[1] || "").toLowerCase();
    const secim = await oku(env, "pelin:secim", null);
    if (!ARACLAR[a] || !secim) return yaz(env, m.chat.id, `Video aracı: ${secim ? ARACLAR[secim.arac || "veo"].ad : "(önce /kurulum)"}. Değiştirmek: /arac veo | kling | seedance`);
    secim.arac = a; await kaydet(env, "pelin:secim", secim);
    return yaz(env, m.chat.id, `🎬 Video aracı: ${ARACLAR[a].ad} (${para(ARACLAR[a].saniye * URETIM_SN)} / ${URETIM_SN} sn).`);
  }
  if (komut === "/beyin") {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "Bu ayar sadece Murat'ta.");
    const sec = (metin.split(/\s+/)[1] || "").toLowerCase();
    if (!BEYINLER[sec]) return yaz(env, m.chat.id, `Şu an: ${(await env.KAYIT.get("pelin:beyin")) || "sonnet"}. Değiştirmek için: /beyin opus ya da /beyin sonnet`);
    await env.KAYIT.put("pelin:beyin", sec);
    return yaz(env, m.chat.id, `🧠 Beyin: ${sec === "opus" ? "Opus (daha güçlü, ~2 kat pahalı)" : "Sonnet"}.`);
  }
  if (/^fal\s+haz[ıi]r\b/i.test(metin)) {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "\"fal hazır\" onayını Murat verir.");
    if (!env.FAL_KEY) return yaz(env, m.chat.id, "FAL_KEY henüz görünmüyor. Cloudflare → Workers & Pages → volonte-pelin → Settings → Variables and Secrets → Add → Type: Secret, Name: FAL_KEY → Deploy. Sonra tekrar \"fal hazır\" yazın.");
    const d = await denemeOku(env);
    if (d.asama === "fal") d.asama = "hazir";
    await kaydet(env, "pelin:deneme", d);
    await yaz(env, m.chat.id, "👍 fal hazır. İlk adım: 3 manken yüzü. Maliyet önizlemesi geliyor; onaylarsanız başlarım.");
    return onizlemeGonder(env, "yuz", simdi);
  }
  if (metin.startsWith("/")) return yaz(env, m.chat.id, "Komutlar: /durum · /kurulum · /uret 3557 · /maliyettesti 5 kod · /sablonlar · /arac · /beyin. Örnek video: dosyayı \"bunun gibi yap, 3557\" yazısıyla atın. Gerisi için normal yazın.");
  return sohbet(env, m, simdi);
}

async function webhookKur(env) {
  if (!env.SELF_URL || !env.BOT_TOKEN) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  if (b.ok && b.result.url === hedef) return;
  const r = await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 1 });
  await env.KAYIT.put("pelin:webhook", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), ok: r.ok, hata: r.description || null }));
}

// ---------- Worker + Durable Object ----------
function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}
const nesne = (env) => env.PELIN.get(env.PELIN.idFromName("pelin"), { locationHint: "enam" });

export class PelinDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(istek) {
    const yol = new URL(istek.url).pathname;
    const env = { ...this.env, KAYIT: karmaDepo(this.env.KAYIT, this.state.storage, PELIN_YEREL) };
    try {
      if (yol === "/guncelleme") await guncelleme(await istek.json(), env);
      else if (yol === "/cron") await pelinCron(env, Math.floor(Date.now() / 1000));
    } catch (e) {
      await this.env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), yol, hata: String(e && e.message).slice(0, 400) }), { expirationTtl: 7 * 86400 });
    }
    return new Response("ok");
  }
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      const govde = await istek.text();
      if (env.PELIN) await nesne(env).fetch("https://pelin/guncelleme", { method: "POST", body: govde });
      else await guncelleme(JSON.parse(govde), env);
      return new Response("ok");
    }
    if (istek.method === "GET" && /^\/dosya\/[a-f0-9]{32}$/.test(url.pathname)) return dosyaVer(env, url.pathname.split("/")[2]);
    return new Response("Pelin çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    try { await patronDenemesi(env, "Pelin", tg); } catch { /* */ }
    if (env.PELIN) await nesne(env).fetch("https://pelin/cron", { method: "POST" });
    else await pelinCron(env, Math.floor(Date.now() / 1000));
  },
};

// =====================================================================================================================
// ÜRETİM (2 Kasım, Patron): ürün fotoğrafı → Pelin sahneyi yazar → fal'da SABİT manken yüzüyle fotoğraf → aynı fotoğraftan
// video → kalite kontrol (Pelin/Claude + ikinci göz OpenAI) → Patron'a önizleme [✅ Onayla] [🔄 Yeniden üret] [❌ İptal]
// → onaylanınca teslim kuyruğu ("venom:pelinTeslim": Selin siteye, Kemal kanala).
// KESİN: renk, desen, kesim ASLA değişmez; yüz sabit; kontrol renk/desen/kesim farkı görürse otomatik yeniden üretir,
// 2 denemede olmazsa Patron'a ⚠️. Fiyat, maliyet, stok hiçbir çıktıda yok. Para harcayan her iş Patron onaylı.
// =====================================================================================================================
const URETIM_SN = 6;
const URETIM_DENEME = 2;
const OPENAI_TAHMIN = 0.01; // görsel karşılaştırma başına (yaklaşık)
const KONTROL_TAHMIN = 0.03; // Claude görsel karşılaştırma başına (yaklaşık; gerçek harcama kullanımdan yazılır)
const ORTAM_ONERI = "retro 80'ler; siyah-altın (VOLONTE marka renkleri); \"Live your life\" (özgür, şehirde yaşayan kadın); mutluluk/neşe";
const SITE = "https://www.wearvolonte.com";
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const dosyaAdresi = (env, anahtar) => `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/dosya/${anahtar}`;
async function dosyaKaydet(env, fileId, tur, ttl) {
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await kaydet(env, `pelindosya:${anahtar}`, { file_id: fileId, tur }, ttl);
  return anahtar;
}
export function uretimMaliyeti(arac = "veo") {
  const kalemler = [
    { ad: "Fotoğraf (sabit yüz + ürün, Nano Banana Pro)", birim: GORSEL.fiyat },
    { ad: `Video ${URETIM_SN} sn (${ARACLAR[arac].ad})`, birim: yuvarla(ARACLAR[arac].saniye * URETIM_SN) },
    { ad: "Kalite kontrol (Claude + OpenAI, foto + 3 video karesi)", birim: yuvarla(2 * (KONTROL_TAHMIN + OPENAI_TAHMIN) + 3 * KARE.saniye * URETIM_SN) },
  ];
  return { kalemler, toplam: yuvarla(kalemler.reduce((s, k) => s + k.birim, 0)) };
}

async function claudeJson(env, content, schema, simdi, maxTokens = 1200) {
  const model = BEYINLER[(await env.KAYIT.get("pelin:beyin")) || "sonnet"] || BEYINLER.sonnet;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
  const r = await client.messages.create({ model, max_tokens: maxTokens, output_config: { effort: "low", format: { type: "json_schema", schema } }, messages: [{ role: "user", content }] });
  await claudeHarcama(env, model, r.usage || {}, simdi);
  return JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}
const resimUrl = (url) => ({ type: "image", source: { type: "url", url } });

// ---------- Kalite kontrol: renk / desen / kesim (Claude + ikinci göz OpenAI) ----------
const KONTROL_SORU = "İlk görsel(ler) ÜRÜNÜN gerçek fotoğrafı, son görsel(ler) yapay zekâ ile üretilmiş manken görseli. Üretilen görseldeki kıyafet ürünle BİREBİR aynı mı? Renk (ton dahil), desen (motif, boyut, yerleşim) ve kesim (boy, kol, yaka, etek, detaylar) ayrı ayrı değerlendir. Küçük ışık farkı sorun değil; renk tonu kayması, desen değişmesi/sadeleşmesi, kesim farkı SORUNDUR. Şüphedeysen geçme. Ayrıca görselde yazı, logo, filigran varsa sorun yaz.";
const KONTROL_SEMA = { type: "object", additionalProperties: false, required: ["renk_ayni", "desen_ayni", "kesim_ayni", "sorunlar"], properties: { renk_ayni: { type: "boolean" }, desen_ayni: { type: "boolean" }, kesim_ayni: { type: "boolean" }, sorunlar: { type: "array", items: { type: "string" } } } };
async function openaiKontrol(env, urunler, uretilen, simdi) {
  if (!env.OPENAI_API_KEY) return null;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-4.1-mini", response_format: { type: "json_object" }, max_tokens: 500,
      messages: [{ role: "user", content: [
        { type: "text", text: `${KONTROL_SORU} Yanıtı sadece JSON ver: {"renk_ayni":bool,"desen_ayni":bool,"kesim_ayni":bool,"sorunlar":[kısa Türkçe]}` },
        ...urunler.map((u) => ({ type: "image_url", image_url: { url: u } })), ...uretilen.map((u) => ({ type: "image_url", image_url: { url: u } })),
      ] }] }),
  });
  const j = await r.json().catch(() => ({}));
  await harcamaYaz(env, OPENAI_TAHMIN, simdi, "openai");
  if (!r.ok) return { hata: `OpenAI ${r.status}: ${JSON.stringify(j.error || j).slice(0, 160)}` };
  try { return JSON.parse(j.choices[0].message.content); } catch { return { hata: "OpenAI yanıtı okunamadı" }; }
}
export async function kaliteKontrol(env, urunler, uretilen, simdi) {
  const gec = (x) => x && !x.hata && x.renk_ayni && x.desen_ayni && x.kesim_ayni;
  const claude = await claudeJson(env, [{ type: "text", text: "ÜRÜN (gerçek):" }, ...urunler.map(resimUrl), { type: "text", text: "ÜRETİLEN:" }, ...uretilen.map(resimUrl), { type: "text", text: KONTROL_SORU }], KONTROL_SEMA, simdi, 600);
  const openai = await openaiKontrol(env, urunler, uretilen, simdi).catch((e) => ({ hata: String(e.message).slice(0, 160) }));
  const sorunlar = [...(claude.sorunlar || []).map((s) => `Pelin: ${s}`), ...((openai && openai.sorunlar) || []).map((s) => `İkinci göz: ${s}`)];
  return { gecti: gec(claude) && (openai === null || openai.hata ? true : gec(openai)), claude: gec(claude), openai: openai === null ? "yok" : openai.hata ? `hata (${openai.hata})` : gec(openai), sorunlar };
}

// ---------- Kurulum: 3 manken yüzü + 3 ortam önerisi → Patron seçer → kalıcı ("pelin:secim") ----------
async function kurulumKomutu(env, m, simdi) {
  if (!muratMi(env, m.from.id)) return yaz(env, m.chat.id, "Kurulum sadece Patron'da.");
  if (!env.FAL_KEY || !env.ANTHROPIC_API_KEY) return yaz(env, m.chat.id, "Önce anahtarlar: FAL_KEY ve ANTHROPIC_API_KEY Cloudflare'e girilmeli (/durum).");
  const fiyat = yuvarla(GORSEL.fiyat * Object.keys(MANKENLER).length);
  return yaz(env, m.chat.id, `💰 Kurulum: 3 manken yüzü (${Object.keys(MANKENLER).length} × ${para(GORSEL.fiyat)} = ${para(fiyat)}) + 3 ortam önerisi (yazı). Bu ay Pelin: ${para(await buAyHarcanan(env, simdi))} / ${AYLIK_SINIR_USD} $. Başlayayım mı?`,
    { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: "pk:o" }, { text: "❌ İptal", callback_data: "pk:x" }]] } });
}
async function kurulumBaslat(env, simdi) {
  const k = { isler: [], ortamlar: [], secilenOrtam: [], secilenYuz: null, zaman: simdi };
  for (const mk of Object.keys(MANKENLER)) {
    const is = { manken: mk, durum: "hata" };
    try { is.fal = await falGonder(env, GORSEL.metin, { prompt: YUZ_ISTEMI(MANKENLER[mk]), num_images: 1, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" }); is.durum = "gonderildi"; await harcamaYaz(env, GORSEL.fiyat, simdi); }
    catch (e) { is.hata = String(e.message).slice(0, 200); }
    k.isler.push(is);
  }
  const o = await claudeJson(env, [{ type: "text", text: `VOLONTE (İstanbul, kaliteli kadın giyim; Afrika ve dünya pazarı; marka rengi siyah + altın, slogan "Live your life") için ürün fotoğraf/video ORTAMI öner. Tam 3 öneri; şu yönlerden esinlen: ${ORTAM_ONERI}. Her biri: ad (kısa Türkçe), aciklama (1 cümle Türkçe), sahne (İngilizce, görsel üretim için arka plan + ışık + hava tarifi; kıyafeti DEĞİŞTİRMEYEN, yazı/logo/marka içermeyen), hareket (İngilizce, 6 sn video için kamera + manken hareketi).` }],
    { type: "object", additionalProperties: false, required: ["ortamlar"], properties: { ortamlar: { type: "array", items: { type: "object", additionalProperties: false, required: ["ad", "aciklama", "sahne", "hareket"], properties: { ad: { type: "string" }, aciklama: { type: "string" }, sahne: { type: "string" }, hareket: { type: "string" } } } } } }, simdi);
  k.ortamlar = (o.ortamlar || []).slice(0, 3).map((x, i) => ({ id: String(i + 1), ...x }));
  await kaydet(env, "pelin:kurulum", k);
  await yaz(env, murat(env), ["🎨 Ortam önerileri (birden fazla seçebilirsiniz):", ...k.ortamlar.map((x) => `${x.id}) ${x.ad} — ${x.aciklama}`), "Yüzler birkaç dakika içinde geliyor."].join("\n"), { reply_markup: ortamKlavye(k) });
}
const ortamKlavye = (k) => ({ inline_keyboard: [k.ortamlar.map((x) => ({ text: `${k.secilenOrtam.includes(x.id) ? "☑️" : "⬜"} ${x.id}) ${x.ad}`.slice(0, 40), callback_data: `pk:t:${x.id}` })), [{ text: "💾 Seçimi kaydet", callback_data: "pk:k" }]] });
async function kurulumCron(env, simdi) {
  const k = await oku(env, "pelin:kurulum", null);
  if (!k || k.yuzGonderildi) return;
  let degisti = false;
  for (const is of k.isler.filter((i) => i.durum === "gonderildi")) {
    const s = await falDurum(env, is.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti) continue;
    if (s.hata) { Object.assign(is, { durum: "hata", hata: s.hata }); await harcamaYaz(env, -GORSEL.fiyat, simdi); } else Object.assign(is, { durum: "hazir", url: s.resimler[0] });
    degisti = true;
  }
  if (k.isler.some((i) => i.durum === "gonderildi")) { if (degisti) await kaydet(env, "pelin:kurulum", k); return; }
  const hazir = k.isler.filter((i) => i.durum === "hazir");
  k.yuzGonderildi = true;
  if (hazir.length) {
    const r = await tg(env, "sendMediaGroup", { chat_id: murat(env), media: hazir.map((x, i) => ({ type: "photo", media: x.url, caption: i === 0 ? "👤 Manken yüzü önerileri — birini seçin; bu yüz bundan sonra hep aynı kalacak." : undefined })) });
    if (r.ok && Array.isArray(r.result)) r.result.forEach((msg, i) => { if (msg.photo) hazir[i].fileId = msg.photo[msg.photo.length - 1].file_id; });
    await yaz(env, murat(env), "Hangi yüz? (Ünlüye ya da tanıdığınız birine benziyorsa seçmeyin.)", { reply_markup: { inline_keyboard: [[...hazir.map((x, i) => ({ text: `👤 ${i + 1}) ${MANKENLER[x.manken].ad}`.slice(0, 30), callback_data: `pk:y:${x.manken}` }))]] } });
  }
  const hatali = k.isler.filter((i) => i.durum === "hata");
  if (hatali.length) await yaz(env, murat(env), `⚠️ ${hatali.length} yüz üretilemedi (ücret alınmaz): ${hatali.map((x) => x.hata).join(" · ").slice(0, 300)}`);
  await kaydet(env, "pelin:kurulum", k);
}
async function kurulumDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, deger] = cq.data.split(":");
  if (islem === "x") { await cevap("İptal"); return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); }
  if (islem === "o") {
    await cevap("Başlıyorum"); await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
    return kurulumBaslat(env, simdi);
  }
  const k = await oku(env, "pelin:kurulum", null);
  if (!k) return cevap("Kurulum bulunamadı.");
  if (islem === "t") {
    k.secilenOrtam = k.secilenOrtam.includes(deger) ? k.secilenOrtam.filter((x) => x !== deger) : [...k.secilenOrtam, deger];
    await kaydet(env, "pelin:kurulum", k); await cevap("Tamam");
    return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: ortamKlavye(k) });
  }
  if (islem === "y") {
    const y = k.isler.find((x) => x.manken === deger && x.durum === "hazir");
    if (!y || !y.fileId) return cevap("Bu yüz bulunamadı.");
    k.secilenYuz = deger; await kaydet(env, "pelin:kurulum", k); await cevap("Seçildi");
    await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `✅ Yüz seçildi: ${MANKENLER[deger].ad}.${k.secilenOrtam.length ? "" : " Şimdi ortam(lar)ı seçip 💾 Kaydet'e basın."}` });
  }
  if (islem === "k" || islem === "y") {
    if (!k.secilenYuz || !k.secilenOrtam.length) return islem === "k" ? cevap(!k.secilenYuz ? "Önce yüz seçin." : "En az bir ortam seçin.") : null;
    const y = k.isler.find((x) => x.manken === k.secilenYuz);
    const anahtar = await dosyaKaydet(env, y.fileId, "image/jpeg");
    const secim = { yuz: { manken: k.secilenYuz, fileId: y.fileId, anahtar }, ortamlar: k.ortamlar.filter((x) => k.secilenOrtam.includes(x.id)), arac: ((await oku(env, "pelin:secim", null)) || {}).arac || "veo", zaman: simdi };
    await kaydet(env, "pelin:secim", secim);
    if (islem === "k") await cevap("Kaydedildi");
    return yaz(env, murat(env), `💾 Kalıcı seçim kaydedildi: yüz ${MANKENLER[secim.yuz.manken].ad}; ortam: ${secim.ortamlar.map((x) => x.ad).join(", ")}. Üretim için: /uret 3557 (birden fazla kod yazılabilir). Maliyet testi: /maliyettesti 3557 3592 3577 3601 3602`);
  }
}

// ---------- Üretim ----------
async function urunFotolari(env, kod) {
  const elle = await oku(env, `pelin:urunfoto:${kod}`, []);
  if (elle.length) return elle.slice(0, 3).map((a) => dosyaAdresi(env, a));
  const { liste } = await siteVerisi(env).catch(() => ({ liste: [] }));
  const u = (liste || []).find((x) => String(x.kod) === String(kod));
  return u ? (u.fotolar || []).filter((f) => /^galeri\//.test(f)).slice(0, 3).map((f) => `${SITE}/${f}`) : [];
}
const uretimFotoIstemi = (ortam, sablon) => `${FOTO_ISTEMI.replace("clean light studio background, soft natural light", "")} Setting: ${ortam ? ortam.sahne : "clean light studio background, soft natural light"}.${sablon ? ` Mood and lighting reference (do not copy any real person, logo or text): ${sablon.isik}; ${sablon.ortam_havasi}.` : ""} The garment is the most important thing: keep it 100% identical to the product photos.`;
const uretimVideoIstemi = (ortam, sablon) => `${sablon ? `${sablon.kamera}. ${sablon.poz}. ${sablon.hiz}.` : ortam ? ortam.hareket : VIDEO_ISTEMI} The woman's face stays the same. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no text, no logo, no watermark, no music.`;

async function uretKomutu(env, m, simdi, test = false) {
  if (!muratMi(env, m.from.id)) return yaz(env, m.chat.id, "Üretimi sadece Patron başlatır.");
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return yaz(env, m.chat.id, "Önce kurulum: /kurulum (yüz + ortam seçimi).");
  const sozler = String(m.text || "").split(/\s+/).slice(1);
  const kodlar = [...new Set(sozler.filter((x) => /^\d{3,6}$/.test(x)))].slice(0, test ? 5 : 40);
  const sablonAd = (sozler.find((x) => /^şablon:|^sablon:/i.test(x)) || "").split(":")[1] || null;
  if (!kodlar.length) return yaz(env, m.chat.id, test ? "Kullanım: /maliyettesti 3557 3592 3577 3601 3602 (5 model)" : "Kullanım: /uret 3557 [3592 …] [şablon:ad]");
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  if (sablonAd && !sablonlar[sablonAd]) return yaz(env, m.chat.id, `"${sablonAd}" adlı şablon yok. /sablonlar`);
  const mm = uretimMaliyeti(secim.arac);
  const toplam = yuvarla(mm.toplam * kodlar.length);
  const harcanan = await buAyHarcanan(env, simdi);
  const id = kisaId();
  await kaydet(env, `pelin:uretimOnay:${id}`, { kodlar, sablonAd, test, zaman: simdi }, 3 * 86400);
  return yaz(env, m.chat.id, [
    `💰 ${test ? "MALİYET TESTİ" : "Üretim"} — ${kodlar.length} model: ${kodlar.join(", ")}${sablonAd ? ` (şablon: ${sablonAd})` : ""}`,
    ...mm.kalemler.map((k) => `• ${k.ad}: ${para(k.birim)}`),
    `Model başı ~${para(mm.toplam)} · toplam ~${para(toplam)} (kalite kontrol yeniden ürettirirse en fazla 2 katı)`,
    `Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $${harcanan + toplam > AYLIK_SINIR_USD ? " ⚠️ SINIRI AŞAR" : ""}`,
  ].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:o:${id}` }, { text: "❌ İptal", callback_data: `pu:i:${id}` }]] } });
}

async function uretimBaslat(env, onay, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  const liste = await oku(env, "pelin:isler", []);
  const testId = onay.test ? `t-${kisaId()}` : null;
  for (const [i, kod] of onay.kodlar.entries()) {
    const urunler = await urunFotolari(env, kod);
    const id = `${kod}-${kisaId()}`;
    const is = { id, kod, testId, ortam: secim.ortamlar[i % secim.ortamlar.length], sablon: onay.sablonAd ? sablonlar[onay.sablonAd] : null, urunler, durum: urunler.length ? "foto_gonder" : "hata", fotoDeneme: 0, videoDeneme: 0, maliyet: 0, zaman: simdi, gecmis: [] };
    if (!urunler.length) is.hata = "ürün fotoğrafı yok (sitede değil; Hemra fotoğrafı \"<kod>\" yazısıyla Pelin'e gönderebilir)";
    await kaydet(env, `pelin:is:${id}`, is);
    liste.push(id);
    if (!urunler.length) await yaz(env, murat(env), `⚠️ ${kod}: ${is.hata}`);
  }
  await kaydet(env, "pelin:isler", liste.slice(-200));
  if (testId) await kaydet(env, `pelin:test:${testId}`, { kodlar: onay.kodlar, zaman: simdi });
}

async function falIsle(env, is, uc, girdi, fiyat, simdi) {
  is.fal = await falGonder(env, uc, girdi);
  is.falFiyat = fiyat; is.maliyet = yuvarla(is.maliyet + fiyat); is.bekleZaman = simdi;
  await harcamaYaz(env, fiyat, simdi);
}
async function uretimAdimi(env, is, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const yuz = dosyaAdresi(env, secim.yuz.anahtar);
  const arac = secim.arac || "veo";
  const bekle = async () => {
    const s = await falDurum(env, is.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti) { if (simdi - is.bekleZaman > 3 * 3600) return { hata: "3 saatte bitmedi" }; return null; }
    if (s.hata) { await harcamaYaz(env, -is.falFiyat, simdi); is.maliyet = yuvarla(is.maliyet - is.falFiyat); }
    return s;
  };
  if (is.durum === "foto_gonder") {
    is.fotoDeneme++;
    await falIsle(env, is, GORSEL.duzenle, { prompt: uretimFotoIstemi(is.ortam, is.sablon), image_urls: [yuz, ...is.urunler].slice(0, 4), num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" }, GORSEL.fiyat, simdi);
    is.durum = "foto_bekle"; return;
  }
  if (is.durum === "foto_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.durum = is.fotoDeneme < URETIM_DENEME ? "foto_gonder" : "uyari"; is.sorunlar = [`fotoğraf üretilemedi: ${s.hata}`]; return; }
    is.foto = s.resimler[0];
    const k = await kaliteKontrol(env, is.urunler, [is.foto], simdi);
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.fotoKontrol = k; is.gecmis.push([simdi, `foto ${is.fotoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = "video_gonder"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.fotoDeneme < URETIM_DENEME ? "foto_gonder" : "uyari"; return;
  }
  if (is.durum === "video_gonder") {
    is.videoDeneme++;
    const g = { ...videoGirdisi(arac, is.foto), prompt: uretimVideoIstemi(is.ortam, is.sablon) };
    await falIsle(env, is, ARACLAR[arac].uc, g, yuvarla(ARACLAR[arac].saniye * URETIM_SN), simdi);
    is.durum = "video_bekle"; return;
  }
  if (is.durum === "video_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.durum = is.videoDeneme < URETIM_DENEME ? "video_gonder" : "uyari"; is.sorunlar = [`video üretilemedi: ${s.hata}`]; return; }
    is.video = s.video; is.kareler = []; is.kareFal = [];
    for (const f of ["first", "middle", "last"]) { is.kareFal.push(await falGonder(env, KARE.uc, { video_url: is.video, frame_type: f })); }
    await harcamaYaz(env, 3 * KARE.saniye * URETIM_SN, simdi);
    is.durum = "kare_bekle"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "kare_bekle") {
    for (const [i, f] of is.kareFal.entries()) {
      if (is.kareler[i]) continue;
      const s = await falDurum(env, f).catch(() => ({ bitti: false }));
      if (s.bitti) is.kareler[i] = (s.resimler && s.resimler[0]) || "yok";
    }
    if (is.kareler.filter(Boolean).length < is.kareFal.length && simdi - is.bekleZaman < 3600) return;
    const kareler = is.kareler.filter((x) => x && x !== "yok");
    const k = kareler.length ? await kaliteKontrol(env, is.urunler, kareler, simdi) : { gecti: false, sorunlar: ["video kareleri alınamadı"] };
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.videoKontrol = k; is.gecmis.push([simdi, `video ${is.videoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = "onay"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.videoDeneme < URETIM_DENEME ? "video_gonder" : "uyari"; return;
  }
}
const isKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:a:${id}` }, { text: "🔄 Yeniden üret", callback_data: `pu:r:${id}` }, { text: "❌ İptal", callback_data: `pu:x:${id}` }]] });
async function isBildir(env, is) {
  const ust = `${is.kod} · ${is.ortam ? is.ortam.ad : "stüdyo"}${is.sablon ? ` · şablon ${is.sablon.ad}` : ""} · foto ${is.fotoDeneme}. deneme, video ${is.videoDeneme}. deneme`;
  if (is.durum === "uyari") {
    if (is.foto) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `⚠️ ${is.kod}: ${URETIM_DENEME} denemede kalite kontrolünden geçmedi.` });
    return yaz(env, murat(env), [`⚠️ ${ust}`, "Sorunlar:", ...(is.sorunlar || []).slice(0, 6).map((s) => `• ${s}`), "Ne yapalım?"].join("\n"), { reply_markup: isKlavye(is.id) });
  }
  if (is.foto) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `📸 ${is.kod}` });
  if (is.video) await tg(env, "sendVideo", { chat_id: murat(env), video: is.video, caption: `🎬 ${is.kod}` });
  const kk = (k) => (k ? `Pelin ${k.claude ? "✅" : "❌"} · ikinci göz ${k.openai === true ? "✅" : k.openai === false ? "❌" : k.openai}` : "—");
  return yaz(env, murat(env), [`👁 ÖNİZLEME — ${ust}`, `Kalite kontrol: foto ${kk(is.fotoKontrol)} | video ${kk(is.videoKontrol)}`, "Onaylarsanız Selin siteye, Kemal kanala alır."].join("\n"), { reply_markup: isKlavye(is.id) });
}
export async function uretimCron(env, simdi) {
  const liste = await oku(env, "pelin:isler", []);
  let islenen = 0;
  for (const id of liste) {
    if (islenen >= 8) break;
    const is = await oku(env, `pelin:is:${id}`, null);
    if (!is || !["foto_gonder", "foto_bekle", "video_gonder", "video_bekle", "kare_bekle"].includes(is.durum)) continue;
    islenen++;
    const once = is.durum;
    try { await uretimAdimi(env, is, simdi); } catch (e) { is.durum = "uyari"; is.sorunlar = [`hata: ${String(e.message).slice(0, 200)}`]; }
    if (["onay", "uyari"].includes(is.durum) && !["onay", "uyari"].includes(once)) await isBildir(env, is);
    await kaydet(env, `pelin:is:${id}`, is);
  }
  await testRaporu(env, liste);
}
async function testRaporu(env, liste) {
  const testler = new Set();
  for (const id of liste.slice(-60)) { const is = await oku(env, `pelin:is:${id}`, null); if (is && is.testId) testler.add(is.testId); }
  for (const t of testler) {
    const tk = await oku(env, `pelin:test:${t}`, null);
    if (!tk || tk.raporlandi) continue;
    const isler = [];
    for (const id of liste) { const is = await oku(env, `pelin:is:${id}`, null); if (is && is.testId === t) isler.push(is); }
    if (isler.some((x) => !["onay", "uyari", "onaylandi", "iptal", "hata"].includes(x.durum))) continue;
    const top = yuvarla(isler.reduce((s, x) => s + (x.maliyet || 0), 0));
    await yaz(env, murat(env), [
      `📊 Maliyet testi bitti (${isler.length} model):`,
      ...isler.map((x) => `• ${x.kod}: ${para(x.maliyet || 0)} — foto ${x.fotoDeneme}, video ${x.videoDeneme} deneme — ${x.durum === "uyari" ? "⚠️ kontrolden geçmedi" : x.durum === "hata" ? "hata" : "hazır"}`),
      `Toplam ${para(top)} · model başı ortalama ${para(top / Math.max(1, isler.length))}.`,
      `Günde 30 model ≈ ${para(30 * top / Math.max(1, isler.length))}, 40 model ≈ ${para(40 * top / Math.max(1, isler.length))} (aylık sınır şu an ${AYLIK_SINIR_USD} $ — artırmak sizin onayınızla).`,
    ].join("\n"));
    tk.raporlandi = true; await kaydet(env, `pelin:test:${t}`, tk);
  }
}
async function uretimDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id] = cq.data.split(":");
  const kapat = (text) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (islem === "o" || islem === "i") {
    const onay = await oku(env, `pelin:uretimOnay:${id}`, null);
    if (!onay || onay.kullanildi) return cevap("Bu onay geçersiz.");
    onay.kullanildi = true; await kaydet(env, `pelin:uretimOnay:${id}`, onay, 86400);
    if (islem === "i") { await cevap("İptal"); return kapat("❌ İptal edildi, hiçbir şey harcanmadı."); }
    await cevap("Başlıyorum"); await kapat(`✅ Onaylandı — ${onay.kodlar.length} model üretime alındı (${onay.kodlar.join(", ")}). Hazır olan önizleme olarak gelecek.`);
    return uretimBaslat(env, onay, simdi);
  }
  const is = await oku(env, `pelin:is:${id}`, null);
  if (!is || !["onay", "uyari"].includes(is.durum)) return cevap("Bu iş artık beklemiyor.");
  if (islem === "x") { is.durum = "iptal"; await kaydet(env, `pelin:is:${id}`, is); await cevap("İptal"); return kapat(`❌ ${is.kod} iptal edildi.`); }
  if (islem === "r") { Object.assign(is, { durum: "foto_gonder", fotoDeneme: 0, videoDeneme: 0, foto: null, video: null }); await kaydet(env, `pelin:is:${id}`, is); await cevap("Yeniden"); return kapat(`🔄 ${is.kod} yeniden üretiliyor.`); }
  if (islem === "a" && is.durum === "onay") {
    is.durum = "onaylandi"; is.onayZaman = simdi; await kaydet(env, `pelin:is:${id}`, is);
    const l = (await env.KAYIT.get("venom:pelinTeslim", "json")) || [];
    l.push({ kod: is.kod, foto: is.foto, video: is.video, ortam: is.ortam ? is.ortam.ad : null, zaman: simdi });
    await env.KAYIT.put("venom:pelinTeslim", JSON.stringify(l.slice(-100)));
    await cevap("Onaylandı");
    return kapat(`✅ ${is.kod} onaylandı — teslim kuyruğuna alındı (Selin site, Kemal kanal).`);
  }
  return cevap("Kontrolden geçmeyen iş onaylanamaz; yeniden üretin ya da iptal edin.");
}

// ---------- Örnek video → tarif → şablon ----------
async function ornekVideo(env, m, simdi) {
  if (!muratMi(env, m.from.id)) return false;
  const vid = m.video || (m.document && /^video\//.test(m.document.mime_type || "") ? m.document : null);
  const yazi = String(m.caption || m.text || "");
  const link = (yazi.match(/https?:\/\/\S+/) || [])[0];
  if (!vid && !(link && /gibi|örnek|ornek/i.test(yazi))) return false;
  let url;
  if (vid) {
    if (vid.file_size && vid.file_size > 20 * 1024 * 1024) { await yaz(env, m.chat.id, "Video 20 MB'tan büyük; Telegram botları indiremiyor. Daha kısa/küçük bir dosya atın."); return true; }
    url = dosyaAdresi(env, await dosyaKaydet(env, vid.file_id, vid.mime_type || "video/mp4", 7 * 86400));
  } else {
    const h = await fetch(link, { method: "GET", headers: { range: "bytes=0-1023" } }).catch(() => null);
    const tur = h ? String(h.headers.get("content-type") || "") : "";
    if (!h || !h.ok || !/^video\//.test(tur)) { await yaz(env, m.chat.id, "Bu linkten videoyu indiremedim (sayfa linki olabilir). Lütfen videoyu dosya olarak atın."); return true; }
    url = link;
  }
  const kod = (yazi.match(/\b(\d{3,6})\b/) || [])[1] || null;
  const id = kisaId();
  const kareFal = [];
  for (const f of ["first", "middle", "last"]) kareFal.push(await falGonder(env, KARE.uc, { video_url: url, frame_type: f }));
  await harcamaYaz(env, 3 * KARE.saniye * 10, simdi);
  await kaydet(env, `pelin:ornek:${id}`, { id, kod, kareFal, kareler: [], zaman: simdi }, 7 * 86400);
  const l = await oku(env, "pelin:ornekler", []); l.push(id); await kaydet(env, "pelin:ornekler", l.slice(-20));
  await yaz(env, m.chat.id, `🎞 Örneği inceliyorum${kod ? ` (${kod} için)` : ""}: kamera hareketi, ışık, hız, poz ve ortam havasını tarif olarak çıkaracağım. Birebir kopya yapılmaz; başkasının yüzü, logosu, müziği kullanılmaz.`);
  return true;
}
const TARIF_SEMA = { type: "object", additionalProperties: false, required: ["ad", "kamera", "isik", "hiz", "poz", "ortam_havasi", "ozet"], properties: { ad: { type: "string" }, kamera: { type: "string" }, isik: { type: "string" }, hiz: { type: "string" }, poz: { type: "string" }, ortam_havasi: { type: "string" }, ozet: { type: "string" } } };
async function ornekCron(env, simdi) {
  for (const id of await oku(env, "pelin:ornekler", [])) {
    const o = await oku(env, `pelin:ornek:${id}`, null);
    if (!o || o.tarif || o.hata) continue;
    for (const [i, f] of o.kareFal.entries()) { if (o.kareler[i]) continue; const s = await falDurum(env, f).catch(() => ({ bitti: false })); if (s.bitti) o.kareler[i] = (s.resimler && s.resimler[0]) || "yok"; }
    if (o.kareler.filter(Boolean).length < o.kareFal.length && simdi - o.zaman < 3600) { await kaydet(env, `pelin:ornek:${id}`, o, 7 * 86400); continue; }
    const kareler = o.kareler.filter((x) => x && x !== "yok");
    if (!kareler.length) { o.hata = "kareler alınamadı"; await kaydet(env, `pelin:ornek:${id}`, o, 7 * 86400); await yaz(env, murat(env), "⚠️ Örnek videodan kare alamadım; videoyu dosya olarak tekrar atar mısınız?"); continue; }
    o.tarif = await claudeJson(env, [{ type: "text", text: "Bir moda videosundan 3 kare (baş, orta, son):" }, ...kareler.map(resimUrl), { type: "text", text: "Bu videonun ÜSLUBUNU tarif et (İngilizce, görsel/video üretim istemi olarak kullanılacak): kamera (hareket, açı, mesafe), isik (ışık ve renk paleti), hiz (tempo, ağır çekim vb.), poz (mankenin hareketleri), ortam_havasi (mekân ve atmosfer — bizimkinde biraz değiştirilecek). Kişinin yüzünü, kimliğini, logoları, yazıları, markaları ve müziği TARİFE KOYMA. ad: kısa Türkçe şablon adı (tek kelime, küçük harf). ozet: 1-2 cümle Türkçe." }], TARIF_SEMA, simdi);
    await kaydet(env, `pelin:ornek:${id}`, o, 7 * 86400);
    await yaz(env, murat(env), [`🎞 Tarif çıkarıldı — "${o.tarif.ad}"`, o.tarif.ozet, `Kamera: ${o.tarif.kamera}`, `Işık: ${o.tarif.isik}`, `Hız: ${o.tarif.hiz}`, `Poz: ${o.tarif.poz}`, `Ortam: ${o.tarif.ortam_havasi} (bizimkinde biraz değişecek)`].join("\n"),
      { reply_markup: { inline_keyboard: [[{ text: "💾 Şablon olarak kaydet", callback_data: `ps:k:${id}` }, ...(o.kod ? [{ text: `▶️ ${o.kod} için üret`, callback_data: `ps:u:${id}` }] : [])]] } });
  }
}
async function sablonDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id] = cq.data.split(":");
  const o = await oku(env, `pelin:ornek:${id}`, null);
  if (!o || !o.tarif) return cevap("Tarif bulunamadı.");
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  const ad = String(o.tarif.ad || `sablon${Object.keys(sablonlar).length + 1}`).toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]/g, "").slice(0, 20) || `sablon${Object.keys(sablonlar).length + 1}`;
  sablonlar[ad] = { ...o.tarif, ad, zaman: simdi };
  await kaydet(env, "pelin:sablonlar", sablonlar);
  await cevap("Kaydedildi");
  if (islem === "u" && o.kod) return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: `/uret ${o.kod} şablon:${ad}` }, simdi);
  return yaz(env, cq.message.chat.id, `💾 Şablon kaydedildi: "${ad}". Kullanmak için: /uret 3557 şablon:${ad}`);
}

// Hemra/Patron'un ürün fotoğrafı (yazısında sadece model kodu): site yoksa üretimde bu kullanılır
async function urunFotoAl(env, m) {
  const foto = m.photo ? m.photo[m.photo.length - 1] : m.document && /^image\//.test(m.document.mime_type || "") ? m.document : null;
  if (!foto) return false;
  const yazi = String(m.caption || "").trim();
  const kod = (yazi.match(/^(\d{3,6})$/) || [])[1];
  if (!kod) return false;
  const l = await oku(env, `pelin:urunfoto:${kod}`, []);
  l.unshift(await dosyaKaydet(env, foto.file_id, m.document ? m.document.mime_type : "image/jpeg", 120 * 86400));
  await kaydet(env, `pelin:urunfoto:${kod}`, l.slice(0, 3), 120 * 86400);
  await yaz(env, m.chat.id, `✅ ${kod} ürün fotoğrafı alındı (üretimde siteden önce bu kullanılır).`);
  return true;
}
