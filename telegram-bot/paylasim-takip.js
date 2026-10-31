// PAYLAŞILMAMIŞ STOK TAKİBİ (Sayım Sami, kullanıcı kararı 31 Ekim). Sadece okur; Vegawin'e ve kanala dokunmaz.
//  • Her gün 10:30 (pazar hariç): stokta olup Telegram'da HİÇ paylaşılmamış ve sitede fotoğrafı/videosu OLMAYAN modeller
//    Hemra'ya "fotoğrafı yok, çekilmeli" listesi — sadece listeye yeni model girince (her gün aynı liste gitmez).
//    Çekilip Selin'le siteye eklenince Kemal'in günlük turuna kendiliğinden girer (günde 2: sabah 1, akşam 1).
//  • Her pazartesi 09:30: Patron'a "stokta olup 14+ gündür paylaşılmayan modeller" listesi.
// İndirimli mal (2000) ve "Sil" ile gizlenenler hariç. Fiyat yazılmaz.
import { stokIste } from "./stokbot.js";
import { indirimliMi } from "./stok.js";
import { siteVerisi } from "./depo-oku.js";
import { murat, sorumlu } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const haftaGunu = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay(); // 0 = pazar
const BEKLEME_GUN = 14;

// Kod başına son Telegram paylaşımı: kanal dizini (kodlar) + Kemal'in yeni düzen paylaşımları (tg) + sonpaylasim
export function sonPaylasimlar(kodlar = {}, tg = {}, sonpaylasim = {}) {
  const son = {};
  const koy = (k, t) => { if (t && !/^~/.test(k)) son[k] = Math.max(son[k] || 0, t); };
  for (const [k, l] of Object.entries(kodlar)) for (const g of l || []) koy(k, g.tarih);
  for (const [k, t] of Object.entries(tg)) koy(k, t);
  for (const [k, t] of Object.entries(sonpaylasim)) koy(k, t);
  return son;
}

export function paylasimDurumu({ tum, site, son, simdi }) {
  const sitede = new Set(site.filter((u) => !u.gizli && (u.fotolar || []).length).map((u) => String(u.kod)));
  const stokta = Object.entries(tum).filter(([k, x]) => x.toplam > 0 && !x.gizli && !indirimliMi(k)).map(([k]) => k).sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  const hic = stokta.filter((k) => !son[k]);
  return {
    hic,
    fotoYok: hic.filter((k) => !sitede.has(k)), // medyası yok: kanalda hiç yok, sitede de yok
    eski: stokta.filter((k) => son[k] && simdi - son[k] >= BEKLEME_GUN * 86400).map((k) => [k, Math.floor((simdi - son[k]) / 86400)]).sort((a, b) => b[1] - a[1]),
  };
}

async function durum(env, simdi) {
  const [tum, site, tg] = await Promise.all([stokIste(env, "/tum"), siteVerisi(env), stokIste(env, "/tg-hepsi").catch(() => ({}))]);
  const son = sonPaylasimlar((await env.KAYIT.get("kodlar", "json")) || {}, tg, (await env.KAYIT.get("sonpaylasim", "json")) || {});
  return paylasimDurumu({ tum, site, son, simdi });
}

export function fotoYokMetni(l, yeniler) {
  return [
    `📷 Fotoğrafı yok, çekilmeli — stokta olup Telegram'da hiç paylaşılmamış ve sitede fotoğrafı olmayan ${l.length} model:`,
    l.map((k) => (yeniler.includes(k) ? `🆕 ${k}` : k)).join(", "),
    "",
    "Çekilip Selin'le siteye eklenince Kemal günlük turuna kendiliğinden ekler (günde 2: sabah 1, akşam 1).",
  ].join("\n");
}

export function eskiPaylasimMetni(d) {
  const toplam = d.hic.length + d.eski.length;
  return [
    `🗂 Stokta olup ${BEKLEME_GUN}+ gündür paylaşılmayan modeller: ${toplam}`,
    `Hiç paylaşılmamış (${d.hic.length}): ${d.hic.join(", ") || "yok"}`,
    `${BEKLEME_GUN}+ gün (${d.eski.length}): ${d.eski.map(([k, g]) => `${k} (${g} g)`).join(", ") || "yok"}`,
    d.fotoYok.length ? `📷 Bunların ${d.fotoYok.length} tanesinin fotoğrafı yok (Hemra'ya bildirildi).` : null,
  ].filter((x) => x !== null).join("\n").slice(0, 3900);
}

export async function paylasimTakip(env, simdi, tg) {
  const s = saat(simdi);
  if (haftaGunu(simdi) === 0) return; // pazar mesaj yok
  const gun = gunAnahtari(simdi);
  // Pazartesi 09:30 — Patron'a haftalık liste
  if (haftaGunu(simdi) === 1 && s >= 9.5 && !(await env.KAYIT.get(`sami:paylasimHafta:${gun}`))) {
    await env.KAYIT.put(`sami:paylasimHafta:${gun}`, "1", { expirationTtl: 30 * 86400 });
    await tg(env, "sendMessage", { chat_id: murat(env), text: eskiPaylasimMetni(await durum(env, simdi)) });
    return;
  }
  // Her gün 10:30 — Hemra'ya fotoğrafı olmayanlar (sadece listeye yeni model girdiyse)
  if (s >= 10.5 && s < 20 && !(await env.KAYIT.get(`sami:fotoYokGun:${gun}`))) {
    await env.KAYIT.put(`sami:fotoYokGun:${gun}`, "1", { expirationTtl: 3 * 86400 });
    const d = await durum(env, simdi);
    const once = (await env.KAYIT.get("sami:fotoYokBildirilen", "json")) || [];
    const yeniler = d.fotoYok.filter((k) => !once.includes(k));
    if (yeniler.length) await tg(env, "sendMessage", { chat_id: sorumlu(env), text: fotoYokMetni(d.fotoYok, yeniler) });
    if (JSON.stringify(once) !== JSON.stringify(d.fotoYok)) await env.KAYIT.put("sami:fotoYokBildirilen", JSON.stringify(d.fotoYok));
  }
}
