// TEK DEFTER (11 Kasım, Patron — "kökü bu"): bütün işlerin TEK listesi. Her işin tek satırı: ne, kim, marka, durum
// (açık / beklemede / bitti), kanıt. Venom'un bütün cevapları, raporları ve Hemra'nın kartı SADECE buradan okur.
// Kaynak tek yerde: Sami'nin deposu (StokDO). Botların hepsi (Venom, Sami, Kemal, Selin, Pelin) gönderdiği her kartı ve aldığı
// her cevabı oradaki iş defterine ("isd") yazar; fabrika istekleri ("fs"), repete kayıtları ("rk") ve eksik listeleri de oradadır.
// Bu dosya onları TEK satıra indirir ve kökten temizler:
//   • aynı kişiye aynı model için aynı soru iki kez sayılmaz (eskisi kapanır),
//   • cevaplanan soru (düğmeyle ya da yazıyla) kapanır, bir daha sorulmaz,
//   • repetesi açılan modelin eski fabrika / karar kartları kapanır,
//   • 3 günden eski cevapsız kart listeden düşer.
// Kapanan kart iş defterinde de kapanır → hatırlatma, kart takibi ve Hemra'nın listesi onu bir daha göstermez.
import { stokIste } from "./stokbot.js";

const SAAT_FARKI = 3 * 3600;
export const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
export const gunYaz = (g) => String(g || "").slice(5).split("-").reverse().join(".");
const saatYaz = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
const zamanYaz = (t) => `${gunYaz(gunA(t))} ${saatYaz(t)}`;
export const MARKA_AD = { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose" };
export const KART_ESKI = 3 * 86400;
const kml = (x) => String(x || "").split(",").map((y) => y.trim()).filter(Boolean);
const ayar = async (env, k, bos = null) => { try { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); } catch { return bos; } };
const kisalt = (t, n = 110) => { const d = String(t || "").replace(/\s+/g, " ").trim(); return d.length <= n ? d : `${d.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
// Kart yazısından başlık: deneme / süs satırları ve iç adlar atılır
export const kartNe = (ozet) => kisalt(String(ozet || "").replace(/\((sami|kemal|selin|pelin|venom|nora)\)/gi, "").replace(/^[\s·]+|[\s·]+$/g, ""));

// Kişi adları: ekip + fabrika (kimlikler gizli kayıttan; burada sadece ad gösterilir)
export async function kisiAdlari(env) {
  const ad = {};
  for (const [k, a] of [["MURAT_ID", "Patron"], ["HEMRA_ID", "Hemra"], ["FABRIKA_SORUMLU", "Hemra"], ["AZIZ_ID", "Aziz"], ["BR_SORUMLU", "Merdan"], ["FUAT_ID", "Fuat"], ["NURI_ID", "Nuri"]]) for (const id of kml(env[k])) ad[id] = ad[id] || a;
  for (const anahtar of ["sami:fabrikaKisiler", "sami:fiyatKisiler", "sami:stokKisiler"]) {
    const l = (await env.KAYIT.get(anahtar, "json").catch(() => null)) || [];
    for (const p of Array.isArray(l) ? l : []) if (p && p.id != null && p.ad) ad[String(p.id)] = ad[String(p.id)] || String(p.ad).split(" ")[0];
  }
  return ad;
}

// ---------- KARTLAR: iş defterindeki kartları tek satıra indir (saf mantık; test edilir) ----------
export const kartAilesi = (cb) => (String(cb || "").split("|").filter(Boolean)[0] || "").split(":")[0] || "?";
const yaziylaMi = (r) => r.tur === "karar" && /: "|^"/.test(String(r.ozet || ""));
// satirlar: iş defteri satırları (kart + karar). repeteler: [{ kod, durum, zaman, onay }] (Fuat'ın onayladığı / açık repeteler)
// Dönen: { acik: [her iş için en yeni bekleyen kart], kapat: [{ id, neden }] }
export function kartlariIndir(satirlar, simdi, { repeteler = [] } = {}) {
  const kartlar = (satirlar || []).filter((r) => r.tur === "kart" && !Number(r.deneme));
  const yazili = (satirlar || []).filter(yaziylaMi);
  const gruplar = new Map(), kapat = [], acik = [];
  for (const r of kartlar) {
    const a = `${r.bot}|${r.kime}|${r.kod || `m${r.mesaj}`}|${kartAilesi(r.cb)}`;
    if (!gruplar.has(a)) gruplar.set(a, []);
    gruplar.get(a).push(r);
  }
  const rkOnay = {};
  for (const x of repeteler) if (x && x.durum === "acik" && x.kod) rkOnay[String(x.kod)] = Math.max(rkOnay[String(x.kod)] || 0, Number(x.onay) || Number(x.zaman) || 0);
  for (const [anahtar, l] of gruplar) {
    l.sort((x, y) => x.zaman - y.zaman || x.id - y.id);
    const son = l.at(-1);
    for (const r of l) {
      if (r.durum !== "bekliyor") continue;
      let neden = null;
      if (r !== son) neden = son.durum === "bekliyor" ? "yenilendi" : "cevaplandi"; // aynı soru yeniden gitti / yenisi cevaplandı
      else if (r.kod && yazili.some((k) => k.bot === r.bot && String(k.kime) === String(r.kime) && String(k.kod) === String(r.kod) && k.zaman >= r.zaman)) neden = "cevaplandi"; // yazıyla cevap
      else if (r.bot === "sami" && r.kod && rkOnay[String(r.kod)] && r.zaman < rkOnay[String(r.kod)] && kartAilesi(r.cb) !== "rk") neden = "repete"; // repete açıldı
      else if (simdi - r.zaman > KART_ESKI) neden = "eskidi";
      if (neden) kapat.push({ id: r.id, neden });
      else acik.push({ ...r, anahtar, kopya: l.filter((y) => y.durum === "bekliyor").length });
    }
  }
  return { acik, kapat };
}

// ---------- SATIRLAR ----------
const FS_DURUM = {
  bekliyor: ["acik", "Fabrika", "Fabrikadan istendi, cevap bekleniyor"],
  sureSoruluyor: ["acik", "Fabrika", "Fabrika süre yazacak"],
  repete: ["beklemede", "Fabrika", "Fabrika: gelecek"],
  geldi: ["beklemede", "Mağaza", "Mal geldi, Vegawin girişi bekleniyor"],
  bitti: ["acik", "Hemra", "Fabrikada bitti, karar bekleniyor"],
};
const RK_DURUM = {
  hemra: ["acik", "Hemra", "dağılım onayı bekleniyor"], patron: ["acik", "Patron", "onayınız bekleniyor"], fuat: ["acik", "Fuat", "Fuat'ın cevabı bekleniyor"],
  acik: ["beklemede", "Fabrika", "üretimde"], beklemede: ["beklemede", "Fuat", "Fuat yapamam dedi, beklemede"],
  red: ["bitti", "Patron", "reddedildi"], iptal: ["bitti", "Hemra", "iptal"], geldi: ["bitti", "Fabrika", "mal geldi"], kapandi: ["bitti", "Fabrika", "kapandı"],
};
// Açık / beklemedeki repeteler (rk:acik). kod verilirse o modelin kapanmış kayıtları da (kimlik "<kod>-…" ile başlar) — az okuma
export async function repeteKayitlari(env, kod = null) {
  const idler = new Set((await ayar(env, "rk:acik", [])) || []);
  if (kod) for (const id of ((await ayar(env, "rk:hepsi", [])) || [])) if (String(id).startsWith(`${kod}-`)) idler.add(id);
  const l = [];
  for (const id of [...idler].slice(-25)) { const r = await ayar(env, `rk:${id}`, null); if (r && !r.deneme) l.push(r); }
  return l;
}
export function repeteSatiri(r) {
  const [durum, kim, yazi] = RK_DURUM[r.durum] || ["acik", "Hemra", r.durum];
  const onay = r.fuat && r.fuat.zaman ? `Fuat onayladı${r.fuat.kaynak ? ` (${r.fuat.kaynak})` : ` (${zamanYaz(r.fuat.zaman)})`}` : null;
  return { id: `repete:${r.id}`, tur: "repete", kod: String(r.kod), marka: r.magaza || null, ne: `Repete ${r.adet || "?"} adet`, kim, durum, bot: "sami", acildi: r.zaman || 0, guncel: (r.fuat && r.fuat.zaman) || (r.patron && r.patron.zaman) || r.zaman || 0,
    kanit: r.durum === "acik" ? `${onay || "Fuat onayladı"}, teslim ${String(r.teslim || "").split("-").reverse().join(".")}` : yazi, ek: { adet: r.adet, teslim: r.teslim || null, rdurum: r.durum } };
}
export function fabrikaSatiri(f) {
  const [durum, kim, yazi] = FS_DURUM[f.durum] || ["acik", "Fabrika", f.durum];
  return { id: `fabrika:${f.id}`, tur: "fabrika", kod: String(f.kod), marka: f.magaza || null, ne: "Fabrika isteği (eksik listesi)", kim, durum, bot: "sami", acildi: f.gonderim || 0, guncel: f.gonderim || 0,
    kanit: f.durum === "repete" && (f.hazirGun || f.teslimSure) ? `${yazi}${f.teslimSure ? `, ${f.teslimSure}` : ""}${f.hazirGun ? ` (hazır: ${String(f.hazirGun).split("-").reverse().join(".")})` : ""}` : yazi, ek: { fdurum: f.durum } };
}
export function kartSatiri(r, adlar = {}) {
  return { id: `kart:${r.anahtar}`, tur: "kart", kod: r.kod ? String(r.kod) : null, marka: null, ne: kartNe(r.ozet), kim: adlar[String(r.kime)] || "?", kimId: String(r.kime), durum: "acik", bot: r.bot, acildi: r.zaman, guncel: r.zaman, kanit: null,
    ek: { isdId: r.id, chat: r.chat, mesaj: r.mesaj, hatirlatildi: Number(r.hatirlatildi) || 0, aile: kartAilesi(r.cb) } };
}
// Venom'un botlara verdiği işler ve ekibe verdiği görevler (ortak kayıt, KV) → satır
export async function venomSatirlari(env, simdi) {
  const s = [];
  const isler = (await env.KAYIT.get("venom:bot:isler", "json").catch(() => null)) || [];
  for (const x of isler) {
    if (["eskidi", "iptal"].includes(x.durum) || simdi - (x.zaman || 0) > 3 * 86400) continue;
    s.push({ id: `botis:${x.id}`, tur: "bot", kod: (String(x.ne).match(/\b\d{4,5}\b/) || [null])[0], marka: null, ne: kisalt(x.ne), kim: { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" }[x.bot] || x.bot, durum: x.durum === "bitti" ? "bitti" : "acik", bot: "venom", acildi: x.zaman, guncel: x.bitis || x.zaman, kanit: x.kanit || (x.durum === "bitti" ? `bot cevap verdi (${zamanYaz(x.bitis || x.zaman)})` : null) });
  }
  const gorevler = (await env.KAYIT.get("venom:gorevler", "json").catch(() => null)) || [];
  for (const g of gorevler) {
    if (g.durum === "bitti" && simdi - (g.bitis || g.zaman || 0) > 86400) continue;
    if (g.durum === "kapandi") continue;
    const kalan = (g.kalemler || []).filter((k) => !k.secim).length, hepsi = (g.kalemler || []).length;
    s.push({ id: `gorev:${g.id}`, tur: "gorev", kod: hepsi === 1 ? String(g.kalemler[0].kod) : null, marka: null, ne: kisalt(g.baslik || g.metin), kim: (g.kimler || []).map((k) => k[0].toLocaleUpperCase("tr") + k.slice(1)).join(", "), durum: g.durum === "bitti" ? "bitti" : "acik", bot: "venom", acildi: g.zaman, guncel: g.bitis || g.zaman,
      kanit: g.durum === "bitti" ? `${hepsi} modelin hepsi cevaplandı` : `${hepsi - kalan}/${hepsi} cevaplandı${g.durum === "yapilmadi" ? ", süre doldu" : ""}` });
  }
  return s;
}

// ---------- OKUMA: tek liste ----------
// kapat=true: kapanması gereken kartları iş defterinde de kapatır (kök temizlik). kuru=true: hiçbir şey yazmaz.
export async function defterOku(env, simdi, { kapat = true, kuru = false } = {}) {
  const adlar = await kisiAdlari(env);
  const [isd, fs, rk] = await Promise.all([
    stokIste(env, "/isd-oku", { basla: simdi - 6 * 86400, bitis: simdi + 60 }).catch(() => []),
    stokIste(env, "/fs-ozet", {}).catch(() => []),
    repeteKayitlari(env).catch(() => []),
  ]);
  const { acik, kapat: kapanacak } = kartlariIndir(Array.isArray(isd) ? isd : [], simdi, { repeteler: rk.map((r) => ({ kod: r.kod, durum: r.durum, zaman: r.zaman, onay: r.fuat && r.fuat.zaman })) });
  if (kapat && !kuru && kapanacak.length) {
    for (const neden of [...new Set(kapanacak.map((x) => x.neden))]) {
      const idler = kapanacak.filter((x) => x.neden === neden).map((x) => x.id);
      for (let i = 0; i < idler.length; i += 150) await stokIste(env, "/isd-isaretle", { idler: idler.slice(i, i + 150), alan: "durum", deger: neden }).catch(() => null);
    }
  }
  const satirlar = [
    ...rk.filter((r) => !["red", "iptal", "geldi", "kapandi"].includes(r.durum) || simdi - (r.kapandi || r.zaman || 0) < 3 * 86400).map(repeteSatiri),
    ...(Array.isArray(fs) ? fs : []).filter((f) => !f.deneme).map(fabrikaSatiri),
    ...(await venomSatirlari(env, simdi).catch(() => [])),
    ...acik.map((r) => kartSatiri(r, adlar)),
  ];
  // repete açık / beklemede olan modelin fabrika isteği ayrıca "açık iş" sayılmaz (tek satır: repete)
  const repeteli = new Set(satirlar.filter((x) => x.tur === "repete" && x.durum !== "bitti").map((x) => x.kod));
  const sade = satirlar.filter((x) => !(x.tur === "fabrika" && repeteli.has(x.kod) && x.ek && x.ek.fdurum === "bitti"));
  const ozet = { zaman: simdi, acik: sade.filter((x) => x.durum === "acik").length, beklemede: sade.filter((x) => x.durum === "beklemede").length, kapatilan: kapanacak.length };
  if (!kuru) await stokIste(env, "/ayar-yaz", { k: "defter:tek", v: JSON.stringify({ ...ozet, satirlar: sade.slice(0, 400) }) }).catch(() => null);
  return { satirlar: sade, kapanan: kapanacak, ozet, adlar };
}
export const defterSatirYazi = (x) => `${x.kod ? `${x.kod} · ` : ""}${x.ne} · ${x.kim}${x.marka ? ` · ${MARKA_AD[x.marka] || x.marka}` : ""} · ${{ acik: "açık", beklemede: "beklemede", bitti: "bitti" }[x.durum] || x.durum}${x.kanit ? ` · ${x.kanit}` : ""}`;

// ---------- HAZIR CEVAPLAR (Venom; yapay zekâsız, tek defterden) ----------
// "Fabrikaya dün hangi modeller gitti?" → en fazla 4 satır, markalar AYRI
export function fabrikaGidenMetni(gun, simdi, giden, bekleyen = []) {
  const ne = gun === gunA(simdi) ? "Bugün" : gun === gunA(simdi - 86400) ? "Dün" : gunYaz(gun);
  const v = giden.VOLONTE || [], b = giden.BLACKROSE || [];
  if (!v.length && !b.length) return [`${ne} (${gunYaz(gun)}) fabrikaya giden liste yok.`, ...bekleyen.slice(0, 2)].join("\n");
  const satir = (ad, l) => (l.length ? `${ad} (${l.length}): ${[...l].sort().join(", ")}` : `${ad}: giden yok`);
  return [`${ne} (${gunYaz(gun)}) fabrikaya ${v.length + b.length} model gitti.`, satir("VOLONTE", v), satir("Black Rose", b), ...(bekleyen.length ? [kisalt(bekleyen.join("; "), 200)] : [])].slice(0, 4).join("\n");
}
// "3419'un repetesi ne durumda?" → en fazla 3 satır
export function repeteDurumMetni(kod, kayitlar, fsAcik = []) {
  const l = (kayitlar || []).filter((r) => String(r.kod) === String(kod)).sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
  const r = l.find((x) => !["red", "iptal", "geldi", "kapandi"].includes(x.durum)) || l[0];
  if (!r) {
    const f = (fsAcik || []).find((x) => String(x.kod) === String(kod) && !x.deneme);
    return f ? `${kod}: repete kaydı yok. Fabrika isteği var: ${fabrikaSatiri(f).kanit}.` : `${kod}: açık repete kaydı ve fabrika isteği yok.`;
  }
  const s = repeteSatiri(r);
  const m = MARKA_AD[r.magaza] || "";
  if (r.durum === "acik") return `${kod}${m ? ` (${m})` : ""} repete: ${r.adet} adet, üretimde.\n${s.kanit}.`;
  return `${kod}${m ? ` (${m})` : ""} repete: ${r.adet || "?"} adet — ${s.kanit}.`;
}
