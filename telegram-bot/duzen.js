// KEMAL — YENİ KANAL DÜZENİ (kullanıcı kararı, 29 Ekim)
//
// Her paylaşım aynı sırayla: durum etiketi, kalın CODE, renkler, beden, seri, (biliniyorsa) kumaş,
// tek satır İngilizce + tek satır Fransızca, imza. FİYAT ASLA YAZILMAZ. Türkçe/Portekizce yok.
// Numaralar ve site tıklanabilir düğme (yazı olarak değil). Medya siteden (galeri/ + Selin videoları);
// eski kanal alt yazıları kullanılmaz.
// Model seçimi: stokta + sitede + en az 14 gündür Telegram'da paylaşılmamış; en uzun süredir paylaşılmayan önce.
// Telegram son paylaşım tarihi Sami'nin deposunda (StokDO "tg" tablosu) — stok tablosunda sütun olarak görünür.

import Anthropic from "@anthropic-ai/sdk";
import { sinirAsildiMi, harcamaEkle, SINIR_MESAJI } from "./harcama.js";

export const SITE = "https://kbabahanov-cloud.github.io/VOLONTE/";
export const SITE_VERI = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/main/veri/urunler.json";
export const VIDEO_SUNUCU = "https://volonte-selin.volonte.workers.dev/v2/";
export const SIPARIS_WA = "https://wa.me/905362390091";
export const BILGI_WA = "https://wa.me/905363448488";
export const IMZA = "VOLONTE – Premium Women's Fashion";
export const PAYLASIM_ARASI_GUN = 14; // aynı model 14 gün dolmadan tekrar önerilmez
export const YENI_GUN = 21; // ilk Telegram paylaşımı bu kadar günden yeniyse (ya da hiç yoksa) 🆕
export const DONUS_GUN = 14; // stok bu kadar gün içinde 0'dan geri geldiyse 🔁
export const COK_SATAN_GUN = 14; // çok satan: son 14 günün satışı
export const COK_SATAN_EN_AZ = 12; // ...en az 12 adet (3 seri) ve ilk 10 içinde
export const SON_SERI_KAT = 2; // stok ≤ 2 seri → ⚡ (adet yazılmaz)
const ALBUM_EN_FAZLA = 10;

// Durum etiketleri (en başta). "hazir": dört etikete uymayan model için (eski kanaldaki "AVAILABLE" gibi).
export const DURUMLAR = {
  yeni: "🆕 NEW / NOUVEAU",
  donus: "🔁 BACK IN STOCK / DE RETOUR",
  cok: "🔥 BEST SELLER",
  son: "⚡ LAST SERIES / DERNIÈRES SÉRIES",
  hazir: "✅ AVAILABLE / DISPONIBLE",
};
export const DURUM_AD = { yeni: "Yeni", donus: "Stoğa döndü", cok: "Çok satan", son: "Son seriler", hazir: "Mevcut" };

const KUCUK = [38, 40, 42, 44];
const BUYUK = [44, 46, 48, 50];

// Beden grubundan beden satırı ve seri adedi. "38-...-50" iki seri grubudur (Küçük + Büyük), seri yine 4'lü.
export function seriBilgisi(bedenler) {
  const sayilar = (String(bedenler || "").match(/\d{2}/g) || []).map(Number);
  if (!sayilar.length) return null;
  const hepsi = (g) => g.every((n) => sayilar.includes(n));
  if (hepsi(KUCUK) && hepsi(BUYUK)) return { beden: `${KUCUK.join("-")} / ${BUYUK.join("-")}`, adet: 4 };
  return { beden: sayilar.join("-"), adet: sayilar.length };
}

// "38-40-42-44" Telegram'da telefon numarası sanılıp mavi link oluyor: her "-" sonrasına görünmez boşluk (U+200B)
// konur, rakam dizisi bölünür; görünüş aynı kalır.
export const linksiz = (beden) => String(beden).replace(/-(?=\d)/g, "-\u200B");

const html = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Alt yazı (Telegram HTML). Renk emin değilse (onaylanmamışsa) renk satırı konmaz; kumaş bilinmiyorsa satır yok.
export function altYazi(p) {
  const seri = seriBilgisi(p.bedenler);
  const satirlar = [DURUMLAR[p.durum] || DURUMLAR.hazir, `<b>✅ CODE: ${html(p.kod)}</b>`];
  if (p.renkler && p.renkler.length && p.renkEmin) satirlar.push(`🎨 Colors / Couleurs: ${html(p.renkler.join(", "))}`);
  if (seri) satirlar.push(`📏 Size: ${linksiz(seri.beden)}`, `📦 Series: ${seri.adet} pcs / Série : ${seri.adet} pièces`);
  if (p.kumas) satirlar.push(`🧵 Fabric / Tissu: ${html(p.kumas)}`);
  if (p.en) satirlar.push(`🇬🇧 ${html(p.en)}`);
  if (p.fr) satirlar.push(`🇫🇷 ${html(p.fr)}`);
  satirlar.push(IMZA);
  return satirlar.join("\n");
}

// Tıklanabilir düğmeler (kanal paylaşımının altında).
export function dugmeler() {
  return { inline_keyboard: [
    // "Order / Commande" yan yana iki düğmede telefonda kesiliyordu → kısa ad (kullanıcı kararı 29 Ekim).
    [{ text: "🛒 Order", url: SIPARIS_WA }, { text: "📞 Info", url: BILGI_WA }],
    [{ text: "🌐 All models / Tous les modèles", url: SITE }],
  ] };
}
export const albumNotu = (kod) => `👆 <b>CODE: ${html(kod)}</b>`;

// Sitedeki ürünün medyası: fotoğraflar (galeri/) + Selin videoları (/v2/<kod>/<n>). En fazla 10.
export function siteMedyasi(u) {
  const foto = (u.fotolar || []).map((f) => ({ type: "photo", media: SITE + String(f).replace(/^\//, "") }));
  const video = (u.videolar || []).map((v) => String(v).match(/^selin\/(\d{3,6})\/(\d+)$/)).filter(Boolean)
    .map((m) => ({ type: "video", media: `${VIDEO_SUNUCU}${m[1]}/${m[2]}` }));
  // İlk kare fotoğraf (alt yazı orada), sonra videolar, sonra diğer fotoğraflar.
  return [...foto.slice(0, 1), ...video, ...foto.slice(1)].slice(0, ALBUM_EN_FAZLA);
}

// Durum etiketi. Öncelik: stoğa döndü > yeni > son seriler > çok satan > mevcut. Stok adedi yazılmaz.
export function durumSec({ kod, ilkPaylasim, toplam, bedenler, geldiZaman, satislar, simdi }) {
  if (geldiZaman && geldiZaman >= simdi - DONUS_GUN * 86400) return "donus";
  if (!ilkPaylasim || ilkPaylasim >= simdi - YENI_GUN * 86400) return "yeni";
  const seri = seriBilgisi(bedenler);
  if (seri && toplam > 0 && toplam <= SON_SERI_KAT * seri.adet) return "son";
  const sirali = Object.entries(satislar || {}).filter(([, a]) => a >= COK_SATAN_EN_AZ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  if (sirali.includes(kod)) return "cok";
  return "hazir";
}

// Günün modelleri: stokta + sitede + en az 14 gündür paylaşılmamış; en uzun süredir paylaşılmayan önce.
// site: urunler.json; stok: { kod: { toplam, gizli } }; tg: { kod: son paylaşım }; haric: kodlar (sırada/atlanan).
export function gununModelleri({ site, stok, tg, haric = [], simdi, adet = 10 }) {
  const blackRoseSay = Object.keys(stok).length > 0; // stok okunamadıysa (boş) hiçbir model "Black Rose" sayılmaz
  const disari = new Set(haric.map(String));
  return site
    .filter((u) => !u.gizli && (u.fotolar || []).length)
    // Vegawin'de (VOLONTE) kartı olmayan model = Black Rose: köprüsü yok, stok şartı aranmaz (sitede olması yeter).
    .filter((u) => (stok[u.kod] ? stok[u.kod].toplam > 0 && !stok[u.kod].gizli : blackRoseSay))
    .filter((u) => !(tg[u.kod] > simdi - PAYLASIM_ARASI_GUN * 86400))
    .filter((u) => !disari.has(String(u.kod)))
    .sort((a, b) => (tg[a.kod] || 0) - (tg[b.kod] || 0) || String(a.kod).localeCompare(String(b.kod), "tr", { numeric: true }))
    .slice(0, adet);
}

// Kanal kayıtlarından (kodlar + botun paylaşımları) her kodun ilk ve son Telegram paylaşımı.
export function telegramTarihleri(kodlar, sonpaylasim = {}) {
  const son = {};
  const ilk = {};
  for (const [kod, liste] of Object.entries(kodlar || {})) {
    for (const g of liste || []) {
      if (!g.tarih) continue;
      son[kod] = Math.max(son[kod] || 0, g.tarih);
      ilk[kod] = Math.min(ilk[kod] || Infinity, g.tarih);
    }
  }
  for (const [kod, t] of Object.entries(sonpaylasim || {})) if (!/^~/.test(kod)) son[kod] = Math.max(son[kod] || 0, t);
  return { son, ilk };
}

// ✏️ Düzelt metni: "renk: black, beige" / "kumaş: chiffon" / "durum: new" / "en: ..." / "fr: ...".
const DURUM_SOZLUK = { yeni: "yeni", new: "yeni", nouveau: "yeni", back: "donus", donus: "donus", "dönüş": "donus", repete: "donus", retour: "donus",
  best: "cok", "çok": "cok", cok: "cok", "çoksatan": "cok", coksatan: "cok", last: "son", son: "son", available: "hazir", hazir: "hazir", "hazır": "hazir", mevcut: "hazir" };
export function duzeltmeCoz(metin) {
  const sonuc = {};
  for (const ham of String(metin || "").split("\n")) {
    const m = ham.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const anahtar = m[1].toLocaleLowerCase("tr").replace(/\s+/g, "");
    const deger = m[2].trim();
    if (/^(renk|renkler|color|colors|couleurs?)$/.test(anahtar)) sonuc.renkler = deger.split(/[,،;]+/).map((x) => x.trim()).filter(Boolean);
    else if (/^(kumaş|kumas|fabric|tissu)$/.test(anahtar)) sonuc.kumas = /^(yok|-|sil|none)$/i.test(deger) ? null : deger;
    else if (/^(durum|etiket|status)$/.test(anahtar)) {
      const d = DURUM_SOZLUK[deger.toLocaleLowerCase("tr").replace(/\s+/g, "").split(/[/(]/)[0]];
      if (d) sonuc.durum = d;
    } else if (/^(en|ingilizce|english|🇬🇧)$/.test(anahtar)) sonuc.en = deger.slice(0, 160);
    else if (/^(fr|fransızca|fransizca|french|🇫🇷)$/.test(anahtar)) sonuc.fr = deger.slice(0, 160);
  }
  return sonuc;
}
export const DUZELT_ORNEK = [
  "Sadece değişen satırı yazmanız yeterli. Örnek:",
  "renk: black, beige, multicolor",
  "kumaş: chiffon   (bilinmiyorsa: kumaş: yok)",
  "durum: new | back | best | last | available",
  "en: Elegant ruffled kimono set.",
  "fr: Ensemble kimono élégant à volants.",
].join("\n");

// Fotoğraflardan renkler + tek satır EN/FR (yapay zekâ). Fiyat, kumaş, beden YAZMAZ (kumaş uydurulmaz).
// Bir model için bir kez hazırlanır ve saklanır (Düzelt ile değişir).
export async function yaziHazirla(env, u) {
  if (await sinirAsildiMi(env)) throw new Error(SINIR_MESAJI);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 90_000 });
  const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const fotolar = (u.fotolar || []).slice(0, 6).map((f) => SITE + String(f).replace(/^\//, ""));
  const videoSayisi = (u.videolar || []).length;
  const response = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            renkler: { type: "array", items: { type: "string" } },
            renk_emin: { type: "boolean" },
            renk_notu: { type: "string" },
            en: { type: "string" },
            fr: { type: "string" },
          },
          required: ["renkler", "renk_emin", "renk_notu", "en", "fr"],
          additionalProperties: false,
        },
      },
    },
    messages: [{
      role: "user",
      content: [
        ...fotolar.map((url) => ({ type: "image", source: { type: "url", url } })),
        {
          type: "text",
          text: `VOLONTE is a quality women's wholesale fashion brand from Istanbul (customers: mostly African women and wholesalers worldwide). These are the website photos of model ${u.kod} ("${u.baslik || ""}").
Site description: ${(u.aciklama && u.aciklama.en) || "none"}

1) renkler: list EVERY colour variant of this garment that appears in the photos, in simple English (e.g. "black", "beige", "orange-brown", "pink-blue", "multicolor"). If the same model appears in several colours, list each one. A printed fabric is one variant described by its main colours (e.g. "black-gold floral"). Ignore the background, mannequin and accessories.
2) renk_emin: true only if you are certain about every colour (lighting, filters or very similar shades make you unsure → false). Do not guess.
3) renk_notu: in Turkish, one short sentence: what you are unsure about (empty if certain).${videoSayisi ? ` Note: this model also has ${videoSayisi} video(s) you cannot see; mention in Turkish that the video may show other colours.` : ""}
4) en: ONE short English line (max 60 characters) describing the model, elegant and modern, ending with a full stop. No price, size, code, fabric, emoji or phone.
5) fr: the same line in natural French (max 70 characters).
Never mention any brand or collection name (e.g. text printed on the photos) in en/fr.`,
        },
      ],
    }],
  });
  await harcamaEkle(env, model, response.usage);
  if (response.stop_reason === "refusal") throw new Error("model isteği reddetti");
  const d = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  const kisa = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
  return {
    renkler: (d.renkler || []).map((r) => kisa(r, 40).toLowerCase()).filter(Boolean).slice(0, 12),
    renkEmin: Boolean(d.renk_emin) && (d.renkler || []).length > 0,
    renkNotu: kisa(d.renk_notu, 200),
    en: kisa(d.en, 120),
    fr: kisa(d.fr, 140),
    zaman: Math.floor(Date.now() / 1000),
  };
}

// Repete bildirimindeki Türkçe renkler → İngilizce (kanal yazısı için). Bilinmeyen renk varsa null (uydurulmaz).
const RENK_SOZLUK = {
  siyah: "black", beyaz: "white", bej: "beige", krem: "cream", ekru: "ecru", "kırmızı": "red", kirmizi: "red", bordo: "burgundy",
  lacivert: "navy", mavi: "blue", "açık mavi": "light blue", "bebe mavi": "baby blue", "yeşil": "green", yesil: "green", haki: "khaki",
  "zümrüt": "emerald", mint: "mint", pembe: "pink", pudra: "powder pink", "fuşya": "fuchsia", fusya: "fuchsia", mor: "purple", lila: "lilac",
  gri: "grey", antrasit: "anthracite", kahve: "brown", kahverengi: "brown", "açık kahve": "light brown", vizon: "mink", taba: "tan",
  camel: "camel", "sarı": "yellow", sari: "yellow", hardal: "mustard", turuncu: "orange", somon: "salmon", mercan: "coral",
  gold: "gold", "altın": "gold", "gümüş": "silver", gumus: "silver", petrol: "teal", indigo: "indigo", "çok renkli": "multicolor", desenli: "multicolor",
};
export function renkCevir(renkler) {
  const sonuc = [];
  for (const r of renkler || []) {
    const ad = String(r || "").toLocaleLowerCase("tr").trim();
    const en = RENK_SOZLUK[ad];
    if (!en) return null;
    if (!sonuc.includes(en)) sonuc.push(en);
  }
  return sonuc.length ? sonuc : null;
}
