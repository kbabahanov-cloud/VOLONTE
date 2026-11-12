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
const SAAT_FARKI = 3 * 3600;
export const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
export const gunYaz = (g) => String(g || "").slice(5).split("-").reverse().join(".");
const saatYaz = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(11, 16);
const zamanYaz = (t) => `${gunYaz(gunA(t))} ${saatYaz(t)}`;
export const MARKA_AD = { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose" };
export const KART_ESKI = 3 * 86400;
const kisalt = (t, n = 110) => { const d = String(t || "").replace(/\s+/g, " ").trim(); return d.length <= n ? d : `${d.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
// Kart yazısından başlık: deneme / süs satırları ve iç adlar atılır
export const kartNe = (ozet) => kisalt(String(ozet || "").replace(/\((sami|kemal|selin|pelin|venom|nora)\)/gi, "").replace(/^[\s·]+|[\s·]+$/g, ""));

// ---------- KARTLAR: iş defterindeki kartları tek satıra indir (saf mantık; test edilir) ----------
export const kartAilesi = (cb) => (String(cb || "").split("|").filter(Boolean)[0] || "").split(":")[0] || "?";
export const BILGI_KARTI = /ak[şs]am raporu|sabah raporu|g[üu]n[üu]n [öo]zeti|haftal[ıi]k rapor/i; // rapor = bilgi; iş değildir (12 saat sonra kapanır)
const yaziylaMi = (r) => r.tur === "karar" && /: "|^"/.test(String(r.ozet || ""));
// satirlar: iş defteri satırları (kart + karar). repeteler: [{ kod, durum, zaman, onay }] (Fuat'ın onayladığı / açık repeteler)
// Dönen: { acik: [her iş için en yeni bekleyen kart], kapat: [{ id, neden }] }
// fsAcik: Sami'nin AÇIK fabrika kayıtlarının kimlikleri (Set) — verilirse kapanmış kaydın kartı da kapanır
const cbParca = (cb) => (String(cb || "").split("|").filter(Boolean)[0] || "").split(":");
export const ESKI_HEMRA_LISTESI = /onaylanmayanlar \/ sorunlu işler/;
export function kartlariIndir(satirlar, simdi, { repeteler = [], fsAcik = null } = {}) {
  const bugun = gunA(simdi);
  const kartlar = (satirlar || []).filter((r) => r.tur === "kart" && !Number(r.deneme));
  const yazili = (satirlar || []).filter(yaziylaMi);
  const gruplar = new Map(), kapat = [], acik = [];
  for (const r of kartlar) {
    const a = `${r.bot}|${r.kime}|${r.cb || `y:${r.kod || ""}:${String(r.ozet || r.mesaj).replace(/\d{1,2}[.:]\d{2}/g, "").slice(0, 50)}`}`; // 12 Kasım: AYNI kart = aynı kişi + aynı düğmeler (yeniden gönderilen kart). Aynı modelin iki ayrı kaydı (ör. büyük / küçük beden) ayrı iştir
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
      else if (r.bot === "sami" && samiKartiOldu(r, bugun, fsAcik, simdi)) neden = samiKartiOldu(r, bugun, fsAcik, simdi);
      else if (BILGI_KARTI.test(String(r.ozet || "")) && simdi - r.zaman > 12 * 3600) neden = "bilgi";
      if (neden) kapat.push({ id: r.id, neden });
      else if (BILGI_KARTI.test(String(r.ozet || "")) || YARDIMCI_KART(r)) continue; // rapor / liste sonu / Hemra listesi kartı: iş satırı olmaz
      else acik.push({ ...r, anahtar, kopya: l.filter((y) => y.durum === "bekliyor").length });
    }
  }
  return { acik, kapat };
}

// Sami kartı hâlâ geçerli mi? Düğmedeki kayıt / liste kimliğinden anlaşılır:
//  fc:g|r|b|z:<kayıt> fabrika kartı · fk:<…>:<kayıt> "bitti" karar kartı · fo:<…>:<kayıt> Fuat onayı → kayıt kapandıysa kart da kapanır
//  fe:<…>:<gün>:<kod> eksik listesi kartı · fc:H:<gün…> liste sonu kartı → liste önceki günlerinse kapanır
//  hl:… eski toplu Hemra listesi (yeni düzende her iş ayrı kart) → kapanır
function samiKartiOldu(r, bugun, fsAcik, simdi) {
  const p = cbParca(r.cb), a = p[0];
  if ((a === "fk" || a === "fo" || (a === "fc" && p[1] !== "H")) && fsAcik && p[2] && !fsAcik.has(p[2]) && simdi - r.zaman > 900) return "kayitKapandi"; // yeni kart: kaydı yazılırken yanlışlıkla kapanmasın (15 dk pay)
  if ((a === "fe" || (a === "fc" && p[1] === "H")) && /^\d{4}-\d{2}-\d{2}/.test(String(p[2] || "")) && String(p[2]).slice(0, 10) < bugun) return "listeKapandi";
  if (a === "hl" && ESKI_HEMRA_LISTESI.test(String(r.ozet || ""))) return "eskiListe";
  return null;
}
const YARDIMCI_KART = (r) => { const p = cbParca(r.cb); return (p[0] === "fc" && p[1] === "H") || p[0] === "hl"; };

// ---------- SATIRLAR ----------
// 12 Kasım (Patron): her satırda ZORUNLU alanlar — tarih + saat (acildi), kişi ADI (Sinem / Fuat / Nuri; "fabrika" yazılmaz), marka, model,
// durum, kanıt. Kişi adı kaydın gittiği hesaplardan, marka Vegawin kartından (depo doldurur) gelir.
const FS_DURUM = {
  bekliyor: ["acik", null, "fabrikadan istendi, cevap bekleniyor"],
  sureSoruluyor: ["acik", null, "süre yazması bekleniyor"],
  repete: ["beklemede", null, "gelecek dedi"],
  gelecek: ["beklemede", null, "gelecek dedi"],
  geldi: ["beklemede", "Hemra", "mal geldi, Vegawin girişi bekleniyor"],
  bitti: ["acik", "Hemra", "fabrikada bitti, karar bekleniyor"],
};
const RK_DURUM = {
  hemra: ["acik", "Hemra", "dağılım onayı bekleniyor"], patron: ["acik", "Patron", "onayınız bekleniyor"], fuat: ["acik", "Fuat", "Fuat'ın cevabı bekleniyor"],
  acik: ["beklemede", "Fuat", "üretimde"], beklemede: ["beklemede", "Fuat", "Fuat yapamam dedi, beklemede"],
  red: ["bitti", "Patron", "reddedildi"], iptal: ["bitti", "Hemra", "iptal"], geldi: ["bitti", "Fuat", "mal geldi"], kapandi: ["bitti", "Fuat", "kapandı"],
};
export function repeteSatiri(r) {
  const [durum, kim, yazi] = RK_DURUM[r.durum] || ["acik", "Hemra", r.durum];
  const onay = r.fuat && r.fuat.zaman ? `Fuat onayladı${r.fuat.kaynak ? ` (${r.fuat.kaynak})` : ` (${zamanYaz(r.fuat.zaman)})`}` : null;
  return { id: `repete:${r.id}`, tur: "repete", kod: String(r.kod), marka: r.magaza || null, ne: `Repete ${r.adet || "?"} adet`, kim, durum, bot: "sami", acildi: r.zaman || 0, guncel: (r.fuat && r.fuat.zaman) || (r.patron && r.patron.zaman) || r.zaman || 0,
    kanit: r.durum === "acik" ? `${onay || "Fuat onayladı"}, teslim ${String(r.teslim || "").split("-").reverse().join(".")}` : `${yazi} (repete kaydı ${zamanYaz(r.zaman || 0)})`, ek: { adet: r.adet, teslim: r.teslim || null, rdurum: r.durum } };
}
export function fabrikaSatiri(f, adlar = {}) {
  const [durum, sabitKim, yazi] = FS_DURUM[f.durum] || ["acik", null, f.durum];
  const kisiler = [...new Set((f.chats || []).map((c) => adlar[String(c)]).filter(Boolean))];
  const kim = sabitKim || (kisiler.length ? kisiler.join(", ") : "Sinem, Fuat, Nuri");
  const sure = ["repete", "gelecek"].includes(f.durum) && (f.hazirGun || f.teslimSure) ? `${f.teslimSure ? `, ${f.teslimSure}` : ""}${f.hazirGun ? ` (hazır: ${String(f.hazirGun).split("-").reverse().join(".")})` : ""}` : "";
  return { id: `fabrika:${f.id}`, tur: "fabrika", kod: String(f.kod), marka: f.magaza || null, ne: "Fabrika isteği (eksik listesi)", kim, durum, bot: "sami", acildi: f.gonderim || 0, guncel: f.gonderim || 0,
    kanit: `${yazi}${sure}; fabrikaya gitti ${zamanYaz(f.gonderim || 0)}`, ek: { fdurum: f.durum } };
}
// Sami'nin fabrika isteğine bağlı kart türleri (düğme öneki): fabrika kartı, "bitti" onayı, Hemra kararı
export const FS_AILE = new Set(["fc", "fk", "fo"]);
export function kartSatiri(r, adlar = {}) {
  return { id: `kart:${r.anahtar}`, tur: "kart", kod: r.kod ? String(r.kod) : null, marka: null, ne: kartNe(r.ozet), kim: adlar[String(r.kime)] || "adı kayıtsız kişi", kimId: String(r.kime), durum: "acik", bot: r.bot, acildi: r.zaman, guncel: r.zaman, kanit: `kart gitti ${zamanYaz(r.zaman)}${r.mesaj && r.mesaj < 1e8 ? `, mesaj ${r.mesaj}` : ""}; basılmadı`,
    ek: { isdId: r.id, chat: r.chat, mesaj: r.mesaj, hatirlatildi: Number(r.hatirlatildi) || 0, aile: kartAilesi(r.cb) } };
}
// ---------- TEK LİSTE (saf): kaynak verilerden defteri kurar — StokDO içinde çalışır (kaynağında), testte de aynısı ----------
// isd: iş defteri satırları (son 6 gün) · fs: açık fabrika kayıtları (özet) · rk: açık repete kayıtları · ek: botların doğrudan yazdığı iş
// satırları (Venom görev / bot işi, Pelin üretim, Kemal kuyruk) · adlar: { telegramKimliği: ad }
const BOT_ADI = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", nora: "Nora", sami: "Sami", venom: "Venom" };
export function defterKur({ isd = [], fs = [], rk = [], ek = [], simdi, adlar = {} }) {
  const { acik, kapat: kapanacak } = kartlariIndir(isd, simdi, { repeteler: rk.map((r) => ({ kod: r.kod, durum: r.durum, zaman: r.zaman, onay: r.fuat && r.fuat.zaman })), fsAcik: new Set(fs.map((f) => f.id)) });
  // Fabrika istekleri: aynı model için TEK satır (en yeni kayıt); eski tekrarlar ayrı iş sayılmaz
  const fsYeni = new Map();
  for (const f of fs.filter((x) => !x.deneme)) { const o = fsYeni.get(String(f.kod)); if (!o || (f.gonderim || 0) >= (o.gonderim || 0)) fsYeni.set(String(f.kod), f); }
  const fsEski = fs.filter((x) => !x.deneme).length - fsYeni.size;
  // Kartlar: aynı soru (aynı bot + model + tür + yazı) birden çok kişiye gittiyse TEK iş (kim: hepsi)
  const birles = new Map();
  for (const s of acik.map((r) => kartSatiri(r, adlar))) {
    const a = `${s.bot}|${s.kod || ""}|${s.ek.aile}|${s.ne}`, m = birles.get(a);
    if (!m) birles.set(a, { ...s, kimIdler: [s.kimId], kimler: [s.kim] });
    else { if (!m.kimIdler.includes(s.kimId)) { m.kimIdler.push(s.kimId); if (!m.kimler.includes(s.kim)) m.kimler.push(s.kim); m.kim = m.kimler.join(", "); } m.acildi = Math.min(m.acildi, s.acildi); m.ek.hatirlatildi = Math.max(m.ek.hatirlatildi || 0, s.ek.hatirlatildi || 0); }
  }
  const ekS = ek.filter((x) => x.durum !== "bitti" || simdi - (x.guncel || 0) < 3 * 86400);
  const rkS = rk.filter((r) => !["red", "iptal", "geldi", "kapandi"].includes(r.durum) || simdi - (r.kapandi || r.zaman || 0) < 3 * 86400).map(repeteSatiri);
  const fsS = [...fsYeni.values()].map((f) => fabrikaSatiri(f, adlar));
  // Bir işin kartı ayrı satır olmaz: görev kartı → görev satırı; repete / fabrika kartı → o modelin repete / fabrika satırı (kim: kart kimdeyse)
  const isVar = new Map();
  for (const x of [...fsS, ...rkS]) isVar.set(`${x.tur === "repete" ? "rk" : "fs"}|${x.kod}`, x);
  const kartS = [];
  for (const s of birles.values()) {
    if (s.ek.aile === "vg" && ekS.some((g) => g.tur === "gorev" && g.durum !== "bitti")) continue;
    const sahip = s.bot === "sami" && s.kod ? (s.ek.aile === "rk" ? isVar.get(`rk|${s.kod}`) : FS_AILE.has(s.ek.aile) ? isVar.get(`fs|${s.kod}`) : null) : null;
    if (sahip && sahip.durum !== "bitti") { sahip.kartta = [...new Set([...(sahip.kartta || []), ...s.kimler])]; if (sahip.tur === "fabrika" && sahip.kartta.length === 1) sahip.kim = sahip.kartta[0]; continue; } // kart tek kişideyse iş onda (ör. Fuat'ın "bitti" onayı)
    kartS.push(s);
  }
  // Bugün biten işler (botların iş defterine yazdığı: kanala paylaşıldı, siteye eklendi, üretim bitti …) → kanıtıyla "bitti" satırı
  const bitenS = isd.filter((r) => r.tur === "is" && !Number(r.deneme) && simdi - r.zaman < 86400).slice(-80).map((r) => ({ id: `is:${r.id}`, tur: "is", kod: r.kod ? String(r.kod).split(",")[0] : null, marka: null, ne: kartNe(r.ozet), kim: BOT_ADI[r.bot] || r.bot, durum: "bitti", bot: r.bot, acildi: r.zaman, guncel: r.zaman, kanit: `iş defteri ${zamanYaz(r.zaman)}` }));
  const satirlar = [...rkS, ...fsS, ...ekS, ...kartS, ...bitenS];
  // repete açık / beklemede olan modelin fabrika isteği ayrıca "açık iş" sayılmaz (tek satır: repete)
  const repeteli = new Set(satirlar.filter((x) => x.tur === "repete" && x.durum !== "bitti").map((x) => x.kod));
  const sade = satirlar.filter((x) => !(x.tur === "fabrika" && repeteli.has(x.kod)));
  const ozet = { zaman: simdi, acik: sade.filter((x) => x.durum === "acik").length, beklemede: sade.filter((x) => x.durum === "beklemede").length, bitti: sade.filter((x) => x.durum === "bitti").length, kapatilan: kapanacak.length, fabrikaEskiTekrar: fsEski };
  return { satirlar: sade, kapanan: kapanacak, ozet };
}
// Zorunlu alan denetimi (deftere doğrudan yazılan satırlar için): boş alan varsa satır YAZILMAZ
export function satirEksigi(s) {
  const e = [];
  if (!s || !s.id) e.push("kimlik");
  if (!s || !String(s.ne || "").trim()) e.push("iş");
  if (!s || !String(s.kim || "").trim() || /^(fabrika|\?)$/i.test(String(s.kim).trim())) e.push("kişi adı");
  if (!s || !["acik", "beklemede", "bitti"].includes(s.durum)) e.push("durum");
  if (!s || !String(s.kanit || "").trim()) e.push("kanıt");
  if (!s || !Number(s.acildi)) e.push("tarih");
  return e;
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
