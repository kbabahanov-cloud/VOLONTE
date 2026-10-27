// Çalıştırma: node --test test-sami.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";
import sami, { guncelleme, samiRaporu } from "./sami.js";
import { topluRapor } from "./venom.js";

const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 28 + gunEk, hh - 3, mm) / 1000;

function ortam() {
  const depo = new Map();
  const g = [];
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) {
    if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; }
    const st = db.prepare(q);
    const satir = /^\s*SELECT/i.test(q) ? st.all(...p).map((r) => ({ ...r })) : (st.run(...p), []);
    return { toArray: () => satir };
  } };
  const stok = new StokDO({ storage: { sql } });
  const env = {
    BOT_TOKEN: "sami-token", WEBHOOK_SECRET: "s", ALLOWED_IDS: "111,222", EKIP_IDS: "333", SELF_URL: "https://sami.test", GITHUB_REPO: "x/y",
    KAYIT: {
      async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
    },
    STOK: { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) },
  };
  depo.set("kanal", JSON.stringify({ id: -100, kullanici: "Volonteroseoffical" }));
  depo.set("kodlar", JSON.stringify({ "3194": [{ ids: [500], tarih: 1 }], "3100": [{ ids: [600], tarih: 1 }] }));
  globalThis.fetch = async (url, istek = {}) => {
    const adres = String(url);
    if (adres.includes("raw.githubusercontent.com")) return Response.json([{ kod: "3194", fiyat: 65 }, { kod: "3100", fiyat: 30 }, { kod: "3595", fiyat: null }]);
    const metod = adres.split("/").pop();
    const govde = istek.body ? JSON.parse(istek.body) : {};
    g.push({ metod, govde });
    if (metod === "getWebhookInfo") return Response.json({ ok: true, result: { url: "" } });
    return Response.json({ ok: true, result: { message_id: 50 + g.length } });
  };
  const yaz = (magaza, urunler, simdi) => stok.fetch(new Request("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza, urunler, simdi }) }));
  return { env, depo, g, yaz };
}
const cagri = (g, m) => g.filter((x) => x.metod === m);

test("Sami: gruba yönetici ekleyince grup kaydedilir; kanal paylaşımı o andaki stokla kaydedilir; sabah raporu kontrolleri yakalar", async () => {
  const o = ortam();
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }, { kod: "3100", adet: 2, fiyat: 30 }, { kod: "3999", adet: 5, fiyat: 20 }], ist(8, 0, -1));
  await o.yaz("VOLONTE", [{ kod: "3100", adet: 0, fiyat: 30 }, { kod: "3194", adet: 3, fiyat: 70 }], ist(12, 0, -1)); // 3100 bitti, 3194 fiyatı değişti
  await guncelleme({ my_chat_member: { chat: { id: -900, type: "supergroup", title: "Venom Ekip" }, from: { id: 111 }, new_chat_member: { status: "member" } } }, o.env);
  assert.equal(o.depo.get("venom:grup:sami"), "-900");
  await guncelleme({ my_chat_member: { chat: { id: -901, type: "group" }, from: { id: 999 }, new_chat_member: { status: "member" } } }, o.env);
  assert.equal(o.depo.get("venom:grup:sami"), "-900"); // yabancının eklediği grup kaydedilmez
  // dün 14:00 kanalda 3100 (stoksuz) ve 3595 (Vegawin'de yok → kontrol dışı) paylaşıldı
  await guncelleme({ channel_post: { message_id: 700, date: ist(14, 0, -1), chat: { id: -100 }, caption: "✅CODE.3100" } }, o.env);
  await guncelleme({ channel_post: { message_id: 701, date: ist(14, 5, -1), chat: { id: -100 }, caption: "✅CODE.3595" } }, o.env);
  o.depo.set("sonpaylasim", JSON.stringify({ "3100": ist(14, 0, -1) + 20 })); // Kemal paylaşmıştı

  o.g.length = 0;
  await sami.scheduled({}, o.env); // saat şimdi değil: rapor gönderilmez (gerçek saat); doğrudan saf rapor fonksiyonunu dene
  const r = samiRaporu({
    simdi: ist(9, 5),
    ozet: await (await o.env.STOK.get().fetch("https://stok/ozet", { method: "POST", body: "{}" })).json(),
    olaylar: await (await o.env.STOK.get().fetch("https://stok/olaylar", { method: "POST", body: JSON.stringify({ basla: ist(0, 0, -1), bitis: ist(0) }) })).json(),
    paylasimlar: await (await o.env.STOK.get().fetch("https://stok/paylasimlar", { method: "POST", body: JSON.stringify({ basla: ist(0, 0, -1), bitis: ist(0) }) })).json(),
    tum: await (await o.env.STOK.get().fetch("https://stok/tum", { method: "POST", body: "{}" })).json(),
    site: [{ kod: "3194", fiyat: 65 }, { kod: "3100", fiyat: 30 }, { kod: "3595", fiyat: null }],
    kodlar: JSON.parse(o.depo.get("kodlar")),
    sonpaylasim: JSON.parse(o.depo.get("sonpaylasim")),
  });
  assert.match(r.metin, /Dün biten \(1\): 3100/);
  assert.match(r.metin, /Fiyatı değişen: 3194 69→70 \$/);
  assert.match(r.metin, /Telegram'da hiç paylaşılmamış \(1\): 3999/);
  assert.match(r.metin, /⚠️ 3100 stokta yokken paylaşıldı \(.*, Kemal\)/);
  assert.match(r.metin, /⚠️ Sitede yanlış fiyat: 3194 sitede 65 \$, Vegawin 70 \$/);
  assert.match(r.metin, /⚠️ Sitede görünüyor ama stoğu bitmiş: 3100/);
  assert.ok(!/3595/.test(r.metin)); // Vegawin'de olmayan (Black Rose) hata sayılmaz
  assert.equal(r.sorunlar.length, 3);
});

test("Sami: webhook kurulunca 'sami:aktif' olur; stok bitti soruları Sami'den gider, ekip düğmeye basabilir", async () => {
  const o = ortam();
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }], 1);
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 0, fiyat: 69 }], 2);
  const gercek = Date.now;
  Date.now = () => ist(11) * 1000;
  try { await sami.scheduled({}, o.env); } finally { Date.now = gercek; }
  assert.equal(o.depo.get("sami:aktif"), "1");
  assert.equal(cagri(o.g, "setWebhook")[0].govde.allowed_updates.includes("channel_post"), true);
  const sorular = cagri(o.g, "copyMessage");
  assert.equal(sorular.length, 3); // yöneticiler + ekip
  assert.deepEqual(sorular[0].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["🔁 Repete olacak", "🗑 Sil", "⏳ Beklesin"]);
  o.g.length = 0;
  await guncelleme({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: "sz:r:3194", message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.equal(cagri(o.g, "editMessageCaption").length, 3);
  await guncelleme({ callback_query: { id: "c", from: { id: 999 }, data: "sz:s:3194", message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Yetkiniz yok/);
});

test("toplu rapor: üç botun özeti + yakalanan sorunlar + yapılacaklar; gruba gider (grup yoksa yöneticilere)", async () => {
  const o = ortam();
  const gun = "2026-10-28";
  o.depo.set(`venom:rapor:sami:${gun}`, JSON.stringify({ ozet: "Stokta 80 model", sorunlar: ["3100 stokta yokken paylaşıldı"], yapilacak: ["3 model kanala paylaşılmamış"] }));
  o.depo.set(`venom:rapor:kemal:${gun}`, JSON.stringify({ ozet: "Dün 12 paylaşım", sorunlar: [], yapilacak: [] }));
  const g = [];
  await topluRapor(o.env, ist(9, 40), async (env, metod, govde) => g.push({ metod, govde }));
  assert.equal(g.length, 2); // grup yok → iki yöneticiye
  assert.match(g[0].govde.text, /🧭 VENOM — 28\.10\.2026 toplu rapor[\s\S]*📦 Sami: Stokta 80 model[\s\S]*🌸 Selin: rapor gelmedi ⚠️[\s\S]*⚠️ Kontrollerde yakalananlar:\n• 📦 Sami → 3100 stokta yokken paylaşıldı[\s\S]*Bugün yapılacaklar:\n• 3 model kanala paylaşılmamış/);
  o.depo.set("venom:grup:kemal", "-900");
  g.length = 0;
  await topluRapor(o.env, ist(9, 40), async (env, metod, govde) => g.push({ metod, govde }));
  assert.deepEqual(g.map((x) => x.govde.chat_id), [-900]);
});
