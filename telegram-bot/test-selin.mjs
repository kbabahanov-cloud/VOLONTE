// Çalıştırma: node --test test-selin.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import selin, { duraklatildi, guncelleme, listeAdimi, hazirlaAdimi, listeAdaylari, bedenBul, gunlukHedef } from "./selin.js";

const GUN = 86400;
const ist = (hh, mm = 0, gunEk = 0) => Date.UTC(2026, 9, 22 + gunEk, hh - 3, mm) / 1000;

function ortam() {
  const depo = new Map();
  const g = [];
  const istekler = [];
  const github = { dosyalar: new Map(), commitler: [], istekler: [] };
  const env = {
    BOT_TOKEN: "selin-token", WEBHOOK_SECRET: "s", KILIT_TEST_ACIK: "1", ALLOWED_IDS: "111,222", ANTHROPIC_API_KEY: "k",
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

// Vegawin (Sayım Sami) stok deposunun sahtesi: kod → { toplam, fiyat, gizli }
function stokBagla(o, harita) {
  o.stok = harita;
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async (url, init) => {
    const { kodlar } = JSON.parse(init.body);
    return Response.json(Object.fromEntries(kodlar.filter((k) => o.stok[k]).map((k) => [k, o.stok[k]])));
  } }) };
}

test("liste: rehber onaylanmadan başlamaz; Vegawin'de stokta olan sorulmadan hazırlığa girer, olmayan 'sorulacak' olur; kimseye mesaj gitmez", async () => {
  const o = ortam();
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false } });
  await listeAdimi(o.env, o.simdi);
  assert.equal(o.depo.get("selin:modeller"), undefined);
  o.depo.set("selin:rehberOnay", "1");
  await listeAdimi(o.env, ist(8));
  assert.equal(o.depo.get("selin:modeller"), undefined); // 09:00'dan önce yok
  await listeAdimi(o.env, o.simdi);
  const m = JSON.parse(o.depo.get("selin:modeller"));
  assert.deepEqual([m["3194"].durum, m["3194"].kim, m["3100"].durum], ["hazirlaniyor", "Vegawin (stokta)", "sorulacak"]);
  assert.equal(m["2900"], undefined); // silinen
  assert.deepEqual(JSON.parse(o.depo.get("selin:hazirla")), ["3194"]);
  assert.equal(o.g.length, 0); // hiçbir Telegram mesajı yok
});

test("liste: Vegawin'de stoğu bitmiş ya da 'Sil' ile gizlenmiş model hiç sorulmaz", async () => {
  const o = ortam();
  o.depo.set("selin:rehberOnay", "1");
  stokBagla(o, { "3194": { toplam: 0, fiyat: 69, gizli: true }, "3100": { toplam: 4, fiyat: 30, gizli: true } });
  await listeAdimi(o.env, o.simdi);
  assert.equal(o.depo.get("selin:modeller"), undefined);
});

test("özet: günde iki kez (11:00, 16:00) tek mesaj; 'Sorular' sadece basana 5'er gelir; ilk basan geçerli; ekip basabilir; /liste sadece yöneticide", async () => {
  const o = ortam();
  o.env.EKIP_IDS = "333";
  o.depo.set("selin:rehberOnay", "1");
  await listeAdimi(o.env, o.simdi); // köprü yok: ikisi de "sorulacak"
  const { ozetAdimi } = await import("./selin.js");
  await ozetAdimi(o.env, o.simdi);
  assert.equal(o.g.length, 0); // 10:00: özet saati değil
  await ozetAdimi(o.env, ist(11));
  await ozetAdimi(o.env, ist(11, 5)); // aynı saatte ikinci kez yok
  const ozet = cagri(o.g, "sendMessage");
  assert.equal(ozet.length, 3);
  assert.match(ozet[0].govde.text, /🌸 Selin — özet[\s\S]*mağazada var mı\?" sorusu: 2/);
  assert.deepEqual(ozet[0].govde.reply_markup.inline_keyboard[0].map((d) => d.callback_data), ["sg:s"]);

  o.g.length = 0;
  await bas(o.env, 333, "sg:s");
  const sorular = cagri(o.g, "copyMessage");
  assert.deepEqual(sorular.map((k) => k.govde.chat_id), ["333", "333"]); // sadece basana
  assert.deepEqual(sorular[0].govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Mağazada var", "❌ Yok"]);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3194"].durum, "soruldu");
  await bas(o.env, 111, "sy:3194"); // görmeyen yönetici de karar verebilir (ilk basan)
  assert.equal(cagri(o.g, "editMessageCaption").length, 1); // 333'teki düğmeler kapandı
  await bas(o.env, 333, "sv:3194");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /zaten işaretledi/);
  await bas(o.env, 333, "sg:s");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /yeni bir şey yok/);

  o.g.length = 0;
  await guncelleme({ message: { chat: { id: 333, type: "private" }, from: { id: 333, first_name: "Hemra" }, text: "/liste" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /sadece Murat ve Merdan/);
  await bas(o.env, 444, "sg:s");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Yetkiniz yok/);
});

test("videodan kare: sadece videosu olan model → GitHub'a istek, tek kullanımlık video bağlantısı; adaylar arşive gider, özetten isteyene gösterilir; ilk seçen geçerli; onaylı kare sitede kullanılır, bir kez üretilir", async () => {
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
  assert.equal(cagri(o.g, "sendMessage").length, 0); // uyarı özete yazılır, mesaj gitmez
  assert.match(JSON.parse(o.depo.get("selin:notlar"))[0], /3300: sadece videosu var/);

  // GitHub Actions videoyu indirir
  const v = await selin.fetch(new Request(icerik.video), o.env);
  assert.equal(v.status, 200);
  assert.equal(cagri(o.g, "getFile").at(-1).govde.file_id, "v301");
  assert.equal((await selin.fetch(new Request("https://selin.test/video?t=yanlis"), o.env)).status, 404);

  // Sonuç: yabancı adres süzülür; yanlış anahtar reddedilir; adaylar sadece arşive gider
  const ham = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/abc/kareler/3300/";
  const geri = (govde) => selin.fetch(new Request("https://selin.test/kare", { method: "POST", body: JSON.stringify(govde) }), o.env);
  assert.equal((await geri({ t: "yanlis", kod: "3300", dosyalar: [] })).status, 403);
  o.g.length = 0;
  assert.equal((await geri({ t, kod: "3300", dosyalar: [{ url: ham + "aday-1.jpg" }, { url: "https://kotu.example/x.jpg" }, { url: ham + "aday-2.jpg" }] })).status, 200);
  const album = cagri(o.g, "sendMediaGroup");
  assert.equal(album.length, 1);
  assert.equal(album[0].govde.chat_id, -555); // arşiv kanalı
  assert.deepEqual(album[0].govde.media.map((m) => m.media), [ham + "aday-1.jpg", ham + "aday-2.jpg"]);
  assert.equal(cagri(o.g, "sendMessage").length, 0);
  assert.equal((await geri({ t, kod: "3300", dosyalar: [] })).status, 403); // anahtar tek kullanımlık

  // Özette görünür; "Kareler" sadece basana gelir
  const { ozetAdimi } = await import("./selin.js");
  o.g.length = 0;
  await ozetAdimi(o.env, ist(16));
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /Videodan kare seçilecek: 1[\s\S]*Notlar:\n• 3300: sadece videosu var/);
  o.g.length = 0;
  await bas(o.env, 222, "sg:f");
  assert.deepEqual(cagri(o.g, "sendMediaGroup")[0].govde.media.map((m) => m.media), ["K0", "K1"]);
  const kart = cagri(o.g, "sendMessage")[0];
  assert.equal(kart.govde.chat_id, "222");
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard.flat().map((d) => d.text), ["✅ 1. kare", "✅ 2. kare", "❌ Hiçbiri"]);

  await bas(o.env, 222, "kk:3300:2");
  const kare = JSON.parse(o.depo.get("kare:3300"));
  assert.deepEqual([kare.durum, kare.file_id, kare.url, kare.kim], ["onayli", "K1", ham + "aday-2.jpg", "Merdan"]);
  assert.equal(cagri(o.g, "editMessageText").length, 1);
  await bas(o.env, 111, "kk:3300:1");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Merdan zaten seçti/);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].durum, "hazirlaniyor");
  assert.deepEqual(JSON.parse(o.depo.get("selin:kareBekleyen")), []);

  // Hazırlık onaylı kareyle devam eder; yeniden kare istenmez; taslak kendiliğinden gönderilmez
  o.g.length = 0;
  await hazirlaAdimi(o.env, o.simdi);
  assert.equal(o.github.istekler.length, 1);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].taslak.fotolar[0].buyuk.file_id, "K1");
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3300"].durum, "onayda");
  assert.equal(cagri(o.g, "sendMessage").length, 0);
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

test("hazırlık: bütün pozlar (tekrarsız, en büyük boyut), video gömülür; Vegawin fiyatı; taslak isteyene gösterilir; onaylanınca GitHub'a tek commit + link; saatlik stok eşitlemesi stoğu biteni gizler", async () => {
  const o = ortam();
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false } });
  o.depo.set("selin:modeller", JSON.stringify({ "3194": { durum: "hazirlaniyor", zaman: 1, kim: "Vegawin (stokta)" } }));
  o.depo.set("selin:hazirla", JSON.stringify(["3194"]));
  await hazirlaAdimi(o.env, o.simdi);
  // 300 (foto), 301 (video), 200 (300'ün aynısı → tekrarsız)
  assert.deepEqual(cagri(o.g, "forwardMessage").map((f) => f.govde.message_id), [300, 301, 200]);
  assert.equal(o.istekler.length, 1);
  assert.equal(o.istekler[0].messages[0].content.filter((c) => c.type === "image").length, 1);
  assert.match(o.istekler[0].messages[0].content.at(-1).text, /VOLONTE yazı rehberi/);
  assert.equal(cagri(o.g, "sendMessage").length, 0); // taslak kendiliğinden gönderilmez

  o.g.length = 0;
  await bas(o.env, 111, "sg:k");
  const kart = cagri(o.g, "sendMessage").find((m) => /siteye hazır taslak/.test(m.govde.text));
  assert.equal(kart.govde.chat_id, "111");
  assert.match(kart.govde.text, /Kategori: Elbise \(yanlışsa/);
  assert.match(kart.govde.text, /Bedenler: 38-40-42-44 — Küçük \(alt yazıdan öneri\)/);
  assert.match(kart.govde.text, /Fiyat: 69 \$ \(Vegawin\)/);
  assert.deepEqual(kart.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✓ 📏 Küçük", "📏 Büyük", "📏 İkisi de"]);
  assert.match(kart.govde.text, /Videolar: 1/);
  assert.equal(cagri(o.g, "sendPhoto")[0].govde.photo, "b300"); // en yüksek çözünürlük
  assert.equal(o.github.commitler.length, 0); // onaysız siteye bir şey gitmez

  await bas(o.env, 111, "so:3194");
  const liste = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.equal(liste[0].kod, "3194");
  assert.deepEqual(liste[0].fotolar, ["galeri/3194/1.jpg"]);
  assert.deepEqual(liste[0].videolar, ["Volonteroseoffical/301"]);
  assert.deepEqual([liste[0].fiyat, liste[0].gizli], [69, false]);
  assert.ok(o.github.dosyalar.get("galeri/3194/1.jpg").startsWith("blob:"));
  assert.equal(o.github.commitler.filter(([m, y]) => m === "PATCH" && y === "/git/refs/heads/main").length, 1);
  const son = cagri(o.g, "editMessageText").at(-1).govde.text;
  assert.match(son, /3194 siteye eklendi \(Murat\)[\s\S]*urun\.html\?kod=3194/);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3194"].durum, "sitede");

  // Saatlik eşitleme: stok biterse sitede gizlenir (silinmez), fiyat güncellenir; değişiklik yoksa commit yok
  const { siteStokEsitle } = await import("./selin.js");
  o.stok["3194"] = { toplam: 0, fiyat: 72, gizli: true };
  await siteStokEsitle(o.env, ist(12));
  let site = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.deepEqual([site[0].gizli, site[0].fiyat, site[0].fotolar.length], [true, 72, 1]);
  assert.match(JSON.parse(o.depo.get("selin:notlar")).at(-1), /3194 gizlendi 72 \$/);
  const commitSayisi = o.github.commitler.length;
  await siteStokEsitle(o.env, ist(13));
  assert.equal(o.github.commitler.filter(([m, y]) => m === "PATCH").length, 2); // değişiklik yok → yeni commit yok
  o.stok["3194"] = { toplam: 3, fiyat: 72, gizli: false };
  await siteStokEsitle(o.env, ist(14));
  site = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.equal(site[0].gizli, false); // stok gelince yeniden görünür
  assert.ok(o.github.commitler.length > commitSayisi);
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

test("duraklatma: Selin çalışıyor (27 Ekim'de başlatıldı)", () => {
  assert.equal(duraklatildi(ist(22, 0)), false);
});
test.skip("Selin durduruluyken: 5 dk görevi sadece kayıtları DO'ya kopyalar ve kontrol eder; mesaj göndermez, KV'deki eski kayıtlar silinmez", async () => {
  const { SelinDO } = await import("./selin.js");
  const o = ortam();
  o.depo.set("selin:modeller", JSON.stringify({ "3194": { durum: "soruldu" } }));
  o.depo.set("selin:hazirla", JSON.stringify(["3100"]));
  o.depo.set("selin:hata", JSON.stringify({ hata: "x" }));
  o.env.KAYIT.list = async ({ prefix }) => ({ keys: [...o.depo.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true });
  const m = new Map();
  const storage = { async get(k) { return m.get(k); }, async put(k, v) { m.set(k, structuredClone(v)); }, async delete(k) { return m.delete(k); }, async list({ prefix }) { return new Map([...m].filter(([k]) => k.startsWith(prefix))); } };
  const nesne = new SelinDO({ storage, blockConcurrencyWhile: (f) => f() }, o.env);
  o.env.SELIN = { idFromName: () => "selin", get: () => ({ fetch: (url, init) => nesne.fetch(new Request(url, init)) }) };
  await selin.scheduled({}, o.env);
  assert.equal(o.g.length, 0); // hiçbir Telegram mesajı yok
  const rapor = JSON.parse(o.depo.get("goc:selin"));
  assert.deepEqual([rapor.kopyalanan, rapor.esit, rapor.farkliSayi], [2, 2, 0]);
  assert.ok(m.has("kv:selin:modeller") && m.has("kv:selin:hazirla") && !m.has("kv:selin:hata")); // hata KV'de kalır
  assert.ok(o.depo.has("selin:modeller") && o.depo.has("selin:hazirla")); // eski kayıtlar silinmedi
});

test("siteye yüklerken içeriği aynı fotoğraflar bir kez konur (kanalda yeniden yüklenmiş tekrarlar)", async () => {
  const o = ortam();
  const t = { baslik: "X", kategori: "dresses", aciklama: { en: "a", fr: "b", pt: "c", tr: "d" }, bedenler: "38-40", bedenGrubu: "k", videolar: [], yazilar: [],
    fotolar: [1, 2, 3].map((i) => ({ id: i, buyuk: { file_id: `f${i}`, width: 1280, height: 1700 }, net: true })) };
  o.depo.set("selin:modeller", JSON.stringify({ "3100": { durum: "onayda", zaman: 1, taslak: t, kart: [] } }));
  // f1 ve f3 aynı baytlar (sahte indirme her dosyaya [1,2,3,4] döner → üçü de aynı)
  await bas(o.env, 111, "so:3100");
  const liste = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.deepEqual(liste[0].fotolar, ["galeri/3100/1.jpg"]);
});

test("envanter taraması: Vegawin'de stok+fiyat olan ve Telegram'da bulunan modeller sayılır, fotoğrafı olanlar ayrılır; rapor KV'ye", async () => {
  const { taramaAdimi } = await import("./selin.js");
  const o = ortam();
  const kodlar = JSON.parse(o.depo.get("kodlar"));
  kodlar["3300"] = [{ ids: [301], tarih: o.simdi - 20 * GUN }]; // sadece video
  o.depo.set("kodlar", JSON.stringify(kodlar));
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async () => Response.json([{ kod: "3194", toplam: 3, fiyat: 69 }, { kod: "3300", toplam: 1, fiyat: 40 }, { kod: "9999", toplam: 5, fiyat: 10 }]) }) };
  await taramaAdimi(o.env, o.simdi); // başlangıç: liste
  let r = JSON.parse(o.depo.get("selin:rapor"));
  assert.deepEqual([r.stokVeFiyat, r.telegramda, r.kalan], [3, 2, 2]);
  await taramaAdimi(o.env, o.simdi + 300);
  r = JSON.parse(o.depo.get("selin:rapor"));
  assert.equal(r.bitti, true);
  assert.deepEqual(r.fotolu, ["3194"]);
  assert.deepEqual(r.sadeceVideo, ["3300"]);
  assert.equal(cagri(o.g, "forwardMessage").filter((f) => f.govde.message_id === 300).length, 1); // ilk fotoğrafta durur
});

test("site video oynatıcısı: sadece sitedeki ürünlerin videoları Telegram'dan akıtılır (yazısız), aralık isteği iletilir", async () => {
  const o = ortam();
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3194", videolar: ["Volonteroseoffical/301"] }]));
  const istekler = [];
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("/file/bot")) { istekler.push(init.headers || {}); return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-range": "bytes 0-2/3", "content-length": "3" } }); }
    return asil(url, init);
  };
  const r = await selin.fetch(new Request("https://selin.test/v/301", { headers: { Range: "bytes=0-" } }), o.env);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-type"), "video/mp4");
  assert.equal(r.headers.get("content-range"), "bytes 0-2/3");
  assert.equal(istekler[0].Range, "bytes=0-");
  assert.equal((await selin.fetch(new Request("https://selin.test/v/999"), o.env)).status, 404); // sitede olmayan
  // ikinci istek: Telegram'a yeniden iletme/getFile yok (saklandı)
  o.g.length = 0;
  await selin.fetch(new Request("https://selin.test/v/301"), o.env);
  assert.equal(cagri(o.g, "forwardMessage").length + cagri(o.g, "getFile").length, 0);
  globalThis.fetch = asil;
});

test("toplu yükleme: taramadaki fotoğraflı modeller sorulmadan hazırlanır, tek liste + tek düğme; /cikar; onayla siteye 2'şer yüklenir", async () => {
  const { topluAdimi } = await import("./selin.js");
  const o = ortam();
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false }, "3100": { toplam: 2, fiyat: 30, gizli: false } });
  o.depo.set("selin:tarama", JSON.stringify({ surum: "v1", bitti: true, stokFiyat: 2, telegramda: ["3194", "3100"], sitede: [], sira: [], sonuc: { "3194": { foto: 1, video: 1 }, "3100": { foto: 1, video: 0 } } }));
  await topluAdimi(o.env, o.simdi);
  assert.deepEqual(JSON.parse(o.depo.get("selin:hazirla")), ["3100", "3194"]);
  assert.equal(o.g.length, 0);
  await hazirlaAdimi(o.env, o.simdi);
  await hazirlaAdimi(o.env, o.simdi);
  assert.equal(cagri(o.g, "sendMessage").length, 0); // tek tek kart yok
  await topluAdimi(o.env, o.simdi);
  const liste = cagri(o.g, "sendMessage");
  assert.equal(liste.length, 2); // iki kişiye tek mesaj
  assert.match(liste[0].govde.text, /toplu yükleme listesi \(2 model[\s\S]*3194 · Black Wrap Dress · Elbise · 38-40-42-44 · 69 \$ · 1 foto[\s\S]*\/cikar/);
  assert.equal(liste[0].govde.reply_markup.inline_keyboard[0][0].callback_data, "tu:evet");
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/cikar 3100" } }, o.env);
  await bas(o.env, 222, "tu:evet");
  await bas(o.env, 111, "tu:evet");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /Merdan zaten onayladı/);
  await topluAdimi(o.env, o.simdi + 300);
  const site = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.deepEqual(site.map((u) => [u.kod, u.fiyat]), [["3194", 69]]);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Toplu yükleme bitti: 1 model siteye eklendi/);
});

test("'Dosya olarak' gönderilen fotoğraf (sıkıştırılmamış) kullanılır; yapay zekâya 1024, siteye 2048 piksele küçültülür", async () => {
  const o = ortam();
  const boyutlar = [];
  o.env.IMAGES = { input: () => ({ transform(t) { boyutlar.push(t.width); return this; }, async output() { return { response: () => new Response(new Uint8Array([7, 7, 7])) }; } }) };
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/forwardMessage") && JSON.parse(init.body).message_id === 400) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 9, caption: "CODE.3100\nSIZE 44/46/48", document: { file_id: "d400", file_unique_id: "ud400", mime_type: "image/jpeg", file_size: 6e6 } } }));
    }
    return asil(url, init);
  };
  o.depo.set("selin:modeller", JSON.stringify({ "3100": { durum: "hazirlaniyor", zaman: 1 } }));
  o.depo.set("selin:hazirla", JSON.stringify(["3100"]));
  await hazirlaAdimi(o.env, o.simdi);
  const t = JSON.parse(o.depo.get("selin:modeller"))["3100"].taslak;
  assert.equal(t.fotolar[0].buyuk.belge, true);
  assert.deepEqual(boyutlar, [1024]);
  await bas(o.env, 111, "sb:3100:b");
  await bas(o.env, 111, "so:3100");
  globalThis.fetch = asil;
  assert.deepEqual(boyutlar, [1024, 2048]);
  assert.deepEqual(JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0].fotolar, ["galeri/3100/1.jpg"]);
});

test("Selin sabah raporu: Kemal'in kanalı × Sami'nin stoğu karşılaştırılır; sitede eksik olanlar yeni toplu listeye hazırlanır", async () => {
  const { selinSabahRaporu } = await import("./selin.js");
  const o = ortam();
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3194", fiyat: 69, eklenme: "2026-10-21" }]));
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async () => Response.json([{ kod: "3194", toplam: 3, fiyat: 69 }, { kod: "3100", toplam: 2, fiyat: 30 }, { kod: "7777", toplam: 1, fiyat: 9 }]) }) };
  await selinSabahRaporu(o.env, ist(9, 25));
  const m = JSON.parse(o.depo.get("selin:modeller"));
  assert.deepEqual([m["3100"].durum, m["3100"].toplu], ["hazirlaniyor", true]); // 3194 sitede, 7777 Telegram'da yok
  assert.equal(m["7777"], undefined);
  const metin = cagri(o.g, "sendMessage")[0].govde.text;
  assert.match(metin, /🌸 Selin — 22\.10\.2026 sabah raporu[\s\S]*Dün eklenen: 3194[\s\S]*sitede eksik 1 model\.\n→ 1 tanesi yeni toplu listeye/);
  assert.ok(o.depo.get("venom:rapor:selin:2026-10-22"));
  o.g.length = 0;
  await selinSabahRaporu(o.env, ist(9, 30)); // günde bir kez
  assert.equal(o.g.length, 0);
});

test("önizleme: gizli anahtarlı tek link; toplu listedeki modeller sitedeki gibi (foto, video, fiyat, beden); siteye hiçbir şey yazılmaz; 'onay bekleyen' ayrımı", async () => {
  const { topluAdimi, onizleme, onizlemeLinki, onizlemeDuyur } = await import("./selin.js");
  const o = ortam();
  o.env.SELF_URL = "https://selin.test";
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false }, "3100": { toplam: 2, fiyat: 30, gizli: false } });
  o.depo.set("selin:tarama", JSON.stringify({ surum: "v1", bitti: true, stokFiyat: 2, telegramda: ["3194", "3100"], sitede: [], sira: [], sonuc: { "3194": { foto: 1, video: 1 }, "3100": { foto: 1, video: 0 } } }));
  await topluAdimi(o.env, o.simdi);
  await onizlemeDuyur(o.env); // hazırlanırken bile link bir kez yöneticilere gider
  await onizlemeDuyur(o.env);
  const duyuru = cagri(o.g, "sendMessage");
  assert.deepEqual(duyuru.map((x) => x.govde.chat_id), ["111", "222"]);
  assert.match(duyuru[0].govde.text, /siteye ÇIKMADI[\s\S]*https:\/\/selin\.test\/onizleme\/[0-9a-f]{24}[\s\S]*hazır 0, hazırlanıyor 2/);
  await hazirlaAdimi(o.env, o.simdi);
  await hazirlaAdimi(o.env, o.simdi);
  const link = await onizlemeLinki(o.env);
  const yol = link.split("/onizleme/")[1];
  assert.equal((await onizleme(o.env, "yanlis-anahtar")).status, 404);
  const html = await (await onizleme(o.env, yol)).text();
  assert.match(html, /ÖNİZLEME — bu modeller henüz sitede DEĞİL[\s\S]*Hazır 2 \/ 2 model/);
  assert.match(html, /<p class="product-code">3194<\/p>[\s\S]*Sizes: 38-40-42-44[\s\S]*Wholesale price: \$69[\s\S]*Kod: 3194<\/b> · Fiyat: 69 \$ \(Vegawin\) · Bedenler: 38-40-42-44/);
  assert.match(html, new RegExp(`<img src="/onizleme/${yol}/f/3194/0"`));
  assert.match(html, new RegExp(`<video[^>]+src="/onizleme/${yol}/v/3194/0#t=0.1"`));
  const foto = await onizleme(o.env, `${yol}/f/3194/0`);
  assert.equal(foto.headers.get("content-type"), "image/jpeg");
  assert.equal((await onizleme(o.env, `${yol}/f/9999/0`)).status, 404); // listede olmayan model verilmez
  assert.equal(o.github.dosyalar.size, 0); // siteye hiçbir şey yazılmadı
  o.g.length = 0;
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/onizleme" } }, o.env);
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /Toplu liste: 2 model — hazır 2\.\nBu listenin dışında onay bekleyen: 0 tek taslak \+ 0 videodan kare/);
});

test("site kilidi: kilit açıkken (kullanıcı kararı 28 Ekim) toplu düğme de tek kart onayı da siteye hiçbir şey yüklemez", async () => {
  const { topluAdimi } = await import("./selin.js");
  const o = ortam();
  delete o.env.KILIT_TEST_ACIK;
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false } });
  o.depo.set("selin:tarama", JSON.stringify({ surum: "v1", bitti: true, stokFiyat: 1, telegramda: ["3194"], sitede: [], sira: [], sonuc: { "3194": { foto: 1, video: 1 } } }));
  await topluAdimi(o.env, o.simdi);
  await hazirlaAdimi(o.env, o.simdi);
  await topluAdimi(o.env, o.simdi);
  await bas(o.env, 111, "tu:evet");
  assert.match(cagri(o.g, "answerCallbackQuery").at(-1).govde.text, /kilitli/);
  assert.equal(JSON.parse(o.depo.get("selin:toplu")).durum, "onayda");
  await topluAdimi(o.env, o.simdi + 300);
  assert.equal(o.github.dosyalar.size, 0);
});

test("fotoğraf kontrolü: bir kez geçici jetonla Actions isteği; liste ve tek mesaj sadece toplu modellerin gruplarından", async () => {
  const { topluAdimi, onizleme, kontrolIstegi } = await import("./selin.js");
  const o = ortam();
  o.env.SELF_URL = "https://selin.test";
  stokBagla(o, { "3194": { toplam: 5, fiyat: 69, gizli: false } });
  o.depo.set("selin:tarama", JSON.stringify({ surum: "v1", bitti: true, stokFiyat: 1, telegramda: ["3194"], sitede: [], sira: [], sonuc: { "3194": { foto: 1, video: 1 } } }));
  await topluAdimi(o.env, o.simdi);
  await hazirlaAdimi(o.env, o.simdi);
  await kontrolIstegi(o.env);
  await kontrolIstegi(o.env);
  const istek = o.github.commitler.filter(([m, y]) => m === "PUT" && y.startsWith("/contents/istekler/kontrol/"));
  assert.equal(istek.length, 1);
  assert.equal(istek[0][2].branch, "kareler");
  const jeton = o.depo.get("selin:kontrolJeton");
  const liste = await (await onizleme(o.env, `${jeton}/json`)).json();
  assert.deepEqual(liste[0].gruplar.map((g) => g.ids), [[300, 301], [200]]);
  assert.ok(liste[0].fotolar.length >= 1);
  const m = await onizleme(o.env, `${jeton}/m/300`);
  assert.equal(m.headers.get("x-tur"), "foto");
  assert.match(decodeURIComponent(m.headers.get("x-yazi")), /CODE\.3194/);
  assert.equal((await onizleme(o.env, `${jeton}/m/999`)).status, 404);
  assert.equal((await onizleme(o.env, "baskajeton/json")).status, 404);
});
