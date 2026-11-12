// FABRİKA EKSİK LİSTESİ (Sayım Sami, kullanıcı kararı 29 Ekim)
//  (30 Ekim kuralı) Günün ilk satışı gelince izlenir; satış listesi 10 dakika değişmezse giriş bitti sayılır ve liste
//  saat kaç olursa olsun Hemra'ya gider (sadece VOLONTE mağazası; Black Rose ayrı akış). Günde tek liste; sonradan yeni
//  model satılırsa sadece yeni modeller "ek" olarak sorulur. Satış yoksa liste gitmez. o gün satılan modeller (belge tipi 21,
//  köprü sadece okur): kod, bugün satılan, stokta kalan → Hemra'ya.
//          "Fabrikaya ne isteyelim? Renkleriyle yazın" (daha önce yazılan renkler hazır sorulur).
//  Hemra yazar → Sami düzgün listeye çevirir → ✅ Onayla / ✏️ Düzelt.
//  Onay → fabrikadaki kişilere (Murat'ın onayladığı Nuri, Sinem, Fuat) SADECE kod, renk, adet; Murat'a bilgi kopyası.
//  Liste gidişinden 1 saat sonra onay yoksa Hemra'ya hatırlatma; 2 saat sonra hâlâ yoksa Murat'a "Hemra onaylamadı".
//  Fabrika kişileri /start yazınca Murat'a sorulur; eklenen kişi sadece listeyi alır, başka komut kullanamaz.
//  Satış verisi "sami:satisAcik" = "1" olana kadar kullanılmaz (köprünün satış okuması denemeyle doğrulanınca açılır).

import { kayitliKisiler, kartKodu } from "./kart-takip.js";
import { kagitAcik } from "./gorev-kagidi.js";
import { defterIs, defterCevap } from "./is-defteri.js";
import { mesaiMi, isGunuSuresi, GUNCEL } from "./kart-tekrar.js";
import { MOD_SATIR, modAcik, modOku, denemeKaydiMi } from "./deneme-modu.js";
import { stokIste } from "./stokbot.js";
import { siteVerisi, SITE_ADRESI } from "./depo-oku.js";
import { indirimliMi, INDIRIMLI, celalKoduMu } from "./stok.js";
import { patronMu, silKuyrugu, geriKuyrugu, magazaStoklari, magazaStogu, STOK_KURALI } from "./sil.js";
import { fuatSuzgec } from "./mutabakat.js";
import { REPETE_EN_AZ } from "./repete-rapor.js";
import { acikRepete, engelMetni, rkGeldi, rkHemradan, dagilimYazi, dagilimAdet, denemeTemizle, modRepeteKapat } from "./repete-kart.js"; // 11 Kasım: repete kartı (kural 43: açık repete varken yeni repete yok)

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const gunGoster = (g) => g.split("-").reverse().join(".");
const SABIT_SN = 600; // satış listesi 10 dakika değişmezse giriş bitti sayılır
const HATIRLATMA_SN = 3600; // Hemra'ya: listenin gidişinden 1 saat sonra
const MURAT_HABER_SN = 7200; // Murat'a: 2 saat sonra
const MAGAZA = "VOLONTE";
// 11 Kasım (Patron, EKSİK LİSTESİ VE REPETE — SON HAL): yeni akış önce DENEME listelerinde çalışır (liste kaydında "yeni");
// gerçek akışa StokDO ayar "akis:yeni" = 1 ile bağlanır (o andan sonra AÇILAN listeler yeni akışla; açık eski listeler eski haliyle biter).
export const yeniAkisAcik = async (env) => { try { return Number((await stokIste(env, "/ayar-oku", { k: "akis:yeni" })).v) === 1; } catch { return false; } };
// Satış kaydı SATIS_BASI'nda başladı: bir yıl dolana kadar "yıllık" yerine dürüstçe "X'ten beri toplam" yazar
export const SATIS_BASI = "2026-10-28";
export const satisSatiri = (s7, yil, simdi = Math.floor(Date.now() / 1000)) => `Satış: son 7 günde ${s7 ?? "—"} · ${simdi - Date.parse(`${SATIS_BASI}T00:00:00Z`) / 1000 >= 365 * 86400 ? `yıllık ${yil ?? "—"}` : `toplam ${yil ?? "—"} (${SATIS_BASI.slice(8)}.${SATIS_BASI.slice(5, 7)}'dan beri; yıllık veri henüz yok)`}`;
const TEST_KOD = /^TEST-\d+$/i; // deneme modeli: fotoğraf yerine "TEST MODELİ — DENEME" resmi (Sami /test-resim.jpg)
// Mağaza başına eksik listesi (kullanıcı kararı 29-30 Ekim): VOLONTE → Hemra, satış girişi bitince (saat şartı yok);
// BLACK ROSE → Merdan, satışlar gün içinde anlık girildiği için 19:05'ten sonra tek liste (gün içinde mesaj yok).
export const MAGAZALAR = [
  { magaza: "VOLONTE", ek: "", ad: "Aziz", etiket: "VOLONTE", basla: null, kime: (env) => String(env.AZIZ_ID || "").split(",")[0].trim() || sorumlu(env) }, // 10 Kasım: kontrol Aziz'de
  { magaza: "BLACKROSE", ek: "-BR", ad: "Merdan", etiket: "Black Rose", basla: 19 + 5 / 60, kime: (env) => String(env.BR_SORUMLU || "") },
];
const kimeOf = (env, d) => (d && d.sorumlu ? String(d.sorumlu) : sorumlu(env));
const cfgOf = (d) => MAGAZALAR.find((c) => c.magaza === ((d && d.magaza) || MAGAZA)) || MAGAZALAR[0];
// Listeyi kim kontrol ediyor (ad): Aziz kayıtlı değilse VOLONTE'de Hemra (eski düzen)
const adOf = (env, d) => (d && d.birlesik ? "Hemra" : d && d.sorumlu && String(d.sorumlu) === sorumlu(env) ? "Hemra" : cfgOf(d).ad);
// İndirimli mal (2000) eksik listesine girmez; satışı Murat'a ayrı satırla gider (indirimliOzet).
const satislarAl = async (env, gun, magaza = MAGAZA) => (await stokIste(env, "/satislar", { gun, magaza })).filter((x) => !indirimliMi(x.kod));
const COK_SATAN = 10; // günde 10+ satan: "🔥 hızlı gidiyor, fazla iste" (sadece Hemra ve Murat görür, fabrikaya gitmez)
const LISTE_PARCA = 20; // Hemra'ya bir çalışmada en fazla model mesajı (Cloudflare istek sınırı)
// 10 Kasım (Patron): bir kişiye aynı anda en fazla 5 kart; kalanlar o kişi cevap verdikçe gelir (toplam sayı başlıkta)
export const ACIK_KART_EN_FAZLA = 5;
const acikKartSayisi = (d) => (d.modeller || []).filter((x) => d.mesajlar && d.mesajlar[x.kod] && !secimTamam(secimNorm(d.secim && d.secim[x.kod]))).length;
const GONDERIM_PARCA = 4; // fabrikaya bir çalışmada en fazla model
const TESLIM_GUNLERI = [1, 2, 3, 5, 7, 10];
const renkYazi = (renkler) => renkler.map((r) => `${r.renk} ${r.adet}`).join(", ");
const gunBasi = (g) => Date.UTC(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10))) / 1000 - SAAT_FARKI;
const pazartesi = (t) => gunAnahtari(t - ((new Date((t + SAAT_FARKI) * 1000).getUTCDay() + 6) % 7) * 86400);
const siteListesi = (env) => siteVerisi(env); // Selin'in iç bağlantısıyla (depo gizli olsa da çalışır)
// 10 Kasım (Patron): gerçek mankenli / askılı fotoğraf öncelikli; yapay zekâ (pelin-) sonra; yazılı kolaj sadece başka fotoğraf yoksa
const fotoSirasi = (f) => (/kolaj|collage|yazi|text/i.test(f) ? 2 : /\/pelin-/.test(f) ? 1 : 0);
const sitedenFoto = (env, site, kod) => {
  if (TEST_KOD.test(String(kod))) return `${env.SELF_URL || "https://volonte-sami.volonte.workers.dev"}/test-resim.jpg`;
  const u = site.find((x) => String(x.kod) === String(kod));
  if (!u || !u.fotolar || !u.fotolar.length) return null;
  const f = [...u.fotolar].sort((a, b) => fotoSirasi(a) - fotoSirasi(b))[0];
  return `${SITE_ADRESI}/img/${f}?w=720`; // 10 Kasım (Patron): telefonda hızlı açılsın — sitenin küçültülmüş kopyası (720 px, sıkıştırılmış)
};
const tamFoto = (u) => String(u || "").replace("/img/galeri/", "/galeri/").replace(/\?w=\d+$/, ""); // küçültülmüş açılmazsa asıl fotoğraf
// 10 Kasım (Patron): VOLONTE ve BLACK ROSE listeleri ASLA karışmaz — her kartta ve başlıkta mağaza adı
export const MAGAZA_BASLIK = { VOLONTE: "🟦 VOLONTE", BLACKROSE: "🌹 BLACK ROSE" };
const magazaAdi = (m) => MAGAZA_BASLIK[m] || MAGAZA_BASLIK.VOLONTE;
const MAGAZA_SIRA = { VOLONTE: 0, BLACKROSE: 1 };
const MAGAZA_KISA = { VOLONTE: "V", BLACKROSE: "B" };
const KISA_MAGAZA = { V: "VOLONTE", B: "BLACKROSE" };
export const listeBasi = (m, n) => `${magazaAdi(m)} LİSTESİ – BAŞLANGIÇ (${n} model)`;
export const listeSonu = (m, n) => `${magazaAdi(m)} LİSTESİ – SONU${n != null ? ` (${n} model)` : ""}`;
// Kırmızı "Geri al" (Telegram renkli düğmeyi destekliyorsa kırmızı; desteklemiyorsa düz görünür)
export const GERI_AL = (data) => ({ text: "↩️ Geri al", callback_data: data, style: "danger" });
// Hemra'ya model mesajı: önce sitedeki fotoğraf; sitede yoksa kanaldaki en yeni paylaşım (yazısı değiştirilerek, yani
// kanal yazısı/fiyat GİTMEZ); ikisi de yoksa yazı. Dönüş: { r, tur: "foto"|"metin", kaynak: "site"|"kanal"|null }
// 12 Kasım (Patron): Celal'in modellerinin fotoğrafı yok (1-2 ay sonra eklenecek) — kart FOTOĞRAFSIZ gider, "📷 fotoğraf yok" yazmaz
const fotoNotu = (grup) => (grup === "celal" ? "" : "\n📷 fotoğraf yok");
async function hemraModelGonder(env, tg, kod, site, yazi, kl, kime = null, grup = null) {
  kime = kime || sorumlu(env);
  const url = sitedenFoto(env, site, kod);
  if (url) {
    for (const u of [url, tamFoto(url)]) {
      const r = await tg(env, "sendPhoto", { chat_id: kime, photo: u, caption: yazi, reply_markup: kl });
      if (r && r.ok) return { r, tur: "foto", kaynak: "site" };
    }
  }
  const kanal = await env.KAYIT.get("kanal", "json");
  const gruplar = [...(((await env.KAYIT.get("kodlar", "json")) || {})[kod] || [])].sort((a, b) => b.tarih - a.tarih);
  let deneme = 0;
  for (const g of gruplar) {
    for (const id of [g.y, ...g.ids].filter((x, i, l) => x > 0 && l.indexOf(x) === i)) {
      if (!kanal || deneme++ >= 4) break;
      const r = await tg(env, "copyMessage", { chat_id: kime, from_chat_id: kanal.id, message_id: id, caption: yazi, reply_markup: kl });
      if (r && r.ok) return { r, tur: "foto", kaynak: "kanal" };
    }
  }
  let r = await tg(env, "sendMessage", { chat_id: kime, text: `${yazi}${fotoNotu(grup)}`, reply_markup: kl });
  if (!(r && r.ok)) r = await tg(env, "sendMessage", { chat_id: kime, text: `${yazi}${fotoNotu(grup)}`.slice(0, 3500), reply_markup: kl }); // 10 Kasım: bir kez daha
  return { r, tur: "metin", kaynak: null };
}

async function kuyrukEkle(env, tur, anahtar) {
  const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
  if (!k[tur].includes(anahtar)) k[tur].push(anahtar);
  await ayarYaz(env, "fabrika:kuyruk", k);
}

// Kimlikler ortamdan (yükleme betikleri gizli kayıttan, KV venom:kimlikler, okur); kodda sabit kimlik yok.
// MURAT_ID listesi (31 Ekim): ilk kimlik = Patron hesabı (Murat'a özel mesajlar oraya gider); hepsi Murat yetkisine sahip
// (eski hesap şimdilik kalır).
export const sorumlu = (env) => String(env.FABRIKA_SORUMLU || "");
export const muratlar = (env) => String(env.MURAT_ID || "").split(",").map((x) => x.trim()).filter(Boolean);
export const murat = (env) => muratlar(env)[0] || "";
export const muratMi = (env, id) => muratlar(env).includes(String(id));

async function ayarOku(env, k, bos) {
  const v = (await stokIste(env, "/ayar-oku", { k })).v;
  return v == null ? bos : JSON.parse(v);
}
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });

// Kişiler: grup "fabrika" (Nuri, Sinem, Fuat) ya da "celal" (Celal; sadece kendi modelleri). Eski kayıtlar = fabrika.
const tumKisiler = async (env) => (await env.KAYIT.get("sami:fabrikaKisiler", "json")) || [];
export const kisiGrubu = (k) => k.grup || "fabrika";
export const fabrikaKisileri = async (env, grup = "fabrika") => (await tumKisiler(env)).filter((k) => kisiGrubu(k) === grup);
export const kisiKaydi = async (env, id) => (await tumKisiler(env)).find((k) => String(k.id) === String(id)) || null;
export const fabrikaKisisiMi = async (env, id) => Boolean(await kisiKaydi(env, id));
export const GRUP_AD = { fabrika: "🏭 Fabrika (Nuri/Sinem/Fuat)", celal: "👤 Celal" };
// 12 Kasım (Patron): sonunda "CELAL" yazan kod (köprü işaretler) ya da 3000 / 3002 ("Celal İndirim") → Celal; diğer bütün modeller → Sinem/Fuat/Nuri
const grupOf = (t, kod = null) => ((t && t.tedarikci === "CELAL") || celalKoduMu((t && t.kod) || kod || "") ? "celal" : "fabrika");
// Liste satırlarını gruba göre başlıklar altında yazar
function grupluYaz(liste, gruplar, satirYaz) {
  const sonuc = [];
  for (const g of ["fabrika", "celal"]) {
    const l = liste.filter((x) => (gruplar[x.kod] || "fabrika") === g);
    if (l.length) sonuc.push(`${GRUP_AD[g]}:`, ...l.map(satirYaz), "");
  }
  return sonuc.join("\n").trim();
}

// "3183 siyah 10 bej 6, 3186 kırmızı 5" → [{ kod, renkler: [{ renk, adet }] }]
export function listeCoz(metin) {
  const sonuc = [];
  // Model kodu 4-6 hane, adet 1-3 hane (kod ile adet karışmasın)
  const parcalar = String(metin || "").replace(/[,;]+/g, " ").split(/(?=\b\d{4,6}\b)/);
  for (const p of parcalar) {
    const m = p.trim().match(/^(\d{4,6})\b(.*)$/s);
    if (!m) continue;
    const renkler = [];
    for (const r of m[2].matchAll(/([a-zçğıöşüâîû][a-zçğıöşüâîû\s-]*?)\s*[:=x×]?\s*(\d{1,3})\b/gi)) {
      const renk = r[1].trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
      const adet = Number(r[2]);
      if (renk && adet > 0) renkler.push({ renk, adet });
    }
    if (renkler.length) {
      const var_ = sonuc.find((x) => x.kod === m[1]);
      if (var_) var_.renkler.push(...renkler); else sonuc.push({ kod: m[1], renkler });
    }
  }
  return sonuc;
}

export const listeYaz = (liste) => liste.map((x) => `${x.kod} — ${x.beden ? `${BEDEN[x.beden]}: ` : ""}${x.renkler.map((r) => `${r.renk} ${r.adet}`).join(", ")}`).join("\n");

// ---------- Beden (kullanıcı kararı 29 Ekim): Küçük 38-44 / Büyük 44-50 / İkisi de ----------
export const BEDEN = { k: "Küçük (38-44)", b: "Büyük (44-50)" };
const BEDEN_KISA = { k: "Küçük", b: "Büyük", i: "İkisi de" };
const BEDEN_KALIP = /(küçük|kucuk|küçuk|kücük|büyük|buyuk|büyuk|buyük|ikisi\s*de|ikiside|ikisi)/i;
const bedenKodu = (w) => (/^(küçük|kucuk|küçuk|kücük)$/i.test(w) ? "k" : /^(büyük|buyuk|büyuk|buyük)$/i.test(w) ? "b" : "i");
// "3254 küçük siyah 10 bej 6, 3254 büyük siyah 5, 3297 büyük" → [{ kod, beden, renkler }] (beden yoksa null; renksiz beden de kalır)
export function listeCozBeden(metin) {
  const sonuc = [];
  const parcalar = String(metin || "").replace(/[,;]+/g, " ").split(/(?=\b\d{4,6}\b)/);
  for (const p of parcalar) {
    const m = p.trim().match(/^(\d{4,6})\b(.*)$/s);
    if (!m) continue;
    const bolumler = m[2].split(BEDEN_KALIP);
    let beden = null;
    for (let i = 0; i < bolumler.length; i++) {
      const b = bolumler[i];
      if (i % 2 === 1) { beden = bedenKodu(b.toLocaleLowerCase("tr").replace(/\s+/g, "")); if (!/\d/.test(bolumler[i + 1] || "")) sonuc.push({ kod: m[1], beden, renkler: [] }); continue; }
      const renkler = [];
      for (const r of b.matchAll(/([a-zçğıöşüâîû][a-zçğıöşüâîû\s-]*?)\s*[:=x×]?\s*(\d{1,3})\b/gi)) {
        const renk = r[1].trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
        const adet = Number(r[2]);
        if (renk && adet > 0) renkler.push({ renk, adet });
      }
      if (renkler.length) sonuc.push({ kod: m[1], beden, renkler });
    }
  }
  return sonuc;
}
// Seçim: { isteme } | { beden: k|b|i, gruplar: { k?: [renkler], b?: [renkler] }, bekleyen?: [renkler (beden yokken yazılan)] }.
// Eski kayıt { renkler } → bedeni bekleyen renkler.
export const secimNorm = (s) => (!s ? null : s.isteme ? { isteme: true } : s.renkler && !s.gruplar && !s.beden ? { bekleyen: s.renkler, gruplar: {} } : { gruplar: {}, ...s });
const bedenleri = (s) => (s.beden === "i" ? ["k", "b"] : s.beden ? [s.beden] : []);
export const secimTamam = (s) => Boolean(s && (s.isteme || (s.beden && bedenleri(s).every((g) => s.gruplar && s.gruplar[g] && s.gruplar[g].length))));
export function secimEksigi(s) {
  if (!s) return "karar bekleniyor";
  if (s.isteme) return null;
  if (!s.beden) return "beden seçilmedi";
  const eksik = bedenleri(s).filter((g) => !(s.gruplar && s.gruplar[g] && s.gruplar[g].length));
  return eksik.length ? `${eksik.map((g) => BEDEN_KISA[g].toLocaleLowerCase("tr")).join(" ve ")} renkleri bekleniyor` : null;
}
export function secimYazi(s) {
  if (!s) return "";
  if (s.isteme) return s.depodaVar ? "📦 Depoda var — bu sefer istenmeyecek" : "⏭ Bu sefer istenmeyecek";
  const satir = bedenleri(s).map((g) => (s.gruplar && s.gruplar[g] && s.gruplar[g].length ? `✓ ${BEDEN_KISA[g]} · ${renkYazi(s.gruplar[g])}` : `📏 ${BEDEN_KISA[g]}: renkleri yazın`));
  if (!s.beden) satir.push(`📏 Beden seçilmedi${s.bekleyen ? ` (yazdığınız: ${renkYazi(s.bekleyen)})` : ""}`);
  return satir.join("\n");
}
// Bir kararı mevcut seçime işler. k: { isteme } | { onceki } | { beden?, renkler? }
export function secimIsle(eski, k) {
  if (k.isteme) return k.botHatasi ? { isteme: true, botHatasi: true } : k.depodaVar ? { isteme: true, depodaVar: true } : { isteme: true }; // 10 Kasım: bot hatası "İsteme" ile karışmaz
  if (k.onceki) return Array.isArray(k.onceki) ? { bekleyen: k.onceki, gruplar: {} } : { beden: k.onceki.beden, gruplar: { ...k.onceki.gruplar } };
  const s = { gruplar: {}, ...(secimNorm(eski) && !eski.isteme ? secimNorm(eski) : {}) };
  s.gruplar = { ...(s.gruplar || {}) };
  if (k.beden && !(k.renkler && k.renkler.length)) {
    s.beden = k.beden;
    if (k.beden !== "i") for (const g of ["k", "b"]) if (g !== k.beden) delete s.gruplar[g];
    if (s.bekleyen && k.beden !== "i") { s.gruplar[k.beden] = s.bekleyen; delete s.bekleyen; }
    return s;
  }
  if (k.beden) { // renkler + beden
    s.beden = s.beden && s.beden !== k.beden && (s.beden === "i" || (s.gruplar[s.beden] && s.gruplar[s.beden].length)) ? "i" : k.beden;
    s.gruplar[k.beden] = k.renkler;
    delete s.bekleyen;
    return s;
  }
  if (s.beden === "k" || s.beden === "b") { s.gruplar[s.beden] = k.renkler; delete s.bekleyen; } else s.bekleyen = k.renkler;
  return s;
}
const sonIstekYazi = (o) => (Array.isArray(o) ? renkYazi(o) : bedenleri(o).map((g) => `${BEDEN_KISA[g]} · ${renkYazi(o.gruplar[g] || [])}`).join(" / "));

// Günün satış listesi Hemra'ya (otomatik ya da /eksik). Aynı gün bir kez. Önce kısa özet, sonra her model ayrı mesaj
// (sitedeki fotoğraf + kod + satılan + stok; stok 0 → 🔴; fotoğraf yoksa "📷 fotoğraf yok"; 10+ satan → 🔥), altında
// [🔁 Önceki gibi iste] (önceki istek varsa) ve [⏭ Bu sefer isteme]. Hemra renkleri yazar ya da düğmeye basar; bütün modeller
// karara bağlanınca onay kartı gelir. Model mesajları parça parça gider (çalışma başına 20).
async function listeyiGonder(env, gun, satislar, simdi, tg, kim = null, { anahtar = gun, ek = false, onceki = {}, cfg = MAGAZALAR[0], baslik = null, mod = false } = {}) {
  const modeller = satislar.map((x) => ({ kod: x.kod, satilan: x.satilan, kalan: x.kalan, grup: grupOf(x), ikiKart: Boolean(x.ikiKart) }));
  const yeni = await yeniAkisAcik(env);
  if (yeni) { // 11 Kasım: her kartta son 7 gün + yıllık satış
    const s7 = await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - 7 * 86400), bitis: gunAnahtari(simdi) }).catch(() => ({}));
    const yil = await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - 365 * 86400), bitis: gunAnahtari(simdi) }).catch(() => ({}));
    for (const m of modeller) { m.s7 = Number((s7 || {})[m.kod]) || 0; m.yil = Number((yil || {})[m.kod]) || 0; }
  }
  const toplam = modeller.reduce((t, x) => t + (Number(x.satilan) || 0), 0);
  const metin = [
    ...(mod ? [MOD_SATIR.trim()] : []),
    listeBasi(cfg.magaza, modeller.length),
    `🏭 ${gunGoster(gun)}${cfg.magaza === MAGAZA ? "" : ` ${cfg.etiket.toUpperCase()}`} — ${baslik || (ek ? "EK: listeden sonra satılan yeni modeller" : "bugün satılan modeller")}: ${modeller.length} model, toplam ${toplam} adet${kim ? ` · ${kim} istedi` : ""}.`,
    `Kartlar ${ACIK_KART_EN_FAZLA}'er gelir: bir karta cevap verdikçe yenisi gelir (toplam ${modeller.length}). Önce bedeni seçin (Küçük 38-44 / Büyük 44-50 / İkisi de), sonra renkleri yazın (örnek: 3183 küçük siyah 10 bej 6). Hepsi bitince onay kartı gelir.`,
  ].join("\n");
  await tg(env, "sendMessage", { chat_id: cfg.kime(env), text: metin });
  await ayarYaz(env, `fabrika:${anahtar}`, { ...onceki, asama: "soruldu", zaman: simdi, magaza: cfg.magaza, sorumlu: cfg.kime(env), ...(yeni ? { yeni: true } : {}), ...(mod ? { mod: true } : {}), modeller, secim: {}, mesajlar: {}, gonderilmedi: modeller.map((x) => x.kod), ...(ek ? { ek: true, gun } : { bilinen: satislar.map((x) => x.kod) }) });
  await kuyrukEkle(env, "liste", anahtar);
  return modelParcasi(env, anahtar, tg);
}

function modelYazisi(x, oncekiIstek, eskiRenk, magaza = null, biten = null, acil = null) {
  const kalan = x.kalan == null ? null : Math.max(0, x.kalan);
  return [
    magaza ? magazaAdi(magaza) : null,
    acil ? `⚡ ACİL — ${acil.not || "stok az"} · en az ${acil.min || 40} adet isteyin` : null,
    biten ? `⛔ Fabrikada bitti (${biten.kim}, ${gunGos(biten.zaman)}) — Patron yeni repete kararı verene kadar fabrikaya sorulmaz` : null,
    `${x.kod} · satılan ${x.satilan} · stok ${kalan == null ? "—" : kalan}${kalan === 0 ? " 🔴" : ""}`,
    x.s7 != null ? satisSatiri(x.s7, x.yil) : null, // 11 Kasım (yeni akış)
    x.grup === "celal" ? "👤 Celal'in modeli" : null,
    x.ikiKart ? "⚠️ iki kartı var" : null,
    Number(x.satilan) >= COK_SATAN ? "🔥 hızlı gidiyor, fazla iste" : null,
    oncekiIstek ? `Son istenen: ${sonIstekYazi(oncekiIstek)}` : eskiRenk && eskiRenk.length ? `Daha önce istenen renkler: ${eskiRenk.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}
const modelKlavye = (anahtar, kod, oncekiVar, beden = null, tamam = false, yeni = false) => (tamam ? { inline_keyboard: [[GERI_AL(`fe:g:${anahtar}:${kod}`)]] } : { inline_keyboard: [
  // 10 Kasım (Patron): satır başına en fazla 2 düğme (yazı kesilmesin)
  [["k", "Küçük 38-44"], ["b", "Büyük 44-50"]].map(([g, ad]) => ({ text: `${beden === g ? "✓ " : ""}${ad}`, callback_data: `fe:${g}:${anahtar}:${kod}` })),
  [{ text: `${beden === "i" ? "✓ " : ""}İkisi de`, callback_data: `fe:i:${anahtar}:${kod}` }],
  // 10 Kasım (Patron): net yazı, kart kesilmeden okunsun (satır başı 2 düğme)
  [{ text: "✅ Aynısı", callback_data: `fe:o:${anahtar}:${kod}` }, { text: "✏️ Adeti değiştir", callback_data: `fe:a:${anahtar}:${kod}` }],
  // 11 Kasım (yeni akış): [📦 Depoda var] — Vegawin'de 0 görünüp rafta mal varsa repete istenmez
  ...(yeni ? [[{ text: "🚫 İsteme", callback_data: `fe:x:${anahtar}:${kod}` }, { text: "📦 Depoda var", callback_data: `fe:D:${anahtar}:${kod}` }], [{ text: "⚠️ Bot hatası", callback_data: `fe:h:${anahtar}:${kod}` }]]
    : [[{ text: "🚫 İsteme", callback_data: `fe:x:${anahtar}:${kod}` }, { text: "⚠️ Bot hatası", callback_data: `fe:h:${anahtar}:${kod}` }]]),
] });

async function modelParcasi(env, anahtar, tg) {
  const d = await ayarOku(env, `fabrika:${anahtar}`, null);
  if (!d || !(d.gonderilmedi || []).length) {
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    if (k.liste.includes(anahtar)) { k.liste = k.liste.filter((x) => x !== anahtar); await ayarYaz(env, "fabrika:kuyruk", k); }
    return;
  }
  const site = await siteListesi(env);
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const eskiRenkler = await ayarOku(env, "fabrika:renkler", {});
  const bosYer = Math.max(0, ACIK_KART_EN_FAZLA - acikKartSayisi(d));
  if (!bosYer) return 0; // cevap bekleniyor: yeni kart gitmez
  const acil = await acilOku(env);
  d.gonderilmedi = [...d.gonderilmedi.filter((k) => acil[k]), ...d.gonderilmedi.filter((k) => !acil[k])]; // 10 Kasım: ACİL modeller listenin başında
  const parca = d.gonderilmedi.slice(0, Math.min(LISTE_PARCA, bosYer));
  const bitenler = await bitenOku(env);
  const ara = env.MESAJ_ARASI_MS != null ? Number(env.MESAJ_ARASI_MS) : 400; // Telegram hız sınırı (art arda 20 fotoğraf)
  d.denemeSay = d.denemeSay || {};
  for (const kod of parca) {
    if (kod !== parca[0] && ara > 0) await new Promise((r) => setTimeout(r, ara));
    const x = d.modeller.find((m) => m.kod === kod);
    const yazi = `${dn(d)}${modelYazisi(x, sonIstek[kod], eskiRenkler[kod], d.magaza || MAGAZA, bitenler[kod], d.deneme ? null : acil[kod])}`;
    const kl = modelKlavye(anahtar, kod, Boolean(sonIstek[kod]), null, false, Boolean(d.yeni));
    const { r, tur, kaynak } = await hemraModelGonder(env, tg, kod, site, yazi, kl, kimeOf(env, d), x && x.grup);
    if (r && r.ok) d.mesajlar[kod] = [r.result.message_id, tur, tur === "metin" ? `${yazi}${fotoNotu(x && x.grup)}` : yazi, kaynak];
    else d.denemeSay[kod] = (d.denemeSay[kod] || 0) + 1;
  }
  // Gönderirken Hemra düğmeye basmış olabilir: güncel kaydı okuyup sadece mesajları ve kalanı yaz.
  const guncel = (await ayarOku(env, `fabrika:${anahtar}`, null)) || d;
  guncel.mesajlar = { ...(guncel.mesajlar || {}), ...d.mesajlar };
  // 10 Kasım (Patron): sadece GERÇEKTEN giden model listeden düşer; gitmeyen 3 kez denenir, olmazsa Venom'a hata
  guncel.denemeSay = { ...(guncel.denemeSay || {}), ...d.denemeSay };
  const vazgec = parca.filter((k) => !d.mesajlar[k] && (guncel.denemeSay[k] || 0) >= 3);
  guncel.gonderilmedi = (guncel.gonderilmedi || []).filter((k) => !(parca.includes(k) && (d.mesajlar[k] || vazgec.includes(k))));
  await ayarYaz(env, `fabrika:${anahtar}`, guncel);
  if (!guncel.gonderilmedi.length) {
    const giden = guncel.modeller.filter((x) => guncel.mesajlar[x.kod]).length, n = guncel.modeller.length;
    await defterIs(env, "sami", `eksik listesi ${cfgOf(guncel).etiket}${guncel.deneme ? " (deneme)" : ""}: ${n} model vardı, ${giden} gitti (${adOf(env, guncel)})`, { deneme: Boolean(guncel.deneme) }).catch(() => null); // kendi sayımı
    if (!guncel.tekKart) await tg(env, "sendMessage", { chat_id: kimeOf(env, guncel), text: `${dn(guncel)}${listeSonu(guncel.magaza || MAGAZA, giden)}${giden < n ? `\n📋 Sayım: ${n} model vardı, ${giden} gitti. Gitmeyen: ${guncel.modeller.filter((x) => !guncel.mesajlar[x.kod]).map((x) => x.kod).join(", ")} — Venom'a bildirildi.` : ""}` });
    if (giden < n) await env.KAYIT.put("sami:hata", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), hata: `eksik listesi ${anahtar}: ${n} modelden ${n - giden} tanesi ${adOf(env, guncel)}'a gönderilemedi (3 deneme)` }), { expirationTtl: 7 * 86400 });
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    k.liste = k.liste.filter((x) => x !== anahtar);
    await ayarYaz(env, "fabrika:kuyruk", k);
  }
  return parca.length;
}

// Bir modelin kararları (beden, renkler, önceki gibi, isteme). Hepsi tamamlanınca onay kartı. Beden seçilmeden model karta geçmez.
// kararlar: { kod: [karar, ...] } — karar: { isteme } | { onceki } | { beden?, renkler? }
async function secimUygula(env, tg, anahtar, d, kararlar, kaynak, metin = "") {
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  for (const [kod, liste] of Object.entries(kararlar)) {
    for (const k of [].concat(liste)) d.secim[kod] = secimIsle(d.secim[kod], k);
    const s = d.secim[kod];
    const m = d.mesajlar && d.mesajlar[kod];
    if (m) {
      const [mesaj, tur, yazi] = m;
      const sn = secimNorm(s);
      const yazili = kaynak === "metin" && secimTamam(sn) && !sn.isteme ? `✅ ${kod} ${bedenleri(sn).map((b) => `${b === "k" ? "küçük" : "büyük"} ${renkYazi((sn.gruplar || {})[b] || [])}`).join(", ")} – kaydedildi` : null;
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: kimeOf(env, d), message_id: mesaj, [tur === "foto" ? "caption" : "text"]: `${yazi}\n\n${yazili || secimYazi(s)}`, reply_markup: modelKlavye(anahtar, kod, Boolean(sonIstek[kod]), s.beden || null, secimTamam(secimNorm(s)), Boolean(d.yeni)) });
    }
  }
  const kalan = d.modeller.filter((x) => !secimTamam(secimNorm(d.secim[x.kod])));
  if (!kalan.length) return kartGonder(env, tg, anahtar, d);
  if (d.asama === "onayda") d.asama = "soruldu"; // eksik çıktıysa kart geçersiz
  await ayarYaz(env, `fabrika:${anahtar}`, d);
  if ((d.gonderilmedi || []).length && acikKartSayisi(d) < ACIK_KART_EN_FAZLA) await modelParcasi(env, anahtar, tg).catch(() => null); // 10 Kasım: cevap verdikçe sıradaki kart
  if (kaynak === "metin") {
    const islenen = Object.keys(kararlar).map((k) => `${k}: ${secimTamam(d.secim[k]) ? secimYazi(d.secim[k]).replace(/✓ /g, "") : secimEksigi(secimNorm(d.secim[k]))}`);
    await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: `${dn(d)}${islenen.join("\n")}\n\nKalan (${kalan.length}): ${kalan.map((x) => `${x.kod} (${secimEksigi(secimNorm(d.secim[x.kod]))})`).join(", ")}` });
  }
}

// 10 Kasım (Patron): EKSİK LİSTESİ YENİ DÜZEN — kontrol: VOLONTE Aziz, Black Rose Merdan → bitince Sami TEK toplu liste yapıp
// Hemra'ya onaya gönderir; biri 2 saat içinde bitirmezse diğerininki beklemeden gider (bitmeyen "kontrol edilmedi"). Hemra onaylayınca
// fabrikaya (Sinem, Fuat, Nuri). DENEME fabrikaya gitmez, Hemra'nın onayında durur.
const yeniDuzen = (env, d) => Boolean(d && d.sorumlu && String(d.sorumlu) !== sorumlu(env) && sorumlu(env));
const BIRLESIM_BEKLE = 2 * 3600;
function parcaListesi(d) {
  const liste = [], kontrolsuz = [];
  for (const x of d.modeller || []) {
    const s = secimNorm(d.secim && d.secim[x.kod]);
    if (!secimTamam(s)) { kontrolsuz.push(x.kod); continue; }
    if (s.isteme) continue;
    for (const g of bedenleri(s)) liste.push({ kod: x.kod, beden: g, renkler: s.gruplar[g], magaza: d.magaza || MAGAZA });
  }
  const sc = (k) => (d.secim && d.secim[k]) || {};
  return { liste, kontrolsuz, istenmeyen: (d.modeller || []).filter((x) => sc(x.kod).isteme && !sc(x.kod).botHatasi && !sc(x.kod).depodaVar).map((x) => x.kod), hatali: (d.modeller || []).filter((x) => sc(x.kod).botHatasi).map((x) => x.kod), depoda: (d.modeller || []).filter((x) => sc(x.kod).depodaVar).map((x) => x.kod) };
}
export async function birlesikOnay(env, tg, gun, simdi, anahtarlar, { deneme = false } = {}) {
  const parcalar = [];
  for (const k of anahtarlar) { const x = await ayarOku(env, `fabrika:${k}`, null); if (x && ["soruldu", "duzelt", "eminMi", "kontrolEdildi"].includes(x.asama) && x.modeller) parcalar.push({ k, x }); }
  const bitti = parcalar.filter((p) => p.x.asama === "kontrolEdildi");
  if (!bitti.length) return null;
  const bekleyen = parcalar.filter((p) => p.x.asama !== "kontrolEdildi");
  if (bekleyen.length && simdi - Math.min(...bitti.map((p) => p.x.kontrolZaman || simdi)) < BIRLESIM_BEKLE) return null; // diğerini 2 saate kadar bekle
  // 10 Kasım (Patron, TEK SEFERLİK TAM ZİNCİR DENEMESİ): "zincir" işaretli deneme listesi Hemra onayından sonra SADECE Sinem'e gider
  const zincir = deneme && parcalar.some((p) => p.x.zincir);
  const sinemId = zincir ? await sinemKimligi(env) : null;
  const b = { asama: "onayda", birlesik: true, gun, zaman: simdi, sorumlu: sorumlu(env), deneme, ...(parcalar.some((p) => p.x.mod) ? { mod: true } : {}), zincir: Boolean(zincir && sinemId), sadece: zincir && sinemId ? [sinemId] : null, fabrikayaGitmez: deneme && !(zincir && sinemId), parcalar: parcalar.map((p) => p.k), liste: [], gruplar: {}, modeller: [], secim: {}, istenmeyen: [], kontrolsuz: [], kontrol: [], depoda: [], ...(parcalar.some((p) => p.x.yeni) ? { yeni: true } : {}), ...(parcalar.some((p) => p.x.test) ? { test: true } : {}) };
  for (const { x } of parcalar) {
    const pl = parcaListesi(x);
    b.liste.push(...pl.liste); b.istenmeyen.push(...pl.istenmeyen); b.depoda.push(...pl.depoda); b.hatali = [...(b.hatali || []), ...pl.hatali]; b.kontrolsuz.push(...pl.kontrolsuz.map((k) => `${k} (${cfgOf(x).etiket})`));
    Object.assign(b.gruplar, Object.fromEntries((x.modeller || []).map((m) => [m.kod, m.grup || "fabrika"])));
    b.modeller.push(...x.modeller); Object.assign(b.secim, x.secim || {});
    b.kontrol.push(`${cfgOf(x).etiket}: ${x.zamanAsimi ? `${adOf(env, x)} bitirmedi (süre doldu)` : x.asama === "kontrolEdildi" ? `${adOf(env, x)} kontrol etti` : `${adOf(env, x)} bitirmedi`}`);
  }
  // 10 Kasım (Sinem): fabrikada "bitti" denen model Patron yeni repete kararı verene kadar fabrikaya SORULMAZ
  const bitenler = await bitenOku(env);
  b.fabrikadaBitti = [...new Set(b.liste.filter((x) => bitenler[x.kod]).map((x) => x.kod))];
  b.liste = b.liste.filter((x) => !bitenler[x.kod]);
  const acilB = deneme ? {} : await acilOku(env, simdi);
  b.liste.sort((x, y) => (MAGAZA_SIRA[x.magaza] || 0) - (MAGAZA_SIRA[y.magaza] || 0) || (acilB[y.kod] ? 1 : 0) - (acilB[x.kod] ? 1 : 0)); // önce VOLONTE, sonra Black Rose; mağaza içinde ACİL önce
  b.acil = [...new Set(b.liste.map((x) => x.kod).filter((k) => acilB[k]))];
  b.dunden = parcalar.some((p) => p.x.dunden);
  const no = ((await ayarOku(env, `fabrika:birlesik:${gun}`, [])) || []).length + 1;
  const anahtar = `${gun}${deneme ? "-D" : ""}-T${no}`;
  await ayarYaz(env, `fabrika:${anahtar}`, b);
  await ayarYaz(env, `fabrika:birlesik:${gun}`, [...((await ayarOku(env, `fabrika:birlesik:${gun}`, [])) || []), anahtar]);
  for (const { k, x } of parcalar) { x.asama = "birlesti"; x.birlesik = anahtar; await ayarYaz(env, `fabrika:${k}`, x); }
  if (b.yeni && !b.liste.length) { // 11 Kasım (Patron): 0 modelli liste Hemra'ya ONAY KARTI olarak GİTMEZ — Sami sebebini kendisi bulur, düğmesiz bilgi yazar
    const sebep = [
      b.depoda.length ? `📦 Depoda var (Vegawin stoğu düzeltilmeli): ${b.depoda.join(", ")}` : null,
      b.istenmeyen.length ? `🚫 İstenmedi: ${b.istenmeyen.join(", ")}` : null,
      (b.hatali || []).length ? `⚠️ Bot hatası (düzeltilecek): ${b.hatali.join(", ")}` : null,
      b.fabrikadaBitti.length ? `⛔ Fabrikada bitti (repete kararı bekleniyor): ${b.fabrikadaBitti.join(", ")}` : null,
      b.kontrolsuz.length ? `⚠️ Kontrol edilmedi: ${b.kontrolsuz.join(", ")}` : null,
    ].filter(Boolean);
    const etiket = [...new Set(parcalar.map((p) => magazaAdi(p.x.magaza || MAGAZA)))].join(" + ");
    b.asama = "bos";
    const r0 = await tg(env, "sendMessage", { chat_id: b.sorumlu, text: `${dn(b)}📋 ${etiket} listesi (${gunGoster(gun)}): fabrikaya istenecek model yok — onayınız gerekmiyor, fabrikaya bir şey gitmedi.\n${sebep.length ? sebep.join("\n") : "Sebep: listede model yok."}` });
    if (r0 && r0.ok) b.hemraMesaj = [b.sorumlu, r0.result.message_id];
    await ayarYaz(env, `fabrika:${anahtar}`, b);
    return anahtar;
  }
  const govde = b.liste.length ? magazaliYaz(b.liste, b.gruplar) : "Fabrikaya bir şey istenmeyecek.";
  const kartMetin = `${dn(b)}📋 Gidecek liste (${gunGoster(gun)})${b.dunden ? " — dünden kalan" : ""} — ${b.kontrol.join(" · ")}:\n\n${b.acil.length ? `⚡ ACİL (listenin başında, en az 40 adet): ${b.acil.join(", ")}\n\n` : ""}${govde}${b.istenmeyen.length ? `\n\n🚫 Bu sefer istenmeyen: ${b.istenmeyen.join(", ")}` : ""}${b.depoda.length ? `\n\n📦 Depoda var (istenmedi; Vegawin stoğu düzeltilmeli): ${b.depoda.join(", ")}` : ""}${(b.hatali || []).length ? `\n\n⚠️ Bot hatası (listeye girmedi, düzeltilecek): ${b.hatali.join(", ")}` : ""}${b.fabrikadaBitti.length ? `\n\n⛔ Fabrikada bitti, fabrikaya sorulmadı (Patron'un repete kararı bekleniyor): ${b.fabrikadaBitti.join(", ")}` : ""}${b.kontrolsuz.length ? `\n\n⚠️ Kontrol edilmedi (listeye girmedi): ${b.kontrolsuz.join(", ")}` : ""}\n\nGönderilsin mi?${deneme ? (b.zincir ? " (DENEME: onaylanınca SADECE Sinem'e gider; Fuat ve Nuri'ye GİTMEZ)" : " (DENEME: onaylansa da fabrikaya GİTMEZ)") : ""}`.slice(0, 4000);
  const r = await tg(env, "sendMessage", {
    chat_id: b.sorumlu,
    text: kartMetin,
    reply_markup: { inline_keyboard: [[{ text: b.liste.length ? "✅ Onayla" : "✅ Tamam", callback_data: `fb:o:${anahtar}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${anahtar}` }]] },
  });
  if (r && r.ok) { b.hemraMesaj = [b.sorumlu, r.result.message_id]; b.kartMetin = kartMetin.slice(0, 3800); await ayarYaz(env, `fabrika:${anahtar}`, b); }
  return anahtar;
}
// Hemra'nın onay listesi mağaza mağaza (VOLONTE ve Black Rose asla karışmaz)
function magazaliYaz(liste, gruplar) {
  return ["VOLONTE", "BLACKROSE"].map((m) => {
    const l = liste.filter((x) => (x.magaza || MAGAZA) === m);
    return l.length ? `${magazaAdi(m)} LİSTESİ (${new Set(l.map((x) => x.kod)).size} model):\n${grupluYaz(l, gruplar, (x) => listeYaz([x]))}` : null;
  }).filter(Boolean).join("\n\n");
}
// 10 Kasım (Sinem, EMİN MİSİN): liste bitmeden özetli soru — "VOLONTE listesi: 18 model — 12 istendi, 4 istenmedi, 2 bot hatası. Göndereyim mi?"
export function eminMetni(d) {
  const pl = parcaListesi(d);
  const istendi = new Set(pl.liste.map((x) => x.kod)).size;
  return `${dn(d)}${(d.magaza || MAGAZA) === "BLACKROSE" ? "🌹 BLACK ROSE" : "🟦 VOLONTE"} listesi: ${(d.modeller || []).length} model — ${istendi} istendi, ${pl.istenmeyen.length} istenmedi, ${pl.depoda.length ? `${pl.depoda.length} depoda var, ` : ""}${pl.hatali.length} bot hatası. Göndereyim mi?`;
}
const eminKlavye = (anahtar) => ({ inline_keyboard: [[{ text: "✅ Eminim, gönder", callback_data: `fe:E:${anahtar}:-` }, { text: "↩️ Geri dön", callback_data: `fe:G:${anahtar}:-` }]] });
async function kartGonder(env, tg, anahtar, d, { emin = false } = {}) {
  if (yeniDuzen(env, d) && !d.birlesik && !emin) { // 10 Kasım: önce "Emin misin?"
    d.asama = "eminMi"; d.eminZaman = Math.floor(Date.now() / 1000);
    await ayarYaz(env, `fabrika:${anahtar}`, d);
    return tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: eminMetni(d), reply_markup: eminKlavye(anahtar) });
  }
  if (yeniDuzen(env, d) && !d.birlesik) { // 10 Kasım: kontrol bitti → Hemra'ya birleşik onay
    d.asama = "kontrolEdildi"; d.kontrolZaman = Math.floor(Date.now() / 1000);
    await ayarYaz(env, `fabrika:${anahtar}`, d);
    await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: `${dn(d)}✅ Kontrol bitti, teşekkürler. ${d.yeni && !parcaListesi(d).liste.length ? "Fabrikaya istenecek model yok; Hemra'ya bilgi verildi." : "Liste Hemra'nın onayına gidiyor."}` });
    const gun = d.gun || anahtar.slice(0, 10);
    // 10 Kasım: kişi denemesi (…-DK) kendi iki listesiyle birleşir (VOLONTE + Black Rose); eski deneme akışı kendi anahtarlarıyla
    const da = d.deneme ? (await ayarOku(env, "fabrika:denemeAkis", null)) || {} : null;
    const keys = d.yeni ? await magazaAnahtarlari(env, gun, d, anahtar) : !d.deneme ? await gunAnahtarlari(env, gun) : /-DK$/.test(anahtar) ? [`${gun}-DK`, `${gun}-BR-DK`] : (da.keys && da.keys.includes(anahtar) ? da.keys : [anahtar]);
    return birlesikOnay(env, tg, gun, d.kontrolZaman, keys, { deneme: Boolean(d.deneme) });
  }
  const gun = d.gun || anahtar.slice(0, 10);
  d.liste = [];
  for (const x of d.modeller) {
    const s = secimNorm(d.secim[x.kod]);
    if (!s || s.isteme) continue;
    for (const g of bedenleri(s)) d.liste.push({ kod: x.kod, beden: g, renkler: s.gruplar[g], magaza: d.magaza || MAGAZA });
  }
  const bitenler = await bitenOku(env);
  d.fabrikadaBitti = [...new Set(d.liste.filter((x) => bitenler[x.kod]).map((x) => x.kod))];
  d.liste = d.liste.filter((x) => !bitenler[x.kod]);
  d.gruplar = Object.fromEntries(d.modeller.map((x) => [x.kod, x.grup || "fabrika"]));
  d.istenmeyen = d.modeller.filter((x) => d.secim[x.kod] && d.secim[x.kod].isteme).map((x) => x.kod);
  d.asama = "onayda";
  await ayarYaz(env, `fabrika:${anahtar}`, d);
  const govde = d.liste.length ? grupluYaz(d.liste, d.gruplar, (x) => listeYaz([x])) : "Fabrikaya bir şey istenmeyecek.";
  return tg(env, "sendMessage", {
    chat_id: kimeOf(env, d),
    text: `📋 Gidecek liste (${gunGoster(gun)}${d.magaza && d.magaza !== MAGAZA ? ` ${cfgOf(d).etiket}` : ""}${d.ek ? ", ek" : ""}):\n${govde}${d.istenmeyen.length ? `\n\n⏭ Bu sefer istenmeyen: ${d.istenmeyen.join(", ")}` : ""}${d.fabrikadaBitti.length ? `\n\n⛔ Fabrikada bitti, fabrikaya sorulmadı: ${d.fabrikadaBitti.join(", ")}` : ""}\n\nGönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: d.liste.length ? "✅ Onayla" : "✅ Tamam", callback_data: `fb:o:${anahtar}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${anahtar}` }]] },
  });
}

// Kuyruk: Hemra'ya model mesajları ve fabrikaya gönderim parça parça (her çalışmada biri).
async function kuyrukAdimi(env, simdi, tg) {
  const k = await ayarOku(env, "fabrika:kuyruk", null);
  if (!k) return false;
  let is = false; // 10 Kasım: cevap bekleyen liste (5 kart sınırı) diğer işleri tıkamaz
  for (const a of k.liste.slice(0, 4)) if (await modelParcasi(env, a, tg)) { is = true; break; }
  if (!is && k.gonderim.length) is = Boolean(await gonderimParcasi(env, k.gonderim[0], tg, simdi));
  return is;
}

// Bir kerelik (kullanıcı kararı 29 Ekim): KV "fabrika:yenidenGonder" = bugünün tarihi → eski düzende giden ve henüz fabrikaya
// gitmemiş liste iptal edilir, Hemra'ya not düşülür, aynı günün satışları yeni düzende yeniden gönderilir. Sonuç KV'ye yazılır.
// Bir kerelik (29 Ekim): "fabrika:fotoTamamla" = bugün → listede fotoğrafsız giden modeller için fotoğraflı mesaj yeniden gider
// (Hemra'nın yazdıkları/seçimleri KORUNUR; yeni mesaj aynı durumu ve düğmeleri gösterir). Sonuç: "fabrika:fotoSonuc".
async function fotoTamamla(env, gun, tg) {
  if ((await env.KAYIT.get("fabrika:fotoTamamla")) !== gun) return false;
  await env.KAYIT.delete("fabrika:fotoTamamla");
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  if (!d || !d.modeller) { await env.KAYIT.put("fabrika:fotoSonuc", JSON.stringify({ gun, hata: "liste yok" }), { expirationTtl: 7 * 86400 }); return true; }
  const site = await siteListesi(env);
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const eskiRenkler = await ayarOku(env, "fabrika:renkler", {});
  const sonuc = {};
  const eksik = d.modeller.filter((x) => { const m = d.mesajlar && d.mesajlar[x.kod]; sonuc[x.kod] = m && m[1] === "foto" ? "site" : null; return !m || m[1] !== "foto"; });
  if (eksik.length) await tg(env, "sendMessage", { chat_id: sorumlu(env), text: `📷 Fotoğrafsız giden ${eksik.length} modelin fotoğrafları aşağıda. Yazdıklarınız kayıtlı, silinmedi.` });
  for (const x of eksik) {
    const s = d.secim && d.secim[x.kod];
    const yazi = modelYazisi(x, sonIstek[x.kod], eskiRenkler[x.kod]) + (s ? `\n\n${secimYazi(secimNorm(s))}` : "");
    const { r, tur, kaynak } = await hemraModelGonder(env, tg, x.kod, site, yazi, modelKlavye(gun, x.kod, Boolean(sonIstek[x.kod]), s && s.beden ? s.beden : null));
    sonuc[x.kod] = kaynak || "yok";
    if (r && r.ok && tur === "foto") d.mesajlar[x.kod] = [r.result.message_id, tur, modelYazisi(x, sonIstek[x.kod], eskiRenkler[x.kod]), kaynak];
  }
  const guncel = (await ayarOku(env, `fabrika:${gun}`, null)) || d;
  guncel.mesajlar = { ...(guncel.mesajlar || {}), ...d.mesajlar };
  await ayarYaz(env, `fabrika:${gun}`, guncel);
  await env.KAYIT.put("fabrika:fotoSonuc", JSON.stringify({ gun, sonuc, secimler: Object.keys(guncel.secim || {}), asama: guncel.asama }), { expirationTtl: 7 * 86400 });
  return true;
}

// Bir kerelik (29 Ekim): "fabrika:bedenEkle" = bugün → bugünkü açık listelerde beden seçilmemiş modellere beden düğmeli kısa mesaj;
// Hemra'nın yazdıkları korunur (bedeni bekleyen renk olarak), kart beden yokken gönderildiyse geçersiz olur. Sonuç: "fabrika:bedenSonuc".
async function bedenEkle(env, gun, tg) {
  if ((await env.KAYIT.get("fabrika:bedenEkle")) !== gun) return false;
  await env.KAYIT.delete("fabrika:bedenEkle");
  const ana = await ayarOku(env, `fabrika:${gun}`, null);
  const sonuc = { gun, gonderilen: [], atlanan: [] };
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  let not = false;
  for (const anahtar of ana ? [gun, ...(ana.ekler || [])] : []) {
    const d = anahtar === gun ? ana : await ayarOku(env, `fabrika:${anahtar}`, null);
    if (!d || !d.modeller || !["soruldu", "duzelt", "onayda"].includes(d.asama)) continue;
    d.secim = d.secim || {};
    d.mesajlar = d.mesajlar || {};
    for (const x of d.modeller) {
      const sc = secimNorm(d.secim[x.kod]);
      if (sc && (sc.isteme || sc.beden)) { sonuc.atlanan.push(x.kod); continue; }
      if (!not) { not = true; await tg(env, "sendMessage", { chat_id: sorumlu(env), text: "📏 Beden seçimi eklendi: her model için önce bedeni seçin (Küçük 38-44 / Büyük 44-50 / İkisi de), sonra renkleri yazın (örnek: 3254 küçük siyah 10 bej 6). Yazdıklarınız kayıtlı, silinmedi." }); }
      const yazi = `📏 ${x.kod} — beden seçin`;
      const r = await tg(env, "sendMessage", { chat_id: sorumlu(env), text: sc && sc.bekleyen ? `${yazi}\n(yazdığınız: ${renkYazi(sc.bekleyen)})` : yazi, reply_markup: modelKlavye(anahtar, x.kod, Boolean(sonIstek[x.kod]), null) });
      if (r && r.ok) { d.mesajlar[x.kod] = [r.result.message_id, "metin", yazi]; sonuc.gonderilen.push(x.kod); }
    }
    if (d.asama === "onayda" && d.modeller.some((x) => !secimTamam(secimNorm(d.secim[x.kod])))) d.asama = "soruldu";
    await ayarYaz(env, `fabrika:${anahtar}`, d);
  }
  await env.KAYIT.put("fabrika:bedenSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  return true;
}

// Bir kerelik (29 Ekim): "fabrika:tekMesaj" = bugün → Hemra'ya her model TEK mesaj (fotoğraf + bilgi + beden düğmeleri + durum) yeniden;
// seçimler korunur. Bugün fabrikaya fotoğrafsız gitmiş siparişler varsa fotoğrafları arkasından gönderilir. Sonuç: "fabrika:tekMesajSonuc".
async function tekMesaj(env, gun, simdi, tg) {
  if ((await env.KAYIT.get("fabrika:tekMesaj")) !== gun) return false;
  await env.KAYIT.delete("fabrika:tekMesaj");
  const sonuc = { gun, hemra: {}, fabrikaFoto: [] };
  const ana = await ayarOku(env, `fabrika:${gun}`, null);
  const site = await siteListesi(env);
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const eskiRenkler = await ayarOku(env, "fabrika:renkler", {});
  let not = false;
  for (const anahtar of ana ? [gun, ...(ana.ekler || [])] : []) {
    const d = anahtar === gun ? ana : await ayarOku(env, `fabrika:${anahtar}`, null);
    if (!d || !d.modeller || !["soruldu", "duzelt", "onayda"].includes(d.asama)) continue;
    d.secim = d.secim || {};
    d.mesajlar = d.mesajlar || {};
    if (!not) { not = true; await tg(env, "sendMessage", { chat_id: sorumlu(env), text: "🔄 Liste düzeltildi: her model artık tek mesajda (fotoğraf + düğmeler). Seçtikleriniz kayıtlı; aşağıdaki mesajlardan devam edin." }); }
    for (const x of d.modeller) {
      const sc = secimNorm(d.secim[x.kod]);
      const yazi = modelYazisi(x, sonIstek[x.kod], eskiRenkler[x.kod]);
      const { r, tur, kaynak } = await hemraModelGonder(env, tg, x.kod, site, sc ? `${yazi}\n\n${secimYazi(sc)}` : yazi, modelKlavye(anahtar, x.kod, Boolean(sonIstek[x.kod]), sc && sc.beden ? sc.beden : null), null, x.grup);
      if (r && r.ok) d.mesajlar[x.kod] = [r.result.message_id, tur, tur === "metin" ? `${yazi}${fotoNotu(x.grup)}` : yazi, kaynak];
      sonuc.hemra[x.kod] = kaynak || "fotoğraf yok";
    }
    const guncel = (await ayarOku(env, `fabrika:${anahtar}`, null)) || d;
    guncel.mesajlar = { ...(guncel.mesajlar || {}), ...d.mesajlar };
    await ayarYaz(env, `fabrika:${anahtar}`, guncel);
  }
  // Bugün fabrikaya fotoğrafsız gitmiş siparişler: fotoğrafı arkasından.
  for (const ozet of Object.entries(await ayarOku(env, `fs:hafta:${pazartesi(simdi)}`, {})).filter(([, x]) => gunAnahtari(x.gonderim) === gun).slice(0, 10)) {
    const rec = await siparisOku(env, ozet[0]);
    if (!rec || rec.deneme || rec.grup === "celal") continue; // Celal'in modelinin fotoğrafı yok: uyarı yok
    const metinler = rec.mesajlar.filter(([, , t]) => t === "metin");
    if (!metinler.length) continue;
    const foto = await fotoBul(env, rec.kod, site);
    for (const [chat] of metinler) {
      let r = null;
      if (foto && foto.tur === "site") r = await tg(env, "sendPhoto", { chat_id: chat, photo: foto.url, caption: siparisMetni(rec) });
      else if (foto) for (const id of foto.adaylar) { r = await tg(env, "copyMessage", { chat_id: chat, from_chat_id: foto.kanal, message_id: id, caption: siparisMetni(rec) }); if (r && r.ok) break; }
      sonuc.fabrikaFoto.push(`${rec.kod}→${chat}: ${r && r.ok ? "gönderildi" : "fotoğraf bulunamadı"}`);
    }
    if (!foto) await tg(env, "sendMessage", { chat_id: murat(env), text: `📷 ${rec.kod} fotoğraf bulunamadı (fabrikaya gitmiş siparişin fotoğrafı gönderilemedi).` });
  }
  await env.KAYIT.put("fabrika:tekMesajSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  return true;
}

async function yenidenGonder(env, gun, simdi, tg) {
  if ((await env.KAYIT.get("fabrika:yenidenGonder")) !== gun) return false;
  await env.KAYIT.delete("fabrika:yenidenGonder");
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  const sonuc = (x) => env.KAYIT.put("fabrika:yenidenSonuc", JSON.stringify({ gun, zaman: simdi, ...x }), { expirationTtl: 7 * 86400 });
  if (d && d.asama === "gonderildi") { await sonuc({ ok: false, neden: "liste zaten onaylanıp fabrikaya gitmiş" }); return true; }
  const satislar = await satislarAl(env, gun);
  if (!satislar.length) { await sonuc({ ok: false, neden: "bugün satış yok" }); return true; }
  await tg(env, "sendMessage", { chat_id: sorumlu(env), text: `ℹ️ ${gunGoster(gun)} eksik listesi (eski düzen) iptal edildi — yenisi fotoğraflı ve düğmeli olarak hemen geliyor.` });
  await listeyiGonder(env, gun, satislar, simdi, tg, null, { onceki: d && d.ekler ? { ekler: d.ekler } : {} });
  await sonuc({ ok: true, model: satislar.length, adet: satislar.reduce((t, x) => t + (Number(x.satilan) || 0), 0) });
  return true;
}

// İndirimli mal (2000) günlük tek satır, SADECE Murat'a: iki mağazanın listeleri bittikten sonra (21:15), satış varsa.
const INDIRIMLI_SAAT = 21.25;
export const indirimliSatiri = (kod, satilan, kalan) => `🏷 İndirimli mal (${kod}): ${satilan} adet satıldı, ${kalan == null ? "—" : Math.max(0, kalan)} kaldı`;
async function indirimliOzet(env, gun, simdi, tg) {
  if (saat(simdi) < INDIRIMLI_SAAT || (await ayarOku(env, `fabrika:indirimli:${gun}`, null))) return false;
  await ayarYaz(env, `fabrika:indirimli:${gun}`, 1);
  const l = (await stokIste(env, "/satislar", { gun })).filter((x) => indirimliMi(x.kod) && x.satilan > 0);
  if (!l.length) return false;
  await tg(env, "sendMessage", { chat_id: murat(env), text: `${gunGoster(gun)}\n${l.map((x) => indirimliSatiri(x.kod, x.satilan, x.kalan)).join("\n")}` });
  return true;
}

// Satış girişi izlenir: ilk satış gelince başlar, liste 10 dakika değişmezse (giriş bitti) Hemra'ya gider — saat şartı yok.
// Liste gittikten sonra yeni model satılırsa (yine 10 dk sabit kalınca) sadece yeni modeller "ek" olarak sorulur.
// Hatırlatmalar her listenin gidişine göre: Hemra'ya 1 saat, Murat'a 2 saat sonra.
export async function fabrikaAdimi(env, simdi, tg) {
  // Bir kez (Claude Code, Patron isteği): KV "sami:eksikDeneme" = "<gün>" → o günün listeleri yeni akışla DENEME (fabrikaya gitmez)
  const dg = await env.KAYIT.get("sami:eksikDeneme").catch(() => null);
  if (dg) { await env.KAYIT.delete("sami:eksikDeneme"); let ay9 = { gun: dg }; try { if (dg.startsWith("{")) ay9 = JSON.parse(dg); } catch { /* düz gün */ } const keys = await eksikDenemesi(env, ay9.gun, simdi, tg, { adet: ay9.adet || null, ek: ay9.ek || "-D", kapat: ay9.kapat || [], magaza: ay9.magaza || null, kodlar: ay9.kodlar || null }); await env.KAYIT.put("sami:eksikDenemeSonuc", JSON.stringify({ zaman: simdi, keys }), { expirationTtl: 3 * 86400 }); return; }
  if (await kuyrukAdimi(env, simdi, tg)) return; // önce yarım kalan gönderimler
  if ((await env.KAYIT.get("sami:satisAcik")) !== "1") return; // satış okuması henüz doğrulanmadı
  const gun = gunAnahtari(simdi);
  if (await indirimliOzet(env, gun, simdi, tg)) return;
  if (await yenidenGonder(env, gun, simdi, tg)) return;
  if (await fotoTamamla(env, gun, tg)) return;
  if (await bedenEkle(env, gun, tg)) return;
  if (await tekMesaj(env, gun, simdi, tg)) return;
  for (const cfg of MAGAZALAR) await magazaAdimi(env, simdi, tg, gun, cfg);
  if (await yeniAkisAcik(env)) { // 11 Kasım (yeni akış): VOLONTE ve Black Rose listeleri Hemra'ya AYRI
    for (const cfg of MAGAZALAR) { const ana = `${gun}${cfg.ek}`; const x = await ayarOku(env, `fabrika:${ana}`, null); if (x) await birlesikOnay(env, tg, gun, simdi, [ana, ...(x.ekler || [])]).catch(() => null); }
  } else await birlesikOnay(env, tg, gun, simdi, await gunAnahtarlari(env, gun)).catch(() => null); // 10 Kasım: 2 saat bekleme dolduysa
  await hemraOnayTakip(env, simdi, tg, gun).catch(() => null);
  const da = await ayarOku(env, "fabrika:denemeAkis", null);
  if (da && da.keys) await birlesikOnay(env, tg, da.gun, simdi, da.keys, { deneme: true }).catch(() => null);
}
// 10 Kasım (Patron): DENEME — verilen günün eksik listeleri yeni akışla Aziz'e (VOLONTE) ve Merdan'a (Black Rose); fabrikaya GİTMEZ
export async function eksikDenemesi(env, gun, simdi, tg, { adet = null, ek = "-D", kapat = [], magaza = null, kodlar = null } = {}) {
  for (const k of kapat) { const x = await ayarOku(env, `fabrika:${k}`, null); if (x && !["denemeOnay", "iptal"].includes(x.asama)) { x.asama = "iptal"; await ayarYaz(env, `fabrika:${k}`, x); } } // önceki deneme kapanır
  const keys = [];
  for (const cfg of MAGAZALAR) {
    if (magaza && cfg.magaza !== magaza) continue; // 10 Kasım: tek mağaza denemesi (ör. sadece Merdan'a Black Rose)
    const x = await ayarOku(env, `fabrika:${gun}${cfg.ek}`, null);
    if (!x || !(x.modeller || []).length) continue;
    const secili = kodlar && kodlar.length ? x.modeller.filter((m) => kodlar.includes(String(m.kod))) : x.modeller;
    const modeller = adet ? secili.slice(0, adet) : secili;
    const k = `${gun}${cfg.ek}${ek}`;
    await ayarYaz(env, `fabrika:${k}`, { asama: "soruldu", zaman: simdi, gun, magaza: cfg.magaza, sorumlu: cfg.kime(env), modeller, secim: {}, mesajlar: {}, gonderilmedi: modeller.map((m) => m.kod), deneme: true, fabrikayaGitmez: true });
    await tg(env, "sendMessage", { chat_id: cfg.kime(env), text: `${DENEME}🏭 ${gunGoster(gun)} ${cfg.etiket} eksik listesi — KONTROL (${modeller.length} model). Önce beden, sonra: ✅ Aynısı · ✏️ Adeti değiştir · 🚫 İsteme · ⚠️ Bot hatası. Bitince Hemra'nın onayına gider; deneme fabrikaya GİTMEZ.` });
    await kuyrukEkle(env, "liste", k);
    keys.push(k);
  }
  await ayarYaz(env, "fabrika:denemeAkis", { gun, keys, zaman: simdi });
  return keys;
}

// 11 Kasım (yeni akış): Hemra 1 saat onaylamazsa Sami hatırlatır; 1 saat daha cevap yoksa liste Patron'a gelir (onay Patron'da)
async function hemraOnayTakip(env, simdi, tg, gun) {
  for (const g of [gun, gunAnahtari(simdi - 86400)]) for (const k of (await ayarOku(env, `fabrika:birlesik:${g}`, [])) || []) {
    const b = await ayarOku(env, `fabrika:${k}`, null);
    if (!b || b.asama !== "onayda" || !b.yeni || b.deneme) continue;
    const etiket = [...new Set((b.liste || []).map((x) => magazaAdi(x.magaza)))].join(" + ") || "Eksik";
    if (!b.hat1 && simdi - b.zaman >= HATIRLATMA_SN) {
      b.hat1 = simdi;
      await ayarYaz(env, `fabrika:${k}`, b);
      await tg(env, "sendMessage", { chat_id: b.sorumlu, text: `⏰ ${etiket} listesi (${gunGoster(b.gun)}) onayınızı bekliyor (✅ Onayla / ✏️ Düzelt).`, ...(b.hemraMesaj ? { reply_to_message_id: b.hemraMesaj[1], allow_sending_without_reply: true } : {}) });
    } else if (b.hat1 && !b.patronaGitti && simdi - b.hat1 >= HATIRLATMA_SN) {
      b.patronaGitti = simdi;
      await ayarYaz(env, `fabrika:${k}`, b);
      await tg(env, "sendMessage", { chat_id: murat(env), text: `${b.kartMetin || `📋 ${etiket} listesi (${gunGoster(b.gun)})`}\n\n⏰ Hemra 2 saattir onaylamadı (bir kez hatırlatıldı). Onay sizde.`.slice(0, 4000), reply_markup: { inline_keyboard: [[{ text: "✅ Onayla (fabrikaya gitsin)", callback_data: `fb:o:${k}` }]] } });
    }
  }
}
async function gunAnahtarlari(env, gun) {
  const l = [];
  for (const cfg of MAGAZALAR) { const ana = `${gun}${cfg.ek}`; const x = await ayarOku(env, `fabrika:${ana}`, null); if (x) l.push(ana, ...(x.ekler || [])); }
  return l;
}
// 11 Kasım (yeni akış): Hemra'ya VOLONTE ve Black Rose listeleri AYRI gider — sadece o mağazanın parçaları (ana + ekler); deneme tek liste
async function magazaAnahtarlari(env, gun, d, anahtar) {
  if (d.deneme || d.mod) return [anahtar]; // deneme modu listesi gerçek listeyle ASLA birleşmez (kural 40)
  const ana = `${gun}${cfgOf(d).ek}`;
  const x = await ayarOku(env, `fabrika:${ana}`, null);
  if (!x) return [anahtar];
  const l = [ana];
  for (const k of x.ekler || []) { const e = await ayarOku(env, `fabrika:${k}`, null); if (!(e && e.mod)) l.push(k); }
  return l;
}
async function magazaAdimi(env, simdi, tg, gun, cfg) {
  const ana = `${gun}${cfg.ek}`; // VOLONTE: "2026-10-30", Black Rose: "2026-10-30-BR"
  if (cfg.basla != null && saat(simdi) < cfg.basla) return; // Black Rose: gün içinde hiçbir mesaj yok, 19:05'ten sonra
  const d = await ayarOku(env, `fabrika:${ana}`, null);
  const satislar = await satislarAl(env, gun, cfg.magaza);
  const iz = JSON.stringify(satislar.map((x) => [x.kod, x.satilan]));
  if (!d || ["bekliyor", "satisYok"].includes(d.asama)) {
    if (!satislar.length) return;
    if (!d || d.iz !== iz) return ayarYaz(env, `fabrika:${ana}`, { asama: "bekliyor", iz, izZaman: simdi, magaza: cfg.magaza, sorumlu: cfg.kime(env) }); // giriş sürüyor olabilir
    if (simdi - d.izZaman < SABIT_SN) return;
    return listeyiGonder(env, gun, satislar, simdi, tg, null, { anahtar: ana, cfg });
  }
  // Ek: listede olmayan yeni modeller (bilinen yoksa eski kayıt: hepsi bilinen sayılır)
  const bilinen = new Set(d.bilinen || satislar.map((x) => x.kod));
  const yeni = satislar.filter((x) => !bilinen.has(x.kod));
  if (yeni.length) {
    if (d.ekIz !== iz) { d.ekIz = iz; d.ekIzZaman = simdi; await ayarYaz(env, `fabrika:${ana}`, d); }
    else if (simdi - d.ekIzZaman >= SABIT_SN) {
      d.ekler = [...(d.ekler || []), `${ana}-e${(d.ekler || []).length + 1}`];
      d.bilinen = [...bilinen, ...yeni.map((x) => x.kod)];
      await ayarYaz(env, `fabrika:${ana}`, d);
      await listeyiGonder(env, gun, yeni, simdi, tg, null, { anahtar: d.ekler.at(-1), ek: true, cfg });
    }
  }
  for (const anahtar of [ana, ...(d.ekler || [])]) {
    const x = await ayarOku(env, `fabrika:${anahtar}`, null);
    if (!x || !["soruldu", "duzelt", "onayda", "eminMi"].includes(x.asama)) continue;
    const ad = `${gunGoster(gun)} ${cfg.etiket} eksik listesi${x.ek ? " (ek)" : ""}`;
    if (simdi - x.zaman >= HATIRLATMA_SN && !x.hatirlatildi) {
      x.hatirlatildi = true;
      await ayarYaz(env, `fabrika:${anahtar}`, x);
      if (x.asama === "onayda") await tg(env, "sendMessage", { chat_id: kimeOf(env, x), text: `⏰ ${ad} onayınızı bekliyor (✅ Onayla / ✏️ Düzelt).` });
      else if (x.asama === "eminMi") await tg(env, "sendMessage", { chat_id: kimeOf(env, x), text: `⏰ ${eminMetni(x)}`, reply_markup: eminKlavye(anahtar) });
      else await kalanlariSor(env, tg, anahtar, x, ad); // kullanıcı kararı 31 Ekim: sadece karar verilmeyen modeller, aynı düğmelerle
    } else if (simdi - x.zaman >= MURAT_HABER_SN && !x.muratHaber && x.yeni && ["soruldu", "duzelt", "eminMi"].includes(x.asama) && yeniDuzen(env, x)) {
      // 11 Kasım (yeni akış): hatırlatmadan 1 saat sonra da bitmediyse liste bu haliyle Hemra'ya gider (cevaplanmayan modeller "kontrol edilmedi")
      Object.assign(x, { muratHaber: true, asama: "kontrolEdildi", kontrolZaman: simdi, zamanAsimi: true });
      await ayarYaz(env, `fabrika:${anahtar}`, x);
      await tg(env, "sendMessage", { chat_id: kimeOf(env, x), text: `${dn(x)}⏰ ${ad}: süre doldu; liste bu haliyle Hemra'ya gitti.` });
      await birlesikOnay(env, tg, gun, simdi, await magazaAnahtarlari(env, gun, x, anahtar), { deneme: Boolean(x.deneme) }).catch(() => null);
    } else if (simdi - x.zaman >= MURAT_HABER_SN && !x.muratHaber) {
      x.muratHaber = true;
      await ayarYaz(env, `fabrika:${anahtar}`, x);
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ ${ad}: ${adOf(env, x)} onaylamadı (2 saattir bekliyor; liste fabrikaya gitmedi).` });
    }
  }
}

// 1 saat dolunca: karar verilmeyen modeller ayrıca sorulur — "Şu X model kaldı: …" + her biri için aynı düğmeler.
async function kalanlariSor(env, tg, anahtar, x, ad) {
  const kalan = (x.modeller || []).map((m) => m.kod).filter((k) => !secimTamam(secimNorm(x.secim && x.secim[k])));
  const kime = kimeOf(env, x);
  if (!kalan.length) return tg(env, "sendMessage", { chat_id: kime, text: `⏰ Hatırlatma (${ad}): fabrikaya ne isteyelim? Renkleriyle yazın, örnek: 3183 siyah 10 bej 6` });
  await tg(env, "sendMessage", { chat_id: kime, text: `⏰ ${ad}: şu ${kalan.length} model kaldı: ${kalan.join(", ")}\nHer biri için beden seçin ya da "Bu sefer isteme" deyin; renkleri yazabilirsiniz (örnek: ${kalan[0]} siyah 10 bej 6).` });
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const eskiRenkler = await ayarOku(env, "fabrika:renkler", {});
  x.mesajlar = x.mesajlar || {};
  for (const kod of kalan.filter((k2) => x.mesajlar && x.mesajlar[k2]).slice(0, ACIK_KART_EN_FAZLA)) { // 10 Kasım: en fazla 5, sadece gitmiş kartlar
    const m = x.modeller.find((y) => y.kod === kod);
    const s = secimNorm(x.secim && x.secim[kod]);
    const yazi = `⏳ ${modelYazisi(m, sonIstek[kod], eskiRenkler[kod])}${s ? `\n${secimEksigi(s)}` : ""}`;
    const r = await tg(env, "sendMessage", { chat_id: kime, text: yazi, reply_markup: modelKlavye(anahtar, kod, Boolean(sonIstek[kod]), s && s.beden, false, Boolean(x.yeni)) });
    if (r && r.ok) x.mesajlar[kod] = [r.result.message_id, "metin", yazi, null]; // düğmeye basınca bu mesaj güncellenir
  }
  const guncel = (await ayarOku(env, `fabrika:${anahtar}`, null)) || x;
  guncel.mesajlar = { ...(guncel.mesajlar || {}), ...x.mesajlar };
  guncel.hatirlatildi = true;
  await ayarYaz(env, `fabrika:${anahtar}`, guncel);
}

// /eksik (sadece Murat ve Hemra): o günün satışlarıyla liste hemen Hemra'ya. Aynı gün iki kez gitmez.
export async function eksikKomutu(env, m, tg, simdi) {
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  if (!(muratMi(env, m.from.id) || String(m.from.id) === sorumlu(env))) return yaz("Bu komut sadece Murat ve Hemra'da.");
  if ((await env.KAYIT.get("sami:satisAcik")) !== "1") return yaz("Eksik listesi henüz kapalı.");
  const gun = gunAnahtari(simdi);
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  if (d && !["bekliyor", "satisYok"].includes(d.asama)) return yaz(`Bugünün listesi ${d.zaman ? `saat ${new Date((d.zaman + SAAT_FARKI) * 1000).toISOString().slice(11, 16)}'de ` : ""}zaten gönderildi (aynı gün iki kez gitmez).`);
  const satislar = await satislarAl(env, gun);
  if (!satislar.length) return yaz("Bugün için Vegawin'de satış görünmüyor. Satışlar girildiyse köprü 5 dakika içinde gönderir; sonra tekrar /eksik yazın.");
  await listeyiGonder(env, gun, satislar, simdi, tg, [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || null);
  if (String(m.from.id) !== sorumlu(env)) return yaz(`✅ Liste Hemra'ya gönderildi (${satislar.length} model).`);
}

// Kalıba uyan düz liste mi ("3183 siyah 10 bej 6, 3186 kırmızı 5")? Ekli renk (siyahtan), "isteme", "önceki gibi" vb. değil.
export const duzListeMi = (metin) => !/[a-zçğıöşü](dan|den|tan|ten)\b/i.test(metin) && !/(isteme|önceki|onceki|hepsi|gibi|sefer|değil|degil|yerine|iptal|\byok\b|\bama\b|\bve\b)/i.test(metin);

// ---------- Sami'nin beyni için (sami-beyin.js): sadece okuma + Hemra'nın listesine işleme ----------
// Kişiye gelmiş kontrol kartlı listeler (bugün + 2 gün öncesi; ana + ekler + deneme "-DK"/"-D" + deneme akışı) — açık ve gönderilmiş
async function kendiKartlari(env, simdi, cfg, kisi) {
  const l = [], gorulen = new Set();
  const da = (await ayarOku(env, "fabrika:denemeAkis", null)) || {};
  for (let i = 0; i < 3; i++) {
    const gun = gunAnahtari(simdi - i * 86400), ak = `${gun}${cfg.ek}`;
    const ana = await ayarOku(env, `fabrika:${ak}`, null);
    for (const k of [ak, ...((ana && ana.ekler) || []), `${ak}-DK`, `${gun}-D${cfg.ek}`, `${ak}-D`, `${ak}-ozel1`, `${ak}-ozel2`, `${ak}-ozel3`]) { // 12 Kasım: özel liste (ana liste yokken de)
      if (gorulen.has(k)) continue; gorulen.add(k);
      const d = k === ak ? ana : await ayarOku(env, `fabrika:${k}`, null);
      if (d && String(kimeOf(env, d)) === kisi && d.mesajlar && Object.keys(d.mesajlar).length) l.push({ anahtar: k, d });
    }
  }
  for (const k of da.keys || []) {
    if (gorulen.has(k)) continue; gorulen.add(k);
    const d = await ayarOku(env, `fabrika:${k}`, null);
    if (d && String(kimeOf(env, d)) === kisi && d.mesajlar && Object.keys(d.mesajlar).length) l.push({ anahtar: k, d });
  }
  return l;
}
// 10 Kasım (Patron): ACİL modeller (stok ~2 günde bitiyor) — listenin başında, en az N adet (repete). StokDO "fabrika:acil"
export async function acilOku(env, simdi = Math.floor(Date.now() / 1000)) {
  const a = (await ayarOku(env, "fabrika:acil", {})) || {};
  return Object.fromEntries(Object.entries(a).filter(([, v]) => !v.bitis || v.bitis > simdi));
}
const KART_ACIK = ["soruldu", "duzelt", "eminMi"];
const SORU_KALIP = /\?|\b(kaç|kac|kaldı|kaldi|var\s*m[ıi]|ne\s+zaman|nerede|nasıl|nasil|stok|satıldı|satildi|satış|satis|fiyat)\b/i;
const GELIS_KALIP = /\b(geldi|gelmedi|repete)\b/i;
const bedenAd = (b) => (b === "k" ? "Küçük" : b === "b" ? "Büyük" : "");
const kayitYazisi = (kod, sc) => `${kod} ${bedenleri(sc).map((b) => `${bedenAd(b)} ${renkYazi((sc.gruplar || {})[b] || [])}`).join(" · ")}`;
async function kendiKartYazisi(env, m, tg, simdi, cfg, metin, yorumla) {
  const kisi = String(m.from.id);
  const yazilan = [...new Set(metin.match(/(?<!\d)\d{4,6}(?!\d)/g) || [])];
  if (!yazilan.length) return false; // kodsuz → beyin
  if (GELIS_KALIP.test(metin) || SORU_KALIP.test(metin)) return false; // "3394 geldi 30", "repete geldi", "3394 kaç kaldı?" → kendi yolları
  const hepsi = await kendiKartlari(env, simdi, cfg, kisi);
  const acik = hepsi.filter((k) => KART_ACIK.includes(k.d.asama));
  const kartlarinda = (kod) => acik.filter((k) => (k.d.mesajlar || {})[kod]);
  const yaz = (text, dn = false, ek = {}) => tg(env, "sendMessage", { chat_id: m.chat.id, text: `${dn ? DENEME : ""}${text}`, ...ek });
  const yok = yazilan.filter((k) => !kartlarinda(k).length);
  const denemeHepsi = acik.length > 0 && acik.every((k) => k.d.deneme);
  if (yok.length) {
    const kalipMi = serbestCoz(metin) || listeCozBeden(metin).length;
    const gitti = yok.filter((k) => hepsi.some((x) => !KART_ACIK.includes(x.d.asama) && (x.d.mesajlar || {})[k]));
    if (yok.length === yazilan.length && !gitti.length && !kalipMi) return false; // eksik yazısı değil → beyin
    const satir = [];
    if (gitti.length) satir.push(`${gitti.join(", ")}: bu liste "Eminim, gönder" ile gönderildi; değişiklik için Hemra'ya yazın.`);
    const diger = yok.filter((k) => !gitti.includes(k));
    if (diger.length) satir.push(`${diger.join(", ")}: size gelen açık kontrol kartında yok. Başka model istemek için Hemra'ya yazın.`);
    if (yok.length < yazilan.length) satir.push(`Kartınızdaki modeller (${yazilan.filter((k) => !yok.includes(k)).join(", ")}) için ayrı mesajla yeniden yazın.`);
    await yaz(satir.join("\n"), denemeHepsi);
    return true;
  }
  const coklu = yazilan.filter((k) => kartlarinda(k).length > 1);
  if (coklu.length) { await yaz(`${coklu.join(", ")}: birden fazla açık kartınızda var (🧪 deneme ve gerçek). Lütfen ilgili kartın altındaki düğmeleri kullanın.`); return true; }
  const hedef = Object.fromEntries(yazilan.map((k) => [k, kartlarinda(k)[0]]));
  const dnler = new Set(yazilan.map((k) => Boolean(hedef[k].d.deneme)));
  if (dnler.size > 1) { await yaz("🧪 Deneme kartı ile gerçek kart aynı mesajda yazılmaz; ayrı ayrı yazın."); return true; }
  const deneme = [...dnler][0];
  const ORNEK = `Örnek: ${yazilan[0]} büyük pudra 12, küçük pudra 4`;
  const secOf = (kod) => secimNorm((hedef[kod].d.secim || {})[kod]);
  let gr = serbestCoz(metin), kaynak = "kalip";
  if (gr && gr.some((g) => !yazilan.includes(g.kod))) gr = null;
  if (!gr && yorumla) {
    const kartlar = yazilan.map((kod) => { const sc = secOf(kod); return { kod, marka: hedef[kod].d.magaza || MAGAZA, secilenBeden: sc && sc.beden ? sc.beden : null }; });
    const y = await yorumla(env, metin, kartlar, simdi, tg).catch(() => null);
    if (y && y.tur === "soru") return false; // soru → beyin
    if (y && y.tur === "liste" && (y.gruplar || []).length && y.gruplar.every((g) => yazilan.includes(g.kod) && (g.renkler || []).length) && new Set(y.gruplar.map((g) => g.kod)).size === yazilan.length) { gr = y.gruplar; kaynak = "opus"; }
  }
  if (!gr) { await yaz(`Tam anlayamadım. Kod, beden, renk ve adet yazın.\n${ORNEK}`, deneme); return true; }
  gr = gr.map((g) => ({ kod: g.kod, beden: g.beden || null, renkler: g.renkler.map((x) => ({ renk: x.renk, adet: x.adet })) }));
  for (const g of gr) if (!g.beden) { const sc = secOf(g.kod); if (sc && (sc.beden === "k" || sc.beden === "b")) g.beden = sc.beden; }
  const bedensiz = [...new Set(gr.filter((g) => !g.beden).map((g) => g.kod))];
  if (bedensiz.length) { await yaz(`${bedensiz.join(", ")}: hangi beden? Küçük mü, büyük mü?\n${ORNEK}`, deneme); return true; }
  // aynı kod + beden tek grupta birleşir (renkler eklenir); aynı renk iki kez → toplam mı düzeltme mi belli değil → sor
  const bir = [];
  for (const g of gr) {
    let x = bir.find((y) => y.kod === g.kod && y.beden === g.beden);
    if (!x) bir.push((x = { kod: g.kod, beden: g.beden, renkler: [] }));
    for (const rr of g.renkler) {
      if (x.renkler.some((z) => z.renk === rr.renk)) { await yaz(`${g.kod}: ${bedenAd(g.beden).toLocaleLowerCase("tr")} ${rr.renk} iki kez yazılmış; toplam mı, düzeltme mi? Tek seferde yazın.\n${ORNEK}`, deneme); return true; }
      x.renkler.push(rr);
    }
  }
  gr = bir;
  const acil = await acilOku(env, simdi);
  for (const kod of yazilan) {
    const a = acil[kod];
    if (!a) continue;
    const top = gr.filter((g) => g.kod === kod).reduce((t, g) => t + g.renkler.reduce((u, x) => u + x.adet, 0), 0);
    if (top < (a.min || 40)) { await yaz(`⚡ ${kod} ACİL (${a.not || "stok az"}): en az ${a.min || 40} adet isteyin — yazdığınız toplam ${top}.\nÖrnek: ${kod} büyük siyah 30, küçük siyah 10`, deneme); return true; }
  }
  // kartta zaten olan / yerine geçecek seçimler teyitte görünür
  const kalan = [], degisen = [];
  for (const kod of yazilan) {
    const sc = secOf(kod);
    if (!sc || !sc.gruplar) continue;
    for (const b of ["k", "b"]) {
      if (!(sc.gruplar[b] && sc.gruplar[b].length)) continue;
      if (gr.some((g) => g.kod === kod && g.beden === b)) degisen.push(`${kod} ${bedenAd(b)} ${renkYazi(sc.gruplar[b])}`);
      else kalan.push(`${kod} ${bedenAd(b)} ${renkYazi(sc.gruplar[b])}`);
    }
  }
  // eski açık teyitler kapanır (sonradan basılıp yeni kaydı ezmesin)
  for (const o of (await ayarOku(env, `fabrika:teyitAcik:${kisi}`, [])) || []) {
    const t0 = await ayarOku(env, `fabrika:teyit:${o.id}`, null);
    if (t0 && !t0.bitti) { t0.bitti = "yenisi"; await ayarYaz(env, `fabrika:teyit:${o.id}`, t0); if (o.mesaj) await tg(env, "editMessageText", { chat_id: m.chat.id, message_id: o.mesaj, text: `${dn(t0)}↪️ Yerine yeni teyit geldi (aşağıda).` }).catch(() => null); }
  }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const kartDurum = Object.fromEntries(yazilan.map((kod) => [kod, JSON.stringify((hedef[kod].d.secim || {})[kod] || null)]));
  await ayarYaz(env, `fabrika:teyit:${id}`, { kisi, zaman: simdi, metin: metin.slice(0, 300), kaynak, gr, deneme, kartDurum, anahtar: Object.fromEntries(yazilan.map((kod) => [kod, hedef[kod].anahtar])) });
  const ek = [kalan.length ? `Kartta zaten var, o da kalır: ${kalan.join("; ")}` : null, degisen.length ? `Kartta şu vardı, yerine bu yazılacak: ${degisen.join("; ")}` : null].filter(Boolean);
  const r0 = await yaz(`Şunu anladım: ${anladimYazisi(gr)}.${ek.length ? `\n(${ek.join(" · ")})` : ""} Doğru mu?`, deneme, { reply_markup: { inline_keyboard: [[{ text: "✅ Evet", callback_data: `ft:e:${id}` }, { text: "✏️ Düzelt", callback_data: `ft:d:${id}` }]] } });
  await ayarYaz(env, `fabrika:teyitAcik:${kisi}`, [{ id, mesaj: r0 && r0.ok && r0.result ? r0.result.message_id : null }]);
  return true;
}
export async function acikListe(env, simdi, cfg = MAGAZALAR[0]) {
  const gun = gunAnahtari(simdi);
  const ak = `${gun}${cfg.ek}`;
  const ana = await ayarOku(env, `fabrika:${ak}`, null);
  let anahtar = null;
  let d = null;
  for (const k of [...new Set([ak, ...((ana && ana.ekler) || []), `${ak}-ozel1`, `${ak}-ozel2`, `${ak}-ozel3`])]) { // 12 Kasım: özel liste ana liste yokken de bulunur
    const x = k === ak ? ana : await ayarOku(env, `fabrika:${k}`, null);
    if (!x) continue;
    if (x && ["soruldu", "duzelt", "onayda", "eminMi"].includes(x.asama) && (!d || x.zaman >= d.zaman)) { anahtar = k; d = x; }
  }
  return { gun, anahtar, d, ana };
}
export async function listeDurumu(env, simdi) {
  const { gun, anahtar, d, ana } = await acikListe(env, simdi);
  if (!ana) return { gun, durum: "bugün liste yok (satış girilmedi ya da henüz 10 dk sabit kalmadı)" };
  const x = d || ana;
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  return {
    gun, liste: anahtar || gun,
    durum: { soruldu: "Hemra'ya gitti, renkler bekleniyor", duzelt: "Hemra düzeltiyor", onayda: "onay kartı Hemra'da", gonderildi: `onaylandı (${x.onaylayan || "Hemra"}), fabrikaya gönderildi`, bekliyor: "satış girişi sürüyor (10 dk sabit bekleniyor)" }[x.asama] || x.asama,
    modeller: (x.modeller || []).map((m) => ({ kod: m.kod, satilan: m.satilan, stok: m.kalan, karar: secimTamam(secimNorm(x.secim && x.secim[m.kod])) ? secimYazi(secimNorm(x.secim[m.kod])).replace(/✓ /g, "") : secimEksigi(secimNorm(x.secim && x.secim[m.kod])), onceki: sonIstek[m.kod] ? sonIstekYazi(sonIstek[m.kod]) : null })),
    ekler: ana.ekler || [],
  };
}
// kararlar: [{ kod, beden: ""|kucuk|buyuk|ikisi, renkler, renkler_buyuk (ikisi için), isteme, onceki_gibi }]; hepsiOnceki: bekleyenlerin hepsi önceki gibi.
const temizRenk = (l) => (l || []).map((r) => ({ renk: String(r.renk || "").toLocaleLowerCase("tr").trim(), adet: Math.round(Number(r.adet)) })).filter((r) => r.renk && r.adet > 0 && r.adet < 1000);
export async function listeyeIsle(env, tg, simdi, kararlar, hepsiOnceki = false) {
  const { anahtar, d } = await acikListe(env, simdi);
  if (!d) return { hata: "Açık eksik listesi yok." };
  if (yeniDuzen(env, d)) return { hata: `Bu liste ${adOf(env, d)}'in kontrolünde; renk/adet o kişi kartına yazar (Sami teyit sorar).` }; // 10 Kasım: teyitsiz kayıt yok
  d.secim = d.secim || {};
  d.modeller = d.modeller || [];
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const uygula = {};
  const ekle = (kod, k) => (uygula[kod] = [...(uygula[kod] || []), k]);
  const sorun = [];
  for (const k of kararlar || []) {
    const kod = String(k.kod || "").trim();
    if (!d.modeller.some((x) => x.kod === kod)) { sorun.push(`${kod}: bu listede yok`); continue; }
    const beden = { kucuk: "k", küçük: "k", buyuk: "b", büyük: "b", ikisi: "i" }[String(k.beden || "").toLocaleLowerCase("tr")] || null;
    if (k.isteme) { ekle(kod, { isteme: true }); continue; }
    if (k.onceki_gibi) { if (sonIstek[kod]) ekle(kod, { onceki: sonIstek[kod] }); else sorun.push(`${kod}: önceki istek kaydı yok`); continue; }
    const r1 = temizRenk(k.renkler);
    const r2 = temizRenk(k.renkler_buyuk);
    if (beden === "i") {
      ekle(kod, { beden: "i" });
      if (r1.length) ekle(kod, { beden: "k", renkler: r1 });
      if (r2.length) ekle(kod, { beden: "b", renkler: r2 });
    } else if (beden || r1.length) ekle(kod, { beden, renkler: r1 });
    else sorun.push(`${kod}: beden/renk anlaşılamadı`);
  }
  if (hepsiOnceki) for (const x of d.modeller) {
    if (secimTamam(secimNorm(d.secim[x.kod])) || uygula[x.kod]) continue;
    if (sonIstek[x.kod]) ekle(x.kod, { onceki: sonIstek[x.kod] }); else sorun.push(`${x.kod}: önceki istek kaydı yok`);
  }
  if (Object.keys(uygula).length) await secimUygula(env, tg, anahtar, d, uygula, "beyin");
  const kalan = d.modeller.filter((x) => !secimTamam(secimNorm(d.secim[x.kod]))).map((x) => `${x.kod} (${secimEksigi(secimNorm(d.secim[x.kod]))})`);
  return { islenen: Object.keys(uygula).map((k) => `${k}: ${secimYazi(secimNorm(d.secim[k])).replace(/✓ /g, "")}`), sorun, kalan, onayKartiGitti: !kalan.length };
}

// Hemra'nın yazısı (liste bekleniyorsa). true dönerse mesaj işlendi.
export async function fabrikaCevabi(env, m, tg, simdi, { yorumla = null } = {}) {
  const cfg = MAGAZALAR.find((c) => c.kime(env) === String(m.from.id));
  if (!cfg) return false;
  const metin = String(m.text || "").trim();
  // 10 Kasım (Patron): Aziz/Merdan KENDİ açık kontrol kartındaki modele yazıyla renk/adet girer (teyitli)
  if (String(m.from.id) !== sorumlu(env)) return kendiKartYazisi(env, m, tg, simdi, cfg, metin, yorumla);
  if (!/^\d{4,6}(?!\d)/.test(metin)) return false;
  // "3254 siyahtan 5", "bu sefer isteme", "önceki gibi" gibi serbest yazı beyne gider (Sami'nin beyni varsa).
  if (env.ANTHROPIC_API_KEY && !duzListeMi(metin)) return false;
  // Cevap kişinin mağazasındaki en son gönderilen açık listeye (ana liste ya da ek) yazılır.
  const { anahtar, d } = await acikListe(env, simdi, cfg);
  if (!d) return false;
  const liste = listeCozBeden(metin.replace(/(\d)([a-zçğıöşü])/gi, "$1 $2")); // "3183küçük siyah 10"
  if (!liste.length) {
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Anlayamadım. Örnek: 3183 küçük siyah 10 bej 6, 3186 büyük kırmızı 5" });
    return true;
  }
  d.yazan = m.from.first_name || cfg.ad;
  d.secim = d.secim || {};
  d.modeller = d.modeller || [];
  // Listede olmayan kod yazıldıysa (ör. satılmadığı hâlde istenen) listeye eklenir.
  const yeniKodlar = liste.map((x) => x.kod).filter((k) => !d.modeller.some((x) => x.kod === k));
  if (yeniKodlar.length) {
    const ted = await stokIste(env, "/tedarikci", { kodlar: yeniKodlar });
    for (const k of yeniKodlar) d.modeller.push({ kod: k, satilan: 0, kalan: null, grup: grupOf(ted[k], k), ikiKart: Boolean(ted[k] && ted[k].ikiKart), ekstra: true });
  }
  const kararlar = {};
  for (const x of liste) (kararlar[x.kod] = kararlar[x.kod] || []).push(x.renkler.length ? { beden: x.beden, renkler: x.renkler } : { beden: x.beden });
  await secimUygula(env, tg, anahtar, d, kararlar, "metin");
  return true;
}

// 10 Kasım (Sinem): fe:E (Eminim, gönder) · fe:G (Geri dön) · fe:g (kartta ↩️ Geri al) — Aziz / Merdan
const GONDERILDI_YAZI = "Bu liste gönderildi, değişiklik için Hemra'ya yazın.";
async function eminVeGeriAl(env, cq, tg, anahtar, d, islem, kod, cevapla) {
  const simdi = Math.floor(Date.now() / 1000);
  if (!d) return cevapla("Bu liste artık geçerli değil.");
  const benim = cq.message ? { chat_id: cq.message.chat.id, message_id: cq.message.message_id } : null;
  const tamam = () => (d.modeller || []).every((x) => secimTamam(secimNorm(d.secim && d.secim[x.kod])));
  if (islem === "E") {
    if (!["eminMi", "soruldu", "duzelt"].includes(d.asama)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: ["birlesti", "kontrolEdildi", "gonderildi", "denemeOnay"].includes(d.asama) ? "Zaten gönderildi." : "Bu liste artık geçerli değil.", show_alert: true });
    if (!tamam()) return cevapla("Önce bütün kartları seçin.");
    await cevapla("Gönderiliyor");
    if (benim) await tg(env, "editMessageText", { ...benim, text: `${eminMetni(d).replace(" Göndereyim mi?", "")}\n✅ Eminim, gönder.` });
    return kartGonder(env, tg, anahtar, d, { emin: true });
  }
  if (islem === "G") {
    if (!["eminMi", "soruldu", "duzelt"].includes(d.asama)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: GONDERILDI_YAZI, show_alert: true });
    d.asama = "soruldu";
    await ayarYaz(env, `fabrika:${anahtar}`, d);
    await cevapla("Geri dönüldü");
    return benim && tg(env, "editMessageText", { ...benim, text: `↩️ Değiştirmek istediğiniz kartta "↩️ Geri al"a basın ve yeniden seçin. Hazır olunca:`, reply_markup: { inline_keyboard: [[{ text: "✅ Eminim, gönder", callback_data: `fe:E:${anahtar}:-` }]] } });
  }
  // Geri al: seçim silinir, kart aynı fotoğrafla sohbetin en altına yeniden gelir
  const kim = kisiAd(cq.from);
  if (d.asama === "birlesti") {
    const b = d.birlesik ? await ayarOku(env, `fabrika:${d.birlesik}`, null) : null;
    if (!b || !["onayda", "bos"].includes(b.asama)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: GONDERILDI_YAZI, show_alert: true }); // "bos": 0 modelli liste (onay kartı gitmemişti) — yanlış basış geri alınabilir
    b.asama = "iptal"; // Hemra'nın onay kartı geçersiz; liste yeniden birleşir
    await ayarYaz(env, `fabrika:${d.birlesik}`, b);
    if (b.hemraMesaj) await tg(env, "editMessageText", { chat_id: b.hemraMesaj[0], message_id: b.hemraMesaj[1], text: `${dn(b)}↩️ ${kim} bir kartı geri aldı (${kod}). Bu liste iptal; düzeltilince yeni liste gelecek.` }).catch(() => null);
    for (const k of b.parcalar || []) {
      if (k === anahtar) continue;
      const x = await ayarOku(env, `fabrika:${k}`, null);
      if (x && x.asama === "birlesti") { x.asama = "kontrolEdildi"; x.kontrolZaman = simdi; delete x.birlesik; await ayarYaz(env, `fabrika:${k}`, x); }
    }
    delete d.birlesik;
  } else if (!["soruldu", "duzelt", "onayda", "eminMi", "kontrolEdildi"].includes(d.asama)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: GONDERILDI_YAZI, show_alert: true });
  const m = d.mesajlar && d.mesajlar[kod];
  if (!m) return cevapla("Kart bulunamadı.");
  const onceki = secimYazi(secimNorm(d.secim[kod])).replace(/\n/g, " · ");
  delete d.secim[kod];
  d.asama = "soruldu";
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const [mesaj, tur, yazi] = m;
  const kime = kimeOf(env, d);
  await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: kime, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: `${yazi}\n\n↩️ Geri alındı (${onceki}) — kart aşağıda yeniden`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  const kl = modelKlavye(anahtar, kod, Boolean(sonIstek[kod]), null, false, Boolean(d.yeni));
  let yeniTur = tur;
  let r = tur === "foto" ? await tg(env, "copyMessage", { chat_id: kime, from_chat_id: kime, message_id: mesaj, caption: yazi, reply_markup: kl }) : null;
  if (!(r && r.ok)) { yeniTur = "metin"; r = await tg(env, "sendMessage", { chat_id: kime, text: yazi, reply_markup: kl }); }
  if (r && r.ok) d.mesajlar[kod] = [r.result.message_id, yeniTur, yazi, m[3] || null];
  await ayarYaz(env, `fabrika:${anahtar}`, d);
  await geriAlSay(env, { tur: "eksik kartı", kod, kim, liste: anahtar });
  return cevapla("Geri alındı — kart aşağıda");
}
// Hata sayacı (cuma raporu): "Geri al" basımları
async function geriAlSay(env, x) {
  const l = (await env.KAYIT.get("sami:geriAllar", "json").catch(() => null)) || [];
  await env.KAYIT.put("sami:geriAllar", JSON.stringify([...l, { zaman: Math.floor(Date.now() / 1000), ...x }].slice(-300)), { expirationTtl: 60 * 86400 }).catch(() => null);
}

// Düğmeler: fb:o|d:<gün> (Hemra), fa:e|h:<kişi> (Murat: fabrika kişisi ekle / ekleme)
export async function fabrikaDugmesi(env, cq, tg, simdi) {
  const [tur, islem, ek] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (tur === "fb") {
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (String(cq.from.id) !== kimeOf(env, d) && !(d && (d.deneme || d.patronaGitti) && muratMi(env, cq.from.id))) return cevapla(`Bu onay ${d && d.birlesik ? "Hemra" : cfgOf(d).ad}'da.`); // 11 Kasım: Hemra 2 saat onaylamazsa onay Patron'da
    if (!d || d.asama !== "onayda") return cevapla(d && d.asama === "gonderildi" ? "Zaten gönderildi." : "Bu liste artık geçerli değil.");
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "d" && d.deneme) {
      await denemeKaydi(env, ek, `Hemra onay kartı: "Düzelt"e basıldı (${kisiAd(cq.from)})`);
      return cevapla("Deneme: düzelt adımı çalıştı; onaylamak için ✅ Onayla");
    }
    if (islem === "d") {
      d.asama = "duzelt";
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla("Düzeltin");
      return tg(env, "editMessageText", { ...benim, text: `✏️ Değiştirmek istediğiniz modeli yeniden yazın (örnek: 3183 siyah 10 bej 6) ya da model mesajındaki düğmeye basın; onay kartı yeniden gelir.\n\nŞu anki:\n${listeYaz(d.liste) || "—"}` });
    }
    if (d.fabrikayaGitmez) { // 10 Kasım: DENEME — Hemra'nın onayında durur
      Object.assign(d, { asama: "denemeOnay", onayZaman: simdi, onaylayan: kisiAd(cq.from) });
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla("Deneme onaylandı");
      return tg(env, "editMessageText", { ...benim, text: `${DENEME}✅ Hemra onayladı (${d.liste.length} model). DENEME olduğu için fabrikaya GİTMEDİ.` });
    }
    if (!d.deneme || d.zincir) {
      // Gerçek liste: renk hafızası + Murat'a kopya hemen; fabrikaya gönderim parça parça (istek sınırı).
      // 10 Kasım: zincir denemesi AYNI yoldan (renk hafızası / Murat kopyası / gerçek kayıt yok; sadece Sinem)
      // 10 Kasım: önce VOLONTE listesi tamamen, sonra Black Rose (asla karışmaz)
      Object.assign(d, { asama: "gonderildi", onayZaman: simdi, onaylayan: kisiAd(cq.from), gonderilecek: d.liste.map((_, i) => i).sort((a, b) => (MAGAZA_SIRA[d.liste[a].magaza] || 0) - (MAGAZA_SIRA[d.liste[b].magaza] || 0) || ((d.acil || []).includes(d.liste[b].kod) ? 1 : 0) - ((d.acil || []).includes(d.liste[a].kod) ? 1 : 0) || a - b) });
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla(d.liste.length ? "Gönderiliyor" : "Tamam");
      if (d.deneme) {
        await tg(env, "editMessageText", { ...benim, text: `${DENEME}✅ Hemra onayladı — SADECE Sinem'e gönderiliyor (${d.liste.length} model). Fuat ve Nuri'ye gitmez.` });
        await denemeKaydi(env, ek, `Hemra onayladı (${kisiAd(cq.from)}) → sadece Sinem`);
        if (!d.liste.length) return;
        await kuyrukEkle(env, "gonderim", ek);
        return gonderimParcasi(env, ek, tg, simdi);
      }
      const sonIstek = d.mod ? {} : await ayarOku(env, "fabrika:sonIstek", {}); // 13 Kasım: deneme modu listesi hafızaya yazılmaz
      const renkler = d.mod ? {} : await ayarOku(env, "fabrika:renkler", {});
      for (const x of d.liste) renkler[x.kod] = [...new Set([...x.renkler.map((r) => r.renk), ...(renkler[x.kod] || [])])].slice(0, 8);
      for (const kod of new Set(d.liste.map((x) => x.kod))) { // renk hafızası bedenle birlikte
        const s = secimNorm(d.secim && d.secim[kod]);
        sonIstek[kod] = s && s.beden ? { beden: s.beden, gruplar: s.gruplar } : d.liste.find((x) => x.kod === kod).renkler;
      }
      if (!d.mod) { await ayarYaz(env, "fabrika:sonIstek", sonIstek); await ayarYaz(env, "fabrika:renkler", renkler); }
      const cok = new Set((d.modeller || []).filter((x) => Number(x.satilan) >= COK_SATAN).map((x) => x.kod));
      const satir = (x) => `${x.kod} — ${x.beden ? `${BEDEN[x.beden]}: ` : ""}${renkYazi(x.renkler)}${cok.has(x.kod) ? " 🔥" : ""}`;
      await tg(env, "editMessageText", { ...benim, text: d.liste.length ? `✅ Onaylandı — fabrikaya gönderiliyor (${d.liste.length} model):\n${d.liste.map(satir).join("\n")}` : "✅ Bu listeden fabrikaya bir şey istenmedi." });
      // 10 Kasım (Patron): Patron'a ayrıntılı kopya YOK; liste fabrikaya ulaşınca Venom'dan tek satır (gonderimParcasi sonu)
      if (!d.liste.length) return;
      await kuyrukEkle(env, "gonderim", ek);
      return gonderimParcasi(env, ek, tg, simdi);
    }
    // Fabrikaya her model AYRI mesaj: fotoğraf + kod/renk/seri (fiyat, maliyet, kâr, satış, stok YOK)
    Object.assign(d, { asama: "gonderildi", onayZaman: simdi });
    await ayarYaz(env, `fabrika:${ek}`, d);
    await cevapla("Gönderiliyor");
    let giden = 0;
    let kisiSayisi = 0;
    for (const x of d.liste) {
      const grup = (d.gruplar && d.gruplar[x.kod]) || "fabrika";
      const rec = await siparisAc(env, { kod: x.kod, renkler: x.renkler, liste: ek, deneme: Boolean(d.deneme), mod: Boolean(d.mod), fotoKod: d.deneme ? "3183" : x.kod, grup }, simdi);
      const r = await fabrikayaGonder(env, rec, tg);
      giden += r.giden;
      kisiSayisi = r.kisi;
    }
    if (d.deneme) await denemeKaydi(env, ek, `Hemra onayladı (${kisiAd(cq.from)}) → fabrikaya ${giden} mesaj gitti`);
    else {
      const renkler = await ayarOku(env, "fabrika:renkler", {});
      for (const x of d.liste) renkler[x.kod] = [...new Set([...x.renkler.map((r) => r.renk), ...(renkler[x.kod] || [])])].slice(0, 8);
      await ayarYaz(env, "fabrika:renkler", renkler);
    }
    await tg(env, "editMessageText", { ...benim, text: `${dn(d)}✅ Fabrikaya gönderildi (${d.liste.length} model, ${kisiSayisi} kişi):\n${listeYaz(d.liste)}` });
    // 10 Kasım: Patron'a ayrıntılı kopya yok (tek satır Venom'dan)
    return;
  }
  if (tur === "fe") { // Hemra: 🔁 Önceki gibi iste / ⏭ Bu sefer isteme — fe:<o|x>:<liste>:<kod>
    const kod = String(cq.data).split(":")[3];
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (String(cq.from.id) !== kimeOf(env, d)) return cevapla(`Bu seçim ${adOf(env, d)}'da.`);
    if (["E", "G", "g"].includes(islem)) return eminVeGeriAl(env, cq, tg, ek, d, islem, kod, cevapla);
    if (!d || !["soruldu", "duzelt", "onayda", "eminMi"].includes(d.asama) || !(d.modeller || []).some((x) => x.kod === kod)) return cevapla("Bu liste artık geçerli değil.");
    let secim;
    if (islem === "h") { // 10 Kasım: ⚠️ Bot hatası (yanlış model, yanlış stok/satış) — "İsteme" değil; Venom'a hata, sayılır, düzeltilir
      const simdiH = Math.floor(Date.now() / 1000);
      const l = (await env.KAYIT.get("sami:botHatalari", "json").catch(() => null)) || [];
      await env.KAYIT.put("sami:botHatalari", JSON.stringify([...l, { zaman: simdiH, liste: ek, kod, kim: kisiAd(cq.from) }].slice(-200)), { expirationTtl: 60 * 86400 });
      await env.KAYIT.put("sami:hata", JSON.stringify({ zaman: simdiH, hata: `eksik listesi bot hatası: ${kod} (${kisiAd(cq.from)}, liste ${ek}) — yanlış model ya da yanlış stok/satış bilgisi` }), { expirationTtl: 7 * 86400 });
      const y = (await env.KAYIT.get("venom:yetenekIstekleri", "json").catch(() => null)) || [];
      await env.KAYIT.put("venom:yetenekIstekleri", JSON.stringify([...y, { zaman: simdiH, istek: `Sami eksik listesi BOT HATASI: ${kod} (${kisiAd(cq.from)} işaretledi, liste ${ek}). Model/stok/satış verisini kontrol edip düzelt.` }].slice(-100)));
      await cevapla("Bot hatası kaydedildi — düzeltilecek");
      await secimUygula(env, tg, ek, d, { [kod]: [{ isteme: true, botHatasi: true }] }, "dugme");
      return null;
    }
    if (islem === "a") { // 10 Kasım: ✏️ Adet düzelt → yazıyla
      await cevapla("Yazın");
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod} için bedeni, rengi ve adedi yazın (örnek: ${kod} küçük siyah 10 bej 6).` });
    }
    if (islem === "o") {
      const onceki = (await ayarOku(env, "fabrika:sonIstek", {}))[kod];
      const acilA = d && !d.deneme ? (await acilOku(env))[kod] : null;
      const oncekiToplam = onceki ? (Array.isArray(onceki) ? onceki : Object.values(onceki.gruplar || {}).flat()).reduce((t, x) => t + (Number(x.adet) || 0), 0) : 0;
      if (acilA && oncekiToplam < (acilA.min || 40)) { await cevapla(`⚡ ACİL: en az ${acilA.min || 40} adet`); return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⚡ ${kod} ACİL: önceki istek ${oncekiToplam} adet; en az ${acilA.min || 40} adet olmalı. Bedeni seçip yazıyla girin (örnek: ${kod} büyük siyah 30, küçük siyah 10).` }); }
      if (!onceki) { await cevapla("Önceki istek yok"); return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `${kod}: önceki istek kaydı yok — bedeni seçin ve renk/adet yazın (örnek: ${kod} küçük siyah 10 bej 6).` }); }
      secim = { onceki };
      await cevapla(`Önceki gibi: ${sonIstekYazi(onceki)}`);
    } else if (["k", "b", "i"].includes(islem)) {
      secim = { beden: islem };
      await cevapla(islem === "i" ? "İkisi de" : BEDEN[islem]);
    } else if (islem === "D") { // 11 Kasım: 📦 Depoda var (Vegawin'de 0, rafta mal var) — repete istenmez; Hemra'nın listesinde ayrı görünür
      secim = { isteme: true, depodaVar: true };
      await cevapla("Depoda var — istenmeyecek");
    } else {
      secim = { isteme: true };
      await cevapla("Bu sefer istenmeyecek");
    }
    await secimUygula(env, tg, ek, d, { [kod]: [secim] }, "dugme");
    const s = secimNorm(d.secim[kod]);
    const eksik = secimEksigi(s);
    if (["k", "b", "i"].includes(islem) && eksik && d.asama !== "onayda") {
      const ornek = islem === "i" ? `${kod} küçük siyah 10 bej 6, ${kod} büyük siyah 5` : `${kod} ${islem === "k" ? "küçük" : "büyük"} siyah 10 bej 6`;
      const text = `📏 ${kod}: ${islem === "i" ? "Küçük ve Büyük için ayrı ayrı" : BEDEN[islem] + " için"} renk/adet yazın. Örnek: ${ornek}`;
      d.bedenMesaj = d.bedenMesaj || {};
      const eski = d.bedenMesaj[kod]; // 10 Kasım (Patron): beden değişince YENİ mesaj değil, aynı mesaj düzenlenir
      const r = eski ? await tg(env, "editMessageText", { chat_id: kimeOf(env, d), message_id: eski, text }) : null;
      if (!r || !r.ok) { const y = await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text }); if (y && y.ok) d.bedenMesaj[kod] = y.result.message_id; }
      await ayarYaz(env, `fabrika:${ek}`, d);
    }
    return;
  }
  if (tur === "fa") {
    if (!muratMi(env, cq.from.id)) return cevapla("Bu onay Murat'ta.");
    if (muratMi(env, ek)) { await env.KAYIT.delete(`sami:fabrikaAday:${ek}`); return cevapla("Bu Murat'ın (Patron) hesabı; fabrika kişisi olamaz."); }
    const aday = await env.KAYIT.get(`sami:fabrikaAday:${ek}`, "json");
    if (!aday) return cevapla("Bu istek artık geçerli değil.");
    await env.KAYIT.delete(`sami:fabrikaAday:${ek}`);
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "s") { // 9 Kasım (Patron): mağaza stok (VOLONTE) — stok kartları, fiyat/satış/para yok
      const l = ((await env.KAYIT.get("sami:stokKisiler", "json")) || []).filter((k) => String(k.id) !== String(ek));
      await env.KAYIT.put("sami:stokKisiler", JSON.stringify([...l, { id: Number(ek), ad: aday.ad, zaman: simdi }]));
      await cevapla("Eklendi");
      await tg(env, "sendMessage", { chat_id: Number(ek), text: "Merhaba! VOLONTE stok kartları (stok bitti, bulunamadı, sayım, fotoğrafsız modeller) size buradan gelecek." });
      return tg(env, "editMessageText", { ...benim, text: `📦 ${aday.ad} eklendi: mağaza stok (VOLONTE). Fiyat, satış, para bilgisi gitmez.` });
    }
    if (islem === "f") { // 9 Kasım (Patron): sadece fiyat yetkisi — başka HİÇBİR şey gitmez (stok, alış, kâr, satış, kasa, müşteri, görev, kart yok)
      const l = ((await env.KAYIT.get("sami:fiyatKisiler", "json")) || []).filter((k) => String(k.id) !== String(ek));
      await env.KAYIT.put("sami:fiyatKisiler", JSON.stringify([...l, { id: Number(ek), ad: aday.ad, zaman: simdi }]));
      await cevapla("Eklendi");
      await tg(env, "sendMessage", { chat_id: Number(ek), text: "Merhaba! Model kodunu yazın (ör. 3394), satış fiyatını söyleyeyim." });
      return tg(env, "editMessageText", { ...benim, text: `💲 ${aday.ad} eklendi: SADECE fiyat sorabilir (kod yazınca satış fiyatı). Başka hiçbir bilgi gitmez.` });
    }
    if (islem === "h") {
      await cevapla("Eklenmedi");
      return tg(env, "editMessageText", { ...benim, text: `❌ ${aday.ad} fabrika listesine eklenmedi.` });
    }
    const grup = islem === "c" ? "celal" : "fabrika";
    const kisiler = (await tumKisiler(env)).filter((k) => String(k.id) !== String(ek));
    kisiler.push({ id: Number(ek), ad: aday.ad, kullanici: aday.kullanici, grup });
    await env.KAYIT.put("sami:fabrikaKisiler", JSON.stringify(kisiler));
    await cevapla("Eklendi");
    await tg(env, "editMessageText", { ...benim, text: `✅ ${aday.ad} ${grup === "celal" ? "Celal olarak" : "fabrika listesine"} eklendi.` });
    return tg(env, "sendMessage", { chat_id: Number(ek), text: grup === "celal" ? "✅ Eklendiniz. Sizden istenecek modelleri buradan alacaksınız." : "✅ VOLONTE fabrika listesine eklendiniz. Eksik listeleri buradan alacaksınız." });
  }
  return false;
}

// Onaylanan listenin fabrikaya gönderimi: çalışma başına 4 model (Cloudflare istek sınırı); kalanı 5 dk'lık görev sürdürür.
// 10 Kasım (Sinem): mağaza mağaza — "🟦 VOLONTE LİSTESİ – BAŞLANGIÇ (X model)" … "🟦 VOLONTE LİSTESİ – SONU" [✅ Hepsi gelecek], sonra Black Rose.
// Fabrikada "bitti" denen model gönderilmez (Patron yeni repete kararı verene kadar).
async function listeBaslik(env, tg, d, magaza, son, anahtar) {
  const kisiler = (await fabrikaKisileri(env, "fabrika")).filter((k) => !d.sadece || d.sadece.map(String).includes(String(k.id))); // Celal'e mağaza başlığı gitmez; deneme sadece Sinem
  const fabrikaVar = d.liste.some((x) => (x.magaza || MAGAZA) === magaza && ((d.gruplar && d.gruplar[x.kod]) || "fabrika") === "fabrika");
  if (!fabrikaVar) return;
  const n = new Set(d.liste.filter((x) => (x.magaza || MAGAZA) === magaza && ((d.gruplar && d.gruplar[x.kod]) || "fabrika") === "fabrika").map((x) => x.kod)).size;
  const ids = ((d.recler || {})[magaza] || []);
  for (const k of kisiler) {
    await tg(env, "sendMessage", { chat_id: k.id, text: `${dn(d)}${son ? listeSonu(magaza, n) : listeBasi(magaza, n)}${!son && n > ACIK_KART_EN_FAZLA ? `\nKartlar ${ACIK_KART_EN_FAZLA}'er gelir: cevap verdikçe yenisi gelir.` : ""}${son && ids.length > 1 ? "\nHepsi aynı sürede gelecekse aşağıdan tek seferde seçebilirsiniz:" : ""}`, ...(son && ids.length > 1 ? { reply_markup: { inline_keyboard: [[{ text: "✅ Hepsi gelecek", callback_data: `fc:H:${anahtar}:${MAGAZA_KISA[magaza]}` }]] } } : {}) }).catch(() => null);
  }
}
// 11 Kasım: "fabrikaya gitti" sayımı listenin KENDİ günüyle (d = biten liste; o günün daha önce tamamen gidenleri + kısmen gidenler)
const gittiMetni = (lg, simdi, giden, bekleyen) => `${lg === gunAnahtari(simdi) ? "Bugünkü" : gunGoster(lg)} eksik listesi fabrikaya gitti: VOLONTE ${(giden.VOLONTE || []).length} model, Black Rose ${(giden.BLACKROSE || []).length} model.${bekleyen.length ? ` Ayrıca: ${bekleyen.join("; ")}.` : ""}`;
async function gidenSay(env, lg, d, anahtar) {
  const giden = (await ayarOku(env, `fabrika:fabrikayaGiden:${lg}`, {})) || {};
  const ekle = (b) => { const atl = new Set(b.atlanan || []); for (const x of b.liste || []) { if (atl.has(x.kod)) continue; const mg = x.magaza || b.magaza || MAGAZA; giden[mg] = [...new Set([...(giden[mg] || []), x.kod])]; } };
  if (d) ekle(d);
  const bekleyen = [];
  for (const k of (await ayarOku(env, `fabrika:birlesik:${lg}`, [])) || []) {
    if (k === anahtar) continue;
    const b = await ayarOku(env, `fabrika:${k}`, null);
    if (!b || denemeKaydiMi(b) || b.asama !== "gonderildi") continue;
    if (!(b.gonderilecek || []).length) ekle(b); // aynı günün daha önce tamamen gidenleri
    else for (const mg of ["VOLONTE", "BLACKROSE"]) { const n = new Set((b.liste || []).filter((x) => (x.magaza || MAGAZA) === mg).map((x) => x.kod)).size; if (n) bekleyen.push(`${mg === "BLACKROSE" ? "Black Rose" : "VOLONTE"} ${n} modellik liste kısmen gitti (${(b.gonderilecek || []).length} satır fabrikanın cevabını bekliyor)`); } // kısmen giden (5 kart sınırı)
  }
  return { giden, bekleyen };
}
// 13 Kasım (Patron, kural 40): deneme kayıtlarını sessizce kapatır. sec = {} → "mod" işaretli açık kayıtlar; sec.fs / sec.rk → verilen kayıtlar.
export async function denemeKayitlariKapat(env, simdi, sec = {}) {
  const neden = sec.neden || "deneme bitti";
  const sonuc = { fs: [], rk: [], liste: [], giden: [], hafiza: [] };
  const fsIds = sec.fs ? sec.fs.map(String) : ((await stokIste(env, "/fs-ozet", {}).catch(() => [])) || []).filter((x) => x.mod).map((x) => x.id);
  for (const id of fsIds.slice(0, 60)) {
    const rec = await siparisOku(env, id);
    if (!rec || rec.durum === "kapandi") continue;
    Object.assign(rec, { mod: true, durum: "kapandi", iptal: { neden, zaman: simdi }, kararMesajlari: [] });
    (rec.log = rec.log || []).push(`🧪 Deneme kapandı: ${neden}`);
    await siparisYaz(env, rec);
    await bitenCikar(env, rec.kod);
    sonuc.fs.push({ id: rec.id, kod: rec.kod });
  }
  sonuc.rk = await modRepeteKapat(env, simdi, sec.rk || null, neden);
  // deneme modu listeleri (özel listeler): kapanır, bir daha işlenmez
  const mod = await modOku(env);
  const gunler = sec.gun ? [sec.gun] : mod ? [...new Set([gunAnahtari(mod.basla), gunAnahtari(simdi)])] : [gunAnahtari(simdi)];
  for (const g of gunler) for (const cfg of MAGAZALAR) for (let i = 1; i <= 3; i++) {
    const k = `${g}${cfg.ek}-ozel${i}`;
    const d = await ayarOku(env, `fabrika:${k}`, null);
    if (!d || !d.mod || d.asama === "iptal") continue;
    Object.assign(d, { asama: "iptal", temizlendi: simdi });
    await ayarYaz(env, `fabrika:${k}`, d);
    sonuc.liste.push(k);
  }
  // geriye dönük: işaretsiz açılmış denemenin "fabrikaya giden" ve renk / son istek hafızasındaki izleri
  const kodlar = new Set((sec.kodlar || []).map(String));
  if (sec.gun && kodlar.size) {
    const giden = (await ayarOku(env, `fabrika:fabrikayaGiden:${sec.gun}`, null)) || null;
    if (giden) {
      for (const mg of Object.keys(giden)) { const once = giden[mg] || []; giden[mg] = once.filter((k) => !kodlar.has(String(k))); if (giden[mg].length !== once.length) sonuc.giden.push(mg); }
      await ayarYaz(env, `fabrika:fabrikayaGiden:${sec.gun}`, giden);
    }
  }
  if (sec.hafizaSil && kodlar.size) {
    const sonIstek = await ayarOku(env, "fabrika:sonIstek", {}), renkler = await ayarOku(env, "fabrika:renkler", {});
    for (const k of kodlar) { if (sonIstek[k] || renkler[k]) sonuc.hafiza.push(k); delete sonIstek[k]; delete renkler[k]; await ayarYaz(env, `karar:son:${k}`, null); }
    await ayarYaz(env, "fabrika:sonIstek", sonIstek);
    await ayarYaz(env, "fabrika:renkler", renkler);
  }
  return sonuc;
}
// 11 Kasım (TEK DEFTER): Venom "fabrikaya dün hangi modeller gitti?" sorusunu buradan okur (Sami'nin kendi kaydı; gittiMetni ile aynı sayım)
export const fabrikayaGidenler = (env, gun) => gidenSay(env, gun, null, null);

async function gonderimParcasi(env, anahtar, tg, simdi) {
  const d = await ayarOku(env, `fabrika:${anahtar}`, null);
  // 10 Kasım (Patron): fabrikaya da aynı anda en fazla 5 cevapsız kart; kalanlar cevap verdikçe (5 dk'lık görev) gelir
  let bosYer = GONDERIM_PARCA;
  const gidenIds = d && d.recler ? Object.values(d.recler).flat() : [];
  if (gidenIds.length && (d.gonderilecek || []).length) {
    const acik = (await stokIste(env, "/fs-ozet", {}).catch(() => [])).filter((x) => gidenIds.includes(x.id) && x.durum === "bekliyor").length;
    bosYer = Math.max(0, Math.min(GONDERIM_PARCA, ACIK_KART_EN_FAZLA - acik));
    if (!bosYer) return 0;
  }
  const parca = d ? (d.gonderilecek || []).slice(0, bosYer) : [];
  if (parca.length) {
    const site = await siteListesi(env);
    const bitenler = await bitenOku(env);
    d.baslik = d.baslik || {}; d.recler = d.recler || {};
    for (const [n, i] of parca.entries()) {
      const x = typeof i === "number" ? d.liste[i] : d.liste.find((y) => y.kod === i); // eski kayıt: kod
      if (!x) continue;
      const kod = x.kod;
      const magaza = x.magaza || d.magaza || MAGAZA;
      if (!d.baslik[magaza]) { d.baslik[magaza] = "basladi"; await listeBaslik(env, tg, d, magaza, false, anahtar); }
      if (bitenler[kod] && !d.deneme) { d.atlanan = [...new Set([...(d.atlanan || []), kod])]; }
      else {
        const rec = await siparisAc(env, { kod, beden: x.beden || null, renkler: x.renkler, liste: anahtar, deneme: Boolean(d.deneme), mod: Boolean(d.mod), fotoKod: kod, grup: (d.gruplar && d.gruplar[kod]) || "fabrika", sorumlu: d.sorumlu || null, magaza, sadece: d.sadece || null }, simdi);
        if (d.zincir) rec.zincir = true;
        if (d.yeni) rec.yeni = true; // 11 Kasım: "Bitti" → yeni Hemra kartı (satış + öneri + Repete / Bitene kadar bekle / Sil)
        if (d.test) { rec.test = true; rec.testVeri = (d.modeller || []).find((m) => m.kod === kod) || null; }
        if (!d.deneme && (d.acil || []).includes(kod)) { // 10 Kasım: fabrikaya ⚡ ACİL (stok bilgisi gitmez); eski açık istek kapanır (aynı model iki kez istenmez)
          rec.acil = true;
          if ((d.yerineKodlar || []).includes(kod)) rec.yerine = true; // aynı modelin önceki satırı eski isteğin yerine geçtiyse bu satır da
          const eskiler = (await stokIste(env, "/fs-ozet", {}).catch(() => [])).filter((y) => String(y.kod) === kod && !y.deneme && y.id !== rec.id && (y.grup || "fabrika") === (rec.grup || "fabrika") && ["bekliyor", "gelecek", "repete", "sureSoruluyor"].includes(y.durum));
          for (const y of eskiler) {
            const er = await siparisOku(env, y.id);
            if (!er || er.liste === anahtar || (er.gonderim || 0) >= (d.onayZaman || simdi)) continue; // 10 Kasım HATA DÜZELTMESİ: aynı listenin satırları (ör. 3419 Küçük + Büyük) birbirini kapatmaz
            Object.assign(er, { durum: "kapandi", iptal: { neden: "⚡ ACİL istek yerine geçti", zaman: simdi } });
            er.log.push("↪️ Yerine ⚡ ACİL istek geldi");
            await mesajlariGuncelle(env, er, "↪️ Bu istek yerine ⚡ ACİL istek geldi (aşağıda). Bu kartı cevaplamayın.", tg).catch(() => null);
            await siparisYaz(env, er);
            rec.yerine = true;
            d.yerineKodlar = [...new Set([...(d.yerineKodlar || []), kod])];
          }
        }
        const r = await fabrikayaGonder(env, rec, tg, site);
        d.giden = (d.giden || 0) + r.giden;
        if ((rec.grup || "fabrika") === "fabrika") (d.recler[magaza] = d.recler[magaza] || []).push(rec.id); // toplu cevap sadece fabrikanın kartlarına
      }
      const kalan = d.gonderilecek.slice(n + 1).map((j) => (typeof j === "number" ? d.liste[j] : d.liste.find((y) => y.kod === j)));
      if (!kalan.some((y) => y && (y.magaza || d.magaza || MAGAZA) === magaza)) { d.baslik[magaza] = "bitti"; await listeBaslik(env, tg, d, magaza, true, anahtar); }
    }
    d.gonderilecek = d.gonderilecek.slice(parca.length);
    await ayarYaz(env, `fabrika:${anahtar}`, d);
  }
  const gonderilen = parca.length;
  if (!d || !(d.gonderilecek || []).length) {
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    k.gonderim = k.gonderim.filter((x) => x !== anahtar);
    await ayarYaz(env, "fabrika:kuyruk", k);
    if (d && d.liste && d.liste.length && !denemeKaydiMi(d) && !d.fabrikaBildirildi && (d.giden || 0) > 0) { // fabrikaya gerçekten mesaj ulaştıysa
      // 10 Kasım (Patron): liste fabrikaya ulaşınca Patron'a Venom'dan TEK satır — bugün fabrikaya giden modeller, mağaza mağaza
      d.fabrikaBildirildi = simdi;
      await ayarYaz(env, `fabrika:${anahtar}`, d);
      // 11 Kasım HATA DÜZELTMESİ: sayım listenin KENDİ günüyle yapılır (son satır ertesi sabah gidince "bugün" sanılıp
      // önceki akşam giden Black Rose listesi 0 sayılıyordu); mesajda listenin tarihi yazar
      const lg = d.gun || anahtar.slice(0, 10);
      const { giden, bekleyen } = await gidenSay(env, lg, d, anahtar);
      await ayarYaz(env, `fabrika:fabrikayaGiden:${lg}`, giden);
      const metin = gittiMetni(lg, simdi, giden, bekleyen);
      await stokIste(env, "/kuyruk-ekle", { ad: "fabrikaGitti", kayit: { id: `fg-${anahtar}-${simdi}`, metin, zaman: simdi } }).catch(() => null);
    }
    if (d && d.liste && d.liste.length) {
      await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: `${dn(d)}✅ ${gunGoster(d.gun || anahtar.slice(0, 10))} listesi ${d.sadece ? "SADECE Sinem'e" : "fabrikaya"} gönderildi (${d.liste.length} model, ${d.giden || 0} mesaj).${(d.atlanan || []).length ? ` Fabrikada bitti, gönderilmedi: ${d.atlanan.join(", ")}.` : ""}` });
      const sl = d.deneme ? null : await ayarOku(env, "fabrika:sonListeler", []); // toplu cevap ("hepsi 5 gün") için — deneme gerçek toplu cevaba karışmaz
      if (sl) await ayarYaz(env, "fabrika:sonListeler", [...sl.filter((x) => x.anahtar !== anahtar && simdi - x.zaman < 10 * 86400), { anahtar, zaman: simdi }].slice(-10));
    }
  }
  return gonderilen || 1;
}

// Yetkisiz kişi yazınca: fabrika kişisiyse kısa cevap; değilse /start ile Murat'a sorulur (bir kez).
// ---------- 9 Kasım (Patron): JANET – SADECE FİYAT ----------
export async function fiyatKisisiMi(env, id) {
  let l = null; try { l = await env.KAYIT.get("sami:fiyatKisiler", "json"); } catch { l = null; }
  if (typeof l === "string") { try { l = JSON.parse(l); } catch { l = null; } }
  return Array.isArray(l) && l.some((k) => String(k.id) === String(id));
}
const fiyatYaz = (n) => `${(Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ",")} $`;
// "3394" / "fiyat 3394" / "3394 fiyat" / "price 3394" / "prix 3394" / "3394 3627 price" → her kod ayrı satır; başka metin → kısa yönlendirme
export function fiyatSorusu(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr").replace(/\b(fiyat[ıi]?|fiyatlar[ıi]?|price|prices|prix|ne\s*kadar)\b/g, " ").replace(/[,.;:?!/]+/g, " ");
  const kodlar = t.match(/\b\d{3,6}\b/g) || [];
  return kodlar.length && !t.replace(/\b\d{3,6}\b/g, "").trim() ? [...new Set(kodlar)].slice(0, 15) : null;
}
export async function fiyatCevabi(env, m, tg) {
  const kodlar = fiyatSorusu(m.text);
  if (!kodlar) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Ben sadece kodla satış fiyatı söylerim. Model kodunu yazın." }); // 13 Kasım (Patron onaylı yazı, kural 48)
  const satir = [];
  for (const kod of kodlar) {
    const b = await stokIste(env, "/bilgi", { kod }).catch(() => null);
    const l = ((b && b.satirlar) || []).filter((r) => r.fiyat != null && Number(r.fiyat) > 0);
    if (!l.length) { satir.push(`${kod}: bu kod yok`); continue; }
    const fiyatlar = [...new Set(l.map((r) => Number(r.fiyat)))];
    satir.push(fiyatlar.length === 1 ? `${kod} · satış fiyatı: ${fiyatYaz(fiyatlar[0])}` : `${kod} · satış fiyatı: ${l.map((r) => `${String(r.magaza).toUpperCase() === "BLACKROSE" ? "BLACK ROSE" : r.magaza} ${fiyatYaz(r.fiyat)}`).join(" · ")}`);
  }
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: satir.join("\n") });
}
export async function yabanciMesaji(env, m, tg) {
  if (await fabrikaKisisiMi(env, m.from.id)) {
    if (await repeteMetni(env, m, tg, Math.floor(Date.now() / 1000))) return;
    const celalMi = kisiGrubu(await kisiKaydi(env, m.from.id)) === "celal";
    const sorgu = !celalMi && ((await env.KAYIT.get("sami:stokSorguIds", "json")) || []).map(String).includes(String(m.from.id));
    return tg(env, "sendMessage", { chat_id: m.chat.id, text: `Bu bot size sadece ${celalMi ? "sizden istenen modellerin listesini" : "VOLONTE fabrika eksik listesini"} gönderir. Repete gelince: "3394 geldi" ya da "3394 repete geldi siyah 10 bej 6" yazabilirsiniz.${sorgu ? "\nBlack Rose stoğu için: /stok 3900 (onaylanınca cevap gelir)." : ""}` });
  }
  if (!/^\/start\b/i.test(String(m.text || "").trim())) return;
  const eskiAday = await env.KAYIT.get(`sami:fabrikaAday:${m.from.id}`, "json").catch(() => null);
  if (eskiAday && eskiAday.v2) return; // 9 Kasım: eski kart "sadece fiyat" seçeneği olmadan gitmişse bir kez yeniden sorulur
  const ad = [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username || String(m.from.id);
  await env.KAYIT.put(`sami:fabrikaAday:${m.from.id}`, JSON.stringify({ ad, kullanici: m.from.username || null, v2: true }), { expirationTtl: 30 * 86400 });
  await tg(env, "sendMessage", {
    chat_id: murat(env),
    text: `🏭 ${ad}${m.from.username ? ` (@${m.from.username})` : ""} Sami'ye /start yazdı. Kim olarak eklensin?\n• Fabrika (Fuat'ın ekibi): fabrika eksik listesi + sipariş kartları\n• Celal'in ekibi: sadece Celal modelleri\n• Mağaza: stok (VOLONTE) — stok bitti / bulunamadı / sayım / fotoğrafsız VOLONTE kartları (fiyat, satış, para yok)\n• Mağaza: sadece fiyat — kod yazınca satış fiyatı, başka hiçbir şey\nYanlış seçilirse Venom'a: /rol <ad> fiyat | stok | fabrika | celal | sil`,
    reply_markup: { inline_keyboard: [[{ text: "🏭 Fabrika (Fuat'ın ekibi)", callback_data: `fa:e:${m.from.id}` }, { text: "👤 Celal'in ekibi", callback_data: `fa:c:${m.from.id}` }], [{ text: "📦 Mağaza: stok (VOLONTE)", callback_data: `fa:s:${m.from.id}` }, { text: "💲 Mağaza: sadece fiyat", callback_data: `fa:f:${m.from.id}` }], [{ text: "❌ Ekleme", callback_data: `fa:h:${m.from.id}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Merhaba! İsteğiniz yöneticiye iletildi; onaylanınca eksik listelerini buradan alacaksınız." });
}

// ---------- Model başına fabrika siparişi (kullanıcı kararı 29 Ekim) ----------
// Kayıtlar Sami'nin deposunda: "fs:<id>" (açıklar listesi "fs:acik"). Deneme kayıtları "D…" ile başlar, gerçek
// listeye karışmaz; denemede kanal paylaşımı ve silme YAPILMAZ.
export const DENEME = "🧪 DENEME – üretim yapmayın\n";
// 13 Kasım (Patron, kural 40): deneme modu kaydı ("mod") → Patron onaylı satır; eski iç test ("deneme") → eski satır
export const dn = (x) => (x && x.mod ? MOD_SATIR : x && x.deneme ? DENEME : "");
const SURELER = { 3: "2-3 gün", 5: "5 gün", 7: "1 hafta", 10: "10 gün" }; // eski kartlar için
// 10 Kasım (Sinem): teslim süresi düğmeleri — sayı = üst sınır (takip o gün yapılır)
export const SURE_SECENEK = { 6: "4-6 gün", 8: "4-8 gün", 15: "10-15 gün", 20: "15+ gün" };
// 12 Kasım (Patron): "Repete olacak" süresi SADECE 4-8 gün / 10-15 gün ("Gelecek"te süre sorulmaz)
const repeteSureSatirlari = (on) => [[{ text: "⏱ 4-8 gün", callback_data: `${on}:8` }, { text: "⏱ 10-15 gün", callback_data: `${on}:15` }]];
const sureAd = (g) => SURE_SECENEK[g] || SURELER[g] || `${g} gün`;
const sureSatirlari = (on) => [[{ text: "⏱ 4-6 gün", callback_data: `${on}:6` }, { text: "⏱ 10-15 gün", callback_data: `${on}:15` }], [{ text: "⏱ 15+ gün", callback_data: `${on}:20` }, { text: "✏️ Tarih yaz", callback_data: `${on}:y` }]];
const AYLAR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
// "18.11" · "18 Kasım" · "7 gün" · "4-6 gün" · "2 hafta" → { gun, hazirGun, etiket } (yoksa null)
export function tarihCoz(metin, simdi) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  const bugun = gunAnahtari(simdi);
  const gunle = (g, etiket) => (g > 0 && g <= 180 ? { gun: g, hazirGun: gunAnahtari(simdi + g * 86400), etiket } : null);
  let m = t.match(/(\d{1,3})\s*(?:-|–|ila)\s*(\d{1,3})\s*(?:iş\s*)?gün/);
  if (m) return gunle(Number(m[2]), `${m[1]}-${m[2]} gün`);
  m = t.match(/(\d{1,3})\s*(?:iş\s*)?gün/);
  if (m) return gunle(Number(m[1]), `${m[1]} gün`);
  m = t.match(/(\d{1,2})\s*hafta/);
  if (m) return gunle(Number(m[1]) * 7, `${m[1]} hafta`);
  let g = null, a = null;
  m = t.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (m) { g = Number(m[1]); a = Number(m[2]); }
  else { m = t.match(/\b(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/); if (m) { g = Number(m[1]); a = AYLAR.indexOf(m[2]) + 1; } }
  if (!g || !a || g > 31 || a > 12) return null;
  let yil = Number(bugun.slice(0, 4));
  let hedef = `${yil}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  if (hedef < bugun) { yil++; hedef = `${yil}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`; }
  const fark = Math.round((gunBasi(hedef) - gunBasi(bugun)) / 86400);
  return fark >= 0 && fark <= 180 ? { gun: fark, hazirGun: hedef, etiket: `${gunGoster(hedef).slice(0, 5)} (tarih)` } : null;
}
const kisiAd = (f) => [...new Set([f.first_name, f.last_name].filter(Boolean))].join(" ") || f.username || String(f.id); // "Hemra Hemra" → "Hemra"
// 9 Kasım (Patron): fabrika/repete kararları ve bilgileri Hemra ve Merdan'a; Patron'a sadece akşam özetinde sayı (Venom).
// Patron'un ya da mağaza hesabının kendi girdiği bilgi Patron'a geri dönmez.
// 10 Kasım (Patron): fabrika bilgisi Hemra'ya; Merdan'a SADECE kesin Black Rose modeli (marka tahmin edilmez → VOLONTE / belirsiz Merdan'a gitmez)
const brKisi = (env) => String(env.BR_SORUMLU || "").split(",")[0].trim();
const brMi = (env, rec) => Boolean(rec && (rec.magaza === "BLACKROSE" || (!rec.magaza && rec.sorumlu && String(rec.sorumlu) === brKisi(env))));
const bildirilecekler = (env, rec = null) => [...new Set([sorumlu(env), ...(brMi(env, rec) ? [brKisi(env)] : [])].filter((x) => x && !muratMi(env, x)))];
const renkSeri = (renkler) => renkler.map((r) => `${r.renk} ${r.adet} seri`).join(", ");

export async function denemeKaydi(env, did, adim) {
  const k = (await env.KAYIT.get(`venom:deneme:${did}`, "json")) || { basla: Math.floor(Date.now() / 1000), adimlar: [] };
  k.adimlar.push({ adim, zaman: Math.floor(Date.now() / 1000) });
  await env.KAYIT.put(`venom:deneme:${did}`, JSON.stringify(k), { expirationTtl: 14 * 86400 });
}
export async function denemeOzeti(env, did, tg, sebep = "bitti") {
  const k = await env.KAYIT.get(`venom:deneme:${did}`, "json");
  if (!k || k.ozet) return;
  k.ozet = true;
  await env.KAYIT.put(`venom:deneme:${did}`, JSON.stringify(k), { expirationTtl: 14 * 86400 });
  const adimlar = ["Hemra onayı", "fabrikaya mesaj", "fabrika cevabı", "repete süresi", "repete geldi", "Kemal paylaşım onayı"];
  const metin = k.adimlar.map((a, i) => `${i + 1}) ${a.adim}`).join("\n");
  const eksik = adimlar.filter((a) => !k.adimlar.some((x) => x.adim.toLowerCase().includes(a.split(" ")[0].toLowerCase())));
  await tg(env, "sendMessage", { chat_id: murat(env), text: `🧪 Fabrika denemesi ${sebep === "sure" ? "48 saatte bitmedi, yarım haliyle kapatıldı" : "bitti"}:\n\n${metin || "(adım yok)"}${eksik.length ? `\n\nÇalışmayan / basılmayan: ${eksik.join(", ")}` : "\n\n✅ Bütün adımlar çalıştı."}\n\nKanalda hiçbir şey paylaşılmadı, hiçbir şey silinmedi.` });
}

const siparisOku = (env, id) => ayarOku(env, `fs:${id}`, null);
// Sıradaki zamanlı iş (hatırlatma / teslim günü / beklesin): "fs:takip" dizini — görev sadece zamanı gelenleri okur.
const GIRIS_SN = 7200; // fabrikadan "geldi" denince Vegawin'de stoğun görünmesi için süre
// Black Rose modeli (Vegawin kaydı sadece BLACKROSE'ta) → Merdan; diğerleri liste sahibi ya da Hemra
async function girisSorumlusu(env, rec) {
  const b = await stokIste(env, "/bilgi", { kod: rec.kod }).catch(() => null);
  const magazalar = new Set(((b && b.satirlar) || []).map((s) => s.magaza));
  if (magazalar.size === 1 && magazalar.has("BLACKROSE")) return String(env.BR_SORUMLU || "") || sorumlu(env);
  return rec.sorumlu ? String(rec.sorumlu) : sorumlu(env);
}
// 9 Kasım (Patron, ONAY MERDİVENİ): iş günü 24 saat sonraki ilk mesai anı (hafta içi 09–20)
export function isGunuSonra(bas, sn = 86400) {
  for (let t = bas + sn; t < bas + 14 * 86400; t += 900) if (isGunuSuresi(bas, t) >= sn && mesaiMi(t)) return t;
  return bas + sn;
}
export function takipZamani(rec) {
  const l = [];
  if (rec.durum === "bekliyor" && !rec.hatirlatildi) l.push(isGunuSonra(rec.gonderim));
  if (rec.durum === "bekliyor" && rec.hatirlatildi && !rec.ekibe && !denemeKaydiMi(rec)) l.push(isGunuSonra(rec.hatirlatmaZaman || rec.gonderim + 86400));
  if (rec.durum === "repete" && rec.hazirZaman && !rec.hazirSoruldu) l.push(rec.hazirZaman);
  if (["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && !rec.teslimHatirlatildi) l.push(gunBasi(rec.hazirGun) + 10 * 3600);
  // 10 Kasım (Sinem): teslim takibi — o gün 17:00'de gelmediyse fabrikaya soru → iş günü 24 saat cevap yoksa bir kez daha → sonra ekibe
  if (["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && rec.teslimHatirlatildi && !rec.teslimSoru && rec.gelenAdet == null) l.push(gunBasi(rec.hazirGun) + 17 * 3600);
  if (["gelecek", "repete"].includes(rec.durum) && rec.teslimSoru && !rec.teslimCevap && !rec.teslimSoruTekrar) l.push(isGunuSonra(rec.teslimSoru));
  if (["gelecek", "repete"].includes(rec.durum) && rec.teslimSoruTekrar && !rec.teslimCevap && !rec.teslimEkibe && !denemeKaydiMi(rec)) l.push(isGunuSonra(rec.teslimSoruTekrar));
  if (rec.durum === "bitti" && rec.karar === "stokBitene" && rec.stokKontrol) l.push(rec.stokKontrol);
  if (rec.durum === "bitti" && rec.karar === "beklesin" && !rec.tekrarSoruldu && rec.beklesinZaman) l.push(rec.beklesinZaman);
  if (rec.durum === "geldi" && !rec.deneme && rec.geldiZaman && !rec.girisKontrol) l.push(rec.geldiZaman + GIRIS_SN);
  return l.length ? Math.min(...l) : null;
}
// Tek çağrıda: kayıt + açıklar + takip dizini + haftalık özet (Cloudflare istek sınırı).
async function siparisYaz(env, rec) {
  if (rec._defter !== rec.durum && !denemeKaydiMi(rec)) { rec._defter = rec.durum; await defterIs(env, "sami", `fabrika siparişi ${rec.kod}: ${{ bekliyor: "fabrikaya gitti, cevap bekleniyor", gelecek: "gelecek", repete: "repete olacak", geldi: "geldi", bitti: "fabrika bitti dedi", kapandi: "kapandı" }[rec.durum] || rec.durum}`, { kod: rec.kod }); }
  const ozet = { kod: rec.kod, magaza: rec.magaza || null, beden: rec.beden || null, renkler: rec.renkler, grup: rec.grup, tur: rec.tur, durum: rec.durum, gonderim: rec.gonderim, cevaplayan: rec.cevaplayan || null, cevapZaman: rec.cevapZaman || null, hazirGun: rec.hazirGun || null, geldi: rec.geldiZaman || null };
  await stokIste(env, "/fs-yaz", { rec, kapali: ["geldi", "kapandi"].includes(rec.durum), takip: takipZamani(rec), hafta: denemeKaydiMi(rec) ? null : pazartesi(rec.gonderim), ozet });
}
async function siparisAc(env, { kod, beden = null, renkler, liste, deneme, fotoKod, tur = "eksik", grup = "fabrika", sorumlu: listeSorumlusu = null, magaza = null, sadece = null, mod = false }, simdi) {
  const id = `${deneme ? "D" : ""}${kod}-${simdi.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const rec = { id, kod, beden, renkler, liste, deneme, ...(mod && !deneme ? { mod: true } : {}), fotoKod, tur, grup, sorumlu: listeSorumlusu, magaza, sadece, durum: "bekliyor", gonderim: simdi, mesajlar: [], log: [] };
  await siparisYaz(env, rec);
  return rec;
}

// Fotoğraf: önce sitedeki (doğruluğu kesin), yoksa Kemal'in kataloğundaki en yeni kanal paylaşımı.
async function fotoBul(env, kod, site = null) {
  const url = sitedenFoto(env, site || (await siteListesi(env)), kod);
  if (url) return { tur: "site", url };
  const kanal = await env.KAYIT.get("kanal", "json");
  const gruplar = [...(((await env.KAYIT.get("kodlar", "json")) || {})[kod] || [])].sort((a, b) => b.tarih - a.tarih);
  // Aday kanal mesajları (en yeni paylaşımdan başlayarak; yazılı parça önce) — biri kopyalanamazsa sıradaki denenir.
  const adaylar = gruplar.flatMap((g) => [g.y, ...g.ids]).filter((x, i, l) => x > 0 && l.indexOf(x) === i).slice(0, 4);
  return kanal && adaylar.length ? { tur: "kanal", kanal: kanal.id, id: adaylar[0], adaylar } : null;
}

// Celal'e giden mesajda "VOLONTE" yazmaz (kullanıcı kararı)
// Fabrikaya/Celal'e: "3183 · siyah 10 · bej 6" — stok, satış, fiyat, maliyet ASLA yok (kullanıcı kararı 30 Ekim).
const siparisMetni = (rec) => `${dn(rec)}${rec.magaza && rec.grup !== "celal" ? `${magazaAdi(rec.magaza)}\n` : ""}${rec.acil ? (rec.yerine ? "⚡ ACİL — bugünkü isteğin YERİNE bu geçerli\n" : "⚡ ACİL\n") : ""}${rec.tur === "repete" ? "🔁 Repete isteği\n" : rec.tur === "kalan" ? "📦 Eksik gelen kısım\n" : ""}${rec.kod}${rec.deneme ? (rec.grup === "celal" ? " CELAL DENEME" : " DENEME") : ""}${rec.beden ? ` · ${BEDEN[rec.beden]}` : ""} · ${rec.renkler.map((r) => `${r.renk} ${r.adet}`).join(" · ")}`;
// 10 Kasım (Sinem): cevap geri alınabilir mi? Sonraki adım atılana kadar (Fuat onayı, Hemra/Patron kararı, mal geldi, iptal) evet.
export const geriAlinabilir = (rec) => Boolean(rec && rec.cevaplayan) && ["gelecek", "repete", "sureSoruluyor", "bitti"].includes(rec.durum) && !rec.fuatOnay && !rec.karar && !rec.hemraOneri && !rec.geldiZaman && !rec.iptal;
function klavye(rec) {
  // 10 Kasım (Patron): cevaptan sonra kartta SADECE "↩️ Geri al" kalır (ya da hiçbir düğme)
  if (rec.cevaplayan && rec.durum !== "bekliyor") return { inline_keyboard: geriAlinabilir(rec) ? [[GERI_AL(`fc:u:${rec.id}`)]] : [] };
  const satir = [];
  if (["bekliyor"].includes(rec.durum)) satir.push([{ text: "✅ Gelecek", callback_data: `fc:g:${rec.id}` }], [{ text: "🔁 Repete olacak", callback_data: `fc:r:${rec.id}` }], [{ text: "❌ Bitti, gelmeyecek", callback_data: `fc:b:${rec.id}` }]);
  if (["bekliyor", "gelecek", "repete"].includes(rec.durum) && !rec.azKaldi && rec.tur !== "kalan") satir.push([{ text: "⚠️ Az kaldı", callback_data: `fc:z:${rec.id}` }]);
  if (["repete", "gelecek"].includes(rec.durum)) satir.push([{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]);
  if ((rec.kanalFoto || rec.deneme) && !["geldi", "kapandi"].includes(rec.durum)) satir.push([{ text: "⚠️ Fotoğraf yanlış model", callback_data: `fc:y:${rec.id}` }]);
  if (geriAlinabilir(rec)) satir.push([GERI_AL(`fc:u:${rec.id}`)]);
  return { inline_keyboard: satir };
}

async function fabrikayaGonder(env, rec, tg, site = null) {
  let kisiler = await fabrikaKisileri(env, rec.grup || "fabrika"); // Celal modelleri sadece Celal'e, diğerleri sadece fabrikaya
  if (rec.sadece) kisiler = kisiler.filter((k) => rec.sadece.map(String).includes(String(k.id))); // 10 Kasım: deneme sadece Sinem'e
  if (rec.deneme && !kisiler.length) kisiler = [{ id: Number(murat(env)), ad: `Murat (${rec.grup === "celal" ? "Celal" : "fabrika kişisi"} yok)` }];
  const foto = await fotoBul(env, rec.fotoKod || rec.kod, site);
  rec.kanalFoto = Boolean(foto && foto.tur === "kanal");
  const metin = siparisMetni(rec);
  let giden = 0;
  // Gerçek siparişte fotoğraf ZORUNLU (kullanıcı kararı 29 Ekim): fotoğraf bulunamazsa mesaj gitmez, Murat'a haber verilir.
  let calisan = foto && foto.tur === "kanal" ? null : undefined; // kanalda kopyalanabilen mesaj (ilk kişide bulunur)
  for (const k of kisiler) {
    let r = null;
    let tur = "foto";
    if (foto && foto.tur === "site") for (const u of [foto.url, tamFoto(foto.url)]) { r = await tg(env, "sendPhoto", { chat_id: k.id, photo: u, caption: metin, reply_markup: klavye(rec) }); if (r && r.ok) break; }
    if (foto && (foto.tur === "kanal" || !(r && r.ok))) { // kanal yazısı (fiyat vb.) GİTMEZ: yazı değiştirilir
      for (const id of calisan ? [calisan] : (foto.adaylar || [foto.id]).filter(Boolean)) {
        if (!foto.kanal) break;
        r = await tg(env, "copyMessage", { chat_id: k.id, from_chat_id: foto.kanal, message_id: id, caption: metin, reply_markup: klavye(rec) });
        if (r && r.ok) { calisan = id; break; }
      }
    }
    if ((!r || !r.ok) && (rec.deneme || rec.grup === "celal")) { tur = "metin"; r = await tg(env, "sendMessage", { chat_id: k.id, text: metin, reply_markup: klavye(rec) }); } // 12 Kasım: Celal'e fotoğrafsız
    if (r && r.ok) { giden++; rec.mesajlar.push([k.id, r.result.message_id, tur]); }
  }
  if (!rec.deneme && !giden && kisiler.length) {
    rec.fotoYok = true;
    await tg(env, "sendMessage", { chat_id: murat(env), text: `📷 ${rec.kod} fotoğraf bulunamadı — fabrikaya gönderilmedi (${siparisMetni(rec)}). Sitede ya da kanalda fotoğrafı olunca tekrar gönderilebilir.` });
  }
  await siparisYaz(env, rec);
  return { giden, kisi: kisiler.length };
}

// 9 Kasım (ONAY MERDİVENİ): kartın kendisi yeniden — her sipariş kendi kartında (cevaptan sonra "kaç günde hazır?" o kartta sorulur),
// birden çok sipariş varsa tek başlık mesajının altında arka arkaya. Eski kartın üstüne "⏩ Güncel kart aşağıda" (düğmeler aynen çalışır).
async function kartKopyala(env, tg, rec, [chat, mesaj, tur], hedef, baslik) {
  const metin = `${baslik}\n${siparisMetni(rec)}`;
  const kl = klavye(rec);
  const r = tur === "foto"
    ? await tg(env, "copyMessage", { chat_id: hedef, from_chat_id: chat, message_id: mesaj, caption: metin.slice(0, 1024), reply_markup: kl })
    : await tg(env, "sendMessage", { chat_id: hedef, text: metin, reply_markup: kl });
  return r && r.ok ? [hedef, r.result.message_id, tur] : null;
}
async function eskiKartKapat(env, tg, rec, mesajlar) {
  for (const [chat, mesaj] of mesajlar) try { await tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: mesaj, reply_markup: { inline_keyboard: [[{ text: "⏩ Güncel kart aşağıda", callback_data: GUNCEL }], ...klavye(rec).inline_keyboard] } }); } catch { /* eski kart */ }
}
const gunGos = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
export async function fabrikayaTekrar(env, recler, tg) {
  const kisiye = {};
  for (const rec of recler) for (const m of rec.mesajlar) (kisiye[m[0]] = kisiye[m[0]] || []).push([rec, m]);
  for (const [chat, l] of Object.entries(kisiye)) {
    if (l.length > 1) await tg(env, "sendMessage", { chat_id: chat, text: `⏰ Hatırlatma: lütfen onay verin — ${l.length} sipariş cevabınızı bekliyor (aşağıda).` });
    for (const [rec, m] of l) {
      const yeni = await kartKopyala(env, tg, rec, m, chat, `${dn(rec)}⏰ Hatırlatma: lütfen onay verin`);
      if (yeni) { await eskiKartKapat(env, tg, rec, [m]); rec.mesajlar.push(yeni); }
    }
  }
  for (const rec of recler) { rec.log.push("⏰ Kart fabrikaya bir kez yeniden gönderildi"); await siparisYaz(env, rec); }
}
export async function ekibeFabrikaBildir(env, tumRecler, tg, simdi) {
  const ekip = [...new Set(tumRecler.flatMap((r) => bildirilecekler(env, r)))]; // 10 Kasım: Merdan'a sadece Black Rose
  for (const kisi of ekip) {
    const recler = tumRecler.filter((r) => bildirilecekler(env, r).includes(kisi));
    const liste = recler.map((r) => `${r.kod} (${gunGos(r.gonderim)})`).join(", ");
    await tg(env, "sendMessage", { chat_id: kisi, text: `🏭 Fabrika şu siparişlere onay vermedi: ${liste}. Bilginiz olsun, lütfen arayın. Cevap gelince kartın altındaki düğmeden seçin.` });
    for (const rec of recler) {
      const kaynak = rec.mesajlar.find((m) => !ekip.includes(String(m[0]))) || rec.mesajlar[0];
      if (!kaynak) continue;
      const yeni = await kartKopyala(env, tg, rec, kaynak, kisi, `🏭 Fabrika onay vermedi (gönderim ${gunGos(rec.gonderim)})`);
      if (!yeni) continue;
      rec.mesajlar.push(yeni);
      try { await tg(env, "editMessageReplyMarkup", { chat_id: kisi, message_id: yeni[1], reply_markup: { inline_keyboard: [...klavye(rec).inline_keyboard, [{ text: "📞 Aradım, şu cevap geldi", callback_data: `fc:a:${rec.id}` }]] } }); } catch { /* */ }
    }
  }
  const l = (await env.KAYIT.get("fabrika:ekibe", "json").catch(() => null)) || [];
  await env.KAYIT.put("fabrika:ekibe", JSON.stringify([...l.filter((x) => simdi - x.zaman < 14 * 86400), ...tumRecler.map((r) => ({ id: r.id, kod: r.kod, gonderim: r.gonderim, zaman: simdi }))].slice(-100)), { expirationTtl: 15 * 86400 });
  for (const rec of tumRecler) { rec.log.push(`🏭 ${brMi(env, rec) ? "Hemra ve Merdan'a" : "Hemra'ya"} bildirildi (fabrika 2 iş günü cevap vermedi)`); await siparisYaz(env, rec); }
}
// 9 Kasım (Patron): iş defteri 1 Kasım'dan doldurulur — fabrikaya giden siparişler + kim ne cevap verdi (defter açılmadan önceki)
export async function fabrikaDefterDoldur(env, simdi) {
  const ilk = Math.floor(Date.parse("2026-11-01T00:00:00+03:00") / 1000);
  const mevcut = await stokIste(env, "/isd-oku", { basla: ilk, bitis: simdi }).catch(() => []);
  const t0 = Math.min(simdi, ...(Array.isArray(mevcut) ? mevcut : []).filter((r) => r.sonuc !== "geçmiş kayıt").map((r) => Number(r.zaman)));
  const kayit = [];
  for (const h of ["2026-10-26", "2026-11-02", "2026-11-09"]) {
    for (const id of Object.keys(await ayarOku(env, `fs:hafta:${h}`, {}))) {
      const rec = await siparisOku(env, id);
      if (!rec || rec.deneme || rec.gonderim < ilk || rec.gonderim >= t0) continue;
      kayit.push({ zaman: rec.gonderim, bot: "sami", tur: "is", kod: rec.kod, ozet: `fabrika siparişi ${rec.kod}: fabrikaya gitti`, sonuc: "geçmiş kayıt" });
      if (rec.cevaplayan && (rec.cevapZaman || rec.gonderim) < t0) kayit.push({ zaman: rec.cevapZaman || rec.gonderim + 60, bot: "sami", tur: "karar", kime: rec.cevaplayanId || null, kod: rec.kod, ozet: `${rec.kod}: ${{ gelecek: "Gelecek", repete: "Repete olacak", sureSoruluyor: "Repete olacak (süre soruluyor)", bitti: "Bitti, gelmeyecek", geldi: "Geldi", kapandi: "Kapandı" }[rec.durum] || rec.durum}${rec.hazirGun ? ` (${String(rec.hazirGun).slice(8, 10)}.${String(rec.hazirGun).slice(5, 7)} hazır)` : ""}`, sonuc: "geçmiş kayıt" });
    }
  }
  for (let i = 0; i < kayit.length; i += 40) await stokIste(env, "/isd-yaz", { kayitlar: kayit.slice(i, i + 40) }).catch(() => null);
  return kayit.length;
}
// [📞 Aradım, şu cevap geldi] → yazdığı cevap siparişe not olarak düşer
export async function aramaNotuMesaji(env, m, tg) {
  if (!m.text || m.text.startsWith("/")) return false;
  const b = await env.KAYIT.get(`fabrikaArama:${m.from.id}`, "json").catch(() => null);
  if (!b) return false;
  await env.KAYIT.delete(`fabrikaArama:${m.from.id}`).catch(() => null);
  const rec = await siparisOku(env, b.id);
  if (!rec) return false;
  const kim = kisiAd(m.from);
  rec.aramaNotu = { kim, metin: m.text.slice(0, 400), zaman: Math.floor(Date.now() / 1000) };
  rec.log.push(`📞 ${kim} aradı: ${m.text.slice(0, 200)}`);
  await defterCevap(env, "sami", m.from.id, rec.kod, `aradı: ${m.text}`).catch(() => null);
  await siparisYaz(env, rec);
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `✅ ${rec.kod}: fabrikanın cevabı kaydedildi. Duruma göre karttaki düğmeye de basın (Gelecek / Repete / Bitti).` });
  return true;
}
async function mesajlariGuncelle(env, rec, ek, tg) {
  if (ek != null) rec.durumYazi = ek;
  ek = rec.durumYazi || "";
  const metin = `${siparisMetni(rec)}${ek ? `\n\n${ek}` : ""}${rec.azKaldi ? `\n⚠️ ${rec.azKaldi.kim}: az kaldı` : ""}`; // 10 Kasım: fabrika kartında iç bilgi (Fuat onayı vb.) yok
  for (const [chat, mesaj, tur] of rec.mesajlar) {
    await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: klavye(rec) });
  }
}
async function bildir(env, rec, metin, tg, ekstra = {}) {
  const sonuc = [];
  for (const k of bildirilecekler(env, rec)) {
    const r = await tg(env, "sendMessage", { chat_id: k, text: `${dn(rec)}${metin}`, ...ekstra });
    if (r && r.ok) sonuc.push([k, r.result.message_id]);
  }
  return sonuc;
}
// 13 Kasım (Patron, kural 41): ekibe giden kartta "Sil" düğmesi yok — silme sadece Patron ve Venom'da
export const SILME_YOK = "Silme sadece Patron ve Venom'dadır.";
const kararKlavye = (id) => ({ inline_keyboard: [[{ text: "🔁 Repete ver", callback_data: `fk:r:${id}` }, { text: "⏳ Beklesin", callback_data: `fk:b:${id}` }]] });

async function repeteGeldi(env, rec, kim, renkler, tg, simdi) {
  const repeteydi = rec.tur === "repete" || ["repete", "sureSoruluyor"].includes(rec.durum);
  rec.durum = "geldi";
  // Mal giriş kontrolü (31 Ekim): geldiği andaki Vegawin stoğu; 2 saat içinde artmazsa liste sahibine "girildi mi?" sorulur
  const st = rec.deneme ? null : (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod];
  Object.assign(rec, { geldiZaman: simdi, bildiren: kim, gelenRenkler: renkler && renkler.length ? renkler : rec.renkler, geldiStok: st ? Number(st.toplam) || 0 : 0 });
  const ne = repeteydi ? "Repete geldi" : "Geldi";
  rec.log.push(`📦 ${ne} (${kim})`);
  await siparisYaz(env, rec);
  await mesajlariGuncelle(env, rec, `📦 ${ne} (${kim} bildirdi)${rec.gelenAdet != null ? ` — ${rec.gelenAdet} adet (istenen ${rec.istenenAdet})` : ""}`, tg);
  await bildir(env, rec, `📦 ${rec.magaza ? `${magazaAdi(rec.magaza)} · ` : ""}${rec.kod} ${ne.toLocaleLowerCase("tr")} – ${rec.gelenAdet != null ? `${rec.gelenAdet} adet (istenen ${rec.istenenAdet})` : renkSeri(rec.gelenRenkler).replace(/ seri/g, "")} (${kim} bildirdi)`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Repete geldi bildirildi (${kim})`);
  if (!rec.deneme) await rkGeldi(env, rec.kod, kim, simdi, tg).catch(() => null); // 11 Kasım: açık repete kaydı mal gelince kendiliğinden kapanır
  // Kemal'e haber: paylaşımı hazırlayıp Murat'a ve Hemra'ya onaya gönderir (denemede kanalda PAYLAŞMAZ)
  const sira = (await env.KAYIT.get("venom:repetePaylas", "json")) || [];
  sira.push({ id: rec.id, kod: rec.kod, renkler: rec.gelenRenkler, bildiren: kim, deneme: rec.deneme, liste: rec.liste, zaman: simdi });
  await env.KAYIT.put("venom:repetePaylas", JSON.stringify(sira.slice(-50)));
}

// Fabrika düğmeleri: fc:<g|r|s|t|b|z|u|y|k|e|h|G|B|I|H|T>:<id>[:ek]  (fabrika kişileri + ekip)
//  10 Kasım (Sinem): t/s süre (6 = 4-6 gün, 15 = 10-15, 20 = 15+, y = tarih yaz) · z az kaldı · u geri al · G mal geldi (Aziz/Merdan, adet)
//  B "bugün geliyor" · I iptal (teslim takibi) · H/T toplu "hepsi gelecek" + süre
export async function siparisDugmesi(env, cq, tg, simdi, yetkili) {
  const [, islem, id, ek, ek2] = String(cq.data || "").split(":");
  const cevapla = (text, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  if (!yetkili) return cevapla("Yetkiniz yok.");
  const kim = kisiAd(cq.from);
  const benim = cq.message ? { chat_id: cq.message.chat.id, message_id: cq.message.message_id } : null;
  if (islem === "H" || islem === "T") return topluDugme(env, cq, tg, simdi, { islem, anahtar: id, m: ek, g: ek2, kim, benim, cevapla });
  const rec = await siparisOku(env, id);
  if (!rec) return cevapla("Bu kayıt artık geçerli değil.");
  const kisi = await kisiKaydi(env, cq.from.id);
  if (kisi && kisiGrubu(kisi) !== (rec.grup || "fabrika") && !bildirilecekler(env, rec).includes(String(cq.from.id))) return cevapla("Bu model size ait değil.");
  if (islem === "a") { // 9 Kasım: Merdan/Hemra fabrikayı aradı
    await env.KAYIT.put(`fabrikaArama:${cq.from.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 3600 });
    await cevapla("Cevabı yazın");
    return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `📞 ${rec.kod}: fabrikanın cevabını tek mesajla yazın (1 saat içinde).` });
  }
  if (islem === "y") {
    rec.fotoYanlis = [...new Set([...(rec.fotoYanlis || []), kim])];
    await siparisYaz(env, rec);
    await bildir(env, rec, `⚠️ ${rec.kod} fotoğrafı yanlış dendi (${kim}).`, tg);
    await env.KAYIT.put("sami:botHatalari", JSON.stringify([...((await env.KAYIT.get("sami:botHatalari", "json").catch(() => null)) || []), { zaman: simdi, liste: rec.liste, kod: rec.kod, kim, tur: "fabrika kartı (fotoğraf yanlış)" }].slice(-200)), { expirationTtl: 60 * 86400 }).catch(() => null);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `"Fotoğraf yanlış model" basıldı (${kim})`);
    return cevapla("İletildi, teşekkürler");
  }
  if (islem === "k") {
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    if (!["repete", "gelecek", "bekliyor"].includes(rec.durum)) return cevapla("Bu model için repete beklenmiyor.");
    await cevapla("Bildirildi");
    await kanitYaz(env, rec, kim, "Repete geldi (fabrika bildirdi)", simdi, "📦 Repete geldi");
    return repeteGeldi(env, rec, kim, null, tg, simdi);
  }
  if (islem === "G") { // 10 Kasım: mal mağazaya geldi — Aziz (VOLONTE) / Merdan (Black Rose) adedi yazar
    if (kisi) return cevapla("Bu düğme mağazada (Aziz / Merdan).");
    if (rec.gelenAdet != null) return cevapla(`${rec.gelenYazan || "Biri"} zaten ${rec.gelenAdet} adet yazdı.`);
    await env.KAYIT.put(`fabrikaAdet:${cq.from.id}`, JSON.stringify({ id: rec.id, kod: rec.kod }), { expirationTtl: 6 * 3600 });
    await cevapla("Adedi yazın");
    return tg(env, "sendMessage", { chat_id: cq.from.id, text: `📦 ${magazaAdi(rec.magaza)} · ${rec.kod}: kaç adet geldi? Sadece sayıyı yazın (örnek: 30) ya da renk renk (örnek: siyah 20 bej 10). İstenen: ${istenenAdet(rec)} adet.` });
  }
  if (islem === "e" || islem === "h") { // yazıyla bildirimin onayı
    const b = rec.metinBildirim;
    if (!b || String(b.kimId) !== String(cq.from.id)) return cevapla("Bu onay size ait değil.");
    delete rec.metinBildirim;
    await siparisYaz(env, rec);
    if (islem === "h") { await cevapla("Vazgeçildi"); return benim && tg(env, "editMessageText", { ...benim, text: `↩️ ${rec.kod}: bildirim iptal edildi.` }); }
    if (b.adet != null && !(await kisiKaydi(env, cq.from.id))) { // mağaza: "3394 geldi 30"
      await cevapla("Kaydedildi");
      if (benim) await tg(env, "editMessageText", { ...benim, text: `✅ ${rec.kod}: ${b.adet} adet geldi – kaydedildi.` });
      rec.gelenYazanId = cq.from.id;
      return malGeldi(env, tg, rec, { kim, kimId: cq.from.id }, b.adet, b.renkler, simdi);
    }
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    await cevapla("Bildirildi");
    if (benim) await tg(env, "editMessageText", { ...benim, text: `✅ ${rec.kod} repete geldi – bildirildi.` });
    await kanitYaz(env, rec, kim, "Repete geldi (yazıyla)", simdi, b.metin || null);
    return repeteGeldi(env, rec, kim, b.renkler, tg, simdi);
  }
  if (islem === "u") return geriAlFabrika(env, tg, rec, cq, kim, simdi, cevapla);
  if (islem === "z") { // ⚠️ Az kaldı (bilgi; cevap yerine geçmez)
    if (rec.azKaldi) return cevapla(`${rec.azKaldi.kim} zaten "az kaldı" dedi.`);
    await cevapla("Az kaldı — kaydedildi");
    return azKaldi(env, tg, rec, { kim, kimId: cq.from.id }, simdi, "⚠️ Az kaldı");
  }
  if (islem === "B" || islem === "I") { // teslim takibi cevabı
    if (!["gelecek", "repete"].includes(rec.durum)) return cevapla("Bu soru artık geçerli değil.");
    rec.teslimCevap = { kim, zaman: simdi, ne: islem === "B" ? "bugün geliyor" : "iptal" };
    await kanitYaz(env, rec, kim, islem === "B" ? "Teslim sorusu: bugün geliyor" : "Teslim sorusu: iptal (gelmeyecek)", simdi, islem === "B" ? "Bugün geliyor" : "İptal");
    if (islem === "I") { rec.durum = "kapandi"; rec.iptal = { kim, zaman: simdi }; }
    rec.log.push(`📅 Teslim sorusu: ${rec.teslimCevap.ne} (${kim})`);
    await siparisYaz(env, rec);
    await cevapla(islem === "B" ? "Bugün geliyor" : "İptal");
    if (benim) await tg(env, cq.message.photo ? "editMessageCaption" : "editMessageText", { ...benim, [cq.message.photo ? "caption" : "text"]: `${siparisMetni(rec)}\n\n${islem === "B" ? `✅ ${kim}: bugün geliyor` : `❌ ${kim}: iptal, gelmeyecek`}`.slice(0, 1024), reply_markup: { inline_keyboard: [] } }).catch(() => null);
    await bildir(env, rec, `${magazaAdi(rec.magaza)} · ${rec.kod}: ${kim} → ${islem === "B" ? "bugün geliyor" : "iptal, gelmeyecek"}`, tg);
    return;
  }
  if (islem === "t" || islem === "s") { // süre (Gelecek / Repete / eksik kalan / teslim takibi "X gün daha")
    const izinli = islem === "t" ? ["gelecek", "bekliyor", "repete"] : ["sureSoruluyor", "repete"];
    if (!izinli.includes(rec.durum)) return cevapla("Bu seçim artık geçerli değil.");
    if (rec.cevaplayanId && String(rec.cevaplayanId) !== String(cq.from.id) && rec.durum === "sureSoruluyor" && kisi) return cevapla("Bu seçim size ait değil.");
    if (ek === "y") {
      await env.KAYIT.put(`fabrikaTarih:${cq.from.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 3600 });
      await cevapla("Tarihi yazın");
      return tg(env, "sendMessage", { chat_id: cq.from.id, text: `✏️ ${rec.kod}: ne zaman hazır olur? Yazın (örnek: 18.11 · 18 Kasım · 7 gün).` });
    }
    const gun = Number(ek);
    if (!(gun > 0 && gun <= 180)) return cevapla("Geçersiz.");
    const sec = { gun, hazirGun: gunAnahtari(simdi + gun * 86400), etiket: sureAd(gun) };
    await cevapla(sec.etiket);
    return sureUygula(env, tg, rec, sec, { kim, kimId: cq.from.id }, simdi, { aynen: `⏱ ${sec.etiket}` });
  }
  // İlk cevap (g/r/b): ilk basan geçerli
  if (rec.durum !== "bekliyor") return cevapla(`${rec.cevaplayan || "Biri"} zaten cevapladı.`);
  Object.assign(rec, { cevaplayan: kim, cevaplayanId: cq.from.id, cevapZaman: simdi });
  if (islem === "g") { // 12 Kasım (Patron): "Gelecek" = "bu mal mağazaya gelecek, onaylıyorum" — süre SORULMAZ; kart kapanır, Hemra'ya bilgi
    await cevapla("Onaylandı, gelecek");
    return gelecekOnay(env, tg, rec, { kim, kimId: cq.from.id }, simdi, { aynen: "✅ Gelecek" });
  }
  if (islem === "r") {
    const g = false;
    rec.durum = g ? "gelecek" : "sureSoruluyor";
    rec.log.push(`${g ? "✅ Gelecek" : "🔁 Repete olacak"} (${kim})`);
    // Basan kişiye süre düğmeleri (+ ↩️ Geri al); diğerlerinde sadece cevap görünür.
    rec.durumYazi = `${g ? "✅" : "🔁"} ${kim} cevapladı: ${g ? "Gelecek" : "Repete olacak"}`;
    await siparisYaz(env, rec);
    await kanitYaz(env, rec, kim, g ? "Gelecek (süre soruldu)" : "Repete olacak (süre soruldu)", simdi, g ? "✅ Gelecek" : "🔁 Repete olacak");
    await cevapla(g ? "Kaç günde hazır olur?" : "Ne zaman hazır olur?");
    for (const [chat, mesaj, tur] of rec.mesajlar) {
      const benimMi = benim && String(chat) === String(benim.chat_id) && mesaj === benim.message_id;
      const metin = `${siparisMetni(rec)}\n\n${rec.durumYazi}${benimMi ? (g ? "\nKaç günde hazır olur?" : "\nNe zaman hazır olur?") : g ? "" : " (süre soruluyor)"}`;
      const kl = benimMi ? { inline_keyboard: [...repeteSureSatirlari(`fc:s:${rec.id}`), [GERI_AL(`fc:u:${rec.id}`)]] } : g ? klavye(rec) : { inline_keyboard: [] };
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin.slice(0, 1024), reply_markup: kl });
    }
    if (g) await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → Gelecek (teslim süresi soruldu)`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: ${g ? "Gelecek" : "Repete olacak"} (${kim})`);
    return;
  }
  if (islem === "b") {
    await cevapla("Bitti");
    return bittiDedi(env, tg, rec, { kim, kimId: cq.from.id }, simdi, "❌ Bitti, gelmeyecek");
  }
  return cevapla("Geçersiz düğme.");
}

// ---------- 10 Kasım (Patron): SİNEM'İN İSTEKLERİ + FABRİKA ZİNCİRİ ----------
const istenenAdet = (rec) => (rec.renkler || []).reduce((t, r) => t + (Number(r.adet) || 0), 0);
// KANIT DEFTERİ: fabrikanın her "bitti / az kaldı / gelmeyecek / gelecek X gün" cevabı ve Fuat'ın onayı — tarih, saat, kim, aynen metni.
// Sami'nin deposundaki MÜHÜRLÜ arşive yazılır (silme/değiştirme yolu yok; veritabanı tetikleyicisi de engeller). Deneme yazılmaz.
async function kanitYaz(env, rec, kim, ne, simdi, aynen = null) {
  if (!rec || rec.deneme) return;
  await stokIste(env, "/arsiv-ekle", { tur: "fabrika-kanit", mt: String(rec.kod), icerik: { kod: rec.kod, magaza: rec.magaza || null, kim, ne, metin: aynen ? String(aynen).slice(0, 500) : null, siparis: rec.id }, zaman: simdi }).catch(() => null);
}
export async function kanitGecmisi(env, kod) {
  const l = await stokIste(env, "/arsiv-kod", { tur: "fabrika-kanit", mt: String(kod) }).catch(() => []);
  return (Array.isArray(l) ? l : []).map((r) => { let x = {}; try { x = JSON.parse(r.icerik); } catch { x = {}; } return { zaman: r.zaman, ...x }; });
}
const AY_AD = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const kanitTarih = (t) => { const d = new Date((t + SAAT_FARKI) * 1000); return `${d.getUTCDate()} ${AY_AD[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
export function kanitMetni(kod, l) {
  if (!l.length) return `${kod}: fabrika kanıt defterinde kayıt yok (defter 10 Kasım'da açıldı; öncesi iş defterinde).`;
  return [`📒 ${kod} fabrika kaydı (silinemez defter):`, ...l.map((x) => `${kanitTarih(x.zaman)} ${x.kim}: ${x.ne}${x.metin && !String(x.ne).includes(x.metin) ? ` — "${x.metin}"` : ""}`)].join("\n");
}
// "Bitti" denen modeller: Patron yeni repete kararı verene kadar fabrikaya sorulmaz
const bitenOku = (env) => ayarOku(env, "fabrika:bitenler", {});
async function bitenEkle(env, rec, kim, simdi) {
  if (rec.deneme) return;
  const b = await bitenOku(env);
  b[rec.kod] = { zaman: simdi, kim, id: rec.id, magaza: rec.magaza || null };
  await ayarYaz(env, "fabrika:bitenler", b);
}
async function bitenCikar(env, kod) {
  const b = await bitenOku(env);
  if (!b[kod]) return;
  delete b[kod];
  await ayarYaz(env, "fabrika:bitenler", b);
}
async function fuatKimligi(env) {
  const f = String(env.FUAT_ID || "").split(",")[0].trim();
  if (f) return f;
  const k = (await fabrikaKisileri(env, "fabrika")).find((x) => /fuat/i.test(String(x.ad || "")));
  return k ? String(k.id) : "";
}
// Koordinatör: Hemra; Hemra bugün izinliyse Merdan (EKİP DÜZENİ)
async function koordinatorId(env, simdi) {
  const izin = await env.KAYIT.get("venom:hemraIzinli").catch(() => null);
  return izin === gunAnahtari(simdi) && env.BR_SORUMLU ? String(env.BR_SORUMLU).split(",")[0].trim() : sorumlu(env);
}
// Mal gelince [📦 Geldi] basacak kişi: VOLONTE → Aziz, Black Rose → Merdan
const geldiSorumlusu = (env, rec) => (rec.magaza === "BLACKROSE" ? String(env.BR_SORUMLU || "").split(",")[0].trim() : String(env.AZIZ_ID || "").split(",")[0].trim()) || sorumlu(env);
// Kartın fotoğraflı kopyası (fabrikaya giden karttan) — yoksa yazı
async function kartGonderKopya(env, tg, rec, kime, metin, kl) {
  const kaynak = (rec.mesajlar || []).find((m) => m[2] === "foto");
  let r = kaynak ? await tg(env, "copyMessage", { chat_id: kime, from_chat_id: kaynak[0], message_id: kaynak[1], caption: metin.slice(0, 1024), reply_markup: kl }) : null;
  if (r && r.ok) return [kime, r.result.message_id, "foto"];
  // 10 Kasım (Patron): her kartta modelin resmi — kopyalanacak kart yoksa sitedeki (ya da kanaldaki) fotoğraf
  const foto = await fotoBul(env, rec.fotoKod || rec.kod).catch(() => null);
  if (foto && foto.tur === "site") for (const u of [foto.url, tamFoto(foto.url)]) { r = await tg(env, "sendPhoto", { chat_id: kime, photo: u, caption: metin.slice(0, 1024), reply_markup: kl }); if (r && r.ok) return [kime, r.result.message_id, "foto"]; }
  if (foto && foto.tur === "kanal") for (const id of foto.adaylar || [foto.id]) { r = await tg(env, "copyMessage", { chat_id: kime, from_chat_id: foto.kanal, message_id: id, caption: metin.slice(0, 1024), reply_markup: kl }); if (r && r.ok) return [kime, r.result.message_id, "foto"]; }
  r = await tg(env, "sendMessage", { chat_id: kime, text: metin.slice(0, 4000), reply_markup: kl });
  return r && r.ok ? [kime, r.result.message_id, "metin"] : null;
}
async function kopyaDuzenle(env, tg, m, metin, kl = { inline_keyboard: [] }) {
  if (!m) return;
  await tg(env, m[2] === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: m[0], message_id: m[1], [m[2] === "foto" ? "caption" : "text"]: metin.slice(0, m[2] === "foto" ? 1024 : 4000), reply_markup: kl }).catch(() => null);
}

// Süre seçildi (düğme, tarih yazısı, "3394 5 gün" yazısı ya da toplu)
async function sureUygula(env, tg, rec, sec, { kim, kimId }, simdi, { sessiz = false, aynen = null } = {}) {
  const repete = ["sureSoruluyor", "repete"].includes(rec.durum);
  if (rec.durum === "bekliyor") Object.assign(rec, { cevaplayan: kim, cevaplayanId: kimId, cevapZaman: simdi });
  Object.assign(rec, { durum: repete ? "repete" : "gelecek", teslimGun: sec.gun, teslimSure: sec.etiket, hazirGun: sec.hazirGun, teslimHatirlatildi: false, teslimSoru: null, teslimSoruTekrar: null, teslimEkibe: null, teslimCevap: null });
  if (repete) Object.assign(rec, { sure: sec.gun, hazirZaman: gunBasi(sec.hazirGun) + 10 * 3600, hazirSoruldu: false });
  const ne = `${repete ? "Repete olacak" : "Gelecek"} — ${sec.etiket} (~${gunGoster(sec.hazirGun)})`;
  rec.log.push(`📅 ${ne} (${kim})`);
  rec.durumYazi = `${repete ? "🔁" : "✅"} ${kim}: ${ne}`;
  await siparisYaz(env, rec);
  await kanitYaz(env, rec, kim, ne, simdi, aynen);
  await mesajlariGuncelle(env, rec, null, tg);
  if (!sessiz) await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → ${ne}`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `${repete ? "Repete süresi seçildi" : "Teslim süresi"}: ${sec.etiket} (${kim})`);
}

// 12 Kasım (Patron): "Gelecek" = onay. Süre sorulmaz; kart "✅ Onaylandı, gelecek" olur (sadece ↩️ Geri al kalır); Hemra'ya bilgi gider.
async function gelecekOnay(env, tg, rec, { kim, kimId }, simdi, { sessiz = false, aynen = null } = {}) {
  if (rec.durum === "bekliyor") Object.assign(rec, { cevaplayan: kim, cevaplayanId: kimId, cevapZaman: simdi });
  Object.assign(rec, { durum: "gelecek", onayZaman: simdi, teslimGun: null, teslimSure: null, hazirGun: null, teslimHatirlatildi: false, teslimSoru: null, teslimSoruTekrar: null, teslimEkibe: null, teslimCevap: null });
  rec.log.push(`✅ Onaylandı, gelecek (${kim})`);
  rec.durumYazi = `✅ ${kim}: Onaylandı, gelecek`;
  await siparisYaz(env, rec);
  await kanitYaz(env, rec, kim, "Onaylandı, gelecek", simdi, aynen);
  await mesajlariGuncelle(env, rec, null, tg);
  if (!sessiz) await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → ✅ Onaylandı, gelecek`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Onaylandı, gelecek (${kim})`);
}
// "Bitti" (düğme ya da yazı): model fabrikaya bir daha sorulmaz, Fuat'a onay kartı, Hemra'ya "Ne yapalım?"
async function bittiDedi(env, tg, rec, { kim, kimId }, simdi, aynen) {
  if (rec.durum === "bekliyor") Object.assign(rec, { cevaplayan: kim, cevaplayanId: kimId, cevapZaman: simdi });
  rec.durum = "bitti";
  rec.log.push(`❌ Bitti, gelmeyecek (${kim})`);
  await kanitYaz(env, rec, kim, "Bitti, gelmeyecek", simdi, aynen);
  await bitenEkle(env, rec, kim, simdi);
  await mesajlariGuncelle(env, rec, `❌ ${kim} cevapladı: Bitti, gelmeyecek`, tg);
  // Fuat onayı (Fuat kendisi dediyse ya da Celal modeliyse gerek yok)
  const fuat = await fuatKimligi(env);
  if (fuat && rec.sadece && !rec.sadece.map(String).includes(String(fuat))) rec.fuatOnay = { kim: "deneme: Fuat'a gitmedi", zaman: simdi, kendisi: true }; // 10 Kasım zincir denemesi
  else if (fuat && String(fuat) !== String(kimId) && rec.grup !== "celal") {
    const metin = `${dn(rec)}${kim} ${rec.kod} için "bitti" dedi. Onaylıyor musunuz?\n${siparisMetni(rec).replace(DENEME, "")}`;
    if (!fuatSuzgec(metin)) rec.fuatMesaj = await kartGonderKopya(env, tg, rec, fuat, metin, { inline_keyboard: [[{ text: "✅ Onaylıyorum, bitti", callback_data: `fo:e:${rec.id}` }], [{ text: "❌ Hayır, yapılabilir", callback_data: `fo:h:${rec.id}` }]] });
  } else if (String(fuat) === String(kimId)) rec.fuatOnay = { kim, zaman: simdi, kendisi: true };
  await hemraKarti(env, tg, rec, "bitti", kim, simdi);
  await siparisYaz(env, rec);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Bitti (${kim}) → Fuat onayı + Hemra kartı`);
}
async function azKaldi(env, tg, rec, { kim }, simdi, aynen) {
  rec.azKaldi = { kim, zaman: simdi };
  rec.log.push(`⚠️ Az kaldı (${kim})`);
  await kanitYaz(env, rec, kim, "Az kaldı (bitmek üzere)", simdi, aynen);
  await mesajlariGuncelle(env, rec, null, tg);
  await hemraKarti(env, tg, rec, "az", kim, simdi);
  await siparisYaz(env, rec);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Az kaldı (${kim})`);
}
// Hemra'ya: "Bu mal fabrikada bitti. Mağaza stoğu: X. Ne yapalım?" [🔁 Repete] [⏳ Bitene kadar bekle] (13 Kasım: "Sil" yok — kural 41)
// 11 Kasım (yeni akış): Sami'nin önerisi — hızlı satıyor ve az kaldıysa repete; satış yoksa bekle
export function samiOnerisi(kalan, s7) {
  const bitis = s7 > 0 ? Math.max(1, Math.ceil(kalan / (s7 / 7))) : null;
  if (!s7) return kalan <= 0 ? "Satış yok, repete önerilmez; mağazada kalmadı, karar sizde." : `Satış yok, repete önerilmez; ${kalan} adet var, bitene kadar beklemeyi öneriyorum.`; // 12 Kasım (Patron): satış hızı 0 → repete önerilmez
  if (kalan <= 0) return `Mağazada kalmadı, satıyordu (7 günde ${s7}); repete öneriyorum.`;
  if (s7 >= 7 || (bitis != null && bitis <= 7)) return `Hızlı satıyor (7 günde ${s7}), ${kalan} adet kaldı, ~${bitis} günde biter; repete öneriyorum.`;
  return `Yavaş satıyor (7 günde ${s7}), ${kalan} adet kaldı, ~${bitis} günde biter; bitene kadar beklenebilir.`;
}
// Önerilen repete dağılımı (SADECE ÖNERİ — 13 Kasım: alt sınır yok, adedi Hemra / Patron belirler): son istekteki renk/beden oranı, 40 adede ölçeklenir, 4'ün katlarına yuvarlanır (seri = 4)
export function dagilimOner(onceki, rec = null) {
  const m = new Map();
  const ekle = (renk, g, adet) => { const r = String(renk || "").trim(); if (!r || !(Number(adet) > 0)) return; const x = m.get(r) || { renk: r, buyuk: 0, kucuk: 0 }; x[g === "b" ? "buyuk" : "kucuk"] += Number(adet); m.set(r, x); };
  if (onceki && !Array.isArray(onceki) && onceki.gruplar) for (const g of ["k", "b"]) for (const r of onceki.gruplar[g] || []) ekle(r.renk, g, r.adet);
  if (!m.size && rec && rec.beden && Array.isArray(rec.renkler)) for (const r of rec.renkler) ekle(r.renk, rec.beden, r.adet);
  if (!m.size) return null;
  const l = [...m.values()];
  const kat = Math.max(1, REPETE_EN_AZ / dagilimAdet(l));
  for (const x of l) for (const g of ["buyuk", "kucuk"]) if (x[g] > 0) x[g] = Math.max(4, Math.round((x[g] * kat) / 4) * 4);
  while (dagilimAdet(l) < REPETE_EN_AZ) { const en = l.flatMap((x) => ["buyuk", "kucuk"].filter((g) => x[g] > 0).map((g) => [x, g])).sort((a, b) => b[0][b[1]] - a[0][a[1]])[0]; en[0][en[1]] += 4; }
  return l;
}
// Sinem "Bitti" → Hemra'ya HEMEN kart: fotoğraf + kod + mağazada kalan + son 7 gün / yıllık satış + Sami'nin önerisi + önerilen dağılım.
// Düğmeler: [Repete] [Bitene kadar bekle] [Sil] (Sil kararı Patron'a gider; Hemra silemez)
// Repete verisi (kalan, satış hızı, önerilen dağılım). 12 Kasım (Patron): satış hızı 0 ise dağılım ÖNERİLMEZ (Hemra isterse kendisi yazar).
async function rkVeriOku(env, rec, simdi) {
  let kalan, kalanYazi, s7, yil;
  const tv = rec.test ? rec.testVeri || {} : null;
  if (tv) { kalan = Number(tv.kalan) || 0; kalanYazi = `${kalan} adet`; s7 = Number(tv.s7) || 0; yil = Number(tv.yil) || 0; }
  else {
    const st = await magazaStoklari(env, rec.kod);
    const top = (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod];
    kalan = top ? Math.max(0, Number(top.toplam) || 0) : 0;
    kalanYazi = st && st.yazi ? st.yazi : "yok (0)";
    s7 = Number(((await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - 7 * 86400), bitis: gunAnahtari(simdi) }).catch(() => ({}))) || {})[rec.kod]) || 0;
    yil = Number(((await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - 365 * 86400), bitis: gunAnahtari(simdi) }).catch(() => ({}))) || {})[rec.kod]) || 0;
  }
  const dagilim = !s7 ? null : tv && tv.dagilim ? tv.dagilim : dagilimOner((await ayarOku(env, "fabrika:sonIstek", {}))[rec.kod], rec);
  return { kalan, kalanYazi, s7, yil, dagilim };
}
async function hemraKartiYeni(env, tg, rec, tur, kim, simdi) {
  const { kalan, kalanYazi, s7, yil, dagilim } = await rkVeriOku(env, rec, simdi);
  rec.rkVeri = { kalan, s7, yil, dagilim };
  const metin = [`${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}`,
    tur === "stokBitti" ? "📦 Mağaza stoğu bitti (fabrika daha önce \"bitti\" demişti)." : `❌ Fabrikada bitti (${kim}).`,
    `Mağazada kalan: ${kalanYazi}`,
    satisSatiri(s7, yil, simdi),
    `💡 Sami: ${samiOnerisi(kalan, s7)}`,
    dagilim ? `Repete dağılımı: ${dagilimYazi(dagilim)} (toplam ${dagilimAdet(dagilim)} adet)` : null,
    "Ne yapalım?"].filter(Boolean).join("\n");
  const kl = { inline_keyboard: [[{ text: "🔁 Repete", callback_data: `fh:r:${rec.id}` }], [{ text: "⏳ Bitene kadar bekle", callback_data: `fh:w:${rec.id}` }]] }; // 13 Kasım (kural 41): "Sil" yok
  rec.hemraMesaj = await kartGonderKopya(env, tg, rec, await koordinatorId(env, simdi), metin, kl);
  if (rec.hemraMesaj) rec.hemraMesaj.push(metin);
  rec.hemraTur = tur;
  rec.hemraOneri = null;
}
async function hemraKarti(env, tg, rec, tur, kim, simdi) {
  if (tur !== "az" && !rec.yeni && !rec.deneme && (await yeniAkisAcik(env))) rec.yeni = true; // 12 Kasım (Patron): dağılım Hemra'nın İLK kartında belirlenir
  if (rec.yeni && tur !== "az") return hemraKartiYeni(env, tg, rec, tur, kim, simdi);
  const st = rec.deneme ? null : await magazaStoklari(env, rec.kod);
  const stok = rec.deneme ? "— (deneme)" : st && st.yazi ? st.yazi : "yok (0)";
  const bas = `${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}`;
  const metin = tur === "az" ? `${bas}\n⚠️ ${rec.kod} fabrikada bitmek üzere (${kim} "az kaldı" dedi). Mağaza stoğu: ${stok}. Repete kararı verelim mi?`
    : tur === "stokBitti" ? `${bas}\n📦 ${rec.kod}: mağaza stoğu bitti (fabrika daha önce "bitti" demişti). Ne yapalım?`
      : `${bas}\n❌ Bu mal fabrikada bitti (${kim}). Mağazada son: ${stok}. Ne yapalım?\nKural: mağaza stoğu bitmeden siteden ve Telegram'dan kaldırılmaz.`;
  const kl = { inline_keyboard: tur === "az" ? [[{ text: "🔁 Repete öner", callback_data: `fh:r:${rec.id}` }, { text: "⏳ Bekle", callback_data: `fh:w:${rec.id}` }]]
    : [[{ text: "🔁 Repete öner", callback_data: `fh:r:${rec.id}` }], [{ text: "❓ Patron karar versin", callback_data: `fh:q:${rec.id}` }], [{ text: "⏳ Stok bitene kadar bekle", callback_data: `fh:w:${rec.id}` }]] };
  rec.hemraMesaj = await kartGonderKopya(env, tg, rec, await koordinatorId(env, simdi), metin, kl);
  if (rec.hemraMesaj) rec.hemraMesaj.push(metin);
  rec.hemraTur = tur;
  rec.hemraOneri = null;
}

// ↩️ Geri al (fabrika kartı): cevap iptal, kart aynı fotoğrafla sohbetin en altına yeniden gelir
async function geriAlFabrika(env, tg, rec, cq, kim, simdi, cevapla) {
  const ekip = bildirilecekler(env, rec).includes(String(cq.from.id)) || muratMi(env, cq.from.id);
  if (rec.cevaplayanId && String(rec.cevaplayanId) !== String(cq.from.id) && !ekip) return cevapla("Bu cevap sizin değil.", true);
  if (!geriAlinabilir(rec)) return cevapla(rec.geldiZaman || rec.karar || rec.hemraOneri || rec.fuatOnay ? "Bu liste gönderildi, değişiklik için Hemra'ya yazın." : "Geri alınacak cevap yok.", true);
  const onceki = String(rec.durumYazi || rec.durum).replace(/\n/g, " ");
  await kanitYaz(env, rec, kim, `Geri aldı (önceki: ${onceki})`, simdi, "↩️ Geri al");
  if (rec.durum === "bitti") {
    await bitenCikar(env, rec.kod);
    if (rec.fuatMesaj) await kopyaDuzenle(env, tg, rec.fuatMesaj, `${dn(rec)}↩️ ${rec.kod}: ${kim} "bitti" cevabını geri aldı — onay gerekmiyor.`);
    if (rec.hemraMesaj) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${dn(rec)}↩️ ${rec.kod}: ${kim} "bitti" cevabını geri aldı — karar gerekmiyor.`);
  }
  const eski = rec.mesajlar;
  Object.assign(rec, { durum: "bekliyor", cevaplayan: null, cevaplayanId: null, cevapZaman: null, teslimGun: null, teslimSure: null, hazirGun: null, sure: null, hazirZaman: null, fuatMesaj: null, hemraMesaj: null, hemraTur: null, durumYazi: null, mesajlar: [] });
  rec.log.push(`↩️ Geri alındı (${kim}; önceki: ${onceki})`);
  for (const m of eski) {
    await kopyaDuzenle(env, tg, m, `${siparisMetni(rec)}\n\n↩️ ${kim} geri aldı (${onceki}) — güncel kart aşağıda`);
    const yeni = await kartKopyala(env, tg, rec, m, m[0], `${dn(rec)}↩️ Cevap geri alındı — yeniden seçin`);
    rec.mesajlar.push(yeni || m);
  }
  await siparisYaz(env, rec);
  await geriAlSay(env, { tur: "fabrika kartı", kod: rec.kod, kim, liste: rec.liste });
  await bildir(env, rec, `↩️ ${magazaAdi(rec.magaza)} · ${rec.kod}: ${kim} cevabını geri aldı (önceki: ${onceki}).`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Geri al çalıştı (${kim})`);
  return cevapla("Geri alındı — kart aşağıda yeniden");
}

// Toplu cevap: BİTTİ başlığındaki [✅ Hepsi gelecek] → süre → listedeki bütün cevapsız kartlar (parça parça, istek sınırı)
async function topluDugme(env, cq, tg, simdi, { islem, anahtar, m, g, kim, benim, cevapla }) {
  const magaza = KISA_MAGAZA[m] || MAGAZA;
  const d = await ayarOku(env, `fabrika:${anahtar}`, null);
  const ids = d && d.recler ? d.recler[magaza] || [] : [];
  if (!ids.length) return cevapla("Bu liste artık geçerli değil.");
  if (islem === "H") { // 12 Kasım: "Hepsi gelecek" = hepsi onaylandı — süre sorulmaz
    await cevapla("Hepsi onaylandı, gelecek");
    if (benim) await tg(env, "editMessageText", { ...benim, text: `${dn(d)}${listeSonu(magaza, ids.length)}\n✅ ${kim}: hepsi onaylandı, gelecek. Kartlar güncelleniyor.` });
    return topluBaslat(env, tg, { ids, sec: null, kim, kimId: cq.from.id, etiket: magazaAdi(magaza), deneme: Boolean(d.deneme) }, simdi);
  }
  if (g === "y") {
    await env.KAYIT.put(`fabrikaTarih:${cq.from.id}`, JSON.stringify({ toplu: ids }), { expirationTtl: 3600 });
    await cevapla("Tarihi yazın");
    return tg(env, "sendMessage", { chat_id: cq.from.id, text: `✏️ ${magazaAdi(magaza)} listesi (hepsi): ne zaman hazır olur? Yazın (örnek: 18.11 · 18 Kasım · 7 gün).` });
  }
  const gun = Number(g);
  if (!(gun > 0 && gun <= 180)) return cevapla("Geçersiz.");
  const sec = { gun, hazirGun: gunAnahtari(simdi + gun * 86400), etiket: sureAd(gun) };
  await cevapla(`Hepsi: ${sec.etiket}`);
  if (benim) await tg(env, "editMessageText", { ...benim, text: `${dn(d)}${listeSonu(magaza, ids.length)}\n✅ ${kim}: hepsi gelecek — ${sec.etiket} (~${gunGoster(sec.hazirGun)}). Kartlar güncelleniyor.` });
  return topluBaslat(env, tg, { ids, sec, kim, kimId: cq.from.id, etiket: magazaAdi(magaza), deneme: Boolean(d.deneme) }, simdi);
}
async function topluBaslat(env, tg, is, simdi) {
  const l = await ayarOku(env, "fabrika:toplu", []);
  await ayarYaz(env, "fabrika:toplu", [...l, { ...is, sayi: 0, zaman: simdi }]);
  return topluAdimi(env, tg, simdi);
}
// 5 dk'lık görev de çağırır: bir çalışmada en fazla 3 kart
async function topluAdimi(env, tg, simdi) {
  const l = await ayarOku(env, "fabrika:toplu", []);
  if (!l.length) return false;
  const is = l[0];
  let n = 0;
  while (is.ids.length && n < 3) {
    const id = is.ids.shift();
    const rec = await siparisOku(env, id);
    if (!rec || rec.durum !== "bekliyor" || (is.kimId && !rec.mesajlar.some((m) => String(m[0]) === String(is.kimId)))) continue; // sadece o kişiye giden kartlar
    if (is.sec) await sureUygula(env, tg, rec, is.sec, { kim: is.kim, kimId: is.kimId }, simdi, { sessiz: true, aynen: `Hepsi gelecek — ${is.sec.etiket}` });
    else await gelecekOnay(env, tg, rec, { kim: is.kim, kimId: is.kimId }, simdi, { sessiz: true, aynen: "Hepsi gelecek" });
    is.sayi++; n++;
  }
  if (!is.ids.length) {
    l.shift();
    if (is.sayi) { const rec0 = { deneme: Boolean(is.deneme), sorumlu: null }; await bildir(env, rec0, `🏭 ${is.kim} · ${is.etiket || "liste"}: ${is.sec ? `hepsi gelecek — ${is.sec.etiket} (~${gunGoster(is.sec.hazirGun)})` : "hepsi onaylandı, gelecek"}, ${is.sayi} model.`, tg); }
  }
  await ayarYaz(env, "fabrika:toplu", l);
  return true;
}

// Mal mağazaya geldi (Aziz / Merdan adet yazdı): sipariş kapanır, istenen / gelen karşılaştırılır; eksikse Sinem'e sorulur
async function malGeldi(env, tg, rec, { kim }, adet, renkler, simdi) {
  const istenen = istenenAdet(rec);
  Object.assign(rec, { gelenAdet: adet, istenenAdet: istenen, gelenYazan: kim, gelenZaman: simdi });
  await kanitYaz(env, rec, kim, `Mağazaya geldi: ${adet} adet (istenen ${istenen})`, simdi, renkler && renkler.length ? renkler.map((r) => `${r.renk} ${r.adet}`).join(", ") : String(adet));
  await defterIs(env, "sami", `${rec.kod}: istenen ${istenen}, gelen ${adet}${istenen && adet < istenen ? ` — ${istenen - adet} eksik` : ""} (${kim})`, { kod: rec.kod, deneme: Boolean(rec.deneme) }).catch(() => null);
  if (rec.durum !== "geldi") await repeteGeldi(env, rec, kim, renkler, tg, simdi);
  else await siparisYaz(env, rec);
  if (rec.geldiMesaj) await kopyaDuzenle(env, tg, rec.geldiMesaj, `${siparisMetni(rec)}\n\n📦 ${kim}: ${adet} adet geldi (istenen ${istenen}).`);
  const fark = istenen - adet;
  if (istenen && fark > 0) await eksikGeldi(env, tg, rec, fark, simdi);
  await tg(env, "sendMessage", { chat_id: rec.gelenYazanId || geldiSorumlusu(env, rec), text: `${dn(rec)}✅ ${rec.kod}: ${adet} adet geldi (istenen ${istenen}). Sipariş kapandı.${fark > 0 ? ` ${fark} adet eksik — Sinem'e "ne zaman gelir?" soruldu.` : ""}` }).catch(() => null);
}
async function eksikGeldi(env, tg, rec, fark, simdi) {
  const kalan = await siparisAc(env, { kod: rec.kod, beden: rec.beden || null, renkler: [{ renk: "eksik", adet: fark }], liste: rec.liste, deneme: rec.deneme, mod: Boolean(rec.mod), fotoKod: rec.fotoKod, tur: "kalan", grup: rec.grup, sorumlu: rec.sorumlu || null, magaza: rec.magaza || null }, simdi);
  kalan.ana = rec.id;
  const kime = rec.cevaplayanId && (await kisiKaydi(env, rec.cevaplayanId)) ? [String(rec.cevaplayanId)] : [...new Set((rec.mesajlar || []).map((m) => String(m[0])).filter((c) => !bildirilecekler(env, rec).includes(c)))];
  const metin = `${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}: ${fark} adet eksik geldi (istenen ${istenenAdet(rec)}, gelen ${rec.gelenAdet}). Ne zaman gelir?`;
  for (const c of kime) {
    const m = await kartGonderKopya(env, tg, rec, c, metin, { inline_keyboard: [...sureSatirlari(`fc:t:${kalan.id}`), [{ text: "❌ Gelmeyecek", callback_data: `fc:b:${kalan.id}` }]] });
    if (m) kalan.mesajlar.push(m);
  }
  kalan.log.push(`📦 Eksik geldi: ${fark} adet (${rec.id})`);
  await siparisYaz(env, kalan);
  await kanitYaz(env, rec, "Sami", `Eksik geldi: ${fark} adet — fabrikaya soruldu`, simdi);
  await bildir(env, rec, `📦 ${magazaAdi(rec.magaza)} · ${rec.kod}: ${fark} adet eksik geldi (istenen ${istenenAdet(rec)}, gelen ${rec.gelenAdet}). Sinem'e soruldu.`, tg);
}

// Fuat (fo:) ve Hemra (fh:) düğmeleri
export async function zincirDugmesi(env, cq, tg, simdi) {
  const [on, islem, id] = String(cq.data || "").split(":");
  const cevapla = (text, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  const rec = await siparisOku(env, id);
  const kim = kisiAd(cq.from);
  if (on === "fo") {
    const fuat = await fuatKimligi(env);
    if (String(cq.from.id) !== String(fuat) && !muratMi(env, cq.from.id)) return cevapla("Bu onay Fuat'ta.");
    if (!rec || rec.durum !== "bitti" || rec.fuatOnay || rec.fuatRet) return cevapla("Bu onay artık geçerli değil.");
    if (islem === "e") {
      rec.fuatOnay = { kim, zaman: simdi };
      rec.log.push(`✅ Fuat onayladı: bitti (${kim})`);
      await kanitYaz(env, rec, kim, "Onayladı: bitti", simdi, "✅ Onaylıyorum, bitti");
      await cevapla("Onaylandı");
      await kopyaDuzenle(env, tg, rec.fuatMesaj, `${dn(rec)}✅ Onayladınız: ${rec.kod} bitti. Teşekkürler.`);
      if (rec.hemraMesaj && rec.hemraMesaj[3]) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${rec.hemraMesaj[3]}\n✅ Fuat onayladı.`, rec.hemraOneri ? { inline_keyboard: [] } : { inline_keyboard: [[{ text: "🔁 Repete öner", callback_data: `fh:r:${rec.id}` }], [{ text: "❓ Patron karar versin", callback_data: `fh:q:${rec.id}` }], [{ text: "⏳ Stok bitene kadar bekle", callback_data: `fh:w:${rec.id}` }]] });
      await mesajlariGuncelle(env, rec, null, tg);
      await siparisYaz(env, rec);
      if (rec.deneme) await denemeKaydi(env, rec.liste, `Fuat onayı: bitti (${kim})`);
      return;
    }
    // ❌ Hayır, yapılabilir → bilgi Hemra'ya; model yeniden sorulabilir
    rec.fuatRet = { kim, zaman: simdi };
    await kanitYaz(env, rec, kim, "Hayır, yapılabilir (bitti değil)", simdi, "❌ Hayır, yapılabilir");
    await bitenCikar(env, rec.kod);
    const kimDedi = rec.cevaplayan || "Fabrika";
    Object.assign(rec, { durum: "bekliyor", cevaplayan: null, cevaplayanId: null, cevapZaman: null, durumYazi: "↩️ Lütfen yeniden seçin" }); // 10 Kasım: fabrikaya iç bilgi gitmez
    rec.log.push(`❌ Fuat: yapılabilir (${kim})`);
    await cevapla("Hemra'ya iletildi");
    await kopyaDuzenle(env, tg, rec.fuatMesaj, `${dn(rec)}❌ ${rec.kod}: "yapılabilir" dediniz. Hemra'ya iletildi.`);
    if (rec.hemraMesaj) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}\n❌ Fuat: "yapılabilir" dedi (${kimDedi} "bitti" demişti). Karar gerekmiyor; fabrikayla konuşun.`);
    else await tg(env, "sendMessage", { chat_id: await koordinatorId(env, simdi), text: `${dn(rec)}❌ Fuat: ${rec.kod} yapılabilir dedi (${kimDedi} "bitti" demişti).` });
    rec.hemraMesaj = null;
    await mesajlariGuncelle(env, rec, rec.durumYazi, tg);
    await siparisYaz(env, rec);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fuat: yapılabilir (${kim})`);
    return;
  }
  // fh: Hemra'nın önerisi → Venom'dan Patron'a onay kartı
  const yetkili = [sorumlu(env), String(env.BR_SORUMLU || "").split(",")[0].trim()].includes(String(cq.from.id)) || muratMi(env, cq.from.id);
  if (!yetkili) return cevapla("Bu karar Hemra'da.");
  if (!rec || !["bitti", "gelecek", "repete", "bekliyor"].includes(rec.durum) || rec.hemraOneri) return cevapla(rec && rec.hemraOneri ? `${rec.hemraOneri.kim} zaten seçti.` : "Bu karar artık geçerli değil.");
  if (islem === "s" && !muratMi(env, cq.from.id)) return cevapla(SILME_YOK, true); // 13 Kasım (kural 41): eski karttaki "Sil" düğmesi
  let oneri = { r: "repete", s: "sil", w: "bekle", q: "sor" }[islem];
  if (!oneri) return cevapla("Geçersiz düğme.");
  // 12 Kasım (Patron): Hemra "Repete" derse (hangi karttan olursa olsun, ör. "az kaldı") dağılım AYNI kartta belirlenir → Patron BİR KEZ onaylar → fabrika; iş Hemra'ya geri dönmez
  const rkYolu = oneri === "repete" && !rec.yeni && !rec.deneme && (await yeniAkisAcik(env));
  if (rkYolu && !rec.rkVeri) { const v = await rkVeriOku(env, rec, simdi); rec.rkVeri = { kalan: v.kalan, s7: v.s7, yil: v.yil, dagilim: v.dagilim }; }
  if ((rec.yeni && (oneri === "repete" || oneri === "bekle")) || rkYolu) { // 11 Kasım (yeni akış)
    const kart = rec.hemraMesaj && rec.hemraMesaj[3] ? String(rec.hemraMesaj[3]).replace(/\nNe yapalım\?$/, "") : `${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}`;
    if (oneri === "repete") { // Repete → dağılım onayı → Patron'a kart ([Onaylıyorum] [Reddediyorum]) → Fuat'ın repete kartı
      const acik = await acikRepete(env, rec.kod, { deneme: Boolean(rec.deneme), mod: Boolean(rec.mod) }).catch(() => null);
      if (acik) return cevapla(engelMetni(acik).replace(DENEME, ""), true); // kural 43
      rec.hemraOneri = { oneri, kim, zaman: simdi };
      rec.log.push(`📋 Hemra: repete (${kim})`);
      await cevapla("Repete");
      await rkHemradan(env, tg, rec, kart, kim, simdi);
      await siparisYaz(env, rec);
      if (rec.deneme) await denemeKaydi(env, rec.liste, `Hemra: repete (${kim}) → dağılım onayı → Patron kartı`);
      return;
    }
    // Bitene kadar bekle → Patron'a GİTMEZ: model sitede ve kanalda kalır; mağaza stoğu bitince SOLD OUT (Kemal) ve yeniden sorulur
    Object.assign(rec, { hemraOneri: { oneri, kim, zaman: simdi }, karar: "stokBitene", stokKontrol: simdi + 86400 });
    rec.log.push(`📋 Hemra: bitene kadar bekle (${kim})`);
    await cevapla("Bitene kadar bekle");
    if (rec.hemraMesaj) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${kart}\n\n⏳ ${kim}: bitene kadar bekle. Model sitede ve kanalda kalır; mağaza stoğu bitince SOLD OUT olur.`);
    await stokIste(env, "/kuyruk-ekle", { ad: "rkSonuc", kayit: { id: `bekle:${rec.id}`, rid: rec.id, biriktir: true, metin: `${denemeKaydiMi(rec) ? "🧪 DENEME — " : ""}⏳ ${rec.kod}: fabrikada bitti; ${kim} "bitene kadar bekle" dedi (model sitede ve kanalda kalır).` } }).catch(() => null);
    await siparisYaz(env, rec);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Hemra: bitene kadar bekle (${kim})`);
    return;
  }
  if (oneri === "repete" && !rec.deneme) { // 11 Kasım KURAL 43: açık repete varken (mal gelmeden) aynı modele yeni repete verilmez
    const acik = await acikRepete(env, rec.kod).catch(() => null);
    if (acik) return cevapla(engelMetni(acik), true);
  }
  const st = rec.deneme ? null : await magazaStoklari(env, rec.kod);
  let not = "";
  if (oneri === "sil" && st && st.var) { oneri = "bekle"; not = `Mağazada stok var (${st.yazi}) — kural gereği silinmez; stok bitince yeniden sorulur.`; }
  rec.hemraOneri = { oneri, kim, zaman: simdi };
  if (oneri === "bekle") { rec.karar = "stokBitene"; rec.stokKontrol = simdi + 86400; }
  rec.log.push(`📋 Hemra önerisi: ${oneri} (${kim})`);
  const ad = { repete: "🔁 Repete öner", sil: "🗑 Sil öner", bekle: "⏳ Stok bitene kadar bekle", sor: "❓ Patron karar versin" }[oneri];
  // 10 Kasım (görev kâğıdı kural 5): DENEME asla Patron'a karar olarak gitmez — sadece kanıt kaydı
  if (rec.deneme && !rec.zincir) {
    await cevapla("🧪 Deneme — Patron'a gitmedi");
    if (rec.hemraMesaj) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${rec.hemraMesaj[3] || `${magazaAdi(rec.magaza)} · ${rec.kod}`}\n\n🧪 ${kim}: ${ad}. DENEME olduğu için Patron'a GİTMEDİ (gerçekte Venom'dan Patron'a gider).`);
    await siparisYaz(env, rec);
    await denemeKaydi(env, rec.liste, `Hemra önerisi: ${oneri} (${kim}) — deneme, Patron'a gitmedi`);
    return;
  }
  await cevapla(not ? "Stok var — silinmez" : "Patron'a gidiyor", Boolean(not)); // (deneme yukarıda ayrıldı)
  if (rec.hemraMesaj) await kopyaDuzenle(env, tg, rec.hemraMesaj, `${rec.hemraMesaj[3] || `${magazaAdi(rec.magaza)} · ${rec.kod}`}${rec.fuatOnay && !rec.fuatOnay.kendisi ? "\n✅ Fuat onayladı." : ""}\n\n✅ ${kim}: ${ad}.${not ? `\n⛔ ${not}` : ""} Patron'un onayına gitti.`);
  const site = await siteListesi(env).catch(() => []);
  await stokIste(env, "/kuyruk-ekle", { ad: "bittiOneri", kayit: {
    id: `${rec.id}:${simdi}`, sip: rec.id, kod: rec.kod, magaza: rec.magaza || null, oneri, not, hemra: kim, tur: rec.hemraTur || "bitti",
    fabrika: rec.cevaplayan ? { kim: rec.cevaplayan, zaman: rec.cevapZaman || null, ne: rec.durum === "bitti" ? "bitti" : "az kaldı" } : rec.azKaldi ? { kim: rec.azKaldi.kim, zaman: rec.azKaldi.zaman, ne: "az kaldı" } : null,
    fuat: rec.fuatOnay ? { kim: rec.fuatOnay.kim, zaman: rec.fuatOnay.zaman } : null, stok: rec.deneme ? "deneme" : st && st.yazi ? st.yazi : "yok", deneme: Boolean(rec.deneme), mod: Boolean(rec.mod), zincir: Boolean(rec.zincir), foto: sitedenFoto(env, site || [], rec.kod),
  } });
  await siparisYaz(env, rec);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Hemra önerisi: ${oneri} (${kim}) → Venom → Patron kartı`);
}
// Model Patron kararıyla silindi mi / silinmesi onaylandı mı? (Kemal'in silme kaydı ya da onay kaydı)
export async function modelSilindi(env, kod) {
  try { if (await env.KAYIT.get(`silinen:${kod}`)) return true; } catch { /* */ }
  try { return Boolean(((await env.KAYIT.get("silme:onayli", "json")) || {})[String(kod)]); } catch { return false; }
}
// Patron'un kararı (Venom → "bittiKarar"): repete / sil / bekle
export async function bittiKararAdimi(env, simdi, tg) {
  const l = await stokIste(env, "/kuyruk-al", { ad: "bittiKarar" }).catch(() => []);
  for (const k of Array.isArray(l) ? l : []) {
    const rec = await siparisOku(env, k.sip);
    if (!rec) continue;
    rec.patronKarar = { karar: k.karar, zaman: simdi };
    rec.log.push(`👑 Patron: ${k.karar}`);
    await kanitYaz(env, rec, "Patron", `Karar: ${{ repete: "repete", sil: "sil", bekle: "stok bitene kadar bekle" }[k.karar] || k.karar}`, simdi);
    const hemra = await koordinatorId(env, simdi);
    const bas = `${dn(rec)}${magazaAdi(rec.magaza)} · ${rec.kod}`;
    if (k.karar === "repete") {
      await bitenCikar(env, rec.kod);
      Object.assign(rec, { karar: "repete", durum: rec.durum === "bitti" ? "kapandi" : rec.durum });
      await tg(env, "sendMessage", { chat_id: hemra, text: `${bas}: ✅ Patron "repete" dedi. Repete taslağı Venom'da (Patron onayıyla fabrikaya gider).` });
    } else if (k.karar === "sil") {
      const st = rec.deneme ? null : await magazaStogu(env, rec.kod);
      if (rec.deneme) { rec.karar = "sil"; rec.durum = "kapandi"; await tg(env, "sendMessage", { chat_id: hemra, text: `${bas}: Patron "sil" dedi — DENEME olduğu için hiçbir şey silinmedi.` }); }
      else if (st) { Object.assign(rec, { karar: "stokBitene", silOnayli: true, stokKontrol: simdi + 86400 }); await tg(env, "sendMessage", { chat_id: hemra, text: `${STOK_KURALI(rec.kod, st)} Patron "sil" dedi; stok bitince kendiliğinden kaldırılacak.` }); }
      else { Object.assign(rec, { karar: "sil", durum: "kapandi" }); await stokIste(env, "/gizle", { kod: rec.kod, kim: "Patron", simdi }); await silKuyrugu(env, rec.kod, "Patron", simdi); await tg(env, "sendMessage", { chat_id: hemra, text: `${bas}: 🗑 Patron "sil" dedi (mağaza stoğu yok). Siteden (Selin) ve kanaldan (Kemal) kaldırılıyor.` }); }
    } else {
      Object.assign(rec, { karar: "stokBitene", stokKontrol: simdi + 86400 });
      await tg(env, "sendMessage", { chat_id: hemra, text: `${bas}: ⏳ Patron "stok bitene kadar bekle" dedi${k.dugme ? ` (Venom kartında "${k.dugme}", ${new Date(((k.zaman || simdi) + SAAT_FARKI) * 1000).toISOString().slice(11, 16)})` : ""}. Stok bitince yeniden sorulur.` });
    }
    await siparisYaz(env, rec);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Patron kararı: ${k.karar}`);
  }
}

// Yazı (Sinem / Aziz / Merdan): ✏️ tarih, 📦 gelen adet, "3394 bitti", "3394 az kaldı", "3394 5 gün", "hepsi 5 gün"
const ADET_KALIP = /^\s*(\d{1,4})\s*(?:adet|tane|seri)?\s*$/i;
export function fabrikaMetniCoz(metin, simdi) {
  const t = String(metin || "").toLocaleLowerCase("tr").trim();
  if (/\bhepsi\b/.test(t)) { const s = tarihCoz(t, simdi); return s ? { hepsi: s } : null; }
  const sonuc = [];
  for (const p of t.split(/[,;\n]+/)) {
    const kodlar = p.match(/\b\d{4,6}\b/g) || [];
    if (!kodlar.length) continue;
    const kalan = p.replace(/\b\d{4,6}\b/g, " ");
    let ne = null;
    if (/az\s*kal|bitmek\s*[üu]zere/.test(kalan)) ne = { tur: "az" };
    else if (/stok(?:ta)?\s*kalmad|kalmad[ıi]|\bbitti\b|gelmeyecek|\byok\b|üretilmeyecek/.test(kalan)) ne = { tur: "bitti" };
    else { const s = tarihCoz(kalan, simdi); if (s) ne = { tur: "sure", sec: s }; }
    if (ne) for (const kod of kodlar) sonuc.push({ kod, ...ne });
  }
  return sonuc.length ? { kalemler: sonuc } : null;
}
export async function fabrikaYaziMesaji(env, m, tg, simdi, metinOverride = null) {
  const metin = String(metinOverride != null ? metinOverride : m.text || "").trim();
  if (!metin || metin.startsWith("/")) return false;
  const kim = kisiAd(m.from), kimId = m.from.id;
  const yaz = (text, ek = {}) => tg(env, "sendMessage", { chat_id: m.chat.id, text, ...ek });
  const bt = await env.KAYIT.get(`fabrikaTarih:${kimId}`, "json").catch(() => null);
  if (bt) {
    const sec = tarihCoz(metin, simdi);
    if (!sec) { await yaz("Tarihi anlayamadım. Örnek: 18.11 · 18 Kasım · 7 gün"); return true; }
    await env.KAYIT.delete(`fabrikaTarih:${kimId}`).catch(() => null);
    if (bt.toplu) { await topluBaslat(env, tg, { ids: bt.toplu, sec, kim, kimId, etiket: "liste" }, simdi); await yaz(`✅ Hepsi: ${sec.etiket} (~${gunGoster(sec.hazirGun)}). Kartlar güncelleniyor.`); return true; }
    const rec = await siparisOku(env, bt.id);
    if (!rec || !["gelecek", "bekliyor", "repete", "sureSoruluyor"].includes(rec.durum)) { await yaz("Bu kart artık geçerli değil."); return true; }
    await sureUygula(env, tg, rec, sec, { kim, kimId }, simdi, { aynen: metin });
    await yaz(`✅ ${rec.kod}: ${sec.etiket} (~${gunGoster(sec.hazirGun)}) kaydedildi.`, { reply_markup: { inline_keyboard: [[GERI_AL(`fc:u:${rec.id}`)]] } });
    return true;
  }
  const ba = await env.KAYIT.get(`fabrikaAdet:${kimId}`, "json").catch(() => null);
  const bkod = (metin.match(/^\s*(\d{4,6})(?!\d)/) || [])[1];
  const baRec = ba ? await siparisOku(env, ba.id) : null;
  if (ba && bkod && baRec && String(baRec.kod) !== bkod) { /* 10 Kasım: başka modelin yazısı → geliş adedi sayılmaz (eksik yoluna gider) */ }
  else if (ba) {
    const rec = baRec;
    const a = metin.match(ADET_KALIP);
    const renkler = a ? null : (listeCoz(`${rec ? rec.kod : "0000"} ${metin}`)[0] || {}).renkler || null;
    const adet = a ? Number(a[1]) : renkler ? renkler.reduce((t, r) => t + r.adet, 0) : null;
    if (adet == null) { await yaz("Adedi anlayamadım. Sadece sayı yazın (örnek: 30) ya da renk renk (siyah 20 bej 10)."); return true; }
    await env.KAYIT.delete(`fabrikaAdet:${kimId}`).catch(() => null);
    if (!rec) { await yaz("Bu kart artık geçerli değil."); return true; }
    rec.gelenYazanId = kimId;
    await malGeldi(env, tg, rec, { kim, kimId }, adet, renkler, simdi);
    return true;
  }
  if (!(await kisiKaydi(env, kimId))) return false; // durum yazıları sadece fabrika kişilerinden
  const c = fabrikaMetniCoz(metin, simdi);
  if (!c) return false;
  if (c.hepsi) {
    const ids = await stokIste(env, "/fs-kisi", { chat: String(m.chat.id) }).catch(() => []);
    if (!ids.length) { await yaz("Cevap bekleyen kartınız yok."); return true; }
    await topluBaslat(env, tg, { ids, sec: c.hepsi, kim, kimId, etiket: "hepsi" }, simdi);
    await yaz(`✅ Hepsi gelecek: ${c.hepsi.etiket} (~${gunGoster(c.hepsi.hazirGun)}) — ${ids.length} kart güncelleniyor.`);
    return true;
  }
  const satir = [];
  for (const k of c.kalemler.slice(0, 8)) {
    let rec = await stokIste(env, "/fs-kod", { kod: k.kod, chat: String(m.chat.id) }).catch(() => null);
    if (!rec && k.tur !== "sure") rec = await siparisAc(env, { kod: k.kod, renkler: [], liste: "metin", deneme: false, fotoKod: k.kod, tur: "bilgi", grup: kisiGrubu(await kisiKaydi(env, kimId)) }, simdi); // açık sipariş yoksa da kayda geçer
    if (!rec) { satir.push(`${k.kod}: açık sipariş yok — süre kaydedilemedi`); continue; }
    if (k.tur === "bitti") {
      if (rec.durum === "bitti") { satir.push(`${k.kod}: zaten "bitti" kayıtlı`); continue; }
      await bittiDedi(env, tg, rec, { kim, kimId }, simdi, metin);
      satir.push(`❌ ${k.kod}: bitti — kaydedildi`);
    } else if (k.tur === "az") {
      if (rec.azKaldi) { satir.push(`${k.kod}: zaten "az kaldı" kayıtlı`); continue; }
      await azKaldi(env, tg, rec, { kim, kimId }, simdi, metin);
      satir.push(`⚠️ ${k.kod}: az kaldı — kaydedildi`);
    } else {
      if (!["gelecek", "bekliyor", "repete", "sureSoruluyor"].includes(rec.durum)) { satir.push(`${k.kod}: bu sipariş artık süre almıyor`); continue; }
      await sureUygula(env, tg, rec, k.sec, { kim, kimId }, simdi, { aynen: metin });
      satir.push(`✅ ${k.kod}: ${k.sec.etiket} (~${gunGoster(k.sec.hazirGun)})`);
    }
  }
  await yaz(satir.join("\n") || "Anlayamadım. Örnek: 3394 bitti · 3394 az kaldı · 3394 5 gün · hepsi 5 gün");
  return true;
}
// Sesli mesaj (Sinem): Venom yazıya çevirir (çok küçük ücret, Venom'un sayacına yazılır), sonra yazı gibi işlenir
export async function fabrikaSesMesaji(env, m, tg, simdi) {
  const ses = m.voice || m.audio;
  if (!ses || !(await kisiKaydi(env, m.from.id)) || !env.VENOM || typeof env.VENOM.sesYazi !== "function") return false;
  const f = await tg(env, "getFile", { file_id: ses.file_id });
  if (!f || !f.ok) return false;
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`);
  if (!r.ok) return false;
  const metin = await env.VENOM.sesYazi(await r.arrayBuffer(), ses.duration || 30).catch(() => null);
  if (!metin) { await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Sesli mesajı anlayamadım; yazıyla yazar mısınız? (örnek: 3394 bitti)" }); return true; }
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `🎤 Anladığım: "${metin.slice(0, 200)}"` });
  if (await fabrikaYaziMesaji(env, m, tg, simdi, metin)) return true;
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Model kodu ve durumu anlaşılamadı. Örnek: 3394 bitti · 3394 az kaldı · 3394 5 gün" });
  return true;
}

// "Bitti" kararı (Murat / Hemra): fk:<r|s|b|S|v>:<id> — ilk basan geçerli; Sil için ikinci onay.
export async function kararDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const rec0 = await siparisOku(env, String(cq.data || "").split(":")[2]);
  // 10 Kasım (Patron): eski "Bitti → Ne yapalım?" kartı (Repete ver / Sil / Beklesin) EKİPTE ÇALIŞMAZ — silme kararı sadece Patron'un;
  // yeni akış: Hemra önerir (Repete öner / Sil öner / Bekle), Patron Venom'dan onaylar.
  if (!muratMi(env, cq.from.id)) {
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    return cevapla("Bu kart eskidi. Kararı Hemra önerir, Patron verir — sizden işlem gerekmez.");
  }
  if (!rec0) return cevapla("Bu karar artık geçerli değil.");
  const rec = await siparisOku(env, id);
  if (!rec || rec.durum !== "bitti") return cevapla("Bu karar artık geçerli değil.");
  if (rec.karar && rec.karar !== "beklesin") return cevapla(`${rec.kararVeren} zaten karar verdi.`);
  const kim = kisiAd(cq.from);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  const hepsiniYaz = async (metin) => { for (const [chat, mesaj] of rec.kararMesajlari || []) await tg(env, "editMessageText", { chat_id: chat, message_id: mesaj, text: `${dn(rec)}${metin}` }); };
  if (islem === "v") { await cevapla("Vazgeçildi"); return tg(env, "editMessageText", { ...benim, text: `${dn(rec)}${rec.kod} – fabrika bitti dedi. Ne yapalım?`, reply_markup: kararKlavye(rec.id) }); }
  if (islem === "s" && patronMu(env, cq.from.id)) return kararDugmesi(env, { ...cq, data: `fk:S:${id}` }, tg, simdi); // Patron: tek onay (2 Kasım)
  if ((islem === "s" || islem === "S") && !patronMu(env, cq.from.id)) return cevapla(SILME_YOK, true); // 13 Kasım (kural 41): eski karttaki "Sil" düğmesi
  if (islem === "s") {
    const ids = [...new Set((((await env.KAYIT.get("kodlar", "json")) || {})[rec.kod] || []).flatMap((g) => g.ids))].filter((x) => x > 0);
    await cevapla("Emin misiniz?");
    return tg(env, "editMessageText", { ...benim, text: `${dn(rec)}🗑️ ${rec.kod}: kanalda ${ids.length} paylaşım silinecek, siteden de kaldırılacak. Geri alınamaz. Emin misiniz?`, reply_markup: { inline_keyboard: [[{ text: "Evet, sil", callback_data: `fk:S:${rec.id}` }, { text: "Vazgeç", callback_data: `fk:v:${rec.id}` }]] } });
  }
  Object.assign(rec, { karar: { r: "repete", S: "sil", b: "beklesin" }[islem], kararVeren: kim, kararZaman: simdi });
  if (!rec.karar) return cevapla("Geçersiz düğme.");
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Bitti kararı: ${rec.karar} (${kim})`);
  if (rec.karar === "beklesin") {
    rec.beklesinZaman = simdi + 7 * 86400;
    rec.tekrarSoruldu = false;
    await siparisYaz(env, rec);
    await cevapla("Beklesin");
    return hepsiniYaz(`⏳ ${rec.kod}: ${kim} "Beklesin" dedi. 7 gün sonra yeniden sorulacak.`);
  }
  if (rec.karar === "repete") {
    rec.durum = "kapandi";
    await siparisYaz(env, rec);
    await cevapla("Repete isteği gidiyor");
    await hepsiniYaz(`🔁 ${rec.kod}: ${kim} "Repete ver" dedi. Fabrikaya repete isteği gönderildi.`);
    const yeni = await siparisAc(env, { kod: rec.kod, sorumlu: rec.sorumlu || null, beden: rec.beden || null, renkler: rec.renkler, liste: rec.liste, deneme: rec.deneme, mod: Boolean(rec.mod), fotoKod: rec.fotoKod, tur: "repete", grup: rec.grup }, simdi);
    return fabrikayaGonder(env, yeni, tg);
  }
  // Sil — 10 Kasım KESİN KURAL: mağaza stoğu bitmeden kaldırılmaz
  const stokVar = rec.deneme ? 0 : await magazaStogu(env, rec.kod);
  if (stokVar) {
    Object.assign(rec, { karar: "stokBitene", silOnayli: patronMu(env, cq.from.id), stokKontrol: simdi + 86400 });
    await siparisYaz(env, rec);
    await cevapla("Stok var — silinmez");
    return hepsiniYaz(STOK_KURALI(rec.kod, stokVar));
  }
  rec.durum = "kapandi";
  await siparisYaz(env, rec);
  await cevapla(rec.deneme ? "Deneme: silinmedi" : "Siliniyor");
  if (rec.deneme) return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi — DENEME olduğu için siteden ve kanaldan hiçbir şey silinmedi.`);
  await stokIste(env, "/gizle", { kod: rec.kod, kim, simdi });
  await silKuyrugu(env, rec.kod, kim, simdi); // önce Selin (site), sonra Kemal (kanal) — Patron'a tek sonuç mesajı
  return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi. Önce siteden (Selin), hemen ardından VOLONTE kanalındaki bütün paylaşımlar (Kemal) kaldırılıyor; Kemal turlarında artık önerilmeyecek. Yanlışsa Patron: /geri ${rec.kod}`);
}

// Yazıyla repete bildirimi: "3394 geldi" / "3394 repete geldi siyah 10 bej 6" (fabrika kişileri + ekip)
export async function repeteMetni(env, m, tg, simdi) {
  const metin = String(m.text || "").trim();
  const r = metin.match(/^(\d{4,6})\s+(?:repete\s+)?geldi\b(.*)$/is);
  if (!r) return false;
  const kod = r[1];
  if (indirimliMi(kod)) { await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} indirimli mal kodu (tekrar alınmaz) — repete kaydı açılmadı.` }); return true; }
  const adetM = String(r[2] || "").match(ADET_KALIP); // 10 Kasım: "3394 geldi 30" (mağaza: gelen adet)
  const renkler = adetM ? null : listeCoz(`${kod} ${r[2]}`)[0]?.renkler || null;
  const acik = await ayarOku(env, "fs:acik", []);
  const kisi = await kisiKaydi(env, m.from.id);
  const kisiGrup = kisi ? kisiGrubu(kisi) : null; // ekip: hepsi; Celal sadece kendi, fabrika sadece kendi modelleri
  if (kisiGrup) {
    const ted = await stokIste(env, "/tedarikci", { kodlar: [kod] });
    if (grupOf(ted[kod], kod) !== kisiGrup) { await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} sizin listenizde değil.` }); return true; }
  }
  let rec = null;
  for (const id of [...acik].reverse()) {
    const x = await siparisOku(env, id);
    if (x && x.kod === kod && !x.deneme && ["repete", "gelecek", "bekliyor", "sureSoruluyor"].includes(x.durum) && (!kisiGrup || (x.grup || "fabrika") === kisiGrup)) { rec = x; break; }
  }
  if (!rec) rec = await siparisAc(env, { kod, renkler: renkler || [], liste: "metin", deneme: false, fotoKod: kod, tur: "repete", grup: kisiGrup || "fabrika" }, simdi); // erken / listesiz bildirim
  rec.metinBildirim = { kimId: m.from.id, renkler, adet: adetM ? Number(adetM[1]) : !kisiGrup && renkler ? renkler.reduce((t, x) => t + x.adet, 0) : null, metin };
  if (rec.durum === "bekliyor" && rec.liste === "metin") rec.durum = "repete";
  await siparisYaz(env, rec);
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} ${rec.metinBildirim.adet != null && !kisiGrup ? `geldi – ${rec.metinBildirim.adet} adet (istenen ${istenenAdet(rec)})` : `repete geldi${renkler ? ` – ${renkSeri(renkler).replace(/ seri/g, "")}` : ""}`}, doğru mu?`, reply_markup: { inline_keyboard: [[{ text: "Evet", callback_data: `fc:e:${rec.id}` }, { text: "Hayır", callback_data: `fc:h:${rec.id}` }]] } });
  return true;
}

// ---------- 10 Kasım: zincirin 5 dakikalık adımı (Sami) ----------
export async function fabrikaZincirAdimi(env, simdi, tg) {
  if (await islemlerAdimi(env, simdi, tg)) return; // 10 Kasım: bir kerelik temizlik / deneme işleri (çalışma başına bir iş)
  await zincirTekSeferlik(env, simdi, tg);
  await zincirTakipAdimi(env, simdi).catch(() => null); // 11 Kasım: deneme zinciri takibi (Venom hatırlatır, Patron'a sadece sonuç)
  await bittiKararAdimi(env, simdi, tg);
  await topluAdimi(env, tg, simdi);
  if (await kagitAcik(env, "sami", "sinemOzeti")) await sinemOzeti(env, simdi, tg);
}
const sinemKimligi = async (env) => { const k = (await fabrikaKisileri(env, "fabrika")).find((x) => /sinem/i.test(String(x.ad || ""))); return k ? String(k.id) : ""; };
// Sinem'e her akşam 18:00 (pazar hariç): "Bugün istenen: …, cevap bekleyen: …, teslim tarihi yaklaşan: …" — mağaza mağaza
export function sinemOzetMetni(simdi, bugunGiden, acik) {
  const bugun = gunAnahtari(simdi), yarin2 = gunAnahtari(simdi + 2 * 86400);
  const bolum = [];
  for (const m of ["VOLONTE", "BLACKROSE", null]) {
    const sec = (l) => l.filter((x) => (x.magaza || null) === m && x.grup !== "celal" && !x.deneme);
    const istenen = [...new Set(sec(bugunGiden).map((x) => x.kod))];
    const bekleyen = [...new Set(sec(acik).filter((x) => x.durum === "bekliyor").map((x) => x.kod))];
    const yaklasan = sec(acik).filter((x) => ["gelecek", "repete"].includes(x.durum) && x.hazirGun && x.hazirGun <= yarin2).map((x) => `${x.kod} (${x.hazirGun < bugun ? "gecikti, " : ""}${gunGoster(x.hazirGun).slice(0, 5)})`);
    if (!istenen.length && !bekleyen.length && !yaklasan.length) continue;
    bolum.push(m ? magazaAdi(m) : "🏭 Eski kayıtlar (mağaza yazılmamış)",
      `• Bugün istenen (${istenen.length}): ${istenen.join(", ") || "yok"}`,
      `• Cevap bekleyen (${bekleyen.length}): ${bekleyen.join(", ") || "yok"}`,
      `• Teslim tarihi yaklaşan (${yaklasan.length}): ${yaklasan.join(", ") || "yok"}`, "");
  }
  return bolum.length ? [`🏭 Günlük özet (${gunGoster(bugun).slice(0, 5)})`, "", ...bolum].join("\n").trim() : null;
}
async function sinemOzeti(env, simdi, tg) {
  if (new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() === 0 || saat(simdi) < 18 || saat(simdi) >= 19) return;
  const g = gunAnahtari(simdi);
  if (await ayarOku(env, `fabrika:sinemOzet:${g}`, null)) return;
  await ayarYaz(env, `fabrika:sinemOzet:${g}`, 1);
  const sinem = await sinemKimligi(env);
  if (!sinem) return;
  const hafta = await ayarOku(env, `fs:hafta:${pazartesi(simdi)}`, {});
  const bugunGiden = Object.values(hafta).filter((x) => x.gonderim && gunAnahtari(x.gonderim) === g);
  const acik = (await stokIste(env, "/fs-ozet", {}).catch(() => [])).filter((x) => x.chats.includes(sinem));
  const metin = sinemOzetMetni(simdi, bugunGiden, acik);
  if (metin) await tg(env, "sendMessage", { chat_id: sinem, text: metin });
}
// Bir kerelik işler (Claude Code, Patron isteği): KV "sami:sinemDeneme" = "1" | {"v":"3394","b":"3900"} → Sinem'e 🧪 DENEME 1 VOLONTE + 1 Black Rose kartı
// (fabrika üretimine gitmez); KV "sami:silKontrol" = {"geri":true} → son 7 günde mağaza stoğu varken kaldırılan modeller (listele + geri ekle)
async function zincirTekSeferlik(env, simdi, tg) {
  const d = await env.KAYIT.get("sami:sinemDeneme").catch(() => null);
  if (d) {
    await env.KAYIT.delete("sami:sinemDeneme");
    let ayar = {}; try { ayar = JSON.parse(d); } catch { ayar = {}; }
    const sinem = await sinemKimligi(env);
    const g = gunAnahtari(simdi);
    const ilk = async (k) => { const x = await ayarOku(env, `fabrika:${k}`, null); return x && x.modeller && x.modeller[0] ? x.modeller[0].kod : null; };
    const kodlar = { VOLONTE: (ayar && ayar.v) || (await ilk(g)) || "3183", BLACKROSE: (ayar && ayar.b) || (await ilk(`${g}-BR`)) };
    const did = `SD${simdi.toString(36)}`;
    await denemeKaydi(env, did, "Sinem denemesi başladı");
    const sonuc = { zaman: simdi, did, sinem: Boolean(sinem), kartlar: [] };
    if (sinem) for (const magaza of ["VOLONTE", "BLACKROSE"]) {
      if (!kodlar[magaza]) continue;
      await tg(env, "sendMessage", { chat_id: sinem, text: `${DENEME}${listeBasi(magaza, 1)}` });
      const rec = await siparisAc(env, { kod: kodlar[magaza], renkler: [{ renk: "siyah", adet: 1 }], liste: did, deneme: true, fotoKod: kodlar[magaza], grup: "fabrika", magaza, sadece: [sinem] }, simdi);
      const r = await fabrikayaGonder(env, rec, tg);
      await tg(env, "sendMessage", { chat_id: sinem, text: `${DENEME}${listeSonu(magaza, 1)}\nDenemek için: süre düğmeleri, ↩️ Geri al, ⚠️ Az kaldı, ❌ Bitti. Ya da yazın: "${kodlar[magaza]} bitti" / "${kodlar[magaza]} 5 gün".` });
      sonuc.kartlar.push({ magaza, kod: kodlar[magaza], id: rec.id, giden: r.giden });
    }
    await env.KAYIT.put("sami:sinemDenemeSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  }
  const sk = await env.KAYIT.get("sami:silKontrol").catch(() => null);
  if (sk) {
    await env.KAYIT.delete("sami:silKontrol");
    let ayar = {}; try { ayar = JSON.parse(sk); } catch { ayar = {}; }
    const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json").catch(() => null)) || {};
    const liste = [];
    for (const [kod, x] of Object.entries(arsiv)) {
      if (!x || !(simdi - Number(x.zaman) < 7 * 86400) || x.ana || /^~/.test(kod)) continue;
      const st = await magazaStoklari(env, kod);
      const kayit = { kod, zaman: x.zaman, stok: st.yazi || "yok", aykiri: st.var, geri: false };
      if (st.var && ayar.geri) { await stokIste(env, "/goster", { kod }).catch(() => null); kayit.geri = Boolean(await geriKuyrugu(env, kod, "Stok kuralı (10 Kasım)", simdi)); }
      liste.push(kayit);
    }
    await env.KAYIT.put("sami:silKontrolSonuc", JSON.stringify({ zaman: simdi, liste }), { expirationTtl: 7 * 86400 });
  }
}

// 11 Kasım (Patron): DENEME ZİNCİRİ TAKİBİ — KV "sami:zincirTakip" = {gun, basla}. Aziz/Merdan kartı ya da Hemra onayı 45 dk (mesai 09–20)
// gecikirse Venom o kişiye yazar (en fazla 2 kez, 2 saat arayla). Sinem iki kartı da cevaplayınca Patron'a Venom'dan TEK sonuç satırı.
const ZT_GECIKME = 45 * 60;
const DURUM_AD = { gelecek: "Gelecek", repete: "Repete olacak", sureSoruluyor: "Repete olacak (süre soruluyor)", bitti: "Bitti, gelmeyecek", geldi: "Geldi", kapandi: "Kapandı" };
const saatYazi = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
async function zincirTakipAdimi(env, simdi) {
  const t = await env.KAYIT.get("sami:zincirTakip", "json").catch(() => null);
  if (!t || !t.gun) return;
  if (simdi - (t.basla || simdi) > 2 * 86400) { await env.KAYIT.delete("sami:zincirTakip"); return; }
  const g = t.gun; t.hatirlatma = t.hatirlatma || {};
  const saat = new Date((simdi + SAAT_FARKI) * 1000).getUTCHours();
  const mesai = saat >= 9 && saat < 20;
  let degisti = false;
  const hatirlat = async (ad, kime, metin, beri) => {
    const h = t.hatirlatma[ad] || { n: 0, son: 0 };
    if (!mesai || !kime || simdi - (beri || simdi) < ZT_GECIKME || h.n >= 2 || simdi - h.son < 2 * 3600) return;
    await stokIste(env, "/kuyruk-ekle", { ad: "zincirHatirlat", kayit: { id: `zh-${ad}-${simdi}`, ad, kime: String(kime), metin, zaman: simdi } }).catch(() => null);
    t.hatirlatma[ad] = { n: h.n + 1, son: simdi }; degisti = true;
  };
  const kodlar = {};
  for (const [ad, cfg] of [["aziz", MAGAZALAR[0]], ["merdan", MAGAZALAR[1]]]) {
    const d = await ayarOku(env, `fabrika:${g}${cfg.ek}-DK`, null);
    if (!d) continue;
    kodlar[ad] = (d.modeller || []).map((x) => x.kod).join(", ");
    if (["soruldu", "eminMi"].includes(d.asama)) await hatirlat(ad, cfg.kime(env), `🧪 DENEME — ${kodlar[ad]} kartınız cevap bekliyor: adetleri yazıp "✅ Eminim, gönder"e basın. (Venom)`, d.eminZaman || d.zaman || t.basla);
  }
  let b = null; let bk = null;
  for (const k of (await ayarOku(env, `fabrika:birlesik:${g}`, [])) || []) { const x = await ayarOku(env, `fabrika:${k}`, null); if (x && x.deneme && x.zincir) { b = x; bk = k; } }
  if (b && b.asama === "onayda") await hatirlat("hemra", sorumlu(env), `🧪 DENEME — ${gunGoster(g)} deneme listesi onayınızı bekliyor (sadece Sinem'e gidecek). Lütfen "Gidecek liste" kartına bakın. (Venom)`, b.zaman);
  if (b && b.asama === "gonderildi" && !(b.gonderilecek || []).length && !t.sonuc) {
    const recler = [];
    for (const id of Object.values(b.recler || {}).flat()) { const r = await siparisOku(env, id); if (r) recler.push(r); }
    if (recler.length && recler.every((r) => r.cevaplayan)) {
      const gidenler = new Set(recler.flatMap((r) => (r.mesajlar || []).map((m) => String(m[0]))));
      const fn = [env.FUAT_ID, env.NURI_ID].filter(Boolean).map(String).some((x) => gidenler.has(x));
      const sinem = recler.map((r) => `${r.kod} ${DURUM_AD[r.durum] || r.durum}${r.hazirGun ? ` (${String(r.hazirGun).slice(8, 10)}.${String(r.hazirGun).slice(5, 7)} hazır)` : ""}`).join(", ");
      const metin = `🧪 Deneme zinciri tamam: Aziz (${kodlar.aziz || "-"}) ✓ · Merdan (${kodlar.merdan || "-"}) ✓ · Hemra onayladı${b.onayZaman ? ` ${saatYazi(b.onayZaman)}` : ""} · Sinem: ${sinem}. ${fn ? "⚠️ Fuat/Nuri'ye de gitti!" : "Fuat ve Nuri'ye gitmedi"}; fabrikaya üretim ve gerçek kayıt yok.`;
      await stokIste(env, "/kuyruk-ekle", { ad: "zincirSonuc", kayit: { id: `zs-${bk}`, metin, zaman: simdi } }).catch(() => null);
      t.sonuc = { zaman: simdi, metin }; degisti = true;
    }
  }
  if (degisti) await env.KAYIT.put("sami:zincirTakip", JSON.stringify(t), { expirationTtl: 3 * 86400 });
}

// 10 Kasım (Patron, BÜTÜN HATALAR): bir kerelik işler — KV "sami:islemler" = [{ tur, ... }] → sonuç "sami:islemSonuc"
//  defterDok {chat, basla}: o kişiye giden kayıtlı mesajlar (mesaj no ile) · mesajKapat {chat, ids, metin}: düğmeler kalkar, yazı değişir
//  recIptal {ids, neden}: sipariş kapanır (bitti kaydı geçersiz) · hemraKarti {ids}: yeni akış karar kartı (Hemra) · kartYenile: açık fabrika
//  kartları yeni düğmelerle (yerinde) · listeYenile {anahtar}: Aziz/Merdan liste kartları yeni düğmelerle · kisiDeneme {v, b}: her kişiye TEK 🧪 kart
export async function islemlerAdimi(env, simdi, tg) {
  let yapilan = 0;
  for (let i = 0; i < 3; i++) { const r = await tekIslem(env, simdi, tg); if (!r) break; yapilan++; if (r === "agir") break; }
  return yapilan > 0;
}
async function tekIslem(env, simdi, tg) {
  const l = await env.KAYIT.get("sami:islemler", "json").catch(() => null);
  if (!Array.isArray(l) || !l.length) return false;
  const is = l[0];
  const sonuc = { tur: is.tur, zaman: simdi };
  let bitti = true;
  if (is.tur === "defterDok") {
    const r = await stokIste(env, "/isd-oku", { basla: is.basla || simdi - 86400, bitis: simdi, denemeDahil: true }).catch(() => []);
    sonuc.satirlar = (Array.isArray(r) ? r : []).filter((x) => String(x.chat || x.kime) === String(is.chat)).map((x) => ({ saat: new Date((x.zaman + SAAT_FARKI) * 1000).toISOString().slice(11, 16), bot: x.bot, tur: x.tur, mesaj: x.mesaj, ozet: String(x.ozet || "").slice(0, 70) }));
  } else if (is.tur === "mesajKapat") {
    sonuc.l = [];
    for (const id of (is.ids || []).slice(0, 30)) {
      let r = await tg(env, "editMessageText", { chat_id: is.chat, message_id: id, text: is.metin, reply_markup: { inline_keyboard: [] } });
      if (!(r && r.ok)) r = await tg(env, "editMessageCaption", { chat_id: is.chat, message_id: id, caption: is.metin, reply_markup: { inline_keyboard: [] } });
      sonuc.l.push({ id, ok: Boolean(r && r.ok), hata: r && !r.ok ? String(r.description || "").slice(0, 80) : null });
    }
  } else if (is.tur === "kartYenidenGonder") { // 12 Kasım (Patron): bir listenin açık fabrika kartları kapatılır (düğmesiz "kapandı" yazısı), aynı sipariş YENİ kartla aynı kişiye gider {liste, kodlar, neden}
    sonuc.l = [];
    for (const id of (is.ids ? is.ids.map(String) : await ayarOku(env, "fs:acik", [])).slice(0, 200)) {
      const rec = await siparisOku(env, id);
      if (!rec || rec.deneme || (!is.ids && ["kapandi", "geldi"].includes(rec.durum))) continue; // kayıt numarası verilirse kapanmış kayıt da yeniden gönderilir
      if (is.ids ? !is.ids.map(String).includes(String(id)) : rec.liste !== is.liste || !(is.kodlar || []).map(String).includes(String(rec.kod))) continue; // kayıt numarasıyla ya da liste + kodla
      for (const [chat, mesaj, tur] of rec.mesajlar || []) await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: `${siparisMetni(rec)}\n\n⏩ Bu kart kapandı (${is.neden || "yenilendi"}) — yeni kart aşağıda.`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
      Object.assign(rec, { durum: "kapandi", iptal: { neden: is.neden || "yenilendi", zaman: simdi }, kararMesajlari: [] });
      rec.log.push(`⏩ Kart kapandı, yenisi gönderildi: ${is.neden || "yenilendi"}`);
      await siparisYaz(env, rec);
      await bitenCikar(env, rec.kod);
      const yeni = await siparisAc(env, { kod: rec.kod, beden: rec.beden, renkler: rec.renkler, liste: rec.liste, deneme: false, fotoKod: rec.fotoKod || rec.kod, tur: rec.tur, grup: rec.grup, sorumlu: rec.sorumlu, magaza: rec.magaza }, simdi);
      for (const k of ["yeni", "test", "acil", "yerine", "rkVeri", "testVeri"]) if (rec[k] != null) yeni[k] = rec[k]; // aynı akıştan devam (yeni akış: Hemra'nın repete kartı)
      await siparisYaz(env, yeni);
      const r = await fabrikayaGonder(env, yeni, tg);
      sonuc.l.push({ eski: id, yeni: yeni.id, kod: rec.kod, giden: r.giden });
    }
  } else if (is.tur === "kartTakipEski") { // 13 Kasım: bu andan ÖNCE açılmış cevapsız kartlar "eski" işaretlenir — yeni merdiven onları kendiliğinden hatırlatmaz
    const l = JSON.parse((await stokIste(env, "/ayar-oku", { k: "kartTakip" })).v || "[]");
    const adlar = await kayitliKisiler(env);
    sonuc.l = [];
    for (const x of l) { if (x.bitti || x.eski || (is.once && x.zaman >= is.once)) continue; x.eski = simdi; sonuc.l.push({ kim: adlar[x.chat] || "kayıtsız hesap", mesaj: x.mesaj, zaman: x.zaman, ozet: x.ozet, kod: x.kod || kartKodu(x.ozet), hat: Boolean(x.hat), bildirildi: Boolean(x.bildirildi) }); }
    await stokIste(env, "/ayar-yaz", { k: "kartTakip", v: JSON.stringify(l.slice(-300)) });
  } else if (is.tur === "denemeBitir" || is.tur === "denemeKapat") {
    // 13 Kasım (Patron, kural 40): deneme kayıtları tek seferde SESSİZCE kapanır — kimseye mesaj gitmez, kartlara dokunulmaz.
    // denemeBitir: "mod" işaretli bütün açık kayıtlar (Patron "deneme bitti" dedi). denemeKapat: { fs: [id], rk: [id], gun, kodlar,
    // hafizaSil } — işaretsiz açılmış eski deneme kayıtları (12 Kasım Celal denemesi) geriye dönük 🧪 işaretlenip kapanır.
    Object.assign(sonuc, await denemeKayitlariKapat(env, simdi, is.tur === "denemeKapat" ? is : {}));
    if (is.bildir !== false) await stokIste(env, "/kuyruk-ekle", { ad: "rkSonuc", kayit: { id: `db:${simdi}`, rid: `deneme-${simdi}`, metin: `🧪 Deneme kapandı: ${sonuc.fs.length} fabrika kaydı, ${sonuc.rk.length} repete kaydı${[...new Set([...sonuc.fs, ...sonuc.rk].map((x) => x.kod))].length ? ` (${[...new Set([...sonuc.fs, ...sonuc.rk].map((x) => x.kod))].join(", ")})` : ""}. Kimseye mesaj gitmedi.` } }).catch(() => null);
  } else if (is.tur === "recIptal") {
    sonuc.l = [];
    for (const id of (is.ids || []).slice(0, 20)) {
      const rec = await siparisOku(env, id);
      if (!rec) { sonuc.l.push({ id, ok: false }); continue; }
      Object.assign(rec, { durum: "kapandi", iptal: { neden: is.neden, zaman: simdi }, kararMesajlari: [] });
      rec.log.push(`⛔ Geçersiz: ${is.neden}`);
      await siparisYaz(env, rec);
      await bitenCikar(env, rec.kod);
      sonuc.l.push({ id, kod: rec.kod, ok: true });
    }
  } else if (is.tur === "hemraKarti") {
    sonuc.l = [];
    for (const id of (is.ids || []).slice(0, 5)) {
      const rec = await siparisOku(env, id);
      if (!rec || rec.durum !== "bitti") { sonuc.l.push({ id, ok: false }); continue; }
      await hemraKarti(env, tg, rec, "bitti", rec.cevaplayan || "fabrika", simdi);
      await siparisYaz(env, rec);
      sonuc.l.push({ id, kod: rec.kod, ok: Boolean(rec.hemraMesaj) });
    }
  } else if (is.tur === "kartYenile") { // açık fabrika kartları yeni düğmelerle (yerinde); çalışma başına 6 sipariş
    const kalan = is.kalan || (await stokIste(env, "/fs-ozet", {}).catch(() => [])).filter((x) => !x.deneme && x.grup === "fabrika" && ["bekliyor", "gelecek", "repete", "sureSoruluyor"].includes(x.durum)).map((x) => x.id);
    sonuc.yenilenen = [];
    for (const id of kalan.splice(0, 6)) { const rec = await siparisOku(env, id); if (rec && rec.mesajlar && rec.mesajlar.length) { await mesajlariGuncelle(env, rec, null, tg); sonuc.yenilenen.push(rec.kod); } }
    if (kalan.length) { bitti = false; l[0] = { ...is, kalan }; }
  } else if (is.tur === "listeYenile") {
    const d = await ayarOku(env, `fabrika:${is.anahtar}`, null);
    sonuc.l = [];
    if (d && d.mesajlar) {
      const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
      for (const [kod, [mesaj]] of Object.entries(d.mesajlar).slice(0, 25)) {
        const sc = secimNorm(d.secim && d.secim[kod]);
        const r = await tg(env, "editMessageReplyMarkup", { chat_id: kimeOf(env, d), message_id: mesaj, reply_markup: modelKlavye(is.anahtar, kod, Boolean(sonIstek[kod]), sc && sc.beden ? sc.beden : null, secimTamam(sc)) });
        sonuc.l.push({ kod, ok: Boolean(r && r.ok) });
      }
    }
  } else if (is.tur === "acilYaz") { // 10 Kasım (Patron): ACİL modeller {kodlar:[{kod, magaza, min, not}], gun: 3} — listenin başında, en az min adet
    const a = (await ayarOku(env, "fabrika:acil", {})) || {};
    for (const x of is.kodlar || []) a[String(x.kod)] = { magaza: x.magaza || null, min: x.min || 40, not: x.not || "stok az", zaman: simdi, bitis: simdi + (is.gun || 3) * 86400 };
    await ayarYaz(env, "fabrika:acil", a);
    sonuc.acil = Object.keys(a);
    // bugünün açık listesinde olmayan acil model listeye eklenir (kontrol kartı kişiye gelir); varsa sıranın başına alınır
    sonuc.eklenen = [];
    for (const cfg of MAGAZALAR) {
      const ana = `${gunAnahtari(simdi)}${cfg.ek}`;
      const d = await ayarOku(env, `fabrika:${ana}`, null);
      const kodlar0 = (is.kodlar || []).filter((x) => (x.magaza || cfg.magaza) === cfg.magaza).map((x) => String(x.kod));
      if (!kodlar0.length) continue;
      if (!d || !KART_ACIK.includes(d.asama)) { // bugünkü liste gönderildi → ⚡ ACİL EK LİSTE (kontrol → Hemra → fabrika; fabrikadaki eski istek yerine geçer)
        const ekAd = `${ana}-acil${((d && d.ekler) || []).filter((k) => /-acil/.test(k)).length + 1}`;
        if (d) { d.ekler = [...(d.ekler || []), ekAd]; d.bilinen = [...new Set([...(d.bilinen || []), ...kodlar0])]; await ayarYaz(env, `fabrika:${ana}`, d); }
        const ted = await stokIste(env, "/tedarikci", { kodlar: kodlar0 }).catch(() => ({}));
        const satis = await satislarAl(env, gunAnahtari(simdi), cfg.magaza).catch(() => []);
        const satirlar = [];
        for (const k of kodlar0) { const st = await magazaStoklari(env, k).catch(() => null); satirlar.push({ kod: k, satilan: (satis.find((x) => x.kod === k) || {}).satilan || 0, kalan: st && st.magazalar ? st.magazalar[cfg.magaza] || 0 : null, ...(ted[k] || {}) }); }
        await listeyiGonder(env, gunAnahtari(simdi), satirlar, simdi, tg, null, { anahtar: ekAd, ek: true, cfg, baslik: `⚡ ACİL EK LİSTE — stok ~2 günde bitiyor; her model için EN AZ 40 adet (bugün istenenin yerine geçer)` });
        sonuc.eklenen.push(`${ekAd}: ${kodlar0.join(", ")}`);
        continue;
      }
      const kodlar = kodlar0;
      const yeni = kodlar.filter((k) => !(d.modeller || []).some((m) => m.kod === k));
      if (yeni.length) {
        const ted = await stokIste(env, "/tedarikci", { kodlar: yeni }).catch(() => ({}));
        const st = await stokIste(env, "/toplu", { kodlar: yeni }).catch(() => ({}));
        for (const k of yeni) d.modeller.push({ kod: k, satilan: 0, kalan: st[k] ? st[k].toplam : null, grup: grupOf(ted[k], k), ikiKart: Boolean(ted[k] && ted[k].ikiKart), ekstra: true, acil: true });
        d.gonderilmedi = [...yeni, ...(d.gonderilmedi || [])];
        d.bilinen = [...new Set([...(d.bilinen || []), ...yeni])];
        sonuc.eklenen.push(...yeni.map((k) => `${k} (${cfg.etiket})`));
      }
      d.gonderilmedi = [...(d.gonderilmedi || []).filter((k) => kodlar.includes(k)), ...(d.gonderilmedi || []).filter((k) => !kodlar.includes(k))];
      await ayarYaz(env, `fabrika:${ana}`, d);
      await modelParcasi(env, ana, tg).catch(() => null);
    }
  } else if (is.tur === "celalOku") { // 12 Kasım (okuma): Celal'in modelleri — grup, mağaza stoğu, son istek, açık fabrika / repete kaydı, bugünkü liste durumu
    const kodlar = (is.kodlar || []).map(String).slice(0, 20);
    const ted = await stokIste(env, "/tedarikci", { kodlar }).catch(() => ({}));
    const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
    const acik = await ayarOku(env, "fs:acik", []);
    sonuc.kisiler = (await tumKisiler(env)).map((k) => ({ ad: k.ad, grup: kisiGrubu(k) }));
    sonuc.modeller = [];
    for (const k of kodlar) {
      const st = await magazaStoklari(env, k).catch(() => null);
      const fs = []; for (const id of acik.filter((x) => String(x).startsWith(`${k}-`))) { const r = await siparisOku(env, id); if (r && !r.deneme) fs.push({ id, durum: r.durum, grup: r.grup, gonderim: r.gonderim }); }
      sonuc.modeller.push({ kod: k, grup: grupOf(ted[k], k), tedarikci: (ted[k] || {}).tedarikci || null, stok: st ? st.magazalar : null, sonIstek: sonIstek[k] || null, acikFs: fs, foto: Boolean(await fotoBul(env, k).catch(() => null)) });
    }
    sonuc.bugun = {}; for (const cfg of MAGAZALAR) { const x = await ayarOku(env, `fabrika:${gunAnahtari(simdi)}${cfg.ek}`, null); sonuc.bugun[cfg.magaza] = x ? { asama: x.asama, ekler: x.ekler || [], n: (x.modeller || []).length } : null; }
    sonuc.yeniAkis = await yeniAkisAcik(env);
  } else if (is.tur === "ozelListe") { // 12 Kasım (Patron): GERÇEK akışla sadece verilen modeller — kontrol (Aziz) → Hemra onayı → fabrika / Celal (grubuna göre)
    const cfg = MAGAZALAR.find((c) => c.magaza === (is.magaza || "VOLONTE")) || MAGAZALAR[0];
    const ana = `${gunAnahtari(simdi)}${cfg.ek}`;
    const d = await ayarOku(env, `fabrika:${ana}`, null);
    const kodlar0 = (is.kodlar || []).map(String).filter(Boolean).slice(0, 10);
    if (!kodlar0.length) sonuc.hata = "model yok";
    else {
      let ekAd = null; for (let i = 1; i <= 3 && !ekAd; i++) if (!(await ayarOku(env, `fabrika:${ana}-ozel${i}`, null))) ekAd = `${ana}-ozel${i}`;
      if (!ekAd) { sonuc.hata = "bugün 3 özel liste açıldı; yenisi açılmaz"; } else {
      if (d) { d.ekler = [...(d.ekler || []), ekAd]; d.bilinen = [...new Set([...(d.bilinen || []), ...kodlar0])]; await ayarYaz(env, `fabrika:${ana}`, d); }
      const ted = await stokIste(env, "/tedarikci", { kodlar: kodlar0 }).catch(() => ({}));
      const satis = await satislarAl(env, gunAnahtari(simdi), cfg.magaza).catch(() => []);
      const satirlar = [];
      for (const k of kodlar0) { const st = await magazaStoklari(env, k).catch(() => null); satirlar.push({ kod: k, satilan: (satis.find((x) => x.kod === k) || {}).satilan || 0, kalan: st && st.magazalar ? st.magazalar[cfg.magaza] || 0 : null, ...(ted[k] || {}) }); }
      const modda = await modAcik(env); // 13 Kasım (kural 40): deneme modu açıkken başlatılan özel liste 🧪
      await listeyiGonder(env, gunAnahtari(simdi), satirlar, simdi, tg, null, { anahtar: ekAd, ek: true, cfg, baslik: is.baslik || "EK LİSTE", mod: modda });
      Object.assign(sonuc, { anahtar: ekAd, mod: modda, modeller: satirlar.map((x) => `${x.kod} (${grupOf(x)})`) });
      }
    }
  } else if (is.tur === "dunTamamla") { // 10 Kasım (Patron): dün gitmeyen liste — bugün zaten istenen modeller çıkarılır, kalanı tamamlatılır
    const d = await ayarOku(env, `fabrika:${is.anahtar}`, null);
    if (!d) { sonuc.hata = "liste yok"; } else {
      const g = gunAnahtari(simdi), mg = d.magaza || MAGAZA;
      const bugun = new Set();
      for (const k of (await ayarOku(env, `fabrika:birlesik:${g}`, [])) || []) { const b = await ayarOku(env, `fabrika:${k}`, null); if (b && !b.deneme) for (const x of b.liste || []) if ((x.magaza || MAGAZA) === mg) bugun.add(x.kod); }
      const bd = await ayarOku(env, `fabrika:${g}${(MAGAZALAR.find((c) => c.magaza === mg) || MAGAZALAR[0]).ek}`, null);
      for (const x of (bd && bd.modeller) || []) bugun.add(x.kod);
      const cik = (d.modeller || []).map((x) => x.kod).filter((k) => bugun.has(k));
      for (const kod of cik) {
        const mm = (d.mesajlar || {})[kod];
        if (mm) await tg(env, mm[1] === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: kimeOf(env, d), message_id: mm[0], [mm[1] === "foto" ? "caption" : "text"]: `${mm[2]}\n\n↪️ ${kod} bugünkü listede; burada tekrar istenmez.`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
        if (d.secim) delete d.secim[kod];
        if (d.mesajlar) delete d.mesajlar[kod];
      }
      d.modeller = (d.modeller || []).filter((x) => !cik.includes(x.kod));
      d.gonderilmedi = (d.gonderilmedi || []).filter((k) => !cik.includes(k));
      d.dunden = true; d.zaman = simdi; d.hatirlatildi = true;
      sonuc.cikarilan = cik;
      sonuc.kalan = d.modeller.map((x) => ({ kod: x.kod, tamam: secimTamam(secimNorm((d.secim || {})[x.kod])) }));
      if (!d.modeller.length) { d.asama = "iptal"; await ayarYaz(env, `fabrika:${is.anahtar}`, d); }
      else {
        if (!KART_ACIK.includes(d.asama)) d.asama = "soruldu";
        await ayarYaz(env, `fabrika:${is.anahtar}`, d);
        const ad = `${gunGoster(d.gun || is.anahtar.slice(0, 10))} ${cfgOf(d).etiket} eksik listesi (dünden kalan)`;
        await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: `📌 ${ad}: fabrikaya gitmemiş. Bugünkü listede olanlar çıkarıldı (${cik.join(", ") || "—"}). Kalan ${d.modeller.length} model; bitirince "Eminim, gönder" ile Hemra'ya gider.` });
        if (d.modeller.every((x) => secimTamam(secimNorm((d.secim || {})[x.kod])))) await kartGonder(env, tg, is.anahtar, d);
        else await kalanlariSor(env, tg, is.anahtar, d, ad);
      }
    }
  } else if (is.tur === "listeOku") { // okuma: bir listenin içeriği (fiyat yok) — {anahtar}
    const d = await ayarOku(env, `fabrika:${is.anahtar}`, null);
    sonuc.d = d ? { asama: d.asama, magaza: d.magaza || null, deneme: Boolean(d.deneme), onaylayan: d.onaylayan || null, onayZaman: d.onayZaman || null, gonderilecek: (d.gonderilecek || []).length, giden: d.giden || 0, atlanan: d.atlanan || [], fabrikaBildirildi: d.fabrikaBildirildi || null,
      liste: (d.liste || []).map((x) => ({ kod: x.kod, magaza: x.magaza, beden: x.beden, adet: (x.renkler || []).reduce((t, r) => t + r.adet, 0), renkler: renkYazi(x.renkler || []) })),
      modeller: (d.modeller || []).map((x) => ({ kod: x.kod, gitti: Boolean((d.mesajlar || {})[x.kod]), secim: (d.secim || {})[x.kod] ? (secimTamam(secimNorm(d.secim[x.kod])) ? "tamam" : "yarım") : null })), gonderilmedi: d.gonderilmedi || [], istenmeyen: d.istenmeyen || [] } : null;
  } else if (is.tur === "listedenCikar") { // {anahtar, kodlar, neden}: modeller listeden çıkar, kartları açıklamayla kapanır (liste boşalırsa kapanır)
    const d = await ayarOku(env, `fabrika:${is.anahtar}`, null);
    if (!d) sonuc.hata = "liste yok";
    else {
      const cik = (d.modeller || []).map((x) => x.kod).filter((k) => (is.kodlar || []).map(String).includes(k));
      for (const kod of cik) {
        const mm = (d.mesajlar || {})[kod];
        if (mm) await tg(env, mm[1] === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: kimeOf(env, d), message_id: mm[0], [mm[1] === "foto" ? "caption" : "text"]: `${mm[2]}\n\n↪️ ${kod}: ${is.neden || "listeden çıkarıldı"}`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
        if (d.secim) delete d.secim[kod];
        if (d.mesajlar) delete d.mesajlar[kod];
      }
      d.modeller = (d.modeller || []).filter((x) => !cik.includes(x.kod));
      d.gonderilmedi = (d.gonderilmedi || []).filter((k) => !cik.includes(k));
      if (!d.modeller.length) d.asama = "iptal";
      await ayarYaz(env, `fabrika:${is.anahtar}`, d);
      sonuc.cikarilan = cik; sonuc.kalan = d.modeller.map((x) => x.kod); sonuc.asama = d.asama;
      if (cik.length && is.bilgi) await tg(env, "sendMessage", { chat_id: kimeOf(env, d), text: is.bilgi });
    }
  } else if (is.tur === "satisSayimOku") { // okuma: ortak satış sayımı (ofis ile aynı) + eski "ilk 8" hesabı (karşılaştırma için)
    sonuc.m = {};
    for (const m of ["VOLONTE", "BLACKROSE"]) { const x = await stokIste(env, "/satis-sayim", { gun: is.gun || gunAnahtari(simdi), magaza: m }).catch(() => null); if (x) sonuc.m[m] = { toplam: x.toplam, model: x.model, indirimliAdet: x.indirimliAdet, ilk8: (x.liste || []).slice(0, 8).reduce((t, y) => t + y.satilan, 0) }; }
  } else if (is.tur === "kanitOku") { // gerçek akış kanıtı (Telegram'ın döndürdüğü mesajlar) — StokDO "kanit:gercek:<gün>"
    sonuc.l = ((await ayarOku(env, `kanit:gercek:${is.gun || gunAnahtari(simdi)}`, [])) || []).filter((x) => !is.basla || x.zaman >= is.basla).slice(-(is.son || 60));
  } else if (is.tur === "gidenSifirla") { // 11 Kasım: eski hatanın yanlış güne yazdığı "fabrikaya giden" sayımı silinir {gun}
    sonuc.eski = await ayarOku(env, `fabrika:fabrikayaGiden:${is.gun}`, null);
    await ayarYaz(env, `fabrika:fabrikayaGiden:${is.gun}`, {});
  } else if (is.tur === "gittiHesap") { // 11 Kasım: okuma — Venom'un "fabrikaya gitti" satırı o gün için ne derdi (hiçbir şey yazmaz/göndermez)
    const lg = is.gun || gunAnahtari(simdi);
    const { giden, bekleyen } = await gidenSay(env, lg, null, null);
    sonuc.metin = gittiMetni(lg, simdi, giden, bekleyen); sonuc.giden = giden;
  } else if (is.tur === "listeDurum") { // 10 Kasım: bugünün ve dünün liste durumu (okuma; hiçbir şey göndermez)
    sonuc.satisAcik = (await env.KAYIT.get("sami:satisAcik")) === "1";
    sonuc.gunler = {};
    for (const i of [0, 1, 2]) {
      const g = gunAnahtari(simdi - i * 86400);
      const o = {};
      for (const cfg of MAGAZALAR) {
        const ana = `${g}${cfg.ek}`;
        const d = await ayarOku(env, `fabrika:${ana}`, null);
        const satis = await satislarAl(env, g, cfg.magaza).catch(() => []);
        const ozet = (x) => (x ? { asama: x.asama, model: (x.modeller || []).length, secilen: Object.keys(x.secim || {}).length, gonderilmedi: (x.gonderilmedi || []).length, birlesik: x.birlesik || null, zaman: x.zaman || null, kodlar: (x.modeller || []).map((m) => m.kod).slice(0, 80) } : null);
        o[cfg.magaza] = { ana: ozet(d), ekler: await Promise.all(((d && d.ekler) || []).map(async (k) => ({ k, ...ozet(await ayarOku(env, `fabrika:${k}`, null)) }))), satisModel: satis.length, satisAdet: satis.reduce((t, x) => t + (Number(x.satilan) || 0), 0), satisKod: satis.map((x) => x.kod).slice(0, 80) };
      }
      o.birlesik = await Promise.all(((await ayarOku(env, `fabrika:birlesik:${g}`, [])) || []).map(async (k) => { const b = await ayarOku(env, `fabrika:${k}`, null); return { k, asama: b && b.asama, deneme: Boolean(b && b.deneme), liste: b ? (b.liste || []).length : 0, parcalar: b && b.parcalar }; }));
      sonuc.gunler[g] = o;
    }
  } else if (is.tur === "birlesikDeneme") { // 10 Kasım: kontrolü biten kişi deneme listeleri Hemra'ya (fabrikaya GİTMEZ)
    const g = is.gun || gunAnahtari(simdi);
    sonuc.anahtar = await birlesikOnay(env, tg, g, simdi, [`${g}-DK`, `${g}-BR-DK`], { deneme: true });
  } else if (is.tur === "kararGeriAl") { // 10 Kasım (Patron): kaynağı kanıtlanamayan Patron kararı geri alınır, karar Patron'a yeniden sorulur
    sonuc.l = [];
    for (const id of (is.ids || []).slice(0, 10)) {
      const rec = await siparisOku(env, id);
      if (!rec) { sonuc.l.push({ id, ok: false }); continue; }
      const eski = rec.karar;
      Object.assign(rec, { karar: null, stokKontrol: null, silOnayli: false });
      rec.log.push(`↩️ Patron kararı geri alındı (${eski}): kaynağı kanıtlanamadı — Patron'a yeniden soruldu`);
      await kanitYaz(env, rec, "Sami", `Patron kararı (${eski}) geri alındı: Patron böyle bir karar vermediğini söyledi; karar yeniden Patron'a soruldu`, simdi).catch(() => null);
      const st = await magazaStoklari(env, rec.kod).catch(() => null);
      const site = await siteListesi(env).catch(() => []);
      await stokIste(env, "/kuyruk-ekle", { ad: "bittiOneri", kayit: { id: `${rec.id}:${simdi}`, sip: rec.id, kod: rec.kod, magaza: rec.magaza || null, oneri: (rec.hemraOneri && rec.hemraOneri.oneri) || "sor", not: "Önceki karar geri alındı (kimin bastığı kayıtlı değildi) — lütfen yeniden karar verin", hemra: (rec.hemraOneri && rec.hemraOneri.kim) || "Hemra", tur: rec.hemraTur || "bitti",
        fabrika: rec.cevaplayan ? { kim: rec.cevaplayan, zaman: rec.cevapZaman || null, ne: "bitti" } : null, fuat: rec.fuatOnay ? { kim: rec.fuatOnay.kim, zaman: rec.fuatOnay.zaman } : null, stok: st && st.yazi ? st.yazi : "yok", deneme: false, foto: sitedenFoto(env, site || [], rec.kod) } });
      await siparisYaz(env, rec);
      sonuc.l.push({ id, kod: rec.kod, eski, ok: true });
    }
    const kodlar = sonuc.l.filter((x) => x.ok).map((x) => x.kod);
    if (kodlar.length) await tg(env, "sendMessage", { chat_id: sorumlu(env), text: `↩️ ${kodlar.join(", ")}: "Patron stok bitene kadar bekle dedi" mesajı GERİ ALINDI — Patron böyle bir karar vermedi. Karar Patron'a yeniden soruldu; sonucu size yazacağım.` });
  } else if (is.tur === "akisAyar") { // 11 Kasım: yeni akışı gerçek akışa bağla / geri al — {ac: true|false}; {ac yok} = sadece oku
    if (is.ac != null) await stokIste(env, "/ayar-yaz", { k: "akis:yeni", v: is.ac ? "1" : "0" });
    sonuc.acik = await yeniAkisAcik(env);
  } else if (is.tur === "akisDeneme") { // 11 Kasım (Patron): YENİ AKIŞ DENEMESİ — sahte model, herkese ön haber; gerçek kayda / fabrikaya (Fuat, Nuri) gitmez
    const g = gunAnahtari(simdi), k = `${g}-TD${simdi.toString(36).slice(-4)}`;
    const kod = String(is.kod || "TEST-002"), kod2 = String(is.kod2 || "TEST-003"), donSn = Number(is.donSn) || 180;
    const aziz = MAGAZALAR[0].kime(env), hemra = await koordinatorId(env, simdi), sinem = await sinemKimligi(env), fuat = await fuatKimligi(env);
    const haber = {
      Aziz: [aziz, `🧪 DENEME — gerçek liste değil, üretim yok.\nŞimdi 2 deneme kartı gelecek:\n• ${kod}: "✅ Aynısı"na basın.\n• ${kod2}: "📦 Depoda var"a basın.\nSonra "✅ Eminim, gönder"e basın.`],
      Hemra: [hemra, `🧪 DENEME — üretim yok.\n1) Birazdan ${kod} deneme listesi onayınıza gelecek: "✅ Onayla"ya basın.\n2) Sinem "Bitti" deyince yeni kart gelecek: "🔁 Repete", sonra "✅ Patron'a gönder"e basın.`],
      Sinem: [sinem, `🧪 DENEME — Bu bir deneme, üretim yapmayın.\nBirazdan ${kod} kodlu deneme kartı gelecek: "❌ Bitti, gelmeyecek"e basın.`],
      Fuat: [fuat, `🧪 DENEME — Bu bir deneme, üretim yapmayın.\nBugün ${kod} kodlu deneme repete kartı gelecek. Sırayla deneyin:\n1) "⏳ 2 gün sonra dön" (denemede ${Math.round(donSn / 60)} dakika sonra kart yeniden gelir)\n2) kart yeniden gelince "❌ Yapamam"\n3) kart üçüncü kez gelince "✅ 4-8 gün"`],
    };
    sonuc.haber = {};
    for (const [ad, [id, metin]] of Object.entries(haber)) { const r = id ? await tg(env, "sendMessage", { chat_id: id, text: metin }) : null; sonuc.haber[ad] = { ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result && r.result.text ? r.result.text : metin, hata: !id ? "kimlik kayıtlı değil" : r && !r.ok ? String(r.description || "").slice(0, 100) : null }; }
    const si = await ayarOku(env, "fabrika:sonIstek", {});
    for (const x of [kod, kod2]) si[x] = { beden: "b", gruplar: { b: [{ renk: "beyaz", adet: 16 }] } }; // "✅ Aynısı" için önceki istek (temizlikte silinir)
    await ayarYaz(env, "fabrika:sonIstek", si);
    const modeller = [{ kod, satilan: 3, kalan: 4, s7: 18, yil: 46, grup: "fabrika", dagilim: [{ renk: "beyaz", buyuk: 20, kucuk: 20 }], donSn }, { kod: kod2, satilan: 1, kalan: 0, s7: 2, yil: 9, grup: "fabrika", donSn }];
    await ayarYaz(env, `fabrika:${k}`, { asama: "soruldu", zaman: simdi, gun: g, magaza: "VOLONTE", sorumlu: aziz, deneme: true, zincir: true, yeni: true, test: true, modeller, secim: {}, mesajlar: {}, gonderilmedi: [kod, kod2] });
    await ayarYaz(env, "akis:deneme", { k, g, zaman: simdi, kodlar: [kod, kod2] });
    await tg(env, "sendMessage", { chat_id: aziz, text: `${DENEME}${listeBasi("VOLONTE", 2)}` });
    sonuc.anahtar = k;
    sonuc.kart = await modelParcasi(env, k, tg);
  } else if (is.tur === "akisSinem") { // deneme: TEST kartı doğrudan SADECE Sinem'e (Aziz / Hemra adımı atlanır) — zincir "Bitti"den devam eder
    const t = await ayarOku(env, "akis:deneme", null);
    const sinem = await sinemKimligi(env);
    const kod = String(is.kod || "TEST-002");
    const d = t ? await ayarOku(env, `fabrika:${t.k}`, null) : null;
    const model = (d && (d.modeller || []).find((m) => m.kod === kod)) || { kod, kalan: 4, s7: 18, yil: 46, dagilim: [{ renk: "beyaz", buyuk: 20, kucuk: 20 }], donSn: Number(is.donSn) || 180 };
    if (!sinem) sonuc.hata = "Sinem kayıtlı değil";
    else {
      const rec = await siparisAc(env, { kod, beden: "b", renkler: [{ renk: "beyaz", adet: 16 }], liste: t ? t.k : `${gunAnahtari(simdi)}-TD`, deneme: true, fotoKod: kod, grup: "fabrika", magaza: "VOLONTE", sadece: [sinem] }, simdi);
      Object.assign(rec, { zincir: true, yeni: true, test: true, testVeri: model });
      const r = await fabrikayaGonder(env, rec, tg);
      Object.assign(sonuc, { rec: rec.id, giden: r.giden });
      await ayarYaz(env, "akis:deneme", { ...(t || { g: gunAnahtari(simdi), zaman: simdi }), ekRecler: [...((t && t.ekRecler) || []), rec.id] });
    }
  } else if (is.tur === "akisDurum") { // okuma: deneme listesinin ve zincirin durumu
    const t = await ayarOku(env, "akis:deneme", null);
    sonuc.t = t; sonuc.acik = await yeniAkisAcik(env);
    if (t) {
      const d = await ayarOku(env, `fabrika:${t.k}`, null);
      sonuc.liste = d ? { asama: d.asama, secim: d.secim, birlesik: d.birlesik || null } : null;
      const b = d && d.birlesik ? await ayarOku(env, `fabrika:${d.birlesik}`, null) : null;
      sonuc.hemraListe = b ? { asama: b.asama, onaylayan: b.onaylayan || null, kart: b.kartMetin || null, depoda: b.depoda || [], recler: b.recler || null } : null;
      sonuc.siparisler = [];
      for (const id of [...(b ? Object.values(b.recler || {}).flat() : []), ...(t.ekRecler || [])]) { const r = await siparisOku(env, id); if (r) sonuc.siparisler.push({ id: r.id, kod: r.kod, durum: r.durum, cevaplayan: r.cevaplayan || null, hemraOneri: r.hemraOneri || null, hemraKart: r.hemraMesaj ? r.hemraMesaj[3] || null : null, rkVeri: r.rkVeri || null }); }
    }
  } else if (is.tur === "akisTemizle") { // deneme kayıtları: repete kayıtları silinir, açık kartlar kapanır, sahte "son istek" silinir
    const t = await ayarOku(env, "akis:deneme", null);
    sonuc.rk = await denemeTemizle(env, tg, simdi, (r) => r.test || TEST_KOD.test(String(r.kod)));
    if (t) {
      const d = await ayarOku(env, `fabrika:${t.k}`, null);
      if (d) {
        for (const [kod, m] of Object.entries(d.mesajlar || {})) if (!secimTamam(secimNorm(d.secim && d.secim[kod]))) await tg(env, m[1] === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: kimeOf(env, d), message_id: m[0], [m[1] === "foto" ? "caption" : "text"]: `🧪 DENEME bitti — ${kod} kartı kapandı.`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
        d.asama = "iptal"; d.temizlendi = simdi;
        await ayarYaz(env, `fabrika:${t.k}`, d);
      }
      const bl = (await ayarOku(env, `fabrika:birlesik:${t.g}`, [])) || [], kalan = [];
      sonuc.siparis = [];
      for (const id of t.ekRecler || []) { // doğrudan Sinem'e gönderilen deneme kartları
        const r = await siparisOku(env, id);
        if (!r || r.durum === "kapandi") continue;
        if (r.durum === "bekliyor") await mesajlariGuncelle(env, r, "🧪 DENEME bitti — kart kapandı.", tg).catch(() => null);
        Object.assign(r, { durum: "kapandi", iptal: { neden: "deneme bitti", zaman: simdi } });
        await siparisYaz(env, r);
        sonuc.siparis.push(id);
      }
      for (const bk of bl) {
        const b = await ayarOku(env, `fabrika:${bk}`, null);
        if (!b || !b.test) { kalan.push(bk); continue; }
        for (const id of Object.values(b.recler || {}).flat()) {
          const r = await siparisOku(env, id);
          if (!r || r.durum === "kapandi") continue;
          if (r.durum === "bekliyor") await mesajlariGuncelle(env, r, "🧪 DENEME bitti — kart kapandı.", tg).catch(() => null);
          Object.assign(r, { durum: "kapandi", iptal: { neden: "deneme bitti", zaman: simdi } });
          await siparisYaz(env, r);
          sonuc.siparis.push(id);
        }
        if (b.asama === "onayda" && b.hemraMesaj) await tg(env, "editMessageText", { chat_id: b.hemraMesaj[0], message_id: b.hemraMesaj[1], text: "🧪 DENEME bitti — bu liste kapandı.", reply_markup: { inline_keyboard: [] } }).catch(() => null);
        Object.assign(b, { asama: "iptal", temizlendi: simdi });
        await ayarYaz(env, `fabrika:${bk}`, b);
      }
      await ayarYaz(env, `fabrika:birlesik:${t.g}`, kalan);
    }
    const si = await ayarOku(env, "fabrika:sonIstek", {});
    const sahte = Object.keys(si).filter((x) => TEST_KOD.test(x));
    if (sahte.length) { for (const x of sahte) delete si[x]; await ayarYaz(env, "fabrika:sonIstek", si); }
    await stokIste(env, "/ayar-yaz", { k: "akis:deneme", v: "null" });
    sonuc.sonIstekSilinen = sahte;
  } else if (is.tur === "kisiDeneme") { // her kişiye TEK 🧪 DENEME kartı (fabrikaya / gerçek akışa gitmez); kanıt "sami:kanit"
    const g = gunAnahtari(simdi);
    const kart = async (cfg, kod) => {
      const k = `${g}${cfg.ek}-DK`;
      const st = await magazaStoklari(env, kod).catch(() => null); // 10 Kasım: deneme de olsa GERÇEK mağaza stoğu
      const kalan = st && st.magazalar && st.magazalar[cfg.magaza] != null ? st.magazalar[cfg.magaza] : st && st.magazalar ? 0 : null;
      await ayarYaz(env, `fabrika:${k}`, { asama: "soruldu", zaman: simdi, gun: g, magaza: cfg.magaza, sorumlu: cfg.kime(env), modeller: [{ kod, satilan: 1, kalan, grup: "fabrika" }], secim: {}, mesajlar: {}, gonderilmedi: [kod], deneme: true, fabrikayaGitmez: !is.zincir, zincir: Boolean(is.zincir), tekKart: true });
      return modelParcasi(env, k, tg);
    };
    const k = (ad) => !is.sadece || is.sadece.includes(ad); // 10 Kasım: istenirse sadece belirli kişilere
    if (k("aziz")) sonuc.aziz = await kart(MAGAZALAR[0], is.v || "3394");
    if (k("merdan")) sonuc.merdan = await kart(MAGAZALAR[1], is.b || "3459");
    const sinem = k("sinem") ? await sinemKimligi(env) : null;
    if (sinem) { const rec = await siparisAc(env, { kod: is.v || "3394", renkler: [{ renk: "siyah", adet: 1 }], liste: `DK${g}`, deneme: true, fotoKod: is.v || "3394", grup: "fabrika", magaza: "VOLONTE", sadece: [sinem] }, simdi); sonuc.sinem = (await fabrikayaGonder(env, rec, tg)).giden; }
    if (k("hemra")) {
      const hrec = await siparisAc(env, { kod: is.b || "3459", renkler: [{ renk: "siyah", adet: 1 }], liste: `DK${g}`, deneme: true, fotoKod: is.b || "3459", grup: "fabrika", magaza: "BLACKROSE" }, simdi);
      Object.assign(hrec, { durum: "bitti", cevaplayan: "Sinem (deneme)", cevapZaman: simdi });
      await hemraKarti(env, tg, hrec, "bitti", "Sinem (deneme)", simdi);
      await siparisYaz(env, hrec);
      sonuc.hemra = Boolean(hrec.hemraMesaj);
    }
  }
  if (bitti) l.shift();
  await env.KAYIT.put("sami:islemler", JSON.stringify(l), { expirationTtl: 3 * 86400 });
  const ss = (await env.KAYIT.get("sami:islemSonuc", "json").catch(() => null)) || [];
  await env.KAYIT.put("sami:islemSonuc", JSON.stringify([...ss, sonuc].slice(-20)), { expirationTtl: 3 * 86400 });
  return ["kartYenile", "kisiDeneme", "listeYenile"].includes(is.tur) ? "agir" : true;
}

// 10 Kasım (Sinem): teslim günü geçti → fabrikaya "bugün gelecekti, ne durumda?" [Bugün geliyor] [X gün daha] [İptal]
async function teslimSor(env, tg, rec, bas) {
  const ekip = bildirilecekler(env, rec);
  const kime = rec.cevaplayanId && !ekip.includes(String(rec.cevaplayanId)) ? [String(rec.cevaplayanId)] : [...new Set((rec.mesajlar || []).map((m) => String(m[0])).filter((c) => !ekip.includes(c)))];
  const metin = `${dn(rec)}${bas}⏰ ${magazaAdi(rec.magaza)} · ${rec.kod} bugün gelecekti (${rec.teslimSure || gunGoster(rec.hazirGun)}), ne durumda?`;
  const kl = { inline_keyboard: [[{ text: "✅ Bugün geliyor", callback_data: `fc:B:${rec.id}` }], ...sureSatirlari(`fc:t:${rec.id}`), [{ text: "❌ İptal", callback_data: `fc:I:${rec.id}` }]] };
  for (const c of kime) { const m = await kartGonderKopya(env, tg, rec, c, metin, kl); if (m) rec.teslimMesajlar = [...(rec.teslimMesajlar || []), m]; }
  rec.log.push(`⏰ Teslim soruldu${bas ? " (hatırlatma)" : ""}`);
}

// 5 dakikalık görev: sadece zamanı gelen kayıtlar okunur ("fs:takip"). 24 saat cevapsız → fabrikaya bir hatırlatma;
// teslim günü gelince (10:00'dan sonra) Murat'a ve Hemra'ya "bugün hazır olmalıydı, geldi mi?"; repete süresi dolunca
// fabrikaya "hazır mı?"; "Beklesin" 7 gün dolunca karar yeniden sorulur; deneme 48 saatte bitmezse özet. Pazartesi 09:30 haftalık özet.
export async function siparisTakip(env, simdi, tg) {
  if (!(await ayarOku(env, "fs:takipGoc", null))) { // bir kez: eski kayıtlar dizine
    for (const id of (await ayarOku(env, "fs:acik", [])).slice(0, 30)) { const r = await siparisOku(env, id); if (r) await siparisYaz(env, r); }
    await ayarYaz(env, "fs:takipGoc", 1);
  }
  const takip = await ayarOku(env, "fs:takip", {});
  if (!(await ayarOku(env, "fs:defterDoldur", null))) { await ayarYaz(env, "fs:defterDoldur", 1); await fabrikaDefterDoldur(env, simdi).catch(() => null); }
  if (!(await ayarOku(env, "fs:merdivenGoc", null))) { // 9 Kasım: bir kez — açık siparişler yeni merdivene (takip zamanları yeniden)
    for (const id of (await ayarOku(env, "fs:acik", [])).slice(0, 120)) { const r = await siparisOku(env, id); if (r) await siparisYaz(env, r); }
    await ayarYaz(env, "fs:merdivenGoc", 1);
  }
  // 12 Kasım (C10): Patron bir modeli sildi / silinmesini onayladı (Venom → "fsSilindi") → o modelin fabrika "bitti" kayıtları kapanır, yeniden sorulmaz
  for (const k of (await stokIste(env, "/kuyruk-al", { ad: "fsSilindi" }).catch(() => [])) || []) {
    for (const id of (await ayarOku(env, "fs:acik", [])).filter((x) => String(x).startsWith(`${k.kod}-`)).slice(0, 10)) {
      const r = await siparisOku(env, id);
      if (!r || r.deneme || String(r.kod) !== String(k.kod) || r.durum !== "bitti") continue;
      Object.assign(r, { karar: "sil", durum: "kapandi", stokKontrol: null }); r.log.push("model silindi (Patron) → kayıt kapandı");
      await siparisYaz(env, r);
    }
  }
  const zamani = Object.entries(takip).filter(([, t]) => t <= simdi).sort((a, b) => a[1] - b[1]).slice(0, 12).map(([id]) => id);
  const fuataTekrar = [], ekibe = [];
  const hat = await kagitAcik(env, "sami", "fabrikaHatirlatma"); // 10 Kasım görev kâğıdı: hatırlatmalar kapalı (karar zinciri açık)
  for (const id of zamani) {
    const rec = await siparisOku(env, id);
    if (!rec) continue;
    const kisiler = rec.mesajlar.map(([chat, mesaj]) => [chat, mesaj]);
    if (hat && rec.durum === "bekliyor" && !rec.hatirlatildi) {
      // ONAY MERDİVENİ 2: iş günü 24 saat cevap yok → AYNI KART "Hatırlatma: lütfen onay verin" başlığıyla BİR KEZ (Patron'a yeniden sorulmaz)
      if (mesaiMi(simdi) && isGunuSuresi(rec.gonderim, simdi) >= 86400) { rec.hatirlatildi = true; rec.hatirlatmaZaman = simdi; fuataTekrar.push(rec); }
    } else if (hat && rec.durum === "bekliyor" && rec.hatirlatildi && !rec.ekibe && !denemeKaydiMi(rec)) {
      // ONAY MERDİVENİ 3: 24 saat daha yok → Merdan ve Hemra'ya bildirim + kartın kopyası + [📞 Aradım, şu cevap geldi]
      if (mesaiMi(simdi) && isGunuSuresi(rec.hatirlatmaZaman || rec.gonderim + 86400, simdi) >= 86400) { rec.ekibe = simdi; ekibe.push(rec); }
    } else if (hat && ["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && !rec.teslimHatirlatildi && simdi >= gunBasi(rec.hazirGun) + 10 * 3600) {
      // 10 Kasım: mal bugün gelecek → Aziz (VOLONTE) / Merdan (Black Rose) [📦 Geldi] + adet
      rec.teslimHatirlatildi = true;
      rec.hazirSoruldu = true;
      rec.geldiMesaj = await kartGonderKopya(env, tg, rec, geldiSorumlusu(env, rec), `${siparisMetni(rec)}\n\n📦 Bugün gelecek (${rec.cevaplayan || "fabrika"}: ${rec.teslimSure || gunGoster(rec.hazirGun)}). Mal gelince basın ve gelen adedi yazın.`, { inline_keyboard: [[{ text: "📦 Geldi", callback_data: `fc:G:${rec.id}` }]] });
    } else if (hat && ["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && rec.teslimHatirlatildi && !rec.teslimSoru && rec.gelenAdet == null && simdi >= gunBasi(rec.hazirGun) + 17 * 3600) {
      rec.teslimSoru = simdi; // 10 Kasım (Sinem): "3628 bugün gelecekti, ne durumda?"
      await teslimSor(env, tg, rec, "");
    } else if (hat && ["gelecek", "repete"].includes(rec.durum) && rec.teslimSoru && !rec.teslimCevap && !rec.teslimSoruTekrar && mesaiMi(simdi) && isGunuSuresi(rec.teslimSoru, simdi) >= 86400) {
      rec.teslimSoruTekrar = simdi; // onay merdiveni: aynı soru bir kez daha
      await teslimSor(env, tg, rec, "⏰ Hatırlatma: lütfen cevap verin\n");
    } else if (hat && ["gelecek", "repete"].includes(rec.durum) && rec.teslimSoruTekrar && !rec.teslimCevap && !rec.teslimEkibe && !denemeKaydiMi(rec) && mesaiMi(simdi) && isGunuSuresi(rec.teslimSoruTekrar, simdi) >= 86400) {
      rec.teslimEkibe = simdi; // sonra Merdan ve Hemra'ya: lütfen arayın
      await bildir(env, rec, `🏭 Fabrika teslim sorusuna cevap vermedi: ${magazaAdi(rec.magaza)} · ${rec.kod} (${rec.cevaplayan || "fabrika"} "${rec.teslimSure || ""}" demişti, ${gunGoster(rec.hazirGun)}). Lütfen arayın.`, tg, { reply_markup: { inline_keyboard: [[{ text: "📞 Aradım, şu cevap geldi", callback_data: `fc:a:${rec.id}` }]] } });
    } else if (rec.durum === "bitti" && rec.karar === "stokBitene" && rec.stokKontrol && simdi >= rec.stokKontrol) {
      // 10 Kasım KESİN KURAL: mağaza stoğu bitince yeniden sorulur (Patron "sil" dediyse o zaman kaldırılır)
      const st = rec.deneme ? { var: false } : await magazaStoklari(env, rec.kod);
      // 12 Kasım (C10/C12): model Patron kararıyla SİLİNDİYSE (ya da silinmesi onaylandıysa) kayıt kapanır; "ne yapalım?" bir daha sorulmaz
      if (!rec.deneme && (await modelSilindi(env, rec.kod))) { Object.assign(rec, { karar: "sil", durum: "kapandi", stokKontrol: null }); rec.log.push("model silindi (Patron) → kayıt kapandı, yeniden sorulmaz"); }
      else if (st.var) rec.stokKontrol = simdi + 86400;
      else if (rec.deneme) rec.stokKontrol = null;
      else if (rec.silOnayli) {
        Object.assign(rec, { karar: "sil", durum: "kapandi", stokKontrol: null });
        await stokIste(env, "/gizle", { kod: rec.kod, kim: "Patron", simdi });
        await silKuyrugu(env, rec.kod, "Patron", simdi);
        await kanitYaz(env, rec, "Sami", "Mağaza stoğu bitti → Patron'un 'sil' kararı uygulandı", simdi);
        await tg(env, "sendMessage", { chat_id: await koordinatorId(env, simdi), text: `🗑 ${magazaAdi(rec.magaza)} · ${rec.kod}: mağaza stoğu bitti; Patron'un "sil" kararı uygulanıyor (site + kanal).` });
      } else { Object.assign(rec, { karar: null, stokKontrol: null }); await hemraKarti(env, tg, rec, "stokBitti", rec.cevaplayan || "fabrika", simdi); }
    } else if (hat && rec.durum === "repete" && rec.hazirZaman && simdi >= rec.hazirZaman && !rec.hazirSoruldu) {
      rec.hazirSoruldu = true;
      for (const [chat] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${dn(rec)}${rec.kod} repetesi hazır mı?`, reply_markup: { inline_keyboard: [[{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]] } });
    } else if (hat && rec.durum === "geldi" && !rec.deneme && rec.geldiZaman && !rec.girisKontrol && simdi >= rec.geldiZaman + GIRIS_SN) {
      rec.girisKontrol = true;
      const st = (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod];
      const simdiki = st ? Number(st.toplam) || 0 : 0;
      if (simdiki <= (rec.geldiStok || 0)) {
        const kime = await girisSorumlusu(env, rec);
        const saatYaz = new Date((rec.geldiZaman + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
        await tg(env, "sendMessage", { chat_id: kime, text: `📦 ${rec.kod} fabrikadan geldi (${rec.bildiren || "fabrika"}, ${saatYaz}) ama Vegawin'de 2 saattir stoğu görünmüyor. Vegawin'e giriş yapıldı mı?` });
        rec.log.push("Vegawin girişi soruldu");
      }
    } else if (rec.durum === "bitti" && rec.karar === "beklesin" && simdi >= rec.beklesinZaman && !rec.tekrarSoruldu) {
      rec.tekrarSoruldu = true;
      if (!rec.deneme && (await modelSilindi(env, rec.kod))) { Object.assign(rec, { karar: "sil", durum: "kapandi" }); rec.log.push("model silindi (Patron) → kayıt kapandı, yeniden sorulmaz"); await siparisYaz(env, rec); continue; }
      rec.karar = null;
      await hemraKarti(env, tg, rec, "bitti", rec.cevaplayan || "fabrika", simdi); // 10 Kasım: yeni zincir (Hemra önerir, Patron onaylar)
    }
    if (fuataTekrar.includes(rec) || ekibe.includes(rec)) continue; // gönderimden sonra yazılır
    await siparisYaz(env, rec); // takip dizini güncellenir (iş bittiyse çıkar)
  }
  if (fuataTekrar.length) await fabrikayaTekrar(env, fuataTekrar, tg);
  if (ekibe.length) await ekibeFabrikaBildir(env, ekibe, tg, simdi);
  for (const did of await ayarOku(env, "fabrika:denemeler", [])) {
    const k = await env.KAYIT.get(`venom:deneme:${did}`, "json");
    if (k && !k.ozet && simdi - k.basla > 48 * 3600) await denemeOzeti(env, did, tg, "sure");
  }
  if (hat) await haftalikOzet(env, simdi, tg);
}

// Her pazartesi 09:30 Murat'a: geçen hafta fabrikadan ne istendi, ne geldi, ne bekleniyor, geciken var mı.
export async function haftalikOzet(env, simdi, tg) {
  const g = gunAnahtari(simdi);
  if (new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() !== 1 || saat(simdi) < 9.5) return;
  if (await ayarOku(env, `fabrika:haftalik:${g}`, null)) return;
  await ayarYaz(env, `fabrika:haftalik:${g}`, 1);
  // İndirimli mal (2000): geçen haftanın satışı ayrı tek satır (rapor sadece Murat'a gider)
  const donem = await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - 7 * 86400), bitis: gunAnahtari(simdi - 86400) }).catch(() => ({}));
  const kalan = INDIRIMLI.some((k) => donem[k] > 0) ? await stokIste(env, "/toplu", { kodlar: INDIRIMLI }).catch(() => ({})) : {};
  const ind = INDIRIMLI.filter((k) => donem[k] > 0).map((k) => indirimliSatiri(k, donem[k], kalan[k] ? kalan[k].toplam : null));
  return tg(env, "sendMessage", { chat_id: murat(env), text: [haftalikMetin(simdi, await ayarOku(env, `fs:hafta:${gunAnahtari(simdi - 7 * 86400)}`, {}), await ayarOku(env, `fs:hafta:${gunAnahtari(simdi - 14 * 86400)}`, {})), ...(ind.length ? ["", ...ind] : [])].join("\n") });
}
export function haftalikMetin(simdi, gecen, onceki = {}) {
  const bugun = gunAnahtari(simdi);
  const l = Object.values(gecen);
  const kisa = (x) => `${x.kod}${x.grup === "celal" ? " (Celal)" : ""}`;
  const geldi = l.filter((x) => x.durum === "geldi");
  const bekleyen = l.filter((x) => !["geldi", "kapandi", "bitti"].includes(x.durum));
  const bitti = l.filter((x) => x.durum === "bitti");
  const geciken = [...l, ...Object.values(onceki)].filter((x) => !["geldi", "kapandi", "bitti"].includes(x.durum) && x.hazirGun && x.hazirGun < bugun);
  const cevapsiz = bekleyen.filter((x) => x.durum === "bekliyor");
  const madde = (b, liste, f = kisa) => `${b} (${liste.length}): ${liste.length ? liste.map(f).join(", ") : "yok"}`;
  return [
    `📊 Fabrika haftalık özet — ${gunGoster(gunAnahtari(simdi - 7 * 86400))} haftası`,
    madde("• İstenen", l, (x) => `${kisa(x)} ${(x.renkler || []).map((r) => `${r.renk} ${r.adet}`).join("/")}`),
    madde("• Geldi", geldi),
    madde("• Hâlâ bekleniyor", bekleyen, (x) => `${kisa(x)}${x.hazirGun ? ` (${gunGoster(x.hazirGun)})` : ""}`),
    madde("• Gecikiyor", geciken, (x) => `${kisa(x)} (${gunGoster(x.hazirGun)} demişti)`),
    ...(cevapsiz.length ? [madde("• Fabrika cevap vermedi", cevapsiz)] : []),
    ...(bitti.length ? [madde("• Bitti dendi", bitti)] : []),
  ].join("\n");
}

// /fabrikadeneme (sadece Murat): uydurma modelle bütün akış
export async function fabrikaDenemesi(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Murat'ta." });
  const did = `D${simdi.toString(36)}`;
  const liste = [{ kod: "9999", renkler: [{ renk: "siyah", adet: 2 }, { renk: "bej", adet: 1 }] }, { kod: "9998", renkler: [{ renk: "siyah", adet: 1 }] }];
  const gruplar = { 9999: "fabrika", 9998: "celal" };
  await ayarYaz(env, `fabrika:${did}`, { asama: "onayda", liste, gruplar, deneme: true, yazan: "deneme" });
  await ayarYaz(env, "fabrika:denemeler", [...(await ayarOku(env, "fabrika:denemeler", [])).slice(-10), did]);
  await denemeKaydi(env, did, `Deneme başladı (${kisiAd(m.from)})`);
  await tg(env, "sendMessage", {
    chat_id: sorumlu(env),
    text: `${DENEME}📋 Gidecek liste (deneme):\n${GRUP_AD.fabrika}:\n9999 DENEME — siyah 2, bej 1\n\n${GRUP_AD.celal}:\n9998 CELAL DENEME — siyah 1\n\nGönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `fb:o:${did}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${did}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: `🧪 Deneme başladı: Hemra'ya onay kartı gitti. Bütün adımlar "🧪 DENEME" ile işaretli; kanalda paylaşım ve silme yapılmaz. Bitince size özet gelecek.` });
}
export const _test = { siparisAc, hemraKarti, siparisYaz, fabrikayaGonder, gonderimParcasi }; // testler için
export const _rk = { sitedenFoto, siteListesi, magazaAdi, koordinatorId, kisiAd, dagilimOner }; // repete-kart.js için

// ---------- 10 Kasım (Patron): SERBEST YAZIM ÇÖZÜCÜ (yapay zekâ yok) ----------
// Kelime sırası serbest (pudra büyük / büyük pudra), Türkçe harfsiz (buyuk, kucuk), "adet" yazılsın/yazılmasın, bitişik (4adet, 12ad),
// iki beden tek mesajda, birden fazla renk (siyah 10 bej 6). Anlaşılmazsa null (eksik/fazla parça varsa tahmin edilmez).
const katla = (w) => w.replace(/ü/g, "u").replace(/ç/g, "c").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ý/g, "y").replace(/ä/g, "a").replace(/ž/g, "z").replace(/ň/g, "n");
// beden (Türkçe harfsiz/kısaltma/yazım hatası/Türkmence) — karşılaştırma harfsiz (katla) yapılır
const BEDEN_K = new Set(["kucuk", "kuck", "kcuk", "kck", "kuc", "kucu", "kiçi", "kici", "kiciler", "k", "s"].map(katla));
const BEDEN_B = new Set(["buyuk", "buyk", "byuk", "byk", "buyu", "buuk", "uly", "b", "l"].map(katla));
const BEDEN_EK = /^(kucu[kg]|buyu[kg])(ten|tan|den|dan|te|ta|de|da|e|a|ler|lar|leri|lari|u|unden|lerden|lardan)?$/;
const KOD_EKI = /^(ten|tan|den|dan|te|ta|de|da|e|a|in|un|nin|nun|i|u|yi|yu|ye|ya|ndan|nden|lik|luk)$/;
// boş sözler (anlamı yok): adet, dolgu, selam, fiil, Türkmence "sany/bolsun/razmer"
const BOS_SOZ = new Set(["adet", "aded", "ad", "adt", "tane", "tn", "pcs", "pc", "ve", "we", "de", "da", "ile", "icin", "lazim", "gerek", "gerekli", "iste", "istiyorum", "isteyelim", "istiyoruz", "olsun", "bolsun", "x", "abi", "abla", "renk", "renkten", "renginden", "beden", "bedenden", "bedeni", "model", "modelden", "kod", "kodu", "sany", "sani", "razmer", "slm", "selam", "merhaba", "mrb", "tesekkurler", "tesekkur", "tsk", "sagol", "kolay", "gelsin", "lutfen", "yaz", "yazin", "yazalim", "gonder", "ekle", "koy", "al", "alalim"].map(katla));
// belirsiz: tahmin YOK → Opus / yeniden sor
const BELIRSIZ = new Set(["ikisi", "ikiside", "ikisinden", "ikisine", "her", "herikisi", "hepsi", "hepsini", "birinden", "seri", "seriden", "ayni", "aynisi", "onceki", "gibi", "gecen", "yarim", "yarisi", "isteme", "istemeyelim", "yok", "iptal", "degil", "yerine", "kadar", "fazla", "eksik", "az", "cok", "mi", "mu", "kac", "ne", "nedir", "yada", "ya", "veya", "yahut", "toplam", "pardon", "sar", "ser", "er", "ar", "bir", "bi", "iki", "uc", "dort", "bes", "alti", "yedi", "sekiz", "dokuz", "on", "yirmi", "otuz", "kirk", "elli", "numara", "no"].map(katla));
// renkler: harfsiz → Türkçe yazım; Türkmence → Türkçe; sık yazım hataları (bir harf / yer değişimi) → doğru renk
const RENK_DUZ = { kirmizi: "kırmızı", yesil: "yeşil", acik: "açık", sari: "sarı", gul: "gül", kurusu: "kurusu", fume: "füme", tas: "taş", murdum: "mürdüm", cagla: "çağla", gumus: "gümüş", altin: "altın", sampanya: "şampanya", fusya: "fuşya", tarcin: "tarçın", yag: "yağ", yesili: "yeşili", menekse: "menekşe", fistik: "fıstık", sutlu: "sütlü", kahverengi: "kahverengi", gok: "gök", turkuaz: "turkuaz", gara: "siyah", ak: "beyaz", gyzyl: "kırmızı", sary: "sarı", yasyl: "yeşil", gok_tm: "mavi" };
const TEMEL_RENK = ["siyah", "beyaz", "bej", "pudra", "ekru", "vizon", "haki", "lacivert", "bordo", "gri", "mavi", "kırmızı", "yeşil", "sarı", "pembe", "mor", "lila", "turuncu", "kahve", "kahverengi", "krem", "somon", "mint", "taba", "camel", "kamel", "füme", "taş", "mürdüm", "petrol", "indigo", "antrasit", "hardal", "fuşya", "şampanya", "gümüş", "altın", "nude", "mercan", "zeytin", "kiremit", "leylak", "turkuaz", "fıstık", "tarçın", "menekşe", "çağla"];
const TEMEL_KATLI = new Map(TEMEL_RENK.map((r) => [katla(r), r]));
const yakin1 = (a, b) => { // Damerau mesafesi ≤ 1
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
};
function renkDuzelt(w) {
  const k = katla(w);
  if (TEMEL_KATLI.has(k)) return TEMEL_KATLI.get(k);
  if (RENK_DUZ[k]) return RENK_DUZ[k];
  if (k.length >= 5) { const y = [...TEMEL_KATLI.keys()].filter((t) => t.length >= 4 && yakin1(k, t)); if (y.length === 1) return TEMEL_KATLI.get(y[0]); }
  return w;
}
export function serbestCoz(metin) {
  const kucult = (w) => (/^[A-Z]+$/.test(w) ? w.toLowerCase() : w.toLocaleLowerCase("tr")); // "SIYAH" → siyah (sıyah değil)
  let t = String(metin || "").replace(/[’'`´]/g, "").replace(/\b(bir|bi)\s+(de|da)\b/gi, " ").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/[.,;\n]+/g, " | ").replace(/[:/\\+\-–—()!=*&]+/g, " ")
    .replace(/(\d)([A-Za-zÇĞİÖŞÜçğıöşüýäžňÝÄŽŇ])/g, "$1 $2").replace(/([A-Za-zÇĞİÖŞÜçğıöşüýäžňÝÄŽŇ])(\d)/g, "$1 $2");
  let kel = t.split(/\s+/).filter(Boolean).map(kucult);
  // kod başta değilse ve mesajda TEK kod varsa ("Slm 3412 byk ekru 5", "Büyük vizon 8 küçük vizon 4, 3388 için") → başa al
  while (kel[0] === "|") kel.shift();
  const kodlar = kel.filter((w) => /^\d{4,6}$/.test(w));
  if (kel.length && !/^\d{4,6}$/.test(kel[0])) { if (new Set(kodlar).size !== 1) return null; kel = [kodlar[0], ...kel.filter((w) => w !== kodlar[0])]; }
  const bedenOf = (w) => { const k = katla(w); if (BEDEN_K.has(k)) return "k"; if (BEDEN_B.has(k)) return "b"; const m = k.match(BEDEN_EK); return m ? (m[1][0] === "k" ? "k" : "b") : null; };
  const sonuc = [];
  let kod = null, beden = null, renk = [], adet = null, bedensiz = [], bedenBos = false, kodEki = false, sonaEk = false, kodCift = 0, parcaBeden = null, sonSep = false;
  const cift = () => {
    if (!(renk.length && adet != null)) return true;
    if (renk.length >= 2 && renk.every((r) => TEMEL_RENK.includes(r))) return false; // "siyah bej 10" → hangisi kaç? belirsiz
    const p = { kod, beden, renk: renk.join(" "), adet }; sonuc.push(p); kodCift++; if (!beden) bedensiz.push(p); renk = []; adet = null; bedenBos = false; parcaBeden = null; return true;
  };
  for (let i = 0; i < kel.length; i++) {
    const w0 = kel[i];
    if (w0 === "|") { if (renk.length || adet != null) return null; sonaEk = false; sonSep = true; kodEki = false; continue; } // virgül / nokta / satır: parça biter
    const sepOnce = sonSep; sonSep = false;
    if (/^\d{4,6}$/.test(w0)) { if (renk.length || adet != null || bedenBos || (kod && !kodCift)) return null; kod = w0; beden = null; bedensiz = []; kodEki = true; sonaEk = false; kodCift = 0; continue; } // iki kod tek adet → belirsiz
    if (!kod) return null;
    const kw = katla(w0);
    if (kodEki) { kodEki = false; if (KOD_EKI.test(kw)) continue; } // "3297den", "3215'ten"
    if (BELIRSIZ.has(kw)) return null;
    const bd = bedenOf(w0);
    if (bd) {
      if (sonaEk) return null;
      if (renk.length || adet != null) { if ((parcaBeden && parcaBeden !== bd) || (beden && beden !== bd && bedenBos)) return null; beden = bd; parcaBeden = bd; continue; } // "pudra büyük 12"; "pudra büyük küçük 12" → belirsiz
      if (bedensiz.length && !bedenBos && !sepOnce) { // "pudra 12 büyük" — sadece TEK bekleyen çift (virgülden sonra gelen beden sonrakine ait)
        if (bedensiz.length !== 1) return null;
        for (const p of bedensiz) p.beden = bd; bedensiz = []; sonaEk = true; continue;
      }
      if (bedenBos) return null; // "büyük küçük pudra 12"
      beden = bd; bedenBos = true; parcaBeden = bd; continue;
    }
    if (/^\d{1,3}$/.test(w0)) {
      if (sonaEk) return null;
      const sonraki = katla(kel[i + 1] || "");
      if (["beden", "numara", "no", "beden:"].includes(sonraki)) return null; // "44 beden" → beden numarası, adet değil
      if (adet != null) return null; adet = Number(w0); if (adet <= 0) return null; if (!cift()) return null; continue;
    }
    if (BOS_SOZ.has(kw)) continue;
    const w1 = w0.length > 5 ? w0.replace(/(ndan|nden|dan|den|tan|ten)$/, "") : w0; // siyahtan → siyah, pudradan → pudra
    if (BOS_SOZ.has(katla(w1))) continue;
    if (!/^[a-zçğıöşüýäžň]+$/.test(w1)) return null; // Kiril / garip karakter → Opus
    if (sonaEk) return null;
    if (renk.length >= 3) return null;
    renk.push(renkDuzelt(w1));
    if (adet != null && !cift()) return null; // "10 siyah"
  }
  if (renk.length || adet != null || bedenBos || !sonuc.length || (kod && !kodCift)) return null; // yarım kalan parça → tahmin yok
  const gr = [];
  for (const p of sonuc) {
    let g = gr.find((x) => x.kod === p.kod && x.beden === p.beden);
    if (!g) gr.push((g = { kod: p.kod, beden: p.beden, renkler: [] }));
    const r = g.renkler.find((x) => x.renk === p.renk);
    if (r) r.adet += p.adet; else g.renkler.push({ renk: p.renk, adet: p.adet });
  }
  return gr;
}
export const anladimYazisi = (gr) => [...new Set(gr.map((g) => g.kod))].map((kod) => `${kod} ${gr.filter((g) => g.kod === kod).map((g) => `${g.beden === "k" ? "Küçük " : g.beden === "b" ? "Büyük " : ""}${g.renkler.map((r) => `${r.renk} ${r.adet}`).join(", ")}`).join(", ")}`).join("; ");

// ft:e:<id> (✅ Evet) · ft:d:<id> (✏️ Düzelt) — "Şunu anladım … Doğru mu?" teyidi (sadece yazan kişi basar; 2 saat geçerli; kart değiştiyse eskir)
export async function teyitDugmesi(env, cq, tg) {
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [, islem, id] = String(cq.data || "").split(":");
  const t = await ayarOku(env, `fabrika:teyit:${id}`, null);
  const benim = cq.message ? { chat_id: cq.message.chat.id, message_id: cq.message.message_id } : null;
  if (!t || t.bitti) return cevapla("Bu teyit artık geçerli değil.");
  if (String(cq.from.id) !== String(t.kisi)) return cevapla("Bu teyit size ait değil.");
  const D = t.deneme ? DENEME : "";
  const simdi = Math.floor(Date.now() / 1000);
  const ORNEK = `Örnek: ${t.gr[0] ? t.gr[0].kod : "3394"} büyük pudra 12, küçük pudra 4`;
  t.bitti = islem === "e" ? "evet" : "duzelt";
  await ayarYaz(env, `fabrika:teyit:${id}`, t);
  if (islem !== "e") { await cevapla("Yeniden yazın"); return benim && tg(env, "editMessageText", { ...benim, text: `${D}✏️ Kaydedilmedi. Yeniden yazın.\n${ORNEK}` }); }
  if (simdi - t.zaman > 2 * 3600) { await cevapla("Teyit eskidi"); return benim && tg(env, "editMessageText", { ...benim, text: `${D}⌛ Bu teyit eskidi (2 saat); kaydedilmedi. Yeniden yazın.\n${ORNEK}` }); }
  const kayit = [], olmadi = [], eskidi = [];
  for (const anahtar of [...new Set(Object.values(t.anahtar))]) {
    const d = await ayarOku(env, `fabrika:${anahtar}`, null);
    const kodlar = Object.keys(t.anahtar).filter((k) => t.anahtar[k] === anahtar);
    if (!d || !KART_ACIK.includes(d.asama) || String(kimeOf(env, d)) !== String(t.kisi)) { olmadi.push(...kodlar); continue; }
    const degisti = kodlar.filter((k) => JSON.stringify((d.secim || {})[k] || null) !== (t.kartDurum || {})[k]);
    if (degisti.length) { eskidi.push(...degisti); continue; }
    const kararlar = {};
    for (const g of t.gr) if (kodlar.includes(g.kod) && (d.mesajlar || {})[g.kod]) (kararlar[g.kod] = kararlar[g.kod] || []).push({ beden: g.beden, renkler: g.renkler });
    if (!Object.keys(kararlar).length) { olmadi.push(...kodlar); continue; }
    if (d.asama === "eminMi") d.asama = "soruldu"; // değişiklik: "Emin misin?" yeniden sorulur
    d.yazan = cq.from.first_name || "";
    d.secim = d.secim || {};
    await secimUygula(env, tg, anahtar, d, kararlar, "metin", t.metin);
    for (const k of Object.keys(kararlar)) kayit.push(kayitYazisi(k, secimNorm(d.secim[k])));
  }
  await ayarYaz(env, `fabrika:teyitAcik:${t.kisi}`, []);
  await cevapla(kayit.length ? "Kaydedildi" : "Kaydedilemedi");
  const not = [olmadi.length ? `⚠️ ${olmadi.join(", ")}: kart artık açık değil, kaydedilmedi.` : null, eskidi.length ? `⚠️ ${eskidi.join(", ")}: kart bu arada değişti, kaydedilmedi; yeniden yazın.` : null].filter(Boolean).join("\n");
  return benim && tg(env, "editMessageText", { ...benim, text: `${D}${kayit.length ? `✅ Kaydedildi: ${kayit.join("; ")}` : "⚠️ Kaydedilemedi."}${not ? `\n${not}` : ""}` });
}
