// Fotoğraftan model tanıma (Kemal).
//
// 1) Katalog (bir kerelik + yeni paylaşımlar): her modelin kanal fotoğrafı gizli
//    "Kemal arşiv" kanalına iletilir (bot fotoğrafı ancak böyle indirebilir), küçük
//    boyutu (~320 px) Claude'a verilir ve kısa bir tarif yazdırılır → KV "tarifler".
// 2) Tanıma: müşteri fotoğrafı + tarif listesi → en yakın 5 aday; sonra müşteri
//    fotoğrafı adayların fotoğraflarıyla yan yana karşılaştırılır → sonuç ve güven.

import Anthropic from "@anthropic-ai/sdk";
import { sinirAsildiMi, harcamaEkle, SINIR_MESAJI } from "./harcama.js";

const VARSAYILAN_MODEL = "claude-opus-5-5";

export function base64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

// Telegram mesajındaki görselin istenen genişliğe en yakın (en az o kadar) boyutu.
export function medyaDosyasi(msg, hedef) {
  const boyutlar = msg.photo
    || (msg.video && (msg.video.thumbnail || msg.video.thumb) && [msg.video.thumbnail || msg.video.thumb])
    || (msg.document && /^image\//.test(msg.document.mime_type || "") && [{ file_id: msg.document.file_id, width: 99999 }])
    || (msg.animation && (msg.animation.thumbnail || msg.animation.thumb) && [msg.animation.thumbnail || msg.animation.thumb]);
  if (!boyutlar || !boyutlar.length) return null;
  const sirali = [...boyutlar].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sirali.find((p) => (p.width || 0) >= hedef) || sirali[sirali.length - 1]).file_id;
}

export async function dosyaIndir(env, tg, fileId) {
  const f = await tg("getFile", { file_id: fileId });
  if (!f.ok) throw new Error(`getFile: ${f.description}`);
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`);
  if (!r.ok) throw new Error(`indirme: ${r.status}`);
  return base64(await r.arrayBuffer());
}

const gorsel = (data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });

async function jsonIste(env, { system, content, schema, maxTokens = 2000, model: secilenModel }) {
  if (await sinirAsildiMi(env)) throw new Error(SINIR_MESAJI);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 50_000 });
  const model = secilenModel || env.ANTHROPIC_MODEL || VARSAYILAN_MODEL;
  const response = await client.beta.messages.create({
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    ...(system ? { system } : {}),
    messages: [{ role: "user", content }],
  });
  await harcamaEkle(env, model, response.usage);
  if (response.stop_reason === "refusal") throw new Error("model isteği reddetti");
  const metin = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(metin);
}

// Katalog: [{kimlik, b64}] → { kimlik: tarif }
export async function tarifle(env, gorseller) {
  const content = [];
  for (const g of gorseller) {
    content.push({ type: "text", text: `Görsel — kimlik: ${g.kimlik}` }, gorsel(g.b64));
  }
  content.push({
    type: "text",
    text: "Bunlar VOLONTE kadın giyim kanalındaki model fotoğrafları. Her görsel için, başka fotoğraflarla karşılaştırırken işe yarayacak kısa bir Türkçe tarif yaz (en fazla 20 kelime): ürün türü (elbise, takım, ceket, abaya...), renk(ler), desen, kesim/boy, ayırt edici detaylar (yaka, kol, kemer, taş, fırfır). Görselde kıyafet yoksa 'kıyafet yok' yaz. Kimlikleri aynen kullan.",
  });
  const sonuc = await jsonIste(env, {
    content,
    schema: {
      type: "object",
      properties: {
        tarifler: {
          type: "array",
          items: { type: "object", properties: { kimlik: { type: "string" }, tarif: { type: "string" } }, required: ["kimlik", "tarif"], additionalProperties: false },
        },
      },
      required: ["tarifler"],
      additionalProperties: false,
    },
  });
  const cikti = {};
  for (const t of sonuc.tarifler || []) if (gorseller.some((g) => g.kimlik === t.kimlik)) cikti[t.kimlik] = String(t.tarif).slice(0, 200);
  return cikti;
}

// Adım 1: tarif listesinden en yakın adaylar.
export async function adaySec(env, musteriB64, katalogSatirlari, ipucu, model) {
  const sonuc = await jsonIste(env, {
    system: [{
      type: "text",
      text: `VOLONTE kanalındaki modellerin tarif listesi (kimlik | tarif):\n${katalogSatirlari.join("\n")}`,
      cache_control: { type: "ephemeral" },
    }],
    content: [
      gorsel(musteriB64),
      { type: "text", text: `Bu fotoğraf bir müşteriden geldi${ipucu ? ` (not: ${ipucu})` : ""}. Fotoğraftaki kıyafete listede en çok benzeyen en fazla 5 kimliği, en benzer önce olacak şekilde seç. Sadece listedeki kimlikleri kullan. Fotoğrafta kıyafet yoksa boş liste ver.` },
    ],
    schema: {
      type: "object",
      properties: { adaylar: { type: "array", items: { type: "string" } } },
      required: ["adaylar"],
      additionalProperties: false,
    },
    maxTokens: 1000,
    model,
  });
  return (sonuc.adaylar || []).slice(0, 5);
}

// Adım 2: müşteri fotoğrafı adayların gerçek fotoğraflarıyla karşılaştırılır.
export async function karsilastir(env, musteriB64, adaylar, ipucu, model) {
  const content = [{ type: "text", text: "Müşteri fotoğrafı:" }, gorsel(musteriB64)];
  for (const a of adaylar) content.push({ type: "text", text: `Aday — kimlik: ${a.kimlik}` }, gorsel(a.b64));
  content.push({
    type: "text",
    text: `Müşteri fotoğrafındaki kıyafet hangi adayla aynı model?${ipucu ? ` (not: ${ipucu})` : ""} Aynı kesim/desen ama farklı renk de aynı model sayılır; bunu açıklamada belirt. en_iyi: aynı model olduğuna inandığın kimlik (hiçbiri değilse boş). guven: yuksek (neredeyse kesin), orta, dusuk. siralama: adayları benzerliğe göre sırala. aciklama: en fazla 2 kısa Türkçe cümle.`,
  });
  return jsonIste(env, {
    content,
    schema: {
      type: "object",
      properties: {
        en_iyi: { type: "string" },
        guven: { type: "string", enum: ["yuksek", "orta", "dusuk"] },
        siralama: { type: "array", items: { type: "string" } },
        aciklama: { type: "string" },
      },
      required: ["en_iyi", "guven", "siralama", "aciklama"],
      additionalProperties: false,
    },
    maxTokens: 1000,
    model,
  });
}

export async function dosyaBaytIndir(env, tg, fileId) {
  const f = await tg("getFile", { file_id: fileId });
  if (!f.ok) throw new Error(`getFile: ${f.description}`);
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`);
  if (!r.ok) throw new Error(`indirme: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
