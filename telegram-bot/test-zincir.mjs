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
  assert.deepEqual(hk.dugmeler, [["🔁 Repete"], ["⏳ Bitene kadar bekle"]]); // 13 Kasım (kural 41): "Sil" yok

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

test("KART TAKİBİ — TEK MERDİVEN (13 Kasım, kural 4): 1 saat → 'Hatırlatma', 1 saat → 'Son hatırlatma', 1 saat → Venom Hemra'ya kartın yazısını '⏩ … karar sizde' ile sorar, 1 saat → Patron'a TEK satır; mesai dışında ve pazar günü hiçbir şey gitmez; basılan / düzenlenen kart düşer; deneme modu kartı takip edilmez; engel → Patron'a tek satır", async () => {
  const o = ortam();
  const kt = await import("./kart-takip.js");
  const venom = await import("./venom-bot.js");
  const { venomGidenAdimi } = await import("./venom-kopru.js");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: FUAT, ad: "Fuat" }, { id: SINEM, ad: "Sinem" }]));
  o.depo.set("venom:bot:klavye:v1", "1");
  const tg = (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json());
  const kart = { chat_id: FUAT, caption: "🔁 REPETE · 3394 · beyaz · büyük 20, küçük 20", reply_markup: { inline_keyboard: [[{ text: "✅ 4-8 gün", callback_data: "rk:f8:x" }]] } };
  assert.deepEqual([kt.HATIRLAT_SN, kt.SON_SN, kt.BILDIR_SN, kt.PATRON_SN], [3600, 7200, 10800, 14400]);
  const bas = Date.UTC(2026, 10, 11, 7, 0) / 1000; // çarşamba 10:00
  const dk = (n) => bas + n * 60;
  const gercek = Date.now;
  try {
    Date.now = () => bas * 1000;
    await kt.kartIzle(o.samiEnv, "sendPhoto", kart, { ok: true, result: { message_id: 2088 } });
    await kt.kartIzle(o.samiEnv, "sendPhoto", { ...kart, chat_id: SINEM }, { ok: true, result: { message_id: 3000 } });
    await kt.kartIzle(o.samiEnv, "sendMessage", { ...kart, chat_id: PATRON }, { ok: true, result: { message_id: 9 } }); // Patron takip edilmez
    await kt.kartIzle(o.samiEnv, "sendMessage", { chat_id: NURI, text: "🧪 DENEME — bu kart denemedir, gerçek sipariş değildir.\n5068 · Büyük (44-50) · siyah 12", reply_markup: kart.reply_markup }, { ok: true, result: { message_id: 5000 } }); // deneme modu kartı takip edilmez
    await kt.kartBasildi(o.samiEnv, SINEM, 3000); // Sinem bastı → takipten düşer
  } finally { Date.now = gercek; }
  // 30 ve 59. dakikada hiçbir şey gitmez (eski 30 dk kuralı yok)
  await kt.kartTakipAdimi(o.samiEnv, dk(31), tg);
  await kt.kartTakipAdimi(o.samiEnv, dk(59), tg);
  assert.equal(o.giden.length, 0);
  // 1. saat: hatırlatma (Patron onaylı yazı), bir kez
  await kt.kartTakipAdimi(o.samiEnv, dk(61), tg);
  assert.deepEqual(o.giden.map((x) => [x.kime, x.yazi]), [["Fuat", "🔔 Hatırlatma: cevap bekleyen kartınız var — 3394 · repete siparişi. En alttaki karta bakın, düğmeye basın."]]);
  await kt.kartTakipAdimi(o.samiEnv, dk(90), tg);
  assert.equal(o.giden.length, 1);
  // 2. saat: son hatırlatma
  await kt.kartTakipAdimi(o.samiEnv, dk(121), tg);
  assert.deepEqual(o.giden.at(-1), { ...o.giden.at(-1), kime: "Fuat", yazi: "⏰ Son hatırlatma: 3394 · repete siparişi hâlâ cevap bekliyor." });
  assert.equal(o.giden.length, 2);
  // 3. saat: Venom çözer → Hemra'ya kartın yazısı, başında onaylı satır; Patron'a bir şey gelmez
  await kt.kartTakipAdimi(o.samiEnv, dk(181), tg);
  await venom.venomCron(o.venomEnv, dk(182));
  await venomGidenAdimi(o.samiEnv, dk(183), tg);
  assert.ok(o.giden.some((x) => x.kime === "Hemra" && x.yazi === "⏩ Fuat 3 saattir cevap vermedi — karar sizde.\n🔁 REPETE · 3394 · beyaz · büyük 20, küçük 20"), JSON.stringify(o.giden.map((x) => [x.kime, x.yazi])));
  assert.ok(!o.giden.some((x) => x.kime === "Patron"));
  assert.ok(!o.giden.some((x) => x.kime === "Nuri")); // deneme modu kartına hatırlatma yok
  // 4. saat: hâlâ açık → Patron'a TEK satır (bir kez)
  await kt.kartTakipAdimi(o.samiEnv, dk(241), tg);
  await venom.venomCron(o.venomEnv, dk(242));
  await kt.kartTakipAdimi(o.samiEnv, dk(300), tg);
  await venom.venomCron(o.venomEnv, dk(301));
  assert.deepEqual(o.giden.filter((x) => x.kime === "Patron").map((x) => x.yazi), ["📌 Fuat 4 saattir cevap vermedi, Hemra da çözemedi: 3394 · repete siparişi."]);
  // mesai dışı (gece, pazar): hiçbir şey gitmez — sabah 09:00'a kalır; cumartesi mesaidir
  const o2 = ortam();
  o2.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: FUAT, ad: "Fuat" }]));
  const cuma1930 = Date.UTC(2026, 10, 13, 16, 30) / 1000;
  try { Date.now = () => cuma1930 * 1000; await kt.kartIzle(o2.samiEnv, "sendPhoto", kart, { ok: true, result: { message_id: 7000 } }); } finally { Date.now = gercek; }
  await kt.kartTakipAdimi(o2.samiEnv, Date.UTC(2026, 10, 13, 20, 0) / 1000, tg); // cuma 23:00
  await kt.kartTakipAdimi(o2.samiEnv, Date.UTC(2026, 10, 14, 5, 55) / 1000, tg); // cumartesi 08:55
  assert.equal(o2.giden.length, 0);
  await kt.kartTakipAdimi(o2.samiEnv, Date.UTC(2026, 10, 14, 6, 35) / 1000, tg); // cumartesi 09:35 → mesai 30 + 35 dk = 1 saat
  assert.deepEqual(o2.giden.map((x) => x.yazi), ["🔔 Hatırlatma: cevap bekleyen kartınız var — 3394 · repete siparişi. En alttaki karta bakın, düğmeye basın."]);
  await kt.kartTakipAdimi(o2.samiEnv, Date.UTC(2026, 10, 15, 9, 0) / 1000, tg); // pazar 12:00 → hiçbir şey
  assert.equal(o2.giden.length, 1);
  await kt.kartTakipAdimi(o2.samiEnv, Date.UTC(2026, 10, 16, 6, 5) / 1000, tg); // pazartesi 09:05 → son hatırlatma (cumartesi 11 saat sayıldı)
  assert.equal(o2.giden.at(-1).yazi, "⏰ Son hatırlatma: 3394 · repete siparişi hâlâ cevap bekliyor.");
  // engelli hesap: Telegram 403 → Patron'a tek satır
  const o3 = ortam();
  o3.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: NURI, ad: "Nuri" }]));
  o3.depo.set("venom:bot:klavye:v1", "1");
  const eskiFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (/sendChatAction|sendMessage/.test(String(u)) && /sami-token/.test(String(u)) && String(JSON.parse(i.body).chat_id) === String(NURI) ? Response.json({ ok: false, description: "Forbidden: bot was blocked by the user" }) : eskiFetch(u, i));
  try {
    Date.now = () => bas * 1000;
    await kt.kartIzle(o3.samiEnv, "sendPhoto", { ...kart, chat_id: NURI }, { ok: true, result: { message_id: 4000 } });
    Date.now = gercek;
    for (const n of [61, 121, 181]) await kt.kartTakipAdimi(o3.samiEnv, dk(n), tg);
    await venom.venomCron(o3.venomEnv, dk(187));
  } finally { globalThis.fetch = eskiFetch; Date.now = gercek; }
  assert.deepEqual(o3.giden.filter((x) => x.kime === "Patron").map((x) => x.yazi), ["⚠️ Kart Nuri hesabına ulaşmıyor: Telegram: Forbidden: bot was blocked by the user (10:00, \"🔁 REPETE · 3394 · beyaz · büyük 20, küçük 20\"). Hemra'ya bildirildi; hesabın düzeltilmesi gerekiyor."]);
});

test("HEMRA'YA TOPLU LİSTE (13 Kasım, kural 4): Hemra'ya tek tek hatırlatma gitmez — açık işlerinin tek listesi (1. ve 2. saatte); 3. saatte Venom Patron'a TEK satır; cevaplanan iş listeden düşer", async () => {
  const o = ortam();
  const kt = await import("./kart-takip.js");
  const venom = await import("./venom-bot.js");
  o.depo.set("venom:bot:klavye:v1", "1");
  const tg = (e, m, g) => globalThis.fetch(`https://api.telegram.org/botsami-token/${m}`, { method: "POST", body: JSON.stringify(g) }).then((r) => r.json());
  const bas = Date.UTC(2026, 10, 11, 7, 0) / 1000; // çarşamba 10:00
  const dk = (n) => bas + n * 60;
  const gercek = Date.now;
  const kartlar = [
    [0, { chat_id: HEMRA, text: "🟦 VOLONTE · 3394\n❌ Fabrikada bitti (Sinem).\nNe yapalım?", reply_markup: { inline_keyboard: [[{ text: "🔁 Repete", callback_data: "fh:r:a" }], [{ text: "⏳ Bitene kadar bekle", callback_data: "fh:w:a" }]] } }, 801],
    [60, { chat_id: HEMRA, text: "🔁 REPETE ÖNERİSİ — VOLONTE · 5074\nDağılımı yazın.", reply_markup: { inline_keyboard: [[{ text: "✅ Patron'a gönder", callback_data: "rk:ho:b" }]] } }, 802],
    [60, { chat_id: HEMRA, text: "📋 Gidecek liste (11.11) — Aziz ✓:\n3627 siyah 10", reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: "fb:o:c" }, { text: "✏️ Düzelt", callback_data: "fb:d:c" }]] } }, 803],
  ];
  try {
    for (const [d, g, mid] of kartlar) { Date.now = () => dk(d) * 1000; await kt.kartIzle(o.samiEnv, "sendMessage", g, { ok: true, result: { message_id: mid } }); }
  } finally { Date.now = gercek; }
  await kt.kartTakipAdimi(o.samiEnv, dk(59), tg);
  assert.equal(o.giden.length, 0);
  // ilk kart 1 saati doldurdu → TEK liste: bütün açık işleri (yeni gelenler dahil)
  await kt.kartTakipAdimi(o.samiEnv, dk(61), tg);
  assert.deepEqual(o.giden.map((x) => [x.kime, x.yazi]), [["Hemra", "📋 Hemra, cevap bekleyen işleriniz (3):\n1) 3394 — fabrikada bitti, karar bekliyor (1 saat)\n2) 5074 — repete dağılımı (yeni)\n3) 3627 — fabrika listesi onayı (yeni)\nKartları yukarıda, sırayla basabilirsiniz."]]);
  await kt.kartTakipAdimi(o.samiEnv, dk(90), tg);
  assert.equal(o.giden.length, 1); // aynı saat içinde ikinci liste yok
  // ilk kart 2 saati, diğerleri 1 saati doldurdu → ikinci liste (Patron onaylı biçim)
  await kt.kartTakipAdimi(o.samiEnv, dk(121), tg);
  assert.equal(o.giden.length, 2);
  assert.equal(o.giden.at(-1).yazi, "📋 Hemra, cevap bekleyen işleriniz (3):\n1) 3394 — fabrikada bitti, karar bekliyor (2 saat)\n2) 5074 — repete dağılımı (1 saat)\n3) 3627 — fabrika listesi onayı (1 saat)\nKartları yukarıda, sırayla basabilirsiniz.");
  await kt.kartTakipAdimi(o.samiEnv, dk(150), tg);
  assert.equal(o.giden.length, 2);
  // bir işe cevap verdi → listeden düşer; 3. saatte: ikinci işin son listesi + ilk iş için Venom Patron'a TEK satır
  await kt.kartBasildi(o.samiEnv, HEMRA, 803);
  await kt.kartTakipAdimi(o.samiEnv, dk(181), tg);
  const hl = () => o.giden.filter((x) => x.kime === "Hemra");
  assert.equal(hl().length, 3);
  assert.ok(hl().at(-1).yazi.startsWith("📋 Hemra, cevap bekleyen işleriniz (2):\n1) 3394 — fabrikada bitti, karar bekliyor (3 saat)\n2) 5074 — repete dağılımı (2 saat)\n"));
  assert.ok(!o.giden.some((x) => /^🔔|^⏰/.test(x.yazi))); // tek tek hatırlatma yok
  await venom.venomCron(o.venomEnv, dk(182));
  assert.deepEqual(o.giden.filter((x) => x.kime === "Patron").map((x) => x.yazi), ["📌 Hemra 3 saattir cevap vermedi: 1 iş bekliyor (3394 · fabrikada bitti, karar bekliyor)."]);
  await kt.kartTakipAdimi(o.samiEnv, dk(241), tg);
  await venom.venomCron(o.venomEnv, dk(242));
  assert.equal(o.giden.filter((x) => x.kime === "Patron").at(-1).yazi, "📌 Hemra 3 saattir cevap vermedi: 1 iş bekliyor (5074 · repete dağılımı).");
  assert.equal(o.giden.filter((x) => x.kime === "Patron").length, 2);
});

test("TEKRAR SORU YASAĞI (13 Kasım, kural 39): aynı kişiye AYNI kart (aynı yazı + aynı düğmeler) açıkken ikinci kez GÖNDERİLMEZ — açık kart geçerli sayılır; farklı kişi / farklı model / cevaplanmış kart engellenmez (5 farklı durum)", async () => {
  const o = ortam();
  const kt = await import("./kart-takip.js");
  const kart = (chat, yazi, cb = "fc:g:1") => ({ chat_id: chat, text: yazi, reply_markup: { inline_keyboard: [[{ text: "✅ Gelecek", callback_data: cb }]] } });
  await kt.kartIzle(o.samiEnv, "sendMessage", kart(FUAT, "5068 · Büyük (44-50) · siyah 12"), { ok: true, result: { message_id: 100 } });
  // 1) birebir aynı kart → açık olanın mesaj numarası (yenisi gönderilmez)
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(FUAT, "5068 · Büyük (44-50) · siyah 12")), 100);
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendPhoto", { ...kart(FUAT, ""), caption: "5068 · Büyük (44-50) · siyah 12" }), 100); // fotoğraflı gönderilse de aynı kart
  // 2) aynı model, başka beden (yazı farklı) → ayrı karttır
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(FUAT, "5068 · Küçük (38-44) · siyah 8")), null);
  // 3) başka kişi → engel yok
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(NURI, "5068 · Büyük (44-50) · siyah 12")), null);
  // 4) aynı yazı, başka kayıt (düğme verisi farklı) → ayrı karttır
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(FUAT, "5068 · Büyük (44-50) · siyah 12", "fc:g:2")), null);
  // 5) Patron'un kartı ve düğmesiz mesaj kapsam dışı; kart cevaplanınca aynı kart yeniden açılabilir
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(PATRON, "5068 · Büyük (44-50) · siyah 12")), null);
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", { chat_id: FUAT, text: "5068 · Büyük (44-50) · siyah 12" }), null);
  await kt.kartBasildi(o.samiEnv, FUAT, 100);
  assert.equal(await kt.acikAyniKart(o.samiEnv, "sendMessage", kart(FUAT, "5068 · Büyük (44-50) · siyah 12")), null);
});
