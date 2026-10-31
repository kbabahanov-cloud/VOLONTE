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
