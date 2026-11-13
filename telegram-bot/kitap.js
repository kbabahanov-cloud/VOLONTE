// TEK KİTAP (13 Kasım, Patron — kural 37): bütün botlar kurallarını SADECE KURALLAR-PATRON.md'den okur.
// Kitap KV "kitap:metin"de durur (araclar/kitap-yukle.py yükler; kural değişince bütün botlar aynı anda yeni kitabı okur,
// yeniden yükleme gerekmez). KV okunamazsa pakete gömülü kopya (kitap-yedek.js; aynı betik üretir) kullanılır.
// Her bot okuduğu sürümü KV "kitap:okudu:<bot>"a yazar (ofis ekranı gösterir).
import { KITAP_YEDEK, DERSLER_YEDEK } from "./kitap-yedek.js";
import { MARKA_KARAR_YAZISI } from "./kurallar.js";

const BOLUM = { venom: null, sami: ["SAMİ"], kemal: ["KEMAL"], selin: ["SELİN"], pelin: ["PELİN"], nora: ["NORA"] }; // venom: kitabın tamamı (hepsini yönetir)
export const KITAP_BOTLARI = Object.keys(BOLUM);
const BELLEK_SN = 300;
let bellek = { zaman: 0, metin: null };
const yazilan = {}; // bot → bu çalışmada KV'ye yazılmış sürüm

export const kitapSurumu = (metin) => (/^Sürüm:\s*(\S+)/m.exec(String(metin || "")) || [])[1] || "?";

// Kitabı "## BAŞLIK" bölümlerine ayırır → { ORTAK: "...", VENOM: "...", ... }
export function kitapBolumleri(metin) {
  const b = {};
  let ad = null;
  for (const satir of String(metin || "").split("\n")) {
    const m = /^## (.+?)\s*$/.exec(satir);
    if (m) { ad = m[1].trim(); b[ad] = []; continue; }
    if (ad) b[ad].push(satir);
  }
  for (const k of Object.keys(b)) b[k] = b[k].join("\n").trim();
  return b;
}

// Bir botun yapay zekâsına verilecek kitap metni: ORTAK + kendi bölümü + PARA SINIRLARI + KORUNAN AKIŞLAR (Venom: bütün bölümler).
export function kitapBolumu(metin, bot) {
  const b = kitapBolumleri(metin);
  const adlar = BOLUM[bot] === null ? Object.keys(b) : ["ORTAK", ...(BOLUM[bot] || []), "PARA SINIRLARI", "KORUNAN AKIŞLAR"]; // 13 Kasım (kural 75–76): korunan akışları her bot okur
  const govde = adlar.filter((a, i) => b[a] && adlar.indexOf(a) === i).map((a) => `## ${a}\n${b[a]}`).join("\n\n");
  return `TEK KURAL KİTABI (Patron'un kuralları, sürüm ${kitapSurumu(metin)}) — her şeyin üstündedir; aşağıdaki çalışma talimatıyla çakışırsa kitap kazanır:\n${govde}\n\n${MARKA_KARAR_YAZISI}`;
}

// Kitaptaki para sınırları (kural 74): { venom: { ay: 50 }, pelin: { gun: 10, ay: 100 }, ... } — rakam kitapta değişince kod değişmeden değişir.
export function paraSinirlari(metin) {
  const b = kitapBolumleri(metin)["PARA SINIRLARI"] || "";
  const s = {};
  for (const m of b.matchAll(/(Venom|Kemal|Selin|Sami|Pelin)\s+([^·;]+)/g)) {
    const bot = m[1].toLowerCase();
    const x = {};
    for (const r of m[2].matchAll(/(\d+(?:[.,]\d+)?)\s*\$\s*\/\s*(gün|ay)/g)) x[r[2] === "gün" ? "gun" : "ay"] = Number(r[1].replace(",", "."));
    if (Object.keys(x).length) s[bot] = x;
  }
  return s;
}

// Kitap okunamaz / tablo bozulursa kullanılan değerler (testte kitaptaki tabloyla AYNI olduğu doğrulanır)
export const SINIR_VARSAYILAN = { venom: { ay: 50 }, kemal: { ay: 20 }, selin: { ay: 10 }, sami: { ay: 5 }, pelin: { gun: 10, ay: 100 } };
// Bir botun para sınırı (kural 74): kitaptaki tablodan; { ay, gun? }
export async function botSiniri(env, bot, simdi = Math.floor(Date.now() / 1000)) {
  let s = null;
  try { s = paraSinirlari(await kitapMetni(env, simdi))[bot]; } catch { s = null; }
  return s && s.ay ? s : SINIR_VARSAYILAN[bot] || { ay: 0 };
}

export async function kitapMetni(env, simdi = Math.floor(Date.now() / 1000)) {
  if (bellek.metin && simdi - bellek.zaman < BELLEK_SN) return bellek.metin;
  let metin = null;
  try { metin = await env.KAYIT.get("kitap:metin"); } catch { metin = null; }
  if (!metin || !/^## ORTAK/m.test(metin)) metin = KITAP_YEDEK;
  bellek = { zaman: simdi, metin };
  return metin;
}

// Botun kitabı: metni döndürür ve okuduğu sürümü kayda geçirir (sürüm değişince ya da günde bir kez).
export async function kitapOku(env, bot, simdi = Math.floor(Date.now() / 1000)) {
  const metin = await kitapMetni(env, simdi);
  const surum = kitapSurumu(metin);
  if (yazilan[bot] !== surum) {
    try {
      const eski = await env.KAYIT.get(`kitap:okudu:${bot}`, "json").catch(() => null);
      if (!eski || eski.surum !== surum || simdi - (eski.zaman || 0) > 86400) await env.KAYIT.put(`kitap:okudu:${bot}`, JSON.stringify({ surum, zaman: simdi }));
      yazilan[bot] = surum;
    } catch { /* kayıt yazılamazsa kitap yine okunur */ }
  }
  return kitapBolumu(metin, bot);
}

// DERS DEFTERİ özeti (kural 38; Venom çelişki ararken okur): her dersin "N. KONU — Çözüm: …" satırı.
export function derslerOzeti(metin) {
  const l = [];
  for (const m of String(metin || "").matchAll(/^(\d+)\. (.+?) — .*?Çözüm: (.+?)\s*\((?:ÇÖZÜLDÜ|KURULUYOR|KISMEN|AÇIK)[^)]*\)\s*$/gm)) l.push(`${m[1]}. ${m[2]} → ${m[3]}`);
  return l.length ? `DERS DEFTERİ (geçmiş hatalardan çıkan dersler; yeni kural ya da emir bunlarla çelişmemeli):\n${l.join("\n")}` : "";
}
let dersBellek = { zaman: 0, metin: null };
export async function derslerOku(env, simdi = Math.floor(Date.now() / 1000)) {
  if (dersBellek.metin !== null && simdi - dersBellek.zaman < BELLEK_SN) return dersBellek.metin;
  let m = null;
  try { m = await env.KAYIT.get("kitap:dersler"); } catch { m = null; }
  dersBellek = { zaman: simdi, metin: derslerOzeti(m || DERSLER_YEDEK) };
  return dersBellek.metin;
}

export const kitapBellegiSil = () => { bellek = { zaman: 0, metin: null }; dersBellek = { zaman: 0, metin: null }; for (const k of Object.keys(yazilan)) delete yazilan[k]; }; // testler için
