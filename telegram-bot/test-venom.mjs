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
  // 9 Kasım (postane): "gitti" bilgisi Patron'a anında GİTMEZ, Venom'da birikir (akşam özetinde sayı)
  assert.ok(!patronaGiden(o).some((x) => /Mesaj Fuat'a gitti/.test(x.govde.text)));
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
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /duraklatıldı/);
  o.env.__patronMetni = "3557 için video üret";
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /kurulum yapılmamış/);
  const sc = JSON.stringify({ yuz: { anahtar: "a", manken: 0 }, ortamlar: [{ ad: "retro", sahne: "x", hareket: "y" }], arac: "veo" });
  o.depo.set("pelin:secim", sc); o.depo.set("venom:pelinSecim", sc); // Pelin'in kendi kaydı + Venom'un aynası
  assert.match(await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557"], test: true }, ist(3, 12)), /3557 için boy kayıtlı değil/);
  for (const k of ["3557", "3592"]) o.depo.set(`pelinboy:${k}`, JSON.stringify({ boy: "bilek" }));
  await aracCalistir(o.env, "pelin_uret", { kodlar: ["3557", "3592", "abc"], test: true }, ist(3, 12));
  const kart = sonKart(o);
  assert.match(kart.govde.text, /Boy: 3557 bilek \(ayakkabı görünür, etek yere değmez\), 3592 bilek/);
  assert.match(kart.govde.text, /MALİYET TESTİ — 2 model: 3557, 3592\n[\s\S]*Model başı ~[\d,]+ \$ · toplam ~[\d,]+ \$[\s\S]*Bu ay Pelin: 0,00 \$ \/ 150 \$/);
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
  assert.ok(sabah[0].govde.text.split("\n").length <= 15); // 9 Kasım: tek mesaj, en fazla 15 satır
  await venomCron(o.env, ist(3, 20, 1));
  await venomCron(o.env, ist(3, 20, 6));
  const aksam = patronaGiden(o).filter((x) => /Günün özeti/.test(x.govde.text));
  assert.equal(aksam.length, 1);
  assert.match(aksam[0].govde.text, /Bugün Venom üzerinden iş yapılmadı/);
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

test("harcama (4 Kasım): her Claude cevabı kaydedilir; %80'de bir kez uyarı; tavan dolunca sohbet durur (Claude çağrılmaz); varsayılan tavan 30 $", async () => {
  const o = ortam();
  const { venomHarcanan, venomSinir, VENOM_SINIR_VARSAYILAN } = await import("./venom-bot.js");
  assert.equal(VENOM_SINIR_VARSAYILAN, 30);
  assert.equal(await venomSinir(o.env), 30);
  await yazi(o, PATRON, "merhaba");
  const h1 = await venomHarcanan(o.env, Math.floor(Date.now() / 1000));
  assert.ok(h1 > 0 && h1 < 0.01, String(h1)); // 10 giriş + 5 çıkış token
  const ay = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 7);
  o.depo.set(`venom-harcama:${ay}`, "24.5");
  await yazi(o, PATRON, "devam");
  assert.ok(patronaGiden(o).some((x) => /Venom bu ay 24,50 \$ yapay zekâ harcadı \(aylık sınır 30 \$, %80\)/.test(x.govde.text)));
  await yazi(o, PATRON, "bir daha");
  assert.equal(patronaGiden(o).filter((x) => /%80/.test(x.govde.text)).length, 1); // bir kez
  o.depo.set(`venom-harcama:${ay}`, "30");
  const n = o.claude.length;
  await yazi(o, PATRON, "3557 için yorum yap"); // (9 Kasım: "stok 3557" ücretsiz model kartıdır, sınırdan etkilenmez)
  assert.equal(o.claude.length, n);
  assert.match(patronaGiden(o).at(-1).govde.text, /Venom yapay zekâ sınırı \(30 \$\) doldu/);
  o.depo.set("venom:bot:sinir", "50");
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
  // 6 Kasım: kod + renk + "kanala" → Claude'suz, soru sormadan; tek satır "Anladım"
  await guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: "P1" }], caption: "3627 bordo kanala hazırla" } }, o.env);
  assert.ok(patronaGiden(o).some((x) => /🧭 Anladım: 3627 bordo → Kemal'e paylaşım \(kanal \+ site\), alt yazı burgundy/.test(x.govde.text)));
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

test("SAĞLAMLAŞTIRMA (6 Kasım) — '3627 beyaz paylaş': soru sormadan, Claude'suz Kemal'e (renk Patron'un); kapalıyken DURAKLATILDI; renk yoksa tek soru + düğme; son set yeniden", async () => {
  const o = ortam();
  const foto = (fid, caption) => guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: fid }], ...(caption ? { caption } : {}) } }, o.env);
  // kapalı (varsayılan)
  await foto("F1", "3627 beyaz paylaş");
  assert.equal(o.claude.length, 0);
  assert.ok(patronaGiden(o).some((x) => /DURAKLATILDI/.test(x.govde.text)));
  // açık
  o.depo.set("venom:kemalPaylasAcik", "1");
  await foto("F2", "3627 beyaz büyük küçük paylaş");
  assert.equal(o.claude.length, 0);
  const b = JSON.parse(o.depo.get("venom:bot:paylasBekle"));
  assert.deepEqual([b.kod, b.renk, b.beden], ["3627", "beyaz", "i"]);
  o.depo.set("venom:bot:medya", JSON.stringify(JSON.parse(o.depo.get("venom:bot:medya")).map((m) => ({ ...m, zaman: 1 }))));
  await venomCron(o.env, 1793900000);
  const pp = await kuyruguAl(o.env, "patronPaylas");
  assert.equal(pp.length, 1);
  assert.deepEqual([pp[0].renk, pp[0].beden, pp[0].medya.length], ["beyaz", "i", 2]);
  assert.ok(patronaGiden(o).some((x) => /İLETİLDİ — 2 fotoğraf Kemal'e gitti · renk: beyaz · beden: İkisi de/.test(x.govde.text)));
  // renk yok → tek soru + düğme (model kartı rengi)
  o.depo.set("pelinboy:3627", JSON.stringify({ renk: "koyu bordo" }));
  await foto("F3", "3627 paylaş");
  const soru = sonKart(o);
  assert.match(soru.govde.text, /3627 hangi renk/);
  assert.equal(soru.govde.reply_markup.inline_keyboard[0][0].text, "koyu bordo (model kartı)");
  await bas(o, soru.govde.reply_markup.inline_keyboard[0][0].callback_data);
  assert.equal(JSON.parse(o.depo.get("venom:bot:paylasBekle")).renk, "koyu bordo");
  // reddedilen karttan sonra: dosya yok + "en son gönderdiğim set" → son set yeniden Kemal'e
  o.depo.delete("venom:bot:paylasBekle"); o.depo.delete("venom:bot:medya");
  await yazi(o, PATRON, "3627 beyaz en son gönderdiğim seti paylaş");
  const pp2 = await kuyruguAl(o.env, "patronPaylas");
  assert.equal(pp2.length, 1);
  assert.equal(pp2[0].medya.length, 2);
  assert.ok(patronaGiden(o).some((x) => /en son gönderdiğiniz set \(2 dosya\) yeniden Kemal'e gitti/.test(x.govde.text)));
});

test("SAĞLAMLAŞTIRMA (6 Kasım) — 'aracım yok' denmez: not alınır; 09:30 testi her botu dener; akşam raporunda tekrarlar ve hatalar", async () => {
  const o = ortam();
  o.cevaplar.push({ text: "Patron, bunu yapacak bir aracım yok." });
  await yazi(o, PATRON, "Selin'e Instagram'a da koysun de");
  const son = patronaGiden(o).at(-1).govde.text;
  assert.ok(!/aracım yok/.test(son) && /Not ettim/.test(son), son);
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
test("ANLAMA (6 Kasım, D8–D10): üretim / paylaş / açıklamasız dosya ayrımı; tek satır 'Anladım'; 'hayır' geri alır ve kaydeder; akşam raporunda anlamadıklarım", async () => {
  assert.deepEqual(uretNiyeti("3627 beyaz fotoğrafını yap"), { kod: "3627", renk: "beyaz" });
  assert.deepEqual(uretNiyeti("36 27 beyaz videosunu çek"), { kod: "3627", renk: "beyaz" });
  assert.equal(uretNiyeti("3627 beyaz paylaş"), null);
  assert.deepEqual(uretNiyeti("3627 beyaz üret"), { kod: "3627", renk: "beyaz" }); // Türkçe harfle başlayan kelime (eski \b hatası)
  assert.equal(paylasNiyeti("3627 beyaz paylaşalım mı"), null);
  assert.equal(uretNiyeti("3627 videosu ne zaman gelir?"), null);
  assert.deepEqual(kodRenk("3627 koyu bordo büyük"), { kod: "3627", renk: "koyu bordo", beden: "b" });
  const o = ortam();
  const pelinGiden = [];
  o.env.PELIN_W = { mesaj: async (m) => { pelinGiden.push(m); return true; } };
  await yazi(o, PATRON, "3627 beyaz videosunu yap");
  assert.deepEqual(pelinGiden, ["/uret 3627 beyaz"]);
  assert.equal(o.claude.length, 0);
  assert.ok(patronaGiden(o).some((x) => /🧭 Anladım: 3627 beyaz → Pelin'e fotoğraf \+ video üretimi/.test(x.govde.text)));
  // açıklamasız dosya → 3 düğme
  const foto = (fid) => guncelleme({ update_id: uid++, message: { message_id: 3, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, photo: [{ file_id: fid }] } }, o.env);
  await foto("Q1");
  const k = sonKart(o);
  assert.deepEqual(k.govde.reply_markup.inline_keyboard.flat().map((b) => b.text), ["🎬 Pelin kullansın", "📣 Paylaş", "💾 Sadece kaydet", "📦 Hangi model / stok?"]);
  await bas(o, k.govde.reply_markup.inline_keyboard[1][0].callback_data); // sadece kaydet
  assert.match(o.depo.get("venom:bot:kayitliMedya"), /Q1/);
  // Paylaş → kod + renk sorusu → "3627 beyaz" → paylaşım (kapalı: DURAKLATILDI ama anlama satırı var)
  await foto("Q2");
  await bas(o, sonKart(o).govde.reply_markup.inline_keyboard[0][1].callback_data);
  await yazi(o, PATRON, "3627 beyaz");
  assert.ok(patronaGiden(o).some((x) => /🧭 Anladım: 3627 beyaz → Kemal'e paylaşım/.test(x.govde.text)));
  // "hayır" → geri al + anlamadıklarım
  await yazi(o, PATRON, "hayır");
  assert.ok(patronaGiden(o).some((x) => /yanlış anlamışım/.test(x.govde.text)));
  const r = await sorunRaporu(o.env, Math.floor(Date.now() / 1000) + 10);
  assert.match(r, /🤔 Anlamadıklarım \(1\)/);
  assert.match(r, /"3627 beyaz" — yanlış anladım/);
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
  await yazi(o, PATRON, "hepsini aç");
  _durOnbellekSifirla();
  assert.equal(await durdurulduMu(o.env, "selin"), false);
  await yazi(o, PATRON, "Pelin'i durdur");
  _durOnbellekSifirla();
  assert.deepEqual([await durdurulduMu(o.env, "pelin"), await durdurulduMu(o.env, "kemal")], [true, false]);
  await yazi(o, PATRON, "pelini aç");
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
  await yazi(o, PATRON, "sesli rapor istiyorum");
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
  const { ORTAK_KURALLAR } = await import("./kurallar.js");
  const kv = new Map([["venom:markaKarar", JSON.stringify({ "3500": "BLACKROSE" })]]);
  const env = { KAYIT: { get: async (k, t) => (kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null) },
    STOK: { idFromName: () => 1, get: () => ({ fetch: async () => new Response(JSON.stringify({ satirlar: [{ magaza: "VOLONTE" }, { magaza: "BLACKROSE" }] })) }) } };
  assert.deepEqual(await markaKesin(env, "907"), { marka: "VOLONTE", kaynak: "Patron kararı" });
  assert.equal((await markaKesin(env, 3500)).marka, "BLACKROSE");
  assert.equal((await markaKesin(env, "3600")).marka, null); // karar yoksa yine "belirsiz" (tahmin yok)
  assert.equal(await markaKarari(env, "3600"), null);
  assert.match(ORTAK_KURALLAR, /13\. PATRON'UN KESİN MARKA KARARLARI[^\n]*907 = VOLONTE/);
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
  await guncelleme({ update_id: uid++, message: { message_id: 2, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, text: "bunu bana gönderme", reply_to_message: { message_id: kartId, text: "📝 3001 taslak silme onayı" } } }, o.env);
  assert.match(patronaGiden(o)[0].govde.text, /📝 Kalıcı kural kaydedildi: Selin · "rapor" mesajları|📝 Kalıcı kural kaydedildi: Selin/);
  assert.equal(o.claude.length, 0); // sohbete (Claude'a) gitmedi
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

test("9 Kasım: sabah 09:40 TEK özet ≤15 satır, sorunlar en üstte, biriken bilgi sayısı; /detay ayrıntıyı verir", async () => {
  const o = ortam();
  const v = await import("./venom-bot.js");
  o.depo.set("venom:posta:2026-11-03", JSON.stringify([{ zaman: ist(3, 2), kaynak: "kemal", kategori: "paylaşıldı", ozet: "✅ 3627 paylaşıldı" }, { zaman: ist(3, 3), kaynak: "kemal", kategori: "paylaşılamadı", ozet: "🛑 3557 kanala gitmedi" }]));
  o.depo.set("selin:hata", JSON.stringify({ zaman: ist(3, 8), hata: "GitHub 502" }));
  const m = await v.sabahOzeti(o.env, ist(3, 9, 40));
  const s = m.split("\n");
  assert.ok(s.length <= 15, m);
  assert.match(s[0], /^☀️ Günaydın Patron/);
  assert.match(m, /📨 Venom'da biriken 2 bilgi: 1 paylaşıldı · 1 paylaşılamadı/);
  assert.match(s.at(-1), /Ayrıntı: \/detay/);
  o.g.length = 0;
  await yazi(o, PATRON, "/detay");
  assert.match(patronaGiden(o)[0].govde.text, /Biriken bilgiler:[\s\S]*3557 kanala gitmedi/);
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

test("9 Kasım KISA MODEL KARTI: '3629 kaç adet var?' ve sesli '36 29' → tek mesaj: markalı fotoğraf + ≤6 satır (kendi mağazası, 7 gün, bitiş, fabrika) + düğmeler; fiyat/kâr yok", async () => {
  const { kodlariBul, modelSorusuMu, kartSatirlari } = await import("./venom-model.js");
  assert.deepEqual(kodlariBul("36 29 kaç adet var"), ["3629"]);
  assert.deepEqual(modelSorusuMu("3629 kaç adet var?"), ["3629"]);
  assert.deepEqual(modelSorusuMu("3629"), ["3629"]);
  assert.equal(modelSorusuMu("3629 paylaş"), null);
  assert.equal(modelSorusuMu("3627 beyaz"), null);
  const o = ortam();
  await o.ayar("x", 1);
  await o.stok.fetch(new Request("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod: "3629", adet: 11, fiyat: 40 }], simdi: ist(9, 9) }) }));
  await o.stok.fetch(new Request("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "VOLONTE", urunler: [{ kod: "3629", adet: 3, fiyat: 40 }], simdi: ist(9, 9) }) }));
  await o.stok.fetch(new Request("https://stok/satis-yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", gun: "2026-11-08", kalemler: [{ kod: "3629", adet: 5 }] }) }));
  o.depo.set("venom:siteDefteri", JSON.stringify({ modeller: { 3629: { kod: "3629", marka: "BLACKROSE", foto: 6 } } }));
  const istenen = [];
  o.env.KEMAL_W = { modelFoto: async (kod) => { istenen.push(kod); return { ok: true, kaynak: "site", bayt: new Uint8Array([1, 2, 3]) }; } };
  const gercek = Date.now; Date.now = () => ist(9, 15) * 1000;
  try { await yazi(o, PATRON, "36 29 kaç adet var"); } finally { Date.now = gercek; }
  assert.deepEqual(istenen, ["3629"]);
  assert.equal(o.claude.length, 0); // Claude'a gitmedi (ücretsiz)
  const f = o.g.find((x) => x.metod === "sendPhoto");
  assert.equal(f.govde.photo, "<dosya>");
  assert.equal(f.govde.protect_content, "true"); // iletilemez (satış adedi gizli)
  const satir = f.govde.caption.split("\n");
  assert.ok(satir.length <= 6);
  assert.equal(satir[0], "📦 3629 · BLACK ROSE");
  assert.match(satir[1], /^Stok: 11 adet \(BLACK ROSE Vegawin\) · son 7 gün 5 satış/); // VOLONTE'nin 3'ü EKLENMEZ
  assert.match(f.govde.caption, /Fabrikada bekleyen sipariş yok/);
  assert.ok(!/\$|fiyat|kâr|müşteri/i.test(f.govde.caption));
  assert.deepEqual(f.govde.reply_markup.inline_keyboard.flat().map((b) => b.callback_data), ["vmk:p:3629", "vmk:r:3629", "vmk:v:3629"]);
  // 🔁 Repete al → ASLA doğrudan sipariş: Fuat'a gidecek taslak onay kartı
  o.g.length = 0;
  await bas(o, "vmk:r:3629");
  const k = patronaGiden(o).find((x) => /Fuat'a gidecek mesaj/.test(x.govde.text));
  assert.match(k.govde.text, /3629 modelinden repete rica ediyoruz/);
  assert.equal(o.samiG.length, 0);
  // 📣 Kanalda paylaş → renk sorusu (Kemal akışı; Venom kontrolü + 09–21 kuralı Kemal'de)
  o.g.length = 0;
  await bas(o, "vmk:p:3629");
  assert.match(patronaGiden(o)[0].govde.text, /3629 hangi renk Patron\?/);
  // fotoğraf yok + sitede yok → Selin'in listesine
  assert.deepEqual(kartSatirlari({ kod: "3700", marka: "VOLONTE", stok: { VOLONTE: 0 }, s7: 0, s14: 0, gun14: 14, fs: [], sitede: false, fotoYok: true }).at(-1), "📷 Fotoğraf yok — Selin'in fotoğraf listesine ekledim.");
});

test("9 Kasım: birden fazla kod → tek albüm + kısa liste, her model için numaralı düğmeler; kodsuz fotoğraf kanaldan iletilmişse ücretsiz bulunur, değilse maliyet sorulur", async () => {
  const o = ortam();
  for (const [kod, adet] of [["3629", 11], ["3627", 4]]) await o.stok.fetch(new Request("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza: "BLACKROSE", urunler: [{ kod, adet, fiyat: 40 }], simdi: ist(9, 9) }) }));
  o.depo.set("venom:siteDefteri", JSON.stringify({ modeller: { 3629: { kod: "3629", marka: "BLACKROSE" }, 3627: { kod: "3627", marka: "BLACKROSE" } } }));
  o.env.KEMAL_W = { modelFoto: async () => ({ ok: true, kaynak: "site", bayt: new Uint8Array([1]) }), fotoTani: async () => ({ ok: true, guven: "orta", en_iyi: "3627", adaylar: ["3627", "3629"], aciklama: "benzer kesim" }) };
  await yazi(o, PATRON, "3629 ve 3627 stok?");
  const alb = o.g.find((x) => x.metod === "sendMediaGroup");
  assert.deepEqual(alb.govde.media.map((m) => m.caption), ["1 · 3629", "2 · 3627"]);
  const liste = patronaGiden(o).at(-1);
  assert.match(liste.govde.text, /^📦 2 model:\n1\. 3629 · BLACK ROSE[\s\S]*2\. 3627 · BLACK ROSE/);
  assert.ok(liste.govde.reply_markup.inline_keyboard.flat().some((b) => b.text === "2· 🔁 Repete al" && b.callback_data === "vmk:r:3627"));
  // kanaldan iletilmiş kodsuz fotoğraf → kodlar dizininden (ücretsiz)
  o.depo.set("kanal", JSON.stringify({ id: -1001 }));
  o.depo.set("kodlar", JSON.stringify({ 3627: [{ ids: [700, 701], tarih: ist(5, 10) }] }));
  o.g.length = 0;
  await guncelleme({ update_id: 99001, message: { message_id: 5, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, caption: "bu kaç adet?", forward_origin: { type: "channel", chat: { id: -1001 }, message_id: 701 }, photo: [{ file_id: "F1", file_unique_id: "U1" }] } }, o.env);
  assert.match(o.g.find((x) => x.metod === "sendPhoto").govde.caption, /^📦 3627 · BLACK ROSE/);
  // bilinmeyen fotoğraf → stok SÖYLENMEZ, maliyet sorulur; onaylayınca emin değilse "bu mu?"
  o.g.length = 0;
  await guncelleme({ update_id: 99002, message: { message_id: 6, date: 1, chat: { id: PATRON, type: "private" }, from: { id: PATRON }, caption: "bu kaç adet?", photo: [{ file_id: "F2", file_unique_id: "U2" }] } }, o.env);
  const soru = patronaGiden(o)[0];
  assert.match(soru.govde.text, /ücretsiz yoldan bulamadım/);
  assert.ok(!/adet \(/.test(soru.govde.text));
  const t = soru.govde.reply_markup.inline_keyboard[0][0];
  assert.match(t.text, /Yapay zekâyla bul \(~0,10 \$\)/);
  const asil = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).includes("/file/bot") ? new Response(new Uint8Array([9, 9])) : String(u).endsWith("/getFile") ? Response.json({ ok: true, result: { file_path: "a.jpg" } }) : asil(u, i));
  o.g.length = 0;
  try { await bas(o, t.callback_data); } finally { globalThis.fetch = asil; }
  const bumu = patronaGiden(o).at(-1);
  assert.match(bumu.govde.text, /Emin değilim — bu mu\?/);
  assert.deepEqual(bumu.govde.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["vmk:k:3627", "vmk:k:3629"]);
  assert.ok(!o.g.some((x) => x.metod === "sendPhoto")); // seçilmeden kart (stok) yok
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
    await yazi(o, PATRON, "Kemal bugün ne yaptı?");
    const c = patronaGiden(o).at(-1).govde.text;
    assert.match(c, /^Kemal — bugün:\nİş defteri:/);
    assert.match(c, /3 kart \(Hemra 2, Merdan 1\), 2 tanesi cevaplandı/); // aynı düğmeli kart iki kişiye: ilk basan ikisini de kapatır
    assert.match(c, /kanala paylaşıldı: 3539/);
    assert.match(c, /Hemra'da 1 kart bekliyor: 3510/);
    assert.ok(!/9999/.test(c)); // deneme sayılmaz
    assert.equal(o.claude.length, 0); // ücretsiz
    await yazi(o, PATRON, "Nora bugün ne yaptı?");
    assert.match(patronaGiden(o).at(-1).govde.text, /Nora — bugün:\nSenaryolar:|Nora bugün: hiçbir kaynakta kayıt yok — bilmiyorum\. Baktığım kaynaklar: iş defteri, Nora senaryoları\./);
    await yazi(o, PATRON, "herkes bugün ne yaptı?");
    const h = patronaGiden(o).at(-1).govde.text.split("\n");
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
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 12, 5)), 0); // 3 saat dolmadı
  assert.equal(await kartTekrarAdimi(env2, "kemal", ktg, ist(10, 12, 15)), 1);
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
  assert.equal(mesaiSuresi(ist(13, 19), ist(16, 10)), 2 * 3600); // cuma 19:00 → pazartesi 10:00 = 1+1 saat (hafta sonu sayılmaz)
  // tekrar kart: aynı mutabakat 12 saat içinde ikinci kez → birleşir
  const { postaKarar, gonderildiKaydet } = await import("./venom-posta.js");
  await gonderildiKaydet(o.env, { kaynak: "sami", tur: "kart", metin: "📋 Mutabakat – 07.11 · Fuat'a gidecek", id: 5 }, ist(10, 10));
  assert.equal((await postaKarar(o.env, { kaynak: "venom", metin: "📋 Fuat'a gidecek mutabakat (birebir)", kart: true }, ist(10, 11))).kategori, "tekrar kart (birleştirildi)");
  // cuma 20:00 özeti: tek satır sağlık
  const m = await (await import("./venom-bot.js")).aksamOzeti(o.env, ist(13, 20, 1));
  assert.match(m, /🩺 Bu hafta: \d+ hatayı kendim düzelttim · \d+ mesaj size kurala uymadan geldi · /);
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
  assert.deepEqual(kart[0].klavye.inline_keyboard[0].map((b) => b.text), ["3040 📷 Bugün çekerim", "3040 🏭 Fabrikada", "3040 ❌ Satıldı/bitti"]);
  assert.deepEqual(kart[0].klavye.inline_keyboard[1].map((b) => b.text), ["3040 🔍 Bulamadım", "3040 ✏️ Açıklama yaz"]);
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
  assert.equal(await kartTekrarAdimi(o.env, "selin", ktg, ist(10, 12, 5)), 2);
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
  await yazi(o, PATRON, soru);
  const c = patronaGiden(o).at(-1).govde.text;
  assert.match(c, /Pelin — bu hafta:\nÜretim:\n• 1 iş: 3627\n• 3627 beyaz: teslim edildi · 1,20 \$ \(10\.11\)/);
  assert.match(c, /Harcama:\n• bu ay 34,79 \$ \(fal 20,00 \$ · Higgsfield 10,00 \$ · OpenAI 3,00 \$ · Claude 1,79 \$\)/);
  assert.match(c, /Bekleyen \/ yarım:\n• 3629 ön fotoğraf onayı bekliyor/);
  assert.match(c, /Bakiye:\n• Higgsfield: ~12,50 \$ \(tahmini: yüklenen − harcanan\)\n• fal: sorgulanamıyor/);
  assert.match(c, /Nora — bu hafta:\nSenaryolar:\n• bekleyen 1: 3627 senaryo/);
  assert.equal(o.claude.length, 0); // ücretsiz, şablona sıkışmadan
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

test("ekip düzeni: Hemra'ya 11:00 toplu liste (4 düğme), seçim → kart seçilen kişiye; izinliyse Merdan; akşam satırı", async () => {
  const o = ortam();
  const E = await import("./venom-ekip.js");
  const K = await import("./venom-kopru.js");
  const { kartIletAdimi } = await import("./kart-tekrar.js");
  o.env.AZIZ_ID = "505";
  const t = ist(10, 11);
  await E.listeyeEkle(o.env, { tur: "kart", ref: "isd:1", isdId: 1, bot: "kemal", chat: "504", mesaj: 7, kod: "3493", ozet: "3493 (kemal): ⬆️ 3493" }, t);
  await E.listeyeEkle(o.env, { tur: "kart", ref: "isd:1", isdId: 1, bot: "kemal", chat: "504", mesaj: 7, kod: "3493", ozet: "tekrar" }, t); // aynı iş iki kez yok
  assert.equal(await E.hemraListesiGonder(o.env, t, { stokIste: async () => [], biriktir: async () => {} }), 1);
  const g = (await K.kuyruguAl(o.env, "giden"))[0];
  assert.equal(g.kime, "hemra");
  assert.match(g.metin, /^📋 Hemra: onaylanmayanlar \/ sorunlu işler \(1\)/);
  assert.deepEqual(g.klavye.inline_keyboard[0].map((b) => b.text), ["1· 👤 Aziz'e ver", "1· 👤 Merdan'a ver", "1· ✋ Ben hallederim", "1· ❓ Patron'a sor"]);
  await E.hemraDugmesi(o.env, { id: "q", from: { id: 504 }, data: g.klavye.inline_keyboard[0][1].callback_data, message: { chat: { id: 504 }, message_id: 9, reply_markup: g.klavye } }, o.samiTg);
  const verilen = [];
  await E.hemraKararAdimi(o.env, t + 60, { kartIlet: async (x, kim) => { verilen.push([x.kod, kim]); await K.kuyrugaEkle(o.env, `kartIlet:${x.bot}`, { id: "k1", chat: x.chat, mesaj: x.mesaj, hedef: E.kisiId(o.env, kim), kim: "Hemra", ozet: x.ozet }); }, devret: async () => {}, gorevVer: async () => {}, patronaSor: async () => {}, biriktir: async () => {} });
  assert.deepEqual(verilen, [["3493", "merdan"]]);
  const kg = [];
  await kartIletAdimi(o.env, "kemal", async (e, m, gv) => { kg.push({ m, gv }); return { ok: true, result: { message_id: 1 } }; });
  assert.equal(String(kg[0].gv.chat_id), MERDAN);
  const l = JSON.parse(o.depo.get("venom:hemraListe"));
  assert.deepEqual(E.hemraSatirlari(l, t), ["📋 Hemra listesi: 1 iş, 1 dağıtıldı, 0 bekliyor"]);
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

test("para: günlük sayaç (bot başına) + model sayımı; Kemal 2 $ tavanında durur, deneme bot bütçesine yazılmaz; Venom %80 ve 3 kat alarmı; özet bugünü doğru yazar", async () => {
  const o = ortam();
  const H = await import("./harcama.js");
  const v = await import("./venom-bot.js");
  const e = { ...o.env, BOT_ADI: "kemal" };
  const t = Math.floor(Date.UTC(2026, 10, 10, 9) / 1000);
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t); // 0,40 + 0,40 = 0,80 $
  assert.equal(await H.gunlukHarcanan(e, "kemal", t), 0.8);
  const d = JSON.parse(o.depo.get("harcama-detay:kemal:2026-11-10"));
  assert.deepEqual(d["claude-opus-5-5"], { n: 1, usd: 0.8 });
  o.depo.set("harcama:denemeBitis", String(t + 3600));
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t + 60);
  assert.equal(await H.gunlukHarcanan(e, "kemal", t), 0.8); // deneme ayrı
  o.depo.delete("harcama:denemeBitis");
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t + 120);
  assert.equal(await H.sinirAsildiMi(e, t + 130), false); // 1,60 $
  // Venom %80 uyarısı (para izni)
  o.depo.set("venom:paraGun:2026-11-09", JSON.stringify({ kemal: 0.3, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  o.depo.set("venom:paraGun:2026-11-08", JSON.stringify({ kemal: 0.3, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  o.depo.set("venom:paraGun:2026-11-07", JSON.stringify({ kemal: 0.4, selin: 0.2, pelin: 0, sami: 0, venom: 0.1 }));
  await v.paraAlarmi(o.env, t + 200);
  const m = patronaGiden(o).map((x) => x.govde.text);
  assert.ok(m.some((x) => /Kemal bugün 1,60 \$ harcadı \(günlük tavan 2 \$, %80\)/.test(x)));
  assert.ok(m.some((x) => /Kemal bugün olağanın 3 katından fazla harcadı: 1,60 \$/.test(x)));
  await H.harcamaEkle(e, "claude-opus-5-5", { input_tokens: 100000, output_tokens: 20000 }, t + 300);
  assert.equal(await H.sinirAsildiMi(e, t + 310), true); // 2,40 $ → yapay zekâ durur
  await v.paraAlarmi(o.env, t + 400);
  assert.ok(patronaGiden(o).some((x) => /Kemal bugünkü yapay zekâ tavanına ulaştı: 2,40 \$/.test(x.govde.text)));
  const n = patronaGiden(o).length;
  await v.paraAlarmi(o.env, t + 500);
  assert.equal(patronaGiden(o).length, n); // günde bir kez
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
  await yazi(o, PATRON, "3394 fabrika kaydı");
  assert.match(o.g.at(-1).govde.text, /^📒 3394 fabrika kaydı \(silinemez defter\):\n26 Ekim 10:33 Sinem: Bitti, gelmeyecek — "3394 bitti"\n26 Ekim 11:18 Fuat: Onayladı: bitti$/);
  assert.equal(o.claude.length, 0); // ücretsiz (Claude'a gitmez)
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
  const tum = o.g.filter((x) => String(x.govde.chat_id) === String(PATRON)).map((x) => x.govde.text || "");
  assert.ok(tum.some((t) => /^⚠️ Kemal yapamadı\. Sebebi: Bunu yapamıyorum/.test(t)), JSON.stringify(tum));
  assert.match(JSON.stringify(o.claude.at(-1).messages.at(-1)), /KEMAL YAPAMADI/);
  o.g.length = 0;
  await yazi(o, PATRON, "3512 sil");
  assert.equal(o.g.filter((x) => String(x.govde.chat_id) === String(PATRON)).at(-1).govde.text, "Silindi: 3512 (t.me/Volonteroseoffical/15001 +1 mesaj, 10.11 14:35)");
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
