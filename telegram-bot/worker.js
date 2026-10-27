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
import { medyaDosyasi, dosyaIndir, dosyaBaytIndir, tarifle, adaySec, karsilastir } from "./tanima.js";
import { markaBas } from "./marka.js";
import { musteriIsle, dilSec } from "./musteri.js";
import { kodsuzMu, kodGoster, tarihUzun, modelSecenekleri } from "./ortak.js";
import { altyaziOlustur, ETIKET, BEDEN_GRUPLARI, bedenOnerisi, bedenYaz } from "./altyazi.js";
import { StokDO, stokKodu, BEKLESIN_STOK_GUN } from "./stok.js";

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
      await guncellemeIsle(update, env);
      return new Response("ok");
    }
    if (request.method === "POST" && url.pathname === "/kopru") return kopruAl(request, env);

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
    // Yeni alt yazı önerisi (5 dk'lık görevde hazırlanır, onaysız değişmez).
    await altyaziSirayaEkle(env, { kod, mesaj: kayit.id, eski: metin, etiket: kopya || oncedenVar ? ETIKET.repete : ETIKET.yeni });
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
  if (!izinliMi(cq.from.id, env) && !ekipMi(cq.from.id, env)) return cevapla("Yetkiniz yok.");

  const veri = String(cq.data || "");
  if (veri.startsWith("mk:") && !izinliMi(cq.from.id, env)) return cevapla("Bu ayar sadece Murat ve Merdan'da.");
  if (/^(t1|t7|tx|ty|tv|tg|tb):/.test(veri)) return turDugmesi(cq, env);
  if (/^(r0|r1|r7|r30|rx|hx|hv):/.test(veri)) return cevapla("Bu eski liste artık kullanılmıyor; yeni tur mesajlarını kullanın.");
  if (veri.startsWith("kq:")) return kuyrukIptal(cq, env);
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
export async function markaliGonder(env, hedef, kod, ids, ekYazi = null, { marka = true, beden = null, kare = null } = {}) {
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
        form.append(ad, new Blob([await markaBas(env, foto, buyuk.width || 1280, kod)], { type: "image/jpeg" }), `${ad}.jpg`);
        medya.push({ type: "photo", media: `attach://${ad}` });
      } else if (m.video) medya.push({ type: "video", media: m.video.file_id });
      else if (m.document) medya.push({ type: "document", media: m.document.file_id });
      else if (m.animation) medya.push({ type: "video", media: m.animation.file_id });
    }
    // Paylaşımda hiç fotoğraf yoksa onaylı kare (videodan) başa eklenir.
    if (kare && kare.url && !medya.some((x) => x.type === "photo")) {
      if (marka) {
        const foto = new Uint8Array(await (await fetch(kare.url)).arrayBuffer());
        form.append("kare", new Blob([await markaBas(env, foto, kare.w || 1280, kod)], { type: "image/jpeg" }), "kare.jpg");
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
  if (env.KATALOG) {
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
  if (s < SABAH_SAATI || s >= AKSAM_SAATI) return;

  // Günde tek tur: o günün turu yoksa sabah açılır ve 10 model tek seferde gönderilir.
  if (!tur || turGunu(tur) < gun) {
    if (!siliyor) await turBaslat(env, tur, simdi);
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
  const kuyruk = await kuyrukListesi(env);
  for (const o of kuyruk) await env.KAYIT.delete(`kuyruk:${o.kod}`);
  if (tur && tur.durum === "toplaniyor") {
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
  if (!tur || tur.durum !== "toplaniyor") return;
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

  const sonuc = await kanaldaPaylas(env, oge.kod, oge.ids, simdi, oge.beden);
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

// ---------- Fotoğraf tanıma: katalog ve tanıma ----------

// Kuzey Amerika'ya sabit nesne: katalog adımı (Anthropic 403 sorunu) ve tepki sayıları
// (sık yazıldığı için KV'nin günlük 1000 yazma sınırını harcamasın diye kendi deposunda).
// ---------- Sayım Sami: Vegawin stok köprüsü (stok.js) ----------

const stokNesne = (env) => env.STOK.get(env.STOK.idFromName("stok"), { locationHint: "enam" });
async function stokIste(env, yol, govde = {}) {
  const r = await stokNesne(env).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(govde) });
  return r.json();
}
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
    .map((u) => (u.yok ? { kod: stokKodu(u.kod), yok: true } : { kod: stokKodu(u.kod), ad: u.ad, adet: Number(u.adet) || 0, fiyat: u.fiyat == null ? null : Number(u.fiyat) }));
  const sonuc = await stokIste(env, "/yaz", { magaza, urunler, simdi });
  if (sonuc.yeniSoru && env.BOT_TOKEN) await stokSorulariGonder(env, simdi);
  return Response.json({ ok: true, ...sonuc });
}

const STOK_SORU_PARTI = 6; // bir çalışmada en fazla soru (istek sınırı)
const stokKlavye = (kod) => ({ inline_keyboard: [[
  { text: "🔁 Repete olacak", callback_data: `sz:r:${kod}` },
  { text: "🗑 Sil", callback_data: `sz:s:${kod}` },
  { text: "⏳ Beklesin", callback_data: `sz:b:${kod}` },
]] });

export async function stokSorulariGonder(env, simdi) {
  if (!env.STOK) return;
  const sorular = await stokIste(env, "/sorular", { simdi, enFazla: STOK_SORU_PARTI });
  if (!sorular.length) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  for (const s of sorular) {
    const metin = [
      `📦 ${s.kod}${s.ad ? ` — ${s.ad}` : ""}`,
      `Vegawin: stok bitti (adet ${s.adet}). Ne yapalım?`,
      "🔁 Repete olacak → gizli bekler, stok gelince kendiliğinden geri döner",
      "🗑 Sil → siteden ve Telegram turlarından kaldırılır (kanal paylaşımlarına ve Vegawin'e dokunulmaz)",
      `⏳ Beklesin → ${BEKLESIN_STOK_GUN} gün sonra hâlâ stok yoksa tekrar sorarım`,
    ].join("\n");
    const sec = kanal && modelSecenekleri(s.kod, kodlar, {})[0];
    const mesajlar = [];
    for (const kisi of kisilerden(env)) {
      let r = sec ? await telegram(env, "copyMessage", { chat_id: kisi, from_chat_id: kanal.id, message_id: sec.ids[0], caption: metin, reply_markup: stokKlavye(s.kod) }) : { ok: false };
      let tur = "c";
      if (!r.ok) {
        r = await telegram(env, "sendMessage", { chat_id: kisi, text: metin, reply_markup: stokKlavye(s.kod) });
        tur = "t";
      }
      if (r.ok) mesajlar.push([kisi, r.result.message_id, tur, metin]);
    }
    await stokIste(env, "/soru-gonderildi", { kod: s.kod, mesajlar });
  }
}

async function stokKarari(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [, islem, kod] = String(cq.data).split(":");
  const kim = kisiAdi(cq.from);
  if (!env.STOK) return cevapla("Stok köprüsü bağlı değil.");
  const r = await stokIste(env, "/karar", { kod, islem, kim, simdi: Math.floor(Date.now() / 1000) });
  if (!r.ok) return cevapla(r.kim ? `${r.kim} zaten karar verdi.` : "Bu soru artık geçerli değil.");
  const ek = r.durum === "repete" ? `🔁 ${kim}: repete olacak — gizli bekliyor, stok gelince geri döner.`
    : r.durum === "gizli" ? `🗑 ${kim}: sil — siteden ve Telegram turlarından kaldırıldı (kanal ve Vegawin'e dokunulmadı).`
    : `⏳ ${kim}: beklesin — ${BEKLESIN_STOK_GUN} gün sonra tekrar sorulacak.`;
  await cevapla("Tamam");
  for (const [kisi, id, tur, metin] of r.mesajlar) {
    const yeni = `${metin}\n\n${ek}`;
    if (tur === "c") await telegram(env, "editMessageCaption", { chat_id: kisi, message_id: id, caption: yeni.slice(0, 1024), reply_markup: { inline_keyboard: [] } });
    else await telegram(env, "editMessageText", { chat_id: kisi, message_id: id, text: yeni, reply_markup: { inline_keyboard: [] } });
  }
}

async function stokGoster(msg, env) {
  const yaz = (text) => telegram(env, "sendMessage", { chat_id: msg.chat.id, text, disable_web_page_preview: true });
  if (!env.STOK) return yaz("Stok köprüsü henüz bağlı değil.");
  const kod = stokKodu((msg.text || "").split(/\s+/)[1] || "");
  if (!kod) {
    const o = await stokIste(env, "/ozet");
    if (!o.kopruler.length) return yaz("📦 Vegawin köprüsünden henüz veri gelmedi.");
    const durum = { soru: "cevap bekleyen soru", repete: "repete bekleyen", gizli: "silinen (gizli)", beklesin: "beklesin" };
    return yaz([
      "📦 Vegawin stok köprüsü",
      ...o.kopruler.map((k) => `• ${k.magaza}: ${k.adet} ürün · son veri ${tarihYaz(k.son)}`),
      `Stokta: ${o.stokta} model · stoksuz (gizli): ${o.stoksuz}`,
      ...o.kararlar.map((k) => `• ${durum[k.durum] || k.durum}: ${k.n}`),
    ].join("\n"));
  }
  const b = await stokIste(env, "/bilgi", { kod });
  if (!b.satirlar.length) return yaz(`${kod}: Vegawin'de bu kodla stok kaydı yok.`);
  const karar = b.karar ? { soru: "stok bitti, cevap bekliyor", repete: `repete olacak (${b.karar.kim})`, gizli: `silindi/gizli (${b.karar.kim})`, beklesin: `beklesin (${b.karar.kim})` }[b.karar.durum] : null;
  return yaz([
    `📦 ${kod} — ${b.satirlar[0].ad || ""}`,
    ...b.satirlar.map((x) => `• ${x.magaza}: ${x.adet} adet${x.fiyat != null ? ` · ${x.fiyat} $` : ""} (${tarihYaz(x.guncel)})`),
    `Toplam: ${b.toplam} → ${b.toplam > 0 && !(b.karar && b.karar.durum === "gizli") ? "görünür" : "gizli (sitede ve Telegram'da görünmez)"}`,
    karar ? `Durum: ${karar}` : null,
  ].filter(Boolean).join("\n"));
}

export class KatalogDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(istek) {
    const yol = new URL(istek.url).pathname;
    if (yol === "/tepki") {
      const { id, toplam } = await istek.json();
      await this.state.storage.put(`t:${id}`, toplam);
      return new Response("ok");
    }
    if (yol === "/tur-gonder") return Response.json(await turParcasiIsle(this.env, await istek.json()));
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
}

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
  if (!env.ANTHROPIC_API_KEY || !env.BOT_TOKEN) return;
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
