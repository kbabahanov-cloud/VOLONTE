// Çalıştırma: node --test telegram-bot/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { fiyatBul, kodBul, guncellemeIsle, haftaOzeti, gunAnahtari, webhookKontrol } from "./worker.js";

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
