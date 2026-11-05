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
    const govde = istek.body instanceof FormData ? { chat_id: istek.body.get("chat_id") } : istek.body ? JSON.parse(istek.body) : {};
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
  assert.ok(patronaGiden(o).some((x) => /^✅ Mesaj Fuat'a gitti/.test(x.govde.text)));
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
  await yazi(o, PATRON, "3557");
  const h = JSON.parse(o.depo.get("venom:bot:hata"));
  assert.match(h[0].yer, /arac:stok_sorgu/);
  assert.match(h[0].hata, /depo kapalı/);
  assert.ok(!patronaGiden(o).some((x) => /depo kapalı|Error/.test(x.govde.text)));
});

test("zamanlama: 09:40 toplu rapor ve 20:00 günün özeti Patron'a birer kez; pazar sessiz; Venom açıkken Kemal gruba toplu rapor atmaz", async () => {
  const o = ortam();
  await venomCron(o.env, ist(3, 9, 41)); // salı
  await venomCron(o.env, ist(3, 9, 46));
  assert.equal(patronaGiden(o).filter((x) => /toplu rapor/.test(x.govde.text)).length, 1);
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
  await yazi(o, PATRON, "stok 3557");
  assert.equal(o.claude.length, n);
  assert.match(patronaGiden(o).at(-1).govde.text, /Venom yapay zekâ sınırı \(30 \$\) doldu/);
  o.depo.set("venom:bot:sinir", "50");
  await yazi(o, PATRON, "stok 3557");
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
  const h = patronaGiden(o).filter((x) => /Botlarda hata/.test(x.govde.text));
  assert.equal(h.length, 1);
  assert.match(h[0].govde.text, /Pelin: fal hatası/);
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
  const by = await aracCalistir(o.env, "bota_yaz", { bot: "pelin", metin: "3627 beyaz üret" }, ist(5, 13));
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
  const t = await gunlukTest(o.env, 1793900000);
  assert.match(t, /⚠️ 3 sorun/);
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
  assert.deepEqual(k.govde.reply_markup.inline_keyboard.flat().map((b) => b.text), ["🎬 Pelin kullansın", "📣 Paylaş", "💾 Sadece kaydet"]);
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
