// Çalıştırma: node --test test-venom.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";
import venom, { guncelleme, venomCron, gunOzeti, aktarilanGonder, pelinFotoIlet } from "./venom-bot.js";
import { venomGidenAdimi, venomPelinAdimi, kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";
import { venomUretimi } from "./pelin.js";
import { topluRapor } from "./venom.js";

const PATRON = 999, FUAT = "501", NURI = "502", MERDAN = "503";
const ist = (gun, hh, mm = 0) => Date.UTC(2026, 10, gun, hh - 3, mm) / 1000; // Kasım 2026, İstanbul saati

function ortam() {
  const depo = new Map();
  const g = []; // Telegram çağrıları
  const claude = []; // Claude istekleri
  const cevaplar = []; // sıradaki Claude cevapları
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) {
    if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; }
    const st = db.prepare(q);
    const satir = /^\s*SELECT/i.test(q) ? st.all(...p).map((r) => ({ ...r })) : (st.run(...p), []);
    return { toArray: () => satir };
  } };
  const stok = new StokDO({ storage: { sql } });
  depo.set("venom:bot:klavye:v1", "1"); // sabit düğmeler kurulmuş say (ayrı testte sınanır)
  const env = {
    BOT_TOKEN: "venom-token", ANTHROPIC_API_KEY: "k", WEBHOOK_SECRET: "gizli", SELF_URL: "https://venom.test",
    MURAT_ID: String(PATRON), FUAT_ID: FUAT, NURI_ID: NURI, BR_SORUMLU: MERDAN, HEMRA_ID: "504", ALLOWED_IDS: String(PATRON),
    KAYIT: {
      async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
      async list({ prefix = "" } = {}) { return { keys: [...depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }; },
    },
    STOK: { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) },
  };
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com")) {
      const govde = JSON.parse(istek.body);
      claude.push(govde);
      const c = cevaplar.shift() || { text: "Tamam Patron." };
      const content = c.arac ? [{ type: "tool_use", id: `tu${claude.length}`, name: c.arac, input: c.girdi || {} }] : [{ type: "text", text: c.text }];
      return Response.json({ id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: c.arac ? "tool_use" : "end_turn", content, usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const metod = u.split("/").pop();
    const govde = istek.body instanceof FormData ? Object.fromEntries([...istek.body.entries()].map(([k, v]) => [k, typeof v !== "string" ? "<dosya>" : ["reply_markup", "media"].includes(k) ? JSON.parse(v) : v])) : istek.body ? JSON.parse(istek.body) : {};
    g.push({ metod, govde });
    if (metod === "getWebhookInfo") return Response.json({ ok: true, result: { url: "https://venom.test/telegram" } });
    return Response.json({ ok: true, result: { message_id: 100 + g.length } });
  };
  const ayar = (k, v) => env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k, v: JSON.stringify(v) }) });
  // Sami'nin Telegram'ı (ayrı bot): çağrıları ayrı tut
  const samiG = [];
  const samiTg = async (e, metod, govde) => { samiG.push({ metod, govde }); return { ok: true, result: { message_id: 500 + samiG.length } }; };
  return { env, depo, g, claude, cevaplar, ayar, samiG, samiTg, stok };
}
let uid = 1;
const yazi = (o, kimden, text) => guncelleme({ update_id: uid++, message: { message_id: 1, date: 1, chat: { id: kimden, type: "private" }, from: { id: kimden }, text } }, o.env);
const bas = (o, data) => guncelleme({ update_id: uid++, callback_query: { id: "c", from: { id: PATRON }, data, message: { chat: { id: PATRON }, message_id: 9 } } }, o.env);
const patronaGiden = (o) => o.g.filter((x) => x.metod === "sendMessage" && String(x.govde.chat_id) === String(PATRON));
const sonKart = (o) => patronaGiden(o).filter((x) => x.govde.reply_markup).at(-1);
// 12 Kasım (KÖKTEN YENİDEN YAPILANMA): Patron'un her mesajı beyne gider; beyin aracı seçer. Testte beyin "şu aracı çağır" diye yazılır,
// aracın GERÇEK sonucu (beyne dönen veri) okunur.
const aracla = async (o, soru, arac, girdi = {}, son = "✓") => {
  o.cevaplar.push({ arac, girdi }, { text: son });
  await yazi(o, PATRON, soru);
  const c = o.claude.at(-1).messages.at(-1).content;
  return Array.isArray(c) && c[0] && c[0].type === "tool_result" ? String(c[0].content) : null;
};

test("sadece Patron: başkası yazarsa Venom cevap vermez, Claude çağrılmaz", async () => {
  const o = ortam();
  await yazi(o, 12345, "stok 3557");
  assert.equal(o.claude.length, 0);
  assert.equal(o.g.filter((x) => x.metod === "sendMessage").length, 0);
});

test("stok sorgusu onaysız: her mağaza ayrı satır, toplam/karşılaştırma yok; sohbet hafızaya yazılır", async () => {
  const o = ortam();
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3557", adet: 20, fiyat: 40 }], simdi: 1 }) });
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "3557", adet: 7, fiyat: 40 }], simdi: 1 }) });
  o.cevaplar.push({ arac: "stok_sorgu", girdi: { kod: "3557" } }, { text: "3557: Black Rose 20, VOLONTE 7 adet." });
  await yazi(o, PATRON, "3557 ne kadar var");
  const sonuc = o.claude[1].messages.at(-1).content[0];
  assert.equal(sonuc.type, "tool_result");
  assert.match(sonuc.content, /Black Rose mağazası: 20 adet\nVOLONTE mağazası: 7 adet/);
  assert.ok(!/toplam|fark/i.test(sonuc.content));
  assert.equal(sonKart(o), undefined); // onay kartı yok
  assert.match(patronaGiden(o).at(-1).govde.text, /3557/);
  assert.equal(JSON.parse(o.depo.get("venom:bot:sohbet")).length, 2);
});

test("Fuat'a mesaj: tam metin kart [Onayla/Düzelt/İptal] → Emin misiniz → Sami gönderir → Venom '✅ gitti'; onaysız hiçbir şey gitmez", async () => {
  const o = ortam();
  o.cevaplar.push({ arac: "mesaj_taslagi", girdi: { kime: "fuat", metin: "Fuat Bey, mutabakatı bugün kontrol eder misiniz?" } }, { text: "Kartı gösterdim Patron." });
  await yazi(o, PATRON, "fuata yaz mutabakatı kontrol etsin");
  const kart = sonKart(o);
  assert.match(kart.govde.text, /Fuat'a gidecek mesaj \(Sami adına, birebir\):\n\nFuat Bey, mutabakatı bugün kontrol eder misiniz\?/);
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Onayla", "✏️ Düzelt", "❌ İptal"]);
  const id = kart.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  assert.equal((await kuyruguAl(o.env, "giden")).length, 0); // henüz kuyrukta değil
  await bas(o, `vb:E:${id}`); // Onayla'ya basmadan "Evet" geçmez
  assert.equal((await kuyruguAl(o.env, "giden")).length, 0);
  await bas(o, `vb:o:${id}`);
  assert.match(patronaGiden(o).at(-1).govde.text, /Emin misiniz/);
  assert.equal((await kuyruguAl(o.env, "giden")).length, 0);
  await bas(o, `vb:E:${id}`);
  await bas(o, `vb:E:${id}`); // ikinci basış: iş artık beklemiyor (iki kez gitmez)
  // Sami tarafı
  await venomGidenAdimi(o.env, ist(3, 12), o.samiTg);
  const fuataGiden = o.samiG.filter((x) => x.govde.chat_id === FUAT);
  assert.equal(fuataGiden.length, 1);
  assert.equal(fuataGiden[0].govde.text, "Fuat Bey, mutabakatı bugün kontrol eder misiniz?");
  await venomGidenAdimi(o.env, ist(3, 12, 5), o.samiTg); // kuyruk boş: tekrar gitmez
  assert.equal(o.samiG.filter((x) => x.govde.chat_id === FUAT).length, 1);
  // Venom: sonuç Patron'a
  o.g.length = 0;
  await venomCron(o.env, ist(3, 12, 10));
  // 12 Kasım (SÖZ TAKİBİ): Venom "Sırada. Gidince yazacağım." dedi → gidince Patron'a TEK satır (saatiyle); özet kuyruğuna girmez
  assert.equal(patronaGiden(o).filter((x) => /✅ Mesaj Fuat'a gitti \(Sami\)\. \(03\.11 12:10\)/.test(x.govde.text)).length, 1);
  assert.ok(!(JSON.parse(o.depo.get("venom:posta:2026-11-03") || "[]")).some((x) => /Mesaj Fuat'a gitti/.test(x.ozet))); // 10 Kasım: "Mesaj X'e gitti" özete de girmez (arşivde var)
  const ars = await (await o.env.STOK.get().fetch("https://stok/arsiv-liste", { method: "POST", body: "{}" })).json();
  assert.ok(ars.some((x) => x.tur === "venom-mesaj") && ars.some((x) => x.tur === "venom-gitti"));
});

test("güvenlik: Fuat/Nuri'ye maliyet/kâr/gider/ciro geçen metin kart bile açılmaz; Sami'de de son kapı", async () => {
  const o = ortam();
  o.cevaplar.push({ arac: "mesaj_taslagi", girdi: { kime: "nuri", metin: "Nuri Bey, maliyet 12 $" } }, { text: "Bu metin gidemez Patron." });
  await yazi(o, PATRON, "nuriye maliyeti yaz");
  assert.match(o.claude[1].messages.at(-1).content[0].content, /Nuri'ye gidemez: gizli bilgi/);
  assert.equal(sonKart(o), undefined);
  // Kuyruğa bir şekilde düşse bile Sami göndermez
  await kuyrugaEkle(o.env, "giden", { id: "x1", kime: "fuat", tur: "mesaj", metin: "Bu ayın ciro bilgisi" });
  await venomGidenAdimi(o.env, ist(3, 12), o.samiTg);
  assert.equal(o.samiG.length, 0);
  const s = await kuyruguAl(o.env, "sonuc");
  assert.equal(s[0].ok, false);
  assert.match(s[0].aciklama, /GİTMEDİ/);
});

test("hatırlatma (küçük iş) onaysız: Merdan'a doğrudan; Fuat'a hatırlatma reddedilir", async () => {
  const o = ortam();
  o.cevaplar.push({ arac: "hatirlat", girdi: { kime: "merdan", metin: "Merdan, 3557 sayımını unutma." } }, { text: "Hatırlattım." });
  await yazi(o, PATRON, "merdana sayımı hatırlat");
  assert.equal(sonKart(o), undefined);
  await venomGidenAdimi(o.env, ist(3, 12), o.samiTg);
  assert.deepEqual(o.samiG.map((x) => [x.govde.chat_id, x.govde.text]), [[MERDAN, "Merdan, 3557 sayımını unutma."]]);
  const { aracCalistir } = await import("./venom-bot.js");
  assert.match(await aracCalistir(o.env, "hatirlat", { kime: "fuat", metin: "x" }, ist(3, 12)), /onaysız gitmez/);
});

test("mutabakat Venom'dan: kartta Fuat'ın göreceği iki mesaj birebir; onay + Emin → Sami aynı metni mutabakat düğmeleriyle Fuat'a gönderir", async () => {
  const o = ortam();
  const h = (anahtar, kart) => ({ anahtar, ad: `BLACK ROSE ${anahtar}`, kart, donemler: {} });
  await o.ayar("cari:BLACKROSE", { zaman: 1, hesaplar: [h("15", -100), h("20", -250), h("25", 0), h("00", 0)] });
  await o.ayar("cari:VOLONTE", { zaman: 1, hesaplar: [h("15", 100), h("20", 200), h("25", 0), h("00", 0)] });
  o.cevaplar.push({ arac: "mutabakat_gonder" }, { text: "Önizleme hazır." });
  await yazi(o, PATRON, "fuata mutabakatı tekrar gönder");
  const kart = sonKart(o);
  assert.match(kart.govde.text, /📊 BLACK ROSE – Sami\nFuat Bey,\n💰 Bakiyeler:\nBlack Rose 00: 0,00 \$\nBlack Rose 15: 100,00 \$/);
  assert.match(kart.govde.text, /📊 VOLONTE – Sami/);
  const id = kart.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  // Kart açıldıktan sonra bakiye değişse bile Patron'un gördüğü gider
  await o.ayar("cari:BLACKROSE", { zaman: 2, hesaplar: [h("15", -999), h("20", -250), h("25", 0), h("00", 0)] });
  await bas(o, `vb:o:${id}`); await bas(o, `vb:E:${id}`);
  await venomGidenAdimi(o.env, ist(3, 12), o.samiTg);
  const fuataGiden = o.samiG.filter((x) => x.metod === "sendMessage" && x.govde.chat_id === FUAT);
  assert.equal(fuataGiden.length, 2);
  assert.match(fuataGiden[0].govde.text, /Black Rose 15: 100,00 \$/);
  assert.deepEqual(fuataGiden[1].govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Mutabıkım", "❌ Uyuşmuyor", "⏳ Sonra kontrol edeceğim"]);
  const s = await kuyruguAl(o.env, "sonuc");
  assert.ok(s[0].ok && /Mutabakat Fuat'a gönderildi/.test(s[0].aciklama));
});

test("İptal ve Düzelt: iptal edilen iş gitmez; Düzelt → Patron'un talimatıyla aynı iş yeniden hazırlanır", async () => {
  const o = ortam();
  o.cevaplar.push({ arac: "mesaj_taslagi", girdi: { kime: "merdan", metin: "Yarın 10'da gel." } }, { text: "Kart hazır." });
  await yazi(o, PATRON, "merdana yarın 10da gelsin yaz");
  const id = sonKart(o).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, `vb:d:${id}`);
  assert.match(patronaGiden(o).at(-1).govde.text, /Nasıl düzelteyim/);
  o.cevaplar.push({ arac: "mesaj_taslagi", girdi: { kime: "merdan", metin: "Yarın 11'de gel." } }, { text: "Düzelttim." });
  await yazi(o, PATRON, "10 değil 11");
  assert.match(o.claude.at(-2).messages.at(-1).content, /düzeltmek istiyor[\s\S]*Yarın 10'da gel\.[\s\S]*10 değil 11/);
  await bas(o, `vb:o:${id}`); // eski kart artık geçmez
  assert.equal(patronaGiden(o).filter((x) => /Emin misiniz/.test(x.govde.text)).length, 0);
  const id2 = sonKart(o).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, `vb:x:${id2}`);
  await bas(o, `vb:o:${id2}`);
  await venomGidenAdimi(o.env, ist(3, 12), o.samiTg);
  assert.equal(o.samiG.length, 0);
});

test("Pelin işi: maliyet kartı (aylık sınır), kurulum yoksa kart açılmaz; onaylanınca Pelin kuyruğu; kurulum/sınır kontrolü Pelin'de de", async () => {
  const o = ortam();
  const { aracCalistir } = await import("./venom-bot.js");
  // 6 Kasım: sağlamlaştırma haftası — Patron açıkça istemedikçe Pelin üretimi başlamaz
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /BAŞLATILMADI/);
  o.env.__patronMetni = "3557 için video üret"; // 11 Kasım: "Pelin" demeden Pelin başlamaz (para harcayan iş yanlış anlamayla başlamaz)
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /BAŞLATILMADI/);
  o.env.__patronMetni = "Pelin 3557 için video üret";
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /kurulum yapılmamış/);
  const sc = JSON.stringify({ yuz: { anahtar: "a", manken: 0 }, ortamlar: [{ ad: "retro", sahne: "x", hareket: "y" }], arac: "veo" });
  o.depo.set("pelin:secim", sc); o.depo.set("venom:pelinSecim", sc); // Pelin'in kendi kaydı + Venom'un aynası
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /3557 için boy kayıtlı değil/);
  for (const k of ["3557", "3592"]) o.depo.set(`pelinboy:${k}`, JSON.stringify({ boy: "bilek" }));
  await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557", "3592", "abc"], test: true }, ist(3, 12));
  const kart = sonKart(o);
  assert.match(kart.govde.text, /Boy: 3557 bilek \(ayakkabı görünür, etek yere değmez\), 3592 bilek/);
  assert.match(kart.govde.text, /MALİYET TESTİ — 2 model: 3557, 3592\n[\s\S]*Model başı ~[\d,]+ \$ · toplam ~[\d,]+ \$[\s\S]*Bu ay Pelin: 0,00 \$ \/ 100 \$/);
  assert.match(kart.govde.text, /Boy: 3557 bilek \(ayakkabı görünür, etek yere değmez\), 3592 bilek/);
  const id = kart.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, `vb:o:${id}`); await bas(o, `vb:E:${id}`);
  const baslatilan = [];
  await venomPelinAdimi(o.env, ist(3, 12), async (e, onay) => { baslatilan.push(onay); return { ok: true }; });
  assert.deepEqual(baslatilan, [{ kodlar: ["3557", "3592"], test: true, sablonAd: null }]);
  // Pelin'in kendi kontrolü: sınır aşılırsa başlamaz
  o.depo.set(`uretim-harcama:${new Date((ist(3, 12) + 3 * 3600) * 1000).toISOString().slice(0, 7)}`, "149.9");
  assert.match((await venomUretimi(o.env, { kodlar: ["3557"], test: false }, ist(3, 12))).hata, /aylık sınır aşılır/);
  o.depo.delete("pelin:secim");
  assert.match((await venomUretimi(o.env, { kodlar: ["3557"], test: false }, ist(3, 12))).hata, /kurulum yapılmamış/);
});

test("hatalar Patron'a değil Claude Code'a: araç hatası venom:bot:hata'ya, Patron'a sadece kısa not", async () => {
  const o = ortam();
  o.env.STOK = { idFromName: () => "x", get: () => ({ fetch: async () => { throw new Error("depo kapalı"); } }) };
  o.cevaplar.push({ arac: "stok_sorgu", girdi: { kod: "3557" } }, { text: "Şu an bakamadım Patron." });
  await yazi(o, PATRON, "3557 için bir değerlendirme yap"); // (9 Kasım: sadece "3557" artık ücretsiz model kartı)
  const h = JSON.parse(o.depo.get("venom:bot:hata"));
  assert.match(h[0].yer, /arac:stok_sorgu/);
  assert.match(h[0].hata, /depo kapalı/);
  assert.ok(!patronaGiden(o).some((x) => /depo kapalı|Error/.test(x.govde.text)));
});

test("zamanlama: 09:40 toplu rapor ve 20:00 günün özeti Patron'a birer kez; pazar sessiz; Venom açıkken Kemal gruba toplu rapor atmaz", async () => {
  const o = ortam();
  await venomCron(o.env, ist(3, 9, 41)); // salı
  await venomCron(o.env, ist(3, 9, 46));
  const sabah = patronaGiden(o).filter((x) => /Günaydın Patron/.test(x.govde.text));
  assert.equal(sabah.length, 1);
  assert.ok(sabah[0].govde.text.split("\n").length <= 8); // 11 Kasım: tek mesaj, en fazla 8 satır
  await venomCron(o.env, ist(3, 20, 1));
  await venomCron(o.env, ist(3, 20, 6));
  const aksam = patronaGiden(o).filter((x) => /Günün özeti/.test(x.govde.text));
  assert.equal(aksam.length, 1);
  assert.ok(aksam[0].govde.text.split("\n").length <= 8);
  o.g.length = 0;
  await venomCron(o.env, ist(8, 9, 41)); // 8 Kasım pazar
  await venomCron(o.env, ist(8, 20, 1));
  assert.equal(patronaGiden(o).length, 0);
  // Kemal: Venom açık → gruba göndermez
  const kemalG = [];
  await topluRapor(o.env, ist(4, 9, 40), async (e, m, gv) => { kemalG.push(gv); return { ok: true }; });
  assert.equal(kemalG.length, 0);
  o.depo.delete("venom:bot:aktif");
  await topluRapor(o.env, ist(4, 9, 40), async (e, m, gv) => { kemalG.push(gv); return { ok: true }; });
  assert.equal(kemalG.length, 1);
});

test("günün özeti: bugünkü arşiv işleri türlerine göre sayılır (dünkü sayılmaz)", async () => {
  const o = ortam();
  const ekle = (tur, zaman) => o.env.STOK.get().fetch("https://stok/arsiv-ekle", { method: "POST", body: JSON.stringify({ tur, mt: "x", icerik: {}, zaman }) });
  await ekle("venom-gitti", ist(2, 15)); await ekle("venom-gitti", ist(3, 10)); await ekle("venom-gitti", ist(3, 11)); await ekle("mutabik", ist(3, 12));
  const m = await gunOzeti(o.env, ist(3, 20));
  assert.match(m, /mesaj gitti: 2/);
  assert.match(m, /Fuat mutabık: 1/);
});

test("webhook: gizli anahtar yanlışsa 401; aynı güncelleme iki kez gelirse bir kez işlenir", async () => {
  const o = ortam();
  const r = await venom.fetch(new Request("https://venom.test/telegram", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "yanlis" }, body: "{}" }), o.env);
  assert.equal(r.status, 401);
  const u = { update_id: 77, message: { message_id: 1, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, text: "merhaba" } };
  for (let i = 0; i < 2; i++) await venom.fetch(new Request("https://venom.test/telegram", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "gizli" }, body: JSON.stringify(u) }), o.env);
  assert.equal(o.claude.length, 1);
});

test("harcama (4 Kasım): her Claude cevabı kaydedilir; %80'de bir kez uyarı; tavan dolunca sohbet durur (Claude çağrılmaz); 13 Kasım (kural 74): tavan kitaptaki tablodan (50 $)", async () => {
  const o = ortam();
  const { venomHarcanan, venomSinir, VENOM_SINIR_VARSAYILAN } = await import("./venom-bot.js");
  assert.equal(VENOM_SINIR_VARSAYILAN, 50);
  assert.equal(await venomSinir(o.env), 50);
  o.depo.set("venom:bot:sinir", "30"); // eski kayıt artık kullanılmaz: tek tablo kitap
  assert.equal(await venomSinir(o.env), 50);
  await yazi(o, PATRON, "merhaba");
  const h1 = await venomHarcanan(o.env, Math.floor(Date.now() / 1000));
  assert.ok(h1 > 0 && h1 < 0.01, String(h1)); // 10 giriş + 5 çıkış token
  const ay = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 7);
  o.depo.set(`venom-harcama:${ay}`, "40.5");
  await yazi(o, PATRON, "devam");
  assert.ok(patronaGiden(o).some((x) => /Venom bu ay 40,50 \$ yapay zekâ harcadı \(aylık sınır 50 \$, %80\)/.test(x.govde.text)));
  await yazi(o, PATRON, "bir daha");
  assert.equal(patronaGiden(o).filter((x) => /%80/.test(x.govde.text)).length, 1); // bir kez
  o.depo.set(`venom-harcama:${ay}`, "50");
  const n = o.claude.length;
  await yazi(o, PATRON, "3557 için yorum yap"); // (9 Kasım: "stok 3557" ücretsiz model kartıdır, sınırdan etkilenmez)
  assert.equal(o.claude.length, n);
  assert.match(patronaGiden(o).at(-1).govde.text, /Venom yapay zekâ sınırı \(50 \$\) doldu/);
  o.depo.set(`venom-harcama:${ay}`, "49");
  await yazi(o, PATRON, "3557 için yorum yap");
  assert.equal(o.claude.length, n + 1);
});

test("ANAHTAR KÖPRÜSÜ (5 Kasım): Venom kendi anahtarı olmadan Pelin'in anahtarını iç bağlantıyla kullanır; anahtar dışarı çıkmaz, sadece Anthropic/OpenAI", async () => {
  const { kopruIstegi } = await import("./anahtar-kopru.js");
  const { claudeIstemci, openaiFetch, claudeVar } = await import("./ai-istemci.js");
  const asil = globalThis.fetch; const giden = [];
  globalThis.fetch = async (url, init) => { giden.push({ url: String(url), h: new Headers(init.headers) }); return Response.json({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Merhaba Patron" }], usage: { input_tokens: 1, output_tokens: 1 } }); };
  try {
    const pelinEnv = { ANTHROPIC_API_KEY: "GERCEK-A", OPENAI_API_KEY: "GERCEK-O" };
    const venomEnv = { ANAHTAR: { fetch: (u, i) => kopruIstegi(pelinEnv, new Request(u, i)) } };
    assert.ok(claudeVar(venomEnv));
    const r = await claudeIstemci(venomEnv, { maxRetries: 0 }).messages.create({ model: "claude-sonnet-5-5", max_tokens: 10, messages: [{ role: "user", content: "selam" }] });
    assert.equal(r.content[0].text, "Merhaba Patron");
    assert.equal(giden[0].url, "https://api.anthropic.com/v1/messages");
    assert.equal(giden[0].h.get("x-api-key"), "GERCEK-A");
    await openaiFetch(venomEnv, "/v1/audio/transcriptions", { method: "POST", body: "x" });
    assert.equal(giden[1].url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(giden[1].h.get("authorization"), "Bearer GERCEK-O");
    assert.equal((await kopruIstegi(pelinEnv, new Request("https://kopru/evil/x"))).status, 403);
    assert.equal(giden.length, 2);
  } finally { globalThis.fetch = asil; }
});

test("VENOM 5 Kasım: hafıza (kurallar + Patron kararları) sistemde; fotoğraf → kemal_paylas → Kemal kuyruğu; Kemal SON YAYIN kartı Venom'dan onaylanır; bot hataları Patron'a bir kez", async () => {
  const o = ortam();
  o.depo.set("venom:kemalPaylasAcik", "1"); // 6 Kasım: sağlamlaştırma haftasında varsayılan kapalı
  o.depo.set("venom:bot:hafiza", "Marka Sami'nin deposundan. Etek yerden 2-3 cm.");
  // karar kaydı + hafıza sistem isteminde
  o.cevaplar.push({ arac: "karar_kaydet", girdi: { metin: "Bundan sonra 3627 beyaz önce gelsin" } }, { text: "Not aldım Patron." });
  await yazi(o, PATRON, "bundan sonra 3627 beyaz önce gelsin");
  o.cevaplar.push({ text: "Tamam." });
  await yazi(o, PATRON, "selam");
  const sistem = JSON.stringify(o.claude.at(-1).system);
  assert.match(sistem, /Etek yerden 2-3 cm/);
  assert.match(sistem, /3627 beyaz önce gelsin/);
  // fotoğraf + "3627 kanala hazırla" → kemal_paylas → (20 sn sonra) Kemal kuyruğu, Venom /medya adresleriyle
  const orijinal = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => { const u = String(url); if (u.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/a.jpg" } }); if (u.includes("/file/bot")) return new Response("FOTO"); return orijinal(url, istek); };
  // 12 Kasım: fotoğraf + yazı da beyne gider; beyin kemal_paylas aracını seçer (kelime kestirmesi yok)
  o.cevaplar.push({ arac: "kemal_paylas", girdi: { kod: "3627", renk: "bordo" } }, { text: "3627 bordo Kemal'e gidiyor." });
  await guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: "P1" }], caption: "3627 bordo kanala hazırla" } }, o.env);
  assert.equal(o.claude.at(-1).messages.at(-1).content[0].type, "tool_result");
  o.depo.set("venom:bot:medya", JSON.stringify(JSON.parse(o.depo.get("venom:bot:medya")).map((m) => ({ ...m, zaman: 1 }))));
  await venomCron(o.env, ist(5, 12));
  const pp = await kuyruguAl(o.env, "patronPaylas");
  assert.equal(pp.length, 1);
  assert.equal(pp[0].kod, "3627");
  assert.match(pp[0].medya[0].url, /^https:\/\/venom\.test\/medya\/[0-9a-f]{32}$/);
  assert.deepEqual(pp[0].venomMedya, [{ type: "photo", media: "P1" }]);
  globalThis.fetch = orijinal;
  // Kemal kartı Venom'a gelir → Patron Venom'dan onaylar → Kemal kuyruğu
  await kuyrugaEkle(o.env, "venomOnay", { id: "ky-1", tur: "kemalYayin", kartNo: "3627-a.b", kod: "3627", marka: "BLACK ROSE", yazi: "✅ CODE: 3627", medya: [{ type: "video", media: "https://x/v.mp4" }], zaman: 1 });
  o.g.length = 0;
  await venomCron(o.env, ist(5, 12, 5));
  const kart = sonKart(o);
  assert.match(kart.govde.text, /SON YAYIN ONAYI — 3627 · BLACK ROSE/);
  assert.ok(o.g.some((x) => x.metod === "sendVideo"));
  await bas(o, kart.govde.reply_markup.inline_keyboard[0][0].callback_data);
  const karar = await kuyruguAl(o.env, "kemalYayinKarar");
  assert.deepEqual([karar[0].kartNo, karar[0].islem], ["3627-a.b", "o"]);
  // hatalar: ilk çalışmada eski hatalar sessiz, yeni hata bir kez
  o.depo.set("pelin:hata", JSON.stringify({ zaman: ist(5, 11), yol: "x", hata: "eski" }));
  await venomCron(o.env, ist(5, 12, 10)); o.g.length = 0;
  o.depo.set("pelin:hata", JSON.stringify({ zaman: ist(5, 12, 12), yol: "x", hata: "fal hatası" }));
  await venomCron(o.env, ist(5, 12, 15));
  await venomCron(o.env, ist(5, 12, 20));
  // 9 Kasım (postane): tek tek bot hatası Patron'a anında gitmez (kritik değil) → bir kez birikir
  assert.equal(patronaGiden(o).filter((x) => /hata/i.test(x.govde.text)).length, 0);
  const bir = JSON.parse(o.depo.get("venom:posta:2026-11-05")).filter((x) => /Pelin: fal hatası/.test(x.ozet));
  assert.equal(bir.length, 1);
});

test("TEK KAPI (5 Kasım): bot Patron'un kişisel hesabına yazamaz → Venom'a aktarılır (başlık + küçük resim + tam yazı + düğmeler); Venom'da basılan düğme bota 'Patron bastı' olarak döner; Merdan'a giden aynen gider", async () => {
  const o = ortam();
  const kapi = await import("./tek-kapi.js");
  kapi._bayrakSifirla();
  const botDepo = new Map([["venom:tekKapi", "1"]]);
  const botaGelen = [];
  const venomBag = { aktar: (k) => aktarilanGonder(o.env, k) };
  const botEnv = { MURAT_ID: `${PATRON},777`, VENOM: venomBag, BOT_TOKEN: "kemal-token",
    KAYIT: { async get(k) { return botDepo.get(k) ?? null; }, async put(k, v) { botDepo.set(k, v); o.depo.set(k, v); } } };
  o.env.KEMAL_W = { dugme: async (data, rid) => { botaGelen.push({ data, rid }); return true; } };
  // Patron'a giden kart → Venom'dan çıkar
  const r = await kapi.venomaAktar(botEnv, "kemal", "sendMessage", { chat_id: PATRON, text: "📣 SON YAYIN ONAYI — 3627 · BLACK ROSE\nTam yazı burada", reply_markup: { inline_keyboard: [[{ text: "📣 Gönder", callback_data: "py:o:3627-a.b" }, { text: "Site", url: "https://www.wearvolonte.com" }]] } });
  assert.ok(r.ok && r.aktarildi);
  const kart = sonKart(o);
  assert.match(kart.govde.text, /^🤖 Kemal\n📣 SON YAYIN ONAYI — 3627 · BLACK ROSE\nTam yazı burada/);
  const d = kart.govde.reply_markup.inline_keyboard[0];
  assert.match(d[0].callback_data, /^vr:/);
  assert.equal(d[1].url, "https://www.wearvolonte.com");
  // albüm: URL'ler aynen, yazı albümde
  await kapi.venomaAktar(botEnv, "pelin", "sendMediaGroup", { chat_id: PATRON, media: [{ type: "video", media: "https://x/v.mp4", caption: "✅ CODE: 3627" }, { type: "photo", media: "https://x/f.jpg" }] });
  assert.ok(!o.g.some((x) => x.metod === "sendMediaGroup")); // 9 Kasım: düğmesiz albüm bekler (kartıyla birlikte gider)
  await kapi.venomaAktar(botEnv, "pelin", "sendMessage", { chat_id: PATRON, text: "🎬 3627 onay", reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: "po:1" }]] } });
  const alb = o.g.filter((x) => x.metod === "sendMediaGroup").at(-1);
  assert.deepEqual(alb.govde.media.map((m) => m.media), ["https://x/v.mp4", "https://x/f.jpg"]);
  assert.match(alb.govde.media[0].caption, /🤖 Pelin\n✅ CODE: 3627/);
  // Venom'da düğmeye basıldı → Kemal'e sahte callback (Patron'dan)
  await bas(o, d[0].callback_data);
  assert.equal(botaGelen.length, 1);
  assert.equal(botaGelen[0].data, "py:o:3627-a.b");
  const u = kapi.sahteDugme(botEnv, botaGelen[0].data, botaGelen[0].rid);
  assert.equal(u.callback_query.from.id, PATRON);
  // Patron'un kişisel hesabı DIŞINDAKİLER (ikinci Murat hesabı, Merdan) etkilenmez
  assert.equal(await kapi.patronaGider(botEnv, 777), false);
  assert.equal(await kapi.patronaGider(botEnv, MERDAN), false);
  assert.equal(await kapi.patronaGider(botEnv, PATRON), true);
  // iç kapı internetten açık değil: /kapi/aktar diye bir adres yok
  assert.equal(await (await venom.fetch(new Request("https://venom.test/kapi/aktar", { method: "POST", body: "{}" }), o.env)).text(), "Venom çalışıyor.");
  // kapı kapalıysa bot normal gönderir
  botDepo.set("venom:tekKapi", "0"); kapi._bayrakSifirla();
  assert.equal(await kapi.patronaGider(botEnv, PATRON), false);
});

test("Venom sohbeti: araç hafızayı değiştirse de aynı mesajdaki Claude çağrılarında sistem metni AYNI kalır (düşünme bloğu hatası olmasın)", async () => {
  const o = ortam();
  o.cevaplar.push({ arac: "karar_kaydet", girdi: { metin: "Yeni kural X" } }, { text: "Tamam." });
  await yazi(o, PATRON, "bundan sonra X");
  assert.equal(o.claude.length, 2);
  assert.deepEqual(o.claude[0].system, o.claude[1].system);
});

test("VENOM KANAL + SİTE + İŞ DAĞITIMI (5 Kasım): kanal paylaşımı kaydedilir, fiyat/yanlış imza/renk → Patron'a uyarı; Venom kanala yazmaz; site_kontrol okur; bota_yaz işi bota Patron yazmış gibi verir", async () => {
  const o = ortam();
  o.depo.set("kanal", JSON.stringify({ id: -1001, kullanici: "Volonteroseoffical" }));
  o.depo.set("pelinboy:3627", JSON.stringify({ marka: "BLACKROSE", renk: "koyu bordo" }));
  const kanal = (post, ek = {}) => guncelleme({ update_id: uid++, channel_post: { chat: { id: -1001, type: "channel" }, date: ist(5, 12), ...post }, ...ek }, o.env);
  await kanal({ message_id: 50, media_group_id: "g1", video: { file_id: "v" } });
  await kanal({ message_id: 51, media_group_id: "g1", photo: [{ file_id: "p" }], caption: "✅ CODE: 3627\n🎨 Colors / Couleurs: black\nPrice 45$\nVOLONTE – Premium Women's Fashion" });
  const uyari = patronaGiden(o).find((x) => /Kanalda sorun — 3627/.test(x.govde.text));
  assert.ok(uyari);
  assert.match(uyari.govde.text, /FİYAT[\s\S]*Black Rose modeli ama imza VOLONTE[\s\S]*renk: model kartında "koyu bordo"/);
  assert.match(uyari.govde.text, /t\.me\/Volonteroseoffical\/51/);
  await kanal({ message_id: 52, photo: [{ file_id: "p2" }], caption: "✅ CODE: 3627\n🎨 Colors / Couleurs: dark burgundy\nBLACK ROSE – Premium Women's Fashion" });
  assert.equal(patronaGiden(o).filter((x) => /Kanalda sorun/.test(x.govde.text)).length, 1); // doğru paylaşım sessiz
  assert.ok(!o.g.some((x) => String(x.govde && x.govde.chat_id) === "-1001")); // Venom kanala YAZMAZ
  const { aracCalistir } = await import("./venom-bot.js");
  const kp = await aracCalistir(o.env, "kanal_paylasimlari", { kod: "3627", gun: 2 }, ist(5, 13));
  assert.match(kp, /3627 · albüm \(video\+foto\)[\s\S]*⚠️[\s\S]*3627 · foto · sorun yok/);
  // site kontrolü (Selin depo okuyucusundan)
  o.env.SELIN_DEPO = { dosya: async () => ({ ok: true, govde: new TextEncoder().encode(JSON.stringify([{ kod: "3627", baslik: "X", fotolar: ["galeri/3627/1.jpg", "galeri/3627/pelin-abc.jpg"], videolar: [] }, { kod: "3700", fotolar: [], videolar: ["selin/3700/0"] }, { kod: "3800", gizli: true }])).buffer }) };
  const sk = await aracCalistir(o.env, "site_kontrol", {}, ist(5, 13));
  assert.match(sk, /2 model görünüyor \(1 gizli\)[\s\S]*Fotoğrafsız: 1 \(3700\)[\s\S]*Videosuz: 1 \(3627\)[\s\S]*Yapay zekâ \(Pelin\) fotoğrafı olan: 1 \(3627\)/);
  // iş dağıtımı: Pelin'e Patron yazmış gibi
  const giden = [];
  o.env.PELIN_W = { mesaj: async (m) => { giden.push(m); return true; } };
  assert.match(await aracCalistir(o.env, "bota_yaz", { bot: "pelin", metin: "3627 beyaz üret" }, ist(5, 13)), /Patron onayı olmadan verilmez/); // Venom kendi başına Pelin'e para işi veremez
  const by = await aracCalistir({ ...o.env, __izin: "cevap" }, "bota_yaz", { bot: "pelin", metin: "3627 beyaz üret" }, ist(5, 13)); // Patron'un isteği
  assert.deepEqual(giden, ["3627 beyaz üret"]);
  assert.match(by, /Pelin'e iletildi/);
});

test("PELİN'E FOTOĞRAF (5 Kasım, B5–B7): Patron'un fotoğrafları DOSYA olarak Pelin'e (KV pelinmedya), son N fotoğraf, sonuç açıkça İLETİLDİ / İLETİLMEDİ", async () => {
  const o = ortam();
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).includes("/file/bot") ? new Response(new Uint8Array([1, 2, 3])) : String(url).endsWith("/getFile") ? Response.json({ ok: true, result: { file_path: "f.jpg" } }) : asil(url, istek));
  // Pelin bağlantısı yok → İLETİLMEDİ
  assert.match(await pelinFotoIlet(o.env, { kod: "3627" }, 1000, async () => {}), /İLETİLMEDİ: Pelin bağlantısı yok/);
  const giden = [];
  o.env.PELIN_W = { foto: async (g) => { giden.push(g); return { ok: true, kaydedilen: g.fotolar.map((f) => `3627 beyaz ${f.rol === "arka" ? "arka" : "ön"}`), silinen: 2, iptal: 1 }; } };
  // fotoğraf yok → İLETİLMEDİ
  assert.match(await pelinFotoIlet(o.env, { kod: "3627" }, 1000, async () => {}), /İLETİLMEDİ: son 1 saatte/);
  o.depo.set("venom:bot:medya", JSON.stringify([{ tur: "foto", file_id: "ilgisiz", zaman: 1 }, { tur: "foto", file_id: "ON", zaman: 2 }, { tur: "foto", file_id: "ARKA", zaman: 3 }]));
  const t = await pelinFotoIlet(o.env, { kod: "3627", renk: "beyaz", roller: ["on", "arka"], adet: 2, sadece_bunlar: true, yeniden_baslat: true }, 1000, async () => {});
  globalThis.fetch = asil;
  assert.match(t, /✅ FOTOĞRAF İLETİLDİ: 2 fotoğraf Pelin'e kaydedildi — 3627 beyaz ön, 3627 beyaz arka/);
  assert.match(t, /Eski 2 fotoğraf/);
  assert.equal(giden.length, 1);
  assert.deepEqual([giden[0].renk, giden[0].sadeceBunlar, giden[0].yenidenBaslat, giden[0].fotolar.map((f) => f.rol)], ["beyaz", true, true, ["on", "arka"]]);
  assert.ok(giden[0].fotolar.every((f) => /\/medya\/[a-f0-9]{32}$/.test(f.url) && o.depo.has(`pelinmedya:${f.url.split("/").pop()}`)));
  assert.deepEqual(JSON.parse(o.depo.get("venom:bot:medya")).map((m) => m.file_id), ["ilgisiz"]); // kullanılanlar listeden çıkar
});

import { videoRaporu } from "./venom-bot.js";
test("AKŞAM RAPORU VİDEO (5 Kasım): denetim sonucu, bugün gelen 20 MB üstü video ve kanal→site sonuçları raporda", async () => {
  const o = ortam();
  const simdi = 1793900000;
  o.depo.set("venom:videoDenetim", JSON.stringify({ zaman: simdi - 600, siteVideo: 160, calisan: 158, sorunlar: [{ kod: "3612", tur: "buyuk", neden: "34.0 MB — Telegram botu 20 MB üstünü indiremez" }, { kod: "3500", tur: "sitede-bozuk", neden: "bulunamadı" }] }));
  o.depo.set("venom:videoGelenBuyuk", JSON.stringify([{ zaman: simdi - 100, kim: "Merdan", kod: "3612", boyut: 34 * 1048576 }]));
  o.depo.set("venom:kanalVideoSonuc", JSON.stringify([{ kod: "3194", ok: true, zaman: simdi - 50 }]));
  const r = await videoRaporu(o.env, simdi);
  assert.match(r, /158\/160 oynuyor · ⚠️ 2 OYNAMIYOR/);
  assert.match(r, /• 3612 — 20 MB üstü: 34\.0 MB/);
  assert.match(r, /• 3500 — sitede oynamıyor/);
  assert.match(r, /20 MB üstü gelen video: 1 \(3612 34 MB, Merdan\)/);
  assert.match(r, /Kanaldan siteye eklenen video: 3194/);
});

import { paylasNiyeti, gunlukTest, sorunRaporu } from "./venom-bot.js";
test("SAĞLAMLAŞTIRMA (6 Kasım) — paylaş niyeti: kod + renk + beden çıkarılır; soru cümlesi / iki kod → sohbete", () => {
  assert.deepEqual(paylasNiyeti("3627 beyaz paylaş"), { kod: "3627", renk: "beyaz", beden: null, sonSet: false });
  assert.deepEqual(paylasNiyeti("Bunu Kemal'e ilet paylaşım yapsın beyaz renk 36 27 büyük küçüğü var"), { kod: "3627", renk: "beyaz", beden: "i", sonSet: false });
  assert.equal(paylasNiyeti("koyu bordo 3627 paylaş").renk, "koyu bordo");
  assert.equal(paylasNiyeti("3627 en son gönderdiğim seti beyaz paylaş").sonSet, true);
  assert.equal(paylasNiyeti("3627 paylaşıldı mı?"), null);
  assert.equal(paylasNiyeti("3627 ve 3612 paylaş"), null);
  assert.equal(paylasNiyeti("3627 beyaz"), null);
});

test("12 Kasım BEYİN KARAR VERİR: '3627 beyaz paylaş' kestirmesi YOK — mesaj beyne gider, beyin kemal_paylas aracını seçer; kapalıyken araç DURAKLATILDI der", async () => {
  const o = ortam();
  const foto = (fid, caption) => guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: fid }], ...(caption ? { caption } : {}) } }, o.env);
  // kapalı (varsayılan): kod bir şey başlatmaz; beyin aracı çağırır, araç "duraklatıldı" der
  o.cevaplar.push({ arac: "kemal_paylas", girdi: { kod: "3627", renk: "beyaz" } }, { text: "Paylaşım duraklatılmış." });
  await foto("F1", "3627 beyaz paylaş");
  assert.equal(o.claude.length, 2); // beyne gitti
  assert.match(o.claude[1].messages.at(-1).content[0].content, /DURAKLATILDI/);
  assert.equal(o.depo.get("venom:bot:paylasBekle"), undefined);
  // açık: beyin aynı aracı çağırır → Kemal'e gider (renk ve beden Patron'un yazdığı)
  o.depo.set("venom:kemalPaylasAcik", "1");
  o.cevaplar.push({ arac: "kemal_paylas", girdi: { kod: "3627", renk: "beyaz", beden: "ikisi" } }, { text: "Kemal'e gidiyor." });
  await foto("F2", "3627 beyaz büyük küçük paylaş");
  const b = JSON.parse(o.depo.get("venom:bot:paylasBekle"));
  assert.deepEqual([b.kod, b.renk, b.beden], ["3627", "beyaz", "i"]);
  o.depo.set("venom:bot:medya", JSON.stringify(JSON.parse(o.depo.get("venom:bot:medya")).map((m) => ({ ...m, zaman: 1 }))));
  await venomCron(o.env, 1793900000);
  const pp = await kuyruguAl(o.env, "patronPaylas");
  assert.equal(pp.length, 1);
  assert.deepEqual([pp[0].renk, pp[0].beden, pp[0].medya.length], ["beyaz", "i", 2]);
});

test("SAĞLAMLAŞTIRMA (6 Kasım) — 'aracım yok' denmez: not alınır; 09:30 testi her botu dener; akşam raporunda tekrarlar ve hatalar", async () => {
  const o = ortam();
  // 12 Kasım: otomatik "Not ettim" cevabı YOK — beyin isteği kendisi yazar (yetenek_istegi) ve Patron'a sebebi söyler
  o.cevaplar.push({ arac: "yetenek_istegi", girdi: { istek: "Selin'in Instagram'a da koyması" } }, { text: "Selin Instagram'a paylaşamıyor; bu yeteneği Claude Code'a yazdım." });
  await yazi(o, PATRON, "Selin'e Instagram'a da koysun de");
  const son = patronaGiden(o).at(-1).govde.text;
  assert.ok(!/Not ettim/.test(son) && /Instagram/.test(son), son);
  assert.match(o.depo.get("venom:yetenekIstekleri"), /Instagram/);
  // günlük test
  o.env.KEMAL_W = { saglik: async () => ({ ok: true, bilgi: "kanal bağlı" }) };
  o.env.SELIN_W = { saglik: async () => ({ ok: false, sorunlar: ["site verisi okunamadı"] }) };
  o.env.SAMI_W = { saglik: async () => { throw new Error("bağlanamadı"); } };
  o.depo.set("venom:tekKapi", "1");
  const t = await gunlukTest(o.env, 1793900000);
  assert.match(t, /⚠️ 3 sorun/);
  assert.match(t, /✅ İzin kapısı: dün Patron'a izinsiz mesaj gitmedi/);
  assert.match(t, /✅ Kemal — kanal bağlı/);
  assert.match(t, /❌ Selin: site verisi okunamadı/);
  assert.match(t, /❌ Sami: bağlanamadı/);
  assert.match(t, /❌ Pelin: bağlantı yok/);
  // akşam: tekrarlar ve hatalar
  const simdi = 1793900000;
  o.depo.set("selin:hata", JSON.stringify({ zaman: simdi - 100, hata: "GitHub 422" }));
  o.depo.set("venom:kanal:son", JSON.stringify([{ id: 1, zaman: simdi - 50, kod: "3148", medya: "albüm (foto)", album: "a" }, { id: 9, zaman: simdi - 40, kod: "3148", medya: "albüm (foto)", album: "b" }]));
  o.depo.set("venom:selinTekrarEngellendi", JSON.stringify([{ zaman: simdi - 10, kodlar: ["3570"] }]));
  o.depo.set("venom:bot:iletilmedi", JSON.stringify([{ zaman: simdi - 5, metin: "3627: Patron'un dosyaları indirilemedi" }]));
  const r = await sorunRaporu(o.env, simdi);
  assert.match(r, /selin: GitHub 422/);
  assert.match(r, /Tekrar paylaşım.*3148 \(2 kez\)/);
  assert.match(r, /ÇIKARILDI: 3570/);
  assert.match(r, /İletilmedi: 3627/);
});

import { kodRenk, uretNiyeti } from "./venom-bot.js";
test("12 Kasım PELİN: 'Pelin' yazsa bile kod kendiliğinden başlatmaz — mesaj beyne gider, pelin_uret onay kartı açar; 'Pelin' yazmıyorsa araç BAŞLATMAZ; açıklamasız dosya → düğmeli soru", async () => {
  assert.equal(uretNiyeti("3627 beyaz fotoğrafını yap"), null);
  assert.equal(uretNiyeti("Merdan'a söyle, yarın 12:00'ye kadar 3394'ün fotoğrafını çeksin"), null);
  assert.deepEqual(kodRenk("3627 koyu bordo büyük"), { kod: "3627", renk: "koyu bordo", beden: "b" });
  const o = ortam();
  const pelinGiden = [];
  o.env.PELIN_W = { mesaj: async (m) => { pelinGiden.push(m); return true; } };
  o.cevaplar.push({ text: "Pelin için onay kartı gerekiyor." });
  await yazi(o, PATRON, "Pelin 3627 beyaz videosunu yap");
  assert.deepEqual(pelinGiden, []); // kod Pelin'i KENDİLİĞİNDEN çalıştırmadı
  assert.ok(o.claude.length >= 1); // mesaj beyne gitti
  // "Pelin" yazmayan mesajda beyin pelin_uret çağırsa bile araç başlatmaz
  assert.match(await aracla(o, "3394'ün fotoğrafını çek", "pelin_uret", { kodlar: ["3394"] }), /BAŞLATILMADI/);
  assert.equal(sonKart(o), undefined); // maliyet kartı açılmadı
  // açıklamasız dosya → düğmeli soru (yazı yok; beyne gidecek bir mesaj yok)
  const foto = (fid) => guncelleme({ update_id: uid++, message: { message_id: 3, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: fid }] } }, o.env);
  await foto("Q1");
  const k = sonKart(o);
  assert.deepEqual(k.govde.reply_markup.inline_keyboard.flat().map((b) => b.text), ["🎬 Pelin kullansın", "📣 Paylaş", "💾 Sadece kaydet", "📦 Hangi model / stok?"]);
  await bas(o, k.govde.reply_markup.inline_keyboard[1][0].callback_data); // sadece kaydet
  assert.match(o.depo.get("venom:bot:kayitliMedya"), /Q1/);
});

import { cfKullanimSatiri } from "./venom-bot.js";
test("CLOUDFLARE KULLANIM (6 Kasım): %80'de uyarı, altında ✅; ölçüm eskiyse 'ölçülemedi'", async () => {
  const o = ortam();
  const simdi = 1793900000;
  assert.match((await cfKullanimSatiri(o.env, simdi)).satir, /ölçülemedi/);
  o.depo.set("venom:cfKullanim", JSON.stringify({ zaman: simdi - 3600, kalemler: [{ ad: "DO istekleri", yuzde: 5.7, tahminYuzde: 37.6 }] }));
  let r = await cfKullanimSatiri(o.env, simdi);
  assert.equal(r.uyari, false); assert.match(r.satir, /DO istekleri — şimdi %5.7, ay sonu tahmini %37.6 ✅/);
  o.depo.set("venom:cfKullanim", JSON.stringify({ zaman: simdi - 3600, kalemler: [{ ad: "KV yazma", yuzde: 40, tahminYuzde: 85 }] }));
  r = await cfKullanimSatiri(o.env, simdi);
  assert.equal(r.uyari, true); assert.match(r.metin, /LİMİT UYARISI \(%80\): KV yazma şimdi %40, ay sonu tahmini %85/);
});

import { _durOnbellekSifirla, durdurulduMu } from "./durdurma.js";
import { hataAlarmi, isKaydet, isHatirlat, isCevap, satisUyarisi, ekipSuzgec, hatirlaticiEkle, vadesiGelenler } from "./venom-yonetim.js";
test("YÖNETİM (6 Kasım): ⛔ Durdur / hepsini aç; bot'u aç; 3 hata → otomatik durdurma; iş takibi 30 dk; hatırlatıcı; satış uyarısı; gizlilik", async () => {
  const o = ortam();
  _durOnbellekSifirla();
  // ⛔ Durdur düğmesi → onay → hepsi durur
  await yazi(o, PATRON, "⛔ Durdur");
  assert.equal(o.claude.length, 0);
  const k = sonKart(o);
  await bas(o, k.govde.reply_markup.inline_keyboard[0][0].callback_data);
  _durOnbellekSifirla();
  assert.equal(await durdurulduMu(o.env, "kemal"), true);
  assert.ok(patronaGiden(o).some((x) => /HEPSİ DURDURULDU/.test(x.govde.text)));
  // 12 Kasım: yazıyla "hepsini aç / Pelin'i durdur" kestirmesi yok → beyin bot_durdur aracını seçer
  assert.match(await aracla(o, "hepsini aç", "bot_durdur", { bot: "hepsi", dur: false }), /Bütün botlar AÇILDI/);
  _durOnbellekSifirla();
  assert.equal(await durdurulduMu(o.env, "selin"), false);
  assert.match(await aracla(o, "Pelin'i durdur", "bot_durdur", { bot: "pelin", dur: true }), /Pelin DURDURULDU/);
  _durOnbellekSifirla();
  assert.deepEqual([await durdurulduMu(o.env, "pelin"), await durdurulduMu(o.env, "kemal")], [true, false]);
  await aracla(o, "pelini aç", "bot_durdur", { bot: "pelin", dur: false });
  _durOnbellekSifirla();
  assert.equal(await durdurulduMu(o.env, "pelin"), false);
  // hata alarmı: 2 saatte 3 hata → durdur
  const t = 1793900000;
  assert.equal(await hataAlarmi(o.env, "selin", t, "a", t), null);
  assert.equal(await hataAlarmi(o.env, "selin", t + 60, "b", t + 60), null);
  const al = await hataAlarmi(o.env, "selin", t + 120, "GitHub 422", t + 120);
  assert.match(al, /Selin 2 saatte 3 kez hata verdi; .*DURDURDUM/);
  _durOnbellekSifirla();
  assert.equal(await durdurulduMu(o.env, "selin"), true);
  _durOnbellekSifirla();
  // iş takibi
  await isKaydet(o.env, "kemal", "3627 paylaşım kartı", t);
  assert.equal(await isHatirlat(o.env, t + 600), null);
  assert.match(await isHatirlat(o.env, t + 1900), /30 dakikadır cevap gelmeyen iş:\n• Kemal: 3627 paylaşım kartı/);
  assert.equal(await isHatirlat(o.env, t + 2000), null); // bir kez
  await isCevap(o.env, "kemal", t + 2100);
  assert.equal(JSON.parse(o.depo.get("venom:bot:isler"))[0].durum, "bitti");
  // hatırlatıcı
  assert.match(await hatirlaticiEkle(o.env, { zaman: "2026-11-07T10:00", metin: "Merdan'a 3627 videosunu sor", kime: "merdan" }, t), /Not aldım: 2026-11-07 10:00/);
  assert.equal((await vadesiGelenler(o.env, Date.parse("2026-11-07T09:59:00+03:00") / 1000)).length, 0);
  assert.equal((await vadesiGelenler(o.env, Date.parse("2026-11-07T10:01:00+03:00") / 1000)).length, 1);
  // gizlilik süzgeci (ekip)
  assert.ok(ekipSuzgec("3627'nin fiyatı 45$"));
  assert.ok(ekipSuzgec("bugün satış 30 adet"));
  assert.equal(ekipSuzgec("3627 videosunu tekrar gönderir misin"), null);
});

test("YÖNETİM (6 Kasım): satış uyarısı >20/gün (kod, adet, kalan stok; bir kez); sesli rapor önce maliyet sorar; sabit düğmeler bir kez", async () => {
  const o = ortam();
  const simdi = Math.floor(Date.now() / 1000);
  const gun = new Date((simdi + 3 * 3600) * 1000).toISOString().slice(0, 10);
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "3557", adet: 9, fiyat: 40 }], simdi: 1 }) });
  await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun, kalemler: [{ kod: "3557", adet: 25 }, { kod: "3600", adet: 3 }] }) });
  const u = await satisUyarisi(o.env, simdi);
  assert.match(u, /3557 — 25 adet, kalan stok 9/);
  assert.ok(!/3600/.test(u));
  assert.equal(await satisUyarisi(o.env, simdi), null);
  await aracla(o, "sesli rapor istiyorum", "sesli_rapor", { ac: true });
  const k = sonKart(o);
  assert.match(k.govde.text, /ÜCRETLİ\): rapor başına ≈0,02 \$/);
  assert.equal(o.depo.get("venom:sesliAcik"), undefined);
  // sabit düğmeler: kurulmamışsa ilk mesajda bir kez
  o.depo.delete("venom:bot:klavye:v1");
  o.cevaplar.push({ text: "Tamam." }, { text: "Tamam." });
  await yazi(o, PATRON, "selam");
  await yazi(o, PATRON, "selam");
  assert.equal(o.g.filter((x) => x.govde && x.govde.reply_markup && x.govde.reply_markup.keyboard).length, 1);
});

import { tabloyuListeyeCevir, defterMetni } from "./venom-bot.js";
test("DEFTER + TABLO (6 Kasım): Telegram'da tablo düz numaralı listeye döner; defterden marka/renk/video ve 'Merdan'dan bekleniyor'; defter yoksa tahmin yok", async () => {
  const t = tabloyuListeyeCevir("Videosuz modeller:\n| Kod | Marka | Durum |\n|---|---|---|\n| 3396 | VOLONTE | bekleniyor |\n| 3618 | BLACK ROSE | yok |\nSon.");
  assert.equal(t, "Videosuz modeller:\n1. 3396 · Marka: VOLONTE · Durum: bekleniyor\n2. 3618 · Marka: BLACK ROSE · Durum: yok\nSon.");
  const o = ortam();
  assert.match(await defterMetni(o.env, { filtre: "videosuz" }), /henüz hazır değil.*Tahmin etmiyorum/);
  o.depo.set("venom:siteDefteri", JSON.stringify({ zaman: 1793900000, modeller: {
    "3396": { kod: "3396", marka: "VOLONTE", renkler: ["siyah"], foto: 7, video: 0, videoOynuyor: 0, videoBekleniyor: true, bekleyenMb: 22, eklenme: "2026-11-05" },
    "3627": { kod: "3627", marka: "BLACKROSE", renkler: ["siyah", "koyu bordo", "beyaz"], foto: 12, video: 4, videoOynuyor: 4, videoBekleniyor: false, eklenme: "2026-11-05" },
    "3999": { kod: "3999", marka: "belirsiz", markaNot: "Sami'de kayıt yok", renkler: [], foto: 3, video: 0, videoOynuyor: 0, videoBekleniyor: false, eklenme: "2026-11-01" },
  } }));
  const v = await defterMetni(o.env, { filtre: "videosuz" });
  assert.match(v, /Videosuz 2 model \(site defteri\):\n1\. 3396 — VOLONTE · renk: siyah · 7 foto · videosuz · 📹 Merdan'dan video bekleniyor \(önceki 22 MB\)/);
  assert.match(v, /3999 — marka belirsiz \(Sami'de kayıt yok\)/);
  assert.ok(!/\?/.test(v.replace(/eklenme \?/g, "")));
  assert.match(await defterMetni(o.env, { kod: "3627" }), /3627 — BLACK ROSE · renk: siyah, koyu bordo, beyaz · 12 foto · 4 video/);
});

test("6 Kasım: düşünme imzası hatası — drop_block beta, yine de hata gelirse düşünmesiz tekrar (mesaj cevapsız kalmaz)", async () => {
  const { claudeTur, DUSUNME_BETA } = await import("./ai-istemci.js");
  const istekler = [];
  const hata = (m) => Object.assign(new Error(m), { status: 400 });
  const msj = [{ role: "user", content: "a" }, { role: "assistant", content: [{ type: "thinking", thinking: "x", signature: "s" }, { type: "tool_use", id: "t1", name: "n", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] }];
  const client = (sira) => ({ beta: { messages: { create: async (p) => { istekler.push({ beta: true, p }); const s = sira.shift(); if (s) throw s; return { content: [{ type: "text", text: "tamam" }] }; } } }, messages: { create: async (p) => { istekler.push({ beta: false, p }); const s = sira.shift(); if (s) throw s; return { content: [{ type: "text", text: "tamam" }] }; } } });
  // normal: beta + drop_block
  let r = await claudeTur(client([]), { model: "m", messages: msj });
  assert.equal(r.content[0].text, "tamam");
  assert.deepEqual(istekler[0].p.betas, [DUSUNME_BETA]);
  assert.equal(istekler[0].p.thinking.block_binding.prefix_mismatch_behavior, "drop_block");
  // imza hatası → düşünme blokları çıkarılıp tekrar
  istekler.length = 0;
  r = await claudeTur(client([hata("messages.3.content.0: Invalid `signature` in `thinking` block.")]), { model: "m", messages: msj });
  assert.equal(r.content[0].text, "tamam");
  assert.equal(istekler.length, 2);
  assert.ok(!istekler[1].p.messages[1].content.some((b) => b.type === "thinking"));
  assert.equal(istekler[1].p.messages[1].content[0].type, "tool_use");
  // beta kabul edilmezse eski çağrı
  istekler.length = 0;
  r = await claudeTur(client([hata("unexpected beta header thinking-binding-controls-2026-08-01")]), { model: "m", messages: msj });
  assert.equal(istekler[1].beta, false);
  // başka 400 aynen fırlatılır
  await assert.rejects(claudeTur(client([hata("max_tokens çok büyük")]), { model: "m", messages: msj }), /max_tokens/);
});

test("6 Kasım: 907 = VOLONTE (Patron kararı) — Vegawin'de iki markada olsa da kesin; KV kararları da geçerli; kural kitabında yazılı", async () => {
  const { markaKesin, markaKarari } = await import("./yayin-kontrol.js");
  const { kitapOku } = await import("./kitap.js");
  const ORTAK_KURALLAR = await kitapOku({ KAYIT: { get: async () => null, put: async () => null } }, "kemal", 1000); // 13 Kasım: botların okuduğu kitap
  const kv = new Map([["venom:markaKarar", JSON.stringify({ "3500": "BLACKROSE" })]]);
  const env = { KAYIT: { get: async (k, t) => (kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null) },
    STOK: { idFromName: () => 1, get: () => ({ fetch: async () => new Response(JSON.stringify({ satirlar: [{ magaza: "VOLONTE" }, { magaza: "BLACKROSE" }] })) }) } };
  assert.deepEqual(await markaKesin(env, "907"), { marka: "VOLONTE", kaynak: "Patron kararı" });
  assert.equal((await markaKesin(env, 3500)).marka, "BLACKROSE");
  assert.equal((await markaKesin(env, "3600")).marka, null); // karar yoksa yine "belirsiz" (tahmin yok)
  assert.equal(await markaKarari(env, "3600"), null);
  assert.match(ORTAK_KURALLAR, /Patron'un kesin marka kararları[^\n]*907 = VOLONTE/);
  assert.match(ORTAK_KURALLAR, /907 = VOLONTE, 3000 = VOLONTE, 3002 = VOLONTE, 3047 = BLACK ROSE, 4205 = BLACK ROSE\./);
  assert.equal((await markaKesin(env, "4205")).marka, "BLACKROSE");
  assert.equal((await markaKesin(env, "3002")).marka, "VOLONTE");
});

test("6 Kasım: gizli mesaj — Patron'a iletilemez mesaj, anahtar hemen silinir, 1 saat sonra mesaj silinir", async () => {
  const o = ortam();
  o.depo.set("venom:gizliMesaj", JSON.stringify({ metin: "🔐 yeni şifre: TEST", sure: 3600 }));
  const t = ist(3, 12, 10);
  await venomCron(o.env, t);
  assert.ok(!o.depo.has("venom:gizliMesaj"));
  const giden = o.g.find((x) => x.metod === "sendMessage" && /yeni şifre/.test(x.govde.text));
  assert.equal(giden.govde.protect_content, true);
  assert.ok(!o.g.some((x) => x.metod === "deleteMessage"));
  await venomCron(o.env, t + 3605);
  assert.ok(o.g.some((x) => x.metod === "deleteMessage"));
  assert.deepEqual(JSON.parse(o.depo.get("venom:silinecekMesaj")), []);
});

test("9 Kasım POSTANE: bilgi birikir, kart ve kritik anında; düzenleme (✏️) kart sayılmaz; 10 tavanı → fazla kartlar saatlik TEK mesaj", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const { postaKarar, kategori, kritikMi } = await import("./venom-posta.js");
  assert.equal(kategori("✅ 3627 kanala gönderildi"), "paylaşıldı");
  assert.equal(kategori("🛑 Venom kontrolü — 3557 kanala GİTMEDİ"), "durduruldu");
  assert.equal(kategori("⚠️ 3557 paylaşılamadı: yetki yok"), "paylaşılamadı");
  assert.ok(kritikMi("🔴 Köprü VOLONTE sustu: mağaza açık ama 1 saatten uzun sinyal yok"));
  assert.equal((await postaKarar(o.env, { kaynak: "kemal", metin: "✅ 3627 paylaşıldı (Hemra onayladı)" }, ist(9, 10))).karar, "biriktir");
  // bilgi → Patron'a GİTMEZ, birikir
  await v.aktarilanGonder(o.env, { bot: "kemal", metod: "sendMessage", metin: "✅ 3627 paylaşıldı (Hemra onayladı)", medya: [] });
  await v.aktarilanGonder(o.env, { bot: "kemal", metod: "editMessageText", metin: "✏️ ✅ 3557 Hemra onayladı", butonlar: [[{ text: "x", callback_data: "y1:1:3557" }]], medya: [] });
  assert.equal(patronaGiden(o).length, 0);
  const gun = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  assert.equal(JSON.parse(o.depo.get(`venom:posta:${gun}`)).length, 2);
  // 9 Kasım (sert müdür A): izin listesinde OLMAYAN kart Patron'a gitmez → Venom'un çözüm kuyruğu
  await v.aktarilanGonder(o.env, { bot: "selin", metod: "sendMessage", metin: "📝 2999 taslak onayı", butonlar: [[{ text: "✅ Onayla", callback_data: "so:2999" }]], medya: [] });
  assert.equal(patronaGiden(o).length, 0);
  assert.match(JSON.parse(o.depo.get("venom:cozum"))[0].ozet, /2999 taslak onayı/);
  // izinli kart (fabrika sipariş onayı) → anında (10'a kadar)
  for (let i = 0; i < 12; i++) await v.aktarilanGonder(o.env, { bot: "sami", metod: "sendMessage", metin: `🏭 ${3000 + i} fabrika sipariş onayı`, butonlar: [[{ text: "✅ Onayla", callback_data: `so:${3000 + i}` }]], medya: [] });
  assert.equal(patronaGiden(o).length, 10);
  assert.equal(JSON.parse(o.depo.get("venom:posta:kartSira")).length, 2);
  // kritik → tavan dolu olsa da anında
  await v.aktarilanGonder(o.env, { bot: "sami", metod: "sendMessage", metin: "🔴 Köprü VOLONTE sustu", medya: [] });
  assert.equal(patronaGiden(o).length, 11);
  // saat başı: kalan 2 kart TEK mesajda, numaralı düğmelerle
  const simdi = Math.floor(Date.now() / 1000), saatBasi = simdi - (simdi % 3600) + 60;
  await venomCron(o.env, saatBasi);
  const bir = patronaGiden(o).filter((x) => /Birleştirilmiş onaylar \(2\)/.test(x.govde.text));
  if (((saatBasi + 3 * 3600) % 86400) / 3600 >= 8 && ((saatBasi + 3 * 3600) % 86400) / 3600 < 22) {
    assert.equal(bir.length, 1);
    assert.match(bir[0].govde.reply_markup.inline_keyboard[0][0].text, /^1· ✅ Onayla/);
  }
});

test("9 Kasım: 'bunu bana gönderme' kalıcı kural olur (son mesajın botu + türü); /kurallarım listeler, ❌ ile kaldırılır; kritik susturulmaz", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const { kuralCoz } = await import("./venom-posta.js");
  assert.deepEqual(kuralCoz("Kemal'in paylaşıldı mesajlarını bana gönderme"), { bot: "kemal", kategori: null, kelimeler: ["paylaşıldı"], ornek: null });
  assert.equal(kuralCoz("Fuat'a mesaj gönder"), null);
  // Patron'a bir kart gitti (Selin), Patron "bunu bana gönderme" dedi
  await v.aktarilanGonder(o.env, { bot: "selin", metod: "sendMessage", metin: "📝 3001 taslak silme onayı", butonlar: [[{ text: "✅", callback_data: "so:3001" }]], medya: [] });
  // 10 Kasım: yanıt vermeden söylenen "bana getirme" kural OLMAZ
  await yazi(o, PATRON, "Hayır bana onaya getirme sadece düzelt paylaşımını yap");
  assert.ok(!o.depo.get("venom:bildirimKurallari") || JSON.parse(o.depo.get("venom:bildirimKurallari")).length === 0);
  // kart mesajına YANIT + açıkça "bunu bana gönderme" → kalıcı kural
  const kartId = JSON.parse(o.depo.get("venom:posta:gonderilen")).find((x) => /3001 taslak/.test(x.ozet || x.metin || "")).id;
  o.g.length = 0; o.claude.length = 0;
  o.cevaplar.push({ arac: "bildirim_kurali", girdi: {} }, { text: "Kaydedildi." });
  await guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, text: "bunu bana gönderme", reply_to_message: { message_id: kartId, text: "📝 3001 taslak silme onayı" } } }, o.env);
  assert.match(patronaGiden(o)[0].govde.text, /📝 Kalıcı kural kaydedildi: Selin · "rapor" mesajları|📝 Kalıcı kural kaydedildi: Selin/);
  assert.equal(patronaGiden(o).length, 1); // 12 Kasım: beyin bildirim_kurali aracını seçti; ikinci mesaj yok
  const kurallar = JSON.parse(o.depo.get("venom:bildirimKurallari"));
  assert.equal(kurallar[0].bot, "selin");
  assert.deepEqual(kurallar[0].kelimeler, ["taslak", "silme"]); // örnek mesaja bağlı (bütün Selin mesajları değil)
  // aynı türden Selin mesajı artık anında gelmez
  o.g.length = 0;
  await v.aktarilanGonder(o.env, { bot: "selin", metod: "sendMessage", metin: "📝 3002 taslak silme onayı", butonlar: [[{ text: "✅", callback_data: "so:3002" }]], medya: [] });
  assert.equal(patronaGiden(o).length, 0);
  // kritik yine gelir
  await v.aktarilanGonder(o.env, { bot: "selin", metod: "sendMessage", metin: "🔴 Köprü sustu (Selin iletti)", medya: [] });
  assert.equal(patronaGiden(o).length, 1);
  // /kurallarım → liste + kaldır düğmesi
  o.g.length = 0;
  await yazi(o, PATRON, "/kurallarım");
  const liste = patronaGiden(o)[0];
  assert.match(liste.govde.text, /Sabit \(sizin 9 Kasım kararınız\)[\s\S]*Sizin kalıcı kurallarınız:\n1\. Selin/);
  await bas(o, liste.govde.reply_markup.inline_keyboard[0][0].callback_data);
  assert.deepEqual(JSON.parse(o.depo.get("venom:bildirimKurallari")), []);
});

test("9 Kasım MAĞAZA SAATLERİ: hafta sonu köprü izlenmez; pazartesi sabah cuma akşamı sinyali normal; hafta içi açıkken 1 saat → uyarı", async () => {
  const { kopruSustu, acikSessizlik, magazaAcik } = await import("./magaza-saat.js");
  const t = (gun, hh, mm = 0) => Date.UTC(2026, 10, gun, hh - 3, mm) / 1000; // Kasım 2026 (6 cuma, 7 cmt, 8 pazar, 9 pzt)
  const cumaAksam = t(6, 19, 30);
  assert.equal(magazaAcik(t(7, 12)), false); // cumartesi
  assert.equal(kopruSustu(cumaAksam, t(7, 12)), false);
  assert.equal(kopruSustu(cumaAksam, t(8, 15)), false); // pazar
  assert.equal(kopruSustu(cumaAksam, t(9, 9, 30)), false); // pazartesi 09:30: bilgisayar açılıyor
  assert.equal(kopruSustu(cumaAksam, t(9, 10, 5)), true); // pazartesi 10:05: açılıştan beri 1 saati geçti
  assert.equal(kopruSustu(t(9, 10, 30), t(9, 11)), false);
  assert.equal(kopruSustu(t(9, 10, 0), t(9, 11, 5)), true);
  assert.equal(acikSessizlik(cumaAksam, t(9, 9, 30)), 30 * 60);
  // salı sabahı: pazartesi bütün gün sinyal yoksa (köprü ölü) 09:05'te de uyarır
  assert.equal(kopruSustu(cumaAksam, t(10, 9, 5)), true);
});

test("11 Kasım RAPOR DÜZENİ: sabah 09:40 en fazla 8 satır, sabit sıra (genel · karar · satış · kanal · site · fabrika · Venom); tekrar yok; /detay ayrıntıyı verir", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  o.depo.set("venom:posta:2026-11-03", JSON.stringify([{ zaman: ist(3, 2), kaynak: "kemal", kategori: "paylaşıldı", ozet: "✅ 3627 paylaşıldı" }, { zaman: ist(3, 3), kaynak: "kemal", kategori: "paylaşılamadı", ozet: "🛑 3557 kanala gitmedi" }]));
  o.depo.set("venom:bittiKart:S1", JSON.stringify({ kod: "3490", zaman: ist(3, 8) }));
  o.depo.set("venom:siteDefteri", JSON.stringify({ zaman: 1, modeller: { 3627: { kod: "3627", eklenme: "2026-11-02" }, 3629: { kod: "3629", eklenme: "2026-10-01" }, 3000: { kod: "3000", gizli: true } } }));
  o.depo.set("venom:cozdum:2026-11-02", JSON.stringify(["VOLONTE köprüsü (Merdan/Hemra ile)"]));
  await o.env.STOK.get().fetch("https://stok/isd-yaz", { method: "POST", body: JSON.stringify({ kayitlar: [{ zaman: ist(2, 14), bot: "selin", tur: "is", kod: "3627", ozet: "site: 3627 siteye eklendi (onaylayan: Merdan)" }, { zaman: ist(2, 15), bot: "selin", tur: "is", kod: "3001", ozet: "site: 3001 siteden kaldırıldı (Patron)" }, { zaman: ist(2, 16), bot: "selin", tur: "is", ozet: "site: Vegawin stok güncellemesi (2 model)" }] }) }); // 12 Kasım: ekleme / kaldırma / güncelleme AYRI sayılır
  const m = await v.sabahOzeti(o.env, ist(3, 9, 40));
  const s = m.split("\n");
  assert.ok(s.length <= 8, m);
  assert.equal(new Set(s).size, s.length); // her satır tek kez
  assert.match(s[0], /^☀️ Günaydın Patron — .* \(ayrıntı \/detay\)$/);
  assert.match(s[1], /^(✅ Botlar çalışıyor \(dün iş kontrolü yapılmadı\)|🔴 \d+ sorun var: )/); // 13 Kasım: "Her şey çalışıyor" sadece iş kontrolü de temizse
  assert.equal(s[2], "🟡 Kararınız bekleniyor: repete 3490");
  assert.match(s[3], /^💰 Satış dün: VOLONTE \S+ adet( · |, )/); // 11 Kasım: adet + (varsa) ciro, markalar ayrı
  assert.match(s[3], /Black Rose \S+ adet/);
  assert.match(s[4], /^📣 Kanal dün: \S+ paylaşım$/);
  assert.equal(s[5], "🌐 Site: 2 model, dün 1 eklendi, 1 kaldırıldı");
  assert.match(s[6], /^🏭 Fabrika: /);
  assert.equal(s[7], "🛡 Venom kendi çözdü: VOLONTE köprüsü (Merdan/Hemra ile)");
  assert.ok(!/<\/?b>|📨|kart/.test(m)); // iç ayrıntı / kart sayısı yok
  o.g.length = 0;
  await yazi(o, PATRON, "/detay");
  assert.match(patronaGiden(o)[0].govde.text, /Biriken bilgiler:[\s\S]*3557 kanala gitmedi/);
});

// 11 Kasım (Patron): <b> gibi etiketler görünmez; izin sorusu yok; köprü önce ekibe
test("11 Kasım MESAJ DÜZENİ: botun <b> etiketli yazısı temiz gider; 'kontrol edeyim mi?' yerine Venom kendisi bakar; köprü alarmı önce Merdan+Hemra, 30 dk sonra Patron'a tek satır, açılışta/hafta sonu yok", async () => {
  const v = await import("./venom-bot.js");
  assert.equal(v.etiketTemizle("Patron, <b>Hiçbir şey silinmedi.</b> • <b>Kaldırmak:</b> **yok**"), "Patron, Hiçbir şey silinmedi. • Kaldırmak: yok");
  const o = ortam();
  await v.tg(o.env, "sendMessage", { chat_id: PATRON, text: "<b>Kalın</b> yazı", izin: "cevap" });
  assert.equal(o.g.at(-1).govde.text, "Kalın yazı");
  // izin sorusu → bir tur daha (araçla bakar), son mesajda soru yok
  o.cevaplar.push({ text: "Kontrol edip sana net durumu yazayım mı?" }, { arac: "stok_sorgu", girdi: { kod: "3557" } }, { text: "3557: Black Rose 20, VOLONTE 7 adet." });
  o.g.length = 0;
  await yazi(o, PATRON, "merhaba, şuna bir bakar mısın");
  const t = patronaGiden(o).map((x) => x.govde.text);
  assert.deepEqual(t, ["3557: Black Rose 20, VOLONTE 7 adet."]);
  assert.match(JSON.stringify(o.claude.at(-1).messages), /Patron'a izin sorma/);
  // köprü
  Object.assign(o.env, { BR_SORUMLU: "222", HEMRA_ID: "333", AZIZ_ID: "444" });
  const kopru = (son) => { o.stok.depo.sql.exec("INSERT INTO kopru (magaza, son, adet, degisim, kalp) VALUES ('BLACKROSE', ?, 0, ?, ?)", son, son, son); };
  const ozetEski = o.env.STOK;
  const sonSinyal = ist(10, 20, 0); // salı akşamı son sinyal
  await o.env.STOK.get().fetch("https://stok/ozet", { method: "POST", body: "{}" }); // depo hazırlansın
  kopru(sonSinyal);
  o.g.length = 0;
  await v.kopruIzle(o.env, ist(11, 10, 0)); // 10:00 açılış saati → alarm yok
  assert.equal(o.g.length, 0);
  await v.kopruIzle(o.env, ist(11, 10, 45));
  const ekip = await kuyruguAl(o.env, "giden"); // ekip Sami üzerinden
  assert.deepEqual(ekip.map((x) => x.kime), ["merdan", "hemra"]);
  assert.match(ekip[0].metin, /^🔌 BLACK ROSE: Mağaza bilgisayarı açık mı, Sami köprüsü çalışıyor mu\?/);
  assert.equal(patronaGiden(o).length, 0);
  await v.kopruIzle(o.env, ist(11, 11, 0)); // 15 dk — Patron'a yok
  assert.equal(patronaGiden(o).length, 0);
  await v.kopruIzle(o.env, ist(11, 11, 16)); // 31 dk — Patron'a tek satır
  assert.equal(patronaGiden(o).length, 1);
  assert.match(patronaGiden(o)[0].govde.text, /^🔴 Köprü sustu: Black Rose mağaza bilgisayarı 20:00'den beri sinyal vermiyor; Merdan ve Hemra'ya 30 dk önce soruldu, düzelmedi\.$/);
  await v.kopruIzle(o.env, ist(11, 11, 31));
  assert.equal(patronaGiden(o).length, 1); // tek sefer
  assert.ok(ozetEski);
});

test("11 Kasım (B7): köprü SİNYAL VERİYORSA Venom soru sormaz — Vegawin'e giriş olmaması normal (veri gelmese de ne ekibe ne Patron'a mesaj)", async () => {
  const v = await import("./venom-bot.js");
  const o = ortam();
  Object.assign(o.env, { BR_SORUMLU: "222", HEMRA_ID: "333", AZIZ_ID: "444" });
  await o.env.STOK.get().fetch("https://stok/ozet", { method: "POST", body: "{}" });
  const simdi = ist(11, 14, 0);
  o.stok.depo.sql.exec("INSERT INTO kopru (magaza, son, adet, degisim, kalp) VALUES ('VOLONTE', ?, 0, ?, ?)", simdi - 60, ist(10, 18, 7), simdi - 60);
  await v.kopruIzle(o.env, simdi);
  o.stok.depo.sql.exec("UPDATE kopru SET son = ?, kalp = ? WHERE magaza = 'VOLONTE'", simdi + 3500, simdi + 3500); // sinyal sürüyor, veri yine yok
  await v.kopruIzle(o.env, simdi + 3600);
  assert.equal((await kuyruguAl(o.env, "giden")).length, 0);
  assert.equal(patronaGiden(o).length, 0);
});

test("11 Kasım REPETE KARTI (Venom): Sami'nin önerisi → sade Patron kartı (dağılım + [✅ Onaylıyorum] [❌ Reddediyorum], eski Repete/Sil/Bekle YOK) → karar Sami'ye; Fuat cevabı TEK satır; kural 43 kapıları", async () => {
  const v = await import("./venom-bot.js");
  const o = ortam();
  const ekle = (ad, kayit) => kuyrugaEkle(o.env, ad, kayit);
  await ekle("rkOneri", { id: "DTEST-001-a:o", rid: "DTEST-001-a", kod: "TEST-001", magaza: "VOLONTE", deneme: true, dagilim: "beyaz · büyük 20, küçük 20", adet: 40, kalan: 4, satis7: 18, bitisGun: 2, hemra: "Hemra", foto: null, zaman: ist(11, 15) });
  await venomCron(o.env, ist(11, 15, 2));
  const k = sonKart(o);
  assert.equal(k.govde.text, "🧪 DENEME – üretim yapmayın\n🔁 REPETE — 🟦 VOLONTE · TEST-001\nDağılım: beyaz · büyük 20, küçük 20 (toplam 40 adet)\nMağazada kalan 4 adet · son 7 günde 18 satıldı · ~2 günde biter\nHemra önerdi. Onaylarsanız Fuat'a gider.");
  assert.deepEqual(k.govde.reply_markup.inline_keyboard.map((s) => s.map((b) => b.text)), [["✅ Onaylıyorum", "❌ Reddediyorum"]]);
  o.g.length = 0;
  await bas(o, k.govde.reply_markup.inline_keyboard[0][0].callback_data);
  const kr = await kuyruguAl(o.env, "rkKarar");
  assert.deepEqual(kr.map((x) => [x.rid, x.karar, x.dugme]), [["DTEST-001-a", "onay", "✅ Onaylıyorum"]]);
  const duz = o.g.find((x) => x.metod === "editMessageText");
  assert.match(duz.govde.text, /Hemra önerdi\.\n\n✅ Kararınız: Onaylıyorum — Fuat'a gidiyor\.$/);
  assert.deepEqual(duz.govde.reply_markup.inline_keyboard, []);
  await bas(o, "vrk:x:DTEST-001-a"); // ikinci basış işlemez
  assert.equal((await kuyruguAl(o.env, "rkKarar")).length, 0);
  // Fuat onayladı → Patron'a TEK satır; "mal geldi" bilgisi birikir (anında gitmez)
  o.g.length = 0;
  await ekle("rkSonuc", { id: "DTEST-001-a:s", rid: "DTEST-001-a", metin: "🧪 DENEME — TEST-001 · 40 adet · Fuat onayladı · teslim: 21.11.2026" });
  await ekle("rkSonuc", { id: "3419-x:g", rid: "3419-x", metin: "📦 3419 repete geldi (Vegawin stoğu 4 → 44). Repete kaydı kapandı.", biriktir: true });
  await venomCron(o.env, ist(11, 15, 7));
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["🧪 DENEME — TEST-001 · 40 adet · Fuat onayladı · teslim: 21.11.2026"]);
  const kanit = JSON.parse(o.depo.get("venom:rkKanit:DTEST-001-a"));
  assert.deepEqual(kanit.map((x) => x.ne), ["Patron kartı", "Patron bastı: ✅ Onaylıyorum", "Patron'a sonuç (tek satır)"]);
  // KURAL 43: 3419'un açık repetesi varken yeni repete taslağı hazırlanmaz (repete raporu düğmesi, model kartı, yazıyla istek)
  const ayarYaz = (k2, v2) => o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: k2, v: JSON.stringify(v2) }) });
  await ayarYaz("rk:3419-x", { id: "3419-x", kod: "3419", magaza: "VOLONTE", deneme: false, adet: 40, durum: "acik", teslim: "2026-11-21", zaman: ist(11, 15) });
  await ayarYaz("rk:acik", ["3419-x"]);
  o.g.length = 0;
  o.depo.set("venom:repeteTaslak", JSON.stringify([{ kod: "3419", metin: "Fuat Bey merhaba, 3419 modelinden repete rica ediyoruz: sarı 20. Toplam yaklaşık 40 adet. Ne zaman hazır olur?", zaman: 1 }]));
  await venomCron(o.env, ist(11, 15, 12));
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["⛔ 3419 için açık repete var (Fuat onayladı, teslim 21.11.2026). Mal gelmeden yeni repete verilmez."]);
  assert.ok(!patronaGiden(o).some((x) => /Fuat'a gidecek mesaj/.test(x.govde.text)));
  assert.match(await v.aracCalistir(o.env, "mesaj_taslagi", { kime: "fuat", metin: "3419 için repete rica ediyoruz, 40 adet" }, ist(11, 15, 13)), /^AÇIK REPETE VAR — taslak HAZIRLANMADI/);
  o.g.length = 0;
  await bas(o, "vmk:r:3419");
  assert.ok(patronaGiden(o).some((x) => /^⛔ 3419 için açık repete var/.test(x.govde.text)));
  // temizlik: deneme kayıtları silinince Venom'daki kart ve kanıt da silinir
  await ekle("rkSonuc", { id: "temizle:1", temizle: ["DTEST-001-a"] });
  await venomCron(o.env, ist(11, 15, 17));
  assert.ok(!o.depo.has("venom:rkKart:DTEST-001-a") && !o.depo.has("venom:rkKanit:DTEST-001-a"));
});

test("11 Kasım VENOM LİSTELERİ (B1–B5): Bekleyenler = sadece Patron kararı, her biri kendi düğmesiyle; bilgi satırı yok; 3 günden eski ve tekrar düşer; satır kesilmez; kod adı görünmez; biten Kemal işi kanıtla kapanır", async (tc) => {
  const v = await import("./venom-bot.js");
  const { bitmeyenIsler, isBasligi } = await import("./venom-yonetim.js");
  const o = ortam();
  const simdi = ist(11, 15, 0);
  // 13 Kasım (ders 36): test verisi sabit tarihli — "şimdi" de sabitlenir (yoksa test birkaç gün sonra kendiliğinden düşer)
  const gercekSaat = Date.now; Date.now = () => (simdi + 60) * 1000; tc.after(() => { Date.now = gercekSaat; });
  const kart = (id, tur, gunOnce, ek = {}) => o.depo.set(`venom:bot:is:${id}`, JSON.stringify({ id, tur, durum: "bekliyor", zaman: simdi - gunOnce * 86400, metin: "📋 Fuat'a gidecek mutabakat (birebir; altında ✅ Mutabıkım / ❌ Uyuşmuyor / ⏳ Sonra düğmeleri):\n\n…", ...ek }));
  kart("m1", "mutabakat", 5); // eski → düşer
  kart("m2", "mutabakat", 1.5); // aynı iş, eski kopya → düşer (12 Kasım: 2 gün idi; mesaj gerçek saatle işlendiği için 12.11 15:00'ten sonra 3 günü geçip "eskidi" oluyordu)
  kart("m3", "mutabakat", 1);
  kart("s1", "selinTaslak", 5, { metin: "📝 Selin — 3627 için site taslağı hazırlansın mı? (başlık + EN/FR/PT açıklama; Selin'in yapay zekâ maliyeti ~0,05 $). Taslak hazır olunca onay kartı buraya gelir." }); // 5 günlük → düşer
  kart("f1", "mesaj", 0.1, { kime: "fuat", govde: "Fuat Bey merhaba, 3490 modelinden repete rica ediyoruz: siyah 8. Toplam yaklaşık 40 adet. Ne zaman hazır olur?", metin: "✉️ Fuat'a gidecek mesaj (Sami adına, birebir):\n\n…" });
  o.depo.set(`venom:rapor:selin:2026-11-11`, JSON.stringify({ ozet: "Sitede 165 model; dün 3 eklendi; onay bekleyen 0; gönderilemeyen 2." }));
  await yazi(o, PATRON, "📋 Bekleyenler");
  const m = patronaGiden(o);
  assert.deepEqual(m.map((x) => x.govde.text), [
    "⏳ 1/2 — Fuat'a gidecek mesaj: \"Fuat Bey merhaba, 3490 modelinden repete rica ediyoruz: siyah 8.\" (11.11)",
    "⏳ 2/2 — Fuat mutabakatı: Fuat'a gidecek haftalık stok ve bakiye dökümü (siz onaylamadan gitmez) (10.11)",
  ]);
  assert.deepEqual(m[1].govde.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["vb:o:m3", "vb:d:m3", "vb:x:m3"]); // her işin altında kendi düğmesi
  assert.ok(!m.some((x) => /Sitede 165 model|Sonr$|3627/.test(x.govde.text)));
  assert.deepEqual(["m1", "m2", "s1"].map((id) => JSON.parse(o.depo.get(`venom:bot:is:${id}`)).durum), ["eskidi", "tekrar", "eskidi"]);
  // hiçbiri yoksa tek satır
  for (const id of ["m3", "f1"]) o.depo.delete(`venom:bot:is:${id}`);
  o.g.length = 0;
  await yazi(o, PATRON, "📋 Bekleyenler");
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["✅ Kararınızı bekleyen iş yok."]);
  // Bitmeyen işler: kod adı yok, yarım kelime yok; kanal taraması temizse iş kanıtla kapanır; 3 günden eski düşer
  assert.equal(isBasligi("3512 ve 3629: yazısında fiyat olan eski kanal paylaşımlarını (3512 video/albüm 14:35, 3629 video 14:40) kanal_paylasim_d"), "3512 ve 3629: yazısında fiyat olan eski kanal paylaşımlarını (3512 video/albüm 14:35, 3629 video 14:40)");
  o.depo.set("venom:bot:isler", JSON.stringify([
    { id: "a", bot: "kemal", ne: "3512 ve 3629: yazısında fiyat olan eski kanal paylaşımlarını (3512 video/albüm 14:35, 3629 video 14:40) kanal_paylasim_d", zaman: simdi - 5 * 3600, durum: "bekliyor" },
    { id: "b", bot: "selin", ne: "3627 taslağını hazırla", zaman: simdi - 4 * 86400, durum: "bekliyor" },
    { id: "c", bot: "kemal", ne: "3700 paylaşımının yazısını düzelt", zaman: simdi - 3600, durum: "bekliyor" },
  ]));
  o.depo.set("venom:kanal:son", JSON.stringify([{ id: 15005, zaman: simdi - 30 * 3600, kod: "3512", sorunlar: ["yazıda FİYAT var"] }, { id: 15010, zaman: simdi - 30 * 3600, kod: "3629", sorunlar: ["yazıda FİYAT var"] }, { id: 15050, zaman: simdi - 600, kod: "3700", sorunlar: ["yazıda FİYAT var"] }]));
  o.depo.set("kemal:kanalTaraSonuc", JSON.stringify({ zaman: simdi - 26 * 3600, eski: [], toplam: 114 }));
  const b = await bitmeyenIsler(o.env, simdi);
  assert.equal(b, "📌 Bitmeyen işler (1):\n• Kemal: 3700 paylaşımının yazısını düzelt (11.11 14:00)"); // 3700: sorun taramadan SONRA → kanıt yok, listede kalır
  const l = JSON.parse(o.depo.get("venom:bot:isler"));
  assert.deepEqual(l.map((x) => x.durum), ["bitti", "eskidi", "bekliyor"]);
  assert.match(l[0].kanit, /^kanal taraması 11-10 13:00: 3512, 3629 için sorunlu paylaşım yok$/);
  // Patron'a giden hiçbir mesajda kod adı yok (yarım kesilmişi dahil); kullanıcı adı bozulmaz
  assert.equal(v.kodAdiTemizle("Kemal: eski paylaşımları kanal_paylasim_d (bota_yaz ile) düzelt — @ali_veli"), "Kemal: eski paylaşımları ( ile) düzelt — @ali_veli");
});

test("9 Kasım REPETE: Kemal'den gelen 'Repete al' taslağı Patron'a HEMEN onay kartı (Fuat'a gidecek, ✏️ Düzelt ile adet/renk); onaysız Fuat'a gitmez", async () => {
  const o = ortam();
  o.depo.set("venom:repeteTaslak", JSON.stringify([{ kod: "3627", metin: "Fuat Bey merhaba, 3627 modelinden repete rica ediyoruz: siyah 10. Toplam yaklaşık 10 adet. Ne zaman hazır olur?", zaman: 1 }]));
  await venomCron(o.env, ist(9, 11, 2));
  const k = patronaGiden(o).find((x) => /Fuat'a gidecek mesaj/.test(x.govde.text));
  assert.ok(k, "kart geldi");
  assert.match(k.govde.text, /3627 modelinden repete/);
  assert.deepEqual(k.govde.reply_markup.inline_keyboard[0].map((b) => b.text), ["✅ Onayla", "✏️ Düzelt", "❌ İptal"]);
  assert.ok(!o.depo.has("venom:repeteTaslak"));
  assert.equal(o.samiG.filter((x) => String(x.govde.chat_id) === FUAT).length, 0);
});

test("12 Kasım MODEL DURUMU: model kodu geçen mesaja hazır kart GİTMEZ; beyin model_durumu aracından okur — tek marka, mağaza mağaza stok, repete, silme kanıtı, açık kartlar, çelişki", async () => {
  const { kodlariBul, kartSatirlari } = await import("./venom-model.js");
  assert.deepEqual(kodlariBul("36 29 kaç adet var"), ["3629"]);
  const o = ortam();
  const simdi = ist(12, 11);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    await o.stok.fetch(new Request("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3377", adet: 0, fiyat: 40 }, { kod: "3534", adet: 44, fiyat: 40 }], simdi: ist(12, 9) }) }));
    o.depo.set("venom:siteDefteri", JSON.stringify({ modeller: { 3534: { kod: "3534", marka: "BLACKROSE" } } }));
    o.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "kanaladi" }));
    o.depo.set("silinen:3377", JSON.stringify({ kod: "3377", kim: "Patron (Venom)", zaman: ist(12, 9, 56), kopya: [{ kanal: 10680, arsiv: 1, gizlendi: true }, { kanal: 12791, arsiv: 2, gizlendi: true }] }));
    o.depo.set("silme:onayli", JSON.stringify({ 3377: { kim: "Patron (Venom)", zaman: ist(12, 9, 49) } }));
    globalThis.__site = [{ kod: "3534" }];
    o.env.SELIN_DEPO = { dosya: async () => ({ ok: true, govde: new TextEncoder().encode(JSON.stringify([{ kod: "3534", fotolar: ["a"] }])) }) };
    // Hemra'da 3377 için açık kart duruyor (karar verilmiş modelde kalmış)
    const { defterTg } = await import("./is-defteri.js");
    await defterTg({ STOK: o.env.STOK, KAYIT: o.env.KAYIT }, "sami", "sendMessage", { chat_id: "504", text: "🏭 Sinem · 3377 → Bitti · ne yapalım?", reply_markup: { inline_keyboard: [[{ text: "Repete", callback_data: "fk:r:3377-x" }]] } }, { ok: true, result: { message_id: 77 } });
    await o.env.STOK.get().fetch("https://stok/fs-yaz", { method: "POST", body: JSON.stringify({ rec: { id: "3377-x", kod: "3377", magaza: "BLACKROSE", durum: "bitti", gonderim: simdi - 3600, mesajlar: [] } }) });
    const onceG = o.g.length;
    const c = await aracla(o, "3377 hangi marka, stokta kaç tane var, şu an repete mi bekliyor, silme mi?", "model_durumu", { kod: "3377" });
    assert.equal(o.g.slice(onceG).filter((x) => x.metod === "sendPhoto" || x.metod === "sendMediaGroup").length, 0); // hazır kart / fotoğraf GİTMEDİ
    const s = c.split("\n");
    assert.equal(s[0], "3377: marka Black Rose (Sami deposu). Stok: Black Rose 0 adet.");
    assert.equal(s[1], "Repete: açık repete yok.");
    assert.equal(s[2], "Silme: BİTTİ — siteden kalktı (site listesinde yok); kanaldan kalktı 12.11 09:56: 2 mesaj (2 eski mesaj Telegram kuralı yüzünden silinemedi, SOLD OUT görseliyle gizlendi); mesaj no 10680, 12791.");
    assert.match(c, /Açık işler \(1\):\n  12\.11 10:00 · 3377 · Black Rose · Fabrika isteği \(eksik listesi\) · Hemra · açık · kanıt: fabrikada bitti, karar bekleniyor/);
    assert.match(c, /ÇELİŞKİ: silinen model için 1 açık kart duruyor \(kapatılmalı\)\./);
    // 3534: stok 44 → çelişki yok, silme yok
    const c2 = await aracla(o, "3534 durumu", "model_durumu", { kod: "3534" });
    assert.match(c2, /^3534: marka Black Rose \(site defteri\)\. Stok: Black Rose 44 adet\.\nRepete: açık repete yok\.\nSilme: yapılmadı \(silme kaydı yok; model sitede duruyor\)\./);
    assert.match(c2, /Çelişki yok\.$/);
    // "3534'ü siteden ve kanaldan sil" → stok 44: kart AÇILMAZ, tek satır kural (beyin karar_uygula / siteden_kaldir çağırsa bile)
    const kartOnce = patronaGiden(o).filter((x) => x.govde.reply_markup).length;
    const c3 = await aracla(o, "3534'ü siteden ve kanaldan sil.", "siteden_kaldir", { kod: "3534" });
    assert.match(c3, /^SİLME KARTI AÇILMADI: 3534 mağazada stokta \(BLACK ROSE 44 adet\)\. Kural: mağaza stoğu bitmeden model siteden ve kanaldan silinmez\./);
    assert.match(await aracla(o, "3534 sil", "karar_uygula", { kod: "3534", karar: "sil" }), /^SİLME KARTI AÇILMADI/);
    assert.equal(patronaGiden(o).filter((x) => x.govde.reply_markup).length, kartOnce); // hiç kart gitmedi
    assert.equal(Object.keys(JSON.parse(o.depo.get("venom:bot:is:dummy") || "{}")).length, 0);
    // zaten silinmiş modele ikinci silme kartı açılmaz; kanıt döner
    assert.match(await aracla(o, "3377'yi sil", "siteden_kaldir", { kod: "3377" }), /^3377 zaten silinmiş; kart açılmadı\. Silme: BİTTİ/);
    // 13 Kasım (Patron): stoğu 0 olan model fotoğraf listesine eklenmez; stoğu olan eklenir
    assert.deepEqual(kartSatirlari({ kod: "3700", marka: "VOLONTE", stok: { VOLONTE: 0 }, s7: 0, s14: 0, gun14: 14, fs: [], sitede: false, fotoYok: true }).at(-1), "📷 Fotoğraf yok (stok bittiği için fotoğraf listesine eklenmedi).");
    assert.deepEqual(kartSatirlari({ kod: "3700", marka: "VOLONTE", stok: { VOLONTE: 6 }, s7: 0, s14: 0, gun14: 14, fs: [], sitede: false, fotoYok: true }).at(-1), "📷 Fotoğraf yok — Selin'in fotoğraf listesine ekledim.");
  } finally { Date.now = gercek; }
});

test("9 Kasım İŞ DEFTERİ: bot kartı/kararı deftere yazılır; 'Kemal bugün ne yaptı?' defterden sayı+kod+kimde bekliyor; deneme sayılmaz; kayıt yoksa 'bilmiyorum'; herkes tek mesaj", async () => {
  const o = ortam();
  const { defterTg, defterKarar, defterIs, _defterOnbellekSifirla } = await import("./is-defteri.js");
  _defterOnbellekSifirla();
  const kenv = { STOK: o.env.STOK, KAYIT: o.env.KAYIT };
  const kb = (d) => ({ inline_keyboard: [[{ text: "✅", callback_data: d }]] });
  const gercek = Date.now; Date.now = () => ist(9, 9) * 1000;
  await defterTg(kenv, "kemal", "sendMessage", { chat_id: "504", text: "⬆️ 3411 · Elbise", reply_markup: kb("y1:9:3411") }, { ok: true, result: { message_id: 1 } });
  await defterTg(kenv, "kemal", "sendMessage", { chat_id: MERDAN, text: "⬆️ 3411 · Elbise", reply_markup: kb("y1:9:3411") }, { ok: true, result: { message_id: 2 } });
  await defterTg(kenv, "kemal", "sendMessage", { chat_id: "504", text: "⬆️ 3510 · Takım", reply_markup: kb("y1:9:3510") }, { ok: true, result: { message_id: 3 } });
  await defterTg(kenv, "kemal", "sendMessage", { chat_id: "504", text: "🧪 DENEME 9999", reply_markup: kb("y1:9:9999") }, { ok: true, result: { message_id: 4 } });
  await defterKarar(kenv, "kemal", { data: "y1:9:3411", from: { id: 504, first_name: "Hemra" } });
  await defterIs(kenv, "kemal", "kanala paylaşıldı", { kod: "3539" });
  Date.now = () => ist(9, 15) * 1000;
  try {
    const c = await aracla(o, "Kemal bugün ne yaptı?", "bot_raporu", { bot: "kemal", donem: "bugun" });
    assert.match(c, /^Kemal — bugün:\nİş defteri:/);
    assert.match(c, /3 kart \(Hemra 2, Merdan 1\), 2 tanesi cevaplandı/); // aynı düğmeli kart iki kişiye: ilk basan ikisini de kapatır
    assert.match(c, /kanala paylaşıldı: 3539/);
    assert.match(c, /Hemra'da 1 kart bekliyor: 3510/);
    assert.ok(!/9999/.test(c)); // deneme sayılmaz
    assert.match(await aracla(o, "Nora bugün ne yaptı?", "bot_raporu", { bot: "nora", donem: "bugun" }), /Nora — bugün:\nSenaryolar:|Nora bugün: hiçbir kaynakta kayıt yok — bilmiyorum\. Baktığım kaynaklar: iş defteri, Nora senaryoları\./);
    const h = (await aracla(o, "herkes bugün ne yaptı?", "is_defteri", { bot: "hepsi", gun: "bugun" })).split("\n");
    assert.equal(h[0], "Bugün herkes:");
    assert.deepEqual(h.slice(1).map((x) => x.split(":")[0]), ["Kemal", "Selin", "Pelin", "Nora", "Sami"]);
  } finally { Date.now = gercek; }
});

test("9 Kasım: 3 saattir bekleyen kart → Hemra'ya BİR kez hatırlatma (Sami üzerinden); tekrar kart (mutabakat) birleşir; cuma sağlık satırı", async () => {
  const o = ortam();
  const { defterTg, _defterOnbellekSifirla } = await import("./is-defteri.js");
  _defterOnbellekSifirla();
  const gercek = Date.now;
  Date.now = () => ist(10, 9, 10) * 1000; // salı 09:10 kart gitti
  try { await defterTg({ STOK: o.env.STOK, KAYIT: o.env.KAYIT }, "kemal", "sendMessage", { chat_id: "504", text: "⬆️ 3411", reply_markup: { inline_keyboard: [[{ text: "✅", callback_data: "y1:1:3411" }]] } }, { ok: true, result: { message_id: 1 } }); } finally { Date.now = gercek; }
  // 9 Kasım (ONAY MERDİVENİ): Venom yazılı hatırlatma GÖNDERMEZ; kartın KENDİSİ bottan bir kez yeniden gider (mesai 3 saat)
  await venomCron(o.env, ist(10, 13, 1));
  assert.equal((await kuyruguAl(o.env, "giden")).length, 0);
  const { kartTekrarAdimi, GUNCEL, mesaiSuresi, cevapsizSatiri } = await import("./kart-tekrar.js");
  const kg = [];
  const ktg = async (e, m, g) => { kg.push({ m, g, sessiz: e.__kartTekrar }); return { ok: true, result: { message_id: 900 } }; };
  const env2 = { ...o.env, HEMRA_ID: "504" };
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 12, 5), { zorla: true }), 0); // 3 saat dolmadı
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 12, 15)), 0); // 12 Kasım (C11): zamanlı iş eski kartı YENİDEN GÖNDERMEZ
  assert.equal(kg.length, 0);
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 12, 15), { zorla: true }), 1); // sadece açıkça istenirse
  const yeni = kg.find((x) => x.m === "sendMessage");
  assert.equal(yeni.g.chat_id, "504");
  assert.match(yeni.g.text, /^🔁 Hatırlatma — cevabınızı bekliyor:\n⬆️ 3411/);
  assert.equal(yeni.g.reply_markup.inline_keyboard[0][0].callback_data, "y1:1:3411"); // aynı düğme → aynı sonuç
  const eski = kg.find((x) => x.m === "editMessageReplyMarkup");
  assert.deepEqual(eski.g.reply_markup.inline_keyboard[0], [{ text: "⏩ Güncel kart aşağıda", callback_data: GUNCEL }]);
  assert.equal(eski.g.reply_markup.inline_keyboard[1][0].callback_data, "y1:1:3411"); // eski düğmeler de çalışır
  assert.ok(kg.every((x) => x.sessiz)); // tekrar yeni kart sayılmaz (defter)
  kg.length = 0;
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 17)), 0); // en fazla 2 gönderim
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(14, 12)), 0);
  // akşam: hâlâ cevapsız → tek satır
  const bek = await (await o.env.STOK.get().fetch("https://stok/isd-bekleyen", { method: "POST", body: JSON.stringify({ enEski: 0 }) })).json();
  assert.equal(cevapsizSatiri(bek, { 504: "Hemra" }, ist(10, 20)), "📌 Cevapsız: Hemra — Kemal 3411");
  assert.equal(mesaiSuresi(ist(13, 19), ist(16, 10)), 13 * 3600); // 13 Kasım (kural 4): mesai pazartesi–cumartesi 09–20 → cuma 19:00 → pazartesi 10:00 = 1 + 11 (cumartesi) + 0 (pazar) + 1 saat
  // tekrar kart: aynı mutabakat 12 saat içinde ikinci kez → birleşir
  const { postaKarar, gonderildiKaydet } = await import("./venom-posta.js");
  await gonderildiKaydet(o.env, { kaynak: "sami", tur: "kart", metin: "📋 Mutabakat – 07.11 · Fuat'a gidecek", id: 5 }, ist(10, 10));
  assert.equal((await postaKarar(o.env, { kaynak: "venom", metin: "📋 Fuat'a gidecek mutabakat (birebir)", kart: true }, ist(10, 11))).kategori, "tekrar kart (birleştirildi)");
  // cuma 20:00 özeti: tek satır sağlık
  const m = await (await import("./venom-bot.js")).aksamOzeti(o.env, ist(13, 20, 1));
  assert.ok(m.split("\n").length <= 8, m); // 11 Kasım: en fazla 8 satır; cuma sağlık satırı /detay'da
  assert.match(JSON.parse(o.depo.get("venom:posta:detay")).metin, /🩺 Bu hafta: \d+ hatayı kendim düzelttim · \d+ mesaj size kurala uymadan geldi · /);
});

// 9 Kasım (Patron): akşam özetinde günlük 10 onay hedefi satırı
test("akşam özeti: 'Bugün X onay / 10, Y geç, Z paylaşıldı.' tek satır (Kemal canlı özetinden)", async () => {
  const { hedefSatiri } = await import("./venom-defter.js");
  const k = { tur: { gun: "2026-11-09", onay: 7, gec: 9, hedef: 10, kararlar: { paylaş: 7, geç: 9 } }, bugunPaylasim: 5, bugunKanal: 6 };
  assert.equal(hedefSatiri(k, "2026-11-09"), "📣 Bugün 7 onay / 10, 9 geç, 6 paylaşıldı.");
  assert.equal(hedefSatiri({ ...k, tur: { ...k.tur, gun: "2026-11-08" } }, "2026-11-09"), "📣 Bugün 0 onay / 10, 0 geç, 6 paylaşıldı.");
  assert.equal(hedefSatiri(null, "2026-11-09"), null);
});

// 9 Kasım (Patron): SERT MÜDÜR A — Patron'a sadece izin listesi; etiketsiz gönderim kod düzeyinde durur
test("izin kapısı: etiketsiz mesaj Patron'a gitmez (çözüm kuyruğu); etiketli gider ve kaydedilir; kart metninden izin nedeni", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const { izinBul } = await import("./venom-posta.js");
  const r = await v.tg(o.env, "sendMessage", { chat_id: PATRON, text: "✅ 3627 paylaşıldı" });
  assert.equal(r.ok, false);
  assert.equal(patronaGiden(o).length, 0);
  assert.match(JSON.parse(o.depo.get("venom:cozum"))[0].ozet, /3627 paylaşıldı/);
  const r2 = await v.tg(o.env, "sendMessage", { chat_id: PATRON, text: "🌙 Günün özeti", izin: "rapor" });
  assert.equal(r2.ok, true);
  const giden = patronaGiden(o);
  assert.equal(giden.length, 1);
  assert.equal(giden[0].govde.izin, undefined); // etiket Telegram'a gitmez
  const gun = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  assert.equal(JSON.parse(o.depo.get(`venom:izin:log:${gun}`))[0].izin, "rapor");
  // Patron dışındakilere kapı yok; yazıyor… (sendChatAction) serbest
  assert.equal((await v.tg(o.env, "sendMessage", { chat_id: MERDAN, text: "x" })).ok, true);
  assert.equal((await v.tg(o.env, "sendChatAction", { chat_id: PATRON, action: "typing" })).ok, true);
  assert.equal(izinBul("🔁 REPETE RAPORU — 09.11"), "repete");
  assert.equal(izinBul("🗑 3357 silinsin mi?"), "onay");
  assert.equal(izinBul("✉️ Fuat'a gidecek mesaj"), "onay");
  assert.equal(izinBul("🎬 Pelin üretim: 3 model, ≈0,60 $"), "para");
  assert.equal(izinBul("Merdan ve Hemra çözemedi: 3047 fotoğrafı. Ne denendi: …"), "cozulemeyen");
  assert.equal(izinBul("📝 3001 taslak onayı"), null);
  assert.equal(izinBul("📦 3332 stok bitti. Ne yapalım?"), null); // Hemra/Merdan'ın işi
});

// 9 Kasım (Patron): SERT MÜDÜR C/D — Merdan + Hemra'ya görev (Sami'den), model model düğme, hatırlatma, yapılmayan görev, çözülemeyen → Patron'a TEK kart
test("görev: iki kişiye düğmeli kart; biri seçince iki kopya güncellenir; açıklama; süre dolunca 2 hatırlatma → akşam 'yapılmayan görevler'; bulamadım → Patron'a tek kart", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const G = await import("./venom-gorev.js");
  const { venomGidenAdimi } = await import("./venom-kopru.js");
  const t0 = ist(10, 10); // salı 10:00
  assert.equal(G.sonSaat(t0, 18), ist(10, 18));
  assert.equal(G.sonSaat(ist(10, 17), 18), ist(11, 18)); // 2 saatten az kaldıysa ertesi gün
  const kodlar = Array.from({ length: 12 }, (_, i) => String(3040 + i));
  const g = await G.gorevAc(o.env, { baslik: "Selin: 12 modelin fotoğrafı yok", metin: "Selin'de 12 modelin fotoğrafı yok (3040, 3041, 3042…). Bugün 18:00'e kadar çekilebilenleri gönderin, kalanların sebebini düğmeden seçin.", kalip: "foto", kalemler: kodlar.map((kod) => ({ kod })), son: ist(10, 18) }, t0);
  assert.equal((await G.gorevAc(o.env, { baslik: "Selin: 12 modelin fotoğrafı yok", kalemler: [] }, t0)).id, g.id); // aynı görev iki kez açılmaz
  const kart = G.gorevKartlari(g);
  assert.equal(kart.length, 2); // 10 + 2
  assert.match(kart[0].metin, /^Merdan, Hemra: Selin'de 12 modelin fotoğrafı yok/);
  assert.match(kart[0].metin, /⏰ Son saat: 10\.11 18:00 · kart 1\/2/);
  assert.deepEqual(kart[0].klavye.inline_keyboard[0].map((b) => b.text), ["3040 📷 Bugün çekerim", "3040 🏭 Fabrikada"]); // kural 19: satırda en fazla 2 düğme
  assert.deepEqual(kart[0].klavye.inline_keyboard[1].map((b) => b.text), ["3040 ❌ Satıldı/bitti", "3040 🔍 Bulamadım"]);
  assert.deepEqual(kart[0].klavye.inline_keyboard[2].map((b) => b.text), ["3040 ✏️ Açıklama yaz"]);
  assert.ok(kart[0].klavye.inline_keyboard.every((r) => r.length <= 2));
  // Sami gönderir: 2 kişi × 2 kart, düğmeli
  await venomGidenAdimi(o.env, t0, o.samiTg);
  const gonder = o.samiG.filter((x) => x.metod === "sendMessage");
  assert.equal(gonder.length, 4);
  assert.deepEqual([...new Set(gonder.map((x) => String(x.govde.chat_id)))].sort(), ["503", "504"]);
  assert.ok(gonder.every((x) => x.govde.reply_markup));
  // Hemra 3040'a "Bugün çekerim" — iki kopya da güncellenir
  const ilkKart = gonder[0];
  const cq = (kim, data, msg = ilkKart) => ({ id: "q", from: { id: kim }, data, message: { chat: { id: msg.govde.chat_id }, message_id: 501, text: msg.govde.text, reply_markup: msg.govde.reply_markup } });
  o.samiG.length = 0;
  await G.gorevDugmesi(o.env, cq(504, `vg:${g.id}:0:c`), o.samiTg);
  const duzen = o.samiG.filter((x) => x.metod === "editMessageReplyMarkup");
  assert.equal(duzen.length, 2);
  assert.deepEqual(duzen[0].govde.reply_markup.inline_keyboard[0], [{ text: "✔ 3040: Bugün çekerim (Hemra)", callback_data: "vg:-" }]);
  // yabancı basamaz
  o.samiG.length = 0;
  await G.gorevDugmesi(o.env, cq(777, `vg:${g.id}:1:c`), o.samiTg);
  assert.match(o.samiG[0].govde.text, /Hemra ve Merdan'ın/);
  // Merdan 3041 → ✏️ açıklama
  await G.gorevDugmesi(o.env, cq(503, `vg:${g.id}:1:a`), o.samiTg);
  assert.equal(await G.gorevAciklamaMesaji(o.env, { from: { id: 503 }, chat: { id: 503 }, text: "Bu model mağazada yok, depoda bakacağım" }, o.samiTg), true);
  // Merdan 3042 → bulamadım
  await G.gorevDugmesi(o.env, cq(503, `vg:${g.id}:2:y`), o.samiTg);
  const f = { biriktir: async () => {}, patronaKart: async (metin, klavye) => kartlar.push({ metin, klavye }), defter: async () => {}, botaDugme: async () => true };
  const kartlar = [];
  let l = await G.gorevAdimi(o.env, ist(10, 11), f);
  const gg = l.find((x) => x.id === g.id);
  assert.deepEqual(gg.kalemler.slice(0, 3).map((k) => [k.secim, k.kim]), [["c", "Hemra"], ["a", "Merdan"], ["y", "Merdan"]]);
  assert.equal(gg.kalemler[1].aciklama, "Bu model mağazada yok, depoda bakacağım");
  // 9 Kasım (onay merdiveni): yazılı hatırlatma YOK (kartın kendisi Sami'den 3 saat sonra tekrar gider); süre dolunca "yapılmadı"
  await G.gorevAdimi(o.env, ist(10, 18, 5), f);
  assert.equal((await (await import("./venom-kopru.js")).kuyruguAl(o.env, "giden")).length, 0);
  l = await G.gorevAdimi(o.env, ist(10, 18, 10), f);
  assert.equal(l.find((x) => x.id === g.id).durum, "yapilmadi");
  assert.match(G.yapilmayanSatiri(l), /📌 Yapılmayan görevler: Merdan\+Hemra — Selin: 12 modelin fotoğrafı yok \(9\/12 cevapsız\)/);
  // kalanlar cevaplanınca görev kapanır; "bulamadım" → Patron'a TEK kart (çözülemeyen)
  for (let i = 3; i < 12; i++) await G.gorevDugmesi(o.env, cq(504, `vg:${g.id}:${i}:f`), o.samiTg);
  l = await G.gorevAdimi(o.env, ist(11, 12), f);
  assert.equal(l.find((x) => x.id === g.id).durum, "bitti");
  assert.equal(kartlar.length, 1);
  assert.match(kartlar[0].metin, /🧭 Çözülemedi — Selin: 12 modelin fotoğrafı yok\nNe denendi: Merdan ve Hemra'ya 10\.11 10:00'de görev verildi\.\nNeden olmadı:\n• 3042: Merdan "Bulamadım"/);
  // Patron "📝 Karar yaz" → yazdığı Patron kararı olarak kaydedilir ve iki kişiye gider
  const kg = await G.patronKarari(o.env, g.id, "3042'yi listeden çıkarın", ist(11, 13));
  assert.equal(kg.patronKarari.metin, "3042'yi listeden çıkarın");
  const giden = await (await import("./venom-kopru.js")).kuyruguAl(o.env, "giden");
  assert.equal(giden.filter((x) => /📌 Patron kararı — Selin: 12 modelin fotoğrafı yok:\n3042'yi listeden çıkarın/.test(x.metin)).length, 2);
  assert.match(JSON.parse(o.depo.get("venom:bot:kararlar")).at(-1).metin, /^Patron kararı \(Selin/);
});

test("çözüm kuyruğu: izinsiz bot kartı Merdan + Hemra'ya düğmeleriyle devredilir; basınca bota döner; kimse basmazsa 2 hatırlatma → Patron'a tek kart", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const G = await import("./venom-gorev.js");
  const K = await import("./venom-kopru.js");
  const botaGelen = [];
  o.env.SELIN_W = { dugme: async (data, rid) => { botaGelen.push(data); return true; } };
  await v.aktarilanGonder(o.env, { bot: "selin", metod: "sendMessage", metin: "📝 3001 taslak onayı", butonlar: [[{ text: "✅ Onayla", callback_data: "so:3001" }, { text: "❌ Reddet", callback_data: "sx:3001" }]], medya: [] });
  assert.equal(patronaGiden(o).length, 0);
  const f = { biriktir: async (m) => bilgi.push(m), patronaKart: async (metin, klavye) => kartlar.push({ metin, klavye }), defter: async () => {}, botaDugme: async (rid) => { const k = JSON.parse(o.depo.get(`venom:bot:dugme:${rid}`)); return o.env.SELIN_W.dugme(k.data, rid); } };
  const bilgi = [], kartlar = [];
  await G.cozumAdimi(o.env, ist(10, 10), f);
  const giden = await K.kuyruguAl(o.env, "giden");
  assert.equal(giden.length, 2);
  assert.match(giden[0].metin, /^Merdan, Hemra: Selin'den karar bekleyen iş \(Patron'a gelmez, siz karar verin\):\n\n📝 3001 taslak onayı/);
  const tus = giden[0].klavye.inline_keyboard[0][0];
  assert.match(tus.callback_data, /^vd:/);
  assert.match(bilgi[0], /Merdan ve Hemra'ya verdim, 13:00'de kontrol edeceğim/);
  // Merdan "Onayla" bastı (Sami) → Venom bota "Patron bastı" gibi iletir, iş kapanır
  await G.gorevDugmesi(o.env, { id: "q", from: { id: 503 }, data: tus.callback_data, message: { chat: { id: 503 }, message_id: 7, text: giden[0].metin, reply_markup: giden[0].klavye } }, o.samiTg);
  assert.match(o.samiG.find((x) => x.metod === "editMessageText").govde.text, /✔ Merdan seçti: ✅ Onayla/);
  await G.cozumAdimi(o.env, ist(10, 15), f);
  assert.deepEqual(botaGelen, ["so:3001"]);
  assert.equal(JSON.parse(o.depo.get("venom:cozum"))[0].durum, "kapandi");
  // ikinci kart: kimse basmıyor → yazılı hatırlatma ve Patron'a kart YOK (kart Sami'den bir kez tekrar gider; akşam "Cevapsız" satırı); 3 gün sonra kapanır
  await v.aktarilanGonder(o.env, { bot: "sami", metod: "sendMessage", metin: "📦 3332 ne yapalım?", butonlar: [[{ text: "⏳ Bekle", callback_data: "sq:3332:b" }]], medya: [] });
  await G.cozumAdimi(o.env, ist(10, 10), f);
  await K.kuyruguAl(o.env, "giden");
  for (const h of [13, 15, 17]) await G.cozumAdimi(o.env, ist(10, h, 1), f);
  assert.equal((await K.kuyruguAl(o.env, "giden")).length, 0);
  assert.equal(kartlar.length, 0);
  await G.cozumAdimi(o.env, ist(13, 11), f);
  assert.equal(JSON.parse(o.depo.get("venom:cozum")).find((x) => /3332/.test(x.ozet)).durum, "kapandi");
  // düğmesiz izinsiz mesaj → özete
  await v.tg(o.env, "sendMessage", { chat_id: PATRON, text: "ℹ️ bilgi notu" });
  await G.cozumAdimi(o.env, ist(10, 18), f);
  assert.ok(bilgi.some((x) => /ℹ️ bilgi notu/.test(x)));
});

test("bota emir: 10 dk sonra iş defterinden kontrol; iz yoksa bir kez tekrar, olmazsa Claude Code notu; paylaş emri tekrarlanmaz; ilk görevler açılır", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const { defterYaz } = await import("./is-defteri.js");
  const giden = [];
  o.env.KEMAL_W = { mesaj: async (m) => { giden.push(m); return true; } };
  const t = ist(10, 10);
  await v.aracCalistir({ ...o.env, __izin: "cevap" }, "bota_yaz", { bot: "kemal", metin: "3279 alt yazısını düzelt: renk siyah" }, t);
  await v.aracCalistir({ ...o.env, __izin: "cevap" }, "bota_yaz", { bot: "kemal", metin: "3280 tekrar paylaş" }, t);
  await v.aracCalistir({ ...o.env, __izin: "cevap" }, "bota_yaz", { bot: "kemal", metin: "3281 yazısını düzelt" }, t);
  await defterYaz(o.env, { zaman: t + 120, bot: "kemal", tur: "is", ozet: "3281 kanal yazısı düzeltildi", kod: "3281" });
  assert.equal(await v.emirAdimi(o.env, t + 5 * 60), 0); // 10 dk dolmadı
  await v.emirAdimi(o.env, t + 11 * 60);
  let e = JSON.parse(o.depo.get("venom:emirler"));
  assert.deepEqual(e.map((x) => [x.kod, x.durum, x.deneme]), [["3279", "bekliyor", 2], ["3280", "olmadi", 1], ["3281", "yapildi", 1]]);
  assert.equal(giden.filter((m) => /3279/.test(m)).length, 2); // bir kez tekrar
  assert.equal(giden.filter((m) => /3280/.test(m)).length, 1); // paylaşım tekrarlanmaz
  await v.emirAdimi(o.env, t + 22 * 60);
  e = JSON.parse(o.depo.get("venom:emirler"));
  assert.equal(e[0].durum, "olmadi");
  const not = JSON.parse(o.depo.get("venom:yetenekIstekleri"));
  assert.ok(not.some((x) => /Venom emri yapılmadı \(2 deneme.*kemal ← "3279 alt yazısını düzelt/.test(x.istek)));
  // E) ilk görevler: Selin gönderilemeyen + fotoğrafsız stok + Merdan videoları
  o.env.SELIN_W = { ozet: async () => ({ takilan: [{ kod: "3047", sebep: "gönderilemedi" }, { kod: "3050", sebep: "bulunamıyor" }], fotoBekleyen: ["3189", "3047"] }) };
  const sonuc = await v.ilkGorevler(o.env, ist(10, 10));
  assert.deepEqual(sonuc, ["Selin gönderilemeyen: 2", "fotoğrafsız stok: 1", "video: 4"]);
  const gl = JSON.parse(o.depo.get("venom:gorevler"));
  assert.deepEqual(gl.map((g) => g.baslik), ["Selin: 2 modelin fotoğrafı gönderilemedi", "Fotoğrafı olmayan 1 stok modeli", "Merdan'dan 4 model videosu bekleniyor"]);
  assert.match(gl[0].metin, /^Selin'de 2 modelin fotoğrafı yok \(3047, 3050\)\. Bugün 18:00'e kadar çekilebilenleri gönderin, kalanların sebebini düğmeden seçin\.$/);
  assert.deepEqual(gl[2].kalemler.map((k) => k.kod), ["907", "3396", "3582", "3618"]);
  assert.equal(gl[2].kalip, "video");
  // 10 Kasım: bot yapamadıysa Patron'a AÇIKÇA "yapamadı" (biriktirilmez); başka hiçbir şey gitmedi
  assert.ok(patronaGiden(o).length && patronaGiden(o).every((m) => /yapamadı/.test(m.govde.text)));
});

test("onay merdiveni (10 Kasım ACİL): birden çok bekleyen kart → kısa başlık + HER KART TEK MESAJ (fotoğraf + yazı + düğmeler); düşen kart yazıyla tekrar, olmazsa Venom'a hata", async () => {
  const o = ortam();
  const { defterTg, _defterOnbellekSifirla } = await import("./is-defteri.js");
  const { kartTekrarAdimi } = await import("./kart-tekrar.js");
  _defterOnbellekSifirla();
  const gercek = Date.now;
  Date.now = () => ist(10, 9, 0) * 1000;
  try {
    await defterTg({ STOK: o.env.STOK, KAYIT: o.env.KAYIT }, "selin", "sendPhoto", { chat_id: MERDAN, photo: "https://x/3493.jpg", caption: "📝 3493 taslak", reply_markup: { inline_keyboard: [[{ text: "✅ Onayla, siteye yükle", callback_data: "so:3493" }, { text: "❌ Ekleme", callback_data: "sx:3493" }]] } }, { ok: true, result: { message_id: 11 } });
    await defterTg({ STOK: o.env.STOK, KAYIT: o.env.KAYIT }, "selin", "sendPhoto", { chat_id: MERDAN, photo: "https://x/3529.jpg", caption: "📝 3529 taslak", reply_markup: { inline_keyboard: [[{ text: "✅ Onayla, siteye yükle", callback_data: "so:3529" }]] } }, { ok: true, result: { message_id: 12 } });
  } finally { Date.now = gercek; }
  const kg = [];
  const ktg = async (e, m, g) => { kg.push({ m, g }); return { ok: true, result: { message_id: 900 } }; };
  assert.equal(await kartTekrarAdimi(o.env, "selin", ktg, ist(10, 12, 5)), 0); // 12 Kasım (C11): zamanlı çalışmaz
  assert.equal(await kartTekrarAdimi(o.env, "selin", ktg, ist(10, 12, 5), { zorla: true }), 2);
  assert.equal(kg.filter((x) => x.m === "sendMediaGroup").length, 0); // albüm yok (düğme mesajı düşünce yarım kalıyordu)
  assert.match(kg[0].g.text, /^🔁 Hatırlatma — toplam 2 kart cevabınızı bekliyor/);
  const kartlar = kg.filter((x) => x.m === "sendPhoto");
  assert.deepEqual(kartlar.map((x) => [x.g.photo, x.g.caption.split("\n")[1], x.g.reply_markup.inline_keyboard.flat().map((d) => d.callback_data)]), [["https://x/3493.jpg", "📝 3493 taslak", ["so:3493", "sx:3493"]], ["https://x/3529.jpg", "📝 3529 taslak", ["so:3529"]]]);
  assert.equal(kg.filter((x) => x.m === "editMessageReplyMarkup").length, 2);
  // fotoğraflı kart Telegram'dan dönmezse yazıyla bir kez daha; o da olmazsa Venom'a "Merdan'a kart gitmedi"
  const { tamKartGonder } = await import("./kart-tekrar.js");
  const kg2 = [];
  const kotu = async (e, m, g) => { kg2.push({ m, g }); return { ok: false, description: "Bad Request: wrong file identifier" }; };
  assert.equal(await tamKartGonder(o.env, kotu, o.env, MERDAN, { kod: "3517" }, { foto: "x", metin: "3517", klavye: [[{ text: "✅", callback_data: "a" }]] }, "", "sami"), false);
  assert.deepEqual(kg2.map((x) => x.m), ["sendPhoto", "sendMessage"]);
  assert.match(JSON.parse(o.depo.get("sami:hata")).hata, /^Merdan'a kart gitmedi \(sami · 3517\): Bad Request: wrong file identifier/);
});

test("kim, neye, ne cevap verdi: düğme yazısı + kod deftere; kişi cevabı (aldığı → cevapladığı → cevapsız); sayı = liste", async () => {
  const o = ortam();
  const D = await import("./is-defteri.js");
  const V = await import("./venom-defter.js");
  const v = await import("./venom-bot.js");
  D._defterOnbellekSifirla();
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 556, ad: "Sinem" }, { id: 501, ad: "Fuat" }]));
  const e = { STOK: o.env.STOK, KAYIT: o.env.KAYIT };
  const kart = (chat, metin, cb, mid) => D.defterTg(e, "sami", "copyMessage", { chat_id: chat, caption: metin, reply_markup: { inline_keyboard: [[{ text: "✅ Gelecek", callback_data: `fc:g:${cb}` }, { text: "❌ Bitti, gelmeyecek", callback_data: `fc:b:${cb}` }]] } }, { ok: true, result: { message_id: mid } });
  await kart(556, "3628 · siyah 10", "3628-a", 1); await kart(501, "3628 · siyah 10", "3628-a", 2);
  await kart(556, "3571 · bej 4", "3571-b", 3); await kart(556, "3189 · siyah 2", "3189-c", 4); await kart(556, "3189 · beyaz 2", "3189-d", 5);
  await D.defterKarar(e, "sami", { data: "fc:g:3628-a", from: { id: 556, first_name: "S" }, message: { caption: "3628 · siyah 10", reply_markup: { inline_keyboard: [[{ text: "✅ Gelecek", callback_data: "fc:g:3628-a" }]] } } });
  await D.defterKarar(e, "sami", { data: "fc:t:3628-a:3", from: { id: 556 }, message: { caption: "3628 · siyah 10", reply_markup: { inline_keyboard: [[{ text: "3 gün", callback_data: "fc:t:3628-a:3" }]] } } });
  await D.defterKarar(e, "sami", { data: "fc:b:3571-b", from: { id: 556 }, message: { caption: "3571 · bej 4", reply_markup: { inline_keyboard: [[{ text: "❌ Bitti, gelmeyecek", callback_data: "fc:b:3571-b" }]] } } });
  const c = await v.kisiCevabiMetni(o.env, "Sinem bugün hangi kartlara ne cevap verdi?", Math.floor(Date.now() / 1000));
  assert.equal(c, "Sinem bugün:\n• Aldığı kartlar (4): 3628, 3571, 3189 (2 kart)\n• Cevapladıkları (2): 3628: Gelecek, 3 gün · 3571: Bitti, gelmeyecek\n• Cevapsız (2): 3189 (2 kart)");
  assert.match(await v.kisiCevabiMetni(o.env, "Fuat bugün ne cevap verdi?", Math.floor(Date.now() / 1000)), /Fuat bugün:\n• Aldığı kartlar \(1\): 3628\n• Cevapladıkları \(0\): yok\n• Cevapsız \(0\): yok/); // Sinem cevapladı → Fuat'ın kopyası da kapandı
  assert.equal(await v.kisiCevabiMetni(o.env, "Kemal bugün ne yaptı?", Math.floor(Date.now() / 1000)), null); // bot sorusu ayrı
  assert.equal(V.kartListe(["3189", "3189", "3000"]), "3189 (2 kart), 3000");
});

test("tam cevap: dönem (bu hafta) + bütün kaynaklar; Pelin harcama/bekleyen/bakiye; Nora senaryo; hiçbir kaynak yoksa baktıklarını söyler", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const R = await import("./venom-rapor.js");
  const s = ist(11, 18); // çarşamba 11 Kasım
  assert.deepEqual(R.donemAraligi(s, "bu hafta"), [ist(9, 0), s]);
  assert.deepEqual(R.donemAraligi(s, "bu ay"), [Date.UTC(2026, 10, 1, -3) / 1000, s]);
  assert.equal(R.donemBul("Pelin bu hafta ne yaptı?"), "bu hafta");
  o.depo.set("kodlar", JSON.stringify({ 3627: [{ ids: [1], tarih: ist(10, 11), album: "a" }], 3539: [{ ids: [2], tarih: ist(2, 11) }] }));
  const k = await v.botRaporuMetni(o.env, "kemal", "bu hafta", s);
  assert.match(k, /^Kemal — bu hafta:\nKanal:\n• 1 paylaşım: 3627/);
  assert.match(k, /\(Kaynaklar: iş defteri, kanal kaydı\)/);
  o.env.PELIN_W = { rapor: async () => ({ isler: [{ kod: "3627", renk: "beyaz", durum: "teslim edildi", maliyet: 1.2, zaman: ist(10, 12) }], harcama: { toplam: 34.79, fal: 20, hf: 10, openai: 3, claude: 1.79 }, bekleyen: ["3629 ön fotoğraf onayı bekliyor"], bakiye: { hf: 12.5, falNot: "sorgulanamıyor (fal bakiye vermiyor)" }, nora: { bekleyen: ["3627 senaryo"], yazilan: [] } }) };
  const soru = "Pelin bu hafta ne yaptı? Hangi modeller, ne harcadı, bekleyen ya da yarım kalan iş var mı? Higgsfield ve fal bakiyesi ne kadar? Nora'nın bekleyen senaryosu var mı?";
  const c = await aracla(o, soru, "bot_raporu", { bot: "pelin", donem: "bu_hafta" });
  assert.match(c, /Pelin — bu hafta:\nÜretim:\n• 1 iş: 3627\n• 3627 beyaz: teslim edildi · 1,20 \$ \(10\.11\)/);
  assert.match(c, /Harcama:\n• bu ay 34,79 \$ \(fal 20,00 \$ · Higgsfield 10,00 \$ · OpenAI 3,00 \$ · Claude 1,79 \$\)/);
  assert.match(c, /Bekleyen \/ yarım:\n• 3629 ön fotoğraf onayı bekliyor/);
  assert.match(c, /Bakiye:\n• Higgsfield: ~12,50 \$ \(tahmini: yüklenen − harcanan\)\n• fal: sorgulanamıyor/);
  assert.match(await aracla(o, "Nora'nın bekleyen senaryosu var mı?", "bot_raporu", { bot: "nora", donem: "bu_hafta" }), /Nora — bu hafta:\nSenaryolar:\n• bekleyen 1: 3627 senaryo/);
  delete o.env.PELIN_W;
  assert.match(await v.botRaporuMetni(o.env, "nora", "bu hafta", s), /^Nora bu hafta: hiçbir kaynakta kayıt yok — bilmiyorum\. Baktığım kaynaklar: iş defteri, Nora senaryoları\./);
});

test("bakiye: 'Higgsfield'a 20 $ yükledim' kaydedilir; yüklenen − sonradan harcanan; 5 $ altı önceden uyarı (para izni)", async () => {
  const v = await import("./venom-bot.js");
  assert.deepEqual(v.yuklemeCoz("Higgsfield'a 20 $ yükledim"), { tur: "hf", tutar: 20 });
  assert.deepEqual(v.yuklemeCoz("fal hesabına 12,5 dolar yükledim"), { tur: "fal", tutar: 12.5 });
  assert.equal(v.yuklemeCoz("Higgsfield ne kadar?"), null);
  const { pelinRapor } = await import("./pelin.js");
  const depo = new Map([["pelin-hf:2026-11", "19.363"], ["venom:pelinBakiye", JSON.stringify({ hf: { tutar: 20, aylar: ["2026-11"], oncekiHarcama: 0 } })]]);
  const env = { KAYIT: { async get(k, t) { const x = depo.get(k); return x == null ? null : t === "json" ? JSON.parse(x) : x; }, async put(k, x) { depo.set(k, x); } } };
  const r = await pelinRapor(env, {}, Date.UTC(2026, 10, 9, 14) / 1000);
  assert.equal(r.bakiye.hf, 0.637);
  assert.equal(r.harcama.toplam, 19.363);
  assert.match(r.bakiye.falNot, /sorgulanamıyor/);
});

test("manken kuralı: büyük bedeni olan bütün modeller (38-50 dahil) dolgun büyük beden; sadece 38-44 küçük seri; model kartında tek satır", async () => {
  const { seriBul, mankenSatiri } = await import("./manken.js");
  assert.equal(seriBul("38-40-42-44-46-48-50"), "buyuk");
  assert.equal(seriBul("44-46-48-50"), "buyuk");
  assert.equal(seriBul("38-40-42-44"), "kucuk");
  assert.equal(seriBul(""), "kucuk");
  assert.equal(mankenSatiri("buyuk", "38-50"), "👤 Manken: büyük beden (dolgun) yüzü — bedenler 38-50");
  const { kartSatirlari } = await import("./venom-model.js");
  const l = kartSatirlari({ kod: "3627", marka: "BLACKROSE", stok: { BLACKROSE: 11 }, s7: 4, s14: 8, gun14: 14, fs: [], sitede: true, manken: "buyuk", bedenler: "38-40-42-44-46-48-50" });
  assert.equal(l.at(-1), "👤 Manken: büyük beden (dolgun) yüzü — bedenler 38-40-42-44-46-48-50");
  const { buyukYuzKaydet } = await import("./pelin.js");
  const depo = new Map([["pelin:is:3627-x", JSON.stringify({ kod: "3627", renk: "beyaz", foto: "https://fal/on.jpg" })], ["pelin:secim", JSON.stringify({ yuzler: { kucuk: { ad: "2 numaralı siyahi kız", anahtar: "a" }, buyuk: { ad: "3 numaralı dolgun kız", anahtar: "c" } } })]]);
  const env = { SELF_URL: "https://pelin.test", KAYIT: { async get(k, t) { const x = depo.get(k); return x == null ? null : t === "json" ? JSON.parse(x) : x; }, async put(k, x) { depo.set(k, x); } } };
  const gercek = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  try { assert.equal((await buyukYuzKaydet(env, { isId: "3627-x" }, 100)).ok, true); } finally { globalThis.fetch = gercek; }
  const s = JSON.parse(depo.get("pelin:secim"));
  assert.match(s.yuzler.buyuk.url, /^https:\/\/pelin\.test\/medya\/[a-f0-9]{32}$/);
  assert.equal(s.yuzler.buyuk.manken, "dolgun");
  assert.equal(s.yuzler.buyuk.kaynak, "3627 beyaz ön fotoğrafı (Patron onaylı)");
  assert.equal(s.yuzler.buyuk.onceki.ad, "3 numaralı dolgun kız"); // eski yüz geri alınabilir
  assert.equal(s.yuzler.kucuk.ad, "2 numaralı siyahi kız");
});

test("ekip düzeni (11 Kasım, TEK DEFTER): Hemra'ya en fazla 5 iş, her iş AYRI kart + kendi düğmeleri (satırda 2); tekrar yok; defterde kapanan iş düşer; seçim → kart seçilen kişiye", async (tc) => {
  const o = ortam();
  const E = await import("./venom-ekip.js");
  const K = await import("./venom-kopru.js");
  const D = await import("./tek-defter.js");
  const { kartIletAdimi } = await import("./kart-tekrar.js");
  o.env.AZIZ_ID = "505";
  const t = ist(10, 11);
  const gercekSaat = Date.now; Date.now = () => (t + 60) * 1000; tc.after(() => { Date.now = gercekSaat; }); // 13 Kasım (ders 36): sabit tarihli veri → sabit "şimdi"
  const isd = (kayitlar) => o.env.STOK.get().fetch("https://stok/isd-yaz", { method: "POST", body: JSON.stringify({ kayitlar }) });
  const kart = (kime, kod, mesaj, zaman, cb = `sz:${kod}:x`) => ({ zaman, bot: "kemal", tur: "kart", kime, kod, ozet: `⬆️ ${kod} öneri kartı`, chat: kime, mesaj, cbler: [cb] });
  // Aziz'e 7 ayrı modelin kartı + 3493 için aynı kart İKİ kez (yeniden gönderilmiş) → 7 iş, tekrar yok
  await isd([kart("505", "3493", 7, t - 9 * 3600), kart("505", "3493", 8, t - 8 * 3600), ...["3501", "3502", "3503", "3504", "3505", "3506"].map((k, i) => kart("505", k, 20 + i, t - 8 * 3600))]);
  const bek = await (await o.env.STOK.get().fetch("https://stok/isd-bekleyen", { method: "POST", body: "{}" })).json();
  await o.env.STOK.get().fetch("https://stok/isd-isaretle", { method: "POST", body: JSON.stringify({ idler: bek.map((x) => x.id), alan: "hatirlatildi", deger: ist(9, 12) }) }); // dün hatırlatıldı
  assert.equal(bek.length, 7); // 12 Kasım: 3493'ün eski kopyası YAZILIRKEN (kaynağında) kapandı — bekleyenlerde tek kart
  const df = await D.defterOku(o.env, t);
  assert.equal(df.kapanan.length, 0);
  assert.equal(df.satirlar.filter((x) => x.tur === "kart").length, 7); // her iş TEK satır
  assert.match(D.defterSatirYazi(df.satirlar.find((x) => x.kod === "3493")), /^3493 · ⬆️ 3493 öneri kartı · Aziz · açık · kart gitti 10\.11 03:00, mesaj 8; basılmadı$/);
  assert.equal(await E.hemraListesiGonder(o.env, t, { defter: df, biriktir: async () => {} }), 5); // en fazla 5 iş
  const giden = await K.kuyruguAl(o.env, "giden");
  assert.equal(giden.length, 5); // her iş AYRI kart
  assert.ok(giden.every((g) => g.kime === "hemra" && g.klavye.inline_keyboard.length === 2 && g.klavye.inline_keyboard.every((r) => r.length === 2))); // kendi düğmeleri, satırda 2
  assert.equal(new Set(giden.map((g) => g.metin)).size, 5); // tekrar yok
  assert.match(giden[0].metin, /^📋 3493: ⬆️ 3493 öneri kartı — Aziz cevap vermedi$/); // bilgi satırı / iç ad yok
  assert.deepEqual(giden[0].klavye.inline_keyboard.flat().map((b) => b.text), ["👤 Aziz'e ver", "👤 Merdan'a ver", "✋ Ben hallederim", "❓ Patron'a sor"]);
  // aynı liste ikinci kez gitmez: kalan 2 iş gider, ilk 5 TEKRAR gitmez
  assert.equal(await E.hemraListesiGonder(o.env, t + 5 * 3600, { defter: await D.defterOku(o.env, t + 5 * 3600), biriktir: async () => {} }), 2);
  await K.kuyruguAl(o.env, "giden");
  assert.equal(await E.hemraListesiGonder(o.env, t + 6 * 3600, { defter: await D.defterOku(o.env, t + 6 * 3600), biriktir: async () => {} }), 0);
  // Aziz 3501'i cevaplar → tek defterde kapanır → Hemra'nın listesinden düşer
  await isd([{ zaman: t + 60, bot: "kemal", tur: "karar", kime: "505", kod: "3501", ozet: "3501: Paylaş", cb: "sz:3501:x", sonuc: "Aziz: Paylaş" }]);
  const tm = await E.listeyiTemizle(o.env, t + 120, await D.defterOku(o.env, t + 120));
  assert.equal(tm.kapanan, 1);
  assert.ok(!tm.kalan.some((x) => x.kod === "3501"));
  // seçim: Hemra "Merdan'a ver" → kart Merdan'a; düğmeler tek "✔" satırına iner
  const g = giden[0];
  await E.hemraDugmesi(o.env, { id: "q", from: { id: 504 }, data: g.klavye.inline_keyboard[0][1].callback_data, message: { chat: { id: 504 }, message_id: 9, reply_markup: g.klavye } }, o.samiTg);
  assert.deepEqual(o.samiG.at(-1).govde.reply_markup.inline_keyboard, [[{ text: "✔ 👤 Merdan'a ver", callback_data: "vg:-" }]]);
  const verilen = [];
  await E.hemraKararAdimi(o.env, t + 60, { kartIlet: async (x, kim) => { verilen.push([x.kod, kim]); await K.kuyrugaEkle(o.env, `kartIlet:${x.bot}`, { id: "k1", chat: x.chat, mesaj: x.mesaj, hedef: E.kisiId(o.env, kim), kim: "Hemra", ozet: x.ozet }); }, devret: async () => {}, gorevVer: async () => {}, patronaSor: async () => {}, biriktir: async () => {} });
  assert.deepEqual(verilen, [["3493", "merdan"]]);
  const kg = [];
  await kartIletAdimi(o.env, "kemal", async (e, m, gv) => { kg.push({ m, gv }); return { ok: true, result: { message_id: 1 } }; });
  assert.equal(String(kg[0].gv.chat_id), MERDAN);
  o.depo.set("venom:hemraIzinli", "2026-11-10");
  assert.equal(await E.koordinator(o.env, t), "merdan");
  assert.equal(E.markaSorumlusu("VOLONTE"), "aziz");
  assert.equal(E.markaSorumlusu("BLACKROSE"), "merdan");
});

test("/rol Janet fiyat: Sami listelerinde rol değişir (fabrikadan çıkar, sadece fiyat)", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: 1, ad: "Fuat" }, { id: 2, ad: "🤍", kullanici: "bloom_m0", grup: "fabrika" }]));
  assert.match(await v.rolDegistir(o.env, "@bloom_m0", "fiyat", 100), /sadece fiyat/);
  assert.deepEqual(JSON.parse(o.depo.get("sami:fabrikaKisiler")).map((k) => k.ad), ["Fuat"]);
  assert.equal(JSON.parse(o.depo.get("sami:fiyatKisiler"))[0].id, 2);
  await yazi(o, PATRON, "/rol Fuat fabrika");
  assert.match(patronaGiden(o).at(-1).govde.text, /Fuat → fabrika/);
  assert.match(await v.rolDegistir(o.env, "Yok", "fiyat", 100), /listelerinde yok/);
});

test("para (13 Kasım, kural 74): sınırlar kitaptaki TEK tablodan — bot başına günlük + aylık sayaç, model sayımı; Kemal 20 $/ay, Selin 10 $/ay dolunca o botun yapay zekâsı durur; deneme bütçeye yazılmaz; %80'de Venom Patron'a TEK satır (ayda bir, gece yazmaz); 3 kat alarmı", async () => {
  const o = ortam();
  const H = await import("./harcama.js");
  const v = await import("./venom-bot.js");
  const e = { ...o.env, BOT_ADI: "kemal" };
  const t = Math.floor(Date.UTC(2026, 10, 10, 9) / 1000); // 10 Kasım 12:00 İstanbul
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t); // 0,40 + 0,40 = 0,80 $
  assert.equal(await H.gunlukHarcanan(e, "kemal", t), 0.8);
  assert.equal(await H.botAyHarcanan(e, "kemal", t), 0.8);
  const d = JSON.parse(o.depo.get("harcama-detay:kemal:2026-11-10"));
  assert.deepEqual(d["claude-opus-5-5"], { n: 1, usd: 0.8 });
  o.depo.set("harcama:denemeBitis", String(t + 3600));
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t + 60);
  assert.equal(await H.gunlukHarcanan(e, "kemal", t), 0.8); // deneme ayrı
  assert.equal(await H.botAyHarcanan(e, "kemal", t), 0.8);
  o.depo.delete("harcama:denemeBitis");
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t + 120);
  assert.equal(await H.sinirAsildiMi(e, t + 130), false); // 1,60 $ — günlük 2 $ tavanı artık yok
  // 3 kat alarmı (günlük)
  o.depo.set("venom:paraGun:2026-11-09", JSON.stringify({ kemal: 0.3, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  o.depo.set("venom:paraGun:2026-11-08", JSON.stringify({ kemal: 0.3, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  o.depo.set("venom:paraGun:2026-11-07", JSON.stringify({ kemal: 0.4, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  await v.paraAlarmi(o.env, t + 200);
  let m = patronaGiden(o).map((x) => x.govde.text);
  assert.ok(m.some((x) => /Kemal bugün olağanın 3 katından fazla harcadı: 1,60 \$/.test(x)));
  assert.ok(!m.some((x) => /%80|tavan/.test(x))); // 1,60 / 20 $ — uyarı yok
  // aylık %80: Kemal 16 $ → Patron'a tek satır, ayda bir kez
  o.depo.set("harcama-ay:kemal:2026-11", String(16_100_000));
  await v.paraAlarmi(o.env, t + 300);
  m = patronaGiden(o).map((x) => x.govde.text);
  assert.equal(m.filter((x) => x === "⚠️ Kemal bu ay sınırının %80'ine geldi: 16,10 $ / 20 $.").length, 1);
  await v.paraAlarmi(o.env, t + 400);
  assert.equal(patronaGiden(o).filter((x) => /sınırının %80/.test(x.govde.text)).length, 1); // bir kez
  assert.equal(await H.sinirAsildiMi(e, t + 410), false);
  // sınır doldu → o botun yapay zekâsı durur; Selin'in kendi sınırı (10 $) ayrı
  o.depo.set("harcama-ay:kemal:2026-11", String(20_000_000));
  assert.equal(await H.sinirAsildiMi(e, t + 500), true);
  const es = { ...o.env, BOT_ADI: "selin" };
  o.depo.set("harcama-ay:selin:2026-11", String(8_500_000));
  assert.equal(await H.sinirAsildiMi(es, t + 500), false);
  // gece (23:00) uyarı yazılmaz; sabah yazılır
  const gece = Math.floor(Date.UTC(2026, 10, 10, 20) / 1000), n0 = patronaGiden(o).length;
  await v.paraAlarmi(o.env, gece);
  assert.equal(patronaGiden(o).filter((x) => /Selin bu ay/.test(x.govde.text)).length, 0);
  await v.paraAlarmi(o.env, Math.floor(Date.UTC(2026, 10, 11, 7) / 1000));
  assert.ok(patronaGiden(o).length > n0 && patronaGiden(o).some((x) => x.govde.text === "⚠️ Selin bu ay sınırının %80'ine geldi: 8,50 $ / 10 $."));
  o.depo.set("harcama-ay:selin:2026-11", String(10_000_000));
  assert.equal(await H.sinirAsildiMi(es, t + 86400), true);
});

// 10 Kasım (Patron): fabrika zinciri — Hemra önerisi → Patron kartı → karar Sami'ye; "3394 fabrika kaydı"; cuma hata sayacı
import { bittiKartMetni, kartHataMetni } from "./venom-bot.js";
test("Venom fabrika zinciri: Patron kartı (izinli), karar Sami'ye; 'fabrika kaydı' kanıt defterinden; cuma kart hata satırı", async () => {
  const o = ortam();
  const oneri = { id: "x1", sip: "3100-abc", kod: "3100", magaza: "VOLONTE", oneri: "repete", hemra: "Hemra", tur: "bitti", fabrika: { kim: "Sinem", zaman: 1793000000, ne: "bitti" }, fuat: { kim: "Fuat", zaman: 1793002000 }, stok: "VOLONTE 12 adet", deneme: true, foto: null };
  assert.match(bittiKartMetni(oneri), /^🧪 DENEME[\s\S]*🏭 Fabrikada bitti — 🟦 VOLONTE · 3100\nFabrika: Sinem "bitti" dedi \(\d+ \S+ \d\d:\d\d\)\nFuat onayladı[\s\S]*Mağaza stoğu: VOLONTE 12 adet\nHemra önerisi: 🔁 Repete[\s\S]*Onaylıyor musun\?$/);
  await kuyrugaEkle(o.env, "bittiOneri", oneri); // 10 Kasım kural 5: DENEME Patron'a karar olarak GİTMEZ
  await venomCron(o.env, Math.floor(Date.now() / 1000));
  assert.ok(!o.g.some((x) => /Hemra önerisi/.test(x.govde.text || x.govde.caption || "")), "deneme Patron'a gitti");
  await kuyrugaEkle(o.env, "bittiOneri", { ...oneri, id: "x2", deneme: false });
  await venomCron(o.env, Math.floor(Date.now() / 1000) + 300);
  const kart = o.g.find((x) => /Hemra önerisi/.test(x.govde.text || x.govde.caption || ""));
  assert.ok(kart, "Patron kartı gitmedi (izin kapısı)");
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ Onayla", "🔁 Repete", "🗑 Sil", "⏳ Bekle"]);
  await guncelleme({ update_id: uid++, callback_query: { id: "c", from: { id: PATRON }, data: kart.govde.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: PATRON }, message_id: 5 } } }, o.env);
  const karar = await kuyruguAl(o.env, "bittiKarar");
  assert.deepEqual(karar.map((x) => [x.sip, x.karar]), [["3100-abc", "repete"]]);
  // fabrika kaydı
  await o.env.STOK.get().fetch("https://stok/arsiv-ekle", { method: "POST", body: JSON.stringify({ tur: "fabrika-kanit", mt: "3394", icerik: { kod: "3394", kim: "Sinem", ne: "Bitti, gelmeyecek", metin: "3394 bitti" }, zaman: 1793000000 }) });
  await o.env.STOK.get().fetch("https://stok/arsiv-ekle", { method: "POST", body: JSON.stringify({ tur: "fabrika-kanit", mt: "3394", icerik: { kod: "3394", kim: "Fuat", ne: "Onayladı: bitti" }, zaman: 1793002700 }) });
  o.g.length = 0;
  assert.match(await aracla(o, "3394 fabrika kaydı", "fabrika_kaydi", { kod: "3394" }), /^📒 3394 fabrika kaydı \(silinemez defter\):\n26 Ekim 10:33 Sinem: Bitti, gelmeyecek — "3394 bitti"\n26 Ekim 11:18 Fuat: Onayladı: bitti$/);
  assert.equal(kartHataMetni([{ tur: "eksik kartı" }, { tur: "eksik kartı" }, { tur: "fabrika kartı (fotoğraf yanlış)" }], [{ tur: "fabrika kartı" }]), "🧮 Bu hafta kartlar: ⚠️ bot hatası 3 · ↩️ geri al 1 · en çok: eksik kartı (2).");
});

// 10 Kasım (Patron): Venom bot yapamadıysa "yapamadı, sebebi şu" der; "sil" anında
import { kanalSilNiyeti } from "./venom-bot.js";
test("Venom kanal: 'sil' niyeti (kod / link / yanıt); bot yapamadıysa Patron'a açıkça", async () => {
  assert.deepEqual(kanalSilNiyeti("3512 sil"), { kodlar: ["3512"], ids: [] });
  assert.deepEqual(kanalSilNiyeti("bugünkü 3512 ve 3629 paylaşımlarını sil"), { kodlar: ["3512", "3629"], ids: [] });
  assert.deepEqual(kanalSilNiyeti("bu paylaşımı sil", "✅ 3512 paylaşıldı https://t.me/Volonteroseoffical/15000"), { kodlar: [], ids: [15000] });
  assert.equal(kanalSilNiyeti("3512'yi siteden sil"), null); // model kaldırma ayrı (onay kartı + stok kuralı)
  assert.equal(kanalSilNiyeti("hatırlatıcıyı sil"), null);
  const o = ortam();
  o.env.KEMAL_W = { mesaj: async () => { const { aktarilanGonder } = await import("./venom-bot.js"); await aktarilanGonder(o.env, { bot: "kemal", metod: "sendMessage", metin: "Bunu yapamıyorum: eski paylaşımın yazısını değiştirme yetkim yok.", medya: [] }); return true; }, paylasimSil: async (g) => ({ ok: true, kod: g.kod, silinen: [15001, 15002], ozet: `${g.kod} (t.me/Volonteroseoffical/15001 +1 mesaj, 10.11 14:35)` }) };
  o.cevaplar.push({ arac: "bota_yaz", girdi: { bot: "kemal", metin: "3512 yazısını düzelt" } }, { text: "Kemal yapamadı Patron." });
  await yazi(o, PATRON, "3512 yazısını Kemal düzeltsin");
  const tum = o.g.filter((x) => String(x.govde.chat_id) === String(PATRON) && x.govde.text).map((x) => x.govde.text);
  assert.deepEqual(tum, ["Yapılamadı, sebep: Kemal: Bunu yapamıyorum: eski paylaşımın yazısını değiştirme yetkim yok."]); // 11 Kasım: TEK mesaj, çelişki yok
  assert.match(JSON.stringify(o.claude.at(-1).messages.at(-1)), /KEMAL YAPAMADI/);
  o.g.length = 0;
  // 12 Kasım: "sil" kelimesi kestirmesi yok → beyin kanal_paylasim_sil aracını seçer; stok yokken siler, stok VARKEN model kanaldan kaldırılmaz
  assert.equal(await aracla(o, "3512 sil", "kanal_paylasim_sil", { kodlar: ["3512"] }), "Silindi: 3512 (t.me/Volonteroseoffical/15001 +1 mesaj, 10.11 14:35)");
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3534", adet: 44, fiyat: 40 }], simdi: 1 }) });
  assert.match(await aracla(o, "3534 sil", "kanal_paylasim_sil", { kodlar: ["3534"] }), /^SİLİNMEDİ: 3534 mağazada stokta \(BLACK ROSE 44 adet\)/);
});

test("TAM ZİNCİR DENEMESİ son halka: Patron'un açıkça istediği zincir denemesi (zincir: true) 🧪 işaretli karar kartı olarak Patron'a gider; Telegram'ın döndürdüğü hali venom:kanit'e; düz deneme yine gitmez", async () => {
  const { bittiKartMetni } = await import("./venom-bot.js");
  const o = ortam();
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => { // Telegram yazıyı/düğmeleri aynen geri döndürsün (kanıt)
    const r = await onceki(url, istek);
    if (!String(url).includes("api.telegram.org")) return r;
    const j = await r.json(); const g = istek.body ? JSON.parse(istek.body) : {};
    return Response.json({ ...j, result: { ...(j.result || {}), ...(g.caption ? { caption: g.caption, photo: [{ file_id: "p" }] } : {}), ...(g.text ? { text: g.text } : {}), ...(g.reply_markup ? { reply_markup: g.reply_markup } : {}) } });
  };
  try {
    const x = { id: "z1", sip: "D3459-z", kod: "3459", magaza: "BLACKROSE", oneri: "repete", hemra: "Hemra", tur: "bitti", fabrika: { kim: "Sinem", zaman: 1793000000, ne: "bitti" }, fuat: { kim: "deneme: Fuat'a gitmedi", zaman: 1793000000, kendisi: true }, stok: "deneme", deneme: true, zincir: true, foto: null };
    await kuyrugaEkle(o.env, "bittiOneri", { ...x, id: "z0", sip: "D1-duz", zincir: false });
    await kuyrugaEkle(o.env, "bittiOneri", x);
    await venomCron(o.env, Math.floor(Date.now() / 1000));
    const kartlar = o.g.filter((y) => /Hemra önerisi/.test(y.govde.text || y.govde.caption || ""));
    assert.equal(kartlar.length, 1); // sadece zincir denemesi
    assert.match(kartlar[0].govde.text || kartlar[0].govde.caption, /^🧪 DENEME[\s\S]*3459/);
    const kanit = JSON.parse(o.depo.get("venom:kanit") || "[]");
    assert.ok(kanit.some((k) => /^🧪 DENEME/.test(k.yazi) && /3459/.test(k.yazi) && k.dugmeler.flat().includes("🔁 Repete")), JSON.stringify(kanit));
    assert.match(bittiKartMetni(x), /^🧪 DENEME/);
  } finally { globalThis.fetch = onceki; }
});

test("eksik listesi fabrikaya ulaşınca Patron'a Venom'dan TEK satır (kuyruk 'fabrikaGitti'); Telegram'ın döndürdüğü hali kanıt", async () => {
  const o = ortam();
  await kuyrugaEkle(o.env, "fabrikaGitti", { id: "fg1", metin: "Bugünkü eksik listesi fabrikaya gitti: VOLONTE 11 model, Black Rose 9 model." });
  await venomCron(o.env, Math.floor(Date.now() / 1000));
  const giden = o.g.filter((x) => /Bugünkü eksik listesi fabrikaya gitti/.test(x.govde.text || ""));
  assert.equal(giden.length, 1);
  assert.equal(giden[0].govde.text, "Bugünkü eksik listesi fabrikaya gitti: VOLONTE 11 model, Black Rose 9 model.");
  assert.equal(String(giden[0].govde.chat_id), String(PATRON));
  assert.equal(JSON.parse(o.depo.get("venom:fabrikaGittiKanit")).ok, true);
});

// 11 Kasım (Patron, SON HAL): "3419 repete tekrar aç" → Sami'ye; yeni akış gerçek akışa bağlıyken repete SADECE kartla (Fuat'a düz yazı taslağı yok)
test("11 Kasım REPETE SON HAL (Venom): Patron 'TEST-002 repete tekrar aç' → Sami kuyruğu (yapay zekâ çağrılmaz); yeni akış açıkken repete isteği → Hemra'ya dağılım kartı kuyruğu, Fuat'a düz yazı taslağı YOK; kapalıyken eski taslak", async () => {
  const v = await import("./venom-bot.js");
  const o = ortam();
  await aracla(o, "TEST-002 repete tekrar aç", "repete_tekrar_ac", { kod: "TEST-002" }, "Kart Fuat'a yeniden gitti.");
  assert.deepEqual((await kuyruguAl(o.env, "rkKarar")).map((x) => [x.karar, x.kod, x.kim]), [["tekrarAc", "TEST-002", "Patron"]]);
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), []); // ara mesaj yok: sonuç TEK satır olarak Sami'den gelir
  // anahtar kapalı: eski yol (Fuat'a gidecek taslak kartı)
  o.g.length = 0;
  o.env.__sohbette = true;
  await v.aracCalistir(o.env, "mesaj_taslagi", { kime: "fuat", metin: "Fuat Bey merhaba, 3490 modelinden repete rica ediyoruz: siyah 8. Toplam yaklaşık 40 adet. Ne zaman hazır olur?" }, ist(11, 16));
  assert.ok(patronaGiden(o).some((x) => /Fuat'a gidecek mesaj/.test(x.govde.text)));
  assert.equal((await kuyruguAl(o.env, "rkBaslat")).length, 0);
  // anahtar açık: düz yazı yolu kapalı
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "akis:yeni", v: "1" }) });
  o.g.length = 0;
  const cevap = await v.aracCalistir({ ...o.env, __izin: "cevap" }, "mesaj_taslagi", { kime: "fuat", metin: "Fuat Bey merhaba, 3490 modelinden repete rica ediyoruz: siyah 8. Toplam yaklaşık 40 adet. Ne zaman hazır olur?" }, ist(11, 16, 5));
  assert.match(cevap, /^Repete artık KARTLA isteniyor/);
  assert.deepEqual((await kuyruguAl(o.env, "rkBaslat")).map((x) => x.kodlar), [["3490"]]);
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["🔁 3490 repete: Hemra'ya dağılım kartı gitti. Hemra dağılımı yazınca kart doğrudan Fuat'a gider."]);
  assert.ok(!patronaGiden(o).some((x) => /Fuat'a gidecek mesaj/.test(x.govde.text)));
  // 12 Kasım (Patron): Venom'un yazısı modelin GERÇEK fabrikasını gösterir — Celal'in modelinde "Celal'e kart gider"
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "5074", adet: 8, fiyat: 20, celal: true }], simdi: 1 }) });
  o.g.length = 0;
  await v.aracCalistir({ ...o.env, __izin: "cevap" }, "mesaj_taslagi", { kime: "fuat", metin: "5074 modelinden repete rica ediyoruz: siyah 40." }, ist(11, 16, 10));
  assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["🔁 5074 repete: Hemra'ya dağılım kartı gitti. Hemra dağılımı yazınca kart doğrudan Celal'e gider."]);
});

// ---------- 11 Kasım (Patron): VENOM VE SİSTEM — KÖKTEN DÜZELTME ----------
test("TEK DEFTER (kök): aynı soru iki kez sayılmaz; yazıyla cevaplanan kapanır; repetesi açılan modelin eski kartları kapanır; 3 günden eski düşer; her iş tek satır", async () => {
  const D = await import("./tek-defter.js");
  const simdi = ist(11, 19);
  const k = (id, o) => ({ id, zaman: simdi - 3600, bot: "sami", tur: "kart", kime: "503", kod: "3419", ozet: "🏭 Sinem · 3419 → Bitti · ne yapalım?", chat: "503", mesaj: id, durum: "bekliyor", deneme: 0, cb: "|fh:r:a1|fh:b:a1|", ...o });
  const satirlar = [
    k(1, { zaman: simdi - 30 * 3600 }), k(2, { zaman: simdi - 20 * 3600 }), // aynı kişi, aynı model, aynı soru → eskisi kapanır
    k(3, { kime: "504", chat: "504", zaman: simdi - 20 * 3600 }), // Hemra'daki kopya
    k(4, { kime: "501", chat: "501", zaman: simdi - 20 * 3600, cb: "|fs:g:x|fs:b:x|" }), // Fuat'taki fabrika kartı
    k(5, { kod: "3394", zaman: simdi - 2 * 3600, cb: "|fe:A:3394|" }), // başka model: açık kalır
    k(6, { kod: "3627", zaman: simdi - 4 * 86400, cb: "|fe:A:3627|" }), // 3 günden eski
    k(7, { kod: "3500", kime: "505", chat: "505", zaman: simdi - 5 * 3600, cb: "|fe:A:3500|" }),
    { id: 8, zaman: simdi - 3600, bot: "sami", tur: "karar", kime: "505", kod: "3500", ozet: '3500: "siyah 20 beyaz 20"' }, // yazıyla cevap
    k(9, { kod: "3419", kime: "501", chat: "501", zaman: simdi - 1800, cb: "|rk:f8:r1|rk:f15:r1|" }), // repete kartının KENDİSİ kapanmaz
  ];
  const { acik, kapat } = D.kartlariIndir(satirlar, simdi, { repeteler: [{ kod: "3419", durum: "acik", zaman: simdi - 4 * 3600, onay: simdi - 3 * 3600 }] });
  const neden = Object.fromEntries(kapat.map((x) => [x.id, x.neden]));
  assert.deepEqual(neden, { 1: "yenilendi", 2: "repete", 3: "repete", 4: "repete", 6: "eskidi", 7: "cevaplandi" });
  assert.deepEqual(acik.map((x) => x.id).sort(), [5, 9]);
  // Sami kartı düğmesindeki kayıt / liste kimliğiyle: kapanmış kaydın kartı, önceki günün liste kartı, eski toplu Hemra listesi kapanır; rapor kartı iş değildir
  const s2 = [
    k(20, { kod: "3284", cb: "|fk:r:3284-kapali|fk:s:3284-kapali|" }), k(21, { kod: "3254", cb: "|fk:r:3254-acik|fk:s:3254-acik|" }),
    k(22, { kod: "3490", kime: "501", chat: "501", cb: "|fo:e:3490-kapali|" }), k(23, { kod: "3408", kime: "501", chat: "501", cb: "|fc:g:3408-acik|fc:b:3408-acik|" }),
    k(24, { kod: "3477", cb: "|fe:k:2026-11-10:3477|" }), k(25, { kod: "3529", cb: "|fe:k:2026-11-11:3529|" }),
    k(26, { kod: null, ozet: "🌹 BLACK ROSE LİSTESİ – SONU (9 model)", kime: "501", chat: "501", cb: "|fc:H:2026-11-10-T3:B|" }), k(27, { kod: null, ozet: "🟦 VOLONTE LİSTESİ – SONU (1 model)", kime: "501", chat: "501", cb: "|fc:H:2026-11-11-T1:V|" }),
    k(28, { kod: "3501", kime: "504", chat: "504", ozet: "📋 Hemra: onaylanmayanlar / sorunlu işler (12). Her satır için seçin", cb: "|hl:9cc:a|hl:9cc:m|" }),
    k(29, { kod: "3279", bot: "kemal", kime: "999", chat: "999", ozet: "🌙 Kemal — 09.11.2026 akşam raporu · Bugün kanala 4 paylaşım yapıldı:", zaman: simdi - 20 * 3600, cb: "|rp:3392|" }),
  ];
  const r2 = D.kartlariIndir(s2, simdi, { fsAcik: new Set(["3254-acik", "3408-acik"]) });
  assert.deepEqual(Object.fromEntries(r2.kapat.map((x) => [x.id, x.neden])), { 20: "kayitKapandi", 22: "kayitKapandi", 24: "listeKapandi", 26: "listeKapandi", 28: "eskiListe", 29: "bilgi" });
  assert.deepEqual(r2.acik.map((x) => x.id).sort(), [21, 23, 25]); // liste sonu kartı (27) açık kalır ama iş satırı olmaz
  // satır biçimi: ne · kim · marka · durum · kanıt
  const rs = D.repeteSatiri({ id: "3419-x", kod: "3419", magaza: "VOLONTE", durum: "acik", adet: 40, zaman: simdi - 86400, teslim: "2026-11-21", fuat: { kim: "Fuat", zaman: simdi - 3 * 3600, kaynak: "Patron bildirdi (11.11)" } });
  assert.equal(D.defterSatirYazi(rs), "3419 · Repete 40 adet · Fuat · VOLONTE · beklemede · Fuat onayladı (Patron bildirdi (11.11)), teslim 21.11.2026"); // kişi ADI: "Fabrika" yazılmaz
  assert.equal(D.defterSatirYazi(D.fabrikaSatiri({ id: "f1", kod: "3394", magaza: "BLACKROSE", durum: "bekliyor", gonderim: simdi, chats: ["777", "501"] }, { 777: "Sinem", 501: "Fuat" })), "3394 · Fabrika isteği (eksik listesi) · Sinem, Fuat · Black Rose · açık · fabrikadan istendi, cevap bekleniyor; fabrikaya gitti 11.11 19:00");
  // zorunlu alanlar: kişi adı "fabrika" olamaz, kanıt ve tarih boş olamaz → satır yazılamaz
  assert.deepEqual(D.satirEksigi({ id: "x", ne: "iş", kim: "Fabrika", durum: "acik", kanit: "", acildi: 0 }), ["kişi adı", "kanıt", "tarih"]);
  assert.deepEqual(D.satirEksigi({ id: "x", ne: "iş", kim: "Sinem", durum: "acik", kanit: "kart gitti", acildi: simdi }), []);
});

test("5 SORU (Patron'un testi): fabrikaya dün giden (markalar ayrı, ≤4 satır) · repete durumu (kayıttan) · kanal kontrolü ('$' fiyat değil, söz tekrarı yok) · 'Merdan'a söyle' → Sami üzerinden Merdan'a, Pelin'e GİTMEZ · günlük satış adet + ciro", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const simdi = ist(11, 19);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    const pelinGiden = [], kemalIs = [];
    o.env.PELIN_W = { mesaj: async (m) => { pelinGiden.push(m); return true; } };
    o.env.KEMAL_W = { paylasimDuzelt: async (g) => { kemalIs.push(g); return { ok: true, yerinde: true, kod: g.kod, duzeltilen: 1 }; } };
    o.env.AZIZ_ID = "505";
    // 1) Fabrikaya dün hangi modeller gitti?  (Sami'nin kendi kaydı: VOLONTE 8, Black Rose 9 = 17)
    await o.ayar("fabrika:fabrikayaGiden:2026-11-10", { VOLONTE: ["3419", "3394", "3408", "3477", "3573", "3599", "3604", "3607"], BLACKROSE: ["3459", "3490", "3514", "3585", "3588", "3594", "3611", "3630", "3635"] });
    const c1 = await aracla(o, "Fabrikaya dün hangi modeller gitti?", "fabrika_giden", { gun: "dun" });
    assert.equal(c1, "Dün (10.11) fabrikaya 17 model gitti.\nVOLONTE (8): 3394, 3408, 3419, 3477, 3573, 3599, 3604, 3607\nBlack Rose (9): 3459, 3490, 3514, 3585, 3588, 3594, 3611, 3630, 3635");
    assert.ok(c1.split("\n").length <= 4);
    // 2) 3419'un repetesi ne durumda?  (repete kaydı: Fuat onayladı, 40 adet, teslim 21.11)
    await o.ayar("rk:3419-toc8", { id: "3419-toc8", kod: "3419", magaza: "VOLONTE", deneme: false, durum: "acik", adet: 40, zaman: simdi - 4 * 3600, teslim: "2026-11-21", fuat: { kim: "Fuat", zaman: simdi - 4 * 3600, gun: 10, kaynak: "Patron bildirdi (11.11)" } });
    await o.ayar("rk:acik", ["3419-toc8"]); await o.ayar("rk:hepsi", ["3419-toc8"]);
    const c2 = await aracla(o, "3419’un repetesi ne durumda?", "repete_durum", { kod: "3419" });
    assert.equal(c2, "3419 (VOLONTE) repete: 40 adet, üretimde.\nFuat onayladı (Patron bildirdi (11.11)), teslim 21.11.2026.");
    assert.ok(!/kayıtta yok|kart açık/.test(c2));
    // 3) Kanalda 3529'u kontrol et: "PRICE. $" fiyat DEĞİL → sorun yok; Patron'un sözü tekrar edilmez; Kemal'e iş gitmez
    o.depo.set("venom:kanal:son", JSON.stringify([
      { id: 11322, zaman: ist(1, 13) - 180 * 86400, kod: "3529", medya: "video", yazi: "❌ SOLD OUT / ÉPUISÉ\n\n✅CODE. 3529\n\n✅PRICE. $\n\n✅SIZE.  38/40/42/44.", sorunlar: ["yazıda FİYAT var"], duzenlendi: true },
      { id: 14958, zaman: ist(9, 20), kod: "3529", medya: "albüm (foto)", yazi: "❌ SOLD OUT / ÉPUISÉ\n✅ CODE: 3529\n🎨 Colors / Couleurs: black\nBLACK ROSE – Premium Women's Fashion", sorunlar: [], duzenlendi: true },
    ]));
    const c3 = await aracla(o, "Kanalda 3529’un yazısını kontrol et, sorun varsa Kemal’e düzelttir.", "kanal_kontrol", { kodlar: ["3529"] });
    assert.equal(c3, "3529: kanalda 2 paylaşım (en yenisi 09.11 20:00). Sorun yok: fiyat yok, marka imzası doğru.");
    assert.ok(!/Anladım|kontrol ediyorsun|düzelttireceksin/.test(c3));
    assert.equal(kemalIs.length, 0);
    // gerçek tutar olursa: Venom SORMADAN düzelttirir, tek satır sonuç + kanıt
    o.depo.set("venom:kanal:son", JSON.stringify([{ id: 15001, zaman: ist(10, 14), kod: "3512", medya: "video", yazi: "✅CODE 3512\n✅PRICE. 45$\n✅SIZE. 38/40", sorunlar: [], duzenlendi: false }]));
    o.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "kanaladi" }));
    assert.match(await aracla(o, "kanalda 3512 kontrol et", "kanal_kontrol", { kodlar: ["3512"] }), /^3512: 10\.11 14:00 paylaşımında yazıda FİYAT var → Kemal yazıyı düzeltti\. Kanıt: https:\/\/t\.me\/kanaladi\/15001$/);
    assert.deepEqual(kemalIs, [{ kod: "3512", ids: [15001], yerinde: true, kim: "Venom (kanal kontrolü)" }]);
    assert.ok(!patronaGiden(o).some((x) => /yaptırabilirim|ay[ıi]m m[ıi]\?/.test(x.govde.text)));
    // 4) "Merdan'a söyle, yarın 12:00'ye kadar 3394'ün fotoğrafını çeksin" → Merdan'a (Sami), Pelin'e DEĞİL, yapay zekâ yok, para yok
    const c4 = await aracla(o, "Merdan’a söyle, yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin", "kisiye_soyle", { kime: "merdan", metin: "yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin" });
    assert.deepEqual(pelinGiden, []); // Pelin ÇALIŞMADI
    assert.match(c4, /^Merdan'a kart Sami'nin sırasında \(birkaç dakika içinde gider\): "Yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin"\nSon saat 12\.11 12:00\. Gitmezse ya da cevap gelmezse haber veririm\.$/);
    await venomGidenAdimi(o.env, simdi + 60, o.samiTg); // Sami gönderir
    const kart = o.samiG.filter((x) => x.metod === "sendMessage").at(-1);
    assert.equal(String(kart.govde.chat_id), MERDAN);
    assert.match(kart.govde.text, /^Merdan: Patron'dan: Yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin\n⏰ Son saat: 12\.11 12:00\n\n1\. 3394\n\nDüğmeden seçin\.$/);
    assert.ok(kart.govde.reply_markup.inline_keyboard.every((r) => r.length <= 2));
    assert.equal(kart.govde.reply_markup.inline_keyboard[0][0].text, "3394 📷 Bugün çekerim");
    // Merdan basınca sonuç Patron'a TEK satır
    const G = await import("./venom-gorev.js");
    const gid = JSON.parse(o.depo.get("venom:gorevler"))[0].id;
    await kuyrugaEkle(o.env, "gorevCevap", { id: "c1", gid, i: 0, s: "c", kim: "Merdan", zaman: simdi + 120 });
    const yazilan = [];
    await G.gorevAdimi(o.env, simdi + 180, { biriktir: async () => {}, patronaKart: async () => {}, defter: async () => {}, patronaYaz: async (m) => { yazilan.push(m); } });
    assert.deepEqual(yazilan, ['✅ Yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin — 3394: Merdan "Bugün çekerim"']);
    // yazım çeşitleri (kural 33): Türkçe harfsiz, bitişik, büyük harf, iki kişi, kodsuz iş
    assert.deepEqual(v.kisiyeSoyleCoz("merdana soyle 3394 videosunu ceksin", simdi).kimler, ["merdan"]);
    assert.equal(v.kisiyeSoyleCoz("merdana soyle 3394 videosunu ceksin", simdi).kalip, "video");
    assert.deepEqual(v.kisiyeSoyleCoz("AZİZ'E SÖYLE DEPOYU SAYSIN", simdi).kimler, ["aziz"]);
    assert.deepEqual(v.kisiyeSoyleCoz("Hemra'ya ve Merdan'a yaz: vitrin değişsin", simdi).kimler.sort(), ["hemra", "merdan"]);
    assert.deepEqual(v.kisiyeSoyleCoz("Hemra'ya sor, 3627 nerede", simdi).kodlar, ["3627"]);
    assert.equal(v.kisiyeSoyleCoz("Fuat'a yaz mutabakatı kontrol etsin", simdi), null); // fabrika: onay kartı yolu (değişmedi)
    assert.equal(v.kisiyeSoyleCoz("Merdan bugün ne yaptı", simdi), null);
    assert.equal(v.kisiyeSoyleCoz("Merdan’a söyle, yarın 12:00’ye kadar 3394’ün fotoğrafını çeksin", simdi).son, ist(12, 12));
    // 12 Kasım (Patron, SAAT HATASI): saat söylendiyse AYNEN o saat; söylenmediyse mesai sonu 18:00
    const s10 = ist(12, 10, 30); // perşembe 10:30
    const sonu = (x, z = s10) => v.kisiyeSoyleCoz(x, z).son;
    assert.equal(sonu("Merdan'a söyle, 12:00'ye kadar 3394'ün fotoğrafını çeksin"), ist(12, 12));
    assert.equal(sonu("merdana soyle 12 ye kadar 3394 fotosunu ceksin"), ist(12, 12));
    assert.equal(sonu("Merdan’a söyle 12’ye kadar 3394’ün fotoğrafını çeksin"), ist(12, 12));
    assert.equal(sonu("Merdan'a söyle saat 12 de 3394 fotoğrafı hazır olsun"), ist(12, 12));
    assert.equal(sonu("Merdan'a söyle 12.00'ye kadar 3394"), ist(12, 12));
    assert.equal(sonu("Merdan'a söyle 14.30'a kadar 3394 3512 çeksin"), ist(12, 14, 30));
    assert.equal(sonu("Merdan'a söyle 12.10'a kadar 3394 çeksin"), ist(12, 12, 10));
    assert.equal(sonu("Merdan'a söyle 5'e kadar 3512 fotoğrafı"), ist(12, 17));
    assert.equal(sonu("Merdan'a söyle akşam 6'ya kadar 3394 videosu"), ist(12, 18));
    assert.equal(sonu("Hemra'ya söyle öğlene kadar vitrin değişsin"), ist(12, 12));
    assert.equal(sonu("Aziz'e söyle saat 15 buçukta depoyu saysın"), ist(12, 15, 30));
    assert.equal(sonu("Merdan'a söyle yarın 12'ye kadar 3394"), ist(13, 12));
    assert.equal(sonu("Merdan'a söyle 10:00'a kadar 3394"), ist(13, 10)); // saat bugün geçti → ertesi gün AYNI saat
    assert.equal(sonu("Merdan'a söyle, 3394'ün fotoğrafını çeksin"), ist(12, 18)); // saat yok → mesai sonu
    assert.equal(sonu("Merdan'a söyle, yarın 3394'ün fotoğrafını çeksin"), ist(13, 18));
    assert.equal(sonu("Merdan'a söyle 12.11 tarihli listeyi kontrol etsin"), ist(12, 18)); // tarih, saat değil
    assert.equal(sonu("Merdan'a söyle 3394 çeksin", ist(12, 19)), ist(13, 18)); // mesai bitti → yarın 18:00
    assert.equal(sonu("Merdan'a söyle 12'ye kadar 3394 çeksin", ist(14, 10)), ist(14, 12)); // cumartesi
    assert.equal(sonu("Merdan'a söyle 12'ye kadar 3394 çeksin", ist(14, 13)), ist(16, 12)); // cumartesi öğleden sonra → pazar atlanır, pazartesi 12:00
    // 5) Bugün Black Rose kaç adet sattı, kaç dolarlık?  (adet: satış sayımı; ciro: köprünün günlük fatura satırları)
    await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun: "2026-11-11", kalemler: [{ kod: "3490", adet: 4 }, { kod: "3632", adet: 2 }] }) });
    await o.ayar("ciro:BLACKROSE", { zaman: simdi - 600, satirlar: [{ tablo: "D0026TBLSATFATBASLIK", yil: 2026, tur: "21", doviz: "$", n: 900, tutar: 250000, kaynak: "satis" }, { tablo: "GUN:2026-11-11", yil: 2026, tur: "21", doviz: "$", n: 3, tutar: 1250.5, kaynak: "satis" }, { tablo: "GUN:2026-11-11", yil: 2026, tur: "22", doviz: "$", n: 1, tutar: 50.5, kaynak: "iade" }, { tablo: "GUN:2026-11-10", yil: 2026, tur: "21", doviz: "$", n: 9, tutar: 7000, kaynak: "satis" }] });
    const c5 = await aracla(o, "Bugün Black Rose kaç adet sattı, kaç dolarlık?", "gunluk_satis", { gun: "bugun", magaza: "BLACKROSE" });
    assert.equal(c5, "Bugün (saat 19:00 itibarıyla) satış — Vegawin:\nBlack Rose: 6 adet (2 model) · ciro: 1.200,00 $ (satış 1.250,50, iade 50,50) · 3 fatura\nCiro okuma saati: 18:50.");
    assert.ok(!/bende yok|not edeyim|kodları/.test(c5));
    // yıllık ciro günlük satırları İKİ KEZ saymaz
    const { ciroBolumu, gunlukCiro } = await import("./ciro.js");
    assert.match(ciroBolumu("BLACK ROSE", JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "ciro:BLACKROSE" }) })).json()).v)).join("\n"), /2026: satış 250\.000,00 \$ · iade 0,00 \$ · NET 250\.000,00 \$ \(900 fatura\)/);
    assert.equal(gunlukCiro({ zaman: 1, satirlar: [{ tablo: "D0026X", yil: 2026, tur: "21", tutar: 5 }] }, "2026-11-11"), null); // eski köprü: günlük satır yok → "henüz gelmedi"
    // köprü günlük ciro göndermiyorsa: uydurma yok, tek satır sebep + başlatılan çözüm
    assert.match(await aracla(o, "bugün volonte kaç sattı kaç dolar", "gunluk_satis", { gun: "bugun", magaza: "VOLONTE" }), /VOLONTE: 0 adet \(0 model\) · ciro: Vegawin'den günlük fatura toplamı henüz gelmedi\nGünlük ciro köprüden henüz gelmedi \(köprü güncellemesi gerekiyor\); gelince bu satırda yazar\./);
    // yapay zekâ aracı saati düşürse bile Patron'un söylediği saat kullanılır
    const o9 = ortam();
    o9.env.__patronMetni = "Merdan'a 3394 işini ilet, 12:00'ye kadar bitsin";
    const g0 = Date.now; Date.now = () => s10 * 1000;
    try { await v.aracCalistir(o9.env, "kisiye_soyle", { kime: "merdan", metin: "3394'ün fotoğrafını çeksin" }, s10); } finally { Date.now = () => simdi * 1000; void g0; }
    assert.equal(JSON.parse(o9.depo.get("venom:gorevler"))[0].son, ist(12, 12));
    assert.match((await kuyruguAl(o9.env, "giden"))[0].metin, /⏰ Son saat: 12\.11 12:00/);
  } finally { Date.now = gercek; }
});

test("VENOM GENEL KURALLAR (11 Kasım): '$' tek başına fiyat değil; '…yapayım mı / not edeyim mi?' sorulmaz; 'Anladım' satırı yok; araç çalışmadan 'hazır' denmez; cevap en fazla 5 satır; kanal alarmı tekrar etmez ve sormadan düzeltir", async () => {
  const v = await import("./venom-bot.js");
  // fiyat ancak gerçek tutarsa
  for (const y of ["✅PRICE. $", "PRICE.", "prix: demandez", "fiyat için yazın", "CODE 3529 $", "SIZE. 38/40/42/44"]) assert.equal(v.fiyatVar(y, "3529"), false, y);
  for (const y of ["PRICE. 45$", "$ 45", "45 usd", "fiyat 1.250 TL", "€30"]) assert.equal(v.fiyatVar(y, "3529"), true, y);
  // izin sorusu
  for (const y of ["Bunu not edeyim mi?", "Kontrol edeyim mi?", "Kemal'e yaptırayım mı?", "İstersen kodları çekebilirim, ister misin?", "Şimdi göndereyim mi ?"]) assert.ok(v.IZIN_SORUSU.test(y), y);
  for (const y of ["3 model gitti.", "Hangi renk?", "Silinsin mi?"]) assert.ok(!v.IZIN_SORUSU.test(y), y);
  assert.equal(v.anladimSil("🧭 Anladım: 3529'un kanal yazısını kontrol ediyorsun.\n\nSorun yok."), "Sorun yok.");
  assert.ok(v.YAPTIM_IDDIASI.test("Patron, kart hazır.") && v.YAPTIM_IDDIASI.test("Fuat'a gönderdim") && !v.YAPTIM_IDDIASI.test("Hazırım Patron"));
  // sohbet: araçsız "hazır" → sistem bir kez uyarır; yine araç yoksa "yapıldı" denmez
  const o = ortam();
  o.cevaplar.push({ text: "Patron, kart hazır. Onaylayınca gider." }, { text: "Kartı oluşturdum, hazır." });
  await yazi(o, PATRON, "vitrin için bir not hazırla");
  assert.equal(o.claude.length, 2);
  assert.match(JSON.stringify(o.claude[1].messages.at(-1)), /hiçbir araç ÇALIŞMADI/);
  assert.match(patronaGiden(o).at(-1).govde.text, /^Yapılamadı: bu iş için araç çalışmadı/);
  // sohbet: "Anladım" satırı ve izin sorusu Patron'a gitmez; 5 satırı geçen cevap kısaltılır
  const o2 = ortam();
  // 12 Kasım: araçsız sayı (hafızadan) söylenmez → sistem aracı çalıştırmasını ister; "Anladım" satırı ve izin sorusu Patron'a gitmez
  await o2.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "3557", adet: 20, fiyat: 40 }], simdi: 1 }) });
  o2.cevaplar.push({ text: "3557'den 20 adet var." }, { arac: "stok_sorgu", girdi: { kod: "3557" } }, { text: "🧭 Anladım: stok soruyorsun.\n\n3557: VOLONTE 20 adet.\nBaşka model bakayım mı?" }, { text: "3557: VOLONTE 20 adet." });
  await yazi(o2, PATRON, "3557 kaç tane");
  assert.match(JSON.stringify(o2.claude[1].messages.at(-1)), /hafızadan söylenmez/);
  const son = patronaGiden(o2).at(-1).govde.text;
  assert.equal(son, "3557: VOLONTE 20 adet.");
  // uzun liste KESİLMEZ: 4000 karakteri aşan cevap satır sınırından bölünür, hepsi gider
  const uzun = Array.from({ length: 120 }, (_, i) => `${i + 1}. 12.11 10:${String(i % 60).padStart(2, "0")} · 3${String(400 + i)} · VOLONTE · Fabrika isteği · Sinem · açık · kanıt: kart gitti`).join("\n");
  assert.ok(uzun.length > 4000);
  const pr = v.mesajParcalari(uzun);
  assert.ok(pr.length >= 2 && pr.every((x) => x.length <= 3800));
  assert.equal(pr.join("\n"), uzun); // tek satır bile kaybolmaz
  // kanal alarmı: "PRICE. $" → alarm YOK; gerçek fiyat → Kemal SORMADAN düzeltir, Patron'a tek sonuç; aynı paylaşım için ikinci mesaj yok
  const o3 = ortam();
  const duzelt = [];
  o3.env.KEMAL_W = { paylasimDuzelt: async (g) => { duzelt.push(g); return { ok: true, yerinde: true }; } };
  o3.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "kanaladi" }));
  const post = (id, caption, ed = false) => guncelleme({ update_id: uid++, [ed ? "edited_channel_post" : "channel_post"]: { message_id: id, date: ist(11, 17), chat: { id: -100, type: "channel" }, caption, video: { file_id: "v" } } }, o3.env);
  await post(13312, "❌ SOLD OUT / ÉPUISÉ\n\n✅CODE.3529\n\n✅PRICE. $\n\n✅SIZE.  44/46/48/50", true);
  assert.equal(patronaGiden(o3).length, 0);
  await post(15020, "✅CODE 3512\n✅PRICE. 45$");
  await post(15020, "✅CODE 3512\n✅PRICE. 45$", true);
  assert.equal(duzelt.length, 1);
  const pm = patronaGiden(o3);
  assert.equal(pm.length, 1);
  assert.equal(pm[0].govde.text, "🧹 Kanal: 3512 paylaşımında sorun vardı (yazıda FİYAT var) → Kemal yazıyı düzeltti.\nKanıt: https://t.me/kanaladi/15020");
  // 12 Kasım (Patron): elle yazılmış, kodsuz fiyatlı mesaj — "Şu an çözülüyor" YAZILMAZ; gerçek durum yazılır (Kemal düzeltemez, mesaj kanalda duruyor)
  o3.g.length = 0;
  await guncelleme({ update_id: uid++, channel_post: { message_id: 15168, date: ist(12, 14, 21), chat: { id: -100, type: "channel" }, text: "44-46-48-50 size have Price 46$" } }, o3.env);
  assert.equal(duzelt.length, 1); // kodsuz mesaj Kemal'in yazı düzeltmesine gönderilmez
  // Patron kararı: Venom KENDİSİ sildirir (tam o mesaj) — Patron'a o anda mesaj gitmez; sonuç Kemal'in kanıtlı satırıyla gelir ("… (mesaj no 15168): 1/1 mesaj silindi")
  assert.deepEqual(JSON.parse(o3.depo.get("venom:kanalMesajSil")), [{ kod: "Elle yazılmış fiyatlı mesaj (mesaj no 15168)", ids: [15168] }]);
  assert.deepEqual(patronaGiden(o3), []);
  await guncelleme({ update_id: uid++, channel_post: { message_id: 15168, date: ist(12, 14, 21), chat: { id: -100, type: "channel" }, text: "44-46-48-50 size have Price 46$" } }, o3.env);
  assert.equal(JSON.parse(o3.depo.get("venom:kanalMesajSil")).length, 1); // aynı mesaj ikinci kez sıraya girmez
});

test("TEK DEFTER KAYNAĞINDA (12 Kasım): depo tek listeyi kendisi kurar; bütün botlar düğmesi kalkan kartı bildirir; aynı modelin iki AYRI kaydı ayrı iş kalır; Venom / Pelin / Kemal işleri tek satır; biten iş kanıtla kapanır", async () => {
  const o = ortam();
  const D = await import("./tek-defter.js");
  const { defterTg, defterKarar, defterCevap, defterIs, defterSatir } = await import("./is-defteri.js");
  const simdi = ist(12, 11);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    const kart = (bot, chat, mesaj, text, cb) => defterTg(o.env, bot, "sendMessage", { chat_id: chat, text, reply_markup: { inline_keyboard: [cb.map((c) => ({ text: "x", callback_data: c }))] } }, { ok: true, result: { message_id: mesaj } });
    const bekleyen = async () => (await (await o.env.STOK.get().fetch("https://stok/isd-bekleyen", { method: "POST", body: "{}" })).json());
    // Sami: aynı modelin İKİ ayrı fabrika kaydı (büyük / küçük) → iki ayrı kart, ikisi de açık kalır
    await kart("sami", "501", 10, "🟦 VOLONTE · 3408 · Büyük (44-50) · beyaz 4", ["fc:g:3408-a", "fc:b:3408-a"]);
    await kart("sami", "501", 11, "🟦 VOLONTE · 3408 · Küçük (38-44) · beyaz 4", ["fc:g:3408-b", "fc:b:3408-b"]);
    assert.equal((await bekleyen()).length, 2);
    // aynı kart yeniden gönderilirse (aynı kişi, aynı düğmeler) eskisi yazılırken kapanır
    await kart("sami", "501", 12, "🟦 VOLONTE · 3408 · Küçük (38-44) · beyaz 4", ["fc:g:3408-b", "fc:b:3408-b"]);
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj).sort(), [10, 12]);
    // Kemal, Selin, Pelin: kartın düğmeleri kalkınca (düzenleme) defterde kapanır
    await kart("kemal", "503", 20, "⬆️ 3493 öneri kartı", ["sz:3493:p"]);
    await kart("selin", "503", 21, "🌸 3267 — siteye hazır taslak", ["sb:3267:k"]);
    await kart("pelin", "999", 22, "🎬 3627 — ön fotoğraf onayı", ["pf:3627:o"]);
    await defterTg(o.env, "kemal", "editMessageText", { chat_id: "503", message_id: 20, text: "✅ 3493 paylaşıldı" }, { ok: true, result: {} });
    await defterTg(o.env, "selin", "editMessageReplyMarkup", { chat_id: "503", message_id: 21, reply_markup: { inline_keyboard: [[{ text: "✔ Onaylandı", callback_data: "vg:-" }]] } }, { ok: true, result: {} });
    await defterTg(o.env, "pelin", "editMessageCaption", { chat_id: "999", message_id: 22, caption: "hâlâ soruluyor", reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: "pf:3627:o" }]] } }, { ok: true, result: {} }); // düğmesi duran kart kapanmaz
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj).sort(), [10, 12, 22]);
    // yazıyla cevap: o kişinin o modeldeki bekleyen kartı yazılırken kapanır (bir daha sorulmaz)
    await kart("sami", "505", 30, "🟦 VOLONTE · 3500 · satılan 4 · stok 2", ["fe:k:2026-11-12:3500"]);
    await defterCevap(o.env, "sami", "505", "3500", "siyah 20 beyaz 20");
    assert.ok(!(await bekleyen()).some((x) => x.mesaj === 30));
    // botların kart olmayan işleri: Pelin üretimi, Kemal kanal kuyruğu, Venom'un bota verdiği iş → her biri TEK satır
    await defterSatir(o.env, "pelin", [{ id: "pelin:i1", tur: "uretim", kod: "3627", marka: "BLACKROSE", ne: "Fotoğraf / video üretimi", kim: "Pelin", durum: "acik", kanit: "üretiliyor" }], true);
    await defterSatir(o.env, "kemal", { id: "kemal:kanal:3512", tur: "kanal", kod: "3512", ne: "Kanal paylaşımı (onaylandı, sırada)", kim: "Kemal", durum: "beklemede", kanit: "12.11 14:10 civarı kanala gider" });
    const Y = await import("./venom-yonetim.js");
    await Y.isKaydet(o.env, "selin", "3625 için site taslağı hazırla", simdi);
    await defterIs(o.env, "selin", "site: 3501 eklendi", { kod: "3501" });
    for (const id of ["3408-a", "3408-b"]) await o.env.STOK.get().fetch("https://stok/fs-yaz", { method: "POST", body: JSON.stringify({ rec: { id, kod: "3408", magaza: "VOLONTE", durum: "bekliyor", gonderim: simdi - 600, mesajlar: [] } }) });
    let df = await D.defterOku(o.env, simdi + 5, { venom: true });
    const yazi = df.satirlar.map(D.defterSatirYazi);
    assert.ok(yazi.includes("3627 · Fotoğraf / video üretimi · Pelin · Black Rose · açık · üretiliyor"));
    assert.ok(yazi.includes("3512 · Kanal paylaşımı (onaylandı, sırada) · Kemal · beklemede · 12.11 14:10 civarı kanala gider"));
    assert.ok(yazi.includes("3625 · 3625 için site taslağı hazırla · Selin · açık · Venom işi 12.11 11:00 verdi; cevap bekleniyor"));
    assert.ok(yazi.some((x) => /^3501 · site: 3501 eklendi · Selin · bitti · iş defteri 12\.11 11:00$/.test(x))); // biten iş kanıtıyla
    assert.deepEqual(yazi.filter((x) => /^3408 · /.test(x)), ["3408 · Fabrika isteği (eksik listesi) · Fuat · VOLONTE · açık · fabrikadan istendi, cevap bekleniyor; fabrikaya gitti 12.11 10:50"]); // defterde model başına tek satır
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj).filter((m) => m < 20).sort(), [10, 12]); // ama iki AYRI kaydın kartı da açık kalır (biri diğerini kapatmaz)
    // biten iş kanıtla kapanır ve açık listeden düşer: Kemal paylaştı, Selin cevap verdi, Pelin işi bitti
    await defterSatir(o.env, "kemal", { id: "kemal:kanal:3512", tur: "kanal", kod: "3512", ne: "Kanal paylaşımı", kim: "Kemal", durum: "bitti", kanit: "kanala paylaşıldı (mesaj 15100)" });
    await Y.isCevap(o.env, "selin", simdi + 60);
    await defterSatir(o.env, "pelin", [], true); // Pelin'in listesinde artık yok → satır düşer
    df = await D.defterOku(o.env, simdi + 120, { venom: true });
    const acik = df.satirlar.filter((x) => x.durum !== "bitti").map(D.defterSatirYazi);
    assert.ok(!acik.some((x) => /3512|3625|3627 · Fotoğraf/.test(x)));
    assert.ok(df.satirlar.map(D.defterSatirYazi).includes("3512 · Kanal paylaşımı · Kemal · bitti · kanala paylaşıldı (mesaj 15100)"));
    // anlık görüntü depoda; kuru okuma hiçbir şey kapatmaz
    await kart("sami", "505", 40, "🟦 VOLONTE · 3477 · satılan 2", ["fe:k:2026-11-10:3477"]); // önceki günün listesi
    const kuru = await D.defterOku(o.env, simdi + 130, { kuru: true });
    assert.deepEqual(kuru.kapanan.map((x) => x.neden), ["listeKapandi"]);
    assert.ok((await bekleyen()).some((x) => x.mesaj === 40));
    await D.defterOku(o.env, simdi + 140);
    assert.ok(!(await bekleyen()).some((x) => x.mesaj === 40));
    // onarım: yanlışlıkla "yenilendi" diye kapanmış AYRI kayıt yeniden açılır; gerçekten yenisi olan açılmaz
    const id10 = (await (await o.env.STOK.get().fetch("https://stok/isd-oku", { method: "POST", body: "{}" })).json()).filter((x) => x.mesaj === 10).map((x) => x.id);
    await o.env.STOK.get().fetch("https://stok/isd-isaretle", { method: "POST", body: JSON.stringify({ idler: id10, alan: "durum", deger: "yenilendi" }) }); // dışarıdan "yenilendi" işareti UYGULANMAZ (kararı depo verir)
    assert.ok((await bekleyen()).some((x) => x.mesaj === 10));
    o.stok.depo.sql.exec("UPDATE isd SET durum = 'yenilendi' WHERE id = ?", id10[0]); // 11 Kasım'ın yanlış kapanışı
    const on = await (await o.env.STOK.get().fetch("https://stok/isd-onar", { method: "POST", body: JSON.stringify({ simdi: simdi + 150 }) })).json();
    assert.equal(on.acilan, 1);
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj).sort(), [10, 12, 22]);
  } finally { Date.now = gercek; }
});

// ---------- 12 Kasım (Patron): VENOM — KÖKTEN YENİDEN YAPILANMA ----------
test("YENİDEN YAPILANMA C/D: karar verilen modelin BÜTÜN kartları kapanır; silme sözü takip edilir (kanıtlı tek satır / 1 saatte sebep); 'Emin misiniz?' bir kez; silinmesi onaylanan model listelere girmez", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const { defterTg, defterKarar } = await import("./is-defteri.js");
  const { kartKapatAdimi } = await import("./kart-tekrar.js");
  const { kanalBilgisi } = await import("./ortak.js");
  const simdi = ist(12, 11);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    o.env.AZIZ_ID = "505";
    const benv = { STOK: o.env.STOK, KAYIT: o.env.KAYIT, MURAT_ID: String(PATRON), HEMRA_ID: "504" };
    const kart = (bot, chat, mesaj, text, cb) => defterTg(benv, bot, "sendMessage", { chat_id: chat, text, reply_markup: { inline_keyboard: [cb.map((c) => ({ text: "Repete al", callback_data: c }))] } }, { ok: true, result: { message_id: mesaj } });
    const bekleyen = async () => (await (await o.env.STOK.get().fetch("https://stok/isd-bekleyen", { method: "POST", body: "{}" })).json());
    // 3372 için kartlar: Hemra (Sami), Merdan (Sami), Aziz (Kemal), Fuat (Sami) + başka model (3500)
    await kart("sami", "504", 1, "🏭 Sinem · 3372 → Bitti · ne yapalım?", ["fk:r:3372-a", "fk:b:3372-a"]);
    await kart("sami", MERDAN, 2, "📦 3372 — Vegawin: stok bitti. Ne yapalım?", ["sz:r:3372"]);
    await kart("kemal", "505", 3, "⬆️ 3372 öneri kartı", ["y1:9:3372"]);
    await kart("sami", FUAT, 4, "Sinem 3372 için \"bitti\" dedi. Onaylıyor musunuz?", ["fo:e:3372-a"]);
    await kart("sami", "504", 5, "🏭 Sinem · 3500 → Bitti · ne yapalım?", ["fk:r:3500-a"]);
    assert.equal((await bekleyen()).length, 5);
    // Aziz kendi kartına basar → SADECE o kart kapanır (Aziz'in basışı "kesin karar" değil)
    await defterKarar(benv, "kemal", { data: "y1:9:3372", from: { id: 505, first_name: "Aziz" }, message: { text: "⬆️ 3372 öneri kartı", reply_markup: { inline_keyboard: [[{ text: "Repete al", callback_data: "y1:9:3372" }]] } } });
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj).sort(), [1, 2, 4, 5]);
    // Hemra 3372 kartına basar → 3372'nin BÜTÜN açık kartları (Merdan, Fuat) kapanır; 3500 durur
    await defterKarar(benv, "sami", { data: "fk:b:3372-a", from: { id: 504, first_name: "Hemra" }, message: { text: "🏭 Sinem · 3372 → Bitti · ne yapalım?", reply_markup: { inline_keyboard: [[{ text: "3372 Bekle", callback_data: "fk:b:3372-a" }]] } } });
    assert.deepEqual((await bekleyen()).map((x) => x.mesaj), [5]);
    // telefonlardaki kartların düğmesi kalkar: her bot kendi kartını kapatır ("✔ Karar verildi (Hemra)"), yazı aynen kalır
    const kapanan = [];
    assert.equal(await kartKapatAdimi(benv, "sami", async (e, m, g) => { kapanan.push([m, String(g.chat_id), g.message_id, g.reply_markup.inline_keyboard[0][0].text]); return { ok: true }; }), 2);
    assert.deepEqual(kapanan.sort((a, b) => a[2] - b[2]), [["editMessageReplyMarkup", MERDAN, 2, "✔ Karar verildi (Hemra)"], ["editMessageReplyMarkup", FUAT, 4, "✔ Karar verildi (Hemra)"]]);
    // Patron'un kararı (yazıyla): karar_uygula → Venom'un o modele ait açık Patron kartı da kapanır; aynı karar bir daha sorulmaz
    o.depo.set("venom:bittiKart:S5", JSON.stringify({ id: `S5:${simdi - 3600}`, sip: "S5", kod: "3500", magaza: "VOLONTE", oneri: "bekle", zaman: simdi - 3600 }));
    assert.match((await v.bekleyenlerMetni(o.env, simdi)), /3500 \(🟦 VOLONTE\): fabrikada bitti/);
    assert.match(await aracla(o, "3500 için bekle, stok bitene kadar kalsın", "karar_uygula", { kod: "3500", karar: "bekle" }), /^3500: "bekle" kararı kaydedildi \(12\.11 11:00\)\. Kapanan açık kart: 2\./);
    assert.deepEqual(await bekleyen(), []);
    assert.equal(await v.bekleyenlerMetni(o.env, simdi + 60), "✅ Kararınızı bekleyen iş yok.");
    assert.deepEqual((await kuyruguAl(o.env, "bittiKarar")).map((x) => [x.sip, x.karar, x.kim]), [["S5", "bekle", "Patron"]]); // karar Sami'ye de gitti
    // ---- silme: onay kartı → "Emin misiniz?" BİR kez → söz → kanıtlı tek satır ----
    await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3377", adet: 0, fiyat: 40 }], simdi: 1 }) });
    o.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "kanaladi" }));
    o.depo.set("kodlar", JSON.stringify({ 3377: [{ ids: [10680], tarih: 5 }] }));
    let site = [{ kod: "3377", fotolar: ["a"] }, { kod: "3534", fotolar: ["a"] }];
    o.env.SELIN_DEPO = { dosya: async () => ({ ok: true, govde: new TextEncoder().encode(JSON.stringify(site)) }) };
    assert.equal(await aracla(o, "3377 site ve kanaldan kaldır", "siteden_kaldir", { kod: "3377" }), "Silme onay kartı Patron'a gösterildi.");
    const sk = sonKart(o);
    assert.match(sk.govde.text, /^🗑 3377:/);
    // aynı model için İKİNCİ silme kartı açılmaz
    assert.match(await aracla(o, "3377 sil", "siteden_kaldir", { kod: "3377" }), /^3377 için silme onay kartı zaten açık \(12\.11 11:00\); ikinci kart açılmadı\./);
    const onayla = sk.govde.reply_markup.inline_keyboard.flat().find((b) => /Onayla/.test(b.text)).callback_data;
    o.g.length = 0;
    await bas(o, onayla); await bas(o, onayla); // Patron iki kez bassa da
    assert.equal(patronaGiden(o).filter((x) => x.govde.text === "⚠️ Emin misiniz?").length, 1); // "Emin misiniz?" BİR kez
    const evet = patronaGiden(o).find((x) => x.govde.text === "⚠️ Emin misiniz?").govde.reply_markup.inline_keyboard[0][0].callback_data;
    await bas(o, evet);
    assert.match(patronaGiden(o).at(-1).govde.text, /^✅ 3377 silmesi sırada: önce site \(Selin\), sonra kanal \(Kemal\)\. Bitince kanıtıyla yazacağım/);
    assert.deepEqual(JSON.parse(o.depo.get("venom:sozler")).map((x) => [x.tur, x.kod, Boolean(x.bitti)]), [["sil", "3377", false]]);
    // onaylandığı ANDA: Selin'in fotoğraf listesine ve Kemal'in sırasına girmez (silme bitmesi beklenmez)
    assert.ok((await kanalBilgisi(o.env)).silinenler["3377"]);
    // 1 saat geçti, silme bitmedi → Venom sebebini kendisi araştırır, Patron'a TEK satır
    o.g.length = 0;
    await v.sozAdimi(o.env, simdi + 1800);
    assert.equal(patronaGiden(o).length, 0); // 30 dk: henüz yazmaz
    await v.sozAdimi(o.env, simdi + 3700);
    assert.equal(patronaGiden(o).length, 1);
    assert.match(patronaGiden(o)[0].govde.text, /^⚠️ 3377 silmesi 1 saatte bitmedi\. Sebep: Selin'in sırasında bekliyor; site henüz güncellenmedi\. Takip ediyorum; bitince yazacağım\.$/);
    await v.sozAdimi(o.env, simdi + 4000);
    assert.equal(patronaGiden(o).length, 1); // aynı uyarı ikinci kez gitmez
    // silme bitti (site listesinde yok + Kemal'in silme kaydı) → kanıtlı TEK satır; söz kapanır
    site = [{ kod: "3534", fotolar: ["a"] }];
    o.depo.delete("venom:siteSil"); o.depo.delete("venom:kanalSil"); // Selin ve Kemal sıralarını işledi
    o.depo.set("silinen:3377", JSON.stringify({ kod: "3377", kim: "Patron (Venom)", zaman: simdi + 4200, kopya: [{ kanal: 10680, arsiv: 9, gizlendi: true }] }));
    o.g.length = 0;
    await v.sozAdimi(o.env, simdi + 4500);
    assert.deepEqual(patronaGiden(o).map((x) => x.govde.text), ["✅ 3377 silindi. Site: listede yok. Kanal: 1 mesaj kaldırıldı 12.11 12:10 (mesaj no 10680) — 1 eski mesajı Telegram sildirmedi, SOLD OUT görseliyle gizlendi: https://t.me/kanaladi/10680."]);
    assert.ok(JSON.parse(o.depo.get("venom:sozler"))[0].bitti);
    await v.sozAdimi(o.env, simdi + 5000);
    assert.equal(patronaGiden(o).length, 1); // bir daha yazmaz
  } finally { Date.now = gercek; }
});

test("YENİDEN YAPILANMA B/D16: cevapsız kartlar kişi kişi, tarihli, eksiksiz (sayfalı); gün özeti ile sabah raporu AYNI sayı (ekleme / kaldırma / güncelleme ayrı, her paylaşım kodlu); en çok satan 3 model marka marka", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const V = await import("./venom-veri.js");
  const { defterTg } = await import("./is-defteri.js");
  const simdi = ist(12, 11);
  const gercek = Date.now;
  try {
    o.env.AZIZ_ID = "505";
    o.depo.set("sami:fabrikaKisiler", JSON.stringify([{ id: "777", ad: "Sinem" }, { id: FUAT, ad: "Fuat" }, { id: NURI, ad: "Nuri" }]));
    const benv = { STOK: o.env.STOK, KAYIT: o.env.KAYIT };
    const kart = async (zaman, bot, chat, mesaj, text, cb) => { Date.now = () => zaman * 1000; await defterTg(benv, bot, "sendMessage", { chat_id: chat, text, reply_markup: { inline_keyboard: [[{ text: "x", callback_data: cb }]] } }, { ok: true, result: { message_id: mesaj } }); };
    await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3377", adet: 0 }, { kod: "3534", adet: 44 }], simdi: 1 }) });
    await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "3569", adet: 3 }, { kod: "3394", adet: 2 }], simdi: 1 }) });
    await kart(ist(11, 9, 5), "sami", "504", 11, "🏭 Sinem · 3569 → Bitti · ne yapalım?", "sz:r:3569");
    await kart(ist(11, 16, 30), "sami", "504", 12, "📦 3377 — stok bitti. Ne yapalım?", "sz:r:3377");
    await kart(ist(12, 9, 40), "sami", FUAT, 13, "Sinem 3394 için \"bitti\" dedi. Onaylıyor musunuz?", "sz:e:3394");
    await kart(ist(12, 10, 15), "kemal", MERDAN, 14, "⬆️ 3534 öneri kartı", "y1:9:3534");
    for (let i = 0; i < 70; i++) await kart(ist(12, 10, 20) + i, "sami", "777", 100 + i, `🟦 VOLONTE · 4${String(100 + i)} · Büyük · siyah 4`, `sz:g:4${100 + i}`); // uzun liste: yarıda KESİLMEZ
    Date.now = () => simdi * 1000;
    const c = await aracla(o, "Şu an kimin cevap vermediği kart var? Kişi kişi, en eskisinden.", "cevapsiz_kartlar", {});
    const s = c.split("\n");
    assert.equal(s[0], "Cevap bekleyen 74 iş, 4 kişide (en eskiden yeniye):");
    assert.equal(s[1], "Hemra — 2 kart (en eskisi 11.11 09:05):"); // kişi ADI, en eski önce
    assert.equal(s[2], "  11.11 09:05 · 3569 · VOLONTE · 🏭 Sinem · 3569 → Bitti · ne yapalım?"); // tarih + saat + model + marka
    assert.equal(s[3], "  11.11 16:30 · 3377 · Black Rose · 📦 3377 — stok bitti. Ne yapalım?");
    assert.equal(s[4], "Fuat — 1 kart (en eskisi 12.11 09:40):");
    assert.equal(s[6], "Merdan — 1 kart (en eskisi 12.11 10:15):");
    assert.equal(s[8], "Sinem — 70 kart (en eskisi 12.11 10:20):");
    assert.ok(!/fabrika|Fabrika —|göremedim|bir tane daha/.test(c)); // "fabrika" yazılmaz, yarıda kesilmez
    assert.equal(s.at(-1), "Sayfa 1/2 (toplam 78 satır; devamı için sayfa=2)."); // uzunsa SAYFALAR: hiçbir satır kaybolmaz
    const c2 = await aracla(o, "devamı", "cevapsiz_kartlar", { sayfa: 2 });
    assert.equal(c2.split("\n").filter((x) => /^  12\.11/.test(x)).length + s.filter((x) => /^  1[12]\.11/.test(x)).length, 74); // iki sayfada 74 işin HEPSİ
    // ---- gün özeti = sabah raporu (aynı kaynak) ----
    await o.env.STOK.get().fetch("https://stok/isd-yaz", { method: "POST", body: JSON.stringify({ kayitlar: [
      ...["3189", "3202", "3267", "3269"].map((k, i) => ({ zaman: ist(11, 12, i), bot: "selin", tur: "is", kod: k, ozet: `site: ${k} siteye eklendi (onaylayan: Merdan)` })),
      { zaman: ist(11, 20, 40), bot: "selin", tur: "is", kod: "3506", ozet: "site: 3506 siteden kaldırıldı (Patron)" }, { zaman: ist(11, 20, 41), bot: "selin", tur: "is", kod: "3529", ozet: "site: 3529 siteden kaldırıldı (Patron)" },
      { zaman: ist(11, 21), bot: "selin", tur: "is", ozet: "site: Vegawin stok güncellemesi (2 model)" }, { zaman: ist(11, 22), bot: "selin", tur: "is", ozet: "site: Vegawin stok güncellemesi (3 model)" }, { zaman: ist(11, 23), bot: "selin", tur: "is", ozet: "site: Vegawin stok güncellemesi (1 model)" },
    ] }) });
    o.depo.set("kodlar", JSON.stringify({ 3578: [{ ids: [15101], tarih: ist(11, 10) }], 3335: [{ ids: [15105], tarih: ist(11, 11, 30) }], 3202: [{ ids: [15110], tarih: ist(11, 13) }, { ids: [15111, 15112], tarih: ist(11, 13) }, { ids: [14000], tarih: ist(5, 13) }] })); // 3202: albüm + yazı aynı anda = TEK paylaşım
    o.depo.set("venom:siteDefteri", JSON.stringify({ zaman: 1, modeller: { 3189: { kod: "3189" }, 3202: { kod: "3202" } } }));
    const g = await aracla(o, "Dün Selin siteye hangi modelleri ekledi, Kemal kanala kaç paylaşım yaptı?", "gun_ozeti", { gun: "dun" });
    const gs = g.split("\n");
    assert.equal(gs[1], "Siteye EKLENEN 4 model: 3189 (12:00), 3202 (12:01), 3267 (12:02), 3269 (12:03)"); // 9 değil 4: kaldırma ve güncelleme AYRI
    assert.equal(gs[2], "Siteden KALDIRILAN 2 model: 3506 (20:40), 3529 (20:41)");
    assert.match(gs[3], /^Site GÜNCELLEMESİ 3 kez: /);
    assert.equal(gs[4], "Kanala PAYLAŞIM 3: 3578 (10:00, mesaj 15101), 3335 (11:30, mesaj 15105), 3202 (13:00, mesaj 15110 + 15111)"); // her paylaşım KODLU, bütün kodlar; aynı anda çıkan iki mesaj iki kez sayılmaz
    const rapor = (await v.sabahOzeti(o.env, ist(12, 9, 40))).split("\n");
    assert.ok(rapor.includes("📣 Kanal dün: 3 paylaşım")); // sabah raporu ile sohbet AYNI sayı
    assert.ok(rapor.includes("🌐 Site: 2 model, dün 4 eklendi, 2 kaldırıldı"));
    // ---- en çok satan 3 model, marka marka ----
    await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", gun: "2026-11-11", kalemler: [{ kod: "3569", adet: 12 }, { kod: "3394", adet: 20 }, { kod: "3408", adet: 8 }, { kod: "3477", adet: 28 }] }) });
    await o.env.STOK.get().fetch("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun: "2026-11-11", kalemler: [{ kod: "3534", adet: 9 }, { kod: "3632", adet: 14 }] }) });
    assert.equal(await aracla(o, "Dün VOLONTE'de ve Black Rose'da en çok satan 3 model hangisi, kaçar adet?", "en_cok_satan", { gun: "dun", adet: 3 }),
      "VOLONTE (11.11, toplam 68 adet, 4 model): 1) 3477 — 28 adet, 2) 3394 — 20 adet, 3) 3569 — 12 adet\nBlack Rose (11.11, toplam 23 adet, 2 model): 1) 3632 — 14 adet, 2) 3534 — 9 adet");
    void V;
  } finally { Date.now = gercek; }
});

test("YENİDEN YAPILANMA B6: zorunlu alanı boş satır deftere YAZILAMAZ (kişi adı — 'fabrika' olmaz —, durum, kanıt); tam satır yazılır", async () => {
  const o = ortam();
  const yaz = async (satirlar) => (await (await o.env.STOK.get().fetch("https://stok/is-yaz", { method: "POST", body: JSON.stringify({ yazan: "kemal", satirlar }) })).json());
  const tam = { id: "k:1", tur: "is", kod: "3578", marka: "VOLONTE", ne: "kanala paylaşıldı", kim: "Kemal", durum: "bitti", kanit: "mesaj 15101", acildi: ist(12, 10) };
  const r = await yaz([tam, { ...tam, id: "k:2", kim: "fabrika" }, { ...tam, id: "k:3", kanit: "" }, { ...tam, id: "k:4", kim: "" }, { ...tam, id: "k:5", durum: "belirsiz" }]);
  assert.equal(r.n, 1);
  assert.deepEqual(r.reddedilen, [{ id: "k:2", eksik: ["kişi adı"] }, { id: "k:3", eksik: ["kanıt"] }, { id: "k:4", eksik: ["kişi adı"] }, { id: "k:5", eksik: ["durum"] }]);
  const l = await (await o.env.STOK.get().fetch("https://stok/is-liste", { method: "POST", body: "{}" })).json();
  assert.deepEqual((l.liste || l).map((x) => x.id), ["k:1"]);
});

test("YENİDEN YAPILANMA (kabul testinde yakalandı): başka modelin açık repetesi bu modele YAZILMAZ; Hemra 'bekle' dediği fabrika işi cevapsız görünmez, Hemra'nın önerdiği iş Patron'dadır", async () => {
  const o = ortam();
  const { fabrikaSatiri } = await import("./defter-mantik.js");
  const simdi = ist(12, 12);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3534", adet: 44 }], simdi: 1 }) });
    await o.ayar("rk:3419-toc8", { id: "3419-toc8", kod: "3419", magaza: "VOLONTE", deneme: false, durum: "acik", adet: 40, zaman: simdi - 4 * 3600, teslim: "2026-11-21", fuat: { kim: "Fuat", zaman: simdi - 4 * 3600 } });
    await o.ayar("rk:acik", ["3419-toc8"]); await o.ayar("rk:hepsi", ["3419-toc8"]);
    const c = await aracla(o, "3534 durumu?", "model_durumu", { kod: "3534" });
    assert.match(c, /^3534: marka Black Rose/);
    assert.match(c, /\nRepete: açık repete yok\.\n/); // 3419'un repetesi 3534'e yazılmaz
    assert.ok(!/40 adet|hem repete açık/.test(c));
    assert.match(await aracla(o, "3419 durumu?", "model_durumu", { kod: "3419" }), /\nRepete: 40 adet — /);
    // fabrika "bitti" + Hemra "bitene kadar bekle" → BEKLEMEDE (cevap bekleyen iş değil); karar tarihi kanıtta
    const b = fabrikaSatiri({ id: "3377-a", kod: "3377", magaza: "BLACKROSE", durum: "bitti", gonderim: ist(2, 21, 22), karar: "stokBitene", kararVeren: "Hemra", kararZaman: ist(11, 19, 56) }, {});
    assert.deepEqual([b.durum, b.kim, b.kanit], ["beklemede", "Hemra", "fabrikada bitti; karar: stok bitene kadar bekle (Hemra 11.11 19:56); fabrikaya gitti 02.11 21:22"]);
    // Hemra "repete öner" dedi → iş Patron'da (Hemra'da cevapsız görünmez)
    const p = fabrikaSatiri({ id: "3500-a", kod: "3500", magaza: "VOLONTE", durum: "bitti", gonderim: ist(10, 20), oneri: "repete", oneriZaman: ist(11, 9) }, {});
    assert.deepEqual([p.durum, p.kim], ["acik", "Patron"]);
    assert.match(p.kanit, /^fabrikada bitti; Hemra önerdi: repete \(11\.11 09:00\); Patron kararı bekleniyor/);
    // karar yok, öneri yok → Hemra'da açık (karar bekleniyor)
    const h = fabrikaSatiri({ id: "3600-a", kod: "3600", magaza: "VOLONTE", durum: "bitti", gonderim: ist(10, 20) }, {});
    assert.deepEqual([h.durum, h.kim], ["acik", "Hemra"]);
  } finally { Date.now = gercek; }
});

test("YENİDEN YAPILANMA (kabul testinde yakalandı): silinen modelin eski kanal mesajı 'sorun yok' diye yazılmaz — silme kaydı yazılır; silme kararı Sami'ye fabrika kaydını kapattırır", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const simdi = ist(12, 13);
  const gercek = Date.now; Date.now = () => simdi * 1000;
  try {
    o.depo.set("venom:kanal:son", JSON.stringify([{ id: 14327, zaman: ist(3, 14, 41), kod: "3377", medya: "albüm", yazi: "CODE. 3377", sorunlar: [] }, { id: 15101, zaman: ist(11, 10), kod: "3578", medya: "foto", yazi: "CODE. 3578", sorunlar: [] }]));
    o.depo.set("silinen:3377", JSON.stringify({ kod: "3377", kim: "Patron (Venom)", zaman: ist(12, 9, 56), kopya: [{ kanal: 14327, arsiv: 1, gizlendi: true }, { kanal: 14328, arsiv: 2, gizlendi: true }] }));
    const c = await aracla(o, "kanalda son 30 gün", "kanal_paylasimlari", { gun: 30 });
    assert.match(c, /3377 · albüm · 🗑 KALDIRILDI \(12\.11 09:56; eski mesaj SOLD OUT görseliyle gizli — silme tamam\)/);
    assert.match(c, /3578 · foto · sorun yok/);
    assert.equal(await v.kanalKontrolCevabi({ ...o.env, __kuru: true }, ["3377"], simdi), "3377: kanaldan kaldırıldı 12.11 09:56 (2 mesaj; eski mesajlar SOLD OUT görseliyle gizli). Kontrol edilecek paylaşım yok.");
    await v.kararVerildi(o.env, "3377", "silindi", simdi);
    assert.deepEqual((await kuyruguAl(o.env, "fsSilindi")).map((x) => x.kod), ["3377"]);
    await v.kararVerildi(o.env, "3500", "bekle", simdi);
    assert.deepEqual(await kuyruguAl(o.env, "fsSilindi"), []); // "bekle" kararı fabrika kaydını kapatmaz
  } finally { Date.now = gercek; }
});

test("YENİDEN YAPILANMA (kabul testinde yakalandı): 'fotoğrafı yok' görevindeki model siteye eklendiyse o kalem BİTMİŞ sayılır; eklenmeyenler açık kalır", async () => {
  const o = ortam();
  const { venomSatirlari } = await import("./tek-defter.js");
  const simdi = ist(12, 13);
  o.depo.set("venom:gorevler", JSON.stringify([{ id: "g1", zaman: ist(9, 16), durum: "acik", kimler: ["merdan"], metin: "16 Black Rose modelinin fotoğrafı yok", son: ist(9, 18), kalemler: [{ kod: "3189", secim: null }, { kod: "3047", secim: null }] },
    { id: "g2", zaman: ist(11, 16), durum: "acik", kimler: ["aziz"], metin: "3569 sayımını yap", son: ist(11, 18), kalemler: [{ kod: "3569", secim: null }] }]));
  o.depo.set("venom:siteDefteri", JSON.stringify({ zaman: 1, modeller: { 3189: { kod: "3189" }, 3569: { kod: "3569" } } }));
  const s = await venomSatirlari(o.env, simdi);
  assert.deepEqual(s.map((x) => [x.kod, x.kim, x.durum]), [["3189", "Merdan", "bitti"], ["3047", "Merdan", "acik"], ["3569", "Aziz", "acik"]]); // fotoğraf işi olmayan görev siteye bakmaz
  assert.equal(s[0].kanit, "model siteye eklendi (site defteri); fotoğraf işi bitti");
});

test("12 Kasım: 'fabrikada bitti' kartında Patron 'Repete' derse düz yazı taslağı GİTMEZ — Hemra dağılımı yazar, kart doğrudan modelin gerçek fabrikasına (Celal / Fuat) gider; Patron'a ikinci onay yok", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  const simdi = ist(12, 15);
  await o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "5074", adet: 8, fiyat: 20, celal: true }, { kod: "3394", adet: 4, fiyat: 30 }], simdi: 1 }) });
  for (const [sip, kod] of [["5074-a", "5074"], ["3394-a", "3394"]]) o.depo.set(`venom:bittiKart:${sip}`, JSON.stringify({ id: `${sip}:${simdi}`, sip, kod, magaza: "VOLONTE", oneri: "repete", hemra: "Hemra", zaman: simdi }));
  o.g.length = 0;
  await bas(o, "vbo:r:5074-a");
  assert.deepEqual((await kuyruguAl(o.env, "rkBaslat")).map((x) => x.kodlar), [["5074"]]);
  assert.ok(!patronaGiden(o).some((x) => /Fuat'a gidecek/.test(x.govde.text || "")));
  assert.ok(o.g.some((x) => /Hemra dağılımı yazınca repete kartı doğrudan Celal'e gider$/.test(x.govde.text || x.govde.caption || "")));
  o.g.length = 0;
  await bas(o, "vbo:r:3394-a"); // yeni akış kapalıyken diğer modelde eski yol (taslak Fuat'a, Patron onayıyla)
  assert.deepEqual(await kuyruguAl(o.env, "rkBaslat"), []);
  assert.ok(patronaGiden(o).some((x) => /Fuat'a gidecek/.test(x.govde.text || "")));
  // yeni akış AÇIK (canlıdaki durum): Fuat'ın modelinde de kart yolu — "doğrudan Fuat'a gider"
  await o.env.STOK.get().fetch("https://stok/ayar-yaz", { method: "POST", body: JSON.stringify({ k: "akis:yeni", v: "1" }) });
  o.depo.set("venom:bittiKart:3394-b", JSON.stringify({ id: `3394-b:${simdi}`, sip: "3394-b", kod: "3394", magaza: "VOLONTE", oneri: "sor", hemra: "Hemra", zaman: simdi }));
  o.g.length = 0;
  await bas(o, "vbo:r:3394-b");
  assert.deepEqual((await kuyruguAl(o.env, "rkBaslat")).map((x) => x.kodlar), [["3394"]]);
  assert.ok(o.g.some((x) => /Hemra dağılımı yazınca repete kartı doğrudan Fuat'a gider$/.test(x.govde.text || x.govde.caption || "")));
  assert.ok(!patronaGiden(o).some((x) => /Fuat'a gidecek/.test(x.govde.text || "")));
});

test("13 Kasım (kural 6): 'Emin misiniz?' SADECE para (Pelin), silme (sil, kanal temizliği) ve fabrika (Fuat / Nuri / Sinem / Celal'e mesaj, mutabakat); iç mesaj, imza, renk, site taslağı sorulmadan yapılır", async () => {
  const { eminGerek } = await import("./venom-bot.js");
  for (const is of [{ tur: "pelin" }, { tur: "sil" }, { tur: "temizlik" }, { tur: "mutabakat" }, { tur: "mesaj", kime: "fuat" }, { tur: "mesaj", kime: "Nuri" }, { tur: "mesaj", kime: "sinem" }, { tur: "mesaj", kime: "celal" }]) assert.equal(eminGerek(is), true, JSON.stringify(is));
  for (const is of [{ tur: "imzaDuzelt" }, { tur: "siteDuzelt" }, { tur: "selinTaslak" }, { tur: "geriAl" }, { tur: "mesaj", kime: "hemra" }, { tur: "mesaj", kime: "merdan" }, { tur: "mesaj", kime: "aziz" }, { tur: "mesaj" }, null]) assert.equal(eminGerek(is), false, JSON.stringify(is));
  // canlı düğme: imza düzeltme kartında ✅ Onayla → "Emin misiniz?" SORULMAZ, iş hemen çalışır
  const o = ortam();
  const simdi = Math.floor(Date.now() / 1000);
  o.depo.set("venom:bot:is:imz1", JSON.stringify({ id: "imz1", tur: "imzaDuzelt", liste: [], metin: "imza düzelt", durum: "bekliyor", zaman: simdi }));
  await bas(o, "vb:o:imz1");
  assert.equal(patronaGiden(o).filter((x) => /Emin misiniz/.test(x.govde.text)).length, 0);
  assert.notEqual(JSON.parse(o.depo.get("venom:bot:is:imz1")).durum, "bekliyor");
  assert.notEqual(JSON.parse(o.depo.get("venom:bot:is:imz1")).durum, "emin");
  // silme kartında ✅ Onayla → "Emin misiniz?" bir kez sorulur, Evet'e basılmadan çalışmaz
  o.depo.set("venom:bot:is:sil1", JSON.stringify({ id: "sil1", tur: "sil", kod: "3999", metin: "3999 sil", durum: "bekliyor", zaman: simdi }));
  await bas(o, "vb:o:sil1");
  assert.equal(patronaGiden(o).filter((x) => x.govde.text === "⚠️ Emin misiniz?").length, 1);
  assert.equal(JSON.parse(o.depo.get("venom:bot:is:sil1")).durum, "emin");
});

test("13 Kasım (kural 7 ve 66): model kartındaki 'Pelin video' düğmesi, Patron'un son mesajında 'Pelin' yazmıyorsa Pelin'e HİÇBİR ŞEY göndermez; yazıyorsa maliyet kartı yoluna gider", async () => {
  const o = ortam();
  const giden = [];
  o.env.PELIN_W = { mesaj: async (m) => { giden.push(m); return true; } };
  const simdi = Math.floor(Date.now() / 1000);
  // 1) son mesaj kaydı yok
  await bas(o, "vmk:v:3627");
  assert.equal(giden.length, 0);
  assert.equal(patronaGiden(o).at(-1).govde.text, "🎬 3627: Pelin sadece mesajda \"Pelin\" yazınca çalışır. Yazın: Pelin 3627 video");
  // 2) son mesajda "Pelin" yok ("video" kelimesi Pelin demek değildir) — 5 farklı yazılış
  for (const metin of ["3627 video", "3627 için yeni fotoğraf çek", "3627 stok", "bu modelin videosu lazım", "/3627 foto video"]) {
    o.depo.set("venom:sonPatronMetni", JSON.stringify({ metin, zaman: simdi }));
    await bas(o, "vmk:v:3627");
    assert.equal(giden.length, 0, metin);
  }
  // 3) "Pelin" yazıyor ama 1 saatten eski → çalışmaz
  o.depo.set("venom:sonPatronMetni", JSON.stringify({ metin: "Pelin 3627 video", zaman: simdi - 2 * 3600 }));
  await bas(o, "vmk:v:3627");
  assert.equal(giden.length, 0);
  // 4) son mesajda "Pelin" var → Pelin'e üretim isteği (önce maliyet kartı; para onaysız harcanmaz)
  for (const metin of ["Pelin 3627 video", "pelin bu modele video yapsın", "3627 PELİN", "PELIN 3627", "/pelin 3627 video"]) {
    giden.length = 0;
    o.depo.set("venom:sonPatronMetni", JSON.stringify({ metin, zaman: simdi - 60 }));
    await bas(o, "vmk:v:3627");
    assert.deepEqual(giden, ["/uret 3627"], metin);
  }
  assert.match(patronaGiden(o).at(-1).govde.text, /🎬 3627 → Pelin\. Önce maliyet kartı gelecek; onaylamadan para harcanmaz\./);
});

test("13 Kasım DENEME MODU (Venom, kural 40): 'deneme başlıyor' → mod açılır; 'deneme bitti' → Sami'ye sessiz kapatma işi; Patron kartları 🧪 satırıyla başlar ve 'karar bekleyenler'e girmez; kuru denemede hiçbir şey değişmez", async () => {
  const { aracCalistir, rkKartMetni, bittiKartMetni } = await import("./venom-bot.js");
  const M = await import("./deneme-modu.js");
  const o = ortam();
  const t = ist(13, 0);
  // kuru deneme (kabul testi): mod açılmaz
  o.env.__kuru = true;
  assert.match(await aracCalistir(o.env, "deneme_modu", { islem: "basla" }, t), /^\(DENEME: "deneme_modu" gerçekte çalışırdı/);
  assert.equal(await M.modAcik(o.env), false);
  delete o.env.__kuru;
  assert.match(await aracCalistir(o.env, "deneme_modu", { islem: "bitir" }, t), /Deneme modu açık değildi/);
  assert.match(await aracCalistir(o.env, "deneme_modu", { islem: "basla" }, t), /^🧪 Deneme modu açıldı\. Bundan sonra başlatılan özel liste ve repete kayıtları deneme sayılır: kartların başında "🧪 DENEME" yazar; rapora, ciroya ve hatırlatmaya girmez\. "deneme bitti" deyince hepsi tek seferde kapanır\.$/);
  assert.deepEqual(await M.modOku(o.env), { basla: t, kim: "Patron" });
  assert.match(await aracCalistir(o.env, "deneme_modu", { islem: "basla" }, t + 60), /zaten açık/);
  o.depo.set("sami:islemler", JSON.stringify([{ tur: "listeDurum" }]));
  assert.match(await aracCalistir(o.env, "deneme_modu", { islem: "bitir" }, t + 600), /^🧪 Deneme bitti .*Deneme kayıtları birkaç dakika içinde sessizce kapanır; kaç kayıt kapandığı tek satırla yazılacak\. Kimseye mesaj gitmez\.$/);
  assert.equal(await M.modAcik(o.env), false);
  assert.deepEqual(JSON.parse(o.depo.get("sami:islemler")), [{ tur: "listeDurum" }, { tur: "denemeBitir" }]); // bekleyen iş silinmez, sona eklenir
  // Patron kartları: deneme modu kaydı → Patron onaylı 🧪 satırı
  const MOD = "🧪 DENEME — bu kart denemedir, gerçek sipariş değildir.\n";
  assert.ok(rkKartMetni({ mod: true, kod: "5074", magaza: "VOLONTE", dagilim: "siyah · büyük 40", adet: 40, uretici: "Celal", hemra: "Hemra" }).startsWith(`${MOD}🔁 REPETE — `));
  assert.ok(bittiKartMetni({ mod: true, kod: "5074", magaza: "VOLONTE", oneri: "repete", hemra: "Hemra", stok: "8 adet" }).startsWith(`${MOD}🏭 Fabrikada bitti`));
  assert.ok(!rkKartMetni({ kod: "5074", magaza: "VOLONTE", dagilim: "siyah · büyük 40", adet: 40, uretici: "Celal", hemra: "Hemra" }).includes("🧪"));
});

test("13 Kasım (TEK DEFTER — iş bitince kayıt kapanır): onaylanıp çalıştırılan Patron kartı 'yapiliyor'da takılı kalmaz; takibi biten 'bitti', 24 saatte kapanışı gelmeyen 'eskidi'; bekleyen karta dokunulmaz", async () => {
  const { kartKapanisAdimi } = await import("./venom-bot.js");
  const o = ortam();
  const t = ist(13, 12);
  const is = (id, x) => o.depo.set(`venom:bot:is:${id}`, JSON.stringify({ id, metin: id, zaman: t - 7200, ...x }));
  is("a1", { tur: "siteDuzelt", durum: "yapiliyor", onayZaman: t - 700 }); // takipsiz iş: bota verildi → bitti
  is("a2", { tur: "siteDuzelt", durum: "yapiliyor", onayZaman: t - 60 }); // az önce onaylandı → bekler
  is("b1", { tur: "mesaj", kime: "fuat", durum: "yapiliyor", onayZaman: t - 3600 }); // takipli, sözü açık → bekler
  is("b2", { tur: "mesaj", kime: "fuat", durum: "yapiliyor", onayZaman: t - 3600 }); // sözü bitti → bitti
  is("b3", { tur: "mutabakat", durum: "yapiliyor", onayZaman: t - 2 * 86400 }); // 24 saatte kapanış yok → eskidi
  is("c1", { tur: "sil", kod: "3999", durum: "bekliyor" }); // Patron henüz basmadı → dokunulmaz
  o.depo.set("venom:sozler", JSON.stringify([{ tur: "mesaj", id: "b1", zaman: t - 3600 }, { tur: "mesaj", id: "b2", zaman: t - 3600, bitti: t - 60 }]));
  const k = await kartKapanisAdimi(o.env, t);
  assert.deepEqual(k.sort((x, y) => x.id.localeCompare(y.id)), [{ id: "a1", tur: "siteDuzelt", durum: "bitti" }, { id: "b2", tur: "mesaj", durum: "bitti" }, { id: "b3", tur: "mutabakat", durum: "eskidi" }]);
  const d = (id) => JSON.parse(o.depo.get(`venom:bot:is:${id}`)).durum;
  assert.deepEqual(["a1", "a2", "b1", "b2", "b3", "c1"].map(d), ["bitti", "yapiliyor", "yapiliyor", "bitti", "eskidi", "bekliyor"]);
  assert.equal(patronaGiden(o).length, 0); // kapanış sessizdir
});

test("13 Kasım (Patron) BİTMİŞ MODEL KARTI: stoğu 0 olan modelde sadece 'Repete al' — 'Kanalda paylaş' ve 'Pelin video' yok; stoğu olan modelde üç düğme; kaydı olmayan model bitmiş sayılmaz; eski karttaki düğme de çalışmaz", async () => {
  const { kartDugmeleri, stokBitti } = await import("./venom-model.js");
  for (const [stok, beklenen] of [[{ VOLONTE: 0 }, true], [{ VOLONTE: 0, BLACKROSE: 0 }, true], [{ VOLONTE: -2 }, true], [{ VOLONTE: 0, BLACKROSE: 3 }, false], [{ VOLONTE: 5 }, false], [{}, false]]) assert.equal(stokBitti({ stok }), beklenen, JSON.stringify(stok));
  assert.equal(stokBitti(null), false);
  assert.deepEqual(kartDugmeleri("3700", "", true).flat().map((d) => d.text), ["🔁 Repete al"]);
  assert.deepEqual(kartDugmeleri("3700", "2· ", true).flat().map((d) => [d.text, d.callback_data]), [["2· 🔁 Repete al", "vmk:r:3700"]]);
  assert.deepEqual(kartDugmeleri("3700").flat().map((d) => d.text), ["📣 Kanalda paylaş", "🔁 Repete al", "🎬 Pelin video"]);
});

test("13 Kasım (Patron) VENOM — iki yeni yetenek: 'iki mağazanın stoğunu ver' (model kodu sormadan tek özet) ve 'eksik listesi kartını göster' (fabrikaya giden son kartın aynısı, düğmeler sadece görüntü); Celal listesi tamdır", async () => {
  const { aracCalistir } = await import("./venom-bot.js");
  const o = ortam();
  const t = ist(13, 17, 0);
  const stokYaz = (yol, g) => o.env.STOK.get().fetch(`https://stok/${yol}`, { method: "POST", body: JSON.stringify(g) });
  await stokYaz("yaz", { magaza: "VOLONTE", urunler: [{ kod: "3394", adet: 44, fiyat: 30 }, { kod: "5068", adet: 4, fiyat: 20, celal: true }], simdi: t - 7200 });
  await stokYaz("yaz", { magaza: "BLACKROSE", urunler: [{ kod: "3534", adet: 10, fiyat: 40 }], simdi: t - 7200 });
  const oz = await aracCalistir(o.env, "magaza_stok_ozeti", {}, t);
  assert.match(oz, /^📦 Mağaza stoğu — Vegawin \(13\.11 17:00\)\nVOLONTE: stokta 2 model · toplam 48 adet\n {3}bugün biten 0 · bugün gelen 0\nBlack Rose: stokta 1 model · toplam 10 adet\n {3}bugün biten 0 · bugün gelen 0/);
  assert.ok(oz.split("\n").length <= 8 && !/\$/.test(oz));
  assert.match(await aracCalistir(o.env, "celal_modelleri", {}, t), /^Celal'in Vegawin'deki modelleri \(8\): .*Vegawin'de bunların dışında Celal modeli yok/);
  // eksik listesi kartı: Sami'den okunur, Patron'a AYNI yazı + görüntü düğmeleriyle gider
  const kart = { ok: true, gun: "2026-11-12", zaman: ist(12, 20, 5), kisiler: ["Sinem", "Nuri", "Fuat"], yazi: "🟦 VOLONTE\n3607 · Küçük (38-44) · kahve 4", dugmeler: [["✅ Gelecek", "🔁 Repete olacak"], ["❌ Bitti, gelmeyecek"]], resim: false, kod: "3607", kartSayisi: 4 };
  const istenen = [];
  o.env.SAMI_W = { eksikKarti: async (gun) => { istenen.push(gun); return gun === "2026-11-01" ? { ok: false, neden: "01.11.2026 günü fabrikaya giden eksik listesi kartı yok" } : kart; } };
  const c = await aracCalistir(o.env, "eksik_listesi_karti", {}, t);
  const giden = patronaGiden(o).at(-1).govde;
  assert.equal(giden.text, kart.yazi);
  assert.deepEqual(giden.reply_markup.inline_keyboard.map((s) => s.map((b) => [b.text, b.callback_data])), [[["✅ Gelecek", "gz:-"], ["🔁 Repete olacak", "gz:-"]], [["❌ Bitti, gelmeyecek", "gz:-"]]]);
  assert.equal(c, "KART GÖSTERİLDİ. Patron'a sadece şunu yaz: Yukarıdaki kart 12.11 20:05'te Sinem, Nuri, Fuat hesabına giden son eksik listesi kartıdır (o listede 4 kart). Düğmeler sadece görüntüdür.");
  // tarih: dün / belirli gün / kart yok
  await aracCalistir(o.env, "eksik_listesi_karti", { gun: "dun" }, t);
  assert.deepEqual(istenen, [null, "2026-11-12"]);
  assert.equal(await aracCalistir(o.env, "eksik_listesi_karti", { gun: "2026-11-01" }, t), "Kart yok: 01.11.2026 günü fabrikaya giden eksik listesi kartı yok.");
  // görüntü düğmesine basılırsa hiçbir şey olmaz
  const n = patronaGiden(o).length;
  await bas(o, "gz:-");
  assert.equal(patronaGiden(o).length, n);
  assert.equal(o.g.filter((x) => x.metod === "answerCallbackQuery").at(-1).govde.text, "Bu kart sadece görüntü; düğmeleri basılamaz.");
  // kuru denemede kart gitmez, yazısı araç sonucunda görünür
  o.env.__kuru = true;
  const n2 = patronaGiden(o).length;
  assert.match(await aracCalistir(o.env, "eksik_listesi_karti", {}, t), /^\(DENEME: kart Patron'a gösterilirdi\.\) KART YAZISI:\n🟦 VOLONTE\n3607 · Küçük \(38-44\) · kahve 4\nDÜĞMELER: \[✅ Gelecek\] \[🔁 Repete olacak\] \/ \[❌ Bitti, gelmeyecek\]/);
  assert.equal(patronaGiden(o).length, n2);
});

test("13 Kasım (Patron) KEMAL'İ ÇALIŞTIR — Venom tarafı: komut Kemal'e gider, Patron'a TEK satır döner; süre verilirse Kemal'e iletilir; saat dışı / öneri yok / ulaşılamadı halleri açık yazılır; deneme sorusunda Kemal çalışmaz", async () => {
  const { aracCalistir } = await import("./venom-bot.js");
  const o = ortam();
  const t = ist(13, 15, 0);
  const gelen = [];
  let cevap = { ok: true, n: 10, kodlar: ["3254", "3360"], enEski: { kod: "3254", gun: 34 }, enAzGun: 0 };
  o.env.KEMAL_W = { ...(o.env.KEMAL_W || {}), calistir: async (g) => { gelen.push(g); return cevap; } };
  assert.equal(await aracCalistir(o.env, "kemal_calistir", {}, t), "Kemal çalıştı: 10 model Hemra'nın onayında (en eskisi 3254, 34 gün önce).");
  assert.deepEqual(gelen[0], { enAzGun: 0 });
  await aracCalistir(o.env, "kemal_calistir", { en_az_gun: 30 }, t);
  assert.deepEqual(gelen[1], { enAzGun: 30 }); // "1 aydan beri paylaşılmayanları getir"
  cevap = { ok: true, n: 2, kodlar: ["3501", "3502"], enEski: { kod: "3501", gun: null } };
  assert.equal(await aracCalistir(o.env, "kemal_calistir", {}, t), "Kemal çalıştı: 2 model Hemra'nın onayında (en eskisi 3501, hiç paylaşılmamış).");
  cevap = { ok: true, planlandi: true, enAzGun: 0 };
  assert.match(await aracCalistir(o.env, "kemal_calistir", {}, t), /^Kemal şu an paylaşım saati dışında \(09:00–21:00\); istek sabah 09:00 turuna planlandı\.$/);
  cevap = { ok: true, n: 0, neden: "bugün için yer kalmadı" };
  assert.equal(await aracCalistir(o.env, "kemal_calistir", {}, t), "Kemal çalıştı ama öneri çıkmadı — sebep: bugün için yer kalmadı.");
  cevap = { ok: false, hata: "Kemal durdurulmuş" };
  assert.equal(await aracCalistir(o.env, "kemal_calistir", {}, t), "Kemal çalışamadı: Kemal durdurulmuş.");
  o.env.KEMAL_W = { ...o.env.KEMAL_W, calistir: async () => { throw new Error("yok"); } };
  assert.equal(await aracCalistir(o.env, "kemal_calistir", {}, t), "Kemal çalışamadı: Kemal'e ulaşılamadı.");
});

test("13 Kasım (Patron) İŞ BEKÇİSİ — saf mantık: Kemal'in beklenen paylaşımı (~saatte 1), sebep sırası (sıra / onay / öneri yok), Selin'de cevapsız kalan sorun değil, Sami'de dünkü liste", async () => {
  const { kemalBeklenen, kemalBak, selinBak, samiBak, patronSatiri, eksikYazi, BEKCI_SAATLERI } = await import("./is-bekcisi.js");
  assert.deepEqual(BEKCI_SAATLERI, [11, 15, 19]);
  assert.deepEqual([9, 11, 15, 19, 21].map(kemalBeklenen), [1, 2, 6, 10, 12]);
  const gun = "2026-11-14", simdi = ist(14, 15, 0);
  const oz = (x) => ({ tur: { gun, soruldu: 5, bekleyen: [], ...(x.tur || {}) }, kuyruk: [], bugunKanal: 0, sonPaylasim: simdi - 3600, ...x, ...(x.tur ? { tur: { gun, soruldu: 5, bekleyen: [], ...x.tur } } : {}) });
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 5 }), gun, s: 15, simdi }).ok, true); // 6 beklenir, 5 yeter (onay ekibe bağlı)
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 4 }), gun, s: 15, simdi }).ok, true);
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 3 }), gun, s: 15, simdi }).ok, false);
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 0 }), gun, s: 11, simdi }).ok, false);
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 1 }), gun, s: 11, simdi }).ok, true);
  // sebep sırası
  assert.deepEqual((({ cozum, sebep }) => ({ cozum, sebep }))(kemalBak({ ozet: oz({ bugunKanal: 2, kuyruk: ["3254", "3360"] }), gun, s: 15, simdi })), { cozum: "bekle", sebep: "onaylanan 2 model sırada, 60 dakika arayla çıkıyor" });
  assert.match(kemalBak({ ozet: oz({ bugunKanal: 2, kuyruk: ["3254"], sonPaylasim: simdi - 3 * 3600 }), gun, s: 15, simdi }).sebep, /sırada ama 2 saattir kanala çıkmadı/);
  const onay = kemalBak({ ozet: oz({ bugunKanal: 2, tur: { bekleyen: ["3360", "3477", "3573"] } }), gun, s: 15, simdi });
  assert.deepEqual([onay.cozum, onay.sebep], ["hatirlat", "3 öneri kartı Hemra / Merdan'ın onayında bekliyor"]);
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 2, tur: { bekleyen: ["3360"] } }), gun, s: 15, simdi, onceHatirlatti: true }).cozum, null); // hatırlatma yapıldı, yine cevap yok → Patron
  assert.equal(kemalBak({ ozet: oz({ bugunKanal: 2, tur: { bekleyen: ["3360"] } }), gun, s: 15, simdi, mesai: false }).cozum, "bekle"); // pazar: ekibe yazılmaz
  const yok = kemalBak({ ozet: oz({ bugunKanal: 3 }), gun, s: 15, simdi });
  assert.deepEqual([yok.cozum, yok.sebep], ["calistir", "öneri kalmadı (bugün 5 model soruldu, hepsi cevaplandı)"]);
  assert.equal(patronSatiri("kemal", { cikan: 0, beklenen: 6, sebep: "Kemal'e ulaşılamadı", oneri: "Claude Code baksın" }), "Kemal bugün 0 paylaşım (bu saate kadar ~6 beklenirdi) — sebep: Kemal'e ulaşılamadı — önerim: Claude Code baksın.");
  assert.equal(eksikYazi("kemal", yok), "Kemal 3 paylaşım (beklenen ~6): öneri kalmadı (bugün 5 model soruldu, hepsi cevaplandı)");
  // Selin
  assert.equal(selinBak({ ozet: { bugunListe: { n: 18, gelen: 0 } }, s: 11 }).ok, true); // cevap gelmemesi sorun değil (kural 59)
  assert.equal(selinBak({ ozet: { bugunListe: { n: 18, gelen: 5 } }, s: 15 }).bilgi, "fotoğraf listesi gitti (18 model), 5 modelin fotoğrafı geldi");
  assert.equal(selinBak({ ozet: { bugunListe: { n: 0 } }, s: 11 }).ok, true);
  assert.equal(selinBak({ ozet: { bugunListe: null }, s: 11 }).ok, false);
  assert.equal(selinBak({ ozet: { bugunListe: null }, s: 9.5 }).ok, true); // 10:00'dan önce beklenmez
  assert.equal(selinBak({ ozet: null, s: 11 }).sebep, "Selin'e ulaşılamadı");
  // Sami
  assert.equal(samiBak({ dun: { mesai: true, listeler: [{ ad: "VOLONTE", asama: "gonderildi", model: 4 }], giden: 8, satis: { VOLONTE: 30 } }, s: 11 }).bilgi, "dünkü eksik listesi fabrikaya gitti (8 model)");
  const bek = samiBak({ dun: { mesai: true, listeler: [{ ad: "Black Rose", asama: "onayda", model: 4 }], giden: 0, satis: {} }, s: 11 });
  assert.deepEqual([bek.ok, bek.cozum, bek.sebep], [false, "merdiven", "dünkü eksik listesi hâlâ Hemra'da (Black Rose 4 model)"]);
  assert.equal(samiBak({ dun: { mesai: true, listeler: [], giden: 0, satis: { VOLONTE: 0, BLACKROSE: 0 } }, s: 11 }).sebep, "dün satış girilmedi, eksik listesi çıkmadı");
  assert.equal(samiBak({ dun: { mesai: true, listeler: [], giden: 0, satis: { VOLONTE: 12 } }, s: 11 }).ok, true);
});

test("13 Kasım (Patron) İŞ BEKÇİSİ — Venom: 11/15/19'da bakar; önce kendisi çözer (hatırlatma / Kemal'i çalıştırma), çözemezse Patron'a TEK satır (aynı sebep günde bir kez); sessiz günde hiçbir şey gitmez; rapor '✅ Her şey çalışıyor'u sadece iş de tamamsa yazar", async () => {
  const v = await import("./venom-bot.js");
  const kur = (kemal, selin = { bugunListe: { n: 18, gelen: 3 } }) => {
    const o = ortam();
    const cagri = [];
    o.cagri = cagri; o.kemal = kemal;
    o.env.KEMAL_W = { ozet: async () => o.kemal.ozet, hatirlat: async () => { cagri.push("hatirlat"); return o.kemal.hatirlat || { ok: true, n: 0 }; }, calistir: async (g) => { cagri.push("calistir"); return o.kemal.calistir || { ok: true, n: 0, neden: "uygun model yok" }; } };
    o.env.SELIN_W = { ozet: async () => selin };
    return o;
  };
  const stokYaz = (o, yol, g) => o.env.STOK.get().fetch(`https://stok/${yol}`, { method: "POST", body: JSON.stringify(g) });
  const gun = "2026-11-14"; // cumartesi (mesai var); dün = cuma
  const ozet = (x = {}) => ({ tur: { gun, soruldu: 6, bekleyen: [] }, kuyruk: [], bugunKanal: 6, sonPaylasim: ist(14, 14, 10), ...x });
  const dunTamam = async (o) => { await stokYaz(o, "ayar-yaz", { k: "fabrika:2026-11-13", v: JSON.stringify({ asama: "gonderildi", modeller: [{ kod: "3607" }] }) }); await stokYaz(o, "yaz", { magaza: "VOLONTE", urunler: [{ kod: "3394", adet: 44, fiyat: 30 }], simdi: ist(13, 10) }); };
  // 1) her şey tamam → kimseye bir şey gitmez; kayıt düşer; rapor "✅ Her şey çalışıyor"
  let o = kur({ ozet: ozet() });
  await dunTamam(o);
  await stokYaz(o, "ayar-yaz", { k: "fabrika:fabrikayaGiden:2026-11-13", v: JSON.stringify({ VOLONTE: ["3607"], BLACKROSE: [] }) });
  let k = await v.isBekcisi(o.env, ist(14, 15, 2));
  assert.equal(k.kemal.ok, true); assert.equal(k.selin.ok, true);
  assert.equal(patronaGiden(o).length, 0); assert.deepEqual(o.cagri, []);
  assert.ok(JSON.parse(o.depo.get(`venom:isBekcisi:${gun}`))["15"]);
  // 2) onay bekleyen kart → Venom hatırlatır, Patron'a yazmaz; sonraki kontrolde hâlâ bekliyorsa Patron'a TEK satır; üçüncüde tekrar yazmaz
  o = kur({ ozet: ozet({ bugunKanal: 0, tur: { gun, soruldu: 3, bekleyen: ["3360", "3477", "3573"] } }), hatirlat: { ok: true, n: 3, kisi: 2 } });
  k = await v.isBekcisi(o.env, ist(14, 11, 2));
  assert.deepEqual(o.cagri, ["hatirlat"]); assert.equal(k.kemal.cozuldu, "onay bekleyen 3 karta hatırlatma gitti");
  assert.equal(patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text)).length, 0);
  k = await v.isBekcisi(o.env, ist(14, 15, 2));
  assert.deepEqual(o.cagri, ["hatirlat"]); // ikinci kez hatırlatmaz
  const p2 = patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text));
  assert.equal(p2.length, 1);
  assert.match(p2[0].govde.text, /Kemal bugün 0 paylaşım \(bu saate kadar ~6 beklenirdi\) — sebep: 3 öneri kartı Hemra \/ Merdan'ın onayında bekliyor, hatırlatma yapıldı ama cevap gelmedi — önerim: Hemra'yı arayın\./);
  await v.isBekcisi(o.env, ist(14, 19, 2));
  assert.equal(patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text)).length, 1); // aynı sebep günde bir kez
  // 3) öneri kalmadı → Venom Kemal'i çalıştırır; model çıkarsa Patron'a yazmaz ("Venom kendi çözdü"ye girer)
  o = kur({ ozet: ozet({ bugunKanal: 3 }), calistir: { ok: true, n: 4, kodlar: ["3254", "3360", "3477", "3573"], enEski: { kod: "3254", gun: 34 } } });
  k = await v.isBekcisi(o.env, ist(14, 15, 2));
  assert.deepEqual(o.cagri, ["calistir"]);
  assert.equal(k.kemal.cozuldu, "Kemal'i çalıştırdım: 4 yeni model Hemra'nın onayına gitti");
  assert.equal(patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text)).length, 0);
  assert.match(o.depo.get(`venom:cozdum:${gun}`), /Kemal'in önerisi kalmamıştı, çalıştırdım \(4 model onayda\)/);
  // 4) çalıştırdı ama model çıkmadı → Patron'a tek satır (sebep + öneri)
  o = kur({ ozet: ozet({ bugunKanal: 3 }), calistir: { ok: true, n: 0, neden: "stokta olup fotoğrafı olan ve 7 gündür paylaşılmamış model kalmadı" } });
  await v.isBekcisi(o.env, ist(14, 15, 2));
  const p4 = patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text));
  assert.equal(p4.length, 1);
  assert.match(p4[0].govde.text, /^[^\n]*Kemal bugün 3 paylaşım \(bu saate kadar ~6 beklenirdi\) — sebep: öneri kalmadı \(bugün 6 model soruldu, hepsi cevaplandı\); Kemal'i çalıştırdım, yeni öneri çıkmadı \(stokta olup fotoğrafı olan ve 7 gündür paylaşılmamış model kalmadı\) — önerim: yeni fotoğraf gelmesi gerekiyor \(Merdan'ın fotoğraf listesi\)\./);
  // rapor: iş eksikse "Her şey çalışıyor" YAZMAZ
  const r4 = (await v.raporSatirlari(o.env, ist(14, 20, 0), "aksam")).split("\n")[1];
  assert.match(r4, /^(🟠 Botlar ayakta ama iş eksik: Kemal 3 paylaşım \(beklenen ~6\): öneri kalmadı|🔴 \d+ sorun var: .* · iş eksik: Kemal 3 paylaşım)/);
  // 5) sessiz gün (yükleme günü): hesaplar, kaydeder; hatırlatma / çalıştırma / Patron mesajı YOK
  o = kur({ ozet: ozet({ bugunKanal: 0 }) });
  o.depo.set("venom:isBekcisi:sessiz", JSON.stringify(gun));
  k = await v.isBekcisi(o.env, ist(14, 15, 2));
  assert.deepEqual(o.cagri, []); assert.equal(patronaGiden(o).length, 0);
  assert.equal(k.kemal.ok, false); assert.ok(k.patron);
  // 6) kuru (sohbet / rapor): hiçbir şey göndermez, kaydetmez; "is_kontrolu" aracı her botu tek satır yazar
  o = kur({ ozet: ozet({ bugunKanal: 5, tur: { gun, soruldu: 8, bekleyen: ["3360"] }, kuyruk: ["3254"] }) });
  const m = await v.aracCalistir(o.env, "is_kontrolu", {}, ist(14, 15, 2));
  assert.match(m, /^🛡 İş kontrolü \(15:02\)\n✅ Kemal: 5 paylaşım \(bu saate kadar ~6 beklenir\), 1 kart onayda, 1 model sırada\n✅ Selin: fotoğraf listesi gitti \(18 model\), 3 modelin fotoğrafı geldi\n/);
  assert.deepEqual(o.cagri, []); assert.equal(patronaGiden(o).length, 0); assert.equal(o.depo.has(`venom:isBekcisi:${gun}`), false);
  // 5 dakikalık görev: 11:00–11:30 penceresinde BİR kez çalışır (kayıt varsa tekrar etmez); saat dışında çalışmaz
  o = kur({ ozet: ozet({ bugunKanal: 2 }) });
  await dunTamam(o);
  await v.venomCron(o.env, ist(14, 10, 40));
  assert.equal(o.depo.has(`venom:isBekcisi:${gun}`), false);
  await v.venomCron(o.env, ist(14, 11, 5));
  const ilk = JSON.parse(o.depo.get(`venom:isBekcisi:${gun}`))["11"].zaman;
  await v.venomCron(o.env, ist(14, 11, 10));
  assert.equal(JSON.parse(o.depo.get(`venom:isBekcisi:${gun}`))["11"].zaman, ilk);
  // 7) durdurulan bot için bekçi yazmaz (durdurma Patron'un kendi kararı; raporda zaten "durduruldu" yazar)
  o = kur({ ozet: ozet({ bugunKanal: 0 }) });
  o.depo.set("venom:dur", JSON.stringify({ kemal: { zaman: 1 } }));
  k = await v.isBekcisi(o.env, ist(14, 15, 2));
  assert.equal(k.kemal.durdu, true); assert.deepEqual(o.cagri, []);
  assert.equal(patronaGiden(o).filter((x) => /Kemal bugün/.test(x.govde.text)).length, 0);
});
