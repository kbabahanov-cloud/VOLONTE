// REPETE KARTI (11 Kasım, Patron — SON HAL). Kendi kaydı var (StokDO "rk:<id>"): deneme gerçek sipariş kaydına, kanıt defterine,
// "bitenler"e YAZMAZ.
// Akış: Sinem "Bitti" → Hemra kartı [Repete] (fabrika.js) → Hemra dağılımı onaylar ([✅ Patron'a gönder] / [✏️ Dağılımı değiştir]) →
//   Venom → Patron [Onaylıyorum] [Reddediyorum] → Fuat kartı [4-8 gün] [10-15 gün] [2 gün sonra dön] [Yapamam]
//   (yazıyla "3419 onaylıyorum 10 gün" de olur) → kayıt açılır → Venom'dan Patron'a TEK satır:
//   "3419 · 40 adet · Fuat onayladı · teslim: 21.11.2026" (aralıkta teslim = aralığın son günü).
// Dağılımı (renk / beden / adet) biz belirleriz; fabrika değiştirmez. 13 Kasım (Patron, kural 29): alt sınır YOK — adedi
// Hemra / Patron belirler; 10'dan az ya da 200'den fazla yazılırsa Hemra'ya BİR kez "N adet yazdınız. Doğru mu?" sorulur.
// 2 gün sonra dön: kart 2 gün sonra Fuat'a yeniden gider (Hemra'ya sorulmaz).
// Yapamam: Fuat'a sadece "Tamam, teşekkürler"; Hemra'ya bilgi; Patron'a mesaj YOK. Kayıt "beklemede" kalır (kapanmaz, kural 43 kilitlemez);
//   "3419 repete tekrar aç" (Hemra → Sami, Patron → Venom) kartı Fuat'a yeniden gönderir.
// KURAL 43: açık repete varken (mal gelmeden) aynı modele yeni repete verilmez.
// Takip: Fuat 24 saat cevap vermezse önce Fuat'a, 24 saat sonra Hemra'ya hatırlatma (ekip mesajları hep Sami'den gider);
//   teslim günü geçince Fuat'a sorulur; mal gelince (Vegawin stoğu artınca ya da "3419 geldi" yazılınca) kayıt kendiliğinden kapanır.
// Kuyruklar (StokDO): "rkOneri" Sami → Venom (Patron kartı) · "rkKarar" Venom → Sami (onay / red / tekrarAc) · "rkBaslat" Venom → Sami
//   (Patron'un istediği repete: Hemra'ya dağılım kartı) · "rkSonuc" Sami → Venom (Patron'a tek satır / biriken bilgi).
import { MOD_SATIR, modAcik, denemeKaydiMi } from "./deneme-modu.js";
import { stokIste } from "./stokbot.js";
import { uyumKaydi, uyumKontrol, uyumSatiri } from "./repete-uyum.js"; // 16 Kasım: kural 87
import { fabrikaKontrolu, retMi, iptalMi, evetMi, modelKodlari, anladimSatiri } from "./fabrika-kontrol.js"; // 16 Kasım: Venom kontrolü, ret / onay
import { siteVerisi } from "./depo-oku.js";
import { fuatSuzgec } from "./mutabakat.js";
export const ADET_SOR_ALT = 10, ADET_SOR_UST = 200; // bu aralığın dışındaki adet bir kez teyit edilir
import { _rk, sorumlu, muratMi, DENEME } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const GUN = 86400;
const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
export const gunGoster = (g) => String(g || "").split("-").reverse().join(".");
const saatI = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const haftaIci = (t) => { const g = new Date((t + SAAT_FARKI) * 1000).getUTCDay(); return g >= 1 && g <= 5; };
const mesai = (t) => haftaIci(t) && saatI(t) >= 9 && saatI(t) < 20;
const ayarOku = async (env, k, bos) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); };
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });
const kuyruk = (env, ad, kayit) => stokIste(env, "/kuyruk-ekle", { ad, kayit }).catch(() => null);
const ilk = (y) => String(y || "").split(",")[0].trim();
export const fuatId = (env) => ilk(env.FUAT_ID);
// 12 Kasım (Patron): CELAL — Celal'in modelinde repete kartı Celal'e gider (Fuat'ın bütün rolü Celal'de); Fuat'a ASLA gitmez, tersi de olmaz.
export const ureticiAd = (rec) => (rec && rec.uretici === "celal" ? "Celal" : "Fuat");
export async function ureticiId(env, rec) {
  if (!(rec && rec.uretici === "celal")) return fuatId(env);
  const l = (await env.KAYIT.get("sami:fabrikaKisiler", "json").catch(() => null)) || [];
  const c = l.find((k) => k.grup === "celal");
  return c ? String(c.id) : "";
}
const yonelt = (rec, metin) => (rec && rec.uretici === "celal" ? String(metin).replace(/Fuat Bey'in/g, "Celal Bey'in").replace(/Fuat'a/g, "Celal'e").replace(/Fuat'ın/g, "Celal'in").replace(/\bFuat\b/g, "Celal") : metin);
const D = (rec) => (rec.mod ? MOD_SATIR : rec.deneme ? DENEME : ""); // 13 Kasım (kural 40): deneme modu kaydı → Patron onaylı satır
const DK = (rec) => (rec.deneme || rec.mod ? "🧪 DENEME — " : "");
const sinif = (r) => (r.deneme ? "d" : r.mod ? "m" : "g"); // eski iç test / deneme modu / gerçek — birbirini engellemez
const ACIK = ["hemra", "patron", "fuat", "acik"]; // kural 43: bu durumlarda aynı modele yeni repete yok ("beklemede" kilitlemez)
const IZLENEN = [...ACIK, "beklemede"];
export const TEST_RESIM_YOLU = "/test-resim.jpg";
export const DON_SN = 2 * GUN; // "2 gün sonra dön"
const KOD_KALIP = "(test-\\d+|\\d{3,6})";

export const dagilimAdet = (d) => (d || []).reduce((t, x) => t + (Number(x.buyuk) || 0) + (Number(x.kucuk) || 0), 0);
// "beyaz · büyük 20, küçük 20" (birden çok renk " / " ile)
export const dagilimYazi = (d) => (d || []).map((x) => `${x.renk} · ${[x.buyuk ? `büyük ${x.buyuk}` : null, x.kucuk ? `küçük ${x.kucuk}` : null].filter(Boolean).join(", ")}`).join(" / ");
// Hemra'nın yazdığı dağılım: "beyaz büyük 20 küçük 20, siyah büyük 8" · "büyük beyaz 20 küçük beyaz 20" (sıra serbest) → [{renk, buyuk, kucuk}] | null
// 12 Kasım (Patron, KALICI KURAL): insan yazısı HER biçimde anlaşılır — sıra serbest ("büyük 40 adet siyah"), başta model kodu, "adet / tane",
// nokta / virgül, "44-50" = büyük, "38-44" = küçük, başta "/" olabilir. Sonuç: { d: [{renk, buyuk, kucuk}] | null, eksik: ["renk" | "beden" | "adet"] }
// Türkçe harfsiz yazılan bilinen renkler doğru adına çevrilir ("kirmizi" → "kırmızı"); bilinmeyen kelime yazıldığı gibi renk sayılır
const duzle = (w) => String(w).replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
const RENK_AD = Object.fromEntries(["siyah", "beyaz", "kırmızı", "bordo", "lacivert", "mavi", "yeşil", "sarı", "pembe", "mor", "gri", "bej", "kahve", "kahverengi", "krem", "ekru", "turuncu", "haki", "vizon", "füme", "pudra", "lila", "mint", "taba", "antrasit", "açık", "koyu", "gül", "kurusu", "hardal", "fuşya", "kiremit", "petrol", "indigo", "saks", "çağla", "mürdüm", "şampanya", "gümüş", "altın"].map((x) => [duzle(x), x]));
const GURULTU = /^(adet|adetten|tane|ad|seri|toplam|ve|ile|renk|rengi|beden|bedeni|model|kod|kodu|repete|da[gğ][ıi]l[ıi]m|olsun|olacak|l[üu]tfen|i[çc]in|tamam[ıi]|hepsi|x)$/;
export function dagilimAnaliz(metin, kod = null) {
  let t = String(metin || "").replace(/^\s*\/+/, " ");
  t = /[İıŞşĞğÜüÖöÇç]/.test(t) ? t.toLocaleLowerCase("tr") : t.toLowerCase(); // "SIYAH" → "siyah" (Türkçe harfsiz büyük yazı)
  t = t.replace(/(?<!\d)44\s*[-–\/]\s*(?:46\s*[-–\/]\s*48\s*[-–\/]\s*)?50(?!\d)/g, " büyük ").replace(/(?<!\d)38\s*[-–\/]\s*(?:40\s*[-–\/]\s*42\s*[-–\/]\s*)?44(?!\d)/g, " küçük ");
  const kel = t.replace(/test-\d+/g, " ").replace(/[.,;:·\/()\[\]"'’!?=+*_-]+/g, " ").split(/\s+/).filter(Boolean);
  const m = new Map();
  let renk = [], renkYumusak = false, beden = null, adet = null, sonTur = null, gorulen = 0;
  const tamam = () => {
    if (!(renk.length && beden && adet != null)) return;
    const r = renk.join(" ");
    const x = m.get(r) || { renk: r, buyuk: 0, kucuk: 0 };
    x[beden] += adet; m.set(r, x);
    beden = null; adet = null; renkYumusak = true; // renk bir sonraki beden / adet için geçerli kalır ("beyaz büyük 20 küçük 20")
  };
  for (const [i, w] of kel.entries()) {
    if (/^\d+$/.test(w)) {
      if ((kod && w === String(kod)) || w.length > 3 || (!kod && i === 0 && w.length === 3 && kel.some((y, k) => k > 0 && /^\d{1,3}$/.test(y)))) continue; // model kodu
      if (adet != null) return { d: null, eksik: [renk.length && !renkYumusak ? null : "renk", beden ? null : "beden"].filter(Boolean), belirsiz: true };
      adet = Number(w); gorulen++; sonTur = "adet"; tamam();
      continue;
    }
    if (GURULTU.test(w)) continue;
    const b = /^(b[üu]y[üu]k(ten|ler|den)?|buyuk|uly|b)$/.test(w) ? "buyuk" : /^(k[üu][çc][üu]k(ten|ler|den)?|kucuk|ki[çc]i|k)$/.test(w) ? "kucuk" : null;
    if (b) { beden = b; gorulen++; sonTur = "beden"; tamam(); continue; }
    if (!/^\p{L}+$/u.test(w)) continue;
    if (renkYumusak || sonTur !== "renk") { if (renkYumusak || !renk.length || adet == null) renk = []; renkYumusak = false; }
    renk.push(RENK_AD[duzle(w)] || w); sonTur = "renk"; tamam();
  }
  const l = [...m.values()].filter((x) => x.buyuk + x.kucuk > 0);
  const yarim = beden != null || adet != null || (renk.length && !renkYumusak);
  if (yarim || !l.length) {
    const eksik = [renk.length ? null : "renk", beden ? null : "beden", adet != null ? null : "adet"].filter(Boolean);
    return { d: null, eksik: eksik.length ? eksik : ["renk", "beden", "adet"], gorulen };
  }
  return { d: l, eksik: [], gorulen };
}
export const dagilimCoz = (metin, kod = null) => dagilimAnaliz(metin, kod).d;
const eksikCumlesi = (e) => { const ad = { renk: "Renk", beden: "Beden (büyük ya da küçük)", adet: "Adet" }; const l = e.map((x) => ad[x]); return `${l.length > 1 ? `${l.slice(0, -1).join(", ")} ve ${l.at(-1).toLocaleLowerCase("tr")}` : l[0]} eksik.`; };
export const durumYazi = (rec) => yonelt(rec, { hemra: "Hemra'nın onayında", patron: "Patron'un onayında", fuat: "Fuat'ın cevabı bekleniyor", acik: `Fuat onayladı, teslim ${gunGoster(rec.teslim)}`, beklemede: "Fuat yapamam dedi, beklemede" }[rec.durum] || rec.durum);
export const engelMetni = (rec) => `${D(rec)}⛔ ${rec.kod} için açık repete var (${durumYazi(rec)}). Mal gelmeden yeni repete verilmez.`;
export const sonucSatiri = (rec) => `${DK(rec)}${rec.kod} · ${rec.adet} adet · ${ureticiAd(rec)} onayladı · teslim: ${gunGoster(rec.teslim)}`;
const yeniId = (kod, deneme, simdi) => `${deneme ? "D" : ""}${kod}-${simdi.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// ---------- kayıt ----------
export const rkOku = (env, id) => ayarOku(env, `rk:${id}`, null);
async function rkYaz(env, rec) {
  await ayarYaz(env, `rk:${rec.id}`, rec);
  const hepsi = await ayarOku(env, "rk:hepsi", []);
  if (!hepsi.includes(rec.id)) await ayarYaz(env, "rk:hepsi", [...hepsi, rec.id].slice(-300));
  const acik = await ayarOku(env, "rk:acik", []);
  const izle = IZLENEN.includes(rec.durum) && !rec.kapandi;
  if (izle && !acik.includes(rec.id)) await ayarYaz(env, "rk:acik", [...acik, rec.id]);
  if (!izle && acik.includes(rec.id)) await ayarYaz(env, "rk:acik", acik.filter((x) => x !== rec.id));
}
async function acikKayitlar(env) {
  const l = [];
  for (const id of await ayarOku(env, "rk:acik", [])) { const r = await rkOku(env, id); if (r) l.push(r); }
  return l;
}
const ayniKod = (a, b) => String(a || "").trim().toLocaleUpperCase("tr") === String(b || "").trim().toLocaleUpperCase("tr");
// KURAL 43 — o modelin açık repetesi (yoksa null). Deneme ve gerçek kayıtlar birbirini engellemez.
export async function acikRepete(env, kod, { deneme = false, mod = false } = {}) {
  if (!String(kod || "").trim()) return null;
  return (await acikKayitlar(env)).find((r) => ayniKod(r.kod, kod) && ACIK.includes(r.durum) && sinif(r) === sinif({ deneme, mod })) || null;
}

// ---------- gönderim (her mesajın Telegram'dan dönen hali kayda: rec.kanit) ----------
const dugmeYazi = (rm) => ((rm && rm.inline_keyboard) || []).map((s) => s.map((b) => b.text));
function kanit(rec, kime, r, metin, kl, simdi) {
  const m = r && r.ok && r.result && typeof r.result === "object" ? r.result : null;
  rec.kanit = [...(rec.kanit || []), { zaman: simdi, kime, ok: Boolean(r && r.ok), mesaj: m ? m.message_id : null, resim: Boolean(m && m.photo && m.photo.length), yazi: String((m && (m.caption || m.text)) || metin).slice(0, 900), dugmeler: dugmeYazi((m && m.reply_markup) || kl), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null }].slice(-60);
}
async function kartGonder(env, tg, rec, kime, chat, metin, kl, simdi, foto = null) {
  kime = yonelt(rec, kime); metin = yonelt(rec, metin);
  let r = foto ? await tg(env, "sendPhoto", { chat_id: chat, photo: foto, caption: metin, ...(kl ? { reply_markup: kl } : {}) }) : null;
  if (!(r && r.ok)) r = await tg(env, "sendMessage", { chat_id: chat, text: metin, ...(kl ? { reply_markup: kl } : {}) });
  // 16 Kasım (denetim, kural 86): tek kapı kartı DURDURDUYSA kart gitmemiştir — eski kartın numarası bu kayda yazılmaz (yoksa kayıt
  // "gitti" sanılıp takılı kalır, Hemra'nın yazıları ona bağlanırdı). Kayda sebep yazılır; çağıran "gönderilemedi" yoluna girer.
  if (r && r.tekrar) {
    rec.kapiEngel = { zaman: simdi, kime, kapi: r.kapi };
    rec.hata = `tek kapı: aynı kart (${kime}) son 7 günde gitti ve ${r.kapi === "acik" ? "hâlâ cevap bekliyor" : "kapandı"} — yeni kart gönderilmedi`;
    kanit(rec, kime, { ok: false, description: rec.hata }, metin, kl, simdi);
    return null;
  }
  kanit(rec, kime, r, metin, kl, simdi);
  return r && r.ok ? [String(chat), r.result.message_id, r.result.photo ? "foto" : "yazi"] : null;
}
async function kartDuzenle(env, tg, rec, kime, m, metin, kl, simdi) {
  if (!m) return null;
  kime = yonelt(rec, kime); if (!/^(Hemra)/.test(kime)) metin = yonelt(rec, metin);
  const foto = m[2] === "foto";
  const r = await tg(env, foto ? "editMessageCaption" : "editMessageText", { chat_id: m[0], message_id: m[1], [foto ? "caption" : "text"]: metin.slice(0, foto ? 1024 : 4000), reply_markup: kl || { inline_keyboard: [] } });
  kanit(rec, `${kime} (kart güncellendi)`, r && r.ok && r.result && typeof r.result === "object" ? r : { ok: Boolean(r && r.ok), result: { message_id: m[1] }, description: r && r.description }, metin, kl, simdi);
  return r;
}
async function fotoAdresi(env, rec) {
  try { return _rk.sitedenFoto(env, rec.test ? [] : await _rk.siteListesi(env), rec.kod); } catch { return null; }
}

// ---------- kart yazıları ----------
const baslik = (rec) => `${_rk.magazaAdi(rec.magaza)} · ${rec.kod}`;
const dagilimSatiri = (rec) => (rec.dagilim ? `${dagilimYazi(rec.dagilim)} (toplam ${rec.adet} adet)` : "yok — lütfen yazın");
export function hemraMetni(rec) {
  return [`${D(rec)}🔁 REPETE ÖNERİSİ — ${baslik(rec)}`,
    `${rec.kaynak === "patron" ? "Patron repete istedi" : "Fabrikada bitti"} · mağazada kalan: ${rec.kalan} adet`,
    rec.satis7 > 0 ? `Satış hızı: son 7 günde ${rec.satis7} adet${rec.bitisGun ? ` · bu hızla ~${rec.bitisGun} günde biter` : ""}` : "Satış hızı: son 7 günde satış yok, repete önerilmez",
    `Önerilen repete: ${dagilimSatiri(rec)}`].join("\n");
}
// Hemra'nın kartının (dağılım onayı aşamasındaki) tam yazısı: "bitti" kartından geldiyse o kartın yazısı korunur
const hemraTaban = (rec, kim = null) => (rec.hemraKart ? `${rec.hemraKart}\n\n🔁 ${kim || (rec.hemraSecen || "Hemra")}: Repete.\nDağılım: ${dagilimSatiri(rec)}` : hemraMetni(rec));
// 12 Kasım (Patron): repeteyi PATRON başlattıysa Hemra dağılımı yazar ve kart doğrudan fabrikaya gider (Patron'a ikinci onay gelmez) → düğme gerçek hedefi gösterir
const gonderDugme = (rec) => (rec.kaynak === "patron" ? `✅ ${ureticiAd(rec) === "Celal" ? "Celal'e" : "Fuat'a"} gönder` : "✅ Patron'a gönder");
const hemraKlavye = (rec) => ({ inline_keyboard: [...(rec.dagilim ? [[{ text: gonderDugme(rec), callback_data: `rk:ho:${rec.id}` }]] : []), [{ text: "✏️ Dağılımı değiştir", callback_data: `rk:hd:${rec.id}` }], ...(rec.hemraKart ? [] : [[{ text: "❌ Gerek yok", callback_data: `rk:hx:${rec.id}` }]])] });
// Fabrikaya stok / satış / fiyat bilgisi GİTMEZ: sadece kod + dağılım
export function fuatMetni(rec) {
  return [rec.uretici === "celal" ? (rec.mod ? MOD_SATIR.trim() : rec.deneme ? DENEME.trim() : null) : `${D(rec)}${_rk.magazaAdi(rec.magaza)}`, `🔁 REPETE · ${rec.kod} · ${dagilimYazi(rec.dagilim)}`, `Toplam ${rec.adet} adet. Dağılım sabittir, değiştirilmez.`].filter(Boolean).join("\n"); // Celal'e mağaza adı gitmez
}
const fuatKlavye = (rec) => ({ inline_keyboard: [[{ text: "✅ 4-8 gün", callback_data: `rk:f8:${rec.id}` }, { text: "✅ 10-15 gün", callback_data: `rk:f15:${rec.id}` }], [{ text: "⏳ 2 gün sonra dön", callback_data: `rk:fd:${rec.id}` }], [{ text: "❌ Yapamam", callback_data: `rk:fy:${rec.id}` }]] });
const SURE = { f8: { gun: 8, etiket: "4-8 gün" }, f15: { gun: 15, etiket: "10-15 gün" } }; // teslim = aralığın son günü

// ---------- 1) öneri: Sami → Hemra (Patron'un istediği repete ya da deneme) ----------
// g = { kod, magaza, dagilim: [{renk, buyuk, kucuk}] | null, deneme, test, kalan, satis7, kaynak }
export async function oneriAc(env, tg, g, simdi) {
  const kod = String(g.kod || "").trim();
  const deneme = Boolean(g.deneme);
  const mod = !deneme && (g.mod != null ? Boolean(g.mod) : await modAcik(env)); // deneme modu açıkken başlatılan repete 🧪
  const engel = await acikRepete(env, kod, { deneme, mod });
  if (engel) return { engel, metin: engelMetni(engel) };
  let adet = dagilimAdet(g.dagilim);
  let kalan = g.kalan, satis7 = g.satis7;
  if (!g.test) {
    const st = (await stokIste(env, "/toplu", { kodlar: [kod] }).catch(() => ({})))[kod];
    const donem = await stokIste(env, "/satis-donem", { basla: gunA(simdi - 7 * GUN), bitis: gunA(simdi) }).catch(() => ({}));
    kalan = st ? Math.max(0, Number(st.toplam) || 0) : 0;
    satis7 = Number((donem || {})[kod]) || 0;
  }
  if (g.samiOnerisi && !(Number(satis7) > 0)) { g = { ...g, dagilim: null }; adet = 0; } // 12 Kasım (Patron): satış yoksa Sami dağılım ÖNERMEZ (Hemra isterse kendisi yazar)
  // 16 Kasım (denetim, kural 31): tedarikçi okunamazsa "Fuat" VARSAYILMAZ — kart açılmaz, sebep yazılır
  let ted = g.uretici || g.test ? null : await stokIste(env, "/tedarikci", { kodlar: [kod] }).catch(() => null);
  if (!g.uretici && !g.test && !(ted && typeof ted === "object")) return { hata: `${kod}: üretici (Fuat mı Celal mi) okunamadı — repete kartı açılmadı, birazdan yeniden denenir.` };
  const uretici = g.uretici || (g.test ? "fuat" : (ted[kod] || {}).tedarikci === "CELAL" ? "celal" : "fuat");
  const rec = { id: yeniId(kod, deneme, simdi), kod, uretici, magaza: g.magaza || "VOLONTE", deneme, ...(mod ? { mod: true } : {}), test: Boolean(g.test), ikinciDene: Boolean(g.ikinciDene), kaynak: g.kaynak || null, donSn: g.donSn || null,
    dagilim: g.dagilim || null, adet, kalan: Number(kalan) || 0, satis7: Number(satis7) || 0, durum: "hemra", zaman: simdi, mesajlar: {}, kanit: [] };
  rec.bitisGun = rec.satis7 > 0 ? Math.max(1, Math.ceil(rec.kalan / (rec.satis7 / 7))) : null;
  rec.mesajlar.hemra = await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), hemraMetni(rec), hemraKlavye(rec), simdi, await fotoAdresi(env, rec));
  if (!rec.mesajlar.hemra) { rec.durum = "iptal"; rec.kapandi = simdi; await rkYaz(env, rec); return { hata: `Hemra'ya kart gönderilemedi${rec.kapiEngel ? ` (${rec.hata})` : ""}.`, rec }; }
  await rkYaz(env, rec);
  return { rec };
}
// Sinem "Bitti" → Hemra [Repete] (fabrika.js): aynı kart dağılım onayına döner ([✅ Patron'a gönder] / [✏️ Dağılımı değiştir])
export async function rkHemradan(env, tg, sip, kart, kim, simdi) {
  const v = sip.rkVeri || {};
  const rec = { id: yeniId(sip.kod, sip.deneme, simdi), kod: sip.kod, uretici: sip.grup === "celal" ? "celal" : "fuat", magaza: sip.magaza || "VOLONTE", deneme: Boolean(sip.deneme), ...(sip.mod ? { mod: true } : {}), test: Boolean(sip.test), kaynak: "bitti", sip: sip.id, hemraKart: kart, hemraSecen: kim,
    donSn: (sip.testVeri && sip.testVeri.donSn) || null, dagilim: v.dagilim || null, adet: dagilimAdet(v.dagilim), kalan: Number(v.kalan) || 0, satis7: Number(v.s7) || 0, yil: v.yil ?? null, durum: "hemra", zaman: simdi,
    mesajlar: { hemra: sip.hemraMesaj ? [String(sip.hemraMesaj[0]), sip.hemraMesaj[1], sip.hemraMesaj[2] === "foto" ? "foto" : "yazi"] : null }, kanit: [] };
  rec.bitisGun = rec.satis7 > 0 ? Math.max(1, Math.ceil(rec.kalan / (rec.satis7 / 7))) : null;
  await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, hemraTaban(rec, kim), hemraKlavye(rec), simdi);
  await rkYaz(env, rec);
  return rec;
}

// ---------- 2) düğmeler ----------
export async function rkDugme(env, cq, tg, simdi) {
  const cevapla = (text, uyari = false) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: String(text).slice(0, 190), show_alert: uyari });
  const p = String(cq.data).split(":"), islem = p[1], id = p.slice(2).join(":");
  if (islem === "yv" || islem === "yh") { // 16 Kasım: yazıyla yeni repete isteği — "Şunu anladım … Doğru mu?" cevabı (id = isteyen kişi)
    if (String(cq.from.id) !== String(id)) return cevapla("Bu soru size ait değil.");
    const soru = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "yh") { const y = await env.KAYIT.get(`rkYeni:${id}`, "json").catch(() => null); await env.KAYIT.delete(`rkYeni:${id}`).catch(() => null); await cevapla("Geri alındı"); return tg(env, "editMessageText", { ...soru, text: `↩️ ${y ? `${y.kod} için yeni repete isteği` : "İstek"} geri alındı. Hiçbir şey gönderilmedi.` }); }
    await cevapla("Tamam");
    await tg(env, "editMessageReplyMarkup", { ...soru, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    return yeniRepeteOnayla(env, tg, id, _rk.kisiAd(cq.from), cq.message.chat.id, simdi);
  }
  const rec = await rkOku(env, id);
  if (!rec) return cevapla("Bu kart artık geçerli değil.");
  const kim = _rk.kisiAd(cq.from);
  const patronMu = muratMi(env, cq.from.id);
  if (["ho", "hx", "hd", "ad", "az", "ev", "hy"].includes(islem)) {
    const yetkili = [sorumlu(env), ilk(env.BR_SORUMLU), ilk(env.HEMRA_ID)].filter(Boolean).includes(String(cq.from.id)) || patronMu;
    if (!yetkili) return cevapla("Bu karar Hemra'da.");
    if (islem === "ev" || islem === "hy") { // 16 Kasım: "Şunu anladım … Doğru mu?" → ✅ Evet / ❌ Hayır
      if (rec.durum !== "hemra" || !rec.onayBekleyen) return cevapla("Bu soru artık geçerli değil.");
      if (islem === "hy") { await cevapla("Geri alındı"); return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: await geriAl(env, tg, rec, String(cq.from.id), simdi) }); }
      await cevapla("Kaydedildi");
      return dagilimOnayla(env, tg, rec, cq.from, cq.message.chat.id, simdi);
    }
    if (islem === "ad" || islem === "az") { // 13 Kasım: "N adet yazdınız. Doğru mu?" → ✅ Doğru / ✏️ Düzelt
      const soru = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
      if (rec.durum !== "hemra" || !rec.adetBekleyen) return cevapla("Bu soru artık geçerli değil.");
      const n = dagilimAdet(rec.adetBekleyen);
      if (islem === "az") {
        rec.adetBekleyen = null;
        await rkYaz(env, rec);
        await cevapla("Yeniden yazın");
        return tg(env, "editMessageText", { ...soru, text: `${D(rec)}✏️ ${rec.kod}: ${n} adet düzeltilecek — dağılımı yeniden yazın.` });
      }
      await cevapla("Doğru");
      await tg(env, "editMessageText", { ...soru, text: `${D(rec)}✅ ${rec.kod}: ${n} adet — ${kim} "doğru" dedi.` });
      return dagilimiYaz(env, tg, rec, rec.adetBekleyen, cq.from.id, cq.message.chat.id, simdi);
    }
    if (rec.durum !== "hemra") return cevapla(rec.hemra ? `${rec.hemra.kim} zaten seçti.` : "Bu kart artık geçerli değil.");
    if (islem === "hd") { // ✏️ Dağılımı değiştir → yazıyla
      await env.KAYIT.put(`rkDagilim:${cq.from.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
      await cevapla("Dağılımı yazın");
      const r = await tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `${D(rec)}✏️ ${rec.kod} repete dağılımını yazın. Örnek: beyaz büyük 20 küçük 20` });
      kanit(rec, "Hemra", r, "", null, simdi);
      return rkYaz(env, rec);
    }
    rec.hemra = { kim, zaman: simdi, red: islem === "hx" };
    if (islem === "hx") {
      Object.assign(rec, { durum: "red", kapandi: simdi });
      await cevapla("Repete açılmadı");
      await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n❌ ${kim}: gerek yok. Repete açılmadı.`, null, simdi);
      return rkYaz(env, rec);
    }
    if (!rec.dagilim || !(rec.adet > 0)) { rec.hemra = null; return cevapla("Önce dağılımı yazın.", true); }
    if (rec.kaynak === "patron") { // Patron zaten "repete" dedi: ikinci onay YOK — kart doğrudan fabrikaya (Celal / Fuat)
      rec.patron = { karar: "onay", kim: "Patron", dugme: "repeteyi Patron başlattı", zaman: rec.zaman };
      const ura = ureticiAd(rec) === "Celal" ? "Celal'e" : "Fuat'a";
      if (!(await fuataGonder(env, tg, rec, simdi))) {
        if (rec.kontrolSorun) { await cevapla("Kart gitmedi — kontrol", true); return kontrolDurdu(env, tg, rec, simdi, { patronaHemen: true }); }
        if (rec.kapiEngel) { // 16 Kasım (kural 86): tek kapı durdurdu → "beklemede"; Patron "tekrar aç" derse izinli gider
          Object.assign(rec, { durum: "beklemede", beklemeZaman: simdi });
          await cevapla("Kart gitmedi — aynı kart yakın zamanda gitmiş", true);
          await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n⚠️ Repete kartı ${ura} gitmedi — ${rec.hata}. Patron'a soruldu.`, null, simdi);
          await kuyruk(env, "rkSonuc", { id: `${rec.id}:kapi`, rid: rec.id, metin: `${DK(rec)}⚠️ ${rec.kod} repete kartı ${ura} gitmedi — ${rec.hata}. Yine de göndermek isterseniz: "${rec.kod} repete tekrar aç".` });
          return rkYaz(env, rec);
        }
        Object.assign(rec, { durum: "iptal", kapandi: simdi });
        await cevapla("Gönderilemedi", true);
        await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n⚠️ Repete kartı ${ura} gönderilemedi (${rec.hata || "?"}). Repete açılmadı.`, null, simdi);
        await kuyruk(env, "rkSonuc", { id: `${rec.id}:h`, rid: rec.id, metin: `${DK(rec)}⚠️ ${rec.kod} repete kartı ${ura} gönderilemedi (${rec.hata || "?"}). Repete açılmadı.` });
        return rkYaz(env, rec);
      }
      await cevapla(`${ura} gidiyor`);
      await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n✅ ${kim} dağılımı onayladı — repete kartı ${ura} gitti.`, null, simdi);
      return rkYaz(env, rec);
    }
    rec.durum = "patron";
    await cevapla("Patron'a gidiyor");
    await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n✅ ${kim} onayladı — Patron'un onayına gitti.`, null, simdi);
    await kuyruk(env, "rkOneri", { id: `${rec.id}:o`, rid: rec.id, kod: rec.kod, uretici: ureticiAd(rec), magaza: rec.magaza, deneme: rec.deneme, mod: Boolean(rec.mod), dagilim: dagilimYazi(rec.dagilim), adet: rec.adet, kalan: rec.kalan, satis7: rec.satis7, bitisGun: rec.bitisGun, hemra: kim, foto: await fotoAdresi(env, rec), zaman: simdi });
    return rkYaz(env, rec);
  }
  if (["f8", "f15", "fd", "fy"].includes(islem)) {
    if (String(cq.from.id) !== (await ureticiId(env, rec)) && !patronMu) return cevapla(yonelt(rec, "Bu kart Fuat Bey'in."));
    if (rec.durum !== "fuat" || rec.donZaman) return cevapla(rec.durum === "acik" ? `Zaten onaylandı: teslim ${gunGoster(rec.teslim)}.` : "Bu kart artık geçerli değil.");
    if (islem === "fy") { await cevapla("Tamam"); return fuatYapamam(env, tg, rec, { kim, dugme: "❌ Yapamam" }, simdi); }
    if (islem === "fd") { // 2 gün sonra dön: kart o zaman yeniden gelir; Hemra'ya sorulmaz
      const sn = rec.donSn || DON_SN;
      Object.assign(rec, { donZaman: simdi + sn, sonraDon: { kim, zaman: simdi } });
      await cevapla("2 gün sonra yeniden gelecek");
      await kartDuzenle(env, tg, rec, "Fuat", rec.mesajlar.fuat, `${fuatMetni(rec)}\n\n⏳ 2 gün sonra yeniden sorulacak${rec.donSn ? ` (denemede ${Math.round(sn / 60)} dakika)` : ""}.`, null, simdi);
      return rkYaz(env, rec);
    }
    await cevapla("Kaydedildi ✅");
    return fuatOnay(env, tg, rec, { kim, gun: SURE[islem].gun, etiket: SURE[islem].etiket, dugme: `✅ ${SURE[islem].etiket}` }, simdi);
  }
  if (islem === "tg" || islem === "t5") { // teslim günü geçti sorusunun cevabı
    if (String(cq.from.id) !== (await ureticiId(env, rec)) && !patronMu) return cevapla(yonelt(rec, "Bu kart Fuat Bey'in."));
    if (rec.durum !== "acik") return cevapla("Bu kayıt kapandı.");
    const yeni = gunA(simdi + (islem === "t5" ? 5 : 1) * GUN);
    Object.assign(rec, { teslim: yeni, teslimSoruldu: null, teslimCevap: { kim, ne: islem === "t5" ? "5 gün daha" : "bugün / yarın geliyor", zaman: simdi } });
    await cevapla("Kaydedildi ✅");
    await kartDuzenle(env, tg, rec, "Fuat", rec.mesajlar.teslim, `${D(rec)}📦 ${rec.kod} repete: ${rec.teslimCevap.ne} — yeni teslim ${gunGoster(yeni)}. Teşekkürler.`, null, simdi);
    const bilgi = yonelt(rec, `${D(rec)}📦 ${rec.kod} repete: Fuat "${rec.teslimCevap.ne}" dedi → yeni teslim ${gunGoster(yeni)}.`);
    await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), bilgi, null, simdi);
    await kuyruk(env, "rkSonuc", { id: `${rec.id}:t${simdi}`, rid: rec.id, metin: bilgi, biriktir: true });
    return rkYaz(env, rec);
  }
  return cevapla("Geçersiz düğme.");
}

// ---------- 3) Fuat'a kart (Patron onayından sonra; "2 gün sonra dön" ve "tekrar aç" ile yeniden) ----------
// 16 Kasım (Patron, kural 87): kayıt kaynakları (eksik listesi geçmişi son 6 hafta + açık sipariş, site, model kartı)
const SAAT_FARKI_U = 3 * 3600;
const pztU = (t) => gunA(t - ((new Date((t + SAAT_FARKI_U) * 1000).getUTCDay() + 6) % 7) * 86400);
const uyumKaynaklari = (env, simdi) => ({
  ayarOku: (k, b) => ayarOku(env, k, b),
  fsKod: async (kod) => {
    const l = [];
    const a = await stokIste(env, "/fs-kod", { kod }).catch(() => null); if (a) l.push(a);
    for (let h = 0; h < 6; h++) for (const x of Object.values((await ayarOku(env, `fs:hafta:${pztU(simdi - h * 7 * 86400)}`, {})) || {})) if (x && String(x.kod) === String(kod)) l.push(x);
    return l;
  },
  site: () => siteVerisi(env),
  kart: (kod) => env.KAYIT.get(`pelinboy:${kod}`, "json"),
});
// Venom'a sorar (iç bağlantı); Venom'a ulaşılamazsa AYNI kontrol burada yapılır (kart yine kontrolsüz gitmez)
async function venomKontrol(env, g, simdi) {
  try { if (env.VENOM && typeof env.VENOM.fabrikaKontrol === "function") { const r = await env.VENOM.fabrikaKontrol(g); if (r && typeof r.ok === "boolean") return { ...r, kim: "Venom" }; } } catch { /* aşağıda */ }
  const r = await fabrikaKontrolu(g, uyumKaynaklari(env, simdi));
  return { ...r, kim: "Sami (Venom'a ulaşılamadı, aynı kontrol)" };
}
// Venom kontrolü kartı durdurdu: repete Hemra'da açık kalır, dağılım silinir, Hemra'ya sorulur (çözülmezse 2 saat sonra Patron'a tek satır)
async function kontrolDurdu(env, tg, rec, simdi, { patronaHemen = false } = {}) {
  const sorun = rec.kontrolSorun || [rec.hata || "?"];
  const hemra = await _rk.koordinatorId(env, simdi);
  Object.assign(rec, { durum: "hemra", dagilim: null, adet: 0, onayBekleyen: null, patron: null, sorunZaman: simdi, sorunMetin: sorun.join("; "), sorunPatron: patronaHemen ? simdi : null, kontrolSorun: null });
  const satir = `${D(rec)}⚠️ ${rec.kod} repete kartı fabrikaya GİTMEDİ (Venom kontrolü): ${sorun.join("; ")}. Doğru dağılımı yazın ya da "iptal" yazın.`;
  await kartGonder(env, tg, rec, "Hemra", hemra, satir, null, simdi);
  if (hemra) await env.KAYIT.put(`rkDagilim:${hemra}`, JSON.stringify({ id: rec.id }), { expirationTtl: 2 * 86400 }).catch(() => null);
  if (rec.mesajlar.hemra) await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, hemraTaban(rec), hemraKlavye(rec), simdi);
  if (patronaHemen) await kuyruk(env, "rkSonuc", { id: `${rec.id}:k${simdi}`, rid: rec.id, metin: yonelt(rec, `${DK(rec)}⚠️ ${rec.kod} repete Fuat'a gitmedi — ${sorun.join("; ")}. Hemra'ya soruldu.`) });
  return rkYaz(env, rec);
}
async function fuataGonder(env, tg, rec, simdi, ne = "Fuat") {
  // 16 Kasım (Patron, kural 87): İLK gönderimden önce dağılımdaki renk / beden kayıtla karşılaştırılır; uyuşmuyorsa kart GİTMEZ
  // (rec.hata → çağıran Hemra'nın kartına ve Patron'a "renk/beden uyuşmuyor" satırını yazar). Deneme / test kaydı kontrole girmez.
  // 16 Kasım (Patron): fabrikaya giden HER kart gitmeden önce Venom'dan geçer — (a) yazılan mesajdaki kod, (b) satış 0 ise onay,
  // (c) renk / beden kayıtta var mı, (d) "hayır / yanlış / iptal" yazıldı mı. Uyuşmazlıkta kart GİTMEZ (rec.kontrolSorun → çağıran kişiye sorar).
  if (!(rec.mesajlar && rec.mesajlar.fuat) && !denemeKaydiMi(rec) && !rec.test) {
    const k = await venomKontrol(env, { kod: rec.kod, tur: "repete", dagilim: Array.isArray(rec.dagilim) ? rec.dagilim : null, satis7: rec.satis7 ?? null,
      satisOnay: Boolean(rec.satisOnay || (rec.patron && rec.patron.karar === "onay")), kaynakMetin: rec.dagilimMetin || null, kaynakZaman: rec.dagilimZaman || 0, hayirZaman: rec.hayirZaman || null, kim: rec.dagilimKim || "Hemra" }, simdi);
    rec.kontrol = { zaman: simdi, ok: k.ok, sorun: k.sorun, kim: k.kim };
    if (!k.ok) { rec.hata = k.sorun.join("; "); rec.kontrolSorun = k.sorun; return false; }
  }
  const metin = fuatMetni(rec), fuat = await ureticiId(env, rec);
  rec.hata = !fuat ? `${ureticiAd(rec)}'${rec.uretici === "celal" ? "in" : "ın"} kimliği kayıtlı değil` : fuatSuzgec(metin) ? "güvenlik süzgeci durdurdu" : null;
  const m = rec.hata ? null : await kartGonder(env, tg, rec, ne, fuat, metin, fuatKlavye(rec), simdi, await fotoAdresi(env, rec));
  if (!m) return false;
  rec.mesajlar.fuat = m;
  Object.assign(rec, { durum: "fuat", fuatGonderim: simdi, donZaman: null, hat1: null, hat2: null, kapandi: null });
  return true;
}
async function patronKarari(env, tg, k, simdi) {
  if (k.karar === "tekrarAc") { // Patron Venom'a "3419 repete tekrar aç" dedi
    const r = await tekrarAc(env, tg, k.kod, k.kim || "Patron", simdi);
    await kuyruk(env, "rkSonuc", { id: `ta:${k.kod}:${simdi}`, rid: r.rec ? r.rec.id : `ta-${k.kod}`, metin: r.metin }); // Patron'a TEK sonuç: gitti ya da gitmedi (sebebiyle)
    if (r.ok) await kartGonder(env, tg, r.rec, "Hemra", await _rk.koordinatorId(env, simdi), r.metin, null, simdi).then(() => rkYaz(env, r.rec));
    return;
  }
  const rec = await rkOku(env, k.rid);
  if (!rec || rec.durum !== "patron") return;
  rec.patron = { karar: k.karar, kim: k.kim || "Patron", dugme: k.dugme || null, zaman: k.zaman || simdi };
  const hemra = await _rk.koordinatorId(env, simdi);
  if (k.karar !== "onay") {
    Object.assign(rec, { durum: "red", kapandi: simdi });
    await kartGonder(env, tg, rec, "Hemra", hemra, `${D(rec)}${baslik(rec)}: ❌ Patron reddetti. Repete açılmadı.`, null, simdi);
    return rkYaz(env, rec);
  }
  if (!(await fuataGonder(env, tg, rec, simdi))) {
    if (rec.kontrolSorun) return kontrolDurdu(env, tg, rec, simdi, { patronaHemen: true });
    if (rec.kapiEngel) { // 16 Kasım (kural 86): tek kapı durdurdu → kayıt "beklemede" kalır; Patron "KOD repete tekrar aç" derse izinli yeniden gider
      Object.assign(rec, { durum: "beklemede", beklemeZaman: simdi });
      await kuyruk(env, "rkSonuc", { id: `${rec.id}:kapi`, rid: rec.id, metin: yonelt(rec, `${DK(rec)}⚠️ ${rec.kod} repete kartı Fuat'a gitmedi — ${rec.hata}. Yine de göndermek isterseniz: "${rec.kod} repete tekrar aç".`) });
      return rkYaz(env, rec);
    }
    Object.assign(rec, { durum: "iptal", kapandi: simdi });
    await kuyruk(env, "rkSonuc", { id: `${rec.id}:h`, rid: rec.id, metin: yonelt(rec, `${DK(rec)}⚠️ ${rec.kod} repete kartı Fuat'a gönderilemedi (${rec.hata || "Fuat Sami'ye /start yazmamış olabilir"}). Repete açılmadı.`) });
    return rkYaz(env, rec);
  }
  await kartGonder(env, tg, rec, "Hemra", hemra, `${D(rec)}${baslik(rec)}: ✅ Patron onayladı. Repete kartı Fuat'a gitti.`, null, simdi);
  return rkYaz(env, rec);
}
// "3419 repete tekrar aç": beklemedeki (Fuat "Yapamam" demiş) kayıt için kart Fuat'a yeniden gider
export async function tekrarAc(env, tg, kod, kim, simdi) {
  const rec = (await acikKayitlar(env)).find((r) => ayniKod(r.kod, kod) && r.durum === "beklemede");
  if (!rec) return { ok: false, metin: `⚠️ ${String(kod).toLocaleUpperCase("tr")} için beklemede repete kaydı yok.` };
  const engel = await acikRepete(env, rec.kod, { deneme: rec.deneme, mod: Boolean(rec.mod) });
  if (engel) return { ok: false, metin: engelMetni(engel) };
  rec.tekrarAcan = [...(rec.tekrarAcan || []), { kim, zaman: simdi }];
  // 16 Kasım: tek kapı — Patron'un açık "tekrar aç" emri izinli yeniden gönderimdir
  if (!(await fuataGonder({ ...env, __kapiIzin: `Patron "tekrar aç" dedi (${kim})` }, tg, rec, simdi, "Fuat (tekrar açıldı)"))) { await rkYaz(env, rec); return { ok: false, rec, metin: yonelt(rec, `${DK(rec)}⚠️ ${rec.kod} repete kartı Fuat'a gönderilemedi (${rec.hata || "?"}).`) }; }
  await rkYaz(env, rec);
  return { ok: true, rec, metin: yonelt(rec, `${DK(rec)}🔁 ${rec.kod} repete tekrar açıldı (${kim}); kart Fuat'a yeniden gitti.`) };
}

// ---------- 4) Fuat'ın cevabı ----------
async function fuatOnay(env, tg, rec, { kim, gun, etiket = null, dugme = null, yazi = null }, simdi) {
  Object.assign(rec, { durum: "acik", donZaman: null, fuat: { kim, zaman: simdi, gun, etiket, dugme, yazi }, teslim: gunA(simdi + gun * GUN) });
  if (!denemeKaydiMi(rec)) { const st = (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod]; rec.stokBas = st ? Number(st.toplam) || 0 : 0; rec.stokMin = rec.stokBas; }
  await kartDuzenle(env, tg, rec, "Fuat", rec.mesajlar.fuat, `${fuatMetni(rec)}\n\n✅ Onaylandı: ${etiket || `${gun} gün`} · teslim ${gunGoster(rec.teslim)}`, null, simdi);
  await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), sonucSatiri(rec), null, simdi);
  await kuyruk(env, "rkSonuc", { id: `${rec.id}:s${simdi}`, rid: rec.id, metin: sonucSatiri(rec) });
  rec.sonucGitti = simdi;
  await rkYaz(env, rec);
  if (rec.ikinciDene) { // deneme: kural 43 — aynı modele ikinci repete denenir, engel mesajı Hemra'ya (telefon kanıtı)
    const r2 = await oneriAc(env, tg, { kod: rec.kod, magaza: rec.magaza, dagilim: rec.dagilim, deneme: rec.deneme, test: rec.test, kalan: rec.kalan, satis7: rec.satis7 }, simdi); // aynı yoldan ikinci öneri
    rec.engelDenendi = { zaman: simdi, engellendi: Boolean(r2.engel) };
    if (r2.engel) await kartGonder(env, tg, rec, "Hemra (kural 43 denemesi)", await _rk.koordinatorId(env, simdi), `🧪 DENEME — aynı modele ikinci repete denendi:\n${r2.metin.replace(DENEME, "")}`, null, simdi);
    await rkYaz(env, rec);
  }
}
// Yapamam: Fuat'a sadece "Tamam, teşekkürler" (soru yok); Hemra'ya bilgi; Patron'a mesaj YOK; kayıt beklemede (kapanmaz, kural 43 kilitlemez)
async function fuatYapamam(env, tg, rec, { kim, dugme = null, yazi = null }, simdi) {
  Object.assign(rec, { durum: "beklemede", donZaman: null, fuat: { kim, zaman: simdi, yapamam: true, dugme, yazi }, beklemeZaman: simdi });
  await kartDuzenle(env, tg, rec, "Fuat", rec.mesajlar.fuat, `${fuatMetni(rec)}\n\n❌ Yapamam`, null, simdi);
  const r = await tg(env, "sendMessage", { chat_id: await ureticiId(env, rec), text: `${D(rec)}Tamam, teşekkürler.` });
  kanit(rec, ureticiAd(rec), r, "Tamam, teşekkürler.", null, simdi);
  await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), `${D(rec)}${baslik(rec)}: Fuat "yapamam" dedi. Kayıt beklemede; yeniden sormak için bana yazın: "${rec.kod} repete tekrar aç"`, null, simdi);
  return rkYaz(env, rec);
}

// ---------- 5) Fuat'ın yazısı: "3419 onaylıyorum 10 gün" / "3419 yapamam" ----------
export function fuatYaziCoz(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr").trim();
  const yapamam = /(^|[^\p{L}])yapama/u.test(t);
  // 16 Kasım (denetim, kural 36): "onaylıyorum" ya da gün sayısıyla birlikte "tamam / olur / yaparım" ("3419 tamam 10 gün") onaydır
  const onay = /(^|[^\p{L}])onayl/u.test(t) || (/(^|[^\p{L}])(tamam|olur|yapar[ıi]m|yapaca[ğg][ıi]m)(?![\p{L}])/u.test(t) && /\d{1,2}\s*g[üu]n/.test(t));
  if (!onay && !yapamam) return null;
  const gm = t.match(/(\d{1,2})\s*g[üu]n/);
  const kalan = gm ? t.replace(gm[0], " ") : t;
  const km = kalan.match(new RegExp(`(?:^|[^\\p{L}\\d])${KOD_KALIP}(?![\\d])`, "u"));
  return { tur: yapamam && !onay ? "yapamam" : "onay", gun: gm ? Number(gm[1]) : null, kod: km ? km[1].toLocaleUpperCase("tr") : null };
}
export async function rkYazi(env, m, tg, simdi) {
  if (!m || !m.from) return false;
  const celalId = await ureticiId(env, { uretici: "celal" });
  if (String(m.from.id) !== fuatId(env) && String(m.from.id) !== celalId) return false;
  const benim = (r) => String(m.from.id) === (r.uretici === "celal" ? celalId : fuatId(env)); // Fuat sadece kendi, Celal sadece kendi repetesine yazar
  const metin = String(m.text || "").trim();
  if (!metin || metin.startsWith("/")) return false;
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  const kim = _rk.kisiAd(m.from);
  const c = fuatYaziCoz(metin);
  if (!c) return false;
  const acik = await acikKayitlar(env);
  const bekleyen = acik.filter((r) => r.durum === "fuat" && benim(r));
  let rec = c.kod ? bekleyen.find((r) => ayniKod(r.kod, c.kod)) : null;
  if (!rec && c.kod) {
    const kayitli = acik.find((r) => ayniKod(r.kod, c.kod) && r.durum === "acik" && benim(r));
    if (kayitli) { await yaz(`${D(kayitli)}✅ ${kayitli.kod} repetesi zaten kayıtlı: teslim ${gunGoster(kayitli.teslim)}.`); return true; }
    // kartı olmayan model: not alınır, Hemra'ya iletilir — "bu bot sadece eksik listesi gönderir" DENMEZ
    await yaz(`✅ Not alındı: ${c.kod}${c.tur === "onay" ? (c.gun ? ` — ${c.gun} gün` : " — onay") : " — yapamam"}. Bu model için bekleyen repete kartı yok; Hemra'ya iletildi.`);
    await tg(env, "sendMessage", { chat_id: await _rk.koordinatorId(env, simdi), text: `✍️ ${kim} yazdı: "${metin.slice(0, 300)}"\n${c.kod} için bekleyen repete kartı yok; kontrol eder misiniz?` });
    return true;
  }
  if (!rec) {
    if (!bekleyen.length) return false;
    if (bekleyen.length > 1) { await yaz(`Hangi model için? Örnek: ${bekleyen[0].kod} onaylıyorum 10 gün`); return true; }
    rec = bekleyen[0];
  }
  if (c.tur === "yapamam") { await fuatYapamam(env, tg, rec, { kim, yazi: metin }, simdi); return true; }
  if (!c.gun || c.gun < 1 || c.gun > 90) { await yaz(`${D(rec)}Kaç günde hazır olur? Örnek: ${rec.kod} onaylıyorum 10 gün`); return true; }
  await fuatOnay(env, tg, rec, { kim, gun: c.gun, yazi: metin }, simdi);
  await yaz(`${D(rec)}✅ Kaydedildi: ${rec.kod} · ${c.gun} gün · teslim ${gunGoster(rec.teslim)}`);
  return true;
}
// Hemra (ve yetkililer) Sami'ye: "3419 repete tekrar aç" · [✏️ Dağılımı değiştir]'den sonra dağılım yazısı
export async function rkHemraYazi(env, m, tg, simdi) {
  if (!m || !m.from) return false;
  const metin = String(m.text || "").trim();
  if (!metin) return false;
  const yetkili = [sorumlu(env), ilk(env.BR_SORUMLU), ilk(env.HEMRA_ID)].filter(Boolean).includes(String(m.from.id)) || muratMi(env, m.from.id);
  if (!yetkili) return false;
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  const ta = metin.match(new RegExp(`^\\s*${KOD_KALIP}\\s+repete(?:yi|sini)?\\s+tekrar\\s+a[çc]`, "i"));
  if (ta) { const r = await tekrarAc(env, tg, ta[1], _rk.kisiAd(m.from), simdi); await yaz(r.metin); return true; }
  const kisi = String(m.from.id);
  const iptalYetkili = [sorumlu(env), ilk(env.HEMRA_ID)].filter(Boolean).includes(kisi) || muratMi(env, m.from.id); // 16 Kasım (Patron): iptal sadece Hemra ve Patron
  const acik = await acikKayitlar(env);
  // 16 Kasım (Patron): "Şunu anladım … Doğru mu?" bekleyen dağılım — yazıyla "evet" de onaydır
  const onayda = acik.filter((x) => x.onayBekleyen && x.onayBekleyen.kisi === kisi).sort((a, b) => b.onayBekleyen.zaman - a.onayBekleyen.zaman)[0];
  if (onayda && evetMi(metin)) { await dagilimOnayla(env, tg, onayda, m.from, m.chat.id, simdi); return true; }
  const yeniBek = await env.KAYIT.get(`rkYeni:${kisi}`, "json").catch(() => null);
  if (yeniBek && evetMi(metin)) { await yeniRepeteOnayla(env, tg, kisi, _rk.kisiAd(m.from), m.chat.id, simdi); return true; }
  // 16 Kasım (Patron): "hayır / yanlış / iptal" → son işlem GERİ ALINIR, kart gönderilmez ("iptal" + yetki → açık repete iptal)
  if (retMi(metin)) {
    if (yeniBek) { await env.KAYIT.delete(`rkYeni:${kisi}`).catch(() => null); await yaz(`↩️ ${yeniBek.kod} için yeni repete isteği geri alındı. Hiçbir şey gönderilmedi.`); return true; }
    const kodlar = modelKodlari(metin);
    const son = (x) => Math.max(Number(x.onayBekleyen && x.onayBekleyen.zaman) || 0, Number(x.dagilimZaman) || 0, x.durum === "hemra" ? Number(x.zaman) || 0 : 0);
    const adaylar = acik.filter((x) => ["hemra", "patron"].includes(x.durum) && (!kodlar.length || kodlar.includes(String(x.kod)))
      && ((x.onayBekleyen && x.onayBekleyen.kisi === kisi) || (x.dagilimKisi && x.dagilimKisi === kisi) || (x.mesajlar && x.mesajlar.hemra && String(x.mesajlar.hemra[0]) === String(m.chat.id)))).sort((a, b) => son(b) - son(a));
    const hedef = adaylar[0];
    if (iptalMi(metin) && kodlar.length) { // "3627 iptal" — kod yazıldıysa o modelin açık repetesi
      const rx = acik.find((x) => kodlar.includes(String(x.kod)) && ACIK.includes(x.durum) && !x.deneme);
      if (rx) { await yaz(await repeteIptal(env, tg, rx, _rk.kisiAd(m.from), iptalYetkili, simdi)); return true; }
    }
    if (!hedef) return false; // repete işi yok → "hayır" başka işin cevabıdır (eksik listesi, sohbet); burada yutulmaz
    if (iptalMi(metin)) { await yaz(await repeteIptal(env, tg, hedef, _rk.kisiAd(m.from), iptalYetkili, simdi)); return true; }
    await yaz(await geriAl(env, tg, hedef, kisi, simdi));
    return true;
  }
  // 12 Kasım (Patron): Sami dağılım BEKLERKEN o kişinin yazdığı her mesaj o karta gider (düğmeye basmadan yazsa da; başka işe / sohbet beynine gitmez).
  // Bekleme: "✏️ Dağılımı değiştir"e basıldı YA DA bu kişide dağılımı henüz yazılmamış açık repete kartı var.
  const st = await env.KAYIT.get(`rkDagilim:${m.from.id}`, "json").catch(() => null);
  let rec = st ? await rkOku(env, st.id) : null;
  if (rec && rec.durum !== "hemra") { rec = null; await env.KAYIT.delete(`rkDagilim:${m.from.id}`).catch(() => null); }
  const kodlar = modelKodlari(metin);
  if (!rec) {
    const bekleyen = acik.filter((x) => x.durum === "hemra" && !x.dagilim && x.mesajlar && x.mesajlar.hemra && String(x.mesajlar.hemra[0]) === String(m.chat.id));
    const yazilan = bekleyen.filter((x) => kodlar.includes(String(x.kod)) || new RegExp(`(?<![\\p{L}\\d])${String(x.kod).replace(/[^\p{L}\d-]/gu, "")}(?![\\d])`, "iu").test(metin));
    if (!bekleyen.length || (kodlar.length && !yazilan.length)) {
      // 16 Kasım (Patron): "3627 repete siyah büyük 40" — açık kartı olmayan modele YENİ repete isteği → "Şunu anladım … Doğru mu?" → Patron'un onayı
      const yeni = metin.match(/^\s*(\d{3,6})\s+repete(?:si|yi|sini)?\b(.*)$/iu);
      if (yeni) { await yeniRepeteIstek(env, tg, yeni[1], yeni[2], m, simdi); return true; }
      if (!bekleyen.length) return false;
    }
    if (bekleyen.length > 1 && yazilan.length !== 1) { await yaz(`Hangi model için: ${bekleyen.map((x) => x.kod).join(", ")}?`); return true; }
    rec = yazilan[0] || bekleyen[0];
  }
  // 16 Kasım (Patron): dağılım beklenirken gelen mesajda FARKLI model kodu varsa AÇIK KARTA BAĞLANMAZ (3583 / 3627 olayı)
  const baska = kodlar.filter((k) => k !== String(rec.kod));
  if (baska.length && !kodlar.includes(String(rec.kod))) {
    const r2 = acik.find((x) => x.durum === "hemra" && !x.dagilim && String(x.kod) === baska[0] && x.mesajlar && x.mesajlar.hemra && String(x.mesajlar.hemra[0]) === String(m.chat.id));
    if (r2) rec = r2; // o modelin kendi açık kartı varsa ona bağlanır
    else {
      if (/repete/iu.test(metin)) { await yeniRepeteIstek(env, tg, baska[0], metin.replace(new RegExp(`^.*?${baska[0]}\\s*(repete(?:si|yi|sini)?)?`, "iu"), ""), m, simdi); return true; }
      // dağılıma benzemeyen yazı ("3394 tamam" gibi) başka işin cevabıdır (eksik listesi) → burada YUTULMAZ, sıradaki işe gider
      if (!dagilimAnaliz(metin, baska[0]).d) return false;
      await yaz(`${D(rec)}Bu mesajda ${baska[0]} yazıyor ama dağılımı beklenen kart ${rec.kod} için; bu mesaj ${rec.kod}'e yazılmadı. ${rec.kod}'ün dağılımını yazın; ${baska[0]} için yeni repete istiyorsanız "${baska[0]} repete …" diye yazın.`);
      return true;
    }
  }
  const a = dagilimAnaliz(metin, rec.kod);
  if (!a.d) {
    if (metin.startsWith("/") && !a.gorulen) return false; // gerçek komut (/start, /yardim …) — dağılım değil
    await yaz(`${D(rec)}${rec.kod}: ${eksikCumlesi(a.eksik)}`); // neyin eksik olduğu, tek cümle (örnek kalıp yok)
    return true;
  }
  await dagilimSor(env, tg, rec, a.d, metin, m.from, m.chat.id, simdi);
  return true;
}
// 16 Kasım (Patron): fabrikaya gidecek dağılım ÖNCE kişiye tek satır sorulur: "Şunu anladım: 3627 · siyah · büyük · 40 adet. Doğru mu?"
// "Evet" gelmeden karta yazılmaz, kart gitmez. Renk / beden kayıtta yoksa (kural 87) hiç sorulmadan geri çevrilir. Satış 0 ve
// 10'dan az / 200'den fazla adet (kural 29) satırın altında uyarı olarak yazılır; "evet" bu uyarılara da onaydır.
async function dagilimSor(env, tg, rec, d, metin, kimden, sohbet, simdi) {
  const u = !denemeKaydiMi(rec) && !rec.test ? uyumKontrol(d, await uyumKaydi(rec.kod, uyumKaynaklari(env, simdi)).catch(() => ({ renkler: [], bedenler: null }))) : { ok: true, sorun: [] };
  if (!u.ok) {
    await env.KAYIT.put(`rkDagilim:${kimden.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
    await tg(env, "sendMessage", { chat_id: sohbet, text: `${D(rec)}⚠️ ${rec.kod}: renk/beden uyuşmuyor — ${u.sorun.join("; ")}. Kaydedilmedi; doğru dağılımı yazın.` });
    return null;
  }
  const n = dagilimAdet(d), uyari = [];
  if (!(Number(rec.satis7) > 0) && rec.satis7 != null) uyari.push(`${rec.kod} son 7 günde satmadı — yine de repete?`);
  if (n < ADET_SOR_ALT || n > ADET_SOR_UST) uyari.push(`${n} adet yazdınız (${n < ADET_SOR_ALT ? `${ADET_SOR_ALT}'dan az` : `${ADET_SOR_UST}'den fazla`}) — doğru mu?`);
  rec.onayBekleyen = { d, metin: String(metin).slice(0, 300), zaman: simdi, kisi: String(kimden.id), uyari: uyari.length > 0 };
  await env.KAYIT.put(`rkDagilim:${kimden.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
  const r = await tg(env, "sendMessage", { chat_id: sohbet, text: `${D(rec)}${anladimSatiri(rec.kod, d, uyari)}`, reply_markup: { inline_keyboard: [[{ text: "✅ Evet", callback_data: `rk:ev:${rec.id}` }, { text: "❌ Hayır", callback_data: `rk:hy:${rec.id}` }]] } });
  kanit(rec, "Hemra", r, "", null, simdi);
  rec.onayBekleyen.mesaj = r && r.ok && r.result ? [String(sohbet), r.result.message_id] : null;
  await rkYaz(env, rec);
  return r;
}
async function dagilimOnayla(env, tg, rec, kimden, sohbet, simdi) {
  const o = rec.onayBekleyen;
  if (!o) return null;
  Object.assign(rec, { dagilimMetin: o.metin, dagilimZaman: simdi, dagilimKisi: String(kimden.id), dagilimKim: _rk.kisiAd(kimden), satisOnay: Boolean(rec.satisOnay || o.uyari), onayBekleyen: null });
  if (o.mesaj) await tg(env, "editMessageText", { chat_id: o.mesaj[0], message_id: o.mesaj[1], text: `${D(rec)}✅ ${anladimSatiri(rec.kod, o.d).replace(/ Doğru mu\?$/, "")} — ${_rk.kisiAd(kimden)} "evet" dedi.` }).catch(() => null);
  return dagilimiYaz(env, tg, rec, o.d, kimden.id, sohbet, simdi);
}
// "Hayır / yanlış": son işlem geri alınır — onay bekleyen dağılım silinir; karta yazılmış (henüz gitmemiş) dağılım boşaltılır
async function geriAl(env, tg, rec, kisi, simdi) {
  rec.hayirZaman = simdi;
  if (rec.onayBekleyen) {
    const o = rec.onayBekleyen; rec.onayBekleyen = null;
    if (o.mesaj) await tg(env, "editMessageText", { chat_id: o.mesaj[0], message_id: o.mesaj[1], text: `${D(rec)}↩️ ${rec.kod}: "${dagilimYazi(o.d)}" geri alındı.` }).catch(() => null);
    await env.KAYIT.put(`rkDagilim:${kisi}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
    await rkYaz(env, rec);
    return `${D(rec)}↩️ ${rec.kod}: anladığım dağılım (${dagilimYazi(o.d)}) geri alındı, kayda geçmedi, kart gönderilmedi. Doğru dağılımı yazın.`;
  }
  if (rec.durum === "hemra" && rec.dagilim) {
    const eski = dagilimYazi(rec.dagilim);
    Object.assign(rec, { dagilim: null, adet: 0, dagilimMetin: null });
    await env.KAYIT.put(`rkDagilim:${kisi}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
    if (rec.mesajlar.hemra) await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, hemraTaban(rec), hemraKlavye(rec), simdi);
    await rkYaz(env, rec);
    return `${D(rec)}↩️ ${rec.kod}: dağılım (${eski}) geri alındı, kart gönderilmedi. Doğru dağılımı yazın ya da "iptal" yazın.`;
  }
  if (rec.durum === "patron") { await rkYaz(env, rec); return `${D(rec)}${rec.kod} repetesi Patron'un onayında; geri almak için "iptal" yazın.`; }
  await rkYaz(env, rec);
  return `${D(rec)}${rec.kod}: geri alınacak bir şey yok.`;
}
// 16 Kasım (Patron): açık repete İPTALİ — sadece Hemra ve Patron. Hemra / Patron onayındaki repete hemen kapanır; fabrikaya gitmiş
// repete için fabrikaya kendiliğinden hiçbir şey gitmez, Patron'a tek satır sorulur.
export async function repeteIptal(env, tg, rec, kim, yetkili, simdi) {
  if (!yetkili) return `${D(rec)}Repete iptalini sadece Hemra ve Patron yapabilir.`;
  if (["hemra", "patron", "beklemede"].includes(rec.durum)) { // beklemede: Fuat "yapamam" dedi ya da kart tek kapıda durdu — fabrikada iş yok
    const once = rec.durum;
    Object.assign(rec, { durum: "iptal", kapandi: simdi, iptal: { kim, zaman: simdi }, onayBekleyen: null });
    if (rec.mesajlar.hemra) await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n❌ ${kim} iptal etti. Repete açılmadı.`, null, simdi);
    if (once === "patron") await kuyruk(env, "rkSonuc", { id: `${rec.id}:i${simdi}`, rid: rec.id, metin: `${DK(rec)}↩️ ${rec.kod} repete isteği ${kim} tarafından iptal edildi; onay kartı geçersiz.` });
    await rkYaz(env, rec);
    return `${D(rec)}❌ ${rec.kod} repetesi iptal edildi (${kim}). Fabrikaya hiçbir şey gitmedi.`;
  }
  if (["fuat", "acik"].includes(rec.durum)) {
    await kuyruk(env, "rkSonuc", { id: `${rec.id}:ii${simdi}`, rid: rec.id, metin: yonelt(rec, `${DK(rec)}⚠️ ${kim} ${rec.kod} repetesini iptal etmek istiyor; kart Fuat'ta (${durumYazi(rec)}). Fabrikaya iptal gitsin mi? (Sami kendiliğinden göndermedi)`) });
    return yonelt(rec, `${D(rec)}${rec.kod} repete kartı Fuat'ta; fabrikaya kendiliğinden iptal gönderilmez. Patron'a sordum.`);
  }
  return `${D(rec)}${rec.kod} repetesi zaten kapalı (${rec.durum}).`;
}
// 16 Kasım (Patron): Sami'nin beyni açık repeteleri GÖRÜR ve (sadece Hemra / Patron isterse) İPTAL eder
export async function acikRepeteListesi(env) {
  return (await acikKayitlar(env)).filter((r) => IZLENEN.includes(r.durum) && !r.test).map((r) => ({ kod: r.kod, marka: _rk.magazaAdi(r.magaza), uretici: ureticiAd(r), durum: durumYazi(r),
    dagilim: Array.isArray(r.dagilim) && r.dagilim.length ? dagilimYazi(r.dagilim) : "yazılmadı", adet: r.adet || 0, deneme: Boolean(r.deneme || r.mod), teslim: r.teslim ? gunGoster(r.teslim) : null }));
}
export async function repeteIptalKod(env, tg, kod, kim, yetkili, simdi) {
  const l = (await acikKayitlar(env)).filter((r) => ayniKod(r.kod, kod) && IZLENEN.includes(r.durum) && !r.test);
  if (!l.length) return `${String(kod).toLocaleUpperCase("tr")} için açık repete yok.`;
  const out = [];
  for (const r of l) out.push(await repeteIptal(env, tg, r, kim, yetkili, simdi));
  return out.join("\n");
}
// 16 Kasım (Patron): açık kartı olmayan modele yazıyla repete isteği ("3627 repete siyah büyük 40") → Şunu anladım … Doğru mu? → Patron'un onayı
async function yeniRepeteIstek(env, tg, kod, kalan, m, simdi) {
  const yaz = (text, kl = null) => tg(env, "sendMessage", { chat_id: m.chat.id, text, ...(kl ? { reply_markup: kl } : {}) });
  const engel = await acikRepete(env, kod, { deneme: false, mod: false });
  if (engel) return yaz(engelMetni(engel));
  const bilgi = await stokIste(env, "/bilgi", { kod }).catch(() => null);
  if (!bilgi || !(bilgi.satirlar || []).length) return yaz(`${kod} Vegawin'de yok; repete açılmadı.`);
  const a = dagilimAnaliz(kalan, kod);
  if (!a.d) return yaz(`${kod} repete: ${eksikCumlesi(a.eksik)} Örnek: "${kod} repete siyah büyük 40".`);
  const u = uyumKontrol(a.d, await uyumKaydi(kod, uyumKaynaklari(env, simdi)).catch(() => ({ renkler: [], bedenler: null })));
  if (!u.ok) return yaz(`⚠️ ${kod}: renk/beden uyuşmuyor — ${u.sorun.join("; ")}. Kaydedilmedi; doğru dağılımı yazın.`);
  const donem = await stokIste(env, "/satis-donem", { basla: gunA(simdi - 7 * GUN), bitis: gunA(simdi) }).catch(() => ({}));
  const s7 = Number((donem || {})[kod]) || 0, n = dagilimAdet(a.d), uyari = [];
  if (!s7) uyari.push(`${kod} son 7 günde satmadı — yine de repete?`);
  if (n < ADET_SOR_ALT || n > ADET_SOR_UST) uyari.push(`${n} adet yazdınız (${n < ADET_SOR_ALT ? `${ADET_SOR_ALT}'dan az` : `${ADET_SOR_UST}'den fazla`}) — doğru mu?`);
  await env.KAYIT.put(`rkYeni:${m.from.id}`, JSON.stringify({ kod, d: a.d, metin: String(m.text || "").slice(0, 300), zaman: simdi }), { expirationTtl: 7200 }).catch(() => null);
  return yaz(`${anladimSatiri(kod, a.d, uyari).replace(/^Şunu anladım: /, "Şunu anladım: YENİ repete · ")}`, { inline_keyboard: [[{ text: "✅ Evet", callback_data: `rk:yv:${m.from.id}` }, { text: "❌ Hayır", callback_data: `rk:yh:${m.from.id}` }]] });
}
async function yeniRepeteOnayla(env, tg, kisi, kimAd, sohbet, simdi) {
  const y = await env.KAYIT.get(`rkYeni:${kisi}`, "json").catch(() => null);
  if (!y) return tg(env, "sendMessage", { chat_id: sohbet, text: "Bu istek artık geçerli değil." });
  await env.KAYIT.delete(`rkYeni:${kisi}`).catch(() => null);
  const r = await patronaRepeteAc(env, tg, { kod: y.kod, dagilim: y.d, kim: kimAd, kisi, kaynak: "hemra-yazi", metin: y.metin, satisOnay: true }, simdi);
  return tg(env, "sendMessage", { chat_id: sohbet, text: r.engel ? r.metin : r.hata ? `⚠️ ${y.kod}: ${r.hata}` : `✅ ${y.kod} repete isteği (${dagilimYazi(y.d)}) Patron'un onayına gitti. Patron onaylamadan fabrikaya gitmez.` });
}
// Patron'un onayına giden repete (Hemra kartı yok): kayıt "patron" durumunda açılır, Venom'a Patron kartı (rkOneri) gider.
// Venom kontrolü (kod, renk / beden) Patron kartından ÖNCE — uyuşmazsa Patron'a da gitmez.
export async function patronaRepeteAc(env, tg, { kod, dagilim, kim = "Patron", kisi = null, kaynak = "patron-emri", metin = null, satisOnay = false }, simdi) {
  kod = String(kod || "").trim();
  const engel = await acikRepete(env, kod, { deneme: false, mod: false });
  if (engel) return { engel, metin: engelMetni(engel) };
  const bilgi = await stokIste(env, "/bilgi", { kod }).catch(() => null);
  const magazalar = new Set(((bilgi && bilgi.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")));
  if (!magazalar.size) return { hata: `${kod} Vegawin'de yok` };
  const st = (await stokIste(env, "/toplu", { kodlar: [kod] }).catch(() => ({})))[kod];
  const donem = await stokIste(env, "/satis-donem", { basla: gunA(simdi - 7 * GUN), bitis: gunA(simdi) }).catch(() => ({}));
  const ted = await stokIste(env, "/tedarikci", { kodlar: [kod] }).catch(() => null); // kural 31: okunamazsa "Fuat" varsayılmaz
  if (!(ted && typeof ted === "object")) return { hata: `${kod}: üretici (Fuat mı Celal mi) okunamadı — repete açılmadı, yeniden deneyin` };
  if (magazalar.size > 1) return { hata: `${kod} iki mağazada da kayıtlı — marka belli değil (kural 23: tahmin edilmez), repete açılmadı` };
  const uretici = (ted[kod] || {}).tedarikci === "CELAL" ? "celal" : "fuat";
  const rec = { id: yeniId(kod, false, simdi), kod, uretici, magaza: magazalar.has("BLACKROSE") ? "BLACKROSE" : "VOLONTE", deneme: false, test: false, kaynak,
    dagilim, adet: dagilimAdet(dagilim), kalan: st ? Math.max(0, Number(st.toplam) || 0) : 0, satis7: Number((donem || {})[kod]) || 0, durum: "patron", zaman: simdi, mesajlar: {}, kanit: [],
    dagilimMetin: metin, dagilimZaman: simdi, dagilimKisi: kisi, dagilimKim: kim, satisOnay: Boolean(satisOnay), hemra: { kim, zaman: simdi } };
  rec.bitisGun = rec.satis7 > 0 ? Math.max(1, Math.ceil(rec.kalan / (rec.satis7 / 7))) : null;
  const k = await venomKontrol(env, { kod, tur: "repete", dagilim, satis7: null, kaynakMetin: metin, kaynakZaman: simdi, kim }, simdi); // satış 0 uyarısı Patron kartında yazar; Patron onayı = karar
  rec.kontrol = { zaman: simdi, ok: k.ok, sorun: k.sorun, kim: k.kim };
  if (!k.ok) return { hata: `Venom kontrolü durdurdu: ${k.sorun.join("; ")}` };
  await kuyruk(env, "rkOneri", { id: `${rec.id}:o`, rid: rec.id, kod: rec.kod, uretici: ureticiAd(rec), magaza: rec.magaza, deneme: false, mod: false, dagilim: dagilimYazi(rec.dagilim), adet: rec.adet, kalan: rec.kalan, satis7: rec.satis7, bitisGun: rec.bitisGun, hemra: kim, foto: await fotoAdresi(env, rec), zaman: simdi });
  await rkYaz(env, rec);
  return { rec };
}
// Yazılan dağılımı karta işler (Hemra'nın kartı güncellenir; sonraki adım karttaki gönder düğmesi)
async function dagilimiYaz(env, tg, rec, d, kisiId, sohbet, simdi) {
  Object.assign(rec, { dagilim: d, adet: dagilimAdet(d), adetBekleyen: null });
  await env.KAYIT.delete(`rkDagilim:${kisiId}`).catch(() => null);
  await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, hemraTaban(rec), hemraKlavye(rec), simdi);
  await rkYaz(env, rec);
  await tg(env, "sendMessage", { chat_id: sohbet, text: `${D(rec)}✅ ${rec.kod} dağılımı: ${dagilimSatiri(rec)}. Karttaki "${gonderDugme(rec)}"e basın.` });
}

// ---------- 6) kapanış: mal geldi ----------
async function kapat(env, tg, rec, neden, simdi) {
  Object.assign(rec, { durum: "geldi", geldiZaman: simdi, geldiNeden: neden, kapandi: simdi });
  const bilgi = `${D(rec)}📦 ${rec.kod} repete geldi (${neden}). Repete kaydı kapandı.`;
  if (tg) await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), bilgi, null, simdi);
  await kuyruk(env, "rkSonuc", { id: `${rec.id}:g`, rid: rec.id, metin: bilgi, biriktir: true });
  return rkYaz(env, rec);
}
// "3419 geldi" / "3419 repete geldi" (fabrika.js repeteGeldi) → açık gerçek repete kaydı kapanır
export async function rkGeldi(env, kod, kim, simdi, tg = null) {
  const rec = await acikRepete(env, kod, { deneme: false });
  if (rec && rec.durum === "acik") await kapat(env, tg, rec, `${kim} bildirdi`, simdi);
}

// ---------- 7) 5 dakikalık adım: bir kerelik işler, Patron kararları, takip ----------
// Bir kerelik (Claude Code): KV "sami:repeteIslem" = [{tur}] → sonuç "sami:repeteIslemSonuc"
//  deneme {kod, magaza, dagilim, kalan, satis7}: Fuat'a ön haber + Hemra'ya 🧪 öneri kartı · kayitAc {kod, magaza, adet, gun, not}: gerçek açık repete kaydı
//  oku {id?}: kayıtlar (kanıtlarıyla) · engelDene {kod, deneme}: kural 43 (kimseye mesaj gitmez) · temizle: deneme kayıtları silinir, açık deneme kartları kapanır
async function islemler(env, simdi, tg) {
  const l = await env.KAYIT.get("sami:repeteIslem", "json").catch(() => null);
  if (!Array.isArray(l) || !l.length) return;
  await env.KAYIT.delete("sami:repeteIslem");
  const sonuc = [];
  for (const is of l.slice(0, 6)) {
    const s = { tur: is.tur, zaman: simdi };
    try {
      if (is.tur === "deneme") {
        const kod = String(is.kod || "TEST-001");
        const engel = await acikRepete(env, kod, { deneme: true });
        if (engel) { s.engel = engelMetni(engel); sonuc.push(s); continue; }
        const haber = `🧪 DENEME — Bu bir deneme, üretim yapmayın.\nBugün size ${kod} kodlu bir deneme repete kartı gelecek. Düğmeyle ya da yazıyla ("${kod} onaylıyorum 10 gün") cevap verebilirsiniz; hiçbir şey üretilmeyecek.`;
        const hr = await tg(env, "sendMessage", { chat_id: fuatId(env), text: haber });
        s.fuatHaber = { ok: Boolean(hr && hr.ok), mesaj: hr && hr.result ? hr.result.message_id : null, yazi: hr && hr.result ? hr.result.text : haber, hata: hr && !hr.ok ? hr.description : null };
        const r = await oneriAc(env, tg, { kod, magaza: is.magaza || "VOLONTE", dagilim: is.dagilim, deneme: true, test: true, kalan: is.kalan, satis7: is.satis7, ikinciDene: is.ikinciDene !== false, donSn: is.donSn || null }, simdi);
        Object.assign(s, { id: r.rec ? r.rec.id : null, hata: r.hata || null, kanit: r.rec ? r.rec.kanit : null });
        if (r.rec) { r.rec.fuatHaber = s.fuatHaber; await rkYaz(env, r.rec); }
      } else if (is.tur === "kayitAc") { // Patron'un bildirdiği, Fuat'ın zaten onayladığı gerçek repete
        const kod = String(is.kod);
        const engel = await acikRepete(env, kod, { deneme: false });
        if (engel) { s.engel = engelMetni(engel); sonuc.push(s); continue; }
        const st = (await stokIste(env, "/toplu", { kodlar: [kod] }).catch(() => ({})))[kod];
        const rec = { id: yeniId(kod, false, simdi), kod, magaza: is.magaza || "VOLONTE", deneme: false, test: false, dagilim: is.dagilim || null, adet: Number(is.adet), durum: "acik", zaman: simdi,
          kaynak: is.kaynak || "Patron bildirdi", not: is.not || null, fuat: { kim: "Fuat", zaman: simdi, gun: Number(is.gun), kaynak: is.kaynak || "Patron bildirdi" }, teslim: gunA(simdi + Number(is.gun) * GUN),
          stokBas: st ? Number(st.toplam) || 0 : 0, mesajlar: {}, kanit: [], sonucGitti: simdi };
        rec.stokMin = rec.stokBas;
        await rkYaz(env, rec);
        Object.assign(s, { id: rec.id, kayit: ozet(rec), satir: sonucSatiri(rec) });
        if (is.patronaSatir) await kuyruk(env, "rkSonuc", { id: `${rec.id}:s`, rid: rec.id, metin: sonucSatiri(rec) });
      } else if (is.tur === "oku") {
        const ids = is.id ? [is.id] : await ayarOku(env, "rk:hepsi", []);
        s.kayitlar = [];
        for (const id of ids.slice(-20)) { const r = await rkOku(env, id); if (r) s.kayitlar.push({ ...ozet(r), kanit: is.kanit === false ? undefined : r.kanit, fuatHaber: r.fuatHaber || undefined }); }
        s.acik = await ayarOku(env, "rk:acik", []);
      } else if (is.tur === "fuataYeniden") { // Fuat kartı görmüyorsa: eski kart Telegram'da duruyor mu bakılır, sonra kart yeniden gönderilir
        const rec = await rkOku(env, is.id);
        if (!rec || rec.durum !== "fuat") { s.hata = `kayıt ${rec ? rec.durum : "yok"}`; sonuc.push(s); continue; }
        const m = rec.mesajlar.fuat;
        const kontrol = m ? await tg(env, "editMessageReplyMarkup", { chat_id: m[0], message_id: m[1], reply_markup: fuatKlavye(rec) }) : null;
        s.eskiKart = { chat: m && m[0], mesaj: m && m[1], telegram: kontrol ? (kontrol.ok ? "duruyor" : String(kontrol.description || "")) : "kayıt yok" };
        if (m) await kartDuzenle(env, tg, rec, "Fuat", m, `${fuatMetni(rec)}\n\n⏩ Bu kart yenilendi — güncel kart aşağıda.`, null, simdi);
        s.gitti = await fuataGonder(env, tg, rec, simdi, "Fuat (yeniden gönderildi)");
        await rkYaz(env, rec);
        s.kanit = rec.kanit.slice(-2);
      } else if (is.tur === "patronRepete") { // 16 Kasım (Patron): repeteyi aç, kart ÖNCE Patron'a {kod, dagilim: [{renk, buyuk, kucuk}], kim, metin}
        const r = await patronaRepeteAc(env, tg, { kod: is.kod, dagilim: is.dagilim, kim: is.kim || "Patron", kaynak: "patron-emri", metin: is.metin || null, satisOnay: true }, simdi);
        s.sonuc = r.engel ? r.metin : r.hata ? r.hata : { id: r.rec.id, durum: r.rec.durum, magaza: r.rec.magaza, uretici: r.rec.uretici, dagilim: dagilimYazi(r.rec.dagilim), satis7: r.rec.satis7, kontrol: r.rec.kontrol };
      } else if (is.tur === "engelDene") {
        const e = await acikRepete(env, is.kod, { deneme: Boolean(is.deneme) });
        s.engel = e ? engelMetni(e) : null;
      } else if (is.tur === "temizle") {
        s.silinen = await denemeTemizle(env, tg, simdi, () => true);
      }
    } catch (e) { s.hata = String(e && e.message).slice(0, 200); }
    sonuc.push(s);
  }
  const eski = (await env.KAYIT.get("sami:repeteIslemSonuc", "json").catch(() => null)) || [];
  await env.KAYIT.put("sami:repeteIslemSonuc", JSON.stringify([...eski, ...sonuc].slice(-12)), { expirationTtl: 7 * GUN });
}
const ozet = (r) => ({ id: r.id, kod: r.kod, magaza: r.magaza, deneme: r.deneme, durum: r.durum, dagilim: r.dagilim ? dagilimYazi(r.dagilim) : null, adet: r.adet, kalan: r.kalan, satis7: r.satis7, zaman: r.zaman, hemra: r.hemra || null, patron: r.patron || null, fuat: r.fuat || null, teslim: r.teslim || null, kaynak: r.kaynak || null, not: r.not || null, stokBas: r.stokBas ?? null, donZaman: r.donZaman || null, sonraDon: r.sonraDon || null, tekrarAcan: r.tekrarAcan || null, hat1: r.hat1 || null, hat2: r.hat2 || null, hata: r.hata || null, engelDenendi: r.engelDenendi || null, kapandi: r.kapandi || null });
// 13 Kasım (Patron, kural 40): deneme modu repete kayıtları SESSİZCE kapanır (kimseye mesaj gitmez, kartlara dokunulmaz).
// ids verilirse o kayıtlar (geriye dönük: işaretsiz açılmış deneme) 🧪 işaretlenip kapanır; verilmezse "mod" işaretli açık kayıtlar.
export async function modRepeteKapat(env, simdi, ids = null, neden = "deneme bitti") {
  const hedef = ids ? ids.map(String) : await ayarOku(env, "rk:hepsi", []);
  const kapanan = [];
  for (const id of hedef) {
    const r = await rkOku(env, id);
    if (!r || r.kapandi || ["iptal", "red", "geldi"].includes(r.durum) || (!ids && !r.mod)) continue;
    Object.assign(r, { mod: true, durum: "iptal", kapandi: simdi, iptal: { neden, zaman: simdi } });
    await rkYaz(env, r);
    kapanan.push({ id: r.id, kod: r.kod });
  }
  return kapanan;
}
// Deneme kayıtları silinir; cevap bekleyen deneme kartlarının düğmeleri kalkar
export async function denemeTemizle(env, tg, simdi, sec = () => true) {
  const hepsi = await ayarOku(env, "rk:hepsi", []);
  const silinen = [];
  for (const id of hepsi) {
    const r = await rkOku(env, id);
    if (!r || !r.deneme || !sec(r)) continue;
    const kapanis = "🧪 DENEME bitti — bu kart kapandı, kayıt temizlendi.";
    for (const [durum, m] of [["hemra", r.mesajlar && r.mesajlar.hemra], ["fuat", r.mesajlar && r.mesajlar.fuat]]) {
      if (r.durum === durum && m && !(durum === "fuat" && r.donZaman)) await tg(env, m[2] === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: m[0], message_id: m[1], [m[2] === "foto" ? "caption" : "text"]: kapanis, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    }
    await stokIste(env, "/ayar-yaz", { k: `rk:${id}`, v: "null" });
    silinen.push(id);
  }
  if (silinen.length) {
    await ayarYaz(env, "rk:hepsi", hepsi.filter((x) => !silinen.includes(x)));
    await ayarYaz(env, "rk:acik", (await ayarOku(env, "rk:acik", [])).filter((x) => !silinen.includes(x)));
    await kuyruk(env, "rkSonuc", { id: `temizle:${simdi}`, temizle: silinen });
  }
  return silinen;
}

export async function repeteKartAdimi(env, simdi, tg) {
  await islemler(env, simdi, tg);
  const kararlar = await stokIste(env, "/kuyruk-al", { ad: "rkKarar" }).catch(() => []);
  for (const k of Array.isArray(kararlar) ? kararlar : []) await patronKarari(env, tg, k, simdi);
  // Patron'un Venom'dan istediği repete (model kartı, yazıyla istek, eski "bitti" kartı): Hemra'ya dağılım kartı
  const baslat = await stokIste(env, "/kuyruk-al", { ad: "rkBaslat" }).catch(() => []);
  for (const b of Array.isArray(baslat) ? baslat : []) {
    let bilinen = 0;
    for (const kod of (b.kodlar || [b.kod]).map((x) => String(x || "").trim()).filter(Boolean)) {
      const bilgi = await stokIste(env, "/bilgi", { kod }).catch(() => null);
      const magazalar = new Set(((bilgi && bilgi.satirlar) || []).map((x) => x.magaza));
      if (!magazalar.size) continue; // Vegawin'de olmayan sayı (ör. adet) model sayılmaz
      bilinen++;
      // 16 Kasım (denetim, kural 23): iki mağazada da kayıtlı modelde marka TAHMİN EDİLMEZ — kart açılmaz, Patron'a tek satır
      const mz = new Set([...magazalar].map((x) => String(x || "").toUpperCase().replace(/\s+/g, "")));
      if (mz.size > 1) { await kuyruk(env, "rkSonuc", { id: `rb:${kod}:m${simdi}`, rid: `rb-${kod}`, metin: `⚠️ ${kod} repete başlatılmadı: model iki mağazada da kayıtlı, marka belli değil (tahmin etmiyorum). Hangi marka?` }); continue; }
      const r = await oneriAc(env, tg, { kod, magaza: mz.has("BLACKROSE") ? "BLACKROSE" : "VOLONTE", dagilim: _rk.dagilimOner((await ayarOku(env, "fabrika:sonIstek", {}))[kod]), samiOnerisi: true, kaynak: "patron", ...(b.mod ? { mod: true } : {}) }, simdi);
      if (r.engel || r.hata) await kuyruk(env, "rkSonuc", { id: `rb:${kod}:${simdi}`, rid: `rb-${kod}`, metin: r.engel ? r.metin : `⚠️ ${kod} repete başlatılamadı: ${r.hata}` });
    }
    if (!bilinen) await kuyruk(env, "rkSonuc", { id: `rb:yok:${simdi}`, rid: "rb-yok", metin: `⚠️ Repete başlatılamadı: ${(b.kodlar || [b.kod]).join(", ")} Vegawin'de bulunamadı.` });
  }
  const bugun = gunA(simdi);
  for (const rec of await acikKayitlar(env)) {
    let degisti = false;
    if (rec.deneme && simdi - rec.zaman > 3 * GUN) { await denemeTemizle(env, tg, simdi, (r) => r.id === rec.id); continue; } // unutulan deneme 3 günde kendiliğinden silinir
    if (rec.durum === "beklemede") { if (simdi - (rec.beklemeZaman || rec.zaman) > 30 * GUN) { Object.assign(rec, { durum: "kapandi", kapandi: simdi }); await rkYaz(env, rec); } continue; } // 30 gün açılmayan bekleme kapanır
    if (rec.durum === "fuat" && rec.donZaman) { // "2 gün sonra dön": süre dolunca kart Fuat'a yeniden (Hemra'ya sorulmaz)
      if (simdi >= rec.donZaman) { await fuataGonder(env, tg, rec, simdi, "Fuat (2 gün sonra yeniden)"); await rkYaz(env, rec); }
      continue;
    }
    // 16 Kasım (Patron): Venom kontrolünün durdurduğu kartı Hemra 2 saat (mesai) içinde düzeltmediyse Patron'a TEK satır
    if (rec.durum === "hemra" && rec.sorunZaman && !rec.sorunPatron && !rec.dagilim && mesai(simdi) && simdi - rec.sorunZaman >= 2 * 3600) {
      rec.sorunPatron = simdi; degisti = true;
      await kuyruk(env, "rkSonuc", { id: `${rec.id}:s2`, rid: rec.id, metin: yonelt(rec, `${DK(rec)}⚠️ ${rec.kod} repete: kart fabrikaya gitmedi (${rec.sorunMetin || "Venom kontrolü"}); Hemra 2 saattir düzeltmedi.`) });
    }
    // 13 Kasım (Patron, kural 4): repete kartının ayrı 24 saat hatırlatması YOK — her kart gibi tek merdivende (kart-takip.js: 1 saat + 1 saat + Venom)
    if (rec.durum === "acik" && rec.teslim && bugun > rec.teslim && mesai(simdi) && saatI(simdi) >= 10 && !rec.teslimSoruldu) { // teslim günü geçti → Fuat'a sor
      const kl = { inline_keyboard: [[{ text: "🚚 Bugün / yarın geliyor", callback_data: `rk:tg:${rec.id}` }], [{ text: "⏱ 5 gün daha", callback_data: `rk:t5:${rec.id}` }]] };
      rec.mesajlar.teslim = await kartGonder(env, tg, rec, "Fuat (teslim günü geçti)", await ureticiId(env, rec), `${D(rec)}📦 ${rec.kod} repete (${rec.adet} adet) teslim günü ${gunGoster(rec.teslim)} idi. Ne durumda?`, kl, simdi);
      rec.teslimSoruldu = simdi; degisti = true;
    }
    if (rec.durum === "acik" && !rec.deneme && mesai(simdi) && simdi - (rec.stokBakis || 0) >= 3600) { // mal geldi mi: Vegawin stoğu en düşük seviyeden siparişin yarısı kadar arttı
      const st = (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod];
      rec.stokBakis = simdi; degisti = true;
      if (st) {
        const cur = Number(st.toplam) || 0;
        if (cur - (rec.stokMin ?? cur) >= Math.max(8, Math.ceil(rec.adet / 2))) { await kapat(env, tg, rec, `Vegawin stoğu ${rec.stokMin} → ${cur}`, simdi); continue; }
        rec.stokMin = Math.min(rec.stokMin ?? cur, cur);
      }
    }
    if (degisti) await rkYaz(env, rec);
  }
}

export { fuataGonder as _fuataGonder, venomKontrol as fabrikaVenomKontrol }; // 16 Kasım: test (kural 87 kontrolü)
