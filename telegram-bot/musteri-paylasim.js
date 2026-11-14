// MÜŞTERİ TEŞEKKÜR PAYLAŞIMI (14 Kasım, Patron) — Kemal + Nora. YENİ iş; normal kanal paylaşım akışına DOKUNMAZ.
//  • Kimden: Hemra ya da Merdan müşteri fotoğrafını / teşekkür ekran görüntüsünü Kemal'e gönderir, yanına "müşteri" yazar.
//    Patron Venom'a fotoğraf + "müşteri paylaşımı" yazarsa Venom Kemal'e iletir (kuyruk "musteriPaylas"). Müşteri izni alınmış sayılır.
//  • Kemal: ekran görüntüsünde telefon / isim / profil fotoğrafı varsa SİYAH ŞERİTLE kapatır; model belliyse kodu ve markayı
//    Vegawin'den doğrular (emin değilse kod YAZMAZ, tahmin etmez); altyazıyı NORA'ya yazdırır.
//  • Nora'nın altyazısı: sıcak, insan gibi; Fransızca + İngilizce; 2–4 satır; her seferinde farklı (son 20 altyazıyla benzerlik
//    kontrolü); ülke / şehir gönderen yazdıysa; müşteri adı YOK; fiyat ASLA; kod biliniyorsa en altta "Model: VOLONTE 3394";
//    imza markaya göre "— VOLONTE family 🤍" / "— BLACK ROSE family 🖤".
//  • Onay: gönderen kişiye TEK kart: görsel + altyazı + [✅ Paylaş] [✏️ Yeniden yaz] [❌ Paylaşma].
//  • Kurallar: günde en fazla 2 (normal 12 paylaşıma DAHİL DEĞİL), 09:00–21:00, normal paylaşımla en az 30 dk ara; deftere ayrı
//    tür ("müşteri paylaşımı").
//  • Canlıya alma: Patron örneği onaylayınca KV "kemal:musteriPaylasim" = "1". Kapalıyken ekipten gelen "müşteri" fotoğrafı eski
//    yoluna gider (hiçbir şey değişmez).
import { pngRgbaSikistir } from "./marka.js";

export const MP_GUNLUK = 2;
export const MP_ARA = 30 * 60;
export const MP_BAS = 9, MP_SON = 21;
export const MP_HAFIZA = 20;
const SAAT_FARKI = 3 * 3600;
const gunA = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saatA = (t) => ((t + SAAT_FARKI) % 86400) / 3600;

export const IMZA = { VOLONTE: "— VOLONTE family 🤍", BLACKROSE: "— BLACK ROSE family 🖤" };
export const MARKA_YAZI = { VOLONTE: "VOLONTE", BLACKROSE: "BLACK ROSE" };

// "müşteri", "musteri", "müşteri paylaşımı", "MÜŞTERİ 3394 Paris"
export const mpNiyet = (metin) => /m[üu][şs]ter[iıİ]/iu.test(String(metin || ""));
// Gönderenin notu: kod (yazdıysa), marka (yazdıysa), geri kalan serbest not (ülke / şehir için Nora'ya verilir)
export function mpNot(metin) {
  const t = String(metin || "");
  const kod = (t.match(/(?<!\d)(\d{3,6})(?!\d)/) || [])[1] || null;
  const marka = /black\s*rose|(?<![\p{L}])br(?![\p{L}])/iu.test(t) ? "BLACKROSE" : /volonte/i.test(t) ? "VOLONTE" : null;
  const not = t.replace(/m[üu][şs]ter[iıİ]\s*(payla[şs][ıi]m[ıi])?/giu, " ").replace(/(?<!\d)\d{3,6}(?!\d)/g, " ").replace(/black\s*rose|volonte/gi, " ").replace(/\s+/g, " ").trim();
  return { kod, marka, not: not.slice(0, 120) };
}

// ---- benzerlik: kelime kümesi (3+ harf) Jaccard; iki dilde ayrı bakılır, en yükseği alınır ----
const kelimeler = (s) => new Set(String(s || "").toLocaleLowerCase("fr").replace(/[^\p{L}\s']/gu, " ").split(/\s+/).filter((k) => k.length >= 3));
export function benzerlik(a, b) {
  const x = kelimeler(a), y = kelimeler(b);
  if (!x.size || !y.size) return 0;
  let ortak = 0; for (const k of x) if (y.has(k)) ortak++;
  return ortak / (x.size + y.size - ortak);
}
export const BENZER_ESIK = 0.5;
// yeni: { fr, en }; eskiler: [{ fr, en }] → en benzer eski altyazıyla oran
export function enBenzer(yeni, eskiler) {
  let en = 0;
  for (const e of eskiler || []) en = Math.max(en, benzerlik(yeni.fr, e.fr), benzerlik(yeni.en, e.en));
  return en;
}
// Fiyat / para izi (altyazıda ASLA olmaz)
export const fiyatVar = (s) => /[$€₺£]|\b(usd|eur|euro|euros|dollar|dollars|tl|lira|price|prix|fiyat|цена)\b|\d+\s?(usd|eur|tl)/i.test(String(s || ""));
const satirSay = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean).length;
// Nora'nın metni kurallara uyuyor mu (yoksa yeniden yazdırılır): 2–4 satır toplam, fiyat yok, boş değil
export function altyaziSorunu(a) {
  if (!a || !String(a.fr || "").trim() || !String(a.en || "").trim()) return "boş";
  if (fiyatVar(`${a.fr} ${a.en}`)) return "fiyat";
  const n = satirSay(a.fr) + satirSay(a.en);
  if (n < 2 || n > 4) return "satır";
  if (`${a.fr}${a.en}`.length > 420) return "uzun";
  return null;
}
// Kanala gidecek yazı (düz metin): FR · EN · imza · (kod biliniyorsa) en altta "Model: VOLONTE 3394"
export function altyaziKur({ fr, en, marka, kod }) {
  const m = marka === "BLACKROSE" ? "BLACKROSE" : "VOLONTE";
  return [String(fr || "").trim(), "", String(en || "").trim(), "", IMZA[m], ...(kod ? ["", `Model: ${MARKA_YAZI[m]} ${kod}`] : [])].join("\n");
}

// ---- maske: oran kutuları (0–1) → piksel dikdörtgenleri (kenar payıyla, görsel sınırı içinde) ----
export function kutuPiksel(kutular, W, H, pay = 0.012) {
  const l = [];
  for (const k of (kutular || []).slice(0, 12)) {
    const x = Number(k.x), y = Number(k.y), w = Number(k.w), h = Number(k.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const sol = Math.max(0, Math.floor((x - pay) * W)), ust = Math.max(0, Math.floor((y - pay) * H));
    const sag = Math.min(W, Math.ceil((x + w + pay) * W)), alt = Math.min(H, Math.ceil((y + h + pay) * H));
    if (sag - sol < 2 || alt - ust < 2) continue;
    l.push({ left: sol, top: ust, width: sag - sol, height: alt - ust });
  }
  return l;
}
const akis = (b) => new Blob([b]).stream();
// Siyah şerit: her kutu için o boyda siyah PNG, tabana basılır (Cloudflare Images; aski-detay.js ile aynı yöntem)
export async function maskele(env, bayt, kutular) {
  const bilgi = await env.IMAGES.info(akis(bayt));
  const W = bilgi.width, H = bilgi.height;
  const px = kutuPiksel(kutular, W, H);
  if (!px.length) return { bayt, n: 0 };
  let b = bayt;
  for (let i = 0; i < px.length; i += 3) {
    let r = env.IMAGES.input(akis(b));
    for (const k of px.slice(i, i + 3)) {
      const siyah = new Uint8Array(k.width * k.height * 4); for (let j = 3; j < siyah.length; j += 4) siyah[j] = 255;
      r = r.draw(env.IMAGES.input(akis(await pngRgbaSikistir(k.width, k.height, siyah))), { left: k.left, top: k.top });
    }
    const son = i + 3 >= px.length;
    b = new Uint8Array(await (await r.output(son ? { format: "image/jpeg", quality: 92 } : { format: "image/png" })).response().arrayBuffer());
  }
  return { bayt: b, n: px.length };
}

// ---- yapay zekâ istekleri (y.json: tanima.js jsonIste; harcama orada yazılır) ----
const INCELE_SEMA = { type: "object", additionalProperties: false, required: ["tur", "kutular", "mesaj", "kiyafet"], properties: {
  tur: { type: "string", enum: ["ekran", "foto"] },
  kutular: { type: "array", items: { type: "object", additionalProperties: false, required: ["x", "y", "w", "h", "ne"], properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" }, ne: { type: "string" } } } },
  mesaj: { type: "string" }, kiyafet: { type: "boolean" } } };
export async function gorselIncele(y, b64) {
  return y.json({
    content: [y.gorsel(b64), { type: "text", text: [
      "Bu görsel bir kadın giyim markasının müşterisinden geldi: ya müşterinin kıyafetle çektiği fotoğraf (tur = \"foto\") ya da müşterinin teşekkür mesajının ekran görüntüsü (tur = \"ekran\").",
      "kutular: görselde görünen HER telefon numarası, kişi adı / kullanıcı adı ve profil fotoğrafı için bir kutu ver (bunlar kapatılacak). Ölçüler 0–1 arası ORAN: x, y sol üst köşe; w genişlik; h yükseklik. Sohbet ekranının üst başlık çubuğunda isim / numara / profil fotoğrafı varsa çubuğun TAMAMINI tek kutu yap. Mesaj balonlarının içindeki teşekkür yazısını KAPATMA. Emin değilsen kutuyu biraz geniş tut. Kişisel bilgi yoksa boş liste. Kıyafetli müşteri fotoğrafında yüz kapatılmaz (izin alınmış).",
      "mesaj: müşterinin yazdığı teşekkürün özü, kendi dilinde, en fazla 200 karakter (isim, numara, fiyat YAZMA). Yazı yoksa boş.",
      "kiyafet: görselde giyilmiş / gösterilen bir kıyafet açıkça görünüyorsa true.",
    ].join("\n") }],
    schema: INCELE_SEMA, maxTokens: 900,
  });
}
const NORA_SEMA = { type: "object", additionalProperties: false, required: ["fr", "en"], properties: { fr: { type: "string" }, en: { type: "string" } } };
export const NORA_SISTEM = [
  "Sen NORA'sın: VOLONTE ve BLACK ROSE kadın giyim markalarının sıcak, zarif, samimi sesi. Bir müşterinin teşekkürünü ya da fotoğrafını Telegram kanalında paylaşıyoruz; altına kısa bir yazı yazacaksın.",
  "Kurallar: (1) Müşteriye değer verdiğini hissettir; içten, insan gibi, abartısız. Reklam dili, slogan, 'en iyi', 'eşsiz' gibi boş övgü yok. (2) Önce Fransızca (fr), sonra aynı duygunun İngilizcesi (en); kelime kelime çeviri olmak zorunda değil. (3) fr ve en ayrı ayrı 1–2 kısa satır; ikisi toplam 2–4 satır. (4) Müşterinin adı, telefonu, kullanıcı adı ASLA yazılmaz. (5) Fiyat, indirim, para birimi, sipariş çağrısı ASLA yok. (6) Ülke / şehir SADECE gönderenin notunda yazıyorsa kullan; yoksa yer uydurma. (7) Model kodu, marka adı ve imza YAZMA (onlar sonradan eklenir). (8) En fazla 1–2 sade emoji; hashtag yok. (9) Her yazı farklı olsun: sana verilen önceki yazıların giriş cümlesini, kalıbını, benzetmesini tekrar etme.",
].join("\n");
export async function noraYaz(y, { mesaj, not, marka, tur, oncekiler = [], uyari = null }) {
  const onceki = oncekiler.slice(-MP_HAFIZA).map((o, i) => `${i + 1}) ${String(o.fr || "").replace(/\n/g, " / ")} || ${String(o.en || "").replace(/\n/g, " / ")}`).join("\n");
  return y.json({
    system: NORA_SISTEM,
    content: [{ type: "text", text: [
      `Marka: ${MARKA_YAZI[marka === "BLACKROSE" ? "BLACKROSE" : "VOLONTE"]}.`,
      `Paylaşılan: ${tur === "ekran" ? "müşterinin teşekkür mesajının ekran görüntüsü" : "müşterinin kıyafetle fotoğrafı"}.`,
      mesaj ? `Müşterinin yazdığının özü: "${mesaj}"` : "Müşterinin yazısı yok.",
      not ? `Gönderenin notu (ülke / şehir varsa buradan): "${not}"` : "Gönderen yer belirtmedi (yer YAZMA).",
      onceki ? `Önceki yazılar (bunlara BENZEMESİN):\n${onceki}` : "",
      uyari ? `DİKKAT: bir önceki denemen kabul edilmedi (${uyari}). Baştan, farklı bir açıyla yaz.` : "",
    ].filter(Boolean).join("\n") }],
    schema: NORA_SEMA, maxTokens: 500,
  });
}
// Nora'ya yazdır + kuralları denetle + son 20 ile benzerlik; en fazla 3 deneme. Dönen: { fr, en, benzer, deneme } ya da hata fırlatır
export async function altyaziUret(y, girdi, oncekiler) {
  let uyari = null, son = null;
  for (let d = 1; d <= 3; d++) {
    const a = await noraYaz(y, { ...girdi, oncekiler, uyari });
    const temiz = { fr: String(a.fr || "").trim(), en: String(a.en || "").trim() };
    const sorun = altyaziSorunu(temiz), benzer = enBenzer(temiz, oncekiler);
    son = { ...temiz, benzer, deneme: d, sorun };
    if (!sorun && benzer < BENZER_ESIK) return son;
    uyari = sorun === "fiyat" ? "fiyat / para geçti" : sorun === "satır" ? "satır sayısı 2–4 dışında" : sorun === "uzun" ? "çok uzun" : sorun ? "boş" : "önceki yazılardan birine çok benziyor";
  }
  if (son && !son.sorun) return son; // kurallara uyuyor ama benzer kaldı: kartta yine de gösterilir ("Yeniden yaz" düğmesi var)
  throw new Error("Nora kurallara uyan altyazı yazamadı");
}

// ---- yayın kapısı: şimdi kanala çıkabilir mi? (normal akışa dokunmadan, onun kaydına BAKARAK) ----
// sonNormal: normal akışın son paylaşım zamanı; siraVar: normal akışta onaylanmış sırada model var mı; sonMusteri: son müşteri paylaşımı
export function mpYayinKapisi({ simdi, bugunSayi, sonNormal, siraVar, sonMusteri }) {
  const s = saatA(simdi);
  if (bugunSayi >= MP_GUNLUK) return { ok: false, neden: "gunluk", yazi: `bugünkü ${MP_GUNLUK} müşteri paylaşımı doldu; yarın 09:00'dan sonra çıkar` };
  if (s < MP_BAS || s >= MP_SON) return { ok: false, neden: "saat", yazi: "09:00–21:00 dışında; sabah çıkar" };
  if (sonMusteri && simdi - sonMusteri < MP_ARA) return { ok: false, neden: "ara", yazi: "önceki müşteri paylaşımıyla arada 30 dakika olmalı" };
  const gecen = sonNormal ? simdi - sonNormal : Infinity;
  if (gecen < MP_ARA) return { ok: false, neden: "ara", yazi: "son normal paylaşımdan 30 dakika geçince çıkar" };
  // normal akış 60 dakikada bir çıkar: sırada model varken son normal paylaşımdan 36+ dk geçtiyse sıradaki 30 dk içinde çıkacaktır → ondan sonraya
  if (siraVar && gecen !== Infinity && gecen > MP_ARA + 6 * 60 && gecen < 3600 + 10 * 60) return { ok: false, neden: "ara", yazi: "sıradaki normal paylaşım çıktıktan 30 dakika sonra çıkar" };
  return { ok: true };
}
export const mpGunAnahtari = (simdi) => `kemal:mpGun:${gunA(simdi)}`;
export const mpId = (simdi) => `${simdi.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
export const mpDugmeler = (id) => ({ inline_keyboard: [[{ text: "✅ Paylaş", callback_data: `mp:o:${id}` }, { text: "✏️ Yeniden yaz", callback_data: `mp:y:${id}` }], [{ text: "❌ Paylaşma", callback_data: `mp:x:${id}` }]] });
export const MP_KART_BASLIK = "👥 MÜŞTERİ PAYLAŞIMI — onayınıza (kanala aşağıdaki yazıyla çıkar)";
export const kartYazi = (r, ek = "") => [MP_KART_BASLIK, r.maske ? `🔒 ${r.maske} kişisel bilgi alanı kapatıldı.` : null, r.kodNotu || null, "", altyaziKur(r), ek ? `\n${ek}` : null].filter((x) => x != null).join("\n");
