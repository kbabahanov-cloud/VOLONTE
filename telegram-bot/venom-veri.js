// VENOM — TEK GERÇEK KAYNAK (12 Kasım, Patron: "kökten yeniden yapılanma").
// Venom hiçbir şeyi hafızadan söylemez: her cevap buradaki okuma işlevlerinden gelir (ortak defter, Vegawin stok / satış, site, kanal).
// Sabah raporu ile sohbet AYNI işlevleri kullanır (rapor "4" deyip sohbet "9" diyemez). Listeler yarıda kesilmez: bütün satırlar döner,
// uzunsa sayfalanır ("sayfa 2/3"). Her satırda tarih + saat, kişi adı, marka, model, durum, kanıt bulunur.
import { stokIste } from "./stokbot.js";
import { defterOku, repeteKayitlari, repeteSatiri, MARKA_AD } from "./tek-defter.js";
import { siteVerisi } from "./depo-oku.js";
import { markaKesin } from "./yayin-kontrol.js";
import { magazaStoklari, silOnayli } from "./sil.js";
import { fabrikayaGidenler } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
export const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const gunBasi = (g) => Math.floor(Date.parse(`${g}T00:00:00Z`) / 1000) - SAAT_FARKI;
export const zamanYaz = (t) => { const d = new Date((Number(t) + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`; };
const gunYaz = (g) => String(g).slice(5).split("-").reverse().join(".");
const oku = async (env, k, bos = null) => { try { return (await env.KAYIT.get(k, "json")) ?? bos; } catch { return bos; } };
const DURUM = { acik: "açık", beklemede: "beklemede", bitti: "bitti" };
export const SAYFA = 40;

// Tek satır: tarih saat · model · marka · ne · kim · durum · kanıt (zorunlu alanlar hep yazılır)
export const satirYazi = (x) => `${zamanYaz(x.acildi)} · ${x.kod || "genel"} · ${MARKA_AD[x.marka] || x.marka || "marka kayıtsız"} · ${x.ne} · ${x.kim} · ${DURUM[x.durum] || x.durum} · kanıt: ${x.kanit}`;
export function sayfala(satirlar, sayfa = 1, boy = SAYFA) {
  const toplam = Math.max(1, Math.ceil(satirlar.length / boy)), s = Math.min(Math.max(1, Number(sayfa) || 1), toplam);
  return { dilim: satirlar.slice((s - 1) * boy, s * boy), sayfa: s, toplam, not: toplam > 1 ? `Sayfa ${s}/${toplam} (toplam ${satirlar.length} satır; devamı için sayfa=${s + 1 > toplam ? 1 : s + 1}).` : `Toplam ${satirlar.length} satır, hepsi yukarıda.` };
}

// ---------- DEFTER (sayfalı, eksiksiz) ----------
export async function defterSatirlari(env, simdi, { kuru = false } = {}) { return (await defterOku(env, simdi, { kuru, kapat: !kuru, venom: !kuru })).satirlar; }
export async function defterMetni(env, simdi, { kod = null, kim = null, durum = null, sayfa = 1, kuru = false } = {}) {
  const hepsi = await defterSatirlari(env, simdi, { kuru });
  const k = String(kim || "").toLocaleLowerCase("tr");
  const l = hepsi.filter((x) => (durum === "hepsi" ? true : durum === "beklemede" ? x.durum === "beklemede" : durum === "bitti" ? x.durum === "bitti" : x.durum !== "bitti") && (!kod || String(x.kod) === String(kod)) && (!k || String(x.kim).toLocaleLowerCase("tr").includes(k)))
    .sort((a, b) => (a.acildi || 0) - (b.acildi || 0));
  if (!l.length) return `Defterde ${kod ? `${kod} için ` : ""}${kim ? `${kim} üzerinde ` : ""}${durum === "bitti" ? "biten" : "açık"} iş yok.`;
  const s = sayfala(l, sayfa);
  return [...s.dilim.map(satirYazi), s.not].join("\n");
}

// ---------- CEVAPSIZ KARTLAR: kişi kişi, en eskisinden ----------
export async function cevapsizKartlar(env, simdi, { sayfa = 1, kuru = false } = {}) {
  const l = (await defterSatirlari(env, simdi, { kuru })).filter((x) => x.durum === "acik" && ["kart", "fabrika", "repete", "gorev"].includes(x.tur) && x.kim !== "Patron");
  if (!l.length) return "Cevap bekleyen kart yok.";
  const kisi = new Map();
  for (const x of l) for (const ad of String(x.kim).split(",").map((y) => y.trim()).filter(Boolean)) { if (!kisi.has(ad)) kisi.set(ad, []); kisi.get(ad).push(x); }
  const sirali = [...kisi.entries()].map(([ad, isler]) => [ad, isler.sort((a, b) => (a.acildi || 0) - (b.acildi || 0))]).sort((a, b) => (a[1][0].acildi || 0) - (b[1][0].acildi || 0));
  const satirlar = [];
  for (const [ad, isler] of sirali) { satirlar.push(`${ad} — ${isler.length} kart (en eskisi ${zamanYaz(isler[0].acildi)}):`); for (const x of isler) satirlar.push(`  ${zamanYaz(x.acildi)} · ${x.kod || "genel"} · ${MARKA_AD[x.marka] || x.marka || "marka kayıtsız"} · ${x.ne}${["fabrika", "repete"].includes(x.tur) && x.kanit ? ` — ${String(x.kanit).split(";")[0]}` : ""}`); }
  const s = sayfala(satirlar, sayfa, 60);
  const kartSatiri = satirlar.filter((x) => x.startsWith("  ")).length;
  const not = s.toplam > 1 ? s.not : `Toplam ${kartSatiri} kart satırı, hepsi yukarıda${kartSatiri > l.length ? ` (${l.length} iş; ortak kart her kişide ayrı yazılır)` : ""}.`;
  return [`Cevap bekleyen ${l.length} iş, ${kisi.size} kişide (en eskiden yeniye):`, ...s.dilim, not].join("\n");
}

// ---------- SİLME KANITI ----------
export async function silmeKaniti(env, kod) {
  const site = (await siteVerisi(env).catch(() => [])) || [];
  const liste = Array.isArray(site) ? site : site.urunler || [];
  const sitede = liste.some((u) => String(u.kod) === String(kod));
  const kanal = await oku(env, `silinen:${kod}`, null);
  const suren = await oku(env, `silinecek:${kod}`, null);
  const kanalAd = await oku(env, "kanal", null);
  const kuyruk = [...((await oku(env, "venom:siteSil", [])) || []), ...((await oku(env, "venom:kanalSil", [])) || [])].some((x) => String(x.kod) === String(kod));
  const kodlar = (await oku(env, "kodlar", {})) || {};
  const onay = (await silOnayli(env))[String(kod)] || null;
  const link = (id) => (kanalAd && kanalAd.kullanici ? `https://t.me/${kanalAd.kullanici}/${id}` : `#${id}`);
  return { sitede, siteYuklendi: liste.length > 0, kanal: kanal ? { zaman: kanal.zaman, kim: kanal.kim, mesajlar: (kanal.kopya || []).map((c) => c.kanal), gizlenen: (kanal.kopya || []).filter((c) => c.gizlendi).map((c) => c.kanal), linkler: (kanal.kopya || []).map((c) => link(c.kanal)) } : null,
    suruyor: Boolean(suren) || kuyruk, kanaldaPaylasim: (kodlar[String(kod)] || []).length, onay };
}
export function silmeMetni(kod, k) {
  if (!k.kanal && !k.suruyor && !k.onay) return k.sitede ? `Silme: yapılmadı (silme kaydı yok; model sitede duruyor).` : `Silme: silme kaydı yok. Sitede yok${k.kanaldaPaylasim ? `; kanalda ${k.kanaldaPaylasim} paylaşım kaydı var` : "; kanalda paylaşım kaydı yok"}.`;
  const site = !k.siteYuklendi ? "site okunamadı" : k.sitede ? "sitede HÂLÂ duruyor" : "siteden kalktı (site listesinde yok)";
  const kanal = k.kanal ? `kanaldan kalktı ${zamanYaz(k.kanal.zaman)}: ${k.kanal.mesajlar.length} mesaj${k.kanal.gizlenen.length ? ` (${k.kanal.gizlenen.length} eski mesaj Telegram kuralı yüzünden silinemedi, SOLD OUT görseliyle gizlendi)` : ""}; mesaj no ${k.kanal.mesajlar.join(", ")}` : k.suruyor ? "kanal silmesi sürüyor" : k.kanaldaPaylasim ? `kanalda ${k.kanaldaPaylasim} paylaşım kaydı duruyor` : "kanalda paylaşım kaydı yok";
  const bitti = k.siteYuklendi && !k.sitede && (k.kanal || !k.kanaldaPaylasim) && !k.suruyor;
  return `Silme: ${bitti ? "BİTTİ" : k.suruyor ? "SÜRÜYOR" : "BİTMEDİ"} — ${site}; ${kanal}.`;
}

// ---------- MODEL DURUMU: marka, stok, repete, silme, açık kartlar, çelişki ----------
export async function modelDurumu(env, kod, simdi, { kuru = false } = {}) {
  kod = String(kod).replace(/\D/g, "");
  if (!kod) return "Model kodu yok.";
  const [m, stok, sil, rk, satirlar] = await Promise.all([markaKesin(env, kod).catch(() => ({})), magazaStoklari(env, kod), silmeKaniti(env, kod), repeteKayitlari(env, kod).catch(() => []), defterSatirlari(env, simdi, { kuru })]);
  const stokYazi = Object.keys(stok.magazalar).length ? Object.entries(stok.magazalar).map(([g, n]) => `${MARKA_AD[g] || g} ${Math.max(0, n)} adet`).join(" · ") : "Vegawin'de kart yok";
  const acikRk = rk.filter((r) => String(r.kod) === kod && !["red", "iptal", "geldi", "kapandi"].includes(r.durum)); // SADECE bu modelin repetesi (başka modelin açık repetesi karışmaz)
  const acik = satirlar.filter((x) => String(x.kod) === kod && x.durum !== "bitti");
  const karar = await stokIste(env, "/ayar-oku", { k: `karar:son:${kod}` }).then((r) => (r.v ? JSON.parse(r.v) : null)).catch(() => null);
  const celiski = [];
  if (stok.var && (sil.onay || sil.kanal || sil.suruyor)) celiski.push("stok varken silme kaydı var (kural: stok bitmeden silinmez)");
  if (acikRk.length && (sil.onay || sil.kanal)) celiski.push("hem repete açık hem silme onaylanmış");
  if ((sil.kanal || sil.onay) && acik.length) celiski.push(`silinen model için ${acik.length} açık kart duruyor (kapatılmalı)`);
  return [
    `${kod}: marka ${MARKA_AD[m.marka] || "kayıtsız"}${m.kaynak ? ` (${m.kaynak})` : ""}. Stok: ${stokYazi}.`,
    `Repete: ${acikRk.length ? acikRk.map((r) => `${r.adet} adet — ${repeteSatiri(r).kanit}`).join("; ") : "açık repete yok"}.`,
    silmeMetni(kod, sil),
    karar ? `Son karar: ${zamanYaz(karar.zaman)} ${karar.kim || ""} — ${karar.ne}.` : "Son karar: kayıt yok.",
    acik.length ? `Açık işler (${acik.length}):\n${acik.map((x) => `  ${satirYazi(x)}`).join("\n")}` : "Açık iş yok.",
    celiski.length ? `ÇELİŞKİ: ${celiski.join("; ")}.` : "Çelişki yok.",
  ].join("\n");
}

// ---------- GÜN VERİSİ: site (ekleme / güncelleme / kaldırma AYRI), kanal (her paylaşım kodlu), fabrika ----------
export async function gunVerisi(env, gun) {
  const bas = gunBasi(gun), bit = bas + 86400;
  const selin = await stokIste(env, "/isd-oku", { basla: bas, bitis: bit - 1, bot: "selin" }).catch(() => []);
  const site = { eklenen: [], guncellenen: [], kaldirilan: [] };
  for (const r of (Array.isArray(selin) ? selin : []).filter((x) => x.tur === "is" && /^site:/i.test(String(x.ozet || "")))) {
    const o = String(r.ozet), kodlar = [...new Set(o.match(/(?<![\d.,:])\d{3,5}(?![\d.,:])/g) || [])];
    const hedef = /siteden kald[ıi]r[ıi]ld[ıi]/i.test(o) ? site.kaldirilan : /siteye eklendi|siteye geri/i.test(o) ? site.eklenen : site.guncellenen;
    if (hedef === site.guncellenen) hedef.push({ zaman: r.zaman, ne: o.replace(/^site:\s*/i, "").slice(0, 80) });
    else for (const k of kodlar.slice(0, 1)) if (!hedef.some((x) => x.kod === k)) hedef.push({ kod: k, zaman: r.zaman });
  }
  const kodlar = (await oku(env, "kodlar", {})) || {}, kanalAd = await oku(env, "kanal", null);
  const kanal = [];
  for (const [kod, l] of Object.entries(kodlar)) for (const g of l || []) if (g.tarih >= bas && g.tarih < bit) kanal.push({ kod, zaman: g.tarih, mesaj: (g.ids || [])[0] || null, link: kanalAd && kanalAd.kullanici && (g.ids || [])[0] ? `https://t.me/${kanalAd.kullanici}/${g.ids[0]}` : null });
  kanal.sort((a, b) => a.zaman - b.zaman);
  const fab = await fabrikayaGidenler(env, gun).catch(() => ({ giden: {}, bekleyen: [] }));
  return { gun, site, kanal, fabrika: { VOLONTE: [...(fab.giden.VOLONTE || [])].sort(), BLACKROSE: [...(fab.giden.BLACKROSE || [])].sort(), bekleyen: fab.bekleyen || [] } };
}
export function gunVerisiMetni(v, simdi) {
  const ne = v.gun === gunA(simdi) ? "Bugün" : v.gun === gunA(simdi - 86400) ? "Dün" : gunYaz(v.gun);
  const kl = (l) => (l.length ? l.map((x) => `${x.kod} (${zamanYaz(x.zaman).slice(6)})`).join(", ") : "yok");
  return [
    `${ne} (${gunYaz(v.gun)}) — kaynak: Selin'in site kaydı, Kemal'in kanal kaydı, Sami'nin fabrika kaydı.`,
    `Siteye EKLENEN ${v.site.eklenen.length} model: ${kl(v.site.eklenen)}`,
    `Siteden KALDIRILAN ${v.site.kaldirilan.length} model: ${kl(v.site.kaldirilan)}`,
    `Site GÜNCELLEMESİ ${v.site.guncellenen.length} kez${v.site.guncellenen.length ? `: ${v.site.guncellenen.map((x) => `${x.ne} (${zamanYaz(x.zaman).slice(6)})`).join("; ")}` : ""}`,
    `Kanala PAYLAŞIM ${v.kanal.length}: ${v.kanal.length ? v.kanal.map((x) => `${x.kod} (${zamanYaz(x.zaman).slice(6)}, mesaj ${x.mesaj})`).join(", ") : "yok"}`,
    `Fabrikaya giden: VOLONTE ${v.fabrika.VOLONTE.length}${v.fabrika.VOLONTE.length ? ` (${v.fabrika.VOLONTE.join(", ")})` : ""} · Black Rose ${v.fabrika.BLACKROSE.length}${v.fabrika.BLACKROSE.length ? ` (${v.fabrika.BLACKROSE.join(", ")})` : ""}`,
  ].join("\n");
}

// ---------- SATIŞ: model bazında (marka marka, en çok satan N) ----------
export async function enCokSatan(env, gun, n = 3) {
  const s = [];
  for (const m of ["VOLONTE", "BLACKROSE"]) {
    const x = await stokIste(env, "/satis-sayim", { gun, magaza: m }).catch(() => null);
    if (!x) { s.push(`${MARKA_AD[m]}: satış kaydı okunamadı.`); continue; }
    const l = (x.liste || []).slice(0, Math.max(1, Math.min(50, Number(n) || 3)));
    s.push(`${MARKA_AD[m]} (${gunYaz(gun)}, toplam ${x.toplam} adet, ${x.model} model): ${l.length ? l.map((y, i) => `${i + 1}) ${y.kod} — ${y.satilan} adet`).join(", ") : "satış yok"}`);
  }
  return s.join("\n");
}
