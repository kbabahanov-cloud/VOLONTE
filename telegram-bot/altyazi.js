// Kanal alt yazısı önerisi: 🆕/🔁 etiketi + CODE + bedenler + TR/EN/FR/PT kısa satış metni.
// Yapay zekâ sadece 4 dildeki kısa metni yazar; kod, beden, fiyat ve iletişim satırları eski
// alt yazıdan aynen alınır (uydurma olmasın, kod satırı kaybolmasın). Onaysız değişmez.

import Anthropic from "@anthropic-ai/sdk";
import { sinirAsildiMi, harcamaEkle, SINIR_MESAJI } from "./harcama.js";

export const ETIKET = { yeni: "🆕 Yeni geldi", repete: "🔁 Repete geldi" };
const TELEGRAM_SINIR = 1024;

// Eski alt yazıdan korunacak satırlar.
export function eskiBilgiler(metin) {
  const satirlar = String(metin || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const temiz = (s) => s.replace(/^[✅☑️✔️•\-\s]+/u, "").trim();
  const beden = satirlar.find((s) => /\b(size|taille|beden|tamanho|размер)\b|\b\d{2}\s*[-/]\s*\d{2}\b/i.test(s) && !/wa\.me|tel/i.test(s));
  const fiyat = satirlar.find((s) => /(price|prix|preço|fiyat|цена)/i.test(s) && /\d/.test(s));
  const iletisim = satirlar.filter((s) => /wa\.me|whatsapp|📞|tel\b/i.test(s));
  return { beden: beden ? temiz(beden) : null, fiyat: fiyat ? temiz(fiyat) : null, iletisim };
}

// Beden grupları (kullanıcı kararı, 22 Ekim): 44 iki grupta da var.
export const BEDEN_GRUPLARI = {
  k: { ad: "Küçük", bedenler: "38-40-42-44" },
  b: { ad: "Büyük", bedenler: "44-46-48-50" },
  i: { ad: "İkisi de", bedenler: "38-40-42-44-46-48-50" },
};
const BEDEN_SATIRI = /\b(size|taille|beden|tamanho|размер)\b|\b\d{2}\s*[-/]\s*\d{2}\b/i;

// Alt yazıdaki bedenden öneri: hepsi ≤44 → Küçük, hepsi ≥44 → Büyük, ikisine yayılıyorsa İkisi de.
export function bedenOnerisi(metin) {
  const b = eskiBilgiler(metin).beden;
  if (!b) return null;
  const sayilar = (b.match(/\b\d{2}\b/g) || []).map(Number).filter((n) => n >= 32 && n <= 60);
  if (sayilar.length) {
    const en = Math.min(...sayilar);
    const ek = Math.max(...sayilar);
    return ek <= 44 ? "k" : en >= 44 ? "b" : "i";
  }
  const harf = (b.match(/\b(XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)\b/gi) || []).map((x) => x.toUpperCase());
  if (!harf.length) return null;
  const buyuk = harf.some((x) => /XL/.test(x));
  const kucuk = harf.some((x) => !/XL/.test(x));
  return buyuk && kucuk ? "i" : buyuk ? "b" : "k";
}

// Alt yazının beden satırını seçilen grupla değiştirir (yoksa CODE satırının altına ekler).
export function bedenYaz(metin, grup) {
  const g = BEDEN_GRUPLARI[grup];
  if (!g) return metin;
  const satir = `📏 SIZE: ${g.bedenler}`;
  const satirlar = String(metin || "").split("\n");
  const i = satirlar.findIndex((s) => BEDEN_SATIRI.test(s) && !/wa\.me|tel/i.test(s));
  if (i >= 0) satirlar[i] = satir;
  else {
    const kod = satirlar.findIndex((s) => /CODE/i.test(s));
    satirlar.splice(kod >= 0 ? kod + 1 : 0, 0, satir);
  }
  return satirlar.join("\n").slice(0, TELEGRAM_SINIR);
}

export function altyaziBirlestir({ etiket, kod, eski, diller }) {
  const b = eskiBilgiler(eski);
  const ust = [etiket, `✅ CODE.${kod}`];
  if (b.beden) ust.push(`📏 ${b.beden.replace(/^(size|taille|beden|tamanho)\s*[.:]*\s*/i, "SIZE: ")}`);
  if (b.fiyat) ust.push(`💲 ${b.fiyat}`);
  const dil = [`🇹🇷 ${diller.tr}`, `🇬🇧 ${diller.en}`, `🇫🇷 ${diller.fr}`, `🇵🇹 ${diller.pt}`];
  const alt = b.iletisim;
  let metin = [...ust, "", ...dil, ...(alt.length ? ["", ...alt] : [])].join("\n");
  if (metin.length > TELEGRAM_SINIR) metin = [...ust, "", ...dil].join("\n").slice(0, TELEGRAM_SINIR);
  return metin;
}

export async function altyaziOlustur(env, { kod, eski, tarif, etiket }) {
  if (await sinirAsildiMi(env)) throw new Error(SINIR_MESAJI);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 50_000 });
  const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const response = await client.beta.messages.create({
    model,
    max_tokens: 1500,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { tr: { type: "string" }, en: { type: "string" }, fr: { type: "string" }, pt: { type: "string" } },
          required: ["tr", "en", "fr", "pt"],
          additionalProperties: false,
        },
      },
    },
    messages: [{
      role: "user",
      content: `VOLONTE, İstanbul Laleli'de kaliteli kadın giyimi üreten bir toptan markası; müşterileri çoğunlukla Afrika'dan ve dünyadan toptancı kadınlar. Telegram kanalındaki bir model için 4 dilde kısa satış metni yaz.

Model kodu: ${kod}
Durum: ${etiket}
Model tarifi (fotoğraftan): ${tarif || "yok"}
Eski alt yazı: ${eski || "yok"}

Kurallar: her dil için tek cümle, en fazla 110 karakter; modern, şık, kaliteyi ve modeli öne çıkaran, abartısız; fiyat, beden, telefon, kod yazma (onları ben eklerim); emoji koyma; uydurma özellik ekleme (sadece tarif ve eski yazıdaki bilgiler). tr: Türkçe, en: İngilizce, fr: Fransızca, pt: Portekizce.`,
    }],
  });
  await harcamaEkle(env, model, response.usage);
  if (response.stop_reason === "refusal") throw new Error("model isteği reddetti");
  const d = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  const kisa = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return altyaziBirlestir({ etiket, kod, eski, diller: { tr: kisa(d.tr), en: kisa(d.en), fr: kisa(d.fr), pt: kisa(d.pt) } });
}
