// VENOM = MÜDÜR (9 Kasım, Patron): "Kemal bugün ne yaptı?", "herkes bugün ne yaptı?" → İŞ DEFTERİNDEN kesin cevap.
// Kayıtta yoksa "bilmiyorum" (uydurma yok). Deneme/test kayıtları sayılmaz. Dil: kısa, insan dili, teknik terim ve tablo yok.
export const BOTLAR = ["kemal", "selin", "pelin", "nora", "sami"];
const BOT_AD = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", nora: "Nora", sami: "Sami" };
const kimlikler = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
// Telegram kimliği → kişi adı (kimlikler gizli kayıtta; burada sadece eşleştirme)
export function kisiAdi(env, id) {
  const s = String(id || "");
  if (!s) return "biri";
  if (kimlikler(env.MURAT_ID).includes(s)) return "Patron";
  if (s === String(env.HEMRA_ID || "") || s === String(env.FABRIKA_SORUMLU || "")) return "Hemra";
  if (s === String(env.BR_SORUMLU || "")) return "Merdan";
  if (s === String(env.FUAT_ID || "")) return "Fuat";
  if (s === String(env.NURI_ID || "")) return "Nuri";
  return "ekip";
}
const kodListe = (l, n = 8) => { const u = [...new Set(l.filter(Boolean))]; return u.length ? `${u.slice(0, n).join(", ")}${u.length > n ? ` +${u.length - n}` : ""}` : ""; };
// satirlar: iş defteri kayıtları (deneme hariç); canli: botun canlı özeti (varsa)
export function botOzeti(env, bot, satirlar, canli = null) {
  const l = satirlar.filter((x) => x.bot === bot);
  const kart = l.filter((x) => x.tur === "kart"), is = l.filter((x) => x.tur === "is"), hata = l.filter((x) => x.tur === "hata"), mesaj = l.filter((x) => x.tur === "mesaj");
  const s = [];
  if (kart.length) {
    const kime = {}; for (const k of kart) { const a = kisiAdi(env, k.kime); kime[a] = (kime[a] || 0) + 1; }
    const kapanan = kart.filter((k) => k.durum === "bitti").length;
    s.push(`${kart.length} kart (${Object.entries(kime).map(([a, n]) => `${a} ${n}`).join(", ")}), ${kapanan} tanesi cevaplandı`);
  }
  const grup = {};
  for (const x of is) { const anah = String(x.ozet || "").replace(/\s*\(.*$/, "").replace(/:.*$/, "").slice(0, 40); (grup[anah] = grup[anah] || []).push(x.kod); }
  for (const [ne, kodlar] of Object.entries(grup).slice(0, 4)) s.push(`${ne}${kodlar.filter(Boolean).length ? `: ${kodListe(kodlar)}` : ""}${kodlar.length > 1 ? ` (${kodlar.length})` : ""}`);
  if (!kart.length && !is.length && mesaj.length) s.push(`${mesaj.length} mesaj gönderdi`);
  // bekleyen kartlar kimde
  const bekleyen = {}; for (const k of kart.filter((x) => x.durum === "bekliyor")) (bekleyen[kisiAdi(env, k.kime)] = bekleyen[kisiAdi(env, k.kime)] || []).push(k.kod);
  for (const [a, kodlar] of Object.entries(bekleyen)) s.push(`${a}'da ${kodlar.length} kart bekliyor${kodListe(kodlar) ? `: ${kodListe(kodlar)}` : ""}`);
  if (canli) s.push(...canli);
  s.push(hata.length ? `${hata.length} hata: ${String(hata.at(-1).ozet || "").slice(0, 80)}` : "hata yok");
  return s;
}
// 9 Kasım (Patron): akşam özetinde tek satır — "Bugün X onay / 10, Y geç, Z paylaşıldı." (k: Kemal canlı özeti)
export function hedefSatiri(k, bugun) {
  if (!k) return null;
  const t = k.tur && k.tur.gun === bugun ? k.tur : null;
  const z = Math.max(Number(k.bugunKanal) || 0, Number(k.bugunPaylasim) || 0);
  return `📣 Bugün ${t ? t.onay ?? (t.kararlar || {})["paylaş"] ?? 0 : 0} onay / ${(t && t.hedef) || 10}, ${t ? t.gec ?? (t.kararlar || {})["geç"] ?? 0 : 0} geç, ${z} paylaşıldı.`;
}
// Canlı özetten kısa satırlar (bot hemen cevap verir)
export function canliSatirlar(bot, c) {
  if (!c) return [];
  if (bot === "kemal" && c.tur) return [`bugünün turu: ${c.tur.soruldu} model soruldu, ${c.tur.cevaplandi} cevap${Object.keys(c.tur.kararlar || {}).length ? ` (${Object.entries(c.tur.kararlar).map(([k, n]) => `${n} ${k}`).join(", ")})` : ""}${c.tur.hedef ? ` · hedef ${c.tur.onay || 0}/${c.tur.hedef} onay${c.tur.ek ? `, ${c.tur.ek} ek öneri` : ""}` : ""}`, ...(c.kuyruk && c.kuyruk.length ? [`kuyrukta ${c.kuyruk.length}: ${kodListe(c.kuyruk)}`] : []), `bugün kanala ${c.bugunPaylasim || 0} paylaşım`];
  if (bot === "selin") return [`bugün ${c.bugunIstenen || 0} model için fotoğraf istendi`, ...(c.onayda && c.onayda.length ? [`onay bekleyen taslak: ${kodListe(c.onayda)}`] : []), ...(c.takilan && c.takilan.length ? [`gönderilemeyen ${c.takilan.length}: ${c.takilan.slice(0, 5).map((t) => `${t.kod} (${t.sebep})`).join("; ")}${c.takilan.length > 5 ? " …" : ""}`] : [])];
  if ((bot === "pelin" || bot === "nora") && c.isler) {
    const isler = c.isler.filter((x) => bot === "pelin" || /senaryo/.test(x.durum || ""));
    return isler.length ? [`${c.calisan || 0} iş çalışıyor, ${c.bekleyen || 0} onay bekliyor${isler.length ? `: ${kodListe(isler.map((x) => x.kod))}` : ""}`] : [];
  }
  if (bot === "sami" && c.fabrikaAcik) return [`fabrika takibinde ${c.fabrikaAcik.length} sipariş${c.fabrikaCevapsiz ? ` (${c.fabrikaCevapsiz} cevapsız)` : ""}`];
  return [];
}
export function botCevabi(env, bot, satirlar, canli, { gun = "bugün" } = {}) {
  const l = satirlar.filter((x) => x.bot === bot);
  if (!l.length && !(canli || []).length) return `${BOT_AD[bot]}: ${gun} için kayıt yok — bilmiyorum.`;
  return `${BOT_AD[bot]} ${gun}:\n${botOzeti(env, bot, satirlar, canli).map((x) => `• ${x}`).join("\n")}`;
}
export function herkesCevabi(env, satirlar, canlilar, { gun = "bugün" } = {}) {
  const s = [`${gun[0].toUpperCase()}${gun.slice(1)} herkes:`];
  for (const b of BOTLAR) {
    const l = satirlar.filter((x) => x.bot === b);
    const c = canlilar[b] || [];
    if (!l.length && !c.length) { s.push(`${BOT_AD[b]}: kayıt yok.`); continue; }
    s.push(`${BOT_AD[b]}: ${botOzeti(env, b, satirlar, c).slice(0, 3).join(" · ")}`);
  }
  return s.join("\n");
}
// "Kemal bugün ne yaptı?" / "herkes ne yaptı" / "Selin dün ne yaptı" → { botlar, gun }
export function botSorusu(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (!/ne\s*yapt|neler\s*yapt|ne\s*yapıyor|ne\s*durumda|rapor\s*ver|ne\s*iş\s*yapt|neler\s*oldu/.test(t)) return null;
  const gun = /\bdün\b/.test(t) ? "dün" : "bugün";
  if (/herkes|botlar|hepsi|tüm\s*bot|bütün\s*bot|ekip/.test(t)) return { botlar: BOTLAR, gun, herkes: true };
  const b = BOTLAR.filter((x) => new RegExp(`(^|[^a-zçğıöşü])${x}`).test(t));
  return b.length ? { botlar: b, gun, herkes: false } : null;
}
// Takılan kart: 3 saattir bekleyen (Hemra/Merdan'a) → kişi başı TEK hatırlatma metni
export function takilanlar(env, bekleyen, simdi) {
  const kisi = {};
  for (const k of bekleyen) {
    if (simdi - k.zaman < 3 * 3600 || k.hatirlatildi) continue;
    const a = kisiAdi(env, k.kime);
    if (!["Hemra", "Merdan"].includes(a)) continue;
    (kisi[a] = kisi[a] || { idler: [], kodlar: [], botlar: new Set() }).idler.push(k.id);
    kisi[a].kodlar.push(k.kod); kisi[a].botlar.add(BOT_AD[k.bot] || k.bot);
  }
  return Object.entries(kisi).map(([a, x]) => ({ kisi: a, idler: x.idler, metin: `${a}, ${[...x.botlar].join(" ve ")}'de ${x.idler.length} kart cevabınızı bekliyor${kodListe(x.kodlar) ? `: ${kodListe(x.kodlar)}` : ""}. Bakabilir misiniz?` }));
}
