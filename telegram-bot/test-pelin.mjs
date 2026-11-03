// Çalıştırma: node --test test-pelin.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { guncelleme, pelinCron, maliyet, harfDagit, sonucMetni, videoGirdisi, buAyHarcanan, onizlemeGonder } from "./pelin.js";

const MURAT = 9000000001;
const HEMRA = 9000000002;
const ay = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 7);

function ortam({ fal = true } = {}) {
  const depo = new Map();
  const g = []; // Telegram çağrıları
  const falIstek = [];
  const claude = [];
  let id = 100;
  const falSonuc = {}; // uc → sonuç
  const site = []; // veri/urunler.json
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    const govde = istek.body ? JSON.parse(istek.body) : null;
    if (u.startsWith("https://queue.fal.run/")) {
      if (istek.method === "POST") {
        const uc = u.slice("https://queue.fal.run/".length);
        falIstek.push({ uc, govde });
        const n = falIstek.length;
        return Response.json({ request_id: `r${n}`, status_url: `https://fal/durum/${n}`, response_url: `https://fal/sonuc/${n}?uc=${encodeURIComponent(uc)}` });
      }
    }
    if (u.startsWith("https://fal/durum/")) return Response.json({ status: "COMPLETED" });
    if (u.startsWith("https://fal/sonuc/")) {
      const n = u.split("/")[4].split("?")[0];
      const uc = decodeURIComponent(u.split("uc=")[1]);
      return Response.json(falSonuc[uc] ? falSonuc[uc](n) : { images: [{ url: `https://img/${n}a.jpg` }, { url: `https://img/${n}b.jpg` }] });
    }
    if (u.includes("raw.githubusercontent.com")) return Response.json(site);
    if (u.startsWith("https://api.anthropic.com")) {
      claude.push(govde);
      const c = claude.cevaplar && claude.cevaplar.shift();
      return Response.json(c || { id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: "end_turn", content: [{ type: "text", text: "Merhaba!" }], usage: { input_tokens: 100, output_tokens: 50 } });
    }
    g.push({ metod: u.split("/").pop(), govde });
    return Response.json({ ok: true, result: { message_id: id++, url: "", file_path: "x.jpg" } });
  };
  const env = {
    BOT_TOKEN: "t", ANTHROPIC_API_KEY: "k", SELF_URL: "https://pelin.test", WEBHOOK_SECRET: "s", ALLOWED_IDS: `${MURAT},9000000003`, MURAT_ID: String(MURAT), HEMRA_ID: String(HEMRA),
    ...(fal ? { FAL_KEY: "fal-anahtar" } : {}),
    KAYIT: {
      async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
    },
  };
  return { env, depo, g, falIstek, claude, falSonuc, site };
}
const yazi = (o, kimden, text) => guncelleme({ message: { message_id: 1, date: 1, chat: { id: kimden, type: "private" }, from: { id: kimden, first_name: kimden === MURAT ? "Murat" : "Hemra" }, text } }, o.env);
const bas = (o, kimden, data) => guncelleme({ callback_query: { id: "c", from: { id: kimden, first_name: "X" }, data, message: { chat: { id: kimden }, message_id: 9, text: "kart" } } }, o.env);
const sonDugmeler = (o) => o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde.reply_markup.inline_keyboard.flat();

test("maliyet: yüz 6 aday 0,90 $; kare 2 × 0,15; video 3 araç × 2 model, aynı süre", () => {
  assert.equal(maliyet("yuz").toplam, 0.9);
  assert.equal(maliyet("foto").toplam, 0.3);
  const v = maliyet("video");
  assert.ok(v.toplam > 5.5 && v.toplam < 6, String(v.toplam));
  assert.deepEqual([videoGirdisi("veo", "k").duration, videoGirdisi("kling", "k").duration, videoGirdisi("seedance", "k").duration], ["6s", "6", "6"]);
  assert.equal(videoGirdisi("kling", "k").start_image_url, "k");
});





test("kör test: harfler karışık, sonuçta araç adları, maliyet ve oylar açılır", () => {
  const h = harfDagit(["veo", "kling", "seedance", "gercek"], () => 0);
  assert.deepEqual(Object.values(h).sort(), ["gercek", "kling", "seedance", "veo"]);
  const env = { MURAT_ID: String(MURAT), HEMRA_ID: String(HEMRA) };
  const d = { modeller: {
    3592: { harfler: { A: "kling", B: "gercek" }, oylar: { [MURAT]: "A", [HEMRA]: "B" }, videolar: { kling: { url: "u", fiyat: 0.672 }, gercek: { url: "g", fiyat: 0 } }, puan: { kling: { renk: 9, desen: 8, kesim: 9, not: "iyi" } } },
    3577: { harfler: { A: "veo" }, oylar: {}, videolar: { veo: { url: "u", fiyat: 0.3 }, seedance: { hata: "422", fiyat: 0 } }, puan: {} },
  } };
  const m = sonucMetni(d, env);
  assert.match(m, /A = Kling 3\.0 Pro · 0,67 \$ · renk 9 desen 8 kesim 9 \(iyi\) · 🏆 Murat/);
  assert.match(m, /B = Gerçek kanal videosu · — · puan yok · 🏆 Hemra/);
  assert.match(m, /Seedance 2\.0: üretilemedi — 422/);
});

test("sohbet: komutsuz Claude (Sonnet), /beyin opus sadece Murat; yabancıya cevap yok", async () => {
  const o = ortam();
  await yazi(o, MURAT, "Merhaba Pelin, ilk videoda ne yapalım?");
  assert.equal(o.claude[0].model, "claude-sonnet-5-5");
  assert.equal(o.g.at(-1).govde.text, "Merhaba!");
  await yazi(o, HEMRA, "/beyin opus");
  assert.match(o.g.at(-1).govde.text, /sadece Murat/);
  await yazi(o, MURAT, "/beyin opus");
  await yazi(o, MURAT, "Devam");
  assert.equal(o.claude.at(-1).model, "claude-opus-5-5");
  const n = o.g.length;
  await yazi(o, 999, "selam");
  assert.equal(o.g.length, n);
});

// ---------- Üretim akışı (2 Kasım) ----------
const claudeJsonCevap = (obj) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 100, output_tokens: 50 } });
function uretimOrtami() {
  const o = ortam();
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => {
    if (String(url).endsWith("/sendMediaGroup")) { const gv = JSON.parse(istek.body); o.g.push({ metod: "sendMediaGroup", govde: gv }); return Response.json({ ok: true, result: gv.media.map((_, i) => ({ message_id: 500 + i, photo: [{ file_id: `kucuk${i}` }, { file_id: `YUZ${i}` }] })) }); }
    return asil(url, istek);
  };
  o.falSonuc["fal-ai/veo3.1/lite/image-to-video"] = (n) => ({ video: { url: `https://vid/${n}.mp4` } });
  return o;
}
const GECTI = { renk_ayni: true, desen_ayni: true, kesim_ayni: true, sorunlar: [] };
const GECMEDI = { renk_ayni: false, desen_ayni: true, kesim_ayni: true, sorunlar: ["renk tonu koyulaşmış"] };
const secimKur = (o) => o.depo.set("pelin:secim", JSON.stringify({ yuz: { manken: "siyahi", fileId: "YUZ", anahtar: "a".repeat(32) }, ortamlar: [{ id: "1", ad: "Siyah-altın", sahne: "black and gold studio", hareket: "slow turn" }], arac: "veo" }));
const cronlar = async (o, n) => { for (let i = 0; i < n; i++) await pelinCron(o.env, Math.floor(Date.now() / 1000)); };

test("kurulum: /kurulum maliyet onayı → 3 yüz + 3 ortam önerisi → Patron yüz ve ortam seçer → kalıcı seçim; başkası seçemez", async () => {
  const o = uretimOrtami();
  await yazi(o, HEMRA, "/kurulum");
  assert.match(o.g.at(-1).govde.text, /sadece Patron/);
  await yazi(o, MURAT, "/kurulum");
  assert.match(o.g.at(-1).govde.text, /3 manken yüzü \(3 × 0,15 \$ = 0,45 \$\)/);
  assert.equal(o.falIstek.length, 0); // onaysız harcama yok
  o.claude.cevaplar = [claudeJsonCevap({ ortamlar: [{ ad: "Retro 80'ler", aciklama: "neon", sahne: "80s neon", hareket: "dance" }, { ad: "Siyah-altın", aciklama: "lüks", sahne: "black gold", hareket: "turn" }, { ad: "Live your life", aciklama: "şehir", sahne: "city street", hareket: "walk" }] })];
  await bas(o, MURAT, "pk:o");
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro").length, 3);
  assert.match(o.g.find((x) => /Ortam önerileri/.test(x.govde.text || "")).govde.text, /1\) Retro 80'ler — neon/);
  await bas(o, MURAT, "pk:t:2");
  await cronlar(o, 1);
  assert.equal(o.g.filter((x) => x.metod === "sendMediaGroup").length, 1);
  await bas(o, HEMRA, "pk:y:siyahi");
  assert.ok(!o.depo.has("pelin:secim"));
  await bas(o, MURAT, "pk:y:siyahi");
  const s = JSON.parse(o.depo.get("pelin:secim"));
  assert.equal(s.yuz.manken, "siyahi");
  assert.equal(s.yuz.fileId, "YUZ1");
  assert.deepEqual(s.ortamlar.map((x) => x.ad), ["Siyah-altın"]);
  assert.match(o.g.at(-1).govde.text, /Kalıcı seçim kaydedildi/);
});

test("üretim: onaysız başlamaz; foto kontrolden geçmezse otomatik yeniden üretir; geçince video + kare kontrolü → Patron önizlemesi [Onayla/Yeniden/İptal]; onay → teslim kuyruğu; fiyat/stok yok", async () => {
  const o = uretimOrtami();
  secimKur(o);
  o.depo.set("pelin:urunfoto:3557", JSON.stringify(["b".repeat(32)]));
  await yazi(o, MURAT, "/uret 3557");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /Üretim — 1 model: 3557/);
  assert.equal(o.falIstek.length, 0);
  const id = kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, MURAT, `pu:o:${id}`);
  o.claude.cevaplar = [claudeJsonCevap(GECMEDI), claudeJsonCevap(GECTI), claudeJsonCevap(GECTI)];
  await cronlar(o, 9);
  const foto = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.equal(foto.length, 2); // ilk deneme renk farkı → otomatik yeniden
  assert.deepEqual(foto[0].govde.image_urls, ["https://pelin.test/dosya/" + "a".repeat(32), "https://pelin.test/dosya/" + "b".repeat(32)]);
  assert.match(foto[0].govde.prompt, /black and gold studio/);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/lite/image-to-video").length, 1);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/ffmpeg-api/extract-frame").length, 3);
  const on = o.g.find((x) => /ÖNİZLEME — 3557/.test(x.govde.text || ""));
  assert.ok(on, "önizleme gelmeli");
  assert.deepEqual(on.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Onayla", "🔄 Yeniden üret", "❌ İptal"]);
  assert.ok(o.g.some((x) => x.metod === "sendVideo" && x.govde.chat_id === String(MURAT)));
  assert.ok(!o.g.some((x) => /\$|fiyat|stok/i.test(String(x.govde.caption || ""))));
  const isId = on.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, HEMRA, `pu:a:${isId}`);
  assert.ok(!o.depo.has("venom:pelinTeslim"));
  await bas(o, MURAT, `pu:a:${isId}`);
  assert.deepEqual(JSON.parse(o.depo.get("venom:pelinTeslim")).map((x) => x.kod), ["3557"]);
});

test("üretim: 2 denemede kontrolden geçmezse Patron'a ⚠️ (sorunlarla); maliyet testi bitince model başı maliyet raporu", async () => {
  const o = uretimOrtami();
  secimKur(o);
  o.depo.set("pelin:urunfoto:3557", JSON.stringify(["b".repeat(32)]));
  await yazi(o, MURAT, "/maliyettesti 3557");
  assert.match(o.g.at(-1).govde.text, /MALİYET TESTİ — 1 model/);
  const id = o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, MURAT, `pu:o:${id}`);
  o.claude.cevaplar = [claudeJsonCevap(GECMEDI), claudeJsonCevap(GECMEDI)];
  await cronlar(o, 6);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit").length, 2);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/lite/image-to-video").length, 0); // geçmeyen fotoğraftan video yapılmaz
  const uyari = o.g.find((x) => /⚠️ 3557 · .*2\. deneme|Sorunlar:/.test(x.govde.text || ""));
  assert.ok(uyari);
  assert.match(uyari.govde.text, /renk tonu koyulaşmış/);
  assert.match(o.g.find((x) => /Maliyet testi bitti/.test(x.govde.text || "")).govde.text, /3557: 0,3\d \$ — foto 2, video 0 deneme — ⚠️ kontrolden geçmedi/);
});

test("örnek video: Patron video + 'bunun gibi yap, 3557' → kareler → tarif (yüz/logo/müzik yok) → şablon kaydı; link indirilemezse dosya istenir", async () => {
  const o = uretimOrtami();
  secimKur(o);
  await guncelleme({ message: { message_id: 1, date: 1, chat: { id: MURAT, type: "private" }, from: { id: MURAT, first_name: "Murat" }, caption: "bunun gibi yap, 3557", video: { file_id: "VID", mime_type: "video/mp4", file_size: 1000 } } }, o.env);
  const kare = o.falIstek.filter((x) => x.uc === "fal-ai/ffmpeg-api/extract-frame");
  assert.equal(kare.length, 3);
  assert.match(kare[0].govde.video_url, /^https:\/\/pelin\.test\/dosya\/[a-f0-9]{32}$/); // Telegram anahtarı dışarı verilmez
  o.claude.cevaplar = [claudeJsonCevap({ ad: "neon", kamera: "slow dolly in", isik: "warm neon", hiz: "slow motion", poz: "turns and smiles", ortam_havasi: "80s club", ozet: "Ağır çekim neon hava." })];
  await cronlar(o, 1);
  const t = o.g.find((x) => /Tarif çıkarıldı — "neon"/.test(x.govde.text || ""));
  assert.ok(t);
  assert.deepEqual(t.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["💾 Şablon olarak kaydet", "▶️ 3557 için üret"]);
  assert.match(o.claude[0].messages[0].content.at(-1).text, /yüzünü, kimliğini, logoları, yazıları, markaları ve müziği TARİFE KOYMA/);
  const oid = t.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, MURAT, `ps:k:${oid}`);
  assert.equal(JSON.parse(o.depo.get("pelin:sablonlar")).neon.kamera, "slow dolly in");
  // indirilemeyen link
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).startsWith("https://instagram") ? new Response("<html>", { headers: { "content-type": "text/html" } }) : asil(url, istek));
  await yazi(o, MURAT, "bunun gibi yap https://instagram.com/reel/x");
  assert.match(o.g.at(-1).govde.text, /videoyu dosya olarak atın/);
});

test("eski deneme akışı kapalı (3 Kasım): 'fal hazır' ve sohbet aracı yeni kurulum kartını gönderir; 'fal hazır yazın' engeli yok; /durum anahtarları gösterir", async () => {
  const o = ortam();
  o.env.OPENAI_API_KEY = "x";
  await yazi(o, MURAT, "fal hazır");
  assert.match(o.g.at(-1).govde.text, /Kurulum: 3 manken yüzü/);
  assert.ok(!o.g.some((x) => /fal hazır" yazın/.test(x.govde.text || "")));
  o.claude.cevaplar = [
    { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "uretim_karti", input: { kodlar: ["3557"], test: false } }], usage: { input_tokens: 10, output_tokens: 5 } },
    { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Kartı gönderdim Patron." }], usage: { input_tokens: 10, output_tokens: 5 } },
  ];
  o.depo.set("pelin:secim", JSON.stringify({ yuz: { manken: "siyahi", fileId: "Y", anahtar: "a".repeat(32) }, ortamlar: [{ id: "1", ad: "Siyah-altın", sahne: "x", hareket: "y" }], arac: "veo" }));
  await yazi(o, MURAT, "3557 için video yapalım");
  assert.ok(o.g.some((x) => /Üretim — 1 model: 3557/.test(x.govde.text || "")));
  assert.equal(o.falIstek.length, 0); // kart para harcamaz
  assert.ok(!o.claude[0].tools.some((x) => x.name === "onizleme_gonder"));
  await yazi(o, MURAT, "/durum");
  assert.match(o.g.at(-1).govde.text, /FAL ✅ · ANTHROPIC ✅ · OPENAI ✅/);
});

// ---------- Yüzler (3 Kasım): iki seri yüzü, düzenleme, fotoğraftan yüz, ortam rolleri, dürüst araç sonucu ----------
const ORTAMLAR3 = [{ id: "1", ad: "Retro Neon", sahne: "80s neon night", hareket: "dance" }, { id: "2", ad: "Siyah Altın Lüks", sahne: "black gold studio", hareket: "orbit" }, { id: "3", ad: "Live Your Life Şehir", sahne: "city street golden hour", hareket: "walk and twirl" }];

test("tek seferlik yüz kaydı: iki seri yüzü fotoğraflarıyla tek mesaj + ortam rolleri + düzenleme kartı; onay → önce/sonra → Kaydet → kalıcı", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:kurulum", JSON.stringify({ isler: [], ortamlar: ORTAMLAR3, yuzGonderildi: true }));
  o.depo.set(`pelin:sohbet:${MURAT}`, JSON.stringify([{ role: "user", content: "eski" }]));
  o.depo.set("venom:pelinYuzKaydi", JSON.stringify({
    yuzler: { kucuk: { url: "https://fal/yuz2.jpg", manken: "siyahi", ad: "2 numaralı siyahi kız", kaynak: "03.11 13:45 kurulumu" }, buyuk: { url: "https://fal/yuz3.jpg", manken: "dolgun", ad: "3 numaralı dolgun kız", kaynak: "03.11 13:45 kurulumu" } },
    ortamRolleri: { 1: "kampanya", 2: "katalog", 3: "video" }, notlar: ["14:33 kurulumunun yüzleri kullanılmıyor."], sohbetSifirla: true,
    duzenle: { seri: "buyuk", talimat: "ten rengini biraz koyulaştır", istem: "make her skin tone slightly deeper" },
  }));
  await cronlar(o, 1);
  const album = o.g.filter((x) => x.metod === "sendMediaGroup");
  assert.equal(album.length, 1);
  assert.deepEqual(album[0].govde.media.map((x) => [x.media, x.caption]), [["https://fal/yuz2.jpg", "👤 Küçük seri (38-44): 2 numaralı siyahi kız"], ["https://fal/yuz3.jpg", "👤 Büyük seri (44-50): 3 numaralı dolgun kız"]]);
  const s = JSON.parse(o.depo.get("pelin:secim"));
  assert.equal(s.yuzler.kucuk.fileId, "YUZ0");
  assert.equal(s.yuzler.buyuk.fileId, "YUZ1");
  assert.deepEqual(s.ortamlar.map((x) => [x.ad, x.rol]), [["Retro Neon", "kampanya"], ["Siyah Altın Lüks", "katalog"], ["Live Your Life Şehir", "video"]]);
  assert.ok(!o.depo.has("venom:pelinYuzKaydi") && !o.depo.has(`pelin:sohbet:${MURAT}`));
  const mesaj = o.g.filter((x) => x.metod === "sendMessage");
  assert.equal(mesaj.length, 1); // fotoğraflar + TEK mesaj
  assert.match(mesaj[0].govde.text, /Küçük seri \(38-44\): 2 numaralı siyahi kız[\s\S]*Büyük seri \(44-50\): 3 numaralı dolgun kız[\s\S]*14:33[\s\S]*Siyah Altın Lüks → katalog fotoğrafları[\s\S]*Live Your Life Şehir → videolar[\s\S]*Retro Neon → sadece kampanya videoları[\s\S]*ten rengini biraz koyulaştır[\s\S]*0,15 \$/);
  assert.equal(o.falIstek.length, 0); // onaysız harcama yok
  await cronlar(o, 1);
  assert.equal(o.g.filter((x) => x.metod === "sendMediaGroup").length, 1); // bir kez
  const id = mesaj[0].govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, HEMRA, `pz:o:${id}`);
  assert.equal(o.falIstek.length, 0);
  await bas(o, MURAT, `pz:o:${id}`);
  const d = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].govde.image_urls, [`https://pelin.test/dosya/${s.yuzler.buyuk.anahtar}`]);
  assert.match(d[0].govde.prompt, /Change ONLY this: make her skin tone slightly deeper\. Keep her identity exactly the same: same face shape, eyes, eyebrows, nose, lips/);
  await bas(o, MURAT, `pz:o:${id}`); // ikinci basış harcamaz
  assert.equal(o.falIstek.length, 1);
  await cronlar(o, 1);
  const os = o.g.filter((x) => x.metod === "sendMediaGroup").at(-1);
  assert.deepEqual(os.govde.media.map((x) => x.caption), ["Önce (kayıtlı yüz)", "Sonra: ten rengini biraz koyulaştır"]);
  const kart = o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde;
  assert.deepEqual(kart.reply_markup.inline_keyboard[0].map((x) => x.text), ["💾 Kaydet", "🔄 Yeniden (0,15 $)", "❌ Vazgeç"]);
  assert.equal(JSON.parse(o.depo.get("pelin:secim")).yuzler.buyuk.fileId, "YUZ1"); // Kaydet'e basılmadan değişmez
  await bas(o, MURAT, `pz:k:${id}`);
  const s2 = JSON.parse(o.depo.get("pelin:secim"));
  assert.equal(s2.yuzler.buyuk.fileId, "YUZ1"); // albümün 2. fotoğrafı (sahte Telegram yine YUZ1 döner)
  assert.equal(s2.yuzler.buyuk.duzenleme, "ten rengini biraz koyulaştır");
  assert.equal(s2.yuzler.buyuk.onceki.fileId, "YUZ1");
  assert.equal(s2.yuzler.kucuk.fileId, "YUZ0"); // küçük seri dokunulmadı
  assert.match(o.g.at(-1).govde.text, /Büyük seri \(44-50\) yüzü artık düzenlenmiş hâli/);
});

test("Patron'un fotoğrafı → yüz olarak kaydet (seri sorulur); Hemra'nın fotoğrafı yüz olmaz; kodlu fotoğraf ürün fotoğrafıdır", async () => {
  const o = uretimOrtami();
  const foto = (kimden, caption) => guncelleme({ message: { message_id: 1, date: 1793700000, chat: { id: kimden, type: "private" }, from: { id: kimden, first_name: "X" }, caption, photo: [{ file_id: "kucuk" }, { file_id: `FOTO-${kimden}` }] } }, o.env);
  await foto(MURAT, "yüz");
  const kart = o.g.at(-1).govde;
  assert.deepEqual(kart.reply_markup.inline_keyboard[0].map((x) => x.text), ["👤 Küçük seri", "👤 Büyük seri", "❌ Hayır"]);
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][1].callback_data);
  const s = JSON.parse(o.depo.get("pelin:secim"));
  assert.equal(s.yuzler.buyuk.fileId, `FOTO-${MURAT}`);
  assert.match(o.g.at(-1).govde.text, /Büyük seri \(44-50\) yüzü = bu fotoğraf/);
  await foto(HEMRA, "yüz");
  assert.ok(!/kalıcı yüz/.test(o.g.at(-1).govde.text || ""));
  await foto(MURAT, "3557");
  assert.match(o.g.at(-1).govde.text, /3557 ürün fotoğrafı alındı/);
});

test("üretim rollerle: büyük seri modeli büyük seri yüzüyle; katalog fotoğrafı Siyah-Altın, video karesi Şehir, video şehirden; Retro Neon günlükte yok; site fotoğrafları okunur", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3557", bedenler: "44-46-48-50", fotolar: ["galeri/3557/1.jpg", "galeri/3557/2.jpg"] }, { kod: "3601", bedenler: "38-40-42-44", fotolar: ["galeri/3601/1.jpg"] });
  o.depo.set("pelin:secim", JSON.stringify({ yuzler: { kucuk: { ad: "2 numaralı siyahi kız", fileId: "K", anahtar: "a".repeat(32) }, buyuk: { ad: "3 numaralı dolgun kız", fileId: "B", anahtar: "c".repeat(32) } }, ortamlar: [{ ...ORTAMLAR3[0], rol: "kampanya" }, { ...ORTAMLAR3[1], rol: "katalog" }, { ...ORTAMLAR3[2], rol: "video" }], arac: "veo" }));
  await yazi(o, MURAT, "/uret 3557 3601");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /Yüz: 3557 büyük seri \(3 numaralı dolgun kız\), 3601 küçük seri \(2 numaralı siyahi kız\)/);
  assert.match(kart.text, /Ortam: katalog fotoğrafı Siyah Altın Lüks · video Live Your Life Şehir/);
  assert.match(kart.text, /Video başlangıç karesi \(Live Your Life Şehir\)/);
  await bas(o, MURAT, `pu:o:${kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  o.claude.cevaplar = Array.from({ length: 8 }, () => claudeJsonCevap(GECTI));
  await cronlar(o, 12);
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  const b = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3557/1.jpg"));
  assert.equal(b.length, 2); // katalog + video karesi
  assert.equal(b[0].govde.image_urls[0], "https://pelin.test/dosya/" + "c".repeat(32)); // büyük seri yüzü
  assert.match(b[0].govde.prompt, /black gold studio/);
  assert.match(b[1].govde.prompt, /city street golden hour/);
  const k = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3601/1.jpg"));
  assert.equal(k[0].govde.image_urls[0], "https://pelin.test/dosya/" + "a".repeat(32)); // küçük seri yüzü
  assert.ok(!edit.some((x) => /80s neon/.test(x.govde.prompt)));
  const video = o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/lite/image-to-video");
  assert.equal(video.length, 2);
  assert.match(video[0].govde.prompt, /walk and twirl/);
  assert.ok(o.g.some((x) => /🎞 3557 \(video karesi\)/.test(x.govde.caption || "")));
});

test("dürüstlük: kart gitmediyse araç sonucu 'GÖNDERİLMEDİ' der; araçtan önce yazılan 'gönderdim' Patron'a gitmez", async () => {
  const o = ortam();
  const tu = (ad, input) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "text", text: "Kartı gönderdim Patron ✅" }, { type: "tool_use", id: "t1", name: ad, input }], usage: { input_tokens: 10, output_tokens: 5 } });
  const son = (text) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } });
  o.claude.cevaplar = [tu("uretim_karti", { kodlar: ["3557"], test: false, buyuk_seri: [] }), son("Kart gitmedi Patron: önce yüz kaydı lazım.")];
  await yazi(o, MURAT, "3557 için video");
  assert.match(o.claude[1].messages.at(-1).content[0].content, /^KART GÖNDERİLMEDİ\. Patron'a sadece şu mesaj gitti: "Önce kurulum/);
  const giden = o.g.filter((x) => x.metod === "sendMessage").map((x) => x.govde.text);
  assert.ok(!giden.some((t) => /Kartı gönderdim/.test(t)));
  assert.equal(giden.at(-1), "Kart gitmedi Patron: önce yüz kaydı lazım.");
  // düzenleme kartı: kayıtlı yüz yoksa kart açılmaz ve sonuç bunu söyler
  o.claude.cevaplar = [tu("yuz_duzenle_karti", { seri: "buyuk", talimat: "ten koyu", istem_en: "darker skin" }), son("Yüz kayıtlı değil.")];
  await yazi(o, MURAT, "büyük seri yüzünü koyulaştır");
  assert.match(o.claude.at(-1).messages.at(-1).content[0].content, /KART GÖNDERİLMEDİ/);
  assert.ok(o.claude[0].system[0].text.includes("araç sonucunu görmeden \"gönderdim / kaydettim / başladım / hazırladım\" ASLA deme"));
});
