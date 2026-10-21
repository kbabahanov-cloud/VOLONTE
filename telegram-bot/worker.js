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
//     ya da Sil denince yerine sıradaki model gelir. 10 onay tamamlanınca paylaşım
//     başlar (08:00–23:00, 90–100 dk arayla: günde 10) ve hemen sonraki turun listesi gelir.
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
//  ALLOWED_IDS     düz metin — virgülle ayrılmış Telegram kimlikleri.
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
import { medyaDosyasi, dosyaIndir, tarifle, adaySec, karsilastir } from "./tanima.js";
import { sinirAsildiMi, buAyHarcanan, ayAnahtari, AYLIK_SINIR_USD, UYARI_ORANI, SINIR_MESAJI } from "./harcama.js";

const SAAT_FARKI = 3 * 60 * 60; // İstanbul, UTC+3
const KANAL_ADI = "Volonteroseoffical";
const OZET_UZUNLUK = 30;
const KOD_BASINA = 200; // her kod için saklanan paylaşım sayısı ("Sil" hepsini silebilsin)
const GUNCELLEMELER = ["message", "channel_post", "edited_channel_post", "callback_query", "my_chat_member"];
const KATALOG_PARTI = 8; // bir çalışmada tarif edilen görsel
const KATALOG_GUNLUK_CAGRI = 150; // fatura güvenliği: günde en fazla katalog çağrısı
const TANIMA_ADAY = 5;

// Günlük yeniden paylaşım ayarları
const SABAH_SAATI = 8; // paylaşım bu saatte başlar (ilk tur / hatırlatma da)
const AKSAM_SAATI = 23; // bu saatten sonra paylaşım yapılmaz
const GUNLUK_SINIR = 10;
const TUR_ADET = 10; // bir turda toplanacak onay sayısı
const BEKLEME_GUN = 30; // bu kadar gündür paylaşılmayan modeller önerilir
const BEKLESIN_GUN = 7; // "Beklesin" denen model bu kadar gün sonra tekrar sorulur
export const KALICI = 4102444800; // 2100 yılı: "Sil" denen model bir daha önerilmez
const SILME_ADIM = 20; // bir çalışmada en fazla bu kadar mesaj silinir (Telegram çağrı sınırı 50)
const ARALIK_DK = [90, 100]; // tur paylaşımları arası (08–23 arası günde 10 sığsın)
const SECENEK_EN_FAZLA = 8; // bir modelin düğmeyle seçilebilen en fazla paylaşımı
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
      await guncellemeIsle(update, env);
      return new Response("ok");
    }

    return new Response("VOLONTE asistanı çalışıyor.");
  },

  // Zamanlanmış görev: BOT_TOKEN girildiyse webhook'u kendi adresine kurar.
  // Kuruluysa sadece kontrol eder, bir şey değiştirmez.
  async scheduled(event, env) {
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
      await herkese(env, `⚠️ Bu ay yapay zekâya yaklaşık ${harcanan.toFixed(2)} $ harcandı (sınır ${AYLIK_SINIR_USD} $). Sınıra gelince yapay zekâ cevapları ve fotoğraf tanıma ay sonuna kadar durur; turlar ve komutlar çalışır.`);
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
  if (update.message) return mesajIsle(update.message, env);
  if (update.callback_query) return dugmeIsle(update.callback_query, env);
}

async function anaKanalMi(chat, env) {
  const kanal = await env.KAYIT.get("kanal", "json");
  return kanal ? chat.id === kanal.id : chat.username === KANAL_ADI;
}

// Bot bir kanala yönetici eklenince: izinli kişi eklediyse orası "Kemal arşiv" olur.
async function uyelikIsle(m, env) {
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
export function kodBul(metin) {
  if (!metin) return null;
  // Kodda en az bir rakam olmalı: "MODEL IS AVAILABLE" kod sayılmaz.
  for (const m of metin.matchAll(/(?:code|kod|код|réf|ref|model|модель)\s*[.:#№\-]*\s*([A-Z0-9][A-Z0-9\-]{1,15})/gi)) {
    if (/\d/.test(m[1])) return kodNormal(m[1]);
  }
  const m = metin.match(/#([0-9]{3,8})\b/);
  return m ? kodNormal(m[1]) : null;
}

export function kodNormal(kod) {
  return String(kod || "").trim().toUpperCase();
}

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

  // Kod dizini: yazıda kod varsa albümün tüm parçalarıyla kaydet; kodsuz albüm
  // parçası gelirse, aynı albüm zaten bir koda bağlıysa ona ekle.
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kod = kodBul(metin);
  let degisti = false;
  if (kod) {
    const ozetGirisi = ozet.sonlar.find((s) => s.ids.includes(kayit.id));
    const ids = ozetGirisi ? [...ozetGirisi.ids].sort((a, b) => a - b) : [kayit.id];
    kodEkle(kodlar, kod, { ids, tarih: kayit.tarih, album: kayit.album });
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

function izinliMi(id, env) {
  return String(env.ALLOWED_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(String(id));
}

async function mesajIsle(msg, env) {
  const kimden = msg.from || {};
  if (msg.chat.type !== "private") return;

  if (!izinliMi(kimden.id, env)) {
    await env.KAYIT.put(
      `bekleyen:${kimden.id}`,
      JSON.stringify({ ad: [kimden.first_name, kimden.last_name].filter(Boolean).join(" "), kullanici: kimden.username || null, zaman: msg.date, metin: (msg.text || "").slice(0, 50) }),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );
    return;
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
  } else if (komut === "/kuyruk") {
    return kuyrukGoster(msg.chat.id, env);
  } else if (msg.text && !msg.text.startsWith("/")) {
    return asistanCevapla(msg, env, asistanYardimcilari(env), Math.floor(Date.now() / 1000));
  } else {
    cevap = YARDIM;
  }
  await telegram(env, "sendMessage", { chat_id: msg.chat.id, text: cevap, disable_web_page_preview: true });
}

const YARDIM = [
  "Ben Kemal 👋 VOLONTE'nin Telegram asistanıyım.",
  "",
  "/son — kanaldaki son 5 paylaşım",
  "/hafta — son 7 günde kaç paylaşım yapıldı",
  "/paylas 3329 — o kodun son paylaşımını önizle, onaylarsan kanalda tekrar paylaş",
  "/paylas 3329 2 — aynı kodun bir önceki paylaşımı",
  "/kuyruk — onaylanıp paylaşılmayı bekleyenler (iptal edilebilir)",
  "/yardim — bu liste",
  "",
  "",
  "Komut yazmadan da konuşabilirsiniz: \"bu turda kaç onay var\", \"3357 beklesin\", \"3357'yi sil\", \"bu hafta kaç paylaşım yaptık\". Paylaşma ve silme için yine düğmeyle onay isterim.",
  "",
  "Kanala yapılan her paylaşımı otomatik kaydediyorum.",
  `Turlar: uzun süredir paylaşılmayan modelleri bütün paylaşım tarihleriyle gönderirim; hangi tarihi onaylarsanız o paylaşılır. ${TUR_ADET} onay tamamlanınca ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla paylaşırım (günde ${GUNLUK_SINIR}), sonraki turun listesi de hemen gelir.`,
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

async function paylasOnizle(msg, env) {
  const sohbet = msg.chat.id;
  const yaz = (text, ek = {}) => telegram(env, "sendMessage", { chat_id: sohbet, text, ...ek });
  const parcalar = (msg.text || "").trim().split(/\s+/).slice(1);
  let sira = 1;
  if (parcalar.length > 1 && /^\d{1,2}$/.test(parcalar[parcalar.length - 1])) sira = Number(parcalar.pop());
  const kod = kodNormal(parcalar.join(" "));
  if (!kod) return yaz("Kod yazın. Örnek: /paylas 3329");

  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const liste = kodlar[kod] || [];
  if (!kanal || !liste.length) return yaz(`${kod} kodlu kayıtlı paylaşım bulamadım.`);
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  if (arsiv[kod]) return yaz(`${kod} silindi olarak işaretli (${arsiv[kod].kim}); paylaşımları silindi, tekrar paylaşılmaz.`);
  const secilen = liste[sira - 1];
  if (!secilen) return yaz(`${kod} için ${liste.length} kayıt var. 1 ile ${liste.length} arasında bir sıra yazın.`);

  const onizleme = await telegram(env, "copyMessages", { chat_id: sohbet, from_chat_id: kanal.id, message_ids: secilen.ids });
  if (!onizleme.ok) return yaz(`Önizleme yapılamadı (${onizleme.description}). Paylaşım kanaldan silinmiş olabilir.`);

  const anahtar = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.KAYIT.put(`onay:${anahtar}`, JSON.stringify({ kod, ids: secilen.ids, kanal: kanal.id, kullanici: msg.from.id }), { expirationTtl: 24 * 60 * 60 });

  const bilgi = [
    `👆 Önizleme: ${kod} — ${tarihYaz(secilen.tarih)} paylaşımı (${secilen.ids.length} parça).`,
    liste.length > 1 ? `Bu kodun ${liste.length} kaydı var; bu ${sira}. en yenisi. Diğeri için: /paylas ${kod} ${sira === 1 ? 2 : 1}` : null,
    "",
    "Kanalda tekrar paylaşılsın mı? Siz onaylamadan hiçbir şey paylaşılmaz.",
  ].filter((x) => x !== null).join("\n");
  return yaz(bilgi, {
    reply_markup: { inline_keyboard: [[
      { text: "✅ Onayla, kanalda paylaş", callback_data: `ok:${anahtar}` },
      { text: "❌ İptal", callback_data: `no:${anahtar}` },
    ]] },
  });
}

async function dugmeIsle(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!izinliMi(cq.from.id, env)) return cevapla("Yetkiniz yok.");

  const veri = String(cq.data || "");
  if (/^(t1|t7|tx|ty|tv|tg):/.test(veri)) return turDugmesi(cq, env);
  if (/^(r0|r1|r7|r30|rx|hx|hv):/.test(veri)) return cevapla("Bu eski liste artık kullanılmıyor; yeni tur mesajlarını kullanın.");
  if (veri.startsWith("kq:")) return kuyrukIptal(cq, env);

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

  const sonuc = await kanaldaPaylas(env, onay.kod, onay.ids, simdi);
  if (!sonuc.ok) {
    await cevapla("Paylaşılamadı.");
    return duzenle(`⚠️ ${onay.kod} paylaşılamadı: ${sonuc.hata}`);
  }
  await cevapla("Paylaşıldı ✅");
  return duzenle(`✅ ${onay.kod} kanalda yeniden paylaşıldı.${sonuc.link ? "\n" + sonuc.link : ""}`);
}

// Kanala yeniden paylaşımın tek yolu. Bot kendi kanal paylaşımlarını güncelleme
// olarak almadığı için kod dizinini, günlük sayacı ve /hafta sayısını burada günceller.
export async function kanaldaPaylas(env, kod, ids, simdi) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal) return { ok: false, hata: "kanal bilgisi yok" };
  // Kopyalar kanala düşünce channel_post olarak gelir; hangi modele ait olduklarını bilmek için işaret.
  await env.KAYIT.put("kopya", JSON.stringify({ kod, zaman: simdi, kalan: ids.length }), { expirationTtl: 600 });
  const sonuc = await telegram(env, "copyMessages", { chat_id: kanal.id, from_chat_id: kanal.id, message_ids: ids });
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
  return { ok: true, link, ids: yeniIds };
}

async function bugunSayac(env, simdi) {
  return Number((await env.KAYIT.get(`sayac:${gunAnahtari(simdi)}`)) || 0);
}

// ---------- Günlük yeniden paylaşım ----------

const saat = (simdi) => ((simdi + SAAT_FARKI) % 86400) / 3600;
const kisilerden = (env) => String(env.ALLOWED_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
const kisiAdi = (from) => [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Biri";

// Zamanlanmış görevden her 5 dakikada çağrılır.
export async function rotasyon(env, simdi) {
  await silmeDevam(env);
  // Zamanlanmış görev her seferinde farklı ülkedeki bir veri merkezinde çalışıyor ve
  // Anthropic bazılarından gelen istekleri reddediyor (403). Katalog adımı bu yüzden
  // Kuzey Amerika'ya sabitlenmiş bir Durable Object içinde çalışır.
  if (env.KATALOG) {
    const nesne = env.KATALOG.get(env.KATALOG.idFromName("katalog"), { locationHint: "enam" });
    await nesne.fetch("https://katalog/adim");
  } else {
    await katalogGuvenli(env, simdi);
  }
  let tur = await env.KAYIT.get("tur", "json");
  const gun = gunAnahtari(simdi);

  const s = saat(simdi);
  if (s < SABAH_SAATI || s >= AKSAM_SAATI) return;

  // Normalde yeni tur, önceki tur 10 onayı tamamlayınca hemen açılır (turKarar).
  // Burada: hiç tur yoksa, eski "paylasiliyor" kaydı kaldıysa ya da aday bulunamayıp
  // biten turdan sonra yeni gün geldiyse.
  if (!tur || tur.durum === "paylasiliyor" || (tur.durum === "bitti" && gunAnahtari(tur.bitis) < gun)) {
    await turBaslat(env, tur, simdi);
    return;
  }
  if (tur.durum === "toplaniyor" && gunAnahtari(tur.basla) < gun && !(await env.KAYIT.get(`hatirlatma:${gun}`))) {
    await env.KAYIT.put(`hatirlatma:${gun}`, "1", { expirationTtl: 2 * 86400 });
    const bekleyen = Object.values(tur.ogeler).filter((o) => !o.karar).length;
    await herkese(env, `☀️ Günaydın, ben Kemal! ${tur.no}. turda ${tur.onaylar.length}/${TUR_ADET} onay var; ${bekleyen} model cevap bekliyor (yukarıdaki mesajlarda). 10 onay tamamlanınca bu turun paylaşımları başlar.`);
  }
  await siradakiniPaylas(env, simdi);
}

const herkese = async (env, text) => {
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text, disable_web_page_preview: true });
};

const kodsuzMu = (kod) => kod.startsWith("~");
const kodGoster = (kod) => (kodsuzMu(kod) ? "Kodsuz paylaşım" : kod);

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
export function turKlavye(no, kod, secenekler) {
  const onay = secenekler.length === 1
    ? [[{ text: `✅ Onaylıyorum (${tarihUzun(secenekler[0].tarih)})`, callback_data: `t1:${no}:${kod}:0` }]]
    : secenekler.reduce((satirlar, sec, i) => {
      const d = { text: `✅ ${tarihUzun(sec.tarih)}`, callback_data: `t1:${no}:${kod}:${i}` };
      if (i % 2 === 0) satirlar.push([d]);
      else satirlar[satirlar.length - 1].push(d);
      return satirlar;
    }, []);
  return { inline_keyboard: [
    ...onay,
    [{ text: "🖼 Hepsini göster", callback_data: `tg:${no}:${kod}` }],
    [{ text: "⏳ Beklesin", callback_data: `t7:${no}:${kod}` }, { text: "🗑️ Sil", callback_data: `tx:${no}:${kod}` }],
  ] };
}

// Bir modelin kanaldaki paylaşımları (en yeni önce). Kodlu: tüm kayıtlar; kodsuz: kaydın kendisi.
export function modelSecenekleri(kod, kodlar, kodsuz) {
  if (kodsuzMu(kod)) {
    const g = kodsuz[kod];
    return g ? [{ ids: g.ids.filter((id) => id > 0), tarih: g.tarih }] : [];
  }
  return (kodlar[kod] || [])
    .map((g) => ({ ids: g.ids.filter((id) => id > 0), tarih: g.tarih }))
    .filter((g) => g.ids.length)
    .sort((a, b) => b.tarih - a.tarih)
    .slice(0, SECENEK_EN_FAZLA);
}
// no "-" = turdan bağımsız (asistandan gelen) silme onayı
const eminMisin = (no, kod) => ({ inline_keyboard: [[
  { text: "🗑️ Evet, hepsini sil", callback_data: `ty:${no}:${kod}` },
  { text: "↩️ Vazgeç", callback_data: `tv:${no}:${kod}` },
]] });

async function turBaslat(env, onceki, simdi) {
  const tur = { no: ((onceki && onceki.no) || 0) + 1, durum: "toplaniyor", basla: simdi, onaylar: [], ogeler: {} };
  await env.KAYIT.put("tur", JSON.stringify(tur)); // önce kaydet: görev üst üste çalışırsa iki tur açılmasın
  await herkese(env, `🆕 Ben Kemal — ${tur.no}. tur başladı. En uzun süredir paylaşılmayan modeller aşağıda; her birinin altında kanaldaki bütün paylaşım tarihleri var.\n✅ <tarih> → o paylaşım aynen paylaşılır · 🖼 Hepsini göster → bütün fotoğraf/videoları size gönderirim · ⏳ Beklesin (${BEKLESIN_GUN} gün sonra tekrar sorarım) · 🗑️ Sil (onayınızla kanaldaki tüm paylaşımları silinir).\nBeklesin ya da Sil derseniz yerine yenisi gelir. ${TUR_ADET} onay tamamlanınca ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla paylaşırım.`);
  await modelGonder(env, tur, TUR_ADET, simdi);
  await env.KAYIT.put("tur", JSON.stringify(tur));
}

// Tura `adet` yeni model ekler (ilk 10 ya da Beklesin/Sil yerine gelen). Gönderilen sayıyı döner.
async function modelGonder(env, tur, adet, simdi) {
  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
  const kuyruk = await kuyrukListesi(env);
  const kisiler = kisilerden(env);
  if (!kanal || !kisiler.length) return 0;

  const sonpaylasim = (await env.KAYIT.get("sonpaylasim", "json")) || {};
  const liste = adaylar(kodlar, kodsuz, atlananlar, [...kuyruk.map((k) => k.kod), ...Object.keys(tur.ogeler)], simdi, sonpaylasim);
  let gonderilen = 0;
  const bulunamayan = [];
  // Telegram çağrı sınırı için en fazla adet+4 aday denenir.
  for (const aday of liste.slice(0, adet + 4)) {
    if (gonderilen >= adet) break;
    const secenekler = modelSecenekleri(aday.kod, kodlar, kodsuz);
    if (!secenekler.length) continue;
    const gunOnce = Math.floor((simdi - aday.tarih) / 86400);
    const kopyaSayisi = kodsuzMu(aday.kod) ? (kodsuz[aday.kod].kopyalar || []).length : 0;
    const yazi = [
      `${kodGoster(aday.kod)} · son paylaşım ${tarihUzun(aday.tarih)} (${gunOnce} gün önce)`,
      `Kanaldaki paylaşımları (${secenekler.length}):`,
      ...secenekler.map((sec, i) => `${i + 1}) ${tarihUzun(sec.tarih)} · ${sec.ids.length} medya${kanal.kullanici ? ` · t.me/${kanal.kullanici}/${sec.ids[0]}` : ""}`),
      ...(kopyaSayisi ? [`(Kemal bunu daha önce yeniden paylaştı.)`] : []),
    ].join("\n");
    const mesajlar = [];
    for (const kisi of kisiler) {
      const r = await telegram(env, "copyMessage", {
        chat_id: kisi, from_chat_id: kanal.id, message_id: secenekler[0].ids[0], caption: yazi, reply_markup: turKlavye(tur.no, aday.kod, secenekler),
      });
      if (r.ok) mesajlar.push([kisi, r.result.message_id]);
      else if (/not found|to copy/i.test(r.description || "")) { bulunamayan.push(aday.kod); break; }
    }
    if (mesajlar.length) {
      tur.ogeler[aday.kod] = { ids: secenekler[0].ids, secenekler, tarih: aday.tarih, yazi, mesajlar, karar: null, kim: null, secilen: null };
      gonderilen += 1;
    }
  }
  // Kanalda bulunamayanlar bir yıl önerilmez.
  if (bulunamayan.length) {
    for (const kod of bulunamayan) atlananlar[kod] = simdi + YIL_SN;
    await env.KAYIT.put("atlananlar", JSON.stringify(atlananlar));
  }
  if (gonderilen < adet && !Object.values(tur.ogeler).some((o) => !o.karar)) {
    // Önerecek model kalmadı ve cevap bekleyen yok: onaylananlarla devam et.
    if (tur.onaylar.length) await paylasimaGec(env, tur, simdi, true);
    else {
      tur.durum = "bitti";
      tur.bitis = simdi;
      await herkese(env, "Önerecek model kalmadı (hepsi son 30 günde paylaşılmış, beklemede ya da silinmiş). Yarın tekrar bakacağım.");
    }
  }
  return gonderilen;
}

export async function atla(env, kod, gunSayisi, simdi) {
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
  atlananlar[kod] = gunSayisi === null ? KALICI : simdi + gunSayisi * 86400;
  for (const [k, t] of Object.entries(atlananlar)) if (t < simdi) delete atlananlar[k];
  await env.KAYIT.put("atlananlar", JSON.stringify(atlananlar));
}

async function paylasimaGec(env, tur, simdi, eksik = false) {
  for (const [i, kod] of tur.onaylar.entries()) {
    const o = tur.ogeler[kod];
    const sec = (o.secenekler || [o])[o.secilen || 0] || o;
    await env.KAYIT.put(`kuyruk:${kod}`, JSON.stringify({ kod, ids: sec.ids, tarih: sec.tarih, kim: o.kim, zaman: simdi + i, tur: tur.no }));
  }
  tur.durum = eksik ? "bitti" : "paylasiliyor";
  if (eksik) tur.bitis = simdi;
  const bekleyen = (await kuyrukListesi(env)).length - tur.onaylar.length;
  const bas = bekleyen > 0 ? "önceki turun paylaşımlarından sonra" : saat(simdi) >= SABAH_SAATI && saat(simdi) < AKSAM_SAATI ? "şimdi" : `${SABAH_SAATI}:00'da`;
  await herkese(env, eksik
    ? `▶️ ${tur.no}. tur: önerecek model kalmadı, onaylanan ${tur.onaylar.length} modelle paylaşıma geçiyorum (${bas}). Sıra: /kuyruk`
    : `▶️ ${tur.no}. tur: ${TUR_ADET} onay tamam! Paylaşım ${bas} başlıyor, ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arası. Sıra ve saatler: /kuyruk\nSonraki turun listesi hemen geliyor.`);
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

  const ek = islem === "t1" ? `✅ ${kim} onayladı: ${tarihUzun(secenekler[secim].tarih)} paylaşımı (${tur.onaylar.length}/${TUR_ADET}).`
    : islem === "t7" ? `⏳ ${kim}: beklesin — ${BEKLESIN_GUN} gün sonra tekrar sorulacak.`
    : `🗑️ ${kim}: sil — kanaldaki paylaşımları siliniyor.`;
  for (const [kisi, mesajId] of oge.mesajlar) {
    await telegram(env, "editMessageCaption", { chat_id: kisi, message_id: mesajId, caption: `${oge.yazi}\n${ek}`, reply_markup: { inline_keyboard: [] } });
  }

  if (islem === "t1") {
    if (tur.onaylar.length >= TUR_ADET) {
      await paylasimaGec(env, tur, simdi);
      await env.KAYIT.put("tur", JSON.stringify(tur));
      await turBaslat(env, tur, simdi); // sonraki turun onayları şimdiden toplansın
      return { ok: true };
    }
  } else {
    if (islem === "t7") await atla(env, kod, BEKLESIN_GUN, simdi);
    else await hicGelmeyecek(env, kod, kim, simdi);
    await modelGonder(env, tur, 1, simdi); // yerine sıradaki model
  }
  await env.KAYIT.put("tur", JSON.stringify(tur));
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
    const r = await turKarar(env, kod, "ty", kim, simdi); // turda bekliyorsa tur kuralıyla (yerine yenisi gelir)
    if (!r.ok) await hicGelmeyecek(env, kod, kim, simdi);
    return;
  }

  const tur = await env.KAYIT.get("tur", "json");
  const oge = tur && String(tur.no) === no && tur.ogeler[kod];
  if (!oge || tur.durum !== "toplaniyor") return cevapla("Bu tur artık geçerli değil.");
  if (islem === "tg") return hepsiniGoster(cq, env, kod, oge);
  if (oge.karar) return cevapla(`${oge.kim} zaten işaretledi.`);

  // "Sil": önce sadece basan kişiye "Emin misiniz?" sorulur, kilit konmaz.
  if (islem === "tx") {
    await cevapla("Emin misiniz?");
    return telegram(env, "editMessageCaption", { ...benim, caption: `${oge.yazi}\n🗑️ Emin misiniz? Bu modelin kanaldaki TÜM paylaşımları silinecek ve bir daha önerilmeyecek.`, reply_markup: eminMisin(no, kod) });
  }
  if (islem === "tv") {
    await cevapla("Vazgeçildi");
    return telegram(env, "editMessageCaption", { ...benim, caption: oge.yazi, reply_markup: turKlavye(no, kod, oge.secenekler || [{ ids: oge.ids, tarih: oge.tarih }]) });
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

export async function hicGelmeyecek(env, kod, kim, simdi) {
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const kodsuz = (await env.KAYIT.get("kodsuz", "json")) || {};
  const ids = modelMesajlari(kod, kodlar, kodsuz);
  // Paylaşım tarihleri botun kendi kaydında kalır (kodlar / kodsuz silinmez).
  const arsiv = (await env.KAYIT.get("hicgelmeyecek", "json")) || {};
  const tarihler = kodsuzMu(kod)
    ? [kodsuz[kod]?.tarih].filter(Boolean)
    : (kodlar[kod] || []).map((g) => g.tarih);
  arsiv[kod] = { kim, zaman: simdi, tarihler, mesajSayisi: ids.length };
  await env.KAYIT.put("hicgelmeyecek", JSON.stringify(arsiv));
  await atla(env, kod, null, simdi);
  await env.KAYIT.delete(`kuyruk:${kod}`);
  await env.KAYIT.put(`silinecek:${kod}`, JSON.stringify({ kod, kim, kalan: ids, silinen: 0, hatali: [], hata: null }));
  await silmeAdimi(env, kod);
}

async function silmeAdimi(env, kod) {
  const anahtar = `silinecek:${kod}`;
  const is = await env.KAYIT.get(anahtar, "json");
  if (!is) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  const parti = is.kalan.slice(0, SILME_ADIM);
  for (const id of parti) {
    const r = await telegram(env, "deleteMessage", { chat_id: kanal.id, message_id: id });
    if (r.ok) is.silinen += 1;
    else {
      is.hatali.push(id);
      is.hata = is.hata || r.description || "bilinmeyen hata";
    }
  }
  is.kalan = is.kalan.slice(parti.length);
  if (is.kalan.length) {
    await env.KAYIT.put(anahtar, JSON.stringify(is)); // kalanı 5 dk'lık görev sürdürür
    return;
  }
  await env.KAYIT.delete(anahtar);
  const ad = kodGoster(kod);
  let metin = `🗑️ ${ad} (${is.kim}): ${is.silinen} mesaj kanaldan silindi. Bu model bir daha önerilmeyecek; paylaşım tarihleri botun kaydında duruyor.`;
  if (is.hatali.length) {
    const eski = /can't be deleted|cannot be deleted|not enough rights|rights/i.test(is.hata || "");
    metin += `\n⚠️ ${is.hatali.length} mesaj silinemedi (${is.hata}).`;
    if (eski) metin += `\nTelegram botların eski mesajları silmesine izin vermiyor olabilir ya da botun "Başkalarının mesajlarını sil" yetkisi kapalı. Bunları elle silebilirsiniz:`;
    const links = is.hatali.slice(0, 15).map((id) => (kanal.kullanici ? `https://t.me/${kanal.kullanici}/${id}` : `#${id}`));
    metin += "\n" + links.join("\n");
    if (is.hatali.length > 15) metin += `\n... ve ${is.hatali.length - 15} mesaj daha.`;
  }
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: metin, disable_web_page_preview: true });
}

async function silmeDevam(env) {
  const { keys } = await env.KAYIT.list({ prefix: "silinecek:" });
  if (keys.length) await silmeAdimi(env, keys[0].name.slice("silinecek:".length));
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

  const sonuc = await kanaldaPaylas(env, oge.kod, oge.ids, simdi);
  const ad = kodGoster(oge.kod);
  const turBitti = oge.tur && !(await kuyrukListesi(env)).some((o) => o.tur === oge.tur);
  const metin = sonuc.ok
    ? `✅ ${ad} kanalda paylaşıldı (${oge.kim} onaylamıştı).${sonuc.link ? "\n" + sonuc.link : ""}`
    : `⚠️ ${ad} paylaşılamadı: ${sonuc.hata}`;
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: metin + (turBitti ? `\n🏁 ${oge.tur}. turun paylaşımları tamamlandı.` : ""), disable_web_page_preview: true });
}

async function kuyrukGoster(sohbet, env) {
  const simdi = Math.floor(Date.now() / 1000);
  const kuyruk = await kuyrukListesi(env);
  const kalan = Math.max(0, GUNLUK_SINIR - (await bugunSayac(env, simdi)));
  if (!kuyruk.length) {
    const tur = await env.KAYIT.get("tur", "json");
    const turSatiri = tur && tur.durum === "toplaniyor" ? ` ${tur.no}. turda ${tur.onaylar.length}/${TUR_ADET} onay var; paylaşım 10 onayla başlar.` : "";
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
  const turSatiri = tur && tur.durum === "toplaniyor" ? `${tur.no}. turda ${tur.onaylar.length}/${TUR_ADET} onay var; paylaşım 10 onayla başlar.\n` : "";
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

// ---------- Fotoğraf tanıma: katalog ve tanıma ----------

export class KatalogDO {
  constructor(state, env) {
    this.env = env;
  }
  async fetch() {
    await katalogGuvenli(this.env, Math.floor(Date.now() / 1000));
    return new Response("ok");
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
        : tur.durum === "toplaniyor" ? `${tur.no}. tur onay topluyor: ${tur.onaylar.length}/${TUR_ADET} onay, ${Object.values(tur.ogeler).filter((o) => !o.karar).length} model cevap bekliyor (${Object.entries(tur.ogeler).filter(([, o]) => !o.karar).map(([k]) => kodGoster(k)).join(", ")}).`
        : tur.durum === "paylasiliyor" ? `${tur.no}. tur paylaşılıyor.`
        : `${tur.no}. tur bitti (önerecek model kalmamıştı); yeni tur ertesi sabah ${SABAH_SAATI}:00'da.`;
      return [
        `Bugün kanala yapılan yeniden paylaşım: ${bugun}/${GUNLUK_SINIR} (kalan ${Math.max(0, GUNLUK_SINIR - bugun)}).`,
        await haftaOzeti(env, simdi),
        `Sırada bekleyen onaylı paylaşım: ${kuyruk.length}${kuyruk.length ? " — " + kuyruk.map((o) => kodGoster(o.kod)).join(", ") : ""}.`,
        turDurumu,
        `Bu ay yapay zekâ harcaması (tahmini): ${(await buAyHarcanan(env, simdi)).toFixed(2)} $ / ${AYLIK_SINIR_USD} $.`,
        `Kurallar: bir turun ${TUR_ADET} onayı tamamlanmadan o turun paylaşımı başlamaz; tamamlanınca sonraki tur hemen açılır. Paylaşım ${SABAH_SAATI}:00–${AKSAM_SAATI}:00, ${ARALIK_DK[0]}–${ARALIK_DK[1]} dk arayla, günde en fazla ${GUNLUK_SINIR}.`,
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
      else if (turdaki && turdaki.karar === "t1") satirlar.push(`Durum: ${tur.no}. turda onaylandı (${turdaki.kim}); 10 onay tamamlanınca paylaşılacak.`);
      else if (await env.KAYIT.get(`kuyruk:${kod}`)) satirlar.push("Durum: onaylandı, paylaşım sırasında.");
      else if (atlananlar[kod] > simdi) satirlar.push(`Durum: ${tarihUzun(atlananlar[kod])} tarihine kadar önerilmeyecek.`);
      else satirlar.push(tarihler[0] < simdi - BEKLEME_SN ? "Durum: öneri listesine girebilir." : `Durum: son ${BEKLEME_GUN} günde paylaşılmış, henüz önerilmez.`);
      return satirlar.join("\n");
    },

    async beklesin(kod, kim, simdi) {
      if (!(await kayitliMi(kod))) return `${kod} kayıtlı değil; işaretlenmedi.`;
      const r = await turKarar(env, kod, "t7", kim, simdi);
      if (r.ok) return `${kodGoster(kod)} turda "beklesin" olarak işaretlendi; ${BEKLESIN_GUN} gün sonra tekrar sorulacak, yerine sıradaki model gönderildi.`;
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

function tarihUzun(unix) {
  return new Date((unix + SAAT_FARKI) * 1000).toISOString().slice(0, 10).split("-").reverse().join(".");
}

function tarihYaz(unix) {
  const s = new Date((unix + SAAT_FARKI) * 1000).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

function kisalt(metin) {
  const tek = (metin || "").replace(/\s+/g, " ").trim();
  return tek.length > 80 ? tek.slice(0, 77) + "..." : tek;
}
