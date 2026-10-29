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
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (String(cq.from.id) !== sorumlu(env) && !(d && d.deneme && String(cq.from.id) === murat(env))) return cevapla("Bu onay Hemra'da.");
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
      return tg(env, "editMessageText", { ...benim, text: `✏️ Listeyi yeniden yazın (örnek: 3183 siyah 10 bej 6).\n\nÖnceki:\n${listeYaz(d.liste)}` });
    }
    // Fabrikaya her model AYRI mesaj: fotoğraf + kod/renk/seri (fiyat, maliyet, kâr, satış, stok YOK)
    Object.assign(d, { asama: "gonderildi", onayZaman: simdi });
    await ayarYaz(env, `fabrika:${ek}`, d);
    await cevapla("Gönderiliyor");
    let giden = 0;
    let kisiSayisi = 0;
    for (const x of d.liste) {
      const rec = await siparisAc(env, { kod: x.kod, renkler: x.renkler, liste: ek, deneme: Boolean(d.deneme), fotoKod: d.deneme ? "3183" : x.kod }, simdi);
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
    await tg(env, "editMessageText", { ...benim, text: `${d.deneme ? DENEME : ""}✅ Fabrikaya gönderildi (${d.liste.length} model, ${kisiSayisi} kişi):\n${listeYaz(d.liste)}` });
    if (!d.deneme) await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fabrikaya giden eksik listesi (onaylayan: ${kisiAd(cq.from)}, ${kisiSayisi} kişi):\n\n${listeYaz(d.liste)}` });
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
    if (await repeteMetni(env, m, tg, Math.floor(Date.now() / 1000))) return;
    return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu bot size sadece VOLONTE fabrika eksik listesini gönderir. Repete gelince: \"3394 geldi\" ya da \"3394 repete geldi siyah 10 bej 6\" yazabilirsiniz." });
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

// ---------- Model başına fabrika siparişi (kullanıcı kararı 29 Ekim) ----------
// Kayıtlar Sami'nin deposunda: "fs:<id>" (açıklar listesi "fs:acik"). Deneme kayıtları "D…" ile başlar, gerçek
// listeye karışmaz; denemede kanal paylaşımı ve silme YAPILMAZ.
export const DENEME = "🧪 DENEME – üretim yapmayın\n";
const SURELER = { 3: "2-3 gün", 5: "5 gün", 7: "1 hafta", 10: "10 gün" };
const kisiAd = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || String(f.id);
const bildirilecekler = (env) => [...new Set([murat(env), sorumlu(env)])];
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
async function siparisYaz(env, rec) {
  await ayarYaz(env, `fs:${rec.id}`, rec);
  const acik = await ayarOku(env, "fs:acik", []);
  const kapali = ["gelecek", "geldi", "kapandi"].includes(rec.durum);
  const yeni = kapali ? acik.filter((x) => x !== rec.id) : acik.includes(rec.id) ? acik : [...acik, rec.id];
  if (yeni.length !== acik.length || yeni.some((x, i) => x !== acik[i])) await ayarYaz(env, "fs:acik", yeni);
}
async function siparisAc(env, { kod, renkler, liste, deneme, fotoKod, tur = "eksik" }, simdi) {
  const id = `${deneme ? "D" : ""}${kod}-${simdi.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const rec = { id, kod, renkler, liste, deneme, fotoKod, tur, durum: "bekliyor", gonderim: simdi, mesajlar: [], log: [] };
  await siparisYaz(env, rec);
  return rec;
}

// Fotoğraf: önce sitedeki (doğruluğu kesin), yoksa Kemal'in kataloğundaki en yeni kanal paylaşımı.
async function fotoBul(env, kod) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/veri/urunler.json`, { cf: { cacheTtl: 60 } });
    const u = r.ok ? (await r.json()).find((x) => String(x.kod) === String(kod)) : null;
    if (u && u.fotolar && u.fotolar.length) return { tur: "site", url: `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${u.fotolar[0]}` };
  } catch { /* site yoksa kanal */ }
  const kanal = await env.KAYIT.get("kanal", "json");
  const gruplar = ((await env.KAYIT.get("kodlar", "json")) || {})[kod] || [];
  const en = [...gruplar].sort((a, b) => b.tarih - a.tarih)[0];
  const id = en && en.ids.find((x) => x > 0);
  return kanal && id ? { tur: "kanal", kanal: kanal.id, id } : null;
}

const siparisMetni = (rec) => `${rec.deneme ? DENEME : ""}${rec.tur === "repete" ? "🔁 Repete isteği\n" : ""}VOLONTE – Model ${rec.kod}${rec.deneme ? " DENEME" : ""}. İstenen: ${renkSeri(rec.renkler)}`;
function klavye(rec) {
  const satir = [];
  if (["bekliyor"].includes(rec.durum)) satir.push([{ text: "✅ Gelecek", callback_data: `fc:g:${rec.id}` }], [{ text: "🔁 Repete olacak", callback_data: `fc:r:${rec.id}` }], [{ text: "❌ Bitti, gelmeyecek", callback_data: `fc:b:${rec.id}` }]);
  if (["repete", "gelecek"].includes(rec.durum)) satir.push([{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]);
  if ((rec.kanalFoto || rec.deneme) && !["geldi", "kapandi"].includes(rec.durum)) satir.push([{ text: "⚠️ Fotoğraf yanlış model", callback_data: `fc:y:${rec.id}` }]);
  return { inline_keyboard: satir };
}

async function fabrikayaGonder(env, rec, tg) {
  let kisiler = await fabrikaKisileri(env);
  if (rec.deneme && !kisiler.length) kisiler = [{ id: Number(murat(env)), ad: "Murat (fabrika kişisi yok)" }];
  const foto = await fotoBul(env, rec.fotoKod || rec.kod);
  rec.kanalFoto = Boolean(foto && foto.tur === "kanal");
  const metin = siparisMetni(rec);
  let giden = 0;
  for (const k of kisiler) {
    let r = null;
    let tur = "foto";
    if (foto && foto.tur === "site") r = await tg(env, "sendPhoto", { chat_id: k.id, photo: foto.url, caption: metin, reply_markup: klavye(rec) });
    else if (foto) r = await tg(env, "copyMessage", { chat_id: k.id, from_chat_id: foto.kanal, message_id: foto.id, caption: metin, reply_markup: klavye(rec) }); // kanal yazısı (fiyat vb.) GİTMEZ: yazı değiştirilir
    if (!r || !r.ok) { tur = "metin"; r = await tg(env, "sendMessage", { chat_id: k.id, text: metin, reply_markup: klavye(rec) }); }
    if (r && r.ok) { giden++; rec.mesajlar.push([k.id, r.result.message_id, tur]); }
  }
  await siparisYaz(env, rec);
  return { giden, kisi: kisiler.length };
}

async function mesajlariGuncelle(env, rec, ek, tg) {
  const metin = `${siparisMetni(rec)}${ek ? `\n\n${ek}` : ""}`;
  for (const [chat, mesaj, tur] of rec.mesajlar) {
    await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: klavye(rec) });
  }
}
async function bildir(env, rec, metin, tg, ekstra = {}) {
  const sonuc = [];
  for (const k of bildirilecekler(env)) {
    const r = await tg(env, "sendMessage", { chat_id: k, text: `${rec.deneme ? DENEME : ""}${metin}`, ...ekstra });
    if (r && r.ok) sonuc.push([k, r.result.message_id]);
  }
  return sonuc;
}
const kararKlavye = (id) => ({ inline_keyboard: [[{ text: "🔁 Repete ver", callback_data: `fk:r:${id}` }, { text: "🗑️ Sil", callback_data: `fk:s:${id}` }, { text: "⏳ Beklesin", callback_data: `fk:b:${id}` }]] });

async function repeteGeldi(env, rec, kim, renkler, tg, simdi) {
  rec.durum = "geldi";
  Object.assign(rec, { geldiZaman: simdi, bildiren: kim, gelenRenkler: renkler && renkler.length ? renkler : rec.renkler });
  rec.log.push(`📦 Repete geldi (${kim})`);
  await siparisYaz(env, rec);
  await mesajlariGuncelle(env, rec, `📦 Repete geldi (${kim} bildirdi)`, tg);
  await bildir(env, rec, `📦 ${rec.kod} repete geldi – ${renkSeri(rec.gelenRenkler).replace(/ seri/g, "")} (${kim} bildirdi)`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Repete geldi bildirildi (${kim})`);
  // Kemal'e haber: paylaşımı hazırlayıp Murat'a ve Hemra'ya onaya gönderir (denemede kanalda PAYLAŞMAZ)
  const sira = (await env.KAYIT.get("venom:repetePaylas", "json")) || [];
  sira.push({ id: rec.id, kod: rec.kod, renkler: rec.gelenRenkler, bildiren: kim, deneme: rec.deneme, liste: rec.liste, zaman: simdi });
  await env.KAYIT.put("venom:repetePaylas", JSON.stringify(sira.slice(-50)));
}

// Fabrika düğmeleri: fc:<g|r|s|b|y|k|e|h>:<id>[:ek]  (fabrika kişileri + ekip)
export async function siparisDugmesi(env, cq, tg, simdi, yetkili) {
  const [, islem, id, ek] = String(cq.data || "").split(":");
  const cevapla = (text, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  if (!yetkili) return cevapla("Yetkiniz yok.");
  const rec = await siparisOku(env, id);
  if (!rec) return cevapla("Bu kayıt artık geçerli değil.");
  const kim = kisiAd(cq.from);
  const benim = cq.message ? { chat_id: cq.message.chat.id, message_id: cq.message.message_id } : null;
  if (islem === "y") {
    rec.fotoYanlis = [...new Set([...(rec.fotoYanlis || []), kim])];
    await siparisYaz(env, rec);
    await bildir(env, rec, `⚠️ ${rec.kod} fotoğrafı yanlış dendi (${kim}).`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `"Fotoğraf yanlış model" basıldı (${kim})`);
    return cevapla("İletildi, teşekkürler");
  }
  if (islem === "k") {
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    if (!["repete", "gelecek", "bekliyor"].includes(rec.durum)) return cevapla("Bu model için repete beklenmiyor.");
    await cevapla("Bildirildi");
    return repeteGeldi(env, rec, kim, null, tg, simdi);
  }
  if (islem === "e" || islem === "h") { // yazıyla bildirimin onayı
    const b = rec.metinBildirim;
    if (!b || String(b.kimId) !== String(cq.from.id)) return cevapla("Bu onay size ait değil.");
    delete rec.metinBildirim;
    await siparisYaz(env, rec);
    if (islem === "h") { await cevapla("Vazgeçildi"); return benim && tg(env, "editMessageText", { ...benim, text: `↩️ ${rec.kod}: bildirim iptal edildi.` }); }
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    await cevapla("Bildirildi");
    if (benim) await tg(env, "editMessageText", { ...benim, text: `✅ ${rec.kod} repete geldi – bildirildi.` });
    return repeteGeldi(env, rec, kim, b.renkler, tg, simdi);
  }
  if (islem === "s") { // repete süresi (sadece "Repete olacak"a basan)
    if (rec.durum !== "sureSoruluyor" || String(rec.cevaplayanId) !== String(cq.from.id)) return cevapla("Bu seçim size ait değil.");
    const gun = Number(ek);
    Object.assign(rec, { durum: "repete", sure: gun, hazirZaman: simdi + gun * 86400 });
    rec.log.push(`🔁 Repete, ${SURELER[gun]} (${kim})`);
    await siparisYaz(env, rec);
    await cevapla(`Repete, ${SURELER[gun]}`);
    await mesajlariGuncelle(env, rec, `🔁 ${rec.cevaplayan} cevapladı: Repete olacak — ${SURELER[gun]}`, tg);
    await bildir(env, rec, `🏭 ${kim} · ${rec.kod} → Repete, ${SURELER[gun]}`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Repete süresi seçildi: ${SURELER[gun]} (${kim})`);
    return;
  }
  // İlk cevap (g/r/b): ilk basan geçerli
  if (rec.durum !== "bekliyor") return cevapla(`${rec.cevaplayan || "Biri"} zaten cevapladı.`);
  Object.assign(rec, { cevaplayan: kim, cevaplayanId: cq.from.id, cevapZaman: simdi });
  if (islem === "g") {
    rec.durum = "gelecek";
    rec.log.push(`✅ Gelecek (${kim})`);
    await siparisYaz(env, rec);
    await cevapla("Gelecek");
    await mesajlariGuncelle(env, rec, `✅ ${kim} cevapladı: Gelecek`, tg);
    await bildir(env, rec, `🏭 ${kim} · ${rec.kod} → Gelecek`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Gelecek (${kim})`);
    return;
  }
  if (islem === "r") {
    rec.durum = "sureSoruluyor";
    rec.log.push(`🔁 Repete olacak (${kim})`);
    await siparisYaz(env, rec);
    await cevapla("Ne zaman hazır olur?");
    for (const [chat, mesaj, tur] of rec.mesajlar) {
      const benimMi = benim && String(chat) === String(benim.chat_id) && mesaj === benim.message_id;
      const metin = `${siparisMetni(rec)}\n\n🔁 ${kim} cevapladı: Repete olacak${benimMi ? "\nNe zaman hazır olur?" : " (süre soruluyor)"}`;
      const kl = benimMi ? { inline_keyboard: [Object.entries(SURELER).map(([g, ad]) => ({ text: ad, callback_data: `fc:s:${rec.id}:${g}` }))] } : { inline_keyboard: [] };
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: kl });
    }
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Repete olacak (${kim})`);
    return;
  }
  if (islem === "b") {
    rec.durum = "bitti";
    rec.log.push(`❌ Bitti, gelmeyecek (${kim})`);
    await cevapla("Bitti");
    await mesajlariGuncelle(env, rec, `❌ ${kim} cevapladı: Bitti, gelmeyecek`, tg);
    rec.kararMesajlari = await bildir(env, rec, `🏭 ${kim} · ${rec.kod} → Bitti, gelmeyecek\n\n${rec.kod} – fabrika bitti dedi. Ne yapalım?`, tg, { reply_markup: kararKlavye(rec.id) });
    await siparisYaz(env, rec);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Bitti (${kim})`);
    return;
  }
  return cevapla("Geçersiz düğme.");
}

// "Bitti" kararı (Murat / Hemra): fk:<r|s|b|S|v>:<id> — ilk basan geçerli; Sil için ikinci onay.
export async function kararDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!bildirilecekler(env).includes(String(cq.from.id))) return cevapla("Bu karar Murat ve Hemra'da.");
  const rec = await siparisOku(env, id);
  if (!rec || rec.durum !== "bitti") return cevapla("Bu karar artık geçerli değil.");
  if (rec.karar && rec.karar !== "beklesin") return cevapla(`${rec.kararVeren} zaten karar verdi.`);
  const kim = kisiAd(cq.from);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  const hepsiniYaz = async (metin) => { for (const [chat, mesaj] of rec.kararMesajlari || []) await tg(env, "editMessageText", { chat_id: chat, message_id: mesaj, text: `${rec.deneme ? DENEME : ""}${metin}` }); };
  if (islem === "v") { await cevapla("Vazgeçildi"); return tg(env, "editMessageText", { ...benim, text: `${rec.deneme ? DENEME : ""}${rec.kod} – fabrika bitti dedi. Ne yapalım?`, reply_markup: kararKlavye(rec.id) }); }
  if (islem === "s") {
    const ids = [...new Set((((await env.KAYIT.get("kodlar", "json")) || {})[rec.kod] || []).flatMap((g) => g.ids))].filter((x) => x > 0);
    await cevapla("Emin misiniz?");
    return tg(env, "editMessageText", { ...benim, text: `${rec.deneme ? DENEME : ""}🗑️ ${rec.kod}: kanalda ${ids.length} paylaşım silinecek, siteden de kaldırılacak. Geri alınamaz. Emin misiniz?`, reply_markup: { inline_keyboard: [[{ text: "Evet, sil", callback_data: `fk:S:${rec.id}` }, { text: "Vazgeç", callback_data: `fk:v:${rec.id}` }]] } });
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
    const yeni = await siparisAc(env, { kod: rec.kod, renkler: rec.renkler, liste: rec.liste, deneme: rec.deneme, fotoKod: rec.fotoKod, tur: "repete" }, simdi);
    return fabrikayaGonder(env, yeni, tg);
  }
  // Sil
  rec.durum = "kapandi";
  await siparisYaz(env, rec);
  await cevapla(rec.deneme ? "Deneme: silinmedi" : "Siliniyor");
  if (rec.deneme) return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi — DENEME olduğu için siteden ve kanaldan hiçbir şey silinmedi.`);
  await stokIste(env, "/gizle", { kod: rec.kod, kim, simdi });
  for (const anahtar of ["venom:kanalSil", "venom:siteSil"]) {
    const l = (await env.KAYIT.get(anahtar, "json")) || [];
    l.push({ kod: rec.kod, kim, zaman: simdi });
    await env.KAYIT.put(anahtar, JSON.stringify(l.slice(-50)));
  }
  return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi. Siteden (Selin) ve Telegram kanalından (Kemal) kaldırılıyor; Kemal turlarında artık önerilmeyecek.`);
}

// Yazıyla repete bildirimi: "3394 geldi" / "3394 repete geldi siyah 10 bej 6" (fabrika kişileri + ekip)
export async function repeteMetni(env, m, tg, simdi) {
  const metin = String(m.text || "").trim();
  const r = metin.match(/^(\d{4,6})\s+(?:repete\s+)?geldi\b(.*)$/is);
  if (!r) return false;
  const kod = r[1];
  const renkler = listeCoz(`${kod} ${r[2]}`)[0]?.renkler || null;
  const acik = await ayarOku(env, "fs:acik", []);
  let rec = null;
  for (const id of [...acik].reverse()) {
    const x = await siparisOku(env, id);
    if (x && x.kod === kod && !x.deneme && ["repete", "gelecek", "bekliyor", "sureSoruluyor"].includes(x.durum)) { rec = x; break; }
  }
  if (!rec) rec = await siparisAc(env, { kod, renkler: renkler || [], liste: "metin", deneme: false, fotoKod: kod, tur: "repete" }, simdi); // erken / listesiz bildirim
  rec.metinBildirim = { kimId: m.from.id, renkler };
  if (rec.durum === "bekliyor" && rec.liste === "metin") rec.durum = "repete";
  await siparisYaz(env, rec);
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} repete geldi${renkler ? ` – ${renkSeri(renkler).replace(/ seri/g, "")}` : ""}, doğru mu?`, reply_markup: { inline_keyboard: [[{ text: "Evet", callback_data: `fc:e:${rec.id}` }, { text: "Hayır", callback_data: `fc:h:${rec.id}` }]] } });
  return true;
}

// 5 dakikalık görev: 24 saat cevapsız → bir hatırlatma; repete süresi dolunca bir kez "hazır mı?";
// "Beklesin" 7 gün dolunca karar yeniden sorulur; deneme 48 saatte bitmezse özet.
export async function siparisTakip(env, simdi, tg) {
  const acik = await ayarOku(env, "fs:acik", []);
  for (const id of acik.slice(0, 40)) {
    const rec = await siparisOku(env, id);
    if (!rec) continue;
    const kisiler = rec.mesajlar.map(([chat, mesaj]) => [chat, mesaj]);
    if (rec.durum === "bekliyor" && simdi - rec.gonderim >= 86400 && !rec.hatirlatildi) {
      rec.hatirlatildi = true;
      await siparisYaz(env, rec);
      for (const [chat, mesaj] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${rec.deneme ? DENEME : ""}⏰ VOLONTE – Model ${rec.kod}: cevabınızı bekliyoruz (✅ Gelecek / 🔁 Repete / ❌ Bitti).`, reply_to_message_id: mesaj });
    } else if (rec.durum === "repete" && rec.hazirZaman && simdi >= rec.hazirZaman && !rec.hazirSoruldu) {
      rec.hazirSoruldu = true;
      await siparisYaz(env, rec);
      for (const [chat] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${rec.deneme ? DENEME : ""}${rec.kod} repetesi hazır mı?`, reply_markup: { inline_keyboard: [[{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]] } });
    } else if (rec.durum === "bitti" && rec.karar === "beklesin" && simdi >= rec.beklesinZaman && !rec.tekrarSoruldu) {
      rec.tekrarSoruldu = true;
      rec.karar = null;
      rec.kararMesajlari = await bildir(env, rec, `⏳ ${rec.kod} – 7 gün doldu. Fabrika bitti demişti. Ne yapalım?`, tg, { reply_markup: kararKlavye(rec.id) });
      await siparisYaz(env, rec);
    }
  }
  for (const did of await ayarOku(env, "fabrika:denemeler", [])) {
    const k = await env.KAYIT.get(`venom:deneme:${did}`, "json");
    if (k && !k.ozet && simdi - k.basla > 48 * 3600) await denemeOzeti(env, did, tg, "sure");
  }
}

// /fabrikadeneme (sadece Murat): uydurma modelle bütün akış
export async function fabrikaDenemesi(env, m, tg, simdi) {
  if (String(m.from.id) !== murat(env)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Murat'ta." });
  const did = `D${simdi.toString(36)}`;
  const liste = [{ kod: "9999", renkler: [{ renk: "siyah", adet: 2 }, { renk: "bej", adet: 1 }] }];
  await ayarYaz(env, `fabrika:${did}`, { asama: "onayda", liste, deneme: true, yazan: "deneme" });
  await ayarYaz(env, "fabrika:denemeler", [...(await ayarOku(env, "fabrika:denemeler", [])).slice(-10), did]);
  await denemeKaydi(env, did, `Deneme başladı (${kisiAd(m.from)})`);
  await tg(env, "sendMessage", {
    chat_id: sorumlu(env),
    text: `${DENEME}📋 Fabrikaya gidecek liste (deneme):\n9999 DENEME — siyah 2, bej 1\n\nFabrikaya gönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `fb:o:${did}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${did}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: `🧪 Deneme başladı: Hemra'ya onay kartı gitti. Bütün adımlar "🧪 DENEME" ile işaretli; kanalda paylaşım ve silme yapılmaz. Bitince size özet gelecek.` });
}
