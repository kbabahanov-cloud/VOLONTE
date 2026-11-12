// İŞ DEFTERİ YAZICI (9 Kasım, Patron: "Venom gerçek müdür; botlar yaptığı HER işi Venom'un defterine yazsın").
// Kayıtlar Sami'nin deposunda (StokDO tablo "isd"). Her bot iki ortak noktadan yazar:
//  1) Telegram'a giden her mesaj/kart (kime, hangi model, düğmeli mi) — botun telegram sarmalayıcısı
//  2) Gelen her düğme basışı (kim, ne) — botun düğme girişi; aynı düğmeli kart "bitti" olur
// Ayrıca anlamlı işler (kanala paylaştı, siteye ekledi, fabrika siparişi, Venom kontrolü) defterIs ile.
// Deneme/test işleri işaretlenir (sayılmaz). Defter yazılamazsa iş DURMAZ (sessizce geçer).
import { kopyaKaydet } from "./kart-tekrar.js";
const SESSIZ = new Set(["sendChatAction", "answerCallbackQuery", "getFile", "getChat", "getMe", "getWebhookInfo", "setWebhook", "deleteWebhook", "deleteMessage",
  "editMessageReplyMarkup", "editMessageText", "editMessageCaption", "editMessageMedia", "forwardMessage", "copyMessages", "setMyCommands", "pinChatMessage",
  "unpinChatMessage", "getChatMember", "setMessageReaction", "getUpdates", "answerInlineQuery", "getChatAdministrators", "setChatMenuButton", "sendDocument"]);
let onbellek = { t: 0, arsiv: null, kanal: null };
async function kanallar(env) {
  if (Date.now() - onbellek.t < 600000) return onbellek;
  const a = await env.KAYIT.get("arsiv", "json").catch(() => null), k = await env.KAYIT.get("kanal", "json").catch(() => null);
  onbellek = { t: Date.now(), arsiv: a && a.id != null ? String(a.id) : null, kanal: k && k.id != null ? String(k.id) : null };
  return onbellek;
}
export const _defterOnbellekSifirla = () => { onbellek = { t: 0, arsiv: null, kanal: null }; };
export const kodBulDefter = (t) => (String(t || "").match(/CODE[^0-9]{0,6}(\d{3,6})/i) || String(t || "").match(/(?<![\d.,:])(\d{4})(?![\d.,:])/) || [])[1] || null;
export const denemeMi = (t) => /🧪|\bDENEME\b|deneme turu|deneme iş|test kartı/i.test(String(t || ""));
export async function defterYaz(env, kayit) {
  if (!env || !env.STOK) return;
  try {
    await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/isd-yaz", { method: "POST", body: JSON.stringify({ kayitlar: [].concat(kayit) }) });
  } catch { /* defter yazılamazsa iş durmaz */ }
}
// Bir botun kart olmayan işi için deftere TEK satır (ne, kim, marka, durum, kanıt): Pelin üretimi, Kemal kanal kuyruğu …
export async function defterSatir(env, yazan, satirlar, esitle = false) {
  if (!env || !env.STOK) return;
  try { await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/is-yaz", { method: "POST", body: JSON.stringify({ yazan, esitle, satirlar: [].concat(satirlar) }) }); } catch { /* defter yazılamazsa iş durmaz */ }
}
export const defterIs = (env, bot, ozet, { kod = null, kime = null, deneme = false } = {}) => defterYaz(env, { zaman: Math.floor(Date.now() / 1000), bot, tur: "is", ozet, kod: kod || kodBulDefter(ozet), kime, deneme: deneme || denemeMi(ozet) });
// Telegram çağrısından sonra: mesaj / kart kaydı
const gercekDugme = (g) => Boolean(g && g.reply_markup && Array.isArray(g.reply_markup.inline_keyboard) && g.reply_markup.inline_keyboard.flat().some((b) => b && b.callback_data && !/^(vg|kt):-$/.test(String(b.callback_data))));
export async function defterTg(env, bot, metod, govde, sonuc) {
  // 12 Kasım (TEK DEFTER, bütün botlar): düğmeleri kalkan kart (cevaplandı / kapandı / yerine yenisi geldi) defterde de kapanır
  if (env && env.STOK && govde && /^editMessage(Text|Caption|ReplyMarkup|Media)$/.test(metod) && govde.chat_id != null && govde.message_id && !(sonuc && sonuc.ok === false) && !gercekDugme(govde)) {
    try { await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/isd-kart-kapat", { method: "POST", body: JSON.stringify({ chat: String(govde.chat_id), mesaj: govde.message_id, neden: "kapandi" }) }); } catch { /* defter yazılamazsa iş durmaz */ }
    return;
  }
  if (!env || !env.STOK || !govde || SESSIZ.has(metod) || (sonuc && sonuc.ok === false) || env.__kartTekrar) return; // kart tekrarı yeni kart sayılmaz
  const chat = govde.chat_id != null ? String(govde.chat_id) : null;
  if (!chat) return;
  const k = await kanallar(env);
  if (chat === k.arsiv || chat === k.kanal) return; // arşiv kopyaları ve kanal gönderimleri defterIs ile (çift sayılmaz)
  const metin = String(govde.text || govde.caption || (Array.isArray(govde.media) && govde.media[0] && govde.media[0].caption) || "");
  const cbler = ((govde.reply_markup && govde.reply_markup.inline_keyboard) || []).flat().map((b) => b && b.callback_data).filter(Boolean);
  const r = sonuc && sonuc.result;
  if (cbler.length) await kopyaKaydet(env, metod, govde, sonuc).catch(() => null); // 9 Kasım: kartın kendisi yeniden gönderilebilsin
  const botAd = bot === "pelin" && /\bNora\b|senaryo/i.test(metin) ? "nora" : bot;
  await defterYaz(env, { zaman: Math.floor(Date.now() / 1000), bot: botAd, tur: cbler.length ? "kart" : "mesaj", kime: chat, kod: kodBulDefter(metin), ozet: metin.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ").slice(0, 200) || metod, chat, mesaj: r && !Array.isArray(r) ? r.message_id : null, cbler, deneme: denemeMi(metin) });
}
// Düğmeye basıldı: kim, ne → defter + aynı düğmeli kart kapanır
// 9 Kasım (Patron): cevabın İÇERİĞİ yazılır — "3628: Gelecek", "3628: 3 gün", "3189: Bugün çekerim" (basılan düğmenin yazısı + model kodu)
export const dugmeYazisi = (t) => String(t || "").replace(/^\d+·\s*/, "").replace(/^\d{3,6}\s+/, "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
export function cevapIcerigi(cq) {
  const data = String(cq.data || "");
  const tus = ((cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || []).flat().find((b) => b && b.callback_data === data);
  const metin = String((cq.message && (cq.message.text || cq.message.caption)) || "");
  const kod = (tus && (String(tus.text).match(/(?<!\d)(\d{3,6})(?!\d)/) || [])[1]) || (data.match(/(?<![\d.])(\d{4})(?!\d)/) || [])[1] || kodBulDefter(metin);
  return { kod: kod || null, ne: tus ? dugmeYazisi(tus.text) : null };
}
export async function defterKarar(env, bot, cq) {
  if (!env || !env.STOK || !cq || !cq.data) return;
  const data = String(cq.data);
  if (data === "vg:-" || data === "kt:-") return; // işlevsiz düğmeler
  const { kod, ne } = cevapIcerigi(cq);
  // 12 Kasım (Patron): karar veren Patron ya da Hemra ise "kesin" — depo o modelin BÜTÜN açık kartlarını kapatır (aynı karar bir daha sorulmaz)
  const kesinler = ["MURAT_ID", "HEMRA_ID", "FABRIKA_SORUMLU"].flatMap((k) => String(env[k] || "").split(",").map((x) => x.trim()).filter(Boolean));
  const kesin = Boolean(kod && cq.from && kesinler.includes(String(cq.from.id)) && !/^(hl|vm|vb|fb|fc|vd|vs):/.test(data) && !denemeMi((cq.message && (cq.message.text || cq.message.caption)) || ""));
  await defterYaz(env, { kesin, kimAd: (cq.from && cq.from.first_name) || null, zaman: Math.floor(Date.now() / 1000), bot, tur: "karar", kime: cq.from && cq.from.id, kod, ozet: ne ? `${kod ? `${kod}: ` : ""}${ne}`.slice(0, 120) : data.slice(0, 64), cb: data, sonuc: `${(cq.from && cq.from.first_name) || "biri"}: ${ne || data.slice(0, 40)}` });
}
// Yazıyla verilen cevap (açıklama, fabrika arama notu, düzeltme): kim, hangi model, ne yazdı
export const defterCevap = (env, bot, kimId, kod, metin) => defterYaz(env, { zaman: Math.floor(Date.now() / 1000), bot, tur: "karar", kime: kimId, kod: kod || null, ozet: `${kod ? `${kod}: ` : ""}"${String(metin || "").replace(/\s+/g, " ").slice(0, 100)}"` });
