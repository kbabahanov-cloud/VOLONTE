// BLACK ROSE STOK SORGUSU (Fuat ve Nuri, kullanıcı kararı 30 Ekim)
//  Yetkili fabrika kişisi "/stok 3900" yazar → cevap hemen GİTMEZ. Hemra'ya: "Fuat 3900 stoğunu soruyor · stok: 24"
//  [✅ Göster] [❌ Gösterme]. Hemra 1 saat cevap vermezse Murat'a sorulur (ilk basan geçerli). 24 saatte cevap yoksa düşer.
//  Gösterilen SADECE o modelin Black Rose stoğu (Vegawin kodu "B" ile biten kartlar). Kod sade yazılır (3900); "B", "B20"
//  gibi ekler hiç bilinmez (köprü göndermez). VOLONTE stoğu, fiyat, maliyet, satış adedi, kâr ASLA yok.
//  İndirimli mal (2000) sorgulanamaz. Yetkiyi Murat verir (/stokyetki); Sinem ve Celal'de yok. Kişi başı günde 10 sorgu.
//  Her sorgu Sami'nin deposunda kayıtlı (kim, kod, ne zaman, karar, kim karar verdi). Vegawin'e hiçbir şey yazılmaz.

import { stokIste } from "./stokbot.js";
import { indirimliMi } from "./stok.js";
import { murat, muratMi, sorumlu, kisiKaydi, kisiGrubu, fabrikaKisileri } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saatYaz = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
export const GUNLUK_SORGU = 10;
const MURAT_SN = 3600; // Hemra 1 saat cevap vermezse Murat'a
const SURE_SN = 86400; // 24 saatte kimse cevaplamazsa sorgu düşer
const YETKI = "sami:stokSorguIds";

const yetkililer = async (env) => ((await env.KAYIT.get(YETKI, "json")) || []).map(String);
export async function sorguYetkilisi(env, id) {
  const k = await kisiKaydi(env, id);
  return Boolean(k && kisiGrubu(k) === "fabrika" && (await yetkililer(env)).includes(String(id)));
}

const stokYazi = (stok) => (stok == null ? "— (Black Rose kartı yok)" : String(Math.max(0, stok)));
const soruMetni = (r) => `🔎 ${r.ad} ${r.kod} stoğunu soruyor · stok: ${stokYazi(r.stok)}`;
const klavye = (id) => ({ inline_keyboard: [[{ text: "✅ Göster", callback_data: `sq:g:${id}` }, { text: "❌ Gösterme", callback_data: `sq:x:${id}` }]] });

// Fabrika kişisinin "/stok …" mesajı. Yetkisi yoksa false (normal fabrika cevabı verilir).
export async function stokSorguMesaji(env, m, tg, simdi) {
  const metin = String(m.text || "").trim();
  if (!/^\/stok(@\w+)?\b/i.test(metin) || !(await sorguYetkilisi(env, m.from.id))) return false;
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  const kod = (metin.replace(/^\/stok(@\w+)?/i, "").trim().match(/^(\d{3,6})/) || [])[1];
  if (!kod) { await yaz("Kullanım: /stok 3900"); return true; }
  if (indirimliMi(kod)) { await yaz(`${kod} kodu sorgulanamaz.`); return true; }
  const kisi = await kisiKaydi(env, m.from.id);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const r = await stokIste(env, "/sorgu-ac", { id, kisi: String(m.from.id), ad: kisi.ad, kod, gun: gunAnahtari(simdi), zaman: simdi, sinir: GUNLUK_SORGU });
  if (r.sinir) { await yaz(`Bugünlük sorgu sınırına ulaştınız (${GUNLUK_SORGU}). Yarın tekrar sorabilirsiniz.`); return true; }
  const g = await tg(env, "sendMessage", { chat_id: sorumlu(env), text: soruMetni({ ad: kisi.ad, kod, stok: r.stok }), reply_markup: klavye(id) });
  await stokIste(env, "/sorgu-mesaj", { id, mesajlar: g && g.ok ? [[sorumlu(env), g.result.message_id]] : [] });
  await yaz(`${kod} için sorunuz iletildi. Onaylanınca cevap buradan gelecek.`);
  return true;
}

// [✅ Göster] / [❌ Gösterme] — sadece Hemra ve Murat; ilk basan geçerli.
export async function stokSorguDugmesi(env, cq, tg, simdi) {
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [, islem, id] = String(cq.data || "").split(":");
  if (!(muratMi(env, cq.from.id) || String(cq.from.id) === sorumlu(env))) return cevapla("Bu onay Hemra ve Murat'ta.");
  const kim = muratMi(env, cq.from.id) ? "Murat" : "Hemra";
  const s = await stokIste(env, "/sorgu-karar", { id, durum: islem === "g" ? "gosterildi" : "gosterilmedi", kim, zaman: simdi });
  if (!s.ok) {
    const k = s.kayit;
    return cevapla(!k ? "Bu sorgu bulunamadı." : k.durum === "suresi" ? "Bu sorgunun süresi doldu." : `${k.karar_kim || "Karar"} zaten karar verdi.`);
  }
  const r = s.kayit;
  await cevapla(islem === "g" ? "Gösterildi" : "Gösterilmedi");
  await tg(env, "sendMessage", { chat_id: r.kisi, text: islem === "g"
    ? (r.stok == null ? `📦 ${r.kod}: Black Rose'da bu model yok.` : `📦 ${r.kod} · Black Rose stok: ${Math.max(0, r.stok)} adet`)
    : `${r.kod}: stok bilgisi şu an paylaşılamıyor.` });
  const ek = islem === "g" ? `✅ ${kim} gösterdi${r.stok == null ? "" : ` (${Math.max(0, r.stok)} adet)`}` : `❌ ${kim}: gösterilmedi`;
  for (const [chat, mesaj] of r.mesajlar) await tg(env, "editMessageText", { chat_id: chat, message_id: mesaj, text: `${soruMetni(r)}\n\n${ek}`, reply_markup: { inline_keyboard: [] } });
}

// Görev: Hemra 1 saattir cevaplamadıysa Murat'a sor; 24 saatte cevap yoksa sorgu düşer.
export async function stokSorguTakip(env, simdi, tg) {
  const { murataSor, suresi } = await stokIste(env, "/sorgu-bekleyen", { murat: simdi - MURAT_SN, sure: simdi - SURE_SN });
  for (const r of murataSor) {
    const g = await tg(env, "sendMessage", { chat_id: murat(env), text: `${soruMetni(r)}\n(Hemra 1 saattir cevap vermedi)`, reply_markup: klavye(r.id) });
    await stokIste(env, "/sorgu-mesaj", { id: r.id, mesajlar: [...r.mesajlar, ...(g && g.ok ? [[murat(env), g.result.message_id]] : [])], murat: simdi });
  }
  for (const r of suresi) {
    await tg(env, "sendMessage", { chat_id: r.kisi, text: `${r.kod}: sorunuza cevap verilmedi, tekrar sorabilirsiniz.` });
    for (const [chat, mesaj] of r.mesajlar) await tg(env, "editMessageText", { chat_id: chat, message_id: mesaj, text: `${soruMetni(r)}\n\n⌛ Cevap verilmedi (süre doldu)`, reply_markup: { inline_keyboard: [] } });
  }
}

// /stokyetki (sadece Murat): fabrika kişilerine Black Rose stok sorgusu yetkisi ver/kaldır. Celal listede yok.
export async function stokYetkiKomutu(env, m, tg) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Murat'ta." });
  return tg(env, "sendMessage", { chat_id: m.chat.id, ...(await yetkiEkrani(env)) });
}
async function yetkiEkrani(env) {
  const kisiler = await fabrikaKisileri(env, "fabrika");
  const izin = await yetkililer(env);
  if (!kisiler.length) return { text: "Kayıtlı fabrika kişisi yok.", reply_markup: { inline_keyboard: [] } };
  return {
    text: `🔎 Black Rose stok sorgusu yetkisi (/stok 3900). Dokunarak açıp kapatın:\n${kisiler.map((k) => `${izin.includes(String(k.id)) ? "✅" : "⛔"} ${k.ad}`).join("\n")}`,
    reply_markup: { inline_keyboard: kisiler.map((k) => [{ text: `${izin.includes(String(k.id)) ? "✅" : "⛔"} ${k.ad}`, callback_data: `sy:${k.id}` }]) },
  };
}
export async function stokYetkiDugmesi(env, cq, tg) {
  if (!muratMi(env, cq.from.id)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Bu ayar sadece Murat'ta." });
  const id = String(cq.data).split(":")[1];
  const k = await kisiKaydi(env, id);
  if (!k || kisiGrubu(k) !== "fabrika") return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Bu kişiye verilemez." });
  const izin = await yetkililer(env);
  const yeni = izin.includes(id) ? izin.filter((x) => x !== id) : [...izin, id];
  await env.KAYIT.put(YETKI, JSON.stringify(yeni));
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: yeni.includes(id) ? `${k.ad}: yetki verildi` : `${k.ad}: yetki kaldırıldı` });
  return tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, ...(await yetkiEkrani(env)) });
}

// /sorgular (sadece Murat): son 3 günün sorgu kaydı.
export async function sorgularKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Murat'ta." });
  const l = await stokIste(env, "/sorgu-liste", { basla: gunAnahtari(simdi - 2 * 86400), bitis: gunAnahtari(simdi) });
  const durum = { bekliyor: "⏳ bekliyor", gosterildi: "✅ gösterildi", gosterilmedi: "❌ gösterilmedi", suresi: "⌛ cevapsız" };
  const satir = (r) => `${r.gun.slice(8, 10)}.${r.gun.slice(5, 7)} ${saatYaz(r.zaman)} · ${r.ad} · ${r.kod} · ${durum[r.durum] || r.durum}${r.karar_kim ? ` (${r.karar_kim})` : ""}`;
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: l.length ? `🔎 Stok sorguları (son 3 gün, ${l.length}):\n${l.slice(-40).map(satir).join("\n")}` : "Son 3 günde stok sorgusu yok." });
}
