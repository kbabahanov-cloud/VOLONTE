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
import { venomPelinAdimi, hataEkle } from "./venom-kopru.js";

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

export const MANKENLER = {
  beyaz: { ad: "Beyaz kız", tarif: "a young modern woman in her mid-20s with fair skin and long brown hair" },
  siyahi: { ad: "Siyahi kız", tarif: "a young modern Black African woman in her mid-20s with deep brown skin and natural black hair styled elegantly" },
  dolgun: { ad: "Dolgun (Büyük seri)", tarif: "a curvy plus-size (EU size 48-50) modern woman in her late 20s with warm brown skin and long dark hair, confident and elegant" },
};
// Seriler (3 Kasım, Patron): küçük seri 38-44 ve büyük seri 44-50 — her serinin kalıcı yüzü ayrı ("pelin:secim".yuzler)
export const SERILER = { kucuk: { ad: "Küçük seri (38-44)" }, buyuk: { ad: "Büyük seri (44-50)" } };
// Ortam rolleri (3 Kasım, Patron): katalog fotoğrafı (renk doğruluğu), video, sadece kampanya videosu
export const ORTAM_ROLLERI = { katalog: "katalog fotoğrafları", video: "videolar", kampanya: "sadece kampanya videoları" };
// Sitedeki bedenlerden seri: hepsi ≥44 → büyük; diğerleri küçük seri yüzüyle
export function seriBul(bedenler) {
  const n = (String(bedenler || "").match(/\b\d{2}\b/g) || []).map(Number).filter((x) => x >= 32 && x <= 60);
  return n.length && Math.min(...n) >= 44 ? "buyuk" : "kucuk";
}
export const seriYuzu = (secim, seri) => (secim && secim.yuzler && (secim.yuzler[seri] || secim.yuzler.kucuk || secim.yuzler.buyuk)) || (secim && secim.yuz) || null;
// Rolü olan ortam; eski kayıtta rol yoksa sırayla (kampanya ortamı günlük üretimde kullanılmaz)
export function rolOrtami(secim, rol, i = 0) {
  const l = (secim && secim.ortamlar) || [];
  const r = l.find((o) => o.rol === rol);
  if (r) return r;
  const gunluk = l.filter((o) => o.rol !== "kampanya");
  return gunluk.length ? gunluk[i % gunluk.length] : null;
}
const yuzAdi = (y) => (y ? y.ad || (MANKENLER[y.manken] ? MANKENLER[y.manken].ad : "yüz") : "yok");


// Kalıcı ayarlar (3 Kasım, Patron): her üretimde makyaj; yaka ve detay birebir
export const MAKYAJ = " MAKEUP (always): elegant, defined yet natural — eye makeup with mascara and lashes, groomed shaped eyebrows, a soft blush, and a lipstick shade that harmonizes with the dress. Never a bare, makeup-free face.";
export const YAKA_DETAY = " NECKLINE AND DETAILS: copy the exact neckline/collar shape from the product photos (e.g. a draped, scarf-like, loose high collar must stay exactly so — never simplify it into a plain collar) and the exact density, size and placement of lace, sequins, beads, buttons and embroidery.";
const detayIstemi = (mk) => (mk && mk.detayEn ? ` THIS MODEL: ${mk.detayEn}.` : "");
const YUZ_ISTEMI = (m) => `Photorealistic fashion catalog reference portrait of ${m.tarif}. Head and upper body, looking at the camera with a soft natural smile, elegant defined natural makeup (eye makeup, lashes, shaped brows, soft blush, lipstick), plain fitted black top, clean light-grey studio background, soft professional studio light, sharp focus, 3:4. She is an ORIGINAL, fictional person: she must not resemble any celebrity, model, actress, influencer or other real public figure. No text, no logo, no watermark.`;
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

// ---------- Telegram ----------
export async function tg(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  return r.json().catch(() => ({ ok: false }));
}
// Dönüş: Telegram cevabı + kart (düğmeli mi) + metin → sohbet aracı "gönderdim" demeden önce gerçek sonucu görür (3 Kasım)
const yaz = async (env, chat, text, ek = {}) => ({ ...(await tg(env, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...ek })), kart: Boolean(ek.reply_markup), metin: String(text) });

// ---------- Kayıt ----------
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);
export const PELIN_YEREL = { anahtarlar: [], onekler: ["pelin:"], haric: ["pelin:hata", "pelin:webhook"] };

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

// ---------- 5 dakikalık görev: işlerin durumu ----------
// Tek seferlik teşhis (Claude Code için; KV "venom:pelinTeshis" bayrağı): Pelin'in kendi deposundaki kurulum/deneme kayıtları
// ve fal.ai istek geçmişi → KV "venom:pelinTeshisSonuc". Anahtar/gizli bilgi yazılmaz.
async function teshis(env) {
  if (!(await env.KAYIT.get("venom:pelinTeshis"))) return;
  await env.KAYIT.delete("venom:pelinTeshis");
  const c = { zaman: Math.floor(Date.now() / 1000), anahtarlar: [], kayit: {}, fal: {} };
  try { c.anahtarlar = ((await env.KAYIT.list({ prefix: "pelin:" })).keys || []).map((k) => k.name); } catch (e) { c.anahtarlar = String(e.message); }
  for (const k of ["pelin:kurulum", "pelin:secim", "pelin:deneme", "pelin:isler", `pelin:sohbet:${murat(env)}`]) c.kayit[k] = await env.KAYIT.get(k);
  for (const k of (Array.isArray(c.anahtarlar) ? c.anahtarlar : []).filter((x) => /^pelin:(kurulum|yuz|is:|urunfoto|uretimOnay|sablon)/.test(x) && !(x in c.kayit))) c.kayit[k] = await env.KAYIT.get(k);
  for (const [ad, url] of [
    ["liste", `https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=${encodeURIComponent(GORSEL.metin)}&limit=40&expand=payloads`],
    ["liste2", `https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=${encodeURIComponent(GORSEL.metin)}&limit=40`],
  ]) {
    try { const r = await fetch(url, { headers: falBaslik(env) }); c.fal[ad] = { durum: r.status, govde: (await r.text()).slice(0, 60000) }; } catch (e) { c.fal[ad] = { hata: String(e.message) }; }
  }
  await env.KAYIT.put("venom:pelinTeshisSonuc", JSON.stringify(c), { expirationTtl: 3 * 86400 });
}

export async function pelinCron(env, simdi) {
  await webhookKur(env);
  try { const sc = await env.KAYIT.get("pelin:secim"); if (sc && sc !== (await env.KAYIT.get("pelin:secimAyna"))) { await env.KAYIT.put("venom:pelinSecim", sc); await env.KAYIT.put("pelin:secimAyna", sc); } } catch { /* sonra */ }
  try { await urunFotoAktar(env); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "urunFotoAktar", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { await yuzKaydiUygula(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "yuzKaydi", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  if (env.FAL_KEY) { try { await yuzDuzenCron(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "yuzDuzen", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  try { await teshis(env); } catch (e) { await env.KAYIT.put("venom:pelinTeshisSonuc", JSON.stringify({ hata: String(e && e.message) })); }
  if (env.FAL_KEY && env.STOK) { try { await venomPelinAdimi(env, simdi, venomUretimi); } catch (e) { await hataEkle(env, "pelin:venom", e); } }
  if (env.FAL_KEY) {
    for (const f of [kurulumCron, uretimCron, ornekCron]) { try { await f(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: f.name, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  }
}

// ---------- Dosyalar: Telegram dosyası → fal ve Claude için adres (bot anahtarı dışarı verilmez) ----------
export const dosyaUrl = (env, anahtar) => `${env.SELF_URL}/dosya/${anahtar}`;
async function dosyaVer(env, anahtar) {
  const k = await oku(env, `pelindosya:${anahtar}`, null);
  if (!k) return new Response("yok", { status: 404 });
  const f = await tg(env, "getFile", { file_id: k.file_id });
  if (!f.ok) return new Response("yok", { status: 404 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Response(r.body, { headers: { "content-type": k.tur || "image/jpeg", "cache-control": "private, max-age=3600" } });
}

// ---------- Sohbet (Claude; komutsuz) ----------
const SISTEM = `Sen Pelin'sin: VOLONTE'nin (İstanbul Laleli, kaliteli kadın giyim toptancısı; ana pazar Afrika, dünya geneli) görsel ve video yapımcısı. Hollywood seviyesinde bir yapımcı gibi düşünürsün: ışık, kadraj, hareket, müzik, ilk 2 saniyede dikkat çekme, Telegram/Instagram/WhatsApp için dikey video.
Sade, kısa, samimi Türkçe konuş (Rusça yazılırsa Rusça). Sohbet gibi konuş: soru sor, fikir ver, daha iyi bir yol görürsen söyle. Komut bekleme.
Kesin kurallar (asla esnemez): kıyafetin rengi, deseni ve kesimi asla değişmez; manken yüzleri hep aynı; fiyat, maliyet, alış fiyatı, kâr ve stok hiçbir görsele/yazıya girmez; videoya AI notu basılmaz; videonun son karesinde küçük VOLONTE yazısı ve altında model kodu (fiyat ve başka yazı yok). Onaysız harcama yok: her üretimden önce maliyet önizlemesi gider, sadece Murat onaylar. Para harcayan bir işi sen başlatamazsın; sadece "kurulum_karti" (yüz + ortam kurulumu) ya da "uretim_karti" (model kodlarıyla üretim / maliyet testi) ile Patron'a ✅ Onayla / ❌ İptal düğmeli maliyet kartı gönderebilirsin. Eski deneme akışı ("fal hazır", kör test, askı/kumaş denemesi) TAMAMEN KALDIRILDI; ondan söz etme.
Üretim akışı (2 Kasım, Patron): /uret <kod> → ürün fotoğrafı (önce Patron/Hemra'nın gönderdiği, yoksa site) → sabit yüzle fotoğraf → aynı fotoğraftan 6 sn video → kalite kontrol (sen + ikinci göz OpenAI) → renk/desen/kesim farkı varsa otomatik yeniden; 2 denemede olmazsa Patron'a ⚠️ → Patron [✅ Onayla] [🔄 Yeniden üret] [❌ İptal] → onaylanınca Selin siteye, Kemal kanala. /maliyettesti 5 kod → model başı maliyet raporu. Örnek video ("bunun gibi yap, 3557"): kamera, ışık, hız, poz ve ortam havasını tarif olarak çıkarırsın; birebir kopya yok, başkasının yüzü/logosu/müziği yok; beğenilen tarif şablon olur (/sablonlar).
Yapay zekâ yüzden kişi tanıyamaz; "ünlüye benziyor mu" kontrolünü kullanıcının gözü yapar — bunu dürüstçe söyle.
Yüzler (3 Kasım): her serinin KALICI yüzü var (küçük seri 38-44, büyük seri 44-50); model hangi seriyse o yüz kullanılır. Kayıtlı yüzü değiştirmek için: yuz_duzenle_karti (kimlik aynı kalır, sadece istenen değişir; maliyet kartı → Patron önce görür, beğenirse kaydeder) ya da Patron'un gönderdiği fotoğraf (Pelin'e fotoğrafı "yüz" yazısıyla atar → hangi seri sorulur). Patron açıkça yeni yüz istemedikçe kurulum_karti KULLANMA (o tamamen yeni yüzler üretir).
Ortamlar rollü: katalog fotoğrafı ortamı (renk doğruluğu), video ortamı, sadece kampanya videosu ortamı. Değiştirmek için ortam_ayarla.
Ürün fotoğrafları: Patron/Hemra fotoğrafı yazısında model koduyla atar ("3627 ön", "3627 arka", "3627 kırmızı"; albümde ilk fotoğrafa yazmak yeter: 1. ön, 2. arka). Bunlar üretimde siteden önce kullanılır; "dosya olarak" gönderilirse renk daha net kalır. Kontrol: urun_fotolari.
Renk: Patron "3627 kırmızı" derse uretim_karti'ya renkler ile ver; sadece o renk üretilir ve kontrol o rengi arar.
Sahne ayarları her yeni videoda var: yürürken kameraya dönüş, kamera etrafında dönüş, kumaş hareketi, yaka/dikiş yakın kare, son karede küçük VOLONTE + model kodu (fiyat yok; son kare okunarak kontrol edilir), videodan kapak fotoğrafı. Beğenilen iş "şablon" olur (önizlemedeki düğme ya da sablon_kaydet); "3630'u 3627 şablonuyla yap" → uretim_karti sablon="3627".
Kalıcı ayarlar (3 Kasım): her üretimde şık, belirgin ama doğal makyaj; yaka şekli ve dantel/payet yoğunluğu birebir (modele özel detay: model_detay_kaydet). Kalite kontrol: sadece renk, boy, kesimde BÜYÜK fark yeniden üretir; küçük farklar Patron'a not. PATRON SON SÖZ: kontrolden geçmeyen işi "✅ Yine de onayla" ile onaylayabilir (kaldığı yerden devam eder). Ekip: sen baş üreticisin, ChatGPT yardımcı ikinci göz; her kontrolün 1-10 puanı var; Patron'un kararlarından öğrenilir. Hemra onayı hazır ama kapalı (/hemraonay).
Boy ve kadraj: her modelin boyu (mini/diz/midi/bilek/maksi) bir kez kaydedilir, bütün renklerde ve iki seride geçerli; ilk üretimden önce sorulur (boy_kaydet ile de kaydedilir). Boy referansı: Patron fotoğrafı/videoyu yazısında "3627 boy" ile atar (ön/arka ürün fotoğrafından ayrı). Katalog fotoğrafı tam boy (baş ve ayakkabı kesilmez), ayakkabı sade; kontrol boyu da denetler.
Örnek video: Patron dosya atar (ya da "sitedeki 3627 videosu gibi" yazar) → tarif çıkarılır → şablon.
DÜRÜSTLÜK (kesin): Bir aracı çağırmadan ve araç sonucunu görmeden "gönderdim / kaydettim / başladım / hazırladım" ASLA deme. Araç sonucu "GÖNDERİLMEDİ" diyorsa bunu Patron'a aynen söyle. Yapamadığın işi yapmış gibi gösterme; araç yoksa "bunun için aracım yok, Claude Code'a iletilmeli" de.`;

// Sohbet araçları (3 Kasım): sadece maliyet KARTI gönderir; para harcamaz (Patron kartta onaylar)
const SOHBET_ARACLARI = [
  { name: "kurulum_karti", description: "Patron'a TAMAMEN YENİ kurulum (3 yeni manken yüzü + 3 ortam önerisi) maliyet kartını gönderir. Sadece Patron açıkça yeni yüz isterse. Para harcamaz.", strict: true, input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { name: "uretim_karti", description: "Patron'a model kodlarıyla üretim (ya da test=true ise 5 modellik maliyet testi) maliyet kartını gönderir. Seri (yüz) sitedeki bedenden bulunur; Patron bir kodun büyük seri olduğunu söylerse buyuk_seri'ye yaz. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kodlar", "test", "buyuk_seri", "renkler", "sablon"], properties: { kodlar: { type: "array", items: { type: "string" } }, test: { type: "boolean" }, buyuk_seri: { type: "array", items: { type: "string" } },
      renkler: { type: "array", description: "Patron bir renk dediyse (\"3627 kırmızı\"): sadece o renk üretilir", items: { type: "object", additionalProperties: false, required: ["kod", "renk"], properties: { kod: { type: "string" }, renk: { type: "string" } } } },
      sablon: { type: "string", description: "Kayıtlı şablon adı (\"3627 şablonu\" → \"3627\"); yoksa boş" } } } },
  { name: "boy_kaydet", description: "Bir modelin boyunu kalıcı kaydeder (bütün renklerde, iki seride geçerli): mini, diz, midi, bilek, maksi. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod", "boy"], properties: { kod: { type: "string" }, boy: { type: "string", enum: ["mini", "diz", "midi", "bilek", "maksi"] } } } },
  { name: "model_detay_kaydet", description: "Bir modelin korunacak özel detaylarını kalıcı kaydeder (yaka şekli, dantel/payet yeri…); her üretimde istem olarak kullanılır. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod", "detay_tr", "detay_en"], properties: { kod: { type: "string" }, detay_tr: { type: "string" }, detay_en: { type: "string", description: "aynı detay, görsel araç için kısa İngilizce" } } } },
  { name: "sablon_kaydet", description: "Bir modelin son üretim işinin ayarlarını (ortamlar, sahne ayarları, video aracı, örnek tarif) şablon olarak kaydeder (ör. \"3627 şablonu\"). Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod", "ad"], properties: { kod: { type: "string" }, ad: { type: "string", description: "şablon adı; boşsa model kodu" } } } },
  { name: "urun_fotolari", description: "Bir model için kayıtlı (Patron/Hemra'nın gönderdiği) ürün fotoğraflarını rolleriyle (ön/arka/detay, renk) Patron'a gösterir. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "yuz_duzenle_karti", description: "Kayıtlı bir seri yüzünü kimliği aynı kalarak düzenleme maliyet kartını Patron'a gönderir (ör. ten rengi). Onaylanınca 1 görsel üretilir, önce Patron'a gösterilir, Patron 'Kaydet' derse kalıcı olur. Para harcamaz (kart).", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["seri", "talimat", "istem_en"], properties: { seri: { type: "string", enum: ["kucuk", "buyuk"] }, talimat: { type: "string", description: "Patron'un istediği değişiklik, kısa Türkçe" }, istem_en: { type: "string", description: "Aynı değişiklik, görsel araç için kısa İngilizce (sadece değişecek şey)" } } } },
  { name: "kayitli_yuzler", description: "Kayıtlı seri yüzlerini fotoğraflarıyla Patron'a gönderir. Para harcamaz.", strict: true, input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { name: "ortam_ayarla", description: "Ortam rollerini kaydeder: katalog (fotoğraf), video, kampanya (sadece kampanya videoları). Değer ortam numarası (\"1\", \"2\", \"3\"); boş = yok. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["katalog", "video", "kampanya"], properties: { katalog: { type: "string" }, video: { type: "string" }, kampanya: { type: "string" } } } },
];
// Araç sonucu: Telegram gerçekten ne yaptı (kart gitti mi?) — Pelin bunu görmeden "gönderdim" demez
function kartSonucu(r) {
  if (!r || !r.ok) return `KART GÖNDERİLEMEDİ (Telegram hatası: ${(r && r.description) || "bilinmiyor"}). Patron'a gönderdim DEME.`;
  if (!r.kart) return `KART GÖNDERİLMEDİ. Patron'a sadece şu mesaj gitti: "${String(r.metin || "").slice(0, 300)}". Kart gitmiş gibi konuşma.`;
  return `KART GÖNDERİLDİ (Telegram onayladı). Kart: "${String(r.metin || "").slice(0, 300)}"`;
}

async function durumMetni(env, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const anahtar = `Anahtarlar: BOT ✅ · FAL ${env.FAL_KEY ? "✅" : "❌"} · ANTHROPIC ${env.ANTHROPIC_API_KEY ? "✅" : "❌"} · OPENAI ${env.OPENAI_API_KEY ? "✅" : "❌ (ikinci göz kapalı)"}.`;
  const kur = secim ? `Kayıtlı yüzler: ${Object.keys(SERILER).map((sr) => `${SERILER[sr].ad} = ${secim.yuzler ? yuzAdi(secim.yuzler[sr]) : sr === "kucuk" ? yuzAdi(secim.yuz) : "yok"}`).join("; ")}. Ortamlar: ${(secim.ortamlar || []).map((x) => `${x.id}) ${x.ad}${x.rol ? ` → ${ORTAM_ROLLERI[x.rol]}` : ""}`).join(", ") || "yok"}. Video aracı ${ARACLAR[secim.arac || "veo"].ad}.` : "Kurulum: yapılmadı (yüz yok).";
  return `${anahtar} ${kur} Bu ay harcanan: ${para(await buAyHarcanan(env, simdi))} / ${AYLIK_SINIR_USD} $. Beyin: ${(await env.KAYIT.get("pelin:beyin")) || "sonnet"}.`;

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
  for (let tur = 0; tur < 4; tur++) {
    const r = await client.messages.create({ model, max_tokens: 2000, system: sistem, tools: SOHBET_ARACLARI, output_config: { effort: "low" }, messages: mesajlar });
    await claudeHarcama(env, model, r.usage || {}, simdi);
    const metin = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const araclar = r.content.filter((b) => b.type === "tool_use");
    cevapMetni = metin; // sadece SON cevap gider: araç sonucundan önce yazılan "gönderdim" Patron'a gitmez
    if (r.stop_reason !== "tool_use" || !araclar.length) break;
    mesajlar.push({ role: "assistant", content: r.content });
    const sonuclar = [];
    for (const a of araclar) {
      let sonuc;
      try { sonuc = await sohbetAraci(env, m, a.name, a.input || {}, simdi); } catch (e) { sonuc = `ARAÇ HATASI: ${String(e && e.message).slice(0, 200)}. Hiçbir şey gönderilmedi/kaydedilmedi.`; }
      sonuclar.push({ type: "tool_result", tool_use_id: a.id, content: sonuc });
    }
    mesajlar.push({ role: "user", content: sonuclar });
  }
  if (cevapMetni) await yaz(env, m.chat.id, cevapMetni.slice(0, 4000));
  const yeniGecmis = [...gecmis, { role: "user", content: String(m.text).slice(0, 2000) }, { role: "assistant", content: (cevapMetni || "…").slice(0, 2000) }].slice(-10);
  await kaydet(env, `pelin:sohbet:${m.from.id}`, yeniGecmis, 2 * 86400);
}

async function sohbetAraci(env, m, ad, g, simdi) {
  if (!muratMi(env, m.from.id) && ad !== "kayitli_yuzler") return "Bu iş sadece Patron'da; hiçbir şey yapılmadı.";
  if (ad === "kurulum_karti") return kartSonucu(await kurulumKomutu(env, m, simdi));
  if (ad === "uretim_karti") {
    const buyuk = (g.buyuk_seri || []).map(String);
    const renk = Object.fromEntries((g.renkler || []).map((x) => [String(x.kod), String(x.renk).toLocaleLowerCase("tr")]));
    const bilinmeyen = Object.values(renk).filter((x) => !renkGecerli(x));
    if (bilinmeyen.length) return `KART GÖNDERİLMEDİ: renk tanınmadı (${bilinmeyen.join(", ")}). Patron'a hangi renk olduğunu sor.`;
    const sozler = (g.kodlar || []).map((k) => `${buyuk.includes(String(k)) ? "büyük:" : ""}${k}${renk[String(k)] ? ` ${renk[String(k)]}` : ""}`);
    if (g.sablon) sozler.push(`şablon:${String(g.sablon).toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]/g, "")}`);
    return kartSonucu(await uretKomutu(env, { ...m, text: `/${g.test ? "maliyettesti" : "uret"} ${sozler.join(" ")}` }, simdi, Boolean(g.test)));
  }
  if (ad === "boy_kaydet") {
    if (!/^\d{3,6}$/.test(String(g.kod)) || !BOYLAR[g.boy]) return "KAYDEDİLMEDİ: kod ya da boy geçersiz.";
    await boyYaz(env, String(g.kod), { boy: g.boy, kaynak: `Patron (sohbet) ${tarihSaatYaz(simdi)}`, zaman: simdi });
    return `KAYDEDİLDİ: ${g.kod} boyu ${BOYLAR[g.boy].ad}.`;
  }
  if (ad === "model_detay_kaydet") {
    if (!/^\d{3,6}$/.test(String(g.kod))) return "KAYDEDİLMEDİ: kod geçersiz.";
    await boyYaz(env, String(g.kod), { detayTr: String(g.detay_tr).slice(0, 300), detayEn: String(g.detay_en).slice(0, 400) });
    return `KAYDEDİLDİ: ${g.kod} detayı — ${g.detay_tr}`;
  }
  if (ad === "sablon_kaydet") {
    const is = await sonIs(env, g.kod);
    if (!is || !["onay", "onaylandi"].includes(is.durum)) return `KAYDEDİLMEDİ: ${g.kod} için kontrolden geçmiş bir iş yok (önce üretim + önizleme).`;
    return `KAYDEDİLDİ: "${await sablonKaydet(env, is, simdi, g.ad || null)} şablonu".`;
  }
  if (ad === "urun_fotolari") { const r = await fotolarKomutu(env, { ...m, text: `/fotolar ${g.kod}` }); return r.ok ? `GÖSTERİLDİ: ${r.metin}` : `GÖSTERİLEMEDİ: ${r.metin || "fotoğraf yok"}`; }
  if (ad === "yuz_duzenle_karti") return kartSonucu(await yuzDuzenleKarti(env, m.chat.id, g.seri, g.talimat, g.istem_en, simdi));
  if (ad === "kayitli_yuzler") { const r = await yuzleriGoster(env, m.chat.id); return r.ok ? `GÖNDERİLDİ: ${r.metin}` : `GÖNDERİLEMEDİ: ${r.metin || "kayıtlı yüz yok"}`; }
  if (ad === "ortam_ayarla") return ortamAyarla(env, g);
  return "Bilinmeyen araç; hiçbir şey yapılmadı.";
}

// ---------- Güncellemeler ----------
const kisiAdi = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "Biri";

export async function guncelleme(u, env) {
  const simdi = Math.floor(Date.now() / 1000);
  if (u.callback_query) {
    const cq = u.callback_query;
    const v = String(cq.data || "");
    if (/^pk:/.test(v)) return kurulumDugmesi(env, cq, simdi);
    if (/^pu:/.test(v)) return uretimDugmesi(env, cq, simdi);
    if (/^ps:/.test(v)) return sablonDugmesi(env, cq, simdi);
    if (/^pz:/.test(v)) return yuzDuzenDugmesi(env, cq, simdi);
    if (/^pb:/.test(v)) return boyDugmesi(env, cq, simdi);
    if (/^pyk:/.test(v)) return yuzFotoDugmesi(env, cq, simdi);
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Geçersiz düğme." });
  }
  const m = u.message;
  if (!m || m.chat.type !== "private" || !m.from) return;
  const id = String(m.from.id);
  if (!yonetici(env, id) && String(id) !== hemra(env)) {
    await env.KAYIT.put(`pelin:bekleyen:${id}`, JSON.stringify({ ad: kisiAdi(m.from), zaman: m.date }), { expirationTtl: 7 * 86400 });
    return;
  }
  if (await boyReferansAl(env, m)) return;
  if (await ornekVideo(env, m, simdi)) return;
  if (await urunFotoAl(env, m)) return;
  if (await yuzFotoAl(env, m)) return;
  if (await fotoUyarisi(env, m)) return;
  const metin = String(m.text || "").trim();
  if (!metin) return;
  const komut = metin.split(/[\s@]/)[0].toLowerCase();
  if (komut === "/start") return yaz(env, m.chat.id, `Merhaba ${m.from.first_name || ""}! Ben Pelin, VOLONTE'nin görsel ve video yapımcısıyım. Benimle normal konuşabilirsiniz. Para harcayan her iş önce maliyet önizlemesiyle Murat'ın onayına gelir.`);
  if (komut === "/durum") return yaz(env, m.chat.id, await durumMetni(env, simdi));
  if (komut === "/kurulum") return kurulumKomutu(env, m, simdi);
  if (komut === "/uret") return uretKomutu(env, m, simdi);
  if (komut === "/maliyettesti") return uretKomutu(env, m, simdi, true);
  if (komut === "/yuzler") return yuzleriGoster(env, m.chat.id);
  if (komut === "/fotolar") return fotolarKomutu(env, m);
  if (komut === "/hemraonay") {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "Bu ayar sadece Patron'da.");
    const a = (metin.split(/\s+/)[1] || "").toLocaleLowerCase("tr");
    const ayar = await oku(env, "pelin:ayar", {});
    if (["aç", "ac", "kapat"].includes(a)) { ayar.hemraOnay = a !== "kapat"; await kaydet(env, "pelin:ayar", ayar); }
    return yaz(env, m.chat.id, `Hemra onayı: ${ayar.hemraOnay ? "AÇIK (önizleme Hemra'ya da gider, Hemra da onaylayabilir)" : "KAPALI (sadece Patron onaylar)"}. Değiştirmek: /hemraonay aç | kapat`);
  }
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
  if (metin.startsWith("/")) return yaz(env, m.chat.id, "Komutlar: /durum · /yuzler · /fotolar 3627 · /uret 3627 kırmızı (büyük seri: büyük:3627; şablon: şablon:3627) · /maliyettesti 5 kod · /sablonlar · /arac · /beyin · /kurulum (yeni yüzler). Örnek video: dosyayı \"bunun gibi yap, 3557\" yazısıyla atın. Gerisi için normal yazın.");
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
const SELIN_VIDEO = "https://volonte-selin.volonte.workers.dev"; // site videoları (selin/<kod>/<n> → /v2/<kod>/<n>)
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const dosyaAdresi = (env, anahtar) => `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/dosya/${anahtar}`;
async function dosyaKaydet(env, fileId, tur, ttl) {
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await kaydet(env, `pelindosya:${anahtar}`, { file_id: fileId, tur }, ttl);
  return anahtar;
}
export function uretimMaliyeti(arac = "veo", secim = null) {
  const kat = rolOrtami(secim, "katalog"), vid = rolOrtami(secim, "video");
  const ayriKare = Boolean(kat && vid && kat.id !== vid.id);
  const kalemler = [
    { ad: `Katalog fotoğrafı (sabit yüz + ürün${kat ? `, ${kat.ad}` : ""})`, birim: GORSEL.fiyat },
    ...(ayriKare ? [{ ad: `Video başlangıç karesi (${vid.ad}) + kontrol`, birim: yuvarla(GORSEL.fiyat + KONTROL_TAHMIN + OPENAI_TAHMIN) }] : []),
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
// 3 Kasım (Patron): üretimi SADECE renk, boy ve kesimde BÜYÜK fark durdurur; küçük farklar (payet yoğunluğu, hafif ton, yaka
// hafif sade…) Patron'a not olarak yazılır. Her kontrolün 1-10 puanı var. Patron'un "yine de onayla" kararları öğrenilir.
const KONTROL2_SORU = "İlk görsel(ler) ÜRÜNÜN gerçek fotoğrafı, son görsel(ler) yapay zekâ ile üretilmiş manken görseli. Farkları İKİYE ayır. BÜYÜK fark (üretim yeniden yapılır): renk açıkça başka (ör. koyu bordo yerine parlak kırmızı, siyah yerine kahve), kesim/model açıkça başka (başka yaka tipi, kol yok/var, etek tipi tamamen farklı, tamamen başka desen/baskı), boy açıkça başka. KÜÇÜK fark (sadece not): payet/dantel yoğunluğu biraz farklı, hafif ton farkı, yaka ya da detay biraz sade, ışığa bağlı küçük farklar. Emin değilsen KÜÇÜK say. Sadece GÖRÜNEN kısmı değerlendir (görünmeyen arka için fark yazma). Ürün fotoğraflarının üzerindeki yazı/logo önemsiz; ÜRETİLEN görselde yazı/logo/filigran varsa büyük sorun yaz. puan: 1-10 genel uygunluk.";
const KONTROL2_SEMA = (ek = {}) => ({ type: "object", additionalProperties: false,
  required: ["renk_buyuk_fark", "kesim_buyuk_fark", "boy_buyuk_fark", "kadraj_tam", "makyaj_var", "puan", "buyuk_sorunlar", "kucuk_notlar"],
  properties: { renk_buyuk_fark: { type: "boolean" }, kesim_buyuk_fark: { type: "boolean" }, boy_buyuk_fark: { type: "boolean" }, kadraj_tam: { type: "boolean" }, makyaj_var: { type: "boolean" }, puan: { type: "integer" }, buyuk_sorunlar: { type: "array", items: { type: "string" } }, kucuk_notlar: { type: "array", items: { type: "string" } } } });
const KONTROL_SORU = "İlk görsel(ler) ÜRÜNÜN gerçek fotoğrafı, son görsel(ler) yapay zekâ ile üretilmiş manken görseli. Üretilen görseldeki kıyafet ürünle BİREBİR aynı mı? Renk (ton dahil), desen (motif, boyut, yerleşim) ve kesim (boy, kol, yaka, etek, detaylar) ayrı ayrı değerlendir. Küçük ışık farkı sorun değil; renk tonu kayması, desen değişmesi/sadeleşmesi, kesim farkı SORUNDUR. Şüphedeysen geçme. Sadece üretilen görselde GÖRÜNEN kısmı değerlendir: görünmeyen taraf (ör. önden çekimde arka) için sorun yazma. Ürün fotoğraflarının üzerindeki yazı/logo/filigran önemsizdir (ürünün parçası değildir); ama ÜRETİLEN görselde yazı, logo, filigran varsa sorun yaz.";
const KONTROL_SEMA = { type: "object", additionalProperties: false, required: ["renk_ayni", "desen_ayni", "kesim_ayni", "sorunlar"], properties: { renk_ayni: { type: "boolean" }, desen_ayni: { type: "boolean" }, kesim_ayni: { type: "boolean" }, sorunlar: { type: "array", items: { type: "string" } } } };
async function openaiKontrol(env, urunler, uretilen, simdi, ek = {}) {
  if (!env.OPENAI_API_KEY) return null;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-4.1-mini", response_format: { type: "json_object" }, max_tokens: 500,
      messages: [{ role: "user", content: [
        { type: "text", text: `${kontrolSorusu(ek)} Yanıtı sadece JSON ver: {"renk_buyuk_fark":bool,"kesim_buyuk_fark":bool,"boy_buyuk_fark":bool,"kadraj_tam":bool,"makyaj_var":bool,"puan":1-10,"buyuk_sorunlar":[kısa Türkçe],"kucuk_notlar":[kısa Türkçe]}` },
        ...urunler.map((u) => ({ type: "image_url", image_url: { url: u } })), ...uretilen.map((u) => ({ type: "image_url", image_url: { url: u } })),
      ] }] }),
  });
  const j = await r.json().catch(() => ({}));
  await harcamaYaz(env, OPENAI_TAHMIN, simdi, "openai");
  if (!r.ok) return { hata: `OpenAI ${r.status}: ${JSON.stringify(j.error || j).slice(0, 160)}` };
  try { return JSON.parse(j.choices[0].message.content); } catch { return { hata: "OpenAI yanıtı okunamadı" }; }
}
const kontrolSorusu = (ek = {}) => `${KONTROL2_SORU}${ek.boy && BOYLAR[ek.boy.boy] ? ` İSTENEN BOY: ${BOYLAR[ek.boy.boy].ad} (${BOYLAR[ek.boy.boy].en}); açıkça başkaysa boy_buyuk_fark=true ve büyük sorunlara "boy farklı: …". kadraj_tam: baş ve ayakkabılar kadrajda, kesilmemiş mi?` : " boy_buyuk_fark=false, kadraj_tam=true yaz (bu karede boy/kadraj denetlenmiyor)."}${ek.yuz ? " makyaj_var: yüzde belirgin makyaj (göz makyajı, kirpik, kaş, allık, ruj) var mı? Makyajsız yüz büyük sorundur." : " makyaj_var=true yaz (bu karede denetlenmiyor)."}${ek.renk ? ` İSTENEN RENK: ${ek.renk} — kıyafet bu renk değilse renk_buyuk_fark=true.` : ""}${ek.ogrenme && ek.ogrenme.length ? ` Patron'un önceki kararları (öğren): şu farklara rağmen Patron onayladı → benzerlerini KÜÇÜK say: ${ek.ogrenme.join(" | ")}.` : ""}${ek.sonYazi ? ` Son karede küçük "VOLONTE" ve "${ek.sonYazi}" yazısı İSTENEN bir şeydir, sorun sayma; bunun dışında yazı, fiyat, logo varsa sorun yaz.` : ""}`;
const YAZI_SEMA = { type: "object", additionalProperties: false, required: ["volonte_var", "kod_okunan", "baska_yazi_var", "fiyat_var"], properties: { volonte_var: { type: "boolean" }, kod_okunan: { type: "string" }, baska_yazi_var: { type: "boolean" }, fiyat_var: { type: "boolean" } } };
async function sonKareYazisi(env, kare, kod, simdi) {
  const y = await claudeJson(env, [resimUrl(kare), { type: "text", text: `Bu bir moda videosunun SON karesi. Görseldeki yazıları oku. volonte_var: "VOLONTE" yazısı doğru yazılmış ve okunuyor mu? kod_okunan: VOLONTE'nin altındaki/yanındaki model kodunu harf harf yaz (yoksa boş). baska_yazi_var: bunlar dışında yazı/logo/filigran var mı? fiyat_var: fiyat, para birimi, rakamlı fiyat var mı?` }], YAZI_SEMA, simdi, 300);
  const sorun = [!y.volonte_var && "son karede VOLONTE yazısı yok/yanlış", String(y.kod_okunan).replace(/\s/g, "") !== String(kod) && `son karedeki kod yanlış (okunan: "${y.kod_okunan}", olması gereken: ${kod})`, y.baska_yazi_var && "son karede başka yazı/logo var", y.fiyat_var && "son karede FİYAT var"].filter(Boolean);
  return { tamam: !sorun.length, sorun: sorun.join("; ") };
}
const BOY_KONTROL_SEMA = { ...KONTROL_SEMA, required: [...KONTROL_SEMA.required, "boy_dogru", "kadraj_tam"], properties: { ...KONTROL_SEMA.properties, boy_dogru: { type: "boolean" }, kadraj_tam: { type: "boolean" } } };
// Büyük sorunlar (yeniden üretim sebebi) ve küçük notlar; eski biçimdeki cevaplar da okunur
function kontrolOku(x) {
  if (!x || x.hata) return { gec: false, buyuk: [], kucuk: [], puan: null };
  if (x.renk_buyuk_fark === undefined) { // eski biçim
    const boyNot = x.boy_dogru === false ? ["boy farklı"] : [];
    return { gec: Boolean(x.renk_ayni && x.desen_ayni && x.kesim_ayni && x.boy_dogru !== false && x.kadraj_tam !== false), buyuk: [...(x.sorunlar || []), ...boyNot], kucuk: [], puan: null };
  }
  const buyuk = [...(x.buyuk_sorunlar || [])];
  if (x.kadraj_tam === false) buyuk.push("kadraj: baş ya da ayakkabı kesilmiş");
  if (x.makyaj_var === false) buyuk.push("yüz makyajsız");
  if (x.boy_buyuk_fark && !buyuk.some((b) => /boy/i.test(b))) buyuk.push("boy farklı");
  const gec = !x.renk_buyuk_fark && !x.kesim_buyuk_fark && !x.boy_buyuk_fark && x.kadraj_tam !== false && x.makyaj_var !== false;
  return { gec, buyuk: gec ? [] : buyuk, kucuk: [...(x.kucuk_notlar || []), ...(gec ? buyuk : [])], puan: Number.isFinite(x.puan) ? Math.max(1, Math.min(10, Math.round(x.puan))) : null };
}
const ogrenmeOku = async (env) => (await oku(env, "pelin:ogrenme", [])).filter((x) => x.karar === "yine de onay").slice(-6).map((x) => x.farklar.join("; ").slice(0, 160));
export async function kaliteKontrol(env, urunler, uretilen, simdi, ek = {}) {
  const ekk = { ...ek, ogrenme: ek.ogrenme || (await ogrenmeOku(env).catch(() => [])) };
  const claudeHam = await claudeJson(env, [{ type: "text", text: "ÜRÜN (gerçek):" }, ...urunler.map(resimUrl), { type: "text", text: "ÜRETİLEN:" }, ...uretilen.map(resimUrl), { type: "text", text: kontrolSorusu(ekk) }], KONTROL2_SEMA(ekk), simdi, 700);
  const openaiHam = await openaiKontrol(env, urunler, uretilen, simdi, ekk).catch((e) => ({ hata: String(e.message).slice(0, 160) }));
  const c = kontrolOku(claudeHam), o = openaiHam && !openaiHam.hata ? kontrolOku(openaiHam) : null;
  const sorunlar = [...c.buyuk.map((s) => `Pelin: ${s}`), ...(o ? o.buyuk.map((s) => `ChatGPT: ${s}`) : [])];
  const notlar = [...c.kucuk.map((s) => `Pelin: ${s}`), ...(o ? o.kucuk.map((s) => `ChatGPT: ${s}`) : [])];
  return { gecti: c.gec && (o ? o.gec : true), claude: c.gec, openai: openaiHam === null ? "yok" : openaiHam.hata ? `hata (${openaiHam.hata})` : o.gec, sorunlar, notlar, puan: { pelin: c.puan, chatgpt: o ? o.puan : null } };
}
const notEkle = (is, k) => { if (k && k.notlar && k.notlar.length) is.notlar = [...new Set([...(is.notlar || []), ...k.notlar])].slice(-12); };

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
    await yaz(env, murat(env), "Hangi yüz hangi seriye? (Ünlüye ya da tanıdığınız birine benziyorsa seçmeyin.)", { reply_markup: { inline_keyboard: Object.keys(SERILER).map((sr) => hazir.map((x, i) => ({ text: `${i + 1} → ${sr === "kucuk" ? "Küçük" : "Büyük"}`, callback_data: `pk:y:${x.manken}:${sr}` }))) } });
  }
  const hatali = k.isler.filter((i) => i.durum === "hata");
  if (hatali.length) await yaz(env, murat(env), `⚠️ ${hatali.length} yüz üretilemedi (ücret alınmaz): ${hatali.map((x) => x.hata).join(" · ").slice(0, 300)}`);
  await kaydet(env, "pelin:kurulum", k);
}
async function kurulumDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, deger, seriSec] = cq.data.split(":");
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
    const sr = SERILER[seriSec] ? seriSec : "kucuk";
    k.secilenYuzler = { ...(k.secilenYuzler || {}), [sr]: deger };
    k.secilenYuz = k.secilenYuzler.kucuk || k.secilenYuzler.buyuk;
    await kaydet(env, "pelin:kurulum", k); await cevap("Seçildi");
    await yaz(env, cq.message.chat.id, `✅ ${SERILER[sr].ad}: ${MANKENLER[deger].ad}.${k.secilenOrtam.length ? "" : " Şimdi ortam(lar)ı seçip 💾 Kaydet'e basın."}`);
  }
  if (islem === "k" || islem === "y") {
    const secilen = k.secilenYuzler || (k.secilenYuz ? { kucuk: k.secilenYuz } : {});
    if (!Object.keys(secilen).length || !k.secilenOrtam.length) return islem === "k" ? cevap(!Object.keys(secilen).length ? "Önce yüz seçin." : "En az bir ortam seçin.") : null;
    const onceki = (await oku(env, "pelin:secim", null)) || {};
    const yuzler = { ...(onceki.yuzler || {}) };
    for (const [sr, mk] of Object.entries(secilen)) {
      const y = k.isler.find((x) => x.manken === mk);
      yuzler[sr] = { manken: mk, ad: MANKENLER[mk].ad, fileId: y.fileId, anahtar: await dosyaKaydet(env, y.fileId, "image/jpeg"), kaynak: `kurulum ${tarihSaatYaz(simdi)}` };
    }
    const secim = { ...onceki, yuzler, yuz: yuzler.kucuk || yuzler.buyuk, ortamlar: k.ortamlar.filter((x) => k.secilenOrtam.includes(x.id)), arac: onceki.arac || "veo", zaman: simdi };
    await kaydet(env, "pelin:secim", secim);
    if (islem === "k") await cevap("Kaydedildi");
    return yaz(env, murat(env), `💾 Kalıcı seçim kaydedildi: ${Object.keys(SERILER).filter((sr) => yuzler[sr]).map((sr) => `${SERILER[sr].ad} = ${yuzAdi(yuzler[sr])}`).join("; ")}; ortam: ${secim.ortamlar.map((x) => x.ad).join(", ")}. Ortam rolleri için Pelin'e yazın (katalog / video / kampanya). Üretim: /uret 3557`);
  }
}

// ---------- Üretim ----------
// Site verisi (veri/urunler.json) bir DİZİ döner (3 Kasım düzeltmesi: önceden "{ liste }" sanılıyordu → site fotoğrafı hiç bulunmuyordu)
async function siteUrunu(env, kod) {
  const v = await siteVerisi(env).catch(() => []);
  const liste = Array.isArray(v) ? v : (v && v.liste) || [];
  return liste.find((x) => String(x.kod) === String(kod)) || null;
}
// Üretimde kullanılacak ürün fotoğrafları: önce Patron/Hemra'nın gönderdikleri (istenen renkte olanlar; ön, arka, detay sırası),
// yoksa site. Döner: { urller, roller, kaynak }
async function urunFotoSecimi(env, kod, renk = null) {
  const elle = fotoSirala(await oku(env, `pelin:urunfoto:${kod}`, []));
  if (elle.length) {
    const ayni = renk ? elle.filter((x) => x.renk === renk) : [];
    const l = (ayni.length ? ayni : elle).slice(0, 3);
    return { urller: l.map((x) => dosyaAdresi(env, x.anahtar)), roller: l.map((x) => x.rol), kaynak: "patron" };
  }
  const u = await siteUrunu(env, kod);
  const urller = u ? (u.fotolar || []).filter((f) => /^galeri\//.test(f)).slice(0, 3).map((f) => `${SITE}/${f}`) : [];
  return { urller, roller: [], kaynak: "site" };
}
async function urunFotolari(env, kod) { return (await urunFotoSecimi(env, kod)).urller; }
// ---------- BOY ve KADRAJ (3 Kasım, Patron): her modelin boyu BİR KEZ kaydedilir (bütün renklerde, iki seride geçerli) ----------
// Kayıt KV "pelinboy:<kod>" (Pelin dışındaki botlar da okur — Venom): { boy, ayakkabiGorunur, yereDegmez, referans: [{ anahtar, tur }], kaynak, zaman }
export const BOYLAR = {
  mini: { ad: "mini", en: "mini length: the hem ends at mid-thigh" },
  diz: { ad: "diz", en: "knee length: the hem ends right at the knees" },
  midi: { ad: "midi", en: "midi length: the hem ends at mid-calf" },
  bilek: { ad: "bilek", en: "ankle length: the hem ends exactly at the ankles; the shoes and feet are fully visible and the hem does NOT touch the floor (clear space between hem and floor)" },
  maksi: { ad: "maksi", en: "maxi floor length: the hem just reaches the floor" },
};
export const boyOku = async (env, kod) => (await env.KAYIT.get(`pelinboy:${kod}`, "json")) || null;
const boyYaz = async (env, kod, kayit) => { await env.KAYIT.put(`pelinboy:${kod}`, JSON.stringify({ ...((await boyOku(env, kod)) || {}), ...kayit })); };
export const boyYazi = (b) => (b && BOYLAR[b.boy] ? `${BOYLAR[b.boy].ad}${b.boy === "bilek" ? " (ayakkabı görünür, etek yere değmez)" : ""}${(b.referans || []).length ? " · referans var" : ""}` : "kayıtlı değil");
const boyIstemi = (b) => (b && BOYLAR[b.boy] ? ` LENGTH (most important after the garment itself): ${BOYLAR[b.boy].en}. Keep exactly this length on her body (also on a curvy plus-size figure).` : "");
const KADRAJ_ISTEMI = " FRAMING: full body from head to toe — never crop the head or the shoes; leave a little space above the head and below the feet. SHOES: simple, elegant shoes that suit the setting and do not draw attention away from the dress.";
const refIstemi = (n) => (n ? ` The LAST image is a LENGTH/FRAMING reference only (a different woman and a different dress): copy only how long the dress is relative to her body and the full-body framing with the feet visible. Do NOT copy that woman's face, body, dress, color or anything else.` : "");

// Patron/Hemra'nın "boy referansı" (ön/arka ürün fotoğrafından AYRI): yazıda kod + "boy" ("3627 boy", "3627 boy referansı"); fotoğraf, dosya ya da video
async function boyReferansAl(env, m) {
  const yazi = String(m.caption || "").toLocaleLowerCase("tr");
  const kod = (yazi.match(/\b(\d{3,6})\b/) || [])[1];
  if (!kod || !/\bboy/.test(yazi)) return false;
  const f = m.photo ? { id: m.photo[m.photo.length - 1].file_id, tur: "image/jpeg", cesit: "foto" } : m.document && /^image\//.test(m.document.mime_type || "") ? { id: m.document.file_id, tur: m.document.mime_type, cesit: "foto" } : m.video || (m.document && /^video\//.test(m.document.mime_type || "")) ? { id: (m.video || m.document).file_id, tur: (m.video || m.document).mime_type || "video/mp4", cesit: "video" } : null;
  if (!f) return false;
  if (f.cesit === "foto" && !DESTEKLI.test(f.tur)) { await yaz(env, m.chat.id, `Bu dosya türü (${f.tur}) kullanılamıyor. Fotoğrafı JPEG/PNG olarak gönderin.`); return true; }
  const b = (await boyOku(env, kod)) || {};
  const boy = Object.keys(BOYLAR).find((x) => new RegExp(`\\b${x}`).test(yazi)) || b.boy || null;
  const referans = [{ anahtar: await dosyaKaydet(env, f.id, f.tur), tur: f.cesit, zaman: m.date }, ...(b.referans || [])].slice(0, 3);
  await boyYaz(env, kod, { ...(boy ? { boy } : {}), referans, zaman: Math.floor(Date.now() / 1000) });
  await yaz(env, m.chat.id, `📏 ${kod} boy referansı kaydedildi (${f.cesit === "video" ? "video" : "fotoğraf"}; ön/arka ürün fotoğraflarından ayrı). Boy: ${boy ? BOYLAR[boy].ad : "henüz kayıtlı değil — ilk üretimde sorarım"}. Bütün renklerde ve iki seride geçerli.${boy ? `\nÜretim: /uret ${kod}` : ""}`);
  return true;
}

// Boy tahmini (Pelin): boy referansı + ürün fotoğrafları → { boy, emin, neden }
const BOY_SEMA = { type: "object", additionalProperties: false, required: ["boy", "emin", "neden"], properties: { boy: { type: "string", enum: Object.keys(BOYLAR) }, emin: { type: "boolean" }, neden: { type: "string" } } };
async function boyTahmini(env, kod, simdi) {
  const b = (await boyOku(env, kod)) || {};
  const ref = (b.referans || []).filter((x) => x.tur === "foto").slice(0, 2).map((x) => dosyaAdresi(env, x.anahtar));
  const urun = (await urunFotoSecimi(env, kod)).urller;
  if (!ref.length && !urun.length) return null;
  return claudeJson(env, [{ type: "text", text: `Model ${kod} — elbise/etek BOYU nedir? Ürün fotoğrafları${ref.length ? " ve boy referansı (son görseller)" : ""}:` }, ...[...urun, ...ref].map(resimUrl), { type: "text", text: "Seçenekler: mini (uyluk ortası), diz, midi (baldır ortası), bilek (etek bilekte biter, ayakkabı görünür), maksi (yere kadar). Kıyafet giyilmiş hâlde vücutta nerede bitiyor? emin: kesin değilsen false. neden: kısa Türkçe." }], BOY_SEMA, simdi, 300);
}
const boyKlavye = (id, tahmin) => ({ inline_keyboard: [[...(tahmin ? [{ text: `✅ Evet, ${BOYLAR[tahmin].ad}`, callback_data: `pb:${tahmin}:${id}` }] : []), ...Object.keys(BOYLAR).filter((x) => x !== tahmin).map((x) => ({ text: BOYLAR[x].ad[0].toLocaleUpperCase("tr") + BOYLAR[x].ad.slice(1), callback_data: `pb:${x}:${id}` }))]] });
async function boySorusu(env, m, kod, simdi, test) {
  const t = await boyTahmini(env, kod, simdi).catch(() => null);
  const id = kisaId();
  await kaydet(env, `pelin:boySoru:${id}`, { kod, metin: m.text, test: Boolean(test), tahmin: t && t.boy }, 3 * 86400);
  return yaz(env, m.chat.id, t ? `📏 ${kod}: ${t.boy} boyu mu?${t.emin ? "" : " (emin değilim)"} ${t.neden}\nBir kez kaydedilir; bütün renklerde ve iki seride geçerli. Sonra maliyet kartı gelir.` : `📏 ${kod}: boyu nedir? Bir kez kaydedilir; sonra maliyet kartı gelir.`, { reply_markup: boyKlavye(id, t && t.boy) });
}
async function boyDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, boy, id] = cq.data.split(":");
  const q = await oku(env, `pelin:boySoru:${id}`, null);
  if (!q || !BOYLAR[boy]) return cevap("Bu soru artık geçerli değil.");
  await env.KAYIT.delete(`pelin:boySoru:${id}`);
  await boyYaz(env, q.kod, { boy, ayakkabiGorunur: boy === "bilek" || undefined, yereDegmez: boy === "bilek" || undefined, kaynak: `Patron ${tarihSaatYaz(simdi)}${q.tahmin === boy ? " (Pelin tahmini onaylandı)" : ""}`, zaman: simdi });
  await cevap("Kaydedildi");
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `📏 ${q.kod} boyu kaydedildi: ${BOYLAR[boy].ad}. Bütün renklerde ve iki seride geçerli.` });
  return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: q.metin }, simdi, q.test); // sıradaki boy sorusu ya da maliyet kartı
}

// Sahne ayarları (3 Kasım, Patron — 3627 brifi): yeni işlerin hepsinde; şablon bunları değiştirebilir
export const SAHNE_VARSAYILAN = {
  acilis: "Strong first second: she is walking and turns to face the camera.",
  kamera: "The camera slowly orbits around her so that both the front and the back of the outfit are clearly seen, matching the product photos exactly.",
  kumas: "The fabric moves naturally; the skirt sways and flows as she moves.",
  detay: true, // yakın detay karesi: yaka / dikiş
  sonYazi: true, // son karede küçük VOLONTE + model kodu (fiyat yok)
  hiz: "Smooth natural pace with a gentle cinematic slow-motion feel.",
};
const renkIstemi = (renk) => (renk ? ` COLOR: the garment must be the ${renkEn(renk)} (${renk}) color variant ONLY — exactly that shade as in the product photos (not brighter, not more saturated); if the photos show several colors, use only the ${renkEn(renk)} one.` : "");
const rolIstemi = (roller) => (roller && roller.length ? ` Product photos after the face image: ${roller.map((r, i) => `image ${i + 2} = ${r === "arka" ? "BACK view" : r === "detay" ? "close-up detail" : "FRONT view"}`).join(", ")}. The front and back must match these photos exactly.` : "");
export function yeniVideoIstemi(is) {
  const a = is.sahneAyar || SAHNE_VARSAYILAN, o = is.videoOrtam || is.ortam, t = is.sablon && is.sablon.kamera ? is.sablon : null;
  return [
    `Vertical 9:16, ${URETIM_SN}-second fashion video of the same woman wearing exactly the same garment.${renkIstemi(is.renk)}${boyIstemi(is.boy)}`,
    o ? `Setting and atmosphere: ${String(o.sahne).replace(/\.?\s*$/, ".")}` : "Setting: clean bright studio.",
    t ? `Style reference (do not copy any real person): camera ${t.kamera}; light ${t.isik}; pace ${t.hiz}; pose ${t.poz}.` : "",
    a.acilis, a.kamera, a.kumas, is.boy ? "Wide shots show her full body with the shoes visible; elegant simple shoes." : "",
    a.detay ? "Include one brief smooth close-up of the neckline/collar and stitching detail." : "",
    a.hiz,
    a.sonYazi ? `The last second ends on an elegant frame with a small, tasteful gold text "VOLONTE" and directly below it the model code "${is.kod}" in a corner; no other text anywhere, no price.` : "No text anywhere.",
    `Her face stays exactly the same.${MAKYAJ}${YAKA_DETAY}${detayIstemi(is.modelKaydi)} Realistic natural skin; natural light; hands and fingers natural and flawless. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no logo, no watermark, no music.`,
  ].filter(Boolean).join(" ");
}
const uretimFotoIstemi = (ortam, sablon, is = {}) => `${FOTO_ISTEMI.replace("clean light studio background, soft natural light", "")} Setting: ${ortam ? ortam.sahne : "clean light studio background, soft natural light"}.${sablon && sablon.isik ? ` Mood and lighting reference (do not copy any real person, logo or text): ${sablon.isik}; ${sablon.ortam_havasi || ""}.` : ""}${rolIstemi(is.urunRoller)}${renkIstemi(is.renk)}${boyIstemi(is.boy)}${is.boy ? KADRAJ_ISTEMI : ""}${YAKA_DETAY}${detayIstemi(is.modelKaydi)}${MAKYAJ}${refIstemi((is.boyRef || []).length)} Realistic natural skin, flawless natural hands. The garment is the most important thing: keep it 100% identical to the product photos.`;
const sahneIstemi = (ortam, is = {}) => `Vertical (9:16) photo of the SAME woman as in the first image (same face, skin tone, hair and body), wearing EXACTLY the garment shown in the other image(s) — identical colors, print, motif size and placement, fabric, cut, length and every detail; do not redesign or recolor anything. Setting: ${ortam.sahne}. Natural pose as the first frame of a short fashion video: she is walking and about to turn to the camera, full body, photorealistic, natural skin, natural light, sharp.${rolIstemi(is.urunRoller)}${renkIstemi(is.renk)}${boyIstemi(is.boy)}${is.boy ? KADRAJ_ISTEMI : ""}${YAKA_DETAY}${detayIstemi(is.modelKaydi)}${MAKYAJ}${refIstemi((is.boyRef || []).length)} No text, no logo, no watermark.`;
const uretimVideoIstemi = (ortam, sablon) => `${sablon ? `${sablon.kamera}. ${sablon.poz}. ${sablon.hiz}.` : ortam ? ortam.hareket : VIDEO_ISTEMI} The woman's face stays the same. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no text, no logo, no watermark, no music.`;

async function uretKomutu(env, m, simdi, test = false) {
  if (!muratMi(env, m.from.id)) return yaz(env, m.chat.id, "Üretimi sadece Patron başlatır.");
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return yaz(env, m.chat.id, "Önce kurulum: /kurulum (yüz + ortam seçimi).");
  const sozler = String(m.text || "").split(/\s+/).slice(1);
  const buyukler = sozler.map((x) => (x.match(/^b[üu]y[üu]k:(\d{3,6})$/i) || [])[1]).filter(Boolean);
  const kodlar = [...new Set([...sozler.filter((x) => /^\d{3,6}(:.+)?$/.test(x)).map((x) => x.split(":")[0]), ...buyukler])].slice(0, test ? 5 : 40);
  // Renk: "/uret 3627 kırmızı" ya da "3627:kırmızı" → sadece o renk
  const renkler = {};
  let sonKod = null, onceki = "";
  for (const x of sozler) {
    const kk = (x.match(/^(?:b[üu]y[üu]k:)?(\d{3,6})(?::(.+))?$/i) || []);
    if (kk[1]) { sonKod = kk[1]; if (kk[2] && renkGecerli(kk[2])) renkler[kk[1]] = kk[2].toLocaleLowerCase("tr"); continue; }
    const rk = x.toLocaleLowerCase("tr");
    if (sonKod && RENKLER[rk]) renkler[sonKod] = /^(koyu|açık|acik)$/.test(onceki) ? `${onceki} ${rk}` : rk;
    onceki = rk;
  }
  const sablonAd = (sozler.find((x) => /^şablon:|^sablon:/i.test(x)) || "").split(":")[1] || null;
  if (!kodlar.length) return yaz(env, m.chat.id, test ? "Kullanım: /maliyettesti 3557 3592 3577 3601 3602 (5 model)" : "Kullanım: /uret 3557 [3592 …] [şablon:ad]");
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  if (sablonAd && !sablonlar[sablonAd]) return yaz(env, m.chat.id, `"${sablonAd}" adlı şablon yok. /sablonlar`);
  const boylar = {};
  for (const k of kodlar) boylar[k] = await boyOku(env, k);
  const boysuz = kodlar.find((k) => !(boylar[k] && BOYLAR[boylar[k].boy]));
  if (boysuz) return boySorusu(env, m, boysuz, simdi, test); // ilk üretimden önce boy bir kez sorulur
  const mm = uretimMaliyeti(secim.arac, secim);
  const toplam = yuvarla(mm.toplam * kodlar.length);
  const harcanan = await buAyHarcanan(env, simdi);
  const id = kisaId();
  const seriler = {};
  for (const k of kodlar) seriler[k] = buyukler.includes(k) ? "buyuk" : seriBul((await siteUrunu(env, k) || {}).bedenler);
  const foto = {};
  for (const k of kodlar) foto[k] = await urunFotoSecimi(env, k, renkler[k] || null);
  await kaydet(env, `pelin:uretimOnay:${id}`, { kodlar, sablonAd, test, seriler, renkler, zaman: simdi }, 3 * 86400);
  const kat = rolOrtami(secim, "katalog"), vid = rolOrtami(secim, "video");
  return yaz(env, m.chat.id, [
    `💰 ${test ? "MALİYET TESTİ" : "Üretim"} — ${kodlar.length} model: ${kodlar.join(", ")}${sablonAd ? ` (şablon: ${sablonAd})` : ""}`,
    `Yüz: ${kodlar.map((k) => `${k} ${seriler[k] === "buyuk" ? "büyük seri" : "küçük seri"} (${yuzAdi(seriYuzu(secim, seriler[k]))})`).join(", ")}`,
    ...(Object.keys(renkler).length ? [`Renk: ${Object.entries(renkler).map(([k, rk]) => `${k} sadece ${rk}`).join(", ")}`] : []),
    `Ürün fotoğrafı: ${kodlar.map((k) => `${k} ${foto[k].kaynak === "patron" ? `sizin gönderdiğiniz (${foto[k].roller.map((x) => ROL_AD[x]).join(", ")})` : foto[k].urller.length ? "site" : "YOK ⚠️"}`).join(", ")}`,
    `Boy: ${kodlar.map((k) => `${k} ${boyYazi(boylar[k])}`).join(", ")}`,
    `Ortam: katalog fotoğrafı ${kat ? kat.ad : "stüdyo"} · video ${sablonAd && sablonlar[sablonAd] && sablonlar[sablonAd].kaynak === "ornek" ? `örnek videonun ortamı (${sablonAd})` : vid ? vid.ad : "stüdyo"}`,
    `Kadraj: tam boy (baş ve ayakkabı kesilmez) · sade, zarif ayakkabı`,
    `Sahne: yürürken kameraya dönüş · kamera etrafında dönüş · kumaş hareketi · yaka/dikiş yakın kare · son karede küçük VOLONTE + kod (fiyat yok) · kapak fotoğrafı videodan${sablonAd ? ` · şablon ${sablonAd}` : ""}`,
    ...mm.kalemler.map((k) => `• ${k.ad}: ${para(k.birim)}`),
    `Model başı ~${para(mm.toplam)} · toplam ~${para(toplam)} (kalite kontrol yeniden ürettirirse en fazla 2 katı)`,
    `Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $${harcanan + toplam > AYLIK_SINIR_USD ? " ⚠️ SINIRI AŞAR" : ""}`,
  ].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:o:${id}` }, { text: "❌ İptal", callback_data: `pu:i:${id}` }]] } });
}

// Venom'dan gelen üretim (Patron Venom'da kartı onaylamış, "Emin misiniz?" demiş): kurulum ve aylık sınır burada da kontrol edilir
export async function venomUretimi(env, onay, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return { hata: "kurulum yapılmamış (Pelin'e /kurulum: yüz + ortam seçimi)" };
  for (const k of onay.kodlar) if (!((await boyOku(env, k)) || {}).boy) return { hata: `${k} için boy kayıtlı değil — Pelin'e "/uret ${k}" yazın, boyu bir kez sorar` };
  const tahmin = yuvarla(uretimMaliyeti(secim.arac, secim).toplam * onay.kodlar.length);
  const harcanan = await buAyHarcanan(env, simdi);
  if (harcanan + tahmin > AYLIK_SINIR_USD) return { hata: `aylık sınır aşılır (bu ay ${para(harcanan)} / ${AYLIK_SINIR_USD} $, bu iş ~${para(tahmin)}); sınırı artırmak Patron onayıyla` };
  await uretimBaslat(env, onay, simdi);
  return { ok: true };
}

async function uretimBaslat(env, onay, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  const liste = await oku(env, "pelin:isler", []);
  const testId = onay.test ? `t-${kisaId()}` : null;
  for (const [i, kod] of onay.kodlar.entries()) {
    const renk = (onay.renkler && onay.renkler[kod]) || null;
    const fs = await urunFotoSecimi(env, kod, renk);
    const urunler = fs.urller;
    const id = `${kod}-${kisaId()}`;
    const seri = (onay.seriler && onay.seriler[kod]) || seriBul((await siteUrunu(env, kod) || {}).bedenler);
    const sablon = onay.sablonAd ? sablonlar[onay.sablonAd] || null : null;
    // eski örnek-video şablonları (kaynak alanı yok): kamera tarifi var, sahne ayarı yok
    if (sablon && !sablon.kaynak && sablon.kamera && !sablon.sahne) sablon.kaynak = "ornek";
    const ortamBul = (oid) => (oid ? (secim.ortamlar || []).find((o) => o.id === oid) || null : null);
    const ortam = (sablon && ortamBul(sablon.katalogOrtamId)) || rolOrtami(secim, "katalog", i);
    const ornekOrtam = sablon && sablon.kaynak === "ornek" && sablon.ortam_havasi ? { id: `ornek-${sablon.ad}`, ad: `örnek video (${sablon.ad})`, sahne: sablon.ortam_havasi } : null;
    const videoOrtam = ornekOrtam || (sablon && ortamBul(sablon.videoOrtamId)) || rolOrtami(secim, "video", i);
    const boy = await boyOku(env, kod);
    const is = { id, kod, testId, seri, renk, modelKaydi: boy && (boy.detayEn || boy.detayTr) ? { detayEn: boy.detayEn || null, detayTr: boy.detayTr || null } : null, boy: boy && BOYLAR[boy.boy] ? { boy: boy.boy } : null, boyRef: ((boy && boy.referans) || []).filter((x) => x.tur === "foto").slice(0, 1).map((x) => dosyaAdresi(env, x.anahtar)), urunRoller: fs.roller, urunKaynak: fs.kaynak, sahneAyar: { ...SAHNE_VARSAYILAN, ...((sablon && sablon.sahne) || {}) }, ortam, videoOrtam: videoOrtam && (!ortam || videoOrtam.id !== ortam.id) ? videoOrtam : null, sahneDeneme: 0, sablon, urunler, durum: urunler.length ? "foto_gonder" : "hata", fotoDeneme: 0, videoDeneme: 0, maliyet: 0, zaman: simdi, gecmis: [] };
    if (!urunler.length) is.hata = "ürün fotoğrafı yok (sitede değil; fotoğrafı yazısında model koduyla Pelin'e gönderin: \"3627 ön\", \"3627 arka\")";
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
  const yuz = dosyaAdresi(env, seriYuzu(secim, is.seri || "kucuk").anahtar);
  const arac = secim.arac || "veo";
  const bekle = async () => {
    const s = await falDurum(env, is.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti) { if (simdi - is.bekleZaman > 3 * 3600) return { hata: "3 saatte bitmedi" }; return null; }
    if (s.hata) { await harcamaYaz(env, -is.falFiyat, simdi); is.maliyet = yuvarla(is.maliyet - is.falFiyat); }
    return s;
  };
  if (is.durum === "foto_gonder") {
    is.fotoDeneme++;
    await falIsle(env, is, GORSEL.duzenle, { prompt: uretimFotoIstemi(is.ortam, is.sablon, is), image_urls: [yuz, ...is.urunler.slice(0, 3), ...(is.boyRef || [])], num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" }, GORSEL.fiyat, simdi);
    is.durum = "foto_bekle"; return;
  }
  if (is.durum === "foto_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.durum = is.fotoDeneme < URETIM_DENEME ? "foto_gonder" : "uyari"; is.sorunlar = [`fotoğraf üretilemedi: ${s.hata}`]; return; }
    is.foto = s.resimler[0];
    const k = await kaliteKontrol(env, is.urunler, [is.foto], simdi, { renk: is.renk, boy: is.boy, yuz: Boolean(is.sahneAyar) });
    notEkle(is, k);
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.fotoKontrol = k; is.gecmis.push([simdi, `foto ${is.fotoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = is.videoOrtam && (is.sahneAyar || !is.sablon) ? "sahne_gonder" : "video_gonder"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.fotoDeneme < URETIM_DENEME ? "foto_gonder" : "uyari"; return;
  }
  // Video başlangıç karesi (video ortamı, ör. "Live Your Life Şehir"): katalog fotoğrafından ayrı, aynı yüz + aynı kıyafet
  if (is.durum === "sahne_gonder") {
    is.sahneDeneme = (is.sahneDeneme || 0) + 1;
    await falIsle(env, is, GORSEL.duzenle, { prompt: sahneIstemi(is.videoOrtam, is), image_urls: [yuz, ...is.urunler.slice(0, 3), ...(is.boyRef || [])], num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" }, GORSEL.fiyat, simdi);
    is.durum = "sahne_bekle"; return;
  }
  if (is.durum === "sahne_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.durum = is.sahneDeneme < URETIM_DENEME ? "sahne_gonder" : "uyari"; is.sorunlar = [`video karesi üretilemedi: ${s.hata}`]; return; }
    is.sahne = s.resimler[0];
    const k = await kaliteKontrol(env, is.urunler, [is.sahne], simdi, { renk: is.renk, boy: is.boy, yuz: true });
    notEkle(is, k);
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.sahneKontrol = k; is.gecmis.push([simdi, `video karesi ${is.sahneDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = "video_gonder"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.sahneDeneme < URETIM_DENEME ? "sahne_gonder" : "uyari"; return;
  }
  if (is.durum === "video_gonder") {
    is.videoDeneme++;
    const g = { ...videoGirdisi(arac, is.sahne || is.foto), prompt: is.sahneAyar ? yeniVideoIstemi(is) : uretimVideoIstemi(is.videoOrtam || is.ortam, is.sablon) };
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
    const sonYazi = is.sahneAyar && is.sahneAyar.sonYazi ? is.kod : null;
    const k = kareler.length ? await kaliteKontrol(env, is.urunler, kareler, simdi, { renk: is.renk, sonYazi }) : { gecti: false, sorunlar: ["video kareleri alınamadı"] };
    notEkle(is, k);
    if (k.gecti && sonYazi && is.kareler[2] && is.kareler[2] !== "yok") { // son kare: küçük VOLONTE + doğru kod, başka yazı/fiyat yok
      const y = await sonKareYazisi(env, is.kareler[2], is.kod, simdi).catch((e) => ({ tamam: false, sorun: `son kare okunamadı: ${String(e.message).slice(0, 80)}` }));
      is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN);
      if (!y.tamam) { k.gecti = false; k.sorunlar = [...(k.sorunlar || []), y.sorun]; }
    }
    if (k.gecti && is.sahneAyar) is.kapak = is.kareler[1] && is.kareler[1] !== "yok" ? is.kareler[1] : is.sahne || is.foto; // kapak: videonun orta karesi
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.videoKontrol = k; is.gecmis.push([simdi, `video ${is.videoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = "onay"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.videoDeneme < URETIM_DENEME ? "video_gonder" : "uyari"; return;
  }
}
const isKlavye = (id, sablon = false, uyari = false) => ({ inline_keyboard: [[{ text: uyari ? "✅ Yine de onayla" : "✅ Onayla", callback_data: `pu:a:${id}` }, { text: "🔄 Yeniden üret", callback_data: `pu:r:${id}` }, { text: "❌ İptal", callback_data: `pu:x:${id}` }], ...(sablon ? [[{ text: "💾 Bu ayarları şablon olarak kaydet", callback_data: `pu:s:${id}` }]] : [])] });
// Kontrolden geçmeyen iş "yine de onayla" ile nereden devam eder?
export function devamAsamasi(is) {
  if (is.video) return "teslim";
  if (is.sahne) return "video_gonder";
  if (is.foto) return is.videoOrtam && (is.sahneAyar || !is.sablon) && !(is.sahneKontrol && is.sahneDeneme) ? "sahne_gonder" : "video_gonder";
  return null;
}
const notSatirlari = (is) => ((is.notlar || []).length ? ["📝 Küçük farklar (üretimi durdurmadı):", ...is.notlar.slice(0, 6).map((n) => `• ${n}`)] : []);
const puanSatiri = (is) => {
  const p = [["foto", is.fotoKontrol], ["video karesi", is.sahneKontrol], ["video", is.videoKontrol]].filter(([, k]) => k && k.puan && (k.puan.pelin || k.puan.chatgpt)).map(([ad, k]) => `${ad} ${k.puan.pelin ?? "—"}${k.puan.chatgpt ? `/${k.puan.chatgpt}` : ""}`);
  return p.length ? `🎯 Kontrol puanı (Pelin/ChatGPT, 10 üzerinden): ${p.join(" · ")}` : "";
};
async function teslimEt(env, is, simdi) {
  is.durum = "onaylandi"; is.onayZaman = simdi;
  await kaydet(env, `pelin:is:${is.id}`, is);
  const l = (await env.KAYIT.get("venom:pelinTeslim", "json")) || [];
  l.push({ kod: is.kod, foto: is.foto, video: is.video, kapak: is.kapak || null, renk: is.renk || null, ortam: is.ortam ? is.ortam.ad : null, zaman: simdi });
  await env.KAYIT.put("venom:pelinTeslim", JSON.stringify(l.slice(-100)));
}
async function ogrenmeYaz(env, kayit) {
  const l = await oku(env, "pelin:ogrenme", []);
  l.push(kayit);
  await kaydet(env, "pelin:ogrenme", l.slice(-60));
}
async function isBildir(env, is) {
  const ust = `${is.kod} · ${is.seri === "buyuk" ? "büyük seri" : "küçük seri"} · ${is.ortam ? is.ortam.ad : "stüdyo"}${is.videoOrtam ? ` / video ${is.videoOrtam.ad}` : ""}${is.sablon ? ` · şablon ${is.sablon.ad}` : ""} · foto ${is.fotoDeneme}. deneme, video ${is.videoDeneme}. deneme`;
  if (is.durum === "uyari") {
    if (is.foto) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `⚠️ ${is.kod}: ${URETIM_DENEME} denemede kalite kontrolünden geçmedi.` });
    if (is.sahne) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.sahne, caption: `🎞 ${is.kod} (video karesi)` });
    if (is.video) await tg(env, "sendVideo", { chat_id: murat(env), video: is.video, caption: `🎬 ${is.kod}` });
    const devam = devamAsamasi(is);
    return yaz(env, murat(env), [`⚠️ ${ust}`, "Büyük farklar:", ...(is.sorunlar || []).slice(0, 6).map((s) => `• ${s}`), ...notSatirlari(is), puanSatiri(is),
      devam === "teslim" ? "Beğendiyseniz ✅ Yine de onayla: teslim kuyruğuna alınır (son söz sizde)." : devam ? `Beğendiyseniz ✅ Yine de onayla: bu fotoğrafla devam ederim (${devam === "sahne_gonder" ? "video karesi + video" : "video"}).` : "Fotoğraf üretilemedi; yeniden üretin ya da iptal edin."].filter(Boolean).join("\n"), { reply_markup: isKlavye(is.id, false, true) });
  }
  if (is.foto) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `📸 ${is.kod} (katalog)` });
  if (is.sahne) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.sahne, caption: `🎞 ${is.kod} (video karesi)` });
  if (is.video) await tg(env, "sendVideo", { chat_id: murat(env), video: is.video, caption: `🎬 ${is.kod}` });
  if (is.kapak) await tg(env, "sendPhoto", { chat_id: murat(env), photo: is.kapak, caption: `🖼 ${is.kod} kapak (videodan)` });
  const kk = (k) => (k ? `Pelin ${k.claude ? "✅" : "❌"} · ChatGPT ${k.openai === true ? "✅" : k.openai === false ? "❌" : k.openai}` : "—");
  if ((await oku(env, "pelin:ayar", {})).hemraOnay && hemra(env)) {
    if (is.video) await tg(env, "sendVideo", { chat_id: hemra(env), video: is.video, caption: `🎬 ${is.kod} — Pelin önizlemesi` });
    await yaz(env, hemra(env), `👁 ${is.kod} önizlemesi. Uygunsa ✅ Onayla (Patron da görüyor).`, { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:a:${is.id}` }]] } });
  }
  return yaz(env, murat(env), [`👁 ÖNİZLEME — ${ust}`, `Kalite kontrol: foto ${kk(is.fotoKontrol)} | video ${kk(is.videoKontrol)}${is.sahneAyar && is.sahneAyar.sonYazi ? " · son kare yazısı ✅" : ""}${(is.patronOnay || []).length ? " · ⚠️ bir aşama Patron onayıyla geçti" : ""}`, puanSatiri(is), ...notSatirlari(is), `Ürün fotoğrafı: ${is.urunKaynak === "patron" ? "sizin gönderdiğiniz" : "site"}${is.renk ? ` · renk ${is.renk}` : ""}${is.boy ? ` · boy ${BOYLAR[is.boy.boy].ad}${(is.boyRef || []).length ? " (referanslı)" : ""}` : ""}`, "Onaylarsanız Selin siteye, Kemal kanala alır. Beğendiyseniz ayarları şablon olarak kaydedin."].join("\n"), { reply_markup: isKlavye(is.id, Boolean(is.sahneAyar)) });
}
export async function uretimCron(env, simdi) {
  const liste = await oku(env, "pelin:isler", []);
  let islenen = 0;
  for (const id of liste) {
    if (islenen >= 8) break;
    const is = await oku(env, `pelin:is:${id}`, null);
    if (!is || !["foto_gonder", "foto_bekle", "sahne_gonder", "sahne_bekle", "video_gonder", "video_bekle", "kare_bekle"].includes(is.durum)) continue;
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
  const [, islem, id] = cq.data.split(":");
  const hemraYetkili = String(cq.from.id) === hemra(env) && islem === "a" && Boolean((await oku(env, "pelin:ayar", {})).hemraOnay);
  if (!muratMi(env, cq.from.id) && !hemraYetkili) return cevap("Sadece Patron.");
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
  if (islem === "s" && is && ["onay", "onaylandi"].includes(is.durum)) {
    const ad = await sablonKaydet(env, is, simdi);
    await cevap("Şablon kaydedildi");
    return yaz(env, cq.message.chat.id, `💾 "${ad} şablonu" kaydedildi (ortamlar, sahne ayarları, video aracı${is.sablon && is.sablon.kamera ? ", örnek video tarifi" : ""}). Kullanmak için: /uret 3630 şablon:${ad} — ya da Pelin'e "3630'u ${ad} şablonuyla yap" yazın.`);
  }
  if (!is || !["onay", "uyari"].includes(is.durum)) return cevap("Bu iş artık beklemiyor.");
  if (islem === "x") { is.durum = "iptal"; await kaydet(env, `pelin:is:${id}`, is); await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "iptal", farklar: (is.sorunlar || []).slice(0, 4), notlar: (is.notlar || []).slice(0, 4) }); await cevap("İptal"); return kapat(`❌ ${is.kod} iptal edildi.`); }
  // PATRON SON SÖZ (3 Kasım): kontrolden geçmeyen işi Patron yine de onaylayabilir → kaldığı yerden devam ya da teslim
  if (islem === "a" && is.durum === "uyari") {
    const devam = devamAsamasi(is);
    if (!devam) return cevap("Fotoğraf yok; yeniden üretin.");
    is.patronOnay = [...(is.patronOnay || []), { zaman: simdi, asama: devam, sorunlar: (is.sorunlar || []).slice(0, 6) }];
    await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "yine de onay", farklar: (is.sorunlar || []).map((x) => x.replace(/^(Pelin|ChatGPT|İkinci göz): /, "")).slice(0, 4), notlar: (is.notlar || []).slice(0, 4) });
    if (devam === "teslim") { await teslimEt(env, is, simdi); await cevap("Onaylandı"); return kapat(`✅ ${is.kod} Patron onayıyla teslim kuyruğuna alındı (Selin site, Kemal kanal).`); }
    Object.assign(is, { durum: devam, sorunlar: [], ...(devam === "sahne_gonder" ? { sahneDeneme: 0 } : { videoDeneme: 0 }) });
    await kaydet(env, `pelin:is:${id}`, is);
    await cevap("Devam ediyorum");
    return kapat(`✅ ${is.kod}: fotoğraf Patron onayıyla geçti — ${devam === "sahne_gonder" ? "video karesi ve video" : "video"} üretiliyor. Hazır olunca önizleme gelecek.`);
  }
  if (islem === "r") { Object.assign(is, { durum: "foto_gonder", fotoDeneme: 0, sahneDeneme: 0, videoDeneme: 0, foto: null, sahne: null, video: null, kapak: null }); await kaydet(env, `pelin:is:${id}`, is); await cevap("Yeniden"); return kapat(`🔄 ${is.kod} yeniden üretiliyor.`); }
  if (islem === "a" && is.durum === "onay") {
    await teslimEt(env, is, simdi);
    await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "onay", farklar: [], notlar: (is.notlar || []).slice(0, 4) });
    await cevap("Onaylandı");
    return kapat(`✅ ${is.kod} onaylandı — teslim kuyruğuna alındı (Selin site, Kemal kanal).`);
  }
  return cevap("Bu düğme artık geçerli değil.");
}
// Beğenilen işin ayarları → şablon ("3627" → "3627 şablonu"): ortamlar, sahne ayarları, video aracı, varsa örnek video tarifi
async function sablonKaydet(env, is, simdi, ad = null) {
  const secim = (await oku(env, "pelin:secim", null)) || {};
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  const isim = String(ad || is.kod).toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]/g, "").slice(0, 20) || is.kod;
  const t = is.sablon && is.sablon.kamera ? is.sablon : {};
  sablonlar[isim] = { ad: isim, ozet: `${is.kod} işinin ayarları (${is.ortam ? is.ortam.ad : "stüdyo"}${is.videoOrtam ? ` / video ${is.videoOrtam.ad}` : ""})`, kamera: t.kamera, isik: t.isik, hiz: t.hiz, poz: t.poz, sahne: is.sahneAyar || SAHNE_VARSAYILAN, boy: is.boy ? { kod: is.kod, boy: is.boy.boy } : null, kaynak: is.sablon && is.sablon.kaynak === "ornek" ? "ornek" : "uretim", ortam_havasi: t.ortam_havasi, katalogOrtamId: is.ortam ? is.ortam.id : null, videoOrtamId: is.videoOrtam ? is.videoOrtam.id : null, arac: secim.arac || "veo", kaynakIs: is.id, zaman: simdi };
  await kaydet(env, "pelin:sablonlar", sablonlar);
  return isim;
}
async function sonIs(env, kod) {
  const liste = await oku(env, "pelin:isler", []);
  for (const id of [...liste].reverse()) { const is = await oku(env, `pelin:is:${id}`, null); if (is && String(is.kod) === String(kod)) return is; }
  return null;
}

// ---------- Örnek video → tarif → şablon ----------
async function ornekVideo(env, m, simdi) {
  if (!muratMi(env, m.from.id)) return false;
  const vid = m.video || (m.document && /^video\//.test(m.document.mime_type || "") ? m.document : null);
  const yazi = String(m.caption || m.text || "");
  const link = (yazi.match(/https?:\/\/\S+/) || [])[0];
  const siteKod = !vid && !link && /site/i.test(yazi) && /video/i.test(yazi) && /gibi|havas|örnek|ornek/i.test(yazi) ? (yazi.match(/\b(\d{3,6})\b/) || [])[1] : null;
  if (!vid && !siteKod && !(link && /gibi|örnek|ornek/i.test(yazi))) return false;
  let url;
  if (siteKod) {
    const u = await siteUrunu(env, siteKod);
    const v = u && (u.videolar || [])[0];
    const yeni = v && String(v).match(/^selin\/(\d{3,6})\/(\d+)$/);
    if (!yeni) { await yaz(env, m.chat.id, `Sitede ${siteKod} için video bulamadım. Örnek videoyu dosya olarak atın.`); return true; }
    url = `${SELIN_VIDEO}/v2/${yeni[1]}/${yeni[2]}`;
  } else if (vid) {
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
  await kaydet(env, `pelin:ornek:${id}`, { id, kod, yazi: yazi.slice(0, 300), kareFal, kareler: [], zaman: simdi }, 7 * 86400);
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
  sablonlar[ad] = { ...o.tarif, ad, kaynak: "ornek", zaman: simdi };
  await kaydet(env, "pelin:sablonlar", sablonlar);
  await cevap("Kaydedildi");
  if (islem === "u" && o.kod) {
    const y = fotoYazisi(o.yazi || ""), buyuk = /b[üu]y[üu]k/i.test(o.yazi || "");
    return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: `/uret ${buyuk ? "büyük:" : ""}${o.kod}${y.renk ? ` ${y.renk}` : ""} şablon:${ad}` }, simdi);
  }
  return yaz(env, cq.message.chat.id, `💾 Şablon kaydedildi: "${ad}". Kullanmak için: /uret 3557 şablon:${ad}`);
}

// ---------- Ürün fotoğrafları (3 Kasım, Patron): Patron/Hemra'nın gönderdiği fotoğraflar üretimde SİTEDEN ÖNCE kullanılır ----------
// Yazı: "3627", "3627 ön", "3627 arka", "3627 kırmızı ön", "3627 detay" … Albümde yazı ilk fotoğraftadır; diğerleri aynı koda
// eklenir (sıra: 1. ön, 2. arka, sonrası detay — yazıda açıkça yazılan rol önceliklidir). Fotoğraf ya da "dosya olarak" (renk netliği).
export const RENKLER = { "kırmızı": "red", "beyaz": "white", "siyah": "black", "lacivert": "navy blue", "mavi": "blue", "yeşil": "green", "bej": "beige", "pembe": "pink", "bordo": "burgundy", "mor": "purple", "sarı": "yellow", "turuncu": "orange", "gri": "grey", "kahverengi": "brown", "kahve": "brown", "krem": "cream", "ekru": "ecru", "fuşya": "fuchsia", "mint": "mint green", "haki": "khaki", "vizon": "mink taupe", "pudra": "powder pink", "somon": "salmon", "altın": "gold", "gümüş": "silver", "turkuaz": "turquoise", "lila": "lilac", "zümrüt": "emerald green", "taba": "tan", "petrol": "petrol blue", "mercan": "coral", "hardal": "mustard", "antrasit": "anthracite grey", "füme": "smoke grey", "nude": "nude", "ten": "nude" };
const DESTEKLI = /^image\/(jpeg|jpg|png|webp)$/i;
// "koyu bordo", "açık mavi" gibi tonlar da geçerli renk
export const renkGecerli = (r) => { const t = String(r || "").toLocaleLowerCase("tr").trim(); const m = t.match(/^(koyu|açık|acik)\s+(.+)$/); return Boolean(RENKLER[t] || (m && RENKLER[m[2]])); };
export const renkEn = (r) => { const t = String(r || "").toLocaleLowerCase("tr").trim(); const m = t.match(/^(koyu|açık|acik)\s+(.+)$/); return m && RENKLER[m[2]] ? `${m[1] === "koyu" ? "dark" : "light"} ${RENKLER[m[2]]}` : RENKLER[t] || t; };
export function fotoYazisi(yazi) {
  const t = String(yazi || "").toLocaleLowerCase("tr");
  const kod = (t.match(/\b(\d{3,6})\b/) || [])[1] || null;
  const rol = /\barka\b|\bback\b|\bsırt/.test(t) ? "arka" : /(^|\s)ön\b|\bon\b|\bfront\b/.test(t) ? "on" : /detay|yaka|dikiş|kumaş|yakın|detail/.test(t) ? "detay" : null;
  let renk = Object.keys(RENKLER).find((r) => new RegExp(`(^|[^a-zçğıöşü])${r}([^a-zçğıöşü]|$)`).test(t)) || null;
  if (renk) { const ton = t.match(new RegExp(`(koyu|açık|acik)\\s+${renk}`)); if (ton) renk = `${ton[1]} ${renk}`; }
  return { kod, rol, renk };
}
const fotoAl = (m) => (m.photo ? { foto: m.photo[m.photo.length - 1], tur: "image/jpeg", dosya: false } : m.document && /^image\//.test(m.document.mime_type || "") ? { foto: m.document, tur: m.document.mime_type, dosya: true } : null);
const ROL_AD = { on: "ön", arka: "arka", detay: "detay" };
// Kayıtlı fotoğrafları rol sırasına koy: açık rol (ön, arka, detay) → albüm sırası (1. ön, 2. arka, gerisi detay)
export function fotoSirala(liste) {
  const l = (liste || []).map((x) => (typeof x === "string" ? { anahtar: x, rol: null } : x));
  const albumSira = {};
  for (const x of [...l].sort((a, b) => (a.mid || 0) - (b.mid || 0))) if (x.album && !x.rol) { albumSira[x.album] = (albumSira[x.album] || 0) + 1; x._sira = albumSira[x.album]; }
  const rolu = (x) => x.rol || (x._sira === 1 ? "on" : x._sira === 2 ? "arka" : x.album ? "detay" : "on");
  const puan = { on: 0, arka: 1, detay: 2 };
  return l.map((x) => ({ ...x, rol: rolu(x) })).sort((a, b) => puan[a.rol] - puan[b.rol] || (b.zaman || 0) - (a.zaman || 0)).map(({ _sira, ...x }) => x);
}
async function urunFotoKaydet(env, kod, kayit) {
  const l = await oku(env, `pelin:urunfoto:${kod}`, []);
  const yeni = [kayit, ...l.map((x) => (typeof x === "string" ? { anahtar: x, rol: null } : x))].slice(0, 10);
  await kaydet(env, `pelin:urunfoto:${kod}`, yeni, 120 * 86400);
  return yeni;
}
async function urunFotoAl(env, m) {
  const f = fotoAl(m);
  if (!f) return false;
  const yazi = String(m.caption || "").trim();
  const y = fotoYazisi(yazi);
  const albumAnahtar = m.media_group_id ? `pelin:album:${m.media_group_id}` : null;
  let album = albumAnahtar ? await oku(env, albumAnahtar, null) : null;
  // Kod yoksa: aynı albümün yazısından al; albümün yazısı henüz gelmediyse bekle (yazı gelince eklenir)
  if (!y.kod && !(album && album.kod)) {
    if (!albumAnahtar) return false; // tek, yazısız fotoğraf → yüz mü diye sorulur
    album = album || { bekleyen: [] };
    album.bekleyen = [...(album.bekleyen || []), { fileId: f.foto.file_id, tur: f.tur, dosya: f.dosya, mid: m.message_id, zaman: m.date }];
    await kaydet(env, albumAnahtar, album, 3600);
    return true;
  }
  if (f.dosya && !DESTEKLI.test(f.tur)) { await yaz(env, m.chat.id, `Bu dosya türü (${f.tur}) kullanılamıyor. Fotoğrafı JPEG/PNG olarak "dosya olarak" gönderin.`); return true; }
  const kod = y.kod || album.kod;
  const renk = y.renk || (album && album.renk) || null;
  const ekle = async (fileId, tur, dosya, mid, zaman, rol) => urunFotoKaydet(env, kod, { anahtar: await dosyaKaydet(env, fileId, tur, 120 * 86400), rol, renk, album: m.media_group_id || null, mid, zaman, dosya: Boolean(dosya) });
  let l = await ekle(f.foto.file_id, f.tur, f.dosya, m.message_id, m.date, y.rol);
  const bekleyen = ((album && album.bekleyen) || []).filter((b) => !b.dosya || DESTEKLI.test(b.tur));
  for (const b of bekleyen) l = await ekle(b.fileId, b.tur, b.dosya, b.mid, b.zaman, null);
  if (albumAnahtar) await kaydet(env, albumAnahtar, { kod, renk, bekleyen: [] }, 3600);
  if (y.kod || bekleyen.length) {
    const s = fotoSirala(l).filter((x) => !renk || !x.renk || x.renk === renk);
    await yaz(env, m.chat.id, `✅ ${kod}${renk ? ` ${renk}` : ""} ürün fotoğrafı alındı${albumAnahtar ? " (albümdeki diğer fotoğraflar da bu koda eklenir: 1. ön, 2. arka, sonrası detay)" : ""}. Kayıtlı: ${s.map((x) => ROL_AD[x.rol]).join(", ")}. Üretimde siteden önce bunlar kullanılır. Kontrol: /fotolar ${kod}${f.dosya ? "" : "\nİpucu: \"Dosya olarak\" gönderirseniz renk daha net kalır."}`);
  }
  return true;
}
// Kodsuz, albümsüz ve yüz olmayan fotoğraf (Patron dışı) → ne yapılacağını söyle
async function fotoUyarisi(env, m) {
  if (!fotoAl(m)) return false;
  await yaz(env, m.chat.id, "Fotoğrafın yazısına model kodunu yazın: \"3627\", \"3627 ön\", \"3627 arka\", \"3627 kırmızı\". Renk netliği için \"dosya olarak\" gönderebilirsiniz.");
  return true;
}
// Tek seferlik (Claude Code hazırlar, KV "venom:pelinUrunFoto" = { kod, fotolar: [{ anahtar, rol, renk }] }): eski akışa düşmüş
// ürün fotoğraflarını üretim kaydına aktarır
async function urunFotoAktar(env) {
  const p = await env.KAYIT.get("venom:pelinUrunFoto", "json");
  if (!p || !p.kod || !Array.isArray(p.fotolar)) return;
  for (const f of [...p.fotolar].reverse()) await urunFotoKaydet(env, p.kod, { anahtar: f.anahtar, rol: f.rol || null, renk: f.renk || null, album: null, mid: 0, zaman: f.zaman || 0 });
  await env.KAYIT.delete("venom:pelinUrunFoto");
}
async function fotolarKomutu(env, m) {
  const kod = (String(m.text).match(/\b(\d{3,6})\b/) || [])[1];
  if (!kod) return yaz(env, m.chat.id, "Kullanım: /fotolar 3627");
  const l = fotoSirala(await oku(env, `pelin:urunfoto:${kod}`, []));
  if (!l.length) return yaz(env, m.chat.id, `${kod}: gönderilmiş ürün fotoğrafı yok; üretimde site fotoğrafları kullanılır.`);
  const media = l.slice(0, 10).map((x, i) => ({ type: "photo", media: dosyaAdresi(env, x.anahtar), caption: `${i + 1}. ${ROL_AD[x.rol]}${x.renk ? ` · ${x.renk}` : ""}` }));
  const r = media.length > 1 ? await tg(env, "sendMediaGroup", { chat_id: m.chat.id, media }) : await tg(env, "sendPhoto", { chat_id: m.chat.id, photo: media[0].media, caption: media[0].caption });
  return { ...r, metin: media.map((x) => x.caption).join(" · ") };
}

// =====================================================================================================================
// YÜZLER (3 Kasım, Patron): her serinin kalıcı yüzü; yüz düzenleme (kimlik aynı); Patron'un fotoğrafını yüz yapma;
// ortam rolleri. Para harcayan tek iş (düzenleme) maliyet kartıyla; sonuç önce Patron'a, "Kaydet" denmeden kalıcı olmaz.
// =====================================================================================================================
const tarihSaatYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`; };
const sonFoto = (msg) => (msg && msg.photo ? msg.photo[msg.photo.length - 1].file_id : null);

export async function yuzleriGoster(env, chat) {
  const secim = await oku(env, "pelin:secim", null);
  const l = Object.keys(SERILER).map((sr) => [sr, secim && secim.yuzler ? secim.yuzler[sr] : sr === "kucuk" && secim ? secim.yuz : null]).filter(([, y]) => y && y.fileId);
  if (!l.length) return yaz(env, chat, "Kayıtlı yüz yok.");
  const media = l.map(([sr, y]) => ({ type: "photo", media: y.fileId, caption: `👤 ${SERILER[sr].ad}: ${yuzAdi(y)}${y.duzenleme ? ` (düzenlendi: ${y.duzenleme})` : ""}` }));
  const r = l.length > 1 ? await tg(env, "sendMediaGroup", { chat_id: chat, media }) : await tg(env, "sendPhoto", { chat_id: chat, photo: media[0].media, caption: media[0].caption });
  return { ...r, metin: media.map((x) => x.caption).join(" · ") };
}

// Tek seferlik kayıt (Claude Code hazırlar: KV "venom:pelinYuzKaydi" = { yuzler: { kucuk|buyuk: { url, manken, ad, kaynak } },
// ortamRolleri: { "<id>": "katalog"|"video"|"kampanya" }, notlar: [..], duzenle: { seri, talimat, istem } }) → fotoğraflar Telegram'a
// yüklenir (kalıcı dosya kimliği), "pelin:secim" yazılır, Patron'a TEK mesaj: fotoğraflar + özet (+ düzenleme kartı).
async function yuzKaydiUygula(env, simdi) {
  const p = await env.KAYIT.get("venom:pelinYuzKaydi", "json");
  if (!p || !p.yuzler) return;
  const seriler = Object.keys(SERILER).filter((sr) => p.yuzler[sr] && p.yuzler[sr].url);
  const media = seriler.map((sr) => ({ type: "photo", media: p.yuzler[sr].url, caption: `👤 ${SERILER[sr].ad}: ${p.yuzler[sr].ad}` }));
  const r = await tg(env, "sendMediaGroup", { chat_id: murat(env), media });
  if (!r.ok || !Array.isArray(r.result)) throw new Error(`fotoğraflar gönderilemedi: ${r.description || "?"}`);
  const onceki = (await oku(env, "pelin:secim", null)) || {};
  const yuzler = { ...(onceki.yuzler || {}) };
  for (const [i, sr] of seriler.entries()) {
    const fileId = sonFoto(r.result[i]);
    if (!fileId) throw new Error(`${sr} fotoğraf kimliği yok`);
    const y = p.yuzler[sr];
    yuzler[sr] = { manken: y.manken || null, ad: y.ad, fileId, anahtar: await dosyaKaydet(env, fileId, "image/jpeg"), kaynak: y.kaynak || null, zaman: simdi };
  }
  const kur = await oku(env, "pelin:kurulum", null);
  const roller = p.ortamRolleri || {};
  const ortamlar = Object.keys(roller).length && kur ? (kur.ortamlar || []).filter((o) => roller[o.id]).map((o) => ({ ...o, rol: roller[o.id] })) : onceki.ortamlar || [];
  const secim = { ...onceki, yuzler, yuz: yuzler.kucuk || yuzler.buyuk, ortamlar, arac: onceki.arac || "veo", zaman: simdi };
  await kaydet(env, "pelin:secim", secim);
  await env.KAYIT.delete("venom:pelinYuzKaydi");
  if (p.sohbetSifirla) await env.KAYIT.delete(`pelin:sohbet:${murat(env)}`); // eski yanlış konuşma ("kart gönderdim") hafızadan çıkar
  const sira = ["katalog", "video", "kampanya"];
  const ozet = [
    "💾 Kalıcı yüzler kaydedildi (fotoğraflar yukarıda):",
    ...Object.keys(SERILER).filter((sr) => yuzler[sr]).map((sr) => `• ${SERILER[sr].ad}: ${yuzAdi(yuzler[sr])}${yuzler[sr].kaynak ? ` — ${yuzler[sr].kaynak}` : ""}`),
    ...(p.notlar || []),
    ...(ortamlar.length ? ["🎨 Ortamlar:", ...[...ortamlar].sort((a, b) => sira.indexOf(a.rol) - sira.indexOf(b.rol)).map((o) => `• ${o.ad} → ${ORTAM_ROLLERI[o.rol] || "genel"}`)] : []),
  ].join("\n");
  if (p.duzenle) return yuzDuzenleKarti(env, murat(env), p.duzenle.seri, p.duzenle.talimat, p.duzenle.istem, simdi, ozet);
  return yaz(env, murat(env), ozet);
}

const yuzDuzenIstemi = (istem) => `Edit this portrait photo of a woman. Change ONLY this: ${istem}. Keep her identity exactly the same: same face shape, eyes, eyebrows, nose, lips, ears, hairline, hair style and hair color, same expression, same pose, same framing, same clothing and same background. Natural, realistic skin with visible natural texture and an even, natural tone (no plastic or airbrushed look, no makeup change, no beautify filter). Photorealistic. No text, no logo, no watermark.`;

export async function yuzDuzenleKarti(env, chat, seri, talimat, istem, simdi, onEk = "") {
  const secim = await oku(env, "pelin:secim", null);
  const y = secim && secim.yuzler ? secim.yuzler[seri] : null;
  if (!SERILER[seri] || !y) return yaz(env, chat, `${onEk ? `${onEk}\n\n` : ""}${SERILER[seri] ? SERILER[seri].ad : seri} için kayıtlı yüz yok; düzenleme kartı açılmadı.`);
  const id = kisaId();
  await kaydet(env, `pelin:yuzDuzen:${id}`, { id, seri, talimat: String(talimat).slice(0, 300), istem: String(istem || talimat).slice(0, 400), durum: "kart", zaman: simdi }, 7 * 86400);
  const harcanan = await buAyHarcanan(env, simdi);
  return yaz(env, chat, [
    ...(onEk ? [onEk, ""] : []),
    `✏️ Yüz düzenleme — ${SERILER[seri].ad} (${yuzAdi(y)}): ${talimat}`,
    "Kimlik aynı kalır: göz, burun, dudak, saç, ifade aynı; doğal cilt.",
    `Maliyet: 1 görsel × ${para(GORSEL.fiyat)} = ${para(GORSEL.fiyat)} · Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $`,
    "Sonuç önce size gelir (önce / sonra); beğenirseniz 💾 Kaydet ile kalıcı olur, beğenmezseniz eski yüz kalır.",
  ].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pz:o:${id}` }, { text: "❌ İptal", callback_data: `pz:x:${id}` }]] } });
}

async function yuzDuzenBaslat(env, j, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const y = secim && secim.yuzler ? secim.yuzler[j.seri] : null;
  if (!y) return "kayıtlı yüz yok";
  if ((await buAyHarcanan(env, simdi)) + GORSEL.fiyat > AYLIK_SINIR_USD) return `aylık ${AYLIK_SINIR_USD} $ sınırı aşılır`;
  j.fal = await falGonder(env, GORSEL.duzenle, { prompt: yuzDuzenIstemi(j.istem), image_urls: [dosyaAdresi(env, y.anahtar)], num_images: 1, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" });
  await harcamaYaz(env, GORSEL.fiyat, simdi);
  Object.assign(j, { durum: "bekle", bekleZaman: simdi, eskiFileId: y.fileId, deneme: (j.deneme || 0) + 1 });
  await kaydet(env, `pelin:yuzDuzen:${j.id}`, j, 7 * 86400);
  const l = await oku(env, "pelin:yuzDuzenler", []);
  if (!l.includes(j.id)) { l.push(j.id); await kaydet(env, "pelin:yuzDuzenler", l.slice(-30)); }
  return null;
}

async function yuzDuzenCron(env, simdi) {
  const l = await oku(env, "pelin:yuzDuzenler", []);
  for (const id of l) {
    const j = await oku(env, `pelin:yuzDuzen:${id}`, null);
    if (!j || j.durum !== "bekle") continue;
    const s = await falDurum(env, j.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti && simdi - j.bekleZaman < 3600) continue;
    if (!s.bitti || s.hata) {
      j.durum = "hata"; await kaydet(env, `pelin:yuzDuzen:${id}`, j, 7 * 86400);
      await harcamaYaz(env, -GORSEL.fiyat, simdi);
      await yaz(env, murat(env), `⚠️ Yüz düzenleme üretilemedi (ücret alınmaz): ${String(s.hata || "1 saatte bitmedi").slice(0, 200)}`);
      continue;
    }
    const r = await tg(env, "sendMediaGroup", { chat_id: murat(env), media: [{ type: "photo", media: j.eskiFileId, caption: "Önce (kayıtlı yüz)" }, { type: "photo", media: s.resimler[0], caption: `Sonra: ${j.talimat}` }] });
    j.yeniFileId = r.ok && Array.isArray(r.result) ? sonFoto(r.result[1]) : null;
    if (!j.yeniFileId) { const t = await tg(env, "sendPhoto", { chat_id: murat(env), photo: s.resimler[0], caption: `Sonra: ${j.talimat}` }); j.yeniFileId = t.ok ? sonFoto(t.result) : null; }
    if (!j.yeniFileId) continue; // Telegram'a gidemedi → bir sonraki çalışmada tekrar
    j.durum = "hazir"; j.yeniUrl = s.resimler[0];
    await kaydet(env, `pelin:yuzDuzen:${id}`, j, 7 * 86400);
    await yaz(env, murat(env), `👁 ${SERILER[j.seri].ad} yüzü düzenlendi (${j.talimat}). Kimlik aynı mı, ten doğal mı? Kaydedeyim mi?`, { reply_markup: { inline_keyboard: [[{ text: "💾 Kaydet", callback_data: `pz:k:${id}` }, { text: `🔄 Yeniden (${para(GORSEL.fiyat)})`, callback_data: `pz:r:${id}` }, { text: "❌ Vazgeç", callback_data: `pz:v:${id}` }]] } });
  }
}

async function yuzDuzenDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id] = cq.data.split(":");
  const j = await oku(env, `pelin:yuzDuzen:${id}`, null);
  if (!j) return cevap("Bu iş bulunamadı.");
  const kapat = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "pz:-" }]] } });
  if ((islem === "o" && j.durum === "kart") || (islem === "r" && j.durum === "hazir")) {
    const engel = await yuzDuzenBaslat(env, j, simdi);
    if (engel) { await cevap("Başlamadı"); return yaz(env, murat(env), `Düzenleme başlamadı: ${engel}. Para harcanmadı.`); }
    await cevap("Başladım"); await kapat(islem === "o" ? "✅ Onaylandı" : "🔄 Yeniden üretiliyor");
    return yaz(env, murat(env), "⏳ Yüz düzenleniyor (1-2 dakika). Önce / sonra fotoğrafı gelecek.");
  }
  if (islem === "x" && j.durum === "kart") { j.durum = "iptal"; await kaydet(env, `pelin:yuzDuzen:${id}`, j, 7 * 86400); await cevap("İptal"); return kapat("❌ İptal edildi, harcama yok"); }
  if (islem === "v" && j.durum === "hazir") { j.durum = "vazgecildi"; await kaydet(env, `pelin:yuzDuzen:${id}`, j, 7 * 86400); await cevap("Eski yüz kaldı"); return kapat("❌ Vazgeçildi — eski yüz kayıtlı kaldı"); }
  if (islem === "k" && j.durum === "hazir") {
    const secim = await oku(env, "pelin:secim", null);
    const eski = secim.yuzler[j.seri];
    secim.yuzler[j.seri] = { ...eski, fileId: j.yeniFileId, anahtar: await dosyaKaydet(env, j.yeniFileId, "image/jpeg"), duzenleme: j.talimat, onceki: { fileId: eski.fileId, anahtar: eski.anahtar }, zaman: simdi };
    if (j.seri === "kucuk" || !secim.yuzler.kucuk) secim.yuz = secim.yuzler.kucuk || secim.yuzler.buyuk;
    await kaydet(env, "pelin:secim", secim);
    j.durum = "kaydedildi"; await kaydet(env, `pelin:yuzDuzen:${id}`, j, 7 * 86400);
    await cevap("Kaydedildi"); await kapat("💾 Kaydedildi");
    return yaz(env, murat(env), `💾 ${SERILER[j.seri].ad} yüzü artık düzenlenmiş hâli (${j.talimat}). Üretimde bu yüz kullanılacak.`);
  }
  return cevap("Bu düğme artık geçerli değil.");
}

// Patron'un gönderdiği fotoğraf → "yüz olarak kaydet" (yazısında "yüz" varsa ya da yazısız fotoğraf)
async function yuzFotoAl(env, m) {
  const foto = m.photo ? m.photo[m.photo.length - 1] : m.document && /^image\//.test(m.document.mime_type || "") ? m.document : null;
  if (!foto || !muratMi(env, m.from.id)) return false;
  const yazi = String(m.caption || "").trim();
  if (/^\d{3,6}\b/.test(yazi) || (yazi && !/y[üu]z|face|лицо/i.test(yazi))) return false;
  const id = kisaId();
  await kaydet(env, `pelin:yuzAday:${id}`, { fileId: foto.file_id, tur: m.document ? m.document.mime_type : "image/jpeg", zaman: m.date }, 3 * 86400);
  await yaz(env, m.chat.id, `👤 Bu fotoğrafı kalıcı yüz olarak kaydedeyim mi? Hangi seri?${yazi ? "" : "\n(Ürün fotoğrafıysa ❌ deyin ve yazısına model kodunu yazıp tekrar gönderin; boy referansıysa yazısına \"3627 boy\" yazın.)"}${m.photo ? "\nİpucu: \"Dosya olarak\" gönderirseniz yüz daha net kalır." : ""}`,
    { reply_markup: { inline_keyboard: [[{ text: "👤 Küçük seri", callback_data: `pyk:kucuk:${id}` }, { text: "👤 Büyük seri", callback_data: `pyk:buyuk:${id}` }, { text: "❌ Hayır", callback_data: `pyk:x:${id}` }]] } });
  return true;
}
async function yuzFotoDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, seri, id] = cq.data.split(":");
  const a = await oku(env, `pelin:yuzAday:${id}`, null);
  if (!a) return cevap("Bu fotoğraf artık beklemiyor.");
  await env.KAYIT.delete(`pelin:yuzAday:${id}`);
  const metin = (text) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (!SERILER[seri]) { await cevap("Kaydedilmedi"); return metin("Kaydedilmedi."); }
  const secim = (await oku(env, "pelin:secim", null)) || { ortamlar: [], arac: "veo" };
  const yuzler = { ...(secim.yuzler || (secim.yuz ? { kucuk: secim.yuz } : {})) };
  const eski = yuzler[seri];
  yuzler[seri] = { manken: null, ad: `Patron'un fotoğrafı (${tarihSaatYaz(a.zaman || simdi)})`, fileId: a.fileId, anahtar: await dosyaKaydet(env, a.fileId, a.tur), kaynak: "Patron fotoğrafı", onceki: eski ? { fileId: eski.fileId, anahtar: eski.anahtar } : null, zaman: simdi };
  await kaydet(env, "pelin:secim", { ...secim, yuzler, yuz: yuzler.kucuk || yuzler.buyuk, zaman: simdi });
  await cevap("Kaydedildi");
  return metin(`💾 ${SERILER[seri].ad} yüzü = bu fotoğraf. Üretimde bu yüz kullanılacak.${eski ? " (Önceki yüz yedekte.)" : ""}`);
}

async function ortamAyarla(env, g) {
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return "KAYDEDİLMEDİ: kurulum yok.";
  const kur = await oku(env, "pelin:kurulum", null);
  const havuz = [...(secim.ortamlar || [])];
  for (const o of (kur && kur.ortamlar) || []) if (!havuz.some((x) => x.id === o.id)) havuz.push(o);
  const istek = { katalog: String(g.katalog || "").trim(), video: String(g.video || "").trim(), kampanya: String(g.kampanya || "").trim() };
  const yok = Object.values(istek).filter((v) => v && !havuz.some((o) => o.id === v));
  if (yok.length) return `KAYDEDİLMEDİ: ${yok.join(", ")} numaralı ortam yok (var olanlar: ${havuz.map((o) => `${o.id}) ${o.ad}`).join(", ")}).`;
  const ortamlar = havuz.map((o) => ({ ...o, rol: Object.keys(istek).find((r) => istek[r] === o.id) || null })).filter((o) => o.rol);
  await kaydet(env, "pelin:secim", { ...secim, ortamlar });
  return `KAYDEDİLDİ: ${ortamlar.map((o) => `${o.ad} → ${ORTAM_ROLLERI[o.rol]}`).join(" · ")}`;
}
