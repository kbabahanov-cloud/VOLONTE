// FABRİKA EKSİK LİSTESİ (Sayım Sami, kullanıcı kararı 29 Ekim)
//  (30 Ekim kuralı) Günün ilk satışı gelince izlenir; satış listesi 10 dakika değişmezse giriş bitti sayılır ve liste
//  saat kaç olursa olsun Hemra'ya gider (sadece VOLONTE mağazası; Black Rose ayrı akış). Günde tek liste; sonradan yeni
//  model satılırsa sadece yeni modeller "ek" olarak sorulur. Satış yoksa liste gitmez. o gün satılan modeller (belge tipi 21,
//  köprü sadece okur): kod, bugün satılan, stokta kalan → Hemra'ya.
//          "Fabrikaya ne isteyelim? Renkleriyle yazın" (daha önce yazılan renkler hazır sorulur).
//  Hemra yazar → Sami düzgün listeye çevirir → ✅ Onayla / ✏️ Düzelt.
//  Onay → fabrikadaki kişilere (Murat'ın onayladığı Nuri, Sinem, Fuat) SADECE kod, renk, adet; Murat'a bilgi kopyası.
//  Liste gidişinden 1 saat sonra onay yoksa Hemra'ya hatırlatma; 2 saat sonra hâlâ yoksa Murat'a "Hemra onaylamadı".
//  Fabrika kişileri /start yazınca Murat'a sorulur; eklenen kişi sadece listeyi alır, başka komut kullanamaz.
//  Satış verisi "sami:satisAcik" = "1" olana kadar kullanılmaz (köprünün satış okuması denemeyle doğrulanınca açılır).

import { stokIste } from "./stokbot.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const gunGoster = (g) => g.split("-").reverse().join(".");
const SABIT_SN = 600; // satış listesi 10 dakika değişmezse giriş bitti sayılır
const HATIRLATMA_SN = 3600; // Hemra'ya: listenin gidişinden 1 saat sonra
const MURAT_HABER_SN = 7200; // Murat'a: 2 saat sonra
const MAGAZA = "VOLONTE"; // bu akış sadece VOLONTE satışları (Hemra); Black Rose ayrı (Merdan)
const satislarAl = (env, gun) => stokIste(env, "/satislar", { gun, magaza: MAGAZA });
const COK_SATAN = 10; // günde 10+ satan: "🔥 hızlı gidiyor, fazla iste" (sadece Hemra ve Murat görür, fabrikaya gitmez)
const LISTE_PARCA = 20; // Hemra'ya bir çalışmada en fazla model mesajı (Cloudflare istek sınırı)
const GONDERIM_PARCA = 4; // fabrikaya bir çalışmada en fazla model
const TESLIM_GUNLERI = [1, 2, 3, 5, 7, 10];
const renkYazi = (renkler) => renkler.map((r) => `${r.renk} ${r.adet}`).join(", ");
const gunBasi = (g) => Date.UTC(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10))) / 1000 - SAAT_FARKI;
const pazartesi = (t) => gunAnahtari(t - ((new Date((t + SAAT_FARKI) * 1000).getUTCDay() + 6) % 7) * 86400);
async function siteListesi(env) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_REPO || "kbabahanov-cloud/VOLONTE"}/main/veri/urunler.json`, { cf: { cacheTtl: 60 } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
const sitedenFoto = (env, site, kod) => {
  const u = site.find((x) => String(x.kod) === String(kod));
  return u && u.fotolar && u.fotolar.length ? `https://raw.githubusercontent.com/${env.GITHUB_REPO || "kbabahanov-cloud/VOLONTE"}/main/${u.fotolar[0]}` : null;
};
async function kuyrukEkle(env, tur, anahtar) {
  const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
  if (!k[tur].includes(anahtar)) k[tur].push(anahtar);
  await ayarYaz(env, "fabrika:kuyruk", k);
}

export const sorumlu = (env) => String(env.FABRIKA_SORUMLU || "6448681578");
export const murat = (env) => String(env.MURAT_ID || "2005113508");

async function ayarOku(env, k, bos) {
  const v = (await stokIste(env, "/ayar-oku", { k })).v;
  return v == null ? bos : JSON.parse(v);
}
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });

// Kişiler: grup "fabrika" (Nuri, Sinem, Fuat) ya da "celal" (Celal; sadece kendi modelleri). Eski kayıtlar = fabrika.
const tumKisiler = async (env) => (await env.KAYIT.get("sami:fabrikaKisiler", "json")) || [];
export const kisiGrubu = (k) => k.grup || "fabrika";
export const fabrikaKisileri = async (env, grup = "fabrika") => (await tumKisiler(env)).filter((k) => kisiGrubu(k) === grup);
export const kisiKaydi = async (env, id) => (await tumKisiler(env)).find((k) => String(k.id) === String(id)) || null;
export const fabrikaKisisiMi = async (env, id) => Boolean(await kisiKaydi(env, id));
export const GRUP_AD = { fabrika: "🏭 Fabrika (Nuri/Sinem/Fuat)", celal: "👤 Celal" };
const grupOf = (t) => (t && t.tedarikci === "CELAL" ? "celal" : "fabrika");
// Liste satırlarını gruba göre başlıklar altında yazar
function grupluYaz(liste, gruplar, satirYaz) {
  const sonuc = [];
  for (const g of ["fabrika", "celal"]) {
    const l = liste.filter((x) => (gruplar[x.kod] || "fabrika") === g);
    if (l.length) sonuc.push(`${GRUP_AD[g]}:`, ...l.map(satirYaz), "");
  }
  return sonuc.join("\n").trim();
}

// "3183 siyah 10 bej 6, 3186 kırmızı 5" → [{ kod, renkler: [{ renk, adet }] }]
export function listeCoz(metin) {
  const sonuc = [];
  // Model kodu 4-6 hane, adet 1-3 hane (kod ile adet karışmasın)
  const parcalar = String(metin || "").replace(/[,;]+/g, " ").split(/(?=\b\d{4,6}\b)/);
  for (const p of parcalar) {
    const m = p.trim().match(/^(\d{4,6})\b(.*)$/s);
    if (!m) continue;
    const renkler = [];
    for (const r of m[2].matchAll(/([a-zçğıöşüâîû][a-zçğıöşüâîû\s-]*?)\s*[:=x×]?\s*(\d{1,3})\b/gi)) {
      const renk = r[1].trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
      const adet = Number(r[2]);
      if (renk && adet > 0) renkler.push({ renk, adet });
    }
    if (renkler.length) {
      const var_ = sonuc.find((x) => x.kod === m[1]);
      if (var_) var_.renkler.push(...renkler); else sonuc.push({ kod: m[1], renkler });
    }
  }
  return sonuc;
}

export const listeYaz = (liste) => liste.map((x) => `${x.kod} — ${x.renkler.map((r) => `${r.renk} ${r.adet}`).join(", ")}`).join("\n");

// Günün satış listesi Hemra'ya (otomatik ya da /eksik). Aynı gün bir kez. Önce kısa özet, sonra her model ayrı mesaj
// (sitedeki fotoğraf + kod + satılan + stok; stok 0 → 🔴; fotoğraf yoksa "📷 fotoğraf yok"; 10+ satan → 🔥), altında
// [🔁 Önceki gibi iste] (önceki istek varsa) ve [⏭ Bu sefer isteme]. Hemra renkleri yazar ya da düğmeye basar; bütün modeller
// karara bağlanınca onay kartı gelir. Model mesajları parça parça gider (çalışma başına 20).
async function listeyiGonder(env, gun, satislar, simdi, tg, kim = null, { anahtar = gun, ek = false, onceki = {} } = {}) {
  const modeller = satislar.map((x) => ({ kod: x.kod, satilan: x.satilan, kalan: x.kalan, grup: grupOf(x), ikiKart: Boolean(x.ikiKart) }));
  const toplam = modeller.reduce((t, x) => t + (Number(x.satilan) || 0), 0);
  const metin = [
    `🏭 ${gunGoster(gun)} — ${ek ? "EK: listeden sonra satılan yeni modeller" : "bugün satılan modeller"}: ${modeller.length} model, toplam ${toplam} adet${kim ? ` · ${kim} istedi` : ""}.`,
    "Her model aşağıda ayrı mesajla. Renkleriyle yazın (örnek: 3183 siyah 10 bej 6) ya da modelin altındaki düğmeye basın. Hepsi bitince onay kartı gelir.",
  ].join("\n");
  await tg(env, "sendMessage", { chat_id: sorumlu(env), text: metin });
  await ayarYaz(env, `fabrika:${anahtar}`, { ...onceki, asama: "soruldu", zaman: simdi, modeller, secim: {}, mesajlar: {}, gonderilmedi: modeller.map((x) => x.kod), ...(ek ? { ek: true, gun } : { bilinen: satislar.map((x) => x.kod) }) });
  await kuyrukEkle(env, "liste", anahtar);
  return modelParcasi(env, anahtar, tg);
}

function modelYazisi(x, oncekiIstek, eskiRenk, fotoVar) {
  const kalan = x.kalan == null ? null : Math.max(0, x.kalan);
  return [
    `${x.kod} · satılan ${x.satilan} · stok ${kalan == null ? "—" : kalan}${kalan === 0 ? " 🔴" : ""}`,
    x.grup === "celal" ? "👤 Celal'in modeli" : null,
    x.ikiKart ? "⚠️ iki kartı var" : null,
    Number(x.satilan) >= COK_SATAN ? "🔥 hızlı gidiyor, fazla iste" : null,
    oncekiIstek ? `Son istenen: ${renkYazi(oncekiIstek)}` : eskiRenk && eskiRenk.length ? `Daha önce istenen renkler: ${eskiRenk.join(", ")}` : null,
    fotoVar ? null : "📷 fotoğraf yok",
  ].filter(Boolean).join("\n");
}
const modelKlavye = (anahtar, kod, oncekiVar) => ({ inline_keyboard: [[
  ...(oncekiVar ? [{ text: "🔁 Önceki gibi iste", callback_data: `fe:o:${anahtar}:${kod}` }] : []),
  { text: "⏭ Bu sefer isteme", callback_data: `fe:x:${anahtar}:${kod}` },
]] });

async function modelParcasi(env, anahtar, tg) {
  const d = await ayarOku(env, `fabrika:${anahtar}`, null);
  if (!d || !(d.gonderilmedi || []).length) {
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    if (k.liste.includes(anahtar)) { k.liste = k.liste.filter((x) => x !== anahtar); await ayarYaz(env, "fabrika:kuyruk", k); }
    return;
  }
  const site = await siteListesi(env);
  const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
  const eskiRenkler = await ayarOku(env, "fabrika:renkler", {});
  const parca = d.gonderilmedi.slice(0, LISTE_PARCA);
  for (const kod of parca) {
    const x = d.modeller.find((m) => m.kod === kod);
    const foto = sitedenFoto(env, site, kod);
    const yazi = modelYazisi(x, sonIstek[kod], eskiRenkler[kod], Boolean(foto));
    const kl = modelKlavye(anahtar, kod, Boolean(sonIstek[kod]));
    let r = foto ? await tg(env, "sendPhoto", { chat_id: sorumlu(env), photo: foto, caption: yazi, reply_markup: kl }) : null;
    let tur = "foto";
    if (!r || !r.ok) { tur = "metin"; r = await tg(env, "sendMessage", { chat_id: sorumlu(env), text: foto ? yazi + "\n📷 fotoğraf gönderilemedi" : yazi, reply_markup: kl }); }
    if (r && r.ok) d.mesajlar[kod] = [r.result.message_id, tur, yazi];
  }
  // Gönderirken Hemra düğmeye basmış olabilir: güncel kaydı okuyup sadece mesajları ve kalanı yaz.
  const guncel = (await ayarOku(env, `fabrika:${anahtar}`, null)) || d;
  guncel.mesajlar = { ...(guncel.mesajlar || {}), ...d.mesajlar };
  guncel.gonderilmedi = (guncel.gonderilmedi || []).filter((k) => !parca.includes(k));
  await ayarYaz(env, `fabrika:${anahtar}`, guncel);
  if (!guncel.gonderilmedi.length) {
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    k.liste = k.liste.filter((x) => x !== anahtar);
    await ayarYaz(env, "fabrika:kuyruk", k);
  }
}

// Bir modelin kararı (yazıyla renkler / önceki gibi / isteme). Hepsi karara bağlanınca onay kartı.
async function secimUygula(env, tg, anahtar, d, kararlar, kaynak) {
  for (const [kod, secim] of Object.entries(kararlar)) {
    d.secim[kod] = secim;
    const m = d.mesajlar && d.mesajlar[kod];
    if (m) {
      const durum = secim.isteme ? "⏭ Bu sefer istenmeyecek" : `✓ İstenecek: ${renkYazi(secim.renkler)}`;
      const [mesaj, tur, yazi] = m;
      const sonIstekVar = Boolean((await ayarOku(env, "fabrika:sonIstek", {}))[kod]);
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: sorumlu(env), message_id: mesaj, [tur === "foto" ? "caption" : "text"]: `${yazi}\n\n${durum}`, reply_markup: modelKlavye(anahtar, kod, sonIstekVar) });
    }
  }
  const kalan = d.modeller.filter((x) => !d.secim[x.kod]).map((x) => x.kod);
  if (!kalan.length) return kartGonder(env, tg, anahtar, d);
  await ayarYaz(env, `fabrika:${anahtar}`, d);
  if (kaynak === "metin") await tg(env, "sendMessage", { chat_id: sorumlu(env), text: `✓ ${Object.entries(kararlar).map(([k, x]) => `${k}: ${x.isteme ? "istenmeyecek" : renkYazi(x.renkler)}`).join(" · ")}\nKalan (${kalan.length}): ${kalan.join(", ")}` });
}

async function kartGonder(env, tg, anahtar, d) {
  const gun = d.gun || anahtar.slice(0, 10);
  d.liste = d.modeller.filter((x) => d.secim[x.kod] && !d.secim[x.kod].isteme).map((x) => ({ kod: x.kod, renkler: d.secim[x.kod].renkler }));
  d.gruplar = Object.fromEntries(d.modeller.map((x) => [x.kod, x.grup || "fabrika"]));
  d.istenmeyen = d.modeller.filter((x) => d.secim[x.kod] && d.secim[x.kod].isteme).map((x) => x.kod);
  d.asama = "onayda";
  await ayarYaz(env, `fabrika:${anahtar}`, d);
  const govde = d.liste.length ? grupluYaz(d.liste, d.gruplar, (x) => listeYaz([x])) : "Fabrikaya bir şey istenmeyecek.";
  return tg(env, "sendMessage", {
    chat_id: sorumlu(env),
    text: `📋 Gidecek liste (${gunGoster(gun)}${d.ek ? ", ek" : ""}):\n${govde}${d.istenmeyen.length ? `\n\n⏭ Bu sefer istenmeyen: ${d.istenmeyen.join(", ")}` : ""}\n\nGönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: d.liste.length ? "✅ Onayla" : "✅ Tamam", callback_data: `fb:o:${anahtar}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${anahtar}` }]] },
  });
}

// Kuyruk: Hemra'ya model mesajları ve fabrikaya gönderim parça parça (her çalışmada biri).
async function kuyrukAdimi(env, simdi, tg) {
  const k = await ayarOku(env, "fabrika:kuyruk", null);
  if (!k) return false;
  if (k.liste.length) { await modelParcasi(env, k.liste[0], tg); return true; }
  if (k.gonderim.length) { await gonderimParcasi(env, k.gonderim[0], tg, simdi); return true; }
  return false;
}

// Satış girişi izlenir: ilk satış gelince başlar, liste 10 dakika değişmezse (giriş bitti) Hemra'ya gider — saat şartı yok.
// Liste gittikten sonra yeni model satılırsa (yine 10 dk sabit kalınca) sadece yeni modeller "ek" olarak sorulur.
// Hatırlatmalar her listenin gidişine göre: Hemra'ya 1 saat, Murat'a 2 saat sonra.
export async function fabrikaAdimi(env, simdi, tg) {
  if (await kuyrukAdimi(env, simdi, tg)) return; // önce yarım kalan gönderimler
  if ((await env.KAYIT.get("sami:satisAcik")) !== "1") return; // satış okuması henüz doğrulanmadı
  const gun = gunAnahtari(simdi);
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  const satislar = await satislarAl(env, gun);
  const iz = JSON.stringify(satislar.map((x) => [x.kod, x.satilan]));
  if (!d || ["bekliyor", "satisYok"].includes(d.asama)) {
    if (!satislar.length) return;
    if (!d || d.iz !== iz) return ayarYaz(env, `fabrika:${gun}`, { asama: "bekliyor", iz, izZaman: simdi }); // giriş sürüyor olabilir
    if (simdi - d.izZaman < SABIT_SN) return;
    return listeyiGonder(env, gun, satislar, simdi, tg);
  }
  // Ek: listede olmayan yeni modeller (bilinen yoksa eski kayıt: hepsi bilinen sayılır)
  const bilinen = new Set(d.bilinen || satislar.map((x) => x.kod));
  const yeni = satislar.filter((x) => !bilinen.has(x.kod));
  if (yeni.length) {
    if (d.ekIz !== iz) { d.ekIz = iz; d.ekIzZaman = simdi; await ayarYaz(env, `fabrika:${gun}`, d); }
    else if (simdi - d.ekIzZaman >= SABIT_SN) {
      d.ekler = [...(d.ekler || []), `${gun}-e${(d.ekler || []).length + 1}`];
      d.bilinen = [...bilinen, ...yeni.map((x) => x.kod)];
      await ayarYaz(env, `fabrika:${gun}`, d);
      await listeyiGonder(env, gun, yeni, simdi, tg, null, { anahtar: d.ekler.at(-1), ek: true });
    }
  }
  for (const anahtar of [gun, ...(d.ekler || [])]) {
    const x = anahtar === gun ? await ayarOku(env, `fabrika:${gun}`, null) : await ayarOku(env, `fabrika:${anahtar}`, null);
    if (!x || !["soruldu", "duzelt", "onayda"].includes(x.asama)) continue;
    const ad = `${gunGoster(gun)} VOLONTE eksik listesi${x.ek ? " (ek)" : ""}`;
    if (simdi - x.zaman >= HATIRLATMA_SN && !x.hatirlatildi) {
      x.hatirlatildi = true;
      await ayarYaz(env, `fabrika:${anahtar}`, x);
      await tg(env, "sendMessage", { chat_id: sorumlu(env), text: x.asama === "onayda" ? `⏰ ${ad} onayınızı bekliyor (✅ Onayla / ✏️ Düzelt).` : `⏰ Hatırlatma (${ad}): fabrikaya ne isteyelim? Renkleriyle yazın, örnek: 3183 siyah 10 bej 6` });
    } else if (simdi - x.zaman >= MURAT_HABER_SN && !x.muratHaber) {
      x.muratHaber = true;
      await ayarYaz(env, `fabrika:${anahtar}`, x);
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ ${ad}: Hemra onaylamadı (2 saattir bekliyor; liste fabrikaya gitmedi).` });
    }
  }
}

// /eksik (sadece Murat ve Hemra): o günün satışlarıyla liste hemen Hemra'ya. Aynı gün iki kez gitmez.
export async function eksikKomutu(env, m, tg, simdi) {
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  if (![murat(env), sorumlu(env)].includes(String(m.from.id))) return yaz("Bu komut sadece Murat ve Hemra'da.");
  if ((await env.KAYIT.get("sami:satisAcik")) !== "1") return yaz("Eksik listesi henüz kapalı.");
  const gun = gunAnahtari(simdi);
  const d = await ayarOku(env, `fabrika:${gun}`, null);
  if (d && !["bekliyor", "satisYok"].includes(d.asama)) return yaz(`Bugünün listesi ${d.zaman ? `saat ${new Date((d.zaman + SAAT_FARKI) * 1000).toISOString().slice(11, 16)}'de ` : ""}zaten gönderildi (aynı gün iki kez gitmez).`);
  const satislar = await satislarAl(env, gun);
  if (!satislar.length) return yaz("Bugün için Vegawin'de satış görünmüyor. Satışlar girildiyse köprü 5 dakika içinde gönderir; sonra tekrar /eksik yazın.");
  await listeyiGonder(env, gun, satislar, simdi, tg, [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || null);
  if (String(m.from.id) !== sorumlu(env)) return yaz(`✅ Liste Hemra'ya gönderildi (${satislar.length} model).`);
}

// Hemra'nın yazısı (liste bekleniyorsa). true dönerse mesaj işlendi.
export async function fabrikaCevabi(env, m, tg, simdi) {
  if (String(m.from.id) !== sorumlu(env)) return false;
  const metin = String(m.text || "").trim();
  if (!/^\d{4,6}\b/.test(metin)) return false;
  const gun = gunAnahtari(simdi);
  const ana = await ayarOku(env, `fabrika:${gun}`, null);
  if (!ana) return false;
  // Cevap en son gönderilen açık listeye (ana liste ya da ek) yazılır.
  let anahtar = null;
  let d = null;
  for (const k of [gun, ...(ana.ekler || [])]) {
    const x = k === gun ? ana : await ayarOku(env, `fabrika:${k}`, null);
    if (x && ["soruldu", "duzelt", "onayda"].includes(x.asama) && (!d || x.zaman >= d.zaman)) { anahtar = k; d = x; }
  }
  if (!d) return false;
  const liste = listeCoz(metin);
  if (!liste.length) {
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Anlayamadım. Örnek: 3183 siyah 10 bej 6, 3186 kırmızı 5" });
    return true;
  }
  d.yazan = m.from.first_name || "Hemra";
  d.secim = d.secim || {};
  d.modeller = d.modeller || [];
  // Listede olmayan kod yazıldıysa (ör. satılmadığı hâlde istenen) listeye eklenir.
  const yeniKodlar = liste.map((x) => x.kod).filter((k) => !d.modeller.some((x) => x.kod === k));
  if (yeniKodlar.length) {
    const ted = await stokIste(env, "/tedarikci", { kodlar: yeniKodlar });
    for (const k of yeniKodlar) d.modeller.push({ kod: k, satilan: 0, kalan: null, grup: grupOf(ted[k]), ikiKart: Boolean(ted[k] && ted[k].ikiKart), ekstra: true });
  }
  await secimUygula(env, tg, anahtar, d, Object.fromEntries(liste.map((x) => [x.kod, { renkler: x.renkler }])), "metin");
  return true;
}

// Düğmeler: fb:o|d:<gün> (Hemra), fa:e|h:<kişi> (Murat: fabrika kişisi ekle / ekleme)
export async function fabrikaDugmesi(env, cq, tg, simdi) {
  const [tur, islem, ek] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (tur === "fb") {
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (String(cq.from.id) !== sorumlu(env) && !(d && d.deneme && String(cq.from.id) === murat(env))) return cevapla("Bu onay Hemra'da.");
    if (!d || d.asama !== "onayda") return cevapla(d && d.asama === "gonderildi" ? "Zaten gönderildi." : "Bu liste artık geçerli değil.");
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "d" && d.deneme) {
      await denemeKaydi(env, ek, `Hemra onay kartı: "Düzelt"e basıldı (${kisiAd(cq.from)})`);
      return cevapla("Deneme: düzelt adımı çalıştı; onaylamak için ✅ Onayla");
    }
    if (islem === "d") {
      d.asama = "duzelt";
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla("Düzeltin");
      return tg(env, "editMessageText", { ...benim, text: `✏️ Değiştirmek istediğiniz modeli yeniden yazın (örnek: 3183 siyah 10 bej 6) ya da model mesajındaki düğmeye basın; onay kartı yeniden gelir.\n\nŞu anki:\n${listeYaz(d.liste) || "—"}` });
    }
    if (!d.deneme) {
      // Gerçek liste: renk hafızası + Murat'a kopya hemen; fabrikaya gönderim parça parça (istek sınırı).
      Object.assign(d, { asama: "gonderildi", onayZaman: simdi, onaylayan: kisiAd(cq.from), gonderilecek: d.liste.map((x) => x.kod) });
      await ayarYaz(env, `fabrika:${ek}`, d);
      await cevapla(d.liste.length ? "Gönderiliyor" : "Tamam");
      const sonIstek = await ayarOku(env, "fabrika:sonIstek", {});
      const renkler = await ayarOku(env, "fabrika:renkler", {});
      for (const x of d.liste) {
        sonIstek[x.kod] = x.renkler;
        renkler[x.kod] = [...new Set([...x.renkler.map((r) => r.renk), ...(renkler[x.kod] || [])])].slice(0, 8);
      }
      await ayarYaz(env, "fabrika:sonIstek", sonIstek);
      await ayarYaz(env, "fabrika:renkler", renkler);
      const cok = new Set((d.modeller || []).filter((x) => Number(x.satilan) >= COK_SATAN).map((x) => x.kod));
      const satir = (x) => `${x.kod} — ${renkYazi(x.renkler)}${cok.has(x.kod) ? " 🔥" : ""}`;
      await tg(env, "editMessageText", { ...benim, text: d.liste.length ? `✅ Onaylandı — fabrikaya gönderiliyor (${d.liste.length} model):\n${d.liste.map(satir).join("\n")}` : "✅ Bu listeden fabrikaya bir şey istenmedi." });
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ ${gunGoster(d.gun || ek.slice(0, 10))} VOLONTE eksik listesi${d.ek ? " (ek)" : ""} — onaylayan: ${kisiAd(cq.from)}\n\n${d.liste.length ? d.liste.map(satir).join("\n") : "Fabrikaya bir şey istenmedi."}${d.istenmeyen && d.istenmeyen.length ? `\n⏭ İstenmeyen: ${d.istenmeyen.join(", ")}` : ""}${cok.size ? "\n\n🔥 = günde 10+ satan (hızlı gidiyor)" : ""}` });
      if (!d.liste.length) return;
      await kuyrukEkle(env, "gonderim", ek);
      return gonderimParcasi(env, ek, tg, simdi);
    }
    // Fabrikaya her model AYRI mesaj: fotoğraf + kod/renk/seri (fiyat, maliyet, kâr, satış, stok YOK)
    Object.assign(d, { asama: "gonderildi", onayZaman: simdi });
    await ayarYaz(env, `fabrika:${ek}`, d);
    await cevapla("Gönderiliyor");
    let giden = 0;
    let kisiSayisi = 0;
    for (const x of d.liste) {
      const grup = (d.gruplar && d.gruplar[x.kod]) || "fabrika";
      const rec = await siparisAc(env, { kod: x.kod, renkler: x.renkler, liste: ek, deneme: Boolean(d.deneme), fotoKod: d.deneme ? "3183" : x.kod, grup }, simdi);
      const r = await fabrikayaGonder(env, rec, tg);
      giden += r.giden;
      kisiSayisi = r.kisi;
    }
    if (d.deneme) await denemeKaydi(env, ek, `Hemra onayladı (${kisiAd(cq.from)}) → fabrikaya ${giden} mesaj gitti`);
    else {
      const renkler = await ayarOku(env, "fabrika:renkler", {});
      for (const x of d.liste) renkler[x.kod] = [...new Set([...x.renkler.map((r) => r.renk), ...(renkler[x.kod] || [])])].slice(0, 8);
      await ayarYaz(env, "fabrika:renkler", renkler);
    }
    await tg(env, "editMessageText", { ...benim, text: `${d.deneme ? DENEME : ""}✅ Fabrikaya gönderildi (${d.liste.length} model, ${kisiSayisi} kişi):\n${listeYaz(d.liste)}` });
    if (!d.deneme) await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fabrikaya giden eksik listesi (onaylayan: ${kisiAd(cq.from)}, ${kisiSayisi} kişi):\n\n${listeYaz(d.liste)}` });
    return;
  }
  if (tur === "fe") { // Hemra: 🔁 Önceki gibi iste / ⏭ Bu sefer isteme — fe:<o|x>:<liste>:<kod>
    const kod = String(cq.data).split(":")[3];
    if (String(cq.from.id) !== sorumlu(env)) return cevapla("Bu seçim Hemra'da.");
    const d = await ayarOku(env, `fabrika:${ek}`, null);
    if (!d || !["soruldu", "duzelt", "onayda"].includes(d.asama) || !(d.modeller || []).some((x) => x.kod === kod)) return cevapla("Bu liste artık geçerli değil.");
    let secim;
    if (islem === "o") {
      const onceki = (await ayarOku(env, "fabrika:sonIstek", {}))[kod];
      if (!onceki) return cevapla("Önceki istek kaydı yok.");
      secim = { renkler: onceki };
    } else secim = { isteme: true };
    await cevapla(islem === "o" ? `Önceki gibi: ${renkYazi(secim.renkler)}` : "Bu sefer istenmeyecek");
    return secimUygula(env, tg, ek, d, { [kod]: secim }, "dugme");
  }
  if (tur === "fa") {
    if (String(cq.from.id) !== murat(env)) return cevapla("Bu onay Murat'ta.");
    const aday = await env.KAYIT.get(`sami:fabrikaAday:${ek}`, "json");
    if (!aday) return cevapla("Bu istek artık geçerli değil.");
    await env.KAYIT.delete(`sami:fabrikaAday:${ek}`);
    const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
    if (islem === "h") {
      await cevapla("Eklenmedi");
      return tg(env, "editMessageText", { ...benim, text: `❌ ${aday.ad} fabrika listesine eklenmedi.` });
    }
    const grup = islem === "c" ? "celal" : "fabrika";
    const kisiler = (await tumKisiler(env)).filter((k) => String(k.id) !== String(ek));
    kisiler.push({ id: Number(ek), ad: aday.ad, kullanici: aday.kullanici, grup });
    await env.KAYIT.put("sami:fabrikaKisiler", JSON.stringify(kisiler));
    await cevapla("Eklendi");
    await tg(env, "editMessageText", { ...benim, text: `✅ ${aday.ad} ${grup === "celal" ? "Celal olarak" : "fabrika listesine"} eklendi.` });
    return tg(env, "sendMessage", { chat_id: Number(ek), text: grup === "celal" ? "✅ Eklendiniz. Sizden istenecek modelleri buradan alacaksınız." : "✅ VOLONTE fabrika listesine eklendiniz. Eksik listeleri buradan alacaksınız." });
  }
  return false;
}

// Onaylanan listenin fabrikaya gönderimi: çalışma başına 4 model (Cloudflare istek sınırı); kalanı 5 dk'lık görev sürdürür.
async function gonderimParcasi(env, anahtar, tg, simdi) {
  const d = await ayarOku(env, `fabrika:${anahtar}`, null);
  const parca = d ? (d.gonderilecek || []).slice(0, GONDERIM_PARCA) : [];
  if (parca.length) {
    const site = await siteListesi(env);
    for (const kod of parca) {
      const x = d.liste.find((y) => y.kod === kod);
      if (!x) continue;
      const rec = await siparisAc(env, { kod, renkler: x.renkler, liste: anahtar, deneme: false, fotoKod: kod, grup: (d.gruplar && d.gruplar[kod]) || "fabrika" }, simdi);
      const r = await fabrikayaGonder(env, rec, tg, site);
      d.giden = (d.giden || 0) + r.giden;
    }
    d.gonderilecek = d.gonderilecek.slice(parca.length);
    await ayarYaz(env, `fabrika:${anahtar}`, d);
  }
  if (!d || !(d.gonderilecek || []).length) {
    const k = await ayarOku(env, "fabrika:kuyruk", { liste: [], gonderim: [] });
    k.gonderim = k.gonderim.filter((x) => x !== anahtar);
    await ayarYaz(env, "fabrika:kuyruk", k);
    if (d && d.liste && d.liste.length) await tg(env, "sendMessage", { chat_id: sorumlu(env), text: `✅ ${gunGoster(d.gun || anahtar.slice(0, 10))} listesi fabrikaya gönderildi (${d.liste.length} model, ${d.giden || 0} mesaj).` });
  }
}

// Yetkisiz kişi yazınca: fabrika kişisiyse kısa cevap; değilse /start ile Murat'a sorulur (bir kez).
export async function yabanciMesaji(env, m, tg) {
  if (await fabrikaKisisiMi(env, m.from.id)) {
    if (await repeteMetni(env, m, tg, Math.floor(Date.now() / 1000))) return;
    const celalMi = kisiGrubu(await kisiKaydi(env, m.from.id)) === "celal";
    return tg(env, "sendMessage", { chat_id: m.chat.id, text: `Bu bot size sadece ${celalMi ? "sizden istenen modellerin listesini" : "VOLONTE fabrika eksik listesini"} gönderir. Repete gelince: "3394 geldi" ya da "3394 repete geldi siyah 10 bej 6" yazabilirsiniz.` });
  }
  if (!/^\/start\b/i.test(String(m.text || "").trim())) return;
  if (await env.KAYIT.get(`sami:fabrikaAday:${m.from.id}`)) return;
  const ad = [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username || String(m.from.id);
  await env.KAYIT.put(`sami:fabrikaAday:${m.from.id}`, JSON.stringify({ ad, kullanici: m.from.username || null }), { expirationTtl: 30 * 86400 });
  await tg(env, "sendMessage", {
    chat_id: murat(env),
    text: `🏭 ${ad}${m.from.username ? ` (@${m.from.username})` : ""} Sami'ye /start yazdı. Kim olarak eklensin?`,
    reply_markup: { inline_keyboard: [[{ text: "🏭 Fabrikaya ekle", callback_data: `fa:e:${m.from.id}` }, { text: "👤 Celal olarak ekle", callback_data: `fa:c:${m.from.id}` }], [{ text: "❌ Ekleme", callback_data: `fa:h:${m.from.id}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Merhaba! İsteğiniz yöneticiye iletildi; onaylanınca eksik listelerini buradan alacaksınız." });
}

// ---------- Model başına fabrika siparişi (kullanıcı kararı 29 Ekim) ----------
// Kayıtlar Sami'nin deposunda: "fs:<id>" (açıklar listesi "fs:acik"). Deneme kayıtları "D…" ile başlar, gerçek
// listeye karışmaz; denemede kanal paylaşımı ve silme YAPILMAZ.
export const DENEME = "🧪 DENEME – üretim yapmayın\n";
const SURELER = { 3: "2-3 gün", 5: "5 gün", 7: "1 hafta", 10: "10 gün" };
const kisiAd = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || String(f.id);
const bildirilecekler = (env) => [...new Set([murat(env), sorumlu(env)])];
const renkSeri = (renkler) => renkler.map((r) => `${r.renk} ${r.adet} seri`).join(", ");

export async function denemeKaydi(env, did, adim) {
  const k = (await env.KAYIT.get(`venom:deneme:${did}`, "json")) || { basla: Math.floor(Date.now() / 1000), adimlar: [] };
  k.adimlar.push({ adim, zaman: Math.floor(Date.now() / 1000) });
  await env.KAYIT.put(`venom:deneme:${did}`, JSON.stringify(k), { expirationTtl: 14 * 86400 });
}
export async function denemeOzeti(env, did, tg, sebep = "bitti") {
  const k = await env.KAYIT.get(`venom:deneme:${did}`, "json");
  if (!k || k.ozet) return;
  k.ozet = true;
  await env.KAYIT.put(`venom:deneme:${did}`, JSON.stringify(k), { expirationTtl: 14 * 86400 });
  const adimlar = ["Hemra onayı", "fabrikaya mesaj", "fabrika cevabı", "repete süresi", "repete geldi", "Kemal paylaşım onayı"];
  const metin = k.adimlar.map((a, i) => `${i + 1}) ${a.adim}`).join("\n");
  const eksik = adimlar.filter((a) => !k.adimlar.some((x) => x.adim.toLowerCase().includes(a.split(" ")[0].toLowerCase())));
  await tg(env, "sendMessage", { chat_id: murat(env), text: `🧪 Fabrika denemesi ${sebep === "sure" ? "48 saatte bitmedi, yarım haliyle kapatıldı" : "bitti"}:\n\n${metin || "(adım yok)"}${eksik.length ? `\n\nÇalışmayan / basılmayan: ${eksik.join(", ")}` : "\n\n✅ Bütün adımlar çalıştı."}\n\nKanalda hiçbir şey paylaşılmadı, hiçbir şey silinmedi.` });
}

const siparisOku = (env, id) => ayarOku(env, `fs:${id}`, null);
// Sıradaki zamanlı iş (hatırlatma / teslim günü / beklesin): "fs:takip" dizini — görev sadece zamanı gelenleri okur.
export function takipZamani(rec) {
  const l = [];
  if (rec.durum === "bekliyor" && !rec.hatirlatildi) l.push(rec.gonderim + 86400);
  if (rec.durum === "repete" && rec.hazirZaman && !rec.hazirSoruldu) l.push(rec.hazirZaman);
  if (["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && !rec.teslimHatirlatildi) l.push(gunBasi(rec.hazirGun) + 10 * 3600);
  if (rec.durum === "bitti" && rec.karar === "beklesin" && !rec.tekrarSoruldu && rec.beklesinZaman) l.push(rec.beklesinZaman);
  return l.length ? Math.min(...l) : null;
}
// Tek çağrıda: kayıt + açıklar + takip dizini + haftalık özet (Cloudflare istek sınırı).
async function siparisYaz(env, rec) {
  const ozet = { kod: rec.kod, renkler: rec.renkler, grup: rec.grup, tur: rec.tur, durum: rec.durum, gonderim: rec.gonderim, cevaplayan: rec.cevaplayan || null, hazirGun: rec.hazirGun || null, geldi: rec.geldiZaman || null };
  await stokIste(env, "/fs-yaz", { rec, kapali: ["geldi", "kapandi"].includes(rec.durum), takip: takipZamani(rec), hafta: rec.deneme ? null : pazartesi(rec.gonderim), ozet });
}
async function siparisAc(env, { kod, renkler, liste, deneme, fotoKod, tur = "eksik", grup = "fabrika" }, simdi) {
  const id = `${deneme ? "D" : ""}${kod}-${simdi.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const rec = { id, kod, renkler, liste, deneme, fotoKod, tur, grup, durum: "bekliyor", gonderim: simdi, mesajlar: [], log: [] };
  await siparisYaz(env, rec);
  return rec;
}

// Fotoğraf: önce sitedeki (doğruluğu kesin), yoksa Kemal'in kataloğundaki en yeni kanal paylaşımı.
async function fotoBul(env, kod, site = null) {
  const url = sitedenFoto(env, site || (await siteListesi(env)), kod);
  if (url) return { tur: "site", url };
  const kanal = await env.KAYIT.get("kanal", "json");
  const gruplar = ((await env.KAYIT.get("kodlar", "json")) || {})[kod] || [];
  const en = [...gruplar].sort((a, b) => b.tarih - a.tarih)[0];
  const id = en && en.ids.find((x) => x > 0);
  return kanal && id ? { tur: "kanal", kanal: kanal.id, id } : null;
}

// Celal'e giden mesajda "VOLONTE" yazmaz (kullanıcı kararı)
// Fabrikaya/Celal'e: "3183 · siyah 10 · bej 6" — stok, satış, fiyat, maliyet ASLA yok (kullanıcı kararı 30 Ekim).
const siparisMetni = (rec) => `${rec.deneme ? DENEME : ""}${rec.tur === "repete" ? "🔁 Repete isteği\n" : ""}${rec.kod}${rec.deneme ? (rec.grup === "celal" ? " CELAL DENEME" : " DENEME") : ""} · ${rec.renkler.map((r) => `${r.renk} ${r.adet}`).join(" · ")}`;
function klavye(rec) {
  const satir = [];
  if (["bekliyor"].includes(rec.durum)) satir.push([{ text: "✅ Gelecek", callback_data: `fc:g:${rec.id}` }], [{ text: "🔁 Repete olacak", callback_data: `fc:r:${rec.id}` }], [{ text: "❌ Bitti, gelmeyecek", callback_data: `fc:b:${rec.id}` }]);
  if (["repete", "gelecek"].includes(rec.durum)) satir.push([{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]);
  if ((rec.kanalFoto || rec.deneme) && !["geldi", "kapandi"].includes(rec.durum)) satir.push([{ text: "⚠️ Fotoğraf yanlış model", callback_data: `fc:y:${rec.id}` }]);
  return { inline_keyboard: satir };
}

async function fabrikayaGonder(env, rec, tg, site = null) {
  let kisiler = await fabrikaKisileri(env, rec.grup || "fabrika"); // Celal modelleri sadece Celal'e, diğerleri sadece fabrikaya
  if (rec.deneme && !kisiler.length) kisiler = [{ id: Number(murat(env)), ad: `Murat (${rec.grup === "celal" ? "Celal" : "fabrika kişisi"} yok)` }];
  const foto = await fotoBul(env, rec.fotoKod || rec.kod, site);
  rec.kanalFoto = Boolean(foto && foto.tur === "kanal");
  const metin = siparisMetni(rec);
  let giden = 0;
  for (const k of kisiler) {
    let r = null;
    let tur = "foto";
    if (foto && foto.tur === "site") r = await tg(env, "sendPhoto", { chat_id: k.id, photo: foto.url, caption: metin, reply_markup: klavye(rec) });
    else if (foto) r = await tg(env, "copyMessage", { chat_id: k.id, from_chat_id: foto.kanal, message_id: foto.id, caption: metin, reply_markup: klavye(rec) }); // kanal yazısı (fiyat vb.) GİTMEZ: yazı değiştirilir
    if (!r || !r.ok) { tur = "metin"; r = await tg(env, "sendMessage", { chat_id: k.id, text: metin, reply_markup: klavye(rec) }); }
    if (r && r.ok) { giden++; rec.mesajlar.push([k.id, r.result.message_id, tur]); }
  }
  await siparisYaz(env, rec);
  return { giden, kisi: kisiler.length };
}

async function mesajlariGuncelle(env, rec, ek, tg) {
  const metin = `${siparisMetni(rec)}${ek ? `\n\n${ek}` : ""}`;
  for (const [chat, mesaj, tur] of rec.mesajlar) {
    await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: klavye(rec) });
  }
}
async function bildir(env, rec, metin, tg, ekstra = {}) {
  const sonuc = [];
  for (const k of bildirilecekler(env)) {
    const r = await tg(env, "sendMessage", { chat_id: k, text: `${rec.deneme ? DENEME : ""}${metin}`, ...ekstra });
    if (r && r.ok) sonuc.push([k, r.result.message_id]);
  }
  return sonuc;
}
const kararKlavye = (id) => ({ inline_keyboard: [[{ text: "🔁 Repete ver", callback_data: `fk:r:${id}` }, { text: "🗑️ Sil", callback_data: `fk:s:${id}` }, { text: "⏳ Beklesin", callback_data: `fk:b:${id}` }]] });

async function repeteGeldi(env, rec, kim, renkler, tg, simdi) {
  rec.durum = "geldi";
  Object.assign(rec, { geldiZaman: simdi, bildiren: kim, gelenRenkler: renkler && renkler.length ? renkler : rec.renkler });
  rec.log.push(`📦 Repete geldi (${kim})`);
  await siparisYaz(env, rec);
  await mesajlariGuncelle(env, rec, `📦 Repete geldi (${kim} bildirdi)`, tg);
  await bildir(env, rec, `📦 ${rec.kod} repete geldi – ${renkSeri(rec.gelenRenkler).replace(/ seri/g, "")} (${kim} bildirdi)`, tg);
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Repete geldi bildirildi (${kim})`);
  // Kemal'e haber: paylaşımı hazırlayıp Murat'a ve Hemra'ya onaya gönderir (denemede kanalda PAYLAŞMAZ)
  const sira = (await env.KAYIT.get("venom:repetePaylas", "json")) || [];
  sira.push({ id: rec.id, kod: rec.kod, renkler: rec.gelenRenkler, bildiren: kim, deneme: rec.deneme, liste: rec.liste, zaman: simdi });
  await env.KAYIT.put("venom:repetePaylas", JSON.stringify(sira.slice(-50)));
}

// Fabrika düğmeleri: fc:<g|r|s|b|y|k|e|h>:<id>[:ek]  (fabrika kişileri + ekip)
export async function siparisDugmesi(env, cq, tg, simdi, yetkili) {
  const [, islem, id, ek] = String(cq.data || "").split(":");
  const cevapla = (text, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  if (!yetkili) return cevapla("Yetkiniz yok.");
  const rec = await siparisOku(env, id);
  if (!rec) return cevapla("Bu kayıt artık geçerli değil.");
  const kisi = await kisiKaydi(env, cq.from.id);
  if (kisi && kisiGrubu(kisi) !== (rec.grup || "fabrika") && !bildirilecekler(env).includes(String(cq.from.id))) return cevapla("Bu model size ait değil.");
  const kim = kisiAd(cq.from);
  const benim = cq.message ? { chat_id: cq.message.chat.id, message_id: cq.message.message_id } : null;
  if (islem === "y") {
    rec.fotoYanlis = [...new Set([...(rec.fotoYanlis || []), kim])];
    await siparisYaz(env, rec);
    await bildir(env, rec, `⚠️ ${rec.kod} fotoğrafı yanlış dendi (${kim}).`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `"Fotoğraf yanlış model" basıldı (${kim})`);
    return cevapla("İletildi, teşekkürler");
  }
  if (islem === "k") {
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    if (!["repete", "gelecek", "bekliyor"].includes(rec.durum)) return cevapla("Bu model için repete beklenmiyor.");
    await cevapla("Bildirildi");
    return repeteGeldi(env, rec, kim, null, tg, simdi);
  }
  if (islem === "e" || islem === "h") { // yazıyla bildirimin onayı
    const b = rec.metinBildirim;
    if (!b || String(b.kimId) !== String(cq.from.id)) return cevapla("Bu onay size ait değil.");
    delete rec.metinBildirim;
    await siparisYaz(env, rec);
    if (islem === "h") { await cevapla("Vazgeçildi"); return benim && tg(env, "editMessageText", { ...benim, text: `↩️ ${rec.kod}: bildirim iptal edildi.` }); }
    if (rec.durum === "geldi") return cevapla(`${rec.bildiren} zaten bildirdi.`);
    await cevapla("Bildirildi");
    if (benim) await tg(env, "editMessageText", { ...benim, text: `✅ ${rec.kod} repete geldi – bildirildi.` });
    return repeteGeldi(env, rec, kim, b.renkler, tg, simdi);
  }
  if (islem === "t") { // teslim günü (sadece "Gelecek"e basan)
    if (rec.durum !== "gelecek" || String(rec.cevaplayanId) !== String(cq.from.id)) return cevapla("Bu seçim size ait değil.");
    const gun = Number(ek);
    if (!TESLIM_GUNLERI.includes(gun)) return cevapla("Geçersiz.");
    Object.assign(rec, { teslimGun: gun, hazirGun: gunAnahtari(simdi + gun * 86400) });
    rec.log.push(`📅 ${gun} günde hazır (${kim})`);
    await siparisYaz(env, rec);
    await cevapla(`${gun} gün`);
    await mesajlariGuncelle(env, rec, `✅ ${rec.cevaplayan}: Gelecek — ${gun} günde hazır (${gunGoster(rec.hazirGun)})`, tg);
    await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → ${gun} günde hazır (${gunGoster(rec.hazirGun)})`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Teslim günü: ${gun} gün (${kim})`);
    return;
  }
  if (islem === "s") { // repete süresi (sadece "Repete olacak"a basan)
    if (rec.durum !== "sureSoruluyor" || String(rec.cevaplayanId) !== String(cq.from.id)) return cevapla("Bu seçim size ait değil.");
    const gun = Number(ek);
    Object.assign(rec, { durum: "repete", sure: gun, hazirZaman: simdi + gun * 86400, hazirGun: gunAnahtari(simdi + gun * 86400) });
    rec.log.push(`🔁 Repete, ${SURELER[gun]} (${kim})`);
    await siparisYaz(env, rec);
    await cevapla(`Repete, ${SURELER[gun]}`);
    await mesajlariGuncelle(env, rec, `🔁 ${rec.cevaplayan} cevapladı: Repete olacak — ${SURELER[gun]}`, tg);
    await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → Repete, ${SURELER[gun]}`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Repete süresi seçildi: ${SURELER[gun]} (${kim})`);
    return;
  }
  // İlk cevap (g/r/b): ilk basan geçerli
  if (rec.durum !== "bekliyor") return cevapla(`${rec.cevaplayan || "Biri"} zaten cevapladı.`);
  Object.assign(rec, { cevaplayan: kim, cevaplayanId: cq.from.id, cevapZaman: simdi });
  if (islem === "g") {
    rec.durum = "gelecek";
    rec.log.push(`✅ Gelecek (${kim})`);
    await siparisYaz(env, rec);
    await cevapla("Kaç günde hazır olur?");
    // Basan kişiye "Kaç günde hazır olur?" (gün düğmeleri); diğerlerinde sadece cevap görünür.
    for (const [chat, mesaj, tur] of rec.mesajlar) {
      const benimMi = benim && String(chat) === String(benim.chat_id) && mesaj === benim.message_id;
      const metin = `${siparisMetni(rec)}\n\n✅ ${kim} cevapladı: Gelecek${benimMi ? "\nKaç günde hazır olur?" : ""}`;
      const kl = benimMi ? { inline_keyboard: [TESLIM_GUNLERI.map((g) => ({ text: `${g} gün`, callback_data: `fc:t:${rec.id}:${g}` }))] } : klavye(rec);
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: kl });
    }
    await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → Gelecek (teslim günü soruldu)`, tg);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Gelecek (${kim})`);
    return;
  }
  if (islem === "r") {
    rec.durum = "sureSoruluyor";
    rec.log.push(`🔁 Repete olacak (${kim})`);
    await siparisYaz(env, rec);
    await cevapla("Ne zaman hazır olur?");
    for (const [chat, mesaj, tur] of rec.mesajlar) {
      const benimMi = benim && String(chat) === String(benim.chat_id) && mesaj === benim.message_id;
      const metin = `${siparisMetni(rec)}\n\n🔁 ${kim} cevapladı: Repete olacak${benimMi ? "\nNe zaman hazır olur?" : " (süre soruluyor)"}`;
      const kl = benimMi ? { inline_keyboard: [Object.entries(SURELER).map(([g, ad]) => ({ text: ad, callback_data: `fc:s:${rec.id}:${g}` }))] } : { inline_keyboard: [] };
      await tg(env, tur === "foto" ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: mesaj, [tur === "foto" ? "caption" : "text"]: metin, reply_markup: kl });
    }
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Repete olacak (${kim})`);
    return;
  }
  if (islem === "b") {
    rec.durum = "bitti";
    rec.log.push(`❌ Bitti, gelmeyecek (${kim})`);
    await cevapla("Bitti");
    await mesajlariGuncelle(env, rec, `❌ ${kim} cevapladı: Bitti, gelmeyecek`, tg);
    rec.kararMesajlari = await bildir(env, rec, `${rec.grup === "celal" ? "👤" : "🏭"} ${kim} · ${rec.kod} → Bitti, gelmeyecek\n\n${rec.kod} – fabrika bitti dedi. Ne yapalım?`, tg, { reply_markup: kararKlavye(rec.id) });
    await siparisYaz(env, rec);
    if (rec.deneme) await denemeKaydi(env, rec.liste, `Fabrika cevabı: Bitti (${kim})`);
    return;
  }
  return cevapla("Geçersiz düğme.");
}

// "Bitti" kararı (Murat / Hemra): fk:<r|s|b|S|v>:<id> — ilk basan geçerli; Sil için ikinci onay.
export async function kararDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data || "").split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!bildirilecekler(env).includes(String(cq.from.id))) return cevapla("Bu karar Murat ve Hemra'da.");
  const rec = await siparisOku(env, id);
  if (!rec || rec.durum !== "bitti") return cevapla("Bu karar artık geçerli değil.");
  if (rec.karar && rec.karar !== "beklesin") return cevapla(`${rec.kararVeren} zaten karar verdi.`);
  const kim = kisiAd(cq.from);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  const hepsiniYaz = async (metin) => { for (const [chat, mesaj] of rec.kararMesajlari || []) await tg(env, "editMessageText", { chat_id: chat, message_id: mesaj, text: `${rec.deneme ? DENEME : ""}${metin}` }); };
  if (islem === "v") { await cevapla("Vazgeçildi"); return tg(env, "editMessageText", { ...benim, text: `${rec.deneme ? DENEME : ""}${rec.kod} – fabrika bitti dedi. Ne yapalım?`, reply_markup: kararKlavye(rec.id) }); }
  if (islem === "s") {
    const ids = [...new Set((((await env.KAYIT.get("kodlar", "json")) || {})[rec.kod] || []).flatMap((g) => g.ids))].filter((x) => x > 0);
    await cevapla("Emin misiniz?");
    return tg(env, "editMessageText", { ...benim, text: `${rec.deneme ? DENEME : ""}🗑️ ${rec.kod}: kanalda ${ids.length} paylaşım silinecek, siteden de kaldırılacak. Geri alınamaz. Emin misiniz?`, reply_markup: { inline_keyboard: [[{ text: "Evet, sil", callback_data: `fk:S:${rec.id}` }, { text: "Vazgeç", callback_data: `fk:v:${rec.id}` }]] } });
  }
  Object.assign(rec, { karar: { r: "repete", S: "sil", b: "beklesin" }[islem], kararVeren: kim, kararZaman: simdi });
  if (!rec.karar) return cevapla("Geçersiz düğme.");
  if (rec.deneme) await denemeKaydi(env, rec.liste, `Bitti kararı: ${rec.karar} (${kim})`);
  if (rec.karar === "beklesin") {
    rec.beklesinZaman = simdi + 7 * 86400;
    rec.tekrarSoruldu = false;
    await siparisYaz(env, rec);
    await cevapla("Beklesin");
    return hepsiniYaz(`⏳ ${rec.kod}: ${kim} "Beklesin" dedi. 7 gün sonra yeniden sorulacak.`);
  }
  if (rec.karar === "repete") {
    rec.durum = "kapandi";
    await siparisYaz(env, rec);
    await cevapla("Repete isteği gidiyor");
    await hepsiniYaz(`🔁 ${rec.kod}: ${kim} "Repete ver" dedi. Fabrikaya repete isteği gönderildi.`);
    const yeni = await siparisAc(env, { kod: rec.kod, renkler: rec.renkler, liste: rec.liste, deneme: rec.deneme, fotoKod: rec.fotoKod, tur: "repete", grup: rec.grup }, simdi);
    return fabrikayaGonder(env, yeni, tg);
  }
  // Sil
  rec.durum = "kapandi";
  await siparisYaz(env, rec);
  await cevapla(rec.deneme ? "Deneme: silinmedi" : "Siliniyor");
  if (rec.deneme) return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi — DENEME olduğu için siteden ve kanaldan hiçbir şey silinmedi.`);
  await stokIste(env, "/gizle", { kod: rec.kod, kim, simdi });
  for (const anahtar of ["venom:kanalSil", "venom:siteSil"]) {
    const l = (await env.KAYIT.get(anahtar, "json")) || [];
    l.push({ kod: rec.kod, kim, zaman: simdi });
    await env.KAYIT.put(anahtar, JSON.stringify(l.slice(-50)));
  }
  return hepsiniYaz(`🗑️ ${rec.kod}: ${kim} "Sil" dedi. Siteden (Selin) ve Telegram kanalından (Kemal) kaldırılıyor; Kemal turlarında artık önerilmeyecek.`);
}

// Yazıyla repete bildirimi: "3394 geldi" / "3394 repete geldi siyah 10 bej 6" (fabrika kişileri + ekip)
export async function repeteMetni(env, m, tg, simdi) {
  const metin = String(m.text || "").trim();
  const r = metin.match(/^(\d{4,6})\s+(?:repete\s+)?geldi\b(.*)$/is);
  if (!r) return false;
  const kod = r[1];
  const renkler = listeCoz(`${kod} ${r[2]}`)[0]?.renkler || null;
  const acik = await ayarOku(env, "fs:acik", []);
  const kisi = await kisiKaydi(env, m.from.id);
  const kisiGrup = kisi ? kisiGrubu(kisi) : null; // ekip: hepsi; Celal sadece kendi, fabrika sadece kendi modelleri
  if (kisiGrup) {
    const ted = await stokIste(env, "/tedarikci", { kodlar: [kod] });
    if (grupOf(ted[kod]) !== kisiGrup) { await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} sizin listenizde değil.` }); return true; }
  }
  let rec = null;
  for (const id of [...acik].reverse()) {
    const x = await siparisOku(env, id);
    if (x && x.kod === kod && !x.deneme && ["repete", "gelecek", "bekliyor", "sureSoruluyor"].includes(x.durum) && (!kisiGrup || (x.grup || "fabrika") === kisiGrup)) { rec = x; break; }
  }
  if (!rec) rec = await siparisAc(env, { kod, renkler: renkler || [], liste: "metin", deneme: false, fotoKod: kod, tur: "repete", grup: kisiGrup || "fabrika" }, simdi); // erken / listesiz bildirim
  rec.metinBildirim = { kimId: m.from.id, renkler };
  if (rec.durum === "bekliyor" && rec.liste === "metin") rec.durum = "repete";
  await siparisYaz(env, rec);
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `${kod} repete geldi${renkler ? ` – ${renkSeri(renkler).replace(/ seri/g, "")}` : ""}, doğru mu?`, reply_markup: { inline_keyboard: [[{ text: "Evet", callback_data: `fc:e:${rec.id}` }, { text: "Hayır", callback_data: `fc:h:${rec.id}` }]] } });
  return true;
}

// 5 dakikalık görev: sadece zamanı gelen kayıtlar okunur ("fs:takip"). 24 saat cevapsız → fabrikaya bir hatırlatma;
// teslim günü gelince (10:00'dan sonra) Murat'a ve Hemra'ya "bugün hazır olmalıydı, geldi mi?"; repete süresi dolunca
// fabrikaya "hazır mı?"; "Beklesin" 7 gün dolunca karar yeniden sorulur; deneme 48 saatte bitmezse özet. Pazartesi 09:30 haftalık özet.
export async function siparisTakip(env, simdi, tg) {
  if (!(await ayarOku(env, "fs:takipGoc", null))) { // bir kez: eski kayıtlar dizine
    for (const id of (await ayarOku(env, "fs:acik", [])).slice(0, 30)) { const r = await siparisOku(env, id); if (r) await siparisYaz(env, r); }
    await ayarYaz(env, "fs:takipGoc", 1);
  }
  const takip = await ayarOku(env, "fs:takip", {});
  const zamani = Object.entries(takip).filter(([, t]) => t <= simdi).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([id]) => id);
  for (const id of zamani) {
    const rec = await siparisOku(env, id);
    if (!rec) continue;
    const kisiler = rec.mesajlar.map(([chat, mesaj]) => [chat, mesaj]);
    if (rec.durum === "bekliyor" && simdi - rec.gonderim >= 86400 && !rec.hatirlatildi) {
      rec.hatirlatildi = true;
      for (const [chat, mesaj] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${rec.deneme ? DENEME : ""}⏰ ${rec.kod}: cevabınızı bekliyoruz (✅ Gelecek / 🔁 Repete / ❌ Bitti).`, reply_to_message_id: mesaj });
    } else if (["gelecek", "repete"].includes(rec.durum) && rec.hazirGun && !rec.teslimHatirlatildi && simdi >= gunBasi(rec.hazirGun) + 10 * 3600) {
      rec.teslimHatirlatildi = true;
      await bildir(env, rec, `📦 ${rec.kod} bugün hazır olmalıydı (${rec.cevaplayan || "fabrika"} ${gunGoster(rec.hazirGun)} demişti). Geldi mi?`, tg, { reply_markup: { inline_keyboard: [[{ text: "📦 Geldi", callback_data: `fc:k:${rec.id}` }]] } });
      if (rec.durum === "repete" && !rec.hazirSoruldu && rec.hazirZaman && simdi >= rec.hazirZaman) {
        rec.hazirSoruldu = true;
        for (const [chat] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${rec.deneme ? DENEME : ""}${rec.kod} repetesi hazır mı?`, reply_markup: { inline_keyboard: [[{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]] } });
      }
    } else if (rec.durum === "repete" && rec.hazirZaman && simdi >= rec.hazirZaman && !rec.hazirSoruldu) {
      rec.hazirSoruldu = true;
      for (const [chat] of kisiler) await tg(env, "sendMessage", { chat_id: chat, text: `${rec.deneme ? DENEME : ""}${rec.kod} repetesi hazır mı?`, reply_markup: { inline_keyboard: [[{ text: "📦 Repete geldi", callback_data: `fc:k:${rec.id}` }]] } });
    } else if (rec.durum === "bitti" && rec.karar === "beklesin" && simdi >= rec.beklesinZaman && !rec.tekrarSoruldu) {
      rec.tekrarSoruldu = true;
      rec.karar = null;
      rec.kararMesajlari = await bildir(env, rec, `⏳ ${rec.kod} – 7 gün doldu. Fabrika bitti demişti. Ne yapalım?`, tg, { reply_markup: kararKlavye(rec.id) });
    }
    await siparisYaz(env, rec); // takip dizini güncellenir (iş bittiyse çıkar)
  }
  for (const did of await ayarOku(env, "fabrika:denemeler", [])) {
    const k = await env.KAYIT.get(`venom:deneme:${did}`, "json");
    if (k && !k.ozet && simdi - k.basla > 48 * 3600) await denemeOzeti(env, did, tg, "sure");
  }
  await haftalikOzet(env, simdi, tg);
}

// Her pazartesi 09:30 Murat'a: geçen hafta fabrikadan ne istendi, ne geldi, ne bekleniyor, geciken var mı.
export async function haftalikOzet(env, simdi, tg) {
  const g = gunAnahtari(simdi);
  if (new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() !== 1 || saat(simdi) < 9.5) return;
  if (await ayarOku(env, `fabrika:haftalik:${g}`, null)) return;
  await ayarYaz(env, `fabrika:haftalik:${g}`, 1);
  return tg(env, "sendMessage", { chat_id: murat(env), text: haftalikMetin(simdi, await ayarOku(env, `fs:hafta:${gunAnahtari(simdi - 7 * 86400)}`, {}), await ayarOku(env, `fs:hafta:${gunAnahtari(simdi - 14 * 86400)}`, {})) });
}
export function haftalikMetin(simdi, gecen, onceki = {}) {
  const bugun = gunAnahtari(simdi);
  const l = Object.values(gecen);
  const kisa = (x) => `${x.kod}${x.grup === "celal" ? " (Celal)" : ""}`;
  const geldi = l.filter((x) => x.durum === "geldi");
  const bekleyen = l.filter((x) => !["geldi", "kapandi", "bitti"].includes(x.durum));
  const bitti = l.filter((x) => x.durum === "bitti");
  const geciken = [...l, ...Object.values(onceki)].filter((x) => !["geldi", "kapandi", "bitti"].includes(x.durum) && x.hazirGun && x.hazirGun < bugun);
  const cevapsiz = bekleyen.filter((x) => x.durum === "bekliyor");
  const madde = (b, liste, f = kisa) => `${b} (${liste.length}): ${liste.length ? liste.map(f).join(", ") : "yok"}`;
  return [
    `📊 Fabrika haftalık özet — ${gunGoster(gunAnahtari(simdi - 7 * 86400))} haftası`,
    madde("• İstenen", l, (x) => `${kisa(x)} ${(x.renkler || []).map((r) => `${r.renk} ${r.adet}`).join("/")}`),
    madde("• Geldi", geldi),
    madde("• Hâlâ bekleniyor", bekleyen, (x) => `${kisa(x)}${x.hazirGun ? ` (${gunGoster(x.hazirGun)})` : ""}`),
    madde("• Gecikiyor", geciken, (x) => `${kisa(x)} (${gunGoster(x.hazirGun)} demişti)`),
    ...(cevapsiz.length ? [madde("• Fabrika cevap vermedi", cevapsiz)] : []),
    ...(bitti.length ? [madde("• Bitti dendi", bitti)] : []),
  ].join("\n");
}

// /fabrikadeneme (sadece Murat): uydurma modelle bütün akış
export async function fabrikaDenemesi(env, m, tg, simdi) {
  if (String(m.from.id) !== murat(env)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Murat'ta." });
  const did = `D${simdi.toString(36)}`;
  const liste = [{ kod: "9999", renkler: [{ renk: "siyah", adet: 2 }, { renk: "bej", adet: 1 }] }, { kod: "9998", renkler: [{ renk: "siyah", adet: 1 }] }];
  const gruplar = { 9999: "fabrika", 9998: "celal" };
  await ayarYaz(env, `fabrika:${did}`, { asama: "onayda", liste, gruplar, deneme: true, yazan: "deneme" });
  await ayarYaz(env, "fabrika:denemeler", [...(await ayarOku(env, "fabrika:denemeler", [])).slice(-10), did]);
  await denemeKaydi(env, did, `Deneme başladı (${kisiAd(m.from)})`);
  await tg(env, "sendMessage", {
    chat_id: sorumlu(env),
    text: `${DENEME}📋 Gidecek liste (deneme):\n${GRUP_AD.fabrika}:\n9999 DENEME — siyah 2, bej 1\n\n${GRUP_AD.celal}:\n9998 CELAL DENEME — siyah 1\n\nGönderilsin mi?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `fb:o:${did}` }, { text: "✏️ Düzelt", callback_data: `fb:d:${did}` }]] },
  });
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: `🧪 Deneme başladı: Hemra'ya onay kartı gitti. Bütün adımlar "🧪 DENEME" ile işaretli; kanalda paylaşım ve silme yapılmaz. Bitince size özet gelecek.` });
}
