// FABRİKA EKSİK LİSTESİ (Sayım Sami, kullanıcı kararı 29 Ekim)
//  20:05 — o gün satılan modeller (belge tipi 21, köprü sadece okur): kod, bugün satılan, stokta kalan → Hemra'ya.
//          "Fabrikaya ne isteyelim? Renkleriyle yazın" (daha önce yazılan renkler hazır sorulur).
//  Hemra yazar → Sami düzgün listeye çevirir → ✅ Onayla / ✏️ Düzelt.
//  Onay → fabrikadaki kişilere (Murat'ın onayladığı Nuri, Sinem, Fuat) SADECE kod, renk, adet; Murat'a bilgi kopyası.
//  21:00 cevap yoksa bir hatırlatma; 22:00'de hâlâ onay yoksa Murat'a "Hemra onaylamadı".
//  Fabrika kişileri /start yazınca Murat'a sorulur; eklenen kişi sadece listeyi alır, başka komut kullanamaz.
//  Satış verisi "sami:satisAcik" = "1" olana kadar kullanılmaz (köprünün satış okuması denemeyle doğrulanınca açılır).

import { stokIste } from "./stokbot.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const gunGoster = (g) => g.split("-").reverse().join(".");
const LISTE_SAATI = 20 + 5 / 60;   // 20:05 (köprünün 20:00 gönderiminden sonra)
const HATIRLATMA_SAATI = 21;
const MURAT_HABER_SAATI = 22;

export const sorumlu = (env) => String(env.FABRIKA_SORUMLU || "6448681578");
export const murat = (env) => String(env.MURAT_ID || "2005113508");

async function ayarOku(env, k, bos) {
  const v = (await stokIste(env, "/ayar-oku", { k })).v;
  return v == null ? bos : JSON.parse(v);
}
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });

export const fabrikaKisileri = async (env) => (await env.KAYIT.get("sami:fabrikaKisiler", "json")) || [];
export const fabrikaKisisiMi = async (env, id) => (await fabrikaKisileri(env)).some((k) => String(k.id) === String(id));

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

export const listeYaz = (liste) => liste.map((x) => `${x.kod} — ${x.renkler.map((r) => `${r.renk} ${r.adet}`).join(", ")}`).join("\n");

// 20:05 — Hemra'ya günün satış listesi
export async function fabrikaAdimi(env, simdi, tg) {
  const s = saat(simdi);
  const gun = gunAnahtari(simdi);
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  if (!d) {
    if (s < LISTE_SAATI || s >= 23) return;
    if ((await env.KAYIT.get("sami:satisAcik")) !== "1") return; // satış okuması henüz doğrulanmadı
    const satislar = await stokIste(env, "/satislar", { gun });
    if (!satislar.length) { await ayarYaz(env, `fabrika:${gun}`, { asama: "satisYok" }); return; }
    const renkler = await ayarOku(env, "fabrika:renkler", {});
    const satirlar = satislar.map((x) => `${x.kod} · satılan ${x.satilan} · stokta ${x.kalan == null ? "—" : Math.max(0, x.kalan)}`);
    const hazir = satislar.filter((x) => renkler[x.kod] && renkler[x.kod].length).map((x) => `${x.kod}: ${renkler[x.kod].join(", ")}?`);
    const metin = [
      `🏭 ${gunGoster(gun)} — bugün satılan modeller (${satislar.length}):`,
      ...satirlar,
      "",
      "Fabrikaya ne isteyelim? Renkleriyle yazın, örnek: 3183 siyah 10 bej 6",
      ...(hazir.length ? ["", "Daha önce yazdığınız renkler:", ...hazir] : []),
    ].join("\n");
    await tg(env, "sendMessage", { chat_id: sorumlu(env), text: metin.slice(0, 4000) });
    await ayarYaz(env, `fabrika:${gun}`, { asama: "soruldu", zaman: simdi });
    return;
  }
  if (["soruldu", "duzelt", "onayda"].includes(d.asama)) {
    if (s >= HATIRLATMA_SAATI && !d.hatirlatildi) {
      d.hatirlatildi = true;
      await ayarYaz(env, `fabrika:${gun}`, d);
      await tg(env, "sendMessage", { chat_id: sorumlu(env), text: d.asama === "onayda" ? "⏰ Fabrika listesi onayınızı bekliyor (✅ Onayla / ✏️ Düzelt)." : "⏰ Hatırlatma: fabrikaya ne isteyelim? Renkleriyle yazın, örnek: 3183 siyah 10 bej 6" });
    } else if (s >= MURAT_HABER_SAATI && !d.muratHaber) {
      d.muratHaber = true;
      await ayarYaz(env, `fabrika:${gun}`, d);
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ ${gunGoster(gun)} fabrika eksik listesi: Hemra onaylamadı (liste fabrikaya gitmedi).` });
    }
  }
}

// Hemra'nın yazısı (liste bekleniyorsa). true dönerse mesaj işlendi.
export async function fabrikaCevabi(env, m, tg, simdi) {
  if (String(m.from.id) !== sorumlu(env)) return false;
  const metin = String(m.text || "").trim();
  if (!/^\d{4,6}\b/.test(metin)) return false;
  const gun = gunAnahtari(simdi);
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  if (!d || !["soruldu", "duzelt", "onayda"].includes(d.asama)) return false;
  const liste = listeCoz(metin);
  if (!liste.length) {
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Anlayamadım. Örnek: 3183 siyah 10 bej 6, 3186 kırmızı 5" });
    return true;
  }
  Object.assign(d, { asama: "onayda", liste, yazan: m.from.first_name || "Hemra" });
  await ayarYaz(env, `fabrika:${gun}`, d);
  await tg(env, "sendMessage", {
    chat_id: m.chat.id,
    text: `📋 Fabrikaya gidecek liste (${gunGoster(gun)}):\n${listeYaz(liste)}\n\nFabrikaya gönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `fb:o:${gun}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${gun}` }]] },
  });
  return true;
}

// Düğmeler: fb:o|d:<gün> (Hemra), fa:e|h:<kişi> (Murat: fabrika kişisi ekle / ekleme)
export async function fabrikaDugmesi(env, cq, tg, simdi) {
  const [tur, islem, ek] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (tur === "fb") {
    if (String(cq.from.id) !== sorumlu(env)) return cevapla("Bu onay Hemra'da.");
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (!d || d.asama !== "onayda") return cevapla(d && d.asama === "gonderildi" ? "Zaten gönderildi." : "Bu liste artık geçerli değil.");
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "d") {
      d.asama = "duzelt";
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla("Düzeltin");
      return tg(env, "editMessageText", { ...benim, text: `✏️ Listeyi yeniden yazın (örnek: 3183 siyah 10 bej 6).\n\nÖnceki:\n${listeYaz(d.liste)}` });
    }
    const kisiler = await fabrikaKisileri(env);
    // Fabrikaya SADECE kod, renk, adet (fiyat, maliyet, kâr, satış adedi yok)
    const fabrikaMetni = `🏭 VOLONTE eksik listesi — ${gunGoster(ek)}\n\n${listeYaz(d.liste)}`;
    let giden = 0;
    for (const k of kisiler) { const r = await tg(env, "sendMessage", { chat_id: k.id, text: fabrikaMetni }); if (r && r.ok) giden++; }
    const renkler = await ayarOku(env, "fabrika:renkler", {});
    for (const x of d.liste) renkler[x.kod] = [...new Set([...x.renkler.map((r) => r.renk), ...(renkler[x.kod] || [])])].slice(0, 8);
    await ayarYaz(env, "fabrika:renkler", renkler);
    Object.assign(d, { asama: "gonderildi", onayZaman: simdi, giden });
    await ayarYaz(env, `fabrika:${ek}`, d);
    await cevapla("Gönderildi");
    await tg(env, "editMessageText", { ...benim, text: `✅ Fabrikaya gönderildi (${giden}/${kisiler.length} kişi):\n${listeYaz(d.liste)}` });
    await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fabrikaya giden eksik listesi (onaylayan: ${cq.from.first_name || "Hemra"}, ${giden}/${kisiler.length} kişiye ulaştı):\n\n${listeYaz(d.liste)}` });
    return;
  }
  if (tur === "fa") {
    if (String(cq.from.id) !== murat(env)) return cevapla("Bu onay Murat'ta.");
    const aday = await env.KAYIT.get(`sami:fabrikaAday:${ek}`, "json");
    if (!aday) return cevapla("Bu istek artık geçerli değil.");
    await env.KAYIT.delete(`sami:fabrikaAday:${ek}`);
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "h") {
      await cevapla("Eklenmedi");
      return tg(env, "editMessageText", { ...benim, text: `❌ ${aday.ad} fabrika listesine eklenmedi.` });
    }
    const kisiler = await fabrikaKisileri(env);
    if (!kisiler.some((k) => String(k.id) === String(ek))) kisiler.push({ id: Number(ek), ad: aday.ad, kullanici: aday.kullanici });
    await env.KAYIT.put("sami:fabrikaKisiler", JSON.stringify(kisiler));
    await cevapla("Eklendi");
    await tg(env, "editMessageText", { ...benim, text: `✅ ${aday.ad} fabrika listesine eklendi (toplam ${kisiler.length} kişi).` });
    return tg(env, "sendMessage", { chat_id: Number(ek), text: "✅ VOLONTE fabrika listesine eklendiniz. Eksik listeleri buradan alacaksınız." });
  }
  return false;
}

// Yetkisiz kişi yazınca: fabrika kişisiyse kısa cevap; değilse /start ile Murat'a sorulur (bir kez).
export async function yabanciMesaji(env, m, tg) {
  if (await fabrikaKisisiMi(env, m.from.id)) {
    return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu bot size sadece VOLONTE fabrika eksik listesini gönderir." });
  }
  if (!/^\/start\b/i.test(String(m.text || "").trim())) return;
  if (await env.KAYIT.get(`sami:fabrikaAday:${m.from.id}`)) return;
  const ad = [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username || String(m.from.id);
  await env.KAYIT.put(`sami:fabrikaAday:${m.from.id}`, JSON.stringify({ ad, kullanici: m.from.username || null }), { expirationTtl: 30 * 86400 });
  await tg(env, "sendMessage", {
    chat_id: murat(env),
    text: `🏭 ${ad}${m.from.username ? ` (@${m.from.username})` : ""} Sami'ye /start yazdı. Fabrika eksik listesini alsın mı?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Fabrika listesine ekle", callback_data: `fa:e:${m.from.id}` }, { text: "❌ Ekleme", callback_data: `fa:h:${m.from.id}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Merhaba! İsteğiniz yöneticiye iletildi; onaylanınca eksik listelerini buradan alacaksınız." });
}
