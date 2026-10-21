// VOLONTE Telegram asistanı (@VolonteasistantBOT) — Cloudflare Worker.
//
// Ne yapar:
//  1. Kanala (t.me/Volonteroseoffical) atılan her paylaşımı KV'ye kaydeder:
//     metin, fotoğraf, tarih, link, varsa fiyat. Albümler tek paylaşım sayılır.
//  2. Sadece izinli kişiye (ALLOWED_IDS) cevap verir: /son, /hafta, /paylas, /yardim.
//     Başkası yazarsa cevap vermez; kimliğini "bekleyen:" altında not eder.
//  3. /paylas <kod>: kayıtlı paylaşımı bulur, önizlemesini gösterir; sadece
//     "Onayla" düğmesine basılırsa kanalda aynı medya ve yazıyla yeniden paylaşır.
//  4. Günlük yeniden paylaşım: her sabah 09:00'da izinli herkese en uzun süredir
//     paylaşılmayan 10 modeli düğmelerle yollar. Onaylananlar sıraya girer ve
//     09:00–21:00 arasında, aralarında 60–90 dk ile kanala paylaşılır.
//     Günde en fazla 10 paylaşım (elle /paylas dahil). /kuyruk, /tekrar.
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

const SAAT_FARKI = 3 * 60 * 60; // İstanbul, UTC+3
const KANAL_ADI = "Volonteroseoffical";
const OZET_UZUNLUK = 30;
const KOD_BASINA = 5; // her kod için saklanan en yeni paylaşım sayısı
const GUNCELLEMELER = ["message", "channel_post", "edited_channel_post", "callback_query"];

// Günlük yeniden paylaşım ayarları
const SABAH_SAATI = 9; // liste bu saatte gelir, paylaşım da bu saatte başlar
const AKSAM_SAATI = 21; // bu saatten sonra paylaşım yapılmaz
const GUNLUK_SINIR = 10;
const SABAH_ADET = 10;
const BEKLEME_GUN = 30; // bu kadar gündür paylaşılmayan modeller önerilir
const ATLA_GUN = 7; // "Yok, atla" denen model bu kadar gün önerilmez
const ARALIK_DK = [60, 90];
const TEKRAR_KALIP = /available\s+again|back\s+in\s+stock|in\s+stock\s+again|restock|de\s+nouveau|à\s+nouveau|a\s+nouveau|encore\s+disponible|disponible\s+encore/i;
const TEKRAR_UZUNLUK = 60;

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
      if (!(await env.KAYIT.get("kanal"))) {
        const k = await telegram(env, "getChat", { chat_id: `@${KANAL_ADI}` });
        if (k.ok) await env.KAYIT.put("kanal", JSON.stringify({ id: k.result.id, kullanici: k.result.username || KANAL_ADI }));
      }
    }
    const onceki = (await env.KAYIT.get("durum:webhook", "json")) || {};
    const ayniDurum = JSON.stringify({ ...onceki, zaman: 0, durum: 0 }) === JSON.stringify({ ...kayit, zaman: 0, durum: 0 }) &&
      (onceki.durum === kayit.durum || (onceki.durum === "kuruldu" && kayit.durum === "kurulu"));
    if (!ayniDurum || kayit.zaman - (onceki.zaman || 0) > 3600) {
      await env.KAYIT.put("durum:webhook", JSON.stringify(kayit));
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
  if (update.channel_post) return paylasimKaydet(update.channel_post, env, false);
  if (update.edited_channel_post) return paylasimKaydet(update.edited_channel_post, env, true);
  if (update.message) return mesajIsle(update.message, env);
  if (update.callback_query) return dugmeIsle(update.callback_query, env);
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

  // "AVAILABLE AGAIN" gibi tekrar stok paylaşımları (/tekrar)
  if (!duzenleme && TEKRAR_KALIP.test(metin)) {
    const tekrar = (await env.KAYIT.get("tekrar", "json")) || [];
    if (!tekrar.some((t) => t.id === kayit.id)) {
      tekrar.unshift({ id: kayit.id, tarih: kayit.tarih, kod: kod, metin: kisalt(metin) });
      await env.KAYIT.put("tekrar", JSON.stringify(tekrar.slice(0, TEKRAR_UZUNLUK)));
    }
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
  if (msg.photo) {
    cevap = "Ekran görüntüsü geldi. Şimdilik reklam analizini Claude sohbetinde yapıyoruz — aynı görüntüyü oraya da gönderin.";
  } else if (komut === "/son") {
    cevap = await sonPaylasimlar(env);
  } else if (komut === "/hafta") {
    cevap = await haftaOzeti(env);
  } else if (komut === "/paylas" || komut === "/paylaş") {
    return paylasOnizle(msg, env);
  } else if (komut === "/kuyruk") {
    return kuyrukGoster(msg.chat.id, env);
  } else if (komut === "/tekrar") {
    cevap = await tekrarListesi(env);
  } else {
    cevap = YARDIM;
  }
  await telegram(env, "sendMessage", { chat_id: msg.chat.id, text: cevap, disable_web_page_preview: true });
}

const YARDIM = [
  "VOLONTE asistanı 👋",
  "",
  "/son — kanaldaki son 5 paylaşım",
  "/hafta — son 7 günde kaç paylaşım yapıldı",
  "/paylas 3329 — o kodun son paylaşımını önizle, onaylarsan kanalda tekrar paylaş",
  "/paylas 3329 2 — aynı kodun bir önceki paylaşımı",
  "/kuyruk — onaylanıp paylaşılmayı bekleyenler (iptal edilebilir)",
  "/tekrar — \"AVAILABLE AGAIN\" paylaşımları ve tarihleri",
  "/yardim — bu liste",
  "",
  "Kanala yapılan her paylaşımı otomatik kaydediyorum.",
  `Her sabah ${SABAH_SAATI}:00'da uzun süredir paylaşılmayan ${SABAH_ADET} modeli gönderirim; onaylananları ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında paylaşırım (günde en fazla ${GUNLUK_SINIR}).`,
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
  if (veri.startsWith("r1:") || veri.startsWith("r0:")) return sabahSecimi(cq, env);
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
  const sonuc = await telegram(env, "copyMessages", { chat_id: kanal.id, from_chat_id: kanal.id, message_ids: ids });
  if (!sonuc.ok) {
    const ipucu = /rights|admin|not enough|forbidden/i.test(sonuc.description || "")
      ? " — botun kanalda \"Mesaj gönderme\" yetkisi açık mı?" : /not found|to copy/i.test(sonuc.description || "") ? " — paylaşım kanaldan silinmiş olabilir." : "";
    return { ok: false, hata: `${sonuc.description}${ipucu}` };
  }
  const yeniIds = sonuc.result.map((r) => r.message_id);

  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  kodEkle(kodlar, kod, { ids: yeniIds, tarih: simdi, album: null });
  await env.KAYIT.put("kodlar", JSON.stringify(kodlar));
  const gun = gunAnahtari(simdi);
  await env.KAYIT.put(`gun:${gun}`, String(Number((await env.KAYIT.get(`gun:${gun}`)) || 0) + 1));
  await env.KAYIT.put(`sayac:${gun}`, String((await bugunSayac(env, simdi)) + 1), { expirationTtl: 3 * 86400 });

  const link = kanal.kullanici && yeniIds[0] ? `https://t.me/${kanal.kullanici}/${yeniIds[0]}` : null;
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
  const s = saat(simdi);
  if (s < SABAH_SAATI || s >= AKSAM_SAATI) return;
  const gun = gunAnahtari(simdi);
  if (!(await env.KAYIT.get(`sabah:${gun}`))) await sabahListesi(env, simdi);
  await siradakiniPaylas(env, simdi);
}

export function adaylar(kodlar, atlananlar, kuyruktakiler, simdi) {
  const sinir = simdi - BEKLEME_SN;
  return Object.entries(kodlar)
    .filter(([kod, liste]) => liste.length && liste[0].tarih < sinir)
    .filter(([kod]) => !(atlananlar[kod] > simdi) && !kuyruktakiler.includes(kod))
    .sort((a, b) => a[1][0].tarih - b[1][0].tarih)
    .map(([kod, liste]) => ({ kod, ids: liste[0].ids, tarih: liste[0].tarih }));
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

async function sabahListesi(env, simdi) {
  const gun = gunAnahtari(simdi);
  // Önce "gönderildi" işaretle: görev iki kez çalışırsa liste iki kez gitmesin.
  const sabah = { gun, mesajlar: {} };
  await env.KAYIT.put(`sabah:${gun}`, JSON.stringify(sabah), { expirationTtl: 3 * 86400 });

  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
  const kuyruk = await kuyrukListesi(env);
  const kisiler = kisilerden(env);
  if (!kanal || !kisiler.length) return;

  const liste = adaylar(kodlar, atlananlar, kuyruk.map((k) => k.kod), simdi);
  for (const kisi of kisiler) {
    await telegram(env, "sendMessage", {
      chat_id: kisi,
      text: liste.length
        ? `☀️ Günaydın! En uzun süredir paylaşılmayan modeller aşağıda.\nStokta olanlara "✅ Paylaş" deyin; ${SABAH_SAATI}:00–${AKSAM_SAATI}:00 arasında 60–90 dk arayla kanala paylaşırım. Hiçbiri onaysız paylaşılmaz.`
        : `☀️ Günaydın! Bugün önerecek model yok (hepsi son ${BEKLEME_GUN} günde paylaşılmış ya da atlanmış).`,
    });
  }

  // Telegram çağrı sınırı (ücretsiz katman 50) için en fazla 14 aday denenir.
  let gonderilen = 0;
  for (const aday of liste.slice(0, SABAH_ADET + 4)) {
    if (gonderilen >= SABAH_ADET) break;
    const gunOnce = Math.floor((simdi - aday.tarih) / 86400);
    const yazi = `${aday.kod} · son paylaşım ${tarihYaz(aday.tarih).slice(0, 5)}.${new Date((aday.tarih + SAAT_FARKI) * 1000).getUTCFullYear()} (${gunOnce} gün önce)`;
    const mesajlar = [];
    for (const kisi of kisiler) {
      const r = await telegram(env, "copyMessage", {
        chat_id: kisi,
        from_chat_id: kanal.id,
        message_id: aday.ids[0],
        caption: yazi,
        reply_markup: { inline_keyboard: [[
          { text: "✅ Stokta var, paylaş", callback_data: `r1:${gun}:${aday.kod}` },
          { text: "❌ Yok, atla", callback_data: `r0:${gun}:${aday.kod}` },
        ]] },
      });
      if (r.ok) mesajlar.push([kisi, r.result.message_id]);
      else if (/not found|to copy/i.test(r.description || "")) break; // kanaldan silinmiş
    }
    if (mesajlar.length) {
      sabah.mesajlar[aday.kod] = { ids: aday.ids, yazi, mesajlar };
      gonderilen += 1;
    }
  }
  await env.KAYIT.put(`sabah:${gun}`, JSON.stringify(sabah), { expirationTtl: 3 * 86400 });
}

async function sabahSecimi(cq, env) {
  const cevapla = (text) => telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [islem, gun, kod] = cq.data.split(":");
  const sabah = await env.KAYIT.get(`sabah:${gun}`, "json");
  const oge = sabah && sabah.mesajlar[kod];
  if (!oge) return cevapla("Bu liste artık geçerli değil.");

  const secimAnahtari = `secim:${gun}:${kod}`;
  const onceki = await env.KAYIT.get(secimAnahtari, "json");
  if (onceki) return cevapla(`${onceki.kim} zaten işaretledi.`);
  const kim = kisiAdi(cq.from);
  const simdi = Math.floor(Date.now() / 1000);
  await env.KAYIT.put(secimAnahtari, JSON.stringify({ islem, kim }), { expirationTtl: 3 * 86400 });

  let sonYazi;
  if (islem === "r1") {
    await env.KAYIT.put(`kuyruk:${kod}`, JSON.stringify({ kod, ids: oge.ids, kim, zaman: simdi }));
    sonYazi = `${oge.yazi}\n✅ ${kim} onayladı — sıraya alındı (/kuyruk).`;
    await cevapla("Sıraya alındı ✅");
  } else {
    const atlananlar = (await env.KAYIT.get("atlananlar", "json")) || {};
    atlananlar[kod] = simdi + ATLA_GUN * 86400;
    for (const [k, t] of Object.entries(atlananlar)) if (t < simdi) delete atlananlar[k];
    await env.KAYIT.put("atlananlar", JSON.stringify(atlananlar));
    sonYazi = `${oge.yazi}\n❌ ${kim}: stokta yok — ${ATLA_GUN} gün önerilmeyecek.`;
    await cevapla("Atlandı");
  }
  // İki kişinin ekranında da düğmeleri kaldır, kimin seçtiğini yaz.
  for (const [kisi, mesajId] of oge.mesajlar) {
    await telegram(env, "editMessageCaption", { chat_id: kisi, message_id: mesajId, caption: sonYazi, reply_markup: { inline_keyboard: [] } });
  }
}

async function siradakiniPaylas(env, simdi) {
  const sonraki = Number((await env.KAYIT.get("sonraki")) || 0);
  if (simdi < sonraki) return;
  if ((await bugunSayac(env, simdi)) >= GUNLUK_SINIR) return;
  const [oge] = await kuyrukListesi(env);
  if (!oge) return;

  // Önce sıradan çıkar: görev üst üste çalışırsa aynı model iki kez paylaşılmasın.
  await env.KAYIT.delete(`kuyruk:${oge.kod}`);
  const [en, ek] = ARALIK_DK;
  const aralik = (en + Math.floor(Math.random() * (ek - en + 1))) * 60;
  await env.KAYIT.put("sonraki", String(simdi + aralik));

  const sonuc = await kanaldaPaylas(env, oge.kod, oge.ids, simdi);
  const metin = sonuc.ok
    ? `✅ ${oge.kod} kanalda paylaşıldı (${oge.kim} onaylamıştı).${sonuc.link ? "\n" + sonuc.link : ""}`
    : `⚠️ ${oge.kod} paylaşılamadı: ${sonuc.hata}`;
  for (const kisi of kisilerden(env)) await telegram(env, "sendMessage", { chat_id: kisi, text: metin, disable_web_page_preview: true });
}

async function kuyrukGoster(sohbet, env) {
  const simdi = Math.floor(Date.now() / 1000);
  const kuyruk = await kuyrukListesi(env);
  const kalan = Math.max(0, GUNLUK_SINIR - (await bugunSayac(env, simdi)));
  if (!kuyruk.length) {
    return telegram(env, "sendMessage", { chat_id: sohbet, text: `Sırada bekleyen paylaşım yok. Bugün kalan paylaşım hakkı: ${kalan}/${GUNLUK_SINIR}.` });
  }
  // Tahmini saat: aralığın ortası (75 dk), pencere ve günlük sınırla.
  let t = Math.max(simdi, Number((await env.KAYIT.get("sonraki")) || 0));
  let hak = kalan;
  const satirlar = kuyruk.map((o, i) => {
    let s = saat(t);
    if (hak <= 0 || s >= AKSAM_SAATI || s < SABAH_SAATI) {
      t = sabahBaslangici(t, s >= SABAH_SAATI);
      hak = GUNLUK_SINIR;
    }
    const satir = `${i + 1}) ${o.kod} — tahmini ${tarihYaz(t)} (${o.kim} onayladı)`;
    t += 75 * 60;
    hak -= 1;
    return satir;
  });
  return telegram(env, "sendMessage", {
    chat_id: sohbet,
    text: `Sıradaki paylaşımlar (bugün kalan hak: ${kalan}/${GUNLUK_SINIR}):\n\n${satirlar.join("\n")}\n\nİptal etmek için düğmeye basın:`,
    reply_markup: { inline_keyboard: kuyruk.map((o) => [{ text: `❌ ${o.kod} iptal`, callback_data: `kq:${o.kod}` }]) },
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
  if (!oge) return telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${kod} sırada değil (paylaşılmış ya da iptal edilmiş olabilir).` });
  await env.KAYIT.delete(`kuyruk:${kod}`);
  await telegram(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `${kod} iptal edildi` });
  return telegram(env, "sendMessage", { chat_id: cq.message.chat.id, text: `❌ ${kod} sıradan çıkarıldı (${kisiAdi(cq.from)}). Kanala paylaşılmayacak.` });
}

export async function tekrarListesi(env) {
  const tekrar = (await env.KAYIT.get("tekrar", "json")) || [];
  if (!tekrar.length) return "\"AVAILABLE AGAIN\" türü kayıtlı paylaşım yok.";
  const kanal = await env.KAYIT.get("kanal", "json");
  const satirlar = tekrar.slice(0, 20).map((t, i) => {
    const tarih = new Date((t.tarih + SAAT_FARKI) * 1000).toISOString().slice(0, 10).split("-").reverse().join(".");
    const link = kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${t.id}` : "";
    return `${i + 1}) ${tarih}${t.kod ? " · " + t.kod : ""} — ${t.metin}\n   ${link}`;
  });
  return `Tekrar stoğa giren paylaşımlar (en yeni ${satirlar.length} / ${tekrar.length}):\n\n${satirlar.join("\n")}`;
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
