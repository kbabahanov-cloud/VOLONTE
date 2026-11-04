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

import Anthropic from "@anthropic-ai/sdk";
import { asistanCevapla, anahtarKontrol, hataMesaji } from "./asistan.js";
import { medyaDosyasi, dosyaIndir, dosyaBaytIndir, tarifle, adaySec, karsilastir, ayniModelMi } from "./tanima.js";
import { markaBas } from "./marka.js";
import { musteriIsle, dilSec } from "./musteri.js";
import { kodsuzMu, kodGoster, tarihUzun, modelSecenekleri, kodBul, kodNormal } from "./ortak.js";

export { kodBul, kodNormal };
import { altyaziOlustur, ETIKET, BEDEN_GRUPLARI, bedenOnerisi, bedenYaz } from "./altyazi.js";
import { SITE_VERI, PAYLASIM_ARASI_GUN, COK_SATAN_GUN, DURUMLAR, DUZELT_ORNEK, altYazi, dugmeler, albumNotu, siteMedyasi, durumSec, gununModelleri, telegramTarihleri, duzeltmeCoz, yaziHazirla, renkCevir, kisaHata, gecici } from "./duzen.js";
import { StokDO, stokKodu, indirimliMi, INDIRIMLI } from "./stok.js";
import { siteVerisi } from "./depo-oku.js";
import { kuyrugaEkle, kuyruguAl } from "./venom-kopru.js";
import { stokIste, stokSorulariGonder as stokSorulariGonderOrtak, stokKarari as stokKarariOrtak, stokGoster as stokGosterOrtak } from "./stokbot.js";
import { karmaDepo, gocBirKez, KEMAL_YEREL } from "./depo.js";
import { grubaGonder, grupUyeligi, raporZamani, raporuBirak, topluRapor, aylikRapor, birikimSuzgeci, birikimAdimi, patronDenemesi } from "./venom.js";
import { murat as muratId, muratMi, sorumlu as hemraId, denemeKaydi, denemeOzeti, DENEME } from "./fabrika.js";

export { StokDO };
import { sinirAsildiMi, buAyHarcanan, ayAnahtari, AYLIK_SINIR_USD, UYARI_ORANI, SINIR_MESAJI } from "./harcama.js";

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
const SABAH_SAATI = 8; // paylaşım bu saatte başlar (ilk tur / hatırlatma da)
const AKSAM_SAATI = 20; // paylaşımlar en geç bu saatte biter
const GUNLUK_SINIR = 10;
const TUR_ADET = 10; // bir turda toplanacak onay sayısı
const BEKLEME_GUN = 30; // bu kadar gündür paylaşılmayan modeller önerilir
const BEKLESIN_GUN = 7; // "Beklesin" denen model bu kadar gün sonra tekrar sorulur
export const KALICI = 4102444800; // 2100 yılı: "Sil" denen model bir daha önerilmez
const SILME_ADIM = 20; // bir çalışmada en fazla bu kadar mesaj silinir (Telegram çağrı sınırı 50)
const ARALIK_DK = [50, 60]; // tur paylaşımları arası (~saatte bir; 08–20 arası günde 10 rahat sığar)
const ESKI_ARALIK_DK = [60, 90]; // tur sisteminden önce onaylanmış (21 Ekim) sıradakiler
const YIL_SN = 365 * 86400; // sadece son 1 yılın paylaşımları önerilir
export const KODSUZ_KALIP = /available\s+again|dispon[iİı]ble/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) {
        return new Response("yetkisiz", { status: 401 });
      }
      const update = await request.json();
      // Birikmiş mesaj koruması: veritabanına gitmeden önce (eski mesaja cevap yok, müşteri mesajı listeye).
      if (await birikimSuzgeci(env, "kemal", update, (id) => kisilerden(env).includes(String(id)), telegram)) return new Response("ok");
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
    try { await patronDenemesi(env, "Kemal", telegram); } catch { /* */ }
    try { await birikimAdimi(env, "kemal", Math.floor(Date.now() / 1000), telegram); } catch (e) { await env.KAYIT.put("kemal:birikimHata", String(e && e.message).slice(0, 300), { expirationTtl: 86400 }); }
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
    // Aylık yapay zekâ harcaması %80'i geçince bir kez haber ver.
    const harcanan = await buAyHarcanan(env, kayit.zaman);
    const uyariAnahtari = `${ayAnahtari(kayit.zaman)}:uyari`;
    if (env.BOT_TOKEN && harcanan >= AYLIK_SINIR_USD * UYARI_ORANI && !(await env.KAYIT.get(uyariAnahtari))) {
      await env.KAYIT.put(uyariAnahtari, "1", { expirationTtl: 70 * 86400 });
      for (const kisi of yoneticilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ Bu ay yapay zekâya yaklaşık ${harcanan.toFixed(2)} $ harcandı (sınır ${AYLIK_SINIR_USD} $). Sınıra gelince yapay zekâ cevapları ve fotoğraf tanıma ay sonuna kadar durur; turlar ve komutlar çalışır.` });
    }
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
  if (update.callback_query) return dugmeIsle(update.callback_query, env);
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
  if (ekipMi(kimden.id, env)) return ekipMesaji(msg, env);
  if (!izinliMi(kimden.id, env)) {
    await env.KAYIT.put(
      `bekleyen:${kimden.id}`,
      JSON.stringify({ ad: [kimden.first_name, kimden.last_name].filter(Boolean).join(" "), kullanici: kimden.username || null, zaman: msg.date, metin: (msg.text || "").slice(0, 50) }),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );
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
  "Komut yazmadan da konuşabilirsiniz: \"bu turda kaç onay var\", \"3357 beklesin\", \"3357'yi sil\", \"bu hafta kaç paylaşım yaptık\". Paylaşma ve silme için yine düğmeyle onay isterim.",
  "",
  "Kanala yapılan her paylaşımı otomatik kaydediyorum.",
  `Tur: her sabah ${SABAH_SAATI}:00'de uzun süredir paylaşılmayan ${TUR_ADET} modeli bütün paylaşım tarihleriyle gönderirim; onayladığınız aynı gün ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla paylaşılır (günde en fazla ${GUNLUK_SINIR}). ${AKSAM_SAATI}:00'de paylaşılamayanlar sıradan çıkar, ileride yeniden sorulur.`,
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
  if (/^(y1|yd|yg|yb):/.test(veri)) return yeniTurDugmesi(cq, env);
  if (/^(rp1|rpd|rpx):/.test(veri)) return repeteDugmesi(cq, env);
  if (/^(t1|t7|tx|ty|tv|tg|tb):/.test(veri)) return turDugmesi(cq, env);
  if (/^(r0|r1|r7|r30|rx|hx|hv):/.test(veri)) return cevapla("Bu eski liste artık kullanılmıyor; yeni tur mesajlarını kullanın.");
  if (veri.startsWith("kq:")) return kuyrukIptal(cq, env);
  if (veri.startsWith("kr:")) return repetePaylasKarari(cq, env);
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
  await cevapla("Paylaşıldı ✅");
  return duzenle(`✅ ${onay.kod} kanalda yeniden paylaşıldı.${sonuc.link ? "\n" + sonuc.link : ""}`);
}

// Kanala yeniden paylaşımın tek yolu. Bot kendi kanal paylaşımlarını güncelleme
// olarak almadığı için kod dizinini, günlük sayacı ve /hafta sayısını burada günceller.
export async function kanaldaPaylas(env, kod, ids, simdi, beden = null) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  // Kopyalar kanala düşünce channel_post olarak gelir; hangi modele ait olduklarını bilmek için işaret.
  await env.KAYIT.put("kopya", JSON.stringify({ kod, zaman: simdi, kalan: ids.length }), { expirationTtl: 600 });
  let sonuc = null;
  let markaNotu = null;
  // Marka açıksa ya da beden seçildiyse paylaşım yeniden yüklenir (alt yazının beden satırı
  // seçilen grupla değişir); olmazsa aynen kopyalanır.
  const marka = (await env.KAYIT.get("marka")) === "acik" && Boolean(env.IMAGES);
  // Sadece videosu olan modelde Selin'in ürettiği ve onaylanan kare (kare:<kod>) eklenir.
  const kare = await env.KAYIT.get(`kare:${kod}`, "json");
  const onayliKare = kare && kare.durum === "onayli" ? kare : null;
  if (marka || BEDEN_GRUPLARI[beden] || onayliKare) {
    const m = await markaliGonder(env, kanal.id, kod, ids, null, { marka, beden, kare: onayliKare });
    if (m.ok) sonuc = { ok: true, result: m.mesajlar.map((id) => ({ message_id: id })) };
    else markaNotu = `${marka ? "marka basılamadı" : onayliKare ? "kare eklenemedi" : "beden yazılamadı"} (${m.hata}), olduğu gibi paylaşıldı`;
  }
  if (!sonuc) sonuc = await telegram(env, "copyMessages", { chat_id: kanal.id, from_chat_id: kanal.id, message_ids: ids });
  if (!sonuc.ok) {
    await env.KAYIT.delete("kopya");
    const ipucu = /rights|admin|not enough|forbidden/i.test(sonuc.description || "")
      ? " — botun kanalda \"Mesaj gönderme\" yetkisi açık mı?" : /not found|to copy/i.test(sonuc.description || "") ? " — paylaşım kanaldan silinmiş olabilir." : "";
    return { ok: false, hata: `${sonuc.description}${ipucu}` };
  }
  // Telegram kanala kopyalarken yeni mesaj kimliğini 0 dönebiliyor; gerçek kimlikler
  // kopyalar kanala düşünce channel_post olarak gelir (paylasimKaydet + `kopya` işareti).
  const yeniIds = sonuc.result.map((r) => r.message_id).filter((id) => id > 0);

  // Son paylaşım tarihi ayrı tutulur; kod dizinine gerçek kimlikler channel_post ile girer.
  const sonpaylasim = (await env.KAYIT.get("sonpaylasim", "json")) || {};
  sonpaylasim[kod] = simdi;
  await env.KAYIT.put("sonpaylasim", JSON.stringify(sonpaylasim));
  // Kanalın /hafta sayısı (gun:) channel_post ile artar; burada sadece botun günlük sınır sayacı.
  await env.KAYIT.put(`sayac:${gunAnahtari(simdi)}`, String((await bugunSayac(env, simdi)) + 1), { expirationTtl: 3 * 86400 });

  const link = kanal.kullanici && yeniIds.length ? `https://t.me/${kanal.kullanici}/${yeniIds[0]}` : null;
  return { ok: true, link, ids: yeniIds, markaNotu };
}

async function telegramForm(env, metod, form) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", body: form });
  return r.json();
}

// Kanal paylaşımını fotoğraflara marka basarak yeniden yükler (videolar olduğu gibi).
// Medya ve yazı, mesajlar arşiv kanalına iletilerek okunur.
// 4 Kasım (Patron): fotoğraf etiketi modelin MARKASIYLA — model kartı (pelinboy:<kod>.marka), yoksa Sami'nin deposu (tek mağaza)
export async function modelMarkasi(env, kod) {
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

async function bugunSayac(env, simdi) {
  return Number((await env.KAYIT.get(`sayac:${gunAnahtari(simdi)}`)) || 0);
}

// ---------- Günlük yeniden paylaşım ----------

const saat = (simdi) => ((simdi + SAAT_FARKI) % 86400) / 3600;
// Bildirim alanlar: yöneticiler + ekip. Harcama ve müşteri iletileri sadece yöneticilere.
const kisilerden = (env) => [...new Set([...kimlikler(env.ALLOWED_IDS), ...kimlikler(env.EKIP_IDS)])];
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
  // Gün sonu (20:00): bugün paylaşılamayan onaylılar sıradan çıkar, ileride yeniden sorulur;
  // bugünün turu kapanır (eski düğmeler "geçerli değil" der).
  let gunSonuNotu = null;
  if (s >= AKSAM_SAATI && !(await env.KAYIT.get(`gunsonu:${gun}`))) {
    await env.KAYIT.put(`gunsonu:${gun}`, "1", { expirationTtl: 3 * 86400 });
    gunSonuNotu = await gunSonu(env, tur, simdi);
  }
  if (s >= RAPOR_SAATI && s < RAPOR_SAATI + 3 && !(await env.KAYIT.get(`rapor:${gun}`))) {
    await env.KAYIT.put(`rapor:${gun}`, "1", { expirationTtl: 3 * 86400 });
    await aksamRaporu(env, simdi, gunSonuNotu);
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
  if (s < SABAH_SAATI || s >= AKSAM_SAATI) return;

  // Günde tek tur: o günün turu yoksa sabah açılır (yeni düzen: stokta + sitede + 14 gündür paylaşılmamış 10 model).
  if (!tur || turGunu(tur) < gun) {
    // ESKI_TUR=1: eski düzen (kanal paylaşımı kopyası; sadece testlerde/geri dönüş için).
    if (!siliyor) await (env.ESKI_TUR === "1" ? turBaslat(env, tur, simdi) : yeniTurBaslat(env, tur, simdi));
    return;
  }
  const paylasti = await siradakiniPaylas(env, simdi);
  // Sonradan eklenen / geç /start yazan kişiye bugünün bekleyen modelleri (istek sınırı için
  // paylaşım ya da silme yapılan çalışmada değil).
  if (!paylasti && !siliyor) await turEksikleriGonder(env, 10);
  // Stok soruları (Beklesin süresi dolanlar ya da köprü çalışmasında gönderilemeyenler).
  if (!paylasti && !siliyor) await stokSorulariGonder(env, simdi);
}

const turGunu = (tur) => tur.gun || gunAnahtari(tur.basla);

async function gunSonu(env, tur, simdi) {
  // Yeni düzende onaylananlar ertesi güne kalır (paylaşım anında stok yeniden kontrol edilir); tur da sabaha kadar açık.
  const kuyruk = (await kuyrukListesi(env)).filter((o) => !o.yeni);
  for (const o of kuyruk) await env.KAYIT.delete(`kuyruk:${o.kod}`);
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
    [{ text: "⏳ Beklesin", callback_data: `t7:${no}:${kod}` }, { text: "🗑️ Sil", callback_data: `tx:${no}:${kod}` }],
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
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
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
  let konan = 0, hata = null;
  if (k && k.kopya && k.kopya.length && k.arsivKanal) {
    const ids = k.kopya.map((x) => x.arsiv).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += 100) {
      const r = await telegram(env, "copyMessages", { chat_id: kanal.id, from_chat_id: k.arsivKanal, message_ids: ids.slice(i, i + 100) });
      if (r.ok) konan += (r.result || []).length; else hata = hata || r.description || "bilinmeyen hata";
    }
  }
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  for (const [a, v] of Object.entries(arsiv)) if (a === kod || v.ana === kod) delete arsiv[a];
  await env.KAYIT.put("hicgelmeyecek", JSON.stringify(arsiv));
  if (konan && !hata) await env.KAYIT.delete(`silinen:${kod}`);
  const soldout = ((k && k.kopya) || []).filter((x) => x.gizlendi).map((x) => (kanal.kullanici ? `https://t.me/${kanal.kullanici}/${x.kanal}` : `#${x.kanal}`));
  const siteOk = ["geri kondu", "zaten sitede"].includes(site);
  const metin0 = siteOk && !hata && (konan || !(k && k.kopya && k.kopya.length))
    ? `↩️ ${kodGoster(kod)} geri kondu: site ${site}; kanala ${konan} mesaj geri kondu${konan ? " (yeni tarihle)" : " (arşivde kopya yoktu)"}.`
    : `⚠️ ${kodGoster(kod)} geri koyma: site ${site || "?"}; kanal ${konan} mesaj${hata ? `, hata: ${hata}` : ""}${!k ? " (arşiv kaydı yok)" : ""}.`;
  const metin = soldout.length ? `${metin0}\nKanalda SOLD OUT görselli ${soldout.length} eski paylaşım duruyor; isterseniz elle silin:\n${soldout.join("\n")}` : metin0;
  await telegram(env, "sendMessage", { chat_id: muratId(env), text: metin, disable_web_page_preview: true });
}

async function silmeDevam(env) {
  const { keys } = await env.KAYIT.list({ prefix: "silinecek:" });
  if (!keys.length) return false;
  await silmeAdimi(env, keys[0].name.slice("silinecek:".length));
  return true;
}

async function siradakiniPaylas(env, simdi) {
  const sonraki = Number((await env.KAYIT.get("sonraki")) || 0);
  if (simdi < sonraki) return;
  if ((await bugunSayac(env, simdi)) >= GUNLUK_SINIR) return;
  const [oge] = await kuyrukListesi(env);
  if (!oge) return;

  // Önce sıradan çıkar: görev üst üste çalışırsa aynı model iki kez paylaşılmasın.
  await env.KAYIT.delete(`kuyruk:${oge.kod}`);
  const [en, ek] = oge.tur ? ARALIK_DK : ESKI_ARALIK_DK;
  const aralik = (en + Math.floor(Math.random() * (ek - en + 1))) * 60;
  await env.KAYIT.put("sonraki", String(simdi + aralik));

  const sonuc = oge.yeni ? await yeniKanalaPaylas(env, oge.paket, simdi) : await kanaldaPaylas(env, oge.kod, oge.ids, simdi, oge.beden);
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
    if (hak <= 0 || s >= AKSAM_SAATI || s < SABAH_SAATI) {
      t = sabahBaslangici(t, s >= SABAH_SAATI);
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
  return gunBasi + SABAH_SAATI * 3600 - SAAT_FARKI;
}

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
// Günlük modeller Sami'nin stoğundan (stokta + sitede + ≥14 gün paylaşılmamış), medya siteden, alt yazı yeni düzende,
// fiyat YOK. Önizleme Murat'a ve Hemra'ya: ✅ Paylaş / ✏️ Düzelt / ❌ Geç. Onaylanan sıraya girer (08–20, 50–60 dk arayla,
// günde en fazla 10; akşam onaylananlar ertesi güne kalır, stoğu biterse paylaşılmaz). Eski paylaşımlara dokunulmaz.

const onizleyenler = (env) => [...new Set([muratId(env), hemraId(env)])];
const GEC_GUN = 7; // "❌ Geç" denen model bu kadar gün sonra yeniden önerilir
const HAZIRLIK_PARTI = 3; // bir çalışmada yapay zekâyla hazırlanan model yazısı

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
async function paketHazirla(env, u, baglam, simdi, { durum = null, medya = null } = {}) {
  let yazi = await env.KAYIT.get(`yazi:${u.kod}`, "json");
  if (!yazi) {
    yazi = await yaziHazirla(env, u);
    await env.KAYIT.put(`yazi:${u.kod}`, JSON.stringify(yazi));
  }
  // 4 Kasım (Patron): renk MODEL KARTINDAN (3627 = koyu bordo, "black" değil); kart yoksa eski yazı
  const kart = await env.KAYIT.get(`pelinboy:${u.kod}`, "json").catch(() => null);
  if (kart && kart.renk) {
    const r = String(kart.renk).toLocaleLowerCase("tr").trim(), ton = r.match(/^(koyu|açık|acik)\s+(.+)$/);
    const en = renkCevir([r]) || (ton && renkCevir([ton[2]]) ? renkCevir([ton[2]]).map((x) => `${ton[1] === "koyu" ? "dark" : "light"} ${x}`) : null);
    if (en) yazi = { ...yazi, renkler: en, renkEmin: true, renkNotu: "" };
  }
  const st = baglam.stok[u.kod] || {};
  return {
    kod: String(u.kod),
    baslik: u.baslik || "",
    durum: durum || yazi.durum || durumSec({ kod: String(u.kod), ilkPaylasim: baglam.tarih.ilk[u.kod], toplam: st.toplam, bedenler: u.bedenler, geldiZaman: baglam.geldi[u.kod], satislar: baglam.satislar, simdi }),
    renkler: yazi.renkler || [],
    renkEmin: Boolean(yazi.renkEmin),
    renkNotu: yazi.renkNotu || "",
    kumas: yazi.kumas || null,
    en: yazi.en || "",
    fr: yazi.fr || "",
    bedenler: u.bedenler || "",
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
  const ek = await telegram(env, "sendMessage", { chat_id: hedef, text: albumNotu(paket.kod), parse_mode: "HTML", reply_markup: dugmeler(), disable_web_page_preview: true });
  if (ek.ok) ids.push(ek.result.message_id);
  return { ok: true, ids, not };
}

const yeniKlavye = (no, kod) => ({ inline_keyboard: [[
  { text: "✅ Paylaş", callback_data: `y1:${no}:${kod}` },
  { text: "✏️ Düzelt", callback_data: `yd:${no}:${kod}` },
  { text: "❌ Geç", callback_data: `yg:${no}:${kod}` },
]] });

export function kontrolMetni(p, simdi) {
  const renk = !p.renkler.length ? "⚠️ Renkleri bulamadım — ✏️ Düzelt ile yazın (paylaşmadan önce gerekli)"
    : p.renkEmin ? `${p.renkler.join(", ")} ✅` : `⚠️ Emin değilim (${p.renkler.join(", ")})${p.renkNotu ? ` — ${p.renkNotu}` : ""} → ✏️ Düzelt ile doğru renkleri yazın (paylaşmadan önce gerekli)`;
  return [
    `⬆️ ${p.kod}${p.baslik ? ` · ${p.baslik}` : ""}`,
    `Durum: ${DURUMLAR[p.durum]}`,
    `Renkler: ${renk}`,
    ...(p.renkEmin && p.renkNotu ? [`Not: ${p.renkNotu}`] : []),
    `Kumaş: ${p.kumas || "bilinmiyor → satır konmadı (biliyorsanız ✏️ Düzelt)"}`,
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
    const g = await paketGonder(env, kisi, o.paket, bicim);
    if (!g.ok) {
      await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ ${o.paket.kod} önizlemesi gönderilemedi: ${g.hata}` });
      if (/chat not found|blocked|deactivated/i.test(g.hata || "")) break;
      continue;
    }
    const k = await telegram(env, "sendMessage", { chat_id: kisi, text: kontrolMetni(o.paket, simdi) + (g.not ? `\n⚠️ ${g.not}` : ""), reply_markup: yeniKlavye(no, o.paket.kod), disable_web_page_preview: true });
    if (k.ok) gonderilen.push([o.paket.kod, k.result.message_id]);
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
  const iki = hic.slice(0, PAYLASILMAMIS_GUNLUK);
  const normal = sec(adet - iki.length, hic);
  return [...iki.slice(0, 1), ...normal, ...iki.slice(1)];
}
export async function yeniTurBaslat(env, onceki, simdi, gruplar = null) {
  const site = await siteUrunleriAl(env);
  const kuyruk = await kuyrukListesi(env);
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
  const haric = [...kuyruk.map((o) => o.kod), ...Object.entries(atlananlar).filter(([, t]) => t > simdi).map(([k]) => k)];
  const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar: site.map((u) => String(u.kod)) }).catch(() => ({})) : {};
  const { son } = await telegramTarihleriAl(env);
  const sec = (adet, disari = []) => gununModelleri({ site, stok, tg: son, haric: [...haric, ...disari, ...INDIRIMLI], simdi, adet }).map((u) => String(u.kod));
  if (!gruplar) {
    // Kullanıcı kararı (31 Ekim): stokta olup Telegram'da HİÇ paylaşılmamış modeller (sitede medyası olanlar) günde en fazla 2:
    // biri listenin başında (sabah), biri sonunda (akşam). Liste bitene kadar. Diğer 8 normal kuralla; 2000 hariç.
    gruplar = [{ baslik: null, kodlar: gunlukSecim(sec, son) }];
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
    return herkese(env, `Bugün önerecek model yok (stokta + sitede + ${PAYLASIM_ARASI_GUN} gündür paylaşılmamış model kalmadı). Yarın sabah tekrar bakacağım.`);
  }
  for (const k of kodlar) tur.ogeler[k] = { paket: null, mesajlar: [], karar: null, kim: null };
  await env.KAYIT.put("tur", JSON.stringify(tur));
  return yeniTurAdimi(env, simdi);
}

// Her 5 dakikada: hazırlanmamış yazıları hazırlar (çalışma başına 3); hepsi hazırsa önizlemeleri gönderir.
export async function yeniTurAdimi(env, simdi) {
  const tur = await env.KAYIT.get("tur", "json");
  if (!tur || !tur.yeni || tur.durum !== "hazirlaniyor") return false;
  const eksik = Object.entries(tur.ogeler).filter(([, o]) => !o.paket && !o.hata).map(([k]) => k);
  if (eksik.length) {
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
  const aciklama = `${giris}\n✅ Paylaş → sıraya girer (${SABAH_SAATI}:00–${AKSAM_SAATI}:00, ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla, günde en fazla ${GUNLUK_SINIR}; akşam onaylanan ertesi sabah paylaşılır, stoğu biterse paylaşılmaz)\n✏️ Düzelt → renk / kumaş / durum / yazıyı siz yazarsınız, yeni önizleme gelir\n❌ Geç → ${GEC_GUN} gün sonra yeniden önerilir\nKanalda hiçbir şey onaysız paylaşılmaz.${hatalar.length ? `\n⚠️ Hazırlanamayan: ${hatalar.join(", ")}` : ""}`;
  const ogeler = [{ baslik: aciklama }];
  for (const g of tur.gruplar) {
    const hazir = g.kodlar.filter((k) => tur.ogeler[k] && tur.ogeler[k].paket);
    if (!hazir.length) continue;
    if (g.baslik) ogeler.push({ baslik: g.baslik });
    for (const k of hazir) ogeler.push({ paket: tur.ogeler[k].paket });
  }
  for (const kisi of onizleyenler(env)) {
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
  if (!["y1", "yg"].includes(islem)) return cevapla("Geçersiz düğme.");
  oge.karar = islem;
  oge.kim = kim;
  if (islem === "y1") tur.onaylar.push(kod);
  await env.KAYIT.put("tur", JSON.stringify(tur)); // önce kilitle
  if (islem === "y1") {
    await env.KAYIT.put(`kuyruk:${kod}`, JSON.stringify({ kod, yeni: true, paket: oge.paket, kim, zaman: simdi + tur.onaylar.length / 1000, tur: tur.no }));
    await cevapla("Sıraya girdi ✅");
  } else {
    await atla(env, kod, GEC_GUN, simdi);
    await cevapla("Geçildi");
  }
  const ek = islem === "y1" ? `✅ ${kim} onayladı — paylaşım sırasına girdi (/kuyruk).` : `❌ ${kim}: geç — ${GEC_GUN} gün sonra yeniden önerilecek.`;
  for (const [kisi, mesajId] of oge.mesajlar) await telegram(env, "editMessageText", { chat_id: kisi, message_id: mesajId, text: `${kontrolMetni(oge.paket, simdi)}\n\n${ek}`, disable_web_page_preview: true });
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
  }
  return true;
}

// Sıradaki yeni düzen paylaşımı: stok hâlâ varsa kanala gönderir; tarih Sami'nin deposuna (tablo) yazılır.
// sayma: günlük 10 paylaşım sayacına dahil mi (repete paylaşımı dahil değil); stokKontrol: repete'de Vegawin gecikebilir → kapalı.
export async function yeniKanalaPaylas(env, paket, simdi, { sayma = true, stokKontrol = true } = {}) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
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
  await env.KAYIT.put("sonpaylasim", JSON.stringify(sonpaylasim));
  if (env.STOK) await stokIste(env, "/tg-yaz", { kayitlar: { [paket.kod]: simdi } }).catch(() => null);
  if (sayma) await env.KAYIT.put(`sayac:${gunAnahtari(simdi)}`, String((await bugunSayac(env, simdi)) + 1), { expirationTtl: 3 * 86400 });
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
const repeteAlicilar = (env, kim) => [...new Set([hemraId(env), String(kim)])];

async function repeteOnizlemeGonder(env, rec) {
  const bicim = (await env.KAYIT.get("bicim")) || "album";
  const simdi = Math.floor(Date.now() / 1000);
  rec.mesajlar = [];
  for (const kisi of rec.alicilar) {
    const g = await paketGonder(env, kisi, rec.paket, bicim);
    if (!g.ok) { await telegram(env, "sendMessage", { chat_id: kisi, text: `⚠️ ${rec.kod} önizlemesi gönderilemedi: ${g.hata}` }); continue; }
    const k = await telegram(env, "sendMessage", { chat_id: kisi, text: repeteKontrol(rec, simdi) + (g.not ? `\n⚠️ ${g.not}` : ""), reply_markup: repeteKlavye(rec.id), disable_web_page_preview: true });
    if (k.ok) rec.mesajlar.push([kisi, k.result.message_id]);
  }
}
const repeteKontrol = (rec, simdi) => [
  rec.tur === "yeni" ? `🆕 YENİ MODEL — ${rec.kod} (siteye ekleyen: ${rec.kim})` : `🔁 Repete paylaşımı — ${rec.kod} (${rec.kim} bildirdi)`,
  `Medya: ${rec.kaynak === "site" ? "siteden" : "kanaldaki son paylaşımdan (eski yazı kullanılmadı)"}`,
  `Renkler: ${rec.paket.renkEmin && rec.paket.renkler.length ? rec.paket.renkler.join(", ") : "yazılmadı → satır yok (✏️ Düzelt ile ekleyebilirsiniz)"}`,
  rec.stokUyari ? `⚠️ ${rec.stokUyari}` : null,
  `Telegram'da son paylaşım: ${rec.paket.tgSon ? tarihUzun(rec.paket.tgSon) : "—"}`,
  "✅ Onayla → sıra beklemeden hemen kanala (günlük 10'a sayılmaz). Fiyat yazılmaz.",
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
    await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 3 * 86400 });
  }
}

async function repeteDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, id] = String(cq.data).split(":");
  const rec = await env.KAYIT.get(`rpt:${id}`, "json");
  if (rec && rec.tur === "yeni" ? !muratMi(env, cq.from.id) : !repeteYetkili(env, cq.from.id)) return cevapla(rec && rec.tur === "yeni" ? "Yeni model onayı Patron'da." : "Bu onay Hemra, Murat ve Merdan'da.");
  if (!rec || rec.durum) return cevapla(rec ? `${rec.karar || "Karar"} verildi.` : "Bu önizleme artık geçerli değil.");
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  const hepsi = async (ek) => { for (const [k, m] of rec.mesajlar) await telegram(env, "editMessageText", { chat_id: k, message_id: m, text: `${repeteKontrol(rec, simdi)}\n\n${ek}`, disable_web_page_preview: true }); };
  if (islem === "rpd") {
    await env.KAYIT.put(`duzelt:${cq.from.id}`, JSON.stringify({ no: "r", id }), { expirationTtl: 3600 });
    await cevapla("Düzeltmeyi yazın");
    return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✏️ ${rec.kod} ${rec.tur === "yeni" ? "yeni model" : "repete"} paylaşımı için düzeltmeyi yazın (1 saat içinde).\n${DUZELT_ORNEK.replace("durum: new | back | best | last | available\n", "")}` });
  }
  rec.durum = islem;
  rec.karar = `${kim}: ${islem === "rp1" ? "onayla" : "iptal"}`;
  await env.KAYIT.put(`rpt:${id}`, JSON.stringify(rec), { expirationTtl: 3 * 86400 }); // önce kilitle
  if (islem === "rpx") { await cevapla("İptal"); return hepsi(`❌ ${kim} iptal etti — kanalda paylaşılmadı.`); }
  await cevapla("Paylaşılıyor");
  const p = await yeniKanalaPaylas(env, rec.paket, simdi, { sayma: false, stokKontrol: false });
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
  for (const r of sira.slice(0, 3)) {
    islenen.add(r.kod);
    if (indirimliMi(r.kod)) continue;
    const u = site.find((x) => String(x.kod) === String(r.kod) && !x.gizli);
    if (!u) { if ((r.deneme || 0) < 12) tekrar[r.kod] = (r.deneme || 0) + 1; continue; }
    let paket;
    try { paket = { ...(await paketHazirla(env, u, await durumBaglami(env, [String(r.kod)], simdi), simdi, { durum: "yeni" })), kaynak: "site" }; } catch (e) {
      // Geçici hata (indirme/zaman aşımı/yoğunluk): sessizce sonraki turlarda tekrar (en fazla 3 tur); olmazsa Patron'a kısa Türkçe
      await env.KAYIT.put("kemal:sonHata", JSON.stringify({ zaman: simdi, kod: r.kod, hata: String(e && e.message).slice(0, 500) }), { expirationTtl: 7 * 86400 });
      if (gecici(e) && (r.hataTur || 0) < 3) { hataTekrar[r.kod] = (r.hataTur || 0) + 1; continue; }
      await telegram(env, "sendMessage", { chat_id: muratId(env), text: `⚠️ 🆕 ${r.kod} yeni model önizlemesi hazırlanamadı: ${kisaHata(e)}. Tekrar denemek için Kemal'e "${r.kod} yeni model tekrar" yazın.` });
      continue;
    }
    const st = env.STOK ? (await stokIste(env, "/toplu", { kodlar: [String(r.kod)] }).catch(() => ({})))[String(r.kod)] : null;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const rec = { id, tur: "yeni", kod: String(r.kod), paket, kim: r.kim || "Selin", alicilar: [muratId(env)], kaynak: "site", durum: null, zaman: simdi,
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
    const bildir = (text) => telegram(env, "sendMessage", { chat_id: muratId(env), text, disable_web_page_preview: true });
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

const pelinMedya = (x) => [{ type: "video", media: x.video }, ...[x.foto, ...((x.set || []).map((y) => y.url))].filter(Boolean).slice(0, 9).map((m) => ({ type: "photo", media: m }))];
async function yayinOnayKarti(env, x, u, simdi) {
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  const paket = await paketHazirla(env, u, await durumBaglami(env, [String(x.kod)], simdi), simdi, { medya: pelinMedya(x) });
  // 4 Kasım (Patron): aynı işe yeni paket gelirse ESKİ kart geçersiz (kart no her pakette yeni; eski mesaj "geçersiz" diye kapatılır)
  const kartNo = `${x.id}.${Number(x.zaman || simdi).toString(36).slice(-5)}`;
  const eskiler = ((await env.KAYIT.list({ prefix: `kemal:pelinYayin:${x.id}` }).catch(() => ({ keys: [] }))).keys || []).map((k) => k.name);
  for (const k of eskiler) {
    const e = await env.KAYIT.get(k, "json").catch(() => null);
    if (e && e.mid) await telegram(env, "editMessageText", { chat_id: patron, message_id: e.mid, text: `❌ ${x.kod}: bu SON YAYIN kartı geçersiz — düzeltilmiş paketle yeni kart geldi.` }).catch(() => null);
    await env.KAYIT.delete(k);
  }
  const marka = x.marka === "BLACKROSE" ? "BLACK ROSE" : x.marka || "?";
  const v = await telegram(env, "sendVideo", { chat_id: patron, video: x.video, caption: `🎬 ${x.kod} · ${marka} — yayın önizlemesi ("${marka} · ${x.kod}" videonun tamamında, sağ alt köşede)`, supports_streaming: true });
  if (!v.ok) await telegram(env, "sendMessage", { chat_id: patron, text: `⚠️ ${x.kod}: önizleme videosu gösterilemedi (${v.description || "?"}).` });
  const fotolar = [x.foto, ...((x.set || []).map((y) => y.url))].filter(Boolean).slice(0, 10);
  if (fotolar.length > 1) await telegram(env, "sendMediaGroup", { chat_id: patron, media: fotolar.map((f, i) => ({ type: "photo", media: f, ...(i === 0 ? { caption: `📸 ${x.kod} — ön${(x.set || []).length ? ` + ${(x.set || []).map((y) => y.ad).join(", ")}` : ""}` } : {}) })) });
  else if (fotolar.length) await telegram(env, "sendPhoto", { chat_id: patron, photo: fotolar[0], caption: `📸 ${x.kod}` });
  const yazi = duzMetinYazi(altYazi(paket));
  const kart = await telegram(env, "sendMessage", { chat_id: patron, disable_web_page_preview: true,
    text: [`📣 SON YAYIN ONAYI — ${x.kod} · ${marka}`, "Pelin'deki onay üretim onayıydı. Bu kart onaylanmadan hiçbir şey kanala/siteye gitmez.", "", "Kanala bu yazıyla gidecek:", "───", yazi.slice(0, 1500), "───", "Onaylarsanız Kemal kanala koyar, Selin siteye ekler."].join("\n"),
    reply_markup: { inline_keyboard: [[{ text: "📣 Kanala ve siteye gönder", callback_data: `py:o:${kartNo}` }, { text: "❌ Gönderme", callback_data: `py:x:${kartNo}` }]] } });
  await env.KAYIT.put(`kemal:pelinYayin:${kartNo}`, JSON.stringify({ x, zaman: simdi, mid: kart && kart.ok ? kart.result.message_id : null }), { expirationTtl: 14 * 86400 });
  return kart;
}
const duzMetinYazi = (html) => String(html || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
async function yayinOnayDugmesi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!String(env.MURAT_ID || "").split(",").map((v) => v.trim()).includes(String(cq.from.id))) return cevapla("Son yayın onayı sadece Patron'da.");
  const [, islem, id] = String(cq.data).split(":");
  const k = await env.KAYIT.get(`kemal:pelinYayin:${id}`, "json");
  if (!k) return cevapla("Bu kart artık geçerli değil.");
  await env.KAYIT.delete(`kemal:pelinYayin:${id}`);
  const x = k.x, simdi = Math.floor(Date.now() / 1000);
  const kapat = (text) => telegram(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (islem === "x") { await cevapla("Gönderilmedi"); return kapat(`❌ ${x.kod}: gönderilmedi (kanal ve site değişmedi).`); }
  await cevapla("Paylaşıyorum");
  const u = (await siteUrunleriAl(env)).find((y) => String(y.kod) === String(x.kod) && !y.gizli);
  if (!u) return kapat(`⚠️ ${x.kod}: model sitede yok ya da gizli — paylaşılmadı.`);
  const paket = await paketHazirla(env, u, await durumBaglami(env, [String(x.kod)], simdi), simdi, { medya: pelinMedya(x) });
  const g = await yeniKanalaPaylas(env, paket, simdi, { sayma: false });
  if (!g.ok) return kapat(`⚠️ ${x.kod}: kanala paylaşılamadı: ${kisaHata(g.hata)}`);
  await kuyrugaEkle(env, "pelinSite", { id: x.id, kod: String(x.kod), kanal: g.kanal, videoMesaj: g.ids[0], foto: x.foto || null, zaman: simdi });
  return kapat(`📣 ${x.kod}: Patron onayıyla kanalda${g.link ? `: ${g.link}` : ""}. Selin siteye ekliyor.`);
}

export async function fabrikaIsleri(env, simdi) {
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
      const metin = [
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
      await env.KAYIT.put(`venom:rp:${r.id}`, JSON.stringify({ ...r, paket, metin, mesajlar, durum: "bekliyor" }), { expirationTtl: 30 * 86400 });
      if (r.deneme) await denemeKaydi(env, r.liste, "Kemal paylaşım önizlemesini Murat'a ve Hemra'ya gönderdi");
    }
  }
  const silinecek = (await env.KAYIT.get("venom:kanalSil", "json")) || [];
  if (silinecek.length) {
    await env.KAYIT.put("venom:kanalSil", "[]");
    // 2 Kasım: Selin'den gelir (önce site); Patron'a tek sonuç mesajı; kodsuz paylaşımlar fotoğrafa bakarak da aranır
    for (const s of silinecek) await hicGelmeyecek(env, s.kod, s.kim, simdi, { gorsel: true, patron: true, site: s.site || null });
  }
  const geri = (await env.KAYIT.get("venom:kanalGeri", "json")) || [];
  if (geri.length) {
    await env.KAYIT.put("venom:kanalGeri", "[]");
    for (const s of geri) await kanalaGeriKoy(env, s.kod, s.kim, s.site, simdi);
  }
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
    paket = { kod: String(r.kod), baslik: "", durum: "donus", renkler: [], renkEmin: false, renkNotu: "", kumas: yazi.kumas || null, en: yazi.en || "", fr: yazi.fr || "", bedenler: "", medya, video: 0, tgSon: baglam.tarih.son[r.kod] || null, kaynak: "kanal" };
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
  const p = await yeniKanalaPaylas(env, r.paket, simdi, { sayma: false, stokKontrol: false });
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
    await grubaGonder(env, "kemal", r.metin, tgf);
  }
  if (await raporZamani(env, simdi, [9, 40], "venom:topluRapor")) await topluRapor(env, simdi, tgf);
  await aylikRapor(env, simdi, tgf, AYLIK_SINIR_USD);
}

export async function kemalRaporu(env, simdi) {
  const dun = gunAnahtari(simdi - 86400);
  const kanalda = Number((await env.KAYIT.get(`gun:${dun}`)) || 0);
  const kemalin = Number((await env.KAYIT.get(`sayac:${dun}`)) || 0);
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
  satir.push(`Dün kanala ${kanalda} paylaşım yapıldı; ${kemalin} tanesi Kemal'in yeniden paylaşımı.`);
  satir.push(enIyi.length ? `En çok tepki: ${enIyi.map((p) => `${kodBul(p.metin || "") || "kodsuz"} ❤️ ${puan(p)}`).join(" · ")}` : "Dün tepki verisi yok.");
  satir.push(bugunTur ? `Bugünün turu: ${Object.keys(bugunTur.ogeler).length} model soruldu, ${bugunTur.onaylar.length} onay, ${Object.values(bugunTur.ogeler).filter((o) => !o.karar).length} cevap bekliyor.` : "Bugünün turu henüz başlamadı.");
  satir.push(`Sırada: ${kuyruk.length} onaylı paylaşım. Müşteri istek defteri: ${istekler.length} bekleyen.`);
  const sorunlar = stoksuzSira.length ? [`Paylaşım sırasında stoğu bitmiş model: ${stoksuzSira.join(", ")} (Sami'ye göre)`] : [];
  satir.push("", "🔎 Kontrol:", stoksuzSira.length ? `• ⚠️ ${sorunlar[0]}` : "• ✅ Sıradaki paylaşımların hepsi stokta (ya da Vegawin dışı)");
  return {
    metin: satir.join("\n"),
    ozet: `Dün ${kanalda} paylaşım (${kemalin} Kemal); bugünkü tur ${bugunTur ? `${bugunTur.onaylar.length} onay` : "başlamadı"}; sırada ${kuyruk.length}.`,
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
    if (yol === "/kemal/guncelleme") await guncellemeIsle(await istek.json(), env);
    else if (yol === "/kemal/cron") {
      await durumKontrol(env);
      if (env.BOT_TOKEN) {
        try { await sabahIsleri(env, simdi); } catch (e) { await this.env.KAYIT.put("kemal:raporHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
        try { await fabrikaIsleri(env, simdi); } catch (e) { await this.env.KAYIT.put("kemal:fabrikaHata", JSON.stringify({ zaman: simdi, hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 7 * 86400 }); }
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
      for (const kisi of yoneticilerden(env)) {
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

    async hicOnayIste(sohbet, kod) {
      if (!(await kayitliMi(kod))) return `${kod} kayıtlı değil; onay istenmedi.`;
      if (((await env.KAYIT.get("hicgelmeyecek", "json")) || {})[kod]) return `${kod} zaten silindi olarak işaretli.`;
      const sayi = modelMesajlari(kod, (await env.KAYIT.get("kodlar", "json")) || {}, (await env.KAYIT.get("kodsuz", "json")) || {}).length;
      await telegram(env, "sendMessage", {
        chat_id: sohbet,
        text: `🗑️ ${kodGoster(kod)} (${kod}) silinsin mi?\nEvet derseniz kanaldaki ${sayi} mesajı silinir ve bir daha önerilmez. Paylaşım tarihleri botun kaydında kalır.`,
        reply_markup: eminMisin("-", kod),
      });
      return `Onay düğmeleri gönderildi (${sayi} mesaj). Kullanıcı "Evet"e basmadan hiçbir şey silinmez.`;
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

async function telegram(env, metod, govde) {
  const token = String(env.BOT_TOKEN || "").trim();
  const r = await fetch(`https://api.telegram.org/bot${token}/${metod}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(govde),
  });
  return r.json();
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
