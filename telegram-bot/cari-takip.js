// CARİ TAKİP (2 Kasım, "Patron hiçbir şey göndermek zorunda kalmasın"): köprülerin gönderdiği son 60 günün hareketlerinden
//  • Ödemeler: VOLONTE defterinde özel kodu/açıklaması "BORC VERDIM" olan Black Rose hareketleri → Patron'a
//    "💵 Black Rose 20'a 5.000,00 $ ödeme kaydedildi". İlk çalışmada eski ödemeler sadece "görüldü" sayılır.
//    2 Kasım (Patron): VOLONTE ve BLACK ROSE iki ayrı mağaza → iki defter KARŞILAŞTIRILMAZ (karşılık arama, fark sebebi yok).
//    Hareket türü teşhisi gelene kadar ödemeler tahminle ayrılmaz (özel kodsuz kayıt ödeme sayılmaz).
//  • /bakiye (Patron): iki mağazanın bakiyesi ayrı ayrı. /borclimit 130000: bir mağazanın bakiyesi sınırı aşınca uyarı.
//  • Pazartesi 09:30 haftalık özet (sadece Patron): gelen mal, ödemeler, bakiye arttı/azaldı.
// Hepsi SADECE Patron'a (MURAT_ID ilki); Fuat ve ekip görmez. Kayıtlar değiştirilemez arşive de girer.
import { stokIste } from "./stokbot.js";
import { murat, muratMi } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const GUN = 86400;
const saat = (t) => ((t + SAAT_FARKI) % GUN) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const haftaGunu = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay();
const tarihYaz = (g) => String(g).split("-").reverse().join(".");
const gunSayi = (g) => Date.UTC(+g.slice(0, 4), +g.slice(5, 7) - 1, +g.slice(8, 10)) / 1000 / GUN;
const ayarOku = async (env, k, bos) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); };
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });
const arsiv = (env, tur, mt, icerik, zaman) => stokIste(env, "/arsiv-ekle", { tur, mt, icerik, zaman });
const para = (x) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dolar = (x) => `${para(x)} $`;
const isaretli = (x) => (x == null ? "—" : `${dolar(Math.abs(x))}${Math.abs(x) < 0.005 ? "" : x > 0 ? " (B)" : " (A)"}`);

export const tutarOf = (h) => Math.abs((Number(h.borc) || 0) - (Number(h.alacak) || 0));
export const odemeMi = (h) => /BOR[CÇ]\s*VERD/i.test(`${h.ozelkod || ""} ${h.aciklama || ""}`);
const etiket = (h) => [h.ozelkod, h.aciklama].filter(Boolean).join(" · ");

// Devir kaydı: yeni dönemin ilk günündeki, önceki dönem kapanışına eşit tutarlı hareket (ya da açıklamasında "devir")
export function devirMi(h, defter) {
  if (/devir/i.test(`${h.ozelkod || ""} ${h.aciklama || ""}`)) return true;
  const hesap = (defter.hesaplar || []).find((x) => x.anahtar === h.hesap);
  if (!hesap || !h.tablo) return false;
  const m = /^D(\d{4})TBL(.+)$/.exec(h.tablo);
  if (!m) return false;
  const bu = hesap.donemler && hesap.donemler[h.tablo];
  if (!bu || bu.ilk !== h.tarih) return false;
  const onceki = Object.entries(hesap.donemler || {}).map(([d, x]) => ({ d, x, mm: /^D(\d{4})TBL(.+)$/.exec(d) }))
    .filter((o) => o.mm && o.mm[2] === m[2] && o.mm[1] < m[1] && o.x.n > 0).sort((a, b) => b.mm[1].localeCompare(a.mm[1]))[0];
  if (!onceki) return false;
  return Math.abs(Math.abs((Number(onceki.x.borc) || 0) - (Number(onceki.x.alacak) || 0)) - tutarOf(h)) < 0.01;
}

// ---- Ödemeler (VOLONTE defteri) ----
export function odemeler(vl) { return ((vl && vl.hareketler) || []).filter((h) => odemeMi(h) && tutarOf(h) >= 0.005); }
const odemeAnahtari = (h) => `${h.tablo}:${h.ind}`;

export async function odemeTakip(env, simdi, tg) {
  const vl = await ayarOku(env, "cari:VOLONTE", null);
  if (!vl || !vl.hareketler) return;
  const gorulen = await ayarOku(env, "cari:odemeGorulen", null);
  const ilk = gorulen == null;
  const g = gorulen || {};
  const patron = murat(env);
  let degisti = ilk;
  for (const h of odemeler(vl)) {
    const k = odemeAnahtari(h);
    if (g[k]) continue;
    g[k] = { tarih: h.tarih, hesap: h.hesap, tutar: tutarOf(h), etiket: etiket(h), bildirildi: !ilk };
    degisti = true;
    if (ilk) continue;
    await tg(env, "sendMessage", { chat_id: patron, text: `💵 Black Rose ${h.hesap}'a ${dolar(tutarOf(h))} ödeme kaydedildi (VOLONTE defteri, ${tarihYaz(h.tarih)}${etiket(h) ? ` · ${etiket(h)}` : ""}).` });
    await arsiv(env, "odeme-vegawin", `odeme:${k}`, { ...g[k], defter: "VOLONTE" }, simdi);
  }
  // (Black Rose defterinde karşılık arama 2 Kasım'da kaldırıldı: iki mağaza ayrı, hesaplar birbirinin karşılığı değil.)
  const bugun = gunSayi(gunAnahtari(simdi));
  for (const [k, o] of Object.entries(g)) if (bugun - gunSayi(o.tarih) > 60) { delete g[k]; degisti = true; }
  if (degisti) await ayarYaz(env, "cari:odemeGorulen", g);
}

// ---- Borç sınırı ----
export async function borcLimitKontrol(env, simdi, tg, bakiyeOku) {
  const limit = await ayarOku(env, "cari:limit", null);
  if (!limit || !limit.tutar) return;
  const b = await bakiyeOku(env);
  // İki mağaza ayrı (2 Kasım): sınır her mağazanın kendi toplamına ayrı uygulanır
  const asan = [["BLACK ROSE", b.brToplam], ["VOLONTE", b.vlToplam]].filter(([, v]) => v != null && Math.abs(v) > limit.tutar);
  if (asan.length && !limit.asildi) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `🚨 Borç sınırı aşıldı (sınır ${dolar(limit.tutar)}): ${asan.map(([ad, v]) => `${ad} bakiyesi ${isaretli(v)}`).join(" · ")}.` });
    await arsiv(env, "borc-limit", null, { asan: asan.map(([ad, v]) => ({ ad, v })), limit: limit.tutar }, simdi);
    await ayarYaz(env, "cari:limit", { ...limit, asildi: simdi });
  } else if (!asan.length && limit.asildi) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `✅ Bakiyeler yeniden borç sınırının (${dolar(limit.tutar)}) altında.` });
    await ayarYaz(env, "cari:limit", { tutar: limit.tutar, kim: limit.kim, zaman: limit.zaman });
  }
}
export async function borcLimitKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  const arg = String(m.text || "").trim().split(/\s+/).slice(1).join("").replace(/\$/g, "");
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  if (!arg) {
    const l = await ayarOku(env, "cari:limit", null);
    return yaz(l ? `Borç sınırı: ${dolar(l.tutar)}${l.asildi ? " (şu an AŞILMIŞ)" : ""}.\nDeğiştirmek: /borclimit 150000 · kapatmak: /borclimit 0` : "Borç sınırı yok. Koymak için: /borclimit 130000");
  }
  const s = arg.includes(",") ? arg.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(arg) ? arg.replace(/\./g, "") : arg;
  const t = Number(s);
  if (!Number.isFinite(t) || t < 0) return yaz("Tutarı rakamla yazın: /borclimit 130000");
  await arsiv(env, "borc-limit-ayar", null, { tutar: t, kim: String(m.from.id) }, simdi);
  if (t === 0) { await stokIste(env, "/ayar-yaz", { k: "cari:limit", v: "null" }); return yaz("Borç sınırı kapatıldı."); }
  await ayarYaz(env, "cari:limit", { tutar: t, kim: String(m.from.id), zaman: simdi });
  return yaz(`✅ Borç sınırı ${dolar(t)}. Bir mağazanın toplam bakiyesi bunu aşınca size haber veririm (VOLONTE ve BLACK ROSE ayrı ayrı).`);
}

// ---- Haftalık özet (pazartesi 09:30, sadece Patron) ----
export function haftalikOzetMetni(defter, adi, bakiye, bas, son) {
  const l = (defter && defter.hareketler) || [];
  const hafta = l.filter((h) => h.tarih >= bas && h.tarih <= son && !devirMi(h, defter));
  const od = hafta.filter(odemeMi);
  // Gelen mal: ödemelerin yazıldığı tarafın karşısındaki (ödeme olmayan) kayıtlar — ödeme kaydı yoksa belirlenemez
  const tumOdeme = l.filter(odemeMi);
  const odemeBorc = tumOdeme.filter((h) => (Number(h.borc) || 0) > 0).length, odemeAlacak = tumOdeme.length - odemeBorc;
  const malTaraf = !tumOdeme.length ? null : odemeBorc >= odemeAlacak ? "alacak" : "borc";
  const mal = malTaraf ? hafta.filter((h) => !odemeMi(h) && (Number(h[malTaraf]) || 0) > 0) : [];
  const topla = (x) => x.reduce((t, h) => t + tutarOf(h), 0);
  const net = (x) => x.reduce((t, h) => t + (Number(h.borc) || 0) - (Number(h.alacak) || 0), 0);
  const sonra = l.filter((h) => h.tarih > son && !devirMi(h, defter));
  const haftaSonu = bakiye == null ? null : bakiye - net(sonra);
  const haftaBasi = haftaSonu == null ? null : haftaSonu - net(hafta);
  const degisim = haftaSonu == null ? null : Math.abs(haftaSonu) - Math.abs(haftaBasi);
  return [
    `🏬 ${adi}`,
    malTaraf ? `📦 Gelen mal: ${dolar(topla(mal))} (${mal.length} kayıt)` : "📦 Gelen mal / 💵 ödemeler: ayrılamıyor (hareket türü teşhisi bekleniyor)",
    ...(malTaraf ? [`💵 Ödemeler: ${dolar(topla(od))} (${od.length} kayıt)`] : []),
    haftaSonu == null ? "💰 Bakiye: okunamadı" : `💰 Bakiye: ${isaretli(haftaSonu)} — geçen hafta ${Math.abs(degisim) < 0.005 ? "değişmedi" : `${dolar(Math.abs(degisim))} ${degisim > 0 ? "arttı" : "azaldı"}`} (${isaretli(haftaBasi)} → ${isaretli(haftaSonu)})`,
  ].join("\n");
}
export async function haftalikOzet(env, simdi, tg, bakiyeOku) {
  if (haftaGunu(simdi) !== 1 || saat(simdi) < 9.5) return;
  const gun = gunAnahtari(simdi);
  if (await ayarOku(env, `cari:ozet:${gun}`, null)) return;
  await ayarYaz(env, `cari:ozet:${gun}`, 1);
  const b = await bakiyeOku(env);
  const son = gunAnahtari(simdi - GUN), bas = gunAnahtari(simdi - 7 * GUN);
  // İki mağaza ayrı (2 Kasım): her biri kendi defterinden; karşılaştırma yok
  const parcalar = [[b.br, "BLACK ROSE", b.brToplam], [b.vl, "VOLONTE", b.vlToplam]].filter(([d]) => d).map(([d, ad, bk]) => haftalikOzetMetni(d, ad, bk, bas, son));
  if (!parcalar.length) return;
  const metin = [`📊 Haftalık özet (${tarihYaz(bas)}–${tarihYaz(son)}) — sadece siz görüyorsunuz`, ...parcalar].join("\n\n");
  await tg(env, "sendMessage", { chat_id: murat(env), text: metin });
  await arsiv(env, "haftalik-ozet", null, metin, simdi);
}
