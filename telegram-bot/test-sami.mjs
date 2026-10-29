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

test("fabrika: 20:05 Hemra'ya satılanlar (renk hafızasıyla); onayla fabrikaya SADECE kod/renk/adet, Murat'a kopya; fabrika kişisi Murat onayıyla eklenir; 21:00 hatırlatma, 22:00 Murat'a haber", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  await o.yaz("VOLONTE", [{ kod: "3183", adet: 4, fiyat: 40 }, { kod: "3186", adet: 0, fiyat: 30 }], ist(8));
  const gun = "2026-10-28";
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3183", adet: 8 }, { kod: "3186", adet: 2 }] }) });
  const g = [];
  const tg = async (env, metod, govde) => { g.push({ metod, govde }); return { ok: true, result: { message_id: 9 } }; };
  await fabrikaAdimi(o.env, ist(20, 10), tg);
  assert.equal(g.length, 0); // satış okuması henüz açılmadı
  o.depo.set("sami:satisAcik", "1");
  await fabrikaAdimi(o.env, ist(19, 50), tg); // saat gelmedi
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
  // 20:05 satış görüldü; 10 dk değişmeyince (20:15) liste Hemra'ya
  await fabrikaAdimi(o.env, ist(20, 5), tg);
  assert.equal(g.length, 0);
  await fabrikaAdimi(o.env, ist(20, 15), tg);
  assert.equal(g[0].govde.chat_id, "333");
  assert.match(g[0].govde.text, /3183 · satılan 8 · stokta 4\n3186 · satılan 2 · stokta 0[\s\S]*Renkleriyle yazın/);
  // Hemra yazar → onay kartı
  o.g.length = 0;
  Date.now = ((gercek) => { const f = () => ist(20, 20) * 1000; f.gercek = gercek; return f; })(Date.now);
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3183 siyah 10 bej 6" } }, o.env);
  const kart = cagri(o.g, "sendMessage")[0];
  assert.match(kart.govde.text, /🏭 Fabrika \(Nuri\/Sinem\/Fuat\):\n3183 — siyah 10, bej 6[\s\S]*Gönderilsin mi\?/);
  assert.equal(kart.govde.reply_markup.inline_keyboard[0][0].callback_data, `fb:o:${gun}`);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const nuri = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === 555); // 3183'ün fotoğrafı yok → sadece yazı
  assert.equal(nuri.govde.text, "VOLONTE – Model 3183. İstenen: siyah 10 seri, bej 6 seri"); // fiyat/satış/stok yok
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "111").govde.text, /onaylayan: Hemra[\s\S]*3183 — siyah 10, bej 6/);
  // ertesi gün renk hafızası
  g.length = 0;
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-10-29", kalemler: [{ kod: "3183", adet: 1 }] }) });
  await fabrikaAdimi(o.env, ist(20, 5, 1), tg);
  await fabrikaAdimi(o.env, ist(20, 15, 1), tg);
  assert.match(g[0].govde.text, /Daha önce yazdığınız renkler:\n3183: siyah, bej\?/);
  await fabrikaAdimi(o.env, ist(21, 0, 1), tg);
  assert.equal(g.length, 1); // liste 20:15'te gitti → hatırlatma en erken 21:10
  await fabrikaAdimi(o.env, ist(21, 15, 1), tg);
  assert.match(g.at(-1).govde.text, /Hatırlatma/);
  await fabrikaAdimi(o.env, ist(22, 20, 1), tg);
  assert.equal(g.at(-1).govde.chat_id, "111");
  assert.match(g.at(-1).govde.text, /Hemra onaylamadı/);
  Date.now = Date.now.gercek;
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
  assert.equal(kopya[0].govde.caption, "VOLONTE – Model 3194. İstenen: siyah 10 seri");
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
  assert.match(yazi, /^🧪 DENEME – üretim yapmayın\nVOLONTE – Model 9999 DENEME\. İstenen: siyah 2 seri, bej 1 seri$/);
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

test("Celal: 20:05 listesinde ayrı başlık (iki kart notu); onayda CELAL modeli SADECE Celal'e ('VOLONTE' yazmadan), diğeri sadece fabrikaya; Celal başkasının modeline basamaz; /start → Celal olarak ekle; deneme 9998 sadece Celal'e", async () => {
  const { fabrikaAdimi } = await import("./fabrika.js");
  const { guncelleme: g2 } = await import("./sami.js");
  const o = ortam();
  Object.assign(o.env, { FABRIKA_SORUMLU: "333", MURAT_ID: "111" });
  o.depo.set("sami:satisAcik", "1");
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
  assert.match(g[0].govde.text, /🏭 Fabrika \(Nuri\/Sinem\/Fuat\):\n3194 · satılan 2 · stokta 4\n\n👤 Celal:\n5079 · satılan 3 · stokta 1 ⚠️ iki kartı var/);
  const gercek = Date.now;
  Date.now = () => ist(20, 20) * 1000;
  await g2({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "3194 siyah 4, 5079 bej 5" } }, o.env);
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.match(kart.govde.text, /🏭 Fabrika[\s\S]*3194 — siyah 4[\s\S]*👤 Celal:\n5079 — bej 5/);
  o.g.length = 0;
  await g2({ callback_query: { id: "c", from: { id: 333, first_name: "Hemra" }, data: `fb:o:${gun}`, message: { chat: { id: 333 }, message_id: 2 } } }, o.env);
  const giden = [...cagri(o.g, "sendMessage"), ...cagri(o.g, "copyMessage"), ...cagri(o.g, "sendPhoto")].filter((x) => [555, 777].includes(x.govde.chat_id));
  const nuri = giden.filter((x) => x.govde.chat_id === 555).map((x) => x.govde.caption || x.govde.text);
  const celal = giden.filter((x) => x.govde.chat_id === 777).map((x) => x.govde.caption || x.govde.text);
  assert.deepEqual(nuri, ["VOLONTE – Model 3194. İstenen: siyah 4 seri"]);
  assert.deepEqual(celal, ["Model 5079. İstenen: bej 5 seri"]); // VOLONTE yok, fiyat/stok yok
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
  assert.deepEqual(dg.filter((x) => x.govde.chat_id === 777).map((x) => x.govde.caption || x.govde.text), ["🧪 DENEME – üretim yapmayın\nModel 9998 CELAL DENEME. İstenen: siyah 1 seri"]);
  assert.ok(dg.filter((x) => x.govde.chat_id === 555).every((x) => /9999 DENEME/.test(x.govde.caption || x.govde.text)));
  Date.now = gercek;
});

test("/eksik: sadece Murat ve Hemra; satışla liste hemen Hemra'ya; aynı gün ikinci kez gitmez; satış yoksa 21:00'e kadar bekler, sonra otomatik gitmez", async () => {
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
  assert.match(cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "333").govde.text, /3183 · satılan 5 · stokta 4[\s\S]*Fabrikaya ne isteyelim/);
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
