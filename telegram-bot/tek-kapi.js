// TEK KAPI (5 Kasım, Patron): Patron'un KİŞİSEL Telegram hesabına (MURAT_ID'nin İLKİ) Kemal, Selin, Pelin (Nora), Sami doğrudan
// HİÇBİR şey göndermez; giden mesaj/kart/fotoğraf/video Venom'a aktarılır, Patron'a Venom'dan gider. Düğmeler Venom'da basılınca
// aynı bota "Patron bastı" olarak geri iletilir (/venom/dugme). Merdan, Hemra, 0091 ve elemanlarla çalışma DEĞİŞMEZ.
// Açma/kapama: KV "venom:tekKapi" = "1". Bağlantı: servis bağlantısı VENOM → volonte-venom'un iç girişi "VenomKapi" (RPC; internetten
// erişilemez, gizli anahtar gerekmez). Venom → bot: botun iç girişi "VenomKapisi" (dugme / durum / taslak).
const kimlikler = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
export const patronKisisel = (env) => kimlikler(env.MURAT_ID)[0] || "";
let bayrak = { t: 0, v: false };
export async function tekKapiAcik(env) {
  if (!env.VENOM) return false;
  if (Date.now() - bayrak.t < 30000) return bayrak.v;
  const v = (await env.KAYIT.get("venom:tekKapi").catch(() => null)) === "1";
  bayrak = { t: Date.now(), v };
  return v;
}
export const _bayrakSifirla = () => { bayrak = { t: 0, v: false }; }; // testler için
export async function patronaGider(env, chatId) {
  const p = patronKisisel(env);
  return Boolean(p && chatId != null && String(chatId) === p && (await tekKapiAcik(env)));
}
const SESSIZ = new Set(["sendChatAction", "editMessageReplyMarkup", "deleteMessage", "pinChatMessage", "unpinChatMessage", "setMessageReaction"]);
const MEDYA_ALAN = { sendPhoto: "photo", sendVideo: "video", sendDocument: "document", sendAnimation: "animation", sendAudio: "audio", sendVoice: "voice" };
// Botun dosya kimliği Venom'da geçmez → dosya botun anahtarıyla indirilip KV "venommedya:<id>" (3 gün; Venom /medya/<id> sunar)
async function medyaAdresi(env, m, tgCagir, tur) {
  if (m instanceof Blob) return medyaKaydet(env, await m.arrayBuffer(), tur);
  const s = String(m || "");
  if (/^https?:\/\//.test(s)) return s;
  if (!s || !tgCagir) return null;
  const f = await tgCagir("getFile", { file_id: s }).catch(() => null);
  if (!f || !f.ok) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`).catch(() => null);
  if (!r || !r.ok) return null;
  return medyaKaydet(env, await r.arrayBuffer(), tur);
}
async function medyaKaydet(env, bayt, tur) {
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.KAYIT.put(`venommedya:${id}`, bayt, { expirationTtl: 3 * 86400, metadata: { tur: tur === "video" ? "video/mp4" : tur === "document" ? "application/octet-stream" : "image/jpeg" } });
  return `${env.VENOM_URL || "https://volonte-venom.volonte.workers.dev"}/medya/${id}`;
}
const sahteId = () => 900000000 + Math.floor(Math.random() * 99999999);
// Giden çağrıyı Venom'a aktarır; çağırana Telegram'ın döneceği gibi "başarılı" cevap verir
export async function venomaAktar(env, bot, metod, govde, tgCagir) {
  const id = sahteId();
  const ok = (sonuc = { message_id: id, chat: { id: Number(patronKisisel(env)) } }) => ({ ok: true, result: sonuc, aktarildi: true });
  if (SESSIZ.has(metod)) return ok(true);
  const kayit = { bot, metod, zaman: Math.floor(Date.now() / 1000), metin: "", parse_mode: govde.parse_mode || null, medya: [], butonlar: null };
  if (metod === "sendMessage") kayit.metin = govde.text || "";
  else if (metod === "editMessageText") kayit.metin = `✏️ ${govde.text || ""}`;
  else if (metod === "editMessageCaption") kayit.metin = `✏️ ${govde.caption || ""}`;
  else if (metod === "copyMessage" || metod === "forwardMessage") kayit.metin = govde.caption || "(kanaldaki bir gönderi)";
  else if (MEDYA_ALAN[metod]) {
    kayit.metin = govde.caption || "";
    const u = await medyaAdresi(env, govde[MEDYA_ALAN[metod]], tgCagir, metod === "sendVideo" ? "video" : metod === "sendDocument" ? "document" : "photo");
    if (u) kayit.medya.push({ type: metod === "sendVideo" || metod === "sendAnimation" ? "video" : metod === "sendDocument" ? "document" : "photo", media: u });
  } else if (metod === "sendMediaGroup") {
    for (const m of (govde.media || []).slice(0, 10)) {
      const u = await medyaAdresi(env, m.media, tgCagir, m.type);
      if (u) kayit.medya.push({ type: m.type === "video" ? "video" : m.type === "document" ? "document" : "photo", media: u });
      if (m.caption && !kayit.metin) { kayit.metin = m.caption; kayit.parse_mode = m.parse_mode || kayit.parse_mode; }
    }
  } else kayit.metin = govde.text || govde.caption || "";
  if (govde.reply_markup && govde.reply_markup.inline_keyboard) kayit.butonlar = govde.reply_markup.inline_keyboard;
  try {
    await env.VENOM.aktar(kayit);
  } catch (e) {
    await env.KAYIT.put("venom:tekKapiHata", JSON.stringify({ zaman: kayit.zaman, bot, hata: String(e && e.message).slice(0, 200) }), { expirationTtl: 7 * 86400 }).catch(() => null);
  }
  if (metod === "sendMediaGroup") return ok(kayit.medya.map((_, i) => ({ message_id: id + i, chat: { id: Number(patronKisisel(env)) } })));
  return ok();
}
// Çok parçalı (FormData) gönderim: dosyalar "attach://" ya da doğrudan alan
export async function formAktar(env, bot, metod, form, tgCagir) {
  const govde = {};
  for (const [k, v] of form.entries()) govde[k] = v;
  if (typeof govde.media === "string") { try { govde.media = JSON.parse(govde.media).map((m) => ({ ...m, media: /^attach:\/\//.test(m.media) ? form.get(m.media.slice(9)) : m.media })); } catch { /* */ } }
  if (typeof govde.reply_markup === "string") { try { govde.reply_markup = JSON.parse(govde.reply_markup); } catch { /* */ } }
  for (const a of Object.values(MEDYA_ALAN)) if (typeof govde[a] === "string" && /^attach:\/\//.test(govde[a])) govde[a] = form.get(govde[a].slice(9));
  return venomaAktar(env, bot, metod, govde, tgCagir);
}
// Venom'dan gelen düğme: sahte (Patron'dan) callback_query güncellemesi
export function sahteDugme(env, data, rid) {
  const p = Number(patronKisisel(env));
  return { update_id: Date.now(), callback_query: { id: `venom-${rid || Date.now()}`, from: { id: p, is_bot: false, first_name: "Patron" }, data: String(data), chat_instance: "venom", message: { message_id: 0, date: Math.floor(Date.now() / 1000), chat: { id: p, type: "private" }, text: "" } } };
}
export const venomCevabi = (metod, govde) => metod === "answerCallbackQuery" && String((govde && govde.callback_query_id) || "").startsWith("venom-");
