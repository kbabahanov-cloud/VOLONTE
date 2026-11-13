// VOLONTE Telegram asistanı "Kemal" (@VolonteasistantBOT) — Cloudflare Worker.
//
// Ne yapar:
//  1. Kanala (t.me/Volonteroseoffical) atılan her paylaşımı KV'ye kaydeder:
//     metin, fotoğraf, tarih, link, varsa fiyat. Albümler tek paylaşım sayılır.
//  2. Sadece izinli kişiye (ALLOWED_IDS) cevap verir: /son, /hafta, /paylas, /yardim.
//     Başkası yazarsa cevap vermez; kimliğini "bekleyen:" altında not eder.
//  3. /paylas <kod>: kayıtlı paylaşımı bulur, önizlemesini gösterir; sadece
//     "Onayla" düğmesine basılırsa kanalda aynı medya ve yazıyla yeniden paylaşır.
//  4. Yeniden paylaşım turu: izinli herkese en uzun süredir paylaşılmayan 10 modeli,
//     her birinin kanaldaki bütün paylaşım tarihleriyle yollar ("✅ <tarih>" hangisi
//     onaylanırsa o paylaşılır; "🖼 Hepsini göster"; "⏳ Beklesin"; "🗑️ Sil"). Beklesin
//     ya da Sil denince yerine yeni model gelmez. Günde tek tur: sabah 10 model tek seferde gelir;
//     onaylanan aynı gün paylaşılır (08:00–20:00, 50–60 dk arayla, günde en fazla 10); 20:00'de
//     paylaşılamayanlar sıradan çıkar, ileride yeniden sorulur.
//     Günde en fazla 10 paylaşım (elle /paylas dahil). /kuyruk. Bot hiçbir
//     paylaşımı silmez. Son 1 yılın kodlu ve kodsuz ("AVAILABLE AGAIN" /
//     "DISPONIBLE") paylaşımları önerilir; kodsuzlar "~<ilk mesaj id>" ile tutulur.
//
// KV ücretsiz katmanda günde 1000 yazma var; bu yüzden paylaşım başına
// en fazla 3 yazma yapılır (ozet, gun, kodlar).
//
// Ayarlar (Cloudflare'de):
//  BOT_TOKEN       secret — kullanıcı kendisi girer, hiçbir yere yazılmaz.
//  WEBHOOK_SECRET  secret — Telegram'ın gönderdiği istekleri doğrulamak için.
//  ALLOWED_IDS     düz metin — yöneticiler (sahip, Merdan): her şey, ayarlar, harcama, müşteri iletileri.
//  EKIP_IDS        düz metin, isteğe bağlı — ekip: bildirimleri görür, düğmelere basar (onay, beklesin,
//                  sil, alt yazı), /son /hafta /kuyruk /paylas. Ayar, harcama, yapay zekâ sohbeti yok.
//  SELF_URL        düz metin — bu Worker'ın adresi (webhook için).
//  Zamanlanmış görev (5 dakikada bir) webhook'u kendisi kurar.
//  KAYIT           KV bağlantısı.
//  ANTHROPIC_API_KEY  secret — kullanıcı kendisi girer (yapay zekâ asistanı, asistan.js).
//  ANTHROPIC_MODEL    düz metin, isteğe bağlı — varsayılan claude-opus-5-5.
//  5. Fotoğraftan model tanıma (tanima.js): izinli kişi bota fotoğraf gönderince
//     katalogdaki tariflerden adaylar seçilir, fotoğraflar karşılaştırılır. Katalog
//     gizli "Kemal arşiv" kanalı (bot oraya yönetici eklenince bağlanır) üzerinden
//     5 dakikalık görevle arka planda hazırlanır.
//  Yükleme: npm run build → dist/worker.js (Anthropic kütüphanesi paketlenir).

import { calistirSatiri } from "./kemal-satir.js";
export { calistirSatiri };
import { kitapOku } from "./kitap.js";
import { defterTg, defterKarar, defterIs, defterCevap, defterSatir } from "./is-defteri.js";
import { durdurulduMu, durMesaji } from "./durdurma.js";
import Anthropic from "@anthropic-ai/sdk";
import { asistanCevapla, anahtarKontrol, hataMesaji } from "./asistan.js";
import { medyaDosyasi, dosyaIndir, dosyaBaytIndir, tarifle, adaySec, karsilastir, ayniModelMi } from "./tanima.js";
import { markaBas } from "./marka.js";
import { repeteHesapla, repeteMetni, siparisTaslagi, hatirlatmaTaslagi } from "./repete-rapor.js";
import { haftaIci, magazaAcik } from "./magaza-saat.js";
import { musteriIsle, musteriBasit, dilSec } from "./musteri.js";
import { kagitAcik } from "./gorev-kagidi.js";
import { guvenliGonder } from "./tg-guvenli.js";
import { kodsuzMu, kodGoster, tarihUzun, modelSecenekleri, kodBul, kodNormal } from "./ortak.js";

export { kodBul, kodNormal };
import { altyaziOlustur, ETIKET, BEDEN_GRUPLARI, bedenOnerisi, bedenYaz } from "./altyazi.js";
import { SITE_VERI, VIDEO_SUNUCU, PAYLASIM_ARASI_GUN, COK_SATAN_GUN, DURUMLAR, DUZELT_ORNEK, altYazi, dugmeler, albumNotu, siteMedyasi, durumSec, gununModelleri, telegramTarihleri, duzeltmeCoz, yaziHazirla, renkCevir, kisaHata, gecici, IMZA_MARKA } from "./duzen.js";
import { StokDO, stokKodu, indirimliMi, INDIRIMLI } from "./stok.js";
import { siteVerisi } from "./depo-oku.js";
import { kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";
import { kanalKontrol, engelKaydet, paylasimKaydet as gecmisKaydet, markaKesin, markaKarari, renkIngilizce, ESKI_YAZI } from "./yayin-kontrol.js";
import { patronaGider, venomaAktar, formAktar, venomCevabi, sahteDugme, sahteMesaj, tekKapiAcik } from "./tek-kapi.js";
import { kartTekrarAdimi, kartTamamlaAdimi, kartIletAdimi, kisiKontrolAdimi, GUNCEL } from "./kart-tekrar.js";
import { magazaStogu, STOK_KURALI } from "./sil.js";
import { stokIste, stokSorulariGonder as stokSorulariGonderOrtak, stokKarari as stokKarariOrtak, stokGoster as stokGosterOrtak } from "./stokbot.js";
import { karmaDepo, gocBirKez, KEMAL_YEREL } from "./depo.js";
import { grubaGonder, grupUyeligi, raporZamani, raporuBirak, topluRapor, aylikRapor, birikimSuzgeci, birikimAdimi, patronDenemesi } from "./venom.js";
import { murat as muratId, muratMi, sorumlu as hemraId, denemeKaydi, denemeOzeti, DENEME } from "./fabrika.js";

export { StokDO };
import { sinirAsildiMi, buAyHarcanan, AYLIK_SINIR_USD, SINIR_MESAJI } from "./harcama.js";

const SAAT_FARKI = 3 * 60 * 60; // İstanbul, UTC+3
const KANAL_ADI = "Volonteroseoffical";
const OZET_UZUNLUK = 150; // son paylaşımlar (akşam raporu ~1 haftaya bakar)
const KOD_BASINA = 200; // her kod için saklanan paylaşım sayısı ("Sil" hepsini silebilsin)
const GUNCELLEMELER = ["message", "channel_post", "edited_channel_post", "callback_query", "my_chat_member", "message_reaction_count"];
const RAPOR_SAATI = 20; // akşam raporu
const ALTYAZI_PARTI = 3; // bir çalışmada hazırlanan alt yazı önerisi
const ALTYAZI_GUNLUK = 30; // fatura güvenliği: günde en fazla öneri
const KATALOG_PARTI = 8; // bir çalışmada tarif edilen görsel
const KATALOG_GUNLUK_CAGRI = 150; // fatura güvenliği: günde en fazla katalog çağrısı
const TANIMA_ADAY = 5;
const GORSEL_ADAY = 8; // "Sil": fotoğrafa bakarak karşılaştırılan en fazla kodsuz paylaşım

// Günlük yeniden paylaşım ayarları
// 13 Kasım (Patron, kitap kural 52–53): TEK SAAT 09:00–21:00 (öneri kartları da 09:00'da), günde en fazla 12 paylaşım
// (repete, yeni model, ertelenen dahil), en az 60 dk ara. Bu sabitlerden başka saat / sınır yok.
const SABAH_SAATI = 9; // öneri kartları ve paylaşım bu saatte başlar
const AKSAM_SAATI = 21; // paylaşımlar en geç bu saatte biter (kalan sabah 09:00'a kalır)
export const GUNLUK_SINIR = 12;
const GEC_GUN = 7; // "❌ Geç" denen model bu kadar gün önerilmez
// 9 Kasım (Patron): sabit saat sınırı YOK — her an "21:00'e kadar kaç paylaşım sığar" hesaplanır (60–90 dk arayla, ortalama 75 dk)
export const ORT_ARALIK_DK = 62; // 13 Kasım: günde 12 paylaşım 09–21'e sığsın (en az 60 dk)
const TUR_ADET = 10; // bir turda toplanacak onay sayısı
const BEKLEME_GUN = 30; // bu kadar gündür paylaşılmayan modeller önerilir
const BEKLESIN_GUN = 7; // "Beklesin" denen model bu kadar gün sonra tekrar sorulur
export const KALICI = 4102444800; // 2100 yılı: "Sil" denen model bir daha önerilmez
const SILME_ADIM = 20; // bir çalışmada en fazla bu kadar mesaj silinir (Telegram çağrı sınırı 50)
const ARALIK_DK = [60, 65]; // 13 Kasım (Patron, kural 53): en az 60 dk ara; günde 12 paylaşım 09–21'e sığar
// 9 Kasım (Patron): kanal paylaşımları SADECE 09:00–21:00 (İstanbul). Gece onaylanan / hazırlanan paylaşım kuyrukta bekler.
const YAYIN_BAS = SABAH_SAATI, YAYIN_BIT = AKSAM_SAATI, YAYIN_ARA_DK = 60;
const ESKI_ARALIK_DK = [60, 90]; // tur sisteminden önce onaylanmış (21 Ekim) sıradakiler
const YIL_SN = 365 * 86400; // sadece son 1 yılın paylaşımları önerilir
export const KODSUZ_KALIP = /available\s+again|dispon[iİı]ble/i;

// 13 Kasım: Venom'un "Kemal'i çalıştır" kapısı (durum Kemal'in kendi deposunda)
export async function venomCalistir(env, g) {
  if (env.KATALOG) return (await kemalNesne(env).fetch("https://kemal/kemal/calistir", { method: "POST", body: JSON.stringify(g || {}) })).json();
  return kemalCalistir(env, g || {}, Math.floor(Date.now() / 1000));
}
// TEK KAPI: Patron Venom'da Kemal'in düğmesine bastı → aynı yol (sahte callback, Patron'dan). İç giriş: kemal-giris.js
export async function venomMesaj(env, metin) {
  // 9 Kasım (sert müdür B): Venom emri "öner 3279 3280" → bugünün turuna ek öneri (toplu kart, Merdan + Hemra)
  const on = String(metin || "").match(/^\/?(?:öner|oner)\s+([\d\s,]+)$/i);
  if (on) {
    const kodlar = [...new Set(on[1].split(/[\s,]+/).filter((k) => /^\d{3,6}$/.test(k)))].slice(0, 10);
    if (env.KATALOG) return (await kemalNesne(env).fetch("https://kemal/kemal/oner", { method: "POST", body: JSON.stringify({ kodlar }) })).json();
    return turEkle(env, kodlar, Math.floor(Date.now() / 1000));
  }
  const update = sahteMesaj(env, metin);
  if (env.KATALOG) await kemalNesne(env).fetch("https://kemal/kemal/guncelleme", { method: "POST", body: JSON.stringify(update) });
  else await guncellemeIsle(update, env);
  return true;
}
export async function venomOzet(env) {
  if (env.KATALOG) return (await kemalNesne(env).fetch("https://kemal/kemal/ozet", { method: "POST", body: "{}" })).json();
  return kemalOzet(env, Math.floor(Date.now() / 1000));
}
export async function venomDugme(env, data, rid) {
  const update = sahteDugme(env, data, rid);
  if (env.KATALOG) await kemalNesne(env).fetch("https://kemal/kemal/guncelleme", { method: "POST", body: JSON.stringify(update) });
  else await guncellemeIsle(update, env);
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) {
        return new Response("yetkisiz", { status: 401 });
      }
      const update = await request.json();
      // Birikmiş mesaj koruması: veritabanına gitmeden önce (eski mesaja cevap yok, müşteri mesajı listeye).
      if (await birikimSuzgeci(env, "kemal", update, (id) => izinliKisiler(env).includes(String(id)), telegram)) return new Response("ok");
      // Kemal'in işleri kendi Durable Object'inde çalışır (sık yazılan kayıtlar orada; KV sınırı).
      if (env.KATALOG) await kemalNesne(env).fetch("https://kemal/kemal/guncelleme", { method: "POST", body: JSON.stringify(update) });
      else await guncellemeIsle(update, env);
      return new Response("ok");
    }
    // OFİS SESLİ KONUŞMA (4 Kasım, Patron): sadece volonte-ofis çağırır (gizli OFIS_KOPRU; ofis Patron şifresini kontrol eder)
    if (request.method === "POST" && url.pathname === "/ofis-sohbet") {
      if (!env.OFIS_KOPRU || !gizliEsit(request.headers.get("X-Ofis-Anahtar") || "", String(env.OFIS_KOPRU))) return new Response("yetkisiz", { status: 401 });
      const govde = await request.text();
      if (env.KATALOG) return kemalNesne(env).fetch("https://kemal/kemal/ofis-sohbet", { method: "POST", body: govde });
      return Response.json(await ofisSohbet(env, JSON.parse(govde), Math.floor(Date.now() / 1000)));
    }
    if (request.method === "POST" && url.pathname === "/kopru") return kopruAl(request, env);
    if (request.method === "POST" && url.pathname === "/kopru/satis") return kopruSatis(request, env);
    if (request.method === "POST" && url.pathname === "/kopru/cari") return kopruCari(request, env);
    if (request.method === "POST" && url.pathname === "/kopru/ciro") return kopruCiro(request, env);
    if (request.method === "POST" && url.pathname === "/kopru/gider-kesif") return kopruMaliKesif(request, env);
    if (request.method === "POST" && (url.pathname === "/kopru/surum" || url.pathname === "/kopru/dosya")) return kopruGuncelleme(request, env, url.pathname);
    // Pelin'in kör testi: modelin gerçek mankenli kanal videosu (tek seferlik anahtar Pelin'den, ortak kayıtta).
    if (request.method === "GET" && /^\/kanal-video\/[a-f0-9]{32}$/.test(url.pathname)) return kanalVideo(env, url.pathname.split("/")[2], request.headers.get("Range"));

    return new Response("VOLONTE asistanı çalışıyor.");
  },

  // Zamanlanmış görev: BOT_TOKEN girildiyse webhook'u kendi adresine kurar.
  // Kuruluysa sadece kontrol eder, bir şey değiştirmez.
  async scheduled(event, env) {
    try { await kitapOku(env, "kemal"); } catch { /* 13 Kasım (kural 37): bot her çalışmada kitabın güncel sürümünü okur (ofis "kitap sürümü") */ }
    try { await patronDenemesi(env, "Kemal", telegram); } catch { /* */ }
    try { await birikimAdimi(env, "kemal", Math.floor(Date.now() / 1000), telegram); } catch (e) { await env.KAYIT.put("kemal:birikimHata", String(e && e.message).slice(0, 300), { expirationTtl: 86400 }); }
    try { if (await kagitAcik(env, "kemal", "kisiKontrol")) await kisiKontrolAdimi(env, "kemal", telegram); } catch { /* 9 Kasım: kişi /start kontrolü */ }
    try { if (await kagitAcik(env, "kemal", "kartIlet")) await kartIletAdimi(env, "kemal", telegram); } catch { /* 9 Kasım: Hemra'nın seçtiği kişiye kart */ }
    try { if (await kagitAcik(env, "kemal", "kartTamamla")) await kartTamamlaAdimi(env, "kemal", telegram, Math.floor(Date.now() / 1000)); } catch { /* 10 Kasım: yarım kartları tamamla */ }
    try { if (await kagitAcik(env, "kemal", "kartTekrar")) await kartTekrarAdimi(env, "kemal", telegram, Math.floor(Date.now() / 1000)); } catch (e) { await env.KAYIT.put("kemal:kartTekrarHata", String(e && e.message).slice(0, 300), { expirationTtl: 86400 }); } // 9 Kasım: onay merdiveni
    if (env.KATALOG) {
      const nesne = kemalNesne(env);
      await nesne.fetch("https://kemal/kemal/cron", { method: "POST" });
      await nesne.fetch("https://kemal/kemal/adim", { method: "POST" }); // katalog + alt yazı: ayrı istek sınırı
      return;
    }
    await durumKontrol(env);
    if (env.BOT_TOKEN) await rotasyon(env, Math.floor(Date.now() / 1000));
  },
};

// KV'ye sadece durum değişince (ya da saatte bir) yazar: günlük yazma sınırı için.
async function durumKontrol(env) {
    const durum = await webhookKontrol(env);
    const kayit = { durum, zaman: Math.floor(Date.now() / 1000) };
    if (env.BOT_TOKEN) {
      const bilgi = await telegram(env, "getWebhookInfo", {});
      if (bilgi.ok) {
        kayit.bekleyen = bilgi.result.pending_update_count;
        kayit.sonHata = bilgi.result.last_error_message || null;
        kayit.sonHataZamani = bilgi.result.last_error_date || null;
      }
      const ben = await telegram(env, "getMe", {});
      if (ben.ok) kayit.bot = ben.result.username;
      // Kanaldaki yetkiler: paylaşım ve "Sil" için gerekli.
      const kanalBilgi = await env.KAYIT.get("kanal", "json");
      if (ben.ok && kanalBilgi) {
        const uye = await telegram(env, "getChatMember", { chat_id: kanalBilgi.id, user_id: ben.result.id });
        if (uye.ok) kayit.yetki = { paylas: Boolean(uye.result.can_post_messages), sil: Boolean(uye.result.can_delete_messages), duzenle: Boolean(uye.result.can_edit_messages) };
      }
      if (!(await env.KAYIT.get("kanal"))) {
        const k = await telegram(env, "getChat", { chat_id: `@${KANAL_ADI}` });
        if (k.ok) await env.KAYIT.put("kanal", JSON.stringify({ id: k.result.id, kullanici: k.result.username || KANAL_ADI }));
      }
    }
    const onceki = (await env.KAYIT.get("durum:webhook", "json")) || {};
    // Yapay zekâ anahtarı saatte bir kontrol edilir (ücretsiz).
    if (!onceki.yzZaman || kayit.zaman - onceki.yzZaman > 3600 || (onceki.yz || "").startsWith("anahtar-yok") !== !env.ANTHROPIC_API_KEY) {
      kayit.yz = await anahtarKontrol(env);
      kayit.yzZaman = kayit.zaman;
    } else {
      kayit.yz = onceki.yz;
      kayit.yzZaman = onceki.yzZaman;
    }
    const ayniDurum = JSON.stringify({ ...onceki, zaman: 0, durum: 0 }) === JSON.stringify({ ...kayit, zaman: 0, durum: 0 }) &&
      (onceki.durum === kayit.durum || (onceki.durum === "kuruldu" && kayit.durum === "kurulu"));
    if (!ayniDurum || kayit.zaman - (onceki.zaman || 0) > 3600) {
      await env.KAYIT.put("durum:webhook", JSON.stringify(kayit));
    }
    // 13 Kasım (Patron, kural 74): %80 uyarısını Venom verir (kitaptaki tek tablodan); Kemal ayrıca yazmaz.
}

export async function webhookKontrol(env) {
  if (!env.BOT_TOKEN || !env.SELF_URL) return "token-yok";
  const hedef = `${env.SELF_URL}/telegram`;
  const bilgi = await telegram(env, "getWebhookInfo", {});
  if (!bilgi.ok) return `hata: ${bilgi.error_code} ${bilgi.description}`;
  const r = bilgi.result;
  const ayni = r.url === hedef && r.max_connections === 1 &&
    GUNCELLEMELER.every((g) => (r.allowed_updates || []).includes(g));
  if (ayni) return "kurulu";
  // max_connections 1: güncellemeler sırayla gelir, albüm parçaları birbirini ezmez.
  const cevap = await telegram(env, "setWebhook", {
    url: hedef,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: GUNCELLEMELER,
    max_connections: 1,
  });
  return cevap.ok ? "kuruldu" : `hata: ${cevap.description}`;
}

export async function guncellemeIsle(update, env) {
  const post = update.channel_post || update.edited_channel_post;
  if (post) {
    // Sadece VOLONTE kanalı kaydedilir (arşiv kanalı ya da başka kanal değil).
    if (!(await anaKanalMi(post.chat, env))) return;
    return paylasimKaydet(post, env, Boolean(update.edited_channel_post));
  }
  if (update.my_chat_member) return uyelikIsle(update.my_chat_member, env);
  if (update.message_reaction_count) {
    const t = update.message_reaction_count;
    if (!(await anaKanalMi(t.chat, env))) return;
    return tepkiKaydet(env, t.message_id, (t.reactions || []).reduce((top, r) => top + (r.total_count || 0), 0));
  }
  if (update.message) return mesajIsle(update.message, env);
  if (update.callback_query && update.callback_query.data === GUNCEL) return telegram(env, "answerCallbackQuery", { callback_query_id: update.callback_query.id, text: "⏩ Güncel kart aşağıda" });
  if (update.callback_query) { await defterKarar(env, "kemal", update.callback_query); return dugmeIsle(update.callback_query, env); }
}

async function anaKanalMi(chat, env) {
  const kanal = await env.KAYIT.get("kanal", "json");
  return kanal ? chat.id === kanal.id : chat.username === KANAL_ADI;
}

// Bot bir kanala yönetici eklenince: izinli kişi eklediyse orası "Kemal arşiv" olur.
async function uyelikIsle(m, env) {
  if (await grupUyeligi(m, env, "kemal", "🤖 Kemal (kanal ve paylaşımlar)", (e, metod, g) => telegram(e, metod, g))) return; // "Venom Ekip" grubu
  if (!m.chat || m.chat.type !== "channel" || (await anaKanalMi(m.chat, env))) return;
  const durum = m.new_chat_member && m.new_chat_member.status;
  const arsiv = await env.KAYIT.get("arsiv", "json");
  if (durum === "administrator" && izinliMi(m.from.id, env)) {
    await env.KAYIT.put("arsiv", JSON.stringify({ id: m.chat.id, ad: m.chat.title || "" }));
    const toplam = katalogListesi((await env.KAYIT.get("kodlar", "json")) || {}, (await env.KAYIT.get("kodsuz", "json")) || {}, {}).length;
    await herkese(env, `📦 "${m.chat.title || "Arşiv"}" kanalı Kemal arşivi olarak bağlandı (${kisiAdi(m.from)}). Fotoğraf tanıma için ${toplam} modelin kataloğunu hazırlamaya başlıyorum; birkaç saat sürer, bitince haber veririm. Bu kanala dokunmayın, sadece bot kullanır.`);
  } else if ((durum === "left" || durum === "kicked") && arsiv && arsiv.id === m.chat.id) {
    await env.KAYIT.delete("arsiv");
    await herkese(env, `📦 Kemal arşiv kanalından çıkarıldı; yeni modellerin kataloğu hazırlanamaz. Fotoğraf tanıma mevcut katalogla çalışmaya devam eder.`);
  }
}

// ---------- Kanal paylaşımları ----------

export function fiyatBul(metin) {
  if (!metin) return null;
  const kaliplar = [
    /\$\s?(\d+(?:[.,]\d{1,2})?)/,
    /(\d+(?:[.,]\d{1,2})?)\s?(?:usd|dolar|dollars?)\b/i,
    /(\d+(?:[.,]\d{1,2})?)\s?\$/,
    /(?:price|prix|preço|preco|fiyat|цена)\s*[:\-–]?\s*(\d+(?:[.,]\d{1,2})?)/i,
  ];
  for (const k of kaliplar) {
    const m = metin.match(k);
    if (m) return Number(m[1].replace(",", "."));
  }
  return null;
}

// "CODE.3329", "Kod: 3394 B", "#3329", "Model 3329" → "3329"
// kodlar = { "3329": [{ ids: [13696, 13697], tarih, album }], ... } (en yeni başta)
// Aynı paylaşım (ortak parça ya da aynı albüm) zaten varsa parçalar birleştirilir:
// eski bir albümün tek parçasının yazısı düzenlenince diğer parçalar kaybolmasın.
export function kodEkle(kodlar, kod, giris) {
  const ayniMi = (g) => g.ids.some((id) => giris.ids.includes(id)) || (giris.album && g.album === giris.album);
  const eskiler = (kodlar[kod] || []).filter(ayniMi);
  const liste = (kodlar[kod] || []).filter((g) => !ayniMi(g));
  if (eskiler.length) {
    giris = {
      ...giris,
      ids: [...new Set([...giris.ids, ...eskiler.flatMap((g) => g.ids)])].sort((a, b) => a - b),
      tarih: Math.min(giris.tarih, ...eskiler.map((g) => g.tarih)),
      album: giris.album || eskiler.find((g) => g.album)?.album || null,
    };
  }
  liste.unshift(giris);
  liste.sort((a, b) => b.tarih - a.tarih || b.ids[0] - a.ids[0]);
  kodlar[kod] = liste.slice(0, KOD_BASINA);
}

async function paylasimKaydet(post, env, duzenleme) {
  const metin = post.text || post.caption || "";
  const foto = post.photo ? post.photo[post.photo.length - 1].file_id : null;
  const kayit = {
    id: post.message_id,
    tarih: post.date,
    gun: gunAnahtari(post.date),
    metin,
    fiyat: fiyatBul(metin),
    foto,
    video: post.video ? post.video.file_id : null,
    album: post.media_group_id || null,
    link: post.chat && post.chat.username ? `https://t.me/${post.chat.username}/${post.message_id}` : null,
  };

  // Yeniden paylaşım için kanal kimliği lazım; ilk paylaşımda bir kez yazılır.
  if (post.chat && !(await env.KAYIT.get("kanal"))) {
    await env.KAYIT.put("kanal", JSON.stringify({ id: post.chat.id, kullanici: post.chat.username || null }));
  }

  const ozet = (await env.KAYIT.get("ozet", "json")) || { toplam: 0, sonlar: [] };
  const ayniAlbum = kayit.album && ozet.sonlar.find((s) => s.album === kayit.album);
  const mevcut = ozet.sonlar.find((s) => s.ids.includes(kayit.id));

  if (mevcut) {
    if (kayit.metin) mevcut.metin = kisalt(kayit.metin);
    if (kayit.fiyat != null) mevcut.fiyat = kayit.fiyat;
  } else if (ayniAlbum) {
    ayniAlbum.ids.push(kayit.id);
    ayniAlbum.medya += 1;
    if (kayit.metin && !ayniAlbum.metin) ayniAlbum.metin = kisalt(kayit.metin);
    if (kayit.fiyat != null && ayniAlbum.fiyat == null) ayniAlbum.fiyat = kayit.fiyat;
  } else if (!duzenleme) {
    ozet.toplam += 1;
    ozet.sonlar.unshift({
      ids: [kayit.id],
      tarih: kayit.tarih,
      metin: kisalt(kayit.metin),
      fiyat: kayit.fiyat,
      medya: kayit.foto || kayit.video ? 1 : 0,
      album: kayit.album,
      link: kayit.link,
    });
    ozet.sonlar = ozet.sonlar.slice(0, OZET_UZUNLUK);
    const gunKey = `gun:${kayit.gun}`;
    const sayi = Number((await env.KAYIT.get(gunKey)) || 0);
    await env.KAYIT.put(gunKey, String(sayi + 1));
  }
  await env.KAYIT.put("ozet", JSON.stringify(ozet));

  // Botun kendi yeniden paylaşımı mı? (kanaldaPaylas `kopya` işareti bırakır)
  let kopya = null;
  if (!duzenleme) {
    const isaret = await env.KAYIT.get("kopya", "json");
    if (isaret && isaret.kalan > 0 && Math.abs(kayit.tarih - isaret.zaman) <= 180) {
      kopya = isaret;
      isaret.kalan -= 1;
      if (isaret.kalan > 0) await env.KAYIT.put("kopya", JSON.stringify(isaret), { expirationTtl: 600 });
      else await env.KAYIT.delete("kopya");
    }
  }

  // Kod dizini: yazıda kod varsa albümün tüm parçalarıyla kaydet; kodsuz albüm
  // parçası gelirse, aynı albüm zaten bir koda bağlıysa ona ekle.
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kod = kodBul(metin);
  let degisti = false;
  let oncedenVar = false;
  if (kod) {
    const ozetGirisi = ozet.sonlar.find((s) => s.ids.includes(kayit.id));
    const ids = ozetGirisi ? [...ozetGirisi.ids].sort((a, b) => a - b) : [kayit.id];
    oncedenVar = (kodlar[kod] || []).some((g) => !g.ids.includes(kayit.id));
    // y: alt yazının durduğu mesaj (albümde yazı tek parçadadır)
    kodEkle(kodlar, kod, { ids, tarih: kayit.tarih, album: kayit.album, y: kayit.id });
    degisti = true;
  } else if (kayit.album) {
    for (const liste of Object.values(kodlar)) {
      const g = liste.find((x) => x.album === kayit.album);
      if (g && !g.ids.includes(kayit.id)) {
        g.ids.push(kayit.id);
        g.ids.sort((a, b) => a - b);
        degisti = true;
      }
    }
  }
  if (degisti) await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
  if (kod && !duzenleme) {
    await istekHatirlat(env, kod, kayit);
    // Telegram son paylaşım tarihi Sami'nin deposuna (stok tablosu; Kemal günlük modelleri buna göre seçer).
    if (env.STOK && !kodsuzMu(kod)) await stokIste(env, "/tg-yaz", { kayitlar: { [kod]: kayit.tarih } }).catch(() => null);
    // Eski alt yazı önerisi (TR/EN/FR/PT + fiyat) yeni düzenle KAPALI (29 Ekim); ALTYAZI_ACIK=1 ile açılır.
    if (env.ALTYAZI_ACIK === "1") await altyaziSirayaEkle(env, { kod, mesaj: kayit.id, eski: metin, etiket: kopya || oncedenVar ? ETIKET.repete : ETIKET.yeni });
  }

  // Kodsuz paylaşımın kopyası yeni kayıt açmaz; asıl kaydın `kopyalar` listesine girer ("Sil" bunları da siler).
  if (kopya && kodsuzMu(kopya.kod)) {
    const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
    if (kodsuz[kopya.kod]) {
      kodsuz[kopya.kod].kopyalar = [...new Set([...(kodsuz[kopya.kod].kopyalar || []), kayit.id])];
      await env.KAYIT.put("kodsuz", JSON.stringify(kodsuz));
    }
    return;
  }

  // Kodsuz "AVAILABLE AGAIN" / "DISPONIBLE" paylaşımları: kodsuz = { "~<ilk id>": { ids, tarih, album, kopyalar } }
  if (!kod && (kayit.foto || kayit.video)) {
    const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
    let kdegisti = false;
    const albumdeki = kayit.album && Object.values(kodsuz).find((g) => g.album === kayit.album);
    if (albumdeki) {
      if (!albumdeki.ids.includes(kayit.id)) {
        albumdeki.ids.push(kayit.id);
        albumdeki.ids.sort((a, b) => a - b);
        kdegisti = true;
      }
    } else if (KODSUZ_KALIP.test(metin) && !duzenleme) {
      const ozetGirisi = ozet.sonlar.find((s) => s.ids.includes(kayit.id));
      const ids = ozetGirisi ? [...ozetGirisi.ids].sort((a, b) => a - b) : [kayit.id];
      kodsuz[`~${ids[0]}`] = { ids, tarih: kayit.tarih, album: kayit.album };
      kdegisti = true;
    }
    if (kdegisti) await env.KAYIT.put("kodsuz", JSON.stringify(kodsuz));
  }
}

// ---------- Kullanıcı mesajları ----------

const kimlikler = (yazi) => String(yazi || "").split(",").map((s) => s.trim()).filter(Boolean);
// Yönetici (sahip, Merdan): her şey. Ekip: bildirimler + düğmeler (ayar ve harcama yok).
function izinliMi(id, env) {
  return kimlikler(env.ALLOWED_IDS).includes(String(id));
}
function ekipMi(id, env) {
  return !izinliMi(id, env) && kimlikler(env.EKIP_IDS).includes(String(id));
}

async function mesajIsle(msg, env) {
  const kimden = msg.from || {};
  if (msg.chat.type !== "private") return;

  // ✏️ Düzelt bekleniyorsa (yönetici ya da ekip) cevap buraya.
  if (izinliMi(kimden.id, env) || ekipMi(kimden.id, env)) {
    if ((msg.text || "").trim().toLowerCase() === "/iptal" && (await env.KAYIT.get(`duzelt:${kimden.id}`))) {
      await env.KAYIT.delete(`duzelt:${kimden.id}`);
      return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: "Düzeltme iptal edildi." });
    }
    if (await duzeltmeIsle(msg, env)) return;
    const rp = repeteYetkili(env, kimden.id) && repeteAyikla(msg.text);
    if (rp) return repeteIstegi(msg, env, rp);
  }
  // Hemra (ekip) Kemal'in ilettiği müşteri mesajını yanıtlarsa: müşteriye iletilir (10 Kasım)
  if (ekipMi(kimden.id, env) && msg.reply_to_message) {
    const musteri = await env.KAYIT.get(`iletim:${msg.chat.id}:${msg.reply_to_message.message_id}`);
    if (musteri) {
      const r = await telegram(env, "copyMessage", { chat_id: Number(musteri), from_chat_id: msg.chat.id, message_id: msg.message_id });
      return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: r.ok ? "✅ Müşteriye iletildi (Kemal'in ağzından)." : `⚠️ İletilemedi: ${r.description}`, reply_to_message_id: msg.message_id });
    }
  }
  if (ekipMi(kimden.id, env)) return ekipMesaji(msg, env);
  if (!izinliMi(kimden.id, env)) {
    await env.KAYIT.put(
      `bekleyen:${kimden.id}`,
      JSON.stringify({ ad: [kimden.first_name, kimden.last_name].filter(Boolean).join(" "), kullanici: kimden.username || null, zaman: msg.date, metin: (msg.text || "").slice(0, 50) }),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );
    // 10 Kasım (Patron): müşteriye yapay zekâ cevabı KAPALI — mesaj Hemra'ya iletilir, müşteriye kısa hazır cevap
    if (!(await kagitAcik(env, "kemal", "musteriYZ"))) return musteriBasit(msg, env, musteriYardimcilari(env), Math.floor(Date.now() / 1000));
    // Müşteri modu: ayrı dosya, yönetici işlerine erişimi yok (musteri.js).
    return musteriIsle(msg, env, musteriYardimcilari(env), Math.floor(Date.now() / 1000));
  }

  // Yönetici, Kemal'in ilettiği müşteri mesajını yanıtlarsa: müşteriye iletilir.
  if (msg.reply_to_message) {
    const musteri = await env.KAYIT.get(`iletim:${msg.chat.id}:${msg.reply_to_message.message_id}`);
    if (musteri) {
      const r = await telegram(env, "copyMessage", { chat_id: Number(musteri), from_chat_id: msg.chat.id, message_id: msg.message_id });
      return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: r.ok ? "✅ Müşteriye iletildi (Kemal'in ağzından)." : `⚠️ İletilemedi: ${r.description}`, reply_to_message_id: msg.message_id });
    }
  }

  // "3319 yeni model tekrar": hazırlanamayan yeni model önizlemesi yeniden sıraya (3 Kasım)
  const yeniTekrar = String(msg.text || "").match(/^\s*(\d{3,6})\s+yeni\s+model\s+tekrar\s*$/i);
  if (yeniTekrar) {
    const sira = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
    if (!sira.some((x) => String(x.kod) === yeniTekrar[1])) sira.push({ kod: yeniTekrar[1], kim: [kimden.first_name, kimden.last_name].filter(Boolean).join(" ") || "Patron", zaman: Math.floor(Date.now() / 1000) });
    await env.KAYIT.put("venom:yeniModel", JSON.stringify(sira));
    return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: `🔁 ${yeniTekrar[1]} yeniden sıraya alındı; birkaç dakika içinde yeni model önizlemesi gelir.` });
  }
  const komut = (msg.text || "").trim().split(/[\s@]/)[0].toLowerCase();
  let cevap;
  if ((msg.photo || msg.video || msg.document) && (await patronMedyaTopla(msg, env))) return null; // "3627 paylaş" → paylaşım hazırlama (5 Kasım)
  if (medyaDosyasi(msg, 0)) {
    return fotoTani(msg, env, Math.floor(Date.now() / 1000));
  } else if (komut === "/son") {
    cevap = await sonPaylasimlar(env);
  } else if (komut === "/hafta") {
    cevap = await haftaOzeti(env);
  } else if (komut === "/paylas" || komut === "/paylaş") {
    return paylasOnizle(msg, env);
  } else if (komut === "/marka") {
    return markaOnizle(msg, env);
  } else if (komut === "/stok") {
    return stokGoster(msg, env);
  } else if (komut === "/kuyruk") {
    return kuyrukGoster(msg.chat.id, env);
  } else if (msg.text && !msg.text.startsWith("/") && silKomutu(msg.text)) {
    // 4 Kasım (Patron): "3627'yi sil", "sil 3627", "3627 kaldır", "3627 sil", "удали 3627" → silme onay kartı (yapay zekâya kalmaz)
    const kod = kodNormal(silKomutu(msg.text));
    const sonuc = await asistanYardimcilari(env).hicOnayIste(msg.chat.id, kod);
    if (!/Onay düğmeleri gönderildi/.test(sonuc)) return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: `🗑️ ${sonuc}` });
    return null;
  } else if (msg.text && !msg.text.startsWith("/")) {
    return asistanCevapla(msg, env, asistanYardimcilari(env), Math.floor(Date.now() / 1000));
  } else {
    cevap = YARDIM;
  }
  await telegram(env, "sendMessage", { chat_id: msg.chat.id, text: cevap, disable_web_page_preview: true });
}

// Ekip üyesi: sadece bilgi komutları ve paylaşım önizlemesi (paylaşım yine düğmeyle onaylanır).
async function ekipMesaji(msg, env) {
  const komut = (msg.text || "").trim().split(/[\s@]/)[0].toLowerCase();
  if (komut === "/paylas" || komut === "/paylaş") return paylasOnizle(msg, env);
  if (komut === "/kuyruk") return kuyrukGoster(msg.chat.id, env);
  if (komut === "/stok") return stokGoster(msg, env);
  const cevap = komut === "/son" ? await sonPaylasimlar(env) : komut === "/hafta" ? await haftaOzeti(env) : EKIP_YARDIM;
  return telegram(env, "sendMessage", { chat_id: msg.chat.id, text: cevap, disable_web_page_preview: true });
}

const EKIP_YARDIM = [
  "Ben Kemal 👋 VOLONTE'nin Telegram asistanıyım. Ekiptesiniz: turların ve paylaşımların bildirimlerini görür, düğmelere basabilirsiniz (kim önce basarsa o geçerli).",
  "",
  "/son — kanaldaki son 5 paylaşım",
  "/hafta — son 7 günde kaç paylaşım yapıldı",
  "/kuyruk — onaylanıp paylaşılmayı bekleyenler",
  "/paylas 3329 — o kodun son paylaşımını önizle, onaylarsan kanalda tekrar paylaş",
  "/stok 3329 — Vegawin stok adedi ve durumu",
  "",
  "Ayarlar, harcama ve yapay zekâ sohbeti sadece Murat ve Merdan'da.",
].join("\n");

const YARDIM = [
  "Ben Kemal 👋 VOLONTE'nin Telegram asistanıyım.",
  "",
  "/son — kanaldaki son 5 paylaşım",
  "/hafta — son 7 günde kaç paylaşım yapıldı",
  "/paylas 3329 — o kodun son paylaşımını önizle, onaylarsan kanalda tekrar paylaş",
  "/paylas 3329 2 — aynı kodun bir önceki paylaşımı",
  "/kuyruk — onaylanıp paylaşılmayı bekleyenler (iptal edilebilir)",
  "/stok — Vegawin köprüsünün durumu; /stok 3329 — o modelin stok adedi",
  "/marka 3194 — fotoğrafa \"VOLONTE · kod\" basılmış hâlini sadece size gösterir; kanalda açma/kapatma",
  "/yardim — bu liste",
  "",
  "",
  "Komut yazmadan da konuşabilirsiniz: \"bu turda kaç onay var\", \"3357 beklesin\", \"bu hafta kaç paylaşım yaptık\". Paylaşma için yine düğmeyle onay isterim; silme sadece Patron ve Venom'dadır.",
  "",
  "Kanala yapılan her paylaşımı otomatik kaydediyorum.",
  `Tur: her sabah ${SABAH_SAATI}:00'de uzun süredir paylaşılmayan ${TUR_ADET} modeli bütün paylaşım tarihleriyle gönderirim; onayladığınız aynı gün ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla paylaşılır (günde en fazla ${GUNLUK_SINIR}). Günlük hedef ${GUNLUK_SINIR} onay: ❌ Geç denen kadar yeni model toplu kartta gelir (21:00'e kaç paylaşım sığıyorsa o kadar); geç denen ${GEC_GUN} gün önerilmez. ${AKSAM_SAATI}:00'de paylaşılamayanlar sıradan çıkar, ileride yeniden sorulur.`,
].join("\n");

export async function sonPaylasimlar(env) {
  const ozet = await env.KAYIT.get("ozet", "json");
  if (!ozet || !ozet.sonlar.length) return "Henüz kayıtlı paylaşım yok. Kanala yeni bir paylaşım yapılınca burada görünecek.";
  const satirlar = ozet.sonlar.slice(0, 5).map((s, i) => {
    const parcalar = [`${i + 1}) ${tarihYaz(s.tarih)}`];
    if (s.medya) parcalar.push(s.medya > 1 ? `${s.medya} medya` : "1 medya");
    parcalar.push(s.fiyat != null ? `fiyat: ${s.fiyat} $` : "fiyat yok");
    let satir = parcalar.join(" · ");
    if (s.metin) satir += `\n   ${s.metin}`;
    if (s.link) satir += `\n   ${s.link}`;
    return satir;
  });
  return `Son paylaşımlar (toplam kayıtlı: ${ozet.toplam})\n\n${satirlar.join("\n\n")}`;
}

export async function haftaOzeti(env, simdi = Math.floor(Date.now() / 1000)) {
  const satirlar = [];
  let toplam = 0;
  for (let i = 6; i >= 0; i--) {
    const gun = gunAnahtari(simdi - i * 86400);
    const sayi = Number((await env.KAYIT.get(`gun:${gun}`)) || 0);
    toplam += sayi;
    satirlar.push(`${gun.slice(8, 10)}.${gun.slice(5, 7)}  ${"▪".repeat(Math.min(sayi, 20))} ${sayi}`);
  }
  return `Son 7 gün: ${toplam} paylaşım\n\n${satirlar.join("\n")}`;
}

// ---------- Yeniden paylaşım (sadece onayla) ----------

// /paylas <kod>: yeni düzende önizleme (medya siteden, fiyat yok); "Onayla" ile hemen kanala gider.
async function paylasOnizle(msg, env) {
  const sohbet = msg.chat.id;
  const yaz = (text, ek = {}) => telegram(env, "sendMessage", { chat_id: sohbet, text, ...ek });
  const kod = kodNormal(((msg.text || "").trim().split(/\s+/).slice(1))[0] || "");
  if (!kod) return yaz("Kod yazın. Örnek: /paylas 3403");
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  if (arsiv[kod]) return yaz(`${kod} silindi olarak işaretli (${arsiv[kod].kim}); tekrar paylaşılmaz.`);
  const u = (await siteUrunleriAl(env)).find((x) => String(x.kod) === kod && !x.gizli);
  if (!u) return yaz(`${kod} sitede yok (ya da gizli). Yeni düzende fotoğraf/video siteden alınır; önce Selin siteye eklemeli.`);
  const simdi = Math.floor(Date.now() / 1000);
  await telegram(env, "sendChatAction", { chat_id: sohbet, action: "upload_photo" });
  let paket;
  try { paket = await paketHazirla(env, u, await durumBaglami(env, [kod], simdi), simdi); } catch (e) { return yaz(`⚠️ ${kod} hazırlanamadı: ${kisaHata(e)}`); }
  const g = await paketGonder(env, sohbet, paket, (await env.KAYIT.get("bicim")) || "album");
  if (!g.ok) return yaz(`⚠️ Önizleme gönderilemedi: ${g.hata}`);
  const anahtar = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.KAYIT.put(`onay:${anahtar}`, JSON.stringify({ kod, paket, kullanici: msg.from.id }), { expirationTtl: 24 * 60 * 60 });
  return yaz(`${kontrolMetni(paket, simdi)}\n\n👆 Önizleme (kanala gitmedi). Şimdi kanalda paylaşılsın mı?${paket.renkEmin ? "" : "\n⚠️ Renkler onaylı değil: ✏️ Düzelt ile renkleri yazın, sonra /paylas'ı tekrar yazın."}`, {
    reply_markup: { inline_keyboard: [[
      ...(paket.renkEmin ? [{ text: "✅ Onayla, kanalda paylaş", callback_data: `ok:${anahtar}` }] : []),
      { text: "✏️ Düzelt", callback_data: `yd:-:${kod}` },
      { text: "❌ İptal", callback_data: `no:${anahtar}` },
    ]] },
  });
}

async function dugmeIsle(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (String(cq.data || "").startsWith("py:")) return yayinOnayDugmesi(cq, env); // son yayın onayı: sadece Patron (içeride kontrol)
  if (!izinliMi(cq.from.id, env) && !ekipMi(cq.from.id, env)) return cevapla("Yetkiniz yok.");

  const veri = String(cq.data || "");
  if (veri.startsWith("mk:") && !izinliMi(cq.from.id, env)) return cevapla("Bu ayar sadece Murat ve Merdan'da.");
  if (/^(y1|yd|yg|yb|yw):/.test(veri)) return yeniTurDugmesi(cq, env);
  if (veri.startsWith("kd:")) return telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "🧪 Deneme kartı — gerçek işlem yapılmadı." }); // 10 Kasım görev kâğıdı kanıtı
  if (/^(rp1|rpd|rpx|rpb):/.test(veri)) return repeteDugmesi(cq, env);
  if (/^(t1|t7|tx|ty|tv|tg|tb):/.test(veri)) return turDugmesi(cq, env);
  if (/^(r0|r1|r7|r30|rx|hx|hv):/.test(veri)) return cevapla("Bu eski liste artık kullanılmıyor; yeni tur mesajlarını kullanın.");
  if (veri.startsWith("kq:")) return kuyrukIptal(cq, env);
  if (veri.startsWith("kr:")) return repetePaylasKarari(cq, env);
  if (veri.startsWith("rr:")) return repeteRaporDugmesi(cq, env); // 9 Kasım: repete raporu (Patron)
  if (veri.startsWith("sz:")) return stokKarari(cq, env);
  if (/^(ay|an):/.test(veri)) return altyaziKarar(cq, env);
  if (veri === "mk:acik" || veri === "mk:kapali") {
    const acik = veri === "mk:acik";
    await env.KAYIT.put("marka", acik ? "acik" : "kapali");
    await cevapla(acik ? "Marka açık" : "Marka kapalı");
    return herkese(env, acik ? `🖼 Marka basma AÇILDI (${kisiAdi(cq.from)}): Kemal'in kanala paylaştığı fotoğraflarda "VOLONTE · kod" olacak. Kapatmak için: /marka` : `🖼 Marka basma KAPALI (${kisiAdi(cq.from)}).`);
  }
  if (veri.startsWith("rp:")) {
    await cevapla("Önizleme hazırlanıyor");
    return paylasOnizle({ chat: cq.message.chat, from: cq.from, text: `/paylas ${veri.slice(3)}` }, env);
  }

  const [islem, anahtar] = veri.split(":");
  const sohbet = cq.message && cq.message.chat.id;
  const mesajId = cq.message && cq.message.message_id;
  const duzenle = (text) => telegram(env, "editMessageText", { chat_id: sohbet, message_id: mesajId, text });

  const kayitAnahtari = `onay:${anahtar}`;
  const onay = await env.KAYIT.get(kayitAnahtari, "json");
  if (!onay || onay.durum) {
    await cevapla("Bu önizleme geçersiz veya zaten kullanıldı.");
    return duzenle("Bu önizleme artık geçerli değil. Yeniden /paylas yazın.");
  }
  const simdi = Math.floor(Date.now() / 1000);
  if (islem === "ok" && (await bugunSayac(env, simdi)) >= GUNLUK_SINIR) {
    await cevapla("Günlük sınır doldu.");
    return duzenle(`⏸ Bugün ${GUNLUK_SINIR} paylaşım sınırı doldu. ${onay.kod} paylaşılmadı; yarın tekrar /paylas yazın.`);
  }
  // Önce "kullanıldı" işaretle: iki kez basılırsa iki kez paylaşılmasın.
  await env.KAYIT.put(kayitAnahtari, JSON.stringify({ ...onay, durum: islem }), { expirationTtl: 24 * 60 * 60 });

  if (islem !== "ok") {
    await cevapla("İptal edildi.");
    return duzenle(`❌ ${onay.kod} paylaşımı iptal edildi. Kanalda hiçbir şey paylaşılmadı.`);
  }

  const sonuc = onay.paket ? await yeniKanalaPaylas(env, onay.paket, simdi) : await kanaldaPaylas(env, onay.kod, onay.ids, simdi);
  if (!sonuc.ok) {
    await cevapla("Paylaşılamadı.");
    return duzenle(`⚠️ ${onay.kod} paylaşılamadı: ${sonuc.hata}`);
  }
  if (sonuc.ertelendi) { await cevapla("Kuyruğa alındı"); return duzenle(ertelemeMetni(sonuc, onay.kod)); } // 9 Kasım: gece / çok sık → sıra
  await cevapla("Paylaşıldı ✅");
  return duzenle(`✅ ${onay.kod} kanalda yeniden paylaşıldı.${sonuc.link ? "\n" + sonuc.link : ""}`);
}

// Kanala yeniden paylaşımın tek yolu. Bot kendi kanal paylaşımlarını güncelleme
// olarak almadığı için kod dizinini, günlük sayacı ve /hafta sayısını burada günceller.
export async function kanaldaPaylas(env, kod, ids, simdi, beden = null, { zamanli = false } = {}) {
  if (await durdurulduMu(env, "kemal")) return { ok: false, hata: await durMesaji(env, "kemal"), durduruldu: true };
  if (((await env.KAYIT.get("silme:onayli", "json").catch(() => null)) || {})[String(kod)]) return { ok: false, hata: `${kod} için silme onaylandı; kanala paylaşılmaz` }; // 12 Kasım
  if (!zamanli && !(await yayinKapisi(env, simdi)).acik) return yayiniErtele(env, { kod: String(kod), yeni: false, ids, beden, kim: "onaylı" }, simdi);
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  // 10 Kasım (Patron): yeniden paylaşımda ESKİ ALT YAZI ASLA KOPYALANMAZ — medya eski paylaşımdan alınır, alt yazı Kemal'in
  // kendi düzeniyle (EN/FR, fiyatsız, marka imzalı, düğmeli) yazılır.
  let paket;
  try { paket = await yenidenPaket(env, kod, simdi, { ids, beden }); } catch (e) { return { ok: false, hata: `${kod}: ${kisaHata(e)}` }; }
  const s = await yeniKanalaPaylas(env, paket, simdi, { zamanli: true, siteVideo: false, onayliSorunlar: kanalPaketSorunlari(paket) });
  if (s.ok) await siteyeVideoBildir(env, kod, ids, simdi, { sadeceVideosuzsa: true }).catch(() => null); // repete: eski kanal videosu, site videosuzsa
  return s;
}

async function telegramForm(env, metod, form) {
  if (await patronaGider(env, form.get("chat_id"))) return formAktar(env, "kemal", metod, form, (m, g) => telegramGercek(env, m, g));
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", body: form });
  return r.json();
}

// Kanal paylaşımını fotoğraflara marka basarak yeniden yükler (videolar olduğu gibi).
// Medya ve yazı, mesajlar arşiv kanalına iletilerek okunur.
// 4 Kasım (Patron): fotoğraf etiketi modelin MARKASIYLA — model kartı (pelinboy:<kod>.marka), yoksa Sami'nin deposu (tek mağaza)
export async function modelMarkasi(env, kod) {
  const pk = await markaKarari(env, kod); // 6 Kasım: Patron'un kesin kararı önce
  if (pk) return pk;
  const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
  if (kart && (kart.marka === "BLACKROSE" || kart.marka === "VOLONTE")) return kart.marka;
  if (env.STOK) {
    const b = await stokIste(env, "/bilgi", { kod }).catch(() => null);
    const m = [...new Set(((b && b.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))];
    if (m.length === 1 && m[0] === "BLACKROSE") return "BLACKROSE";
  }
  return "VOLONTE";
}
export async function markaliGonder(env, hedef, kod, ids, ekYazi = null, { marka = true, beden = null, kare = null } = {}) {
  const markaAdi = marka ? await modelMarkasi(env, kod) : "VOLONTE";
  try {
    const kanal = await env.KAYIT.get("kanal", "json");
    const arsiv = await env.KAYIT.get("arsiv", "json");
    if (!arsiv) return { ok: false, hata: "arşiv kanalı yok" };
    const tg = (metod, govde) => telegram(env, metod, govde);
    const form = new FormData();
    const medya = [];
    let yazi = null;
    for (const id of ids.slice(0, 10)) {
      const r = await tg("forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true });
      if (!r.ok) return { ok: false, hata: r.description };
      const m = r.result;
      if (!yazi && m.caption) yazi = m.caption;
      if (m.photo && !marka) {
        medya.push({ type: "photo", media: m.photo[m.photo.length - 1].file_id });
      } else if (m.photo) {
        const buyuk = m.photo[m.photo.length - 1];
        const foto = await dosyaBaytIndir(env, tg, buyuk.file_id);
        const ad = `f${medya.length}`;
        form.append(ad, new Blob([await markaBas(env, foto, buyuk.width || 1280, kod, markaAdi)], { type: "image/jpeg" }), `${ad}.jpg`);
        medya.push({ type: "photo", media: `attach://${ad}` });
      } else if (m.video) medya.push({ type: "video", media: m.video.file_id });
      else if (m.document) medya.push({ type: "document", media: m.document.file_id });
      else if (m.animation) medya.push({ type: "video", media: m.animation.file_id });
    }
    // Paylaşımda hiç fotoğraf yoksa onaylı kare (videodan) başa eklenir.
    if (kare && kare.url && !medya.some((x) => x.type === "photo")) {
      if (marka) {
        const foto = new Uint8Array(await (await fetch(kare.url)).arrayBuffer());
        form.append("kare", new Blob([await markaBas(env, foto, kare.w || 1280, kod, markaAdi)], { type: "image/jpeg" }), "kare.jpg");
        medya.unshift({ type: "photo", media: "attach://kare" });
      } else medya.unshift({ type: "photo", media: kare.url });
    }
    if (!medya.length) return { ok: false, hata: "medya yok" };
    if (BEDEN_GRUPLARI[beden]) yazi = bedenYaz(yazi || `✅ CODE.${kod}`, beden);
    const altYazi = [ekYazi, yazi].filter(Boolean).join("\n\n").slice(0, 1024);
    if (altYazi) medya[0].caption = altYazi;
    form.append("chat_id", String(hedef));
    let r;
    if (medya.length === 1) {
      const tek = medya[0];
      const alan = tek.type === "photo" ? "photo" : tek.type === "document" ? "document" : "video";
      form.append(alan, tek.media.startsWith("attach://") ? form.get(tek.media.slice(9)) : tek.media);
      if (tek.caption) form.append("caption", tek.caption);
      r = await telegramForm(env, tek.type === "photo" ? "sendPhoto" : tek.type === "document" ? "sendDocument" : "sendVideo", form);
      if (r.ok) r.result = [r.result];
    } else {
      form.append("media", JSON.stringify(medya));
      r = await telegramForm(env, "sendMediaGroup", form);
    }
    if (!r.ok) return { ok: false, hata: r.description };
    return { ok: true, mesajlar: r.result.map((x) => x.message_id) };
  } catch (e) {
    return { ok: false, hata: e.message };
  }
}

// /marka [kod]: markalı hâlini sadece isteyene gösterir; "✅ Kanalda kullan" ile açılır.
async function markaOnizle(msg, env) {
  const sohbet = msg.chat.id;
  const yaz = (text, ek = {}) => telegram(env, "sendMessage", { chat_id: sohbet, text, ...ek });
  const kod = kodNormal((msg.text || "").split(/\s+/)[1] || "");
  const durum = (await env.KAYIT.get("marka")) === "acik" ? "AÇIK" : "KAPALI";
  if (!kod) return yaz(`Marka basma şu an ${durum}. Önizleme için: /marka 3194`);
  if (!env.IMAGES) return yaz("Görsel aracı bağlı değil.");
  const sec = modelSecenekleri(kod, (await env.KAYIT.get("kodlar", "json")) || {}, (await env.KAYIT.get("kodsuz", "json")) || {})[0];
  if (!sec) return yaz(`${kod} kodlu paylaşım bulamadım.`);
  await telegram(env, "sendChatAction", { chat_id: sohbet, action: "upload_photo" });
  const m = await markaliGonder(env, sohbet, kod, sec.ids, `🖼 Marka önizlemesi — ${kod} (kanala gitmedi)`);
  if (!m.ok) return yaz(`⚠️ Marka basılamadı: ${m.hata}`);
  return yaz(`Marka basma şu an ${durum}. Kemal'in kanala yaptığı paylaşımlarda bu marka kullanılsın mı? (Sizin elle yaptığınız paylaşımlara dokunulmaz; videolara marka basılmaz.)`, {
    reply_markup: { inline_keyboard: [[{ text: "✅ Kanalda kullan", callback_data: "mk:acik" }, { text: "❌ Kullanma", callback_data: "mk:kapali" }]] },
  });
}

const turSayac = async (env, simdi) => Number((await env.KAYIT.get(`sayac:${gunAnahtari(simdi)}`)) || 0); // sadece tur paylaşımları (eski sayaç)
// 13 Kasım (Patron, kural 53): bugün kanala çıkan paylaşım = HER yoldan çıkan model (tur, repete, yeni, ertelenen); günde en fazla 12
async function bugunSayac(env, simdi) {
  const sp = Object.values((await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {}).map(Number).filter((t) => t && gunAnahtari(t) === gunAnahtari(simdi)).length;
  return Math.max(sp, await turSayac(env, simdi));
}

// ---------- Günlük yeniden paylaşım ----------

const saat = (simdi) => ((simdi + SAAT_FARKI) % 86400) / 3600;
// Bildirim alanlar: yöneticiler + ekip. Harcama ve müşteri iletileri sadece yöneticilere.
// 10 Kasım (Patron, görev kâğıdı): Kemal'in kart / bildirimleri SADECE Merdan ve Hemra'ya (Patron'a ve Aziz'e değil)
const kisilerden = (env) => onizleyenler(env); // 10 Kasım görev kâğıdı: kart ve duyurular sadece Merdan + Hemra (Patron'a Kemal yazmaz)
const izinliKisiler = (env) => [...new Set([...kimlikler(env.ALLOWED_IDS), ...kimlikler(env.EKIP_IDS)])];
const yoneticilerden = (env) => kimlikler(env.ALLOWED_IDS);
const kisiAdi = (from) => [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Biri";

// Zamanlanmış görevden her 5 dakikada çağrılır.
export async function rotasyon(env, simdi) {
  const siliyor = await silmeDevam(env);
  // Zamanlanmış görev her seferinde farklı ülkedeki bir veri merkezinde çalışıyor ve
  // Anthropic bazılarından gelen istekleri reddediyor (403). Katalog adımı bu yüzden
  // Kuzey Amerika'ya sabitlenmiş bir Durable Object içinde çalışır.
  // Kemal kendi nesnesinde çalışırken katalog adımı zamanlanmış görevden ayrı istek olarak gelir.
  if (env.KEMAL_ICERDE) {
    // (scheduled → /kemal/adim)
  } else if (env.KATALOG) {
    await sabitNesne(env).fetch("https://katalog/adim");
  } else {
    await katalogGuvenli(env, simdi);
    await altyaziGuvenli(env, simdi);
  }
  let tur = await env.KAYIT.get("tur", "json");
  const gun = gunAnahtari(simdi);

  const s = saat(simdi);
  // Gün sonu (21:00): bugün paylaşılamayan onaylılar sırada kalır (sabah 09:00); eski düzen turu kapanır (eski düğmeler "geçerli değil" der).
  let gunSonuNotu = null;
  if (s >= AKSAM_SAATI && !(await env.KAYIT.get(`gunsonu:${gun}`))) {
    await env.KAYIT.put(`gunsonu:${gun}`, "1", { expirationTtl: 3 * 86400 });
    gunSonuNotu = await gunSonu(env, tur, simdi);
  }
  if (s >= RAPOR_SAATI && s < RAPOR_SAATI + 3 && !(await env.KAYIT.get(`rapor:${gun}`))) {
    await env.KAYIT.put(`rapor:${gun}`, "1", { expirationTtl: 3 * 86400 });
    if (await kagitAcik(env, "kemal", "aksamRaporu")) await aksamRaporu(env, simdi, gunSonuNotu);
  }
  // Yeni düzen denemesi (elle: KV "kemal:yeniDeneme" = { gruplar: [{ baslik, kodlar }] }) — saatten bağımsız.
  const deneme = await env.KAYIT.get("kemal:yeniDeneme", "json");
  if (deneme && !siliyor) {
    await env.KAYIT.delete("kemal:yeniDeneme");
    await yeniTurBaslat(env, tur, simdi, deneme.gruplar);
    return;
  }
  // Yazıları hazırlanan tur (akşam da sürer: önizlemeler gelsin, onaylar ertesi güne kalır).
  if (tur && tur.yeni && tur.durum === "hazirlaniyor") {
    if (!siliyor) await yeniTurAdimi(env, simdi);
    return;
  }
  if (s < SABAH_SAATI || s >= YAYIN_BIT) return;

  // Günde tek tur: o günün turu yoksa sabah açılır (yeni düzen: stokta + sitede + 7 gündür paylaşılmamış modeller).
  if ((!tur || turGunu(tur) < gun) && s < AKSAM_SAATI) {
    // ESKI_TUR=1: eski düzen (kanal paylaşımı kopyası; sadece testlerde/geri dönüş için).
    if (!siliyor) {
      // 13 Kasım (Patron): 21:00'den sonra gelen "Kemal'i çalıştır" komutu sabah 09:00 turuna planlanır
      const plan = env.ESKI_TUR === "1" ? null : await env.KAYIT.get("kemal:calistirPlan", "json").catch(() => null);
      if (plan) await env.KAYIT.delete("kemal:calistirPlan");
      await (env.ESKI_TUR === "1" ? turBaslat(env, tur, simdi) : yeniTurBaslat(env, tur, simdi, null, plan ? { enAzGun: Number(plan.enAzGun) || 0 } : {}));
      if (plan) {
        const t2 = await env.KAYIT.get("tur", "json");
        const kodlar = t2 && turGunu(t2) === gun ? Object.keys(t2.ogeler || {}) : [];
        const { son } = await telegramTarihleriAl(env);
        await stokIste(env, "/kuyruk-ekle", { ad: "rkSonuc", kayit: { id: `kc:${simdi}`, rid: `kemal-calistir-${simdi}`, metin: calistirSatiri({ ok: true, n: kodlar.length, enEski: enEskiModel(kodlar, son, simdi), neden: kodlar.length ? null : "uygun model yok" }) } }).catch(() => null);
      }
    }
    return;
  }
  // 9 Kasım (Patron): günlük hedef 10 onay — "Geç" denenlerin yerine toplu ek öneri (15:00'e kadar)
  if (!siliyor && tur && tur.yeni && (await turTamamla(env, simdi).catch(async (e) => { await env.KAYIT.put("kemal:tamamlaHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); return false; }))) return;
  const paylasti = s >= YAYIN_BAS && s < YAYIN_BIT ? await siradakiniPaylas(env, simdi) : false; // 9 Kasım: sadece 09–21
  // Sonradan eklenen / geç /start yazan kişiye bugünün bekleyen modelleri (istek sınırı için
  // paylaşım ya da silme yapılan çalışmada değil).
  if (!paylasti && !siliyor && (await kagitAcik(env, "kemal", "turEksikleri"))) await turEksikleriGonder(env, 10);
  // Stok soruları (Beklesin süresi dolanlar ya da köprü çalışmasında gönderilemeyenler).
  if (!paylasti && !siliyor && (await kagitAcik(env, "kemal", "stokSorulari"))) await stokSorulariGonder(env, simdi);
}

const turGunu = (tur) => tur.gun || gunAnahtari(tur.basla);

async function gunSonu(env, tur, simdi) {
  // 13 Kasım (Patron, kural 52): 21:00'de paylaşılamayan onaylılar SİLİNMEZ — sırada kalır, sabah 09:00'dan itibaren gider
  // (paylaşım anında stok yeniden kontrol edilir).
  const kuyruk = [];
  if (tur && tur.durum === "toplaniyor" && !tur.yeni) {
    tur.durum = "bitti";
    tur.bitis = simdi;
    await env.KAYIT.put("tur", JSON.stringify(tur));
  }
  return kuyruk.length ? `Bugün paylaşılamayan ${kuyruk.length} onaylı model sıradan çıkarıldı (${kuyruk.map((o) => kodGoster(o.kod)).join(", ")}); ileriki bir turda yeniden sorulacak.` : null;
}

const herkese = async (env, text) => {
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text, disable_web_page_preview: true });
};


// En uzun süredir paylaşılmayan önce. Son paylaşımı 30 günden eski, 1 yıldan yeni olanlar.
// sonpaylasim: botun yeniden paylaşım tarihleri (kod → tarih); kayıttaki tarihten yeniyse o geçerli.
export function adaylar(kodlar, kodsuz, atlananlar, kuyruktakiler, simdi, sonpaylasim = {}) {
  const enYeni = (kod, t) => Math.max(t, sonpaylasim[kod] || 0);
  const hepsi = [
    ...Object.entries(kodlar).filter(([, l]) => l.length).map(([kod, l]) => ({ kod, ids: l[0].ids, tarih: enYeni(kod, l[0].tarih) })),
    ...Object.entries(kodsuz).map(([kod, g]) => ({ kod, ids: g.ids, tarih: enYeni(kod, g.tarih) })),
  ];
  return hepsi
    .filter((a) => a.tarih < simdi - BEKLEME_SN && a.tarih >= simdi - YIL_SN)
    .filter((a) => !(atlananlar[a.kod] > simdi) && !kuyruktakiler.includes(a.kod))
    .sort((a, b) => a.tarih - b.tarih || a.ids[0] - b.ids[0]);
}
const BEKLEME_SN = BEKLEME_GUN * 86400;

async function kuyrukListesi(env) {
  const { keys } = await env.KAYIT.list({ prefix: "kuyruk:" });
  const ogeler = [];
  for (const k of keys) {
    const v = await env.KAYIT.get(k.name, "json");
    if (v) ogeler.push(v);
  }
  return ogeler.sort((a, b) => a.zaman - b.zaman);
}

// Her paylaşım tarihi için bir "✅" düğmesi; hangisine basılırsa o paylaşım paylaşılır.
export function turKlavye(no, kod, secenekler, beden = null) {
  const onay = secenekler.length === 1
    ? [[{ text: `✅ Onaylıyorum (${tarihUzun(secenekler[0].tarih)})`, callback_data: `t1:${no}:${kod}:0` }]]
    : secenekler.reduce((satirlar, sec, i) => {
      const d = { text: `✅ ${tarihUzun(sec.tarih)}`, callback_data: `t1:${no}:${kod}:${i}` };
      if (i % 2 === 0) satirlar.push([d]);
      else satirlar[satirlar.length - 1].push(d);
      return satirlar;
    }, []);
  const bedenler = Object.entries(BEDEN_GRUPLARI).map(([k, g]) => ({ text: `${beden === k ? "✓ " : ""}📏 ${g.ad}`, callback_data: `tb:${no}:${kod}:${k}` }));
  return { inline_keyboard: [
    bedenler,
    ...onay,
    [{ text: "🖼 Hepsini göster", callback_data: `tg:${no}:${kod}` }],
    [{ text: "⏳ Beklesin", callback_data: `t7:${no}:${kod}` }], // 10 Kasım (Patron): "Sil" ekibe gitmez — silme sadece Patron'un (Venom'a "3512 sil")
  ] };
}

export { modelSecenekleri };
// no "-" = turdan bağımsız (asistandan gelen) silme onayı
const eminMisin = (no, kod) => ({ inline_keyboard: [[
  { text: "🗑️ Evet, hepsini sil", callback_data: `ty:${no}:${kod}` },
  { text: "↩️ Vazgeç", callback_data: `tv:${no}:${kod}` },
]] });

// Sabah: o günün 10 modeli seçilir ve her kişiye art arda (birkaç saniye içinde) gönderilir.
// Her kişinin mesajları ayrı bir çalışmada (Durable Object) gider: ücretsiz pakette çalışma
// başına 50 istek sınırı kişi sayısı artınca aşılmasın.
async function turBaslat(env, onceki, simdi) {
  const tur = { no: ((onceki && onceki.no) || 0) + 1, durum: "toplaniyor", basla: simdi, gun: gunAnahtari(simdi), onaylar: [], ogeler: {} };
  await env.KAYIT.put("tur", JSON.stringify(tur)); // önce kaydet: görev üst üste çalışırsa iki tur açılmasın
  // Önceki günlerden sırada kalan onaylılar (ör. akşam temizliği çalışamadıysa) ileri güne taşınmaz.
  for (const o of await kuyrukListesi(env)) if (gunAnahtari(Math.floor(o.zaman)) < tur.gun) await env.KAYIT.delete(`kuyruk:${o.kod}`);
  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  const atlananlar = { ...((await env.KAYIT.get("atlananlar", "json")) || {}), ...Object.fromEntries(Object.keys((await env.KAYIT.get("silme:onayli", "json").catch(() => null)) || {}).map((k) => [k, 4e9])) }; // 12 Kasım: silinmesi onaylanan model sıraya girmez
  const sonpaylasim = (await env.KAYIT.get("sonpaylasim", "json")) || {};
  const kuyruk = await kuyrukListesi(env);
  const arsiv = await env.KAYIT.get("arsiv", "json");
  // Vegawin'de stoğu 0/eksi olan ya da "Sil" ile gizlenen modeller sorulmaz (köprü bağlıysa).
  const stoksuz = await stokGizliler(env);
  const hazir = [];
  // Kanalda bulunamayan çıkarsa diye 4 yedek.
  for (const aday of kanal ? adaylar(kodlar, kodsuz, atlananlar, [...kuyruk.map((k) => k.kod), ...stoksuz], simdi, sonpaylasim).slice(0, TUR_ADET + 4) : []) {
    const secenekler = modelSecenekleri(aday.kod, kodlar, kodsuz);
    if (!secenekler.length) continue;
    if (hazir.length >= TUR_ADET + 4) break;
    const gunOnce = Math.floor((simdi - aday.tarih) / 86400);
    const kopyaSayisi = kodsuzMu(aday.kod) ? (kodsuz[aday.kod].kopyalar || []).length : 0;
    // Beden önerisi: en yeni paylaşımın alt yazısından (arşive iletilerek okunur).
    let beden = null;
    if (arsiv) {
      const yId = ((kodlar[aday.kod] || []).find((g) => g.tarih === secenekler[0].tarih) || {}).y || secenekler[0].ids[0];
      const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: yId, disable_notification: true });
      if (r.ok) beden = bedenOnerisi(r.result.caption || r.result.text || "");
    }
    const yazi = [
      `${kodGoster(aday.kod)} · son paylaşım ${tarihUzun(aday.tarih)} (${gunOnce} gün önce)`,
      `Kanaldaki paylaşımları (${secenekler.length}):`,
      ...secenekler.map((sec, i) => `${i + 1}) ${tarihUzun(sec.tarih)} · ${sec.ids.length} medya${kanal.kullanici ? ` · t.me/${kanal.kullanici}/${sec.ids[0]}` : ""}`),
      ...(kopyaSayisi ? [`(Kemal bunu daha önce yeniden paylaştı.)`] : []),
      beden ? `📏 Alt yazıdaki beden: ${BEDEN_GRUPLARI[beden].ad} (öneri; değiştirebilirsiniz)` : "📏 Alt yazıda beden yok — onaydan önce beden seçin",
    ].join("\n");
    hazir.push({ kod: aday.kod, mesaj: secenekler[0].ids[0], yazi, secenekler, tarih: aday.tarih, beden });
  }
  if (!hazir.length) {
    tur.durum = "bitti";
    tur.bitis = simdi;
    await env.KAYIT.put("tur", JSON.stringify(tur));
    return herkese(env, "Bugün önerecek model yok (hepsi son 30 günde paylaşılmış, beklemede ya da silinmiş). Yarın sabah tekrar bakacağım.");
  }
  await herkese(env, `🆕 Günaydın! Ben Kemal — bugünün turu (${tur.no}. tur). Uzun süredir paylaşılmayan ${Math.min(TUR_ADET, hazir.length)} model aşağıda; her birinin altında kanaldaki bütün paylaşım tarihleri var.\n✅ <tarih> → o paylaşım bugün paylaşılır · 🖼 Hepsini göster · ⏳ Beklesin (${BEKLESIN_GUN} gün sonra tekrar sorarım) · 🗑️ Sil (onayınızla kanaldaki tüm paylaşımları silinir).\n📏 Küçük (38-44) / Büyük (44-50) / İkisi de: alt yazıdaki beden öneri olarak seçili gelir; seçtiğiniz beden paylaşımın alt yazısına yazılır.\nOnaylananlar ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla paylaşılır. Yarının turu yarın sabah gelir.`);

  let secilen = null; // ilk ulaşılan kişide giden modeller; diğerlerine aynıları gider
  const bulunamayan = [];
  for (const kisi of kisilerden(env)) {
    const gidecek = secilen ? hazir.filter((h) => secilen.includes(h.kod)) : hazir;
    const r = await turParcasiGonder(env, { kisi, kanal: kanal.id, no: tur.no, hedef: TUR_ADET, ogeler: gidecek.map(({ kod, mesaj, yazi, secenekler, beden }) => ({ kod, mesaj, yazi, secenekler, beden })) });
    if (!secilen && r.gonderilen.length) {
      secilen = r.gonderilen.map(([kod]) => kod);
      bulunamayan.push(...r.bulunamayan);
    }
    if (!r.gonderilen.length) continue;
    // Her kişiden sonra kaydet: ilk gelenler hemen düğmeye basabilsin.
    const guncel = (await env.KAYIT.get("tur", "json")) || tur;
    if (guncel.no !== tur.no) return;
    for (const [kod, id] of r.gonderilen) {
      const h = hazir.find((x) => x.kod === kod);
      const oge = guncel.ogeler[kod] || (guncel.ogeler[kod] = { ids: h.secenekler[0].ids, secenekler: h.secenekler, tarih: h.tarih, yazi: h.yazi, mesajlar: [], karar: null, kim: null, secilen: null, beden: h.beden, bedenOneri: h.beden });
      oge.mesajlar.push([kisi, id]);
      if (oge.karar) await telegram(env, "editMessageReplyMarkup", { chat_id: kisi, message_id: id, reply_markup: { inline_keyboard: [] } });
    }
    await env.KAYIT.put("tur", JSON.stringify(guncel));
  }
  // Kanalda bulunamayanlar bir yıl önerilmez.
  if (bulunamayan.length) {
    for (const kod of bulunamayan) atlananlar[kod] = simdi + YIL_SN;
    await env.KAYIT.put("atlananlar", JSON.stringify(atlananlar));
  }
}

const bekle = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Bir kişiye turun mesajlarını art arda gönderir (Durable Object içinde, kendi istek sınırıyla).
async function turParcasiGonder(env, govde) {
  if (env.KATALOG) return (await sabitNesne(env).fetch("https://katalog/tur-gonder", { method: "POST", body: JSON.stringify(govde) })).json();
  return turParcasiIsle(env, govde);
}
export async function turParcasiIsle(env, { kisi, kanal, no, hedef, ogeler }) {
  const gonderilen = [];
  const bulunamayan = [];
  const ara = env.MESAJ_ARASI_MS != null ? Number(env.MESAJ_ARASI_MS) : 1000;
  for (const o of ogeler) {
    if (gonderilen.length >= hedef) break;
    if (gonderilen.length) await bekle(ara);
    const r = await telegram(env, "copyMessage", { chat_id: kisi, from_chat_id: kanal, message_id: o.mesaj, caption: o.yazi, reply_markup: turKlavye(no, o.kod, o.secenekler, o.beden) });
    if (r.ok) gonderilen.push([o.kod, r.result.message_id]);
    else if (/message to copy not found|message_id_invalid|to copy/i.test(r.description || "")) bulunamayan.push(o.kod);
    else break; // kişiye ulaşılamıyor (ör. /start yazmamış): sonraki çalışmada eksikler gönderilir
  }
  return { gonderilen, bulunamayan };
}

// Turda cevap bekleyen modelleri, o anda ulaşılamamış ya da sonradan eklenmiş kişilere de
// gönderir (ör. ekibe yeni katılan, /start'ı geç yazan). Kim önce basarsa geçerli olur.
export async function turEksikleriGonder(env, enFazla = 10) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || tur.durum !== "toplaniyor" || tur.yeni) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return;
  const ulasilamayan = new Set();
  const yeni = {};
  let gonderilen = 0;
  for (const [kod, oge] of Object.entries(tur.ogeler)) {
    if (oge.karar) continue;
    const sahip = new Set((oge.mesajlar || []).map(([k]) => String(k)));
    const secenekler = oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }];
    for (const kisi of kisilerden(env)) {
      if (sahip.has(kisi) || ulasilamayan.has(kisi) || gonderilen >= enFazla) continue;
      gonderilen += 1;
      const r = await telegram(env, "copyMessage", {
        chat_id: kisi, from_chat_id: kanal.id, message_id: secenekler[0].ids[0], caption: oge.yazi, reply_markup: turKlavye(tur.no, kod, secenekler, oge.beden),
      });
      if (r.ok) (yeni[kod] = yeni[kod] || []).push([kisi, r.result.message_id]);
      else ulasilamayan.add(kisi); // bu çalışmada bir daha denenmez
    }
  }
  if (!Object.keys(yeni).length) return;
  // Gönderirken biri düğmeye basmış olabilir: güncel turu okuyup sadece mesajları ekle.
  const guncel = await env.KAYIT.get("tur", "json");
  for (const [kod, liste] of Object.entries(yeni)) {
    const oge = guncel && guncel.no === tur.no && guncel.ogeler[kod];
    if (oge && !oge.karar) oge.mesajlar = [...(oge.mesajlar || []), ...liste];
    else for (const [kisi, id] of liste) await telegram(env, "editMessageReplyMarkup", { chat_id: kisi, message_id: id, reply_markup: { inline_keyboard: [] } });
  }
  if (guncel) await env.KAYIT.put("tur", JSON.stringify(guncel));
}

export async function atla(env, kod, gunSayisi, simdi) {
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
  atlananlar[kod] = gunSayisi === null ? KALICI : simdi + gunSayisi * 86400;
  for (const [k, t] of Object.entries(atlananlar)) if (t < simdi) delete atlananlar[k];
  await env.KAYIT.put("atlananlar", JSON.stringify(atlananlar));
}

// Tur içindeki bir model için karar: "t1" onay, "t7" beklesin, "ty" sil (onaylanmış).
export async function turKarar(env, kod, islem, kim, simdi, secim = 0) {
  const tur = await env.KAYIT.get("tur", "json");
  const oge = tur && tur.durum === "toplaniyor" && tur.ogeler[kod];
  if (!oge) return { ok: false, neden: "turda-yok" };
  if (oge.karar) return { ok: false, neden: "zaten", kim: oge.kim };
  const secenekler = oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }];
  if (islem === "t1" && !secenekler[secim]) return { ok: false, neden: "secenek-yok" };
  oge.karar = islem;
  oge.kim = kim;
  if (islem === "t1") {
    oge.secilen = secim;
    tur.onaylar.push(kod);
  }
  await env.KAYIT.put("tur", JSON.stringify(tur)); // önce kilitle: iki kez işlenmesin

  const ek = islem === "t1" ? `✅ ${kim} onayladı: ${tarihUzun(secenekler[secim].tarih)} paylaşımı${oge.beden ? `, beden ${BEDEN_GRUPLARI[oge.beden].ad} (${BEDEN_GRUPLARI[oge.beden].bedenler})` : ""} — bugün paylaşım sırasına girdi.`
    : islem === "t7" ? `⏳ ${kim}: beklesin — ${BEKLESIN_GUN} gün sonra tekrar sorulacak.`
    : `🗑️ ${kim}: sil — kanaldaki paylaşımları siliniyor.`;
  for (const [kisi, mesajId] of oge.mesajlar) {
    await telegram(env, "editMessageCaption", { chat_id: kisi, message_id: mesajId, caption: `${oge.yazi}\n${ek}`, reply_markup: { inline_keyboard: [] } });
  }

  // Onaylanan aynı gün sıraya girer (gün sonunda paylaşılamazsa sıradan çıkar). Beklesin/Sil'in
  // yerine yeni model gelmez: günde sadece sabahki 10 model sorulur.
  if (islem === "t1") {
    const sec = secenekler[secim];
    await env.KAYIT.put(`kuyruk:${kod}`, JSON.stringify({ kod, ids: sec.ids, tarih: sec.tarih, kim, zaman: simdi + tur.onaylar.length / 1000, tur: tur.no, beden: oge.beden || null })); // onay sırası korunur
  } else if (islem === "t7") await atla(env, kod, BEKLESIN_GUN, simdi);
  else await hicGelmeyecek(env, kod, kim, simdi);
  return { ok: true };
}

async function turDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, no, kod, secimYazi] = cq.data.split(":");
  const secim = Number(secimYazi || 0);
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const benim = { chat_id: cq.message.chat.id, message_id: cq.message.message_id };

  // Turdan bağımsız silme onayı (asistandan): mesaj metindir, altyazı değil.
  if (no === "-") {
    if (islem === "tv") {
      await cevapla("Vazgeçildi");
      return telegram(env, "editMessageText", { ...benim, text: `↩️ ${kodGoster(kod)}: vazgeçildi, hiçbir şey silinmedi.` });
    }
    if (islem !== "ty") return cevapla("Geçersiz düğme.");
    if (!String(env.MURAT_ID || "").split(",").map((x) => x.trim()).includes(String(cq.from.id))) return cevapla("Silme sadece Patron ve Venom'dadır."); // 13 Kasım (kural 41): eski karttaki düğme
    if ((await env.KAYIT.get(`silinecek:${kod}`)) || ((await env.KAYIT.get("hicgelmeyecek", "json")) || {})[kod]) {
      await cevapla("Zaten silindi / siliniyor.");
      return telegram(env, "editMessageText", { ...benim, text: `${kodGoster(kod)} zaten silindi ya da siliniyor.` });
    }
    await cevapla("Siliniyor");
    await telegram(env, "editMessageText", { ...benim, text: `🗑️ ${kodGoster(kod)}: ${kim} sil dedi — kanaldaki paylaşımları siliniyor...` });
    const r = await turKarar(env, kod, "ty", kim, simdi); // turda bekliyorsa tur kuralıyla
    if (!r.ok) await hicGelmeyecek(env, kod, kim, simdi);
    return;
  }

  const tur = await env.KAYIT.get("tur", "json");
  const oge = tur && String(tur.no) === no && tur.ogeler[kod];
  if (!oge || tur.durum !== "toplaniyor") return cevapla("Bu tur artık geçerli değil.");
  if (islem === "tg") return hepsiniGoster(cq, env, kod, oge);
  if (oge.karar) return cevapla(`${oge.kim} zaten işaretledi.`);
  if (islem === "tb") {
    if (!BEDEN_GRUPLARI[secimYazi]) return cevapla("Geçersiz düğme.");
    oge.beden = secimYazi;
    await env.KAYIT.put("tur", JSON.stringify(tur));
    await cevapla(`Beden: ${BEDEN_GRUPLARI[secimYazi].ad} (${BEDEN_GRUPLARI[secimYazi].bedenler})`);
    const klavye = turKlavye(no, kod, oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }], oge.beden);
    for (const [kisi, mesajId] of oge.mesajlar) await telegram(env, "editMessageReplyMarkup", { chat_id: kisi, message_id: mesajId, reply_markup: klavye });
    return;
  }
  // Beden düğmesi olmayan eski tur mesajları (bedenOneri alanı yok) bedensiz onaylanabilir.
  if (islem === "t1" && !oge.beden && "bedenOneri" in oge) return cevapla("Önce beden seçin: 📏 Küçük / Büyük / İkisi de");

  // "Sil": önce sadece basan kişiye "Emin misiniz?" sorulur, kilit konmaz.
  if (islem === "tx" && !String(env.MURAT_ID || "").split(",").map((x) => x.trim()).includes(String(cq.from.id))) return telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Silme kararı sadece Patron'un." }); // 10 Kasım: eski kartlar
  if (islem === "tx") {
    await cevapla("Emin misiniz?");
    return telegram(env, "editMessageCaption", { ...benim, caption: `${oge.yazi}\n🗑️ Emin misiniz? Bu modelin kanaldaki TÜM paylaşımları silinecek ve bir daha önerilmeyecek.`, reply_markup: eminMisin(no, kod) });
  }
  if (islem === "tv") {
    await cevapla("Vazgeçildi");
    return telegram(env, "editMessageCaption", { ...benim, caption: oge.yazi, reply_markup: turKlavye(no, kod, oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }], oge.beden) });
  }
  if (!["t1", "t7", "ty"].includes(islem)) return cevapla("Geçersiz düğme.");
  await cevapla(islem === "t1" ? "Onaylandı ✅" : islem === "t7" ? "Beklesin ⏳" : "Siliniyor 🗑️");
  await turKarar(env, kod, islem, kim, simdi, secim);
}

// Modelin kanaldaki bütün paylaşımlarını sadece basan kişiye gönderir (karar değildir).
async function hepsiniGoster(cq, env, kod, oge) {
  const kanal = await env.KAYIT.get("kanal", "json");
  const secenekler = oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }];
  await telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${secenekler.length} paylaşım gönderiliyor` });
  const sohbet = cq.message.chat.id;
  for (const [i, sec] of secenekler.entries()) {
    await telegram(env, "sendMessage", { chat_id: sohbet, text: `📅 ${kodGoster(kod)} — ${i + 1}) ${tarihUzun(sec.tarih)} paylaşımı (${sec.ids.length} medya):` });
    const r = await telegram(env, "copyMessages", { chat_id: sohbet, from_chat_id: kanal.id, message_ids: sec.ids });
    if (!r.ok) await telegram(env, "sendMessage", { chat_id: sohbet, text: `⚠️ Bu paylaşım gösterilemedi (${r.description}).` });
  }
  await telegram(env, "sendMessage", { chat_id: sohbet, text: `Seçmek için ${kodGoster(kod)} mesajındaki "✅ <tarih>" düğmelerini kullanın.` });
}

// ---------- "Sil": onaylı silme ----------

// Botun bildiği bütün kanal mesajları (kodlu: tüm paylaşımlar; kodsuz: kayıt + botun kopyaları)
export function modelMesajlari(kod, kodlar, kodsuz) {
  if (kodsuzMu(kod)) {
    const g = kodsuz[kod];
    return g ? [...new Set([...(g.gecmis || []).flat(), ...g.ids, ...(g.kopyalar || [])])].filter((id) => id > 0).sort((a, b) => a - b) : [];
  }
  return [...new Set((kodlar[kod] || []).flatMap((g) => g.ids))].filter((id) => id > 0).sort((a, b) => a - b);
}

// "SİL" (2 Kasım, Patron kuralı): modelin VOLONTE kanalındaki BÜTÜN paylaşımları (kodlu + gorsel:true ise fotoğrafa bakarak
// bulunan kodsuz paylaşımlar) önce gizli "Kemal arşiv" kanalına kopyalanır (fotoğraf/video + alt yazı; tarih kayıtta), sonra
// silinir. Kopyaların yeri KV "silinen:<kod>" → "/geri <kod>" ile kanala geri konur. Görsel eşleşmede emin olunmayan paylaşım
// SİLİNMEZ, Patron'a ayrıca bildirilir. ek.patron: sonuç sadece Patron'a tek mesaj; ek.site: Selin'in site sonucu.
export async function hicGelmeyecek(env, kod, kim, simdi, ek = {}) {
  const stok = await magazaStogu(env, kod); // 10 Kasım KESİN KURAL: mağaza stoğu bitmeden kanaldan kaldırılmaz
  if (stok) { await telegram(env, "sendMessage", { chat_id: String(env.MURAT_ID || "").split(",")[0].trim(), text: STOK_KURALI(kod, stok) }).catch(() => null); return { engel: stok }; }
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  let ids = modelMesajlari(kod, kodlar, kodsuz);
  const tarihler = kodsuzMu(kod) ? [kodsuz[kod]?.tarih].filter(Boolean) : (kodlar[kod] || []).map((g) => g.tarih);
  let gorsel = { eslesen: [], supheli: [], not: null };
  if (ek.gorsel && !kodsuzMu(kod)) {
    try { gorsel = await gorselEslesme(env, kod, arsiv); } catch (e) { gorsel.not = `görsel arama yapılamadı (${String(e && e.message).slice(0, 120)})`; }
    for (const k of gorsel.eslesen) { ids = [...ids, ...modelMesajlari(k, kodlar, kodsuz)]; tarihler.push(kodsuz[k]?.tarih); arsiv[k] = { kim, zaman: simdi, tarihler: [kodsuz[k]?.tarih].filter(Boolean), mesajSayisi: modelMesajlari(k, kodlar, kodsuz).length, ana: kod }; }
    ids = [...new Set(ids)].sort((a, b) => a - b);
  }
  const paylasim = (kodsuzMu(kod) ? 1 : (kodlar[kod] || []).length) + gorsel.eslesen.length;
  arsiv[kod] = { kim, zaman: simdi, tarihler: tarihler.filter(Boolean), mesajSayisi: ids.length };
  await env.KAYIT.put("hicgelmeyecek", JSON.stringify(arsiv));
  await atla(env, kod, null, simdi);
  await env.KAYIT.delete(`kuyruk:${kod}`);
  await env.KAYIT.put(`silinecek:${kod}`, JSON.stringify({ kod, kim, kalan: ids, silinen: 0, hatali: [], hata: null, kopya: [], paylasim, site: ek.site || null, patron: Boolean(ek.patron), supheli: gorsel.supheli, gorselNot: gorsel.not, tarihler: tarihler.filter(Boolean) }));
  await silmeAdimi(env, kod);
}

// Kodsuz kanal paylaşımları arasında bu modeli fotoğrafa bakarak bulur: katalog tariflerinden adaylar seçilir, her aday
// referans fotoğrafla (modelin katalog görseli) ikili karşılaştırılır. Silinecek: "aynı + yüksek güven"; şüpheli: aynı ama
// orta/düşük güven (silinmez, Patron'a bildirilir).
async function gorselEslesme(env, kod, silinmisler) {
  const sonuc = { eslesen: [], supheli: [], not: null };
  if (!env.ANTHROPIC_API_KEY) { sonuc.not = "görsel arama kapalı (yapay zekâ bağlı değil)"; return sonuc; }
  const tarifler = (await env.KAYIT.get("tarifler", "json")) || {};
  if (!tarifler[kod] || !tarifler[kod].f) { sonuc.not = "görsel arama yapılamadı: modelin katalog fotoğrafı yok (sadece kodlu paylaşımlar silindi)"; return sonuc; }
  const katalog = Object.entries(tarifler).filter(([k, v]) => kodsuzMu(k) && !silinmisler[k] && v.t && !/kıyafet yok/i.test(v.t));
  if (!katalog.length) return sonuc;
  const tg = (metod, govde) => telegram(env, metod, govde);
  const ref = await dosyaIndir(env, tg, tarifler[kod].f);
  const adaylar = (await adaySec(env, ref, katalog.map(([k, v]) => `${k} | ${v.t}`), `silinecek model ${kod}`)).filter((k) => tarifler[k]).slice(0, GORSEL_ADAY);
  for (const k of adaylar) {
    try {
      const r = await ayniModelMi(env, ref, await dosyaIndir(env, tg, tarifler[k].f));
      if (r.ayni && r.guven === "yuksek") sonuc.eslesen.push(k);
      else if (r.ayni) sonuc.supheli.push({ k, guven: r.guven, aciklama: r.aciklama });
    } catch { /* indirilemeyen/karşılaştırılamayan aday atlanır */ }
  }
  return sonuc;
}

// SOLD OUT görseli (Patron kararı 2 Kasım): Telegram botların 48 saatten eski mesajı silmesine izin vermiyor. Böyle bir
// paylaşım silinemezse görseli VOLONTE tarzı "SOLD OUT" görseliyle değiştirilir ve alt yazısı kaldırılır (orijinali arşivde).
// Görsel KV "kemal:soldout:b64"te (depoda gorseller/soldout.jpg); bir kez arşiv kanalına yüklenip dosya kimliği saklanır.
async function soldoutDosyasi(env) {
  const kayitli = await env.KAYIT.get("kemal:soldout:fileId");
  if (kayitli) return kayitli;
  const b64 = await env.KAYIT.get("kemal:soldout:b64");
  const arsivKanal = await env.KAYIT.get("arsiv", "json");
  if (!b64 || !arsivKanal) return null;
  const bayt = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const f = new FormData();
  f.append("chat_id", String(arsivKanal.id));
  f.append("caption", "SOLD OUT görseli (Kemal, eski paylaşımları gizlemek için)");
  f.append("disable_notification", "true");
  f.append("photo", new Blob([bayt], { type: "image/jpeg" }), "soldout.jpg");
  const r = await (await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/sendPhoto`, { method: "POST", body: f })).json().catch(() => null);
  const id = r && r.ok && r.result.photo && r.result.photo.at(-1).file_id;
  if (id) await env.KAYIT.put("kemal:soldout:fileId", id);
  return id || null;
}
async function soldoutIleGizle(env, kanalId, mesajId) {
  const dosya = await soldoutDosyasi(env);
  if (!dosya) return { ok: false, description: "SOLD OUT görseli hazır değil" };
  return telegram(env, "editMessageMedia", { chat_id: kanalId, message_id: mesajId, media: { type: "photo", media: dosya, caption: "" } });
}
const ESKI_MESAJ = /can't be deleted|cannot be deleted|message can't|too old|48/i;

async function silmeAdimi(env, kod) {
  const anahtar = `silinecek:${kod}`;
  const is = await env.KAYIT.get(anahtar, "json");
  if (!is) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  const arsivKanal = await env.KAYIT.get("arsiv", "json");
  const parti = is.kalan.slice(0, SILME_ADIM);
  // Önce kopya: arşiv kanalına (album düzeni korunur). Kopyalanamayan mesaj SİLİNMEZ (geri konamaz).
  let kopyalar = null;
  if (arsivKanal && parti.length) {
    const c = await telegram(env, "copyMessages", { chat_id: arsivKanal.id, from_chat_id: kanal.id, message_ids: parti, disable_notification: true });
    if (c.ok && Array.isArray(c.result) && c.result.length === parti.length) kopyalar = c.result.map((x) => x.message_id);
  }
  is.kopya = is.kopya || [];
  is.gizlenen = is.gizlenen || [];
  for (const [i, id] of parti.entries()) {
    if (arsivKanal && !kopyalar) { is.hatali.push(id); is.hata = is.hata || "arşive kopyalanamadı (silinmedi)"; continue; }
    const r = await telegram(env, "deleteMessage", { chat_id: kanal.id, message_id: id });
    if (r.ok) { is.silinen += 1; if (kopyalar) is.kopya.push({ kanal: id, arsiv: kopyalar[i] }); continue; }
    // Patron kuralı varsa (2 Kasım): 48 saatten eski → SOLD OUT görseliyle gizle (orijinali arşivde), link Patron'a
    if (is.patron && kopyalar && ESKI_MESAJ.test(r.description || "")) {
      const g = await soldoutIleGizle(env, kanal.id, id);
      if (g.ok) { is.gizlenen.push(id); is.kopya.push({ kanal: id, arsiv: kopyalar[i], gizlendi: true }); continue; }
      is.hata = is.hata || `${r.description} — SOLD OUT ile de gizlenemedi: ${g.description || "bilinmeyen hata"}`;
    }
    is.hatali.push(id);
    is.hata = is.hata || r.description || "bilinmeyen hata";
  }
  is.kalan = is.kalan.slice(parti.length);
  if (is.kalan.length) {
    await env.KAYIT.put(anahtar, JSON.stringify(is)); // kalanı 5 dk'lık görev sürdürür
    return;
  }
  await env.KAYIT.delete(anahtar);
  // Geri koyma kaydı (silinmez): arşivdeki kopyalar, sırasıyla
  const eski = (await env.KAYIT.get(`silinen:${kod}`, "json")) || { kopya: [] };
  await env.KAYIT.put(`silinen:${kod}`, JSON.stringify({ kod, kim: is.kim, zaman: Math.floor(Date.now() / 1000), tarihler: is.tarihler || [], kopya: [...(eski.kopya || []), ...is.kopya], arsivKanal: arsivKanal ? arsivKanal.id : null }));
  const ad = kodGoster(kod);
  const link = (id) => (kanal.kullanici ? `https://t.me/${kanal.kullanici}/${id}` : `#${id}`);
  if (is.patron) {
    // Patron'a TEK mesaj (2 Kasım kuralı)
    const siteOk = ["kaldirildi", "yoktu"].includes(is.site);
    const tamam = siteOk && !is.hatali.length;
    const gizlenen = is.gizlenen || [];
    const satirlar = [tamam
      ? `✅ ${ad} siteden ve kanaldan kaldırıldı (${is.paylasim} paylaşım${gizlenen.length ? `: ${is.silinen} mesaj silindi, ${gizlenen.length} eski mesaj SOLD OUT ile gizlendi` : ` silindi${is.silinen !== is.paylasim ? `, ${is.silinen} mesaj` : ""}`}).${is.site === "yoktu" ? " (Sitede zaten yoktu.)" : ""}`
      : `⚠️ ${ad}: ${siteOk ? (is.site === "yoktu" ? "sitede zaten yoktu" : "siteden kaldırıldı") : `siteden KALDIRILAMADI (${is.site || "Selin cevap vermedi"})`}; kanaldan ${is.silinen} mesaj silindi${is.hatali.length ? `, ${is.hatali.length} mesaj SİLİNEMEDİ (${is.hata})` : ""}.`];
    if (gizlenen.length) satirlar.push("Telegram 48 saatten eski mesajları botun silmesine izin vermiyor; bunlar SOLD OUT görseliyle gizlendi, alt yazıları kaldırıldı (orijinalleri arşivde). Tamamen silmek isterseniz elle silin:", ...gizlenen.slice(0, 20).map(link), ...(gizlenen.length > 20 ? [`... ve ${gizlenen.length - 20} mesaj daha.`] : []));
    if (is.hatali.length) {
      if (/can't be deleted|cannot be deleted|too old|48/i.test(is.hata || "")) satirlar.push("Telegram bu eski mesajları botun silmesine izin vermedi; aşağıdakileri kanalda elle silebilirsiniz (kopyaları arşivde):");
      satirlar.push(...is.hatali.slice(0, 15).map(link), ...(is.hatali.length > 15 ? [`... ve ${is.hatali.length - 15} mesaj daha.`] : []));
    }
    if ((is.supheli || []).length) satirlar.push(`🔎 Fotoğrafa göre benzeyen ama emin olmadığım ${is.supheli.length} paylaşım SİLİNMEDİ — bakıp karar verin:`, ...is.supheli.slice(0, 10).map((s) => `• ${link(String(s.k).replace("~", ""))} (${s.guven}: ${s.aciklama})`));
    if (is.gorselNot) satirlar.push(`ℹ️ ${is.gorselNot}`);
    satirlar.push(`Yanlışsa: Sami'ye /geri ${kod}`);
    await telegram(env, "sendMessage", { chat_id: muratId(env), text: satirlar.join("\n"), disable_web_page_preview: true });
    return;
  }
  let metin = `🗑️ ${ad} (${is.kim}): ${is.silinen} mesaj kanaldan silindi. Bu model bir daha önerilmeyecek; paylaşım tarihleri botun kaydında duruyor.`;
  if (is.hatali.length) {
    const eskiMi = /can't be deleted|cannot be deleted|not enough rights|rights/i.test(is.hata || "");
    metin += `\n⚠️ ${is.hatali.length} mesaj silinemedi (${is.hata}).`;
    if (eskiMi) metin += `\nTelegram botların eski mesajları silmesine izin vermiyor olabilir ya da botun "Başkalarının mesajlarını sil" yetkisi kapalı. Bunları elle silebilirsiniz:`;
    metin += "\n" + is.hatali.slice(0, 15).map(link).join("\n");
    if (is.hatali.length > 15) metin += `\n... ve ${is.hatali.length - 15} mesaj daha.`;
  }
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: metin, disable_web_page_preview: true });
}

// "/geri <kod>" (Selin siteye geri koyduktan sonra "venom:kanalGeri"): arşivdeki kopyalar VOLONTE kanalına geri konur
// (Telegram eski tarihi koruyamaz; yeni paylaşım olarak görünür). Model yeniden önerilebilir hale gelir.
export async function kanalaGeriKoy(env, kod, kim, site, simdi) {
  const k = await env.KAYIT.get(`silinen:${kod}`, "json");
  const kanal = await env.KAYIT.get("kanal", "json");
  let konan = 0, hata = null, ertelendi = null;
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  for (const [a, v] of Object.entries(arsiv)) if (a === kod || v.ana === kod) delete arsiv[a];
  await env.KAYIT.put("hicgelmeyecek", JSON.stringify(arsiv)); // önce: yeni paylaşım "silindi" sanılmasın
  // 10 Kasım (Patron): eski mesajlar OLDUĞU GİBİ kopyalanmaz (eski yazı "PRICE. $", TEL gitmişti) — arşivdeki medya alınır,
  // Kemal'in kendi yazısıyla TEK ALBÜM olarak yeniden paylaşılır (09–21, 60 dk aralık kuralıyla).
  if (k && k.kopya && k.kopya.length && k.arsivKanal) {
    const medya = [];
    for (const id of k.kopya.map((x) => x.arsiv).sort((a, b) => a - b).slice(0, 10)) {
      const r = await telegram(env, "forwardMessage", { chat_id: k.arsivKanal, from_chat_id: k.arsivKanal, message_id: id, disable_notification: true }).catch(() => null);
      if (!r || !r.ok) continue;
      const m = r.result;
      await telegram(env, "deleteMessage", { chat_id: k.arsivKanal, message_id: m.message_id }).catch(() => null);
      if (m.photo) medya.push({ type: "photo", media: m.photo[m.photo.length - 1].file_id });
      else if (m.video) medya.push({ type: "video", media: m.video.file_id });
    }
    try {
      const paket = await yenidenPaket(env, kod, simdi, { medya });
      const s = await yeniKanalaPaylas(env, paket, simdi, { sayma: false, stokKontrol: false, siteVideo: false, onayliSorunlar: ["zaten paylaşıldı", ...kanalPaketSorunlari(paket)], kim: kim || "Patron (/geri)" });
      if (s.ok) { konan = s.ertelendi ? 0 : (s.ids || []).length; ertelendi = s.ertelendi ? s.saat : null; } else hata = s.hata;
    } catch (e) { hata = kisaHata(e); }
  }
  if ((konan || ertelendi) && !hata) await env.KAYIT.delete(`silinen:${kod}`);
  const soldout = ((k && k.kopya) || []).filter((x) => x.gizlendi).map((x) => (kanal.kullanici ? `https://t.me/${kanal.kullanici}/${x.kanal}` : `#${x.kanal}`));
  const siteOk = ["geri kondu", "zaten sitede"].includes(site);
  const metin0 = siteOk && !hata && (konan || ertelendi || !(k && k.kopya && k.kopya.length))
    ? `↩️ ${kodGoster(kod)} geri kondu: site ${site}; kanala ${ertelendi ? `doğru yazıyla tek albüm olarak sıraya alındı (${tarihYaz(ertelendi)} civarı)` : konan ? `doğru yazıyla tek albüm paylaşıldı (${konan} mesaj)` : "arşivde kopya yoktu"}.`
    : `⚠️ ${kodGoster(kod)} geri koyma: site ${site || "?"}; kanal ${konan} mesaj${hata ? `, hata: ${hata}` : ""}${!k ? " (arşiv kaydı yok)" : ""}.`;
  const metin = soldout.length ? `${metin0}\nKanalda SOLD OUT görselli ${soldout.length} eski paylaşım duruyor; isterseniz elle silin:\n${soldout.join("\n")}` : metin0;
  await telegram(env, "sendMessage", { chat_id: muratId(env), text: metin, disable_web_page_preview: true });
}


// ---------- 10 Kasım (Patron): KANAL DÜZELTME ----------
// KURAL: Kemal yeniden paylaşımda / geri koymada ASLA eski alt yazıyı kopyalamaz — medyayı alır, alt yazıyı her zaman kendi
// düzeniyle yazar (EN/FR, fiyatsız, marka imzalı, düğmeli). "PRICE. $" gibi rakamsız alan fiyat sayılmaz ama ESKİ TARZ yazıdır.
export const eskiYaziMi = (metin) => ESKI_YAZI.test(String(metin || ""));
const tgLinkleri = (metin) => [...String(metin || "").matchAll(/t\.me\/[A-Za-z0-9_]+\/(\d{3,7})/g)].map((m) => Number(m[1]));
export { tgLinkleri };
// Kanal mesajlarını okur (arşiv kanalına iletip bakar, iletilen kopyayı siler). Dönüş: [{ id, tarih, yazi, medya }]
export async function kanalMesajlari(env, ids) {
  const kanal = await env.KAYIT.get("kanal", "json");
  const arsiv = await env.KAYIT.get("arsiv", "json");
  if (!kanal || !arsiv) return [];
  const l = [];
  for (const id of [...new Set(ids.map(Number))].sort((a, b) => a - b).slice(0, 40)) {
    const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true }).catch((e) => ({ ok: false, description: String(e && e.message) }));
    if (!r || !r.ok) { if (env.__okumaHata) env.__okumaHata.push([id, (r && r.description) || "?"]); continue; }
    const m = r.result;
    await telegram(env, "deleteMessage", { chat_id: arsiv.id, message_id: m.message_id }).catch(() => null);
    const medya = m.photo ? { type: "photo", media: m.photo[m.photo.length - 1].file_id } : m.video ? { type: "video", media: m.video.file_id } : null;
    l.push({ id, tarih: (m.forward_origin && m.forward_origin.date) || m.forward_date || m.date, yazi: m.caption || m.text || "", medya });
  }
  return l;
}
// Mesajları paylaşımlara ayırır: yazılı mesaj yeni paylaşım başlatır; yazısız medya (albümün devamı) aynı saniyedeki önceki paylaşıma
export function paylasimlaraAyir(mesajlar) {
  const l = [];
  for (const m of mesajlar) {
    const kod = kodBul(m.yazi) || (String(m.yazi).match(/\b(\d{4,6})\b/) || [])[1] || null;
    const son = l.at(-1);
    if (!m.yazi && m.medya && son && Math.abs(son.tarih - m.tarih) <= 3 && son.ids.at(-1) === m.id - 1) { son.ids.push(m.id); son.medya.push(m.medya); continue; }
    if (/^👆/.test(m.yazi) && son && son.kod === kod) { son.ids.push(m.id); continue; } // albüm notu
    l.push({ kod, ids: [m.id], tarih: m.tarih, yazi: m.yazi, medya: m.medya ? [m.medya] : [], eski: eskiYaziMi(m.yazi) });
  }
  return l;
}
// Kodun en son paylaşımı (kod dizininden)
function sonPaylasimGrubu(kodlar, kod) {
  return [...(kodlar[kod] || [])].sort((a, b) => b.tarih - a.tarih)[0] || null;
}
async function dizindenCikar(env, kod, ids) {
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  if (!kodlar[kod]) return;
  kodlar[kod] = kodlar[kod].filter((g) => !g.ids.some((id) => ids.includes(id)));
  await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
}
async function dizineEkle(env, kod, ids, simdi) {
  if (!ids || !ids.length) return;
  if (kodsuzMu(kod)) { // kodsuz eski paylaşımın yeni kopyaları: "Sil" bunları da siler
    const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
    if (kodsuz[kod]) { kodsuz[kod].kopyalar = [...new Set([...(kodsuz[kod].kopyalar || []), ...ids])]; await env.KAYIT.put("kodsuz", JSON.stringify(kodsuz)); }
    return;
  }
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  kodEkle(kodlar, String(kod), { ids: [...ids].sort((a, b) => a - b), tarih: simdi, album: null, y: Math.min(...ids) });
  await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
}
// Yeniden paylaşım paketi: medya kanal paylaşımından (yoksa siteden), alt yazı HER ZAMAN Kemal'in kendi düzeniyle
export async function yenidenPaket(env, kod, simdi, { ids = null, medya = null, beden = null } = {}) {
  kod = String(kod);
  let md = medya || (ids && ids.length ? await kanalMedyasi(env, ids) : []);
  md = md.filter(Boolean).slice(0, 10);
  // sadece videosu olan paylaşım: onaylı ortak kare başa (eski davranış korunur)
  const kare = await env.KAYIT.get(`kare:${kod}`, "json").catch(() => null);
  if (kare && kare.durum === "onayli" && kare.url && md.length && md.every((m) => m.type === "video")) md = [{ type: "photo", media: kare.url }, ...md].slice(0, 10);
  const u = (await siteUrunleriAl(env)).find((y) => String(y.kod) === kod && !y.gizli);
  const baglam = await durumBaglami(env, [kod], simdi);
  if (u) return paketHazirla(env, u, baglam, simdi, { medya: md.length ? md : null, beden: BEDEN_GRUPLARI[beden] ? beden : null });
  if (!md.length) throw new Error("kanalda da sitede de medya yok");
  // Sitede yok: eski yazı YİNE kopyalanmaz — Kemal'in düzeninde kod + (varsa) kayıtlı açıklama + beden + marka imzası + düğmeler
  const yazi = (await env.KAYIT.get(`yazi:${kod}`, "json")) || {};
  return { marka: await modelMarkasi(env, kod).catch(() => "VOLONTE"), kod, kodsuz: kodsuzMu(kod), baslik: "", durum: null, renkler: [], renkEmin: false, renkNotu: "", kumas: yazi.kumas || null, en: yazi.en || "", fr: yazi.fr || "", bedenler: (BEDEN_GRUPLARI[beden] && BEDEN_GRUPLARI[beden].bedenler) || "", medya: md, video: 0, tgSon: baglam.tarih.son[kod] || null, kaynak: "kanal" };
}
// Sitede olmayan modelin yeni yazısında açıklama / beden olmayabilir: bu, eski yazıyı kopyalamaktan iyidir (paylaşım durmaz)
const kanalPaketSorunlari = (paket) => (paket && paket.kaynak === "kanal" ? ["beden satırı yok", "EN/FR açıklama eksik"] : []);
// Paylaşımı sil (Patron "sil" dedi — onay kartı YOK). ids yoksa kodun EN SON paylaşımı. 48 saatten eskiyse SOLD OUT ile gizlenir.
export async function paylasimSil(env, { kod = null, ids = null } = {}, simdi = Math.floor(Date.now() / 1000)) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  let hedef = (ids || []).map(Number).filter((x) => x > 0);
  let tarih = null;
  if (hedef.length) { // link verildiyse: o mesajın paylaşım grubu (dizinde varsa) ya da kanala bakarak albümü
    const g = Object.values(kodlar).flat().find((x) => x.ids.some((id) => hedef.includes(id)));
    if (g) { hedef = [...new Set([...hedef, ...g.ids])]; tarih = g.tarih; }
    else {
      const bak = paylasimlaraAyir(await kanalMesajlari(env, [...hedef, ...hedef.flatMap((id) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => id + d))]));
      const secilen = bak.filter((p) => p.ids.some((id) => hedef.includes(id)));
      if (secilen.length) { hedef = [...new Set(secilen.flatMap((p) => p.ids))]; tarih = secilen[0].tarih; kod = kod || secilen[0].kod; }
    }
  } else if (kod) {
    const g = sonPaylasimGrubu(kodlar, String(kod));
    if (!g) return { ok: false, hata: `${kod}: kanalda kayıtlı paylaşım yok` };
    hedef = g.ids; tarih = g.tarih;
  }
  if (!hedef.length) return { ok: false, hata: "silinecek paylaşım bulunamadı" };
  const silinen = [], gizlenen = [], olmadi = [];
  for (const id of hedef.sort((a, b) => a - b)) {
    const r = await telegram(env, "deleteMessage", { chat_id: kanal.id, message_id: id }).catch(() => null);
    if (r && r.ok) { silinen.push(id); continue; }
    const g2 = await soldoutIleGizle(env, kanal.id, id).catch(() => null);
    if (g2 && g2.ok) gizlenen.push(id); else olmadi.push(id);
  }
  if (kod) await dizindenCikar(env, String(kod), hedef);
  await defterIs(env, "kemal", `kanal paylaşımı silindi (Patron): ${silinen.length} mesaj${gizlenen.length ? `, ${gizlenen.length} SOLD OUT` : ""}`, { kod }).catch(() => null);
  const link = (id) => (kanal.kullanici ? `t.me/${kanal.kullanici}/${id}` : `#${id}`);
  return { ok: !olmadi.length, kod, silinen, gizlenen, olmadi, tarih, link: link(hedef[0]), ozet: `${kod || "paylaşım"} (${link(hedef[0])}${hedef.length > 1 ? ` +${hedef.length - 1} mesaj` : ""}${tarih ? `, ${tarihYaz(tarih)}` : ""})` };
}
// Paylaşımı düzelt: aynı medya, DOĞRU yazı. 48 saatten yeniyse sil + tek albüm olarak yeniden paylaş (09–21, 60 dk aralık);
// eskiyse (Telegram silmeye izin vermez) alt yazıyı yerinde düzenle. Onay kartı yok; sonuç Venom'un akşam özetine tek satır.
export async function paylasimDuzelt(env, { kod, ids = null, yerinde = null, kim = "Patron" }, simdi = Math.floor(Date.now() / 1000)) {
  kod = String(kod);
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  let hedef = (ids || []).map(Number).filter((x) => x > 0);
  if (!hedef.length) { const g = sonPaylasimGrubu((await env.KAYIT.get("kodlar", "json")) || {}, kod); if (g) hedef = g.ids; }
  if (!hedef.length) return { ok: false, hata: `${kod}: kanalda paylaşım bulunamadı` };
  const mesajlar = await kanalMesajlari(env, hedef);
  const medya = mesajlar.map((m) => m.medya).filter(Boolean);
  const eskiMi = yerinde != null ? yerinde : mesajlar.length && simdi - Math.min(...mesajlar.map((m) => m.tarih)) > 46 * 3600;
  const paket = await yenidenPaket(env, kod, simdi, { medya });
  if (eskiMi) { // yerinde: yazılı mesajın alt yazısı Kemal'in düzeniyle değişir (medya ve tarih aynı kalır)
    const yazili = mesajlar.filter((m) => m.yazi && m.medya);
    let n = 0;
    for (const m of yazili.length ? yazili : mesajlar.filter((x) => x.medya).slice(0, 1)) {
      const r = await telegram(env, "editMessageCaption", { chat_id: kanal.id, message_id: m.id, caption: altYazi(paket).slice(0, 1024), parse_mode: "HTML", reply_markup: dugmeler() }).catch(() => null);
      if (r && r.ok) n++;
    }
    await dizineEkle(env, kod, hedef, Math.min(...mesajlar.map((m) => m.tarih)));
    await defterIs(env, "kemal", `kanal yazısı düzeltildi (yerinde, ${n} mesaj)`, { kod }).catch(() => null);
    return { ok: n > 0, yerinde: true, kod, duzeltilen: n, hata: n ? null : "alt yazı düzenlenemedi" };
  }
  if (!medya.length) return { ok: false, hata: `${kod}: paylaşımda fotoğraf/video okunamadı — silinmedi` };
  const sil = await paylasimSil(env, { kod, ids: hedef }, simdi);
  const s = await yeniKanalaPaylas(env, { ...paket, medya: paket.medya && paket.medya.length ? paket.medya : medya }, simdi, { sayma: false, stokKontrol: false, siteVideo: false, onayliSorunlar: ["zaten paylaşıldı", ...kanalPaketSorunlari(paket)], kim });
  return { ok: Boolean(s.ok), kod, silinen: sil.silinen, gizlenen: sil.gizlenen, yeni: s.ids || null, ertelendi: Boolean(s.ertelendi), saat: s.saat || null, link: s.link || null, hata: s.ok ? null : s.hata };
}
// Bir kerelik (Claude Code / Venom): KV "kemal:kanalDuzelt" = { araliklar: [[bas, son]], kodlar?: [..], ids?: {kod: [..]}, uygula: bool, eskiYazi: bool }
//  → kanal okunur; hedef paylaşımlar (verilen kodlar ya da eski tarz yazılılar) listelenir; uygula ise düzeltilir. Sonuç "kemal:kanalDuzeltSonuc".
export async function kanalDuzeltAdimi(env, simdi) {
  const is = await env.KAYIT.get("kemal:kanalDuzelt", "json").catch(() => null);
  if (!is) return false;
  await env.KAYIT.delete("kemal:kanalDuzelt");
  const tumIdler = (is.araliklar || []).flatMap(([a, b]) => Array.from({ length: Math.max(0, Math.min(800, b - a + 1)) }, (_, i) => a + i));
  const ids = tumIdler.slice(0, 40); // çalışma başına 40 mesaj (istek sınırı); kalanı sonraki çalışmada (tarama)
  env.__okumaHata = [];
  let paylasimlar = paylasimlaraAyir(await kanalMesajlari(env, ids));
  if (is.tara) { // uzun tarama: sonuçlar birikir, bitince tek sonuç
    const bir = (await env.KAYIT.get("kemal:kanalTaraBirikim", "json").catch(() => null)) || [];
    const yeni = [...bir, ...paylasimlar.map((p) => ({ kod: p.kod, ids: p.ids, tarih: p.tarih, eski: p.eski, medya: p.medya.length, yazi: String(p.yazi).slice(0, 80) }))];
    if (tumIdler.length > 40) {
      await env.KAYIT.put("kemal:kanalTaraBirikim", JSON.stringify(yeni), { expirationTtl: 86400 });
      await env.KAYIT.put("kemal:kanalDuzelt", JSON.stringify({ ...is, araliklar: [[tumIdler[40], tumIdler.at(-1)]] }));
      return true;
    }
    await env.KAYIT.delete("kemal:kanalTaraBirikim").catch(() => null);
    await env.KAYIT.put("kemal:kanalTaraSonuc", JSON.stringify({ zaman: simdi, eski: yeni.filter((p) => p.eski), toplam: yeni.length }), { expirationTtl: 7 * 86400 });
    return true;
  }
  const hedef = paylasimlar.filter((p) => (is.kodlar && is.kodlar.includes(p.kod)) || (is.eskiYazi && p.eski));
  const sonuc = { zaman: simdi, okunan: paylasimlar.map((p) => ({ kod: p.kod, ids: p.ids, tarih: p.tarih, eski: p.eski, medya: p.medya.length, yazi: String(p.yazi).slice(0, 80) })), okunamayan: (env.__okumaHata || []).filter(([, h]) => !/not found|to forward/i.test(h)).slice(0, 20), yok: (env.__okumaHata || []).filter(([, h]) => /not found|to forward/i.test(h)).map(([id]) => id), duzeltilen: [] };
  if (is.uygula) {
    const kodBasi = {};
    for (const p of hedef) (kodBasi[p.kod] = kodBasi[p.kod] || []).push(p);
    for (const [kod, l] of Object.entries(kodBasi)) {
      if (!kod || kod === "null") continue;
      // aynı modelin bütün hatalı paylaşımları tek albümde (en fazla 10 medya)
      const tumIds = l.flatMap((p) => p.ids);
      const r = await paylasimDuzelt(env, { kod, ids: tumIds, kim: is.kim || "Patron (kanal düzeltme)" }, simdi).catch((e) => ({ ok: false, hata: String(e && e.message).slice(0, 200) }));
      sonuc.duzeltilen.push({ kod, ids: tumIds, ...r });
    }
    const satir = sonuc.duzeltilen.map((x) => `${x.kod}: ${x.ok ? `${(x.silinen || []).length} eski mesaj silindi, doğru yazıyla ${x.ertelendi ? `sıraya alındı (${tarihYaz(x.saat)} civarı)` : "tek albüm paylaşıldı"}` : `olmadı (${x.hata})`}`);
    if (satir.length) await kuyrugaEkle(env, "sonuc", { id: `kdz-${simdi}`, ok: sonuc.duzeltilen.every((x) => x.ok), aciklama: `🧹 Kanal düzeltme (eski yazı): ${satir.join(" · ")}` }).catch(() => null);
  }
  await env.KAYIT.put("kemal:kanalDuzeltSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  return true;
}

async function silmeDevam(env) {
  const { keys } = await env.KAYIT.list({ prefix: "silinecek:" });
  if (!keys.length) return false;
  await silmeAdimi(env, keys[0].name.slice("silinecek:".length));
  return true;
}

async function siradakiniPaylas(env, simdi) {
  if (await durdurulduMu(env, "kemal")) return; // 6 Kasım: durdurulduysa sıradaki bekler (silinmez)
  const sonraki = Number((await env.KAYIT.get("sonraki")) || 0);
  if (simdi < sonraki) return;
  const liste = await kuyrukListesi(env);
  if (!liste.length || !(await kesinKapi(env, simdi)).acik) return; // 13 Kasım: saat / günde 12 / 60 dk — sıradaki bekler (silinmez)
  const oncelik = liste.find((x) => x.sinirsiz); // gece onaylanan / ertelenen önce çıkar (günlük 12'ye sayılır)
  const oge = oncelik || liste[0];
  if (!oge) return;

  // Önce sıradan çıkar: görev üst üste çalışırsa aynı model iki kez paylaşılmasın.
  await env.KAYIT.delete(`kuyruk:${oge.kod}`);
  const [en, ek] = oge.tur ? ARALIK_DK : ESKI_ARALIK_DK;
  const aralik = (en + Math.floor(Math.random() * (ek - en + 1))) * 60;
  await env.KAYIT.put("sonraki", String(simdi + aralik));

  const sonuc = oge.yeni ? await yeniKanalaPaylas(env, oge.paket, simdi, { ...(oge.secenek || {}), zamanli: true }) : await kanaldaPaylas(env, oge.kod, oge.ids, simdi, oge.beden, { zamanli: true });
  if (!sonuc.ok && sonuc.stoksuz) await env.KAYIT.delete("sonraki"); // paylaşılmadı: sıradaki beklemesin
  const ad = kodGoster(oge.kod);
  const metin = sonuc.ok
    ? `✅ ${ad} kanalda paylaşıldı (${oge.kim} onaylamıştı).${sonuc.markaNotu ? ` ⚠️ ${sonuc.markaNotu}.` : ""}${sonuc.link ? "\n" + sonuc.link : ""}`
    : `⚠️ ${ad} paylaşılamadı: ${sonuc.hata}`;
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: metin, disable_web_page_preview: true });
  return true;
}

async function kuyrukGoster(sohbet, env) {
  const simdi = Math.floor(Date.now() / 1000);
  const kuyruk = await kuyrukListesi(env);
  const kalan = Math.max(0, GUNLUK_SINIR - (await bugunSayac(env, simdi)));
  if (!kuyruk.length) {
    const tur = await env.KAYIT.get("tur", "json");
    const turSatiri = tur && tur.durum === "toplaniyor" ? ` Bugünün turunda ${Object.values(tur.ogeler).filter((o) => !o.karar).length} model cevap bekliyor.` : "";
    return telegram(env, "sendMessage", { chat_id: sohbet, text: `Sırada bekleyen paylaşım yok.${turSatiri} Bugün kalan paylaşım hakkı: ${kalan}/${GUNLUK_SINIR}.` });
  }
  // Tahmini saat: aralığın ortası, pencere ve günlük sınırla.
  let t = Math.max(simdi, Number((await env.KAYIT.get("sonraki")) || 0));
  let hak = kalan;
  const satirlar = kuyruk.map((o, i) => {
    let s = saat(t);
    if (hak <= 0 || s >= YAYIN_BIT || s < YAYIN_BAS) {
      t = sabahBaslangici(t, s >= YAYIN_BAS);
      hak = GUNLUK_SINIR;
    }
    const satir = `${i + 1}) ${kodGoster(o.kod)}${kodsuzMu(o.kod) ? ` (${tarihUzun(o.tarih)} tarihli)` : ""} — tahmini ${tarihYaz(t)} (${o.kim} onayladı)`;
    t += (o.tur ? (ARALIK_DK[0] + ARALIK_DK[1]) / 2 : 75) * 60;
    hak -= 1;
    return satir;
  });
  const tur = await env.KAYIT.get("tur", "json");
  const turSatiri = tur && tur.durum === "toplaniyor" ? `Bugünün turunda ${Object.values(tur.ogeler).filter((o) => !o.karar).length} model cevap bekliyor. ${AKSAM_SAATI}:00'e kadar paylaşılamayan sıradan çıkar.\n` : "";
  return telegram(env, "sendMessage", {
    chat_id: sohbet,
    text: `${turSatiri}Sıradaki paylaşımlar (bugün kalan hak: ${kalan}/${GUNLUK_SINIR}):\n\n${satirlar.join("\n")}\n\nİptal etmek için düğmeye basın:`,
    reply_markup: { inline_keyboard: kuyruk.map((o, i) => [{ text: `❌ ${i + 1}) ${kodGoster(o.kod)} iptal`, callback_data: `kq:${o.kod}` }]) },
  });
}

function sabahBaslangici(t, yarin) {
  const yerel = t + SAAT_FARKI;
  const gunBasi = yerel - (yerel % 86400) + (yarin ? 86400 : 0);
  return gunBasi + YAYIN_BAS * 3600 - SAAT_FARKI;
}
// ---------- 9 Kasım (Patron): REPETE RAPORU — pazartesi/çarşamba/cuma 11:00, TEK rapor (fotoğraflı albüm + düğmeli liste) ----------
const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
async function repeteVerisi(env, simdi) {
  const veri = await stokIste(env, "/repete-veri", { bas14: gunA(simdi - 13 * 86400), bas7: gunA(simdi - 6 * 86400), bitis: gunA(simdi), basKarar: gunA(simdi - 40 * 86400) });
  const magaza = {};
  for (const r of veri.urun || []) (magaza[r.kod] = magaza[r.kod] || new Set()).add(r.magaza);
  const markalar = {};
  for (const [kod, m] of Object.entries(magaza)) { const k = await markaKarari(env, kod).catch(() => null); if (k) markalar[kod] = k; else if (m.size === 1) markalar[kod] = [...m][0]; }
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const ids = {}, hepsi = [];
  for (const [kod, l] of Object.entries(kodlar)) { const x = (l || []).filter((g) => simdi - g.tarih < 14 * 86400).flatMap((g) => g.ids || []); if (x.length) { ids[kod] = x; hepsi.push(...x); } }
  const t = hepsi.length ? await tepkileriOku(env, hepsi.slice(0, 1500)).catch(() => ({})) : {};
  const tepki = Object.fromEntries(Object.entries(ids).map(([kod, l]) => [kod, l.reduce((a, id) => a + (Number(t[id]) || 0), 0)]));
  const site = await siteUrunleriAl(env).catch(() => []);
  const defne = await env.KAYIT.get("defne:istenenYok", "json").catch(() => null); // Defne kurulunca: { kod: istenme sayısı }
  return { h: repeteHesapla(veri, { markalar, tepki, simdi, defne, siteKodlar: new Set(site.filter((u) => !u.gizli).map((u) => String(u.kod))) }), site, defne };
}
// Sitedeki ön fotoğrafa "MARKA · kod" basılır (Kemal'in marka etiketi; ücretsiz Cloudflare Images)
async function markaliOnFoto(env, site, x) {
  const u = site.find((y) => String(y.kod) === String(x.kod));
  const ilk = u && siteMedyasi(u).find((m) => m.type === "photo");
  if (!ilk) return null;
  const r = await fetch(ilk.media).catch(() => null);
  if (!r || !r.ok) return null;
  const bayt = new Uint8Array(await r.arrayBuffer());
  return env.IMAGES ? markaBas(env, bayt, 1080, x.kod, x.marka === "BLACKROSE" ? "BLACKROSE" : "VOLONTE").catch(() => bayt) : bayt;
}
async function fotoAlbumu(env, hedef, site, modeller) {
  const form = new FormData(), medya = [];
  for (const [i, x] of modeller.slice(0, 10).entries()) {
    const f = await markaliOnFoto(env, site, x).catch(() => null);
    if (!f) continue;
    form.append(`p${i}`, new Blob([f], { type: "image/jpeg" }), `p${i}.jpg`);
    medya.push({ type: "photo", media: `attach://p${i}`, caption: `${i + 1} · ${x.kod}` });
  }
  if (!medya.length) return null;
  form.append("chat_id", String(hedef));
  if (medya.length === 1) { form.append("photo", form.get("p0") || form.get(medya[0].media.slice(9))); form.append("caption", medya[0].caption); return telegramForm(env, "sendPhoto", form); }
  form.append("media", JSON.stringify(medya));
  return telegramForm(env, "sendMediaGroup", form);
}
export async function repeteRaporuGonder(env, simdi) {
  const hedef = muratId(env);
  const { h, site, defne } = await repeteVerisi(env, simdi);
  const r = repeteMetni(h, { simdi, defneVar: Boolean(defne) });
  await env.KAYIT.put("kemal:repeteSon", JSON.stringify({ zaman: simdi, modeller: r.modeller.map((x) => ({ kod: x.kod, marka: x.marka, s14: x.s14, stok: x.stok, fabrika: x.fabrika })), gelecek: h.gelecek }), { expirationTtl: 14 * 86400 });
  await fotoAlbumu(env, hedef, site, r.modeller).catch(() => null);
  await telegram(env, "sendMessage", { chat_id: hedef, text: r.metin, disable_web_page_preview: true, ...(r.klavye.length ? { reply_markup: { inline_keyboard: r.klavye } } : {}) });
  return { modeller: r.modeller.length, acil: h.acil.length };
}
// Hızlı satan model 3 günden az stoğa düşerse raporu beklemeden TEK acil kart (fotoğraflı), 3 günde bir
async function repeteAcilKontrol(env, simdi) {
  const { h, site } = await repeteVerisi(env, simdi);
  for (const x of h.acil.slice(0, 2)) {
    const k = `kemal:repeteAcil:${x.kod}`;
    if (await env.KAYIT.get(k)) continue;
    await env.KAYIT.put(k, "1", { expirationTtl: 3 * 86400 });
    const metin = `⚡ ACİL REPETE — ${x.kod} ${x.marka === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"}: ~${Math.max(1, Math.round(x.bitisGun))} günde biter (stok ${x.stok}, 14g ${x.s14}, 7g ${x.s7}).\n${x.fabrika ? `Fabrika: ${x.fabrika.durum}${x.fabrika.hazirGun ? `, ${x.fabrika.hazirGun} hazır` : ""}` : "Fabrikada açık sipariş yok."}`;
    const kl = { inline_keyboard: [[{ text: "🔁 Repete al", callback_data: `rr:r:${x.kod}` }, { text: "⏳ Bekle", callback_data: `rr:b:${x.kod}` }, { text: "❌ Alma", callback_data: `rr:x:${x.kod}` }]] };
    const foto = await markaliOnFoto(env, site, x).catch(() => null);
    const son = JSON.parse((await env.KAYIT.get("kemal:repeteSon")) || "{\"modeller\":[]}");
    await env.KAYIT.put("kemal:repeteSon", JSON.stringify({ ...son, modeller: [...son.modeller.filter((y) => y.kod !== x.kod), { kod: x.kod, marka: x.marka, s14: x.s14, stok: x.stok, fabrika: x.fabrika }] }), { expirationTtl: 14 * 86400 });
    if (foto) { const f = new FormData(); f.append("chat_id", String(muratId(env))); f.append("photo", new Blob([foto], { type: "image/jpeg" }), "acil.jpg"); f.append("caption", metin.slice(0, 1000)); f.append("reply_markup", JSON.stringify(kl)); await telegramForm(env, "sendPhoto", f); }
    else await telegram(env, "sendMessage", { chat_id: muratId(env), text: metin, reply_markup: kl });
  }
}
export async function repeteIsleri(env, simdi) {
  if (!env.STOK) return;
  if (await env.KAYIT.get("venom:repeteDeneme")) { // tek seferlik (Claude Code): rapor hesaplanır, GÖNDERİLMEZ → KV venom:repeteDenemeSonuc
    await env.KAYIT.delete("venom:repeteDeneme");
    const { h, defne } = await repeteVerisi(env, simdi);
    const r = repeteMetni(h, { simdi, defneVar: Boolean(defne) });
    await env.KAYIT.put("venom:repeteDenemeSonuc", JSON.stringify({ zaman: simdi, metin: r.metin, dugme: r.klavye.length, acil: h.acil.map((x) => x.kod) }), { expirationTtl: 86400 });
  }
  if (!haftaIci(simdi)) return;
  const gun = new Date((simdi + SAAT_FARKI) * 1000).getUTCDay(), s = saat(simdi);
  if ([1, 3, 5].includes(gun) && s >= 11 && s < 12 && !(await env.KAYIT.get(`kemal:repeteRapor:${gunA(simdi)}`))) {
    await env.KAYIT.put(`kemal:repeteRapor:${gunA(simdi)}`, "1", { expirationTtl: 3 * 86400 });
    if (await kagitAcik(env, "kemal", "repeteRaporu")) return repeteRaporuGonder(env, simdi);
    return;
  }
  if (magazaAcik(simdi) && new Date(simdi * 1000).getUTCMinutes() < 5 && s >= 10 && (await kagitAcik(env, "kemal", "repeteAcil"))) return repeteAcilKontrol(env, simdi);
}
// Düğmeler: r = repete al (Fuat'a sipariş taslağı Patron onayına), b = bekle (7 gün), x = alma (30 gün), h = Fuat'a hatırlat
async function repeteRaporDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!kimlikler(env.MURAT_ID).includes(String(cq.from.id))) return cevapla("Repete kararı Patron'da.");
  const [, islem, kod] = String(cq.data).split(":");
  const simdi = Math.floor(Date.now() / 1000);
  const son = JSON.parse((await env.KAYIT.get("kemal:repeteSon")) || "{}");
  const x = (son.modeller || []).find((y) => y.kod === kod) || { kod, s14: 0, fabrika: ((son.gelecek || []).find((y) => y.kod === kod)) || null };
  if (islem !== "h") await stokIste(env, "/repete-karar", { kod, karar: islem, zaman: simdi, kim: kisiAdi(cq.from), stok: x.stok ?? null, satis14: x.s14 ?? null });
  if (islem === "r" || islem === "h") {
    const l = (await env.KAYIT.get("venom:repeteTaslak", "json")) || [];
    await env.KAYIT.put("venom:repeteTaslak", JSON.stringify([...l, { kod, metin: islem === "r" ? siparisTaslagi(x) : hatirlatmaTaslagi(x.fabrika || { kod, gonderim: simdi }), zaman: simdi }]));
    return cevapla(islem === "r" ? "Fuat'a sipariş taslağı onayınıza geliyor" : "Fuat'a hatırlatma taslağı onayınıza geliyor");
  }
  return cevapla(islem === "b" ? `${kod}: bekle — 7 gün sormam` : `${kod}: alma — 30 gün sormam`);
}

// ---------- 9 Kasım (Patron): Venom KISA MODEL KARTI için fotoğraf ve (onaylı, ücretli) fotoğraftan tanıma ----------
// Fotoğraf: sitedeki ön fotoğraf; yoksa kanaldaki son paylaşımın fotoğrafı (arşive iletilip indirilir); üstüne "MARKA · kod"
export async function venomModelFoto(env, kod) {
  const marka = await modelMarkasi(env, String(kod)).catch(() => "VOLONTE");
  const site = await siteUrunleriAl(env).catch(() => []);
  const sitedeki = await markaliOnFoto(env, site, { kod: String(kod), marka }).catch(() => null);
  if (sitedeki) return { ok: true, kaynak: "site", bayt: sitedeki, marka };
  const kanal = await env.KAYIT.get("kanal", "json"), arsiv = await env.KAYIT.get("arsiv", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {}, kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  if (kanal && arsiv) {
    const tg = (m, g) => telegram(env, m, g);
    // 9 Kasım: SOLD OUT görseli (gizlenmiş eski paylaşım) ASLA model fotoğrafı sayılmaz
    let soldout = await env.KAYIT.get("kemal:soldout:uid");
    if (!soldout) { const fid = await env.KAYIT.get("kemal:soldout:fileId"); const g = fid ? await tg("getFile", { file_id: fid }).catch(() => null) : null; soldout = (g && g.ok && g.result.file_unique_id) || ""; if (soldout) await env.KAYIT.put("kemal:soldout:uid", soldout); }
    // Önce kanaldaki paylaşımlar, sonra gizlenen/silinen paylaşımların arşivdeki ORİJİNALLERİ
    const sil = (await env.KAYIT.get(`silinen:${kod}`, "json").catch(() => null)) || null;
    const kaynaklar = [...modelSecenekleri(String(kod), kodlar, kodsuz).slice(0, 3).flatMap((sec) => (sec.ids || []).slice(0, 4).map((id) => [kanal.id, id])),
      ...(sil && sil.arsivKanal ? (sil.kopya || []).slice(-6).map((x) => [sil.arsivKanal.id || sil.arsivKanal, x.arsiv]) : [])];
    for (const [kaynak, id] of kaynaklar.slice(0, 14)) {
      {
        const r = await tg("forwardMessage", { chat_id: arsiv.id, from_chat_id: kaynak, message_id: id, disable_notification: true }).catch(() => null);
        if (!r || !r.ok) continue;
        await tg("deleteMessage", { chat_id: arsiv.id, message_id: r.result.message_id }).catch(() => null);
        const p = r.result.photo && r.result.photo[r.result.photo.length - 1];
        if (!p || (soldout && p.file_unique_id === soldout)) continue;
        const bayt = await dosyaBaytIndir(env, tg, p.file_id).catch(() => null);
        if (!bayt) continue;
        const damgali = env.IMAGES ? await markaBas(env, bayt, p.width || 1080, String(kod), marka).catch(() => bayt) : bayt;
        return { ok: true, kaynak: "kanal", bayt: damgali, marka };
      }
    }
  }
  return { ok: false, marka };
}
// Ücretli tanıma (Patron maliyetini görüp onayladıktan sonra Venom çağırır): en fazla 3 aday + güven. Stok SÖYLENMEZ.
export async function venomFotoTani(env, b64, ipucu = "") {
  const simdi = Math.floor(Date.now() / 1000);
  if (!env.ANTHROPIC_API_KEY) return { ok: false, hata: "yapay zekâ bağlı değil" };
  if (await sinirAsildiMi(env, simdi)) return { ok: false, hata: "aylık yapay zekâ sınırı doldu" };
  const tarifler = (await env.KAYIT.get("tarifler", "json")) || {};
  const silinen = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  const katalog = Object.entries(tarifler).filter(([k, v]) => !silinen[k] && !/kıyafet yok/i.test(v.t) && !kodsuzMu(k));
  if (!katalog.length) return { ok: false, hata: "fotoğraf kataloğu hazır değil" };
  const tg = (m, g) => telegram(env, m, g);
  const secilen = (await adaySec(env, b64, katalog.map(([k, v]) => `${k} | ${v.t}`), ipucu)).filter((k) => tarifler[k]);
  if (!secilen.length) return { ok: true, adaylar: [], guven: "dusuk", aciklama: "katalogda benzeyen model yok" };
  const adaylar = [];
  for (const k of secilen.slice(0, TANIMA_ADAY)) { try { adaylar.push({ kimlik: k, b64: await dosyaIndir(env, tg, tarifler[k].f) }); } catch { /* atla */ } }
  const s2 = await karsilastir(env, b64, adaylar, ipucu);
  const gecerli = [...new Set([s2.en_iyi, ...(s2.siralama || []), ...secilen].filter((k) => k && tarifler[k]))];
  return { ok: true, en_iyi: s2.en_iyi || null, guven: s2.guven, adaylar: gecerli.slice(0, 3), aciklama: String(s2.aciklama || "").slice(0, 200) };
}

// ---------- 9 Kasım (Patron): Venom "Kemal, şu an ne durumda?" — canlı özet (tur, kuyruk, bugünkü paylaşım) ----------
export async function kemalOzet(env, simdi) {
  const tur = await env.KAYIT.get("tur", "json").catch(() => null);
  const og = tur && tur.ogeler ? Object.entries(tur.ogeler) : [];
  const cevap = og.filter(([, o]) => o.karar);
  const say = {}; for (const [, o] of cevap) say[o.karar] = (say[o.karar] || 0) + 1;
  const ad = { y1: "paylaş", yd: "düzelt", yg: "geç", yb: "beklesin" };
  const kuyruk = await kuyrukListesi(env).catch(() => []);
  const bekleyen = og.filter(([, o]) => !o.karar && o.paket).map(([k]) => k);
  return {
    tur: tur ? { no: tur.no, gun: turGunu(tur), soruldu: og.length, cevaplandi: cevap.length, kararlar: Object.fromEntries(Object.entries(say).map(([k, n]) => [ad[k] || k, n])), bekleyen,
      hedef: GUNLUK_SINIR, onay: (tur.onaylar || []).length, gec: say.yg || 0, ek: (tur.dalgalar || []).reduce((a, d) => a + d.kodlar.length, 0),
      modeller: og.map(([kod, o]) => ({ kod, karar: ad[o.karar] || null, kim: o.kim || null, tgSon: (o.paket && o.paket.tgSon) || null, ek: Boolean(o.dalga) })) } : null,
    kuyruk: kuyruk.map((o) => o.kod), bugunPaylasim: await bugunSayac(env, simdi).catch(() => 0),
    // kanala bugün giden model sayısı (sınır dışı ertelenenler dahil): son paylaşım tarihi bugün olanlar
    bugunKanal: Object.values((await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {}).filter((t) => gunAnahtari(Number(t)) === gunAnahtari(simdi)).length,
    // 13 Kasım (iş bekçisi): son paylaşımın zamanı + öneri havuzu tükendi mi
    sonPaylasim: Math.max(0, ...Object.values((await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {}).map(Number).filter(Boolean)),
    tukendi: Boolean(tur && tur.tukendi),
  };
}

// 9 Kasım: YAYIN KAPISI — şu an kanala paylaşılabilir mi? (09–21 arası, son paylaşımdan ≥ 60 dk, sıradaki zamanı gelmiş)
export async function yayinKapisi(env, simdi) {
  if (env.YAYIN_KAPISI === "0") return { acik: true, sonraki: simdi }; // sadece testler (gerçek saatten bağımsız)
  const s = saat(simdi);
  const son = Math.max(0, ...Object.values((await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {}).map(Number).filter(Boolean));
  const sonraki = Number((await env.KAYIT.get("sonraki").catch(() => 0)) || 0);
  const acik = s >= YAYIN_BAS && s < YAYIN_BIT && simdi - son >= YAYIN_ARA_DK * 60 && simdi >= sonraki;
  let t = Math.max(simdi, son + YAYIN_ARA_DK * 60, sonraki);
  if (saat(t) >= YAYIN_BIT || saat(t) < YAYIN_BAS) t = sabahBaslangici(t, saat(t) >= YAYIN_BAS);
  return { acik, sonraki: t };
}
// 13 Kasım (Patron, kural 52–53): KESİN KAPI — kanala giden HER paylaşımın (tur, repete, yeni model, ertelenen, Pelin videosu;
// sıradan gelen dahil) son kontrolü: saat 09:00–21:00, bugün kanala çıkan model < 12, son paylaşımdan ≥ 60 dk. Hiçbir yol atlayamaz.
export async function kesinKapi(env, simdi) {
  if ((await bugunSayac(env, simdi)) >= GUNLUK_SINIR) return { acik: false, neden: "sinir" };
  if (env.YAYIN_KAPISI === "0") return { acik: true, neden: null }; // sadece testler: saat ve ara gerçek saatten bağımsız
  const s = saat(simdi);
  if (s < YAYIN_BAS || s >= YAYIN_BIT) return { acik: false, neden: "saat" };
  const sp = Object.values((await env.KAYIT.get("sonpaylasim", "json").catch(() => null)) || {}).map(Number).filter(Boolean);
  if (simdi - Math.max(0, ...sp) < YAYIN_ARA_DK * 60) return { acik: false, neden: "ara" };
  return { acik: true, neden: null };
}
// Kapı kapalıyken onaylanan paylaşım sıraya girer (öncelikli); 09:00'dan itibaren aralıklı gider (günlük 12 sınırına sayılır)
async function yayiniErtele(env, oge, simdi) {
  await env.KAYIT.put(`kuyruk:${oge.kod}`, JSON.stringify({ ...oge, tur: true, zaman: simdi, ertelendi: true, sinirsiz: true }));
  const k = await yayinKapisi(env, simdi);
  await defterIs(env, "kemal", `kanal kuyruğuna alındı (${tarihYaz(k.sonraki)} civarı gider)`, { kod: oge.kod });
  await defterSatir(env, "kemal", { id: `kemal:kanal:${oge.kod}`, tur: "kanal", kod: String(oge.kod), ne: "Kanal paylaşımı (onaylandı, sırada)", kim: "Kemal", durum: "beklemede", bot: "kemal", acildi: simdi, guncel: simdi, kanit: `${tarihYaz(k.sonraki)} civarı kanala gider` }); // 12 Kasım: TEK DEFTER
  return { ok: true, ertelendi: true, saat: k.sonraki, hata: null };
}
export const ertelemeMetni = (p, kod) => `⏳ ${kod}: onaylandı, kuyruğa alındı — kanala ${tarihYaz(p.saat)} civarı gider (paylaşımlar 09:00–21:00, en az ${YAYIN_ARA_DK} dk arayla).`;

async function kuyrukIptal(cq, env) {
  const kod = cq.data.slice(3);
  const oge = await env.KAYIT.get(`kuyruk:${kod}`, "json");
  const ad = kodGoster(kod);
  if (!oge) return telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${ad} sırada değil (paylaşılmış ya da iptal edilmiş olabilir).` });
  await env.KAYIT.delete(`kuyruk:${kod}`);
  await telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "İptal edildi" });
  return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `❌ ${ad} sıradan çıkarıldı (${kisiAdi(cq.from)}). Kanala paylaşılmayacak; kanalda hiçbir şey silinmedi.` });
}

// Pelin (volonte-pelin) için: modelin kanaldaki en yeni VİDEOSU (yazısız, sadece dosya). Anahtar "pelinvideo:<t>" Pelin'in
// yazdığı ortak kayıt; bulunan dosya kimliği aynı kayda yazılır (arşive her seferinde iletilmesin). Telegram sınırı 20 MB.
export async function kanalVideo(env, t, aralik = null) {
  const k = await env.KAYIT.get(`pelinvideo:${t}`, "json");
  if (!k) return new Response("yok", { status: 404 });
  if (!k.file_id) {
    const kanal = await env.KAYIT.get("kanal", "json");
    const arsiv = await env.KAYIT.get("arsiv", "json");
    if (!kanal || !arsiv) return new Response("yok", { status: 404 });
    let deneme = 0;
    for (const sec of modelSecenekleri(k.kod, (await env.KAYIT.get("kodlar", "json")) || {}, {})) {
      for (const id of sec.ids) {
        if (deneme++ >= 12 || k.file_id) break;
        const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true });
        if (r.ok && r.result.video) k.file_id = r.result.video.file_id;
      }
      if (k.file_id) break;
    }
    if (!k.file_id) return new Response("video yok", { status: 404 });
    await env.KAYIT.put(`pelinvideo:${t}`, JSON.stringify(k), { expirationTtl: 14 * 86400 });
  }
  const f = await telegram(env, "getFile", { file_id: k.file_id });
  if (!f.ok) return new Response(`dosya alınamadı: ${f.description || ""}`, { status: 404 });
  const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`, aralik ? { headers: { Range: aralik } } : {});
  const baslik = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  for (const h of ["content-length", "content-range"]) if (r.headers.get(h)) baslik[h] = r.headers.get(h);
  return new Response(r.body, { status: r.status, headers: baslik });
}

// ---------- YENİ KANAL DÜZENİ (duzen.js, kullanıcı kararı 29 Ekim) ----------
// Günlük modeller Sami'nin stoğundan (stokta + sitede + ≥7 gün paylaşılmamış), medya siteden, alt yazı yeni düzende,
// fiyat YOK. Önizleme Murat'a ve Hemra'ya: ✅ Paylaş / ✏️ Düzelt / ❌ Geç. Onaylanan sıraya girer (08–20, 50–60 dk arayla,
// günde en fazla 10; akşam onaylananlar ertesi güne kalır, stoğu biterse paylaşılmaz). Eski paylaşımlara dokunulmaz.

// 9 Kasım (Patron): günlük "Paylaş / Düzelt / Geç" kartları da SADECE Merdan ve Hemra'ya (önceden Murat + Hemra'ydı)
const onizleyenler = (env) => yeniModelAlicilar(env);
const HAZIRLIK_PARTI = 3; // bir çalışmada yapay zekâyla hazırlanan model yazısı
const TUR_ACIK_KART = 5; // 10 Kasım (Patron): bir kişiye aynı anda en fazla 5 kart

// Ürün listesi: Selin'in iç bağlantısıyla (depo gizli olsa da çalışır); bağlantı yoksa ham adres.
const siteUrunleriAl = (env) => siteVerisi(env);

// Telegram tarihleri: kanal kayıtları + Sami'nin deposundaki "tg" (ikisinin en yenisi). İlk seferde depoya doldurulur.
async function telegramTarihleriAl(env) {
  const { son, ilk } = telegramTarihleri((await env.KAYIT.get("kodlar", "json")) || {}, (await env.KAYIT.get("sonpaylasim", "json")) || {});
  if (!env.STOK) return { son, ilk };
  const tg = await stokIste(env, "/tg-hepsi").catch(() => ({}));
  if (!(await stokIste(env, "/ayar-oku", { k: "tg:dolduruldu" }).catch(() => ({}))).v) {
    await stokIste(env, "/tg-yaz", { kayitlar: son });
    await stokIste(env, "/ayar-yaz", { k: "tg:dolduruldu", v: "1" });
  }
  for (const [kod, t] of Object.entries(tg)) son[kod] = Math.max(son[kod] || 0, t);
  return { son, ilk };
}

// Durum etiketi için bağlam: stok, Telegram tarihleri, 0'dan geri gelenler, son 14 günün satışı.
async function durumBaglami(env, kodlar, simdi) {
  const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar }).catch(() => ({})) : {};
  const tarih = await telegramTarihleriAl(env);
  const geldi = env.STOK ? await stokIste(env, "/geldiler", { basla: simdi - 30 * 86400 }).catch(() => ({})) : {};
  const satislar = env.STOK ? await stokIste(env, "/satis-donem", { basla: gunAnahtari(simdi - COK_SATAN_GUN * 86400), bitis: gunAnahtari(simdi) }).catch(() => ({})) : {};
  for (const k of INDIRIMLI) delete satislar[k]; // indirimli mal (2000) çok satanlar sıralamasına girmez
  return { stok, tarih, geldi, satislar };
}

// Bir modelin paylaşım paketi: yazı (renkler + EN/FR; yapay zekâ bir kez, Düzelt ile değişir) + durum + medya.
const RENK_KELIME = {
  en: { black: "black", white: "white", burgundy: "burgundy", red: "red", navy: "navy", blue: "blue", green: "green", beige: "beige", cream: "cream", pink: "pink", purple: "purple", grey: "grey", gray: "grey", brown: "brown" },
  fr: { noir: "black", noire: "black", noirs: "black", noires: "black", blanc: "white", blanche: "white", blancs: "white", blanches: "white", bordeaux: "burgundy", rouge: "red", rouges: "red", bleu: "blue", bleue: "blue", vert: "green", verte: "green", beige: "beige", rose: "pink", violet: "purple", violette: "purple", gris: "grey", grise: "grey", marron: "brown" },
};
export function baskaRenkSil(metin, renkler, dil) {
  if (!metin) return metin;
  const izin = new Set((renkler || []).flatMap((r) => String(r).toLowerCase().split(/\s+/)));
  const sozluk = RENK_KELIME[dil] || {};
  return String(metin).replace(/[A-Za-zÀ-ÿ]+/g, (w) => (sozluk[w.toLowerCase()] && !izin.has(sozluk[w.toLowerCase()]) ? "" : w)).replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}
async function paketHazirla(env, u, baglam, simdi, { durum = null, medya = null, renk = null, beden = null } = {}) {
  let yazi = await env.KAYIT.get(`yazi:${u.kod}`, "json");
  if (!yazi) {
    yazi = await yaziHazirla(env, u);
    await env.KAYIT.put(`yazi:${u.kod}`, JSON.stringify(yazi));
  }
  // 4 Kasım (Patron): renk MODEL KARTINDAN (3627 = koyu bordo, "black" değil); kart yoksa eski yazı
  const kart = await env.KAYIT.get(`pelinboy:${u.kod}`, "json").catch(() => null);
  // 4 Kasım: Pelin işinin KENDİ rengi önce (aynı modelin başka rengi üretilirken model kartı değişebilir: 3627 bordo ↔ beyaz)
  const kartRenk = renk || (kart && kart.renk);
  if (kartRenk) {
    const r = String(kartRenk).toLocaleLowerCase("tr").trim(), ton = r.match(/^(koyu|açık|acik)\s+(.+)$/);
    const en = renkCevir([r]) || (ton && renkCevir([ton[2]]) ? renkCevir([ton[2]]).map((x) => `${ton[1] === "koyu" ? "dark" : "light"} ${x}`) : null);
    if (en) yazi = { ...yazi, renkler: en, renkEmin: true, renkNotu: "" };
  }
  if (kart && kart.kumas && !yazi.kumas) yazi = { ...yazi, kumas: String(kart.kumas) }; // 4 Kasım: kumaş etiketi (Pelin okur) kanal yazısına
  // 6 Kasım: önbellekteki yazıda EN/FR yoksa (3627: hiç yoktu) sitedeki açıklamanın ilk cümlesi (ücretsiz; yapay zekâ yok)
  const ilkCumle = (t) => { const x = String(t || "").split(/(?<=[.!?])\s+/)[0].trim(); return x.length > 160 ? `${x.slice(0, 157).replace(/\s+\S*$/, "")}…` : x; };
  if (!yazi.en && u.aciklama && u.aciklama.en) yazi = { ...yazi, en: ilkCumle(u.aciklama.en) };
  if (!yazi.fr && u.aciklama && u.aciklama.fr) yazi = { ...yazi, fr: ilkCumle(u.aciklama.fr) };
  // Renk belliyse açıklamada BAŞKA renk geçmesin ("sheer black fabric" beyaz kartta yanlış olur) → o renk kelimesi çıkarılır
  if (kartRenk && yazi.renkEmin) { yazi = { ...yazi, en: baskaRenkSil(yazi.en, yazi.renkler, "en"), fr: baskaRenkSil(yazi.fr, yazi.renkler, "fr") }; }
  const st = baglam.stok[u.kod] || {};
  const marka = await modelMarkasi(env, String(u.kod)).catch(() => "VOLONTE"); // imza markaya göre (5 Kasım)
  return {
    marka,
    kod: String(u.kod),
    baslik: u.baslik || "",
    durum: durum || yazi.durum || durumSec({ kod: String(u.kod), ilkPaylasim: baglam.tarih.ilk[u.kod], toplam: st.toplam, bedenler: u.bedenler, geldiZaman: baglam.geldi[u.kod], satislar: baglam.satislar, simdi }),
    renkler: yazi.renkler || [],
    renkEmin: Boolean(yazi.renkEmin),
    renkNotu: yazi.renkNotu || "",
    kumas: yazi.kumas || null,
    en: yazi.en || "",
    fr: yazi.fr || "",
    bedenler: (beden && BEDEN_GRUPLARI[beden] && BEDEN_GRUPLARI[beden].bedenler) || u.bedenler || "", // 6 Kasım: Patron "büyük/küçük" yazdıysa o
    medya: medya || siteMedyasi(u),
    video: (u.videolar || []).length,
    // Black Rose (VOLONTE Vegawin'de kartı yok): stok kontrol edilemez; sadece önizlemede not (kanala gitmez).
    blackRose: Boolean(env.STOK) && Object.keys(baglam.stok).length > 0 && !baglam.stok[u.kod],
    tgSon: baglam.tarih.son[u.kod] || null,
  };
}

// Paketi bir sohbete gönderir. bicim "tek": ilk medya + alt yazı + düğmeler; "album": albüm + ardından "👆 CODE" + düğmeler.
// Albümde video gönderilemezse (ör. çok büyük) fotoğraflarla yeniden denenir.
export async function paketGonder(env, hedef, paket, bicim = "album") {
  const altyazi = altYazi(paket);
  const medya = paket.medya || [];
  if (!medya.length) return { ok: false, hata: "medya yok" };
  const tekGonder = async (m) => {
    const metod = m.type === "video" ? "sendVideo" : "sendPhoto";
    return telegram(env, metod, { chat_id: hedef, [m.type === "video" ? "video" : "photo"]: m.media, caption: altyazi, parse_mode: "HTML", reply_markup: dugmeler() });
  };
  if (bicim === "tek" || medya.length === 1) {
    const ilkFoto = medya.find((m) => m.type === "photo") || medya[0];
    const r = await tekGonder(ilkFoto);
    return r.ok ? { ok: true, ids: [r.result.message_id] } : { ok: false, hata: r.description };
  }
  const grup = (liste) => telegram(env, "sendMediaGroup", { chat_id: hedef, media: liste.map((m, i) => (i === 0 ? { ...m, caption: altyazi, parse_mode: "HTML" } : m)) });
  let not = null;
  let r = await grup(medya);
  if (!r.ok && medya.some((m) => m.type === "video")) {
    const fotolar = medya.filter((m) => m.type === "photo");
    if (fotolar.length) {
      not = `video eklenemedi (${r.description}); sadece fotoğraflar`;
      r = fotolar.length > 1 ? await grup(fotolar) : await tekGonder(fotolar[0]);
      if (r.ok && fotolar.length === 1) return { ok: true, ids: [r.result.message_id], not };
    }
  }
  if (!r.ok) return { ok: false, hata: r.description };
  const ids = r.result.map((x) => x.message_id);
  const ek = await telegram(env, "sendMessage", { chat_id: hedef, text: paket.kodsuz ? "👆" : albumNotu(paket.kod), parse_mode: "HTML", reply_markup: dugmeler(), disable_web_page_preview: true });
  if (ek.ok) ids.push(ek.result.message_id);
  return { ok: true, ids, not };
}

// 10 Kasım (Patron, görev kâğıdı): öneri kartı [Onayla] [Düzelt] / [Geç] [Beklesin] — satırda en fazla 2 düğme
const yeniKlavye = (no, kod) => ({ inline_keyboard: [
  [{ text: "✅ Onayla", callback_data: `y1:${no}:${kod}` }, { text: "✏️ Düzelt", callback_data: `yd:${no}:${kod}` }],
  [{ text: "❌ Geç", callback_data: `yg:${no}:${kod}` }, { text: "⏳ Beklesin", callback_data: `yw:${no}:${kod}` }],
] });

export function kontrolMetni(p, simdi) {
  const renk = !p.renkler.length ? "⚠️ Renkleri bulamadım — ✏️ Düzelt ile yazın (paylaşmadan önce gerekli)"
    : p.renkEmin ? `${p.renkler.join(", ")} ✅` : `⚠️ Emin değilim (${p.renkler.join(", ")})${p.renkNotu ? ` — ${p.renkNotu}` : ""}. ✏️ Düzelt ile doğru renkleri yazın (paylaşmadan önce gerekli)`;
  return [
    `⬆️ ${p.kod}${p.baslik ? ` · ${p.baslik}` : ""}`,
    `Durum: ${DURUMLAR[p.durum]}`,
    `Renkler: ${renk}`,
    ...(p.renkEmin && p.renkNotu ? [`Not: ${p.renkNotu}`] : []),
    `Kumaş: ${p.kumas || "bilinmiyor, kanal yazısına konmadı (biliyorsanız ✏️ Düzelt)"}`,
    `Telegram'da son paylaşım: ${p.tgSon ? `${tarihUzun(p.tgSon)} (${Math.floor((simdi - p.tgSon) / 86400)} gün önce)` : "hiç"}`,
    ...(p.video ? [`🎞 ${p.video} video var — videoda başka renk varsa ✏️ Düzelt`] : []),
    ...(p.blackRose ? ["⚠️ Black Rose – stok kontrol edilemedi"] : []),
  ].join("\n");
}

// Bir kişiye önizlemeleri art arda gönderir (Durable Object içinde, kendi istek sınırıyla).
export async function yeniParcaIsle(env, { kisi, no, bicim, ogeler, simdi }) {
  const gonderilen = [];
  const ara = env.MESAJ_ARASI_MS != null ? Number(env.MESAJ_ARASI_MS) : 700;
  for (const o of ogeler) {
    if (o !== ogeler[0]) await bekle(ara);
    if (o.baslik) { await telegram(env, "sendMessage", { chat_id: kisi, text: o.baslik, disable_web_page_preview: true }); continue; }
    // 10 Kasım (Patron): kart TEK mesaj — resim + kontrol satırları + kanaldaki yazı + düğmeler (albüm + ayrı mesaj yok)
    const k = await tekKartGonder(env, kisi, o.paket, kontrolMetni(o.paket, simdi), yeniKlavye(no, o.paket.kod));
    if (!k.ok) {
      await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ ${o.paket.kod} önizlemesi gönderilemedi: ${k.description || "?"}` });
      if (/chat not found|blocked|deactivated/i.test(k.description || "")) break;
      continue;
    }
    gonderilen.push([o.paket.kod, k.result.message_id]);
  }
  return { gonderilen };
}
async function yeniParcaGonder(env, govde) {
  if (env.KATALOG) return (await sabitNesne(env).fetch("https://katalog/yeni-gonder", { method: "POST", body: JSON.stringify(govde) })).json();
  return yeniParcaIsle(env, govde);
}

// Yeni tur: modeller seçilir; yazıları birkaç çalışmada hazırlanır, hepsi hazır olunca önizlemeler gider.
// gruplar: (deneme) [{ baslik, kodlar }]; yoksa günün 10 modeli.
const PAYLASILMAMIS_GUNLUK = 2;
// sec(adet, disari) → kurala göre sıralı kodlar (hiç paylaşılmamışlar en başta gelir). Günde en fazla 2 hiç paylaşılmamış:
// biri listenin başında (sabah), biri sonunda (akşam); diğerleri normal kuralla.
export function gunlukSecim(sec, son, adet = GUNLUK_SINIR) {
  const hic = sec(999).filter((k) => !son[k]);
  const iki = hic.slice(0, Math.min(PAYLASILMAMIS_GUNLUK, adet));
  const normal = sec(adet - iki.length, hic);
  return [...iki.slice(0, 1), ...normal, ...iki.slice(1)];
}
export async function yeniTurBaslat(env, onceki, simdi, gruplar = null, { enAzGun = 0 } = {}) {
  const site = await siteUrunleriAl(env);
  const kuyruk = await kuyrukListesi(env);
  const atlananlar = { ...((await env.KAYIT.get("atlananlar", "json")) || {}), ...Object.fromEntries(Object.keys((await env.KAYIT.get("silme:onayli", "json").catch(() => null)) || {}).map((k) => [k, 4e9])) }; // 12 Kasım: silinmesi onaylanan model sıraya girmez
  const haric = [...kuyruk.map((o) => o.kod), ...Object.entries(atlananlar).filter(([, t]) => t > simdi).map(([k]) => k)];
  const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar: site.map((u) => String(u.kod)) }).catch(() => ({})) : {};
  const { son } = await telegramTarihleriAl(env);
  const sec = (adet, disari = []) => gununModelleri({ site, stok, tg: son, haric: [...haric, ...disari, ...INDIRIMLI], simdi, adet: enAzGun > 0 ? 999 : adet }).filter((u) => !(enAzGun > 0) || !son[u.kod] || simdi - son[u.kod] >= enAzGun * 86400).slice(0, adet).map((u) => String(u.kod));
  let yerYok = false;
  if (!gruplar) {
    // Kullanıcı kararı (31 Ekim): stokta olup Telegram'da HİÇ paylaşılmamış modeller (sitede medyası olanlar) günde en fazla 2:
    // biri listenin başında (sabah), biri sonunda (akşam). Liste bitene kadar. Diğer 8 normal kuralla; 2000 hariç.
    // 9 Kasım (Patron): dünden kalan onaylılar 09:00'da ilk sırada → sabah önerisi 21:00'e sığan kadar (en fazla 10)
    const kalanYeni = kuyruk.filter((o) => o.yeni).length;
    const adet = Math.max(0, Math.min(GUNLUK_SINIR, siganPaylasim(simdi, (await yayinKapisi(env, simdi)).sonraki) - kalanYeni));
    yerYok = !adet;
    gruplar = [{ baslik: null, kodlar: adet ? gunlukSecim(sec, son, adet) : [] }];
  }
  else {
    // Deneme: elle verilen kodlar (stoğu olmayan çıkar) ya da { otomatik: n } → kuralla seçilen n model (diğer gruplar ve "haric" dışında).
    const elle = gruplar.flatMap((g) => g.kodlar || []).map(String);
    const disari = [...elle, ...gruplar.flatMap((g) => g.haric || []).map(String)];
    gruplar = gruplar.map((g) => ({ baslik: g.baslik, kodlar: g.otomatik ? sec(g.otomatik, disari) : (g.kodlar || []).map(String).filter((k) => !env.STOK || !stok[k] || (stok[k].toplam > 0 && !stok[k].gizli)) }));
  }
  const tur = { no: ((onceki && onceki.no) || 0) + 1, yeni: true, durum: "hazirlaniyor", basla: simdi, gun: gunAnahtari(simdi), onaylar: [], ogeler: {},
    gruplar: gruplar.map((g) => ({ baslik: g.baslik, kodlar: g.kodlar.filter((k) => site.some((u) => String(u.kod) === k)) })), karsilastirma: Boolean(gruplar[0] && gruplar[0].baslik) };
  // Önceki günlerden kalan ESKİ düzen sıradakiler (kanal kopyası) yeni düzende paylaşılmaz.
  for (const o of kuyruk) if (!o.yeni) await env.KAYIT.delete(`kuyruk:${o.kod}`);
  const kodlar = tur.gruplar.flatMap((g) => g.kodlar);
  if (!kodlar.length) {
    tur.durum = "bitti";
    tur.bitis = simdi;
    await env.KAYIT.put("tur", JSON.stringify(tur));
    if (yerYok) return herkese(env, `Bugün yeni öneri yok: dünden kalan onaylı paylaşımlar 09:00'dan itibaren ilk sırada ve 21:00'e kadar yer dolu.`);
    return herkese(env, `Bugün önerecek model yok (stokta + sitede + ${PAYLASIM_ARASI_GUN} gündür paylaşılmamış model kalmadı). Yarın sabah tekrar bakacağım.`);
  }
  for (const k of kodlar) tur.ogeler[k] = { paket: null, mesajlar: [], karar: null, kim: null };
  await env.KAYIT.put("tur", JSON.stringify(tur));
  return yeniTurAdimi(env, simdi);
}

// Hazırlanmamış paketler (çalışma başına en fazla HAZIRLIK_PARTI); tur nesnesini yerinde günceller.
async function paketleriHazirla(env, tur, eksik, simdi) {
  const site = await siteUrunleriAl(env);
  const baglam = await durumBaglami(env, eksik, simdi);
  for (const kod of eksik.slice(0, HAZIRLIK_PARTI)) {
    const u = site.find((x) => String(x.kod) === kod);
    try {
      if (!u) throw new Error("sitede yok");
      tur.ogeler[kod].paket = await paketHazirla(env, u, baglam, simdi);
    } catch (e) {
      tur.ogeler[kod].deneme = (tur.ogeler[kod].deneme || 0) + 1;
      if (tur.ogeler[kod].deneme >= 3 || /sitede yok|SINIR|sınır/i.test(e.message)) tur.ogeler[kod].hata = String(e.message).slice(0, 200);
      await env.KAYIT.put("kemal:yeniHata", JSON.stringify({ zaman: simdi, kod, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 });
    }
  }
}
// Her 5 dakikada: hazırlanmamış yazıları hazırlar (çalışma başına 3); hepsi hazırsa önizlemeleri gönderir.
export async function yeniTurAdimi(env, simdi) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || !tur.yeni || tur.durum !== "hazirlaniyor") return false;
  const eksik = Object.entries(tur.ogeler).filter(([, o]) => !o.paket && !o.hata).map(([k]) => k);
  if (eksik.length) {
    await paketleriHazirla(env, tur, eksik, simdi);
    await env.KAYIT.put("tur", JSON.stringify(tur));
    if (Object.values(tur.ogeler).some((o) => !o.paket && !o.hata)) return true;
  }
  // Hepsi hazır: önce kaydet (görev üst üste çalışırsa iki kez gönderilmesin), sonra her kişiye ayrı çalışmada.
  tur.durum = "toplaniyor";
  await env.KAYIT.put("tur", JSON.stringify(tur));
  const bicim = (await env.KAYIT.get("bicim")) || "album";
  const hatalar = Object.entries(tur.ogeler).filter(([, o]) => o.hata).map(([k, o]) => `${k} (${o.hata})`);
  const giris = tur.karsilastirma
    ? `🆕 Kemal — YENİ DÜZEN denemesi (${tur.no}. tur). Aşağıdaki gönderiler kanalda tam olarak böyle görünecek (fiyat yok, sadece İngilizce + Fransızca, düğmeler tıklanabilir).`
    : `🆕 Günaydın! Kemal — bugünün modelleri (${tur.no}. tur): stokta + sitede + en az ${PAYLASIM_ARASI_GUN} gündür paylaşılmamış, en uzun süredir paylaşılmayan önce.`;
  const aciklama = `${giris}\n✅ Paylaş → sıraya girer (${SABAH_SAATI}:00–${AKSAM_SAATI}:00, ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla, günde en fazla ${GUNLUK_SINIR}; akşam onaylanan ertesi sabah paylaşılır, stoğu biterse paylaşılmaz)\n✏️ Düzelt → renk / kumaş / durum / yazıyı siz yazarsınız, yeni önizleme gelir\n❌ Geç → ${GEC_GUN} gün önerilmez; yerine yeni model toplu kartta gelir (21:00'e sığacak kadar). Günlük hedef: ${GUNLUK_SINIR} onay; bugün sığmayan onaylar ertesi sabah 09:00'da ilk sırada.\nKanalda hiçbir şey onaysız paylaşılmaz.${hatalar.length ? `\n⚠️ Hazırlanamayan: ${hatalar.join(", ")}` : ""}`;
  for (const kisi of onizleyenler(env)) {
    // 10 Kasım (Patron): Merdan'a SADECE Black Rose; bir kişiye aynı anda en fazla 5 kart (kalanlar cevap verdikçe gelir)
    const benim = tur.gruplar.flatMap((g) => g.kodlar).filter((k) => tur.ogeler[k] && tur.ogeler[k].paket && markaKisiMi(env, kisi, tur.ogeler[k].paket.marka));
    if (!benim.length) continue;
    const ilk = benim.slice(0, TUR_ACIK_KART);
    const ogeler = [{ baslik: `${aciklama}\nBugün size ${benim.length} model; kartlar ${TUR_ACIK_KART}'er gelir, cevap verdikçe yenisi gelir.` }, ...ilk.map((k) => ({ paket: tur.ogeler[k].paket }))];
    if (tur.karsilastirma) await bicimKarsilastir(env, kisi, tur);
    const r = await yeniParcaGonder(env, { kisi, no: tur.no, bicim, ogeler, simdi });
    const guncel = (await env.KAYIT.get("tur", "json")) || tur;
    if (guncel.no !== tur.no) return true;
    for (const [kod, id] of r.gonderilen || []) {
      const oge = guncel.ogeler[kod];
      if (!oge) continue;
      oge.mesajlar.push([kisi, id]);
      if (oge.karar) await telegram(env, "editMessageReplyMarkup", { chat_id: kisi, message_id: id, reply_markup: { inline_keyboard: [] } });
    }
    await env.KAYIT.put("tur", JSON.stringify(guncel));
  }
  return true;
}

// Deneme: aynı model iki biçimde (tek medya + düğme / albüm + kısa mesaj); seçilen biçim bundan sonra kullanılır.
async function bicimKarsilastir(env, kisi, tur) {
  const oge = Object.values(tur.ogeler).find((o) => o.paket && o.paket.medya.length > 1);
  if (!oge) return;
  const p = oge.paket;
  await telegram(env, "sendMessage", { chat_id: kisi, text: `🅰️ A BİÇİMİ — tek fotoğraf, düğmeler doğrudan altında (diğer fotoğraf/videolar görünmez). Örnek: ${p.kod}` });
  await paketGonder(env, kisi, p, "tek");
  await telegram(env, "sendMessage", { chat_id: kisi, text: `🅱️ B BİÇİMİ — albüm (${p.medya.length} medya) + hemen ardından kısa mesaj ve düğmeler. Örnek: ${p.kod}` });
  await paketGonder(env, kisi, p, "album");
  const simdiki = (await env.KAYIT.get("bicim")) || "album";
  await telegram(env, "sendMessage", { chat_id: kisi, text: `Kanalda hangisi kullanılsın? (Şu an: ${simdiki === "tek" ? "A" : "B"}. Aşağıdaki önizlemeler bu biçimde.)`, reply_markup: { inline_keyboard: [[{ text: "🅰️ A: tek + düğme", callback_data: "yb:tek" }, { text: "🅱️ B: albüm + mesaj", callback_data: "yb:album" }]] } });
}

async function yeniTurDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, no, kod] = String(cq.data || "").split(":");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  if (islem === "yb") {
    if (!["tek", "album"].includes(no)) return cevapla("Geçersiz düğme.");
    await env.KAYIT.put("bicim", no);
    await cevapla(no === "tek" ? "A seçildi" : "B seçildi");
    const metin = `🖼 ${kim} kanal biçimini seçti: ${no === "tek" ? "A — tek fotoğraf + düğmeler" : "B — albüm + kısa mesaj ve düğmeler"}. Bundan sonraki paylaşımlar bu biçimde.`;
    for (const k of onizleyenler(env)) await telegram(env, "sendMessage", { chat_id: k, text: metin });
    return;
  }
  if (islem === "yd" && no === "-") { // /paylas önizlemesinden: sadece kayıt düzeltilir
    await env.KAYIT.put(`duzelt:${cq.from.id}`, JSON.stringify({ no: "-", kod }), { expirationTtl: 3600 });
    await cevapla("Düzeltmeyi yazın");
    return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod} için düzeltmeyi bir mesajla yazın (1 saat içinde), sonra /paylas ${kod} yazın.\n${DUZELT_ORNEK}` });
  }
  const tur = await env.KAYIT.get("tur", "json");
  const oge = tur && tur.yeni && String(tur.no) === no && tur.ogeler[kod];
  if (!oge || !oge.paket || tur.durum === "bitti") return cevapla("Bu tur artık geçerli değil.");
  if (oge.karar) return cevapla(`${oge.kim} zaten karar verdi.`);
  if (islem === "yd") {
    await env.KAYIT.put(`duzelt:${cq.from.id}`, JSON.stringify({ no: tur.no, kod }), { expirationTtl: 3600 });
    await cevapla("Düzeltmeyi yazın");
    return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${kod} için düzeltmeyi bir mesajla yazın (1 saat içinde).\n${DUZELT_ORNEK}\n\nŞu an: renk: ${oge.paket.renkler.join(", ") || "—"} · kumaş: ${oge.paket.kumas || "yok"} · durum: ${oge.paket.durum}\nen: ${oge.paket.en}\nfr: ${oge.paket.fr}` });
  }
  if (islem === "y1" && !oge.paket.renkEmin) return cevapla("Önce renkleri yazın: ✏️ Düzelt (renk: ...)");
  if (!["y1", "yg", "yw"].includes(islem)) return cevapla("Geçersiz düğme.");
  if (islem === "y1" && (tur.onaylar || []).length >= GUNLUK_SINIR) return cevapla(`Bugün ${GUNLUK_SINIR} onaya ulaşıldı; bu model yarın yeniden önerilebilir.`);
  oge.karar = islem;
  oge.kim = kim;
  oge.kararZaman = simdi;
  if (islem === "y1") tur.onaylar.push(kod);
  else tur.sonGec = simdi; // toplu ek öneri bu zamana göre (birkaç "Geç" tek kartta toplansın)
  await env.KAYIT.put("tur", JSON.stringify(tur)); // önce kilitle
  if (islem === "y1") {
    await env.KAYIT.put(`kuyruk:${kod}`, JSON.stringify({ kod, yeni: true, paket: oge.paket, kim, zaman: simdi + tur.onaylar.length / 1000, tur: tur.no }));
    await cevapla("Sıraya girdi ✅");
  } else {
    await atla(env, kod, islem === "yw" ? BEKLESIN_GUN : GEC_GUN, simdi);
    await cevapla(islem === "yw" ? "Beklesin" : "Geçildi");
  }
  const ek = islem === "y1" ? `✅ ${kim} onayladı — paylaşım sırasına girdi (/kuyruk).` : islem === "yw" ? `⏳ ${kim}: beklesin — ${BEKLESIN_GUN} gün sonra yeniden önerilecek.` : `❌ ${kim}: geç — ${GEC_GUN} gün sonra yeniden önerilecek.`;
  for (const [kisi, mesajId] of oge.mesajlar) await kartYazisi(env, kisi, mesajId, `${kontrolMetni(oge.paket, simdi)}\n\n${ek}`);
  if (oge.dalga) await topluGuncelle(env, tur, oge.dalga, simdi);
  await turSiradakiKart(env, simdi); // 10 Kasım: cevap verdikçe sıradaki kart (aynı anda en fazla 5)
}
// Kişide açık (karar verilmemiş) kart 5'ten azsa sıradaki modelin kartı (marka ayrımıyla)
export async function turSiradakiKart(env, simdi) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || !tur.yeni || tur.durum !== "toplaniyor") return 0;
  let n = 0;
  for (const kisi of onizleyenler(env)) {
    const goren = (k) => (tur.ogeler[k].mesajlar || []).some(([c]) => String(c) === String(kisi));
    const benim = Object.keys(tur.ogeler).filter((k) => tur.ogeler[k].paket && !tur.ogeler[k].hata && markaKisiMi(env, kisi, tur.ogeler[k].paket.marka));
    const acik = benim.filter((k) => goren(k) && !tur.ogeler[k].karar).length;
    const sira = benim.filter((k) => !goren(k) && !tur.ogeler[k].karar).slice(0, Math.max(0, TUR_ACIK_KART - acik));
    for (const k of sira) {
      const r = await tekKartGonder(env, kisi, tur.ogeler[k].paket, kontrolMetni(tur.ogeler[k].paket, simdi), yeniKlavye(tur.no, k));
      if (r.ok) { tur.ogeler[k].mesajlar.push([kisi, r.result.message_id]); n++; }
    }
  }
  if (n) await env.KAYIT.put("tur", JSON.stringify(tur));
  return n;
}

// ---------- 9 Kasım (Patron): GÜNLÜK HEDEF 10 ONAYLI PAYLAŞIM ----------
// "Geç" denen kadar yeni model TEK toplu kartta önerilir (onay + bekleyen ≤ 10); 10 onaya ulaşınca o gün yeni öneri yok.
// Ek öneriler en geç 15:00'e kadar (09–21 arası 60–90 dk arayla 10 paylaşım sığsın). Geç = 7 gün önerilmez (atlananlar).
const TAMAMLA_BEKLE_DK = 10; // son "Geç"ten bu kadar sonra (ya da bekleyen kart kalmayınca) toplu kart gider
// Bugün 21:00'e kadar kaç paylaşım sığar: ilk paylaşım "ilk" anında (yayın kapısının sıradaki zamanı), sonra ortalama 75 dk arayla
export function siganPaylasim(simdi, ilk) {
  const gunBasi = simdi - ((simdi + SAAT_FARKI) % 86400);
  const bit = gunBasi + YAYIN_BIT * 3600;
  const t = Math.max(simdi, ilk || 0, gunBasi + YAYIN_BAS * 3600);
  return t >= bit ? 0 : 1 + Math.floor((bit - t) / (ORT_ARALIK_DK * 60));
}
// bos: bugün 21:00'e kadar boş paylaşım yeri (sığan − sırada bekleyen onaylılar); öneri en fazla bu kadar ve toplam 10 onaya kadar
export function tamamlamaIhtiyaci(tur, simdi, bos = Infinity) {
  const og = Object.values(tur.ogeler || {});
  const onay = (tur.onaylar || []).length;
  const bekleyen = og.filter((o) => !o.karar && !o.hata).length;
  const eksik = Math.max(0, Math.min(GUNLUK_SINIR - onay - bekleyen, bos - bekleyen));
  const zaman = !bekleyen || !tur.sonGec || simdi - tur.sonGec >= TAMAMLA_BEKLE_DK * 60;
  return { onay, bekleyen, eksik, hazir: eksik > 0 && onay < GUNLUK_SINIR && Boolean(zaman) };
}
export function topluKart(tur, dalga, simdi) {
  const d = tur.dalgalar.find((x) => x.no === dalga);
  const onay = (tur.onaylar || []).length;
  const satirlar = [`🆕 Kemal — ek öneri (${d.kodlar.length} model): ${d.venom ? "Venom'un önerisi" : '"Geç" denenlerin yerine'}. Bugün ${onay}/${GUNLUK_SINIR} onay.`, "Albümdeki sıra ile aynı. Düğmeler: ✅ Paylaş · ✏️ Düzelt (tam önizleme gelir) · ❌ Geç (7 gün önerilmez).", ""];
  const klavye = [];
  d.kodlar.forEach((kod, i) => {
    const o = tur.ogeler[kod];
    if (!o) return;
    const p = o.paket || {};
    const son = p.tgSon ? `son paylaşım ${tarihUzun(p.tgSon)} (${Math.floor((simdi - p.tgSon) / 86400)} gün önce)` : "kanalda hiç paylaşılmadı";
    const renk = !(p.renkler || []).length ? "renk ⚠️ yok → ✏️" : p.renkEmin ? `renk ${p.renkler.join(", ")} ✅` : `renk ⚠️ emin değilim (${p.renkler.join(", ")}) → ✏️`;
    const karar = o.karar === "y1" ? ` — ✅ ${o.kim} onayladı` : o.karar === "yg" ? ` — ❌ ${o.kim}: geç` : "";
    satirlar.push(`${i + 1}. ${kod}${p.baslik ? ` · ${p.baslik}` : ""} — ${renk} · ${son}${karar}`);
    if (!o.karar) klavye.push([{ text: `${i + 1}· ✅ ${kod}`, callback_data: `y1:${tur.no}:${kod}` }, { text: `${i + 1}· ✏️`, callback_data: `yd:${tur.no}:${kod}` }, { text: `${i + 1}· ❌`, callback_data: `yg:${tur.no}:${kod}` }]);
  });
  return { text: satirlar.join("\n").slice(0, 4000), reply_markup: { inline_keyboard: klavye } };
}
async function topluGuncelle(env, tur, dalga, simdi) {
  const d = (tur.dalgalar || []).find((x) => x.no === dalga);
  if (!d) return;
  const k = topluKart(tur, dalga, simdi);
  for (const [kisi, id] of d.mesajlar || []) await telegram(env, "editMessageText", { chat_id: kisi, message_id: id, ...k, disable_web_page_preview: true });
}
// 13 Kasım (Patron) — "KEMAL'İ ÇALIŞTIR": stokta olan ve fotoğrafı (sitede medyası) olan modellerden EN UZUN SÜREDİR paylaşılmayanlar
// (hiç paylaşılmamışlar en önde) öneri kartı olarak Hemra'ya (ve Merdan'a) gider; onaylananlar sırayla, en az 60 dk arayla paylaşılır.
// 7 gün kuralı, 09:00–21:00 ve günde 12 sınırı geçerlidir (kesin kapı). 21:00'den sonra gelen komut sabah 09:00 turuna planlanır.
// enAzGun verilirse ("1 aydan beri paylaşılmayanlar" → 30) sadece o kadar eski olanlar. Patron'a tek satır: calistirSatiri.
const enEskiModel = (kodlar, son, simdi) => { const k = kodlar[0]; return k ? { kod: k, gun: son[k] ? Math.floor((simdi - son[k]) / 86400) : null } : null; };
export async function kemalCalistir(env, { enAzGun = 0, kuru = false } = {}, simdi = Math.floor(Date.now() / 1000)) { // kuru: sadece hesaplar (deneme sorusu) — kart, kayıt, plan YOK
  enAzGun = Math.max(0, Math.min(365, Math.round(Number(enAzGun) || 0)));
  if (await durdurulduMu(env, "kemal")) return { ok: false, hata: "Kemal durdurulmuş (önce \"Kemal'i aç\")" };
  const s = saat(simdi), gun = gunAnahtari(simdi);
  if (s < YAYIN_BAS || s >= YAYIN_BIT) {
    if (!kuru) await env.KAYIT.put("kemal:calistirPlan", JSON.stringify({ enAzGun, zaman: simdi }), { expirationTtl: 2 * 86400 });
    return { ok: true, planlandi: true, enAzGun };
  }
  let tur = await env.KAYIT.get("tur", "json");
  const bugunTur = tur && tur.yeni && turGunu(tur) === gun;
  if (bugunTur && tur.durum === "hazirlaniyor") return { ok: false, hata: "sabah turu şu an hazırlanıyor; birkaç dakika sonra kartlar gider" };
  if (bugunTur && (tur.dalgalar || []).some((d) => d.durum === "hazirlaniyor")) return { ok: false, hata: "bir öneri zaten hazırlanıyor; birkaç dakika sonra kartlar gider" };
  const site = await siteUrunleriAl(env);
  const kuyruk = await kuyrukListesi(env);
  const atlananlar = { ...((await env.KAYIT.get("atlananlar", "json")) || {}), ...Object.fromEntries(Object.keys((await env.KAYIT.get("silme:onayli", "json").catch(() => null)) || {}).map((k) => [k, 4e9])) };
  const haric = [...(bugunTur ? Object.keys(tur.ogeler || {}) : []), ...kuyruk.map((o) => o.kod), ...Object.entries(atlananlar).filter(([, t]) => t > simdi).map(([k]) => k), ...INDIRIMLI];
  const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar: site.map((u) => String(u.kod)) }).catch(() => ({})) : {};
  const { son } = await telegramTarihleriAl(env);
  // en uzun süredir paylaşılmayan önce; hiç paylaşılmamış (tarihi yok) en önde
  const adaylar = gununModelleri({ site, stok, tg: son, haric, simdi, adet: 999 }).filter((u) => !(enAzGun > 0) || !son[u.kod] || simdi - son[u.kod] >= enAzGun * 86400).map((u) => String(u.kod));
  if (!adaylar.length) return { ok: true, n: 0, neden: `stokta olup fotoğrafı olan ve ${enAzGun > 0 ? `${enAzGun} gündür` : `${PAYLASIM_ARASI_GUN} gündür`} paylaşılmamış model kalmadı` };
  const bekleyen = bugunTur ? Object.values(tur.ogeler || {}).filter((o) => !o.karar && !o.hata).length : 0;
  const bugun = await bugunSayac(env, simdi);
  const yer = Math.max(0, Math.min(GUNLUK_SINIR - bugun - kuyruk.length - bekleyen, siganPaylasim(simdi, (await yayinKapisi(env, simdi)).sonraki) - kuyruk.length - bekleyen));
  if (!yer) return { ok: true, n: 0, neden: bekleyen ? `${bekleyen} öneri kartı zaten Hemra / Merdan'ın onayında bekliyor (bugün kanala ${bugun} paylaşım çıktı, sırada ${kuyruk.length})` : `bugün için yer kalmadı (kanala ${bugun} paylaşım çıktı, sırada ${kuyruk.length}; günde en fazla ${GUNLUK_SINIR}, 21:00'e kadar)` };
  const kodlar = adaylar.slice(0, yer);
  if (kuru) return { ok: true, n: kodlar.length, kodlar, enEski: enEskiModel(kodlar, son, simdi), enAzGun, kuru: true };
  if (!bugunTur) tur = { no: ((tur && tur.no) || 0) + 1, yeni: true, durum: "toplaniyor", basla: simdi, gun, onaylar: [], ogeler: {}, gruplar: [{ baslik: null, kodlar: [] }], karsilastirma: false };
  else if (tur.durum !== "toplaniyor") { tur.durum = "toplaniyor"; delete tur.bitis; }
  delete tur.tukendi;
  tur.dalgalar = tur.dalgalar || [];
  const d = { no: tur.dalgalar.length + 1, kodlar, durum: "hazirlaniyor", zaman: simdi, mesajlar: [], venom: true, calistir: true };
  tur.dalgalar.push(d);
  for (const k of kodlar) tur.ogeler[k] = { paket: null, mesajlar: [], karar: null, kim: null, dalga: d.no };
  await env.KAYIT.put("tur", JSON.stringify(tur));
  await defterIs(env, "kemal", `Patron komutu "Kemal'i çalıştır": ${kodlar.length} model öneriye alındı (en uzun süredir paylaşılmayanlar)`, { kod: kodlar.join(",") });
  return { ok: true, n: kodlar.length, kodlar, enEski: enEskiModel(kodlar, son, simdi), enAzGun };
}
// 13 Kasım (Patron) — İŞ BEKÇİSİ: onay bekleyen öneri kartları için kişiye TEK hatırlatma (onaylı hatırlatma cümlesi; kartın altına yanıt olarak).
export const kemalHatirlatmaYazisi = (kodlar) => `🔔 Hatırlatma: cevap bekleyen kartınız var — kanal paylaşım önerisi${kodlar.length > 8 ? ` (${kodlar.length} model)` : `: ${kodlar.join(", ")}`}. En alttaki karta bakın, düğmeye basın.`;
export async function kemalHatirlat(env, simdi = Math.floor(Date.now() / 1000)) {
  const tur = await env.KAYIT.get("tur", "json").catch(() => null);
  if (!tur || turGunu(tur) !== gunAnahtari(simdi)) return { ok: true, n: 0, kisi: 0 };
  const kisiler = new Map();
  for (const [kod, o] of Object.entries(tur.ogeler || {})) {
    if (o.karar || o.hata || !o.paket) continue;
    const d = o.dalga ? (tur.dalgalar || []).find((x) => x.no === o.dalga) : null;
    for (const [kisi, id] of [...(o.mesajlar || []), ...((d && d.mesajlar) || [])]) {
      const k = kisiler.get(String(kisi)) || { kodlar: new Set(), mesaj: 0 };
      k.kodlar.add(kod); k.mesaj = Math.max(k.mesaj, Number(id) || 0);
      kisiler.set(String(kisi), k);
    }
  }
  let kisi = 0; const hepsi = new Set();
  for (const [chat, k] of kisiler) {
    const r = await telegram(env, "sendMessage", { chat_id: chat, text: kemalHatirlatmaYazisi([...k.kodlar]), reply_to_message_id: k.mesaj || undefined, allow_sending_without_reply: true }).catch(() => null);
    if (r && r.ok) { kisi++; for (const x of k.kodlar) hepsi.add(x); }
  }
  if (kisi) await defterIs(env, "kemal", `Onay bekleyen ${hepsi.size} öneri kartı için hatırlatma gitti (${kisi} kişi)`, { kod: [...hepsi].join(",") }).catch(() => null);
  return { ok: true, n: hepsi.size, kisi, kodlar: [...hepsi] };
}
export async function venomHatirlat(env) {
  if (env.KATALOG) return (await kemalNesne(env).fetch("https://kemal/kemal/hatirlat", { method: "POST" })).json();
  return kemalHatirlat(env);
}
// 9 Kasım (sert müdür B): Venom "şu modeli öner" → bugünün turuna ek dalga (sıradaki çalışmada hazırlanır, toplu kartla gider)
export async function turEkle(env, kodlar, simdi) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || !tur.yeni || tur.durum !== "toplaniyor" || turGunu(tur) !== gunAnahtari(simdi)) return { ok: false, hata: "bugünün turu açık değil" };
  const site = await siteUrunleriAl(env);
  const yeni = kodlar.map(String).filter((k) => !tur.ogeler[k] && site.some((u) => String(u.kod) === k));
  if (!yeni.length) return { ok: false, hata: "bu modeller zaten önerildi ya da sitede yok" };
  tur.dalgalar = tur.dalgalar || [];
  if (tur.dalgalar.some((d) => d.durum === "hazirlaniyor")) return { ok: false, hata: "bir ek öneri hazırlanıyor; birkaç dakika sonra tekrar" };
  const d = { no: tur.dalgalar.length + 1, kodlar: yeni, durum: "hazirlaniyor", zaman: simdi, mesajlar: [], venom: true };
  tur.dalgalar.push(d);
  for (const k of yeni) tur.ogeler[k] = { paket: null, mesajlar: [], karar: null, kim: null, dalga: d.no };
  await env.KAYIT.put("tur", JSON.stringify(tur));
  await defterIs(env, "kemal", `Venom emri: öneriye eklendi`, { kod: yeni.join(",") });
  return { ok: true, kodlar: yeni };
}
// Her 5 dakikada (yeni tur toplanırken): gerekiyorsa ek modelleri seçer, hazırlar ve tek toplu kartla gönderir. true = iş yapıldı.
export async function turTamamla(env, simdi) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || !tur.yeni || tur.karsilastirma || tur.durum !== "toplaniyor" || turGunu(tur) !== gunAnahtari(simdi)) return false;
  tur.dalgalar = tur.dalgalar || [];
  let d = tur.dalgalar.find((x) => x.durum === "hazirlaniyor");
  if (!d) {
    if (tur.tukendi === PAYLASIM_ARASI_GUN || saat(simdi) < SABAH_SAATI || saat(simdi) >= YAYIN_BIT) return false; // "tükendi" o günkü gün kuralıyla geçerlidir (kural değişirse yeniden bakılır)
    const kuyruk = await kuyrukListesi(env);
    const bos = siganPaylasim(simdi, (await yayinKapisi(env, simdi)).sonraki) - kuyruk.length;
    const ih = tamamlamaIhtiyaci(tur, simdi, bos);
    if (!ih.hazir) return false;
    const site = await siteUrunleriAl(env);
    const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
    const haric = [...Object.keys(tur.ogeler), ...kuyruk.map((o) => o.kod), ...Object.entries(atlananlar).filter(([, t]) => t > simdi).map(([k]) => k), ...INDIRIMLI];
    const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar: site.map((u) => String(u.kod)) }).catch(() => ({})) : {};
    const { son } = await telegramTarihleriAl(env);
    // günde en fazla 2 hiç paylaşılmamış (sabahki turdakiler de sayılır)
    let izin = Math.max(0, PAYLASILMAMIS_GUNLUK - Object.values(tur.ogeler).filter((o) => o.paket && !o.paket.tgSon).length);
    const kodlar = [];
    for (const u of gununModelleri({ site, stok, tg: son, haric, simdi, adet: 999 })) {
      if (kodlar.length >= ih.eksik) break;
      const k = String(u.kod);
      if (!son[k]) { if (izin <= 0) continue; izin -= 1; }
      kodlar.push(k);
    }
    if (!kodlar.length) {
      tur.tukendi = PAYLASIM_ARASI_GUN;
      await env.KAYIT.put("tur", JSON.stringify(tur));
      await defterIs(env, "kemal", `ek öneri yapılamadı: uygun model kalmadı (bugün ${ih.onay}/${GUNLUK_SINIR} onay)`);
      return false;
    }
    d = { no: tur.dalgalar.length + 1, kodlar, durum: "hazirlaniyor", zaman: simdi, mesajlar: [] };
    tur.dalgalar.push(d);
    for (const k of kodlar) tur.ogeler[k] = { paket: null, mesajlar: [], karar: null, kim: null, dalga: d.no };
  }
  const eksik = d.kodlar.filter((k) => tur.ogeler[k] && !tur.ogeler[k].paket && !tur.ogeler[k].hata);
  if (eksik.length) await paketleriHazirla(env, tur, eksik, simdi);
  if (d.kodlar.some((k) => tur.ogeler[k] && !tur.ogeler[k].paket && !tur.ogeler[k].hata)) { await env.KAYIT.put("tur", JSON.stringify(tur)); return true; }
  // hepsi hazır: hazırlanamayanlar karttan çıkar; önce kaydet (iki kez gitmesin), sonra gönder
  d.kodlar = d.kodlar.filter((k) => tur.ogeler[k] && tur.ogeler[k].paket);
  d.durum = "gonderildi";
  await env.KAYIT.put("tur", JSON.stringify(tur));
  if (!d.kodlar.length) return true;
  // 10 Kasım (Patron): ek öneriler de TEK kart (albüm + ayrı liste kartı yok); aynı anda en fazla 5, marka ayrımıyla
  if (!env.ESKI_TOPLU) { await turSiradakiKart(env, simdi); await defterIs(env, "kemal", `ek öneri: ${d.kodlar.length} model (bugün ${(tur.onaylar || []).length}/${GUNLUK_SINIR} onay)`, { kod: d.kodlar.join(",") }); return true; }
  const kart = topluKart(tur, d.no, simdi);
  const album = d.kodlar.map((k, i) => { const p = tur.ogeler[k].paket; const m = (p.medya || []).find((x) => x.type === "photo") || (p.medya || [])[0]; return m ? { type: m.type, media: m.media, caption: `${i + 1} · ${k}` } : null; }).filter(Boolean);
  const mesajlar = [];
  for (const kisi of onizleyenler(env)) {
    if (album.length > 1) await telegram(env, "sendMediaGroup", { chat_id: kisi, media: album.slice(0, 10) });
    else if (album.length === 1) await telegram(env, album[0].type === "video" ? "sendVideo" : "sendPhoto", { chat_id: kisi, [album[0].type === "video" ? "video" : "photo"]: album[0].media, caption: album[0].caption });
    const r = await telegram(env, "sendMessage", { chat_id: kisi, ...kart, disable_web_page_preview: true });
    if (r.ok) mesajlar.push([kisi, r.result.message_id]);
  }
  const guncel = (await env.KAYIT.get("tur", "json")) || tur;
  const gd = guncel.no === tur.no && (guncel.dalgalar || []).find((x) => x.no === d.no);
  if (gd) { gd.mesajlar = mesajlar; await env.KAYIT.put("tur", JSON.stringify(guncel)); if (d.kodlar.some((k) => guncel.ogeler[k] && guncel.ogeler[k].karar)) await topluGuncelle(env, guncel, d.no, simdi); }
  await defterIs(env, "kemal", `ek öneri kartı: ${d.kodlar.length} model (bugün ${(tur.onaylar || []).length}/${GUNLUK_SINIR} onay)`, { kod: d.kodlar.join(",") });
  return true;
}

// ✏️ Düzelt cevabı: yazı kaydı güncellenir, iki kişiye yeni önizleme gider. true = mesaj burada işlendi.
async function duzeltmeIsle(msg, env) {
  if (!msg.text || msg.text.startsWith("/")) return false;
  const bekleyen = await env.KAYIT.get(`duzelt:${msg.from.id}`, "json");
  if (!bekleyen) return false;
  const yaz = (text) => telegram(env, "sendMessage", { chat_id: msg.chat.id, text, disable_web_page_preview: true });
  const d = duzeltmeCoz(msg.text);
  if (!Object.keys(d).length) {
    await yaz(`Anlayamadım. ${DUZELT_ORNEK}\n(Vazgeçmek için /iptal)`);
    return true;
  }
  await env.KAYIT.delete(`duzelt:${msg.from.id}`);
  if (bekleyen.no === "r") return repeteDuzelt(msg, env, bekleyen.id, d);
  const { kod } = bekleyen;
  await defterCevap(env, "kemal", msg.from.id, kod, `düzeltme: ${msg.text}`).catch(() => null); // 9 Kasım: yazılan cevap deftere
  const simdi = Math.floor(Date.now() / 1000);
  const yazi = (await env.KAYIT.get(`yazi:${kod}`, "json")) || {};
  if (d.renkler) Object.assign(yazi, { renkler: d.renkler, renkEmin: d.renkler.length > 0, renkNotu: "" });
  if ("kumas" in d) yazi.kumas = d.kumas;
  if (d.durum) yazi.durum = d.durum;
  if (d.en) yazi.en = d.en;
  if (d.fr) yazi.fr = d.fr;
  await env.KAYIT.put(`yazi:${kod}`, JSON.stringify(yazi));
  const tur = await env.KAYIT.get("tur", "json");
  const oge = tur && tur.yeni && String(tur.no) === String(bekleyen.no) && tur.ogeler[kod];
  if (!oge || !oge.paket || oge.karar) {
    await yaz(bekleyen.no === "-" ? `✅ ${kod} güncellendi. Şimdi /paylas ${kod} yazın.` : `✅ ${kod} kaydı güncellendi (bir sonraki paylaşımda kullanılır). Bu turdaki önizleme artık açık değil.`);
    return true;
  }
  const p = oge.paket;
  oge.paket = { ...p, renkler: yazi.renkler || p.renkler, renkEmin: Boolean(yazi.renkEmin), renkNotu: yazi.renkNotu || "", kumas: yazi.kumas || null, durum: yazi.durum || p.durum, en: yazi.en || p.en, fr: yazi.fr || p.fr };
  const kim = kisiAdi(msg.from);
  for (const [kisi, mesajId] of oge.mesajlar) await telegram(env, "editMessageText", { chat_id: kisi, message_id: mesajId, text: `${kontrolMetni(p, simdi)}\n\n✏️ ${kim} düzeltti — yeni önizleme aşağıda.` });
  oge.mesajlar = [];
  await env.KAYIT.put("tur", JSON.stringify(tur));
  const bicim = (await env.KAYIT.get("bicim")) || "album";
  const yeniMesajlar = [];
  for (const kisi of onizleyenler(env)) {
    const g = await yeniParcaIsle(env, { kisi, no: tur.no, bicim, ogeler: [{ paket: oge.paket }], simdi });
    for (const [, id] of g.gonderilen) yeniMesajlar.push([kisi, id]);
  }
  const guncel = await env.KAYIT.get("tur", "json");
  if (guncel && guncel.no === tur.no && guncel.ogeler[kod]) {
    guncel.ogeler[kod].mesajlar = [...(guncel.ogeler[kod].mesajlar || []), ...yeniMesajlar];
    await env.KAYIT.put("tur", JSON.stringify(guncel));
    if (guncel.ogeler[kod].dalga) await topluGuncelle(env, guncel, guncel.ogeler[kod].dalga, simdi);
  }
  return true;
}

// 6 Kasım (Patron): modelin bu rengi kanala İLK kez mi gidiyor? (site defteri renkleri + kanal renk geçmişi "kemal:kanalRenkleri")
export async function yeniRenkMi(env, kod, renk) {
  const en = renkIngilizce(renk);
  if (!en) return false;
  const d = await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null);
  const m = d && d.modeller && d.modeller[String(kod)];
  const siteRenk = ((m && m.renkler) || []).map((r) => renkIngilizce(r) || String(r).toLowerCase());
  const kanal = ((await env.KAYIT.get("kemal:kanalRenkleri", "json").catch(() => null)) || {})[String(kod)] || [];
  return !siteRenk.includes(en) && !kanal.includes(en);
}
async function kanalRenkKaydet(env, kod, renkler) {
  if (!(renkler || []).length) return;
  const h = (await env.KAYIT.get("kemal:kanalRenkleri", "json").catch(() => null)) || {};
  h[String(kod)] = [...new Set([...(h[String(kod)] || []), ...renkler.map((r) => String(r).toLowerCase())])];
  await env.KAYIT.put("kemal:kanalRenkleri", JSON.stringify(h)).catch(() => null);
}
// 6 Kasım (günlük akış denemesi, 09:30): sitedeki bir model için GERÇEK kart hazırlanır + Venom kontrolü, GÖNDERİLMEZ (yapay zekâ yok)
export async function akisDenemesi(env, simdi = Math.floor(Date.now() / 1000)) {
  const site = (await siteUrunleriAl(env)).filter((u) => !u.gizli);
  let u = null;
  for (const x of site.slice(0, 40)) if (await env.KAYIT.get(`yazi:${x.kod}`)) { u = x; break; } // yazısı hazır olan (yapay zekâ çağrılmaz)
  if (!u) return { ok: false, sorun: "akış denemesi: yazısı hazır model bulunamadı" };
  const paket = await paketHazirla(env, u, await durumBaglami(env, [String(u.kod)], simdi), simdi);
  const k = await kanalKontrol(env, paket, { simdi });
  const tekrar = k.sorunlar.every((x) => /zaten paylaşıldı/.test(x)); // deneme için tekrar uyarısı sorun sayılmaz
  return { ok: k.ok || tekrar, bilgi: `akış denemesi: ${u.kod} kartı hazırlandı, ${k.ok || tekrar ? "kontrol tamam" : k.satir} (gönderilmedi)`, sorun: k.ok || tekrar ? null : `akış denemesi ${u.kod}: ${k.sorunlar.join("; ")}` };
}
// 6 Kasım (Patron): Venom kontrolü durdurduysa Patron'a kısa sebep (tek kapı açıkken Venom'dan gelir)
// 9 Kasım (Patron): düzeltemediğim (marka belirsiz, fotoğraf yok…) Hemra'ya ve Merdan'a gider; Patron'a sadece akşam sayısı.
// "Bugün zaten paylaşıldı" bir iş değildir: kimseye mesaj yok, sadece kayıt.
async function kontrolBildir(env, kod, kontrol, simdi) {
  await engelKaydet(env, "kemal", kod, kontrol.sorunlar, simdi);
  await defterIs(env, "kemal", `Venom kontrolü durdurdu: ${kontrol.sorunlar.join("; ").slice(0, 150)}`, { kod });
  const is = kontrol.sorunlar.filter((x) => !/zaten paylaşıldı/.test(x));
  if (!is.length) return;
  for (const kisi of yeniModelAlicilar(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: `🛑 Venom kontrolü — ${kod} kanala GİTMEDİ (kendim düzeltemedim):\n• ${is.join("\n• ")}\nDüzeltip Kemal'e "${kod} paylaş" yazabilirsiniz.` }).catch(() => null);
}
// 9 Kasım (Patron: "Venom hatayı kendisi düzeltsin"): açıklamadaki başka renk kelimesi çıkarılır, eksik EN/FR siteden tamamlanır,
// yapay zekâ kolajı/infografik albümden çıkarılır → kontrol bir kez daha. Düzeltilenler KV "venom:kontrol:duzeltme" (akşam sayısı).
const KOLAJ_AD = /kolaj|collage|infografik|infographic|^detay\s*\d+$/i;
export async function kendiDuzelt(env, paket, kontrol, { renk = null, simdi = Math.floor(Date.now() / 1000) } = {}) {
  if (!kontrol || kontrol.ok) return { paket, kontrol, notlar: [] };
  let p = { ...paket };
  const notlar = [], var_ = (re) => kontrol.sorunlar.some((x) => re.test(x));
  if (var_(/EN\/FR açıklama eksik/)) {
    const u = (await siteUrunleriAl(env).catch(() => [])).find((x) => String(x.kod) === String(p.kod));
    const ilk = (t) => { const x = String(t || "").split(/(?<=[.!?])\s+/)[0].trim(); return x.length > 160 ? `${x.slice(0, 157).replace(/\s+\S*$/, "")}…` : x; };
    const en = p.en || (u && u.aciklama && ilk(u.aciklama.en)) || "", fr = p.fr || (u && u.aciklama && ilk(u.aciklama.fr)) || "";
    if (en !== p.en || fr !== p.fr) { p = { ...p, en, fr }; notlar.push("eksik EN/FR siteden tamamlandı"); }
  }
  if (var_(/başka renk geçiyor/) || (notlar.length && (p.renkler || []).length)) {
    const en = baskaRenkSil(p.en, p.renkler, "en"), fr = baskaRenkSil(p.fr, p.renkler, "fr");
    if (en !== p.en || fr !== p.fr) { p = { ...p, en, fr }; notlar.push("açıklamadaki başka renk kelimesi çıkarıldı"); }
  }
  if (var_(/kolaj/)) {
    const adlar = p.adlar || [];
    const medya = (p.medya || []).filter((m) => !KOLAJ_AD.test(String(m.media || "")) && !KOLAJ_AD.test(String(m.ad || "")));
    if (medya.length !== (p.medya || []).length || adlar.some((a) => KOLAJ_AD.test(a))) { p = { ...p, medya, adlar: adlar.filter((a) => !KOLAJ_AD.test(a)) }; notlar.push("yapay zekâ kolajı albümden çıkarıldı"); }
  }
  if (!notlar.length) return { paket, kontrol, notlar };
  const k2 = await kanalKontrol(env, p, { renk, simdi });
  const l = (await env.KAYIT.get("venom:kontrol:duzeltme", "json").catch(() => null)) || [];
  await env.KAYIT.put("venom:kontrol:duzeltme", JSON.stringify([...l, { zaman: simdi, kod: String(p.kod), notlar, ok: k2.ok }].slice(-60)), { expirationTtl: 7 * 86400 }).catch(() => null);
  await defterIs(env, "kemal", `kendim düzelttim: ${notlar.join("; ")}`, { kod: String(p.kod) });
  return { paket: p, kontrol: { ...k2, satir: k2.ok ? `✅ Venom kontrolü tamam (kendim düzelttim: ${notlar.join("; ")})` : k2.satir }, notlar };
}
// Sıradaki yeni düzen paylaşımı: stok hâlâ varsa kanala gönderir; tarih Sami'nin deposuna (tablo) yazılır.
// sayma: günlük 10 paylaşım sayacına dahil mi (repete paylaşımı dahil değil); stokKontrol: repete'de Vegawin gecikebilir → kapalı.
// 5 Kasım (Patron): Kemal kanala video koyunca aynı video siteye de (Selin, StokDO kuyruğu "kanalVideo"). Videosu zaten siteden
// gelenler (Selin oynatıcısı) gönderilmez; Selin de aynı videoyu (file_unique_id) iki kez koymaz.
async function siteyeVideoBildir(env, kod, mesajlar, simdi, ek = {}) {
  if (!env.STOK || !mesajlar.length) return;
  await kuyrugaEkle(env, "kanalVideo", { id: `kv-${kod}-${mesajlar[0]}`, kod: String(kod), mesajlar: mesajlar.slice(0, 10), zaman: simdi, ...ek }).catch(() => null);
}
export async function yeniKanalaPaylas(env, paket, simdi, { sayma = true, stokKontrol = true, siteVideo = true, renk = null, onayliSorunlar = null, zamanli = false, kim = null } = {}) {
  if (await durdurulduMu(env, "kemal")) return { ok: false, hata: await durMesaji(env, "kemal"), durduruldu: true };
  if (((await env.KAYIT.get("silme:onayli", "json").catch(() => null)) || {})[String(paket.kod)]) return { ok: false, hata: `${paket.kod} için silme onaylandı; kanala paylaşılmaz` }; // 12 Kasım
  if ((!zamanli && !(await yayinKapisi(env, simdi)).acik) || !(await kesinKapi(env, simdi)).acik) return yayiniErtele(env, { kod: String(paket.kod), yeni: true, paket, kim: kim || "onaylı", secenek: { sayma: false, stokKontrol, siteVideo, renk, onayliSorunlar } }, simdi);
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  // 6 Kasım: VENOM KONTROLÜ — yanlışsa yayına çıkmaz. Patron (ya da onaylayan) ⚠️'li kartı gördüyse o sorunlar geçer; yeni çıkan sorun durdurur.
  const ilkKontrol = await kanalKontrol(env, paket, { renk, simdi });
  const d = await kendiDuzelt(env, paket, ilkKontrol, { renk, simdi }); // 9 Kasım: düzeltilebileni kendisi düzeltir
  paket = d.paket;
  const kontrol = d.kontrol;
  const yeniSorun = kontrol.sorunlar.filter((x) => !(onayliSorunlar || []).some((y) => y.split(":")[0] === x.split(":")[0] || (/zaten paylaşıldı/.test(x) && /zaten paylaşıldı/.test(y))));
  if (yeniSorun.length) { await kontrolBildir(env, paket.kod, { ...kontrol, sorunlar: yeniSorun }, simdi); return { ok: false, hata: `Venom kontrolü: ${yeniSorun.join("; ")}`, kontrol: true }; }
  if (env.STOK && stokKontrol) {
    const st = (await stokIste(env, "/toplu", { kodlar: [paket.kod] }).catch(() => ({})))[paket.kod];
    if (st && (st.gizli || !(st.toplam > 0))) return { ok: false, hata: "stoğu bitti (Sami'ye göre) — paylaşılmadı", stoksuz: true };
  }
  const bicim = (await env.KAYIT.get("bicim")) || "album";
  const g = await paketGonder(env, kanal.id, paket, bicim);
  if (!g.ok) {
    const ipucu = /rights|admin|not enough|forbidden/i.test(g.hata || "") ? " — botun kanalda \"Mesaj gönderme\" yetkisi açık mı?" : "";
    return { ok: false, hata: `${g.hata}${ipucu}` };
  }
  const sonpaylasim = (await env.KAYIT.get("sonpaylasim", "json")) || {};
  sonpaylasim[paket.kod] = simdi;
  await dizineEkle(env, paket.kod, (g.ids || []).filter((id) => id > 0), simdi).catch(() => null); // 10 Kasım: geri alma / silme doğru mesaj numarasını bulsun
  await defterIs(env, "kemal", "kanala paylaşıldı", { kod: paket.kod });
  await defterSatir(env, "kemal", { id: `kemal:kanal:${paket.kod}`, tur: "kanal", kod: String(paket.kod), ne: "Kanal paylaşımı", kim: "Kemal", durum: "bitti", bot: "kemal", guncel: simdi, kanit: `kanala paylaşıldı${(g.ids || []).filter((id) => id > 0).length ? ` (mesaj ${(g.ids || []).filter((id) => id > 0)[0]})` : ""}` }); // 12 Kasım: TEK DEFTER — kanıtla kapanır
  await env.KAYIT.put("sonpaylasim", JSON.stringify(sonpaylasim));
  if (env.STOK) await stokIste(env, "/tg-yaz", { kayitlar: { [paket.kod]: simdi } }).catch(() => null);
  if (sayma) await env.KAYIT.put(`sayac:${gunAnahtari(simdi)}`, String((await turSayac(env, simdi)) + 1), { expirationTtl: 3 * 86400 });
  await gecmisKaydet(env, String(paket.kod), (paket.renkler || []).join(","), simdi);
  await kanalRenkKaydet(env, paket.kod, paket.renkler);
  if (siteVideo && !g.not) {
    const vid = (paket.medya || []).map((m, i) => (m.type === "video" && !String(m.media).startsWith(VIDEO_SUNUCU) ? g.ids[i] : 0)).filter((id) => id > 0);
    await siteyeVideoBildir(env, paket.kod, vid, simdi);
  }
  const ilk = g.ids.find((id) => id > 0);
  return { ok: true, ids: g.ids, kanal: kanal.kullanici || null, link: kanal.kullanici && ilk ? `https://t.me/${kanal.kullanici}/${ilk}` : null, markaNotu: g.not || null };
}

// ---------- REPETE PAYLAŞIMI (kullanıcı kararı 30 Ekim) ----------
// Hemra, Murat ya da Merdan: "/repete 3394", "3394 repete geldi", "3394, 3490 repete geldi" (tek kodda renk de yazılabilir:
// "3394 repete geldi siyah 10 bej 6"). Medya önce siteden, yoksa kanaldaki son paylaşımdan (yazısı/fiyatı değil). Alt yazı yeni
// düzende "🔁 BACK IN STOCK / DE RETOUR". Önizleme Hemra'ya (ve yazana): ✅ Onayla / ✏️ Düzelt / ❌ İptal. Onayla → sıra beklemeden
// hemen kanala, günlük 10'a sayılmaz; Telegram son paylaşım tarihi tabloya yazılır. Medya yoksa paylaşılmaz, söylenir.
const REPETE_EN_FAZLA = 5;
const repeteYetkili = (env, id) => izinliMi(id, env) || String(id) === hemraId(env);
export function repeteAyikla(metin) {
  const t = String(metin || "").trim();
  let m = t.match(/^\/repete(?:@\w+)?\s+(.+)$/is);
  let kodYazi = m ? m[1] : null;
  let ek = "";
  if (!m) {
    m = t.match(/^((?:\d{4,6}[\s,;]*(?:ve\s+)?)+?)\s*(?:repete\s+)?(?:geldi|gelmiş|geldı)\b(.*)$/is);
    if (!m || !/repete|geldi/i.test(t)) return null;
    kodYazi = m[1];
    ek = m[2] || "";
  }
  const kodlar = [...new Set((kodYazi.match(/\b\d{4,6}\b/g) || []))].slice(0, REPETE_EN_FAZLA);
  if (!kodlar.length) return null;
  // Tek kodda yazılan renkler (Türkçe) → İngilizceye çevrilebilirse alt yazıya
  const renkler = kodlar.length === 1 ? [...(m && ek ? ek : kodYazi.replace(/\b\d{4,6}\b/g, "")).matchAll(/([a-zçğıöşü][a-zçğıöşü\s-]*?)\s*(\d{1,3})\b/gi)].map((r) => ({ renk: r[1].trim().toLocaleLowerCase("tr"), adet: Number(r[2]) })).filter((r) => r.renk && !/repete|geldi/.test(r.renk)) : [];
  return { kodlar, renkler };
}

const repeteKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `rp1:${id}` }, { text: "✏️ Düzelt", callback_data: `rpd:${id}` }, { text: "❌ İptal", callback_data: `rpx:${id}` }]] });
const repeteAlicilar = (env, kim) => (kimlikler(env.MURAT_ID).includes(String(kim)) ? yeniModelAlicilar(env) : [...new Set([hemraId(env), String(kim)])]);
// 6 Kasım (Patron): Selin'in siteye eklediği modellerin "kanalda paylaşayım mı?" kartı SADECE Merdan ve Hemra'ya
const yeniModelAlicilar = (env) => { const patronlar = kimlikler(env.MURAT_ID); return [...new Set([...kimlikler(env.ALLOWED_IDS).filter((x) => !patronlar.includes(x)), hemraId(env)].filter(Boolean))]; };
// 10 Kasım (Patron): marka ayrımı — Merdan'a SADECE Black Rose; VOLONTE kartı Hemra'ya (marka belirsizse de sadece Hemra)
const merdanId = (env) => kimlikler(env.BR_SORUMLU)[0] || "";
const markaKisiMi = (env, kisi, marka) => String(kisi) !== String(merdanId(env)) || !merdanId(env) || marka === "BLACKROSE";
const alicilarMarka = (env, marka) => yeniModelAlicilar(env).filter((k) => markaKisiMi(env, k, marka));
// Kart = TEK mesaj: resim (ya da video) + altında yazı + düğmeler. Yazı 1024'ü aşarsa kanal yazısı kısaltılır (üst satırlar kalır).
export async function tekKartGonder(env, kisi, paket, ust, klavye, sec = {}) {
  const medya = (paket && paket.medya) || [];
  const ilk = (sec.videoOnce && medya.find((m) => m.type === "video")) || medya.find((m) => m.type === "photo") || medya[0];
  const kanalYazi = duzMetinYazi(altYazi(paket));
  const tam = `${ust}\n───\n${kanalYazi}`;
  const cap = tam.length <= 1024 ? tam : `${ust.slice(0, 700)}\n───\n${kanalYazi.slice(0, Math.max(0, 1024 - Math.min(ust.length, 700) - 6))}…`.slice(0, 1024);
  let r = ilk ? await telegram(env, ilk.type === "video" ? "sendVideo" : "sendPhoto", { chat_id: kisi, [ilk.type === "video" ? "video" : "photo"]: ilk.media, caption: cap, reply_markup: klavye }) : null;
  if (r && r.ok) return { ...r, tur: "foto" };
  r = await telegram(env, "sendMessage", { chat_id: kisi, text: `${tam}`.slice(0, 4000), reply_markup: klavye, disable_web_page_preview: true });
  return { ...r, tur: "metin" };
}
// Kartın yazısını değiştir (resimli kartta alt yazı, yazılı kartta metin); düğmeler kalkar
async function kartYazisi(env, kisi, mesaj, metin, klavye = { inline_keyboard: [] }) {
  const r = await telegram(env, "editMessageCaption", { chat_id: kisi, message_id: mesaj, caption: String(metin).slice(0, 1024), reply_markup: klavye }).catch(() => null);
  if (r && r.ok) return r;
  return telegram(env, "editMessageText", { chat_id: kisi, message_id: mesaj, text: String(metin).slice(0, 4000), reply_markup: klavye, disable_web_page_preview: true }).catch(() => null);
}
const yeniKlavye4 = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `rp1:${id}` }, { text: "✏️ Düzelt", callback_data: `rpd:${id}` }], [{ text: "⏭️ Geç", callback_data: `rpx:${id}` }, { text: "⏳ Beklesin", callback_data: `rpb:${id}` }]] });
async function yeniModelSay(env, ne, simdi) {
  const k = `venom:yeniModelSayac:${gunAnahtari(simdi)}`, v = (await env.KAYIT.get(k, "json").catch(() => null)) || {};
  v[ne] = (v[ne] || 0) + 1;
  await env.KAYIT.put(k, JSON.stringify(v), { expirationTtl: 3 * 86400 }).catch(() => null);
}

async function repeteOnizlemeGonder(env, rec) {
  const bicim = (await env.KAYIT.get("bicim")) || "album";
  const simdi = Math.floor(Date.now() / 1000);
  rec.mesajlar = [];
  for (const kisi of rec.alicilar.filter((k) => markaKisiMi(env, k, rec.paket && rec.paket.marka))) { // 10 Kasım: Merdan'a sadece Black Rose
    const t = await tekKartGonder(env, kisi, rec.paket, repeteKontrol(rec, simdi), rec.tur === "yeni" ? yeniKlavye4(rec.id) : repeteKlavye(rec.id)); // tek mesaj
    if (t.ok) { rec.mesajlar.push([kisi, t.result.message_id]); continue; }
    const g = { ok: false, hata: t.description || "?" };
    if (!g.ok) { await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ ${rec.kod} önizlemesi gönderilemedi: ${g.hata}` }); continue; }
    const k = await telegram(env, "sendMessage", { chat_id: kisi, text: repeteKontrol(rec, simdi) + (g.not ? `\n⚠️ ${g.not}` : ""), reply_markup: rec.tur === "yeni" ? yeniKlavye4(rec.id) : repeteKlavye(rec.id), disable_web_page_preview: true });
    if (k.ok) rec.mesajlar.push([kisi, k.result.message_id]);
  }
}
const repeteKontrol = (rec, simdi) => [
  rec.kontrolSatir || null, // 6 Kasım: Venom kontrolü en üstte
  rec.yenirenk ? `🎨 YENİ RENK — ${rec.kod} · ${rec.yenirenk} (Kemal sitede fark etti; kanalda bu renk hiç paylaşılmadı)` : rec.tur === "yeni" ? `🆕 YENİ MODEL — ${rec.kod} (siteye ekleyen: ${rec.kim})` : `🔁 Repete paylaşımı — ${rec.kod} (${rec.kim} bildirdi)`,
  `Medya: ${rec.kaynak === "site" ? "siteden" : "kanaldaki son paylaşımdan (eski yazı kullanılmadı)"}`,
  `Renkler: ${rec.paket.renkEmin && rec.paket.renkler.length ? rec.paket.renkler.join(", ") : "yazılmadı, kanal yazısında renk satırı yok (✏️ Düzelt ile ekleyebilirsiniz)"}`,
  rec.stokUyari ? `⚠️ ${rec.stokUyari}` : null,
  `Telegram'da son paylaşım: ${rec.paket.tgSon ? tarihUzun(rec.paket.tgSon) : "—"}`,
  rec.tur === "yeni" ? "✅ Onayla → hemen kanala · ⏭️ Geç → paylaşılmaz · ⏳ Beklesin → 3 gün sonra yeniden sorulur. Fiyat yazılmaz." : "✅ Onayla → sıra beklemeden hemen kanala (günlük 10'a sayılmaz). Fiyat yazılmaz.",
].filter(Boolean).join("\n");

export async function repeteIstegi(msg, env, { kodlar, renkler }) {
  const simdi = Math.floor(Date.now() / 1000);
  const kim = kisiAdi(msg.from);
  const alicilar = repeteAlicilar(env, msg.chat.id);
  await telegram(env, "sendChatAction", { chat_id: msg.chat.id, action: "upload_photo" });
  for (const kod of kodlar) {
    if (indirimliMi(kod)) { // indirimli mal (2000) ana kanalda paylaşılmaz (ileride BR/VL DISCOUNT kanalı)
      await telegram(env, "sendMessage", { chat_id: msg.chat.id, text: `⚠️ ${kod} indirimli mal kodu — ana kanalda repete paylaşılmaz.` });
      continue;
    }
    let paket;
    try { paket = await repetePaketi(env, { kod, renkler: kodlar.length === 1 ? renkler : [] }, simdi); } catch (e) {
      for (const k of alicilar) await telegram(env, "sendMessage", { chat_id: k, text: /bulunamadı|medya/i.test(e.message) ? `⚠️ ${kod} için fotoğraf/video bulunamadı — paylaşılmadı.` : `⚠️ ${kod} hazırlanamadı: ${kisaHata(e)}` });
      continue;
    }
    const st = env.STOK ? (await stokIste(env, "/toplu", { kodlar: [kod] }).catch(() => ({})))[kod] : null;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const rec = { id, kod, paket, kim, kimId: msg.from.id, alicilar, kaynak: paket.kaynak, stokUyari: st && !(st.toplam > 0) ? "Vegawin'de stok henüz 0 görünüyor (giriş yapılmamış olabilir)" : null, durum: null, zaman: simdi };
    await repeteOnizlemeGonder(env, rec);
    await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 5 * 86400 });
    await yeniModelSay(env, "soruldu", simdi);
  }
}

async function repeteDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, id] = String(cq.data).split(":");
  const rec = await env.KAYIT.get(`rpt:${id}`, "json");
  if (!repeteYetkili(env, cq.from.id)) return cevapla("Bu onay Merdan ve Hemra'da.");
  if (!rec || rec.durum) return cevapla(rec ? `${rec.karar || "Karar"} verildi.` : "Bu önizleme artık geçerli değil.");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const hepsi = async (ek) => { for (const [k, m] of rec.mesajlar) await kartYazisi(env, k, m, `${repeteKontrol(rec, simdi)}\n\n${ek}`); };
  if (islem === "rpd") {
    await env.KAYIT.put(`duzelt:${cq.from.id}`, JSON.stringify({ no: "r", id }), { expirationTtl: 3600 });
    await cevapla("Düzeltmeyi yazın");
    return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${rec.kod} ${rec.tur === "yeni" ? "yeni model" : "repete"} paylaşımı için düzeltmeyi yazın (1 saat içinde).\n${DUZELT_ORNEK.replace("durum: new | back | best | last | available\n", "")}` });
  }
  if (islem === "rp1" && (await durdurulduMu(env, "kemal"))) return cevapla("⛔ Şu an durduruldu; açılınca onaylayın.");
  rec.durum = islem;
  rec.karar = `${kim}: ${islem === "rp1" ? "onayla" : islem === "rpb" ? "beklesin" : rec.tur === "yeni" ? "geç" : "iptal"}`;
  await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 5 * 86400 }); // önce kilitle
  if (islem === "rpb") { // 6 Kasım: 3 gün sonra aynı kişilere yeniden sorulur
    const sira = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
    await env.KAYIT.put("venom:yeniModel", JSON.stringify([...sira.filter((x) => String(x.kod) !== rec.kod), { kod: rec.kod, kim: rec.kim, zaman: simdi, sonra: simdi + 3 * 86400, bekleme: (rec.bekleme || 0) + 1 }]));
    await yeniModelSay(env, "beklesin", simdi);
    await cevapla("3 gün sonra tekrar");
    return hepsi(`⏳ ${kim}: beklesin — 3 gün sonra yeniden sorulacak.`);
  }
  if (islem === "rpx") { if (rec.tur === "yeni") await yeniModelSay(env, "gec", simdi); await cevapla(rec.tur === "yeni" ? "Geçildi" : "İptal"); return hepsi(`${rec.tur === "yeni" ? "⏭️" : "❌"} ${kim} ${rec.tur === "yeni" ? "geçti" : "iptal etti"} — kanalda paylaşılmadı.`); }
  await cevapla("Paylaşılıyor");
  const p = await yeniKanalaPaylas(env, rec.paket, simdi, { sayma: false, stokKontrol: false, onayliSorunlar: rec.kontrolSorunlar || [] });
  if (rec.tur === "yeni") await yeniModelSay(env, p.ok ? "onay" : "durdu", simdi);
  if (p.ertelendi) return hepsi(`✅ ${kim} onayladı. ${ertelemeMetni(p, rec.kod)}`);
  return hepsi(p.ok ? `✅ ${kim} onayladı — kanalda paylaşıldı${p.link ? `: ${p.link}` : ""}. Telegram son paylaşım tarihi güncellendi.${p.markaNotu ? ` ⚠️ ${p.markaNotu}` : ""}` : `⚠️ Paylaşılamadı: ${p.hata}`);
}

async function repeteDuzelt(msg, env, id, d) {
  const rec = await env.KAYIT.get(`rpt:${id}`, "json");
  const yaz = (text) => telegram(env, "sendMessage", { chat_id: msg.chat.id, text });
  if (!rec || rec.durum) { await yaz("Bu repete önizlemesi artık açık değil."); return true; }
  const p = rec.paket;
  if (d.renkler) Object.assign(p, { renkler: d.renkler, renkEmin: d.renkler.length > 0, renkNotu: "" });
  if ("kumas" in d) p.kumas = d.kumas;
  if (d.en) p.en = d.en;
  if (d.fr) p.fr = d.fr;
  p.durum = rec.tur === "yeni" ? "yeni" : "donus";
  const yazi = (await env.KAYIT.get(`yazi:${rec.kod}`, "json")) || {};
  if (d.renkler) Object.assign(yazi, { renkler: d.renkler, renkEmin: d.renkler.length > 0, renkNotu: "" });
  if ("kumas" in d) yazi.kumas = d.kumas;
  if (d.en) yazi.en = d.en;
  if (d.fr) yazi.fr = d.fr;
  await env.KAYIT.put(`yazi:${rec.kod}`, JSON.stringify(yazi));
  const simdi = Math.floor(Date.now() / 1000);
  for (const [k, m] of rec.mesajlar) await telegram(env, "editMessageText", { chat_id: k, message_id: m, text: `${repeteKontrol(rec, simdi)}\n\n✏️ ${kisiAdi(msg.from)} düzeltti — yeni önizleme aşağıda.` });
  await repeteOnizlemeGonder(env, rec);
  await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 3 * 86400 });
  return true;
}

// ---------- Fotoğraf tanıma: katalog ve tanıma ----------

// Kuzey Amerika'ya sabit nesne: katalog adımı (Anthropic 403 sorunu) ve tepki sayıları
// (sık yazıldığı için KV'nin günlük 1000 yazma sınırını harcamasın diye kendi deposunda).
// ---------- Sayım Sami: Vegawin stok köprüsü (stok.js) ----------

async function stokGizliler(env) {
  if (!env.STOK) return [];
  try { return await stokIste(env, "/gizliler"); } catch { return []; }
}

// Köprüden gelen değişiklikler. Her mağazanın kendi gizli anahtarı var: KOPRU_<MAĞAZA> (secret).
async function kopruAl(request, env) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !env.STOK || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const govde = await request.json().catch(() => null);
  if (!govde || !Array.isArray(govde.urunler) || govde.urunler.length > 2000) return new Response("geçersiz", { status: 400 });
  const simdi = Math.floor(Date.now() / 1000);
  // "0" ile başlayan kodlar (ör. 000000, 001 TEKLEME, 0002 TRS) model değil, iç kart: alınmaz.
  const urunler = govde.urunler.filter((u) => !/^0/.test(stokKodu(u.kod)))
    .map((u) => (u.yok ? { kod: stokKodu(u.kod), yok: true } : { kod: stokKodu(u.kod), ad: u.ad, adet: Number(u.adet) || 0, fiyat: u.fiyat == null ? null : Number(u.fiyat), celal: u.celal === true, ikiKart: u.ikiKart === true, brAdet: u.brAdet == null ? null : Number(u.brAdet) }));
  const sonuc = await stokIste(env, "/yaz", { magaza, urunler, simdi });
  if (sonuc.yeniSoru && env.BOT_TOKEN) await stokSorulariGonder(env, simdi);
  return Response.json({ ok: true, ...sonuc });
}

// ---------- Fabrika: repete paylaşımı ve "Sil" kararı (Sami'den, 29 Ekim) ----------
// Sami "venom:repetePaylas" sırasına repete gelen modeli koyar → Kemal önizlemeyi Murat'a ve Hemra'ya gönderir
// ("Paylaşılsın mı? Onayla / Bekle"); onaylanınca yeni düzende "🔁 BACK IN STOCK" olarak paylaşılır (fiyat yok; medya siteden,
// sitede yoksa en yeni kanal paylaşımının medyası). DENEMEDE kanalda ASLA paylaşılmaz.
// "venom:kanalSil": fabrika bitti + Murat/Hemra "Sil" (ikinci onaylı) → kanaldaki paylaşımlar silinir.
// Yeni model (Selin siteye ekledi): sıra beklemeden önizleme SADECE Patron'a, "🆕 YENİ MODEL"; ✅ → hemen kanala,
// günlük 10'a sayılmaz, son paylaşım tarihi güncellenir; Vegawin'de stok yoksa uyarı (engel değil). 2000 hariç, fiyat yok.
// Site listesi henüz güncellenmediyse (GitHub birkaç dakika) sonraki turda yeniden denenir (en fazla 12 kez).
export async function yeniModelIsleri(env, simdi) {
  const sira = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
  if (!sira.length) return;
  const site = await siteUrunleriAl(env);
  const islenen = new Set();
  const tekrar = {};
  const hataTekrar = {};
  for (const r of sira.filter((x) => !(x.sonra > simdi)).slice(0, 3)) { // "⏳ Beklesin" denenler 3 gün sonra
    islenen.add(r.kod);
    if (indirimliMi(r.kod)) continue;
    const u = site.find((x) => String(x.kod) === String(r.kod) && !x.gizli);
    if (!u) { if ((r.deneme || 0) < 12) tekrar[r.kod] = (r.deneme || 0) + 1; continue; }
    let paket;
    try { paket = { ...(await paketHazirla(env, u, await durumBaglami(env, [String(r.kod)], simdi), simdi, r.yenirenk ? { durum: "yenirenk", renk: r.yenirenk } : { durum: "yeni" })), kaynak: "site" }; } catch (e) {
      // Geçici hata (indirme/zaman aşımı/yoğunluk): sessizce sonraki turlarda tekrar (en fazla 3 tur); olmazsa Patron'a kısa Türkçe
      await env.KAYIT.put("kemal:sonHata", JSON.stringify({ zaman: simdi, kod: r.kod, hata: String(e && e.message).slice(0, 500) }), { expirationTtl: 7 * 86400 });
      if (gecici(e) && (r.hataTur || 0) < 3) { hataTekrar[r.kod] = (r.hataTur || 0) + 1; continue; }
      for (const kisi of alicilarMarka(env, null)) await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ 🆕 ${r.kod} yeni model önizlemesi hazırlanamadı: ${kisaHata(e)}. Tekrar denemek için Kemal'e "${r.kod} yeni model tekrar" yazın.` });
      continue;
    }
    const st = env.STOK ? (await stokIste(env, "/toplu", { kodlar: [String(r.kod)] }).catch(() => ({})))[String(r.kod)] : null;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const d0 = await kendiDuzelt(env, paket, await kanalKontrol(env, paket, { simdi }).catch(() => null), { simdi }).catch(() => ({ paket, kontrol: null }));
    paket = d0.paket;
    const kontrol = d0.kontrol;
    const rec = { id, tur: "yeni", yenirenk: r.yenirenk || null, kod: String(r.kod), paket, kim: r.kim || "Selin", alicilar: yeniModelAlicilar(env), kaynak: "site", durum: null, zaman: simdi, kontrolSatir: kontrol ? kontrol.satir : null, kontrolSorunlar: kontrol ? kontrol.sorunlar : [], bekleme: r.bekleme || 0,
      stokUyari: !st ? "Vegawin'de bu modelin stok kaydı henüz görünmüyor (giriş yapılmamış olabilir) — paylaşım engellenmez, karar sizin" : !(st.toplam > 0) ? "Vegawin'de stok henüz 0 görünüyor (giriş yapılmamış olabilir) — paylaşım engellenmez, karar sizin" : null };
    await repeteOnizlemeGonder(env, rec);
    await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 3 * 86400 });
  }
  // Bu arada Selin yeni model eklemiş olabilir: güncel kuyruğu okuyup sadece işlenenleri çıkar
  const guncel = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
  await env.KAYIT.put("venom:yeniModel", JSON.stringify(guncel.flatMap((x) => (!islenen.has(x.kod) ? [x] : tekrar[x.kod] ? [{ ...x, deneme: tekrar[x.kod] }] : hataTekrar[x.kod] ? [{ ...x, hataTur: hataTekrar[x.kod] }] : []))));
}

// ---------- PELİN TESLİM (4 Kasım, Patron onayı): Pelin'de "✅ Onayla" denen video → kanal (Kemal) → site (Selin) ----------
// Kuyruk StokDO "pelinKanal" (ekle/al tek adım → iki kez paylaşılmaz). DENEME işaretliler HİÇ gitmez. Fiyat yok (yeni düzen alt yazısı).
export async function pelinKanalAdimi(env, simdi) {
  const isler = await kuyruguAl(env, "pelinKanal");
  for (const x of isler) {
    const bildir = async (text) => { for (const kisi of [hemraId(env)].filter(Boolean)) await telegram(env, "sendMessage", { chat_id: kisi, text, disable_web_page_preview: true }); }; // 10 Kasım: Patron'a değil Hemra'ya
    try {
      if (x.deneme || !(x.v >= 2)) { await bildir(`🧪 ${x.kod}: deneme video kanala/siteye gönderilmedi (kural).`); continue; }
      const u = (await siteUrunleriAl(env)).find((y) => String(y.kod) === String(x.kod) && !y.gizli);
      if (!u) { await bildir(`⚠️ ${x.kod}: Pelin videosu kanala paylaşılmadı — model sitede yok ya da gizli. Önce siteye eklenmeli.`); continue; }
      // 4 Kasım (Patron): Pelin'deki onay ÜRETİM onayıdır; kanala/siteye gitmeden önce AYRI son yayın onayı (önizleme: video + fotoğraflar + yazı)
      await yayinOnayKarti(env, x, u, simdi);
    } catch (e) {
      await env.KAYIT.put("kemal:pelinTeslimHata", JSON.stringify({ zaman: simdi, kod: x.kod, hata: String(e && e.message).slice(0, 400) }), { expirationTtl: 7 * 86400 });
      await bildir(`⚠️ ${x.kod}: Pelin videosu paylaşılamadı: ${kisaHata(e)}`).catch(() => null);
    }
  }
}

const pelinMedya = (x) => [...(x.video ? [{ type: "video", media: x.video }] : []), ...[x.foto, ...((x.set || []).filter((y) => !KOLAJ_AD.test(String(y.ad || ""))).map((y) => y.url))].filter(Boolean).slice(0, x.video ? 9 : 10).map((m) => ({ type: "photo", media: m }))];
async function yayinOnayKarti(env, x, u, simdi) {
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  const ESKI = env.ESKI_SON_YAYIN === "1" || Boolean(x.patronIstegi); // 10 Kasım görev kâğıdı: kart Patron'a değil Hemra'ya (+ Black Rose ise Merdan), TEK mesaj
  if (!x.marka) x.marka = (await markaKesin(env, String(x.kod)).catch(() => ({}))).marka || null; // 6 Kasım: "?" bırakma
  if (x.renk && x.yeniRenk === undefined) x.yeniRenk = await yeniRenkMi(env, x.kod, x.renk).catch(() => false);
  const paket = await paketHazirla(env, u, await durumBaglami(env, [String(x.kod)], simdi), simdi, { medya: pelinMedya(x), renk: x.renk || null, beden: x.beden || null, durum: x.yeniRenk ? "yenirenk" : null });
  // 4 Kasım (Patron): aynı işe yeni paket gelirse ESKİ kart geçersiz (kart no her pakette yeni; eski mesaj "geçersiz" diye kapatılır)
  const kartNo = `${x.id}.${Number(x.zaman || simdi).toString(36).slice(-5)}`;
  const eskiler = ((await env.KAYIT.list({ prefix: `kemal:pelinYayin:${x.id}` }).catch(() => ({ keys: [] }))).keys || []).map((k) => k.name);
  for (const k of eskiler) {
    const e = await env.KAYIT.get(k, "json").catch(() => null);
    for (const [c, m] of (e && (e.mesajlar || (e.mid ? [[patron, e.mid]] : []))) || []) await kartYazisi(env, c, m, `❌ ${x.kod}: bu SON YAYIN kartı geçersiz — düzeltilmiş paketle yeni kart geldi.`).catch(() => null);
    await env.KAYIT.delete(k);
  }
  const marka = x.marka === "BLACKROSE" ? "BLACK ROSE" : x.marka || "marka belirsiz (Sami'de kayıt yok)";
  const dk = await kendiDuzelt(env, paket, await kanalKontrol(env, { ...paket, adlar: (x.set || []).map((y) => y.ad) }, { renk: x.renk || null, simdi }), { renk: x.renk || null, simdi }); // 9 Kasım: önce kendim düzeltirim
  Object.assign(paket, { en: dk.paket.en, fr: dk.paket.fr });
  const kontrol = dk.kontrol; // 6 Kasım: kartın en üstünde
  // 4 Kasım (Patron önerisi 10): TÜM PAKET TEK ALBÜMDE (video + foto seti + askı ön/arka + detay kolajları), kanal yazısı albümün
  // yazısı olarak — kanala aynen böyle gider; altında TEK onay kartı
  const medya = pelinMedya(x);
  const altyazi = altYazi(paket);
  const yazi = duzMetinYazi(altyazi);
  const klavye = { inline_keyboard: [[{ text: "📣 Kanala ve siteye gönder", callback_data: `py:o:${kartNo}` }, { text: "❌ Gönderme", callback_data: `py:x:${kartNo}` }]] };
  const ust = [kontrol.satir, `📣 SON YAYIN ONAYI — ${x.kod} · ${marka}`, `Kanala ${medya.length} medya tek albüm olarak gider: video + ${medya.filter((m) => m.type === "photo").length} fotoğraf (${["ön", ...(x.set || []).map((y) => y.ad)].join(", ")}). Kanal yazısı aşağıda.`].filter(Boolean).join("\n");
  let kart = null;
  const mesajlar = [];
  if (!ESKI) {
    const vMedya = [...medya.filter((m) => m.type === "video"), ...medya.filter((m) => m.type !== "video")];
    for (const kisi of alicilarMarka(env, x.marka)) {
      const t = await tekKartGonder(env, kisi, { ...paket, medya: vMedya }, ust, klavye, { videoOnce: true });
      if (t.ok) { mesajlar.push([kisi, t.result.message_id]); kart = kart || t; }
    }
  } else {
    const medya = pelinMedya(x);
    const altyazi = altYazi(paket);
    let g = await telegram(env, "sendMediaGroup", { chat_id: patron, media: medya.map((m, i) => (i === 0 ? { ...m, caption: altyazi, parse_mode: "HTML" } : m)) });
    if (!g.ok) {
      await telegram(env, "sendMessage", { chat_id: patron, text: `⚠️ ${x.kod}: albüm tek parça gösterilemedi (${g.description || "?"}); video ve fotoğraflar ayrı geliyor.` });
      await telegram(env, "sendVideo", { chat_id: patron, video: x.video, caption: `🎬 ${x.kod} · ${marka}`, supports_streaming: true });
      const fotolar = medya.filter((m) => m.type === "photo");
      if (fotolar.length > 1) await telegram(env, "sendMediaGroup", { chat_id: patron, media: fotolar });
    }
    const yazi = duzMetinYazi(altyazi);
    const kart = await telegram(env, "sendMessage", { chat_id: patron, disable_web_page_preview: true,
      text: [kontrol.satir, `📣 SON YAYIN ONAYI — ${x.kod} · ${marka}`, `Yukarıdaki albüm kanala AYNEN böyle gider: video ("${marka} · ${x.kod}" sağ altta) + ${medya.filter((m) => m.type === "photo").length} fotoğraf (${["ön", ...(x.set || []).map((y) => y.ad)].join(", ")}) + kanal yazısı.`, "Bu kart onaylanmadan hiçbir şey kanala/siteye gitmez.", "", "Kanal yazısı:", "───", yazi.slice(0, 1500), "───", "Tek onay: Kemal kanala koyar, Selin siteye ekler."].join("\n"),
      reply_markup: { inline_keyboard: [[{ text: "📣 Kanala ve siteye gönder", callback_data: `py:o:${kartNo}` }, { text: "❌ Gönderme", callback_data: `py:x:${kartNo}` }]] } });

  }
  await env.KAYIT.put(`kemal:pelinYayin:${kartNo}`, JSON.stringify({ x, zaman: simdi, mid: ESKI && kart && kart.ok ? kart.result.message_id : null, mesajlar, kontrolSorunlar: kontrol.sorunlar }), { expirationTtl: 14 * 86400 });
  // 5 Kasım (Patron: "tek muhatap Venom"): kart Venom'a da gider; Patron Venom'dan onaylarsa Kemal uygular (önce basılan geçerli)
  if (ESKI && env.STOK && !(await tekKapiAcik(env))) await kuyrugaEkle(env, "venomOnay", { id: `ky-${kartNo}`, tur: "kemalYayin", kartNo, kod: x.kod, marka, yazi: yazi.slice(0, 700), medya: pelinMedya(x).filter((m) => /^https?:\/\//.test(m.media)).slice(0, 10), venomMedya: x.venomMedya || null, zaman: simdi }).catch(() => null);
  return kart;
}
const duzMetinYazi = (html) => String(html || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
// Venom'dan gelen SON YAYIN kararı (StokDO kuyruğu "kemalYayinKarar") → aynı uygulama; sonuç Venom'a ("sonuc" kuyruğu)
export async function venomYayinKararlari(env) {
  for (const k of await kuyruguAl(env, "kemalYayinKarar")) {
    const sonuc = await yayinOnayUygula(env, k.kartNo, k.islem === "o" ? "o" : "x").catch((e) => `⚠️ ${kisaHata(e)}`);
    await kuyrugaEkle(env, "sonuc", { id: `kys-${k.kartNo}-${Date.now()}`, ok: !/^⚠️/.test(sonuc), aciklama: sonuc });
  }
}
async function yayinOnayUygula(env, id, islem) {
  if (islem !== "x" && (await durdurulduMu(env, "kemal"))) return `${await durMesaji(env, "kemal")} — kart geçerli kaldı, açılınca yeniden onaylayın.`;
  const k = await env.KAYIT.get(`kemal:pelinYayin:${id}`, "json");
  if (!k) return "Bu kart artık geçerli değil (zaten karar verilmiş ya da yenisi geldi).";
  await env.KAYIT.delete(`kemal:pelinYayin:${id}`);
  const x = k.x, simdi = Math.floor(Date.now() / 1000);
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  if (k.mid) await telegram(env, "editMessageReplyMarkup", { chat_id: patron, message_id: k.mid, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  for (const [c, m] of k.mesajlar || []) await telegram(env, "editMessageReplyMarkup", { chat_id: c, message_id: m, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  if (islem === "x") return `❌ ${x.kod}: gönderilmedi (kanal ve site değişmedi).`;
  const u = (await siteUrunleriAl(env)).find((y) => String(y.kod) === String(x.kod) && !y.gizli);
  if (!u) return `⚠️ ${x.kod}: model sitede yok ya da gizli — paylaşılmadı.`;
  const paket = await paketHazirla(env, u, await durumBaglami(env, [String(x.kod)], simdi), simdi, { medya: pelinMedya(x), renk: x.renk || null, beden: x.beden || null, durum: x.yeniRenk ? "yenirenk" : null });
  const g = await yeniKanalaPaylas(env, paket, simdi, { sayma: false, siteVideo: false, renk: x.renk || null, onayliSorunlar: k.kontrolSorunlar || [] }); // site işi aşağıda (pelinSite, dosyadan)
  if (!g.ok) return `⚠️ ${x.kod}: kanala paylaşılamadı: ${kisaHata(g.hata)}`;
  const ertelendi = g.ertelendi ? ` ${ertelemeMetni(g, x.kod)}` : ""; // 9 Kasım: kanal sıraya; site yine şimdi (dosyadan)
  // 5 Kasım: Selin videoyu DOSYADAN (videoUrl) koyar; kanal mesajı yedek. Fotoğraflar: ön + set (hepsi).
  const http = (a) => /^https?:\/\//.test(String(a || ""));
  const videoKanalda = !g.markaNotu || !/video eklenemedi/.test(g.markaNotu);
  const site = { id: x.id, kod: String(x.kod), kanal: g.kanal, videoMesaj: videoKanalda && x.video && g.ids ? g.ids[0] : null, videoUrl: http(x.video) ? x.video : null,
    foto: http(x.foto) ? x.foto : null, fotolar: [...(x.siteFotolar || []), ...(x.set || []).map((y) => y.url)].filter(http), marka: x.marka || null, renk: x.renk || null, zaman: simdi };
  const s = await kuyrugaEkle(env, "pelinSite", site).then(() => true).catch(() => false);
  return `📣 ${x.kod}: ${x.patronIstegi ? "Patron onayıyla" : "onayla"} ${g.ertelendi ? "kanal kuyruğunda" : "kanalda"}${g.link ? `: ${g.link}` : ""}.${ertelendi} ${s ? `Selin siteye ekliyor (video ${site.videoUrl || site.videoMesaj ? "+" : "yok"}, ${[site.foto, ...site.fotolar].filter(Boolean).length} fotoğraf).` : "⚠️ Selin'e iş iletilemedi — site eklenmedi."}`;
}

// 5 Kasım (Patron): Patron'un gönderdiği fotoğraf/videoyla paylaşım: fotoğraflara "MARKA · kod" (marka Sami/model kartı), renk model
// kartından, EN/FR alt yazı sitedeki modelden → SON YAYIN ONAYI (tek albüm). Kaynak: Kemal'e "3627 paylaş" yazılı albüm ya da Venom.
// medya: [{ tur: "foto"|"video", file_id? (Kemal'in), url? }]
export async function patronPaylasimHazirla(env, { kod, medya, kim, venomMedya = null, renk = null, beden = null, chat = null }, simdi) {
  kod = String(kod);
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  const u = (await siteUrunleriAl(env)).find((y) => String(y.kod) === kod && !y.gizli);
  if (!u) return { ok: false, mesaj: `⚠️ ${kod}: model sitede yok — EN/FR yazı siteden hazırlanıyor; önce Selin siteye eklesin.` };
  const marka = await modelMarkasi(env, kod);
  const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
  const arsiv = await env.KAYIT.get("arsiv", "json");
  const fotolar = [], siteFotolar = [];
  let video = null;
  for (const m of (medya || []).slice(0, 10)) {
    if (m.tur === "video") { if (!video) video = m.file_id || m.url; continue; }
    let bayt = null, w = 1280;
    if (m.file_id) bayt = await dosyaBaytIndir(env, (metod, g) => telegram(env, metod, g), m.file_id).catch(() => null);
    else if (m.url) {
      const vm = String(m.url).match(/\/medya\/([a-f0-9]{32})$/); // 6 Kasım: Venom dosyası doğrudan ortak kayıttan (worker→worker isteği yok)
      const kv = vm ? await env.KAYIT.get(`${/volonte-pelin/.test(m.url) ? "pelinmedya" : "venommedya"}:${vm[1]}`, "arrayBuffer").catch(() => null) : null;
      if (kv) bayt = new Uint8Array(kv);
      else { const r = await fetch(m.url).catch(() => null); if (r && r.ok) bayt = new Uint8Array(await r.arrayBuffer()); }
    }
    if (!bayt) continue;
    if (env.IMAGES) { const b = await env.IMAGES.info(new Blob([bayt]).stream()).catch(() => null); if (b && b.width) w = b.width; }
    const damgali = env.IMAGES ? await markaBas(env, bayt, w, kod, marka).catch(() => bayt) : bayt;
    // 6 Kasım: onaydan sonra SİTEYE de bu damgalı fotoğraf gider (Pelin /medya sunar, 30 gün)
    const sid = crypto.randomUUID().replace(/-/g, "");
    if (await env.KAYIT.put(`pelinmedya:${sid}`, damgali, { expirationTtl: 30 * 86400, metadata: { tur: "image/jpeg" } }).then(() => true).catch(() => false)) siteFotolar.push(`https://volonte-pelin.volonte.workers.dev/medya/${sid}`);
    // damgalı fotoğraf arşiv kanalına yüklenir → Kemal'in dosya kimliği (kanal paylaşımı bununla)
    if (arsiv) {
      const f = new FormData(); f.append("chat_id", String(arsiv.id)); f.append("disable_notification", "true"); f.append("photo", new Blob([damgali], { type: "image/jpeg" }), "f.jpg");
      const r = await telegramForm(env, "sendPhoto", f);
      if (r && r.ok) { const ph = r.result.photo; fotolar.push(ph[ph.length - 1].file_id); continue; }
    }
    if (m.file_id) fotolar.push(m.file_id); else if (m.url) fotolar.push(m.url);
  }
  if (!fotolar.length && !video) return { ok: false, mesaj: `⚠️ ${kod}: kullanılabilir fotoğraf/video bulunamadı.` };
  const x = { v: 3, yayinOnayi: true, id: `${kod}-p${simdi.toString(36)}`, kod, marka, video, foto: fotolar[0] || null, set: fotolar.slice(1).map((url, i) => ({ ad: `foto ${i + 2}`, url })), renk: renk || (kart && kart.renk) || null, beden: beden || null, renkKaynak: renk ? "Patron" : "model kartı", siteFotolar, kaynak: "patron", kim: kim || "Patron", venomMedya, deneme: false, zaman: simdi };
  x.patronIstegi = !chat || kimlikler(env.MURAT_ID).includes(String(chat)); // Patron'un kendi isteği: kart Venom üzerinden Patron'a (tek kapı)
  await yayinOnayKarti(env, x, u, simdi);
  return { ok: true, mesaj: `📦 ${kod}: paylaşım hazırlandı (${fotolar.length} fotoğraf${video ? " + video (sesi/müziği aynen)" : ""}, "${marka === "BLACKROSE" ? "BLACK ROSE" : marka} · ${kod}"${x.renk ? `, renk: ${x.renk} (${x.renkKaynak})` : ""}${beden && BEDEN_GRUPLARI[beden] ? `, beden: ${BEDEN_GRUPLARI[beden].ad}` : ""}). SON YAYIN ONAYI kartı gönderildi.` };
}
// Kemal'e doğrudan: "3627 paylaş" yazılı fotoğraf/video (albüm olabilir) → biriktir; 5 dk görevinde (sessizlik ≥ 30 sn) hazırla
const PAYLAS_YAZI = /(\d{3,6})\s*(?:'?[yi]?[iı]?\s*)?(?:kanala\s+)?(?:payla[sş]|kanal|yay[iı]nla)/i;
async function patronMedyaTopla(msg, env) {
  const kod = (String(msg.caption || "").match(PAYLAS_YAZI) || [])[1];
  const anahtar = `kemal:patronPaylas:${msg.chat.id}`;
  let k = await env.KAYIT.get(anahtar, "json");
  const ayniAlbum = k && msg.media_group_id && k.album === msg.media_group_id;
  if (!kod && !ayniAlbum) return false;
  if (kod && !ayniAlbum) k = { kod: kodNormal(kod), album: msg.media_group_id || null, medya: [], chat: msg.chat.id, kim: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "Patron" };
  if (msg.photo) k.medya.push({ tur: "foto", file_id: msg.photo[msg.photo.length - 1].file_id });
  else if (msg.video) k.medya.push({ tur: "video", file_id: msg.video.file_id });
  else if (msg.document && /^image\//.test(msg.document.mime_type || "")) k.medya.push({ tur: "foto", file_id: msg.document.file_id });
  else if (msg.document && /^video\//.test(msg.document.mime_type || "")) k.medya.push({ tur: "video", file_id: msg.document.file_id });
  k.son = Math.floor(Date.now() / 1000);
  await env.KAYIT.put(anahtar, JSON.stringify(k), { expirationTtl: 3600 });
  const sira = (await env.KAYIT.get("kemal:patronPaylasSira", "json")) || [];
  if (!sira.includes(String(msg.chat.id))) await env.KAYIT.put("kemal:patronPaylasSira", JSON.stringify([...sira, String(msg.chat.id)]), { expirationTtl: 3600 });
  if (kod) await telegram(env, "sendMessage", { chat_id: msg.chat.id, text: `📥 ${k.kod} paylaşım için alındı. Birkaç dakika içinde SON YAYIN ONAYI kartı gelir (marka yazısı fotoğraflara basılır, renk model kartından).` });
  return true;
}
export async function patronPaylasimAdimi(env, simdi) {
  const sira = (await env.KAYIT.get("kemal:patronPaylasSira", "json")) || [];
  const kalan = [];
  for (const c of sira) {
    const k = await env.KAYIT.get(`kemal:patronPaylas:${c}`, "json");
    if (!k) continue;
    if (simdi - (k.son || 0) < 30) { kalan.push(c); continue; }
    await env.KAYIT.delete(`kemal:patronPaylas:${c}`);
    const r = await patronPaylasimHazirla(env, k, simdi).catch((e) => ({ ok: false, mesaj: `⚠️ ${k.kod}: hazırlanamadı (${kisaHata(e)})` }));
    if (!r.ok) await telegram(env, "sendMessage", { chat_id: k.chat, text: r.mesaj });
  }
  if (JSON.stringify(kalan) !== JSON.stringify(sira)) await env.KAYIT.put("kemal:patronPaylasSira", JSON.stringify(kalan), { expirationTtl: 3600 }); // 6 Kasım: her 5 dk boşuna yazıyordu (günde 288; KV sınırı 1000)
  // Venom'dan gelen paylaşım istekleri (Patron Venom'a fotoğraf/video gönderdi)
  for (const v of await kuyruguAl(env, "patronPaylas")) {
    const r = await patronPaylasimHazirla(env, v, simdi).catch((e) => ({ ok: false, mesaj: `⚠️ ${v.kod}: hazırlanamadı (${kisaHata(e)})` })); // v: { kod, medya, renk, beden }
    await kuyrugaEkle(env, "sonuc", { id: `pp-${v.kod}-${simdi}`, ok: r.ok, aciklama: r.mesaj });
  }
}
async function yayinOnayDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [, islem, id] = String(cq.data).split(":");
  const kk = await env.KAYIT.get(`kemal:pelinYayin:${id}`, "json");
  if (!kk) return cevapla("Bu kart artık geçerli değil.");
  // 10 Kasım görev kâğıdı: kartı alan (Hemra / Black Rose ise Merdan) onaylar; eski kartlar için Patron
  const yetkili = String(env.MURAT_ID || "").split(",").map((v) => v.trim()).includes(String(cq.from.id)) || (kk.mesajlar || []).some(([c]) => String(c) === String(cq.from.id));
  if (!yetkili) return cevapla("Bu kart size ait değil.");
  await cevapla(islem === "x" ? "Gönderilmedi" : "Paylaşıyorum");
  const sonuc = await yayinOnayUygula(env, id, islem === "x" ? "x" : "o");
  const ad = kisiAdi(cq.from);
  for (const [c, m] of kk.mesajlar && kk.mesajlar.length ? kk.mesajlar : [[cq.message.chat.id, cq.message.message_id]]) await kartYazisi(env, c, m, `${sonuc}\n(${ad})`);
  return null;
}

// ---------- 10 Kasım (Patron): STOK BİTİNCE SOLD OUT ----------
// SADECE Vegawin MAĞAZA stoğu 0 olunca (fabrikada bitmesi sebep değil). Olay bazlı: stoğu daha önce >0 görülen model 0'a düşünce,
// en az 1 saat arayla İKİ kontrolde de 0 ise. Köprü verisi 3 saatten eskiyse hiçbir şey yapılmaz. Kanal mesajı SİLİNMEZ: kanaldaki
// son 3 paylaşımın yazısı "❌ SOLD OUT / ÉPUISÉ" ile başlar (resim ve düğmeler kalır). Saatte en fazla 3 model; 09–21.
export const SOLDOUT_SATIR = "❌ SOLD OUT / ÉPUISÉ";
export async function soldOutAdimi(env, simdi, { zorla = false } = {}) {
  if (!env.STOK) return null;
  const s = saat(simdi);
  if (!zorla && (s < 9 || s >= 21)) return null;
  const son = Number((await env.KAYIT.get("kemal:soldoutSon")) || 0);
  if (!zorla && simdi - son < 3600) return null;
  await env.KAYIT.put("kemal:soldoutSon", String(simdi), { expirationTtl: 3 * 86400 });
  const oz = await stokIste(env, "/ozet", {}).catch(() => null);
  const kopruler = (oz && oz.kopruler) || [];
  if (!kopruler.length || kopruler.some((k) => simdi - Number(k.son || 0) > 3 * 3600)) return { atlandi: "köprü verisi taze değil" };
  const kodlar = Object.keys((await env.KAYIT.get("kodlar", "json")) || {}).filter((k) => !indirimliMi(k));
  const stok = {};
  for (let i = 0; i < kodlar.length; i += 500) Object.assign(stok, await stokIste(env, "/toplu", { kodlar: kodlar.slice(i, i + 500) }).catch(() => ({})));
  const gorulen = (await env.KAYIT.get("kemal:stokGorulen", "json").catch(() => null));
  const bekleyen = (await env.KAYIT.get("kemal:soldoutBekleyen", "json").catch(() => null)) || {};
  const yapilan = (await env.KAYIT.get("kemal:soldout", "json").catch(() => null)) || {};
  const yeniGorulen = { ...(gorulen || {}) };
  const donusBekleyen = (await env.KAYIT.get("kemal:donusBekleyen", "json").catch(() => null)) || {};
  const donenler = [];
  const adaylar = [];
  for (const kod of kodlar) {
    const x = stok[kod];
    if (!x) continue; // Vegawin'de kaydı yok → dokunma
    if (x.toplam > 0) { // stok döndü: SOLD OUT yazılmış paylaşımlar "BACK IN STOCK" olur (iki kontrolde de stok varsa); yeniden bitince yine SOLD OUT
      yeniGorulen[kod] = 1; delete bekleyen[kod];
      if (yapilan[kod]) { if (!donusBekleyen[kod]) donusBekleyen[kod] = simdi; else if (simdi - donusBekleyen[kod] >= 3300) donenler.push(kod); }
      continue;
    }
    delete donusBekleyen[kod];
    if (!gorulen || !gorulen[kod] || yapilan[kod]) continue; // ilk çalışma / stoğu hiç görülmemiş / zaten yapıldı
    if (!bekleyen[kod]) { bekleyen[kod] = simdi; continue; } // ilk kez 0: bir saat sonra yeniden bakılır
    if (simdi - bekleyen[kod] >= 3300) adaylar.push(kod);
  }
  const sonuc = { zaman: simdi, yapilan: [], ilk: !gorulen };
  for (const kod of adaylar.slice(0, 3)) {
    const r = await soldOutYaz(env, kod);
    yapilan[kod] = simdi; delete bekleyen[kod]; delete yeniGorulen[kod];
    sonuc.yapilan.push({ kod, ...r });
    if (r.duzenlenen) for (const kisi of [hemraId(env)].filter(Boolean)) await telegram(env, "sendMessage", { chat_id: kisi, text: `❌ ${kod} mağazada bitti (Vegawin stok 0) → kanalda ${r.duzenlenen} paylaşımın yazısı "SOLD OUT" yapıldı. Mesajlar silinmedi.`, disable_web_page_preview: true });
  }
  sonuc.donen = [];
  for (const kod of donenler.slice(0, 3)) {
    const r = await soldOutYaz(env, kod, backInStockYazisi);
    delete yapilan[kod]; delete donusBekleyen[kod];
    sonuc.donen.push({ kod, ...r });
    await defterIs(env, "kemal", `${kod} stoğa döndü → kanalda ${r.duzenlenen} paylaşımın yazısı "BACK IN STOCK" yapıldı`, { kod }).catch(() => null);
  }
  await env.KAYIT.put("kemal:donusBekleyen", JSON.stringify(donusBekleyen), { expirationTtl: 7 * 86400 });
  await env.KAYIT.put("kemal:stokGorulen", JSON.stringify(yeniGorulen));
  await env.KAYIT.put("kemal:soldoutBekleyen", JSON.stringify(bekleyen), { expirationTtl: 7 * 86400 });
  await env.KAYIT.put("kemal:soldout", JSON.stringify(yapilan));
  if (sonuc.yapilan.length) { const l = (await env.KAYIT.get("kemal:soldoutKayit", "json").catch(() => null)) || []; await env.KAYIT.put("kemal:soldoutKayit", JSON.stringify([...l, ...sonuc.yapilan.map((y) => ({ ...y, zaman: simdi }))].slice(-200)), { expirationTtl: 60 * 86400 }); }
  return sonuc;
}
// Yazıyı başa SOLD OUT satırı koyarak düzenler (eski durum satırı çıkar, kalın/bağlantı biçimleri korunur, düğmeler korunur)
export function soldOutYazisi(yazi, ents = []) {
  const t = String(yazi || "");
  if (t.startsWith(SOLDOUT_SATIR)) return null;
  const ilk = t.split("\n")[0];
  const durumMu = /AVAILABLE|DISPONIBLE|BACK IN STOCK|DE RETOUR|NEW COLOR|NOUVEAU|BEST SELLER|LAST SERIES|DERNI/i.test(ilk) && ilk.length < 60;
  const kes = durumMu ? Math.min(t.length, ilk.length + 1) : 0;
  const on = `${SOLDOUT_SATIR}\n`;
  const kayma = on.length - kes;
  const entities = [{ type: "bold", offset: 0, length: SOLDOUT_SATIR.length }, ...(ents || []).filter((e) => e.offset >= kes).map((e) => ({ ...e, offset: e.offset + kayma }))];
  return { caption: (on + t.slice(kes)).slice(0, 1024), caption_entities: entities.filter((e) => e.offset + e.length <= 1024) };
}
// 13 Kasım (Patron, A3): stok geri gelince AYNI paylaşımlarda "❌ SOLD OUT / ÉPUISÉ" satırı "🔁 BACK IN STOCK / DE RETOUR" olur (resim, yazı, düğmeler aynı)
export const BACKINSTOCK_SATIR = DURUMLAR.donus;
export function backInStockYazisi(yazi, ents = []) {
  const t = String(yazi || "");
  if (!t.startsWith(SOLDOUT_SATIR)) return null;
  const kayma = BACKINSTOCK_SATIR.length - SOLDOUT_SATIR.length;
  const entities = [{ type: "bold", offset: 0, length: BACKINSTOCK_SATIR.length }, ...(ents || []).filter((e) => e.offset >= SOLDOUT_SATIR.length).map((e) => ({ ...e, offset: e.offset + kayma }))];
  return { caption: (BACKINSTOCK_SATIR + t.slice(SOLDOUT_SATIR.length)).slice(0, 1024), caption_entities: entities.filter((e) => e.offset + e.length <= 1024) };
}
async function soldOutYaz(env, kod, cevir = soldOutYazisi) {
  const kanal = await env.KAYIT.get("kanal", "json");
  const arsiv = await env.KAYIT.get("arsiv", "json");
  const paylasimlar = (((await env.KAYIT.get("kodlar", "json")) || {})[kod] || []).slice().sort((a, b) => (b.tarih || 0) - (a.tarih || 0)).slice(0, 3);
  if (!kanal || !arsiv || !paylasimlar.length) return { duzenlenen: 0, hata: "kanal/arşiv/paylaşım yok" };
  let duzenlenen = 0; const hatalar = [];
  for (const p of paylasimlar) {
    for (const id of (p.ids || []).slice(0, 10)) {
      const f = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true }).catch(() => null);
      if (!f || !f.ok) continue;
      const m = f.result;
      await telegram(env, "deleteMessage", { chat_id: arsiv.id, message_id: m.message_id }).catch(() => null);
      if (!m.caption || !(m.photo || m.video)) continue; // yazılı medya (albümün başı)
      const y = cevir(m.caption, m.caption_entities);
      if (!y) break;
      const g = await telegram(env, "editMessageCaption", { chat_id: kanal.id, message_id: id, ...y, ...(m.reply_markup ? { reply_markup: m.reply_markup } : {}) });
      if (g && g.ok) duzenlenen++; else hatalar.push(`${id}: ${(g && g.description) || "?"}`);
      break;
    }
  }
  return { duzenlenen, hata: hatalar.length ? hatalar.join("; ").slice(0, 300) : null };
}

// ---------- 10 Kasım (Patron): YENİ RENK — Kemal kendisi fark eder ----------
// Site defterinde (venom:siteDefteri) bir modele daha önce görülmemiş renk eklenince ve kanalda bu renk hiç paylaşılmadıysa
// "🎨 NEW COLOR / NOUVELLE COULEUR" öneri kartı (Merdan/Hemra onayıyla paylaşılır). İlk çalışmada sadece mevcut renkler kaydedilir.
export async function yeniRenkAdimi(env, simdi) {
  const d = await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null);
  if (!d || !d.modeller) return null;
  const imza = String(d.zaman || d.guncel || Object.keys(d.modeller).length);
  const gorulen = await env.KAYIT.get("kemal:siteRenkGorulen", "json").catch(() => null);
  if (gorulen && gorulen.__imza === imza) return null; // defter değişmedi
  const kanalda = Object.keys((await env.KAYIT.get("kodlar", "json")) || {});
  const kanalRenk = (await env.KAYIT.get("kemal:kanalRenkleri", "json").catch(() => null)) || {};
  const yeni = { __imza: imza };
  const bulunan = [];
  for (const [kod, m] of Object.entries(d.modeller)) {
    const renkler = ((m && m.renkler) || []).map((r) => renkIngilizce(r) || String(r).toLowerCase().trim()).filter(Boolean);
    yeni[kod] = [...new Set(renkler)];
    if (!gorulen || !gorulen[kod] || !kanalda.includes(String(kod)) || indirimliMi(kod)) continue; // ilk çalışma / yeni model (Selin bildirir) / kanalda hiç yok
    for (const r of yeni[kod]) if (!gorulen[kod].includes(r) && !(kanalRenk[kod] || []).includes(r)) bulunan.push({ kod: String(kod), renk: r });
  }
  if (bulunan.length) {
    const sira = (await env.KAYIT.get("venom:yeniModel", "json")) || [];
    for (const b of bulunan.slice(0, 5)) if (!sira.some((x) => String(x.kod) === b.kod)) sira.push({ kod: b.kod, kim: "Kemal (yeni renk)", yenirenk: b.renk, zaman: simdi });
    await env.KAYIT.put("venom:yeniModel", JSON.stringify(sira));
  }
  await env.KAYIT.put("kemal:siteRenkGorulen", JSON.stringify(yeni));
  return { bulunan, ilk: !gorulen };
}

// 10 Kasım GÖREV KÂĞIDI kanıtı: KV "kemal:kagitDeneme" = { merdan?: kod, hemra?: kod } → Merdan'a (Black Rose) ve Hemra'ya (VOLONTE)
// TEK 🧪 DENEME öneri kartı. Gerçek akışa, kanala, deftere gitmez; düğmeler "kd:" (hiçbir şey yapmaz). Yapay zekâ yok (hazır yazı).
export async function kagitDenemeAdimi(env, simdi) {
  const d = await env.KAYIT.get("kemal:kagitDeneme", "json").catch(() => null);
  if (!d) return null;
  await env.KAYIT.delete("kemal:kagitDeneme");
  const tur = await env.KAYIT.get("tur", "json").catch(() => null);
  const site = await siteUrunleriAl(env).catch(() => []);
  const paketBul = async (marka, kod) => {
    const t = tur && tur.ogeler ? Object.values(tur.ogeler).find((o) => o.paket && (kod ? String(o.paket.kod) === String(kod) : o.paket.marka === marka)) : null;
    if (t) return t.paket;
    const adaylar = kod ? [String(kod)] : site.filter((u) => !u.gizli).map((u) => String(u.kod)).slice(0, 80);
    for (const k of adaylar) {
      const u = site.find((x) => String(x.kod) === k);
      if (!u || !(await env.KAYIT.get(`yazi:${k}`))) continue; // hazır yazı yoksa atla (yapay zekâ harcaması yok)
      if (!kod && (await modelMarkasi(env, k).catch(() => null)) !== marka) continue;
      return paketHazirla(env, u, await durumBaglami(env, [k], simdi), simdi, {});
    }
    return null;
  };
  const klavye = { inline_keyboard: [[{ text: "✅ Onayla", callback_data: "kd:1" }, { text: "✏️ Düzelt", callback_data: "kd:d" }], [{ text: "❌ Geç", callback_data: "kd:g" }, { text: "⏳ Beklesin", callback_data: "kd:w" }]] };
  const sonuc = { zaman: simdi };
  for (const [ad, kisi, marka] of [["merdan", merdanId(env), "BLACKROSE"], ["hemra", hemraId(env), "VOLONTE"]]) {
    if (!kisi) { sonuc[ad] = { ok: false, hata: "kimlik yok" }; continue; }
    const p = await paketBul(marka, d[ad]).catch((e) => ({ hata: kisaHata(e) }));
    if (!p || p.hata) { sonuc[ad] = { ok: false, hata: (p && p.hata) || `${marka} için hazır model bulunamadı` }; continue; }
    const ust = `🧪 DENEME — gerçek değil (düğmeler bir şey yapmaz)\n${kontrolMetni(p, simdi)}`;
    const t = await tekKartGonder(env, kisi, p, ust, klavye);
    const m = t.result || {};
    sonuc[ad] = { ok: Boolean(t.ok), kod: p.kod, marka: p.marka, tur: t.tur, mesaj: m.message_id || null, resim: Boolean(m.photo && m.photo.length), video: Boolean(m.video), yazi: String(m.caption || m.text || "").slice(0, 1024), dugmeler: ((m.reply_markup && m.reply_markup.inline_keyboard) || []).map((r) => r.map((b) => b.text)), hata: t.ok ? null : t.description || null };
  }
  await env.KAYIT.put("kemal:kagitDenemeSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
  return sonuc;
}

export async function fabrikaIsleri(env, simdi) {
  try { await soldOutAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:soldoutHata", JSON.stringify({ zaman: simdi, hata: kisaHata(e) }), { expirationTtl: 7 * 86400 }).catch(() => null); }
  try { await yeniRenkAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:yeniRenkHata", JSON.stringify({ zaman: simdi, hata: kisaHata(e) }), { expirationTtl: 7 * 86400 }).catch(() => null); }
  try { await kagitDenemeAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:kagitDenemeSonuc", JSON.stringify({ zaman: simdi, hata: kisaHata(e) }), { expirationTtl: 86400 }).catch(() => null); }
  try { await kanalDuzeltAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:sonHata", JSON.stringify({ zaman: simdi, hata: `kanalDuzelt: ${String(e && e.message).slice(0, 300)}` }), { expirationTtl: 7 * 86400 }).catch(() => null); } // 10 Kasım
  if (env.STOK) { try { await venomYayinKararlari(env); await patronPaylasimAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:pelinTeslimHata", JSON.stringify({ zaman: simdi, hata: `patron/venom: ${String(e && e.message).slice(0, 300)}` }), { expirationTtl: 7 * 86400 }); } }
  if (env.STOK) { try { await pelinKanalAdimi(env, simdi); } catch (e) { await env.KAYIT.put("kemal:pelinTeslimHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } }
  // Tek seferlik (2 Kasım): KV "venom:soldoutUygula" = [{kod, kanal, arsiv}] → daha önce silinemeyen eski paylaşımlar SOLD OUT ile gizlenir
  const uygula = await env.KAYIT.get("venom:soldoutUygula", "json");
  if (uygula && uygula.length) {
    await env.KAYIT.delete("venom:soldoutUygula");
    const kanal = await env.KAYIT.get("kanal", "json");
    for (const u of uygula) {
      const g = await soldoutIleGizle(env, kanal.id, u.kanal);
      const s = (await env.KAYIT.get(`silinen:${u.kod}`, "json")) || { kod: u.kod, kopya: [] };
      if (g.ok && u.arsiv && !s.kopya.some((x) => x.kanal === u.kanal)) { s.kopya.push({ kanal: u.kanal, arsiv: u.arsiv, gizlendi: true }); await env.KAYIT.put(`silinen:${u.kod}`, JSON.stringify(s)); }
      const link = kanal.kullanici ? `https://t.me/${kanal.kullanici}/${u.kanal}` : `#${u.kanal}`;
      await telegram(env, "sendMessage", { chat_id: muratId(env), disable_web_page_preview: true, text: g.ok
        ? `✅ ${u.kod}: silinemeyen eski paylaşım SOLD OUT görseliyle gizlendi, alt yazısı kaldırıldı (orijinali arşivde). Tamamen silmek isterseniz elle silin:\n${link}`
        : `⚠️ ${u.kod}: eski paylaşım SOLD OUT ile gizlenemedi (${g.description || "bilinmeyen hata"}). Elle silin:\n${link}` });
    }
  }
  // Tek seferlik yetki kontrolü (2 Kasım): KV "venom:yetkiKontrol" → botun VOLONTE kanalındaki yönetici izinleri "venom:yetkiKontrolSonuc"a
  if (await env.KAYIT.get("venom:yetkiKontrol")) {
    await env.KAYIT.delete("venom:yetkiKontrol");
    const kanal = await env.KAYIT.get("kanal", "json");
    const ben = await telegram(env, "getMe", {});
    const uye = kanal && ben.ok ? await telegram(env, "getChatMember", { chat_id: kanal.id, user_id: ben.result.id }) : null;
    const r = uye && uye.ok ? uye.result : {};
    await env.KAYIT.put("venom:yetkiKontrolSonuc", JSON.stringify({ zaman: simdi, durum: r.status || (uye && uye.description) || null, silme: r.can_delete_messages ?? null, paylasma: r.can_post_messages ?? null, duzenleme: r.can_edit_messages ?? null }), { expirationTtl: 86400 });
  }
  await yeniModelIsleri(env, simdi);
  const sira = (await env.KAYIT.get("venom:repetePaylas", "json")) || [];
  if (sira.length) {
    await env.KAYIT.put("venom:repetePaylas", "[]");
    for (const r of sira) {
      const st = (await stokIste(env, "/toplu", { kodlar: [r.kod] }).catch(() => ({})))[r.kod] || null;
      // Yeni düzen (29 Ekim): 🔁 BACK IN STOCK, fiyat YOK. Medya siteden; sitede yoksa en yeni kanal paylaşımının medyası (yazısı değil).
      let paket = null;
      let sorun = null;
      if (!r.deneme) {
        try { paket = await repetePaketi(env, r, simdi); } catch (e) { sorun = kisaHata(e); }
      }
      const rk = paket ? await kanalKontrol(env, paket, { simdi }).catch(() => null) : null; // 6 Kasım: Venom kontrolü en üstte
      const metin = [
        ...(rk ? [rk.satir] : []),
        `${r.deneme ? DENEME : ""}🔁 Repete geldi – ${r.kod}`,
        `Renkler: ${(r.renkler || []).map((x) => `${x.renk} ${x.adet}`).join(", ") || "—"}`,
        `Stok: ${st ? `${Math.max(0, st.toplam)} adet` : "—"}${st && !(st.toplam > 0) ? " ⚠️ Vegawin'e henüz girilmemiş olabilir" : ""}`,
        `Bildiren: ${r.bildiren}`,
        r.deneme ? "\n(DENEME: onaylansa da kanalda paylaşılmaz)" : paket ? `\nKanal gönderisi yukarıdaki gibi olacak (yeni düzen, fiyat yok).${paket.renkEmin ? "" : "\n⚠️ Renkler İngilizceye çevrilemedi → renk satırı konmadı."}` : `\n⚠️ Paylaşım hazırlanamadı (${sorun || "medya yok"}); onaylansa da paylaşılamaz.`,
        "",
        "Paylaşılsın mı?",
      ].filter((x) => x !== "").join("\n");
      const mesajlar = [];
      for (const k of onizleyenler(env)) {
        if (paket) await paketGonder(env, k, paket, (await env.KAYIT.get("bicim")) || "album");
        const g = await telegram(env, "sendMessage", { chat_id: k, text: metin, reply_markup: { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `kr:o:${r.id}` }, { text: "⏳ Bekle", callback_data: `kr:b:${r.id}` }]] } });
        if (g && g.ok) mesajlar.push([k, g.result.message_id]);
      }
      await env.KAYIT.put(`venom:rp:${r.id}`, JSON.stringify({ ...r, paket, metin, mesajlar, durum: "bekliyor", kontrolSorunlar: rk ? rk.sorunlar : [] }), { expirationTtl: 30 * 86400 });
      if (r.deneme) await denemeKaydi(env, r.liste, "Kemal paylaşım önizlemesini Murat'a ve Hemra'ya gönderdi");
    }
  }
  const silinecek = (await env.KAYIT.get("venom:kanalSil", "json")) || [];
  if (silinecek.length) {
    await env.KAYIT.put("venom:kanalSil", "[]");
    // 2 Kasım: Selin'den gelir (önce site); Patron'a tek sonuç mesajı; kodsuz paylaşımlar fotoğrafa bakarak da aranır
    for (const s of silinecek) await hicGelmeyecek(env, s.kod, s.kim, simdi, { gorsel: true, patron: true, site: s.site || null });
  }
  // 6 Kasım (temizlik B1, tek seferlik "venom:kanalTemizlikHazirla"): son 7 günde aynı model + aynı renk birden çok paylaşıldıysa
  // her gönderi arşive iletilerek doğrulanır (silinmiş mi, renk satırı ne) → en son olan kalır, fazlası Patron onay kartına (Venom)
  if (await env.KAYIT.get("venom:kanalTemizlikHazirla")) {
    const kanal = await env.KAYIT.get("kanal", "json"), arsiv = await env.KAYIT.get("arsiv", "json");
    const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
    const satir = [], kanalSil = [], silinmis = [];
    let degisti = false;
    for (const [kod, l] of Object.entries(kodlar)) {
      const son = l.filter((g) => simdi - g.tarih < 7 * 86400);
      if (son.length < 2 || !kanal || !arsiv) continue;
      const gruplar = {};
      for (const g of son) {
        const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: g.ids[0], disable_notification: true }).catch(() => null);
        if (!r || !r.ok) { silinmis.push({ kod, g }); continue; } // kanalda yok (elle silinmiş)
        await telegram(env, "deleteMessage", { chat_id: arsiv.id, message_id: r.result.message_id }).catch(() => null);
        const renk = ((String(r.result.caption || r.result.text || "").match(/Colou?rs?[^:]*:\s*([^\n]+)/i) || [])[1] || "renk yok").trim().toLowerCase();
        (gruplar[renk] = gruplar[renk] || []).push(g);
      }
      for (const [renk, gl] of Object.entries(gruplar)) {
        if (gl.length < 2) continue;
        const sirali = [...gl].sort((a, b) => b.tarih - a.tarih);
        const tarih = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(5, 16).replace("T", " ");
        const link = (g) => `t.me/${kanal.kullanici || "kanal"}/${g.ids[0]}`;
        satir.push(`• ${kod} (${renk}): KALIR ${tarih(sirali[0].tarih)} ${link(sirali[0])} — SİLİNECEK ${sirali.slice(1).map((g) => `${tarih(g.tarih)} ${link(g)}`).join(", ")}`);
        for (const g of sirali.slice(1)) kanalSil.push({ kod, ids: g.ids, not: `${renk}, ${tarih(g.tarih)}` });
      }
    }
    for (const x of silinmis) { kodlar[x.kod] = kodlar[x.kod].filter((g) => g !== x.g); degisti = true; } // kayıtta "silindi"
    if (degisti) await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
    const metin = [`🧹 KANAL TEMİZLİĞİ — son 7 gün, aynı model + aynı renk tekrarları`, ...(satir.length ? satir : ["• Tekrar yok."]),
      ...(silinmis.length ? [``, `Kanalda artık olmayan (elle silinmiş) ${silinmis.length} gönderi kayıttan düşüldü: ${silinmis.map((x) => `${x.kod} #${x.g.ids[0]}`).join(", ")}`] : []),
      ``, kanalSil.length ? `✅ Onaylarsanız ${kanalSil.length} fazla gönderi silinir (her modelin en son paylaşımı kalır).` : "Silinecek bir şey yok."].join("\n");
    if ((await env.KAYIT.put("venom:temizlikKart", JSON.stringify({ metin: metin.slice(0, 3800), kanalSil, siteKaldir: [] })).then(() => true).catch(() => false))) await env.KAYIT.delete("venom:kanalTemizlikHazirla").catch(() => null);
  }
  // 6 Kasım (C9, tek seferlik "venom:kanalImzaHazirla"): son 30 günde kanalda VOLONTE imzasıyla duran BLACK ROSE gönderileri →
  // her gönderi arşive iletilip yazısı okunur → liste Venom onay kartına (silinmeden önce Patron onayı)
  if (await env.KAYIT.get("venom:kanalImzaHazirla")) {
    const kanal = await env.KAYIT.get("kanal", "json"), arsiv = await env.KAYIT.get("arsiv", "json");
    const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
    const yanlis = [], kanalDuzelt = [];
    for (const [kod, l] of Object.entries(kodlar)) {
      const son = l.filter((g) => simdi - g.tarih < 30 * 86400);
      if (!son.length || !kanal || !arsiv) continue;
      const mk = await markaKesin(env, kod).catch(() => ({}));
      if (mk.marka !== "BLACKROSE") continue;
      for (const g of son) {
        let yazi = "", imzaId = null;
        for (const id of g.ids.slice(0, 8)) { // albümde yazı ilk mesajda; "👆 CODE" mesajı da olabilir
          const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true }).catch(() => null);
          if (!r || !r.ok) continue;
          await telegram(env, "deleteMessage", { chat_id: arsiv.id, message_id: r.result.message_id }).catch(() => null);
          yazi += `\n${r.result.caption || r.result.text || ""}`;
          if (/Premium/i.test(yazi)) { imzaId = id; break; }
        }
        if (/VOLONTE\s*[–-]\s*Premium/i.test(yazi) && !/BLACK\s*ROSE\s*[–-]\s*Premium/i.test(yazi)) {
          const t = new Date((g.tarih + 3 * 3600) * 1000).toISOString().slice(5, 16).replace("T", " ");
          yanlis.push(`• ${kod} — ${t} t.me/${kanal.kullanici || "kanal"}/${g.ids[0]}`);
          kanalDuzelt.push({ kod, id: imzaId, link: `t.me/${kanal.kullanici || "kanal"}/${g.ids[0]}`, not: t });
        }
      }
    }
    const metin = [`🖋 KANAL — BLACK ROSE modeli ama VOLONTE imzasıyla duran gönderiler (son 30 gün): ${yanlis.length}`, ...(yanlis.length ? yanlis : ["• Yok."]), "",
      yanlis.length ? `✅ Onaylarsanız bu ${yanlis.length} gönderinin SADECE imzası "${IMZA_MARKA.BLACKROSE}" olarak düzeltilir. Hiçbiri SİLİNMEZ; fotoğraf/video ve yazının geri kalanı aynen kalır.` : "Düzeltilecek bir şey yok."].join("\n");
    if ((await env.KAYIT.put("venom:temizlikKart", JSON.stringify({ metin: metin.slice(0, 3800), kanalDuzelt, kanalSil: [], siteKaldir: [] })).then(() => true).catch(() => false))) await env.KAYIT.delete("venom:kanalImzaHazirla").catch(() => null);
  }
  // 6 Kasım (Patron: "SİLİNMESİN, sadece yazısı düzenlensin"): Venom onayından sonra "venom:kanalImzaDuzelt" listesi →
  // her gönderinin yazısı arşive iletilerek okunur, imza BLACK ROSE yapılır (biçim/kalın yazılar korunur), medya dokunulmaz.
  // Her turda en çok 15 gönderi; bitince Patron'a tek sonuç (düzenlenemeyenler listesiyle).
  const imzaIs = await env.KAYIT.get("venom:kanalImzaDuzelt", "json").catch(() => null);
  if (imzaIs && (imzaIs.liste || []).length) {
    const kanal = await env.KAYIT.get("kanal", "json"), arsiv = await env.KAYIT.get("arsiv", "json");
    const parca = imzaIs.liste.slice(0, 15), kalan = imzaIs.liste.slice(15);
    const sonuc = imzaIs.sonuc || { ok: [], olmadi: [] };
    for (const x of parca) {
      const neden = await (async () => {
        if (!kanal || !arsiv) return "kanal/arşiv kaydı yok";
        if (!x.id) return "imzalı mesaj bulunamadı";
        const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: Number(x.id), disable_notification: true }).catch(() => null);
        if (!r || !r.ok) return "kanalda bulunamadı (silinmiş olabilir)";
        await telegram(env, "deleteMessage", { chat_id: arsiv.id, message_id: r.result.message_id }).catch(() => null);
        const yaziMi = r.result.caption == null && r.result.text != null;
        const d = imzaDegistir(yaziMi ? r.result.text : r.result.caption, yaziMi ? r.result.entities : r.result.caption_entities);
        if (!d) return /BLACK\s*ROSE\s*[–-]\s*Premium/i.test(String(r.result.caption || r.result.text || "")) ? null : "yazıda VOLONTE imzası yok";
        const e = yaziMi
          ? await telegram(env, "editMessageText", { chat_id: kanal.id, message_id: Number(x.id), text: d.yazi, ...(d.entities ? { entities: d.entities } : {}), ...(r.result.link_preview_options ? { link_preview_options: r.result.link_preview_options } : {}) }).catch((h) => ({ ok: false, description: String(h) }))
          : await telegram(env, "editMessageCaption", { chat_id: kanal.id, message_id: Number(x.id), caption: d.yazi, ...(d.entities ? { caption_entities: d.entities } : {}) }).catch((h) => ({ ok: false, description: String(h) }));
        if (e && e.ok) return null;
        if (/not modified/i.test(String(e && e.description))) return null;
        return `Telegram: ${String((e && e.description) || "cevap yok").slice(0, 80)}`;
      })();
      if (neden) sonuc.olmadi.push(`${x.kod} ${x.link || `#${x.id}`} — ${neden}`); else sonuc.ok.push(x.kod);
    }
    if (kalan.length) await env.KAYIT.put("venom:kanalImzaDuzelt", JSON.stringify({ ...imzaIs, liste: kalan, sonuc }));
    else {
      await env.KAYIT.delete("venom:kanalImzaDuzelt").catch(() => null);
      await kuyrugaEkle(env, "sonuc", { id: `kid-${simdi}`, ok: !sonuc.olmadi.length, aciklama: [`🖋 İmza düzeltme bitti: ${sonuc.ok.length} gönderi "${IMZA_MARKA.BLACKROSE}" yapıldı (hiçbiri silinmedi).`, ...(sonuc.olmadi.length ? [``, `❌ Düzenlenemeyen ${sonuc.olmadi.length}:`, ...sonuc.olmadi.map((y, i) => `${i + 1}. ${y}`)] : [`Düzenlenemeyen yok.`])].join("\n").slice(0, 3800) }).catch(() => null);
    }
  }
  // 6 Kasım (temizlik, Patron onayıyla Venom'dan): belirli kanal mesajları silinir (tekrar paylaşımın fazlası); dizinden de çıkar
  const mesajSil = (await env.KAYIT.get("venom:kanalMesajSil", "json")) || [];
  if (mesajSil.length) {
    await env.KAYIT.put("venom:kanalMesajSil", "[]");
    const kanal = await env.KAYIT.get("kanal", "json");
    const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
    const sonuc = [];
    for (const x of mesajSil) {
      let n = 0;
      for (const id of (x.ids || []).slice(0, 12)) { const r = kanal ? await telegram(env, "deleteMessage", { chat_id: kanal.id, message_id: Number(id) }).catch(() => null) : null; if (r && r.ok) n++; }
      if (kodlar[x.kod]) kodlar[x.kod] = kodlar[x.kod].filter((g) => !g.ids.some((id) => (x.ids || []).map(Number).includes(id)));
      sonuc.push(`${x.kod}: ${n}/${(x.ids || []).length} mesaj silindi${x.not ? ` (${x.not})` : ""}`);
    }
    await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
    await kuyrugaEkle(env, "sonuc", { id: `kms-${simdi}`, ok: true, aciklama: `🧹 Kanal temizliği:\n${sonuc.join("\n")}` }).catch(() => null);
  }
  const geri = (await env.KAYIT.get("venom:kanalGeri", "json")) || [];
  if (geri.length) {
    await env.KAYIT.put("venom:kanalGeri", "[]");
    for (const s of geri) await kanalaGeriKoy(env, s.kod, s.kim, s.site, simdi);
  }
}

// 6 Kasım: yazıdaki "VOLONTE – Premium…" imzasını "BLACK ROSE – Premium…" yapar; Telegram biçim işaretlerinin (kalın, link…)
// yerini kaydırır (Telegram UTF-16 sayar = JS dizini). İmza yoksa null.
export function imzaDegistir(yazi, entities) {
  const t = String(yazi || ""), re = /VOLONTE(?=\s*[–-]\s*Premium)/g, yerler = [];
  let m; while ((m = re.exec(t))) yerler.push(m.index);
  if (!yerler.length) return null;
  const ESKI = 7, YENI = "BLACK ROSE", fark = YENI.length - ESKI;
  let yeni = t, ent = entities ? entities.map((e) => ({ ...e })) : null;
  for (const p of [...yerler].reverse()) {
    yeni = yeni.slice(0, p) + YENI + yeni.slice(p + ESKI);
    if (ent) for (const e of ent) {
      if (e.offset >= p + ESKI) e.offset += fark;
      else if (e.offset <= p && e.offset + e.length >= p + ESKI) e.length += fark;
    }
  }
  return { yazi: yeni, entities: ent && ent.length ? ent : null };
}

// Repete paylaşım paketi: renkler repete bildiriminden (İngilizceye çevrilebiliyorsa), yazı sitedeki kayıttan.
async function repetePaketi(env, r, simdi) {
  const u = (await siteUrunleriAl(env)).find((x) => String(x.kod) === String(r.kod));
  const baglam = await durumBaglami(env, [String(r.kod)], simdi);
  const renkler = renkCevir((r.renkler || []).map((x) => x.renk));
  let paket;
  if (u) paket = { ...(await paketHazirla(env, u, baglam, simdi, { durum: "donus" })), kaynak: "site" };
  else {
    const ids = modelSecenekleri(r.kod, (await env.KAYIT.get("kodlar", "json")) || {}, {}, 1).flatMap((g) => g.ids);
    const medya = ids.length ? await kanalMedyasi(env, ids) : [];
    if (!medya.length) throw new Error("sitede yok, kanalda da medya bulunamadı");
    const yazi = (await env.KAYIT.get(`yazi:${r.kod}`, "json")) || {};
    paket = { marka: await modelMarkasi(env, String(r.kod)).catch(() => "VOLONTE"), kod: String(r.kod), baslik: "", durum: "donus", renkler: [], renkEmin: false, renkNotu: "", kumas: yazi.kumas || null, en: yazi.en || "", fr: yazi.fr || "", bedenler: "", medya, video: 0, tgSon: baglam.tarih.son[r.kod] || null, kaynak: "kanal" };
  }
  if (renkler) Object.assign(paket, { renkler, renkEmin: true, renkNotu: "" });
  else if (!u) paket.renkEmin = false;
  return paket;
}

// Kanal paylaşımının medyası (yazısı değil): mesajlar arşive iletilip dosya kimlikleri alınır.
async function kanalMedyasi(env, ids) {
  const kanal = await env.KAYIT.get("kanal", "json");
  const arsiv = await env.KAYIT.get("arsiv", "json");
  if (!kanal || !arsiv) return [];
  const medya = [];
  for (const id of ids.slice(0, 10)) {
    const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true });
    if (!r.ok) continue;
    const m = r.result;
    if (m.photo) medya.push({ type: "photo", media: m.photo[m.photo.length - 1].file_id });
    else if (m.video) medya.push({ type: "video", media: m.video.file_id });
  }
  return medya;
}

async function repetePaylasKarari(cq, env) {
  const [, islem, id] = String(cq.data || "").split(":");
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const r = await env.KAYIT.get(`venom:rp:${id}`, "json");
  if (!r || r.durum === "paylasildi" || r.durum === "denemeBitti") return cevapla(r ? `${r.karar || "Karar"} verildi.` : "Bu önizleme artık geçerli değil.");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const hepsi = async (ek, klavye = { inline_keyboard: [] }) => { for (const [k, m] of r.mesajlar) await telegram(env, "editMessageText", { chat_id: k, message_id: m, text: `${r.metin}\n\n${ek}`, reply_markup: klavye }); };
  if (islem === "b") {
    r.karar = `${kim}: bekle`;
    await env.KAYIT.put(`venom:rp:${id}`, JSON.stringify(r), { expirationTtl: 30 * 86400 });
    await cevapla("Bekletildi");
    if (r.deneme) await denemeKaydi(env, r.liste, `Kemal paylaşım onayı: "Bekle" (${kim})`);
    return hepsi(`⏳ ${kim}: bekle dedi.`, { inline_keyboard: [[{ text: "✅ Onayla", callback_data: `kr:o:${id}` }]] });
  }
  if (r.deneme) {
    Object.assign(r, { durum: "denemeBitti", karar: `${kim}: onayla` });
    await env.KAYIT.put(`venom:rp:${id}`, JSON.stringify(r), { expirationTtl: 30 * 86400 });
    await cevapla("Deneme: paylaşılmadı");
    await hepsi(`🧪 ${kim} onayladı — DENEME olduğu için kanalda paylaşılmadı.`);
    await denemeKaydi(env, r.liste, `Kemal paylaşım onayı: "Onayla" (${kim}) — kanalda paylaşılmadı`);
    return denemeOzeti(env, r.liste, (e, metod, govde) => telegram(e, metod, govde));
  }
  if (!r.paket) return cevapla("Paylaşım hazırlanamamıştı.");
  Object.assign(r, { durum: "paylasildi", karar: `${kim}: onayla` });
  await env.KAYIT.put(`venom:rp:${id}`, JSON.stringify(r), { expirationTtl: 30 * 86400 });
  await cevapla("Paylaşılıyor");
  const p = await yeniKanalaPaylas(env, r.paket, simdi, { sayma: false, stokKontrol: false, onayliSorunlar: r.kontrolSorunlar || [] });
  if (p.ertelendi) return hepsi(`✅ ${kim} onayladı. ${ertelemeMetni(p, r.kod)}`);
  return hepsi(p.ok ? `✅ ${kim} onayladı — kanalda paylaşıldı (yeni düzen)${p.link ? `: ${p.link}` : ""}.` : `⚠️ Paylaşılamadı: ${p.hata}`);
}

// Günlük satış (belge tipi 21, köprü sadece okur): { gun: "2026-10-29", kalemler: [{ kod, adet }] }. Fiyat yok.
async function kopruSatis(request, env) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !env.STOK || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const govde = await request.json().catch(() => null);
  if (!govde || !/^\d{4}-\d{2}-\d{2}$/.test(String(govde.gun || "")) || !Array.isArray(govde.kalemler) || govde.kalemler.length > 2000) return new Response("geçersiz", { status: 400 });
  const kalemler = govde.kalemler.filter((k) => !/^0/.test(stokKodu(k.kod))).map((k) => ({ kod: stokKodu(k.kod), adet: Math.abs(Number(k.adet) || 0) }));
  return Response.json(await stokIste(env, "/satis-yaz", { magaza, gun: govde.gun, kalemler }));
}

// Cari bakiyeler (cuma mutabakatı, 31 Ekim; köprü sadece okur): Black Rose hesaplarının kart bakiyesi ve dönem hareket
// toplamları. Sami'nin deposunda "cari:<MAĞAZA>" — SADECE Patron ve Fuat'a giden mutabakatta kullanılır.
// Köprünün kendini güncellemesi (2 Kasım): /kopru/surum → yayındaki sürüm ve dosya özetleri (KV "kopru:surum");
// /kopru/dosya {ad} → o dosya (base64, KV "kopru:dosya:<ad>"). Sadece köprü anahtarıyla; sadece listedeki dosyalar.
// Köprünün bildirdiği kendi sürümü KV "venom:kopruSurum:<MAĞAZA>"ya yazılır (kurulum doğrulaması için).
async function kopruGuncelleme(request, env, yol) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const g = await request.json().catch(() => ({}));
  const liste = (await env.KAYIT.get("kopru:surum", "json")) || { surum: "0", dosyalar: {} };
  if (yol === "/kopru/surum") {
    if (g && /^\d{6,12}$/.test(String(g.surum || ""))) await env.KAYIT.put(`venom:kopruSurum:${magaza}`, JSON.stringify({ surum: String(g.surum), zaman: Math.floor(Date.now() / 1000), yayinda: liste.surum }));
    return Response.json(liste);
  }
  const ad = String((g && g.ad) || "");
  if (!Object.prototype.hasOwnProperty.call(liste.dosyalar || {}, ad)) return new Response("yok", { status: 404 });
  const b64 = await env.KAYIT.get(`kopru:dosya:${ad}`);
  return b64 ? Response.json({ ad, b64 }) : new Response("yok", { status: 404 });
}

// Yıllık ciro (2 Kasım): köprü satış faturası başlıklarından yıl × tür × para birimi toplamlarını gönderir → Sami'nin deposu
// "ciro:<MAĞAZA>". SADECE Patron'un /ciro raporu için; her mağaza ayrı tutulur (toplanmaz, karşılaştırılmaz).
async function kopruCiro(request, env) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !env.STOK || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const g = await request.json().catch(() => null);
  if (!g || !Array.isArray(g.satirlar)) return new Response("geçersiz", { status: 400 });
  const sayi = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
  const satirlar = g.satirlar.slice(0, 2000).filter((x) => Number(x.yil) >= 2000 && Number(x.yil) <= 2100).map((x) => ({
    tablo: String(x.tablo || "").slice(0, 60), yil: Number(x.yil), tur: String(x.tur ?? "").slice(0, 10), doviz: String(x.doviz || "").slice(0, 10), n: Number(x.n) || 0, tutar: sayi(x.tutar), aratoplam: sayi(x.aratoplam), kaynak: x.kaynak === "iade" ? "iade" : "satis",
  }));
  await stokIste(env, "/ayar-yaz", { k: `ciro:${magaza}`, v: JSON.stringify({ zaman: Math.floor(Date.now() / 1000), satirlar }) });
  return Response.json({ ok: true, satir: satirlar.length });
}

// Mali keşif (3 Kasım, Patron onayı): gider tabloları + fiyat sütunları + fatura satırı bağları. Ham hâliyle Sami'nin deposuna
// ("mali:kesif:<MAĞAZA>"); SADECE Patron'un /gider ve /kar raporlarının kurulumu için. Hiçbir bota, kanala, siteye gitmez.
async function kopruMaliKesif(request, env) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !env.STOK || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const metin = await request.text();
  if (metin.length > 900000) return new Response("çok büyük", { status: 413 });
  let g; try { g = JSON.parse(metin); } catch { return new Response("geçersiz", { status: 400 }); }
  await stokIste(env, "/ayar-yaz", { k: `mali:kesif:${magaza}`, v: JSON.stringify({ zaman: Math.floor(Date.now() / 1000), surum: String(g.surum || ""), tablolar: g.tablolar || [], mali: g.mali || null }) });
  return Response.json({ ok: true });
}

async function kopruCari(request, env) {
  const magaza = String(request.headers.get("X-Magaza") || "").toUpperCase();
  const anahtar = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[A-Z0-9_]{2,20}$/.test(magaza) || !env.STOK || !gizliEsit(anahtar, env[`KOPRU_${magaza}`])) return new Response("yetkisiz", { status: 401 });
  const g = await request.json().catch(() => null);
  if (!g || !Array.isArray(g.hesaplar) || g.hesaplar.length > 20) return new Response("geçersiz", { status: 400 });
  const sayi = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
  const hesaplar = g.hesaplar.filter((h) => /^\d{2}$/.test(String(h.anahtar))).map((h) => ({
    anahtar: String(h.anahtar), ad: String(h.ad || "").slice(0, 60), kart: sayi(h.kart),
    donemler: Object.fromEntries(Object.entries(h.donemler || {}).slice(0, 20).map(([d, x]) => [String(d).slice(0, 60), { n: Number(x.n) || 0, borc: sayi(x.borc), alacak: sayi(x.alacak), ilk: x.ilk || null, son: x.son || null, sonBakiye: sayi(x.sonBakiye),
      ...(x.yillar && typeof x.yillar === "object" ? { yillar: Object.fromEntries(Object.entries(x.yillar).filter(([y]) => /^\d{4}$/.test(y)).slice(0, 30).map(([y, v]) => [y, { n: Number(v.n) || 0, b: sayi(v.b), a: sayi(v.a), ob: sayi(v.ob), oa: sayi(v.oa) }])) } : {}),
      ...(x.ilkGun && /^\d{4}-\d{2}-\d{2}$/.test(String(x.ilkGun.tarih)) ? { ilkGun: { tarih: String(x.ilkGun.tarih), n: Number(x.ilkGun.n) || 0, b: sayi(x.ilkGun.b), a: sayi(x.ilkGun.a) } } : {}) }])),
  }));
  const ozel = (Array.isArray(g.ozel) ? g.ozel : []).slice(0, 50).map((o) => ({ tablo: String(o.tablo || "").slice(0, 60), kod: String(o.kod || "").slice(0, 60), cari: String(o.cari || "").slice(0, 60), n: Number(o.n) || 0, borc: sayi(o.borc), alacak: sayi(o.alacak) }));
  // 2 Kasım: köprü hangi sütunla bağladığını (baglar) da gönderir; para birimi dolar
  const baglar = (Array.isArray(g.baglar) ? g.baglar : []).slice(0, 20).map((b) => ({ tablo: String(b.tablo || "").slice(0, 60), hareket: String(b.hareket || "").slice(0, 30), kart: String(b.kart || "").slice(0, 30), n: Number(b.n) || 0, farkli: Number(b.farkli) || 0 }));
  // 2 Kasım: son 60 günün tek tek hareketleri (ödemeler, gelen mal, defter farkı sebebi; sadece Patron'a)
  const kisa = (x, n) => (x == null || x === "" ? null : String(x).slice(0, n));
  const hareketler = (Array.isArray(g.hareketler) ? g.hareketler : []).slice(0, 2500).filter((x) => /^\d{2}$/.test(String(x.hesap)) && /^\d{4}-\d{2}-\d{2}$/.test(String(x.tarih))).map((x) => ({
    hesap: String(x.hesap), tablo: kisa(x.tablo, 60), ind: kisa(x.ind, 20), tarih: String(x.tarih), borc: sayi(x.borc), alacak: sayi(x.alacak),
    ozelkod: kisa(x.ozelkod, 80), aciklama: kisa(x.aciklama, 120), evrak: kisa(x.evrakno || x.belgeno, 40), belge: kisa(x.belgeind || x.belgetipi, 20), islem: kisa(x.islemind || x.islemtipi, 20),
  }));
  await stokIste(env, "/ayar-yaz", { k: `cari:${magaza}`, v: JSON.stringify({ zaman: Math.floor(Date.now() / 1000), kartBakiye: g.kartBakiye !== false, birim: "USD", hesaplar, ozel, baglar, hareketler }) });
  return Response.json({ ok: true, hesap: hesaplar.length });
}

// Stok soruları ve /stok: ortak kod (stokbot.js). "sami:aktif" varsa sorular Sami'nin botundan gider.
const kemalTg = (env, metod, govde) => telegram(env, metod, govde);
export const stokSorulariGonder = async (env, simdi) => {
  if (await env.KAYIT.get("sami:aktif")) return; // stok bilgisinin ve sorularının sahibi Sami
  return stokSorulariGonderOrtak(env, simdi, kemalTg);
};
const stokKarari = (cq, env) => stokKarariOrtak(cq, env, kemalTg);
const stokGoster = (msg, env) => stokGosterOrtak(msg, env, kemalTg);

// ---------- Venom Ekip sabah raporları (venom.js) ----------

// 09:15 Kemal'in raporu, 09:40 toplu rapor (üç botun özeti + kontroller + yapay zekâ yorumu).
export async function sabahIsleri(env, simdi) {
  const tgf = (e, metod, g) => telegram(e, metod, g);
  if (await raporZamani(env, simdi, [9, 15], "venom:kemalRaporu")) {
    const r = await kemalRaporu(env, simdi);
    await raporuBirak(env, "kemal", simdi, r);
    if (await kagitAcik(env, "kemal", "grupRaporu")) await grubaGonder(env, "kemal", r.metin, tgf);
  }
  if ((await kagitAcik(env, "kemal", "topluRapor")) && (await raporZamani(env, simdi, [9, 40], "venom:topluRapor"))) await topluRapor(env, simdi, tgf);
  if (await kagitAcik(env, "kemal", "aylikRapor")) await aylikRapor(env, simdi, tgf, AYLIK_SINIR_USD);
}

export async function kemalRaporu(env, simdi) {
  const dun = gunAnahtari(simdi - 86400);
  const kanalda = Number((await env.KAYIT.get(`gun:${dun}`)) || 0);
  const ozet = (await env.KAYIT.get("ozet", "json")) || { sonlar: [] };
  const dunku = ozet.sonlar.filter((p) => gunAnahtari(p.tarih) === dun);
  const tepkiler = await tepkileriOku(env, [...new Set(dunku.flatMap((p) => p.ids))]);
  const puan = (p) => p.ids.reduce((t, id) => t + (tepkiler[id] || 0), 0);
  const enIyi = [...dunku].filter((p) => puan(p) > 0).sort((a, b) => puan(b) - puan(a)).slice(0, 3);
  const tur = await env.KAYIT.get("tur", "json");
  const bugunTur = tur && (tur.gun || gunAnahtari(tur.basla)) === gunAnahtari(simdi) ? tur : null;
  const istekler = ((await env.KAYIT.get("istekler", "json")) || []).filter((i) => i.durum === "bekliyor");
  // Kontrol: sırada (bugün paylaşılacak) stoğu bitmiş model var mı? Stok bilgisi Sami'den.
  const kuyruk = await kuyrukListesi(env);
  const gizli = new Set(await stokGizliler(env));
  const stoksuzSira = kuyruk.filter((o) => gizli.has(o.kod)).map((o) => o.kod);
  const satir = [`🤖 Kemal — ${gunAnahtari(simdi).split("-").reverse().join(".")} sabah raporu`, ""];
  satir.push(`Dün kanala ${kanalda} paylaşım yapıldı.`); // 13 Kasım (Patron): tek sayı — eski "N tanesi Kemal'in" alt sayacı (tur sayacı) kaldırıldı
  satir.push(enIyi.length ? `En çok tepki: ${enIyi.map((p) => `${kodBul(p.metin || "") || "kodsuz"} ❤️ ${puan(p)}`).join(" · ")}` : "Dün tepki verisi yok.");
  satir.push(bugunTur ? `Bugünün turu: ${Object.keys(bugunTur.ogeler).length} model soruldu, ${bugunTur.onaylar.length} onay, ${Object.values(bugunTur.ogeler).filter((o) => !o.karar).length} cevap bekliyor.` : "Bugünün turu henüz başlamadı.");
  satir.push(`Sırada: ${kuyruk.length} onaylı paylaşım. Müşteri istek defteri: ${istekler.length} bekleyen.`);
  const sorunlar = stoksuzSira.length ? [`Paylaşım sırasında stoğu bitmiş model: ${stoksuzSira.join(", ")} (Sami'ye göre)`] : [];
  satir.push("", "🔎 Kontrol:", stoksuzSira.length ? `• ⚠️ ${sorunlar[0]}` : "• ✅ Sıradaki paylaşımların hepsi stokta (ya da Vegawin dışı)");
  return {
    metin: satir.join("\n"),
    ozet: `Dün ${kanalda} paylaşım; bugünkü tur ${bugunTur ? `${bugunTur.onaylar.length} onay` : "başlamadı"}; sırada ${kuyruk.length}.`,
    sorunlar,
    yapilacak: bugunTur && Object.values(bugunTur.ogeler).some((o) => !o.karar) ? ["Kemal'in bugünkü turunda cevap bekleyen modeller var"] : [],
  };
}

export class KatalogDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(istek) {
    const yol = new URL(istek.url).pathname;
    if (yol.startsWith("/kemal/")) return this.kemal(yol, istek);
    if (yol === "/tepki") {
      const { id, toplam } = await istek.json();
      await this.state.storage.put(`t:${id}`, toplam);
      return new Response("ok");
    }
    if (yol === "/tur-gonder") return Response.json(await turParcasiIsle(this.env, await istek.json()));
    if (yol === "/yeni-gonder") return Response.json(await yeniParcaIsle(this.env, await istek.json()));
    if (yol === "/tepkiler") {
      const { ids } = await istek.json();
      const sonuc = {};
      for (let i = 0; i < ids.length; i += 128) {
        const parca = await this.state.storage.get(ids.slice(i, i + 128).map((id) => `t:${id}`));
        for (const [k, v] of parca) sonuc[k.slice(2)] = v;
      }
      return Response.json(sonuc);
    }
    await katalogGuvenli(this.env, Math.floor(Date.now() / 1000));
    await altyaziGuvenli(this.env, Math.floor(Date.now() / 1000));
    return new Response("ok");
  }

  // "kemal" nesnesi: Kemal'in bütün işleri burada, sık yazılan kayıtlar bu nesnenin deposunda.
  async kemal(yol, istek) {
    await gocBirKez(this.state, this.env.KAYIT, KEMAL_YEREL, "kemal"); // ilk seferde KV'den kopyala + kontrol (silmez)
    const env = { ...this.env, KAYIT: karmaDepo(this.env.KAYIT, this.state.storage, KEMAL_YEREL), KEMAL_ICERDE: true };
    const simdi = Math.floor(Date.now() / 1000);
    if (yol === "/kemal/ofis-sohbet") return Response.json(await ofisSohbet(env, await istek.json(), simdi));
    if (yol === "/kemal/ozet") return Response.json(await kemalOzet(env, simdi)); // 9 Kasım: Venom'un canlı sorusu
    if (yol === "/kemal/oner") return Response.json(await turEkle(env, (await istek.json()).kodlar || [], simdi)); // 9 Kasım: Venom emri
    if (yol === "/kemal/hatirlat") return Response.json(await kemalHatirlat(env, simdi)); // 13 Kasım: iş bekçisi (Venom)
    if (yol === "/kemal/calistir") return Response.json(await kemalCalistir(env, await istek.json().catch(() => ({})), simdi)); // 13 Kasım: Patron "Kemal'i çalıştır"
    if (yol === "/kemal/guncelleme") await guncellemeIsle(await istek.json(), env);
    else if (yol === "/kemal/cron") {
      await durumKontrol(env);
      if (env.BOT_TOKEN) {
        try { await sabahIsleri(env, simdi); } catch (e) { await this.env.KAYIT.put("kemal:raporHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
        try { await fabrikaIsleri(env, simdi); } catch (e) { await this.env.KAYIT.put("kemal:fabrikaHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
        try { await repeteIsleri(env, simdi); } catch (e) { await this.env.KAYIT.put("kemal:repeteHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); } // 9 Kasım
        await rotasyon(env, simdi);
      }
    } else if (yol === "/kemal/adim") {
      await katalogGuvenli(env, simdi);
      await altyaziGuvenli(env, simdi);
    }
    return new Response("ok");
  }
}

export function silKomutu(t) {
  const x = String(t || "").trim().toLocaleLowerCase("tr").replace(/[’`]/g, "'");
  const m = x.match(/^(?:sil|kaldır|kaldir|delete|удали(?:ть)?)\s+(~?\d{3,6})\s*[.!]?$/) || x.match(/^(~?\d{3,6})(?:'?\s*(?:y?[ıiuü]|nu|nü|nı|ni))?\s+(?:sil|kaldır|kaldir|silin|silelim|delete|удали(?:ть)?)\s*[.!]?$/);
  return m ? m[1] : null;
}
// Ofisten (Patron) Kemal'le konuşma: Kemal'in aynı beyni ve araçları; cevap ofise döner. Araçların onay düğmeleri (paylaşım,
// silme, alt yazı) yine Patron'un TELEGRAM sohbetine gider — ofisten doğrudan kanal işlemi/harcama yok. Beyin: Sonnet.
const OFIS_MODEL = "claude-sonnet-5-5";
const OFIS_FIYAT = { giris: 2, cikis: 10, okuma: 0.2 }; // $/milyon token (Sonnet)
export async function ofisSohbet(env, g, simdi) {
  const metin = String((g && g.metin) || "").trim().slice(0, 2000);
  if (!metin) return { hata: "boş mesaj" };
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  if (!patron) return { hata: "Patron kimliği yok" };
  let cevap = "", usd = 0;
  const y = { ...asistanYardimcilari(env), gonder: async (_s, text) => { cevap = String(text); return { ok: true }; }, gonderBicimli: async (_s, _html, duz) => { cevap = String(duz); return { ok: true }; }, yaziyor: async () => ({ ok: true }) };
  const msg = { chat: { id: patron }, from: { id: patron, first_name: "Patron" }, text: `${metin}\n(Ofisten, sesli/yazılı konuşma)` };
  await asistanCevapla(msg, env, y, simdi, { model: OFIS_MODEL, kullanim: (_m, u) => { usd += ((u.input_tokens || 0) * OFIS_FIYAT.giris + (u.cache_creation_input_tokens || 0) * OFIS_FIYAT.giris * 1.25 + (u.cache_read_input_tokens || 0) * OFIS_FIYAT.okuma + (u.output_tokens || 0) * OFIS_FIYAT.cikis) / 1e6; } });
  return { cevap: cevap || "Tamam.", maliyet: Math.round(usd * 10000) / 10000, model: OFIS_MODEL };
}
const kemalNesne = (env) => env.KATALOG.get(env.KATALOG.idFromName("kemal"), { locationHint: "enam" });

const sabitNesne = (env) => env.KATALOG.get(env.KATALOG.idFromName("katalog"), { locationHint: "enam" });

async function tepkiKaydet(env, id, toplam) {
  if (env.KATALOG) return sabitNesne(env).fetch("https://katalog/tepki", { method: "POST", body: JSON.stringify({ id, toplam }) });
  return env.KAYIT.put(`tepki:${id}`, String(toplam), { expirationTtl: 60 * 86400 });
}

export async function tepkileriOku(env, ids) {
  if (!ids.length) return {};
  if (env.KATALOG) return (await sabitNesne(env).fetch("https://katalog/tepkiler", { method: "POST", body: JSON.stringify({ ids }) })).json();
  const sonuc = {};
  for (const id of ids) {
    const v = await env.KAYIT.get(`tepki:${id}`);
    if (v != null) sonuc[id] = Number(v);
  }
  return sonuc;
}

// ---------- Alt yazı önerisi (✅ Değiştir / ❌ Kalsın) ----------

export async function altyaziSirayaEkle(env, oge) {
  const sira = (await env.KAYIT.get("altyaziSira", "json")) || [];
  if (sira.some((x) => x.mesaj && x.mesaj === oge.mesaj)) return;
  sira.push({ ...oge, deneme: 0 });
  await env.KAYIT.put("altyaziSira", JSON.stringify(sira.slice(-30)));
}

// Yazısı bilinmeyen eski paylaşım: albüm parçalarını arşive iletip yazılı olanı bulur.
async function yaziMesajiBul(env, ids, arsiv, kanal) {
  for (const id of ids.slice(0, 10)) {
    const r = await telegram(env, "forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: id, disable_notification: true });
    if (r.ok && (r.result.caption || r.result.text)) return { mesaj: id, eski: r.result.caption || r.result.text };
  }
  return null;
}

async function altyaziGuvenli(env, simdi) {
  if (!(await kagitAcik(env, "kemal", "altyazi"))) return; // 10 Kasım görev kâğıdı: kâğıtta yok
  try {
    await altyaziAdimi(env, simdi);
  } catch (e) {
    await env.KAYIT.put("altyaziHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 500) }), { expirationTtl: 7 * 86400 });
  }
}

export async function altyaziAdimi(env, simdi) {
  if (!env.ANTHROPIC_API_KEY || !env.BOT_TOKEN || env.ALTYAZI_ACIK !== "1") return;
  const sira = (await env.KAYIT.get("altyaziSira", "json")) || [];
  if (!sira.length) return;
  const gunAn = `altyazi:${gunAnahtari(simdi)}`;
  let yapilan = Number((await env.KAYIT.get(gunAn)) || 0);
  if (yapilan >= ALTYAZI_GUNLUK) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  const arsiv = await env.KAYIT.get("arsiv", "json");
  const tarifler = (await env.KAYIT.get("tarifler", "json")) || {};
  const kalan = [];
  let islenen = 0;
  for (const oge of sira) {
    if (islenen >= ALTYAZI_PARTI || yapilan >= ALTYAZI_GUNLUK) { kalan.push(oge); continue; }
    islenen += 1;
    try {
      let { mesaj, eski } = oge;
      if (!mesaj || eski == null) {
        const bulunan = arsiv && (await yaziMesajiBul(env, oge.ids || [], arsiv, kanal));
        if (!bulunan) continue; // yazısı bulunamayan paylaşım atlanır
        ({ mesaj, eski } = bulunan);
      }
      const metin = await altyaziOlustur(env, { kod: oge.kod, eski, tarif: tarifler[oge.kod] && tarifler[oge.kod].t, etiket: oge.etiket });
      yapilan += 1;
      if (metin.trim() === String(eski || "").trim()) continue;
      const no = Number((await env.KAYIT.get("altyaziNo")) || 0) + 1;
      await env.KAYIT.put("altyaziNo", String(no));
      const oneri = { kod: oge.kod, mesaj, metin, eski, durum: null, mesajlar: [] };
      const link = kanal.kullanici ? `https://t.me/${kanal.kullanici}/${mesaj}` : "";
      for (const kisi of kisilerden(env)) {
        const r = await telegram(env, "sendMessage", {
          chat_id: kisi,
          text: `✍️ ${oge.kod} için yeni alt yazı önerisi\n${link}\n\n${metin}`,
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: "✅ Değiştir", callback_data: `ay:${no}` }, { text: "❌ Kalsın", callback_data: `an:${no}` }]] },
        });
        if (r.ok) oneri.mesajlar.push([kisi, r.result.message_id]);
      }
      await env.KAYIT.put(`oneri:${no}`, JSON.stringify(oneri), { expirationTtl: 14 * 86400 });
    } catch (e) {
      if ((oge.deneme || 0) < 2) kalan.push({ ...oge, deneme: (oge.deneme || 0) + 1 });
      await env.KAYIT.put("altyaziHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 500) }), { expirationTtl: 7 * 86400 });
    }
  }
  await env.KAYIT.put(gunAn, String(yapilan), { expirationTtl: 2 * 86400 });
  await env.KAYIT.put("altyaziSira", JSON.stringify(kalan));
}

async function altyaziKarar(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, no] = cq.data.split(":");
  const anahtar = `oneri:${no}`;
  const oneri = await env.KAYIT.get(anahtar, "json");
  if (!oneri) return cevapla("Bu öneri artık geçerli değil.");
  if (oneri.durum) return cevapla(`${oneri.kim} zaten karar verdi.`);
  const kim = kisiAdi(cq.from);
  oneri.durum = islem;
  oneri.kim = kim;
  await env.KAYIT.put(anahtar, JSON.stringify(oneri), { expirationTtl: 14 * 86400 }); // önce kilitle
  let sonuc;
  if (islem === "ay") {
    const kanal = await env.KAYIT.get("kanal", "json");
    const r = await telegram(env, "editMessageCaption", { chat_id: kanal.id, message_id: oneri.mesaj, caption: oneri.metin });
    sonuc = r.ok ? `✅ ${oneri.kod}: alt yazı değiştirildi (${kim}).` : `⚠️ ${oneri.kod}: alt yazı değiştirilemedi (${r.description}).`;
    await cevapla(r.ok ? "Değiştirildi ✅" : "Değiştirilemedi");
  } else {
    sonuc = `❌ ${oneri.kod}: eski alt yazı kaldı (${kim}).`;
    await cevapla("Kalsın");
  }
  for (const [kisi, mesajId] of oneri.mesajlar) {
    await telegram(env, "editMessageText", { chat_id: kisi, message_id: mesajId, text: `${sonuc}\n\n${oneri.metin}`, disable_web_page_preview: true });
  }
}

// ---------- Müşteri istek defteri ----------

export async function istekKaydet(env, kod, musteri, not, kim, simdi) {
  const istekler = (await env.KAYIT.get("istekler", "json")) || [];
  const id = istekler.reduce((en, i) => Math.max(en, i.id), 0) + 1;
  istekler.push({ id, kod, musteri, not, kim, zaman: simdi, durum: "bekliyor" });
  await env.KAYIT.put("istekler", JSON.stringify(istekler));
  return id;
}

// Model kanala gelince (insan ya da Kemal paylaşınca) bekleyen istekleri hatırlat.
async function istekHatirlat(env, kod, kayit) {
  const istekler = (await env.KAYIT.get("istekler", "json")) || [];
  const bekleyen = istekler.filter((i) => i.kod === kod && i.durum === "bekliyor");
  if (!bekleyen.length) return;
  const link = kayit.link ? `\n${kayit.link}` : "";
  await herkese(env, [
    `🔔 ${kod} kanala geldi!${link}`,
    `Bu modeli isteyen müşteriler (${bekleyen.length}) — haber verin:`,
    ...bekleyen.map((i) => `• ${i.musteri}${i.not ? ` — ${i.not}` : ""} (${i.kim}, ${tarihUzun(i.zaman)})`),
  ].join("\n"));
  for (const i of bekleyen) {
    i.durum = "bildirildi";
    i.bildirim = kayit.tarih;
  }
  await env.KAYIT.put("istekler", JSON.stringify(istekler));
}

// ---------- Akşam raporu (20:00) ----------

export async function aksamRaporu(env, simdi, gunSonuNotu = null) {
  const gun = gunAnahtari(simdi);
  const ozet = (await env.KAYIT.get("ozet", "json")) || { sonlar: [] };
  const hafta = ozet.sonlar.filter((p) => p.tarih >= simdi - 7 * 86400);
  const tepkiler = await tepkileriOku(env, [...new Set(hafta.flatMap((p) => p.ids))]);
  const puan = (p) => p.ids.reduce((t, id) => t + (tepkiler[id] || 0), 0);
  const ad = (p) => kodBul(p.metin || "") || "kodsuz";
  const bugun = hafta.filter((p) => gunAnahtari(p.tarih) === gun).sort((a, b) => a.tarih - b.tarih);
  const enIyi = [...hafta].filter((p) => puan(p) > 0).sort((a, b) => puan(b) - puan(a)).slice(0, 3);
  const istekler = ((await env.KAYIT.get("istekler", "json")) || []).filter((i) => i.durum === "bekliyor");

  const satirlar = [`🌙 Kemal — ${tarihUzun(simdi)} akşam raporu`, ""];
  satirlar.push(bugun.length ? `Bugün kanala ${bugun.length} paylaşım yapıldı:` : "Bugün kanala paylaşım yapılmadı.");
  for (const p of bugun) satirlar.push(`• ${tarihYaz(p.tarih).slice(6)} ${ad(p)} — ❤️ ${puan(p)}`);
  satirlar.push("");
  if (enIyi.length) {
    satirlar.push("En çok tepki alanlar (son 7 gün):");
    for (const p of enIyi) satirlar.push(`• ${ad(p)} — ❤️ ${puan(p)} (${tarihUzun(p.tarih)})${p.link ? ` ${p.link}` : ""}`);
  } else {
    satirlar.push("Son 7 günde tepki verisi yok.");
  }
  satirlar.push("(Görüntülenme sayısını Telegram botlara vermiyor; tepki sayıları gösteriliyor.)", "");
  satirlar.push("Yarın için:");
  if (gunSonuNotu) satirlar.push(`• ${gunSonuNotu}`);
  satirlar.push(`• Yarının turu sabah ${SABAH_SAATI}:00'de gelir.`);
  if (istekler.length) satirlar.push(`• İstek defterinde ${istekler.length} bekleyen müşteri isteği var.`);
  const tekrar = enIyi.filter((p) => kodBul(p.metin || ""));
  if (tekrar.length) satirlar.push(`• Çok ilgi görenleri tekrar paylaşmak isterseniz aşağıdaki düğmeler önizleme açar (onaysız paylaşılmaz).`);

  const reply_markup = tekrar.length
    ? { inline_keyboard: tekrar.map((p) => [{ text: `🔁 ${ad(p)} tekrar paylaş`, callback_data: `rp:${ad(p)}` }]) }
    : undefined;
  for (const kisi of kisilerden(env)) {
    await telegram(env, "sendMessage", { chat_id: kisi, text: satirlar.join("\n"), disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) });
  }
}

async function katalogGuvenli(env, simdi) {
  if (!(await kagitAcik(env, "kemal", "katalog"))) return; // 10 Kasım görev kâğıdı: kâğıtta yok
  try {
    await katalogAdimi(env, simdi);
  } catch (e) {
    // Görülebilsin diye son hata KV'ye yazılır (Claude Code okur).
    const ayrinti = e && (e.status ? `${e.status} ${e.message}` : e.message || String(e));
    await env.KAYIT.put("katalogHata", JSON.stringify({ zaman: simdi, hata: String(ayrinti).slice(0, 800) }), { expirationTtl: 7 * 86400 });
  }
}

// Katalogdaki her model için kanaldaki en yeni paylaşımın ilk medyası (silinenler hariç).
export function katalogListesi(kodlar, kodsuz, silinenler) {
  const liste = [];
  for (const kod of [...Object.keys(kodlar), ...Object.keys(kodsuz)]) {
    if (silinenler[kod]) continue;
    const sec = modelSecenekleri(kod, kodlar, kodsuz)[0];
    if (sec) liste.push({ kod, mesaj: sec.ids[0] });
  }
  return liste;
}

export async function katalogAdimi(env, simdi) {
  const arsiv = await env.KAYIT.get("arsiv", "json");
  if (!arsiv || !env.ANTHROPIC_API_KEY || !env.BOT_TOKEN) return;
  if (await sinirAsildiMi(env, simdi)) return;
  const gunAn = `katalog:${gunAnahtari(simdi)}`;
  const cagri = Number((await env.KAYIT.get(gunAn)) || 0);
  if (cagri >= KATALOG_GUNLUK_CAGRI) return;

  const kanal = await env.KAYIT.get("kanal", "json");
  const tarifler = (await env.KAYIT.get("tarifler", "json")) || {};
  const hatalar = (await env.KAYIT.get("tarifhata", "json")) || {};
  const silinenler = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  const tum = katalogListesi((await env.KAYIT.get("kodlar", "json")) || {}, (await env.KAYIT.get("kodsuz", "json")) || {}, silinenler);
  const eksik = tum.filter((x) => !tarifler[x.kod] && (hatalar[x.kod] || 0) < 3);
  if (!eksik.length) {
    if (!(await env.KAYIT.get("katalogHazir")) && Object.keys(tarifler).length) {
      await env.KAYIT.put("katalogHazir", "1");
      await herkese(env, `✅ Katalog hazır: ${Object.keys(tarifler).length} model. Artık müşterinin gönderdiği fotoğrafı bana iletebilirsiniz; hangi model olduğunu bulmaya çalışırım.`);
    }
    return;
  }
  await env.KAYIT.put(gunAn, String(cagri + 1), { expirationTtl: 2 * 86400 });

  const tg = (metod, govde) => telegram(env, metod, govde);
  const gorseller = [];
  for (const x of eksik.slice(0, KATALOG_PARTI)) {
    const r = await tg("forwardMessage", { chat_id: arsiv.id, from_chat_id: kanal.id, message_id: x.mesaj, disable_notification: true });
    const dosya = r.ok && medyaDosyasi(r.result, 320);
    if (!dosya) {
      hatalar[x.kod] = /not found|forward/i.test(r.description || "") || r.ok ? 3 : (hatalar[x.kod] || 0) + 1;
      continue;
    }
    try {
      gorseller.push({ kimlik: x.kod, b64: await dosyaIndir(env, tg, dosya), dosya, mesaj: x.mesaj });
    } catch {
      hatalar[x.kod] = (hatalar[x.kod] || 0) + 1;
    }
  }
  if (gorseller.length) {
    const yeni = await tarifle(env, gorseller);
    for (const g of gorseller) {
      if (yeni[g.kimlik]) tarifler[g.kimlik] = { t: yeni[g.kimlik], f: g.dosya, m: g.mesaj };
      else hatalar[g.kimlik] = (hatalar[g.kimlik] || 0) + 1;
    }
    await env.KAYIT.put("tarifler", JSON.stringify(tarifler));
  }
  await env.KAYIT.put("tarifhata", JSON.stringify(hatalar));
}

async function fotoTani(msg, env, simdi) {
  const sohbet = msg.chat.id;
  const yaz = (text) => telegram(env, "sendMessage", { chat_id: sohbet, text, disable_web_page_preview: true });
  if (!env.ANTHROPIC_API_KEY) return yaz("Fotoğraf tanıma için yapay zekâ bağlı değil.");
  if (await sinirAsildiMi(env, simdi)) return yaz(SINIR_MESAJI);
  const tarifler = (await env.KAYIT.get("tarifler", "json")) || {};
  const silinenler = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  const katalog = Object.entries(tarifler).filter(([k, v]) => !silinenler[k] && !/kıyafet yok/i.test(v.t));
  if (!katalog.length) {
    const arsiv = await env.KAYIT.get("arsiv", "json");
    return yaz(arsiv ? "Katalog hâlâ hazırlanıyor; bitince haber vereceğim, sonra fotoğrafı tekrar gönderin." : "Fotoğraf tanıma için önce \"Kemal arşiv\" kanalının bağlanması gerekiyor (Claude Code'daki talimata bakın).");
  }
  const gun = gunAnahtari(simdi);
  const sayac = Number((await env.KAYIT.get(`ai:${gun}`)) || 0);
  if (sayac >= 100) return yaz("Bugünkü 100 yapay zekâ mesajı sınırı doldu; yarın tekrar deneyin.");
  await env.KAYIT.put(`ai:${gun}`, String(sayac + 1), { expirationTtl: 2 * 86400 });
  await telegram(env, "sendChatAction", { chat_id: sohbet, action: "typing" });

  const tg = (metod, govde) => telegram(env, metod, govde);
  const ipucu = (msg.caption || "").slice(0, 200);
  let sonuc;
  let gecerli;
  try {
    const musteri = await dosyaIndir(env, tg, medyaDosyasi(msg, 800));
    const secilen = (await adaySec(env, musteri, katalog.map(([k, v]) => `${k} | ${v.t}`), ipucu)).filter((k) => tarifler[k]);
    if (!secilen.length) return yaz("Bu fotoğrafta katalogdaki modellere benzeyen bir kıyafet bulamadım. Daha net bir fotoğraf gönderebilir misiniz?");
    const adaylar = [];
    for (const k of secilen.slice(0, TANIMA_ADAY)) {
      try {
        adaylar.push({ kimlik: k, b64: await dosyaIndir(env, tg, tarifler[k].f) });
      } catch { /* indirilemeyen aday atlanır */ }
    }
    sonuc = await karsilastir(env, musteri, adaylar, ipucu);
    gecerli = [...new Set([sonuc.en_iyi, ...(sonuc.siralama || []), ...secilen].filter((k) => k && tarifler[k]))];
  } catch (e) {
    return yaz(e instanceof Anthropic.APIError ? hataMesaji(e) : `Fotoğraf işlenemedi (${e.message}). Tekrar deneyin.`);
  }

  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  const sonpaylasim = (await env.KAYIT.get("sonpaylasim", "json")) || {};
  const kanal = await env.KAYIT.get("kanal", "json");
  const sonTarih = (k) => Math.max(...modelSecenekleri(k, kodlar, kodsuz).map((x) => x.tarih), sonpaylasim[k] || 0);
  const ad = (k) => (kodsuzMu(k) ? `kodsuz paylaşım (${tarihUzun(sonTarih(k))})` : k);
  const emin = sonuc.guven === "yuksek" && sonuc.en_iyi && tarifler[sonuc.en_iyi];
  const gosterilecek = emin ? [sonuc.en_iyi] : gecerli.slice(0, 3);
  const baslik = emin
    ? `🔎 Bu büyük ihtimalle <b>${kac(ad(sonuc.en_iyi))}</b> — son paylaşım ${tarihUzun(sonTarih(sonuc.en_iyi))}.\n${kac(sonuc.aciklama)}`
    : `🤔 Emin değilim${sonuc.guven === "orta" && sonuc.en_iyi ? ` (en yakın: <b>${kac(ad(sonuc.en_iyi))}</b>)` : ""}. En yakın ${gosterilecek.length} aday aşağıda.\n${kac(sonuc.aciklama)}`;
  await telegram(env, "sendMessage", { chat_id: sohbet, text: baslik, parse_mode: "HTML", disable_web_page_preview: true });
  for (const [i, k] of gosterilecek.entries()) {
    const sec = modelSecenekleri(k, kodlar, kodsuz)[0];
    if (!sec) continue;
    await telegram(env, "copyMessage", {
      chat_id: sohbet,
      from_chat_id: kanal.id,
      message_id: sec.ids[0],
      caption: `${emin ? "" : `Aday ${i + 1}: `}${ad(k)} · son paylaşım ${tarihUzun(sonTarih(k))}${kanal.kullanici ? `\nt.me/${kanal.kullanici}/${sec.ids[0]}` : ""}`,
    });
  }
}

const kac = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- Müşteri modunun dışarıyla tek bağlantısı ----------

function musteriYardimcilari(env) {
  return {
    gonder: (metod, govde) => telegram(env, metod, govde),
    // Konuşmayı sahibe ve Merdan'a iletir; yanıtlarsanız müşteriye gider.
    async ekibeIlet(msg, baslik, ozet, fotoMesaj = null) {
      const k = msg.from;
      const metin = [
        `📩 ${baslik}`,
        `Müşteri: ${[k.first_name, k.last_name].filter(Boolean).join(" ") || "?"}${k.username ? ` (@${k.username})` : ""} · dil: ${dilSec(k)} · id ${k.id}`,
        ozet ? `Özet: ${ozet}` : null,
        msg.text ? `Son mesajı: "${String(msg.text).slice(0, 500)}"` : null,
        "↩️ Bu mesajı yanıtlayın, yazdığınızı Kemal müşteriye iletir.",
      ].filter(Boolean).join("\n");
      for (const kisi of [hemraId(env)].filter(Boolean)) { // 10 Kasım (Patron): müşteri mesajları SADECE Hemra'ya (ileride Defne)
        const r = await telegram(env, "sendMessage", { chat_id: kisi, text: metin, disable_web_page_preview: true });
        if (r.ok) await env.KAYIT.put(`iletim:${kisi}:${r.result.message_id}`, String(msg.chat.id), { expirationTtl: 7 * 86400 });
        if (fotoMesaj) {
          const f = await telegram(env, "copyMessage", { chat_id: kisi, from_chat_id: msg.chat.id, message_id: fotoMesaj });
          if (f.ok) await env.KAYIT.put(`iletim:${kisi}:${f.result.message_id}`, String(msg.chat.id), { expirationTtl: 7 * 86400 });
        }
      }
    },
  };
}

// ---------- Yapay zekâ asistanının araçları ----------

function asistanYardimcilari(env) {
  const kayitliMi = async (kod) => {
    if (!kod) return false;
    if (kodsuzMu(kod)) return Boolean(((await env.KAYIT.get("kodsuz", "json")) || {})[kod]);
    return Boolean((((await env.KAYIT.get("kodlar", "json")) || {})[kod] || []).length);
  };
  return {
    gunAnahtari,
    tarihYaz,
    kisiAdi,
    kodNormal,
    gonder: (sohbet, text) => telegram(env, "sendMessage", { chat_id: sohbet, text, disable_web_page_preview: true }),
    // Asistanın Markdown cevabı Telegram HTML'i olarak; biçim hatasında düz metin.
    async gonderBicimli(sohbet, html, duz) {
      const r = await telegram(env, "sendMessage", { chat_id: sohbet, text: html, parse_mode: "HTML", disable_web_page_preview: true });
      if (!r.ok) return telegram(env, "sendMessage", { chat_id: sohbet, text: duz, disable_web_page_preview: true });
      return r;
    },
    yaziyor: (sohbet) => telegram(env, "sendChatAction", { chat_id: sohbet, action: "typing" }),

    async durumOzeti(simdi) {
      const bugun = await bugunSayac(env, simdi);
      const kuyruk = await kuyrukListesi(env);
      const tur = await env.KAYIT.get("tur", "json");
      const turDurumu = !tur ? `Henüz tur başlamadı (ilk tur ${SABAH_SAATI}:00'da).`
        : tur.durum === "toplaniyor" ? `Bugünün turu (${tur.no}.): ${tur.onaylar.length} onay, ${Object.values(tur.ogeler).filter((o) => !o.karar).length} model cevap bekliyor (${Object.entries(tur.ogeler).filter(([, o]) => !o.karar).map(([k]) => kodGoster(k)).join(", ")}).`
        : `${tur.no}. tur kapandı; yeni tur sabah ${SABAH_SAATI}:00'de.`;
      return [
        `Bugün kanala yapılan yeniden paylaşım: ${bugun}/${GUNLUK_SINIR} (kalan ${Math.max(0, GUNLUK_SINIR - bugun)}).`,
        await haftaOzeti(env, simdi),
        `Sırada bekleyen onaylı paylaşım: ${kuyruk.length}${kuyruk.length ? " — " + kuyruk.map((o) => kodGoster(o.kod)).join(", ") : ""}.`,
        turDurumu,
        `Bu ay yapay zekâ harcaması (tahmini): ${(await buAyHarcanan(env, simdi)).toFixed(2)} $ / ${AYLIK_SINIR_USD} $.`,
        `Kurallar: günde tek tur (sabah ${SABAH_SAATI}:00, ${TUR_ADET} model). Onaylanan aynı gün paylaşılır: ${SABAH_SAATI}:00–${AKSAM_SAATI}:00, ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla, günde en fazla ${GUNLUK_SINIR}. ${AKSAM_SAATI}:00'de paylaşılamayanlar sıradan çıkar.`,
      ].join("\n");
    },

    async modelBilgisi(kod, simdi) {
      if (!(await kayitliMi(kod))) return `${kod} kayıtlı değil.`;
      const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
      const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
      const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
      const arsiv = ((await env.KAYIT.get("hicgelmeyecek", "json")) || {})[kod];
      const sonpaylasim = ((await env.KAYIT.get("sonpaylasim", "json")) || {})[kod];
      const tarihler = [...new Set([...(kodsuzMu(kod) ? [kodsuz[kod].tarih] : kodlar[kod].map((g) => g.tarih)), ...(sonpaylasim ? [sonpaylasim] : [])])].sort((a, b) => b - a);
      const satirlar = [
        `${kodGoster(kod)} (${kod}): ${tarihler.length} paylaşım, kanalda ${modelMesajlari(kod, kodlar, kodsuz).length} mesaj.`,
        `Paylaşım tarihleri (yeniden eskiye): ${tarihler.slice(0, 15).map(tarihUzun).join(", ")}`,
      ];
      const tur = await env.KAYIT.get("tur", "json");
      const turdaki = tur && tur.durum === "toplaniyor" && tur.ogeler[kod];
      if (arsiv) satirlar.push(`Durum: SİLİNDİ (${arsiv.kim}, ${tarihUzun(arsiv.zaman)}); kanal paylaşımları silindi, bir daha önerilmez.`);
      else if (turdaki && !turdaki.karar) satirlar.push(`Durum: ${tur.no}. turda cevap bekliyor.`);
      else if (turdaki && turdaki.karar === "t1") satirlar.push(`Durum: bugünün turunda onaylandı (${turdaki.kim}); bugün paylaşım sırasında.`);
      else if (await env.KAYIT.get(`kuyruk:${kod}`)) satirlar.push("Durum: onaylandı, paylaşım sırasında.");
      else if (atlananlar[kod] > simdi) satirlar.push(`Durum: ${tarihUzun(atlananlar[kod])} tarihine kadar önerilmeyecek.`);
      else satirlar.push(tarihler[0] < simdi - BEKLEME_SN ? "Durum: öneri listesine girebilir." : `Durum: son ${BEKLEME_GUN} günde paylaşılmış, henüz önerilmez.`);
      return satirlar.join("\n");
    },

    async beklesin(kod, kim, simdi) {
      if (!(await kayitliMi(kod))) return `${kod} kayıtlı değil; işaretlenmedi.`;
      const r = await turKarar(env, kod, "t7", kim, simdi);
      if (r.ok) return `${kodGoster(kod)} turda "beklesin" olarak işaretlendi; ${BEKLESIN_GUN} gün sonra tekrar sorulacak.`;
      if (r.neden === "zaten") return `${kodGoster(kod)} bu turda zaten işaretlenmiş (${r.kim}).`;
      await atla(env, kod, BEKLESIN_GUN, simdi);
      return `${kodGoster(kod)} ${BEKLESIN_GUN} gün önerilmeyecek (${kim}).`;
    },

    async hicOnayIste() { // 13 Kasım (Patron, kural 41): ekibe "Sil" düğmesi gitmez — silme sadece Patron ve Venom'da
      return "Silme bende değil: silme sadece Patron ve Venom'dadır. Patron Venom'a yazarsa Venom stoğa bakıp yapar.";
    },

    async paylasimOnizle(msg, kod) {
      if (kodsuzMu(kod)) return "Kodsuz paylaşımlar tur mesajlarından onaylanır; tek başına önizlenemez.";
      await paylasOnizle({ ...msg, text: `/paylas ${kod}` }, env);
      return "Önizleme ve Onayla/İptal düğmeleri kullanıcıya gönderildi (kod bulunamadıysa bot bunu yazdı). Kanala henüz hiçbir şey paylaşılmadı.";
    },

    async altyaziOner(kod) {
      if (!(await kayitliMi(kod)) || kodsuzMu(kod)) return `${kod} için kanal paylaşımı bulunamadı (kodsuz paylaşımlarda alt yazı önerilmez).`;
      const g = ((await env.KAYIT.get("kodlar", "json")) || {})[kod].filter((x) => x.ids.some((id) => id > 0)).sort((a, b) => b.tarih - a.tarih)[0];
      await altyaziSirayaEkle(env, g.y ? { kod, mesaj: g.y, eski: null, ids: [g.y], etiket: ETIKET.repete } : { kod, ids: g.ids.filter((id) => id > 0), eski: null, etiket: ETIKET.repete });
      return `${kod} için alt yazı önerisi sıraya alındı; birkaç dakika içinde "✅ Değiştir / ❌ Kalsın" düğmeleriyle gelecek. Onaylanmadan değişmez.`;
    },

    async istekKaydet(kod, musteri, not, kim, simdi) {
      if (!kod) return "Kod belirtilmedi; kaydedilmedi.";
      const id = await istekKaydet(env, kod, musteri, not, kim, simdi);
      const kayitli = await kayitliMi(kod);
      return `İstek #${id} kaydedildi: ${kod} — ${musteri}${not ? ` (${not})` : ""}. Model kanala gelince ikinize hatırlatacağım.${kayitli ? "" : " Not: bu kod kanal kayıtlarında yok; kodu kontrol edin."}`;
    },

    async istekleriGoster(kod) {
      const istekler = (await env.KAYIT.get("istekler", "json")) || [];
      const liste = istekler.filter((i) => (!kod || i.kod === kod) && i.durum === "bekliyor");
      if (!liste.length) return kod ? `${kod} için bekleyen istek yok.` : "Bekleyen müşteri isteği yok.";
      return liste.map((i) => `#${i.id} ${i.kod} — ${i.musteri}${i.not ? ` (${i.not})` : ""}, ${i.kim}, ${tarihUzun(i.zaman)}`).join("\n");
    },

    async kuyrukGoster(sohbet) {
      await kuyrukGoster(sohbet, env);
      return "Sıra listesi iptal düğmeleriyle kullanıcıya gönderildi.";
    },
  };
}

// ---------- Yardımcılar ----------

// 5 Kasım (Patron): TEK KAPI — Patron'un kişisel hesabına giden her şey Venom'a aktarılır (tek-kapi.js)
async function telegram(env, metod, govde) {
  if (govde && venomCevabi(metod, govde)) return govde.text ? venomaAktar(env, "kemal", "sendMessage", { chat_id: env.MURAT_ID, text: `ℹ️ ${govde.text}` }) : { ok: true, result: true };
  if (govde && (await patronaGider(env, govde.chat_id))) { const r = await venomaAktar(env, "kemal", metod, govde, (m, g) => telegramGercek(env, m, g)); await defterTg(env, "kemal", metod, govde, r); return r; }
  const r = await telegramGercek(env, metod, govde);
  await defterTg(env, "kemal", metod, govde, r); // 9 Kasım: iş defteri (Venom her şeyi bilir)
  return r;
}
async function telegramGercek(env, metod, govde) {
  // 10 Kasım (görev kâğıdı): satırda en fazla 2 düğme, yazı sınırı, hata bir kez düzeltilip denenir → "kemal:tgHatalar"; 🧪 DENEME kartı → "kemal:kanit"
  return guvenliGonder(env, "kemal", async (m, g) => {
    const token = String(env.BOT_TOKEN || "").trim();
    const r = await fetch(`https://api.telegram.org/bot${token}/${m}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(g),
    });
    return r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  }, metod, govde);
}

function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

export function gunAnahtari(unix) {
  return new Date((unix + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
}


function tarihYaz(unix) {
  const s = new Date((unix + SAAT_FARKI) * 1000).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

function kisalt(metin) {
  const tek = (metin || "").replace(/\s+/g, " ").trim();
  return tek.length > 80 ? tek.slice(0, 77) + "..." : tek;
}
