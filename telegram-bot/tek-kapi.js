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
// Venom'dan bota "Patron yazdı" (✏️ Düzelt gibi yazı bekleyen adımlar; ya da Venom'un bota verdiği iş)
export function sahteMesaj(env, metin) {
  const p = Number(patronKisisel(env)), t = Math.floor(Date.now() / 1000);
  return { update_id: Date.now(), message: { message_id: Date.now() % 1000000000, date: t, chat: { id: p, type: "private", first_name: "Patron" }, from: { id: p, is_bot: false, first_name: "Patron" }, text: String(metin).slice(0, 3500) } };
}

// =====================================================================================================================
// ELEMAN KAPISI (18 Kasım, Patron, kural 100 — KURULUYOR; KAPALI yüklenir, Patron "aç" deyip duyuru gidene kadar hiçbir şey değişmez)
// Elemanlar sadece Venom'la konuşur. Botun elemana giden HER Telegram çağrısı (mesaj, kart, düzenleme, silme) AYNI içerikle Venom'un
// botundan gider; eleman Venom'da düğmeye basınca / yazınca Venom bunu ilgili bota "eleman bastı / yazdı" diye geri verir. Botların
// işleyişi (kapılar, defter, kart takibi, saatler, düğmeler, zincirler) DEĞİŞMEZ — sadece taşıma yolu Venom olur.
//  • Açık kişiler: KV "venom:elemanKapi" = { kisiler: ["<telegram kimliği>", ...] } (gizli kayıt; anahtar yoksa KAPALI). Kişi kişi açılabilir.
//  • Fabrikalar (Fuat, Nuri, Sinem, Celal), Patron hesapları ve kanallar bu kapıdan GEÇMEZ.
//  • Venom'dan giden mesajın numarası bota EL_FARK eklenerek döner: bot o mesajı sonra düzenler / silerse çağrı yine Venom'a gider
//    (botun kendi sohbetindeki aynı numaralı başka bir mesaja dokunulmaz). Eski (doğrudan gitmiş) mesajlar botun kendi yolundan düzenlenir.
//  • YEDEK YOL: Venom cevap vermezse gönderim botun kendi yolundan gider ve kapı 10 dakika kapalı sayılır (KV "venom:elemanYedek").
// =====================================================================================================================
export const EL_FARK = 1_000_000_000;
let elBayrak = { t: 0, kisiler: new Set(), yedek: 0 };
export async function elemanKapi(env) {
  if (Date.now() - elBayrak.t < 30000) return elBayrak;
  let kisiler = new Set(), yedek = 0;
  try { const v = await env.KAYIT.get("venom:elemanKapi", "json"); if (v && Array.isArray(v.kisiler)) kisiler = new Set(v.kisiler.map(String)); } catch { /* okunamadı → kapalı */ }
  if (kisiler.size) { try { yedek = Number(await env.KAYIT.get("venom:elemanYedek")) || 0; } catch { /* */ } }
  for (const p of kimlikler(env.MURAT_ID)) kisiler.delete(p); // Patron hesapları asla eleman sayılmaz
  elBayrak = { t: Date.now(), kisiler, yedek };
  return elBayrak;
}
export const _elBayrakSifirla = () => { elBayrak = { t: 0, kisiler: new Set(), yedek: 0 }; }; // testler için
export async function elemanaGider(env, chatId) {
  if (!env || !env.VENOM || chatId == null) return false;
  const k = await elemanKapi(env);
  return k.kisiler.has(String(chatId)) && !(k.yedek && Date.now() / 1000 - k.yedek < 600);
}
const EL_GONDER = new Set(["sendMessage", "sendPhoto", "sendVideo", "sendDocument", "sendAnimation", "sendAudio", "sendVoice", "sendMediaGroup", "sendChatAction", "copyMessage", "forwardMessage", "copyMessages", "forwardMessages"]);
const EL_DUZENLE = new Set(["editMessageText", "editMessageCaption", "editMessageReplyMarkup", "editMessageMedia", "deleteMessage", "pinChatMessage", "unpinChatMessage"]);
async function elDosya(env, m, tgCagir) { // botun dosya kimliği Venom'da geçmez → bot indirir, baytları Venom'a verir (adres ise Venom doğrudan kullanır)
  if (m instanceof Blob) return { bayt: await m.arrayBuffer(), ad: m.name || "dosya", tur: m.type || "" };
  const s = String(m || "");
  if (!s || /^(https?|attach):\/\//.test(s)) return null;
  const f = tgCagir ? await tgCagir("getFile", { file_id: s }) : null;
  if (!f || !f.ok) throw new Error("dosya okunamadı");
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`);
  if (!r.ok) throw new Error("dosya indirilemedi");
  return { bayt: await r.arrayBuffer(), ad: String(f.result.file_path || "dosya").split("/").pop(), tur: "" };
}
const elSonucEkle = (r) => { // Venom'un döndürdüğü gerçek mesaj numaralarına EL_FARK eklenir
  if (!r || !r.ok || !r.result || typeof r.result !== "object") return r;
  const ek = (x) => (x && typeof x === "object" && x.message_id ? { ...x, message_id: x.message_id + EL_FARK } : x);
  return { ...r, result: Array.isArray(r.result) ? r.result.map(ek) : ek(r.result), venomdan: true };
};
// Botun EN ALT gönderim işlevinden çağrılır. null → bu çağrı kapıdan geçmez (bot kendi yolundan gönderir). Aksi halde Telegram cevabı gibi sonuç.
export async function elemanYolu(env, bot, metod, govde, tgCagir) {
  if (!env || !env.VENOM || !govde || typeof govde !== "object") return null;
  if (metod === "answerCallbackQuery") { // Venom'dan gelen eleman düğmesinin cevabı → Venom gerçek düğmeye iletir
    const id = String(govde.callback_query_id || "");
    if (!id.startsWith("vel-")) return null;
    try { await env.VENOM.elemanCagri({ bot, metod, govde: { ...govde, callback_query_id: id.slice(4) } }); } catch { /* düğme cevabı kaybolsa da iş sürer */ }
    return { ok: true, result: true };
  }
  const venomMesaji = Number(govde.message_id) >= EL_FARK; // Venom'dan gitmiş mesaj: düzenleme / silme de Venom'dan
  if (EL_DUZENLE.has(metod)) { if (!venomMesaji) return null; }
  else if (!EL_GONDER.has(metod) || !(await elemanaGider(env, govde.chat_id))) return null;
  try {
    const g = { ...govde }, dosyalar = {};
    let n = 0;
    const cevir = async (m) => { const d = await elDosya(env, m, tgCagir); if (!d) return m; const k = `d${n++}`; dosyalar[k] = d; return `attach://${k}`; };
    for (const alan of Object.values(MEDYA_ALAN)) if (g[alan] != null) g[alan] = await cevir(g[alan]);
    if (Array.isArray(g.media)) g.media = await Promise.all(g.media.map(async (x) => ({ ...x, media: await cevir(x.media) })));
    else if (g.media && typeof g.media === "object" && g.media.media) g.media = { ...g.media, media: await cevir(g.media.media) };
    const r = await env.VENOM.elemanCagri({ bot, metod, govde: g, dosyalar });
    if (!r || typeof r !== "object") throw new Error("Venom cevap vermedi");
    if (r.venomYok) throw new Error(r.description || "Venom gönderemedi");
    return elSonucEkle(r);
  } catch (e) {
    if (venomMesaji) return { ok: false, description: `Venom'a ulaşılamadı (mesaj Venom'da; botun kendi yolundan düzenlenemez): ${String(e && e.message).slice(0, 120)}` };
    // YEDEK YOL: gönderim botun kendi yolundan gider; kapı 10 dk kapalı sayılır
    const simdi = Math.floor(Date.now() / 1000);
    elBayrak = { ...elBayrak, yedek: simdi };
    try { await env.KAYIT.put("venom:elemanYedek", String(simdi), { expirationTtl: 600 }); await env.KAYIT.put("venom:elemanKapiHata", JSON.stringify({ zaman: simdi, bot, metod, hata: String(e && e.message).slice(0, 200) }), { expirationTtl: 7 * 86400 }); } catch { /* */ }
    return null;
  }
}
// Çok parçalı (FormData) gönderim için aynı yol
export async function elemanFormYolu(env, bot, metod, form, tgCagir) {
  if (!env || !env.VENOM || !form || typeof form.get !== "function" || !(await elemanaGider(env, form.get("chat_id")))) return null;
  const govde = {};
  for (const [k, v] of form.entries()) govde[k] = v;
  if (typeof govde.media === "string") { try { govde.media = JSON.parse(govde.media).map((m) => ({ ...m, media: /^attach:\/\//.test(m.media) ? form.get(m.media.slice(9)) : m.media })); } catch { /* */ } }
  if (typeof govde.reply_markup === "string") { try { govde.reply_markup = JSON.parse(govde.reply_markup); } catch { /* */ } }
  for (const a of Object.values(MEDYA_ALAN)) if (typeof govde[a] === "string" && /^attach:\/\//.test(govde[a])) govde[a] = form.get(govde[a].slice(9));
  return elemanYolu(env, bot, metod, govde, tgCagir);
}
// Venom'dan gelen ELEMAN düğmesi / yazısı: sahte güncelleme (kimden: o eleman). kisi: { id, ad, cq?, mesaj? }
export function sahteElemanDugme(data, kisi) {
  const id = Number(kisi.id), m = kisi.mesaj || {};
  return { update_id: Date.now(), callback_query: { id: `vel-${kisi.cq || Date.now()}`, from: { id, is_bot: false, first_name: kisi.ad || "" }, data: String(data), chat_instance: "venom", message: { date: Math.floor(Date.now() / 1000), ...m, message_id: m.message_id ? Number(m.message_id) + EL_FARK : 0, chat: { id, type: "private" } } } };
}
export function sahteElemanMesaj(metin, kisi) {
  const id = Number(kisi.id), t = Math.floor(Date.now() / 1000);
  const yanit = kisi.yanit && kisi.yanit.message_id ? { reply_to_message: { ...kisi.yanit, message_id: Number(kisi.yanit.message_id) + EL_FARK, chat: { id, type: "private" } } } : {};
  return { update_id: Date.now(), message: { message_id: Date.now() % 1000000000, date: t, chat: { id, type: "private", first_name: kisi.ad || "" }, from: { id, is_bot: false, first_name: kisi.ad || "" }, text: String(metin).slice(0, 3500), ...yanit } };
}
