// ELEMAN KAPISI (kural 100) — DENEME: gerçek elemanlara hiçbir şey gitmez; Telegram sahtedir, kişiler sahte kimliklerdir.
// Çalıştırma: node --test test-eleman.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";
import * as venom from "./venom-bot.js";
import * as sami from "./sami.js";
import * as G from "./venom-gorev.js";
import { elemanYolu, elemanFormYolu, elemanaGider, _elBayrakSifirla, EL_FARK, sahteElemanDugme, sahteElemanMesaj } from "./tek-kapi.js";

const PATRON = 999, FUAT = "501", NURI = "502", MERDAN = "503", HEMRA = "504";
const ist = (gun, hh, mm = 0) => Date.UTC(2026, 10, gun, hh - 3, mm) / 1000; // Kasım 2026, İstanbul saati

function ortam({ acik = [MERDAN] } = {}) {
  _elBayrakSifirla();
  const depo = new Map();
  const g = []; // bütün Telegram çağrıları: { bot, metod, govde }
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) {
    if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; }
    const st = db.prepare(q);
    const satir = /^\s*SELECT/i.test(q) ? st.all(...p).map((r) => ({ ...r })) : (st.run(...p), []);
    return { toArray: () => satir };
  } };
  const stok = new StokDO({ storage: { sql } });
  const KAYIT = {
    async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
    async put(k, v) { depo.set(k, v); },
    async delete(k) { depo.delete(k); },
    async list({ prefix = "" } = {}) { return { keys: [...depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }; },
  };
  const STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  const ortak = { MURAT_ID: String(PATRON), FUAT_ID: FUAT, NURI_ID: NURI, BR_SORUMLU: MERDAN, HEMRA_ID: HEMRA, ALLOWED_IDS: String(PATRON), KAYIT, STOK, WEBHOOK_SECRET: "gizli" };
  depo.set("venom:bot:klavye:v1", "1");
  if (acik) depo.set("venom:elemanKapi", JSON.stringify({ kisiler: acik }));
  const venomEnv = { ...ortak, BOT_TOKEN: "venom-token", ANTHROPIC_API_KEY: "k", SELF_URL: "https://venom.test" };
  const samiEnv = { ...ortak, BOT_TOKEN: "sami-token", EKIP_IDS: `${MERDAN},${HEMRA}`, FABRIKA_SORUMLU: HEMRA, SELF_URL: "https://sami.test" };
  const durum = { venomKapali: false, samiMesaj: [] };
  samiEnv.VENOM = { elemanCagri: async (x) => { if (durum.venomKapali) throw new Error("Venom cevap vermiyor"); return venom.venomElemanCagri(venomEnv, x); }, aktar: async () => true, fabrikaKontrol: async () => ({ ok: true }), sesYazi: async () => null };
  venomEnv.SAMI_W = { dugme: (d, rid, kisi) => sami.venomDugme(samiEnv, d, rid, kisi), mesaj: async (metin, kisi) => { durum.samiMesaj.push({ metin, kisi }); return sami.venomMesaj(samiEnv, metin, kisi); }, gidenAdim: () => sami.gidenAdim(samiEnv), islemAdim: async () => true };
  const sayac = { "venom-token": 7000, "sami-token": 300 };
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    const dosya = u.match(/^https:\/\/api\.telegram\.org\/file\/bot([^/]+)\/(.+)$/);
    if (dosya) return new Response(new Uint8Array([1, 2, 3, 4]));
    const m = u.match(/^https:\/\/api\.telegram\.org\/bot([^/]+)\/([A-Za-z]+)/);
    if (!m) return Response.json({ ok: true });
    const [, token, metod] = m;
    const govde = istek.body instanceof FormData ? Object.fromEntries([...istek.body.entries()].map(([k, v]) => [k, typeof v !== "string" ? `<dosya:${v.size}>` : ["reply_markup", "media"].includes(k) ? JSON.parse(v) : v])) : istek.body ? JSON.parse(istek.body) : {};
    g.push({ bot: token.replace("-token", ""), metod, govde });
    if (metod === "getFile") return Response.json({ ok: true, result: { file_path: "photos/a.jpg" } });
    if (metod === "getWebhookInfo") return Response.json({ ok: true, result: { url: "https://x/telegram" } });
    if (/^(answerCallbackQuery|deleteMessage|sendChatAction)$/.test(metod)) return Response.json({ ok: true, result: true });
    if (metod === "sendMediaGroup") return Response.json({ ok: true, result: govde.media.map(() => ({ message_id: ++sayac[token], chat: { id: Number(govde.chat_id) } })) });
    const mid = /^edit/.test(metod) ? Number(govde.message_id) : ++sayac[token];
    return Response.json({ ok: true, result: { message_id: mid, chat: { id: Number(govde.chat_id) }, ...(govde.text ? { text: govde.text } : {}) } });
  };
  const giden = (bot, kisi, metod = null) => g.filter((x) => x.bot === bot && String(x.govde.chat_id) === String(kisi) && (!metod || x.metod === metod));
  const defter = async () => (await STOK.get().fetch("https://stok/isd-oku", { method: "POST", body: JSON.stringify({ basla: 0 }) })).json();
  return { depo, g, venomEnv, samiEnv, durum, giden, defter, KAYIT, STOK };
}
let uid = 1;
const venomaYaz = (o, kimden, text, ek = {}) => venom.guncelleme({ update_id: uid++, message: { message_id: 50 + uid, date: Math.floor(Date.now() / 1000), chat: { id: Number(kimden), type: "private" }, from: { id: Number(kimden), first_name: "Merdan" }, text, ...ek } }, o.venomEnv);
const venomdaBas = (o, kimden, kart) => venom.guncelleme({ update_id: uid++, callback_query: { id: `cq${uid}`, from: { id: Number(kimden), first_name: "Merdan" }, data: kart.data, message: { message_id: kart.mesaj, date: 1, chat: { id: Number(kimden), type: "private" }, text: kart.text || "", reply_markup: kart.klavye ? { inline_keyboard: kart.klavye } : undefined } } }, o.venomEnv);

test("KAPI KAPALI (bugünkü hal): kayıt yoksa botlar elemana KENDİ botlarından gönderir; Venom elemanın yazısını yok sayar", async () => {
  const o = ortam({ acik: null });
  assert.equal(await elemanaGider(o.samiEnv, MERDAN), false);
  await G.gorevAc(o.venomEnv, { baslik: "Selin: 2 modelin fotoğrafı yok", metin: "Selin'de 2 modelin fotoğrafı yok (3040, 3041).", kalip: "foto", kalemler: [{ kod: "3040" }, { kod: "3041" }], son: ist(10, 18) }, ist(10, 10));
  await sami.gidenAdim(o.samiEnv);
  assert.ok(o.giden("sami", MERDAN, "sendMessage").length >= 1);
  assert.equal(o.g.filter((x) => x.bot === "venom").length, 0);
  await venomaYaz(o, MERDAN, "3040 stokta kaç adet");
  assert.equal(o.g.filter((x) => x.bot === "venom").length, 0); // Venom elemana cevap vermez, bota iletmez
  assert.equal(o.durum.samiMesaj.length, 0);
});

test("KAPI AÇIK (deneme, sadece Merdan): Sami'nin kartı AYNI yazı ve düğmelerle Venom'un botundan gider; Hemra'ya (kapısı kapalı) eski yoldan; Merdan Venom'da basınca Sami 'Merdan bastı' olarak işler, iki kopya da güncellenir", async () => {
  const o = ortam({ acik: [MERDAN] });
  const t0 = ist(10, 10);
  await G.gorevAc(o.venomEnv, { baslik: "Selin: 2 modelin fotoğrafı yok", metin: "Selin'de 2 modelin fotoğrafı yok (3040, 3041).", kalip: "foto", kalemler: [{ kod: "3040" }, { kod: "3041" }], son: ist(10, 18) }, t0);
  await sami.gidenAdim(o.samiEnv);
  const vKart = o.giden("venom", MERDAN, "sendMessage"), sKart = o.giden("sami", HEMRA, "sendMessage");
  assert.equal(vKart.length, 1); // Merdan'ın kartı Venom'dan
  assert.equal(sKart.length, 1); // Hemra'nın kartı Sami'den (eski yol)
  assert.equal(o.giden("sami", MERDAN).length, 0); // Sami Merdan'a DOĞRUDAN hiçbir şey göndermedi
  assert.equal(vKart[0].govde.text, sKart[0].govde.text); // yazı birebir aynı (başlık / ek yok)
  const vDugme = vKart[0].govde.reply_markup.inline_keyboard, sDugme = sKart[0].govde.reply_markup.inline_keyboard;
  assert.deepEqual(vDugme.map((r) => r.map((b) => b.text)), sDugme.map((r) => r.map((b) => b.text))); // düğme yazıları ve düzeni aynı
  assert.deepEqual(vDugme.flat().map((b) => b.callback_data), sDugme.flat().map((b) => `ve:s:${b.callback_data}`)); // veri: Venom → Sami
  // Sami'nin defterinde kart kayıtlı (bot: sami, kişi: Merdan); mesaj numarası Venom'dakinin EL_FARK eklenmişi
  const kartSatiri = (await o.defter()).find((x) => x.tur === "kart" && String(x.kime) === MERDAN);
  assert.equal(kartSatiri.bot, "sami");
  assert.equal(kartSatiri.mesaj, 7001 + EL_FARK);
  // Merdan Venom'da "3040 📷 Bugün çekerim"e basar
  o.g.length = 0;
  await venomdaBas(o, MERDAN, { data: vDugme[0][0].callback_data, mesaj: 7001, text: vKart[0].govde.text, klavye: vDugme });
  assert.deepEqual(o.g.filter((x) => x.metod === "answerCallbackQuery").map((x) => [x.bot, x.govde.text || ""])[0], ["venom", "Kaydedildi ✅"]); // Sami'nin düğme cevabı Merdan'a Venom'dan
  const vDuz = o.g.filter((x) => x.bot === "venom" && /^editMessage/.test(x.metod)), sDuz = o.g.filter((x) => x.bot === "sami" && /^editMessage/.test(x.metod));
  assert.ok(vDuz.length >= 1 && vDuz.every((x) => String(x.govde.chat_id) === MERDAN && x.govde.message_id === 7001)); // Merdan'ın kartı Venom'da, GERÇEK numarayla düzenlendi
  assert.ok(sDuz.length >= 1 && sDuz.every((x) => String(x.govde.chat_id) === HEMRA)); // Hemra'nın kopyası Sami'den düzenlendi
  assert.ok(vDuz.every((x) => !x.govde.reply_markup || x.govde.reply_markup.inline_keyboard.flat().every((b) => !b.callback_data || /^ve:s:/.test(b.callback_data))));
  assert.ok(o.g.some((x) => x.bot === "venom" && x.metod === "answerCallbackQuery")); // düğme cevabı Venom'dan (gerçek düğmeye)
  assert.equal(o.g.filter((x) => x.bot === "sami" && String(x.govde.chat_id) === MERDAN).length, 0);
  const karar = (await o.defter()).find((x) => x.tur === "karar" && String(x.kime) === MERDAN);
  assert.equal(karar.bot, "sami"); // karar defterde: Sami'nin işi, basan Merdan
});

test("Eleman Venom'a YAZAR: yanıt → o bota; konu belli → ilgili bota; belirsiz → 'Şunu anladım … Doğru mu?'; komut / fotoğraf / kapısı kapalı kişi; Venom'un beynine ulaşamaz", async () => {
  const o = ortam({ acik: [MERDAN] });
  // Sami Merdan'a bir şey gönderdi (Venom'dan gitti) → Merdan o mesaja YANIT yazar → Sami'ye "Merdan yazdı"
  const r = await elemanYolu(o.samiEnv, "sami", "sendMessage", { chat_id: Number(MERDAN), text: "3634 kaç adet geldi?" }, null);
  assert.deepEqual([r.ok, r.venomdan, r.result.message_id], [true, true, 7001 + EL_FARK]);
  await venomaYaz(o, MERDAN, "18 geldi", { reply_to_message: { message_id: 7001, text: "3634 kaç adet geldi?" } });
  assert.deepEqual(o.durum.samiMesaj.at(-1), { metin: "18 geldi", kisi: { id: Number(MERDAN), ad: "Merdan", yanit: { message_id: 7001, text: "3634 kaç adet geldi?" } } });
  const u = sahteElemanMesaj("18 geldi", o.durum.samiMesaj.at(-1).kisi);
  assert.deepEqual([u.message.from.id, u.message.chat.id, u.message.text, u.message.reply_to_message.message_id], [503, 503, "18 geldi", 7001 + EL_FARK]);
  // yanıt değil ama Sami az önce yazdı (10 dk) → Sami
  await venomaYaz(o, MERDAN, "tamam");
  assert.equal(o.durum.samiMesaj.at(-1).metin, "tamam");
  // 20 dk sonra, konu belli ("fiyat") → Sami (soru sorulmaz)
  const son = JSON.parse((await (await o.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `venom:el:son:${MERDAN}` }) })).json()).v);
  await o.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `venom:el:son:${MERDAN}`, v: JSON.stringify(son.map((x) => ({ ...x, zaman: x.zaman - 1200 }))) }) });
  await venomaYaz(o, MERDAN, "3627 fiyatı kaç");
  assert.equal(o.durum.samiMesaj.at(-1).metin, "3627 fiyatı kaç");
  // belirsiz ("bir şey soracağım"; son konuşma 20 dk önce) → "Şunu anladım … Doğru mu?" (tahmin: son 30 dk'da konuşan Sami)
  const son2 = JSON.parse((await (await o.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `venom:el:son:${MERDAN}` }) })).json()).v);
  await o.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `venom:el:son:${MERDAN}`, v: JSON.stringify(son2.map((x) => ({ ...x, zaman: Math.floor(Date.now() / 1000) - 1200 }))) }) });
  o.g.length = 0;
  const once = o.durum.samiMesaj.length;
  await venomaYaz(o, MERDAN, "bir şey soracağım");
  assert.equal(o.durum.samiMesaj.length, once); // henüz iletilmedi
  const soru = o.giden("venom", MERDAN, "sendMessage").at(-1);
  assert.match(soru.govde.text, /^Şunu anladım: "bir şey soracağım" — stok \/ fiyat \/ repete \/ liste işi\. Doğru mu\? Değilse hangisi olduğunu seçin\.$/);
  assert.deepEqual(soru.govde.reply_markup.inline_keyboard.map((s) => s[0].text), ["✅ Doğru", "kanal paylaşımı", "fotoğraf / site", "video / üretim"]);
  await venomdaBas(o, MERDAN, { data: soru.govde.reply_markup.inline_keyboard[0][0].callback_data, mesaj: 7002 });
  assert.equal(o.durum.samiMesaj.at(-1).metin, "bir şey soracağım");
  assert.match(o.g.filter((x) => x.bot === "venom" && x.metod === "editMessageText").at(-1).govde.text, /^✅ İletildi/);
  // komut → iletilmez; fotoğraf → şimdilik eski yol notu
  const n2 = o.durum.samiMesaj.length;
  await venomaYaz(o, MERDAN, "/durdur");
  assert.match(o.giden("venom", MERDAN, "sendMessage").at(-1).govde.text, /^Komutlar burada kullanılmaz/);
  await venom.guncelleme({ update_id: uid++, message: { message_id: 99, date: 1, chat: { id: Number(MERDAN), type: "private" }, from: { id: Number(MERDAN) }, photo: [{ file_id: "f" }] } }, o.venomEnv);
  assert.match(o.giden("venom", MERDAN, "sendMessage").at(-1).govde.text, /^📎 Fotoğraf \/ video \/ dosya gönderimi buradan henüz çalışmıyor/);
  assert.equal(o.durum.samiMesaj.length, n2);
  // kapısı kapalı kişi (Hemra) Venom'a yazarsa: bugünkü gibi yok sayılır
  o.g.length = 0;
  await venomaYaz(o, HEMRA, "3627 fiyatı kaç");
  assert.equal(o.g.length, 0);
  assert.equal(o.durum.samiMesaj.length, n2);
  // deftere yazıldı: gelen + yönlendirme
  const d = await o.defter();
  assert.ok(d.some((x) => x.tur === "gelen" && x.bot === "venom" && String(x.kime) === MERDAN && /18 geldi/.test(x.ozet)));
  assert.ok(d.some((x) => x.bot === "venom" && /eleman yazısı Sami botuna iletildi \(yanıt\): "18 geldi"/.test(x.ozet)));
  assert.ok(d.some((x) => x.bot === "venom" && /"Doğru mu\?" soruldu/.test(x.ozet)));
});

test("YEDEK YOL ve güvenlik: Venom cevap vermezse gönderim botun KENDİ yolundan gider, kapı 10 dk kapalı sayılır; Venom'daki mesaj botun yolundan düzenlenmez; Patron / fabrika asla bu kapıdan geçmez", async () => {
  const o = ortam({ acik: [MERDAN, String(PATRON), FUAT] });
  const ham = async (m, g) => (await fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) })).json();
  const tg = async (m, g) => (await elemanYolu(o.samiEnv, "sami", m, g, ham)) || ham(m, g);
  // Patron listede olsa bile eleman sayılmaz
  assert.equal(await elemanaGider(o.samiEnv, PATRON), false);
  // (fabrika kimliği listeye YAZILMAZ — açarken sadece elemanlar yazılır; yazılırsa kapı onu da taşır, bu yüzden liste Patron onayıyla kurulur)
  // normal: Venom'dan
  const r1 = await tg("sendMessage", { chat_id: Number(MERDAN), text: "bir" });
  assert.equal(r1.result.message_id, 7001 + EL_FARK);
  // Venom düşer → aynı mesaj Sami'nin kendi botundan gider (kaybolmaz), kapı 10 dk kapalı
  o.durum.venomKapali = true;
  const r2 = await tg("sendMessage", { chat_id: Number(MERDAN), text: "iki" });
  assert.deepEqual([r2.ok, r2.result.message_id, Boolean(r2.venomdan)], [true, 301, false]);
  assert.deepEqual(o.giden("sami", MERDAN, "sendMessage").map((x) => x.govde.text), ["iki"]);
  assert.ok(Number(o.depo.get("venom:elemanYedek")) > 0);
  o.durum.venomKapali = false;
  const r3 = await tg("sendMessage", { chat_id: Number(MERDAN), text: "üç" }); // Venom geri geldi ama 10 dk dolmadı → yine doğrudan
  assert.equal(r3.result.message_id, 302);
  // Venom'da duran mesajı (numarası EL_FARK'lı) düzenleme: Venom yokken botun yolundan DENENMEZ (yanlış mesaja dokunulmaz)
  o.durum.venomKapali = true;
  const r4 = await tg("editMessageText", { chat_id: Number(MERDAN), message_id: 7001 + EL_FARK, text: "düzeltme" });
  assert.equal(r4.ok, false);
  assert.match(r4.description, /^Venom'a ulaşılamadı/);
  assert.equal(o.g.filter((x) => x.bot === "sami" && x.metod === "editMessageText").length, 0);
  // Venom gelince aynı düzenleme Venom'dan, gerçek numarayla
  o.durum.venomKapali = false;
  const r5 = await tg("editMessageText", { chat_id: Number(MERDAN), message_id: 7001 + EL_FARK, text: "düzeltme" });
  assert.deepEqual([r5.ok, r5.result.message_id], [true, 7001 + EL_FARK]);
  assert.deepEqual(o.g.filter((x) => x.bot === "venom" && x.metod === "editMessageText").map((x) => x.govde.message_id), [7001]);
  // botun eski (doğrudan gitmiş) mesajı: düzenleme botun kendi yolundan
  await tg("editMessageText", { chat_id: Number(MERDAN), message_id: 301, text: "eski" });
  assert.deepEqual(o.g.filter((x) => x.bot === "sami" && x.metod === "editMessageText").map((x) => x.govde.message_id), [301]);
});

test("Fotoğraflı kart ve dosya: botun dosyası indirilip Venom'un botuyla yeniden yüklenir (aynı yazı, aynı düğmeler); albüm; uzun düğme verisi depoda saklanır; 09:30 günlük iş listesi", async () => {
  const o = ortam({ acik: [MERDAN] });
  const ham = async (m, g) => (await fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) })).json();
  const uzun = "x".repeat(70);
  const r = await elemanYolu(o.samiEnv, "sami", "sendPhoto", { chat_id: Number(MERDAN), photo: "SAMI_FILE_ID", caption: "3627 eksik mi?", reply_markup: { inline_keyboard: [[{ text: "Evet", callback_data: "fb:e:1" }, { text: "Uzun", callback_data: uzun }], [{ text: "Site", url: "https://volonte.test" }]] } }, ham);
  assert.equal(r.ok, true);
  const f = o.giden("venom", MERDAN, "sendPhoto")[0];
  assert.equal(f.govde.photo, "<dosya:4>"); // bayt olarak yüklendi (Sami'nin dosya kimliği Venom'da geçmez)
  assert.equal(f.govde.caption, "3627 eksik mi?");
  const kl = f.govde.reply_markup.inline_keyboard;
  assert.equal(kl[0][0].callback_data, "ve:s:fb:e:1");
  assert.match(kl[0][1].callback_data, /^ve:#:[0-9a-f]{10}$/);
  assert.deepEqual(kl[1][0], { text: "Site", url: "https://volonte.test" });
  assert.ok(o.g.some((x) => x.bot === "sami" && x.metod === "getFile")); // Sami kendi dosyasını indirdi
  // uzun düğmeye basılınca asıl veri bota gider
  const gelen = [];
  o.venomEnv.SAMI_W = { dugme: async (d, rid, kisi) => { gelen.push([d, kisi.id, kisi.mesaj.message_id, kisi.mesaj.reply_markup.inline_keyboard[0].map((b) => b.callback_data)]); return true; } };
  await venomdaBas(o, MERDAN, { data: kl[0][1].callback_data, mesaj: 7001, klavye: kl });
  assert.deepEqual(gelen, [[uzun, 503, 7001, ["fb:e:1", uzun]]]); // bota kendi verileriyle döner
  const sd = sahteElemanDugme(uzun, { id: 503, ad: "Merdan", cq: "cq1", mesaj: { message_id: 7001, text: "x" } });
  assert.deepEqual([sd.callback_query.id, sd.callback_query.from.id, sd.callback_query.message.message_id, sd.callback_query.message.chat.id], ["vel-cq1", 503, 7001 + EL_FARK, 503]);
  // albüm
  const a = await elemanYolu(o.samiEnv, "sami", "sendMediaGroup", { chat_id: Number(MERDAN), media: [{ type: "photo", media: "ID1", caption: "albüm" }, { type: "photo", media: "https://site.test/a.jpg" }] }, ham);
  assert.deepEqual(a.result.map((x) => x.message_id), [7002 + EL_FARK, 7003 + EL_FARK]);
  const alb = o.giden("venom", MERDAN, "sendMediaGroup")[0];
  assert.deepEqual(alb.govde.media.map((m) => m.media), ["attach://d0", "https://site.test/a.jpg"]);
  assert.equal(alb.govde.d0, "<dosya:4>");
  // çok parçalı (dosya) gönderim de aynı yoldan
  const form = new FormData();
  form.append("chat_id", MERDAN); form.append("caption", "liste"); form.append("document", new Blob([new Uint8Array([9, 9])], { type: "application/pdf" }), "liste.pdf");
  const d = await elemanFormYolu(o.samiEnv, "sami", "sendDocument", form, ham);
  assert.equal(d.ok, true);
  assert.equal(o.giden("venom", MERDAN, "sendDocument")[0].govde.document, "<dosya:2>");
  // 09:30 günlük iş listesi: sadece kapısı açık ve bekleyen kartı olan elemana, günde bir kez
  const { defterYaz } = await import("./is-defteri.js");
  await defterYaz(o.venomEnv, { zaman: ist(18, 9, 0), bot: "sami", tur: "kart", kime: MERDAN, kod: "3627", ozet: "3627 eksik listesi kontrolü", chat: MERDAN, mesaj: 5, cbler: ["fb:e:1"] });
  await defterYaz(o.venomEnv, { zaman: ist(18, 9, 0), bot: "sami", tur: "kart", kime: HEMRA, kod: "3628", ozet: "3628 kontrol", chat: HEMRA, mesaj: 6, cbler: ["fb:e:2"] });
  o.g.length = 0;
  assert.equal(await venom.elemanGunlukListe(o.venomEnv, ist(18, 9, 20)), 0); // 09:30'dan önce yok
  assert.equal(await venom.elemanGunlukListe(o.venomEnv, ist(18, 9, 32)), 1);
  assert.equal(await venom.elemanGunlukListe(o.venomEnv, ist(18, 9, 37)), 0); // günde bir kez
  const liste = o.g.filter((x) => x.metod === "sendMessage");
  assert.deepEqual(liste.map((x) => [x.bot, String(x.govde.chat_id)]), [["venom", MERDAN]]);
  assert.match(liste[0].govde.text, /^📋 Bugün cevabınızı bekleyen işler \(1\):\n• 3627 eksik listesi kontrolü\nKartlar yukarıda duruyor; düğmesine basmanız yeterli\.$/);
});
