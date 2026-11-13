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

import { defterTg, defterKarar, defterIs, defterSatir } from "./is-defteri.js";
import { durdurulduMu, durMesaji } from "./durdurma.js";
import { kitapOku } from "./kitap.js";
import { patronaGider, venomaAktar, venomCevabi, sahteDugme, sahteMesaj, tekKapiAcik } from "./tek-kapi.js";
import Anthropic from "@anthropic-ai/sdk";
import { claudeTur } from "./ai-istemci.js";
import { markaKarari } from "./yayin-kontrol.js";
import { karmaDepo } from "./depo.js";
import { patronDenemesi } from "./venom.js";
import { siteVerisi } from "./depo-oku.js";
import { venomPelinAdimi, hataEkle, kuyrugaEkle } from "./venom-kopru.js";
import { stokIste } from "./stokbot.js";
import { markaBas, katmanPng } from "./marka.js";
import { KESIM, BUL, DETAY_YERLERI, DETAY_ETIKET, KOLAJ, ASKI_DETAY_FIYAT, kutuSec, kumasKutusu, arkaKutusu, yakaKutusu, islemeKutusu, askiGorseli, elbiseKirp, kolaj } from "./aski-detay.js";
import { gorselBase64, gecici } from "./duzen.js";

export const AYLIK_SINIR_USD = 100; // 13 Kasım (Patron, kural 74): Pelin 10 $/gün ve 100 $/ay (kitaptaki tabloyla aynı; test doğrular)
export const GUNLUK_SINIR_USD = 10; // 4 Kasım (Patron): Pelin günde en fazla 10 $; aşılacaksa durur ve sorar
export const UYARI_ORANI = 0.8;
const SAAT_FARKI = 3 * 3600;
const GUNCELLEMELER = ["message", "callback_query"];
export const BEYINLER = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
const CLAUDE_FIYAT = { "claude-sonnet-5-5": { giris: 2, cikis: 10, okuma: 0.2 }, "claude-opus-5-5": { giris: 4, cikis: 20, okuma: 0.2 } };
const GUNLUK_SOHBET = 100;

// Araçlar (fal.ai). Fiyatlar fal sayfalarındaki yaklaşık değerler; harcama bu tahminle tutulur, gerçek fatura fal panelinde.
export const SURE_SN = 6; // üç araçta ortak süre (Veo Lite: 4/6/8 s; Kling 3.0: 3–15; Seedance 2.0: 4–15)
// 3 Kasım (Patron: "lüks marka seviyesi, para sorun değil"): varsayılan Veo 3.1 TAM (1080p). Fiyatlar fal fiyat listesinden
// (api.fal.ai/v1/models/pricing, 3 Kasım): Veo 3.1 0,40 $/sn · Veo 3.1 Fast 0,15 · Kling 4.0 0,157 · Kling v3 4K 0,42 · Veo Lite 0,05.
export const VARSAYILAN_ARAC = "veo31";
export const ARACLAR = {
  veo31: { ad: "Google Veo 3.1 (1080p)", uc: "fal-ai/veo3.1/image-to-video", saniye: 0.4 },
  kling4: { ad: "Kling 4.0 (1080p)", uc: "kling/v4/image-to-video", saniye: 0.157 },
  kling4k: { ad: "Kling 3.0 4K", uc: "fal-ai/kling-video/v3/4k/image-to-video", saniye: 0.42 },
  veofast: { ad: "Google Veo 3.1 Fast (1080p)", uc: "fal-ai/veo3.1/fast/image-to-video", saniye: 0.15 },
  veo: { ad: "Google Veo 3.1 Lite", uc: "fal-ai/veo3.1/lite/image-to-video", saniye: 0.05 },
  kling: { ad: "Kling 3.0 Pro", uc: "fal-ai/kling-video/v3/pro/image-to-video", saniye: 0.112 },
  seedance: { ad: "Seedance 2.0", uc: "bytedance/seedance-2.0/image-to-video", saniye: 0.3024 },
  // Higgsfield API (4 Kasım). Fiyatlar Higgsfield'in kendi tahmininden (POST /estimate, 6 sn, 9:16, indirimli): Kling 3.0 4K 1,26 $ →
  // 0,21 $/sn; Kling 4.0 1080p 1,20 $ → 0,20 $/sn; Seedance 2.5 1080p tahmin vermiyor, fiyat açıklaması 1,1372 $/sn (indirim ÖNCESİ, üst sınır).
  // yedek = Higgsfield çalışmazsa (anahtar yok/bitti, bakiye, hata) aynı kareyle kullanılacak fal.ai aracı.
  hf_kling3: { ad: "Kling 3.0 4K (Higgsfield)", uc: "kling-video/v3.0/4k/image-to-video", saniye: 0.21, hf: true, yedek: "kling4k" },
  hf_kling4: { ad: "Kling 4.0 1080p (Higgsfield)", uc: "kling-video/v4.0/image-to-video", saniye: 0.2, hf: true, yedek: "kling4" },
  hf_seedance25: { ad: "Seedance 2.5 1080p (Higgsfield)", uc: "bytedance/seedance-2.5/image-to-video", saniye: 1.1372, hf: true, yedek: "seedance", ustSinir: true },
};
export const HF_KARSILASTIRMA = ["hf_kling3", "hf_seedance25", "hf_kling4"];
export const GORSEL = { metin: "fal-ai/nano-banana-pro", duzenle: "fal-ai/nano-banana-pro/edit", fiyat: 0.15 };
const KARE = { uc: "fal-ai/ffmpeg-api/extract-frame", saniye: 0.0002 };

export const MANKENLER = {
  beyaz: { ad: "Beyaz kız", tarif: "a young modern woman in her mid-20s with fair skin and long brown hair" },
  siyahi: { ad: "Siyahi kız", tarif: "a young modern Black African woman in her mid-20s with deep brown skin and natural black hair styled elegantly" },
  dolgun: { ad: "Dolgun (Büyük seri)", tarif: "a curvy plus-size (EU size 48-50) modern woman in her late 20s with warm brown skin and long dark hair, confident and elegant" },
};
// Seriler (3 Kasım, Patron): küçük seri 38-44 ve büyük seri 44-50 — her serinin kalıcı yüzü ayrı ("pelin:secim".yuzler)
export const SERILER = { kucuk: { ad: "Küçük seri (38-44)" }, buyuk: { ad: "Büyük beden (dolgun)" } };
// Ortam rolleri (3 Kasım, Patron): katalog fotoğrafı (renk doğruluğu), video, sadece kampanya videosu
export const ORTAM_ROLLERI = { katalog: "katalog fotoğrafları", video: "videolar", kampanya: "sadece kampanya videoları" };
import { seriBul, mankenSatiri } from "./manken.js";
export { seriBul, mankenSatiri }; // 9 Kasım (Patron, KESİN): büyük bedeni olan bütün modeller dolgun büyük beden manken
// Yüzün adresi: kayıtlı Telegram dosyası (anahtar) ya da kalıcı kopya (url)
const yuzAdres = (env, y) => (y && y.url) || dosyaAdresi(env, y && y.anahtar);
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
export const SINEMA = " LIGHT: cinematic — warm golden-hour light or soft painterly studio light like a fine-art portrait; rich, deep colors; luminous, glowing skin.";
export const VOLONTE_KADINI = " SHE IS THE VOLONTE WOMAN: successful, wealthy and self-confident (mature elegance, 30-45) — like an African businesswoman or a refined lady arriving at a gala; noble, poised, assured expression. Keep her exact face from the first image.";
export const POZ = " POSE: show the dress beautifully fitted on her body through pose only — waist emphasis, a hand on the waist, side or three-quarter stance, a look over the shoulder. NEVER make the garment tighter, narrower or more body-hugging than in the product photos; the real cut stays exactly the same.";
export const DETAY_SANAT = " Include artistic close-ups of the lace, sequins, fabric texture and stitching, and show the fabric moving naturally (chiffon flowing, satin sheen).";
export const MAKYAJ = " MAKEUP (always): elegant, defined yet natural — eye makeup with mascara and lashes, groomed shaped eyebrows, a soft blush, and a lipstick shade that harmonizes with the dress. Never a bare, makeup-free face.";
export const YAKA_DETAY = " NECKLINE AND DETAILS: copy the exact neckline/collar shape from the product photos (e.g. a draped, scarf-like, loose high collar must stay exactly so — never simplify it into a plain collar) and the exact density, size and placement of lace, sequins, beads, buttons and embroidery.";
const aksesuarIstemi = (st) => (st && st.aksesuarEn ? ` ACCESSORIES: ${st.aksesuarEn}. Accessories stay minimal and never overpower the dress.` : "");
// ---------- MARKA (4 Kasım, Patron — ACİL): her kodda üretimden önce Sami'nin deposuna (Vegawin köprüleri) sorulur ----------
// Sadece BLACK ROSE köprüsünde → BLACK ROSE; sadece VOLONTE'de → VOLONTE; ikisinde de / hiçbirinde → Patron'a sorulur (TAHMİN YOK).
// Kalıcı: pelinboy:<kod>.marka. Videonun son karesine marka + kod basılır; marka yazısı yanlış/eksik video yayına GİTMEZ.
export const MARKALAR = { VOLONTE: { ad: "VOLONTE", yazi: (kod) => `a small, tasteful GOLD serif text "VOLONTE" and directly below it the model code "${kod}"` }, BLACKROSE: { ad: "BLACK ROSE", yazi: (kod) => `a small, tasteful SILVER-WHITE text "BLACK ROSE" with a thin rose line, and directly below it the model code "${kod}"` } };
export async function markaSor(env, kod) {
  const pk = await markaKarari(env, kod); // 6 Kasım: Patron'un kesin kararı (ör. 907 = VOLONTE) her şeyden önce
  if (pk) return { marka: pk, kaynak: "Patron kararı" };
  const b = await boyOku(env, kod);
  if (b && MARKALAR[b.marka]) return { marka: b.marka, kaynak: b.markaKaynak || "model kartı" };
  if (!env.STOK) return { marka: null, neden: "Sami'nin deposuna ulaşılamadı" };
  const bilgi = await stokIste(env, "/bilgi", { kod }).catch(() => null);
  const magazalar = [...new Set(((bilgi && bilgi.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))].filter((x) => MARKALAR[x]);
  if (magazalar.length === 1) return { marka: magazalar[0], kaynak: `Sami deposu (${MARKALAR[magazalar[0]].ad} Vegawin)`, yeni: true };
  return { marka: null, neden: magazalar.length > 1 ? "kod iki markanın Vegawin'inde de var" : "kod iki markanın Vegawin'inde de yok" };
}
async function markaSorusu(env, m, kod, neden, simdi, test) {
  const id = kisaId();
  await kaydet(env, `pelin:markaSoru:${id}`, { kod, metin: m.text, test: Boolean(test), sonSenaryo: Boolean(m.sonSenaryo) }, 3 * 86400);
  return yaz(env, m.chat.id, `🏷 ${kod} hangi markanın? Sami'nin deposu: ${neden}. Tahmin etmiyorum; lütfen seçin (kalıcı kaydedilir, videonun son karesine bu marka yazılır).`, { reply_markup: { inline_keyboard: [[{ text: "VOLONTE", callback_data: `pm:VOLONTE:${id}` }, { text: "BLACK ROSE", callback_data: `pm:BLACKROSE:${id}` }]] } });
}
async function markaDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, marka, id] = cq.data.split(":");
  const q = await oku(env, `pelin:markaSoru:${id}`, null);
  if (!q || !MARKALAR[marka]) return cevap("Bu soru artık geçerli değil.");
  await env.KAYIT.delete(`pelin:markaSoru:${id}`);
  await boyYaz(env, q.kod, { marka, markaKaynak: `Patron ${tarihSaatYaz(simdi)}` });
  await cevap("Kaydedildi");
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `🏷 ${q.kod} = ${MARKALAR[marka].ad} (kalıcı).` });
  return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: q.metin, sonSenaryo: q.sonSenaryo }, simdi, q.test);
}
// Yayın kilidi: videonun son karesindeki marka, model kartındaki markayla aynı olmalı
export async function markaEngeli(env, is) {
  const b = await boyOku(env, is.kod);
  if (!b || !MARKALAR[b.marka]) return `${is.kod} markası model kartında kayıtlı değil — yayına gönderilmez (önce "${is.kod} üret" ile marka sorulur).`;
  if (is.marka !== b.marka) return `Bu videonun son karesinde ${is.marka ? MARKALAR[is.marka].ad : "VOLONTE (eski kural)"} yazıyor; ${is.kod} = ${MARKALAR[b.marka].ad}. Yanlış marka — yayına GİTMEZ. Yeni üretim gerekir.`;
  return null;
}

// ---------- MODEL ANLAMA (4 Kasım, Patron): her model/renk için bir kez — üst, etek, içlik (renge göre), boy ----------
// Kayıt: pelinboy:<kod>.anlama[<renk|genel>] = { ust: seffaf|opak, alt: opak|seffaf, iclik: yok|siyah|beyaz|ten|elbise, onay }
export const ANLAMA_SECENEK = {
  ust: { ad: "Üst", d: { seffaf: "Şeffaf", opak: "Astarlı/opak" } },
  alt: { ad: "Etek/alt", d: { opak: "Astarlı/opak", seffaf: "Şeffaf" } },
  iclik: { ad: "İçlik", d: { yok: "Yok", siyah: "Siyah", beyaz: "Beyaz", ten: "Ten", elbise: "Elbise rengi" } },
};
const ICLIK_EN = { siyah: "black", beyaz: "white", ten: "nude skin-tone" };
export const anlamaOku = (b, renk) => (b && b.anlama && b.anlama[renk || "genel"]) || null;
export function modelKaydiYap(b, renk) {
  if (!b) return null;
  const k = modelKurallari(anlamaOku(b, renk), renk);
  if (!(b.detayEn || b.detayTr || b.astarEn || k)) return null;
  return { detayEn: b.detayEn || null, detayTr: b.detayTr || null, astarEn: k ? null : b.astarEn || null, astarTr: k ? null : b.astarTr || null, kuralEn: k ? k.en : null, kuralTr: k ? k.tr : null };
}
export function modelKurallari(an, renk) {
  if (!an) return null;
  const re = renk ? renkEn(renk) : "the dress color";
  const en = [], tr = [];
  if (an.ust === "seffaf") { en.push("The upper bodice and the sleeves are SHEER see-through chiffon"); tr.push("üst gövde ve kollar şeffaf şifon"); }
  if (an.ust === "opak") { en.push("The upper bodice and the sleeves are fully lined and opaque"); tr.push("üst gövde ve kollar astarlı/opak"); }
  if (an.alt === "opak") { en.push(`The skirt has TWO layers: sheer chiffon on top and an OPAQUE lining fabric of the SAME color (${re}) underneath — the legs are NEVER visible through the skirt`); tr.push(`etek iki kat: üstte şifon, altında aynı renkte (${renk || "elbise rengi"}) opak astar — bacaklar asla görünmez`); }
  if (an.alt === "seffaf") { en.push("The skirt is sheer"); tr.push("etek şeffaf"); }
  if (an.iclik === "yok") { en.push("There is NO camisole or lining under the sheer parts"); tr.push("içlik yok"); }
  else if (an.iclik) {
    const c = an.iclik === "elbise" ? `${re} (same as the dress)` : ICLIK_EN[an.iclik];
    en.push(`Under the sheer chiffon at the bust there is ONLY a ${c} camisole lining (${c} camisole lining under sheer chiffon) — no other lining color anywhere`);
    tr.push(`göğüste SADECE ${an.iclik === "elbise" ? "elbise renginde" : ANLAMA_SECENEK.iclik.d[an.iclik].toLocaleLowerCase("tr")} içlik (başka renk içlik yok)`);
  }
  if (an.ust === "seffaf" && an.alt === "opak") { en.push("Sheerness ONLY on the upper bodice and sleeves"); tr.push("şeffaflık SADECE üst gövde ve kollarda"); }
  return { en: en.join(". "), tr: tr.join("; ") };
}
const detayIstemi = (mk) => `${mk && mk.detayEn ? ` THIS MODEL: ${mk.detayEn}.` : ""}${mk && mk.kuralEn ? ` MODEL RULES (exact, highest priority after length): ${mk.kuralEn}.` : mk && mk.astarEn ? ` LINING AND SHEERNESS (exact, do not change): ${mk.astarEn}. Never make sheer parts opaque and never add lining where there is none.` : ""}`;
const YUZ_ISTEMI = (m) => `Photorealistic fashion catalog reference portrait of ${m.tarif}. Head and upper body, looking at the camera with a soft natural smile, elegant defined natural makeup (eye makeup, lashes, shaped brows, soft blush, lipstick), plain fitted black top, clean light-grey studio background, soft professional studio light, sharp focus, 3:4. She is an ORIGINAL, fictional person: she must not resemble any celebrity, model, actress, influencer or other real public figure. No text, no logo, no watermark.`;
const FOTO_ISTEMI = `Full-length vertical (9:16) fashion catalog photo of the SAME woman as in the first image (same face, skin tone, hair and body), wearing EXACTLY the garment shown in the other image(s). The garment must stay identical: same colors, same print/pattern with the same motif size and placement, same fabric texture, same cut, length, sleeves, collar and every detail. Do not redesign, recolor, simplify or add anything. She stands naturally, full body visible from head to toe, clean light studio background, soft natural light, photorealistic, sharp. No text, no logo, no watermark.`;
const VIDEO_ISTEMI = "The woman stands still for a moment, then turns slowly and gracefully to show the outfit from the front and side, then faces the camera again. Static camera, gentle slow motion, soft studio light. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no text, no logo, no watermark.";
const NEGATIF = "blur, distortion, morphing, color change, pattern change, extra limbs, text, logo, watermark";

// Seçili araç: Patron /arac ile elle seçtiyse o; yoksa en iyi (Veo 3.1 tam)
export const aracSec = (secim) => (secim && secim.aracElle && ARACLAR[secim.arac] ? secim.arac : VARSAYILAN_ARAC);
export function videoGirdisi(arac, kare) {
  if (arac === "hf_kling3") return { prompt: VIDEO_ISTEMI, image_url: kare, duration: SURE_SN, sound: "off" };
  if (arac === "hf_kling4") return { prompt: VIDEO_ISTEMI, image_url: kare, duration: SURE_SN, resolution: "1080p" };
  if (arac === "hf_seedance25") return { prompt: VIDEO_ISTEMI, image_url: kare, duration: SURE_SN, resolution: "1080p", bitrate_mode: "high", generate_audio: false };
  if (arac === "veo31" || arac === "veofast") return { prompt: VIDEO_ISTEMI, image_url: kare, duration: `${SURE_SN}s`, resolution: "1080p", aspect_ratio: "9:16", generate_audio: false, negative_prompt: NEGATIF, auto_fix: true };
  if (arac === "kling4") return { prompt: VIDEO_ISTEMI, start_image_url: kare, duration: SURE_SN, resolution: "1080p" };
  if (arac === "kling4k") return { prompt: VIDEO_ISTEMI, start_image_url: kare, duration: String(SURE_SN), negative_prompt: NEGATIF, generate_audio: false };
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
  const hf = Number((await env.KAYIT.get(`pelin-hf:${ay(simdi)}`)) || 0);
  return yuvarla(fal + claude + openai + hf);
}
const gunAnahtar = (simdi) => new Date((simdi + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
// Günlük sınır: varsayılan 10 $; Patron isterse (Claude Code) KV "pelin:gunlukSinir:<gün>" (sadece o gün) ya da "pelin:gunlukSinir"
export const gunlukSinir = async (env, simdi) => Number((await env.KAYIT.get(`pelin:gunlukSinir:${gunAnahtar(simdi)}`)) || (await env.KAYIT.get("pelin:gunlukSinir")) || GUNLUK_SINIR_USD);
export const bugunHarcanan = async (env, simdi) => Number((await env.KAYIT.get(`pelin-gun:${gunAnahtar(simdi)}`)) || 0);
const ARAC_AD = { fal: "fal.ai", hf: "Higgsfield", openai: "ChatGPT" };
async function harcamaYaz(env, usd, simdi, tur = "fal", kod = null) {
  // 13 Kasım (TEK DEFTER): Pelin'in HER ücretli üretimi deftere ayrı satır — araç + tutar (iade eksi yazılır); yapay zekâ kontrol harcaması hariç
  if (ARAC_AD[tur] && Math.abs(Number(usd) || 0) >= 0.005) await defterIs(env, "pelin", `${usd > 0 ? "ücretli üretim" : "üretim iadesi"}: ${ARAC_AD[tur]} · ${para(Math.abs(usd))}`, { kod: kod ? String(kod) : null }).catch(() => null);
  const k = tur === "fal" ? `uretim-harcama:${ay(simdi)}` : tur === "hf" ? `pelin-hf:${ay(simdi)}` : tur === "openai" ? `pelin-openai:${ay(simdi)}` : `pelin-claude:${ay(simdi)}`;
  const once = Number((await env.KAYIT.get(k)) || 0);
  await env.KAYIT.put(k, String(yuvarla(once + usd)), { expirationTtl: 400 * 86400 });
  const gk = `pelin-gun:${gunAnahtar(simdi)}`;
  await env.KAYIT.put(gk, String(yuvarla(Number((await env.KAYIT.get(gk)) || 0) + usd)), { expirationTtl: 40 * 86400 });
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
  if (govde && venomCevabi(metod, govde)) return govde.text ? venomaAktar(env, "pelin", "sendMessage", { chat_id: env.MURAT_ID, text: `ℹ️ ${govde.text}` }) : { ok: true, result: true };
  if (govde && (await patronaGider(env, govde.chat_id))) { const r = await venomaAktar(env, "pelin", metod, govde, (m, g) => tgGercek(env, m, g)); await defterTg(env, "pelin", metod, govde, r); return r; }
  const r = await tgGercek(env, metod, govde);
  await defterTg(env, "pelin", metod, govde, r); // 9 Kasım: iş defteri (Venom her şeyi bilir)
  return r;
}
async function tgGercek(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  return r.json().catch(() => ({ ok: false }));
}
// Büyük video/fotoğraf: Telegram adresle en fazla 20 MB çeker (4K video sessizce düşüyordu) → Pelin indirir, dosya olarak yükler (50 MB'a kadar)
export async function tgDosya(env, metod, alan, url, govde = {}) {
  const r0 = await tg(env, metod, { ...govde, [alan]: url });
  if (r0 && r0.ok) return r0;
  const kendi = String(url).match(/\/medya\/([0-9a-f]{32})$/);
  const k = kendi ? await medyaVer(env, kendi[1]) : await fetch(url);
  if (!k.ok) return { ok: false, description: `indirilemedi (${k.status}); adresle: ${(r0 && r0.description) || "?"}` };
  const f = new FormData();
  for (const [a, v] of Object.entries(govde)) f.append(a, typeof v === "object" ? JSON.stringify(v) : String(v));
  f.append(alan, new Blob([await k.arrayBuffer()], { type: alan === "video" ? "video/mp4" : "image/jpeg" }), alan === "video" ? "video.mp4" : "foto.jpg");
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", body: f });
  return r.json().catch(() => ({ ok: false }));
}
// Dönüş: Telegram cevabı + kart (düğmeli mi) + metin → sohbet aracı "gönderdim" demeden önce gerçek sonucu görür (3 Kasım)
const yaz = async (env, chat, text, ek = {}) => {
  const r = await tg(env, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...ek });
  if (ek.reply_markup && r && r.ok && String(chat) === murat(env)) await kartKaydet(env, r.result && r.result.message_id, text).catch(() => null);
  return { ...r, kart: Boolean(ek.reply_markup), metin: String(text) };
};
// 4 Kasım (Patron): Pelin sohbeti son kartların GERÇEK metnini ve tutarını görür ("pelin:sonKartlar", en yenisi başta)
async function kartKaydet(env, mid, metin) {
  const l = (await oku(env, "pelin:sonKartlar", [])).filter((x) => x.mid !== mid);
  await kaydet(env, "pelin:sonKartlar", [{ mid, zaman: Math.floor(Date.now() / 1000), metin: String(metin).slice(0, 2500) }, ...l].slice(0, 8), 14 * 86400);
}

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
  if (f && f.hf) return hfDurum(env, f); // Higgsfield işi (aynı bekleme akışı)
  const r = await fetch(f.durumUrl, { headers: falBaslik(env) });
  const j = await r.json().catch(() => ({}));
  if (j.status && j.status !== "COMPLETED") return { bitti: false };
  const s = await fetch(f.sonucUrl, { headers: falBaslik(env) });
  const c = await s.json().catch(() => ({}));
  if (!s.ok) return { bitti: true, hata: JSON.stringify(c.detail || c).slice(0, 300) };
  const resimler = [...(c.images || []), ...(c.image ? [c.image] : [])].map((x) => x && x.url).filter(Boolean); // Kling Kolors try-on tek "image" döner
  const video = c.video && c.video.url;
  return resimler.length || video ? { bitti: true, resimler, video } : { bitti: true, hata: `sonuç yok: ${JSON.stringify(c).slice(0, 200)}` };
}

// Ham fal sonucu (kutular vb. için): { bitti, c } ya da { bitti, hata }
async function falHam(env, f) {
  const r = await fetch(f.durumUrl, { headers: falBaslik(env) });
  const j = await r.json().catch(() => ({}));
  if (j.status && j.status !== "COMPLETED") return { bitti: false };
  const s = await fetch(f.sonucUrl, { headers: falBaslik(env) });
  const c = await s.json().catch(() => ({}));
  return s.ok ? { bitti: true, c } : { bitti: true, hata: JSON.stringify(c.detail || c).slice(0, 300) };
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

// Tek seferlik fal bilgi sorgusu (Claude Code için; KV "venom:pelinFalSor" = ["/v1/models?q=…", …]): sadece GET, sadece api.fal.ai
async function falSor(env) {
  const l = await env.KAYIT.get("venom:pelinFalSor", "json");
  if (!Array.isArray(l) || !l.length) return;
  await env.KAYIT.delete("venom:pelinFalSor");
  const c = { zaman: Math.floor(Date.now() / 1000), sonuc: {} };
  for (const yol of l.filter((x) => /^\/v1\/[a-z/-]+(\?|$)/.test(String(x))).slice(0, 12)) {
    try { const r = await fetch(`https://api.fal.ai${yol}`, { headers: falBaslik(env) }); c.sonuc[yol] = { durum: r.status, govde: (await r.text()).slice(0, 40000) }; } catch (e) { c.sonuc[yol] = { hata: String(e.message) }; }
  }
  // Şema: "sema:<uç>" → fal belge şeması (sadece okuma); sadece giriş alanları saklanır
  for (const x of l.filter((x) => /^sema:[a-z0-9./-]+$/i.test(String(x))).slice(0, 10)) {
    const uc = x.slice(5);
    try {
      const r = await fetch(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(uc)}`);
      const j = await r.json().catch(() => null);
      const sema = j && j.components && j.components.schemas ? Object.fromEntries(Object.entries(j.components.schemas).filter(([n, v]) => /Input|Output|Image|Frame|Track|Keyframe|File/.test(n) && v.properties).map(([n, v]) => [n, { required: v.required, properties: Object.fromEntries(Object.entries(v.properties).map(([pk, pv]) => [pk, { type: pv.type || (pv.anyOf || []).map((y) => y.type), enum: pv.enum, default: pv.default, aciklama: String(pv.description || "").slice(0, /Output/.test(n) ? 120 : 500) }])) }])) : null;
      c.sonuc[x] = { durum: r.status, sema };
    } catch (e) { c.sonuc[x] = { hata: String(e.message) }; }
  }
  await env.KAYIT.put("venom:pelinFalSonuc", JSON.stringify(c), { expirationTtl: 3 * 86400 });
}

// Tek seferlik belge okuma (Claude Code araştırması; KV "venom:pelinDokuman" = [adres]): sadece GET, sadece izinli belge alanları
const DOKUMAN_ALANI = /^https:\/\/(docs\.|www\.|open\.|platform\.|cloud\.)?higgsfield\.ai\//;
async function dokumanOku(env) {
  const l = await env.KAYIT.get("venom:pelinDokuman", "json");
  if (!Array.isArray(l) || !l.length) return;
  await env.KAYIT.delete("venom:pelinDokuman");
  const c = { zaman: Math.floor(Date.now() / 1000), sonuc: {} };
  for (const u of l.filter((x) => DOKUMAN_ALANI.test(String(x))).slice(0, 8)) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (VOLONTE Pelin belge okuma)", accept: "text/html,application/json,text/plain" }, redirect: "follow" });
      const t = await r.text();
      const duz = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      c.sonuc[u] = { durum: r.status, adres: r.url, metin: duz.slice(0, 30000) };
    } catch (e) { c.sonuc[u] = { hata: String(e.message) }; }
  }
  await env.KAYIT.put("venom:pelinDokumanSonuc", JSON.stringify(c), { expirationTtl: 2 * 86400 });
}

// ---------- Higgsfield API (4 Kasım, Patron: "fal yedek kalsın") ----------
// Belge: docs.higgsfield.ai — POST https://api.higgsfield.ai/<model yolu> → { request_id, status_url }; GET status_url →
// status queued|in_progress|completed|failed|nsfw|canceled, video.url / images[].url. Başlık "Authorization: Key ID:SECRET".
// Anahtar tek secret HF_API_KEY: "ID:SECRET" olarak; iki parça boşluk/virgül/satırla ayrılmışsa birleştirilir; ya da HF_API_KEY_ID + HF_API_KEY_SECRET.
export const HF_API = "https://api.higgsfield.ai";
export function hfYetki(env) {
  if (env.HF_API_KEY_ID && env.HF_API_KEY_SECRET) return `${String(env.HF_API_KEY_ID).trim()}:${String(env.HF_API_KEY_SECRET).trim()}`;
  let k = String(env.HF_API_KEY || "").trim().replace(/^key\s+/i, "");
  if (!k) return "";
  if (k.includes(":")) return k.split(":").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(":");
  const p = k.split(/[\s,;|]+/).filter(Boolean);
  return p.length >= 2 ? `${p[0]}:${p[1]}` : k;
}
export const hfVar = (env) => /^[^:\s]+:[^:\s]+$/.test(hfYetki(env));
const hfBaslik = (env, ek = {}) => ({ authorization: `Key ${hfYetki(env)}`, "content-type": "application/json", ...ek });
async function hfGonder(env, yol, girdi) {
  const r = await fetch(`${HF_API}/${yol}`, { method: "POST", headers: hfBaslik(env, { "idempotency-key": crypto.randomUUID() }), body: JSON.stringify(girdi) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.request_id) throw new Error(`higgsfield ${yol} ${r.status}: ${JSON.stringify(j.detail || j).slice(0, 300)}`);
  return { hf: true, id: j.request_id, durumUrl: j.status_url || `${HF_API}/requests/${j.request_id}/status` };
}
async function hfDurum(env, f) {
  const r = await fetch(f.durumUrl, { headers: hfBaslik(env) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status >= 500 || r.status === 429) return { bitti: false }; return { bitti: true, hata: `higgsfield durum ${r.status}: ${JSON.stringify(j.detail || j).slice(0, 200)}` }; }
  if (["queued", "in_progress"].includes(j.status)) return { bitti: false };
  if (j.status === "nsfw") return { bitti: true, hata: "higgsfield nsfw: content moderation" };
  if (j.status !== "completed") return { bitti: true, hata: `higgsfield ${j.status || "?"}: ${String(j.error || "").slice(0, 200)}` };
  const resimler = (j.images || []).map((x) => x && x.url).filter(Boolean);
  const video = (j.video && j.video.url) || ((j.videos || [])[0] || {}).url;
  return resimler.length || video ? { bitti: true, resimler, video } : { bitti: true, hata: `sonuç yok: ${JSON.stringify(j).slice(0, 200)}` };
}
export async function hfTahmin(env, yol, girdi) { // ücretsiz fiyat tahmini (estimate) → USD ya da null
  try {
    const r = await fetch(`${HF_API}/estimate/${yol}`, { method: "POST", headers: hfBaslik(env), body: JSON.stringify(girdi) });
    const j = await r.json().catch(() => ({}));
    const u = Number(j.usd);
    return r.ok && Number.isFinite(u) ? u : null;
  } catch { return null; }
}
// Tek seferlik Higgsfield bilgi sorgusu (Claude Code; KV "venom:pelinHfSor" = { sema: true, filtre: "kling|seedance", tahmin: [{yol, girdi}] }):
// sadece GET openapi.json (şema özeti) ve POST /estimate (ücretsiz) → KV "venom:pelinHfSonuc". Üretim isteği ATILMAZ, anahtar yazılmaz.
async function hfSor(env) {
  const s = await env.KAYIT.get("venom:pelinHfSor", "json");
  if (!s) return;
  await env.KAYIT.delete("venom:pelinHfSor");
  const yetki = hfYetki(env);
  const c = { zaman: Math.floor(Date.now() / 1000), anahtar: { var: Boolean(yetki), bicim: hfVar(env) ? "ID:SECRET" : yetki ? "tek parça (ayrılamadı)" : "yok", idUzunluk: yetki.split(":")[0].length, secretUzunluk: (yetki.split(":")[1] || "").length }, sema: {}, tahmin: [], durum: null };
  try { const r = await fetch(`${HF_API}/requests/00000000-0000-0000-0000-000000000000/status`, { headers: hfBaslik(env) }); c.durum = { kod: r.status, govde: (await r.text()).slice(0, 300) }; } catch (e) { c.durum = { hata: String(e.message) }; }
  if (s.sema) {
    for (const u of [`${HF_API}/openapi.json`, "https://docs.higgsfield.ai/openapi.json", "https://docs.higgsfield.ai/docs/openapi.json"]) {
      try {
        const r = await fetch(u, { headers: u.startsWith(HF_API) ? hfBaslik(env) : {} });
        const j = await r.json().catch(() => null);
        if (!j || !j.paths) { c.sema[u] = { durum: r.status }; continue; }
        const filtre = new RegExp(String(s.filtre || "."), "i");
        const ref = (o) => { let x = o; for (let i = 0; i < 5 && x && x.$ref; i++) x = x.$ref.split("/").slice(1).reduce((a, k) => a && a[k], j); return x; };
        const yollar = {};
        for (const [p, v] of Object.entries(j.paths)) {
          if (!v.post || !filtre.test(p) || p.startsWith("/estimate")) continue;
          const sch = ref((((v.post.requestBody || {}).content || {})["application/json"] || {}).schema || {});
          const ozel = (sch && sch.properties) || {};
          yollar[p] = { ozet: String(v.post.summary || "").slice(0, 120), gerekli: (sch && sch.required) || [], alanlar: Object.fromEntries(Object.entries(ozel).map(([k, a]) => { const b = ref(a) || {}; return [k, { tur: b.type || (b.anyOf || []).map((y) => (ref(y) || {}).type).join("|"), secenek: b.enum || ((b.anyOf || []).map((y) => ref(y) || {}).find((y) => y.enum) || {}).enum, vars: b.default, min: b.minimum, max: b.maximum, aciklama: String(b.description || "").slice(0, 140) }]; })) };
        }
        c.sema[u] = { durum: r.status, yolSayisi: Object.keys(j.paths).length, tumYollar: Object.keys(j.paths).filter((p) => !p.startsWith("/estimate")).slice(0, 300), yollar };
        break;
      } catch (e) { c.sema[u] = { hata: String(e.message) }; }
    }
  }
  // Ham belge (sadece GET, sadece higgsfield.ai alanları): { url } → ilk 1,5 MB metin (model yolları ve şemalar için)
  c.ham = {};
  for (const h of (Array.isArray(s.ham) ? s.ham : []).slice(0, 6)) {
    const u = String(h.url || h);
    if (!/^https:\/\/([a-z0-9-]+\.)?higgsfield\.ai\//.test(u)) continue;
    try { const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (VOLONTE Pelin belge okuma)", ...(u.startsWith(HF_API) ? hfBaslik(env) : {}) } }); c.ham[u] = { kod: r.status, adres: r.url, metin: (await r.text()).slice(0, 1500000) }; } catch (e) { c.ham[u] = { hata: String(e.message) }; }
  }
  for (const t of (Array.isArray(s.tahmin) ? s.tahmin : []).slice(0, 12)) {
    if (!/^[a-z0-9._/-]+$/i.test(String(t.yol))) continue;
    try { const r = await fetch(`${HF_API}/estimate/${t.yol}`, { method: "POST", headers: hfBaslik(env), body: JSON.stringify(t.girdi || {}) }); c.tahmin.push({ yol: t.yol, kod: r.status, govde: (await r.text()).slice(0, 400) }); } catch (e) { c.tahmin.push({ yol: t.yol, hata: String(e.message) }); }
  }
  await env.KAYIT.put("venom:pelinHfSonuc", JSON.stringify(c), { expirationTtl: 3 * 86400 });
}

// Higgsfield anahtarı süreli (4 Kasım: 30 gün). KV "venom:hfAnahtar" = { bitis: "YYYY-AA-GG" } → bitişten 5 gün önce (İstanbul 10:00'dan
// sonra) Patron'a bir kez hatırlatma; bitiş günü bir kez daha. Anahtarın kendisi burada yok (Cloudflare secret HF_API_KEY).
export async function hfHatirlat(env, simdi) {
  const k = await env.KAYIT.get("venom:hfAnahtar", "json");
  if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(String(k.bitis || ""))) return;
  const bitis = Date.parse(`${k.bitis}T00:00:00+03:00`) / 1000;
  const yerel = new Date((simdi + SAAT_FARKI) * 1000);
  if (yerel.getUTCHours() < 10) return;
  const kalan = Math.ceil((bitis - simdi) / 86400);
  const asama = kalan <= 0 ? "bitti" : kalan <= 5 ? "5gun" : null;
  if (!asama || (k.gonderilen || []).includes(asama)) return;
  const tarih = k.bitis.split("-").reverse().join(".");
  const metin = asama === "5gun"
    ? `⏰ Hatırlatma: Higgsfield API anahtarı ${tarih} tarihinde bitiyor (${kalan} gün kaldı). Yeni anahtar alıp Cloudflare → volonte-pelin → Settings → Variables and Secrets → HF_API_KEY değerini değiştirin, sonra Claude Code'a "yeni Higgsfield anahtarını girdim" yazın. Bitince Pelin otomatik fal.ai'ye döner.`
    : `⚠️ Higgsfield API anahtarının süresi bugün (${tarih}) doldu. Pelin artık fal.ai ile üretir. Yenilemek için HF_API_KEY değerini değiştirip Claude Code'a haber verin.`;
  const r = await tg(env, "sendMessage", { chat_id: murat(env), text: metin });
  if (r && r.ok) await env.KAYIT.put("venom:hfAnahtar", JSON.stringify({ ...k, gonderilen: [...(k.gonderilen || []), asama] }));
}

// ---------- RENK KONTROLÜ (Patron önerisi 8): kontrol renk kayması bulursa (bordo→kırmızı gibi) yeniden üretimde açık düzeltme ----------
export const renkKaymasi = (k) => Boolean(k && (k.renk_buyuk_fark || k.renk_ayni === false || (k.sorunlar || []).some((x) => /renk|ton|colou?r|parlak|canlı|kırmızı|bordo|vişne/i.test(x))));
export function renkDuzeltmesi(is, istem) {
  if (!is.renkKaydi) return istem;
  return `COLOR CORRECTION (previous attempt drifted, e.g. dark burgundy rendered as bright red): match the EXACT shade of the product photos${is.renk ? ` (${renkEn(is.renk)})` : ""} — same darkness, same saturation, same undertone; do NOT brighten or warm the color. ${istem}`;
}
// ---------- FOTOĞRAF REHBERİ (elemanlar için; /rehber) ----------
export const FOTO_REHBERI = [
  "📸 PELİN FOTOĞRAF REHBERİ (her model için)",
  "1) MANKENDE ÖN: tam boy, yakadan etek ucuna, telefon DİKEY → yazı: \"3627 manken\"",
  "2) MANKENDE ARKA: aynı yerden, tam boy → yazı: \"3627 manken arka\"",
  "3) YAKIN DETAY: yaka, bel/işleme, kol ucu (1-3 fotoğraf) → yazı: \"3627 detay\"",
  "4) KUMAŞ ETİKETİ (varsa): okunur, yakından → yazı: \"3627 etiket\"",
  "Işık: düz ve bol (gölgesiz, flaş yok) · Arka plan: sade (beyaz duvar en iyisi) · Elbise ütülü, manken düz.",
  "Renk netliği için \"Dosya olarak\" gönderin. İyi fotoğraf = daha az hata, daha az para.",
].join("\n");
// Üretimden önce: eksik fotoğraf (ön/arka mankende, yakın detay) → karta yazılır + elemana söylenir
export async function eksikFotolar(env, kod) {
  const l = (await oku(env, `pelin:urunfoto:${kod}`, [])).map((x) => ({ ...x, rol: x.rol || "on" }));
  return [!l.some((x) => x.rol === "on" && x.etiket !== "aski" && x.etiket !== "kumas") && "mankende ÖN", !l.some((x) => x.rol === "arka") && "mankende ARKA", !l.some((x) => x.rol === "detay" && x.etiket !== "kumas") && "yakın DETAY (yaka/bel/kol ucu)"].filter(Boolean);
}
const KUMAS_SEMA = { type: "object", additionalProperties: false, required: ["okundu", "kumas"], properties: { okundu: { type: "boolean" }, kumas: { type: "string", description: "Bileşim, kısa ve büyük harf olmadan, örn. '100% polyester' ya da '95% viscose, 5% elastane'. Okunamıyorsa boş." } } };
async function kumasOku(env, url, simdi) {
  if (!url) return null;
  const y = await claudeJson(env, [resimUrl(url), { type: "text", text: "Bu bir giysi kumaş etiketi. Kumaş bileşimini (yüzde + lif) aynen oku; tahmin etme. Okunmuyorsa okundu=false." }], KUMAS_SEMA, simdi, 200);
  return y && y.okundu && y.kumas ? String(y.kumas).slice(0, 60) : null;
}
// ---------- ÖNCELİK + SATIŞ ETKİSİ + MALİYET HEDEFİ (Vegawin satışları; iki mağaza AYRI, karşılaştırılmaz) ----------
export const MODEL_HEDEF_USD = 2;
const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
async function satisToplam(env, magaza, basla, bitis) {
  const t = {};
  for (let g = basla; g <= bitis; g += 86400) for (const x of (await stokIste(env, "/satislar", { gun: gunA(g), magaza }).catch(() => [])) || []) t[x.kod] = (t[x.kod] || 0) + (Number(x.satilan) || 0);
  return t;
}
async function videoluKodlar(env) {
  const v = new Set();
  for (const id of (await oku(env, "pelin:isler", [])).slice(-200)) { const x = await oku(env, `pelin:is:${id}`, null); if (x && x.durum === "onaylandi") v.add(String(x.kod)); }
  return v;
}
// 6 Kasım (Patron): Merdan'dan video BEKLENEN modeller (20 MB üstü gelmiş / tekrar istenmiş) Pelin'e önerilmez
export async function merdanVideoBekleyen(env, simdi = Math.floor(Date.now() / 1000)) {
  const df = await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null); // 6 Kasım: tek doğru liste
  if (df && df.modeller) return new Set(Object.values(df.modeller).filter((m) => m.videoBekleniyor).map((m) => String(m.kod)));
  const d = (await env.KAYIT.get("venom:videoDenetim", "json").catch(() => null)) || {};
  const gelen = (await env.KAYIT.get("venom:videoGelenBuyuk", "json").catch(() => null)) || [];
  return new Set([...(d.sorunlar || []).filter((x) => ["buyuk", "sitede-bozuk"].includes(x.tur)).map((x) => String(x.kod)), ...(d.istenen || []).map(String),
    ...gelen.filter((x) => x.kod && simdi - x.zaman < 14 * 86400).map((x) => String(x.kod))]);
}
export async function oncelikMetni(env, simdi) {
  if (!env.STOK) return "Stok deposu bağlı değil.";
  const videolu = await videoluKodlar(env), satir = [];
  const bekleyen = await merdanVideoBekleyen(env, simdi);
  for (const [magaza, ad] of [["VOLONTE", "VOLONTE"], ["BLACKROSE", "BLACK ROSE"]]) {
    const s = await satisToplam(env, magaza, simdi - 6 * 86400, simdi);
    const kodlar = Object.keys(s).filter((k) => !videolu.has(k) && !bekleyen.has(k));
    const st = kodlar.length ? await stokIste(env, "/toplu", { kodlar }).catch(() => ({})) : {};
    const l = kodlar.map((k) => ({ k, s: s[k], stok: Math.max(0, (st[k] || {}).toplam || 0) })).filter((x) => x.stok >= 5).sort((a, b) => b.s - a.s || b.stok - a.stok).slice(0, 8);
    satir.push(`🏬 ${ad}:`, ...(l.length ? l.map((x, i) => `${i + 1}. ${x.k} — 7 günde ${x.s} adet satış · stok ${x.stok}`) : ["(videosuz, stoğu ≥5 ve satan model yok)"]));
  }
  return ["🎯 ÖNCELİK (Pelin önce bunları yapsın): son 7 gün en çok satan + stoğu fazla + henüz videosu yok", ...satir, ...(bekleyen.size ? [`(Merdan'dan video beklenen ${bekleyen.size} model listeye alınmadı: ${[...bekleyen].slice(0, 10).join(", ")})`] : []), "Üretmek için: \"<kod> üret\""].join("\n");
}
export async function haftalikRapor(env, simdi) {
  const satir = ["📊 HAFTALIK PELİN RAPORU"], maliyet = {}, yayin = {};
  for (const id of (await oku(env, "pelin:isler", [])).slice(-200)) { const x = await oku(env, `pelin:is:${id}`, null); if (!x) continue; maliyet[x.kod] = (maliyet[x.kod] || 0) + (x.maliyet || 0); if (x.durum === "onaylandi") yayin[x.kod] = Math.max(yayin[x.kod] || 0, x.onayZaman || x.zaman || 0); }
  const kanal = (await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {};
  satir.push("", "🎬 Videolu paylaşımın satışa etkisi (paylaşımdan önceki 7 gün → sonraki 7 gün, modelin kendi mağazası):");
  let n = 0;
  for (const kod of Object.keys(yayin)) {
    const t = Number(kanal[kod]) || 0; if (!t || t < yayin[kod]) { satir.push(`• ${kod}: henüz kanala gitmedi`); continue; }
    const magaza = ((await boyOku(env, kod)) || {}).marka === "BLACKROSE" ? "BLACKROSE" : "VOLONTE";
    const gun = Math.floor((simdi - t) / 86400);
    if (gun < 7 || !env.STOK) { satir.push(`• ${kod} (${magaza === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"}): ölçülüyor (${Math.max(0, gun)}/7 gün)`); continue; }
    const once = (await satisToplam(env, magaza, t - 7 * 86400, t - 86400))[kod] || 0, sonra = (await satisToplam(env, magaza, t, t + 6 * 86400))[kod] || 0;
    satir.push(`• ${kod} (${magaza === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"}): ${once} → ${sonra} adet${once ? ` (${sonra >= once ? "+" : ""}${Math.round(((sonra - once) / once) * 100)}%)` : ""}`);
    if (++n >= 15) break;
  }
  satir.push("", `💵 Model başı maliyet (hedef en fazla ${MODEL_HEDEF_USD} $):`, ...Object.entries(maliyet).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, u]) => `• ${k}: ${para(u)}${u > MODEL_HEDEF_USD ? " ⚠️ hedefi aştı" : " ✅"}`));
  return satir.join("\n");
}
// Haftalık rapor: Pazartesi 10:00'dan sonra bir kez (İstanbul)
async function haftalikRaporCron(env, simdi) {
  const y = new Date((simdi + SAAT_FARKI) * 1000);
  if (y.getUTCDay() !== 1 || y.getUTCHours() < 10) return;
  const anahtar = `pelin-hafta:${gunA(simdi)}`;
  if (await env.KAYIT.get(anahtar)) return;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 14 * 86400 });
  await yaz(env, murat(env), await haftalikRapor(env, simdi));
}
// Arşivden kullan (0 $): Kemal SON YAYIN kartı arşivdeki paketle
async function arsivDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const kod = cq.data.split(":")[2];
  const a = await env.KAYIT.get(`pelinarsiv:${kod}`, "json");
  if (!a) return cevap("Arşivde paket yok.");
  await kuyrugaEkle(env, "pelinKanal", { v: 3, yayinOnayi: true, id: `${kod}-ar${simdi.toString(36)}`, kod, marka: a.marka, foto: a.foto, video: a.video, set: a.set || [], deneme: false, onay: "patron-arsiv", zaman: simdi });
  await cevap("Arşivden — Kemal kartı geliyor");
  return yaz(env, cq.message.chat.id, `📦 ${kod}: arşivdeki paket (${tarihSaatYaz(a.zaman)}) kullanılıyor — yeniden üretim YOK, 0 $. Kemal SON YAYIN kartını getirecek.`);
}

// ---------- 360° GÖRÜNÜM DENEMESİ (4 Kasım, Patron; tek seferlik, Claude Code): KV "venom:pelin360" =
// { kod, yollar: { A: { uc, girdi, fiyat, tur: "3d" }, B: { uc, girdi, fiyat, tur: "video" } }, butce } → sonuçlar süresiz KV kopyası
// (GLB / MP4, CORS + Range ile /medya) → "venom:pelin360Sonuc". Bütçe tavanı zorunlu; video yolu bu istekle açıkça onaylı.
const urlBul = (o, kosul) => { let b = null; const gez = (x) => { if (b || !x) return; if (typeof x === "string") { if (/^https?:\/\//.test(x) && kosul(x)) b = x; return; } if (typeof x === "object") for (const v of Object.values(x)) gez(v); }; gez(o); return b; };
async function donusAdimi(env, simdi) {
  const yeni = await env.KAYIT.get("venom:pelin360", "json");
  if (yeni && yeni.kod) {
    await env.KAYIT.delete("venom:pelin360");
    const toplam = Object.values(yeni.yollar || {}).reduce((t, y) => t + Number(y.fiyat || 0), 0);
    if (!(toplam <= Number(yeni.butce || 0))) throw new Error(`360 bütçesi aşılır (${toplam} > ${yeni.butce})`);
    const d = { kod: yeni.kod, zaman: simdi, istek: {}, sonuc: {}, tur: {}, maliyet: yuvarla(toplam) };
    for (const [ad, y] of Object.entries(yeni.yollar)) { d.istek[ad] = await falGonder(env, y.uc, y.girdi); d.tur[ad] = y.tur; await harcamaYaz(env, Number(y.fiyat || 0), simdi); }
    await kaydet(env, "pelin:donus", d, 3 * 86400);
    return;
  }
  const d = await oku(env, "pelin:donus", null);
  if (!d || d.bitti) return;
  for (const [ad, f] of Object.entries(d.istek)) {
    if (d.sonuc[ad]) continue;
    const r = await falHam(env, f).catch(() => ({ bitti: false }));
    if (r.bitti) d.sonuc[ad] = r.hata ? { hata: String(r.hata).slice(0, 300) } : { ham: JSON.stringify(r.c).slice(0, 1500), url: d.tur[ad] === "3d" ? (urlBul(r.c, (u) => /\.glb(\?|$)/i.test(u)) || urlBul(r.c, () => true)) : ((r.c.video || {}).url || urlBul(r.c, (u) => /\.mp4/i.test(u))) };
    else if (simdi - d.zaman > 5400) d.sonuc[ad] = { hata: "90 dakikada bitmedi" };
  }
  if (Object.keys(d.sonuc).length < Object.keys(d.istek).length) { await kaydet(env, "pelin:donus", d, 3 * 86400); return; }
  for (const [ad, r] of Object.entries(d.sonuc)) if (r.url) {
    const k = await fetch(r.url);
    if (k.ok) { const id = crypto.randomUUID().replace(/-/g, ""); await env.KAYIT.put(`pelinmedya:${id}`, await k.arrayBuffer(), { metadata: { tur: d.tur[ad] === "3d" ? "model/gltf-binary" : "video/mp4" } }); r.kopya = `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${id}`; }
  }
  d.bitti = simdi;
  await kaydet(env, "pelin:donus", d, 3 * 86400);
  await env.KAYIT.put("venom:pelin360Sonuc", JSON.stringify(d), { expirationTtl: 7 * 86400 });
}

// Zamanlı işler (Claude Code, Patron isteğiyle): KV "venom:pelinZamanli" = [{ zaman, islem: "teslim", isId }] → zamanı gelince
// hazır paket (video + mankenli foto seti; askı/360 YOK) Kemal'e: SON YAYIN ONAYI kartı. Yeni üretim yok, para yok.
// 6 Kasım (yedek): her gece (03–05) Pelin'in iç kayıtları KV "yedek:<gün>:pelin" (8 gün) — işler, ürün fotoğrafları, seçim
async function pelinYedek(env, simdi) {
  const gy = await env.KAYIT.get("venom:yedekGeriYukle:pelin"); // geri yükleme (tek seferlik): "YYYY-AA-GG"
  if (gy) {
    await env.KAYIT.delete("venom:yedekGeriYukle:pelin");
    const y = await env.KAYIT.get(`yedek:${gy}:pelin`, "json");
    if (y && y.veri) for (const [k, v] of Object.entries(y.veri)) if (v != null) await kaydet(env, k, v);
    await env.KAYIT.put("venom:yedekGeriYukleSonuc:pelin", JSON.stringify({ zaman: simdi, gun: gy, ok: Boolean(y), anahtar: y ? Object.keys(y.veri).length : 0 }), { expirationTtl: 7 * 86400 });
  }
  const s = (new Date((simdi + 3 * 3600) * 1000)).getUTCHours();
  const gun = new Date((simdi + 3 * 3600) * 1000).toISOString().slice(0, 10);
  if (s < 3 || s >= 5 || (await oku(env, `pelin:yedek:${gun}`, null))) return;
  const isler = await oku(env, "pelin:isler", []);
  const veri = { "pelin:secim": await oku(env, "pelin:secim", null), "pelin:isler": isler };
  for (const id of isler.slice(-60)) veri[`pelin:is:${id}`] = await oku(env, `pelin:is:${id}`, null);
  const ks = ((await Promise.resolve().then(() => env.KAYIT.list({ prefix: "pelin:urunfoto:" })).catch(() => ({ keys: [] }))).keys || []).map((k) => k.name);
  for (const k of ks) veri[k] = await oku(env, k, null);
  await env.KAYIT.put(`yedek:${gun}:pelin`, JSON.stringify({ zaman: simdi, veri }), { expirationTtl: 8 * 86400 });
  await kaydet(env, `pelin:yedek:${gun}`, 1, 2 * 86400);
}
async function zamanliIsler(env, simdi) {
  const l = (await env.KAYIT.get("venom:pelinZamanli", "json")) || [];
  if (!l.length) return;
  const kalan = [];
  for (const z of l) {
    if (simdi < Number(z.zaman)) { kalan.push(z); continue; }
    const x = await oku(env, `pelin:is:${z.isId}`, null);
    if (z.islem === "teslim" && x && x.paket && x.paket.video) {
      x.paket.ekler = []; x.paket.set = Object.fromEntries(Object.entries(x.paket.set || {}).filter(([k]) => ["sag", "sol", "arka"].includes(k)));
      x.yayinYok = false; x.paketOnayIste = false;
      x.gecmis = [...(x.gecmis || []), [simdi, "zamanlı: Kemal SON YAYIN kartı (video + mankenli foto seti)"]];
      await teslimEt(env, x, simdi);
    } else await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "zamanli", hata: `iş/paket yok: ${z.isId}` }), { expirationTtl: 7 * 86400 });
  }
  await env.KAYIT.put("venom:pelinZamanli", JSON.stringify(kalan));
}

// ---------- SANAL GİYDİRME (virtual try-on) DENEMESİ (4 Kasım, Patron: "elbiseyi yeniden çizme, giydir") ----------
// fal üzerinde: FASHN v1.6 (0,075 $/görsel, "one-pieces" = elbise) ve Kling Kolors Virtual Try-On v1.5 (0,07 $/görsel).
// Higgsfield API'de giydirme aracı YOK (sadece video + Soul). Model görseli = bugünkü onaylı ön fotoğraf (3 numaralı manken),
// giysi = Patron'un GERÇEK fotoğrafı. Tek seferlik (Claude Code; KV "venom:pelinGiydirme"), bütçe tavanı zorunlu.
export const GIYDIRME = {
  fashn: { uc: "fal-ai/fashn/tryon/v1.6", ad: "FASHN v1.6", fiyat: 0.075, girdi: (m, g) => ({ model_image: m, garment_image: g, category: "one-pieces", mode: "quality", garment_photo_type: "auto", num_samples: 1, output_format: "jpeg" }) },
  kolors: { uc: "fal-ai/kling/v1-5/kolors-virtual-try-on", ad: "Kling Kolors Try-On v1.5", fiyat: 0.07, girdi: (m, g) => ({ human_image_url: m, garment_image_url: g }) },
};
async function giydirmeAdimi(env, simdi) {
  const yeni = await env.KAYIT.get("venom:pelinGiydirme", "json");
  if (yeni && yeni.kod) {
    await env.KAYIT.delete("venom:pelinGiydirme");
    const araclar = (yeni.araclar || ["fashn"]).filter((a) => GIYDIRME[a]);
    const toplam = araclar.reduce((t, a) => t + GIYDIRME[a].fiyat, 0);
    if (!(toplam <= Number(yeni.butce || 0))) throw new Error(`giydirme bütçesi aşılır (${toplam} > ${yeni.butce})`);
    const x = yeni.isId ? await oku(env, `pelin:is:${yeni.isId}`, null) : null;
    const model = yeni.model || (x && (x.sahne || x.foto)); // Patron'un onayladığı ön fotoğraf (video başlangıç karesi)
    const giysi = /^[0-9a-f]{32}$/.test(String(yeni.giysi)) ? dosyaAdresi(env, yeni.giysi) : yeni.giysi;
    if (!model || !giysi) throw new Error("giydirme: model ya da giysi görseli yok");
    const d = { kod: yeni.kod, model, giysi, zaman: simdi, istek: {}, sonuc: {} };
    for (const a of araclar) { d.istek[a] = await falGonder(env, GIYDIRME[a].uc, GIYDIRME[a].girdi(model, giysi)); await harcamaYaz(env, GIYDIRME[a].fiyat, simdi); }
    d.maliyet = yuvarla(toplam);
    await kaydet(env, "pelin:giydirme", d, 3 * 86400);
    return;
  }
  // Ek sonuç (Claude Code; KV "venom:pelinGiydirmeEk" = { kod, ad, url }): okunamamış bir giydirme sonucu Patron'a ayrıca gönderilir
  const ek = await env.KAYIT.get("venom:pelinGiydirmeEk", "json");
  if (ek && ek.url && /^https:\/\/[a-z0-9.-]+\.(fal\.media|fashn\.ai)\//.test(ek.url)) {
    await env.KAYIT.delete("venom:pelinGiydirmeEk");
    const k = await fetch(ek.url);
    const kopya = k.ok ? await medyaKaydet(env, await k.arrayBuffer(), k.headers.get("content-type") || "image/png") : null;
    const g = kopya ? await tgDosya(env, "sendPhoto", "photo", kopya, { chat_id: murat(env), caption: `${ek.kod} · SANAL GİYDİRME — ${ek.ad} (ikinci araç; az önce okunamamıştı, ek ücret yok)` }) : null;
    await env.KAYIT.put("venom:pelinGiydirmeEkSonuc", JSON.stringify({ kopya, gonderildi: Boolean(g && g.ok), hata: g && !g.ok ? g.description : null }), { expirationTtl: 86400 });
  }
  const d = await oku(env, "pelin:giydirme", null);
  if (!d || d.bitti) return;
  for (const [a, f] of Object.entries(d.istek)) {
    if (d.sonuc[a]) continue;
    const r = await falDurum(env, f).catch(() => ({ bitti: false }));
    if (r.bitti) d.sonuc[a] = r.hata ? { hata: String(r.hata).slice(0, 200) } : { url: (r.resimler || [])[0] };
    else if (simdi - d.zaman > 3600) d.sonuc[a] = { hata: "1 saatte bitmedi" };
  }
  if (Object.keys(d.sonuc).length < Object.keys(d.istek).length) { await kaydet(env, "pelin:giydirme", d, 3 * 86400); return; }
  // Kopyalar KV'ye (Claude Code karşılaştırsın) + Patron'a: bugünkü foto · gerçek giysi · giydirme sonuçları
  for (const [a, r] of Object.entries(d.sonuc)) if (r.url) { const k = await fetch(r.url); if (k.ok) r.kopya = await medyaKaydet(env, await k.arrayBuffer()); }
  const media = [{ type: "photo", media: d.model, caption: `${d.kod} · 1) bugünkü (yapay zekâ elbiseyi yeniden çizdi)` }, { type: "photo", media: d.giysi, caption: `${d.kod} · 2) gerçek elbise fotoğrafınız` },
    ...Object.entries(d.sonuc).filter(([, r]) => r.url).map(([a, r], i) => ({ type: "photo", media: r.kopya || r.url, caption: `${d.kod} · ${i + 3}) SANAL GİYDİRME — ${GIYDIRME[a].ad}` }))];
  const g = await tg(env, "sendMediaGroup", { chat_id: murat(env), media });
  const hatalar = Object.entries(d.sonuc).filter(([, r]) => r.hata).map(([a, r]) => `${GIYDIRME[a].ad}: ${falHataTr(r.hata)}`);
  await yaz(env, murat(env), [`👗 ${d.kod} SANAL GİYDİRME denemesi (elbise yeniden çizilmez, gerçek fotoğraftaki elbise mankene giydirilir). Harcanan ~${para(d.maliyet)}.`, hatalar.length ? `Olmayan: ${hatalar.join("; ")}` : "", "Yaka (dik büzgülü), bel danteli ve boy karşılaştırmasını Claude Code ayrıca yazacak. Beğenirseniz bu yol varsayılan fotoğraf yolu olur ve video bu fotoğraftan üretilir — sizin onayınızla."].filter(Boolean).join("\n"));
  d.bitti = simdi; d.gonderildi = Boolean(g && g.ok);
  await kaydet(env, "pelin:giydirme", d, 3 * 86400);
  await env.KAYIT.put("venom:pelinGiydirmeSonuc", JSON.stringify(d), { expirationTtl: 3 * 86400 });
}
// Tek seferlik (Claude Code): KV "venom:pelinFotoKopya" = { kod } → Patron'un o koda gönderdiği fotoğraflar küçültülüp
// KV "pelinmedya:" kopyası + liste "venom:pelinFotoKopyaSonuc" (Claude Code fotoğrafları görüp doğru askı/ön fotoğrafını seçsin)
async function fotoKopya(env) {
  const f = await env.KAYIT.get("venom:pelinFotoKopya", "json");
  if (!f || !f.kod) return;
  await env.KAYIT.delete("venom:pelinFotoKopya");
  const l = fotoSirala(await oku(env, `pelin:urunfoto:${f.kod}`, []));
  const c = [];
  for (const x of l.slice(0, 10)) {
    try {
      const r = await dosyaVer(env, x.anahtar);
      if (!r.ok) { c.push({ ...x, hata: r.status }); continue; }
      const k = await env.IMAGES.input(r.body).transform({ width: 700, fit: "scale-down" }).output({ format: "image/jpeg", quality: 85 });
      const id = (await medyaKaydet(env, await k.response().arrayBuffer())).split("/").pop();
      c.push({ anahtar: x.anahtar, rol: x.rol, etiket: x.etiket || null, renk: x.renk || null, zaman: x.zaman, medya: id });
    } catch (e) { c.push({ anahtar: x.anahtar, hata: String(e && e.message).slice(0, 120) }); }
  }
  await env.KAYIT.put("venom:pelinFotoKopyaSonuc", JSON.stringify({ kod: f.kod, fotolar: c }), { expirationTtl: 86400 });
}

export async function pelinCron(env, simdi) {
  await webhookKur(env);
  if (hfYetki(env)) { try { await hfSor(env); } catch (e) { await env.KAYIT.put("venom:pelinHfSonuc", JSON.stringify({ hata: String(e && e.message) })); } }
  try { const sd = await env.KAYIT.get("venom:pelinSablonDeneme", "json"); if (sd && sd.kod) { await env.KAYIT.delete("venom:pelinSablonDeneme"); await sablonDenemesi(env, sd, simdi); } } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "sablonDenemesi", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  // Tek seferlik HEIC çevirme denemesi (Claude Code; KV "venom:pelinHeicDeneme" = base64 HEIC) → "venom:pelinHeicSonuc"
  try { const hb = await env.KAYIT.get("venom:pelinHeicDeneme"); if (hb) { await env.KAYIT.delete("venom:pelinHeicDeneme"); let sonuc; try { const bayt = Uint8Array.from(atob(hb), (c) => c.charCodeAt(0)); const c = await env.IMAGES.input(new Blob([bayt]).stream()).transform({ width: 2400, fit: "scale-down" }).output({ format: "image/jpeg", quality: 92 }); const j = new Uint8Array(await c.response().arrayBuffer()); sonuc = { ok: j[0] === 0xff && j[1] === 0xd8, boyut: j.length, tur: c.contentType ? c.contentType() : null }; } catch (e) { sonuc = { ok: false, hata: String(e && e.message).slice(0, 300) }; } await env.KAYIT.put("venom:pelinHeicSonuc", JSON.stringify({ zaman: simdi, ...sonuc }), { expirationTtl: 86400 }); } } catch { /* sonra */ }
  if (env.STOK) { try { await haftalikRaporCron(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "haftalik", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  try { const pm = await env.KAYIT.get("venom:pelinPatronaYaz"); if (pm) { await env.KAYIT.delete("venom:pelinPatronaYaz"); await yaz(env, murat(env), pm); } } catch { /* sonra */ }
  if (env.FAL_KEY) { try { await donusAdimi(env, simdi); } catch (e) { await env.KAYIT.put("venom:pelin360Sonuc", JSON.stringify({ hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 3 * 86400 }); } }
  try { const rh = await env.KAYIT.get("venom:pelinRehberGonder"); if (rh) { await env.KAYIT.delete("venom:pelinRehberGonder"); for (const k of [...new Set([murat(env), hemra(env)].filter(Boolean))]) await yaz(env, k, FOTO_REHBERI); } } catch { /* sonra */ }
  try { await fotoKopya(env); } catch (e) { await env.KAYIT.put("venom:pelinFotoKopyaSonuc", JSON.stringify({ hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 86400 }); }
  if (env.FAL_KEY) { try { await giydirmeAdimi(env, simdi); } catch (e) { await env.KAYIT.put("venom:pelinGiydirmeSonuc", JSON.stringify({ hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 86400 }); } }
  try { await hfHatirlat(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "hfHatirlat", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { await dokumanOku(env); } catch (e) { await env.KAYIT.put("venom:pelinDokumanSonuc", JSON.stringify({ hata: String(e && e.message) })); }
  if (env.FAL_KEY) { try { await falSor(env); } catch (e) { await env.KAYIT.put("venom:pelinFalSonuc", JSON.stringify({ hata: String(e && e.message) })); } }
  try { const sc = await env.KAYIT.get("pelin:secim"); if (sc && sc !== (await env.KAYIT.get("pelin:secimAyna"))) { await env.KAYIT.put("venom:pelinSecim", sc); await env.KAYIT.put("pelin:secimAyna", sc); } } catch { /* sonra */ }
  // Tek seferlik (Claude Code, Patron isteğiyle): KV "venom:pelinIsKomut" = { isId, islem: "katalogdan", muzik: { url, ad }, deneme } →
  // o işin ONAYLI katalog fotoğrafından yeni video işi + maliyet kartı (Patron onaylarsa başlar)
  try { const ik = await env.KAYIT.get("venom:pelinIsKomut", "json"); if (ik && ik.isId) { await env.KAYIT.delete("venom:pelinIsKomut"); if (ik.islem === "askiEtiketsiz") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.ad && x.ad.sonuc) { const y = { ...x, adSonuc: null }; await askiDetayIlerle(env, y, simdi, x.paket.marka, { etiketsiz: true }); await env.KAYIT.put("venom:pelinAskiEtiketsiz", JSON.stringify({ ek: (y.adSonuc && y.adSonuc.ek) || [], kesOn: (x.ad.sonuc.kesOn || {}).url || null, kesArka: (x.ad.sonuc.kesArka || {}).url || null }), { expirationTtl: 3 * 86400 }); } } else if (ik.islem === "eskiKapat") { for (const id of (ik.isIdler || []).slice(0, 30)) { const x = await oku(env, `pelin:is:${id}`, null); if (x && ["onay", "uyari", "foto_onay", "senaryo_onay"].includes(x.durum)) { x.durum = "iptal"; x.gecmis = [...(x.gecmis || []), [simdi, `geçersiz — ${String(ik.neden || "Patron isteği").slice(0, 120)}`]]; await kaydet(env, `pelin:is:${x.id}`, x); } } } else if (ik.islem === "videoGonder") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && (x.paketKopya || (x.paket && x.paket.video))) await tgDosya(env, "sendVideo", "video", x.paketKopya || x.paket.video, { chat_id: murat(env), caption: ik.yazi || `🎬 ${x.kod}`, supports_streaming: true }); } else if (ik.islem === "videoDuzelt") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.paket && x.paket.video) { x.duzeltSonra = x.durum; x.duzeltKontrol = Boolean(ik.kontrol); x.paketFal = await falGonder(env, VIDEO_YAZI.olcek, { video_url: x.paket.video, width: 1080, height: 1920, mode: "stretch", crf: 20, codec: "libx264", preset: "medium" }); x.durum = "video_duzelt"; x.bekleZaman = simdi; await kaydet(env, `pelin:is:${x.id}`, x); const l = await oku(env, "pelin:isler", []); if (!l.includes(x.id)) { l.push(x.id); await kaydet(env, "pelin:isler", l.slice(-200)); } } } else if (ik.islem === "askiDetayGoster") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.durum === "aski_kontrol") { x.adKontrol = false; await paketOnizleme(env, x, x.paket.marka); x.durum = "paket_onay"; await kaydet(env, `pelin:is:${x.id}`, x); } } else if (ik.islem === "askiDetayTekrar") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.ad && x.ad.sonuc) { if (ik.yeniKesim) { for (const [kk, f] of [["kesOn", "on"], ["kesArka", "arka"]]) if (x.ad.kaynak[f]) { x.ad.istek[kk] = await falGonder(env, KESIM.uc, { image_url: dosyaAdresi(env, x.ad.kaynak[f]), prompt: KESIM.istem, autocrop: KESIM.autocrop }); delete x.ad.sonuc[kk]; x.maliyet = yuvarla((x.maliyet || 0) + KESIM.fiyat); await harcamaYaz(env, KESIM.fiyat, simdi); } x.ad.zaman = simdi; } x.durum = "aski_detay"; x.adSonuc = null; x.paketOnayIste = true; x.adKontrol = Boolean(ik.kontrol); await kaydet(env, `pelin:is:${x.id}`, x); } } else if (ik.islem === "askiDetay") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.paket && x.video) { await askiDetayBaslat(env, x, simdi); x.durum = "aski_detay"; x.bekleZaman = simdi; x.gecmis = [...(x.gecmis || []), [simdi, "askı ön/arka + detay kolajı (gerçek fotoğraftan) başladı"]]; if (!x.paket.formatlar) x.paket.formatlar = await instagramKirp(env, x.sahne || x.foto, x.kod, x.paket.marka).catch(() => null); await kaydet(env, `pelin:is:${x.id}`, x); const l = await oku(env, "pelin:isler", []); if (!l.includes(x.id)) { l.push(x.id); await kaydet(env, "pelin:isler", l.slice(-200)); } } } else if (ik.islem === "paketYenile") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.video) { if (ik.aski) x.set = { ...(x.set || {}), aski: ik.aski === "yok" ? "yok" : dosyaAdresi(env, ik.aski) }; x.paketKontrol = Boolean(ik.kontrol); x.paketMod = ik.mod || null; x.durum = "paket_gonder"; x.paket = null; x.gecmis = [...(x.gecmis || []), [simdi, "paket yenileniyor (yazı videonun tamamına, gerçek askı fotoğrafı)"]]; await kaydet(env, `pelin:is:${x.id}`, x); const l = await oku(env, "pelin:isler", []); if (!l.includes(x.id)) { l.push(x.id); await kaydet(env, "pelin:isler", l.slice(-200)); } } } else if (ik.islem === "paketBitir") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.durum === "paket_kontrol") { x.paketKontrol = false; await patronaPaketGonder(env, x, x.paket.marka); await teslimEt(env, x, simdi); await yaz(env, murat(env), `📦 ${x.kod}: düzeltilmiş paket hazır ("${MARKALAR[x.paket.marka].ad} · ${x.kod}" videonun tamamında + gerçek askı fotoğrafı). Kemal şimdi YENİ SON YAYIN ONAYI kartını getirecek; eski kart geçersiz.`); } } else if (ik.islem === "setVePaket") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && x.video) { await paketeAl(env, x, simdi); await yaz(env, murat(env), `📸 ${x.kod}: eksik fotoğraf seti üretiliyor (~${para(SET_FIYAT)}); ardından marka yazısı basılıp Kemal son yayın onay kartını getirecek. Video yeniden üretilmez.`); } } else if (ik.islem === "bildir") { const x = await oku(env, `pelin:is:${ik.isId}`, null); if (x && ["onay", "uyari"].includes(x.durum)) { if (ik.onEk) await yaz(env, murat(env), ik.onEk); await isBildir(env, x); await kaydet(env, `pelin:is:${x.id}`, x); } } else await katalogdanVideoKarti(env, ik, simdi); } } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "pelinIsKomut", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  // 9 Kasım (Patron): KV "venom:pelinBuyukYuz" = { isId } → o işin onaylı ön fotoğrafı kalıcı kopya (pelinmedya, süresiz) + "büyük beden yüzü"
  try { const by = await env.KAYIT.get("venom:pelinBuyukYuz", "json"); if (by && by.isId) { await env.KAYIT.delete("venom:pelinBuyukYuz"); await env.KAYIT.put("venom:pelinBuyukYuzSonuc", JSON.stringify(await buyukYuzKaydet(env, by, simdi)), { expirationTtl: 7 * 86400 }); } } catch (e) { await env.KAYIT.put("venom:pelinBuyukYuzSonuc", JSON.stringify({ ok: false, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  // 9 Kasım (Patron): KV "venom:pelinIptal" = { idler: [...], neden } → işler iptal (para harcanmaz; kartları kapanır)
  try { const ip = await env.KAYIT.get("venom:pelinIptal", "json"); if (ip && Array.isArray(ip.idler)) { await env.KAYIT.delete("venom:pelinIptal"); const c = []; for (const id of ip.idler.slice(0, 10)) { const x = await oku(env, `pelin:is:${id}`, null); if (!x) { c.push(`${id}: yok`); continue; } if (["iptal", "onaylandi", "gonderildi"].includes(x.durum)) { c.push(`${id}: zaten ${x.durum}`); continue; } x.durum = "iptal"; (x.gecmis = x.gecmis || []).push([simdi, `iptal (Patron: ${ip.neden || "gerek kalmadı"})`]); await kaydet(env, `pelin:is:${id}`, x); await acikKartSil(env, id); c.push(`${id}: iptal`); } await env.KAYIT.put("venom:pelinIptalSonuc", JSON.stringify({ zaman: simdi, c }), { expirationTtl: 7 * 86400 }); } } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "pelinIptal", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  // Tek seferlik (Claude Code, Patron isteğiyle): KV "venom:pelinKomut" = { metin } → Patron yazmış gibi kart hazırlanır (kart yine Patron onayı ister)
  try { const pk = await env.KAYIT.get("venom:pelinKomut", "json"); if (pk && /^\/(uret|maliyettesti)\b/.test(String(pk.metin))) { await env.KAYIT.delete("venom:pelinKomut"); const p = murat(env); await uretKomutu(env, { from: { id: p }, chat: { id: p }, text: pk.metin, sonSenaryo: Boolean(pk.sonSenaryo) }, simdi, /^\/maliyettesti/.test(pk.metin)); } } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "pelinKomut", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  if (env.STOK) { try { await eskiTeslimSor(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "eskiTeslim", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  try { await urunFotoUrlAktar(env); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "urunFotoUrl", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { await pelinYedek(env, simdi); } catch { /* sonraki gece */ }
  try { await zamanliIsler(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "zamanli", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { await urunFotoAktar(env); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "urunFotoAktar", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { const yk = await env.KAYIT.get("venom:pelinYuzKart", "json"); if (Array.isArray(yk) && yk.length) { await env.KAYIT.delete("venom:pelinYuzKart"); for (const k of yk) await yuzDuzenleKarti(env, murat(env), k.seri, k.talimat, k.istem, simdi, k.onEk || ""); } } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "yuzKart", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  try { await yuzKaydiUygula(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "yuzKaydi", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
  if (env.FAL_KEY) { try { await yuzDuzenCron(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "yuzDuzen", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  try { await teshis(env); } catch (e) { await env.KAYIT.put("venom:pelinTeshisSonuc", JSON.stringify({ hata: String(e && e.message) })); }
  if (env.FAL_KEY && env.STOK) { try { await venomPelinAdimi(env, simdi, venomUretimi); } catch (e) { await hataEkle(env, "pelin:venom", e); } }
  if (env.STOK) { try { await markaRaporu(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "markaRaporu", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  if (env.FAL_KEY) {
    for (const f of [kurulumCron, uretimCron, ornekCron]) { try { await f(env, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: f.name, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  }
  try { await aynaYaz(env, simdi); } catch { /* ayna yazılamazsa üretim etkilenmez */ }
}

// ---------- Dosyalar: Telegram dosyası → fal ve Claude için adres (bot anahtarı dışarı verilmez) ----------
export const dosyaUrl = (env, anahtar) => `${env.SELF_URL}/dosya/${anahtar}`;
async function dosyaVer(env, anahtar) {
  const k = await oku(env, `pelindosya:${anahtar}`, null);
  if (!k) return new Response("yok", { status: 404 });
  const f = await tg(env, "getFile", { file_id: k.file_id });
  if (!f.ok) return new Response("yok", { status: 404 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  // iPhone HEIC/HEIF → JPEG (fal, Claude ve OpenAI HEIC okuyamaz). Cloudflare Images bağlantısı (IMAGES) ile; olmazsa 415.
  if (/hei[cf]/i.test(k.tur || "") || /\.hei[cf]$/i.test(f.result.file_path || "")) {
    if (!env.IMAGES) return new Response("HEIC çevrilemedi (IMAGES yok)", { status: 415 });
    try {
      const c = await env.IMAGES.input(r.body).transform({ width: 2400, fit: "scale-down" }).output({ format: "image/jpeg", quality: 92 });
      return new Response(c.response().body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
    } catch (e) {
      await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), yol: "heic", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 });
      return new Response("HEIC çevrilemedi", { status: 415 });
    }
  }
  return new Response(r.body, { headers: { "content-type": k.tur || "image/jpeg", "cache-control": "private, max-age=3600" } });
}

// ---------- Sohbet (Claude; komutsuz) ----------
// 13 Kasım (Patron, TEK KİTAP): kurallar KURALLAR-PATRON.md'den (kitapOku) gelir; burada sadece çalışma talimatı durur.
const TALIMAT = `Sen Pelin'sin: VOLONTE'nin (İstanbul Laleli, kaliteli kadın giyim toptancısı; ana pazar Afrika, dünya geneli) görsel ve video yapımcısı. Hollywood seviyesinde bir yapımcı gibi düşünürsün: ışık, kadraj, hareket, müzik, ilk 2 saniyede dikkat çekme, Telegram/Instagram/WhatsApp için dikey video.
Sade, kısa, samimi Türkçe konuş (Rusça yazılırsa Rusça). Sohbet gibi konuş: soru sor, fikir ver, daha iyi bir yol görürsen söyle. Komut bekleme.
Kesin kurallar (asla esnemez): kıyafetin rengi, deseni ve kesimi asla değişmez; manken yüzleri hep aynı; fiyat, maliyet, alış fiyatı, kâr ve stok hiçbir görsele/yazıya girmez; videoya AI notu basılmaz; videonun son karesinde modelin MARKASI (VOLONTE ya da BLACK ROSE — model kartında, Sami'nin deposundan) ve altında model kodu (fiyat ve başka yazı yok). Markayı ASLA tahmin etme; VOLONTE ve BLACK ROSE iki ayrı mağazadır, karıştırılmaz. Onaysız harcama yok: her üretimden önce maliyet önizlemesi gider, sadece Murat onaylar. Para harcayan bir işi sen başlatamazsın; sadece "kurulum_karti" (yüz + ortam kurulumu) ya da "uretim_karti" (model kodlarıyla üretim / maliyet testi) ile Patron'a ✅ Onayla / ❌ İptal düğmeli maliyet kartı gönderebilirsin. Eski deneme akışı ("fal hazır", kör test, askı/kumaş denemesi) TAMAMEN KALDIRILDI; ondan söz etme.
Üretim akışı (2 Kasım, Patron): /uret <kod> → ürün fotoğrafı (önce Patron/Hemra'nın gönderdiği, yoksa site) → sabit yüzle fotoğraf → aynı fotoğraftan 6 sn video → kalite kontrol (sen + ikinci göz OpenAI) → renk/desen/kesim farkı varsa otomatik yeniden; 2 denemede olmazsa Patron'a ⚠️ → Patron [✅ Onayla] [🔄 Yeniden üret] [❌ İptal] → onaylanınca Selin siteye, Kemal kanala. /maliyettesti 5 kod → model başı maliyet raporu. Örnek video ("bunun gibi yap, 3557"): kamera, ışık, hız, poz ve ortam havasını tarif olarak çıkarırsın; birebir kopya yok, başkasının yüzü/logosu/müziği yok; beğenilen tarif şablon olur (/sablonlar).
Yapay zekâ yüzden kişi tanıyamaz; "ünlüye benziyor mu" kontrolünü kullanıcının gözü yapar — bunu dürüstçe söyle.
Yüzler (9 Kasım, Patron): büyük bedeni (46+) olan BÜTÜN modeller (38-50 dahil) büyük beden (dolgun) yüzüyle — 5 Kasım onaylı 3627 beyaz ön fotoğrafındaki manken; sadece küçük seri (38-44) modeller küçük seri yüzüyle. Kayıtlı yüzü değiştirmek için: yuz_duzenle_karti (kimlik aynı kalır, sadece istenen değişir; maliyet kartı → Patron önce görür, beğenirse kaydeder) ya da Patron'un gönderdiği fotoğraf (Pelin'e fotoğrafı "yüz" yazısıyla atar → hangi seri sorulur). Patron açıkça yeni yüz istemedikçe kurulum_karti KULLANMA (o tamamen yeni yüzler üretir).
Ortamlar rollü: katalog fotoğrafı ortamı (renk doğruluğu), video ortamı, sadece kampanya videosu ortamı. Değiştirmek için ortam_ayarla.
Ürün fotoğrafları: Patron/Hemra fotoğrafı yazısında model koduyla atar ("3627 ön", "3627 arka", "3627 kırmızı"; albümde ilk fotoğrafa yazmak yeter: 1. ön, 2. arka). Bunlar üretimde siteden önce kullanılır; "dosya olarak" gönderilirse renk daha net kalır. Kontrol: urun_fotolari.
Renk: Patron "3627 kırmızı" derse uretim_karti'ya renkler ile ver; sadece o renk üretilir ve kontrol o rengi arar.
Sahne ayarları her yeni videoda var: yürürken kameraya dönüş, kamera etrafında dönüş, kumaş hareketi, yaka/dikiş yakın kare, "MARKA · kod" yazısı (videonun tamamında sağ alt köşede, video bittikten sonra basılır; model yazı çizmez), videodan kapak fotoğrafı. Beğenilen iş "şablon" olur (önizlemedeki düğme ya da sablon_kaydet); "3630'u 3627 şablonuyla yap" → uretim_karti sablon="3627".
VİDEO ARACI (4 Kasım, Patron): VARSAYILAN ARAÇ YOK. Her üretim kartında Patron seçer: Seedance 2.5, Kling 3.0 4K, Kling 4.0 ya da "Hepsini dene" (üçü aynı fotoğraf ve senaryoyla, yan yana karşılaştırma kartı). Her düğmede fiyatı yazar. Şablon da kartta seçilir: Siyah-Altın, Şehir, Parıltı, Romantik. Seçilmeden ✅ Onayla çalışmaz. Yeni kart gelince eski açık kartlar geçersiz olur. Hiçbir modele "özel araç" kilidi yok.
Model kartı (KALICI, her üretimde kullanılır): seri (küçük/büyük), renk, boy, astar/şeffaflık notu, detay, etiketli fotoğraflar, son şablon. Patron "3627 büyük seri", "3627 koyu bordo", "3627'de sadece göğüste ince astar" gibi şeyler söylerse model_karti_kaydet ile kaydet. Kartı göstermek: model_karti (Patron "3627 kart" da yazabilir).
Fotoğraf etiketleri: "3627 manken" (giyilmiş), "3627 askı", "3627 detay"; ön/arka eklenebilir ("3627 manken arka"). iPhone HEIC dosyaları otomatik JPEG'e çevrilir.
Lüks marka seviyesi (3 Kasım): sinematik ışık; VOLONTE kadını (başarılı, zengin, özgüvenli, 30-45); poz ile bel vurgusu (kesim ASLA daraltılmaz); aksesuarı elbiseye göre sen seçersin (kartta yazar); "premium" = lüks mekân (otel lobisi, mermer merdiven, şık restoran, villa terası, lüks araba, Lagos/Nairobi daveti), "standart" = aynı kalite, sade sahne. Önizlemede aynı kareyle diğer araçlarla karşılaştırma düğmeleri.
Kalıcı ayarlar (3 Kasım): her üretimde şık, belirgin ama doğal makyaj; yaka şekli ve dantel/payet yoğunluğu birebir (modele özel detay: model_detay_kaydet). Kalite kontrol: sadece renk, boy, kesimde BÜYÜK fark yeniden üretir; küçük farklar Patron'a not. PATRON SON SÖZ: kontrolden geçmeyen işi "✅ Yine de onayla" ile onaylayabilir (kaldığı yerden devam eder). Ekip: sen baş üreticisin, ChatGPT yardımcı ikinci göz; her kontrolün 1-10 puanı var; Patron'un kararlarından öğrenilir. Hemra onayı hazır ama kapalı (/hemraonay).
Boy ve kadraj: her modelin boyu (mini/diz/midi/bilek/bilek altı/maksi; bilek altı = bileği hafif örter, ayakkabı görünür, yere değmez) bir kez kaydedilir, bütün renklerde ve iki seride geçerli; ilk üretimden önce sorulur (boy_kaydet ile de kaydedilir). Boy referansı: Patron fotoğrafı/videoyu yazısında "3627 boy" ile atar (ön/arka ürün fotoğrafından ayrı). Katalog fotoğrafı tam boy (baş ve ayakkabı kesilmez), ayakkabı sade; kontrol boyu da denetler.
NORA (senarist, 4 Kasım): her videodan önce Nora kısa senaryo yazar, Patron onaylar (✏️ Düzelt ile değiştirir). HAREKET KURALI: hızlı dönüş YOK, kamera etrafında dönüş YOK; sadece yavaş doğal hareket (kameraya birkaç adım, hafif duruş, omuz üstünden bakış, kumaş doğal dalgalanır).
Örnek video: Patron dosya atar (ya da "sitedeki 3627 videosu gibi" yazar) → tarif çıkarılır → şablon.
SON KARTLAR: Patron'a giden kartların GERÇEK metni (tutar dahil) durum bilgisinde "SON KARTLAR" altında var. Patron bir kartı ya da tutarı sorarsa oradan oku ve aynen söyle; "kartı göremiyorum / içeriğini bilmiyorum" DEME. Orada yoksa bunu dürüstçe söyle.
DÜRÜSTLÜK (kesin): Bir aracı çağırmadan ve araç sonucunu görmeden "gönderdim / kaydettim / başladım / hazırladım" ASLA deme. Araç sonucu "GÖNDERİLMEDİ" diyorsa bunu Patron'a aynen söyle. Yapamadığın işi yapmış gibi gösterme; araç yoksa "bunun için aracım yok, Claude Code'a iletilmeli" de.`;

// Sohbet araçları (3 Kasım): sadece maliyet KARTI gönderir; para harcamaz (Patron kartta onaylar)
const SOHBET_ARACLARI = [
  { name: "kurulum_karti", description: "Patron'a TAMAMEN YENİ kurulum (3 yeni manken yüzü + 3 ortam önerisi) maliyet kartını gönderir. Sadece Patron açıkça yeni yüz isterse. Para harcamaz.", strict: true, input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { name: "uretim_karti", description: "Patron'a model kodlarıyla üretim (ya da test=true ise 5 modellik maliyet testi) maliyet kartını gönderir. Seri (yüz) sitedeki bedenden bulunur; Patron bir kodun büyük seri olduğunu söylerse buyuk_seri'ye yaz. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kodlar", "test", "buyuk_seri", "renkler", "sablon", "premium", "son_senaryo"], properties: { kodlar: { type: "array", items: { type: "string" } }, test: { type: "boolean" }, buyuk_seri: { type: "array", items: { type: "string" } },
      renkler: { type: "array", description: "Patron bir renk dediyse (\"3627 kırmızı\"): sadece o renk üretilir", items: { type: "object", additionalProperties: false, required: ["kod", "renk"], properties: { kod: { type: "string" }, renk: { type: "string" } } } },
      sablon: { type: "string", description: "Kayıtlı şablon adı (\"3627 şablonu\" → \"3627\"); yoksa boş" },
      premium: { type: "boolean", description: "Patron premium/vitrin dediyse true (lüks mekân)" },
      son_senaryo: { type: "boolean", description: "Patron 'Nora'nın son senaryosuyla' dediyse true (modelin son onaylı senaryosu aynen kullanılır)" } } } },
  { name: "boy_kaydet", description: "Bir modelin boyunu kalıcı kaydeder (bütün renklerde, iki seride geçerli): mini, diz, midi, bilek, bilekalti (bilek altı: bileği hafif örter, ayakkabı görünür, yere değmez), yerustu (yerden 2-3 cm yukarıda, bilekleri örter, sadece ayakkabı uçları görünür), maksi (yere değmez). Elbise yere ASLA değmez. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod", "boy"], properties: { kod: { type: "string" }, boy: { type: "string", enum: ["mini", "diz", "midi", "bilek", "bilekalti", "yerustu", "maksi"] } } } },
  { name: "model_karti_kaydet", description: "Model kartına KALICI bilgi yazar (her üretimde kullanılır): seri (kucuk/buyuk; boş = değişmez), renk (ör. \"koyu bordo\"; boş = değişmez), astar/şeffaflık notu (ör. üst gövde ve kollar şeffaf şifon, sadece göğüste ince içlik astar; boş = değişmez). Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod", "seri", "renk", "astar_tr", "astar_en"], properties: { kod: { type: "string" }, seri: { type: "string", enum: ["", "kucuk", "buyuk"] }, renk: { type: "string" }, astar_tr: { type: "string" }, astar_en: { type: "string", description: "aynı astar notu, görsel araç için kısa İngilizce" } } } },
  { name: "model_karti", description: "Bir modelin kartını (seri, renk, boy, astar notu, detay, etiketli fotoğraflar, son şablon, son senaryo) Patron'a gösterir. Para harcamaz.", strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
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
  const anahtar = `Anahtarlar: BOT ✅ · FAL ${env.FAL_KEY ? "✅" : "❌"} · ANTHROPIC ${env.ANTHROPIC_API_KEY ? "✅" : "❌"} · OPENAI ${env.OPENAI_API_KEY ? "✅" : "❌ (ikinci göz kapalı)"} · HIGGSFIELD ${hfVar(env) ? "✅ (fal yedek)" : "❌"}.`;
  const kur = secim ? `Video aracı: varsayılan yok (her kartta Patron seçer). Kayıtlı yüzler: ${Object.keys(SERILER).map((sr) => `${SERILER[sr].ad} = ${secim.yuzler ? yuzAdi(secim.yuzler[sr]) : sr === "kucuk" ? yuzAdi(secim.yuz) : "yok"}`).join("; ")}. Ortamlar: ${(secim.ortamlar || []).map((x) => `${x.id}) ${x.ad}${x.rol ? ` → ${ORTAM_ROLLERI[x.rol]}` : ""}`).join(", ") || "yok"}.` : "Kurulum: yapılmadı (yüz yok).";
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
  const sonKartlar = await oku(env, "pelin:sonKartlar", []);
  const kartBolumu = sonKartlar.length ? `\nSON KARTLAR (Telegram'a giden gerçek metin, en yenisi başta):\n${sonKartlar.slice(0, 4).map((k, i) => `--- Kart ${i + 1} (${tarihSaatYaz(k.zaman)}) ---\n${k.metin}`).join("\n")}` : "\nSON KARTLAR: kayıt yok.";
  const sistem = [{ type: "text", text: `${await kitapOku(env, "pelin", simdi)}\n\n${TALIMAT}`, cache_control: { type: "ephemeral" } }, { type: "text", text: `Şu anki durum: ${await durumMetni(env, simdi)}\nKonuşan: ${m.from.first_name || ""} (${yonetici(env, m.from.id) ? "yönetici" : "ekip"}).${kartBolumu}` }];
  let cevapMetni = "";
  for (let tur = 0; tur < 4; tur++) {
    const r = await claudeTur(client, { model, max_tokens: 2000, system: sistem, tools: SOHBET_ARACLARI, output_config: { effort: "low" }, messages: mesajlar });
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
    // 6 Kasım (sağlamlaştırma haftası): yeni üretim SADECE Patron açıkça isterse
    if ((await env.KAYIT.get("venom:pelinUretimAcik").catch(() => null)) !== "1" && !/[üu]ret|video|[çc]ek|giydir|maliyet|test/i.test(String((m && (m.text || m.caption)) || ""))) return "KART GÖNDERİLMEDİ: bu hafta (sağlamlaştırma) yeni üretim sadece Patron açıkça isterse başlar. Önerme; sadece sorulana cevap ver.";
    const buyuk = (g.buyuk_seri || []).map(String);
    const renk = Object.fromEntries((g.renkler || []).map((x) => [String(x.kod), String(x.renk).toLocaleLowerCase("tr")]));
    const bilinmeyen = Object.values(renk).filter((x) => !renkGecerli(x));
    if (bilinmeyen.length) return `KART GÖNDERİLMEDİ: renk tanınmadı (${bilinmeyen.join(", ")}). Patron'a hangi renk olduğunu sor.`;
    const sozler = (g.kodlar || []).map((k) => `${buyuk.includes(String(k)) ? "büyük:" : ""}${k}${renk[String(k)] ? ` ${renk[String(k)]}` : ""}`);
    if (g.premium) sozler.push("premium");
    if (g.sablon) sozler.push(`şablon:${String(g.sablon).toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]/g, "")}`);
    return kartSonucu(await uretKomutu(env, { ...m, text: `/${g.test ? "maliyettesti" : "uret"} ${sozler.join(" ")}`, sonSenaryo: Boolean(g.son_senaryo) }, simdi, Boolean(g.test)));
  }
  if (ad === "boy_kaydet") {
    if (!/^\d{3,6}$/.test(String(g.kod)) || !BOYLAR[g.boy]) return "KAYDEDİLMEDİ: kod ya da boy geçersiz.";
    await boyYaz(env, String(g.kod), { boy: g.boy, kaynak: `Patron (sohbet) ${tarihSaatYaz(simdi)}`, zaman: simdi });
    return `KAYDEDİLDİ: ${g.kod} boyu ${BOYLAR[g.boy].ad}.`;
  }
  if (ad === "model_karti_kaydet") {
    if (!/^\d{3,6}$/.test(String(g.kod))) return "KAYDEDİLMEDİ: kod geçersiz.";
    const renk = String(g.renk || "").toLocaleLowerCase("tr").trim();
    if (renk && !renkGecerli(renk)) return `KAYDEDİLMEDİ: renk tanınmadı (${renk}). Patron'a sor.`;
    const k = { ...(g.seri ? { seri: g.seri } : {}), ...(renk ? { renk } : {}), ...(g.astar_tr ? { astarTr: String(g.astar_tr).slice(0, 300), astarEn: String(g.astar_en || "").slice(0, 400) } : {}) };
    if (!Object.keys(k).length) return "KAYDEDİLMEDİ: değişecek bilgi yok.";
    await boyYaz(env, String(g.kod), { ...k, kartZaman: simdi });
    return `KAYDEDİLDİ: ${g.kod} kartı — ${[k.seri && `seri ${SERILER[k.seri].ad}`, k.renk && `renk ${k.renk}`, k.astarTr && `astar: ${k.astarTr}`].filter(Boolean).join(" · ")}.`;
  }
  if (ad === "model_karti") { const r = await modelKarti(env, m.chat.id, String(g.kod)); return r.ok ? `GÖSTERİLDİ: ${String(r.metin || "").slice(0, 900)}` : `GÖSTERİLEMEDİ: ${r.metin || "kayıt yok"}`; }
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
    await defterKarar(env, "pelin", cq); // 9 Kasım: iş defteri
    const v = String(cq.data || "");
    if (/^pk:/.test(v)) return kurulumDugmesi(env, cq, simdi);
    if (/^pu:/.test(v)) return uretimDugmesi(env, cq, simdi);
    if (/^ps:/.test(v)) return sablonDugmesi(env, cq, simdi);
    if (/^pz:/.test(v)) return yuzDuzenDugmesi(env, cq, simdi);
    if (/^pb:/.test(v)) return boyDugmesi(env, cq, simdi);
    if (/^pa:/.test(v)) return anlamaDugmesi(env, cq, simdi);
    if (/^pm:/.test(v)) return markaDugmesi(env, cq, simdi);
    if (/^pt:/.test(v)) return eskiTeslimDugmesi(env, cq, simdi);
    if (/^pn:/.test(v)) return noraDugmesi(env, cq, simdi);
    if (/^pd:[ox]:/.test(v)) return paketOnayDugmesi(env, cq, simdi);
    if (/^pr:a:/.test(v)) return arsivDugmesi(env, cq, simdi);
    if (/^pc:[as]:/.test(v)) return kartDugmesi(env, cq, simdi);
    if (v === "pc:-") return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Bu kart geçersiz (yeni kart geldi)." });
    if (/^pg:[^-]/.test(v)) return grupSecimDugmesi(env, cq, simdi);
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
  if (await noraDuzeltMesaji(env, m, simdi)) return;
  if (await boyReferansAl(env, m)) return;
  if (await ornekVideo(env, m, simdi)) return;
  if (await urunFotoAl(env, m)) return;
  if (await yuzFotoAl(env, m)) return;
  if (await fotoUyarisi(env, m)) return;
  if (await sonFotoEtiketi(env, m)) return;
  const metin = komutNormal(String(m.text || "").trim());
  if (!metin) return;
  if (metin !== m.text) m.text = metin; // "3627 üret" → "/uret 3627" (komutlar m.text okur)
  const komut = metin.split(/[\s@]/)[0].toLowerCase();
  if (komut === "/kart") { const kod = (metin.match(/\b(\d{3,6})\b/) || [])[1]; return kod ? modelKarti(env, m.chat.id, kod) : yaz(env, m.chat.id, "Kullanım: /3627 kart"); }
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
  if (komut === "/rehber") return yaz(env, m.chat.id, FOTO_REHBERI);
  if (komut === "/oncelik") { if (!muratMi(env, id)) return yaz(env, m.chat.id, "Sadece Patron."); return yaz(env, m.chat.id, await oncelikMetni(env, simdi)); }
  if (komut === "/haftalik") { if (!muratMi(env, id)) return yaz(env, m.chat.id, "Sadece Patron."); return yaz(env, m.chat.id, await haftalikRapor(env, simdi)); }
  if (komut === "/sablonlar") { const s = await oku(env, "pelin:sablonlar", {}); return yaz(env, m.chat.id, Object.keys(s).length ? ["Kayıtlı şablonlar:", ...Object.values(s).map((x) => `• ${x.ad}: ${x.ozet}`), "Kullanım: /uret 3557 şablon:ad"].join("\n") : "Henüz şablon yok. Örnek videoyu \"bunun gibi yap, 3557\" yazısıyla atın."); }
  if (komut === "/arac") {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "Bu ayar sadece Patron'da.");
    const a = (metin.split(/\s+/)[1] || "").toLowerCase();
    const secim = await oku(env, "pelin:secim", null);
    if (!ARACLAR[a] || !secim) return yaz(env, m.chat.id, `Video aracı: ${secim ? ARACLAR[aracSec(secim)].ad : "(önce /kurulum)"}. Seçenekler: ${Object.entries(ARACLAR).map(([k, x]) => `${k} (${x.ad}, ${para(x.saniye)}/sn)`).join(" · ")}. Değiştirmek: /arac veo31`);
    secim.arac = a; secim.aracElle = true; await kaydet(env, "pelin:secim", secim);
    return yaz(env, m.chat.id, `🎬 Video aracı: ${ARACLAR[a].ad} (${para(ARACLAR[a].saniye * URETIM_SN)} / ${URETIM_SN} sn).`);
  }
  if (komut === "/beyin") {
    if (!muratMi(env, id)) return yaz(env, m.chat.id, "Bu ayar sadece Murat'ta.");
    const sec = (metin.split(/\s+/)[1] || "").toLowerCase();
    if (!BEYINLER[sec]) return yaz(env, m.chat.id, `Şu an: ${(await env.KAYIT.get("pelin:beyin")) || "sonnet"}. Değiştirmek için: /beyin opus ya da /beyin sonnet`);
    await env.KAYIT.put("pelin:beyin", sec);
    return yaz(env, m.chat.id, `🧠 Beyin: ${sec === "opus" ? "Opus (daha güçlü, ~2 kat pahalı)" : "Sonnet"}.`);
  }
  if (metin.startsWith("/")) return yaz(env, m.chat.id, "Komutlar: /durum · /yuzler · 3627 kart · 3627 fotolar · 3627 üret (ya da /uret 3627 kırmızı; büyük seri: büyük:3627) · /maliyettesti 5 kod · /sablonlar · /beyin · /kurulum (yeni yüzler) · /rehber (fotoğraf rehberi) · /oncelik (önce hangi modeller) · /haftalik (video satış etkisi + maliyet). Fotoğraf etiketleri: \"3627 manken\" (ön/arka), \"3627 detay\", \"3627 etiket\" (kumaş etiketi). Örnek video: dosyayı \"bunun gibi yap, 3557\" yazısıyla atın. Gerisi için normal yazın.");
  return sohbet(env, { ...m, text: metin }, simdi);
}

// 4 Kasım (Patron): "3627 üret", "/3627 uret", "üret 3627", "/uret3627", "3627 kart", "/3627 fotolar" gibi yazımlar
export function komutNormal(t) {
  const x = String(t || "").trim();
  let k;
  if ((k = x.match(/^\/?(\d{3,6})\s*[üu]ret\b(.*)$/i))) return `/uret ${k[1]}${k[2]}`.trim();
  if ((k = x.match(/^\/?[üu]ret\s*(\d{3,6})\b(.*)$/i))) return `/uret ${k[1]}${k[2]}`.trim();
  if ((k = x.match(/^\/?(\d{3,6})\s*kart[ıi]?$/i)) || (k = x.match(/^\/kart\s*(\d{3,6})$/i))) return `/kart ${k[1]}`;
  if ((k = x.match(/^\/?(\d{3,6})\s*foto(?:lar|ğraflar|graflar)?$/i))) return `/fotolar ${k[1]}`;
  if ((k = x.match(/^\/(\d{3,6})$/))) return `/kart ${k[1]}`;
  return x;
}
// Yazısız gönderilen son fotoğraf ("yüz mü?" sorusu gelen) + hemen ardından "3627 ön / manken / askı / detay" yazısı → ürün fotoğrafı
async function sonFotoEtiketi(env, m) {
  if (!m.text || !muratMi(env, m.from.id)) return false;
  const t = String(m.text).trim().replace(/^\//, "");
  if (!/^\d{3,6}\s+\S/.test(t) || /[üu]ret|kart|foto/i.test(t)) return false;
  const y = fotoYazisi(t);
  if (!y.kod || !(y.rol || y.etiket || y.renk)) return false;
  const son = await oku(env, "pelin:sonYazisizFoto", null);
  if (!son || Math.floor(Date.now() / 1000) - (son.kayit || son.zaman) > 900) return false;
  await env.KAYIT.delete("pelin:sonYazisizFoto");
  const l = await urunFotoKaydet(env, y.kod, { anahtar: await dosyaKaydet(env, son.fileId, son.tur, 120 * 86400), rol: y.rol, etiket: y.etiket, renk: y.renk, album: null, mid: son.mid || 0, zaman: son.zaman, dosya: Boolean(son.dosya) });
  if (son.yuzId) await env.KAYIT.delete(`pelin:yuzAday:${son.yuzId}`);
  await yaz(env, m.chat.id, `✅ Son fotoğraf ${y.kod} ürün fotoğrafı olarak kaydedildi: ${fotoEtiketi({ rol: y.rol, etiket: y.etiket }) || "etiketsiz"}${y.renk ? ` · ${y.renk}` : ""} (yüz sorusunu yok sayın). Kayıtlı: ${fotoSirala(l).map(fotoEtiketi).join(", ")}. Kontrol: ${y.kod} fotolar`);
  return true;
}
// /3627 kart: model kartı tek ekranda (seri, renk, boy, astar, detay, etiketli fotoğraflar, son şablon, son senaryo)
export async function modelKarti(env, chat, kod) {
  const b = (await boyOku(env, kod)) || {};
  const fotolar = fotoSirala(await oku(env, `pelin:urunfoto:${kod}`, []));
  const site = await siteUrunu(env, kod).catch(() => null);
  const secim = await oku(env, "pelin:secim", null);
  const seri = SERILER[b.seri] ? b.seri : seriBul((site || {}).bedenler);
  const sn = await sonSenaryo(env, kod);
  if (fotolar.length) {
    const media = fotolar.slice(0, 10).map((x, i) => ({ type: "photo", media: dosyaAdresi(env, x.anahtar), caption: `${kod} · ${i + 1}. ${fotoEtiketi(x) || "etiketsiz"}${x.renk ? ` · ${x.renk}` : ""}` }));
    if (media.length > 1) await tg(env, "sendMediaGroup", { chat_id: chat, media }); else await tg(env, "sendPhoto", { chat_id: chat, photo: media[0].media, caption: media[0].caption });
  }
  const metin = [
    `🏷 MARKA: ${MARKALAR[b.marka] ? `${MARKALAR[b.marka].ad} (${b.markaKaynak || "kayıtlı"})` : "kayıtlı değil — ilk üretimde Sami'nin deposundan bakılır"}`,
    `🗂 MODEL KARTI — ${kod}${site && site.baslik ? ` (${site.baslik})` : ""}`,
    `${mankenSatiri(seri, (site || {}).bedenler)}${b.seri ? "" : " (bedenlerden)"} · ${yuzAdi(seriYuzu(secim, seri))}`,
    `Renk: ${b.renk || "kayıtlı değil (bütün renkler)"}`,
    `Boy: ${boyYazi(b)}`,
    ...(b.anlama && Object.keys(b.anlama).length ? Object.entries(b.anlama).map(([r, an]) => `Model kuralı (${r === "genel" ? "bütün renkler" : r}): ${(modelKurallari(an, r === "genel" ? null : r) || {}).tr || "—"}`) : [`Astar: ${b.astarTr || "not yok"} (anlama kartı henüz onaylanmadı)`]),
    `Detay: ${b.detayTr || "not yok"}`,
    `Fotoğraflar: ${fotolar.length ? fotolar.map((x, i) => `${i + 1}. ${fotoEtiketi(x) || "etiketsiz"}${x.renk ? ` (${x.renk})` : ""}`).join(", ") : "gönderilmemiş (üretimde site fotoğrafları)"}`,
    `Son şablon: ${b.sonSablon && SABLON_SECENEK[b.sonSablon] ? SABLON_SECENEK[b.sonSablon].ad : "yok"}${b.enIyiArac && ARACLAR[b.enIyiArac] ? ` · en gerçekçi bulunan: ${ARACLAR[b.enIyiArac].ad}` : ""}`,
    `Son senaryo: ${sn ? sn.tr : "yok"}`,
    "Video aracı: her üretimde kartta sorulur (varsayılan yok).",
    `Üretim: ${kod} üret`,
  ].join("\n");
  const r = await yaz(env, chat, metin);
  return { ...r, metin };
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
// TEK KAPI (5 Kasım): Patron Venom'da Pelin/Nora düğmesine bastı → aynı yol (pelin-giris.js "VenomKapisi")
export async function venomMesaj(env, metin) {
  const u = JSON.stringify(sahteMesaj(env, metin));
  if (env.PELIN) await nesne(env).fetch("https://pelin/guncelleme", { method: "POST", body: u }); else await guncelleme(JSON.parse(u), env);
  return true;
}
export async function venomDugme(env, data, rid) {
  const u = JSON.stringify(sahteDugme(env, data, rid));
  if (env.PELIN) await nesne(env).fetch("https://pelin/guncelleme", { method: "POST", body: u }); else await guncelleme(JSON.parse(u), env);
  return true;
}

// 5 Kasım (Patron, B5–B6): Patron'un VENOM'a gönderdiği ürün fotoğrafları → Pelin ürün fotoğrafı ("<kod> <renk> ön/arka").
// Dosyalar Venom'da KV "pelinmedya:<id>" olarak yazılır (30 gün; Pelin /medya/<id> sunar). sadeceBunlar: o rengin eski kayıtları
// (ör. site fotoğrafları) silinir → üretimde SADECE bunlar. yenidenBaslat: o kod/renk için bekleyen kartlar iptal + "/uret kod renk".
// 9 Kasım (Patron): Venom "Pelin bu hafta ne yaptı, ne harcadı, bekleyen, bakiye, Nora senaryosu" → Pelin'in KENDİ kayıtlarından
const DURUM_AD = { iptal: "iptal", vazgecildi: "vazgeçildi", uyari: "sorunlu — kararınızı bekliyor", foto_onay: "ön fotoğraf onayı bekliyor", senaryo_onay: "Nora senaryosu onay bekliyor", onay: "onay bekliyor", kart: "kart bekliyor", onaylandi: "onaylandı", gonderildi: "teslim edildi", hazir: "hazır", kaydedildi: "kaydedildi", hata: "hata", deneme_begenildi: "deneme beğenildi", paket_onay: "paket onayı bekliyor" };
const durumAd = (d) => DURUM_AD[d] || (CALISAN.includes(d) ? "üretimde" : d);
export async function venomRapor(env, g) {
  if (env.PELIN) { const r = await nesne(env).fetch("https://pelin/venom/rapor", { method: "POST", body: JSON.stringify(g || {}) }); return r.json().catch(() => null); }
  return pelinRapor(env, g || {}, Math.floor(Date.now() / 1000));
}
export async function pelinRapor(env, { basla = 0, bitis = 9e9 } = {}, simdi) {
  const liste = await oku(env, "pelin:isler", []);
  const isler = [], bekleyen = [];
  let son = null;
  for (const id of [...liste].reverse().slice(0, 150)) {
    const x = await oku(env, `pelin:is:${id}`, null);
    if (!x) continue;
    if (!son || x.zaman > son.zaman) son = { kod: x.kod, renk: x.renk || null, zaman: x.zaman, durum: durumAd(x.durum) };
    if (x.zaman >= basla && x.zaman <= bitis) isler.push({ kod: x.kod, renk: x.renk || null, durum: durumAd(x.durum), maliyet: Number(x.maliyet) || 0, zaman: x.zaman, arac: ARACLAR[x.arac] ? ARACLAR[x.arac].ad : null });
    if ((BEKLEYEN.includes(x.durum) || CALISAN.includes(x.durum)) && simdi - (x.zaman || 0) < 14 * 86400) bekleyen.push(`${x.kod}${x.renk ? ` ${x.renk}` : ""}: ${durumAd(x.durum)}${(x.sorunlar || []).length ? ` (${String(x.sorunlar[0]).slice(0, 80)})` : ""}`);
  }
  const a = ay(simdi), n = async (k) => Number((await env.KAYIT.get(k).catch(() => null)) || 0);
  const harcama = { fal: await n(`uretim-harcama:${a}`), hf: await n(`pelin-hf:${a}`), openai: await n(`pelin-openai:${a}`), claude: await n(`pelin-claude:${a}`) };
  harcama.toplam = yuvarla(harcama.fal + harcama.hf + harcama.openai + harcama.claude);
  harcama.donem = yuvarla(isler.reduce((t, x) => t + x.maliyet, 0));
  // Bakiye: fal / Higgsfield API bakiye vermiyor → yüklenen tutar (KV venom:pelinBakiye, Patron söyler) − o tarihten beri harcanan (tahmin)
  const yk = (await env.KAYIT.get("venom:pelinBakiye", "json").catch(() => null)) || {};
  const tahmin = async (t, tur) => { const y = yk[t]; if (!y || y.tutar == null) return null; let h = 0; const aylar = []; for (let m = (y.aylar || [a])[0]; m <= a && aylar.length < 24; m = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 7)) aylar.push(m); for (const m of aylar) h += await n(tur === "hf" ? `pelin-hf:${m}` : `uretim-harcama:${m}`); return yuvarla(Number(y.tutar) - h + Number(y.oncekiHarcama || 0)); };
  const hf = await tahmin("hf", "hf"), fal = await tahmin("fal", "fal");
  const bakiye = { hf, fal, hfNot: hf == null ? "sorgulanamıyor (Higgsfield bakiye vermiyor; yüklediğiniz tutarı söylerseniz tahmin ederim)" : null, falNot: fal == null ? "sorgulanamıyor (fal anahtarının bakiye okuma yetkisi yok — 403; yüklediğiniz tutarı söylerseniz tahmin ederim)" : null, tahmini: true };
  const ng = await oku(env, "pelin:noraGecmis", []);
  const noraBekleyen = bekleyen.filter((x) => /Nora senaryosu/.test(x)).map((x) => x.split(":")[0]);
  const nora = { bekleyen: noraBekleyen, yazilan: ng.filter((x) => x.zaman >= basla && x.zaman <= bitis).map((x) => x.kod) };
  return { isler, son, bekleyen, harcama, bakiye, nora, noraIsler: ng.map((x) => ({ kod: x.kod, zaman: x.zaman, ozet: `${x.kod}: ${String(x.tr || "").slice(0, 60)}` })) };
}
export async function venomFotoKaydet(env, g) {
  if (env.PELIN) { const r = await nesne(env).fetch("https://pelin/venom/foto", { method: "POST", body: JSON.stringify(g || {}) }); return r.json().catch(() => ({ ok: false, mesaj: "Pelin cevap vermedi" })); }
  return fotoKaydetVenom(env, g || {}, Math.floor(Date.now() / 1000));
}
export async function fotoKaydetVenom(env, g, simdi) {
  const kod = String(g.kod || "").replace(/\D/g, "");
  if (!/^\d{3,6}$/.test(kod)) return { ok: false, mesaj: "geçerli model kodu yok" };
  const renk = g.renk ? String(g.renk).toLocaleLowerCase("tr").trim() : null;
  if (renk && !renkGecerli(renk)) return { ok: false, mesaj: `"${renk}" rengi tanınmadı` };
  const fotolar = (g.fotolar || []).filter((f) => /^https:\/\//.test(String(f && f.url))).slice(0, 8);
  if (!fotolar.length) return { ok: false, mesaj: "fotoğraf yok" };
  let l = (await oku(env, `pelin:urunfoto:${kod}`, [])).map((x) => (typeof x === "string" ? { anahtar: x, rol: null } : x));
  const once = l.length;
  if (g.sadeceBunlar) l = l.filter((x) => (renk ? x.renk !== renk : false));
  const silinen = once - l.length;
  const yeni = fotolar.map((f, i) => ({ anahtar: `u${crypto.randomUUID().replace(/-/g, "").slice(0, 31)}`, url: f.url, rol: ROL_AD[f.rol] ? f.rol : i === 0 ? "on" : i === 1 ? "arka" : "detay",
    etiket: g.etiket === "aski" ? "aski" : "manken", renk, album: null, mid: 0, zaman: simdi - i, kaynak: "venom" }));
  await kaydet(env, `pelin:urunfoto:${kod}`, [...yeni, ...l].slice(0, 12), 120 * 86400);
  const sonuc = { ok: true, kod, renk, kaydedilen: yeni.map((x) => `${kod}${renk ? ` ${renk}` : ""} ${ROL_AD[x.rol]}`), silinen, iptal: 0, baslatildi: false };
  if (g.yenidenBaslat) {
    const uyar = (x) => String(x.kod || "") === kod || (x.kodlar || []).map(String).includes(kod);
    const renkUyar = (r) => !renk || !r || r === renk;
    for (const on of ["pelin:anlama:", "pelin:uretimOnay:"]) {
      const ks = ((await Promise.resolve().then(() => env.KAYIT.list({ prefix: on })).catch(() => ({ keys: [] }))).keys || []).map((k) => k.name);
      for (const k of ks) { const x = await oku(env, k, null); if (x && uyar(x) && renkUyar(x.renk || (x.renkler || {})[kod])) { await env.KAYIT.delete(k); sonuc.iptal++; } }
    }
    for (const id of await oku(env, "pelin:isler", [])) {
      const x = await oku(env, `pelin:is:${id}`, null);
      if (x && String(x.kod) === kod && renkUyar(x.renk) && BEKLEYEN.includes(x.durum)) { x.durum = "iptal"; x.gecmis = [...(x.gecmis || []), [simdi, "iptal — Patron yeni ürün fotoğrafı gönderdi (Venom)"]]; await kaydet(env, `pelin:is:${id}`, x); sonuc.iptal++; }
    }
    await guncelleme(sahteMesaj(env, `/uret ${kod}${renk ? ` ${renk}` : ""}`), env);
    sonuc.baslatildi = true;
  }
  return sonuc;
}

export class PelinDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(istek) {
    const yol = new URL(istek.url).pathname;
    const env = { ...this.env, KAYIT: karmaDepo(this.env.KAYIT, this.state.storage, PELIN_YEREL) };
    try {
      if (yol === "/guncelleme") await guncelleme(await istek.json(), env);
      else if (yol === "/cron") await pelinCron(env, Math.floor(Date.now() / 1000));
      else if (yol === "/venom/foto") return Response.json(await fotoKaydetVenom(env, await istek.json(), Math.floor(Date.now() / 1000)));
      else if (yol === "/venom/rapor") return Response.json(await pelinRapor(env, await istek.json(), Math.floor(Date.now() / 1000))); // 9 Kasım
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
    if (istek.method === "GET" && /^\/medya\/[a-f0-9]{32}$/.test(url.pathname)) return medyaVer(env, url.pathname.split("/")[2], istek);
    // 4 Kasım: gizli test sayfaları (360° görüntüleyici) — KV "pelinsayfa:<ad>"; medyayla aynı adres (CORS derdi yok), arama motoruna kapalı
    if (istek.method === "GET" && /^\/sayfa\/[a-z0-9-]{3,40}$/.test(url.pathname)) { const h = await env.KAYIT.get(`pelinsayfa:${url.pathname.slice(7)}`); return h ? new Response(h, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } }) : new Response("Sayfa yok", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }); }
    return new Response("Pelin çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    try { await kitapOku(env, "pelin"); } catch { /* 13 Kasım (kural 37): bot her çalışmada kitabın güncel sürümünü okur (ofis "kitap sürümü") */ }
    try { await kitapOku(env, "nora"); } catch { /* 13 Kasım (kural 37): bot her çalışmada kitabın güncel sürümünü okur (ofis "kitap sürümü") */ }
    try { await patronDenemesi(env, "Pelin", tg); } catch { /* */ }
    if (await durdurulduMu(env, "pelin")) return; // 6 Kasım: durduruldu → üretim adımları bekler (açılınca kaldığı yerden)
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
const denemeSiniri = (is) => (is && is.denemeSiniri) || URETIM_DENEME;
const OPENAI_TAHMIN = 0.01; // görsel karşılaştırma başına (yaklaşık)
const KONTROL_TAHMIN = 0.03; // Claude görsel karşılaştırma başına (yaklaşık; gerçek harcama kullanımdan yazılır)
const ORTAM_ONERI = "retro 80'ler; siyah-altın (VOLONTE marka renkleri); \"Live your life\" (özgür, şehirde yaşayan kadın); mutluluk/neşe";
const SITE = "https://www.wearvolonte.com";
const SELIN_VIDEO = "https://volonte-selin.volonte.workers.dev"; // site videoları (selin/<kod>/<n> → /v2/<kod>/<n>)
// fal hataları → kısa Türkçe (ham İngilizce Patron'a gitmez; ham hali işte "hamHata" alanında, Claude Code okur)
export function falHataTr(h) {
  const m = String(h || "");
  if (/higgsfield/i.test(m) && /api_key_expired|expired/i.test(m)) return "Higgsfield anahtarının süresi doldu";
  if (/higgsfield/i.test(m) && /api_key_disabled/i.test(m)) return "Higgsfield anahtarı kapatılmış";
  if (/higgsfield \S+ 401/i.test(m)) return "Higgsfield anahtarı geçersiz";
  if (/higgsfield \S+ 403/i.test(m)) return "Higgsfield bakiyesi yetersiz";
  if (/higgsfield \S+ (404|423|503)/i.test(m)) return "Higgsfield bu modeli şu an vermiyor";
  if (/did not generate the expected output/i.test(m)) return "araç bu istemi işleyemedi (istem uzun ya da içerik filtresine takıldı)";
  if (/content|policy|safety|moderation|nsfw|flagged/i.test(m)) return "içerik filtresine takıldı";
  if (/insufficient|balance|credit|billing|payment|quota/i.test(m)) return "fal.ai bakiyesi yetersiz";
  if (/timed? ?out|timeout|zaman aşımı|saatte bitmedi/i.test(m)) return "zaman aşımı";
  if (/rate.?limit|429|overloaded|unavailable|50[0-9]/i.test(m)) return "araç şu an yoğun";
  if (/download|fetch|image_url|video_url|url/i.test(m) && /fail|could not|unable|invalid/i.test(m)) return "araç görseli indiremedi";
  if (/422|unprocessable|validation|invalid/i.test(m)) return "araç girdiyi kabul etmedi";
  if (/^(BÜTÇE|GÜNLÜK SINIR):/.test(m)) return m;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(m) && m.length < 160) return m; // zaten Türkçe kısa mesaj
  return "araç hatası (ayrıntı Claude Code'da)";
}
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const dosyaAdresi = (env, anahtar) => `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/dosya/${anahtar}`;
async function dosyaKaydet(env, fileId, tur, ttl) {
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await kaydet(env, `pelindosya:${anahtar}`, { file_id: fileId, tur }, ttl);
  return anahtar;
}
export function uretimMaliyeti(arac = VARSAYILAN_ARAC, secim = null) {
  if (!ARACLAR[arac]) arac = aracSec(secim);
  const kat = rolOrtami(secim, "katalog"), vid = rolOrtami(secim, "video");
  const ayriKare = Boolean(kat && vid && kat.id !== vid.id);
  const kalemler = [
    { ad: `Katalog fotoğrafı (sabit yüz + ürün${kat ? `, ${kat.ad}` : ""})`, birim: GORSEL.fiyat },
    ...(ayriKare ? [{ ad: `Video başlangıç karesi (${vid.ad}) + kontrol`, birim: yuvarla(GORSEL.fiyat + KONTROL_TAHMIN + OPENAI_TAHMIN) }] : []),
    { ad: `Video ${URETIM_SN} sn — ${ARACLAR[arac].ad}: ${URETIM_SN} × ${para(ARACLAR[arac].saniye)} (fal fiyat listesi)`, birim: yuvarla(ARACLAR[arac].saniye * URETIM_SN) },
    { ad: "Kalite kontrol (Claude + OpenAI, foto + 3 video karesi)", birim: yuvarla(2 * (KONTROL_TAHMIN + OPENAI_TAHMIN) + 3 * KARE.saniye * URETIM_SN) },
  ];
  return { kalemler, toplam: yuvarla(kalemler.reduce((s, k) => s + k.birim, 0)) };
}

// 4 Kasım: Claude görseli adresinden indiremezse ("timed out while trying to download the file") 3 kez dener, sonra görselleri
// Pelin kendisi indirip küçültür ve doğrudan gönderir (indirilemeyen görsel atlanır).
async function claudeJson(env, content, schema, simdi, maxTokens = 1200, sistem = null) {
  const model = BEYINLER[(await env.KAYIT.get("pelin:beyin")) || "sonnet"] || BEYINLER.sonnet;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
  const iste = (c) => client.messages.create({ model, max_tokens: maxTokens, ...(sistem ? { system: sistem } : {}), output_config: { effort: "low", format: { type: "json_schema", schema } }, messages: [{ role: "user", content: c }] });
  let r, son;
  for (let i = 0; i < 3 && !r; i++) { try { r = await iste(content); } catch (e) { son = e; if (!gecici(e)) throw e; if (i < 2) await new Promise((x) => setTimeout(x, 1500 * (i + 1))); } }
  if (!r) {
    const yeni = [];
    for (const b of content) {
      if (b.type === "image" && b.source && b.source.type === "url") { try { yeni.push(await gorselBase64(env, b.source.url)); } catch { /* atla */ } } else yeni.push(b);
    }
    if (!yeni.some((b) => b.type === "image") && content.some((b) => b.type === "image")) throw son;
    r = await iste(yeni);
  }
  await claudeHarcama(env, model, r.usage || {}, simdi);
  return JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}
const resimUrl = (url) => ({ type: "image", source: { type: "url", url } });

// ---------- Kalite kontrol: renk / desen / kesim (Claude + ikinci göz OpenAI) ----------
// 3 Kasım (Patron): üretimi SADECE renk, boy ve kesimde BÜYÜK fark durdurur; küçük farklar (payet yoğunluğu, hafif ton, yaka
// hafif sade…) Patron'a not olarak yazılır. Her kontrolün 1-10 puanı var. Patron'un "yine de onayla" kararları öğrenilir.
const KONTROL2_SORU = "İlk görsel(ler) ÜRÜNÜN gerçek fotoğrafı, son görsel(ler) yapay zekâ ile üretilmiş manken görseli. Farkları İKİYE ayır. BÜYÜK fark (üretim yeniden yapılır): renk açıkça başka (ör. koyu bordo yerine parlak kırmızı, siyah yerine kahve), kesim/model açıkça başka (başka yaka tipi, kol yok/var, etek tipi tamamen farklı, tamamen başka desen/baskı, kıyafet üründen belirgin DAR/vücuda yapışık yapılmış), boy açıkça başka. KÜÇÜK fark (sadece not): payet/dantel yoğunluğu biraz farklı, hafif ton farkı, yaka ya da detay biraz sade, ışığa bağlı küçük farklar. Emin değilsen KÜÇÜK say. Sadece GÖRÜNEN kısmı değerlendir (görünmeyen arka için fark yazma). Ürün fotoğraflarının üzerindeki yazı/logo önemsiz; ÜRETİLEN görselde yazı/logo/filigran varsa büyük sorun yaz. puan: 1-10 genel uygunluk.";
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
const kontrolSorusu = (ek = {}) => `${KONTROL2_SORU}${ek.boy && BOYLAR[ek.boy.boy] ? ` İSTENEN BOY: ${BOYLAR[ek.boy.boy].ad} (${BOYLAR[ek.boy.boy].en}); açıkça başkaysa boy_buyuk_fark=true ve büyük sorunlara "boy farklı: …". kadraj_tam: baş ve ayakkabılar kadrajda, kesilmemiş mi?` : " boy_buyuk_fark=false, kadraj_tam=true yaz (bu karede boy/kadraj denetlenmiyor)."}${ek.yuz ? " makyaj_var: yüzde belirgin makyaj (göz makyajı, kirpik, kaş, allık, ruj) var mı? Makyajsız yüz büyük sorundur." : " makyaj_var=true yaz (bu karede denetlenmiyor)."}${ek.renk ? ` İSTENEN RENK: ${ek.renk} — kıyafet bu renk değilse renk_buyuk_fark=true.` : ""}${ek.kural ? ` MODEL KURALLARI (bu modele özel, kesin): ${ek.kural}. Bunlardan biri tutmuyorsa (ör. etek şeffaf/bacaklar görünüyor, yanlış içlik rengi, üst opak yapılmış) kesim_buyuk_fark=true ve büyük sorunlara "model kuralı: …" yaz.` : ""}${ek.yon ? " YÖN: model kameraya doğru İLERİ mi yürüyor? Geri gidiyor, kameradan uzaklaşıyor ya da sırtı dönükse kesim_buyuk_fark=true ve büyük sorunlara \"yön: geri/uzaklaşıyor\" yaz." : ""}${ek.astar ? ` ASTAR/ŞEFFAFLIK (bu modele özel): ${ek.astar}. Şeffaf olması gereken yerler (ör. üst gövde, kollar) opak/astarlı yapılmışsa bu KESİM farkıdır: kesim_buyuk_fark=true, büyük sorunlara "astar: …" yaz.` : ""}${ek.ogrenme && ek.ogrenme.length ? ` Patron'un önceki kararları (öğren): şu farklara rağmen Patron onayladı → benzerlerini KÜÇÜK say: ${ek.ogrenme.join(" | ")}.` : ""}${ek.sonYazi ? ` Son karede küçük marka yazısı (VOLONTE ya da BLACK ROSE) ve "${ek.sonYazi}" yazısı İSTENEN bir şeydir, sorun sayma; bunun dışında yazı, fiyat, logo varsa sorun yaz.` : ""}`;
const YAZI_SEMA = { type: "object", additionalProperties: false, required: ["volonte_var", "kod_okunan", "baska_yazi_var", "fiyat_var"], properties: { volonte_var: { type: "boolean" }, kod_okunan: { type: "string" }, baska_yazi_var: { type: "boolean" }, fiyat_var: { type: "boolean" } } };
async function sonKareYazisi(env, kare, kod, simdi, marka = "VOLONTE") {
  const ad = (MARKALAR[marka] || MARKALAR.VOLONTE).ad, diger = marka === "BLACKROSE" ? "VOLONTE" : "BLACK ROSE";
  const y = await claudeJson(env, [resimUrl(kare), { type: "text", text: `Bu bir moda videosunun SON karesi. Görseldeki yazıları oku. volonte_var: "${ad}" yazısı doğru yazılmış ve okunuyor mu? ("${diger}" yazıyorsa false.) kod_okunan: markanın altındaki/yanındaki model kodunu harf harf yaz (yoksa boş). baska_yazi_var: bunlar dışında yazı/logo/filigran var mı? fiyat_var: fiyat, para birimi, rakamlı fiyat var mı?` }], YAZI_SEMA, simdi, 300);
  const sorun = [!y.volonte_var && `son karede ${ad} yazısı yok/yanlış`, String(y.kod_okunan).replace(/\s/g, "") !== String(kod) && `son karedeki kod yanlış (okunan: "${y.kod_okunan}", olması gereken: ${kod})`, y.baska_yazi_var && "son karede başka yazı/logo var", y.fiyat_var && "son karede FİYAT var"].filter(Boolean);
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
  // 3 Kasım: ChatGPT boyda tutarsız ("daha kısa" ↔ Pelin "bilek, doğru") → sadece boy yüzünden geçmediyse ve Pelin boyu doğru bulduysa not olur
  if (o && !o.gec && c.gec && openaiHam.boy_buyuk_fark && !openaiHam.renk_buyuk_fark && !openaiHam.kesim_buyuk_fark && openaiHam.kadraj_tam !== false && openaiHam.makyaj_var !== false) {
    o.gec = true; o.kucuk = [...o.kucuk, ...o.buyuk.map((x) => `${x} (Pelin boyu doğru buldu)`)]; o.buyuk = [];
  }
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
  if (hatali.length) await yaz(env, murat(env), `⚠️ ${hatali.length} yüz üretilemedi (ücret alınmaz): ${[...new Set(hatali.map((x) => falHataTr(x.hata)))].join(" · ")}`);
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
    const l = (ayni.length ? ayni : elle).slice(0, 4);
    return { urller: l.map((x) => x.url || dosyaAdresi(env, x.anahtar)), roller: l.map((x) => x.rol), etiketler: l.map((x) => x.etiket || null), kaynak: "patron" };
  }
  const u = await siteUrunu(env, kod);
  const urller = u ? (u.fotolar || []).filter((f) => /^galeri\//.test(f)).slice(0, 3).map((f) => `${SITE}/${f}`) : [];
  return { urller, roller: [], etiketler: [], kaynak: "site" };
}
async function urunFotolari(env, kod) { return (await urunFotoSecimi(env, kod)).urller; }
// ---------- BOY ve KADRAJ (3 Kasım, Patron): her modelin boyu BİR KEZ kaydedilir (bütün renklerde, iki seride geçerli) ----------
// Kayıt KV "pelinboy:<kod>" (Pelin dışındaki botlar da okur — Venom): { boy, ayakkabiGorunur, yereDegmez, referans: [{ anahtar, tur }], kaynak, zaman }
export const BOYLAR = {
  mini: { ad: "mini", kisa: "mini length, hem at mid-thigh", en: "mini length: the hem ends at mid-thigh" },
  diz: { ad: "diz", kisa: "knee length, hem at the knees", en: "knee length: the hem ends right at the knees" },
  midi: { ad: "midi", kisa: "midi length, hem at mid-calf", en: "midi length: the hem ends at mid-calf" },
  bilek: { ad: "bilek", kisa: "ankle length: the hem ends at the ankles, shoes visible, hem off the floor", en: "ankle length: the hem ends exactly at the ankles; the shoes and feet are fully visible and the hem does NOT touch the floor (clear space between hem and floor)" },
  // 4 Kasım (Patron, 3627): bileği hafif örter, ayakkabı görünür, yere değmez
  bilekalti: { ad: "bilek altı", kisa: "just below the ankle: the hem lightly covers the ankle bones, the shoes stay visible, hem off the floor", en: "just below the ankle: the hem lightly covers the ankle bones (a little longer than ankle length), the shoes are still clearly visible below the hem, and the hem does NOT touch the floor (a small visible gap between hem and floor)" },
  // 4 Kasım (Patron): elbise yere ASLA değmez; etek ucu yerden 2-3 cm yukarıda, bilekleri örter, sadece ayakkabı uçları görünür
  yerustu: { ad: "yere 2-3 cm", kisa: "hem ends 2-3 cm above the floor, covering the ankles, only shoe tips visible, never touching the floor", en: "the hem ends 2-3 cm above the floor, covering the ankles, only the shoe tips visible; the dress NEVER touches the floor (a thin visible gap of floor under the hem)" },
  maksi: { ad: "maksi", kisa: "maxi length, hem just above the floor, never touching it", en: "maxi length: the hem ends just above the floor and NEVER touches or pools on the floor" },
};
// Yazıdan boy: "bilek altı" önce (yoksa "bilek" yakalanır)
export function boyMetinden(t) {
  const y = String(t || "").toLocaleLowerCase("tr");
  if (/bilek\s*alt/.test(y)) return "bilekalti";
  if (/yer(den|e)?\s*(2|3|üst|ust)|yer\s*üstü|yerustu/.test(y)) return "yerustu";
  return ["mini", "diz", "midi", "bilek", "maksi"].find((x) => new RegExp(`(^|[^a-zçğıöşü])${x}`).test(y)) || null;
}
export const boyOku = async (env, kod) => (await env.KAYIT.get(`pelinboy:${kod}`, "json")) || null;
const boyYaz = async (env, kod, kayit) => { await env.KAYIT.put(`pelinboy:${kod}`, JSON.stringify({ ...((await boyOku(env, kod)) || {}), ...kayit })); };
export const ayakkabiBoy = (boy) => boy === "bilek" || boy === "bilekalti" || boy === "yerustu";
export const boyYazi = (b) => (b && BOYLAR[b.boy] ? `${BOYLAR[b.boy].ad}${b.boy === "bilek" ? " (ayakkabı görünür, etek yere değmez)" : b.boy === "bilekalti" ? " (bileği hafif örter, ayakkabı görünür, yere değmez)" : b.boy === "yerustu" ? " (yerden 2-3 cm yukarıda, bilekleri örter, sadece ayakkabı uçları görünür, yere asla değmez)" : ""}${(b.referans || []).length ? " · referans var" : ""}` : "kayıtlı değil");
const boyIstemi = (b) => (b && BOYLAR[b.boy] ? ` LENGTH (most important after the garment itself): ${BOYLAR[b.boy].en}. Keep exactly this length on her body (also on a curvy plus-size figure).` : "");
const KADRAJ_ISTEMI = " FRAMING: full body from head to toe — never crop the head or the shoes; leave a little space above the head and below the feet. SHOES: simple, elegant shoes that suit the setting and do not draw attention away from the dress.";
// 3 Kasım (3627 tekrar uzun çıktı): boy kuralı istemin EN BAŞINDA + görsel aracın sistem talimatında (system_prompt) + yasaklar
// (Nano Banana'da negatif alan yok → "FORBIDDEN" listesi; Veo/Kling'de negative_prompt). Kadraj ayakları ve zemini gösterir.
const BOY_YASAK = { mini: "knee-length or longer skirt", diz: "midi or longer skirt, skirt covering the knees", midi: "floor-length or ankle-length skirt, skirt covering the ankles", bilek: "floor-length dress, maxi dress, long skirt touching or pooling on the floor, hem covering the shoes or feet, train", bilekalti: "floor-length dress, skirt touching or pooling on the floor, hem covering the shoes, train, hem above the ankle bones, visible bare ankles", yerustu: "hem touching or pooling on the floor, train, hem covering the shoe tips completely, visible bare ankles, hem above the ankles", maksi: "short skirt, skirt above the ankles, hem touching or pooling on the floor" };
const BOY_YASAK_VIDEO = { mini: "long skirt", diz: "long skirt", midi: "floor-length dress", bilek: "floor-length dress, skirt touching the floor, hem covering the shoes", bilekalti: "floor-length dress, skirt touching the floor, hem covering the shoes", yerustu: "skirt touching the floor, hem pooling on the floor, visible ankles", maksi: "short skirt, skirt touching the floor" };
export const boyYasagiVideo = (b) => (b && BOY_YASAK_VIDEO[b.boy]) || "";
export const boyYasagi = (b) => (b && BOY_YASAK[b.boy] ? `${BOY_YASAK[b.boy]}, cropped feet, cropped shoes, cropped head` : "");
export function boyBasi(b, refVar) {
  if (!b || !BOYLAR[b.boy]) return "";
  return `LENGTH RULE (HIGHEST PRIORITY, before anything else): ${BOYLAR[b.boy].en}.${b.boy === "bilek" ? " Both shoes and both ankles are completely visible, and there is a clear visible gap of floor between the hem and the ground." : b.boy === "bilekalti" ? " The hem just covers the ankle bones; both shoes are completely visible below it, and there is a small visible gap of floor between the hem and the ground." : b.boy === "yerustu" ? " The hem ends 2-3 cm above the floor and covers the ankles; only the shoe tips show below it; it NEVER touches the floor." : ""} FORBIDDEN: ${boyYasagi(b)}. FRAMING FOR THIS: a wide full-length shot with the camera at hip height; the whole body from the top of the head to the soles of the shoes is inside the frame, with a strip of floor visible below the feet.${refVar ? " The LAST image shows the correct length on a body — match that hem height relative to the ankles exactly (copy ONLY the length and framing, nothing else from that image)." : ""} `;
}
export const boySistem = (b) => (b && BOYLAR[b.boy] ? `You are a fashion catalog image editor. Hard rules that override everything else in the prompt: (1) the garment length is ${BOYLAR[b.boy].en}; never produce: ${boyYasagi(b)}. (2) full-length framing: head and shoes fully inside the frame. (3) the garment's color, print and cut stay identical to the product photos.` : "");
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
  const boy = boyMetinden(yazi) || b.boy || null;
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
  return claudeJson(env, [{ type: "text", text: `Model ${kod} — elbise/etek BOYU nedir? Ürün fotoğrafları${ref.length ? " ve boy referansı (son görseller)" : ""}:` }, ...[...urun, ...ref].map(resimUrl), { type: "text", text: "Seçenekler: mini (uyluk ortası), diz, midi (baldır ortası), bilek (etek bilekte biter, ayakkabı görünür), bilekalti (bileği hafif örter, ayakkabı yine görünür, yere değmez), yerustu (yerden 2-3 cm yukarıda, bilekleri örter, sadece ayakkabı uçları görünür), maksi (yere çok yakın ama değmez). Kıyafet giyilmiş hâlde vücutta nerede bitiyor? emin: kesin değilsen false. neden: kısa Türkçe." }], BOY_SEMA, simdi, 300);
}
const boyKlavye = (id, tahmin) => ({ inline_keyboard: [[...(tahmin ? [{ text: `✅ Evet, ${BOYLAR[tahmin].ad}`, callback_data: `pb:${tahmin}:${id}` }] : []), ...Object.keys(BOYLAR).filter((x) => x !== tahmin).map((x) => ({ text: BOYLAR[x].ad[0].toLocaleUpperCase("tr") + BOYLAR[x].ad.slice(1), callback_data: `pb:${x}:${id}` }))]] });
async function boySorusu(env, m, kod, simdi, test) {
  const t = await boyTahmini(env, kod, simdi).catch(() => null);
  const id = kisaId();
  await kaydet(env, `pelin:boySoru:${id}`, { kod, metin: m.text, test: Boolean(test), tahmin: t && t.boy }, 3 * 86400);
  return yaz(env, m.chat.id, t ? `📏 ${kod}: ${t.boy} boyu mu?${t.emin ? "" : " (emin değilim)"} ${t.neden}\nBir kez kaydedilir; bütün renklerde ve iki seride geçerli. Sonra maliyet kartı gelir.` : `📏 ${kod}: boyu nedir? Bir kez kaydedilir; sonra maliyet kartı gelir.`, { reply_markup: boyKlavye(id, t && t.boy) });
}
// Pelin fotoğraflara bakıp tahmin eder (Claude, kuruşlar); Patron sadece yanlışı düzeltip onaylar → kalıcı, bir daha sorulmaz
const ANLAMA_SEMA = { type: "object", additionalProperties: false, required: ["ust", "alt", "iclik", "boy", "neden"], properties: { ust: { type: "string", enum: ["seffaf", "opak"] }, alt: { type: "string", enum: ["opak", "seffaf"] }, iclik: { type: "string", enum: ["yok", "siyah", "beyaz", "ten", "elbise"] }, boy: { type: "string", enum: Object.keys(BOYLAR) }, neden: { type: "string" } } };
async function anlamaTahmini(env, kod, renk, simdi) {
  const urun = (await urunFotoSecimi(env, kod, renk)).urller;
  if (!urun.length || !env.ANTHROPIC_API_KEY) return null;
  return claudeJson(env, [{ type: "text", text: `Model ${kod}${renk ? `, renk ${renk}` : ""}. Ürün fotoğrafları:` }, ...urun.map(resimUrl), { type: "text", text: "Bu elbiseyi incele. ust: üst gövde ve kollar şeffaf (şifon/tül, ten görünür) mü yoksa astarlı/opak mı? alt: etek/alt kısım astarlı/opak mı (bacak görünmez) yoksa şeffaf mı? iclik: şeffaf üstün altında içlik/astar var mı, rengi ne (yok/siyah/beyaz/ten/elbise rengiyle aynı)? boy: mini (uyluk), diz, midi (baldır), bilek (bilekte biter), bilekalti (bileği hafif örter, ayakkabı görünür), maksi (yere kadar). neden: kısa Türkçe." }], ANLAMA_SEMA, simdi, 400);
}
const anlamaDugme = (id, alan, deger, secili, ad) => ({ text: `${secili === deger ? "☑️ " : ""}${ad}`, callback_data: `pa:${alan}:${id}:${deger}` });
function anlamaKlavye(q) {
  const s = q.secim;
  return { inline_keyboard: [
    Object.entries(ANLAMA_SECENEK.ust.d).map(([k, ad]) => anlamaDugme(q.id, "ust", k, s.ust, `Üst: ${ad}`)),
    Object.entries(ANLAMA_SECENEK.alt.d).map(([k, ad]) => anlamaDugme(q.id, "alt", k, s.alt, `Etek: ${ad}`)),
    Object.entries(ANLAMA_SECENEK.iclik.d).slice(0, 3).map(([k, ad]) => anlamaDugme(q.id, "iclik", k, s.iclik, `İçlik: ${ad}`)),
    Object.entries(ANLAMA_SECENEK.iclik.d).slice(3).map(([k, ad]) => anlamaDugme(q.id, "iclik", k, s.iclik, `İçlik: ${ad}`)),
    Object.keys(BOYLAR).slice(0, 3).map((k) => anlamaDugme(q.id, "boy", k, s.boy, BOYLAR[k].ad[0].toLocaleUpperCase("tr") + BOYLAR[k].ad.slice(1))),
    Object.keys(BOYLAR).slice(3).map((k) => anlamaDugme(q.id, "boy", k, s.boy, BOYLAR[k].ad[0].toLocaleUpperCase("tr") + BOYLAR[k].ad.slice(1))),
    [{ text: "✅ Onayla (kalıcı kaydet)", callback_data: `pa:o:${q.id}` }],
  ] };
}
function anlamaMetni(q) {
  const s = q.secim, eksik = ["ust", "alt", "iclik", "boy"].filter((k) => !s[k]);
  return [
    `🔎 YENİ MODEL ANLAMA — ${q.kod}${q.renk ? ` · ${q.renk}` : ""} (bir kez sorulur, kalıcı kaydedilir)`,
    q.neden ? `Pelin'in tahmini (☑️ işaretli): ${q.neden}` : "Pelin tahmin edemedi (fotoğraf yok); lütfen seçin.",
    `Üst: ${s.ust ? ANLAMA_SECENEK.ust.d[s.ust] : "?"} · Etek/alt: ${s.alt ? ANLAMA_SECENEK.alt.d[s.alt] : "?"} · İçlik: ${s.iclik ? ANLAMA_SECENEK.iclik.d[s.iclik] : "?"} · Boy: ${s.boy ? BOYLAR[s.boy].ad : "?"}`,
    q.renk ? `İçlik rengi SADECE ${q.renk} için kaydedilir; başka renkte yeniden sorulur.` : "",
    eksik.length ? "Eksikleri seçip ✅ Onayla. Onaylanmadan üretim başlamaz." : "Yanlış olanı düzeltin, sonra ✅ Onayla. Onaylanmadan üretim başlamaz.",
  ].filter(Boolean).join("\n");
}
async function anlamaKarti(env, m, kod, renk, simdi, test) {
  const b = (await boyOku(env, kod)) || {};
  const t = await anlamaTahmini(env, kod, renk, simdi).catch(() => null);
  const ozel = anlamaOku(b, renk), eski = ozel || anlamaOku(b, null) || {};
  const q = { id: kisaId(), kod, renk: renk || null, metin: m.text, test: Boolean(test), sonSenaryo: Boolean(m.sonSenaryo), neden: t ? String(t.neden).slice(0, 200) : null,
    secim: { ust: eski.ust || (t && t.ust) || null, alt: eski.alt || (t && t.alt) || null, iclik: (ozel && ozel.iclik) || (!renk && eski.iclik) || (t && t.iclik) || null, boy: (BOYLAR[b.boy] ? b.boy : null) || (t && t.boy) || null } };
  await kaydet(env, `pelin:anlama:${q.id}`, q, 3 * 86400);
  const r = await yaz(env, m.chat.id, anlamaMetni(q), { reply_markup: anlamaKlavye(q) });
  return r;
}
async function anlamaDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, alan, id, deger] = cq.data.split(":");
  const q = await oku(env, `pelin:anlama:${id}`, null);
  if (!q) return cevap("Bu kart artık geçerli değil.");
  if (alan !== "o") {
    const gecerli = alan === "boy" ? BOYLAR[deger] : ANLAMA_SECENEK[alan] && ANLAMA_SECENEK[alan].d[deger];
    if (!gecerli) return cevap("Geçersiz.");
    q.secim[alan] = deger; await kaydet(env, `pelin:anlama:${id}`, q, 3 * 86400);
    await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: anlamaMetni(q), reply_markup: anlamaKlavye(q) });
    return cevap("Seçildi");
  }
  const eksik = ["ust", "alt", "iclik", "boy"].filter((k) => !q.secim[k]);
  if (eksik.length) return cevap(`Önce seçin: ${eksik.map((k) => (k === "boy" ? "Boy" : ANLAMA_SECENEK[k].ad)).join(", ")}`);
  await env.KAYIT.delete(`pelin:anlama:${id}`);
  const b = (await boyOku(env, q.kod)) || {};
  const anlama = { ...(b.anlama || {}), [q.renk || "genel"]: { ust: q.secim.ust, alt: q.secim.alt, iclik: q.secim.iclik, onay: simdi } };
  await boyYaz(env, q.kod, { anlama, boy: q.secim.boy, ayakkabiGorunur: ayakkabiBoy(q.secim.boy) || undefined, yereDegmez: ayakkabiBoy(q.secim.boy) || undefined, zaman: simdi });
  await cevap("Kaydedildi");
  const k = modelKurallari(anlama[q.renk || "genel"], q.renk);
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `✅ ${q.kod}${q.renk ? ` · ${q.renk}` : ""} kalıcı kaydedildi: ${k ? k.tr : ""} · boy ${BOYLAR[q.secim.boy].ad}. Bir daha sorulmaz.` });
  return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: q.metin, sonSenaryo: q.sonSenaryo }, simdi, q.test);
}
async function boyDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, boy, id] = cq.data.split(":");
  const q = await oku(env, `pelin:boySoru:${id}`, null);
  if (!q || !BOYLAR[boy]) return cevap("Bu soru artık geçerli değil.");
  await env.KAYIT.delete(`pelin:boySoru:${id}`);
  await boyYaz(env, q.kod, { boy, ayakkabiGorunur: ayakkabiBoy(boy) || undefined, yereDegmez: ayakkabiBoy(boy) || undefined, kaynak: `Patron ${tarihSaatYaz(simdi)}${q.tahmin === boy ? " (Pelin tahmini onaylandı)" : ""}`, zaman: simdi });
  await cevap("Kaydedildi");
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `📏 ${q.kod} boyu kaydedildi: ${BOYLAR[boy].ad}. Bütün renklerde ve iki seride geçerli.` });
  return uretKomutu(env, { from: cq.from, chat: cq.message.chat, text: q.metin }, simdi, q.test); // sıradaki boy sorusu ya da maliyet kartı
}

// ---------- Stil (3 Kasım, lüks seviye): Pelin elbiseye göre aksesuarı seçer; premium'da lüks mekân ----------
// Kayıt: pelinboy:<kod>.stil[<renk|genel>] = { aksesuarTr, aksesuarEn, mekanTr, mekanEn } (kartta yazar, Patron görür)
export const PREMIUM_MEKANLAR = ["5 yıldızlı otel lobisi", "mermer merdiven", "şık restoran", "villa terası", "lüks araba yanı", "Lagos'ta lüks davet", "Nairobi'de lüks davet"];
const STIL_SEMA = { type: "object", additionalProperties: false, required: ["aksesuar_tr", "aksesuar_en", "mekan_tr", "mekan_en"], properties: { aksesuar_tr: { type: "string" }, aksesuar_en: { type: "string" }, mekan_tr: { type: "string" }, mekan_en: { type: "string" } } };
async function stilSec(env, kod, renk, urller, simdi) {
  const mk = (await boyOku(env, kod)) || {};
  const anahtar = renk || "genel";
  if (mk.stil && mk.stil[anahtar]) return mk.stil[anahtar];
  const st = await claudeJson(env, [{ type: "text", text: `VOLONTE (lüks kadın giyim) model ${kod}${renk ? `, renk: ${renk}` : ""}. Ürün fotoğrafları:` }, ...urller.slice(0, 3).map(resimUrl), { type: "text", text: `1) Bu elbiseye uygun AKSESUAR seç (rengine, desenine, tarzına göre): örn. bordo elbise → altın küpe/kolye, nude ya da altın çanta; siyah → inci ya da gümüş; çiçekli → sade, desenle yarışmayan; payetli/dantelli → az ve zarif takı. Aksesuar elbiseyi ASLA gölgelemez. aksesuar_tr: kısa Türkçe (kartta görünecek); aksesuar_en: aynısı kısa İngilizce (görsel üretim için). 2) PREMIUM video için lüks mekân seç (şunlardan biri, elbisenin tarzına göre): ${PREMIUM_MEKANLAR.join(", ")}. Sıradan sokak YOK. mekan_tr: kısa Türkçe; mekan_en: İngilizce sahne tarifi (mekân + ışık + hava; yazı/logo/marka yok; arka plandaki insanlar hafif bulanık).` }], STIL_SEMA, simdi, 500);
  const kayit = { aksesuarTr: String(st.aksesuar_tr).slice(0, 160), aksesuarEn: String(st.aksesuar_en).slice(0, 240), mekanTr: String(st.mekan_tr).slice(0, 80), mekanEn: String(st.mekan_en).slice(0, 400) };
  await boyYaz(env, kod, { stil: { ...(mk.stil || {}), [anahtar]: kayit } });
  return kayit;
}

// Sahne ayarları (3 Kasım, Patron — 3627 brifi): yeni işlerin hepsinde; şablon bunları değiştirebilir
// 4 Kasım (Patron, 3627 videosu yapay ve dönüşler dengesizdi): HIZLI DÖNÜŞ YOK, kamera etrafında dönüş YOK; sadece yavaş, doğal hareket
export const HAREKET_KURALI = "Slow, natural, real-time movement only: she always walks FORWARD toward the camera, never backward and never away from the camera; no spinning, no twirling, no fast turns, no orbiting camera; the camera stays still or very slowly pushes in.";
export const HAREKET_VARSAYILAN = "She takes a few slow, natural steps toward the camera, pauses softly, then glances over her shoulder.";
export const HAREKET_YASAK = "morphing, warping, melting fabric, sliding sleeves, face distortion, walking backward, walking away from the camera, turning her back to the camera, spinning, twirling, fast turn, orbiting camera, sudden movement, jerky motion";
export const SAHNE_VARSAYILAN = {
  acilis: HAREKET_VARSAYILAN,
  kamera: "Static camera or a very slow, gentle push-in.",
  kumas: "The fabric flows and sways naturally with her steps.",
  detay: true, // yakın detay karesi: yaka / dikiş
  sonYazi: false, // 4 Kasım: video modeli yazı ÇİZMEZ (yazamıyordu); "MARKA · kod" sonradan videonun tamamına basılır (paketAdimi)
  hiz: "Smooth natural pace with a gentle cinematic slow-motion feel.",
};
const renkIstemi = (renk) => (renk ? ` COLOR: the garment must be the ${renkEn(renk)} (${renk}) color variant ONLY — exactly that shade as in the product photos (not brighter, not more saturated); if the photos show several colors, use only the ${renkEn(renk)} one.` : "");
const ETIKET_EN = { manken: " worn by a real model (copy ONLY the garment, never her face or body)", aski: " on a hanger (true shape and color of the garment)" };
const rolIstemi = (roller, etiketler = []) => (roller && roller.length ? ` Product photos after the face image: ${roller.map((r, i) => `image ${i + 2} = ${r === "arka" ? "BACK view" : r === "detay" ? "close-up detail" : "FRONT view"}${ETIKET_EN[etiketler[i]] || ""}`).join(", ")}. The front and back must match these photos exactly.` : "");
// 3 Kasım (3627): Veo 3.1 4.942 karakterlik istemi iki kez reddetti (422 "did not generate the expected output"); 3.552 karakterlik
// istem çalışmıştı. Video istemi artık KISA (en fazla ~1.700 karakter): yüz, kıyafet ve mekân zaten başlangıç karesinde var;
// hassas kelimeler (vücut/dar/plus-size) videoda yok. Veo yine reddederse aynı kareyle Kling 4.0'a geçilir.
export const VIDEO_ISTEM_SINIRI = 1700;
// Örnek video tarifinden EŞYA/DEKOR cümleleri atılır (romantik şablon: "küçük kâğıt zarf", kadife fiyonk, uzun eldiven, şapka)
const DEKOR = /envelope|card|letter|glove|hat\b|hats\b|brim|bow\b|ribbon|prop|flower bouquet|bouquet|umbrella|book|cup|glass of/i;
// 4 Kasım: cümleyi tümden atmak yerine sadece eşya geçen yan cümle atılır (romantik: "plain muted green backdrop" korunur)
const DEKOR_PARCA = /(?:,\s*|\s+(?:and|with)\s+)(?:no props beyond\s+)?(?:(?!\b(?:and|with)\b)[^,.;])*?\b(?:envelope|card|letter|gloves?|hats?|brim|bow|ribbon|props?|bouquet|umbrella)\b[^,.;]*/gi;
export const temizOrtam = (x) => `${(String(x || "").split(/(?<=[.;])\s+/).map((c) => (DEKOR.test(c) || /\bprops?\b/i.test(c) ? c.replace(DEKOR_PARCA, "").replace(/\s+([.;])/g, "$1").trim() : c)).filter((c) => c && !DEKOR.test(c) && /[a-z]{3}/i.test(c.replace(/[.;]/g, ""))).join(" ").trim() || "Elegant minimal studio").replace(/[.;\s,]*$/, ".")} No props: no envelope, card, letter, gloves, hat or bow.`;
const kisalt = (x, n) => { const t = String(x || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n).replace(/[,;:\s]+\S*$/, "")}` : t; };
export function yeniVideoIstemi(is) {
  const a = is.sahneAyar || SAHNE_VARSAYILAN, o = is.videoSahne || is.videoOrtam || is.ortam;
  const t = is.videoSablon && is.videoSablon.isik ? is.videoSablon : is.sablon && is.sablon.kamera ? is.sablon : null;
  const b = is.boy && BOYLAR[is.boy.boy] ? BOYLAR[is.boy.boy] : null;
  const parca = [
    b ? `LENGTH RULE (highest priority): ${b.kisa}; ${is.boy.boy === "yerustu" ? "in every wide shot the shoe tips peek out below the hem and the hem never touches the floor" : "in every wide shot both shoes are fully visible below the hem"}.` : "",
    `Vertical 9:16, ${URETIM_SN}-second fashion video of the same woman in exactly the same garment as in the first frame${is.renk ? ` (${renkEn(is.renk)} only)` : ""}.`,
    o ? `${is.videoSahne ? "Setting and atmosphere of this video (she is in this setting): " : "Setting and atmosphere: "}${kisalt(o.sahne, 260).replace(/\.?\s*$/, ".")}` : "Setting: elegant studio.",
    t ? `Style reference: use ONLY its light, color grade, mood and tempo — NOT its framing, props or accessories such as hats, gloves or envelopes: ${kisalt(t.isik, 150)}; ${kisalt(t.hiz, 80)}.` : "",
    is.senaryo && is.senaryo.hareketEn ? `Motion (approved scenario): ${kisalt(is.senaryo.hareketEn, 380)}` : HAREKET_VARSAYILAN,
    HAREKET_KURALI, "The fabric flows and sways naturally with her steps.",
    b ? "Wide shots show her full body with the shoes visible." : "",
    a.detay ? "Include one brief close-up of the neckline/collar and stitching detail, with artistic close-ups of the lace, sequins and fabric texture." : "",
    `Gentle natural movement of the skirt and her hair. ${is.videoSablon ? "Light and color grade as in the style reference" : "Warm cinematic light, rich colors"}, glowing skin. A poised, confident, elegant woman with professional makeup.`,
    is.stil && is.stil.aksesuarEn ? `Accessories: ${kisalt(is.stil.aksesuarEn, 110)}.` : "",
    a.sonYazi && MARKALAR[is.marka] && !VIDEO_YAZI.sonradan ? `The last second ends on an elegant frame with ${MARKALAR[is.marka].yazi(is.kod)} in a corner; no other text, no price.` : "No text.",
    "Stable, consistent, no morphing, smooth natural motion: her face, hands, sleeves and the fabric keep their exact shape in every frame (no sliding, melting or warping). Her face and the dress color, print, cut and collar stay exactly as in the first frame. No logo, no music.",
  ].filter(Boolean);
  // Veo uzun istemi reddediyordu (1.700); Higgsfield Kling/Seedance 2.500'e kadar alır (Avoid listesi için pay bırakılır)
  const sinir = is.arac && ARACLAR[is.arac] && ARACLAR[is.arac].hf ? 2150 : VIDEO_ISTEM_SINIRI;
  let metin = parca.join(" ");
  if (metin.length > sinir) metin = parca.filter((x) => !/^Accessories/.test(x)).join(" ");
  if (metin.length > sinir) metin = parca.filter((x) => !/^(Accessories|Style reference)/.test(x)).join(" ");
  return metin.slice(0, sinir + 200);
}
const uretimFotoIstemi = (ortam, sablon, is = {}) => `${boyBasi(is.boy, (is.boyRef || []).length)}${FOTO_ISTEMI.replace("clean light studio background, soft natural light", "")} Setting: ${ortam ? ortam.sahne : "clean light studio background, soft natural light"}.${sablon && sablon.isik ? ` Mood and lighting reference (do not copy any real person, logo, text or props): ${sablon.isik}; ${temizOrtam(sablon.ortam_havasi)}` : ""}${rolIstemi(is.urunRoller, is.urunEtiketler)}${renkIstemi(is.renk)}${boyIstemi(is.boy)}${is.boy ? KADRAJ_ISTEMI : ""}${YAKA_DETAY}${detayIstemi(is.modelKaydi)}${MAKYAJ}${is.sahneAyar ? `${VOLONTE_KADINI}${POZ}${SINEMA}${aksesuarIstemi(is.stil)}` : ""}${refIstemi((is.boyRef || []).length)} Realistic natural skin, flawless natural hands. The garment is the most important thing: keep it 100% identical to the product photos.`;
const sahneIstemi = (ortam, is = {}) => `${boyBasi(is.boy, (is.boyRef || []).length)}Vertical (9:16) photo of the SAME woman as in the first image (same face, skin tone, hair and body), wearing EXACTLY the garment shown in the other image(s) — identical colors, print, motif size and placement, fabric, cut, length and every detail; do not redesign or recolor anything. Setting: ${ortam.sahne}. Natural pose as the first frame of a short fashion video: she is walking and about to turn to the camera, full body, photorealistic, natural skin, natural light, sharp.${rolIstemi(is.urunRoller, is.urunEtiketler)}${renkIstemi(is.renk)}${boyIstemi(is.boy)}${is.boy ? KADRAJ_ISTEMI : ""}${YAKA_DETAY}${detayIstemi(is.modelKaydi)}${MAKYAJ}${VOLONTE_KADINI}${POZ}${SINEMA}${aksesuarIstemi(is.stil)}${refIstemi((is.boyRef || []).length)} No text, no logo, no watermark.`;
const uretimVideoIstemi = (ortam, sablon) => `${sablon ? `${sablon.kamera}. ${sablon.poz}. ${sablon.hiz}.` : ortam ? ortam.hareket : VIDEO_ISTEMI} The woman's face stays the same. The outfit keeps exactly the same colors, print and cut in every frame. Realistic natural motion, no morphing, no text, no logo, no watermark, no music.`;

// ---------- ÜRETİM KARTI (4 Kasım, Patron): varsayılan araç YOK; her üretimde araç + şablon kartta seçilir ----------
export const KART_ARACLARI = ["hf_seedance25", "hf_kling3", "hf_kling4"];
const KART_ARAC_AD = { hf_seedance25: "Seedance 2.5", hf_kling3: "Kling 3.0 4K", hf_kling4: "Kling 4.0" };
export const SABLON_SECENEK = {
  siyahaltin: { ad: "Siyah-Altın", ortamAd: /siyah\s*alt/i },
  sehir: { ad: "Şehir", ortamAd: /şehir|sehir|city/i },
  // 4 Kasım 16:00 (Patron): örnek podyum videosundan "Şablon olarak kaydet" → "parıltı". Kayıt yoksa aynı tarif yedek olarak:
  parilti: { ad: "Parıltı", sablonAd: "parıltı", ortam: { id: "parilti", ad: "Parıltı (podyum)", sahne: "A minimal high-fashion runway in a clean, bright studio with plain cool pale lavender-gray walls and a glossy white floor, soft even diffused studio light, seated guests along the edge of the runway watching, filmed vertically from the front row. No text, no logos." } },
  romantik: { ad: "Romantik", sablonAd: "romantik", ortam: { id: "romantik", ad: "Romantik", sahne: "A soft romantic setting with diffused warm light, muted pastel tones, gentle glow and an intimate calm mood. No props, no text, no logos." } },
};
// Şablonun video ortamı (katalog ortamından farklıysa ayrı başlangıç karesi üretilir)
export function sablonOrtami(secim, anahtar, sablonlar = {}) {
  const t = SABLON_SECENEK[anahtar];
  if (!t) return null;
  if (t.ortamAd) { const o = ((secim && secim.ortamlar) || []).find((x) => t.ortamAd.test(x.ad)); if (o) return o; }
  if (t.sablonAd && sablonlar[t.sablonAd] && sablonlar[t.sablonAd].ortam_havasi) return { id: `ornek-${t.sablonAd}`, ad: `${t.ad} (${t.sablonAd} şablonu)`, sahne: temizOrtam(sablonlar[t.sablonAd].ortam_havasi) };
  return t.ortam || null;
}
// Kartta seçime göre model başı maliyet (fotoğraf + gerekirse ayrı kare + seçilen araç(lar) + kontroller)
export function kartMaliyeti(secim, aracSecimi, sablonAnahtar, sablonlar = {}) {
  const araclar = aracSecimi === "hepsi" ? KART_ARACLARI : ARACLAR[aracSecimi] ? [aracSecimi] : [];
  const kat = rolOrtami(secim, "katalog"), vo = sablonOrtami(secim, sablonAnahtar, sablonlar);
  const ayriKare = Boolean(vo && (!kat || vo.id !== kat.id));
  const kontrol = KONTROL_TAHMIN + OPENAI_TAHMIN;
  const kalemler = [
    { ad: `Ön fotoğraf + kontrol${kat ? ` (${kat.ad})` : ""}`, birim: yuvarla(GORSEL.fiyat + kontrol) },
    { ad: "Fotoğraf seti: sağ yan, sol yan, arka (ön onaylanınca) + gerçek askı fotoğrafı (ücretsiz)", birim: yuvarla(SET_FIYAT) },
    ...(ayriKare ? [{ ad: `Video başlangıç karesi (${vo.ad}) + kontrol`, birim: yuvarla(GORSEL.fiyat + kontrol) }] : []),
    ...araclar.map((a) => ({ ad: `Video ${URETIM_SN} sn — ${ARACLAR[a].ad}${ARACLAR[a].ustSinir ? " (en fazla, indirim öncesi)" : ""} + kontrol`, birim: yuvarla(ARACLAR[a].saniye * URETIM_SN + kontrol + KONTROL_TAHMIN + 3 * KARE.saniye * URETIM_SN) })),
  ];
  return { araclar, kalemler, toplam: yuvarla(kalemler.reduce((t, k) => t + k.birim, 0)) };
}
function uretimKartMetni(onay, secim, sablonlar, harcanan) {
  const n = onay.kodlar.length;
  const mm = onay.arac ? kartMaliyeti(secim, onay.arac, onay.sablonKey, sablonlar) : null;
  return [
    ...onay.ust,
    `🎬 Video aracı: ${onay.arac ? (onay.arac === "hepsi" ? "HEPSİNİ DENE (Seedance 2.5 + Kling 3.0 4K + Kling 4.0, aynı fotoğraf ve senaryo, yan yana)" : ARACLAR[onay.arac].ad) : "— SEÇİN (aşağıdaki düğmeler)"}`,
    `🎨 Şablon: ${onay.sablonKey ? SABLON_SECENEK[onay.sablonKey].ad : onay.sablonAd ? `kayıtlı şablon "${onay.sablonAd}"` : "— SEÇİN"}`,
    ...(mm ? [...mm.kalemler.map((k) => `• ${k.ad}: ${para(k.birim)}`), `Model başı ~${para(mm.toplam)} · TOPLAM ~${para(mm.toplam * n)} (kalite kontrol yeniden ürettirirse en fazla 2 katı)`] : ["Fiyat: araç seçilince yazılır."]),
    `Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $${mm && harcanan + mm.toplam * n > AYLIK_SINIR_USD ? " ⚠️ SINIRI AŞAR" : ""}`,
    onay.arac && (onay.sablonKey || onay.sablonAd) ? "Hazır: ✅ Onayla'ya basınca üretim başlar." : "Araç ve şablonu seçin, sonra ✅ Onayla.",
  ].join("\n");
}
function uretimKlavye(onay, secim, sablonlar) {
  const n = onay.kodlar.length;
  const fiyat = (a) => para(kartMaliyeti(secim, a, onay.sablonKey, sablonlar).toplam * n);
  const isaret = (x, y) => (x === y ? "☑️ " : "");
  return { inline_keyboard: [
    KART_ARACLARI.slice(0, 2).map((a) => ({ text: `${isaret(onay.arac, a)}${KART_ARAC_AD[a]} · ${fiyat(a)}`, callback_data: `pc:a:${onay.id}:${a}` })),
    [...KART_ARACLARI.slice(2).map((a) => ({ text: `${isaret(onay.arac, a)}${KART_ARAC_AD[a]} · ${fiyat(a)}`, callback_data: `pc:a:${onay.id}:${a}` })), { text: `${isaret(onay.arac, "hepsi")}Hepsini dene · ${fiyat("hepsi")}`, callback_data: `pc:a:${onay.id}:hepsi` }],
    Object.entries(SABLON_SECENEK).map(([k, t]) => ({ text: `${isaret(onay.sablonKey, k)}${t.ad}`, callback_data: `pc:s:${onay.id}:${k}` })),
    [{ text: "✅ Onayla", callback_data: `pu:o:${onay.id}` }, { text: "❌ İptal", callback_data: `pu:i:${onay.id}` }],
    ...((onay.arsiv || []).length ? [onay.arsiv.slice(0, 3).map((k) => ({ text: `📦 Arşivden kullan: ${k} (0 $)`, callback_data: `pr:a:${k}` }))] : []),
  ] };
}
// 4 Kasım (Patron): yeni kart gelince eski AÇIK kartlar (harcama öncesi: üretim kartı, maliyetli Nora kartı) otomatik geçersiz
async function eskiKartlariKapat(env, simdi) {
  const l = await oku(env, "pelin:acikKartlar", []);
  for (const k of l) {
    if (k.tur === "uretim") { const o = await oku(env, `pelin:uretimOnay:${k.ref}`, null); if (o && !o.kullanildi) { o.kullanildi = true; o.gecersiz = simdi; await kaydet(env, `pelin:uretimOnay:${k.ref}`, o, 86400); } }
    if (k.mid) await tg(env, "editMessageReplyMarkup", { chat_id: k.chat, message_id: k.mid, reply_markup: { inline_keyboard: [[{ text: "⌛ Geçersiz — yeni kart geldi", callback_data: "pc:-" }]] } }).catch(() => null);
  }
  // maliyet onayı bekleyen eski işler ("kart") de geçersiz (harcama yoktu)
  const isler = await oku(env, "pelin:isler", []);
  for (const id of isler.slice(-80)) { const x = await oku(env, `pelin:is:${id}`, null); if (x && x.durum === "kart") { x.durum = "iptal"; x.gecmis = [...(x.gecmis || []), [simdi, "yeni kart geldi → geçersiz"]]; await kaydet(env, `pelin:is:${id}`, x); } }
  await kaydet(env, "pelin:acikKartlar", []);
}
async function acikKartEkle(env, kayit) { await kaydet(env, "pelin:acikKartlar", [...(await oku(env, "pelin:acikKartlar", [])), kayit].slice(-10)); }
async function acikKartSil(env, ref) { const l = await oku(env, "pelin:acikKartlar", []); if (l.some((x) => x.ref === ref)) await kaydet(env, "pelin:acikKartlar", l.filter((x) => x.ref !== ref)); }
// Bir modelin son Nora senaryosu (hareket tarifiyle)
async function sonSenaryo(env, kod) {
  const liste = await oku(env, "pelin:isler", []);
  for (const id of [...liste].reverse().slice(0, 120)) { const x = await oku(env, `pelin:is:${id}`, null); if (x && x.kod === kod && x.senaryo && x.senaryo.hareketEn) return { ...x.senaryo, kaynakIs: x.id }; }
  return null;
}
async function kartDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id, deger] = cq.data.split(":");
  const onay = await oku(env, `pelin:uretimOnay:${id}`, null);
  if (!onay || onay.kullanildi) return cevap(onay && onay.gecersiz ? "Bu kart geçersiz (yeni kart geldi)." : "Bu kart artık geçerli değil.");
  if (islem === "a" && (deger === "hepsi" || KART_ARACLARI.includes(deger))) onay.arac = deger;
  else if (islem === "s" && SABLON_SECENEK[deger]) onay.sablonKey = deger;
  else return cevap("Geçersiz seçim.");
  await kaydet(env, `pelin:uretimOnay:${id}`, onay, 3 * 86400);
  const secim = await oku(env, "pelin:secim", null), sablonlar = await oku(env, "pelin:sablonlar", {});
  const metin = uretimKartMetni(onay, secim, sablonlar, await buAyHarcanan(env, simdi));
  await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: metin, reply_markup: uretimKlavye(onay, secim, sablonlar), disable_web_page_preview: true });
  await kartKaydet(env, cq.message.message_id, metin);
  return cevap(islem === "a" ? `Araç: ${deger === "hepsi" ? "hepsi" : KART_ARAC_AD[deger]}` : `Şablon: ${SABLON_SECENEK[deger].ad}`);
}

async function uretKomutu(env, m, simdi, test = false) {
  if (!muratMi(env, m.from.id)) return yaz(env, m.chat.id, "Üretimi sadece Patron başlatır.");
  if (await durdurulduMu(env, "pelin")) return yaz(env, m.chat.id, `${await durMesaji(env, "pelin")} — üretim başlatılmadı.`);
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return yaz(env, m.chat.id, "Önce kurulum: /kurulum (yüz + ortam seçimi).");
  const sozler = String(m.text || "").split(/\s+/).slice(1);
  const buyukler = sozler.map((x) => (x.match(/^b[üu]y[üu]k:(\d{3,6})$/i) || [])[1]).filter(Boolean);
  const kucukler = sozler.map((x) => (x.match(/^k[üu][çc][üu]k:(\d{3,6})$/i) || [])[1]).filter(Boolean);
  const kodlar = [...new Set([...sozler.filter((x) => /^\d{3,6}(:.+)?$/.test(x)).map((x) => x.split(":")[0]), ...buyukler, ...kucukler])].slice(0, test ? 5 : 40);
  // Renk: "/uret 3627 kırmızı" ya da "3627:kırmızı" → sadece o renk
  const renkler = {};
  let sonKod = null, onceki = "";
  for (const x of sozler) {
    const kk = (x.match(/^(?:b[üu]y[üu]k:|k[üu][çc][üu]k:)?(\d{3,6})(?::(.+))?$/i) || []);
    if (kk[1]) { sonKod = kk[1]; if (kk[2] && renkGecerli(kk[2])) renkler[kk[1]] = kk[2].toLocaleLowerCase("tr"); continue; }
    const rk = x.toLocaleLowerCase("tr");
    if (sonKod && RENKLER[rk]) renkler[sonKod] = /^(koyu|açık|acik)$/.test(onceki) ? `${onceki} ${rk}` : rk;
    onceki = rk;
  }
  const sablonAd = (sozler.find((x) => /^şablon:|^sablon:/i.test(x)) || "").split(":")[1] || null;
  const seviye = sozler.some((x) => /^premium$/i.test(x)) ? "premium" : "standart"; // premium: lüks mekân (vitrin modelleri)
  if (!kodlar.length) return yaz(env, m.chat.id, test ? "Kullanım: /maliyettesti 3557 3592 3577 3601 3602 (5 model)" : "Kullanım: /uret 3557 [3592 …] [şablon:ad]");
  const sablonlar = await oku(env, "pelin:sablonlar", {});
  if (sablonAd && !sablonlar[sablonAd]) return yaz(env, m.chat.id, `"${sablonAd}" adlı şablon yok. /sablonlar`);
  const boylar = {};
  for (const k of kodlar) boylar[k] = await boyOku(env, k);
  // 4 Kasım (Patron, ACİL): marka Sami'nin deposundan; belirsizse Patron'a sorulur
  for (const k of kodlar) {
    const mk = await markaSor(env, k);
    if (!mk.marka) return markaSorusu(env, m, k, mk.neden, simdi, test);
    if (mk.yeni) { await boyYaz(env, k, { marka: mk.marka, markaKaynak: `${mk.kaynak} ${tarihSaatYaz(simdi)}` }); boylar[k] = await boyOku(env, k); }
  }
  // 4 Kasım (Patron): her yeni model/renk için ANLAMA KARTI (üst, etek, içlik, boy) — onaylanmadan üretim yok
  for (const k of kodlar) {
    const rk = renkler[k] || (boylar[k] && boylar[k].renk) || null;
    if (!(boylar[k] && BOYLAR[boylar[k].boy]) || !anlamaOku(boylar[k], rk)) return anlamaKarti(env, m, k, rk, simdi, test);
  }
  const harcanan = await buAyHarcanan(env, simdi);
  const id = kisaId();
  // Seri ve renk model kartında KALICI (4 Kasım): yazıda verilirse kaydedilir, verilmezse karttan okunur
  const seriler = {};
  for (const k of kodlar) {
    if (buyukler.includes(k) || kucukler.includes(k)) { seriler[k] = buyukler.includes(k) ? "buyuk" : "kucuk"; if ((boylar[k] || {}).seri !== seriler[k]) await boyYaz(env, k, { seri: seriler[k] }); }
    else seriler[k] = (boylar[k] && SERILER[boylar[k].seri]) ? boylar[k].seri : seriBul((await siteUrunu(env, k) || {}).bedenler);
  }
  for (const k of kodlar) if (!renkler[k] && boylar[k] && boylar[k].renk) renkler[k] = boylar[k].renk;
  const senaryolar = {};
  if (m.sonSenaryo) for (const k of kodlar) { const sn = await sonSenaryo(env, k); if (sn) senaryolar[k] = sn; }
  const foto = {}, stiller = {};
  for (const k of kodlar) foto[k] = await urunFotoSecimi(env, k, renkler[k] || null);
  for (const k of kodlar) stiller[k] = foto[k].urller.length ? await stilSec(env, k, renkler[k] || null, foto[k].urller, simdi).catch(() => null) : null;
  const kat = rolOrtami(secim, "katalog");
  const onay = { id, kodlar, sablonAd, test, seriler, renkler, seviye, stiller, senaryolar, arac: null, sablonKey: null, zaman: simdi };
  onay.ust = [
    `🏷 Marka: ${kodlar.map((k) => `${k} = ${MARKALAR[(boylar[k] || {}).marka] ? MARKALAR[boylar[k].marka].ad : "?"}`).join(", ")} (videonun tamamında sağ altta, fotoğraflarda sağ altta)`,
    `💰 ${test ? "MALİYET TESTİ" : "Üretim"} — ${kodlar.length} model: ${kodlar.join(", ")}${sablonAd ? ` (kayıtlı şablon: ${sablonAd})` : ""} · ${seviye === "premium" ? "PREMIUM" : "standart"}`,
    `👤 Manken: ${kodlar.map((k) => `${k} ${seriler[k] === "buyuk" ? "büyük beden (dolgun)" : "küçük seri"} (${yuzAdi(seriYuzu(secim, seriler[k]))})`).join(", ")}`,
    ...(Object.keys(renkler).length ? [`Renk: ${Object.entries(renkler).map(([k, rk]) => `${k} sadece ${rk}`).join(", ")}`] : []),
    `Ürün fotoğrafı: ${kodlar.map((k) => `${k} ${foto[k].kaynak === "patron" ? `sizin gönderdiğiniz (${foto[k].roller.map((x, i) => fotoEtiketi({ rol: x, etiket: (foto[k].etiketler || [])[i] })).join(", ")})` : foto[k].urller.length ? "site" : "YOK ⚠️"}`).join(", ")}`,
    `Boy: ${kodlar.map((k) => `${k} ${boyYazi(boylar[k])}`).join(", ")}`,
    ...kodlar.map((k) => { const mk = modelKaydiYap(boylar[k], renkler[k] || null); return mk && (mk.kuralTr || mk.astarTr) ? `Model kuralı (${k}): ${mk.kuralTr || mk.astarTr}` : null; }).filter(Boolean),
    `Ortam: katalog fotoğrafı ${kat ? kat.ad : "stüdyo"} · video${sablonAd && sablonlar[sablonAd] && sablonlar[sablonAd].kaynak === "ornek" ? ` örnek videonun ortamı (${sablonAd}) — isterseniz aşağıdan başka şablon seçin` : sablonAd ? ` kayıtlı şablon ${sablonAd}` : ": seçtiğiniz şablon"}${seviye === "premium" ? " (premium: lüks mekân)" : ""}`,
    `Kadraj: tam boy (baş ve ayakkabı kesilmez) · sade, zarif ayakkabı`,
    ...kodlar.filter((k) => stiller[k]).map((k) => `Aksesuar (${k}): ${stiller[k].aksesuarTr}`),
    ...(seviye === "premium" ? kodlar.filter((k) => stiller[k]).map((k) => `Premium mekân (${k}): ${stiller[k].mekanTr}`) : []),
    "Manken: VOLONTE kadını (başarılı, zengin, özgüvenli) · profesyonel makyaj · sinematik ışık · poz ile bel vurgusu (kesim daraltılmaz)",
    `Sahne: kameraya doğru İLERİ birkaç yavaş adım · hafif duruş · omuz üstünden bakış · kumaş doğal dalgalanır · hızlı dönüş, geri yürüme ve kamera dönüşü YOK · yaka/dikiş yakın kare · marka + kod videonun tamamında sağ altta, sonradan basılır (fiyat yok) · kapak fotoğrafı videodan`,
    ...(Object.keys(senaryolar).length ? kodlar.filter((k) => senaryolar[k]).map((k) => `📝 Senaryo (${k}) — Nora'nın son senaryosu, aynen:\n${senaryolar[k].tr}`) : ["📝 Senaryo: fotoğraf hazır olunca Nora yazar, onayınıza gelir."]),
  ];
  // Eksik fotoğraf (ön/arka mankende, yakın detay): karta yazılır + elemana (Hemra) söylenir; arşivde paket varsa yeniden üretmeye gerek yok
  const eksikler = {};
  for (const k of kodlar) { const e = await eksikFotolar(env, k); if (e.length) eksikler[k] = e; }
  if (Object.keys(eksikler).length) {
    onay.ust.push(...Object.entries(eksikler).map(([k, e]) => `⚠️ Eksik fotoğraf (${k}): ${e.join(", ")} — elemana bildirildi (/rehber)`));
    if (!test && hemra(env)) for (const [k, e] of Object.entries(eksikler)) await yaz(env, hemra(env), `📸 ${k} için şu fotoğraf eksik: ${e.join(", ")}. Lütfen çekip "${k} manken arka" / "${k} detay" yazısıyla gönderin. Rehber: /rehber`).catch(() => null);
  }
  onay.arsiv = [];
  for (const k of kodlar) { const a = await env.KAYIT.get(`pelinarsiv:${k}`, "json").catch(() => null); if (a) { onay.arsiv.push(k); onay.ust.push(`📦 Arşivde hazır paket var (${k}, ${tarihSaatYaz(a.zaman)}): yeniden üretmeye gerek yok → "Arşivden kullan" (0 $)`); } }
  if (!test && (await tekKapiAcik(env))) { // 5 Kasım: Venom kartında küçük resimler
    const kr = kodlar.flatMap((k) => (foto[k].urller || []).slice(0, kodlar.length > 3 ? 1 : 3)).slice(0, 10);
    if (kr.length > 1) await tg(env, "sendMediaGroup", { chat_id: m.chat.id, media: kr.map((u, i) => ({ type: "photo", media: u, ...(i === 0 ? { caption: `📷 ${kodlar.join(", ")} — ürün fotoğrafları` } : {}) })) }).catch(() => null);
    else if (kr.length === 1) await tg(env, "sendPhoto", { chat_id: m.chat.id, photo: kr[0], caption: `📷 ${kodlar[0]}` }).catch(() => null);
  }
  await eskiKartlariKapat(env, simdi);
  await kaydet(env, `pelin:uretimOnay:${id}`, onay, 3 * 86400);
  const sablonlarK = await oku(env, "pelin:sablonlar", {});
  const r = await yaz(env, m.chat.id, uretimKartMetni(onay, secim, sablonlarK, harcanan), { reply_markup: uretimKlavye(onay, secim, sablonlarK) });
  if (r && r.ok) await acikKartEkle(env, { tur: "uretim", ref: id, chat: m.chat.id, mid: r.result && r.result.message_id, zaman: simdi });
  return r;
}

// Venom'dan gelen üretim (Patron Venom'da kartı onaylamış, "Emin misiniz?" demiş): kurulum ve aylık sınır burada da kontrol edilir
export async function venomUretimi(env, onay, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  if (!secim) return { hata: "kurulum yapılmamış (Pelin'e /kurulum: yüz + ortam seçimi)" };
  for (const k of onay.kodlar) if (!((await boyOku(env, k)) || {}).boy) return { hata: `${k} için boy kayıtlı değil — Pelin'e "/uret ${k}" yazın, boyu bir kez sorar` };
  // aylık sınır: en ucuz seçimle bile aşılıyorsa kart da açılmaz
  const enAz = yuvarla(Math.min(...KART_ARACLARI.map((x) => kartMaliyeti(secim, x, "siyahaltin").toplam)) * onay.kodlar.length);
  const harcanan = await buAyHarcanan(env, simdi);
  if (harcanan + enAz > AYLIK_SINIR_USD) return { hata: `aylık sınır aşılır (bu ay ${para(harcanan)} / ${AYLIK_SINIR_USD} $, bu iş en az ~${para(enAz)}); sınırı artırmak Patron onayıyla` };
  // 4 Kasım (Patron): varsayılan araç yok → Venom'dan gelen iş de Pelin'in araç + şablon kartına döner (Patron orada seçer)
  const p = murat(env);
  const r = await uretKomutu(env, { from: { id: p }, chat: { id: p }, text: `/${onay.test ? "maliyettesti" : "uret"} ${onay.kodlar.join(" ")}` }, simdi, Boolean(onay.test));
  return r && r.ok ? { ok: true, mesaj: `Pelin'e ${onay.kodlar.join(", ")} kartı gönderildi: araç ve şablonu orada seçip ✅ Onayla'ya basın. Para henüz harcanmadı.` } : { hata: "Pelin kartı gönderemedi" };
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
    const ornekOrtam = sablon && sablon.kaynak === "ornek" && sablon.ortam_havasi ? { id: `ornek-${sablon.ad}`, ad: `örnek video (${sablon.ad})`, sahne: temizOrtam(sablon.ortam_havasi) } : null;
    const stil = (onay.stiller && onay.stiller[kod]) || null;
    const premiumOrtam = onay.seviye === "premium" && stil && stil.mekanEn && !ornekOrtam ? { id: `premium-${kod}`, ad: `premium: ${stil.mekanTr}`, sahne: `${stil.mekanEn}. Luxurious, elegant atmosphere; people in the background softly blurred, the focus always on her and the dress.` } : null;
    const kartSablon = onay.sablonKey ? sablonOrtami(secim, onay.sablonKey, sablonlar) : null; // kartta seçilen şablon (video ortamı)
    const videoOrtam = premiumOrtam || kartSablon || ornekOrtam || (sablon && ortamBul(sablon.videoOrtamId)) || rolOrtami(secim, "video", i);
    const boy = await boyOku(env, kod);
    const araclar = onay.arac === "hepsi" ? KART_ARACLARI : [ARACLAR[onay.arac] ? onay.arac : aracSec(secim)];
    if (onay.sablonKey) await boyYaz(env, kod, { sonSablon: onay.sablonKey });
    const is = { id, kod, testId, seri, renk, marka: (boy && MARKALAR[boy.marka]) ? boy.marka : null, aracYasak: [], seviye: onay.seviye || "standart", stil, arac: araclar[0], sablonKey: onay.sablonKey || null, senaryo: (onay.senaryolar && onay.senaryolar[kod]) || null, urunEtiketler: fs.etiketler || [], modelKaydi: modelKaydiYap(boy, renk), boy: boy && BOYLAR[boy.boy] ? { boy: boy.boy } : null, boyRef: ((boy && boy.referans) || []).filter((x) => x.tur === "foto").slice(0, 1).map((x) => dosyaAdresi(env, x.anahtar)), urunRoller: fs.roller, urunKaynak: fs.kaynak, sahneAyar: { ...SAHNE_VARSAYILAN, ...((sablon && sablon.sahne) || {}) }, ortam, videoOrtam: videoOrtam && (!ortam || videoOrtam.id !== ortam.id) ? videoOrtam : null, sahneDeneme: 0, sablon, urunler, durum: urunler.length ? "foto_gonder" : "hata", fotoDeneme: 0, videoDeneme: 0, maliyet: 0, zaman: simdi, gecmis: [] };
    if (!urunler.length) is.hata = "ürün fotoğrafı yok (sitede değil; fotoğrafı yazısında model koduyla Pelin'e gönderin: \"3627 manken\", \"3627 askı\")";
    // HEPSİNİ DENE: lider (ilk araç) fotoğrafı/kareyi üretir; diğer araçlar aynı fotoğraf + aynı senaryoyla bekler, sonra yan yana
    if (araclar.length > 1 && urunler.length) {
      const gid = `g-${kisaId()}`;
      const takip = araclar.slice(1).map((a) => ({ ...is, id: `${kod}-${kisaId()}`, arac: a, durum: "grup_bekle", grup: gid, lider: id, gecmis: [[simdi, `hepsini dene: ${ARACLAR[a].ad}, liderin (${id}) fotoğrafını bekliyor`]] }));
      Object.assign(is, { grup: gid, takipciler: takip.map((x) => x.id) });
      for (const x of takip) { await kaydet(env, `pelin:is:${x.id}`, x); }
      await kaydet(env, `pelin:grup:${gid}`, { ids: [id, ...takip.map((x) => x.id)], zaman: simdi }, 14 * 86400);
      await kaydet(env, `pelin:is:${id}`, is);
      liste.push(id, ...takip.map((x) => x.id));
      continue;
    }
    await kaydet(env, `pelin:is:${id}`, is);
    liste.push(id);
    if (!urunler.length) await yaz(env, murat(env), `⚠️ ${kod}: ${is.hata}`);
  }
  await kaydet(env, "pelin:isler", liste.slice(-200));
  if (testId) await kaydet(env, `pelin:test:${testId}`, { kodlar: onay.kodlar, zaman: simdi });
}

async function grupHarcamasi(env, gid) {
  const g = await oku(env, `pelin:grup:${gid}`, null);
  let t = 0; for (const id of (g && g.ids) || []) { const x = await oku(env, `pelin:is:${id}`, null); t += (x && x.maliyet) || 0; }
  return { g, t: yuvarla(t) };
}
// 4 Kasım (Patron): FOTOĞRAF SETİ — ön fotoğraf onaylanınca sağ yan, sol yan, arka (aynı kadın, aynı elbise, aynı ortam) + askıda
// detay (kumaş, dantel, işleme; insan yok). Kontrol yapılmaz (Patron görür), yeniden üretim yok. Sonra video.
export const ACILAR = [
  { k: "sag", ad: "sağ yan", en: "from her RIGHT side (right profile, three-quarter right)" },
  { k: "sol", ad: "sol yan", en: "from her LEFT side (left profile, three-quarter left)" },
  { k: "arka", ad: "arka", en: "from BEHIND (back view), her face turned slightly over the shoulder" },
  // 4 Kasım (Patron, KALICI): askı YAPAY ZEKÂYLA ÜRETİLMEZ — askı ön/arka mankendeki gerçek fotoğraftan kesilir (askiDetay, paketlemede)
];
export const SET_FIYAT = ACILAR.filter((a) => !a.gercek).length * 0.15;
// Gerçek askı fotoğrafı: etiketi "askı" olan, istenen renkte (yoksa herhangi), ön görünüm öncelikli, en yeni
export async function gercekAskiFoto(env, kod, renk = null) {
  const l = fotoSirala(await oku(env, `pelin:urunfoto:${kod}`, [])).filter((x) => x.etiket === "aski" && x.rol !== "arka" && x.rol !== "detay");
  const x = (renk && l.find((y) => y.renk === renk)) || l[0];
  return x ? dosyaAdresi(env, x.anahtar) : null;
}
const aciIstemi = (a, is) => (`${boyBasi(is.boy, 0)}The SAME woman wearing EXACTLY the same garment in the same setting and light as in the first image, now photographed ${a.en}. Full body from head to shoes, natural elegant pose. Identical garment: same color${is.renk ? ` (${renkEn(is.renk)} only)` : ""}, cut, length, sleeves, collar and every detail; the back of the garment must match the product photos.${detayIstemi(is.modelKaydi)}${MAKYAJ} Photorealistic, sharp. No text, no logo, no watermark.`);
// ---------- PAKETLEME (4 Kasım, Patron): "MARKA · kod" yazısı SONRADAN, yeniden üretim YOK ----------
// Fotoğraflar (ön, kapak, set): Cloudflare Images ile sağ alt köşeye etiket (Kemal'in marka.js'i, marka model kartından).
// Video: yazı videonun TAMAMINDA sağ alt köşede (fal blend-video; aşağıda paketAdimi). Kuruşluk.
// Damgalı dosyalar KV "pelinmedya:<anahtar>" (30 gün) → /medya/<anahtar>.
async function medyaKaydet(env, bayt, tur = "image/jpeg") {
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await env.KAYIT.put(`pelinmedya:${anahtar}`, bayt, { expirationTtl: 30 * 86400, metadata: { tur } });
  return `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${anahtar}`;
}
async function medyaVer(env, anahtar, istek = null) {
  const r = await env.KAYIT.getWithMetadata(`pelinmedya:${anahtar}`, "arrayBuffer");
  if (!r || !r.value) return new Response("yok", { status: 404, headers: { "access-control-allow-origin": "*" } });
  // 4 Kasım: site test sayfası (360°) başka alandan okur → CORS; iPhone Safari videoyu parça parça ister → Range (206)
  const tur = (r.metadata && r.metadata.tur) || "image/jpeg", n = r.value.byteLength;
  const ortak = { "content-type": tur, "cache-control": "public, max-age=86400", "access-control-allow-origin": "*", "accept-ranges": "bytes" };
  const aralik = istek && istek.headers.get("range");
  const m = aralik && aralik.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let bas = m[1] ? Number(m[1]) : Math.max(0, n - Number(m[2])), son = m[1] && m[2] ? Math.min(n - 1, Number(m[2])) : n - 1;
    if (bas >= n || bas > son) return new Response(null, { status: 416, headers: { ...ortak, "content-range": `bytes */${n}` } });
    return new Response(r.value.slice(bas, son + 1), { status: 206, headers: { ...ortak, "content-range": `bytes ${bas}-${son}/${n}`, "content-length": String(son - bas + 1) } });
  }
  return new Response(r.value, { headers: { ...ortak, "content-length": String(n) } });
}
export async function damgala(env, url, kod, marka) {
  if (!env.IMAGES) throw new Error("IMAGES bağlantısı yok");
  // Pelin'in kendi /dosya/ adresi (Patron'un gerçek fotoğrafı): worker kendine istek atamaz → doğrudan okunur (HEIC → JPEG dahil)
  const kendi = String(url).match(/\/dosya\/([0-9a-f]{32})$/);
  const r = kendi ? await dosyaVer(env, kendi[1]) : await fetch(url);
  if (!r.ok) throw new Error(`görsel indirilemedi (${r.status})`);
  const bayt = new Uint8Array(await r.arrayBuffer());
  const bilgi = await env.IMAGES.info(new Blob([bayt]).stream()).catch(() => ({ width: 1080 }));
  const damgali = await markaBas(env, bayt, bilgi.width || 1080, kod, marka);
  return medyaKaydet(env, damgali);
}
// ---------- ASKI + DETAY (KALICI KURAL, aski-detay.js): gerçek mankendeki ön/arka fotoğraftan; elbise yeniden çizilmez ----------
// Kaynak: Patron'un ön/arka fotoğrafı (askı etiketli olanlar hariç; "manken" etiketliler önce). Maliyet ~0,09 $/model.
async function mankenFotolari(env, kod, renk = null) {
  const l = fotoSirala(await oku(env, `pelin:urunfoto:${kod}`, [])).filter((x) => x.etiket !== "aski" && x.etiket !== "kumas");
  const sec = (rol) => { const a = l.filter((x) => x.rol === rol && (!renk || !x.renk || x.renk === renk)); return a.find((x) => x.etiket === "manken") || a[0] || null; };
  const on = sec("on"), arka = sec("arka");
  return { on: on && on.anahtar, arka: arka && arka.anahtar };
}
export async function askiDetayBaslat(env, is, simdi) {
  const k = await mankenFotolari(env, is.kod, is.renk);
  if (!k.on) { is.ad = { yok: "mankende çekilmiş ön fotoğraf yok" }; return; }
  const istek = {};
  for (const [ad, anahtar] of [["kesOn", k.on], ["kesArka", k.arka]]) if (anahtar) istek[ad] = await falGonder(env, KESIM.uc, { image_url: dosyaAdresi(env, anahtar), prompt: KESIM.istem, autocrop: KESIM.autocrop });
  for (const y of DETAY_YERLERI) { const a = y.foto === "on" ? k.on : k.arka; if (a) istek[`yer_${y.k}`] = await falGonder(env, BUL.uc, { image_url: dosyaAdresi(env, a), prompt: y.istem, include_boxes: true, include_scores: true, apply_mask: false, return_multiple_masks: false, output_format: "png" }); }
  const fiyat = yuvarla(Object.keys(istek).reduce((t, x) => t + (x.startsWith("kes") ? KESIM.fiyat : BUL.fiyat), 0));
  is.maliyet = yuvarla((is.maliyet || 0) + fiyat); await harcamaYaz(env, fiyat, simdi, "fal", is.kod);
  is.ad = { kaynak: k, istek, sonuc: {}, zaman: simdi };
}
// Döner: true = bitti (is.adSonuc dolu ya da yok), false = bekliyor
export async function askiDetayIlerle(env, is, simdi, marka, secenek = {}) {
  const ad = is.ad;
  if (!ad || ad.yok) return true;
  for (const [x, f] of Object.entries(ad.istek)) {
    if (ad.sonuc[x]) continue;
    const r = await falHam(env, f).catch(() => ({ bitti: false }));
    if (r.bitti) ad.sonuc[x] = r.hata ? { hata: r.hata } : x.startsWith("kes") ? { url: ((r.c.image || (r.c.images || [])[0]) || {}).url || null } : { c: r.c };
    else if (simdi - ad.zaman > 3600) ad.sonuc[x] = { hata: "1 saatte bitmedi" };
  }
  if (Object.keys(ad.sonuc).length < Object.keys(ad.istek).length) return false;
  const ek = [];
  // Kaynak = KESİK görsel (arka plan + manken silinmiş, boyut aynı); yoksa gerçek fotoğraf. Kutular gerçek fotoğrafa göre → ölçeklenir.
  const kaynak = {}, gercek = {};
  for (const [f, a] of Object.entries(ad.kaynak)) if (a) { const r = await dosyaVer(env, a); if (r.ok) { const bayt = new Uint8Array(await r.arrayBuffer()); const b = await env.IMAGES.info(new Blob([bayt]).stream()).catch(() => ({})); gercek[f] = { bayt, W: b.width || 1200, H: b.height || 1600 }; } }
  for (const [f, x] of [["on", "kesOn"], ["arka", "kesArka"]]) {
    const u = ad.sonuc[x] && ad.sonuc[x].url; if (!u) { if (gercek[f]) kaynak[f] = gercek[f]; continue; }
    const r = await fetch(u); if (!r.ok) { if (gercek[f]) kaynak[f] = gercek[f]; continue; }
    const bayt = new Uint8Array(await r.arrayBuffer()); const b = await env.IMAGES.info(new Blob([bayt]).stream()).catch(() => ({}));
    kaynak[f] = { bayt, W: b.width || (gercek[f] || {}).W || 1200, H: b.height || (gercek[f] || {}).H || 1600, kesik: true };
  }
  const olcek = (f, kt) => { const g = gercek[f], k = kaynak[f]; if (!kt || !g || !k) return kt; const sx = k.W / g.W, sy = k.H / g.H; return [kt[0] * sx, kt[1] * sy, kt[2] * sx, kt[3] * sy]; };
  const kutu = (y) => { const kk = gercek[y.foto], s = ad.sonuc[`yer_${y.k}`]; return kk && s && s.c ? olcek(y.foto, kutuSec(s.c, kk.W, kk.H)) : null; };
  const yer = Object.fromEntries(DETAY_YERLERI.map((y) => [y.k, kutu(y)]));
  if (!yer.yaka && yer.elbise) yer.yaka = yakaKutusu(yer.elbise); // SAM yakayı bulamazsa elbisenin üst ortası
  if (!yer.isleme && yer.elbise) yer.isleme = islemeKutusu(yer.elbise);
  // Askı ön/arka: kesik görsel, elbise kutusuna kırpılır (kırıntılar atılır), beyaz fon + sade askı
  for (const [f, kt, ad2] of [["on", yer.elbise, "askı ön"], ["arka", yer.arkaElbise, "askı arka"]]) {
    const k = kaynak[f]; if (!k || !k.kesik) continue;
    const elbise = kt ? await elbiseKirp(env, k.bayt, kt, k.W, k.H) : k.bayt;
    ek.push({ ad: ad2, url: await medyaKaydet(env, await askiGorseli(env, elbise, is.kod, marka, secenek)) });
  }
  const kumas = ((await boyOku(env, is.kod)) || {}).kumas;
  const karo = (foto, kt, etiket) => (kaynak[foto] && kt ? { ...kaynak[foto], kutu: kt, etiket } : null);
  const DY = DETAY_ETIKET;
  const k1 = [karo("on", yer.yaka, `${DY.yaka.en} · ${DY.yaka.fr}`), karo("on", yer.isleme, `${DY.isleme.en} · ${DY.isleme.fr}`)].filter(Boolean);
  const k2 = [karo("on", yer.kol, `${DY.kol.en} · ${DY.kol.fr}`), karo("on", yer.elbise && kumasKutusu(yer.elbise), `FABRIC · TISSU${kumas ? ` · ${String(kumas).toLocaleUpperCase("tr").slice(0, 28)}` : ""}`), karo("arka", yer.arkaElbise && arkaKutusu(yer.arkaElbise), "BACK · DOS")].filter(Boolean);
  const baslik = `${MARKALAR[marka] ? MARKALAR[marka].ad : marka} · ${is.kod}`;
  if (KOLAJ) for (const [i, l] of [[1, k1], [2, k2]]) if (l.length) { const j = await kolaj(env, l, is.kod, marka, baslik); if (j) ek.push({ ad: `detay ${i}`, url: await medyaKaydet(env, j) }); }
  is.adSonuc = { ek, eksik: [!ek.some((x) => x.ad === "askı arka") && "askı arka (arka fotoğraf yok)", KOLAJ && !k1.length && "detay 1", KOLAJ && !k2.length && "detay 2"].filter(Boolean), zaman: simdi };
  return true;
}
// Instagram için 4:5 ve 1:1 (ücretsiz; Cloudflare Images; marka yazısı sağ altta)
async function instagramKirp(env, url, kod, marka) {
  const r = await fetch(url); if (!r.ok) return null;
  const bayt = new Uint8Array(await r.arrayBuffer()), c = {};
  for (const [ad, w, h] of [["4:5", 1080, 1350], ["1:1", 1080, 1080]]) {
    const k = await env.IMAGES.input(new Blob([bayt]).stream()).transform({ width: w, height: h, fit: "cover", gravity: "top" }).output({ format: "image/jpeg", quality: 92 });
    c[ad] = await medyaKaydet(env, await markaBas(env, new Uint8Array(await k.response().arrayBuffer()), w, kod, marka));
  }
  return c;
}
// ARŞİV (KV; R2 hesapta kapalı): tüm paket model koduyla, süresiz. Aynı model tekrar gelince yeniden üretilmez.
async function medyaKalici(env, url) {
  const m = String(url || "").match(/\/medya\/([0-9a-f]{32})$/);
  if (m) { const r = env.KAYIT.getWithMetadata ? await env.KAYIT.getWithMetadata(`pelinmedya:${m[1]}`, "arrayBuffer") : { value: await env.KAYIT.get(`pelinmedya:${m[1]}`, "arrayBuffer"), metadata: null }; if (r && r.value) { await env.KAYIT.put(`pelinmedya:${m[1]}`, r.value, { metadata: r.metadata }); return url; } return url; }
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return url;
  const anahtar = crypto.randomUUID().replace(/-/g, "");
  await env.KAYIT.put(`pelinmedya:${anahtar}`, await r.arrayBuffer(), { metadata: { tur: r.headers.get("content-type") || "video/mp4" } });
  return `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${anahtar}`;
}
async function arsivle(env, is, kayit, simdi) {
  const a = { kod: is.kod, isId: is.id, marka: kayit.marka, zaman: simdi, maliyet: is.maliyet || 0, video: await medyaKalici(env, kayit.video), foto: await medyaKalici(env, kayit.foto), set: [] };
  for (const x of kayit.set || []) a.set.push({ ad: x.ad, url: await medyaKalici(env, x.url) });
  await env.KAYIT.put(`pelinarsiv:${is.kod}`, JSON.stringify(a));
  return a;
}
async function paketeAl(env, is, simdi) {
  Object.assign(is, { durum: !is.setTamam && !is.setYok && !is.kaynakIs ? "set_gonder" : "paket_gonder", paket: null, onayZaman: simdi });
  is.gecmis = [...(is.gecmis || []), [simdi, "Patron üretimi onayladı → marka yazısı basılıyor (paketleme)"]];
  await kaydet(env, `pelin:is:${is.id}`, is);
  const liste = await oku(env, "pelin:isler", []); if (!liste.includes(is.id)) { liste.push(is.id); await kaydet(env, "pelin:isler", liste.slice(-200)); }
}
// 4 Kasım (Patron, 3627 düzeltme): yazı videonun TAMAMINDA sağ alt köşede (kapanış karesi yok). Video yeniden ÜRETİLMEZ:
// 1) son kare → boyut  2) video 1080 genişliğe indirilir (Telegram/site için hafif) + videonun boyunda nötr gri "yazı katmanı"
// 3) fal workflow-utilities/blend-video ("overlay": gri = değişmez, köşede beyaz yazı + yarı saydam siyah zemin) → kuruşluk.
// Sonuç ÖNCE Patron'a ayrı gönderilir (damgalı video + gerçek askı fotoğrafı), sonra Kemal SON YAYIN ONAYI kartını getirir.
export const ASKI_PAKETTE = false; // 4 Kasım: Patron askı fotoğraflarını sonra kendisi hazırlayacak
export const VIDEO_YAZI = { olcek: "fal-ai/workflow-utilities/scale-video", karisim: "fal-ai/workflow-utilities/blend-video", mod: "overlay", genislik: 1080, katmanSn: 20, fiyat: 0.03, sonradan: true };
const cift = (n) => Math.max(2, Math.round(n / 2) * 2);
async function paketAdimi(env, is, simdi) {
  const b = (await boyOku(env, is.kod)) || {};
  const marka = MARKALAR[b.marka] ? b.marka : null;
  if (!marka) { is.durum = "uyari"; is.sorunlar = [`${is.kod} markası model kartında yok — paketlenmedi`]; return; }
  if (is.durum === "paket_gonder") {
    const p = { marka, set: {} };
    p.foto = await damgala(env, is.sahne || is.foto, is.kod, marka);
    if (is.kapak) p.kapak = await damgala(env, is.kapak, is.kod, marka);
    for (const [k, u] of Object.entries(is.set || {})) if (u && u !== "yok" && k !== "aski") p.set[k] = await damgala(env, u, is.kod, marka);
    p.formatlar = await instagramKirp(env, is.sahne || is.foto, is.kod, marka).catch(() => null);
    is.paket = p;
    // 4 Kasım (Patron): askı/360 ŞİMDİLİK YOK — paket = mankenli video + mankenli foto seti (ön, sağ, sol, arka)
    if (!ASKI_PAKETTE) { is.ad = { yok: "kapalı (Patron kararı)" }; is.paket.ekler = []; is.paketFal = await falGonder(env, KARE.uc, { video_url: is.video, frame_type: "last" }); is.durum = "paket_kare"; is.bekleZaman = simdi; return; }
    await askiDetayBaslat(env, is, simdi);
    is.durum = "paket_aski"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "aski_detay") { // sonradan (paket hazırken) askı + detay: önce Patron'a önizleme
    if (!(await askiDetayIlerle(env, is, simdi, marka))) return;
    is.paket.ekler = [...((is.paket.ekler || []).filter((x) => !/^askı|^detay/.test(x.ad))), ...((is.adSonuc && is.adSonuc.ek) || [])];
    is.paket.set = Object.fromEntries(Object.entries(is.paket.set || {}).filter(([k]) => k !== "aski")); // eski askı (gerçek askı fotoğrafı) yerine yenisi
    is.gecmis.push([simdi, `askı + detay hazır: ${is.paket.ekler.map((x) => x.ad).join(", ")}`]);
    if (is.adKontrol) { is.durum = "aski_kontrol"; return; } // Claude Code önce bakar; "askiDetayGoster" ile Patron'a
    await paketOnizleme(env, is, marka); is.durum = "paket_onay"; return;
  }
  if (is.durum === "paket_aski") {
    if (!(await askiDetayIlerle(env, is, simdi, marka))) return;
    is.paket.ekler = (is.adSonuc && is.adSonuc.ek) || [];
    is.paketFal = await falGonder(env, KARE.uc, { video_url: is.video, frame_type: "last" });
    is.durum = "paket_kare"; is.bekleZaman = simdi; return;
  }
  const bekle = async (f) => { const r = await falDurum(env, f).catch(() => ({ bitti: false })); if (!r.bitti && simdi - is.bekleZaman > 3600) return { bitti: true, hata: "1 saatte bitmedi" }; return r.bitti ? r : null; };
  if (is.durum === "video_duzelt") { // var olan damgalı videoyu 1080×1920 + sessiz ses izi (YENİDEN ÜRETİM YOK)
    const r = await bekle(is.paketFal); if (!r) return;
    if (r.hata || !r.video) throw new Error(`video boyutlanamadı: ${r.hata || "yok"}`);
    is.paketFal = await falGonder(env, "fal-ai/ffmpeg-api/merge-audio-video", { video_url: r.video, audio_url: await sessizSes(env), start_offset: 0 });
    is.durum = "video_duzelt_ses"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "video_duzelt_ses") {
    const r = await bekle(is.paketFal); if (!r) return;
    if (r.hata || !r.video) throw new Error(`ses izi eklenemedi: ${r.hata || "yok"}`);
    is.paket.video = r.video; is.durum = is.duzeltSonra || "onaylandi";
    is.maliyet = yuvarla((is.maliyet || 0) + 0.02); await harcamaYaz(env, 0.02, simdi, "fal", is.kod);
    const vr = await fetch(r.video); if (vr.ok) is.paketKopya = await medyaKaydet(env, await vr.arrayBuffer(), "video/mp4");
    is.gecmis.push([simdi, "video düzeltildi: 1080×1920 + sessiz ses izi (iPhone'a kaydedilebilir), yeniden üretim yok"]);
    if (!is.duzeltKontrol) await tgDosya(env, "sendVideo", "video", is.paketKopya || r.video, { chat_id: murat(env), caption: `🎬 ${is.kod} — aynı video (YENİDEN ÜRETİLMEDİ), iPhone'a kaydedilebilir biçimde: MP4 · H.264 · 1080×1920 · ses izi var`, supports_streaming: true });
    return;
  }
  if (is.durum === "paket_kare") {
    const r = await bekle(is.paketFal); if (!r) return;
    if (r.hata || !(r.resimler || [])[0]) throw new Error(`son kare alınamadı: ${r.hata || "yok"}`);
    const kr = await fetch(r.resimler[0]);
    const bilgi = kr.ok ? await env.IMAGES.info(kr.body).catch(() => null) : null;
    const W = (bilgi && bilgi.width) || 1080, H = (bilgi && bilgi.height) || 1920;
    const w = cift(Math.min(VIDEO_YAZI.genislik, W)); let h = cift((w * H) / W);
    if (w === 1080 && Math.abs(h - 1920) <= 64) h = 1920; // 4 Kasım: iPhone/Telegram için standart 1080×1920 (1938 gibi boylar sorun)
    const katman = await medyaKaydet(env, await katmanPng(w, h, is.kod, marka), "image/png");
    is.paket.boyut = { w, h }; is.paket.katman = katman;
    is.paketFal = await falGonder(env, "fal-ai/ffmpeg-api/images-to-video", { images: [{ url: katman, frames: 24 * VIDEO_YAZI.katmanSn }], fps: 24 });
    is.paketFal2 = await falGonder(env, VIDEO_YAZI.olcek, { video_url: is.video, width: w, height: h, mode: "stretch", crf: 20, codec: "libx264", preset: "medium" });
    is.durum = "paket_katman"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "paket_katman") {
    is.paketSonuc = is.paketSonuc || {};
    if (!is.paketSonuc.katman) { const r = await bekle(is.paketFal); if (r) { if (r.hata || !r.video) throw new Error(`yazı katmanı videoya çevrilemedi: ${r.hata || "yok"}`); is.paketSonuc.katman = r.video; } }
    if (!is.paketSonuc.video) { const r = await bekle(is.paketFal2); if (r) { if (r.hata || !r.video) throw new Error(`video küçültülemedi: ${r.hata || "yok"}`); is.paketSonuc.video = r.video; } }
    if (!is.paketSonuc.katman || !is.paketSonuc.video) return;
    is.paketFal = await falGonder(env, VIDEO_YAZI.karisim, { top_video_url: is.paketSonuc.katman, bottom_video_url: is.paketSonuc.video, blend_mode: is.paketMod || VIDEO_YAZI.mod, opacity: 1, shortest: true });
    is.durum = "paket_birlestir"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "paket_birlestir") {
    const r = await bekle(is.paketFal); if (!r) return;
    if (r.hata || !r.video) throw new Error(`yazı videoya basılamadı: ${r.hata || "yok"}`);
    // 4 Kasım (Patron: "iPhone'a kaydedilemiyor"): sessiz video Telegram'da GIF'e dönüşüyor → sessiz ses izi eklenir (MP4, H.264, yuv420p)
    is.paketFal = await falGonder(env, "fal-ai/ffmpeg-api/merge-audio-video", { video_url: r.video, audio_url: await sessizSes(env), start_offset: 0 });
    is.durum = "paket_ses"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "paket_ses") {
    const r = await bekle(is.paketFal); if (!r) return;
    if (r.hata || !r.video) throw new Error(`videoya ses izi eklenemedi: ${r.hata || "yok"}`);
    is.paket.video = r.video; is.paketSonuc = null;
    is.maliyet = yuvarla((is.maliyet || 0) + VIDEO_YAZI.fiyat); await harcamaYaz(env, VIDEO_YAZI.fiyat, simdi, "fal", is.kod);
    is.gecmis.push([simdi, `paket hazır: ${MARKALAR[marka].ad} · ${is.kod} (fotoğraflar + videonun tamamı, sağ alt)`]);
    if (is.paketKontrol) { // Claude Code kontrolü (tek seferlik): video KV'ye kopyalanır, Patron'a/Kemal'e "paketBitir" komutuyla gider
      const vr = await fetch(r.video); if (vr.ok) is.paketKopya = await medyaKaydet(env, await vr.arrayBuffer(), "video/mp4");
      is.durum = "paket_kontrol"; return;
    }
    if (is.paketOnayIste) { await paketOnizleme(env, is, marka); is.durum = "paket_onay"; return; }
    await teslimEt(env, is, simdi);
    await instagramGonder(env, is);
    await yaz(env, murat(env), `📦 ${is.kod}: paket hazır — video ("${MARKALAR[marka].ad} · ${is.kod}" baştan sona sağ altta) + fotoğraf seti + askı ön/arka + 2 detay kolajı${(is.adSonuc && is.adSonuc.eksik.length) ? ` (eksik: ${is.adSonuc.eksik.join(", ")})` : ""}. Kemal şimdi TEK ALBÜM + TEK ONAY ile SON YAYIN kartını getirecek; siz onaylamadan kanala/siteye gitmez.`);
  }
}
// Patron'a ÖNCE ayrı: damgalı video + (varsa) gerçek askı fotoğrafı. Video dosya olarak yüklenir (adresle 20 MB sınırı).
async function patronaPaketGonder(env, is, marka) {
  const p = is.paket || {};
  const ad = MARKALAR[marka] ? MARKALAR[marka].ad : marka;
  const v = await tgDosya(env, "sendVideo", "video", p.video, { chat_id: murat(env), caption: `🎬 ${is.kod} — damgalı video ("${ad} · ${is.kod}" baştan sona sağ altta)`, supports_streaming: true });
  is.paketGonderim = { video: Boolean(v && v.ok), hata: v && !v.ok ? String(v.description || "?").slice(0, 200) : null };
  if (p.set && p.set.aski) { const f = await tgDosya(env, "sendPhoto", "photo", p.set.aski, { chat_id: murat(env), caption: `🧷 ${is.kod} — gerçek askı fotoğrafınız, boydan, sadece "${ad} · ${is.kod}" basıldı` }); is.paketGonderim.aski = Boolean(f && f.ok); }
  else { await yaz(env, murat(env), `🧷 ${is.kod}: askı fotoğrafı kayıtlı değil — yapay zekâyla üretilmez. Göndermek için fotoğrafı "${is.kod} askı" yazısıyla atın.`); is.paketGonderim.aski = false; }
  if (!is.paketGonderim.video) await yaz(env, murat(env), `⚠️ ${is.kod}: damgalı video Telegram'a gönderilemedi (${is.paketGonderim.hata}). Kemal'in kartı yine de gelecek; sorun sürerse Claude Code'a bildirin.`);
}

// Sessiz ses (WAV, 20 sn, 16 kHz mono) — bir kez KV'ye, süresiz
async function sessizSes(env) {
  const anahtar = "5e5512" + "0".repeat(26);
  const url = `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${anahtar}`;
  if (await env.KAYIT.get(`pelinmedya:${anahtar}`, "arrayBuffer")) return url;
  const hz = 16000, n = hz * 20, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const yazS = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  yazS(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); yazS(8, "WAVE"); yazS(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); yazS(36, "data"); v.setUint32(40, n * 2, true);
  await env.KAYIT.put(`pelinmedya:${anahtar}`, b, { metadata: { tur: "audio/wav" } });
  return url;
}
// Önizleme (Patron önce görsün; "pd:o" → Kemal kartı): tek albüm + onay düğmesi
async function paketOnizleme(env, is, marka) {
  const p = is.paket || {}, ad = MARKALAR[marka] ? MARKALAR[marka].ad : marka;
  const ekler = p.ekler || [];
  // 4 Kasım (Patron: "istenmeden yeni video" sanıldı): önizlemede video TEKRAR GÖNDERİLMEZ, sadece yeni görseller
  const media = ekler.map((x) => ({ type: "photo", media: x.url })).slice(0, 10).map((m, i) => ({ ...m, ...(i === 0 ? { caption: `👀 ${is.kod} — ${ekler.map((x) => x.ad).join(", ")} ("${ad} · ${is.kod}"). Video aynı, yeniden üretilmedi.` } : {}) }));
  let g = media.length > 1 ? await tg(env, "sendMediaGroup", { chat_id: murat(env), media }) : null;
  if (g && !g.ok && p.video) g = await tg(env, "sendMediaGroup", { chat_id: murat(env), media: media.filter((m) => m.type === "photo").map((m, i) => (i === 0 ? { ...m, caption: media[0].caption } : m)) });
  return yaz(env, murat(env), [`🧷 ${is.kod}: askı ön/arka ve detay kolajları GERÇEK fotoğraftan (elbise yeniden çizilmedi; manken silindi, beyaz fon, sade askı).`, (is.adSonuc && is.adSonuc.eksik.length) ? `Eksik: ${is.adSonuc.eksik.join(", ")}` : "", "Uygunsa Kemal tüm paketle (tek albüm) YENİ SON YAYIN ONAYI kartını getirir; eski kart geçersiz."].filter(Boolean).join("\n"),
    { reply_markup: { inline_keyboard: [[{ text: "✅ Uygun → Kemal kartı", callback_data: `pd:o:${is.id}` }, { text: "❌ Uygun değil", callback_data: `pd:x:${is.id}` }]] } });
}
async function instagramGonder(env, is) {
  const f = is.paket && is.paket.formatlar; if (!f) return;
  await tg(env, "sendMediaGroup", { chat_id: murat(env), media: Object.entries(f).map(([ad, u], i) => ({ type: "photo", media: u, ...(i === 0 ? { caption: `📱 ${is.kod} Instagram için (ücretsiz kırpım): ${Object.keys(f).join(" · ")}` } : {}) })) }).catch(() => null);
}
async function paketOnayDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id] = cq.data.split(":");
  const is = await oku(env, `pelin:is:${id}`, null);
  if (!is || is.durum !== "paket_onay") return cevap("Bu kart artık geçerli değil.");
  const kapat = (text) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (islem === "x") { is.durum = "onaylandi"; is.gecmis.push([simdi, "askı/detay Patron: uygun değil"]); await kaydet(env, `pelin:is:${id}`, is); await cevap("Tamam"); return kapat(`❌ ${is.kod}: askı/detay uygun bulunmadı — Kemal kartı gönderilmedi. Ne değişsin, yazın.`); }
  is.paketOnayIste = false;
  await teslimEt(env, is, simdi);
  await instagramGonder(env, is);
  await cevap("Kemal'e gönderildi");
  return kapat(`✅ ${is.kod}: uygun — Kemal tüm paketle (tek albüm) YENİ SON YAYIN ONAYI kartını getiriyor.`);
}

// 4 Kasım (Patron): video üretilmeden önce başlangıç fotoğrafı Patron'a gösterilir; onaylarsa video
const fotoOnayiGerek = (is) => !is.fotoOnaylandi && !is.kaynakIs;
async function fotoOnayKarti(env, is) {
  const kare = is.sahne || is.foto;
  const n = 1 + (is.takipciler || []).length;
  const fiyat = ARACLAR[is.arac] ? yuvarla(ARACLAR[is.arac].saniye * URETIM_SN * n) : 0;
  await tg(env, "sendPhoto", { chat_id: murat(env), photo: kare, caption: `📸 ${is.kod} — videonun başlangıç fotoğrafı (kontrolden geçti${is.fotoKontrol && is.fotoKontrol.puan && is.fotoKontrol.puan.pelin ? `, puan ${is.fotoKontrol.puan.pelin}` : ""})` });
  return yaz(env, murat(env), [`👁 ${is.kod}: önce ÖN fotoğraf onayı. Uygunsa diğer açılar (sağ yan, sol yan, arka ~${para(SET_FIYAT)}; askı = sizin gerçek fotoğrafınız, ücretsiz) ve video üretilir${n > 1 ? ` (${n} video)` : ""}: ${ARACLAR[is.arac] ? ARACLAR[is.arac].ad : "?"} ~${para(fiyat)}.`, ...notSatirlari(is), "Uygun değilse 🔄 yeniden fotoğraf (~0,15 $) ya da ❌ iptal."].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Fotoğraf uygun, videoya geç", callback_data: `pu:f:${is.id}` }], [{ text: "🔄 Yeniden fotoğraf", callback_data: `pu:r:${is.id}` }, { text: "❌ İptal", callback_data: `pu:x:${is.id}` }]] } });
}
async function falIsle(env, is, uc, girdi, fiyat, simdi, hf = false) {
  const bugun = await bugunHarcanan(env, simdi), gs = await gunlukSinir(env, simdi);
  if (bugun + fiyat > gs) throw new Error(`GÜNLÜK SINIR: bugün Pelin ~${para(bugun)} harcadı, bu adım ${para(fiyat)} → günlük ${gs} $ aşılır; durdum, Patron'a soruyorum`);
  if (is.grup && is.butce) {
    const { t } = await grupHarcamasi(env, is.grup);
    if (t + fiyat > is.butce) throw new Error(`BÜTÇE: şimdiye kadar ~${para(t)}, bu adım ${para(fiyat)} → ${is.butce} $ sınırı aşılır; durdum, Patron'a soruyorum`);
  }
  is.fal = hf ? await hfGonder(env, uc, girdi) : await falGonder(env, uc, girdi);
  is.falFiyat = fiyat; is.falTur = hf ? "hf" : "fal"; is.maliyet = yuvarla(is.maliyet + fiyat); is.bekleZaman = simdi;
  await harcamaYaz(env, fiyat, simdi, is.falTur, is.kod);
}
// Higgsfield aracı çalışmazsa aynı kareyle fal.ai yedeği (bir kez; deneme sayılmaz)
// 13 Kasım (Patron, kural 67): araç hatasında otomatik yeniden gönderim / araç değiştirme YOK
export const TEKRAR_YOK = "kendiliğinden yeniden gönderilmedi, karar sizde";
async function hataVenoma(env, is, asama, simdi) {
  await defterIs(env, "pelin", `${asama} hatası: ${falHataTr(is.hamHata)} — kendiliğinden yeniden gönderilmedi (Patron kararı bekliyor)`, { kod: is.kod }).catch(() => null);
  try { const l = (await env.KAYIT.get("venom:pelinHata", "json")) || []; await env.KAYIT.put("venom:pelinHata", JSON.stringify([...l, { kod: is.kod, id: is.id || null, asama, hata: String(falHataTr(is.hamHata)).slice(0, 200), zaman: simdi }].slice(-20)), { expirationTtl: 7 * 86400 }); } catch { /* bildirim yazılamazsa iş yine durur */ }
}
// eslint-disable-next-line no-unused-vars
function hfYedegeGec(is, arac, neden, simdi) {
  const y = ARACLAR[arac] && ARACLAR[arac].yedek;
  if (!y || !ARACLAR[y] || is.hfYedek || is.hfYedekYok) return false;
  is.gecmis.push([simdi, `${ARACLAR[arac].ad} çalışmadı (${neden}) → aynı kareyle fal.ai ${ARACLAR[y].ad}`]);
  Object.assign(is, { arac: y, hfYedek: { from: arac, neden }, videoDeneme: Math.max(0, is.videoDeneme - 1), durum: "video_gonder" });
  return true;
}
async function uretimAdimi(env, is, simdi) {
  const secim = await oku(env, "pelin:secim", null);
  const yuz = yuzAdres(env, seriYuzu(secim, is.seri || "kucuk"));
  const arac = is.arac || aracSec(secim);
  const bekle = async () => {
    const s = await falDurum(env, is.fal).catch((e) => ({ bitti: false, hata: String(e.message) }));
    if (!s.bitti) { if (simdi - is.bekleZaman > 3 * 3600) return { hata: "3 saatte bitmedi" }; return null; }
    if (s.hata) { await harcamaYaz(env, -is.falFiyat, simdi, is.falTur || "fal", is.kod); is.maliyet = yuvarla(is.maliyet - is.falFiyat); }
    return s;
  };
  if (is.durum === "foto_gonder") {
    is.fotoDeneme++;
    await falIsle(env, is, GORSEL.duzenle, { prompt: renkDuzeltmesi(is, uretimFotoIstemi(is.ortam, is.sablon, is)), ...(is.boy ? { system_prompt: boySistem(is.boy) } : {}), image_urls: [yuz, ...is.urunler.slice(0, 3), ...(is.boyRef || [])], num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" }, GORSEL.fiyat, simdi);
    is.durum = "foto_bekle"; return;
  }
  if (is.durum === "foto_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.hamHata = String(s.hata).slice(0, 400); is.durum = "uyari"; is.sorunlar = [`fotoğraf üretilemedi: ${falHataTr(s.hata)} — ${TEKRAR_YOK}`]; await hataVenoma(env, is, "fotoğraf", simdi); return; }
    is.foto = s.resimler[0];
    const k = await kaliteKontrol(env, is.urunler, [is.foto], simdi, { renk: is.renk, boy: is.boy, yuz: Boolean(is.sahneAyar), astar: is.modelKaydi && is.modelKaydi.astarTr, kural: is.modelKaydi && is.modelKaydi.kuralTr });
    notEkle(is, k);
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    if (!k.gecti && renkKaymasi(k)) is.renkKaydi = (is.renkKaydi || 0) + 1; // 4 Kasım: renk kayması → yeniden üretimde renk düzeltme notu (Patron'a gelmeden)
    is.fotoKontrol = k; is.gecmis.push([simdi, `foto ${is.fotoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = is.videoOrtam && (is.sahneAyar || !is.sablon) ? "sahne_gonder" : fotoOnayiGerek(is) ? "foto_onay" : "video_gonder"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.fotoDeneme < denemeSiniri(is) ? "foto_gonder" : "uyari"; return;
  }
  // Video başlangıç karesi (video ortamı, ör. "Live Your Life Şehir"): katalog fotoğrafından ayrı, aynı yüz + aynı kıyafet
  if (is.durum === "sahne_gonder") {
    is.sahneDeneme = (is.sahneDeneme || 0) + 1;
    await falIsle(env, is, GORSEL.duzenle, { prompt: renkDuzeltmesi(is, sahneIstemi(is.videoOrtam, is)), ...(is.boy ? { system_prompt: boySistem(is.boy) } : {}), image_urls: [yuz, ...is.urunler.slice(0, 3), ...(is.boyRef || [])], num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" }, GORSEL.fiyat, simdi);
    is.durum = "sahne_bekle"; return;
  }
  if (is.durum === "sahne_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) { is.hamHata = String(s.hata).slice(0, 400); is.durum = "uyari"; is.sorunlar = [`video karesi üretilemedi: ${falHataTr(s.hata)} — ${TEKRAR_YOK}`]; await hataVenoma(env, is, "video karesi", simdi); return; }
    is.sahne = s.resimler[0];
    const k = await kaliteKontrol(env, is.urunler, [is.sahne], simdi, { renk: is.renk, boy: is.boy, yuz: true, astar: is.modelKaydi && is.modelKaydi.astarTr, kural: is.modelKaydi && is.modelKaydi.kuralTr });
    notEkle(is, k);
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    if (!k.gecti && renkKaymasi(k)) is.renkKaydi = (is.renkKaydi || 0) + 1;
    is.sahneKontrol = k; is.gecmis.push([simdi, `video karesi ${is.sahneDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = fotoOnayiGerek(is) ? "foto_onay" : "video_gonder"; return; }
    is.sorunlar = k.sorunlar; is.durum = is.sahneDeneme < denemeSiniri(is) ? "sahne_gonder" : "uyari"; return;
  }
  if (is.durum === "set_gonder") {
    const on = is.sahne || is.foto;
    is.setFal = []; is.set = {};
    for (const a of ACILAR) {
      if (a.gercek) { is.set[a.k] = (await gercekAskiFoto(env, is.kod, is.renk)) || "yok"; continue; } // ücretsiz, üretim yok
      const urunler = is.urunler.slice(0, 3);
      const g = { prompt: aciIstemi(a, is), image_urls: [on, ...urunler], num_images: 1, aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg" };
      const f = await falGonder(env, GORSEL.duzenle, g);
      is.setFal.push({ k: a.k, f });
      is.maliyet = yuvarla(is.maliyet + GORSEL.fiyat); await harcamaYaz(env, GORSEL.fiyat, simdi, "fal", is.kod);
    }
    is.durum = "set_bekle"; is.bekleZaman = simdi; return;
  }
  if (is.durum === "set_bekle") {
    for (const x of is.setFal || []) {
      if (is.set[x.k]) continue;
      const r = await falDurum(env, x.f).catch(() => ({ bitti: false }));
      if (r.bitti) is.set[x.k] = (r.resimler && r.resimler[0]) || "yok";
    }
    if ((is.setFal || []).some((x) => !is.set[x.k]) && simdi - is.bekleZaman < 3600) return;
    const media = [{ type: "photo", media: is.sahne || is.foto, caption: `${is.kod} · ön` }, ...ACILAR.filter((a) => is.set[a.k] && is.set[a.k] !== "yok").map((a) => ({ type: "photo", media: is.set[a.k], caption: `${is.kod} · ${a.ad}` }))];
    await tg(env, "sendMediaGroup", { chat_id: murat(env), media });
    const eksik = ACILAR.filter((a) => !is.set[a.k] || is.set[a.k] === "yok").map((a) => a.ad);
    await yaz(env, murat(env), `📸 ${is.kod} fotoğraf seti: ön + ${ACILAR.length - eksik.length} açı${eksik.length ? ` (üretilemedi: ${eksik.join(", ")})` : ""}. ${is.video ? "Şimdi marka yazısı basılıyor; ardından Kemal son yayın onay kartını getirecek." : "Video üretiliyor."}`);
    is.gecmis.push([simdi, `fotoğraf seti: ${media.length} kare`]);
    is.setTamam = true;
    is.durum = is.video ? "paket_gonder" : "video_gonder"; return; // video zaten varsa (sonradan set): paketlemeye
  }
  // Müzik (deneme): sessiz videonun üstüne müzik (fal ffmpeg merge-audio-video); sessiz hali saklanır → müzik sonra değiştirilebilir
  if (is.durum === "muzik_gonder") {
    is.videoSessiz = is.videoSessiz || is.video;
    is.fal = await falGonder(env, "fal-ai/ffmpeg-api/merge-audio-video", { video_url: is.videoSessiz, audio_url: is.muzik.url, start_offset: 0 });
    is.falFiyat = 0.01; is.bekleZaman = simdi; await harcamaYaz(env, 0.01, simdi);
    is.durum = "muzik_bekle"; return;
  }
  if (is.durum === "muzik_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata || !s.video) { is.hamHata = String(s.hata || "video yok").slice(0, 400); is.muzikHata = falHataTr(s.hata || "video yok"); is.video = is.videoSessiz; is.durum = "onay"; return; }
    is.video = s.video; is.muzikEklendi = true; is.gecmis.push([simdi, `müzik eklendi: ${is.muzik.ad}`]); is.durum = "onay"; return;
  }
  // Nora: video yeni işlerde ancak Patron senaryoyu onaylayınca üretilir
  // 4 Kasım (Patron): HER YOLDA önce fotoğraf seti, sonra video ("Yine de onayla" yolu seti atlıyordu)
  if (is.durum === "video_gonder" && !is.video && !is.setYok && !is.setTamam && !is.kaynakIs && !is.lider) { is.durum = "set_gonder"; return; }
  if (is.durum === "video_gonder" && is.sahneAyar && !is.senaryo) { is.durum = "senaryo_yaz"; return; }
  if (is.durum === "senaryo_yaz") {
    is.senaryo = await noraYaz(env, is, simdi);
    await defterIs(env, "nora", `senaryo (${is.kod}) — tam metin: ${(typeof is.senaryo === "string" ? is.senaryo : JSON.stringify(is.senaryo)).slice(0, 3500)}`, { kod: String(is.kod) }).catch(() => null); // 13 Kasım (TEK DEFTER): Nora'nın senaryosu tam metin
    is.durum = "senaryo_onay";
    await noraKarti(env, is.id, [is], simdi);
    return;
  }
  if (is.durum === "video_gonder") {
    if (ARACLAR[arac].hf && !hfVar(env) && hfYedegeGec(is, arac, "Higgsfield anahtarı yok", simdi)) return;
    is.videoDeneme++;
    const g = { ...videoGirdisi(arac, is.sahne || is.foto), prompt: is.sahneAyar ? yeniVideoIstemi(is) : uretimVideoIstemi(is.videoOrtam || is.ortam, is.sablon) };
    const yasak = [is.boy ? boyYasagiVideo(is.boy) : "", is.sahneAyar ? HAREKET_YASAK : ""].filter(Boolean).join(", ");
    if ("negative_prompt" in g) g.negative_prompt = [g.negative_prompt, yasak].filter(Boolean).join(", ");
    else if (ARACLAR[arac].hf && yasak) g.prompt = `${g.prompt} Avoid: ${yasak}.`.slice(0, 2400); // Higgsfield'de negatif alan yok
    try { await falIsle(env, is, ARACLAR[arac].uc, g, yuvarla(ARACLAR[arac].saniye * URETIM_SN), simdi, Boolean(ARACLAR[arac].hf)); } catch (e) {
      if (ARACLAR[arac].hf) { is.hamHata = String(e.message).slice(0, 400); if (hfYedegeGec(is, arac, falHataTr(e.message), simdi)) return; }
      throw e;
    }
    is.durum = "video_bekle"; return;
  }
  if (is.durum === "video_bekle") {
    const s = await bekle(); if (!s) return;
    if (s.hata) {
      is.hamHata = String(s.hata).slice(0, 400);
      // 9 Kasım (Patron): "Pelin videoyu kendiliğinden yeniden üretmesin" — zaman aşımında para iade edilmez; yeniden gönderilmez, Patron karar verir
      if (/3 saatte bitmedi/.test(s.hata)) { is.durum = "uyari"; is.sorunlar = ["video 3 saatte bitmedi — kendiliğinden yeniden üretilmedi (ücret iade edilmemiş olabilir); karar sizde"]; return; }
      // 13 Kasım (Patron, kural 67): hata olursa Pelin kendiliğinden tekrar GÖNDERMEZ, başka araca da GEÇMEZ; Venom'a bildirir, karar Patron'da
      is.durum = "uyari"; is.sorunlar = [`video üretilemedi: ${falHataTr(s.hata)} — ${TEKRAR_YOK}`]; await hataVenoma(env, is, "video", simdi); return;
    }
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
    const sonYazi = is.sahneAyar && is.sahneAyar.sonYazi && !VIDEO_YAZI.sonradan ? is.kod : null;
    const k = kareler.length ? await kaliteKontrol(env, is.urunler, kareler, simdi, { renk: is.renk, sonYazi, astar: is.modelKaydi && is.modelKaydi.astarTr, kural: is.modelKaydi && is.modelKaydi.kuralTr, yon: true }) : { gecti: false, sorunlar: ["video kareleri alınamadı"] };
    notEkle(is, k);
    if (k.gecti && sonYazi && is.kareler[2] && is.kareler[2] !== "yok") { // son kare: küçük VOLONTE + doğru kod, başka yazı/fiyat yok
      const y = await sonKareYazisi(env, is.kareler[2], is.kod, simdi, is.marka).catch((e) => ({ tamam: false, sorun: `son kare okunamadı: ${String(e.message).slice(0, 80)}` }));
      is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN);
      if (!y.tamam) { k.gecti = false; k.sorunlar = [...(k.sorunlar || []), y.sorun]; }
    }
    if (k.gecti && is.sahneAyar) is.kapak = is.kareler[1] && is.kareler[1] !== "yok" ? is.kareler[1] : is.sahne || is.foto; // kapak: videonun orta karesi
    is.maliyet = yuvarla(is.maliyet + KONTROL_TAHMIN + (env.OPENAI_API_KEY ? OPENAI_TAHMIN : 0));
    is.videoKontrol = k; is.gecmis.push([simdi, `video ${is.videoDeneme}: ${k.gecti ? "geçti" : `geçmedi (${k.sorunlar.join("; ").slice(0, 200)})`}`]);
    if (k.gecti) { is.durum = is.muzik && !is.muzikEklendi ? "muzik_gonder" : "onay"; return; }
    is.sorunlar = k.sorunlar; is.durum = "uyari"; return; // 4 Kasım (Patron): video kendi kendine YENİDEN ÜRETİLMEZ; Patron karar verir
  }
}
const isKlavye = (id, sablon = false, uyari = false, digerAraclar = [], deneme = false) => ({ inline_keyboard: [[{ text: uyari ? "✅ Yine de onayla" : deneme ? "💾 Beğendim (yayına gitmez)" : "✅ Onayla", callback_data: `pu:a:${id}` }, { text: "🔄 Yeniden üret", callback_data: `pu:r:${id}` }, { text: "❌ İptal", callback_data: `pu:x:${id}` }], ...(sablon ? [[{ text: "💾 Bu ayarları şablon olarak kaydet", callback_data: `pu:s:${id}` }]] : []),
  ...(digerAraclar.length ? [digerAraclar.map((a) => ({ text: `🎬 ${ARACLAR[a].ad.replace(/ \(.*\)/, "")} ile de dene (${para(ARACLAR[a].saniye * URETIM_SN)})`, callback_data: `pu:k:${id}:${a}` }))] : [])] });
const KARSILASTIRMA = KART_ARACLARI;
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
// Teslim (4 Kasım): Patron "✅ Onayla" dedi → StokDO kuyruğu "pelinKanal": Kemal kanala paylaşır, sonra Selin siteye ekler.
// DENEME (yayinYok) işler buraya HİÇ gelmez. v: 2 = yeni düzen kaydı (eski KV "venom:pelinTeslim" kayıtları önce Patron'a sorulur).
async function teslimEt(env, is, simdi) {
  if (is.yayinYok) throw new Error("deneme iş yayına gönderilemez");
  const engel = await markaEngeli(env, is);
  if (engel) throw new Error(engel);
  is.durum = "onaylandi"; is.onayZaman = simdi;
  await kaydet(env, `pelin:is:${is.id}`, is);
  const p = is.paket || {};
  const kayit = { v: 3, yayinOnayi: true, id: is.id, kod: is.kod, marka: p.marka || is.marka || null, foto: p.foto || is.foto, video: p.video || is.video, kapak: p.kapak || is.kapak || null, set: [...ACILAR.map((a) => p.set && p.set[a.k] ? { ad: a.ad, url: p.set[a.k] } : null).filter(Boolean), ...(p.ekler || [])], renk: is.renk || null, ortam: is.ortam ? is.ortam.ad : null, deneme: false, onay: "patron-uretim", zaman: simdi };
  await kuyrugaEkle(env, "pelinKanal", kayit);
  try { await arsivle(env, is, kayit, simdi); } catch (e) { await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: simdi, yol: "arsiv", hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
}
// Eski teslim kayıtları (KV "venom:pelinTeslim", okuyucu kod yokken birikti): OTOMATİK GÖNDERİLMEZ, Patron'a sorulur
async function eskiTeslimSor(env, simdi) {
  const l = (await env.KAYIT.get("venom:pelinTeslim", "json")) || [];
  if (!l.length) return;
  await env.KAYIT.put("venom:pelinTeslim", "[]");
  for (const x of l) {
    const id = kisaId();
    await kaydet(env, `pelin:teslimSoru:${id}`, x, 14 * 86400);
    if (x.video) await tg(env, "sendVideo", { chat_id: murat(env), video: x.video, caption: `🎬 ${x.kod} (bekleyen eski teslim)` });
    await yaz(env, murat(env), `📦 Bekleyen eski teslim: ${x.kod}${x.renk ? ` · ${x.renk}` : ""} · onay ${tarihSaatYaz(x.zaman || simdi)}.\nBu video ve kapak fotoğrafı kanala (Kemal) ve siteye (Selin) gönderilsin mi? Siz demeden gitmez.`,
      { reply_markup: { inline_keyboard: [[{ text: "📤 Evet, yayınla", callback_data: `pt:y:${id}` }, { text: "❌ Gönderme", callback_data: `pt:n:${id}` }]] } });
  }
}
async function eskiTeslimDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, id] = cq.data.split(":");
  const x = await oku(env, `pelin:teslimSoru:${id}`, null);
  if (!x) return cevap("Bu soru artık geçerli değil.");
  await env.KAYIT.delete(`pelin:teslimSoru:${id}`);
  const kapat = (text) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (islem !== "y") { await cevap("Gönderilmedi"); return kapat(`❌ ${x.kod}: eski teslim gönderilmedi.`); }
  await kuyrugaEkle(env, "pelinKanal", { ...x, v: 2, id: x.id || `eski-${id}`, deneme: false, onay: "patron (eski kayıt)", zaman: simdi });
  await cevap("Yayına alındı");
  return kapat(`📤 ${x.kod}: yayına alındı — önce Kemal kanala, sonra Selin siteye ekler; sonuç mesajı gelecek.`);
}
async function ogrenmeYaz(env, kayit) {
  const l = await oku(env, "pelin:ogrenme", []);
  l.push(kayit);
  await kaydet(env, "pelin:ogrenme", l.slice(-60));
}
async function videoGonder(env, is, caption) {
  let r = await tg(env, "sendVideo", { chat_id: murat(env), video: is.video, caption, supports_streaming: true });
  if (!r.ok) r = await tg(env, "sendDocument", { chat_id: murat(env), document: is.video, caption });
  if (!r.ok) r = await yaz(env, murat(env), `${caption}\n(video Telegram'a yüklenemedi; bağlantı: ${is.video})`);
  return r;
}
async function isBildir(env, is) {
  const sonuc = [];
  const tgK = async (metod, govde, ad) => { const r = await tg(env, metod, govde); sonuc.push([ad, Boolean(r && r.ok), r && r.ok ? null : String((r && r.description) || "?").slice(0, 120)]); return r; };
  try { return await isBildirIc(env, is, tgK, sonuc); } finally {
    is.bildirim = { zaman: Math.floor(Date.now() / 1000), sonuc };
    if (sonuc.some(([, ok]) => !ok)) await env.KAYIT.put("pelin:hata", JSON.stringify({ zaman: is.bildirim.zaman, yol: `bildir ${is.id}`, hata: JSON.stringify(sonuc).slice(0, 400) }), { expirationTtl: 7 * 86400 });
  }
}
async function isBildirIc(env, is, tgK, sonuc) {
  const ust = `${is.kod} · ${is.seri === "buyuk" ? "büyük seri" : "küçük seri"} · ${is.ortam ? is.ortam.ad : "stüdyo"}${is.videoOrtam ? ` / video ${is.videoOrtam.ad}` : ""}${is.sablon ? ` · şablon ${is.sablon.ad}` : ""} · foto ${is.fotoDeneme}. deneme, video ${is.videoDeneme}. deneme`;
  if (is.durum === "uyari") {
    if (is.foto) await tgK("sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `⚠️ ${is.kod}: ${denemeSiniri(is)} denemede kalite kontrolünden geçmedi.` }, "foto");
    if (is.sahne) await tgK("sendPhoto", { chat_id: murat(env), photo: is.sahne, caption: `🎞 ${is.kod} (video karesi)` }, "sahne");
    if (is.video) { const v = await videoGonder(env, is, `🎬 ${is.kod}`); sonuc.push(["video", Boolean(v && v.ok), v && v.ok ? null : "gönderilemedi"]); }
    const devam = devamAsamasi(is);
    return yaz(env, murat(env), [`⚠️ ${ust}`, "Büyük farklar:", ...(is.sorunlar || []).slice(0, 6).map((s) => `• ${s}`), ...notSatirlari(is), puanSatiri(is),
      devam === "teslim" ? "Beğendiyseniz ✅ Yine de onayla: teslim kuyruğuna alınır (son söz sizde)." : devam ? `Beğendiyseniz ✅ Yine de onayla: bu fotoğrafla devam ederim (${devam === "sahne_gonder" ? "video karesi + video" : "video"}).` : "Fotoğraf üretilemedi; yeniden üretin ya da iptal edin."].filter(Boolean).join("\n"), { reply_markup: isKlavye(is.id, false, true) });
  }
  if (is.foto) await tgK("sendPhoto", { chat_id: murat(env), photo: is.foto, caption: `📸 ${is.kod} (katalog)` }, "foto");
  if (is.sahne) await tgK("sendPhoto", { chat_id: murat(env), photo: is.sahne, caption: `🎞 ${is.kod} (video karesi)` }, "sahne");
  if (is.video) { const v = await videoGonder(env, is, `🎬 ${is.kod}${is.arac ? ` — ${ARACLAR[is.arac].ad}` : ""}`); sonuc.push(["video", Boolean(v && v.ok), v && v.ok ? null : "gönderilemedi"]); }
  if (is.kapak) await tgK("sendPhoto", { chat_id: murat(env), photo: is.kapak, caption: `🖼 ${is.kod} kapak (videodan)` }, "kapak");
  const kk = (k) => (k ? `Pelin ${k.claude ? "✅" : "❌"} · ChatGPT ${k.openai === true ? "✅" : k.openai === false ? "❌" : k.openai}` : "—");
  if ((await oku(env, "pelin:ayar", {})).hemraOnay && hemra(env)) {
    if (is.video) await tg(env, "sendVideo", { chat_id: hemra(env), video: is.video, caption: `🎬 ${is.kod} — Pelin önizlemesi` });
    await yaz(env, hemra(env), `👁 ${is.kod} önizlemesi. Uygunsa ✅ Onayla (Patron da görüyor).`, { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:a:${is.id}` }]] } });
  }
  const gunlukH = await bugunHarcanan(env, Math.floor(Date.now() / 1000)).catch(() => 0);
  const metinSonuc = await yaz(env, murat(env), [`👁 ÖNİZLEME — ${ust}`, `💵 Bu iş: ~${para(is.maliyet || 0)} · bugün Pelin: ${para(gunlukH)} / ${await gunlukSinir(env, Math.floor(Date.now() / 1000)).catch(() => GUNLUK_SINIR_USD)} $`, `Kalite kontrol: foto ${kk(is.fotoKontrol)} | video ${kk(is.videoKontrol)}${is.sahneAyar && is.sahneAyar.sonYazi ? " · son kare yazısı ✅" : ""}${(is.patronOnay || []).length ? " · ⚠️ bir aşama Patron onayıyla geçti" : ""}`, puanSatiri(is), ...notSatirlari(is), `Ürün fotoğrafı: ${is.urunKaynak === "patron" ? "sizin gönderdiğiniz" : "site"}${is.renk ? ` · renk ${is.renk}` : ""}${is.boy ? ` · boy ${BOYLAR[is.boy.boy].ad}${(is.boyRef || []).length ? " (referanslı)" : ""}` : ""}`, `Video aracı: ${ARACLAR[is.arac || VARSAYILAN_ARAC].ad}${is.sablonKey && SABLON_SECENEK[is.sablonKey] ? ` · şablon: ${SABLON_SECENEK[is.sablonKey].ad}` : ""}${is.stil ? ` · aksesuar: ${is.stil.aksesuarTr}` : ""}${is.seviye === "premium" ? " · PREMIUM" : ""}`, ...(is.muzik ? [is.muzikEklendi ? `🎵 Müzik: ${is.muzik.ad} (sessiz hali saklı; müzik sonra değiştirilebilir)` : `🎵 Müzik eklenemedi: ${is.muzikHata || "bilinmiyor"} (video sessiz)`] : []),
    ...(is.aracYedek && (is.gecmis || []).some((g) => /işleyemedi .*→ aynı kareyle Kling 4\.0/.test(String(g[1]))) ? ["↪️ Veo bu istemi işleyemedi; aynı kareyle Kling 4.0 kullanıldı."] : []),
    ...(is.hfYedek ? [`↪️ ${ARACLAR[is.hfYedek.from].ad} çalışmadı (${is.hfYedek.neden}); aynı fotoğrafla fal.ai ${ARACLAR[is.arac].ad} kullanıldı.`] : []),
    is.yayinYok ? "🧪 DENEME — kanala ve siteye HİÇ GİTMEZ (kural). Beğenirseniz saklanır; yayın için normal üretim yapılır." : "✅ Onayla = ÜRETİM onayı (yayın değil): fotoğraf seti + marka yazısı eklenir, sonra Kemal SON YAYIN onay kartını getirir. Beğendiyseniz ayarları şablon olarak kaydedin."].join("\n"), { reply_markup: isKlavye(is.id, Boolean(is.sahneAyar), false, is.video && (is.sahne || is.foto) && !is.karsilastirma && !is.yayinYok && !is.grup ? KARSILASTIRMA.filter((a) => a !== (is.arac || VARSAYILAN_ARAC) && !((is.aracYasak || []).includes(a))) : [], Boolean(is.yayinYok)) });
  sonuc.push(["metin", Boolean(metinSonuc && metinSonuc.ok), metinSonuc && metinSonuc.ok ? null : String((metinSonuc && metinSonuc.description) || "?").slice(0, 120)]);
  return metinSonuc;
}
export async function uretimCron(env, simdi) {
  const liste = await oku(env, "pelin:isler", []);
  let islenen = 0;
  for (const id of liste) {
    if (islenen >= 8) break;
    const is = await oku(env, `pelin:is:${id}`, null);
    if (!is || !["foto_gonder", "foto_bekle", "sahne_gonder", "sahne_bekle", "set_gonder", "set_bekle", "video_gonder", "video_bekle", "kare_bekle", "muzik_gonder", "muzik_bekle", "senaryo_yaz", "paket_gonder", "paket_aski", "aski_detay", "paket_kare", "paket_katman", "paket_birlestir", "paket_ses", "video_duzelt", "video_duzelt_ses"].includes(is.durum)) continue;
    islenen++;
    const once = is.durum;
    try { if (/^paket_|^aski_detay$|^video_duzelt/.test(is.durum)) await paketAdimi(env, is, simdi); else await uretimAdimi(env, is, simdi); } catch (e) { is.durum = "uyari"; is.hamHata = String(e && e.message).slice(0, 400); is.sorunlar = [`hata: ${falHataTr(e && e.message)}`]; }
    const yeniBitti = ["onay", "uyari"].includes(is.durum) && !["onay", "uyari"].includes(once);
    if (yeniBitti) await isBildir(env, is);
    if (is.durum === "foto_onay" && once !== "foto_onay") await fotoOnayKarti(env, is);
    await kaydet(env, `pelin:is:${id}`, is);
    if (is.takipciler) { try { await takipcileriBirak(env, is, simdi); } catch (e) { await hataEkle(env, "pelin:takipci", e); } }
    if (yeniBitti && is.grup) { try { await grupOzeti(env, is.grup, simdi); } catch (e) { await hataEkle(env, "pelin:grupOzeti", e); } }
  }
  await testRaporu(env, liste);
}
// ŞABLON DENEMESİ (4 Kasım, Patron onaylı; KV "venom:pelinSablonDeneme" = { kod, arac, sablonlar: [...], butce, senaryolar: { sablon: { tr, hareketEn } } }):
// TEK fotoğraf (başlangıç karesi de o) + aynı araçla her şablona bir video; şablon sadece videonun ortamını/ışığını/temposunu belirler.
// Kalite kontrol yeniden üretmez (deneme 1), Higgsfield hata verirse fal'a geçmez, grup bütçesi aşılacaksa durur ve sorar, DENEME: yayına gitmez.
export async function sablonDenemesi(env, p, simdi) {
  const secim = await oku(env, "pelin:secim", null), sablonlar = await oku(env, "pelin:sablonlar", {});
  const kod = String(p.kod), arac = p.arac, anahtarlar = (p.sablonlar || []).filter((k) => SABLON_SECENEK[k]);
  if (!secim || !ARACLAR[arac] || !anahtarlar.length) return yaz(env, murat(env), `⚠️ Şablon denemesi başlamadı (kurulum/araç/şablon eksik).`);
  const b = (await boyOku(env, kod)) || {};
  const renk = b.renk || null;
  const stil = (b.stil && (b.stil[renk || "genel"] || b.stil.genel)) || null;
  const son = await sonSenaryo(env, kod);
  const liste0 = (await oku(env, "pelin:isler", [])).length;
  await uretimBaslat(env, { kodlar: [kod], arac, sablonKey: null, seriler: { [kod]: b.seri || "buyuk" }, renkler: renk ? { [kod]: renk } : {}, stiller: { [kod]: stil }, senaryolar: {}, seviye: "standart" }, simdi);
  const liste = await oku(env, "pelin:isler", []);
  const liderId = liste[liste.length - 1];
  const lider = liste.length > liste0 ? await oku(env, `pelin:is:${liderId}`, null) : null;
  if (!lider || lider.durum === "hata") return yaz(env, murat(env), `⚠️ ${kod} şablon denemesi başlamadı: ${(lider && lider.hata) || "iş oluşturulamadı"}. Para harcanmadı.`);
  const gid = `g-${kisaId()}`;
  const sablonIsi = (x, k) => {
    const sb = SABLON_SECENEK[k].sablonAd && sablonlar[SABLON_SECENEK[k].sablonAd] ? sablonlar[SABLON_SECENEK[k].sablonAd] : null;
    const sen = (p.senaryolar && p.senaryolar[k]) || son;
    return Object.assign(x, { sablonKey: k, videoSahne: sablonOrtami(secim, k, sablonlar), videoSablon: sb ? { ad: sb.ad, isik: sb.isik, hiz: sb.hiz } : null, videoOrtam: null, sablon: null, senaryo: sen ? { tr: sen.tr, hareketEn: sen.hareketEn } : null, kendiSenaryo: true, denemeSiniri: 1, hfYedekYok: true, yayinYok: true, setYok: true, butce: Number(p.butce) || 5, grup: gid });
  };
  sablonIsi(lider, anahtarlar[0]);
  const takip = anahtarlar.slice(1).map((k) => sablonIsi({ ...lider, id: `${kod}-${kisaId()}`, durum: "grup_bekle", lider: lider.id, maliyet: 0, gecmis: [[simdi, `şablon denemesi: ${SABLON_SECENEK[k].ad}, liderin fotoğrafını bekliyor`]] }, k));
  lider.takipciler = takip.map((x) => x.id);
  lider.gecmis = [...(lider.gecmis || []), [simdi, `şablon denemesi (${anahtarlar.map((k) => SABLON_SECENEK[k].ad).join(", ")}) · tek fotoğraf · ${ARACLAR[arac].ad} · bütçe ${lider.butce} $`]];
  for (const x of takip) await kaydet(env, `pelin:is:${x.id}`, x);
  await kaydet(env, `pelin:is:${lider.id}`, lider);
  await kaydet(env, `pelin:grup:${gid}`, { ids: [lider.id, ...takip.map((x) => x.id)], zaman: simdi, tur: "sablon", butce: lider.butce }, 14 * 86400);
  await kaydet(env, "pelin:isler", [...liste, ...takip.map((x) => x.id)].slice(-200));
  const kontrol = KONTROL_TAHMIN + OPENAI_TAHMIN;
  const tahmin = yuvarla(GORSEL.fiyat + kontrol + anahtarlar.length * (ARACLAR[arac].saniye * URETIM_SN + kontrol + KONTROL_TAHMIN + 3 * KARE.saniye * URETIM_SN));
  return yaz(env, murat(env), [
    `🎬 ${kod} ŞABLON DENEMESİ başladı (onayınızla): ${ARACLAR[arac].ad} × ${anahtarlar.map((k) => SABLON_SECENEK[k].ad).join(" · ")}`,
    `Tek katalog fotoğrafı (başlangıç karesi de o) → ${anahtarlar.length} video; şablon her videonun ortamını, ışığını ve temposunu belirler.`,
    `Model kartı: ${SERILER[lider.seri].ad} · ${renk || "renk kayıtlı değil"} · boy ${boyYazi(b)} · astar: ${b.astarTr || "—"}`,
    `Tahmini toplam ~${para(tahmin)} · sınır ${lider.butce} $ (aşılacaksa durur, size sorarım) · kalite kontrol yeniden üretim YAPMAZ`,
    "🧪 DENEME: hiçbiri kanala/siteye gitmez. Videolar önizleme olarak gelir, sonunda yan yana karşılaştırma kartı.",
  ].join("\n"));
}
// ---------- AYNA (4 Kasım, Patron onaylı): Pelin'in işleri ofiste CANLI → KV "venom:pelinDurum" (sadece değişince yazılır) ----------
const CALISAN = ["foto_gonder", "foto_bekle", "sahne_gonder", "sahne_bekle", "set_gonder", "set_bekle", "video_gonder", "video_bekle", "kare_bekle", "muzik_gonder", "muzik_bekle", "senaryo_yaz", "paket_gonder", "paket_aski", "aski_detay", "paket_kare", "paket_katman", "paket_birlestir", "paket_ses", "video_duzelt", "video_duzelt_ses"];
const BEKLEYEN = ["foto_onay", "senaryo_onay", "onay", "uyari", "kart"];
export async function aynaYaz(env, simdi) {
  const liste = await oku(env, "pelin:isler", []);
  const isler = [];
  for (const id of [...liste].reverse().slice(0, 25)) {
    const x = await oku(env, `pelin:is:${id}`, null);
    if (!x || simdi - (x.zaman || 0) > 3 * 86400) continue;
    isler.push({ id: x.id, kod: x.kod, durum: x.durum, arac: x.arac || null, aracAd: ARACLAR[x.arac] ? ARACLAR[x.arac].ad : null, sablon: x.sablonKey && SABLON_SECENEK[x.sablonKey] ? SABLON_SECENEK[x.sablonKey].ad : null, marka: x.marka || null, maliyet: x.maliyet || 0, zaman: x.zaman, foto: x.sahne || x.foto || null, kapak: x.kapak || null, video: x.video || null, deneme: Boolean(x.yayinYok), sorunlar: (x.sorunlar || []).slice(0, 2).map((t) => String(t).slice(0, 160)), son: (x.gecmis || []).slice(-1).map(([t, m]) => ({ t, m: String(m).slice(0, 140) }))[0] || null });
  }
  const sonKartlar = await oku(env, "pelin:sonKartlar", []);
  const acik = [];
  for (const k of await oku(env, "pelin:acikKartlar", [])) {
    if (k.tur === "uretim") { const o = await oku(env, `pelin:uretimOnay:${k.ref}`, null); if (!o || o.kullanildi) continue; }
    const kt = sonKartlar.find((x) => x.mid === k.mid);
    acik.push({ tur: k.tur, ref: k.ref, zaman: k.zaman, baslik: kt ? String(kt.metin).split("\n").slice(0, 2).join(" · ").slice(0, 160) : k.tur });
  }
  const h = await env.KAYIT.get("pelin:hata", "json").catch(() => null);
  const ayna = { isler, acikKartlar: acik, calisan: isler.filter((x) => CALISAN.includes(x.durum)).length, bekleyen: isler.filter((x) => BEKLEYEN.includes(x.durum)).length, bugun: await bugunHarcanan(env, simdi), gunlukSinir: await gunlukSinir(env, simdi), ay: await buAyHarcanan(env, simdi), hata: h && simdi - (h.zaman || 0) < 7200 ? { zaman: h.zaman, yol: h.yol, metin: String(h.hata || "").slice(0, 200) } : null };
  const ozet = JSON.stringify(ayna);
  if (ozet === (await env.KAYIT.get("pelin:aynaSon"))) return false; // KV yazma kotası: sadece değişince
  await env.KAYIT.put("pelin:aynaSon", ozet);
  await env.KAYIT.put("venom:pelinDurum", JSON.stringify({ zaman: simdi, ...ayna }), { expirationTtl: 7 * 86400 });
  // 12 Kasım (TEK DEFTER): Pelin'in her üretim işi ortak defterde TEK satır (ne, kim, marka, durum, kanıt)
  await defterSatir(env, "pelin", isler.map((x) => {
    const calisiyor = CALISAN.includes(x.durum), onayda = BEKLEYEN.includes(x.durum), bitti = !calisiyor && !onayda && x.durum !== "bekle" && x.durum !== "grup_bekle";
    return { id: `pelin:${x.id}`, tur: "uretim", kod: x.kod ? String(x.kod) : null, marka: x.marka || null, ne: "Fotoğraf / video üretimi", kim: onayda ? "Patron" : "Pelin", durum: bitti ? "bitti" : calisiyor || onayda ? "acik" : "beklemede", bot: "pelin", acildi: x.zaman, guncel: simdi,
      kanit: onayda ? "onayınız bekleniyor" : calisiyor ? "üretiliyor" : x.durum === "hata" ? "hata verdi" : x.durum === "iptal" ? "iptal edildi" : bitti ? `bitti (${x.durum})` : "sırada" };
  }), true);
  return true;
}
// ---------- MARKA RAPORU (4 Kasım, Patron): SADECE RAPOR — hiçbir şey silinmez/değiştirilmez ----------
// KV "venom:pelinMarkaRapor" = 1 → site + son 30 gün kanal paylaşımları + model kartları taranır (her çalışmada 30 kod; ücretsiz
// pakette istek sınırı) → "venom:pelinMarkaRaporSonuc" (VOLONTE sitesinde/kanalında BLACK ROSE kodları, belirsizler, yanlış kartlar)
async function markaRaporu(env, simdi) {
  let d = await env.KAYIT.get("venom:pelinMarkaRaporDurum", "json");
  if (!d) {
    if (!(await env.KAYIT.get("venom:pelinMarkaRapor"))) return;
    await env.KAYIT.delete("venom:pelinMarkaRapor");
    const site = (await siteVerisi(env).catch(() => [])).filter((u) => !u.gizli).map((u) => String(u.kod));
    const pay = env.STOK ? ((await stokIste(env, "/paylasimlar", { basla: simdi - 30 * 86400, bitis: simdi + 60 }).catch(() => [])) || []).map((p) => String(p.kod)) : [];
    const kartlar = [];
    try { for (const k of ((await env.KAYIT.list({ prefix: "pelinboy:" })).keys || [])) { const b = await env.KAYIT.get(k.name, "json"); if (b && b.marka) kartlar.push({ kod: k.name.slice(9), marka: b.marka }); } } catch { /* yok */ }
    const kodlar = [...new Set([...site, ...pay, ...kartlar.map((x) => x.kod)])].filter((x) => /^\d{3,6}$/.test(x));
    d = { basla: simdi, kalan: kodlar, site, pay: [...new Set(pay)], kartlar, marka: {} };
  }
  for (const kod of d.kalan.splice(0, 30)) {
    const bilgi = await stokIste(env, "/bilgi", { kod }).catch(() => null);
    d.marka[kod] = [...new Set(((bilgi && bilgi.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))].filter((x) => MARKALAR[x]);
  }
  if (d.kalan.length) { await env.KAYIT.put("venom:pelinMarkaRaporDurum", JSON.stringify(d), { expirationTtl: 86400 }); return; }
  await env.KAYIT.delete("venom:pelinMarkaRaporDurum");
  const ne = (k) => (d.marka[k] || []).join("+") || "yok";
  const sadeceBR = (k) => (d.marka[k] || []).length === 1 && d.marka[k][0] === "BLACKROSE";
  const belirsiz = (k) => (d.marka[k] || []).length !== 1;
  const kuyruk = env.STOK ? await stokIste(env, "/ayar-oku", { k: "kuyruk:pelinKanal" }).catch(() => null) : null;
  const sonuc = {
    zaman: simdi, taranan: Object.keys(d.marka).length,
    siteBlackRose: d.site.filter(sadeceBR), siteBelirsiz: d.site.filter(belirsiz).map((k) => `${k}:${ne(k)}`),
    kanalBlackRose: d.pay.filter(sadeceBR), kanalBelirsiz: d.pay.filter(belirsiz).map((k) => `${k}:${ne(k)}`),
    kartYanlis: d.kartlar.filter((x) => (d.marka[x.kod] || []).length === 1 && d.marka[x.kod][0] !== x.marka).map((x) => `${x.kod}: kart ${x.marka}, depo ${ne(x.kod)}`),
    teslimKuyrugu: (() => { try { return JSON.parse((kuyruk && kuyruk.v) || "[]").map((x) => `${x.kod}${sadeceBR(String(x.kod)) ? " (BLACK ROSE!)" : ""}`); } catch { return []; } })(),
    not: "SADECE RAPOR — hiçbir şey silinmedi/değiştirilmedi",
  };
  await env.KAYIT.put("venom:pelinMarkaRaporSonuc", JSON.stringify(sonuc), { expirationTtl: 14 * 86400 });
}

// HEPSİNİ DENE: lider video aşamasına geçince (fotoğraf/kare kontrolden geçti + senaryo onaylı) takipçiler AYNI fotoğraf,
// kare ve senaryoyla kendi araçlarında videoya başlar. Lider iptal edilirse takipçiler de iptal.
const VIDEO_ASAMASI = ["video_gonder", "video_bekle", "kare_bekle", "muzik_gonder", "muzik_bekle", "onay", "onaylandi"];
export async function takipcileriBirak(env, lider, simdi) {
  const iptal = lider.durum === "iptal";
  const hazir = (lider.foto || lider.sahne) && (lider.senaryo || !lider.sahneAyar) && (VIDEO_ASAMASI.includes(lider.durum) || (lider.durum === "uyari" && lider.video));
  if (!iptal && !hazir) return;
  const liste = await oku(env, "pelin:isler", []);
  for (const tid of lider.takipciler || []) {
    const x = await oku(env, `pelin:is:${tid}`, null);
    if (!x || x.durum !== "grup_bekle") continue;
    if (iptal) Object.assign(x, { durum: "iptal" });
    else Object.assign(x, { durum: "video_gonder", set: lider.set || {}, setTamam: Boolean(lider.setTamam), foto: lider.foto, sahne: lider.sahne || null, videoOrtam: lider.videoOrtam, ortam: lider.ortam, fotoKontrol: lider.fotoKontrol, sahneKontrol: lider.sahneKontrol || null, senaryo: x.kendiSenaryo ? x.senaryo : lider.senaryo, notlar: lider.notlar || [], fotoDeneme: lider.fotoDeneme, sahneDeneme: lider.sahneDeneme || 0, stil: lider.stil, patronOnay: lider.patronOnay || [] });
    x.gecmis = [...(x.gecmis || []), [simdi, iptal ? "lider iptal → iptal" : `liderin fotoğrafı alındı → ${ARACLAR[x.arac].ad}${x.sablonKey ? ` · ${SABLON_SECENEK[x.sablonKey].ad}` : ""} ile video`]];
    await kaydet(env, `pelin:is:${tid}`, x);
    if (!liste.includes(tid)) liste.push(tid);
  }
  await kaydet(env, "pelin:isler", liste.slice(-200));
  lider.takipciler = null; await kaydet(env, `pelin:is:${lider.id}`, lider);
}
// Karşılaştırma grubu (aynı fotoğraf + aynı senaryo, farklı araç): hepsi bitince tek kart — Patron en gerçekçisini 🏆 ile seçer
const BITMIS = ["onay", "uyari", "onaylandi", "iptal", "hata", "deneme_begenildi"];
const grupEtiket = (x) => `${ARACLAR[x.arac].ad}${x.sablonKey && SABLON_SECENEK[x.sablonKey] ? ` · ${SABLON_SECENEK[x.sablonKey].ad}` : ""}`;
async function grupOzeti(env, gid, simdi) {
  const g = await oku(env, `pelin:grup:${gid}`, null);
  if (!g || g.ozet) return;
  const isler = await noraIsleri(env, gid);
  if (isler.length < 2 || isler.some((x) => !BITMIS.includes(x.durum))) return;
  g.ozet = simdi; await kaydet(env, `pelin:grup:${gid}`, g, 14 * 86400);
  const puan = (x) => { const k = x.videoKontrol; return k && k.puan ? `${k.puan.pelin ?? "—"}${k.puan.chatgpt ? `/${k.puan.chatgpt}` : ""}` : "—"; };
  const harf = "ABCDEFGH";
  const videolu = isler.filter((x) => x.video);
  await yaz(env, murat(env), [
    `🏁 ${isler[0].kod} KARŞILAŞTIRMA — aynı fotoğraf, aynı senaryo, ${isler.length} araç:`,
    ...isler.map((x, i) => `${harf[i]}) ${grupEtiket(x)}${x.hfYedek ? ` (Higgsfield yerine fal yedeği)` : ""} — ${x.video ? `kontrol puanı ${puan(x)}${x.durum === "uyari" ? " ⚠️" : ""} · ${para(x.maliyet || 0)}` : "video üretilemedi"}`),
    `Toplam: ${para(isler.reduce((t, x) => t + (x.maliyet || 0), 0))}`,
    videolu.length ? "Videolar yukarıda ayrı ayrı geldi. En gerçekçisini 🏆 ile seçin (not edilir; varsayılan araç olmaz). Kanala/siteye göndermek ayrı: o videonun ✅ Onayla düğmesi." : "Hiçbir araç video üretemedi.",
  ].join("\n"), videolu.length ? { reply_markup: { inline_keyboard: [...videolu.map((x) => [{ text: `🏆 ${harf[isler.indexOf(x)]}) ${grupEtiket(x)}`.slice(0, 60), callback_data: `pg:${gid}:${isler.indexOf(x)}` }]), [{ text: "Hiçbiri olmadı", callback_data: `pg:${gid}:-` }]] } } : {});
}
async function grupSecimDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, gid, deger] = cq.data.split(":");
  const g = await oku(env, `pelin:grup:${gid}`, null);
  if (!g || g.secim) return cevap("Bu seçim yapıldı ya da geçersiz.");
  const isler = await noraIsleri(env, gid);
  const secilen = /^\d+$/.test(deger) ? isler[Number(deger)] : isler.find((x) => x.arac === deger);
  const arac = deger === "-" ? "-" : secilen ? secilen.arac : deger;
  g.secim = { arac, zaman: simdi }; await kaydet(env, `pelin:grup:${gid}`, g, 30 * 86400);
  const kapat = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "pg:-" }]] } });
  await kaydet(env, "pelin:aracKarsilastirma", [...(await oku(env, "pelin:aracKarsilastirma", [])), { kod: isler[0] && isler[0].kod, grup: gid, araclar: isler.map((x) => x.arac), secilen: arac, zaman: simdi }].slice(-30));
  if (arac === "-" || !ARACLAR[arac]) { await cevap("Not edildi"); await kapat("Hiçbiri seçilmedi"); return yaz(env, murat(env), "Not ettim: bu karşılaştırmada hiçbiri yeterince gerçekçi değil. Varsayılan araç değişmedi. Ne eksikti, kısaca yazarsanız sonraki denemede düzeltirim."); }
  if (isler[0]) await boyYaz(env, isler[0].kod, { enIyiArac: arac, ...(secilen && secilen.sablonKey ? { enIyiSablon: secilen.sablonKey } : {}) });
  await cevap("Seçildi"); await kapat(`🏆 ${secilen ? grupEtiket(secilen) : ARACLAR[arac].ad} seçildi`);
  return yaz(env, murat(env), `🏆 ${secilen ? grupEtiket(secilen) : ARACLAR[arac].ad} en gerçekçi olarak not edildi${isler[0] ? ` (${isler[0].kod} kartına)` : ""}. Varsayılan araç yok: her üretim kartında yine siz seçersiniz. Bu videoyu yayına göndermek için kendi ✅ Onayla düğmesi.`);
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
  const [, islem, id, ek] = cq.data.split(":");
  const hemraYetkili = String(cq.from.id) === hemra(env) && islem === "a" && Boolean((await oku(env, "pelin:ayar", {})).hemraOnay);
  if (!muratMi(env, cq.from.id) && !hemraYetkili) return cevap("Sadece Patron.");
  const kapat = (text) => tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (islem === "o" || islem === "i") {
    const onay = await oku(env, `pelin:uretimOnay:${id}`, null);
    if (!onay || onay.kullanildi) return cevap("Bu onay geçersiz.");
    if (islem === "o" && (!onay.arac || !(onay.sablonKey || onay.sablonAd)) && onay.ust) return cevap(!onay.arac ? "Önce video aracını seçin." : "Önce şablonu seçin.");
    if (islem === "o") { // 4 Kasım (Patron): aylık sınır aşılıyorsa üretim BAŞLAMAZ
      const secimB = await oku(env, "pelin:secim", null);
      const tahmin = yuvarla((onay.arac ? kartMaliyeti(secimB, onay.arac, onay.sablonKey, await oku(env, "pelin:sablonlar", {})).toplam : uretimMaliyeti(aracSec(secimB), secimB).toplam) * onay.kodlar.length);
      const harcanan = await buAyHarcanan(env, simdi);
      const gunluk = await bugunHarcanan(env, simdi), gs = await gunlukSinir(env, simdi);
      if (gunluk + tahmin > gs) { await cevap("Günlük sınır aşılır"); return yaz(env, cq.message.chat.id, `⛔ Üretim başlamadı: bugün Pelin ${para(gunluk)} harcadı, bu iş ~${para(tahmin)}; günlük sınır ${gs} $. Bugün için sınırı açmak isterseniz Claude Code'a söyleyin.`); }
      if (harcanan + tahmin > AYLIK_SINIR_USD) { await cevap("Aylık sınır aşılır"); return yaz(env, cq.message.chat.id, `⛔ Üretim başlamadı: bu ay Pelin ${para(harcanan)} harcadı, bu iş ~${para(tahmin)}; aylık sınır ${AYLIK_SINIR_USD} $. Sınırı artırmak Patron kararıyla (Claude Code'a söyleyin).`); }
    }
    onay.kullanildi = true; await kaydet(env, `pelin:uretimOnay:${id}`, onay, 86400);
    await acikKartSil(env, id);
    if (islem === "i") { await cevap("İptal"); return kapat("❌ İptal edildi, hiçbir şey harcanmadı."); }
    await cevap("Başlıyorum"); await kapat(`✅ Onaylandı — ${onay.kodlar.length} model üretime alındı (${onay.kodlar.join(", ")})${onay.arac ? ` · araç: ${onay.arac === "hepsi" ? "hepsi (yan yana)" : ARACLAR[onay.arac].ad} · şablon: ${onay.sablonKey ? SABLON_SECENEK[onay.sablonKey].ad : onay.sablonAd}` : ""}. Hazır olan önizleme olarak gelecek.`);
    return uretimBaslat(env, onay, simdi);
  }
  const is = await oku(env, `pelin:is:${id}`, null);
  if (islem === "s" && is && ["onay", "onaylandi"].includes(is.durum)) {
    const ad = await sablonKaydet(env, is, simdi);
    await cevap("Şablon kaydedildi");
    return yaz(env, cq.message.chat.id, `💾 "${ad} şablonu" kaydedildi (ortamlar, sahne ayarları, video aracı${is.sablon && is.sablon.kamera ? ", örnek video tarifi" : ""}). Kullanmak için: /uret 3630 şablon:${ad} — ya da Pelin'e "3630'u ${ad} şablonuyla yap" yazın.`);
  }
  if (islem === "b" && is && is.durum === "kart") {
    const fiyat = ARACLAR[is.arac || VARSAYILAN_ARAC].saniye * URETIM_SN + KONTROL_TAHMIN * 2;
    if ((await buAyHarcanan(env, simdi)) + fiyat > AYLIK_SINIR_USD) return cevap("Aylık sınır aşılır.");
    is.durum = "video_gonder"; await kaydet(env, `pelin:is:${id}`, is);
    const liste = await oku(env, "pelin:isler", []); if (!liste.includes(id)) { liste.push(id); await kaydet(env, "pelin:isler", liste.slice(-200)); }
    await cevap("Başlıyorum");
    return kapat(`✅ ${is.kod}: video katalog fotoğrafından üretiliyor${is.muzik ? " + müzik denemesi" : ""}. Hazır olunca önizleme gelir (yayına otomatik gitmez).`);
  }
  if (islem === "x" && is && is.durum === "kart") { is.durum = "iptal"; await kaydet(env, `pelin:is:${id}`, is); await cevap("İptal"); return kapat("❌ İptal edildi, harcama yok."); }
  // Karşılaştırma: aynı fotoğraf/kareden başka araçla video (yeni iş; düğmeye basmak = o maliyetin onayı)
  if (islem === "k" && is && ARACLAR[ek] && ["onay", "onaylandi"].includes(is.durum)) {
    const fiyat = ARACLAR[ek].saniye * URETIM_SN;
    if ((await buAyHarcanan(env, simdi)) + fiyat > AYLIK_SINIR_USD) return cevap("Aylık sınır aşılır.");
    const yeniId = `${is.kod}-${kisaId()}`;
    const yeni = { ...is, id: yeniId, arac: ek, karsilastirma: is.id, durum: "video_gonder", videoDeneme: 0, video: null, kareler: [], kareFal: [], kapak: null, videoKontrol: null, maliyet: 0, testId: null, patronOnay: [], gecmis: [[simdi, `karşılaştırma: ${is.id} karesinden ${ARACLAR[ek].ad}`]], zaman: simdi };
    await kaydet(env, `pelin:is:${yeniId}`, yeni);
    const liste = await oku(env, "pelin:isler", []); liste.push(yeniId); await kaydet(env, "pelin:isler", liste.slice(-200));
    await cevap("Başlıyorum");
    return yaz(env, cq.message.chat.id, `🎬 ${is.kod}: aynı kareyle ${ARACLAR[ek].ad} videosu üretiliyor (~${para(fiyat)}). Hazır olunca önizleme gelir; iki videoyu karşılaştırıp beğendiğinizi onaylayın.`);
  }
  if (islem === "f" && is && is.durum === "foto_onay") {
    Object.assign(is, { durum: is.setYok ? "video_gonder" : "set_gonder", fotoOnaylandi: simdi }); is.gecmis.push([simdi, "ön fotoğraf Patron onaylı"]);
    await kaydet(env, `pelin:is:${id}`, is);
    await cevap("Videoya geçiyorum");
    return kapat(`✅ ${is.kod}: ön fotoğraf onaylandı — ${is.setYok ? "" : "diğer açılar (sağ yan, sol yan, arka; askı = gerçek fotoğraf) ve "}video üretiliyor${(is.takipciler || []).length ? ` (${is.takipciler.length + 1} video)` : ""}. Hazır olunca gelir.`);
  }
  if (!is || !["onay", "uyari", ...(["r", "x"].includes(islem) ? ["foto_onay"] : [])].includes(is.durum)) return cevap("Bu iş artık beklemiyor.");
  if (islem === "x") { is.durum = "iptal"; await kaydet(env, `pelin:is:${id}`, is); if (is.takipciler) await takipcileriBirak(env, is, simdi); await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "iptal", farklar: (is.sorunlar || []).slice(0, 4), notlar: (is.notlar || []).slice(0, 4) }); await cevap("İptal"); return kapat(`❌ ${is.kod} iptal edildi.`); }
  // PATRON SON SÖZ (3 Kasım): kontrolden geçmeyen işi Patron yine de onaylayabilir → kaldığı yerden devam ya da teslim
  if (islem === "a" && is.durum === "uyari") {
    const devam = devamAsamasi(is);
    if (!devam) return cevap("Fotoğraf yok; yeniden üretin.");
    is.patronOnay = [...(is.patronOnay || []), { zaman: simdi, asama: devam, sorunlar: (is.sorunlar || []).slice(0, 6) }];
    await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "yine de onay", farklar: (is.sorunlar || []).map((x) => x.replace(/^(Pelin|ChatGPT|İkinci göz): /, "")).slice(0, 4), notlar: (is.notlar || []).slice(0, 4) });
    if (devam === "teslim" && is.yayinYok) { // DENEME: yayına gitmez → beğenildi olarak saklanır (4 Kasım hata düzeltmesi)
      is.durum = "deneme_begenildi"; is.onayZaman = simdi; await kaydet(env, `pelin:is:${id}`, is);
      await cevap("Kaydedildi");
      return kapat(`💾 ${is.kod} denemesi beğenildi ve saklandı — DENEME olduğu için kanala/siteye gitmez.`);
    }
    if (devam === "teslim") { const engel = await markaEngeli(env, is); if (engel) { await cevap("Marka yanlış"); return yaz(env, cq.message.chat.id, `⛔ ${engel}`); } await paketeAl(env, is, simdi); await cevap("Onaylandı"); return kapat(`✅ ${is.kod} üretim onaylandı — ${is.setTamam ? "" : "önce fotoğraf seti, sonra "}marka yazısı basılıyor; ardından Kemal SON YAYIN onayınızı isteyecek.`); }
    Object.assign(is, { durum: devam, sorunlar: [], fotoOnaylandi: is.fotoOnaylandi || simdi, ...(devam === "sahne_gonder" ? { sahneDeneme: 0 } : { videoDeneme: 0 }) });
    await kaydet(env, `pelin:is:${id}`, is);
    await cevap("Devam ediyorum");
    return kapat(`✅ ${is.kod}: fotoğraf Patron onayıyla geçti — ${devam === "sahne_gonder" ? "video karesi ve video" : "video"} üretiliyor. Hazır olunca önizleme gelecek.`);
  }
  if (islem === "r") { Object.assign(is, { durum: "foto_gonder", fotoDeneme: 0, sahneDeneme: 0, videoDeneme: 0, foto: null, sahne: null, video: null, kapak: null, fotoOnaylandi: null }); await kaydet(env, `pelin:is:${id}`, is); await cevap("Yeniden"); return kapat(`🔄 ${is.kod} yeniden üretiliyor.`); }
  if (islem === "a" && is.durum === "onay" && is.yayinYok) { // DENEME: hiç yayına gitmez (Patron kuralı 4 Kasım)
    is.durum = "deneme_begenildi"; is.onayZaman = simdi; await kaydet(env, `pelin:is:${id}`, is);
    await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "onay", farklar: [], notlar: (is.notlar || []).slice(0, 4) });
    await cevap("Kaydedildi");
    return kapat(`💾 ${is.kod} denemesi beğenildi ve saklandı — DENEME olduğu için kanala/siteye gönderilmez. Yayın için aynı ayarlarla normal üretim yapılır (müzik telifsiz VOLONTE müziğiyle).`);
  }
  if (islem === "a" && is.durum === "onay") {
    if (is.muzik && is.muzikEklendi && /telifli/.test(is.muzik.ad || "") && ek !== "evet") { // deneme müziği telifli olabilir → ikinci onay
      await cevap("Emin misiniz?");
      return yaz(env, cq.message.chat.id, `⚠️ Bu videodaki müzik örnek videodan (telifli olabilir). Yine de kanala ve siteye gönderilsin mi? Telifsiz VOLONTE müziği seçilince değiştirilebilir.`, { reply_markup: { inline_keyboard: [[{ text: "📤 Evet, gönder", callback_data: `pu:a:${id}:evet` }, { text: "Vazgeç", callback_data: "pu:-" }]] } });
    }
    const engel = await markaEngeli(env, is);
    if (engel) { await cevap("Marka yanlış"); return yaz(env, cq.message.chat.id, `⛔ ${engel}`); }
    await paketeAl(env, is, simdi);
    await ogrenmeYaz(env, { zaman: simdi, kod: is.kod, karar: "onay", farklar: [], notlar: (is.notlar || []).slice(0, 4) });
    await cevap("Onaylandı");
    return kapat(`✅ ${is.kod} üretim onaylandı (yayın değil) — marka yazısı basılıyor; ardından Kemal SON YAYIN onayınızı isteyecek.`);
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
// ---------- NORA — senarist (4 Kasım, Patron): her videodan önce kısa senaryo; Patron [✅ Onayla] [✏️ Düzelt] [❌ İptal] ----------
// Kural: hızlı dönüş ve kamera dönüşü yok; yavaş doğal hareket. Videolar birbirinin aynısı olmasın (son senaryolar hatırlanır).
const NORA_SEMA = { type: "object", additionalProperties: false, required: ["senaryo_tr", "hareket_en"], properties: { senaryo_tr: { type: "string" }, hareket_en: { type: "string" } } };
export async function noraYaz(env, is, simdi, duzeltme = "") {
  const gecmis = await oku(env, "pelin:noraGecmis", []);
  const kare = is.sahne || is.foto;
  const n = await claudeJson(env, [
    { type: "text", text: `Sen Nora'sın: VOLONTE ve BLACK ROSE mağazalarının (lüks kadın giyim; iki ayrı marka) senaristi. Model ${is.kod}${is.marka && MARKALAR[is.marka] ? ` (${MARKALAR[is.marka].ad})` : ""}${is.renk ? `, renk ${is.renk}` : ""}${is.boy && BOYLAR[is.boy.boy] ? `, boy ${BOYLAR[is.boy.boy].ad}` : ""}. Videonun başlangıç karesi:` },
    ...(kare ? [resimUrl(kare)] : []),
    { type: "text", text: `Bu kareden ${URETIM_SN} saniyelik dikey video için KISA senaryo yaz.
KESİN KURALLAR: model DAİMA kameraya doğru İLERİ yürür; geri gitmek, kameradan uzaklaşmak, sırtını dönmek YASAK. Hızlı dönüş YOK, kendi etrafında dönme YOK, kamera etrafında dönüş YOK. Sadece yavaş, doğal hareket: kameraya doğru birkaç adım yürüme, hafif durma, omuz üstünden bakış; kumaş doğal dalgalansın; kamera sabit ya da çok yavaş yaklaşır. Elbise, renk, boy, yaka ve mekân karedeki gibi kalır; yeni eşya/dekor ekleme. Kadın: başarılı, zengin, özgüvenli, zarif.
Videolar birbirinin aynısı olmasın; son senaryolar: ${gecmis.slice(-4).map((x) => x.tr).join(" | ") || "yok"}.${duzeltme ? `
PATRON'UN DÜZELTMESİ (mutlaka uygula): ${duzeltme}` : ""}
senaryo_tr: Patron'a gösterilecek en fazla 3 kısa satır Türkçe (saniye saniye). hareket_en: aynı hareketin video aracı için kısa İngilizce tarifi (en fazla 350 karakter; sadece hareket ve kamera).` },
  ], NORA_SEMA, simdi, 500, await kitapOku(env, "nora", simdi)); // 13 Kasım (TEK KİTAP): Nora da kitabı okur
  const sen = { tr: String(n.senaryo_tr).slice(0, 400), hareketEn: String(n.hareket_en).slice(0, 380), zaman: simdi, duzeltme: duzeltme || null };
  await kaydet(env, "pelin:noraGecmis", [...gecmis, { kod: is.kod, tr: sen.tr, zaman: simdi }].slice(-20));
  return sen;
}
// Nora kartı: hedef = iş kimliği ya da "g-<grup>" (karşılaştırma: aynı senaryo iki araçla)
async function noraKarti(env, hedef, isler, simdi, onEk = []) {
  const s0 = isler[0].senaryo;
  const maliyetli = isler.some((x) => x.durum === "kart");
  return yaz(env, murat(env), [
    ...onEk,
    `📝 Nora — senaryo (${isler[0].kod}, ${URETIM_SN} sn)${s0.onayliKaynak ? " — daha önce ONAYLADIĞINIZ senaryo, aynen" : ""}${(isler[0].takipciler || []).length ? ` — ${isler[0].takipciler.length + 1} araçla aynı senaryo (hepsini dene)` : ""}:`,
    s0.tr,
    "Kural: hızlı dönüş ve kamera dönüşü yok; yavaş, doğal hareket.",
    ...(maliyetli ? isler.map((x) => `• ${ARACLAR[x.arac].ad}: ${URETIM_SN} × ${para(ARACLAR[x.arac].saniye)} = ${ARACLAR[x.arac].ustSinir ? "en fazla " : ""}${para(ARACLAR[x.arac].saniye * URETIM_SN)}${ARACLAR[x.arac].ustSinir ? " (indirim öncesi; indirimle daha az)" : ""}`) : []),
    ...(maliyetli ? [`• Kontrol + kare çıkarma: ~${para((KONTROL_TAHMIN * 2 + OPENAI_TAHMIN) * isler.length)}`] : []),
    ...(maliyetli && isler.some((x) => ARACLAR[x.arac].hf) ? [`💳 Higgsfield'den düşecek: en fazla ${para(isler.filter((x) => ARACLAR[x.arac].hf).reduce((t, x) => t + ARACLAR[x.arac].saniye * URETIM_SN, 0))} (bakiye 20 $, otomatik yükleme kapalı). Higgsfield hata verirse aynı fotoğrafla fal.ai yedeği kullanılır ve önizlemede yazar.`] : []),
    ...(maliyetli ? [`TOPLAM: en fazla ${para(isler.reduce((t, x) => t + ARACLAR[x.arac].saniye * URETIM_SN + KONTROL_TAHMIN * 2 + OPENAI_TAHMIN, 0))}`] : []),
    maliyetli ? "Onaylarsanız senaryo ve maliyet onaylanmış olur; videolar üretilip yan yana gelir." : "Onaylarsanız video bu senaryoyla üretilir.",
  ].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pn:o:${hedef}` }, { text: "✏️ Düzelt", callback_data: `pn:d:${hedef}` }, { text: "❌ İptal", callback_data: `pn:x:${hedef}` }]] } });
}
async function noraIsleri(env, hedef) {
  if (String(hedef).startsWith("g-")) { const g = await oku(env, `pelin:grup:${hedef}`, null); const l = []; for (const id of (g && g.ids) || []) { const x = await oku(env, `pelin:is:${id}`, null); if (x) l.push(x); } return l; }
  const x = await oku(env, `pelin:is:${hedef}`, null);
  return x ? [x] : [];
}
async function noraDugmesi(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevap("Sadece Patron.");
  const [, islem, hedef] = cq.data.split(":");
  const isler = (await noraIsleri(env, hedef)).filter((x) => ["kart", "senaryo_onay"].includes(x.durum));
  if (!isler.length) return cevap("Bu senaryo artık beklemiyor.");
  const kapat = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "pn:-" }]] } });
  if (islem === "x") { for (const x of isler) { x.durum = "iptal"; await kaydet(env, `pelin:is:${x.id}`, x); if (x.takipciler) await takipcileriBirak(env, x, simdi); } await acikKartSil(env, hedef); await cevap("İptal"); return kapat("❌ İptal edildi (harcama yok)"); }
  if (islem === "d") {
    await kaydet(env, "pelin:noraDuzelt", { hedef, zaman: simdi }, 3600);
    await cevap("Düzelt"); await kapat("✏️ Düzeltiliyor");
    return yaz(env, murat(env), "✏️ Senaryoda neyi değiştireyim? Kısaca yazın (ör. \"önce omuz üstünden baksın, sonra iki adım yürüsün\").");
  }
  const toplam = isler.filter((x) => x.durum === "kart").reduce((t, x) => t + ARACLAR[x.arac].saniye * URETIM_SN + KONTROL_TAHMIN * 2, 0);
  if (toplam && (await buAyHarcanan(env, simdi)) + toplam > AYLIK_SINIR_USD) return cevap("Aylık sınır aşılır.");
  const liste = await oku(env, "pelin:isler", []);
  for (const x of isler) { x.durum = "video_gonder"; x.gecmis.push([simdi, "Nora senaryosu Patron onaylı"]); await kaydet(env, `pelin:is:${x.id}`, x); if (!liste.includes(x.id)) liste.push(x.id); }
  await kaydet(env, "pelin:isler", liste.slice(-200));
  await acikKartSil(env, hedef);
  await cevap("Başlıyorum"); await kapat("✅ Senaryo onaylandı");
  return yaz(env, murat(env), `🎬 ${isler[0].kod}: ${isler.map((x) => ARACLAR[x.arac].ad).join(" + ")} ile video üretiliyor. Hazır olunca ${isler.length > 1 ? "yan yana " : ""}önizleme gelir.`);
}
// Patron'un düzeltme metni → Nora yeniden yazar → yeni kart
async function noraDuzeltMesaji(env, m, simdi) {
  if (!muratMi(env, m.from.id) || !m.text || m.text.startsWith("/")) return false;
  const d = await oku(env, "pelin:noraDuzelt", null);
  if (!d) return false;
  await env.KAYIT.delete("pelin:noraDuzelt");
  const isler = (await noraIsleri(env, d.hedef)).filter((x) => ["kart", "senaryo_onay"].includes(x.durum));
  if (!isler.length) return false;
  const sen = await noraYaz(env, isler[0], simdi, String(m.text).slice(0, 500));
  for (const x of isler) { x.senaryo = sen; await kaydet(env, `pelin:is:${x.id}`, x); }
  await noraKarti(env, d.hedef, isler, simdi, ["✏️ Düzeltildi."]);
  return true;
}

export async function katalogdanVideoKarti(env, ik, simdi) {
  const kaynak = await oku(env, `pelin:is:${ik.isId}`, null);
  if (!kaynak || !kaynak.foto) return yaz(env, murat(env), `⚠️ ${ik.isId}: katalog fotoğrafı bulunamadı.`);
  const mk = (await boyOku(env, kaynak.kod)) || {};
  const araclar = (Array.isArray(ik.araclar) && ik.araclar.length ? ik.araclar : KART_ARACLARI).filter((a) => ARACLAR[a] && !(mk.aracYasak || []).includes(a));
  if (araclar.length > 1 || ik.nora !== false) return katalogdanNora(env, kaynak, ik, araclar, simdi);
  const id = `${kaynak.kod}-${kisaId()}`;
  const arac = VARSAYILAN_ARAC;
  const is = { ...kaynak, id, arac, aracYedek: false, durum: "kart", sahne: null, videoOrtam: null, video: null, videoSessiz: null, kareler: [], kareFal: [], kapak: null, videoKontrol: null, sahneKontrol: null, videoDeneme: 0, maliyet: 0, testId: null, patronOnay: [], sorunlar: [], notlar: [], karsilastirma: null,
    sablon: null, muzik: ik.muzik || null, muzikEklendi: false, yayinYok: ik.deneme !== false, kaynakIs: kaynak.id, gecmis: [[simdi, `katalog fotoğrafından video (${kaynak.id})${ik.muzik ? ` + müzik: ${ik.muzik.ad}` : ""}`]], zaman: simdi };
  await kaydet(env, `pelin:is:${id}`, is);
  if (kaynak.foto) await tg(env, "sendPhoto", { chat_id: murat(env), photo: kaynak.foto, caption: `📸 ${kaynak.kod} — videonun kaynağı (onaylı katalog fotoğrafı)` });
  const v = ARACLAR[arac].saniye * URETIM_SN;
  return yaz(env, murat(env), [
    `🎬 ${kaynak.kod}: bu katalog fotoğrafından ${URETIM_SN} sn video${ik.muzik ? " + müzik denemesi" : ""}`,
    `• Video: ${ARACLAR[arac].ad} — ${URETIM_SN} × ${para(ARACLAR[arac].saniye)} = ${para(v)} (Veo reddederse aynı fotoğrafla Kling 4.0: ${para(ARACLAR.kling4.saniye * URETIM_SN)})`,
    `• Kontrol + son kare yazısı: ~${para(KONTROL_TAHMIN * 2 + OPENAI_TAHMIN)}${ik.muzik ? " · müzik ekleme ~0,01 $" : ""}`,
    ...(ik.muzik ? [`🎵 Müzik: ${ik.muzik.ad}. Sessiz hali saklanır; müzik sonra telifsiz VOLONTE müziğiyle değiştirilebilir.`] : []),
    "🧪 DENEME: video kanala ve siteye HİÇ GİTMEZ; sadece size gelir.",
    "Dekor yok (zarf/eldiven/şapka yok); boy bilek, siyah-altın ortam.",
  ].join("\n"), { reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `pu:b:${id}` }, { text: "❌ İptal", callback_data: `pu:x:${id}` }]] } });
}
// Katalog fotoğrafından video (Nora'lı): her araç için bir iş (aynı senaryo), tek kart = senaryo + maliyet onayı
async function katalogdanNora(env, kaynak, ik, araclar, simdi) {
  const gid = `g-${kisaId()}`;
  const ortak = { ...kaynak, aracYedek: false, durum: "kart", sahne: null, videoOrtam: null, video: null, videoSessiz: null, kareler: [], kareFal: [], kapak: null, videoKontrol: null, sahneKontrol: null, videoDeneme: 0, maliyet: 0, testId: null, patronOnay: [], sorunlar: [], notlar: [], karsilastirma: null,
    sablon: null, sahneAyar: { ...SAHNE_VARSAYILAN }, muzik: ik.muzik || null, muzikEklendi: false, yayinYok: ik.deneme === true, kaynakIs: kaynak.id, grup: gid, zaman: simdi };
  const isler = araclar.map((arac) => ({ ...ortak, id: `${kaynak.kod}-${kisaId()}`, arac, aracYedek: araclar.length > 1, hfYedek: null, gecmis: [[simdi, `katalog fotoğrafından video (${kaynak.id}) · ${ARACLAR[arac].ad}${araclar.length > 1 ? " · karşılaştırma" : ""}`]] }));
  // ik.senaryoIs: Patron'un daha önce onayladığı Nora senaryosu aynen kullanılır (yeni senaryo yazılmaz)
  const eskiSen = ik.senaryoIs ? ((await oku(env, `pelin:is:${ik.senaryoIs}`, null)) || {}).senaryo : null;
  const sen = eskiSen && eskiSen.hareketEn ? { ...eskiSen, onayliKaynak: ik.senaryoIs } : await noraYaz(env, isler[0], simdi);
  await eskiKartlariKapat(env, simdi);
  for (const x of isler) { x.senaryo = sen; await kaydet(env, `pelin:is:${x.id}`, x); }
  await kaydet(env, `pelin:grup:${gid}`, { ids: isler.map((x) => x.id), kaynakIs: kaynak.id, zaman: simdi }, 14 * 86400);
  await tg(env, "sendPhoto", { chat_id: murat(env), photo: kaynak.foto, caption: `📸 ${kaynak.kod} — videonun kaynağı (onaylı katalog fotoğrafı)` });
  const nk = await noraKarti(env, gid, isler, simdi, [`🎬 ${kaynak.kod}: bu katalog fotoğrafından ${URETIM_SN} sn video — ${araclar.map((a) => ARACLAR[a].ad).join(" ve ")}${araclar.length > 1 ? " (yan yana karşılaştırma)" : ""}${ik.deneme === true ? " · 🧪 DENEME (yayına gitmez)" : ""}`, ""]);
  if (nk && nk.ok) await acikKartEkle(env, { tur: "nora", ref: gid, chat: murat(env), mid: nk.result && nk.result.message_id, zaman: simdi });
  return nk;
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
    o.tarif = await claudeJson(env, [{ type: "text", text: "Bir moda videosundan 3 kare (baş, orta, son):" }, ...kareler.map(resimUrl), { type: "text", text: "Bu videonun ÜSLUBUNU tarif et (İngilizce, görsel/video üretim istemi olarak kullanılacak): kamera (hareket, açı, mesafe), isik (ışık ve renk paleti), hiz (tempo, ağır çekim vb.), poz (mankenin hareketleri), ortam_havasi (SADECE mekân, fon ve atmosfer — eşya/aksesuar/dekor YAZMA: zarf, kart, eldiven, şapka, fiyonk, çiçek vb. yok — bizimkinde biraz değiştirilecek). Kişinin yüzünü, kimliğini, logoları, yazıları, markaları ve müziği TARİFE KOYMA. ad: kısa Türkçe şablon adı (tek kelime, küçük harf). ozet: 1-2 cümle Türkçe." }], TARIF_SEMA, simdi);
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
const DESTEKLI = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i; // HEIC/HEIF: /dosya sunarken JPEG'e çevrilir (Cloudflare Images)
// "koyu bordo", "açık mavi" gibi tonlar da geçerli renk
export const renkGecerli = (r) => { const t = String(r || "").toLocaleLowerCase("tr").trim(); const m = t.match(/^(koyu|açık|acik)\s+(.+)$/); return Boolean(RENKLER[t] || (m && RENKLER[m[2]])); };
export const renkEn = (r) => { const t = String(r || "").toLocaleLowerCase("tr").trim(); const m = t.match(/^(koyu|açık|acik)\s+(.+)$/); return m && RENKLER[m[2]] ? `${m[1] === "koyu" ? "dark" : "light"} ${RENKLER[m[2]]}` : RENKLER[t] || t; };
export function fotoYazisi(yazi) {
  const t = String(yazi || "").toLocaleLowerCase("tr");
  const kod = (t.match(/\b(\d{3,6})\b/) || [])[1] || null;
  // 4 Kasım (Patron): etiketler manken / askı / detay; ön/arka eklenebilir ("3627 manken arka")
  const kumasMi = /etiket|label|bileşim|içerik/.test(t); // kumaş etiketi fotoğrafı (bileşim okunur)
  const detayMi = kumasMi || /detay|yaka|dikiş|kumaş|yakın|detail/.test(t);
  const etiket = kumasMi ? "kumas" : detayMi ? "detay" : /manken|model\b|giyil/.test(t) ? "manken" : /ask[ıi]|hanger/.test(t) ? "aski" : null;
  const yon = /(^|[^a-zçğıöşü])arka([^a-zçğıöşü]|$)|\bback\b|sırt/.test(t) ? "arka" : /(^|[^a-zçğıöşü])ön([^a-zçğıöşü]|$)|\bfront\b/.test(t) ? "on" : null;
  const rol = detayMi ? "detay" : yon || (etiket ? "on" : null);
  let renk = Object.keys(RENKLER).find((r) => new RegExp(`(^|[^a-zçğıöşü])${r}([^a-zçğıöşü]|$)`).test(t)) || null;
  if (renk) { const ton = t.match(new RegExp(`(koyu|açık|acik)\\s+${renk}`)); if (ton) renk = `${ton[1]} ${renk}`; }
  return { kod, rol, renk, etiket };
}
export const ETIKET_AD = { manken: "manken", aski: "askı", detay: "detay" };
export const fotoEtiketi = (x) => [x.etiket && x.etiket !== "detay" ? ETIKET_AD[x.etiket] : null, x.rol === "detay" ? "detay" : ROL_AD[x.rol]].filter(Boolean).join(" ");
// iPhone dosyaları HEIC/HEIF gelebilir (mime boş ya da octet-stream olsa da uzantıdan anlaşılır) → sunulurken JPEG'e çevrilir
const heicMi = (d) => /hei[cf]/i.test(String(d.mime_type || "")) || /\.hei[cf]$/i.test(String(d.file_name || ""));
const belgeTuru = (d) => (heicMi(d) ? "image/heic" : d.mime_type);
const fotoAl = (m) => (m.photo ? { foto: m.photo[m.photo.length - 1], tur: "image/jpeg", dosya: false } : m.document && (/^image\//.test(m.document.mime_type || "") || heicMi(m.document)) ? { foto: m.document, tur: belgeTuru(m.document), dosya: true } : null);
const ROL_AD = { on: "ön", arka: "arka", detay: "detay" };
// Kayıtlı fotoğrafları rol sırasına koy: açık rol (ön, arka, detay) → albüm sırası (1. ön, 2. arka, gerisi detay)
export function fotoSirala(liste) {
  const l = (liste || []).map((x) => (typeof x === "string" ? { anahtar: x, rol: null } : x));
  const albumSira = {};
  for (const x of [...l].sort((a, b) => (a.mid || 0) - (b.mid || 0))) if (x.album && !x.rol) { albumSira[x.album] = (albumSira[x.album] || 0) + 1; x._sira = albumSira[x.album]; }
  const rolu = (x) => x.rol || (x._sira === 1 ? "on" : x._sira === 2 ? "arka" : x.album ? "detay" : "on");
  const puan = { on: 0, arka: 1, detay: 2 }, epuan = { manken: 0, aski: 1 };
  return l.map((x) => ({ ...x, rol: rolu(x) })).sort((a, b) => puan[a.rol] - puan[b.rol] || (epuan[a.etiket] ?? 2) - (epuan[b.etiket] ?? 2) || (b.zaman || 0) - (a.zaman || 0)).map(({ _sira, ...x }) => x);
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
  const ekle = async (fileId, tur, dosya, mid, zaman, rol, etiket = null) => urunFotoKaydet(env, kod, { anahtar: await dosyaKaydet(env, fileId, tur, 120 * 86400), rol, etiket, renk, album: m.media_group_id || null, mid, zaman, dosya: Boolean(dosya), heic: /hei[cf]/i.test(tur) || undefined });
  let l = await ekle(f.foto.file_id, f.tur, f.dosya, m.message_id, m.date, y.rol, y.etiket);
  if (y.etiket === "kumas") { const son = fotoSirala(l).find((x) => x.etiket === "kumas"); try { const k = await kumasOku(env, son && dosyaAdresi(env, son.anahtar), Math.floor(Date.now() / 1000)); if (k) { await boyYaz(env, kod, { kumas: k }); await yaz(env, m.chat.id, `🧵 ${kod} kumaş etiketi okundu: ${k} — detay kolajına ve kanal yazısına eklenir.`); } else await yaz(env, m.chat.id, `🧵 ${kod}: etiketteki kumaş bilgisi okunamadı; "3627 kumaş %100 polyester" gibi yazabilirsiniz.`); } catch { /* sonra */ } }
  const bekleyen = ((album && album.bekleyen) || []).filter((b) => !b.dosya || DESTEKLI.test(b.tur));
  for (const b of bekleyen) l = await ekle(b.fileId, b.tur, b.dosya, b.mid, b.zaman, null);
  if (albumAnahtar) await kaydet(env, albumAnahtar, { kod, renk, bekleyen: [] }, 3600);
  if (y.kod || bekleyen.length) {
    const s = fotoSirala(l).filter((x) => !renk || !x.renk || x.renk === renk);
    await yaz(env, m.chat.id, `✅ ${kod}${renk ? ` ${renk}` : ""} ürün fotoğrafı alındı${albumAnahtar ? " (albümdeki diğer fotoğraflar da bu koda eklenir: 1. ön, 2. arka, sonrası detay)" : ""}. Kayıtlı: ${s.map(fotoEtiketi).join(", ")}.${/hei[cf]/i.test(f.tur) ? " (iPhone HEIC dosyası → otomatik JPEG'e çevrilir)" : ""} Üretimde siteden önce bunlar kullanılır. Kontrol: /fotolar ${kod}${f.dosya ? "" : "\nİpucu: \"Dosya olarak\" gönderirseniz renk daha net kalır."}`);
  }
  return true;
}
// Kodsuz, albümsüz ve yüz olmayan fotoğraf (Patron dışı) → ne yapılacağını söyle
async function fotoUyarisi(env, m) {
  if (!fotoAl(m)) return false;
  await yaz(env, m.chat.id, "Fotoğrafın yazısına model kodunu ve etiketi yazın: \"3627 manken\", \"3627 askı\", \"3627 detay\" (ön/arka eklenebilir: \"3627 manken arka\"), renk için \"3627 kırmızı\". Renk netliği için \"dosya olarak\" gönderebilirsiniz.");
  return true;
}
// Tek seferlik (Claude Code hazırlar, KV "venom:pelinUrunFoto" = { kod, fotolar: [{ anahtar, rol, renk }] }): eski akışa düşmüş
// ürün fotoğraflarını üretim kaydına aktarır
// Tek seferlik (Claude Code): KV "venom:pelinUrunFotoUrl" = { kod, fotolar: [{ url, rol, renk, etiket }] } → site fotoğrafı (renk etiketli)
// ürün fotoğrafı olarak (ör. 3627 beyaz: Patron'un fotoğrafları bordo; beyaz için sitedeki beyaz fotoğraflar)
async function urunFotoUrlAktar(env) {
  const p = await env.KAYIT.get("venom:pelinUrunFotoUrl", "json");
  if (!p || !p.kod || !Array.isArray(p.fotolar)) return;
  await env.KAYIT.delete("venom:pelinUrunFotoUrl");
  for (const f of p.fotolar) if (/^https:\/\//.test(String(f.url))) await urunFotoKaydet(env, p.kod, { anahtar: `u${crypto.randomUUID().replace(/-/g, "").slice(0, 31)}`, url: f.url, rol: f.rol || "on", etiket: f.etiket || null, renk: f.renk || null, album: null, mid: 0, zaman: f.zaman || 1, site: true });
}
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
  const media = l.slice(0, 10).map((x, i) => ({ type: "photo", media: dosyaAdresi(env, x.anahtar), caption: `${i + 1}. ${fotoEtiketi(x) || "etiketsiz"}${x.renk ? ` · ${x.renk}` : ""}` }));
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

export async function buyukYuzKaydet(env, { isId, ad }, simdi) {
  const is = await oku(env, `pelin:is:${isId}`, null);
  if (!is) return { ok: false, hata: "iş yok" };
  const adaylar = [is.foto, is.paket && is.paket.on, is.paket && is.paket.set && is.paket.set.on, is.set && is.set.on].filter((x) => typeof x === "string" && /^https:/.test(x));
  let r = null, kaynak = null;
  for (const u of adaylar) { const x = await fetch(u).catch(() => null); if (x && x.ok) { r = x; kaynak = u; break; } }
  if (!r) return { ok: false, hata: `ön fotoğraf indirilemedi (${adaylar.length} adres denendi)` };
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.KAYIT.put(`pelinmedya:${id}`, await r.arrayBuffer(), { metadata: { tur: r.headers.get("content-type") || "image/jpeg" } }); // süresiz
  const secim = (await oku(env, "pelin:secim", null)) || {};
  const yuzler = { ...(secim.yuzler || {}) };
  const { onceki: _o, ...eski } = yuzler.buyuk || {};
  yuzler.buyuk = { manken: "dolgun", ad: ad || `${is.kod} ${is.renk || ""} onaylı büyük beden yüzü`.replace(/\s+/g, " "), url: `${env.SELF_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${id}`, kaynak: `${is.kod} ${is.renk || ""} ön fotoğrafı (Patron onaylı)`.replace(/\s+/g, " "), zaman: simdi, onceki: eski };
  await kaydet(env, "pelin:secim", { ...secim, yuzler, zaman: simdi });
  return { ok: true, url: yuzler.buyuk.url, ad: yuzler.buyuk.ad, kaynak };
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

const yuzDuzenIstemi = (istem) => `Edit this portrait photo of a woman. Change ONLY this: ${istem}. Keep her identity exactly the same — she must clearly be the same person: same face shape and facial proportions, same eye shape and eye color, same nose, same lips shape, same ears (skin tone stays the same unless the change asks for it). Everything not mentioned in the change (hair, makeup, expression, clothing, pose, framing, background) stays as it is. Realistic skin with natural texture (no plastic or airbrushed look). Photorealistic. No text, no logo, no watermark.`;

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
  j.fal = await falGonder(env, GORSEL.duzenle, { prompt: yuzDuzenIstemi(j.istem), image_urls: [yuzAdres(env, y)], num_images: 1, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" });
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
      await yaz(env, murat(env), `⚠️ Yüz düzenleme üretilemedi (ücret alınmaz): ${falHataTr(s.hata || "zaman aşımı")}`);
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
  const foto = m.photo ? m.photo[m.photo.length - 1] : m.document && (/^image\//.test(m.document.mime_type || "") || heicMi(m.document)) ? m.document : null;
  if (!foto || !muratMi(env, m.from.id)) return false;
  const yazi = String(m.caption || "").trim();
  if (/^\d{3,6}\b/.test(yazi) || (yazi && !/y[üu]z|face|лицо/i.test(yazi))) return false;
  const id = kisaId();
  const tur = m.document ? belgeTuru(m.document) : "image/jpeg";
  await kaydet(env, `pelin:yuzAday:${id}`, { fileId: foto.file_id, tur, zaman: m.date }, 3 * 86400);
  if (!yazi) await kaydet(env, "pelin:sonYazisizFoto", { fileId: foto.file_id, tur, dosya: Boolean(m.document), mid: m.message_id, zaman: m.date, kayit: Math.floor(Date.now() / 1000), yuzId: id }, 900);
  await yaz(env, m.chat.id, `👤 Bu fotoğrafı kalıcı yüz olarak kaydedeyim mi? Hangi seri?${yazi ? "" : "\n(Ürün fotoğrafıysa şimdi \"3627 manken\" / \"3627 askı\" / \"3627 detay\" yazmanız yeter; boy referansıysa yazısına \"3627 boy\" yazıp tekrar gönderin.)"}${m.photo ? "\nİpucu: \"Dosya olarak\" gönderirseniz yüz daha net kalır." : ""}`,
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
