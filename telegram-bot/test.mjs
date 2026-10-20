// Çalıştırma: node --test telegram-bot/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { fiyatBul, guncellemeIsle, haftaOzeti, gunAnahtari } from "./worker.js";

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

  const kayit = JSON.parse(depo.get("post:0000000010"));
  assert.equal(kayit.foto, "buyuk");
  assert.equal(kayit.fiyat, 25);
  assert.equal(kayit.link, "https://t.me/Volonteroseoffical/10");

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
