// Çalıştırma: node --test telegram-bot/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { fiyatBul, kodBul, guncellemeIsle, haftaOzeti, gunAnahtari, webhookKontrol, adaylar, rotasyon, kanaldaPaylas, KALICI, modelMesajlari } from "./worker.js";

function sahteOrtam() {
  const depo = new Map();
  const gonderilen = [];
  globalThis.fetch = async (url, istek) => {
    gonderilen.push({ url, govde: JSON.parse(istek.body) });
    return new Response(JSON.stringify({ ok: true }));
  };
  const env = {
    BOT_TOKEN: "test-token",
    WEBHOOK_SECRET: "gizli123",
    ALLOWED_IDS: "111, 222",
    KAYIT: {
      async get(k, tur) {
        const v = depo.get(k);
        if (v == null) return null;
        return tur === "json" ? JSON.parse(v) : v;
      },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
      async list({ prefix }) { return { keys: [...depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }; },
    },
  };
  return { env, depo, gonderilen };
}

const kanal = { id: -100, type: "channel", username: "Volonteroseoffical" };
const ozel = (id) => ({ id, type: "private" });

test("fiyat bulma", () => {
  assert.equal(fiyatBul("Robe longue $25"), 25);
  assert.equal(fiyatBul("Prix: 18.5"), 18.5);
  assert.equal(fiyatBul("Model 3394 — 22$ 🔥"), 22);
  assert.equal(fiyatBul("30 USD"), 30);
  assert.equal(fiyatBul("Цена 40"), 40);
  assert.equal(fiyatBul("Model 3394 yeni geldi"), null);
  assert.equal(fiyatBul(""), null);
});

test("İstanbul saatine göre gün", () => {
  // 2026-10-19 22:30 UTC = 20 Ekim 01:30 İstanbul
  assert.equal(gunAnahtari(Date.UTC(2026, 9, 19, 22, 30) / 1000), "2026-10-20");
});

test("kanal paylaşımı ve albüm kaydı", async () => {
  const { env, depo } = sahteOrtam();
  const t = Date.UTC(2026, 9, 20, 9) / 1000;
  const foto = [{ file_id: "kucuk" }, { file_id: "buyuk" }];
  await guncellemeIsle({ channel_post: { message_id: 10, date: t, chat: kanal, photo: foto, caption: "Robe $25", media_group_id: "A" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 11, date: t, chat: kanal, photo: foto, media_group_id: "A" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 12, date: t, chat: kanal, text: "Yeni sezon" } }, env);

  assert.deepEqual(JSON.parse(depo.get("kanal")), { id: -100, kullanici: "Volonteroseoffical" });

  const ozet = JSON.parse(depo.get("ozet"));
  assert.equal(ozet.toplam, 2);
  assert.deepEqual(ozet.sonlar[1].ids, [10, 11]);
  assert.equal(ozet.sonlar[1].medya, 2);
  assert.equal(depo.get("gun:2026-10-20"), "2");

  // Düzenleme yeni paylaşım sayılmaz, fiyatı günceller
  await guncellemeIsle({ edited_channel_post: { message_id: 12, date: t, edit_date: t + 60, chat: kanal, text: "Yeni sezon 30$" } }, env);
  const ozet2 = JSON.parse(depo.get("ozet"));
  assert.equal(ozet2.toplam, 2);
  assert.equal(ozet2.sonlar[0].fiyat, 30);
});

test("izinsiz kişiye cevap yok, kimliği not edilir", async () => {
  const { env, depo, gonderilen } = sahteOrtam();
  await guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(999), from: { id: 999, first_name: "Yabancı" }, text: "/start" } }, env);
  assert.equal(gonderilen.length, 0);
  assert.equal(JSON.parse(depo.get("bekleyen:999")).ad, "Yabancı");
});

test("izinli kişi /son ve /hafta alır", async () => {
  const { env, gonderilen } = sahteOrtam();
  const t = Math.floor(Date.now() / 1000);
  await guncellemeIsle({ channel_post: { message_id: 5, date: t, chat: kanal, text: "Abaya $40" } }, env);
  await guncellemeIsle({ message: { message_id: 2, date: t, chat: ozel(222), from: { id: 222 }, text: "/son" } }, env);
  assert.match(gonderilen[0].govde.text, /fiyat: 40 \$/);
  assert.match(gonderilen[0].govde.text, /t\.me\/Volonteroseoffical\/5/);
  await guncellemeIsle({ message: { message_id: 3, date: t, chat: ozel(222), from: { id: 222 }, text: "/hafta" } }, env);
  assert.match(gonderilen[1].govde.text, /Son 7 gün: 1 paylaşım/);
});

test("hafta özeti boşken sıfır", async () => {
  const { env } = sahteOrtam();
  assert.match(await haftaOzeti(env), /Son 7 gün: 0 paylaşım/);
});

test("webhook gizli anahtar olmadan reddedilir", async () => {
  const { env } = sahteOrtam();
  const istek = (anahtar) => new Request("https://x.dev/telegram", {
    method: "POST",
    headers: anahtar ? { "X-Telegram-Bot-Api-Secret-Token": anahtar } : {},
    body: JSON.stringify({ update_id: 1 }),
  });
  assert.equal((await worker.fetch(istek(null), env)).status, 401);
  assert.equal((await worker.fetch(istek("yanlis!!"), env)).status, 401);
  assert.equal((await worker.fetch(istek("gizli123"), env)).status, 200);
});

test("zamanlanmış görev webhook'u kendi adresine kurar", async () => {
  const { env, gonderilen } = sahteOrtam();
  env.SELF_URL = "https://bot.example.dev";
  globalThis.fetch = async (url, istek) => {
    gonderilen.push({ url, govde: JSON.parse(istek.body) });
    const kurulu = url.endsWith("getWebhookInfo") ? { ok: true, result: { url: "https://bot.example.dev/telegram", max_connections: 40, allowed_updates: ["message"] } } : { ok: true };
    return new Response(JSON.stringify(kurulu));
  };
  assert.equal(await webhookKontrol(env), "kuruldu");
  assert.equal(gonderilen[1].govde.url, "https://bot.example.dev/telegram");
  assert.equal(gonderilen[1].govde.secret_token, "gizli123");
  assert.equal(gonderilen[1].govde.max_connections, 1);
  assert.ok(gonderilen[1].govde.allowed_updates.includes("callback_query"));
  delete env.BOT_TOKEN;
  assert.equal(await webhookKontrol(env), "token-yok");
});

test("kod bulma", () => {
  assert.equal(kodBul("✅ AVAILABLE NOW\n✅CODE.3329\n✅PRICE. $"), "3329");
  assert.equal(kodBul("Code: 5120-a"), "5120-A");
  assert.equal(kodBul("Model 3394 new"), "3394");
  assert.equal(kodBul("New #4410"), "4410");
  assert.equal(kodBul("Yeni sezon geldi"), null);
  assert.equal(kodBul("THIS MODEL IS AVAILABLE. CODE 5501"), "5501");
  assert.equal(kodBul("THIS MODEL IS BACK"), null);
});

// Telegram'ı taklit eder: copyMessages yeni kimlikler döner.
function telegramTaklit(gonderilen, hata) {
  globalThis.fetch = async (url, istek) => {
    const govde = JSON.parse(istek.body);
    gonderilen.push({ url, govde });
    if (hata && url.endsWith("copyMessages") && govde.chat_id === -100) return new Response(JSON.stringify({ ok: false, description: hata }));
    if (url.endsWith("copyMessages")) return new Response(JSON.stringify({ ok: true, result: govde.message_ids.map((_, i) => ({ message_id: 900 + i })) }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
}

async function albumKur(env) {
  const t = Date.UTC(2026, 9, 20, 9) / 1000;
  const v = { file_id: "v" };
  // Yazı albümün ikinci parçasında; ilk parça önce gelir, sonra üçüncü parça.
  await guncellemeIsle({ channel_post: { message_id: 20, date: t, chat: kanal, video: v, media_group_id: "G" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 21, date: t, chat: kanal, video: v, caption: "✅CODE.3329\n✅PRICE. 25$", media_group_id: "G" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 22, date: t, chat: kanal, video: v, media_group_id: "G" } }, env);
}

test("kod dizini albümün tüm parçalarını tutar", async () => {
  const { env, depo } = sahteOrtam();
  await albumKur(env);
  const kodlar = JSON.parse(depo.get("kodlar"));
  assert.deepEqual(kodlar["3329"][0].ids, [20, 21, 22]);
});

test("/paylas önizler, onaysız kanala hiçbir şey gitmez, onayla paylaşır", async () => {
  const { env, gonderilen } = sahteOrtam();
  await albumKur(env);
  telegramTaklit(gonderilen);
  gonderilen.length = 0;

  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(222), from: { id: 222 }, text: "/paylas 3329" } }, env);
  const kopyalar = gonderilen.filter((g) => g.url.endsWith("copyMessages"));
  assert.equal(kopyalar.length, 1);
  assert.equal(kopyalar[0].govde.chat_id, 222); // önizleme sadece kullanıcıya
  assert.deepEqual(kopyalar[0].govde.message_ids, [20, 21, 22]);
  const dugmeler = gonderilen.at(-1).govde.reply_markup.inline_keyboard[0];
  const ok = dugmeler[0].callback_data;

  // İzinsiz biri basarsa paylaşılmaz
  gonderilen.length = 0;
  await guncellemeIsle({ callback_query: { id: "x", from: { id: 999 }, data: ok, message: { chat: { id: 999 }, message_id: 1 } } }, env);
  assert.equal(gonderilen.filter((g) => g.url.endsWith("copyMessages")).length, 0);

  // Sahibi onaylar → kanala kopyalanır
  await guncellemeIsle({ callback_query: { id: "y", from: { id: 222 }, data: ok, message: { chat: { id: 222 }, message_id: 7 } } }, env);
  const kanalaKopya = gonderilen.filter((g) => g.url.endsWith("copyMessages"));
  assert.equal(kanalaKopya.length, 1);
  assert.equal(kanalaKopya[0].govde.chat_id, -100);
  assert.equal(kanalaKopya[0].govde.from_chat_id, -100);
  assert.match(gonderilen.at(-1).govde.text, /yeniden paylaşıldı[\s\S]*t\.me\/Volonteroseoffical\/900/);

  // İkinci basış tekrar paylaşmaz
  gonderilen.length = 0;
  await guncellemeIsle({ callback_query: { id: "z", from: { id: 222 }, data: ok, message: { chat: { id: 222 }, message_id: 7 } } }, env);
  assert.equal(gonderilen.filter((g) => g.url.endsWith("copyMessages")).length, 0);
});

test("İptal kanala paylaşmaz", async () => {
  const { env, gonderilen } = sahteOrtam();
  await albumKur(env);
  telegramTaklit(gonderilen);
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(222), from: { id: 222 }, text: "/paylas 3329" } }, env);
  const iptal = gonderilen.at(-1).govde.reply_markup.inline_keyboard[0][1].callback_data;
  gonderilen.length = 0;
  await guncellemeIsle({ callback_query: { id: "y", from: { id: 222 }, data: iptal, message: { chat: { id: 222 }, message_id: 7 } } }, env);
  assert.equal(gonderilen.filter((g) => g.url.endsWith("copyMessages")).length, 0);
  assert.match(gonderilen.at(-1).govde.text, /iptal edildi/);
});

test("yetki yoksa anlaşılır uyarı", async () => {
  const { env, gonderilen } = sahteOrtam();
  await albumKur(env);
  telegramTaklit(gonderilen, "Bad Request: need administrator rights in the channel chat");
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(222), from: { id: 222 }, text: "/paylas 3329" } }, env);
  const ok = gonderilen.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data;
  await guncellemeIsle({ callback_query: { id: "y", from: { id: 222 }, data: ok, message: { chat: { id: 222 }, message_id: 7 } } }, env);
  assert.match(gonderilen.at(-1).govde.text, /Mesaj gönderme/);
});

test("bilinmeyen kod", async () => {
  const { env, gonderilen } = sahteOrtam();
  await albumKur(env);
  telegramTaklit(gonderilen);
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(222), from: { id: 222 }, text: "/paylas 9999" } }, env);
  assert.match(gonderilen.at(-1).govde.text, /9999 kodlu kayıtlı paylaşım bulamadım/);
});

test("eski paylaşımları içe aktarma: albüm gruplama ve kod", async () => {
  const { gruplaVeDizinle } = await import("./ice-aktar.mjs");
  const kodlar = gruplaVeDizinle([
    { id: "100", type: "message", date_unixtime: "1000", photo: "(dosya yok)", text: "" },
    { id: 101, type: "message", date_unixtime: "1000", photo: "(dosya yok)", text: ["✅", { type: "bold", text: "CODE.3329" }] },
    { id: 102, type: "message", date_unixtime: "1000", media_type: "video_file", text: "" },
    { id: 103, type: "message", date_unixtime: "2000", photo: "(dosya yok)", text: "CODE 3329 new color" },
    { id: 104, type: "message", date_unixtime: "3000", text: "Sadece yazı CODE.777" },
    { id: 105, type: "service", date_unixtime: "3000" },
  ]);
  assert.deepEqual(kodlar["3329"].map((g) => g.ids), [[103], [100, 101, 102]]);
  assert.equal(kodlar["777"], undefined); // medyasız yazı paylaşılmaz
});

test("eski albümün tek parçası düzenlenince parçalar kaybolmaz", async () => {
  const { env, depo } = sahteOrtam();
  depo.set("kodlar", JSON.stringify({ "3563": [{ ids: [13666, 13667, 13668], tarih: 1000, album: null }] }));
  await guncellemeIsle({ edited_channel_post: { message_id: 13666, date: 1000, edit_date: 2000, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3563 PRICE 20$", media_group_id: "X" } }, env);
  const k = JSON.parse(depo.get("kodlar"))["3563"];
  assert.equal(k.length, 1);
  assert.deepEqual(k[0].ids, [13666, 13667, 13668]);
  assert.equal(k[0].album, "X");
});

// ---------- Günlük yeniden paylaşım ----------

const GUN = 86400;
// İstanbul saatiyle 21 Ekim 2026 hh:mm
const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 21 + gunEk, hh - 3, mm) / 1000;

function rotasyonOrtami() {
  const o = sahteOrtam();
  o.env.ALLOWED_IDS = "111,222";
  const simdi = ist(9, 0);
  o.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "Volonteroseoffical" }));
  o.depo.set("kodlar", JSON.stringify({
    "3329": [{ ids: [500, 501], tarih: simdi - 5 * GUN }],          // yeni: önerilmez
    "3100": [{ ids: [300, 301, 302], tarih: simdi - 90 * GUN }],    // en eski kodlu
    "3200": [{ ids: [400], tarih: simdi - 40 * GUN }],
    "2900": [{ ids: [100], tarih: simdi - 400 * GUN }],             // 1 yıldan eski: önerilmez
  }));
  o.depo.set("kodsuz", JSON.stringify({ "~200": { ids: [200, 201], tarih: simdi - 120 * GUN, album: null } }));
  let sonraki = 1000;
  globalThis.fetch = async (url, istek) => {
    const govde = JSON.parse(istek.body);
    o.gonderilen.push({ url, govde });
    if (url.endsWith("copyMessages")) return new Response(JSON.stringify({ ok: true, result: govde.message_ids.map(() => ({ message_id: sonraki++ })) }));
    if (url.endsWith("copyMessage") || url.endsWith("sendMessage")) return new Response(JSON.stringify({ ok: true, result: { message_id: sonraki++ } }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  return { ...o, simdi };
}
const cagrilar = (g, metod) => g.filter((x) => x.url.endsWith("/" + metod));
const bas = (env, kisi, data, mid = 1) => guncellemeIsle({ callback_query: { id: "c", from: { id: kisi, first_name: kisi === 222 ? "Merdan" : "Murat" }, data, message: { chat: { id: kisi }, message_id: mid } } }, env);

test("adaylar: en eski önce, 30 gün–1 yıl arası, kodsuz dahil, atlanan ve sıradaki hariç", () => {
  const simdi = ist(9);
  const kodlar = { A: [{ ids: [1], tarih: simdi - 40 * GUN }], B: [{ ids: [2], tarih: simdi - 10 * GUN }], C: [{ ids: [3], tarih: simdi - 400 * GUN }], D: [{ ids: [4], tarih: simdi - 50 * GUN }], E: [{ ids: [5], tarih: simdi - 60 * GUN }] };
  const kodsuz = { "~9": { ids: [9], tarih: simdi - 100 * GUN } };
  const l = adaylar(kodlar, kodsuz, { D: simdi + GUN }, ["E"], simdi);
  assert.deepEqual(l.map((a) => a.kod), ["~9", "A"]);
});

// ---------- Tur sistemi ----------

// n kodlu model: 4000 en yeni (40 gün), 4000+n-1 en eski
function turOrtami(n = 14) {
  const o = rotasyonOrtami();
  const kodlar = {};
  for (let i = 0; i < n; i++) kodlar[String(4000 + i)] = [{ ids: [5000 + i * 10, 5001 + i * 10], tarih: o.simdi - (40 + i) * GUN }];
  o.depo.set("kodlar", JSON.stringify(kodlar));
  o.depo.set("kodsuz", "{}");
  return o;
}
const turMesajlari = (g, kisi = "111") => cagrilar(g, "copyMessage").filter((k) => String(k.govde.chat_id) === kisi);
const turDugme = (g, kod, i) => turMesajlari(g).find((k) => k.govde.caption.startsWith(kod + " ")).govde.reply_markup.inline_keyboard[0][i].callback_data;
const tur = (depo) => JSON.parse(depo.get("tur"));

test("tur 09:00'dan önce başlamaz; 09:00'da en eski 10 model 3 düğmeyle ikisine gider", async () => {
  const o = turOrtami();
  await rotasyon(o.env, ist(8, 55));
  assert.equal(o.gonderilen.length, 0);
  await rotasyon(o.env, o.simdi);
  const m = turMesajlari(o.gonderilen);
  assert.equal(m.length, 10);
  assert.equal(turMesajlari(o.gonderilen, "222").length, 10);
  assert.deepEqual(m.map((k) => k.govde.caption.split(" ")[0]), ["4013", "4012", "4011", "4010", "4009", "4008", "4007", "4006", "4005", "4004"]);
  assert.deepEqual(m[0].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Onaylıyorum", "⏳ Beklesin", "🗑️ Sil"]);
  assert.match(m[0].govde.caption, /4013 · son paylaşım \d\d\.\d\d\.2026 \(53 gün önce\)/);
  assert.equal(tur(o.depo).no, 1);
  o.gonderilen.length = 0;
  await rotasyon(o.env, o.simdi + 300);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0); // onay yokken paylaşım yok
});

test("onay ikisinde de görünür; ikinci basış ve izinsiz kişi işlemez", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  const onay = turDugme(o.gonderilen, "4013", 0);
  await bas(o.env, 999, onay);
  assert.equal(tur(o.depo).onaylar.length, 0);
  o.gonderilen.length = 0;
  await bas(o.env, 222, onay);
  const d = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(d.length, 2);
  assert.match(d[0].govde.caption, /Merdan onayladı \(1\/10\)/);
  o.gonderilen.length = 0;
  await bas(o.env, 111, onay);
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /Merdan zaten işaretledi/);
  assert.deepEqual(tur(o.depo).onaylar, ["4013"]);
});

test("Beklesin: 7 gün sonra sorulur, yerine hemen sıradaki model gelir", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  const beklesin = turDugme(o.gonderilen, "4013", 1);
  o.gonderilen.length = 0;
  await bas(o.env, 111, beklesin);
  const su = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(JSON.parse(o.depo.get("atlananlar"))["4013"] - (su + 7 * GUN)) < 60);
  const yeni = cagrilar(o.gonderilen, "copyMessage");
  assert.equal(yeni.length, 2); // ikisine de
  assert.match(yeni[0].govde.caption, /^4003 /); // sıradaki en eski
  assert.match(cagrilar(o.gonderilen, "editMessageCaption")[0].govde.caption, /Murat: beklesin/);
});

function silmeTaklidi(o, silinemeyen = []) {
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/deleteMessage")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url, govde });
      return new Response(JSON.stringify(silinemeyen.includes(govde.message_id) ? { ok: false, description: "Bad Request: message can't be deleted" } : { ok: true, result: true }));
    }
    return eski(url, istek);
  };
}

test("Sil: Emin misiniz → Vazgeç hiçbir şey silmez → Evet tüm paylaşımları siler, yenisi gelir", async () => {
  const o = turOrtami();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["4013"].push({ ids: [150, 151, 152], tarih: o.simdi - 200 * GUN });
  o.depo.set("kodlar", JSON.stringify(kodlar));
  silmeTaklidi(o);
  await rotasyon(o.env, o.simdi);
  const sil = turDugme(o.gonderilen, "4013", 2);
  o.gonderilen.length = 0;

  await bas(o.env, 111, sil);
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  const soru = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(soru.length, 1); // sadece basanın ekranı
  assert.match(soru[0].govde.caption, /Emin misiniz/);
  const [evet, vazgec] = soru[0].govde.reply_markup.inline_keyboard[0].map((d) => d.callback_data);

  o.gonderilen.length = 0;
  await bas(o.env, 111, vazgec);
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption")[0].govde.reply_markup.inline_keyboard[0].length, 3);

  o.gonderilen.length = 0;
  await bas(o.env, 111, evet);
  assert.deepEqual(cagrilar(o.gonderilen, "deleteMessage").map((d) => d.govde.message_id), [150, 151, 152, 5130, 5131]);
  assert.equal(JSON.parse(o.depo.get("atlananlar"))["4013"], KALICI);
  assert.equal(JSON.parse(o.depo.get("hicgelmeyecek"))["4013"].tarihler.length, 2);
  assert.equal(JSON.parse(o.depo.get("kodlar"))["4013"].length, 2); // tarihler kayıtta kalır
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption").length, 2);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /5 mesaj kanaldan silindi/);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 2); // yerine yenisi
  await guncellemeIsle({ message: { message_id: 9, date: 1, chat: ozel(111), from: { id: 111 }, text: "/paylas 4013" } }, o.env);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /silindi olarak işaretli/);
});

test("silinemeyen eski mesajlar linkleriyle bildirilir", async () => {
  const o = turOrtami();
  silmeTaklidi(o, [5130]);
  await rotasyon(o.env, o.simdi);
  await bas(o.env, 111, "ty:1:4013");
  const ozet = cagrilar(o.gonderilen, "sendMessage").find((m) => /kanaldan silindi/.test(m.govde.text)).govde.text;
  assert.match(ozet, /1 mesaj kanaldan silindi/);
  assert.match(ozet, /1 mesaj silinemedi/);
  assert.match(ozet, /t\.me\/Volonteroseoffical\/5130/);
});

test("çok mesajlı silme 5 dakikalık görevle parça parça biter (gece de)", async () => {
  const o = turOrtami();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["4013"] = Array.from({ length: 9 }, (_, i) => ({ ids: Array.from({ length: 5 }, (_, j) => 1000 + i * 10 + j), tarih: o.simdi - (90 + i) * GUN }));
  o.depo.set("kodlar", JSON.stringify(kodlar));
  silmeTaklidi(o);
  await rotasyon(o.env, o.simdi);
  o.gonderilen.length = 0;
  await bas(o.env, 111, "ty:1:4013");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 20);
  await rotasyon(o.env, ist(23));
  await rotasyon(o.env, ist(23, 5));
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 45);
  assert.equal(o.depo.get("silinecek:4013"), undefined);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /45 mesaj kanaldan silindi/);
});

test("10 onay tamamlanmadan paylaşım başlamaz; 10. onayla 1,5–2 saat arayla başlar", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  const kodlar10 = turMesajlari(o.gonderilen).map((k) => k.govde.caption.split(" ")[0]);
  for (const kod of kodlar10.slice(0, 9)) await bas(o.env, 111, `t1:1:${kod}`);
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(10));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.equal(tur(o.depo).durum, "toplaniyor");

  await bas(o.env, 222, `t1:1:${kodlar10[9]}`);
  assert.equal(tur(o.depo).durum, "paylasiliyor");
  assert.ok(cagrilar(o.gonderilen, "sendMessage").some((m) => /10 onay tamam/.test(m.govde.text)));
  assert.equal([...o.depo.keys()].filter((k) => k.startsWith("kuyruk:")).length, 10);

  o.gonderilen.length = 0;
  const t = ist(10, 5);
  await rotasyon(o.env, t);
  const ilk = cagrilar(o.gonderilen, "copyMessages");
  assert.equal(ilk.length, 1);
  assert.deepEqual(ilk[0].govde.message_ids, [5130, 5131]); // ilk onaylanan, albümün tamamı
  const ara = Number(o.depo.get("sonraki")) - t;
  assert.ok(ara >= 90 * 60 && ara <= 120 * 60, `aralık ${ara / 60} dk`);
  o.gonderilen.length = 0;
  await rotasyon(o.env, t + 80 * 60);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
});

test("gün biterse tur ertesi gün devam eder: yeni liste yok, bir kez hatırlatma", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  for (const kod of ["4013", "4012", "4011"]) await bas(o.env, 111, `t1:1:${kod}`);
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(9, 0, 1));
  await rotasyon(o.env, ist(9, 5, 1));
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0);
  const h = cagrilar(o.gonderilen, "sendMessage").map((m) => m.govde.text);
  assert.equal(h.length, 2); // bir kez, ikisine
  assert.match(h[0], /1\. turda 3\/10 onay var; 7 model cevap bekliyor/);
  assert.equal(tur(o.depo).no, 1);
});

test("tur bitince ertesi sabah yeni tur başlar; tur öncesi sıradakiler 60–90 dk arayla", async () => {
  const o = turOrtami(3);
  o.depo.set("tur", JSON.stringify({ no: 1, durum: "paylasiliyor", basla: o.simdi - GUN, onaylar: ["4000"], ogeler: {} }));
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  o.depo.set("kuyruk:3999", JSON.stringify({ kod: "3999", ids: [7000], kim: "Murat", zaman: 0 })); // tur öncesinden
  const t = ist(12);
  await rotasyon(o.env, t);
  const ara = Number(o.depo.get("sonraki")) - t;
  assert.ok(ara >= 60 * 60 && ara <= 90 * 60); // eski düzen
  await rotasyon(o.env, t + 3 * 3600);
  assert.equal(tur(o.depo).durum, "paylasiliyor");
  await rotasyon(o.env, t + 3 * 3600 + 300);
  assert.equal(tur(o.depo).durum, "bitti");
  assert.ok(cagrilar(o.gonderilen, "sendMessage").some((m) => /1\. tur bitti/.test(m.govde.text)));
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(20));
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0); // aynı gün yeni tur yok
  await rotasyon(o.env, ist(9, 0, 1));
  assert.equal(tur(o.depo).no, 2);
  assert.ok(cagrilar(o.gonderilen, "copyMessage").length > 0);
});

test("önerecek model kalmazsa onaylananlarla paylaşıma geçer", async () => {
  const o = turOrtami(3);
  await rotasyon(o.env, o.simdi);
  assert.equal(turMesajlari(o.gonderilen).length, 3);
  await bas(o.env, 111, "t1:1:4002");
  await bas(o.env, 111, "t1:1:4001");
  await bas(o.env, 111, "t7:1:4000");
  assert.equal(tur(o.depo).durum, "paylasiliyor");
  assert.ok(cagrilar(o.gonderilen, "sendMessage").some((m) => /onaylanan 2 modelle paylaşıma geçiyorum/.test(m.govde.text)));
});

test("kanalda bulunamayan model atlanır, yerine sıradaki gelir", async () => {
  const o = turOrtami();
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const govde = JSON.parse(istek.body);
    if (String(url).endsWith("/copyMessage") && govde.message_id === 5130) return new Response(JSON.stringify({ ok: false, description: "Bad Request: message to copy not found" }));
    return eski(url, istek);
  };
  await rotasyon(o.env, o.simdi);
  assert.ok(JSON.parse(o.depo.get("atlananlar"))["4013"] > o.simdi + 300 * GUN);
  assert.equal(Object.keys(tur(o.depo).ogeler).length, 10);
  assert.ok(!tur(o.depo).ogeler["4013"]);
});

test("21:00'dan sonra ve günlük 10 sınırında paylaşım yok", async () => {
  const o = turOrtami();
  o.depo.set("tur", JSON.stringify({ no: 1, durum: "paylasiliyor", basla: o.simdi, onaylar: [], ogeler: {} }));
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  await rotasyon(o.env, ist(21, 5));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  o.depo.set(`sayac:${gunAnahtari(o.simdi)}`, "10");
  await rotasyon(o.env, ist(15));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.ok(o.depo.get("kuyruk:4000"));
});

test("/kuyruk saatleri ve iptal düğmesini gösterir; iptal kanala dokunmaz", async () => {
  const o = turOrtami();
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  o.depo.set("kuyruk:~200", JSON.stringify({ kod: "~200", ids: [200], tarih: ist(9) - 120 * GUN, kim: "Merdan", zaman: 2, tur: 1 }));
  await guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(111), from: { id: 111 }, text: "/kuyruk" } }, o.env);
  const m = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.match(m.text, /1\) 4000 — tahmini/);
  assert.match(m.text, /2\) Kodsuz paylaşım \(\d\d\.\d\d\.2026 tarihli\)/);
  o.gonderilen.length = 0;
  await bas(o.env, 222, m.reply_markup.inline_keyboard[1][0].callback_data);
  assert.equal(o.depo.get("kuyruk:~200"), undefined);
  assert.ok(o.depo.get("kuyruk:4000"));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length + cagrilar(o.gonderilen, "deleteMessage").length, 0);
});

test("eski liste düğmeleri artık işlem yapmaz", async () => {
  const o = turOrtami();
  await bas(o.env, 111, "r1:2026-10-21:4000");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /eski liste/);
  assert.equal([...o.depo.keys()].filter((k) => k.startsWith("kuyruk:")).length, 0);
});

test("elle /paylas günlük sınıra dahil", async () => {
  const { env, gonderilen, depo } = rotasyonOrtami();
  const bugun = gunAnahtari(Math.floor(Date.now() / 1000));
  depo.set(`sayac:${bugun}`, "10");
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(111), from: { id: 111 }, text: "/paylas 3329" } }, env);
  const ok = cagrilar(gonderilen, "sendMessage").at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data;
  gonderilen.length = 0;
  await bas(env, 111, ok);
  assert.equal(cagrilar(gonderilen, "copyMessages").length, 0);
  assert.match(cagrilar(gonderilen, "editMessageText")[0].govde.text, /sınırı doldu/);
});

test("kanala yeni kodsuz DISPONIBLE albümü kodsuz dizinine girer", async () => {
  const { env, depo } = sahteOrtam();
  const t = ist(10);
  const v = { file_id: "v" };
  await guncellemeIsle({ channel_post: { message_id: 30, date: t, chat: kanal, video: v, caption: "AVAILABLE NOW DISPONIBLE 38-40-42", media_group_id: "K" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 31, date: t, chat: kanal, video: v, media_group_id: "K" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 32, date: t, chat: kanal, text: "THANKS ❤️" } }, env);
  assert.deepEqual(JSON.parse(depo.get("kodsuz")), { "~30": { ids: [30, 31], tarih: t, album: "K" } });
});

test("içe aktarma: kodsuz dizin son 1 yıl, AVAILABLE AGAIN / DISPONIBLE", async () => {
  const { kodsuzDizin } = await import("./ice-aktar.mjs");
  const simdi = 2_000_000_000;
  const k = kodsuzDizin([
    { id: "1", type: "message", date_unixtime: String(simdi - 10 * GUN), photo: "x", text: "AVAILABLE NOW DISPONIBLE" },
    { id: "2", type: "message", date_unixtime: String(simdi - 10 * GUN), photo: "x", text: "" },
    { id: "3", type: "message", date_unixtime: String(simdi - 20 * GUN), photo: "x", text: "AVAILABLE AGAIN" },
    { id: "4", type: "message", date_unixtime: String(simdi - 30 * GUN), photo: "x", text: "CODE.3329 DISPONIBLE" },
    { id: "5", type: "message", date_unixtime: String(simdi - 400 * GUN), photo: "x", text: "DISPONIBLE" },
    { id: "6", type: "message", date_unixtime: String(simdi - 5 * GUN), text: "DISPONIBLE" },
    { id: "7", type: "message", date_unixtime: String(simdi - 4 * GUN), photo: "x", text: "THANKS" },
  ], simdi);
  assert.deepEqual(Object.keys(k), ["~1", "~3"]);
  assert.deepEqual(k["~1"].ids, [1, 2]);
});

test("botun yeniden paylaşımı: kanala düşen kopya bir kez sayılır, kodsuz kopya yeni kayıt açmaz, Sil kopyaları da siler", async () => {
  const o = rotasyonOrtami();
  // Telegram kanala kopyalarken kimlik 0 dönebiliyor
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/copyMessages")) { o.gonderilen.push({ url, govde: JSON.parse(istek.body) }); return new Response(JSON.stringify({ ok: true, result: [{ message_id: 0 }, { message_id: 0 }] })); }
    return eski(url, istek);
  };
  const t = o.simdi;
  const sonuc = await kanaldaPaylas(o.env, "~200", [200, 201], t);
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.link, null); // 0 kimlikle bozuk link verilmez
  assert.equal(JSON.parse(o.depo.get("sonpaylasim"))["~200"], t);
  assert.equal(o.depo.get(`gun:${gunAnahtari(t)}`), undefined); // henüz kanala düşmedi
  // kopyalar kanala düşer (DISPONIBLE yazısıyla)
  await guncellemeIsle({ channel_post: { message_id: 900, date: t + 2, chat: kanal, photo: [{ file_id: "f" }], caption: "AVAILABLE NOW DISPONIBLE", media_group_id: "Z" } }, o.env);
  await guncellemeIsle({ channel_post: { message_id: 901, date: t + 2, chat: kanal, photo: [{ file_id: "f" }], media_group_id: "Z" } }, o.env);
  // sonra insanın kendi paylaşımı: normal kayıt
  await guncellemeIsle({ channel_post: { message_id: 902, date: t + 60, chat: kanal, photo: [{ file_id: "f" }], caption: "DISPONIBLE 38-40" } }, o.env);
  const kodsuz = JSON.parse(o.depo.get("kodsuz"));
  assert.deepEqual(kodsuz["~200"].kopyalar, [900, 901]);
  assert.deepEqual(kodsuz["~200"].ids, [200, 201]); // asıl kayıt yerinde
  assert.ok(!kodsuz["~900"]);
  assert.ok(kodsuz["~902"]);
  assert.equal(o.depo.get(`gun:${gunAnahtari(t)}`), "2"); // kopya albümü 1 + insan 1
  assert.equal(o.depo.get(`sayac:${gunAnahtari(t)}`), "1");
  assert.deepEqual(modelMesajlari("~200", {}, kodsuz), [200, 201, 900, 901]);
  // yeniden paylaşılan model 30 gün aday olmaz
  assert.ok(!adaylar({}, kodsuz, {}, [], t + 5 * GUN, JSON.parse(o.depo.get("sonpaylasim"))).some((a) => a.kod === "~200"));
});

test("kodlu modelin kopyası gerçek kimlikleriyle dizine girer, 0 kimlik kaydedilmez", async () => {
  const o = rotasyonOrtami();
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => String(url).endsWith("/copyMessages")
    ? new Response(JSON.stringify({ ok: true, result: [{ message_id: 0 }] }))
    : eski(url, istek);
  await kanaldaPaylas(o.env, "3100", [300], o.simdi);
  await guncellemeIsle({ channel_post: { message_id: 950, date: o.simdi + 1, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3100" } }, o.env);
  const k = JSON.parse(o.depo.get("kodlar"))["3100"];
  assert.deepEqual(k.map((g) => g.ids), [[950], [300, 301, 302]]);
  assert.ok(!k.flatMap((g) => g.ids).includes(0));
  assert.equal(o.depo.get(`gun:${gunAnahtari(o.simdi)}`), "1");
});

test("asistan cevabındaki **kalın** Telegram'da kalın görünür; biçim hatasında düz metin gider", async () => {
  const { telegramHtml, duzMetin } = await import("./asistan.js");
  assert.equal(telegramHtml("**Bu hafta:** 7 paylaşım"), "<b>Bu hafta:</b> 7 paylaşım");
  assert.equal(telegramHtml("- 3244 <yeni> & `kod`"), "• 3244 &lt;yeni&gt; &amp; <code>kod</code>");
  assert.equal(telegramHtml("# Özet"), "<b>Özet</b>");
  assert.equal(telegramHtml("~10619 kodsuz"), "~10619 kodsuz");
  assert.equal(duzMetin("**Bu hafta:** 7"), "Bu hafta: 7");
  const o = asistanOrtami([mesaj(1, "**Bu hafta:** 7 paylaşım")]);
  await yazi(o.env, 111, "bu hafta kaç paylaşım");
  const son = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.equal(son.parse_mode, "HTML");
  assert.equal(son.text, "<b>Bu hafta:</b> 7 paylaşım");
});

// ---------- Yapay zekâ asistanı ----------

function asistanOrtami(cevaplar) {
  const o = rotasyonOrtami();
  o.env.ANTHROPIC_API_KEY = "test-anahtar";
  const istekler = [];
  const tg = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const adres = String(url);
    if (adres.startsWith("https://api.anthropic.com")) {
      istekler.push(JSON.parse(istek.body));
      return new Response(JSON.stringify(cevaplar.shift()), { status: 200, headers: { "content-type": "application/json" } });
    }
    return tg(url, istek);
  };
  return { ...o, istekler };
}
const mesaj = (id, text) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } });
const aracCagrisi = (name, input) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name, input }], usage: { input_tokens: 1, output_tokens: 1 } });
const yazi = (env, kisi, text) => guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(kisi), from: { id: kisi, first_name: "Murat" }, text } }, env);

test("asistan: anahtar yoksa nazikçe söyler", async () => {
  const o = rotasyonOrtami();
  await yazi(o.env, 111, "bugün kaç paylaşım yaptık");
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /henüz bağlı değil/);
});

test("asistan: paylaşma/silme aracı yok; 'beklesin' turdaki modelin yerine yenisini getirir", async () => {
  const o = asistanOrtami([aracCagrisi("beklesin", { kod: "4013" }), mesaj(1, "4013 beklemeye alındı.")]);
  const kodlar = {};
  for (let i = 0; i < 14; i++) kodlar[String(4000 + i)] = [{ ids: [5000 + i * 10], tarih: o.simdi - (40 + i) * GUN }];
  o.depo.set("kodlar", JSON.stringify(kodlar));
  await rotasyon(o.env, o.simdi);
  o.gonderilen.length = 0;
  await yazi(o.env, 111, "4013 beklesin");
  const adlar = o.istekler[0].tools.map((t) => t.name);
  assert.deepEqual(adlar, ["durum_ozeti", "model_bilgisi", "beklesin", "sil_onayi_iste", "paylasim_onizle", "kuyruk_goster"]);
  assert.ok(o.istekler[0].tools.every((t) => t.strict === true));
  assert.equal(o.istekler[0].model, "claude-opus-5-5");
  assert.equal(o.istekler[0].fallbacks, "default");
  assert.equal(o.istekler[1].messages.at(-1).content[0].type, "tool_result");
  assert.equal(JSON.parse(o.depo.get("tur")).ogeler["4013"].karar, "t7");
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 2);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, "4013 beklemeye alındı.");
  assert.equal(JSON.parse(o.depo.get("sohbet:111")).length, 2);
});

test("asistan: 'sil' sadece onay düğmesi gönderir; Evet'le bir kez silinir", async () => {
  const o = asistanOrtami([aracCagrisi("sil_onayi_iste", { kod: "3100" }), mesaj(1, "Onay düğmesi gönderdim.")]);
  silmeTaklidi(o);
  await yazi(o.env, 111, "3100'ü sil");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  const soru = cagrilar(o.gonderilen, "sendMessage").find((m) => m.govde.reply_markup);
  assert.match(soru.govde.text, /3 mesajı silinir/);
  assert.equal(soru.govde.reply_markup.inline_keyboard[0][0].callback_data, "ty:-:3100");
  await bas(o.env, 222, "ty:-:3100");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 3);
  assert.equal(JSON.parse(o.depo.get("atlananlar"))["3100"], KALICI);
  o.gonderilen.length = 0;
  await bas(o.env, 222, "ty:-:3100");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0); // iki kez silinmez
});

test("asistan: izinsiz kişiye cevap vermez, günlük sınır çalışır", async () => {
  const o = asistanOrtami([mesaj(1, "x")]);
  await yazi(o.env, 999, "merhaba");
  assert.equal(o.istekler.length, 0);
  o.depo.set(`ai:${gunAnahtari(Math.floor(Date.now() / 1000))}`, "100");
  await yazi(o.env, 111, "merhaba");
  assert.equal(o.istekler.length, 0);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /sınırı doldu/);
});

test("asistan: harcama sınırı hatası anlaşılır mesaj verir", async () => {
  const o = asistanOrtami([]);
  const tg = globalThis.fetch;
  globalThis.fetch = async (url, istek) => String(url).startsWith("https://api.anthropic.com")
    ? new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC." } }), { status: 400, headers: { "content-type": "application/json" } })
    : tg(url, istek);
  await yazi(o.env, 111, "merhaba");
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /harcama sınırına ulaşıldı/);
});

