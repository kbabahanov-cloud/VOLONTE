// VENOM = SERT VE YETKİLİ MÜDÜR (9 Kasım, Patron) — GÖREV + ÇÖZÜM KUYRUĞU.
// Ton: kararlı müdür — net görev, net süre, net takip. Kaba değil, yalvaran da değil.
// Görev: Hemra ve Merdan'a İKİSİNE BİRDEN (Sami botundan, onların kullandığı bot), model model düğmeli kart.
//   Süre dolunca hatırlatma; ikinci hatırlatmadan sonra yapılmadıysa akşam özetinde "yapılmayan görevler".
//   "Bulamadım" / açıklama → Venom çözemezse Patron'a TEK kart (izin: cozulemeyen). Patron'un kararı "Patron kararı" olarak kaydedilir.
// Çözüm kuyruğu (venom:cozum): Patron'a izinsiz gidemeyen her şey. Bilgi → özete; bot kartı → Hemra+Merdan'a devredilir
//   (düğmeleri aynen; basınca bota "Patron bastı" gibi döner); 2 hatırlatmadan sonra kimse basmazsa Patron'a TEK kart.
// Çözüm basamakları: sebebi öğren → kendin düzelt / bota emir → gerekirse görev → takip → deftere yaz → kapat → çözülemeyeni tek kart.
import { KISILER, kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";

const SAAT_FARKI = 3 * 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const pazar = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay() === 0;
const saatYaz = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
const gunSaatYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`; };
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json").catch(() => null)) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined).catch(() => null);
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export const GOREV_KISILER = ["merdan", "hemra"];
export const PARCA = 10; // kart başına model (Telegram düğme sınırı)
export const HATIRLATMA_ARA = 2 * 3600; // süre dolunca 1. hatırlatma, 2 saat sonra 2.; 2 saat daha → "yapılmadı"
// Seçimler (kalıp: foto | video | genel)
export const SECIMLER = {
  foto: [["c", "📷 Bugün çekerim"], ["f", "🏭 Fabrikada"], ["b", "❌ Satıldı/bitti"], ["y", "🔍 Bulamadım"], ["a", "✏️ Açıklama yaz"]],
  video: [["c", "🎥 Bugün çekerim"], ["f", "🏭 Fabrikada"], ["b", "❌ Satıldı/bitti"], ["y", "🔍 Bulamadım"], ["a", "✏️ Açıklama yaz"]],
  genel: [["h", "✅ Hallettim"], ["y", "🔍 Yapamadım"], ["a", "✏️ Açıklama yaz"]],
};
export const secimAdi = (kalip, s) => ((SECIMLER[kalip] || SECIMLER.genel).find(([k]) => k === s) || [s, s])[1];
const COZULEMEDI = new Set(["y"]); // "Bulamadım / Yapamadım" → çözülemeyen

// Görevin son saati: verilen saat (bugün) geçtiyse ya da 2 saatten az kaldıysa ertesi iş günü aynı saat (pazar atlanır)
export function sonSaat(simdi, hedefSaat = 18) {
  const gunBasi = simdi - ((simdi + SAAT_FARKI) % 86400);
  let t = gunBasi + hedefSaat * 3600;
  if (t - simdi < 2 * 3600) t += 86400;
  if (pazar(t)) t += 86400;
  return t;
}
const kimler = (g) => (g.kimler || GOREV_KISILER).map((k) => (KISILER[k] ? KISILER[k].ad : k));
// Kart metinleri + düğmeler (10 modellik parçalar). Satır: 1. kod — not; düğmeler: üst satır 3, alt satır 2
export function gorevKartlari(g) {
  const parcalar = [];
  for (let p = 0; p * PARCA < g.kalemler.length; p++) {
    const dilim = g.kalemler.slice(p * PARCA, (p + 1) * PARCA);
    const toplamParca = Math.ceil(g.kalemler.length / PARCA);
    const metin = [
      `${kimler(g).join(", ")}: ${g.metin}`,
      `⏰ Son saat: ${gunSaatYaz(g.son)}${toplamParca > 1 ? ` · kart ${p + 1}/${toplamParca}` : ""}`,
      "",
      ...dilim.map((k, i) => `${p * PARCA + i + 1}. ${k.kod}${k.not ? ` — ${k.not}` : ""}`),
      "",
      "Her model için bir düğme seçin. İkinizden birinin cevabı yeter.",
    ].join("\n").slice(0, 4000);
    const klavye = [];
    dilim.forEach((k, i) => {
      const n = p * PARCA + i;
      if (k.secim) { klavye.push([{ text: `✔ ${k.kod}: ${secimAdi(g.kalip, k.secim)} (${k.kim || "?"})`, callback_data: "vg:-" }]); return; }
      const s = SECIMLER[g.kalip] || SECIMLER.genel;
      const d = (x) => ({ text: `${k.kod} ${x[1]}`, callback_data: `vg:${g.id}:${n}:${x[0]}` });
      if (s.length > 3) { klavye.push(s.slice(0, 3).map(d)); klavye.push(s.slice(3).map(d)); } else klavye.push(s.map(d));
    });
    parcalar.push({ metin, klavye: { inline_keyboard: klavye } });
  }
  return parcalar;
}
const cevapsiz = (g) => g.kalemler.filter((k) => !k.secim);

// ---------- Venom tarafı ----------
// g: { baslik, metin, kalip, kalemler: [{ kod, not }], son, kaynak }
export async function gorevAc(env, g, simdi) {
  const l = await oku(env, "venom:gorevler", []);
  const ayni = l.find((x) => ["acik", "yapilmadi"].includes(x.durum) && x.baslik === g.baslik);
  if (ayni) return ayni; // aynı görev iki kez açılmaz
  const gorev = { id: kisaId(), zaman: simdi, durum: "acik", hatirlatma: 0, kimler: GOREV_KISILER, kalip: g.kalip || "genel", ...g,
    kalemler: (g.kalemler || []).slice(0, 60).map((k) => ({ kod: String(k.kod), not: k.not || null, secim: null, kim: null, aciklama: null })) };
  for (const kisi of gorev.kimler) {
    gorevKartlari(gorev).forEach((p, i) => kuyrugaEkle(env, "giden", { id: `gv-${gorev.id}-${kisi}-${i}`, kime: kisi, metin: p.metin, klavye: p.klavye, tur: "gorev", gorev: gorev.id, parca: i }).catch(() => null));
  }
  await kaydet(env, "venom:gorevler", [...l.filter((x) => ["acik", "yapilmadi"].includes(x.durum) || simdi - x.zaman < 14 * 86400), gorev].slice(-80), 30 * 86400);
  await sayac(env, "gorev", simdi);
  return gorev;
}
export async function sayac(env, ne, simdi, n = 1) {
  const k = `venom:mudur:${ne}:${gunAnahtari(simdi)}`;
  await env.KAYIT.put(k, String((Number(await env.KAYIT.get(k).catch(() => 0)) || 0) + n), { expirationTtl: 9 * 86400 }).catch(() => null);
}
export async function haftaSayilari(env, simdi) {
  const s = { kendi: 0, gorev: 0, patron: 0 };
  for (let i = 0; i < 7; i++) {
    const g = gunAnahtari(simdi - i * 86400);
    for (const ne of ["kendi", "gorev"]) s[ne] += Number(await env.KAYIT.get(`venom:mudur:${ne}:${g}`).catch(() => 0)) || 0;
    s.patron += (await oku(env, `venom:izin:log:${g}`, [])).filter((x) => !["cevap", "rapor"].includes(x.izin)).length;
  }
  return s;
}
// Her 5 dakikada (Venom cron): görev cevapları, hatırlatmalar, kapanış. f: { biriktir, patronaKart, defter, botaDugme }
export async function gorevAdimi(env, simdi, f) {
  let l = await oku(env, "venom:gorevler", []);
  const cevaplar = await kuyruguAl(env, "gorevCevap").catch(() => []);
  let degisti = false;
  for (const c of cevaplar) {
    const g = l.find((x) => x.id === c.gid);
    const k = g && g.kalemler[c.i];
    if (!k || k.secim) continue;
    k.secim = c.s; k.kim = c.kim || "?"; k.zaman = c.zaman || simdi; if (c.not) k.aciklama = String(c.not).slice(0, 300);
    degisti = true;
    await f.defter(`görev cevabı: ${k.kod} — ${secimAdi(g.kalip, c.s)} (${k.kim})${k.aciklama ? `: ${k.aciklama}` : ""}`, k.kod).catch(() => null);
  }
  const mesai = !pazar(simdi) && saat(simdi) >= 9 && saat(simdi) < 20;
  for (const g of l.filter((x) => ["acik", "yapilmadi"].includes(x.durum))) {
    const kalan = cevapsiz(g);
    if (!kalan.length) { await gorevKapat(env, g, simdi, f); degisti = true; continue; }
    // 9 Kasım (onay merdiveni): hatırlatma = KARTIN KENDİSİ, 3 saat (mesai) sonra bir kez — Sami yapar (kart-tekrar.js).
    // Süre dolduğunda hâlâ cevapsızsa görev "yapılmadı" → akşam özetinde tek satır. Ara mesaj yok.
    if (simdi >= g.son && g.durum !== "yapilmadi") { g.durum = "yapilmadi"; degisti = true; }
  }
  if (degisti) await kaydet(env, "venom:gorevler", l, 30 * 86400);
  return l;
}
async function gorevKapat(env, g, simdi, f) {
  g.durum = "bitti"; g.bitis = simdi;
  const say = {}; for (const k of g.kalemler) say[k.secim] = (say[k.secim] || 0) + 1;
  const ozet = Object.entries(say).map(([s, n]) => `${n} ${secimAdi(g.kalip, s).replace(/^\S+\s/, "").toLocaleLowerCase("tr")}`).join(", ");
  await f.biriktir(`✅ Bitti: ${g.baslik} — ${ozet}.`).catch(() => null);
  await f.defter(`görev kapandı: ${g.baslik} (${ozet})`, null).catch(() => null);
  // Bulamadım / yapamadım (+ açıklamalar) → Patron'a TEK kart: ne denendi, neden olmadı, hangi karar lazım
  const cozulmeyen = g.kalemler.filter((k) => COZULEMEDI.has(k.secim));
  if (!cozulmeyen.length) return;
  const satir = cozulmeyen.slice(0, 12).map((k) => `• ${k.kod}: ${k.kim} "${secimAdi(g.kalip, k.secim).replace(/^\S+\s/, "")}"${k.aciklama ? ` — ${k.aciklama}` : ""}`);
  await f.patronaKart(`🧭 Çözülemedi — ${g.baslik}\nNe denendi: ${kimler(g).join(" ve ")}'ya ${gunSaatYaz(g.zaman)}'de görev verildi${g.hatirlatma ? `, ${g.hatirlatma} kez hatırlatıldı` : ""}.\nNeden olmadı:\n${satir.join("\n")}\nKarar lazım: ne yapalım? (📝 Karar yaz → Hemra ve Merdan'a "Patron kararı" olarak giderim.)`,
    { inline_keyboard: [[{ text: "📝 Karar yaz", callback_data: `vgk:${g.id}:k` }, { text: "✅ Gördüm, kapat", callback_data: `vgk:${g.id}:x` }]] }).catch(() => null);
}
// Akşam özeti satırı: yapılmayan görevler (kim, ne)
export function yapilmayanSatiri(l) {
  const y = (l || []).filter((g) => g.durum === "yapilmadi");
  if (!y.length) return null;
  return `📌 Yapılmayan görevler: ${y.slice(0, 4).map((g) => `${kimler(g).join("+")} — ${g.baslik} (${cevapsiz(g).length}/${g.kalemler.length} cevapsız)`).join("; ")}`;
}
// Patron kararı (📝 Karar yaz → metin): kaydedilir, iki kişiye "Patron kararı" olarak gider, görev kapanır
export async function patronKarari(env, gid, metin, simdi) {
  const l = await oku(env, "venom:gorevler", []);
  const g = l.find((x) => x.id === gid);
  if (!g) return null;
  g.patronKarari = { metin: String(metin).slice(0, 600), zaman: simdi }; g.durum = "bitti";
  await kaydet(env, "venom:gorevler", l, 30 * 86400);
  const k = await oku(env, "venom:bot:kararlar", []);
  await kaydet(env, "venom:bot:kararlar", [...k, { zaman: simdi, metin: `Patron kararı (${g.baslik}): ${String(metin).slice(0, 360)}` }].slice(-60));
  for (const kisi of g.kimler) await kuyrugaEkle(env, "giden", { id: `gp-${g.id}-${kisi}`, kime: kisi, metin: `📌 Patron kararı — ${g.baslik}:\n${metin}\nBuna göre uygulayın; sonucu bana düğmeyle ya da mesajla bildirin.`, tur: "mesaj" }).catch(() => null);
  return g;
}

// ---------- ÇÖZÜM KUYRUĞU (venom:cozum) ----------
// f: { biriktir, patronaKart, defter, botaDugme }
export async function cozumAdimi(env, simdi, f) {
  const l = await oku(env, "venom:cozum", []);
  let degisti = false;
  // Hemra/Merdan'ın devredilen kartta bastığı düğmeler (Sami → "venomDugme")
  for (const d of await kuyruguAl(env, "venomDugme").catch(() => [])) {
    const c = l.find((x) => x.id === d.cid);
    const r = await f.botaDugme(d.rid).catch(() => null);
    if (c && c.durum !== "kapandi") { c.durum = "kapandi"; c.kapanis = simdi; c.adimlar.push({ zaman: simdi, ne: `${d.kim} "${d.text || "düğme"}" bastı${r ? "" : " (bota iletilemedi)"}` }); degisti = true;
      await f.biriktir(`✅ Hallettik: ${c.ozet.slice(0, 90)} — ${d.kim} karar verdi.`).catch(() => null); await f.defter(`devredilen iş kapandı: ${c.ozet.slice(0, 120)} (${d.kim})`, null).catch(() => null); await sayac(env, "kendi", simdi); }
  }
  const mesai = !pazar(simdi) && saat(simdi) >= 9 && saat(simdi) < 20;
  for (const c of l.filter((x) => x.durum === "acik" || x.durum === "devredildi")) {
    if (c.durum === "acik") {
      if (!c.klavye) { // 1) sebebi öğren: düğmesiz = bilgi → özete; Venom kendi kapatır
        c.durum = "kapandi"; c.kapanis = simdi; c.adimlar.push({ zaman: simdi, ne: "bilgi: Patron'a gitmedi, özete alındı" }); degisti = true;
        await f.biriktir(`${c.kaynak === "venom" ? "" : `🤖 ${c.kaynak}: `}${c.ozet}`, c.kaynak).catch(() => null);
        await sayac(env, "kendi", simdi);
        continue;
      }
      if (!mesai) continue;
      // 3) karar gerektiren bot kartı → Hemra ve Merdan'a (düğmeleri aynen)
      for (const kisi of GOREV_KISILER) await kuyrugaEkle(env, "giden", { id: `cv-${c.id}-${kisi}`, kime: kisi, tur: "gorev", metin: `${GOREV_KISILER.map((k) => KISILER[k].ad).join(", ")}: ${c.kaynak[0].toUpperCase()}${c.kaynak.slice(1)}'den karar bekleyen iş (Patron'a gelmez, siz karar verin):\n\n${c.metin || c.ozet}\n\nİkinizden birinin seçimi yeter.`.slice(0, 4000), klavye: devirKlavye(c) }).catch(() => null);
      c.durum = "devredildi"; c.devir = simdi; c.hatirlatma = 0; c.adimlar.push({ zaman: simdi, ne: "Hemra ve Merdan'a verildi" }); degisti = true;
      await f.biriktir(`🧭 ${c.ozet.slice(0, 80)} — Merdan ve Hemra'ya verdim, ${saatYaz(simdi + 3 * 3600)}'de kontrol edeceğim.`).catch(() => null);
      await sayac(env, "gorev", simdi);
      continue;
    }
    // 4) takip: kartın kendisi 3 saat (mesai) sonra bir kez yeniden gider (Sami, kart-tekrar.js); yine cevap yoksa akşam özetinde
    //    "Cevapsız" satırı. 3 gün sonra kapanır (Patron'a ara mesaj yok).
    if (simdi - c.devir > 3 * 86400) { c.durum = "kapandi"; c.kapanis = simdi; c.adimlar.push({ zaman: simdi, ne: "3 gün cevapsız — kapandı (akşam özetinde yazıldı)" }); degisti = true; }
  }
  if (degisti) await kaydet(env, "venom:cozum", l.filter((x) => ["acik", "devredildi"].includes(x.durum) || simdi - x.zaman < 7 * 86400).slice(-200), 14 * 86400);
}
// Devredilen kartın düğmeleri: Hemra/Merdan için vd:<cid>:<rid> (Sami üzerinden), Patron için orijinal vr:<rid>
function devirKlavye(c, patrona = false) {
  return { inline_keyboard: (c.klavye.inline_keyboard || []).map((r) => r.map((b) => (b.url ? b : patrona ? b : { text: b.text, callback_data: `vd:${c.id}:${String(b.callback_data).replace(/^vr:/, "")}` }))) };
}

// ---------- Sami tarafı (Hemra / Merdan düğmeleri) ----------
const kimAdi = (env, id) => { for (const k of GOREV_KISILER) if (String(KISILER[k].id(env) || "") === String(id)) return KISILER[k].ad; return null; };
export async function gorevDugmesi(env, cq, tg) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const kim = kimAdi(env, cq.from.id) || (String(env.MURAT_ID || "").split(",").map((x) => x.trim()).includes(String(cq.from.id)) ? "Patron" : null);
  if (!kim) return cevap("Bu görev Hemra ve Merdan'ın.");
  const p = String(cq.data).split(":");
  if (p[0] === "vg" && p[1] === "-") return cevap("Bu model için seçim yapıldı.");
  const simdi = Math.floor(Date.now() / 1000);
  if (p[0] === "vd") { // devredilen bot kartı: Venom bota "Patron bastı" olarak iletir
    const [, cid, rid] = p;
    const tus = (cq.message.reply_markup && cq.message.reply_markup.inline_keyboard || []).flat().find((b) => b.callback_data === cq.data);
    await kuyrugaEkle(env, "venomDugme", { id: `${cid}:${rid}`, cid, rid, kim, text: tus ? tus.text : null, zaman: simdi });
    await cevap("Kaydedildi ✅");
    const bilgi = `\n\n✔ ${kim} seçti: ${tus ? tus.text : "düğme"}`;
    const anahtar = `gorevmsg:cv-${cid}`;
    const l = (await oku(env, anahtar, [])).length ? await oku(env, anahtar, []) : [[cq.message.chat.id, cq.message.message_id]];
    for (const [chat, mid] of l) await tg(env, "editMessageText", { chat_id: chat, message_id: mid, text: `${String(cq.message.text || "").slice(0, 3800)}${bilgi}`, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    return null;
  }
  const [, gid, n, s] = p;
  if (s === "a") {
    await kaydet(env, `gorevAciklama:${cq.from.id}`, { gid, i: Number(n), kim, mesaj: [cq.message.chat.id, cq.message.message_id], data: cq.data }, 3600);
    await cevap("Açıklamayı yazın");
    const satir = (cq.message.reply_markup.inline_keyboard || []).flat().find((b) => b.callback_data === cq.data);
    return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${satir ? satir.text.split(" ")[0] : "Model"} için açıklamayı tek mesajla yazın (1 saat içinde).` });
  }
  await kuyrugaEkle(env, "gorevCevap", { id: `${gid}:${n}:${cq.from.id}`, gid, i: Number(n), s, kim, zaman: simdi });
  await cevap("Kaydedildi ✅");
  return satirIsaretle(env, tg, cq.message, cq.data, kim);
}
// Seçilen modelin düğme satır(lar)ı tek satıra iner: "✔ 3047: Bugün çekerim (Hemra)" — iki kopyada da
async function satirIsaretle(env, tg, mesaj, data, kim, ek = null) {
  const [, gid, n] = String(data).split(":");
  const anahtar = `gorevmsg:vg:${gid}:${Math.floor(Number(n) / PARCA)}`;
  const kayit = await oku(env, `gorevklavye:${gid}:${Math.floor(Number(n) / PARCA)}`, null);
  const eski = (kayit || (mesaj.reply_markup && mesaj.reply_markup.inline_keyboard) || []);
  const tus = eski.flat().find((b) => b.callback_data === data);
  const kod = tus ? tus.text.split(" ")[0] : "?";
  const ne = tus ? tus.text.split(" ").slice(1).join(" ") : "";
  const yeni = [];
  let kondu = false;
  for (const r of eski) {
    if (r.some((b) => String(b.callback_data || "").startsWith(`vg:${gid}:${n}:`))) { if (!kondu) { yeni.push([{ text: `✔ ${kod}: ${ne.replace(/^\S+\s/, "")} (${kim})${ek ? ` — ${ek.slice(0, 30)}` : ""}`, callback_data: "vg:-" }]); kondu = true; } continue; }
    yeni.push(r);
  }
  await kaydet(env, `gorevklavye:${gid}:${Math.floor(Number(n) / PARCA)}`, yeni, 14 * 86400);
  const l = await oku(env, anahtar, []);
  for (const [chat, mid] of l.length ? l : [[mesaj.chat.id, mesaj.message_id]]) await tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: yeni } }).catch(() => null);
  return null;
}
// Açıklama bekleyen kişinin mesajı (Sami mesaj akışında EN ÖNCE). true = işlendi
export async function gorevAciklamaMesaji(env, m, tg) {
  if (!m.text || m.text.startsWith("/")) return false;
  const b = await oku(env, `gorevAciklama:${m.from.id}`, null);
  if (!b) return false;
  await env.KAYIT.delete(`gorevAciklama:${m.from.id}`).catch(() => null);
  await kuyrugaEkle(env, "gorevCevap", { id: `${b.gid}:${b.i}:${m.from.id}:a`, gid: b.gid, i: b.i, s: "a", not: m.text.slice(0, 300), kim: b.kim, zaman: Math.floor(Date.now() / 1000) });
  await satirIsaretle(env, tg, { chat: { id: b.mesaj[0] }, message_id: b.mesaj[1], reply_markup: null }, b.data, b.kim, m.text);
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: "✅ Açıklama kaydedildi, Venom'a ilettim." });
  return true;
}
