// EKİP DÜZENİ (9 Kasım, Patron; kural kitabında): Hemra koordinatör, Aziz VOLONTE stoğu, Merdan Black Rose.
// - VOLONTE stok işleri doğrudan Aziz'e, Black Rose işleri doğrudan Merdan'a. Onay merdiveninden sonra (kart bir kez yeniden + 3 saat)
//   hâlâ çözülmezse iş HEMRA'NIN LİSTESİNE düşer. Venom'un çözemediği işler de Patron'a değil Hemra'nın listesine.
// - Hemra'ya tek tek kart değil, günde 2 TOPLU liste (hafta içi 11:00 ve 16:00): her satırda [Aziz'e ver] [Merdan'a ver] [Ben hallederim]
//   [Patron'a sor]. Seçilen kişiye kart kendiliğinden gider; "Patron'a sor" akşam özetine girer.
// - Yedek: Hemra izinliyse ya da o gün hiç cevap vermediyse koordinasyon o gün Merdan'a geçer.
import { KISILER, kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";
import { mesaiSuresi } from "./kart-tekrar.js";
import { BILGI_KARTI } from "./tek-defter.js";

const SAAT_FARKI = 3 * 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const haftaIci = (t) => { const g = new Date((t + SAAT_FARKI) * 1000).getUTCDay(); return g >= 1 && g <= 5; };
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json").catch(() => null)) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined).catch(() => null);
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);
export const LISTE_SAATLERI = [11, 16];
export const SECENEK = { a: ["👤 Aziz'e ver", "aziz"], m: ["👤 Merdan'a ver", "merdan"], h: ["✋ Ben hallederim", null], p: ["❓ Patron'a sor", null] };
export const kisiId = (env, kim) => (KISILER[kim] ? String(KISILER[kim].id(env) || "") : "");
// Marka → doğrudan sorumlu (VOLONTE stok = Aziz, Black Rose = Merdan); bilinmiyorsa koordinatör
export const markaSorumlusu = (marka) => (marka === "BLACKROSE" ? "merdan" : marka === "VOLONTE" ? "aziz" : null);
// Bugünün koordinatörü: Hemra; izinliyse ya da 11:00 listesine hiç cevap vermediyse (16:00'da) Merdan
export async function koordinator(env, simdi) {
  if ((await env.KAYIT.get("venom:hemraIzinli").catch(() => null)) === gunAnahtari(simdi)) return "merdan";
  const l = await oku(env, "venom:hemraListe", []);
  const bugun = l.filter((x) => gunAnahtari(x.zaman) === gunAnahtari(simdi) && x.gonderildi && x.gonderildi < simdi - 3 * 3600);
  if (saat(simdi) >= 16 && bugun.length && !bugun.some((x) => x.durum !== "bekliyor")) return "merdan";
  return "hemra";
}
// Listeye ekle (aynı iş iki kez eklenmez). x: { tur: "kart"|"cozum"|"gorev", ozet, ref, bot, chat, mesaj, isdId, cid, kod }
export async function listeyeEkle(env, x, simdi) {
  if (BILGI_KARTI.test(String(x.ozet || ""))) return null; // 11 Kasım: bilgi satırı (rapor) Hemra'nın kartına girmez
  const l = await oku(env, "venom:hemraListe", []);
  if (l.some((y) => y.ref === x.ref && (y.durum === "bekliyor" || simdi - y.zaman < 3 * 86400))) return null; // 11 Kasım: cevaplanan / dağıtılan soru bir daha sorulmaz
  const kayit = { id: kisaId(), zaman: simdi, durum: "bekliyor", ...x };
  await kaydet(env, "venom:hemraListe", [...l.filter((y) => y.durum === "bekliyor" || simdi - y.zaman < 7 * 86400), kayit].slice(-150), 14 * 86400);
  return kayit;
}
// 11 Kasım (TEK DEFTER, Patron): Hemra'nın kartı SADECE tek defterden üretilir.
// Onay merdiveninden sonra hâlâ cevapsız (Aziz / Merdan) işler → listeye; her İŞ tek satır (aynı kartın kopyaları tek iş).
// defter: defterOku(env, simdi) sonucu
export async function eskalasyonTopla(env, simdi, defter) {
  const az = kisiId(env, "aziz"), me = kisiId(env, "merdan");
  let n = 0;
  for (const x of ((defter && defter.satirlar) || []).filter((s) => s.tur === "kart" && s.durum === "acik" && [az, me].includes(String(s.kimId)) && s.ek && s.ek.hatirlatildi && mesaiSuresi(Number(s.ek.hatirlatildi), simdi) >= 3 * 3600)) {
    if (await listeyeEkle(env, { tur: "kart", ref: x.id, isdId: x.ek.isdId, bot: x.bot, chat: x.ek.chat, mesaj: x.ek.mesaj, kod: x.kod, ozet: `${x.kod ? `${x.kod}: ` : ""}${String(x.ne).replace(new RegExp(`^${x.kod || "\\u0000"}\\s*[:·–-]\\s*`), "")} — ${x.kim} cevap vermedi` }, simdi)) n++;
  }
  return n;
}
// Listede bekleyen iş hâlâ açık mı? (tek defterde kapandıysa listeden düşer: cevaplandı, yenilendi, repete açıldı, eskidi)
export async function listeyiTemizle(env, simdi, defter) {
  const l = await oku(env, "venom:hemraListe", []);
  const acikRef = new Set(((defter && defter.satirlar) || []).filter((s) => s.tur === "kart" && s.durum === "acik").map((s) => s.id));
  const acikIsd = new Set(((defter && defter.satirlar) || []).filter((s) => s.tur === "kart" && s.durum === "acik").map((s) => Number(s.ek && s.ek.isdId)));
  const cozum = await oku(env, "venom:cozum", []);
  let n = 0;
  for (const x of l) {
    if (x.durum !== "bekliyor") continue;
    const acik = x.tur === "kart" ? (String(x.ref).startsWith("kart:") ? acikRef.has(x.ref) : acikIsd.has(Number(x.isdId)))
      : x.tur === "cozum" ? cozum.some((c) => c.id === x.cid && c.durum === "listede") && simdi - x.zaman < 3 * 86400
        : simdi - x.zaman < 3 * 86400;
    if (!acik || BILGI_KARTI.test(String(x.ozet || ""))) { x.durum = "kapandi"; x.kapanis = simdi; n++; } // rapor = bilgi satırı; Hemra'nın kartına girmez
  }
  // aynı model + aynı iş yazısı iki kez durmaz
  const gorulen = new Set();
  for (const x of l) { if (x.durum !== "bekliyor") continue; const a = `${x.kod || ""}|${String(x.ozet).slice(0, 60)}`; if (gorulen.has(a)) { x.durum = "kapandi"; x.kapanis = simdi; n++; } else gorulen.add(a); }
  if (n) await kaydet(env, "venom:hemraListe", l, 14 * 86400);
  return { kapanan: n, kalan: l.filter((x) => x.durum === "bekliyor") };
}
export const HEMRA_EN_FAZLA = 5; // 11 Kasım (Patron): Hemra'nın kartı en fazla 5 iş
// 11:00 / 16:00 (koordinatöre, Sami'den): en fazla 5 İŞ, her iş AYRI kart ve altında KENDİ düğmeleri; tekrar ve bilgi satırı yok.
// Bir iş bir kez gönderilir (cevap gelmeyeni Sami'nin kart takibi hatırlatır, kural 54).
export async function hemraListesiGonder(env, simdi, { biriktir, defter }) {
  if (!haftaIci(simdi)) return 0;
  await eskalasyonTopla(env, simdi, defter).catch(() => 0);
  await listeyiTemizle(env, simdi, defter).catch(() => null);
  const l = await oku(env, "venom:hemraListe", []);
  const bek = l.filter((x) => x.durum === "bekliyor" && !x.gonderildi).slice(0, HEMRA_EN_FAZLA);
  if (!bek.length) return 0;
  const kim = await koordinator(env, simdi);
  for (const x of bek) {
    const klavye = [Object.entries(SECENEK).slice(0, 2), Object.entries(SECENEK).slice(2)].map((satir) => satir.map(([s, [t2]]) => ({ text: t2, callback_data: `hl:${x.id}:${s}` })));
    await kuyrugaEkle(env, "giden", { id: `hl-${x.id}-${kim}`, kime: kim, metin: `📋 ${String(x.ozet).slice(0, 300)}`, klavye: { inline_keyboard: klavye }, tur: "gorev" });
    x.gonderildi = simdi;
  }
  await kaydet(env, "venom:hemraListe", l, 14 * 86400);
  if (kim !== "hemra") await biriktir(`📋 Koordinasyon bugün Merdan'da (Hemra ${(await env.KAYIT.get("venom:hemraIzinli").catch(() => null)) === gunAnahtari(simdi) ? "izinli" : "listeye cevap vermedi"}).`).catch(() => null);
  return bek.length;
}
// Sami: [hl:<id>:<a|m|h|p>] → kuyruk "hemraKarar"; satır işaretlenir
export async function hemraDugmesi(env, cq, tg) {
  const [, id, s] = String(cq.data).split(":");
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const kim = ["hemra", "merdan"].find((k) => kisiId(env, k) === String(cq.from.id));
  if (!kim || !SECENEK[s]) return cevap("Bu liste koordinatörün.");
  await kuyrugaEkle(env, "hemraKarar", { id: `${id}:${s}`, lid: id, s, kim: KISILER[kim].ad, zaman: Math.floor(Date.now() / 1000) });
  await cevap("Kaydedildi ✅");
  let yazildi = false;
  const k = ((cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || []).map((r) => { if (!r.some((b) => String(b.callback_data || "").startsWith(`hl:${id}:`))) return r; if (yazildi) return null; yazildi = true; return [{ text: `✔ ${SECENEK[s][0]}`, callback_data: "vg:-" }]; }).filter(Boolean);
  return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: k } });
}
// Venom: seçimleri uygula. f: { kartIlet(item, hedefKim), devret(item, hedefKim), gorevVer(item, hedefKim), patronaSor(item), biriktir }
export async function hemraKararAdimi(env, simdi, f) {
  const kararlar = await kuyruguAl(env, "hemraKarar").catch(() => []);
  if (!kararlar.length) return 0;
  const l = await oku(env, "venom:hemraListe", []);
  for (const c of kararlar) {
    const x = l.find((y) => y.id === c.lid);
    if (!x || x.durum !== "bekliyor") continue;
    const hedef = SECENEK[c.s][1] || (c.s === "h" ? (c.kim === "Merdan" ? "merdan" : "hemra") : null);
    if (c.s === "p") { x.durum = "patron"; await f.patronaSor(x, c.kim); }
    else if (x.tur === "kart") await f.kartIlet(x, hedef);
    else if (x.tur === "cozum") await f.devret(x, hedef);
    else await f.gorevVer(x, hedef);
    if (c.s !== "p") { x.durum = "verildi"; x.kime = hedef; }
    x.karar = { kim: c.kim, s: c.s, zaman: simdi };
    await f.biriktir(`📋 ${c.kim}: ${x.ozet.slice(0, 60)} → ${SECENEK[c.s][0].replace(/^\S+\s/, "")}`).catch(() => null);
  }
  await kaydet(env, "venom:hemraListe", l, 14 * 86400);
  return kararlar.length;
}
// Akşam: "Hemra listesi: X iş, Y dağıtıldı, Z bekliyor" + Patron'a sorulanlar
export function hemraSatirlari(l, simdi) {
  const bugun = (l || []).filter((x) => gunAnahtari(x.zaman) === gunAnahtari(simdi) || x.durum === "bekliyor");
  const s = [];
  if (bugun.length) s.push(`📋 Hemra listesi: ${bugun.length} iş, ${bugun.filter((x) => x.durum === "verildi").length} dağıtıldı, ${bugun.filter((x) => x.durum === "bekliyor").length} bekliyor`);
  const p = bugun.filter((x) => x.durum === "patron");
  if (p.length) s.push(`❓ Hemra size soruyor: ${p.slice(0, 3).map((x) => x.ozet.slice(0, 70)).join(" · ")}`);
  return s;
}
