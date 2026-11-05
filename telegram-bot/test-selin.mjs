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
    GITHUB_TOKEN: "gh", GITHUB_REPO: "kbabahanov-cloud/VOLONTE", SITE_URL: "https://www.wearvolonte.com",
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
  assert.deepEqual([liste[0].fiyat, liste[0].gizli], [undefined, false]); // fiyat açık depoya yazılmaz (4 Kasım)
  assert.ok(o.github.dosyalar.get("galeri/3194/1.jpg").startsWith("blob:"));
  assert.equal(o.github.commitler.filter(([m, y]) => m === "PATCH" && y === "/git/refs/heads/main").length, 1);
  const son = cagri(o.g, "editMessageText").at(-1).govde.text;
  assert.match(son, /3194 siteye eklendi \(Murat\)[\s\S]*www\.wearvolonte\.com\/#model\/3194/);
  assert.deepEqual(JSON.parse(o.depo.get("venom:yeniModel")).map((x) => [x.kod, x.kim]), [["3194", "Murat"]]); // Kemal'e: sıra beklemeden Patron önizlemesi
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3194"].durum, "sitede");

  // Saatlik eşitleme: stok biterse sitede gizlenir (silinmez), fiyat güncellenir; değişiklik yoksa commit yok
  const { siteStokEsitle } = await import("./selin.js");
  o.stok["3194"] = { toplam: 0, fiyat: 72, gizli: true };
  await siteStokEsitle(o.env, ist(12));
  let site = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.deepEqual([site[0].gizli, site[0].fiyat, site[0].fotolar.length], [true, undefined, 1]);
  assert.match(JSON.parse(o.depo.get("selin:notlar")).at(-1), /3194 gizlendi/);
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
  assert.ok(o.github.dosyalar.get("galeri/3100/1.jpg")); // 2 Kasım: fotoğraflar depoda kalır (/geri için)
  assert.equal(JSON.parse(o.depo.get("selin:silinen:3100")).urun.kod, "3100"); // kayıt saklandı
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
  assert.deepEqual(site.map((u) => [u.kod, u.fiyat]), [["3194", undefined]]);
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

test("fotoğraf düzeltmesi: hatalı mesaj taslaktan çıkar ve bir daha alınmaz; sorulan model önizlemede soru olarak görünür, yüklenmez", async () => {
  const { fotoDuzeltmeGocu, HARIC_MESAJ, FOTO_SORUSU, onizleme, onizlemeLinki } = await import("./selin.js");
  const o = ortam();
  o.env.SELF_URL = "https://selin.test";
  const taslak = (ids, vids) => ({ baslik: "X", kategori: "dresses", bedenler: "38-40", aciklama: { en: "x" }, fotolar: ids.map((id) => ({ id, net: true, buyuk: { file_id: "f" + id } })), videolar: vids.map((id) => ({ id, file_id: "v" + id, boyut: 1 })) });
  o.depo.set("selin:toplu", JSON.stringify({ surum: "v1", kodlar: ["3618", "3322"], durum: "onayda", haric: [], basarisiz: [], yuklenen: [] }));
  o.depo.set("selin:modeller", JSON.stringify({ "3618": { durum: "onayda", toplu: true, taslak: taslak([13076, 13077], [13457]) }, "3322": { durum: "onayda", toplu: true, taslak: taslak([12782], [13598]) } }));
  assert.deepEqual(HARIC_MESAJ["3618"], [13457]);
  await fotoDuzeltmeGocu(o.env);
  const m = JSON.parse(o.depo.get("selin:modeller"));
  assert.deepEqual(m["3618"].taslak.videolar, []);
  assert.equal(m["3322"].durum, "foto-soru");
  const html = await (await onizleme(o.env, (await onizlemeLinki(o.env)).split("/onizleme/")[1])).text();
  assert.match(html, /Hazır 1 \/ 2 model/);
  assert.match(html, /❓ 3322 size soruldu/);
  assert.ok(FOTO_SORUSU["3567"]);
});

test("üretim referansı: Selin'e özelden '3618 askı' yazılı fotoğraf kaydedilir; kodsuz fotoğraf için kod istenir; izinsiz kişi kaydedemez", async () => {
  const o = ortam();
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, photo: [{ file_id: "k1", width: 320 }, { file_id: "b1", width: 1280 }], caption: "3618 askı" } }, o.env);
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, photo: [{ file_id: "b2", width: 1280 }], caption: "3618 manken" } }, o.env);
  const r = JSON.parse(o.depo.get("selin:referans:3618"));
  assert.deepEqual(r.map((x) => [x.file_id, x.rol]), [["b1", "aski"], ["b2", "manken"]]);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /askı 1, manken 1 fotoğraf[\s\S]*kanala ya da siteye gitmez/);
  const once = cagri(o.g, "sendMessage").length;
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, photo: [{ file_id: "b3" }] } }, o.env);
  assert.equal(cagri(o.g, "sendMessage").length, once); // yazısız dosya: cevap yok, kod mesajını bekler
  assert.ok(o.depo.has("selin:bekleyenDosya:111"));
  await guncelleme({ message: { chat: { id: 999, type: "private" }, from: { id: 999 }, photo: [{ file_id: "b4" }], caption: "3618 askı" } }, o.env);
  assert.equal(JSON.parse(o.depo.get("selin:referans:3618")).length, 2);
});

test("/kimim: izinsiz kişi de kendi kimliğini öğrenir, başka cevap almaz", async () => {
  const o = ortam();
  await guncelleme({ message: { chat: { id: 999, type: "private" }, from: { id: 999, first_name: "Yeni" }, text: "/kimim" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Telegram kimliğiniz: 999[\s\S]*izinli değilsiniz/);
  assert.ok(o.depo.has("venom:kimlik:selin:999"));
  await guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111 }, text: "/kimim" } }, o.env);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /izinlisiniz/);
});

test("YENİ AKIŞ: 10:00'da Sami'nin stoğundan 30 model sahibe istenir (Celal'in modelleri en sonda) (öncelik karışık 24); 'Dosya olarak' albüm + video gelir; taslak Vegawin fiyatıyla sahibe; onayla siteye (kilit yeni akışı engellemez); 20:00 özet, gelmeyenler gönderilemedi", async () => {
  const { istekAdimi, ozelHazirlaAdimi, gunSonuOzeti, ozelVideo, GUNLUK_ISTEK } = await import("./selin.js");
  const o = ortam();
  delete o.env.KILIT_TEST_ACIK; // site kilidi açık değil: yeni akış yine de onayla yüklenir
  o.env.SAHIP_IDS = "777";
  const stok = { "3618": { toplam: 4, fiyat: 55 }, "3100": { toplam: 2, fiyat: 30 } };
  for (let i = 0; i < 40; i++) stok[String(5000 + i)] = { toplam: 1, fiyat: 10 };
  stok["9100"] = { toplam: 3, fiyat: 20, tedarikci: "CELAL" }; // en büyük kod ama Celal'in → en sonda
  stokBagla(o, stok);
  const stokFetch = o.env.STOK.get().fetch;
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async (url, init) => url.endsWith("/stoktakiler")
    ? Response.json(Object.entries(o.stok).map(([kod, x]) => ({ kod, toplam: x.toplam, fiyat: x.fiyat, tedarikci: x.tedarikci || null })))
    : stokFetch(url, init) }) };
  const gun = ist(10, 5);
  const gercekSaat = Date.now;
  Date.now = () => gun * 1000; // dosyalar bu saatle kaydedilir
  await istekAdimi(o.env, ist(9, 55)); // saat gelmedi
  assert.equal(cagri(o.g, "sendMessage").length, 0);
  await istekAdimi(o.env, gun);
  await istekAdimi(o.env, gun + 300); // günde bir kez
  const istek = cagri(o.g, "sendMessage");
  assert.equal(istek.length, 1);
  assert.equal(istek[0].govde.chat_id, "777");
  const kodlar = istek[0].govde.text.split("\n")[1].split(", ");
  assert.equal(kodlar.length, GUNLUK_ISTEK - 1);
  assert.equal(kodlar[0], "3618"); // öncelikli (karışık 24)
  assert.ok(!kodlar.includes("9100"));
  assert.match(istek[0].govde.text, /\n\n👤 Celal'in modelleri \(en son\): 9100\n/); // Celal en sonda (30. model)
  assert.match(istek[0].govde.text, /Dosya olarak[\s\S]*3503 Küçük[\s\S]*\/yok 3503/);
  // Tek seferlik TEKRAR (5 Kasım): aynı liste aynı biçimde SADECE /sahip hesabına (0091), durumlar değişmez
  o.depo.set("selin:sahip", "999");
  o.depo.set("venom:selinIstekTekrar", JSON.stringify({}));
  const once = o.depo.get("selin:modeller");
  await istekAdimi(o.env, gun + 600);
  const tekrar = cagri(o.g, "sendMessage").slice(1);
  assert.deepEqual(tekrar.map((m) => m.govde.chat_id), ["999"]);
  assert.equal(tekrar[0].govde.text.split("\n")[1], istek[0].govde.text.split("\n")[1]);
  assert.match(tekrar[0].govde.text, /^🌸 \(Tekrar\) Bugün 30 model/);
  assert.equal(o.depo.get("selin:modeller"), once);
  assert.equal(JSON.parse(o.depo.get("venom:selinIstekTekrarSonuc")).kodlar.length, 30);
  o.depo.delete("selin:sahip"); o.g.splice(o.g.indexOf(tekrar[0]), 1);
  // albüm: yazısız parça önce gelir, sonra yazılı (Dosya olarak) + video
  const gonder = (ek) => guncelleme({ message: { chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Murat" }, ...ek } }, o.env);
  await gonder({ media_group_id: "g1", document: { file_id: "d2", file_unique_id: "u2", mime_type: "image/jpeg" } });
  await gonder({ media_group_id: "g1", document: { file_id: "d1", file_unique_id: "u1", mime_type: "image/jpeg" }, caption: "3618 Büyük" });
  await gonder({ media_group_id: "g1", video: { file_id: "v1", file_unique_id: "uv1", file_size: 5e6, width: 1080 } });
  assert.equal(cagri(o.g, "sendMessage").length, 1); // dosyalara tek tek cevap yok (sadece sabahki istek)
  let m = JSON.parse(o.depo.get("selin:modeller"))["3618"];
  assert.deepEqual(m.medya.map((x) => x.file_id).sort(), ["d1", "d2", "v1"]);
  const su = gun;
  await ozelHazirlaAdimi(o.env, su + 60); // 2 dk sessizlik yok
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3618"].durum, "geldi");
  o.g.length = 0;
  await ozelHazirlaAdimi(o.env, su + 400);
  m = JSON.parse(o.depo.get("selin:modeller"))["3618"];
  assert.equal(m.durum, "onayda");
  assert.equal(m.taslak.fiyat, 55);
  assert.equal(m.taslak.bedenler, "44-46-48-50");
  assert.match(cagri(o.g, "sendMessage")[0].govde.text, /^✅ 3618 alındı \(2 fotoğraf, 1 video, Büyük\)\nKalan 29 model: /); // tek onay mesajı + kalan liste
  const kart = cagri(o.g, "sendMessage").at(-1);
  assert.equal(kart.govde.chat_id, "777");
  assert.match(kart.govde.text, /Fiyat: 55 \$ \(Vegawin\) · Stok: 4 adet[\s\S]*Videolar: 1 \(sitenin kendi oynatıcısında/);
  await bas(o.env, 111, "so:3618"); // yönetici onaylar (sahip de basabilir)
  const site = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  assert.deepEqual([site[0].kod, site[0].fiyat, site[0].videolar, site[0].fotolar.length], ["3618", undefined, ["selin/3618/0"], 1]);
  assert.equal((await ozelVideo(o.env, "3618", "0", null)).status, 200);
  assert.equal((await ozelVideo(o.env, "3100", "0", null)).status, 404);
  await gonder({ text: "/yok 5019" });
  o.g.length = 0;
  await gunSonuOzeti(o.env, ist(20, 5));
  const ozet = cagri(o.g, "sendMessage")[0].govde.text;
  assert.match(ozet, /İstenen: 30 · gelen: 1 · bugün siteye çıkan: 1 \(3618\)/);
  assert.match(ozet, /Fotoğrafı gelmeyen → yarın tekrar listede: 28 /); // 5 Kasım: kaybolmaz, yarın tekrar
  assert.match(ozet, /Eski gönderilemeyen \(liste boşalınca sırayla tekrar istenir\): 1/); // /yok 5019
  Date.now = gercekSaat;
});

test("LİSTE HEP 30 (5 Kasım): fotoğraf gelen/yok denen modelin yerine gün içinde yeni kod (30 dk'da bir, 0091'e ek mesaj); gelmeyen ertesi gün başta; 3 gün gelmezse 'bulunamıyor' + Patron'a Vegawin stoklu rapor", async () => {
  const { istekAdimi, gunSonuOzeti, GUNLUK_ISTEK } = await import("./selin.js");
  const o = ortam();
  o.env.SAHIP_IDS = "777"; o.env.MURAT_ID = "555,556";
  o.depo.set("selin:sahip", "999");
  const stok = {};
  for (let i = 0; i < 70; i++) stok[String(6000 + i)] = { toplam: 2, fiyat: 10 };
  stokBagla(o, stok);
  const stokFetch = o.env.STOK.get().fetch;
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async (url, init) => url.endsWith("/stoktakiler")
    ? Response.json(Object.entries(o.stok).map(([kod, x]) => ({ kod, toplam: x.toplam, fiyat: x.fiyat, tedarikci: null })))
    : url.endsWith("/bilgi") ? Response.json({ kod: JSON.parse(init.body).kod, satirlar: [{ magaza: "VOLONTE", adet: 2 }] }) : stokFetch(url, init) }) };
  const gun1 = ist(10, 5);
  await istekAdimi(o.env, gun1);
  const ilk = cagri(o.g, "sendMessage")[0].govde.text.split("\n")[1].split(", ");
  assert.equal(ilk.length, GUNLUK_ISTEK);
  // iki modelin fotoğrafı geldi + biri /yok → 30 dk dolmadan eklenmez, sonra 3 yeni kod 0091'e
  const m = JSON.parse(o.depo.get("selin:modeller"));
  m[ilk[0]].durum = "geldi"; m[ilk[1]].durum = "onayda"; m[ilk[2]] = { ...m[ilk[2]], durum: "gonderilemedi", yokDendi: true };
  o.depo.set("selin:modeller", JSON.stringify(m));
  o.g.length = 0;
  await istekAdimi(o.env, gun1 + 600);
  assert.equal(cagri(o.g, "sendMessage").length, 0);
  await istekAdimi(o.env, gun1 + 1900);
  const ek = cagri(o.g, "sendMessage");
  assert.deepEqual(ek.map((x) => x.govde.chat_id), ["999"]);
  assert.match(ek[0].govde.text, /^➕ Listeye eklenenler \(3\): /);
  const eklenen = ek[0].govde.text.split("\n")[0].split(": ")[1].split(", ");
  assert.ok(eklenen.every((k) => !ilk.includes(k)));
  const ist1 = JSON.parse(o.depo.get(`selin:istek:${new Date((gun1 + 3 * 3600) * 1000).toISOString().slice(0, 10)}`));
  assert.equal(ist1.kodlar.length, 33);
  // 20:00: 30 açık gelmedi → "bekliyor"; ertesi gün listenin BAŞINDA
  o.g.length = 0;
  await gunSonuOzeti(o.env, ist(20, 5));
  let mm = JSON.parse(o.depo.get("selin:modeller"));
  assert.equal(mm[ilk[5]].durum, "bekliyor");
  assert.equal(mm[ilk[5]].kacirma, 1);
  for (let g = 1; g <= 2; g++) {
    o.g.length = 0;
    await istekAdimi(o.env, gun1 + g * 86400);
    const liste = cagri(o.g, "sendMessage")[0].govde.text.split("\n")[1].split(", ");
    assert.ok(liste.includes(ilk[5]));
    o.g.length = 0;
    await gunSonuOzeti(o.env, ist(20, 5) + g * 86400);
  }
  mm = JSON.parse(o.depo.get("selin:modeller"));
  assert.equal(mm[ilk[5]].durum, "bulunamiyor");
  const rapor = cagri(o.g, "sendMessage").find((x) => x.govde.chat_id === "555");
  assert.match(rapor.govde.text, /3 gün üst üste[\s\S]*Vegawin'de VOLONTE 2 adet/);
  assert.ok(!cagri(o.g, "sendMessage").some((x) => x.govde.chat_id === "556"));
});

test("yazısız dosyalar + ayrı kod mesajı: '3183 Küçük' gelince son yazısız dosyalar bağlanır, tek cevap; eski menü yok; bekleyen yoksa sohbetten geri bulunur", async () => {
  const o = ortam();
  const gonder = (ek) => guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, message_id: ek.message_id || 1, ...ek } }, o.env);
  for (let i = 1; i <= 4; i++) await gonder({ message_id: 10 + i, document: { file_id: `d${i}`, file_unique_id: `u${i}`, mime_type: "image/jpeg" } });
  await gonder({ message_id: 15, video: { file_id: "v1", file_unique_id: "uv1", file_size: 3e6 } });
  assert.equal(cagri(o.g, "sendMessage").length, 0); // hiç cevap yok
  await gonder({ message_id: 16, text: "3183 Küçük" });
  const c = cagri(o.g, "sendMessage");
  assert.equal(c.length, 1);
  assert.match(c[0].govde.text, /^✅ 3183 alındı \(4 fotoğraf, 1 video, Küçük\)/);
  const m = JSON.parse(o.depo.get("selin:modeller"))["3183"];
  assert.deepEqual([m.durum, m.bedenGrubu, m.medya.length], ["geldi", "k", 5]);
  // anlaşılmayan yazı: eski menü değil kısa uyarı
  await gonder({ message_id: 17, text: "merhaba" });
  assert.equal(cagri(o.g, "sendMessage").at(-1).govde.text, "Kod ve beden yazın, örnek: 3183 Küçük");
  assert.ok(!cagri(o.g, "sendMessage").some((x) => /Günlük hedef/.test(x.govde.text)));
  // geri bulma: bekleyen kayıt yok, dosyalar sohbette (forwardMessage ile okunur)
  o.g.length = 0;
  await gonder({ message_id: 300, text: "3194 Büyük" }); // fake: 299..280 iletilir; 300 numaralı mesajdan geriye
  const iletilen = cagri(o.g, "forwardMessage");
  assert.ok(iletilen.length >= 1 && iletilen[0].govde.from_chat_id === 111);
});

test("'dosya olarak' video (IMG_4581.MP4) video sayılır; 3183'ün bağlanmayan videosu sohbetten bulunup taslağa eklenir, kart videoyla yeniden gider", async () => {
  const { videoKurtarAdimi, belgeVideoMu } = await import("./selin.js");
  assert.ok(belgeVideoMu({ mime_type: "video/mp4", file_name: "IMG_4581.MP4" }) && belgeVideoMu({ file_name: "a.MOV" }) && !belgeVideoMu({ mime_type: "image/jpeg" }));
  const o = ortam();
  const gonder = (ek) => guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, ...ek } }, o.env);
  await gonder({ message_id: 1, document: { file_id: "d1", file_unique_id: "u1", mime_type: "image/jpeg" } });
  await gonder({ message_id: 2, document: { file_id: "vd", file_unique_id: "uvd", mime_type: "video/mp4", file_name: "IMG_4581.MP4", file_size: 3.2e6 } });
  await gonder({ message_id: 3, text: "3190 Küçük" });
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /✅ 3190 alındı \(1 fotoğraf, 1 video, Küçük\)/);
  // 3183: taslak var, video yok; kart mesajı 120. Sohbette 118 = belge video, 117 = "3183 Küçük", 116 = başka model
  o.depo.set("selin:modeller", JSON.stringify({ "3183": { kaynak: "ozel", durum: "onayda", gonderen: 111, kart: [["111", 120]], medya: [{ uid: "f1", tur: "foto" }], taslak: { kaynak: "ozel", baslik: "X", kategori: "sets", aciklama: { en: "x", tr: "x" }, bedenler: "38-40-42-44", bedenGrubu: "k", fotolar: [{ id: 1, net: true, buyuk: { file_id: "f1", belge: true } }], videolar: [], fiyat: 40 } } }));
  const eski = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => {
    if (String(url).endsWith("/forwardMessage")) {
      const id = JSON.parse(istek.body).message_id;
      const kim = { type: "user", sender_user: { id: 111 } };
      const m = id === 118 ? { document: { file_id: "IMG", file_unique_id: "uimg", mime_type: "video/mp4", file_name: "IMG_4581.MP4", file_size: 3.2e6 } }
        : id === 117 ? { text: "3183 Küçük" } : id === 116 ? { text: "3184 Büyük" } : { text: "Selin" };
      return Response.json({ ok: true, result: { message_id: 1, forward_origin: id === 119 ? { type: "user", sender_user: { id: 999 } } : kim, ...m } });
    }
    return eski(url, istek);
  };
  o.g.length = 0;
  await videoKurtarAdimi(o.env, 1000);
  globalThis.fetch = eski;
  const m = JSON.parse(o.depo.get("selin:modeller"))["3183"];
  assert.deepEqual(m.taslak.videolar.map((v) => [v.file_id, v.belge]), [["IMG", true]]);
  assert.equal(m.durum, "onayda");
  assert.ok(cagri(o.g, "sendDocument").some((x) => x.govde.document === "IMG")); // kartta video
  assert.match(cagri(o.g, "sendMessage").find((x) => /video taslağa eklendi/.test(x.govde.text)).govde.text, /IMG_4581\.MP4/);
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Videolar: 1/);
  await videoKurtarAdimi(o.env, 2000); // bir kez
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3183"].taslak.videolar.length, 1);
});

test("alındı mesajı bugünün kalan listesini gösterir; gönderilen ve /yok yazılan çıkar; bitince 'tamam'", async () => {
  const o = ortam();
  stokBagla(o, { "3183": { toplam: 3, fiyat: 40 }, "3186": { toplam: 2, fiyat: 30 }, "3322": { toplam: 1, fiyat: 50 } });
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  o.depo.set(`selin:istek:${gun}`, JSON.stringify({ kodlar: ["3183", "3186", "3322"] }));
  o.depo.set("selin:modeller", JSON.stringify(Object.fromEntries(["3183", "3186", "3322"].map((k) => [k, { kaynak: "ozel", durum: "istendi" }]))));
  const gonder = (ek) => guncelleme({ message: { chat: { id: 111, type: "private" }, from: { id: 111, first_name: "Murat" }, ...ek } }, o.env);
  await gonder({ message_id: 1, document: { file_id: "d1", file_unique_id: "u1", mime_type: "image/jpeg" } });
  await gonder({ message_id: 2, text: "3183 Küçük" });
  assert.equal(cagri(o.g, "sendMessage").at(-1).govde.text, "✅ 3183 alındı (1 fotoğraf, 0 video, Küçük)\nKalan 2 model: 3186, 3322");
  await gonder({ message_id: 3, text: "/yok 3186" });
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /Kalan 1 model: 3322$/);
  await gonder({ message_id: 4, document: { file_id: "d2", file_unique_id: "u2", mime_type: "image/jpeg" } });
  await gonder({ message_id: 5, text: "3322 Büyük" });
  assert.match(cagri(o.g, "sendMessage").at(-1).govde.text, /^✅ 3322 alındı \(1 fotoğraf, 0 video, Büyük\)[\s\S]*\nBugünün 3 modeli tamam$/);
  assert.equal(cagri(o.g, "sendMessage").length, 3); // başka mesaj yok
});

test("bir kerelik ek liste: Celal'in modelleri olmadan, bugün istenmemiş 15 model hemen (sahiplere)", async () => {
  const { istekAdimi } = await import("./selin.js");
  const o = ortam();
  o.env.SAHIP_IDS = "777,888";
  const stok = {};
  for (let i = 0; i < 40; i++) stok[String(6000 + i)] = { toplam: 1, fiyat: 10 };
  stok["6100"] = { toplam: 2, fiyat: 10, tedarikci: "CELAL" };
  stokBagla(o, stok);
  const stokFetch = o.env.STOK.get().fetch;
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async (url, init) => url.endsWith("/stoktakiler")
    ? Response.json(Object.entries(o.stok).map(([kod, x]) => ({ kod, toplam: x.toplam, fiyat: x.fiyat, tedarikci: x.tedarikci || null })))
    : stokFetch(url, init) }) };
  await istekAdimi(o.env, ist(10, 5)); // sabah listesi (30)
  const sabah = cagri(o.g, "sendMessage")[0].govde.text.split("\n")[1].split(", ");
  o.g.length = 0;
  o.depo.set("venom:selinEkIstek", "2026-10-22");
  await istekAdimi(o.env, ist(15, 0));
  const ek = cagri(o.g, "sendMessage");
  assert.deepEqual(ek.map((x) => x.govde.chat_id).sort(), ["777", "888"]);
  const kodlar = ek[0].govde.text.split("\n")[1].split(", ");
  assert.equal(kodlar.length, 11); // 41 aday − 30 sabah (Celal 6100 sabah listesinde, en sonda) = 11 kaldı
  assert.ok(!kodlar.includes("6100") && !kodlar.some((k) => sabah.includes(k)));
  assert.match(ek[0].govde.text, /^🌸 Ek liste: 11 model daha/);
  assert.equal(sabah.length, 29); // 6100 ayrı satırda: "👤 Celal'in modelleri (en son)"
  assert.ok(!o.depo.has("venom:selinEkIstek"));
});

test("fotoğraf isteği: sitede olan model (eski yolla yüklenmiş olsa da) istenmez; bir kerelik onarım kaydı düzeltir ve 'kusura bakmayın' gönderir", async () => {
  const { istekAdimi } = await import("./selin.js");
  const o = ortam();
  o.env.SAHIP_IDS = "777";
  const stok = { "3618": { toplam: 4, fiyat: 55 }, "3622": { toplam: 3, fiyat: 40 }, "5001": { toplam: 2, fiyat: 10 } };
  stokBagla(o, stok);
  const stokFetch = o.env.STOK.get().fetch;
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: async (url, init) => url.endsWith("/stoktakiler")
    ? Response.json(Object.entries(stok).map(([kod, x]) => ({ kod, toplam: x.toplam, fiyat: x.fiyat, tedarikci: null })))
    : stokFetch(url, init) }) };
  // 3618 eski yolla (kanal) sitede; 3622 Merdan'ın özel yüklemesiyle sitede ama kaydı yanlışlıkla "istendi"ye dönmüş
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3618", fotolar: ["galeri/3618/1.jpg"] }, { kod: "3622", fotolar: ["galeri/3622/1.jpg"] }]));
  o.depo.set("selin:modeller", JSON.stringify({ 3618: { kaynak: "kanal", durum: "sitede" }, 3622: { kaynak: "ozel", durum: "istendi" } }));
  // Onarım: dünkü (yanlış) liste 3618, 3622, 5001
  const gun = ist(10, 5);
  o.depo.set(`selin:istek:${new Date((gun - 86400 + 3 * 3600) * 1000).toISOString().slice(0, 10)}`, JSON.stringify({ kodlar: ["3618", "3622", "5001"], zaman: gun - 86400 }));
  o.depo.set("venom:selinIstekDuzelt", "1");
  await istekAdimi(o.env, gun);
  const ozur = cagri(o.g, "sendMessage").find((x) => /Kusura bakmayın/.test(x.govde.text));
  assert.equal(ozur.govde.chat_id, "777");
  assert.match(ozur.govde.text, /şu 2 model zaten sitede[\s\S]*3618, 3622/);
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3622"].durum, "sitede"); // kayıt düzeldi
  assert.deepEqual(JSON.parse(o.depo.get("venom:selinIstekDuzeltSonuc")).duzelen, ["3622"]);
  // Günün isteği: sitede olanlar (3618, 3622) YOK, sadece 5001
  o.g.length = 0;
  await istekAdimi(o.env, gun + 60);
  const istek = cagri(o.g, "sendMessage")[0];
  assert.equal(istek.govde.text.split("\n")[1], "5001");
  assert.equal(JSON.parse(o.depo.get("selin:modeller"))["3618"].durum, "sitede"); // sitedeki kayıt bozulmadı
});

test("Pelin teslim → site (4 Kasım): kanal videosu ürün videolarının başına, Pelin fotoğrafı galeriye (ilk fotoğrafın arkasına), tek commit; fiyat açık depoya yazılmaz; tek seferlik fiyat temizliği", async () => {
  const o = ortam();
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDO } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); const s = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []); return { toArray: () => s }; } };
  const stok = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  o.env.SAHIP_IDS = "111";
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3618", baslik: "X", fiyat: 55, fotolar: ["galeri/3618/1.jpg", "galeri/3618/2.jpg"], videolar: ["selin/3618/0"] }, { kod: "3700", fiyat: 40, fotolar: [], videolar: [] }]));
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url) === "https://img/pelin.jpg" ? new Response(new Uint8Array([9, 9, 9])) : asil(url, istek));
  const { kuyrugaEkle } = await import("./venom-kopru.js");
  const { pelinSiteAdimi } = await import("./selin.js");
  await kuyrugaEkle(o.env, "pelinSite", { id: "3618-a", kod: "3618", kanal: "Volonteroseoffical", videoMesaj: 5555, foto: "https://img/pelin.jpg" });
  await pelinSiteAdimi(o.env, ist(11));
  globalThis.fetch = asil;
  const liste = JSON.parse(o.github.dosyalar.get("veri/urunler.json"));
  const u = liste.find((x) => x.kod === "3618");
  assert.deepEqual(u.videolar, ["Volonteroseoffical/5555", "selin/3618/0"]);
  assert.equal(u.fotolar[0], "galeri/3618/1.jpg");
  assert.match(u.fotolar[1], /^galeri\/3618\/pelin-[a-z0-9-]+\.jpg$/);
  assert.ok(o.github.dosyalar.has(u.fotolar[1]));
  assert.ok(liste.every((x) => !("fiyat" in x))); // yazılan her listede fiyat yok
  assert.equal(o.github.commitler.filter(([m, y]) => m === "PATCH" && y === "/git/refs/heads/main").length, 1);
  assert.ok(o.g.some((x) => /🌸 3618: Pelin medyası siteye eklendi — video ✅ eklendi, 1\/1 fotoğraf/.test(x.govde.text || "")));
  // tek seferlik fiyat temizliği (Selin dışında yazılmış eski fiyatlar)
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3618", fiyat: 55 }, { kod: "3700", fiyat: 40 }]));
  o.depo.set("venom:siteFiyatSil", "1");
  await pelinSiteAdimi(o.env, ist(12));
  assert.ok(JSON.parse(o.github.dosyalar.get("veri/urunler.json")).every((x) => !("fiyat" in x)));
  assert.ok(!o.depo.has("venom:siteFiyatSil"));
  // tek seferlik: eski markasız Pelin medyası kaldırılır (model sitede kalır, diğer fotoğraflara dokunulmaz)
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3618", fotolar: ["galeri/3618/1.jpg", "galeri/3618/pelin-abc.jpg", "galeri/3618/2.jpg"], videolar: ["Volonteroseoffical/5555", "selin/3618/0"] }]));
  o.github.dosyalar.set("galeri/3618/pelin-abc.jpg", "x");
  o.depo.set("venom:siteMedyaKaldir", JSON.stringify([{ kod: "3618", fotolar: ["galeri/3618/pelin-abc.jpg"], videolar: ["Volonteroseoffical/5555"] }]));
  await pelinSiteAdimi(o.env, ist(13));
  const u2 = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.deepEqual([u2.fotolar, u2.videolar], [["galeri/3618/1.jpg", "galeri/3618/2.jpg"], ["selin/3618/0"]]);
  assert.ok(!o.github.dosyalar.has("galeri/3618/pelin-abc.jpg"));
  assert.match(o.depo.get("venom:siteMedyaKaldirSonuc"), /3618: 1 fotoğraf, 1 video kaldırıldı/);
});

test("Pelin → site (5 Kasım düzeltmesi): video DOSYADAN Selin oynatıcısına (selin/<kod>/100), ön + set fotoğrafları, tekrar gelirse çift eklenmez; hiçbir şey yoksa boş kayıt yok; yeniden onayda Pelin medyası korunur", async () => {
  const o = ortam();
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDO } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); const s = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []); return { toArray: () => s }; } };
  const stok = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  o.env.SAHIP_IDS = "111";
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3627", fotolar: ["galeri/3627/1-a.jpg", "galeri/3627/2-a.jpg"], videolar: ["selin/3627/0"] }]));
  const vid = "https://volonte-pelin.volonte.workers.dev/medya/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const on = "https://volonte-pelin.volonte.workers.dev/medya/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  o.depo.set("pelinmedya:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", new Uint8Array([1, 2, 3]).buffer);
  o.depo.set("pelinmedya:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", new Uint8Array([4, 5]).buffer);
  const asil = globalThis.fetch, videolar = [];
  globalThis.fetch = async (url, istek) => {
    if (String(url).endsWith("/sendVideo")) { videolar.push(istek.body.get("chat_id")); return Response.json({ ok: true, result: { message_id: 9, video: { file_id: "SV1", file_size: 3 } } }); }
    if (String(url) === "https://img/arka.jpg") return new Response(new Uint8Array([7]));
    return asil(url, istek);
  };
  const { kuyrugaEkle } = await import("./venom-kopru.js");
  const { pelinSiteAdimi, ozelVideo } = await import("./selin.js");
  const is = { id: "3627-b", kod: "3627", kanal: "Volonteroseoffical", videoMesaj: null, videoUrl: vid, foto: on, fotolar: ["https://img/arka.jpg"] };
  await kuyrugaEkle(o.env, "pelinSite", is);
  await pelinSiteAdimi(o.env, ist(11));
  let u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.deepEqual(u.videolar, ["selin/3627/100", "selin/3627/0"]);
  assert.equal(u.fotolar.length, 4);
  assert.equal(u.fotolar[0], "galeri/3627/1-a.jpg");
  assert.deepEqual(videolar, ["-555"]); // Selin'in arşivine yüklendi
  assert.ok(o.g.some((x) => /🌸 3627: Pelin medyası siteye eklendi — video ✅ eklendi, 2\/2 fotoğraf/.test(x.govde.text || "")));
  // sitenin oynatıcısı Pelin videosunu verir
  const r = await ozelVideo(o.env, "3627", "100", null);
  assert.equal(r.status, 200);
  // aynı iş tekrar gelirse: video yeniden yüklenmez, fotoğraf çift eklenmez, boş kayıt yazılmaz
  const once = o.github.commitler.length;
  await kuyrugaEkle(o.env, "pelinSite", { ...is, id: "3627-c" });
  await pelinSiteAdimi(o.env, ist(12));
  assert.equal(videolar.length, 1);
  assert.equal(o.github.commitler.filter(([m, y], i) => i >= once && m === "PATCH").length, 0);
  assert.ok(o.g.some((x) => /⚠️ 3627: Pelin medyası siteye eklenemedi \(video ✅ \(zaten vardı\), 0\/0 fotoğraf\)/.test(x.govde.text || "")));
  // tek seferlik elle ekleme yolu
  o.depo.set("venom:pelinSiteEkle", JSON.stringify([{ kod: "3627", fotolar: ["https://img/arka2.jpg"] }]));
  globalThis.fetch = async (url, istek) => (String(url) === "https://img/arka2.jpg" ? new Response(new Uint8Array([8])) : asil(url, istek));
  await pelinSiteAdimi(o.env, ist(13));
  globalThis.fetch = asil;
  u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.fotolar.length, 5);
  assert.ok(!o.depo.has("venom:pelinSiteEkle"));
});

test("FOTO YENİLE (5 Kasım): fotoğraflar yeni adla yeniden kaydedilir (önbellek), eski dosyalar silinir, liste güncellenir", async () => {
  const { pelinSiteAdimi } = await import("./selin.js");
  const o = ortam();
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3627", fotolar: ["galeri/3627/1.jpg", "galeri/3627/2.jpg"], videolar: [] }]));
  o.github.dosyalar.set("galeri/3627/1.jpg", "A"); o.github.dosyalar.set("galeri/3627/2.jpg", "B");
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).includes("/contents/galeri/3627/") ? new Response(String(url).includes("1.jpg") ? "A" : "B") : asil(url, istek));
  o.env.STOK = { idFromName: () => "s", get: () => ({ fetch: async () => Response.json([]) }) };
  o.depo.set("venom:siteFotoYenile", JSON.stringify({ kod: "3627" }));
  await pelinSiteAdimi(o.env, ist(11));
  globalThis.fetch = asil;
  const u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.fotolar.length, 2);
  assert.ok(u.fotolar.every((f) => /^galeri\/3627\/[12]-[a-z0-9]+\.jpg$/.test(f)), JSON.stringify([u.fotolar, o.depo.get("venom:siteFotoYenileSonuc")]));
  assert.ok(!o.github.dosyalar.has("galeri/3627/1.jpg"));
  assert.ok(o.github.dosyalar.has(u.fotolar[0]));
});

import { renkleriUygula, renkDilleri } from "./site-renk.js";
test("SİTE RENK SATIRI (5 Kasım, Patron kuralı): yeni renk → açıklamadaki renkler güncellenir (EN/FR/PT); bilinmeyen renk uydurulmaz; satır tek kalır", () => {
  assert.deepEqual(renkDilleri("koyu bordo"), { en: "dark burgundy", fr: "bordeaux foncé", pt: "bordô escuro" });
  assert.equal(renkDilleri("gökkuşağı"), null);
  const u = { kod: "3627", aciklama: { en: "A maxi dress. Made in Istanbul.", fr: "Robe longue.", pt: "Vestido longo." } };
  let r = renkleriUygula(u, ["siyah", "koyu bordo"]);
  assert.equal(r.urun.aciklama.en, "A maxi dress. Made in Istanbul. Colors: black, dark burgundy.");
  assert.equal(r.urun.aciklama.fr, "Robe longue. Couleurs : noir, bordeaux foncé.");
  assert.equal(r.urun.aciklama.pt, "Vestido longo. Cores: preto, bordô escuro.");
  r = renkleriUygula(r.urun, ["beyaz"]);
  assert.equal(r.urun.aciklama.en, "A maxi dress. Made in Istanbul. Colors: black, dark burgundy, white.");
  assert.deepEqual(r.urun.renkler, ["siyah", "koyu bordo", "beyaz"]);
  assert.equal(renkleriUygula(r.urun, ["beyaz"]).degisti, false); // aynı renk tekrar eklenmez
  const b = renkleriUygula(r.urun, ["gökkuşağı"]);
  assert.deepEqual([b.degisti, b.bilinmeyen], [false, ["gökkuşağı"]]);
});

test("SİTE RENK (5 Kasım): Pelin medyası yeni renkle gelince renk satırı güncellenir; ilk renk bilinmiyorsa yazılmaz + uyarı; tek seferlik venom:siteRenk; yeniden onayda renk korunur", async () => {
  const o = ortam();
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDO } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); const s = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []); return { toArray: () => s }; } };
  const stok = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  o.env.SAHIP_IDS = "111";
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3627", aciklama: { en: "Dress.", fr: "Robe.", pt: "Vestido." }, fotolar: ["galeri/3627/1.jpg"], videolar: [] }]));
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (/^https:\/\/img\//.test(String(url)) ? new Response(new Uint8Array([1])) : asil(url, istek));
  const { kuyrugaEkle } = await import("./venom-kopru.js");
  const { pelinSiteAdimi } = await import("./selin.js");
  // ilk renk kayıtlı değil → açıklamaya dokunulmaz, uyarı
  await kuyrugaEkle(o.env, "pelinSite", { id: "a", kod: "3627", foto: "https://img/1.jpg", renk: "koyu bordo" });
  await pelinSiteAdimi(o.env, ist(11));
  let u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.aciklama.en, "Dress.");
  assert.ok(o.g.some((x) => /ilk rengi kayıtlı değil/.test(x.govde.text || "")));
  // tek seferlik: renkleri yaz (Venom site_duzelt renkler)
  o.depo.set("venom:siteRenk", JSON.stringify([{ kod: "3627", renkler: ["siyah", "koyu bordo"], mod: "yaz" }]));
  await pelinSiteAdimi(o.env, ist(12));
  u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.aciklama.en, "Dress. Colors: black, dark burgundy.");
  assert.ok(!o.depo.has("venom:siteRenk"));
  assert.match(o.depo.get("venom:siteRenkSonuc"), /3627: açıklamadaki renkler → siyah, koyu bordo/);
  // beyaz Pelin'den gelince otomatik eklenir
  await kuyrugaEkle(o.env, "pelinSite", { id: "b", kod: "3627", foto: "https://img/2.jpg", renk: "beyaz" });
  await pelinSiteAdimi(o.env, ist(13));
  globalThis.fetch = asil;
  u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.aciklama.fr, "Robe. Couleurs : noir, bordeaux foncé, blanc.");
  assert.ok(o.g.some((x) => /açıklamaya renk eklendi \(beyaz\)/.test(x.govde.text || "")));
});

test("VİDEO DENETİMİ (5 Kasım): sitedeki her video Selin yoluyla denenir; 20 MB üstü / listede yok sınıflanır; gönderene TEK 'tekrar gönder' mesajı (bir kez)", async () => {
  const o = ortam();
  const { videoDenetimAdimi } = await import("./selin.js");
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3627", fotolar: [], videolar: ["selin/3627/100", "selin/3627/0"] }, { kod: "3612", fotolar: [], videolar: [] }]));
  o.depo.set("selin:pelinVid:3627", JSON.stringify([{ n: 100, file_id: "PV", boyut: 2600000, uid: "upv" }]));
  o.depo.set("selin:modeller", JSON.stringify({
    "3627": { kaynak: "ozel", durum: "sitede", zaman: ist(9), gonderen: 222, medya: [{ tur: "video", file_id: "V0", boyut: 5e6, uid: "u0" }], taslak: { videolar: [{ id: 0, file_id: "V0", boyut: 5e6 }] } },
    "3612": { kaynak: "ozel", durum: "sitede", zaman: ist(9), gonderen: 222, medya: [{ tur: "video", file_id: "B", boyut: 34 * 1048576, belge: true, uid: "ub" }], taslak: { videolar: [] } },
  }));
  const d = await videoDenetimAdimi(o.env, ist(11), { zorla: true });
  assert.equal(d.siteVideo, 2);
  assert.equal(d.calisan, 2);
  assert.deepEqual(d.sorunlar.map((x) => [x.kod, x.tur]), [["3612", "buyuk"]]);
  assert.match(d.sorunlar[0].neden, /34\.0 MB/);
  // 6 Kasım: denetim artık kendisi mesaj atmaz; Merdan'a günde BİR tek liste (siteDefteriAdimi)
  assert.equal(o.g.filter((x) => x.metod === "sendMessage" && String(x.govde.chat_id) === "222").length, 0);
  // 3 saat dolmadan tekrar çalışmaz; zorlansa da aynı video için tekrar mesaj yok
  assert.equal(await videoDenetimAdimi(o.env, ist(12)), null);
  await videoDenetimAdimi(o.env, ist(15), { zorla: true });
  assert.ok(o.depo.has("venom:videoDenetim"));
});

test("TEKRAR GÖNDERİM (5 Kasım): sitedeki modele sadece video gelirse yeni taslak açılmaz, video doğrudan siteye eklenir; 20 MB üstü video gelince hemen uyarı", async () => {
  const o = ortam();
  const { guncelleme: gun, pelinSiteAdimi, siteVideoEkleAdimi } = await import("./selin.js");
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3612", fotolar: ["galeri/3612/1.jpg"], videolar: [] }]));
  o.depo.set("selin:modeller", JSON.stringify({ "3612": { kaynak: "ozel", durum: "sitede", gonderen: 222, medya: [{ tur: "foto", file_id: "F", uid: "uf" }, { tur: "video", file_id: "B", boyut: 34 * 1048576, uid: "ub" }], taslak: { videolar: [{ id: 0, file_id: "B", boyut: 34 * 1048576 }] } } }));
  // büyük video → hemen uyarı
  await gun({ message: { message_id: 7, chat: { id: 222, type: "private" }, from: { id: 222, first_name: "Merdan" }, caption: "3612", video: { file_id: "B2", file_unique_id: "ub2", file_size: 30 * 1048576, width: 1080 } } }, o.env);
  assert.ok(o.g.some((x) => /30\.0 MB — Telegram botları 20 MB üstünü indiremez/.test(x.govde.text || "")));
  // küçük video → siteye eklenir
  await gun({ message: { message_id: 8, chat: { id: 222, type: "private" }, from: { id: 222, first_name: "Merdan" }, caption: "3612", video: { file_id: "K", file_unique_id: "uk", file_size: 8 * 1048576, width: 1080 } } }, o.env);
  const m = JSON.parse(o.depo.get("selin:modeller"))["3612"];
  assert.equal(m.durum, "sitede"); // yeni taslak açılmadı
  assert.equal(m.taslak.videolar.length, 3);
  await siteVideoEkleAdimi(o.env, ist(11));
  const u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.deepEqual(u.videolar, ["selin/3612/2"]); // 30 MB'lık (1) eklenmez
  assert.deepEqual(u.fotolar, ["galeri/3612/1.jpg"]);
  assert.ok(o.g.some((x) => /🎬 3612: yeni video siteye eklendi/.test(x.govde.text || "")));
  void pelinSiteAdimi;
});

test("KANAL → SİTE VİDEO (5 Kasım): Kemal'in kanala koyduğu video siteye eklenir; aynı video (uid) iki kez eklenmez; video olmayan mesaj atlanır", async () => {
  const o = ortam();
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDO } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); const s = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []); return { toArray: () => s }; } };
  const stok = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3194", fotolar: [], videolar: [] }]));
  const { kuyrugaEkle } = await import("./venom-kopru.js");
  const { kanalVideoAdimi } = await import("./selin.js");
  await kuyrugaEkle(o.env, "kanalVideo", { id: "a", kod: "3194", mesajlar: [300, 301] });
  await kanalVideoAdimi(o.env, ist(11));
  let u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.deepEqual(u.videolar, ["Volonteroseoffical/301"]);
  assert.equal(JSON.parse(o.depo.get("selin:vid:301")).uid, "uv301");
  await kuyrugaEkle(o.env, "kanalVideo", { id: "b", kod: "3194", mesajlar: [301] });
  await kanalVideoAdimi(o.env, ist(12));
  u = JSON.parse(o.github.dosyalar.get("veri/urunler.json"))[0];
  assert.equal(u.videolar.length, 1);
});

test("SİTE DEFTERİ (6 Kasım): tek liste — marka (Sami/model kartı), renk, foto/video, video bekleniyor (20 MB üstü, yeniden gönderilmemiş); eski kayıt düzeltme; Merdan'a günde BİR liste", async () => {
  const o = ortam();
  const { siteDefteriYenile, siteDefteriAdimi } = await import("./selin.js");
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([
    { kod: "3582", fotolar: ["a", "b"], videolar: ["selin/3582/1"], eklenme: "2026-10-31" },
    { kod: "3396", fotolar: ["a"], videolar: [], eklenme: "2026-11-05" },
    { kod: "907", fotolar: ["a"], videolar: ["selin/907/1"], eklenme: "2026-11-04" },
  ]));
  o.depo.set("pelinboy:3582", JSON.stringify({ marka: "BLACKROSE", renk: "siyah" }));
  o.depo.set("pelinboy:3396", JSON.stringify({ marka: "VOLONTE" }));
  o.depo.set("pelinboy:907", JSON.stringify({ marka: "VOLONTE" }));
  const B = 30 * 1048576, K = 5 * 1048576;
  o.depo.set("selin:modeller", JSON.stringify({
    "3582": { kaynak: "ozel", durum: "sitede", gonderen: 222, medya: [{ tur: "video", boyut: B }, { tur: "video", boyut: K }] }, // aynı partide küçük video → büyük hâlâ bekleniyor
    "3396": { kaynak: "ozel", durum: "sitede", gonderen: 222, medya: [{ tur: "video", boyut: B }] },
    "907": { kaynak: "ozel", durum: "istendi", gonderen: 222, medya: [{ tur: "video", boyut: B }, { tur: "video", boyut: K, yeniden: true }] }, // yeniden geldi
    "3001": { kaynak: "ozel", durum: "sitede", medya: [] }, // sitede yok → eski kayıt
  }));
  const r = await siteDefteriYenile(o.env, ist(10), { tam: true });
  const d = JSON.parse(o.depo.get("venom:siteDefteri"));
  assert.equal(r.sayi, 3);
  assert.deepEqual([d.modeller["3582"].marka, d.modeller["3582"].renkler, d.modeller["3582"].videoBekleniyor], ["BLACKROSE", ["siyah"], true]);
  assert.equal(d.modeller["3396"].videoBekleniyor, true);
  assert.equal(d.modeller["907"].videoBekleniyor, false);
  assert.ok(r.duzeltme.some((x) => /3001: Selin kaydı "sitede" idi, sitede yok/.test(x)));
  assert.ok(r.duzeltme.some((x) => /907: Selin kaydı "istendi" idi, sitede var/.test(x)));
  // Merdan'a günde bir tek liste
  await siteDefteriAdimi(o.env, ist(11));
  await siteDefteriAdimi(o.env, ist(12));
  const m = o.g.filter((x) => x.metod === "sendMessage" && String(x.govde.chat_id) === "222");
  assert.equal(m.length, 1);
  assert.match(m[0].govde.text, /Videosu beklenen modeller \(2\):\n1\. 3396[\s\S]*2\. 3582/);
});

test("6 Kasım: GitHub 502 → Selin vazgeçmez; 10 dk sonra yine 502, 30 dk sonra yüklenir ve haber verir; ikisi de olmazsa tek uyarı + Venom raporu", async () => {
  const o = ortam();
  const { DatabaseSync } = await import("node:sqlite");
  const { StokDO } = await import("./stok.js");
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) { if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const st = db.prepare(q); const s = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []); return { toArray: () => s }; } };
  const stok = new StokDO({ storage: { sql } });
  o.env.STOK = { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) };
  Object.assign(o.env, { SAHIP_IDS: "111", GH_BEKLEME: 0 });
  o.github.dosyalar.set("veri/urunler.json", JSON.stringify([{ kod: "3618", baslik: "X", fotolar: ["galeri/3618/1.jpg"], videolar: [] }]));
  const asil = globalThis.fetch;
  let bozuk = true;
  globalThis.fetch = async (url, istek) => {
    if (String(url) === "https://img/pelin.jpg") return new Response(new Uint8Array([9, 9, 9]));
    if (String(url) === "https://img/pelin2.jpg") return new Response(new Uint8Array([7, 7, 7, 7]));
    if (bozuk && String(url).endsWith("/git/refs/heads/main") && istek && istek.method === "PATCH") return new Response(JSON.stringify({ message: "Server Error" }), { status: 502 });
    return asil(url, istek);
  };
  const { kuyrugaEkle } = await import("./venom-kopru.js");
  const { pelinSiteAdimi, ghTekrarAdimi } = await import("./selin.js");
  const { sorunRaporu } = await import("./venom-bot.js");
  const t0 = ist(11);
  await kuyrugaEkle(o.env, "pelinSite", { id: "3618-a", kod: "3618", foto: "https://img/pelin.jpg" });
  await pelinSiteAdimi(o.env, t0);
  const yazi = () => o.g.filter((x) => x.metod === "sendMessage").map((x) => x.govde.text);
  assert.ok(yazi().some((t) => /⏳ 3618: GitHub şu an hata veriyor; Pelin medyasını 10 dk ve 30 dk sonra/.test(t)));
  assert.equal(JSON.parse(o.depo.get("selin:ghTekrar")).length, 1);
  await ghTekrarAdimi(o.env, t0 + 5 * 60); // vakti gelmedi
  assert.equal(JSON.parse(o.depo.get("selin:ghTekrar"))[0].asama, 0);
  await ghTekrarAdimi(o.env, t0 + 10 * 60); // 10 dk: yine 502 → 30 dk'ya
  const q = JSON.parse(o.depo.get("selin:ghTekrar"));
  assert.deepEqual([q[0].asama, q[0].sonraki], [1, t0 + 30 * 60]);
  bozuk = false;
  await ghTekrarAdimi(o.env, t0 + 30 * 60); // 30 dk: yüklenir
  assert.ok(yazi().some((t) => /🌸 3618: Pelin medyası siteye eklendi/.test(t)));
  assert.equal(JSON.parse(o.depo.get("selin:ghTekrar")).length, 0);
  assert.match(await sorunRaporu(o.env, t0 + 3600), /GitHub hatası sonrası kendiliğinden yüklendi: 3618 \(30 dk sonra\)/);
  // ikisi de olmazsa: tek uyarı + rapor
  bozuk = true;
  o.g.length = 0;
  await kuyrugaEkle(o.env, "pelinSite", { id: "3618-b", kod: "3618", foto: "https://img/pelin2.jpg" });
  await pelinSiteAdimi(o.env, t0 + 3600);
  await ghTekrarAdimi(o.env, t0 + 3600 + 600);
  await ghTekrarAdimi(o.env, t0 + 3600 + 1800);
  globalThis.fetch = asil;
  const uyari = yazi().filter((t) => /⚠️ 3618 siteye yüklenemedi: GitHub hâlâ hata veriyor/.test(t));
  assert.equal(uyari.length, 1);
  assert.match(await sorunRaporu(o.env, t0 + 7200), /❌ Selin: 3618 siteye yüklenemedi — GitHub hatası, 10 ve 30 dk sonra da olmadı/);
});
