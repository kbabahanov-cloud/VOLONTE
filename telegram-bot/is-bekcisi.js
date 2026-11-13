// 13 Kasım (Patron) — VENOM İŞ BEKÇİSİ: botlar ayakta mı diye değil, İŞ YAPILDI MI diye bakar (her gün 11:00, 15:00, 19:00).
// İlke: Venom önce kendisi çözer (onay bekleyene hatırlatma, öneri kalmadıysa Kemal'i çalıştırma); Patron'a sadece çözülemeyen,
// TEK satır: "Kemal bugün 0 paylaşım — sebep: X — önerim: Y." Bu dosya saf mantıktır (veri okumaz, mesaj göndermez).
export const BEKCI_SAATLERI = [11, 15, 19];
// 09:00–21:00 arası yaklaşık saatte bir paylaşım (günde en fazla 12): o saate kadar beklenen sayı
export const kemalBeklenen = (s) => Math.max(0, Math.min(12, Math.floor(((s - 9) * 60) / 62) + 1));
const yeterli = (cikan, beklenen) => cikan >= Math.max(1, Math.floor(beklenen * 0.7)); // onay ekibe bağlıdır: %70'i yeter

// Kemal: o saate kadar beklenen paylaşım çıktı mı; çıkmadıysa sebep ne, kim çözer
export function kemalBak({ ozet, gun, s, simdi, mesai = true, onceHatirlatti = false }) {
  const beklenen = kemalBeklenen(s);
  if (!ozet) return { ok: false, cikan: null, beklenen, sebep: "Kemal'e ulaşılamadı", oneri: "Claude Code baksın", cozum: null };
  const cikan = Number(ozet.bugunKanal) || 0;
  const t = ozet.tur && ozet.tur.gun === gun ? ozet.tur : null;
  const bekleyen = t ? (t.bekleyen || []).length : 0, sira = (ozet.kuyruk || []).length;
  const taban = { cikan, beklenen, bekleyen, sira };
  if (yeterli(cikan, beklenen) || cikan >= 12) return { ok: true, ...taban };
  if (sira > 0) {
    if (ozet.sonPaylasim && simdi - ozet.sonPaylasim > 2 * 3600 + 600) return { ok: false, ...taban, sebep: `onaylanan ${sira} model sırada ama 2 saattir kanala çıkmadı`, oneri: "Claude Code baksın", cozum: null };
    return { ok: false, ...taban, sebep: `onaylanan ${sira} model sırada, 60 dakika arayla çıkıyor`, cozum: "bekle" };
  }
  if (bekleyen > 0) {
    if (!mesai) return { ok: false, ...taban, sebep: `${bekleyen} öneri kartı onay bekliyor (ekip mesaide değil)`, cozum: "bekle" };
    if (onceHatirlatti) return { ok: false, ...taban, sebep: `${bekleyen} öneri kartı Hemra / Merdan'ın onayında bekliyor, hatırlatma yapıldı ama cevap gelmedi`, oneri: "Hemra'yı arayın", cozum: null };
    return { ok: false, ...taban, sebep: `${bekleyen} öneri kartı Hemra / Merdan'ın onayında bekliyor`, cozum: "hatirlat", oneri: "Hemra'yı arayın" };
  }
  return { ok: false, ...taban, sebep: t ? `öneri kalmadı (bugün ${t.soruldu || 0} model soruldu, hepsi cevaplandı)` : "bugün öneri turu açılmadı", cozum: "calistir", oneri: "\"Kemal'i çalıştır\" yazın" };
}
// Selin: 10:00 fotoğraf listesi gitti mi, cevap geldi mi (cevapsız kalan sorun DEĞİLDİR, ertesi günün listesine kalır — kural 59)
export function selinBak({ ozet, s }) {
  if (s < 10.5) return { ok: true, bilgi: "liste saati henüz gelmedi" };
  if (!ozet) return { ok: false, sebep: "Selin'e ulaşılamadı", oneri: "Claude Code baksın", cozum: null };
  const l = ozet.bugunListe !== undefined ? ozet.bugunListe : (ozet.bugunIstenen ? { n: ozet.bugunIstenen, gelen: null } : null);
  if (!l) return { ok: false, sebep: "bugünkü liste hazırlanamadı (site listesi okunamadı ya da alıcı tanımlı değil)", oneri: "Claude Code baksın", cozum: null };
  if (!l.n) return { ok: true, n: 0, bilgi: "istenecek model yok (stokta olup sitede olmayan model kalmadı)" };
  return { ok: true, n: l.n, gelen: l.gelen, bilgi: `fotoğraf listesi gitti (${l.n} model)${l.gelen == null ? "" : `, ${l.gelen} modelin fotoğrafı geldi`}` };
}
// Sami: dünkü eksik listesi fabrikaya gitti mi (listeler akşam çıkar; bugünkü 19:00'da henüz beklenmez), cevapsız kart var mı
// dun: { mesai, listeler: [{ magaza, asama, model }], giden: sayı, satis: { VOLONTE, BLACKROSE } }
export function samiBak({ dun, s }) {
  if (!dun) return { ok: false, sebep: "Sami'nin liste kaydı okunamadı", oneri: "Claude Code baksın", cozum: null };
  if (!dun.mesai) return { ok: true, bilgi: "dün mesai yoktu" };
  const bekleyen = (dun.listeler || []).filter((l) => ["soruldu", "duzelt", "onayda"].includes(l.asama));
  if (bekleyen.length) return { ok: false, bekleyen: bekleyen.length, sebep: `dünkü eksik listesi hâlâ Hemra'da (${bekleyen.map((l) => `${l.ad} ${l.model} model`).join(", ")})`, cozum: "merdiven", oneri: "Hemra'yı arayın" };
  if (dun.giden > 0) return { ok: true, giden: dun.giden, bilgi: `dünkü eksik listesi fabrikaya gitti (${dun.giden} model)` };
  const sat = Object.values(dun.satis || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!(dun.listeler || []).length) return sat > 0 ? { ok: true, bilgi: "dün satış vardı, istenecek eksik çıkmadı" } : { ok: false, sebep: "dün satış girilmedi, eksik listesi çıkmadı", oneri: "mağazalara satış girişini sorun", cozum: null, s11: true };
  return { ok: true, bilgi: "dünkü listede fabrikadan istenecek model çıkmadı" };
}
const AD = { kemal: "Kemal", selin: "Selin", sami: "Sami" };
// Patron'a gidecek TEK satır (çözülemeyen): "Kemal bugün 0 paylaşım — sebep: X — önerim: Y."
export function patronSatiri(bot, r) {
  const bas = bot === "kemal" ? `Kemal bugün ${r.cikan == null ? "?" : r.cikan} paylaşım${r.beklenen ? ` (bu saate kadar ~${r.beklenen} beklenirdi)` : ""}` : bot === "selin" ? "Selin bugün fotoğraf listesini göndermedi" : "Sami'nin eksik listesi fabrikaya gitmedi";
  return `${bas} — sebep: ${r.sebep} — önerim: ${r.oneri || "Claude Code baksın"}.`;
}
// Raporun durum satırı için kısa "eksik iş" yazısı
export function eksikYazi(bot, r) {
  if (bot === "kemal") return `Kemal ${r.cikan == null ? "?" : r.cikan} paylaşım (beklenen ~${r.beklenen}): ${r.sebep}`;
  return `${AD[bot]}: ${r.sebep}`;
}
// Sohbet cevabı (Patron "işler yapıldı mı" derse): her bot tek satır
export function bekciMetni(k, saatYazi) {
  const sat = (bot, r) => (r.ok ? `✅ ${AD[bot]}: ${bot === "kemal" ? `${r.cikan} paylaşım (bu saate kadar ~${r.beklenen} beklenir)${r.bekleyen ? `, ${r.bekleyen} kart onayda` : ""}${r.sira ? `, ${r.sira} model sırada` : ""}` : r.bilgi}` : `🟠 ${eksikYazi(bot, r)}${r.cozuldu ? ` → ${r.cozuldu}` : ""}`);
  const l = ["kemal", "selin", "sami"].filter((b) => k[b] && !k[b].durdu).map((b) => sat(b, k[b]));
  for (const b of ["kemal", "selin", "sami"]) if (k[b] && k[b].durdu) l.push(`⏸ ${AD[b]} durdurulmuş`);
  return [`🛡 İş kontrolü (${saatYazi})`, ...l].join("\n");
}
