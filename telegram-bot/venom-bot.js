// VENOM BOTU (3 Kasım, Patron kararı) — Cloudflare Worker "volonte-venom". Patron SADECE Venom'la konuşur (yazı / sesli);
// Venom işi ilgili bota verir (Sami, Selin+Kemal, Pelin), sonucu Patron'a gösterir.
//  • Doğal konuşma (Claude + araçlar); komut ezberi yok. Anlamadığında tek kısa soru; tahmin etmez. "Patron" diye hitap eder.
//  • Para harcayan ve DIŞARI giden her iş: önce tam metin/maliyet kartı [✅ Onayla] [✏️ Düzelt] [❌ İptal] → "Emin misiniz?".
//    Küçük işler (stok sorgusu, ekibe hatırlatma, bakiye/ciro bakmak) onaysız.
//  • Yapılan her iş değiştirilemez arşive (StokDO) yazılır; bitince "✅ yapıldı".
//  • Bot hataları Patron'a DEĞİL, Claude Code'a: KV "venom:bot:hata".
//  • 09:40 toplu rapor ve 20:00 günün özeti Patron'a (pazar sessiz).
//  • Kalıcı kurallar: VOLONTE ve BLACK ROSE asla toplanmaz/karşılaştırılmaz; alış/maliyet/kâr/gider/ciro SADECE Patron'a;
//    Fuat/Nuri'ye giden metin güvenlik süzgecinden geçer.
// Ayarlar: BOT_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY (ses), WEBHOOK_SECRET (secret); KAYIT (KV), STOK (StokDO, volonte-asistan),
// SELIN_DEPO; MURAT_ID, FUAT_ID, NURI_ID, BR_SORUMLU (Merdan), HEMRA_ID, FABRIKA_SORUMLU (venom:kimlikler); SELF_URL.
import { claudeIstemci, claudeVar, openaiFetch, openaiVar } from "./ai-istemci.js";
import { stokIste } from "./stokbot.js";
import { bakiyeOku, mutabakatIcerigi, arsiv, fuatSuzgec, tarihSaat } from "./mutabakat.js";
import { ciroBolumu } from "./ciro.js";
import { silKuyrugu } from "./sil.js";
import { topluRaporMetni } from "./venom.js";
import { KISILER, kuyrugaEkle, kuyruguAl, hataEkle } from "./venom-kopru.js";
import { siteVerisi } from "./depo-oku.js";
import { renkCevir } from "./duzen.js";
import { renkBilinir, renkDilleri } from "./site-renk.js";
import { uretimMaliyeti, buAyHarcanan, AYLIK_SINIR_USD, para, boyOku, boyYazi, aracSec } from "./pelin.js";
export { KISILER };

const SAAT_FARKI = 3 * 3600;
const MODEL = "claude-sonnet-5-5";
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const pazarMi = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay() === 0;
const kimlikler = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
export const patron = (env) => kimlikler(env.MURAT_ID)[0] || "";
const patronMu = (env, id) => kimlikler(env.MURAT_ID).includes(String(id));
const kisaId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const kacis = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json")) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);

export async function tg(env, metod, govde) {
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  return r.json().catch(() => ({ ok: false }));
}
const yaz = (env, text, ek = {}) => tg(env, "sendMessage", { chat_id: patron(env), text: String(text).slice(0, 4000), disable_web_page_preview: true, ...ek });
const hataYaz = (env, yer, e) => hataEkle(env, `venom:${yer}`, e).catch(() => null);

// ---------- Araçlar ----------
const ARACLAR = [
  { name: "stok_sorgu", description: "Bir modelin Vegawin stoğu (her mağaza AYRI). Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "bakiye", description: "Black Rose hesaplarının güncel bakiyesi — iki mağaza AYRI (karşılaştırma yok). Onaysız, sadece Patron'a.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "ciro", description: "Yıllık ciro (satış − iade = net) — her mağaza AYRI, toplam yok. Onaysız, sadece Patron'a.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "hatirlat", description: "Ekipten birine (merdan, hemra) Sami üzerinden kısa hatırlatma. Küçük iş: onaysız gider. Fuat/Nuri için KULLANMA (onlar için mesaj_taslagi).", input_schema: { type: "object", additionalProperties: false, required: ["kime", "metin"], properties: { kime: { type: "string", enum: ["merdan", "hemra"] }, metin: { type: "string" } } } },
  { name: "mesaj_taslagi", description: "Birine (fuat, nuri, merdan, hemra) Sami adına mesaj: önce TAM METİN Patron'a onay kartıyla gösterilir; onaysız gitmez. Patron'un kendi metni varsa aynen kullan.", input_schema: { type: "object", additionalProperties: false, required: ["kime", "metin"], properties: { kime: { type: "string", enum: ["fuat", "nuri", "merdan", "hemra"] }, metin: { type: "string" } } } },
  { name: "mutabakat_gonder", description: "Fuat'a güncel cuma mutabakatını (bakiye mesajları) tekrar gönderip onayını ister. Önce Patron'a önizleme kartı.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "siteden_kaldir", description: "Bir modeli siteden (Selin) ve VOLONTE kanalından (Kemal) kaldırır. Önce onay kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "pelin_uret", description: "Pelin'e model(ler) için foto + video ürettir (para harcar). test=true ise 5 modellik maliyet testi. Önce maliyet kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kodlar", "test"], properties: { kodlar: { type: "array", items: { type: "string" } }, test: { type: "boolean" } } } },
  { name: "model_boyu", description: "Bir modelin Pelin'de kayıtlı boyunu (mini/diz/midi/bilek/maksi, referans) gösterir. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "kemal_paylas", description: "Patron'un Venom'a son gönderdiği TÜM fotoğraf/videoları (video sesi/müziği aynen) Kemal'e verir: kanal paylaşımı (marka yazısı fotoğraflara, EN/FR alt yazı). Renk ve beden Patron ne yazdıysa o (yoksa model kartı). YAYINLAMAZ: SON YAYIN ONAYI kartı Patron'a gelir; onaydan sonra kanal + site. 'paylaş' isteği HER ZAMAN buraya (Pelin'e değil).", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" }, renk: { type: "string", description: "Patron'un yazdığı renk, Türkçe (beyaz, koyu bordo…)" }, beden: { type: "string", enum: ["kucuk", "buyuk", "ikisi"] }, son_set: { type: "boolean", description: "Patron yeni dosya göndermeden 'en son gönderdiğim set' derse true" } } } },
  { name: "duraklatma", description: "Sağlamlaştırma haftası anahtarları: Venom üzerinden Kemal paylaşımı (kemal_paylas) ve Pelin'in yeni üretimi (pelin_uretim). SADECE Patron açıkça 'aç/kapat' derse.", input_schema: { type: "object", additionalProperties: false, required: ["is", "acik"], properties: { is: { type: "string", enum: ["kemal_paylas", "pelin_uretim"] }, acik: { type: "boolean" } } } },
  { name: "pelin_foto_kaydet", description: "Patron'un Venom'a son gönderdiği FOTOĞRAFLARI dosya olarak Pelin'e iletir ve ürün fotoğrafı olarak kaydeder: '<kod> <renk> ön/arka' (sıra: roller). sadece_bunlar=true → o rengin eski fotoğrafları (ör. site) silinir, üretimde SADECE bunlar kullanılır. yeniden_baslat=true → o kod/renk için bekleyen Pelin kartları iptal edilir ve üretim yeniden başlar (önce anlama/maliyet kartı, sonra ön fotoğraf onayı; onaysız para harcanmaz). Sonuç 'İLETİLDİ' ya da 'İLETİLMEDİ' diye döner; Patron'a aynen söyle.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" }, renk: { type: "string", description: "Türkçe renk (beyaz, siyah, bordo…); bilinmiyorsa boş" }, roller: { type: "array", items: { type: "string", enum: ["on", "arka", "detay"] }, description: "Fotoğrafların gönderiliş sırasıyla rolleri; boşsa 1. ön, 2. arka, sonrası detay" }, etiket: { type: "string", enum: ["manken", "aski"] }, adet: { type: "integer", description: "Sadece SON gönderilen N fotoğraf (Patron 'iki fotoğraf attım' dediyse 2)" }, sadece_bunlar: { type: "boolean" }, yeniden_baslat: { type: "boolean" } } } },
  { name: "bekleyenler", description: "Bütün botlarda Patron onayı bekleyen işleri (Pelin, Kemal SON YAYIN kartları, Selin taslakları, Venom kartları) ve bugünkü Selin listesini tek listede verir. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "karar_kaydet", description: "Patron yeni bir KALICI karar/kural söylediğinde (ör. 'bundan sonra …', 'her zaman …', 'asla …') Venom'un hafızasına yazar; sonraki her konuşmada uygulanır. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["metin"], properties: { metin: { type: "string" } } } },
  { name: "selin_durum", description: "Selin'de bir modelin durumu: neden taslak çıkmadı (fotoğraf gelmedi mi, hata mı, onayda mı, sitede mi), bugünkü listede mi, kaç gündür gelmiyor, stok. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "selin_taslak", description: "Selin'e bir model için site taslağı (başlık + EN/FR/PT açıklama) hazırlatır; fotoğrafı Selin'e gelmiş olmalı. Küçük yapay zekâ maliyeti (~0,05 $): önce onay kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "bota_yaz", description: "Patron'un söylediği işi/cevabı ilgili bota Patron yazmış gibi iletir (yazı). Pelin: fotoğraf/video üretimi ve Nora senaryo; Kemal: kanal paylaşımı ve düzeltme metni; Selin: site; Sami: stok/ekip. Bir bot az önce yazı bekleyen bir soru sorduysa (ör. 'nasıl düzelteyim, yazın') Patron'un cevabını AYNEN o bota ilet. Para harcayan işlerde bot kendi maliyet kartını getirir.", input_schema: { type: "object", additionalProperties: false, required: ["bot", "metin"], properties: { bot: { type: "string", enum: ["pelin", "kemal", "selin", "sami"] }, metin: { type: "string" } } } },
  { name: "kanal_paylasimlari", description: "VOLONTE Telegram kanalındaki son paylaşımlar (Venom kanalda yönetici, sadece okur): zaman, model kodu, medya, yazı ve bulunan sorunlar. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" }, gun: { type: "integer", description: "kaç günlük (varsayılan 1)" } } } },
  { name: "site_kontrol", description: "wearvolonte.com'u okur (değiştirmez): model sayısı, fotoğrafsız/videosuz, yapay zekâ (Pelin) fotoğrafı olanlar, stoğu bitmiş ama sitede görünenler; kod verilirse o modelin ayrıntısı. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" } } } },
  { name: "site_duzelt", description: "Sitede bir düzeltmeyi Selin'e verir (önce Patron onay kartı): yapay zekâ (Pelin) fotoğraflarını kaldır, fotoğrafları yenile (önbellekteki eski görsel), taslağı yeniden hazırla, açıklamadaki renkleri yaz (renkler). Yeni renk Pelin'den siteye eklenince renk satırı kendiliğinden güncellenir; bu araç ilk rengi kaydetmek/düzeltmek için.", input_schema: { type: "object", additionalProperties: false, required: ["kod", "islem"], properties: { kod: { type: "string" }, islem: { type: "string", enum: ["yapay_zeka_fotolarini_kaldir", "fotolari_yenile", "taslak_yeniden", "renkler"] }, renkler: { type: "array", items: { type: "string" }, description: "islem=renkler: modelin sitedeki BÜTÜN renkleri, Türkçe, sırayla (ör. [\"siyah\", \"koyu bordo\"]); açıklamanın sonundaki renk satırı (EN/FR/PT) buna göre yazılır" } } } },
  { name: "yetenek_istegi", description: "Venom'un henüz yapamadığı bir iş için Claude Code'a not bırakır (yeni yetenek isteği).", input_schema: { type: "object", additionalProperties: false, required: ["istek"], properties: { istek: { type: "string" } } } },
];

// Onay kartı: [✅ Onayla] [✏️ Düzelt] [❌ İptal] → "Emin misiniz?" → çalıştır
const kartKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `vb:o:${id}` }, { text: "✏️ Düzelt", callback_data: `vb:d:${id}` }, { text: "❌ İptal", callback_data: `vb:x:${id}` }]] });
async function kartAc(env, is, metin, simdi) {
  const id = kisaId();
  await kaydet(env, `venom:bot:is:${id}`, { id, ...is, metin, durum: "bekliyor", zaman: simdi }, 7 * 86400);
  await yaz(env, metin, { reply_markup: kartKlavye(id) });
  return id;
}

export async function aracCalistir(env, ad, g, simdi) {
  if (ad === "stok_sorgu") {
    const b = await stokIste(env, "/bilgi", { kod: String(g.kod).trim() });
    if (!b.satirlar || !b.satirlar.length) return `${g.kod}: Vegawin'de stok kaydı yok.`;
    return [`📦 ${g.kod}`, ...b.satirlar.map((x) => `${x.magaza === "BLACKROSE" ? "Black Rose" : "VOLONTE"} mağazası: ${x.adet} adet`)].join("\n");
  }
  if (ad === "bakiye") { const b = await bakiyeOku(env); return b.patron.join("\n"); }
  if (ad === "ciro") {
    const okuA = async (k) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v ? JSON.parse(v) : null; };
    return [...ciroBolumu("VOLONTE", await okuA("ciro:VOLONTE")), "", ...ciroBolumu("BLACK ROSE", await okuA("ciro:BLACKROSE"))].join("\n");
  }
  if (ad === "hatirlat") {
    if (!KISILER[g.kime] || KISILER[g.kime].dis) return "Dışarıya hatırlatma onaysız gitmez; mesaj_taslagi kullan.";
    const id = kisaId();
    await kuyrugaEkle(env, "giden", { id, kime: g.kime, metin: String(g.metin).slice(0, 3500), tur: "hatirlatma" });
    await arsiv(env, "venom-hatirlat", id, { kime: g.kime, metin: g.metin }, simdi);
    return `Hatırlatma ${KISILER[g.kime].e} Sami üzerinden gönderilmek üzere sıraya alındı (birkaç dakika).`;
  }
  if (ad === "mesaj_taslagi") {
    const k = KISILER[g.kime];
    if (!k) return "Bu kişiyi tanımıyorum.";
    if (k.dis) { const yasak = fuatSuzgec(g.metin); if (yasak) return `Bu metin ${k.e} gidemez: gizli bilgi içeriyor (${yasak.join(", ")}). Patron'a söyle, metni değiştir.`; }
    await kartAc(env, { tur: "mesaj", kime: g.kime, govde: g.metin }, `✉️ ${k.e} gidecek mesaj (Sami adına, birebir):\n\n${g.metin}`, simdi);
    return "Onay kartı Patron'a gösterildi; onaylamadan gitmez.";
  }
  if (ad === "mutabakat_gonder") {
    const icerik = await mutabakatIcerigi(env, gunAnahtari(simdi));
    await kartAc(env, { tur: "mutabakat", icerik }, `📋 Fuat'a gidecek mutabakat (birebir; altında ✅ Mutabıkım / ❌ Uyuşmuyor / ⏳ Sonra düğmeleri):\n\n${icerik.duzFuat}`, simdi);
    return "Mutabakat önizlemesi Patron'a gösterildi; onaylamadan gitmez.";
  }
  if (ad === "siteden_kaldir") {
    await kartAc(env, { tur: "sil", kod: String(g.kod) }, `🗑 ${g.kod}: önce siteden (Selin), hemen ardından VOLONTE kanalındaki bütün paylaşımlar (Kemal) kaldırılacak. Kopyalar arşive alınır; yanlışsa /geri.`, simdi);
    return "Silme onay kartı Patron'a gösterildi.";
  }
  if (ad === "pelin_uret") {
    // 6 Kasım (sağlamlaştırma haftası): Pelin'in yeni üretimi SADECE Patron açıkça isterse
    if (!(await anahtarAcik(env, "venom:pelinUretimAcik")) && !/[üu]ret|video|[çc]ek|giydir|manken/i.test(String(env.__patronMetni || ""))) return "⏸ Pelin'in yeni üretimleri bu hafta duraklatıldı; Patron açıkça istemedikçe başlatma (ör. \"3627 beyaz üret\"). Patron'a sorma, sadece durumu söyle.";
    const kodlar = [...new Set((g.kodlar || []).map(String).filter((x) => /^\d{3,6}$/.test(x)))].slice(0, g.test ? 5 : 40);
    if (!kodlar.length) return "Geçerli model kodu yok.";
    const secim = await oku(env, "venom:pelinSecim", null); // Pelin'in seçiminin aynası (yüzler, ortamlar, araç)
    if (!secim) return "Pelin'de kurulum yapılmamış (yüz + ortam seçimi). Patron önce Pelin'e /kurulum yazmalı.";
    const boylar = {};
    for (const k of kodlar) boylar[k] = await boyOku(env, k);
    const boysuz = kodlar.filter((k) => !(boylar[k] && boylar[k].boy));
    if (boysuz.length) return `${boysuz.join(", ")} için boy kayıtlı değil. Patron Pelin'e "/uret ${boysuz[0]}" yazınca Pelin boyu bir kez sorar; sonra buradan üretilebilir.`;
    const mm = uretimMaliyeti(aracSec(secim), secim);
    const toplam = mm.toplam * kodlar.length, harcanan = await buAyHarcanan(env, simdi);
    await kartAc(env, { tur: "pelin", kodlar, test: Boolean(g.test) }, [
      `🎬 Pelin ${g.test ? "MALİYET TESTİ" : "üretim"} — ${kodlar.length} model: ${kodlar.join(", ")}`,
      `Boy: ${kodlar.map((k) => `${k} ${boyYazi(boylar[k])}`).join(", ")}`,
      ...mm.kalemler.map((k) => `• ${k.ad}: ${para(k.birim)}`),
      `Model başı ~${para(mm.toplam)} · toplam ~${para(toplam)} (kalite kontrol yeniden ürettirirse en fazla 2 katı)`,
      `Bu ay Pelin: ${para(harcanan)} / ${AYLIK_SINIR_USD} $${harcanan + toplam > AYLIK_SINIR_USD ? " ⚠️ SINIRI AŞAR (Pelin başlamaz)" : ""}`,
      "Hazır olanlar Pelin'den önizleme olarak gelir.",
    ].join("\n"), simdi);
    return "Maliyet kartı Patron'a gösterildi; onaylamadan para harcanmaz.";
  }
  if (ad === "kemal_paylas") return paylasBaslat(env, { kod: g.kod, renk: g.renk || null, beden: g.beden || null, sonSet: Boolean(g.son_set) }, simdi);
  if (ad === "duraklatma") {
    const k = g.is === "pelin_uretim" ? "venom:pelinUretimAcik" : "venom:kemalPaylasAcik";
    const ok = await env.KAYIT.put(k, g.acik ? "1" : "0").then(() => true).catch(() => false);
    return ok ? `${g.is === "pelin_uretim" ? "Pelin'in yeni üretimi" : "Venom üzerinden Kemal paylaşımı"} ${g.acik ? "AÇILDI" : "DURAKLATILDI"}.` : "Ayar kaydedilemedi (Cloudflare günlük yazma sınırı dolu olabilir); Claude Code'a söyleyin.";
  }
  if (ad === "pelin_foto_kaydet") return pelinFotoIlet(env, g, simdi);
  if (ad === "bekleyenler") return bekleyenlerMetni(env, simdi);
  if (ad === "karar_kaydet") {
    const l = await oku(env, "venom:bot:kararlar", []);
    l.push({ zaman: simdi, metin: String(g.metin).slice(0, 400) });
    await kaydet(env, "venom:bot:kararlar", l.slice(-60));
    return "Karar hafızaya yazıldı; bundan sonra uygulanır.";
  }
  if (ad === "selin_durum") {
    const d = await botaSor(env, "selin", "durum", String(g.kod));
    if (!d) return "Selin'e ulaşılamadı.";
    return [`${d.kod}: ${d.aciklama}`, `Bugünkü listede: ${d.bugunListede ? "evet" : "hayır"}${d.kacirma ? ` · ${d.kacirma} gündür fotoğraf gelmiyor` : ""}`, `Selin'deki dosyalar: ${d.foto} fotoğraf, ${d.video} video${d.hata ? ` · ${d.hata} kez hata` : ""}`, `Sitede: ${d.sitede == null ? "?" : d.sitede ? "evet" : "hayır"} · Vegawin stok: ${d.stok == null ? "?" : d.stok}${d.gizli ? " (gizli/bitmiş)" : ""}`].join("\n");
  }
  if (ad === "selin_taslak") {
    const kod = String(g.kod || "").replace(/\D/g, "");
    await kartAc(env, { tur: "selinTaslak", kod }, `📝 Selin — ${kod} için site taslağı hazırlansın mı? (başlık + EN/FR/PT açıklama; Selin'in yapay zekâ maliyeti ~0,05 $). Taslak hazır olunca onay kartı buraya gelir; siteye ancak onayınızla çıkar.`, simdi);
    return "Onay kartı Patron'a gösterildi.";
  }
  if (ad === "bota_yaz") {
    if (!BOT_BAG[g.bot]) return "Bilinmeyen bot.";
    const r = await botaSor(env, g.bot, "mesaj", String(g.metin || ""));
    await kaydet(env, "venom:bot:sonBot", { bot: g.bot, zaman: simdi, metin: `(Venom iletti) ${String(g.metin).slice(0, 200)}` }, 3600);
    return r ? `${BOT_AD[g.bot]}'e iletildi; cevabı/kartı buraya gelecek.` : `${BOT_AD[g.bot]}'e ulaşılamadı.`;
  }
  if (ad === "kanal_paylasimlari") {
    const l = await oku(env, "venom:kanal:son", []);
    const sinir = simdi - (Number(g.gun) || 1) * 86400, kod = String(g.kod || "").replace(/\D/g, "");
    const f = l.filter((x) => x.zaman >= sinir && (!kod || x.kod === kod)).slice(-25);
    if (!f.length) return kod ? `${kod}: bu sürede kanalda paylaşım görmedim (Venom kanalı yönetici olduktan sonra izliyor).` : "Bu sürede kanalda paylaşım görmedim.";
    return f.map((x) => `• ${tarihSaat(x.zaman)} — ${x.kod || "kodsuz"} · ${x.medya || "yazı"}${x.imza ? ` · ${x.imza}` : ""}${x.sorunlar && x.sorunlar.length ? ` · ⚠️ ${x.sorunlar.join("; ")}` : " · sorun yok"}`).join("\n");
  }
  if (ad === "site_kontrol") return siteKontrolMetni(env, String(g.kod || "").replace(/\D/g, ""), simdi);
  if (ad === "site_duzelt") {
    const kod = String(g.kod || "").replace(/\D/g, "");
    const renkler = (g.renkler || []).map((r) => String(r).trim()).filter(Boolean).slice(0, 8);
    if (g.islem === "renkler") { const yok = renkler.filter((r) => !renkBilinir(r)); if (!renkler.length) return "Renk listesi boş."; if (yok.length) return `Bu renk(ler) çevrilemiyor: ${yok.join(", ")} — uydurmam; Patron'a doğru adını sor.`; }
    const ne = { yapay_zeka_fotolarini_kaldir: "yapay zekâ (Pelin) fotoğrafları siteden kaldırılsın", fotolari_yenile: "fotoğraflar yeni adla yeniden kaydedilsin (önbellekteki eski görsel gitsin)", taslak_yeniden: "Selin taslağı yeniden hazırlasın (onay 0091/Merdan'da)", renkler: `açıklamadaki renkler: ${renkler.join(", ")} (EN: ${renkler.map((r) => (renkDilleri(r) || {}).en).join(", ")})` }[g.islem];
    if (!/^\d{3,6}$/.test(kod) || !ne) return "Geçersiz istek.";
    await kartAc(env, { tur: "siteDuzelt", kod, islem: g.islem, renkler }, `🛠 Site düzeltmesi — ${kod}: ${ne}. Selin yapar; sadece bu model değişir.`, simdi);
    return "Onay kartı Patron'a gösterildi.";
  }
  if (ad === "model_boyu") return `${g.kod} boyu: ${boyYazi(await boyOku(env, String(g.kod)))}`;
  if (ad === "yetenek_istegi") { await yetenekNotu(env, g.istek, simdi); return "Claude Code için not alındı. Patron'a kısaca \"📝 not ettim\" de; 'aracım yok' deme."; }
  return "Bilinmeyen araç.";
}

// Onaylanan kartı çalıştır
async function isCalistir(env, is, simdi) {
  const onaylayan = patron(env);
  if (is.tur === "mesaj") await kuyrugaEkle(env, "giden", { id: is.id, kime: is.kime, metin: is.govde, tur: "mesaj", onaylayan });
  else if (is.tur === "mutabakat") await kuyrugaEkle(env, "giden", { id: is.id, kime: "fuat", tur: "mutabakat", icerik: is.icerik, onaylayan });
  else if (is.tur === "sil") await silKuyrugu(env, is.kod, "Patron (Venom)", simdi);
  else if (is.tur === "pelin") await kuyrugaEkle(env, "pelinIs", { id: is.id, kodlar: is.kodlar, test: is.test });
  else if (is.tur === "siteDuzelt") {
    if (is.islem === "fotolari_yenile") await kaydet(env, "venom:siteFotoYenile", { kod: is.kod });
    else if (is.islem === "renkler") { const l = await oku(env, "venom:siteRenk", []); await kaydet(env, "venom:siteRenk", [...[].concat(l), { kod: is.kod, renkler: is.renkler || [], mod: "yaz" }]); }
    else if (is.islem === "taslak_yeniden") { const r = await botaSor(env, "selin", "taslak", is.kod); await yaz(env, r ? `${r.ok ? "✅" : "⚠️"} ${r.mesaj}` : "⚠️ Selin'e ulaşılamadı."); }
    else { const u = (await siteVerisi(env)).find((x) => String(x.kod) === is.kod); const ai = ((u && u.fotolar) || []).filter((f) => /\/pelin-[a-z0-9-]+\.jpg$/.test(f)); if (ai.length) { const l = await oku(env, "venom:siteMedyaKaldir", []); await kaydet(env, "venom:siteMedyaKaldir", [...l, { kod: is.kod, fotolar: ai, videolar: [] }]); } else await yaz(env, `${is.kod}: sitede yapay zekâ fotoğrafı yok.`); }
  }
  else if (is.tur === "temizlik") { // 6 Kasım: Patron onaylı temizlik (kanal fazlaları + site tekrarları)
    if ((is.kanalSil || []).length) { const l = await oku(env, "venom:kanalMesajSil", []); await kaydet(env, "venom:kanalMesajSil", [...l, ...is.kanalSil]); }
    if ((is.siteKaldir || []).length) { const l = await oku(env, "venom:siteMedyaKaldir", []); await kaydet(env, "venom:siteMedyaKaldir", [...[].concat(l), ...is.siteKaldir]); }
    await yaz(env, `🧹 Temizlik başladı: ${(is.kanalSil || []).length} kanal gönderisi, ${(is.siteKaldir || []).length} site kaydı. Sonuç birkaç dakika içinde gelir.`);
  }
  else if (is.tur === "selinTaslak") { const r = await botaSor(env, "selin", "taslak", String(is.kod)); await yaz(env, r ? `${r.ok ? "✅" : "⚠️"} ${r.mesaj}` : "⚠️ Selin'e ulaşılamadı."); }
  const { icerik, ...ozet } = is;
  await arsiv(env, `venom-${is.tur}`, is.id, { ...ozet, onay: tarihSaat(simdi) }, simdi);
}
export async function dugme(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!patronMu(env, cq.from.id)) return cevap("Sadece Patron.");
  if (/^vr:/.test(String(cq.data))) { // TEK KAPI: başka botun düğmesi → o bota "Patron bastı"
    const rid = String(cq.data).slice(3);
    const k = await oku(env, `venom:bot:dugme:${rid}`, null);
    if (!k) return cevap("Bu düğme artık geçerli değil.");
    const r = await botaSor(env, k.bot, "dugme", k.data, rid);
    await cevap(r ? `${BOT_AD[k.bot]}'e iletildi` : "İletilemedi");
    return null;
  }
  if (/^vm:/.test(String(cq.data))) { // 6 Kasım (D8): açıklamasız dosya → Pelin / Paylaş / Sadece kaydet
    const [, rid, sec] = String(cq.data).split(":");
    const soru = await oku(env, "venom:bot:medyaSoru", null);
    if (!soru || soru.rid !== rid) return cevap("Bu soru artık geçerli değil.");
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    if (sec === "s") {
      const medya = await oku(env, "venom:bot:medya", []);
      await kaydet(env, "venom:bot:kayitliMedya", [...(await oku(env, "venom:bot:kayitliMedya", [])), ...medya.map((x) => ({ ...x, kayit: simdi }))].slice(-30), 3 * 86400).catch(() => null);
      await cevap("Kaydedildi");
      return yaz(env, `🧭 Anladım: ${medya.length} dosya → sadece kaydet (3 gün). Kimseye gönderilmedi.`);
    }
    await kaydet(env, "venom:bot:medyaNiyet", { islem: sec === "p" ? "pelin" : "paylas", zaman: simdi }, 3600).catch(() => null);
    await cevap("Tamam");
    return yaz(env, sec === "p" ? "🎬 Pelin kullanacak. Kod ve renk? (ör. \"3627 beyaz\"; ön/arka sırasıyla gönderdiyseniz öyle kaydedilir)" : "📣 Paylaşım. Kod ve renk? (ör. \"3627 beyaz\"; beden için \"büyük küçük\")");
  }
  if (/^vp:/.test(String(cq.data))) { // 6 Kasım: paylaşım renk sorusu
    const [, rid, sec] = String(cq.data).split(":");
    const soru = await oku(env, "venom:bot:paylasSoru", null);
    if (!soru || soru.rid !== rid) return cevap("Bu soru artık geçerli değil.");
    await env.KAYIT.delete("venom:bot:paylasSoru").catch(() => null);
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    if (sec === "x") { await cevap("Vazgeçildi"); return yaz(env, `❌ ${soru.kod} paylaşımı başlatılmadı.`); }
    await cevap("Başlıyorum");
    return yaz(env, await paylasBaslat(env, { ...soru, renk: sec === "k" ? soru.kartRenk : null }, simdi));
  }
  if (/^vy:[ox]:/.test(String(cq.data))) { // Kemal SON YAYIN kararı Venom'dan
    const [, islem, kartNo] = String(cq.data).split(":");
    const k = await oku(env, `venom:bot:yayin:${kartNo}`, null);
    if (!k) return cevap("Bu kart artık geçerli değil.");
    await env.KAYIT.delete(`venom:bot:yayin:${kartNo}`);
    await kuyrugaEkle(env, "kemalYayinKarar", { id: `vy-${kartNo}`, kartNo, islem });
    await cevap(islem === "o" ? "Kemal'e iletildi" : "Gönderilmeyecek");
    return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: islem === "o" ? "⏳ Kemal paylaşıyor…" : "❌ Gönderilmeyecek", callback_data: "vb:-" }]] } });
  }
  const [, islem, id] = String(cq.data).split(":");
  const is = await oku(env, `venom:bot:is:${id}`, null);
  if (!is || !["bekliyor", "emin"].includes(is.durum)) return cevap("Bu iş artık beklemiyor.");
  const kapat = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "vb:-" }]] } });
  if (islem === "x") { is.durum = "iptal"; await kaydet(env, `venom:bot:is:${id}`, is, 7 * 86400); await cevap("İptal"); return kapat("❌ İptal edildi"); }
  if (islem === "d") {
    await kaydet(env, "venom:bot:duzelt", { id, zaman: simdi }, 3600);
    await cevap("Düzelt"); await kapat("✏️ Düzeltiliyor");
    return yaz(env, "Nasıl düzelteyim Patron? Yeni hâlini ya da değişikliği yazın.");
  }
  if (islem === "o") {
    is.durum = "emin"; await kaydet(env, `venom:bot:is:${id}`, is, 7 * 86400);
    await cevap("Emin misiniz?");
    return yaz(env, "⚠️ Emin misiniz?", { reply_markup: { inline_keyboard: [[{ text: "✅ Evet", callback_data: `vb:E:${id}` }, { text: "Vazgeç", callback_data: `vb:x:${id}` }]] } });
  }
  if (islem === "E" && is.durum === "emin") {
    is.durum = "yapiliyor"; is.onayZaman = simdi; await kaydet(env, `venom:bot:is:${id}`, is, 7 * 86400);
    await cevap("Tamam");
    await isCalistir(env, is, simdi);
    await kapat("✅ Onaylandı");
    return yaz(env, is.tur === "sil" ? "✅ Sıraya alındı: önce Selin, sonra Kemal. Bitince haber veririm." : "✅ Sıraya alındı; bitince haber veririm.");
  }
  return cevap("Önce ✅ Onayla.");
}

// ---------- Harcama (4 Kasım, Patron): Venom'un kendi yapay zekâ harcaması kaydedilir; aylık tavan (öneri 30 $) ----------
// KV "venom-harcama:<ay>" (USD). Tavan KV "venom:bot:sinir" (Patron rakamı söyleyince yazılır); yoksa 30 $. %80'de Patron'a bir kez haber.
export const VENOM_SINIR_VARSAYILAN = 30;
const CLAUDE_FIYAT = { "claude-sonnet-5-5": { giris: 2, cikis: 10, okuma: 0.2 }, "claude-opus-5-5": { giris: 4, cikis: 20, okuma: 0.2 } };
const SES_DAKIKA_USD = 0.003; // gpt-4o-mini-transcribe (yaklaşık)
const ay = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 7);
export const venomHarcanan = async (env, simdi) => Number((await env.KAYIT.get(`venom-harcama:${ay(simdi)}`)) || 0);
export const venomSinir = async (env) => Number((await env.KAYIT.get("venom:bot:sinir")) || VENOM_SINIR_VARSAYILAN);
async function venomHarcamaYaz(env, usd, simdi) {
  const k = `venom-harcama:${ay(simdi)}`;
  const yeni = Math.round(((await venomHarcanan(env, simdi)) + usd) * 10000) / 10000;
  await env.KAYIT.put(k, String(yeni), { expirationTtl: 400 * 86400 });
  const sinir = await venomSinir(env);
  if (yeni >= sinir * 0.8 && !(await env.KAYIT.get(`venom:bot:uyari:${ay(simdi)}`))) {
    await env.KAYIT.put(`venom:bot:uyari:${ay(simdi)}`, "1", { expirationTtl: 40 * 86400 });
    await yaz(env, `⚠️ Venom bu ay ${yeni.toFixed(2).replace(".", ",")} $ yapay zekâ harcadı (aylık sınır ${sinir} $, %80). Sınır dolunca sohbet durur; stok/bakiye raporları ve onay düğmeleri çalışmaya devam eder.`);
  }
}
const claudeUsd = (model, u = {}) => { const f = CLAUDE_FIYAT[model] || CLAUDE_FIYAT["claude-opus-5-5"]; return ((u.input_tokens || 0) * f.giris + (u.cache_creation_input_tokens || 0) * f.giris * 1.25 + (u.cache_read_input_tokens || 0) * f.okuma + (u.output_tokens || 0) * f.cikis) / 1e6; };

// ---------- HAFIZA (5 Kasım, Patron): kurallar (KV "venom:bot:hafiza", Claude Code yazar) + Patron'un yeni kararları + son günlük ----------
export async function hafizaMetni(env) {
  const h = (await env.KAYIT.get("venom:bot:hafiza")) || "";
  const kararlar = await oku(env, "venom:bot:kararlar", []);
  const gunluk = await oku(env, "venom:bot:gunluk", []);
  return [`HAFIZA — KURALLAR:\n${h || "(henüz yok)"}`, kararlar.length ? `PATRON'UN SONRADAN VERDİĞİ KARARLAR (en yenisi sonda; çelişirse yenisi geçerli):\n${kararlar.map((k) => `- ${tarihSaat(k.zaman).slice(0, 10)}: ${k.metin}`).join("\n")}` : "", gunluk.length ? `SON GÜNLER (Venom günlüğü):\n${gunluk.slice(-5).map((g) => `- ${g.gun}: ${g.ozet}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}
// Bütün botlarda onay bekleyenler (tek yerden)
export async function bekleyenlerMetni(env, simdi) {
  const satir = [];
  const ayna = await env.KAYIT.get("venom:pelinDurum", "json").catch(() => null);
  if (ayna) {
    const p = (ayna.isler || []).filter((x) => ["senaryo_onay", "foto_onay", "onay", "uyari", "paket_onay"].includes(x.durum) && !x.deneme && simdi - (x.zaman || 0) < 3 * 86400);
    for (const x of p) satir.push(`• Pelin — ${x.kod}: ${{ senaryo_onay: "senaryo onayı", foto_onay: "ön fotoğraf onayı", onay: "video önizlemesi", uyari: "kontrolden geçmedi, kararınız", paket_onay: "paket önizlemesi" }[x.durum]}`);
    for (const k of ayna.acikKartlar || []) satir.push(`• Pelin — maliyet/araç kartı: ${String(k.baslik || "").slice(0, 80)}`);
  }
  const listele = async (prefix) => { try { return await env.KAYIT.list({ prefix }); } catch { return { keys: [] }; } };
  const kemal = await listele("kemal:pelinYayin:");
  for (const k of kemal.keys || []) satir.push(`• Kemal — SON YAYIN ONAYI: ${k.name.split(":")[2].split("-")[0]} (kanal + site)`);
  const sr = await env.KAYIT.get(`venom:rapor:selin:${gunAnahtari(simdi)}`, "json").catch(() => null);
  if (sr && sr.ozet) satir.push(`• Selin — ${sr.ozet}`);
  const vk = await listele("venom:bot:is:");
  for (const k of (vk.keys || []).slice(0, 20)) { const is = await oku(env, k.name, null); if (is && ["bekliyor", "emin"].includes(is.durum)) satir.push(`• Venom — ${String(is.metin || "").split("\n")[0].slice(0, 80)}`); }
  return satir.length ? ["⏳ Onay bekleyenler:", ...satir].join("\n") : "✅ Şu an onay bekleyen iş yok.";
}
// ---------- 6 Kasım: SAĞLAMLAŞTIRMA ----------
const BEDEN_KOD = { kucuk: "k", buyuk: "b", ikisi: "i", k: "k", b: "b", i: "i" };
const BEDEN_AD = { k: "Küçük (38-44)", b: "Büyük (44-50)", i: "İkisi de (38-50)" };
// Anahtar (KV): "1" açık, "0"/yok kapalı (sağlamlaştırma haftası varsayılanı: kapalı)
export async function anahtarAcik(env, k) { return (await env.KAYIT.get(k).catch(() => null)) === "1"; }
// Telegram tekrar gönderirse iki kez işlenmesin: Cloudflare önbelleği (KV yazmaz; KV günlük sınırı 1000)
async function ilkKezMi(env, id) {
  try {
    if (typeof caches !== "undefined" && caches.default) {
      const k = new Request(`https://venom.ic/u/${id}`);
      if (await caches.default.match(k)) return false;
      await caches.default.put(k, new Response("1", { headers: { "cache-control": "max-age=86400" } }));
      return true;
    }
  } catch { /* önbellek yoksa KV */ }
  const a = `venom:bot:u:${id}`;
  if (await env.KAYIT.get(a)) return false;
  await env.KAYIT.put(a, "1", { expirationTtl: 86400 }).catch(() => null);
  return true;
}
// Günlük işaret (rapor bir kez): StokDO'da — KV yazma sınırı dolsa da çalışır
async function ilkKezBugun(env, ad) {
  try {
    const r = await stokIste(env, "/ayar-oku", { k: `isaret:${ad}` });
    if (r && r.v) return false;
    await stokIste(env, "/ayar-yaz", { k: `isaret:${ad}`, v: "1" });
    return true;
  } catch { return false; } // depo okunamazsa rapor tekrar tekrar gitmesin
}
async function yetenekNotu(env, istek, simdi) {
  const l = await oku(env, "venom:yetenekIstekleri", []);
  l.push({ zaman: simdi, istek: String(istek).slice(0, 500) });
  await kaydet(env, "venom:yetenekIstekleri", l.slice(-100)).catch(() => null);
}
async function iletimHatasi(env, metin, simdi) {
  const l = await oku(env, "venom:bot:iletilmedi", []);
  await kaydet(env, "venom:bot:iletilmedi", [...l, { zaman: simdi, metin: String(metin).slice(0, 200) }].slice(-50), 7 * 86400).catch(() => null);
}
// "3627 beyaz paylaş" / "36 27 beyaz büyük küçük paylaş" → { kod, renk, beden, sonSet }; soru cümlesi ya da birden çok kod → null (sohbet)
export function paylasNiyeti(metin) {
  let t = String(metin || "").toLocaleLowerCase("tr").replace(/\(patron az önce[^)]*\)/g, " ");
  t = t.replace(/\b(\d{2})[\s.](\d{2})\b/g, "$1$2");
  if (!/payla[sş]|kanala|siteye|yay[ıi]nla/.test(t)) return null;
  if (/\?|payla[sş][ıi]ld[ıi]|payla[sş]t[ıi]n|payla[sş]m[ıi][sş]|\bm[ıiuü]\b|paylaşma\b|neden|niye/.test(t)) return null;
  const kodlar = [...new Set(t.match(/\b\d{3,6}\b/g) || [])];
  if (kodlar.length !== 1) return null;
  const k = t.split(/[^a-zçğıöşü]+/).filter(Boolean);
  let renk = null;
  for (let i = 0; i < k.length && !renk; i++) {
    const iki = `${k[i]} ${k[i + 1] || ""}`.trim();
    if (/^(koyu|açık|acik) /.test(iki) && renkBilinir(iki)) renk = iki;
    else if (!["ten", "nude"].includes(k[i]) && renkBilinir(k[i])) renk = k[i];
  }
  const b = /b[üu]y[üu][kğ]/.test(t), kc = /k[üu][çc][üu][kğ]/.test(t); // "büyüğü", "küçüğü" de
  const beden = /ikisi|her iki/.test(t) || (b && kc) ? "i" : b ? "b" : kc ? "k" : null;
  const sonSet = /en son g[öo]nderdi[ğg]im|son (set|seti)|ayn[ıi] (set|dosyalar)/.test(t);
  return { kod: kodlar[0], renk, beden, sonSet };
}
async function hizliPaylas(env, n, simdi, girdi = "") {
  if (!n.renk) {
    const kart = await oku(env, `pelinboy:${n.kod}`, null);
    const rid = kisaId(), kartRenk = (kart && kart.renk) || null;
    await kaydet(env, "venom:bot:paylasSoru", { ...n, rid, kartRenk, zaman: simdi }, 3600).catch(() => null);
    return tg(env, "sendMessage", { chat_id: patron(env), text: `${n.kod} hangi renk Patron? Rengi yazın (ör. beyaz) ya da seçin:`, reply_markup: { inline_keyboard: [[...(kartRenk ? [{ text: `${kartRenk} (model kartı)`, callback_data: `vp:${rid}:k` }] : []), { text: "❌ Vazgeç", callback_data: `vp:${rid}:x` }]] } });
  }
  const ozet = `${n.kod} ${n.renk} → Kemal'e paylaşım (kanal + site), alt yazı ${renkDilleri(n.renk) ? renkDilleri(n.renk).en : n.renk}${n.beden ? `, beden ${BEDEN_AD[BEDEN_KOD[n.beden]]}` : ""}${n.sonSet ? ", en son gönderilen set" : ""}`;
  await anlamaYaz(env, { tur: "paylas", ozet, girdi }, simdi);
  return yaz(env, `🧭 Anladım: ${ozet}. (Yanlışsa "hayır" yazın.)\n${await paylasBaslat(env, n, simdi)}`);
}
// 6 Kasım (D8–D10): anlama yardımcıları
export function kodRenk(metin) {
  let t = String(metin || "").toLocaleLowerCase("tr").replace(/\b(\d{2})[\s.](\d{2})\b/g, "$1$2");
  const kodlar = [...new Set(t.match(/\b\d{3,6}\b/g) || [])];
  if (kodlar.length !== 1) return null;
  const k = t.split(/[^a-zçğıöşü]+/).filter(Boolean);
  let renk = null;
  for (let i = 0; i < k.length && !renk; i++) { const iki = `${k[i]} ${k[i + 1] || ""}`.trim(); if (/^(koyu|açık|acik) /.test(iki) && renkBilinir(iki)) renk = iki; else if (!["ten", "nude"].includes(k[i]) && renkBilinir(k[i])) renk = k[i]; }
  const b = /b[üu]y[üu][kğ]/.test(t), kc = /k[üu][çc][üu][kğ]/.test(t);
  return { kod: kodlar[0], renk, beden: /ikisi|her iki/.test(t) || (b && kc) ? "i" : b ? "b" : kc ? "k" : null };
}
// "3627 beyaz fotoğrafını / videosunu yap · üret · çek" → Pelin üretimi
export function uretNiyeti(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (/\?|payla[sş]|kanala|siteye/.test(t)) return null;
  if (!/(foto[ğg]raf|video|g[öo]rsel|manken)[a-zçğıöşü]*\s+(yap|[üu]ret|[çc]ek|haz[ıi]rla)|\b[üu]ret\b|[üu]retimi/.test(t)) return null;
  const n = kodRenk(t);
  return n ? { kod: n.kod, renk: n.renk } : null;
}
async function anlamaYaz(env, a, simdi) { await kaydet(env, "venom:bot:sonAnlama", { ...a, zaman: simdi }, 3600).catch(() => null); }
export async function anlamadimKaydet(env, girdi, neden, simdi) {
  const l = await oku(env, "venom:bot:anlamadim", []);
  await kaydet(env, "venom:bot:anlamadim", [...l, { zaman: simdi, metin: String(girdi || "").slice(0, 200), neden: String(neden || "").slice(0, 120) }].slice(-50), 7 * 86400).catch(() => null);
}
async function kemaleVer(env, b, liste, simdi, venomMedya = null) {
  const ok = await kuyrugaEkle(env, "patronPaylas", { id: `vp-${b.kod}-${simdi}`, kod: b.kod, medya: liste, kim: "Patron (Venom)", renk: b.renk || null, beden: b.beden || null, venomMedya }).then(() => true).catch(() => false);
  if (ok) await kaydet(env, "venom:bot:sonPaylasim", { kod: b.kod, liste, zaman: simdi }, 3 * 86400).catch(() => null);
  return ok;
}
export async function paylasBaslat(env, { kod, renk = null, beden = null, sonSet = false }, simdi) {
  kod = String(kod || "").replace(/\D/g, "");
  if (!/^\d{3,6}$/.test(kod)) return "Geçerli model kodu yok.";
  if (!(await anahtarAcik(env, "venom:kemalPaylasAcik"))) return `⏸ ${kod}: Venom üzerinden kanal paylaşımı bu hafta DURAKLATILDI (sağlamlaştırma). Kemal'e gitmedi. Açmak için "Venom paylaşımını aç" deyin.`;
  if (renk && !renkBilinir(renk)) return `"${renk}" rengini tanımadım; rengi tekrar yazın (ör. beyaz, koyu bordo). Paylaşım başlamadı.`;
  const bd = BEDEN_KOD[beden] || null;
  const medya = await oku(env, "venom:bot:medya", []);
  if (!medya.length) {
    const son = await oku(env, "venom:bot:sonPaylasim", null);
    if (sonSet && son && String(son.kod) === kod) {
      const ok = await kemaleVer(env, { kod, renk, beden: bd }, son.liste, simdi);
      if (!ok) await iletimHatasi(env, `${kod}: son set Kemal'e gönderilemedi`, simdi);
      return ok ? `✅ ${kod}: İLETİLDİ — en son gönderdiğiniz set (${son.liste.length} dosya) yeniden Kemal'e gitti · renk: ${renk || "model kartından"}${bd ? ` · beden: ${BEDEN_AD[bd]}` : ""}. Yeni SON YAYIN ONAYI kartı gelecek.` : `❌ ${kod}: İLETİLMEDİ — Kemal'e iş gönderilemedi.`;
    }
    await iletimHatasi(env, `${kod}: paylaş dendi ama Venom'da dosya yoktu`, simdi);
    return `❌ ${kod}: İLETİLMEDİ — son 3 saatte bana gelen fotoğraf/video yok. Dosyaları (albüm olarak) gönderip yazısına "${kod} ${renk || "renk"} paylaş" yazın.${son && String(son.kod) === kod ? ` Ya da "${kod} en son gönderdiğim seti paylaş" deyin (${son.liste.length} dosya).` : ""}`;
  }
  await kaydet(env, "venom:bot:paylasBekle", { kod, renk: renk || null, beden: bd, zaman: simdi }, 3600);
  return `⏳ ${kod}: dosyalar Kemal'e hazırlanıyor (renk: ${renk || "model kartından"}${bd ? ` · beden: ${BEDEN_AD[bd]}` : ""}). Albümün kalanı 20 sn içinde eklenir; kaç dosya gittiği "İLETİLDİ" mesajında yazacak.`;
}
// ---------- 6 Kasım (Patron kuralı): Cloudflare faturası 5 $'ı geçmesin — dahil limitlerin %80'inde uyar ----------
// Ölçüm her gün (Claude Code'un günlük görevi, araclar/cf-kullanim.py) → KV "venom:cfKullanim". 2 günden eskiyse "ölçülemedi".
export async function cfKullanimSatiri(env, simdi) {
  const k = await oku(env, "venom:cfKullanim", null);
  if (!k || simdi - k.zaman > 2 * 86400) return { satir: "☁️ Cloudflare kullanımı: son 2 günde ölçülemedi (Claude Code'a söyleyin).", uyari: false };
  const en = k.kalemler[0];
  const yuksek = k.kalemler.filter((x) => x.yuzde >= 80 || x.tahminYuzde >= 80);
  return {
    satir: `☁️ Cloudflare (5 $/ay plan): en yüksek ${en.ad} — şimdi %${en.yuzde}, ay sonu tahmini %${en.tahminYuzde}${yuksek.length ? " ⚠️" : " ✅"}`,
    uyari: yuksek.length > 0,
    metin: yuksek.length ? `⚠️ CLOUDFLARE LİMİT UYARISI (%80): ${yuksek.map((x) => `${x.ad} şimdi %${x.yuzde}, ay sonu tahmini %${x.tahminYuzde}`).join("; ")}. Aşarsa 5 $'ın üstünde ücret çıkar. Claude Code'a söyleyin; kullanımı azaltalım.` : null,
  };
}
// ---------- 6 Kasım: GÜNLÜK TEST (09:30) ve SORUN RAPORU ----------
async function botSor(env, bot, islem, ms = 20000) {
  const b = env[BOT_BAG[bot]];
  if (!b || typeof b[islem] !== "function") return { ok: false, sorun: "bağlantı yok" };
  try { return await Promise.race([b[islem](), new Promise((_, r) => setTimeout(() => r(new Error("cevap vermedi (20 sn)")), ms))]); }
  catch (e) { return { ok: false, sorun: String(e && e.message).slice(0, 120) }; }
}
export async function gunlukTest(env, simdi) {
  const satir = [];
  for (const bot of ["kemal", "selin", "sami", "pelin"]) {
    const r = await botSor(env, bot, "saglik");
    satir.push(r && r.ok ? `✅ ${BOT_AD[bot]}${r.bilgi ? ` — ${r.bilgi}` : ""}` : `❌ ${BOT_AD[bot]}: ${(r && (r.sorun || (r.sorunlar || []).join("; "))) || "cevap yok"}`);
  }
  // Venom: Sami'nin deposundan stok oku + ortak kayda yazma (KV günlük sınırı)
  try { const st = await stokIste(env, "/toplu", { kodlar: ["3627"] }); satir.push(st && typeof st === "object" ? "✅ Stok okuma (Venom → Sami deposu)" : "❌ Stok okunamadı"); } catch (e) { satir.push(`❌ Stok okunamadı: ${String(e && e.message).slice(0, 80)}`); }
  const yaz1 = await env.KAYIT.put("venom:bot:kvTest", String(simdi), { expirationTtl: 3 * 86400 }).then(() => true).catch((e) => String(e && e.message));
  satir.push(yaz1 === true ? "✅ Ortak kayda yazma" : `❌ Ortak kayda (KV) YAZILAMIYOR: ${/limit/i.test(yaz1) ? "Cloudflare günlük ücretsiz yazma sınırı doldu" : yaz1}`);
  try { satir.push((await cfKullanimSatiri(env, simdi)).satir); } catch { /* */ }
  const bozuk = satir.filter((x) => x.startsWith("❌")).length;
  return `🧪 Sabah testi (09:30): ${bozuk ? `⚠️ ${bozuk} sorun` : "hepsi çalışıyor"}\n${satir.join("\n")}`;
}
const SORUN_ANAHTAR = { selin: "selin:hata", pelin: "pelin:hata", sami: "sami:hata", kemal: "kemal:sonHata", "kemal (Pelin teslim)": "kemal:pelinTeslimHata", "kemal (birikim)": "kemal:birikimHata", "tek kapı": "venom:tekKapiHata" };
export async function sorunRaporu(env, simdi, sure = 86400) {
  const satir = [];
  for (const [ad, k] of Object.entries(SORUN_ANAHTAR)) {
    const v = await env.KAYIT.get(k).catch(() => null);
    if (!v) continue;
    let h; try { h = JSON.parse(v); } catch { h = { hata: v, zaman: simdi }; }
    if (h && h.zaman && simdi - h.zaman < sure) satir.push(`• ${ad}: ${String(h.hata || h.metin || "").replace(/\d{9,}/g, "•••").slice(0, 140)}`);
  }
  for (const h of (await oku(env, "venom:bot:hata", [])).filter((x) => simdi - x.zaman < sure).slice(-5)) satir.push(`• Venom (${h.yer}): ${String(h.hata).split("\n")[0].slice(0, 120)}`);
  const kanal = (await oku(env, "venom:kanal:son", [])).filter((x) => simdi - x.zaman < sure && x.kod && x.medya !== "yazı");
  const say = {}; for (const x of kanal) { const a = x.album || x.id; (say[x.kod] = say[x.kod] || new Set()).add(a); }
  const tekrar = Object.entries(say).filter(([, s2]) => s2.size > 1).map(([k, s2]) => `${k} (${s2.size} kez)`);
  if (tekrar.length) satir.push(`• Tekrar paylaşım (24 saatte aynı model birden çok kez): ${tekrar.join(", ")}`);
  const st = (await oku(env, "venom:selinTekrarEngellendi", [])).filter((x) => simdi - x.zaman < sure).flatMap((x) => x.kodlar);
  if (st.length) satir.push(`• Selin listesinde sitede olan model yakalandı ve ÇIKARILDI: ${[...new Set(st)].join(", ")}`);
  const il = (await oku(env, "venom:bot:iletilmedi", [])).filter((x) => simdi - x.zaman < sure);
  if (il.length) satir.push(...il.slice(-8).map((x) => `• İletilmedi: ${x.metin}`));
  const en = (await oku(env, "venom:kontrol:engel", [])).filter((x) => simdi - x.zaman < sure);
  if (en.length) satir.push(...en.slice(-10).map((x) => `• 🛑 Venom kontrolü durdurdu (${x.bot === "selin" ? "site" : "kanal"}) ${x.kod}: ${(x.sorunlar || []).join("; ").slice(0, 160)}`));
  const sk = (await oku(env, "venom:kontrol:site", [])).filter((x) => simdi - x.zaman < sure).flatMap((x) => x.notlar);
  if (sk.length) satir.push(`• Sitede tekrar/kolaj çıkarıldı: ${sk.slice(-6).join("; ")}`);
  const an = (await oku(env, "venom:bot:anlamadim", [])).filter((x) => simdi - x.zaman < sure);
  const anMetin = an.length ? `\n🤔 Anlamadıklarım (${an.length}):\n${an.slice(-10).map((x) => `• "${x.metin}" — ${x.neden}`).join("\n")}` : "\n🤔 Anlamadıklarım: yok.";
  return (satir.length ? `🔁 Tekrarlar ve hatalar (son 24 saat):\n${satir.join("\n")}` : "🔁 Tekrarlar ve hatalar (son 24 saat): yok.") + anMetin;
}
// 5 Kasım (B5–B7): Patron'un Venom'a gönderdiği fotoğraflar → DOSYA olarak Pelin'e (KV "pelinmedya:<id>", Pelin /medya/<id>, 30 gün)
// → Pelin ürün fotoğrafı "<kod> <renk> ön/arka". Sonuç açıkça: İLETİLDİ / İLETİLMEDİ.
export async function pelinFotoIlet(env, g, simdi, bekle = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const kod = String(g.kod || "").replace(/\D/g, "");
  if (!/^\d{3,6}$/.test(kod)) return "❌ FOTOĞRAF İLETİLMEDİ: geçerli model kodu yok.";
  if (!env.PELIN_W || typeof env.PELIN_W.foto !== "function") return "❌ FOTOĞRAF İLETİLMEDİ: Pelin bağlantısı yok (Claude Code'a söyleyin).";
  // albümün kalanı birkaç saniye sonra gelebilir: liste 6 sn değişmeyene kadar (en fazla ~15 sn) beklenir
  let medya = await oku(env, "venom:bot:medya", []);
  for (let i = 0; i < 5 && medya.length && Math.floor(Date.now() / 1000) - Math.max(...medya.map((m) => m.zaman || 0)) < 6; i++) { await bekle(3000); medya = await oku(env, "venom:bot:medya", []); }
  const fotolar = medya.filter((m) => m.tur === "foto").slice(-Math.max(1, Math.min(8, Number(g.adet) || 8)));
  if (!fotolar.length) return "❌ FOTOĞRAF İLETİLMEDİ: son 1 saatte gönderilmiş fotoğraf yok. Fotoğrafları tekrar gönderin (en iyisi \"dosya olarak\").";
  const iletilen = [];
  for (const [i, m] of fotolar.entries()) {
    const f = await tg(env, "getFile", { file_id: m.file_id }).catch(() => null);
    if (!f || !f.ok) continue;
    const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`).catch(() => null);
    if (!r || !r.ok) continue;
    const id = crypto.randomUUID().replace(/-/g, "");
    await env.KAYIT.put(`pelinmedya:${id}`, await r.arrayBuffer(), { expirationTtl: 30 * 86400, metadata: { tur: "image/jpeg" } });
    iletilen.push({ url: `${env.PELIN_URL || "https://volonte-pelin.volonte.workers.dev"}/medya/${id}`, rol: (g.roller || [])[i] || null });
  }
  if (!iletilen.length) return `❌ FOTOĞRAF İLETİLMEDİ: ${fotolar.length} fotoğraf Telegram'dan indirilemedi; tekrar gönderir misiniz?`;
  const s = await env.PELIN_W.foto({ kod, renk: g.renk || null, fotolar: iletilen, etiket: g.etiket || "manken", sadeceBunlar: Boolean(g.sadece_bunlar), yenidenBaslat: Boolean(g.yeniden_baslat) }).catch((e) => ({ ok: false, mesaj: String(e && e.message).slice(0, 120) }));
  if (!s || !s.ok) { await iletimHatasi(env, `${kod}: Pelin fotoğrafları kaydetmedi (${(s && s.mesaj) || "cevap yok"})`, simdi); return `❌ FOTOĞRAF İLETİLMEDİ: Pelin kaydetmedi (${(s && s.mesaj) || "cevap yok"}).`; }
  await kaydet(env, "venom:bot:medya", medya.filter((m) => !fotolar.includes(m)), 3600); // aynı fotoğraf başka işe karışmasın
  return [`✅ FOTOĞRAF İLETİLDİ: ${s.kaydedilen.length} fotoğraf Pelin'e kaydedildi — ${s.kaydedilen.join(", ")}.`,
    s.silinen ? `Eski ${s.silinen} fotoğraf (bu renk) silindi; Pelin bu renkte SADECE bunları kullanır.` : null,
    g.yeniden_baslat ? `Bekleyen ${s.iptal} kart/iş iptal edildi; üretim yeniden başladı — Pelin'in kartı buraya gelecek (onaysız para harcanmaz; önce ön fotoğraf onayı).` : null,
    fotolar.length > iletilen.length ? `⚠️ ${fotolar.length - iletilen.length} fotoğraf indirilemedi.` : null].filter(Boolean).join("\n");
}
// Patron'un Venom'a gönderdiği medya → Kemal paylaşımı (kemal_paylas). Dosyalar Venom /medya/<id> adresinden (3 gün) Kemal'e
async function paylasimGonder(env, simdi) {
  const b = await oku(env, "venom:bot:paylasBekle", null);
  if (!b) return;
  const medya = await oku(env, "venom:bot:medya", []);
  if (medya.length && simdi - Math.max(...medya.map((m) => m.zaman || 0)) < 20) return; // albümün kalanı geliyor olabilir
  await env.KAYIT.delete("venom:bot:paylasBekle");
  const liste = [];
  for (const m of medya.slice(-10)) {
    const f = await tg(env, "getFile", { file_id: m.file_id });
    if (!f.ok) continue;
    const r = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
    if (!r.ok) continue;
    const id = crypto.randomUUID().replace(/-/g, "");
    await env.KAYIT.put(`venommedya:${id}`, await r.arrayBuffer(), { expirationTtl: 3 * 86400, metadata: { tur: m.tur === "video" ? "video/mp4" : "image/jpeg" } });
    liste.push({ tur: m.tur, url: `${env.SELF_URL}/medya/${id}` });
  }
  await env.KAYIT.delete("venom:bot:medya");
  if (!liste.length) { await iletimHatasi(env, `${b.kod}: Patron'un dosyaları indirilemedi (Kemal'e gitmedi)`, simdi); return yaz(env, `❌ ${b.kod}: İLETİLMEDİ — dosyalar indirilemedi (20 MB üstü olabilir); tekrar gönderir misiniz?`); }
  const ok = await kemaleVer(env, b, liste, simdi, medya.slice(-10).map((m) => ({ type: m.tur === "video" ? "video" : "photo", media: m.file_id })));
  const fs = liste.filter((m) => m.tur !== "video").length, vs = liste.length - fs;
  await yaz(env, ok ? `✅ ${b.kod}: İLETİLDİ — ${fs} fotoğraf${vs ? ` + ${vs} video (sesi/müziği aynen)` : ""} Kemal'e gitti · renk: ${b.renk || "model kartından"}${b.beden ? ` · beden: ${BEDEN_AD[b.beden]}` : ""}${medya.length > liste.length ? ` (⚠️ ${medya.length - liste.length} dosya indirilemedi — Telegram botu 20 MB üstünü indiremez)` : ""}. SON YAYIN ONAYI kartı birkaç dakika içinde gelir.` : `❌ ${b.kod}: İLETİLMEDİ — Kemal'e iş gönderilemedi; tekrar deneyeyim mi?`);
  if (!ok) await iletimHatasi(env, `${b.kod}: Kemal'e paylaşım işi gönderilemedi`, simdi);
}
// Kemal'in SON YAYIN kartları Venom'a da gelir: Patron buradan onaylar (Kemal uygular, sonuç "sonuc" kuyruğundan)
async function onayAktar(env, simdi) {
  for (const o of await kuyruguAl(env, "venomOnay")) {
    if (o.tur !== "kemalYayin") continue;
    const medya = (o.venomMedya && o.venomMedya.length ? o.venomMedya : o.medya || []).slice(0, 10);
    if (medya.length > 1) await tg(env, "sendMediaGroup", { chat_id: patron(env), media: medya.map((m, i) => (i === 0 ? { ...m, caption: `👀 ${o.kod} · ${o.marka}` } : m)) }).catch(() => null);
    else if (medya.length === 1) await tg(env, medya[0].type === "video" ? "sendVideo" : "sendPhoto", { chat_id: patron(env), [medya[0].type === "video" ? "video" : "photo"]: medya[0].media, caption: `👀 ${o.kod} · ${o.marka}` }).catch(() => null);
    await kaydet(env, `venom:bot:yayin:${o.kartNo}`, { kod: o.kod, zaman: simdi }, 14 * 86400);
    await yaz(env, [`📣 SON YAYIN ONAYI — ${o.kod} · ${o.marka}`, "Kanala bu yazıyla gidecek (onaylarsanız Kemal kanala koyar, Selin siteye ekler):", "───", o.yazi || "", "───"].join("\n"),
      { reply_markup: { inline_keyboard: [[{ text: "📣 Kanala ve siteye gönder", callback_data: `vy:o:${o.kartNo}` }, { text: "❌ Gönderme", callback_data: `vy:x:${o.kartNo}` }]] } });
  }
}
// Gün içinde önemli hatalar Patron'a kısa (aynı hata bir kez; ayrıntı Claude Code'da)
const HATA_ANAHTAR = { "pelin:hata": "Pelin", "selin:hata": "Selin", "sami:hata": "Sami", "kemal:pelinTeslimHata": "Kemal", "kemal:sonHata": "Kemal" };
async function hataBildir(env, simdi) {
  const gorulen = await oku(env, "venom:bot:hataGoruldu", null);
  const yeni = { ...(gorulen || {}) }, satir = [];
  for (const [k, ad] of Object.entries(HATA_ANAHTAR)) {
    const h = await env.KAYIT.get(k, "json").catch(() => null);
    const z = Number(h && h.zaman) || 0;
    if (!z || z <= (yeni[k] || 0)) continue;
    yeni[k] = z;
    if (gorulen && simdi - z < 3600) satir.push(`• ${ad}: ${String(h.hata || h.yol || "").slice(0, 160)}`);
  }
  await kaydet(env, "venom:bot:hataGoruldu", yeni);
  if (satir.length) await yaz(env, ["⚠️ Botlarda hata (Claude Code'a da kayıtlı):", ...satir].join("\n"));
}

// ---------- TEK KAPI (5 Kasım, Patron): diğer botların Patron'a giden her şeyi buradan ----------
const BOT_BAG = { kemal: "KEMAL_W", selin: "SELIN_W", pelin: "PELIN_W", sami: "SAMI_W" };
const BOT_AD = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" };
async function botaSor(env, bot, islem, ...arg) {
  const b = env[BOT_BAG[bot]];
  if (!b || typeof b[islem] !== "function") return null;
  try { return await b[islem](...arg); } catch (e) { await hataYaz(env, `kapi:${bot}`, e); return null; }
}
async function butonCevir(env, bot, satirlar) {
  const yeni = [];
  for (const satir of satirlar || []) {
    const s2 = [];
    for (const b of satir) {
      if (b.callback_data) { const rid = kisaId(); await kaydet(env, `venom:bot:dugme:${rid}`, { bot, data: b.callback_data }, 14 * 86400); s2.push({ text: b.text, callback_data: `vr:${rid}` }); }
      else if (b.url) s2.push({ text: b.text, url: b.url });
    }
    if (s2.length) yeni.push(s2);
  }
  return yeni;
}
export async function aktarilanGonder(env, k) {
  const bas = `🤖 ${BOT_AD[k.bot] || k.bot}`;
  if (k.metin) await kaydet(env, "venom:bot:sonBot", { bot: k.bot, zaman: Math.floor(Date.now() / 1000), metin: String(k.metin).slice(0, 400) }, 3600).catch(() => null);
  const klavye = k.butonlar ? { inline_keyboard: await butonCevir(env, k.bot, k.butonlar) } : null;
  const metin = k.metin ? `${bas}\n${k.metin}` : bas;
  const pm = k.parse_mode ? { parse_mode: k.parse_mode } : {};
  const medya = (k.medya || []).filter((m) => m && m.media).slice(0, 10);
  const kisa = metin.length <= 1024;
  if (medya.length > 1) {
    const r = await tg(env, "sendMediaGroup", { chat_id: patron(env), media: medya.map((m, i) => (i === 0 ? { ...m, caption: kisa && !klavye ? metin : bas, ...pm } : m)) });
    if (!r.ok) await yaz(env, `${bas}: (görseller gösterilemedi: ${r.description || "?"})`);
    if (!kisa || klavye) await yaz(env, kisa || !k.metin ? metin : metin.slice(0, 4000), { ...pm, ...(klavye && klavye.inline_keyboard.length ? { reply_markup: klavye } : {}) });
    return;
  }
  if (medya.length === 1) {
    const m = medya[0], metod = m.type === "video" ? "sendVideo" : m.type === "document" ? "sendDocument" : "sendPhoto", alan = m.type === "video" ? "video" : m.type === "document" ? "document" : "photo";
    const r = await tg(env, metod, { chat_id: patron(env), [alan]: m.media, caption: kisa ? metin : bas, ...pm, ...(kisa && klavye && klavye.inline_keyboard.length ? { reply_markup: klavye } : {}), ...(m.type === "video" ? { supports_streaming: true } : {}) });
    if (r.ok && kisa) return;
  }
  return yaz(env, metin, { ...pm, ...(klavye && klavye.inline_keyboard.length ? { reply_markup: klavye } : {}) });
}

// ---------- SİTE KONTROLÜ (5 Kasım, Patron): wearvolonte.com'u OKUR, değiştirmez; düzeltme Selin'e (site_duzelt) ----------
export async function siteKontrolMetni(env, kod, simdi) {
  const liste = await siteVerisi(env);
  if (!liste.length) return "Site verisi okunamadı.";
  const gorunen = liste.filter((u) => !u.gizli);
  const kodlar = gorunen.map((u) => String(u.kod));
  const stok = env.STOK ? await stokIste(env, "/toplu", { kodlar }).catch(() => ({})) : {};
  const ai = (u) => (u.fotolar || []).filter((f) => /\/pelin-[a-z0-9-]+\.jpg$/.test(f)).length;
  if (kod) {
    const u = liste.find((x) => String(x.kod) === kod);
    if (!u) return `${kod}: sitede YOK.`;
    const st = stok[kod];
    return [`🌐 ${kod} — ${u.baslik || ""}${u.gizli ? " (GİZLİ)" : ""}`, `Fotoğraf: ${(u.fotolar || []).length}${ai(u) ? ` (yapay zekâ: ${ai(u)})` : ""} · video: ${(u.videolar || []).length}`, `Bedenler: ${u.bedenler || "?"} · eklenme: ${u.eklenme || "?"}`, `Açıklama (EN): ${String((u.aciklama && u.aciklama.en) || "").slice(0, 300)}`, `Vegawin stok: ${st ? Math.max(0, st.toplam || 0) : "?"}`, "Not: görsellerin içindeki renk/kolaj/marka yazısını görüntü incelemesi olmadan göremiyorum (istenirse ücretli kontrol)."].join("\n");
  }
  const fotosuz = gorunen.filter((u) => !(u.fotolar || []).length).map((u) => u.kod);
  const videosuz = gorunen.filter((u) => !(u.videolar || []).length).map((u) => u.kod);
  const yz = gorunen.filter((u) => ai(u)).map((u) => u.kod);
  const bitmis = gorunen.filter((u) => stok[u.kod] && !(stok[u.kod].toplam > 0)).map((u) => u.kod);
  const satir = (ad, l) => `${ad}: ${l.length}${l.length ? ` (${l.slice(0, 20).join(", ")}${l.length > 20 ? " …" : ""})` : ""}`;
  return [`🌐 wearvolonte.com — ${gorunen.length} model görünüyor (${liste.length - gorunen.length} gizli)`, satir("Fotoğrafsız", fotosuz), satir("Videosuz", videosuz), satir("Yapay zekâ (Pelin) fotoğrafı olan", yz), satir("Vegawin'de stoğu bitmiş ama sitede görünen", bitmis), "Düzeltme için: site_duzelt (Selin yapar)."].join("\n");
}

// ---------- KANAL İZLEME (5 Kasım, Patron): Venom kanalda yönetici, SADECE okur (paylaşım Kemal'den). Sorun → Patron'a ----------
const FIYAT_KALIP = /(\$\s?\d|\d+(?:[.,]\d+)?\s?(?:\$|usd|eur|€|tl|₺)(?![a-z])|\bprice\b|\bprix\b|fiyat)/i;
async function modelMarkasiVenom(env, kod) {
  const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
  if (kart && ["BLACKROSE", "VOLONTE"].includes(kart.marka)) return { marka: kart.marka, renk: kart.renk || null };
  const b = env.STOK ? await stokIste(env, "/bilgi", { kod }).catch(() => null) : null;
  const m = [...new Set(((b && b.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))];
  return { marka: m.length === 1 ? m[0] : null, renk: null };
}
export async function kanalSorunlari(env, yazi, kod) {
  const sorun = [];
  if (FIYAT_KALIP.test(yazi)) sorun.push("yazıda FİYAT var");
  if (!kod) return sorun;
  const { marka, renk } = await modelMarkasiVenom(env, kod);
  if (marka === "BLACKROSE" && /VOLONTE\s*[–-]\s*Premium/i.test(yazi)) sorun.push("Black Rose modeli ama imza VOLONTE");
  if (marka === "VOLONTE" && /BLACK\s*ROSE\s*[–-]\s*Premium/i.test(yazi)) sorun.push("VOLONTE modeli ama imza BLACK ROSE");
  const rs = String(yazi).match(/Colou?rs?\s*\/?[^:]*:\s*([^\n]+)/i);
  if (renk && rs) {
    const t = String(renk).toLocaleLowerCase("tr").trim(), ton = t.match(/^(koyu|açık|acik)\s+(.+)$/);
    const en = (renkCevir([t]) || (ton && renkCevir([ton[2]])) || []).map((x) => String(x).toLowerCase());
    if (en.length && !en.some((x) => rs[1].toLowerCase().includes(x))) sorun.push(`renk: model kartında "${renk}", yazıda "${rs[1].trim().slice(0, 40)}"`);
  }
  return sorun;
}
async function kanalIzle(env, post, duzenlendi, simdi) {
  const kanal = await env.KAYIT.get("kanal", "json").catch(() => null);
  if (kanal && post.chat && post.chat.id !== kanal.id) return; // sadece VOLONTE kanalı
  const medya = post.photo ? "foto" : post.video ? "video" : post.document ? "dosya" : post.animation ? "video" : null;
  const gid = post.media_group_id;
  let al = gid ? await oku(env, `venom:kanal:album:${gid}`, null) : null;
  if (gid) { al = al || { ids: [], medya: [], yazi: "" }; al.ids.push(post.message_id); if (medya) al.medya.push(medya); if (post.caption) al.yazi = post.caption; await kaydet(env, `venom:kanal:album:${gid}`, al, 3600); }
  const yazi = post.caption || post.text || "";
  if (!yazi && gid) return; // albümün yazısız parçası (yazılı parça kaydedilir)
  const kod = (String(yazi).match(/CODE[^0-9]{0,6}(\d{3,6})/i) || String(yazi).match(/\b(\d{3,6})\b/) || [])[1] || null;
  const sorunlar = await kanalSorunlari(env, yazi, kod);
  const kayit = { id: post.message_id, zaman: post.date || simdi, kod, medya: gid ? `albüm (${(al.medya || []).join("+") || "?"})` : medya || "yazı", imza: post.author_signature || null, yazi: String(yazi).slice(0, 300), sorunlar, duzenlendi: Boolean(duzenlendi) };
  const l = (await oku(env, "venom:kanal:son", [])).filter((x) => x.id !== kayit.id);
  await kaydet(env, "venom:kanal:son", [...l, kayit].slice(-300));
  if (sorunlar.length) {
    const link = kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${post.message_id}` : `#${post.message_id}`;
    await yaz(env, `⚠️ Kanalda sorun — ${kod || "kodsuz"}${duzenlendi ? " (düzenleme)" : ""}: ${sorunlar.join("; ")}\n${link}\nDüzeltmek için Kemal'e yaptırabilirim.`);
  }
}

// ---------- Sohbet ----------
const SISTEM = `Sen VENOM'sun: VOLONTE'nin (İstanbul Laleli, kadın giyim toptan; iki AYRI mağaza: VOLONTE ve BLACK ROSE) komuta merkezi. Sadece Patron'la konuşursun; ona "Patron" diye hitap edersin. Kısa, net, sade Türkçe (Rusça yazarsa Rusça).
Görevin: Patron'un isteğini anlayıp ilgili bota yaptırmak (araçlarla), sonucu kısa göstermek.
Kurallar:
- Komut ezberi yok; yarım, karışık, sesli mesajdan gelen cümleleri yorumla. Emin değilsen TAHMİN ETME, tek kısa soru sor.
- "Yapamam / bilmiyorum" deme: yapabildiğini yap; yapamıyorsan en yakın yapabileceğini söyle ve yeni yetenek gerekiyorsa "Claude Code'a ekletelim mi?" diye sor; Patron evet derse yetenek_istegi ile not al.
- Dışarı giden her mesaj ve para harcayan her iş onay kartıyla gider (araçlar kartı açar). Küçük işler (stok sorgusu, ekibe hatırlatma, bakiye/ciro bakmak) onaysız.
- VOLONTE ve BLACK ROSE ASLA toplanmaz, karşılaştırılmaz, fark hesaplanmaz; her mağaza ayrı.
- Alış fiyatı, maliyet, kâr, gider, ciro SADECE Patron'a söylenir; Fuat'a/Nuri'ye/ekibe giden metne ASLA girmez.
- Patron'un kendi yazdığı metni değiştirmeden gönder; düzeltme isterse uygula.
- Sohbeti hatırla ("ona tekrar yaz", "dünkü gibi yap").
- TEK MUHATAP sensin: Patron diğer botlarla (Pelin, Kemal, Selin, Sami) uğraşmaz. İşi doğru bota ver, takip et, sonucu kısa anlat. Onay bekleyen bir şey sorulursa bekleyenler aracını kullan.
- Patron yeni bir kalıcı karar söylerse karar_kaydet ile hafızana yaz.
- Diğer botların Patron'a mesajları ve onay kartları "🤖 Kemal/Selin/Pelin/Sami" başlığıyla buraya gelir; düğmeleri Patron burada basar.
- İŞ DAĞITIMI: Patron diğer botlara iş vermez, sana söyler. İşi böl ve doğru bota ver: Pelin (fotoğraf/video; Nora senaryo Pelin'in içinde) → pelin_uret ya da bota_yaz("pelin", net talimat); Kemal (kanal) → kemal_paylas / bota_yaz("kemal"); Selin (site) → selin_durum / selin_taslak / site_duzelt; Sami (stok) → stok_sorgu / hatirlat. Takip et; sonuç ve onay kartları buraya gelir.
- Site onayı 0091 ve Merdan'dadır; Selin'in taslak kartları Patron'a gelmez. Selin'i sadece bilgi olarak takip et (selin_durum, site_kontrol).
- Kanal: sen yöneticisin ama ASLA paylaşım yapmazsın; paylaşımları kanal_paylasimlari ile görürsün, sorun varsa Patron'a söylersin.
- Patron fotoğraf/video gönderip "paylaş" derse kemal_paylas kullan: TÜM dosyalar Kemal'e (Pelin'e DEĞİL), renk/beden Patron ne yazdıysa (renk, beden alanları), video sesi/müziği korunur; yayın SON YAYIN ONAYI kartıyla, onaydan sonra kanal + site. Kod + renk + "paylaş" varsa SORU SORMA, başlat. Patron "en son gönderdiğim gibi" derse son_set=true.
- Patron bir kartı reddettikten sonra yeni dosya gönderip paylaş derse bu YENİ bir paylaşımdır; eski kartı bekleme, kemal_paylas'ı yeniden çağır.
- "Aracım yok / yapamam / yeteneğim yok" ASLA deme. Yapamadığın iş için yetenek_istegi ile not bırak ve sadece "📝 Not ettim, Claude Code ekleyecek" de; yapabildiğin en yakın işi yap.
- Bu hafta SAĞLAMLAŞTIRMA haftası: yeni özellik önerme; Pelin'e üretim işi sadece Patron açıkça isterse.
- Her işi aldığında cevabın İLK satırı tek satırla ne anladığın olsun: "🧭 Anladım: 3627 beyaz → Kemal'e paylaşım, alt yazı white". Patron "hayır" derse düzelt.
- Üç temel istek: (1) "3627 beyaz fotoğrafını/videosunu yap" → Pelin'e üretim (maliyet kartı Patron'a); (2) dosya + "paylaş / kanala / siteye" → kemal_paylas (Kemal + Selin, Venom kontrolüyle); (3) sadece dosya, açıklama yok → tek soru, 3 düğme (Pelin kullansın / Paylaş / Sadece kaydet).
- Kemal ve Selin yayından önce VENOM KONTROLÜNDEN geçer (marka, renk, beden/alt yazı, aynı gün tekrar, kolaj); durdurulanlar akşam raporunda.
- Patron ürün/manken fotoğrafı gönderip "Pelin'e", "ön/arka", "bu renk için bunları kullan" derse pelin_foto_kaydet kullan (kod + renk + roller; "sadece bunlar / eskileri kullanma" → sadece_bunlar; "yeniden başlat / baştan" → yeniden_baslat). Fotoğraf ASLA bota yazı olarak anlatılmaz; dosya olarak iletilir.
- Fotoğraf/video içeren HER işte sonucu açıkça söyle: "✅ fotoğraf iletildi (kime, kaç tane, hangi etiketle)" ya da "❌ fotoğraf İLETİLMEDİ (neden)". Araç sonucu ne diyorsa onu söyle; iletilmeden "ilettim" deme.
- Aşağıdaki HAFIZA, depodaki notlar ve Patron kararlarıdır; her cevapta uygula.`;

async function sesiYaziyaCevir(env, dosyaId) {
  if (!openaiVar(env)) return null;
  const f = await tg(env, "getFile", { file_id: dosyaId });
  if (!f.ok) return null;
  const ses = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`);
  if (!ses.ok) return null;
  const form = new FormData();
  form.append("model", env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("file", new Blob([await ses.arrayBuffer()], { type: "audio/ogg" }), "ses.ogg");
  const r = await openaiFetch(env, "/v1/audio/transcriptions", { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  return r.ok ? String(j.text || "").trim() : null;
}

export async function sohbet(env, metin, simdi) {
  const sinir = await venomSinir(env), harcanan = await venomHarcanan(env, simdi);
  if (harcanan >= sinir) return yaz(env, `Bu ayın Venom yapay zekâ sınırı (${sinir} $) doldu Patron. Sohbet gelecek ay açılır; sınırı artırmak için Claude Code'a söyleyin. Onay düğmeleri ve 20:00 özeti çalışmaya devam eder.`);
  const gecmis = await oku(env, "venom:bot:sohbet", []);
  const duzelt = await oku(env, "venom:bot:duzelt", null);
  let girdi = String(metin).slice(0, 3000);
  if (duzelt) {
    const is = await oku(env, `venom:bot:is:${duzelt.id}`, null);
    await env.KAYIT.delete("venom:bot:duzelt");
    if (is) { is.durum = "duzeltildi"; await kaydet(env, `venom:bot:is:${is.id}`, is, 7 * 86400); girdi = `Patron şu onay kartını düzeltmek istiyor:\n---\n${is.metin}\n---\nPatron'un talimatı: ${girdi}\nAynı işi düzeltilmiş hâliyle yeniden hazırla (aracı tekrar çağır).`; }
  }
  const mesajlar = [...gecmis, { role: "user", content: girdi }];
  env.__patronMetni = String(metin); // araçlar için (ör. Pelin üretimi sadece açık istekle)
  if (!claudeVar(env)) return yaz(env, "Yapay zekâ anahtarı bağlı değil (Claude Code'a haber verin).");
  const client = claudeIstemci(env, { maxRetries: 1, timeout: 60_000 });
  let cevapMetni = "";
  // 5 Kasım: sistem metni konuşma boyunca SABİT (araç hafızayı değiştirse bile) — değişirse Claude'un düşünme bloğu geçersiz sayılıyordu (400)
  const sonBot = await oku(env, "venom:bot:sonBot", null);
  const sistem = [{ type: "text", text: SISTEM }, { type: "text", text: await hafizaMetni(env), cache_control: { type: "ephemeral" } }, { type: "text", text: `Şimdi: ${tarihSaat(simdi)} (İstanbul).${sonBot && simdi - sonBot.zaman < 1800 ? `\nSON BOT MESAJI (${Math.round((simdi - sonBot.zaman) / 60)} dk önce, ${BOT_AD[sonBot.bot] || sonBot.bot}): "${sonBot.metin}". Bu mesaj Patron'dan yazı bekliyorsa (ör. "nasıl düzelteyim, yazın") ve Patron'un yeni mesajı ona cevapsa, bota_yaz ile AYNEN ${sonBot.bot} botuna ilet.` : ""}` }];
  for (let tur = 0; tur < 4; tur++) {
    const model = env.VENOM_MODEL || MODEL;
    const r = await client.messages.create({ model, max_tokens: 1500, system: sistem, tools: ARACLAR, output_config: { effort: "low" }, messages: mesajlar });
    await venomHarcamaYaz(env, claudeUsd(model, r.usage), simdi);
    const yazi = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (yazi) cevapMetni = yazi;
    const kullan = r.content.filter((b) => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !kullan.length) break;
    mesajlar.push({ role: "assistant", content: r.content });
    const sonuclar = [];
    for (const a of kullan) {
      let s;
      try { s = await aracCalistir(env, a.name, a.input || {}, simdi); } catch (e) { await hataYaz(env, `arac:${a.name}`, e); s = "Bu iş şu an yapılamadı (hata Claude Code'a iletildi)."; }
      sonuclar.push({ type: "tool_result", tool_use_id: a.id, content: s });
    }
    mesajlar.push({ role: "user", content: sonuclar });
  }
  // 6 Kasım (D10): araç kullanmadan netleştirme sorusu sorduysa → "anlamadıklarım"
  if (cevapMetni && !mesajlar.some((x) => Array.isArray(x.content) && x.content.some((b) => b.type === "tool_use")) && /\?/.test(cevapMetni) && /anlamad|emin de[ğg]il|hangisi|hangi[^\n]*\?|ne demek|a[çc]ar m[ıi]s[ıi]n|tam olarak ne/i.test(cevapMetni)) await anlamadimKaydet(env, metin, "netleştirme sorusu sordum", simdi);
  // 6 Kasım (Patron): "aracım yok" yerine not al
  if (cevapMetni && /arac[ıi]m (yok|bulunmuyor)|b[öo]yle bir arac[ıi]m|yetene[ğg]im yok|bunu yapam[ıi]yorum/i.test(cevapMetni)) {
    await yetenekNotu(env, `Patron istedi, Venom yapamadı: "${String(metin).slice(0, 300)}"`, simdi);
    cevapMetni = `${cevapMetni.replace(/[^.\n]*(arac[ıi]m (yok|bulunmuyor)|b[öo]yle bir arac[ıi]m|yetene[ğg]im yok)[^.\n]*[.]?/gi, "").trim()}\n📝 Not ettim, Claude Code ekleyecek.`;
  }
  if (cevapMetni) await yaz(env, cevapMetni);
  await kaydet(env, "venom:bot:sohbet", [...gecmis, { role: "user", content: girdi.slice(0, 1500) }, { role: "assistant", content: (cevapMetni || "…").slice(0, 1500) }].slice(-20), 7 * 86400);
}

export async function guncelleme(u, env) {
  const simdi = Math.floor(Date.now() / 1000);
  // Telegram aynı güncellemeyi tekrar gönderirse (geç cevap) iş iki kez yapılmasın
  if (u.update_id != null && !(await ilkKezMi(env, u.update_id))) return;
  if (u.callback_query) return dugme(env, u.callback_query, simdi);
  if (u.channel_post || u.edited_channel_post) return kanalIzle(env, u.channel_post || u.edited_channel_post, Boolean(u.edited_channel_post), simdi).catch((e) => hataYaz(env, "kanal", e));
  const m = u.message;
  if (!m || !m.from || m.chat.type !== "private" || !patronMu(env, m.from.id)) return; // sadece Patron
  let metin = m.text || m.caption || "";
  // 5 Kasım: fotoğraf/video → son 1 saatin medya listesi (Kemal paylaşımı için)
  const dosya = m.photo ? { tur: "foto", file_id: m.photo[m.photo.length - 1].file_id } : m.video ? { tur: "video", file_id: m.video.file_id } : m.document && /^(image|video)\//.test(m.document.mime_type || "") ? { tur: /^video/.test(m.document.mime_type) ? "video" : "foto", file_id: m.document.file_id } : null;
  if (dosya) {
    const l = await oku(env, "venom:bot:medya", []);
    await kaydet(env, "venom:bot:medya", [...l, { ...dosya, zaman: simdi }].slice(-10), 3 * 3600);
    if (!metin.trim()) { // 6 Kasım (D8): açıklamasız dosya → tek soru, 3 düğme
      if (m.media_group_id && l.some((x) => simdi - x.zaman < 5)) return;
      const rid = kisaId();
      await kaydet(env, "venom:bot:medyaSoru", { rid, zaman: simdi }, 3 * 3600).catch(() => null);
      return tg(env, "sendMessage", { chat_id: patron(env), text: `📎 Aldım (${l.length + 1} dosya). Ne yapayım Patron?`, reply_markup: { inline_keyboard: [[{ text: "🎬 Pelin kullansın", callback_data: `vm:${rid}:p` }, { text: "📣 Paylaş", callback_data: `vm:${rid}:k` }], [{ text: "💾 Sadece kaydet", callback_data: `vm:${rid}:s` }]] } });
    }
    metin = `${metin}\n(Patron az önce ${l.length + 1} fotoğraf/video gönderdi.)`;
  }
  if (m.voice || m.audio) {
    if ((await venomHarcanan(env, simdi)) >= (await venomSinir(env))) return yaz(env, `Bu ayın Venom yapay zekâ sınırı doldu; sesli mesaj gelecek ay açılır.`);
    const t = await sesiYaziyaCevir(env, (m.voice || m.audio).file_id).catch(() => null);
    if (t) await venomHarcamaYaz(env, Math.max(0.001, ((m.voice || m.audio).duration || 30) / 60 * SES_DAKIKA_USD), simdi);
    if (!t) return yaz(env, openaiVar(env) ? "Sesli mesajı anlayamadım Patron; tekrar söyler misiniz?" : "Sesli mesaj için OPENAI_API_KEY gerekli (Cloudflare → volonte-venom → Secret).");
    metin = t;
    await yaz(env, `🎙 "${t.slice(0, 300)}"`);
  }
  if (!metin.trim()) return;
  // 6 Kasım (D9): "hayır / yanlış" → son anladığımı geri al, kaydet
  const sonAnlama = await oku(env, "venom:bot:sonAnlama", null);
  if (sonAnlama && simdi - sonAnlama.zaman < 900 && /^\s*(hay[ıi]r|yanl[ıi][sş]|iptal|dur|vazge[çc])\b/i.test(metin)) {
    await env.KAYIT.delete("venom:bot:sonAnlama").catch(() => null);
    let geri = "";
    if (sonAnlama.tur === "paylas" && (await oku(env, "venom:bot:paylasBekle", null))) { await env.KAYIT.delete("venom:bot:paylasBekle").catch(() => null); geri = " Kemal'e gitmeden durdurdum."; }
    await anlamadimKaydet(env, sonAnlama.girdi, `yanlış anladım: "${sonAnlama.ozet}"`, simdi);
    return yaz(env, `Tamam, yanlış anlamışım.${geri} Ne yapayım Patron? Tek cümleyle yazın (ör. "3627 beyaz paylaş" / "3627 beyaz videosunu yap").`);
  }
  // 6 Kasım (D8): açıklamasız dosyadan sonra "3627 beyaz" → seçilen iş
  const mn = await oku(env, "venom:bot:medyaNiyet", null);
  if (mn && simdi - mn.zaman < 3600) {
    const n = kodRenk(metin);
    if (n) {
      await env.KAYIT.delete("venom:bot:medyaNiyet").catch(() => null);
      if (mn.islem === "pelin") {
        await anlamaYaz(env, { tur: "pelinFoto", ozet: `${n.kod}${n.renk ? ` ${n.renk}` : ""} → fotoğraflar Pelin'e (ürün fotoğrafı)`, girdi: metin }, simdi);
        return yaz(env, `🧭 Anladım: ${n.kod}${n.renk ? ` ${n.renk}` : ""} → fotoğraflar Pelin'e.\n${await pelinFotoIlet(env, { kod: n.kod, renk: n.renk }, simdi)}`);
      }
      return hizliPaylas(env, { ...n, sonSet: false }, simdi, metin);
    }
  }
  // 6 Kasım (D8): "3627 beyaz fotoğrafını/videosunu yap" → Pelin'e üretim (maliyet kartı Patron'a; açık istek)
  const un = uretNiyeti(metin);
  if (un) {
    await anlamaYaz(env, { tur: "uret", ozet: `${un.kod}${un.renk ? ` ${un.renk}` : ""} → Pelin'e üretim`, girdi: metin }, simdi);
    const r = await botaSor(env, "pelin", "mesaj", `/uret ${un.kod}${un.renk ? ` ${un.renk}` : ""}`);
    return yaz(env, `🧭 Anladım: ${un.kod}${un.renk ? ` ${un.renk}` : ""} → Pelin'e fotoğraf + video üretimi. ${r ? "Pelin'in kartı (anlama / maliyet) buraya gelecek; onaylamadan para harcanmaz." : "⚠️ Pelin'e ulaşılamadı."}`);
  }
  // 6 Kasım: "3627 beyaz paylaş" → soru sormadan Kemal'e (renk yoksa tek soru + düğme); bekleyen renk sorusuna cevap
  const soru = await oku(env, "venom:bot:paylasSoru", null);
  if (soru && renkBilinir(String(m.text || m.caption || "").trim())) { await env.KAYIT.delete("venom:bot:paylasSoru").catch(() => null); return yaz(env, await paylasBaslat(env, { ...soru, renk: String(m.text || m.caption).trim() }, simdi)); }
  const niyet = paylasNiyeti(m.text || m.caption || metin);
  if (niyet) return hizliPaylas(env, niyet, simdi, m.text || m.caption || metin);
  if (/^\/start\b/.test(metin)) return yaz(env, "Merhaba Patron, ben Venom. Ne istediğinizi normal yazın ya da sesli söyleyin; işi ilgili bota yaptırıp size göstereyim.");
  await tg(env, "sendChatAction", { chat_id: patron(env), action: "typing" });
  return sohbet(env, metin, simdi);
}

// ---------- 5 dakikalık görev ----------
export async function venomCron(env, simdi) {
  await webhookKur(env);
  // Kemal toplu raporu grup yerine Venom'a bırakır. 6 Kasım: 20 dakikada bir yazılır (önceden her 5 dk: günde 288 KV yazması)
  const aktif = Number(await env.KAYIT.get("venom:bot:aktif").catch(() => 0)) || 0;
  if (simdi - aktif > 1200) await env.KAYIT.put("venom:bot:aktif", String(simdi), { expirationTtl: 1800 }).catch(() => null);
  // Diğer botların sonuçları → "✅ yapıldı"
  for (const s of await kuyruguAl(env, "sonuc")) await yaz(env, `${s.ok ? "✅" : "⚠️"} ${s.aciklama}`);
  try { await paylasimGonder(env, simdi); } catch (e) { await hataYaz(env, "paylas", e); }
  // Tek seferlik (Claude Code, 5 Kasım): KV "venom:pelinFotoIlet" = pelin_foto_kaydet girdisi → sonuç Patron'a (İLETİLDİ/İLETİLMEDİ)
  try { const t = await oku(env, "venom:pelinFotoIlet", null); if (t) { await env.KAYIT.delete("venom:pelinFotoIlet"); await yaz(env, await pelinFotoIlet(env, t, simdi, async () => {})); } } catch (e) { await hataYaz(env, "pelinFotoIlet", e); }
  // 6 Kasım (Claude Code hazırlar): KV "venom:temizlikKart" = { metin, kanalSil: [{ kod, ids, not }], siteKaldir: [...] } → Patron onay kartı
  try { const t = await oku(env, "venom:temizlikKart", null); if (t) { await env.KAYIT.delete("venom:temizlikKart"); if ((t.kanalSil || []).length || (t.siteKaldir || []).length) await kartAc(env, { tur: "temizlik", kanalSil: t.kanalSil || [], siteKaldir: t.siteKaldir || [] }, t.metin, simdi); else await yaz(env, t.metin); } } catch (e) { await hataYaz(env, "temizlikKart", e); }
  // 6 Kasım (B3): KV "venom:kemalPaylasElle" = { kod, renk, beden, liste } → Patron'un istediği paylaşım (duraklatma dışı, açık istek) → yeni SON YAYIN kartı
  try { const t = await oku(env, "venom:kemalPaylasElle", null); if (t) { await env.KAYIT.delete("venom:kemalPaylasElle"); const ok = await kemaleVer(env, { kod: t.kod, renk: t.renk || null, beden: t.beden || null }, t.liste || [], simdi); await yaz(env, ok ? `🧭 ${t.kod} ${t.renk || ""} → Kemal'e yeni SON YAYIN kartı hazırlatılıyor (alt yazı ${renkDilleri(t.renk || "") ? renkDilleri(t.renk).en : "model kartı"}${t.beden ? `, ${BEDEN_AD[t.beden]}` : ""}, ${(t.liste || []).length} dosya). Kart Venom kontrolüyle buraya gelecek.` : `❌ ${t.kod}: Kemal'e iş gönderilemedi.`); } } catch (e) { await hataYaz(env, "paylasElle", e); }
  try { const rs = await oku(env, "venom:siteRenkSonuc", null); if (rs) { await env.KAYIT.delete("venom:siteRenkSonuc"); await yaz(env, `🤖 Selin\n${[].concat(rs).join("\n")}`); } } catch (e) { await hataYaz(env, "siteRenk", e); }
  try { await onayAktar(env, simdi); } catch (e) { await hataYaz(env, "onayAktar", e); }
  try { await hataBildir(env, simdi); } catch (e) { await hataYaz(env, "hataBildir", e); }
  // Cloudflare %80 uyarısı: günde bir kez (pazar da)
  try { const cf = await cfKullanimSatiri(env, simdi); if (cf.uyari && (await ilkKezBugun(env, `cf80:${gunAnahtari(simdi)}`))) await yaz(env, cf.metin); } catch (e) { await hataYaz(env, "cfKullanim", e); }
  if (pazarMi(simdi)) return; // pazar: rapor ve bildirim yok
  const gun = gunAnahtari(simdi);
  // 6 Kasım: 09:30 günlük test + sabah raporu (çalışmayan varsa raporda); işaretler StokDO'da (KV sınırından bağımsız)
  if (saat(simdi) >= 9.5 && saat(simdi) < 11 && (await ilkKezBugun(env, `toplu:${gun}`))) {
    let test = ""; try { test = await gunlukTest(env, simdi); } catch (e) { test = `🧪 Sabah testi çalışmadı: ${String(e && e.message).slice(0, 120)}`; }
    try { await yaz(env, `${test}\n\n${await topluRaporMetni(env, simdi)}\n\n📋 Bugünün planı:\n${await bekleyenlerMetni(env, simdi)}`); } catch (e) { await yaz(env, test).catch(() => null); await hataYaz(env, "toplu", e); }
  }
  if (saat(simdi) >= 20 && saat(simdi) < 22 && (await ilkKezBugun(env, `aksam:${gun}`))) {
    try { await yaz(env, await gunOzeti(env, simdi)); } catch (e) { await hataYaz(env, "aksam", e); }
  }
}
// 20:00 günün özeti: bugün arşive düşen işler (tür türüne) + Venom'un yaptırdıkları
// 5 Kasım (Patron): siteye inmeyen her video akşam raporunda (Selin'in video denetimi + bugün gelen 20 MB üstü + kanal→site)
const TUR_AD = { buyuk: "20 MB üstü", "sitede-bozuk": "sitede oynamıyor", format: "MOV", "sitede-degil": "model sitede değil", "listede-yok": "sitenin listesinde yok" };
export async function videoRaporu(env, simdi) {
  const d = await oku(env, "venom:videoDenetim", null);
  const gelen = (await oku(env, "venom:videoGelenBuyuk", [])).filter((x) => simdi - x.zaman < 86400);
  const kv = (await oku(env, "venom:kanalVideoSonuc", [])).filter((x) => simdi - x.zaman < 86400);
  const sorun = d ? d.sorunlar.filter((x) => x.tur !== "format") : [];
  const satir = [];
  if (d) { const bozuk = d.siteVideo - d.calisan - (d.denenemedi || 0); satir.push(`📹 Site videoları: ${d.calisan}/${d.siteVideo} oynuyor${bozuk ? ` · ⚠️ ${bozuk} OYNAMIYOR` : ""}${d.denenemedi ? ` · ${d.denenemedi} denenemedi (sonraki turda)` : ""} (denetim ${tarihSaat(d.zaman).slice(11, 16)})`); }
  if (d && (d.istenen || []).length) satir.push(`Gönderene "tekrar gönder" dendi: ${[...new Set(d.istenen)].join(", ")}`);
  if (sorun.length) satir.push(`Siteye inmeyen/oynamayan ${sorun.length} video:`, ...sorun.slice(0, 15).map((x) => `• ${x.kod} — ${TUR_AD[x.tur] || x.tur}: ${x.neden}`), ...(sorun.length > 15 ? [`• … ve ${sorun.length - 15} tane daha`] : []));
  if (gelen.length) satir.push(`Bugün 20 MB üstü gelen video: ${gelen.length} (${gelen.map((x) => `${x.kod || "kodsuz"} ${(x.boyut / 1048576).toFixed(0)} MB, ${x.kim}`).join("; ")}) — gönderene "normal video olarak tekrar gönder" dendi.`);
  const eklenen = kv.filter((x) => x.ok).map((x) => x.kod), olmayan = kv.filter((x) => !x.ok);
  if (eklenen.length) satir.push(`Kanaldan siteye eklenen video: ${[...new Set(eklenen)].join(", ")}`);
  if (olmayan.length) satir.push(...olmayan.map((x) => `• ${x.kod} — kanal videosu siteye konamadı: ${x.neden}`));
  return satir.length ? satir.join("\n") : null;
}
export async function gunOzeti(env, simdi) {
  const bas = Math.floor(Date.parse(`${gunAnahtari(simdi)}T00:00:00+03:00`) / 1000);
  const kayitlar = [];
  for (let s = 0; ;) { const p = await stokIste(env, "/arsiv-liste", { basla: s, enFazla: 2000 }); if (!p.length) break; kayitlar.push(...p.filter((x) => x.zaman >= bas)); s = p[p.length - 1].sira; if (p.length < 2000) break; }
  const ad = { "venom-mesaj": "mesaj onaylandı", "venom-gitti": "mesaj gitti", "venom-engel": "güvenlik süzgecinde durdu", "venom-hatirlat": "hatırlatma", "venom-mutabakat": "mutabakat gönderildi", "venom-sil": "model kaldırıldı", "venom-pelin": "Pelin üretimi", mutabik: "Fuat mutabık", uyusmuyor: "Fuat uyuşmuyor", gonderim: "mutabakat Fuat'a", "odeme-vegawin": "ödeme kaydı" };
  const say = {};
  for (const k of kayitlar) if (ad[k.tur]) say[ad[k.tur]] = (say[ad[k.tur]] || 0) + 1;
  const satir = Object.entries(say).map(([k, n]) => `• ${k}: ${n}`);
  const pelinBugun = Number((await env.KAYIT.get(`pelin-gun:${gunAnahtari(simdi)}`)) || 0);
  const venomAy = await venomHarcanan(env, simdi);
  const bekleyen = await bekleyenlerMetni(env, simdi);
  const metin = [`🌙 Günün özeti — ${tarihSaat(simdi).slice(0, 10)}`, ...(satir.length ? satir : ["• Bugün Venom üzerinden iş yapılmadı."]), `💵 Harcama: Pelin bugün ${pelinBugun.toFixed(2).replace(".", ",")} $ · Venom bu ay ${venomAy.toFixed(2).replace(".", ",")} $ / ${await venomSinir(env)} $`, await sorunRaporu(env, simdi).catch(() => null), await videoRaporu(env, simdi), bekleyen, "İyi akşamlar Patron."].filter(Boolean).join("\n");
  const g = await oku(env, "venom:bot:gunluk", []);
  await kaydet(env, "venom:bot:gunluk", [...g.filter((x) => x.gun !== gunAnahtari(simdi)), { gun: gunAnahtari(simdi), ozet: [satir.join("; ") || "Venom'la iş yok", `Pelin ${pelinBugun.toFixed(2)} $`].join(" · ").slice(0, 300) }].slice(-30));
  return metin;
}

async function webhookKur(env) {
  if (!env.SELF_URL || !env.BOT_TOKEN) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  const GUNCELLEMELER = ["message", "callback_query", "channel_post", "edited_channel_post"];
  if (b.ok && b.result.url === hedef && GUNCELLEMELER.every((g) => (b.result.allowed_updates || []).includes(g))) return;
  await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 2 });
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
      try { await guncelleme(await istek.json(), env); } catch (e) { await hataYaz(env, "guncelleme", e); }
      return new Response("ok");
    }
    const mm = url.pathname.match(/^\/medya\/([0-9a-f]{32})$/);
    if (istek.method === "GET" && mm) { const r = await env.KAYIT.getWithMetadata(`venommedya:${mm[1]}`, "arrayBuffer"); return r && r.value ? new Response(r.value, { headers: { "content-type": (r.metadata && r.metadata.tur) || "image/jpeg" } }) : new Response("yok", { status: 404 }); }
    return new Response("Venom çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    try { await venomCron(env, Math.floor(Date.now() / 1000)); } catch (e) { await hataYaz(env, "cron", e); }
  },
};
