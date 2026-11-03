// Çalıştırma: node --test test-pelin.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { guncelleme, pelinCron, videoGirdisi, buAyHarcanan, fotoYazisi, fotoSirala, yeniVideoIstemi, SAHNE_VARSAYILAN } from "./pelin.js";

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
  const yaziCevap = { kod: "3557", fn: null }; // son kare yazısı (sahte okuma)
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
      const sema = govde.output_config && govde.output_config.format && govde.output_config.format.schema;
      if (sema && (sema.required || []).includes("kod_okunan")) return Response.json({ id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(yaziCevap.fn ? yaziCevap.fn() : { volonte_var: true, kod_okunan: yaziCevap.kod, baska_yazi_var: false, fiyat_var: false }) }], usage: { input_tokens: 10, output_tokens: 5 } });
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
  for (const k of ["3557", "3601", "3627", "3630"]) depo.set(`pelinboy:${k}`, JSON.stringify({ boy: "midi" })); // testlerde boy kayıtlı (boy sorusu ayrı testte)
  return { env, depo, g, falIstek, claude, falSonuc, site, yaziCevap };
}
const yazi = (o, kimden, text) => guncelleme({ message: { message_id: 1, date: 1, chat: { id: kimden, type: "private" }, from: { id: kimden, first_name: kimden === MURAT ? "Murat" : "Hemra" }, text } }, o.env);
const bas = (o, kimden, data) => guncelleme({ callback_query: { id: "c", from: { id: kimden, first_name: "X" }, data, message: { chat: { id: kimden }, message_id: 9, text: "kart" } } }, o.env);
const sonDugmeler = (o) => o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde.reply_markup.inline_keyboard.flat();

test("video araçları: üçünde aynı süre (6 sn)", () => {
  assert.deepEqual([videoGirdisi("veo", "k").duration, videoGirdisi("kling", "k").duration, videoGirdisi("seedance", "k").duration], ["6s", "6", "6"]);
  assert.equal(videoGirdisi("kling", "k").start_image_url, "k");
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
  o.falSonuc["fal-ai/veo3.1/image-to-video"] = (n) => ({ video: { url: `https://vid/${n}.mp4` } });
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
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video").length, 1);
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
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video").length, 0); // geçmeyen fotoğraftan video yapılmaz
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

test("eski deneme akışı TAMAMEN kaldırıldı: 'fal hazır' sohbete gider; sohbet aracı yeni üretim kartını gönderir; /durum anahtarları gösterir", async () => {
  const o = ortam();
  o.env.OPENAI_API_KEY = "x";
  await yazi(o, MURAT, "fal hazır");
  assert.equal(o.claude.length, 1); // komut değil, normal sohbet
  assert.ok(!o.g.some((x) => /fal hazır" yazın|askı fotoğraf|kör test/i.test(x.govde.text || "")));
  o.claude.cevaplar = [
    { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "uretim_karti", input: { kodlar: ["3557"], test: false, buyuk_seri: [], renkler: [], sablon: "" } }], usage: { input_tokens: 10, output_tokens: 5 } },
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
  assert.match(d[0].govde.prompt, /Change ONLY this: make her skin tone slightly deeper\. Keep her identity exactly the same — she must clearly be the same person: same face shape/);
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
  const ikinci = async () => { // kart iki modeli gösterir; üretimi tek tek yürüt (son kare kodu modele göre okunur)
    await yazi(o, MURAT, "/uret 3601");
    o.yaziCevap.kod = "3601";
    await bas(o, MURAT, `pu:o:${o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
    o.claude.cevaplar = Array.from({ length: 4 }, () => claudeJsonCevap(GECTI));
    await cronlar(o, 12);
  };
  assert.match(kart.text, /Yüz: 3557 büyük seri \(3 numaralı dolgun kız\), 3601 küçük seri \(2 numaralı siyahi kız\)/);
  assert.match(kart.text, /Ortam: katalog fotoğrafı Siyah Altın Lüks · video Live Your Life Şehir/);
  assert.match(kart.text, /Video başlangıç karesi \(Live Your Life Şehir\)/);
  await bas(o, MURAT, `pu:i:${kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  await yazi(o, MURAT, "/uret 3557");
  await bas(o, MURAT, `pu:o:${o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  o.claude.cevaplar = Array.from({ length: 4 }, () => claudeJsonCevap(GECTI));
  await cronlar(o, 12);
  await ikinci();
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  const b = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3557/1.jpg"));
  assert.equal(b.length, 2); // katalog + video karesi
  assert.equal(b[0].govde.image_urls[0], "https://pelin.test/dosya/" + "c".repeat(32)); // büyük seri yüzü
  assert.match(b[0].govde.prompt, /black gold studio/);
  assert.match(b[1].govde.prompt, /city street golden hour/);
  const k = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3601/1.jpg"));
  assert.equal(k[0].govde.image_urls[0], "https://pelin.test/dosya/" + "a".repeat(32)); // küçük seri yüzü
  assert.ok(!edit.some((x) => /80s neon/.test(x.govde.prompt)));
  const video = o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.equal(video.length, 2);
  assert.match(video[0].govde.prompt, /Setting and atmosphere: city street golden hour\. Strong first second: she is walking and turns to face the camera\. The camera slowly orbits around her[\s\S]*close-up of the neckline\/collar and stitching[\s\S]*"VOLONTE" and directly below it the model code "3557"[\s\S]*no price/);
  assert.match(video[1].govde.prompt, /model code "3601"/);
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

// ---------- 3627 eksikleri (3 Kasım): Patron'un ürün fotoğrafları, dosya, renk, sahne ayarları, kapak + şablon, örnek video ----------
const SECIM_ROLLU = () => JSON.stringify({ yuzler: { kucuk: { ad: "2 numaralı siyahi kız", fileId: "K", anahtar: "a".repeat(32) }, buyuk: { ad: "3 numaralı dolgun kız", fileId: "B", anahtar: "c".repeat(32) } }, ortamlar: [{ ...ORTAMLAR3[0], rol: "kampanya" }, { ...ORTAMLAR3[1], rol: "katalog" }, { ...ORTAMLAR3[2], rol: "video" }], arac: "veo" });
const fotoMesaj = (o, { caption, grup, mid, dosya = false, tur = "image/jpeg", kimden = MURAT }) => guncelleme({ message: { message_id: mid, date: 1793700000 + mid, chat: { id: kimden, type: "private" }, from: { id: kimden, first_name: "X" }, ...(caption ? { caption } : {}), ...(grup ? { media_group_id: grup } : {}), ...(dosya ? { document: { file_id: `D${mid}`, mime_type: tur } } : { photo: [{ file_id: "k" }, { file_id: `P${mid}` }] }) } }, o.env);

test("fotoğraf yazısı: kod, rol (ön/arka/detay), renk", () => {
  assert.deepEqual(fotoYazisi("3627 Kırmızı ÖN"), { kod: "3627", rol: "on", renk: "kırmızı" });
  assert.deepEqual(fotoYazisi("3627 arka"), { kod: "3627", rol: "arka", renk: null });
  assert.deepEqual(fotoYazisi("3627 yaka detayı beyaz"), { kod: "3627", rol: "detay", renk: "beyaz" });
  assert.deepEqual(fotoSirala([{ anahtar: "x", rol: "detay" }, { anahtar: "y", rol: "arka" }, "z"]).map((x) => [x.anahtar, x.rol]), [["z", "on"], ["y", "arka"], ["x", "detay"]]);
});

test("Patron'un ürün fotoğrafları: albüm (yazı ilk fotoğrafta; sıra karışık gelse de) 1. ön 2. arka, renk; 'dosya olarak' desteklenir; HEIC reddedilir; eski deneme akışına düşmez", async () => {
  const o = uretimOrtami();
  await fotoMesaj(o, { grup: "G1", mid: 11, dosya: true, tur: "image/png" }); // yazısız ikinci fotoğraf önce geldi → bekler, cevap yok
  assert.equal(o.g.filter((x) => x.metod === "sendMessage").length, 0);
  await fotoMesaj(o, { caption: "3627 kırmızı", grup: "G1", mid: 10 });
  const l = fotoSirala(JSON.parse(o.depo.get("pelin:urunfoto:3627")));
  assert.deepEqual(l.map((x) => [x.rol, x.renk, x.dosya]), [["on", "kırmızı", false], ["arka", "kırmızı", true]]);
  const cevap = o.g.filter((x) => x.metod === "sendMessage");
  assert.equal(cevap.length, 1);
  assert.match(cevap[0].govde.text, /✅ 3627 kırmızı ürün fotoğrafı alındı .*Kayıtlı: ön, arka\. Üretimde siteden önce bunlar kullanılır/);
  assert.ok(!o.g.some((x) => /denemede|askı|kumaş fotoğrafı/.test(x.govde.text || "")));
  await fotoMesaj(o, { grup: "G1", mid: 12 }); // albümün 3. fotoğrafı → detay
  assert.deepEqual(fotoSirala(JSON.parse(o.depo.get("pelin:urunfoto:3627"))).map((x) => x.rol), ["on", "arka", "detay"]);
  await fotoMesaj(o, { caption: "3630", mid: 20, dosya: true, tur: "image/heic" });
  assert.match(o.g.at(-1).govde.text, /image\/heic\) kullanılamıyor.*JPEG\/PNG/);
  await fotoMesaj(o, { caption: "güzel", mid: 21, kimden: HEMRA });
  assert.match(o.g.at(-1).govde.text, /yazısına model kodunu yazın/);
  await yazi(o, MURAT, "/fotolar 3627");
  assert.deepEqual(o.g.at(-1).govde.media.map((x) => x.caption), ["1. ön · kırmızı", "2. arka · kırmızı", "3. detay · kırmızı"]);
});

test("3627 kırmızı: Patron'un fotoğrafları (siteden önce) + sadece kırmızı + sahne ayarları + son kare yazısı kontrolü + kapak + şablon; şablonla yeni model", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3627", bedenler: "38-40-42-44-46-48-50", fotolar: ["galeri/3627/1.jpg"] }, { kod: "3630", bedenler: "38-40-42-44", fotolar: ["galeri/3630/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  await fotoMesaj(o, { caption: "3627 ön", mid: 10, dosya: true });
  await fotoMesaj(o, { caption: "3627 arka", mid: 11, dosya: true });
  const kayit = JSON.parse(o.depo.get("pelin:urunfoto:3627"));
  const on = kayit.find((x) => x.rol === "on").anahtar, arka = kayit.find((x) => x.rol === "arka").anahtar;
  await yazi(o, MURAT, "/uret 3627 kırmızı");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /Renk: 3627 sadece kırmızı/);
  assert.match(kart.text, /Ürün fotoğrafı: 3627 sizin gönderdiğiniz \(ön, arka\)/);
  assert.match(kart.text, /Sahne: yürürken kameraya dönüş · kamera etrafında dönüş · kumaş hareketi · yaka\/dikiş yakın kare · son karede küçük VOLONTE \+ kod \(fiyat yok\) · kapak fotoğrafı videodan/);
  await bas(o, MURAT, `pu:o:${kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  o.yaziCevap.fn = (() => { let n = 0; return () => (++n === 1 ? { volonte_var: true, kod_okunan: "3672", baska_yazi_var: false, fiyat_var: false } : { volonte_var: true, kod_okunan: "3627", baska_yazi_var: false, fiyat_var: false }); })();
  o.claude.cevaplar = Array.from({ length: 6 }, () => claudeJsonCevap(GECTI));
  await cronlar(o, 16);
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.deepEqual(edit[0].govde.image_urls, ["https://pelin.test/dosya/" + "a".repeat(32), `https://pelin.test/dosya/${on}`, `https://pelin.test/dosya/${arka}`]); // site değil, Patron'un ön + arka
  assert.match(edit[0].govde.prompt, /image 2 = FRONT view, image 3 = BACK view[\s\S]*red \(kırmızı\) color variant ONLY/);
  assert.match(edit[1].govde.prompt, /city street golden hour[\s\S]*red \(kırmızı\) color variant ONLY/);
  const kontrol = o.claude.filter((x) => JSON.stringify(x.messages).includes("İSTENEN RENK: kırmızı"));
  assert.ok(kontrol.length >= 3);
  const video = o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.equal(video.length, 2); // ilk videonun son karesinde kod yanlış okundu (3672) → otomatik yeniden
  assert.match(video[0].govde.prompt, /red \(kırmızı\) color variant ONLY[\s\S]*orbits[\s\S]*"VOLONTE"[\s\S]*"3627"/);
  const is = JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3627-"))[1]);
  assert.ok(is.gecmis.some(([, t]) => /video 1: geçmedi \(.*son karedeki kod yanlış \(okunan: "3672"/.test(t)));
  assert.ok(o.g.some((x) => x.metod === "sendPhoto" && /🖼 3627 kapak \(videodan\)/.test(x.govde.caption || "")));
  const on2 = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.match(on2.govde.text, /son kare yazısı ✅[\s\S]*Ürün fotoğrafı: sizin gönderdiğiniz · renk kırmızı/);
  const dugmeler = on2.govde.reply_markup.inline_keyboard.flat();
  assert.deepEqual(dugmeler.map((x) => x.text), ["✅ Onayla", "🔄 Yeniden üret", "❌ İptal", "💾 Bu ayarları şablon olarak kaydet", "🎬 Kling 4.0 ile de dene (0,94 $)", "🎬 Kling 3.0 4K ile de dene (2,52 $)"]);
  await bas(o, MURAT, dugmeler[3].callback_data);
  const sb = JSON.parse(o.depo.get("pelin:sablonlar"))["3627"];
  assert.equal(sb.katalogOrtamId, "2");
  assert.equal(sb.videoOrtamId, "3");
  assert.equal(sb.sahne.sonYazi, true);
  assert.match(o.g.at(-1).govde.text, /"3627 şablonu" kaydedildi/);
  await bas(o, MURAT, dugmeler[0].callback_data);
  assert.equal(JSON.parse(o.depo.get("venom:pelinTeslim"))[0].kapak, is.kapak || JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3627-"))[1]).kapak);
  // şablonla yeni model
  await yazi(o, MURAT, "/uret 3630 şablon:3627");
  assert.match(o.g.at(-1).govde.text, /şablon: 3627/);
});

test("örnek video: Patron'un dosyası ve 'sitedeki 3627 videosu gibi' → kareler → tarif", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3627", bedenler: "38-44", fotolar: [], videolar: ["selin/3627/0"] });
  await yazi(o, MURAT, "sitedeki 3627 videosu gibi olsun");
  const kare = o.falIstek.filter((x) => x.uc === "fal-ai/ffmpeg-api/extract-frame");
  assert.equal(kare.length, 3);
  assert.equal(kare[0].govde.video_url, "https://volonte-selin.volonte.workers.dev/v2/3627/0");
  await guncelleme({ message: { message_id: 5, date: 1, chat: { id: MURAT, type: "private" }, from: { id: MURAT, first_name: "M" }, document: { file_id: "VD", mime_type: "video/mp4", file_size: 5000 } } }, o.env);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/ffmpeg-api/extract-frame").length, 6);
  assert.match(o.g.at(-1).govde.text, /Örneği inceliyorum/);
});

test("eski akışa düşmüş fotoğraflar tek seferlik aktarılır (venom:pelinUrunFoto)", async () => {
  const o = uretimOrtami();
  o.depo.set("venom:pelinUrunFoto", JSON.stringify({ kod: "3627", fotolar: [{ anahtar: "1".repeat(32), rol: "on" }, { anahtar: "2".repeat(32), rol: "arka" }] }));
  await cronlar(o, 1);
  assert.deepEqual(fotoSirala(JSON.parse(o.depo.get("pelin:urunfoto:3627"))).map((x) => [x.anahtar[0], x.rol]), [["1", "on"], ["2", "arka"]]);
  assert.ok(!o.depo.has("venom:pelinUrunFoto"));
});

// ---------- Boy ve kadraj (3 Kasım) ----------
test("boy: ilk üretimden önce Pelin tahmin edip tek tuşla sorar → kalıcı (bütün renkler, iki seri) → maliyet kartı; boy referansı ön/arkadan ayrı; kartta boy + kadraj", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3700", bedenler: "44-46-48-50", fotolar: ["galeri/3700/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  await fotoMesaj(o, { caption: "3700 boy referansı", mid: 30 });
  assert.match(o.g.at(-1).govde.text, /📏 3700 boy referansı kaydedildi \(fotoğraf; ön\/arka ürün fotoğraflarından ayrı\)/);
  assert.ok(!o.depo.has("pelin:urunfoto:3700")); // ürün fotoğrafı sayılmaz
  o.claude.cevaplar = [claudeJsonCevap({ boy: "bilek", emin: true, neden: "Etek bilekte bitiyor." })];
  await yazi(o, MURAT, "/uret 3700 koyu bordo");
  const soru = o.g.at(-1).govde;
  assert.match(soru.text, /📏 3700: bilek boyu mu\? Etek bilekte bitiyor\./);
  assert.deepEqual(soru.reply_markup.inline_keyboard[0].map((x) => x.text), ["✅ Evet, bilek", "Mini", "Diz", "Midi", "Maksi"]);
  assert.equal(o.falIstek.length, 0);
  await bas(o, MURAT, soru.reply_markup.inline_keyboard[0][0].callback_data);
  const b = JSON.parse(o.depo.get("pelinboy:3700"));
  assert.equal(b.boy, "bilek");
  assert.equal(b.referans.length, 1);
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /Renk: 3700 sadece koyu bordo/);
  assert.match(kart.text, /Boy: 3700 bilek \(ayakkabı görünür, etek yere değmez\) · referans var/);
  assert.match(kart.text, /Kadraj: tam boy \(baş ve ayakkabı kesilmez\) · sade, zarif ayakkabı/);
  assert.match(kart.text, /3700 büyük seri \(3 numaralı dolgun kız\)/);
  // ikinci üretimde boy sorulmaz
  await yazi(o, MURAT, "/uret 3700 beyaz");
  assert.match(o.g.at(-1).govde.text, /Renk: 3700 sadece beyaz[\s\S]*Boy: 3700 bilek/);
  // üretim: istemde boy + kadraj + referans görseli (son), kontrol boyu denetler; boy farklıysa otomatik yeniden
  await bas(o, MURAT, `pu:o:${kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  o.yaziCevap.kod = "3700";
  o.claude.cevaplar = [claudeJsonCevap({ ...GECTI, boy_dogru: false, kadraj_tam: true, sorunlar: ["boy farklı: maksi, yerde sürünüyor"] }), ...Array.from({ length: 4 }, () => claudeJsonCevap({ ...GECTI, boy_dogru: true, kadraj_tam: true }))];
  await cronlar(o, 16);
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.equal(edit[0].govde.image_urls.length, 3); // yüz + site fotoğrafı + boy referansı (son)
  assert.equal(edit[0].govde.image_urls[2], `https://pelin.test/dosya/${b.referans[0].anahtar}`);
  assert.match(edit[0].govde.prompt, /dark burgundy \(koyu bordo\) color variant ONLY[\s\S]*LENGTH[\s\S]*ankle length: the hem ends exactly at the ankles; the shoes and feet are fully visible and the hem does NOT touch the floor[\s\S]*plus-size[\s\S]*FRAMING: full body from head to toe — never crop the head or the shoes[\s\S]*SHOES: simple, elegant[\s\S]*LAST image is a LENGTH\/FRAMING reference only/);
  const kontrol = o.claude.find((x) => JSON.stringify(x.messages).includes("İSTENEN BOY: bilek"));
  assert.ok(kontrol && kontrol.output_config.format.schema.required.includes("boy_buyuk_fark"));
  const is = JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3700-"))[1]);
  assert.ok(is.gecmis.some(([, t]) => /foto 1: geçmedi \(.*boy farklı/.test(t)));
  assert.ok(edit.length >= 3); // boy farkı → katalog fotoğrafı yeniden üretildi
  const video = o.falIstek.find((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.match(video.govde.prompt, /ankle length[\s\S]*shoes visible/);
});

test("boy: sohbetle kaydedilir; Venom boysuz üretim başlatamaz; şablonda boy saklanır", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  const { venomUretimi } = await import("./pelin.js");
  assert.match((await venomUretimi(o.env, { kodlar: ["3701"], test: false }, 1)).hata, /3701 için boy kayıtlı değil/);
  const tu = { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "boy_kaydet", input: { kod: "3701", boy: "midi" } }], usage: { input_tokens: 10, output_tokens: 5 } };
  o.claude.cevaplar = [tu, { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Kaydettim." }], usage: { input_tokens: 10, output_tokens: 5 } }];
  await yazi(o, MURAT, "3701 midi boy");
  assert.match(o.claude[1].messages.at(-1).content[0].content, /KAYDEDİLDİ: 3701 boyu midi/);
  assert.equal(JSON.parse(o.depo.get("pelinboy:3701")).boy, "midi");
});

// ---------- Kalıcı ayarlar + Patron son söz (3 Kasım) ----------
const K2 = (o = {}) => claudeJsonCevap({ renk_buyuk_fark: false, kesim_buyuk_fark: false, boy_buyuk_fark: false, kadraj_tam: true, makyaj_var: true, puan: 8, buyuk_sorunlar: [], kucuk_notlar: [], ...o });

test("Patron son söz: kontrolden geçmeyen foto → '✅ Yine de onayla' → video aşamasına devam; küçük farklar durdurmaz, not olur; puan; öğrenme; makyaj + yaka istemde", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilek", detayEn: "draped scarf-like loose high collar", detayTr: "drapeli fular yaka" }));
  await yazi(o, MURAT, "/uret büyük:3627 koyu bordo");
  await bas(o, MURAT, `pu:o:${o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  const buyuk = K2({ renk_buyuk_fark: true, puan: 5, buyuk_sorunlar: ["parlak kırmızı, ürün koyu bordo"], kucuk_notlar: ["payet daha seyrek"] });
  o.claude.cevaplar = [buyuk, buyuk];
  await cronlar(o, 5);
  const kart = o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /Büyük farklar:\n• Pelin: parlak kırmızı, ürün koyu bordo[\s\S]*📝 Küçük farklar \(üretimi durdurmadı\):\n• Pelin: payet daha seyrek[\s\S]*🎯 Kontrol puanı \(Pelin\/ChatGPT, 10 üzerinden\): foto 5[\s\S]*✅ Yine de onayla: bu fotoğrafla devam ederim \(video karesi \+ video\)/);
  assert.equal(kart.reply_markup.inline_keyboard[0][0].text, "✅ Yine de onayla");
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.equal(edit.length, 2);
  assert.match(edit[0].govde.prompt, /NECKLINE AND DETAILS: copy the exact neckline\/collar shape[\s\S]*THIS MODEL: draped scarf-like loose high collar\.[\s\S]*MAKEUP \(always\): elegant, defined yet natural — eye makeup with mascara and lashes, groomed shaped eyebrows, a soft blush, and a lipstick shade that harmonizes with the dress\. Never a bare, makeup-free face\./);
  // Patron yine de onaylar → video karesine devam (küçük farklar artık durdurmaz)
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][0].callback_data);
  assert.match(o.g.at(-1).govde.text, /fotoğraf Patron onayıyla geçti — video karesi ve video üretiliyor/);
  const og = JSON.parse(o.depo.get("pelin:ogrenme"));
  assert.equal(og[0].karar, "yine de onay");
  assert.match(og[0].farklar[0], /parlak kırmızı/);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = [K2({ kucuk_notlar: ["yaka biraz sade"] }), K2({ puan: 9 })];
  await cronlar(o, 10);
  const sahneKontrol = o.claude.find((x) => JSON.stringify(x.messages).includes("Patron'un önceki kararları (öğren)"));
  assert.ok(sahneKontrol, "öğrenme kontrol sorusuna girer");
  assert.match(JSON.stringify(sahneKontrol.messages), /makyaj_var: yüzde belirgin makyaj/);
  const on = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.ok(on, "video önizlemesi gelmeli");
  assert.match(on.govde.text, /bir aşama Patron onayıyla geçti[\s\S]*📝 Küçük farklar[\s\S]*yaka biraz sade/);
  assert.equal(on.govde.reply_markup.inline_keyboard[0][0].text, "✅ Onayla");
});

test("kontrol: makyajsız yüz ve kadraj büyük sorun; video aşamasında kalan iş 'yine de onayla' ile teslim; Hemra onayı hazır ama kapalı", async () => {
  const { kaliteKontrol, devamAsamasi } = await import("./pelin.js");
  const o = uretimOrtami();
  o.claude.cevaplar = [K2({ makyaj_var: false })];
  const k = await kaliteKontrol(o.env, ["u"], ["g"], 1, { yuz: true });
  assert.equal(k.gecti, false);
  assert.deepEqual(k.sorunlar, ["Pelin: yüz makyajsız"]);
  o.claude.cevaplar = [K2({ kucuk_notlar: ["hafif ton farkı"] })];
  const k2 = await kaliteKontrol(o.env, ["u"], ["g"], 1, {});
  assert.equal(k2.gecti, true);
  assert.deepEqual(k2.notlar, ["Pelin: hafif ton farkı"]);
  assert.equal(devamAsamasi({ video: "v" }), "teslim");
  assert.equal(devamAsamasi({ foto: "f" }), "video_gonder");
  o.depo.set("pelin:is:3627-x", JSON.stringify({ id: "3627-x", kod: "3627", durum: "uyari", foto: "f", sahne: "s", video: "v", sorunlar: ["Pelin: son karedeki kod yanlış"] }));
  await bas(o, HEMRA, "pu:a:3627-x");
  assert.equal(JSON.parse(o.depo.get("pelin:is:3627-x")).durum, "uyari"); // Hemra onayı kapalı
  await yazi(o, MURAT, "/hemraonay");
  assert.match(o.g.at(-1).govde.text, /Hemra onayı: KAPALI/);
  await bas(o, MURAT, "pu:a:3627-x");
  assert.equal(JSON.parse(o.depo.get("pelin:is:3627-x")).durum, "onaylandi");
  assert.equal(JSON.parse(o.depo.get("venom:pelinTeslim"))[0].kod, "3627");
});

test("örnek video 'bunun gibi yap, büyük 3627 koyu bordo' → tarif → ▶️ üret: seri + renk + şablon kartta", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  await guncelleme({ message: { message_id: 7, date: 1, chat: { id: MURAT, type: "private" }, from: { id: MURAT, first_name: "M" }, caption: "bunun gibi yap, büyük 3627 koyu bordo", video: { file_id: "V7", mime_type: "video/mp4", file_size: 9000 } } }, o.env);
  o.claude.cevaplar = [claudeJsonCevap({ ad: "salon", kamera: "slow dolly", isik: "warm", hiz: "slow", poz: "walks", ortam_havasi: "elegant ballroom", ozet: "Salon havası." })];
  await cronlar(o, 1);
  const t = o.g.find((x) => /Tarif çıkarıldı — "salon"/.test(x.govde.text || ""));
  await bas(o, MURAT, t.govde.reply_markup.inline_keyboard[0][1].callback_data);
  const kart = o.g.at(-1).govde.text;
  assert.match(kart, /şablon: salon/);
  assert.match(kart, /3627 büyük seri/);
  assert.match(kart, /Renk: 3627 sadece koyu bordo/);
  assert.match(kart, /video örnek videonun ortamı \(salon\)/);
});

// ---------- Lüks marka seviyesi (3 Kasım): A + B ----------
test("lüks: varsayılan Veo 3.1 (1080p, gerçek fiyat); premium kartında aksesuar + lüks mekân; istemde sinematik ışık, VOLONTE kadını, poz (kesim daraltılmaz); karşılaştırma Kling 4.0", async () => {
  const o = uretimOrtami();
  o.falSonuc["kling/v4/image-to-video"] = (n) => ({ video: { url: `https://vid/k${n}.mp4` } });
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.claude.cevaplar = [claudeJsonCevap({ aksesuar_tr: "altın küpe ve ince altın kolye, nude çanta", aksesuar_en: "gold earrings, a delicate gold necklace and a nude clutch", mekan_tr: "5 yıldızlı otel lobisi", mekan_en: "a grand five-star hotel lobby with marble floors and warm chandeliers" })];
  await yazi(o, MURAT, "/uret büyük:3627 koyu bordo premium");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /· PREMIUM\nVideo aracı: Google Veo 3\.1 \(1080p\)/);
  assert.match(kart.text, /Aksesuar \(3627\): altın küpe ve ince altın kolye, nude çanta\nPremium mekân \(3627\): 5 yıldızlı otel lobisi/);
  assert.match(kart.text, /Video 6 sn — Google Veo 3\.1 \(1080p\): 6 × 0,40 \$ \(fal fiyat listesi\): 2,40 \$/);
  assert.match(kart.text, /poz ile bel vurgusu \(kesim daraltılmaz\)/);
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).stil["koyu bordo"].aksesuarTr, "altın küpe ve ince altın kolye, nude çanta"); // bir kez seçilir, saklanır
  await bas(o, MURAT, `pu:o:${kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]}`);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 4 }, () => K2());
  await cronlar(o, 12);
  const edit = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.match(edit[0].govde.prompt, /black gold studio[\s\S]*VOLONTE WOMAN: successful, wealthy and self-confident[\s\S]*NEVER make the garment tighter[\s\S]*LIGHT: cinematic[\s\S]*ACCESSORIES: gold earrings/);
  assert.match(edit[1].govde.prompt, /grand five-star hotel lobby[\s\S]*people in the background softly blurred/); // premium video karesi lüks mekânda
  const v = o.falIstek.find((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.equal(v.govde.resolution, "1080p");
  assert.equal(v.govde.generate_audio, false);
  assert.match(v.govde.prompt, /Slow-motion movement of the skirt and her hair/);
  assert.match(v.govde.prompt, /artistic close-ups of the lace, sequins/);
  const on = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.match(on.govde.text, /Video aracı: Google Veo 3\.1 \(1080p\) · aksesuar: altın küpe[\s\S]*PREMIUM/);
  const k4 = on.govde.reply_markup.inline_keyboard.flat().find((x) => /Kling 4\.0/.test(x.text));
  await bas(o, MURAT, k4.callback_data);
  assert.match(o.g.at(-1).govde.text, /aynı kareyle Kling 4\.0 \(1080p\) videosu üretiliyor \(~0,94 \$\)/);
  o.claude.cevaplar = Array.from({ length: 2 }, () => K2());
  await cronlar(o, 6);
  const kv = o.falIstek.find((x) => x.uc === "kling/v4/image-to-video");
  assert.ok(kv && kv.govde.start_image_url && kv.govde.resolution === "1080p" && kv.govde.duration === 6);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit").length, edit.length); // karşılaştırmada yeni fotoğraf üretilmez
  assert.equal(o.g.filter((x) => /ÖNİZLEME — 3627/.test(x.govde.text || "")).length, 2);
});

test("yüz yükseltme kartları (tek seferlik) ve /arac seçenekleri", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("venom:pelinYuzKart", JSON.stringify([{ seri: "kucuk", talimat: "zengin, bakımlı kadın görünümü", istem: "polished wealthy look" }, { seri: "buyuk", talimat: "zengin, bakımlı kadın görünümü", istem: "polished wealthy look" }]));
  await cronlar(o, 1);
  const kartlar = o.g.filter((x) => /✏️ Yüz düzenleme/.test(x.govde.text || ""));
  assert.equal(kartlar.length, 2);
  assert.ok(!o.depo.has("venom:pelinYuzKart"));
  assert.equal(o.falIstek.length, 0);
  await yazi(o, MURAT, "/arac");
  assert.match(o.g.at(-1).govde.text, /Video aracı: Google Veo 3\.1 \(1080p\)\. Seçenekler: veo31[\s\S]*kling4 \(Kling 4\.0 \(1080p\), 0,16 \$\/sn\)/);
  await yazi(o, MURAT, "/arac kling4");
  assert.equal(JSON.parse(o.depo.get("pelin:secim")).aracElle, true);
});
