// EKİP DÜZENİ (9 Kasım, Patron; kural kitabında): Hemra koordinatör, Aziz VOLONTE stoğu, Merdan Black Rose.
// - VOLONTE stok işleri doğrudan Aziz'e, Black Rose işleri doğrudan Merdan'a. Onay merdiveninden sonra (kart bir kez yeniden + 3 saat)
//   hâlâ çözülmezse iş HEMRA'NIN LİSTESİNE düşer. Venom'un çözemediği işler de Patron'a değil Hemra'nın listesine.
// - Hemra'ya tek tek kart değil, günde 2 TOPLU liste (hafta içi 11:00 ve 16:00): her satırda [Aziz'e ver] [Merdan'a ver] [Ben hallederim]
//   [Patron'a sor]. Seçilen kişiye kart kendiliğinden gider; "Patron'a sor" akşam özetine girer.
// - Yedek: Hemra izinliyse ya da o gün hiç cevap vermediyse koordinasyon o gün Merdan'a geçer.
import { KISILER, kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";
import { mesaiSuresi } from "./kart-tekrar.js";

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
  const l = await oku(env, "venom:hemraListe", []);
  if (l.some((y) => y.ref === x.ref && y.durum === "bekliyor")) return null;
  const kayit = { id: kisaId(), zaman: simdi, durum: "bekliyor", ...x };
  await kaydet(env, "venom:hemraListe", [...l.filter((y) => y.durum === "bekliyor" || simdi - y.zaman < 7 * 86400), kayit].slice(-150), 14 * 86400);
  return kayit;
}
// Onay merdiveninden sonra hâlâ cevapsız (Aziz / Merdan) → listeye
export async function eskalasyonTopla(env, simdi, stokIste) {
  const az = kisiId(env, "aziz"), me = kisiId(env, "merdan");
  const bek = await stokIste(env, "/isd-bekleyen", { enEski: simdi - 5 * 86400 }).catch(() => []);
  let n = 0;
  for (const r of Array.isArray(bek) ? bek : []) {
    if (![az, me].includes(String(r.kime)) || !Number(r.hatirlatildi) || mesaiSuresi(Number(r.hatirlatildi), simdi) < 3 * 3600) continue;
    const kim = String(r.kime) === az ? "Aziz" : "Merdan";
    if (await listeyeEkle(env, { tur: "kart", ref: `isd:${r.id}`, isdId: r.id, bot: r.bot, chat: r.chat, mesaj: r.mesaj, kod: r.kod, ozet: `${r.kod || "kart"} (${r.bot}) — ${kim} cevap vermedi: ${String(r.ozet || "").slice(0, 70)}` }, simdi)) n++;
  }
  return n;
}
// 11:00 / 16:00 toplu liste (koordinatöre, Sami'den). Satır başı 4 düğme; en fazla 12 iş (kalan bir sonrakine)
export async function hemraListesiGonder(env, simdi, { stokIste, biriktir }) {
  if (!haftaIci(simdi)) return 0;
  await eskalasyonTopla(env, simdi, stokIste).catch(() => 0);
  const l = await oku(env, "venom:hemraListe", []);
  const bek = l.filter((x) => x.durum === "bekliyor").slice(0, 12);
  if (!bek.length) return 0;
  const kim = await koordinator(env, simdi);
  const ad = KISILER[kim].ad;
  const metin = [`📋 ${ad}: onaylanmayanlar / sorunlu işler (${bek.length}). Her satır için seçin; seçtiğiniz kişiye kart kendiliğinden gider.`, "", ...bek.map((x, i) => `${i + 1}. ${x.ozet}`)].join("\n").slice(0, 4000);
  const klavye = bek.map((x, i) => Object.entries(SECENEK).map(([s, [t]]) => ({ text: `${i + 1}· ${t}`, callback_data: `hl:${x.id}:${s}` })));
  await kuyrugaEkle(env, "giden", { id: `hl-${gunAnahtari(simdi)}-${saat(simdi) < 13 ? "s" : "o"}-${kim}`, kime: kim, metin, klavye: { inline_keyboard: klavye }, tur: "gorev" });
  for (const x of bek) x.gonderildi = x.gonderildi || simdi;
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
  const k = ((cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || []).map((r) => (r.some((b) => String(b.callback_data || "").startsWith(`hl:${id}:`)) ? [{ text: `✔ ${r[0].text.split("·")[0]}· ${SECENEK[s][0]}`, callback_data: "vg:-" }] : r));
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
