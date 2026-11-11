// Çalıştırma: node --test test-sami.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";
import sami, { guncelleme, samiRaporu } from "./sami.js";
import { topluRapor } from "./venom.js";

const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 28 + gunEk, hh - 3, mm) / 1000;

// 10 Kasım (EMİN MİSİN): kontrol eden kişi özet sorusuna "✅ Eminim, gönder" basar
async function eminim(o, g2, kim, ad, desen = null) {
  const emin = o.g.filter((x) => x.metod === "sendMessage" && String(x.govde.chat_id) === String(kim) && /Göndereyim mi\?/.test(x.govde.text || "")).at(-1);
  assert.ok(emin, "Emin misin sorusu gelmedi");
  if (desen) assert.match(emin.govde.text, desen);
  assert.deepEqual(emin.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Eminim, gönder", "↩️ Geri dön"]);
  await g2({ callback_query: { id: "c", from: { id: kim, first_name: ad }, data: emin.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: kim }, message_id: 3 } } }, o.env);
}
// 10 Kasım (Patron): Aziz/Merdan yazısı → "Şunu anladım … Doğru mu?" → ✅ Evet
async function teyitEt(o, g2, kim, ad, desen = null) {
  const t = o.g.filter((x) => String(x.govde.chat_id) === String(kim) && /Şunu anladım/.test(x.govde.text || "")).at(-1);
  assert.ok(t, "teyit sorusu gelmedi: " + JSON.stringify(o.g.filter((x) => String(x.govde.chat_id) === String(kim)).map((x) => x.govde.text || x.govde.caption).slice(-3)));
  if (desen) assert.match(t.govde.text, desen);
  assert.deepEqual(t.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Evet", "✏️ Düzelt"]);
  await g2({ callback_query: { id: "c", from: { id: kim, first_name: ad }, data: t.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: kim }, message_id: 77 } } }, o.env);
  return t;
}
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
    const govde = istek.body instanceof FormData ? { chat_id: istek.body.get("chat_id"), caption: istek.body.get("caption"), belge: istek.body.get("document") } : istek.body ? JSON.parse(istek.body) : {};
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
    siteFiyat: false,
  });
  assert.match(r.metin, /Dün biten \(1\): 3100/);
  assert.match(r.metin, /Fiyatı değişen: 3194 69→70 \$/);
  assert.match(r.metin, /Telegram'da hiç paylaşılmamış \(1\): 3999/);
  assert.match(r.metin, /⚠️ 3100 stokta yokken paylaşıldı \(.*, Kemal\)/);
  assert.match(r.metin, /• ✅ Sitede fiyat görünmüyor/); // yeni sitede fiyat yok: karşılaştırma yerine bu kontrol (31 Ekim)
  assert.ok(!/yanlış fiyat|fiyatlar Vegawin/.test(r.metin));
  assert.match(r.metin, /⚠️ Sitede görünüyor ama stoğu bitmiş: 3100/);
  assert.ok(!/3595/.test(r.metin)); // Vegawin'de olmayan (Black Rose) hata sayılmaz
  assert.equal(r.sorunlar.length, 2);
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
  assert.deepEqual(sorular[0].govde.reply_markup.inline_keyboard.map((r) => r.map((d) => d.text)), [["🔁 Repete olacak", "⏳ Beklesin"]]); // 10 Kasım: Sil sadece Patron'un (Merdan/Aziz'e gitmez)
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

test("stok tablosu satırları: sadece kod, adet, satış fiyatı, sitede, Telegram'da, son paylaşım tarihi; stoktakiler önce; alış/maliyet yok", async () => {
  const { stokTablosuSatirlari } = await import("./sami.js");
  const satir = stokTablosuSatirlari(
    { "3100": { toplam: 0, fiyat: 30, gizli: true }, "3194": { toplam: 3, fiyat: 70 }, "3010": { toplam: 5, fiyat: null } },
    [{ kod: "3194", fiyat: 70 }, { kod: "3100", gizli: true }],
    { "3194": [{}], "3100": [{}] },
    { "3194": Date.UTC(2026, 9, 20, 9) / 1000 },
  );
  assert.deepEqual(satir, [["3010", 5, "", "Yok", "Yok", ""], ["3194", 3, 70, "Var", "Var", "20.10.2026"], ["3100", 0, 30, "Yok", "Var", ""]]);
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
  assert.deepEqual(yazim.govde.values.slice(1), [["Model kodu", "Adet", "Satış fiyatı ($)", "Sitede", "Telegram'da", "Telegram'da son paylaşım"], ["3194", 3, 69, "Var", "Var", ""]]);
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

test("birikmiş mesaj koruması: eski mesaja cevap yok, müşteri mesajı listeye; veritabanı açılınca kesim; kuyruk boşalınca liste yöneticilere", async () => {
  const { birikimSuzgeci, birikimAdimi } = await import("./venom.js");
  const o = ortam();
  o.depo.set("venom:birikim:kemal", JSON.stringify({}));
  const g = [];
  let bekleyen = 3;
  const tgf = async (env, metod, govde) => { g.push({ metod, govde }); return metod === "getWebhookInfo" ? { ok: true, result: { pending_update_count: bekleyen } } : { ok: true }; };
  const ekip = (id) => [111, 333].includes(id);
  const musteri = { message: { message_id: 5, date: ist(14), chat: { id: 900, type: "private" }, from: { id: 900, first_name: "Aisha", username: "aisha" }, text: "Price of 3194?" } };
  assert.equal(await birikimSuzgeci(o.env, "kemal", musteri, ekip, tgf), true);
  assert.equal(await birikimSuzgeci(o.env, "kemal", { message: { ...musteri.message, from: { id: 111 } } }, ekip, tgf), true);
  assert.equal(await birikimSuzgeci(o.env, "kemal", { channel_post: { message_id: 1, date: ist(14), chat: { id: -100 } } }, ekip, tgf), false); // kanal kaydı işlenir
  assert.equal(await birikimSuzgeci(o.env, "kemal", { callback_query: { id: "c" } }, ekip, tgf), true);
  assert.deepEqual(JSON.parse(o.depo.get("venom:birikmis:kemal")).map((x) => x.metin), ["Price of 3194?"]);
  await birikimAdimi(o.env, "kemal", ist(15), tgf); // veritabanı çalışıyor → kesim
  assert.equal(JSON.parse(o.depo.get("venom:birikim:kemal")).kesim, ist(15));
  assert.equal(await birikimSuzgeci(o.env, "kemal", { message: { ...musteri.message, date: ist(15, 1) } }, ekip, tgf), false); // yeni mesaj normal
  await birikimAdimi(o.env, "kemal", ist(15, 5), tgf); // kuyruk dolu
  assert.ok(o.depo.has("venom:birikim:kemal"));
  bekleyen = 0;
  await birikimAdimi(o.env, "kemal", ist(15, 10), tgf);
  assert.ok(!o.depo.has("venom:birikim:kemal"));
  const liste = g.filter((x) => x.metod === "sendMessage");
  assert.equal(liste.length, 2);
  assert.match(liste[0].govde.text, /yeniden çalışıyor[\s\S]*1 müşteri mesajı \(HİÇBİRİNE otomatik cevap gitmedi\)[\s\S]*Aisha \(@aisha\): Price of 3194\?/);
});

test("köprü raporu: son değişiklik ve son çalışma ayrı; eski köprüde (sinyal yok) yanlış alarm verilmez; yeni köprü 16 saat susarsa uyarı", async () => {
  const o = ortam();
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }], ist(10, 0, -3)); // 3 gün önce değişiklik
  const rapor = async (simdi) => samiRaporu({ simdi, ozet: await (await o.env.STOK.get().fetch("https://stok/ozet", { method: "POST", body: "{}" })).json(), olaylar: [], paylasimlar: [], tum: {}, site: [], kodlar: {}, sonpaylasim: {} });
  let r = await rapor(ist(9, 5));
  assert.match(r.metin, /son değişiklik 2[56]\.10 10:00 · 1 model\nKöprü son çalışma: yeni köprü kurulunca görünecek/);
  assert.equal(r.sorunlar.length, 0); // yanlış alarm yok
  await o.yaz("VOLONTE", [], ist(18, 55, -1)); // yeni köprü: boş gönderim (çalışıyorum)
  r = await rapor(ist(9, 5));
  assert.match(r.metin, /son değişiklik 2[56]\.10 10:00[\s\S]*Köprü son çalışma: .*18:55 ✅/);
  r = await rapor(ist(18, 0)); // 23 saat sinyal yok (bugün açılıştan beri 9 saat)
  assert.match(r.metin, /mağaza açıkken 9 saattir sinyal yok/);
  assert.equal(r.sorunlar.length, 1);
});

test("fabrika: liste çözümleme (kod 4-6 hane, adet 1-3 hane, birden çok renk)", async () => {
  const { listeCoz, listeYaz } = await import("./fabrika.js");
  const l = listeCoz("3183 siyah 10 bej 6, 3186 kırmızı 5\n3520 açık mavi 12 Lacivert 3");
  assert.deepEqual(l, [
    { kod: "3183", renkler: [{ renk: "siyah", adet: 10 }, { renk: "bej", adet: 6 }] },
    { kod: "3186", renkler: [{ renk: "kırmızı", adet: 5 }] },
    { kod: "3520", renkler: [{ renk: "açık mavi", adet: 12 }, { renk: "lacivert", adet: 3 }] },
  ]);
  assert.equal(listeYaz(l.slice(0, 1)), "3183 — siyah 10, bej 6");
  assert.deepEqual(listeCoz("merhaba"), []);
});

test("fabrika: indirimli mal (2000) eksik listesine girmez; 21:15'te sadece Murat'a tek satır; repete kaydı açılmaz", async () => {
  const { fabrikaAdimi, repeteMetni } = await import("./fabrika.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  await o.yaz("BLACKROSE", [{ kod: "2000", adet: 140, fiyat: 5 }, { kod: "3634", adet: 4, fiyat: 30 }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun, kalemler: [{ kod: "2000", adet: 25 }, { kod: "3634", adet: 8 }] }) });
  o.depo.set("sami:satisAcik", "1");
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(19, 10), tg);
  await fabrikaAdimi(o.env, ist(19, 25), tg);
  assert.match(g[0].govde.text, /1 model, toplam 8 adet/); // Merdan'ın listesi: 2000 yok
  assert.ok(!JSON.stringify(g).includes("2000"));
  g.length = 0;
  await fabrikaAdimi(o.env, ist(21, 15), tg);
  assert.deepEqual(g.map((x) => [x.govde.chat_id, x.govde.text]), [["111", "28.10.2026\n🏷 İndirimli mal (2000): 25 adet satıldı, 140 kaldı"]]);
  await fabrikaAdimi(o.env, ist(21, 30), tg);
  assert.equal(g.filter((x) => /İndirimli/.test(x.govde.text)).length, 1); // günde bir kez
  g.length = 0;
  assert.equal(await repeteMetni(o.env, { chat: { id: 333 }, from: { id: 333 }, text: "2000 repete geldi" }, tg, ist(15)), true);
  assert.match(g[0].govde.text, /indirimli mal kodu/);
});

test("fabrika: satış girişi 10 dk değişmeyince (saat şartı yok) Hemra'ya; sadece VOLONTE; onayla fabrikaya SADECE kod/renk/adet, Murat'a kopya; fabrika kişisi Murat onayıyla eklenir; 1 saat hatırlatma, 2 saat Murat'a haber; sonradan satılan yeni model ek liste", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("kodlar", JSON.stringify({ 3183: [{ ids: [700], tarih: 1 }], 3194: [{ ids: [500], tarih: 1 }] }));
  await o.yaz("VOLONTE", [{ kod: "3183", adet: 4, fiyat: 40 }, { kod: "3186", adet: 0, fiyat: 30 }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3183", adet: 8 }, { kod: "3186", adet: 2 }] }) });
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun, kalemler: [{ kod: "7001", adet: 3 }] }) }); // Black Rose: bu listeye girmez
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(20, 10), tg);
  assert.equal(g.length, 0); // satış okuması henüz açılmadı
  o.depo.set("sami:satisAcik", "1");
  await fabrikaAdimi(o.env, ist(14, 0), tg); // ilk satış görüldü: izleme başlar
  assert.equal(g.length, 0);
  // fabrika kişisi /start → Murat'a sorulur, Murat ekler
  o.g.length = 0;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Nuri" }, text: "/start" } }, o.env);
  const soru = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111");
  assert.match(soru.govde.text, /Nuri Sami'ye \/start yazdı/);
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: "fa:e:555", message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.ok(!o.depo.has("sami:fabrikaKisiler")); // Hemra ekleyemez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: "fa:e:555", message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.deepEqual(JSON.parse(o.depo.get("sami:fabrikaKisiler")).map((k) => k.ad), ["Nuri"]);
  o.g.length = 0;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555 }, text: "/stok" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /sadece VOLONTE fabrika eksik listesini/);
  // 10 dk değişmeyince (14:10) liste Hemra'ya — saat kaç olursa olsun: önce özet, sonra her model ayrı mesaj
  await fabrikaAdimi(o.env, ist(14, 5), tg);
  assert.equal(g.length, 0);
  await fabrikaAdimi(o.env, ist(14, 10), tg);
  assert.equal(g[0].govde.chat_id, "333");
  assert.match(g[0].govde.text, /bugün satılan modeller: 2 model, toplam 10 adet/);
  assert.match(g[0].govde.text, /^🟦 VOLONTE LİSTESİ – BAŞLANGIÇ \(2 model\)/); // 10 Kasım: mağaza başlığı
  assert.deepEqual(g.slice(1).map((x) => [x.metod, x.govde.caption || x.govde.text]), [["copyMessage", "🟦 VOLONTE\n3183 · satılan 8 · stok 4"], ["sendMessage", "🟦 VOLONTE\n3186 · satılan 2 · stok 0 🔴\n📷 fotoğraf yok"], ["sendMessage", "🟦 VOLONTE LİSTESİ – SONU (2 model)"]]); // tek mesaj: kanal fotoğrafı + düğmeler; sonunda BİTTİ
  assert.deepEqual(g[1].govde.reply_markup.inline_keyboard.map((r) => r.map((d) => d.text)), [["Küçük 38-44", "Büyük 44-50"], ["İkisi de"], ["✅ Aynısı", "✏️ Adeti değiştir"], ["🚫 İsteme", "⚠️ Bot hatası"]]); // 10 Kasım: net düğmeler, satırda en fazla 2
  assert.ok(!JSON.stringify(g).includes("7001"));
  await fabrikaAdimi(o.env, ist(14, 30), tg);
  assert.equal(g.length, 4); // günde tek liste
  // Hemra 3183'ü yazar (kalan: 3186), 3186'ya "Bu sefer isteme" → onay kartı
  o.g.length = 0;
  Date.now = ((gercek) => { const f = () => ist(14, 20) * 1000; f.gercek = gercek; return f; })(Date.now);
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3183 siyah 10 bej 6" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3183: beden seçilmedi/); // beden seçilmeden karta geçmez
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fe:k:${gun}:3183`, message: { chat: { id: 333 }, message_id: 9 } } }, o.env); // yazdığı renkler Küçük'e geçer
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /Gidecek liste/.test(x.govde.text)));
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3183 küçük siyah 10 bej 6" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3183: Küçük · siyah 10, bej 6\n\nKalan \(1\): 3186 \(karar bekleniyor\)/);
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fe:x:${gun}:3186`, message: { chat: { id: 333 }, message_id: 9 } } }, o.env);
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.match(kart.govde.text, /🏭 Fabrika \(Nuri\/Sinem\/Fuat\):\n3183 — Küçük \(38-44\): siyah 10, bej 6\n\n⏭ Bu sefer istenmeyen: 3186[\s\S]*Gönderilsin mi\?/);
  assert.equal(kart.govde.reply_markup.inline_keyboard[0][0].callback_data, `fb:o:${gun}`);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const nuri = cagri(o.g, "copyMessage").find((x) => x.govde.chat_id === 555); // sitede yok → kanaldaki fotoğraf (yazısı değiştirilir)
  assert.equal(nuri.govde.message_id, 700);
  assert.equal(nuri.govde.caption, "🟦 VOLONTE\n3183 · Küçük (38-44) · siyah 10 · bej 6"); // stok/satış/fiyat yok, beden açık; 10 Kasım: mağaza adı
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === 555 && !/LİSTESİ –/.test(x.govde.text)).length, 0); // fotoğrafsız mesaj yok
  assert.deepEqual(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === 555).map((x) => x.govde.text), ["🟦 VOLONTE LİSTESİ – BAŞLANGIÇ (1 model)", "🟦 VOLONTE LİSTESİ – SONU (1 model)"]); // 10 Kasım: mağaza başlıkları
  // 10 Kasım (Patron): Patron'a ayrıntılı kopya YOK; liste fabrikaya ulaşınca Venom'dan TEK satır
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111" && /onaylayan/.test(x.govde.text)));
  const fg = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "fabrikaGitti" }) })).json();
  assert.deepEqual(fg.map((x) => x.metin), ["Bugünkü eksik listesi fabrikaya gitti: VOLONTE 1 model, Black Rose 0 model."]);
  // Nuri ✅ Gelecek → "Kaç günde hazır olur?" → 3 gün; o gün Murat'a ve Hemra'ya "geldi mi?"
  const nid = nuri.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 555, first_name: "Nuri" }, data: `fc:g:${nid}`, message: { chat: { id: 555 }, message_id: nuri.mesajId || 0 } } }, o.env);
  await g2({ callback_query: { id: "c", from: { id: 555, first_name: "Nuri" }, data: `fc:t:${nid}:3`, message: { chat: { id: 555 }, message_id: 0 } } }, o.env);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "333" && /Nuri · 3183 → Gelecek — 2-3 gün \(~31\.10\.2026\)/.test(x.govde.text)));
  const { siparisTakip, haftalikMetin } = await import("./fabrika.js");
  const tgt = (e, m, gv) => { o.g.push({ metod: m, govde: gv }); return { ok: true, result: { message_id: 9 } }; };
  o.g.length = 0;
  await siparisTakip(o.env, ist(9, 0, 3), tgt);
  assert.ok(!o.g.some((x) => /Bugün gelecek/.test(x.govde.caption || x.govde.text || "")));
  await siparisTakip(o.env, ist(10, 5, 3), tgt);
  const hz = o.g.filter((x) => /3183 · Küçük[\s\S]*📦 Bugün gelecek \(Nuri: 2-3 gün\)/.test(x.govde.caption || x.govde.text || ""));
  assert.deepEqual(hz.map((x) => x.govde.chat_id).sort(), ["333"]); // 9 Kasım: Patron'a değil; 10 Kasım: mağaza (Aziz yoksa Hemra) [📦 Geldi]
  assert.equal(hz[0].govde.reply_markup.inline_keyboard[0][0].callback_data.slice(0, 5), "fc:G:"); 
  // ertesi gün: 3183 tekrar listede → son istenen hazır öneri + "Önceki gibi iste"; 12 satış → 🔥
  g.length = 0;
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-29", kalemler: [{ kod: "3183", adet: 12 }] }) });
  await fabrikaAdimi(o.env, ist(10, 0, 1), tg);
  await fabrikaAdimi(o.env, ist(10, 10, 1), tg);
  assert.equal(g[1].govde.caption, "🟦 VOLONTE\n3183 · satılan 12 · stok 4\n🔥 hızlı gidiyor, fazla iste\nSon istenen: Küçük · siyah 10, bej 6");
  assert.deepEqual(g[1].govde.reply_markup.inline_keyboard[2].map((d) => d.text), ["✅ Aynısı", "✏️ Adeti değiştir"]);
  await fabrikaAdimi(o.env, ist(11, 5, 1), tg);
  assert.equal(g.length, 3); // liste 10:10'da gitti (+ BİTTİ) → hatırlatma 11:10
  await fabrikaAdimi(o.env, ist(11, 10, 1), tg);
  // 1 saat dolunca sadece karar verilmeyen modeller: önce "şu 1 model kaldı", sonra o model aynı düğmelerle
  assert.match(g.at(-2).govde.text, /⏰ 29\.10\.2026 VOLONTE eksik listesi: şu 1 model kaldı: 3183/);
  assert.match(g.at(-1).govde.text, /^⏳ 3183 · satılan 12/);
  assert.deepEqual(g.at(-1).govde.reply_markup.inline_keyboard.slice(0, 2).flat().map((d) => d.callback_data), ["fe:k:2026-10-29:3183", "fe:b:2026-10-29:3183", "fe:i:2026-10-29:3183"]);
  await fabrikaAdimi(o.env, ist(12, 10, 1), tg);
  assert.equal(g.at(-1).govde.chat_id, "111");
  assert.match(g.at(-1).govde.text, /VOLONTE eksik listesi: Hemra onaylamadı/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: "fe:o:2026-10-29:3183", message: { chat: { id: 333 }, message_id: 9 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3183 — Küçük \(38-44\): siyah 10, bej 6[\s\S]*Gönderilsin mi\?/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: "fb:o:2026-10-29", message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111")); // 10 Kasım: Patron'a ayrıntılı kopya yok (tek satır Venom'dan)
  assert.match(cagri(o.g, "editMessageText").at(-1).govde.text, /3183 — Küçük \(38-44\): siyah 10, bej 6 🔥/); // 🔥 Hemra'nın onay kartında
  assert.ok(![...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage")].filter((x) => x.govde.chat_id === 555).some((x) => /🔥|hızlı/.test(x.govde.text || x.govde.caption)));
  // Sonradan yeni model satılır → 10 dk sabit kalınca sadece yeni model EK olarak; Hemra'nın cevabı eke yazılır
  g.length = 0;
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-29", kalemler: [{ kod: "3183", adet: 13 }, { kod: "3186", adet: 1 }] }) });
  await fabrikaAdimi(o.env, ist(13, 0, 1), tg);
  assert.equal(g.length, 0);
  await fabrikaAdimi(o.env, ist(13, 10, 1), tg);
  assert.match(g[0].govde.text, /EK: listeden sonra satılan yeni modeller: 1 model, toplam 1 adet/);
  assert.ok(g.slice(1, -1).every((x) => /^🟦 VOLONTE\n3186 ·/.test(x.govde.text)));
  assert.match(g.at(-1).govde.text, /VOLONTE LİSTESİ – SONU/);
  Date.now = ((gercek) => { const f = () => ist(13, 20, 1) * 1000; f.gercek = gercek.gercek || gercek; return f; })(Date.now);
  o.g.length = 0;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3186 büyük kırmızı 4" } }, o.env);
  assert.equal(cagri(o.g, "sendMessage")[0].govde.reply_markup.inline_keyboard[0][0].callback_data, "fb:o:2026-10-29-e1");
  Date.now = Date.now.gercek;
  // Pazartesi 09:30 haftalık özet (Murat'a)
  o.g.length = 0;
  await siparisTakip(o.env, ist(9, 25, 5), tgt);
  assert.ok(!o.g.some((x) => /haftalık özet/.test(x.govde.text || "")));
  await siparisTakip(o.env, ist(9, 35, 5), tgt);
  const hafta = cagri(o.g, "sendMessage").filter((x) => /haftalık özet/.test(x.govde.text));
  assert.equal(hafta.length, 1);
  assert.equal(hafta[0].govde.chat_id, "111");
  assert.match(hafta[0].govde.text, /• İstenen \(2\): 3183 siyah 10\/bej 6, 3183 siyah 10\/bej 6\n• Geldi \(0\): yok\n• Hâlâ bekleniyor \(2\): 3183 \(31\.10\.2026\), 3183\n• Gecikiyor \(1\): 3183 \(31\.10\.2026 demişti\)/);
  await siparisTakip(o.env, ist(10, 0, 5), tgt);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => /haftalık özet/.test(x.govde.text)).length, 1); // bir kez
  assert.ok(haftalikMetin);
});

test("fabrika siparişi: model başına mesaj (kanal fotoğrafı + ⚠️ düğmesi), ilk basan geçerli, repete süresi, repete geldi → Kemal'e; bitti → Sil ikinci onayla kuyruklara; fiyat/stok fabrikaya asla gitmez", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }, { id: 556, ad: "Sinem" }]));
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 4, fiyat: 70 }], ist(8));
  const gun = "2026-10-28";
  // Hemra onay kartı hazır (doğrudan kayıt)
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3194", renkler: [{ renk: "siyah", adet: 10 }] }] }) }) });
  o.g.length = 0;
  const bas = (kim, data, mesaj = 1) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 555: "Nuri", 556: "Sinem", 333: "Hemra", 111: "Murat" }[kim] || "X" }, data, message: { chat: { id: kim }, message_id: mesaj } } }, o.env);
  await bas(333, `fb:o:${gun}`);
  const kopya = cagri(o.g, "copyMessage");
  assert.equal(kopya.length, 2); // iki fabrika kişisi, kanal fotoğrafı
  assert.equal(kopya[0].govde.caption, "🟦 VOLONTE\n3194 · siyah 10");
  assert.ok(!/\$|fiyat|stok|satılan/i.test(kopya[0].govde.caption));
  const kl = kopya[0].govde.reply_markup.inline_keyboard.flat().map((d) => d.text);
  assert.deepEqual(kl, ["✅ Gelecek", "🔁 Repete olacak", "❌ Bitti, gelmeyecek", "⚠️ Az kaldı", "⚠️ Fotoğraf yanlış model"]);
  const id = kopya[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  // ⚠️ fotoğraf yanlış → Murat + Hemra
  o.g.length = 0;
  await bas(555, `fc:y:${id}`);
  assert.deepEqual(cagri(o.g, "sendMessage").map((x) => x.govde.chat_id).sort(), ["333"]); // 9 Kasım: Patron'a değil, Hemra/Merdan'a
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /3194 fotoğrafı yanlış dendi \(Nuri\)/);
  // yetkisiz kişi basamaz
  o.g.length = 0;
  await bas(999, `fc:g:${id}`);
  assert.match(cagri(o.g, "answerCallbackQuery")[0].govde.text, /Yetkiniz yok/);
  // Sinem repete der → süre sorulur; Nuri sonra basarsa geçersiz
  o.g.length = 0;
  await bas(556, `fc:r:${id}`, 51);
  await bas(555, `fc:g:${id}`);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Sinem zaten cevapladı/);
  await bas(555, `fc:s:${id}:5`);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /size ait değil/);
  o.g.length = 0;
  await bas(556, `fc:s:${id}:5`);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /Sinem · 3194 → Repete olacak — 5 gün \(~/);
  assert.ok(cagri(o.g, "editMessageCaption").every((x) => /Sinem: Repete olacak — 5 gün/.test(x.govde.caption)));
  // 10 Kasım: teslim günü mağazaya [📦 Geldi] (Aziz yoksa Hemra), 17:00'de gelmediyse Sinem'e "ne durumda?"
  o.g.length = 0;
  const tg6 = (e, m, g) => { o.g.push({ metod: m, govde: g }); return { ok: true, result: { message_id: 9 } }; };
  await f.siparisTakip(o.env, Math.floor(Date.now() / 1000) + 6 * 86400, tg6);
  assert.equal(o.g.filter((x) => /Bugün gelecek \(Sinem: 5 gün\)/.test(x.govde.caption || x.govde.text || "") && x.govde.chat_id === "333").length, 1);
  o.g.length = 0;
  await f.siparisTakip(o.env, Math.floor(Date.now() / 1000) + 6 * 86400 + 8 * 3600, tg6);
  const ts = o.g.filter((x) => /bugün gelecekti \(5 gün\), ne durumda\?/.test(x.govde.caption || x.govde.text || ""));
  assert.deepEqual(ts.map((x) => String(x.govde.chat_id)), ["556"]); // sadece cevaplayan Sinem
  assert.deepEqual(ts[0].govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Bugün geliyor", "⏱ 4-6 gün", "⏱ 10-15 gün", "⏱ 15+ gün", "✏️ Tarih yaz", "❌ İptal"]);
  // Nuri yazıyla bildirir → onay sorusu → Evet → Murat/Hemra'ya + Kemal sırası
  o.g.length = 0;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Nuri" }, text: "3194 repete geldi siyah 8" } }, o.env);
  const soru = cagri(o.g, "sendMessage")[0];
  assert.match(soru.govde.text, /3194 repete geldi – siyah 8, doğru mu\?/);
  o.g.length = 0;
  await bas(555, soru.govde.reply_markup.inline_keyboard[0][0].callback_data, 77);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /📦 🟦 VOLONTE · 3194 repete geldi – siyah 8 \(Nuri bildirdi\)/);
  assert.deepEqual(JSON.parse(o.depo.get("venom:repetePaylas")).map((x) => [x.kod, x.deneme]), [["3194", false]]);
  // Bitti → karar → Sil (ikinci onay) → kuyruklar + gizle
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "fabrika:2026-10-29", v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3100", renkler: [{ renk: "bej", adet: 2 }] }] }) }) });
  o.g.length = 0;
  await bas(333, "fb:o:2026-10-29");
  const id2 = cagri(o.g, "copyMessage")[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await bas(555, `fc:b:${id2}`);
  const karar = o.g.filter((x) => /Bu mal fabrikada bitti \(Nuri\)\. Mağazada son: yok \(0\)\. Ne yapalım\?/.test(x.govde.caption || x.govde.text || ""));
  assert.deepEqual(karar.map((x) => x.govde.chat_id), ["333"]); // 10 Kasım: Hemra'ya (Patron'a değil)
  assert.deepEqual(karar[0].govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["🔁 Repete öner", "❓ Patron karar versin", "⏳ Stok bitene kadar bekle"]); // 10 Kasım kural 7: Sil düğmesi Hemra'ya gitmez
  assert.ok(JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "fabrika:bitenler" }) })).json()).v)["3100"]); // bir daha sorulmaz
  // 10 Kasım: Hemra "❓ Patron karar versin" → Venom'dan Patron'a kart → Patron "Sil" → Sami uygular (mağaza stoğu yok)
  o.g.length = 0;
  await bas(333, `fh:q:${id2}`, 5);
  const oneri = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "bittiOneri" }) })).json();
  assert.deepEqual(oneri.map((x) => [x.kod, x.oneri, x.magaza, x.stok, x.hemra]), [["3100", "sor", "VOLONTE", "yok", "Hemra"]]);
  assert.ok(!o.depo.has("venom:siteSil")); // Hemra'nın önerisiyle silinmez — Patron onayı gerekir
  await o.env.STOK.get().fetch("https://stok/kuyruk-ekle", { method: "POST", body: JSON.stringify({ ad: "bittiKarar", kayit: { id: "k1", sip: id2, karar: "sil" } }) });
  await f.bittiKararAdimi(o.env, Math.floor(Date.now() / 1000), tg6);
  assert.ok(!o.depo.has("venom:kanalSil")); // sıra: önce Selin (site), Kemal'e Selin devreder
  assert.deepEqual(JSON.parse(o.depo.get("venom:siteSil")).map((x) => [x.kod, x.kanal]), [["3100", true]]);
  const tum = await (await o.env.STOK.get().fetch("https://stok/tum", { method: "POST", body: "{}" })).json();
  assert.equal(tum["3100"] ? tum["3100"].gizli : true, true);
  await bas(333, `fh:r:${id2}`);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /zaten seçti|artık geçerli değil/);
  // KESİN KURAL: mağazada stok varken (3194: VOLONTE 4 adet) hiçbir silme kuyruğa girmez
  const { silKuyrugu } = await import("./sil.js");
  assert.deepEqual(await silKuyrugu(o.env, "3194", "Patron", 1), { engel: "VOLONTE 4 adet" });
  assert.deepEqual(JSON.parse(o.depo.get("venom:siteSil")).map((x) => x.kod), ["3100"]);
});

test("fabrika denemesi: 🧪 her mesajda, Murat başlatır; kanal paylaşımı ve silme YOK; deneme gerçek listeye karışmaz; Kemal onayıyla özet", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { fabrikaIsleri } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  const bas = (kim, data, mesaj = 1) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 555: "Nuri", 333: "Hemra", 111: "Murat" }[kim] }, data, message: { chat: { id: kim }, message_id: mesaj } } }, o.env);
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333 }, text: "/fabrikadeneme" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /sadece Murat/);
  o.g.length = 0;
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "/fabrikadeneme" } }, o.env);
  const kart = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333");
  assert.match(kart.govde.text, /^🧪 DENEME – üretim yapmayın[\s\S]*9999 DENEME — siyah 2, bej 1/);
  const did = kart.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await bas(333, `fb:o:${did}`);
  const msj = [...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].find((x) => x.govde.chat_id === 555);
  const yazi = msj.govde.caption || msj.govde.text;
  assert.match(yazi, /^🧪 DENEME – üretim yapmayın\n9999 DENEME · siyah 2 · bej 1$/);
  assert.ok(msj.govde.reply_markup.inline_keyboard.flat().some((d) => d.text === "⚠️ Fotoğraf yanlış model"));
  const id = msj.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  assert.ok(id.startsWith("D"));
  await bas(555, `fc:r:${id}`);
  await bas(555, `fc:s:${id}:3`);
  await bas(555, `fc:k:${id}`);
  // Kemal: önizleme → onay → kanalda PAYLAŞILMAZ → Murat'a özet
  o.g.length = 0;
  await fabrikaIsleri({ ...o.env, BOT_TOKEN: "k" }, Math.floor(Date.now() / 1000));
  const onizleme = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "222");
  assert.match(onizleme.govde.text, /^🧪 DENEME[\s\S]*Repete geldi – 9999[\s\S]*kanalda paylaşılmaz/);
  const { default: kemal } = await import("./worker.js");
  assert.ok(kemal);
  o.g.length = 0;
  const w = await import("./worker.js");
  await w.guncellemeIsle({ callback_query: { id: "c", from: { id: 222, first_name: "Merdan" }, data: onizleme.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 222 }, message_id: 3 } } }, { ...o.env, BOT_TOKEN: "k", ALLOWED_IDS: "111,222" });
  assert.equal(cagri(o.g, "copyMessages").length, 0); // kanalda paylaşım yok
  const ozet = cagri(o.g, "sendMessage").find((x) => /Fabrika denemesi bitti/.test(x.govde.text));
  assert.ok(ozet);
  assert.match(ozet.govde.text, /Hemra onayladı[\s\S]*Repete süresi seçildi: 2-3 gün[\s\S]*Kanalda hiçbir şey paylaşılmadı, hiçbir şey silinmedi/);
  // deneme gerçek renk hafızasına karışmadı
  const renk = await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "fabrika:renkler" }) })).json();
  assert.equal(renk.v, null);
});

test("Google tablosu hata verirse: 30 dk beklenir, son hata /tablo'da sade Türkçe; düzelince son yazma görünür", async () => {
  const { stokTablosu, googleHataAciklama, guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  o.env.GOOGLE_SA = JSON.stringify({ client_email: "sami@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  o.depo.set("sami:tablo:stok", "AAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 3, fiyat: 69 }], ist(8));
  let kapali = true;
  let istek = 0;
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (u.startsWith("https://sheets.googleapis.com/")) {
      istek++;
      if (kapali) return Response.json({ error: { code: 403, message: "Google Sheets API has not been used in project 493224151064 before or it is disabled." } }, { status: 403 });
      if (u.includes("?fields=sheets.properties")) return Response.json({ sheets: [{ properties: { sheetId: 0, title: "Sayfa1", gridProperties: {} } }] });
      return Response.json({});
    }
    return eski(url, init);
  };
  await stokTablosu(o.env, ist(10));
  const ilk = istek;
  await stokTablosu(o.env, ist(10, 5)); // 30 dk dolmadı → denenmez
  assert.equal(istek, ilk);
  assert.match(googleHataAciklama("Google Sheets API has not been used in project 493224151064 before or it is disabled"), /kapalı[\s\S]*Etkinleştir[\s\S]*493224151064/);
  o.g.length = 0;
  globalThis.fetch = (async (url, init) => (String(url).includes("api.telegram.org") ? (o.g.push({ metod: String(url).split("/").pop(), govde: JSON.parse(init.body) }), Response.json({ ok: true, result: { message_id: 1 } })) : (await (async () => globalThis.__f(url, init))())));
  globalThis.__f = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (u.startsWith("https://sheets.googleapis.com/")) { istek++; if (u.includes("?fields=sheets.properties")) return Response.json({ sheets: [{ properties: { sheetId: 0, title: "Sayfa1", gridProperties: {} } }] }); return Response.json({}); }
    return eski(url, init);
  };
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/tablo" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /Stok tablosu: bağlı ✅\n   son yazma: henüz yok\n   son hata: .*Google Sheets API bu Google projesinde kapalı/);
  kapali = false;
  await stokTablosu(o.env, ist(10, 40)); // 30 dk geçti → yazar
  o.g.length = 0;
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/tablo" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /son yazma: 28\.10\.2026 10:40\n   son hata: yok/);
  globalThis.fetch = eski;
});

test("Celal: listede Celal notu (iki kart notu); onayda CELAL modeli SADECE Celal'e ('VOLONTE' yazmadan), diğeri sadece fabrikaya; Celal başkasının modeline basamaz; /start → Celal olarak ekle; deneme 9998 sadece Celal'e", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
  o.depo.set("kodlar", JSON.stringify({ 3194: [{ ids: [500], tarih: 1 }], 5079: [{ ids: [510], tarih: 1 }] }));
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 4, fiyat: 70 }, { kod: "5079", adet: 1, fiyat: 50, celal: true, ikiKart: true }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3194", adet: 2 }, { kod: "5079", adet: 3 }] }) });
  // Celal /start → Murat "Celal olarak ekle"
  await g2({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Celal" }, text: "/start" } }, o.env);
  const soru = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111");
  assert.deepEqual(soru.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["🏭 Fabrika (Fuat'ın ekibi)", "👤 Celal'in ekibi", "📦 Mağaza: stok (VOLONTE)", "💲 Mağaza: sadece fiyat", "❌ Ekleme"]);
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: "fa:c:777", message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.equal(JSON.parse(o.depo.get("sami:fabrikaKisiler")).find((k) => k.id === 777).grup, "celal");
  const g = [];
  const tgc = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(20, 5), tgc);
  await fabrikaAdimi(o.env, ist(20, 15), tgc);
  assert.match(g[0].govde.text, /2 model, toplam 5 adet/);
  assert.ok(g.some((x) => x.metod === "copyMessage" && x.govde.caption === "🟦 VOLONTE\n5079 · satılan 3 · stok 1\n👤 Celal'in modeli\n⚠️ iki kartı var" && x.govde.reply_markup.inline_keyboard[0].length === 2));
  const gercek = Date.now;
  Date.now = () => ist(20, 20) * 1000;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3194 küçük siyah 4, 5079 büyük bej 5" } }, o.env);
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.match(kart.govde.text, /🏭 Fabrika[\s\S]*3194 — Küçük \(38-44\): siyah 4[\s\S]*👤 Celal:\n5079 — Büyük \(44-50\): bej 5/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const giden = [...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => [555, 777].includes(x.govde.chat_id));
  const nuri = giden.filter((x) => x.govde.chat_id === 555 && !/LİSTESİ –/.test(x.govde.text || "")).map((x) => x.govde.caption || x.govde.text);
  const celal = giden.filter((x) => x.govde.chat_id === 777).map((x) => x.govde.caption || x.govde.text);
  assert.deepEqual(nuri, ["🟦 VOLONTE\n3194 · Küçük (38-44) · siyah 4"]);
  assert.deepEqual(giden.filter((x) => x.govde.chat_id === 555 && /LİSTESİ –/.test(x.govde.text || "")).map((x) => x.govde.text), ["🟦 VOLONTE LİSTESİ – BAŞLANGIÇ (1 model)", "🟦 VOLONTE LİSTESİ – SONU (1 model)"]); // Celal'e mağaza başlığı gitmez
  assert.deepEqual(celal, ["5079 · Büyük (44-50) · bej 5"]); // VOLONTE yok, fiyat/stok/satış yok
  // Celal fabrika modeline basamaz
  const fabrikaMsj = giden.find((x) => x.govde.chat_id === 555 && x.govde.reply_markup);
  const fid = fabrikaMsj.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 777, first_name: "Celal" }, data: `fc:g:${fid}`, message: { chat: { id: 777 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery")[0].govde.text, /size ait değil/);
  // Celal kendi modeline cevap → bildirim 👤
  const cid = giden.find((x) => x.govde.chat_id === 777).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 777, first_name: "Celal" }, data: `fc:g:${cid}`, message: { chat: { id: 777 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /👤 Celal · 5079 → Gelecek/);
  // yazıyla başkasının modeli
  o.g.length = 0;
  await g2({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Celal" }, text: "3194 geldi" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /3194 sizin listenizde değil/);
  // deneme: 9998 sadece Celal'e
  o.g.length = 0;
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "/fabrikadeneme" } }, o.env);
  const dk = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333");
  assert.match(dk.govde.text, /9999 DENEME[\s\S]*👤 Celal:\n9998 CELAL DENEME/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: dk.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 333 }, message_id: 4 } } }, o.env);
  const dg = [...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => [555, 777].includes(x.govde.chat_id));
  assert.deepEqual(dg.filter((x) => x.govde.chat_id === 777).map((x) => x.govde.caption || x.govde.text), ["🧪 DENEME – üretim yapmayın\n9998 CELAL DENEME · siyah 1"]);
  assert.ok(dg.filter((x) => x.govde.chat_id === 555).every((x) => /9999 DENEME/.test(x.govde.caption || x.govde.text)));
  Date.now = gercek;
});

test("/eksik: sadece Murat ve Hemra; satışla liste hemen Hemra'ya; aynı gün ikinci kez gitmez; satış yoksa liste gitmez", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
  await o.yaz("VOLONTE", [{ kod: "3183", adet: 4, fiyat: 40 }], ist(8));
  const gercek = Date.now;
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  // satış yok: 20:05-20:55 bekler, 21:00'de "satış yok" (otomatik gitmez)
  for (const dk of [5, 15, 55]) await fabrikaAdimi(o.env, ist(20, dk), tg);
  assert.equal(g.length, 0);
  // /eksik: ekip üyesi (Aziz=333 değil) yazamaz
  Date.now = () => ist(20, 30) * 1000;
  o.env.EKIP_IDS = "333,444";
  await g2({ message: { chat: { id: 444, type: "private" }, from: { id: 444 }, text: "/eksik" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /sadece Murat ve Hemra/);
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "/eksik" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /satış görünmüyor/);
  // satış girildi → /eksik hemen gönderir
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-28", kalemler: [{ kod: "3183", adet: 5 }] }) });
  o.g.length = 0;
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "/eksik" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /bugün satılan modeller: 1 model, toplam 5 adet · Murat istedi/);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "333" && x.govde.text === "🟦 VOLONTE\n3183 · satılan 5 · stok 4\n📷 fotoğraf yok"));
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === 111).govde.text, /Hemra'ya gönderildi \(1 model\)/);
  // ikinci kez gitmez (ne /eksik ne otomatik)
  o.g.length = 0;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "/eksik" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /zaten gönderildi/);
  g.length = 0;
  await fabrikaAdimi(o.env, ist(20, 40), tg);
  await fabrikaAdimi(o.env, ist(20, 50), tg);
  assert.ok(!g.some((x) => /bugün satılan/.test(x.govde.text || "")));
  Date.now = gercek;
});

test("bir kerelik: eski düzendeki liste iptal, aynı günün satışları yeni düzende yeniden (işaret bir kez çalışır)", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3183", adet: 2 }, { kod: "3194", adet: 1 }] }) });
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "soruldu", zaman: ist(14) }) }) });
  o.depo.set("fabrika:yenidenGonder", gun);
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(19, 30), tg);
  assert.match(g[0].govde.text, /eski düzen\) iptal edildi/);
  assert.match(g[1].govde.text, /2 model, toplam 3 adet/);
  assert.equal(g.length, 5); // not + özet + 2 model + BİTTİ
  assert.deepEqual(JSON.parse(o.depo.get("fabrika:yenidenSonuc")).model, 2);
  assert.ok(!o.depo.has("fabrika:yenidenGonder"));
  g.length = 0;
  await fabrikaAdimi(o.env, ist(19, 45), tg);
  assert.equal(g.length, 0); // ikinci kez gitmez
});

test("fotoğraf tamamlama: sitede yoksa kanal fotoğrafı (yazısı değiştirilerek); Hemra'nın seçimi korunur", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
  const gun = "2026-10-28";
  const kayit = { asama: "soruldu", zaman: ist(19), modeller: [{ kod: "3194", satilan: 2, kalan: 4, grup: "fabrika" }, { kod: "3999", satilan: 1, kalan: 0, grup: "fabrika" }], secim: { 3194: { renkler: [{ renk: "siyah", adet: 5 }] } }, mesajlar: { 3194: [1, "metin", "x"], 3999: [2, "metin", "y"] }, gonderilmedi: [], bilinen: ["3194", "3999"] };
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify(kayit) }) });
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3194", adet: 2 }, { kod: "3999", adet: 1 }] }) });
  o.depo.set("fabrika:fotoTamamla", gun);
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 70 } }; };
  await fabrikaAdimi(o.env, ist(19, 40), tg);
  const kopya = g.find((x) => x.metod === "copyMessage");
  assert.equal(kopya.govde.message_id, 500); // kanaldaki en yeni paylaşım
  assert.match(kopya.govde.caption, /^3194 · satılan 2 · stok 4\n\n📏 Beden seçilmedi \(yazdığınız: siyah 5\)$/); // eski seçim korunur, beden bekler
  const sonuc = JSON.parse(o.depo.get("fabrika:fotoSonuc"));
  assert.deepEqual(sonuc.sonuc, { 3194: "kanal", 3999: "yok" });
  assert.deepEqual(sonuc.secimler, ["3194"]); // seçim korundu
});

// ---------- Sami'nin beyni (Opus) ----------
function beyinOrtami(cevaplar) {
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", ANTHROPIC_API_KEY: "k" });
  o.claude = [];
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => {
    if (String(url).startsWith("https://api.anthropic.com")) {
      o.claude.push(JSON.parse(istek.body));
      const c = cevaplar.shift();
      return Response.json({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", usage: { input_tokens: 1000, output_tokens: 200 }, ...c });
    }
    return onceki(url, istek);
  };
  return o;
}
const metinCevap = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
const aracCevap = (name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }] });

test("Sami beyni: normal soru → Opus araçla stok okur; araç sonucunda fiyat yok; fabrika kişisi beyni kullanamaz", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = beyinOrtami([aracCevap("stok_bilgisi", { kod: "3596" }), metinCevap("3596'dan 12 adet kaldı.")]);
  await o.yaz("VOLONTE", [{ kod: "3596", adet: 12, fiyat: 77 }], ist(8));
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "3596'dan kaç tane kaldı?" } }, o.env);
  assert.equal(o.claude[0].model, "claude-opus-5-5");
  const sonuc = o.claude[1].messages.at(-1).content[0].content;
  assert.match(sonuc, /"toplam":12/);
  assert.ok(!/77|fiyat/.test(sonuc)); // fiyat beyne hiç gitmez
  assert.equal(cagri(o.g, "sendMessage").at(-1).govde.text, "3596'dan 12 adet kaldı.");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  const n = o.claude.length;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Nuri" }, text: "bugün ne sattık?" } }, o.env);
  assert.equal(o.claude.length, n);
});

test("Sami beyni: Hemra serbest yazı ('siyahtan 5', 'bu sefer isteme') listeye işlenir, hepsi bitince onay kartı; düz liste eski yoldan", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = beyinOrtami([
    aracCevap("eksik_listesine_isle", { kararlar: [{ kod: "3254", beden: "kucuk", renkler: [{ renk: "siyah", adet: 5 }, { renk: "bej", adet: 3 }], renkler_buyuk: [], isteme: false, onceki_gibi: false }], hepsini_onceki_gibi: false }),
    metinCevap("3254: siyah 5, bej 3 işlendi. Kalan: 3297."),
    aracCevap("eksik_listesine_isle", { kararlar: [{ kod: "3297", beden: "", renkler: [], renkler_buyuk: [], isteme: true, onceki_gibi: false }], hepsini_onceki_gibi: false }),
    metinCevap("3297 bu sefer istenmeyecek. Liste tamam, onay kartı gönderildi."),
  ]);
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  const kayit = { asama: "soruldu", zaman: Math.floor(Date.now() / 1000), modeller: [{ kod: "3254", satilan: 4, kalan: 2, grup: "fabrika" }, { kod: "3297", satilan: 1, kalan: 0, grup: "fabrika" }], secim: {}, mesajlar: {}, gonderilmedi: [] };
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify(kayit) }) });
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3254 küçükten siyahtan 5, bejden 3" } }, o.env);
  assert.equal(o.claude.length, 2); // düz liste değil → beyin
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3297'yi bu sefer isteme" } }, o.env);
  const kart = cagri(o.g, "sendMessage").find((x) => /Gidecek liste/.test(x.govde.text));
  assert.match(kart.govde.text, /3254 — Küçük \(38-44\): siyah 5, bej 3[\s\S]*⏭ Bu sefer istenmeyen: 3297/);
  // düz liste: beyin çağrılmaz
  const n = o.claude.length;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3254 siyah 6" } }, o.env);
  assert.equal(o.claude.length, n);
});

test("Sami beyni: aylık 10 $ sınır — 8 $'da Murat'a uyarı, dolunca beyin durur (komutlar çalışır); Aziz araçla listeye işleyemez", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = beyinOrtami([metinCevap("Merhaba"), aracCevap("eksik_listesine_isle", { kararlar: [], hepsini_onceki_gibi: true }), metinCevap("Bunu Hemra yapabilir.")]);
  o.env.EKIP_IDS = "333,444";
  const ayK = `beyin:harcama:${new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 7)}`;
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: ayK, v: "7.9999" }) });
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "selam" } }, o.env);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111" && /%80/.test(x.govde.text)));
  await g2({ message: { chat: { id: 444, type: "private" }, from: { id: 444, first_name: "Aziz" }, text: "hepsini önceki gibi iste" } }, o.env);
  assert.match(o.claude.at(-1).messages.at(-1).content[0].content, /Kontrol kartınızdaki model için/); // 10 Kasım: "sadece Hemra ve Murat" yok
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: ayK, v: "10" }) });
  const n = o.claude.length;
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "bugün ne sattı?" } }, o.env);
  assert.equal(o.claude.length, n);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /bütçesi \(10 \$\) doldu/);
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "/stok" } }, o.env);
  assert.ok(cagri(o.g, "sendMessage").length > 0);
});

test("beden: İkisi de → küçük ve büyük ayrı sorulur; ikisi yazılınca karta iki satır, fabrikaya iki ayrı mesaj; renk hafızası bedenle", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("kodlar", JSON.stringify({ 3254: [{ ids: [720], tarih: 1 }] }));
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  const kayit = { asama: "soruldu", zaman: Math.floor(Date.now() / 1000), modeller: [{ kod: "3254", satilan: 4, kalan: 2, grup: "fabrika" }], secim: {}, mesajlar: {}, gonderilmedi: [] };
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify(kayit) }) });
  const bas = (data) => g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data, message: { chat: { id: 333 }, message_id: 9 } } }, o.env);
  const yaz = (text) => g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text } }, o.env);
  await bas(`fe:i:${gun}:3254`);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3254: Küçük ve Büyük için ayrı ayrı renk\/adet yazın/);
  await yaz("3254 küçük siyah 10 bej 6");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Kalan \(1\): 3254 \(büyük renkleri bekleniyor\)/);
  await yaz("3254 büyük siyah 5");
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.match(kart.govde.text, /3254 — Küçük \(38-44\): siyah 10, bej 6\n3254 — Büyük \(44-50\): siyah 5/);
  o.g.length = 0;
  await bas(`fb:o:${gun}`);
  const nuri = cagri(o.g, "copyMessage").filter((x) => x.govde.chat_id === 555).map((x) => x.govde.caption);
  assert.deepEqual(nuri, ["🟦 VOLONTE\n3254 · Küçük (38-44) · siyah 10 · bej 6", "🟦 VOLONTE\n3254 · Büyük (44-50) · siyah 5"]);
  const son = await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "fabrika:sonIstek" }) }).then((r) => r.json());
  assert.deepEqual(JSON.parse(son.v)["3254"], { beden: "i", gruplar: { k: [{ renk: "siyah", adet: 10 }, { renk: "bej", adet: 6 }], b: [{ renk: "siyah", adet: 5 }] } });
});

test("bir kerelik beden ekleme: bedeni olmayan modellere düğmeli mesaj; yazılanlar korunur; beden yokken gelen kart geçersiz", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
  const gun = "2026-10-28";
  const kayit = { asama: "onayda", zaman: ist(19), modeller: [{ kod: "3628", satilan: 2, kalan: 4, grup: "fabrika" }, { kod: "3297", satilan: 1, kalan: 0, grup: "fabrika" }, { kod: "3394", satilan: 1, kalan: 3, grup: "fabrika" }], secim: { 3628: { renkler: [{ renk: "siyah", adet: 5 }] }, 3394: { isteme: true } }, mesajlar: {}, gonderilmedi: [] };
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify(kayit) }) });
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3628", adet: 2 }, { kod: "3297", adet: 1 }, { kod: "3394", adet: 1 }] }) });
  o.depo.set("fabrika:bedenEkle", gun);
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 80 + g.length } }; };
  await fabrikaAdimi(o.env, ist(19, 50), tg);
  assert.match(g[0].govde.text, /Beden seçimi eklendi/);
  assert.equal(g[1].govde.text, "📏 3628 — beden seçin\n(yazdığınız: siyah 5)");
  assert.equal(g[2].govde.text, "📏 3297 — beden seçin");
  assert.equal(g.length, 3); // 3394 "isteme" → atlandı
  const sonuc = JSON.parse(o.depo.get("fabrika:bedenSonuc"));
  assert.deepEqual([sonuc.gonderilen, sonuc.atlanan], [["3628", "3297"], ["3394"]]);
  const d = JSON.parse((await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}` }) }).then((r) => r.json())).v);
  assert.equal(d.asama, "soruldu");
  assert.deepEqual(d.secim["3628"], { renkler: [{ renk: "siyah", adet: 5 }] }); // silinmedi
});

test("fabrikaya fotoğrafsız mesaj gitmez: sitede ve kanalda fotoğraf yoksa Murat'a 'fotoğraf bulunamadı'", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  const kayit = { asama: "onayda", zaman: Math.floor(Date.now() / 1000), modeller: [{ kod: "3606", satilan: 2, kalan: 1, grup: "fabrika" }], secim: { 3606: { beden: "b", gruplar: { b: [{ renk: "kırmızı", adet: 8 }] } } }, liste: [{ kod: "3606", beden: "b", renkler: [{ renk: "kırmızı", adet: 8 }] }], gruplar: { 3606: "fabrika" }, mesajlar: {}, gonderilmedi: [] };
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify(kayit) }) });
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  assert.equal([...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => x.govde.chat_id === 555 && !/LİSTESİ –/.test(x.govde.text || "")).length, 0);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111" && /^📷 3606 fotoğraf bulunamadı — fabrikaya gönderilmedi \(🟦 VOLONTE\n3606 · Büyük \(44-50\) · kırmızı 8\)/.test(x.govde.text)));
});

test("Black Rose eksik listesi: gün içinde Merdan'a mesaj yok; 19:05 sonrası (10 dk sabit) tek liste Merdan'a; Merdan onaylar (Hemra değil); onaylamazsa Murat'a 'Merdan onaylamadı'", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222" });
  o.depo.set("sami:satisAcik", "1");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  o.depo.set("kodlar", JSON.stringify({ 7001: [{ ids: [900], tarih: 1 }], 3183: [{ ids: [700], tarih: 1 }] }));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun, kalemler: [{ kod: "7001", adet: 3 }] }) });
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 60 + g.length } }; };
  for (const [hh, mm] of [[11, 0], [11, 15], [18, 0], [19, 0]]) await fabrikaAdimi(o.env, ist(hh, mm), tg);
  assert.equal(g.length, 0); // gün içinde Merdan'a hiçbir şey yok
  await fabrikaAdimi(o.env, ist(19, 10), tg);
  assert.equal(g.length, 0); // ilk görüş: 10 dk sabit beklenir
  await fabrikaAdimi(o.env, ist(19, 20), tg);
  assert.equal(g[0].govde.chat_id, "222");
  assert.match(g[0].govde.text, /BLACK ROSE — bugün satılan modeller: 1 model, toplam 3 adet/);
  assert.ok(g.every((x) => x.govde.chat_id === "222")); // Hemra'ya Black Rose listesi gitmez
  // Hemra Black Rose listesine yazamaz / onaylayamaz; Merdan yazar ve onaylar
  const gercek = Date.now; Date.now = () => ist(19, 30) * 1000;
  try {
    o.g.length = 0;
    await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "7001 küçük siyah 5" } }, o.env);
    assert.ok(!cagri(o.g, "sendMessage").some((x) => /Gidecek liste/.test(x.govde.text)));
    await g2({ message: { chat: { id: 222, type: "private" }, from: { id: 222, first_name: "Merdan" }, text: "7001 küçük siyah 5" } }, o.env);
    await teyitEt(o, g2, 222, "Merdan", /Şunu anladım: 7001 Küçük siyah 5\. Doğru mu\?/);
    await eminim(o, g2, 222, "Merdan", /^🌹 BLACK ROSE listesi: 1 model — 1 istendi, 0 istenmedi, 0 bot hatası\. Göndereyim mi\?$/);
    // 10 Kasım (yeni düzen): Merdan KONTROL eder → Sami toplu listeyi Hemra'nın onayına gönderir (Merdan onaylamaz)
    assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "222" && /Kontrol bitti/.test(x.govde.text)));
    const kart = cagri(o.g, "sendMessage").find((x) => /Gidecek liste/.test(x.govde.text));
    assert.equal(kart.govde.chat_id, "333");
    assert.match(kart.govde.text, /Gidecek liste \(28\.10\.2026\) — Black Rose: Merdan kontrol etti:[\s\S]*7001 — Küçük \(38-44\): siyah 5/);
    const onay = kart.govde.reply_markup.inline_keyboard[0][0].callback_data;
    assert.equal(onay, `fb:o:${gun}-T1`);
    await g2({ callback_query: { id: "c", from: { id: 222, first_name: "Merdan" }, data: onay, message: { chat: { id: 222 }, message_id: 2 } } }, o.env);
    assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Hemra'da/);
    o.g.length = 0;
    await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: onay, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
    assert.equal(cagri(o.g, "copyMessage").find((x) => x.govde.chat_id === 555).govde.caption, "🌹 BLACK ROSE\n7001 · Küçük (38-44) · siyah 5");
    const fg = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "fabrikaGitti" }) })).json();
    assert.deepEqual(fg.map((x) => x.metin), ["Bugünkü eksik listesi fabrikaya gitti: VOLONTE 0 model, Black Rose 1 model."]); // 10 Kasım: Patron'a tek satır (Venom'dan)
  } finally { Date.now = gercek; }
  // Ertesi gün: onaylanmazsa Murat'a "Merdan onaylamadı"
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun: "2026-10-29", kalemler: [{ kod: "7001", adet: 1 }] }) });
  g.length = 0;
  await fabrikaAdimi(o.env, ist(19, 10, 1), tg);
  await fabrikaAdimi(o.env, ist(19, 20, 1), tg);
  await fabrikaAdimi(o.env, ist(20, 25, 1), tg);
  assert.ok(g.some((x) => x.govde.chat_id === "222" && /⏰ 29\.10\.2026 Black Rose eksik listesi: şu 1 model kaldı: 7001/.test(x.govde.text)));
  await fabrikaAdimi(o.env, ist(21, 25, 1), tg);
  assert.ok(g.some((x) => x.govde.chat_id === "111" && /Black Rose eksik listesi: Merdan onaylamadı/.test(x.govde.text)));
});

test("Black Rose stok sorgusu: Fuat /stok → Hemra onayı; sade kod, sadece B stoğu; 1 saat → Murat; 2000 ve Sinem/Celal yok; günde 10; kayıt", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { stokSorguTakip } = await import("./stoksorgu.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }, { id: 502, ad: "Sinem" }, { id: 503, ad: "Celal", grup: "celal" }]));
  // VOLONTE'de 3900 (B'siz) 7 adet; Black Rose'da 3900B + 3900B20 → 24 adet. Fuat'a sadece 24 gider.
  await o.yaz("VOLONTE", [{ kod: "3900", adet: 7, fiyat: 40 }], ist(8));
  await o.yaz("BLACKROSE", [{ kod: "3900", adet: 24, fiyat: 45, brAdet: 24 }, { kod: "908", adet: 5, fiyat: 30, brAdet: 5 }, { kod: "2000", adet: 140, fiyat: 5 }], ist(8));
  const mesaj = (id, text) => g2({ message: { chat: { id, type: "private" }, from: { id, first_name: "X" }, text } }, o.env);
  const son = (chat) => cagri(o.g, "sendMessage").filter((x) => String(x.govde.chat_id) === String(chat)).at(-1);

  // Yetki Murat'ta: /stokyetki → Fuat'a ver (Celal listede yok)
  await mesaj(111, "/stokyetki");
  const ekran = son(111);
  assert.deepEqual(ekran.govde.reply_markup.inline_keyboard.map((r) => r[0].text), ["⛔ Fuat", "⛔ Sinem"]);
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: "sy:501", message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.ok(!o.depo.has("sami:stokSorguIds")); // Hemra veremez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: "sy:503", message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.ok(!o.depo.has("sami:stokSorguIds")); // Celal'e verilemez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: "sy:501", message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.deepEqual(JSON.parse(o.depo.get("sami:stokSorguIds")), ["501"]);

  // Sinem ve Celal sorgulayamaz
  o.g.length = 0;
  await mesaj(502, "/stok 3900");
  await mesaj(503, "/stok 3900");
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "333"));
  assert.ok(!JSON.stringify(o.g).includes("24"));

  // Fuat: 2000 sorgulanamaz
  await mesaj(501, "/stok 2000");
  assert.equal(son(501).govde.text, "2000 kodu sorgulanamaz.");

  // Fuat /stok 3900 → cevap hemen gitmez, Hemra'ya onay
  o.g.length = 0;
  Date.now = () => ist(14) * 1000;
  await mesaj(501, "/stok 3900");
  const soru = son(333);
  assert.equal(soru.govde.text, "🔎 Fuat 3900 stoğunu soruyor\nBlack Rose mağazası: 24 adet");
  assert.deepEqual(soru.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Göster", "❌ Gösterme"]);
  assert.match(son(501).govde.text, /iletildi/);
  assert.ok(!son(501).govde.text.includes("24"));
  const id = soru.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  // Hemra gösterir → Fuat'a sade kod + sadece Black Rose stoğu
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: `sq:g:${id}`, message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.equal(son(501).govde.text, "📦 3900\nBlack Rose mağazası: 24 adet");
  assert.ok(!/B20|3900B|VOLONTE|\$|fiyat|satı/i.test(son(501).govde.text));
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `sq:x:${id}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Hemra zaten karar verdi/);

  // Hemra 1 saat cevap vermezse Murat'a; Murat "Gösterme" → Fuat'a bilgi yok
  o.g.length = 0;
  await mesaj(501, "/stok 908");
  const id2 = son(333).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await stokSorguTakip(o.env, ist(14, 30), async (e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; });
  assert.ok(!son(111));
  const tgc = async (e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; };
  await stokSorguTakip(o.env, ist(15, 1), tgc);
  assert.match(son(111).govde.text, /🔎 Fuat 908 stoğunu soruyor\n[^\n]*mağazası: 5 adet\n\(Hemra 1 saattir cevap vermedi\)/);
  await stokSorguTakip(o.env, ist(15, 10), tgc);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "111").length, 1); // bir kez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `sq:x:${id2}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.equal(son(501).govde.text, "908: stok bilgisi şu an paylaşılamıyor.");

  // Günde en fazla 10 sorgu (bugün 2 yapıldı + 2000 sayılmaz)
  for (let i = 0; i < 8; i++) await mesaj(501, "/stok 3900");
  o.g.length = 0;
  await mesaj(501, "/stok 3900");
  assert.match(son(501).govde.text, /sınırına ulaştınız \(10\)/);
  assert.ok(!son(333));

  // Kayıt: /sorgular (Murat)
  await mesaj(111, "/sorgular");
  const kayit = son(111).govde.text;
  assert.match(kayit, /Stok sorguları \(son 3 gün, 10\)/);
  assert.match(kayit, /28\.10 14:00 · Fuat · 3900 · ✅ gösterildi \(Hemra\)/);
  assert.match(kayit, /Fuat · 908 · ❌ gösterilmedi \(Murat\)/);
  // 24 saatte cevap yoksa düşer: Fuat'a "cevap verilmedi", butonlar kapanır
  o.g.length = 0;
  await stokSorguTakip(o.env, ist(15, 0, 1), async (e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; });
  assert.match(son(501).govde.text, /3900: sorunuza cevap verilmedi/);
  assert.match(cagri(o.g, "editMessageText")[0].govde.text, /⌛ Cevap verilmedi/);
});

test("site haftalık özet: pazartesi 09:35'ten sonra bir kez, sadece Murat'a; ülke, dil, modeller", async () => {
  const { siteHaftalik, siteOzetMetni } = await import("./site-ozet.js");
  const o = ortam();
  const satirlar = [{ tur: "ulke", anahtar: "NG", n: 40 }, { tur: "ulke", anahtar: "KE", n: 10 }, { tur: "dil", anahtar: "en", n: 30 }, { tur: "dil", anahtar: "fr", n: 20 }, { tur: "model", anahtar: "3609", n: 12 }, { tur: "model", anahtar: "3630", n: 7 }];
  let sorulan = null;
  o.env.SITE_IC = { ozet: async (bas, bit) => { sorulan = [bas, bit]; return satirlar; } };
  const g = [];
  const tg = async (env, metod, govde) => { g.push(govde); return { ok: true }; };
  const pazartesi = Date.UTC(2026, 10, 2, 6, 40) / 1000; // 2 Kasım 2026 Pazartesi 09:40 (TR)
  await siteHaftalik(o.env, pazartesi - 600, tg, "111"); // 09:30: henüz değil
  assert.equal(g.length, 0);
  await siteHaftalik(o.env, pazartesi, tg, "111");
  await siteHaftalik(o.env, pazartesi + 300, tg, "111");
  assert.equal(g.length, 1);
  assert.equal(g[0].chat_id, "111");
  assert.deepEqual(sorulan, ["2026-10-26", "2026-11-01"]);
  assert.equal(g[0].text, siteOzetMetni(satirlar, "2026-10-26", "2026-11-01"));
  assert.match(g[0].text, /Ziyaret: 50\nÜlkeler: Nijerya 40 · Kenya 10\nDil: EN %60 · FR %40\nEn çok bakılan modeller: 3609 \(12\), 3630 \(7\)/);
});

test("Patron hesabı: MURAT_ID listesinde iki hesap; ikisi de Murat yetkisinde, mesajlar ilk hesaba (Patron)", async () => {
  const { murat, muratMi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999,111", FABRIKA_SORUMLU: "333", ALLOWED_IDS: "111,222,999" });
  assert.equal(murat(o.env), "999");
  assert.ok(muratMi(o.env, 111) && muratMi(o.env, "999") && !muratMi(o.env, 333));
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }]));
  for (const id of [999, 111]) {
    o.g.length = 0;
    await g2({ message: { chat: { id, type: "private" }, from: { id, first_name: "Murat" }, text: "/stokyetki" } }, o.env);
    assert.match(cagri(o.g, "sendMessage")[0].govde.text, /stok sorgusu yetkisi/); // eski ve yeni hesap: ikisi de Murat
  }
  o.g.length = 0;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333 }, text: "/stokyetki" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /sadece Murat/);
});

test("paylaşılmamış stok: Hemra'ya fotoğrafı olmayanlar (sadece yeni girince), pazartesi 09:30 Patron'a 14+ gün listesi; pazar mesaj yok; 2000 hariç", async () => {
  const { paylasimTakip, paylasimDurumu, sonPaylasimlar } = await import("./paylasim-takip.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999,111", FABRIKA_SORUMLU: "333" });
  // 3000: hiç paylaşılmamış, sitede yok → fotoğrafı yok · 3622: hiç paylaşılmamış ama sitede var · 3194: 20 gün önce · 3100: dün · 2000 indirimli
  await o.yaz("VOLONTE", [{ kod: "3000", adet: 5, fiyat: 20 }, { kod: "3622", adet: 4, fiyat: 30 }, { kod: "3194", adet: 3, fiyat: 69 }, { kod: "3100", adet: 2, fiyat: 30 }, { kod: "2000", adet: 50, fiyat: 5 }], 1);
  const pzt = Date.UTC(2026, 10, 2, 6, 31) / 1000; // 2 Kasım 2026 pazartesi 09:31
  o.depo.set("kodlar", JSON.stringify({ 3194: [{ ids: [1], tarih: pzt - 20 * 86400 }], 3100: [{ ids: [2], tarih: pzt - 86400 }] }));
  globalThis.fetch = ((eski) => async (url, istek) => (String(url).includes("veri/urunler.json") ? Response.json([{ kod: "3622", fotolar: ["galeri/3622/2.jpg"] }, { kod: "3194", fotolar: ["galeri/3194/1.jpg"] }]) : eski(url, istek)))(globalThis.fetch);
  const d = paylasimDurumu({ tum: await (await o.env.STOK.get().fetch("https://stok/tum", { method: "POST", body: "{}" })).json(), site: [{ kod: "3622", fotolar: ["x"] }], son: sonPaylasimlar(JSON.parse(o.depo.get("kodlar"))), simdi: pzt });
  assert.deepEqual(d.hic, ["3000", "3622"]);
  assert.deepEqual(d.fotoYok, ["3000"]);
  assert.deepEqual(d.eski, [["3194", 20]]);
  const g = [];
  const tg = async (env, metod, govde) => { g.push(govde); return { ok: true }; };
  await paylasimTakip(o.env, pzt - 86400, tg); // pazar: hiçbir şey
  assert.equal(g.length, 0);
  await paylasimTakip(o.env, pzt, tg); // pazartesi 09:31: Patron'a (MURAT_ID'nin ilki)
  assert.equal(g.length, 1);
  assert.equal(g[0].chat_id, "999");
  assert.match(g[0].text, /14\+ gündür paylaşılmayan modeller: 3\nHiç paylaşılmamış \(2\): 3000, 3622\n14\+ gün \(1\): 3194 \(20 g\)/);
  assert.ok(!/2000/.test(g[0].text));
  await paylasimTakip(o.env, pzt + 3600, tg); // 10:31: Hemra'ya fotoğrafı yok listesi
  assert.equal(g.length, 2);
  assert.equal(g[1].chat_id, "333");
  assert.match(g[1].text, /Fotoğrafı yok, çekilmeli[\s\S]*1 model:\n🆕 3000/);
  await paylasimTakip(o.env, pzt + 86400 + 3600, tg); // ertesi gün aynı liste: tekrar gitmez
  assert.equal(g.length, 2);
});

test("eksik listesi: 1 saatte bazı modellerde karar varsa sadece kalanlar sorulur; mal 'geldi' + 2 saat Vegawin'de yoksa liste sahibine sorulur", async () => {
  const { fabrikaAdimi, siparisTakip } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  await o.yaz("VOLONTE", [{ kod: "3183", adet: 4, fiyat: 40 }, { kod: "3186", adet: 2, fiyat: 30 }, { kod: "3190", adet: 1, fiyat: 30 }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3183", adet: 8 }, { kod: "3186", adet: 2 }, { kod: "3190", adet: 1 }] }) });
  o.depo.set("sami:satisAcik", "1");
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 70 + g.length } }; };
  await fabrikaAdimi(o.env, ist(14, 0), tg);
  await fabrikaAdimi(o.env, ist(14, 10), tg); // liste gider
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fe:x:${gun}:3186`, message: { chat: { id: 333 }, message_id: 9 } } }, o.env); // 3186 kararı verildi
  g.length = 0;
  await fabrikaAdimi(o.env, ist(15, 10), tg);
  assert.match(g[0].govde.text, /şu 2 model kaldı: 3183, 3190/);
  assert.deepEqual(g.slice(1).map((x) => x.govde.text.split(" ")[1]), ["3183", "3190"]);
  assert.ok(g.slice(1).every((x) => x.govde.reply_markup.inline_keyboard[0].length === 2));
});

test("mal girişi: fabrikadan 'geldi' + 2 saat Vegawin'de stok artmadıysa Hemra'ya (Black Rose modeli ise Merdan'a) sorulur; arttıysa sorulmaz", async () => {
  const { siparisTakip } = await import("./fabrika.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222" });
  await o.yaz("VOLONTE", [{ kod: "3183", adet: 4, fiyat: 40 }, { kod: "3186", adet: 2, fiyat: 30 }], ist(8));
  await o.yaz("BLACKROSE", [{ kod: "7001", adet: 0, fiyat: 30 }], ist(8));
  const T = ist(12);
  const yaz = (rec) => o.env.STOK.get().fetch("https://stok/fs-yaz", { method: "POST", body: JSON.stringify({ rec, kapali: true, takip: T + 7200, hafta: null, ozet: {} }) });
  for (const [kod, geldiStok] of [["3183", 4], ["3186", 1], ["7001", 0]]) await yaz({ id: `${kod}-x`, kod, durum: "geldi", geldiZaman: T, geldiStok, bildiren: "Nuri", gonderim: T - 3600, mesajlar: [], log: [] });
  const g = [];
  const tg = async (env, metod, govde) => { g.push(govde); return { ok: true, result: { message_id: 1 } }; };
  await siparisTakip(o.env, T + 3600, tg);
  assert.equal(g.length, 0); // 2 saat dolmadı
  await siparisTakip(o.env, T + 7300, tg);
  const sorulan = g.map((x) => [x.chat_id, x.text.split(" ")[1]]);
  assert.deepEqual(sorulan.sort(), [["222", "7001"], ["333", "3183"]]); // 3186 stoğu arttı (1 → 2): sorulmaz
  assert.match(g.find((x) => x.chat_id === "333").text, /3183 fabrikadan geldi \(Nuri, 12:00\) ama Vegawin'de 2 saattir stoğu görünmüyor\. Vegawin'e giriş yapıldı mı\?/);
  g.length = 0;
  await siparisTakip(o.env, T + 9000, tg);
  assert.equal(g.length, 0); // bir kez sorulur
});

test("Black Rose kodları iki mağazadan: B kartları + /brsay listesi; Fuat sorgusunda dağılım; 2000 hariç", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999,111", FABRIKA_SORUMLU: "333", ALLOWED_IDS: "999,111,222" });
  await o.yaz("BLACKROSE", [{ kod: "3634", adet: 20, fiyat: 40, brAdet: 20 }, { kod: "908", adet: 6, fiyat: 30 }, { kod: "2000", adet: 99, fiyat: 5, brAdet: 99 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3634", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  const br = async () => (await o.env.STOK.get().fetch("https://stok/br-stoklar", { method: "POST", body: "{}" })).json();
  assert.deepEqual(await br(), { BLACKROSE: [["3634", 20]], VOLONTE: [["3634", 4]] }); // VOLONTE'nin kendi 3194'ü ve 2000 yok
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/brsay 908" } }, o.env); // Patron: 908 Black Rose say
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /\(1\): 908/);
  assert.deepEqual((await br()).BLACKROSE, [["908", 6], ["3634", 20]]);
  o.g.length = 0;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333 }, text: "/brsay 3194" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /sadece Patron/);
  // Fuat sorgusu: dağılım
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }]));
  o.depo.set("sami:stokSorguIds", JSON.stringify(["501"]));
  o.g.length = 0;
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "/stok 3634" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /Fuat 3634 stoğunu soruyor\nBlack Rose mağazası: 20 adet\nVOLONTE mağazası: 4 adet$/); // iki mağaza ayrı satır, toplam yok
});

test("mutabakat: 17:00 önizleme SADECE Patron'a (yeni düzen, 3 sütun); Patron onaylamadan Fuat'a hiçbir şey gitmez; gönder → Fuat (süzgeç) + PDF Patron'a; Uyuşmuyor → açıklama; Sonra → hatırlatma; değiştirilemez arşiv", async () => {
  const { mutabakatAdimi } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999,111", FABRIKA_SORUMLU: "333", FUAT_ID: "501" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }, { id: 502, ad: "Nuri" }]));
  await o.yaz("BLACKROSE", [{ kod: "3634", adet: 20, fiyat: 40, brAdet: 20 }, { kod: "3557", adet: 200, fiyat: 40, brAdet: 200 }, { kod: "3601", adet: 7, fiyat: 40, brAdet: 7 }, { kod: "3602", adet: 12, fiyat: 40, brAdet: 12 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3634", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  const ayar = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k, v: JSON.stringify(v) }) });
  const h = (anahtar, kart) => ({ anahtar, ad: `BLACK ROSE ${anahtar}`, kart, donemler: {} });
  await ayar("cari:BLACKROSE", { zaman: 1, hesaplar: [h("15", -100), h("20", -200), h("25", 0), h("00", -50)] });
  await ayar("cari:VOLONTE", { zaman: 1, hesaplar: [h("15", 100), h("20", 200), h("25", 0), h("00", 50)] });
  await ayar("odeme:liste", [{ id: "a", zaman: 1793600000, tutar: 5000, hesap: "20", not: "nakit", foto: "F1" }]);
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 40 + g.length } }; };
  const cuma = Date.UTC(2026, 10, 6, 14, 1) / 1000; // 6 Kasım 2026 cuma 17:01
  await mutabakatAdimi(o.env, cuma - 3600, tg);
  assert.equal(g.length, 0); // 16:01: henüz değil
  await mutabakatAdimi(o.env, cuma, tg);
  assert.ok(g.length >= 2 && g.every((x) => x.govde.chat_id === "999")); // sadece Patron
  assert.match(g[0].govde.text, /ÖNİZLEME.*sadece siz görüyorsunuz\. Siz onaylamadan Fuat'a hiçbir şey gitmez/);
  const on = g.at(-1).govde;
  assert.equal(on.parse_mode, "HTML");
  const BEKLENEN1 = "📊 BLACK ROSE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 50,00 $\nBlack Rose 15: 100,00 $\nBlack Rose 20: 200,00 $\nBlack Rose 25: 0,00 $\nToplam: 350,00 $";
  const BEKLENEN = "📊 VOLONTE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 50,00 $\nBlack Rose 15: 100,00 $\nBlack Rose 20: 200,00 $\nBlack Rose 25: 0,00 $\nToplam: 350,00 $\n\nBundan sonra tüm hesaplar sistem üzerinden, şeffaf ve kayıt altında yürüyecek.\nİyi çalışmalar.\n– Sami";
  // Patron önizlemesinde adetler görünür (sadece Patron); Fuat'ın mesajlarında adet listesi YOK
  const patronMetni = g.map((x) => x.govde.text).join("\n");
  assert.match(patronMetni, /📦 Adetler — SADECE SİZ görüyorsunuz[\s\S]*📦 BLACK ROSE MAĞAZASI – 4 model · 239 adet\n<pre>3557 · 200 adet   3601 ·   7 adet   3602 ·  12 adet\n3634 ·  20 adet<\/pre>/);
  assert.match(patronMetni, /📦 VOLONTE MAĞAZASI – 1 model · 4 adet\n<pre>3634 · 4 adet<\/pre>/);
  assert.equal(g.at(-2).govde.text, BEKLENEN1); // MESAJ 1: BLACK ROSE (birebir)
  assert.equal(on.text, BEKLENEN); // MESAJ 2: VOLONTE (birebir) — iki ayrı mesaj, düğme sonda
  assert.ok(!g.at(-2).govde.reply_markup);
  assert.match(g[0].govde.text, /Fuat'a SADECE en alttaki iki bakiye mesajı \(1: BLACK ROSE, 2: VOLONTE\) BİREBİR böyle gider; adet listeleri gitmez/);
  assert.match(g[0].govde.text, /💵 Son ödemeler \(sadece siz\):\n.*5\.000,00 \$ · Black Rose 20 · elle · nakit · 📎 dekont/);
  assert.deepEqual(on.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Fuat'a gönder"]); // tek düğme
  assert.ok(!/fark|FARK|karşılaştır|ödeme|ÖDEME/.test(on.text)); // karşılaştırma ve ödeme yok
  assert.ok(!/3194|fiyat|📦|adet/i.test(on.text + g.at(-2).govde.text)); // Fuat mesajlarında adet/model yok
  const id = on.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await mutabakatAdimi(o.env, cuma + 600, tg);
  assert.equal(g.filter((x) => /ÖNİZLEME/.test(x.govde.text)).length, 1); // cuma günü bir kez
  // Patron "Fuat'ın göreceği": birebir Fuat metni, Patron'a
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:f:${id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  const fGor = cagri(o.g, "sendMessage").at(-1).govde;
  assert.equal(fGor.chat_id, 999);
  assert.equal(fGor.text, BEKLENEN);
  assert.equal(cagri(o.g, "sendMessage").at(-2).govde.text, BEKLENEN1);
  assert.ok(!/VOLONTE kaydı|fark|ödeme|ÖDEME|5\.000/i.test(fGor.text)); // Fuat'a VOLONTE defteri, fark, ödeme yok
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "501")); // hâlâ Fuat'a hiçbir şey yok
  // Hemra basamaz; Patron gönderir (eski hesap da yetkili)
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: `mt:g:${id}`, message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Patron'da/);
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `mt:g:${id}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "501")); // ilk basışta gitmez
  const emin = cagri(o.g, "sendMessage").at(-1).govde;
  assert.match(emin.text, /Emin misiniz\?/);
  assert.deepEqual(emin.reply_markup.inline_keyboard[0].map((d) => [d.text, d.callback_data]), [["✅ Evet, gönder", `mt:G:${id}`], ["Vazgeç", `mt:v:${id}`]]);
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `mt:G:${id}`, message: { chat: { id: 111 }, message_id: 2 } } }, o.env);
  const fuatlar = cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501");
  assert.deepEqual(fuatlar.map((x) => x.govde.text), [BEKLENEN1, BEKLENEN]); // iki ayrı mesaj, birebir
  const fuatMsj = fuatlar[1];
  assert.ok(!/VOLONTE kaydı|ödeme|fark/i.test(fuatMsj.govde.text));
  assert.deepEqual(fuatMsj.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Mutabıkım", "❌ Uyuşmuyor", "⏳ Sonra kontrol edeceğim"]);
  const pdf = cagri(o.g, "sendDocument");
  assert.equal(pdf.length, 1);
  assert.equal(pdf[0].govde.chat_id, "999"); // PDF sadece Patron'a
  const pdfBayt = new Uint8Array(await pdf[0].govde.belge.arrayBuffer());
  assert.equal(new TextDecoder().decode(pdfBayt.slice(0, 8)), "%PDF-1.4");
  // Nuri basamaz; Fuat "Sonra"
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 502 }, data: `mt:m:${id}`, message: { chat: { id: 502 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Fuat'ta/);
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:s:${id}`, message: { chat: { id: 501 }, message_id: 2 } } }, o.env);
  g.length = 0;
  const cmt = cuma + 86400; // cumartesi
  await mutabakatAdimi(o.env, cmt - 6 * 3600, tg); // 11:01 → henüz değil
  assert.equal(g.length, 0);
  await mutabakatAdimi(o.env, cmt - 5 * 3600 + 60, tg); // 12:02
  await mutabakatAdimi(o.env, cmt + 3600, tg); // aynı gün ikinci kez sorulmaz
  assert.equal(g.length, 1);
  assert.match(g[0].govde.text, /Mutabakatı kontrol ettiniz mi\?/);
  await mutabakatAdimi(o.env, cmt + 86400, tg); // pazar: yok
  assert.equal(g.length, 1);
  await mutabakatAdimi(o.env, cmt + 2 * 86400, tg); // pazartesi
  await mutabakatAdimi(o.env, cmt + 3 * 86400, tg); // salı → 3. hatırlatma + Patron'a bilgi
  assert.ok(g.some((x) => x.govde.chat_id === "999" && /mutabakatına 3 gündür cevap vermedi/.test(x.govde.text)));
  const ozet = g.find((x) => /Haftalık özet/.test(x.govde.text || ""));
  assert.equal(ozet.govde.chat_id, "999"); // pazartesi özeti sadece Patron'a
  // Uyuşmuyor → Patron'a hemen haber; açıklama Patron'a + PDF
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:u:${id}`, message: { chat: { id: 501 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Ne uyuşmuyor\?/);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "999" && /"Uyuşmuyor" dedi/.test(x.govde.text)));
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "3634 bizde 18 görünüyor" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "999").at(-1).govde.text, /Fuat mutabakatta uyuşmuyor \(06\.11\.2026, \d\d\.\d\d\.2026 \d\d:\d\d\):\n3634 bizde 18 görünüyor/);
  assert.equal(cagri(o.g, "sendDocument").length, 1);
  // Arşiv: sırayla, zincir sağlam, silinemez
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((r) => r.json());
  const ars = await st("/arsiv-liste");
  assert.deepEqual(ars.map((x) => x.tur), ["onizleme", "gonderim", "pdf", "sonra", "hatirlatma", "haftalik-ozet", "hatirlatma", "hatirlatma", "uyusmuyor", "fark-aciklama", "pdf"]);
  assert.match(JSON.parse(ars[1].icerik).fuatMesaji, /^📊 BLACK ROSE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 50,00 \$\nBlack Rose 15: 100,00 \$[\s\S]*📊 VOLONTE – Sami/);
  assert.equal((await st("/arsiv-dogrula")).tamam, true);
  assert.equal((await st("/arsiv-dosyalar", { mt: id })).length, 2);
});

test("mutabakat güvenliği: iki mağaza ayrı bakiye, tek düğme; Mutabıkım → tarih/saat/toplam/tam mesaj kayda + Patron'a 'Fuat X $ bakiyeyi onayladı'; yeni önizleme eskisini geçersiz kılar; süzgeç", async () => {
  const { onizlemeGonder, fuatSuzgec } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501" });
  const ayar = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k, v: JSON.stringify(v) }) });
  const h = (anahtar, kart) => ({ anahtar, ad: `BLACK ROSE ${anahtar}`, kart, donemler: {} });
  await ayar("cari:BLACKROSE", { zaman: 1, hesaplar: [h("15", -100), h("20", -250), h("25", 0), h("00", 0)] });
  await ayar("cari:VOLONTE", { zaman: 1, hesaplar: [h("15", 100), h("20", 200), h("25", 0), h("00", 0)] });
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 1 } }; };
  const r = await onizlemeGonder(o.env, tg, Date.UTC(2026, 10, 6, 14, 1) / 1000, "elle");
  assert.ok(!/FARK|fark/.test(g.map((x) => x.govde.text).join("\n")));
  assert.match(g.at(-2).govde.text, /^📊 BLACK ROSE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 0,00 \$\nBlack Rose 15: 100,00 \$\nBlack Rose 20: 250,00 \$\nBlack Rose 25: 0,00 \$\nToplam: 350,00 \$$/);
  assert.match(g.at(-1).govde.text, /^📊 VOLONTE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 0,00 \$\nBlack Rose 15: 100,00 \$\nBlack Rose 20: 200,00 \$\nBlack Rose 25: 0,00 \$\nToplam: 300,00 \$\n\nBundan sonra/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:g:${r.id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 0); // "Emin misiniz?" önce
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:v:${r.id}`, message: { chat: { id: 999 }, message_id: 2 } } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 0); // Vazgeç → gitmez
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:G:${r.id}`, message: { chat: { id: 999 }, message_id: 3 } } }, o.env);
  const fuata = cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501");
  assert.equal(fuata.length, 2); // onayla iki ayrı mesaj gider
  assert.deepEqual(fuata.map((x) => x.govde.text), [g.at(-2).govde.text, g.at(-1).govde.text]); // Fuat'a önizlemedekinin birebir aynısı
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:m:${r.id}`, message: { chat: { id: 501 }, message_id: 3 } } }, o.env);
  const p = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "999").govde.text;
  assert.match(p, /^✅ Fuat 350,00 \$ \(A\) bakiyeyi onayladı — \d\d\.\d\d\.2026 \d\d:\d\d \(06\.11\.2026 mutabakatı\)\. Arşiv kaydı #\d+ mühürlendi\.$/);
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  const mk = (await st("/arsiv-liste")).find((x) => x.tur === "mutabik");
  const ic = JSON.parse(mk.icerik);
  assert.equal(ic.toplamBakiye, -350);
  assert.equal(ic.toplamBakiyeYazi, "350,00 $ (A)");
  assert.match(ic.tarihSaat, /^\d\d\.\d\d\.2026 \d\d:\d\d$/);
  assert.match(ic.mesaj, /📊 BLACK ROSE – Sami[\s\S]*Toplam: 350,00 \$[\s\S]*📊 VOLONTE – Sami/);
  assert.ok(cagri(o.g, "sendDocument").some((x) => x.govde.chat_id === "999"));
  // Yeni önizleme eskisini geçersiz kılar
  const r2 = await onizlemeGonder(o.env, tg, Date.UTC(2026, 10, 7, 9, 0) / 1000, "elle");
  const r3 = await onizlemeGonder(o.env, tg, Date.UTC(2026, 10, 7, 9, 5) / 1000, "elle");
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:G:${r2.id}`, message: { chat: { id: 999 }, message_id: 4 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /artık geçerli değil/);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "501"));
  assert.ok(r3.id);
  // Süzgeç: Fuat metninde yasak bilgi yakalanır
  assert.equal(fuatSuzgec("📦 BLACK ROSE MAĞAZASI\n3557 · 200 adet\nTOPLAM 350,00 $ (A)"), null);
  assert.ok(fuatSuzgec("Black Rose 15: VOLONTE kaydı 100,00 $"));
  assert.ok(fuatSuzgec("SON ÖDEMELER 5.000 $"));
});

test("ödeme kanıtı (/odeme): sadece Patron; tutar/hesap/not çözülür; dekont fotoğrafı eklenir; arşive girer", async () => {
  const { odemeCoz } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  assert.deepEqual(odemeCoz("/odeme 5000$"), { tutar: 5000, hesap: null, not: null });
  assert.deepEqual(odemeCoz("/odeme 5.000,50 $ 20 nakit elden"), { tutar: 5000.5, hesap: "20", not: "nakit elden" });
  assert.deepEqual(odemeCoz("/odeme $1.250 000"), { tutar: 1250, hesap: "00", not: null });
  assert.equal(odemeCoz("/odeme"), null);
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501", ALLOWED_IDS: "111,222,999" });
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "/odeme 100$" } }, o.env);
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  assert.equal((await st("/arsiv-liste")).length, 0); // Fuat ödeme yazamaz
  o.g.length = 0;
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/odeme 5000$ 20 nakit" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Ödeme kaydedildi \(#1\): .*5\.000,00 \$ · Black Rose 20 · nakit\nDekont fotoğrafını 10 dakika içinde gönderin/);
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, photo: [{ file_id: "kucuk", file_size: 10 }, { file_id: "BUYUK", file_size: 5000000 }] } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Dekont ödemeye eklendi/);
  const odemeler = JSON.parse((await st("/ayar-oku", { k: "odeme:liste" })).v);
  assert.equal(odemeler[0].foto, "BUYUK");
  assert.deepEqual((await st("/arsiv-liste")).map((x) => x.tur), ["odeme", "odeme-dekont"]);
});


test("mutabakat bakiyeleri: iki mağaza AYRI (karşılaştırma yok); Black Rose ve VOLONTE'deki Black Rose hesapları ayrı bölümde; ters yönlü hesap işaretli; kaynak seçilebilir", async () => {
  const { mutabakatMetni, bakiyeBolumu, bakiyeSatirlari } = await import("./mutabakat.js");
  const o = ortam();
  const ayar = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k, v: JSON.stringify(v) }) });
  const h = (anahtar, kart, d5, ad) => ({ anahtar, ad: ad || `BLACK ROSE ${anahtar}`, kart, donemler: { D0005TBLCARIGENELHAREKET: { n: 3, borc: d5[0], alacak: d5[1] } } });
  await ayar("cari:BLACKROSE", { hesaplar: [h("15", 1000, [1500, 500]), h("20", 2500, [2500, 0]), h("25", 0, [0, 0]), h("00", 300, [300, 0])] });
  await ayar("cari:VOLONTE", { hesaplar: [h("15", 61.85, [0, 1000], "BLACKROSE 15"), h("20", -2400, [0, 2400], "BLACKROSE 20"), h("00", -300, [0, 300], "BLACK ROSE 000")] });
  const m = await mutabakatMetni(o.env, "2026-11-06");
  const metin = m.fuat.join("\n");
  assert.equal(m.fuat.length, 2); // iki ayrı mesaj
  assert.match(m.fuat[0], /^📊 BLACK ROSE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 300,00 \$\nBlack Rose 15: 1\.000,00 \$\nBlack Rose 20: 2\.500,00 \$\nBlack Rose 25: 0,00 \$\nToplam: 3\.800,00 \$$/);
  assert.match(m.fuat[1], /^📊 VOLONTE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 300,00 \$\nBlack Rose 15: 61,85 \$ \(B\)\nBlack Rose 20: 2\.400,00 \$\nBlack Rose 25: 0,00 \$\nToplam: 2\.638,15 \$\n\nBundan sonra/);
  assert.deepEqual(m.patron, m.fuat); // Patron önizlemesi = Fuat'ın göreceği
  assert.ok(!/fark|FARK|uyarı|⚠️|✅|GENEL TOPLAM/.test(metin));
  assert.deepEqual(bakiyeSatirlari(null, { tur: "kart" }), ["(bakiye henüz okunamadı)"]);
  // kaynak: dönem tablosu toplamı
  const d = bakiyeBolumu({ hesaplar: [h("15", 1000, [1500, 400])] }, { hesaplar: [h("15", -1000, [0, 1100])] }, { tur: "donem", tablolar: ["D0005TBLCARIGENELHAREKET"] });
  assert.match(d.fuat[0], /Black Rose 15  1\.100,00 \$ \(B\)/);
  assert.match(d.patron.join("\n"), /kaynak: dönem toplamı \(D0005TBLCARIGENELHAREKET\)/);
});



test("mutabakat bakiyesi 'sondonem': her hesapta en son dönem (devir dahil), dönemler toplanmaz; ikinci tablo türü karışmaz", async () => {
  const { bakiyeBolumu, bakiyeDegeri } = await import("./mutabakat.js");
  const y = { tur: "sondonem", tablo: "CARIGENELHAREKET" };
  const d = (n, borc, alacak) => ({ n, borc, alacak });
  // BR 25: D0003 kapanış −1.920,50; D0005 başında devir −1.920,50, yeni hareket yok → −1.920,50 (toplasaydık −3.841)
  const br25 = { anahtar: "25", kart: 0, donemler: { D0001TBLCARIGENELHAREKET: d(4, 500, 100), D0003TBLCARIGENELHAREKET: d(9, 1000, 2920.5), D0005TBLCARIGENELHAREKET: d(1, 0, 1920.5), D0005TBLCARIHAREKETLERI: d(1, 0, 1920.5), D0004TBLCARIGENELHAREKET: d(0, null, null) } };
  assert.equal(bakiyeDegeri(br25, y), -1920.5);
  // son dönemde hareketi olmayan hesap → hareketi olan en son dönem; hiç hareketi yoksa 0
  assert.equal(bakiyeDegeri({ donemler: { D0001TBLCARIGENELHAREKET: d(2, 300, 0), D0005TBLCARIGENELHAREKET: d(0, null, null) } }, y), 300);
  assert.equal(bakiyeDegeri({ donemler: { D0005TBLCARIGENELHAREKET: d(0, null, null) } }, y), 0);
  assert.equal(bakiyeDegeri({ donemler: {} }, y), null);
  // tablo türü seçimi: CARIHAREKETLERI
  assert.equal(bakiyeDegeri({ donemler: { D0003TBLCARIHAREKETLERI: d(1, 50, 0), D0005TBLCARIGENELHAREKET: d(1, 999, 0) } }, { tur: "sondonem", tablo: "CARIHAREKETLERI" }), 50);
  const b = bakiyeBolumu({ hesaplar: [br25] }, { hesaplar: [{ anahtar: "25", donemler: { D0005TBLCARIGENELHAREKET: d(3, 1920.5, 0) } }] }, y);
  assert.match(b.fuat.join("\n"), /Black Rose 25  1\.920,50 \$ \(A\)/);
  assert.match(b.patron.join("\n"), /kaynak: son dönem hareketleri, devir dahil/);
});

test("cari takip (iki mağaza ayrı): özel kodlu Vegawin ödemesi Patron'a (ilk çalışmada sessiz); özel kodsuz kayıt ödeme sayılmaz; /bakiye ayrı ayrı; /borclimit her mağaza ayrı; haftalık özet iki mağaza", async () => {
  const { odemeTakip, devirMi, haftalikOzetMetni, borcLimitKontrol } = await import("./cari-takip.js");
  const { bakiyeOku } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501", ALLOWED_IDS: "111,222,999" });
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  const ayar = (k, v) => st("/ayar-yaz", { k, v: JSON.stringify(v) });
  const T = "D0005TBLCARIGENELHAREKET";
  const hr = (ind, hesap, tarih, borc, alacak, ozelkod) => ({ hesap, tablo: T, ind, tarih, borc, alacak, ...(ozelkod ? { ozelkod } : {}) });
  const don = (borc, alacak, ilk) => ({ [T]: { n: 3, borc, alacak, ilk }, D0003TBLCARIGENELHAREKET: { n: 9, borc: 0, alacak: 1000 } });
  const vl = { zaman: Date.UTC(2026, 10, 2, 9) / 1000, hesaplar: [{ anahtar: "20", ad: "BLACKROSE 20", kart: 0, donemler: don(1000, 3000, "2026-10-17") }], hareketler: [
    hr("1", "20", "2026-10-17", 1000, 0), hr("2", "20", "2026-10-20", 0, 3000), hr("3", "20", "2026-10-26", 1000, 0, "BLACK ROSE BORC VERDIM"), hr("5", "20", "2026-10-27", 900, 0)] };
  const br = { zaman: Date.UTC(2026, 10, 2, 9) / 1000, hesaplar: [{ anahtar: "20", kart: 0, donemler: { [T]: { n: 1, borc: 0, alacak: 5000 } } }], hareketler: [] };
  assert.equal(devirMi(vl.hareketler[0], vl), true);
  assert.equal(devirMi(vl.hareketler[1], vl), false);
  await ayar("cari:VOLONTE", vl);
  await ayar("cari:BLACKROSE", br);
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 1 } }; };
  const simdi = Date.UTC(2026, 10, 2, 10) / 1000;
  await odemeTakip(o.env, simdi, tg); // ilk çalışma: eski ödemeler "görüldü", mesaj yok
  assert.equal(g.length, 0);
  vl.hareketler.push(hr("4", "20", "2026-11-02", 2500, 0, "BLACK ROSE BORC VERDIM"), hr("6", "20", "2026-11-02", 7000, 0));
  await ayar("cari:VOLONTE", vl);
  await odemeTakip(o.env, simdi + 300, tg);
  assert.deepEqual(g.map((x) => [x.govde.chat_id, x.govde.text]), [["999", "💵 Black Rose 20'a 2.500,00 $ ödeme kaydedildi (VOLONTE defteri, 02.11.2026 · BLACK ROSE BORC VERDIM)."]]); // özel kodsuz 7.000 sayılmaz
  await odemeTakip(o.env, simdi + 3 * 86400, tg);
  assert.equal(g.length, 1); // tekrar yok, Black Rose defterinde karşılık aranmaz
  // /bakiye (Patron) — iki mağaza ayrı, fark yok; Fuat yazamaz
  await ayar("cari:yontem", { tur: "sondonem", tablo: "CARIGENELHAREKET" });
  o.g.length = 0;
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "/bakiye" } }, o.env);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /Güncel bakiye/.test(x.govde.text)));
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/bakiye" } }, o.env);
  const bk = cagri(o.g, "sendMessage").at(-1).govde.text;
  assert.match(bk, /💰 <b>BLACK ROSE bakiyesi<\/b>[\s\S]*Black Rose 20  5\.000,00 \$ \(A\)[\s\S]*💰 <b>VOLONTE bakiyesi<\/b>[\s\S]*BLACKROSE 20  2\.000,00 \$ \(A\)/);
  assert.ok(!/fark|FARK|⚠️/.test(bk));
  // borç sınırı: her mağaza ayrı
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/borclimit 3.000" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Borç sınırı 3\.000,00 \$/);
  g.length = 0;
  await borcLimitKontrol(o.env, simdi, tg, bakiyeOku);
  assert.equal(g[0].govde.text, "🚨 Borç sınırı aşıldı (sınır 3.000,00 $): BLACK ROSE bakiyesi 5.000,00 $ (A).");
  await borcLimitKontrol(o.env, simdi + 300, tg, bakiyeOku);
  assert.equal(g.length, 1); // bir kez
  // haftalık özet metni: tek mağaza bloğu; ödeme kaydı yoksa mal/ödeme ayrılamaz
  const oz = haftalikOzetMetni(vl, "VOLONTE", -2000, "2026-10-19", "2026-10-25");
  assert.match(oz, /^🏬 VOLONTE\n📦 Gelen mal: 3\.000,00 \$ \(1 kayıt\)\n💵 Ödemeler: 0,00 \$ \(0 kayıt\)/);
  assert.match(haftalikOzetMetni({ hesaplar: [], hareketler: [hr("9", "20", "2026-10-20", 0, 100)] }, "BLACK ROSE", -100, "2026-10-19", "2026-10-25"), /ayrılamıyor \(hareket türü teşhisi bekleniyor\)/);
});


test("Fuat'a iş özeti: VOLONTE defterinden yıllık gelen mal (ödeme hariç, devir düşülür); metin birebir; önizleme sadece Patron'a; onaysız gitmez; gönderim arşiv + PDF Patron'a", async () => {
  const { yillikIs, isOzetiMetni, isOzetiHazirMi } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  // VOLONTE defteri: mal = alacak (ödemeler borçta). D0003'ün ilk günü D0001 kapanışını taşıyan devir (alacak 1.000)
  const vl = { zaman: 1, hesaplar: [
    { anahtar: "20", donemler: {
      D0001TBLCARIGENELHAREKET: { n: 5, borc: 4000, alacak: 5000, ilk: "2023-01-02", yillar: { 2023: { n: 3, b: 1000, a: 3000, ob: 1000, oa: 0 }, 2024: { n: 2, b: 3000, a: 2000, ob: 3000, oa: 0 } }, ilkGun: { tarih: "2023-01-02", n: 1, b: 0, a: 1000 } },
      D0003TBLCARIGENELHAREKET: { n: 4, borc: 2000, alacak: 3500, yillar: { 2025: { n: 4, b: 2000, a: 3500, ob: 2000, oa: 0 } }, ilkGun: { tarih: "2025-01-30", n: 1, b: 0, a: 1000 } },
      D0003TBLCARIHAREKETLERI: { n: 4, borc: 2000, alacak: 3500 } } },
    { anahtar: "15", donemler: { D0001TBLCARIGENELHAREKET: { n: 1, borc: 0, alacak: 250.5, yillar: { 2024: { n: 1, b: 0, a: 250.5, ob: 0, oa: 0 } }, ilkGun: { tarih: "2024-03-01", n: 1, b: 0, a: 250.5 } } } },
  ] };
  const y = yillikIs(vl);
  assert.equal(y.taraf, "alacak");
  assert.deepEqual(y.yillar, { 2023: 3000, 2024: 2250.5, 2025: 2500 }); // 2025: 3.500 − devir 1.000
  const metin = isOzetiMetni(y.yillar);
  assert.equal(metin, "📊 VOLONTE – Sami\n\nFuat Bey,\n\n2023'ten bugüne yapılan işin özeti:\n2023: 3.000,00 $\n2024: 2.250,50 $\n2025: 2.500,00 $\nToplam: 7.750,50 $\n\nBundan sonra tüm hesaplar sistem üzerinden, şeffaf ve kayıt altında yürüyecek.\n\nİyi çalışmalar.\n\n– Sami");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501", ALLOWED_IDS: "111,222,999" });
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 1 } }; };
  await isOzetiHazirMi(o.env, 1793600000, tg);
  assert.equal(g.length, 0); // rakam yokken önizleme yok
  await st("/ayar-yaz", { k: "cari:VOLONTE", v: JSON.stringify(vl) });
  // Bir dönemin yıl toplamı eksikse (köprü eski) özet hazırlanmaz
  const eksik = JSON.parse(JSON.stringify(vl)); delete eksik.hesaplar[0].donemler.D0003TBLCARIGENELHAREKET.yillar;
  await st("/ayar-yaz", { k: "cari:VOLONTE", v: JSON.stringify(eksik) });
  await isOzetiHazirMi(o.env, 1793600000, tg);
  assert.equal(g.length, 0);
  await st("/ayar-yaz", { k: "cari:VOLONTE", v: JSON.stringify(vl) });
  await isOzetiHazirMi(o.env, 1793600000, tg);
  await isOzetiHazirMi(o.env, 1793600300, tg);
  assert.ok(g.length === 2 && g.every((x) => x.govde.chat_id === "999")); // bir kez, sadece Patron
  assert.equal(g[1].govde.text, metin);
  const dugmeler = g[1].govde.reply_markup.inline_keyboard.flat();
  assert.deepEqual(dugmeler.map((d) => d.text), ["👁 Fuat'ın göreceği", "✅ Fuat'a gönder", "❌ İptal"]);
  const id = dugmeler[1].callback_data.split(":")[2];
  // Fuat ve ekip basamaz
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `oz:g:${id}`, message: { chat: { id: 501 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Patron'da/);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => String(x.govde.chat_id) === "501"));
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `oz:g:${id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Emin misiniz\?/);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `oz:G:${id}`, message: { chat: { id: 999 }, message_id: 2 } } }, o.env);
  const fm = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "501");
  assert.equal(fm.govde.text, metin);
  assert.equal(cagri(o.g, "sendDocument")[0].govde.chat_id, "999");
  const ars = await st("/arsiv-liste");
  assert.deepEqual(ars.map((x) => x.tur), ["is-ozeti-onizleme", "is-ozeti-gonderim", "pdf"]);
  assert.equal(JSON.parse(ars[1].icerik).fuatMesaji, metin);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `oz:G:${id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 1); // ikinci kez gitmez
});

test("/adet: adet listesi sadece Patron isteyince; önizleme Patron'a; 'Emin misiniz?' onayıyla Fuat'a; başkası basamaz; arşiv", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501", ALLOWED_IDS: "111,222,999" });
  await o.yaz("BLACKROSE", [{ kod: "3557", adet: 200, fiyat: 40, brAdet: 200 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3557", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "/adet" } }, o.env);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /ÖNİZLEME/.test(x.govde.text || "")));
  o.g.length = 0;
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/adet" } }, o.env);
  const m = cagri(o.g, "sendMessage");
  assert.match(m[0].govde.text, /ÖNİZLEME — adet listesi/);
  assert.equal(m[1].govde.text, "📊 BLACK ROSE – Sami\nFuat Bey,\n📦 BLACK ROSE MAĞAZASI – 1 model · 200 adet\n<pre>3557 · 200 adet</pre>");
  assert.equal(m[2].govde.text, "📊 VOLONTE – Sami\nFuat Bey,\n📦 VOLONTE MAĞAZASI – 1 model · 4 adet\n<pre>3557 · 4 adet</pre>\n\nİyi çalışmalar.\n– Sami");
  assert.ok(!/3194|fiyat|\$/.test(m[1].govde.text + m[2].govde.text));
  const id = m[2].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `ad:G:${id}`, message: { chat: { id: 501 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Patron'da/);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:g:${id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 0);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Emin misiniz\?/);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:G:${id}`, message: { chat: { id: 999 }, message_id: 2 } } }, o.env);
  assert.deepEqual(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").map((x) => x.govde.text), [m[1].govde.text, m[2].govde.text]);
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  assert.deepEqual((await st("/arsiv-liste")).map((x) => x.tur), ["adet-onizleme", "adet-gonderim"]);
});

test("iki mutabakat Fuat'a gittiyse sadece sonuncusu geçerli (eskinin düğmeleri kalkar); Fuat'a bilgilendirme Patron onayı + 'Emin misiniz?' ile gider", async () => {
  const { onizlemeGonder, bilgiOnizleme } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501" });
  const tg = async () => ({ ok: true, result: { message_id: 1 } });
  const r1 = await onizlemeGonder(o.env, tg, Date.UTC(2026, 10, 2, 14, 10) / 1000, "elle");
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:G:${r1.id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  const r2 = await onizlemeGonder(o.env, tg, Date.UTC(2026, 10, 2, 14, 15) / 1000, "elle");
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `mt:G:${r2.id}`, message: { chat: { id: 999 }, message_id: 2 } } }, o.env);
  assert.ok(cagri(o.g, "editMessageReplyMarkup").some((x) => x.govde.chat_id === "501")); // eski mesajın düğmeleri kaldırıldı
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:m:${r1.id}`, message: { chat: { id: 501 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /geçersiz; lütfen en son gelen mutabakat/);
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:m:${r2.id}`, message: { chat: { id: 501 }, message_id: 4 } } }, o.env);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "999" && /bakiyeyi onayladı/.test(x.govde.text)));
  // bilgilendirme
  const metin = "📊 VOLONTE – Sami\n\nFuat Bey,\n\nBugün size iki mutabakat mesajı ulaştı.\n\nİyi çalışmalar.\n– Sami";
  const g = [];
  const tg2 = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; };
  const id = await bilgiOnizleme(o.env, tg2, metin, Date.UTC(2026, 10, 2, 15) / 1000);
  assert.ok(g.every((x) => x.govde.chat_id === "999"));
  assert.equal(g.at(-1).govde.text, metin);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:g:${id}`, message: { chat: { id: 999 }, message_id: 8 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Emin misiniz\?<\/b> Bilgilendirme mesajı/);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 0);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:G:${id}`, message: { chat: { id: 999 }, message_id: 9 } } }, o.env);
  assert.deepEqual(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").map((x) => x.govde.text), [metin]);
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  const turler = (await st("/arsiv-liste")).map((x) => x.tur);
  assert.ok(turler.includes("gecersiz") && turler.includes("bilgi-onizleme") && turler.includes("bilgi-gonderim"));
});

test("/nuristok: sadece Patron; Nuri'ye Black Rose kodlu stok listesi (iki mağaza ayrı, bakiye/fiyat yok); önizleme → 'Emin misiniz?' → Nuri; Fuat'a gitmez", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", FUAT_ID: "501", NURI_ID: "502", ALLOWED_IDS: "111,222,999" });
  await o.yaz("BLACKROSE", [{ kod: "3557", adet: 200, fiyat: 40, brAdet: 200 }, { kod: "3601", adet: 7, fiyat: 40, brAdet: 7 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3557", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  await g2({ message: { chat: { id: 502, type: "private" }, from: { id: 502 }, text: "/nuristok" } }, o.env);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /ÖNİZLEME/.test(x.govde.text || "")));
  o.g.length = 0;
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/nuristok" } }, o.env);
  const m = cagri(o.g, "sendMessage");
  assert.match(m[0].govde.text, /ÖNİZLEME — Nuri'ye stok listesi/);
  assert.equal(m[1].govde.text, "📊 BLACK ROSE – Sami\nNuri Bey,\n📦 BLACK ROSE MAĞAZASI – 2 model · 207 adet\n<pre>3557 · 200 adet   3601 ·   7 adet</pre>");
  assert.equal(m[2].govde.text, "📊 VOLONTE – Sami\nNuri Bey,\n📦 VOLONTE MAĞAZASI – 1 model · 4 adet\n<pre>3557 · 4 adet</pre>\n\nİyi çalışmalar.\n– Sami");
  assert.ok(!/\$|bakiye|3194|fiyat|ödeme|ciro/i.test(m[1].govde.text + m[2].govde.text));
  assert.deepEqual(m[2].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Nuri'ye gönder", "❌ İptal"]);
  const id = m[2].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:g:${id}`, message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Emin misiniz\?<\/b> Stok listesi şimdi Nuri'ye gidecek/);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => ["501", "502"].includes(String(x.govde.chat_id))).length, 0);
  await g2({ callback_query: { id: "c", from: { id: 999 }, data: `ad:G:${id}`, message: { chat: { id: 999 }, message_id: 2 } } }, o.env);
  assert.deepEqual(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "502").map((x) => x.govde.text), [m[1].govde.text, m[2].govde.text]);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "501").length, 0); // Fuat'a gitmez
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /✅ Stok listesi Nuri'ye gönderildi/);
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  assert.deepEqual((await st("/arsiv-liste")).map((x) => x.tur), ["nuristok-onizleme", "nuristok-gonderim"]);
});

test("/ciro: sadece Patron; her mağaza ayrı bölüm, toplam yok; satış (21) − iade (22) = net; başka tür ciroya katılmaz", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999", ALLOWED_IDS: "111,222,999" });
  const st = (yol, gv = {}) => o.env.STOK.get().fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(gv) }).then((x) => x.json());
  await st("/ayar-yaz", { k: "ciro:BLACKROSE", v: JSON.stringify({ zaman: 1793635203, satirlar: [
    { tablo: "D0001TBLSATFATBASLIK", yil: 2025, tur: "21", doviz: "$", n: 140, tutar: 48844, kaynak: "satis" },
    { tablo: "D0003TBLSATFATBASLIK", yil: 2025, tur: "21", doviz: "$", n: 2244, tutar: 692115, kaynak: "satis" },
    { tablo: "D0003TBLALFATBASLIK", yil: 2025, tur: "22", doviz: "$", n: 33, tutar: 12836, kaynak: "iade" },
    { tablo: "D0003TBLSATFATBASLIK", yil: 2025, tur: "23", doviz: "$", n: 2, tutar: 10, kaynak: "satis" },
  ] }) });
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/ciro" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /sadece Patron/);
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/ciro" } }, o.env);
  const t = cagri(o.g, "sendMessage").at(-1).govde.text;
  assert.match(t, /🏬 VOLONTE\nKöprü ciro verisini henüz göndermedi\.\n\n🏬 BLACK ROSE \(son okuma/);
  assert.match(t, /2025: satış 740\.959,00 \$ · iade 12\.836,00 \$ · NET 728\.123,00 \$ \(2384 fatura, 33 iade\)/);
  assert.match(t, /\(satış dışı 2 belge ciroya katılmadı\)/);
  assert.ok(!/10,00 \$/.test(t)); // satış dışı (alış tarafı) tutar gösterilmez
  assert.ok(!/TOPLAM|toplam ciro|fark/i.test(t.replace("iptal edilen", "")));
});

// 9 Kasım (Patron): ONAY MERDİVENİ — fabrika: 24 saat (iş günü) → aynı kart bir kez Fuat'a; 24 saat daha → Merdan + Hemra'ya kopya + 📞
test("onay merdiveni (fabrika): kart bir kez yeniden fabrikaya (⏩ eski kart), sonra Merdan + Hemra'ya bildirim + kart + 📞 Aradım", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }]));
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 4, fiyat: 70 }], ist(8));
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "fabrika:2026-10-28", v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3194", renkler: [{ renk: "siyah", adet: 10 }] }] }) }) });
  const gercek = Date.now;
  const bas = (kim, data) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 555: "Nuri", 333: "Hemra", 222: "Merdan" }[kim] || "X" }, data, message: { chat: { id: kim }, message_id: 1 } } }, o.env);
  Date.now = () => ist(10) * 1000; // çarşamba 10:00
  try { await bas(333, "fb:o:2026-10-28"); } finally { Date.now = gercek; }
  const id = cagri(o.g, "copyMessage")[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  const tgt = async (e, m, g) => { o.g.push({ metod: m, govde: g }); return { ok: true, result: { message_id: 700 + o.g.length } }; };
  assert.equal(f.isGunuSonra(ist(10), 86400), ist(10, 0, 1));
  assert.equal(f.isGunuSonra(Date.UTC(2026, 9, 30, 15) / 1000, 86400), Date.UTC(2026, 10, 2, 15) / 1000); // cuma 18:00 → pazartesi 18:00
  o.g.length = 0;
  await f.siparisTakip(o.env, ist(9, 50, 1), tgt); // 24 saat dolmadı
  assert.equal(cagri(o.g, "copyMessage").length, 0);
  await f.siparisTakip(o.env, ist(10, 5, 1), tgt);
  const tekrar = cagri(o.g, "copyMessage");
  assert.equal(tekrar.length, 1);
  assert.equal(String(tekrar[0].govde.chat_id), "555");
  assert.equal(tekrar[0].govde.caption, "⏰ Hatırlatma: lütfen onay verin\n🟦 VOLONTE\n3194 · siyah 10");
  assert.ok(!/\$|fiyat|stok|satış|kâr/i.test(tekrar[0].govde.caption));
  const kapat = cagri(o.g, "editMessageReplyMarkup")[0];
  assert.equal(kapat.govde.reply_markup.inline_keyboard[0][0].text, "⏩ Güncel kart aşağıda");
  assert.equal(kapat.govde.reply_markup.inline_keyboard[1][0].callback_data, `fc:g:${id}`); // eski düğme aynı sonuç
  o.g.length = 0;
  await f.siparisTakip(o.env, ist(11, 0, 1), tgt);
  assert.equal(cagri(o.g, "copyMessage").length, 0); // en fazla 1 yeniden gönderim
  await f.siparisTakip(o.env, ist(10, 10, 2), tgt); // cuma: 24 saat daha
  const ekip = cagri(o.g, "sendMessage").filter((x) => /Fabrika şu siparişlere onay vermedi/.test(x.govde.text));
  assert.deepEqual(ekip.map((x) => String(x.govde.chat_id)).sort(), ["333"]); // 10 Kasım: VOLONTE modeli Merdan'a gitmez
  assert.match(ekip[0].govde.text, /🏭 Fabrika şu siparişlere onay vermedi: 3194 \(28\.10\)\. Bilginiz olsun, lütfen arayın\./);
  assert.equal(cagri(o.g, "copyMessage").length, 1);
  const ara = cagri(o.g, "editMessageReplyMarkup").find((x) => x.govde.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `fc:a:${id}`));
  assert.ok(ara);
  assert.equal(JSON.parse(o.depo.get("fabrika:ekibe"))[0].kod, "3194");
  // 📞 Aradım → cevap yazılır, siparişe not
  o.g.length = 0;
  await bas(333, `fc:a:${id}`);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /fabrikanın cevabını tek mesajla yazın/);
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "Fuat'ı aradım, cuma hazır olacakmış" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3194: fabrikanın cevabı kaydedildi/);
  o.g.length = 0;
  await f.siparisTakip(o.env, ist(10, 10, 5), tgt);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => /onay vermedi/.test(x.govde.text)).length, 0); // bir kez
});

// 9 Kasım (Patron): JANET – sadece fiyat; ekip düzeni stok yönlendirmesi
test("Janet: Patron 'sadece fiyat' der → kod yazınca satış fiyatı (tek satır, kod başına); başka hiçbir şey yok", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "111", FABRIKA_SORUMLU: "333" });
  await o.yaz("VOLONTE", [{ kod: "3394", adet: 4, fiyat: 33.94 }], ist(8));
  assert.deepEqual(f.fiyatSorusu("3394"), ["3394"]);
  assert.deepEqual(f.fiyatSorusu("fiyat 3394"), ["3394"]);
  assert.deepEqual(f.fiyatSorusu("3394 price"), ["3394"]);
  assert.deepEqual(f.fiyatSorusu("prix 3394"), ["3394"]);
  assert.deepEqual(f.fiyatSorusu("3394 3627 price"), ["3394", "3627"]);
  assert.equal(f.fiyatSorusu("3394 stok kaç"), null);
  await g2({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Janet" }, text: "/start" } }, o.env);
  const kart = cagri(o.g, "sendMessage").find((x) => /Sami'ye \/start yazdı/.test(x.govde.text));
  const fb = kart.govde.reply_markup.inline_keyboard.flat().find((b) => /sadece fiyat/.test(b.text)).callback_data;
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 111, first_name: "Murat" }, data: fb, message: { chat: { id: 111 }, message_id: 5 } } }, o.env);
  assert.ok(await f.fiyatKisisiMi(o.env, 777));
  o.g.length = 0;
  await g2({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Janet" }, text: "3394 3627 price" } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").at(-1).govde.text, "3394: 33,94 $\n3627: bu kod yok");
  await g2({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Janet" }, text: "/stok 3394" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^Sadece model kodunu yazın/);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /adet|stok:|kâr|alış|kasa|müşteri/i.test(x.govde.text) && String(x.govde.chat_id) === "777"));
});

// 10 Kasım (Patron): EKSİK LİSTESİ YENİ DÜZEN — kontrol Aziz (VOLONTE) + Merdan (Black Rose) → Hemra'ya TEK toplu onay → fabrika
test("eksik listesi yeni düzen: Aziz/Merdan kontrol eder, Hemra toplu onaylar; biri 2 saatte bitirmezse diğeri gider ('kontrol edilmedi'); deneme fabrikaya gitmez", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222", AZIZ_ID: "444", EKIP_IDS: "333,444", MESAJ_ARASI_MS: "0" });
  o.depo.set("sami:satisAcik", "1");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Sinem" }]));
  o.depo.set("kodlar", JSON.stringify({ 3183: [{ ids: [700], tarih: 1 }], 3186: [{ ids: [701], tarih: 1 }], 7001: [{ ids: [900], tarih: 1 }] }));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3183", adet: 2 }, { kod: "3186", adet: 1 }] }) });
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun, kalemler: [{ kod: "7001", adet: 3 }] }) });
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 60 + g.length } }; };
  await f.fabrikaAdimi(o.env, ist(12, 0), tg);
  await f.fabrikaAdimi(o.env, ist(12, 15), tg);
  assert.ok(g.length && g.every((x) => String(x.govde.chat_id) === "444")); // VOLONTE kontrolü Aziz'de; Hemra'ya bu aşamada gitmez
  const yaz = (kim, ad, text) => g2({ message: { chat: { id: kim, type: "private" }, from: { id: kim, first_name: ad }, text } }, o.env);
  const gercek = Date.now;
  try {
    Date.now = () => ist(12, 30) * 1000;
    o.g.length = 0;
    await yaz(444, "Aziz", "3183 küçük siyah 5, 3186 büyük bej 2");
    await teyitEt(o, g2, 444, "Aziz", /Şunu anladım: 3183 Küçük siyah 5; 3186 Büyük bej 2\. Doğru mu\?/);
    await eminim(o, g2, 444, "Aziz", /^🟦 VOLONTE listesi: 2 model — 2 istendi, 0 istenmedi, 0 bot hatası\. Göndereyim mi\?$/);
    assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "444" && /Kontrol bitti/.test(x.govde.text)));
  } finally { Date.now = gercek; }
  // Black Rose listesi henüz başlamadığı için VOLONTE beklemeden Hemra'nın toplu onayına gider
  const kart1 = cagri(o.g, "sendMessage").find((x) => /Gidecek liste/.test(x.govde.text || ""));
  assert.equal(String(kart1.govde.chat_id), "333");
  assert.match(kart1.govde.text, /VOLONTE: Aziz kontrol etti[\s\S]*3183 — Küçük \(38-44\): siyah 5[\s\S]*3186 — Büyük \(44-50\): bej 2/);
  // Hemra onaylar → fabrikaya (Sinem); Murat'a bilgi (özet)
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: kart1.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  assert.ok(cagri(o.g, "copyMessage").some((x) => x.govde.chat_id === 555 && /^🟦 VOLONTE\n3183 · Küçük \(38-44\) · siyah 5/.test(x.govde.caption)));
  assert.ok(!cagri(o.g, "copyMessage").some((x) => /fiyat|stok|satılan|\$/i.test(x.govde.caption)));
  // Akşam Black Rose: Merdan kontrol eder; ikinci toplu onay
  g.length = 0;
  await f.fabrikaAdimi(o.env, ist(19, 10), tg);
  await f.fabrikaAdimi(o.env, ist(19, 25), tg);
  assert.ok(g.some((x) => String(x.govde.chat_id) === "222"));
  // DENEME: dünkü listeler yeni akışla; Hemra onaylasa da fabrikaya gitmez
  g.length = 0;
  const keys = await f.eksikDenemesi(o.env, gun, ist(20, 0), tg);
  assert.deepEqual(keys, [`${gun}-D`, `${gun}-BR-D`]);
  for (let i = 0; i < 3; i++) await f.fabrikaAdimi(o.env, ist(20, 1 + i), tg);
  assert.ok(g.some((x) => String(x.govde.chat_id) === "444" && /^🧪 DENEME/.test(x.govde.text || x.govde.caption || "")));
  const dk = g.filter((x) => x.govde.reply_markup && String(x.govde.chat_id) === "444").map((x) => x.govde.reply_markup.inline_keyboard.flat().find((b) => /İsteme/.test(b.text)).callback_data);
  const saat0 = Date.now; Date.now = () => ist(20, 5) * 1000; // kontrol 20:05'te bitti (test saati)
  for (const cb of dk) await g2({ callback_query: { id: "c", from: { id: 444, first_name: "Aziz" }, data: cb, message: { chat: { id: 444 }, message_id: 1 } } }, o.env);
  try { await eminim(o, g2, 444, "Aziz", /^🧪 DENEME – üretim yapmayın\n🟦 VOLONTE listesi: \d+ model — 0 istendi, \d+ istenmedi, 0 bot hatası\. Göndereyim mi\?$/); } finally { Date.now = saat0; }
  // Merdan bitirmedi → 2 saat sonra Aziz'inki beklemeden gider; Merdan'ın modeli "kontrol edilmedi"
  g.length = 0;
  await f.fabrikaAdimi(o.env, ist(22, 30), tg);
  const dkart = g.find((x) => /Gidecek liste/.test(x.govde.text || ""));
  assert.equal(String(dkart.govde.chat_id), "333");
  assert.match(dkart.govde.text, /^🧪 DENEME[\s\S]*Black Rose: Merdan bitirmedi[\s\S]*⚠️ Kontrol edilmedi \(listeye girmedi\): 7001 \(Black Rose\)[\s\S]*fabrikaya GİTMEZ/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: dkart.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 333 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "editMessageText").at(-1).govde.text, /DENEME olduğu için fabrikaya GİTMEDİ/);
  assert.equal(cagri(o.g, "copyMessage").length, 0); // fabrikaya hiçbir şey
});

test("eksik listesi: ⚠️ Bot hatası 'İsteme' ile karışmaz (Venom'a hata + sayım); küçük deneme önceki denemeyi kapatır", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222", AZIZ_ID: "444", EKIP_IDS: "333,444", MESAJ_ARASI_MS: "0" });
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "gonderildi", modeller: [{ kod: "3183", satilan: 2, kalan: 0 }, { kod: "3186", satilan: 1, kalan: 3 }] }) }) });
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}-BR`, v: JSON.stringify({ asama: "soruldu", modeller: [{ kod: "7001", satilan: 3, kalan: 0 }] }) }) });
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}-D`, v: JSON.stringify({ asama: "soruldu", deneme: true, modeller: [] }) }) });
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 80 + g.length } }; };
  const keys = await f.eksikDenemesi(o.env, gun, ist(10), tg, { adet: 1, ek: "-D2", kapat: [`${gun}-D`] });
  assert.deepEqual(keys, [`${gun}-D2`, `${gun}-BR-D2`]);
  const eski = JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}-D` }) })).json()).v);
  assert.equal(eski.asama, "iptal");
  for (let i = 0; i < 2; i++) await f.fabrikaAdimi(o.env, ist(10, 1 + i), tg);
  const aziz = g.filter((x) => String(x.govde.chat_id) === "444" && x.govde.reply_markup);
  assert.equal(aziz.length, 1); // sadece 1 VOLONTE modeli
  assert.match(aziz[0].govde.caption || aziz[0].govde.text, /^🧪 DENEME – üretim yapmayın\n🟦 VOLONTE\n3183/);
  const hata = aziz[0].govde.reply_markup.inline_keyboard.flat().find((b) => /Bot hatası/.test(b.text)).callback_data;
  await g2({ callback_query: { id: "c", from: { id: 444, first_name: "Aziz" }, data: hata, message: { chat: { id: 444 }, message_id: 1 } } }, o.env);
  await eminim(o, g2, 444, "Aziz", /🟦 VOLONTE listesi: 1 model — 0 istendi, 0 istenmedi, 1 bot hatası\. Göndereyim mi\?$/);
  assert.equal(JSON.parse(o.depo.get("sami:botHatalari"))[0].kod, "3183");
  assert.match(JSON.parse(o.depo.get("sami:hata")).hata, /bot hatası: 3183/);
  assert.match(JSON.parse(o.depo.get("venom:yetenekIstekleri")).at(-1).istek, /BOT HATASI: 3183/);
  const merdan = g.filter((x) => String(x.govde.chat_id) === "222" && x.govde.reply_markup);
  const iste = merdan[0].govde.reply_markup.inline_keyboard.flat().find((b) => /İsteme/.test(b.text)).callback_data;
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 222, first_name: "Merdan" }, data: iste, message: { chat: { id: 222 }, message_id: 2 } } }, o.env);
  await eminim(o, g2, 222, "Merdan", /🌹 BLACK ROSE listesi: 1 model — 0 istendi, 1 istenmedi, 0 bot hatası/);
  const kart = cagri(o.g, "sendMessage").find((x) => /Gidecek liste/.test(x.govde.text));
  assert.equal(kart.govde.chat_id, "333");
  assert.match(kart.govde.text, /🚫 Bu sefer istenmeyen: 7001[\s\S]*⚠️ Bot hatası \(listeye girmedi, düzeltilecek\): 3183[\s\S]*fabrikaya GİTMEZ/);
});

// 10 Kasım (Patron): SİNEM'İN İSTEKLERİ + FABRİKA ZİNCİRİ
test("fabrika zinciri: tarih / yazı çözümü", async () => {
  const f = await import("./fabrika.js");
  const s = ist(10, 0, 13); // 10.11.2026
  assert.deepEqual(f.tarihCoz("7 gün", s), { gun: 7, hazirGun: "2026-11-17", etiket: "7 gün" });
  assert.deepEqual(f.tarihCoz("4-6 gün", s), { gun: 6, hazirGun: "2026-11-16", etiket: "4-6 gün" });
  assert.equal(f.tarihCoz("18.11", s).hazirGun, "2026-11-18");
  assert.equal(f.tarihCoz("18 Kasım", s).gun, 8);
  assert.equal(f.tarihCoz("2 hafta", s).gun, 14);
  assert.equal(f.tarihCoz("merhaba", s), null);
  assert.deepEqual(f.fabrikaMetniCoz("3394 bitti", s).kalemler.map((x) => [x.kod, x.tur]), [["3394", "bitti"]]);
  assert.deepEqual(f.fabrikaMetniCoz("3394 stokta kalmadı, 3395 az kaldı", s).kalemler.map((x) => [x.kod, x.tur]), [["3394", "bitti"], ["3395", "az"]]);
  assert.deepEqual(f.fabrikaMetniCoz("3628 5 gün", s).kalemler.map((x) => [x.kod, x.tur, x.sec.gun]), [["3628", "sure", 5]]);
  assert.equal(f.fabrikaMetniCoz("hepsi 5 gün", s).hepsi.gun, 5);
  assert.equal(f.fabrikaMetniCoz("3394 geldi", s), null); // repete bildirimine kalır
});

test("fabrika zinciri: süre düğmeleri, geri al, az kaldı, bitti → Fuat onayı → Hemra → Venom; kanıt defteri silinmez; stok varken silinmez", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222", AZIZ_ID: "444", EKIP_IDS: "333,444", FUAT_ID: "557" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }, { id: 557, ad: "Fuat" }]));
  await o.yaz("VOLONTE", [{ kod: "3194", adet: 4, fiyat: 70 }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3194", renkler: [{ renk: "siyah", adet: 10 }], magaza: "VOLONTE" }, { kod: "3100", renkler: [{ renk: "bej", adet: 40 }], magaza: "VOLONTE" }, { kod: "7001", renkler: [{ renk: "siyah", adet: 5 }], magaza: "BLACKROSE" }] }) }) });
  const bas = (kim, data, mesaj = 1, foto = true) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 556: "Sinem", 557: "Fuat", 333: "Hemra", 444: "Aziz", 111: "Murat" }[kim] || "X" }, data, message: { chat: { id: kim }, message_id: mesaj, ...(foto ? { photo: [{}] } : {}) } } }, o.env);
  const yaz = (kim, ad, text) => g2({ message: { chat: { id: kim, type: "private" }, from: { id: kim, first_name: ad }, text } }, o.env);
  o.depo.set("kodlar", JSON.stringify({ 3194: [{ ids: [500], tarih: 1 }], 3100: [{ ids: [600], tarih: 1 }], 7001: [{ ids: [900], tarih: 1 }] }));
  o.g.length = 0;
  await bas(333, `fb:o:${gun}`, 2, false);
  // mağaza başlıkları: önce VOLONTE (BAŞLANGIÇ … BİTTİ), sonra Black Rose — asla karışmaz
  const sinemMsj = o.g.filter((x) => String(x.govde.chat_id) === "556").map((x) => (x.govde.caption || x.govde.text).split("\n")[0]);
  assert.deepEqual(sinemMsj, ["🟦 VOLONTE LİSTESİ – BAŞLANGIÇ (2 model)", "🟦 VOLONTE", "🟦 VOLONTE", "🟦 VOLONTE LİSTESİ – SONU (2 model)", "🌹 BLACK ROSE LİSTESİ – BAŞLANGIÇ (1 model)", "🌹 BLACK ROSE", "🌹 BLACK ROSE LİSTESİ – SONU (1 model)"]);
  const kart = (kod) => o.g.find((x) => String(x.govde.chat_id) === "556" && x.govde.caption && x.govde.caption.includes(`\n${kod} ·`));
  const id = kart("3194").govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  const id2 = kart("3100").govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  const mid = 51 + o.g.indexOf(kart("3194")); // test Telegram'ının verdiği mesaj numarası
  // 1) Gelecek → süre düğmeleri + ↩️ Geri al (kırmızı)
  o.g.length = 0;
  await bas(556, `fc:g:${id}`, mid);
  const sure = o.g.find((x) => x.metod === "editMessageCaption" && /Kaç günde hazır olur\?/.test(x.govde.caption));
  assert.deepEqual(sure.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["⏱ 4-6 gün", "⏱ 10-15 gün", "⏱ 15+ gün", "✏️ Tarih yaz", "↩️ Geri al"]);
  assert.equal(sure.govde.reply_markup.inline_keyboard.at(-1)[0].style, "danger");
  await bas(556, `fc:t:${id}:6`, 501);
  assert.ok(o.g.some((x) => x.govde.chat_id === "333" && /Sinem · 3194 → Gelecek — 4-6 gün/.test(x.govde.text || "")));
  // ✏️ Tarih yaz → yazıyla tarih
  await bas(556, `fc:t:${id}:y`, 501);
  await yaz(556, "Sinem", "20.11");
  assert.match(o.g.filter((x) => String(x.govde.chat_id) === "556").at(-1).govde.text, /3194: 20\.11 \(tarih\)/);
  // 2) Geri al → cevap iptal, kart aynı fotoğrafla en alta yeniden
  o.g.length = 0;
  await bas(556, `fc:u:${id}`, 501);
  const yeni = o.g.find((x) => x.metod === "copyMessage" && String(x.govde.chat_id) === "556");
  assert.match(yeni.govde.caption, /↩️ Cevap geri alındı — yeniden seçin/);
  assert.deepEqual(yeni.govde.reply_markup.inline_keyboard.flat().map((d) => d.text).slice(0, 3), ["✅ Gelecek", "🔁 Repete olacak", "❌ Bitti, gelmeyecek"]);
  assert.equal(JSON.parse(o.depo.get("sami:geriAllar"))[0].tur, "fabrika kartı");
  // 3) Az kaldı → Hemra'ya "repete kararı verelim mi?"
  o.g.length = 0;
  await bas(556, `fc:z:${id}`, 502);
  assert.ok(o.g.some((x) => String(x.govde.chat_id) === "333" && /3194 fabrikada bitmek üzere \(Sinem "az kaldı" dedi\)\. Mağaza stoğu: VOLONTE 4 adet\. Repete kararı verelim mi\?/.test(x.govde.caption || x.govde.text || "")));
  // 4) Bitti (3100) → bir daha sorulmaz + Fuat'a onay kartı + Hemra'ya "Ne yapalım?"
  o.g.length = 0;
  await bas(556, `fc:b:${id2}`, 601);
  const fuat = o.g.find((x) => String(x.govde.chat_id) === "557" && /Onaylıyor musunuz\?/.test(x.govde.caption || x.govde.text || ""));
  assert.match(fuat.govde.caption || fuat.govde.text, /^Sinem 3100 için "bitti" dedi\. Onaylıyor musunuz\?/);
  assert.ok(!/\$|fiyat|stok|satılan|kâr/i.test(fuat.govde.caption || fuat.govde.text)); // Fuat gizlilik süzgeci
  assert.deepEqual(fuat.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Onaylıyorum, bitti", "❌ Hayır, yapılabilir"]);
  const hemra = o.g.find((x) => String(x.govde.chat_id) === "333" && /Ne yapalım\?/.test(x.govde.caption || x.govde.text || ""));
  assert.match(hemra.govde.caption || hemra.govde.text, /🟦 VOLONTE · 3100\n❌ Bu mal fabrikada bitti \(Sinem\)\. Mağazada son: yok \(0\)/);
  await bas(557, `fo:e:${id2}`, 7);
  // Fuat onayladıktan sonra Sinem geri alamaz
  await bas(556, `fc:u:${id2}`, 601);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Bu liste gönderildi, değişiklik için Hemra'ya yazın/);
  // 5) Kanıt defteri: tarih, saat, kim, aynen — mühürlü arşivden
  const kanit = await f.kanitGecmisi(o.env, "3100");
  assert.deepEqual(kanit.map((x) => [x.kim, x.ne]), [["Sinem", "Bitti, gelmeyecek"], ["Fuat", "Onayladı: bitti"]]);
  assert.match(f.kanitMetni("3100", kanit), /^📒 3100 fabrika kaydı \(silinemez defter\):\n\d+ \S+ \d\d:\d\d Sinem: Bitti, gelmeyecek — "❌ Bitti, gelmeyecek"\n\d+ \S+ \d\d:\d\d Fuat: Onayladı: bitti/);
  assert.equal((await (await o.env.STOK.get().fetch("https://stok/arsiv-dogrula", { method: "POST", body: "{}" })).json()).tamam, true);
  assert.deepEqual((await f.kanitGecmisi(o.env, "3194")).map((x) => x.ne.replace(/ \(~[\d.]+\)$/, "")).slice(0, 4), ["Gelecek (süre soruldu)", "Gelecek — 4-6 gün", "Gelecek — 20.11 (tarih)", "Geri aldı (önceki: ✅ Sinem: Gelecek — 20.11 (tarih) (~20.11.2026))"]);
  // 6) Hemra "Repete öner" → Venom'a (Patron kartı) fotoğraf + kod + görüş
  await bas(333, `fh:r:${id2}`, 8);
  const oneri = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "bittiOneri" }) })).json();
  assert.deepEqual(oneri.map((x) => [x.kod, x.oneri, x.magaza, x.fabrika.kim, x.fuat && x.fuat.kim, x.tur]), [["3100", "repete", "VOLONTE", "Sinem", "Fuat", "bitti"]]);
  // Bitti model bir daha fabrikaya sorulmaz (yeni listede çıkarılır)
  const bit = JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "fabrika:bitenler" }) })).json()).v);
  assert.ok(bit["3100"]);
  // Patron "repete" → bitenlerden çıkar
  await o.env.STOK.get().fetch("https://stok/kuyruk-ekle", { method: "POST", body: JSON.stringify({ ad: "bittiKarar", kayit: { id: "k1", sip: id2, karar: "repete" } }) });
  const tgx = (e, m, gv) => { o.g.push({ metod: m, govde: gv }); return { ok: true, result: { message_id: 9 } }; };
  await f.bittiKararAdimi(o.env, ist(12), tgx);
  assert.ok(!JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "fabrika:bitenler" }) })).json()).v)["3100"]);
  // 7) Patron "sil" ama mağazada stok var (3194: VOLONTE 4) → silinmez, stok bitince
  await o.env.STOK.get().fetch("https://stok/kuyruk-ekle", { method: "POST", body: JSON.stringify({ ad: "bittiKarar", kayit: { id: "k2", sip: id, karar: "sil" } }) });
  o.g.length = 0;
  await f.bittiKararAdimi(o.env, ist(12), tgx);
  assert.ok(o.g.some((x) => /⛔ 3194 mağazada stokta \(VOLONTE 4 adet\)/.test(x.govde.text || "")));
  assert.ok(!o.depo.has("venom:siteSil"));
});

test("fabrika zinciri: Sinem yazıyla (bitti / 5 gün / hepsi), mal geldi + adet, eksik gelen → Sinem'e soru; toplu cevap; 18:00 özet; deneme sadece Sinem'e", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222", AZIZ_ID: "444", EKIP_IDS: "333,444", FUAT_ID: "557" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }, { id: 557, ad: "Fuat" }, { id: 558, ad: "Nuri" }]));
  o.depo.set("kodlar", JSON.stringify({ 3194: [{ ids: [500], tarih: 1 }], 3100: [{ ids: [600], tarih: 1 }], 3628: [{ ids: [700], tarih: 1 }] }));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "onayda", liste: ["3194", "3100", "3628"].map((kod) => ({ kod, renkler: [{ renk: "siyah", adet: 40 }], magaza: "VOLONTE" })) }) }) });
  const bas = (kim, data, mesaj = 1) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 556: "Sinem", 333: "Hemra", 444: "Aziz" }[kim] || "X" }, data, message: { chat: { id: kim }, message_id: mesaj } } }, o.env);
  const yaz = (kim, ad, text) => g2({ message: { chat: { id: kim, type: "private" }, from: { id: kim, first_name: ad }, text } }, o.env);
  await bas(333, `fb:o:${gun}`);
  // gönderim parça parça (4 model / çalışma) — 3 model tek seferde gider
  const bitti = o.g.find((x) => String(x.govde.chat_id) === "556" && /VOLONTE LİSTESİ – SONU/.test(x.govde.text || ""));
  assert.equal(bitti.govde.reply_markup.inline_keyboard[0][0].text, "✅ Hepsi gelecek");
  // Toplu: Hepsi gelecek → 10-15 gün → bütün kartlar
  o.g.length = 0;
  await bas(556, bitti.govde.reply_markup.inline_keyboard[0][0].callback_data, 90);
  const sec = o.g.find((x) => x.metod === "editMessageText" && /ne zaman hazır olur\?/.test(x.govde.text));
  await bas(556, sec.govde.reply_markup.inline_keyboard[0][1].callback_data, 90); // 10-15 gün
  const ac = await (await o.env.STOK.get().fetch("https://stok/fs-ozet", { method: "POST", body: "{}" })).json();
  assert.deepEqual(ac.map((x) => [x.kod, x.durum, x.teslimSure]).sort(), [["3100", "gelecek", "10-15 gün"], ["3194", "gelecek", "10-15 gün"], ["3628", "gelecek", "10-15 gün"]]);
  assert.ok(o.g.some((x) => x.govde.chat_id === "333" && /Sinem · 🟦 VOLONTE: hepsi gelecek — 10-15 gün .*3 model/.test(x.govde.text || "")));
  // Yazıyla: "3628 5 gün", "3100 bitti"
  o.g.length = 0;
  await yaz(556, "Sinem", "3628 5 gün, 3100 bitti");
  const cev = o.g.filter((x) => String(x.govde.chat_id) === "556").at(-1).govde.text;
  assert.match(cev, /✅ 3628: 5 gün[\s\S]*❌ 3100: bitti — kaydedildi$/);
  assert.ok(o.g.some((x) => String(x.govde.chat_id) === "557" && /Sinem 3100 için "bitti" dedi/.test(x.govde.caption || x.govde.text || "")));
  // Mal geldi: Aziz [📦 Geldi] → adet yazar; 40 istendi 30 geldi → Sinem'e "10 adet eksik geldi, ne zaman gelir?"
  const r3194 = ac.find((x) => x.kod === "3194").id;
  o.g.length = 0;
  await bas(444, `fc:G:${r3194}`);
  assert.match(o.g.filter((x) => String(x.govde.chat_id) === "444").at(-1).govde.text, /3194: kaç adet geldi\?[\s\S]*İstenen: 40 adet/);
  await yaz(444, "Aziz", "30");
  assert.ok(o.g.some((x) => String(x.govde.chat_id) === "444" && /3194: 30 adet geldi \(istenen 40\)\. Sipariş kapandı\. 10 adet eksik/.test(x.govde.text || "")));
  const eksik = o.g.find((x) => String(x.govde.chat_id) === "556" && /10 adet eksik geldi \(istenen 40, gelen 30\)\. Ne zaman gelir\?/.test(x.govde.caption || x.govde.text || ""));
  assert.ok(eksik);
  assert.deepEqual(eksik.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["⏱ 4-6 gün", "⏱ 10-15 gün", "⏱ 15+ gün", "✏️ Tarih yaz", "❌ Gelmeyecek"]);
  assert.ok((await f.kanitGecmisi(o.env, "3194")).some((x) => /Eksik geldi: 10 adet/.test(x.ne)));
  // "hepsi 5 gün" → Sinem'e giden cevapsız kartlar (eksik kalan dahil)
  await yaz(556, "Sinem", "hepsi 5 gün");
  assert.match(o.g.filter((x) => String(x.govde.chat_id) === "556").at(-1).govde.text, /Hepsi gelecek: 5 gün .* 1 kart güncelleniyor/);
  // 18:00 özet (mağaza mağaza)
  const metin = f.sinemOzetMetni(ist(18, 0), [{ kod: "3194", magaza: "VOLONTE", gonderim: ist(10) }, { kod: "7001", magaza: "BLACKROSE", gonderim: ist(10) }], [{ kod: "3628", magaza: "VOLONTE", durum: "gelecek", hazirGun: "2026-10-29" }, { kod: "7002", magaza: "BLACKROSE", durum: "bekliyor" }]);
  assert.match(metin, /🟦 VOLONTE\n• Bugün istenen \(1\): 3194\n• Cevap bekleyen \(0\): yok\n• Teslim tarihi yaklaşan \(1\): 3628 \(29\.10\)\n\n🌹 BLACK ROSE\n• Bugün istenen \(1\): 7001\n• Cevap bekleyen \(1\): 7002/);
  // Küçük deneme: sadece Sinem'e 1 VOLONTE + 1 Black Rose; Nuri ve Fuat'a kart gitmez
  o.g.length = 0;
  o.depo.set("sami:sinemDeneme", JSON.stringify({ v: "3194", b: "7001" }));
  const tgx = (e, m, gv) => { o.g.push({ metod: m, govde: gv }); return { ok: true, result: { message_id: 9 } }; };
  await f.fabrikaZincirAdimi(o.env, ist(11), tgx);
  const giden = o.g.filter((x) => ["sendMessage", "copyMessage", "sendPhoto"].includes(x.metod));
  assert.ok(giden.every((x) => String(x.govde.chat_id) === "556"));
  assert.deepEqual(giden.map((x) => (x.govde.caption || x.govde.text).split("\n").slice(0, 2).join(" | ")), ["🧪 DENEME – üretim yapmayın | 🟦 VOLONTE LİSTESİ – BAŞLANGIÇ (1 model)", "🧪 DENEME – üretim yapmayın | 🟦 VOLONTE", "🧪 DENEME – üretim yapmayın | 🟦 VOLONTE LİSTESİ – SONU (1 model)", "🧪 DENEME – üretim yapmayın | 🌹 BLACK ROSE LİSTESİ – BAŞLANGIÇ (1 model)", "🧪 DENEME – üretim yapmayın | 🌹 BLACK ROSE", "🧪 DENEME – üretim yapmayın | 🌹 BLACK ROSE LİSTESİ – SONU (1 model)"]);
  assert.equal(JSON.parse(o.depo.get("sami:sinemDenemeSonuc")).kartlar.length, 2);
});

test("10 Kasım ACİL: Telegram gönderimi doğrulanır — uzun yazı kısaltılır, düğme hatasında düzeltilip tekrar, olmazsa hata kaydı", async () => {
  const { guvenliGonder } = await import("./tg-guvenli.js");
  const o = ortam();
  const giden = [];
  const cagir = async (m, g) => { giden.push(g); if (g.reply_markup && g.reply_markup.inline_keyboard.flat().some((b) => b.style)) return { ok: false, description: "Bad Request: can't parse inline keyboard button: Field \"style\" is invalid" }; return { ok: true, result: { message_id: 1 } }; };
  const r = await guvenliGonder(o.env, "sami", cagir, "sendPhoto", { chat_id: 222, photo: "p", caption: "x".repeat(1500), reply_markup: { inline_keyboard: [[{ text: "↩️ Geri al", callback_data: "fe:g:a:1", style: "danger" }]] } });
  assert.equal(r.ok, true);
  assert.equal(giden[0].caption.length, 1024); // fotoğraf altı sınırı
  assert.equal(giden[1].reply_markup.inline_keyboard[0][0].style, undefined); // ikinci deneme düz düğme
  const kotu = async () => ({ ok: false, description: "Forbidden: bot was blocked by the user" });
  await guvenliGonder(o.env, "sami", kotu, "sendMessage", { chat_id: 222, text: "3517 kart" });
  assert.deepEqual(JSON.parse(o.depo.get("sami:tgHatalar")).map((x) => [x.metod, x.chat, x.hata]), [["sendMessage", "222", "Forbidden: bot was blocked by the user"]]);
});

test("10 Kasım bütün hatalar: Merdan'a sadece Black Rose; cevaptan sonra sadece Geri al; aynı anda en fazla 5 kart; eski 'Bitti' kartında ekip karar veremez", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", BR_SORUMLU: "222", AZIZ_ID: "444", EKIP_IDS: "333,444", MESAJ_ARASI_MS: "0" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }]));
  o.depo.set("kodlar", JSON.stringify({ 3394: [{ ids: [500], tarih: 1 }], 7001: [{ ids: [600], tarih: 1 }] }));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${gun}`, v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3394", renkler: [{ renk: "siyah", adet: 10 }], magaza: "VOLONTE" }, { kod: "7001", renkler: [{ renk: "bej", adet: 5 }], magaza: "BLACKROSE" }] }) }) });
  const bas = (kim, data, mid = 1) => g2({ callback_query: { id: "c", from: { id: kim, first_name: { 556: "Sinem", 333: "Hemra", 222: "Merdan" }[kim] || "X" }, data, message: { chat: { id: kim }, message_id: mid } } }, o.env);
  await bas(333, `fb:o:${gun}`);
  const kart = (kod) => o.g.find((x) => String(x.govde.chat_id) === "556" && x.govde.caption && x.govde.caption.includes(`\n${kod} ·`));
  const id1 = kart("3394").govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  const id2 = kart("7001").govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await bas(556, `fc:g:${id1}`); await bas(556, `fc:t:${id1}:6`);
  await bas(556, `fc:g:${id2}`); await bas(556, `fc:t:${id2}:6`);
  const bilgi = (kod) => [...new Set(o.g.filter((x) => x.metod === "sendMessage" && new RegExp(`${kod} → Gelecek`).test(x.govde.text || "")).map((x) => String(x.govde.chat_id)))].sort();
  assert.deepEqual(bilgi("3394"), ["333"]); // VOLONTE: sadece Hemra
  assert.deepEqual(bilgi("7001"), ["222", "333"]); // Black Rose: Hemra + Merdan
  // Sinem'in kartında cevaptan sonra sadece ↩️ Geri al; iç bilgi yok
  const son = o.g.filter((x) => x.metod === "editMessageCaption" && String(x.govde.chat_id) === "556").at(-1);
  assert.deepEqual(son.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["↩️ Geri al"]);
  assert.ok(!/Fuat|Hemra/.test(son.govde.caption));
  // eski "Bitti → Ne yapalım?" kartında Merdan karar veremez (Sil sadece Patron'un)
  o.g.length = 0;
  await bas(222, `fk:s:${id2}`, 77);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Bu kart eskidi/);
  assert.deepEqual(cagri(o.g, "editMessageReplyMarkup").at(-1).govde.reply_markup.inline_keyboard, []);
  // Aziz'e 7 modellik liste → aynı anda en fazla 5 kart; biri cevaplanınca 6.'sı gelir
  const g = [];
  const tg = async (e, m, gv) => { g.push({ metod: m, govde: gv }); return { ok: true, result: { message_id: 900 + g.length } }; };
  const modeller = ["3401", "3402", "3403", "3404", "3405", "3406", "3407"].map((kod) => ({ kod, satilan: 1, kalan: 2, grup: "fabrika" }));
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "fabrika:2026-10-29", v: JSON.stringify({ asama: "soruldu", zaman: ist(10, 0, 1), gun: "2026-10-29", magaza: "VOLONTE", sorumlu: "444", modeller, secim: {}, mesajlar: {}, gonderilmedi: modeller.map((m) => m.kod) }) }) });
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "fabrika:kuyruk", v: JSON.stringify({ liste: ["2026-10-29"], gonderim: [] }) }) });
  await f.fabrikaAdimi(o.env, ist(10, 5, 1), tg);
  await f.fabrikaAdimi(o.env, ist(10, 10, 1), tg);
  assert.equal(g.filter((x) => x.govde.reply_markup && String(x.govde.chat_id) === "444").length, 5);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 444, first_name: "Aziz" }, data: "fe:x:2026-10-29:3401", message: { chat: { id: 444 }, message_id: 901 } } }, o.env);
  assert.equal(o.g.filter((x) => x.govde.reply_markup && String(x.govde.chat_id) === "444" && /3406 ·/.test(x.govde.caption || x.govde.text || "")).length, 1); // cevap verince sıradaki
});

// 10 Kasım GÖREV KÂĞIDI (Sami)
test("görev kâğıdı Sami: DENEME karar kartı Patron'a gitmez; Hemra kartında Sil yok; KAGIT=1 iken fabrikaya /stok kapalı, hatırlatmalar ve Sinem özeti kapalı", async () => {
  const f = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", KAGIT: "1" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Fuat" }, { id: 556, ad: "Sinem" }]));
  const tg = async (_e, metod, govde) => { o.g.push({ url: `/${metod}`, govde }); return { ok: true, result: { message_id: 900 + o.g.length } }; };
  const simdi = Math.floor(Date.now() / 1000);
  const rec = await f._test.siparisAc(o.env, { kod: "3459", renkler: [{ renk: "siyah", adet: 1 }], liste: "DK", deneme: true, fotoKod: "3459", grup: "fabrika", magaza: "BLACKROSE" }, simdi);
  Object.assign(rec, { durum: "bitti", cevaplayan: "Sinem (deneme)", cevapZaman: simdi });
  o.g.length = 0;
  await f._test.hemraKarti(o.env, tg, rec, "bitti", "Sinem (deneme)", simdi);
  await f._test.siparisYaz(o.env, rec);
  const kart = o.g.find((x) => /fabrikada bitti/.test(x.govde.caption || x.govde.text || ""));
  assert.equal(String(kart.govde.chat_id), "333");
  const dugmeler = kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text);
  assert.ok(!dugmeler.some((t) => /Sil/.test(t)), dugmeler.join(","));
  const q = kart.govde.reply_markup.inline_keyboard.flat().find((d) => /Repete/.test(d.text)).callback_data;
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra", last_name: "Hemra" }, data: q, message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  const kuyruk = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "bittiOneri" }) })).json();
  assert.equal(kuyruk.length, 0); // Venom'a / Patron'a gitmedi
  assert.ok(o.g.some((x) => /DENEME olduğu için Patron'a GİTMEDİ/.test(x.govde.caption || x.govde.text || "")));
  assert.ok(!o.g.some((x) => /Hemra Hemra/.test(x.govde.caption || x.govde.text || ""))); // ad bir kez
  // fabrikaya stok yok
  o.g.length = 0;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Fuat" }, text: "/stok 3459" } }, o.env);
  assert.match(o.g.map((x) => x.govde.text || "").join("\n"), /Stok bilgisi fabrikaya verilmiyor/);
  const { kagitAcik } = await import("./gorev-kagidi.js");
  for (const is of ["fabrikaHatirlatma", "sinemOzeti", "kartTekrar", "mutabakat", "stokSorulari"]) assert.equal(await kagitAcik(o.env, "sami", is), false, is);
});

test("ACİL 10 Kasım: Aziz/Merdan KENDİ kontrol kartına yazıyla renk/adet girer (deneme dahil) → kart '✅ … – kaydedildi', Geri al kalır; başkasının kartına/olmayan koda giremez; beden değişince tek talimat mesajı", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444", ANTHROPIC_API_KEY: "k" });
  const g = gunAnahtari(Math.floor(Date.now() / 1000));
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const oku = async (k) => JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}` }) })).json()).v);
  await yaz(`${g}-DK`, { asama: "soruldu", zaman: 1, gun: g, magaza: "VOLONTE", sorumlu: "444", deneme: true, modeller: [{ kod: "3394", satilan: 1, kalan: 5 }], secim: {}, mesajlar: { 3394: [71, "foto", "🧪 DENEME\n🟦 VOLONTE\n3394 · satılan 1 · stok 5"] } });
  await yaz(`${g}-BR-DK`, { asama: "soruldu", zaman: 1, gun: g, magaza: "BLACKROSE", sorumlu: "222", deneme: true, modeller: [{ kod: "3459", satilan: 1, kalan: 3 }], secim: {}, mesajlar: { 3459: [72, "foto", "🧪 DENEME\n🌹 BLACK ROSE\n3459 · satılan 1 · stok 3"] } });
  const msj = (id, text) => g2({ message: { chat: { id, type: "private" }, from: { id, first_name: id === 444 ? "Aziz" : "Merdan" }, text } }, o.env);
  // beden: önce İkisi de, sonra Büyük → TEK talimat mesajı (ikincisi düzenlenir)
  o.g.length = 0;
  const bas = (id, data) => g2({ callback_query: { id: "c", from: { id, first_name: "Aziz" }, data, message: { chat: { id }, message_id: 71 } } }, o.env);
  await bas(444, `fe:i:${g}-DK:3394`);
  await bas(444, `fe:b:${g}-DK:3394`);
  const talimat = cagri(o.g, "sendMessage").filter((x) => /📏 3394/.test(x.govde.text));
  assert.equal(talimat.length, 1);
  assert.match(cagri(o.g, "editMessageText").at(-1).govde.text, /^📏 3394: Büyük \(44-50\) için renk\/adet yazın/);
  o.g.length = 0;
  await msj(444, "3394 büyük pudra 12 adet");
  assert.ok(!o.g.some((x) => /işleyemem|girebilir/.test(x.govde.text || "")));
  await teyitEt(o, g2, 444, "Aziz", /^🧪 DENEME[\s\S]*Şunu anladım: 3394 Büyük pudra 12\. Doğru mu\?$/);
  const kart = cagri(o.g, "editMessageCaption").find((x) => x.govde.message_id === 71);
  assert.match(kart.govde.caption, /✅ 3394 büyük pudra 12 – kaydedildi$/);
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["↩️ Geri al"]);
  assert.deepEqual((await oku(`${g}-DK`)).secim["3394"].gruplar.b, [{ renk: "pudra", adet: 12 }]);
  // Merdan kendi kartına
  o.g.length = 0;
  await msj(222, "3459 büyük pudra 8");
  await teyitEt(o, g2, 222, "Merdan");
  assert.match(cagri(o.g, "editMessageCaption").find((x) => x.govde.message_id === 72).govde.caption, /✅ 3459 büyük pudra 8 – kaydedildi$/);
  // Merdan Aziz'in kartındaki modele giremez
  o.g.length = 0;
  await msj(222, "3394 büyük siyah 5");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3394: size gelen açık kontrol kartında yok/);
  assert.equal(cagri(o.g, "editMessageCaption").length, 0);
});

test("10 Kasım: kişi deneme listeleri (Aziz VOLONTE + Merdan Black Rose) 'Eminim, gönder' → ikisi bitince HEMEN Hemra'ya tek liste, mağaza başlıklarıyla; fabrikaya gitmez", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Sinem" }]));
  const g = gunAnahtari(Math.floor(Date.now() / 1000));
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  await yaz("denemeAkis", { gun: "2026-11-01", keys: ["2026-11-01-D1"] }); // eski deneme akışı karışmaz
  const liste = (mag, kime, kod, mesaj) => ({ asama: "eminMi", zaman: 1, gun: g, magaza: mag, sorumlu: kime, deneme: true, modeller: [{ kod, satilan: 1, kalan: 3 }], secim: { [kod]: { beden: "b", gruplar: { b: [{ renk: "pudra", adet: 8 }] } } }, mesajlar: { [kod]: [mesaj, "foto", "x"] } });
  await yaz(`${g}-DK`, liste("VOLONTE", "444", "3394", 71));
  await yaz(`${g}-BR-DK`, liste("BLACKROSE", "222", "3459", 72));
  const bas = (id, data) => g2({ callback_query: { id: "c", from: { id, first_name: "X" }, data, message: { chat: { id }, message_id: 9 } } }, o.env);
  o.g.length = 0;
  await bas(444, `fe:E:${g}-DK:-`);
  assert.ok(!o.g.some((x) => String(x.govde.chat_id) === "333" && /Gidecek liste/.test(x.govde.text || ""))); // Merdan henüz bitirmedi
  await bas(222, `fe:E:${g}-BR-DK:-`);
  const h = o.g.filter((x) => String(x.govde.chat_id) === "333" && /Gidecek liste/.test(x.govde.text || ""));
  assert.equal(h.length, 1);
  assert.match(h[0].govde.text, /^🧪 DENEME[\s\S]*VOLONTE LİSTESİ \(1 model\):[\s\S]*3394[\s\S]*BLACK ROSE LİSTESİ \(1 model\):[\s\S]*3459/);
  assert.ok(!o.g.some((x) => String(x.govde.chat_id) === "555")); // fabrikaya hiçbir şey
});

test("TAM ZİNCİR DENEMESİ (tek seferlik): Aziz + Merdan → Hemra (ayrı başlıklar) → SADECE Sinem (Fuat/Nuri yok) → Sinem 'Bitti' → Fuat'a gitmez → Hemra karar kartı → Venom kuyruğu (🧪); gerçek kayda/bitenlere/kanıta yazılmaz", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444", FUAT_ID: "557" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 555, ad: "Nuri" }, { id: 556, ad: "Sinem" }, { id: 557, ad: "Fuat" }]));
  const g = gunAnahtari(Math.floor(Date.now() / 1000));
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const oku = async (k) => JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}` }) })).json()).v || "null");
  const liste = (mag, kime, kod, mesaj) => ({ asama: "eminMi", zaman: 1, gun: g, magaza: mag, sorumlu: kime, deneme: true, zincir: true, modeller: [{ kod, satilan: 1, kalan: 3 }], secim: { [kod]: { beden: "b", gruplar: { b: [{ renk: "pudra", adet: 8 }] } } }, mesajlar: { [kod]: [mesaj, "foto", "x"] } });
  await yaz(`${g}-DK`, liste("VOLONTE", "444", "3394", 71));
  await yaz(`${g}-BR-DK`, liste("BLACKROSE", "222", "3459", 72));
  const bas = (id, data, ad = "X") => g2({ callback_query: { id: "c", from: { id, first_name: ad }, data, message: { chat: { id }, message_id: 9 } } }, o.env);
  await bas(444, `fe:E:${g}-DK:-`);
  await bas(222, `fe:E:${g}-BR-DK:-`);
  const hl = o.g.find((x) => String(x.govde.chat_id) === "333" && /Gidecek liste/.test(x.govde.text || ""));
  assert.match(hl.govde.text, /VOLONTE LİSTESİ[\s\S]*BLACK ROSE LİSTESİ[\s\S]*SADECE Sinem'e gider; Fuat ve Nuri'ye GİTMEZ/);
  const onay = hl.govde.reply_markup.inline_keyboard[0][0].callback_data;
  o.g.length = 0;
  await bas(333, onay, "Hemra");
  const kime = new Set(o.g.filter((x) => x.govde && x.govde.chat_id != null).map((x) => String(x.govde.chat_id)));
  assert.ok(kime.has("556"), "Sinem'e gitmedi");
  assert.ok(!kime.has("555") && !kime.has("557"), "Fuat/Nuri'ye gitti: " + [...kime].join(","));
  const sinem = o.g.filter((x) => String(x.govde.chat_id) === "556").map((x) => x.govde.text || x.govde.caption || "");
  assert.ok(sinem.some((t) => /🧪 DENEME[\s\S]*VOLONTE LİSTESİ – BAŞLANGIÇ/.test(t)) && sinem.some((t) => /BLACK ROSE LİSTESİ – BAŞLANGIÇ/.test(t)), sinem.join("\n---\n"));
  assert.ok(sinem.some((t) => /SONU/.test(t)));
  const kart = o.g.find((x) => String(x.govde.chat_id) === "556" && x.govde.reply_markup && /3459/.test(x.govde.caption || x.govde.text || ""));
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Gelecek", "🔁 Repete olacak", "❌ Bitti, gelmeyecek", "⚠️ Az kaldı", "⚠️ Fotoğraf yanlış model"]);
  const bitti = kart.govde.reply_markup.inline_keyboard.flat().find((d) => /Bitti/.test(d.text)).callback_data;
  o.g.length = 0;
  await bas(556, bitti, "Sinem");
  assert.ok(!o.g.some((x) => String(x.govde.chat_id) === "557"), "Fuat'a onay kartı gitti");
  const hk = o.g.find((x) => String(x.govde.chat_id) === "333" && /fabrikada bitti/.test(x.govde.caption || x.govde.text || ""));
  assert.ok(hk && /🧪 DENEME/.test(hk.govde.caption || hk.govde.text));
  const rep = hk.govde.reply_markup.inline_keyboard.flat().find((d) => /Repete/.test(d.text)).callback_data;
  await bas(333, rep, "Hemra");
  const q = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "bittiOneri" }) })).json();
  assert.deepEqual(q.map((x) => [x.kod, x.deneme, x.zincir]), [["3459", true, true]]); // Venom'dan Patron'a (🧪)
  assert.equal(await oku("bitenler"), null); // gerçek "bitti" kaydı yok
  const ark = await (await o.env.STOK.get().fetch("https://stok/arsiv-kod", { method: "POST", body: JSON.stringify({ kod: "3459" }) }).catch(() => null))?.json?.().catch(() => []);
  assert.ok(!JSON.stringify(ark || []).includes("fabrika-kanit"));
});

// 10 Kasım (Patron): "Test sadece kolay örnekle yapılmaz; elemanların gerçek yazım şekilleriyle yapılır."
test("serbest yazım çözücü: elemanların GERÇEK yazım şekilleri (sıra serbest, Türkçe harfsiz, adet'li/adetsiz, bitişik, iki beden, çok renk, ekler, Türkmence) — belirsizde TAHMİN YOK", async () => {
  const { serbestCoz, anladimYazisi } = await import("./fabrika.js");
  const dogru = {
    "3394 pudra buyuk 12 adet kucuk pudra 4adet": "3394 Büyük pudra 12, Küçük pudra 4", // Aziz'in gerçek mesajı
    "3459 büyük pudra 8": "3459 Büyük pudra 8", // Merdan'ın gerçek mesajı
    "3394 büyük pudra 12 adet": "3394 Büyük pudra 12",
    "3394 pudra büyük 12": "3394 Büyük pudra 12",
    "3394 buyuk pudra 12 kucuk pudra 4": "3394 Büyük pudra 12, Küçük pudra 4",
    "3394 büyük siyah 10 bej 6": "3394 Büyük siyah 10, bej 6",
    "3394 küçük 10 siyah": "3394 Küçük siyah 10",
    "3394 Büyük Pudra 12 Adet, Küçük Pudra 4 Adet": "3394 Büyük pudra 12, Küçük pudra 4",
    "3394 b pudra 12 k pudra 4": "3394 Büyük pudra 12, Küçük pudra 4",
    "3394 büyük pudra 12ad": "3394 Büyük pudra 12",
    "3394 pudra 12 büyük": "3394 Büyük pudra 12",
    "3394 büyük: pudra 12, siyah 3": "3394 Büyük pudra 12, siyah 3",
    "3394 buyuk beden pudra 12 adet": "3394 Büyük pudra 12",
    "3394 BUYUK PUDRA 12": "3394 Büyük pudra 12",
    "3394 büyükten pudra 12 tane, küçükten de 4 tane pudra lazım": "3394 Büyük pudra 12, Küçük pudra 4",
    "3394 icin pudradan buyuk 12": "3394 Büyük pudra 12",
    "3394 büyük'ten pudra 12": "3394 Büyük pudra 12",
    "3394 uly pudra 12 kiçi pudra 4": "3394 Büyük pudra 12, Küçük pudra 4",
    "3394 büyük pudra 12, 3459 küçük siyah 5": "3394 Büyük pudra 12; 3459 Küçük siyah 5",
    "3394 pudra 12": "3394 pudra 12", // beden karttaki seçimden gelir ya da sorulur
  };
  for (const [metin, beklenen] of Object.entries(dogru)) { const r = serbestCoz(metin); assert.ok(r, `anlamadı: ${metin}`); assert.equal(anladimYazisi(r), beklenen, metin); }
  for (const metin of ["3394 ikisi de pudra 12", "3394 pudra 3 seri", "3394 büyük pudra 12 küçük", "3394 büyük pudra", "3394 aynısı", "3394 большой пудра 12", "3394 0 pudra", "3394 bu sefer isteme", "3394 kaç tane kaldı", "pudra 12"]) assert.equal(serbestCoz(metin), null, `tahmin etmemeli: ${metin}`);
});

test("Aziz'in gerçek mesajı ('3394 pudra buyuk 12 adet kucuk pudra 4adet', İkisi de seçili) → teyit → ✅ Evet → kart iki bedenle kaydedildi; ✏️ Düzelt kaydetmez; anlaşılmazsa örnekle sorar; 'sadece Hemra' ASLA", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  const g = gunAnahtari(Math.floor(Date.now() / 1000));
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const oku = async (k) => JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}` }) })).json()).v);
  await yaz(`${g}-DK`, { asama: "soruldu", zaman: 1, gun: g, magaza: "VOLONTE", sorumlu: "444", deneme: true, modeller: [{ kod: "3394", satilan: 1, kalan: 48 }], secim: { 3394: { beden: "i", gruplar: {} } }, mesajlar: { 3394: [71, "foto", "🧪 DENEME\n🟦 VOLONTE\n3394 · satılan 1 · stok 48"] } });
  const msj = (text) => g2({ message: { chat: { id: 444, type: "private" }, from: { id: 444, first_name: "Aziz" }, text } }, o.env);
  // ✏️ Düzelt → kaydedilmez
  await msj("3394 pudra buyuk 12 adet kucuk pudra 4adet");
  const t1 = o.g.filter((x) => /Şunu anladım/.test(x.govde.text || "")).at(-1);
  assert.equal(t1.govde.text, "🧪 DENEME – üretim yapmayın\nŞunu anladım: 3394 Büyük pudra 12, Küçük pudra 4. Doğru mu?");
  await g2({ callback_query: { id: "c", from: { id: 444, first_name: "Aziz" }, data: t1.govde.reply_markup.inline_keyboard[0][1].callback_data, message: { chat: { id: 444 }, message_id: 80 } } }, o.env);
  assert.match(cagri(o.g, "editMessageText").at(-1).govde.text, /^🧪 DENEME – üretim yapmayın\n✏️ Kaydedilmedi\. Yeniden yazın\.\nÖrnek: 3394 büyük pudra 12, küçük pudra 4$/);
  assert.deepEqual((await oku(`${g}-DK`)).secim["3394"].gruplar, {});
  // başkası basamaz, eski teyit geçersiz
  o.g.length = 0;
  await msj("3394 pudra buyuk 12 adet kucuk pudra 4adet");
  const t2 = await teyitEt(o, g2, 444, "Aziz", /Şunu anladım: 3394 Büyük pudra 12, Küçük pudra 4\. Doğru mu\?$/);
  const kart = cagri(o.g, "editMessageCaption").find((x) => x.govde.message_id === 71);
  assert.match(kart.govde.caption, /✅ 3394 küçük pudra 4, büyük pudra 12 – kaydedildi$/); // kayıttan (iki beden de)
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["↩️ Geri al"]);
  const sc = (await oku(`${g}-DK`)).secim["3394"];
  assert.deepEqual([sc.beden, sc.gruplar.b, sc.gruplar.k], ["i", [{ renk: "pudra", adet: 12 }], [{ renk: "pudra", adet: 4 }]]);
  assert.ok(o.g.some((x) => /Göndereyim mi\?/.test(x.govde.text || ""))); // kart tamam → "emin misin" özeti
  await g2({ callback_query: { id: "c", from: { id: 444, first_name: "Aziz" }, data: t2.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 444 }, message_id: 77 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /artık geçerli değil/); // ikinci basış işlemez
  // anlaşılmayan yazı (yapay zekâ yok) → örnekle yeniden sorar; "sadece Hemra" asla
  o.g.length = 0;
  await yaz(`${g}-DK`, { asama: "soruldu", zaman: 1, gun: g, magaza: "VOLONTE", sorumlu: "444", deneme: true, modeller: [{ kod: "3394", satilan: 1, kalan: 48 }], secim: {}, mesajlar: { 3394: [71, "foto", "x"] } });
  await msj("3394 ikisi de pudra 12");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^🧪 DENEME – üretim yapmayın\nTam anlayamadım\. Kod, beden, renk ve adet yazın\.\nÖrnek: 3394 büyük pudra 12, küçük pudra 4$/); // deneme kartı → 🧪
  await msj("3394 pudra 12"); // beden yazılmadı, kartta beden seçilmedi → beden sorulur
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^🧪 DENEME – üretim yapmayın\n3394: hangi beden\? Küçük mü, büyük mü\?/);
  assert.ok(!o.g.some((x) => /sadece Hemra|Murat girebilir|işleyemem/.test(x.govde.text || "")));
});

test("kalıba uymayan yazı → OPUS anlar (model claude-opus-5-5) → teyit; karta ait olmayan kod → tahmin yok; soru → beyne", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = beyinOrtami([ // 10 Kasım: Opus 5.5'te zorunlu araç seçimi yok → yapılandırılmış çıktı (JSON metin)
    metinCevap(JSON.stringify({ tur: "liste", gruplar: [{ kod: "3459", beden: "b", renkler: [{ renk: "pudra", adet: 8 }] }, { kod: "3459", beden: "k", renkler: [{ renk: "pudra", adet: 3 }] }] })),
    metinCevap(JSON.stringify({ tur: "liste", gruplar: [{ kod: "9999", beden: "b", renkler: [{ renk: "pudra", adet: 8 }] }] })),
  ]);
  Object.assign(o.env, { AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  const g = gunAnahtari(Math.floor(Date.now() / 1000));
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${g}-BR-DK`, v: JSON.stringify({ asama: "soruldu", zaman: 1, gun: g, magaza: "BLACKROSE", sorumlu: "222", deneme: true, modeller: [{ kod: "3459", satilan: 1, kalan: 4 }], secim: {}, mesajlar: { 3459: [72, "foto", "x"] } }) }) });
  const msj = (text) => g2({ message: { chat: { id: 222, type: "private" }, from: { id: 222, first_name: "Merdan" }, text } }, o.env);
  await msj("3459 uly bedenden pudra renginden 8 sany, kici bedenden 3 sany bolsun");
  assert.equal(o.claude.length, 1);
  assert.equal(o.claude[0].model, "claude-opus-5-5");
  assert.equal(o.claude[0].tool_choice, undefined); // Opus 5.5: zorunlu araç seçimi 400 verir
  assert.equal(o.claude[0].output_config.format.type, "json_schema");
  assert.match(o.g.filter((x) => /Şunu anladım/.test(x.govde.text || "")).at(-1).govde.text, /Şunu anladım: 3459 Büyük pudra 8, Küçük pudra 3\. Doğru mu\?$/);
  o.g.length = 0;
  await msj("3459 icin bir seyler daha yaz 8 sany");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^🧪 DENEME – üretim yapmayın\nTam anlayamadım/); // Opus karta ait olmayan kod verdi → tahmin yok
  assert.ok(!o.g.some((x) => /Şunu anladım/.test(x.govde.text || "")));
});

// KURALLAR 33: gerçek yazım havuzu (100 mesaj, 4 bakış: hızlı yazan, biçim, konuşur gibi, Türkmence/Rusça/tuzak).
// Çözücü YANLIŞ anlamaz ve belirsizde TAHMİN etmez; anlamadıkları Opus'a gider (teyitli).
test("gerçek yazım havuzu (100 mesaj): çözücü hiçbirini YANLIŞ anlamaz, belirsizde TAHMİN etmez; en az 75'i doğrudan anlaşılır", async () => {
  const fs = await import("node:fs");
  const { serbestCoz } = await import("./fabrika.js");
  const havuz = JSON.parse(fs.readFileSync(new URL("./test-veri/sami-yazim-havuzu.json", import.meta.url), "utf8"));
  const norm = (gr) => (gr || []).flatMap((g) => g.renkler.map((r) => `${g.kod}|${g.beden || "-"}|${String(r.renk).toLocaleLowerCase("tr").trim()}|${r.adet}`)).sort().join(" ; ");
  let dogru = 0;
  const hatalar = [];
  for (const x of havuz) {
    const p = serbestCoz(x.metin);
    if (x.beklenen_tur === "belirsiz") { if (p) hatalar.push(`TAHMİN: ${x.metin} → ${norm(p)}`); else dogru++; continue; }
    if (!p) continue; // Opus'a gider
    if (norm(p) === norm(x.gruplar)) dogru++; else hatalar.push(`YANLIŞ: ${x.metin} → ${norm(p)} (beklenen ${norm(x.gruplar)})`);
  }
  assert.deepEqual(hatalar, []);
  assert.ok(dogru >= 75, `doğru: ${dogru}`);
});

test("inceleme bulguları (10 Kasım): '3394 geldi 30' eksik yoluna takılmaz; deneme+gerçek aynı kod → sorar; aynı beden birleşir; eski teyit geçersiz; ACİL ⚡ en az 40; dünden kalan liste tamamlanır", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const f = await import("./fabrika.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  const simdi = Math.floor(Date.now() / 1000), g = gunAnahtari(simdi), dun = gunAnahtari(simdi - 86400);
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const oku = async (k) => JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}` }) })).json()).v || "null");
  const liste = (kodlar, ek = {}) => ({ asama: "soruldu", zaman: simdi, gun: g, magaza: "VOLONTE", sorumlu: "444", modeller: kodlar.map((kod) => ({ kod, satilan: 2, kalan: 3 })), secim: {}, mesajlar: Object.fromEntries(kodlar.map((kod, i) => [kod, [70 + i, "foto", `🟦 VOLONTE\n${kod}`]])), gonderilmedi: [], ...ek });
  const msj = (text, id = 444) => g2({ message: { chat: { id, type: "private" }, from: { id, first_name: id === 444 ? "Aziz" : "Merdan" }, text } }, o.env);
  const bas = (data, id = 444) => g2({ callback_query: { id: "c", from: { id, first_name: "Aziz" }, data, message: { chat: { id }, message_id: 90 } } }, o.env);
  await yaz(g, liste(["3394", "3500"]));
  // 1) geliş bildirimi eksik yoluna takılmaz
  o.g.length = 0;
  await msj("3394 geldi 30");
  assert.ok(!o.g.some((x) => /Şunu anladım|kontrol kartında yok/.test(x.govde.text || "")));
  // 2) aynı kod hem 🧪 deneme hem gerçek kartta → tahmin yok, sorar
  await yaz(`${g}-DK`, liste(["3394"], { deneme: true }));
  o.g.length = 0;
  await msj("3394 büyük pudra 12");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3394: birden fazla açık kartınızda var/);
  await yaz(`${g}-DK`, { asama: "iptal" });
  // 3) kartta Büyük seçili; "3394 pudra 12, büyük siyah 5" → aynı beden BİRLEŞİR (pudra kaybolmaz)
  const L = liste(["3394", "3500"]); L.secim = { 3394: { beden: "b", gruplar: {} } };
  await yaz(g, L);
  o.g.length = 0;
  await msj("3394 pudra 12, büyük siyah 5");
  const t = await teyitEt(o, g2, 444, "Aziz", /Şunu anladım: 3394 Büyük pudra 12, siyah 5\. Doğru mu\?$/);
  assert.deepEqual((await oku(g)).secim["3394"].gruplar.b, [{ renk: "pudra", adet: 12 }, { renk: "siyah", adet: 5 }]);
  assert.match(cagri(o.g, "editMessageText").at(-1).govde.text, /^✅ Kaydedildi: 3394 Büyük pudra 12, siyah 5$/);
  // 4) eski teyit: A yazılır, B yazılır → A'nın düğmesi geçersiz
  o.g.length = 0;
  await msj("3500 küçük bej 4");
  const A = o.g.filter((x) => /Şunu anladım/.test(x.govde.text || "")).at(-1);
  await msj("3500 küçük bej 6");
  await bas(A.govde.reply_markup.inline_keyboard[0][0].callback_data);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /artık geçerli değil/);
  assert.ok(cagri(o.g, "editMessageText").some((x) => /Yerine yeni teyit geldi/.test(x.govde.text)));
  // 5) ACİL: ⚡ ve en az 40 adet
  await o.env.STOK.get().fetch("https://stok/kuyruk-ekle", { method: "POST", body: "{}" }).catch(() => null);
  await yaz("acil", { 3477: { magaza: "VOLONTE", min: 40, not: "stok ~2 günde bitiyor", zaman: simdi, bitis: simdi + 86400 } });
  await yaz(g, liste(["3477"]));
  o.g.length = 0;
  await msj("3477 büyük siyah 10");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^⚡ 3477 ACİL \(stok ~2 günde bitiyor\): en az 40 adet isteyin — yazdığınız toplam 10\./);
  await msj("3477 büyük siyah 30 küçük siyah 10");
  assert.match(o.g.filter((x) => /Şunu anladım/.test(x.govde.text || "")).at(-1).govde.text, /3477 Büyük siyah 30, Küçük siyah 10/);
  // 6) dünden kalan (Black Rose): bugünkü listede olan çıkar, kalan hepsi seçiliyse "Göndereyim mi?"
  await yaz(`${dun}-BR`, { asama: "soruldu", zaman: simdi - 86400, gun: dun, magaza: "BLACKROSE", sorumlu: "222", modeller: [{ kod: "7001", satilan: 1, kalan: 2 }, { kod: "7002", satilan: 1, kalan: 2 }], secim: { 7001: { beden: "k", gruplar: { k: [{ renk: "siyah", adet: 5 }] } }, 7002: { beden: "b", gruplar: { b: [{ renk: "bej", adet: 3 }] } } }, mesajlar: { 7001: [81, "foto", "x"], 7002: [82, "foto", "y"] }, gonderilmedi: [] });
  await yaz(`birlesik:${g}`, [`${g}-T1`]);
  await yaz(`${g}-T1`, { asama: "gonderildi", liste: [{ kod: "7002", magaza: "BLACKROSE", beden: "b", renkler: [{ renk: "bej", adet: 3 }] }] });
  o.depo.set("sami:islemler", JSON.stringify([{ tur: "dunTamamla", anahtar: `${dun}-BR` }]));
  const tg2 = async (_e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 900 + o.g.length } }; };
  o.g.length = 0;
  await f.fabrikaZincirAdimi(o.env, simdi, tg2);
  const d2 = await oku(`${dun}-BR`);
  assert.deepEqual(d2.modeller.map((x) => x.kod), ["7001"]); // 7002 bugün zaten istendi
  assert.ok(o.g.some((x) => x.govde.message_id === 82 && /bugünkü listede; burada tekrar istenmez/.test(x.govde.caption || "")));
  assert.ok(o.g.some((x) => String(x.govde.chat_id) === "222" && /Göndereyim mi\?/.test(x.govde.text || "")));
});

test("ACİL EK LİSTE (10 Kasım akşam): bugünkü liste gitmişken ⚡ acil model Aziz'e ek liste → en az 40 → Hemra onayı → fabrikada eski istek kapanır, ⚡ YERİNE kartı; Patron'a tek satır", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const f = await import("./fabrika.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }]));
  const simdi = Math.floor(Date.now() / 1000), g = gunAnahtari(simdi);
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const tg2 = async (_e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 700 + o.g.length } }; };
  o.depo.set("kodlar", JSON.stringify({ 3477: [{ ids: [650], tarih: 1 }] })); // kanaldaki fotoğraf (fabrika kartı için)
  await yaz(g, { asama: "birlesti", zaman: simdi - 3600, gun: g, magaza: "VOLONTE", sorumlu: "444", modeller: [{ kod: "3477", satilan: 3, kalan: 5 }], secim: {}, mesajlar: { 3477: [60, "foto", "x"] }, gonderilmedi: [] });
  // fabrikada bugünkü eski istek: 3477 küçük beyaz 4
  const eski = await f._test.siparisAc(o.env, { kod: "3477", renkler: [{ renk: "beyaz", adet: 4 }], beden: "k", liste: `${g}-T4`, deneme: false, fotoKod: "3477", grup: "fabrika", magaza: "VOLONTE" }, simdi - 1800);
  await f._test.fabrikayaGonder(o.env, eski, tg2);
  o.depo.set("sami:islemler", JSON.stringify([{ tur: "acilYaz", kodlar: [{ kod: "3477", magaza: "VOLONTE", min: 40, not: "stok ~2 günde bitiyor" }] }]));
  o.g.length = 0;
  await f.fabrikaZincirAdimi(o.env, simdi, tg2);
  const kart = o.g.find((x) => String(x.govde.chat_id) === "444" && /3477/.test(x.govde.caption || x.govde.text || "") && x.govde.reply_markup);
  assert.match(kart.govde.caption || kart.govde.text, /⚡ ACİL — stok ~2 günde bitiyor · en az 40 adet isteyin/);
  assert.ok(o.g.some((x) => String(x.govde.chat_id) === "444" && /⚡ ACİL EK LİSTE/.test(x.govde.text || "")));
  const ekAd = `${g}-acil1`;
  const msj = (text) => g2({ message: { chat: { id: 444, type: "private" }, from: { id: 444, first_name: "Aziz" }, text } }, o.env);
  o.g.length = 0;
  await msj("3477 küçük beyaz 4");
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /en az 40 adet isteyin — yazdığınız toplam 4/);
  await msj("3477 büyük beyaz 30 küçük beyaz 10");
  await teyitEt(o, g2, 444, "Aziz", /Şunu anladım: 3477 Büyük beyaz 30, Küçük beyaz 10\. Doğru mu\?/);
  await eminim(o, g2, 444, "Aziz");
  const hl = o.g.find((x) => String(x.govde.chat_id) === "333" && /Gidecek liste/.test(x.govde.text || ""));
  assert.match(hl.govde.text, /⚡ ACİL \(listenin başında, en az 40 adet\): 3477/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: hl.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const sinem = o.g.filter((x) => String(x.govde.chat_id) === "556").map((x) => x.govde.caption || x.govde.text || "");
  assert.ok(sinem.some((t) => /⚡ ACİL — bugünkü isteğin YERİNE bu geçerli[\s\S]*3477/.test(t)), sinem.join("\n---\n"));
  assert.ok(!sinem.some((t) => /stok|~2 gün/.test(t))); // fabrikaya stok bilgisi gitmez
  const kapanan = o.g.filter((x) => /Bu istek yerine ⚡ ACİL istek geldi/.test(x.govde.caption || x.govde.text || ""));
  assert.equal(kapanan.length, 1); // SADECE eski kart kapandı (10 Kasım hatası: aynı listenin Küçük satırı da kapanıyordu)
  assert.ok(!/küçük|Küçük \(38-44\) · beyaz 10/.test(kapanan[0].govde.caption || kapanan[0].govde.text || "") || /beyaz 4/.test(kapanan[0].govde.caption || ""));
  const yeniKartlar = sinem.filter((t) => /⚡ ACİL — bugünkü isteğin YERİNE bu geçerli[\s\S]*3477/.test(t));
  assert.equal(yeniKartlar.length, 2); // iki beden satırı da fabrikada açık
  const fg = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "fabrikaGitti" }) })).json();
  assert.match(fg.at(-1).metin, /^Bugünkü eksik listesi fabrikaya gitti: VOLONTE 1 model, Black Rose 0 model\.$/);
  assert.ok(ekAd);
});

test("satış sayımı (10 Kasım): ofis ile Sami AYNI yöntem — toplam BÜTÜN modellerden (ilk 8 değil), indirimli ayrı; fark iki kontrolde sürerse Venom'a 'satış sayısı uyuşmuyor'", async () => {
  const { satisSayimKontrol } = await import("./sami.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  const simdi = Math.floor(Date.now() / 1000), g = gunAnahtari(simdi);
  // 12 model satılmış (Black Rose bugün 61 adet gibi): ilk 8'in toplamı eksik sayardı
  const kalemler = [12, 9, 7, 6, 5, 4, 4, 4, 3, 3, 2, 2].map((adet, i) => ({ kod: String(3500 + i), adet }));
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun: g, kalemler: [...kalemler, { kod: "2000", adet: 5 }] }) });
  const x = await (await o.env.STOK.get().fetch("https://stok/satis-sayim", { method: "POST", body: JSON.stringify({ gun: g, magaza: "BLACKROSE" }) })).json();
  assert.equal(x.toplam, 61);
  assert.equal(x.model, 12);
  assert.equal(x.indirimliAdet, 5); // indirimli mal (2000) ayrı
  assert.equal(x.liste.slice(0, 8).reduce((t, y) => t + y.satilan, 0), 51); // eski ofis hatası: sadece ilk 8 sayılıyordu
  // ofis aynı sayıyı gösteriyorsa sessiz; fark iki kontrolde sürerse Venom'a hata
  o.depo.set(`ofis:satisGosterilen:${g}`, JSON.stringify({ zaman: simdi, BLACKROSE: 61, VOLONTE: 0 }));
  assert.deepEqual(await satisSayimKontrol(o.env, simdi), { ok: true });
  o.depo.set(`ofis:satisGosterilen:${g}`, JSON.stringify({ zaman: simdi, BLACKROSE: 45, VOLONTE: 0 }));
  assert.equal((await satisSayimKontrol(o.env, simdi)).ilk, true);
  assert.equal(o.depo.get("venom:yetenekIstekleri"), undefined); // ilk görüşte bildirilmez
  const r = await satisSayimKontrol(o.env, simdi + 300);
  assert.match(r.metin, /Satış sayısı uyuşmuyor .*BLACK ROSE: ofis 45, Sami 61/);
  assert.match(JSON.parse(o.depo.get("venom:yetenekIstekleri")).at(-1).istek, /Satış sayısı uyuşmuyor/);
});

// 11 Kasım HATA: VOLONTE listesinin son satırları (5 kart sınırı) ertesi sabah gidince Venom satırı "bugün" sayıyordu → önceki akşam giden Black Rose "0 model"
test("Venom 'fabrikaya gitti' satırı listenin KENDİ gününü sayar: dün akşam giden Black Rose + bu sabah biten VOLONTE → ikisi de sayılır, tarih yazar", async () => {
  const f = await import("./fabrika.js");
  const { gunAnahtari } = await import("./worker.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111", AZIZ_ID: "444", BR_SORUMLU: "222", ALLOWED_IDS: "111,222", EKIP_IDS: "333,444" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }]));
  const simdi = Math.floor(Date.now() / 1000), dun = gunAnahtari(simdi - 86400);
  const yaz = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: `fabrika:${k}`, v: JSON.stringify(v) }) });
  const tg2 = async (_e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 700 + o.g.length } }; };
  o.depo.set("kodlar", JSON.stringify({ 3394: [{ ids: [650], tarih: 1 }] })); // kanaldaki fotoğraf (fabrika kartı için)
  await yaz(`${dun}-T3`, { asama: "gonderildi", gun: dun, magaza: "BLACKROSE", liste: [{ kod: "3279", magaza: "BLACKROSE", renkler: [{ renk: "siyah", adet: 5 }] }, { kod: "3514", magaza: "BLACKROSE", renkler: [{ renk: "bej", adet: 5 }] }], gonderilecek: [], giden: 6, fabrikaBildirildi: simdi - 50000 });
  await yaz(`${dun}-T4`, { asama: "gonderildi", gun: dun, magaza: "VOLONTE", liste: [{ kod: "3394", magaza: "VOLONTE", renkler: [{ renk: "pudra", adet: 8 }] }], gonderilecek: [0], giden: 0 });
  await yaz(`birlesik:${dun}`, [`${dun}-T3`, `${dun}-T4`]);
  await f._test.gonderimParcasi(o.env, `${dun}-T4`, tg2, simdi);
  const fg = await (await o.env.STOK.get().fetch("https://stok/kuyruk-al", { method: "POST", body: JSON.stringify({ ad: "fabrikaGitti" }) })).json();
  const [y, a, gn] = dun.split("-");
  assert.equal(fg.at(-1).metin, `${gn}.${a}.${y} eksik listesi fabrikaya gitti: VOLONTE 1 model, Black Rose 2 model.`);
});
