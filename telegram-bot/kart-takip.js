// KART TAKİBİ (11 Kasım, Patron kalıcı kuralı 54): Patron "geldi mi?" diye hiç sormaz.
// Telegram'ın "gönderildi" demesi kanıt sayılmaz; asıl kanıt kişinin karta BASMASI ya da cevap vermesidir.
// Sami'nin elemana (ekip + fabrika) gönderdiği her düğmeli kart takip edilir (StokDO ayar "kartTakip"):
//  • 30 dk (mesai süresi, hafta içi 09–20) basılmazsa kişiye BİR kez: "Size kart geldi, en alttaki karta bakın" (karta yanıt olarak).
//  • 1 saat sonra hâlâ basılmamışsa Sami araştırır (bot engellendi mi? kart kayıtlı bir hesaba mı gitti?) ve Venom'a bildirir
//    (kuyruk "kartCevapsiz"): Venom Hemra'ya yazar (Sami üzerinden); çözemediği durum (engel / kayıtsız hesap) Patron'a TEK satır.
//  • Kart düğmesiz düzenlenince (cevaplandı, kapandı, yenilendi) takipten düşer. Patron'un kartları takip edilmez.
import { mesaiSuresi } from "./kart-tekrar.js";

const stok = async (env, yol, g = {}) => (await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(g) })).json();
const oku = async (env) => { try { return JSON.parse((await stok(env, "/ayar-oku", { k: "kartTakip" })).v || "[]"); } catch { return []; } };
const yaz = (env, l) => stok(env, "/ayar-yaz", { k: "kartTakip", v: JSON.stringify(l.slice(-300)) }).catch(() => null);
const kml = (x) => String(x || "").split(",").map((y) => y.trim()).filter(Boolean);
export const HATIRLAT_SN = 30 * 60, BILDIR_SN = 60 * 60;
export const HATIRLATMA_YAZI = "🔔 Size kart geldi, en alttaki karta bakın (düğmeye basın).";

// Kişi adları (kayıtlı hesaplar): ekip kimlikleri + fabrika kişileri
export async function kayitliKisiler(env) {
  const ad = {};
  for (const [k, a] of [["HEMRA_ID", "Hemra"], ["FABRIKA_SORUMLU", "Hemra"], ["AZIZ_ID", "Aziz"], ["BR_SORUMLU", "Merdan"], ["FUAT_ID", "Fuat"], ["NURI_ID", "Nuri"]]) for (const id of kml(env[k])) ad[id] = ad[id] || a;
  const fk = (await env.KAYIT.get("sami:fabrikaKisiler", "json").catch(() => null)) || [];
  for (const p of fk) ad[String(p.id)] = ad[String(p.id)] || p.ad;
  return ad;
}
const dugmeli = (g) => Boolean(g && g.reply_markup && Array.isArray(g.reply_markup.inline_keyboard) && g.reply_markup.inline_keyboard.flat().some((b) => b && b.callback_data));
// Sami'nin tg() katmanından: her gönderim/düzenleme sonrası
export async function kartIzle(env, metod, govde, r) {
  try {
    if (!r || !r.ok || !govde || typeof govde !== "object" || govde.chat_id == null) return;
    const chat = String(govde.chat_id);
    if (kml(env.MURAT_ID).includes(chat)) return; // Patron'un kartı takip edilmez
    if (/^(send|copy)/.test(metod) && dugmeli(govde)) {
      const mesaj = r.result && r.result.message_id;
      if (!mesaj) return;
      const l = await oku(env);
      l.push({ chat, mesaj, zaman: Math.floor(Date.now() / 1000), ozet: String(govde.caption || govde.text || "").split("\n").filter((x) => !/DENEME – üretim/.test(x)).slice(0, 2).join(" · ").slice(0, 120) });
      return yaz(env, l);
    }
    if (/^edit/.test(metod) && govde.message_id && !dugmeli(govde)) { // düğmesiz düzenleme: cevaplandı / kapandı
      const l = await oku(env);
      const x = l.find((y) => y.chat === chat && y.mesaj === govde.message_id && !y.bitti);
      if (x) { x.bitti = Math.floor(Date.now() / 1000); x.neden = "düzenlendi"; return yaz(env, l); }
    }
  } catch { /* takip işi durdurmaz */ }
}
// Kişi karta bastı (callback) ya da o sohbete yazdı → o sohbetin bekleyen kartları "cevaplandı"
export async function kartBasildi(env, chat, mesaj = null) {
  try {
    const l = await oku(env);
    let d = false;
    for (const x of l) if (!x.bitti && x.chat === String(chat) && (mesaj == null || x.mesaj === mesaj)) { x.bitti = Math.floor(Date.now() / 1000); x.neden = mesaj == null ? "cevap yazdı" : "bastı"; d = true; }
    if (d) await yaz(env, l);
  } catch { /* */ }
}
// 5 dakikalık adım (Sami)
export async function kartTakipAdimi(env, simdi, tg) {
  const l = await oku(env);
  let d = false;
  const adlar = await kayitliKisiler(env);
  for (const x of l) {
    if (x.bitti) continue;
    if (simdi - x.zaman > 3 * 86400) { x.bitti = simdi; x.neden = "3 gün"; d = true; continue; }
    const gecen = mesaiSuresi(x.zaman, simdi);
    if (!x.hat && gecen >= HATIRLAT_SN) {
      const r = await tg(env, "sendMessage", { chat_id: x.chat, text: HATIRLATMA_YAZI, reply_to_message_id: x.mesaj, allow_sending_without_reply: true });
      x.hat = { zaman: simdi, ok: Boolean(r && r.ok), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null };
      d = true;
    } else if (x.hat && !x.bildirildi && gecen >= BILDIR_SN) {
      // araştır: bot engellendi mi? hesap kayıtlı mı?
      const ca = await tg(env, "sendChatAction", { chat_id: x.chat, action: "typing" });
      const engel = ca && !ca.ok ? String(ca.description || "gönderilemiyor") : x.hat && x.hat.hata ? x.hat.hata : null;
      const kim = adlar[x.chat] || null;
      x.bildirildi = simdi; d = true;
      await stok(env, "/kuyruk-ekle", { ad: "kartCevapsiz", kayit: { id: `kc:${x.chat}:${x.mesaj}`, chat: x.chat, kim, mesaj: x.mesaj, ozet: x.ozet, zaman: x.zaman, engel, kayitsiz: !kim } }).catch(() => null);
    }
  }
  if (d) await yaz(env, l);
}
