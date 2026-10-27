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
import { eskiBilgiler, BEDEN_GRUPLARI, bedenOnerisi } from "./altyazi.js";
import { karmaDepo, gocBirKez, SELIN_YEREL } from "./depo.js";

const SAAT_FARKI = 3 * 3600;
const ILK_HAFTA_GUNLUK = 50; // kullanıcı kararı (22 Ekim): ilk hafta günde 50 model
const SONRA_GUNLUK = 10;
const LISTE_PARTI = 8; // bir çalışmada sorulan model
const PAYLASIM_EN_FAZLA = 4; // bir modelin en yeni kaç paylaşımından poz toplanır
const POZ_EN_FAZLA = 10;
const ILETME_EN_FAZLA = 12; // bir hazırlıkta arşive iletilen mesaj (ücretsiz pakette çalışma başına 50 istek)
const DUSUK_COZUNURLUK = 700; // piksel (genişlik ya da yükseklik); altı "düşük çözünürlük"
const GUNCELLEMELER = ["message", "callback_query"];
// Sitedeki kategoriler (js/urunler.js ile aynı kimlikler) ve kartta gösterilen Türkçe adları.
export const KATEGORI_ADI = {
  dresses: "Elbise", evening: "Abiye", sets: "Takım", jumpsuits: "Tulum",
  tops: "Bluz / Gömlek / Tunik", skirts: "Etek", trousers: "Pantolon", outerwear: "Ceket / Kaban",
};
const KATEGORILER = Object.keys(KATEGORI_ADI);

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

async function tg(env, metod, govde, deneme = 0) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde),
  });
  const j = await r.json();
  // Telegram "çok hızlı" derse (429) kısa bekleyip bir kez daha dene.
  const bekle = j && j.error_code === 429 && j.parameters && j.parameters.retry_after;
  if (bekle && bekle <= 15 && !deneme) {
    await new Promise((ok) => setTimeout(ok, bekle * 1000));
    return tg(env, metod, govde, 1);
  }
  return j;
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

// Duraklatma anahtarı: 0 = çalışıyor. (23 Ekim'de süresiz durdurulmuştu; kullanıcı 27 Ekim'de "Selin'i başlat" dedi.)
// Yeniden durdurmak için Infinity yapılır: liste/hazırlık/mesaj olmaz, kayıtlara dokunulmaz.
const DURAKLAT_BITIS = 0;
export const duraklatildi = (simdi) => simdi < DURAKLAT_BITIS;

// Selin'in bütün işleri kendi Durable Object'inde ("selin") çalışır: "selin:*" kayıtları orada
// (KV günlük yazma sınırı). Hata/durum kayıtları izlenebilsin diye KV'de kalır (depo.js).
const selinNesne = (env) => env.SELIN.get(env.SELIN.idFromName("selin"), { locationHint: "enam" });

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      const u = await istek.json();
      if (duraklatildi(Math.floor(Date.now() / 1000))) {
        // Mesaj gönderilmez, kayıt yazılmaz; düğmeye basana sadece kısa bir uyarı (sohbete düşmez).
        if (u.callback_query) await tg(env, "answerCallbackQuery", { callback_query_id: u.callback_query.id, text: "Selin şu an durduruldu; yeniden başlatılınca devam edecek.", show_alert: true });
        return new Response("ok");
      }
      if (env.SELIN) await selinNesne(env).fetch("https://selin/guncelleme", { method: "POST", body: JSON.stringify(u) });
      else await guncelleme(u, env);
      return new Response("ok");
    }
    if (istek.method === "GET" && url.pathname === "/video") {
      if (env.SELIN) return selinNesne(env).fetch(`https://selin/video?t=${encodeURIComponent(url.searchParams.get("t") || "")}`);
      return videoVer(env, url.searchParams.get("t"));
    }
    if (istek.method === "POST" && url.pathname === "/kare") {
      const govde = await istek.json().catch(() => ({}));
      if (env.SELIN) return selinNesne(env).fetch("https://selin/kare-geldi", { method: "POST", body: JSON.stringify(govde) });
      return kareGeldi(env, govde, Math.floor(Date.now() / 1000));
    }
    return new Response("Selin çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    if (env.SELIN) {
      const nesne = selinNesne(env);
      // Durduruluyken bile kayıtlar bir kez kopyalanıp kontrol edilir (mesaj gönderilmez).
      if (duraklatildi(Math.floor(Date.now() / 1000))) return void (await nesne.fetch("https://selin/goc", { method: "POST" }));
      await nesne.fetch("https://selin/cron", { method: "POST" });
      await nesne.fetch("https://selin/hazirla", { method: "POST" }); // ayrı istekler: her birinin kendi istek sınırı
      await nesne.fetch("https://selin/kare", { method: "POST" });
      return;
    }
    if (duraklatildi(Math.floor(Date.now() / 1000))) return;
    await selinCron(env, Math.floor(Date.now() / 1000));
    await hazirlaGuvenli(env, Math.floor(Date.now() / 1000));
    await kareSiraGuvenli(env, Math.floor(Date.now() / 1000));
  },
};

async function selinCron(env, simdi) {
  await webhookKur(env);
  await githubKontrol(env, simdi);
  await fotografYokGocu(env, simdi);
  await listeAdimi(env, simdi);
  await ozetAdimi(env, simdi);
  await siteStokEsitle(env, simdi);
}

export class SelinDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(istek) {
    const url = new URL(istek.url);
    await gocBirKez(this.state, this.env.KAYIT, SELIN_YEREL, "selin"); // ilk seferde KV'den kopyala + kontrol (silmez)
    const env = { ...this.env, KAYIT: karmaDepo(this.env.KAYIT, this.state.storage, SELIN_YEREL) };
    const simdi = Math.floor(Date.now() / 1000);
    switch (url.pathname) {
      case "/goc": return new Response("ok");
      case "/guncelleme": await guncelleme(await istek.json(), env); return new Response("ok");
      case "/cron": await selinCron(env, simdi); return new Response("ok");
      case "/kare": await kareSiraGuvenli(env, simdi); return new Response("ok");
      case "/video": return videoVer(env, url.searchParams.get("t"));
      case "/kare-geldi": return kareGeldi(env, await istek.json().catch(() => ({})), simdi);
      default: await hazirlaGuvenli(env, simdi); return new Response("ok");
    }
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

// ---------- 1) Model listesi ----------
// Kullanıcı kararı (27 Ekim): mesaj az olsun. Vegawin'de (Sayım Sami) stokta olan model sorulmadan
// hazırlığa girer; stoğu bitmiş/gizlenmiş model hiç sorulmaz; Vegawin'de olmayan model "sorulacak"
// olur ve sadece günün özetinden (11:00, 16:00) "Soruları göster" ile isteyene gösterilir.

export async function gunlukHedef(env, simdi) {
  let d = await oku(env, "selin:durum", null);
  if (!d) {
    d = { baslangic: simdi };
    await yazKV(env, "selin:durum", d);
  }
  return simdi - d.baslangic < 7 * 86400 ? ILK_HAFTA_GUNLUK : SONRA_GUNLUK;
}

// Vegawin stok bilgisi (Kemal'deki StokDO): kod → { toplam, fiyat, gizli }. Köprü yoksa {}.
export async function stokBilgisi(env, kodlar) {
  if (!env.STOK || !kodlar.length) return {};
  try {
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/toplu", { method: "POST", body: JSON.stringify({ kodlar }) });
    return await r.json();
  } catch {
    return {};
  }
}

export function listeAdaylari(bilgi, modeller, simdi, stok = {}) {
  return Object.keys(bilgi.kodlar)
    .filter((k) => !bilgi.silinenler[k] && !(bilgi.atlananlar[k] > simdi + 365 * 86400))
    .filter((k) => !(stok[k] && stok[k].gizli)) // stoğu bitmiş ya da "Sil" ile gizlenmiş: sorulmaz
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
  const stok = await stokBilgisi(env, Object.keys(bilgi.kodlar));
  const adaylar = listeAdaylari(bilgi, modeller, simdi, stok).slice(0, Math.min(LISTE_PARTI, hedef - sayac));
  if (!adaylar.length) return;
  const hazirla = await oku(env, "selin:hazirla", []);
  for (const { kod } of adaylar) {
    if (stok[kod] && stok[kod].toplam > 0) {
      modeller[kod] = { durum: "hazirlaniyor", zaman: simdi, kim: "Vegawin (stokta)", mesajlar: [] };
      if (!hazirla.includes(kod)) hazirla.push(kod);
    } else modeller[kod] = { durum: "sorulacak", zaman: simdi, mesajlar: [] };
  }
  await yazKV(env, "selin:modeller", modeller);
  await yazKV(env, "selin:hazirla", hazirla);
  await env.KAYIT.put(`selin:liste:${gun}`, String(sayac + adaylar.length), { expirationTtl: 3 * 86400 });
}

// ---------- Özet: günde iki kez tek mesaj; ayrıntı isteyene gösterilir ----------

const OZET_SAATLERI = [11, 16];
const GOSTER_PARTI = 5;

// Kendiliğinden gönderilecek uyarılar tek tek mesaj olmaz; özete eklenir.
async function notEkle(env, metin) {
  const notlar = await oku(env, "selin:notlar", []);
  await yazKV(env, "selin:notlar", [...notlar, metin].slice(-30));
}

async function bekleyenler(env) {
  const modeller = await oku(env, "selin:modeller", {});
  const sorular = Object.keys(modeller).filter((k) => ["sorulacak", "soruldu"].includes(modeller[k].durum));
  const kartlar = Object.keys(modeller).filter((k) => modeller[k].durum === "onayda");
  const kareler = [];
  for (const kod of await oku(env, "selin:kareBekleyen", [])) {
    const k = await env.KAYIT.get(`kare:${kod}`, "json");
    if (k && k.durum === "onayda") kareler.push(kod);
  }
  return { modeller, sorular, kartlar, kareler };
}

export async function ozetAdimi(env, simdi) {
  const s = Math.floor(saat(simdi));
  if (!OZET_SAATLERI.includes(s)) return;
  const anahtar = `selin:ozet:${gunAnahtari(simdi)}:${s}`;
  if (await env.KAYIT.get(anahtar)) return;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 2 * 86400 });
  const { sorular, kartlar, kareler } = await bekleyenler(env);
  const notlar = await oku(env, "selin:notlar", []);
  if (!sorular.length && !kartlar.length && !kareler.length && !notlar.length) return;
  const satirlar = ["🌸 Selin — özet"];
  if (kartlar.length) satirlar.push(`• Siteye hazır taslak: ${kartlar.length} (onayınızı bekliyor)`);
  if (kareler.length) satirlar.push(`• Videodan kare seçilecek: ${kareler.length}`);
  if (sorular.length) satirlar.push(`• Vegawin'de olmayan, "mağazada var mı?" sorusu: ${sorular.length}`);
  if (notlar.length) satirlar.push("", "Notlar:", ...notlar.slice(-10).map((n) => `• ${n}`));
  satirlar.push("", "Görmek istediğinize basın; sadece size 5'er 5'er gelir. Kim önce karar verirse o geçerli.");
  const dugmeler = [
    ...(kartlar.length ? [{ text: `🖼 Taslaklar (${kartlar.length})`, callback_data: "sg:k" }] : []),
    ...(kareler.length ? [{ text: `🎞 Kareler (${kareler.length})`, callback_data: "sg:f" }] : []),
    ...(sorular.length ? [{ text: `❓ Sorular (${sorular.length})`, callback_data: "sg:s" }] : []),
  ];
  await herkese(env, satirlar.join("\n").slice(0, 4000), dugmeler.length ? { reply_markup: { inline_keyboard: [dugmeler] } } : {});
  await yazKV(env, "selin:notlar", []);
}

// "Göster" düğmesi: o türden bu kişiye henüz gösterilmemiş en fazla 5 öğe sadece ona gönderilir.
async function goster(env, cq, tur) {
  const kisi = String(cq.from.id);
  const { modeller, sorular, kartlar, kareler } = await bekleyenler(env);
  const gorduMu = (liste) => (liste || []).some(([k]) => String(k) === kisi);
  let gonderilen = 0;
  if (tur === "s") {
    const bilgi = await kanalBilgisi(env);
    for (const kod of sorular.filter((k) => !gorduMu(modeller[k].mesajlar)).slice(0, GOSTER_PARTI)) {
      const sec = modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz)[0];
      const r = sec ? await soruKarti(env, bilgi, kod, sec, kisi) : { ok: false };
      if (!r.ok) continue;
      modeller[kod] = { ...modeller[kod], durum: "soruldu", mesajlar: [...(modeller[kod].mesajlar || []), [kisi, r.result.message_id]] };
      gonderilen++;
    }
  } else if (tur === "k") {
    for (const kod of kartlar.filter((k) => !gorduMu(modeller[k].kart)).slice(0, GOSTER_PARTI)) if (await kartGoster(env, kod, kisi)) gonderilen++;
  } else if (tur === "f") {
    for (const kod of kareler.slice(0, 20)) {
      if (gonderilen >= GOSTER_PARTI) break;
      const k = await env.KAYIT.get(`kare:${kod}`, "json");
      if (gorduMu(k.kart)) continue;
      const r1 = k.adaylar.length > 1
        ? await tg(env, "sendMediaGroup", { chat_id: kisi, media: k.adaylar.map((a, i) => ({ type: "photo", media: a.file_id, ...(i === 0 ? { caption: `🎞 ${kod} — videodan seçilen kareler` } : {}) })) })
        : await tg(env, "sendPhoto", { chat_id: kisi, photo: k.adaylar[0].file_id, caption: `🎞 ${kod} — videodan seçilen kare` });
      const r = await tg(env, "sendMessage", { chat_id: kisi, text: kareKartMetni(kod, k.adaylar.length), reply_markup: kareKlavye(kod, k.adaylar.length) });
      if (!r1.ok || !r.ok) continue;
      await env.KAYIT.put(`kare:${kod}`, JSON.stringify({ ...k, kart: [...(k.kart || []), [kisi, r.result.message_id]] }));
      gonderilen++;
    }
  }
  if (tur === "s") await yazKV(env, "selin:modeller", modeller);
  const kalan = (tur === "s" ? sorular : tur === "k" ? kartlar : kareler).length - gonderilen;
  if (!gonderilen) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Gösterilecek yeni bir şey yok." });
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${gonderilen} gönderildi` });
  if (kalan > 0) await tg(env, "sendMessage", { chat_id: kisi, text: `Kalan: ${kalan}`, reply_markup: { inline_keyboard: [[{ text: "Sonraki 5", callback_data: `sg:${tur}` }]] } });
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
  const hatalar = [];
  let iletilen = 0;
  for (const sec of modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz, PAYLASIM_EN_FAZLA)) {
    for (const id of sec.ids) {
      if (iletilen >= ILETME_EN_FAZLA || fotolar.length >= POZ_EN_FAZLA) break;
      iletilen++;
      const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: bilgi.kanal.id, message_id: id, disable_notification: true });
      if (!r.ok) {
        hatalar.push(`${id}: ${r.description || "?"}`);
        continue;
      }
      const m = r.result;
      if (m.caption) yazilar.push(m.caption);
      if (m.photo) {
        const buyuk = m.photo[m.photo.length - 1];
        if (gorulen.has(buyuk.file_unique_id)) continue;
        gorulen.add(buyuk.file_unique_id);
        if (fotolar.length < POZ_EN_FAZLA) fotolar.push({ id, buyuk, orta: enYakinBoyut(m.photo, 800), tarih: sec.tarih });
      } else if (m.video && !gorulen.has(m.video.file_unique_id)) {
        gorulen.add(m.video.file_unique_id);
        videolar.push({ id, sure: m.video.duration, file_id: m.video.file_id, boyut: m.video.file_size || 0, w: m.video.width || 0 });
      }
    }
  }
  return { fotolar, videolar, yazilar, hatalar };
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
Her poz için net mi (bulanık/odak dışı/çok karanlık değil mi) değerlendir; ürün görünmüyorsa da net=false.
Aynı fotoğrafın tekrarı (aynı kare/aynı poz, yeniden yüklenmiş ya da biraz farklı kaydedilmiş) varsa ilkini bırak, sonrakileri net=false ve not="tekrar" yap.
kategori: katalog tarifine ve fotoğraflara bakarak tek birini seç: ${KATEGORILER.map((k) => `${k} (${KATEGORI_ADI[k]})`).join(", ")}. Gece/özel gün elbisesi evening; iki ya da üç parça uyumlu set sets; tek parça üst-alt birleşik jumpsuits.`,
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
  let hatalar = [];
  if (onceki && duzeltme) {
    ({ videolar, yazilar } = onceki);
    fotolar = onceki.fotolar.filter((f) => f.net);
  } else {
    ({ fotolar, videolar, yazilar, hatalar } = await medyaTopla(env, bilgi, kod));
  }
  // Kanal mesajları okunamadıysa (Telegram hatası) model kaybolmasın: sıranın sonuna, en fazla 3 deneme.
  if (!fotolar.length && !videolar.length && hatalar.length) {
    const deneme = ((modeller[kod] && modeller[kod].deneme) || 0) + 1;
    await yazKV(env, "selin:hata", { zaman: simdi, hata: `medya okunamadı ${kod} (deneme ${deneme}): ${hatalar.slice(0, 3).join(" | ")}` }, 7 * 86400);
    if (deneme < 3) {
      modeller[kod] = { ...(modeller[kod] || {}), durum: "hazirlaniyor", zaman: simdi, deneme };
      await yazKV(env, "selin:modeller", modeller);
      await yazKV(env, "selin:hazirla", [...(await oku(env, "selin:hazirla", [])).filter((k) => k !== kod), kod]);
      return;
    }
    modeller[kod] = { ...(modeller[kod] || {}), durum: "eklenmeyecek", zaman: simdi, not: "okunamadı", deneme };
    await yazKV(env, "selin:modeller", modeller);
    return notEkle(env, `${kod}: kanal paylaşımları okunamadı (${hatalar[0]}).`);
  }
  // Sadece videosu olan model: onaylı kare varsa o kullanılır; yoksa videodan kare istenir.
  if (!fotolar.length) {
    const kare = await oku(env, `kare:${kod}`, null);
    if (kare && kare.durum === "onayli") {
      fotolar = [{ id: null, buyuk: { file_id: kare.file_id, width: kare.w, height: kare.h }, orta: null, tarih: simdi, kare: true }];
    } else if (videolar.length) {
      let k = { durum: "hata" };
      try {
        k = await kareIste(env, kod, simdi, videolar);
      } catch (e) {
        // Geçici hata (GitHub vb.): model kaybolmasın, kare sırasından yeniden denenir.
        await yazKV(env, "selin:hata", { zaman: simdi, hata: `kare isteği ${kod}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400);
        const sira = await oku(env, "selin:kareSira", []);
        if (!sira.includes(kod)) await yazKV(env, "selin:kareSira", [...sira, kod]);
        k = { durum: "isleniyor" };
      }
      if (k.durum === "isleniyor" || k.durum === "onayda") {
        modeller[kod] = { ...(modeller[kod] || {}), durum: "kare-bekliyor", zaman: simdi };
        await yazKV(env, "selin:modeller", modeller);
        if (k.yeni) await notEkle(env, `${kod}: sadece videosu var; videodan kare çıkarılıyor.`);
        return;
      }
    }
  }
  if (!fotolar.length) {
    modeller[kod] = { ...(modeller[kod] || {}), durum: "eklenmeyecek", zaman: simdi, not: "fotoğraf yok" };
    await yazKV(env, "selin:modeller", modeller);
    return notEkle(env, `${kod}: kanalda ne fotoğrafı ne videosu bulundu; siteye hazırlanamadı.`);
  }
  for (const f of fotolar) f.b64 = await dosyaB64(env, (f.orta || f.buyuk).file_id);
  const ai = await aciklamaYaz(env, { kod, fotolar, tarif: bilgi.tarifler[kod] && bilgi.tarifler[kod].t, yazilar, duzeltme, onceki: onceki && { baslik: onceki.baslik, aciklama: onceki.aciklama } });
  const netlik = new Map((ai.pozlar || []).map((p) => [p.poz, p]));
  const pozlar = fotolar.map((f, i) => {
    const n = netlik.get(i + 1);
    const dusuk = Math.max(f.buyuk.width, f.buyuk.height) < DUSUK_COZUNURLUK;
    return { id: f.id, buyuk: f.buyuk, orta: f.orta, net: (!n || n.net) && !dusuk, not: dusuk ? "düşük çözünürlük" : n && !n.net ? n.not || "bulanık" : "" };
  });
  // Beden: alt yazıdan öneri (Küçük/Büyük/İkisi de); karttaki 📏 düğmesiyle değişir.
  const oneri = yazilar.map(bedenOnerisi).find(Boolean) || null;
  const bedenGrubu = onceki ? onceki.bedenGrubu ?? null : oneri;
  const taslak = {
    baslik: ai.baslik, kategori: ai.kategori, aciklama: ai.aciklama,
    bedenGrubu, bedenOneri: oneri,
    bedenler: onceki ? onceki.bedenler : bedenGrubu ? BEDEN_GRUPLARI[bedenGrubu].bedenler : null,
    fotolar: pozlar, videolar, yazilar: yazilar.slice(0, 3),
    fiyat: ((await stokBilgisi(env, [kod]))[kod] || {}).fiyat ?? null, // Vegawin satış fiyatı ($)
  };
  modeller[kod] = { ...(modeller[kod] || {}), durum: "onayda", zaman: simdi, taslak };
  await yazKV(env, "selin:modeller", modeller);
  await onayKartiGonder(env, kod);
}

// Tek bir taslak kartını bir kişiye gösterir (özetten ya da Düzelt sonrası).
async function kartGoster(env, kod, kisi) {
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  if (!m || m.durum !== "onayda") return false;
  const t = m.taslak;
  const kanal = await oku(env, "kanal", null);
  const netler = t.fotolar.filter((f) => f.net);
  if (netler.length > 1) await tg(env, "sendMediaGroup", { chat_id: kisi, media: netler.slice(0, 10).map((f) => ({ type: "photo", media: f.buyuk.file_id })) });
  else if (netler.length === 1) await tg(env, "sendPhoto", { chat_id: kisi, photo: netler[0].buyuk.file_id });
  const r = await tg(env, "sendMessage", { chat_id: kisi, text: kartMetni(kod, t, kanal && kanal.kullanici), disable_web_page_preview: true, reply_markup: kartKlavye(kod, t) });
  if (!r.ok) return false;
  const guncel = await oku(env, "selin:modeller", {});
  guncel[kod] = { ...guncel[kod], kart: [...(guncel[kod].kart || []), [String(kisi), r.result.message_id]] };
  await yazKV(env, "selin:modeller", guncel);
  return true;
}

function kartMetni(kod, t, kanalAdi) {
  const netler = t.fotolar.filter((f) => f.net);
  const atilan = t.fotolar.filter((f) => !f.net);
  const grup = BEDEN_GRUPLARI[t.bedenGrubu];
  const beden = grup ? `${t.bedenler} — ${grup.ad}${t.bedenGrubu === t.bedenOneri ? " (alt yazıdan öneri)" : ""}`
    : t.bedenler || "SEÇİLMEDİ — 📏 düğmesiyle seçin";
  return [
    `🌸 ${kod} — siteye hazır taslak`,
    `Başlık: ${t.baslik}`,
    `Kategori: ${KATEGORI_ADI[t.kategori] || t.kategori} (yanlışsa ✏️ Düzelt → "kategori: takım" yazın)`,
    `Bedenler: ${beden}`,
    `Fiyat: ${t.fiyat != null ? `${t.fiyat} $ (Vegawin)` : "Vegawin'de yok"}`,
    `Pozlar: ${netler.length} net${atilan.length ? `; konmayacak ${atilan.length}: ${atilan.map((f) => `${kanalAdi ? `t.me/${kanalAdi}/${f.id}` : f.id} (${f.not})`).join(", ")}` : ""}`,
    `Videolar: ${t.videolar.length ? `${t.videolar.length} (sitede Telegram oynatıcısıyla)` : "yok"}`,
    "",
    `EN: ${t.aciklama.en}`,
    "",
    `TR (kontrol için): ${t.aciklama.tr}`,
  ].join("\n").slice(0, 4000);
}

function kartKlavye(kod, t) {
  return { inline_keyboard: [
    Object.entries(BEDEN_GRUPLARI).map(([k, g]) => ({ text: `${t.bedenGrubu === k ? "✓ " : ""}📏 ${g.ad}`, callback_data: `sb:${kod}:${k}` })),
    [{ text: "✅ Onayla, siteye yükle", callback_data: `so:${kod}` }],
    [{ text: "✏️ Düzelt", callback_data: `sd:${kod}` }, { text: "❌ Ekleme", callback_data: `sx:${kod}` }],
  ] };
}

// Taslak kendiliğinden gönderilmez (mesaj az olsun): özetteki "Taslaklar" ile isteyene gösterilir.
// Düzelt sonrası yeni taslak, önceki kartı görmüş kişilere yeniden gösterilsin diye kart listesi sıfırlanır.
async function onayKartiGonder(env, kod) {
  const modeller = await oku(env, "selin:modeller", {});
  if (modeller[kod]) {
    modeller[kod].kart = [];
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

// Bir kerelik: "fotoğraf yok" denip kalan modeller (okuma hatası olabilir) yeniden hazırlığa alınır;
// fotoğraf yine yoksa videodan kare yoluna girer. Kullanıcının saydığı 5 model önce.
async function fotografYokGocu(env, simdi) {
  try {
    if (await env.KAYIT.get("selin:goc:fotografyok")) return;
    const modeller = await oku(env, "selin:modeller", {});
    const once = ["3522", "3630", "3569", "3275", "3576"];
    const yok = Object.keys(modeller).filter((k) => modeller[k].not === "fotoğraf yok");
    const sira = [...once.filter((k) => yok.includes(k)), ...yok.filter((k) => !once.includes(k))];
    for (const k of sira) {
      const { not, deneme, ...kalan } = modeller[k];
      modeller[k] = { ...kalan, durum: "hazirlaniyor", zaman: simdi };
    }
    if (sira.length) {
      await yazKV(env, "selin:modeller", modeller);
      await yazKV(env, "selin:hazirla", [...sira, ...(await oku(env, "selin:hazirla", [])).filter((k) => !sira.includes(k))]);
    }
    await env.KAYIT.put("selin:goc:fotografyok", String(sira.length));
  } catch (e) {
    // KV günlük yazma sınırı dolduysa sonraki gün kendiliğinden tekrar dener.
  }
}

// GitHub anahtarının çalıştığını saatte bir dener (okuma, yazma, Actions); sonuç "selin:github".
// Yazma denemesi depoya bağlanmayan boş bir parça (blob) oluşturur; siteye ve dosyalara dokunmaz.
export async function githubKontrol(env, simdi) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || (await env.KAYIT.get("selin:github"))) return;
  const dene = async (yol, secenek) => { try { await gh(env, yol, secenek); return true; } catch (e) { return e.message; } };
  const sonuc = {
    zaman: simdi,
    okuma: await dene(""),
    yazma: await dene("/git/blobs", { method: "POST", body: JSON.stringify({ content: "selin-kontrol", encoding: "utf-8" }) }),
    actions: await dene("/actions/workflows"),
  };
  await yazKV(env, "selin:github", sonuc, 6 * 3600); // KV'de (izleme); 6 saatte bir
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

// Saatte bir (09–20): sitedeki modellerin fiyatı ve görünürlüğü Vegawin'e göre güncellenir.
// Stoğu biten model sitede gizlenir (veri ve fotoğraflar silinmez), stok gelince geri görünür.
// Değişiklik yoksa GitHub'a hiçbir şey yazılmaz.
export async function siteStokEsitle(env, simdi) {
  const s = saat(simdi);
  if (s < 9 || s >= 20 || !env.STOK || !env.GITHUB_TOKEN) return;
  const anahtar = `selin:siteStok:${gunAnahtari(simdi)}:${Math.floor(s)}`;
  if (await env.KAYIT.get(anahtar)) return;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 2 * 86400 });
  const { liste } = await siteVerisi(env);
  if (!liste.length) return;
  const stok = await stokBilgisi(env, liste.map((u) => u.kod));
  const degisen = [];
  const yeni = liste.map((u) => {
    const st = stok[u.kod];
    if (!st) return u; // Vegawin'de yok: dokunulmaz
    const fiyat = st.fiyat ?? u.fiyat ?? null;
    const gizli = Boolean(st.gizli);
    if (fiyat === (u.fiyat ?? null) && gizli === Boolean(u.gizli)) return u;
    degisen.push(`${u.kod}${gizli !== Boolean(u.gizli) ? (gizli ? " gizlendi" : " yeniden görünür") : ""}${fiyat !== (u.fiyat ?? null) ? ` ${fiyat} $` : ""}`);
    return { ...u, fiyat, gizli };
  });
  if (!degisen.length) return;
  await siteyeYaz(env, [], yeni, `Selin: Vegawin stok/fiyat güncellemesi (${degisen.length} model)`);
  await notEkle(env, `Site güncellendi (Vegawin): ${degisen.slice(0, 10).join(", ")}${degisen.length > 10 ? " …" : ""}`);
}

async function sha256(metin) {
  const ozet = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function siteyeYukle(env, kod, kim, simdi) {
  const modeller = await oku(env, "selin:modeller", {});
  const t = modeller[kod] && modeller[kod].taslak;
  const bilgi = await kanalBilgisi(env);
  const netler = t.fotolar.filter((f) => f.net);
  const dosyalar = [];
  // Aynı fotoğraf kanalda farklı paylaşımlarda yeniden yüklenmiş olabilir (dosya kimliği farklı,
  // içerik aynı): içerik aynıysa bir kez konur.
  const gorulen = new Set();
  for (const f of netler) {
    const b64 = await dosyaB64(env, f.buyuk.file_id);
    const iz = await sha256(b64);
    if (gorulen.has(iz)) continue;
    gorulen.add(iz);
    dosyalar.push({ yol: `galeri/${kod}/${dosyalar.length + 1}.jpg`, b64 });
  }
  const { liste } = await siteVerisi(env);
  const st = (await stokBilgisi(env, [kod]))[kod];
  const urun = {
    kod, baslik: t.baslik, kategori: t.kategori, aciklama: { en: t.aciklama.en, fr: t.aciklama.fr, pt: t.aciklama.pt },
    bedenler: t.bedenler, fotolar: dosyalar.map((d) => d.yol),
    videolar: t.videolar.map((v) => `${bilgi.kanal.kullanici}/${v.id}`),
    fiyat: st ? st.fiyat : t.fiyat ?? null, // Vegawin satış fiyatı ($)
    gizli: Boolean(st && st.gizli),        // stoğu bitince sitede görünmez (kayıt silinmez)
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

// ---------- 5) Videodan kare (sadece videosu olan modeller) ----------
// Selin isteği "kareler" dalına yazar → GitHub Actions (ücretsiz, telegram-bot/kare/) videoyu bu
// Worker'dan tek kullanımlık bağlantıyla indirir, en net kareleri seçer, dala kaydeder ve /kare'ye
// haber verir → adaylar Telegram'da onaya gelir. Onaylanan kare "kare:<kod>" (ortak beyin) olur:
// Selin sitede, Kemal kanal paylaşımında videolarla birlikte kullanır. Bir model için bir kez üretilir.
const KARE_DALI = "kareler";
const VIDEO_SINIR = 20 * 1024 * 1024; // Telegram botlar 20 MB'tan büyük dosyayı indiremez

export async function kareIste(env, kod, simdi, videolar) {
  const kayit = await oku(env, `kare:${kod}`, null);
  // Bir kez üretilir: onaylı/onayda/reddedilmiş ya da son 1 saatte istenmişse tekrar istenmez.
  if (kayit && (["onayli", "onayda", "reddedildi"].includes(kayit.durum) || (kayit.durum === "isleniyor" && simdi - kayit.zaman < 3600))) return kayit;
  const uygun = videolar.filter((v) => v.file_id && (!v.boyut || v.boyut <= VIDEO_SINIR)).sort((a, b) => b.w - a.w);
  if (!uygun.length) {
    const k = { durum: "basarisiz", zaman: simdi, hata: videolar.length ? "video 20 MB'tan büyük; Telegram botların bu boyutta dosya indirmesine izin vermiyor" : "modelin videosu yok" };
    await yazKV(env, `kare:${kod}`, k);
    await notEkle(env, `${kod}: videodan kare çıkarılamadı (${k.hata}).`);
    return k;
  }
  const t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await yazKV(env, `selin:kareIstek:${t}`, { kod, file_id: uygun[0].file_id }, 3 * 3600);
  const yol = `/contents/istekler/${encodeURIComponent(kod)}.json`;
  let sha;
  try { sha = (await gh(env, `${yol}?ref=${KARE_DALI}`)).sha; } catch { sha = undefined; }
  const icerik = { kod, t, video: `${env.SELF_URL}/video?t=${t}`, geri: `${env.SELF_URL}/kare` };
  await gh(env, yol, { method: "PUT", body: JSON.stringify({ message: `Selin: ${kod} için videodan kare isteği`, branch: KARE_DALI, content: btoa(JSON.stringify(icerik)), ...(sha ? { sha } : {}) }) });
  const k = { durum: "isleniyor", zaman: simdi };
  await yazKV(env, `kare:${kod}`, k);
  return { ...k, yeni: true };
}

// Elle istek (/kare 3104): her çalışmada bir model.
async function kareSiraGuvenli(env, simdi) {
  const sira = await oku(env, "selin:kareSira", []);
  if (!sira.length || !env.GITHUB_TOKEN) return;
  const kod = sira[0];
  await yazKV(env, "selin:kareSira", sira.slice(1));
  try {
    const bilgi = await kanalBilgisi(env);
    const { fotolar, videolar } = await medyaTopla(env, bilgi, kod);
    if (fotolar.length && !videolar.length) return notEkle(env, `${kod}: kanalda fotoğrafı var, kareye gerek yok.`);
    const k = await kareIste(env, kod, simdi, videolar);
    const modeller = await oku(env, "selin:modeller", {});
    if (k.durum === "isleniyor" || k.durum === "onayda") {
      if (!modeller[kod] || !["sitede", "onayda", "yukleniyor"].includes(modeller[kod].durum)) {
        modeller[kod] = { ...(modeller[kod] || {}), durum: "kare-bekliyor", zaman: simdi };
        await yazKV(env, "selin:modeller", modeller);
      }
      if (k.yeni) await notEkle(env, `${kod}: videodan kare çıkarılıyor.`);
    } else if (k.durum === "onayli") await notEkle(env, `${kod}: bu model için onaylı kare zaten var (bir kez üretilir).`);
  } catch (e) {
    // Geçici hata: model kaybolmasın, en fazla 3 kez yeniden denenir.
    await yazKV(env, "selin:hata", { zaman: simdi, hata: `kare ${kod}: ${String(e && e.message).slice(0, 400)}` }, 7 * 86400);
    const deneme = await oku(env, "selin:kareDeneme", {});
    deneme[kod] = (deneme[kod] || 0) + 1;
    await yazKV(env, "selin:kareDeneme", deneme, 7 * 86400);
    if (deneme[kod] < 3) await yazKV(env, "selin:kareSira", [...(await oku(env, "selin:kareSira", [])).filter((k) => k !== kod), kod]);
    else await notEkle(env, `${kod}: videodan kare isteği 3 kez başarısız oldu (${String(e && e.message).slice(0, 150)}).`);
  }
}

// GitHub Actions videoyu buradan indirir (tek kullanımlık bağlantı; bot anahtarı dışarı çıkmaz).
async function videoVer(env, t) {
  const kayit = t && (await oku(env, `selin:kareIstek:${t}`, null));
  if (!kayit) return new Response("geçersiz", { status: 404 });
  const f = await tg(env, "getFile", { file_id: kayit.file_id });
  if (!f.ok) return new Response(`indirilemedi: ${f.description}`, { status: 413 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Response(r.body, { status: r.status, headers: { "content-type": "video/mp4" } });
}

// GitHub Actions bitince: adaylar Telegram'da onaya gönderilir.
export async function kareGeldi(env, govde, simdi) {
  const kayit = govde.t && (await oku(env, `selin:kareIstek:${govde.t}`, null));
  if (!kayit || kayit.kod !== govde.kod) return new Response("yetkisiz", { status: 403 });
  await env.KAYIT.delete(`selin:kareIstek:${govde.t}`);
  const kod = kayit.kod;
  const onEk = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/`;
  const dosyalar = (govde.dosyalar || []).filter((d) => String(d.url || "").startsWith(onEk)).slice(0, 3);
  if (govde.hata || !dosyalar.length) {
    await yazKV(env, `kare:${kod}`, { durum: "basarisiz", zaman: simdi, hata: govde.hata || "aday yok" });
    await notEkle(env, `${kod}: videodan net kare çıkarılamadı (${govde.hata || "aday yok"}); ücretli araçlar kapalı, şimdilik fotoğrafsız.`);
    return new Response("ok");
  }
  // Adaylar önce arşiv kanalına gider (Selin'in dosya kimlikleri için); ekip özetten "Kareler" ile görür.
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv) return new Response("arşiv yok", { status: 502 });
  const baslik = `🎞 ${kod} — videodan seçilen kareler (onay bekliyor)`;
  // Albüm en az 2 fotoğraf ister; tek aday tek fotoğraf olarak gider.
  const r = dosyalar.length > 1
    ? await tg(env, "sendMediaGroup", { chat_id: arsiv.id, disable_notification: true, media: dosyalar.map((d, i) => ({ type: "photo", media: d.url, ...(i === 0 ? { caption: baslik } : {}) })) })
    : await tg(env, "sendPhoto", { chat_id: arsiv.id, disable_notification: true, photo: dosyalar[0].url, caption: baslik }).then((x) => (x.ok ? { ok: true, result: [x.result] } : x));
  if (!r.ok) return new Response("gönderilemedi", { status: 502 });
  const adaylar = r.result.map((mesaj, i) => {
    const b = mesaj.photo[mesaj.photo.length - 1];
    return { url: dosyalar[i].url, file_id: b.file_id, w: b.width, h: b.height };
  });
  await yazKV(env, `kare:${kod}`, { durum: "onayda", zaman: simdi, adaylar, kart: [] });
  const bekleyen = await oku(env, "selin:kareBekleyen", []);
  if (!bekleyen.includes(kod)) await yazKV(env, "selin:kareBekleyen", [...bekleyen, kod]);
  return new Response("ok");
}

function kareKartMetni(kod, n) {
  return `🎞 ${kod}: sadece videosu olan model. Videodan en net ${n} kareyi seçtim (yapay zekâ yok; kare videonun kendisi, ürün olduğu gibi). Hangisi kullanılsın?\nOnaylanan fotoğraf sitede ve Kemal'in kanal paylaşımında videolarla ve bedenlerle birlikte kullanılır.`;
}
const kareKlavye = (kod, n) => ({ inline_keyboard: [Array.from({ length: n }, (_, i) => ({ text: `✅ ${i + 1}. kare`, callback_data: `kk:${kod}:${i + 1}` })), [{ text: "❌ Hiçbiri", callback_data: `kk:${kod}:0` }]] });

async function kareSecildi(env, cq, kod, n, kim, simdi, cevapla) {
  const k = await oku(env, `kare:${kod}`, null);
  if (!k || k.durum !== "onayda") return cevapla(k && k.kim ? `${k.kim} zaten seçti.` : "Bu seçim artık geçerli değil.");
  const secilen = n > 0 && k.adaylar[n - 1];
  if (n > 0 && !secilen) return cevapla("Geçersiz düğme.");
  const yeni = secilen
    ? { durum: "onayli", zaman: simdi, kim, url: secilen.url, file_id: secilen.file_id, w: secilen.w, h: secilen.h }
    : { durum: "reddedildi", zaman: simdi, kim };
  await yazKV(env, `kare:${kod}`, yeni);
  await yazKV(env, "selin:kareBekleyen", (await oku(env, "selin:kareBekleyen", [])).filter((x) => x !== kod));
  await cevapla(secilen ? "Kare onaylandı" : "Tamam");
  const metin = secilen
    ? `✅ ${kod}: ${n}. kare seçildi (${kim}). Selin siteye hazırlıyor; Kemal kanalda videolarla birlikte kullanacak.`
    : `❌ ${kod}: kare kullanılmayacak (${kim}). Ücretli araçlar kapalı; model şimdilik fotoğrafsız.`;
  for (const [kisi, id] of k.kart || []) await tg(env, "editMessageText", { chat_id: kisi, message_id: id, text: metin });
  if (!secilen) return;
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  if (!m || m.durum === "kare-bekliyor" || (m.durum === "eklenmeyecek" && m.not === "fotoğraf yok")) {
    modeller[kod] = { ...(m || {}), durum: "hazirlaniyor", zaman: simdi, kim };
    await yazKV(env, "selin:modeller", modeller);
    const sira = await oku(env, "selin:hazirla", []);
    if (!sira.includes(kod)) await yazKV(env, "selin:hazirla", [kod, ...sira]);
  }
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
    await kartGoster(env, duzeltilen, m.chat.id); // düzeltilen taslak sadece düzelteni bekletmesin
    return;
  }
  if (komut === "/beden") {
    const kod = String(arg[0] || "").toUpperCase();
    const bedenler = arg.slice(1).join(" ").replace(/[,/ ]+/g, "-");
    const modeller = await oku(env, "selin:modeller", {});
    if (!modeller[kod] || !modeller[kod].taslak || !bedenler) return yaz("Örnek: /beden 3194 38-40-42-44");
    modeller[kod].taslak.bedenler = bedenler;
    modeller[kod].taslak.bedenGrubu = Object.keys(BEDEN_GRUPLARI).find((k) => BEDEN_GRUPLARI[k].bedenler === bedenler) || null;
    await yazKV(env, "selin:modeller", modeller);
    return yaz(`✅ ${kod} bedenleri: ${bedenler}. Karttaki "✅ Onayla, siteye yükle"ye basabilirsiniz.`);
  }
  if (komut === "/site") return siteListesi(env, m.chat.id, Number(arg[0] || 1));
  if (komut === "/kare") {
    const kod = String(arg[0] || "").toUpperCase();
    if (!kod) return yaz("Örnek: /kare 3104 — sadece videosu olan modelde videodan net kare çıkarır.");
    const sira = await oku(env, "selin:kareSira", []);
    if (!sira.includes(kod)) await yazKV(env, "selin:kareSira", [...sira, kod]);
    return yaz(`🎞 ${kod} sıraya alındı; videodan kareler birkaç dakika içinde onayınıza gelecek.`);
  }
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
  const [islem, kod, ek] = String(cq.data || "").split(":");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  if (islem === "kk") return kareSecildi(env, cq, kod, Number(ek), kim, simdi, cevapla);
  if (islem === "sg") return goster(env, cq, kod);
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
  if (islem === "sb") {
    const grup = ek;
    if (!m || m.durum !== "onayda" || !BEDEN_GRUPLARI[grup]) return cevapla("Bu taslak artık geçerli değil.");
    m.taslak.bedenGrubu = grup;
    m.taslak.bedenler = BEDEN_GRUPLARI[grup].bedenler;
    await yazKV(env, "selin:modeller", modeller);
    await cevapla(`Beden: ${BEDEN_GRUPLARI[grup].ad} (${BEDEN_GRUPLARI[grup].bedenler})`);
    const kanal = await oku(env, "kanal", null);
    for (const [k, id] of m.kart || []) {
      await tg(env, "editMessageText", { chat_id: k, message_id: id, text: kartMetni(kod, m.taslak, kanal && kanal.kullanici), disable_web_page_preview: true, reply_markup: kartKlavye(kod, m.taslak) });
    }
    return;
  }
  if (islem === "so" || islem === "sx" || islem === "sd") {
    if (!m || m.durum !== "onayda") return cevapla("Bu taslak artık geçerli değil.");
    if (islem === "sd") {
      await env.KAYIT.put(`selin:duzelt:${cq.from.id}`, kod, { expirationTtl: 86400 });
      await cevapla("Ne değişsin?");
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod}: ne değişsin? Yazın (ör. "açıklamada saten kumaş geçsin", "başlık: Satin Wrap Dress", "2. pozu çıkar").` });
    }
    if (islem === "so" && !m.taslak.bedenler) return cevapla("Önce beden seçin: 📏 Küçük / Büyük / İkisi de");
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
      await tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⚠️ ${kod} siteye yüklenemedi: ${e.message}. Taslak duruyor, tekrar deneyebilirsiniz.` });
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
