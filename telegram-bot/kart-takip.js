// KART TAKİBİ — TEK HATIRLATMA MERDİVENİ (13 Kasım, Patron — kitap kural 4 ve 39). Patron "geldi mi?" diye hiç sormaz.
// Telegram'ın "gönderildi" demesi kanıt sayılmaz; asıl kanıt kişinin karta BASMASI ya da cevap vermesidir.
// Sami'nin elemana (ekip + fabrika) gönderdiği HER düğmeli kart (eksik listesi, fabrika, repete, görev, fotoğraf görevi) takip edilir
// (StokDO ayar "kartTakip"). Süreler MESAİ süresidir (pazartesi–cumartesi 09:00–20:00); mesai dışında ve pazar günü hiçbir
// hatırlatma gitmez, sabah 09:00'a kalır. Eski 30 dakika / 3 saat / 24 saat kuralları yoktur.
//  • 1 saat basılmazsa kişiye:  "🔔 Hatırlatma: cevap bekleyen kartınız var — <kod> · <konu>. En alttaki karta bakın, düğmeye basın."
//  • 1 saat daha:               "⏰ Son hatırlatma: <kod> · <konu> hâlâ cevap bekliyor."
//  • 1 saat daha: Venom çözer — Hemra'ya kartın yazısı, başında "⏩ <kişi> N saattir cevap vermedi — karar sizde." (kuyruk "kartCevapsiz")
//  • 1 saat daha hâlâ açıksa: Venom Patron'a TEK satır.
//  • Hemra'ya tek tek hatırlatma GİTMEZ: açık işlerinin TOPLU listesi gider (1. ve 2. saatte); 3. saatte Venom Patron'a tek satır.
//  • TEKRAR SORU YASAĞI (kural 39): aynı kişide AYNI kart (aynı yazı + aynı düğmeler) açıkken ikinci kez gönderilmez; açık olan kart geçerlidir.
//  • Deneme modu kartları (🧪 DENEME — …) takip edilmez (kural 40). Kart düğmesiz düzenlenince takipten düşer. Patron'un kartları takip edilmez.
import { mesaiSuresi, mesaiMi } from "./kart-tekrar.js";
import { MOD_SATIR } from "./deneme-modu.js";

const stok = async (env, yol, g = {}) => (await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(g) })).json();
const oku = async (env) => { try { return JSON.parse((await stok(env, "/ayar-oku", { k: "kartTakip" })).v || "[]"); } catch { return []; } };
const yaz = (env, l) => stok(env, "/ayar-yaz", { k: "kartTakip", v: JSON.stringify(l.slice(-300)) }).catch(() => null);
const kml = (x) => String(x || "").split(",").map((y) => y.trim()).filter(Boolean);
export const HATIRLAT_SN = 3600, SON_SN = 2 * 3600, BILDIR_SN = 3 * 3600, PATRON_SN = 4 * 3600;
// Kartın konusu: ilk düğmenin verisinden (aynı konu adı hatırlatmada, Hemra'nın listesinde ve Venom'un satırında kullanılır)
const KONULAR = [[/^fe:/, "eksik listesi kontrolü"], [/^fb:/, "fabrika listesi onayı"], [/^fo:/, "fabrika \"bitti\" onayı"], [/^fc:/, "fabrika siparişi"], [/^f[hk]:/, "fabrikada bitti, karar bekliyor"], [/^ft:/, "yazı teyidi"],
  [/^rk:h/, "repete dağılımı"], [/^rk:a/, "repete adedi teyidi"], [/^rk:f/, "repete siparişi"], [/^rk:t/, "repete teslim sorusu"], [/^(vgk?|vd|gv|hl):/, "görev"]];
export const kartKonusu = (cb, yazi = "") => { const k = KONULAR.find(([re]) => re.test(String(cb || ""))); const foto = /fotoğraf/i.test(yazi); return k ? (k[1] === "görev" && foto ? "fotoğraf görevi" : k[1]) : foto ? "fotoğraf görevi" : "kart"; }; // Aziz'in fotoğraf görevleri de aynı merdivende (kural 51)
export const kartKodu = (yazi) => { const m = String(yazi || "").split("\n").filter((x) => !/DENEME|LİSTESİ –/.test(x)).join(" ").match(/(?<![\d.,:/-])(TEST-\d+|\d{3,6})(?![\d.,:/]\d|\d)/); return m ? m[1] : null; };
// Bir kişinin birden çok kartı TEK mesajda: aynı konudaki kodlar yan yana ("3567, 3596 · fabrika siparişi"); kart tek ise "3394 · fabrika siparişi"
export function kartBasligi(kartlar) {
  const l = [].concat(kartlar), konular = [...new Set(l.map((x) => x.konu || "kart"))];
  return konular.map((k) => { const kodlar = [...new Set(l.filter((x) => (x.konu || "kart") === k && x.kod).map((x) => x.kod))]; return `${kodlar.length ? `${kodlar.join(", ")} · ` : ""}${k}`; }).join("; ");
}
export const hatirlatmaYazisi = (kartlar) => `🔔 Hatırlatma: cevap bekleyen kartınız var — ${kartBasligi(kartlar)}. En alttaki karta bakın, düğmeye basın.`;
export const sonHatirlatmaYazisi = (kartlar) => `⏰ Son hatırlatma: ${kartBasligi(kartlar)} hâlâ cevap bekliyor.`;
const saatYazi = (sn) => { const h = Math.floor(sn / 3600); return h >= 1 ? `${h} saat` : "yeni"; };
export const hemraListesi = (l, simdi) => [`📋 Hemra, cevap bekleyen işleriniz (${l.length}):`, ...l.map((x, i) => `${i + 1}) ${x.kod ? `${x.kod} — ` : ""}${x.konu || "kart"} (${saatYazi(mesaiSuresi(x.zaman, simdi))})`), "Kartları yukarıda, sırayla basabilirsiniz."].join("\n");
const kartYazisi = (g) => String((g && (g.caption || g.text)) || "");
const dugmeIzi = (g) => ((g && g.reply_markup && g.reply_markup.inline_keyboard) || []).flat().map((b) => (b && b.callback_data) || "").join("|");
const kartIzi = (g) => `${kartYazisi(g).trim()}\n${dugmeIzi(g)}`;

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
      const yazi = kartYazisi(govde);
      if (yazi.startsWith(MOD_SATIR.trim())) return; // deneme modu kartı hatırlatmaya girmez (kural 40)
      if (/LİSTESİ – (SONU|BİTTİ)/.test(yazi.split("\n")[0])) return; // liste sonundaki toplu cevap kartı yardımcıdır; asıl kartlar ayrıca takip edilir
      const cb = govde.reply_markup.inline_keyboard.flat().map((b) => b && b.callback_data).find(Boolean) || "";
      const l = await oku(env);
      l.push({ chat, mesaj, zaman: Math.floor(Date.now() / 1000), ozet: yazi.split("\n").filter((x) => !/DENEME – üretim/.test(x)).slice(0, 2).join(" · ").slice(0, 120), kod: kartKodu(yazi), konu: kartKonusu(cb, yazi), yazi: yazi.slice(0, 700), iz: kartIzi(govde).slice(0, 1500) });
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
// TEKRAR SORU YASAĞI (kural 39): bu kişide AYNI kart (aynı yazı + aynı düğmeler) açık mı? Açıksa o kartın mesaj numarası döner
// (Sami'nin tg() katmanı yeni kart GÖNDERMEZ; açık kart geçerli sayılır, hatırlatma merdiveni zaten onu izliyor).
export async function acikAyniKart(env, metod, govde) {
  try {
    if (!/^send(Message|Photo|Video|Document)$/.test(metod) || !govde || typeof govde !== "object" || govde.chat_id == null || !dugmeli(govde)) return null;
    const chat = String(govde.chat_id);
    if (kml(env.MURAT_ID).includes(chat)) return null;
    const iz = kartIzi(govde).slice(0, 1500);
    const x = (await oku(env)).find((y) => !y.bitti && y.chat === chat && y.iz && y.iz === iz);
    return x ? x.mesaj : null;
  } catch { return null; }
}
// 5 dakikalık adım (Sami)
export async function kartTakipAdimi(env, simdi, tg) {
  const l = await oku(env);
  let d = false;
  const adlar = await kayitliKisiler(env);
  // TEK DEFTER: kart ortak defterde kapandıysa (cevaplandı, yenilendi, repete açıldı, eskidi) takip de biter
  let defter = null;
  if (l.some((x) => !x.bitti && mesaiSuresi(x.zaman, simdi) >= HATIRLAT_SN)) { const ds = await stok(env, "/isd-oku", { basla: simdi - 4 * 86400, bitis: simdi + 60, bot: "sami", denemeDahil: true }).catch(() => null); if (Array.isArray(ds)) defter = ds.filter((r) => r.tur === "kart"); }
  const mesaide = mesaiMi(simdi); // mesai dışında (ve pazar) hiçbir hatırlatma gitmez; sabah 09:00'a kalır
  const hemra = [], gruplar = {};
  for (const x of l) {
    if (x.bitti) continue;
    const dk = defter && defter.find((r) => String(r.chat) === x.chat && Number(r.mesaj) === Number(x.mesaj));
    if (dk && dk.durum !== "bekliyor") { x.bitti = simdi; x.neden = `defterde ${dk.durum}`; d = true; continue; }
    if (simdi - x.zaman > 6 * 86400) { x.bitti = simdi; x.neden = "6 gün"; d = true; continue; }
    if (x.eski) continue; // 13 Kasım'dan önce açılmış kart: Patron listeyi onaylamadan hatırlatılmaz
    const kim = adlar[x.chat] || null;
    if (kim === "Hemra") { hemra.push(x); continue; }
    if (!mesaide) continue;
    const gecen = mesaiSuresi(x.zaman, simdi);
    const asama = !x.hat && gecen >= HATIRLAT_SN ? "hat" : x.hat && !x.son && gecen >= SON_SN ? "son" : x.son && !x.bildirildi && gecen >= BILDIR_SN ? "bildir" : x.bildirildi && !x.patron && gecen >= PATRON_SN ? "patron" : null;
    if (asama) { const k = `${asama}|${x.chat}`; (gruplar[k] = gruplar[k] || { asama, chat: x.chat, kim, kartlar: [] }).kartlar.push(x); }
  }
  // Kişi başına TEK mesaj: bir kişinin aynı anda süresi dolan bütün kartları tek hatırlatmada (fabrika listesinde her model ayrı karttır)
  for (const g of Object.values(gruplar)) {
    const eski = [...g.kartlar].sort((a, b) => a.zaman - b.zaman)[0];
    const gecen = Math.max(...g.kartlar.map((x) => mesaiSuresi(x.zaman, simdi)));
    d = true;
    if (g.asama === "hat" || g.asama === "son") {
      const r = await tg(env, "sendMessage", { chat_id: g.chat, text: (g.asama === "hat" ? hatirlatmaYazisi : sonHatirlatmaYazisi)(g.kartlar), reply_to_message_id: eski.mesaj, allow_sending_without_reply: true });
      const iz = { zaman: simdi, ok: Boolean(r && r.ok), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null };
      for (const x of g.kartlar) x[g.asama] = iz;
    } else if (g.asama === "bildir") {
      // Venom'a: araştır (bot engellendi mi? hesap kayıtlı mı?) → Venom Hemra'ya sorar
      const ca = await tg(env, "sendChatAction", { chat_id: g.chat, action: "typing" });
      const engel = ca && !ca.ok ? String(ca.description || "gönderilemiyor") : g.kartlar.map((x) => (x.son && x.son.hata) || (x.hat && x.hat.hata)).find(Boolean) || null;
      for (const x of g.kartlar) x.bildirildi = simdi;
      await stok(env, "/kuyruk-ekle", { ad: "kartCevapsiz", kayit: { id: `kc:${g.chat}:${eski.mesaj}`, chat: g.chat, kim: g.kim, mesaj: eski.mesaj, ozet: eski.ozet, baslik: kartBasligi(g.kartlar), kartlar: g.kartlar.slice(0, 12).map((x) => ({ kod: x.kod || null, konu: x.konu || "kart", yazi: String(x.yazi || x.ozet || "").slice(0, 300) })), saat: Math.floor(gecen / 3600), zaman: eski.zaman, engel, kayitsiz: !g.kim } }).catch(() => null);
    } else {
      for (const x of g.kartlar) x.patron = simdi;
      await stok(env, "/kuyruk-ekle", { ad: "kartCevapsiz", kayit: { id: `kp:${g.chat}:${eski.mesaj}`, patron: true, chat: g.chat, kim: g.kim, baslik: kartBasligi(g.kartlar), saat: Math.floor(gecen / 3600), zaman: eski.zaman } }).catch(() => null);
    }
  }
  // Hemra: tek tek hatırlatma yok — açık işlerinin TOPLU listesi (bir kart 1. ya da 2. saatini doldurunca tek mesaj)
  if (mesaide && hemra.length) {
    const g = (x) => mesaiSuresi(x.zaman, simdi);
    const ilk = hemra.filter((x) => !x.hat && g(x) >= HATIRLAT_SN), son = hemra.filter((x) => x.hat && !x.son && g(x) >= SON_SN);
    const sonListe = Number((await stok(env, "/ayar-oku", { k: "kartTakip:hemraListe" }).catch(() => ({}))).v || 0);
    if ((ilk.length || son.length) && simdi - sonListe >= 3600 - 300) { // saatte en fazla bir liste (arada dolanlar sonraki listeye girer)
      await stok(env, "/ayar-yaz", { k: "kartTakip:hemraListe", v: String(simdi) }).catch(() => null);
      const sirali = [...hemra].sort((a, b) => a.zaman - b.zaman);
      const r = await tg(env, "sendMessage", { chat_id: hemra[0].chat, text: hemraListesi(sirali, simdi) });
      const iz = { zaman: simdi, ok: Boolean(r && r.ok), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null, liste: true };
      for (const x of ilk) x.hat = iz;
      for (const x of son) x.son = iz;
      d = true;
    }
    const gec = hemra.filter((x) => x.son && !x.patron && g(x) >= BILDIR_SN);
    if (gec.length) {
      for (const x of gec) x.patron = simdi;
      d = true;
      await stok(env, "/kuyruk-ekle", { ad: "kartCevapsiz", kayit: { id: `kh:${simdi}`, patron: true, hemra: true, kim: "Hemra", saat: Math.floor(Math.max(...gec.map(g)) / 3600), n: gec.length, baslik: kartBasligi(gec) } }).catch(() => null);
    }
  }
  if (d) await yaz(env, l);
}
