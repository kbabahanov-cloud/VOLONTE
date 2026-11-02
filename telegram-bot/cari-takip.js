// CARİ TAKİP (2 Kasım, "Patron hiçbir şey göndermek zorunda kalmasın"): köprülerin gönderdiği son 60 günün hareketlerinden
//  • Ödemeler: VOLONTE defterinde özel kodu/açıklaması "BORC VERDIM" olan Black Rose hareketleri → Patron'a
//    "💵 Black Rose 20'a 5.000,00 $ ödeme kaydedildi". Black Rose defterinde 2 gün içinde karşılığı (aynı hesap, aynı tutar)
//    görünmezse Patron'a ⚠️. İlk çalışmada eski ödemeler sadece "görüldü" sayılır (geçmiş için mesaj yağmuru olmaz).
//  • Defter farkının olası sebebi: bir defterde olup diğerinde olmayan hareketler (aynı hesap, aynı tutar, ±3 gün; devir hariç).
//  • /bakiye (Patron): iki defter + fark + olası sebep. /borclimit 130000: toplam borç sınırı aşılınca Patron'a uyarı.
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

// İki defterin hareketlerini eşleştirir: aynı hesap, aynı tutar (±0,01), tarih farkı ≤ gun. Döner: eşleşmeyenler.
export function eslestir(a, b, gun = 3) {
  const kalanB = [...b];
  const yalnizA = [];
  for (const x of a) {
    const i = kalanB.findIndex((y) => y.hesap === x.hesap && Math.abs(tutarOf(y) - tutarOf(x)) < 0.01 && Math.abs(gunSayi(y.tarih) - gunSayi(x.tarih)) <= gun);
    if (i >= 0) kalanB.splice(i, 1); else yalnizA.push(x);
  }
  return { yalnizA, yalnizB: kalanB };
}

// Defter farkının olası sebebi: iki defterin de kapsadığı tarihlerdeki, devir dışı, tutarı olan hareketler karşılaştırılır
export function farkNedenleri(br, vl, enFazla = 6) {
  if (!br || !vl || !(br.hareketler || []).length || !(vl.hareketler || []).length) return [];
  const ilk = (d) => d.hareketler.reduce((m, h) => (h.tarih < m ? h.tarih : m), "9999");
  const bas = [ilk(br), ilk(vl)].sort().at(-1);
  const sec = (d) => d.hareketler.filter((h) => h.tarih >= bas && tutarOf(h) >= 0.005 && !devirMi(h, d));
  const { yalnizA, yalnizB } = eslestir(sec(vl), sec(br));
  const satir = (h, var_, yok) => `• Black Rose ${h.hesap}: ${tarihYaz(h.tarih)} · ${dolar(tutarOf(h))}${etiket(h) ? ` (${etiket(h)})` : ""} — ${var_} defterinde var, ${yok} defterinde yok`;
  const l = [...yalnizA.map((h) => satir(h, "VOLONTE", "Black Rose")), ...yalnizB.map((h) => satir(h, "Black Rose", "VOLONTE"))]
    .sort((x, y) => y.localeCompare(x));
  return l.length > enFazla ? [...l.slice(0, enFazla), `… ve ${l.length - enFazla} kayıt daha`] : l;
}

// ---- Ödemeler (VOLONTE defteri) ----
export function odemeler(vl) { return ((vl && vl.hareketler) || []).filter((h) => odemeMi(h) && tutarOf(h) >= 0.005); }
const odemeAnahtari = (h) => `${h.tablo}:${h.ind}`;

export async function odemeTakip(env, simdi, tg) {
  const [br, vl] = await Promise.all([ayarOku(env, "cari:BLACKROSE", null), ayarOku(env, "cari:VOLONTE", null)]);
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
  // 2 gün içinde Black Rose defterinde karşılığı yoksa uyarı (Black Rose defteri o tarihten sonra okunmuş olmalı)
  const bugun = gunSayi(gunAnahtari(simdi));
  for (const [k, o] of Object.entries(g)) {
    if (o.eslesti || o.uyarildi) continue;
    if (bugun - gunSayi(o.tarih) > 60) { delete g[k]; degisti = true; continue; }
    if (!br || !br.hareketler) continue;
    const brVar = br.hareketler.some((h) => h.hesap === o.hesap && Math.abs(tutarOf(h) - o.tutar) < 0.01 && gunSayi(h.tarih) >= gunSayi(o.tarih) - 3);
    if (brVar) { o.eslesti = true; degisti = true; continue; }
    if (bugun - gunSayi(o.tarih) < 2 || !br.zaman || gunSayi(gunAnahtari(br.zaman)) < gunSayi(o.tarih) + 2) continue;
    if (ilk) { o.uyarildi = true; continue; }
    o.uyarildi = true; degisti = true;
    await tg(env, "sendMessage", { chat_id: patron, text: `⚠️ Black Rose ${o.hesap}'a ${tarihYaz(o.tarih)} tarihli ${dolar(o.tutar)} ödeme VOLONTE defterinde var ama Black Rose defterinde 2 gündür görünmüyor. Fuat'la kontrol edin.` });
    await arsiv(env, "odeme-eslesmedi", `odeme:${k}`, o, simdi);
  }
  if (degisti) await ayarYaz(env, "cari:odemeGorulen", g);
}

// ---- Borç sınırı ----
export async function borcLimitKontrol(env, simdi, tg, bakiyeOku) {
  const limit = await ayarOku(env, "cari:limit", null);
  if (!limit || !limit.tutar) return;
  const b = await bakiyeOku(env);
  const toplam = Math.max(Math.abs(b.brToplam || 0), Math.abs(b.vlToplam || 0));
  if (toplam > limit.tutar && !limit.asildi) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `🚨 Borç sınırı aşıldı: toplam ${dolar(toplam)} > sınır ${dolar(limit.tutar)} (Black Rose defteri ${isaretli(b.brToplam)} · VOLONTE defteri ${isaretli(b.vlToplam)}).` });
    await arsiv(env, "borc-limit", null, { toplam, limit: limit.tutar }, simdi);
    await ayarYaz(env, "cari:limit", { ...limit, asildi: simdi });
  } else if (toplam <= limit.tutar && limit.asildi) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `✅ Borç yeniden sınırın altında: ${dolar(toplam)} ≤ ${dolar(limit.tutar)}.` });
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
  return yaz(`✅ Borç sınırı ${dolar(t)}. Toplam borç bunu aşınca size haber veririm (iki defterden büyük olanı esas alınır).`);
}

// ---- Haftalık özet (pazartesi 09:30, sadece Patron) ----
export function haftalikOzetMetni(defter, adi, bakiye, bas, son) {
  const l = (defter && defter.hareketler) || [];
  const hafta = l.filter((h) => h.tarih >= bas && h.tarih <= son && !devirMi(h, defter));
  const od = hafta.filter(odemeMi);
  // Ödemelerin yazıldığı taraf (borç/alacak) bulunur; gelen mal karşı taraftaki (ödeme olmayan) kayıtlardır
  const tumOdeme = l.filter(odemeMi);
  const odemeBorc = tumOdeme.filter((h) => (Number(h.borc) || 0) > 0).length, odemeAlacak = tumOdeme.length - odemeBorc;
  const malTaraf = !tumOdeme.length ? null : odemeBorc >= odemeAlacak ? "alacak" : "borc";
  const mal = malTaraf ? hafta.filter((h) => !odemeMi(h) && (Number(h[malTaraf]) || 0) > 0) : [];
  const topla = (x) => x.reduce((t, h) => t + tutarOf(h), 0);
  // Bakiye değişimi: haftanın hareketleri (işaretli) — hafta sonu bakiyesi = bugünkü − haftadan sonraki hareketler
  const net = (x) => x.reduce((t, h) => t + (Number(h.borc) || 0) - (Number(h.alacak) || 0), 0);
  const sonra = l.filter((h) => h.tarih > son && !devirMi(h, defter));
  const haftaSonu = bakiye == null ? null : bakiye - net(sonra);
  const haftaBasi = haftaSonu == null ? null : haftaSonu - net(hafta);
  const degisim = haftaSonu == null ? null : Math.abs(haftaSonu) - Math.abs(haftaBasi);
  return [
    `📊 Haftalık özet — Black Rose (${tarihYaz(bas)}–${tarihYaz(son)})`,
    malTaraf ? `📦 Gelen mal: ${dolar(topla(mal))} (${mal.length} kayıt)` : "📦 Gelen mal: belirlenemedi (defterde henüz ödeme kaydı görülmedi)",
    `💵 Ödemeler: ${dolar(topla(od))} (${od.length} kayıt)`,
    haftaSonu == null ? "💰 Bakiye: okunamadı" : `💰 Bakiye: ${isaretli(haftaSonu)} — geçen hafta ${Math.abs(degisim) < 0.005 ? "değişmedi" : `${dolar(Math.abs(degisim))} ${degisim > 0 ? "arttı" : "azaldı"}`} (${isaretli(haftaBasi)} → ${isaretli(haftaSonu)})`,
    `(${adi} defterine göre; sadece siz görüyorsunuz)`,
  ].join("\n");
}
export async function haftalikOzet(env, simdi, tg, bakiyeOku) {
  if (haftaGunu(simdi) !== 1 || saat(simdi) < 9.5) return;
  const gun = gunAnahtari(simdi);
  if (await ayarOku(env, `cari:ozet:${gun}`, null)) return;
  await ayarYaz(env, `cari:ozet:${gun}`, 1);
  const [br, vl] = await Promise.all([ayarOku(env, "cari:BLACKROSE", null), ayarOku(env, "cari:VOLONTE", null)]);
  const b = await bakiyeOku(env);
  const son = gunAnahtari(simdi - GUN), bas = gunAnahtari(simdi - 7 * GUN);
  const [defter, adi, bakiye] = vl && vl.hareketler ? [vl, "VOLONTE", b.vlToplam] : [br, "Black Rose", b.brToplam];
  if (!defter) return;
  const metin = haftalikOzetMetni(defter, adi, bakiye, bas, son);
  await tg(env, "sendMessage", { chat_id: murat(env), text: metin });
  await arsiv(env, "haftalik-ozet", null, metin, simdi);
}
