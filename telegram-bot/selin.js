// SELİN — siteyi dolduran eleman (ayrı Cloudflare Worker "volonte-selin", ayrı Telegram botu).
//
// Kemal'in kodunu kullanmaz; ortak beyinden (KV) sadece OKUR (ortak.js). Kendi verisi "selin:*".
// Akış: model listesi (✅ Mağazada var / ❌ Yok) → "var" denenler için hazırlık (bütün pozlar
// en yüksek çözünürlükte, netlik kontrolü, açıklama TR/EN/FR/PT, bedenler) → onay kartı
// (✅ Onayla, siteye yükle / ✏️ Düzelt / ❌ Ekleme) → onaylanınca GitHub'a tek commit → site linki.
// Onaysız hiçbir şey siteye çıkmaz. Yapay zekâ harcaması ortak aylık sınıra (harcama.js) sayılır.
//
// Ayarlar (volonte-selin Worker'ında):
//  BOT_TOKEN, WEBHOOK_SECRET, ANTHROPIC_API_KEY, GITHUB_TOKEN  secret
//  ALLOWED_IDS (yöneticiler: sahip, Merdan), EKIP_IDS (ekip: mesajları görür, düğmelere basar),
//  SELF_URL, ANTHROPIC_MODEL, GITHUB_REPO, SITE_URL  düz metin
//  KAYIT (ortak KV), SELIN (Durable Object: yapay zekâ adımı Kuzey Amerika'da)

import { defterTg, defterKarar, defterIs } from "./is-defteri.js";
import { durdurulduMu, durMesaji } from "./durdurma.js";
import { patronaGider, venomaAktar, formAktar, venomCevabi, sahteDugme, sahteMesaj, tekKapiAcik, patronKisisel } from "./tek-kapi.js";
import { kartTekrarAdimi, kartIletAdimi, GUNCEL } from "./kart-tekrar.js";
import { kuyruguAl, kuyrugaEkle } from "./venom-kopru.js";
import { renkleriUygula } from "./site-renk.js";
import { magazaStogu, STOK_KURALI } from "./sil.js";
import { siteKontrol, engelKaydet, markaKesin } from "./yayin-kontrol.js";
import Anthropic from "@anthropic-ai/sdk";
import { kanalBilgisi, modelSecenekleri, tarihUzun } from "./ortak.js";
import { sinirAsildiMi, harcamaEkle } from "./harcama.js";
import { eskiBilgiler, BEDEN_GRUPLARI, bedenOnerisi } from "./altyazi.js";
import { karmaDepo, gocBirKez, SELIN_YEREL } from "./depo.js";
import { grubaGonder, grupUyeligi, raporZamani, raporuBirak, birikimSuzgeci, birikimAdimi, patronDenemesi } from "./venom.js";
import { uretimAdimi, aracOzeti, uretimHarcanan, ARACLAR, DENEME_SINIR_USD } from "./uretim.js";

const SAAT_FARKI = 3 * 3600;
const ILK_HAFTA_GUNLUK = 50; // kullanıcı kararı (22 Ekim): ilk hafta günde 50 model
const SONRA_GUNLUK = 10;
const LISTE_PARTI = 8; // bir çalışmada sorulan model
const PAYLASIM_EN_FAZLA = 4; // bir modelin en yeni kaç paylaşımından poz toplanır
const POZ_EN_FAZLA = 10;
const ILETME_EN_FAZLA = 12; // bir hazırlıkta arşive iletilen mesaj (ücretsiz pakette çalışma başına 50 istek)
const DUSUK_COZUNURLUK = 700; // piksel (genişlik ya da yükseklik); altı "düşük çözünürlük"
const GUNCELLEMELER = ["message", "callback_query", "my_chat_member"];
// Sitedeki kategoriler (js/urunler.js ile aynı kimlikler) ve kartta gösterilen Türkçe adları.
export const KATEGORI_ADI = {
  dresses: "Elbise", evening: "Abiye", sets: "Takım", jumpsuits: "Tulum",
  tops: "Bluz / Gömlek / Tunik", skirts: "Etek", trousers: "Pantolon", outerwear: "Ceket / Kaban",
};
const KATEGORILER = Object.keys(KATEGORI_ADI);

export const REHBER = `VOLONTE yazı rehberi (özet): Toptancı kadın alıcılar için sakin özgüvenli, modern ve şık ton; abartı ve ünlem yok.
Site açıklaması 2–4 cümle (40–70 kelime): 1) ne olduğu ve kesimi (net, sade) 2) öne çıkan 2–3 detay (yaka, kol, kemer, taş, desen, doku) 3) nerede/nasıl giyilir 4) sakin bir kalite cümlesi (İstanbul'da üretim, özenli işçilik).
Fiyat, stok, beden ve görünmeyen özellik (emin olunmayan kumaş) uydurma; başka marka anma; emoji yok.
Her dilde doğal yazım (çeviri kokmasın): en ana dil, fr ve pt Afrika pazarı için, tr sahibin kontrolü için.
Başlık: 2–4 kelime İngilizce, tür + ayırt edici detay (ör. "Belted Wrap Midi Dress").`;

const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const kimlikler = (yazi) => String(yazi || "").split(",").map((x) => x.trim()).filter(Boolean);
// Yöneticiler + ekip: hepsi listeleri görür ve düğmelere basar. Ayar işleri sadece yöneticide.
const kisiler = (env) => [...new Set([...kimlikler(env.ALLOWED_IDS), ...kimlikler(env.EKIP_IDS)])];
const izinli = (id, env) => kisiler(env).includes(String(id)) || kimlikler(env.SAHIP_IDS).includes(String(id));
const yoneticiMi = (id, env) => kimlikler(env.ALLOWED_IDS).includes(String(id));
const kisiAdi = (f) => [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "Biri";
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const yazKV = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);

async function tg(env, metod, govde, deneme = 0) {
  if (govde && venomCevabi(metod, govde)) return govde.text ? venomaAktar(env, "selin", "sendMessage", { chat_id: env.MURAT_ID, text: `ℹ️ ${govde.text}` }) : { ok: true, result: true };
  if (govde && (await patronaGider(env, govde.chat_id))) { const r = await venomaAktar(env, "selin", metod, govde, (m, g) => tgGercek(env, m, g)); await defterTg(env, "selin", metod, govde, r); return r; }
  const r = await tgGercek(env, metod, govde, deneme);
  await defterTg(env, "selin", metod, govde, r); // 9 Kasım: iş defteri (Venom her şeyi bilir)
  return r;
}
async function tgGercek(env, metod, govde, deneme = 0) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde),
  });
  const j = await r.json();
  // Telegram "çok hızlı" derse (429) kısa bekleyip bir kez daha dene.
  const bekle = j && j.error_code === 429 && j.parameters && j.parameters.retry_after;
  if (bekle && bekle <= 15 && !deneme) {
    await new Promise((ok) => setTimeout(ok, bekle * 1000));
    return tg(env, metod, govde, 1);
  }
  return j;
}
const herkese = async (env, text, ek = {}) => {
  const sonuc = [];
  for (const k of kisiler(env)) {
    const r = await tg(env, "sendMessage", { chat_id: k, text, disable_web_page_preview: true, ...ek });
    if (r.ok) sonuc.push([k, r.result.message_id]);
  }
  return sonuc;
};

function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

// Duraklatma anahtarı: 0 = çalışıyor. (23 Ekim'de süresiz durdurulmuştu; kullanıcı 27 Ekim'de "Selin'i başlat" dedi.)
// Yeniden durdurmak için Infinity yapılır: liste/hazırlık/mesaj olmaz, kayıtlara dokunulmaz.
const DURAKLAT_BITIS = 0;
export const duraklatildi = (simdi) => simdi < DURAKLAT_BITIS;

// Site yükleme kilidi (kullanıcı kararı, 28 Ekim: önizlemede başka modellerin fotoğrafları görüldü).
// true iken hiçbir model siteye yüklenmez (toplu düğmesi ve tek kart onayı dahil); taslaklar ve
// liste kaybolmaz. Kullanıcı onayıyla false yapılır.
export const SITE_KILIDI = true;
const kilitli = (env) => SITE_KILIDI && env.KILIT_TEST_ACIK !== "1"; // testler kilidi açabilir
const KILIT_MESAJI = "🔒 Siteye yükleme şu an kilitli (fotoğraflar kontrol ediliyor). Hiçbir şey siteye çıkmadı.";

// Selin'in bütün işleri kendi Durable Object'inde ("selin") çalışır: "selin:*" kayıtları orada
// (KV günlük yazma sınırı). Hata/durum kayıtları izlenebilsin diye KV'de kalır (depo.js).
const selinNesne = (env) => env.SELIN.get(env.SELIN.idFromName("selin"), { locationHint: "enam" });
// TEK KAPI (5 Kasım): Venom → Selin iç giriş (selin-giris.js "VenomKapisi"): düğme, model durumu, taslak başlat
export async function venomMesaj(env, metin) {
  const u = sahteMesaj(env, metin);
  if (env.SELIN) await selinNesne(env).fetch("https://selin/guncelleme", { method: "POST", body: JSON.stringify(u) }); else await guncelleme(u, env);
  return true;
}
export async function venomDugme(env, data, rid) {
  const u = sahteDugme(env, data, rid);
  if (env.SELIN) await selinNesne(env).fetch("https://selin/guncelleme", { method: "POST", body: JSON.stringify(u) }); else await guncelleme(u, env);
  return true;
}
export async function venomSelin(env, yol, kod) {
  if (env.SELIN) return (await selinNesne(env).fetch(`https://selin${yol}`, { method: "POST", body: JSON.stringify({ kod }) })).json();
  const simdi = Math.floor(Date.now() / 1000);
  return yol === "/venom/durum" ? venomModelDurumu(env, kod, simdi) : yol === "/venom/ozet" ? selinOzet(env, simdi) : venomTaslakBaslat(env, kod, simdi);
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      const u = await istek.json();
      if (await birikimSuzgeci(env, "selin", u, (id) => izinli(id, env), tg)) return new Response("ok");
      if (duraklatildi(Math.floor(Date.now() / 1000))) {
        // Mesaj gönderilmez, kayıt yazılmaz; düğmeye basana sadece kısa bir uyarı (sohbete düşmez).
        if (u.callback_query) await tg(env, "answerCallbackQuery", { callback_query_id: u.callback_query.id, text: "Selin şu an durduruldu; yeniden başlatılınca devam edecek.", show_alert: true });
        return new Response("ok");
      }
      if (env.SELIN) await selinNesne(env).fetch("https://selin/guncelleme", { method: "POST", body: JSON.stringify(u) });
      else await guncelleme(u, env);
      return new Response("ok");
    }
    // Sitenin kendi video oynatıcısı için: /v/<kanal mesaj no> (sadece sitedeki ürünlerin videoları).
    if (istek.method === "GET" && /^\/v\/\d+$/.test(url.pathname)) {
      const id = url.pathname.slice(3);
      const basliklar = { "x-aralik": istek.headers.get("Range") || "" };
      if (env.SELIN) return selinNesne(env).fetch(`https://selin/sitevideo?id=${id}`, { headers: basliklar });
      return siteVideo(env, id, istek.headers.get("Range"));
    }
    // Yeni akış videosu: /v2/<kod>/<n>
    if (istek.method === "GET" && /^\/v2\/\d{3,6}\/\d+$/.test(url.pathname)) {
      const [, , kod, n] = url.pathname.split("/");
      const basliklar = { "x-aralik": istek.headers.get("Range") || "" };
      if (env.SELIN) return selinNesne(env).fetch(`https://selin/v2?kod=${kod}&n=${n}`, { headers: basliklar });
      return ozelVideo(env, kod, n, istek.headers.get("Range"));
    }
    // Toplu liste önizlemesi (gizli anahtarlı link; sadece bakmak için).
    if (istek.method === "GET" && url.pathname.startsWith("/onizleme/")) {
      const basliklar = { "x-aralik": istek.headers.get("Range") || "" };
      const yol = url.pathname.slice("/onizleme/".length);
      if (env.SELIN) return selinNesne(env).fetch(`https://selin/onizleme?yol=${encodeURIComponent(yol)}`, { headers: basliklar });
      return onizleme(env, yol, istek.headers.get("Range"));
    }
    if (istek.method === "GET" && url.pathname === "/video") {
      if (env.SELIN) return selinNesne(env).fetch(`https://selin/video?t=${encodeURIComponent(url.searchParams.get("t") || "")}`);
      return videoVer(env, url.searchParams.get("t"));
    }
    if (istek.method === "POST" && url.pathname === "/kare") {
      const govde = await istek.json().catch(() => ({}));
      if (env.SELIN) return selinNesne(env).fetch("https://selin/kare-geldi", { method: "POST", body: JSON.stringify(govde) });
      return kareGeldi(env, govde, Math.floor(Date.now() / 1000));
    }
    return new Response("Selin çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    try { await patronDenemesi(env, "Selin", tg); } catch { /* */ }
    try { await birikimAdimi(env, "selin", Math.floor(Date.now() / 1000), tg); } catch { /* bir sonraki çalışmada */ }
    try { await kartIletAdimi(env, "selin", tg); } catch { /* 9 Kasım: Hemra'nın seçtiği kişiye kart */ }
    try { await kartTekrarAdimi(env, "selin", tg, Math.floor(Date.now() / 1000)); } catch { /* 9 Kasım: onay merdiveni; bir sonraki çalışmada */ }
    if (env.SELIN) {
      const nesne = selinNesne(env);
      const cagir = async (yol) => {
        try { await nesne.fetch(`https://selin${yol}`, { method: "POST" }); } catch (e) {
          await env.KAYIT.put("selin:hata", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), hata: `${yol}: ${String(e && e.message).slice(0, 300)}` }), { expirationTtl: 7 * 86400 });
        }
      };
      // Durduruluyken bile kayıtlar bir kez kopyalanıp kontrol edilir (mesaj gönderilmez).
      if (duraklatildi(Math.floor(Date.now() / 1000))) return void (await nesne.fetch("https://selin/goc", { method: "POST" }));
      // Ayrı istekler: her birinin kendi istek sınırı; biri hata verirse diğerleri yine çalışır.
      // Yeni akış (28 Ekim): kanal tabanlı işler (liste, hazırlık, kare, tarama, toplu) KAPALI.
      if (await durdurulduMu(env, "selin")) return; // 6 Kasım: durduruldu → zamanlı işler bekler
      await cagir("/cron");
      await cagir("/istek");
      await cagir("/video-isleri");
      await cagir("/uretim");
      return;
    }
    if (duraklatildi(Math.floor(Date.now() / 1000))) return;
    await selinCron(env, Math.floor(Date.now() / 1000));
    await hazirlaGuvenli(env, Math.floor(Date.now() / 1000));
    await kareSiraGuvenli(env, Math.floor(Date.now() / 1000));
  },
};

// Her adım ayrı korunur: biri hata verirse diğerleri yine çalışır, hata KV'de "selin:hata".
async function selinCron(env, simdi) {
  // Yeni akış: kanal tabanlı adımlar (fotografYokGocu, listeAdimi, ozetAdimi, onizlemeDuyur, kontrolIstegi) kapalı.
  const adimlar = { webhookKur, githubKontrol, siteStokEsitle, selinSabahRaporu, fotoDuzeltmeGocu };
  for (const [ad, f] of Object.entries(adimlar)) {
    try {
      await f(env, simdi);
    } catch (e) {
      await yazKV(env, "selin:hata", { zaman: simdi, hata: `${ad}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400);
    }
  }
}

export class SelinDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(istek) {
    const url = new URL(istek.url);
    await gocBirKez(this.state, this.env.KAYIT, SELIN_YEREL, "selin"); // ilk seferde KV'den kopyala + kontrol (silmez)
    const env = { ...this.env, KAYIT: karmaDepo(this.env.KAYIT, this.state.storage, SELIN_YEREL) };
    const simdi = Math.floor(Date.now() / 1000);
    switch (url.pathname) {
      case "/goc": return new Response("ok");
      case "/guncelleme": await guncelleme(await istek.json(), env); return new Response("ok");
      case "/cron": await selinCron(env, simdi); return new Response("ok");
      case "/kare": await kareSiraGuvenli(env, simdi); return new Response("ok");
      case "/toplu":
        try { await topluAdimi(env, simdi); } catch (e) { await yazKV(env, "selin:hata", { zaman: simdi, hata: `toplu: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400); }
        return new Response("ok");
      case "/istek":
        for (const [ad, f] of Object.entries({ istekAdimi, videoKurtarAdimi, ozelHazirlaAdimi, gunSonuOzeti, siteSilAdimi, pelinSiteAdimi, ghTekrarAdimi })) {
          try { await f(env, simdi); } catch (e) { await yazKV(env, "selin:hata", { zaman: simdi, hata: `${ad}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400); }
        }
        return new Response("ok");
      case "/video-isleri": // 5 Kasım: video işleri ayrı istekte (Cloudflare'in istek başına 50 dış istek sınırı)
        for (const [ad, f] of Object.entries({ siteVideoEkleAdimi, kanalVideoAdimi, videoDenetimAdimi, siteTekrarBulAdimi, selinYedekAdimi, siteDefteriAdimi })) {
          try { await f(env, simdi); } catch (e) { await yazKV(env, "selin:hata", { zaman: simdi, hata: `${ad}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400); }
        }
        return new Response("ok");
      case "/v2": return ozelVideo(env, url.searchParams.get("kod"), url.searchParams.get("n"), istek.headers.get("x-aralik") || null);
      case "/uretim":
        try { await uretimCalis(env, simdi); } catch (e) { await yazKV(env, "selin:hata", { zaman: simdi, hata: `uretim: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400); }
        return new Response("ok");
      case "/tarama":
        try { await taramaAdimi(env, simdi); } catch (e) { await yazKV(env, "selin:hata", { zaman: simdi, hata: `tarama: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400); }
        return new Response("ok");
      case "/onizleme": return onizleme(env, url.searchParams.get("yol"), istek.headers.get("x-aralik") || null);
      case "/video": return videoVer(env, url.searchParams.get("t"));
      case "/sitevideo": return siteVideo(env, url.searchParams.get("id"), istek.headers.get("x-aralik") || null);
      case "/kare-geldi": return kareGeldi(env, await istek.json().catch(() => ({})), simdi);
      case "/venom/durum": return Response.json(await venomModelDurumu(env, (await istek.json()).kod, simdi));
      case "/venom/ozet": return Response.json(await selinOzet(env, simdi)); // 9 Kasım
      case "/venom/taslak": return Response.json(await venomTaslakBaslat(env, (await istek.json()).kod, simdi));
      default: await hazirlaGuvenli(env, simdi); return new Response("ok");
    }
  }
}

async function webhookKur(env) {
  if (!env.SELF_URL) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  if (b.ok && b.result.url === hedef && GUNCELLEMELER.every((g) => (b.result.allowed_updates || []).includes(g))) return;
  const r = await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 1 });
  await yazKV(env, "selin:webhook", { zaman: Math.floor(Date.now() / 1000), ok: r.ok, hata: r.description || null });
}

// ---------- 1) Model listesi ----------
// Kullanıcı kararı (27 Ekim): mesaj az olsun. Vegawin'de (Sayım Sami) stokta olan model sorulmadan
// hazırlığa girer; stoğu bitmiş/gizlenmiş model hiç sorulmaz; Vegawin'de olmayan model "sorulacak"
// olur ve sadece günün özetinden (11:00, 16:00) "Soruları göster" ile isteyene gösterilir.

export async function gunlukHedef(env, simdi) {
  let d = await oku(env, "selin:durum", null);
  if (!d) {
    d = { baslangic: simdi };
    await yazKV(env, "selin:durum", d);
  }
  return simdi - d.baslangic < 7 * 86400 ? ILK_HAFTA_GUNLUK : SONRA_GUNLUK;
}

// Vegawin stok bilgisi (Kemal'deki StokDO): kod → { toplam, fiyat, gizli }. Köprü yoksa {}.
export async function stokBilgisi(env, kodlar) {
  if (!env.STOK || !kodlar.length) return {};
  try {
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/toplu", { method: "POST", body: JSON.stringify({ kodlar }) });
    return await r.json();
  } catch {
    return {};
  }
}

export function listeAdaylari(bilgi, modeller, simdi, stok = {}) {
  return Object.keys(bilgi.kodlar)
    .filter((k) => !bilgi.silinenler[k] && !(bilgi.atlananlar[k] > simdi + 365 * 86400))
    .filter((k) => !(stok[k] && stok[k].gizli)) // stoğu bitmiş ya da "Sil" ile gizlenmiş: sorulmaz
    .filter((k) => {
      const m = modeller[k];
      if (!m) return true;
      return m.durum === "yok" && simdi - m.zaman > 30 * 86400; // "yok" denen 30 gün sonra tekrar sorulur
    })
    .map((k) => ({ kod: k, sec: modelSecenekleri(k, bilgi.kodlar, bilgi.kodsuz)[0] }))
    .filter((x) => x.sec)
    .sort((a, b) => b.sec.tarih - a.sec.tarih); // en yeni paylaşılan önce (mağazada olma ihtimali yüksek)
}

function soruKarti(env, bilgi, kod, sec, kisi) {
  return tg(env, "copyMessage", {
    chat_id: kisi, from_chat_id: bilgi.kanal.id, message_id: sec.ids[0],
    caption: `${kod} · son paylaşım ${tarihUzun(sec.tarih)}\nMağazada var mı?`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Mağazada var", callback_data: `sv:${kod}` }, { text: "❌ Yok", callback_data: `sy:${kod}` }]] },
  });
}

export async function listeAdimi(env, simdi) {
  if (!(await env.KAYIT.get("selin:rehberOnay"))) return; // rehber onaylanmadan başlamaz
  const s = saat(simdi);
  if (s < 9 || s >= 21) return;
  const gun = gunAnahtari(simdi);
  const hedef = await gunlukHedef(env, simdi);
  const sayac = Number((await env.KAYIT.get(`selin:liste:${gun}`)) || 0);
  if (sayac >= hedef) return;
  const bilgi = await kanalBilgisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const stok = await stokBilgisi(env, Object.keys(bilgi.kodlar));
  const adaylar = listeAdaylari(bilgi, modeller, simdi, stok).slice(0, Math.min(LISTE_PARTI, hedef - sayac));
  if (!adaylar.length) return;
  const hazirla = await oku(env, "selin:hazirla", []);
  for (const { kod } of adaylar) {
    if (stok[kod] && stok[kod].toplam > 0) {
      modeller[kod] = { durum: "hazirlaniyor", zaman: simdi, kim: "Vegawin (stokta)", mesajlar: [] };
      if (!hazirla.includes(kod)) hazirla.push(kod);
    } else modeller[kod] = { durum: "sorulacak", zaman: simdi, mesajlar: [] };
  }
  await yazKV(env, "selin:modeller", modeller);
  await yazKV(env, "selin:hazirla", hazirla);
  await env.KAYIT.put(`selin:liste:${gun}`, String(sayac + adaylar.length), { expirationTtl: 3 * 86400 });
}

// ---------- Özet: günde iki kez tek mesaj; ayrıntı isteyene gösterilir ----------

const OZET_SAATLERI = [11, 16];
const GOSTER_PARTI = 5;

// Kendiliğinden gönderilecek uyarılar tek tek mesaj olmaz; özete eklenir.
async function notEkle(env, metin) {
  const notlar = await oku(env, "selin:notlar", []);
  await yazKV(env, "selin:notlar", [...notlar, metin].slice(-30));
}

async function bekleyenler(env) {
  const modeller = await oku(env, "selin:modeller", {});
  const sorular = Object.keys(modeller).filter((k) => ["sorulacak", "soruldu"].includes(modeller[k].durum));
  const kartlar = Object.keys(modeller).filter((k) => modeller[k].durum === "onayda" && !modeller[k].toplu); // toplu olanlar tek listede
  const kareler = [];
  for (const kod of await oku(env, "selin:kareBekleyen", [])) {
    const k = await env.KAYIT.get(`kare:${kod}`, "json");
    if (k && k.durum === "onayda") kareler.push(kod);
  }
  return { modeller, sorular, kartlar, kareler };
}

export async function ozetAdimi(env, simdi) {
  const s = Math.floor(saat(simdi));
  if (!OZET_SAATLERI.includes(s)) return;
  const anahtar = `selin:ozet:${gunAnahtari(simdi)}:${s}`;
  if (await env.KAYIT.get(anahtar)) return;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 2 * 86400 });
  const { sorular, kartlar, kareler } = await bekleyenler(env);
  const notlar = await oku(env, "selin:notlar", []);
  if (!sorular.length && !kartlar.length && !kareler.length && !notlar.length) return;
  const satirlar = ["🌸 Selin — özet"];
  if (kartlar.length) satirlar.push(`• Siteye hazır taslak: ${kartlar.length} (onayınızı bekliyor)`);
  if (kareler.length) satirlar.push(`• Videodan kare seçilecek: ${kareler.length}`);
  if (sorular.length) satirlar.push(`• Vegawin'de olmayan, "mağazada var mı?" sorusu: ${sorular.length}`);
  if (notlar.length) satirlar.push("", "Notlar:", ...notlar.slice(-10).map((n) => `• ${n}`));
  satirlar.push("", "Görmek istediğinize basın; sadece size 5'er 5'er gelir. Kim önce karar verirse o geçerli.");
  const dugmeler = [
    ...(kartlar.length ? [{ text: `🖼 Taslaklar (${kartlar.length})`, callback_data: "sg:k" }] : []),
    ...(kareler.length ? [{ text: `🎞 Kareler (${kareler.length})`, callback_data: "sg:f" }] : []),
    ...(sorular.length ? [{ text: `❓ Sorular (${sorular.length})`, callback_data: "sg:s" }] : []),
  ];
  await herkese(env, satirlar.join("\n").slice(0, 4000), dugmeler.length ? { reply_markup: { inline_keyboard: [dugmeler] } } : {});
  await yazKV(env, "selin:notlar", []);
}

// "Göster" düğmesi: o türden bu kişiye henüz gösterilmemiş en fazla 5 öğe sadece ona gönderilir.
async function goster(env, cq, tur) {
  const kisi = String(cq.from.id);
  const { modeller, sorular, kartlar, kareler } = await bekleyenler(env);
  const gorduMu = (liste) => (liste || []).some(([k]) => String(k) === kisi);
  let gonderilen = 0;
  if (tur === "s") {
    const bilgi = await kanalBilgisi(env);
    for (const kod of sorular.filter((k) => !gorduMu(modeller[k].mesajlar)).slice(0, GOSTER_PARTI)) {
      const sec = modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz)[0];
      const r = sec ? await soruKarti(env, bilgi, kod, sec, kisi) : { ok: false };
      if (!r.ok) continue;
      modeller[kod] = { ...modeller[kod], durum: "soruldu", mesajlar: [...(modeller[kod].mesajlar || []), [kisi, r.result.message_id]] };
      gonderilen++;
    }
  } else if (tur === "k") {
    for (const kod of kartlar.filter((k) => !gorduMu(modeller[k].kart)).slice(0, GOSTER_PARTI)) if (await kartGoster(env, kod, kisi)) gonderilen++;
  } else if (tur === "f") {
    for (const kod of kareler.slice(0, 20)) {
      if (gonderilen >= GOSTER_PARTI) break;
      const k = await env.KAYIT.get(`kare:${kod}`, "json");
      if (gorduMu(k.kart)) continue;
      const r1 = k.adaylar.length > 1
        ? await tg(env, "sendMediaGroup", { chat_id: kisi, media: k.adaylar.map((a, i) => ({ type: "photo", media: a.file_id, ...(i === 0 ? { caption: `🎞 ${kod} — videodan seçilen kareler` } : {}) })) })
        : await tg(env, "sendPhoto", { chat_id: kisi, photo: k.adaylar[0].file_id, caption: `🎞 ${kod} — videodan seçilen kare` });
      const r = await tg(env, "sendMessage", { chat_id: kisi, text: kareKartMetni(kod, k.adaylar.length), reply_markup: kareKlavye(kod, k.adaylar.length) });
      if (!r1.ok || !r.ok) continue;
      await env.KAYIT.put(`kare:${kod}`, JSON.stringify({ ...k, kart: [...(k.kart || []), [kisi, r.result.message_id]] }));
      gonderilen++;
    }
  }
  if (tur === "s") await yazKV(env, "selin:modeller", modeller);
  const kalan = (tur === "s" ? sorular : tur === "k" ? kartlar : kareler).length - gonderilen;
  if (!gonderilen) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Gösterilecek yeni bir şey yok." });
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${gonderilen} gönderildi` });
  if (kalan > 0) await tg(env, "sendMessage", { chat_id: kisi, text: `Kalan: ${kalan}`, reply_markup: { inline_keyboard: [[{ text: "Sonraki 5", callback_data: `sg:${tur}` }]] } });
}

// ---------- 2) Hazırlık: pozlar, netlik, açıklama, bedenler ----------

async function hazirlaGuvenli(env, simdi) {
  try {
    await hazirlaAdimi(env, simdi);
  } catch (e) {
    await yazKV(env, "selin:hata", { zaman: simdi, hata: String(e && e.message).slice(0, 500) }, 7 * 86400);
  }
}

function enYakinBoyut(boyutlar, hedef) {
  const s = [...boyutlar].sort((a, b) => a.width - b.width);
  return s.find((p) => p.width >= hedef) || s[s.length - 1];
}

async function dosyaBayt(env, fileId) {
  const f = await tg(env, "getFile", { file_id: fileId });
  if (!f.ok) throw new Error(`getFile: ${f.description}`);
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Uint8Array(await r.arrayBuffer());
}
function b64Yap(b) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
async function dosyaB64(env, fileId) {
  return b64Yap(await dosyaBayt(env, fileId));
}

// "Dosya olarak" gönderilen (sıkıştırılmamış, büyük) fotoğraf: yapay zekâya ve siteye uygun boyuta
// küçültülür (Cloudflare Images, ücretsiz pakette ayda 5.000 işlem). Görsel aracı yoksa olduğu gibi.
async function belgeB64(env, fileId, genislik) {
  const bayt = await dosyaBayt(env, fileId);
  if (!env.IMAGES) return b64Yap(bayt);
  const sonuc = await env.IMAGES.input(new Blob([bayt]).stream()).transform({ width: genislik, fit: "scale-down" }).output({ format: "image/jpeg", quality: 88 });
  return b64Yap(new Uint8Array(await sonuc.response().arrayBuffer()));
}

// Fotoğraf kontrolü (28 Ekim, tek tek incelendi): kanalda bu koda yazılmış ama başka kıyafet/baskı
// gösteren mesajlar. Bunlar hiçbir zaman taslağa girmez.
export const HARIC_MESAJ = {
  "3618": [13457], // sarı-siyah çizgili korse üst + etek videosu (3618 ceket-pantolon)
  "3403": [10673], // eski görsel, baskı farklı
  "3407": [10646], // eski görsel, yaprak baskısı farklı
  "3429": [11083], // eski görsel, turuncu renk (model pembe)
};
// Kullanıcıya sorulan modeller: cevap gelene kadar taslak onaya/siteye gitmez.
export const FOTO_SORUSU = {
  "3322": "Bu kodla iki farklı kıyafet var: beyaz/siyah saçaklı ceket-pantolon (videolarında BLACK ROSE yazıyor) ve siyah dantel üst-etek (VOLONTE videosu). Hangisi 3322?",
  "3567": "Aynı korseli ceket-pantolon 3 renkte paylaşılmış: siyah, kırmızı, beyaz. Sitede hepsi mi görünsün, tek renk mi?",
};

// Modelin en yeni paylaşımlarındaki bütün medya (arşiv kanalına iletilerek okunur; aynı fotoğraf tekrarsız).
export async function medyaTopla(env, bilgi, kod) {
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv) throw new Error("arşiv kanalı yok");
  const fotolar = [];
  const videolar = [];
  const yazilar = [];
  const gorulen = new Set();
  const hatalar = [];
  let iletilen = 0;
  for (const sec of modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz, PAYLASIM_EN_FAZLA)) {
    for (const id of sec.ids) {
      if ((HARIC_MESAJ[kod] || []).includes(id)) continue;
      if (iletilen >= ILETME_EN_FAZLA || fotolar.length >= POZ_EN_FAZLA) break;
      iletilen++;
      const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: bilgi.kanal.id, message_id: id, disable_notification: true });
      if (!r.ok) {
        hatalar.push(`${id}: ${r.description || "?"}`);
        continue;
      }
      const m = r.result;
      if (m.caption) yazilar.push(m.caption);
      if (m.photo) {
        const buyuk = m.photo[m.photo.length - 1];
        if (gorulen.has(buyuk.file_unique_id)) continue;
        gorulen.add(buyuk.file_unique_id);
        if (fotolar.length < POZ_EN_FAZLA) fotolar.push({ id, buyuk, orta: enYakinBoyut(m.photo, 800), tarih: sec.tarih });
      } else if (m.document && /^image\//.test(m.document.mime_type || "") && !gorulen.has(m.document.file_unique_id)) {
        // "Dosya olarak" gönderilmiş fotoğraf: sıkıştırılmamış, en net kaynak (20 MB'a kadar).
        gorulen.add(m.document.file_unique_id);
        if ((m.document.file_size || 0) <= 20 * 1024 * 1024 && fotolar.length < POZ_EN_FAZLA) {
          fotolar.push({ id, buyuk: { file_id: m.document.file_id, width: 4000, height: 4000, belge: true }, orta: null, tarih: sec.tarih });
        }
      } else if (m.video && !gorulen.has(m.video.file_unique_id)) {
        gorulen.add(m.video.file_unique_id);
        videolar.push({ id, sure: m.video.duration, file_id: m.video.file_id, boyut: m.video.file_size || 0, w: m.video.width || 0 });
      }
    }
  }
  return { fotolar, videolar, yazilar, hatalar };
}

async function aciklamaYaz(env, { kod, fotolar, tarif, yazilar, duzeltme, onceki }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const content = [];
  for (const [i, f] of fotolar.entries()) content.push({ type: "text", text: `Poz ${i + 1}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.b64 } });
  content.push({
    type: "text",
    text: `${REHBER}

VOLONTE modeli ${kod} için site metni hazırla.
Katalog tarifi: ${tarif || "yok"}
Kanal alt yazıları: ${yazilar.slice(0, 3).join(" | ").slice(0, 1200) || "yok"}
${onceki ? `Önceki taslak: ${JSON.stringify(onceki)}` : ""}
${duzeltme ? `Sahibin düzeltme isteği (uygula): ${duzeltme}` : ""}
Her poz için net mi (bulanık/odak dışı/çok karanlık değil mi) değerlendir; ürün görünmüyorsa da net=false.
Aynı fotoğrafın tekrarı (aynı kare/aynı poz, yeniden yüklenmiş ya da biraz farklı kaydedilmiş) varsa ilkini bırak, sonrakileri net=false ve not="tekrar" yap.
kategori: katalog tarifine ve fotoğraflara bakarak tek birini seç: ${KATEGORILER.map((k) => `${k} (${KATEGORI_ADI[k]})`).join(", ")}. Gece/özel gün elbisesi evening; iki ya da üç parça uyumlu set sets; tek parça üst-alt birleşik jumpsuits.`,
  });
  const r = await client.beta.messages.create({
    model, max_tokens: 3000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            baslik: { type: "string" },
            kategori: { type: "string", enum: KATEGORILER },
            aciklama: { type: "object", properties: { en: { type: "string" }, fr: { type: "string" }, pt: { type: "string" }, tr: { type: "string" } }, required: ["en", "fr", "pt", "tr"], additionalProperties: false },
            pozlar: { type: "array", items: { type: "object", properties: { poz: { type: "integer" }, net: { type: "boolean" }, not: { type: "string" } }, required: ["poz", "net", "not"], additionalProperties: false } },
          },
          required: ["baslik", "kategori", "aciklama", "pozlar"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content }],
  });
  await harcamaEkle(env, model, r.usage);
  if (r.stop_reason === "refusal") throw new Error("model isteği reddetti");
  return JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export function bedenBul(yazilar) {
  for (const y of yazilar) {
    const b = eskiBilgiler(y).beden;
    if (b) {
      const sayilar = b.match(/\d{2}/g);
      if (sayilar && sayilar.length >= 2) return [...new Set(sayilar)].join("-");
      const harf = b.match(/\b(XS|S|M|L|XL|XXL|3XL|4XL)\b/gi);
      if (harf) return harf.map((x) => x.toUpperCase()).join("-");
    }
  }
  return null;
}

export async function hazirlaAdimi(env, simdi) {
  if (!env.ANTHROPIC_API_KEY || !env.BOT_TOKEN || (await sinirAsildiMi(env, simdi))) return;
  const sira = await oku(env, "selin:hazirla", []);
  if (!sira.length) return;
  const kod = sira[0];
  await yazKV(env, "selin:hazirla", sira.slice(1));
  await taslakHazirla(env, kod, simdi, null);
}

async function taslakHazirla(env, kod, simdi, duzeltme) {
  const bilgi = await kanalBilgisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const onceki = modeller[kod] && modeller[kod].taslak;
  let fotolar;
  let videolar;
  let yazilar;
  let hatalar = [];
  if (onceki && duzeltme) {
    ({ videolar, yazilar } = onceki);
    fotolar = onceki.fotolar.filter((f) => f.net);
  } else {
    ({ fotolar, videolar, yazilar, hatalar } = await medyaTopla(env, bilgi, kod));
  }
  // Kanal mesajları okunamadıysa (Telegram hatası) model kaybolmasın: sıranın sonuna, en fazla 3 deneme.
  if (!fotolar.length && !videolar.length && hatalar.length) {
    const deneme = ((modeller[kod] && modeller[kod].deneme) || 0) + 1;
    await yazKV(env, "selin:hata", { zaman: simdi, hata: `medya okunamadı ${kod} (deneme ${deneme}): ${hatalar.slice(0, 3).join(" | ")}` }, 7 * 86400);
    if (deneme < 3) {
      modeller[kod] = { ...(modeller[kod] || {}), durum: "hazirlaniyor", zaman: simdi, deneme };
      await yazKV(env, "selin:modeller", modeller);
      await yazKV(env, "selin:hazirla", [...(await oku(env, "selin:hazirla", [])).filter((k) => k !== kod), kod]);
      return;
    }
    modeller[kod] = { ...(modeller[kod] || {}), durum: "eklenmeyecek", zaman: simdi, not: "okunamadı", deneme };
    await yazKV(env, "selin:modeller", modeller);
    return notEkle(env, `${kod}: kanal paylaşımları okunamadı (${hatalar[0]}).`);
  }
  // Sadece videosu olan model: onaylı kare varsa o kullanılır; yoksa videodan kare istenir.
  if (!fotolar.length) {
    const kare = await oku(env, `kare:${kod}`, null);
    if (kare && kare.durum === "onayli") {
      fotolar = [{ id: null, buyuk: { file_id: kare.file_id, width: kare.w, height: kare.h }, orta: null, tarih: simdi, kare: true }];
    } else if (videolar.length) {
      let k = { durum: "hata" };
      try {
        k = await kareIste(env, kod, simdi, videolar);
      } catch (e) {
        // Geçici hata (GitHub vb.): model kaybolmasın, kare sırasından yeniden denenir.
        await yazKV(env, "selin:hata", { zaman: simdi, hata: `kare isteği ${kod}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400);
        const sira = await oku(env, "selin:kareSira", []);
        if (!sira.includes(kod)) await yazKV(env, "selin:kareSira", [...sira, kod]);
        k = { durum: "isleniyor" };
      }
      if (k.durum === "isleniyor" || k.durum === "onayda") {
        modeller[kod] = { ...(modeller[kod] || {}), durum: "kare-bekliyor", zaman: simdi };
        await yazKV(env, "selin:modeller", modeller);
        if (k.yeni) await notEkle(env, `${kod}: sadece videosu var; videodan kare çıkarılıyor.`);
        return;
      }
    }
  }
  if (!fotolar.length) {
    modeller[kod] = { ...(modeller[kod] || {}), durum: "eklenmeyecek", zaman: simdi, not: "fotoğraf yok" };
    await yazKV(env, "selin:modeller", modeller);
    return notEkle(env, `${kod}: kanalda ne fotoğrafı ne videosu bulundu; siteye hazırlanamadı.`);
  }
  for (const f of fotolar) f.b64 = f.buyuk.belge ? await belgeB64(env, f.buyuk.file_id, 1024) : await dosyaB64(env, (f.orta || f.buyuk).file_id);
  const ai = await aciklamaYaz(env, { kod, fotolar, tarif: bilgi.tarifler[kod] && bilgi.tarifler[kod].t, yazilar, duzeltme, onceki: onceki && { baslik: onceki.baslik, aciklama: onceki.aciklama } });
  const netlik = new Map((ai.pozlar || []).map((p) => [p.poz, p]));
  const pozlar = fotolar.map((f, i) => {
    const n = netlik.get(i + 1);
    const dusuk = Math.max(f.buyuk.width, f.buyuk.height) < DUSUK_COZUNURLUK;
    return { id: f.id, buyuk: f.buyuk, orta: f.orta, net: (!n || n.net) && !dusuk, not: dusuk ? "düşük çözünürlük" : n && !n.net ? n.not || "bulanık" : "" };
  });
  // Beden: alt yazıdan öneri (Küçük/Büyük/İkisi de); karttaki 📏 düğmesiyle değişir.
  const oneri = yazilar.map(bedenOnerisi).find(Boolean) || null;
  const bedenGrubu = onceki ? onceki.bedenGrubu ?? null : oneri;
  const taslak = {
    baslik: ai.baslik, kategori: ai.kategori, aciklama: ai.aciklama,
    bedenGrubu, bedenOneri: oneri,
    bedenler: onceki ? onceki.bedenler : bedenGrubu ? BEDEN_GRUPLARI[bedenGrubu].bedenler : null,
    fotolar: pozlar, videolar, yazilar: yazilar.slice(0, 3),
    fiyat: ((await stokBilgisi(env, [kod]))[kod] || {}).fiyat ?? null, // Vegawin satış fiyatı ($)
  };
  modeller[kod] = { ...(modeller[kod] || {}), durum: "onayda", zaman: simdi, taslak };
  await yazKV(env, "selin:modeller", modeller);
  await onayKartiGonder(env, kod);
}

// Tek bir taslak kartını bir kişiye gösterir (özetten ya da Düzelt sonrası).
async function kartGoster(env, kod, kisi) {
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  if (!m || m.durum !== "onayda") return false;
  const t = m.taslak;
  const kanal = await oku(env, "kanal", null);
  const netler = t.fotolar.filter((f) => f.net);
  // Albüm aynı türden olmalı: normal fotoğraflar bir albüm, "dosya olarak" gelenler ayrı albüm.
  for (const [tur, liste] of [["photo", netler.filter((f) => !f.buyuk.belge)], ["document", netler.filter((f) => f.buyuk.belge)]]) {
    if (liste.length > 1) await tg(env, "sendMediaGroup", { chat_id: kisi, media: liste.slice(0, 10).map((f) => ({ type: tur, media: f.buyuk.file_id })) });
    else if (liste.length === 1) await tg(env, tur === "photo" ? "sendPhoto" : "sendDocument", { chat_id: kisi, [tur]: liste[0].buyuk.file_id });
  }
  if (t.kaynak === "ozel") for (const v of t.videolar) await tg(env, v.belge ? "sendDocument" : "sendVideo", { chat_id: kisi, [v.belge ? "document" : "video"]: v.file_id });
  const r = await tg(env, "sendMessage", { chat_id: kisi, text: kartMetni(kod, t, kanal && kanal.kullanici), disable_web_page_preview: true, reply_markup: kartKlavye(kod, t) });
  if (!r.ok) return false;
  const guncel = await oku(env, "selin:modeller", {});
  guncel[kod] = { ...guncel[kod], kart: [...(guncel[kod].kart || []), [String(kisi), r.result.message_id]] };
  await yazKV(env, "selin:modeller", guncel);
  return true;
}

function kartMetni(kod, t, kanalAdi) {
  const netler = t.fotolar.filter((f) => f.net);
  const atilan = t.fotolar.filter((f) => !f.net);
  const grup = BEDEN_GRUPLARI[t.bedenGrubu];
  const beden = grup ? `${t.bedenler} — ${grup.ad}${t.bedenGrubu === t.bedenOneri ? " (alt yazıdan öneri)" : ""}`
    : t.bedenler || "SEÇİLMEDİ — 📏 düğmesiyle seçin";
  return [
    `🌸 ${kod} — siteye hazır taslak`,
    `Başlık: ${t.baslik}`,
    `Kategori: ${KATEGORI_ADI[t.kategori] || t.kategori} (yanlışsa ✏️ Düzelt → "kategori: takım" yazın)`,
    `Bedenler: ${beden}`,
    `Fiyat: ${t.fiyat != null ? `${t.fiyat} $ (Vegawin)` : "Vegawin'de yok"}${t.kaynak === "ozel" ? ` · Stok: ${t.stok != null ? `${t.stok} adet` : "—"}` : ""}`,
    `Pozlar: ${netler.length} net${atilan.length ? `; konmayacak ${atilan.length}: ${atilan.map((f) => `${t.kaynak === "ozel" ? `poz ${f.id}` : kanalAdi ? `t.me/${kanalAdi}/${f.id}` : f.id} (${f.not})`).join(", ")}` : ""}`,
    `Videolar: ${t.videolar.length ? `${t.videolar.length}${t.kaynak === "ozel" ? " (sitenin kendi oynatıcısında, yazısız)" : " (sitede Telegram oynatıcısıyla)"}` : "yok"}`,
    "",
    `EN: ${t.aciklama.en}`,
    "",
    `TR (kontrol için): ${t.aciklama.tr}`,
  ].join("\n").slice(0, 4000);
}

function kartKlavye(kod, t) {
  return { inline_keyboard: [
    Object.entries(BEDEN_GRUPLARI).map(([k, g]) => ({ text: `${t.bedenGrubu === k ? "✓ " : ""}📏 ${g.ad}`, callback_data: `sb:${kod}:${k}` })),
    [{ text: "✅ Onayla, siteye yükle", callback_data: `so:${kod}` }],
    [{ text: "✏️ Düzelt", callback_data: `sd:${kod}` }, { text: "❌ Ekleme", callback_data: `sx:${kod}` }],
  ] };
}

// Taslak kendiliğinden gönderilmez (mesaj az olsun): özetteki "Taslaklar" ile isteyene gösterilir.
// Düzelt sonrası yeni taslak, önceki kartı görmüş kişilere yeniden gösterilsin diye kart listesi sıfırlanır.
async function onayKartiGonder(env, kod) {
  const modeller = await oku(env, "selin:modeller", {});
  if (modeller[kod]) {
    modeller[kod].kart = [];
    await yazKV(env, "selin:modeller", modeller);
  }
}

// ---------- 3) Siteye yükleme (GitHub, tek commit) ----------

export const ghGecici = (e) => /GitHub (500|502|503|504)\b/.test(String((e && e.message) || e));
async function gh(env, yol, secenek = {}, deneme = 0) {
  try { return await ghTek(env, yol, secenek); } catch (e) {
    if (!ghGecici(e) || deneme >= 2 || env.GH_BEKLEME === 0) throw e;
    await new Promise((r) => setTimeout(r, deneme ? 3000 : 1000)); // GitHub blob/ağaç/commit aynı içerikle tekrar yazılabilir (zararsız)
    return gh(env, yol, secenek, deneme + 1);
  }
}
async function ghTek(env, yol, secenek = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${yol}`, {
    ...secenek,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "volonte-selin", "x-github-api-version": "2022-11-28", ...(secenek.body ? { "content-type": "application/json" } : {}) },
  });
  const govde = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${govde.message || ""}`);
  return govde;
}

// Bir kerelik: "fotoğraf yok" denip kalan modeller (okuma hatası olabilir) yeniden hazırlığa alınır;
// fotoğraf yine yoksa videodan kare yoluna girer. Kullanıcının saydığı 5 model önce.
async function fotografYokGocu(env, simdi) {
  try {
    if (await env.KAYIT.get("selin:goc:fotografyok")) return;
    const modeller = await oku(env, "selin:modeller", {});
    const once = ["3522", "3630", "3569", "3275", "3576"];
    const yok = Object.keys(modeller).filter((k) => modeller[k].not === "fotoğraf yok");
    const sira = [...once.filter((k) => yok.includes(k)), ...yok.filter((k) => !once.includes(k))];
    for (const k of sira) {
      const { not, deneme, ...kalan } = modeller[k];
      modeller[k] = { ...kalan, durum: "hazirlaniyor", zaman: simdi };
    }
    if (sira.length) {
      await yazKV(env, "selin:modeller", modeller);
      await yazKV(env, "selin:hazirla", [...sira, ...(await oku(env, "selin:hazirla", [])).filter((k) => !sira.includes(k))]);
    }
    await env.KAYIT.put("selin:goc:fotografyok", String(sira.length));
  } catch (e) {
    // KV günlük yazma sınırı dolduysa sonraki gün kendiliğinden tekrar dener.
  }
}

// GitHub anahtarının çalıştığını saatte bir dener (okuma, yazma, Actions); sonuç "selin:github".
// Yazma denemesi depoya bağlanmayan boş bir parça (blob) oluşturur; siteye ve dosyalara dokunmaz.
export async function githubKontrol(env, simdi) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || (await env.KAYIT.get("selin:github"))) return;
  const dene = async (yol, secenek) => { try { await gh(env, yol, secenek); return true; } catch (e) { return e.message; } };
  const sonuc = {
    zaman: simdi,
    okuma: await dene(""),
    yazma: await dene("/git/blobs", { method: "POST", body: JSON.stringify({ content: "selin-kontrol", encoding: "utf-8" }) }),
    actions: await dene("/actions/workflows"),
  };
  await yazKV(env, "selin:github", sonuc, 6 * 3600); // KV'de (izleme); 6 saatte bir
}

async function siteVerisi(env) {
  try {
    const d = await gh(env, "/contents/veri/urunler.json?ref=main");
    return { liste: JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, ""))))), sha: d.sha };
  } catch (e) {
    if (/404/.test(e.message)) return { liste: [], sha: null };
    throw e;
  }
}

const b64Metin = (s) => btoa(unescape(encodeURIComponent(s)));

// dosyalar: [{ yol, b64 }] (null b64 = sil) + yeni ürün listesi → tek commit
// 4 Kasım (Patron): FİYAT açık depoya YAZILMAZ (depo herkese açık); fiyatın tek kaynağı Vegawin (Sami'nin deposu, gizli).
export const fiyatsiz = (liste) => (liste || []).map(({ fiyat, ...u }) => u);
export async function siteyeYaz(env, dosyalar, liste, mesaj) {
  if (await durdurulduMu(env, "selin")) throw new Error(await durMesaji(env, "selin"));
  liste = fiyatsiz(liste);
  // 6 Kasım (Patron): VENOM KONTROLÜ — aynı fotoğraf/video iki kez konmaz, kolaj konmaz, açıklamada fiyat varsa site yazılmaz
  const k = siteKontrol(liste, dosyalar);
  if (!k.ok) { await engelKaydet(env, "selin", "site", k.sorunlar); throw new Error(`Venom kontrolü: ${k.sorunlar.join("; ")}`); }
  if (k.notlar.length) { liste = k.liste; dosyalar = k.dosyalar; const l = (await env.KAYIT.get("venom:kontrol:site", "json").catch(() => null)) || []; await env.KAYIT.put("venom:kontrol:site", JSON.stringify([...l, { zaman: Math.floor(Date.now() / 1000), notlar: k.notlar }].slice(-30)), { expirationTtl: 7 * 86400 }).catch(() => null); }
  const ref = await gh(env, "/git/ref/heads/main");
  const sonCommit = await gh(env, `/git/commits/${ref.object.sha}`);
  const agac = [];
  for (const d of dosyalar) {
    if (d.b64 === null) agac.push({ path: d.yol, mode: "100644", type: "blob", sha: null });
    else {
      const blob = await gh(env, "/git/blobs", { method: "POST", body: JSON.stringify({ content: d.b64, encoding: "base64" }) });
      agac.push({ path: d.yol, mode: "100644", type: "blob", sha: blob.sha });
    }
  }
  agac.push({ path: "veri/urunler.json", mode: "100644", type: "blob", content: JSON.stringify(liste, null, 1) + "\n" });
  const yeniAgac = await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: sonCommit.tree.sha, tree: agac }) });
  const commit = await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message: mesaj, tree: yeniAgac.sha, parents: [ref.object.sha] }) });
  await gh(env, "/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  try { await siteDefteriYenile(env, Math.floor(Date.now() / 1000), { liste }); } catch { /* gece yeniden sayılır */ } // 6 Kasım: defter anında
  await defterIs(env, "selin", `site: ${String(mesaj).replace(/^Selin: /, "").slice(0, 160)}`); // 9 Kasım: iş defteri
  return commit.sha;
}

// Saatte bir (09–20): sitedeki modellerin fiyatı ve görünürlüğü Vegawin'e göre güncellenir.
// Stoğu biten model sitede gizlenir (veri ve fotoğraflar silinmez), stok gelince geri görünür.
// Değişiklik yoksa GitHub'a hiçbir şey yazılmaz.
export async function siteStokEsitle(env, simdi) {
  const s = saat(simdi);
  if (s < 9 || s >= 20 || !env.STOK || !env.GITHUB_TOKEN) return;
  const anahtar = `selin:siteStok:${gunAnahtari(simdi)}:${Math.floor(s)}`;
  if (await env.KAYIT.get(anahtar)) return;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 2 * 86400 });
  const { liste } = await siteVerisi(env);
  if (!liste.length) return;
  const stok = await stokBilgisi(env, liste.map((u) => u.kod));
  const degisen = [];
  const yeni = liste.map((u) => {
    const st = stok[u.kod];
    if (!st) return u; // Vegawin'de yok: dokunulmaz
    const gizli = Boolean(st.gizli);
    if (gizli === Boolean(u.gizli) && !("fiyat" in u)) return u;
    degisen.push(`${u.kod}${gizli !== Boolean(u.gizli) ? (gizli ? " gizlendi" : " yeniden görünür") : " (fiyat alanı kaldırıldı)"}`);
    const { fiyat, ...temiz } = u; // fiyat açık depoya yazılmaz (4 Kasım)
    return { ...temiz, gizli };
  });
  if (!degisen.length) return;
  await siteyeYaz(env, [], yeni, `Selin: Vegawin stok güncellemesi (${degisen.length} model)`);
  await notEkle(env, `Site güncellendi (Vegawin): ${degisen.slice(0, 10).join(", ")}${degisen.length > 10 ? " …" : ""}`);
}

async function sha256(metin) {
  const ozet = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function siteyeYukle(env, kod, kim, simdi) {
  if (kilitli(env) && !ozelMi((await oku(env, "selin:modeller", {}))[kod])) throw new Error("siteye yükleme kilitli");
  const modeller = await oku(env, "selin:modeller", {});
  const t = modeller[kod] && modeller[kod].taslak;
  const bilgi = await kanalBilgisi(env);
  const netler = t.fotolar.filter((f) => f.net);
  const dosyalar = [];
  // Aynı fotoğraf kanalda farklı paylaşımlarda yeniden yüklenmiş olabilir (dosya kimliği farklı,
  // içerik aynı): içerik aynıysa bir kez konur.
  const gorulen = new Set();
  for (const f of netler) {
    const b64 = f.buyuk.belge ? await belgeB64(env, f.buyuk.file_id, 2048) : await dosyaB64(env, f.buyuk.file_id);
    const iz = await sha256(b64);
    if (gorulen.has(iz)) continue;
    gorulen.add(iz);
    dosyalar.push({ yol: `galeri/${kod}/${dosyalar.length + 1}.jpg`, b64 });
  }
  const { liste } = await siteVerisi(env);
  const st = (await stokBilgisi(env, [kod]))[kod];
  const urun = {
    kod, baslik: t.baslik, kategori: t.kategori, aciklama: { en: t.aciklama.en, fr: t.aciklama.fr, pt: t.aciklama.pt },
    bedenler: t.bedenler, fotolar: dosyalar.map((d) => d.yol),
    videolar: t.kaynak === "ozel" ? t.videolar.filter((v) => !(v.boyut > VIDEO_SINIR)).map((v) => `selin/${kod}/${v.id}`) : t.videolar.map((v) => `${bilgi.kanal.kullanici}/${v.id}`),
    gizli: Boolean(st && st.gizli),        // stoğu bitince sitede görünmez (kayıt silinmez)
    eklenme: gunAnahtari(simdi),
  };
  // 5 Kasım (3627 bordo sitede kayboldu): yeniden onayda sitedeki PELİN fotoğrafları ve PELİN videoları korunur
  const eski = liste.find((u) => u.kod === kod);
  if (eski) {
    const pf = (eski.fotolar || []).filter((f) => /\/pelin-[^/]+\.jpg$/.test(f) && !urun.fotolar.includes(f));
    const pv = (eski.videolar || []).filter((v) => new RegExp(`^selin/${kod}/1\\d\\d+$`).test(v) && !urun.videolar.includes(v));
    if (pf.length) urun.fotolar.splice(Math.min(1, urun.fotolar.length), 0, ...pf);
    if (pv.length) urun.videolar = [...pv, ...urun.videolar];
    if ((eski.renkler || []).length) { const r = renkleriUygula({ ...urun, renkler: [] }, eski.renkler); if (r.degisti) Object.assign(urun, { renkler: r.urun.renkler, aciklama: r.urun.aciklama }); }
  }
  const yeniListe = [urun, ...liste.filter((u) => u.kod !== kod)];
  await siteyeYaz(env, dosyalar, yeniListe, `Selin: ${kod} siteye eklendi (onaylayan: ${kim})`);
  modeller[kod] = { ...modeller[kod], durum: "sitede", zaman: simdi, onaylayan: kim };
  await yazKV(env, "selin:modeller", modeller);
  return `${env.SITE_URL}/#model/${encodeURIComponent(kod)}`;
}

// ---------- 6 Kasım (Patron): GitHub 500/502 → vazgeçme; 10 dk ve 30 dk sonra kendiliğinden tekrar ----------
// Kuyruk "selin:ghTekrar" = [{ id, tur: "onay"|"pelinSite", kod, kim, chat, kartlar, x, asama: 0|1, zaman (ilk hata), sonraki }]
// Başarınca onaylayana "✅ yüklendi"; iki tekrar da olmazsa TEK uyarı + KV "venom:selinGithub" (Venom akşam raporu).
export const GH_TEKRAR_DK = [10, 30];
export async function ghTekrarEkle(env, is, simdi) {
  const l = await oku(env, "selin:ghTekrar", []);
  const id = `${is.tur}:${is.kod}`;
  if (l.some((y) => y.id === id)) return false; // aynı iş zaten bekliyor
  await yazKV(env, "selin:ghTekrar", [...l, { ...is, id, asama: 0, zaman: simdi, sonraki: simdi + GH_TEKRAR_DK[0] * 60 }], 2 * 86400);
  return true;
}
async function ghKayit(env, kayit) {
  const l = (await env.KAYIT.get("venom:selinGithub", "json").catch(() => null)) || [];
  await env.KAYIT.put("venom:selinGithub", JSON.stringify([...l, kayit].slice(-30)), { expirationTtl: 7 * 86400 }).catch(() => null);
}
export async function ghTekrarAdimi(env, simdi) {
  const l = await oku(env, "selin:ghTekrar", []);
  const vakti = l.filter((y) => y.sonraki <= simdi);
  if (!vakti.length) return;
  const kalan = l.filter((y) => y.sonraki > simdi);
  for (const y of vakti) {
    const dk = GH_TEKRAR_DK[y.asama];
    try {
      if (y.tur === "onay") {
        const m = (await oku(env, "selin:modeller", {}))[y.kod];
        if (m && m.durum === "sitede" && (m.zaman || 0) > y.zaman) continue; // bu arada elle yüklenmiş
        const link = await siteyeYukle(env, y.kod, y.kim, simdi);
        try { await yeniModelBildir(env, y.kod, y.kim, simdi); } catch { /* site yine tamam */ }
        for (const [k, id] of y.kartlar || []) await tg(env, "editMessageText", { chat_id: k, message_id: id, text: `✅ ${y.kod} siteye eklendi (${y.kim}). Sayfa 1–2 dakikada yayında:\n${link}`, disable_web_page_preview: true }).catch(() => null);
        if (y.chat) await tg(env, "sendMessage", { chat_id: y.chat, text: `✅ ${y.kod} yüklendi — GitHub hatası geçti, ${dk} dk sonra kendim tekrar denedim.\n${link}`, disable_web_page_preview: true }).catch(() => null);
      } else if (y.tur === "pelinSite") {
        await pelinSiteIsle(env, [{ ...y.x, deneme: 99, ghTekrar: true }], simdi, { firlat: true });
      }
      await ghKayit(env, { zaman: simdi, kod: y.kod, tur: y.tur, durum: "yuklendi", dk, hata: y.hata });
    } catch (e) {
      const hata = String((e && e.message) || e).slice(0, 160);
      if (ghGecici(e) && y.asama + 1 < GH_TEKRAR_DK.length) { kalan.push({ ...y, asama: y.asama + 1, hata, sonraki: y.zaman + GH_TEKRAR_DK[y.asama + 1] * 60 }); continue; }
      const metin = `⚠️ ${y.kod} siteye yüklenemedi: GitHub hâlâ hata veriyor (${hata}). 10 ve 30 dk sonra tekrar denedim, olmadı.${y.tur === "onay" ? " Taslak duruyor; sonra tekrar onaylayabilirsiniz." : ""}`;
      if (y.chat) await tg(env, "sendMessage", { chat_id: y.chat, text: metin }).catch(() => null);
      else for (const k of await sahipler(env)) await tg(env, "sendMessage", { chat_id: k, text: metin }).catch(() => null);
      await ghKayit(env, { zaman: simdi, kod: y.kod, tur: y.tur, durum: "yuklenemedi", hata });
    }
  }
  await yazKV(env, "selin:ghTekrar", kalan, 2 * 86400);
}

// Kemal'e haber (kullanıcı kararı 31 Ekim): siteye yeni eklenen model sıra beklemeden "🆕 YENİ MODEL" önizlemesiyle
// SADECE Patron'a gider; ✅ ile hemen kanala (günlük 10'a sayılmaz). Kuyruk ortak KV'de: "venom:yeniModel".
async function yeniModelBildir(env, kod, kim, simdi) {
  const s = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
  if (!s.some((x) => x.kod === kod)) s.push({ kod, kim, zaman: simdi });
  await env.KAYIT.put("venom:yeniModel", JSON.stringify(s.slice(-30)));
}

async function sitedenKaldir(env, kod, kim, simdi) {
  const { liste } = await siteVerisi(env);
  const urun = liste.find((u) => u.kod === kod);
  if (!urun) return false;
  // 2 Kasım ("Sil" kuralı): kayıt saklanır ve fotoğraf dosyaları depoda kalır → "/geri <kod>" ile siteye aynen geri konabilir
  await yazKV(env, `selin:silinen:${kod}`, { urun, kim, zaman: simdi });
  await siteyeYaz(env, [], liste.filter((u) => u.kod !== kod), `Selin: ${kod} siteden kaldırıldı (${kim})`);
  const modeller = await oku(env, "selin:modeller", {});
  modeller[kod] = { ...(modeller[kod] || {}), durum: "kaldirildi", zaman: simdi };
  await yazKV(env, "selin:modeller", modeller);
  return true;
}

// ---------- Site video oynatıcısı ----------
// Ürün sayfasında video Telegram gönderisi (kanal adı, izlenme, tarih, alt yazı) yerine sitenin kendi
// <video> oynatıcısında, yazısız gösterilir. Video siteye yüklenmez: Selin her istekte Telegram'dan
// akıtır (ücretsiz). Sadece sitedeki ürünlerin videoları verilir; Telegram botları 20 MB'tan büyük
// dosyayı indiremez (o video sitede gösterilmez).
async function siteVideoIdleri(env, simdi) {
  const kayit = await oku(env, "selin:siteVideolar", null);
  if (kayit && simdi - kayit.zaman < 600) return kayit.ids;
  const ids = (await siteVerisi(env)).liste.flatMap((u) => (u.videolar || []).map((v) => String(v).split("/").pop()));
  await yazKV(env, "selin:siteVideolar", { zaman: simdi, ids });
  return ids;
}

export async function siteVideo(env, id, aralik) {
  const simdi = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(String(id || ""))) return new Response("yok", { status: 404 });
  let v = await oku(env, `selin:vid:${id}`, null);
  if (!v) {
    if (!(await siteVideoIdleri(env, simdi)).includes(String(id))) return new Response("yok", { status: 404 });
    const arsiv = await oku(env, "arsiv", null);
    const kanal = await oku(env, "kanal", null);
    const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: Number(id), disable_notification: true });
    const m = r.ok && (r.result.video || r.result.animation);
    if (!m) return new Response("video değil", { status: 404 });
    v = { file_id: m.file_id, boyut: m.file_size || 0, w: m.width || 0, h: m.height || 0, uid: m.file_unique_id || null };
    await yazKV(env, `selin:vid:${id}`, v);
  }
  if (v.boyut > VIDEO_SINIR) return new Response("büyük", { status: 413 });
  // Telegram dosya bağlantısı yaklaşık 1 saat geçerli: 50 dakika saklanır.
  if (!v.yol || simdi - v.yolZaman > 3000) {
    const f = await tg(env, "getFile", { file_id: v.file_id });
    if (!f.ok) return new Response("indirilemedi", { status: 502 });
    v = { ...v, yol: f.result.file_path, yolZaman: simdi };
    await yazKV(env, `selin:vid:${id}`, v);
  }
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${v.yol}`, aralik ? { headers: { Range: aralik } } : {});
  const h = new Headers({ "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });
  for (const k of ["content-length", "content-range"]) if (r.headers.get(k)) h.set(k, r.headers.get(k));
  return new Response(r.body, { status: r.status, headers: h });
}

// ---------- Toplu liste önizlemesi (kullanıcı isteği, 28 Ekim) ----------
// Tek link: toplu listedeki modeller siteye nasıl girecekse öyle (sitenin kendi tasarımı, fotoğraflar,
// video oynatıcı, fiyat, bedenler). Sadece bakmak içindir: siteye hiçbir şey yazmaz; onay yine
// Telegram'daki "✅ Hepsini siteye yükle" düğmesiyle. Link gizli anahtarlıdır (yalnız ekibe gider).
const htmlKacir = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const onizlemeAnahtari = async (env) => (await sha256(`${env.WEBHOOK_SECRET}:onizleme`)).slice(0, 24);
export const onizlemeLinki = async (env) => `${env.SELF_URL}/onizleme/${await onizlemeAnahtari(env)}`;

// "Onay bekleyen" sayıları ayrı ayrı: toplu listedekiler, tek tek gelen taslaklar, videodan kare bekleyenler.
async function onayDokumu(env) {
  const { modeller, kartlar, kareler } = await bekleyenler(env);
  const t = await oku(env, "selin:toplu", null);
  const toplu = t ? t.kodlar : [];
  const hazir = toplu.filter((k) => modeller[k] && modeller[k].durum === "onayda");
  const hazirlaniyor = toplu.filter((k) => modeller[k] && modeller[k].durum === "hazirlaniyor");
  const soru = toplu.filter((k) => modeller[k] && modeller[k].durum === "foto-soru");
  const olmayan = toplu.filter((k) => !hazir.includes(k) && !hazirlaniyor.includes(k) && !soru.includes(k));
  return { modeller, t, toplu, hazir, hazirlaniyor, soru, olmayan, kartlar, kareler };
}

// Bir kez: kayıtlı taslaklardan hatalı mesajları çıkar; sorulan modelleri beklet (kayıt silinmez).
export async function fotoDuzeltmeGocu(env) {
  if ((await env.KAYIT.get("selin:fotoDuzeltme")) === "f1") return;
  const modeller = await oku(env, "selin:modeller", {});
  for (const [kod, idler] of Object.entries(HARIC_MESAJ)) {
    const t = modeller[kod] && modeller[kod].taslak;
    if (!t) continue;
    t.fotolar = t.fotolar.filter((f) => !idler.includes(f.id));
    t.videolar = t.videolar.filter((v) => !idler.includes(v.id));
  }
  for (const kod of Object.keys(FOTO_SORUSU)) {
    if (modeller[kod] && modeller[kod].durum === "onayda") modeller[kod] = { ...modeller[kod], durum: "foto-soru" };
  }
  await yazKV(env, "selin:modeller", modeller);
  await env.KAYIT.put("selin:fotoDuzeltme", "f1");
}

// Her toplu listenin önizleme linki yöneticilere bir kez kendiliğinden gider (sonra /onizleme ile).
export async function onizlemeDuyur(env) {
  const t = await oku(env, "selin:toplu", null);
  if (!t || !["hazirlaniyor", "onayda"].includes(t.durum) || !env.SELF_URL) return;
  if ((await env.KAYIT.get("selin:onizlemeDuyuru")) === String(t.basla)) return;
  await env.KAYIT.put("selin:onizlemeDuyuru", String(t.basla));
  const metin = await onizlemeMesaji(env);
  for (const k of kimlikler(env.ALLOWED_IDS)) await tg(env, "sendMessage", { chat_id: k, text: metin, disable_web_page_preview: true });
}

export async function onizlemeMesaji(env) {
  const d = await onayDokumu(env);
  if (!d.toplu.length) return "Şu an toplu liste yok.";
  const az = d.hazir.filter((k) => d.modeller[k].taslak.fotolar.filter((f) => f.net).length <= 2)
    .map((k) => { const x = d.modeller[k].taslak; return `${k} (${x.fotolar.filter((f) => f.net).length} foto, ${x.videolar.length} video)`; });
  return [
    "🌸 Toplu listenin önizlemesi — siteye ÇIKMADI, sadece bakmak için:",
    await onizlemeLinki(env),
    "",
    `Toplu liste: ${d.toplu.length} model — hazır ${d.hazir.length}${d.hazirlaniyor.length ? `, hazırlanıyor ${d.hazirlaniyor.length}` : ""}${d.olmayan.length ? `, hazırlanamayan ${d.olmayan.length}` : ""}.`,
    `Bu listenin dışında onay bekleyen: ${d.kartlar.length} tek taslak${d.kartlar.length ? ` (${d.kartlar.join(", ")})` : ""} + ${d.kareler.length} videodan kare (fotoğrafı olmayan modeller için)${d.kareler.length ? `: ${d.kareler.join(", ")}` : ""}.`,
    az.length ? `\n2 ya da daha az fotoğraflı: ${az.join(", ")}.` : "",
    "",
    "Siz düğmeye basmadan hiçbir model siteye çıkmaz. İstemediğiniz: /cikar 3183",
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------- Fotoğraf karışıklığı kontrolü (28 Ekim) ----------
// Toplu listedeki her modelin kanal paylaşım grupları (hangi mesajlar), taslağa giren fotoğraflar ve
// her mesajın kendi yazısı GitHub Actions'a verilir; Actions hepsini "kareler" dalına kaydeder
// (kontrol/<sürüm>/). Böylece her fotoğrafın hangi gönderiden geldiği tek tek incelenir.
// Siteye hiçbir şey yazmaz; Telegram'a mesaj göndermez (sadece arşiv kanalına iletme).
const KONTROL_SURUM = "k2"; // k1: fotoğraflar, k2: videolardan kareler
async function kontrolListesi(env) {
  const t = await oku(env, "selin:toplu", null);
  const modeller = await oku(env, "selin:modeller", {});
  const bilgi = await kanalBilgisi(env);
  return (t ? t.kodlar : []).map((kod) => {
    const x = modeller[kod] && modeller[kod].taslak;
    return {
      kod, durum: modeller[kod] && modeller[kod].durum,
      gruplar: (bilgi.kodlar[kod] || []).map((g) => ({ ids: g.ids, tarih: g.tarih, album: g.album || null, y: g.y || null })),
      secilen: modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz, PAYLASIM_EN_FAZLA).map((g) => g.ids),
      fotolar: x ? x.fotolar.map((f, i) => ({ sira: i, id: f.id, net: f.net, not: f.not, belge: Boolean(f.buyuk.belge) })) : [],
      videolar: x ? x.videolar.map((v) => v.id) : [],
    };
  });
}
// Tek kanal mesajı: fotoğrafsa en büyük hâli; yazısı başlıkta. Sadece toplu listedeki modellerin mesajları.
async function kontrolMesaji(env, idYazi) {
  const id = Number(idYazi);
  const liste = await kontrolListesi(env);
  if (!liste.some((m) => m.gruplar.some((g) => g.ids.includes(id)))) return new Response("yok", { status: 404 });
  const arsiv = await oku(env, "arsiv", null);
  const kanal = await oku(env, "kanal", null);
  const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true });
  if (!r.ok) return new Response(null, { status: 204, headers: { "x-tur": "hata", "x-yazi": encodeURIComponent(r.description || "") } });
  const m = r.result;
  const h = { "x-yazi": encodeURIComponent((m.caption || m.text || "").slice(0, 600)), "x-grup": String(m.media_group_id || "") };
  const resim = m.photo ? m.photo[m.photo.length - 1] : m.document && /^image\//.test(m.document.mime_type || "") ? m.document : null;
  if (!resim && m.video && (m.video.file_size || 0) <= VIDEO_SINIR) {
    // Video: kontrol için dosyanın kendisi (Actions içinden birkaç kare çıkarılır).
    const fv = await tg(env, "getFile", { file_id: m.video.file_id });
    if (fv.ok) {
      const dv = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${fv.result.file_path}`);
      return new Response(dv.body, { headers: { ...h, "x-tur": "video", "content-type": "video/mp4" } });
    }
  }
  if (!resim) return new Response(null, { status: 204, headers: { ...h, "x-tur": m.video ? "video-buyuk" : "diger" } });
  const f = await tg(env, "getFile", { file_id: resim.file_id });
  if (!f.ok) return new Response(null, { status: 204, headers: { ...h, "x-tur": "buyuk" } });
  const dosya = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Response(dosya.body, { headers: { ...h, "x-tur": "foto", "x-benzersiz": resim.file_unique_id, "content-type": "image/jpeg" } });
}
// Bir kez: geçici jeton (6 saat) + Actions isteği.
export async function kontrolIstegi(env) {
  if (!env.GITHUB_TOKEN || !env.SELF_URL) return;
  if ((await env.KAYIT.get("selin:kontrolSurum")) === KONTROL_SURUM) return;
  await env.KAYIT.put("selin:kontrolSurum", KONTROL_SURUM);
  const jeton = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.KAYIT.put("selin:kontrolJeton", jeton, { expirationTtl: 6 * 3600 });
  const icerik = { surum: KONTROL_SURUM, kok: `${env.SELF_URL}/onizleme/${jeton}` };
  await gh(env, `/contents/istekler/kontrol/${KONTROL_SURUM}.json`, { method: "PUT", body: JSON.stringify({ message: "Selin: fotoğraf kontrolü isteği", branch: KARE_DALI, content: btoa(JSON.stringify(icerik)) }) });
}

// /onizleme/<anahtar>            → sayfa
// /onizleme/<anahtar>/f/<kod>/<n> → fotoğraf (sitede görünecek n. net poz)
// /onizleme/<anahtar>/v/<kod>/<n> → video (Telegram'dan akış)
export async function onizleme(env, yol, aralik) {
  const [anahtar, tur, kod, sira] = String(yol || "").split("/").filter(Boolean);
  const jeton = await env.KAYIT.get("selin:kontrolJeton");
  if (!gizliEsit(anahtar || "", await onizlemeAnahtari(env)) && !(jeton && gizliEsit(anahtar || "", jeton))) return new Response("yok", { status: 404 });
  if (tur === "json") return Response.json(await kontrolListesi(env));
  if (tur === "uretim") return uretimSayfasi(env, anahtar);
  if (tur === "m") return kontrolMesaji(env, kod);
  if (tur === "f" || tur === "v") {
    const t = await oku(env, "selin:toplu", null);
    const modeller = await oku(env, "selin:modeller", {});
    const x = t && t.kodlar.includes(kod) && modeller[kod] && modeller[kod].taslak;
    const oge = x && (tur === "f" ? x.fotolar.filter((f) => f.net)[Number(sira)] : x.videolar[Number(sira)]);
    if (!oge) return new Response("yok", { status: 404 });
    const fileId = tur === "f" ? oge.buyuk.file_id : oge.file_id;
    if (tur === "v" && oge.boyut > VIDEO_SINIR) return new Response("büyük", { status: 413 });
    const f = await tg(env, "getFile", { file_id: fileId });
    if (!f.ok) return new Response("indirilemedi", { status: 502 });
    const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`, aralik ? { headers: { Range: aralik } } : {});
    const uzanti = String(f.result.file_path).split(".").pop().toLowerCase();
    const tip = tur === "v" ? "video/mp4" : { png: "image/png", webp: "image/webp" }[uzanti] || "image/jpeg";
    const h = new Headers({ "content-type": tip, "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
    for (const k of ["content-length", "content-range"]) if (r.headers.get(k)) h.set(k, r.headers.get(k));
    return new Response(r.body, { status: r.status, headers: h });
  }
  const d = await onayDokumu(env);
  const stok = await stokBilgisi(env, d.hazir);
  const kok = `/onizleme/${anahtar}`;
  const bloklar = d.hazir.map((k) => {
    const x = d.modeller[k].taslak;
    const fiyat = (stok[k] && stok[k].fiyat) ?? x.fiyat ?? null;
    const netler = x.fotolar.filter((f) => f.net);
    const fotolar = netler.map((f, i) => `<a class="model-foto" href="${kok}/f/${k}/${i}" target="_blank" rel="noopener"><img src="${kok}/f/${k}/${i}" alt="${htmlKacir(x.baslik)} — ${i + 1}" loading="lazy"></a>`).join("");
    const videolar = x.videolar.map((v, i) => (v.boyut > VIDEO_SINIR ? "" : `<div class="model-video model-video-site"><video controls playsinline preload="metadata" src="${kok}/v/${k}/${i}#t=0.1"></video></div>`)).join("");
    const buyukVideo = x.videolar.filter((v) => v.boyut > VIDEO_SINIR).length;
    const diller = ["en", "fr", "pt"].filter((dl) => x.aciklama && x.aciklama[dl]);
    return `<section class="onz-model" id="m${htmlKacir(k)}">
  <div class="model-izgara">
    <div class="model-galeri">${fotolar}${videolar}</div>
    <div class="model-bilgi">
      <p class="product-code">${htmlKacir(k)}</p>
      <h1>${htmlKacir(x.baslik)}</h1>
      ${x.bedenler ? `<p class="product-meta">Sizes: ${htmlKacir(x.bedenler)} · sold by series (mixed sizes)</p>` : ""}
      ${fiyat != null ? `<p class="model-fiyat">Wholesale price: $${htmlKacir(fiyat)}</p>` : ""}
      <div class="chips model-diller">${diller.map((dl, i) => `<button type="button" class="chip${i ? "" : " active"}" data-dil="${dl}">${{ en: "English", fr: "Français", pt: "Português" }[dl]}</button>`).join("")}</div>
      ${diller.map((dl, i) => `<p class="model-aciklama" data-metin="${dl}"${i ? " hidden" : ""}>${htmlKacir(x.aciklama[dl])}</p>`).join("")}
      <span class="btn">${fiyat != null ? "Order on WhatsApp" : "Ask on WhatsApp"}</span>
    </div>
  </div>
  <div class="onz-alt">
    <b>Kod: ${htmlKacir(k)}</b> · Fiyat: ${fiyat != null ? `${htmlKacir(fiyat)} $ (Vegawin)` : "Vegawin'de yok → sitede \"Ask price\""} · Bedenler: ${htmlKacir(x.bedenler || "SEÇİLMEDİ")} · Kategori: ${htmlKacir(KATEGORI_ADI[x.kategori] || x.kategori)}<br>
    ${netler.length} fotoğraf${netler.length <= 2 ? " ⚠️ az" : ""}${x.fotolar.length > netler.length ? ` (bulanık/küçük ${x.fotolar.length - netler.length} tanesi konmayacak)` : ""} · ${x.videolar.length} video${buyukVideo ? ` (${buyukVideo} tanesi 20 MB'tan büyük, sitede görünmez)` : ""}
    ${x.aciklama && x.aciklama.tr ? `<br><i>TR: ${htmlKacir(x.aciklama.tr)}</i>` : ""}
  </div>
</section>`;
  }).join("\n");
  const diger = [
    d.hazirlaniyor.length ? `<p>⏳ Hâlâ hazırlanıyor (sayfayı sonra yenileyin): ${d.hazirlaniyor.join(", ")}</p>` : "",
    d.soru.map((k) => `<p>❓ ${k} size soruldu, cevaba kadar listede yok: ${htmlKacir(FOTO_SORUSU[k])}</p>`).join(""),
    d.olmayan.length ? `<p>❌ Hazırlanamadı (fotoğraf okunamadı): ${d.olmayan.join(", ")}</p>` : "",
    `<p>Bu listenin dışında onay bekleyen: ${d.kartlar.length} tek taslak${d.kartlar.length ? ` (${d.kartlar.join(", ")})` : ""} ve ${d.kareler.length} videodan kare${d.kareler.length ? ` (${d.kareler.join(", ")})` : ""}. Bunlar Telegram'da ayrı kartlarla gelir.</p>`,
  ].join("");
  const sayfa = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>Önizleme — VOLONTE</title>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${htmlKacir(env.SITE_URL)}/css/style.css">
<style>
.onz-bant{position:sticky;top:0;z-index:50;background:#1d1d1f;color:#fff;padding:12px 16px;font:14px/1.5 Inter,sans-serif}
.onz-bant b{color:#ffd479}.onz-model{padding:40px 0;border-bottom:1px solid #e5e5e5}
.onz-alt{margin-top:18px;padding:12px 14px;background:#fff8e6;border:1px solid #f0d68a;border-radius:8px;font:14px/1.6 Inter,sans-serif;color:#333}
.onz-icindekiler{display:flex;flex-wrap:wrap;gap:8px;font:14px Inter,sans-serif}.onz-icindekiler a{padding:4px 10px;border:1px solid #ccc;border-radius:14px;text-decoration:none;color:#222}
.onz-model{scroll-margin-top:110px}.onz-diger{padding:32px 0;font:15px/1.6 Inter,sans-serif}.model-bilgi .btn{cursor:default;opacity:.85}
</style></head><body>
<div class="onz-bant">🌸 <b>ÖNİZLEME — bu modeller henüz sitede DEĞİL.</b> Siteye nasıl girecekse öyle görünüyor. Onay: Telegram'da Selin'in listesindeki "✅ Hepsini siteye yükle". İstemediğiniz model: Selin'e <code>/cikar 3183</code>.<br>Hazır ${d.hazir.length} / ${d.toplu.length} model${d.hazirlaniyor.length ? ` · hazırlanıyor ${d.hazirlaniyor.length}` : ""}</div>
<header class="site-header"><nav class="container nav"><span class="logo">VOLONTE</span></nav></header>
<main class="section model-sayfa" style="padding-top:8px"><div class="container">
${d.hazir.length ? `<p class="onz-icindekiler">${d.hazir.map((k) => `<a href="#m${htmlKacir(k)}">${htmlKacir(k)}</a>`).join(" ")}</p>` : ""}
${bloklar || '<p class="empty">Henüz hazır model yok; Selin hazırlıyor. Sayfayı biraz sonra yenileyin.</p>'}
<div class="onz-diger">${diger}</div>
</div></main>
<script>
document.querySelectorAll(".model-diller").forEach(function (g) {
  g.addEventListener("click", function (e) {
    var b = e.target.closest("[data-dil]"); if (!b) return;
    var kutu = g.parentElement;
    kutu.querySelectorAll("[data-dil]").forEach(function (x) { x.classList.toggle("active", x === b); });
    kutu.querySelectorAll("[data-metin]").forEach(function (p) { p.hidden = p.getAttribute("data-metin") !== b.getAttribute("data-dil"); });
  });
});
document.querySelectorAll(".model-video-site video").forEach(function (v) { v.addEventListener("error", function () { v.parentElement.remove(); }); });
</script></body></html>`;
  return new Response(sayfa, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

// ---------- Üretim atölyesi bağlantısı (uretim.js) ----------
// Referans: modelin taslağındaki net fotoğraflar (hatalı mesajlar zaten çıkarıldı), en büyük boyutta.
async function uretimCalis(env, simdi) {
  const onbellek = new Map();
  const referansAl = async (kod, yalinB64 = false) => {
    if (!onbellek.has(kod)) {
      // Kanal fotoğrafları KULLANILMAZ (kullanıcı kararı): sadece Selin'e özelden gönderilen askı/manken fotoğrafları.
      const refler = (await oku(env, `selin:referans:${kod}`, [])).filter((x) => x.tur === "foto");
      const sirali = [...refler.filter((x) => x.rol === "manken"), ...refler.filter((x) => x.rol === "aski")].slice(0, 3);
      const liste = [];
      for (const f of sirali) liste.push({ rol: f.rol, b64: f.belge ? await belgeB64(env, f.file_id, 1536) : await dosyaB64(env, f.file_id) });
      onbellek.set(kod, liste);
    }
    const l = onbellek.get(kod);
    return yalinB64 ? l.map((x) => x.b64) : l.map((x) => ({ rol: x.rol, url: `data:image/jpeg;base64,${x.b64}` }));
  };
  const bildir = async (u) => {
    const oz = aracOzeti(u);
    const satir = Object.values(oz).map((a) => `• ${a.ad}: ${a.uretilen} üretim${a.tur === "foto" ? `, uygun ${a.uygun} (desen ${a.desen ?? "-"}/10, renk ${a.renk ?? "-"}/10)` : ""}${a.hata ? `, hata ${a.hata}` : ""}`);
    const h = await uretimHarcanan(env);
    const metin = `🎨 Selin — üretim denemesi bitti (${u.kodlar.join(", ")}).\n\n${satir.join("\n")}\n\nHarcama (yaklaşık): ${h.deneme.toFixed(2)} $ (deneme sınırı ${DENEME_SINIR_USD} $).\n\nOrijinalle yan yana karşılaştırma:\n${await onizlemeLinki(env)}/uretim\n\nSiteye hiçbir şey çıkmadı.`;
    for (const k of kimlikler(env.ALLOWED_IDS)) await tg(env, "sendMessage", { chat_id: k, text: metin, disable_web_page_preview: true });
  };
  await uretimAdimi(env, simdi, { referansAl, bildir });
}

async function uretimSayfasi(env, anahtar) {
  const u = await oku(env, "selin:uretim", null);
  const h = await uretimHarcanan(env);
  const kok = `/onizleme/${anahtar}`;
  if (!u) return new Response(`<p style="font:16px sans-serif;padding:20px">Üretim henüz başlamadı${env.FAL_KEY ? "" : " (fal.ai anahtarı girilmedi)"}.</p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  const modeller = await oku(env, "selin:modeller", {});
  const oz = aracOzeti(u);
  const tablo = Object.entries(oz).map(([, a]) => `<tr><td>${htmlKacir(a.ad)}</td><td>${a.tur}</td><td>${a.fiyat} $</td><td>${a.uretilen}</td><td>${a.tur === "foto" ? `${a.uygun}` : "siz bakın"}</td><td>${a.desen ?? "-"}</td><td>${a.renk ?? "-"}</td><td>${a.hata}</td></tr>`).join("");
  const bloklar = u.kodlar.map((kod) => {
    const t = modeller[kod] && modeller[kod].taslak;
    const netler = t ? t.fotolar.filter((f) => f.net) : [];
    const orj = netler.length ? `<figure class="bos"><figcaption>ORİJİNAL: Selin'e gönderilen askı/manken fotoğrafları</figcaption></figure>` : "";
    const satirlar = Object.entries(ARACLAR).map(([a, x]) => {
      const isler = u.isler.filter((is) => is.kod === kod && is.arac === a);
      const kutu = isler.map((is) => {
        const p = u.puan && u.puan[kod] && u.puan[kod][`${a}:${is.poz}`];
        const etiket = p ? `<figcaption class="${p.uygun ? "iyi" : "kotu"}">${p.uygun ? "✅" : "❌"} renk ${p.renk} · desen ${p.desen} · kesim ${p.kesim} · yüz ${p.yuz}<br>${htmlKacir(p.not || "")}</figcaption>` : `<figcaption>${is.durum === "hazir" ? "" : htmlKacir(is.durum + (is.hata ? ": " + is.hata : ""))}</figcaption>`;
        if (is.durum !== "hazir") return `<figure class="bos">${etiket}</figure>`;
        return x.tur === "video" ? `<figure><video controls playsinline preload="metadata" src="${htmlKacir(is.url)}"></video>${etiket}</figure>` : `<figure><a href="${htmlKacir(is.url)}" target="_blank"><img src="${htmlKacir(is.url)}" loading="lazy"></a>${etiket}</figure>`;
      }).join("");
      return `<h3>${htmlKacir(x.ad)} — ${x.fiyat} $/${x.tur === "video" ? "video" : "görsel"}</h3><div class="sira"><div class="orj">${orj}</div>${kutu}</div>`;
    }).join("");
    return `<section><h2>${htmlKacir(kod)} ${t ? "— " + htmlKacir(t.baslik) : ""}</h2>${satirlar}</section>`;
  }).join("");
  const sayfa = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Üretim karşılaştırma — VOLONTE</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#fafafa;color:#222}h2{margin-top:36px;border-bottom:2px solid #222}h3{font-size:15px;margin:18px 0 6px}
.sira{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}.orj{display:flex;gap:8px;border-right:3px solid #c9a227;padding-right:8px}
figure{margin:0;flex:0 0 220px}figure img,figure video{width:220px;height:300px;object-fit:cover;background:#ddd;border-radius:6px}figcaption{font-size:12px;padding:4px 2px}
.iyi{color:#0a7a2f}.kotu{color:#b00020}.bos{height:300px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center}
table{border-collapse:collapse;background:#fff}td,th{border:1px solid #ddd;padding:6px 8px;font-size:13px}.bant{background:#1d1d1f;color:#fff;padding:12px;border-radius:8px}</style></head><body>
<div class="bant">🎨 <b>ÜRETİM DENEMESİ — siteye çıkmadı.</b> Her satırda solda ORİJİNAL, sağda o aracın ürettikleri. Claude puanı: 8'in altı ❌ (kullanılmaz). Harcama (yaklaşık): ${h.deneme.toFixed(2)} $ / deneme sınırı ${DENEME_SINIR_USD} $.</div>
<h2>Araç karşılaştırması</h2><table><tr><th>Araç</th><th>Tür</th><th>Fiyat</th><th>Üretilen</th><th>Uygun (≥8)</th><th>Desen ort.</th><th>Renk ort.</th><th>Hata</th></tr>${tablo}</table>
${bloklar}</body></html>`;
  return new Response(sayfa, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// ---------- YENİ AKIŞ (kullanıcı kararı, 28 Ekim) ----------
// Kanal alt yazıları (kod, fiyat) KULLANILMAZ; doğru kod ve fiyat sadece Vegawin'de (Sami). Selin kanala bağlanmaz.
//  1) Her gün 10:00'da Sami'nin stok listesinden GUNLUK_ISTEK model seçilir, sahibe (0091 hesabı) kod listesi gider.
//  2) Sahip fotoğrafları ("Dosya olarak") ve videoyu gönderir; yazı: "3503 Küçük" / "3518 Büyük" / "3520 İkisi de".
//  3) Selin başlık, açıklama (4 dil), kategori hazırlar; fiyat ve stok Vegawin'den. Taslak sahibe onaya gider.
//  4) Onaylanınca siteye yüklenir. 20:00'de günün özeti; gönderilmeyenler "gönderilemedi" listesine (sonra fal.ai).
export const GUNLUK_ISTEK = 30; // kullanıcı kararı 30 Ekim (önce 15)
export const EK_ISTEK = 15; // bir kerelik ek liste (KV "venom:selinEkIstek" = gün)
const ISTEK_SAATI = 10;
const GUN_SONU_SAATI = 20;
// Önce: önizlemede fotoğrafı karışan 24 model + sitedeki 4 model (yeni yolla baştan), sonra stoktaki diğerleri.
const ONCELIKLI = ["3183", "3186", "3322", "3335", "3360", "3403", "3407", "3411", "3429", "3439", "3475", "3481", "3506", "3520", "3558", "3565", "3567", "3577", "3578", "3583", "3592", "3593", "3618", "4211", "3563", "3279", "3595", "3448"];
const OZEL_ACIK = ["istendi", "geldi", "onayda", "yukleniyor", "sitede", "gonderilemedi", "eklenmeyecek", "bekliyor", "bulunamiyor"];
// 5 Kasım (Patron): liste HEP 30 — fotoğrafı gelen (ya da /yok denen) modelin yerine gün içinde yeni kod eklenir (en sık 30 dk'da bir,
// 0091'e kısa ek mesaj). Gelmeyen model kaybolmaz: 20:00'de "bekliyor" → ertesi gün listenin başında; 3 gün üst üste gelmezse
// "bulunamiyor" + Patron'a rapor (Sami'nin Vegawin stoğuyla). Havuz sırası: bekliyor → yeni (stokta, sitede değil) → eski gönderilemedi.
const EK_ARALIK = 30 * 60;
export const KACIRMA_SINIRI = 3;
const BEDEN_KELIME = [[/k[üu][çc][üu]k/i, "k"], [/b[üu]y[üu]k/i, "b"], [/ik[iı]s[iı]/i, "i"]];

const sahipler = async (env) => [...new Set([...kimlikler(env.SAHIP_IDS), ...kimlikler(await env.KAYIT.get("selin:sahip"))])];
const ozelMi = (m) => Boolean(m && m.kaynak === "ozel");

// Sitede olan modeller (hangi yolla yüklenmiş olursa olsun) fotoğraf isteğine GİRMEZ (2 Kasım düzeltmesi: eski yolla —
// kanaldan — siteye girenler tekrar isteniyordu ve kayıtları "istendi"ye dönüyordu). Gizli (stoğu bitmiş) olanlar da sitede sayılır.
async function sitedekiKodlar(env) {
  const { liste } = await siteVerisi(env);
  return new Set(liste.map((u) => String(u.kod)));
}
export async function istekAdaylari(env, modeller, sitede = new Set()) {
  const stok = await stokIste2(env, "/stoktakiler");
  const kodlar = stok.map((r) => String(r.kod));
  const uygun = (k) => !sitede.has(k) && !(modeller[k] && modeller[k].durum === "sitede") && !(ozelMi(modeller[k]) && OZEL_ACIK.includes(modeller[k].durum));
  // 9 Kasım (Patron): Venom'un model kartında "fotoğraf yok" çıkan modeller listenin EN BAŞINA (KV "venom:selinFotoIste", 14 gün)
  const venomIste = ((await env.KAYIT.get("venom:selinFotoIste", "json").catch(() => null)) || []).filter((x) => Date.now() / 1000 - (x.zaman || 0) < 14 * 86400).map((x) => String(x.kod));
  const oncelik = [...new Set([...venomIste.filter((k) => kodlar.includes(k) && uygun(k)), ...ONCELIKLI.filter((k) => kodlar.includes(k) && uygun(k))])];
  const diger = kodlar.filter((k) => !ONCELIKLI.includes(k) && !venomIste.includes(k) && uygun(k)).sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
  // Celal'in modelleri (Vegawin kodu "CELAL" ile biten; köprü sadece işaret gönderir): listede EN SONA (kullanıcı kararı 30 Ekim).
  const celal = new Set(stok.filter((r) => r.tedarikci === "CELAL").map((r) => String(r.kod)));
  const sirali = [...oncelik, ...diger];
  return { kodlar: sirali, celal, stoktaki: kodlar };
}
async function stokIste2(env, yol, govde = {}) {
  if (!env.STOK) return [];
  try {
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(govde) });
    return await r.json();
  } catch {
    return [];
  }
}

// İstek havuzu: dünden kalan "bekliyor" (çok kaçırılan önce) → yeni adaylar → eski "gönderilemedi" (/yok denenler hariç)
export function istekHavuzu(modeller, sitede, yeni, stoktaki, haric = new Set()) {
  const ac = (k, d) => !sitede.has(k) && !haric.has(k) && modeller[k] && ozelMi(modeller[k]) && modeller[k].durum === d;
  const bekliyor = stoktaki.filter((k) => ac(k, "bekliyor")).sort((a, b) => (modeller[b].kacirma || 0) - (modeller[a].kacirma || 0) || Number(b) - Number(a));
  const eski = stoktaki.filter((k) => ac(k, "gonderilemedi") && !modeller[k].yokDendi).sort((a, b) => Number(b) - Number(a));
  return [...new Set([...bekliyor, ...yeni.filter((k) => !haric.has(k)), ...eski])];
}
const listeKisileri = async (env) => { const s = kimlikler(await env.KAYIT.get("selin:sahip")); return s.length ? s : sahipler(env); }; // 0091
// Gün içi tamamlama: açık ("istendi") model sayısı 30'un altına düşünce havuzdan eklenir
export async function listeTamamla(env, gun, ist, simdi) {
  if (simdi - (ist.ekZaman || ist.zaman || 0) < EK_ARALIK) return;
  const modeller = await oku(env, "selin:modeller", {});
  const aktif = (ist.kodlar || []).filter((k) => modeller[k] && ozelMi(modeller[k]) && modeller[k].durum === "istendi");
  const gerek = GUNLUK_ISTEK - aktif.length;
  ist.ekZaman = simdi;
  if (gerek <= 0) return yazKV(env, `selin:istek:${gun}`, ist, 30 * 86400);
  let sitede; try { sitede = await sitedekiKodlar(env); } catch { return; }
  const { kodlar, celal, stoktaki } = await istekAdaylari(env, modeller, sitede);
  const ek = istekHavuzu(modeller, sitede, kodlar, stoktaki, new Set(ist.kodlar || [])).slice(0, gerek);
  if (!ek.length) return yazKV(env, `selin:istek:${gun}`, ist, 30 * 86400);
  const sirali = [...ek.filter((k) => !celal.has(k)), ...ek.filter((k) => celal.has(k))];
  for (const k of sirali) modeller[k] = { ...(modeller[k] || {}), kaynak: "ozel", durum: "istendi", istenme: simdi, medya: [], kart: [] };
  await yazKV(env, "selin:modeller", modeller);
  ist.kodlar = [...(ist.kodlar || []), ...sirali];
  ist.eklenen = [...(ist.eklenen || []), ...sirali];
  await yazKV(env, `selin:istek:${gun}`, ist, 30 * 86400);
  const metin = `➕ Listeye eklenenler (${sirali.length}): ${sirali.join(", ")}\nBugün açık ${aktif.length + sirali.length} model. Aynı kural: 📎 Dosya olarak + "kod Küçük/Büyük/İkisi de"; gönderemeyeceğiniz: /yok kod`;
  for (const k of await listeKisileri(env)) await tg(env, "sendMessage", { chat_id: k, text: metin });
}

// 10:00 — günün istek listesi (bir kez). Sahiplere (0091 hesabı + Merdan: SAHIP_IDS) gider; Celal'in modelleri en sonda.
// Tek seferlik (5 Kasım, Patron): KV "venom:selinIstekTekrar" = { gun } → o günün istek listesi AYNI BİÇİMDE yeniden gönderilir
// (sadece /sahip ile kayıtlı hesaplara = 0091; SAHIP_IDS'teki Merdan'a tekrar gitmez). Model durumları DEĞİŞMEZ.
// Sonuç (kodlar + her modelin durumu) "venom:selinIstekTekrarSonuc".
// VENOM (5 Kasım): bir model neden taslak çıkmadı / nerede? + taslak başlat (fotoğrafı gelmişse)
// 9 Kasım (Patron): Venom "Selin, şu an ne durumda?" — bugünkü fotoğraf listesi, durumlar, GÖNDERİLEMEYENLER (kod + sebep)
const TAKILAN_SEBEP = { gonderilemedi: "eski listede fotoğraf gelmedi", bulunamiyor: "3 gün üst üste fotoğraf gelmedi", hazirlanamadi: "taslak hazırlanamadı (hata)", istendi: "fotoğraf istendi, gelmedi", bekliyor: "dün gelmedi, bugün tekrar istendi" };
export async function selinOzet(env, simdi) {
  const modeller = await oku(env, "selin:modeller", {});
  const say = {};
  for (const m of Object.values(modeller)) if (m && m.durum) say[m.durum] = (say[m.durum] || 0) + 1;
  const ist = await oku(env, `selin:istek:${gunAnahtari(simdi)}`, null);
  const takilan = Object.entries(modeller).filter(([, m]) => m && ["gonderilemedi", "bulunamiyor", "hazirlanamadi"].includes(m.durum))
    .map(([kod, m]) => ({ kod, durum: m.durum, sebep: [TAKILAN_SEBEP[m.durum], m.not].filter(Boolean).join(" — ") })).slice(0, 40);
  // 9 Kasım (sert müdür E): fotoğrafı istenip henüz gelmeyen stok modelleri (Venom görevi)
  const fotoBekleyen = Object.entries(modeller).filter(([, m]) => m && ["istendi", "bekliyor"].includes(m.durum)).map(([kod]) => kod).slice(0, 60);
  return { bugunIstenen: ist ? (ist.kodlar || []).length : 0, durumlar: say, onayda: Object.entries(modeller).filter(([, m]) => m && m.durum === "onayda").map(([k]) => k), takilan, fotoBekleyen };
}
export async function venomModelDurumu(env, kod, simdi) {
  kod = String(kod || "").replace(/\D/g, "");
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod] || null;
  const ist = await oku(env, `selin:istek:${gunAnahtari(simdi)}`, null);
  let sitede = null; try { sitede = (await sitedekiKodlar(env)).has(kod); } catch { /* */ }
  const st = (await stokBilgisi(env, [kod]))[kod] || null;
  const foto = m && m.medya ? m.medya.filter((y) => y.tur === "foto").length : 0, video = m && m.medya ? m.medya.filter((y) => y.tur === "video").length : 0;
  const ACIKLAMA = { istendi: "fotoğraf istendi, henüz gelmedi", bekliyor: "dün fotoğraf gelmedi, bugün tekrar listede", bulunamiyor: "3 gün üst üste fotoğraf gelmedi (bulunamıyor)", gonderilemedi: "eski listede gelmedi (gönderilemedi)", geldi: "fotoğraf geldi, taslak hazırlanıyor/sırada", onayda: "taslak hazır, onay bekliyor", hazirlanamadi: "taslak 3 denemede hazırlanamadı (hata)", sitede: "sitede", yukleniyor: "siteye yükleniyor", eklenmeyecek: "eklenmeyecek denildi" };
  return { kod, durum: m ? m.durum : null, aciklama: m ? ACIKLAMA[m.durum] || m.durum : "Selin'in kaydında yok (hiç istenmemiş)", bugunListede: Boolean(ist && (ist.kodlar || []).includes(kod)), kacirma: (m && m.kacirma) || 0, foto, video, hata: (m && m.hata) || 0, sitede, stok: st ? Math.max(0, st.toplam || 0) : null, gizli: st ? Boolean(st.gizli) : null };
}
export async function venomTaslakBaslat(env, kod, simdi) {
  kod = String(kod || "").replace(/\D/g, "");
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  if (!m || !ozelMi(m) || !(m.medya || []).some((y) => y.tur === "foto")) return { ok: false, mesaj: `${kod}: Selin'de bu modelin fotoğrafı yok; önce fotoğraf gelmeli (0091'den "Dosya olarak", yazı "${kod} Küçük/Büyük").` };
  if (["sitede", "yukleniyor"].includes(m.durum)) return { ok: false, mesaj: `${kod} zaten sitede.` };
  modeller[kod] = { ...m, durum: "geldi", hata: 0, sonMedya: 0, bildirildi: true };
  await yazKV(env, "selin:modeller", modeller);
  try { await ozelHazirla(env, kod, simdi, null); } catch (e) { return { ok: false, mesaj: `${kod}: taslak hazırlanamadı (${String(e && e.message).slice(0, 120)})` }; }
  const d = (await oku(env, "selin:modeller", {}))[kod] || {};
  return { ok: d.durum === "onayda", mesaj: d.durum === "onayda" ? `${kod}: taslak hazır; onay kartı Venom'a geldi.` : `${kod}: taslak durumu "${d.durum}".` };
}
// Tek seferlik SALT OKUMA (Claude Code): KV "venom:selinDurumDok" → model durumları + bugünkü aday sayısı "venom:selinDurumDokSonuc"
async function durumDokum(env) {
  if (!(await env.KAYIT.get("venom:selinDurumDok"))) return false;
  await env.KAYIT.delete("venom:selinDurumDok");
  const modeller = await oku(env, "selin:modeller", {});
  let sitede = new Set(); try { sitede = await sitedekiKodlar(env); } catch { /* */ }
  const stok = await stokIste2(env, "/stoktakiler");
  const { kodlar } = await istekAdaylari(env, modeller, sitede);
  const durum = {};
  for (const [k, m] of Object.entries(modeller)) if (m && ozelMi(m)) durum[k] = { d: m.durum, i: m.istenme || null };
  const simdi0 = Math.floor(Date.now() / 1000), listeler = {}; // 6 Kasım: son 5 günün listeleri (tekrar isteme teşhisi)
  for (let i = 0; i < 5; i++) { const g = gunAnahtari(simdi0 - i * 86400); const ist = await oku(env, `selin:istek:${g}`, null); if (ist) listeler[g] = { zaman: ist.zaman || null, kodlar: ist.kodlar || [], eklenen: ist.eklenen || [], ek: ist.ek || null }; }
  await env.KAYIT.put("venom:selinDurumDokSonuc", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), stoktaki: stok.map((r) => String(r.kod)), sitede: [...sitede], aday: kodlar, durum, listeler, sahipSayisi: kimlikler(await env.KAYIT.get("selin:sahip")).length }), { expirationTtl: 86400 });
  return true;
}
async function istekTekrarAdimi(env, simdi) {
  const t = await env.KAYIT.get("venom:selinIstekTekrar", "json");
  if (!t) return false;
  await env.KAYIT.delete("venom:selinIstekTekrar");
  const gun = t.gun || gunAnahtari(simdi);
  let ist = await oku(env, `selin:istek:${gun}`, null);
  const modeller = await oku(env, "selin:modeller", {});
  const stok = await stokIste2(env, "/stoktakiler");
  // 5 Kasım: günün listesi boşsa (bütün stok ya sitede ya "gönderilemedi") → "gönderilemedi" modellerden normal sırayla N tanesi
  // yeniden istenir (durum "istendi", bugünün listesine yazılır; 20:00 özetine girer)
  if (t.bekleyenler && !((ist && ist.kodlar) || []).length) {
    let sitede = new Set(); try { sitede = await sitedekiKodlar(env); } catch { /* */ }
    const stoktaki = stok.map((r) => String(r.kod));
    const uygun = (k) => !sitede.has(k) && modeller[k] && ozelMi(modeller[k]) && modeller[k].durum === "gonderilemedi";
    const sirali = [...ONCELIKLI.filter((k) => stoktaki.includes(k) && uygun(k)), ...stoktaki.filter((k) => !ONCELIKLI.includes(k) && uygun(k)).sort((x, y) => Number(y) - Number(x) || y.localeCompare(x))].slice(0, Number(t.bekleyenler) || GUNLUK_ISTEK);
    const ck = new Set(stok.filter((r) => r.tedarikci === "CELAL").map((r) => String(r.kod)));
    const secilen = [...sirali.filter((k) => !ck.has(k)), ...sirali.filter((k) => ck.has(k))];
    if (!t.kuru) {
      for (const k of secilen) modeller[k] = { ...modeller[k], durum: "istendi", istenme: simdi, tekrar: (modeller[k].tekrar || 0) + 1 };
      await yazKV(env, "selin:modeller", modeller);
    }
    ist = { kodlar: secilen, zaman: simdi, tekrarIstek: true };
    if (!t.kuru) await yazKV(env, `selin:istek:${gun}`, ist, 30 * 86400);
  }
  const kodlar = (ist && ist.kodlar) || [];
  const celalKume = new Set(stok.filter((r) => r.tedarikci === "CELAL").map((r) => String(r.kod)));
  const kime = kimlikler(await env.KAYIT.get("selin:sahip"));
  const normal = kodlar.filter((k) => !celalKume.has(k)), celal = kodlar.filter((k) => celalKume.has(k));
  const metin = [
    `🌸 (Tekrar) Bugün ${kodlar.length} model istiyorum (Vegawin'de stokta):`,
    normal.join(", "),
    ...(celal.length ? ["", `👤 Celal'in modelleri (en son): ${celal.join(", ")}`] : []),
    "",
    "Her model için fotoğrafları 📎 → Dosya olarak gönderin (kalite düşmesin), videoyu da ekleyin.",
    "Yazıya kod ve beden: \"3503 Küçük\" · \"3518 Büyük\" · \"3520 İkisi de\" (Küçük 38-44, Büyük 44-50).",
    "Gönderemeyeceğiniz model: /yok 3503",
  ].join("\n");
  const gonderim = [];
  if (kodlar.length && !t.kuru) for (const k of kime) { const r = await tg(env, "sendMessage", { chat_id: k, text: metin }); gonderim.push(Boolean(r && r.ok)); }
  await env.KAYIT.put("venom:selinIstekTekrarSonuc", JSON.stringify({ zaman: simdi, gun, istekZaman: ist && ist.zaman, kodlar, celal, durum: Object.fromEntries(kodlar.map((k) => [k, (modeller[k] || {}).durum || "?"])), kisiSayisi: kime.length, gonderim, kuru: Boolean(t.kuru), metin }), { expirationTtl: 3 * 86400 });
  return true;
}
// 6 Kasım teşhis: son 5 günün listelerinde, liste gününden ÖNCE siteye eklenmiş (yani sitede olduğu halde istenen) modeller.
// Sonuç KV "venom:selinListeTeshis"; KV yazılamazsa (günlük sınır) sonraki turda yeniden denenir.
async function listeTeshisi(env, simdi) {
  if (await oku(env, "selin:listeTeshisYapildi", null)) return;
  const { liste } = await siteVerisi(env);
  const ekl = Object.fromEntries(liste.map((u) => [String(u.kod), u.eklenme || null]));
  const gunler = {};
  for (let i = 0; i < 5; i++) {
    const g = gunAnahtari(simdi - i * 86400);
    const ist = await oku(env, `selin:istek:${g}`, null);
    if (!ist) continue;
    const kodlar = ist.kodlar || [];
    gunler[g] = { istenen: kodlar.length, sitedeyken: kodlar.filter((k) => ekl[k] && ekl[k] < g), sonradanEklenen: kodlar.filter((k) => ekl[k] && ekl[k] >= g) };
  }
  const ok = await env.KAYIT.put("venom:selinListeTeshis", JSON.stringify({ zaman: simdi, gunler }), { expirationTtl: 14 * 86400 }).then(() => true).catch(() => false);
  if (ok) await yazKV(env, "selin:listeTeshisYapildi", simdi, 30 * 86400);
}
export async function istekAdimi(env, simdi) {
  try { await listeTeshisi(env, simdi); } catch { /* sonraki turda */ }
  if (await durumDokum(env)) return;
  if (await istekTekrarAdimi(env, simdi)) return;
  if (await istekDuzeltAdimi(env, simdi)) return;
  const s = saat(simdi);
  if (s < ISTEK_SAATI || s >= GUN_SONU_SAATI) return;
  const gun = gunAnahtari(simdi);
  if (await ekIstekAdimi(env, gun, simdi)) return;
  const mevcut = await oku(env, `selin:istek:${gun}`, null);
  if (mevcut) return listeTamamla(env, gun, mevcut, simdi);
  const kime = await sahipler(env);
  if (!kime.length) return; // sahip (0091) tanımlanmadan istek gitmez
  const modeller = await oku(env, "selin:modeller", {});
  let sitede;
  try { sitede = await sitedekiKodlar(env); } catch { return; } // site listesi okunamazsa yanlış istek yerine sonraki turda tekrar
  const { kodlar, celal, stoktaki } = await istekAdaylari(env, modeller, sitede);
  // Günün 30 modeli: önce dünden kalan "bekliyor", sonra yeni adaylar, yetmezse eski gönderilemedi; Celal'inkiler en sonda.
  const ilk = istekHavuzu(modeller, sitede, kodlar, stoktaki).slice(0, GUNLUK_ISTEK);
  const secilen = [...ilk.filter((k) => !celal.has(k)), ...ilk.filter((k) => celal.has(k))];
  await yazKV(env, `selin:istek:${gun}`, { kodlar: secilen, zaman: simdi }, 30 * 86400);
  if (!secilen.length) return;
  return istekGonder(env, kime, modeller, secilen, celal, simdi, `🌸 Günaydın! Bugün ${secilen.length} model istiyorum (Vegawin'de stokta):`);
}

// Bir kerelik onarım (2 Kasım; KV "venom:selinIstekDuzelt"): son 4 günün isteklerinde sitede zaten olan modeller bulunur,
// kayıtları "istendi"den "sitede"ye döner (fotoğrafları yeniden gelmişse dokunulmaz, sonuçta listelenir), liste sahiplerine
// "kusura bakmayın" mesajı gider. Sonuç "venom:selinIstekDuzeltSonuc".
async function istekDuzeltAdimi(env, simdi) {
  if (!(await env.KAYIT.get("venom:selinIstekDuzelt"))) return false;
  await env.KAYIT.delete("venom:selinIstekDuzelt");
  const sitede = await sitedekiKodlar(env);
  const modeller = await oku(env, "selin:modeller", {});
  const sonuc = { zaman: simdi, gunler: {}, duzelen: [], dokunulmayan: {} };
  for (let i = 0; i < 4; i++) {
    const g = gunAnahtari(simdi - i * 86400);
    const ist = await oku(env, `selin:istek:${g}`, null);
    if (!ist) continue;
    const yanlis = (ist.kodlar || []).filter((k) => sitede.has(k));
    sonuc.gunler[g] = { istenen: ist.kodlar || [], yanlis };
    for (const k of yanlis) {
      const m = modeller[k];
      if (m && m.durum === "istendi") { modeller[k] = { ...m, durum: "sitede", duzeltme: simdi }; sonuc.duzelen.push(k); }
      else if (m && m.durum !== "sitede") sonuc.dokunulmayan[k] = m.durum;
    }
  }
  if (sonuc.duzelen.length) await yazKV(env, "selin:modeller", modeller);
  const tum = [...new Set(Object.values(sonuc.gunler).flatMap((x) => x.yanlis))];
  sonuc.mesaj = tum;
  if (tum.length) {
    for (const kisi of await sahipler(env)) {
      await tg(env, "sendMessage", { chat_id: kisi, text: `🙏 Kusura bakmayın: şu ${tum.length} model zaten sitede, fotoğraf göndermenize gerek yok:\n${tum.join(", ")}\nBundan sonra sitede olan modeller listeye girmeyecek.` });
    }
  }
  await env.KAYIT.put("venom:selinIstekDuzeltSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  return true;
}

// Bir kerelik ek liste (kullanıcı kararı 30 Ekim): Celal'in modelleri olmadan, istenmemiş/sitede olmayan EK_ISTEK model hemen.
async function ekIstekAdimi(env, gun, simdi) {
  if ((await env.KAYIT.get("venom:selinEkIstek")) !== gun) return false;
  await env.KAYIT.delete("venom:selinEkIstek");
  const kime = await sahipler(env);
  if (!kime.length) return true;
  const modeller = await oku(env, "selin:modeller", {});
  let sitede;
  try { sitede = await sitedekiKodlar(env); } catch { return true; }
  const { kodlar, celal } = await istekAdaylari(env, modeller, sitede);
  const secilen = kodlar.filter((k) => !celal.has(k)).slice(0, EK_ISTEK);
  const onceki = await oku(env, `selin:istek:${gun}`, { kodlar: [], zaman: simdi });
  await yazKV(env, `selin:istek:${gun}`, { ...onceki, kodlar: [...onceki.kodlar, ...secilen], ek: secilen }, 30 * 86400);
  await env.KAYIT.put("venom:selinEkIstekSonuc", JSON.stringify({ gun, kodlar: secilen, kime }), { expirationTtl: 7 * 86400 });
  if (!secilen.length) return true;
  await istekGonder(env, kime, modeller, secilen, celal, simdi, `🌸 Ek liste: ${secilen.length} model daha (Vegawin'de stokta, sitede yok; Celal'in modelleri yok):`);
  return true;
}

async function istekGonder(env, kime, modeller, secilen, celalKume, simdi, baslik) {
  // 6 Kasım (Patron): sitede olan model listeye GİRMEZ — gönderimden hemen önce son kontrol (yeni renk isteği "KOD RENK" hariç)
  let sitede = null; try { sitede = await sitedekiKodlar(env); } catch { /* okunamazsa önceki süzgeç geçerli */ }
  if (sitede) {
    const atilan = secilen.filter((k) => sitede.has(k) && !(modeller[k] && modeller[k].renkIstek));
    if (atilan.length) {
      for (const k of atilan) if (modeller[k] && modeller[k].durum !== "sitede") modeller[k] = { ...modeller[k], durum: "sitede", duzeltme: simdi };
      secilen = secilen.filter((k) => !atilan.includes(k));
      const l = await oku(env, "venom:selinTekrarEngellendi", []);
      await env.KAYIT.put("venom:selinTekrarEngellendi", JSON.stringify([...l, { zaman: simdi, kodlar: atilan }].slice(-30)), { expirationTtl: 7 * 86400 }).catch(() => null);
    }
    if (!secilen.length) return yazKV(env, "selin:modeller", modeller);
  }
  const ad = (k) => (modeller[k] && modeller[k].renkIstek ? `${k} ${String(modeller[k].renkIstek).toLocaleUpperCase("tr")}` : k);
  const normal = secilen.filter((k) => !celalKume.has(k));
  const celal = secilen.filter((k) => celalKume.has(k));
  for (const k of secilen) modeller[k] = { ...(modeller[k] || {}), kaynak: "ozel", durum: "istendi", istenme: simdi, medya: [], kart: [] };
  await yazKV(env, "selin:modeller", modeller);
  const metin = [
    baslik,
    normal.map(ad).join(", "),
    ...(celal.length ? ["", `👤 Celal'in modelleri (en son): ${celal.map(ad).join(", ")}`] : []),
    "",
    "Fotoğrafları 📎 → Dosya olarak gönderin (kalite düşmesin). Videoyu NORMAL video olarak gönderin (dosya olarak DEĞİL; 20 MB altı).",
    "Yazıya kod ve beden: \"3503 Küçük\" · \"3518 Büyük\" · \"3520 İkisi de\" (Küçük 38-44, Büyük 44-50).",
    "Gönderemeyeceğiniz model: /yok 3503",
  ].join("\n");
  for (const k of kime) await tg(env, "sendMessage", { chat_id: k, text: metin });
}

// Gelen medya (kullanıcı kararı 29 Ekim): dosyalar önce YAZISIZ gelebilir, hemen ardından ayrı mesajla
// "3183 Küçük" yazılır → son gelen yazısız dosyalar bu koda bağlanır. Dosyalara tek tek cevap verilmez;
// kod gelince tek mesaj: "✅ 3183 alındı (4 fotoğraf, 1 video)". Yazısı kodlu albümün diğer parçaları albüm
// kimliğiyle aynı koda eklenir.
const BEKLEYEN_TTL = 12 * 3600;
// "Dosya olarak" gönderilen video (ör. IMG_4581.MP4): Telegram'da video değil belge olarak gelir.
export const belgeVideoMu = (d) => Boolean(d && (/^video\//.test(d.mime_type || "") || /\.(mp4|mov|m4v)$/i.test(d.file_name || "")));
const bekleyenAnahtar = (uid) => `selin:bekleyenDosya:${uid}`;
const kodBedenOku = (yazi) => {
  const r = String(yazi || "").trim().match(/^(\d{3,6})\b(.*)$/s);
  if (!r) return null;
  let grup = null;
  for (const [d, g] of BEDEN_KELIME) if (d.test(r[2])) { grup = g; break; }
  return { kod: r[1], grup };
};

export async function ozelMedya(env, m, medya, simdi) {
  const kb = kodBedenOku(m.caption);
  if (kb) return dosyalariBagla(env, m.from.id, kb.kod, kb.grup, [medya], simdi, { album: m.media_group_id, bildirimSonra: true });
  const albumKod = m.media_group_id ? await env.KAYIT.get(`selin:album:${m.media_group_id}`) : null;
  if (albumKod) return dosyalariBagla(env, m.from.id, albumKod, null, [medya], simdi, { album: m.media_group_id, bildirimSonra: true, sessiz: true });
  // Yazısız: kod mesajı gelene kadar beklet (cevap yok)
  const bek = await oku(env, bekleyenAnahtar(m.from.id), []);
  if (!bek.some((y) => y.uid === medya.uid)) bek.push({ ...medya, mesaj: m.message_id, album: m.media_group_id || null });
  await yazKV(env, bekleyenAnahtar(m.from.id), bek.slice(-30), BEKLEYEN_TTL);
}

// Dosyaları modele bağlar. bildirimSonra: onay mesajı 2 dk sessizlikten sonra tek sefer (yazılı albüm için).
async function dosyalariBagla(env, uid, kod, grup, dosyalar, simdi, { album = null, bildirimSonra = false } = {}) {
  const bekleyen = await oku(env, bekleyenAnahtar(uid), []);
  const modeller = await oku(env, "selin:modeller", {});
  const eski = modeller[kod] || {};
  // 5 Kasım: sitedeki modele SADECE video gelirse (tekrar gönderim) yeni taslak açılmaz; video doğrudan siteye eklenir
  const gelen = [...bekleyen, ...dosyalar];
  if (ozelMi(eski) && eski.durum === "sitede" && eski.taslak && gelen.length && gelen.every((d) => d.tur === "video")) {
    const x = { ...eski, medya: [...(eski.medya || [])], taslak: { ...eski.taslak, videolar: [...(eski.taslak.videolar || [])] } };
    const ekle = await oku(env, "selin:videoEkle", []);
    for (const md of gelen) {
      if (x.medya.some((y) => y.uid === md.uid)) continue;
      // taslak video sırası = medyadaki video sırası (sitenin "selin/<kod>/<n>" adresi)
      const n = x.medya.filter((y) => y.tur === "video").length;
      x.medya.push({ file_id: md.file_id, tur: "video", belge: md.belge || false, boyut: md.boyut || 0, w: md.w || 0, h: md.h || 0, uid: md.uid, yeniden: true, zaman: simdi });
      x.taslak.videolar[n] = { id: n, file_id: md.file_id, boyut: md.boyut || 0, w: md.w || 0, belge: Boolean(md.belge) };
      if (!((md.boyut || 0) > VIDEO_SINIR)) ekle.push({ kod, id: n, kim: uid, zaman: simdi });
    }
    modeller[kod] = x;
    await yazKV(env, "selin:modeller", modeller);
    await yazKV(env, "selin:videoEkle", ekle.slice(-50));
    if (bekleyen.length) await env.KAYIT.delete(bekleyenAnahtar(uid));
    if (album) await env.KAYIT.put(`selin:album:${album}`, kod, { expirationTtl: 3600 });
    return { ...x, videoEklendi: true };
  }
  // Aynı koda sonradan gelen dosya (ör. unutulan video) mevcut dosyalara eklenir; taslak yeniden hazırlanır.
  const devam = ozelMi(eski) && ["geldi", "onayda", "hazirlanamadi"].includes(eski.durum);
  const x = devam ? { ...eski, kart: eski.durum === "onayda" ? [] : eski.kart || [], hata: 0 } : { ...eski, kaynak: "ozel", durum: "geldi", medya: [], kart: [], gonderen: uid, hata: 0, bildirildi: false, kacirma: 0 };
  for (const md of [...bekleyen, ...dosyalar]) if (!x.medya.some((y) => y.uid === md.uid)) x.medya.push({ file_id: md.file_id, tur: md.tur, belge: md.belge || false, boyut: md.boyut || 0, w: md.w || 0, h: md.h || 0, uid: md.uid });
  if (grup) x.bedenGrubu = grup;
  x.sonMedya = bildirimSonra ? simdi : simdi - 120; // kod mesajıyla gelenler hemen hazırlanır
  x.durum = "geldi";
  if (bildirimSonra) x.bildirildi = false;
  modeller[kod] = x;
  await yazKV(env, "selin:modeller", modeller);
  if (bekleyen.length) await env.KAYIT.delete(bekleyenAnahtar(uid));
  if (album) await env.KAYIT.put(`selin:album:${album}`, kod, { expirationTtl: 3600 });
  return x;
}

// Bugünün listesinden kalanlar (gönderilen ve /yok yazılanlar çıkar) — "alındı" mesajının altına (kullanıcı kararı 29 Ekim).
export async function kalanSatiri(env, simdi = Math.floor(Date.now() / 1000), modeller = null) {
  const istek = await oku(env, `selin:istek:${gunAnahtari(simdi)}`, null);
  if (!istek || !istek.kodlar.length) return "";
  modeller = modeller || (await oku(env, "selin:modeller", {}));
  const kalan = istek.kodlar.filter((k) => modeller[k] && ozelMi(modeller[k]) && modeller[k].durum === "istendi");
  return kalan.length ? `\nKalan ${kalan.length} model: ${kalan.join(", ")}` : `\nBugünün ${istek.kodlar.length} modeli tamam`;
}

async function alindiMetni(env, kod, x) {
  const foto = x.medya.filter((y) => y.tur === "foto");
  const video = x.medya.filter((y) => y.tur === "video");
  const st = (await stokBilgisi(env, [kod]))[kod];
  const notlar = [];
  if (!x.bedenGrubu) notlar.push("Beden yazılmadı; taslakta 📏 ile seçebilirsiniz.");
  if (!st) notlar.push("Bu kod Vegawin'de yok; fiyat yoksa sitede \"Ask price\" görünür.");
  else if (!(st.toplam > 0)) notlar.push("Vegawin'de stoğu 0 görünüyor.");
  if (foto.some((f) => !f.belge)) notlar.push("Bazı fotoğraflar sıkıştırılmış geldi; en iyi kalite için FOTOĞRAFLARI 📎 → Dosya olarak gönderin (videoları DEĞİL).");
  const buyuk = video.filter((v) => v.boyut > VIDEO_SINIR);
  if (buyuk.length) notlar.push(`⚠️ ${buyuk.length} video 20 MB'tan büyük (${buyuk.map((v) => MB(v.boyut)).join(", ")}) — sitede OYNAMAZ. Videoyu NORMAL video olarak (dosya olarak değil; Telegram sıkıştırır) tekrar gönderin, yazısına ${kod} yazın.`);
  const grupAd = x.bedenGrubu ? BEDEN_GRUPLARI[x.bedenGrubu] : null;
  return `✅ ${kod} alındı (${foto.length} fotoğraf, ${video.length} video${grupAd ? `, ${grupAd.ad}` : ""})${notlar.length ? "\n• " + notlar.join("\n• ") : ""}${await kalanSatiri(env)}`;
}

// Kod mesajı ("3183 Küçük"): bekleyen yazısız dosyalar bağlanır. Bekleyen yoksa (ör. eski sürümde cevapsız
// kalanlar) sohbette bu mesajdan önceki yazısız dosyalar geri bulunur (arşive iletilerek okunur, en fazla 20 mesaj).
export async function ozelKodMesaji(env, m, kb, simdi, yaz) {
  let dosyalar = [];
  const bekleyen = await oku(env, bekleyenAnahtar(m.from.id), []);
  if (!bekleyen.length) dosyalar = await sohbettenGeriBul(env, m);
  const x = await dosyalariBagla(env, m.from.id, kb.kod, kb.grup, dosyalar, simdi);
  if (x.videoEklendi) return yaz(`🎬 ${kb.kod} sitede: video(lar) birkaç dakika içinde siteye eklenir (yeni onay gerekmez).`);
  if (!x.medya.length) return yaz(`⚠️ ${kb.kod} için dosya bulamadım. Fotoğraf ve videoyu gönderip kodu tekrar yazın.`);
  const modeller = await oku(env, "selin:modeller", {});
  modeller[kb.kod].bildirildi = true;
  await yazKV(env, "selin:modeller", modeller);
  return yaz(await alindiMetni(env, kb.kod, modeller[kb.kod]));
}

async function sohbettenGeriBul(env, m) {
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv) return [];
  const bulunan = [];
  for (let id = m.message_id - 1; id > 0 && id >= m.message_id - 20; id--) {
    const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: m.chat.id, message_id: id, disable_notification: true });
    if (!r.ok) continue;
    const f = r.result;
    const kendisi = f.forward_origin && f.forward_origin.type === "user" && f.forward_origin.sender_user && f.forward_origin.sender_user.id === m.from.id;
    if (!kendisi) continue; // Selin'in kendi mesajları
    if (kodBedenOku(f.caption) || kodBedenOku(f.text)) break; // önceki modelin sınırı
    const md = f.photo ? { file_id: f.photo[f.photo.length - 1].file_id, uid: f.photo[f.photo.length - 1].file_unique_id, tur: "foto", w: f.photo[f.photo.length - 1].width, h: f.photo[f.photo.length - 1].height }
      : f.document && /^image\//.test(f.document.mime_type || "") ? { file_id: f.document.file_id, uid: f.document.file_unique_id, tur: "foto", belge: true }
        : f.video ? { file_id: f.video.file_id, uid: f.video.file_unique_id, tur: "video", boyut: f.video.file_size || 0, w: f.video.width || 0, h: f.video.height || 0 }
          : belgeVideoMu(f.document) ? { file_id: f.document.file_id, uid: f.document.file_unique_id, tur: "video", boyut: f.document.file_size || 0, belge: true } : null;
    if (md) bulunan.unshift(md);
    else if (f.text) break; // başka bir yazı: sınır
  }
  return bulunan;
}

// Taslak: gelen dosyalardan (2 dk sessizlikten sonra), Vegawin fiyat/stokla. Çalışma başına bir model.
export async function ozelHazirlaAdimi(env, simdi) {
  if (!env.ANTHROPIC_API_KEY || (await sinirAsildiMi(env, simdi))) return;
  const modeller = await oku(env, "selin:modeller", {});
  const kod = Object.keys(modeller).find((k) => ozelMi(modeller[k]) && modeller[k].durum === "geldi" && simdi - (modeller[k].sonMedya || 0) >= 120);
  if (!kod) return;
  if (!modeller[kod].bildirildi) {
    modeller[kod].bildirildi = true;
    await yazKV(env, "selin:modeller", modeller);
    const kime = modeller[kod].gonderen ? [String(modeller[kod].gonderen)] : await sahipler(env);
    const metin = await alindiMetni(env, kod, modeller[kod]);
    for (const k of kime) await tg(env, "sendMessage", { chat_id: k, text: metin });
  }
  await ozelHazirla(env, kod, simdi, null);
}

export async function ozelHazirla(env, kod, simdi, duzeltme) {
  const modeller = await oku(env, "selin:modeller", {});
  const x = modeller[kod];
  const fotoMedya = x.medya.filter((y) => y.tur === "foto").slice(0, POZ_EN_FAZLA);
  const videolar = x.medya.filter((y) => y.tur === "video").map((v, i) => ({ id: i, file_id: v.file_id, boyut: v.boyut || 0, w: v.w || 0, belge: Boolean(v.belge) }));
  if (!fotoMedya.length) {
    x.durum = "geldi"; // fotoğraf bekleniyor
    x.sonMedya = simdi + 3600; // bir saat sonra tekrar bak
    await yazKV(env, "selin:modeller", modeller);
    for (const k of await sahipler(env)) await tg(env, "sendMessage", { chat_id: k, text: `📷 ${kod}: sadece video geldi. Fotoğrafları da 📎 → Dosya olarak gönderin.` });
    return;
  }
  try {
    const fotolar = [];
    for (const f of fotoMedya) fotolar.push({ ...f, b64: f.belge ? await belgeB64(env, f.file_id, 1024) : await dosyaB64(env, f.file_id) });
    const onceki = x.taslak && duzeltme ? { baslik: x.taslak.baslik, aciklama: x.taslak.aciklama } : null;
    const ai = await aciklamaYaz(env, { kod, fotolar, tarif: null, yazilar: [], duzeltme, onceki });
    const netlik = new Map((ai.pozlar || []).map((p) => [p.poz, p]));
    const st = (await stokBilgisi(env, [kod]))[kod] || null;
    const grup = x.bedenGrubu || (x.taslak && x.taslak.bedenGrubu) || null;
    const guncel = await oku(env, "selin:modeller", {});
    guncel[kod] = {
      ...guncel[kod], durum: "onayda", zaman: simdi, kart: [],
      taslak: {
        kaynak: "ozel", baslik: ai.baslik, kategori: ai.kategori, aciklama: ai.aciklama,
        bedenGrubu: grup, bedenOneri: grup, bedenler: grup ? BEDEN_GRUPLARI[grup].bedenler : null,
        fotolar: fotoMedya.map((f, i) => {
          const n = netlik.get(i + 1);
          return { id: i + 1, buyuk: { file_id: f.file_id, belge: Boolean(f.belge), width: f.w || 0, height: f.h || 0 }, orta: null, net: !n || n.net, not: n && !n.net ? n.not || "bulanık" : "" };
        }),
        videolar, yazilar: [], fiyat: st ? st.fiyat ?? null : null, stok: st ? st.toplam : null,
      },
    };
    await yazKV(env, "selin:modeller", guncel);
    for (const k of await sahipler(env)) await kartGoster(env, kod, k);
    // 5 Kasım (Patron): site onayı 0091 + Merdan'da; Selin taslak kartı Patron'a/Venom'a GELMEZ (Venom sadece durumu takip eder)
  } catch (e) {
    const g = await oku(env, "selin:modeller", {});
    g[kod].hata = (g[kod].hata || 0) + 1;
    g[kod].sonMedya = simdi; // 2 dk sonra yeniden dener
    if (g[kod].hata >= 3) g[kod].durum = "hazirlanamadi";
    await yazKV(env, "selin:modeller", g);
    await yazKV(env, "selin:hata", { zaman: simdi, hata: `ozel ${kod}: ${String(e && e.message).slice(0, 250)}` }, 7 * 86400);
    if (g[kod].hata >= 3) for (const k of await sahipler(env)) await tg(env, "sendMessage", { chat_id: k, text: `⚠️ ${kod} hazırlanamadı (${String(e && e.message).slice(0, 120)}). Dosyaları yeniden gönderebilirsiniz.` });
  }
}

// Bir kez (29 Ekim): "dosya olarak" gönderildiği için bağlanmayan videoları sohbetten bulur, taslağa ekler ve
// kartı sahibe yeniden gönderir. Sohbetteki son kart mesajından geriye en fazla 40 mesaja bakılır (arşive iletilerek).
const VIDEO_KURTAR = ["3183"];
export async function videoKurtarAdimi(env, simdi) {
  for (const kod of VIDEO_KURTAR) {
    if (await env.KAYIT.get(`selin:videoKurtar:${kod}`)) continue;
    await env.KAYIT.put(`selin:videoKurtar:${kod}`, "1");
    const modeller = await oku(env, "selin:modeller", {});
    const x = modeller[kod];
    if (!ozelMi(x) || !x.taslak) continue;
    const sohbet = String(x.gonderen || (await sahipler(env))[0] || "");
    const sonKart = Math.max(0, ...(x.kart || []).filter(([k]) => String(k) === sohbet).map(([, id]) => id));
    const arsiv = await oku(env, "arsiv", null);
    const bulunan = [];
    if (sonKart && arsiv) {
      for (let id = sonKart - 1; id > 0 && id >= sonKart - 40; id--) {
        const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: Number(sohbet), message_id: id, disable_notification: true });
        if (!r.ok) continue;
        const f = r.result;
        const kendisi = f.forward_origin && f.forward_origin.type === "user" && f.forward_origin.sender_user && String(f.forward_origin.sender_user.id) === sohbet;
        if (!kendisi) continue;
        const k = kodBedenOku(f.text) || kodBedenOku(f.caption);
        if (k && k.kod !== kod) break; // önceki modelin sınırı
        const v = f.video ? { file_id: f.video.file_id, uid: f.video.file_unique_id, boyut: f.video.file_size || 0, w: f.video.width || 0 }
          : belgeVideoMu(f.document) ? { file_id: f.document.file_id, uid: f.document.file_unique_id, boyut: f.document.file_size || 0, belge: true, ad: f.document.file_name } : null;
        if (v && !x.medya.some((y) => y.uid === v.uid)) bulunan.unshift(v);
      }
    }
    if (!bulunan.length) {
      await tg(env, "sendMessage", { chat_id: sohbet, text: `⚠️ ${kod}: videoyu sohbette bulamadım. Videoyu tekrar gönderip ardından "${kod}" yazın; taslağa eklenir.` });
      continue;
    }
    const g = await oku(env, "selin:modeller", {});
    for (const v of bulunan) {
      g[kod].medya.push({ ...v, tur: "video" });
      g[kod].taslak.videolar.push({ id: g[kod].taslak.videolar.length, file_id: v.file_id, boyut: v.boyut, w: v.w || 0, belge: Boolean(v.belge) });
    }
    g[kod].kart = [];
    await yazKV(env, "selin:modeller", g);
    await tg(env, "sendMessage", { chat_id: sohbet, text: `🎬 ${kod}: video taslağa eklendi (${bulunan.map((v) => v.ad || "video").join(", ")}). Güncel taslak:` });
    await kartGoster(env, kod, sohbet);
  }
}

// "Sil" (Sami'den "venom:siteSil"; Patron tek onay, 2 Kasım): önce siteden kaldırılır, hemen ardından iş Kemal'e
// ("venom:kanalSil") geçer; Patron'a tek sonuç mesajını Kemal gönderir (site sonucu da onda). "/geri" ("venom:siteGeri"):
// saklanan kayıt siteye aynen geri konur, sonra Kemal arşivdeki kopyaları kanala geri koyar ("venom:kanalGeri").
async function kemaleDevret(env, anahtar, kayit) {
  const l = (await env.KAYIT.get(anahtar, "json")) || [];
  l.push(kayit);
  await env.KAYIT.put(anahtar, JSON.stringify(l.slice(-50)));
}
// ---------- PELİN TESLİM → SİTE (4 Kasım; 5 Kasım düzeltmesi) ----------
// Kemal kanala paylaştı → Pelin VİDEOSU + Pelin FOTOĞRAFLARI (ön + set) siteye. 5 Kasım: video artık kanal mesaj numarasına bağlı
// DEĞİL (4–5 Kasım'da hiç eklenmedi): Pelin'in video dosyası Selin'in arşivine yüklenir, sitenin kendi oynatıcısında "selin/<kod>/1xx"
// olarak oynar. Kanal mesajı yalnızca yedek. Ne eklendiği tek tek söylenir; hiçbir şey eklenemediyse boş kayıt yazılmaz.
const PELIN_MEDYA = /volonte-(pelin|venom)[^/]*\/medya\/([a-f0-9]{16,64})/;
async function medyaBayt(env, url) {
  const m = String(url || "").match(PELIN_MEDYA);
  if (m) { const b = await env.KAYIT.get(`${m[1] === "venom" ? "venommedya" : "pelinmedya"}:${m[2]}`, "arrayBuffer").catch(() => null); if (b) return new Uint8Array(b); }
  const r = await fetch(url).catch(() => null);
  return r && r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
export async function pelinVideoKaydet(env, kod, url, simdi) {
  const anahtar = `selin:pelinVid:${kod}`, l = await oku(env, anahtar, []);
  const varolan = l.find((v) => v.kaynak === url);
  if (varolan) return `selin/${kod}/${varolan.n}`;
  const bayt = await medyaBayt(env, url);
  if (!bayt || !bayt.length || bayt.length > VIDEO_SINIR) return null;
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv || !arsiv.id) return null;
  const f = new FormData();
  f.append("chat_id", String(arsiv.id)); f.append("disable_notification", "true"); f.append("supports_streaming", "true");
  f.append("caption", `${kod} · Pelin videosu (site)`);
  f.append("video", new Blob([bayt], { type: "video/mp4" }), `${kod}.mp4`);
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/sendVideo`, { method: "POST", body: f }).then((x) => x.json()).catch(() => null);
  const v = r && r.ok && (r.result.video || r.result.animation || r.result.document);
  if (!v) return null;
  const n = 100 + l.length;
  l.push({ n, file_id: v.file_id, boyut: v.file_size || bayt.length, kaynak: url, zaman: simdi, uid: v.file_unique_id || null });
  await yazKV(env, anahtar, l);
  return `selin/${kod}/${n}`;
}
export async function pelinSiteAdimi(env, simdi) {
  if (!env.STOK || !env.GITHUB_TOKEN) return;
  const isler = await kuyruguAl(env, "pelinSite");
  return pelinSiteIsle(env, isler, simdi);
}
async function pelinSiteIsle(env, isler, simdi, { firlat = false } = {}) {
  // Tek seferlik (5 Kasım, Patron): KV "venom:pelinSiteEkle" = [{ kod, videoUrl, fotolar: [url] }] → aynı yol
  const ek = await env.KAYIT.get("venom:pelinSiteEkle", "json").catch(() => null);
  if (ek) { await env.KAYIT.delete("venom:pelinSiteEkle"); for (const y of [].concat(ek)) isler.push({ id: `elle-${simdi}`, ...y, zaman: simdi }); }
  for (const x of isler) {
    const bildir = async (text) => { for (const k of await sahipler(env)) await tg(env, "sendMessage", { chat_id: k, text }); };
    await yazKV(env, "selin:pelinSiteSon", { zaman: simdi, x }, 14 * 86400); // teşhis: gelen iş aynen saklanır
    try {
      const { liste } = await siteVerisi(env);
      const i = liste.findIndex((u) => String(u.kod) === String(x.kod));
      if (i < 0) { await bildir(`⚠️ ${x.kod}: Pelin videosu/fotoğrafları siteye eklenemedi — model sitede yok.`); continue; }
      const u = { ...liste[i] };
      let vid = null;
      if (/^https?:\/\//.test(String(x.videoUrl || ""))) vid = await pelinVideoKaydet(env, x.kod, x.videoUrl, simdi).catch(() => null);
      if (!vid && x.kanal && x.videoMesaj) vid = `${x.kanal}/${x.videoMesaj}`;
      const videoVardi = Boolean(vid && (u.videolar || []).includes(vid));
      if (vid) u.videolar = [vid, ...(u.videolar || []).filter((v) => v !== vid)];
      const eklenmis = await oku(env, `selin:pelinFoto:${x.kod}`, []);
      const adresler = [...new Set([x.foto, ...(x.fotolar || [])].filter((a) => /^https?:\/\//.test(String(a || ""))))].filter((a) => !eklenmis.includes(a)).slice(0, 6);
      const dosyalar = [], yollar = [];
      for (const [j, a] of adresler.entries()) {
        try {
          let bayt = await medyaBayt(env, a);
          if (!bayt) continue;
          if (env.IMAGES) { const k = await env.IMAGES.input(new Blob([bayt]).stream()).transform({ width: 1600, fit: "scale-down" }).output({ format: "image/jpeg", quality: 88 }); bayt = new Uint8Array(await k.response().arrayBuffer()); }
          const yol = `galeri/${x.kod}/pelin-${simdi.toString(36)}-${j}.jpg`;
          dosyalar.push({ yol, b64: b64Yap(bayt) }); yollar.push(yol); eklenmis.push(a);
        } catch { /* bu fotoğraf atlanır; sonuç mesajında sayı görünür */ }
      }
      if (yollar.length) { const f = [...(u.fotolar || [])]; f.splice(Math.min(1, f.length), 0, ...yollar); u.fotolar = f; } // ilk fotoğraf (afiş) yerinde kalır
      const videoTamam = Boolean(vid), istendi = Boolean(x.videoUrl || x.videoMesaj);
      // 5 Kasım (Patron kuralı): modele yeni renk eklenince açıklamadaki renkler de güncellenir
      let renkDegisti = false, renkNot = "";
      if (x.renk) {
        if (!(u.renkler || []).length) renkNot = `, ⚠️ açıklamaya renk yazılmadı (modelin ilk rengi kayıtlı değil — Venom: site_duzelt renkler)`;
        else {
          const r = renkleriUygula(u, [x.renk]);
          if (r.degisti) { u.renkler = r.urun.renkler; u.aciklama = r.urun.aciklama; renkDegisti = true; renkNot = `, açıklamaya renk eklendi (${r.eklenen.join(", ")})`; }
          else if (r.bilinmeyen.length) renkNot = `, ⚠️ "${r.bilinmeyen.join(", ")}" rengi çevrilemedi — açıklama değişmedi`;
        }
      }
      const ozet = `video ${videoTamam ? (videoVardi ? "✅ (zaten vardı)" : "✅ eklendi") : istendi ? "❌ EKLENEMEDİ" : "— (yok)"}, ${yollar.length}/${adresler.length} fotoğraf${renkNot}`;
      if (!yollar.length && (!videoTamam || videoVardi) && !renkDegisti) {
        await bildir(`⚠️ ${x.kod}: Pelin medyası siteye eklenemedi (${ozet}).`);
        await yazKV(env, "selin:hata", { zaman: simdi, hata: `pelinSite ${x.kod}: hiçbir şey eklenemedi (${ozet})` }, 7 * 86400);
        continue;
      }
      const yeni = [...liste]; yeni[i] = u;
      await siteyeYaz(env, dosyalar, yeni, `Selin: ${x.kod} Pelin medyası siteye eklendi (${ozet})`);
      // 6 Kasım (geri alma): bu paylaşımla siteye eklenenler — "son paylaşımı geri al" siteden de bunları kaldırır
      await env.KAYIT.put(`venom:siteSonEkleme:${x.kod}`, JSON.stringify({ zaman: simdi, fotolar: yollar, videolar: vid && !videoVardi ? [vid] : [] }), { expirationTtl: 14 * 86400 }).catch(() => null);
      await yazKV(env, `selin:pelinFoto:${x.kod}`, eklenmis.slice(-60));
      await bildir(`🌸 ${x.kod}: Pelin medyası siteye eklendi — ${ozet} (birkaç dakika içinde görünür).`);
      if (istendi && !videoTamam) await yazKV(env, "selin:hata", { zaman: simdi, hata: `pelinSite ${x.kod}: video eklenemedi (fotoğraflar eklendi)` }, 7 * 86400);
    } catch (e) {
      await yazKV(env, "selin:hata", { zaman: simdi, hata: `pelinSite ${x.kod}: ${String(e && e.message).slice(0, 300)}` }, 7 * 86400);
      if (firlat) throw e; // gecikmeli tekrar (ghTekrarAdimi) sonucu kendisi bildirir
      // 6 Kasım: GitHub 500/502 → 10 ve 30 dk sonra kendiliğinden tekrar (vazgeçme)
      if (ghGecici(e) && (await ghTekrarEkle(env, { tur: "pelinSite", kod: x.kod, x, hata: String(e.message).slice(0, 160) }, simdi))) { await bildir(`⏳ ${x.kod}: GitHub şu an hata veriyor; Pelin medyasını 10 dk ve 30 dk sonra kendim tekrar yükleyeceğim.`).catch(() => null); continue; }
      // GitHub anlık hatası (ör. 422) işi kaybettirmesin: 3 kez yeniden denenir
      if ((x.deneme || 0) < 3) { await kuyrugaEkle(env, "pelinSite", { ...x, id: `${x.id}-t${(x.deneme || 0) + 1}`, deneme: (x.deneme || 0) + 1 }).catch(() => null); continue; }
      await bildir(`⚠️ ${x.kod}: Pelin medyası siteye eklenemedi (hata Claude Code'da).`).catch(() => null);
    }
  }
  // Renk satırı (5 Kasım): KV "venom:siteRenk" = [{ kod, renkler: ["siyah", "koyu bordo"], mod: "yaz" | "ekle" }] (Venom site_duzelt renkler)
  const sr = await env.KAYIT.get("venom:siteRenk", "json").catch(() => null);
  if (sr) {
    await env.KAYIT.delete("venom:siteRenk");
    const { liste } = await siteVerisi(env);
    const notlar = [];
    for (const y of [].concat(sr)) {
      const i = liste.findIndex((u) => String(u.kod) === String(y.kod));
      if (i < 0) { notlar.push(`⚠️ ${y.kod}: sitede yok`); continue; }
      const r = renkleriUygula(y.mod === "ekle" ? liste[i] : { ...liste[i], renkler: [] }, y.renkler || []);
      if (r.bilinmeyen.length) { notlar.push(`⚠️ ${y.kod}: "${r.bilinmeyen.join(", ")}" rengi çevrilemedi — değiştirilmedi`); continue; }
      if (r.degisti) { liste[i] = r.urun; notlar.push(`🎨 ${y.kod}: açıklamadaki renkler → ${r.urun.renkler.join(", ")}`); } else notlar.push(`${y.kod}: renkler zaten böyle`);
    }
    if (notlar.some((n) => n.startsWith("🎨"))) await siteyeYaz(env, [], liste, `Selin: açıklama renkleri güncellendi (${notlar.filter((n) => n.startsWith("🎨")).map((n) => n.split(":")[0].slice(3)).join(", ")})`);
    await yazKV(env, "venom:siteRenkSonuc", notlar, 7 * 86400);
    for (const k of await sahipler(env)) await tg(env, "sendMessage", { chat_id: k, text: notlar.join("\n") }).catch(() => null);
  }
  // Tek seferlik (4 Kasım, Patron): KV "venom:siteFiyatSil" → açık depodaki ürün listesinden fiyatlar hemen çıkarılır
  if (await env.KAYIT.get("venom:siteFiyatSil")) {
    await env.KAYIT.delete("venom:siteFiyatSil");
    const { liste } = await siteVerisi(env);
    const n = liste.filter((u) => "fiyat" in u).length;
    if (n) { await siteyeYaz(env, [], liste, `Selin: fiyatlar açık depodan çıkarıldı (${n} model; fiyatın kaynağı Vegawin)`); await notEkle(env, `Fiyatlar açık depodan çıkarıldı (${n} model).`); }
  }
  // Tek seferlik (5 Kasım): KV "venom:siteFotoYenile" = { kod } → modelin fotoğrafları YENİ ADLA yeniden kaydedilir (site ve depo
  // okuyucu önbellekleri dosya adına göre 1 gün saklıyor; aynı adla değişen fotoğrafın eskisi görünmeye devam ediyordu)
  const fy = await env.KAYIT.get("venom:siteFotoYenile", "json");
  if (fy && fy.kod) {
    await env.KAYIT.delete("venom:siteFotoYenile");
    const { liste } = await siteVerisi(env);
    const i = liste.findIndex((u) => String(u.kod) === String(fy.kod));
    const notlar = [];
    if (i >= 0) {
      const u = { ...liste[i] }, dosyalar = [], yeni = [], ek = simdi.toString(36);
      for (const f of u.fotolar || []) {
        const m = String(f).match(new RegExp(`^(galeri/${fy.kod}/)([\\w]+?)(?:-[a-z0-9]{6,8})?\\.(jpe?g|png|webp)$`, "i"));
        if (!m) { yeni.push(f); continue; }
        const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${f}?ref=main`, { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github.raw+json", "user-agent": "volonte-selin", "x-github-api-version": "2022-11-28" } });
        if (!r.ok) { yeni.push(f); continue; }
        const yol = `${m[1]}${m[2]}-${ek}.${m[3].toLowerCase()}`;
        dosyalar.push({ yol, b64: b64Yap(new Uint8Array(await r.arrayBuffer())) }, { yol: f, b64: null });
        yeni.push(yol);
      }
      if (dosyalar.length) { u.fotolar = yeni; const l = [...liste]; l[i] = u; await siteyeYaz(env, dosyalar, l, `Selin: ${fy.kod} fotoğrafları yeni adla (önbellekteki eski görsel görünmesin)`); }
      notlar.push(`${fy.kod}: ${dosyalar.length / 2} fotoğraf yenilendi`);
    } else notlar.push(`${fy.kod}: sitede yok`);
    await yazKV(env, "venom:siteFotoYenileSonuc", { zaman: simdi, notlar, fotolar: i >= 0 ? (await siteVerisi(env)).liste[i].fotolar : [] }, 3 * 86400);
  }
  // Tek seferlik (4 Kasım, Patron): GİZLİ test sayfası (360° görüntüleyici) — KV "venom:siteDosyaYaz" = { dosyalar: [{ yol: "ozel/…html",
  // metin }], mesaj }. Sadece "ozel/" altına HTML; ürün listesi değişmez; sayfa hiçbir yerden bağlanmaz (noindex).
  const dy = await env.KAYIT.get("venom:siteDosyaYaz", "json");
  if (dy && Array.isArray(dy.dosyalar) && dy.dosyalar.length) {
    await env.KAYIT.delete("venom:siteDosyaYaz");
    const dosyalar = dy.dosyalar.filter((d) => /^ozel\/[a-z0-9-]+\.html$/.test(String(d.yol)) && typeof d.metin === "string").map((d) => ({ yol: d.yol, b64: b64Yap(new TextEncoder().encode(d.metin)) }));
    if (dosyalar.length) { const { liste } = await siteVerisi(env); await siteyeYaz(env, dosyalar, liste, `Selin: gizli test sayfası (${dosyalar.map((d) => d.yol).join(", ")})${dy.mesaj ? ` — ${String(dy.mesaj).slice(0, 80)}` : ""}`); }
    await yazKV(env, "venom:siteDosyaYazSonuc", { zaman: simdi, yazilan: dosyalar.map((d) => d.yol) }, 3 * 86400);
  }
  // Tek seferlik (4 Kasım, Patron: "sitedeki eski markasız 3627 medyasını kaldır"): KV "venom:siteMedyaKaldir" =
  // [{ kod, fotolar: ["galeri/..."], videolar: ["kanal/mesaj"] }] → sadece listelenen medya modelden çıkar (model sitede kalır)
  const km = (await env.KAYIT.get("venom:siteMedyaKaldir", "json")) || [];
  if (km.length) {
    await env.KAYIT.delete("venom:siteMedyaKaldir");
    const { liste } = await siteVerisi(env);
    const yeni = [...liste], dosyalar = [], notlar = [];
    for (const x of km) {
      const i = yeni.findIndex((u) => String(u.kod) === String(x.kod));
      if (i < 0) { notlar.push(`${x.kod}: sitede yok`); continue; }
      const u = { ...yeni[i] }, fs = new Set(x.fotolar || []), vs = new Set(x.videolar || []);
      const f0 = (u.fotolar || []).length, v0 = (u.videolar || []).length;
      u.fotolar = (u.fotolar || []).filter((f) => !fs.has(f));
      u.videolar = (u.videolar || []).filter((v) => !vs.has(v));
      for (const f of fs) if (/^galeri\/\d+\/pelin-[a-z0-9-]+\.jpg$/.test(f) && f0 !== u.fotolar.length) dosyalar.push({ yol: f, b64: null }); // sadece Pelin dosyası silinir
      for (const f of x.dosyaSil || []) if (new RegExp(`^galeri/${x.kod}/pelin-[a-z0-9-]+\\.jpg$`).test(f) && !u.fotolar.includes(f)) { dosyalar.push({ yol: f, b64: null }); notlar.push(`${x.kod}: sahipsiz dosya silindi (${f.split("/").pop()})`); } // listede olmayan eski Pelin dosyası
      yeni[i] = u;
      notlar.push(`${x.kod}: ${f0 - u.fotolar.length} fotoğraf, ${v0 - u.videolar.length} video kaldırıldı`);
    }
    if (dosyalar.length || notlar.some((n) => !/0 fotoğraf, 0 video|sitede yok/.test(n))) await siteyeYaz(env, dosyalar, yeni, `Selin: Patron onaylı medya kaldırma (${notlar.join("; ")})`);
    await yazKV(env, "venom:siteMedyaKaldirSonuc", { zaman: simdi, notlar }, 3 * 86400);
  }
}

export async function siteSilAdimi(env, simdi) {
  const l = (await env.KAYIT.get("venom:siteSil", "json")) || [];
  if (l.length) {
    await env.KAYIT.put("venom:siteSil", "[]");
    for (const x of l) {
      let site;
      const stok = await magazaStogu(env, x.kod); // 10 Kasım KESİN KURAL: mağazada stok varken siteden/kanaldan kaldırılmaz
      if (stok) { await yazKV(env, "venom:silEngelSonuc", { kod: String(x.kod), kim: x.kim, zaman: simdi, adet: stok, metin: STOK_KURALI(x.kod, stok) }, 3 * 86400); continue; }
      try { site = (await sitedenKaldir(env, String(x.kod), x.kim, simdi)) ? "kaldirildi" : "yoktu"; } catch (e) { site = `hata: ${String(e && e.message).slice(0, 150)}`; }
      if (x.kanal === false) continue;
      await kemaleDevret(env, "venom:kanalSil", { kod: String(x.kod), kim: x.kim, zaman: x.zaman || simdi, site });
    }
  }
  const g = (await env.KAYIT.get("venom:siteGeri", "json")) || [];
  if (g.length) {
    await env.KAYIT.put("venom:siteGeri", "[]");
    for (const x of g) {
      let site;
      try {
        const k = await oku(env, `selin:silinen:${x.kod}`, null);
        const { liste } = await siteVerisi(env);
        if (liste.some((u) => u.kod === String(x.kod))) site = "zaten sitede";
        else if (!k || !k.urun) site = "kayıt yok (eski kural öncesi silinmiş olabilir)";
        else {
          await siteyeYaz(env, [], [...liste, k.urun], `Selin: ${x.kod} siteye geri kondu (${x.kim})`);
          const modeller = await oku(env, "selin:modeller", {});
          modeller[x.kod] = { ...(modeller[x.kod] || {}), durum: "sitede", zaman: simdi };
          await yazKV(env, "selin:modeller", modeller);
          site = "geri kondu";
        }
      } catch (e) { site = `hata: ${String(e && e.message).slice(0, 150)}`; }
      await kemaleDevret(env, "venom:kanalGeri", { kod: String(x.kod), kim: x.kim, zaman: simdi, site });
    }
  }
}

// 20:00 — günün özeti; bugün istenip hiç dosyası gelmeyenler "gönderilemedi" listesine (sonra fal.ai).
// 3 gün üst üste fotoğraf gelmeyen modeller → Patron'a: Sami'nin deposundaki (Vegawin) stok, mağazalar AYRI
const patronKimligi = (env) => kimlikler(env.MURAT_ID)[0] || null;
async function bulunamiyorRaporu(env, kodlar, simdi) {
  const satir = [];
  for (const k of kodlar.slice(0, 40)) {
    const b = env.STOK ? await stokIste2(env, "/bilgi", { kod: k }) : null;
    const st = ((b && b.satirlar) || []).filter((r) => r.adet > 0).map((r) => `${r.magaza === "BLACKROSE" ? "BLACK ROSE" : r.magaza} ${r.adet} adet`);
    satir.push(`• ${k}: ${st.length ? `Vegawin'de ${st.join(" · ")}` : "Vegawin'de stok YOK (satılmış/düşülmüş olabilir)"}`);
  }
  const metin = [`🔎 Selin — ${kodlar.length} model 3 gün üst üste istendi, fotoğrafı gelmedi ("bulunamıyor"):`, ...satir, "", "Vegawin stok gösteriyorsa rafta gerçekten var mı bakılmalı; yoksa Vegawin'den düşülmeli. Fotoğrafı gelirse model kendiliğinden listeye döner."].join("\n");
  const kime = patronKimligi(env) ? [patronKimligi(env)] : await sahipler(env);
  for (const k of kime) await tg(env, "sendMessage", { chat_id: k, text: metin });
  await yazKV(env, "venom:selinBulunamiyor", { zaman: simdi, kodlar }, 30 * 86400);
}
export async function gunSonuOzeti(env, simdi) {
  if (saat(simdi) < GUN_SONU_SAATI) return;
  const gun = gunAnahtari(simdi);
  if (await env.KAYIT.get(`selin:gunSonu:${gun}`)) return;
  const istek = await oku(env, `selin:istek:${gun}`, null);
  const kime = await sahipler(env);
  if (!kime.length) return;
  await env.KAYIT.put(`selin:gunSonu:${gun}`, "1", { expirationTtl: 3 * 86400 });
  const modeller = await oku(env, "selin:modeller", {});
  const bugun = istek ? istek.kodlar : [];
  const gelmeyen = bugun.filter((k) => modeller[k] && modeller[k].durum === "istendi");
  const gelen = bugun.filter((k) => modeller[k] && ["geldi", "onayda", "yukleniyor", "sitede", "hazirlanamadi", "eklenmeyecek"].includes(modeller[k].durum));
  const yarin = [], bulunamiyor = [];
  for (const k of gelmeyen) {
    const n = (modeller[k].kacirma || 0) + 1;
    modeller[k] = { ...modeller[k], kacirma: n, durum: n >= KACIRMA_SINIRI ? "bulunamiyor" : "bekliyor", ...(n >= KACIRMA_SINIRI ? { bulunamiyorZaman: simdi } : {}) };
    (n >= KACIRMA_SINIRI ? bulunamiyor : yarin).push(k);
  }
  await yazKV(env, "selin:modeller", modeller);
  if (bulunamiyor.length) await bulunamiyorRaporu(env, bulunamiyor, simdi).catch(() => null);
  const ozel = Object.entries(modeller).filter(([, m]) => ozelMi(m));
  const say = (d, f = () => true) => ozel.filter(([k, m]) => m.durum === d && f(k, m)).map(([k]) => k);
  const bugunSitede = say("sitede", (k, m) => gunAnahtari(m.zaman || 0) === gun);
  const onayda = say("onayda");
  const gonderilemedi = say("gonderilemedi");
  const metin = [
    `🌙 Selin — ${gun.split("-").reverse().join(".")} gün sonu`,
    `İstenen: ${bugun.length} · gelen: ${gelen.length} · bugün siteye çıkan: ${bugunSitede.length}${bugunSitede.length ? ` (${bugunSitede.join(", ")})` : ""}`,
    `Onayınızı bekleyen: ${onayda.length}${onayda.length ? ` (${onayda.join(", ")})` : ""}`,
    `Fotoğrafı gelmeyen → yarın tekrar listede: ${yarin.length}${yarin.length ? ` (${yarin.join(", ")})` : ""}`,
    ...(bulunamiyor.length ? [`🔎 3 gün üst üste gelmeyen → "bulunamıyor" (Patron'a rapor gitti): ${bulunamiyor.join(", ")}`] : []),
    `Eski gönderilemeyen (liste boşalınca sırayla tekrar istenir): ${gonderilemedi.length}`,
  ].join("\n");
  for (const k of kime) await tg(env, "sendMessage", { chat_id: k, text: metin });
}

// Yeni akış videosu sitede: /v2/<kod>/<n> (sadece sitedeki yeni akış modelleri; Telegram'dan akıtılır, yazısız).
export async function ozelVideo(env, kod, n, aralik) {
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  // 5 Kasım: 100 ve üstü = Pelin videosu (Selin'in arşivine yüklenmiş; model hangi yolla sitede olursa olsun)
  const v = Number(n) >= 100 ? (await oku(env, `selin:pelinVid:${kod}`, [])).find((y) => y.n === Number(n))
    : ozelMi(m) && m.durum === "sitede" && m.taslak && m.taslak.videolar[Number(n)];
  if (!v || v.boyut > VIDEO_SINIR) return new Response("yok", { status: 404 });
  const anahtar = `selin:v2yol:${kod}:${n}`;
  let yol = await oku(env, anahtar, null);
  const simdi = Math.floor(Date.now() / 1000);
  if (!yol || simdi - yol.zaman > 3000) {
    const f = await tg(env, "getFile", { file_id: v.file_id });
    if (!f.ok) return new Response("indirilemedi", { status: 502 });
    yol = { yol: f.result.file_path, zaman: simdi };
    await yazKV(env, anahtar, yol);
  }
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${yol.yol}`, aralik ? { headers: { Range: aralik } } : {});
  const h = new Headers({ "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });
  for (const k of ["content-length", "content-range"]) if (r.headers.get(k)) h.set(k, r.headers.get(k));
  return new Response(r.body, { status: r.status, headers: h });
}

// ---------- VİDEO DENETİMİ (5 Kasım, Patron: "inen/inmeyen videolar", sessiz kayıp yok) ----------
// Sitedeki her video, sitenin kullandığı yolla (/v2 ya da /v) Selin'in içinden denenir (ilk 1 KB). Ekibin son 14 günde Selin'e
// gönderdiği videolar tek tek sınıflanır: büyük (Telegram botu 20 MB üstünü indiremez), format (MOV/HEVC), model sitede değil,
// sitede ama listede yok, adres hata veriyor. Sonuç KV "venom:videoDenetim" (Venom akşam raporu + Patron). 3 saatte bir;
// KV "venom:videoDenetimSimdi" → hemen. Büyük/inmeyen video için gönderene günde bir kez TEK mesaj: "tekrar gönder".
const MB = (b) => `${(Number(b || 0) / 1048576).toFixed(1)} MB`;
const VIDEO_PARCA = 18;
async function videoDene(env, v, kod) {
  const yeni = String(v).match(/^selin\/(\d{3,6})\/(\d+)$/);
  const id = String(v).split("/").pop();
  let r;
  try { r = yeni ? await ozelVideo(env, yeni[1], yeni[2], "bytes=0-1023") : /^\d+$/.test(id) ? await siteVideo(env, id, "bytes=0-1023") : null; } catch (e) { return { ok: false, denenemedi: true, neden: `denenemedi: ${String(e && e.message).slice(0, 80)}` }; }
  if (!r) return { ok: false, neden: "adres biçimi tanınmadı" };
  const durum = r.status;
  const bayt = new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (![200, 206].includes(durum)) return { ok: false, durum, neden: durum === 413 ? "büyük (20 MB üstü — Telegram botu indiremez)" : durum === 404 ? "bulunamadı (kayıt yok ya da video değil)" : durum === 502 ? "Telegram'dan indirilemedi" : `HTTP ${durum}` };
  const marka = bayt.length >= 12 && String.fromCharCode(...bayt.slice(4, 8)) === "ftyp" ? String.fromCharCode(...bayt.slice(8, 12)) : null;
  const iphone = durum === 206 && Boolean(r.headers.get("content-range")) && r.headers.get("accept-ranges") === "bytes";
  return { ok: true, durum, marka, mov: marka === "qt  ", iphone, boy: Number((r.headers.get("content-range") || "").split("/")[1]) || null, kod };
}
export async function videoDenetimAdimi(env, simdi, { zorla = false } = {}) {
  // Tek seferlik (5 Kasım): ilk denetim istek sınırına takıldı → "tekrar istendi" işaretleri sıfırlanır
  if (await env.KAYIT.get("venom:videoTekrarSifirla")) {
    await env.KAYIT.delete("venom:videoTekrarSifirla");
    for (const on of ["selin:tekrarIstendi:", "selin:tekrarMesaj:"]) {
      const ks = ((await Promise.resolve().then(() => env.KAYIT.list({ prefix: on })).catch(() => ({ keys: [] }))).keys || []).map((k) => k.name);
      for (const k of ks) await env.KAYIT.delete(k);
    }
  }
  const simdiIste = await env.KAYIT.get("venom:videoDenetimSimdi");
  if (simdiIste) await env.KAYIT.delete("venom:videoDenetimSimdi");
  // Cloudflare tek çalışmada en fazla 50 dış istek: her çalışmada PARCA video denenir, kalan sonraki çalışmada (5 dk)
  let durum = simdiIste || zorla ? null : await oku(env, "selin:videoDenetimDurum", null);
  if (!durum) {
    const son = await oku(env, "selin:videoDenetimZaman", 0);
    if (!zorla && !simdiIste && simdi - son < 3 * 3600) return null;
    await yazKV(env, "selin:videoDenetimZaman", simdi);
    durum = { basla: simdi, i: 0, site: [] };
  }
  const { liste } = await siteVerisi(env);
  const hepsi = liste.flatMap((u) => (u.videolar || []).map((v) => ({ kod: String(u.kod), v })));
  for (const x of hepsi.slice(durum.i, durum.i + VIDEO_PARCA)) {
    const d = await videoDene(env, x.v, x.kod);
    durum.site.push({ kod: x.kod, v: x.v, ok: d.ok, neden: d.neden || null, mov: Boolean(d.mov), iphone: Boolean(d.iphone), denenemedi: Boolean(d.denenemedi) });
    durum.i++;
  }
  if (durum.i < hepsi.length) { await yazKV(env, "selin:videoDenetimDurum", durum, 86400); return null; }
  await env.KAYIT.delete("selin:videoDenetimDurum");
  const modeller = await oku(env, "selin:modeller", {});
  const site = durum.site, sorunlar = [];
  for (const d of site) {
    if (d.denenemedi) continue; // Selin'in kendi sınırı/ağ hatası: video bozuk sayılmaz, gönderene mesaj gitmez (sonraki turda yeniden)
    if (!d.ok) sorunlar.push({ kod: d.kod, v: d.v, tur: "sitede-bozuk", neden: d.neden });
    else if (d.mov) sorunlar.push({ kod: d.kod, v: d.v, tur: "format", neden: "MOV (QuickTime) — bazı tarayıcılarda oynamayabilir" });
  }
  const sinir = simdi - 14 * 86400;
  for (const [kod, x] of Object.entries(modeller)) {
    if (!ozelMi(x) || Math.max(x.sonMedya || 0, x.zaman || 0) < sinir) continue;
    const vids = (x.medya || []).filter((y) => y.tur === "video");
    if (!vids.length) continue;
    const u = liste.find((y) => String(y.kod) === kod);
    vids.forEach((y, i) => {
      const k = { kod, n: i, boyut: y.boyut || 0, belge: Boolean(y.belge), uid: y.uid || null, kim: x.gonderen || null, tarih: Math.max(x.sonMedya || 0, x.zaman || 0) };
      if ((y.boyut || 0) > VIDEO_SINIR) sorunlar.push({ ...k, tur: "buyuk", neden: `${MB(y.boyut)} — Telegram botu 20 MB üstünü indiremez` });
      else if (!u) sorunlar.push({ ...k, tur: "sitede-degil", neden: `model sitede değil (Selin durumu: ${x.durum || "?"})` });
      else if (!(u.videolar || []).includes(`selin/${kod}/${i}`)) sorunlar.push({ ...k, tur: "listede-yok", neden: "model sitede ama bu video sitenin listesinde yok" });
    });
  }
  const sonuc = { zaman: simdi, siteVideo: site.length, denenemedi: site.filter((d) => d.denenemedi).length, calisan: site.filter((d) => d.ok).length, iphoneUygun: site.filter((d) => d.ok && d.iphone).length, sorunlar: sorunlar.slice(0, 200) };
  // Gönderene "tekrar gönder" (büyük ya da bozuk; günde bir kez, tek mesaj, aynı video bir kez)
  const kisiye = {};
  for (const s of sorunlar.filter((y) => ["buyuk", "sitede-bozuk"].includes(y.tur))) {
    const m = modeller[s.kod];
    const kim = s.kim || (m && m.gonderen);
    if (!kim || (m && !["sitede", "onayda", "geldi", "hazirlanamadi"].includes(m.durum))) continue;
    const isaret = `selin:tekrarIstendi:${s.uid || `${s.kod}-${s.v || s.n}`}`;
    if (await oku(env, isaret, null)) continue;
    await yazKV(env, isaret, simdi, 30 * 86400);
    (kisiye[kim] = kisiye[kim] || []).push(s);
  }
  for (const [kim, l] of Object.entries(kisiye)) {
    if (true) continue; // 6 Kasım: yerine siteDefteriAdimi günde bir TEK liste gönderir
    const r = await tg(env, "sendMessage", { chat_id: kim, text: [`📹 Bu modellerin videosu siteye KONAMADI, lütfen tekrar gönderin:`, ...l.map((s) => `• ${s.kod} — ${s.neden}`), "",
      "Nasıl: videoyu NORMAL video olarak gönderin (\"dosya olarak\" DEĞİL; Telegram sıkıştırır), 20 MB altında. Yazısına sadece kodu yazın (ör. 3612). Model sitedeyse video doğrudan siteye eklenir; fotoğrafları tekrar göndermeyin."].join("\n") }).catch(() => null);
    if (r && r.ok) { await yazKV(env, `selin:tekrarMesaj:${kim}:${gunAnahtari(simdi)}`, 1, 2 * 86400); sonuc.istenen = [...(sonuc.istenen || []), ...l.map((y) => y.kod)]; }
    else for (const y of l) await env.KAYIT.delete(`selin:tekrarIstendi:${y.uid || `${y.kod}-${y.v || y.n}`}`);
  }
  await env.KAYIT.put("venom:videoDenetim", JSON.stringify(sonuc), { expirationTtl: 30 * 86400 });
  return sonuc;
}
// Sitedeki modele SONRADAN gelen video (tekrar gönderim): taslağa eklenir, sitenin listesine doğrudan girer (yeniden onay yok)
export async function siteVideoEkleAdimi(env, simdi) {
  const l = await oku(env, "selin:videoEkle", []);
  if (!l.length) return;
  await env.KAYIT.delete("selin:videoEkle");
  const { liste } = await siteVerisi(env);
  const notlar = [];
  let degisti = false;
  for (const y of l) {
    const u = liste.find((z) => String(z.kod) === String(y.kod));
    const yol = `selin/${y.kod}/${y.id}`;
    if (!u) { notlar.push(`⚠️ ${y.kod}: video eklenemedi — model sitede değil`); continue; }
    if (!(u.videolar || []).includes(yol)) { u.videolar = [yol, ...(u.videolar || [])]; degisti = true; notlar.push(`🎬 ${y.kod}: yeni video siteye eklendi`); }
  }
  if (degisti) await siteyeYaz(env, [], liste, `Selin: tekrar gönderilen video siteye eklendi (${notlar.filter((n) => n.startsWith("🎬")).map((n) => n.split(":")[0].slice(3)).join(", ")})`);
  for (const y of l) if (y.kim) await tg(env, "sendMessage", { chat_id: y.kim, text: notlar.filter((n) => n.includes(` ${y.kod}:`)).join("\n") || `${y.kod}: işlendi` }).catch(() => null);
}
// Kemal kanala video koyunca (5 Kasım, Patron): aynı video siteye de. StokDO kuyruğu "kanalVideo" = { kod, mesajlar: [kanal mesaj no],
// sadeceVideosuzsa }. Mesaj arşive iletilir → video mu, boyut, file_unique_id; sitede aynı video varsa (uid) eklenmez.
async function siteVideoUidleri(env, u, modeller) {
  const uidler = new Set();
  const x = modeller[String(u.kod)];
  const vids = ((x && x.medya) || []).filter((y) => y.tur === "video");
  const pv = await oku(env, `selin:pelinVid:${u.kod}`, []);
  for (const v of u.videolar || []) {
    const m = String(v).match(/^selin\/(\d{3,6})\/(\d+)$/);
    if (m && Number(m[2]) >= 100) { const p = pv.find((y) => y.n === Number(m[2])); if (p && p.uid) uidler.add(p.uid); }
    else if (m) { const y = vids[Number(m[2])]; if (y && y.uid) uidler.add(y.uid); }
    else { const c = await oku(env, `selin:vid:${String(v).split("/").pop()}`, null); if (c && c.uid) uidler.add(c.uid); }
  }
  return uidler;
}
// 6 Kasım (temizlik B2): sitede aynı modelde AYNI video iki kez mi (Telegram dosya kimliği)? KV "venom:siteTekrarBul" → sonuç
// "venom:siteTekrarSonuc" = [{ kod, videolar: [fazla adresler] }] (Patron onayıyla Venom kartından kaldırılır)
// ---------- SİTE DEFTERİ (6 Kasım, Patron): TEK DOĞRU LİSTE — KV "venom:siteDefteri" ----------
// Sitedeki her model: kod, marka (Sami'den, kesin değilse "belirsiz" + sebep), renkler, fotoğraf sayısı, video sayısı / oynayan,
// son eklenme, gizli, stok, Merdan'dan video bekleniyor mu (20 MB üstü gelip yerine yenisi gelmeyen). Venom, Kemal, Pelin, Sami bu deftere bakar.
// Her gece baştan sayılır; site her değiştiğinde (siteyeYaz) hemen güncellenir (marka yeni modeller için sorulur).
const MB20 = 20 * 1024 * 1024;
export async function siteDefteriYenile(env, simdi, { liste = null, tam = false } = {}) {
  if (!liste) liste = (await siteVerisi(env)).liste;
  const modeller = await oku(env, "selin:modeller", {});
  const eski = (await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null)) || { modeller: {} };
  const vd = (await env.KAYIT.get("venom:videoDenetim", "json").catch(() => null)) || {};
  const bozuk = new Set((vd.sorunlar || []).filter((x) => x.tur === "sitede-bozuk").map((x) => x.v));
  const stok = env.STOK ? ((await stokIste2(env, "/toplu", { kodlar: liste.map((u) => String(u.kod)) })) || {}) : {};
  const defter = {}, duzeltme = [];
  for (const u of liste) {
    const kod = String(u.kod), e = eski.modeller[kod];
    let marka = e && e.marka && e.marka !== "belirsiz" && !tam ? { marka: e.marka } : await markaKesin(env, kod, { defterden: false }).catch(() => ({ marka: null, hata: "okunamadı" }));
    const x = modeller[kod], vids = ((x && x.medya) || []).filter((y) => y.tur === "video");
    // bekleniyor: Merdan'ın gönderdiği bir video 20 MB üstü geldi (siteye konamadı) ve sonradan yeniden gönderilen uygun video yok
    const sonBuyuk = vids.reduce((a, y, i) => (y.boyut > MB20 ? i : a), -1);
    const bekleniyor = sonBuyuk >= 0 && !vids.some((y) => y.yeniden && !(y.boyut > MB20));
    const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
    const yazi = (u.renkler && u.renkler.length) || (kart && kart.renk) ? null : await env.KAYIT.get(`yazi:${kod}`, "json").catch(() => null); // kanal yazısındaki renkler (İngilizce)
    const renkler = (u.renkler && u.renkler.length) ? u.renkler : kart && kart.renk ? [kart.renk] : yazi && yazi.renkEmin && (yazi.renkler || []).length ? yazi.renkler : [];
    const v = u.videolar || [];
    defter[kod] = { kod, marka: marka.marka || "belirsiz", ...(marka.marka ? {} : { markaNot: marka.hata || "Sami'de kayıt yok" }), renkler, foto: (u.fotolar || []).length, video: v.length,
      videoOynuyor: v.filter((y) => !bozuk.has(y)).length, eklenme: u.eklenme || null, gizli: Boolean(u.gizli), stok: (stok[kod] || {}).toplam ?? null,
      videoBekleniyor: bekleniyor, ...(bekleniyor ? { bekleyenMb: Math.round(vids[sonBuyuk].boyut / 1048576), gonderen: (x && x.gonderen) || null } : {}) };
    if (e && e.videoBekleniyor !== defter[kod].videoBekleniyor) duzeltme.push(`${kod}: video bekleniyor ${e.videoBekleniyor ? "→ HAYIR (video gelmiş)" : "→ EVET"}`);
    if (e && e.video !== defter[kod].video) duzeltme.push(`${kod}: video sayısı ${e.video} → ${defter[kod].video}`);
    if (e && e.marka !== defter[kod].marka) duzeltme.push(`${kod}: marka ${e.marka} → ${defter[kod].marka}`);
  }
  // eski/yanlış iç kayıtlar: Selin "sitede" diyor ama sitede yok → "kaldirildi"; sitede var ama kayıt "istendi/bekliyor" → "sitede"
  let mdeg = false;
  for (const [k, m] of Object.entries(modeller)) {
    if (!ozelMi(m)) continue;
    if (m.durum === "sitede" && !defter[k]) { modeller[k] = { ...m, durum: "kaldirildi", duzeltme: simdi }; mdeg = true; duzeltme.push(`${k}: Selin kaydı "sitede" idi, sitede yok → "kaldırıldı"`); }
    else if (defter[k] && ["istendi", "bekliyor", "bulunamiyor", "gonderilemedi"].includes(m.durum)) { modeller[k] = { ...m, durum: "sitede", duzeltme: simdi }; mdeg = true; duzeltme.push(`${k}: Selin kaydı "${m.durum}" idi, sitede var → "sitede"`); }
  }
  if (mdeg) await yazKV(env, "selin:modeller", modeller);
  const sonuc = { zaman: simdi, sayi: liste.length, modeller: defter };
  await env.KAYIT.put("venom:siteDefteri", JSON.stringify(sonuc));
  if (duzeltme.length) { const l = (await env.KAYIT.get("venom:siteDefteriDuzeltme", "json").catch(() => null)) || []; await env.KAYIT.put("venom:siteDefteriDuzeltme", JSON.stringify([...l, { zaman: simdi, duzeltme }].slice(-20)), { expirationTtl: 14 * 86400 }); }
  return { sayi: liste.length, duzeltme };
}
export async function siteDefteriAdimi(env, simdi) {
  const simdiIste = await env.KAYIT.get("venom:defterSimdi");
  if (simdiIste) await env.KAYIT.delete("venom:defterSimdi");
  const gece = saat(simdi) >= 3 && saat(simdi) < 5 && !(await oku(env, `selin:defter:${gunAnahtari(simdi)}`, null));
  if (simdiIste || gece) { await siteDefteriYenile(env, simdi, { tam: true }); await yazKV(env, `selin:defter:${gunAnahtari(simdi)}`, 1, 2 * 86400); }
  // Merdan'a günde BİR kez tek liste (11:00 sonrası): deftere göre videosu gerçekten beklenen modeller
  if (saat(simdi) < 11 || saat(simdi) >= 19 || (await oku(env, `selin:videoHatirlat:${gunAnahtari(simdi)}`, null))) return;
  const d = (await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null)) || { modeller: {} };
  const bek = Object.values(d.modeller).filter((m) => m.videoBekleniyor && !m.gizli);
  await yazKV(env, `selin:videoHatirlat:${gunAnahtari(simdi)}`, 1, 2 * 86400);
  if (!bek.length) return;
  const kisiye = {};
  for (const m of bek) { const k = String(m.gonderen || (await sahipler(env))[0] || ""); if (k) (kisiye[k] = kisiye[k] || []).push(m); }
  for (const [k, l] of Object.entries(kisiye)) await tg(env, "sendMessage", { chat_id: k, text: [`📹 Videosu beklenen modeller (${l.length}):`, ...l.map((m, i) => `${i + 1}. ${m.kod} — önceki video ${m.bekleyenMb} MB geldi, siteye konamadı`), "", "Lütfen NORMAL video olarak (📎 dosya olarak DEĞİL), 20 MB altı gönderin; yazısına sadece kodu yazın. Video doğrudan siteye eklenir."].join("\n") }).catch(() => null);
}
// 6 Kasım (yedek): her gece (03–05) Selin'in iç kayıtları KV "yedek:<gün>:selin" (8 gün). Geri yükleme: araclar/yedek-geri.py
export async function selinYedekAdimi(env, simdi) {
  // Geri yükleme (tek seferlik): KV "venom:yedekGeriYukle:selin" = "YYYY-AA-GG" → o günün yedeği iç kayda yazılır
  const gy = await env.KAYIT.get("venom:yedekGeriYukle:selin");
  if (gy) {
    await env.KAYIT.delete("venom:yedekGeriYukle:selin");
    const y = await env.KAYIT.get(`yedek:${gy}:selin`, "json");
    if (y && y.veri) for (const [k, v] of Object.entries(y.veri)) if (v != null) await (typeof v === "string" ? env.KAYIT.put(k, v) : yazKV(env, k, v));
    await env.KAYIT.put("venom:yedekGeriYukleSonuc:selin", JSON.stringify({ zaman: simdi, gun: gy, ok: Boolean(y), anahtar: y ? Object.keys(y.veri).length : 0 }), { expirationTtl: 7 * 86400 });
  }
  const s = saat(simdi);
  if (s < 3 || s >= 5 || (await oku(env, `selin:yedek:${gunAnahtari(simdi)}`, null))) return;
  const veri = { "selin:modeller": await oku(env, "selin:modeller", {}), "selin:sahip": await env.KAYIT.get("selin:sahip") };
  for (let i = 0; i < 3; i++) { const g = gunAnahtari(simdi - i * 86400); veri[`selin:istek:${g}`] = await oku(env, `selin:istek:${g}`, null); }
  await env.KAYIT.put(`yedek:${gunAnahtari(simdi)}:selin`, JSON.stringify({ zaman: simdi, veri }), { expirationTtl: 8 * 86400 });
  await yazKV(env, `selin:yedek:${gunAnahtari(simdi)}`, 1, 2 * 86400);
}
export async function siteTekrarBulAdimi(env, simdi) {
  if (!(await env.KAYIT.get("venom:siteTekrarBul"))) return;
  const { liste } = await siteVerisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const sonuc = [];
  for (const u of liste) {
    const x = modeller[String(u.kod)];
    const vids = ((x && x.medya) || []).filter((y) => y.tur === "video");
    const pv = await oku(env, `selin:pelinVid:${u.kod}`, []);
    const gor = new Map(), fazla = [];
    for (const v of u.videolar || []) {
      const m = String(v).match(/^selin\/(\d{3,6})\/(\d+)$/);
      let uid = null;
      if (m && Number(m[2]) >= 100) { const p2 = pv.find((y) => y.n === Number(m[2])); uid = p2 && (p2.uid || p2.kaynak); }
      else if (m) { const y = vids[Number(m[2])]; uid = y && y.uid; }
      else { const c = await oku(env, `selin:vid:${String(v).split("/").pop()}`, null); uid = c && c.uid; }
      if (uid && gor.has(uid)) fazla.push(v); else if (uid) gor.set(uid, v);
    }
    if (fazla.length) sonuc.push({ kod: String(u.kod), videolar: fazla, fotolar: [] });
  }
  if (await env.KAYIT.put("venom:siteTekrarSonuc", JSON.stringify({ zaman: simdi, sonuc }), { expirationTtl: 7 * 86400 }).then(() => true).catch(() => false)) await env.KAYIT.delete("venom:siteTekrarBul").catch(() => null);
}
export async function kanalVideoAdimi(env, simdi) {
  const isler = await kuyruguAl(env, "kanalVideo");
  if (!isler.length) return;
  const arsiv = await oku(env, "arsiv", null), kanal = await oku(env, "kanal", null);
  if (!arsiv || !kanal) return;
  const { liste } = await siteVerisi(env);
  const modeller = await oku(env, "selin:modeller", {});
  const notlar = [], sorun = [];
  for (const x of isler) {
    const u = liste.find((y) => String(y.kod) === String(x.kod));
    if (!u || (x.sadeceVideosuzsa && (u.videolar || []).length)) continue;
    const bilinen = await siteVideoUidleri(env, u, modeller);
    for (const id of (x.mesajlar || []).filter((n) => Number(n) > 0).slice(0, 10)) {
      const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: Number(id), disable_notification: true }).catch(() => null);
      const m = r && r.ok && (r.result.video || r.result.animation);
      if (!m) continue;
      if ((m.file_size || 0) > VIDEO_SINIR) { sorun.push({ kod: String(x.kod), v: `kanal/${id}`, tur: "buyuk", neden: `kanaldaki video ${MB(m.file_size)} — Telegram botu 20 MB üstünü indiremez`, zaman: simdi }); continue; }
      if (bilinen.has(m.file_unique_id)) continue;
      await yazKV(env, `selin:vid:${id}`, { file_id: m.file_id, boyut: m.file_size || 0, w: m.width || 0, h: m.height || 0, uid: m.file_unique_id });
      u.videolar = [`${kanal.kullanici || "kanal"}/${id}`, ...(u.videolar || [])];
      bilinen.add(m.file_unique_id);
      notlar.push(String(x.kod));
    }
  }
  if (notlar.length) {
    await siteyeYaz(env, [], liste, `Selin: kanaldaki video siteye eklendi (${[...new Set(notlar)].join(", ")})`);
    for (const k of new Set(notlar)) { const u = liste.find((y) => String(y.kod) === k); await env.KAYIT.put(`venom:siteSonEkleme:${k}`, JSON.stringify({ zaman: simdi, fotolar: [], videolar: (u.videolar || []).slice(0, 1) }), { expirationTtl: 14 * 86400 }).catch(() => null); }
  }
  if (notlar.length || sorun.length) {
    const l = await oku(env, "venom:kanalVideoSonuc", []);
    await env.KAYIT.put("venom:kanalVideoSonuc", JSON.stringify([...l, ...[...new Set(notlar)].map((k) => ({ kod: k, ok: true, zaman: simdi })), ...sorun.map((y) => ({ ...y, ok: false }))].slice(-50)), { expirationTtl: 7 * 86400 });
  }
}

// ---------- Toplu yükleme (kullanıcı kararı, 27 Ekim) ----------
// Envanter taramasındaki fotoğraflı modeller tek tek sorulmadan hazırlanır, TEK LİSTE ile onaya gelir
// ("✅ Hepsini siteye yükle"; istenmeyen: /cikar 3183). Onaydan sonra her çalışmada 2 model yüklenir.
const TOPLU_SURUM = "v1";
const TOPLU_PARTI = 2;

// Yeni toplu parti (günlük karşılaştırmadaki eksikler). Aktif parti varken başlamaz.
export async function topluBaslat(env, simdi, kodlar, kaynak) {
  const t = await oku(env, "selin:toplu", null);
  if (t && t.surum === TOPLU_SURUM && t.durum !== "bitti") return false;
  if (!kodlar.length) return false;
  const modeller = await oku(env, "selin:modeller", {});
  for (const k of kodlar) modeller[k] = { ...(modeller[k] || {}), durum: "hazirlaniyor", zaman: simdi, kim: kaynak, toplu: true, kart: [] };
  await yazKV(env, "selin:modeller", modeller);
  const sira = await oku(env, "selin:hazirla", []);
  await yazKV(env, "selin:hazirla", [...kodlar, ...sira.filter((k) => !kodlar.includes(k))]);
  await yazKV(env, "selin:toplu", { surum: TOPLU_SURUM, durum: "hazirlaniyor", kodlar, haric: [], basarisiz: [], yuklenen: [], basla: simdi, kaynak });
  return true;
}

export async function topluAdimi(env, simdi) {
  let t = await oku(env, "selin:toplu", null);
  if (!t || t.surum !== TOPLU_SURUM) {
    const tarama = await oku(env, "selin:tarama", null);
    if (!tarama || !tarama.bitti) return;
    const ozet = taramaOzeti(tarama);
    const modeller = await oku(env, "selin:modeller", {});
    const kodlar = ozet.fotolu.filter((k) => !(modeller[k] && ["sitede", "yukleniyor"].includes(modeller[k].durum)));
    for (const k of kodlar) modeller[k] = { ...(modeller[k] || {}), durum: "hazirlaniyor", zaman: simdi, kim: "Toplu (Vegawin)", toplu: true, kart: [] };
    await yazKV(env, "selin:modeller", modeller);
    const sira = await oku(env, "selin:hazirla", []);
    await yazKV(env, "selin:hazirla", [...kodlar, ...sira.filter((k) => !kodlar.includes(k))]); // önce toplu olanlar
    t = { surum: TOPLU_SURUM, durum: "hazirlaniyor", kodlar, haric: [], basarisiz: [], yuklenen: [], basla: simdi };
    await yazKV(env, "selin:toplu", t);
    return notEkle(env, `Toplu yükleme başladı: ${kodlar.length} model hazırlanıyor; bitince tek liste gelecek.`);
  }
  const modeller = await oku(env, "selin:modeller", {});
  if (t.durum === "hazirlaniyor") {
    // Hazırlık bitti mi? (onayda ya da fotoğrafsız/okunamadı → başarısız)
    const bekleyen = t.kodlar.filter((k) => modeller[k] && modeller[k].durum === "hazirlaniyor"); // videodan kare bekleyenler listeyi bekletmez
    if (bekleyen.length) return;
    t.basarisiz = t.kodlar.filter((k) => !modeller[k] || modeller[k].durum !== "onayda");
    t.durum = "onayda";
    await yazKV(env, "selin:toplu", t);
    return topluListeGonder(env, t, modeller);
  }
  if (t.durum === "yukleniyor" && !kilitli(env)) {
    const kalan = t.kodlar.filter((k) => !t.haric.includes(k) && !t.basarisiz.includes(k) && !t.yuklenen.includes(k) && modeller[k] && modeller[k].durum === "onayda"); // sorulan model yüklenmez
    for (const kod of kalan.slice(0, TOPLU_PARTI)) {
      try {
        await siteyeYukle(env, kod, t.onaylayan, simdi);
        t.yuklenen.push(kod);
      } catch (e) {
        t.basarisiz.push(kod);
        await notEkle(env, `${kod} siteye yüklenemedi: ${String(e && e.message).slice(0, 120)}`);
      }
      await yazKV(env, "selin:toplu", t);
    }
    if (kalan.length <= TOPLU_PARTI) {
      t.durum = "bitti";
      t.bitis = simdi;
      await yazKV(env, "selin:toplu", t);
      await herkese(env, `✅ Toplu yükleme bitti: ${t.yuklenen.length} model siteye eklendi.${t.basarisiz.length ? `\nYüklenemeyen/hazırlanamayan: ${t.basarisiz.join(", ")}` : ""}\n${env.SITE_URL}/urunler.html`, { disable_web_page_preview: true });
    }
  }
}

async function topluListeGonder(env, t, modeller) {
  const satirlar = t.kodlar.filter((k) => !t.basarisiz.includes(k)).map((k) => {
    const x = modeller[k].taslak;
    const foto = x.fotolar.filter((f) => f.net).length;
    return `${k} · ${x.baslik} · ${KATEGORI_ADI[x.kategori] || x.kategori} · ${x.bedenler || "beden yok"} · ${x.fiyat != null ? `${x.fiyat} $` : "fiyat yok"} · ${foto} foto`;
  });
  const parcalar = [];
  let parca = `🌸 Selin — toplu yükleme listesi (${satirlar.length} model, Vegawin'de stok + fiyat var):\n`;
  for (const s of satirlar) {
    if ((parca + s).length > 3800) { parcalar.push(parca); parca = ""; }
    parca += `\n${s}`;
  }
  parca += `${t.basarisiz.length ? `\n\nHazırlanamayan (fotoğraf okunamadı): ${t.basarisiz.join(", ")}` : ""}${env.SELF_URL ? `\n\n👀 Siteye nasıl gireceğini görmek için: ${await onizlemeLinki(env)}` : ""}\n\nİstemediğiniz model varsa: /cikar 3183 3186\nSonra tek düğmeyle hepsi siteye çıkar.`;
  parcalar.push(parca);
  for (const [i, metin] of parcalar.entries()) {
    const son = i === parcalar.length - 1;
    await herkese(env, metin, son ? { reply_markup: { inline_keyboard: [[{ text: "✅ Hepsini siteye yükle", callback_data: "tu:evet" }]] } } : {});
  }
}

async function topluOnay(env, cq, kim, simdi, cevapla) {
  const t = await oku(env, "selin:toplu", null);
  if (!t || t.durum !== "onayda") return cevapla(t && t.onaylayan ? `${t.onaylayan} zaten onayladı.` : "Onay bekleyen toplu liste yok.");
  if (kilitli(env)) return cevapla(KILIT_MESAJI);
  t.durum = "yukleniyor";
  t.onaylayan = kim;
  t.onayZaman = simdi;
  await yazKV(env, "selin:toplu", t);
  const sayi = t.kodlar.length - t.haric.length - t.basarisiz.length;
  await cevapla("Yükleme başladı");
  return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✅ ${kim} onayladı: ${sayi} model 5 dakikada 2'şer siteye yükleniyor (yaklaşık ${Math.ceil(sayi / TOPLU_PARTI) * 5} dk).${t.haric.length ? ` Çıkarılan: ${t.haric.join(", ")}.` : ""}` });
}

// ---------- Sabah raporu (09:25) ve Kemal × Sami karşılaştırması ----------
// Stok bilgisinin tek kaynağı Sami. Vegawin'de stok + fiyatı olan, Kemal'in kanalında paylaşılmış ama sitede
// olmayan modeller "eksik" sayılır ve yeni toplu listeye hazırlanır (tek onayla siteye çıkar).
const TOPLU_GUNLUK_EN_FAZLA = 30;
const ISLEMDE = ["sitede", "yukleniyor", "onayda", "hazirlaniyor", "kare-bekliyor", "kanaldayok"];

export async function eksikModeller(env) {
  if (!env.STOK) return [];
  const stok = await (await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/stoktakiler", { method: "POST", body: "{}" })).json();
  const bilgi = await kanalBilgisi(env);
  const sitede = new Set((await siteVerisi(env)).liste.map((u) => u.kod));
  const modeller = await oku(env, "selin:modeller", {});
  return stok.map((x) => x.kod).filter((k) => modelSecenekleri(k, bilgi.kodlar, bilgi.kodsuz).length && !sitede.has(k))
    .filter((k) => !(modeller[k] && (ISLEMDE.includes(modeller[k].durum) || (modeller[k].durum === "eklenmeyecek" && !modeller[k].not))));
}

export async function selinSabahRaporu(env, simdi) {
  if (!(await raporZamani(env, simdi, [9, 25], "selin:sabahRaporu"))) return;
  const dun = gunAnahtari(simdi - 86400);
  const site = (await siteVerisi(env)).liste;
  const modeller = await oku(env, "selin:modeller", {});
  const ozel = Object.entries(modeller).filter(([, m]) => ozelMi(m));
  const say = (d) => ozel.filter(([, m]) => m.durum === d).map(([k]) => k);
  const istek = await oku(env, `selin:istek:${dun}`, null);
  const dunEklenen = site.filter((u) => u.eklenme === dun).map((u) => u.kod);
  const satir = [
    `🌸 Selin — ${gunAnahtari(simdi).split("-").reverse().join(".")} sabah raporu`,
    "",
    `Sitede: ${site.filter((u) => !u.gizli).length} model görünür, ${site.filter((u) => u.gizli).length} stoksuz (gizli).`,
    `Dün: istenen ${istek ? istek.kodlar.length : 0}, siteye eklenen ${dunEklenen.length}${dunEklenen.length ? ` (${dunEklenen.join(", ")})` : ""}.`,
    `Onay bekleyen: ${say("onayda").length} · gönderilemeyen (sonra fal.ai): ${say("gonderilemedi").length}.`,
    `Bugün ${ISTEK_SAATI}:00'da ${GUNLUK_ISTEK} model istenecek (kod ve fiyat Vegawin'den).`,
  ];
  const sorunlar = say("hazirlanamadi").length ? [`Hazırlanamayan ${say("hazirlanamadi").length} model (dosyalar yeniden gönderilmeli)`] : [];
  if (!(await sahipler(env)).length) sorunlar.push("Selin'in istek göndereceği 0091 hesabı tanımlı değil (/sahip)");
  await raporuBirak(env, "selin", simdi, {
    ozet: `Sitede ${site.filter((u) => !u.gizli).length} model; dün ${dunEklenen.length} eklendi; onay bekleyen ${say("onayda").length}; gönderilemeyen ${say("gonderilemedi").length}.`,
    sorunlar,
    yapilacak: say("onayda").length ? [`Selin'in ${say("onayda").length} taslağını onaylayın`] : [],
  });
  await grubaGonder(env, "selin", satir.join("\n"), tg);
}

// ---------- Envanter taraması: Vegawin'de stok + fiyat olan ve Telegram'da fotoğrafı bulunan modeller ----------
// (Toplu yükleme için sayım, kullanıcı isteği 27 Ekim.) Bir kez çalışır; her 5 dakikada en fazla ~12 kanal
// mesajı arşive iletilerek bakılır (bir modelde ilk fotoğraf bulununca o model biter). Sonuç KV'de "selin:rapor".
const TARAMA_SURUM = "v1";
const TARAMA_ILETME = 12;

function taramaOzeti(d) {
  const s = Object.entries(d.sonuc);
  return {
    surum: d.surum, basla: d.basla, bitis: d.bitis || null, bitti: d.bitti,
    stokVeFiyat: d.stokFiyat, telegramda: d.telegramda.length, zatenSitede: d.telegramda.filter((k) => d.sitede.includes(k)).length,
    taranan: s.length, kalan: d.sira.length,
    fotolu: s.filter(([, x]) => x.foto > 0).map(([k]) => k),
    sadeceVideo: s.filter(([, x]) => !x.foto && x.video > 0).map(([k]) => k),
    medyaYok: s.filter(([, x]) => !x.foto && !x.video).map(([k]) => k),
  };
}

export async function taramaAdimi(env, simdi) {
  let d = await oku(env, "selin:tarama", null);
  if (!d || d.surum !== TARAMA_SURUM) {
    if (!env.STOK) return;
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/stoktakiler", { method: "POST", body: "{}" });
    const stok = await r.json();
    const bilgi = await kanalBilgisi(env);
    const sitede = (await siteVerisi(env)).liste.map((u) => u.kod);
    const telegramda = stok.map((x) => x.kod).filter((k) => modelSecenekleri(k, bilgi.kodlar, bilgi.kodsuz).length);
    d = { surum: TARAMA_SURUM, basla: simdi, stokFiyat: stok.length, telegramda, sitede, sira: telegramda.filter((k) => !sitede.includes(k)), sonuc: {}, bitti: false };
    await yazKV(env, "selin:tarama", d);
    await yazKV(env, "selin:rapor", taramaOzeti(d));
    return;
  }
  if (d.bitti) return;
  const arsiv = await oku(env, "arsiv", null);
  const bilgi = await kanalBilgisi(env);
  if (!arsiv || !bilgi.kanal) return yazKV(env, "selin:hata", { zaman: simdi, hata: "tarama: arşiv ya da kanal bilgisi yok" }, 7 * 86400);
  let iletilen = 0;
  while (d.sira.length && iletilen < TARAMA_ILETME) {
    const kod = d.sira[0];
    let foto = 0;
    let video = 0;
    dis: for (const sec of modelSecenekleri(kod, bilgi.kodlar, bilgi.kodsuz, 2)) {
      for (const id of sec.ids) {
        iletilen++;
        const r = await tg(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: bilgi.kanal.id, message_id: id, disable_notification: true });
        if (!r.ok) continue;
        if (r.result.photo) { foto++; break dis; }
        if (r.result.video) video++;
      }
    }
    d.sonuc[kod] = { foto, video };
    d.sira.shift();
  }
  if (!d.sira.length) {
    d.bitti = true;
    d.bitis = simdi;
  }
  await yazKV(env, "selin:tarama", d);
  await yazKV(env, "selin:rapor", { ...taramaOzeti(d), son: simdi, buCalisma: iletilen }); // tarama sürerken her çalışmada (kısa süreli)
}

// ---------- 5) Videodan kare (sadece videosu olan modeller) ----------
// Selin isteği "kareler" dalına yazar → GitHub Actions (ücretsiz, telegram-bot/kare/) videoyu bu
// Worker'dan tek kullanımlık bağlantıyla indirir, en net kareleri seçer, dala kaydeder ve /kare'ye
// haber verir → adaylar Telegram'da onaya gelir. Onaylanan kare "kare:<kod>" (ortak beyin) olur:
// Selin sitede, Kemal kanal paylaşımında videolarla birlikte kullanır. Bir model için bir kez üretilir.
const KARE_DALI = "kareler";
const VIDEO_SINIR = 20 * 1024 * 1024; // Telegram botlar 20 MB'tan büyük dosyayı indiremez

export async function kareIste(env, kod, simdi, videolar) {
  const kayit = await oku(env, `kare:${kod}`, null);
  // Bir kez üretilir: onaylı/onayda/reddedilmiş ya da son 1 saatte istenmişse tekrar istenmez.
  if (kayit && (["onayli", "onayda", "reddedildi"].includes(kayit.durum) || (kayit.durum === "isleniyor" && simdi - kayit.zaman < 3600))) return kayit;
  const uygun = videolar.filter((v) => v.file_id && (!v.boyut || v.boyut <= VIDEO_SINIR)).sort((a, b) => b.w - a.w);
  if (!uygun.length) {
    const k = { durum: "basarisiz", zaman: simdi, hata: videolar.length ? "video 20 MB'tan büyük; Telegram botların bu boyutta dosya indirmesine izin vermiyor" : "modelin videosu yok" };
    await yazKV(env, `kare:${kod}`, k);
    await notEkle(env, `${kod}: videodan kare çıkarılamadı (${k.hata}).`);
    return k;
  }
  const t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await yazKV(env, `selin:kareIstek:${t}`, { kod, file_id: uygun[0].file_id }, 3 * 3600);
  const yol = `/contents/istekler/${encodeURIComponent(kod)}.json`;
  let sha;
  try { sha = (await gh(env, `${yol}?ref=${KARE_DALI}`)).sha; } catch { sha = undefined; }
  const icerik = { kod, t, video: `${env.SELF_URL}/video?t=${t}`, geri: `${env.SELF_URL}/kare` };
  await gh(env, yol, { method: "PUT", body: JSON.stringify({ message: `Selin: ${kod} için videodan kare isteği`, branch: KARE_DALI, content: btoa(JSON.stringify(icerik)), ...(sha ? { sha } : {}) }) });
  const k = { durum: "isleniyor", zaman: simdi };
  await yazKV(env, `kare:${kod}`, k);
  return { ...k, yeni: true };
}

// Elle istek (/kare 3104): her çalışmada bir model.
async function kareSiraGuvenli(env, simdi) {
  const sira = await oku(env, "selin:kareSira", []);
  if (!sira.length || !env.GITHUB_TOKEN) return;
  const kod = sira[0];
  await yazKV(env, "selin:kareSira", sira.slice(1));
  try {
    const bilgi = await kanalBilgisi(env);
    const { fotolar, videolar } = await medyaTopla(env, bilgi, kod);
    if (fotolar.length && !videolar.length) return notEkle(env, `${kod}: kanalda fotoğrafı var, kareye gerek yok.`);
    const k = await kareIste(env, kod, simdi, videolar);
    const modeller = await oku(env, "selin:modeller", {});
    if (k.durum === "isleniyor" || k.durum === "onayda") {
      if (!modeller[kod] || !["sitede", "onayda", "yukleniyor"].includes(modeller[kod].durum)) {
        modeller[kod] = { ...(modeller[kod] || {}), durum: "kare-bekliyor", zaman: simdi };
        await yazKV(env, "selin:modeller", modeller);
      }
      if (k.yeni) await notEkle(env, `${kod}: videodan kare çıkarılıyor.`);
    } else if (k.durum === "onayli") await notEkle(env, `${kod}: bu model için onaylı kare zaten var (bir kez üretilir).`);
  } catch (e) {
    // Geçici hata: model kaybolmasın, en fazla 3 kez yeniden denenir.
    await yazKV(env, "selin:hata", { zaman: simdi, hata: `kare ${kod}: ${String(e && e.message).slice(0, 400)}` }, 7 * 86400);
    const deneme = await oku(env, "selin:kareDeneme", {});
    deneme[kod] = (deneme[kod] || 0) + 1;
    await yazKV(env, "selin:kareDeneme", deneme, 7 * 86400);
    if (deneme[kod] < 3) await yazKV(env, "selin:kareSira", [...(await oku(env, "selin:kareSira", [])).filter((k) => k !== kod), kod]);
    else await notEkle(env, `${kod}: videodan kare isteği 3 kez başarısız oldu (${String(e && e.message).slice(0, 150)}).`);
  }
}

// GitHub Actions videoyu buradan indirir (tek kullanımlık bağlantı; bot anahtarı dışarı çıkmaz).
async function videoVer(env, t) {
  const kayit = t && (await oku(env, `selin:kareIstek:${t}`, null));
  if (!kayit) return new Response("geçersiz", { status: 404 });
  const f = await tg(env, "getFile", { file_id: kayit.file_id });
  if (!f.ok) return new Response(`indirilemedi: ${f.description}`, { status: 413 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  return new Response(r.body, { status: r.status, headers: { "content-type": "video/mp4" } });
}

// GitHub Actions bitince: adaylar Telegram'da onaya gönderilir.
export async function kareGeldi(env, govde, simdi) {
  const kayit = govde.t && (await oku(env, `selin:kareIstek:${govde.t}`, null));
  if (!kayit || kayit.kod !== govde.kod) return new Response("yetkisiz", { status: 403 });
  await env.KAYIT.delete(`selin:kareIstek:${govde.t}`);
  const kod = kayit.kod;
  const onEk = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/`;
  const dosyalar = (govde.dosyalar || []).filter((d) => String(d.url || "").startsWith(onEk)).slice(0, 3);
  if (govde.hata || !dosyalar.length) {
    await yazKV(env, `kare:${kod}`, { durum: "basarisiz", zaman: simdi, hata: govde.hata || "aday yok" });
    await notEkle(env, `${kod}: videodan net kare çıkarılamadı (${govde.hata || "aday yok"}); ücretli araçlar kapalı, şimdilik fotoğrafsız.`);
    return new Response("ok");
  }
  // Adaylar önce arşiv kanalına gider (Selin'in dosya kimlikleri için); ekip özetten "Kareler" ile görür.
  const arsiv = await oku(env, "arsiv", null);
  if (!arsiv) return new Response("arşiv yok", { status: 502 });
  const baslik = `🎞 ${kod} — videodan seçilen kareler (onay bekliyor)`;
  // Albüm en az 2 fotoğraf ister; tek aday tek fotoğraf olarak gider.
  const r = dosyalar.length > 1
    ? await tg(env, "sendMediaGroup", { chat_id: arsiv.id, disable_notification: true, media: dosyalar.map((d, i) => ({ type: "photo", media: d.url, ...(i === 0 ? { caption: baslik } : {}) })) })
    : await tg(env, "sendPhoto", { chat_id: arsiv.id, disable_notification: true, photo: dosyalar[0].url, caption: baslik }).then((x) => (x.ok ? { ok: true, result: [x.result] } : x));
  if (!r.ok) return new Response("gönderilemedi", { status: 502 });
  const adaylar = r.result.map((mesaj, i) => {
    const b = mesaj.photo[mesaj.photo.length - 1];
    return { url: dosyalar[i].url, file_id: b.file_id, w: b.width, h: b.height };
  });
  await yazKV(env, `kare:${kod}`, { durum: "onayda", zaman: simdi, adaylar, kart: [] });
  const bekleyen = await oku(env, "selin:kareBekleyen", []);
  if (!bekleyen.includes(kod)) await yazKV(env, "selin:kareBekleyen", [...bekleyen, kod]);
  return new Response("ok");
}

function kareKartMetni(kod, n) {
  return `🎞 ${kod}: sadece videosu olan model. Videodan en net ${n} kareyi seçtim (yapay zekâ yok; kare videonun kendisi, ürün olduğu gibi). Hangisi kullanılsın?\nOnaylanan fotoğraf sitede ve Kemal'in kanal paylaşımında videolarla ve bedenlerle birlikte kullanılır.`;
}
const kareKlavye = (kod, n) => ({ inline_keyboard: [Array.from({ length: n }, (_, i) => ({ text: `✅ ${i + 1}. kare`, callback_data: `kk:${kod}:${i + 1}` })), [{ text: "❌ Hiçbiri", callback_data: `kk:${kod}:0` }]] });

async function kareSecildi(env, cq, kod, n, kim, simdi, cevapla) {
  const k = await oku(env, `kare:${kod}`, null);
  if (!k || k.durum !== "onayda") return cevapla(k && k.kim ? `${k.kim} zaten seçti.` : "Bu seçim artık geçerli değil.");
  const secilen = n > 0 && k.adaylar[n - 1];
  if (n > 0 && !secilen) return cevapla("Geçersiz düğme.");
  const yeni = secilen
    ? { durum: "onayli", zaman: simdi, kim, url: secilen.url, file_id: secilen.file_id, w: secilen.w, h: secilen.h }
    : { durum: "reddedildi", zaman: simdi, kim };
  await yazKV(env, `kare:${kod}`, yeni);
  await yazKV(env, "selin:kareBekleyen", (await oku(env, "selin:kareBekleyen", [])).filter((x) => x !== kod));
  await cevapla(secilen ? "Kare onaylandı" : "Tamam");
  const metin = secilen
    ? `✅ ${kod}: ${n}. kare seçildi (${kim}). Selin siteye hazırlıyor; Kemal kanalda videolarla birlikte kullanacak.`
    : `❌ ${kod}: kare kullanılmayacak (${kim}). Ücretli araçlar kapalı; model şimdilik fotoğrafsız.`;
  for (const [kisi, id] of k.kart || []) await tg(env, "editMessageText", { chat_id: kisi, message_id: id, text: metin });
  if (!secilen) return;
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];
  if (!m || m.durum === "kare-bekliyor" || (m.durum === "eklenmeyecek" && m.not === "fotoğraf yok")) {
    modeller[kod] = { ...(m || {}), durum: "hazirlaniyor", zaman: simdi, kim };
    await yazKV(env, "selin:modeller", modeller);
    const sira = await oku(env, "selin:hazirla", []);
    if (!sira.includes(kod)) await yazKV(env, "selin:hazirla", [kod, ...sira]);
  }
}

// ---------- 4) Telegram: düğmeler ve komutlar ----------

export async function guncelleme(u, env) {
  if (u.callback_query && u.callback_query.data === GUNCEL) return tg(env, "answerCallbackQuery", { callback_query_id: u.callback_query.id, text: "⏩ Güncel kart aşağıda" });
  if (u.callback_query) { await defterKarar(env, "selin", u.callback_query); return dugme(u.callback_query, env); }
  if (u.my_chat_member) return grupUyeligi(u.my_chat_member, env, "selin", "🌸 Selin (site)", tg);
  const m = u.message;
  if (!m || m.chat.type !== "private" || !m.from) return;
  // /kimim: herkes kendi Telegram kimliğini öğrenir (izin vermek için). Yabancıya başka hiçbir cevap yok.
  if ((m.text || "").trim().toLowerCase().startsWith("/kimim")) {
    await env.KAYIT.put(`venom:kimlik:selin:${m.from.id}`, JSON.stringify({ ad: kisiAdi(m.from), kullanici: m.from.username || null, zaman: Math.floor(Date.now() / 1000) }), { expirationTtl: 7 * 86400 });
    return tg(env, "sendMessage", { chat_id: m.chat.id, text: `Telegram kimliğiniz: ${m.from.id}\n${izinli(m.from.id, env) ? "✅ Selin'de izinlisiniz." : "⛔ Henüz izinli değilsiniz; bu numarayı yöneticiye iletin."}` });
  }
  if (!izinli(m.from.id, env)) {
    await env.KAYIT.put(`selin:bekleyen:${m.from.id}`, JSON.stringify({ ad: kisiAdi(m.from), kullanici: m.from.username || null }), { expirationTtl: 7 * 86400 });
    return; // Selin sadece yöneticiler ve ekiple konuşur
  }
  const simdi = Math.floor(Date.now() / 1000);
  const yaz = (text, ek = {}) => tg(env, "sendMessage", { chat_id: m.chat.id, text, disable_web_page_preview: true, ...ek });
  const metin = (m.text || "").trim();
  const [komut, ...arg] = metin.split(/\s+/);

  // Üretim referansı (kullanıcı kararı 28 Ekim): askı/manken fotoğrafları Selin'e özelden gönderilir;
  // üretim SADECE bunları kullanır (kanaldan alınmaz). Yazı: "3618 askı" ya da "3618 manken".
  const medya = m.photo ? { file_id: m.photo[m.photo.length - 1].file_id, tur: "foto" }
    : m.document && /^image\//.test(m.document.mime_type || "") ? { file_id: m.document.file_id, tur: "foto", belge: true }
      : m.video ? { file_id: m.video.file_id, tur: "video", boyut: m.video.file_size || 0 }
        : belgeVideoMu(m.document) ? { file_id: m.document.file_id, tur: "video", boyut: m.document.file_size || 0, belge: true } : null; // "dosya olarak" video (IMG_4581.MP4)
  if (medya) {
    // 5 Kasım: 20 MB üstü video hemen söylenir (Telegram botu indiremez → sitede oynamaz); kayıt Venom raporu için
    if (medya.tur === "video" && (medya.boyut || 0) > VIDEO_SINIR) {
      const l = await oku(env, "venom:videoGelenBuyuk", []);
      await env.KAYIT.put("venom:videoGelenBuyuk", JSON.stringify([...l, { zaman: simdi, kim: kisiAdi(m.from), kod: (String(m.caption || "").match(/\b(\d{3,6})\b/) || [])[1] || null, boyut: medya.boyut, belge: Boolean(medya.belge) }].slice(-50)), { expirationTtl: 14 * 86400 });
      await yaz(`⚠️ Bu video ${MB(medya.boyut)} — Telegram botları 20 MB üstünü indiremez, sitede OYNAMAZ.\nLütfen NORMAL video olarak gönderin (📎 "dosya olarak" DEĞİL; Telegram sıkıştırır) ya da sıkıştırıp tekrar gönderin. Yazısına kodu yazın.`);
    }
    const r = String(m.caption || "").trim().match(/^(\d{3,6})\s*(ask[ıi]|manken)/i);
    if (!r) return ozelMedya(env, m, { ...medya, uid: (m.document || m.video || (m.photo && m.photo[m.photo.length - 1]) || {}).file_unique_id || medya.file_id, w: (m.photo ? m.photo[m.photo.length - 1].width : m.video ? m.video.width : 0) || 0, h: (m.photo ? m.photo[m.photo.length - 1].height : m.video ? m.video.height : 0) || 0 }, simdi);
    const kod = r[1];
    const rol = /manken/i.test(r[2] || "") ? "manken" : "aski";
    const liste = await oku(env, `selin:referans:${kod}`, []);
    liste.push({ ...medya, rol, kim: kisiAdi(m.from), zaman: simdi });
    await yazKV(env, `selin:referans:${kod}`, liste.slice(-12));
    const say = (x) => liste.filter((y) => y.rol === x && y.tur === "foto").length;
    return yaz(`✅ ${kod}: ${rol === "aski" ? "askı" : "manken"} ${medya.tur === "video" ? "videosu" : "fotoğrafı"} kaydedildi. Bu modelde: askı ${say("aski")}, manken ${say("manken")} fotoğraf.\nSadece üretimde kullanılır; kanala ya da siteye gitmez.`);
  }

  // Kod mesajı: "3183 Küçük" → son gelen yazısız dosyalar bu koda (yeni akış, 29 Ekim)
  const kodYazi = metin.match(/^(\d{3,6})(\s+(k[üu][çc][üu]k|b[üu]y[üu]k|ik[iı]s[iı]\s*de))?\s*$/i) ? kodBedenOku(metin) : null;
  if (kodYazi) return ozelKodMesaji(env, m, kodYazi, simdi, yaz);

  const duzeltilen = await env.KAYIT.get(`selin:duzelt:${m.from.id}`);
  if (duzeltilen && metin && !metin.startsWith("/")) {
    await env.KAYIT.delete(`selin:duzelt:${m.from.id}`);
    await yaz(`✏️ ${duzeltilen} düzeltiliyor...`);
    const mm = (await oku(env, "selin:modeller", {}))[duzeltilen];
    if (ozelMi(mm)) return ozelHazirla(env, duzeltilen, simdi, metin.slice(0, 800)); // kart sahibe yeniden gider
    await taslakHazirla(env, duzeltilen, simdi, metin.slice(0, 800));
    await kartGoster(env, duzeltilen, m.chat.id); // düzeltilen taslak sadece düzelteni bekletmesin
    return;
  }
  if (komut === "/beden") {
    const kod = String(arg[0] || "").toUpperCase();
    const bedenler = arg.slice(1).join(" ").replace(/[,/ ]+/g, "-");
    const modeller = await oku(env, "selin:modeller", {});
    if (!modeller[kod] || !modeller[kod].taslak || !bedenler) return yaz("Örnek: /beden 3194 38-40-42-44");
    modeller[kod].taslak.bedenler = bedenler;
    modeller[kod].taslak.bedenGrubu = Object.keys(BEDEN_GRUPLARI).find((k) => BEDEN_GRUPLARI[k].bedenler === bedenler) || null;
    await yazKV(env, "selin:modeller", modeller);
    return yaz(`✅ ${kod} bedenleri: ${bedenler}. Karttaki "✅ Onayla, siteye yükle"ye basabilirsiniz.`);
  }
  if (komut === "/site") return siteListesi(env, m.chat.id, Number(arg[0] || 1));
  if (komut === "/cikar") {
    const t = await oku(env, "selin:toplu", null);
    if (!t || t.durum !== "onayda") return yaz("Şu an onay bekleyen toplu liste yok.");
    const kodlar = arg.map((x) => x.toUpperCase()).filter((k) => t.kodlar.includes(k));
    t.haric = [...new Set([...(t.haric || []), ...kodlar])];
    await yazKV(env, "selin:toplu", t);
    return yaz(kodlar.length ? `Listeden çıkarıldı: ${kodlar.join(", ")}. Yüklenecek: ${t.kodlar.length - t.haric.length - (t.basarisiz || []).length} model.` : "Listede bu kod yok. Örnek: /cikar 3183 3186");
  }
  if (komut === "/kare") {
    const kod = String(arg[0] || "").toUpperCase();
    if (!kod) return yaz("Örnek: /kare 3104 — sadece videosu olan modelde videodan net kare çıkarır.");
    const sira = await oku(env, "selin:kareSira", []);
    if (!sira.includes(kod)) await yazKV(env, "selin:kareSira", [...sira, kod]);
    return yaz(`🎞 ${kod} sıraya alındı; videodan kareler birkaç dakika içinde onayınıza gelecek.`);
  }
  if (komut === "/onizleme") return yaz(await onizlemeMesaji(env));
  if (komut === "/yok") {
    const modeller = await oku(env, "selin:modeller", {});
    const kodlar = arg.filter((k) => /^\d{3,6}$/.test(k));
    for (const k of kodlar) modeller[k] = { ...(modeller[k] || {}), kaynak: "ozel", durum: "gonderilemedi", zaman: simdi, yokDendi: true };
    await yazKV(env, "selin:modeller", modeller);
    return yaz(kodlar.length ? `Tamam: ${kodlar.join(", ")} gönderilemeyenlere alındı (sonra fal.ai ile).${await kalanSatiri(env, simdi, modeller)}` : "Örnek: /yok 3503 3518");
  }
  if (komut === "/gonderilemeyenler") {
    const modeller = await oku(env, "selin:modeller", {});
    const l = Object.keys(modeller).filter((k) => ozelMi(modeller[k]) && modeller[k].durum === "gonderilemedi");
    return yaz(`Gönderilemeyen ${l.length} model${l.length ? `: ${l.join(", ")}` : ""}.`);
  }
  if (komut === "/sahip") {
    if (!yoneticiMi(m.from.id, env)) return yaz("Bu ayar sadece Murat ve Merdan'da.");
    await env.KAYIT.put("selin:sahip", String(m.from.id));
    return yaz(`✅ Günlük model istekleri ve taslaklar artık bu hesaba (${m.from.id}) gelecek.`);
  }
  if (komut === "/liste") {
    if (!yoneticiMi(m.from.id, env)) return yaz("Bu ayar sadece Murat ve Merdan'da.");
    const gun = gunAnahtari(simdi);
    await env.KAYIT.put(`selin:liste:${gun}`, "0", { expirationTtl: 3 * 86400 });
    return yaz("Tamam, liste birkaç dakika içinde gelecek (09:00–21:00 arası).");
  }
  // Eski akışın menüsü kapalı (kullanıcı kararı 29 Ekim). Sadece kısa yardım.
  if (komut === "/yardim" || komut === "/start") {
    return yaz("🌸 Selin: fotoğrafları (📎 Dosya olarak) ve videoyu gönderin, ardından kod ve beden yazın: 3183 Küçük · 3184 Büyük · 3185 İkisi de.\nGönderemeyeceğiniz model: /yok 3183 · Liste: /gonderilemeyenler");
  }
  if (metin && !metin.startsWith("/")) return yaz("Kod ve beden yazın, örnek: 3183 Küçük");
}

async function siteListesi(env, sohbet, sayfa) {
  const { liste } = await siteVerisi(env);
  if (!liste.length) return tg(env, "sendMessage", { chat_id: sohbet, text: "Sitede henüz Selin'in eklediği model yok." });
  const boy = 20;
  const parca = liste.slice((sayfa - 1) * boy, sayfa * boy);
  return tg(env, "sendMessage", {
    chat_id: sohbet,
    text: `Sitedeki modeller (${liste.length}) — sayfa ${sayfa}:\n${parca.map((u) => `• ${u.kod} — ${u.baslik} · ${env.SITE_URL}/#model/${encodeURIComponent(u.kod)}`).join("\n")}\n\nKaldırmak için düğmeye basın (onay sorulur). Sonraki sayfa: /site ${sayfa + 1}`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: parca.map((u) => [{ text: `🗑 ${u.kod} siteden kaldır`, callback_data: `sk:${u.kod}` }]) },
  });
}

async function dugme(cq, env) {
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!izinli(cq.from.id, env)) return cevapla("Yetkiniz yok.");
  const [islem, kod, ek] = String(cq.data || "").split(":");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };
  if (islem === "kk") return kareSecildi(env, cq, kod, Number(ek), kim, simdi, cevapla);
  if (islem === "sg") return goster(env, cq, kod);
  if (islem === "tu") return topluOnay(env, cq, kim, simdi, cevapla);
  const modeller = await oku(env, "selin:modeller", {});
  const m = modeller[kod];

  if (islem === "sv" || islem === "sy") {
    if (!m || m.durum !== "soruldu") return cevapla(m ? `${m.kim || "Biri"} zaten işaretledi.` : "Geçersiz.");
    m.durum = islem === "sv" ? "hazirlaniyor" : "yok";
    m.zaman = simdi;
    m.kim = kim;
    await yazKV(env, "selin:modeller", modeller);
    if (islem === "sv") await yazKV(env, "selin:hazirla", [...(await oku(env, "selin:hazirla", [])), kod]);
    for (const [k, id] of m.mesajlar || []) {
      await tg(env, "editMessageCaption", { chat_id: k, message_id: id, caption: `${kod} — ${islem === "sv" ? `✅ mağazada var (${kim}); hazırlanıyor` : `❌ yok (${kim})`}`, reply_markup: { inline_keyboard: [] } });
    }
    return cevapla(islem === "sv" ? "Hazırlığa alındı" : "Tamam");
  }
  if (islem === "sb") {
    const grup = ek;
    if (!m || m.durum !== "onayda" || !BEDEN_GRUPLARI[grup]) return cevapla("Bu taslak artık geçerli değil.");
    m.taslak.bedenGrubu = grup;
    m.taslak.bedenler = BEDEN_GRUPLARI[grup].bedenler;
    await yazKV(env, "selin:modeller", modeller);
    await cevapla(`Beden: ${BEDEN_GRUPLARI[grup].ad} (${BEDEN_GRUPLARI[grup].bedenler})`);
    const kanal = await oku(env, "kanal", null);
    for (const [k, id] of m.kart || []) {
      await tg(env, "editMessageText", { chat_id: k, message_id: id, text: kartMetni(kod, m.taslak, kanal && kanal.kullanici), disable_web_page_preview: true, reply_markup: kartKlavye(kod, m.taslak) });
    }
    return;
  }
  if (islem === "so" || islem === "sx" || islem === "sd") {
    if (!m || m.durum !== "onayda") return cevapla("Bu taslak artık geçerli değil.");
    if (islem === "sd") {
      await env.KAYIT.put(`selin:duzelt:${cq.from.id}`, kod, { expirationTtl: 86400 });
      await cevapla("Ne değişsin?");
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod}: ne değişsin? Yazın (ör. "açıklamada saten kumaş geçsin", "başlık: Satin Wrap Dress", "2. pozu çıkar").` });
    }
    if (islem === "so" && !m.taslak.bedenler) return cevapla("Önce beden seçin: 📏 Küçük / Büyük / İkisi de");
    if (islem === "so" && kilitli(env) && !ozelMi(m)) return cevapla(KILIT_MESAJI); // yeni akış: sahip onayıyla yüklenir
    m.durum = islem === "so" ? "yukleniyor" : "eklenmeyecek";
    m.kim = kim;
    await yazKV(env, "selin:modeller", modeller); // önce kilitle
    const kartlar = m.kart || [];
    if (islem === "sx") {
      await cevapla("Eklenmeyecek");
      for (const [k, id] of kartlar) await tg(env, "editMessageText", { chat_id: k, message_id: id, text: `❌ ${kod}: siteye eklenmeyecek (${kim}).` });
      return;
    }
    await cevapla("Siteye yükleniyor...");
    try {
      const link = await siteyeYukle(env, kod, kim, simdi);
      try { await yeniModelBildir(env, kod, kim, simdi); } catch { /* Kemal'e haber gidemezse site yüklemesi yine tamam */ }
      for (const [k, id] of kartlar) await tg(env, "editMessageText", { chat_id: k, message_id: id, text: `✅ ${kod} siteye eklendi (${kim}). Sayfa 1–2 dakikada yayında:\n${link}`, disable_web_page_preview: true });
    } catch (e) {
      const geri = await oku(env, "selin:modeller", {});
      geri[kod].durum = "onayda";
      await yazKV(env, "selin:modeller", geri);
      if (ghGecici(e) && (await ghTekrarEkle(env, { tur: "onay", kod, kim, chat: cq.message.chat.id, kartlar, hata: String(e.message).slice(0, 160) }, simdi))) // 6 Kasım: vazgeçme
        await tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⏳ ${kod}: GitHub şu an hata veriyor (${e.message}). Vazgeçmiyorum: 10 dk ve 30 dk sonra kendim tekrar deneyeceğim, yüklenince haber veririm.` });
      else await tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⚠️ ${kod} siteye yüklenemedi: ${e.message}. Taslak duruyor, tekrar deneyebilirsiniz.` });
    }
    return;
  }
  if (islem === "sk") {
    await cevapla("Emin misiniz?");
    return tg(env, "editMessageReplyMarkup", { ...benim, reply_markup: { inline_keyboard: [[{ text: `🗑 Evet, ${kod} siteden kalksın`, callback_data: `se:${kod}` }, { text: "↩️ Vazgeç", callback_data: "sv0:" }]] } });
  }
  if (islem === "se") {
    await cevapla("Kaldırılıyor...");
    try {
      const ok = await sitedenKaldir(env, kod, kim, simdi);
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: ok ? `🗑 ${kod} siteden kaldırıldı (${kim}). Kanaldaki paylaşımlara dokunulmadı.` : `${kod} sitede değil.` });
    } catch (e) {
      return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⚠️ Kaldırılamadı: ${e.message}` });
    }
  }
  if (islem === "sv0") return cevapla("Vazgeçildi");
  return cevapla("Geçersiz düğme.");
}
