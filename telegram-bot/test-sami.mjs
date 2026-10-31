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
  r = await rapor(ist(18, 0)); // 23 saat sinyal yok
  assert.match(r.metin, /16 saattir sinyal yok/);
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
  assert.deepEqual(g.slice(1).map((x) => [x.metod, x.govde.caption || x.govde.text]), [["copyMessage", "3183 · satılan 8 · stok 4"], ["sendMessage", "3186 · satılan 2 · stok 0 🔴\n📷 fotoğraf yok"]]); // tek mesaj: kanal fotoğrafı + düğmeler
  assert.deepEqual(g[1].govde.reply_markup.inline_keyboard.map((r) => r.map((d) => d.text)), [["Küçük 38-44", "Büyük 44-50", "İkisi de"], ["⏭ Bu sefer isteme"]]); // önceki kayıt yok → "Önceki gibi" yok
  assert.ok(!JSON.stringify(g).includes("7001"));
  await fabrikaAdimi(o.env, ist(14, 30), tg);
  assert.equal(g.length, 3); // günde tek liste
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
  assert.equal(nuri.govde.caption, "3183 · Küçük (38-44) · siyah 10 · bej 6"); // stok/satış/fiyat yok, beden açık
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === 555).length, 0); // fotoğrafsız mesaj yok
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111").govde.text, /onaylayan: Hemra[\s\S]*3183 — Küçük \(38-44\): siyah 10, bej 6\n⏭ İstenmeyen: 3186/);
  // Nuri ✅ Gelecek → "Kaç günde hazır olur?" → 3 gün; o gün Murat'a ve Hemra'ya "geldi mi?"
  const nid = nuri.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 555, first_name: "Nuri" }, data: `fc:g:${nid}`, message: { chat: { id: 555 }, message_id: nuri.mesajId || 0 } } }, o.env);
  await g2({ callback_query: { id: "c", from: { id: 555, first_name: "Nuri" }, data: `fc:t:${nid}:3`, message: { chat: { id: 555 }, message_id: 0 } } }, o.env);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111" && /Nuri · 3183 → 3 günde hazır \(31\.10\.2026\)/.test(x.govde.text)));
  const { siparisTakip, haftalikMetin } = await import("./fabrika.js");
  const tgt = (e, m, gv) => { o.g.push({ metod: m, govde: gv }); return { ok: true, result: { message_id: 9 } }; };
  o.g.length = 0;
  await siparisTakip(o.env, ist(9, 0, 3), tgt);
  assert.ok(!o.g.some((x) => /hazır olmalıydı/.test(x.govde.text || "")));
  await siparisTakip(o.env, ist(10, 5, 3), tgt);
  const hz = cagri(o.g, "sendMessage").filter((x) => /3183 bugün hazır olmalıydı \(Nuri 31\.10\.2026 demişti\)\. Geldi mi\?/.test(x.govde.text));
  assert.deepEqual(hz.map((x) => x.govde.chat_id).sort(), ["111", "333"]);
  // ertesi gün: 3183 tekrar listede → son istenen hazır öneri + "Önceki gibi iste"; 12 satış → 🔥
  g.length = 0;
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-29", kalemler: [{ kod: "3183", adet: 12 }] }) });
  await fabrikaAdimi(o.env, ist(10, 0, 1), tg);
  await fabrikaAdimi(o.env, ist(10, 10, 1), tg);
  assert.equal(g[1].govde.caption, "3183 · satılan 12 · stok 4\n🔥 hızlı gidiyor, fazla iste\nSon istenen: Küçük · siyah 10, bej 6");
  assert.deepEqual(g[1].govde.reply_markup.inline_keyboard[1].map((d) => d.text), ["🔁 Önceki gibi iste", "⏭ Bu sefer isteme"]);
  await fabrikaAdimi(o.env, ist(11, 5, 1), tg);
  assert.equal(g.length, 2); // liste 10:10'da gitti → hatırlatma 11:10
  await fabrikaAdimi(o.env, ist(11, 10, 1), tg);
  // 1 saat dolunca sadece karar verilmeyen modeller: önce "şu 1 model kaldı", sonra o model aynı düğmelerle
  assert.match(g.at(-2).govde.text, /⏰ 29\.10\.2026 VOLONTE eksik listesi: şu 1 model kaldı: 3183/);
  assert.match(g.at(-1).govde.text, /^⏳ 3183 · satılan 12/);
  assert.deepEqual(g.at(-1).govde.reply_markup.inline_keyboard[0].map((d) => d.callback_data), ["fe:k:2026-10-29:3183", "fe:b:2026-10-29:3183", "fe:i:2026-10-29:3183"]);
  await fabrikaAdimi(o.env, ist(12, 10, 1), tg);
  assert.equal(g.at(-1).govde.chat_id, "111");
  assert.match(g.at(-1).govde.text, /VOLONTE eksik listesi: Hemra onaylamadı/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: "fe:o:2026-10-29:3183", message: { chat: { id: 333 }, message_id: 9 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3183 — Küçük \(38-44\): siyah 10, bej 6[\s\S]*Gönderilsin mi\?/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: "fb:o:2026-10-29", message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const murat = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111").govde.text;
  assert.match(murat, /3183 — Küçük \(38-44\): siyah 10, bej 6 🔥/); // 🔥 sadece Hemra ve Murat'ta
  assert.ok(![...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage")].filter((x) => x.govde.chat_id === 555).some((x) => /🔥|hızlı/.test(x.govde.text || x.govde.caption)));
  // Sonradan yeni model satılır → 10 dk sabit kalınca sadece yeni model EK olarak; Hemra'nın cevabı eke yazılır
  g.length = 0;
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-29", kalemler: [{ kod: "3183", adet: 13 }, { kod: "3186", adet: 1 }] }) });
  await fabrikaAdimi(o.env, ist(13, 0, 1), tg);
  assert.equal(g.length, 0);
  await fabrikaAdimi(o.env, ist(13, 10, 1), tg);
  assert.match(g[0].govde.text, /EK: listeden sonra satılan yeni modeller: 1 model, toplam 1 adet/);
  assert.ok(g.slice(1).every((x) => /^3186 ·/.test(x.govde.text)));
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
  assert.equal(kopya[0].govde.caption, "3194 · siyah 10");
  assert.ok(!/\$|fiyat|stok|satılan/i.test(kopya[0].govde.caption));
  const kl = kopya[0].govde.reply_markup.inline_keyboard.flat().map((d) => d.text);
  assert.deepEqual(kl, ["✅ Gelecek", "🔁 Repete olacak", "❌ Bitti, gelmeyecek", "⚠️ Fotoğraf yanlış model"]);
  const id = kopya[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  // ⚠️ fotoğraf yanlış → Murat + Hemra
  o.g.length = 0;
  await bas(555, `fc:y:${id}`);
  assert.deepEqual(cagri(o.g, "sendMessage").map((x) => x.govde.chat_id).sort(), ["111", "333"]);
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
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111").govde.text, /Sinem · 3194 → Repete, 5 gün/);
  assert.ok(cagri(o.g, "editMessageCaption").every((x) => /Sinem cevapladı: Repete olacak — 5 gün/.test(x.govde.caption)));
  // süre dolunca bir kez "hazır mı?"
  o.g.length = 0;
  await f.siparisTakip(o.env, Math.floor(Date.now() / 1000) + 6 * 86400, (e, m, g) => { o.g.push({ metod: m, govde: g }); return { ok: true, result: { message_id: 9 } }; });
  assert.equal(cagri(o.g, "sendMessage").filter((x) => /repetesi hazır mı/.test(x.govde.text)).length, 2);
  // Nuri yazıyla bildirir → onay sorusu → Evet → Murat/Hemra'ya + Kemal sırası
  o.g.length = 0;
  await g2({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Nuri" }, text: "3194 repete geldi siyah 8" } }, o.env);
  const soru = cagri(o.g, "sendMessage")[0];
  assert.match(soru.govde.text, /3194 repete geldi – siyah 8, doğru mu\?/);
  o.g.length = 0;
  await bas(555, soru.govde.reply_markup.inline_keyboard[0][0].callback_data, 77);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /📦 3194 repete geldi – siyah 8 \(Nuri bildirdi\)/);
  assert.deepEqual(JSON.parse(o.depo.get("venom:repetePaylas")).map((x) => [x.kod, x.deneme]), [["3194", false]]);
  // Bitti → karar → Sil (ikinci onay) → kuyruklar + gizle
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "fabrika:2026-10-29", v: JSON.stringify({ asama: "onayda", liste: [{ kod: "3100", renkler: [{ renk: "bej", adet: 2 }] }] }) }) });
  o.g.length = 0;
  await bas(333, "fb:o:2026-10-29");
  const id2 = cagri(o.g, "copyMessage")[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  o.g.length = 0;
  await bas(555, `fc:b:${id2}`);
  const karar = cagri(o.g, "sendMessage").filter((x) => /fabrika bitti dedi\. Ne yapalım\?/.test(x.govde.text));
  assert.equal(karar.length, 2);
  o.g.length = 0;
  await bas(111, `fk:s:${id2}`, 5);
  assert.match(cagri(o.g, "editMessageText")[0].govde.text, /kanalda 1 paylaşım silinecek[\s\S]*Emin misiniz/);
  assert.ok(!o.depo.has("venom:kanalSil")); // henüz silinmedi
  await bas(111, `fk:S:${id2}`, 5);
  assert.deepEqual(JSON.parse(o.depo.get("venom:kanalSil")).map((x) => x.kod), ["3100"]);
  assert.deepEqual(JSON.parse(o.depo.get("venom:siteSil")).map((x) => x.kod), ["3100"]);
  const tum = await (await o.env.STOK.get().fetch("https://stok/tum", { method: "POST", body: "{}" })).json();
  assert.equal(tum["3100"] ? tum["3100"].gizli : true, true);
  await bas(333, `fk:r:${id2}`);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /artık geçerli değil|zaten karar/);
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
  const onizleme = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111");
  assert.match(onizleme.govde.text, /^🧪 DENEME[\s\S]*Repete geldi – 9999[\s\S]*kanalda paylaşılmaz/);
  const { default: kemal } = await import("./worker.js");
  assert.ok(kemal);
  o.g.length = 0;
  const w = await import("./worker.js");
  await w.guncellemeIsle({ callback_query: { id: "c", from: { id: 111, first_name: "Murat" }, data: onizleme.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 111 }, message_id: 3 } } }, { ...o.env, BOT_TOKEN: "k", ALLOWED_IDS: "111,222" });
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
  assert.deepEqual(soru.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["🏭 Fabrikaya ekle", "👤 Celal olarak ekle", "❌ Ekleme"]);
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: "fa:c:777", message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.equal(JSON.parse(o.depo.get("sami:fabrikaKisiler")).find((k) => k.id === 777).grup, "celal");
  const g = [];
  const tgc = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(20, 5), tgc);
  await fabrikaAdimi(o.env, ist(20, 15), tgc);
  assert.match(g[0].govde.text, /2 model, toplam 5 adet/);
  assert.ok(g.some((x) => x.metod === "copyMessage" && x.govde.caption === "5079 · satılan 3 · stok 1\n👤 Celal'in modeli\n⚠️ iki kartı var" && x.govde.reply_markup.inline_keyboard[0].length === 3));
  const gercek = Date.now;
  Date.now = () => ist(20, 20) * 1000;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3194 küçük siyah 4, 5079 büyük bej 5" } }, o.env);
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.match(kart.govde.text, /🏭 Fabrika[\s\S]*3194 — Küçük \(38-44\): siyah 4[\s\S]*👤 Celal:\n5079 — Büyük \(44-50\): bej 5/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const giden = [...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => [555, 777].includes(x.govde.chat_id));
  const nuri = giden.filter((x) => x.govde.chat_id === 555).map((x) => x.govde.caption || x.govde.text);
  const celal = giden.filter((x) => x.govde.chat_id === 777).map((x) => x.govde.caption || x.govde.text);
  assert.deepEqual(nuri, ["3194 · Küçük (38-44) · siyah 4"]);
  assert.deepEqual(celal, ["5079 · Büyük (44-50) · bej 5"]); // VOLONTE yok, fiyat/stok/satış yok
  // Celal fabrika modeline basamaz
  const fabrikaMsj = giden.find((x) => x.govde.chat_id === 555);
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
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "333" && x.govde.text === "3183 · satılan 5 · stok 4\n📷 fotoğraf yok"));
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
  assert.equal(g.length, 4); // not + özet + 2 model
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

// ---------- Sami'nin beyni (Haiku) ----------
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

test("Sami beyni: normal soru → Haiku araçla stok okur; araç sonucunda fiyat yok; fabrika kişisi beyni kullanamaz", async () => {
  const { guncelleme: g2 } = await import("./sami.js");
  const o = beyinOrtami([aracCevap("stok_bilgisi", { kod: "3596" }), metinCevap("3596'dan 12 adet kaldı.")]);
  await o.yaz("VOLONTE", [{ kod: "3596", adet: 12, fiyat: 77 }], ist(8));
  await g2({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, text: "3596'dan kaç tane kaldı?" } }, o.env);
  assert.equal(o.claude[0].model, "claude-haiku-5-5");
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
  assert.match(o.claude.at(-1).messages.at(-1).content[0].content, /sadece Hemra ve Murat/);
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
  assert.deepEqual(nuri, ["3254 · Küçük (38-44) · siyah 10 · bej 6", "3254 · Büyük (44-50) · siyah 5"]);
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
  assert.equal([...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => x.govde.chat_id === 555).length, 0);
  assert.ok(cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "111" && /^📷 3606 fotoğraf bulunamadı — fabrikaya gönderilmedi \(3606 · Büyük \(44-50\) · kırmızı 8\)/.test(x.govde.text)));
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
    const kart = cagri(o.g, "sendMessage").find((x) => /Gidecek liste/.test(x.govde.text));
    assert.equal(kart.govde.chat_id, "222");
    assert.match(kart.govde.text, /Gidecek liste \(28\.10\.2026 Black Rose\)[\s\S]*7001 — Küçük \(38-44\): siyah 5/);
    const onay = kart.govde.reply_markup.inline_keyboard[0][0].callback_data;
    assert.equal(onay, `fb:o:${gun}-BR`);
    await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: onay, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
    assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Merdan'da/);
    o.g.length = 0;
    await g2({ callback_query: { id: "c", from: { id: 222, first_name: "Merdan" }, data: onay, message: { chat: { id: 222 }, message_id: 2 } } }, o.env);
    assert.equal(cagri(o.g, "copyMessage").find((x) => x.govde.chat_id === 555).govde.caption, "7001 · Küçük (38-44) · siyah 5");
    assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111").govde.text, /Black Rose eksik listesi — onaylayan: Merdan/);
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
  await o.yaz("BLACKROSE", [{ kod: "3900", adet: 24, fiyat: 45, brAdet: 24 }, { kod: "907", adet: 5, fiyat: 30, brAdet: 5 }, { kod: "2000", adet: 140, fiyat: 5 }], ist(8));
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
  assert.equal(soru.govde.text, "🔎 Fuat 3900 stoğunu soruyor · stok: 24");
  assert.deepEqual(soru.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Göster", "❌ Gösterme"]);
  assert.match(son(501).govde.text, /iletildi/);
  assert.ok(!son(501).govde.text.includes("24"));
  const id = soru.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  // Hemra gösterir → Fuat'a sade kod + sadece Black Rose stoğu
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: `sq:g:${id}`, message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.equal(son(501).govde.text, "📦 3900 · Black Rose stok: 24 adet");
  assert.ok(!/B20|3900B|VOLONTE|\$|fiyat|satı/i.test(son(501).govde.text));
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `sq:x:${id}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Hemra zaten karar verdi/);

  // Hemra 1 saat cevap vermezse Murat'a; Murat "Gösterme" → Fuat'a bilgi yok
  o.g.length = 0;
  await mesaj(501, "/stok 907");
  const id2 = son(333).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await stokSorguTakip(o.env, ist(14, 30), async (e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; });
  assert.ok(!son(111));
  const tgc = async (e, metod, govde) => { o.g.push({ metod, govde }); return { ok: true, result: { message_id: 7 } }; };
  await stokSorguTakip(o.env, ist(15, 1), tgc);
  assert.match(son(111).govde.text, /🔎 Fuat 907 stoğunu soruyor · stok: 5\n\(Hemra 1 saattir cevap vermedi\)/);
  await stokSorguTakip(o.env, ist(15, 10), tgc);
  assert.equal(cagri(o.g, "sendMessage").filter((x) => x.govde.chat_id === "111").length, 1); // bir kez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `sq:x:${id2}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env);
  assert.equal(son(501).govde.text, "907: stok bilgisi şu an paylaşılamıyor.");

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
  assert.match(kayit, /Fuat · 907 · ❌ gösterilmedi \(Murat\)/);
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
  assert.ok(g.slice(1).every((x) => x.govde.reply_markup.inline_keyboard[0].length === 3));
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
  await o.yaz("BLACKROSE", [{ kod: "3634", adet: 20, fiyat: 40, brAdet: 20 }, { kod: "907", adet: 6, fiyat: 30 }, { kod: "2000", adet: 99, fiyat: 5, brAdet: 99 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3634", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  const br = async () => (await o.env.STOK.get().fetch("https://stok/br-stoklar", { method: "POST", body: "{}" })).json();
  assert.deepEqual(await br(), { BLACKROSE: [["3634", 20]], VOLONTE: [["3634", 4]] }); // VOLONTE'nin kendi 3194'ü ve 2000 yok
  await g2({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, text: "/brsay 907" } }, o.env); // Patron: 907 Black Rose say
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /\(1\): 907/);
  assert.deepEqual((await br()).BLACKROSE, [["907", 6], ["3634", 20]]);
  o.g.length = 0;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333 }, text: "/brsay 3194" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /sadece Patron/);
  // Fuat sorgusu: dağılım
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }]));
  o.depo.set("sami:stokSorguIds", JSON.stringify(["501"]));
  o.g.length = 0;
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "/stok 3634" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /Fuat 3634 stoğunu soruyor · stok: 24 \(Black Rose mağazası 20 · VOLONTE mağazası 4\)/);
});

test("cuma mutabakatı: 17:00 önizleme Patron'a; gönder → Fuat; Uyuşmuyor → fark Patron'a; Sonra → 12:00 hatırlatma, 3 günde Patron'a bilgi; başkaları basamaz", async () => {
  const { mutabakatAdimi } = await import("./mutabakat.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { MURAT_ID: "999,111", FABRIKA_SORUMLU: "333", FUAT_ID: "501" });
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 501, ad: "Fuat" }, { id: 502, ad: "Nuri" }]));
  await o.yaz("BLACKROSE", [{ kod: "3634", adet: 20, fiyat: 40, brAdet: 20 }], ist(8));
  await o.yaz("VOLONTE", [{ kod: "3634", adet: 9, fiyat: 40, brAdet: 4 }, { kod: "3194", adet: 7, fiyat: 60 }], ist(8));
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 40 + g.length } }; };
  const cuma = Date.UTC(2026, 10, 6, 14, 1) / 1000; // 6 Kasım 2026 cuma 17:01
  await mutabakatAdimi(o.env, cuma - 3600, tg);
  assert.equal(g.length, 0); // 16:01: henüz değil
  await mutabakatAdimi(o.env, cuma, tg);
  assert.equal(g.length, 1);
  const on = g[0].govde;
  assert.equal(on.chat_id, "999"); // Patron
  assert.match(on.text, /📋 Cuma mutabakatı – 06\.11\.2026\n\n📦 BÖLÜM 1 – BLACK ROSE MAĞAZASI \(1 model, 20 adet\)\n3634 · 20\n\n📦 BÖLÜM 2 – VOLONTE MAĞAZASI \(Black Rose kodları; 1 model, 4 adet\)\n3634 · 4\n\n💰 BÖLÜM 3 – BAKİYELER/);
  assert.ok(!/3194|\$\s?\d|fiyat/i.test(on.text.split("BAKİYELER")[0])); // VOLONTE modeli ve fiyat yok
  const id = on.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await mutabakatAdimi(o.env, cuma + 600, tg);
  assert.equal(g.length, 1); // cuma günü bir kez
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333 }, data: `mt:g:${id}`, message: { chat: { id: 333 }, message_id: 1 } } }, o.env);
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Patron'da/); // Hemra gönderemez
  await g2({ callback_query: { id: "c", from: { id: 111 }, data: `mt:g:${id}`, message: { chat: { id: 111 }, message_id: 1 } } }, o.env); // eski hesap da Patron yetkisinde
  const fuatMsj = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "501");
  assert.match(fuatMsj.govde.text, /^📋 Cuma mutabakatı – 06\.11\.2026/);
  assert.deepEqual(fuatMsj.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Mutabıkım", "❌ Uyuşmuyor", "⏳ Sonra kontrol edeceğim"]);
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
  // Uyuşmuyor → fark yazısı Patron'a
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 501 }, data: `mt:u:${id}`, message: { chat: { id: 501 }, message_id: 3 } } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Fark ne\?/);
  await g2({ message: { chat: { id: 501, type: "private" }, from: { id: 501 }, text: "3634 bizde 18 görünüyor" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "999").govde.text, /Fuat mutabakatta uyuşmuyor \(06\.11\.2026\):\n3634 bizde 18 görünüyor/);
});

test("mutabakat bakiyeleri: Patron'a iki taraf yan yana + fark (⚠️), Fuat'a sadece Black Rose tarafı ve toplam; kaynak seçilebilir", async () => {
  const { mutabakatMetni, bakiyeBolumu } = await import("./mutabakat.js");
  const o = ortam();
  const ayar = (k, v) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k, v: JSON.stringify(v) }) });
  const h = (anahtar, kart, d5) => ({ anahtar, ad: `BLACK ROSE ${anahtar}`, kart, donemler: { D0005TBLCARIGENELHAREKET: { n: 3, borc: d5[0], alacak: d5[1] } } });
  await ayar("cari:BLACKROSE", { hesaplar: [h("15", 1000, [1500, 500]), h("20", 2500, [2500, 0]), h("25", 0, [0, 0]), h("00", 300, [300, 0])] });
  await ayar("cari:VOLONTE", { hesaplar: [h("15", -1000, [0, 1000]), h("20", -2400, [0, 2400]), h("25", 0, [0, 0]), h("00", -300, [0, 300])] });
  const m = await mutabakatMetni(o.env, "2026-11-06");
  assert.ok(m.farkVar);
  assert.match(m.patron, /✅ Black Rose 15: Black Rose kaydı 1\.000,00 \(B\) · VOLONTE kaydı 1\.000,00 \(A\) · fark 0,00/);
  assert.match(m.patron, /⚠️ Black Rose 20: Black Rose kaydı 2\.500,00 \(B\) · VOLONTE kaydı 2\.400,00 \(A\) · fark 100,00/);
  assert.match(m.patron, /⚠️ TOPLAM: Black Rose kaydı 3\.800,00 \(B\) · VOLONTE kaydı 3\.700,00 \(A\) · fark 100,00/);
  assert.match(m.fuat, /💰 BÖLÜM 3 – BAKİYELER\nBlack Rose 15: 1\.000,00 \(B\)\nBlack Rose 20: 2\.500,00 \(B\)\nBlack Rose 25: 0,00\nBlack Rose 00: 300,00 \(B\)\nTOPLAM: 3\.800,00 \(B\)$/);
  assert.ok(!/VOLONTE kaydı|fark/.test(m.fuat)); // Fuat VOLONTE tarafını ve farkı görmez
  // kaynak: dönem tablosu toplamı
  const d = bakiyeBolumu({ hesaplar: [h("15", 1000, [1500, 400])] }, { hesaplar: [h("15", -1000, [0, 1100])] }, { tur: "donem", tablolar: ["D0005TBLCARIGENELHAREKET"] });
  assert.match(d.patron[0], /✅ Black Rose 15: Black Rose kaydı 1\.100,00 \(B\) · VOLONTE kaydı 1\.100,00 \(A\)/);
  assert.match(d.patron.at(-1), /kaynak: dönem toplamı \(D0005TBLCARIGENELHAREKET\)/);
});
