// Çalıştırma: node --test test-pelin.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { StokDO } from "./stok.js";
import { guncelleme, pelinCron, videoGirdisi, buAyHarcanan, fotoYazisi, fotoSirala, yeniVideoIstemi, SAHNE_VARSAYILAN } from "./pelin.js";

const MURAT = 9000000001;
const HEMRA = 9000000002;
const ay = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 7);

function ortam({ fal = true } = {}) {
  // Test düzeni: model kaydı ("pelinboy:") yazılırken anlama kartı cevabı yoksa varsayılan eklenir (anlama kartını ayrı test sınar;
  // "anlamaYok: true" ile kapatılır). Gerçek kodda bu yok: Patron kartı onaylamadan üretim başlamaz.
  const ANLAMA_VARSAYILAN = Object.fromEntries(["genel", "kırmızı", "koyu bordo", "beyaz"].map((r) => [r, { ust: "opak", alt: "opak", iclik: "yok", onay: 1 }]));
  const depo = new (class extends Map { set(k, v) { if (String(k).startsWith("pelinboy:")) { try { const j = JSON.parse(v); if (!j.anlamaYok) v = JSON.stringify({ ...j, ...(j.anlama ? {} : { anlama: ANLAMA_VARSAYILAN }), ...(j.marka || j.markaYok ? {} : { marka: "VOLONTE" }) }); } catch { /* düz */ } } return super.set(k, v); } })();
  const g = []; // Telegram çağrıları
  const falIstek = [];
  const hfIstek = []; // Higgsfield (sahte): POST → kuyruk, durum → tamamlandı + video
  const claude = [];
  let id = 100;
  const falSonuc = {}; // uc → sonuç
  const site = []; // veri/urunler.json
  const yaziCevap = { kod: "3557", fn: null }; // son kare yazısı (sahte okuma)
  const noraCevap = { senaryo_tr: "0-2 sn: kameraya doğru iki yavaş adım. 2-4 sn: hafif durur. 4-6 sn: omuz üstünden bakar.", hareket_en: "She takes two slow steps toward the camera, pauses softly and glances over her shoulder." };
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
    if (u.startsWith("https://api.higgsfield.ai/requests/")) { const rid = u.split("/")[4]; return Response.json({ status: "completed", request_id: rid, video: { url: `https://hf/${rid}.mp4` } }); }
    if (u.startsWith("https://api.higgsfield.ai/")) { const yol = u.slice("https://api.higgsfield.ai/".length); hfIstek.push({ yol, govde }); const rid = `h${hfIstek.length}`; return Response.json({ status: "queued", request_id: rid, status_url: `https://api.higgsfield.ai/requests/${rid}/status` }); }
    if (u.startsWith("https://fal/sonuc/")) {
      const n = u.split("/")[4].split("?")[0];
      const uc = decodeURIComponent(u.split("uc=")[1]);
      return Response.json(falSonuc[uc] ? falSonuc[uc](n) : { images: [{ url: `https://img/${n}a.jpg` }, { url: `https://img/${n}b.jpg` }] });
    }
    if (u.includes("raw.githubusercontent.com")) return Response.json(site);
    if (u.startsWith("https://api.anthropic.com")) {
      claude.push(govde);
      const sema = govde.output_config && govde.output_config.format && govde.output_config.format.schema;
      if (sema && (sema.required || []).includes("hareket_en")) return Response.json({ id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(noraCevap) }], usage: { input_tokens: 10, output_tokens: 5 } });
      if (sema && (sema.required || []).includes("kod_okunan")) return Response.json({ id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(yaziCevap.fn ? yaziCevap.fn() : { volonte_var: true, kod_okunan: yaziCevap.kod, baska_yazi_var: false, fiyat_var: false }) }], usage: { input_tokens: 10, output_tokens: 5 } });
      const c = claude.cevaplar && claude.cevaplar.shift();
      return Response.json(c || { id: "m", type: "message", role: "assistant", model: govde.model, stop_reason: "end_turn", content: [{ type: "text", text: "Merhaba!" }], usage: { input_tokens: 100, output_tokens: 50 } });
    }
    g.push({ metod: u.split("/").pop(), govde });
    return Response.json({ ok: true, result: { message_id: id++, url: "", file_path: "x.jpg" } });
  };
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...p) {
    if (!p.length && !/^\s*SELECT/i.test(q)) { db.exec(q); return { toArray: () => [] }; }
    const st = db.prepare(q);
    const satir = /^\s*SELECT/i.test(q) ? st.all(...p).map((x) => ({ ...x })) : (st.run(...p), []);
    return { toArray: () => satir };
  } };
  const stok = new StokDO({ storage: { sql } });
  const env = {
    STOK: { idFromName: () => "stok", get: () => ({ fetch: (url, init) => stok.fetch(new Request(url, init)) }) },
    BOT_TOKEN: "t", ANTHROPIC_API_KEY: "k", SELF_URL: "https://pelin.test", WEBHOOK_SECRET: "s", ALLOWED_IDS: `${MURAT},9000000003`, MURAT_ID: String(MURAT), HEMRA_ID: String(HEMRA),
    ...(fal ? { FAL_KEY: "fal-anahtar", HF_API_KEY: "kid:ksecret" } : {}),
    KAYIT: {
      async get(k, tur) { const v = depo.get(k); return v == null ? null : tur === "json" ? JSON.parse(v) : v; },
      async put(k, v) { depo.set(k, v); },
      async delete(k) { depo.delete(k); },
    },
  };
  for (const k of ["3557", "3601", "3627", "3630"]) depo.set(`pelinboy:${k}`, JSON.stringify({ boy: "midi" })); // testlerde boy kayıtlı (boy sorusu ayrı testte)
  return { env, depo, g, falIstek, hfIstek, claude, falSonuc, site, yaziCevap };
}
// Teslim kuyruğu (StokDO "pelinKanal"; okumak tüketmez)
const teslim = async (o) => JSON.parse((await (await o.env.STOK.get().fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "kuyruk:pelinKanal" }) })).json()).v || "[]");
const yazi = (o, kimden, text) => guncelleme({ message: { message_id: 1, date: 1, chat: { id: kimden, type: "private" }, from: { id: kimden, first_name: kimden === MURAT ? "Murat" : "Hemra" }, text } }, o.env);
const bas = (o, kimden, data) => guncelleme({ callback_query: { id: "c", from: { id: kimden, first_name: "X" }, data, message: { chat: { id: kimden }, message_id: 9, text: "kart" } } }, o.env);
// Üretim kartı (4 Kasım): araç + şablon seçilmeden ✅ Onayla çalışmaz
// Üretim fotoğrafları (fotoğraf seti açıları hariç: "now photographed" / askıda detay)
const SET_ISTEM = /now photographed from|hanging on an elegant wooden hanger/;
const uretimEdit = (o) => o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit" && !SET_ISTEM.test(x.govde.prompt || ""));
const kartId = (kart) => kart.reply_markup.inline_keyboard.flat().find((d) => /^pu:o:/.test(d.callback_data)).callback_data.split(":")[2];
async function onayla(o, id, arac = "hf_kling4", sablon = "sehir") {
  if (arac) await bas(o, MURAT, `pc:a:${id}:${arac}`);
  if (sablon) await bas(o, MURAT, `pc:s:${id}:${sablon}`);
  return bas(o, MURAT, `pu:o:${id}`);
}
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
// Patron Nora senaryosunu onaylar (testlerde otomatik; noraOto=false ile kapatılır)
const noraOnayla = async (o) => {
  o.noraBasilan = o.noraBasilan || new Set();
  for (const x of o.g) for (const d of ((x.govde && x.govde.reply_markup && x.govde.reply_markup.inline_keyboard) || []).flat()) {
    if (/^pn:o:/.test(d.callback_data) && !o.noraBasilan.has(d.callback_data)) { o.noraBasilan.add(d.callback_data); await guncelleme({ callback_query: { id: "c", from: { id: MURAT, first_name: "M" }, data: d.callback_data, message: { chat: { id: MURAT }, message_id: 9, text: "kart" } } }, o.env); }
  }
};
// Videodan önce fotoğraf onayı (4 Kasım): testlerde Patron fotoğrafı onaylar (o.fotoOto = false ile kapatılır)
const fotoOnayla = async (o) => {
  o.fotoBasilan = o.fotoBasilan || new Set();
  for (const x of o.g) for (const d of ((x.govde && x.govde.reply_markup && x.govde.reply_markup.inline_keyboard) || []).flat()) {
    if (/^pu:f:/.test(d.callback_data) && !o.fotoBasilan.has(d.callback_data)) { o.fotoBasilan.add(d.callback_data); await guncelleme({ callback_query: { id: "c", from: { id: MURAT, first_name: "M" }, data: d.callback_data, message: { chat: { id: MURAT }, message_id: 9, text: "kart" } } }, o.env); }
  }
};
const cronlar = async (o, n) => { for (let i = 0; i < n; i++) { await pelinCron(o.env, Math.floor(Date.now() / 1000)); if (o.noraOto !== false) await noraOnayla(o); if (o.fotoOto !== false) await fotoOnayla(o); } };

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
  await onayla(o, id);
  o.claude.cevaplar = [claudeJsonCevap(GECMEDI), claudeJsonCevap(GECTI), claudeJsonCevap(GECTI)];
  await cronlar(o, 14);
  const foto = uretimEdit(o);
  assert.equal(foto.length, 2); // ilk deneme renk farkı → otomatik yeniden
  assert.deepEqual(foto[0].govde.image_urls, ["https://pelin.test/dosya/" + "a".repeat(32), "https://pelin.test/dosya/" + "b".repeat(32)]);
  assert.match(foto[0].govde.prompt, /black and gold studio/);
  assert.equal(o.hfIstek.filter((x) => x.yol === "kling-video/v4.0/image-to-video").length, 1); // kartta seçilen araç (Higgsfield)
  assert.equal(o.falIstek.filter((x) => /image-to-video/.test(x.uc)).length, 0);
  assert.equal(o.falIstek.filter((x) => x.uc === "fal-ai/ffmpeg-api/extract-frame").length, 3);
  const on = o.g.find((x) => /ÖNİZLEME — 3557/.test(x.govde.text || ""));
  assert.ok(on, "önizleme gelmeli");
  assert.deepEqual(on.govde.reply_markup.inline_keyboard[0].map((d) => d.text), ["✅ Onayla", "🔄 Yeniden üret", "❌ İptal"]);
  assert.ok(o.g.some((x) => x.metod === "sendVideo" && x.govde.chat_id === String(MURAT)));
  assert.ok(!o.g.some((x) => /\$|fiyat|stok/i.test(String(x.govde.caption || ""))));
  const isId = on.govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await bas(o, HEMRA, `pu:a:${isId}`);
  assert.equal((await teslim(o)).length, 0);
  await bas(o, MURAT, `pu:a:${isId}`);
  assert.deepEqual((await teslim(o)).map((x) => [x.kod, x.v, x.deneme]), [["3557", 2, false]]);
});

test("üretim: 2 denemede kontrolden geçmezse Patron'a ⚠️ (sorunlarla); maliyet testi bitince model başı maliyet raporu", async () => {
  const o = uretimOrtami();
  secimKur(o);
  o.depo.set("pelin:urunfoto:3557", JSON.stringify(["b".repeat(32)]));
  await yazi(o, MURAT, "/maliyettesti 3557");
  assert.match(o.g.at(-1).govde.text, /MALİYET TESTİ — 1 model/);
  const id = o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2];
  await onayla(o, id);
  o.claude.cevaplar = [claudeJsonCevap(GECMEDI), claudeJsonCevap(GECMEDI)];
  await cronlar(o, 6);
  assert.equal(uretimEdit(o).length, 2);
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
  const d = uretimEdit(o);
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
    await onayla(o, o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2], "hf_kling4", "sehir");
    o.claude.cevaplar = Array.from({ length: 4 }, () => claudeJsonCevap(GECTI));
    await cronlar(o, 12);
  };
  assert.match(kart.text, /Yüz: 3557 büyük seri \(3 numaralı dolgun kız\), 3601 küçük seri \(2 numaralı siyahi kız\)/);
  assert.match(kart.text, /Ortam: katalog fotoğrafı Siyah Altın Lüks · video: seçtiğiniz şablon/);
  assert.deepEqual(kart.reply_markup.inline_keyboard[2].map((d) => d.text), ["Siyah-Altın", "Şehir", "Parıltı", "Romantik"]);
  await bas(o, MURAT, `pc:s:${kartId(kart)}:sehir`); // Şehir şablonu → ayrı video karesi, fiyat kartta
  const duz = o.g.filter((x) => x.metod === "editMessageText").at(-1).govde;
  assert.match(duz.text, /🎨 Şablon: Şehir/);
  await bas(o, MURAT, `pc:a:${kartId(kart)}:hf_kling4`);
  assert.match(o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text, /Video başlangıç karesi \(Live Your Life Şehir\)/);
  await bas(o, MURAT, `pu:i:${kartId(kart)}`);
  await yazi(o, MURAT, "/uret 3557");
  await onayla(o, o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2], "hf_kling4", "sehir");
  o.claude.cevaplar = Array.from({ length: 4 }, () => claudeJsonCevap(GECTI));
  await cronlar(o, 12);
  await ikinci();
  const edit = uretimEdit(o);
  const b = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3557/1.jpg"));
  assert.equal(b.length, 2); // katalog + video karesi
  assert.equal(b[0].govde.image_urls[0], "https://pelin.test/dosya/" + "c".repeat(32)); // büyük seri yüzü
  assert.match(b[0].govde.prompt, /black gold studio/);
  assert.match(b[1].govde.prompt, /city street golden hour/);
  const k = edit.filter((x) => x.govde.image_urls.includes("https://www.wearvolonte.com/galeri/3601/1.jpg"));
  assert.equal(k[0].govde.image_urls[0], "https://pelin.test/dosya/" + "a".repeat(32)); // küçük seri yüzü
  assert.ok(!edit.some((x) => /80s neon/.test(x.govde.prompt)));
  const video = o.hfIstek.filter((x) => x.yol === "kling-video/v4.0/image-to-video");
  assert.equal(video.length, 2);
  assert.match(video[0].govde.prompt, /Setting and atmosphere: city street golden hour\. Motion \(approved scenario\): She takes two slow steps toward the camera[\s\S]*no spinning, no twirling, no fast turns, no orbiting camera[\s\S]*close-up of the neckline\/collar and stitching[\s\S]*"VOLONTE" and directly below it the model code "3557"[\s\S]*no price/);
  assert.ok(!/orbits around her|turns to face the camera/.test(video[0].govde.prompt));
  assert.match(video[0].govde.prompt, /Avoid: .*spinning, twirling, fast turn, orbiting camera/); // Higgsfield'de negatif alan yok → istemde
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

test("fotoğraf yazısı: kod, rol (ön/arka/detay), etiket (manken/askı/detay), renk", () => {
  assert.deepEqual(fotoYazisi("3627 Kırmızı ÖN"), { kod: "3627", rol: "on", renk: "kırmızı", etiket: null });
  assert.deepEqual(fotoYazisi("3627 arka"), { kod: "3627", rol: "arka", renk: null, etiket: null });
  assert.deepEqual(fotoYazisi("3627 yaka detayı beyaz"), { kod: "3627", rol: "detay", renk: "beyaz", etiket: "detay" });
  assert.deepEqual(fotoYazisi("3627 manken"), { kod: "3627", rol: "on", renk: null, etiket: "manken" });
  assert.deepEqual(fotoYazisi("3627 manken arka"), { kod: "3627", rol: "arka", renk: null, etiket: "manken" });
  assert.deepEqual(fotoYazisi("3627 askı"), { kod: "3627", rol: "on", renk: null, etiket: "aski" });
  assert.deepEqual(fotoYazisi("/3627 detay"), { kod: "3627", rol: "detay", renk: null, etiket: "detay" });
  assert.deepEqual(fotoSirala([{ anahtar: "x", rol: "detay" }, { anahtar: "y", rol: "arka" }, "z"]).map((x) => [x.anahtar, x.rol]), [["z", "on"], ["y", "arka"], ["x", "detay"]]);
});

test("Patron'un ürün fotoğrafları: albüm (yazı ilk fotoğrafta; sıra karışık gelse de) 1. ön 2. arka, renk; 'dosya olarak' desteklenir; HEIC kabul edilir (JPEG'e çevrilir); eski deneme akışına düşmez", async () => {
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
  await fotoMesaj(o, { caption: "3630 askı", mid: 20, dosya: true, tur: "image/heic" });
  assert.match(o.g.at(-1).govde.text, /✅ 3630 ürün fotoğrafı alındı\. Kayıtlı: askı ön\. \(iPhone HEIC dosyası → otomatik JPEG'e çevrilir\)/);
  assert.equal(JSON.parse(o.depo.get("pelin:urunfoto:3630"))[0].etiket, "aski");
  await fotoMesaj(o, { caption: "güzel", mid: 21, kimden: HEMRA });
  assert.match(o.g.at(-1).govde.text, /yazısına model kodunu ve etiketi yazın/);
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
  assert.match(kart.text, /Sahne: kameraya doğru İLERİ birkaç yavaş adım · hafif duruş · omuz üstünden bakış · kumaş doğal dalgalanır · hızlı dönüş, geri yürüme ve kamera dönüşü YOK · yaka\/dikiş yakın kare · son karede küçük marka \+ kod \(fiyat yok\) · kapak fotoğrafı videodan\n📝 Senaryo: fotoğraf hazır olunca Nora yazar, onayınıza gelir/);
  await onayla(o, kart.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2], "hf_kling4", "sehir");
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 6 }, () => claudeJsonCevap(GECTI));
  await cronlar(o, 16);
  const edit = uretimEdit(o);
  assert.deepEqual(edit[0].govde.image_urls, ["https://pelin.test/dosya/" + "a".repeat(32), `https://pelin.test/dosya/${on}`, `https://pelin.test/dosya/${arka}`]); // site değil, Patron'un ön + arka
  assert.match(edit[0].govde.prompt, /image 2 = FRONT view, image 3 = BACK view[\s\S]*red \(kırmızı\) color variant ONLY/);
  assert.match(edit[1].govde.prompt, /city street golden hour[\s\S]*red \(kırmızı\) color variant ONLY/);
  const kontrol = o.claude.filter((x) => JSON.stringify(x.messages).includes("İSTENEN RENK: kırmızı"));
  assert.ok(kontrol.length >= 3);
  const video = o.hfIstek.filter((x) => x.yol === "kling-video/v4.0/image-to-video");
  assert.equal(video.length, 1); // 4 Kasım: video kendi kendine yeniden üretilmez (ayrı testte: yanlış kod → Patron'a sorar)
  assert.match(video[0].govde.prompt, /\(red only\)[\s\S]*no orbiting camera[\s\S]*"VOLONTE"[\s\S]*"3627"/);
  assert.ok(video[0].govde.prompt.length <= 1900, `video istemi kısa olmalı: ${video[0].govde.prompt.length}`);
  const is = JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3627-"))[1]);
  assert.ok(is.gecmis.some(([, t]) => /video 1: geçti/.test(t)));
  assert.ok(o.g.some((x) => x.metod === "sendPhoto" && /🖼 3627 kapak \(videodan\)/.test(x.govde.caption || "")));
  const on2 = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.match(on2.govde.text, /son kare yazısı ✅[\s\S]*Ürün fotoğrafı: sizin gönderdiğiniz · renk kırmızı/);
  const dugmeler = on2.govde.reply_markup.inline_keyboard.flat();
  assert.deepEqual(dugmeler.map((x) => x.text), ["✅ Onayla", "🔄 Yeniden üret", "❌ İptal", "💾 Bu ayarları şablon olarak kaydet", "🎬 Seedance 2.5 1080p ile de dene (6,82 $)", "🎬 Kling 3.0 4K ile de dene (1,26 $)"]);
  await bas(o, MURAT, dugmeler[3].callback_data);
  const sb = JSON.parse(o.depo.get("pelin:sablonlar"))["3627"];
  assert.equal(sb.katalogOrtamId, "2");
  assert.equal(sb.videoOrtamId, "3");
  assert.equal(sb.sahne.sonYazi, true);
  assert.match(o.g.at(-1).govde.text, /"3627 şablonu" kaydedildi/);
  await bas(o, MURAT, dugmeler[0].callback_data);
  assert.equal((await teslim(o))[0].kapak, is.kapak || JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3627-"))[1]).kapak);
  // şablonla yeni model
  await yazi(o, MURAT, "/uret 3630 şablon:3627");
  assert.match(o.g.at(-1).govde.text, /kayıtlı şablon: 3627/);
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
  const soru = o.g.at(-1).govde; // 4 Kasım: boy artık ANLAMA KARTINDA (Pelin tahmini işaretli)
  assert.match(soru.text, /🔎 YENİ MODEL ANLAMA — 3700 · koyu bordo[\s\S]*Pelin'in tahmini \(☑️ işaretli\): Etek bilekte bitiyor\.[\s\S]*Boy: bilek/);
  assert.deepEqual(soru.reply_markup.inline_keyboard.slice(4, 6).flat().map((x) => x.text), ["Mini", "Diz", "Midi", "☑️ Bilek", "Bilek altı", "Yere 2-3 cm", "Maksi"]);
  assert.equal(o.falIstek.length, 0);
  await bas(o, MURAT, soru.reply_markup.inline_keyboard.flat().find((d) => /^pa:o:/.test(d.callback_data)).callback_data);
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
  // yeni kart gelince eski kart geçersiz (düğmeleri "⌛ Geçersiz"; basılırsa başlamaz)
  assert.ok(o.g.some((x) => x.metod === "editMessageReplyMarkup" && /Geçersiz — yeni kart geldi/.test(JSON.stringify(x.govde.reply_markup))));
  await bas(o, MURAT, `pc:a:${kartId(kart)}:hf_kling4`);
  assert.match(o.g.at(-1).govde.text, /geçersiz \(yeni kart geldi\)/);
  await yazi(o, MURAT, "/uret 3700 koyu bordo");
  // üretim: istemde boy + kadraj + referans görseli (son), kontrol boyu denetler; boy farklıysa otomatik yeniden
  await onayla(o, kartId(o.g.at(-1).govde), "hf_kling4", "sehir");
  o.yaziCevap.kod = "3700";
  o.claude.cevaplar = [claudeJsonCevap({ ...GECTI, boy_dogru: false, kadraj_tam: true, sorunlar: ["boy farklı: maksi, yerde sürünüyor"] }), ...Array.from({ length: 4 }, () => claudeJsonCevap({ ...GECTI, boy_dogru: true, kadraj_tam: true }))];
  await cronlar(o, 16);
  const edit = uretimEdit(o);
  assert.equal(edit[0].govde.image_urls.length, 3); // yüz + site fotoğrafı + boy referansı (son)
  assert.equal(edit[0].govde.image_urls[2], `https://pelin.test/dosya/${b.referans[0].anahtar}`);
  assert.match(edit[0].govde.prompt, /dark burgundy \(koyu bordo\) color variant ONLY[\s\S]*LENGTH[\s\S]*ankle length: the hem ends exactly at the ankles; the shoes and feet are fully visible and the hem does NOT touch the floor[\s\S]*plus-size[\s\S]*FRAMING: full body from head to toe — never crop the head or the shoes[\s\S]*SHOES: simple, elegant[\s\S]*LAST image is a LENGTH\/FRAMING reference only/);
  const kontrol = o.claude.find((x) => JSON.stringify(x.messages).includes("İSTENEN BOY: bilek"));
  assert.ok(kontrol && kontrol.output_config.format.schema.required.includes("boy_buyuk_fark"));
  const is = JSON.parse([...o.depo.entries()].find(([k]) => k.startsWith("pelin:is:3700-"))[1]);
  assert.ok(is.gecmis.some(([, t]) => /foto 1: geçmedi \(.*boy farklı/.test(t)));
  assert.ok(edit.length >= 3); // boy farkı → katalog fotoğrafı yeniden üretildi
  const video = o.hfIstek.find((x) => x.yol === "kling-video/v4.0/image-to-video");
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
  await onayla(o, o.g.at(-1).govde.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]);
  const buyuk = K2({ renk_buyuk_fark: true, puan: 5, buyuk_sorunlar: ["parlak kırmızı, ürün koyu bordo"], kucuk_notlar: ["payet daha seyrek"] });
  o.claude.cevaplar = [buyuk, buyuk];
  await cronlar(o, 5);
  const kart = o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /Büyük farklar:\n• Pelin: parlak kırmızı, ürün koyu bordo[\s\S]*📝 Küçük farklar \(üretimi durdurmadı\):\n• Pelin: payet daha seyrek[\s\S]*🎯 Kontrol puanı \(Pelin\/ChatGPT, 10 üzerinden\): foto 5[\s\S]*✅ Yine de onayla: bu fotoğrafla devam ederim \(video karesi \+ video\)/);
  assert.equal(kart.reply_markup.inline_keyboard[0][0].text, "✅ Yine de onayla");
  const edit = uretimEdit(o);
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
  // 4 Kasım: marka kilidi — eski kural (VOLONTE yazısı, marka alanı yok) ve model BLACK ROSE → yayına GİTMEZ
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilekalti", marka: "BLACKROSE" }));
  await bas(o, MURAT, "pu:a:3627-x");
  assert.match(o.g.at(-1).govde.text, /⛔ Bu videonun son karesinde VOLONTE \(eski kural\) yazıyor; 3627 = BLACK ROSE\. Yanlış marka — yayına GİTMEZ/);
  assert.equal((await teslim(o)).length, 0);
  const x = JSON.parse(o.depo.get("pelin:is:3627-x")); x.marka = "BLACKROSE"; o.depo.set("pelin:is:3627-x", JSON.stringify(x));
  await bas(o, MURAT, "pu:a:3627-x");
  assert.equal(JSON.parse(o.depo.get("pelin:is:3627-x")).durum, "onaylandi");
  assert.equal((await teslim(o))[0].kod, "3627");
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
test("lüks: varsayılan araç YOK, kartta fiyatlı araç düğmeleri; premium kartında aksesuar + lüks mekân; istemde sinematik ışık, VOLONTE kadını, poz (kesim daraltılmaz); önizlemede başka araçla karşılaştırma", async () => {
  const o = uretimOrtami();
  o.falSonuc["kling/v4/image-to-video"] = (n) => ({ video: { url: `https://vid/k${n}.mp4` } });
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.claude.cevaplar = [claudeJsonCevap({ aksesuar_tr: "altın küpe ve ince altın kolye, nude çanta", aksesuar_en: "gold earrings, a delicate gold necklace and a nude clutch", mekan_tr: "5 yıldızlı otel lobisi", mekan_en: "a grand five-star hotel lobby with marble floors and warm chandeliers" })];
  await yazi(o, MURAT, "/uret büyük:3627 koyu bordo premium");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /· PREMIUM\n/);
  assert.match(kart.text, /🎬 Video aracı: — SEÇİN[\s\S]*🎨 Şablon: — SEÇİN[\s\S]*Fiyat: araç seçilince yazılır/);
  assert.deepEqual(kart.reply_markup.inline_keyboard.slice(0, 2).flat().map((d) => d.text), ["Seedance 2.5 · 7,69 $", "Kling 3.0 4K · 2,12 $", "Kling 4.0 · 2,06 $", "Hepsini dene · 10,30 $"]);
  assert.match(kart.text, /Aksesuar \(3627\): altın küpe ve ince altın kolye, nude çanta\nPremium mekân \(3627\): 5 yıldızlı otel lobisi/);
  await bas(o, MURAT, `pu:o:${kartId(kart)}`); // seçim yok → başlamaz
  assert.match(o.g.at(-1).govde.text, /Önce video aracını seçin/);
  assert.equal(o.falIstek.length, 0);
  assert.match(kart.text, /poz ile bel vurgusu \(kesim daraltılmaz\)/);
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).stil["koyu bordo"].aksesuarTr, "altın küpe ve ince altın kolye, nude çanta"); // bir kez seçilir, saklanır
  await bas(o, MURAT, `pc:a:${kartId(kart)}:hf_kling3`);
  const duz = o.g.filter((x) => x.metod === "editMessageText").at(-1).govde;
  assert.match(duz.text, /🎬 Video aracı: Kling 3\.0 4K \(Higgsfield\)[\s\S]*• Video 6 sn — Kling 3\.0 4K \(Higgsfield\) \+ kontrol: 1,33 \$[\s\S]*TOPLAM ~2,12 \$/);
  assert.equal(duz.reply_markup.inline_keyboard[0][1].text, "☑️ Kling 3.0 4K · 2,12 $");
  assert.match((JSON.parse(o.depo.get("pelin:sonKartlar")) || [])[0].metin, /Kling 3\.0 4K/); // sohbet son kartın gerçek metnini görür
  await onayla(o, kartId(kart), null, "siyahaltin");
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 4 }, () => K2());
  await cronlar(o, 12);
  const edit = uretimEdit(o);
  assert.match(edit[0].govde.prompt, /black gold studio[\s\S]*VOLONTE WOMAN: successful, wealthy and self-confident[\s\S]*NEVER make the garment tighter[\s\S]*LIGHT: cinematic[\s\S]*ACCESSORIES: gold earrings/);
  assert.match(edit[1].govde.prompt, /grand five-star hotel lobby[\s\S]*people in the background softly blurred/); // premium video karesi lüks mekânda
  const v = o.hfIstek.find((x) => x.yol === "kling-video/v3.0/4k/image-to-video");
  assert.equal(v.govde.sound, "off");
  assert.match(v.govde.prompt, /Gentle natural movement of the skirt and her hair/);
  assert.match(v.govde.prompt, /artistic close-ups of the lace, sequins/);
  const on = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.match(on.govde.text, /Video aracı: Kling 3\.0 4K \(Higgsfield\) · şablon: Siyah-Altın · aksesuar: altın küpe[\s\S]*PREMIUM/);
  const k4 = on.govde.reply_markup.inline_keyboard.flat().find((x) => /Kling 4\.0/.test(x.text));
  await bas(o, MURAT, k4.callback_data);
  assert.match(o.g.at(-1).govde.text, /aynı kareyle Kling 4\.0 1080p \(Higgsfield\) videosu üretiliyor \(~1,20 \$\)/);
  o.claude.cevaplar = Array.from({ length: 2 }, () => K2());
  await cronlar(o, 6);
  const kv = o.hfIstek.find((x) => x.yol === "kling-video/v4.0/image-to-video");
  assert.ok(kv && kv.govde.image_url && kv.govde.resolution === "1080p" && kv.govde.duration === 6);
  assert.equal(uretimEdit(o).length, edit.length); // karşılaştırmada yeni fotoğraf üretilmez
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

// ---------- Boy sorunu (3 Kasım gece): kural istemin başında + sistem talimatı + yasaklar; şablon kadrajı ezmez; ChatGPT boyu tek başına durduramaz ----------
test("boy güçlendirme: istemin başında LENGTH RULE + FORBIDDEN; system_prompt; referans etiketli; Veo negatifine yasak; örnek şablonun yakın planı/aksesuarı alınmaz; ChatGPT-sadece-boy → not", async () => {
  const o = uretimOrtami();
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilek", referans: [{ anahtar: "r".repeat(32), tur: "foto" }] }));
  o.depo.set("pelin:sablonlar", JSON.stringify({ romantik: { ad: "romantik", kaynak: "ornek", kamera: "Locked-off camera; tight medium close-up framed from head to chest", isik: "soft diffused beauty light", hiz: "slow calm tempo", poz: "holds an envelope with a gloved hand, touches a wide hat brim", ortam_havasi: "sage green seamless backdrop" } }));
  o.depo.set("venom:pelinKomut", JSON.stringify({ metin: "/uret büyük:3627 koyu bordo şablon:romantik" }));
  await cronlar(o, 1); // kart Patron'a (Patron onaylar)
  const kart = o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /3627 büyük seri[\s\S]*Renk: 3627 sadece koyu bordo[\s\S]*Boy: 3627 bilek[\s\S]*örnek videonun ortamı \(romantik\)/);
  assert.ok(!o.depo.has("venom:pelinKomut"));
  assert.equal(o.falIstek.length, 0);
  await onayla(o, kartId(kart), "hf_kling4", null); // kayıtlı örnek şablon (romantik) → şablon düğmesi zorunlu değil
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 4 }, () => K2());
  await cronlar(o, 12);
  const edit = uretimEdit(o);
  for (const e of edit.slice(0, 2)) {
    assert.match(e.govde.prompt, /^LENGTH RULE \(HIGHEST PRIORITY, before anything else\): ankle length[\s\S]*Both shoes and both ankles are completely visible[\s\S]*FORBIDDEN: floor-length dress, maxi dress, long skirt touching or pooling on the floor, hem covering the shoes[\s\S]*camera at hip height[\s\S]*The LAST image shows the correct length/);
    assert.match(e.govde.system_prompt, /Hard rules that override everything else[\s\S]*never produce: floor-length dress/);
    assert.equal(e.govde.image_urls.at(-1), `https://pelin.test/dosya/${"r".repeat(32)}`);
  }
  const v = o.hfIstek.find((x) => x.yol === "kling-video/v4.0/image-to-video");
  assert.match(v.govde.prompt, /^LENGTH RULE \(highest priority\): ankle length/);
  assert.match(v.govde.prompt, /Avoid: floor-length dress[\s\S]*hem covering the shoes/);
  assert.match(v.govde.prompt, /use ONLY its light, color grade, mood and tempo — NOT its framing, props or accessories such as hats, gloves/);
  assert.ok(!/tight medium close-up|gloved hand|holds an envelope/.test(v.govde.prompt));
  // ChatGPT sadece boy yüzünden "geçmedi" derse, Pelin boyu doğru bulduysa üretim durmaz (not olur)
  const { kaliteKontrol } = await import("./pelin.js");
  o.env.OPENAI_API_KEY = "x";
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).includes("api.openai.com") ? Response.json({ choices: [{ message: { content: JSON.stringify({ renk_buyuk_fark: false, kesim_buyuk_fark: false, boy_buyuk_fark: true, kadraj_tam: true, makyaj_var: true, puan: 6, buyuk_sorunlar: ["boy farklı: daha kısa"], kucuk_notlar: [] }) } }] }) : asil(url, istek));
  o.claude.cevaplar = [K2()];
  const k = await kaliteKontrol(o.env, ["u"], ["g"], 1, { boy: { boy: "bilek" }, yuz: true });
  globalThis.fetch = asil;
  assert.equal(k.gecti, true);
  assert.ok(k.notlar.some((x) => /ChatGPT: boy farklı: daha kısa \(Pelin boyu doğru buldu\)/.test(x)));
});

// ---------- 3627 video hatası + müzik denemesi (3 Kasım gece) ----------
test("Veo reddederse aynı kareyle Kling 4.0; katalog fotoğrafından video kartı; müzik denemesi; DENEME yayına gitmez; dekor temizlenir; hata Türkçe", async () => {
  const { temizOrtam, falHataTr } = await import("./pelin.js");
  assert.ok(!/envelope\b.*Atmosphere|velvet bow/.test(temizOrtam("Minimal studio with a plain muted green backdrop and no props beyond a small paper envelope. Atmosphere is whimsical, with ornate floral embroidery, velvet bow and long gloves as styling cues.").split("No props")[0]));
  assert.equal(falHataTr('[{"loc":["body"],"msg":"The model did not generate the expected output for this prompt."}]'), "araç bu istemi işleyemedi (istem uzun ya da içerik filtresine takıldı)");
  assert.equal(falHataTr("something weird"), "araç hatası (ayrıntı Claude Code'da)");
  const o = uretimOrtami();
  o.falSonuc["fal-ai/veo3.1/image-to-video"] = () => ({ detail: [{ msg: "The model did not generate the expected output for this prompt." }] });
  o.falSonuc["kling/v4/image-to-video"] = (n) => ({ video: { url: `https://vid/k${n}.mp4` } });
  o.falSonuc["fal-ai/ffmpeg-api/merge-audio-video"] = (n) => ({ video: { url: `https://vid/muzikli${n}.mp4` } });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("pelin:is:3627-onayli", JSON.stringify({ id: "3627-onayli", kod: "3627", seri: "buyuk", renk: "koyu bordo", boy: { boy: "bilek" }, durum: "uyari", foto: "https://img/katalog.jpg", sahne: "https://img/romantik.jpg", urunler: ["https://u/on.jpg"], ortam: { id: "2", ad: "Siyah Altın Lüks", sahne: "black gold studio" }, videoOrtam: { id: "ornek-romantik", sahne: "green backdrop" }, sahneAyar: { ...SAHNE_VARSAYILAN }, sablon: { ad: "romantik", kamera: "x", isik: "soft", hiz: "slow", poz: "envelope" }, fotoDeneme: 1, sahneDeneme: 2, videoDeneme: 2, maliyet: 1, gecmis: [], zaman: 1 }));
  o.noraOto = false; // bu testte Patron senaryo kartını elle onaylar
  o.depo.set("venom:pelinIsKomut", JSON.stringify({ isId: "3627-onayli", islem: "katalogdan", muzik: { url: "https://pelin.test/dosya/" + "m".repeat(32), ad: "romantik örnek videonun müziği (deneme, telifli olabilir)" }, deneme: true, araclar: ["veo31"] }));
  await cronlar(o, 1);
  const kart = o.g.filter((x) => x.govde && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /🎬 3627: bu katalog fotoğrafından 6 sn video — Google Veo 3\.1 \(1080p\) · 🧪 DENEME \(yayına gitmez\)[\s\S]*📝 Nora — senaryo \(3627, 6 sn\):\n0-2 sn: kameraya doğru iki yavaş adım[\s\S]*hızlı dönüş ve kamera dönüşü yok[\s\S]*• Google Veo 3\.1 \(1080p\): 6 × 0,40 \$ = 2,40 \$/);
  assert.ok(o.g.some((x) => x.metod === "sendPhoto" && x.govde.photo === "https://img/katalog.jpg"));
  assert.equal(o.falIstek.length, 0); // onaysız harcama yok
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][0].callback_data);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 3 }, () => K2());
  await cronlar(o, 12);
  const veo = o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.equal(veo.length, 1);
  assert.equal(veo[0].govde.image_url, "https://img/katalog.jpg"); // video katalog fotoğrafından (romantik kareden değil)
  assert.equal(veo[0].govde.auto_fix, true);
  assert.ok(veo[0].govde.prompt.length <= 1900);
  assert.match(veo[0].govde.prompt, /Setting and atmosphere: black gold studio/);
  assert.ok(!/envelope|green backdrop/.test(veo[0].govde.prompt.replace(/props or accessories such as hats, gloves or envelopes/, "")));
  const kl = o.falIstek.filter((x) => x.uc === "kling/v4/image-to-video");
  assert.equal(kl.length, 1);
  assert.equal(kl[0].govde.start_image_url, "https://img/katalog.jpg");
  const mz = o.falIstek.find((x) => x.uc === "fal-ai/ffmpeg-api/merge-audio-video");
  assert.equal(mz.govde.audio_url, "https://pelin.test/dosya/" + "m".repeat(32));
  const on = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.match(on.govde.text, /🎵 Müzik: romantik örnek videonun müziği[\s\S]*↪️ Veo bu istemi işleyemedi; aynı kareyle Kling 4\.0 kullanıldı\.[\s\S]*🧪 DENEME — kanala ve siteye HİÇ GİTMEZ/);
  assert.ok(!/did not generate/.test(on.govde.text));
  const yayin = on.govde.reply_markup.inline_keyboard[0][0];
  assert.equal(yayin.text, "💾 Beğendim (yayına gitmez)");
  await bas(o, MURAT, yayin.callback_data);
  await bas(o, MURAT, `${yayin.callback_data}:evet`);
  assert.equal((await teslim(o)).length, 0); // DENEME hiç yayına gitmez
  assert.match(o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text, /denemesi beğenildi ve saklandı — DENEME olduğu için kanala\/siteye gönderilmez/);
  const is = JSON.parse([...o.depo.entries()].filter(([k]) => k.startsWith("pelin:is:3627-") && k !== "pelin:is:3627-onayli").at(-1)[1]);
  assert.ok(is.videoSessiz && is.video !== is.videoSessiz); // sessiz hali saklı (müzik değiştirilebilir)
  assert.ok(is.gecmis.some(([, t]) => /Veo 3\.1 \(1080p\) işleyemedi \(araç bu istemi işleyemedi/.test(t)));
});


// ---------- Teslim zinciri + bütçe (4 Kasım) ----------
test("eski teslim kaydı otomatik GÖNDERİLMEZ: Patron'a sorulur; evet → kanal kuyruğu, hayır → gitmez; üretim onayı aylık sınırı aşarsa başlamaz", async () => {
  const o = uretimOrtami();
  o.depo.set("venom:pelinTeslim", JSON.stringify([{ kod: "3627", video: "https://vid/eski.mp4", foto: "https://img/f.jpg", kapak: "https://img/k.jpg", renk: "koyu bordo", zaman: 1793724600 }, { kod: "3601", video: "https://vid/b.mp4", zaman: 1 }]));
  await cronlar(o, 1);
  assert.equal((await teslim(o)).length, 0);
  assert.equal(JSON.parse(o.depo.get("venom:pelinTeslim")).length, 0);
  const sorular = o.g.filter((x) => /Bekleyen eski teslim/.test(x.govde.text || ""));
  assert.equal(sorular.length, 2);
  assert.match(sorular[0].govde.text, /3627 · koyu bordo[\s\S]*Siz demeden gitmez/);
  await bas(o, HEMRA, sorular[0].govde.reply_markup.inline_keyboard[0][0].callback_data);
  assert.equal((await teslim(o)).length, 0);
  await bas(o, MURAT, sorular[0].govde.reply_markup.inline_keyboard[0][0].callback_data);
  await bas(o, MURAT, sorular[1].govde.reply_markup.inline_keyboard[0][1].callback_data);
  assert.deepEqual((await teslim(o)).map((x) => [x.kod, x.v]), [["3627", 2]]);
  await cronlar(o, 1); // tekrar sorulmaz
  assert.equal(o.g.filter((x) => /Bekleyen eski teslim/.test(x.govde.text || "")).length, 2);
  // bütçe: sınır aşılıyorsa onay düğmesi üretimi durdurur
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3557", bedenler: "38-44", fotolar: ["galeri/3557/1.jpg"] });
  o.depo.set(`uretim-harcama:${ay}`, "149");
  await yazi(o, MURAT, "/uret 3557");
  const kart = o.g.at(-1).govde;
  await bas(o, MURAT, `pc:a:${kartId(kart)}:hf_kling4`);
  await bas(o, MURAT, `pc:s:${kartId(kart)}:siyahaltin`);
  assert.match(o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text, /SINIRI AŞAR/);
  await bas(o, MURAT, `pu:o:${kartId(kart)}`);
  assert.match(o.g.at(-1).govde.text, /⛔ Üretim başlamadı: bu ay Pelin 149,00 \$ harcadı/);
  assert.equal(o.falIstek.length, 0);
});

// ---------- Nora + hareket kuralı + Kling/Veo karşılaştırma (4 Kasım) ----------
test("Nora: senaryo kartı (iki araç + maliyet) → ✏️ Düzelt → yeniden yazar → ✅ → aynı fotoğraftan Kling 4.0 ve Veo 3.1 yan yana; hızlı dönüş/kamera dönüşü yok; normal üretimde video öncesi senaryo onayı", async () => {
  const o = uretimOrtami();
  o.noraOto = false;
  o.falSonuc["kling/v4/image-to-video"] = (n) => ({ video: { url: `https://vid/k${n}.mp4` } });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("pelin:is:3627-foto", JSON.stringify({ id: "3627-foto", kod: "3627", seri: "buyuk", renk: "koyu bordo", boy: { boy: "bilek" }, durum: "uyari", foto: "https://img/onayli.jpg", urunler: ["https://u/on.jpg"], ortam: { id: "2", ad: "Siyah Altın Lüks", sahne: "black gold studio" }, sahneAyar: { ...SAHNE_VARSAYILAN, kamera: "The camera slowly orbits around her" }, fotoDeneme: 1, videoDeneme: 0, maliyet: 0, gecmis: [], zaman: 1 }));
  o.depo.set("venom:pelinIsKomut", JSON.stringify({ isId: "3627-foto", islem: "katalogdan", araclar: ["kling4", "veo31"] }));
  await cronlar(o, 1);
  let kart = o.g.filter((x) => x.govde && x.govde.text && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /Kling 4\.0 \(1080p\) ve Google Veo 3\.1 \(1080p\) \(yan yana karşılaştırma\)[\s\S]*📝 Nora — senaryo[\s\S]*• Kling 4\.0 \(1080p\): 6 × 0,16 \$ = 0,94 \$\n• Google Veo 3\.1 \(1080p\): 6 × 0,40 \$ = 2,40 \$/);
  assert.deepEqual(kart.reply_markup.inline_keyboard[0].map((x) => x.text), ["✅ Onayla", "✏️ Düzelt", "❌ İptal"]);
  const nora1 = o.claude.find((x) => JSON.stringify(x).includes("Nora'sın"));
  assert.match(JSON.stringify(nora1), /kameraya doğru İLERİ yürür; geri gitmek, kameradan uzaklaşmak, sırtını dönmek YASAK\. Hızlı dönüş YOK, kendi etrafında dönme YOK, kamera etrafında dönüş YOK/);
  assert.equal(o.falIstek.length, 0);
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][1].callback_data); // ✏️ Düzelt
  assert.match(o.g.at(-1).govde.text, /Senaryoda neyi değiştireyim/);
  await yazi(o, MURAT, "önce omuz üstünden baksın, sonra iki adım yürüsün");
  assert.match(JSON.stringify(o.claude.at(-1)), /PATRON'UN DÜZELTMESİ \(mutlaka uygula\): önce omuz üstünden baksın/);
  kart = o.g.filter((x) => x.govde && x.govde.text && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /^✏️ Düzeltildi\.[\s\S]*📝 Nora — senaryo/);
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][0].callback_data); // ✅
  assert.match(o.g.at(-1).govde.text, /Kling 4\.0 \(1080p\) \+ Google Veo 3\.1 \(1080p\) ile video üretiliyor[\s\S]*yan yana/);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 4 }, () => K2());
  await cronlar(o, 10);
  const kl = o.falIstek.filter((x) => x.uc === "kling/v4/image-to-video"), ve = o.falIstek.filter((x) => x.uc === "fal-ai/veo3.1/image-to-video");
  assert.equal(kl.length, 1); assert.equal(ve.length, 1);
  assert.equal(kl[0].govde.start_image_url, "https://img/onayli.jpg");
  assert.equal(ve[0].govde.image_url, "https://img/onayli.jpg");
  for (const p of [kl[0].govde.prompt, ve[0].govde.prompt]) {
    assert.match(p, /Motion \(approved scenario\): She takes two slow steps toward the camera/);
    assert.match(p, /no spinning, no twirling, no fast turns, no orbiting camera/);
    assert.ok(!/orbits around her|turns to face the camera/.test(p));
  }
  assert.match(ve[0].govde.negative_prompt, /spinning, twirling, fast turn, orbiting camera/);
  assert.equal(uretimEdit(o).length, 0); // fotoğraf yeniden üretilmez
  assert.equal(o.g.filter((x) => /ÖNİZLEME — 3627/.test(x.govde.text || "")).length, 2); // ikisi yan yana
  // Normal üretim: video öncesi Nora kartı gelir, onaylanmadan video yok
  o.site.push({ kod: "3557", bedenler: "38-44", fotolar: ["galeri/3557/1.jpg"] });
  await yazi(o, MURAT, "/uret 3557");
  await onayla(o, kartId(o.g.at(-1).govde));
  o.yaziCevap.kod = "3557";
  o.claude.cevaplar = Array.from({ length: 3 }, () => K2());
  const once = o.hfIstek.length;
  await cronlar(o, 8);
  assert.equal(o.hfIstek.length, once); // senaryo onayı bekleniyor
  const nk = o.g.filter((x) => /📝 Nora — senaryo \(3557/.test(x.govde.text || "")).at(-1);
  assert.ok(nk, "Nora kartı gelmeli");
  await bas(o, MURAT, nk.govde.reply_markup.inline_keyboard[0][0].callback_data);
  await cronlar(o, 2);
  assert.equal(o.hfIstek.length, once + 1);
});

test("önizleme gönderimi kaydedilir; video adresten gitmezse belge olarak; 'bildir' ile yeniden gönderilir; modele özel araç kilidi YOK (eski kayıt olsa da kartta sorulur)", async () => {
  const o = uretimOrtami();
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).endsWith("/sendVideo") ? Response.json({ ok: false, description: "Bad Request: failed to get HTTP URL content" }) : asil(url, istek));
  o.depo.set("pelin:is:3627-k", JSON.stringify({ id: "3627-k", kod: "3627", seri: "buyuk", durum: "onay", arac: "kling4", foto: "https://img/f.jpg", video: "https://vid/k.mp4", kapak: "https://img/kap.jpg", ortam: { ad: "Siyah Altın Lüks" }, sahneAyar: { ...SAHNE_VARSAYILAN }, fotoDeneme: 1, videoDeneme: 1, gecmis: [], aracYasak: ["veo31"] }));
  o.depo.set("venom:pelinIsKomut", JSON.stringify({ isId: "3627-k", islem: "bildir", onEk: "🔁 3627 Kling videosu yeniden gönderiliyor." }));
  await cronlar(o, 1);
  globalThis.fetch = asil;
  assert.ok(o.g.some((x) => x.metod === "sendDocument" && x.govde.document === "https://vid/k.mp4")); // belge olarak
  assert.ok(o.g.some((x) => /🔁 3627 Kling videosu yeniden gönderiliyor/.test(x.govde.text || "")));
  const on = o.g.find((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.ok(on);
  assert.ok(!on.govde.reply_markup.inline_keyboard.flat().some((d) => /Veo/.test(d.text))); // Veo kapalı → karşılaştırma düğmesi yok
  const is = JSON.parse(o.depo.get("pelin:is:3627-k"));
  assert.deepEqual(is.bildirim.sonuc.map(([ad, ok]) => [ad, ok]), [["foto", true], ["video", true], ["kapak", true], ["metin", true]]);
  // 4 Kasım: modele özel araç kilidi kaldırıldı — eski kayıtta "arac: kling4" olsa da kartta sorulur, seçilen kullanılır
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilek", arac: "kling4", aracYasak: ["veo31", "veofast", "veo"] }));
  await yazi(o, MURAT, "/uret büyük:3627");
  assert.match(o.g.at(-1).govde.text, /🎬 Video aracı: — SEÇİN/);
  assert.ok(!/modele özel/.test(o.g.at(-1).govde.text));
  await onayla(o, kartId(o.g.at(-1).govde), "hf_seedance25", "parilti");
  const yeni = [...o.depo.entries()].filter(([k]) => k.startsWith("pelin:is:3627-") && k !== "pelin:is:3627-k").map(([, v]) => JSON.parse(v));
  assert.equal(yeni[0].arac, "hf_seedance25");
  assert.equal(yeni[0].videoOrtam.ad, "Parıltı (podyum)");
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).seri, "buyuk"); // seri model kartına kalıcı yazıldı
});

// ---------- Higgsfield (4 Kasım): anahtar ayırma, 3 araç yan yana, fal yedeği, karşılaştırma kartı, anahtar hatırlatması ----------
import { hfYetki, hfVar, hfHatirlat } from "./pelin.js";
test("Higgsfield anahtarı: tek secret 'ID:SECRET' ya da iki parça (boşluk/satır/virgül) kendiliğinden ayrılır", () => {
  assert.equal(hfYetki({ HF_API_KEY: " abc:def \n" }), "abc:def");
  assert.equal(hfYetki({ HF_API_KEY: "abc def" }), "abc:def");
  assert.equal(hfYetki({ HF_API_KEY: "abc\ndef" }), "abc:def");
  assert.equal(hfYetki({ HF_API_KEY: "Key abc, def" }), "abc:def");
  assert.equal(hfYetki({ HF_API_KEY_ID: "a", HF_API_KEY_SECRET: "b" }), "a:b");
  assert.equal(hfVar({ HF_API_KEY: "tekparca" }), false);
  assert.equal(hfVar({}), false);
});

test("Higgsfield: onaylı fotoğraf + onaylı senaryo → Kling 3.0 4K, Seedance 2.5, Kling 4.0 yan yana; maliyet kartı; biri hata verirse fal yedeği; hepsi bitince 🏆 kartı", async () => {
  const o = uretimOrtami();
  o.env.HF_API_KEY = "kid:ksecret";
  const hf = [];
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.higgsfield.ai/requests/")) { const id = u.split("/")[4]; return Response.json({ status: "completed", request_id: id, video: { url: `https://hf/${id}.mp4` } }); }
    if (u.startsWith("https://api.higgsfield.ai/")) {
      const yol = u.slice("https://api.higgsfield.ai/".length);
      hf.push({ yol, govde: JSON.parse(istek.body), yetki: istek.headers.authorization });
      if (yol.startsWith("bytedance/")) return Response.json({ detail: "Insufficient balance" }, { status: 403 });
      const id = `h${hf.length}`;
      return Response.json({ status: "queued", request_id: id, status_url: `https://api.higgsfield.ai/requests/${id}/status` });
    }
    return asil(url, istek);
  };
  o.falSonuc["bytedance/seedance-2.0/image-to-video"] = (n) => ({ video: { url: `https://vid/s${n}.mp4` } });
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.depo.set("pelin:is:3627-foto", JSON.stringify({ id: "3627-foto", kod: "3627", seri: "buyuk", renk: "koyu bordo", boy: { boy: "bilek" }, durum: "onay", foto: "https://img/onayli.jpg", urunler: ["https://u/on.jpg"], ortam: { id: "2", ad: "Siyah Altın Lüks", sahne: "black gold studio" }, sahneAyar: { ...SAHNE_VARSAYILAN }, fotoDeneme: 1, videoDeneme: 0, maliyet: 0, gecmis: [], zaman: 1 }));
  o.depo.set("pelin:is:3627-kling", JSON.stringify({ id: "3627-kling", kod: "3627", durum: "onay", senaryo: { tr: "0-2 sn: iki yavaş adım", hareketEn: "She walks two slow elegant steps toward the camera and glances over her shoulder." }, gecmis: [] }));
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilek", arac: "kling4", aracYasak: ["veo31", "veofast", "veo"] }));
  o.depo.set("venom:pelinIsKomut", JSON.stringify({ isId: "3627-foto", islem: "katalogdan", araclar: ["hf_kling3", "hf_seedance25", "hf_kling4"], senaryoIs: "3627-kling" }));
  await cronlar(o, 1);
  const kart = o.g.filter((x) => x.govde && x.govde.text && x.govde.reply_markup).at(-1).govde;
  assert.match(kart.text, /daha önce ONAYLADIĞINIZ senaryo, aynen[\s\S]*0-2 sn: iki yavaş adım/);
  assert.match(kart.text, /• Kling 3\.0 4K \(Higgsfield\): 6 × 0,21 \$ = 1,26 \$\n• Seedance 2\.5 1080p \(Higgsfield\): 6 × 1,14 \$ = en fazla 6,82 \$ \(indirim öncesi[\s\S]*• Kling 4\.0 1080p \(Higgsfield\): 6 × 0,20 \$ = 1,20 \$/);
  assert.match(kart.text, /Higgsfield'den düşecek: en fazla 9,28 \$[\s\S]*TOPLAM: en fazla/);
  assert.ok(!o.claude.some((x) => JSON.stringify(x).includes("Nora'sın")), "onaylı senaryo varken Nora yeniden yazmaz");
  assert.equal(hf.length, 0); // onaysız hiçbir şey gitmez
  await bas(o, MURAT, kart.reply_markup.inline_keyboard[0][0].callback_data);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 6 }, () => K2());
  await cronlar(o, 12);
  globalThis.fetch = asil;
  assert.deepEqual(hf.map((x) => x.yol).sort(), ["bytedance/seedance-2.5/image-to-video", "kling-video/v3.0/4k/image-to-video", "kling-video/v4.0/image-to-video"]);
  assert.ok(hf.every((x) => x.yetki === "Key kid:ksecret" && x.govde.image_url === "https://img/onayli.jpg" && x.govde.duration === 6));
  assert.match(hf[0].govde.prompt, /Motion \(approved scenario\): She walks two slow elegant steps[\s\S]*Avoid: .*spinning/);
  assert.equal(hf.find((x) => x.yol.startsWith("bytedance")).govde.resolution, "1080p");
  assert.equal(o.falIstek.filter((x) => x.uc === "bytedance/seedance-2.0/image-to-video").length, 1); // Seedance 2.5 bakiye → fal yedeği
  const onizleme = o.g.filter((x) => /ÖNİZLEME — 3627/.test(x.govde.text || ""));
  assert.equal(onizleme.length, 3);
  assert.ok(onizleme.some((x) => /Seedance 2\.5 1080p \(Higgsfield\) çalışmadı \(Higgsfield bakiyesi yetersiz\)/.test(x.govde.text)));
  assert.ok(onizleme.every((x) => !x.govde.reply_markup.inline_keyboard.flat().some((d) => /ile de dene/.test(d.text))));
  const ozet = o.g.filter((x) => /🏁 3627 KARŞILAŞTIRMA/.test(x.govde.text || ""));
  assert.equal(ozet.length, 1);
  assert.match(ozet[0].govde.text, /A\) Kling 3\.0 4K \(Higgsfield\)[\s\S]*B\) Seedance 2\.0 \(Higgsfield yerine fal yedeği\)[\s\S]*C\) Kling 4\.0 1080p \(Higgsfield\)/);
  const d = ozet[0].govde.reply_markup.inline_keyboard.flat();
  const k4 = d.find((x) => /Kling 4\.0 1080p/.test(x.text));
  await bas(o, MURAT, k4.callback_data);
  assert.equal(JSON.parse(o.depo.get("pelin:secim")).arac, "veo"); // varsayılan araç DEĞİŞMEZ (4 Kasım: varsayılan yok)
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).enIyiArac, "hf_kling4");
  assert.match(o.g.at(-1).govde.text, /🏆 Kling 4\.0 1080p \(Higgsfield\) en gerçekçi olarak not edildi[\s\S]*Varsayılan araç yok/);
  await bas(o, MURAT, k4.callback_data);
  assert.equal(JSON.parse(o.depo.get("pelin:aracKarsilastirma")).length, 1); // ikinci basış geçersiz
  // harcama Higgsfield ayrı kayıtta
  assert.ok(Number(o.depo.get(`pelin-hf:${ay}`)) > 0);
});

test("Higgsfield anahtarı: bitişten 5 gün önce bir kez, bitiş günü bir kez Patron'a hatırlatma", async () => {
  const o = ortam();
  o.depo.set("venom:hfAnahtar", JSON.stringify({ bitis: "2026-12-04", gonderilen: [] }));
  const t = (s) => Math.floor(Date.parse(s) / 1000);
  await hfHatirlat(o.env, t("2026-11-28T09:00:00+03:00"));
  assert.equal(o.g.length, 0);
  await hfHatirlat(o.env, t("2026-11-29T09:30:00+03:00")); // 10:00'dan önce
  assert.equal(o.g.length, 0);
  await hfHatirlat(o.env, t("2026-11-29T10:05:00+03:00"));
  assert.match(o.g.at(-1).govde.text, /04\.12\.2026 tarihinde bitiyor \(5 gün kaldı\)/);
  assert.equal(o.g.at(-1).govde.chat_id, String(MURAT));
  await hfHatirlat(o.env, t("2026-11-30T11:00:00+03:00"));
  assert.equal(o.g.length, 1);
  await hfHatirlat(o.env, t("2026-12-04T10:30:00+03:00"));
  assert.match(o.g.at(-1).govde.text, /süresi bugün \(04\.12\.2026\) doldu/);
  await hfHatirlat(o.env, t("2026-12-05T10:30:00+03:00"));
  assert.equal(o.g.length, 2);
});

// ---------- 4 Kasım: kart düzeltmeleri (seri, renk, bilek altı, astar, etiket, komutlar, kart ekranı, hepsini dene, HEIC, sohbet) ----------
import { komutNormal, boyMetinden } from "./pelin.js";
test("komut yazımları: '3627 üret', '/3627 uret', 'üret 3627', '/uret3627', '3627 kart', '/3627', '3627 fotolar'; boy yazısı 'bilek altı'", () => {
  for (const x of ["3627 üret", "/3627 uret", "üret 3627", "/uret3627", "3627 Üret"]) assert.equal(komutNormal(x), "/uret 3627");
  assert.equal(komutNormal("3627 üret kırmızı"), "/uret 3627 kırmızı");
  assert.equal(komutNormal("/3627 kart"), "/kart 3627");
  assert.equal(komutNormal("3627 kart"), "/kart 3627");
  assert.equal(komutNormal("/3627"), "/kart 3627");
  assert.equal(komutNormal("3627 fotolar"), "/fotolar 3627");
  assert.equal(komutNormal("merhaba"), "merhaba");
  assert.equal(boyMetinden("3627 boy bilek altı"), "bilekalti");
  assert.equal(boyMetinden("3627 boy bilek"), "bilek");
});

test("3627 model kartı: seri/renk/boy/astar kalıcı; '3627 kart' tek ekran; bilek altı + astar istemde ve kontrolde; 'Hepsini dene' üç araç aynı fotoğraf + senaryo, yan yana", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-40-42-44-46-48-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ anlama: { "koyu bordo": { ust: "seffaf", alt: "opak", iclik: "siyah", onay: 1 } }, boy: "bilekalti", seri: "buyuk", renk: "koyu bordo", astarTr: "Üst gövde ve kollar şeffaf şifon; SADECE göğüste ince içlik astar.", astarEn: "upper bodice and sleeves are sheer chiffon; ONLY the bust has a thin camisole-like lining", sonSablon: "siyahaltin" }));
  await fotoMesaj(o, { caption: "3627 manken", mid: 30, dosya: true });
  await fotoMesaj(o, { caption: "3627 askı", mid: 31, dosya: true });
  await fotoMesaj(o, { caption: "3627 detay", mid: 32 });
  // önceki iş: son senaryo
  o.depo.set("pelin:is:3627-eski", JSON.stringify({ id: "3627-eski", kod: "3627", durum: "iptal", senaryo: { tr: "0-2 sn: iki yavaş adım; 4-6 sn: omuz üstünden bakış", hareketEn: "She takes two slow steps and glances over her shoulder." }, gecmis: [] }));
  o.depo.set("pelin:isler", JSON.stringify(["3627-eski"]));
  await yazi(o, MURAT, "3627 kart");
  const kartEkran = o.g.filter((x) => /MODEL KARTI — 3627/.test(x.govde.text || "")).at(-1).govde.text;
  assert.match(kartEkran, /Seri: Büyük seri \(44-50\) · yüz: 3 numaralı dolgun kız\nRenk: koyu bordo\nBoy: bilek altı \(bileği hafif örter, ayakkabı görünür, yere değmez\)\nModel kuralı \(koyu bordo\): üst gövde ve kollar şeffaf şifon[\s\S]*Fotoğraflar: 1\. manken ön, 2\. askı ön, 3\. detay[\s\S]*Son şablon: Siyah-Altın[\s\S]*Son senaryo: 0-2 sn: iki yavaş adım/);
  assert.ok(o.g.some((x) => x.metod === "sendMediaGroup" && x.govde.media.map((m) => m.caption).join("|") === "3627 · 1. manken ön|3627 · 2. askı ön|3627 · 3. detay"));
  // kart: seri + renk karttan (yazıda yok); son senaryo; araç + şablon seçmeli
  await guncelleme({ message: { message_id: 40, date: 1, chat: { id: MURAT, type: "private" }, from: { id: MURAT, first_name: "M" }, text: "3627 üret" } }, o.env);
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /Yüz: 3627 büyük seri \(3 numaralı dolgun kız\)\nRenk: 3627 sadece koyu bordo\nÜrün fotoğrafı: 3627 sizin gönderdiğiniz \(manken ön, askı ön, detay\)\nBoy: 3627 bilek altı[\s\S]*Model kuralı \(3627\): üst gövde ve kollar şeffaf şifon; etek iki kat: üstte şifon, altında aynı renkte \(koyu bordo\) opak astar — bacaklar asla görünmez; göğüste SADECE siyah içlik/);
  assert.match(kart.text, /📝 Senaryo: fotoğraf hazır olunca Nora yazar/); // "son senaryo" istenmedi
  o.depo.set("venom:pelinKomut", JSON.stringify({ metin: "/uret 3627", sonSenaryo: true }));
  await cronlar(o, 1);
  const kart2 = o.g.filter((x) => x.govde && /💰 Üretim — 1 model: 3627/.test(x.govde.text || "") && x.metod === "sendMessage").at(-1).govde;
  assert.match(kart2.text, /📝 Senaryo \(3627\) — Nora'nın son senaryosu, aynen:\n0-2 sn: iki yavaş adım/);
  // ilk kart geçersiz oldu
  await bas(o, MURAT, `pc:a:${kartId(kart)}:hepsi`);
  assert.match(o.g.at(-1).govde.text, /geçersiz \(yeni kart geldi\)/);
  // ikinci kart: hepsini dene + Parıltı
  await bas(o, MURAT, `pc:a:${kartId(kart2)}:hepsi`);
  await bas(o, MURAT, `pc:s:${kartId(kart2)}:parilti`);
  const duz = o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text;
  assert.match(duz, /HEPSİNİ DENE \(Seedance 2\.5 \+ Kling 3\.0 4K \+ Kling 4\.0[\s\S]*🎨 Şablon: Parıltı[\s\S]*Video başlangıç karesi \(Parıltı \(podyum\)\)[\s\S]*Seedance 2\.5[\s\S]*Kling 3\.0 4K[\s\S]*Kling 4\.0/);
  await bas(o, MURAT, `pu:o:${kartId(kart2)}`);
  assert.match(o.g.at(-1).govde.text, /⛔ Üretim başlamadı: bugün Pelin 0,00 \$ harcadı, bu iş ~10,\d\d \$; günlük sınır 10 \$/); // günlük fren
  o.depo.set("pelin:gunlukSinir", "20"); // Patron izin verdi (Claude Code)
  await bas(o, MURAT, `pu:o:${kartId(kart2)}`);
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 10 }, () => K2());
  await cronlar(o, 24);
  const edit = uretimEdit(o);
  assert.equal(edit.length, 2); // katalog fotoğrafı + Parıltı karesi BİR KEZ (üç araç ortak)
  assert.match(edit[0].govde.prompt, /^LENGTH RULE[\s\S]*just below the ankle[\s\S]*The hem just covers the ankle bones[\s\S]*image 2 = FRONT view worn by a real model[\s\S]*image 3 = FRONT view on a hanger[\s\S]*image 4 = close-up detail[\s\S]*MODEL RULES \(exact, highest priority after length\): The upper bodice and the sleeves are SHEER see-through chiffon\. The skirt has TWO layers: sheer chiffon on top and an OPAQUE lining fabric of the SAME color \(dark burgundy\) underneath — the legs are NEVER visible[\s\S]*black camisole lining under sheer chiffon/);
  assert.match(edit[1].govde.prompt, /lavender-gray walls and a glossy white floor/);
  assert.ok(o.claude.some((x) => JSON.stringify(x.messages).includes("MODEL KURALLARI (bu modele özel, kesin): üst gövde ve kollar şeffaf şifon")));
  assert.deepEqual(o.hfIstek.map((x) => x.yol).sort(), ["bytedance/seedance-2.5/image-to-video", "kling-video/v3.0/4k/image-to-video", "kling-video/v4.0/image-to-video"]);
  const kare = new Set(o.hfIstek.map((x) => x.govde.image_url));
  assert.equal(kare.size, 1); // aynı başlangıç karesi
  assert.ok(o.hfIstek.every((x) => /She takes two slow steps and glances over her shoulder/.test(x.govde.prompt))); // aynı (son) senaryo
  assert.ok(!o.g.some((x) => /📝 Nora — senaryo \(3627/.test(x.govde.text || "") && x.metod === "sendMessage" && x.govde.reply_markup)); // senaryo hazırdı → Nora kartı yok
  assert.equal(o.g.filter((x) => /ÖNİZLEME — 3627/.test(x.govde.text || "")).length, 3);
  assert.equal(o.g.filter((x) => /🏁 3627 KARŞILAŞTIRMA/.test(x.govde.text || "")).length, 1);
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).sonSablon, "parilti");
});

test("yazısız fotoğraf + ardından '3627 manken' yazısı → ürün fotoğrafı; HEIC /dosya JPEG'e çevrilir; Venom işi karta döner; Pelin sohbeti son kartı görür", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  await fotoMesaj(o, { mid: 50 }); // yazısız → yüz mü sorusu
  assert.match(o.g.at(-1).govde.text, /kalıcı yüz olarak kaydedeyim mi[\s\S]*"3627 manken"/);
  await yazi(o, MURAT, "3627 manken");
  assert.match(o.g.at(-1).govde.text, /✅ Son fotoğraf 3627 ürün fotoğrafı olarak kaydedildi: manken ön/);
  assert.equal(JSON.parse(o.depo.get("pelin:urunfoto:3627"))[0].etiket, "manken");
  // HEIC sunumu: IMAGES ile JPEG
  o.depo.set("pelindosya:" + "f".repeat(32), JSON.stringify({ file_id: "H1", tur: "image/heic" }));
  let cevrildi = false;
  o.env.IMAGES = { input: () => ({ transform: () => ({ output: (opt) => { cevrildi = opt.format === "image/jpeg"; return { response: () => new Response("JPEGVERI") }; } }) }) };
  const asil = globalThis.fetch;
  globalThis.fetch = async (url, istek) => (String(url).includes("api.telegram.org/file/") ? new Response("HEICVERI") : String(url).endsWith("/getFile") ? Response.json({ ok: true, result: { file_path: "documents/x.heic" } }) : asil(url, istek));
  const { default: worker } = await import("./pelin.js");
  const r = await worker.fetch(new Request("https://pelin.test/dosya/" + "f".repeat(32)), { ...o.env, PELIN: { idFromName: () => "p", get: () => ({ fetch: () => new Response("x") }) } }, { waitUntil() {} });
  globalThis.fetch = asil;
  assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.equal(await r.text(), "JPEGVERI");
  assert.ok(cevrildi);
  // Venom: varsayılan araç yok → Pelin kartı gönderilir, üretim başlamaz
  o.depo.set("pelinboy:3557", JSON.stringify({ boy: "midi" }));
  o.site.push({ kod: "3557", bedenler: "38-44", fotolar: ["galeri/3557/1.jpg"] });
  const { venomUretimi } = await import("./pelin.js");
  const v = await venomUretimi(o.env, { kodlar: ["3557"], test: false }, 1);
  assert.ok(v.ok && /kartı gönderildi: araç ve şablonu orada seçip/.test(v.mesaj));
  assert.match(o.g.at(-1).govde.text, /💰 Üretim — 1 model: 3557[\s\S]*🎬 Video aracı: — SEÇİN/);
  assert.equal(o.falIstek.length, 0);
  // sohbet: son kartın gerçek metni sistem bilgisinde
  await yazi(o, MURAT, "son kartta tutar ne kadar?");
  const sis = JSON.stringify(o.claude.at(-1).system);
  assert.match(sis, /SON KARTLAR \(Telegram'a giden gerçek metin, en yenisi başta\)[\s\S]*💰 Üretim — 1 model: 3557/);
  assert.match(sis, /kartı göremiyorum \/ içeriğini bilmiyorum\\" DEME|kartı göremiyorum/);
});

test("ŞABLON DENEMESİ: tek fotoğraf + Kling 3.0 4K × Parıltı (kayıtlı podyum) / Romantik / Şehir; şablon sadece videoda; yeniden üretim yok; bütçe tavanı; DENEME yayına gitmez", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilekalti", seri: "buyuk", renk: "koyu bordo", astarTr: "sadece göğüste ince içlik", astarEn: "sheer upper bodice and sleeves; ONLY the bust is lined", stil: { "koyu bordo": { aksesuarTr: "altın küpe", aksesuarEn: "gold earrings" } } }));
  o.depo.set("pelin:sablonlar", JSON.stringify({ "parıltı": { ad: "parıltı", kaynak: "ornek", isik: "soft diffused studio light, cool lavender-gray backdrop", hiz: "real-time calm runway rhythm", ortam_havasi: "Minimal high-fashion runway with pale lavender-gray walls and a glossy white floor, seated guests along the runway." }, romantik: { ad: "romantik", kaynak: "ornek", isik: "soft frontal beauty light, muted sage green backdrop", hiz: "slow calm", ortam_havasi: "Intimate studio with a plain muted green backdrop and a small paper envelope." } }));
  o.depo.set("venom:pelinSablonDeneme", JSON.stringify({ kod: "3627", arac: "hf_kling3", sablonlar: ["parilti", "romantik", "sehir"], butce: 5, senaryolar: { parilti: { tr: "podyum yürüyüşü", hareketEn: "She walks slowly and confidently down the runway toward the camera, then pauses briefly and turns her head." } } }));
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = [claudeJsonCevap({ ...GECTI }), ...Array.from({ length: 3 }, () => K2({ renk_buyuk_fark: true, puan: 5, buyuk_sorunlar: ["renk biraz parlak"] }))];
  await cronlar(o, 14);
  assert.match(o.g.find((x) => /ŞABLON DENEMESİ başladı/.test(x.govde.text || "")).govde.text, /Kling 3\.0 4K \(Higgsfield\) × Parıltı · Romantik · Şehir[\s\S]*Tahmini toplam ~4,\d\d \$ · sınır 5 \$/);
  assert.equal(uretimEdit(o).length, 1); // TEK fotoğraf, ayrı kare yok
  const v = o.hfIstek.filter((x) => x.yol === "kling-video/v3.0/4k/image-to-video");
  assert.equal(v.length, 3); // kontrol geçmese de yeniden üretim YOK
  assert.equal(new Set(v.map((x) => x.govde.image_url)).size, 1);
  const p = v.map((x) => x.govde.prompt).join(" ||| ");
  assert.match(p, /she is in this setting\): Minimal high-fashion runway with pale lavender-gray walls[\s\S]*Style reference: use ONLY its light[\s\S]*cool lavender-gray[\s\S]*Motion \(approved scenario\): She walks slowly and confidently down the runway/);
  assert.match(p, /she is in this setting\): Intimate studio with a plain muted green backdrop\. No props/);
  assert.match(p, /she is in this setting\): city street golden hour/);
  assert.ok(!/envelope\b(?!, card)/.test(p.replace(/no envelope/gi, "")));
  const on = o.g.filter((x) => /ÖNİZLEME — 3627/.test(x.govde.text || "") || /⚠️ 3627/.test(x.govde.text || ""));
  assert.equal(on.length, 3);
  assert.ok(on.some((x) => /şablon: Parıltı/.test(x.govde.text)) || o.g.some((x) => /Parıltı/.test(x.govde.text || "")));
  assert.match(o.g.find((x) => /🏁 3627 KARŞILAŞTIRMA/.test(x.govde.text || "")).govde.text, /A\) Kling 3\.0 4K \(Higgsfield\) · Parıltı[\s\S]*B\) Kling 3\.0 4K \(Higgsfield\) · Romantik[\s\S]*C\) Kling 3\.0 4K \(Higgsfield\) · Şehir/);
  // yayın yok: hepsi DENEME
  const isler = [...o.depo.entries()].filter(([k]) => k.startsWith("pelin:is:3627-")).map(([, x]) => JSON.parse(x));
  assert.ok(isler.every((x) => x.yayinYok && x.denemeSiniri === 1));
  const toplam = isler.reduce((t, x) => t + x.maliyet, 0);
  assert.ok(toplam < 5, `toplam ${toplam}`);
  assert.equal((await teslim(o)).length, 0);
});

test("ŞABLON DENEMESİ bütçe: sınır aşılacaksa harcamadan durur ve Patron'a sorar", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilekalti", seri: "buyuk", renk: "koyu bordo" }));
  o.depo.set("venom:pelinSablonDeneme", JSON.stringify({ kod: "3627", arac: "hf_kling3", sablonlar: ["siyahaltin", "sehir", "romantik"], butce: 2 }));
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 6 }, () => K2());
  await cronlar(o, 14);
  assert.equal(o.hfIstek.length, 1); // 0,19 + 1,26 + kontroller → ikinci video 2 $'ı aşar
  assert.ok(o.g.some((x) => /BÜTÇE: şimdiye kadar ~[\d,]+ \$, bu adım 1,26 \$ → 2 \$ sınırı aşılır; durdum, Patron'a soruyorum/.test(x.govde.text || "")));
});

test("ANLAMA KARTI: yeni model → Pelin tahmini işaretli düğmeler → Patron düzeltip onaylar → kalıcı; yeni renkte içlik yeniden sorulur; onaysız üretim yok", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3800", bedenler: "38-44", fotolar: ["galeri/3800/1.jpg"] });
  o.depo.set("pelinboy:3800", JSON.stringify({ anlamaYok: true, marka: "BLACKROSE" }));
  o.claude.cevaplar = [claudeJsonCevap({ ust: "seffaf", alt: "seffaf", iclik: "beyaz", boy: "midi", neden: "Üst tül, etek astarsız görünüyor." })];
  await yazi(o, MURAT, "3800 üret koyu bordo");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /🔎 YENİ MODEL ANLAMA — 3800 · koyu bordo[\s\S]*Üst: Şeffaf · Etek\/alt: Şeffaf · İçlik: Beyaz · Boy: midi[\s\S]*Onaylanmadan üretim başlamaz/);
  const d = kart.reply_markup.inline_keyboard.flat();
  assert.deepEqual(d.filter((x) => /^☑️/.test(x.text)).map((x) => x.text), ["☑️ Üst: Şeffaf", "☑️ Etek: Şeffaf", "☑️ İçlik: Beyaz", "☑️ Midi"]);
  // Patron yanlışları düzeltir: etek opak, içlik siyah, boy bilek altı
  await bas(o, MURAT, d.find((x) => x.text === "Etek: Astarlı/opak").callback_data);
  await bas(o, MURAT, d.find((x) => x.text === "İçlik: Siyah").callback_data);
  await bas(o, MURAT, d.find((x) => x.text === "Bilek altı").callback_data);
  assert.match(o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text, /Üst: Şeffaf · Etek\/alt: Astarlı\/opak · İçlik: Siyah · Boy: bilek altı/);
  assert.equal(o.falIstek.length + o.hfIstek.length, 0);
  await bas(o, MURAT, d.find((x) => /^pa:o:/.test(x.callback_data)).callback_data);
  const b = JSON.parse(o.depo.get("pelinboy:3800"));
  assert.deepEqual({ ...b.anlama["koyu bordo"], onay: 0 }, { ust: "seffaf", alt: "opak", iclik: "siyah", onay: 0 });
  assert.equal(b.boy, "bilekalti");
  assert.ok(o.g.some((x) => /✅ 3800 · koyu bordo kalıcı kaydedildi: üst gövde ve kollar şeffaf şifon; etek iki kat[\s\S]*göğüste SADECE siyah içlik/.test(x.govde.text || "")));
  const uk = o.g.filter((x) => x.metod === "sendMessage").at(-1).govde.text; // ardından üretim kartı
  assert.match(uk, /💰 Üretim — 1 model: 3800[\s\S]*Model kuralı \(3800\): üst gövde ve kollar şeffaf şifon; etek iki kat: üstte şifon, altında aynı renkte \(koyu bordo\) opak astar — bacaklar asla görünmez; göğüste SADECE siyah içlik/);
  // aynı renk: bir daha sorulmaz
  await yazi(o, MURAT, "3800 üret koyu bordo");
  assert.match(o.g.at(-1).govde.text, /💰 Üretim — 1 model: 3800/);
  // yeni renk: içlik yeniden sorulur (üst/etek tahmini korunur, içlik boş)
  o.claude.cevaplar = [claudeJsonCevap({ ust: "seffaf", alt: "opak", neden: "Beyaz renk." })];
  await yazi(o, MURAT, "3800 üret beyaz");
  assert.match(o.g.at(-1).govde.text, /🔎 YENİ MODEL ANLAMA — 3800 · beyaz[\s\S]*İçlik: \?[\s\S]*İçlik rengi SADECE beyaz için kaydedilir/);
  const d2 = o.g.at(-1).govde.reply_markup.inline_keyboard.flat();
  await bas(o, MURAT, d2.find((x) => /^pa:o:/.test(x.callback_data)).callback_data);
  assert.match(o.g.at(-1).govde.text, /Önce seçin: İçlik/);
});

test("ÖNCE FOTOĞRAF ONAYI: video fotoğraf onaylanmadan üretilmez; istemde ileri yürüyüş + model kuralları; kontrol yön ve kuralları denetler", async () => {
  const o = uretimOrtami();
  o.fotoOto = false;
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "bilekalti", seri: "buyuk", renk: "koyu bordo", anlama: { "koyu bordo": { ust: "seffaf", alt: "opak", iclik: "siyah", onay: 1 } } }));
  await yazi(o, MURAT, "3627 üret");
  await onayla(o, kartId(o.g.at(-1).govde), "hf_kling3", "siyahaltin");
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = Array.from({ length: 6 }, () => K2());
  await cronlar(o, 8);
  assert.equal(o.hfIstek.length, 0); // fotoğraf onayı bekleniyor
  const fk = o.g.filter((x) => x.govde && x.govde.reply_markup && x.govde.reply_markup.inline_keyboard.flat().some((d) => /^pu:f:/.test(d.callback_data))).at(-1);
  assert.match(fk.govde.text, /👁 3627: önce ÖN fotoğraf onayı\. Uygunsa diğer açılar \(sağ yan, sol yan, arka, askıda detay ~0,60 \$\) ve video üretilir: Kling 3\.0 4K \(Higgsfield\) ~1,26 \$/);
  assert.ok(o.g.some((x) => x.metod === "sendPhoto" && /videonun başlangıç fotoğrafı/.test(x.govde.caption || "")));
  const foto = o.falIstek.find((x) => x.uc === "fal-ai/nano-banana-pro/edit");
  assert.match(foto.govde.prompt, /MODEL RULES[\s\S]*OPAQUE lining fabric of the SAME color \(dark burgundy\)[\s\S]*black camisole lining under sheer chiffon/);
  await bas(o, MURAT, fk.govde.reply_markup.inline_keyboard.flat().find((d) => /^pu:f:/.test(d.callback_data)).callback_data);
  await cronlar(o, 10);
  const v = o.hfIstek.find((x) => x.yol === "kling-video/v3.0/4k/image-to-video");
  assert.ok(v, "onaydan sonra video");
  assert.match(v.govde.prompt, /always walks FORWARD toward the camera, never backward[\s\S]*Avoid: [^.]*walking backward, walking away from the camera/);
  const kk = o.claude.filter((x) => JSON.stringify(x.messages).includes("YÖN: model kameraya doğru İLERİ mi yürüyor"));
  assert.ok(kk.length >= 1);
  assert.ok(o.claude.some((x) => JSON.stringify(x.messages).includes("MODEL KURALLARI (bu modele özel, kesin): üst gövde ve kollar şeffaf şifon; etek iki kat")));
});

test("MARKA: Sami'nin deposundan (Vegawin köprüleri) — sadece Black Rose → BLACK ROSE kalıcı, son karede BLACK ROSE; ikisinde de varsa / hiç yoksa Patron'a sorar, tahmin etmez", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  const stokYaz = (magaza, urunler) => o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza, urunler, simdi: 1 }) });
  await stokYaz("BLACKROSE", [{ kod: "3900", adet: 5 }, { kod: "3901", adet: 2 }]);
  await stokYaz("VOLONTE", [{ kod: "3901", adet: 3 }]);
  for (const k of ["3900", "3901", "3902"]) { o.site.push({ kod: k, bedenler: "38-44", fotolar: [`galeri/${k}/1.jpg`] }); o.depo.set(`pelinboy:${k}`, JSON.stringify({ boy: "midi", markaYok: true })); }
  const { markaSor } = await import("./pelin.js");
  assert.equal((await markaSor(o.env, "3900")).marka, "BLACKROSE");
  assert.equal((await markaSor(o.env, "3901")).marka, null);
  assert.match((await markaSor(o.env, "3901")).neden, /iki markanın Vegawin'inde de var/);
  assert.match((await markaSor(o.env, "3902")).neden, /iki markanın Vegawin'inde de yok/);
  await yazi(o, MURAT, "3900 üret");
  assert.equal(JSON.parse(o.depo.get("pelinboy:3900")).marka, "BLACKROSE");
  const kart = o.g.at(-1).govde;
  assert.match(kart.text, /^🏷 Marka: 3900 = BLACK ROSE \(son karede bu yazar\)/);
  await onayla(o, kartId(kart), "hf_kling4", "siyahaltin");
  o.yaziCevap.kod = "3900";
  o.claude.cevaplar = Array.from({ length: 4 }, () => K2());
  await cronlar(o, 10);
  const v = o.hfIstek.find((x) => /kling-video/.test(x.yol));
  assert.match(v.govde.prompt, /SILVER-WHITE text "BLACK ROSE"[\s\S]*model code "3900"/);
  assert.ok(!/"VOLONTE"/.test(v.govde.prompt));
  assert.ok(o.claude.some((x) => JSON.stringify(x.messages).includes('\\"BLACK ROSE\\" yazısı doğru yazılmış')));
  // belirsiz: Patron'a sorulur
  await yazi(o, MURAT, "3901 üret");
  const soru = o.g.at(-1).govde;
  assert.match(soru.text, /🏷 3901 hangi markanın\? Sami'nin deposu: kod iki markanın Vegawin'inde de var\. Tahmin etmiyorum/);
  await bas(o, MURAT, soru.reply_markup.inline_keyboard[0][0].callback_data); // VOLONTE
  assert.equal(JSON.parse(o.depo.get("pelinboy:3901")).marka, "VOLONTE");
  assert.match(o.g.filter((x) => x.metod === "sendMessage").at(-1).govde.text, /🏷 Marka: 3901 = VOLONTE/);
});

test("FOTOĞRAF SETİ + yere 2-3 cm boy + akıcı geçiş; kötü video KENDİ KENDİNE yeniden üretilmez (Patron'a sorar); günlük harcama özeti", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: ["galeri/3627/1.jpg", "galeri/3627/2.jpg"] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "yerustu", seri: "buyuk", renk: "koyu bordo", marka: "BLACKROSE", anlama: { "koyu bordo": { ust: "seffaf", alt: "opak", iclik: "siyah", onay: 1 } } }));
  await yazi(o, MURAT, "3627 üret");
  assert.match(o.g.at(-1).govde.text, /Boy: 3627 yere 2-3 cm \(yerden 2-3 cm yukarıda, bilekleri örter, sadece ayakkabı uçları görünür, yere asla değmez\)/);
  const kid = kartId(o.g.at(-1).govde);
  await bas(o, MURAT, `pc:a:${kid}:hf_kling4`);
  assert.match(o.g.filter((x) => x.metod === "editMessageText").at(-1).govde.text, /Fotoğraf seti: sağ yan, sol yan, arka, askıda detay \(ön onaylanınca\): 0,60 \$/);
  await onayla(o, kid, null, "siyahaltin");
  o.yaziCevap.kod = "3627";
  o.claude.cevaplar = [K2(), K2({ renk_buyuk_fark: true, puan: 4, buyuk_sorunlar: ["model kuralı: etek şeffaf"] })];
  await cronlar(o, 16);
  const on = uretimEdit(o)[0];
  assert.match(on.govde.prompt, /^LENGTH RULE[\s\S]*the hem ends 2-3 cm above the floor, covering the ankles, only the shoe tips visible; the dress NEVER touches the floor/);
  const set = o.falIstek.filter((x) => x.uc === "fal-ai/nano-banana-pro/edit" && /now photographed from|hanging on an elegant wooden hanger/.test(x.govde.prompt));
  assert.equal(set.length, 4);
  assert.ok(set.some((x) => /RIGHT side/.test(x.govde.prompt)) && set.some((x) => /LEFT side/.test(x.govde.prompt)) && set.some((x) => /from BEHIND/.test(x.govde.prompt)));
  const aski = set.find((x) => /hanger/.test(x.govde.prompt));
  assert.ok(!aski.govde.image_urls.some((u) => /dosya\/c{32}/.test(u))); // askıda detayda yüz yok
  assert.ok(o.g.some((x) => x.metod === "sendMediaGroup" && x.govde.media.map((m) => m.caption).join("|") === "3627 · ön|3627 · sağ yan|3627 · sol yan|3627 · arka|3627 · askıda detay"));
  const v = o.hfIstek.filter((x) => /kling-video/.test(x.yol));
  assert.equal(v.length, 1); // kontrol geçmedi ama YENİDEN ÜRETİLMEDİ
  assert.match(v[0].govde.prompt, /shoe tips peek out below the hem and the hem never touches the floor[\s\S]*SILVER-WHITE text "BLACK ROSE"[\s\S]*Stable, consistent, no morphing, smooth natural motion/);
  assert.match(v[0].govde.prompt, /Avoid: [^.]*morphing, warping, melting fabric/);
  const uyari = o.g.find((x) => /⚠️ 3627/.test(x.govde.text || ""));
  assert.match(uyari.govde.text, /model kuralı: etek şeffaf/);
  const gun = new Date((Math.floor(Date.now() / 1000) + 3 * 3600) * 1000).toISOString().slice(0, 10);
  assert.ok(Number(o.depo.get(`pelin-gun:${gun}`)) > 1); // günlük harcama kaydı
});

test("AYNA: Pelin işleri KV'ye (sadece değişince); MARKA RAPORU: VOLONTE sitesinde/kanalında BLACK ROSE kodları SADECE raporlanır", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:secim", SECIM_ROLLU());
  const stokYaz = (magaza, urunler) => o.env.STOK.get().fetch("https://stok/yaz", { method: "POST", body: JSON.stringify({ magaza, urunler, simdi: 1 }) });
  await stokYaz("BLACKROSE", [{ kod: "3627", adet: 5 }, { kod: "3601", adet: 1 }]);
  await stokYaz("VOLONTE", [{ kod: "3557", adet: 3 }, { kod: "3601", adet: 1 }]);
  o.site.push({ kod: "3627", bedenler: "38-50", fotolar: [] }, { kod: "3557", bedenler: "38-44", fotolar: [] }, { kod: "3601", bedenler: "38-44", fotolar: [] });
  o.depo.set("pelinboy:3627", JSON.stringify({ boy: "midi", marka: "VOLONTE" })); // yanlış kart
  o.depo.set("pelin:is:3557-a", JSON.stringify({ id: "3557-a", kod: "3557", durum: "video_bekle", arac: "hf_kling4", maliyet: 1.4, zaman: Math.floor(Date.now() / 1000), gecmis: [[1, "video gönderildi"]] }));
  o.depo.set("pelin:isler", JSON.stringify(["3557-a"]));
  o.env.KAYIT.list = async ({ prefix }) => ({ keys: [...o.depo.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) });
  o.depo.set("venom:pelinMarkaRapor", "1");
  o.falSonuc["kling/v4/image-to-video"] = () => ({ status: "IN_PROGRESS" });
  await cronlar(o, 2);
  const ayna = JSON.parse(o.depo.get("venom:pelinDurum"));
  assert.equal(ayna.calisan, 1);
  assert.equal(ayna.isler[0].kod, "3557");
  assert.equal(ayna.isler[0].aracAd, "Kling 4.0 1080p (Higgsfield)");
  const r = JSON.parse(o.depo.get("venom:pelinMarkaRaporSonuc"));
  assert.deepEqual(r.siteBlackRose, ["3627"]);
  assert.deepEqual(r.siteBelirsiz, ["3601:BLACKROSE+VOLONTE"]);
  assert.deepEqual(r.kartYanlis, ["3627: kart VOLONTE, depo BLACKROSE"]);
  assert.match(r.not, /SADECE RAPOR/);
  assert.equal(JSON.parse(o.depo.get("pelinboy:3627")).marka, "VOLONTE"); // hiçbir şey değiştirilmedi
});

test("DENEME videosunda '✅ Yine de onayla' hata vermez: beğenildi olarak saklanır, yayına gitmez", async () => {
  const o = uretimOrtami();
  o.depo.set("pelin:is:3627-d", JSON.stringify({ id: "3627-d", kod: "3627", durum: "uyari", foto: "f", video: "v", yayinYok: true, sorunlar: ["x"], gecmis: [] }));
  await bas(o, MURAT, "pu:a:3627-d");
  assert.equal(JSON.parse(o.depo.get("pelin:is:3627-d")).durum, "deneme_begenildi");
  assert.equal((await teslim(o)).length, 0);
  assert.ok(!o.depo.get("pelin:hata"));
});
