// SAYIM SAMİ — Telegram botu (ayrı Cloudflare Worker "volonte-sami").
//
// Stok bilgisinin TEK kaynağı Sami: Vegawin köprüsünden gelen veri Sami'nin deposunda (StokDO).
// Kemal ve Selin stoğu her zaman buradan okur. VEGAWIN'E HİÇBİR ŞEY YAZILMAZ: mağaza bilgisayarındaki köprü
// sadece okur; bu bot da sadece Sami'nin deposunu okur ve raporlar.
//
// Görevleri:
//  - Stok bitince ekibe soru (🔁 Repete / 🗑 Sil / ⏳ Beklesin) — Kemal'den devraldı ("sami:aktif").
//  - /stok, /stok 3194
//  - Kanalı izler: her paylaşımı, o andaki stok ve fiyatla kaydeder (kontrol için).
//  - Her sabah 09:05 "Venom Ekip" grubuna rapor: köprü, biten/gelen/fiyatı değişen modeller, kontroller
//    (stoksuz paylaşım, sitede yanlış fiyat, sitede görünen ama stoğu biten model).
//
// Ayarlar: BOT_TOKEN, WEBHOOK_SECRET (secret) · ALLOWED_IDS, EKIP_IDS, SELF_URL, GITHUB_REPO (düz metin) ·
// KAYIT (ortak KV, okuma + birkaç kayıt) · STOK (Kemal'in betiğindeki StokDO).

import { kodBul } from "./ortak.js";
import { kisiler, tarihYaz, stokIste, stokSorulariGonder, stokKarari, stokGoster } from "./stokbot.js";
import { grubaGonder, grupUyeligi, raporuBirak, birikimSuzgeci, birikimAdimi } from "./venom.js";
import { hizmetHesabi, tabloKimligi, sayfaHazirla, sayfayaYaz } from "./google.js";
import { fabrikaAdimi, fabrikaCevabi, fabrikaDugmesi, yabanciMesaji } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const GUNCELLEMELER = ["message", "callback_query", "my_chat_member", "channel_post"];
const RAPOR_SAATI = [9, 5]; // 09:05
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const kimlikler = (y) => String(y || "").split(",").map((x) => x.trim()).filter(Boolean);
const yoneticiMi = (id, env) => kimlikler(env.ALLOWED_IDS).includes(String(id));
const izinli = (id, env) => kisiler(env).includes(String(id));

async function tg(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde),
  });
  return r.json();
}

function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      const u = await istek.json();
      if (await birikimSuzgeci(env, "sami", u, (id) => izinli(id, env), tg)) return new Response("ok");
      await guncelleme(u, env);
      return new Response("ok");
    }
    return new Response("Sayım Sami çalışıyor (sadece okur).");
  },
  async scheduled(olay, env) {
    if (!env.STOK) return;
    const simdi = Math.floor(Date.now() / 1000);
    if (env.BOT_TOKEN) try { await birikimAdimi(env, "sami", simdi, tg); } catch { /* bir sonraki çalışmada */ }
    // Bot anahtarı yokken (BotFather adımı bekliyor) Telegram işleri yapılmaz; sabah raporu ve kontroller
    // yine hazırlanır ve ortak hafızaya bırakılır (toplu rapora girer).
    const fabrika = (e, t) => fabrikaAdimi(e, t, tg);
    const isler = env.BOT_TOKEN ? { webhookKur, sorular, sabahRaporu, stokTablosu, harcamaTablosu, fabrika } : { sabahRaporu, stokTablosu, harcamaTablosu };
    for (const [ad, f] of Object.entries(isler)) {
      try {
        await f(env, simdi);
      } catch (e) {
        await env.KAYIT.put("sami:hata", JSON.stringify({ zaman: simdi, hata: `${ad}: ${String(e && e.message).slice(0, 300)}` }), { expirationTtl: 7 * 86400 });
      }
    }
  },
};

async function webhookKur(env) {
  if (!env.SELF_URL) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  const kurulu = b.ok && b.result.url === hedef && GUNCELLEMELER.every((g) => (b.result.allowed_updates || []).includes(g));
  if (!kurulu) {
    const r = await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 1 });
    await env.KAYIT.put("sami:webhook", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), ok: r.ok, hata: r.description || null }));
    if (!r.ok) return;
  }
  // Sami'nin botu açık: stok sorularını artık Kemal değil Sami gönderir.
  if (!(await env.KAYIT.get("sami:aktif"))) await env.KAYIT.put("sami:aktif", "1");
}

async function sorular(env, simdi) {
  const s = saat(simdi);
  if (s < 8 || s >= 21) return; // gece soru yok
  await stokSorulariGonder(env, simdi, tg);
}

export async function guncelleme(u, env) {
  if (u.callback_query) {
    const cq = u.callback_query;
    if (!izinli(cq.from.id, env)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Yetkiniz yok." });
    if (String(cq.data || "").startsWith("sz:")) return stokKarari(cq, env, tg);
    if (/^f[ba]:/.test(String(cq.data || ""))) return fabrikaDugmesi(env, cq, tg, Math.floor(Date.now() / 1000));
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Geçersiz düğme." });
  }
  if (u.my_chat_member) return uyelik(u.my_chat_member, env);
  if (u.channel_post) return kanalPaylasimi(u.channel_post, env);
  const m = u.message;
  if (!m || !m.from || m.chat.type !== "private") return;
  if (!izinli(m.from.id, env)) return yabanciMesaji(env, m, tg); // fabrika kişisi ya da /start → Murat'a sorulur
  if (await fabrikaCevabi(env, m, tg, Math.floor(Date.now() / 1000))) return; // Hemra'nın eksik listesi
  const komut = (m.text || "").trim().split(/[\s@]/)[0].toLowerCase();
  if (komut === "/stok") return stokGoster(m, env, tg);
  if (komut === "/tablo") return tabloKomutu(m, env);
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: [
    "📦 Ben Sayım Sami. Vegawin stoklarını okurum (hiçbir şeyi değiştirmem).",
    "/stok — köprünün durumu",
    "/stok 3194 — o modelin adedi, fiyatı ve durumu",
    "Stok bitince 🔁 Repete / 🗑 Sil / ⏳ Beklesin sorusunu ben sorarım. Her sabah 09:05'te Venom Ekip grubuna rapor veririm.",
    "Stok tablosunu (Google Sheets) 5 dakikada bir güncellerim. /tablo — tablo durumu (yönetici).",
  ].join("\n") });
}

// "Venom Ekip" grubuna yönetici ekleyince grup kaydedilir (raporlar oraya gider).
const uyelik = (m, env) => grupUyeligi(m, env, "sami", "📦 Sayım Sami (stok, sadece okur)", tg);

// Kanal izleme: model kodlu her paylaşım, o andaki stok ve fiyatla kaydedilir.
async function kanalPaylasimi(p, env) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal || p.chat.id !== kanal.id) return;
  const kod = kodBul(p.caption || p.text || "");
  if (!kod) return;
  await stokIste(env, "/paylasim-kaydet", { mesaj: p.message_id, kod, zaman: p.date });
}

async function siteUrunleri(env) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/veri/urunler.json`, { cf: { cacheTtl: 60 } });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

const liste = (kodlar, n = 15) => (kodlar.length > n ? `${kodlar.slice(0, n).join(", ")} … (+${kodlar.length - n})` : kodlar.join(", "));

// Saf rapor: test edilebilir.
export function samiRaporu({ simdi, ozet, olaylar, paylasimlar, tum, site, kodlar, sonpaylasim }) {
  const dun = gunAnahtari(simdi - 86400);
  const satir = [`📦 Sayım Sami — ${gunAnahtari(simdi).split("-").reverse().join(".")} sabah raporu`, ""];
  const sorunlar = [];
  // Son değişiklik ile köprünün son çalışması ayrı (29 Ekim): eski köprü sadece değişiklik olunca gönderdiği için
  // "son veri" eski görünüp yanlış alarm veriyordu. Uyarı sadece "çalışıyorum" sinyali gönderen yeni köprüde verilir.
  for (const k of ozet.kopruler) {
    satir.push(`Köprü ${k.magaza}: son değişiklik ${tarihYaz(k.degisim || k.son)} · ${k.adet} model`);
    if (k.kalp) {
      const sonTemas = Math.max(k.son || 0, k.kalp || 0);
      const durdu = simdi - sonTemas > 16 * 3600; // gece 19:00 → sabah 09:00 arası boşluk normal
      satir.push(`Köprü son çalışma: ${tarihYaz(sonTemas)} ${durdu ? "⚠️ 16 saattir sinyal yok (mağaza bilgisayarı kapalı olabilir)" : "✅"}`);
      if (durdu) sorunlar.push(`Köprü ${k.magaza} 16 saattir sinyal göndermedi`);
    } else satir.push("Köprü son çalışma: yeni köprü kurulunca görünecek (eski köprü sadece değişiklik olunca veri gönderir)");
  }
  if (!ozet.kopruler.length) satir.push("⚠️ Köprüden hiç veri gelmedi.");
  satir.push(`Stokta: ${ozet.stokta} model · stoksuz: ${ozet.stoksuz}`);
  const tur = (t) => [...new Set(olaylar.filter((o) => o.tur === t).map((o) => o.kod))];
  const biten = tur("bitti");
  const gelen = tur("geldi");
  const fiyat = olaylar.filter((o) => o.tur === "fiyat");
  satir.push(`Dün biten (${biten.length}): ${biten.length ? liste(biten) : "yok"}`);
  satir.push(`Dün gelen (${gelen.length}): ${gelen.length ? liste(gelen) : "yok"}`);
  if (fiyat.length) satir.push(`Fiyatı değişen: ${fiyat.slice(0, 10).map((o) => `${o.kod} ${o.onceki}→${o.sonraki} $`).join(", ")}`);
  const paylasilmamis = Object.entries(tum).filter(([k, x]) => x.toplam > 0 && x.fiyat != null && !kodlar[k]).map(([k]) => k).sort();
  satir.push(`Stokta ama Telegram'da hiç paylaşılmamış (${paylasilmamis.length}): ${paylasilmamis.length ? liste(paylasilmamis) : "yok"}`);

  satir.push("", "🔎 Kontroller:");
  // 1) Stokta olmayan model paylaşıldı mı? (Vegawin'de olmayan = Black Rose/pasif: kontrol dışı)
  const stoksuzPaylasim = paylasimlar.filter((p) => p.toplam != null && p.toplam <= 0);
  if (stoksuzPaylasim.length) {
    for (const p of stoksuzPaylasim) {
      const kemal = sonpaylasim[p.kod] && Math.abs(sonpaylasim[p.kod] - p.zaman) < 900;
      const metin = `${p.kod} stokta yokken paylaşıldı (${tarihYaz(p.zaman)}, ${kemal ? "Kemal" : "elle"})`;
      satir.push(`• ⚠️ ${metin}`);
      sorunlar.push(metin);
    }
  } else satir.push(`• ✅ Dün (${dun}) stoksuz model paylaşılmadı (${paylasimlar.length} paylaşım kontrol edildi)`);
  // 2) Sitede fiyat Vegawin ile aynı mı? 3) Sitede görünen ama stoğu biten var mı?
  const yanlisFiyat = [];
  const gorunenStoksuz = [];
  for (const u of site) {
    const x = tum[u.kod];
    if (!x) continue; // Vegawin'de yok (Black Rose / pasif): "Ask price" ile kalır, hata değil
    if (x.fiyat != null && u.fiyat != null && Number(u.fiyat) !== Number(x.fiyat)) yanlisFiyat.push(`${u.kod} sitede ${u.fiyat} $, Vegawin ${x.fiyat} $`);
    if (x.fiyat != null && u.fiyat == null && !u.gizli) yanlisFiyat.push(`${u.kod} sitede fiyatsız, Vegawin ${x.fiyat} $`);
    if (x.gizli && !u.gizli) gorunenStoksuz.push(u.kod);
  }
  if (yanlisFiyat.length) for (const y of yanlisFiyat) { satir.push(`• ⚠️ Sitede yanlış fiyat: ${y}`); sorunlar.push(`Sitede yanlış fiyat: ${y}`); }
  else satir.push(`• ✅ Sitedeki fiyatlar Vegawin ile aynı (${site.length} model)`);
  if (gorunenStoksuz.length) { satir.push(`• ⚠️ Sitede görünüyor ama stoğu bitmiş: ${liste(gorunenStoksuz)}`); sorunlar.push(`Sitede görünen stoksuz: ${gorunenStoksuz.join(", ")}`); }
  else satir.push("• ✅ Sitede stoğu bitmiş model görünmüyor");
  return {
    metin: satir.join("\n"),
    ozet: `Stokta ${ozet.stokta} model; dün ${biten.length} bitti, ${gelen.length} geldi; Telegram'da paylaşılmamış ${paylasilmamis.length}.`,
    sorunlar,
    yapilacak: paylasilmamis.length ? [`Stokta olup kanala hiç paylaşılmamış ${paylasilmamis.length} model var (${liste(paylasilmamis, 8)})`] : [],
  };
}

// Sami kanala eklenmeden önce (ya da paylaşım kaydı yoksa) dünkü paylaşımlar Kemal'in kanal dizininden
// ("kodlar") çıkarılır; paylaşım anındaki stok, o andan sonraki ilk bitti/geldi olayından bulunur.
export function kanaldanPaylasimlar(kodlar, tum, olaylar, basla, bitis) {
  const sonuc = [];
  for (const [kod, gruplar] of Object.entries(kodlar)) {
    for (const g of gruplar) {
      if (!(g.tarih >= basla && g.tarih < bitis)) continue;
      const x = tum[kod];
      let toplam = x ? x.toplam : null;
      const sonraki = olaylar.filter((o) => o.kod === kod && o.zaman > g.tarih && ["bitti", "geldi"].includes(o.tur)).sort((a, b) => a.zaman - b.zaman)[0];
      if (x && sonraki) toplam = sonraki.tur === "bitti" ? 1 : 0;
      sonuc.push({ kod, zaman: g.tarih, toplam, mesaj: g.ids[0] });
    }
  }
  return sonuc.sort((a, b) => a.zaman - b.zaman);
}

async function sabahRaporu(env, simdi) {
  const s = saat(simdi);
  const elle = await env.KAYIT.get("sami:elleRapor"); // elle istenen rapor: saat ve günlük sınır yok, Telegram'a gitmez
  const gun = gunAnahtari(simdi);
  if (!elle) {
    if (s < RAPOR_SAATI[0] + RAPOR_SAATI[1] / 60 || s >= 10) return;
    if ((await stokIste(env, "/ayar-oku", { k: `rapor:${gun}` })).v) return;
    await stokIste(env, "/ayar-yaz", { k: `rapor:${gun}`, v: "1" });
  } else await env.KAYIT.delete("sami:elleRapor");
  const dunBasi = simdi - (simdi + SAAT_FARKI) % 86400 - 86400; // dün 00:00 (İstanbul)
  const tum = await stokIste(env, "/tum");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  let paylasimlar = await stokIste(env, "/paylasimlar", { basla: dunBasi, bitis: dunBasi + 86400 });
  if (!paylasimlar.length) paylasimlar = kanaldanPaylasimlar(kodlar, tum, await stokIste(env, "/olaylar", { basla: dunBasi, bitis: simdi }), dunBasi, dunBasi + 86400);
  const rapor = samiRaporu({
    simdi,
    ozet: await stokIste(env, "/ozet"),
    olaylar: await stokIste(env, "/olaylar", { basla: dunBasi, bitis: dunBasi + 86400 }),
    paylasimlar,
    tum,
    site: await siteUrunleri(env),
    kodlar,
    sonpaylasim: (await env.KAYIT.get("sonpaylasim", "json")) || {},
  });
  await env.KAYIT.put(`venom:samiMetin:${gun}`, rapor.metin, { expirationTtl: 7 * 86400 }); // tam metin (kontrol için)
  if (elle) return;
  await raporuBirak(env, "sami", simdi, rapor);
  if (env.BOT_TOKEN) await grubaGonder(env, "sami", rapor.metin, tg);
}

// ---------- Google Sheets (kullanıcı kararı, 28 Ekim) ----------
// Stok tablosu: Sami'nin deposunun (StokDO) birebir aynası; 5 dakikada bir, değişiklik varsa (en geç saatte bir) yazılır.
// Botlar stoğu yine Sami'nin deposundan okur (hızlı, sınırsız); tablo aynı veriden yazıldığı için bire bir aynıdır.
// Sadece: model kodu, adet, satış fiyatı, sitede, Telegram'da. Alış fiyatı / maliyet / kâr / koddaki ek (B20) YOK —
// köprü bunları zaten okumaz. Harcama tablosu ayrıdır (yalnız kullanıcı görür; paylaşımı kullanıcı Google'da yapar).
const ayGoster = (ay) => ay.split("-").reverse().join(".");
const zamanYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`; };

export function stokTablosuSatirlari(tum, site, kodlar) {
  const sitede = new Set(site.filter((u) => !u.gizli).map((u) => String(u.kod)));
  return Object.entries(tum)
    .sort(([ka, a], [kb, b]) => (b.toplam > 0) - (a.toplam > 0) || ka.localeCompare(kb, "tr", { numeric: true }))
    .map(([kod, x]) => [kod, Math.max(0, Number(x.toplam) || 0), x.fiyat != null ? Number(x.fiyat) : "", sitede.has(kod) ? "Var" : "Yok", kodlar[kod] ? "Var" : "Yok"]);
}

async function tabloKimlik(env, tur) {
  return tabloKimligi(env[tur === "stok" ? "STOK_TABLO_ID" : "HARCAMA_TABLO_ID"]) || (await env.KAYIT.get(`sami:tablo:${tur}`));
}

async function sha(metin) {
  const o = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return [...new Uint8Array(o)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function stokTablosu(env, simdi) {
  if (!hizmetHesabi(env)) return;
  const id = await tabloKimlik(env, "stok");
  if (!id) return;
  const satirlar = stokTablosuSatirlari(await stokIste(env, "/tum"), await siteUrunleri(env), (await env.KAYIT.get("kodlar", "json")) || {});
  const iz = await sha(JSON.stringify(satirlar));
  const onceki = JSON.parse((await stokIste(env, "/ayar-oku", { k: "tablo:stok" })).v || "{}");
  if (onceki.id === id && onceki.iz === iz && simdi - onceki.zaman < 3600) return;
  if (onceki.id !== id) await sayfaHazirla(env, id, "Stok", 2);
  const stokta = satirlar.filter((r) => r[1] > 0).length;
  await sayfayaYaz(env, id, "Stok", [
    [`VOLONTE stok — son güncelleme ${zamanYaz(simdi)} · Sayım Sami (Vegawin'den, sadece okuma) · stokta ${stokta} model`, "", "", "", ""],
    ["Model kodu", "Adet", "Satış fiyatı ($)", "Sitede", "Telegram'da"],
    ...satirlar,
  ]);
  await stokIste(env, "/ayar-yaz", { k: "tablo:stok", v: JSON.stringify({ id, iz, zaman: simdi }) });
}

// Harcama tablosu: ay ay Claude + üretim (fal.ai). Aylık değerler Sami'nin deposunda da saklanır (KV kaydı 70 günde silinir).
export async function harcamaTablosu(env, simdi) {
  if (!hizmetHesabi(env)) return;
  const id = await tabloKimlik(env, "harcama");
  if (!id) return;
  const ay = new Date((simdi + SAAT_FARKI) * 1000).toISOString().slice(0, 7);
  const kayit = JSON.parse((await stokIste(env, "/ayar-oku", { k: "tablo:harcama" })).v || "{}");
  if (kayit.id === id && simdi - (kayit.zaman || 0) < 3600) return; // saatte bir
  const aylar = kayit.aylar || {};
  aylar[ay] = {
    claude: Number((await env.KAYIT.get(`harcama:${ay}`)) || 0) / 1e6,
    uretim: Number((await env.KAYIT.get(`uretim-harcama:${ay}`)) || 0),
  };
  if (kayit.id !== id) await sayfaHazirla(env, id, "Harcama", 2);
  const satirlar = Object.keys(aylar).sort().reverse().map((a) => {
    const x = aylar[a];
    return [ayGoster(a), Math.round(x.claude * 100) / 100, Math.round(x.uretim * 100) / 100, Math.round((x.claude + x.uretim) * 100) / 100];
  });
  await sayfayaYaz(env, id, "Harcama", [
    [`VOLONTE harcama — son güncelleme ${zamanYaz(simdi)} · sadece sahibi görür`, "", "", ""],
    ["Ay", "Claude ($)", "Üretim fal.ai ($)", "Toplam ($)"],
    ...satirlar,
  ]);
  await stokIste(env, "/ayar-yaz", { k: "tablo:harcama", v: JSON.stringify({ id, zaman: simdi, aylar }) });
}

// /tablo — hizmet hesabının e-postası ve tabloların durumu; /tablo stok <link>, /tablo harcama <link> (sadece yönetici)
async function tabloKomutu(m, env) {
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text, disable_web_page_preview: true });
  if (!yoneticiMi(m.from.id, env)) return yaz("Bu ayar sadece Murat ve Merdan'da.");
  const [, tur, link] = (m.text || "").trim().split(/\s+/);
  const sa = hizmetHesabi(env);
  if (tur === "stok" || tur === "harcama") {
    const id = tabloKimligi(link);
    if (!id) return yaz(`Örnek: /tablo ${tur} https://docs.google.com/spreadsheets/d/...`);
    await env.KAYIT.put(`sami:tablo:${tur}`, id);
    return yaz(`✅ ${tur === "stok" ? "Stok" : "Harcama"} tablosu kaydedildi. 5 dakika içinde yazmaya başlarım.${sa ? "" : "\n⚠️ Google anahtarı (GOOGLE_SA) henüz girilmedi."}`);
  }
  const durum = async (t) => ((await tabloKimlik(env, t)) ? "bağlı ✅" : "yok");
  return yaz([
    "📊 Google tabloları",
    sa ? `Hizmet hesabı: ${sa.client_email}\n(Tabloyu bu e-postayla "Düzenleyen" olarak paylaşın.)` : "⚠️ Google anahtarı (GOOGLE_SA) henüz girilmedi.",
    `Stok tablosu: ${await durum("stok")}`,
    `Harcama tablosu: ${await durum("harcama")}`,
    "",
    "Bağlamak için: /tablo stok <link> · /tablo harcama <link>",
  ].join("\n"));
}
