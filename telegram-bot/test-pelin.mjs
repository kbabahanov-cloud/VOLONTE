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
  return { env, depo, g, falIstek, claude, falSonuc };
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

test("fal hazır yazılmadan ve onaysız hiçbir üretim yok; sadece Murat onaylar; harcama yazılır", async () => {
  const o = ortam();
  await onizlemeGonder(o.env, "yuz", 1000);
  assert.match(o.g.at(-1).govde.text, /fal hazır/);
  await yazi(o, HEMRA, "fal hazır");
  assert.match(o.g.at(-1).govde.text, /Murat verir/);
  await yazi(o, MURAT, "fal hazır");
  const kart = o.g.filter((x) => /Maliyet önizlemesi/.test((x.govde || {}).text || "")).at(-1);
  assert.match(kart.govde.text, /Toplam \(yaklaşık\): 0,90 \$/);
  assert.equal(o.falIstek.length, 0); // önizleme para harcamaz
  const onay = sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data;
  await bas(o, HEMRA, onay);
  assert.equal(o.falIstek.length, 0);
  await bas(o, MURAT, onay);
  assert.equal(o.falIstek.length, 3);
  assert.ok(o.falIstek.every((f) => f.uc === "fal-ai/nano-banana-pro" && f.govde.num_images === 2 && /must not resemble any celebrity/.test(f.govde.prompt)));
  assert.equal(await buAyHarcanan(o.env, Math.floor(Date.now() / 1000)), 0.9);
  await bas(o, MURAT, onay); // ikinci basış
  assert.equal(o.falIstek.length, 3);
});

test("FAL_KEY yokken 'fal hazır' nereye gireceğini söyler; aylık sınırı aşan önizleme onaylanamaz; %80 uyarısı", async () => {
  const o = ortam({ fal: false });
  await yazi(o, MURAT, "fal hazır");
  assert.match(o.g.at(-1).govde.text, /volonte-pelin → Settings → Variables and Secrets/);
  const p = ortam();
  p.depo.set(`uretim-harcama:${ay}`, "149.5");
  await yazi(p, MURAT, "fal hazır");
  const kart = p.g.filter((x) => /Maliyet önizlemesi/.test((x.govde || {}).text || "")).at(-1);
  assert.match(kart.govde.text, /⛔/);
  assert.equal(kart.govde.reply_markup, undefined);
  const r = ortam();
  r.depo.set(`uretim-harcama:${ay}`, "119.5");
  await yazi(r, MURAT, "fal hazır");
  await bas(r, MURAT, sonDugmeler(r).find((d) => d.text === "✅ Onayla").callback_data);
  assert.ok(r.g.some((x) => /%80'e ulaştı/.test((x.govde || {}).text || "")));
});

test("yüz adayları → seçim; askı fotoğrafları → kare önizlemesi; kare onayı → video önizlemesi", async () => {
  const o = ortam();
  await yazi(o, MURAT, "fal hazır");
  await bas(o, MURAT, sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data);
  await pelinCron(o.env, Math.floor(Date.now() / 1000));
  assert.equal(o.g.filter((x) => x.metod === "sendMediaGroup").length, 3);
  for (const m of ["beyaz", "siyahi", "dolgun"]) await bas(o, MURAT, `py:${m}:1`);
  assert.match(o.g.filter((x) => x.metod === "sendMessage").at(-1).govde.text, /3577 ve 3592 askı/);
  const foto = (kimden, caption) => guncelleme({ message: { message_id: 2, date: 1, chat: { id: kimden, type: "private" }, from: { id: kimden }, photo: [{ file_id: "k" }, { file_id: `b${caption}` }], caption } }, o.env);
  await foto(MURAT, "3592 askı");
  await foto(HEMRA, "3577 askı");
  const kart = o.g.filter((x) => /Maliyet önizlemesi — başlangıç/.test((x.govde || {}).text || "")).at(-1);
  assert.ok(kart);
  await bas(o, MURAT, sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data);
  const edit = o.falIstek.filter((f) => f.uc === "fal-ai/nano-banana-pro/edit");
  assert.equal(edit.length, 2);
  assert.deepEqual(edit.map((e) => e.govde.image_urls[0]).sort(), ["https://img/1b.jpg", "https://img/2b.jpg"]); // 3577 beyaz, 3592 siyahi (2. adaylar)
  assert.match(edit[0].govde.image_urls[1], /^https:\/\/pelin\.test\/dosya\/[a-f0-9]{32}$/);
  await pelinCron(o.env, Math.floor(Date.now() / 1000));
  await bas(o, MURAT, "pf:3592");
  await bas(o, MURAT, "pf:3577");
  assert.ok(o.g.some((x) => /Maliyet önizlemesi — video denemesi/.test((x.govde || {}).text || "")));
});

test("video denemesi: aynı kareden 3 araç × 2 model; kareler + puan; kör test Murat'a ve Hemra'ya; oylar tamamlanınca sonuç", async () => {
  const o = ortam();
  const simdi = () => Math.floor(Date.now() / 1000);
  await yazi(o, MURAT, "fal hazır");
  await bas(o, MURAT, sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data);
  await pelinCron(o.env, simdi());
  for (const m of ["beyaz", "siyahi", "dolgun"]) await bas(o, MURAT, `py:${m}:0`);
  for (const [k, kim] of [["3592", MURAT], ["3577", HEMRA]]) await guncelleme({ message: { message_id: 2, date: 1, chat: { id: kim, type: "private" }, from: { id: kim }, photo: [{ file_id: `a${k}` }], caption: `${k} askı` } }, o.env);
  await bas(o, MURAT, sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data);
  await pelinCron(o.env, simdi());
  await bas(o, MURAT, "pf:3592");
  await bas(o, MURAT, "pf:3577");
  for (const uc of ["fal-ai/veo3.1/lite/image-to-video", "fal-ai/kling-video/v3/pro/image-to-video", "bytedance/seedance-2.0/image-to-video"]) o.falSonuc[uc] = (n) => ({ video: { url: `https://vid/${n}.mp4` } });
  await bas(o, MURAT, sonDugmeler(o).find((d) => d.text === "✅ Onayla").callback_data);
  const videolar = o.falIstek.filter((f) => /image-to-video$/.test(f.uc));
  assert.equal(videolar.length, 6);
  const kareler = new Set(videolar.map((v) => v.govde.image_url || v.govde.start_image_url));
  assert.equal(kareler.size, 2); // her model için 3 araç aynı başlangıç karesi
  await pelinCron(o.env, simdi()); // videolar biter → kare çıkarma işleri (gerçek video dahil)
  const kareIsleri = o.falIstek.filter((f) => f.uc === "fal-ai/ffmpeg-api/extract-frame");
  assert.equal(kareIsleri.length, 24);
  assert.ok(kareIsleri.some((k) => /volonte-asistan\.volonte\.workers\.dev\/kanal-video\/[a-f0-9]{32}$/.test(k.govde.video_url)));
  const puan = (n) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "text", text: JSON.stringify({ videolar: [1, 2, 3, 4].slice(0, n).map((no) => ({ no, renk: 9, desen: 8, kesim: 9, not: "iyi" })) }) }] });
  o.claude.cevaplar = [puan(4), puan(4)];
  for (let i = 0; i < 5; i++) await pelinCron(o.env, simdi());
  const korVideo = o.g.filter((x) => x.metod === "sendVideo");
  assert.equal(korVideo.length, 16); // 2 kişi × 2 model × 4 (3 araç + gerçek)
  assert.ok(korVideo.every((v) => /^\d{4} · [A-D] · renk 9\/10 · desen 8\/10 · kesim 9\/10$/.test(v.govde.caption)));
  assert.ok(!JSON.stringify(korVideo).match(/Veo|Kling|Seedance|\$/)); // kör: araç adı ve maliyet yok
  for (const kim of [MURAT, HEMRA]) for (const kod of ["3592", "3577"]) await bas(o, kim, `pv:${kod}:A`);
  const sonuc = o.g.filter((x) => /KÖR TEST SONUCU/.test((x.govde || {}).text || ""));
  assert.equal(sonuc.length, 2);
  assert.match(sonuc[0].govde.text, /A = .* · 🏆 Murat \+ Hemra/);
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
