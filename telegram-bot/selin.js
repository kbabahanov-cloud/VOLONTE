// SELİN — siteyi dolduran eleman (ayrı Cloudflare Worker "volonte-selin", ayrı Telegram botu).
//
// Kemal'in kodunu kullanmaz; ortak beyinden (KV) sadece OKUR (ortak.js). Kendi verisi "selin:*".
// Akış: model listesi (✅ Mağazada var / ❌ Yok) → "var" denenler için hazırlık (bütün pozlar
// en yüksek çözünürlükte, netlik kontrolü, açıklama TR/EN/FR/PT, bedenler) → onay kartı
// (✅ Onayla, siteye yükle / ✏️ Düzelt / ❌ Ekleme) → onaylanınca GitHub'a tek commit → site linki.
// Onaysız hiçbir şey siteye çıkmaz. Yapay zekâ harcaması ortak aylık sınıra (harcama.js) sayılır.
//
// Ayarlar (volonte-selin Worker'ında):
//  BOT_TOKEN, WEBHOOK_SECRET, ANTHROPIC_API_KEY, GITHUB_TOKEN  secret
//  ALLOWED_IDS (yöneticiler: sahip, Merdan), EKIP_IDS (ekip: mesajları görür, düğmelere basar),
//  SELF_URL, ANTHROPIC_MODEL, GITHUB_REPO, SITE_URL  düz metin
//  KAYIT (ortak KV), SELIN (Durable Object: yapay zekâ adımı Kuzey Amerika'da)

import Anthropic from "@anthropic-ai/sdk";
import { kanalBilgisi, modelSecenekleri, tarihUzun } from "./ortak.js";
import { sinirAsildiMi, harcamaEkle } from "./harcama.js";
import { eskiBilgiler } from "./altyazi.js";

const SAAT_FARKI = 3 * 3600;
const ILK_HAFTA_GUNLUK = 30; // kullanıcı kararı: ilk hafta günde 30 model
const SONRA_GUNLUK = 10;
const LISTE_PARTI = 8; // bir çalışmada sorulan model
const PAYLASIM_EN_FAZLA = 4; // bir modelin en yeni kaç paylaşımından poz toplanır
const POZ_EN_FAZLA = 10;
const DUSUK_COZUNURLUK = 700; // piksel (genişlik ya da yükseklik); altı "düşük çözünürlük"
const GUNCELLEMELER = ["message", "callback_query"];
const KATEGORILER = ["dresses", "sets", "tops", "skirts", "trousers", "evening"];

export const REHBER = `VOLONTE yazı rehberi (özet): Toptancı kadın alıcılar için sakin özgüvenli, modern ve şık ton; abartı ve ünlem yok.
Site açıklaması 2–4 cümle (40–70 kelime): 1) ne olduğu ve kesimi (net, sade) 2) öne çıkan 2–3 detay (yaka, kol, kemer, taş, desen, doku) 3) nerede/nasıl giyilir 4) sakin bir kalite cümlesi (İstanbul'da üretim, özenli işçilik).
Fiyat, stok, beden ve görünmeyen özellik (emin olunmayan kumaş) uydurma; başka marka anma; emoji yok.
Her dilde doğal yazım (çeviri kokmasın): en ana dil, fr ve pt Afrika pazarı için, tr sahibin kontrolü için.
Başlık: 2–4 kelime İngilizce, tür + ayırt edici detay (ör. "Belted Wrap Midi Dress").`;

const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const kimlikler = (yazi) => String(yazi || "").split(",").map((x) => x.trim()).filter(Boolean);
// Yöneticiler + ekip: hepsi listeleri görür ve düğmelere basar. Ayar işleri sadece yöneticide.
const kisiler = (env) => [...new Set([...kimlikler(env.ALLOWED_IDS), ...kimlikler(env.EKIP_IDS)])];
const izinli = (id, env) => kisiler(env).includes(String(id));
const yoneticiMi = (id, env) => kimlikler(env.ALLOWED_IDS).includes(String(id));
const kisiAdi = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "Biri";
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const yazKV = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);

async function tg(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde),
  });
  return r.json();
}
const herkese = async (env, text, ek = {}) => {
  const sonuc = [];
  for (const k of kisiler(env)) {
    const r = await tg(env, "sendMessage", { chat_id: k, text, disable_web_page_preview: true, ...ek });
    if (r.ok) sonuc.push([k, r.result.message_id]);
  }
  return sonuc;
};

function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      await guncelleme(await istek.json(), env);
      return new Response("ok");
    }
    return new Response("Selin çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    await webhookKur(env);
    const simdi = Math.floor(Date.now() / 1000);
    await eksikleriGonder(env, simdi);
    await listeAdimi(env, simdi);
    // Yapay zekâ adımı Anthropic'in kabul ettiği bölgede çalışsın diye sabit nesnede.
    if (env.SELIN) await env.SELIN.get(env.SELIN.idFromName("selin"), { locationHint: "enam" }).fetch("https://selin/hazirla");
    else await hazirlaGuvenli(env, simdi);
  },
};

export class SelinDO {
  constructor(state, env) { this.env = env; }
  async fetch() {
    await hazirlaGuvenli(this.env, Math.floor(Date.now() / 1000));
    return new Response("ok");
  }
}

async function webhookKur(env) {
  if (!env.SELF_URL) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  if (b.ok && b.result.url === hedef && GUNCELLEMELER.every((g) => (b.result.allowed_updates || []).includes(g))) return;
  const r = await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 1 });
  await yazKV(env, "selin:webhook", { zaman: Math.floor(Date.now() / 1000), ok: r.ok, hata: r.description || null });
}

// ---------- 1) Model listesi: ✅ Mağazada var / ❌ Yok ----------

export async function gunlukHedef(env, simdi) {
  let d = await oku(env, "selin:durum", null);
  if (!d) {
    d = { baslangic: simdi };
    await yazKV(env, "selin:durum", d);
  }
  return simdi - d.baslangic < 7 * 86400 ? ILK_HAFTA_GUNLUK : SONRA_GUNLUK;
}

export function listeAdaylari(bilgi, modeller, simdi) {
  return Object.keys(bilgi.kodlar)
    .filter((k) => !bilgi.silinenler[k] && !(bilgi.atlananlar[k] > simdi + 365 * 86400))
    .filter((k) => {
      const m = modeller[k];
      if (!m) return true;
      return m.durum === "yok" && simdi - m.zaman > 30 * 86400; // "yok" denen 30 gün sonra tekrar sorulur
    })
    .map((k) => ({ kod: k, sec: modelSecenekleri(k, bilgi.kodlar, bilgi.kodsuz)[0] }))
    .filter((x) => x.sec)
    .sort((a, b) => b.sec.tarih - a.sec.tarih); // en yeni paylaşılan önce (mağazada olma ihtimali yüksek)
}

function soruKarti(env, bilgi, kod, sec, kisi) {
  return tg(env, "copyMessage", {
    chat_id: kisi, from_chat_id: bilgi.kanal.id, message_id: sec.ids[0],
    caption: `${kod} · son paylaşım ${tarihUzun(sec.tarih)}\nMağazada var mı?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Mağazada var", callback_data: `sv:${kod}` }, { text: "❌ Yok", callback_data: `sy:${kod}` }]] },
  });
}

// Cevap bekleyen modelleri, o anda ulaşılamamış ya da sonradan eklenmiş kişilere de gönderir
// (ör. /start'ı geç yazan). Kim önce basarsa geçerli; diğerlerinde düğmeler kapanır.
const EKSIK_PARTI = 10;
export async function eksikleriGonder(env, simdi) {
  const s = saat(simdi);
  if (s < 9 || s >= 21) return;
  const modeller = await oku(env, "selin:modeller", {});
  const bekleyen = Object.entries(modeller).filter(([, m]) => m.durum === "soruldu");
  if (!bekleyen.length) return;
  const bilgi = await kanalBilgisi(env);
  if (!bilgi.kanal) return;
  const ulasilamayan = new Set();
  const yeni = {}; // kod → bu çalışmada gönderilen [kişi, mesaj]
  let gonderilen = 0;
  for (const [kod, m] of bekleyen) {
    const sahip = new Set((m.mesajlar || []).map(([k]) => String(k)));
    const eksik = kisiler(env).filter((k) => !sahip.has(k) && !ulasilamayan.has(k));
    if (!eksik.length) continue;
    const sec = modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz)[0];
    if (!sec) continue;
    for (const k of eksik) {
      if (gonderilen >= EKSIK_PARTI) break;
      const r = await soruKarti(env, bilgi, kod, sec, k);
      gonderilen++;
      if (r.ok) (yeni[kod] = yeni[kod] || []).push([k, r.result.message_id]);
      else ulasilamayan.add(k); // bu çalışmada bir daha denenmez (ör. /start yazmamış)
    }
  }
  if (!Object.keys(yeni).length) return;
  // Gönderirken biri düğmeye basmış olabilir: güncel kaydı okuyup sadece mesajları ekle.
  const guncel = await oku(env, "selin:modeller", {});
  for (const [kod, liste] of Object.entries(yeni)) {
    const m = guncel[kod];
    if (m && m.durum === "soruldu") m.mesajlar = [...(m.mesajlar || []), ...liste];
    else for (const [k, id] of liste) await tg(env, "editMessageReplyMarkup", { chat_id: k, message_id: id, reply_markup: { inline_keyboard: [] } });
  }
  await yazKV(env, "selin:modeller", guncel);
}

export async function listeAdimi(env, simdi) {
  if (!(await env.KAYIT.get("selin:rehberOnay"))) return; // rehber onaylanmadan başlamaz
  const s = saat(simdi);
  if (s < 9 || s >= 21) return;
  const gun = gunAnahtari(simdi);
  const hedef = await gunlukHedef(env, simdi);
  const sayac = Number((await env.KAYIT.get(`selin:liste:${gun}`)) || 0);
  if (sayac >= hedef) return;
  const bilgi = await kanalBilgisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const adaylar = listeAdaylari(bilgi, modeller, simdi).slice(0, Math.min(LISTE_PARTI, hedef - sayac));
  if (!adaylar.length) return;
  if (sayac === 0) await herkese(env, `🌸 Ben Selin. Bugün ${hedef} model soracağım: mağazada olanlar için siteye hazırlık yapacağım. Her modelde ✅ Mağazada var / ❌ Yok'a basın.`);
  let sorulan = 0;
  const ulasilamayan = {};
  for (const { kod, sec } of adaylar) {
    const mesajlar = [];
    let sorun = null;
    for (const k of kisiler(env)) {
      const r = await soruKarti(env, bilgi, kod, sec, k);
      if (r.ok) mesajlar.push([k, r.result.message_id]);
      else {
        sorun = r.description || "gönderilemedi";
        if (!/message to copy not found|message_id_invalid/i.test(sorun)) ulasilamayan[k] = sorun;
      }
    }
    // Paylaşım kanaldan silinmiş: bu model bir daha sorulmaz, sıradakine geçilir.
    if (!mesajlar.length && /message to copy not found|message_id_invalid/i.test(sorun)) {
      modeller[kod] = { durum: "kanaldayok", zaman: simdi, mesajlar: [] };
      continue;
    }
    // Kimseye ulaşmadıysa (ör. kimse Selin'e /start yazmadı) model "soruldu" sayılmaz, günlük hak harcanmaz.
    if (!mesajlar.length) {
      await yazKV(env, "selin:hata", { zaman: simdi, hata: `liste ${kod}: ${sorun}` }, 7 * 86400);
      break;
    }
    modeller[kod] = { durum: "soruldu", zaman: simdi, mesajlar };
    sorulan++;
  }
  // Kime neden ulaşılamadığı (ör. /start yazmamış) — sadece değişince yazılır.
  const onceki = await oku(env, "selin:ulasilamayan", {});
  if (JSON.stringify(Object.keys(onceki).sort()) !== JSON.stringify(Object.keys(ulasilamayan).sort())) await yazKV(env, "selin:ulasilamayan", ulasilamayan);
  if (!sorulan && !Object.values(modeller).some((m) => m.durum === "kanaldayok" && m.zaman === simdi)) return;
  // Gönderirken başka modellerde düğmeye basılmış olabilir: güncel kayda sadece yenileri ekle.
  const guncel = await oku(env, "selin:modeller", {});
  for (const { kod } of adaylar) if (modeller[kod] && modeller[kod].zaman === simdi) guncel[kod] = modeller[kod];
  await yazKV(env, "selin:modeller", guncel);
  await env.KAYIT.put(`selin:liste:${gun}`, String(sayac + sorulan), { expirationTtl: 3 * 86400 });
}

// ---------- 2) Hazırlık: pozlar, netlik, açıklama, bedenler ----------

async function hazirlaGuvenli(env, simdi) {
  try {
    await hazirlaAdimi(env, simdi);
  } catch (e) {
    await yazKV(env, "selin:hata", { zaman: simdi, hata: String(e && e.message).slice(0, 500) }, 7 * 86400);
  }
}

function enYakinBoyut(boyutlar, hedef) {
  const s = [...boyutlar].sort((a, b) => a.width - b.width);
  return s.find((p) => p.width >= hedef) || s[s.length - 1];
}

async function dosyaB64(env, fileId) {
  const f = await tg(env, "getFile", { file_id: fileId });
  if (!f.ok) throw new Error(`getFile: ${f.description}`);
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  const b = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

// Modelin en yeni paylaşımlarındaki bütün medya (arşiv kanalına iletilerek okunur; aynı fotoğraf tekrarsız).
export async function medyaTopla(env, bilgi, kod) {
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv) throw new Error("arşiv kanalı yok");
  const fotolar = [];
  const videolar = [];
  const yazilar = [];
  const gorulen = new Set();
  for (const sec of modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz, PAYLASIM_EN_FAZLA)) {
    for (const id of sec.ids) {
      const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: bilgi.kanal.id, message_id: id, disable_notification: true });
      if (!r.ok) continue;
      const m = r.result;
      if (m.caption) yazilar.push(m.caption);
      if (m.photo) {
        const buyuk = m.photo[m.photo.length - 1];
        if (gorulen.has(buyuk.file_unique_id)) continue;
        gorulen.add(buyuk.file_unique_id);
        if (fotolar.length < POZ_EN_FAZLA) fotolar.push({ id, buyuk, orta: enYakinBoyut(m.photo, 800), tarih: sec.tarih });
      } else if (m.video && !gorulen.has(m.video.file_unique_id)) {
        gorulen.add(m.video.file_unique_id);
        videolar.push({ id, sure: m.video.duration });
      }
    }
  }
  return { fotolar, videolar, yazilar };
}

async function aciklamaYaz(env, { kod, fotolar, tarif, yazilar, duzeltme, onceki }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const content = [];
  for (const [i, f] of fotolar.entries()) content.push({ type: "text", text: `Poz ${i + 1}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.b64 } });
  content.push({
    type: "text",
    text: `${REHBER}

VOLONTE modeli ${kod} için site metni hazırla.
Katalog tarifi: ${tarif || "yok"}
Kanal alt yazıları: ${yazilar.slice(0, 3).join(" | ").slice(0, 1200) || "yok"}
${onceki ? `Önceki taslak: ${JSON.stringify(onceki)}` : ""}
${duzeltme ? `Sahibin düzeltme isteği (uygula): ${duzeltme}` : ""}
Her poz için net mi (bulanık/odak dışı/çok karanlık değil mi) değerlendir; ürün görünmüyorsa da net=false. kategori: ${KATEGORILER.join(", ")}.`,
  });
  const r = await client.beta.messages.create({
    model, max_tokens: 3000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            baslik: { type: "string" },
            kategori: { type: "string", enum: KATEGORILER },
            aciklama: { type: "object", properties: { en: { type: "string" }, fr: { type: "string" }, pt: { type: "string" }, tr: { type: "string" } }, required: ["en", "fr", "pt", "tr"], additionalProperties: false },
            pozlar: { type: "array", items: { type: "object", properties: { poz: { type: "integer" }, net: { type: "boolean" }, not: { type: "string" } }, required: ["poz", "net", "not"], additionalProperties: false } },
          },
          required: ["baslik", "kategori", "aciklama", "pozlar"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content }],
  });
  await harcamaEkle(env, model, r.usage);
  if (r.stop_reason === "refusal") throw new Error("model isteği reddetti");
  return JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export function bedenBul(yazilar) {
  for (const y of yazilar) {
    const b = eskiBilgiler(y).beden;
    if (b) {
      const sayilar = b.match(/\d{2}/g);
      if (sayilar && sayilar.length >= 2) return [...new Set(sayilar)].join("-");
      const harf = b.match(/\b(XS|S|M|L|XL|XXL|3XL|4XL)\b/gi);
      if (harf) return harf.map((x) => x.toUpperCase()).join("-");
    }
  }
  return null;
}

export async function hazirlaAdimi(env, simdi) {
  if (!env.ANTHROPIC_API_KEY || !env.BOT_TOKEN || (await sinirAsildiMi(env, simdi))) return;
  const sira = await oku(env, "selin:hazirla", []);
  if (!sira.length) return;
  const kod = sira[0];
  await yazKV(env, "selin:hazirla", sira.slice(1));
  await taslakHazirla(env, kod, simdi, null);
}

async function taslakHazirla(env, kod, simdi, duzeltme) {
  const bilgi = await kanalBilgisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const onceki = modeller[kod] && modeller[kod].taslak;
  let fotolar;
  let videolar;
  let yazilar;
  if (onceki && duzeltme) {
    ({ videolar, yazilar } = onceki);
    fotolar = onceki.fotolar.filter((f) => f.net);
  } else {
    ({ fotolar, videolar, yazilar } = await medyaTopla(env, bilgi, kod));
  }
  if (!fotolar.length) {
    modeller[kod] = { ...(modeller[kod] || {}), durum: "eklenmeyecek", zaman: simdi, not: "fotoğraf yok" };
    await yazKV(env, "selin:modeller", modeller);
    return herkese(env, `⚠️ ${kod}: kanalda fotoğrafı bulunamadı; siteye hazırlanamadı.`);
  }
  for (const f of fotolar) f.b64 = await dosyaB64(env, (f.orta || f.buyuk).file_id);
  const ai = await aciklamaYaz(env, { kod, fotolar, tarif: bilgi.tarifler[kod] && bilgi.tarifler[kod].t, yazilar, duzeltme, onceki: onceki && { baslik: onceki.baslik, aciklama: onceki.aciklama } });
  const netlik = new Map((ai.pozlar || []).map((p) => [p.poz, p]));
  const pozlar = fotolar.map((f, i) => {
    const n = netlik.get(i + 1);
    const dusuk = Math.max(f.buyuk.width, f.buyuk.height) < DUSUK_COZUNURLUK;
    return { id: f.id, buyuk: f.buyuk, orta: f.orta, net: (!n || n.net) && !dusuk, not: dusuk ? "düşük çözünürlük" : n && !n.net ? n.not || "bulanık" : "" };
  });
  const taslak = {
    baslik: ai.baslik, kategori: ai.kategori, aciklama: ai.aciklama,
    bedenler: (onceki && onceki.bedenler) || bedenBul(yazilar),
    fotolar: pozlar, videolar, yazilar: yazilar.slice(0, 3),
  };
  modeller[kod] = { ...(modeller[kod] || {}), durum: "onayda", zaman: simdi, taslak };
  await yazKV(env, "selin:modeller", modeller);
  await onayKartiGonder(env, kod, taslak, bilgi);
}

async function onayKartiGonder(env, kod, t, bilgi) {
  const netler = t.fotolar.filter((f) => f.net);
  const atilan = t.fotolar.filter((f) => !f.net);
  for (const k of kisiler(env)) {
    if (netler.length > 1) await tg(env, "sendMediaGroup", { chat_id: k, media: netler.slice(0, 10).map((f) => ({ type: "photo", media: f.buyuk.file_id })) });
    else if (netler.length === 1) await tg(env, "sendPhoto", { chat_id: k, photo: netler[0].buyuk.file_id });
  }
  const kanalAdi = bilgi.kanal && bilgi.kanal.kullanici;
  const metin = [
    `🌸 ${kod} — siteye hazır taslak`,
    `Başlık: ${t.baslik} (${t.kategori})`,
    `Bedenler: ${t.bedenler || "BULUNAMADI — /beden " + kod + " 38-40-42 şeklinde yazın"}`,
    `Pozlar: ${netler.length} net${atilan.length ? `; konmayacak ${atilan.length}: ${atilan.map((f) => `${kanalAdi ? `t.me/${kanalAdi}/${f.id}` : f.id} (${f.not})`).join(", ")}` : ""}`,
    `Videolar: ${t.videolar.length ? `${t.videolar.length} (sitede Telegram oynatıcısıyla)` : "yok"}`,
    "",
    `EN: ${t.aciklama.en}`,
    "",
    `TR (kontrol için): ${t.aciklama.tr}`,
  ].join("\n");
  const mesajlar = await herkese(env, metin.slice(0, 4000), {
    reply_markup: { inline_keyboard: [[{ text: "✅ Onayla, siteye yükle", callback_data: `so:${kod}` }], [{ text: "✏️ Düzelt", callback_data: `sd:${kod}` }, { text: "❌ Ekleme", callback_data: `sx:${kod}` }]] },
  });
  const modeller = await oku(env, "selin:modeller", {});
  if (modeller[kod]) {
    modeller[kod].kart = mesajlar;
    await yazKV(env, "selin:modeller", modeller);
  }
}

// ---------- 3) Siteye yükleme (GitHub, tek commit) ----------

async function gh(env, yol, secenek = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${yol}`, {
    ...secenek,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "volonte-selin", "x-github-api-version": "2022-11-28", ...(secenek.body ? { "content-type": "application/json" } : {}) },
  });
  const govde = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${govde.message || ""}`);
  return govde;
}

async function siteVerisi(env) {
  try {
    const d = await gh(env, "/contents/veri/urunler.json?ref=main");
    return { liste: JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, ""))))), sha: d.sha };
  } catch (e) {
    if (/404/.test(e.message)) return { liste: [], sha: null };
    throw e;
  }
}

const b64Metin = (s) => btoa(unescape(encodeURIComponent(s)));

// dosyalar: [{ yol, b64 }] (null b64 = sil) + yeni ürün listesi → tek commit
export async function siteyeYaz(env, dosyalar, liste, mesaj) {
  const ref = await gh(env, "/git/ref/heads/main");
  const sonCommit = await gh(env, `/git/commits/${ref.object.sha}`);
  const agac = [];
  for (const d of dosyalar) {
    if (d.b64 === null) agac.push({ path: d.yol, mode: "100644", type: "blob", sha: null });
    else {
      const blob = await gh(env, "/git/blobs", { method: "POST", body: JSON.stringify({ content: d.b64, encoding: "base64" }) });
      agac.push({ path: d.yol, mode: "100644", type: "blob", sha: blob.sha });
    }
  }
  agac.push({ path: "veri/urunler.json", mode: "100644", type: "blob", content: JSON.stringify(liste, null, 1) + "\n" });
  const yeniAgac = await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: sonCommit.tree.sha, tree: agac }) });
  const commit = await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message: mesaj, tree: yeniAgac.sha, parents: [ref.object.sha] }) });
  await gh(env, "/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return commit.sha;
}

async function siteyeYukle(env, kod, kim, simdi) {
  const modeller = await oku(env, "selin:modeller", {});
  const t = modeller[kod] && modeller[kod].taslak;
  const bilgi = await kanalBilgisi(env);
  const netler = t.fotolar.filter((f) => f.net);
  const dosyalar = [];
  for (const [i, f] of netler.entries()) dosyalar.push({ yol: `galeri/${kod}/${i + 1}.jpg`, b64: await dosyaB64(env, f.buyuk.file_id) });
  const { liste } = await siteVerisi(env);
  const urun = {
    kod, baslik: t.baslik, kategori: t.kategori, aciklama: { en: t.aciklama.en, fr: t.aciklama.fr, pt: t.aciklama.pt },
    bedenler: t.bedenler, fotolar: dosyalar.map((d) => d.yol),
    videolar: t.videolar.map((v) => `${bilgi.kanal.kullanici}/${v.id}`),
    fiyat: null, // Vegawin köprüsü kurulunca Selin dolduracak
    eklenme: gunAnahtari(simdi),
  };
  const yeniListe = [urun, ...liste.filter((u) => u.kod !== kod)];
  await siteyeYaz(env, dosyalar, yeniListe, `Selin: ${kod} siteye eklendi (onaylayan: ${kim})`);
  modeller[kod] = { ...modeller[kod], durum: "sitede", zaman: simdi, onaylayan: kim };
  await yazKV(env, "selin:modeller", modeller);
  return `${env.SITE_URL}/urun.html?kod=${encodeURIComponent(kod)}`;
}

async function sitedenKaldir(env, kod, kim, simdi) {
  const { liste } = await siteVerisi(env);
  const urun = liste.find((u) => u.kod === kod);
  if (!urun) return false;
  await siteyeYaz(env, urun.fotolar.map((yol) => ({ yol, b64: null })), liste.filter((u) => u.kod !== kod), `Selin: ${kod} siteden kaldırıldı (${kim})`);
  const modeller = await oku(env, "selin:modeller", {});
  modeller[kod] = { ...(modeller[kod] || {}), durum: "kaldirildi", zaman: simdi };
  await yazKV(env, "selin:modeller", modeller);
  return true;
}

// ---------- 4) Telegram: düğmeler ve komutlar ----------

export async function guncelleme(u, env) {
  if (u.callback_query) return dugme(u.callback_query, env);
  const m = u.message;
  if (!m || m.chat.type !== "private" || !m.from) return;
  if (!izinli(m.from.id, env)) {
    await env.KAYIT.put(`selin:bekleyen:${m.from.id}`, JSON.stringify({ ad: kisiAdi(m.from), kullanici: m.from.username || null }), { expirationTtl: 7 * 86400 });
    return; // Selin sadece yöneticiler ve ekiple konuşur
  }
  const simdi = Math.floor(Date.now() / 1000);
  const yaz = (text, ek = {}) => tg(env, "sendMessage", { chat_id: m.chat.id, text, disable_web_page_preview: true, ...ek });
  const metin = (m.text || "").trim();
  const [komut, ...arg] = metin.split(/\s+/);

  const duzeltilen = await env.KAYIT.get(`selin:duzelt:${m.from.id}`);
  if (duzeltilen && metin && !metin.startsWith("/")) {
    await env.KAYIT.delete(`selin:duzelt:${m.from.id}`);
    await yaz(`✏️ ${duzeltilen} düzeltiliyor...`);
    await taslakHazirla(env, duzeltilen, simdi, metin.slice(0, 800));
    return;
  }
  if (komut === "/beden") {
    const kod = String(arg[0] || "").toUpperCase();
    const bedenler = arg.slice(1).join(" ").replace(/[,/ ]+/g, "-");
    const modeller = await oku(env, "selin:modeller", {});
    if (!modeller[kod] || !modeller[kod].taslak || !bedenler) return yaz("Örnek: /beden 3194 38-40-42-44");
    modeller[kod].taslak.bedenler = bedenler;
    await yazKV(env, "selin:modeller", modeller);
    return yaz(`✅ ${kod} bedenleri: ${bedenler}. Karttaki "✅ Onayla, siteye yükle"ye basabilirsiniz.`);
  }
  if (komut === "/site") return siteListesi(env, m.chat.id, Number(arg[0] || 1));
  if (komut === "/liste") {
    if (!yoneticiMi(m.from.id, env)) return yaz("Bu ayar sadece Murat ve Merdan'da.");
    const gun = gunAnahtari(simdi);
    await env.KAYIT.put(`selin:liste:${gun}`, "0", { expirationTtl: 3 * 86400 });
    return yaz("Tamam, liste birkaç dakika içinde gelecek (09:00–21:00 arası).");
  }
  const modeller = await oku(env, "selin:modeller", {});
  const say = (d) => Object.values(modeller).filter((x) => x.durum === d).length;
  return yaz([
    "🌸 Ben Selin, VOLONTE sitesini dolduruyorum.",
    `Sitede: ${say("sitede")} · onay bekleyen: ${say("onayda")} · hazırlanacak: ${(await oku(env, "selin:hazirla", [])).length} · cevap bekleyen: ${say("soruldu")}`,
    `Günlük hedef: ${await gunlukHedef(env, simdi)} model.`,
    "",
    "/site — sitedeki modeller ve kaldırma",
    "/beden 3194 38-40-42 — beden yaz",
    "/liste — bugünün listesini yeniden başlat",
    `Site: ${env.SITE_URL}`,
  ].join("\n"));
}

async function siteListesi(env, sohbet, sayfa) {
  const { liste } = await siteVerisi(env);
  if (!liste.length) return tg(env, "sendMessage", { chat_id: sohbet, text: "Sitede henüz Selin'in eklediği model yok." });
  const boy = 20;
  const parca = liste.slice((sayfa - 1) * boy, sayfa * boy);
  return tg(env, "sendMessage", {
    chat_id: sohbet,
    text: `Sitedeki modeller (${liste.length}) — sayfa ${sayfa}:\n${parca.map((u) => `• ${u.kod} — ${u.baslik} · ${env.SITE_URL}/urun.html?kod=${encodeURIComponent(u.kod)}`).join("\n")}\n\nKaldırmak için düğmeye basın (onay sorulur). Sonraki sayfa: /site ${sayfa + 1}`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: parca.map((u) => [{ text: `🗑 ${u.kod} siteden kaldır`, callback_data: `sk:${u.kod}` }]) },
  });
}

async function dugme(cq, env) {
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!izinli(cq.from.id, env)) return cevapla("Yetkiniz yok.");
  const [islem, kod] = String(cq.data || "").split(":");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];

  if (islem === "sv" || islem === "sy") {
    if (!m || m.durum !== "soruldu") return cevapla(m ? `${m.kim || "Biri"} zaten işaretledi.` : "Geçersiz.");
    m.durum = islem === "sv" ? "hazirlaniyor" : "yok";
    m.zaman = simdi;
    m.kim = kim;
    await yazKV(env, "selin:modeller", modeller);
    if (islem === "sv") await yazKV(env, "selin:hazirla", [...(await oku(env, "selin:hazirla", [])), kod]);
    for (const [k, id] of m.mesajlar || []) {
      await tg(env, "editMessageCaption", { chat_id: k, message_id: id, caption: `${kod} — ${islem === "sv" ? `✅ mağazada var (${kim}); hazırlanıyor` : `❌ yok (${kim})`}`, reply_markup: { inline_keyboard: [] } });
    }
    return cevapla(islem === "sv" ? "Hazırlığa alındı" : "Tamam");
  }
  if (islem === "so" || islem === "sx" || islem === "sd") {
    if (!m || m.durum !== "onayda") return cevapla("Bu taslak artık geçerli değil.");
    if (islem === "sd") {
      await env.KAYIT.put(`selin:duzelt:${cq.from.id}`, kod, { expirationTtl: 86400 });
      await cevapla("Ne değişsin?");
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod}: ne değişsin? Yazın (ör. "açıklamada saten kumaş geçsin", "başlık: Satin Wrap Dress", "2. pozu çıkar").` });
    }
    if (islem === "so" && !m.taslak.bedenler) return cevapla(`Önce bedenleri yazın: /beden ${kod} 38-40-42`);
    m.durum = islem === "so" ? "yukleniyor" : "eklenmeyecek";
    m.kim = kim;
    await yazKV(env, "selin:modeller", modeller); // önce kilitle
    const kartlar = m.kart || [];
    if (islem === "sx") {
      await cevapla("Eklenmeyecek");
      for (const [k, id] of kartlar) await tg(env, "editMessageText", { chat_id: k, message_id: id, text: `❌ ${kod}: siteye eklenmeyecek (${kim}).` });
      return;
    }
    await cevapla("Siteye yükleniyor...");
    try {
      const link = await siteyeYukle(env, kod, kim, simdi);
      for (const [k, id] of kartlar) await tg(env, "editMessageText", { chat_id: k, message_id: id, text: `✅ ${kod} siteye eklendi (${kim}). Sayfa 1–2 dakikada yayında:\n${link}`, disable_web_page_preview: true });
    } catch (e) {
      const geri = await oku(env, "selin:modeller", {});
      geri[kod].durum = "onayda";
      await yazKV(env, "selin:modeller", geri);
      await herkese(env, `⚠️ ${kod} siteye yüklenemedi: ${e.message}. Taslak duruyor, tekrar deneyebilirsiniz.`);
    }
    return;
  }
  if (islem === "sk") {
    await cevapla("Emin misiniz?");
    return tg(env, "editMessageReplyMarkup", { ...benim, reply_markup: { inline_keyboard: [[{ text: `🗑 Evet, ${kod} siteden kalksın`, callback_data: `se:${kod}` }, { text: "↩️ Vazgeç", callback_data: "sv0:" }]] } });
  }
  if (islem === "se") {
    await cevapla("Kaldırılıyor...");
    try {
      const ok = await sitedenKaldir(env, kod, kim, simdi);
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: ok ? `🗑 ${kod} siteden kaldırıldı (${kim}). Kanaldaki paylaşımlara dokunulmadı.` : `${kod} sitede değil.` });
    } catch (e) {
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⚠️ Kaldırılamadı: ${e.message}` });
    }
  }
  if (islem === "sv0") return cevapla("Vazgeçildi");
  return cevapla("Geçersiz düğme.");
}
