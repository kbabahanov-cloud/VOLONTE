// Çalıştırma: node --test telegram-bot/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { fiyatBul, kodBul, guncellemeIsle, haftaOzeti, gunAnahtari, webhookKontrol, adaylar, rotasyon, kanaldaPaylas, KALICI, modelMesajlari } from "./worker.js";

function sahteOrtam() {
  const depo = new Map();
  const gonderilen = [];
  globalThis.fetch = async (url, istek) => {
    gonderilen.push({ url, govde: JSON.parse(istek.body) });
    return new Response(JSON.stringify({ ok: true }));
  };
  const env = {
    BOT_TOKEN: "test-token",
    MESAJ_ARASI_MS: 0,
    WEBHOOK_SECRET: "gizli123",
    ALLOWED_IDS: "111, 222",
    KAYIT: {
      async get(k, tur) {
        const v = depo.get(k);
        if (v == null) return null;
        return tur === "json" ? JSON.parse(v) : v;
      },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
      async list({ prefix }) { return { keys: [...depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }; },
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

test("izinsiz kişi müşteri modunda karşılanır (yapay zekâsız selam), kimliği not edilir", async () => {
  const { env, depo, gonderilen } = sahteOrtam();
  await guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(999), from: { id: 999, first_name: "Yabancı", language_code: "fr" }, text: "/start" } }, env);
  assert.equal(gonderilen.length, 1);
  assert.match(gonderilen[0].govde.text, /^Bonjour ! Je suis Kemal[\s\S]*t\.me\/Volonteroseoffical/);
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

// ---------- Günlük yeniden paylaşım ----------

const GUN = 86400;
// İstanbul saatiyle 21 Ekim 2026 hh:mm
const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 21 + gunEk, hh - 3, mm) / 1000;

function rotasyonOrtami() {
  const o = sahteOrtam();
  o.env.ALLOWED_IDS = "111,222";
  const simdi = ist(9, 0);
  o.depo.set("kanal", JSON.stringify({ id: -100, kullanici: "Volonteroseoffical" }));
  o.depo.set("kodlar", JSON.stringify({
    "3329": [{ ids: [500, 501], tarih: simdi - 5 * GUN }],          // yeni: önerilmez
    "3100": [{ ids: [300, 301, 302], tarih: simdi - 90 * GUN }],    // en eski kodlu
    "3200": [{ ids: [400], tarih: simdi - 40 * GUN }],
    "2900": [{ ids: [100], tarih: simdi - 400 * GUN }],             // 1 yıldan eski: önerilmez
  }));
  o.depo.set("kodsuz", JSON.stringify({ "~200": { ids: [200, 201], tarih: simdi - 120 * GUN, album: null } }));
  let sonraki = 1000;
  globalThis.fetch = async (url, istek) => {
    const govde = JSON.parse(istek.body);
    o.gonderilen.push({ url, govde });
    if (url.endsWith("copyMessages")) return new Response(JSON.stringify({ ok: true, result: govde.message_ids.map(() => ({ message_id: sonraki++ })) }));
    if (url.endsWith("copyMessage") || url.endsWith("sendMessage")) return new Response(JSON.stringify({ ok: true, result: { message_id: sonraki++ } }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  return { ...o, simdi };
}
const cagrilar = (g, metod) => g.filter((x) => x.url.endsWith("/" + metod));
const bas = (env, kisi, data, mid = 1) => guncellemeIsle({ callback_query: { id: "c", from: { id: kisi, first_name: kisi === 222 ? "Merdan" : "Murat" }, data, message: { chat: { id: kisi }, message_id: mid } } }, env);

test("adaylar: en eski önce, 30 gün–1 yıl arası, kodsuz dahil, atlanan ve sıradaki hariç", () => {
  const simdi = ist(9);
  const kodlar = { A: [{ ids: [1], tarih: simdi - 40 * GUN }], B: [{ ids: [2], tarih: simdi - 10 * GUN }], C: [{ ids: [3], tarih: simdi - 400 * GUN }], D: [{ ids: [4], tarih: simdi - 50 * GUN }], E: [{ ids: [5], tarih: simdi - 60 * GUN }] };
  const kodsuz = { "~9": { ids: [9], tarih: simdi - 100 * GUN } };
  const l = adaylar(kodlar, kodsuz, { D: simdi + GUN }, ["E"], simdi);
  assert.deepEqual(l.map((a) => a.kod), ["~9", "A"]);
});

// ---------- Tur sistemi ----------

// n kodlu model: 4000 en yeni (40 gün), 4000+n-1 en eski
function turOrtami(n = 14) {
  const o = rotasyonOrtami();
  const kodlar = {};
  for (let i = 0; i < n; i++) kodlar[String(4000 + i)] = [{ ids: [5000 + i * 10, 5001 + i * 10], tarih: o.simdi - (40 + i) * GUN }];
  o.depo.set("kodlar", JSON.stringify(kodlar));
  o.depo.set("kodsuz", "{}");
  // Beden önerisi için alt yazı arşive iletilerek okunur (4005'in alt yazısında beden yok).
  o.depo.set("arsiv", JSON.stringify({ id: -555 }));
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/forwardMessage")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url, govde });
      const kod = String(4000 + Math.floor((govde.message_id - 5000) / 10));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1, caption: kod === "4005" ? `✅CODE.${kod}` : `✅CODE.${kod}\n✅SIZE.  38/40/42/44` } }));
    }
    return onceki(url, istek);
  };
  return o;
}
const turMesajlari = (g, kisi = "111") => cagrilar(g, "copyMessage").filter((k) => String(k.govde.chat_id) === kisi);
const turDugme = (g, kod, metin) => turMesajlari(g).find((k) => k.govde.caption.startsWith(kod + " ")).govde.reply_markup.inline_keyboard.flat().find((d) => d.text.startsWith(metin)).callback_data;
const tur = (depo) => JSON.parse(depo.get("tur"));

test("tur 08:00'dan önce başlamaz; başlayınca en eski 10 model tarihleri ve düğmeleriyle ikisine gider", async () => {
  const o = turOrtami();
  await rotasyon(o.env, ist(7, 55));
  assert.equal(o.gonderilen.length, 0);
  await rotasyon(o.env, ist(8));
  const m = turMesajlari(o.gonderilen);
  assert.equal(m.length, 10);
  assert.equal(turMesajlari(o.gonderilen, "222").length, 10);
  assert.deepEqual(m.map((k) => k.govde.caption.split(" ")[0]), ["4013", "4012", "4011", "4010", "4009", "4008", "4007", "4006", "4005", "4004"]);
  assert.deepEqual(m[0].govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✓ 📏 Küçük", "📏 Büyük", "📏 İkisi de", m[0].govde.reply_markup.inline_keyboard[1][0].text, "🖼 Hepsini göster", "⏳ Beklesin", "🗑️ Sil"]);
  assert.match(m[0].govde.reply_markup.inline_keyboard[1][0].text, /^✅ Onaylıyorum \(\d\d\.\d\d\.2026\)$/);
  assert.match(m[8].govde.caption, /^4005 [\s\S]*📏 Alt yazıda beden yok — onaydan önce beden seçin/);
  assert.match(m[0].govde.caption, /📏 Alt yazıdaki beden: Küçük \(öneri/);
  assert.equal(m[0].govde.reply_markup.inline_keyboard[0][0].text, "✓ 📏 Küçük");
  assert.match(m[0].govde.caption, /^4013 · son paylaşım \d\d\.\d\d\.2026 \(5[23] gün önce\)\nKanaldaki paylaşımları \(1\):\n1\) \d\d\.\d\d\.2026 · 2 medya · t\.me\/Volonteroseoffical\/5130/);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /Ben Kemal/);
  assert.equal(tur(o.depo).no, 1);
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(8, 5));
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0); // onay yokken paylaşım yok
});

test("bir modelin bütün paylaşımları: her tarih için düğme, seçilen paylaşım sıraya girer; Hepsini göster sadece basana", async () => {
  const o = turOrtami();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["4013"] = [
    { ids: [5130, 5131], tarih: o.simdi - 53 * GUN },
    { ids: [3001, 3002, 3003], tarih: o.simdi - 120 * GUN },
    { ids: [2001], tarih: o.simdi - 200 * GUN },
  ];
  o.depo.set("kodlar", JSON.stringify(kodlar));
  await rotasyon(o.env, o.simdi);
  const m = turMesajlari(o.gonderilen).find((k) => k.govde.caption.startsWith("4013 "));
  assert.match(m.govde.caption, /Kanaldaki paylaşımları \(3\):\n1\) .* · 2 medya .*\n2\) .* · 3 medya .*\n3\) .* · 1 medya/);
  const onaylar = m.govde.reply_markup.inline_keyboard.flat().filter((d) => d.text.startsWith("✅"));
  assert.equal(onaylar.length, 3);

  o.gonderilen.length = 0;
  await bas(o.env, 222, m.govde.reply_markup.inline_keyboard.flat().find((d) => d.text.startsWith("🖼")).callback_data);
  const gosterilen = cagrilar(o.gonderilen, "copyMessages");
  assert.deepEqual(gosterilen.map((c) => c.govde.message_ids), [[5130, 5131], [3001, 3002, 3003], [2001]]);
  assert.ok(gosterilen.every((c) => c.govde.chat_id === 222)); // sadece basan kişiye, kanala değil
  assert.equal(tur(o.depo).ogeler["4013"].karar, null);

  await bas(o.env, 111, onaylar[1].callback_data); // ikinci tarih
  assert.equal(tur(o.depo).ogeler["4013"].secilen, 1);
  assert.match(cagrilar(o.gonderilen, "editMessageCaption").at(-1).govde.caption, /Murat onayladı: .* paylaşımı.* — bugün paylaşım sırasına girdi/);
  // onaylanınca seçilen paylaşım hemen (bugün) sıraya girer
  assert.deepEqual(JSON.parse(o.depo.get("kuyruk:4013")).ids, [3001, 3002, 3003]);
});

test("onay ikisinde de görünür; ikinci basış ve izinsiz kişi işlemez", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  const onay = turDugme(o.gonderilen, "4013", "✅");
  await bas(o.env, 999, onay);
  assert.equal(tur(o.depo).onaylar.length, 0);
  o.gonderilen.length = 0;
  await bas(o.env, 222, onay);
  const d = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(d.length, 2);
  assert.match(d[0].govde.caption, /Merdan onayladı: \d\d\.\d\d\.2026 paylaşımı.* — bugün paylaşım sırasına girdi/);
  o.gonderilen.length = 0;
  await bas(o.env, 111, onay);
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /Merdan zaten işaretledi/);
  assert.deepEqual(tur(o.depo).onaylar, ["4013"]);
});

test("beden: öneri seçili gelir, düğmeyle değişir (herkeste ✓ güncellenir); bedensiz model seçilmeden onaylanmaz; seçilen beden sıraya yazılır", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  o.gonderilen.length = 0;
  await bas(o.env, 222, "t1:1:4005:0");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /Önce beden seçin/);
  assert.equal(o.depo.get("kuyruk:4005"), undefined);
  await bas(o.env, 222, "tb:1:4005:b");
  const d = cagrilar(o.gonderilen, "editMessageReplyMarkup");
  assert.equal(d.length, 2);
  assert.deepEqual(d[0].govde.reply_markup.inline_keyboard[0].map((x) => x.text), ["📏 Küçük", "✓ 📏 Büyük", "📏 İkisi de"]);
  await bas(o.env, 111, "t1:1:4005:0");
  assert.equal(JSON.parse(o.depo.get("kuyruk:4005")).beden, "b");
  assert.match(cagrilar(o.gonderilen, "editMessageCaption").at(-1).govde.caption, /beden Büyük \(44-46-48-50\)/);
  await bas(o.env, 111, "t1:1:4013:0"); // öneriyle (Küçük) onay
  assert.equal(JSON.parse(o.depo.get("kuyruk:4013")).beden, "k");
});

test("beden: paylaşımda alt yazının beden satırı seçilen grupla değişir; marka kapalıyken fotoğraflar işlenmez", async () => {
  const o = markaOrtami();
  const r = await kanaldaPaylas(o.env, "3100", [300, 301, 302], o.simdi, "b");
  assert.equal(r.ok, true);
  const grup = o.gonderilen.find((g) => g.url.endsWith("/sendMediaGroup"));
  const medya = JSON.parse(grup.govde.media);
  assert.deepEqual(medya.map((m) => m.media), ["b300", "b301", "vid302"]);
  assert.equal(medya[0].caption, "CODE.3100\n📏 SIZE: 44-46-48-50");
  assert.equal(o.islenen.length, 0); // marka yok: görsel aracı kullanılmadı
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
});

test("videodan kare: sadece videosu olan paylaşımda onaylı kare başa eklenir (bir kez üretilen ortak kare)", async () => {
  const o = markaOrtami();
  o.depo.set("kare:3300", JSON.stringify({ durum: "onayli", url: "https://raw.githubusercontent.com/x/y/z/kareler/3300/aday-2.jpg", w: 1080, h: 1440 }));
  const r = await kanaldaPaylas(o.env, "3300", [302], o.simdi);
  assert.equal(r.ok, true);
  const medya = JSON.parse(o.gonderilen.find((g) => g.url.endsWith("/sendMediaGroup")).govde.media);
  assert.deepEqual(medya.map((m) => [m.type, m.media]), [["photo", "https://raw.githubusercontent.com/x/y/z/kareler/3300/aday-2.jpg"], ["video", "vid302"]]);
  o.depo.set("kare:3300", JSON.stringify({ durum: "onayda" })); // onaylanmamış kare kullanılmaz
  o.gonderilen.length = 0;
  await kanaldaPaylas(o.env, "3300", [302], o.simdi + 5);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 1);
});

test("ekip: tur ona da gelir, sonradan eklenene eksikler gönderilir, ilk basan geçerli; ayar, harcama ve yapay zekâ yok", async () => {
  const o = turOrtami();
  o.env.EKIP_IDS = "333";
  await rotasyon(o.env, o.simdi);
  // sabah tek seferde: her kişiye 10 model (her kişi ayrı çalışmada, istek sınırına takılmaz)
  for (const k of ["111", "222", "333"]) assert.equal(turMesajlari(o.gonderilen, k).length, 10);
  o.gonderilen.length = 0;
  await rotasyon(o.env, o.simdi + 300);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0); // 5 dk sonra yeni mesaj yok

  o.env.EKIP_IDS = "333,444"; // yeni ekip üyesi
  o.gonderilen.length = 0;
  await rotasyon(o.env, o.simdi + 600);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 10); // sadece eksik olana; bütçe 24
  assert.equal(turMesajlari(o.gonderilen, "444").length, 10);
  o.gonderilen.length = 0;
  await rotasyon(o.env, o.simdi + 900);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0);

  await bas(o.env, 444, "t1:1:4013:0");
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption").length, 4); // dört kişide de kapandı
  o.gonderilen.length = 0;
  await bas(o.env, 111, "t1:1:4013:0");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /zaten işaretledi/);
  assert.deepEqual(tur(o.depo).onaylar, ["4013"]);

  o.gonderilen.length = 0;
  await bas(o.env, 333, "mk:acik");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /sadece Murat ve Merdan/);
  assert.equal(o.depo.get("marka"), undefined);

  o.gonderilen.length = 0;
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(333), from: { id: 333, first_name: "Hemra" }, text: "bu ay ne kadar harcadık?" } }, o.env);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").length, 1);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /Ekiptesiniz[\s\S]*sadece Murat ve Merdan/);
  assert.ok(!o.gonderilen.some((g) => String(g.url).includes("anthropic")));
  assert.equal(o.depo.get("bekleyen:333"), undefined); // müşteri moduna düşmez
});

test("Beklesin: 7 gün sonra sorulur, yerine yeni model gelmez", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  const beklesin = turDugme(o.gonderilen, "4013", "⏳");
  o.gonderilen.length = 0;
  await bas(o.env, 111, beklesin);
  const su = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(JSON.parse(o.depo.get("atlananlar"))["4013"] - (su + 7 * GUN)) < 60);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0); // günde sadece sabahki 10 model
  assert.match(cagrilar(o.gonderilen, "editMessageCaption")[0].govde.caption, /Murat: beklesin/);
});

function silmeTaklidi(o, silinemeyen = []) {
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/deleteMessage")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url, govde });
      return new Response(JSON.stringify(silinemeyen.includes(govde.message_id) ? { ok: false, description: "Bad Request: message can't be deleted" } : { ok: true, result: true }));
    }
    return eski(url, istek);
  };
}

test("Sil: Emin misiniz → Vazgeç hiçbir şey silmez → Evet tüm paylaşımları siler, yerine yeni model gelmez", async () => {
  const o = turOrtami();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["4013"].push({ ids: [150, 151, 152], tarih: o.simdi - 200 * GUN });
  o.depo.set("kodlar", JSON.stringify(kodlar));
  silmeTaklidi(o);
  await rotasyon(o.env, o.simdi);
  const sil = turDugme(o.gonderilen, "4013", "🗑️");
  o.gonderilen.length = 0;

  await bas(o.env, 111, sil);
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  const soru = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(soru.length, 1); // sadece basanın ekranı
  assert.match(soru[0].govde.caption, /Emin misiniz/);
  const [evet, vazgec] = soru[0].govde.reply_markup.inline_keyboard[0].map((d) => d.callback_data);

  o.gonderilen.length = 0;
  await bas(o.env, 111, vazgec);
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  assert.ok(cagrilar(o.gonderilen, "editMessageCaption")[0].govde.reply_markup.inline_keyboard.flat().some((d) => d.text === "🗑️ Sil"));

  o.gonderilen.length = 0;
  await bas(o.env, 111, evet);
  assert.deepEqual(cagrilar(o.gonderilen, "deleteMessage").map((d) => d.govde.message_id), [150, 151, 152, 5130, 5131]);
  assert.equal(JSON.parse(o.depo.get("atlananlar"))["4013"], KALICI);
  assert.equal(JSON.parse(o.depo.get("hicgelmeyecek"))["4013"].tarihler.length, 2);
  assert.equal(JSON.parse(o.depo.get("kodlar"))["4013"].length, 2); // tarihler kayıtta kalır
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption").length, 2);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /5 mesaj kanaldan silindi/);
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0); // yerine yeni model yok
  await guncellemeIsle({ message: { message_id: 9, date: 1, chat: ozel(111), from: { id: 111 }, text: "/paylas 4013" } }, o.env);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /silindi olarak işaretli/);
});

test("silinemeyen eski mesajlar linkleriyle bildirilir", async () => {
  const o = turOrtami();
  silmeTaklidi(o, [5130]);
  await rotasyon(o.env, o.simdi);
  await bas(o.env, 111, "ty:1:4013");
  const ozet = cagrilar(o.gonderilen, "sendMessage").find((m) => /kanaldan silindi/.test(m.govde.text)).govde.text;
  assert.match(ozet, /1 mesaj kanaldan silindi/);
  assert.match(ozet, /1 mesaj silinemedi/);
  assert.match(ozet, /t\.me\/Volonteroseoffical\/5130/);
});

test("çok mesajlı silme 5 dakikalık görevle parça parça biter (gece de)", async () => {
  const o = turOrtami();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["4013"] = Array.from({ length: 9 }, (_, i) => ({ ids: Array.from({ length: 5 }, (_, j) => 1000 + i * 10 + j), tarih: o.simdi - (90 + i) * GUN }));
  o.depo.set("kodlar", JSON.stringify(kodlar));
  silmeTaklidi(o);
  await rotasyon(o.env, o.simdi);
  o.gonderilen.length = 0;
  await bas(o.env, 111, "ty:1:4013");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 20);
  await rotasyon(o.env, ist(23));
  await rotasyon(o.env, ist(23, 5));
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 45);
  assert.equal(o.depo.get("silinecek:4013"), undefined);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /45 mesaj kanaldan silindi/);
});

test("günde tek tur: onaylanan hemen sıraya girer, 50–60 dk arayla paylaşılır; 10 onay beklenmez, yeni tur açılmaz", async () => {
  const o = turOrtami(25);
  await rotasyon(o.env, o.simdi);
  const kodlar10 = turMesajlari(o.gonderilen).map((k) => k.govde.caption.split(" ")[0]);
  assert.equal(kodlar10.length, 10);
  await bas(o.env, 111, `t1:1:${kodlar10[0]}:0`);
  assert.ok(o.depo.get(`kuyruk:${kodlar10[0]}`)); // tek onayla sıraya girdi
  for (const kod of kodlar10.slice(1)) await bas(o.env, 222, `t1:1:${kod}:0`);
  assert.equal(tur(o.depo).no, 1); // 10 onay olunca yeni tur açılmaz
  assert.equal(tur(o.depo).durum, "toplaniyor");

  o.gonderilen.length = 0;
  const t = ist(10, 5);
  await rotasyon(o.env, t);
  const ilk = cagrilar(o.gonderilen, "copyMessages");
  assert.equal(ilk.length, 1);
  assert.deepEqual(ilk[0].govde.message_ids, [5240, 5241]); // ilk onaylanan (4024), albümün tamamı
  const ara = Number(o.depo.get("sonraki")) - t;
  assert.ok(ara >= 50 * 60 && ara <= 60 * 60, `aralık ${ara / 60} dk`);
  assert.equal(turMesajlari(o.gonderilen).length, 0);
  o.gonderilen.length = 0;
  await rotasyon(o.env, t + 45 * 60);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.equal(turMesajlari(o.gonderilen).length, 0); // gün içinde yeni liste gelmez
});

test("paylaşım penceresi 08:00–20:00", async () => {
  const o = turOrtami();
  o.depo.set("tur", JSON.stringify({ no: 1, durum: "toplaniyor", basla: o.simdi, onaylar: [], ogeler: {} }));
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  await rotasyon(o.env, ist(7, 55));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  await rotasyon(o.env, ist(19, 50));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 1);
});

test("20:00'de gün sonu: paylaşılamayan onaylılar sıradan çıkar, tur kapanır; rapor söyler; ertesi sabah yeni tur", async () => {
  const o = turOrtami();
  await rotasyon(o.env, o.simdi);
  for (const kod of ["4013", "4012", "4011"]) await bas(o.env, 111, `t1:1:${kod}:0`);
  o.depo.set(`sayac:${gunAnahtari(o.simdi)}`, "10"); // bugünün hakkı doldu
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(20, 0));
  assert.equal([...o.depo.keys()].filter((k) => k.startsWith("kuyruk:")).length, 0);
  assert.equal(tur(o.depo).durum, "bitti");
  const rapor = cagrilar(o.gonderilen, "sendMessage").find((m) => /akşam raporu/.test(m.govde.text));
  assert.match(rapor.govde.text, /paylaşılamayan 3 onaylı model sıradan çıkarıldı \(4013, 4012, 4011\); ileriki bir turda yeniden sorulacak/);
  // kapanan turun düğmesi artık işlem yapmaz
  o.gonderilen.length = 0;
  await bas(o.env, 111, "t1:1:4010:0");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /geçerli değil/);
  assert.equal(o.depo.get("kuyruk:4010"), undefined);
  // gece yeni liste yok; sabah yeni tur, çıkarılanlar yeniden sorulabilir
  await rotasyon(o.env, ist(23, 0));
  assert.equal(turMesajlari(o.gonderilen).length, 0);
  await rotasyon(o.env, ist(8, 0, 1));
  assert.equal(tur(o.depo).no, 2);
  const yarin = turMesajlari(o.gonderilen).map((k) => k.govde.caption.split(" ")[0]);
  assert.equal(yarin.length, 10);
  assert.ok(yarin.includes("4013"));
});

test("tur öncesinden kalan sıradakiler 60–90 dk arayla", async () => {
  const o = turOrtami(3);
  o.depo.set("tur", JSON.stringify({ no: 2, durum: "toplaniyor", basla: o.simdi, onaylar: [], ogeler: {} }));
  o.depo.set("kuyruk:3999", JSON.stringify({ kod: "3999", ids: [7000], kim: "Murat", zaman: 0 })); // tur öncesinden
  const t = ist(12);
  await rotasyon(o.env, t);
  const ara = Number(o.depo.get("sonraki")) - t;
  assert.ok(ara >= 60 * 60 && ara <= 90 * 60); // eski düzen
  assert.ok(!cagrilar(o.gonderilen, "sendMessage").some((m) => /🏁/.test(m.govde.text)));
});

test("önerecek model az ise o kadar sorulur; yerine yenisi gelmez; ertesi gün yeni tur", async () => {
  const o = turOrtami(3);
  await rotasyon(o.env, o.simdi);
  assert.equal(turMesajlari(o.gonderilen).length, 3);
  await bas(o.env, 111, "t1:1:4002:0");
  await bas(o.env, 111, "t7:1:4000");
  assert.equal(turMesajlari(o.gonderilen).length, 3); // yerine yeni model gelmez
  await rotasyon(o.env, ist(19));
  assert.equal(tur(o.depo).no, 1); // aynı gün yeni tur yok
  await rotasyon(o.env, ist(8, 0, 1));
  assert.equal(tur(o.depo).no, 2);
});

test("kanalda bulunamayan model atlanır, yerine sıradaki gelir", async () => {
  const o = turOrtami();
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const govde = JSON.parse(istek.body);
    if (String(url).endsWith("/copyMessage") && govde.message_id === 5130) return new Response(JSON.stringify({ ok: false, description: "Bad Request: message to copy not found" }));
    return eski(url, istek);
  };
  await rotasyon(o.env, o.simdi);
  assert.ok(JSON.parse(o.depo.get("atlananlar"))["4013"] > o.simdi + 300 * GUN);
  assert.equal(Object.keys(tur(o.depo).ogeler).length, 10);
  assert.ok(!tur(o.depo).ogeler["4013"]);
});

test("günlük 10 sınırında paylaşım yok, sıradaki gün içinde bekler", async () => {
  const o = turOrtami();
  o.depo.set("tur", JSON.stringify({ no: 1, durum: "toplaniyor", basla: o.simdi, onaylar: [], ogeler: {} }));
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  o.depo.set(`sayac:${gunAnahtari(o.simdi)}`, "10");
  await rotasyon(o.env, ist(15));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.ok(o.depo.get("kuyruk:4000"));
});

test("/kuyruk saatleri ve iptal düğmesini gösterir; iptal kanala dokunmaz", async () => {
  const o = turOrtami();
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  o.depo.set("kuyruk:~200", JSON.stringify({ kod: "~200", ids: [200], tarih: ist(9) - 120 * GUN, kim: "Merdan", zaman: 2, tur: 1 }));
  await guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(111), from: { id: 111 }, text: "/kuyruk" } }, o.env);
  const m = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.match(m.text, /1\) 4000 — tahmini/);
  assert.match(m.text, /2\) Kodsuz paylaşım \(\d\d\.\d\d\.2026 tarihli\)/);
  o.gonderilen.length = 0;
  await bas(o.env, 222, m.reply_markup.inline_keyboard[1][0].callback_data);
  assert.equal(o.depo.get("kuyruk:~200"), undefined);
  assert.ok(o.depo.get("kuyruk:4000"));
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length + cagrilar(o.gonderilen, "deleteMessage").length, 0);
});

test("eski liste düğmeleri artık işlem yapmaz", async () => {
  const o = turOrtami();
  await bas(o.env, 111, "r1:2026-10-21:4000");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /eski liste/);
  assert.equal([...o.depo.keys()].filter((k) => k.startsWith("kuyruk:")).length, 0);
});

test("elle /paylas günlük sınıra dahil", async () => {
  const { env, gonderilen, depo } = rotasyonOrtami();
  const bugun = gunAnahtari(Math.floor(Date.now() / 1000));
  depo.set(`sayac:${bugun}`, "10");
  await guncellemeIsle({ message: { message_id: 5, date: 1, chat: ozel(111), from: { id: 111 }, text: "/paylas 3329" } }, env);
  const ok = cagrilar(gonderilen, "sendMessage").at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data;
  gonderilen.length = 0;
  await bas(env, 111, ok);
  assert.equal(cagrilar(gonderilen, "copyMessages").length, 0);
  assert.match(cagrilar(gonderilen, "editMessageText")[0].govde.text, /sınırı doldu/);
});

test("kanala yeni kodsuz DISPONIBLE albümü kodsuz dizinine girer", async () => {
  const { env, depo } = sahteOrtam();
  const t = ist(10);
  const v = { file_id: "v" };
  await guncellemeIsle({ channel_post: { message_id: 30, date: t, chat: kanal, video: v, caption: "AVAILABLE NOW DISPONIBLE 38-40-42", media_group_id: "K" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 31, date: t, chat: kanal, video: v, media_group_id: "K" } }, env);
  await guncellemeIsle({ channel_post: { message_id: 32, date: t, chat: kanal, text: "THANKS ❤️" } }, env);
  assert.deepEqual(JSON.parse(depo.get("kodsuz")), { "~30": { ids: [30, 31], tarih: t, album: "K" } });
});

test("içe aktarma: kodsuz dizin son 1 yıl, AVAILABLE AGAIN / DISPONIBLE", async () => {
  const { kodsuzDizin } = await import("./ice-aktar.mjs");
  const simdi = 2_000_000_000;
  const k = kodsuzDizin([
    { id: "1", type: "message", date_unixtime: String(simdi - 10 * GUN), photo: "x", text: "AVAILABLE NOW DISPONIBLE" },
    { id: "2", type: "message", date_unixtime: String(simdi - 10 * GUN), photo: "x", text: "" },
    { id: "3", type: "message", date_unixtime: String(simdi - 20 * GUN), photo: "x", text: "AVAILABLE AGAIN" },
    { id: "4", type: "message", date_unixtime: String(simdi - 30 * GUN), photo: "x", text: "CODE.3329 DISPONIBLE" },
    { id: "5", type: "message", date_unixtime: String(simdi - 400 * GUN), photo: "x", text: "DISPONIBLE" },
    { id: "6", type: "message", date_unixtime: String(simdi - 5 * GUN), text: "DISPONIBLE" },
    { id: "7", type: "message", date_unixtime: String(simdi - 4 * GUN), photo: "x", text: "THANKS" },
  ], simdi);
  assert.deepEqual(Object.keys(k), ["~1", "~3"]);
  assert.deepEqual(k["~1"].ids, [1, 2]);
});

test("botun yeniden paylaşımı: kanala düşen kopya bir kez sayılır, kodsuz kopya yeni kayıt açmaz, Sil kopyaları da siler", async () => {
  const o = rotasyonOrtami();
  // Telegram kanala kopyalarken kimlik 0 dönebiliyor
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/copyMessages")) { o.gonderilen.push({ url, govde: JSON.parse(istek.body) }); return new Response(JSON.stringify({ ok: true, result: [{ message_id: 0 }, { message_id: 0 }] })); }
    return eski(url, istek);
  };
  const t = o.simdi;
  const sonuc = await kanaldaPaylas(o.env, "~200", [200, 201], t);
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.link, null); // 0 kimlikle bozuk link verilmez
  assert.equal(JSON.parse(o.depo.get("sonpaylasim"))["~200"], t);
  assert.equal(o.depo.get(`gun:${gunAnahtari(t)}`), undefined); // henüz kanala düşmedi
  // kopyalar kanala düşer (DISPONIBLE yazısıyla)
  await guncellemeIsle({ channel_post: { message_id: 900, date: t + 2, chat: kanal, photo: [{ file_id: "f" }], caption: "AVAILABLE NOW DISPONIBLE", media_group_id: "Z" } }, o.env);
  await guncellemeIsle({ channel_post: { message_id: 901, date: t + 2, chat: kanal, photo: [{ file_id: "f" }], media_group_id: "Z" } }, o.env);
  // sonra insanın kendi paylaşımı: normal kayıt
  await guncellemeIsle({ channel_post: { message_id: 902, date: t + 60, chat: kanal, photo: [{ file_id: "f" }], caption: "DISPONIBLE 38-40" } }, o.env);
  const kodsuz = JSON.parse(o.depo.get("kodsuz"));
  assert.deepEqual(kodsuz["~200"].kopyalar, [900, 901]);
  assert.deepEqual(kodsuz["~200"].ids, [200, 201]); // asıl kayıt yerinde
  assert.ok(!kodsuz["~900"]);
  assert.ok(kodsuz["~902"]);
  assert.equal(o.depo.get(`gun:${gunAnahtari(t)}`), "2"); // kopya albümü 1 + insan 1
  assert.equal(o.depo.get(`sayac:${gunAnahtari(t)}`), "1");
  assert.deepEqual(modelMesajlari("~200", {}, kodsuz), [200, 201, 900, 901]);
  // yeniden paylaşılan model 30 gün aday olmaz
  assert.ok(!adaylar({}, kodsuz, {}, [], t + 5 * GUN, JSON.parse(o.depo.get("sonpaylasim"))).some((a) => a.kod === "~200"));
});

test("kodlu modelin kopyası gerçek kimlikleriyle dizine girer, 0 kimlik kaydedilmez", async () => {
  const o = rotasyonOrtami();
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek) => String(url).endsWith("/copyMessages")
    ? new Response(JSON.stringify({ ok: true, result: [{ message_id: 0 }] }))
    : eski(url, istek);
  await kanaldaPaylas(o.env, "3100", [300], o.simdi);
  await guncellemeIsle({ channel_post: { message_id: 950, date: o.simdi + 1, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3100" } }, o.env);
  const k = JSON.parse(o.depo.get("kodlar"))["3100"];
  assert.deepEqual(k.map((g) => g.ids), [[950], [300, 301, 302]]);
  assert.ok(!k.flatMap((g) => g.ids).includes(0));
  assert.equal(o.depo.get(`gun:${gunAnahtari(o.simdi)}`), "1");
});

test("asistan cevabındaki **kalın** Telegram'da kalın görünür; biçim hatasında düz metin gider", async () => {
  const { telegramHtml, duzMetin } = await import("./asistan.js");
  assert.equal(telegramHtml("**Bu hafta:** 7 paylaşım"), "<b>Bu hafta:</b> 7 paylaşım");
  assert.equal(telegramHtml("- 3244 <yeni> & `kod`"), "• 3244 &lt;yeni&gt; &amp; <code>kod</code>");
  assert.equal(telegramHtml("# Özet"), "<b>Özet</b>");
  assert.equal(telegramHtml("~10619 kodsuz"), "~10619 kodsuz");
  assert.equal(duzMetin("**Bu hafta:** 7"), "Bu hafta: 7");
  const o = asistanOrtami([mesaj(1, "**Bu hafta:** 7 paylaşım")]);
  await yazi(o.env, 111, "bu hafta kaç paylaşım");
  const son = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.equal(son.parse_mode, "HTML");
  assert.equal(son.text, "<b>Bu hafta:</b> 7 paylaşım");
});

// ---------- Yapay zekâ asistanı ----------

function asistanOrtami(cevaplar) {
  const o = rotasyonOrtami();
  o.env.ANTHROPIC_API_KEY = "test-anahtar";
  const istekler = [];
  const tg = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const adres = String(url);
    if (adres.startsWith("https://api.anthropic.com")) {
      istekler.push(JSON.parse(istek.body));
      return new Response(JSON.stringify(cevaplar.shift()), { status: 200, headers: { "content-type": "application/json" } });
    }
    return tg(url, istek);
  };
  return { ...o, istekler };
}
const mesaj = (id, text) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } });
const aracCagrisi = (name, input) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name, input }], usage: { input_tokens: 1, output_tokens: 1 } });
const yazi = (env, kisi, text) => guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(kisi), from: { id: kisi, first_name: "Murat" }, text } }, env);

test("asistan: anahtar yoksa nazikçe söyler", async () => {
  const o = rotasyonOrtami();
  await yazi(o.env, 111, "bugün kaç paylaşım yaptık");
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /henüz bağlı değil/);
});

test("asistan: paylaşma/silme aracı yok; 'beklesin' turdaki modeli işaretler, yerine yeni model gelmez", async () => {
  const o = asistanOrtami([aracCagrisi("beklesin", { kod: "4013" }), mesaj(1, "4013 beklemeye alındı.")]);
  const kodlar = {};
  for (let i = 0; i < 14; i++) kodlar[String(4000 + i)] = [{ ids: [5000 + i * 10], tarih: o.simdi - (40 + i) * GUN }];
  o.depo.set("kodlar", JSON.stringify(kodlar));
  await rotasyon(o.env, o.simdi);
  o.gonderilen.length = 0;
  await yazi(o.env, 111, "4013 beklesin");
  const adlar = o.istekler[0].tools.map((t) => t.name);
  assert.deepEqual(adlar, ["durum_ozeti", "model_bilgisi", "beklesin", "sil_onayi_iste", "paylasim_onizle", "altyazi_oner", "istek_kaydet", "istekleri_goster", "kuyruk_goster"]);
  assert.ok(o.istekler[0].tools.every((t) => t.strict === true));
  assert.equal(o.istekler[0].model, "claude-opus-5-5");
  assert.equal(o.istekler[0].fallbacks, "default");
  assert.equal(o.istekler[1].messages.at(-1).content[0].type, "tool_result");
  assert.equal(JSON.parse(o.depo.get("tur")).ogeler["4013"].karar, "t7");
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length, 0);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, "4013 beklemeye alındı.");
  assert.equal(JSON.parse(o.depo.get("sohbet:111")).length, 2);
});

test("asistan: 'sil' sadece onay düğmesi gönderir; Evet'le bir kez silinir", async () => {
  const o = asistanOrtami([aracCagrisi("sil_onayi_iste", { kod: "3100" }), mesaj(1, "Onay düğmesi gönderdim.")]);
  silmeTaklidi(o);
  await yazi(o.env, 111, "3100'ü sil");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0);
  const soru = cagrilar(o.gonderilen, "sendMessage").find((m) => m.govde.reply_markup);
  assert.match(soru.govde.text, /3 mesajı silinir/);
  assert.equal(soru.govde.reply_markup.inline_keyboard[0][0].callback_data, "ty:-:3100");
  await bas(o.env, 222, "ty:-:3100");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 3);
  assert.equal(JSON.parse(o.depo.get("atlananlar"))["3100"], KALICI);
  o.gonderilen.length = 0;
  await bas(o.env, 222, "ty:-:3100");
  assert.equal(cagrilar(o.gonderilen, "deleteMessage").length, 0); // iki kez silinmez
});

test("asistan: yönetici günlük 100 mesaj sınırı çalışır", async () => {
  const o = asistanOrtami([mesaj(1, "x")]);
  o.depo.set(`ai:${gunAnahtari(Math.floor(Date.now() / 1000))}`, "100");
  await yazi(o.env, 111, "merhaba");
  assert.equal(o.istekler.length, 0);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /sınırı doldu/);
});

test("asistan: harcama sınırı hatası anlaşılır mesaj verir", async () => {
  const o = asistanOrtami([]);
  const tg = globalThis.fetch;
  globalThis.fetch = async (url, istek) => String(url).startsWith("https://api.anthropic.com")
    ? new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC." } }), { status: 400, headers: { "content-type": "application/json" } })
    : tg(url, istek);
  await yazi(o.env, 111, "merhaba");
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /harcama sınırına ulaşıldı/);
});


// ---------- Fotoğraf tanıma ----------

const { katalogAdimi } = await import("./worker.js");

function tanimaOrtami(cevaplar) {
  const o = asistanOrtami(cevaplar);
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const adres = String(url);
    if (adres.includes("/file/bot")) { o.gonderilen.push({ url: adres, govde: {} }); return new Response(new Uint8Array([255, 216, 255, 1, 2, 3])); }
    if (adres.endsWith("/forwardMessage")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url: adres, govde });
      if (govde.message_id === 999) return new Response(JSON.stringify({ ok: false, description: "Bad Request: message to forward not found" }));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1, photo: [{ file_id: `k${govde.message_id}`, width: 90 }, { file_id: `o${govde.message_id}`, width: 320 }, { file_id: `b${govde.message_id}`, width: 1280 }] } }));
    }
    if (adres.endsWith("/getFile")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url: adres, govde });
      return new Response(JSON.stringify({ ok: true, result: { file_path: `photos/${govde.file_id}.jpg` } }));
    }
    return onceki(url, istek);
  };
  return o;
}
const json = (nesne) => mesaj(1, JSON.stringify(nesne));
const resimSayisi = (istek) => istek.messages[0].content.filter((c) => c.type === "image").length;

test("arşiv kanalı: sadece izinli kişi eklerse bağlanır; arşivdeki paylaşımlar kanala karışmaz", async () => {
  const o = rotasyonOrtami();
  const uyelik = (kimden) => ({ my_chat_member: { chat: { id: -555, type: "channel", title: "Kemal arşiv" }, from: { id: kimden, first_name: "X" }, new_chat_member: { status: "administrator", user: { id: 1 } } } });
  await guncellemeIsle(uyelik(999), o.env);
  assert.equal(o.depo.get("arsiv"), undefined);
  await guncellemeIsle(uyelik(111), o.env);
  assert.deepEqual(JSON.parse(o.depo.get("arsiv")), { id: -555, ad: "Kemal arşiv" });
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /Kemal arşivi olarak bağlandı/);
  await guncellemeIsle({ channel_post: { message_id: 7, date: o.simdi, chat: { id: -555, type: "channel" }, photo: [{ file_id: "f" }], caption: "CODE.7777" } }, o.env);
  assert.ok(!JSON.parse(o.depo.get("kodlar"))["7777"]);
});

test("katalog: 8'erli partilerle 320 px görsellerden tarif yazılır, bitince bir kez haber verilir", async () => {
  const kimlikler = ["3329", "3100", "3200", "2900", "~200"];
  const o = tanimaOrtami([
    json({ tarifler: kimlikler.map((k) => ({ kimlik: k, tarif: `tarif ${k}` })) }),
  ]);
  o.depo.set("arsiv", JSON.stringify({ id: -555, ad: "Kemal arşiv" }));
  await katalogAdimi(o.env, o.simdi);
  assert.equal(cagrilar(o.gonderilen, "forwardMessage").length, 5);
  assert.ok(cagrilar(o.gonderilen, "forwardMessage").every((f) => f.govde.chat_id === -555 && f.govde.from_chat_id === -100));
  assert.deepEqual(cagrilar(o.gonderilen, "getFile").map((g) => g.govde.file_id).sort(), ["o100", "o200", "o300", "o400", "o500"]);
  assert.equal(resimSayisi(o.istekler[0]), 5);
  assert.equal(o.istekler[0].output_config.format.type, "json_schema");
  const tarifler = JSON.parse(o.depo.get("tarifler"));
  assert.deepEqual(tarifler["3100"], { t: "tarif 3100", f: "o300", m: 300 });
  // ikinci çalışma: eksik yok → bir kez "Katalog hazır"
  await katalogAdimi(o.env, o.simdi + 300);
  await katalogAdimi(o.env, o.simdi + 600);
  assert.equal(o.istekler.length, 1);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").filter((m) => /Katalog hazır: 5 model/.test(m.govde.text)).length, 2); // ikisine, bir kez
});

test("katalog: kanalda bulunamayan paylaşım tekrar denenmez; arşiv yoksa hiçbir şey yapılmaz", async () => {
  const o = tanimaOrtami([json({ tarifler: [{ kimlik: "3100", tarif: "x" }] })]);
  o.depo.set("kodlar", JSON.stringify({ "3100": [{ ids: [300], tarih: o.simdi - 50 * GUN }], "3300": [{ ids: [999], tarih: o.simdi - 50 * GUN }] }));
  o.depo.set("kodsuz", "{}");
  await katalogAdimi(o.env, o.simdi);
  assert.equal(o.istekler.length, 0);
  o.depo.set("arsiv", JSON.stringify({ id: -555 }));
  await katalogAdimi(o.env, o.simdi);
  assert.equal(JSON.parse(o.depo.get("tarifhata"))["3300"], 3);
  assert.ok(JSON.parse(o.depo.get("tarifler"))["3100"]);
});

function tanimaHazir(o) {
  o.depo.set("tarifler", JSON.stringify({
    "3100": { t: "siyah uzun abiye, taşlı yaka", f: "o300", m: 300 },
    "3200": { t: "kırmızı iki parça takım", f: "o400", m: 400 },
    "~200": { t: "yeşil kemerli elbise", f: "o200", m: 200 },
  }));
}
const foto = (env, kisi, caption) => guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(kisi), from: { id: kisi, first_name: "Murat" }, photo: [{ file_id: "mk", width: 90 }, { file_id: "mo", width: 800 }, { file_id: "mb", width: 1280 }], caption } }, env);

test("fotoğraf tanıma: emin olunca 'büyük ihtimalle' + modelin fotoğrafı", async () => {
  const o = tanimaOrtami([json({ adaylar: ["3100", "~200", "yok"] }), json({ en_iyi: "3100", guven: "yuksek", siralama: ["3100", "~200"], aciklama: "Yaka taşları ve kesim aynı." })]);
  tanimaHazir(o);
  await foto(o.env, 111, "müşteri soruyor");
  assert.equal(cagrilar(o.gonderilen, "getFile")[0].govde.file_id, "mo"); // 800 px
  assert.match(o.istekler[0].system[0].text, /3100 \| siyah uzun abiye/);
  assert.match(o.istekler[0].messages[0].content.at(-1).text, /not: müşteri soruyor/);
  assert.equal(resimSayisi(o.istekler[1]), 3); // müşteri + 2 aday ("yok" atıldı)
  const m = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.equal(m.parse_mode, "HTML");
  assert.match(m.text, /Bu büyük ihtimalle <b>3100<\/b> — son paylaşım \d\d\.\d\d\.2026/);
  const kopya = cagrilar(o.gonderilen, "copyMessage");
  assert.equal(kopya.length, 1);
  assert.equal(kopya[0].govde.message_id, 300);
  assert.equal(kopya[0].govde.chat_id, 111);
  assert.equal(o.depo.get(`ai:${gunAnahtari(Math.floor(Date.now() / 1000))}`), "1");
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0); // kanala hiçbir şey gitmez
});

test("fotoğraf tanıma: emin değilse en yakın 2–3 adayı fotoğraflarıyla gösterir", async () => {
  const o = tanimaOrtami([json({ adaylar: ["3200", "3100", "~200"] }), json({ en_iyi: "3200", guven: "orta", siralama: ["3200", "~200", "3100"], aciklama: "Renk farklı olabilir." })]);
  tanimaHazir(o);
  await foto(o.env, 222);
  const m = cagrilar(o.gonderilen, "sendMessage").at(-1).govde;
  assert.match(m.text, /Emin değilim \(en yakın: <b>3200<\/b>\)\. En yakın 3 aday/);
  const kopyalar = cagrilar(o.gonderilen, "copyMessage");
  assert.deepEqual(kopyalar.map((k) => k.govde.message_id), [400, 200, 300]);
  assert.match(kopyalar[1].govde.caption, /^Aday 2: kodsuz paylaşım/);
});

test("fotoğraf tanıma: katalog yoksa söyler, yapay zekâ çağrılmaz", async () => {
  const o = tanimaOrtami([]);
  await foto(o.env, 111);
  assert.equal(o.istekler.length, 0);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /Kemal arşiv/);
});

// ---------- Aylık harcama sınırı ----------

test("harcama: her çağrının maliyeti toplanır; 80 $ dolunca asistan, tanıma ve katalog durur", async () => {
  const { maliyetUsd, ayAnahtari } = await import("./harcama.js");
  assert.equal(maliyetUsd("claude-opus-5-5", { input_tokens: 1_000_000 }), 4);
  assert.equal(maliyetUsd("claude-opus-5-5", { output_tokens: 1000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }), 0.02 + 0.2 + 5);
  const o = tanimaOrtami([{ ...mesaj(1, "Merhaba"), usage: { input_tokens: 2000, output_tokens: 500 } }]);
  const su = Math.floor(Date.now() / 1000);
  await yazi(o.env, 111, "merhaba");
  assert.equal(o.depo.get(ayAnahtari(su)), String(2000 * 4 + 500 * 20)); // mikro-dolar: 0,018 $
  o.depo.set(ayAnahtari(su), String(80_000_000));
  await yazi(o.env, 111, "tekrar merhaba");
  assert.equal(o.istekler.length, 1);
  assert.match(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, /80 \$ yapay zekâ harcama sınırına ulaşıldı/);
  tanimaHazir(o);
  await foto(o.env, 111);
  assert.equal(o.istekler.length, 1);
  o.depo.set("arsiv", JSON.stringify({ id: -555 }));
  o.depo.delete("tarifler");
  await katalogAdimi(o.env, su);
  assert.equal(o.istekler.length, 1);
  assert.equal(cagrilar(o.gonderilen, "forwardMessage").length, 0);
});

// ---------- İstek defteri ve akşam raporu ----------

const { aksamRaporu } = await import("./worker.js");

test("istek defteri: asistan kaydeder; model kanala gelince ikisine kimlere haber verileceği gider (bir kez)", async () => {
  const o = asistanOrtami([aracCagrisi("istek_kaydet", { kod: "3100", musteri: "Angolalı müşteri", not: "siyah, 2 seri" }), mesaj(1, "Kaydettim.")]);
  await yazi(o.env, 222, "3100'ü Angolalı müşteri istedi, siyah 2 seri");
  const istekler = JSON.parse(o.depo.get("istekler"));
  assert.deepEqual([istekler[0].kod, istekler[0].musteri, istekler[0].durum], ["3100", "Angolalı müşteri", "bekliyor"]);
  o.gonderilen.length = 0;
  await guncellemeIsle({ channel_post: { message_id: 960, date: o.simdi, chat: kanal, photo: [{ file_id: "f" }], caption: "🔁 CODE.3100" } }, o.env);
  const h = cagrilar(o.gonderilen, "sendMessage").map((m) => m.govde.text);
  assert.equal(h.length, 2);
  assert.match(h[0], /3100 kanala geldi![\s\S]*t\.me\/Volonteroseoffical\/960[\s\S]*• Angolalı müşteri — siyah, 2 seri/);
  assert.equal(JSON.parse(o.depo.get("istekler"))[0].durum, "bildirildi");
  o.gonderilen.length = 0;
  await guncellemeIsle({ channel_post: { message_id: 961, date: o.simdi + 99, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3100" } }, o.env);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").length, 0);
});

test("tepki sayıları kaydedilir; 20:00 raporu bugünkü paylaşımları, en çok tepki alanları ve yarını gösterir", async () => {
  const o = turOrtami();
  const t = ist(10);
  await guncellemeIsle({ channel_post: { message_id: 970, date: t, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3100", media_group_id: "R" } }, o.env);
  await guncellemeIsle({ channel_post: { message_id: 971, date: t, chat: kanal, photo: [{ file_id: "f" }], media_group_id: "R" } }, o.env);
  await guncellemeIsle({ channel_post: { message_id: 972, date: ist(12), chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3200" } }, o.env);
  const tepki = (id, n) => guncellemeIsle({ message_reaction_count: { chat: kanal, message_id: id, date: t, reactions: [{ type: { type: "emoji", emoji: "❤" }, total_count: n }, { type: { type: "emoji", emoji: "🔥" }, total_count: 1 }] } }, o.env);
  await tepki(970, 7);
  await tepki(971, 2);
  await tepki(972, 3);
  await guncellemeIsle({ message_reaction_count: { chat: { id: -555 }, message_id: 972, date: t, reactions: [{ total_count: 99 }] } }, o.env); // başka kanal
  o.depo.set("kuyruk:4000", JSON.stringify({ kod: "4000", ids: [5000], kim: "Murat", zaman: 1, tur: 1 }));
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(19, 55));
  assert.ok(!cagrilar(o.gonderilen, "sendMessage").some((m) => /akşam raporu/.test(m.govde.text)));
  await rotasyon(o.env, ist(20));
  await rotasyon(o.env, ist(20, 5));
  const r = cagrilar(o.gonderilen, "sendMessage").filter((m) => /akşam raporu/.test(m.govde.text));
  assert.equal(r.length, 2); // bir kez, ikisine
  const metin = r[0].govde.text;
  assert.match(metin, /Bugün kanala 2 paylaşım yapıldı:\n• 10:00 3100 — ❤️ 11\n• 12:00 3200 — ❤️ 4/);
  assert.match(metin, /En çok tepki alanlar \(son 7 gün\):\n• 3100 — ❤️ 11/);
  assert.match(metin, /Yarının turu sabah 8:00'de gelir/);
  assert.match(metin, /Görüntülenme sayısını Telegram botlara vermiyor/);
  const dugme = r[0].govde.reply_markup.inline_keyboard[0][0];
  assert.equal(dugme.callback_data, "rp:3100");
  o.gonderilen.length = 0;
  await bas(o.env, 111, "rp:3100");
  assert.equal(cagrilar(o.gonderilen, "copyMessages")[0].govde.chat_id, 111); // sadece önizleme, kanala değil
});

// ---------- Alt yazı önerisi ----------

const { altyaziAdimi } = await import("./worker.js");
const { altyaziBirlestir, eskiBilgiler } = await import("./altyazi.js");

test("alt yazı: kod, beden, fiyat ve iletişim satırları eski yazıdan aynen; 4 dil; 1024 sınırı", () => {
  const eski = "✅ AVAILABLE NOW\n\n✅ TWO PIECE\n\n✅CODE.3329\n\n✅PRICE. 25$\n\n✅SIZE.  38/40/42/44\n📞TEL. wa.me/905362390091";
  assert.deepEqual(eskiBilgiler(eski), { beden: "SIZE.  38/40/42/44", fiyat: "PRICE. 25$", iletisim: ["📞TEL. wa.me/905362390091"] });
  const m = altyaziBirlestir({ etiket: "🔁 Repete geldi", kod: "3329", eski, diller: { tr: "Şık takım.", en: "Elegant set.", fr: "Ensemble élégant.", pt: "Conjunto elegante." } });
  assert.equal(m, "🔁 Repete geldi\n✅ CODE.3329\n📏 SIZE: 38/40/42/44\n💲 PRICE. 25$\n\n🇹🇷 Şık takım.\n🇬🇧 Elegant set.\n🇫🇷 Ensemble élégant.\n🇵🇹 Conjunto elegante.\n\n📞TEL. wa.me/905362390091");
  assert.equal(kodBul(m), "3329"); // dizin kodu okumaya devam eder
  const uzun = altyaziBirlestir({ etiket: "🆕 Yeni geldi", kod: "1", eski: "", diller: { tr: "x".repeat(400), en: "y".repeat(400), fr: "z".repeat(400), pt: "w".repeat(400) } });
  assert.ok(uzun.length <= 1024);
});

test("alt yazı: yeni kod 🆕, bilinen kod 🔁; öneri ikisine gelir, ✅ ile kanaldaki yazı değişir, ikinci basış işlemez", async () => {
  const o = tanimaOrtami([json({ tr: "Yeni şık takım.", en: "New chic set.", fr: "Nouvel ensemble chic.", pt: "Novo conjunto chique." })]);
  await guncellemeIsle({ channel_post: { message_id: 980, date: o.simdi, chat: kanal, photo: [{ file_id: "f" }], caption: "AVAILABLE NOW\nCODE.7001\nSIZE 38/40" } }, o.env);
  await guncellemeIsle({ channel_post: { message_id: 981, date: o.simdi, chat: kanal, photo: [{ file_id: "f" }], caption: "CODE.3100" } }, o.env);
  const sira = JSON.parse(o.depo.get("altyaziSira"));
  assert.deepEqual(sira.map((x) => [x.kod, x.mesaj, x.etiket]), [["7001", 980, "🆕 Yeni geldi"], ["3100", 981, "🔁 Repete geldi"]]);
  o.depo.set("altyaziSira", JSON.stringify([sira[0]]));
  o.gonderilen.length = 0;
  await altyaziAdimi(o.env, o.simdi);
  const oneriler = cagrilar(o.gonderilen, "sendMessage");
  assert.equal(oneriler.length, 2);
  assert.match(oneriler[0].govde.text, /7001 için yeni alt yazı önerisi[\s\S]*🆕 Yeni geldi\n✅ CODE\.7001\n📏 SIZE: 38\/40[\s\S]*🇵🇹 Novo conjunto chique\./);
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption").length, 0); // onaysız değişmez
  const [degistir] = oneriler[0].govde.reply_markup.inline_keyboard[0];
  await bas(o.env, 222, degistir.callback_data);
  const d = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].govde.chat_id, d[0].govde.message_id], [-100, 980]);
  assert.match(d[0].govde.caption, /^🆕 Yeni geldi\n✅ CODE\.7001/);
  assert.equal(cagrilar(o.gonderilen, "editMessageText").length, 2);
  o.gonderilen.length = 0;
  await bas(o.env, 111, degistir.callback_data);
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /Merdan zaten karar verdi/);
  assert.equal(JSON.parse(o.depo.get("altyaziSira")).length, 0);
});

test("alt yazı: Kemal'in yeniden paylaşımı 🔁; eski paylaşımın yazısı arşivden okunur; asistan sadece sıraya alır", async () => {
  const o = tanimaOrtami([aracCagrisi("altyazi_oner", { kod: "3200" }), mesaj(1, "Öneri hazırlanıyor."), json({ tr: "a", en: "b", fr: "c", pt: "d" })]);
  o.depo.set("arsiv", JSON.stringify({ id: -555 }));
  await yazi(o.env, 111, "3200'ün yazısını güzelleştir");
  assert.equal(cagrilar(o.gonderilen, "editMessageCaption").length, 0);
  const sira = JSON.parse(o.depo.get("altyaziSira"));
  assert.deepEqual([sira[0].kod, sira[0].ids, sira[0].eski], ["3200", [400], null]);
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek) => String(url).endsWith("/forwardMessage")
    ? (o.gonderilen.push({ url: String(url), govde: JSON.parse(istek.body) }), new Response(JSON.stringify({ ok: true, result: { message_id: 5, photo: [{ file_id: "x" }], caption: "CODE.3200\nSIZE 40/42\nwa.me/905362390091" } })))
    : onceki(url, istek);
  await altyaziAdimi(o.env, o.simdi);
  const oneri = cagrilar(o.gonderilen, "sendMessage").find((m) => /yeni alt yazı önerisi/.test(m.govde.text));
  assert.match(oneri.govde.text, /🔁 Repete geldi\n✅ CODE\.3200\n📏 SIZE: 40\/42[\s\S]*wa\.me\/905362390091/);
  assert.equal(cagrilar(o.gonderilen, "forwardMessage")[0].govde.chat_id, -555);
});

// ---------- Marka basma ----------

const { etiketPng } = await import("./marka.js");
const zlib = await import("node:zlib");

test("etiket PNG'si geçerli: imza, boyut, sıkıştırılmış veri açılıyor", () => {
  const png = etiketPng("3194");
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(png.buffer);
  const W = dv.getUint32(16);
  const H = dv.getUint32(20);
  assert.ok(W > 300 && W < 500 && H === 73, `${W}x${H}`);
  const idatUz = dv.getUint32(33);
  const ham = zlib.inflateSync(Buffer.from(png.slice(41, 41 + idatUz)));
  assert.equal(ham.length, H * (W * 4 + 1));
  assert.ok(etiketPng("~55").length < png.length); // kodsuzda sadece VOLONTE
});

function markaOrtami() {
  const o = tanimaOrtami([]);
  o.depo.set("arsiv", JSON.stringify({ id: -555 }));
  o.islenen = [];
  o.env.IMAGES = {
    input: (akis) => {
      const zincir = { akis, islem: [], transform(t) { this.islem.push(["transform", t]); return this; }, draw(e, s) { this.islem.push(["draw", e, s]); return this; },
        async output(f) { o.islenen.push({ islem: this.islem, f }); return { response: () => new Response(new Uint8Array([9, 9, 9])) }; } };
      return zincir;
    },
  };
  const onceki = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const adres = String(url);
    if (istek && istek.body instanceof FormData) {
      const alanlar = Object.fromEntries([...istek.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `dosya:${v.size}`]));
      o.gonderilen.push({ url: adres, govde: alanlar });
      const sayi = alanlar.media ? JSON.parse(alanlar.media).length : 1;
      const sonuc = Array.from({ length: sayi }, (_, i) => ({ message_id: 7000 + i }));
      return new Response(JSON.stringify({ ok: true, result: alanlar.media ? sonuc : sonuc[0] }));
    }
    if (adres.endsWith("/forwardMessage")) {
      const govde = JSON.parse(istek.body);
      o.gonderilen.push({ url: adres, govde });
      const id = govde.message_id;
      const m = id === 302 ? { message_id: 1, video: { file_id: "vid302" } } : { message_id: 1, photo: [{ file_id: `k${id}`, width: 90 }, { file_id: `b${id}`, width: 1280 }], ...(id === 300 ? { caption: "CODE.3100\nSIZE 38/40" } : {}) };
      return new Response(JSON.stringify({ ok: true, result: m }));
    }
    return onceki(url, istek);
  };
  return o;
}

test("marka: /marka önizlemesi sadece isteyene gider, kanala değil; fotoğraflar işlenir, video aynen", async () => {
  const o = markaOrtami();
  await guncellemeIsle({ message: { message_id: 1, date: 1, chat: ozel(111), from: { id: 111 }, text: "/marka 3100" } }, o.env);
  const grup = o.gonderilen.find((g) => g.url.endsWith("/sendMediaGroup"));
  assert.equal(grup.govde.chat_id, "111");
  const medya = JSON.parse(grup.govde.media);
  assert.deepEqual(medya.map((m) => [m.type, m.media]), [["photo", "attach://f0"], ["photo", "attach://f1"], ["video", "vid302"]]);
  assert.match(medya[0].caption, /Marka önizlemesi — 3100 \(kanala gitmedi\)\n\nCODE\.3100/);
  assert.equal(grup.govde.f0, "dosya:3");
  assert.deepEqual(cagrilar(o.gonderilen, "getFile").map((g) => g.govde.file_id), ["b300", "b301"]); // en büyük boyut
  assert.equal(o.islenen.length, 2);
  const [, etiket, yer] = o.islenen[0].islem[0];
  assert.deepEqual(etiket.islem, [["transform", { width: 384 }]]); // 1280 × 0,30
  assert.deepEqual(yer, { bottom: 38, right: 38 });
  assert.equal(o.islenen[0].f.format, "image/jpeg");
  assert.equal(o.depo.get("marka"), undefined); // açılmadı
  const dugme = cagrilar(o.gonderilen, "sendMessage").at(-1).govde.reply_markup.inline_keyboard[0][0];
  assert.equal(dugme.callback_data, "mk:acik");
  await bas(o.env, 111, "mk:acik");
  assert.equal(o.depo.get("marka"), "acik");
});

test("marka açıkken Kemal'in kanal paylaşımı markalı yüklenir; görsel aracı hata verirse markasız kopyaya döner", async () => {
  const o = markaOrtami();
  o.depo.set("marka", "acik");
  const r = await kanaldaPaylas(o.env, "3100", [300, 301], o.simdi);
  assert.equal(r.ok, true);
  const grup = o.gonderilen.find((g) => g.url.endsWith("/sendMediaGroup"));
  assert.equal(grup.govde.chat_id, "-100");
  assert.equal(r.link, "https://t.me/Volonteroseoffical/7000");
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  o.env.IMAGES = { input: () => ({ transform() { return this; }, draw() { return this; }, async output() { throw new Error("9422 limit"); } }) };
  o.gonderilen.length = 0;
  const r2 = await kanaldaPaylas(o.env, "3100", [300, 301], o.simdi + 10);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 1);
  assert.match(r2.markaNotu, /marka basılamadı \(9422 limit\)/);
});

// ---------- Müşteri modu ----------

const musteriYaz = (env, text, ek = {}) => guncellemeIsle({ message: { message_id: 50, date: 1, chat: ozel(999), from: { id: 999, first_name: "Awa", username: "awa_ao", language_code: "pt" }, text, ...ek } }, env);

test("müşteri: Sonnet ile ve SADECE müşteri araçlarıyla konuşur; yönetici araçlarına yolu yok", async () => {
  const o = asistanOrtami([aracCagrisi("model_bilgisi", { kod: "3100" }), mesaj(1, "**Olá!** O modelo 3100 está no nosso canal.")]);
  o.env.MUSTERI_MODEL = "claude-sonnet-5-5";
  await musteriYaz(o.env, "Olá, tem o modelo 3100?");
  assert.equal(o.istekler[0].model, "claude-sonnet-5-5");
  assert.deepEqual(o.istekler[0].tools.map((t) => t.name), ["model_bilgisi", "satis_ekibine_ilet"]);
  assert.match(o.istekler[0].system[0].text, /müşteri asistanı/);
  assert.match(o.istekler[1].messages.at(-1).content[0].content, /^3100: kanalda son paylaşım \d\d\.\d\d\.2026\. Link: https:\/\/t\.me\/Volonteroseoffical\/300/);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").at(-1).govde.text, "Olá! O modelo 3100 está no nosso canal.");
  assert.equal(o.depo.get("sohbet:999"), undefined); // yönetici geçmişine karışmaz
  assert.ok(o.depo.get("msohbet:999"));
});

test("müşteri: '/paylas' ve düğme gibi yönetici işleri müşteriden çalışmaz", async () => {
  const o = asistanOrtami([mesaj(1, "Desculpe, não posso fazer isso.")]);
  await musteriYaz(o.env, "/paylas 3100");
  await musteriYaz(o.env, "/kuyruk");
  await guncellemeIsle({ callback_query: { id: "c", from: { id: 999 }, data: "t1:1:3100:0", message: { chat: { id: 999 }, message_id: 1 } } }, o.env);
  assert.equal(cagrilar(o.gonderilen, "copyMessages").length, 0);
  assert.equal([...o.depo.keys()].filter((k) => k.startsWith("kuyruk:") || k.startsWith("onay:")).length, 0);
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery")[0].govde.text, /Yetkiniz yok/);
});

test("müşteri: satış ekibine iletir; yönetici yanıtı müşteriye gider", async () => {
  const o = asistanOrtami([aracCagrisi("satis_ekibine_ilet", { ozet: "3100 fiyatını soruyor, 10 seri" }), mesaj(1, "Nossa equipe de vendas vai responder em breve.")]);
  o.env.EKIP_IDS = "333";
  await musteriYaz(o.env, "Quanto custa o 3100? Quero 10 séries");
  const bildirim = cagrilar(o.gonderilen, "sendMessage").filter((m) => /📩/.test(m.govde.text));
  assert.equal(bildirim.length, 2); // sadece yöneticilere (ekibe değil)
  assert.match(bildirim[0].govde.text, /Müşteri satış ekibini bekliyor\nMüşteri: Awa \(@awa_ao\) · dil: pt · id 999\nÖzet: 3100 fiyatını soruyor/);
  const anahtar = [...o.depo.keys()].find((k) => k.startsWith("iletim:111:"));
  const iletimId = Number(anahtar.split(":")[2]);
  o.gonderilen.length = 0;
  await guncellemeIsle({ message: { message_id: 77, date: 1, chat: ozel(111), from: { id: 111 }, text: "Preço: 25$ por peça", reply_to_message: { message_id: iletimId } } }, o.env);
  const kopya = cagrilar(o.gonderilen, "copyMessage")[0].govde;
  assert.deepEqual([kopya.chat_id, kopya.from_chat_id, kopya.message_id], [999, 111, 77]);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /Müşteriye iletildi/);
});

test("müşteri: kişi başı 15 mesaj ve toplam 30 mesaj sınırı; sınırda yapay zekâ yok, ekibe günde bir kez haber", async () => {
  const o = asistanOrtami([]);
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  o.depo.set(`m:999:${gun}`, "15");
  await musteriYaz(o.env, "olá");
  await musteriYaz(o.env, "olá de novo");
  assert.equal(o.istekler.length, 0);
  assert.match(cagrilar(o.gonderilen, "sendMessage").filter((m) => m.govde.chat_id === 999).at(-1).govde.text, /Nossa equipe de vendas vai responder em breve/);
  assert.equal(cagrilar(o.gonderilen, "sendMessage").filter((m) => /Günlük otomatik cevap sınırı doldu/.test(m.govde.text)).length, 2); // bir kez, ikisine
  o.depo.delete(`m:999:${gun}`);
  o.depo.set(`mtoplam:${gun}`, "30");
  await musteriYaz(o.env, "oi");
  assert.equal(o.istekler.length, 0);
});

test("müşteri fotoğrafı: Sonnet ile tanınır, cevap müşterinin dilinde; ekip fotoğrafla haberdar edilir", async () => {
  const o = tanimaOrtami([json({ adaylar: ["3100"] }), json({ en_iyi: "3100", guven: "yuksek", siralama: ["3100"], aciklama: "aynı" })]);
  o.env.MUSTERI_MODEL = "claude-sonnet-5-5";
  tanimaHazir(o);
  await musteriYaz(o.env, undefined, { photo: [{ file_id: "mk", width: 90 }, { file_id: "mo", width: 800 }], caption: "tem este?" });
  assert.ok(o.istekler.every((i) => i.model === "claude-sonnet-5-5"));
  const musteriye = cagrilar(o.gonderilen, "sendMessage").filter((m) => m.govde.chat_id === 999);
  assert.match(musteriye[0].govde.text, /^Este parece ser o nosso modelo 3100/);
  const kopyalar = cagrilar(o.gonderilen, "copyMessage");
  assert.ok(kopyalar.some((k) => k.govde.chat_id === 999 && k.govde.message_id === 300));
  assert.ok(kopyalar.some((k) => k.govde.chat_id === "111" && k.govde.from_chat_id === 999)); // müşterinin fotoğrafı ekibe
  assert.ok(cagrilar(o.gonderilen, "sendMessage").some((m) => /büyük ihtimalle 3100/.test(m.govde.text) && m.govde.chat_id === "111"));
});

// ---------- Sayım Sami: Vegawin stok köprüsü ----------

import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";

function stokBagla(o) {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q, ...p) {
      if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; }
      const st = db.prepare(q);
      const satirlar = /^\s*SELECT/i.test(q) ? st.all(...p).map((r) => ({ ...r })) : (st.run(...p), []);
      return { toArray: () => satirlar };
    },
  };
  const nesne = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => nesne.fetch(new Request(url, init)) }) };
  o.env.KOPRU_VOLONTE = "kopru-anahtari-123";
}
const kopru = (env, urunler, anahtar = "kopru-anahtari-123", magaza = "VOLONTE") =>
  worker.fetch(new Request("https://x/kopru", { method: "POST", headers: { "X-Magaza": magaza, Authorization: `Bearer ${anahtar}` }, body: JSON.stringify({ urunler }) }), env);

test("stok köprüsü: anahtarsız veri alınmaz; ilk veride soru yok; adet 0'a düşünce 3 düğmeli soru; ilk basan geçerli", async () => {
  const o = rotasyonOrtami();
  stokBagla(o);
  assert.equal((await kopru(o.env, [{ kod: "3100", adet: 3 }], "yanlis")).status, 401);
  assert.equal((await kopru(o.env, [{ kod: "3100", adet: 3 }], "kopru-anahtari-123", "BLACKROSE")).status, 401); // kendi anahtarı yok
  let r = await kopru(o.env, [{ kod: "3100", ad: "ELBISE", adet: 3, fiyat: 25 }, { kod: "3200", adet: 0, fiyat: 30 }, { kod: "3329", adet: -2 }, { kod: "001", ad: "001 TEKLEME", adet: 146 }]);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).yazilan, 3); // 0 ile başlayan iç kart alınmaz
  assert.equal(cagrilar(o.gonderilen, "copyMessage").length + cagrilar(o.gonderilen, "sendMessage").length, 0); // ilk veride soru yok

  r = await kopru(o.env, [{ kod: "3100", ad: "ELBISE", adet: 0, fiyat: 25 }]);
  assert.deepEqual(await r.json(), { ok: true, yazilan: 1, yeniSoru: 1 });
  const sorular = cagrilar(o.gonderilen, "copyMessage");
  assert.equal(sorular.length, 2); // ikisine, modelin fotoğrafıyla
  assert.match(sorular[0].govde.caption, /📦 3100 — ELBISE\nVegawin: stok bitti \(adet 0\)/);
  assert.deepEqual(sorular[0].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["🔁 Repete olacak", "🗑 Sil", "⏳ Beklesin"]);

  o.gonderilen.length = 0;
  await bas(o.env, 222, "sz:r:3100");
  const d = cagrilar(o.gonderilen, "editMessageCaption");
  assert.equal(d.length, 2);
  assert.match(d[0].govde.caption, /🔁 Merdan: repete olacak/);
  await bas(o.env, 111, "sz:s:3100");
  assert.match(cagrilar(o.gonderilen, "answerCallbackQuery").at(-1).govde.text, /Merdan zaten karar verdi/);

  // Stoksuz/eksi modeller turda sorulmaz
  o.gonderilen.length = 0;
  await rotasyon(o.env, ist(8, 0, 1));
  const tur = JSON.parse(o.depo.get("tur"));
  assert.deepEqual(Object.keys(tur.ogeler), ["~200"]); // 3100 (0), 3200 (0) gizli; 3329 yeni

  // Repete: stok gelince kendiliğinden görünür
  await kopru(o.env, [{ kod: "3100", ad: "ELBISE", adet: 4, fiyat: 25 }]);
  o.gonderilen.length = 0;
  await guncellemeIsle({ message: { message_id: 3, date: 1, chat: ozel(111), from: { id: 111 }, text: "/stok 3100" } }, o.env);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /📦 3100 — ELBISE\n• VOLONTE: 4 adet · 25 \$[\s\S]*Toplam: 4 → görünür/);
});

test("stok köprüsü: Sil gizler (stok gelse de); Beklesin 7 gün sonra tekrar sorar; ekip de cevaplayabilir", async () => {
  const o = rotasyonOrtami();
  o.env.EKIP_IDS = "333";
  stokBagla(o);
  await kopru(o.env, [{ kod: "3100", adet: 2 }, { kod: "3200", adet: 1 }]);
  await kopru(o.env, [{ kod: "3100", adet: 0 }, { kod: "3200", adet: 0 }]);
  await bas(o.env, 333, "sz:s:3100");
  await bas(o.env, 111, "sz:b:3200");
  await kopru(o.env, [{ kod: "3100", adet: 5 }]);
  o.gonderilen.length = 0;
  await guncellemeIsle({ message: { message_id: 3, date: 1, chat: ozel(333), from: { id: 333 }, text: "/stok 3100" } }, o.env);
  assert.match(cagrilar(o.gonderilen, "sendMessage")[0].govde.text, /gizli[\s\S]*silindi\/gizli/);
  // 7 gün sonra: 3200 hâlâ stoksuz → tekrar sorulur (5 dakikalık görevde)
  o.gonderilen.length = 0;
  const sonra = Math.floor(Date.now() / 1000) + 7 * GUN + 60;
  const st = await o.env.STOK.get().fetch("https://stok/sorular", { method: "POST", body: JSON.stringify({ simdi: sonra, enFazla: 6 }) });
  assert.deepEqual((await st.json()).map((x) => x.kod), ["3200"]);
});

// ---------- Karma depo: Kemal kendi nesnesinde ----------
import { KatalogDO } from "./worker.js";

test("Kemal nesnesi: Telegram güncellemesi ve 5 dk görevi DO'da çalışır; tur/sıra DO'ya, kodlar KV'ye; ilk seferde KV'den kopyalanır (silinmez)", async () => {
  const o = turOrtami();
  o.depo.set("kuyruk:3999", JSON.stringify({ kod: "3999", ids: [7000], kim: "Murat", zaman: 0 })); // eski kayıt (KV)
  o.depo.set("sohbet:111", JSON.stringify([{ role: "user", content: "merhaba" }]));
  const depolar = new Map();
  const nesneler = new Map();
  const sahteDepo = () => {
    const m = new Map();
    return { m, async get(k) { return Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, m.get(x)])) : m.get(k); }, async put(k, v) { m.set(k, structuredClone(v)); }, async delete(k) { return m.delete(k); }, async list({ prefix = "" } = {}) { return new Map([...m].filter(([k]) => k.startsWith(prefix)).sort()); } };
  };
  o.env.KATALOG = {
    idFromName: (ad) => ad,
    get: (ad) => {
      if (!nesneler.has(ad)) {
        const storage = sahteDepo();
        depolar.set(ad, storage);
        nesneler.set(ad, new KatalogDO({ storage, blockConcurrencyWhile: (f) => f() }, o.env));
      }
      return { fetch: (url, init) => nesneler.get(ad).fetch(new Request(url, init)) };
    },
  };
  o.env.KAYIT.list = async ({ prefix }) => ({ keys: [...o.depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true });
  await worker.scheduled({}, o.env);
  const kemal = depolar.get("kemal").m;
  assert.ok(kemal.has("kv:tur"));                       // tur DO'da
  assert.equal(JSON.parse(kemal.get("kv:sohbet:111").v)[0].content, "merhaba"); // eski kayıt kopyalandı
  assert.ok(o.depo.has("kuyruk:3999") && o.depo.has("sohbet:111")); // eski KV kayıtları silinmedi
  assert.equal(kemal.has("kv:kuyruk:3999"), false); // dünden kalan sıra yeni turda (DO'da) temizlendi
  const rapor = JSON.parse(o.depo.get("goc:kemal"));
  assert.deepEqual([rapor.kopyalanan, rapor.esit, rapor.farkliSayi], [2, 2, 0]);
  assert.equal(turMesajlari(o.gonderilen).length, 10);
  // Telegram düğmesi de aynı nesnede: onay DO'daki tura ve sıraya yazılır
  const r = await worker.fetch(new Request("https://x/telegram", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "gizli123" }, body: JSON.stringify({ callback_query: { id: "c", from: { id: 111, first_name: "Murat" }, data: "t1:1:4013:0", message: { chat: { id: 111 }, message_id: 1 } } }) }), o.env);
  assert.equal(r.status, 200);
  assert.ok(kemal.has("kv:kuyruk:4013"));
  assert.equal(o.depo.get("kuyruk:4013"), undefined); // KV'ye yazılmadı
});
