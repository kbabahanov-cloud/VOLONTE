// VENOM YÖNETİM (6 Kasım, Patron): iş takibi, hata alarmı, geri alma, haftalık özet, yedek, satış/stok uyarıları,
// paylaşılmayanlar, para özeti, hatırlatıcı, fikir kutusu, gizlilik süzgeci. Para harcamaz (fikir kutusu Venom'un mevcut
// yapay zekâ bütçesinden, haftada bir ~0,02 $). Bütün sayılar Sami'nin deposundan (StokDO) ve ortak kayıttan (KV).
import { stokIste } from "./stokbot.js";
import { durYaz, durDurumu } from "./durdurma.js";

const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json").catch(() => null)) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);
export const gunA = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(0, 10);
const saatA = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(11, 16);
const BOT_AD = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" };

// ---------- 4) İŞ TAKİBİ: Venom'un verdiği her iş; 30 dk cevap yoksa hatırlat; akşam bitmeyenler ----------
export async function isKaydet(env, bot, ne, simdi) {
  const l = await oku(env, "venom:bot:isler", []);
  l.push({ id: `${simdi}-${Math.random().toString(36).slice(2, 6)}`, bot, ne: String(ne).slice(0, 120), zaman: simdi, durum: "bekliyor" });
  await kaydet(env, "venom:bot:isler", l.slice(-60), 7 * 86400).catch(() => null);
}
export async function isCevap(env, bot, simdi) {
  const l = await oku(env, "venom:bot:isler", []);
  const x = l.find((y) => y.bot === bot && y.durum === "bekliyor");
  if (!x) return null;
  Object.assign(x, { durum: "bitti", bitis: simdi });
  await kaydet(env, "venom:bot:isler", l, 7 * 86400).catch(() => null);
  return simdi - (x.zaman || 0) < 2 * 3600 ? x : null; // 9 Kasım: 2 saat içindeki iş → bu mesaj Patron'un isteğinin cevabı (hemen gider)
}
export async function isHatirlat(env, simdi) {
  const l = await oku(env, "venom:bot:isler", []);
  const geciken = l.filter((x) => x.durum === "bekliyor" && !x.hatirlatildi && simdi - x.zaman >= 1800);
  if (!geciken.length) return null;
  for (const x of geciken) x.hatirlatildi = simdi;
  for (const x of l) if (x.durum === "bekliyor" && simdi - x.zaman > 86400) x.durum = "zamanAsimi";
  await kaydet(env, "venom:bot:isler", l, 7 * 86400).catch(() => null);
  return `⏰ 30 dakikadır cevap gelmeyen iş${geciken.length > 1 ? "ler" : ""}:\n${geciken.map((x) => `• ${BOT_AD[x.bot] || x.bot}: ${x.ne} (${saatA(x.zaman)})`).join("\n")}\nTakip ediyorum; gerekirse tekrar isteyeyim mi?`;
}
export async function bitmeyenIsler(env, simdi, sure = 86400) {
  const l = (await oku(env, "venom:bot:isler", [])).filter((x) => x.durum !== "bitti" && simdi - x.zaman < 7 * 86400);
  return l.length ? `📌 Bitmeyen işler (${l.length}):\n${l.slice(-10).map((x) => `• ${BOT_AD[x.bot] || x.bot}: ${x.ne} (${gunA(x.zaman).slice(5)} ${saatA(x.zaman)}${x.durum === "zamanAsimi" ? ", 24 saati geçti" : ""})`).join("\n")}` : "📌 Bitmeyen iş yok.";
}

// ---------- 8) HATA ALARMI: bir bot 2 saat içinde 3 ayrı hata → Venom o botu durdurur, Patron'a haber ----------
export async function hataAlarmi(env, bot, zaman, hata, simdi) {
  const k = `venom:hataGecmis:${bot}`;
  const l = [...(await oku(env, k, [])).filter((x) => simdi - x.zaman < 7 * 86400), { zaman, hata: String(hata || "").slice(0, 120) }].slice(-20);
  await kaydet(env, k, l, 8 * 86400).catch(() => null);
  const son = l.filter((x) => simdi - x.zaman < 7200);
  const d = await durDurumu(env);
  if (son.length >= 3 && !d[bot] && !d.hepsi) {
    await durYaz(env, { [bot]: true, neden: { [bot]: `3 kez üst üste hata (${saatA(son[0].zaman)}–${saatA(son.at(-1).zaman)}): ${son.at(-1).hata}` } }, simdi);
    return `⛔ ${BOT_AD[bot] || bot} 2 saatte 3 kez hata verdi; paylaşım/üretim/yazma işlerini DURDURDUM.\nSon hata: ${son.at(-1).hata}\nAçmak için: "${BOT_AD[bot] || bot}'i aç" (Claude Code'a da kayıtlı).`;
  }
  return null;
}
export async function hataSayilari(env, simdi, sure) {
  const s = {};
  for (const b of Object.keys(BOT_AD)) s[b] = (await oku(env, `venom:hataGecmis:${b}`, [])).filter((x) => simdi - x.zaman < sure).length;
  return s;
}

// ---------- 9) GERİ ALMA: son paylaşım (ya da bir kodun son paylaşımı) → kanaldan + siteden birlikte (tek onay kartıyla) ----------
export async function geriAlBul(env, kod = null) {
  const kodlar = await oku(env, "kodlar", {});
  let secilen = null;
  for (const [k, l] of Object.entries(kodlar)) {
    if (kod && String(k) !== String(kod)) continue;
    const g = (l || [])[0];
    if (g && (!secilen || g.tarih > secilen.g.tarih)) secilen = { kod: k, g };
  }
  if (!secilen) return null;
  const site = await oku(env, `venom:siteSonEkleme:${secilen.kod}`, null);
  const kanal = await oku(env, "kanal", {});
  return { kod: secilen.kod, ids: secilen.g.ids, tarih: secilen.g.tarih, link: kanal.kullanici ? `t.me/${kanal.kullanici}/${secilen.g.ids[0]}` : null, site: site && site.zaman >= secilen.g.tarih - 6 * 3600 ? site : null };
}

// ---------- 15–17) SATIŞ / STOK / PAYLAŞILMAYANLAR (Sami'nin deposu) ----------
export async function satisUyarisi(env, simdi, esik = 20) {
  const gun = gunA(simdi);
  const l = (await stokIste(env, "/satislar", { gun }).catch(() => [])) || [];
  const gor = await oku(env, `venom:satisUyari:${gun}`, []);
  const yeni = l.filter((x) => x.satilan > esik && !gor.includes(String(x.kod)));
  if (!yeni.length) return null;
  await kaydet(env, `venom:satisUyari:${gun}`, [...gor, ...yeni.map((x) => String(x.kod))], 2 * 86400).catch(() => null);
  return `🔥 Bugün çok satan: ${yeni.map((x) => `${x.kod} — ${x.satilan} adet, kalan stok ${Math.max(0, x.kalan ?? 0)}`).join("; ")}`;
}
export async function stokBitiyor(env, simdi) {
  const bas = gunA(simdi - 14 * 86400), son = gunA(simdi);
  const s = (await stokIste(env, "/satis-donem", { basla: bas, bitis: son }).catch(() => ({}))) || {};
  const enCok = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 25).filter(([, a]) => a >= 10);
  if (!enCok.length) return null;
  const st = (await stokIste(env, "/toplu", { kodlar: enCok.map(([k]) => k) }).catch(() => ({}))) || {};
  const gor = await oku(env, "venom:stokUyari", {});
  const azalan = [];
  for (const [k, a] of enCok) {
    const kalan = Math.max(0, (st[k] || {}).toplam ?? 0), hiz = a / 14, gun = hiz ? kalan / hiz : 99;
    if ((gun < 10 || kalan < 8) && !(gor[k] > simdi - 3 * 86400)) { azalan.push(`${k} — 14 günde ${a} satış, kalan ${kalan} (≈${Math.round(gun)} gün)`); gor[k] = simdi; }
  }
  if (!azalan.length) return null;
  await kaydet(env, "venom:stokUyari", gor, 30 * 86400).catch(() => null);
  return `📉 STOK BİTİYOR (çok satanlar) — fabrika sipariş zamanı:\n${azalan.map((x) => `• ${x}`).join("\n")}`;
}
export async function paylasilmayanlar(env, simdi) {
  const st = (await stokIste(env, "/stoktakiler", {}).catch(() => [])) || [];
  const tg = (await stokIste(env, "/tg-hepsi", {}).catch(() => ({}))) || {};
  const l = st.filter((r) => !(tg[r.kod] > simdi - 14 * 86400)).map((r) => r.kod);
  return l.length ? `📭 Stokta olup 2 haftadır kanalda paylaşılmayan ${l.length} model:\n${l.slice(0, 40).join(", ")}${l.length > 40 ? ` … (+${l.length - 40})` : ""}` : "📭 Stokta olup 2 haftadır paylaşılmayan model yok.";
}

// ---------- 18) PARA ÖZETİ (tek satır): bugün Pelin (fal/Higgsfield), Venom (Claude/OpenAI), Kemal+Selin yapay zekâ, Cloudflare ----------
export async function paraOzeti(env, simdi, venomAyUsd) {
  const gun = gunA(simdi), ay = gun.slice(0, 7);
  const pelin = Number((await env.KAYIT.get(`pelin-gun:${gun}`).catch(() => 0)) || 0);
  const ksAy = Number((await env.KAYIT.get(`harcama:${ay}`).catch(() => 0)) || 0) / 1e6;
  const dun = await oku(env, `venom:paraAnlik:${gunA(simdi - 86400)}`, null);
  const ayBasi = gun.endsWith("-01") || !dun || dun.ay !== ay;
  const venomBugun = ayBasi ? venomAyUsd : Math.max(0, venomAyUsd - dun.venom), ksBugun = ayBasi ? ksAy : Math.max(0, ksAy - dun.ks);
  await kaydet(env, `venom:paraAnlik:${gun}`, { ay, venom: venomAyUsd, ks: ksAy }, 3 * 86400).catch(() => null);
  const f = (x) => `${x.toFixed(2).replace(".", ",")} $`;
  return `💵 Bugün: Pelin (fal/Higgsfield) ${f(pelin)} · Venom (Claude/OpenAI) ${f(venomBugun)} · Kemal+Selin yapay zekâ ${f(ksBugun)} · Cloudflare ${f(5 / 30)} (5 $/ay sabit) = ${f(pelin + venomBugun + ksBugun + 5 / 30)}`;
}

// ---------- 19) HATIRLATICI: "yarın 10'da Merdan'a şunu sor" → zamanı gelince Patron'a (+ isterse onaylı mesaj kartı) ----------
export async function hatirlaticiEkle(env, { zaman, metin, kime = null }, simdi) {
  const t = Math.floor(Date.parse(`${String(zaman).slice(0, 16)}:00+03:00`) / 1000);
  if (!t || Number.isNaN(t)) return "Zamanı anlayamadım; ör. 2026-11-07T10:00 biçiminde yaz.";
  if (t < simdi - 60) return "Bu zaman geçmişte; yeni bir zaman söyleyin.";
  const l = await oku(env, "venom:bot:hatirlaticilar", []);
  l.push({ id: `h${simdi}`, zaman: t, metin: String(metin).slice(0, 500), kime: kime || null });
  await kaydet(env, "venom:bot:hatirlaticilar", l.slice(-50));
  return `⏰ Not aldım: ${gunA(t)} ${saatA(t)} — "${String(metin).slice(0, 120)}"${kime ? ` (${kime}; zamanı gelince mesaj kartı onayınıza gelir)` : ""}.`;
}
export async function vadesiGelenler(env, simdi) {
  const l = await oku(env, "venom:bot:hatirlaticilar", []);
  const gelen = l.filter((x) => x.zaman <= simdi);
  if (!gelen.length) return [];
  await kaydet(env, "venom:bot:hatirlaticilar", l.filter((x) => x.zaman > simdi));
  return gelen;
}

// ---------- 21) GİZLİLİK: ekibe giden metinde fiyat/satış/kâr/ciro/maliyet olamaz ----------
const GIZLI = [/fiyat/i, /sat[ıi][sş]/i, /k[âa]r\b/i, /kar oran/i, /ciro/i, /maliyet/i, /(?<!\p{L})al[ıi][sş](?!\p{L})/iu, /\$\s?\d/, /\d+(?:[.,]\d+)?\s?(?:\$|usd|eur|€|tl|₺)(?!\p{L})/iu];
export function ekipSuzgec(metin) { const b = GIZLI.filter((r) => r.test(String(metin || ""))); return b.length ? b.map(String) : null; }

// ---------- 11) YEDEK: her gece önemli kayıtlar tek pakette, 8 gün (geri yükleme: araclar/yedek-geri.py) ----------
const YEDEK_ANAHTAR = ["venom:notlar", "venom:ekip", "venom:hedefler", "venom:claude", "venom:kimlikler", "venom:kopru-ayar", "venom:bot:hafiza", "venom:bot:kararlar",
  "kodlar", "kodsuz", "sonpaylasim", "kanal", "arsiv", "kemal:paylasimGecmisi", "venom:dur", "hicgelmeyecek", "atlananlar", "venom:yeniModel"];
export async function yedekAl(env, simdi) {
  const veri = {};
  for (const k of YEDEK_ANAHTAR) { const v = await env.KAYIT.get(k).catch(() => null); if (v != null) veri[k] = v; }
  let cur;
  do { // model kartları (pelinboy:*)
    const r = await env.KAYIT.list({ prefix: "pelinboy:", cursor: cur }).catch(() => null);
    if (!r) break;
    for (const k of r.keys) { const v = await env.KAYIT.get(k.name).catch(() => null); if (v != null) veri[k.name] = v; }
    cur = r.list_complete ? null : r.cursor;
  } while (cur);
  const gun = gunA(simdi);
  await env.KAYIT.put(`yedek:${gun}:kv`, JSON.stringify({ zaman: simdi, veri }), { expirationTtl: 8 * 86400 });
  return Object.keys(veri).length;
}
