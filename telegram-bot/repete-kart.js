// REPETE KARTI (11 Kasım, Patron — SON HAL). Kendi kaydı var (StokDO "rk:<id>"): deneme gerçek sipariş kaydına, kanıt defterine,
// "bitenler"e YAZMAZ.
// Akış: Sinem "Bitti" → Hemra kartı [Repete] (fabrika.js) → Hemra dağılımı onaylar ([✅ Patron'a gönder] / [✏️ Dağılımı değiştir]) →
//   Venom → Patron [Onaylıyorum] [Reddediyorum] → Fuat kartı [4-8 gün] [10-15 gün] [2 gün sonra dön] [Yapamam]
//   (yazıyla "3419 onaylıyorum 10 gün" de olur) → kayıt açılır → Venom'dan Patron'a TEK satır:
//   "3419 · 40 adet · Fuat onayladı · teslim: 21.11.2026" (aralıkta teslim = aralığın son günü).
// Dağılımı (renk / beden / adet) biz belirleriz; fabrika değiştirmez. Repete en az 40 adet (kural 28).
// 2 gün sonra dön: kart 2 gün sonra Fuat'a yeniden gider (Hemra'ya sorulmaz).
// Yapamam: Fuat'a sadece "Tamam, teşekkürler"; Hemra'ya bilgi; Patron'a mesaj YOK. Kayıt "beklemede" kalır (kapanmaz, kural 43 kilitlemez);
//   "3419 repete tekrar aç" (Hemra → Sami, Patron → Venom) kartı Fuat'a yeniden gönderir.
// KURAL 43: açık repete varken (mal gelmeden) aynı modele yeni repete verilmez.
// Takip: Fuat 24 saat cevap vermezse önce Fuat'a, 24 saat sonra Hemra'ya hatırlatma (ekip mesajları hep Sami'den gider);
//   teslim günü geçince Fuat'a sorulur; mal gelince (Vegawin stoğu artınca ya da "3419 geldi" yazılınca) kayıt kendiliğinden kapanır.
// Kuyruklar (StokDO): "rkOneri" Sami → Venom (Patron kartı) · "rkKarar" Venom → Sami (onay / red / tekrarAc) · "rkBaslat" Venom → Sami
//   (Patron'un istediği repete: Hemra'ya dağılım kartı) · "rkSonuc" Sami → Venom (Patron'a tek satır / biriken bilgi).
import { stokIste } from "./stokbot.js";
import { fuatSuzgec } from "./mutabakat.js";
import { REPETE_EN_AZ } from "./repete-rapor.js";
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
const D = (rec) => (rec.deneme ? DENEME : "");
const DK = (rec) => (rec.deneme ? "🧪 DENEME — " : "");
const ACIK = ["hemra", "patron", "fuat", "acik"]; // kural 43: bu durumlarda aynı modele yeni repete yok ("beklemede" kilitlemez)
const IZLENEN = [...ACIK, "beklemede"];
export const TEST_RESIM_YOLU = "/test-resim.jpg";
export const DON_SN = 2 * GUN; // "2 gün sonra dön"
const KOD_KALIP = "(test-\\d+|\\d{3,6})";

export const dagilimAdet = (d) => (d || []).reduce((t, x) => t + (Number(x.buyuk) || 0) + (Number(x.kucuk) || 0), 0);
// "beyaz · büyük 20, küçük 20" (birden çok renk " / " ile)
export const dagilimYazi = (d) => (d || []).map((x) => `${x.renk} · ${[x.buyuk ? `büyük ${x.buyuk}` : null, x.kucuk ? `küçük ${x.kucuk}` : null].filter(Boolean).join(", ")}`).join(" / ");
// Hemra'nın yazdığı dağılım: "beyaz büyük 20 küçük 20, siyah büyük 8" · "büyük beyaz 20 küçük beyaz 20" (sıra serbest) → [{renk, buyuk, kucuk}] | null
export function dagilimCoz(metin) {
  const kel = String(metin || "").toLocaleLowerCase("tr").replace(/[,;:·/]+/g, " ").split(/\s+/).filter(Boolean);
  const m = new Map();
  let renk = [], beden = null, renkTamam = false;
  for (const w of kel) {
    if (new RegExp(`^${KOD_KALIP}$`, "i").test(w) && !/^\d{1,2}$/.test(w) && !m.size && !renk.length && beden == null) continue; // baştaki model kodu
    if (/^(adet|tane|ad|seri|toplam)$/.test(w)) continue;
    const b = /^(b[üu]y[üu]k(ten)?|buyuk|uly|b)$/.test(w) ? "buyuk" : /^(k[üu][çc][üu]k(ten)?|kucuk|ki[çc]i|k)$/.test(w) ? "kucuk" : null;
    if (b) { beden = b; continue; }
    if (/^\d{1,3}$/.test(w)) {
      if (!renk.length || !beden) return null;
      const r = renk.join(" ");
      const x = m.get(r) || { renk: r, buyuk: 0, kucuk: 0 };
      x[beden] += Number(w); m.set(r, x);
      renkTamam = true; beden = null;
      continue;
    }
    if (!/^\p{L}+$/u.test(w)) return null;
    if (renkTamam) { renk = []; renkTamam = false; }
    renk.push(w);
  }
  const l = [...m.values()].filter((x) => x.buyuk + x.kucuk > 0);
  return l.length ? l : null;
}
export const durumYazi = (rec) => ({ hemra: "Hemra'nın onayında", patron: "Patron'un onayında", fuat: "Fuat'ın cevabı bekleniyor", acik: `Fuat onayladı, teslim ${gunGoster(rec.teslim)}`, beklemede: "Fuat yapamam dedi, beklemede" }[rec.durum] || rec.durum);
export const engelMetni = (rec) => `${D(rec)}⛔ ${rec.kod} için açık repete var (${durumYazi(rec)}). Mal gelmeden yeni repete verilmez.`;
export const sonucSatiri = (rec) => `${DK(rec)}${rec.kod} · ${rec.adet} adet · Fuat onayladı · teslim: ${gunGoster(rec.teslim)}`;
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
export async function acikRepete(env, kod, { deneme = false } = {}) {
  if (!String(kod || "").trim()) return null;
  return (await acikKayitlar(env)).find((r) => ayniKod(r.kod, kod) && ACIK.includes(r.durum) && Boolean(r.deneme) === Boolean(deneme)) || null;
}

// ---------- gönderim (her mesajın Telegram'dan dönen hali kayda: rec.kanit) ----------
const dugmeYazi = (rm) => ((rm && rm.inline_keyboard) || []).map((s) => s.map((b) => b.text));
function kanit(rec, kime, r, metin, kl, simdi) {
  const m = r && r.ok && r.result && typeof r.result === "object" ? r.result : null;
  rec.kanit = [...(rec.kanit || []), { zaman: simdi, kime, ok: Boolean(r && r.ok), mesaj: m ? m.message_id : null, resim: Boolean(m && m.photo && m.photo.length), yazi: String((m && (m.caption || m.text)) || metin).slice(0, 900), dugmeler: dugmeYazi((m && m.reply_markup) || kl), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null }].slice(-60);
}
async function kartGonder(env, tg, rec, kime, chat, metin, kl, simdi, foto = null) {
  let r = foto ? await tg(env, "sendPhoto", { chat_id: chat, photo: foto, caption: metin, ...(kl ? { reply_markup: kl } : {}) }) : null;
  if (!(r && r.ok)) r = await tg(env, "sendMessage", { chat_id: chat, text: metin, ...(kl ? { reply_markup: kl } : {}) });
  kanit(rec, kime, r, metin, kl, simdi);
  return r && r.ok ? [String(chat), r.result.message_id, r.result.photo ? "foto" : "yazi"] : null;
}
async function kartDuzenle(env, tg, rec, kime, m, metin, kl, simdi) {
  if (!m) return null;
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
    `Satış hızı: son 7 günde ${rec.satis7} adet${rec.bitisGun ? ` · bu hızla ~${rec.bitisGun} günde biter` : ""}`,
    `Önerilen repete: ${dagilimSatiri(rec)}`].join("\n");
}
// Hemra'nın kartının (dağılım onayı aşamasındaki) tam yazısı: "bitti" kartından geldiyse o kartın yazısı korunur
const hemraTaban = (rec, kim = null) => (rec.hemraKart ? `${rec.hemraKart}\n\n🔁 ${kim || (rec.hemraSecen || "Hemra")}: Repete.\nDağılım: ${dagilimSatiri(rec)}` : hemraMetni(rec));
const hemraKlavye = (rec) => ({ inline_keyboard: [...(rec.dagilim ? [[{ text: "✅ Patron'a gönder", callback_data: `rk:ho:${rec.id}` }]] : []), [{ text: "✏️ Dağılımı değiştir", callback_data: `rk:hd:${rec.id}` }], ...(rec.hemraKart ? [] : [[{ text: "❌ Gerek yok", callback_data: `rk:hx:${rec.id}` }]])] });
// Fabrikaya stok / satış / fiyat bilgisi GİTMEZ: sadece kod + dağılım
export function fuatMetni(rec) {
  return [`${D(rec)}${_rk.magazaAdi(rec.magaza)}`, `🔁 REPETE · ${rec.kod} · ${dagilimYazi(rec.dagilim)}`, `Toplam ${rec.adet} adet. Dağılım sabittir, değiştirilmez.`].join("\n");
}
const fuatKlavye = (rec) => ({ inline_keyboard: [[{ text: "✅ 4-8 gün", callback_data: `rk:f8:${rec.id}` }, { text: "✅ 10-15 gün", callback_data: `rk:f15:${rec.id}` }], [{ text: "⏳ 2 gün sonra dön", callback_data: `rk:fd:${rec.id}` }], [{ text: "❌ Yapamam", callback_data: `rk:fy:${rec.id}` }]] });
const SURE = { f8: { gun: 8, etiket: "4-8 gün" }, f15: { gun: 15, etiket: "10-15 gün" } }; // teslim = aralığın son günü

// ---------- 1) öneri: Sami → Hemra (Patron'un istediği repete ya da deneme) ----------
// g = { kod, magaza, dagilim: [{renk, buyuk, kucuk}] | null, deneme, test, kalan, satis7, kaynak }
export async function oneriAc(env, tg, g, simdi) {
  const kod = String(g.kod || "").trim();
  const deneme = Boolean(g.deneme);
  const engel = await acikRepete(env, kod, { deneme });
  if (engel) return { engel, metin: engelMetni(engel) };
  const adet = dagilimAdet(g.dagilim);
  if (g.dagilim && adet < REPETE_EN_AZ) return { hata: `Repete en az ${REPETE_EN_AZ} adet olmalı (yazılan ${adet}).` };
  let kalan = g.kalan, satis7 = g.satis7;
  if (!g.test) {
    const st = (await stokIste(env, "/toplu", { kodlar: [kod] }).catch(() => ({})))[kod];
    const donem = await stokIste(env, "/satis-donem", { basla: gunA(simdi - 7 * GUN), bitis: gunA(simdi) }).catch(() => ({}));
    kalan = st ? Math.max(0, Number(st.toplam) || 0) : 0;
    satis7 = Number((donem || {})[kod]) || 0;
  }
  const rec = { id: yeniId(kod, deneme, simdi), kod, magaza: g.magaza || "VOLONTE", deneme, test: Boolean(g.test), ikinciDene: Boolean(g.ikinciDene), kaynak: g.kaynak || null, donSn: g.donSn || null,
    dagilim: g.dagilim || null, adet, kalan: Number(kalan) || 0, satis7: Number(satis7) || 0, durum: "hemra", zaman: simdi, mesajlar: {}, kanit: [] };
  rec.bitisGun = rec.satis7 > 0 ? Math.max(1, Math.ceil(rec.kalan / (rec.satis7 / 7))) : null;
  rec.mesajlar.hemra = await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), hemraMetni(rec), hemraKlavye(rec), simdi, await fotoAdresi(env, rec));
  if (!rec.mesajlar.hemra) { rec.durum = "iptal"; rec.kapandi = simdi; await rkYaz(env, rec); return { hata: "Hemra'ya kart gönderilemedi.", rec }; }
  await rkYaz(env, rec);
  return { rec };
}
// Sinem "Bitti" → Hemra [Repete] (fabrika.js): aynı kart dağılım onayına döner ([✅ Patron'a gönder] / [✏️ Dağılımı değiştir])
export async function rkHemradan(env, tg, sip, kart, kim, simdi) {
  const v = sip.rkVeri || {};
  const rec = { id: yeniId(sip.kod, sip.deneme, simdi), kod: sip.kod, magaza: sip.magaza || "VOLONTE", deneme: Boolean(sip.deneme), test: Boolean(sip.test), kaynak: "bitti", sip: sip.id, hemraKart: kart, hemraSecen: kim,
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
  const rec = await rkOku(env, id);
  if (!rec) return cevapla("Bu kart artık geçerli değil.");
  const kim = _rk.kisiAd(cq.from);
  const patronMu = muratMi(env, cq.from.id);
  if (["ho", "hx", "hd"].includes(islem)) {
    const yetkili = [sorumlu(env), ilk(env.BR_SORUMLU), ilk(env.HEMRA_ID)].filter(Boolean).includes(String(cq.from.id)) || patronMu;
    if (!yetkili) return cevapla("Bu karar Hemra'da.");
    if (rec.durum !== "hemra") return cevapla(rec.hemra ? `${rec.hemra.kim} zaten seçti.` : "Bu kart artık geçerli değil.");
    if (islem === "hd") { // ✏️ Dağılımı değiştir → yazıyla
      await env.KAYIT.put(`rkDagilim:${cq.from.id}`, JSON.stringify({ id: rec.id }), { expirationTtl: 7200 }).catch(() => null);
      await cevapla("Dağılımı yazın");
      const r = await tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `${D(rec)}✏️ ${rec.kod} repete dağılımını yazın (en az ${REPETE_EN_AZ} adet). Örnek: beyaz büyük 20 küçük 20` });
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
    if (!rec.dagilim || rec.adet < REPETE_EN_AZ) { rec.hemra = null; return cevapla(`Önce dağılımı yazın (en az ${REPETE_EN_AZ} adet).`, true); }
    rec.durum = "patron";
    await cevapla("Patron'a gidiyor");
    await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, `${hemraTaban(rec)}\n\n✅ ${kim} onayladı — Patron'un onayına gitti.`, null, simdi);
    await kuyruk(env, "rkOneri", { id: `${rec.id}:o`, rid: rec.id, kod: rec.kod, magaza: rec.magaza, deneme: rec.deneme, dagilim: dagilimYazi(rec.dagilim), adet: rec.adet, kalan: rec.kalan, satis7: rec.satis7, bitisGun: rec.bitisGun, hemra: kim, foto: await fotoAdresi(env, rec), zaman: simdi });
    return rkYaz(env, rec);
  }
  if (["f8", "f15", "fd", "fy"].includes(islem)) {
    if (String(cq.from.id) !== fuatId(env) && !patronMu) return cevapla("Bu kart Fuat Bey'in.");
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
    if (String(cq.from.id) !== fuatId(env) && !patronMu) return cevapla("Bu kart Fuat Bey'in.");
    if (rec.durum !== "acik") return cevapla("Bu kayıt kapandı.");
    const yeni = gunA(simdi + (islem === "t5" ? 5 : 1) * GUN);
    Object.assign(rec, { teslim: yeni, teslimSoruldu: null, teslimCevap: { kim, ne: islem === "t5" ? "5 gün daha" : "bugün / yarın geliyor", zaman: simdi } });
    await cevapla("Kaydedildi ✅");
    await kartDuzenle(env, tg, rec, "Fuat", rec.mesajlar.teslim, `${D(rec)}📦 ${rec.kod} repete: ${rec.teslimCevap.ne} — yeni teslim ${gunGoster(yeni)}. Teşekkürler.`, null, simdi);
    const bilgi = `${D(rec)}📦 ${rec.kod} repete: Fuat "${rec.teslimCevap.ne}" dedi → yeni teslim ${gunGoster(yeni)}.`;
    await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), bilgi, null, simdi);
    await kuyruk(env, "rkSonuc", { id: `${rec.id}:t${simdi}`, rid: rec.id, metin: bilgi, biriktir: true });
    return rkYaz(env, rec);
  }
  return cevapla("Geçersiz düğme.");
}

// ---------- 3) Fuat'a kart (Patron onayından sonra; "2 gün sonra dön" ve "tekrar aç" ile yeniden) ----------
async function fuataGonder(env, tg, rec, simdi, ne = "Fuat") {
  const metin = fuatMetni(rec), fuat = fuatId(env);
  rec.hata = !fuat ? "Fuat'ın kimliği kayıtlı değil" : fuatSuzgec(metin) ? "güvenlik süzgeci durdurdu" : null;
  const m = rec.hata ? null : await kartGonder(env, tg, rec, ne, fuat, metin, fuatKlavye(rec), simdi, await fotoAdresi(env, rec));
  if (!m) return false;
  rec.mesajlar.fuat = m;
  Object.assign(rec, { durum: "fuat", fuatGonderim: simdi, donZaman: null, hat1: null, hat2: null, kapandi: null });
  return true;
}
async function patronKarari(env, tg, k, simdi) {
  if (k.karar === "tekrarAc") { // Patron Venom'a "3419 repete tekrar aç" dedi
    const r = await tekrarAc(env, tg, k.kod, k.kim || "Patron", simdi);
    if (!r.ok) await kuyruk(env, "rkSonuc", { id: `ta:${k.kod}:${simdi}`, rid: r.rec ? r.rec.id : `ta-${k.kod}`, metin: r.metin }); // olmadıysa Patron'a sebep; olduysa Fuat'ın cevabı tek satır gelir
    else await kartGonder(env, tg, r.rec, "Hemra", await _rk.koordinatorId(env, simdi), r.metin, null, simdi).then(() => rkYaz(env, r.rec));
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
    Object.assign(rec, { durum: "iptal", kapandi: simdi });
    await kuyruk(env, "rkSonuc", { id: `${rec.id}:h`, rid: rec.id, metin: `${DK(rec)}⚠️ ${rec.kod} repete kartı Fuat'a gönderilemedi (${rec.hata || "Fuat Sami'ye /start yazmamış olabilir"}). Repete açılmadı.` });
    return rkYaz(env, rec);
  }
  await kartGonder(env, tg, rec, "Hemra", hemra, `${D(rec)}${baslik(rec)}: ✅ Patron onayladı. Repete kartı Fuat'a gitti.`, null, simdi);
  return rkYaz(env, rec);
}
// "3419 repete tekrar aç": beklemedeki (Fuat "Yapamam" demiş) kayıt için kart Fuat'a yeniden gider
export async function tekrarAc(env, tg, kod, kim, simdi) {
  const rec = (await acikKayitlar(env)).find((r) => ayniKod(r.kod, kod) && r.durum === "beklemede");
  if (!rec) return { ok: false, metin: `⚠️ ${String(kod).toLocaleUpperCase("tr")} için beklemede repete kaydı yok.` };
  const engel = await acikRepete(env, rec.kod, { deneme: rec.deneme });
  if (engel) return { ok: false, metin: engelMetni(engel) };
  rec.tekrarAcan = [...(rec.tekrarAcan || []), { kim, zaman: simdi }];
  if (!(await fuataGonder(env, tg, rec, simdi, "Fuat (tekrar açıldı)"))) { await rkYaz(env, rec); return { ok: false, rec, metin: `${DK(rec)}⚠️ ${rec.kod} repete kartı Fuat'a gönderilemedi (${rec.hata || "?"}).` }; }
  await rkYaz(env, rec);
  return { ok: true, rec, metin: `${DK(rec)}🔁 ${rec.kod} repete tekrar açıldı (${kim}); kart Fuat'a yeniden gitti.` };
}

// ---------- 4) Fuat'ın cevabı ----------
async function fuatOnay(env, tg, rec, { kim, gun, etiket = null, dugme = null, yazi = null }, simdi) {
  Object.assign(rec, { durum: "acik", donZaman: null, fuat: { kim, zaman: simdi, gun, etiket, dugme, yazi }, teslim: gunA(simdi + gun * GUN) });
  if (!rec.deneme) { const st = (await stokIste(env, "/toplu", { kodlar: [rec.kod] }).catch(() => ({})))[rec.kod]; rec.stokBas = st ? Number(st.toplam) || 0 : 0; rec.stokMin = rec.stokBas; }
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
  const r = await tg(env, "sendMessage", { chat_id: fuatId(env), text: `${D(rec)}Tamam, teşekkürler.` });
  kanit(rec, "Fuat", r, "Tamam, teşekkürler.", null, simdi);
  await kartGonder(env, tg, rec, "Hemra", await _rk.koordinatorId(env, simdi), `${D(rec)}${baslik(rec)}: Fuat "yapamam" dedi. Kayıt beklemede; yeniden sormak için bana yazın: "${rec.kod} repete tekrar aç"`, null, simdi);
  return rkYaz(env, rec);
}

// ---------- 5) Fuat'ın yazısı: "3419 onaylıyorum 10 gün" / "3419 yapamam" ----------
export function fuatYaziCoz(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr").trim();
  const onay = /(^|[^\p{L}])onayl/u.test(t), yapamam = /(^|[^\p{L}])yapama/u.test(t);
  if (!onay && !yapamam) return null;
  const gm = t.match(/(\d{1,2})\s*g[üu]n/);
  const kalan = gm ? t.replace(gm[0], " ") : t;
  const km = kalan.match(new RegExp(`(?:^|[^\\p{L}\\d])${KOD_KALIP}(?![\\d])`, "u"));
  return { tur: yapamam && !onay ? "yapamam" : "onay", gun: gm ? Number(gm[1]) : null, kod: km ? km[1].toLocaleUpperCase("tr") : null };
}
export async function rkYazi(env, m, tg, simdi) {
  if (!m || !m.from || String(m.from.id) !== fuatId(env)) return false;
  const metin = String(m.text || "").trim();
  if (!metin || metin.startsWith("/")) return false;
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  const kim = _rk.kisiAd(m.from);
  const c = fuatYaziCoz(metin);
  if (!c) return false;
  const acik = await acikKayitlar(env);
  const bekleyen = acik.filter((r) => r.durum === "fuat");
  let rec = c.kod ? bekleyen.find((r) => ayniKod(r.kod, c.kod)) : null;
  if (!rec && c.kod) {
    const kayitli = acik.find((r) => ayniKod(r.kod, c.kod) && r.durum === "acik");
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
  if (!metin || metin.startsWith("/")) return false;
  const yetkili = [sorumlu(env), ilk(env.BR_SORUMLU), ilk(env.HEMRA_ID)].filter(Boolean).includes(String(m.from.id)) || muratMi(env, m.from.id);
  if (!yetkili) return false;
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  const ta = metin.match(new RegExp(`^\\s*${KOD_KALIP}\\s+repete(?:yi|sini)?\\s+tekrar\\s+a[çc]`, "i"));
  if (ta) { const r = await tekrarAc(env, tg, ta[1], _rk.kisiAd(m.from), simdi); await yaz(r.metin); return true; }
  const st = await env.KAYIT.get(`rkDagilim:${m.from.id}`, "json").catch(() => null);
  if (!st) return false;
  const rec = await rkOku(env, st.id);
  if (!rec || rec.durum !== "hemra") { await env.KAYIT.delete(`rkDagilim:${m.from.id}`).catch(() => null); return false; }
  const d = dagilimCoz(metin);
  if (!d) { await yaz(`${D(rec)}Dağılımı anlayamadım. Renk, beden ve adedi yazın; örnek: beyaz büyük 20 küçük 20`); return true; }
  if (dagilimAdet(d) < REPETE_EN_AZ) { await yaz(`${D(rec)}Repete en az ${REPETE_EN_AZ} adet olmalı (yazdığınız toplam ${dagilimAdet(d)}). Yeniden yazın.`); return true; }
  Object.assign(rec, { dagilim: d, adet: dagilimAdet(d) });
  await env.KAYIT.delete(`rkDagilim:${m.from.id}`).catch(() => null);
  await kartDuzenle(env, tg, rec, "Hemra", rec.mesajlar.hemra, hemraTaban(rec), hemraKlavye(rec), simdi);
  await rkYaz(env, rec);
  await yaz(`${D(rec)}✅ ${rec.kod} dağılımı: ${dagilimSatiri(rec)}. Karttaki "✅ Patron'a gönder"e basın.`);
  return true;
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
      const r = await oneriAc(env, tg, { kod, magaza: magazalar.size === 1 && magazalar.has("BLACKROSE") ? "BLACKROSE" : "VOLONTE", dagilim: _rk.dagilimOner((await ayarOku(env, "fabrika:sonIstek", {}))[kod]), kaynak: "patron" }, simdi);
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
    if (rec.durum === "fuat" && mesai(simdi)) { // 24 saat cevap yok → önce Fuat'a, 24 saat sonra Hemra'ya
      if (!rec.hat1 && simdi - rec.fuatGonderim >= GUN) {
        const r = await tg(env, "sendMessage", { chat_id: fuatId(env), text: `${D(rec)}🔔 Hatırlatma: ${rec.kod} repete kartı cevabınızı bekliyor.`, ...(rec.mesajlar.fuat ? { reply_to_message_id: rec.mesajlar.fuat[1], allow_sending_without_reply: true } : {}) });
        kanit(rec, "Fuat (hatırlatma)", r, "", null, simdi); rec.hat1 = simdi; degisti = true;
      } else if (rec.hat1 && !rec.hat2 && simdi - rec.hat1 >= GUN) {
        await kartGonder(env, tg, rec, "Hemra (hatırlatma)", await _rk.koordinatorId(env, simdi), `${D(rec)}🔔 Fuat, ${rec.kod} repete kartına cevap vermedi (dün kendisine hatırlatıldı). Arayıp sorar mısınız? (Venom)`, null, simdi);
        rec.hat2 = simdi; degisti = true;
      }
    }
    if (rec.durum === "acik" && rec.teslim && bugun > rec.teslim && mesai(simdi) && saatI(simdi) >= 10 && !rec.teslimSoruldu) { // teslim günü geçti → Fuat'a sor
      const kl = { inline_keyboard: [[{ text: "🚚 Bugün / yarın geliyor", callback_data: `rk:tg:${rec.id}` }], [{ text: "⏱ 5 gün daha", callback_data: `rk:t5:${rec.id}` }]] };
      rec.mesajlar.teslim = await kartGonder(env, tg, rec, "Fuat (teslim günü geçti)", fuatId(env), `${D(rec)}📦 ${rec.kod} repete (${rec.adet} adet) teslim günü ${gunGoster(rec.teslim)} idi. Ne durumda?`, kl, simdi);
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
