// UÇTAN UCA ZİNCİR DENEMESİ (11 Kasım, Patron kalıcı kuralı 52): elemanlara hiçbir şey GİTMEZ. Sami ve Venom'un GERÇEK kodu, ortak depo (StokDO)
// ve ortak kayıt (KV) ile birlikte çalışır; Telegram sahtedir, her düğmeye sahte basılır ve her adımda giden mesaj okunur.
// Zincir: Sinem "Bitti" → Hemra [Repete] + [Patron'a gönder] → Patron [Onaylıyorum] → Fuat [2 gün sonra dön] → kart yeniden → Fuat [Yapamam]
//   → Patron "TEST-002 repete tekrar aç" → Fuat [4-8 gün] → Patron'a TEK sonuç satırı.
// Çalıştırma: node --test test-zincir.mjs   (ZINCIR_DOKUM=1 ile her mesaj ekrana yazılır)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";

const PATRON = 111, HEMRA = 333, AZIZ = 444, MERDAN = 222, NURI = 555, SINEM = 556, FUAT = 557;
const AD = { [PATRON]: "Patron", [HEMRA]: "Hemra", [AZIZ]: "Aziz", [MERDAN]: "Merdan", [NURI]: "Nuri", [SINEM]: "Sinem", [FUAT]: "Fuat" };

function ortam() {
  const depo = new Map();
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
    async put(k, v) { depo.set(k, v); }, async delete(k) { depo.delete(k); },
    async list({ prefix = "" } = {}) { return { keys: [...depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }; },
  };
  const STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  const kimlik = { MURAT_ID: String(PATRON), FABRIKA_SORUMLU: String(HEMRA), HEMRA_ID: String(HEMRA), AZIZ_ID: String(AZIZ), BR_SORUMLU: String(MERDAN), FUAT_ID: String(FUAT), NURI_ID: String(NURI), EKIP_IDS: `${HEMRA},${AZIZ}` };
  const samiEnv = { BOT_TOKEN: "sami-token", WEBHOOK_SECRET: "s", ALLOWED_IDS: `${PATRON},${MERDAN}`, SELF_URL: "https://volonte-sami.test", MESAJ_ARASI_MS: "0", KAYIT, STOK, ...kimlik };
  const venomEnv = { BOT_TOKEN: "venom-token", WEBHOOK_SECRET: "v", ANTHROPIC_API_KEY: "k", SELF_URL: "https://venom.test", ALLOWED_IDS: String(PATRON), KAYIT, STOK, ...kimlik };
  const giden = []; // { bot, kime, metod, yazi, dugmeler, mesaj }
  let no = 100;
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com") && (globalThis.__beyinSira || []).length) { const c = globalThis.__beyinSira.shift(); return Response.json({ id: "m", type: "message", role: "assistant", stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: c.arac, input: c.girdi }], usage: { input_tokens: 1, output_tokens: 1 } }); } // 12 Kasım: beyin aracı seçer
    if (u.startsWith("https://api.anthropic.com")) return Response.json({ id: "m", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Tamam Patron." }], usage: { input_tokens: 1, output_tokens: 1 } });
    const m = u.match(/\/bot([^/]+)\/(\w+)$/);
    if (!m) return Response.json({ ok: false, description: "bilinmeyen adres" });
    const bot = /sami/.test(m[1]) ? "Sami" : "Venom", metod = m[2];
    const g = istek.body ? JSON.parse(istek.body) : {};
    if (metod === "getWebhookInfo") return Response.json({ ok: true, result: { url: bot === "Venom" ? "https://venom.test/telegram" : "https://volonte-sami.test/telegram", pending_update_count: 0 } });
    if (["answerCallbackQuery", "sendChatAction", "setWebhook", "setMyCommands"].includes(metod)) return Response.json({ ok: true, result: true });
    const mesaj = /^edit/.test(metod) ? g.message_id : ++no;
    if (g.chat_id != null) giden.push({ bot, kime: AD[g.chat_id] || String(g.chat_id), metod, yazi: String(g.caption || g.text || ""), dugmeler: ((g.reply_markup || {}).inline_keyboard || []).map((s) => s.map((b) => b.text)), data: ((g.reply_markup || {}).inline_keyboard || []).flat().map((b) => b.callback_data), resim: Boolean(g.photo), mesaj });
    return Response.json({ ok: true, result: { message_id: mesaj, chat: { id: g.chat_id }, ...(g.photo ? { photo: [{ file_id: "x" }], caption: g.caption } : { text: g.text }), reply_markup: g.reply_markup } });
  };
  return { depo, stok, samiEnv, venomEnv, giden };
}

test("UÇTAN UCA: Sinem 'Bitti' → Hemra → Patron → Fuat [2 gün sonra dön] → Fuat [Yapamam] → 'tekrar aç' → Fuat [4-8 gün] → Patron'a TEK satır (elemanlara gerçek mesaj gitmez)", async () => {
  const o = ortam();
  const sami = await import("./sami.js");
  const fabrika = await import("./fabrika.js");
  const rk = await import("./repete-kart.js");
  const venom = await import("./venom-bot.js");
  // Venom → Sami iç bağlantısı (Cloudflare'deki VenomKapisi ile aynı işlevler)
  o.venomEnv.SAMI_W = { dugme: (d, r) => sami.venomDugme(o.samiEnv, d, r), mesaj: (t) => sami.venomMesaj(o.samiEnv, t), repeteAdim: () => sami.repeteAdim(o.samiEnv) };
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: NURI, ad: "Nuri" }, { id: SINEM, ad: "Sinem" }, { id: FUAT, ad: "Fuat" }]));
  o.depo.set("venom:bot:klavye:v1", "1");
  const adimlar = [];
  let bas0 = 0;
  const adim = (ad) => { const yeni = o.giden.slice(bas0); bas0 = o.giden.length; adimlar.push({ ad, yeni }); if (process.env.ZINCIR_DOKUM) { console.log(`\n=== ${ad}`); for (const x of yeni) console.log(`  [${x.bot} → ${x.kime}] ${x.metod} #${x.mesaj}${x.resim ? " (resimli)" : ""}\n    ${x.yazi.replace(/\n/g, " / ")}${x.dugmeler.length ? `\n    düğmeler: ${JSON.stringify(x.dugmeler)}` : ""}`); } return yeni; };
  const samiBas = (kim, data) => sami.guncelleme({ callback_query: { id: "c", from: { id: kim, first_name: AD[kim] }, data, message: { chat: { id: kim }, message_id: 1 } } }, o.samiEnv);
  let uid = 1;
  const venomBas = (data) => venom.guncelleme({ update_id: uid++, callback_query: { id: "c", from: { id: PATRON, first_name: "MURAT" }, data, message: { chat: { id: PATRON }, message_id: 1 } } }, o.venomEnv);
  const venomYaz = (text) => venom.guncelleme({ update_id: uid++, message: { message_id: 1, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, text } }, o.venomEnv);
  const dugme = (yeni, kime, desen) => { const x = [...yeni].reverse().find((y) => y.kime === kime && y.data.length); assert.ok(x, `${kime}'e düğmeli mesaj yok`); const i = x.dugmeler.flat().findIndex((t) => desen.test(t)); assert.ok(i >= 0, `${kime} kartında ${desen} yok: ${JSON.stringify(x.dugmeler)}`); return x.data[i]; };
  const simdi = Math.floor(Date.now() / 1000);

  // 0) deneme kartı SADECE Sinem'e
  o.depo.set("sami:islemler", JSON.stringify([{ tur: "akisSinem", kod: "TEST-002", donSn: 120 }]));
  await fabrika.fabrikaZincirAdimi(o.samiEnv, simdi, (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json()));
  let y = adim("0) Sami → Sinem: deneme kartı");
  assert.deepEqual([...new Set(y.map((x) => x.kime))], ["Sinem"]);
  assert.match(y[0].yazi, /^🧪 DENEME – üretim yapmayın\n🟦 VOLONTE\nTEST-002 DENEME · Büyük \(44-50\) · beyaz 16$/);
  assert.ok(y[0].resim);

  // 1) Sinem "Bitti" → Hemra'ya kart (Fuat'a bitti onayı DENEMEDE gitmez)
  await samiBas(SINEM, dugme(y, "Sinem", /Bitti/));
  y = adim("1) Sinem 'Bitti' → Hemra kartı");
  assert.ok(!y.some((x) => ["Fuat", "Nuri", "Aziz", "Merdan", "Patron"].includes(x.kime) && x.metod === "sendMessage" && x.bot === "Sami" && x.kime !== "Sinem"));
  const hk = y.find((x) => x.kime === "Hemra" && x.data.length);
  assert.match(hk.yazi, /TEST-002\n❌ Fabrikada bitti \(Sinem\)\.\nMağazada kalan: 4 adet\nSatış: son 7 günde 18[\s\S]*💡 Sami: Hızlı satıyor[\s\S]*Repete dağılımı: beyaz · büyük 20, küçük 20 \(toplam 40 adet\)\nNe yapalım\?$/);
  assert.deepEqual(hk.dugmeler, [["🔁 Repete"], ["⏳ Bitene kadar bekle"], ["🗑 Sil"]]);

  // 2) Hemra [Repete] → [Patron'a gönder]
  await samiBas(HEMRA, dugme(y, "Hemra", /Repete/));
  y = adim("2a) Hemra 'Repete' → dağılım onayı");
  await samiBas(HEMRA, dugme(y, "Hemra", /Patron'a gönder/));
  y = adim("2b) Hemra 'Patron'a gönder'");
  assert.match(y.at(-1).yazi, /✅ Hemra onayladı — Patron'un onayına gitti\.$/);

  // 3) Venom: Patron kartı → Patron [Onaylıyorum] → Fuat'ın kartı HEMEN (Sami'nin 5 dk görevi beklenmez)
  await venom.venomCron(o.venomEnv, simdi + 60);
  y = adim("3a) Venom → Patron: repete kartı");
  const pk = y.find((x) => x.kime === "Patron" && x.data.some((d) => /^vrk:/.test(d)));
  assert.ok(pk, "Patron kartı gelmedi");
  assert.deepEqual(pk.dugmeler, [["✅ Onaylıyorum", "❌ Reddediyorum"]]);
  await venomBas(dugme(y, "Patron", /Onaylıyorum/));
  y = adim("3b) Patron 'Onaylıyorum' → Fuat kartı (hemen)");
  const fk = y.find((x) => x.kime === "Fuat" && x.data.length);
  assert.ok(fk, "Fuat'a kart HEMEN gitmedi");
  assert.deepEqual(fk.dugmeler, [["✅ 4-8 gün", "✅ 10-15 gün"], ["⏳ 2 gün sonra dön"], ["❌ Yapamam"]]);
  assert.match(fk.yazi, /^🧪 DENEME – üretim yapmayın\n🟦 VOLONTE\n🔁 REPETE · TEST-002 · beyaz · büyük 20, küçük 20\nToplam 40 adet\. Dağılım sabittir, değiştirilmez\.$/);

  // 4) Fuat [2 gün sonra dön] → süre dolunca kart Fuat'a yeniden (Hemra'ya sorulmaz)
  await samiBas(FUAT, dugme(y, "Fuat", /2 gün sonra dön/));
  y = adim("4a) Fuat '2 gün sonra dön'");
  assert.ok(!y.some((x) => x.kime === "Hemra"));
  await rk.repeteKartAdimi(o.samiEnv, Math.floor(Date.now() / 1000) + 130, (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json()));
  y = adim("4b) süre doldu → kart Fuat'a yeniden");
  assert.deepEqual(y.map((x) => x.kime), ["Fuat"]);
  assert.equal(y[0].dugmeler.flat().length, 4);

  // 5) Fuat [Yapamam] → "Tamam, teşekkürler"; Hemra'ya bilgi; Patron'a mesaj YOK
  await samiBas(FUAT, dugme(y, "Fuat", /Yapamam/));
  y = adim("5) Fuat 'Yapamam'");
  assert.ok(y.some((x) => x.kime === "Fuat" && /Tamam, teşekkürler\.$/.test(x.yazi)));
  assert.ok(y.some((x) => x.kime === "Hemra" && /Fuat "yapamam" dedi\. Kayıt beklemede/.test(x.yazi)));
  await venom.venomCron(o.venomEnv, simdi + 400);
  y = adim("5b) Venom görevi (Patron'a bir şey gitmemeli)");
  assert.ok(!y.some((x) => x.kime === "Patron" && /TEST-002/.test(x.yazi)));

  // 6) Patron Venom'a "TEST-002 repete tekrar aç" → kart Fuat'a HEMEN; Patron'a TEK sonuç
  globalThis.__beyinSira = [{ arac: "repete_tekrar_ac", girdi: { kod: "TEST-002" } }]; // Patron'un mesajı beyne gider; beyin "repete tekrar aç" aracını seçer
  await venomYaz("TEST-002 repete tekrar aç");
  y = adim("6) Patron 'TEST-002 repete tekrar aç'");
  assert.ok(y.some((x) => x.kime === "Fuat" && x.data.length), "kart Fuat'a yeniden gitmedi");
  assert.deepEqual(y.filter((x) => x.kime === "Patron").map((x) => x.yazi), ["🧪 DENEME — 🔁 TEST-002 repete tekrar açıldı (Patron); kart Fuat'a yeniden gitti."]);

  // 7) Fuat [4-8 gün] → kayıt + Patron'a TEK satır
  await samiBas(FUAT, dugme(y, "Fuat", /4-8 gün/));
  y = adim("7a) Fuat '4-8 gün'");
  await venom.venomCron(o.venomEnv, simdi + 700);
  y = [...y, ...adim("7b) Venom → Patron: sonuç satırı")];
  const teslim = new Date((Math.floor(Date.now() / 1000) + 8 * 86400 + 3 * 3600) * 1000).toISOString().slice(0, 10).split("-").reverse().join(".");
  assert.deepEqual(o.giden.filter((x) => x.kime === "Patron" && /Fuat onayladı · teslim/.test(x.yazi)).map((x) => x.yazi), [`🧪 DENEME — TEST-002 · 40 adet · Fuat onayladı · teslim: ${teslim}`]);

  // genel: Nuri'ye, Aziz'e, Merdan'a HİÇBİR şey gitmedi; Fuat'a giden her mesaj DENEME başlıklı; aynı mesaj iki kez gitmedi
  assert.ok(!o.giden.some((x) => ["Nuri", "Aziz", "Merdan"].includes(x.kime)));
  assert.ok(o.giden.filter((x) => x.kime === "Fuat" && x.metod === "sendMessage" || x.kime === "Fuat" && x.metod === "sendPhoto").every((x) => /^🧪 DENEME/.test(x.yazi)));
  if (process.env.ZINCIR_DOKUM) console.log(`\nTOPLAM ${o.giden.length} mesaj; adımlar: ${adimlar.map((a) => a.ad.split(")")[0]).join(" ")}`);
});

test("TEKRAR YASAK: Patron aynı mesajı (\"test\") Fuat'a 4 kez isterse sadece İLK kart açılır; onaylanan mesaj 24 saatte ikinci kez gitmez; fabrikaya 'test' DENEME başlığı olmadan gitmez", async () => {
  const o = ortam();
  const venom = await import("./venom-bot.js");
  const { venomGidenAdimi, kuyruguAl } = await import("./venom-kopru.js");
  const simdi = Math.floor(Date.now() / 1000);
  o.venomEnv.__sohbette = true;
  const c1 = await venom.aracCalistir(o.venomEnv, "mesaj_taslagi", { kime: "fuat", metin: "test" }, simdi);
  const c2 = await venom.aracCalistir(o.venomEnv, "mesaj_taslagi", { kime: "fuat", metin: "Test " }, simdi + 60);
  assert.match(c1, /^Onay kartı Patron'a gösterildi/);
  assert.match(c2, /^AYNI MESAJIN KARTI ZATEN BEKLİYOR/);
  assert.equal(o.giden.filter((x) => x.kime === "Patron" && /Fuat'a gidecek mesaj/.test(x.yazi)).length, 1);
  // Sami tarafı: aynı mesaj iki ayrı işle gelse bile ikincisi gitmez; giden "test" DENEME başlıklı
  const ekle = (id) => o.venomEnv.STOK.get().fetch("https://stok/kuyruk-ekle", { method: "POST", body: JSON.stringify({ ad: "giden", kayit: { id, kime: "fuat", metin: "test", tur: "mesaj" } }) });
  await ekle("a1"); await ekle("a2");
  const tg = (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json());
  await venomGidenAdimi(o.samiEnv, simdi, tg);
  const fuat = o.giden.filter((x) => x.kime === "Fuat");
  assert.deepEqual(fuat.map((x) => x.yazi), ["🧪 DENEME — Bu bir deneme, üretim yapmayın.\ntest"]);
  const sonuc = await kuyruguAl(o.venomEnv, "sonuc");
  assert.ok(sonuc.some((x) => !x.ok && /zaten gitmişti; ikinci kez GÖNDERİLMEDİ/.test(x.aciklama)));
});

test("KART TAKİBİ (kural 54): basılmayan kart 30 dk (mesai) → kişiye bir kez 'Size kart geldi'; 1 saat → Venom Hemra'ya yazar; basılan / düzenlenen kart takipten düşer; engel → Patron'a tek satır", async () => {
  const o = ortam();
  const kt = await import("./kart-takip.js");
  const venom = await import("./venom-bot.js");
  const { venomGidenAdimi } = await import("./venom-kopru.js");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: FUAT, ad: "Fuat" }, { id: SINEM, ad: "Sinem" }]));
  o.depo.set("venom:bot:klavye:v1", "1");
  const tg = (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json());
  const kart = { chat_id: FUAT, caption: "🧪 DENEME – üretim yapmayın\n🔁 REPETE · TEST-002 · beyaz · büyük 20, küçük 20", reply_markup: { inline_keyboard: [[{ text: "✅ 4-8 gün", callback_data: "rk:f8:x" }]] } };
  const bas = Date.UTC(2026, 10, 11, 9, 0) / 1000; // çarşamba 12:00
  const gercek = Date.now;
  try {
    Date.now = () => bas * 1000;
    await kt.kartIzle(o.samiEnv, "sendPhoto", kart, { ok: true, result: { message_id: 2088 } });
    await kt.kartIzle(o.samiEnv, "sendPhoto", { ...kart, chat_id: SINEM }, { ok: true, result: { message_id: 3000 } });
    await kt.kartIzle(o.samiEnv, "sendMessage", { ...kart, chat_id: PATRON }, { ok: true, result: { message_id: 9 } }); // Patron takip edilmez
    await kt.kartBasildi(o.samiEnv, SINEM, 3000); // Sinem bastı → takipten düşer
  } finally { Date.now = gercek; }
  await kt.kartTakipAdimi(o.samiEnv, bas + 20 * 60, tg);
  assert.equal(o.giden.length, 0);
  await kt.kartTakipAdimi(o.samiEnv, bas + 31 * 60, tg);
  assert.deepEqual(o.giden.map((x) => [x.kime, x.yazi]), [["Fuat", kt.HATIRLATMA_YAZI]]);
  await kt.kartTakipAdimi(o.samiEnv, bas + 45 * 60, tg);
  assert.equal(o.giden.length, 1); // bir kez
  await kt.kartTakipAdimi(o.samiEnv, bas + 61 * 60, tg);
  await venom.venomCron(o.venomEnv, bas + 62 * 60);
  await venomGidenAdimi(o.samiEnv, bas + 63 * 60, tg);
  assert.ok(o.giden.some((x) => x.kime === "Hemra" && /^📌 Fuat 12:00'te gelen karta 1 saattir basmadı \(bir kez hatırlatıldı\): 🔁 REPETE · TEST-002/.test(x.yazi)));
  assert.ok(!o.giden.some((x) => x.kime === "Patron")); // engel yok → Patron'a gelmez
  // engelli hesap: Telegram 403 → Patron'a tek satır
  const eskiFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (/sendChatAction|sendMessage/.test(String(u)) && /sami-token/.test(String(u)) && String(JSON.parse(i.body).chat_id) === String(NURI) ? Response.json({ ok: false, description: "Forbidden: bot was blocked by the user" }) : eskiFetch(u, i));
  try {
    Date.now = () => bas * 1000;
    await kt.kartIzle(o.samiEnv, "sendPhoto", { ...kart, chat_id: NURI }, { ok: true, result: { message_id: 4000 } });
    Date.now = gercek;
    await kt.kartTakipAdimi(o.samiEnv, bas + 31 * 60, tg);
    await kt.kartTakipAdimi(o.samiEnv, bas + 61 * 60, tg);
    await venom.venomCron(o.venomEnv, bas + 67 * 60);
  } finally { globalThis.fetch = eskiFetch; Date.now = gercek; }
  assert.deepEqual(o.giden.filter((x) => x.kime === "Patron").map((x) => x.yazi), ["⚠️ Kart Nuri hesabına ulaşmıyor: Telegram: Forbidden: bot was blocked by the user (12:00, \"🔁 REPETE · TEST-002 · beyaz · büyük 20, küçük 20\"). Hemra'ya bildirildi; hesabın düzeltilmesi gerekiyor."]);
});
