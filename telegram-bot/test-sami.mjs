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

test("Sami bot anahtarı yokken de rapor hazırlanır (Telegram'a gitmez); paylaşım kaydı yoksa Kemal'in kanal dizininden dünkü paylaşımlar kontrol edilir", async () => {
  const { kanaldanPaylasimlar } = await import("./sami.js");
  const tum = { "3100": { toplam: 0, fiyat: 30 }, "3194": { toplam: 3, fiyat: 70 } };
  const kodlar = { "3100": [{ ids: [700], tarih: ist(14, 0, -1) }], "3194": [{ ids: [701], tarih: ist(15, 0, -1) }, { ids: [10], tarih: ist(10, 0, -5) }], "3595": [{ ids: [702], tarih: ist(16, 0, -1) }] };
  // 3194 dün 15:00'te paylaşıldı, 18:00'de bitti, bugün geri geldi → paylaşım anında stokta
  const olaylar = [{ kod: "3194", tur: "bitti", zaman: ist(18, 0, -1) }, { kod: "3194", tur: "geldi", zaman: ist(8, 0) }];
  const p = kanaldanPaylasimlar(kodlar, tum, olaylar, ist(0, 0, -1), ist(0));
  assert.deepEqual(p.map((x) => [x.kod, x.toplam]), [["3100", 0], ["3194", 1], ["3595", null]]);
  const o = ortam();
  delete o.env.BOT_TOKEN;
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }], ist(8, 0, -1));
  o.depo.set("sami:elleRapor", "1");
  o.g.length = 0;
  await sami.scheduled({}, o.env);
  assert.equal(o.g.length, 0); // Telegram yok
  assert.ok(!o.depo.has("sami:elleRapor"));
  assert.ok([...o.depo.keys()].some((k) => k.startsWith("venom:samiMetin:")));
});

test("aylık harcama raporu: ayın 1'inde geçen ayın Claude + üretim harcaması, bir kez", async () => {
  const { aylikRapor } = await import("./venom.js");
  const o = ortam();
  const birinci = Date.UTC(2026, 10, 1, 9 - 3, 50) / 1000; // 1 Kasım 09:50 İstanbul
  o.depo.set("harcama:2026-10", String(12.5 * 1e6));
  o.depo.set("uretim-harcama:2026-10", "5.6");
  const g = [];
  const tgf = async (env, metod, govde) => g.push(govde);
  await aylikRapor(o.env, birinci - 86400, tgf, 80); // 31 Ekim: rapor yok
  assert.equal(g.length, 0);
  await aylikRapor(o.env, birinci, tgf, 80);
  await aylikRapor(o.env, birinci + 300, tgf, 80);
  assert.equal(g.length, 2); // iki yöneticiye, bir kez
  assert.match(g[0].text, /10\.2026 aylık harcama raporu[\s\S]*Claude[^\n]*12\.50 \$[\s\S]*fal\.ai[^\n]*5\.60 \$[\s\S]*Toplam: 18\.10 \$/);
});

test("stok tablosu satırları: sadece kod, adet, satış fiyatı, sitede, Telegram'da; stoktakiler önce; alış/maliyet yok", async () => {
  const { stokTablosuSatirlari } = await import("./sami.js");
  const satir = stokTablosuSatirlari(
    { "3100": { toplam: 0, fiyat: 30, gizli: true }, "3194": { toplam: 3, fiyat: 70 }, "3010": { toplam: 5, fiyat: null } },
    [{ kod: "3194", fiyat: 70 }, { kod: "3100", gizli: true }],
    { "3194": [{}], "3100": [{}] },
  );
  assert.deepEqual(satir, [["3010", 5, "", "Yok", "Yok"], ["3194", 3, 70, "Var", "Var"], ["3100", 0, 30, "Yok", "Var"]]);
});

test("Google tablosu: anahtar ve tablo bağlıyken Sami stoğu yazar; değişiklik yoksa tekrar yazmaz; /tablo sadece yöneticide", async () => {
  const { stokTablosu, guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  o.env.GOOGLE_SA = JSON.stringify({ client_email: "sami@volonte.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }], ist(8));
  const google = [];
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (u.startsWith("https://sheets.googleapis.com/")) {
      google.push({ u, govde: istek.body ? JSON.parse(istek.body) : null });
      if (u.includes("?fields=sheets.properties")) return Response.json({ sheets: [{ properties: { sheetId: 0, title: "Sayfa1", gridProperties: {} } }] });
      return Response.json({});
    }
    return eski(url, istek);
  };
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333 }, text: "/tablo stok https://docs.google.com/spreadsheets/d/AAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit" } }, o.env);
  assert.ok(!o.depo.has("sami:tablo:stok")); // ekip bağlayamaz
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/tablo stok https://docs.google.com/spreadsheets/d/AAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit" } }, o.env);
  assert.equal(o.depo.get("sami:tablo:stok"), "AAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await stokTablosu(o.env, ist(10));
  const yazim = google.find((x) => x.u.includes("valueInputOption=RAW"));
  assert.deepEqual(yazim.govde.values.slice(1), [["Model kodu", "Adet", "Satış fiyatı ($)", "Sitede", "Telegram'da"], ["3194", 3, 69, "Var", "Var"]]);
  const sayi = google.length;
  await stokTablosu(o.env, ist(10, 5));
  assert.equal(google.length, sayi); // değişiklik yok → yazılmaz
  globalThis.fetch = eski;
});

test("stok deposu: kod sorguları dizin kullanır (tam tarama yok)", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDeposu } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT|^\s*EXPLAIN/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); return { toArray: () => (/^\s*(SELECT|EXPLAIN)/i.test(q) ? st.all(...p) : (st.run(...p), [])) }; } };
  const d = new StokDeposu(sql);
  const plan = sql.exec("EXPLAIN QUERY PLAN SELECT SUM(adet) AS t, MAX(fiyat) AS f, COUNT(*) AS n FROM urun WHERE kod = ?", "3194").toArray().map((r) => r.detail).join(" ");
  assert.match(plan, /USING INDEX urun_kod/);
  assert.ok(d);
});
