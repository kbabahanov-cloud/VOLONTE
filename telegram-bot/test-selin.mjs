// Çalıştırma: node --test test-selin.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import selin, { guncelleme, listeAdimi, hazirlaAdimi, listeAdaylari, bedenBul, gunlukHedef, eksikleriGonder } from "./selin.js";

const GUN = 86400;
const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 22 + gunEk, hh - 3, mm) / 1000;

function ortam() {
  const depo = new Map();
  const g = [];
  const istekler = [];
  const github = { dosyalar: new Map(), commitler: [], istekler: [] };
  const env = {
    BOT_TOKEN: "selin-token", WEBHOOK_SECRET: "s", ALLOWED_IDS: "111,222", ANTHROPIC_API_KEY: "k",
    GITHUB_TOKEN: "gh", GITHUB_REPO: "kbabahanov-cloud/VOLONTE", SITE_URL: "https://kbabahanov-cloud.github.io/VOLONTE",
    KAYIT: {
      async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
    },
  };
  const simdi = ist(10);
  depo.set("kanal", JSON.stringify({ id: -100, kullanici: "Volonteroseoffical" }));
  depo.set("arsiv", JSON.stringify({ id: -555 }));
  depo.set("kodlar", JSON.stringify({
    "3194": [{ ids: [300, 301], tarih: simdi - 10 * GUN }, { ids: [200], tarih: simdi - 90 * GUN }],
    "3100": [{ ids: [400], tarih: simdi - 50 * GUN }],
    "2900": [{ ids: [100], tarih: simdi - 200 * GUN }],
  }));
  depo.set("kodsuz", "{}");
  depo.set("tarifler", JSON.stringify({ "3194": { t: "siyah kruvaze elbise" } }));
  depo.set("hicgelmeyecek", JSON.stringify({ "2900": { kim: "x" } }));
  let n = 1000;
  globalThis.fetch = async (url, istek = {}) => {
    const adres = String(url);
    if (adres.startsWith("https://api.github.com")) {
      const yol = adres.replace("https://api.github.com/repos/kbabahanov-cloud/VOLONTE", "");
      const govde = istek.body ? JSON.parse(istek.body) : null;
      github.commitler.push([istek.method || "GET", yol, govde]);
      const cevap = (o, durum = 200) => new Response(JSON.stringify(o), { status: durum });
      if (yol.startsWith("/contents/veri/urunler.json")) {
        const v = github.dosyalar.get("veri/urunler.json");
        return v ? cevap({ content: Buffer.from(v).toString("base64"), sha: "x" }) : cevap({ message: "Not Found" }, 404);
      }
      if (yol.startsWith("/contents/istekler/")) {
        if ((istek.method || "GET") === "GET") return cevap({ message: "Not Found" }, 404);
        github.istekler.push(govde);
        return cevap({ content: { sha: "i1" } }, 201);
      }
      if (yol === "/git/ref/heads/main") return cevap({ object: { sha: "c0" } });
      if (yol === "/git/commits/c0") return cevap({ tree: { sha: "t0" } });
      if (yol === "/git/blobs") return cevap({ sha: `b${n++}` });
      if (yol === "/git/trees") {
        for (const e of govde.tree) {
          if (e.sha === null) github.dosyalar.delete(e.path);
          else github.dosyalar.set(e.path, e.content ?? `blob:${e.sha}`);
        }
        return cevap({ sha: "t1" });
      }
      if (yol === "/git/commits") return cevap({ sha: "c1" });
      if (yol === "/git/refs/heads/main") return cevap({ ref: "ok" });
      return cevap({ message: "?" }, 500);
    }
    if (adres.startsWith("https://api.anthropic.com")) {
      istekler.push(JSON.parse(istek.body));
      const icerik = { baslik: "Black Wrap Dress", kategori: "dresses", aciklama: { en: "Wrap dress.", fr: "Robe portefeuille.", pt: "Vestido transpassado.", tr: "Kruvaze elbise." }, pozlar: [{ poz: 1, net: true, not: "" }, { poz: 2, net: false, not: "bulanık" }, { poz: 3, net: true, not: "" }] };
      return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(icerik) }], usage: { input_tokens: 1000, output_tokens: 200 } }), { headers: { "content-type": "application/json" } });
    }
    if (adres.includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]));
    const metod = adres.split("/").pop();
    const govde = JSON.parse(istek.body || "{}");
    g.push({ metod, govde });
    if (metod === "forwardMessage") {
      const id = govde.message_id;
      const m = id === 301 ? { video: { file_id: "v301", file_unique_id: "uv301", duration: 12 } }
        : { photo: [{ file_id: `k${id}`, file_unique_id: `uk${id}`, width: 320, height: 427 }, { file_id: `o${id}`, file_unique_id: `uo${id}`, width: 800, height: 1067 }, { file_id: `b${id}`, file_unique_id: `u${id === 200 ? 300 : id}`, width: 1280, height: 1707 }], caption: id === 300 ? "CODE.3194\nSIZE. 38/40/42/44" : undefined };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1, ...m } }));
    }
    if (metod === "getFile") return new Response(JSON.stringify({ ok: true, result: { file_path: `p/${govde.file_id}.jpg` } }));
    if (metod === "sendMediaGroup") return new Response(JSON.stringify({ ok: true, result: govde.media.map((m, i) => ({ message_id: n++, photo: [{ file_id: `kk${i}`, width: 320, height: 427 }, { file_id: `K${i}`, width: 1080, height: 1440 }] })) }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: n++ } }));
  };
  return { env, depo, g, istekler, github, simdi };
}
const cagri = (g, m) => g.filter((x) => x.metod === m);
const bas = (env, kisi, data) => guncelleme({ callback_query: { id: "c", from: { id: kisi, first_name: kisi === 222 ? "Merdan" : "Murat" }, data, message: { chat: { id: kisi }, message_id: 5 } } }, env);

test("rehber onaylanmadan liste gelmez; onaydan sonra en yeni modeller sorulur (silinenler hariç)", async () => {
  const o = ortam();
  await listeAdimi(o.env, o.simdi);
  assert.equal(o.g.length, 0);
  o.depo.set("selin:rehberOnay", "1");
  await listeAdimi(o.env, ist(8));
  assert.equal(o.g.length, 0); // 09:00'dan önce yok
  await listeAdimi(o.env, o.simdi);
  const kartlar = cagri(o.g, "copyMessage");
  assert.deepEqual(kartlar.filter((k) => k.govde.chat_id === "111").map((k) => k.govde.caption.split(" ")[0]), ["3194", "3100"]);
  assert.deepEqual(kartlar[0].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Mağazada var", "❌ Yok"]);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /Ben Selin\. Bugün 50 model/);
});

test("kimse /start yazmadıysa model 'soruldu' sayılmaz, günlük hak harcanmaz", async () => {
  const o = ortam();
  o.depo.set("selin:rehberOnay", "1");
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) =>
    String(url).includes("api.telegram.org") ? new Response(JSON.stringify({ ok: false, description: "Forbidden: bot can't initiate conversation with a user" })) : asil(url, istek);
  await listeAdimi(o.env, o.simdi);
  globalThis.fetch = asil;
  assert.equal(o.depo.get("selin:modeller"), undefined);
  assert.ok(![...o.depo.keys()].some((k) => k.startsWith("selin:liste:")));
  assert.match(JSON.parse(o.depo.get("selin:hata")).hata, /initiate conversation/);
  await listeAdimi(o.env, o.simdi); // /start sonrası normal akış
  assert.equal(Object.keys(JSON.parse(o.depo.get("selin:modeller"))).length, 2);
});

test("ekip: listeyi alır, düğmeye basar; geç gelene eksikler gönderilir, ilk basan geçerli; /liste sadece yöneticide", async () => {
  const o = ortam();
  o.env.EKIP_IDS = "333";
  o.depo.set("selin:rehberOnay", "1");
  // 222 (Merdan) henüz /start yazmamış
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) =>
    String(url).includes("/copyMessage") && JSON.parse(istek.body).chat_id === "222"
      ? new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" })) : asil(url, istek);
  await listeAdimi(o.env, o.simdi);
  globalThis.fetch = asil;
  const alan = (g) => [...new Set(cagri(g, "copyMessage").map((k) => k.govde.chat_id))];
  assert.deepEqual(alan(o.g), ["111", "333"]); // 222 denendi ama ulaşılamadı
  let m = JSON.parse(o.depo.get("selin:modeller"));
  assert.deepEqual(m["3194"].mesajlar.map(([k]) => k), ["111", "333"]);

  o.g.length = 0;
  await eksikleriGonder(o.env, o.simdi); // Merdan /start yazdı
  assert.deepEqual(alan(o.g), ["222"]);
  m = JSON.parse(o.depo.get("selin:modeller"));
  assert.deepEqual(m["3194"].mesajlar.map(([k]) => k), ["111", "333", "222"]);
  o.g.length = 0;
  await eksikleriGonder(o.env, o.simdi);
  assert.equal(o.g.length, 0); // herkeste var, tekrar gönderilmez

  await bas(o.env, 333, "sy:3194");
  assert.equal(cagri(o.g, "editMessageCaption").length, 3); // üç kişide de düğmeler kapandı
  await bas(o.env, 111, "sv:3194");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /zaten işaretledi/);

  o.g.length = 0;
  await guncelleme({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "/liste" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /sadece Murat ve Merdan/);
  await bas(o.env, 444, "sv:3100");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Yetkiniz yok/);
});

test("kanaldan silinmiş paylaşım liste takılmasın: model atlanır, sıradaki sorulur; ulaşılamayan kişi not edilir", async () => {
  const o = ortam();
  o.env.EKIP_IDS = "333";
  o.depo.set("selin:rehberOnay", "1");
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => {
    const b = istek && istek.body && String(url).includes("/copyMessage") ? JSON.parse(istek.body) : null;
    if (b && b.message_id === 300) return new Response(JSON.stringify({ ok: false, description: "Bad Request: message to copy not found" }));
    if (b && b.chat_id === "333") return new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }));
    return asil(url, istek);
  };
  await listeAdimi(o.env, o.simdi);
  globalThis.fetch = asil;
  const m = JSON.parse(o.depo.get("selin:modeller"));
  assert.equal(m["3194"].durum, "kanaldayok");
  assert.equal(m["3100"].durum, "soruldu");
  assert.deepEqual(Object.keys(JSON.parse(o.depo.get("selin:ulasilamayan"))), ["333"]);
  assert.equal(o.depo.get(`selin:liste:2026-10-22`), "1");
});

test("videodan kare: sadece videosu olan model → GitHub'a istek, tek kullanımlık video bağlantısı; adaylar onaya gelir; ilk seçen geçerli; onaylı kare sitede kullanılır, bir kez üretilir", async () => {
  const o = ortam();
  o.env.SELF_URL = "https://selin.test";
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["3300"] = [{ ids: [301], tarih: o.simdi - 20 * GUN }]; // 301: video
  o.depo.set("kodlar", JSON.stringify(kodlar));
  o.depo.set("selin:modeller", JSON.stringify({ "3300": { durum: "hazirlaniyor", zaman: 1 } }));
  o.depo.set("selin:hazirla", JSON.stringify(["3300"]));
  await hazirlaAdimi(o.env, o.simdi);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].durum, "kare-bekliyor");
  assert.equal(o.istekler.length, 0); // yapay zekâ çağrılmadı
  const istek = o.github.istekler[0];
  assert.equal(istek.branch, "kareler");
  const icerik = JSON.parse(Buffer.from(istek.content, "base64").toString());
  assert.equal(icerik.geri, "https://selin.test/kare");
  const t = icerik.t;
  assert.equal(icerik.video, `https://selin.test/video?t=${t}`);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /3300: sadece videosu var/);

  // GitHub Actions videoyu indirir
  const v = await selin.fetch(new Request(icerik.video), o.env);
  assert.equal(v.status, 200);
  assert.equal(cagri(o.g, "getFile").at(-1).govde.file_id, "v301");
  assert.equal((await selin.fetch(new Request("https://selin.test/video?t=yanlis"), o.env)).status, 404);

  // Sonuç: yabancı adres süzülür; yanlış anahtar reddedilir
  const ham = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/abc/kareler/3300/";
  const geri = (govde) => selin.fetch(new Request("https://selin.test/kare", { method: "POST", body: JSON.stringify(govde) }), o.env);
  assert.equal((await geri({ t: "yanlis", kod: "3300", dosyalar: [] })).status, 403);
  o.g.length = 0;
  assert.equal((await geri({ t, kod: "3300", dosyalar: [{ url: ham + "aday-1.jpg" }, { url: "https://kotu.example/x.jpg" }, { url: ham + "aday-2.jpg" }] })).status, 200);
  const album = cagri(o.g, "sendMediaGroup");
  assert.equal(album.length, 2); // iki kişiye
  assert.deepEqual(album[0].govde.media.map((m) => m.media), [ham + "aday-1.jpg", ham + "aday-2.jpg"]);
  const kart = cagri(o.g, "sendMessage")[0];
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ 1. kare", "✅ 2. kare", "❌ Hiçbiri"]);
  assert.equal((await geri({ t, kod: "3300", dosyalar: [] })).status, 403); // anahtar tek kullanımlık

  await bas(o.env, 222, "kk:3300:2");
  const kare = JSON.parse(o.depo.get("kare:3300"));
  assert.deepEqual([kare.durum, kare.file_id, kare.url, kare.kim], ["onayli", "K1", ham + "aday-2.jpg", "Merdan"]);
  assert.equal(cagri(o.g, "editMessageText").length, 2);
  await bas(o.env, 111, "kk:3300:1");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Merdan zaten seçti/);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].durum, "hazirlaniyor");

  // Hazırlık onaylı kareyle devam eder; yeniden kare istenmez
  o.g.length = 0;
  await hazirlaAdimi(o.env, o.simdi);
  assert.equal(o.github.istekler.length, 1);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].taslak.fotolar[0].buyuk.file_id, "K1");
  assert.ok(cagri(o.g, "sendMessage").some((m) => /3300 — siteye hazır taslak/.test(m.govde.text)));
});

test("günlük hedef: ilk 7 gün 50, sonra 10", async () => {
  const o = ortam();
  assert.equal(await gunlukHedef(o.env, o.simdi), 50);
  assert.equal(await gunlukHedef(o.env, o.simdi + 6 * GUN), 50);
  assert.equal(await gunlukHedef(o.env, o.simdi + 7 * GUN + 1), 10);
});

test("bedenler kanal yazısından okunur; 'yok' denen 30 gün sonra tekrar sorulur", () => {
  assert.equal(bedenBul(["✅CODE.3329\n✅SIZE.  38/40/42/44"]), "38-40-42-44");
  assert.equal(bedenBul(["AVAILABLE NOW"]), null);
  assert.equal(listeAdaylari({ kodlar: { A: [{ ids: [1], tarih: 5 }] }, kodsuz: {}, silinenler: {}, atlananlar: {} }, { A: { durum: "yok", zaman: 0 } }, 31 * GUN).length, 1);
  assert.equal(listeAdaylari({ kodlar: { A: [{ ids: [1], tarih: 5 }] }, kodsuz: {}, silinenler: {}, atlananlar: {} }, { A: { durum: "yok", zaman: 0 } }, 20 * GUN).length, 0);
});

test("var → hazırlık: bütün pozlar (tekrarsız, en büyük boyut), video gömülür, onay kartı; onaylanınca GitHub'a tek commit + link", async () => {
  const o = ortam();
  o.depo.set("selin:rehberOnay", "1");
  await listeAdimi(o.env, o.simdi);
  await bas(o.env, 222, "sv:3194");
  assert.deepEqual(JSON.parse(o.depo.get("selin:hazirla")), ["3194"]);
  assert.equal(cagri(o.g, "editMessageCaption").length, 2); // ikisinde de güncellendi
  await bas(o.env, 111, "sv:3194");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Merdan zaten işaretledi/);

  o.g.length = 0;
  await hazirlaAdimi(o.env, o.simdi);
  // 300 (foto), 301 (video), 200 (300'ün aynısı → tekrarsız)
  assert.deepEqual(cagri(o.g, "forwardMessage").map((f) => f.govde.message_id), [300, 301, 200]);
  assert.equal(o.istekler.length, 1);
  assert.equal(o.istekler[0].messages[0].content.filter((c) => c.type === "image").length, 1);
  assert.match(o.istekler[0].messages[0].content.at(-1).text, /VOLONTE yazı rehberi/);
  const kart = cagri(o.g, "sendMessage").find((m) => /siteye hazır taslak/.test(m.govde.text));
  assert.match(kart.govde.text, /Kategori: Elbise \(yanlışsa/);
  assert.match(kart.govde.text, /Bedenler: 38-40-42-44 — Küçük \(alt yazıdan öneri\)/);
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✓ 📏 Küçük", "📏 Büyük", "📏 İkisi de"]);
  assert.match(kart.govde.text, /Videolar: 1/);
  assert.equal(cagri(o.g, "sendPhoto")[0].govde.photo, "b300"); // en yüksek çözünürlük
  assert.equal(o.github.commitler.length, 0); // onaysız siteye bir şey gitmez

  await bas(o.env, 111, "so:3194");
  const liste = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.equal(liste[0].kod, "3194");
  assert.deepEqual(liste[0].fotolar, ["galeri/3194/1.jpg"]);
  assert.deepEqual(liste[0].videolar, ["Volonteroseoffical/301"]);
  assert.equal(liste[0].fiyat, null);
  assert.ok(o.github.dosyalar.get("galeri/3194/1.jpg").startsWith("blob:"));
  assert.equal(o.github.commitler.filter(([m, y]) => m === "PATCH" && y === "/git/refs/heads/main").length, 1);
  const son = cagri(o.g, "editMessageText").at(-1).govde.text;
  assert.match(son, /3194 siteye eklendi \(Murat\)[\s\S]*urun\.html\?kod=3194/);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3194"].durum, "sitede");
});

test("beden yoksa onaylanmaz; /beden ile yazılır. Düzelt isteği yeniden yazdırır. Siteden kaldırma onay sorar", async () => {
  const o = ortam();
  o.depo.set("selin:rehberOnay", "1");
  o.depo.set("selin:modeller", JSON.stringify({ "3100": { durum: "onayda", zaman: 1, taslak: { baslik: "X", kategori: "sets", aciklama: { en: "a", fr: "b", pt: "c", tr: "d" }, bedenler: null, fotolar: [{ id: 400, buyuk: { file_id: "b400", width: 1280, height: 1700 }, net: true }], videolar: [], yazilar: [] } } }));
  await bas(o.env, 111, "so:3100");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Önce beden seçin/);
  await bas(o.env, 222, "sb:3100:b");
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3100"].taslak.bedenler, "44-46-48-50");
  await guncelleme({ message: { message_id: 9, chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/beden 3100 S M L" } }, o.env);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3100"].taslak.bedenler, "S-M-L");
  await bas(o.env, 111, "sd:3100");
  await guncelleme({ message: { message_id: 10, chat: { id: 111, type: "private" }, from: { id: 111 }, text: "başlık: Satin Two-Piece Set" } }, o.env);
  assert.match(o.istekler.at(-1).messages[0].content.at(-1).text, /Sahibin düzeltme isteği \(uygula\): başlık: Satin Two-Piece Set/);
  await bas(o.env, 111, "so:3100");
  assert.ok(o.github.dosyalar.get("veri/urunler.json"));
  o.g.length = 0;
  await bas(o.env, 222, "sk:3100");
  assert.equal(JSON.parse(o.github.dosyalar.get("veri/urunler.json")).length, 1); // henüz kalkmadı
  assert.equal(cagri(o.g, "editMessageReplyMarkup")[0].govde.reply_markup.inline_keyboard[0][0].callback_data, "se:3100");
  await bas(o.env, 222, "se:3100");
  assert.equal(JSON.parse(o.github.dosyalar.get("veri/urunler.json")).length, 0);
  assert.equal(o.github.dosyalar.get("galeri/3100/1.jpg"), undefined);
});

test("Selin izinsiz kişiye cevap vermez; düğmeleri çalışmaz", async () => {
  const o = ortam();
  await guncelleme({ message: { message_id: 1, chat: { id: 999, type: "private" }, from: { id: 999, first_name: "X" }, text: "/site" } }, o.env);
  assert.equal(o.g.length, 0);
  await bas(o.env, 999, "so:3194");
  assert.match(cagri(o.g, "answerCallbackQuery")[0].govde.text, /Yetkiniz yok/);
  assert.equal(o.github.commitler.length, 0);
  const r = await selin.fetch(new Request("https://x/telegram", { method: "POST", body: "{}" }), o.env);
  assert.equal(r.status, 401);
});
