// CUMA MUTABAKATI — Fuat (Black Rose) ile haftalık stok ve bakiye mutabakatı (kullanıcı kararı 31 Ekim). Sayım Sami.
//  • Her cuma 17:00 önce PATRON'a önizleme: [✅ Fuat'a gönder] [🔄 Yenile] [❌ İptal]. /mutabakat ile istediği an.
//  • Onaylanınca Fuat'a "📋 Cuma mutabakatı – tarih": [✅ Mutabıkım] [❌ Uyuşmuyor] [⏳ Sonra kontrol edeceğim].
//    Mutabıkım → Patron'a "Fuat mutabık ✅". Uyuşmuyor → Fuat'a "Fark ne?"; yazdığı açıklama Patron'a gider.
//    Sonra → her gün 12:00 (pazar hariç) aynı düğmelerle sorulur; 3 gün cevap yoksa Patron'a bilgi.
//  • İçerik: BÖLÜM 1 Black Rose mağazası, BÖLÜM 2 VOLONTE mağazası — SADECE Black Rose kodlarının stoğu (kod sade);
//    BÖLÜM 3 bakiyeler (Black Rose 15/20/25/00 + toplam; köprünün cari okuması). VOLONTE modeli, fiyat, maliyet, satış,
//    kâr YOK; 2000 yok. Mutabakat SADECE Patron ve Fuat'a gider.
//  • Her mutabakat ve Fuat'ın cevabı Sami'nin deposunda saklanır ("mt:<id>", liste "mt:liste").
import { stokIste } from "./stokbot.js";
import { murat, muratMi } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const haftaGunu = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay(); // 0 pazar, 5 cuma
const tarihYaz = (g) => g.split("-").reverse().join(".");
const ayarOku = async (env, k, bos) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); };
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });
export const fuat = (env) => String(env.FUAT_ID || "");
const HESAPLAR = ["Black Rose 15", "Black Rose 20", "Black Rose 25", "Black Rose 00"];

export async function mutabakatMetni(env, gun) {
  const s = await stokIste(env, "/br-stoklar");
  const bakiye = await ayarOku(env, "cari:bakiye", null); // köprü cari hesapları okuyabildiğinde yazar
  const bolum = (l) => (l.length ? l.map(([k, a]) => `${k} · ${a}`).join("\n") : "—");
  const toplam = (l) => l.reduce((t, [, a]) => t + a, 0);
  const para = (x) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bakiyeSatir = bakiye && bakiye.hesaplar
    ? [...HESAPLAR.map((h) => `${h}: ${bakiye.hesaplar[h] == null ? "—" : `${para(bakiye.hesaplar[h])} ${bakiye.birim || "$"}`}`), `TOPLAM: ${para(HESAPLAR.reduce((t, h) => t + (Number(bakiye.hesaplar[h]) || 0), 0))} ${bakiye.birim || "$"}`]
    : ["Bakiyeler henüz okunamıyor (Vegawin cari hesap okuması deneniyor)."];
  return [
    `📋 Cuma mutabakatı – ${tarihYaz(gun)}`,
    "",
    `📦 BÖLÜM 1 – BLACK ROSE MAĞAZASI (${s.BLACKROSE.length} model, ${toplam(s.BLACKROSE)} adet)`,
    bolum(s.BLACKROSE),
    "",
    `📦 BÖLÜM 2 – VOLONTE MAĞAZASI (Black Rose kodları; ${s.VOLONTE.length} model, ${toplam(s.VOLONTE)} adet)`,
    bolum(s.VOLONTE),
    "",
    "💰 BÖLÜM 3 – BAKİYELER",
    ...bakiyeSatir,
  ].join("\n");
}

const onizlemeKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Fuat'a gönder", callback_data: `mt:g:${id}` }, { text: "🔄 Yenile", callback_data: `mt:y:${id}` }, { text: "❌ İptal", callback_data: `mt:x:${id}` }]] });
const fuatKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Mutabıkım", callback_data: `mt:m:${id}` }, { text: "❌ Uyuşmuyor", callback_data: `mt:u:${id}` }], [{ text: "⏳ Sonra kontrol edeceğim", callback_data: `mt:s:${id}` }]] });
const kayitYaz = async (env, r) => {
  await ayarYaz(env, `mt:${r.id}`, r);
  const l = await ayarOku(env, "mt:liste", []);
  if (!l.includes(r.id)) await ayarYaz(env, "mt:liste", [...l, r.id]);
};
// Telegram mesajı 4096 karakter: uzun liste parçalara bölünür (düğmeler son parçada)
function parcala(metin, sinir = 3800) {
  const p = [];
  let k = "";
  for (const satir of metin.split("\n")) {
    if ((k + satir).length > sinir) { p.push(k); k = ""; }
    k += `${k ? "\n" : ""}${satir}`;
  }
  return [...p, k];
}
async function gonder(env, tg, chat, metin, klavye) {
  const p = parcala(metin);
  let son = null;
  for (let i = 0; i < p.length; i++) son = await tg(env, "sendMessage", { chat_id: chat, text: p[i], ...(i === p.length - 1 ? { reply_markup: klavye } : {}) });
  return son && son.ok ? son.result.message_id : null;
}

export async function onizlemeGonder(env, tg, simdi, kaynak = "cuma") {
  const gun = gunAnahtari(simdi);
  const id = `${gun}-${simdi.toString(36)}`;
  const metin = await mutabakatMetni(env, gun);
  const r = { id, gun, kaynak, olusturma: simdi, metin, durum: "onizleme", gecmis: [[simdi, `önizleme (${kaynak})`]] };
  r.onizlemeMesaj = await gonder(env, tg, murat(env), `👁 ÖNİZLEME (sadece siz görüyorsunuz)\n\n${metin}`, onizlemeKlavye(id));
  await kayitYaz(env, r);
  return r;
}

// /mutabakat — sadece Patron (ve Murat'ın diğer hesabı)
export async function mutabakatKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  if (!fuat(env)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Fuat'ın kimliği kayıtlı değil (venom:kimlikler FUAT_ID)." });
  await onizlemeGonder(env, tg, simdi, "elle");
}

export async function mutabakatDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data).split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const r = await ayarOku(env, `mt:${id}`, null);
  if (!r) return cevapla("Bu mutabakat bulunamadı.");
  const kim = String(cq.from.id);
  if ("gyx".includes(islem)) { // Patron düğmeleri
    if (!muratMi(env, kim)) return cevapla("Bu düğme Patron'da.");
    if (r.durum !== "onizleme") return cevapla("Bu önizleme artık geçerli değil.");
    if (islem === "x") {
      Object.assign(r, { durum: "iptal" }); r.gecmis.push([simdi, "iptal (Patron)"]);
      await kayitYaz(env, r); await cevapla("İptal edildi");
      return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: "❌ İptal edildi", callback_data: "mt:-" }]] } });
    }
    if (islem === "y") {
      r.metin = await mutabakatMetni(env, r.gun); r.gecmis.push([simdi, "yenilendi"]);
      await kayitYaz(env, r); await cevapla("Yenilendi");
      return gonder(env, tg, cq.message.chat.id, `👁 ÖNİZLEME (yenilendi)\n\n${r.metin}`, onizlemeKlavye(id));
    }
    // g: Fuat'a gönder
    r.fuatMesaj = await gonder(env, tg, fuat(env), r.metin, fuatKlavye(id));
    if (!r.fuatMesaj) return cevapla("Fuat'a gönderilemedi (Sami'ye /start yazmamış olabilir).");
    Object.assign(r, { durum: "gonderildi", gonderim: simdi }); r.gecmis.push([simdi, "Fuat'a gönderildi"]);
    await kayitYaz(env, r); await cevapla("Fuat'a gönderildi");
    return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: "✅ Fuat'a gönderildi", callback_data: "mt:-" }]] } });
  }
  // Fuat'ın düğmeleri
  if (kim !== fuat(env)) return cevapla("Bu düğme Fuat'ta.");
  if (!["gonderildi", "sonra", "fark"].includes(r.durum)) return cevapla("Bu mutabakat kapandı.");
  const kapat = () => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (islem === "m") {
    Object.assign(r, { durum: "mutabik", cevapZaman: simdi }); r.gecmis.push([simdi, "Fuat: mutabıkım"]);
    await kayitYaz(env, r); await cevapla("Teşekkürler"); await kapat();
    await tg(env, "sendMessage", { chat_id: fuat(env), text: "✅ Teşekkürler, mutabakat kaydedildi." });
    return tg(env, "sendMessage", { chat_id: murat(env), text: `Fuat mutabık ✅ (${tarihYaz(r.gun)} mutabakatı)` });
  }
  if (islem === "u") {
    Object.assign(r, { durum: "fark", cevapZaman: simdi }); r.gecmis.push([simdi, "Fuat: uyuşmuyor"]);
    await kayitYaz(env, r); await ayarYaz(env, `mt:fark:${kim}`, id);
    await cevapla("Farkı yazın"); await kapat();
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Fark ne? Lütfen kısaca yazın (model kodu ve adet, ya da bakiye farkı)." });
  }
  if (islem === "s") {
    Object.assign(r, { durum: "sonra", sonraBas: r.sonraBas || simdi, sorulanGun: gunAnahtari(simdi) }); r.gecmis.push([simdi, "Fuat: sonra kontrol edeceğim"]);
    await kayitYaz(env, r); await cevapla("Tamam"); await kapat();
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Tamam. Yarın 12:00'de tekrar soracağım." });
  }
}

// Fuat "Uyuşmuyor" dedikten sonra yazdığı açıklama → Patron'a
export async function mutabakatFarkMesaji(env, m, tg, simdi) {
  const kim = String(m.from.id);
  if (kim !== fuat(env) || !m.text || m.text.startsWith("/")) return false;
  const id = await ayarOku(env, `mt:fark:${kim}`, null);
  if (!id) return false;
  const r = await ayarOku(env, `mt:${id}`, null);
  await stokIste(env, "/ayar-yaz", { k: `mt:fark:${kim}`, v: "null" });
  if (!r) return false;
  Object.assign(r, { fark: String(m.text).slice(0, 2000), farkZaman: simdi }); r.gecmis.push([simdi, `Fuat fark: ${r.fark}`]);
  await kayitYaz(env, r);
  await tg(env, "sendMessage", { chat_id: fuat(env), text: "Teşekkürler, açıklamanız iletildi." });
  await tg(env, "sendMessage", { chat_id: murat(env), text: `❌ Fuat mutabakatta uyuşmuyor (${tarihYaz(r.gun)}):\n${r.fark}` });
  return true;
}

// Görev (5 dakikada bir): cuma 17:00 önizleme; "sonra" diyene her gün 12:00 (pazar hariç) hatırlatma; 3 gün cevapsız → Patron
export async function mutabakatAdimi(env, simdi, tg) {
  if (!fuat(env)) return;
  const gun = gunAnahtari(simdi);
  const s = saat(simdi);
  if (haftaGunu(simdi) === 5 && s >= 17 && !(await ayarOku(env, `mt:cuma:${gun}`, null))) {
    await ayarYaz(env, `mt:cuma:${gun}`, 1);
    await onizlemeGonder(env, tg, simdi, "cuma");
    return;
  }
  if (haftaGunu(simdi) === 0 || s < 12) return;
  for (const id of (await ayarOku(env, "mt:liste", [])).slice(-6)) {
    const r = await ayarOku(env, `mt:${id}`, null);
    if (!r || r.durum !== "sonra" || r.sorulanGun === gun) continue;
    r.sorulanGun = gun;
    r.hatirlatma = (r.hatirlatma || 0) + 1;
    await gonder(env, tg, fuat(env), `⏳ Mutabakatı kontrol ettiniz mi? (${tarihYaz(r.gun)})`, fuatKlavye(id));
    r.gecmis.push([simdi, `hatırlatma ${r.hatirlatma}`]);
    if (r.hatirlatma >= 3 && !r.patronBilgi) {
      r.patronBilgi = true;
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fuat ${tarihYaz(r.gun)} mutabakatına 3 gündür cevap vermedi.` });
    }
    await kayitYaz(env, r);
  }
}
