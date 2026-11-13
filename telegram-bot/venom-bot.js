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
import { calistirSatiri } from "./kemal-satir.js";
import { BEKCI_SAATLERI, kemalBak, selinBak, samiBak, patronSatiri, eksikYazi, bekciMetni } from "./is-bekcisi.js";
import { mesaiMi } from "./kart-tekrar.js";
import { magazaOzetMetni, celalListeMetni } from "./stok-ozet.js";
import { MOD_SATIR, modOku, modBasla, modBitir } from "./deneme-modu.js";
import { kanitKaydet } from "./tg-guvenli.js";
import { claudeIstemci, claudeVar, claudeTur, openaiFetch, openaiVar } from "./ai-istemci.js";
import { stokIste } from "./stokbot.js";
import { bakiyeOku, mutabakatIcerigi, arsiv, fuatSuzgec, tarihSaat } from "./mutabakat.js";
import { ciroBolumu } from "./ciro.js";
import { silKuyrugu, STOK_KURALI } from "./sil.js";
import { topluRaporMetni } from "./venom.js";
import { KISILER, kuyrugaEkle, kuyruguAl, hataEkle } from "./venom-kopru.js";
import { siteVerisi } from "./depo-oku.js";
import { renkCevir } from "./duzen.js";
import { renkBilinir, renkDilleri } from "./site-renk.js";
import { BOT_YETENEKLERI, MARKA_KARARLARI, VENOM_CEKIRDEK } from "./kurallar.js";
import { kitapOku, derslerOku, botSiniri } from "./kitap.js";
import { modelDurumu, silmeKaniti, silmeMetni, cevapsizKartlar, gunVerisi, gunVerisiMetni, enCokSatan, defterMetni as tekDefterMetni, zamanYaz as zamanKisa } from "./venom-veri.js"; // 12 Kasım: tek gerçek kaynak
import { silOnayli, silOnayliYaz, magazaStoklari } from "./sil.js";
import { ekipSuzgec } from "./venom-yonetim.js";
import { kisaYaz, isKaydet, isCevap, isHatirlat, bitmeyenIsler, hataAlarmi, hataSayilari, geriAlBul, satisUyarisi, stokBitiyor, paylasilmayanlar, paraOzeti, hatirlaticiEkle, vadesiGelenler, yedekAl, gunA } from "./venom-yonetim.js";
import { durYaz, durDurumu, _durOnbellekSifirla } from "./durdurma.js";
import { IZINLER, postaKarar, gonderildiKaydet, biriktir, siraya, kartSiraMesaji, birikimSatiri, ozetKisalt, kuralCoz, kuralEkle, kuralSil, kurallariOku, kuralYazi, POSTA_TAVAN, PERSONEL_KARTI, kategori as postaKategori } from "./venom-posta.js";
import { kopruSustu, haftaIci } from "./magaza-saat.js";
import { kodlariBul, modelSorusuMu, fotoSorusuMu, kartSatirlari, kartDugmeleri, stokBitti } from "./venom-model.js";
import { markaKesin } from "./yayin-kontrol.js";
import { siparisTaslagi } from "./repete-rapor.js";
import { acikRepete, engelMetni } from "./repete-kart.js"; // 11 Kasım: repete kartı + kural 43
import { defterOku, defterSatirYazi, fabrikaGidenMetni, repeteDurumMetni, repeteKayitlari } from "./tek-defter.js"; // 11 Kasım: TEK DEFTER
import { gunlukSatis, gunlukSatisMetni, raporSatisSatiri } from "./gunluk-satis.js"; // 11 Kasım: günlük adet + ciro
import { fabrikayaGidenler } from "./fabrika.js";
import { yeniAkisAcik } from "./fabrika.js"; // 11 Kasım: yeni akış gerçek akışa bağlıysa repete SADECE kartla (eski düz yazı yolu kapalı)
import { kanitGecmisi, kanitMetni, kanitTarih, MAGAZA_BASLIK } from "./fabrika.js";
import { kisiSorusu, kisiCevabi, botOzeti, kartListe } from "./venom-defter.js";
import { donemAraligi, soruParcalari, raporMetni, kodSayili, usd } from "./venom-rapor.js";
import { seriBul } from "./manken.js";
import { botSorusu, botCevabi, herkesCevabi, canliSatirlar, takilanlar, hedefSatiri, BOTLAR as DEFTER_BOTLAR, kisiAdi as defterKisi } from "./venom-defter.js";
import { defterYaz } from "./is-defteri.js";
import { cevapsizSatiri } from "./kart-tekrar.js";
import { listeyeEkle, listeyiTemizle, hemraListesiGonder, hemraKararAdimi, hemraSatirlari, kisiId, markaSorumlusu, LISTE_SAATLERI } from "./venom-ekip.js";
import { cozumDevret } from "./venom-gorev.js";
import { gorevAc, gorevAdimi, cozumAdimi, yapilmayanSatiri, patronKarari, haftaSayilari, sayac as mudurSayac, sonSaat } from "./venom-gorev.js";
import { uretimMaliyeti, buAyHarcanan, AYLIK_SINIR_USD, para, boyOku, boyYazi, aracSec } from "./pelin.js";
import { celalKoduMu } from "./stok.js"; // 12 Kasım: Celal'in modelleri (3000, 3002, Patron'un listesi)
export { KISILER };

const SAAT_FARKI = 3 * 3600;
const MODEL = "claude-opus-5-5"; // 12 Kasım (Patron): Patron'un her mesajı Opus'a gider
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

// 9 Kasım (Patron, sert müdür A): Patron'a giden HER gönderim izin etiketi taşır (govde.izin ya da env.__izin = Patron'la sohbet).
// Etiketsiz gönderim KOD DÜZEYİNDE engellenir → Venom'un çözüm kuyruğu (venom:cozum). Etiket Telegram'a gitmez (gizli).
const PATRONA_GONDERIM = /^(send(?!ChatAction)\w+|copyMessages?|forwardMessages?)$/;
async function izinKapisi(env, metod, chatId, izin, ozet) {
  if (!patronMu(env, chatId) || !PATRONA_GONDERIM.test(metod)) return true;
  const gun = gunAnahtari(Math.floor(Date.now() / 1000));
  if (IZINLER.includes(izin)) {
    const k = `venom:izin:log:${gun}`;
    const l = await oku(env, k, []).catch(() => []);
    await kaydet(env, k, [...l, { zaman: Math.floor(Date.now() / 1000), izin, metod, ozet: String(ozet || "").slice(0, 100) }].slice(-300), 8 * 86400).catch(() => null);
    return true;
  }
  if (env.IZIN_KAPISI === "0") return true; // sadece eski testler
  await cozumeEkle(env, { kaynak: "venom", metin: String(ozet || `(${metod})`), sebep: "izin nedeni yok — Patron'a gönderilmedi" }, Math.floor(Date.now() / 1000)).catch(() => null);
  return false;
}
export const etiketTemizle = (t) => String(t).replace(/<\/?(b|i|u|s|em|strong|code|pre|del|ins|tg-spoiler|blockquote|span)(\s[^>]*)?>/gi, "").replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)").replace(/\*\*(.+?)\*\*/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// 11 Kasım (Patron): iç kod adı (araç adı: kanal_paylasim_duzelt, bota_yaz …, yarım kesilmişi dahil) Patron'a HİÇ gösterilmez
export const kodAdiTemizle = (t) => String(t).replace(/(?<![@/\w.])[a-z]+(?:_[a-z]*)+(?!\w)/g, (m) => (ARACLAR.some((a) => a.name.startsWith(m.replace(/_+$/, ""))) ? "" : m)).replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1");
export async function tg(env, metod, govde) {
  if (govde && typeof govde === "object" && !(govde instanceof FormData)) {
    const { izin, ...temiz } = govde;
    // 11 Kasım (Patron): biçimsiz mesajda <b>, <i> gibi kod etiketi görünmez (botlardan gelen HTML yazı temizlenir)
    if (!temiz.parse_mode) { if (typeof temiz.text === "string") temiz.text = kodAdiTemizle(etiketTemizle(temiz.text)); if (typeof temiz.caption === "string") temiz.caption = kodAdiTemizle(etiketTemizle(temiz.caption)); }
    if (!(await izinKapisi(env, metod, temiz.chat_id, izin || env.__izin, temiz.text || temiz.caption || (temiz.media && temiz.media[0] && temiz.media[0].caption) || `(${metod})`))) return { ok: false, engellendi: true, description: "izin nedeni yok (Patron'a gönderilmedi)" };
    govde = temiz;
  }
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({ ok: false }));
  // 10 Kasım (kanıtsız tamam yok): 🧪 DENEME kartı Patron'a gidince Telegram'ın döndürdüğü hali "venom:kanit"e (zincir testi son halkası)
  if (j && j.ok && govde && typeof govde === "object" && !(govde instanceof FormData) && govde.reply_markup) await kanitKaydet(env, "venom", metod, govde, j).catch(() => null);
  return j;
}
// 9 Kasım: Patron'a giden her mesaj kayıtlı (sayım + "bunu bana gönderme" için). ek.posta = { tur, kaynak } (varsayılan: cevap)
const TUR_IZIN = { cevap: "cevap", kritik: "kritik", ozet: "rapor", rapor: "rapor" };
// 12 Kasım (Patron): liste yarıda KESİLMEZ — uzun yazı satır sınırından bölünür, parça parça gider (düğmeler son parçada)
export function mesajParcalari(text, sinir = 3800) {
  const p = [], satirlar = String(text).split("\n");
  let b = "";
  for (const s of satirlar) {
    if ((b + "\n" + s).length > sinir && b) { p.push(b); b = ""; }
    let kalan = s;
    while (kalan.length > sinir) { p.push(kalan.slice(0, sinir)); kalan = kalan.slice(sinir); }
    b = b ? `${b}\n${kalan}` : kalan;
  }
  if (b) p.push(b);
  return p.length ? p : [""];
}
async function yaz(env, text, ek = {}) {
  if (env.__kuru) { (env.__kuruYazi = env.__kuruYazi || []).push({ text: String(text), dugmeler: ek && ek.reply_markup && ek.reply_markup.inline_keyboard ? ek.reply_markup.inline_keyboard.map((r) => r.map((b) => b.text)) : null }); return { ok: true, result: { message_id: 0 } }; } // deneme: Patron'a GİTMEZ, kayda alınır
  const parcalar = mesajParcalari(text);
  if (parcalar.length > 1) { let son = null; for (const [i, pr] of parcalar.entries()) son = await yazTek(env, pr, i === parcalar.length - 1 ? ek : { ...ek, reply_markup: undefined }); return son; }
  return yazTek(env, text, ek);
}
async function yazTek(env, text, ek = {}) {
  const { posta, ...geri } = ek || {};
  const izin = (posta && (posta.izin || TUR_IZIN[posta.tur])) || env.__izin || null; // etiketsiz → kapıda durur
  const r = await tg(env, "sendMessage", { chat_id: patron(env), text: String(text).slice(0, 4000), disable_web_page_preview: true, ...geri, izin });
  if (r && r.ok) await gonderildiKaydet(env, { kaynak: (posta && posta.kaynak) || "venom", tur: (posta && posta.tur) || "cevap", metin: text, id: r.result && r.result.message_id, izin }, Math.floor(Date.now() / 1000)).catch(() => null);
  return r;
}
// 9 Kasım (Patron): otomatik bildirimler POSTANEDEN geçer — kart/kritik anında, gerisi Venom'da birikir (09:40 / 20:00 özet)
async function bildir(env, metin, { kaynak = "venom", tur = null, kart = false, izin = null, ek = {}, simdi = Math.floor(Date.now() / 1000) } = {}) {
  if (!metin) return null;
  const k = await postaKarar(env, { kaynak, metin, tur, kart, izin }, simdi);
  if (k.karar === "biriktir") return biriktir(env, { kaynak, metin, tur: k.tur, kategori: k.kategori, kural: k.kural }, simdi);
  if (k.karar === "cozum") return cozumeEkle(env, { kaynak, metin, sebep: "izin listesinde yok" }, simdi);
  if (k.karar === "sira") return siraya(env, { kaynak, metin, klavye: ek.reply_markup || null, izin: k.izin }, simdi);
  return yaz(env, metin, { ...ek, posta: { kaynak, tur: k.tur, izin: k.izin } });
}
// 9 Kasım (sert müdür D): Patron'a gitmeyen sorunlar Venom'un ÇÖZÜM KUYRUĞUNA (venom-cozum.js işler: görev / bota emir / tek kart)
async function cozumeEkle(env, { kaynak, metin, sebep, klavye = null }, simdi) {
  if (klavye && !(klavye.inline_keyboard || []).length) klavye = null;
  const l = await oku(env, "venom:cozum", []);
  const ozet = String(metin || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 300);
  if (l.some((x) => x.durum === "acik" && x.ozet === ozet)) return null; // aynı sorun tekrar eklenmez
  const kayit = { id: kisaId(), zaman: simdi, kaynak: kaynak || "venom", ozet, metin: String(metin || "").slice(0, 3000), klavye, sebep, durum: "acik", adimlar: [{ zaman: simdi, ne: `geldi: ${sebep}` }] };
  await kaydet(env, "venom:cozum", [...l.filter((x) => x.durum === "acik" || simdi - x.zaman < 7 * 86400), kayit].slice(-200), 14 * 86400);
  const gk = `venom:izin:engel:${gunAnahtari(simdi)}`;
  await env.KAYIT.put(gk, String((Number(await env.KAYIT.get(gk).catch(() => 0)) || 0) + 1), { expirationTtl: 8 * 86400 }).catch(() => null);
  return kayit;
}
const DONEM_ARAC = { bugun: "bugün", dun: "dün", bu_hafta: "bu hafta", gecen_hafta: "geçen hafta", bu_ay: "bu ay" };
const hataYaz = (env, yer, e) => hataEkle(env, `venom:${yer}`, e).catch(() => null);
// 9 Kasım (sert müdür C/D): görev ve çözüm kuyruğunun Venom araçları
const mudurAraclari = (env, simdi) => ({
  biriktir: (metin, kaynak) => biriktir(env, { kaynak: kaynak || "venom", metin, tur: "bilgi" }, simdi),
  patronaKart: (metin, klavye) => bildir(env, metin, { simdi, tur: "kart", izin: "cozulemeyen", ek: { reply_markup: klavye } }),
  patronaYaz: (metin) => yaz({ ...env, __izin: "cevap" }, metin, { posta: { kaynak: "venom", tur: "cevap", izin: "cevap" } }), // 11 Kasım: "Merdan'a söyle" işinin sonucu (tek satır)
  defter: (ozet, kod) => defterYaz(env, { zaman: simdi, bot: "venom", tur: "is", ozet: String(ozet).slice(0, 200), kod: kod || null }),
  botaDugme: async (rid) => { const k = await oku(env, `venom:bot:dugme:${rid}`, null); return k ? botaSor(env, k.bot, "dugme", k.data, rid) : null; },
  listeyeEkle: (x) => listeyeEkle(env, x, simdi), // 9 Kasım (ekip düzeni): çözülemeyen → Hemra'nın toplu listesi
});
// 9 Kasım (ekip düzeni): Hemra'nın seçimini uygula — kartın kendisi seçilen kişiye (bot gönderir), devir, görev, Patron'a sor
const hemraAraclari = (env, simdi) => ({
  kartIlet: (x, kim) => kuyrugaEkle(env, `kartIlet:${x.bot}`, { id: `${x.id}:${kim}`, chat: x.chat, mesaj: x.mesaj, isdId: x.isdId, hedef: kisiId(env, kim), kim: "Hemra", ozet: x.ozet }),
  devret: (x, kim) => cozumDevret(env, x.cid, kim, simdi),
  gorevVer: (x, kim) => kuyrugaEkle(env, "giden", { id: `hg-${x.id}-${kim}`, kime: kim, tur: "mesaj", metin: `📋 Hemra sana verdi: ${x.ozet}\nYapınca bana (Sami'ye) kısaca yazın.` }),
  patronaSor: (x, kim) => biriktir(env, { kaynak: "venom", metin: `❓ ${kim} Patron'a soruyor: ${x.ozet}`, tur: "bilgi" }, simdi),
  biriktir: (m) => biriktir(env, { kaynak: "venom", metin: m, tur: "bilgi" }, simdi),
});
// 9 Kasım (ONAY MERDİVENİ): akşam 20:00 — tekrar gönderildiği hâlde cevapsız kartlar + fabrikanın 2 iş günü cevap vermediği siparişler
async function merdivenSatirlari(env, simdi) {
  const ad = {};
  for (const [k, a] of [["HEMRA_ID", "Hemra"], ["FABRIKA_SORUMLU", "Hemra"], ["BR_SORUMLU", "Merdan"], ["AZIZ_ID", "Aziz"]]) for (const x of String(env[k] || "").split(",").map((y) => y.trim()).filter(Boolean)) ad[x] = a;
  const bekleyen = env.STOK ? await stokIste(env, "/isd-bekleyen", { enEski: simdi - 3 * 86400 }).catch(() => []) : [];
  const satir = [cevapsizSatiri(Array.isArray(bekleyen) ? bekleyen : [], ad, simdi)];
  const ekibe = await oku(env, "fabrika:ekibe", []);
  if (ekibe.length && env.STOK) {
    const veri = await stokIste(env, "/repete-veri", {}).catch(() => null);
    const acik = ((veri && veri.fs) || []).filter((f) => f.durum === "bekliyor");
    const hala = ekibe.filter((e) => acik.some((f) => String(f.kod) === String(e.kod) && Number(f.gonderim) === Number(e.gonderim)));
    const gy = (t) => { const x = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${x.slice(8, 10)}.${x.slice(5, 7)}`; };
    if (hala.length) satir.push(`🏭 Fabrika cevap vermedi (Merdan ve Hemra'ya bildirildi): ${hala.slice(0, 10).map((e) => `${e.kod} (${gy(e.gonderim)})`).join(", ")}${hala.length > 10 ? " …" : ""}`);
  }
  // 10 Kasım (Patron): "Eksik listesi: X model, Aziz/Merdan kontrol etti, Hemra onayladı, fabrikaya gitti."
  if (env.STOK) {
    const oku9 = async (k) => { const v = (await stokIste(env, "/ayar-oku", { k }).catch(() => ({}))).v; try { return v ? JSON.parse(v) : null; } catch { return null; } };
    for (const k of ((await oku9(`fabrika:birlesik:${gunAnahtari(simdi)}`)) || []).filter((x) => !/-D-/.test(x))) {
      const b = await oku9(`fabrika:${k}`);
      if (!b) continue;
      const kodlar = new Set((b.liste || []).map((x) => x.kod));
      const durum = b.asama === "gonderildi" ? `Hemra onayladı (${b.onaylayan || "Hemra"}), fabrikaya gitti` : b.asama === "onayda" ? "Hemra'nın onayında bekliyor" : b.asama;
      satir.push(`📦 Eksik listesi: ${kodlar.size} model, ${(b.kontrol || []).join(", ").replace(/VOLONTE: |Black Rose: /g, "")}, ${durum}.${(b.kontrolsuz || []).length ? ` Kontrol edilmeyen: ${b.kontrolsuz.length}.` : ""}`);
    }
  }
  return satir.filter(Boolean);
}
// Bir kez (Claude Code): şu an bekleyen kartlar yeni kurala — eski yazılı hatırlatma sayılmaz (kart bir kez yeniden gider);
// Patron'daki "Fuat'a hatırlatma" taslağı kapanır (fabrika hatırlatması artık kendiliğinden, Patron onayı istemeden)
async function merdivenGoc(env, simdi) {
  const bekleyen = env.STOK ? await stokIste(env, "/isd-bekleyen", { enEski: simdi - 3 * 86400 }).catch(() => []) : [];
  const ekip = new Set(["HEMRA_ID", "FABRIKA_SORUMLU", "BR_SORUMLU"].flatMap((k) => String(env[k] || "").split(",").map((y) => y.trim()).filter(Boolean)));
  const idler = (Array.isArray(bekleyen) ? bekleyen : []).filter((r) => ekip.has(String(r.kime)) && Number(r.hatirlatildi)).map((r) => r.id);
  if (idler.length) await stokIste(env, "/isd-isaretle", { idler, alan: "hatirlatildi", deger: 0 }).catch(() => null);
  const t = await oku(env, "venom:merdivenTaslak", null);
  let iptal = 0;
  if (t && t.isId) {
    const is = await oku(env, `venom:bot:is:${t.isId}`, null);
    if (is && is.durum === "bekliyor") { is.durum = "iptal"; await kaydet(env, `venom:bot:is:${t.isId}`, is, 7 * 86400); iptal = 1; }
    if (t.mesaj) await tg(env, "editMessageText", { chat_id: patron(env), message_id: t.mesaj, text: "⏩ Fuat hatırlatması artık otomatik: kart fabrikaya kendiliğinden bir kez yeniden gidiyor, hâlâ cevap yoksa Merdan ve Hemra'ya. Onayınız gerekmiyor." }).catch(() => null);
  }
  return { sifirlanan: idler.length, taslakIptal: iptal };
}
// 9 Kasım (ekip düzeni, bir kez): Hemra'da bekleyen kartlar dağıtılır — Black Rose → Merdan, VOLONTE stok → Aziz,
// görevlerin VOLONTE modelleri → Aziz'e yeni görev; kalan → Hemra'nın toplu listesi. Kartların kopyası Merdan'da da varsa Hemra'nınki kapanır.
export async function hemraDagit(env, simdi) {
  const hemra = new Set(["HEMRA_ID", "FABRIKA_SORUMLU"].flatMap((k) => String(env[k] || "").split(",").map((x) => x.trim()).filter(Boolean)));
  const me = kisiId(env, "merdan"), az = kisiId(env, "aziz");
  const bek = await stokIste(env, "/isd-bekleyen", { enEski: simdi - 5 * 86400 }).catch(() => []);
  const l = Array.isArray(bek) ? bek : [];
  const d = await oku(env, "venom:siteDefteri", null);
  const marka = async (kod) => (kod && d && d.modeller && d.modeller[kod] && d.modeller[kod].marka) || (kod ? (await markaKesin(env, String(kod)).catch(() => ({}))).marka : null) || null;
  const say = { merdan: 0, aziz: 0, liste: 0, gorev: 0 };
  const kapat = [];
  for (const r of l.filter((x) => hemra.has(String(x.kime)))) {
    if (/\|vg:/.test(String(r.cb || ""))) { kapat.push(r.id); continue; } // görev kartları aşağıda modele göre
    const m = await marka(r.kod);
    const merdandaVar = l.some((y) => String(y.kime) === me && y.cb && y.cb === r.cb);
    if (m === "BLACKROSE") { if (!merdandaVar) await kuyrugaEkle(env, `kartIlet:${r.bot}`, { id: `hd-${r.id}`, chat: r.chat, mesaj: r.mesaj, isdId: null, hedef: me, kim: "Hemra (dağıtım)", ozet: r.ozet }); kapat.push(r.id); say.merdan++; continue; }
    if (m === "VOLONTE" && /\|sz:/.test(String(r.cb || "")) && az) { await kuyrugaEkle(env, `kartIlet:${r.bot}`, { id: `hd-${r.id}`, chat: r.chat, mesaj: r.mesaj, isdId: null, hedef: az, kim: "Hemra (dağıtım)", ozet: r.ozet }); kapat.push(r.id); say.aziz++; continue; }
    if (await listeyeEkle(env, { tur: "kart", ref: `isd:${r.id}`, isdId: r.id, bot: r.bot, chat: r.chat, mesaj: r.mesaj, kod: r.kod, ozet: `${r.kod || "kart"} (${r.bot}): ${String(r.ozet || "").slice(0, 80)}` }, simdi)) say.liste++;
  }
  if (kapat.length) await stokIste(env, "/isd-isaretle", { idler: kapat, alan: "durum", deger: "devredildi" }).catch(() => null);
  // Görevler: cevapsız VOLONTE modelleri → Aziz'e yeni görev; görev Black Rose'ta Merdan'la sürer
  const gl = await oku(env, "venom:gorevler", []);
  for (const g of gl.filter((x) => ["acik", "yapilmadi"].includes(x.durum))) {
    const vol = [];
    for (const k of g.kalemler.filter((x) => !x.secim)) if ((await marka(k.kod)) === "VOLONTE") vol.push(k);
    if (vol.length && az) { await gorevAc(env, { baslik: `${g.baslik} — VOLONTE (Aziz)`, metin: `${vol.length} VOLONTE modeli (${vol.slice(0, 3).map((k) => k.kod).join(", ")}${vol.length > 3 ? "…" : ""}): ${String(g.metin).split(". ").slice(1).join(". ") || "düğmeden seçin."}`, kalip: g.kalip, kalemler: vol, son: g.son, kaynak: g.kaynak, kimler: ["aziz"] }, simdi); for (const k of vol) { k.secim = "z"; k.kim = "Aziz'e verildi"; } say.gorev++; }
    g.kimler = ["merdan"];
  }
  await kaydet(env, "venom:gorevler", gl, 30 * 86400);
  return say;
}
// 9 Kasım (sert müdür E): İLK UYGULAMALAR — KV "venom:ilkGorevler" (Claude Code bir kez koyar). Görevler Merdan + Hemra'ya (Sami'den).
const MERDAN_VIDEO = ["907", "3396", "3582", "3618"]; // Patron'un listesi (9 Kasım)
export async function ilkGorevler(env, simdi) {
  const son = sonSaat(simdi, 18);
  const ne = gunAnahtari(son) === gunAnahtari(simdi) ? "Bugün" : "Yarın";
  const ilk = (l) => `${l.slice(0, 3).join(", ")}${l.length > 3 ? "…" : ""}`;
  const sonuc = [];
  const se = (await botaSor(env, "selin", "ozet")) || {};
  const tak = se.takilan || [];
  if (tak.length) { await gorevAc(env, { baslik: `Selin: ${tak.length} modelin fotoğrafı gönderilemedi`, metin: `Selin'de ${tak.length} modelin fotoğrafı yok (${ilk(tak.map((x) => x.kod))}). ${ne} 18:00'e kadar çekilebilenleri gönderin, kalanların sebebini düğmeden seçin.`, kalip: "foto", kalemler: tak.map((x) => ({ kod: x.kod, not: x.sebep })), son, kaynak: "selin" }, simdi); sonuc.push(`Selin gönderilemeyen: ${tak.length}`); }
  const fb = (se.fotoBekleyen || []).filter((k) => !tak.some((x) => x.kod === k));
  if (fb.length) { await gorevAc(env, { baslik: `Fotoğrafı olmayan ${fb.length} stok modeli`, metin: `Stokta olup fotoğrafı olmayan ${fb.length} model var (${ilk(fb)}). ${ne} 18:00'e kadar çekilebilenleri gönderin, kalanların sebebini düğmeden seçin.`, kalip: "foto", kalemler: fb.map((kod) => ({ kod })), son, kaynak: "selin" }, simdi); sonuc.push(`fotoğrafsız stok: ${fb.length}`); }
  const d = await oku(env, "venom:siteDefteri", null);
  const vb = [...new Set([...MERDAN_VIDEO, ...Object.values((d && d.modeller) || {}).filter((m) => m.videoBekleniyor && !m.gizli).map((m) => String(m.kod))])];
  await gorevAc(env, { baslik: `Merdan'dan ${vb.length} model videosu bekleniyor`, metin: `${vb.length} modelin videosu bekleniyor (${ilk(vb)}). Merdan, ${ne.toLocaleLowerCase("tr")} 18:00'e kadar çekebildiklerini gönder; kalanların sebebini düğmeden seç. Hemra, sende olan varsa sen de seçebilirsin.`, kalip: "video", kalemler: vb.map((kod) => ({ kod })), son, kaynak: "merdan" }, simdi);
  sonuc.push(`video: ${vb.length}`);
  // Fabrikanın cevap vermediği siparişler: Sami takip eder; Fuat'a TEK hatırlatma taslağı Patron onayına (izin: fabrika)
  const veri = env.STOK ? await stokIste(env, "/repete-veri", {}).catch(() => null) : null;
  const cevapsiz = ((veri && veri.fs) || []).filter((f) => f.durum === "bekliyor" && simdi - (f.gonderim || simdi) > 86400);
  if (cevapsiz.length) {
    const gy = (t) => { const x = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${x.slice(8, 10)}.${x.slice(5, 7)}`; };
    const metin = `Fuat Bey merhaba, şu siparişler için cevabınızı bekliyoruz: ${cevapsiz.slice(0, 12).map((f) => `${f.kod} (${gy(f.gonderim)})`).join(", ")}. Hangisi ne zaman hazır olur?`;
    await aracCalistir({ ...env, __sohbette: false }, "mesaj_taslagi", { kime: "fuat", metin }, simdi).catch(() => null);
    sonuc.push(`fabrika cevapsız: ${cevapsiz.length} (Fuat'a tek taslak Patron onayına)`);
  }
  return sonuc;
}
// 9 Kasım (sert müdür B): bota verilen emir kontrol edilir (iş defteri). Yapılmadıysa bir kez tekrar; olmazsa Claude Code notu.
// Kanala paylaşma / silme / üretim emirleri kendiliğinden TEKRARLANMAZ (çift paylaşım olmasın) — sadece not.
const TEKRARLANMAZ = /payla|sil\b|silin|kaldır|üret|uret|video/i;
async function emirKaydet(env, bot, metin, simdi) {
  const l = await oku(env, "venom:emirler", []);
  const kod = (String(metin).match(/\b\d{3,6}\b/) || [null])[0];
  await kaydet(env, "venom:emirler", [...l.filter((x) => x.durum === "bekliyor" || simdi - x.zaman < 3 * 86400), { id: kisaId(), bot, metin: String(metin).slice(0, 400), kod, zaman: simdi, ilk: simdi, deneme: 1, durum: "bekliyor" }].slice(-60), 7 * 86400);
}
export async function emirAdimi(env, simdi) {
  const l = await oku(env, "venom:emirler", []);
  const bekleyen = l.filter((x) => x.durum === "bekliyor" && simdi - x.zaman >= 10 * 60);
  if (!bekleyen.length) return 0;
  const kayit = env.STOK ? await stokIste(env, "/isd-oku", { basla: Math.min(...bekleyen.map((x) => x.zaman)), bitis: simdi }).catch(() => []) : [];
  const satirlar = Array.isArray(kayit) ? kayit : [];
  for (const e of bekleyen) {
    const bunun = satirlar.filter((r) => r.bot === e.bot && r.zaman >= e.zaman && !r.deneme);
    const iz = bunun.filter((r) => r.tur !== "hata" && (!e.kod || String(r.kod || "").includes(e.kod) || String(r.ozet || "").includes(e.kod)));
    if (iz.length && !bunun.some((r) => r.tur === "hata")) {
      e.durum = "yapildi"; e.sonuc = String(iz.at(-1).ozet || "").slice(0, 160);
      await biriktir(env, { kaynak: "venom", metin: `✅ ${BOT_AD[e.bot] || e.bot}'e verdiğim iş yapıldı: "${e.metin.slice(0, 80)}" → ${e.sonuc}`, tur: "bilgi" }, simdi);
      await mudurSayac(env, "kendi", simdi);
    } else if (e.deneme < 2 && !TEKRARLANMAZ.test(e.metin)) {
      e.deneme += 1; e.zaman = simdi;
      await botaSor(env, e.bot, "mesaj", e.metin);
    } else {
      e.durum = "olmadi";
      await yetenekNotu(env, `Venom emri yapılmadı (${e.deneme} deneme, iş defterinde iz yok): ${e.bot} ← "${e.metin}"`, simdi);
      await yaz(env, `⚠️ ${BOT_AD[e.bot] || e.bot} yapamadı: "${e.metin.slice(0, 80)}" (${e.deneme} deneme, iş defterinde iz yok). Claude Code'a not ettim.`, { posta: { izin: "cevap" } }); // 10 Kasım: Patron'a açıkça
    }
  }
  await kaydet(env, "venom:emirler", l, 7 * 86400);
  return bekleyen.length;
}

// ---------- Araçlar ----------
const ARACLAR = [
  { name: "bot_raporu", description: "Bir botun TAM raporu (dönem + bütün kaynaklar): iş defteri + Kemal kanal kaydı / Selin site defteri / Sami fabrika + Vegawin / Pelin üretim arşivi, harcama, bekleyen, Higgsfield-fal bakiyesi / Nora senaryoları. Bot hakkında HER soruda önce bunu kullan; sorunun her parçasını (dönem, para, bakiye, bekleyen) ayrı satırla cevapla. 'Bilmiyorum' sadece hiçbir kaynakta yoksa.", input_schema: { type: "object", additionalProperties: false, required: ["bot"], properties: { bot: { type: "string", enum: ["kemal", "selin", "pelin", "nora", "sami"] }, donem: { type: "string", enum: ["bugun", "dun", "bu_hafta", "gecen_hafta", "bu_ay"] } } } },
  { name: "is_defteri", description: "Botların (kemal, selin, pelin, nora, sami) iş defteri: bugün/dün ne yaptılar, hangi kart kimde bekliyor, hatalar. Botlarla ilgili HER soruda önce buna bak; kayıtta yoksa 'bilmiyorum' de, uydurma. Deneme kayıtları sayılmaz. Kişi sorusu (Hemra, Merdan, Fuat, Sinem, Nuri ne cevap verdi / hangi kartlar) → kisi ver: aldığı kartlar → cevapları → cevapsız. Sayı ile kod listesi uyuşmalı (aynı kod iki kartsa '3189 (2 kart)').", input_schema: { type: "object", additionalProperties: false, properties: { bot: { type: "string", enum: ["kemal", "selin", "pelin", "nora", "sami", "hepsi"] }, gun: { type: "string", enum: ["bugun", "dun"] }, kisi: { type: "string", description: "Hemra, Merdan, Fuat, Sinem, Nuri…" } } } },
  { name: "stok_sorgu", description: "Bir modelin Vegawin stoğu (her mağaza AYRI). Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "bakiye", description: "Black Rose hesaplarının güncel bakiyesi — iki mağaza AYRI (karşılaştırma yok). Onaysız, sadece Patron'a.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "ciro", description: "Yıllık ciro (satış − iade = net) — her mağaza AYRI, toplam yok. Onaysız, sadece Patron'a.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "tek_defter", description: "TEK ORTAK DEFTER: bütün açık / bekleyen işler tek listede (her iş tek satır: ne · kim · marka · durum · kanıt). Kimde ne bekliyor, bir modelin işleri, açık kartlar, görevler, fabrika istekleri, repeteler — HEPSİ için önce buna bak. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string", description: "model kodu (isteğe bağlı)" }, kim: { type: "string", description: "kişi adı: Hemra, Merdan, Aziz, Fuat, Sinem, Nuri, Patron (isteğe bağlı)" }, durum: { type: "string", enum: ["acik", "beklemede", "bitti", "hepsi"] }, sayfa: { type: "integer", description: "uzun listede sayfa no (1'den)" } } } },
  { name: "fabrika_giden", description: "Fabrikaya giden eksik listesi: o gün hangi modeller gitti (VOLONTE ve Black Rose AYRI, Sami'nin kaydından). 'Fabrikaya dün/bugün ne gitti' sorularında SADECE bunu kullan; sonucu aynen yaz.", input_schema: { type: "object", additionalProperties: false, properties: { gun: { type: "string", enum: ["bugun", "dun"] }, tarih: { type: "string", description: "YYYY-AA-GG (isteğe bağlı)" } } } },
  { name: "repete_durum", description: "Bir modelin repetesinin durumu (repete kaydından: adet, kim onayladı, teslim tarihi). 'X'in repetesi ne durumda' sorularında SADECE bunu kullan; sonucu aynen yaz.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "gunluk_satis", description: "Günlük satış: marka marka ADET ve CİRO (Vegawin'den; iki mağaza AYRI, toplanmaz). 'Bugün/dün X kaç adet sattı, kaç dolarlık' sorularında SADECE bunu kullan. Sadece Patron'a. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { gun: { type: "string", enum: ["bugun", "dun"] }, magaza: { type: "string", enum: ["VOLONTE", "BLACKROSE"] } } } },
  { name: "kisiye_soyle", description: "Patron 'Merdan'a / Aziz'e / Hemra'ya söyle / yaz / sor …' dediğinde: iş Sami üzerinden O KİŞİYE düğmeli kartla gider, cevabı takip edilir, sonuç Patron'a tek satır gelir. Onaysız. Pelin'e ya da başka bota GİTMEZ. Fuat/Nuri için KULLANMA (mesaj_taslagi).", input_schema: { type: "object", additionalProperties: false, required: ["kime", "metin"], properties: { kime: { type: "string", enum: ["merdan", "aziz", "hemra"] }, metin: { type: "string", description: "Patron'un söylediği iş, AYNEN — söylediği saat ve gün dahil (ör. '12:00'ye kadar', 'yarın')" } } } },
  { name: "hatirlat", description: "Ekipten birine (merdan, hemra) Sami üzerinden kısa hatırlatma. Küçük iş: onaysız gider. Fuat/Nuri için KULLANMA (onlar için mesaj_taslagi).", input_schema: { type: "object", additionalProperties: false, required: ["kime", "metin"], properties: { kime: { type: "string", enum: ["merdan", "hemra"] }, metin: { type: "string" } } } },
  { name: "mesaj_taslagi", description: "Birine (fuat, nuri, merdan, hemra) Sami adına mesaj: önce TAM METİN Patron'a onay kartıyla gösterilir; onaysız gitmez. Patron'un kendi metni varsa aynen kullan.", input_schema: { type: "object", additionalProperties: false, required: ["kime", "metin"], properties: { kime: { type: "string", enum: ["fuat", "nuri", "merdan", "hemra"] }, metin: { type: "string" } } } },
  { name: "mutabakat_gonder", description: "Fuat'a güncel cuma mutabakatını (bakiye mesajları) tekrar gönderip onayını ister. Önce Patron'a önizleme kartı.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "siteden_kaldir", description: "Bir modeli siteden (Selin) ve VOLONTE kanalından (Kemal) kaldırır. Önce onay kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "pelin_uret", description: "Pelin'e model(ler) için foto + video ürettir (para harcar). test=true ise 5 modellik maliyet testi. Önce maliyet kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kodlar", "test"], properties: { kodlar: { type: "array", items: { type: "string" } }, test: { type: "boolean" } } } },
  { name: "model_boyu", description: "Bir modelin Pelin'de kayıtlı boyunu (mini/diz/midi/bilek/maksi, referans) gösterir. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "kemal_paylas", description: "Patron'un Venom'a son gönderdiği TÜM fotoğraf/videoları (video sesi/müziği aynen) Kemal'e verir: kanal paylaşımı (marka yazısı fotoğraflara, EN/FR alt yazı). Renk ve beden Patron ne yazdıysa o (yoksa model kartı). YAYINLAMAZ: SON YAYIN ONAYI kartı Patron'a gelir; onaydan sonra kanal + site. 'paylaş' isteği HER ZAMAN buraya (Pelin'e değil).", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" }, renk: { type: "string", description: "Patron'un yazdığı renk, Türkçe (beyaz, koyu bordo…)" }, beden: { type: "string", enum: ["kucuk", "buyuk", "ikisi"] }, son_set: { type: "boolean", description: "Patron yeni dosya göndermeden 'en son gönderdiğim set' derse true" } } } },
  { name: "site_defteri", description: "TEK DOĞRU LİSTE (site defteri): sitedeki modellerin kodu, markası (Sami'den), renkleri, fotoğraf/video sayısı, video oynuyor mu, Merdan'dan video bekleniyor mu, eklenme tarihi. Site/marka/video sorularında SADECE buna bak; defterde yoksa tahmin etme. kod verilirse o model.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" }, filtre: { type: "string", enum: ["hepsi", "videosuz", "video_bekleyen", "black_rose", "volonte"] } } } },
  { name: "model_listesi", description: "Sitedeki modellerden liste (kod listesi döner; çok adımlı işte bir sonraki araca ver): videosuz, fotografsiz, paylasilmayan (stokta + 2 haftadır kanalda yok). Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["filtre"], properties: { filtre: { type: "string", enum: ["videosuz", "fotografsiz", "paylasilmayan"] } } } },
  { name: "satis_sorgu", description: "Sami'nin deposundan verilen kodların son N gün satış adetleri + kalan stok (en çok satandan aza). Sadece Patron'a. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kodlar"], properties: { kodlar: { type: "array", items: { type: "string" } }, gun_sayisi: { type: "integer" } } } },
  { name: "geri_al", description: "Kanal paylaşımını kanaldan ve siteden birlikte geri alır — önce Patron'a tek onay kartı. HER ZAMAN hatanın görüldüğü mesaj numaralarına bağlı: Patron link/mesaj no verdiyse mesaj_no ile ver (t.me/…/15000 → 15000). Yoksa kodun EN SON paylaşımı. Sadece yanlış paylaşımı silmek için (site değişmeden) kanal_paylasim_sil kullan.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" }, mesaj_no: { type: "array", items: { type: "integer" } } } } },
  { name: "kanal_paylasim_sil", description: "Patron 'sil' dediğinde (ör. '3512 sil', 'bu paylaşımı sil', 'bugünkü 3512 ve 3629 paylaşımlarını sil', link) Kemal ONAY KARTI İSTEMEDEN hemen siler. mesaj_no verilmezse kodun EN SON paylaşımı silinir. Model siteden kalkmaz (sadece o paylaşım). Sonucu Patron'a tek satır: 'Silindi: …'.", input_schema: { type: "object", additionalProperties: false, required: ["kodlar"], properties: { kodlar: { type: "array", items: { type: "string" } }, mesaj_no: { type: "array", items: { type: "integer" } } } } },
  { name: "kanal_paylasim_duzelt", description: "Kanaldaki paylaşımın YAZISI yanlışsa (eski yazı, fiyat, TEL, marka yok): Kemal aynı fotoğraf/videoyu alır, eskisini siler, doğru yazıyla (EN/FR, fiyatsız, marka imzalı, düğmeli) TEK ALBÜM olarak yeniden paylaşır (09–21, 60 dk aralık). 2 günden eskiyse yazıyı yerinde düzeltir. Patron'a onay kartı YOK; sonuç akşam özetinde.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" }, mesaj_no: { type: "array", items: { type: "integer" } } } } },
  { name: "hatirlatici", description: "Patron'un istediği zamanda hatırlatma (ör. 'yarın 10'da Merdan'a şunu sor'). zaman: İstanbul saatiyle YYYY-MM-DDTHH:MM. kime verilirse zamanı gelince o kişiye mesaj ONAY KARTI açılır.", input_schema: { type: "object", additionalProperties: false, required: ["zaman", "metin"], properties: { zaman: { type: "string" }, metin: { type: "string" }, kime: { type: "string", enum: ["merdan", "hemra", "fuat", "nuri"] } } } },
  { name: "duraklatma", description: "Sağlamlaştırma haftası anahtarları: Venom üzerinden Kemal paylaşımı (kemal_paylas) ve Pelin'in yeni üretimi (pelin_uretim). SADECE Patron açıkça 'aç/kapat' derse.", input_schema: { type: "object", additionalProperties: false, required: ["is", "acik"], properties: { is: { type: "string", enum: ["kemal_paylas", "pelin_uretim"] }, acik: { type: "boolean" } } } },
  { name: "pelin_foto_kaydet", description: "Patron'un Venom'a son gönderdiği FOTOĞRAFLARI dosya olarak Pelin'e iletir ve ürün fotoğrafı olarak kaydeder: '<kod> <renk> ön/arka' (sıra: roller). sadece_bunlar=true → o rengin eski fotoğrafları (ör. site) silinir, üretimde SADECE bunlar kullanılır. yeniden_baslat=true → o kod/renk için bekleyen Pelin kartları iptal edilir ve üretim yeniden başlar (önce anlama/maliyet kartı, sonra ön fotoğraf onayı; onaysız para harcanmaz). Sonuç 'İLETİLDİ' ya da 'İLETİLMEDİ' diye döner; Patron'a aynen söyle.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" }, renk: { type: "string", description: "Türkçe renk (beyaz, siyah, bordo…); bilinmiyorsa boş" }, roller: { type: "array", items: { type: "string", enum: ["on", "arka", "detay"] }, description: "Fotoğrafların gönderiliş sırasıyla rolleri; boşsa 1. ön, 2. arka, sonrası detay" }, etiket: { type: "string", enum: ["manken", "aski"] }, adet: { type: "integer", description: "Sadece SON gönderilen N fotoğraf (Patron 'iki fotoğraf attım' dediyse 2)" }, sadece_bunlar: { type: "boolean" }, yeniden_baslat: { type: "boolean" } } } },
  { name: "bekleyenler", description: "Bütün botlarda Patron onayı bekleyen işleri (Pelin, Kemal SON YAYIN kartları, Selin taslakları, Venom kartları) ve bugünkü Selin listesini tek listede verir. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "kemal_calistir", description: "Patron 'Kemal'i çalıştır', 'Kemal çalışsın', 'kanala model öner', 'paylaşım yap' gibi bir şey yazarsa: Kemal stokta olan ve fotoğrafı olan modellerden EN UZUN SÜREDİR paylaşılmayanları (hiç paylaşılmamışlar önde) bulur, öneri kartlarını Hemra ve Merdan'ın onayına gönderir; onaylananlar 09:00–21:00 arasında en az 60 dk arayla, günde en fazla 12 paylaşılır. Patron süre verirse (ör. '1 aydan beri paylaşılmayanları getir') en_az_gun ver (1 ay = 30, 2 hafta = 14). Aracın verdiği TEK satırı aynen yaz.", input_schema: { type: "object", additionalProperties: false, properties: { en_az_gun: { type: "integer" } } } },
  { name: "eksik_listesi_karti", description: "Patron 'eksik listesi kartını göster' derse: Sami'nin fabrikaya gönderdiği SON eksik listesi kartının AYNISINI (tam yazı + düğmeler; düğmeler sadece görüntü) Patron'a gönderir. gun: 'bugun', 'dun', YYYY-AA-GG ya da boş (son kart). Kart gidince sadece aracın verdiği tek satırı yaz.", input_schema: { type: "object", additionalProperties: false, properties: { gun: { type: "string" } } } },
  { name: "is_kontrolu", description: "Patron 'işler yapıldı mı', 'bugün herkes işini yaptı mı', 'botlar çalıştı mı', 'Kemal bugün kaç paylaştı, yeterli mi', 'iş kontrolü' gibi bir şey sorarsa: Kemal (o saate kadar beklenen paylaşım çıktı mı, çıkmadıysa sebep), Selin (fotoğraf listesi gitti mi, cevap geldi mi) ve Sami (eksik listesi fabrikaya gitti mi) için ŞU ANKİ gerçek durumu tek tek yazar. Sadece okur; kimseye mesaj göndermez. Çıkan metni AYNEN yaz.", input_schema: { type: "object", properties: {} } },
  { name: "magaza_stok_ozeti", description: "Patron 'iki mağazanın stoğunu ver', 'stok özeti', 'mağazalarda ne var' derse: Vegawin'den mağaza mağaza (VOLONTE / Black Rose ayrı) stoktaki model sayısı, toplam adet, bugün biten, bugün gelen. Model kodu SORMA. Sonucu AYNEN yaz (en fazla 8 satır).", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "celal_modelleri", description: "Celal'in Vegawin'deki bütün modelleri (kod + stok). Celal'in satışı / stoğu / modelleri sorulunca ÖNCE bunu çağır; liste TAMDIR — 'başka Celal modeli olabilir', 'bu sayıya girmedi' gibi tahmin cümlesi yazma.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "deneme_modu", description: "Patron 'deneme başlıyor' derse islem=basla, 'deneme bitti' derse islem=bitir. Deneme modunda başlatılan kayıtlar 🧪 işaretlenir, rapora girmez; bitince hepsi sessizce kapanır. Aracın cevabını aynen aktar.", input_schema: { type: "object", additionalProperties: false, required: ["islem"], properties: { islem: { type: "string", enum: ["basla", "bitir"] } } } },
  { name: "karar_kaydet", description: "Patron yeni bir KALICI karar/kural söylediğinde (ör. 'bundan sonra …', 'her zaman …', 'asla …') Venom'un hafızasına yazar; sonraki her konuşmada uygulanır. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["metin"], properties: { metin: { type: "string" } } } },
  { name: "selin_durum", description: "Selin'de bir modelin durumu: neden taslak çıkmadı (fotoğraf gelmedi mi, hata mı, onayda mı, sitede mi), bugünkü listede mi, kaç gündür gelmiyor, stok. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "selin_taslak", description: "Selin'e bir model için site taslağı (başlık + EN/FR/PT açıklama) hazırlatır; fotoğrafı Selin'e gelmiş olmalı. Küçük yapay zekâ maliyeti (~0,05 $): önce onay kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "bota_yaz", description: "Patron'un söylediği işi/cevabı ilgili bota Patron yazmış gibi iletir (yazı). Pelin: fotoğraf/video üretimi ve Nora senaryo; Kemal: kanal paylaşımı ve düzeltme metni; Selin: site; Sami: stok/ekip. Bir bot az önce yazı bekleyen bir soru sorduysa (ör. 'nasıl düzelteyim, yazın') Patron'un cevabını AYNEN o bota ilet. Para harcayan işlerde bot kendi maliyet kartını getirir.", input_schema: { type: "object", additionalProperties: false, required: ["bot", "metin"], properties: { bot: { type: "string", enum: ["pelin", "kemal", "selin", "sami"] }, metin: { type: "string" } } } },
  { name: "kanal_paylasimlari", description: "VOLONTE Telegram kanalındaki son paylaşımlar (Venom kanalda yönetici, sadece okur): zaman, model kodu, medya, yazı ve bulunan sorunlar. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" }, gun: { type: "integer", description: "kaç günlük (varsayılan 1)" } } } },
  { name: "site_kontrol", description: "wearvolonte.com'u okur (değiştirmez): model sayısı, fotoğrafsız/videosuz, yapay zekâ (Pelin) fotoğrafı olanlar, stoğu bitmiş ama sitede görünenler; kod verilirse o modelin ayrıntısı. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" } } } },
  { name: "site_duzelt", description: "Sitede bir düzeltmeyi Selin'e verir (önce Patron onay kartı). yapay_zeka_fotolarini_kaldir SADECE Patron açıkça 'yapay zekâ / Pelin fotoğraflarını kaldır' derse — kendin önerme, başka bir isteği buna çevirme (9 Kasım). İşlemler: yapay zekâ (Pelin) fotoğraflarını kaldır, fotoğrafları yenile (önbellekteki eski görsel), taslağı yeniden hazırla, açıklamadaki renkleri yaz (renkler). Yeni renk Pelin'den siteye eklenince renk satırı kendiliğinden güncellenir; bu araç ilk rengi kaydetmek/düzeltmek için.", input_schema: { type: "object", additionalProperties: false, required: ["kod", "islem"], properties: { kod: { type: "string" }, islem: { type: "string", enum: ["yapay_zeka_fotolarini_kaldir", "fotolari_yenile", "taslak_yeniden", "renkler"] }, renkler: { type: "array", items: { type: "string" }, description: "islem=renkler: modelin sitedeki BÜTÜN renkleri, Türkçe, sırayla (ör. [\"siyah\", \"koyu bordo\"]); açıklamanın sonundaki renk satırı (EN/FR/PT) buna göre yazılır" } } } },
  { name: "kanal_kontrol", description: "Kanaldaki bir modelin (en fazla 5) paylaşım yazılarını kontrol eder: fiyat (gerçek tutar), marka imzası, renk. Sorun varsa SORMADAN Kemal'e yerinde düzelttirir ve sonucu kanıtıyla (link) döndürür.", input_schema: { type: "object", additionalProperties: false, required: ["kodlar"], properties: { kodlar: { type: "array", items: { type: "string" } } } } },
  { name: "model_durumu", description: "Bir model hakkında HER ŞEY tek seferde: marka, mağaza mağaza stok, repete durumu, silme durumu (kanıtıyla: site, kanal mesaj numaraları), son karar, açık kartlar (tarih, kişi), çelişkiler. Model sorulan her mesajda önce bunu çağır.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "cevapsiz_kartlar", description: "Şu an cevap bekleyen kartlar: kişi kişi (Hemra, Merdan, Aziz, Sinem, Fuat, Nuri), en eskiden yeniye, her satırda tarih + saat + model + marka. Eksiksiz; uzunsa sayfalı.", input_schema: { type: "object", additionalProperties: false, properties: { sayfa: { type: "integer" } } } },
  { name: "gun_ozeti", description: "Bir günün kaydı (sabah raporuyla AYNI kaynak): Selin'in siteye EKLEDİĞİ / KALDIRDIĞI / GÜNCELLEDİĞİ modeller (ayrı ayrı, bütün kodlar), Kemal'in kanal paylaşımları (her biri model kodu ve mesaj numarasıyla), fabrikaya giden modeller.", input_schema: { type: "object", additionalProperties: false, properties: { gun: { type: "string", enum: ["bugun", "dun"] }, tarih: { type: "string", description: "YYYY-AA-GG (isteğe bağlı)" } } } },
  { name: "en_cok_satan", description: "Bir günde en çok satan modeller, marka marka (VOLONTE ve Black Rose AYRI), adetleriyle. Sadece Patron'a.", input_schema: { type: "object", additionalProperties: false, properties: { gun: { type: "string", enum: ["bugun", "dun"] }, tarih: { type: "string" }, adet: { type: "integer", description: "kaç model (varsayılan 3)" } } } },
  { name: "patron_kararlari", description: "Patron'un ŞU AN karar vermesi gereken işler (sadece gerçek kararlar: repete, silme, para; kapanmış / karar verilmiş iş yok). Her satırda tarih + model.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "karar_uygula", description: "Patron bir model için KARAR verdiğinde: karar deftere yazılır, o modelin BÜTÜN açık kartları (Hemra, Merdan, Aziz, fabrika, Patron) kapanır, aynı karar bir daha sorulmaz. karar: repete | bekle | sil | kapat.", input_schema: { type: "object", additionalProperties: false, required: ["kod", "karar"], properties: { kod: { type: "string" }, karar: { type: "string", enum: ["repete", "bekle", "sil", "kapat"] }, aciklama: { type: "string" } } } },
  { name: "not_kaydet", description: "Patron bir NOT / bilgi verdiğinde (soru, emir ya da karar değilse) kaydeder. Soruya cevap olarak KULLANMA.", input_schema: { type: "object", additionalProperties: false, required: ["metin"], properties: { metin: { type: "string" } } } },
  { name: "bot_durdur", description: "Bir botun (ya da hepsinin) paylaşım / üretim / yazma işlerini durdurur ya da açar. Sadece Patron açıkça isterse.", input_schema: { type: "object", additionalProperties: false, required: ["bot", "dur"], properties: { bot: { type: "string", enum: ["kemal", "selin", "pelin", "sami", "hepsi"] }, dur: { type: "boolean" } } } },
  { name: "repete_tekrar_ac", description: "Fuat 'yapamam' dediği için beklemede olan repete kartını Fuat'a yeniden gönderir (Sami gönderir).", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "fabrika_kaydi", description: "Bir modelin fabrika kanıt defteri: kim, ne zaman, hangi cevabı verdi (silinemez kayıt).", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "hemra_izinli", description: "Hemra bugün izinliyse koordinasyonu bugünlük Merdan'a verir.", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "sesli_rapor", description: "Sesli raporu açar (ücretli: önce Patron'a maliyet onay kartı) ya da kapatır.", input_schema: { type: "object", additionalProperties: false, required: ["ac"], properties: { ac: { type: "boolean" } } } },
  { name: "bildirim_kurali", description: "Patron bir mesaja YANITLA 'bunu bana gönderme' dediğinde: o tür mesajlar için kalıcı bildirim kuralı kaydeder (yanıtlanan mesaja göre).", input_schema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "yetenek_istegi", description: "Venom'un henüz yapamadığı bir iş için Claude Code'a not bırakır (yeni yetenek isteği).", input_schema: { type: "object", additionalProperties: false, required: ["istek"], properties: { istek: { type: "string" } } } },
];

// Onay kartı: [✅ Onayla] [✏️ Düzelt] [❌ İptal] → (sadece para / silme / fabrika: "Emin misiniz?") → çalıştır
const FABRIKA_KISILERI = ["fuat", "nuri", "sinem", "celal"];
export const eminGerek = (is) => Boolean(is) && (["pelin", "sil", "temizlik", "mutabakat"].includes(is.tur) || (is.tur === "mesaj" && FABRIKA_KISILERI.includes(String(is.kime || "").toLocaleLowerCase("tr"))));
const kartKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `vb:o:${id}` }, { text: "✏️ Düzelt", callback_data: `vb:d:${id}` }, { text: "❌ İptal", callback_data: `vb:x:${id}` }]] });
// 12 Kasım (Patron, C10): bir model için KARAR verildi → depoda o modelin bütün açık kartları kapanır (telefonlarda düğmeler kalkar),
// Venom'un o modele ait açık Patron kartları da kapanır; aynı karar bir daha sorulmaz. uygula: kararı Sami'ye de ilet (yazıyla verilen karar).
export async function kararVerildi(env, kod, karar, simdi, { aciklama = "", uygula = false, haricIs = null } = {}) {
  kod = String(kod);
  const ne = `${karar}${aciklama ? ` — ${String(aciklama).slice(0, 100)}` : ""}`;
  const r = await stokIste(env, "/karar-kapat", { kod, kim: "Patron", ne, zaman: simdi }).catch(() => ({ kapanan: 0 }));
  let n = Number(r && r.kapanan) || 0;
  const listele = async (prefix) => { try { return (await env.KAYIT.list({ prefix })).keys || []; } catch { return []; } };
  for (const k of (await listele("venom:bittiKart:")).slice(-80)) {
    const x = await oku(env, k.name, null);
    if (!x || x.karar || x.deneme || x.mod || String(x.kod) !== kod) continue;
    Object.assign(x, { karar, kararKim: "Patron", kararZaman: simdi, kararDugme: "yazıyla / başka karttan" });
    await kaydet(env, k.name, x, 30 * 86400); n++;
    if (uygula && ["repete", "bekle"].includes(karar)) await kuyrugaEkle(env, "bittiKarar", { id: `${x.sip || k.name.split(":").pop()}:${simdi}`, sip: x.sip || k.name.split(":").slice(2).join(":"), karar, kim: "Patron", dugme: "yazıyla", zaman: simdi }).catch(() => null);
  }
  for (const k of (await listele("venom:bot:is:")).slice(0, 80)) {
    const is = await oku(env, k.name, null);
    if (!is || is.id === haricIs || String(is.kod || "") !== kod || !["bekliyor", "emin"].includes(is.durum)) continue;
    is.durum = "kapandi"; is.kapanis = { zaman: simdi, neden: `karar verildi: ${karar}` };
    await kaydet(env, k.name, is, 3 * 86400); n++;
  }
  if (/^sil/.test(String(karar))) await kuyrugaEkle(env, "fsSilindi", { id: `fss:${kod}:${simdi}`, kod, zaman: simdi }).catch(() => null); // silinen modelin fabrika "bitti" kaydı kapanır (Sami)
  if (uygula && karar === "repete" && !n) { await kuyrugaEkle(env, "rkBaslat", { id: `rb:${kod}:${simdi}`, kodlar: [kod], kim: "Patron", zaman: simdi }); await botaSor(env, "sami", "repeteAdim"); }
  return { kapanan: n };
}
// SÖZ TAKİBİ (12 Kasım, Patron, D14): Venom "sıraya aldım / bitince haber veririm" dediği her işi takip eder. Bitince Patron'a kanıtla
// TEK satır; 1 saatte bitmezse sebebini kendisi araştırır, tek satır sonuç yazar. Kayıt: KV "venom:sozler".
export async function sozEkle(env, soz, simdi) {
  const l = await oku(env, "venom:sozler", []);
  if (l.some((x) => !x.bitti && x.tur === soz.tur && String(x.kod || x.id) === String(soz.kod || soz.id))) return;
  await kaydet(env, "venom:sozler", [...l.filter((x) => !x.bitti || simdi - x.zaman < 3 * 86400), { ...soz, zaman: simdi }].slice(-60), 14 * 86400);
}
async function sozKaydet(env, tur, metin, simdi) {
  for (const s of (tur && tur.sirada) || []) { const kod = (String(s).match(/(?<![\d.,:])\d{3,5}(?![\d:])/) || [null])[0]; if (kod) await sozEkle(env, { tur: "paylas", kod, ne: String(s).slice(0, 120) }, simdi); }
}
export async function sozAdimi(env, simdi) {
  const l = await oku(env, "venom:sozler", []);
  const acik = l.filter((x) => !x.bitti);
  if (!acik.length) return 0;
  const patronaYaz = (m) => yaz({ ...env, __izin: "cevap" }, m, { posta: { kaynak: "venom", tur: "cevap", izin: "cevap" }, disable_web_page_preview: true });
  for (const s of acik) {
    const gec = simdi - s.zaman >= 3600;
    if (s.tur === "sil") {
      const k = await silmeKaniti(env, s.kod);
      const bitti = k.siteYuklendi && !k.sitede && (k.kanal || !k.kanaldaPaylasim) && !k.suruyor;
      if (bitti) {
        await patronaYaz(`✅ ${s.kod} silindi. Site: listede yok. Kanal: ${k.kanal ? `${k.kanal.mesajlar.length} mesaj kaldırıldı ${zamanKisa(k.kanal.zaman)} (mesaj no ${k.kanal.mesajlar.join(", ")})${k.kanal.gizlenen.length ? ` — ${k.kanal.gizlenen.length} eski mesajı Telegram sildirmedi, SOLD OUT görseliyle gizlendi: ${k.kanal.linkler.slice(0, 3).join(" ")}` : ""}` : "paylaşımı yoktu"}.`);
        s.bitti = simdi; await kararVerildi(env, s.kod, "silindi", simdi).catch(() => null);
        // silme kanıtlandı: o modelin BÜTÜN silme kartları kapanır (yarıda "yapılıyor" kalan eski kartlar dahil)
        try { for (const k of ((await env.KAYIT.list({ prefix: "venom:bot:is:" })).keys || []).slice(0, 200)) { const is = await oku(env, k.name, null); if (is && is.tur === "sil" && String(is.kod) === String(s.kod) && ["yapiliyor", "bekliyor", "emin"].includes(is.durum)) { is.durum = "bitti"; is.bitis = simdi; await kaydet(env, k.name, is, 7 * 86400); } } } catch { /* */ }
      } else if (gec && !s.arastirildi) {
        const engel = ((await oku(env, "venom:silEngel", [])) || []).filter((e) => String(e.kod) === String(s.kod) && e.zaman >= s.zaman).pop();
        const d = await durDurumu(env).catch(() => ({}));
        const siteSira = ((await oku(env, "venom:siteSil", [])) || []).some((x) => String(x.kod) === String(s.kod)), kanalSira = ((await oku(env, "venom:kanalSil", [])) || []).some((x) => String(x.kod) === String(s.kod));
        // sebebi Venom kendisi araştırır: hangi adımda, kimde takıldı
        const sebep = engel ? `mağazada stok var (${engel.adet}); stok bitmeden silinmez`
          : k.sitede ? (d.selin || d.hepsi ? "Selin durdurulmuş; site güncellenmedi" : siteSira ? "Selin'in sırasında bekliyor; site henüz güncellenmedi" : "site hâlâ listede, Selin'in sırasında da görünmüyor")
            : d.kemal || d.hepsi ? "siteden kalktı; Kemal durdurulmuş, kanal silinmedi" : kanalSira ? "siteden kalktı; kanal silmesi Kemal'in sırasında bekliyor" : "siteden kalktı; Kemal kanaldaki mesajları siliyor (sürüyor)";
        await patronaYaz(`⚠️ ${s.kod} silmesi 1 saatte bitmedi. Sebep: ${sebep}.${engel ? "" : " Takip ediyorum; bitince yazacağım."}`);
        s.arastirildi = simdi; if (engel) s.bitti = simdi;
      } else if (simdi - s.zaman > 2 * 86400) { s.bitti = simdi; await patronaYaz(`⚠️ ${s.kod} silmesi 2 günde bitmedi; takip kapandı. ${silmeMetni(s.kod, k)}`); }
    } else if (s.tur === "paylas") {
      const kodlar = (await oku(env, "kodlar", {})) || {}, kanal = await oku(env, "kanal", null);
      const g = (kodlar[String(s.kod)] || []).filter((x) => x.tarih >= s.zaman - 60).pop();
      if (g) { await patronaYaz(`✅ ${s.kod} kanala paylaşıldı ${zamanKisa(g.tarih)}: ${kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${g.ids[0]}` : `mesaj ${g.ids[0]}`}`); s.bitti = simdi; }
      else if (gec && !s.arastirildi) {
        const sira = await oku(env, `kuyruk:${s.kod}`, null), d = await durDurumu(env);
        await patronaYaz(`⚠️ ${s.kod} paylaşımı 1 saatte çıkmadı. Sebep: ${d.kemal || d.hepsi ? "Kemal durdurulmuş" : sira ? "Kemal'in sırasında bekliyor (paylaşımlar 09:00–21:00, aralıklı çıkar)" : "Kemal'in sırasında görünmüyor; Kemal'e yeniden soruyorum"}. Çıkınca yazacağım.`);
        s.arastirildi = simdi;
      } else if (simdi - s.zaman > 86400) s.bitti = simdi;
    } else if (s.tur === "mesaj") {
      if (gec && !s.arastirildi) { await patronaYaz(`⚠️ ${s.kime || "kişi"} için onayladığınız mesaj 1 saatte gitmedi: Sami'nin sırasında bekliyor. Takip ediyorum.`); s.arastirildi = simdi; }
      else if (simdi - s.zaman > 86400) s.bitti = simdi;
    }
  }
  await kaydet(env, "venom:sozler", l, 14 * 86400);
  return acik.length;
}
// 13 Kasım (Patron, kural 39 — TEKRAR SORU YASAĞI): Patron'da AYNI kart (aynı tür + aynı yazı) cevap beklerken ikinci kez açılmaz;
// açık olan kart geçerlidir (yenisi gönderilmez).
async function acikAyniPatronKarti(env, is, metin) {
  let keys = [];
  try { keys = (await env.KAYIT.list({ prefix: "venom:bot:is:" })).keys || []; } catch { keys = []; }
  for (const k of keys.slice(-120)) {
    const x = await oku(env, k.name, null);
    if (x && ["bekliyor", "emin"].includes(x.durum) && x.tur === is.tur && String(x.metin || "") === String(metin || "")) return x.id;
  }
  return null;
}
async function kartAc(env, is, metin, simdi) {
  const acik = await acikAyniPatronKarti(env, is, metin);
  if (acik) return acik;
  const id = kisaId();
  await kaydet(env, `venom:bot:is:${id}`, { id, ...is, metin, durum: "bekliyor", zaman: simdi }, 7 * 86400);
  if (is.patronIstedi || env.__sohbette) await yaz(env, metin, { reply_markup: kartKlavye(id), posta: { tur: "cevap" } }); // Patron'un kendi isteğinin kartı: hemen
  else await bildir(env, metin, { simdi, tur: "kart", ek: { reply_markup: kartKlavye(id) } });
  return id;
}

// 13 Kasım (Patron, TEK DEFTER — "iş bitince kayıt kapanır"): onaylanıp çalıştırılan Patron kartı "yapiliyor"da takılı kalmaz.
// Takibi (söz) biten iş "bitti" olur; 24 saatte kapanışı kayda geçmeyen iş "eskidi" diye kapanır (rapor "takılı kart" saymaz).
export async function kartKapanisAdimi(env, simdi) {
  let keys = [];
  try { keys = (await env.KAYIT.list({ prefix: "venom:bot:is:" })).keys || []; } catch { keys = []; }
  const sozler = await oku(env, "venom:sozler", []);
  const kapanan = [];
  for (const k of keys.slice(-200)) {
    const x = await oku(env, k.name, null);
    if (!x || x.durum !== "yapiliyor") continue;
    const z = x.onayZaman || x.zaman || 0;
    const soz = sozler.find((s2) => String(s2.isId || s2.id || "") === String(x.id));
    const takipsiz = !["sil", "mesaj", "mutabakat"].includes(x.tur);
    if (soz && soz.bitti) Object.assign(x, { durum: "bitti", kapandi: simdi, kapanis: "takibi bitti" });
    else if (takipsiz && simdi - z >= 600) Object.assign(x, { durum: "bitti", kapandi: simdi, kapanis: "onaylandı, ilgili bota verildi" });
    else if (simdi - z >= 86400) Object.assign(x, { durum: "eskidi", kapandi: simdi, kapanis: "onaylandı; kapanışı 24 saatte kayda geçmedi" });
    else continue;
    await kaydet(env, k.name, x, 7 * 86400);
    kapanan.push({ id: x.id, tur: x.tur, durum: x.durum });
  }
  return kapanan;
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
  if (ad === "bot_raporu") return botRaporuMetni(env, g.bot, DONEM_ARAC[g.donem] || "bugün", simdi);
  if (ad === "is_defteri") {
    const gun = g.gun === "dun" ? "dün" : "bugün";
    if (g.kisi) return (await kisiCevabiMetni(env, `${g.kisi} ${gun} ne cevap verdi`, simdi)) || `${g.kisi}: kayıtlı kişi değil.`;
    const { satirlar, canlilar } = await defterVerisi(env, simdi, gun);
    return g.bot && g.bot !== "hepsi" ? botCevabi(env, g.bot, satirlar, canlilar[g.bot], { gun }) : herkesCevabi(env, satirlar, canlilar, { gun });
  }
  // 12 Kasım: DENEME modunda (Claude Code'un kabul testi) yazan araçlar ÇALIŞMAZ; ne yapacağı yazılır. Okuyan araçlar gerçek veriyle çalışır.
  const YAZAN = new Set(["deneme_modu", "sesli_rapor", "bildirim_kurali", "hatirlat", "mesaj_taslagi", "mutabakat_gonder", "kemal_paylas", "geri_al", "kanal_paylasim_duzelt", "hatirlatici", "duraklatma", "pelin_foto_kaydet", "karar_kaydet", "site_duzelt", "selin_taslak", "bota_yaz", "yetenek_istegi", "not_kaydet", "bot_durdur", "repete_tekrar_ac", "hemra_izinli"]);
  if (env.__kuru && YAZAN.has(ad)) return `(DENEME: "${ad}" gerçekte çalışırdı; denemede çalıştırılmadı.)`;
  if (ad === "tek_defter") return tekDefterMetni(env, simdi, { kod: String(g.kod || "").replace(/\D/g, "") || null, kim: g.kim || null, durum: g.durum || null, sayfa: g.sayfa || 1, kuru: Boolean(env.__kuru) });
  if (ad === "kanal_kontrol") return kanalKontrolCevabi(env, (g.kodlar || []).map((k) => String(k).replace(/\D/g, "")).filter(Boolean).slice(0, 5), simdi);
  if (ad === "model_durumu") return modelDurumu(env, g.kod, simdi, { kuru: Boolean(env.__kuru) });
  if (ad === "cevapsiz_kartlar") return cevapsizKartlar(env, simdi, { sayfa: g.sayfa || 1, kuru: Boolean(env.__kuru) });
  if (ad === "gun_ozeti") return gunVerisiMetni(await gunVerisi(env, /^\d{4}-\d{2}-\d{2}$/.test(String(g.tarih || "")) ? g.tarih : gunAnahtari(g.gun === "bugun" ? simdi : simdi - 86400)), simdi);
  if (ad === "en_cok_satan") return enCokSatan(env, /^\d{4}-\d{2}-\d{2}$/.test(String(g.tarih || "")) ? g.tarih : gunAnahtari(g.gun === "bugun" ? simdi : simdi - 86400), g.adet || 3);
  if (ad === "patron_kararlari") { const l = await bekleyenKararlar(env, simdi); return l.length ? [`Kararınızı bekleyen ${l.length} iş:`, ...l.map((x) => `${zamanKisa(x.zaman)} · ${x.baslik}`)].join("\n") : "Kararınızı bekleyen iş yok."; }
  if (ad === "karar_uygula") {
    const kod = String(g.kod || "").replace(/\D/g, "");
    if (!kod) return "Model kodu yok.";
    if (g.karar === "sil") return aracCalistir(env, "siteden_kaldir", { kod }, simdi);
    if (g.karar === "repete") { const acik = await acikRepete(env, kod).catch(() => null); if (acik) return engelMetni(acik); }
    if (env.__kuru) return `(DENEME: ${kod} için "${g.karar}" kararı uygulanırdı; bütün açık kartları kapanırdı.)`;
    const r = await kararVerildi(env, kod, g.karar, simdi, { aciklama: g.aciklama, uygula: true });
    return `${kod}: "${g.karar}" kararı kaydedildi (${zamanKisa(simdi)}). Kapanan açık kart: ${r.kapanan}.${g.karar === "repete" ? " Repete kartı Hemra'ya dağılım için gitti (Sami)." : ""}`;
  }
  if (ad === "not_kaydet") { const l = await oku(env, "venom:bot:notlar", []); await kaydet(env, "venom:bot:notlar", [...l, { zaman: simdi, metin: String(g.metin || "").slice(0, 500) }].slice(-100), 90 * 86400); return `Not kaydedildi (${zamanKisa(simdi)}).`; }
  if (ad === "bot_durdur") {
    if (g.bot === "hepsi") await durYaz(env, g.dur ? { hepsi: true, neden: { hepsi: "Patron: hepsini durdur" } } : { hepsi: false, kemal: false, selin: false, pelin: false, sami: false }, simdi);
    else await durYaz(env, { [g.bot]: Boolean(g.dur), neden: { [g.bot]: g.dur ? "Patron durdurdu" : "" } }, simdi);
    return `${g.bot === "hepsi" ? "Bütün botlar" : BOT_AD[g.bot] || g.bot} ${g.dur ? "DURDURULDU" : "AÇILDI"} (${zamanKisa(simdi)}).`;
  }
  if (ad === "sesli_rapor") {
    if (!g.ac) { await env.KAYIT.put("venom:sesliAcik", "0"); return "Sesli rapor kapatıldı."; }
    await tg(env, "sendMessage", { chat_id: patron(env), text: "🔊 Sesli rapor için OpenAI ses servisi gerekir (ÜCRETLİ): rapor başına ≈0,02 $, sabah + akşam ≈1,2 $/ay. Açılsın mı?", reply_markup: { inline_keyboard: [[{ text: "✅ Aç (≈1,2 $/ay)", callback_data: "vs:a" }, { text: "❌ Hayır", callback_data: "vs:x" }]] } });
    turKanit(env).sus = true; return "Maliyet onay kartı Patron'a gösterildi; ayrıca bir şey yazma.";
  }
  if (ad === "bildirim_kurali") { const r = env.__mesaj ? await postaKomut(env, env.__mesaj, "bunu bana gönderme", simdi) : null; if (typeof r === "string" && r) await yaz(env, r); if (r) turKanit(env).sus = true; return r ? "Kural kaydedildi ve Patron'a yazıldı; ayrıca bir şey yazma." : "Kural kaydedilemedi: Patron hangi mesajı kastettiğini o mesaja YANITLAYARAK yazmalı."; }
  if (ad === "repete_tekrar_ac") { const kod = String(g.kod || "").trim().toLocaleUpperCase("tr"); await kuyrugaEkle(env, "rkKarar", { id: `ta:${kod}:${simdi}`, karar: "tekrarAc", kod, kim: "Patron", zaman: simdi }); await botaSor(env, "sami", "repeteAdim"); await rkAdimi(env, simdi).catch(() => null); turKanit(env).sus = true; return `${kod} repete kartı için Sami çalıştı; sonuç (gitti / gitmedi) Patron'a TEK satır olarak yazıldı. Ayrıca bir şey yazma.`; }
  if (ad === "fabrika_kaydi") { const kod = String(g.kod || "").replace(/\D/g, ""); return kanitMetni(kod, await kanitGecmisi(env, kod)); }
  if (ad === "hemra_izinli") { await env.KAYIT.put("venom:hemraIzinli", gunAnahtari(simdi), { expirationTtl: 2 * 86400 }); return "Bugün koordinasyon Merdan'da; listeler ona gider."; }
  if (ad === "fabrika_giden") return fabrikaGidenCevabi(env, simdi, /^\d{4}-\d{2}-\d{2}$/.test(String(g.tarih || "")) ? g.tarih : gunAnahtari(g.gun === "bugun" ? simdi : simdi - 86400));
  if (ad === "repete_durum") return repeteDurumCevabi(env, String(g.kod || "").replace(/\D/g, ""));
  if (ad === "gunluk_satis") return gunlukSatisMetni(await gunlukSatis(env, simdi, gunAnahtari(g.gun === "dun" ? simdi - 86400 : simdi)), simdi, g.magaza || null);
  if (ad === "kisiye_soyle") {
    const s = kisiyeSoyleCoz(`${KISILER[g.kime] ? KISILER[g.kime].e : g.kime} söyle, ${g.metin}`, simdi);
    if (!s) return "Kişi ya da iş anlaşılamadı.";
    if (!soylenenSaat(g.metin) && soylenenSaat(env.__patronMetni)) s.son = isSonSaati(String(env.__patronMetni), simdi); // 12 Kasım: Patron'un söylediği saat AYNEN (araç metni saati düşürse bile)
    return kisiyeSoyleYap(env, s, simdi);
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
    if (g.kime === "fuat" && /repete/i.test(String(g.metin || ""))) { // 11 Kasım KURAL 43
      const kodlar = [...new Set(String(g.metin).match(/\b\d{3,5}\b/g) || [])];
      for (const kod of kodlar) { const acik = await acikRepete(env, kod).catch(() => null); if (acik) return `AÇIK REPETE VAR — taslak HAZIRLANMADI. Patron'a aynen şunu söyle: ${engelMetni(acik)}`; }
      if (kodlar.length && (await yeniAkisAcik(env))) { // eski düz yazı yolu KAPALI: repete kartla istenir (Hemra dağılımı onaylar → Patron kartı → Fuat kartı)
        await kuyrugaEkle(env, "rkBaslat", { id: `rb:${kodlar.join("-")}:${simdi}`, kodlar, kim: "Patron", zaman: simdi });
        const tedR = await stokIste(env, "/tedarikci", { kodlar }).catch(() => ({}));
        const celalR = kodlar.filter((k) => (tedR[k] || {}).tedarikci === "CELAL" || celalKoduMu(k));
        const kimeR = !celalR.length ? "Fuat'a" : celalR.length === kodlar.length ? "Celal'e" : `Celal'e (${celalR.join(", ")}) ve Fuat'a (${kodlar.filter((k) => !celalR.includes(k)).join(", ")})`; // 12 Kasım: modelin gerçek fabrikası
        const bilgi = `🔁 ${kodlar.join(", ")} repete: Hemra'ya dağılım kartı gitti. Hemra dağılımı yazınca kart doğrudan ${kimeR} gider.`; // 12 Kasım (Patron): ikinci onay yok
        if (!env.__llmArac) await yaz(env, bilgi, { posta: { izin: "cevap" } });
        return `Repete artık KARTLA isteniyor (Fuat'a düz yazı gitmez). Yapılan: ${bilgi} Patron'a sadece bunu söyle.`;
      }
    }
    { // 11 Kasım (Patron, ACİL): aynı kişiye aynı mesaj için ikinci kart açılmaz (bekleyen kart ya da 24 saatte gitmiş mesaj)
      const iz = String(g.metin).replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
      for (const x of (await (async () => { try { return (await env.KAYIT.list({ prefix: "venom:bot:is:" })).keys || []; } catch { return []; } })()).slice(0, 80)) {
        const is = await oku(env, x.name, null);
        if (!is || is.tur !== "mesaj" || is.kime !== g.kime || String(is.govde || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr") !== iz) continue;
        if (["bekliyor", "emin"].includes(is.durum)) return `AYNI MESAJIN KARTI ZATEN BEKLİYOR (${tarihSaat(is.zaman).slice(11, 16)}). Yeni kart AÇILMADI. Patron'a: "Bu mesajın onay kartı ${tarihSaat(is.zaman).slice(11, 16)}'de geldi; onu onaylayın." de.`;
        if (is.durum === "yapiliyor" && simdi - (is.onayZaman || is.zaman) < 86400) return `BU MESAJ ${tarihSaat(is.onayZaman || is.zaman).slice(11, 16)}'de ${k.e} ZATEN GİTTİ. Yeni kart AÇILMADI; tekrar gönderilmez. Patron'a aynen bunu söyle.`;
      }
    }
    await kartAc(env, { tur: "mesaj", kime: g.kime, govde: g.metin }, `✉️ ${k.e} gidecek mesaj (Sami adına, birebir):\n\n${g.metin}`, simdi);
    return "Onay kartı Patron'a gösterildi; onaylamadan gitmez.";
  }
  if (ad === "mutabakat_gonder") {
    const icerik = await mutabakatIcerigi(env, gunAnahtari(simdi));
    await kartAc(env, { tur: "mutabakat", icerik }, `📋 Fuat'a gidecek mutabakat (birebir; altında ✅ Mutabıkım / ❌ Uyuşmuyor / ⏳ Sonra düğmeleri):\n\n${icerik.duzFuat}`, simdi);
    return "Mutabakat önizlemesi Patron'a gösterildi; onaylamadan gitmez.";
  }
  if (ad === "siteden_kaldir") {
    const kodS = String(g.kod || "").replace(/\D/g, "");
    const st = await magazaStoklari(env, kodS); // 12 Kasım (C12): stok varken silme kartı HİÇ gönderilmez
    if (st.var) return `SİLME KARTI AÇILMADI: ${kodS} mağazada stokta (${st.yazi}). Kural: mağaza stoğu bitmeden model siteden ve kanaldan silinmez. Patron'a TEK satır yaz: stok adedi + kural. Kart gönderildi DEME.`;
    const sk = await silmeKaniti(env, kodS);
    if (sk.siteYuklendi && !sk.sitede && (sk.kanal || !sk.kanaldaPaylasim) && !sk.suruyor) return `${kodS} zaten silinmiş; kart açılmadı. ${silmeMetni(kodS, sk)}`;
    if (env.__kuru) return `(DENEME: ${kodS} stokta yok; gerçekte silme onay kartı Patron'a gösterilirdi.)`;
    const acikSil = []; for (const k of ((await env.KAYIT.list({ prefix: "venom:bot:is:" }).catch(() => ({ keys: [] }))).keys || []).slice(0, 80)) { const o = await oku(env, k.name, null); if (o && o.tur === "sil" && String(o.kod) === kodS && ["bekliyor", "emin", "yapiliyor"].includes(o.durum)) acikSil.push(o); }
    if (acikSil.some((o) => o.durum === "yapiliyor")) return `${kodS} silmesi zaten onaylandı ve sürüyor; yeni kart açılmadı. ${silmeMetni(kodS, sk)}`;
    if (acikSil.length) return `${kodS} için silme onay kartı zaten açık (${zamanKisa(acikSil[0].zaman)}); ikinci kart açılmadı. Patron o karta basabilir.`;
    await kartAc(env, { tur: "sil", kod: String(g.kod) }, `🗑 ${g.kod}: önce siteden (Selin), hemen ardından VOLONTE kanalındaki bütün paylaşımlar (Kemal) kaldırılacak. Kopyalar arşive alınır; yanlışsa /geri.`, simdi);
    return "Silme onay kartı Patron'a gösterildi.";
  }
  if (ad === "pelin_uret") {
    // 11 Kasım (Patron, EN TEHLİKELİ HATA): Pelin sadece Patron mesajında açıkça "Pelin" derse çalışır
    if (pelinAcikca(env.__patronMetni) && env.__kuru) return "(DENEME: Pelin maliyet kartı gösterilirdi.)";
    if (!pelinAcikca(env.__patronMetni)) return "Pelin BAŞLATILMADI: Patron mesajında açıkça \"Pelin\" demedi. Para harcayan iş yanlış anlamayla başlamaz. Bu iş bir kişiye (Merdan/Aziz/Hemra) ise kisiye_soyle kullan.";
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
  if (ad === "site_defteri") return defterMetni(env, g);
  if (ad === "model_listesi") {
    if (g.filtre === "paylasilmayan") return paylasilmayanlar(env, simdi);
    return defterMetni(env, { filtre: g.filtre === "videosuz" ? "videosuz" : "fotografsiz" });
  }
  if (ad === "satis_sorgu") {
    const kodlar = [...new Set((g.kodlar || []).map((x) => String(x).replace(/\D/g, "")).filter(Boolean))].slice(0, 200);
    const n = Math.min(90, Math.max(1, Number(g.gun_sayisi) || 30));
    const sat = (await stokIste(env, "/satis-donem", { basla: gunA(simdi - n * 86400), bitis: gunA(simdi) }).catch(() => ({}))) || {};
    const st = (await stokIste(env, "/toplu", { kodlar }).catch(() => ({}))) || {};
    const l = kodlar.map((k) => ({ k, a: sat[k] || 0, s: Math.max(0, (st[k] || {}).toplam ?? 0) })).sort((a, b) => b.a - a.a);
    return `Son ${n} gün satış (Sami): ${l.map((x) => `${x.k}: ${x.a} adet (stok ${x.s})`).join("; ")}`;
  }
  if (ad === "kanal_paylasim_sil") {
    const kl = (g.kodlar || []).map((k) => String(k).replace(/\D/g, "")).filter(Boolean);
    if (!(g.mesaj_no || []).length) for (const k of kl) { const st = await magazaStoklari(env, k); if (st.var) return `SİLİNMEDİ: ${k} mağazada stokta (${st.yazi}); stok bitmeden model kanaldan kaldırılmaz. Sadece hatalı TEK paylaşım silinecekse Patron o mesajın linkini / numarasını vermeli.`; }
    if (env.__kuru) return "(DENEME: kanal paylaşımı silinirdi.)";
  }
  if (ad === "kanal_paylasim_sil") return kanalSilYap(env, (g.kodlar || []).map((k) => String(k).replace(/\D/g, "")).filter(Boolean), g.mesaj_no || [], simdi);
  if (ad === "kanal_paylasim_duzelt") {
    const r = await botaSor(env, "kemal", "paylasimDuzelt", { kod: String(g.kod).replace(/\D/g, ""), ids: g.mesaj_no || null, kim: "Patron (Venom)" });
    if (!r) return "Kemal'e ULAŞILAMADI — 'yapıldı' deme.";
    await biriktir(env, { kaynak: "kemal", metin: `🧹 ${g.kod} yazı düzeltme: ${r.ok ? (r.yerinde ? "yazı yerinde düzeltildi" : r.ertelendi ? `eski silindi, doğru yazıyla sıraya alındı (${tarihSaat(r.saat).slice(11, 16)})` : "eski silindi, doğru yazıyla tek albüm paylaşıldı") : `olmadı (${r.hata})`}`, tur: "bilgi" }, simdi);
    if (r.ok && (r.link || r.yerinde)) turKanit(env).kanit.push(`${g.kod}: ${r.yerinde ? "yazı yerinde düzeltildi" : "yeniden paylaşıldı"}${r.link ? ` ${r.link}` : ""}`);
    else if (r.ok && r.ertelendi) turKanit(env).sirada.push(`${g.kod}: eski silindi, doğru yazıyla ${tarihSaat(r.saat).slice(11, 16)} paylaşımında (henüz kanalda değil)`);
    else turKanit(env).yapamadi.push(`Kemal: ${g.kod} ${r.hata || "düzeltilemedi"}`);
    return r.ok ? `Kemal yaptı: ${r.yerinde ? "yazı yerinde düzeltildi" : r.ertelendi ? `eski paylaşım silindi, doğru yazıyla sıraya alındı (${tarihSaat(r.saat).slice(11, 16)} civarı)` : `eski paylaşım silindi, doğru yazıyla tek albüm paylaşıldı ${r.link || ""}`}. Patron'a tek satır yeter.` : `KEMAL YAPAMADI: ${r.hata}. Patron'a açıkça "yapamadı, sebebi şu" de.`;
  }
  if (ad === "geri_al" && env.__kuru) return "(DENEME: geri alma kartı gösterilirdi.)";
  if (ad === "geri_al") {
    const b = await geriAlBul(env, g.kod ? String(g.kod).replace(/\D/g, "") : null, g.mesaj_no || null);
    if (!b) return "Geri alınacak kanal paylaşımı bulunamadı.";
    const site = b.site ? `\nSiteden de kaldırılacak: ${(b.site.fotolar || []).length} fotoğraf, ${(b.site.videolar || []).length} video` : "\nSitede bu paylaşımla eklenen bir şey kayıtlı değil (site değişmez).";
    await kartAc(env, { tur: "geriAl", kod: b.kod, kanalSil: [{ kod: b.kod, ids: b.ids, not: "geri alma" }], siteKaldir: b.site ? [{ kod: b.kod, fotolar: b.site.fotolar || [], videolar: b.site.videolar || [], dosyaSil: b.site.fotolar || [] }] : [] }, `↩️ GERİ ALMA — ${b.kod}\nKanaldan silinecek: ${gunA(b.tarih)} paylaşımı (${b.ids.length} mesaj)${b.link ? ` ${b.link}` : ""}${site}\nOnaylarsanız ikisi birlikte geri alınır.`, simdi);
    return "Geri alma onay kartı Patron'a gösterildi.";
  }
  if (ad === "hatirlatici") return hatirlaticiEkle(env, g, simdi);
  if (ad === "duraklatma") {
    const k = g.is === "pelin_uretim" ? "venom:pelinUretimAcik" : "venom:kemalPaylasAcik";
    const ok = await env.KAYIT.put(k, g.acik ? "1" : "0").then(() => true).catch(() => false);
    return ok ? `${g.is === "pelin_uretim" ? "Pelin'in yeni üretimi" : "Venom üzerinden Kemal paylaşımı"} ${g.acik ? "AÇILDI" : "DURAKLATILDI"}.` : "Ayar kaydedilemedi (Cloudflare günlük yazma sınırı dolu olabilir); Claude Code'a söyleyin.";
  }
  if (ad === "pelin_foto_kaydet") return pelinFotoIlet(env, g, simdi);
  if (ad === "bekleyenler" && env.__kuru) return aracCalistir(env, "patron_kararlari", {}, simdi);
  if (ad === "bekleyenler") { turKanit(env).sus = true; const n = await bekleyenleriGonder(env, simdi); return n ? `${n} bekleyen karar, düğmeleriyle Patron'a AYRI mesajlar olarak gönderildi. Listeyi tekrar YAZMA; tek kısa cümle yeter.` : "Kararınızı bekleyen iş yok — bunu Patron'a zaten yazdım; tekrar yazma, boş cevap ver."; }
  if (ad === "kemal_calistir") { // 13 Kasım (Patron): "Kemal'i çalıştır"
    const r = await botaSor(env, "kemal", "calistir", { enAzGun: Number(g.en_az_gun) || 0, kuru: Boolean(env.__kuru) });
    if (!r) return "Kemal çalışamadı: Kemal'e ulaşılamadı.";
    if (env.__kuru) return `(DENEME: gerçekte kartlar onaya giderdi; denemede hiçbir şey gönderilmedi.) ${calistirSatiri(r)}`; // kuru: Kemal sadece hesaplar
    if (r.ok && r.n) await isKaydet(env, "kemal", `Kemal'i çalıştır: ${r.n} model Hemra'nın onayında (${(r.kodlar || []).join(", ")})`, simdi).catch(() => null);
    return calistirSatiri(r);
  }
  if (ad === "is_kontrolu") return bekciMetni(await isBekcisi(env, simdi, { kuru: true }), tarihSaat(simdi).slice(-5)); // 13 Kasım (Patron): iş bekçisinin canlı cevabı
  if (ad === "magaza_stok_ozeti") { // 13 Kasım (Patron): model kodu sormadan, mağaza mağaza tek özet
    const gb = simdi - ((simdi + SAAT_FARKI) % 86400);
    return magazaOzetMetni(await stokIste(env, "/magaza-ozet", { basla: gb, bitis: gb + 86400 }).catch(() => null), simdi);
  }
  if (ad === "celal_modelleri") return celalListeMetni(await stokIste(env, "/celal-liste", {}).catch(() => null));
  if (ad === "eksik_listesi_karti") { // 13 Kasım (Patron): fabrikaya giden son kartın AYNISI (yazı + görüntü düğmeleri)
    const gs = String(g.gun || "").trim();
    const gun = gs === "dun" ? gunA9(simdi - 86400) : gs === "bugun" ? gunA9(simdi) : /^\d{4}-\d{2}-\d{2}$/.test(gs) ? gs : null;
    const k = await botaSor(env, "sami", "eksikKarti", gun);
    if (!k) return "Sami'ye ulaşılamadı; kart okunamadı.";
    if (!k.ok) return `Kart yok: ${k.neden}.`;
    const kl = { inline_keyboard: (k.dugmeler || []).map((satir) => satir.map((text) => ({ text: String(text).slice(0, 60), callback_data: "gz:-" }))) };
    const altSatir = `Yukarıdaki kart ${k.gun.split("-").reverse().slice(0, 2).join(".")} ${tarihSaat(k.zaman).slice(11, 16)}'te ${k.kisiler.join(", ")} hesabına giden son eksik listesi kartıdır (o listede ${k.kartSayisi} kart). Düğmeler sadece görüntüdür.`;
    if (env.__kuru) return `(DENEME: kart Patron'a gösterilirdi.) KART YAZISI:\n${k.yazi}\nDÜĞMELER: ${(k.dugmeler || []).map((sx) => sx.map((d) => `[${d}]`).join(" ")).join(" / ")}\n${altSatir}`;
    let gitti = false;
    if (k.resim && k.kod) { // kartta fotoğraf vardı: aynı model fotoğrafıyla
      const f = await botaSor(env, "kemal", "modelFoto", k.kod);
      if (f && f.ok && f.bayt) {
        const fd = new FormData();
        fd.append("chat_id", patron(env)); fd.append("photo", new Blob([f.bayt], { type: "image/jpeg" }), `${k.kod}.jpg`); fd.append("caption", String(k.yazi).slice(0, 1000)); fd.append("reply_markup", JSON.stringify(kl)); fd.append("protect_content", "true");
        const r = await tgForm(env, "sendPhoto", fd).catch(() => null);
        gitti = Boolean(r && r.ok);
      }
    }
    if (!gitti) await yaz(env, k.yazi, { reply_markup: kl, posta: { tur: "cevap" } });
    return `KART GÖSTERİLDİ. Patron'a sadece şunu yaz: ${altSatir}`;
  }
  if (ad === "deneme_modu") { // 13 Kasım (Patron, kural 40)
    if (g.islem === "basla") {
      const r = await modBasla(env, simdi);
      return r.zaten ? `Deneme modu zaten açık (${tarihSaat(r.basla)}).` : "🧪 Deneme modu açıldı. Bundan sonra başlatılan özel liste ve repete kayıtları deneme sayılır: kartların başında \"🧪 DENEME\" yazar; rapora, ciroya ve hatırlatmaya girmez. \"deneme bitti\" deyince hepsi tek seferde kapanır.";
    }
    const m = await modBitir(env);
    if (!m) return "Deneme modu açık değildi; kapatılacak deneme kaydı yok.";
    const l = (await env.KAYIT.get("sami:islemler", "json").catch(() => null)) || [];
    await env.KAYIT.put("sami:islemler", JSON.stringify([...l, { tur: "denemeBitir" }]), { expirationTtl: 3 * 86400 });
    return `🧪 Deneme bitti (${tarihSaat(m.basla)} – ${tarihSaat(simdi)}). Deneme kayıtları birkaç dakika içinde sessizce kapanır; kaç kayıt kapandığı tek satırla yazılacak. Kimseye mesaj gitmez.`;
  }
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
    if (g.bot === "pelin" && env.__sohbette && !pelinAcikca(env.__patronMetni)) return "Pelin'e İLETİLMEDİ: Patron mesajında açıkça \"Pelin\" demedi (11 Kasım kuralı). Bu iş bir kişiye ise kisiye_soyle kullan.";
    if (g.bot === "pelin" && /üret|uret|video|fotoğraf çek|maliyet/i.test(String(g.metin || "")) && !env.__sohbette && env.__izin !== "cevap") return "Pelin'e para gerektiren üretim emri Patron onayı olmadan verilmez (pelin_uret kartı).";
    const r = await botaSor(env, g.bot, "mesaj", String(g.metin || ""));
    if (r) await isKaydet(env, g.bot, String(g.metin || ""), simdi);
    if (r) await emirKaydet(env, g.bot, String(g.metin || ""), simdi); // 9 Kasım: 10 dk sonra yapıldı mı kontrol
    await kaydet(env, "venom:bot:sonBot", { bot: g.bot, zaman: simdi, metin: `(Venom iletti) ${String(g.metin).slice(0, 200)}` }, 3600);
    if (!r) return `${BOT_AD[g.bot]}'e ULAŞILAMADI. Patron'a "${BOT_AD[g.bot]}'e ulaşamadım" de; "verdim" DEME.`;
    // 10 Kasım (Patron): botun GERÇEK cevabı — yapamadıysa Patron'a açıkça "yapamadı, sebebi şu"; asla "verdim/hallettim"
    const cevap = await botunSonCevabi(env, g.bot, simdi);
    if (cevap && YAPAMADI.test(cevap)) {
      // 11 Kasım (Patron, ÇELİŞKİ YASAK): ara mesaj YOK — Venom önce başka yolla çözmeyi dener, sonra TEK mesaj (kanıtlı tamam / yapılamadı)
      turKanit(env).yapamadi.push(`${BOT_AD[g.bot]}: ${etiketTemizle(cevap).replace(/\s+/g, " ").slice(0, 200)}`);
      if (env.__sohbette === false || env.__sohbette == null) await yaz(env, `Yapılamadı, sebep: ${BOT_AD[g.bot]} — ${etiketTemizle(cevap).replace(/\s+/g, " ").slice(0, 300)}.`, { posta: { izin: "cevap" } });
      return `${BOT_AD[g.bot].toUpperCase()} YAPAMADI. Cevabı: «${etiketTemizle(cevap).slice(0, 400)}». Patron'a HENÜZ bir şey yazılmadı. Başka yolun varsa (ör. kanal_paylasim_sil, kanal_paylasim_duzelt) HEMEN kullan. Sonra TEK mesaj: ya "Tamam, kanıt: <kanal linki / mesaj no>" ya da "Yapılamadı, sebep: …" (sonuçsuz "çözülüyor" yazma). Kanıtın yoksa "düzeltildi/yapıldı" DEME.`;
    }
    return cevap ? `${BOT_AD[g.bot]}'in cevabı: «${cevap.slice(0, 400)}». Bu iş YAPILDI demek değil; Patron'a sadece bu cevabı aktar, "verdim/hallettim" deme.` : `${BOT_AD[g.bot]}'e iletildi, henüz cevap yok. Patron'a "ilettim, sonucu gelince söylerim" de; "verdim/hallettim" DEME.`;
  }
  if (ad === "kanal_paylasimlari") {
    const l = await oku(env, "venom:kanal:son", []);
    const sinir = simdi - (Number(g.gun) || 1) * 86400, kod = String(g.kod || "").replace(/\D/g, "");
    const f = l.filter((x) => x.zaman >= sinir && (!kod || x.kod === kod)).slice(-25);
    if (!f.length) return kod ? `${kod}: bu sürede kanalda paylaşım görmedim (Venom kanalı yönetici olduktan sonra izliyor).` : "Bu sürede kanalda paylaşım görmedim.";
    const guncel = (x) => (x.sorunlar || []).filter((s) => !/F[İI]YAT/i.test(s) || fiyatVar(x.yazi, x.kod)); // 11 Kasım: "$" işareti tek başına fiyat değil
    // 12 Kasım: silinen modelin eski mesajı Telegram'da duruyor görünebilir (SOLD OUT görseliyle gizli) — "sorun yok" diye yazılmaz, silme kaydı yazılır
    const sil = {}; for (const k of [...new Set(f.map((x) => x.kod).filter(Boolean))].slice(0, 12)) sil[k] = await oku(env, `silinen:${k}`, null);
    return f.map((x) => `• ${tarihSaat(x.zaman)} — ${x.kod || "kodsuz"} · ${x.medya || "yazı"}${x.imza ? ` · ${x.imza}` : ""}${sil[x.kod] ? ` · 🗑 KALDIRILDI (${zamanKisa(sil[x.kod].zaman)}; eski mesaj SOLD OUT görseliyle gizli — silme tamam)` : guncel(x).length ? ` · ⚠️ ${guncel(x).join("; ")}` : " · sorun yok"}`).join("\n");
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
  else if (is.tur === "sil") { const r = await silKuyrugu(env, is.kod, "Patron (Venom)", simdi); if (r && r.engel) await yaz(env, STOK_KURALI(is.kod, r.engel), { posta: { izin: "cevap" } }); }
  else if (is.tur === "pelin") await kuyrugaEkle(env, "pelinIs", { id: is.id, kodlar: is.kodlar, test: is.test });
  else if (is.tur === "siteDuzelt") {
    if (is.islem === "fotolari_yenile") await kaydet(env, "venom:siteFotoYenile", { kod: is.kod });
    else if (is.islem === "renkler") { const l = await oku(env, "venom:siteRenk", []); await kaydet(env, "venom:siteRenk", [...[].concat(l), { kod: is.kod, renkler: is.renkler || [], mod: "yaz" }]); }
    else if (is.islem === "taslak_yeniden") { const r = await botaSor(env, "selin", "taslak", is.kod); await yaz(env, r ? `${r.ok ? "✅" : "⚠️"} ${r.mesaj}` : "⚠️ Selin'e ulaşılamadı."); }
    else { const u = (await siteVerisi(env)).find((x) => String(x.kod) === is.kod); const ai = ((u && u.fotolar) || []).filter((f) => /\/pelin-[a-z0-9-]+\.jpg$/.test(f)); if (ai.length) { const l = await oku(env, "venom:siteMedyaKaldir", []); await kaydet(env, "venom:siteMedyaKaldir", [...l, { kod: is.kod, fotolar: ai, videolar: [] }]); } else await yaz(env, `${is.kod}: sitede yapay zekâ fotoğrafı yok.`); }
  }
  else if (is.tur === "temizlik" || is.tur === "geriAl") { // 6 Kasım: Patron onaylı temizlik (kanal fazlaları + site tekrarları)
    if ((is.kanalSil || []).length) { const l = await oku(env, "venom:kanalMesajSil", []); await kaydet(env, "venom:kanalMesajSil", [...l, ...is.kanalSil]); }
    if ((is.siteKaldir || []).length) { const l = await oku(env, "venom:siteMedyaKaldir", []); await kaydet(env, "venom:siteMedyaKaldir", [...[].concat(l), ...is.siteKaldir]); }
    await yaz(env, `🧹 Temizlik başladı: ${(is.kanalSil || []).length} kanal gönderisi, ${(is.siteKaldir || []).length} site kaydı. Sonuç birkaç dakika içinde gelir.`);
  }
  else if (is.tur === "imzaDuzelt") { // 6 Kasım: Black Rose gönderilerinin imzası düzeltilir (SİLİNMEZ) — Kemal yapar
    await kaydet(env, "venom:kanalImzaDuzelt", { liste: is.kanalDuzelt || [], zaman: simdi });
    await yaz(env, `🖋 İmza düzeltme başladı: ${(is.kanalDuzelt || []).length} gönderi (silinmeyecek, sadece imza). Sonuç ve düzenlenemeyenler birkaç dakika içinde gelir.`);
  }
  else if (is.tur === "selinTaslak") { const r = await botaSor(env, "selin", "taslak", String(is.kod)); await yaz(env, r ? `${r.ok ? "✅" : "⚠️"} ${r.mesaj}` : "⚠️ Selin'e ulaşılamadı."); }
  const { icerik, ...ozet } = is;
  await arsiv(env, `venom-${is.tur}`, is.id, { ...ozet, onay: tarihSaat(simdi) }, simdi);
}
export async function dugme(env, cq, simdi) {
  const cevap = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!patronMu(env, cq.from.id)) return cevap("Sadece Patron.");
  if (/^vgk:/.test(String(cq.data))) { // 9 Kasım: çözülemeyen görev kartı — Patron kararı
    const [, gid, h] = String(cq.data).split(":");
    if (h === "x") { await cevap("Kapatıldı"); const l = await oku(env, "venom:gorevler", []); const g = l.find((x) => x.id === gid); if (g) { g.patronGordu = simdi; await kaydet(env, "venom:gorevler", l, 30 * 86400); } return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); }
    await kaydet(env, "venom:kararBekle", { gid, zaman: simdi }, 3600);
    await cevap("Kararınızı yazın");
    return yaz(env, "📝 Kararınızı tek mesajla yazın (1 saat içinde); Hemra ve Merdan'a \"Patron kararı\" olarak gönderip uygulatacağım.");
  }
  if (/^vr:/.test(String(cq.data))) { // TEK KAPI: başka botun düğmesi → o bota "Patron bastı"
    const rid = String(cq.data).slice(3);
    const k = await oku(env, `venom:bot:dugme:${rid}`, null);
    if (!k) return cevap("Bu düğme artık geçerli değil.");
    const r = await botaSor(env, k.bot, "dugme", k.data, rid);
    await cevap(r ? `${BOT_AD[k.bot]}'e iletildi` : "İletilemedi");
    return null;
  }
  if (/^vk:/.test(String(cq.data))) { // 6 Kasım: Patron'un kesin marka kararı
    const [, kod, h] = String(cq.data).split(":");
    const kesin = MARKA_KARARLARI[kod]; // kural kitabında zaten karar varsa o geçerli (düğme değiştiremez)
    const marka = kesin || (h === "B" ? "BLACKROSE" : "VOLONTE");
    const l = (await oku(env, "venom:markaKarar", {})) || {};
    l[kod] = marka; await kaydet(env, "venom:markaKarar", l);
    await stokIste(env, "/ayar-yaz", { k: "marka:karar", v: JSON.stringify(l) }).catch(() => null); // Sami'nin Black Rose stoğu da uysun
    const d = await oku(env, "venom:siteDefteri", null);
    if (d && d.modeller && d.modeller[kod]) { const { markaNot, ...m } = d.modeller[kod]; d.modeller[kod] = { ...m, marka }; await kaydet(env, "venom:siteDefteri", d); }
    const satirlar = ((cq.message.reply_markup || {}).inline_keyboard || []).filter((r) => !r.some((b) => String(b.callback_data || "").startsWith(`vk:${kod}:`)));
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: satirlar } }).catch(() => null);
    await yaz(env, `🏷 ${kod} = ${marka === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"} (kalıcı; bütün botlar bunu kullanır).`);
    return cevap("Kaydedildi");
  }
  if (String(cq.data) === "gz:-") return cevap("Bu kart sadece görüntü; düğmeleri basılamaz."); // 13 Kasım: gösterilen kart kopyası
  if (/^vmk:/.test(String(cq.data))) return modelKartDugmesi(env, cq, simdi, cevap); // 9 Kasım: kısa model kartı
  if (/^vrk:/.test(String(cq.data))) return rkKararDugmesi(env, cq, simdi, cevap); // 11 Kasım: repete kartı [Onaylıyorum] [Reddediyorum]
  if (/^vbo:/.test(String(cq.data))) return bittiKararDugmesi(env, cq, simdi, cevap); // 10 Kasım: fabrika bitti → Hemra önerisi → Patron
  if (/^vkr:/.test(String(cq.data))) { // 9 Kasım: bildirim kuralını kaldır
    const ok = await kuralSil(env, String(cq.data).slice(4));
    await yaz(env, ok ? "✅ Kural kaldırıldı; bu mesajlar yine gelir. Güncel liste: /kurallarım" : "Bu kural zaten yok.");
    return cevap(ok ? "Kaldırıldı" : "Yok");
  }
  if (/^vd:/.test(String(cq.data))) { // 6 Kasım: ⛔ Durdur onayı
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    if (cq.data === "vd:x") return cevap("Vazgeçildi");
    await durYaz(env, { hepsi: true, neden: { hepsi: "Patron: hepsini durdur" } }, simdi);
    await cevap("Durduruldu");
    return yaz(env, "⛔ HEPSİ DURDURULDU: Kemal (paylaşım), Selin (site yazma), Pelin (üretim), Sami (zamanlı işler). Açmak için \"hepsini aç\".");
  }
  if (/^vs:/.test(String(cq.data))) { // 6 Kasım: sesli rapor maliyet onayı
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    const ac = cq.data === "vs:a";
    await env.KAYIT.put("venom:sesliAcik", ac ? "1" : "0");
    await cevap(ac ? "Açıldı" : "Kapalı");
    return yaz(env, ac ? "🔊 Sesli rapor AÇIK: sabah ve akşam raporları ayrıca sesli mesaj olarak da gelecek (≈0,02 $/rapor). Kapatmak için \"sesli kapat\"." : "Sesli rapor kapalı.");
  }
  if (/^vm:/.test(String(cq.data))) { // 6 Kasım (D8): açıklamasız dosya → Pelin / Paylaş / Sadece kaydet
    const [, rid, sec] = String(cq.data).split(":");
    const soru = await oku(env, "venom:bot:medyaSoru", null);
    if (!soru || soru.rid !== rid) return cevap("Bu soru artık geçerli değil.");
    await tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    if (sec === "m") { await cevap("Bakıyorum"); return fotoModelBul(env, soru.foto || {}, simdi); } // 9 Kasım
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
  // 13 Kasım (Patron, kural 6): "Emin misiniz?" SADECE para harcama, silme, fabrika siparişi (kural değişikliği kartsızdır);
  // iç mesaj, imza, renk, site taslağı gibi işler ✅ Onayla ile sorulmadan yapılır.
  const eminsiz = islem === "o" && is.durum === "bekliyor" && !eminGerek(is);
  if (eminsiz) is.durum = "emin";
  if (islem === "o" && !eminsiz) {
    if (is.durum === "emin") return cevap("Zaten soruldu: aşağıdaki \"✅ Evet\"e basın."); // 12 Kasım (D15): "Emin misiniz?" bir kez
    is.durum = "emin"; await kaydet(env, `venom:bot:is:${id}`, is, 7 * 86400);
    await cevap("Emin misiniz?");
    await kapat("⏳ Onay bekliyor: aşağıdaki \"Evet\"e basın").catch(() => null);
    return yaz(env, "⚠️ Emin misiniz?", { reply_markup: { inline_keyboard: [[{ text: "✅ Evet", callback_data: `vb:E:${id}` }, { text: "Vazgeç", callback_data: `vb:x:${id}` }]] } });
  }
  if ((islem === "E" || eminsiz) && is.durum === "emin") {
    is.durum = "yapiliyor"; is.onayZaman = simdi; await kaydet(env, `venom:bot:is:${id}`, is, 7 * 86400);
    await cevap("Tamam");
    await isCalistir(env, is, simdi);
    await kapat("✅ Onaylandı");
    // 12 Kasım (D14): söz kaydı — bitince Patron'a KANITLA tek satır; 1 saatte bitmezse Venom sebebini araştırır
    if (is.tur === "sil") { await sozEkle(env, { tur: "sil", kod: String(is.kod), isId: id }, simdi); await kararVerildi(env, is.kod, "sil", simdi, { haricIs: id }).catch(() => null); }
    else if (["mesaj", "mutabakat"].includes(is.tur)) await sozEkle(env, { tur: "mesaj", id, kime: KISILER[is.kime] ? KISILER[is.kime].ad : is.tur === "mutabakat" ? "Fuat" : is.kime }, simdi);
    return yaz(env, is.tur === "sil" ? `✅ ${is.kod} silmesi sırada: önce site (Selin), sonra kanal (Kemal). Bitince kanıtıyla yazacağım (site + kanal mesaj numaraları).` : "✅ Sırada. Gidince yazacağım.");
  }
  return cevap("Önce ✅ Onayla.");
}

// ---------- Harcama (4 Kasım, Patron): Venom'un kendi yapay zekâ harcaması kaydedilir; aylık tavan (öneri 30 $) ----------
// KV "venom-harcama:<ay>" (USD). Tavan KV "venom:bot:sinir" (Patron rakamı söyleyince yazılır); yoksa 30 $. %80'de Patron'a bir kez haber.
export const VENOM_SINIR_VARSAYILAN = 50; // 13 Kasım (Patron, kural 74): asıl değer kitaptan (botSiniri)
const CLAUDE_FIYAT = { "claude-sonnet-5-5": { giris: 2, cikis: 10, okuma: 0.2 }, "claude-opus-5-5": { giris: 4, cikis: 20, okuma: 0.2 } };
const SES_DAKIKA_USD = 0.003; // gpt-4o-mini-transcribe (yaklaşık)
const ay = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 7);
export const venomHarcanan = async (env, simdi) => Number((await env.KAYIT.get(`venom-harcama:${ay(simdi)}`)) || 0);
export const venomSinir = async (env) => (await botSiniri(env, "venom")).ay || VENOM_SINIR_VARSAYILAN; // tek tablo: kitap (eski KV "venom:bot:sinir" kullanılmaz)
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
// 11 Kasım (Patron): "Bekleyenler" = SADECE Patron kararı bekleyen işler, her biri KENDİ düğmesiyle. Bilgi satırı (ör. "Sitede 165 model") yok.
// Biten ya da 3 günden eski iş listeden düşer; aynı iş iki kez yazılmaz (en yenisi kalır); satır kesilmez; iç ayrıntı yok.
export const KARAR_ESKI = 3 * 86400;
const ilkCumle = (t) => { const d = String(t || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim(); const m = d.match(/^.*?[.!?](?=\s|$)/); return kisaYaz((m ? m[0] : d).replace(/[:\s]+$/, "").replace(/\?\.$/, "?"), 220); };
export function kartBasligi(is) {
  if (is.tur === "mutabakat") return "Fuat mutabakatı: Fuat'a gidecek haftalık stok ve bakiye dökümü (siz onaylamadan gitmez)";
  if (is.tur === "mesaj") return `${(KISILER[is.kime] || {}).e || "Birine"} gidecek mesaj: "${ilkCumle(is.govde)}"`;
  return ilkCumle(String(is.metin || "").split("\n")[0]);
}
const bittiKlavye = (x) => ({ inline_keyboard: x.oneri === "sor" ? [[{ text: "🔁 Repete", callback_data: `vbo:r:${x.sip}` }, { text: "🗑 Sil", callback_data: `vbo:s:${x.sip}` }], [{ text: "⏳ Bekle", callback_data: `vbo:w:${x.sip}` }]]
  : [[{ text: "✅ Onayla", callback_data: `vbo:o:${x.sip}` }, { text: "🔁 Repete", callback_data: `vbo:r:${x.sip}` }], [{ text: "🗑 Sil", callback_data: `vbo:s:${x.sip}` }, { text: "⏳ Bekle", callback_data: `vbo:w:${x.sip}` }]] });
export async function bekleyenKararlar(env, simdi) {
  const l = [];
  const listele = async (prefix) => { try { return (await env.KAYIT.list({ prefix })).keys || []; } catch { return []; } };
  // 1) Venom'un kendi onay kartları (mesaj, mutabakat, silme, site düzeltmesi …)
  const kartlar = [];
  for (const k of (await listele("venom:bot:is:")).slice(0, 80)) { const is = await oku(env, k.name, null); if (is && ["bekliyor", "emin"].includes(is.durum)) kartlar.push(is); }
  kartlar.sort((a, b) => b.zaman - a.zaman);
  // 12 Kasım (C10, C12): karar verilmiş / silinmesi onaylanmış model yeniden sorulmaz; stok varken silme kartı durmaz; aynı modele çelişen
  // iki karar (hem sil hem bekle) aynı anda sorulmaz (Patron'un silme kartı varsa "fabrikada bitti" kartı düşer).
  const onayli = await silOnayli(env);
  const kararSonra = async (kod, z) => { try { const v = (await stokIste(env, "/ayar-oku", { k: `karar:son:${kod}` })).v; return v ? Number(JSON.parse(v).zaman) > z : false; } catch { return false; } };
  const silKodlari = new Set();
  const gorulen = new Set();
  for (const is of kartlar) {
    if (is.tur === "sil") {
      const st = await magazaStoklari(env, is.kod);
      if (st.var || onayli[String(is.kod)]) { is.durum = st.var ? "iptal" : "kapandi"; is.kapanis = { zaman: simdi, neden: st.var ? `stok var (${st.yazi}): stok bitmeden silinmez` : "silme zaten onaylandı" }; await kaydet(env, `venom:bot:is:${is.id}`, is, 3 * 86400).catch(() => null); continue; }
      silKodlari.add(String(is.kod));
    }
    const b = kartBasligi(is), anahtar = `${is.tur}|${is.tur === "mutabakat" ? "" : b}`;
    const eski = simdi - is.zaman > KARAR_ESKI;
    if (eski || gorulen.has(anahtar)) { is.durum = eski ? "eskidi" : "tekrar"; await kaydet(env, `venom:bot:is:${is.id}`, is, 3 * 86400).catch(() => null); continue; }
    gorulen.add(anahtar);
    l.push({ baslik: b, zaman: is.zaman, klavye: kartKlavye(is.id), kod: is.kod ? String(is.kod) : null, tip: is.tur === "sil" ? "sil" : is.tur === "pelin" ? "para" : /repete/i.test(String(is.metin || "")) ? "repete" : "diger" });
  }
  // 2) fabrika "bitti" kararları (repete / sil / bekle)
  for (const k of (await listele("venom:bittiKart:")).slice(-80)) {
    const x = await oku(env, k.name, null);
    const z = x ? Number(String(x.id || "").split(":").pop()) || simdi : 0;
    if (!x || x.karar || x.deneme || x.mod || simdi - z > KARAR_ESKI) continue; // deneme modu kartı "karar bekleyenler"e girmez
    if (onayli[String(x.kod)] || silKodlari.has(String(x.kod)) || (await kararSonra(x.kod, z))) { if (!silKodlari.has(String(x.kod))) { Object.assign(x, { karar: "kapandi", kararKim: "sistem", kararZaman: simdi, kararDugme: "başka karar verildi" }); await kaydet(env, k.name, x, 30 * 86400).catch(() => null); } continue; }
    const mk = MAGAZA_BASLIK[x.magaza] || { VOLONTE: "VOLONTE", BLACKROSE: "Black Rose" }[(await markaKesin(env, String(x.kod)).catch(() => ({}))).marka] || "marka kayıtsız"; // marka biliniyorsa "mağaza yazılmamış" yazılmaz
    l.push({ baslik: `${x.kod} (${mk}): fabrikada bitti — Hemra önerisi: ${ONERI_AD[x.oneri] || x.oneri}`, zaman: z, klavye: bittiKlavye(x), kod: String(x.kod), tip: "bitti" });
  }
  // 3) repete kartları
  for (const k of (await listele("venom:rkKart:")).slice(-80)) {
    const x = await oku(env, k.name, null);
    if (x && !x.karar && !x.mod && simdi - (x.zaman || simdi) <= KARAR_ESKI && !onayli[String(x.kod)]) l.push({ baslik: `${x.deneme ? "🧪 DENEME — " : ""}${x.kod} repete: ${x.dagilim} (toplam ${x.adet} adet)`, zaman: x.zaman || simdi, klavye: rkKlavye(x.rid), kod: String(x.kod), tip: "repete" });
  }
  // 4) Pelin / Kemal kartları (para, son yayın): düğmeleri kendi kartlarında
  const ayna = await oku(env, "venom:pelinDurum", null);
  if (ayna) {
    const ad = { senaryo_onay: "senaryo onayı", foto_onay: "ön fotoğraf onayı", onay: "video önizlemesi", uyari: "kontrolden geçmedi, kararınız", paket_onay: "paket önizlemesi" };
    for (const x of (ayna.isler || []).filter((y) => ad[y.durum] && !y.deneme && simdi - (y.zaman || 0) <= KARAR_ESKI)) l.push({ baslik: `Pelin — ${x.kod}: ${ad[x.durum]} (düğmesi kendi kartında, yukarıda)`, zaman: x.zaman || simdi, klavye: null });
    for (const k of (ayna.acikKartlar || []).filter((y) => simdi - (y.zaman || simdi) <= KARAR_ESKI)) l.push({ baslik: `Pelin — maliyet kartı: ${ilkCumle(k.baslik)} (düğmesi kendi kartında, yukarıda)`, zaman: k.zaman || simdi, klavye: null });
  }
  for (const k of await listele("kemal:pelinYayin:")) l.push({ baslik: `Kemal — ${k.name.split(":")[2].split("-")[0]}: son yayın onayı (düğmesi kendi kartında, yukarıda)`, zaman: simdi, klavye: null });
  return l.sort((a, b) => b.zaman - a.zaman);
}
export async function bekleyenlerMetni(env, simdi) {
  const l = await bekleyenKararlar(env, simdi);
  return l.length ? [`⏳ Kararınızı bekleyen işler (${l.length}):`, ...l.map((x, i) => `${i + 1}. ${x.baslik} (${tarihSaat(x.zaman).slice(0, 5)})`)].join("\n") : "✅ Kararınızı bekleyen iş yok.";
}
// Her iş AYRI mesaj: başlık + altında kendi düğmesi
export async function bekleyenleriGonder(env, simdi) {
  const l = await bekleyenKararlar(env, simdi);
  if (!l.length) { await yaz(env, "✅ Kararınızı bekleyen iş yok."); return 0; }
  for (const [i, x] of l.slice(0, 6).entries()) await yaz(env, `⏳ ${i + 1}/${l.length} — ${x.baslik} (${tarihSaat(x.zaman).slice(0, 5)})`, x.klavye ? { reply_markup: x.klavye } : {});
  if (l.length > 6) await yaz(env, `… ve ${l.length - 6} iş daha (en yeni 6'sı yukarıda).`);
  return l.length;
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
  if (/\?|payla[sş][ıi]ld[ıi]|payla[sş]t[ıi]n|payla[sş]m[ıi][sş]|(?:^|\s)m[ıiuü](?=\s|$)|paylaşma(?=\s|$)|neden|niye/.test(t)) return null;
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
export const pelinAcikca = (metin) => /(?<![\p{L}])pel[iıİ]n/iu.test(String(metin || "")); // 13 Kasım (kural 36): "PELİN", "PELIN", "pelin" hepsi
export function uretNiyeti(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (!pelinAcikca(t)) return null; // 11 Kasım (Patron): Pelin sadece Patron açıkça "Pelin" derse; "fotoğraf" kelimesi Pelin sebebi değil
  if (/\?|payla[sş]|kanala|siteye/.test(t)) return null;
  if (!/(foto[ğg]raf|video|g[öo]rsel|manken)[a-zçğıöşü]*\s+(yap|[üu]ret|[çc]ek|haz[ıi]rla)|(?:^|\s)[üu]ret(?=\s|$|[.!])|[üu]retimi/.test(t)) return null;
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
  if (ok) { await kaydet(env, "venom:bot:sonPaylasim", { kod: b.kod, liste, zaman: simdi }, 3 * 86400).catch(() => null); await isKaydet(env, "kemal", `${b.kod} paylaşım kartı (${liste.length} dosya)`, simdi); }
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
// 9 Kasım (Patron): VENOM KENDİNİ TEST EDER — her bot için 3 soru (bugün ne yaptı, bu hafta ne yaptı, bekleyen iş var mı).
// Boş / "bilmiyorum" çıkarsa hangi kaynak eksik → Claude Code notu + akşam özetinde 1 satır (KV venom:ozTest:<gün>).
export async function ozTest(env, simdi) {
  const bos = [];
  let n = 0;
  for (const bot of ["kemal", "selin", "pelin", "nora", "sami"]) {
    for (const donem of ["bugün", "bu hafta"]) {
      n++;
      const t = await botRaporuMetni(env, bot, donem, simdi).catch((e) => `hata: ${e.message}`);
      if (/hiçbir kaynakta kayıt yok|^hata:/.test(t)) bos.push({ soru: `${bot} ${donem} ne yaptı`, kaynak: (t.match(/Baktığım kaynaklar: (.*)\./) || [, "rapor hatası"])[1] });
    }
    n++;
    const b = await botRaporuMetni(env, bot, "bu hafta", simdi).catch(() => "");
    if (!/Bekleyen|bekl|cevapsız|kuyruk|sırasında/i.test(b) && ["pelin", "selin", "kemal"].includes(bot)) bos.push({ soru: `${bot} bekleyen iş`, kaynak: bot === "pelin" ? "Pelin iş listesi" : bot === "selin" ? "Selin onay/fotoğraf listesi" : "Kemal kanal sırası" });
  }
  await kaydet(env, `venom:ozTest:${gunAnahtari(simdi)}`, { zaman: simdi, n, bos }, 3 * 86400);
  for (const x of bos) await yetenekNotu(env, `Venom öz-testi: "${x.soru}" sorusuna boş cevap — eksik kaynak: ${x.kaynak}`, simdi);
  return bos.length ? `⚠️ Venom öz-testi: ${n} sorudan ${n - bos.length}'i dolu; boş: ${bos.map((x) => x.soru).join(", ")} (Claude Code'a yazıldı)` : `✅ Venom öz-testi: ${n} sorunun hepsine dolu cevap`;
}
// 9 Kasım (sert müdür F): dün Patron'a izin nedeni olmadan mesaj gitti mi? (Venom'dan gidenlerin hepsi etiketli olmalı; botlar tek kapıdan)
export async function izinKontrolu(env, simdi) {
  const dun = gunAnahtari(simdi - 86400);
  const log = await oku(env, `venom:izin:log:${dun}`, []);
  const izinsiz = log.filter((x) => !IZINLER.includes(x.izin)).length;
  const engel = Number(await env.KAYIT.get(`venom:izin:engel:${dun}`).catch(() => 0)) || 0;
  const tekKapi = (await env.KAYIT.get("venom:tekKapi").catch(() => null)) === "1";
  if (izinsiz || !tekKapi) {
    await yetenekNotu(env, `SIZINTI (${dun}): ${izinsiz ? `${izinsiz} mesaj izin nedeni olmadan Patron'a gitti. ` : ""}${tekKapi ? "" : "Tek kapı KAPALI: botlar Patron'a doğrudan yazabilir. "}Aynı gün kapatılmalı.`, simdi);
    return `❌ İzin kapısı: ${izinsiz ? `dün ${izinsiz} mesaj izinsiz gitti` : ""}${!tekKapi ? `${izinsiz ? "; " : ""}tek kapı kapalı` : ""} — Claude Code'a yazıldı`;
  }
  return `✅ İzin kapısı: dün Patron'a izinsiz mesaj gitmedi (${log.length} izinli · ${engel} mesaj durduruldu, Venom çözdü)`;
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
  try { satir.push(await izinKontrolu(env, simdi)); } catch { /* */ }
  try { satir.push(await ozTest(env, simdi)); } catch (e) { satir.push(`⚠️ Venom öz-testi çalışmadı: ${String(e && e.message).slice(0, 80)}`); }
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
    if (h && h.zaman && simdi - h.zaman < sure) satir.push(`• ${ad}: ${kisaYaz(String(h.hata || h.metin || "").replace(/\d{9,}/g, "•••").replace(/\s+/g, " "), 140)}`);
  }
  for (const h of (await oku(env, "venom:bot:hata", [])).filter((x) => simdi - x.zaman < sure).slice(-5)) satir.push(`• Venom (${h.yer}): ${kisaYaz(String(h.hata).split("\n")[0], 120)}`);
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
  const gh = (await oku(env, "venom:selinGithub", [])).filter((x) => simdi - x.zaman < sure); // 6 Kasım: Selin GitHub 500/502
  const ghOlmadi = gh.filter((x) => x.durum === "yuklenemedi"), ghOldu = gh.filter((x) => x.durum === "yuklendi");
  if (ghOlmadi.length) satir.push(...ghOlmadi.slice(-8).map((x) => `• ❌ Selin: ${x.kod} siteye yüklenemedi — GitHub hatası, 10 ve 30 dk sonra da olmadı (${String(x.hata || "").slice(0, 80)})`));
  if (ghOldu.length) satir.push(`• Selin: GitHub hatası sonrası kendiliğinden yüklendi: ${ghOldu.map((x) => `${x.kod} (${x.dk} dk sonra)`).join(", ")}`);
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
  env = { ...env, __izin: "cevap" }; // Patron'un kendi paylaşım isteğinin sonucu / onayı
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
  env = { ...env, __izin: "cevap" }; // Patron'un kendi paylaşım isteğinin sonucu / onayı
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
    if (gorulen) await defterYaz(env, { zaman: z, bot: String(ad).toLowerCase(), tur: "hata", ozet: String(h.hata || h.yol || "").slice(0, 200) }).catch(() => null); // 9 Kasım: iş defteri
    if (gorulen && simdi - z < 3600) satir.push(`• ${ad}: ${String(h.hata || h.yol || "").slice(0, 160)}`);
    if (gorulen) { const bot = String(ad).toLowerCase(); const alarm = await hataAlarmi(env, bot, z, h.hata || h.yol, simdi).catch(() => null); if (alarm) await bildir(env, alarm, { simdi, kaynak: bot, tur: "kritik" }); }
  }
  await kaydet(env, "venom:bot:hataGoruldu", yeni);
  for (const x of satir) await bildir(env, `⚠️ Bot hatası ${x.slice(2)}`, { simdi, tur: "bilgi" }); // 9 Kasım: tek tek hata = bilgi (özette)
}

// ---------- TEK KAPI (5 Kasım, Patron): diğer botların Patron'a giden her şeyi buradan ----------
const BOT_BAG = { kemal: "KEMAL_W", selin: "SELIN_W", pelin: "PELIN_W", sami: "SAMI_W" };
const BOT_AD = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami" };
// 10 Kasım (Patron): "3512 sil" · "bu paylaşımı sil" (yanıt / link) · "bugünkü 3512 ve 3629 paylaşımlarını sil" → Kemal onay kartı İSTEMEDEN siler.
// Model siteden kalkmaz (o iş "siteden sil / tamamen kaldır": onay kartlı, stok kuralıyla). Belirsizse en son paylaşım.
export function kanalSilNiyeti(metin, yanit = "") {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (!/\bsil(in|insin|elim|iniz)?\b/.test(t) || /site|tamamen|modeli\s|stoktan|vegawin|kural|kart[ıi]n[ıi]?\s|defter|mesaj[ıi]m[ıi]/.test(t)) return null;
  const ids = [...new Set([...String(metin).matchAll(/t\.me\/[A-Za-z0-9_]+\/(\d{3,7})/g), ...(/\bbu\b/.test(t) ? String(yanit).matchAll(/t\.me\/[A-Za-z0-9_]+\/(\d{3,7})/g) : [])].map((x) => Number(x[1])))];
  const kodlar = [...new Set((String(metin).replace(/t\.me\/\S+/g, " ").match(/\b\d{4,6}\b/g) || []))];
  if (!ids.length && !kodlar.length) return null;
  if (!ids.length && !/payla[sş]|kanal|\bsil\b/.test(t)) return null;
  return { kodlar, ids };
}
async function kanalSilYap(env, kodlar, ids, simdi) {
  const satir = [];
  if (ids.length) {
    const r = await botaSor(env, "kemal", "paylasimSil", { kod: kodlar.length === 1 ? kodlar[0] : null, ids });
    satir.push(r ? (r.silinen && r.silinen.length) || (r.gizlenen && r.gizlenen.length) ? `Silindi: ${r.ozet}${r.gizlenen && r.gizlenen.length ? ` (${r.gizlenen.length} eski mesaj silinemedi, SOLD OUT ile gizlendi)` : ""}` : `⚠️ Silinemedi: ${r.hata || "Kemal silemedi"}` : "⚠️ Kemal'e ulaşılamadı; silinmedi.");
  } else {
    for (const kod of kodlar.slice(0, 6)) {
      const r = await botaSor(env, "kemal", "paylasimSil", { kod });
      satir.push(r ? (r.silinen && r.silinen.length) || (r.gizlenen && r.gizlenen.length) ? `Silindi: ${r.ozet}` : `⚠️ ${kod} silinemedi: ${r.hata || "Kemal silemedi"}` : `⚠️ ${kod}: Kemal'e ulaşılamadı; silinmedi.`);
    }
  }
  await isKaydet(env, "kemal", `paylaşım sil: ${[...kodlar, ...ids].join(", ")}`, simdi).catch(() => null);
  for (const x of satir) (/^Silindi/.test(x) ? turKanit(env).kanit : turKanit(env).yapamadi).push(x.replace(/^⚠️\s*/, "")); // 11 Kasım: tek mesaj kapısı
  return satir.join("\n");
}
// 10 Kasım: bot "yapamıyorum" dedi mi?
export const YAPAMADI = /yapam[ıi]yorum|yapamam|yapamad[ıi]m|yapam[ıi]yor|edemiyorum|edemem|edemedim|olmuyor|olmad[ıi]|m[üu]mk[üu]n de[ğg]il|yetkim yok|izin(im)? yok|bulamad[ıi]m|bulunamad[ıi]|desteklemiyor|silemiyorum|silemem|silinemedi|paylaşamıyorum|paylaşamad[ıi]m|gönderemiyorum|gönderilemedi|elimde .{0,30}yok|\bhata\b|❌|⚠️/i;
async function botunSonCevabi(env, bot, bas) {
  if (!env.STOK) return null;
  const v = (await stokIste(env, "/ayar-oku", { k: `venom:botCevap:${bot}` }).catch(() => ({}))).v;
  let l = []; try { l = JSON.parse(v || "[]"); } catch { l = []; }
  const yeni = l.filter((x) => x.zaman >= bas - 2);
  return yeni.length ? yeni.map((x) => x.metin).join("\n") : null;
}
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
  const simdi = Math.floor(Date.now() / 1000);
  const duzenleme = /^edit/.test(String(k.metod || "")) || /^✏️ /.test(String(k.metin || ""));
  const cevapIs = duzenleme ? null : await isCevap(env, k.bot, simdi).catch(() => null); // iş takibi: bot cevap verdi
  if (k.metin) await kaydet(env, "venom:bot:sonBot", { bot: k.bot, zaman: simdi, metin: String(k.metin).slice(0, 400) }, 3600).catch(() => null);
  if (k.metin && env.STOK && !duzenleme) { // 10 Kasım: bota_yaz botun GERÇEK cevabını okur ("verdim" demeden önce)
    const eski = (await stokIste(env, "/ayar-oku", { k: `venom:botCevap:${k.bot}` }).catch(() => ({}))).v;
    const l = (() => { try { return JSON.parse(eski || "[]"); } catch { return []; } })();
    await stokIste(env, "/ayar-yaz", { k: `venom:botCevap:${k.bot}`, v: JSON.stringify([...l.filter((x) => simdi - x.zaman < 900), { zaman: simdi, metin: String(k.metin).slice(0, 600) }].slice(-5)) }).catch(() => null);
  }
  const kart = !duzenleme && (k.butonlar || []).some((r) => (r || []).some((b) => b && b.callback_data && !PERSONEL_KARTI.test(b.callback_data)));
  const medya = (k.medya || []).filter((m) => m && m.media).slice(0, 10);
  // 11 Kasım (Patron, ÇELİŞKİ YASAK): Venom Patron'la konuşurken bota verdiği işin düz yazı cevabı Patron'a AYRI gitmez — Venom okur, TEK mesaj yazar
  if (!kart && !medya.length && !duzenleme && k.metin && (await env.KAYIT.get("venom:sohbetAktif").catch(() => null))) return biriktir(env, { kaynak: k.bot, metin: k.metin, tur: "bilgi" }, simdi);
  // 9 Kasım (Patron): POSTANE — anında sadece kart / kritik / Patron'un isteğinin cevabı; gerisi Venom'da birikir
  const karar = await postaKarar(env, { kaynak: k.bot, metin: k.metin || (medya.length ? `📷 ${medya.length} görsel` : ""), tur: cevapIs ? "cevap" : null, kart }, simdi);
  if (karar.karar === "biriktir") {
    if (medya.length && !duzenleme && !karar.kural) { // kartın albümü olabilir: 3 dk bekler (kart gelirse birlikte gider)
      const l = await oku(env, `venom:posta:medya:${k.bot}`, []);
      return kaydet(env, `venom:posta:medya:${k.bot}`, [...l.filter((x) => simdi - x.zaman < 180), { zaman: simdi, k }].slice(-5), 3600);
    }
    return biriktir(env, { kaynak: k.bot, metin: k.metin || `📷 ${medya.length} görsel`, tur: karar.tur, kategori: karar.kategori, kural: karar.kural }, simdi);
  }
  if (karar.karar === "cozum") return cozumeEkle(env, { kaynak: k.bot, metin: k.metin || "📷 görsel", sebep: "bot kartı izin listesinde yok", klavye: k.butonlar && !duzenleme ? { inline_keyboard: await butonCevir(env, k.bot, k.butonlar) } : null }, simdi);
  env = { ...env, __izin: karar.izin };
  const klavye = k.butonlar && !duzenleme ? { inline_keyboard: await butonCevir(env, k.bot, k.butonlar) } : null;
  const bekleyen = (await oku(env, `venom:posta:medya:${k.bot}`, [])).filter((x) => simdi - x.zaman < 180);
  if (bekleyen.length) await env.KAYIT.delete(`venom:posta:medya:${k.bot}`).catch(() => null);
  if (karar.karar === "sira") return siraya(env, { kaynak: BOT_AD[k.bot] || k.bot, metin: k.metin, klavye, medya: [...bekleyen.flatMap((x) => x.k.medya || []), ...medya], izin: karar.izin }, simdi);
  for (const x of bekleyen) await aktarGonder(env, x.k, null);
  const r = await aktarGonder(env, k, klavye);
  await gonderildiKaydet(env, { kaynak: k.bot, tur: karar.tur, kategori: karar.kategori, metin: k.metin || "📷 görsel", id: r && r.result && r.result.message_id, izin: karar.izin }, simdi).catch(() => null);
  return r;
}
// Kartın albümü 3 dk içinde kart gelmezse bilgi olarak birikir (cron)
async function bekleyenMedyaBosalt(env, simdi) {
  for (const bot of Object.keys(BOT_AD)) {
    const l = await oku(env, `venom:posta:medya:${bot}`, []);
    if (!l.length || l.some((x) => simdi - x.zaman < 180)) continue;
    await env.KAYIT.delete(`venom:posta:medya:${bot}`).catch(() => null);
    for (const x of l) await biriktir(env, { kaynak: bot, metin: x.k.metin || `📷 ${(x.k.medya || []).length} görsel`, tur: "bilgi" }, simdi);
  }
}
async function aktarGonder(env, k, klavye) {
  const bas = `🤖 ${BOT_AD[k.bot] || k.bot}`;
  const metin = k.metin ? `${bas}\n${k.metin}` : bas;
  const pm = k.parse_mode ? { parse_mode: k.parse_mode } : {};
  const medya = (k.medya || []).filter((m) => m && m.media).slice(0, 10);
  const kisa = metin.length <= 1024;
  const dugme = klavye && klavye.inline_keyboard && klavye.inline_keyboard.length ? { reply_markup: klavye } : {};
  if (medya.length > 1) {
    const r = await tg(env, "sendMediaGroup", { chat_id: patron(env), media: medya.map((m, i) => (i === 0 ? { ...m, caption: kisa && !dugme.reply_markup ? metin : bas, ...pm } : m)) });
    if (!r.ok) await tg(env, "sendMessage", { chat_id: patron(env), text: `${bas}: (görseller gösterilemedi: ${r.description || "?"})` });
    if (!kisa || dugme.reply_markup) return tg(env, "sendMessage", { chat_id: patron(env), text: (kisa || !k.metin ? metin : metin.slice(0, 4000)), disable_web_page_preview: true, ...pm, ...dugme });
    return r;
  }
  if (medya.length === 1) {
    const m = medya[0], metod = m.type === "video" ? "sendVideo" : m.type === "document" ? "sendDocument" : "sendPhoto", alan = m.type === "video" ? "video" : m.type === "document" ? "document" : "photo";
    const r = await tg(env, metod, { chat_id: patron(env), [alan]: m.media, caption: kisa ? metin : bas, ...pm, ...(kisa ? dugme : {}), ...(m.type === "video" ? { supports_streaming: true } : {}) });
    if (r.ok && kisa) return r;
  }
  return tg(env, "sendMessage", { chat_id: patron(env), text: String(metin).slice(0, 4000), disable_web_page_preview: true, ...pm, ...dugme });
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
// 11 Kasım (Patron): fiyat ANCAK gerçek bir tutar varsa sayılır ("$ 45", "45$", "45 usd"). Tek başına "$" işareti, "PRICE. $",
// "price / prix / fiyat" kelimesi fiyat DEĞİLDİR. Tutar model kodunun kendisi olamaz ("CODE 3529 $").
const FIYAT_TUTAR = /(?:\$|€|₺)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)(?!\d)|(?<![\d.,/-])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)\s?(?:\$|usd|eur|€|tl|₺)(?![a-z])/gi;
export function fiyatVar(yazi, kod = null) {
  for (const m of String(yazi || "").matchAll(FIYAT_TUTAR)) { const n = m[1] || m[2]; if (kod && String(n) === String(kod)) continue; return true; }
  return false;
}
async function modelMarkasiVenom(env, kod) {
  const kart = await env.KAYIT.get(`pelinboy:${kod}`, "json").catch(() => null);
  if (kart && ["BLACKROSE", "VOLONTE"].includes(kart.marka)) return { marka: kart.marka, renk: kart.renk || null };
  const b = env.STOK ? await stokIste(env, "/bilgi", { kod }).catch(() => null) : null;
  const m = [...new Set(((b && b.satirlar) || []).map((x) => String(x.magaza || "").toUpperCase().replace(/\s+/g, "")))];
  return { marka: m.length === 1 ? m[0] : null, renk: null };
}
export async function kanalSorunlari(env, yazi, kod) {
  const sorun = [];
  if (fiyatVar(yazi, kod)) sorun.push("yazıda FİYAT var");
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
  const uid = post.photo ? post.photo[post.photo.length - 1].file_unique_id : null;
  if (gid) { al = al || { ids: [], medya: [], yazi: "" }; al.ids.push(post.message_id); if (medya) al.medya.push(medya); if (uid) (al.uids = al.uids || []).push(uid); if (post.caption) al.yazi = post.caption; await kaydet(env, `venom:kanal:album:${gid}`, al, 3600); }
  const yazi = post.caption || post.text || "";
  if (!yazi && gid) return; // albümün yazısız parçası (yazılı parça kaydedilir)
  const kod = (String(yazi).match(/CODE[^0-9]{0,6}(\d{3,6})/i) || String(yazi).match(/\b(\d{3,6})\b/) || [])[1] || null;
  const sorunlar = await kanalSorunlari(env, yazi, kod);
  if (kod) { const u = [...new Set([uid, ...((al && al.uids) || [])].filter(Boolean))]; if (u.length) { const iz = await oku(env, "venom:fotoIz", {}); for (const x of u) iz[x] = kod; const k = Object.keys(iz); await kaydet(env, "venom:fotoIz", k.length > 3000 ? Object.fromEntries(k.slice(-3000).map((y) => [y, iz[y]])) : iz).catch(() => null); } }
  const kayit = { id: post.message_id, zaman: post.date || simdi, kod, medya: gid ? `albüm (${(al.medya || []).join("+") || "?"})` : medya || "yazı", imza: post.author_signature || null, yazi: String(yazi).slice(0, 300), sorunlar, duzenlendi: Boolean(duzenlendi) };
  const l = (await oku(env, "venom:kanal:son", [])).filter((x) => x.id !== kayit.id);
  await kaydet(env, "venom:kanal:son", [...l, kayit].slice(-300));
  if (sorunlar.length) {
    // 11 Kasım (Patron): aynı paylaşım için İKİNCİ uyarı yok; Venom SORMADAN düzeltir (Kemal yazıyı yerinde düzeltir), Patron'a sadece SONUÇ
    const uk = `venom:kanal:uyari:${post.message_id}`;
    if (await env.KAYIT.get(uk).catch(() => null)) return;
    await env.KAYIT.put(uk, String(simdi), { expirationTtl: 30 * 86400 }).catch(() => null);
    const link = kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${post.message_id}` : `#${post.message_id}`;
    if (!kod && sorunlar.some((s) => /F[İI]YAT/i.test(s))) { // 12 Kasım (Patron): elle yazılmış fiyatlı mesajı Venom KENDİSİ sildirir (tam o mesaj; komşu paylaşımlara dokunulmaz) — Patron'a sadece "silindi: mesaj no"
      const sl = await oku(env, "venom:kanalMesajSil", []);
      await kaydet(env, "venom:kanalMesajSil", [...sl, { kod: `Elle yazılmış fiyatlı mesaj (mesaj no ${post.message_id})`, ids: [post.message_id] }]);
      return;
    }
    const r = kod ? await botaSor(env, "kemal", "paylasimDuzelt", { kod, ids: [post.message_id], yerinde: true, kim: "Venom (kanal kontrolü)" }) : null;
    if (r && r.ok) { await cozdumYaz(env, `${kod} kanal yazısı`, simdi); await yaz(env, `🧹 Kanal: ${kod} paylaşımında sorun vardı (${sorunlar.join("; ")}) → Kemal yazıyı düzeltti.\nKanıt: ${link}`, { posta: { tur: "cevap", izin: "cevap" } }); }
    else await yaz(env, kod ? `⚠️ Kanalda sorun — ${kod}: ${sorunlar.join("; ")}\n${link}\nDüzeltilemedi, sebep: ${r ? r.hata || "Kemal düzeltemedi" : "Kemal'e ulaşılamadı"}. Kanalda duruyor.`
      : `⚠️ Kanalda elle yazılmış mesajda sorun (${sorunlar.join("; ")}): "${String(yazi).replace(/\s+/g, " ").slice(0, 160)}"\n${link}\nKemal düzeltemez: bu onun paylaşımı değil ve model kodu yok. Mesaj kanalda duruyor.`, { posta: { tur: "kritik" } });
  }
}

// ---------- Sohbet ----------
const SISTEM = `${VENOM_CEKIRDEK}
${BOT_YETENEKLERI}
Aşağıdaki HAFIZA Patron'un kalıcı kararlarıdır; her cevapta uygula.`;

// 10 Kasım (Sinem): Sami'nin fabrika kişilerinin sesli mesajı (bayt Sami'den gelir) → yazı. Ücret Venom'un sayacına yazılır.
export async function venomSesYazi(env, bayt, sure = 30) {
  if (!openaiVar(env) || !bayt) return null;
  const simdi = Math.floor(Date.now() / 1000);
  if ((await venomHarcanan(env, simdi)) >= (await venomSinir(env))) return null;
  const form = new FormData();
  form.append("model", env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "tr");
  form.append("file", new Blob([bayt], { type: "audio/ogg" }), "ses.ogg");
  const r = await openaiFetch(env, "/v1/audio/transcriptions", { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  await venomHarcamaYaz(env, Math.max(0.001, (Number(sure) || 30) / 60 * SES_DAKIKA_USD), simdi);
  return String(j.text || "").trim() || null;
}
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

// 11 Kasım (Patron): bir sohbet turunun KANITI — araçlar doldurur; son mesaj buna göre tek ve çelişkisiz yazılır
export const turKanit = (env) => (env.__tur = env.__tur || { yapamadi: [], kanit: [], sirada: [] });
// Patron'a "kontrol edeyim mi / yazayım mı" diye sorulmaz (kendisi yapar)
export const IZIN_SORUSU = /(?<![\p{L}])[\p{L}]{2,}(?:ey[iı]m|ay[ıi]m|eyim|ayım|yeyim|yayım) m[ıi]\s*\?|ister misin(?:iz)?\s*\?|istersen[^.\n?]*\?/iu;
// 11 Kasım (Patron): araç çalışmadan "hazır / yapıldı / gönderdim" denmez
export const YAPTIM_IDDIASI = /(?<![\p{L}])(haz[ıi]r(?:lad[ıi]m)?|olu[şs]turdum|g[öo]nderdim|ilettim|yapt[ıi]m|yap[ıi]ld[ıi]|d[üu]zeltildi|d[üu]zelttim|silindi|sildim|s[ıi]raya ald[ıi]m|verdim|a[çc]t[ıi]m|kaydettim|hallettim|halledildi|tamamland[ıi])(?![\p{L}])/iu;
export const anladimSil = (m) => String(m || "").replace(/^\s*🧭?\s*Anlad[ıi]m\s*[:,][^\n]*\n+/i, "").trim();
const doluSatir = (m) => String(m || "").split("\n").filter((x) => x.trim()).length;
const BASARI_IDDIASI = /d[üu]zeltildi|tamamland[ıi]|yap[ıi]ld[ıi]|halledildi|hallettim|silindi|payla[şs][ıi]ld[ıi]|yerine (koyuldu|kondu)|verdim/i;
// Son mesaj kapısı: bot yapamadı + kanıt yok → "düzeltildi" denemez; kanıt varsa kanıt yazılır; sıradaki iş "tamam" sayılmaz
export function tekMesajKapisi(metin, t) {
  if (!t || (!t.yapamadi.length && !t.kanit.length && !t.sirada.length)) return metin;
  const kanitSatiri = t.kanit.length ? `Kanıt: ${t.kanit.join(" · ")}` : "";
  const siraSatiri = t.sirada.length ? `Sırada: ${t.sirada.join(" · ")}. Paylaşılınca mesaj numarasıyla yazacağım.` : "";
  if (!t.kanit.length && !t.sirada.length) return `Yapılamadı, sebep: ${t.yapamadi.join(" · ").slice(0, 400).replace(/[.\s]+$/, "")}.`;
  if (!t.kanit.length && BASARI_IDDIASI.test(metin)) return [`Henüz tamam değil.`, siraSatiri, t.yapamadi.length ? `Yapılamayan: ${t.yapamadi.join(" · ").slice(0, 300)}` : ""].filter(Boolean).join("\n");
  return [metin.trim(), kanitSatiri, siraSatiri].filter(Boolean).join("\n");
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
  if (!env.__kuru) await kaydet(env, "venom:sonPatronMetni", { metin: String(metin).slice(0, 500), zaman: simdi }, 86400).catch(() => null); // "Pelin video" düğmesi buna bakar
  env.__sohbette = true; // 9 Kasım: bu sırada açılan kartlar Patron'un kendi isteği → hemen gider (tavana sayılmaz)
  if (!claudeVar(env)) return yaz(env, "Yapay zekâ anahtarı bağlı değil (Claude Code'a haber verin).");
  const client = claudeIstemci(env, { maxRetries: 1, timeout: 60_000 });
  let cevapMetni = "";
  // 5 Kasım: sistem metni konuşma boyunca SABİT (araç hafızayı değiştirse bile) — değişirse Claude'un düşünme bloğu geçersiz sayılıyordu (400)
  const sonBot = await oku(env, "venom:bot:sonBot", null);
  const sistem = [{ type: "text", text: `${await kitapOku(env, "venom", simdi)}\n\n${await derslerOku(env, simdi)}` }, { type: "text", text: SISTEM }, { type: "text", text: await hafizaMetni(env), cache_control: { type: "ephemeral" } }, { type: "text", text: `Şimdi: ${tarihSaat(simdi)} (İstanbul).${sonBot && simdi - sonBot.zaman < 1800 ? `\nSON BOT MESAJI (${Math.round((simdi - sonBot.zaman) / 60)} dk önce, ${BOT_AD[sonBot.bot] || sonBot.bot}): "${sonBot.metin}". Bu mesaj Patron'dan yazı bekliyorsa (ör. "nasıl düzelteyim, yazın") ve Patron'un yeni mesajı ona cevapsa, bota_yaz ile AYNEN ${sonBot.bot} botuna ilet.` : ""}` }];
  env.__tur = { yapamadi: [], kanit: [], sirada: [] };
  if (!env.__kuru) await env.KAYIT.put("venom:sohbetAktif", String(simdi), { expirationTtl: 120 }).catch(() => null);
  let izinNudge = false, aracNudge = false, aracSayisi = 0;
  for (let tur = 0; tur < 7; tur++) {
    const model = env.VENOM_MODEL || MODEL;
    const r = await claudeTur(client, { model, max_tokens: 6000, system: sistem, tools: ARACLAR, output_config: { effort: "medium" }, messages: mesajlar });
    await venomHarcamaYaz(env, claudeUsd(model, r.usage), simdi);
    const yazi = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (yazi) cevapMetni = yazi;
    const kullan = r.content.filter((b) => b.type === "tool_use");
    if ((r.stop_reason !== "tool_use" || !kullan.length) && yazi && IZIN_SORUSU.test(yazi) && !izinNudge && tur < 5) { // 11 Kasım: sorma, yap
      izinNudge = true;
      mesajlar.push({ role: "assistant", content: r.content }, { role: "user", content: "(Sistem) Patron'a izin sorma. Araçlarla şimdi kendin kontrol et / yap ve sonucu TEK mesajla bildir." });
      continue;
    }
    if ((r.stop_reason !== "tool_use" || !kullan.length) && yazi && !aracSayisi && !aracNudge && tur < 6 && (YAPTIM_IDDIASI.test(yazi) || /\d{2,}/.test(yazi))) { // 12 Kasım: araç çalışmadan "yapıldı" denmez, sayı / model durumu HAFIZADAN söylenmez
      aracNudge = true;
      mesajlar.push({ role: "assistant", content: r.content }, { role: "user", content: "(Sistem) Bu turda hiçbir araç ÇALIŞMADI. Sayı, model durumu ya da \"hazır / yapıldı / gönderdim\" hafızadan söylenmez: doğru aracı şimdi çalıştır ve cevabı onun sonucundan yaz. Gerçekten araç gerekmiyorsa (selam, teşekkür) aynı cevabı sayısız yaz." });
      continue;
    }
    if (r.stop_reason !== "tool_use" || !kullan.length) break;
    aracSayisi += kullan.length;
    mesajlar.push({ role: "assistant", content: r.content });
    const sonuclar = [];
    for (const a of kullan) {
      let s;
      env.__llmArac = true; // araç yapay zekâ turunda çağrıldı (cevabı Venom yazar; araç Patron'a ayrıca yazmaz)
      try { s = await aracCalistir(env, a.name, a.input || {}, simdi); } catch (e) { await hataYaz(env, `arac:${a.name}`, e); s = "Bu iş şu an yapılamadı (hata Claude Code'a iletildi)."; }
      sonuclar.push({ type: "tool_result", tool_use_id: a.id, content: s });
    }
    mesajlar.push({ role: "user", content: sonuclar });
  }
  // 6 Kasım (D10): araç kullanmadan netleştirme sorusu sorduysa → "anlamadıklarım"
  if (cevapMetni && !mesajlar.some((x) => Array.isArray(x.content) && x.content.some((b) => b.type === "tool_use")) && /\?/.test(cevapMetni) && /anlamad|emin de[ğg]il|hangisi|hangi[^\n]*\?|ne demek|a[çc]ar m[ıi]s[ıi]n|tam olarak ne/i.test(cevapMetni)) await anlamadimKaydet(env, metin, "netleştirme sorusu sordum", simdi);
  if (cevapMetni) cevapMetni = anladimSil(cevapMetni) || cevapMetni; // 11 Kasım: Patron'un sözünü tekrar eden "Anladım: …" satırı yok
  if (cevapMetni && !aracSayisi && aracNudge && YAPTIM_IDDIASI.test(cevapMetni)) cevapMetni = "Yapılamadı: bu iş için araç çalışmadı, o yüzden \"yapıldı\" demiyorum. İsteği bir kez daha, kısa yazın (ör. \"Merdan'a söyle …\", \"3512 sil\").";
  if (cevapMetni) cevapMetni = tabloyuListeyeCevir(cevapMetni); // 6 Kasım: Telegram'da tablo yok
  if (cevapMetni) cevapMetni = tekMesajKapisi(cevapMetni, env.__tur); // 11 Kasım: çelişkili mesaj yasak
  if (cevapMetni && IZIN_SORUSU.test(cevapMetni)) cevapMetni = cevapMetni.split("\n").map((s) => s.replace(/[^.!\n?]*(?:ey[iı]m|ay[ıi]m|yeyim|yayım) m[ıi]\s*\?|[^.!\n?]*ister misin(?:iz)?\s*\?|[^.!\n?]*istersen[^.\n?]*\?/giu, "").trim()).filter(Boolean).join("\n").trim() || cevapMetni; // son çare: izin sorusu cümlesi atılır
  if (env.__tur && env.__tur.sus && !env.__kuru) cevapMetni = ""; // araç sonucu Patron'a zaten yazdı (kart / tek satır): ikinci mesaj yok
  if (cevapMetni) await yaz(env, cevapMetni);
  if (cevapMetni && !env.__kuru) await sozKaydet(env, env.__tur, metin, simdi).catch(() => null); // 12 Kasım: "sıraya alındı" denen iş takip edilir
  if (env.__kuru) { env.__sohbette = false; return cevapMetni; }
  await kaydet(env, "venom:bot:sohbet", [...gecmis, { role: "user", content: girdi.slice(0, 1500) }, { role: "assistant", content: (cevapMetni || "…").slice(0, 1500) }].slice(-20), 7 * 86400);
  await env.KAYIT.delete("venom:sohbetAktif").catch(() => null);
  env.__sohbette = false;
}

// 6 Kasım: Patron'un mesajı hata yüzünden cevapsız kalırsa SESSİZ kalınmaz — kısa bilgi + kayıt (venom:bot:cevapsiz, akşam raporu)
export async function cevapsizBildir(env, u) {
  const m = u && u.message;
  if (!m || !m.from || m.chat.type !== "private" || !patronMu(env, m.from.id)) return;
  const simdi = Math.floor(Date.now() / 1000), metin = String(m.text || m.caption || (m.voice ? "(sesli mesaj)" : "(dosya)")).slice(0, 200);
  const l = await oku(env, "venom:bot:cevapsiz", []);
  await kaydet(env, "venom:bot:cevapsiz", [...l, { zaman: simdi, metin }].slice(-20), 7 * 86400).catch(() => null);
  await tg(env, "sendMessage", { chat_id: patron(env), text: `⚠️ Son mesajınıza cevap veremedim (teknik hata, Claude Code'a kaydedildi): "${metin.slice(0, 80)}". Lütfen bir kez daha yazın.` });
}
export async function guncelleme(u, env) {
  const simdi = Math.floor(Date.now() / 1000);
  // Telegram aynı güncellemeyi tekrar gönderirse (geç cevap) iş iki kez yapılmasın
  if (u.update_id != null && !(await ilkKezMi(env, u.update_id))) return;
  if (u.callback_query) return dugme(patronMu(env, u.callback_query.from && u.callback_query.from.id) ? { ...env, __izin: "cevap" } : env, u.callback_query, simdi);
  if (u.channel_post || u.edited_channel_post) return kanalIzle(env, u.channel_post || u.edited_channel_post, Boolean(u.edited_channel_post), simdi).catch((e) => hataYaz(env, "kanal", e));
  const m = u.message;
  if (!m || !m.from || m.chat.type !== "private" || !patronMu(env, m.from.id)) return; // sadece Patron
  env = { ...env, __izin: "cevap" }; // 9 Kasım (sert müdür A): Patron'un kendi mesajına verilen her cevap "cevap" etiketli
  { // 9 Kasım (sert müdür C): "📝 Karar yaz" sonrası Patron'un yazdığı = Patron kararı
    const kb = m.text && !m.text.startsWith("/") ? await oku(env, "venom:kararBekle", null) : null;
    if (kb) { await env.KAYIT.delete("venom:kararBekle").catch(() => null); const g = await patronKarari(env, kb.gid, m.text, simdi); return yaz(env, g ? `Kaydettim: "Patron kararı". Hemra ve Merdan'a gönderdim, uygulanmasını takip edeceğim.` : "Bu görev artık yok; kararı genel hafızaya yazmamı isterseniz tekrar söyleyin."); }
  }
  let metin = m.text || m.caption || "";
  // 5 Kasım: fotoğraf/video → son 1 saatin medya listesi (Kemal paylaşımı için)
  const dosya = m.photo ? { tur: "foto", file_id: m.photo[m.photo.length - 1].file_id } : m.video ? { tur: "video", file_id: m.video.file_id } : m.document && /^(image|video)\//.test(m.document.mime_type || "") ? { tur: /^video/.test(m.document.mime_type) ? "video" : "foto", file_id: m.document.file_id } : null;
  if (dosya) {
    const l = await oku(env, "venom:bot:medya", []);
    await kaydet(env, "venom:bot:medya", [...l, { ...dosya, zaman: simdi }].slice(-10), 3 * 3600);
    const fotoBilgi = { file_id: dosya.file_id, uid: (m.photo ? m.photo[m.photo.length - 1].file_unique_id : (m.video || m.document || {}).file_unique_id) || null, fwdChat: (m.forward_origin && m.forward_origin.chat && m.forward_origin.chat.id) || (m.forward_from_chat && m.forward_from_chat.id) || null, fwdMsg: (m.forward_origin && m.forward_origin.message_id) || m.forward_from_message_id || null, caption: String(m.caption || "").slice(0, 300) };
    if (metin.trim() && fotoSorusuMu(metin)) return fotoModelBul(env, fotoBilgi, simdi); // 9 Kasım: "bu kaç adet?" (kodsuz fotoğraf)
    if (!metin.trim()) { // 6 Kasım (D8): açıklamasız dosya → tek soru, 3 düğme (9 Kasım: + 📦 Hangi model?)
      if (m.media_group_id && l.some((x) => simdi - x.zaman < 5)) return;
      const rid = kisaId();
      await kaydet(env, "venom:bot:medyaSoru", { rid, zaman: simdi, foto: fotoBilgi }, 3 * 3600).catch(() => null);
      return tg(env, "sendMessage", { chat_id: patron(env), text: `📎 Aldım (${l.length + 1} dosya). Ne yapayım Patron?`, reply_markup: { inline_keyboard: [[{ text: "🎬 Pelin kullansın", callback_data: `vm:${rid}:p` }, { text: "📣 Paylaş", callback_data: `vm:${rid}:k` }], [{ text: "💾 Sadece kaydet", callback_data: `vm:${rid}:s` }, { text: "📦 Hangi model / stok?", callback_data: `vm:${rid}:m` }]] } });
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
  // 6 Kasım: sabit düğmeler (ilk mesajda bir kez kurulur) + durdur/aç + sesli rapor
  if (!(await env.KAYIT.get("venom:bot:klavye:v1"))) { await env.KAYIT.put("venom:bot:klavye:v1", "1").catch(() => null); await tg(env, "sendMessage", { chat_id: patron(env), text: "Sabit düğmeler hazır: 📋 Bekleyenler · 📊 Bugün ne oldu · ⛔ Durdur", reply_markup: SABIT_KLAVYE }); }
  // 12 Kasım (Patron, KÖKTEN YENİDEN YAPILANMA): BEYİN KARAR VERİR, KOD DEĞİL. Patron'un yazdığı her mesaj doğrudan yapay zekâya (Opus)
  // gider. Kelimeye bakıp hazır cevap veren kestirme, model koduna hazır kart, "hayır" kestirmesi, otomatik "not ettim" YOK.
  // Kod sadece şunlara bakar: sabit klavye DÜĞMELERİ (tam yazı) ve "/" ile başlayan komutlar.
  const sabitCevap = await sabitKomut(env, metin, simdi);
  if (sabitCevap) return sabitCevap === true ? null : yaz(env, sabitCevap);
  if (String(m.text || "").trim().startsWith("/")) {
    const pk = await postaKomut(env, m, metin, simdi); // /kurallarım, /detay
    if (pk) return pk === true ? null : yaz(env, pk);
    const rl = String(m.text || "").trim().match(/^\/rol\s+(\S+)\s+(fiyat|stok|fabrika|celal|sil|çıkar)\b/i);
    if (rl) return yaz(env, await rolDegistir(env, rl[1], rl[2].toLocaleLowerCase("tr"), simdi));
    if (/^\/ekip\b/i.test(String(m.text || "").trim())) return yaz(env, await ekipMetni(env));
    if (/^\/start\b/.test(metin)) return yaz(env, "Merhaba Patron, ben Venom. Ne istediğinizi normal yazın ya da sesli söyleyin.");
  }
  await tg(env, "sendChatAction", { chat_id: patron(env), action: "typing" });
  env.__mesaj = m; // yanıtlanan mesajı kullanan araçlar için (bildirim_kurali)
  return sohbet(env, metin, simdi);
}

// ---------- 13 Kasım (Patron): İŞ BEKÇİSİ — her gün 11:00, 15:00, 19:00: İŞ yapıldı mı? ----------
// Önce Venom çözer (onay bekleyene hatırlatma; öneri kalmadıysa Kemal'i çalıştırır); çözülemeyen Patron'a TEK satır (aynı sebep günde bir kez).
// kuru: hiçbir şey göndermez, kaydetmez (rapor / sohbet / deneme). KV "venom:isBekcisi:sessiz" = gün → o gün sadece kayıt (mesaj / kart yok).
const sonMesaiGunu = (simdi) => { for (let i = 1; i <= 3; i++) { const t = simdi - i * 86400; if (new Date((t + SAAT_FARKI) * 1000).getUTCDay() !== 0) return gunAnahtari(t); } return gunAnahtari(simdi - 86400); };
async function bekciDun(env, simdi) {
  const g = sonMesaiGunu(simdi);
  const ayar = async (k) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? null : JSON.parse(v); };
  try {
    const listeler = [];
    for (const [ek, ad] of [["", "VOLONTE"], ["-BR", "Black Rose"]]) {
      const x = await ayar(`fabrika:${g}${ek}`);
      if (x && !x.deneme && !x.mod && !x.birlesik) listeler.push({ ad, asama: x.asama, model: (x.modeller || []).length });
    }
    for (const k of (await ayar(`fabrika:birlesik:${g}`)) || []) {
      const b = await ayar(`fabrika:${k}`);
      if (b && !b.deneme && !b.mod && (b.liste || []).length) listeler.push({ ad: b.magaza === "BLACKROSE" ? "Black Rose" : b.magaza === "VOLONTE" ? "VOLONTE" : "birleşik liste", asama: b.asama, model: (b.liste || []).length });
    }
    const gv = await gunVerisi(env, g).catch(() => null);
    const satis = {};
    for (const m of ["VOLONTE", "BLACKROSE"]) { const x = await stokIste(env, "/satis-sayim", { gun: g, magaza: m }).catch(() => null); satis[m] = x && x.toplam != null ? x.toplam : 0; }
    return { gun: g, mesai: true, listeler, giden: gv ? gv.fabrika.VOLONTE.length + gv.fabrika.BLACKROSE.length : 0, satis };
  } catch { return null; }
}
export async function isBekcisi(env, simdi, { kuru = false } = {}) {
  const gun = gunAnahtari(simdi), s = saat(simdi);
  const dur = await oku(env, "venom:dur", null);
  const durdu = (b) => Boolean(dur && (dur.hepsi || dur[b]));
  const kayit = (await oku(env, `venom:isBekcisi:${gun}`, null)) || {};
  const onceki = Object.entries(kayit).filter(([a]) => /^\d+$/.test(a)).map(([, v]) => v);
  const sessiz = kuru || (await oku(env, "venom:isBekcisi:sessiz", null)) === gun;
  const k = { zaman: simdi, sessiz: sessiz && !kuru ? true : undefined };
  k.kemal = durdu("kemal") ? { ok: true, durdu: true } : kemalBak({ ozet: await botaSor(env, "kemal", "ozet"), gun, s, simdi, mesai: mesaiMi(simdi), onceHatirlatti: onceki.some((x) => x.kemal && x.kemal.hatirlatti) });
  k.selin = durdu("selin") ? { ok: true, durdu: true } : selinBak({ ozet: await botaSor(env, "selin", "ozet"), s });
  k.sami = durdu("sami") ? { ok: true, durdu: true } : samiBak({ dun: await bekciDun(env, simdi), s });
  // 1) Venom önce kendisi çözer
  if (!sessiz && !k.kemal.ok && k.kemal.cozum === "hatirlat") {
    const r = await botaSor(env, "kemal", "hatirlat");
    if (r && r.ok && r.n) { k.kemal.hatirlatti = true; k.kemal.cozuldu = `onay bekleyen ${r.n} karta hatırlatma gitti`; await cozdumYaz(env, `Kemal'in onay bekleyen ${r.n} kartına hatırlatma`, simdi); }
    else k.kemal.cozum = null;
  } else if (!sessiz && !k.kemal.ok && k.kemal.cozum === "calistir") {
    const r = await botaSor(env, "kemal", "calistir", { enAzGun: 0 });
    if (r && r.ok && r.n) { k.kemal.cozuldu = `Kemal'i çalıştırdım: ${r.n} yeni model Hemra'nın onayına gitti`; await cozdumYaz(env, `Kemal'in önerisi kalmamıştı, çalıştırdım (${r.n} model onayda)`, simdi); await isKaydet(env, "kemal", `İş bekçisi Kemal'i çalıştırdı: ${r.n} model Hemra'nın onayında (${(r.kodlar || []).join(", ")})`, simdi).catch(() => null); }
    else { k.kemal.cozum = null; k.kemal.sebep = `${k.kemal.sebep}; Kemal'i çalıştırdım, yeni öneri çıkmadı${r && r.neden ? ` (${r.neden})` : r && r.hata ? ` (${r.hata})` : ""}`; k.kemal.oneri = "yeni fotoğraf gelmesi gerekiyor (Merdan'ın fotoğraf listesi)"; }
  }
  // 2) çözülemeyen → Patron'a TEK satır (bot + sebep türü günde bir kez)
  const gitti = kayit.patron || {};
  const satirlar = [];
  for (const b of ["kemal", "selin", "sami"]) {
    const r = k[b];
    if (r.ok || r.cozum || r.cozuldu) continue;
    const iz = `${b}:${String(r.sebep).replace(/\d+/g, "#").slice(0, 60)}`;
    if (gitti[iz]) continue;
    satirlar.push(patronSatiri(b, r)); if (!sessiz) gitti[iz] = simdi;
  }
  k.eksik = ["kemal", "selin", "sami"].filter((b) => !k[b].ok).map((b) => eksikYazi(b, k[b]));
  k.patron = satirlar.length ? satirlar.join("\n") : null;
  if (kuru) return k;
  if (satirlar.length && !sessiz) await bildir(env, satirlar.join("\n"), { simdi, kaynak: "venom", tur: "kritik" });
  kayit[String(Math.floor(s))] = k; kayit.patron = gitti;
  await kaydet(env, `venom:isBekcisi:${gun}`, kayit, 14 * 86400);
  return k;
}
async function isBekcisiAdimi(env, simdi) {
  const s = saat(simdi), h = BEKCI_SAATLERI.find((x) => s >= x && s < x + 0.5);
  if (h == null || !(env[BOT_BAG.kemal] && env[BOT_BAG.selin])) return; // botlara bağlı değilse (deneme ortamı) bekçi çalışmaz
  const kayit = await oku(env, `venom:isBekcisi:${gunAnahtari(simdi)}`, null);
  if (kayit && kayit[String(h)]) return;
  await isBekcisi(env, simdi);
}
// Raporun durum satırı: o günün SON iş kontrolünde eksik kalanlar (yoksa null); kontrol hiç yapılmadıysa undefined
async function bekciEksikleri(env, gun) {
  const kayit = await oku(env, `venom:isBekcisi:${gun}`, null);
  const l = kayit ? Object.entries(kayit).filter(([a]) => /^\d+$/.test(a)).sort((a, b) => Number(a[0]) - Number(b[0])) : [];
  return l.length ? l[l.length - 1][1].eksik || [] : undefined;
}
// ---------- 5 dakikalık görev ----------
export async function venomCron(env, simdi) {
  await webhookKur(env);
  // Kemal toplu raporu grup yerine Venom'a bırakır. 6 Kasım: 20 dakikada bir yazılır (önceden her 5 dk: günde 288 KV yazması)
  const aktif = Number(await env.KAYIT.get("venom:bot:aktif").catch(() => 0)) || 0;
  if (simdi - aktif > 1200) await env.KAYIT.put("venom:bot:aktif", String(simdi), { expirationTtl: 1800 }).catch(() => null);
  // 10 Kasım (Patron): eksik listesi fabrikaya ulaşınca TEK satır ("Bugünkü eksik listesi fabrikaya gitti: VOLONTE X model, Black Rose Y model.")
  for (const f of await kuyruguAl(env, "fabrikaGitti")) {
    const r = await yaz({ ...env, __izin: "cevap" }, f.metin, { posta: { kaynak: "sami", tur: "cevap", izin: "cevap" } }).catch(() => null);
    await kaydet(env, "venom:fabrikaGittiKanit", { zaman: simdi, metin: f.metin, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null }, 7 * 86400).catch(() => null);
  }
  // 11 Kasım (Patron): deneme zinciri — gecikende Venom kişiye (Merdan/Aziz/Hemra) yazar; Patron'a sadece sonuç (Sami takip eder)
  for (const h of await kuyruguAl(env, "zincirHatirlat")) {
    await kuyrugaEkle(env, "giden", { id: `zh-${h.id}`, kime: h.ad, metin: String(h.metin).slice(0, 4000), tur: "mesaj" }).catch(() => null); // ekip Sami'ye yazar → Sami üzerinden (kanıt: arşiv "venom-gitti")
  }
  for (const z of await kuyruguAl(env, "zincirSonuc")) {
    const r = await yaz({ ...env, __izin: "cevap" }, z.metin, { posta: { kaynak: "sami", tur: "cevap", izin: "cevap" } }).catch(() => null);
    await kaydet(env, `venom:zincirKanit:${z.id}`, { zaman: simdi, metin: z.metin, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null }, 3 * 86400).catch(() => null);
  }
  // 11 Kasım: Claude Code'un bir kerelik işleri — KV "venom:claudeIslem" = [{tur:"testMesaj", metin} | {tur:"kopruOku"}] → "venom:claudeIslemSonuc"
  try { await claudeIslemAdimi(env, simdi); } catch (e) { await hataYaz(env, "claudeIslem", e); }
  try { await rkAdimi(env, simdi); } catch (e) { await hataYaz(env, "repeteKart", e); }
  try { await kartCevapsizAdimi(env, simdi); } catch (e) { await hataYaz(env, "kartCevapsiz", e); }
  try { await isBekcisiAdimi(env, simdi); } catch (e) { await hataYaz(env, "isBekcisi", e); } // 13 Kasım (Patron): 11:00, 15:00, 19:00 — iş yapıldı mı
  if (Math.floor(simdi / 300) % 6 === 0) try { await kartKapanisAdimi(env, simdi); } catch (e) { await hataYaz(env, "kartKapanis", e); } // 13 Kasım: yarım saatte bir — onaylanan kartın kapanışı // 11 Kasım (kural 54) // 11 Kasım: repete kartı (Patron kartı + tek satır sonuç)
  // Diğer botların sonuçları → "✅ yapıldı"
  for (const s of await kuyruguAl(env, "sonuc")) {
    { const sl = await oku(env, "venom:sozler", []); const sz = sl.find((x) => !x.bitti && x.tur === "mesaj" && String(x.id) === String(s.isId || s.id).split(":")[0]); if (sz) { sz.bitti = simdi; await kaydet(env, "venom:sozler", sl, 14 * 86400); await yaz({ ...env, __izin: "cevap" }, `${s.ok ? "✅" : "⚠️"} ${s.aciklama} (${zamanKisa(simdi)})`, { posta: { kaynak: "venom", tur: "cevap", izin: "cevap" } }); continue; } }
    if (s.ok && /^(Mesaj|Hatırlatma) .* gitti \(Sami\)\.?$/.test(String(s.aciklama || ""))) continue; /* 10 Kasım: "Mesaj X'e gitti" özete girmez */ await bildir(env, `${s.ok ? "✅" : "⚠️"} ${s.aciklama}`, { simdi, kaynak: /^(pp|kys|kms|kv|kid)-/.test(String(s.id || "")) ? "kemal" : "venom", tur: "bilgi" }); if (/^(pp|kys|kms|kv)-/.test(String(s.id || ""))) await isCevap(env, "kemal", simdi).catch(() => null); }
  try { await paylasimGonder(env, simdi); } catch (e) { await hataYaz(env, "paylas", e); }
  // 9 Kasım (sert müdür): görevler (Hemra + Merdan), çözüm kuyruğu, bota verilen emirlerin kontrolü
  try { await gorevAdimi(env, simdi, mudurAraclari(env, simdi)); } catch (e) { await hataYaz(env, "gorev", e); }
  try { await cozumAdimi(env, simdi, mudurAraclari(env, simdi)); } catch (e) { await hataYaz(env, "cozum", e); }
  try { await emirAdimi(env, simdi); } catch (e) { await hataYaz(env, "emir", e); }
  try { await sozAdimi(env, simdi); } catch (e) { await hataYaz(env, "soz", e); } // 12 Kasım (D14): söz takibi
  // 9 Kasım (ekip düzeni): Hemra'nın seçimleri her çalışmada; toplu liste hafta içi 11:00 ve 16:00
  try { await hemraKararAdimi(env, simdi, hemraAraclari(env, simdi)); } catch (e) { await hataYaz(env, "hemraKarar", e); }
  // 11 Kasım (TEK DEFTER): 30 dakikada bir — her iş tek satır; cevaplanan / yinelenen / eski kartlar kökten kapanır, Hemra listesi buna göre düşer
  if (Math.floor(simdi / 300) % 6 === 0) { try { const df = await defterOku(env, simdi, { venom: true }); await listeyiTemizle(env, simdi, df); } catch (e) { await hataYaz(env, "tekDefter", e); } }
  for (const h of LISTE_SAATLERI) if (saat(simdi) >= h && saat(simdi) < h + 1 && (await ilkKezBugun(env, `hemraListe:${h}:${gunAnahtari(simdi)}`))) { try { await hemraListesiGonder(env, simdi, { defter: await defterOku(env, simdi, { venom: true }), biriktir: (m) => biriktir(env, { kaynak: "venom", metin: m, tur: "bilgi" }, simdi) }); } catch (e) { await hataYaz(env, "hemraListe", e); } }
  try { if (await env.KAYIT.get("venom:hemraDagit")) { await env.KAYIT.delete("venom:hemraDagit"); await kaydet(env, "venom:hemraDagitSonuc", { zaman: simdi, sonuc: await hemraDagit(env, simdi) }, 7 * 86400); } } catch (e) { await hataYaz(env, "hemraDagit", e); }
  try { if (await env.KAYIT.get("venom:ilkGorevler")) { await env.KAYIT.delete("venom:ilkGorevler"); await kaydet(env, "venom:ilkGorevlerSonuc", { zaman: simdi, sonuc: await ilkGorevler(env, simdi) }, 7 * 86400); } } catch (e) { await hataYaz(env, "ilkGorevler", e); }
  // Tek seferlik (Claude Code, 5 Kasım): KV "venom:pelinFotoIlet" = pelin_foto_kaydet girdisi → sonuç Patron'a (İLETİLDİ/İLETİLMEDİ)
  try { const t = await oku(env, "venom:pelinFotoIlet", null); if (t) { await env.KAYIT.delete("venom:pelinFotoIlet"); await yaz({ ...env, __izin: "cevap" }, await pelinFotoIlet({ ...env, __izin: "cevap" }, t, simdi, async () => {})); } } catch (e) { await hataYaz(env, "pelinFotoIlet", e); }
  // 6 Kasım (Claude Code hazırlar): KV "venom:temizlikKart" = { metin, kanalSil: [{ kod, ids, not }], siteKaldir: [...] } → Patron onay kartı
  try { const t = await oku(env, "venom:temizlikKart", null); if (t) { await env.KAYIT.delete("venom:temizlikKart"); if ((t.kanalDuzelt || []).length) await kartAc(env, { tur: "imzaDuzelt", kanalDuzelt: t.kanalDuzelt }, t.metin, simdi); else if ((t.kanalSil || []).length || (t.siteKaldir || []).length) await kartAc(env, { tur: "temizlik", kanalSil: t.kanalSil || [], siteKaldir: t.siteKaldir || [] }, t.metin, simdi); else await yaz(env, t.metin); } } catch (e) { await hataYaz(env, "temizlikKart", e); }
  // 6 Kasım (B3): KV "venom:kemalPaylasElle" = { kod, renk, beden, liste } → Patron'un istediği paylaşım (duraklatma dışı, açık istek) → yeni SON YAYIN kartı
  try { const t = await oku(env, "venom:kemalPaylasElle", null); if (t) { await env.KAYIT.delete("venom:kemalPaylasElle"); const ok = await kemaleVer(env, { kod: t.kod, renk: t.renk || null, beden: t.beden || null }, t.liste || [], simdi); await yaz({ ...env, __izin: "cevap" }, ok ? `🧭 ${t.kod} ${t.renk || ""} → Kemal'e yeni SON YAYIN kartı hazırlatılıyor (alt yazı ${renkDilleri(t.renk || "") ? renkDilleri(t.renk).en : "model kartı"}${t.beden ? `, ${BEDEN_AD[t.beden]}` : ""}, ${(t.liste || []).length} dosya). Kart Venom kontrolüyle buraya gelecek.` : `❌ ${t.kod}: Kemal'e iş gönderilemedi.`); } } catch (e) { await hataYaz(env, "paylasElle", e); }
  try { const rs = await oku(env, "venom:siteRenkSonuc", null); if (rs) { await env.KAYIT.delete("venom:siteRenkSonuc"); await bildir(env, `🤖 Selin\n${[].concat(rs).join("\n")}`, { simdi, kaynak: "selin", tur: "bilgi" }); } } catch (e) { await hataYaz(env, "siteRenk", e); }
  try { await onayAktar(env, simdi); } catch (e) { await hataYaz(env, "onayAktar", e); }
  try { await bittiOneriAdimi(env, simdi); } catch (e) { await hataYaz(env, "bittiOneri", e); } // 10 Kasım: Hemra önerisi → Patron kartı
  // 10 Kasım (Patron): PARA ALARMI — Kemal/Selin günlük 2 $ tavanı (%80 uyarı), her bot için olağanın 3 katı → anında uyarı
  if (new Date(simdi * 1000).getUTCMinutes() < 5 || saat(simdi) < 0.2) { try { await paraAlarmi(env, simdi); } catch (e) { await hataYaz(env, "paraAlarmi", e); } }
  // 9 Kasım (Patron): Higgsfield / fal bakiyesi 5 $ altına inince ÖNCEDEN uyar (günde bir; üretim yarıda kalmasın)
  if (saat(simdi) >= 9 && saat(simdi) < 21 && new Date(simdi * 1000).getUTCMinutes() < 5) { try { await bakiyeUyarisi(env, simdi); } catch (e) { await hataYaz(env, "bakiye", e); } }
  // Bir kez (Claude Code): KV "venom:kisiMesajlari" = "<ad>" → bugün o kişiye giden her şey (zaman, bot, tür, özet) → "venom:kisiMesajlariSonuc"
  try { const km = await env.KAYIT.get("venom:kisiMesajlari"); if (km) { await env.KAYIT.delete("venom:kisiMesajlari"); const adlar = await kisiAdlari(env); const e2 = { ...env, __adlar: adlar }; const [b, s2] = donemAraligi(simdi, "bugün"); const r = (await stokIste(env, "/isd-oku", { basla: b, bitis: s2 }).catch(() => [])) || []; await kaydet(env, "venom:kisiMesajlariSonuc", { zaman: simdi, ad: km, l: r.filter((x) => defterKisi(e2, x.kime) === km).map((x) => ({ saat: tarihSaat(x.zaman).slice(11, 16), bot: x.bot, tur: x.tur, ozet: String(x.ozet || "").slice(0, 120) })) }, 7200); } } catch (e) { await hataYaz(env, "kisiMesajlari", e); }
  try { if (await env.KAYIT.get("venom:defterDoldur")) { await env.KAYIT.delete("venom:defterDoldur"); await kaydet(env, "venom:defterDoldurSonuc", { zaman: simdi, sonuc: await defterDoldur(env, simdi) }, 7 * 86400); } } catch (e) { await hataYaz(env, "defterDoldur", e); }
  // 9 Kasım (Claude Code): KV "venom:soruDeneme" = ["Sinem bugün …?", …] → defter cevapları KV "venom:soruDenemeSonuc" (Patron'a gitmez)
  try { const sd = await oku(env, "venom:soruDeneme", null); if (sd) { await env.KAYIT.delete("venom:soruDeneme"); const c = []; for (const q of [].concat(sd).slice(0, 5)) { const bs2 = botSorusu(q); c.push({ soru: q, cevap: (await kisiCevabiMetni(env, q, simdi)) || (bs2 ? (await Promise.all(bs2.botlar.map((b) => botRaporuMetni(env, b, bs2.gun, simdi)))).join("\n\n") : "(bot / kişi sorusu değil)") }); } await kaydet(env, "venom:soruDenemeSonuc", { zaman: simdi, c }, 7200); } } catch (e) { await hataYaz(env, "soruDeneme", e); }
  // 9 Kasım (Claude Code): KV "venom:defterDeneme" → herkes raporu KV "venom:defterDenemeSonuc" (Patron'a gitmez)
  try { if (await env.KAYIT.get("venom:defterDeneme")) { await env.KAYIT.delete("venom:defterDeneme"); const { satirlar, canlilar } = await defterVerisi(env, simdi, "bugün"); await kaydet(env, "venom:defterDenemeSonuc", { zaman: simdi, kayit: satirlar.length, metin: herkesCevabi(env, satirlar, canlilar, { gun: "bugün" }) }, 7200); } } catch (e) { await hataYaz(env, "defterDeneme", e); }
  // 9 Kasım (Claude Code canlı deneme): KV "venom:modelKartDeneme" = "3629" → gerçek kart Patron'a + aynı içerik KV "venom:modelKartDenemeSonuc" (2 saat)
  try {
    const mk = await env.KAYIT.get("venom:modelKartDeneme");
    if (mk) {
      await env.KAYIT.delete("venom:modelKartDeneme");
      const v = await modelVerisi(env, mk, simdi);
      const f = v ? await botaSor(env, "kemal", "modelFoto", v.kod) : null;
      let b64 = null;
      if (f && f.ok && f.bayt) { const by = new Uint8Array(f.bayt); let t = ""; for (let i = 0; i < by.length; i += 0x8000) t += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); b64 = btoa(t); }
      await modelKarti({ ...env, __izin: "cevap" }, [mk], simdi);
      await kaydet(env, "venom:modelKartDenemeSonuc", { zaman: simdi, metin: v ? temizSatir(kartSatirlari({ ...v, fotoYok: !b64 })).join("\n") : "bulunamadı", kaynak: f && f.kaynak, foto: b64, dugmeler: v ? kartDugmeleri(v.kod) : [] }, 7200);
    }
  } catch (e) { await hataYaz(env, "modelKartDeneme", e); }
  // 9 Kasım: repete raporunda Patron "🔁 Repete al / 🔔 Fuat'a hatırlat" bastı → Fuat'a gidecek taslak onay kartı (adet/renk ✏️ Düzelt ile)
  try {
    const rt = await oku(env, "venom:repeteTaslak", null);
    if (rt && rt.length) {
      await env.KAYIT.delete("venom:repeteTaslak");
      env.__sohbette = true; // Patron'un kendi isteği: kart hemen gelir
      try { for (const t of rt.slice(0, 5)) { const acik = await acikRepete(env, t.kod).catch(() => null); if (acik) { await yaz({ ...env, __izin: "cevap" }, engelMetni(acik), { posta: { izin: "cevap" } }); continue; } /* kural 43 */ await aracCalistir(env, "mesaj_taslagi", { kime: "fuat", metin: t.metin }, simdi); } } finally { env.__sohbette = false; }
    }
  } catch (e) { await hataYaz(env, "repeteTaslak", e); }
  try { await hataBildir(env, simdi); } catch (e) { await hataYaz(env, "hataBildir", e); }
  // Tek seferlik (Claude Code): KV "venom:patronaYaz" = metin → Patron'a Venom'dan (ör. kural kitabı özeti)
  // 6 Kasım (gizlilik): KV "venom:gizliMesaj" = { metin, sure } → Patron'a özel mesaj (iletilemez/kopyalanamaz), sure saniye sonra SİLİNİR.
  // Anahtar gönderir göndermez silinir (şifre KV'de kalmaz). Silinecekler: "venom:silinecekMesaj" [{ id, sil }]
  try {
    const gm = await oku(env, "venom:gizliMesaj", null);
    if (gm) {
      await env.KAYIT.delete("venom:gizliMesaj");
      const r = await yaz(env, gm.metin, { protect_content: true, posta: { izin: "cevap" } });
      if (r && r.ok) { const l = await oku(env, "venom:silinecekMesaj", []); await kaydet(env, "venom:silinecekMesaj", [...l, { id: r.result.message_id, sil: simdi + (Number(gm.sure) || 3600) }], 2 * 86400); }
      await kaydet(env, "venom:gizliMesajSonuc", { zaman: simdi, ok: Boolean(r && r.ok) }, 86400);
    }
    const sl = await oku(env, "venom:silinecekMesaj", []);
    if (sl.some((x) => x.sil <= simdi)) {
      for (const x of sl.filter((y) => y.sil <= simdi)) await tg(env, "deleteMessage", { chat_id: patron(env), message_id: x.id }).catch(() => null);
      await kaydet(env, "venom:silinecekMesaj", sl.filter((y) => y.sil > simdi), 2 * 86400);
    }
  } catch (e) { await hataYaz(env, "gizliMesaj", e); }
  // 6 Kasım: KV "venom:patronaDosya" = { ad, metin, aciklama } → Patron'a dosya olarak (ör. ofis planı)
  try {
    const pd = await oku(env, "venom:patronaDosya", null);
    if (pd) {
      await env.KAYIT.delete("venom:patronaDosya");
      const f = new FormData();
      f.append("chat_id", patron(env)); if (pd.aciklama) f.append("caption", String(pd.aciklama).slice(0, 1000));
      f.append("document", new Blob([String(pd.metin)], { type: "text/markdown" }), String(pd.ad || "dosya.md"));
      await tgForm(env, "sendDocument", f, "cevap");
    }
  } catch (e) { await hataYaz(env, "patronaDosya", e); }
  // 6 Kasım (Claude Code okur, sadece SÜTUN/TABLO adları için): KV "venom:ayarOkuSimdi" = ["mali:kesif:VOLONTE", …] → "venom:ayarOkuSonuc" (1 saat)
  try { const ao = await oku(env, "venom:ayarOkuSimdi", null); if (ao) { await env.KAYIT.delete("venom:ayarOkuSimdi"); const sonuc = {}; for (const k of [].concat(ao).slice(0, 10)) sonuc[k] = (await stokIste(env, "/ayar-oku", { k }).catch(() => ({}))).v ?? null; await kaydet(env, "venom:ayarOkuSonuc", { zaman: simdi, sonuc }, 3600); } } catch (e) { await hataYaz(env, "ayarOku", e); }
  // 6 Kasım (sadece rapor): iki markanın Vegawin'inde de görünen kodlar → KV venom:ikiMagazaSonuc (Claude Code okur)
  try { if (await env.KAYIT.get("venom:ikiMagazaSimdi")) { await env.KAYIT.delete("venom:ikiMagazaSimdi"); await env.KAYIT.put("venom:ikiMagazaSonuc", JSON.stringify({ zaman: simdi, liste: await stokIste(env, "/iki-magaza", {}) }), { expirationTtl: 7 * 86400 }); } } catch (e) { await hataYaz(env, "ikiMagaza", e); }
  // 6 Kasım: Patron'a "hangi marka?" sorusu, kod başına iki düğme → KV venom:markaKarar (bütün botlar kullanır)
  try { const t = await oku(env, "venom:markaSor", null); if (t) { await env.KAYIT.delete("venom:markaSor"); await bildir(env, t.metin, { simdi, tur: "kart", izin: "cevap", ek: { reply_markup: { inline_keyboard: (t.kodlar || []).slice(0, 40).map((k) => [{ text: `${k} = VOLONTE`, callback_data: `vk:${k}:V` }, { text: `${k} = BLACK ROSE`, callback_data: `vk:${k}:B` }]) } } }); } } catch (e) { await hataYaz(env, "markaSor", e); }
  try { const t = await env.KAYIT.get("venom:patronaYaz"); if (t) { await env.KAYIT.delete("venom:patronaYaz"); await yaz(env, t, { posta: { izin: "cevap" } }); } } catch (e) { await hataYaz(env, "patronaYaz", e); }
  // Tek seferlik (Claude Code): KV "venom:testSimdi" → günlük test şimdi, sonuç KV "venom:testSonuc" (Patron'a mesaj YOK)
  try { if (await env.KAYIT.get("venom:testSimdi")) { await env.KAYIT.delete("venom:testSimdi"); await env.KAYIT.put("venom:testSonuc", JSON.stringify({ zaman: simdi, metin: await gunlukTest(env, simdi) }), { expirationTtl: 86400 }); } } catch (e) { await hataYaz(env, "testSimdi", e); }
  // 6 Kasım: iş takibi (30 dk), Patron hatırlatıcıları
  try { const h = await isHatirlat(env, simdi); if (h) await bildir(env, h, { simdi, tur: "bilgi" }); } catch (e) { await hataYaz(env, "isTakip", e); }
  try { for (const h of await vadesiGelenler(env, simdi)) { await yaz(env, `⏰ Hatırlatma: ${h.metin}`, { posta: { izin: "cevap" } }); if (h.kime) await aracCalistir(env, "mesaj_taslagi", { kime: h.kime, metin: h.metin }, simdi).catch(() => null); } } catch (e) { await hataYaz(env, "hatirlatici", e); }
  // gece yedeği (03:00–05:00, bir kez)
  if (saat(simdi) >= 3 && saat(simdi) < 5) { try { if (await ilkKezBugun(env, `yedek:${gunAnahtari(simdi)}`)) await yedekAl(env, simdi); } catch (e) { await hataYaz(env, "yedek", e); } }
  // satış uyarısı (saatte bir), stok bitiyor (günde bir, 10:00 sonrası)
  if (saat(simdi) >= 9 && saat(simdi) < 22 && new Date(simdi * 1000).getUTCMinutes() < 5) { try { const u = await satisUyarisi(env, simdi); if (u) await bildir(env, u, { simdi, kaynak: "sami", tur: "rapor" }); } catch (e) { await hataYaz(env, "satisUyari", e); } }
  if (saat(simdi) >= 10 && saat(simdi) < 20 && (await ilkKezBugun(env, `stok:${gunAnahtari(simdi)}`))) { try { const u = await stokBitiyor(env, simdi); if (u) await bildir(env, u, { simdi, kaynak: "sami", tur: "rapor" }); } catch (e) { await hataYaz(env, "stokBitiyor", e); } }
  // pazartesi 09:00 haftalık özet + paylaşılmayanlar + fikir kutusu
  // (9 Kasım: pazartesi haftalık özet ayrı mesaj DEĞİL — 09:40 sabah özetinin içinde, ayrıntısı /detay)
  try { await bekleyenMedyaBosalt(env, simdi); } catch (e) { await hataYaz(env, "postaMedya", e); }
  // 9 Kasım: tavandan sonra gelen kartlar saatte bir TEK mesajda
  if (saat(simdi) >= 8 && saat(simdi) < 22 && new Date(simdi * 1000).getUTCMinutes() < 5) { try { const m = await kartSiraMesaji(env); if (m) await yaz(env, m.metin, { reply_markup: { inline_keyboard: m.klavye }, posta: { tur: "kart", izin: m.izin } }); } catch (e) { await hataYaz(env, "kartSira", e); } }
  // 9 Kasım (Patron): botlar günde 2 kez Venom'a rapor verir (09:00, 19:30) — Patron'a ayrı gitmez, özete girer
  if (saat(simdi) >= 9 && saat(simdi) < 9.6 && (await ilkKezBugun(env, `botRapor:s:${gunAnahtari(simdi)}`))) { try { await botRaporuAl(env, simdi, "sabah"); } catch (e) { await hataYaz(env, "botRapor", e); } }
  if (saat(simdi) >= 19.5 && saat(simdi) < 20 && (await ilkKezBugun(env, `botRapor:a:${gunAnahtari(simdi)}`))) { try { await botRaporuAl(env, simdi, "aksam"); } catch (e) { await hataYaz(env, "botRapor", e); } }
  // 9 Kasım (ONAY MERDİVENİ): takılan kart için yazılı hatırlatma YOK — kartın kendisini her bot kendi gönderir (kart-tekrar.js)
  try { if (await env.KAYIT.get("venom:merdivenGoc")) { await env.KAYIT.delete("venom:merdivenGoc"); await kaydet(env, "venom:merdivenGocSonuc", { zaman: simdi, sonuc: await merdivenGoc(env, simdi) }, 7 * 86400); } } catch (e) { await hataYaz(env, "merdivenGoc", e); }
  // 9 Kasım (Patron): köprü SADECE hafta içi 09–20 izlenir; açıkken 1 saatten uzun sinyal yoksa kritik uyarı (bir kez)
  if (haftaIci(simdi) && new Date(simdi * 1000).getUTCMinutes() % 15 < 5) { try { await kopruIzle(env, simdi); } catch (e) { await hataYaz(env, "kopruIzle", e); } }
  // Cloudflare %80 uyarısı: günde bir kez (pazar da)
  try { const cf = await cfKullanimSatiri(env, simdi); if (cf.uyari && (await ilkKezBugun(env, `cf80:${gunAnahtari(simdi)}`))) await bildir(env, cf.metin, { simdi, tur: "kritik" }); } catch (e) { await hataYaz(env, "cfKullanim", e); }
  if (pazarMi(simdi)) return; // pazar: rapor ve bildirim yok
  const gun = gunAnahtari(simdi);
  // 9 Kasım (Patron): sabah 09:40 TEK mesaj, akşam 20:00 TEK özet (en fazla 15 satır, önemli en üstte); ayrıntı /detay
  if (saat(simdi) >= 9 + 40 / 60 && saat(simdi) < 11 && (await ilkKezBugun(env, `toplu:${gun}`))) {
    try { const m = await sabahOzeti(env, simdi); await yaz(env, m, { posta: { tur: "ozet" } }); await sesliGonder(env, m, simdi); } catch (e) { await hataYaz(env, "sabah", e); }
  }
  if (saat(simdi) >= 20 && saat(simdi) < 22 && (await ilkKezBugun(env, `aksam:${gun}`))) {
    try { const m = await aksamOzeti(env, simdi); await yaz(env, m, { posta: { tur: "ozet" } }); await sesliGonder(env, m, simdi); } catch (e) { await hataYaz(env, "aksam", e); }
  }
}
// Son özetten bu yana biriken bilgiler (dün + bugün)
async function birikenler(env, simdi) {
  const son = Number(await env.KAYIT.get("venom:posta:sonOzet").catch(() => 0)) || simdi - 86400;
  const l = [...(await oku(env, `venom:posta:${gunAnahtari(simdi - 86400)}`, [])), ...(await oku(env, `venom:posta:${gunAnahtari(simdi)}`, []))];
  return l.filter((x) => x.zaman > son && x.zaman <= simdi);
}
const satirlar = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);
// 11 Kasım (Patron, RAPOR DÜZENİ — kalıcı): 09:40 ve 20:00 EN FAZLA 8 satır, sabit sıra, her satır tek kez.
// Başlık · Genel durum · (Patron kararı — varsa) · Satış · Kanal · Site · Fabrika · Venom'un kendi çözdükleri. Ayrıntı /detay.
const BR_AD = (m) => (m === "BLACKROSE" ? "Black Rose" : "VOLONTE");
// 12 Kasım (D16): raporun "karar" satırı sohbetteki "Bekleyenler" ile AYNI kaynaktan (bekleyenKararlar)
export async function patronKararlari(env, simdi) {
  const l = await bekleyenKararlar(env, simdi);
  const k = { repete: [], sil: [], para: 0 };
  for (const x of l) { if (x.tip === "sil") k.sil.push(x.kod || "?"); else if (x.tip === "para" || /Pelin|maliyet/i.test(x.baslik)) k.para++; else if (x.tip === "bitti" || x.tip === "repete") k.repete.push(x.kod || "?"); }
  const p = [];
  if (k.repete.length) p.push(`repete ${[...new Set(k.repete)].join(", ")}`);
  if (k.sil.length) p.push(`silme ${[...new Set(k.sil)].join(", ")}`);
  if (k.para) p.push(`para ${k.para} iş`);
  return p.length ? `🟡 Kararınız bekleniyor: ${p.join(" · ")}` : null;
}
export async function raporSatirlari(env, simdi, tur) {
  const g = tur === "sabah" ? gunAnahtari(simdi - 86400) : gunAnahtari(simdi);
  const ne = tur === "sabah" ? "dün" : "bugün";
  const gb = Math.floor(Date.parse(`${g}T00:00:00Z`) / 1000) - SAAT_FARKI;
  const ayar = async (k, bos) => { try { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); } catch { return bos; } };
  // 1) genel durum: sabah testi (sabah) + köprü + durdurulan bot
  const sorun = [];
  if (tur === "sabah") { try { sorun.push(...satirlar(await gunlukTest(env, simdi)).slice(1).filter((x) => /❌/.test(x)).map((x) => x.replace(/^[•\s]*❌\s*/, ""))); } catch (e) { sorun.push(`sabah testi çalışmadı`); } }
  for (const m of ["VOLONTE", "BLACKROSE"]) { const a = await oku(env, `venom:kopruAlarm:${m}`, null); if (a && a.patron) sorun.push(`${BR_AD(m)} mağaza bilgisayarı sinyal vermiyor`); }
  const dur = await oku(env, "venom:dur", null);
  if (dur && dur.hepsi) sorun.push("bütün botlar durduruldu"); else for (const b of ["kemal", "selin", "sami", "pelin"]) if (dur && dur[b]) sorun.push(`${BOT_AD[b] || b} durduruldu`);
  // 13 Kasım (Patron): "✅ Her şey çalışıyor" SADECE botlar ayakta VE işler yapılmışsa; aksi halde ne eksikse o yazılır (iş bekçisinin son kontrolü)
  const eksik = await bekciEksikleri(env, g).catch(() => undefined);
  const eksikYazisi = eksik && eksik.length ? eksik.slice(0, 2).join("; ") + (eksik.length > 2 ? ` (+${eksik.length - 2})` : "") : null;
  const genel = sorun.length ? `🔴 ${sorun.length} sorun var: ${sorun.slice(0, 2).join("; ")}${sorun.length > 2 ? ` (+${sorun.length - 2}, /detay)` : ""}${eksikYazisi ? ` · iş eksik: ${eksikYazisi}` : ""}`
    : eksikYazisi ? `🟠 Botlar ayakta ama iş eksik: ${eksikYazisi}` : eksik === undefined ? `✅ Botlar çalışıyor (${ne} iş kontrolü yapılmadı)` : "✅ Her şey çalışıyor";
  // 2) Patron kararı (sadece para / repete / silme)
  const karar = await patronKararlari(env, simdi).catch(() => null);
  // 3) satış (Sami ile aynı sayım)
  const sat = {};
  for (const m of ["VOLONTE", "BLACKROSE"]) { const x = await stokIste(env, "/satis-sayim", { gun: g, magaza: m }).catch(() => null); sat[m] = x && x.toplam != null ? x.toplam : "?"; }
  // 4-6) kanal, site, fabrika: sohbetteki "gun_ozeti" aracıyla AYNI kaynak (12 Kasım, D16: rapor "4" deyip sohbet "9" diyemez)
  const gv = await gunVerisi(env, g).catch(() => null);
  const payN = gv ? gv.kanal.length : "?";
  const d = await oku(env, "venom:siteDefteri", null);
  const mod = d && d.modeller ? Object.values(d.modeller).filter((m) => !m.gizli) : null;
  const site = gv ? `🌐 Site: ${mod ? `${mod.length} model, ` : ""}${ne} ${gv.site.eklenen.length} eklendi${gv.site.kaldirilan.length ? `, ${gv.site.kaldirilan.length} kaldırıldı` : ""}` : "🌐 Site: kayıt okunamadı";
  const birlesik = (await ayar(`fabrika:birlesik:${g}`, [])) || [];
  let bekleyenListe = 0;
  for (const k of birlesik) { const b = await ayar(`fabrika:${k}`, null); if (b && !b.deneme && b.asama === "onayda" && (b.liste || []).length) bekleyenListe++; }
  const gvn = gv ? gv.fabrika.VOLONTE.length : 0, gbr = gv ? gv.fabrika.BLACKROSE.length : 0;
  const gcl = gv ? (gv.fabrika.celal || []).length : 0; // 12 Kasım: Celal ayrı
  const fabrika = gcl ? `🏭 Fabrika: Celal'e ${gcl} model, Sinem'e ${gvn + gbr - gcl} model${bekleyenListe ? ` (${bekleyenListe} liste Hemra onayında)` : ""}` : gvn || gbr ? `🏭 Fabrika: eksik listesi gitti — VOLONTE ${gvn}, Black Rose ${gbr} model${bekleyenListe ? ` (${bekleyenListe} liste Hemra onayında)` : ""}` : bekleyenListe ? `🏭 Fabrika: eksik listesi henüz gitmedi (${bekleyenListe} liste Hemra onayında)` : `🏭 Fabrika: ${ne} eksik listesi gitmedi`;
  // 7) Venom'un kendi çözdükleri
  const duz = (await oku(env, "venom:kontrol:duzeltme", [])).filter((x) => gunAnahtari(x.zaman) === g).length;
  const coz = (await oku(env, `venom:cozdum:${g}`, [])) || [];
  const cozParca = [duz ? `${duz} yazı düzeltmesi` : null, ...[...new Set(coz)].slice(0, 3)].filter(Boolean);
  const venom = `🛡 Venom kendi çözdü: ${cozParca.length ? cozParca.join(", ") : "çözülecek sorun çıkmadı"}`;
  const baslik = tur === "sabah" ? `☀️ Günaydın Patron — ${tarihSaat(simdi).slice(0, 10)} (ayrıntı /detay)` : `🌙 Günün özeti — ${tarihSaat(simdi).slice(0, 10)} (ayrıntı /detay)`;
  const gs = await gunlukSatis(env, simdi, g).catch(() => null); // 11 Kasım: adet + ciro (Vegawin), markalar ayrı
  const satisSatiri = gs && gs.VOLONTE.adet != null && gs.BLACKROSE.adet != null ? `💰 ${raporSatisSatiri(gs).replace(/^Satış:/, `Satış ${ne}:`)}` : `💰 Satış ${ne}: VOLONTE ${sat.VOLONTE}, Black Rose ${sat.BLACKROSE}`;
  const l = [baslik, genel, karar, satisSatiri, `📣 Kanal ${ne}: ${payN} paylaşım`, site, fabrika, venom].filter(Boolean);
  return [...new Set(l)].slice(0, 8).join("\n");
}
export async function sabahOzeti(env, simdi) {
  const metin = await raporSatirlari(env, simdi, "sabah");
  // /detay için eski ayrıntılar (Patron'a gitmez)
  const ayr = await Promise.all([topluRaporMetni(env, simdi).catch(() => ""), bekleyenlerMetni(env, simdi).catch(() => ""), birikenler(env, simdi).then(ozetDetay).catch(() => "")]);
  await ozetKaydet(env, "sabah", [metin, ...ayr], simdi);
  return metin;
}
export async function aksamOzeti(env, simdi) {
  const metin = await raporSatirlari(env, simdi, "aksam");
  const cuma = new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() === 5;
  const ayr = await Promise.all([gunOzeti(env, simdi).catch(() => ""), merdivenSatirlari(env, simdi).then((l) => l.join("\n")).catch(() => ""), cuma ? saglikSatiri(env, simdi).catch(() => "") : "", cuma ? mudurSatiri(env, simdi).catch(() => "") : "", birikenler(env, simdi).then(ozetDetay).catch(() => "")]);
  await ozetKaydet(env, "aksam", [metin, ...ayr], simdi);
  return metin;
}
// 9 Kasım (sert müdür F): cuma — Venom'un kendi çözdüğü / Hemra-Merdan'a verilen / Patron'a gelen iş (hedef: Patron'a gelen en aza)
async function mudurSatiri(env, simdi) {
  const s = await haftaSayilari(env, simdi);
  return `🧭 Bu hafta: Venom kendi çözdü ${s.kendi} · Hemra/Merdan'a görev ${s.gorev} · Patron'a gelen iş ${s.patron}.`;
}
// 10 Kasım (Sinem, HATA SAYACI): cuma — "Bot hatası" ve "Geri al" sayıları + en çok hata çıkan kart türü
export function kartHataMetni(hatalar, geriAllar) {
  const say = {};
  for (const x of [...hatalar, ...geriAllar]) { const t = x.tur || "eksik kartı"; say[t] = (say[t] || 0) + 1; }
  const en = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  return `🧮 Bu hafta kartlar: ⚠️ bot hatası ${hatalar.length} · ↩️ geri al ${geriAllar.length}${en ? ` · en çok: ${en[0]} (${en[1]})` : ""}.`;
}
async function kartHataSatiri(env, simdi) {
  const son = (l) => (Array.isArray(l) ? l : []).filter((x) => simdi - Number(x.zaman) < 7 * 86400);
  return kartHataMetni(son(await oku(env, "sami:botHatalari", [])), son(await oku(env, "sami:geriAllar", [])));
}
// 10 Kasım (Patron): Sami'den "bittiOneri" → Patron'a onay kartı (fotoğraf + kod + Hemra'nın görüşü)
const ONERI_AD = { repete: "🔁 Repete", sil: "🗑 Sil", bekle: "⏳ Stok bitene kadar bekle", sor: "❓ Hemra karar sizde dedi" };
export function bittiKartMetni(x) {
  return [
    `${x.mod ? MOD_SATIR : x.deneme ? "🧪 DENEME – üretim yapmayın\n" : ""}🏭 ${x.tur === "az" ? "Fabrikada bitmek üzere" : x.tur === "stokBitti" ? "Mağaza stoğu bitti" : "Fabrikada bitti"} — ${MAGAZA_BASLIK[x.magaza] || "mağaza yazılmamış"} · ${x.kod}`,
    x.fabrika ? `Fabrika: ${x.fabrika.kim} "${x.fabrika.ne}" dedi${x.fabrika.zaman ? ` (${kanitTarih(x.fabrika.zaman)})` : ""}` : null,
    x.fuat ? `Fuat onayladı (${kanitTarih(x.fuat.zaman)})` : null,
    `Mağaza stoğu: ${x.stok}`,
    `Hemra önerisi: ${ONERI_AD[x.oneri] || x.oneri}${x.not ? ` — ${x.not}` : ""}`,
    "Kural: mağaza stoğu bitmeden siteden ve Telegram'dan kaldırılmaz.",
    "Onaylıyor musun?",
  ].filter(Boolean).join("\n");
}
// ---------- 11 Kasım (Patron): REPETE KARTI — sade Patron kartı (dağılım + [Onaylıyorum] [Reddediyorum]); Fuat cevabı TEK satır. Önce deneme yolunda. ----------
export function rkKartMetni(x) {
  return [`${x.mod ? MOD_SATIR : x.deneme ? "🧪 DENEME – üretim yapmayın\n" : ""}🔁 REPETE — ${MAGAZA_BASLIK[x.magaza] || "mağaza yazılmamış"} · ${x.kod}`,
    `Dağılım: ${x.dagilim} (toplam ${x.adet} adet)`,
    `Mağazada kalan ${x.kalan} adet · son 7 günde ${x.satis7} satıldı${x.bitisGun ? ` · ~${x.bitisGun} günde biter` : ""}`,
    `${x.hemra || "Hemra"} önerdi. Onaylarsanız ${x.uretici === "Celal" ? "Celal'e" : "Fuat'a"} gider.`].join("\n");
}
const rkKlavye = (rid) => ({ inline_keyboard: [[{ text: "✅ Onaylıyorum", callback_data: `vrk:o:${rid}` }, { text: "❌ Reddediyorum", callback_data: `vrk:x:${rid}` }]] });
// Telefona giden hali (Telegram'ın döndürdüğü) → "venom:rkKanit:<id>"
async function rkKanit(env, rid, ne, r, metin, kl, simdi) {
  const m = r && r.ok && r.result && typeof r.result === "object" ? r.result : null;
  const l = await oku(env, `venom:rkKanit:${rid}`, []);
  await kaydet(env, `venom:rkKanit:${rid}`, [...l, { zaman: simdi, ne, ok: Boolean(r && r.ok), mesaj: m ? m.message_id : null, resim: Boolean(m && m.photo && m.photo.length), yazi: String((m && (m.caption || m.text)) || metin).slice(0, 900), dugmeler: (((m && m.reply_markup) || kl || {}).inline_keyboard || []).map((s2) => s2.map((b) => b.text)), hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null }].slice(-20), 7 * 86400).catch(() => null);
}
async function rkAdimi(env, simdi) {
  for (const x of await kuyruguAl(env, "rkOneri")) {
    await kaydet(env, `venom:rkKart:${x.rid}`, x, 14 * 86400);
    const metin = rkKartMetni(x), kl = rkKlavye(x.rid);
    let r = x.foto ? await tg(env, "sendPhoto", { chat_id: patron(env), photo: x.foto, caption: metin.slice(0, 1024), reply_markup: kl, izin: "onay" }) : null;
    if (r && r.ok) await gonderildiKaydet(env, { kaynak: "sami", tur: "kart", metin, id: r.result && r.result.message_id, izin: "onay" }, simdi).catch(() => null);
    else r = await yaz(env, metin, { reply_markup: kl, posta: { izin: "onay", tur: "kart", kaynak: "sami" } });
    await rkKanit(env, x.rid, "Patron kartı", r, metin, kl, simdi);
  }
  for (const s2 of await kuyruguAl(env, "rkSonuc")) {
    if (s2.temizle) { for (const id of s2.temizle) { await env.KAYIT.delete(`venom:rkKart:${id}`).catch(() => null); await env.KAYIT.delete(`venom:rkKanit:${id}`).catch(() => null); } continue; }
    if (s2.biriktir) { await biriktir(env, { kaynak: "sami", metin: s2.metin, tur: "bilgi" }, simdi); continue; }
    const r = await yaz({ ...env, __izin: "cevap" }, s2.metin, { posta: { kaynak: "sami", tur: "cevap", izin: "cevap" } }).catch(() => null);
    await rkKanit(env, s2.rid, "Patron'a sonuç (tek satır)", r, s2.metin, null, simdi);
  }
}
// 11 Kasım (Patron, kural 54): 1 saat basılmayan kart — Venom Hemra'ya yazar (Sami üzerinden); sebebi Sami araştırdı
// (bot engellendi mi, kart kayıtlı hesaba mı gitti). Patron'a SADECE çözülemeyen durum (engel / kayıtsız hesap) TEK satır.
// 13 Kasım (Patron, kitap kural 4): TEK MERDİVEN — Sami kişiye 1. saatte hatırlatma, 2. saatte son hatırlatma gönderdi; kart hâlâ açık →
// Venom çözer: Hemra'ya kartın yazısı, başında "⏩ <kişi> N saattir cevap vermedi — karar sizde." (Sami üzerinden). Bir saat sonra
// hâlâ açıksa (ya da cevapsız kalan Hemra'nın kendi işleriyse) Patron'a TEK satır. Hesap sorunu (engel / kayıtsız hesap) Patron'a hemen.
async function kartCevapsizAdimi(env, simdi) {
  const l = await kuyruguAl(env, "kartCevapsiz");
  if (!l.length) return;
  const adlar = (kisiler) => kisiler.join(", ");
  // aynı kartlara cevap vermeyen kişiler (fabrika listesi Sinem + Nuri + Fuat'a gider) TEK mesajda / TEK satırda birleşir
  const birlestir = (kayitlar) => { const g = {}; for (const k of kayitlar) { const a = `${k.baslik || ""}|${k.saat}`; (g[a] = g[a] || { ...k, kisiler: [] }).kisiler.push(k.kim || `kayıtlı olmayan hesap (${k.chat})`); } return Object.values(g); };
  for (const k of l.filter((x) => x.patron && x.hemra)) await bildir(env, `📌 Hemra ${k.saat} saattir cevap vermedi: ${k.n || 1} iş bekliyor (${k.baslik || "kart"}).`, { simdi, kaynak: "venom", tur: "kritik" });
  for (const k of birlestir(l.filter((x) => x.patron && !x.hemra))) await bildir(env, `📌 ${adlar(k.kisiler)} ${k.saat} saattir cevap vermedi, Hemra da çözemedi: ${k.baslik || "kart"}.`, { simdi, kaynak: "venom", tur: "kritik" });
  const hemraya = l.filter((x) => !x.patron);
  for (const k of birlestir(hemraya.filter((x) => x.kim !== "Hemra"))) {
    const yazilar = (k.kartlar || []).map((x) => x.yazi).filter(Boolean);
    await kuyrugaEkle(env, "giden", { id: `kc-h:${k.chat}:${k.mesaj}`, kime: "hemra", tur: "mesaj", metin: `⏩ ${adlar(k.kisiler)} ${k.saat} saattir cevap vermedi — karar sizde.\n${(yazilar.length ? yazilar : [k.ozet || "kart"]).join("\n\n").slice(0, 3000)}` }).catch(() => null);
    await biriktir(env, { kaynak: "sami", metin: `📌 ${adlar(k.kisiler)} ${k.saat} saattir cevap vermedi (${k.baslik || "kart"}); Hemra'ya soruldu.`, tur: "bilgi" }, simdi);
  }
  for (const k of hemraya.filter((x) => x.engel || x.kayitsiz)) {
    const kim = k.kim || `kayıtlı olmayan hesap (${k.chat})`;
    await bildir(env, `⚠️ Kart ${kim} hesabına ulaşmıyor: ${k.kayitsiz ? "kart kayıtlı bir hesaba gitmemiş" : `Telegram: ${k.engel}`} (${tarihSaat(k.zaman).slice(11, 16)}, "${(k.ozet || "").slice(0, 60)}"). Hemra'ya bildirildi; hesabın düzeltilmesi gerekiyor.`, { simdi, kaynak: "venom", tur: "kritik" });
  }
}
async function rkKararDugmesi(env, cq, simdi, cevap) {
  const p = String(cq.data).split(":"), h = p[1], rid = p.slice(2).join(":");
  const x = await oku(env, `venom:rkKart:${rid}`, null);
  if (!x || x.karar) return cevap(x ? "Zaten karar verildi." : "Bu kart artık geçerli değil.");
  x.karar = h === "o" ? "onay" : "red";
  x.kararKim = [cq.from && cq.from.first_name, cq.from && cq.from.last_name].filter(Boolean).join(" ") || "?";
  x.kararZaman = simdi;
  x.kararDugme = h === "o" ? "✅ Onaylıyorum" : "❌ Reddediyorum";
  await kaydet(env, `venom:rkKart:${rid}`, x, 14 * 86400);
  await kuyrugaEkle(env, "rkKarar", { id: `${rid}:${simdi}`, rid, karar: x.karar, kim: x.kararKim, dugme: x.kararDugme, zaman: simdi });
  await botaSor(env, "sami", "repeteAdim"); // 11 Kasım (ACİL): Sami 5 dk beklemez — Fuat'ın kartı HEMEN gider
  const ur = x.uretici === "Celal" ? "Celal" : "Fuat";
  await cevap(x.karar === "onay" ? `${ur}'${ur === "Celal" ? "e" : "a"} gidiyor` : "Reddedildi");
  const foto = Boolean(cq.message && cq.message.photo);
  const ura = ur === "Celal" ? "Celal'e" : "Fuat'a";
  const yeni = `${rkKartMetni(x).replace(` Onaylarsanız ${ura} gider.`, "")}\n\n${x.karar === "onay" ? `✅ Kararınız: Onaylıyorum — ${ura} gidiyor.` : `❌ Kararınız: Reddediyorum — ${ura} gitmedi.`}`;
  const r = await tg(env, foto ? "editMessageCaption" : "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, [foto ? "caption" : "text"]: yeni.slice(0, foto ? 1024 : 4000), reply_markup: { inline_keyboard: [] } }).catch(() => null);
  await rkKanit(env, rid, `Patron bastı: ${x.kararDugme}`, r && r.ok && typeof r.result === "object" ? r : { ok: Boolean(r && r.ok), result: { message_id: cq.message.message_id } }, yeni, null, simdi);
}
async function bittiOneriAdimi(env, simdi) {
  for (const x of await kuyruguAl(env, "bittiOneri")) {
    if (x.deneme && !x.zincir) { await kaydet(env, `venom:bittiDeneme:${x.sip}`, x, 3 * 86400); continue; } // zincir denemesi (Patron istedi): 🧪 işaretli kart gelir // 10 Kasım kural 5: DENEME Patron'a karar olarak GİTMEZ
    await kaydet(env, `venom:bittiKart:${x.sip}`, x, 30 * 86400);
    const metin = bittiKartMetni(x);
    const kl = bittiKlavye(x);
    const r = x.foto ? await tg(env, "sendPhoto", { chat_id: patron(env), photo: x.foto, caption: metin.slice(0, 1024), reply_markup: kl, izin: "onay" }) : null;
    if (r && r.ok) await gonderildiKaydet(env, { kaynak: "sami", tur: "kart", metin, id: r.result && r.result.message_id, izin: "onay" }, simdi).catch(() => null);
    else await yaz(env, metin, { reply_markup: kl, posta: { izin: "onay", tur: "kart", kaynak: "sami" } });
  }
}
async function bittiKararDugmesi(env, cq, simdi, cevap) {
  const [, h, sip] = String(cq.data).split(":");
  const x = await oku(env, `venom:bittiKart:${sip}`, null);
  if (!x || x.karar) return cevap(x ? "Zaten karar verildi." : "Bu kart artık geçerli değil.");
  const karar = h === "o" ? x.oneri : { r: "repete", s: "sil", w: "bekle" }[h];
  if (!karar) return cevap("?");
  if (karar === "repete" && !x.deneme) { // 11 Kasım KURAL 43: açık repete varken (mal gelmeden) aynı modele yeni repete verilmez
    const acik = await acikRepete(env, x.kod).catch(() => null);
    if (acik) { await cevap("Açık repete var"); return yaz(env, engelMetni(acik), { posta: { izin: "cevap" } }); }
  }
  x.karar = karar;
  x.kararKim = [cq.from && cq.from.first_name, cq.from && cq.from.last_name].filter(Boolean).join(" ") || "?"; // 10 Kasım: kanıt — kim, ne zaman, hangi düğme
  x.kararZaman = simdi;
  x.kararDugme = { o: "✅ Onayla", r: "🔁 Repete", s: "🗑 Sil", w: "⏳ Bekle" }[h] || h;
  await kaydet(env, `venom:bittiKart:${sip}`, x, 30 * 86400);
  await kuyrugaEkle(env, "bittiKarar", { id: `${sip}:${simdi}`, sip, karar, kim: x.kararKim, dugme: x.kararDugme, zaman: simdi });
  await kararVerildi(env, x.kod, karar, simdi).catch(() => null); // 12 Kasım (C10): Hemra / Merdan / Aziz / fabrika kartları da kapanır
  await cevap(karar === "repete" ? "Repete taslağı hazırlanıyor" : karar === "sil" ? "Sil — stok kuralıyla" : "Bekle");
  const foto = Boolean(cq.message && cq.message.photo);
  const celalMi = ((await stokIste(env, "/tedarikci", { kodlar: [String(x.kod)] }).catch(() => ({})))[String(x.kod)] || {}).tedarikci === "CELAL" || celalKoduMu(x.kod);
  const yeniRk = celalMi || (await yeniAkisAcik(env)); // yeni akış: repete KARTLA (Hemra dağılımı → doğrudan fabrika); eski düz yazı taslağı sadece akış kapalıyken
  const ek = `\n\n✅ Kararınız: ${ONERI_AD[karar]}${karar === "sil" ? " (mağaza stoğu varsa stok bitince kaldırılır)" : karar === "repete" ? (x.deneme ? " (DENEME: taslak hazırlanmadı)" : yeniRk ? ` — Hemra dağılımı yazınca repete kartı doğrudan ${celalMi ? "Celal'e" : "Fuat'a"} gider` : " — taslak aşağıda, onayınızla Fuat'a gider") : ""}`;
  await tg(env, foto ? "editMessageCaption" : "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, [foto ? "caption" : "text"]: `${bittiKartMetni(x).replace("\nOnaylıyor musun?", "")}${ek}`.slice(0, foto ? 1024 : 4000), reply_markup: { inline_keyboard: [] } }).catch(() => null);
  if (karar === "repete" && !x.deneme && yeniRk) { // 12 Kasım (Patron): Celal'in modeli → repete kartı akışı (Hemra dağılımı → Patron onayı → Celal); Fuat'a taslak GİTMEZ
    await kuyrugaEkle(env, "rkBaslat", { id: `rb:${x.kod}:${simdi}`, kodlar: [String(x.kod)], kim: "Patron", zaman: simdi, ...(x.mod ? { mod: true } : {}) });
    await botaSor(env, "sami", "repeteAdim").catch(() => null);
  } else if (karar === "repete" && !x.deneme) { // ASLA doğrudan sipariş: Fuat'a gidecek TASLAK Patron onayına (en az 40 adet, ✏️ Düzelt)
    const v = await modelVerisi(env, x.kod, simdi).catch(() => null);
    env.__sohbette = true;
    try { await aracCalistir(env, "mesaj_taslagi", { kime: "fuat", metin: siparisTaslagi({ kod: x.kod, s14: v ? v.s14 : 0, fabrika: v && v.fs && v.fs[0] }) }, simdi); } finally { env.__sohbette = false; }
  }
}
// 9 Kasım (Patron, E10): cuma tek satır sağlık raporu
async function saglikSatiri(env, simdi) {
  const duz = (await oku(env, "venom:kontrol:duzeltme", [])).filter((x) => simdi - x.zaman < 7 * 86400).length;
  const siz = Number(await env.KAYIT.get(`venom:posta:sizinti:${haftaAnahtari(simdi)}`).catch(() => 0)) || 0;
  const h = await hataSayilari(env, simdi, 7 * 86400).catch(() => ({}));
  const en = Object.entries(h).sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0);
  return `🩺 Bu hafta: ${duz} hatayı kendim düzelttim · ${siz} mesaj size kurala uymadan geldi · ${en ? `en çok sorun: ${en[0]} (${en[1]} hata)` : "botlarda hata yok"}.`;
}
const haftaAnahtari = (t) => { const d = new Date((t + SAAT_FARKI) * 1000); const g = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - g * 86400000).toISOString().slice(0, 10); };
const ozetDetay = (bir) => (bir.length ? ["📨 Biriken bilgiler:", ...bir.slice(-40).map((x) => `• ${new Date((x.zaman + SAAT_FARKI) * 1000).toISOString().slice(11, 16)} ${x.kaynak}: ${x.ozet}`)].join("\n") : "");
async function ozetKaydet(env, tur, parcalar, simdi) {
  await kaydet(env, "venom:posta:detay", { tur, zaman: simdi, metin: parcalar.filter(Boolean).join("\n\n").slice(0, 12000) }, 2 * 86400);
  await env.KAYIT.put("venom:posta:sonOzet", String(simdi), { expirationTtl: 3 * 86400 }).catch(() => null);
}
// Köprü izleme (Sami deposu /ozet): hafta içi mağaza açıkken 1 saatten uzun sinyal yoksa BİR KEZ kritik uyarı; gelince kayıt
// 11 Kasım (Patron, KÖPRÜ ALARMI): Patron'a doğrudan GELMEZ. Sinyal yoksa Venom önce Merdan ve Hemra'ya sorar;
// 30 dk'da düzelmezse Patron'a TEK satır. Cumartesi/pazar ve açılış (09:00–10:30) alarm yok. Sinyal VARSA soru sorulmaz (Vegawin'e giriş olmaması normaldir — 11 Kasım, Patron). KV "venom:kopruAlarm:<mağaza>" = {son, ekip, patron}
export const KOPRU_ACILIS_SONU = 10.5;
const magazaKisileri = (m) => [m === "BLACKROSE" ? "merdan" : "aziz", "hemra"]; // VOLONTE → Aziz, BLACK ROSE → Merdan; ikisinde Hemra (Sami üzerinden)
export async function kopruIzle(env, simdi) {
  if (!env.STOK) return;
  const o = await stokIste(env, "/ozet", {}).catch(() => null);
  const saatNow = ((simdi + SAAT_FARKI) % 86400) / 3600;
  const sustu = [];
  for (const k of (o && o.kopruler) || []) {
    if (!k.kalp) continue; // eski köprü (sadece değişiklikte gönderir) izlenmez
    const son = Math.max(k.son || 0, k.kalp || 0), anahtar = `venom:kopruAlarm:${k.magaza}`;
    let a = await oku(env, anahtar, null);
    if (typeof a === "number") a = { son: a, ekip: simdi, patron: simdi }; // eski kayıt
    if (a && son > (a.son || 0) && !kopruSustu(son, simdi)) { // düzeldi
      await env.KAYIT.delete(anahtar).catch(() => null);
      const l = await oku(env, `venom:cozdum:${gunAnahtari(simdi)}`, []);
      await kaydet(env, `venom:cozdum:${gunAnahtari(simdi)}`, [...l, `${k.magaza === "BLACKROSE" ? "Black Rose" : "VOLONTE"} köprüsü (Merdan/Hemra ile)`].slice(-20), 3 * 86400);
      if (a.patron) await biriktir(env, { kaynak: "sami", metin: `✅ Köprü ${k.magaza} yeniden sinyal gönderiyor`, tur: "bilgi" }, simdi);
      continue;
    }
    if (!kopruSustu(son, simdi) || saatNow < KOPRU_ACILIS_SONU) continue;
    if (!a) { a = { son, ekip: null, patron: null }; sustu.push(k.magaza); }
    else if (!a.patron && a.ekip && simdi - a.ekip >= 1800) {
      a.patron = simdi;
      await bildir(env, `🔴 Köprü sustu: ${k.magaza === "BLACKROSE" ? "Black Rose" : "VOLONTE"} mağaza bilgisayarı ${tarihSaat(son).slice(11, 16)}'den beri sinyal vermiyor; ${k.magaza === "BLACKROSE" ? "Merdan" : "Aziz"} ve Hemra'ya 30 dk önce soruldu, düzelmedi.`, { simdi, kaynak: "venom", tur: "kritik" });
    }
    await kaydet(env, anahtar, a, 7 * 86400);
  }
  if (sustu.length) { // ekibe TEK mesaj (iki mağaza birlikte)
    const ad = sustu.map((m) => (m === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE")).join(" ve ");
    const metin = `🔌 ${ad}: Mağaza bilgisayarı açık mı, Sami köprüsü çalışıyor mu? 1 saattir sinyal gelmiyor. Bilgisayarı açıp kontrol edip buraya "tamam" yazın. (Venom)`;
    for (const kim of [...new Set(sustu.flatMap(magazaKisileri))]) await kuyrugaEkle(env, "giden", { id: `kp-${kim}-${simdi}`, kime: kim, metin, tur: "mesaj" }).catch(() => null); // ekip Sami'ye yazar → Sami üzerinden
    for (const m of sustu) { const a = await oku(env, `venom:kopruAlarm:${m}`, null); await kaydet(env, `venom:kopruAlarm:${m}`, { ...(a || {}), ekip: simdi }, 7 * 86400); }
  }
}
async function claudeIslemAdimi(env, simdi) {
  const l = await oku(env, "venom:claudeIslem", null);
  if (!Array.isArray(l) || !l.length) return;
  await env.KAYIT.delete("venom:claudeIslem");
  const sonuc = [];
  for (const is of l.slice(0, 12)) {
    if (is.tur === "kararVer") sonuc.push({ tur: is.tur, kod: is.kod, ...(await kararVerildi(env, is.kod, is.karar || "kapat", simdi, { aciklama: is.aciklama || "" })) }); // model için karar: bütün açık kartlar kapanır
    else if (is.tur === "bekciDene") sonuc.push({ tur: is.tur, ...(await isBekcisi(env, simdi, { kuru: !is.kayit })) }); // 13 Kasım: iş bekçisi kuru çalışma (hiçbir şey göndermez)
    else if (is.tur === "sozEkle") { await sozEkle(env, is.soz, is.zaman || simdi); sonuc.push({ tur: is.tur, ok: true }); }
    else if (is.tur === "sozAdim") sonuc.push({ tur: is.tur, n: await sozAdimi(env, simdi), sozler: await oku(env, "venom:sozler", []) });
    else if (is.tur === "isdKod") sonuc.push({ tur: is.tur, kod: is.kod, v: await stokIste(env, "/isd-kod", { kod: String(is.kod), basla: simdi - (is.gun || 4) * 86400 }).catch((e) => String(e.message || e)) });
    else if (is.tur === "kvYaz" && /^(venom:bot:hafiza|silme:onayli)$/.test(String(is.k))) { await env.KAYIT.put(is.k, typeof is.v === "string" ? is.v : JSON.stringify(is.v)); sonuc.push({ tur: is.tur, k: is.k, ok: true }); }
    else if (is.tur === "testMesaj") { // Patron'a test mesajı; Telegram'ın döndürdüğü hali (telefona giden) kayda
      const r = await tg(env, "sendMessage", { chat_id: patron(env), text: String(is.metin || "").slice(0, 4000), izin: "cevap" }).catch((e) => ({ ok: false, description: String(e.message || e) }));
      sonuc.push({ tur: is.tur, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null, bicim: r && r.result ? r.result.entities || null : null, hata: r && !r.ok ? r.description : null });
    } else if (is.tur === "kopruOku") {
      const o = await stokIste(env, "/ozet", {}).catch(() => null);
      const alarm = {}; for (const m of ["VOLONTE", "BLACKROSE"]) alarm[m] = await oku(env, `venom:kopruAlarm:${m}`, null);
      const sat = {}; for (const m of ["VOLONTE", "BLACKROSE"]) { const x = await stokIste(env, "/satis-sayim", { gun: gunAnahtari(simdi), magaza: m }).catch(() => null); sat[m] = x ? { toplam: x.toplam, model: x.model } : null; }
      sonuc.push({ tur: is.tur, zaman: simdi, kopruler: (o && o.kopruler) || null, alarm, satis: sat, sustu: ((o && o.kopruler) || []).map((k) => ({ m: k.magaza, sustu: kopruSustu(Math.max(k.son || 0, k.kalp || 0), simdi) })) });
    } else if (is.tur === "kopruSifirla") { for (const m of is.magazalar || []) await env.KAYIT.delete(`venom:kopruAlarm:${m}`).catch(() => null); sonuc.push({ tur: is.tur, ok: true }); }
    else if (is.tur === "defterOku") { // 11 Kasım (TEK DEFTER): kuru = sadece göster; değilse kapanması gerekenleri kapatır + Hemra listesini temizler
      if (is.onar) await stokIste(env, "/isd-onar", { simdi }).then((r) => sonuc.push({ tur: "isdOnar", ...r })).catch(() => null); // 12 Kasım: yanlış "yenilendi" kapanışlarını geri aç (bir kez)
      const df = await defterOku(env, simdi, { kuru: is.kuru !== false, kapat: is.kuru === false, venom: true });
      const hl = is.kuru === false ? await listeyiTemizle(env, simdi, df) : null;
      const say = {}; for (const x of df.kapanan) say[x.neden] = (say[x.neden] || 0) + 1;
      const filtre = (x) => (!is.kod || String(x.kod) === String(is.kod)) && (is.bitenler || x.durum !== "bitti") && (!is.satirTur || x.tur === is.satirTur);
      sonuc.push({ tur: is.tur, kuru: is.kuru !== false, ozet: df.ozet, kapanan: say, satirSayisi: df.satirlar.length, satirlar: df.satirlar.filter(filtre).slice(0, is.enFazla || 60).map(defterSatirYazi), hemra: hl ? { kapanan: hl.kapanan, kalan: hl.kalan.map((x) => x.ozet) } : null });
    } else if (is.tur === "soruDene") { // 12 Kasım: KABUL TESTİ — Patron'un mesajı gibi beyne (Opus) gider; cevap Patron'a GİTMEZ, yazan araçlar çalışmaz, sohbet kaydına girmez
      const e2 = { ...env, __kuru: true, __kuruYazi: [] };
      let c = null, hata = null;
      try { c = await sohbet(e2, String(is.metin || ""), simdi); } catch (e) { hata = String((e && e.message) || e).slice(0, 300); }
      sonuc.push({ tur: is.tur, soru: is.metin, cevap: c, kartlar: e2.__kuruYazi.filter((x) => x.dugmeler).map((x) => ({ yazi: x.text.slice(0, 200), dugmeler: x.dugmeler })), hata });
    } else if (is.tur === "botIsKapat") { // Venom'un botlara verdiği iş: kanıtla kapat / iptal
      const l = await oku(env, "venom:bot:isler", []);
      const x = l.find((y) => y.id === is.id);
      if (x) { Object.assign(x, { durum: is.iptal ? "iptal" : "bitti", bitis: simdi, kanit: String(is.kanit || "").slice(0, 200) }); await kaydet(env, "venom:bot:isler", l, 7 * 86400); }
      sonuc.push({ tur: is.tur, id: is.id, ok: Boolean(x) });
    } else if (is.tur === "mesajDuzelt") { // Patron'daki eski bir Venom mesajını kapat (ör. yanlış alarm): yazı değişir, düğmeler kalkar
      const r = await tg(env, "editMessageText", { chat_id: patron(env), message_id: Number(is.mesaj), text: String(is.metin || "").slice(0, 4000), reply_markup: { inline_keyboard: [] }, disable_web_page_preview: true }).catch((e) => ({ ok: false, description: String(e.message || e) }));
      sonuc.push({ tur: is.tur, mesaj: is.mesaj, ok: Boolean(r && r.ok), yazi: r && r.result ? r.result.text : null, hata: r && !r.ok ? r.description : null });
    } else if (is.tur === "isdKapat") { // iş defterinde bekleyen kartı kapat (kart Telegram'da kapatıldıktan sonra): { idler, neden }
      await stokIste(env, "/isd-isaretle", { idler: (is.idler || []).slice(0, 100), alan: "durum", deger: String(is.neden || "kapandi").slice(0, 20) }).catch(() => null);
      sonuc.push({ tur: is.tur, n: (is.idler || []).length });
    } else if (is.tur === "hemraListeOku") { const l = await oku(env, "venom:hemraListe", []); sonuc.push({ tur: is.tur, bekleyen: l.filter((x) => x.durum === "bekliyor").map((x) => ({ ozet: x.ozet, gonderildi: Boolean(x.gonderildi) })), toplam: l.length }); }
    else if (is.tur === "stokOku" && ["/arsiv-kod", "/ayar-oku", "/ozet", "/satis-sayim", "/isd-bekleyen", "/fs-ozet"].includes(is.yol)) sonuc.push({ tur: is.tur, yol: is.yol, v: await stokIste(env, is.yol, is.g || {}).catch((e) => String(e.message || e)) }); // sadece okuma
    else if (is.tur === "kopruSimdi") { await kopruIzle(env, simdi); sonuc.push({ tur: is.tur, ok: true, alarm: { VOLONTE: await oku(env, "venom:kopruAlarm:VOLONTE", null), BLACKROSE: await oku(env, "venom:kopruAlarm:BLACKROSE", null) } }); }
  }
  await kaydet(env, "venom:claudeIslemSonuc", { zaman: simdi, sonuc }, 3 * 86400);
}
// ---------- 6 Kasım: SİTE DEFTERİ (Selin sayar; Venom sadece buna bakar) ----------
const MARKA_AD = { BLACKROSE: "BLACK ROSE", VOLONTE: "VOLONTE" };
export async function defterMetni(env, { kod = null, filtre = "hepsi" } = {}) {
  const d = await env.KAYIT.get("venom:siteDefteri", "json").catch(() => null);
  if (!d || !d.modeller) return "Site defteri henüz hazır değil (Selin sayıyor). Tahmin etmiyorum.";
  const satir = (m) => `${m.kod} — ${MARKA_AD[m.marka] || `marka belirsiz (${m.markaNot || "Sami'de kayıt yok"})`} · renk: ${(m.renkler || []).join(", ") || "kayıtlı değil"} · ${m.foto} foto · ${m.video ? `${m.video} video${m.videoOynuyor < m.video ? ` (${m.video - m.videoOynuyor} oynamıyor)` : ""}` : "videosuz"}${m.videoBekleniyor ? ` · 📹 Merdan'dan video bekleniyor (önceki ${m.bekleyenMb} MB)` : ""}${m.gizli ? " · gizli (stok yok)" : ""} · eklenme ${m.eklenme || "?"}`;
  if (kod) { const m = d.modeller[String(kod).replace(/\D/g, "")]; return m ? satir(m) : `${kod} sitede yok (site defteri, ${new Date((d.zaman + 3 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ")}).`; }
  const hepsi = Object.values(d.modeller).filter((m) => !m.gizli);
  const l = filtre === "videosuz" ? hepsi.filter((m) => !m.video) : filtre === "fotografsiz" ? hepsi.filter((m) => !m.foto) : filtre === "video_bekleyen" ? hepsi.filter((m) => m.videoBekleniyor)
    : filtre === "black_rose" ? hepsi.filter((m) => m.marka === "BLACKROSE") : filtre === "volonte" ? hepsi.filter((m) => m.marka === "VOLONTE") : hepsi;
  const ad = { videosuz: "Videosuz", fotografsiz: "Fotoğrafsız", video_bekleyen: "Merdan'dan video bekleyen", black_rose: "BLACK ROSE", volonte: "VOLONTE", hepsi: "Sitedeki" }[filtre] || "Sitedeki";
  return `${ad} ${l.length} model (site defteri):\n${l.slice(0, 60).map((m, i) => `${i + 1}. ${satir(m)}`).join("\n")}${l.length > 60 ? `\n… (+${l.length - 60})` : ""}`;
}
// Telegram'da tablo YOK: Markdown tablo satırları düz numaralı listeye çevrilir
export function tabloyuListeyeCevir(metin) {
  const satirlar = String(metin || "").split("\n"), cikti = [];
  let baslik = null, n = 0;
  for (const s of satirlar) {
    if (/^\s*\|.*\|\s*$/.test(s)) {
      const h = s.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
      if (h.every((x) => /^:?-{2,}:?$/.test(x))) continue;
      if (!baslik) { baslik = h; continue; }
      n++; cikti.push(`${n}. ${h.map((x, i) => (baslik[i] && i ? `${baslik[i]}: ${x}` : x)).filter((x) => x && !/:\s*$/.test(x)).join(" · ")}`);
    } else { baslik = null; n = 0; cikti.push(s); }
  }
  return cikti.join("\n");
}
// ---------- 6 Kasım: sabit düğmeler, durdur/aç, sesli rapor, haftalık özet, fikir kutusu ----------
const SABIT_KLAVYE = { keyboard: [[{ text: "📋 Bekleyenler" }, { text: "📊 Bugün ne oldu" }, { text: "⛔ Durdur" }]], resize_keyboard: true, is_persistent: true };
const BOT_ADLAR = { kemal: "kemal", selin: "selin", pelin: "pelin", sami: "sami" };
// ---------- 9 Kasım (Patron): VENOM = MÜDÜR — iş defteri + botların canlı özeti ----------
function gunAraligi(simdi, gun) {
  const bas = Math.floor(Date.parse(`${gunAnahtari(simdi)}T00:00:00+03:00`) / 1000);
  return gun === "dün" ? [bas - 86400, bas - 1] : [bas, simdi];
}
export async function canlilarAl(env, sadeceCanli = false) {
  const c = {};
  const k = await botaSor(env, "kemal", "ozet"); if (k) c.kemal = canliSatirlar("kemal", k);
  const se = await botaSor(env, "selin", "ozet"); if (se) c.selin = canliSatirlar("selin", se);
  const p = await oku(env, "venom:pelinDurum", null); if (p) { c.pelin = canliSatirlar("pelin", p); c.nora = canliSatirlar("nora", p); }
  const fs = env.STOK ? await stokIste(env, "/ayar-oku", { k: "fs:acik" }).catch(() => null) : null;
  if (fs && fs.v) c.sami = canliSatirlar("sami", { fabrikaAcik: JSON.parse(fs.v).filter((x) => !String(x).startsWith("D")) });
  return c;
}
export async function defterVerisi(env, simdi, gun = "bugün") {
  const [basla, bitis] = gunAraligi(simdi, gun);
  const satirlar = env.STOK ? await stokIste(env, "/isd-oku", { basla, bitis }).catch(() => []) : [];
  const canlilar = gun === "bugün" ? await canlilarAl(env).catch(() => ({})) : {};
  return { satirlar: Array.isArray(satirlar) ? satirlar : [], canlilar };
}
// ---------- 9 Kasım (Patron): HER SORUYA TAM CEVAP — bot raporu = dönem + BÜTÜN kaynaklar ----------
const gunStr9 = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const gg9 = (t) => { const x = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${x.slice(8, 10)}.${x.slice(5, 7)}`; };
export async function botRaporuMetni(env, bot, donem, simdi, { parca = null, satirlar = null } = {}) {
  const [basla, bitis] = donemAraligi(simdi, donem);
  if (!satirlar) { const k = env.STOK ? await stokIste(env, "/isd-oku", { basla, bitis }).catch(() => []) : []; satirlar = Array.isArray(k) ? k : []; }
  const adlar = await kisiAdlari(env).catch(() => ({}));
  const e2 = { ...env, __adlar: adlar };
  const bolum = [], bakilan = ["iş defteri"];
  const benim = satirlar.filter((x) => x.bot === bot);
  if (benim.length) bolum.push({ baslik: "İş defteri", satirlar: botOzeti(e2, bot, satirlar, null).filter((x) => x !== "hata yok") });
  if (bot === "kemal") {
    bakilan.push("kanal kaydı");
    const kodlar = (await oku(env, "kodlar", {})) || {}, son = (await oku(env, "sonpaylasim", {})) || {};
    const gonderi = new Set();
    for (const [kod, l] of Object.entries(kodlar)) for (const x of l || []) if (x.tarih >= basla && x.tarih <= bitis) gonderi.add(`${kod}|${x.album || x.ids && x.ids[0]}`);
    for (const [kod, t] of Object.entries(son)) if (t >= basla && t <= bitis && ![...gonderi].some((g) => g.startsWith(`${kod}|`))) gonderi.add(`${kod}|s`);
    const kl = [...gonderi].map((g) => g.split("|")[0]);
    if (kl.length) bolum.push({ baslik: "Kanal", satirlar: [`${kl.length} paylaşım: ${kodSayili(kl)}`] });
    const c = await botaSor(env, "kemal", "ozet");
    if (c && donem === "bugün") bolum.push({ baslik: "Şu an", satirlar: canliSatirlar("kemal", c) });
    if (c && c.kuyruk && c.kuyruk.length && donem !== "bugün") bolum.push({ baslik: "Bekleyen", satirlar: [`kanal sırasında ${c.kuyruk.length}: ${kodSayili(c.kuyruk)}`] });
  }
  if (bot === "selin") {
    bakilan.push("site defteri", "Selin kaydı");
    const d = await oku(env, "venom:siteDefteri", null);
    const ek = Object.values((d && d.modeller) || {}).filter((m) => m.eklenme && m.eklenme >= gunStr9(basla) && m.eklenme <= gunStr9(bitis)).map((m) => m.kod);
    if (ek.length) bolum.push({ baslik: "Site", satirlar: [`${ek.length} model siteye eklendi: ${kodSayili(ek)}`] });
    const c = await botaSor(env, "selin", "ozet");
    if (c) bolum.push({ baslik: "Bekleyen", satirlar: [c.onayda && c.onayda.length ? `onay bekleyen taslak ${c.onayda.length}: ${kodSayili(c.onayda)}` : null, c.takilan && c.takilan.length ? `fotoğrafı gönderilemeyen ${c.takilan.length}: ${kodSayili(c.takilan.map((x) => x.kod))}` : null, c.fotoBekleyen && c.fotoBekleyen.length ? `fotoğraf istenip gelmeyen ${c.fotoBekleyen.length}` : null] });
  }
  if (bot === "sami") {
    bakilan.push("fabrika kayıtları", "Vegawin köprüsü");
    const veri = env.STOK ? await stokIste(env, "/repete-veri", {}).catch(() => null) : null;
    const fs = ((veri && veri.fs) || []).filter((f) => f.gonderim >= basla && f.gonderim <= bitis);
    if (fs.length) {
      const say = {}; for (const f of fs) say[f.durum] = (say[f.durum] || 0) + 1;
      const ad9 = { bekliyor: "cevapsız", gelecek: "gelecek", repete: "repete", bitti: "bitti", geldi: "geldi", kapandi: "kapandı" };
      bolum.push({ baslik: "Fabrika", satirlar: [`${fs.length} sipariş gitti: ${kodSayili(fs.map((f) => f.kod))}`, `durum: ${Object.entries(say).map(([d, n]) => `${n} ${ad9[d] || d}`).join(", ")}`, ...fs.filter((f) => f.cevaplayan).slice(0, 8).map((f) => `${f.kod}: ${ad9[f.durum] || f.durum} (${f.cevaplayan}${f.hazirGun ? `, ${String(f.hazirGun).slice(8, 10)}.${String(f.hazirGun).slice(5, 7)} hazır` : ""})`)] });
    }
    const oz = env.STOK ? await stokIste(env, "/ozet", {}).catch(() => null) : null;
    if (oz && oz.kopruler) bolum.push({ baslik: "Vegawin", satirlar: oz.kopruler.filter((k) => k.kalp || k.son).map((k) => `köprü ${k.magaza === "BLACKROSE" ? "BLACK ROSE" : k.magaza}: son sinyal ${tarihSaat(Math.max(k.son || 0, k.kalp || 0)).slice(0, 16)}`) });
  }
  if (bot === "pelin" || bot === "nora") {
    bakilan.push(bot === "pelin" ? "Pelin üretim arşivi, harcama kaydı, bakiye" : "Nora senaryoları");
    const r = await botaSor(env, "pelin", "rapor", { basla, bitis }).catch(() => null);
    const d = await oku(env, "venom:pelinDurum", null);
    if (bot === "pelin") {
      if (r && r.isler && !r.isler.length) bolum.push({ baslik: "Üretim", satirlar: [`${donem} üretim yok${r.son ? ` — son iş: ${r.son.kod}${r.son.renk ? ` ${r.son.renk}` : ""} (${gg9(r.son.zaman)}, ${r.son.durum})` : ""}`] });
      if (r && r.isler && r.isler.length) bolum.push({ baslik: "Üretim", satirlar: [`${r.isler.length} iş: ${kodSayili(r.isler.map((x) => x.kod))}`, ...r.isler.slice(0, 10).map((x) => `${x.kod}${x.renk ? ` ${x.renk}` : ""}: ${x.durum}${x.maliyet ? ` · ${usd(x.maliyet)}` : ""} (${gg9(x.zaman)})`)] });
      const h = (r && r.harcama) || null;
      bolum.push({ baslik: "Harcama", satirlar: [h ? `bu ay ${usd(h.toplam)} (fal ${usd(h.fal)} · Higgsfield ${usd(h.hf)} · OpenAI ${usd(h.openai)} · Claude ${usd(h.claude)})${h.donem != null && donem !== "bu ay" ? ` · ${donem}: ~${usd(h.donem)}` : ""}` : d && d.ay != null ? `bu ay ${usd(d.ay)}` : null] });
      const bek = [...((r && r.bekleyen) || []), ...((d && d.isler) || []).map((x) => `${x.kod} ${x.durum || ""}`.trim())];
      bolum.push({ baslik: "Bekleyen / yarım", satirlar: bek.length ? [...new Set(bek)].slice(0, 10) : ["bekleyen ya da yarım iş yok"] });
      const b = (r && r.bakiye) || {};
      bolum.push({ baslik: "Bakiye", satirlar: [`Higgsfield: ${b.hf != null ? `~${usd(b.hf)} (tahmini: yüklenen − harcanan)${b.hf < 5 ? " ⚠️ 5 $ altı" : ""}` : b.hfNot || "sorgulanamıyor (API bakiye vermiyor)"}`, `fal: ${b.fal != null ? `~${usd(b.fal)} (tahmini)${b.fal < 5 ? " ⚠️ 5 $ altı" : ""}` : b.falNot || "sorgulanamıyor"}`] });
    } else {
      const n = (r && r.nora) || null;
      bolum.push({ baslik: "Senaryolar", satirlar: n ? [n.bekleyen && n.bekleyen.length ? `bekleyen ${n.bekleyen.length}: ${n.bekleyen.join(", ")}` : "bekleyen senaryo yok", n.yazilan && n.yazilan.length ? `yazılan (${donem}) ${n.yazilan.length}: ${n.yazilan.join(", ")}` : null] : [] });
    }
  }
  return raporMetni(bot, donem, bolum, bakilan);
}
// 10 Kasım (Patron): bot başına günlük harcama (Kemal, Selin: harcama-gun; Pelin: pelin-gun; Sami beyni ve Venom: ay toplamı − gün başı)
export async function gunlukHarcamalar(env, simdi) {
  const gun = gunAnahtari(simdi), ay9 = gun.slice(0, 7);
  const n = async (k) => Number((await env.KAYIT.get(k).catch(() => 0)) || 0);
  const samiAy = env.STOK ? Number(JSON.parse((await stokIste(env, "/ayar-oku", { k: `beyin:harcama:${ay9}` }).catch(() => ({}))).v || "0")) : 0;
  const venomAy = await venomHarcanan(env, simdi);
  let baz = await oku(env, `venom:paraBaz:${gun}`, null);
  if (!baz || baz.ay !== ay9) { baz = { ay: ay9, sami: gun.endsWith("-01") ? 0 : samiAy, venom: gun.endsWith("-01") ? 0 : venomAy }; await kaydet(env, `venom:paraBaz:${gun}`, baz, 3 * 86400); }
  return { kemal: (await n(`harcama-gun:kemal:${gun}`)) / 1e6, selin: (await n(`harcama-gun:selin:${gun}`)) / 1e6, pelin: await n(`pelin-gun:${gun}`), sami: Math.max(0, samiAy - baz.sami), venom: Math.max(0, venomAy - baz.venom) };
}
export async function paraAlarmi(env, simdi) {
  const gun = gunAnahtari(simdi);
  const h = await gunlukHarcamalar(env, simdi);
  await kaydet(env, `venom:paraGun:${gun}`, h, 10 * 86400);
  const ad = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", sami: "Sami", venom: "Venom" };
  const usd2 = (x) => `${x.toFixed(2).replace(".", ",")} $`;
  // 13 Kasım (Patron, kural 74): sınırlar kitaptaki TEK tablodan; bot aylık sınırının %80'ine gelince Patron'a tek satır
  // (ayda bir kez; gece yazılmaz — 09:00–21:00). Venom ve Pelin kendi %80 uyarısını kendi sayacından verir.
  const s9 = ((simdi + SAAT_FARKI) % 86400) / 3600;
  if (s9 >= 9 && s9 < 21) {
    const ay9 = gun.slice(0, 7);
    const samiAy = env.STOK ? Number(JSON.parse((await stokIste(env, "/ayar-oku", { k: `beyin:harcama:${ay9}` }).catch(() => ({}))).v || "0")) : 0;
    const ayH = { kemal: Number((await env.KAYIT.get(`harcama-ay:kemal:${ay9}`).catch(() => 0)) || 0) / 1e6, selin: Number((await env.KAYIT.get(`harcama-ay:selin:${ay9}`).catch(() => 0)) || 0) / 1e6, sami: samiAy };
    for (const bot of ["kemal", "selin", "sami"]) {
      const sinir = (await botSiniri(env, bot, simdi)).ay;
      if (!sinir || ayH[bot] < sinir * 0.8 || (await env.KAYIT.get(`venom:para80:${bot}:${ay9}`))) continue;
      await env.KAYIT.put(`venom:para80:${bot}:${ay9}`, "1", { expirationTtl: 40 * 86400 });
      await bildir(env, `⚠️ ${ad[bot]} bu ay sınırının %80'ine geldi: ${usd2(ayH[bot])} / ${sinir} $.`, { simdi, tur: "kart", izin: "para" });
    }
  }
  for (const bot of Object.keys(h)) {
    const gecmis = [];
    for (let i = 1; i <= 7; i++) { const g = await oku(env, `venom:paraGun:${gunAnahtari(simdi - i * 86400)}`, null); if (g && g[bot] != null) gecmis.push(Number(g[bot])); }
    const ort = gecmis.length ? gecmis.reduce((a, b) => a + b, 0) / gecmis.length : null;
    if (ort != null && gecmis.length >= 3 && h[bot] >= 0.5 && h[bot] > 3 * ort && (await ilkKezBugun(env, `para3x:${bot}:${gun}`))) await bildir(env, `⚠️ ${ad[bot]} bugün olağanın 3 katından fazla harcadı: ${usd2(h[bot])} (son ${gecmis.length} gün ortalaması ${usd2(ort)}).`, { simdi, tur: "kart", izin: "para" });
  }
  return h;
}
export const BAKIYE_ESIK = 5;
async function bakiyeUyarisi(env, simdi) {
  const r = await botaSor(env, "pelin", "rapor", { basla: simdi, bitis: simdi });
  const b = (r && r.bakiye) || {};
  for (const [t, ad] of [["hf", "Higgsfield"], ["fal", "fal"]]) {
    if (b[t] == null || b[t] >= BAKIYE_ESIK || !(await ilkKezBugun(env, `bakiye:${t}:${gunAnahtari(simdi)}`))) continue;
    await bildir(env, `⚠️ ${ad} bakiyesi düşük: tahmini ~${usd(b[t])} (5 $ altı). Pelin'in üretimi yarıda kalmasın diye yükleme gerekebilir. Yükleyince bana "${ad}'a 20 $ yükledim" yazın.`, { simdi, tur: "kart", izin: "para" });
  }
}
// "Higgsfield'a 50 $ yükledim" / "fal'a 20 dolar yükledim" → bakiye takibi (yüklenen − o tarihten beri harcanan)
export function yuklemeCoz(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  const m = t.match(/(higgsfield|higgs|fal)\S*\s+(?:hesab\S*\s+)?(\d+(?:[.,]\d+)?)\s*(?:\$|dolar|usd)?\s*(?:yükledim|yüklendi|ekledim|attım)/);
  return m ? { tur: /^h/.test(m[1]) ? "hf" : "fal", tutar: Number(m[2].replace(",", ".")) } : null;
}
// 9 Kasım (Patron): iş defteri 1 Kasım'dan doldurulur (defter açılmadan önceki kayıtlar): Kemal kanal kaydı, Selin site defteri,
// Pelin üretim arşivi. Fabrika geçmişini Sami kendisi doldurur. Bir kez (KV "venom:defterDoldur"), sonuç "venom:defterDoldurSonuc".
export async function defterDoldur(env, simdi) {
  const ilk = Math.floor(Date.parse("2026-11-01T00:00:00+03:00") / 1000);
  const mevcut = await stokIste(env, "/isd-oku", { basla: ilk, bitis: simdi }).catch(() => []);
  const t0 = Math.min(simdi, ...(Array.isArray(mevcut) ? mevcut : []).filter((r) => r.sonuc !== "geçmiş kayıt").map((r) => Number(r.zaman)));
  const k = [], say = { kemal: 0, selin: 0, pelin: 0, nora: 0 };
  const ekle = (r) => { k.push({ ...r, sonuc: "geçmiş kayıt" }); say[r.bot] = (say[r.bot] || 0) + 1; };
  const gor = new Set();
  for (const [kod, l] of Object.entries((await oku(env, "kodlar", {})) || {})) for (const x of l || []) {
    const a = `${kod}|${x.album || (x.ids && x.ids[0])}`;
    if (x.tarih >= ilk && x.tarih < t0 && !gor.has(a)) { gor.add(a); ekle({ zaman: x.tarih, bot: "kemal", tur: "is", kod, ozet: "kanala paylaşıldı" }); }
  }
  const d = await oku(env, "venom:siteDefteri", null);
  for (const m of Object.values((d && d.modeller) || {})) {
    const z = m.eklenme ? Math.floor(Date.parse(`${m.eklenme}T12:00:00+03:00`) / 1000) : 0;
    if (z >= ilk && z < t0) ekle({ zaman: z, bot: "selin", tur: "is", kod: m.kod, ozet: "siteye eklendi" });
  }
  const r = await botaSor(env, "pelin", "rapor", { basla: ilk, bitis: t0 }).catch(() => null);
  for (const x of (r && r.isler) || []) if (x.zaman >= ilk && x.zaman < t0) ekle({ zaman: x.zaman, bot: "pelin", tur: "is", kod: x.kod, ozet: `üretim: ${x.kod}${x.renk ? ` ${x.renk}` : ""} — ${x.durum}${x.maliyet ? ` (${usd(x.maliyet)})` : ""}` });
  for (const x of (r && r.noraIsler) || []) if (x.zaman >= ilk && x.zaman < t0) ekle({ zaman: x.zaman, bot: "nora", tur: "is", kod: x.kod || null, ozet: `senaryo: ${x.ozet || x.kod || ""}`.slice(0, 120) });
  for (let i = 0; i < k.length; i += 40) await stokIste(env, "/isd-yaz", { kayitlar: k.slice(i, i + 40) }).catch(() => null);
  return { t0, ...say, pelinRaporu: Boolean(r) };
}
// 9 Kasım (Patron): "/rol <ad> fiyat|fabrika|celal|sil" — Sami'nin kişi listelerinde rol değişir (fabrika eksik listesi / sadece fiyat)
export async function rolDegistir(env, ad, rol, simdi) {
  if (/^aziz$/i.test(ad) && env.AZIZ_ID) return rol === "stok" ? "Aziz zaten VOLONTE stok sorumlusu (stok bitti / bulunamadı / sayım / fotoğrafsız VOLONTE / görev kartları; fiyat, satış, para yok)." : "Aziz'in rolü ekip kaydında (gizli kayıt) tanımlı; değiştirmek için Claude Code'a söyleyin.";
  const fab = (await oku(env, "sami:fabrikaKisiler", [])) || [], fiy = (await oku(env, "sami:fiyatKisiler", [])) || [], stk = (await oku(env, "sami:stokKisiler", [])) || [];
  const es = (k) => String(k.ad || "").toLocaleLowerCase("tr").startsWith(String(ad).toLocaleLowerCase("tr")) || String(k.kullanici || "").toLowerCase() === String(ad).replace(/^@/, "").toLowerCase();
  const k = fab.find(es) || fiy.find(es) || stk.find(es);
  if (!k) return `"${ad}" Sami'nin listelerinde yok. Önce Sami'ye /start yazsın, kart size gelir.`;
  const kayit = { id: k.id, ad: k.ad, kullanici: k.kullanici || null, zaman: simdi };
  const yeniFab = fab.filter((x) => String(x.id) !== String(k.id)), yeniFiy = fiy.filter((x) => String(x.id) !== String(k.id)), yeniStk = stk.filter((x) => String(x.id) !== String(k.id));
  if (rol === "stok") yeniStk.push(kayit);
  await kaydet(env, "sami:stokKisiler", yeniStk);
  if (rol === "fabrika" || rol === "celal") yeniFab.push({ ...kayit, grup: rol === "celal" ? "celal" : "fabrika" });
  if (rol === "fiyat") yeniFiy.push(kayit);
  await kaydet(env, "sami:fabrikaKisiler", yeniFab);
  await kaydet(env, "sami:fiyatKisiler", yeniFiy);
  return `Tamam: ${k.ad} → ${{ fiyat: "mağaza, sadece fiyat (kod yazınca satış fiyatı; başka hiçbir şey gitmez)", stok: "mağaza stok (VOLONTE; fiyat, satış, para yok)", fabrika: "fabrika (Fuat'ın ekibi)", celal: "Celal'in ekibi", sil: "listelerden çıkarıldı", çıkar: "listelerden çıkarıldı" }[rol]}.`;
}
// 9 Kasım (Patron): "/ekip" — herkesin rolü tek listede (kimlik yazılmaz)
export async function ekipMetni(env) {
  const fab = (await oku(env, "sami:fabrikaKisiler", [])) || [], fiy = (await oku(env, "sami:fiyatKisiler", [])) || [], stk = (await oku(env, "sami:stokKisiler", [])) || [];
  const var_ = (k) => String(env[k] || "").trim() !== "";
  const s = ["👥 Ekip ve roller:",
    "• Patron — her şeyin son kararı; fiyat, kâr, para sadece sizde",
    `• Hemra — koordinatör (Venom'un muhatabı, 11:00 / 16:00 toplu liste)${var_("HEMRA_ID") || var_("FABRIKA_SORUMLU") ? "" : " ⚠️ kayıtlı değil"}`,
    `• Merdan — Black Rose (stok, fotoğraf, video, Black Rose kartları); Hemra izinliyse yedek koordinatör${var_("BR_SORUMLU") ? "" : " ⚠️ kayıtlı değil"}`,
    `• Aziz — VOLONTE stok (stok bitti, bulunamadı, sayım, fotoğrafsız VOLONTE, görev kartları; fiyat/satış/para yok)${var_("AZIZ_ID") ? "" : " ⚠️ kayıtlı değil"}`,
    ...stk.map((k) => `• ${k.ad} — mağaza stok (VOLONTE)`),
    ...fiy.map((k) => `• ${k.ad} — mağaza, sadece fiyat (Sami'de kod → satış fiyatı)`),
    ...fab.map((k) => `• ${k.ad} — ${k.grup === "celal" ? "Celal'in ekibi (sadece Celal modelleri)" : "fabrika (Fuat'ın ekibi): eksik listesi + sipariş kartları"}`),
    "Değiştirmek için: /rol <ad> fiyat | stok | fabrika | celal | sil"];
  return s.join("\n");
}
// 9 Kasım (Patron): kişi adları — fabrika kişileri (Sinem, Fuat, Nuri, Celal) Sami'nin kaydından; kimlikler sadece eşleşme için
export async function kisiAdlari(env) {
  const l = [...((await oku(env, "sami:fabrikaKisiler", [])) || []), ...((await oku(env, "sami:fiyatKisiler", [])) || [])];
  const adlar = {};
  for (const k of Array.isArray(l) ? l : []) if (k && k.id != null && k.ad) adlar[String(k.id)] = String(k.ad).split(" ")[0];
  return adlar;
}
// "Sinem / Hemra bugün hangi kartlara ne cevap verdi?" → defterden (ücretsiz). null = kişi sorusu değil
export async function kisiCevabiMetni(env, metin, simdi) {
  const adlar = await kisiAdlari(env);
  const ks = kisiSorusu(metin, ["Hemra", "Merdan", "Fuat", "Nuri", ...Object.values(adlar)]);
  if (!ks) return null;
  const [basla, bitis] = donemAraligi(simdi, ks.gun);
  const k9 = env.STOK ? await stokIste(env, "/isd-oku", { basla, bitis }).catch(() => []) : [];
  const satirlar = Array.isArray(k9) ? k9 : [];
  return kisiCevabi({ ...env, __adlar: adlar }, ks.kisi, satirlar, { gun: ks.gun, gorevler: await oku(env, "venom:gorevler", []) });
}
// 09:00 ve 19:30: botların raporu (Venom'da kalır; Patron'a ayrı gitmez — 09:40 / 20:00 özetine girer)
async function botRaporuAl(env, simdi, ne) {
  const { satirlar, canlilar } = await defterVerisi(env, simdi, "bugün");
  const dunAksam = ne === "sabah" ? (await stokIste(env, "/isd-oku", { basla: simdi - 14 * 3600, bitis: simdi }).catch(() => [])) : satirlar;
  const metin = herkesCevabi(env, Array.isArray(dunAksam) ? dunAksam : [], canlilar, { gun: ne === "sabah" ? "gece ve sabah" : "bugün" });
  await kaydet(env, `venom:botRapor:${gunAnahtari(simdi)}:${ne}`, { zaman: simdi, metin }, 3 * 86400);
  return metin;
}
// Takılan kart: 3 saattir cevapsız (Hemra/Merdan) → kişi başı bir kez hatırlatma (Sami üzerinden)
async function takilanHatirlat(env, simdi) {
  if (!env.STOK) return;
  const bekleyen = await stokIste(env, "/isd-bekleyen", { enEski: simdi - 3 * 86400 }).catch(() => []);
  for (const t of takilanlar(env, Array.isArray(bekleyen) ? bekleyen : [], simdi)) {
    await aracCalistir(env, "hatirlat", { kime: t.kisi.toLocaleLowerCase("tr"), metin: t.metin }, simdi).catch(() => null);
    await stokIste(env, "/isd-isaretle", { idler: t.idler, alan: "hatirlatildi" }).catch(() => null);
    await biriktir(env, { kaynak: "venom", metin: `🔔 ${t.kisi}'a hatırlattım: ${t.idler.length} kart bekliyor`, tur: "bilgi" }, simdi);
  }
}

// ---------- 9 Kasım (Patron): KISA MODEL KARTI ----------
const gunA9 = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
export async function modelVerisi(env, kod, simdi) {
  const oz = await stokIste(env, "/model-ozet", { kod, bas7: gunA9(simdi - 6 * 86400), bas14: gunA9(simdi - 13 * 86400), bitis: gunA9(simdi) }).catch(() => null);
  const d = await oku(env, "venom:siteDefteri", null);
  const sd = d && d.modeller ? d.modeller[String(kod)] : null;
  if (!oz || (!(oz.satirlar || []).length && !sd)) return null;
  const mk = await markaKesin(env, String(kod)).catch(() => ({}));
  const ad = (x) => String(x || "").toUpperCase().replace(/\s+/g, "");
  const stok = {};
  for (const r of oz.satirlar || []) stok[ad(r.magaza)] = Number(r.adet) || 0;
  const marka = mk.marka || null;
  const s7 = marka ? Number(oz.s7[marka] || 0) : Object.entries(oz.s7).map(([m, n]) => `${m === "BLACKROSE" ? "BLACK ROSE" : m} ${n}`).join(" · ") || 0; // marka belirsizse mağazalar AYRI (toplanmaz)
  const s14 = marka ? Number(oz.s14[marka] || 0) : 0;
  const veriGun = oz.ilkGun ? Math.round((Date.parse(gunA9(simdi)) - Date.parse(oz.ilkGun)) / 864e5) + 1 : 14;
  // 9 Kasım (Patron): hangi manken — model kartındaki seri (pelinboy) ya da sitedeki bedenler (manken.js kuralı)
  const pb = await oku(env, `pelinboy:${kod}`, null).catch(() => null);
  const su = (await siteVerisi(env).catch(() => [])).find?.((u) => String(u.kod) === String(kod)) || null;
  const bedenler = (su && su.bedenler) || null;
  const manken = (pb && ["buyuk", "kucuk"].includes(pb.seri)) ? pb.seri : bedenler ? seriBul(bedenler) : null;
  return { kod: String(kod), marka, stok, s7, s14, gun14: Math.min(14, Math.max(1, veriGun)), fs: oz.fs || [], sitede: Boolean(sd && !sd.gizli), gizli: oz.karar && oz.karar.durum === "gizli", manken, bedenler };
}
async function tgForm(env, metod, form, izin = null) {
  if (!(await izinKapisi(env, metod, form.get("chat_id"), izin || env.__izin, form.get("caption") || `(${metod})`))) return { ok: false, engellendi: true, description: "izin nedeni yok" };
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${metod}`, { method: "POST", body: form });
  return r.json().catch(() => ({ ok: false }));
}
// C2: gizlilik süzgeci (fiyat, kâr, ciro, alış, müşteri…) her satıra uygulanır. Stok/satış satırını Patron istedi (9 Kasım); satış adedi
// kural 2 gereği gizli olduğu için kart İLETİLEMEZ gönderilir (protect_content: Hemra/Merdan/Fuat'a geçemez).
const temizSatir = (l) => l.filter((x) => /^Stok/.test(x) || !fuatSuzgec(x));
async function selinFotoIste(env, kod, simdi) {
  const l = await oku(env, "venom:selinFotoIste", []);
  if (!l.some((x) => String(x.kod) === String(kod))) await kaydet(env, "venom:selinFotoIste", [...l.filter((x) => simdi - (x.zaman || 0) < 14 * 86400), { kod: String(kod), zaman: simdi }].slice(-50), 15 * 86400);
}
export async function modelKarti(env, kodlar, simdi) {
  const veriler = [], bilinmeyen = [];
  for (const kod of [...new Set(kodlar)].slice(0, 5)) { const v = await modelVerisi(env, kod, simdi); if (v) veriler.push(v); else bilinmeyen.push(kod); }
  if (!veriler.length) return yaz(env, `${bilinmeyen.join(", ")}: bu kodu Vegawin'de ve sitede bulamadım Patron. Kodu kontrol eder misiniz?`);
  for (const v of veriler) {
    const f = await botaSor(env, "kemal", "modelFoto", v.kod);
    v.foto = f && f.ok && f.bayt ? f.bayt : null;
    v.fotoKaynak = f && f.kaynak;
    if (!v.foto) { v.fotoYok = true; if (!v.sitede && !stokBitti(v)) await selinFotoIste(env, v.kod, simdi); } // 13 Kasım: stoğu 0 olan model fotoğraf listesine eklenmez
  }
  const pm = (x) => ({ posta: { tur: "cevap" }, protect_content: true });
  if (veriler.length === 1) {
    const v = veriler[0];
    const metin = [...temizSatir(kartSatirlari(v)), ...(bilinmeyen.length ? [`(${bilinmeyen.join(", ")} bulunamadı)`] : [])].join("\n");
    const kl = { inline_keyboard: kartDugmeleri(v.kod, "", stokBitti(v)) };
    if (v.foto) {
      const f = new FormData();
      f.append("chat_id", patron(env)); f.append("photo", new Blob([v.foto], { type: "image/jpeg" }), `${v.kod}.jpg`); f.append("caption", metin.slice(0, 1000)); f.append("reply_markup", JSON.stringify(kl)); f.append("protect_content", "true");
      const r = await tgForm(env, "sendPhoto", f);
      if (r.ok) { await gonderildiKaydet(env, { kaynak: "venom", tur: "cevap", metin, id: r.result.message_id }, simdi).catch(() => null); return r; }
    }
    return yaz(env, metin, { reply_markup: kl, ...pm() });
  }
  const fotolu = veriler.filter((v) => v.foto);
  if (fotolu.length) {
    const f = new FormData(), medya = [];
    fotolu.forEach((v) => { const i = veriler.indexOf(v) + 1; f.append(`m${i}`, new Blob([v.foto], { type: "image/jpeg" }), `m${i}.jpg`); medya.push({ type: "photo", media: `attach://m${i}`, caption: `${i} · ${v.kod}` }); });
    f.append("chat_id", patron(env));
    if (medya.length === 1) { f.append("photo", f.get(medya[0].media.slice(9))); f.append("caption", medya[0].caption); await tgForm(env, "sendPhoto", f); }
    else { f.append("media", JSON.stringify(medya)); await tgForm(env, "sendMediaGroup", f); }
  }
  const metin = [`📦 ${veriler.length} model:`, ...veriler.flatMap((v, i) => temizSatir(kartSatirlari(v)).slice(0, 3).map((x, j) => (j === 0 ? `${i + 1}. ${x.replace(/^📦 /, "")}` : `   ${x}`))), ...(veriler.some((v) => v.fotoYok && !v.sitede && !stokBitti(v)) ? ["📷 Fotoğrafı olmayanları Selin'in fotoğraf listesine ekledim."] : []), ...(bilinmeyen.length ? [`(${bilinmeyen.join(", ")} bulunamadı)`] : [])].join("\n");
  return yaz(env, metin, { reply_markup: { inline_keyboard: veriler.flatMap((v, i) => kartDugmeleri(v.kod, `${i + 1}· `, stokBitti(v))) }, ...pm() });
}
// Kodsuz fotoğraf: ücretsiz yollar (kanaldan iletilmiş, yazısında kod var, kanaldaki aynı dosya) → yoksa maliyeti söyleyip sorar
export async function fotoModelBul(env, b, simdi) {
  let kod = kodlariBul(b.caption || "")[0] || null;
  if (!kod && b.fwdMsg) {
    const kanal = await oku(env, "kanal", null);
    if (!kanal || !b.fwdChat || Number(b.fwdChat) === Number(kanal.id)) {
      const kodlar = await oku(env, "kodlar", {});
      kod = Object.keys(kodlar).find((k) => (kodlar[k] || []).some((g) => (g.ids || []).includes(Number(b.fwdMsg)))) || null;
    }
  }
  if (!kod && b.uid) kod = (await oku(env, "venom:fotoIz", {}))[b.uid] || null;
  if (kod) return modelKarti(env, [kod], simdi);
  const rid = kisaId();
  await kaydet(env, `venom:bot:taniBekle:${rid}`, { file_id: b.file_id, caption: b.caption || "" }, 3 * 3600).catch(() => null);
  return yaz(env, "🔎 Bu fotoğrafın modelini ücretsiz yoldan bulamadım (kanaldan iletilmemiş, üzerinde kod yok). Kodu yazın ya da yapay zekâyla bakayım — emin olmazsam \"bu mu?\" diye soracağım, yanlış modelin stoğunu söylemem.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Yapay zekâyla bul (~0,10 $)", callback_data: `vmk:t:${rid}` }], [{ text: "✏️ Kodu yazacağım", callback_data: `vmk:y:${rid}` }]] }, posta: { tur: "cevap" } });
}
async function modelKartDugmesi(env, cq, simdi, cevap) {
  const [, islem, x] = String(cq.data).split(":");
  if (islem === "y") { await cevap("Tamam"); return yaz(env, "Kodu yazın Patron (ör. 3629 ya da sesli \"36 29\")."); }
  if (islem === "k") { await cevap("Bakıyorum"); return modelKarti(env, [x], simdi); }
  if (islem === "t") {
    const b = await oku(env, `venom:bot:taniBekle:${x}`, null);
    if (!b) return cevap("Bu fotoğraf artık geçerli değil; tekrar gönderin.");
    await env.KAYIT.delete(`venom:bot:taniBekle:${x}`).catch(() => null);
    await cevap("Yapay zekâyla bakıyorum (~0,10 $)");
    const f = await tg(env, "getFile", { file_id: b.file_id });
    const r = f && f.ok ? await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN).trim()}/${f.result.file_path}`).catch(() => null) : null;
    if (!r || !r.ok) return yaz(env, "Fotoğrafı indiremedim; tekrar gönderir misiniz?");
    const bayt = new Uint8Array(await r.arrayBuffer());
    let s2 = ""; for (let i = 0; i < bayt.length; i += 0x8000) s2 += String.fromCharCode.apply(null, bayt.subarray(i, i + 0x8000));
    const t = await botaSor(env, "kemal", "fotoTani", btoa(s2), b.caption || "");
    if (!t || !t.ok) return yaz(env, `Tanıma yapılamadı: ${(t && t.hata) || "Kemal'e ulaşılamadı"}. Kodu yazar mısınız?`);
    if (t.guven === "yuksek" && t.en_iyi) { await yaz(env, `🔎 Büyük ihtimalle ${t.en_iyi}.`); return modelKarti(env, [t.en_iyi], simdi); }
    if (!(t.adaylar || []).length) return yaz(env, "Katalogda benzeyen model bulamadım. Kodu yazar mısınız?");
    return yaz(env, `🤔 Emin değilim — bu mu?${t.aciklama ? `\n${t.aciklama}` : ""}\n(Doğru modeli seçmeden stok söylemiyorum.)`, { reply_markup: { inline_keyboard: [t.adaylar.slice(0, 3).map((k) => ({ text: `Bu mu? ${k}`, callback_data: `vmk:k:${k}` })), [{ text: "❌ Hiçbiri — kodu yazacağım", callback_data: "vmk:y:0" }]] } });
  }
  const kod = x;
  if (islem === "p" || islem === "v") { // 13 Kasım (Patron): bitmiş modelde (eski karttaki düğme dahil) paylaşım / Pelin yok — sadece repete
    const mv = await modelVerisi(env, kod, simdi).catch(() => null);
    if (stokBitti(mv)) { await cevap("Stok bitti"); return yaz(env, `${kod}: mağazada stok bitti — kanalda paylaşılmaz ve Pelin'e gitmez. İsterseniz "Repete al".`); }
  }
  if (islem === "p") { await cevap("Kemal'e"); return hizliPaylas(env, { kod }, simdi, `${kod} paylaş`); } // Venom kontrolü + 09–21 kuralı Kemal'de
  if (islem === "v") {
    // 13 Kasım (Patron, kural 7 ve 66): "Pelin video" düğmesi de mesajda "Pelin" yazmadan çalışmaz
    const son = await oku(env, "venom:sonPatronMetni", null);
    if (!(son && pelinAcikca(son.metin) && simdi - (son.zaman || 0) < 3600)) { await cevap("Pelin yazılmadı"); return yaz(env, `🎬 ${kod}: Pelin sadece mesajda "Pelin" yazınca çalışır. Yazın: Pelin ${kod} video`); }
    await cevap("Pelin'e");
    const r = await botaSor(env, "pelin", "mesaj", `/uret ${kod}`);
    if (r) await isKaydet(env, "pelin", `${kod} üretim kartı`, simdi);
    return yaz(env, `🎬 ${kod} → Pelin. ${r ? "Önce maliyet kartı gelecek; onaylamadan para harcanmaz." : "Pelin'e ulaşılamadı."}`);
  }
  if (islem === "r") { // ASLA doğrudan sipariş: Fuat'a gidecek TASLAK Patron onayına (✏️ Düzelt ile adet/renk)
    { const acik = await acikRepete(env, kod).catch(() => null); if (acik) { await cevap("Açık repete var"); return yaz(env, engelMetni(acik), { posta: { izin: "cevap" } }); } } // kural 43
    await cevap("Taslak hazırlanıyor");
    const v = await modelVerisi(env, kod, simdi);
    env.__sohbette = true;
    try { return await aracCalistir(env, "mesaj_taslagi", { kime: "fuat", metin: siparisTaslagi({ kod, s14: v ? v.s14 : 0, fabrika: v && v.fs && v.fs[0] }) }, simdi); } finally { env.__sohbette = false; }
  }
  return cevap("?");
}

// ---------- 9 Kasım (Patron): POSTANE komutları ----------
const SABIT_KURALLAR = [
  "Anında sadece: onay/para kartı, kritik hata (bot çöktü, köprü sustu, yanlış paylaşım, para sınırı) ve sizin sorunuzun cevabı.",
  "Gerisi Venom'da birikir: sabah 09:40 ve akşam 20:00 TEK özet (en fazla 8 satır, sabit sıra). Ayrıntı: /detay",
  `Acil ve cevap hariç günde en fazla ${POSTA_TAVAN} mesaj; fazla kartlar saatte bir tek mesajda birleşir.`,
  "Köprü hafta içi 10:30–20:00 izlenir: sinyal yoksa önce Merdan ve Hemra'ya sorulur, 30 dk'da düzelmezse size tek satır; cumartesi/pazar uyarı yok.",
];
const DISARI = /\b(fuat|nuri|merdan|hemra|kanala|siteye|0091|ekibe|müşteri)/i;
export async function postaKomut(env, m, metin, simdi) {
  const t = String(metin || "").trim();
  if (/^\/?kurallar[ıi]m\b/i.test(t)) {
    const l = await kurallariOku(env);
    const satir = ["📜 Bildirim kurallarım", "", "Sabit (sizin 9 Kasım kararınız):", ...SABIT_KURALLAR.map((x, i) => `${i + 1}. ${x}`), "", l.length ? "Sizin kalıcı kurallarınız:" : "Sizin kalıcı kuralınız yok. Eklemek için bir mesaj için \"bunu bana gönderme\" yazın.", ...l.map((k, i) => `${i + 1}. ${kuralYazi(k)} — "${k.ifade}" (${tarihSaat(k.zaman).slice(0, 10)})`)];
    await yaz(env, satir.join("\n"), l.length ? { reply_markup: { inline_keyboard: l.slice(0, 20).map((k, i) => [{ text: `❌ ${i + 1}. kuralı kaldır`, callback_data: `vkr:${k.id}` }]) } } : {});
    return true;
  }
  if (/^\/?detay\b/i.test(t)) {
    const d = await oku(env, "venom:posta:detay", null);
    if (!d) return "Henüz ayrıntılı özet yok (sabah 09:40 ve akşam 20:00 hazırlanır).";
    const parca = String(d.metin).match(/[\s\S]{1,3900}(\n|$)/g) || [];
    for (const x of parca.slice(0, 3)) await yaz(env, x);
    return true;
  }
  // "bunu bana gönderme" / "Kemal'in paylaşıldı mesajlarını getirme" → kalıcı kural (sohbet sözü değil)
  // 10 Kasım (Patron): kalıcı kural SADECE Patron bir mesaja YANIT verip açıkça "bunu bana gönderme" dediğinde kaydedilir
  if (t.length <= 200 && /\bbunu\s+bana\s+(gönderme|gonderme|getirme|yollama)\b|\bbana\s+bunu\s+(gönderme|gonderme|getirme|yollama)\b/i.test(t) && m && m.reply_to_message && !DISARI.test(t)) {
    const gonderilen = await oku(env, "venom:posta:gonderilen", []);
    const yanit = gonderilen.find((x) => x.id === m.reply_to_message.message_id) || { kaynak: null, kategori: null, ozet: String(m.reply_to_message.text || m.reply_to_message.caption || "").slice(0, 160) };
    const ornek = yanit;
    const kural = kuralCoz(t, ornek);
    if (!kural) return null;
    if (ornek && ornek.tur === "kritik" && !kural.kelimeler.length) return "Bu kritik bir uyarıydı (bot çöktü / köprü sustu / yanlış paylaşım). Kritik uyarıları susturmuyorum; başka bir şey için yazın.";
    const k = await kuralEkle(env, kural, t, simdi);
    return `📝 Kalıcı kural kaydedildi: ${kuralYazi(k)}${k.ornek ? ` (ör. "${k.ornek.slice(0, 80)}")` : ""}.\nArtık anında gelmez; akşam özetinde sayı olarak görünür. Kritik uyarılar yine gelir. Liste ve kaldırma: /kurallarım`;
  }
  return null;
}
// ---------- HAZIR CEVAPLAR (11 Kasım, Patron — KÖKTEN DÜZELTME): sık sorular yapay zekâsız, TEK DEFTERDEN; en fazla 5 satır ----------
async function cozdumYaz(env, ne, simdi) { const k = `venom:cozdum:${gunAnahtari(simdi)}`; const l = await oku(env, k, []); await kaydet(env, k, [...l, ne].slice(-20), 3 * 86400).catch(() => null); }
const gunSaatKisa = (t) => { const x = tarihSaat(t); return `${x.slice(0, 5)} ${x.slice(11, 16)}`; };
async function fabrikaGidenCevabi(env, simdi, gun) { const { giden, bekleyen, listeler } = await fabrikayaGidenler(env, gun); return fabrikaGidenMetni(gun, simdi, giden || {}, bekleyen || [], listeler || []); }
async function repeteDurumCevabi(env, kod) {
  if (!kod) return "Model kodu yok.";
  const [rk, fs] = await Promise.all([repeteKayitlari(env, kod), stokIste(env, "/fs-ozet", {}).catch(() => [])]);
  return repeteDurumMetni(kod, rk, Array.isArray(fs) ? fs : []);
}
// 12 Kasım (Patron): Patron saat söylediyse AYNEN o saat; söylemediyse mesai sonu (18:00).
// Tanınan yazımlar: "12:00'ye kadar", "12.00", "saat 12", "12'ye kadar", "12 ye kadar", "12de", "öğlen", "5 buçuk", "akşam 6", "yarın 12".
export const MESAI_SONU = 18;
export function soylenenSaat(il) {
  const t = String(il || "").toLocaleLowerCase("tr");
  let h = null, dk = 0, m;
  const tarihGibi = (x) => x[0].includes(".") && Number(x[2]) >= 1 && Number(x[2]) <= 12 && Number(x[1]) >= 1 && !/^\s?['’ʼ`]?\s?(?:ye|ya|e|a|de|da|te|ta)\s+kadar/.test(t.slice(x.index + x[0].length)) && !/saat\s*$/.test(t.slice(0, x.index)); // "12.11 tarihli" tarih; "12.10'a kadar" saat
  if ((m = t.match(/(?<![\d.,:])(\d{1,2})[:.](\d{2})(?![\d.,:])/)) && Number(m[1]) < 24 && Number(m[2]) < 60 && !tarihGibi(m)) { h = Number(m[1]); dk = Number(m[2]); }
  else if ((m = t.match(/saat\s+(\d{1,2})(?!\d)(\s+bu[çc]uk)?/)) && Number(m[1]) < 24) { h = Number(m[1]); dk = m[2] ? 30 : 0; }
  else if ((m = t.match(/(?<![\d.,:])(\d{1,2})\s?['’ʼ`]?\s?(?:ye|ya|e|a|de|da|te|ta)\s+kadar/)) && Number(m[1]) < 24) h = Number(m[1]);
  else if ((m = t.match(/(?<![\d.,:])(\d{1,2})\s+bu[çc]u[ğgk]\w*/)) && Number(m[1]) < 24) { h = Number(m[1]); dk = 30; }
  else if ((m = t.match(/(sabah|[öo][ğg]len|[öo][ğg]leden sonra|ak[şs]am)\s+(\d{1,2})(?!\d)/)) && Number(m[2]) < 24) h = Number(m[2]);
  else if (/[öo][ğg]len|[öo][ğg]lene kadar/.test(t)) h = 12;
  if (h == null) return null;
  if (h < 8 && /(ak[şs]am|[öo][ğg]leden sonra)/.test(t)) h += 12; // "akşam 6" = 18:00
  else if (h >= 1 && h <= 7 && !/sabah/.test(t)) h += 12; // mesai içinde "5'e kadar" = 17:00
  return { h, dk };
}
export function isSonSaati(il, simdi) {
  const t = String(il || "").toLocaleLowerCase("tr"), s = soylenenSaat(t);
  const gunBasi = simdi - ((simdi + SAAT_FARKI) % 86400), yarin = /yar[ıi]n/.test(t);
  let son = gunBasi + (yarin ? 86400 : 0) + (s ? s.h * 3600 + s.dk * 60 : MESAI_SONU * 3600);
  if (!yarin && son <= simdi) son += 86400; // saat bugün geçtiyse ertesi gün aynı saat
  if (new Date((son + SAAT_FARKI) * 1000).getUTCDay() === 0) son += 86400; // pazar atlanır
  return son;
}
// "Merdan'a söyle, yarın 12:00'ye kadar 3394'ün fotoğrafını çeksin" → { kimler, is, kodlar, son, kalip }; null = kişiye iş değil
export function kisiyeSoyleCoz(metin, simdi) {
  const ham = String(metin || "").replace(/\s+/g, " ").trim(), t = ham.toLocaleLowerCase("tr");
  const fiil = t.match(/(merdan|aziz|hemra)['’ʼ`]?\s?(?:ya|ye|a|e)\s+(?:s[öo]yle(?:yin)?|yaz(?:ın)?|ilet|sor|hat[ıi]rlat|haber ver|bildir|de ki)(?![\p{L}])[\s,:;.\-–]*/u);
  if (!fiil) return null;
  const bas = t.slice(0, fiil.index), kimler = [...new Set([...bas.matchAll(/(merdan|aziz|hemra)['’ʼ`]?\s?(?:ya|ye|a|e)(?![\p{L}])/gu)].map((m) => m[1]).concat(fiil[1]))];
  const onEk = ham.slice(0, fiil.index).replace(/(merdan|aziz|hemra)['’ʼ`]?\s?(?:ya|ye|a|e)(?![\p{L}])/giu, "").replace(/\b(ve|ile)\b/gi, "").replace(/^[\s,]+|[\s,]+$/g, "");
  const is = [onEk, ham.slice(fiil.index + fiil[0].length)].filter(Boolean).join(" ").trim();
  if (is.length < 3) return null;
  const sade = is.replace(/\b\d{1,2}[:.]\d{2}\b/g, " ").replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, " ");
  const kodlar = [...new Set(sade.match(/(?<![\d.,:])\d{3,5}(?![\d.,:]\d)/g) || [])].slice(0, 20);
  const il = is.toLocaleLowerCase("tr");
  const son = isSonSaati(il, simdi);
  return { kimler, is: is[0].toLocaleUpperCase("tr") + is.slice(1), kodlar, son, kalip: /foto/.test(il) ? "foto" : /video/.test(il) ? "video" : "genel" };
}
export async function kisiyeSoyleYap(env, s, simdi) {
  const eAd = s.kimler.map((k) => KISILER[k].e).join(" ve ");
  if (env.__kuru) return `Yönlendirme: iş Sami üzerinden ${eAd} gider (düğmeli kart, cevabı takip edilir). Pelin'e GİTMEZ.\nİş: "${s.is}"${s.kodlar.length ? ` · model: ${s.kodlar.join(", ")}` : ""} · son saat: ${gunSaatKisa(s.son)}\n(Deneme: gerçek mesaj gönderilmedi.)`;
  if (ekipSuzgec(s.is)) return `Gitmedi: metinde ekibe gitmeyen bilgi var (fiyat / satış / kâr). Metni o kısım olmadan yeniden yazın.`;
  const g = await gorevAc(env, { baslik: `Patron: ${kisaYaz(s.is, 70)}`, metin: `Patron'dan: ${s.is}`, kalip: s.kalip, kalemler: (s.kodlar.length ? s.kodlar : ["İş"]).map((kod) => ({ kod })), son: s.son, kaynak: "patron", kimler: s.kimler, patron: true }, simdi);
  await botaSor(env, "sami", "gidenAdim"); // Sami HEMEN gönderir (5 dakikalık sırayı beklemez)
  const giden = [];
  for (const k of s.kimler) { const a = await stokIste(env, "/arsiv-kod", { tur: "venom-gitti", mt: `gv-${g.id}-${k}-0` }).catch(() => []); if (Array.isArray(a) && a.length) giden.push(k); }
  await mudurSayac(env, "gorev", simdi).catch(() => null);
  if (giden.length === s.kimler.length) return `${eAd} kart gitti (Sami üzerinden, ${tarihSaat(simdi).slice(11, 16)}): "${kisaYaz(s.is, 160)}"\nSon saat ${gunSaatKisa(s.son)}. Cevabını takip ediyorum; sonucu yazarım.`;
  return `${eAd} kart Sami'nin sırasında (birkaç dakika içinde gider): "${kisaYaz(s.is, 160)}"\nSon saat ${gunSaatKisa(s.son)}. Gitmezse ya da cevap gelmezse haber veririm.`;
}
// Kanal kontrolü (araç): Venom kendisi bakar; sorun varsa SORMADAN Kemal'e düzelttirir; tek satır sonuç
export async function kanalKontrolCevabi(env, kodlar, simdi) {
  const l = await oku(env, "venom:kanal:son", []), kanal = await oku(env, "kanal", null), satir = [];
  for (const kod of kodlar) {
    const p = l.filter((x) => String(x.kod) === String(kod)).sort((a, b) => a.zaman - b.zaman);
    const silK = await oku(env, `silinen:${kod}`, null);
    if (silK) { satir.push(`${kod}: kanaldan kaldırıldı ${zamanKisa(silK.zaman)} (${(silK.kopya || []).length} mesaj; eski mesajlar SOLD OUT görseliyle gizli). Kontrol edilecek paylaşım yok.`); continue; }
    if (!p.length) { satir.push(`${kod}: kanalda paylaşım görmedim.`); continue; }
    const sorunlu = [];
    for (const x of p) { const s = await kanalSorunlari(env, x.yazi || "", x.kod); if (s.length) sorunlu.push({ x, s }); }
    const son = p.at(-1);
    if (!sorunlu.length) { satir.push(`${kod}: kanalda ${p.length} paylaşım (en yenisi ${gunSaatKisa(son.zaman)}). Sorun yok: fiyat yok, marka imzası doğru.`); continue; }
    for (const { x, s } of sorunlu.slice(0, 3)) {
      const link = kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${x.id}` : `#${x.id}`;
      if (env.__kuru) { satir.push(`${kod}: ${gunSaatKisa(x.zaman)} paylaşımında ${s.join("; ")} (deneme: düzeltme başlatılmadı) ${link}`); continue; }
      const r = await botaSor(env, "kemal", "paylasimDuzelt", { kod, ids: [x.id], yerinde: true, kim: "Venom (kanal kontrolü)" });
      if (r && r.ok) { await cozdumYaz(env, `${kod} kanal yazısı`, simdi); satir.push(`${kod}: ${gunSaatKisa(x.zaman)} paylaşımında ${s.join("; ")} → Kemal yazıyı düzeltti. Kanıt: ${link}`); }
      else satir.push(`${kod}: ${s.join("; ")} — düzeltilemedi, sebep: ${r ? r.hata || "Kemal düzeltemedi" : "Kemal'e ulaşılamadı"}. Kanalda duruyor. ${link}`);
    }
  }
  return satir.slice(0, 5).join("\n");
}
export async function sabitKomut(env, metin, simdi) {
  const t = String(metin || "").trim().toLocaleLowerCase("tr");
  if (t === "📋 bekleyenler") { await bekleyenleriGonder(env, simdi); return true; }
  if (t === "📊 bugün ne oldu") return [await gunOzetiKisa(env, simdi)].join("\n");
  if (t === "⛔ durdur") { await tg(env, "sendMessage", { chat_id: patron(env), text: "⛔ Bütün botların paylaşım / üretim / site yazma işleri durdurulsun mu?", reply_markup: { inline_keyboard: [[{ text: "⛔ Evet, hepsini durdur", callback_data: "vd:e" }, { text: "Vazgeç", callback_data: "vd:x" }]] } }); return true; }
  return null;
}
async function gunOzetiKisa(env, simdi) {
  const d = await durDurumu(env);
  const dur = d.hepsi ? "⛔ Bütün botlar DURDURULMUŞ" : Object.keys(BOT_ADLAR).filter((b) => d[b]).map((b) => `⛔ ${b} durdurulmuş`).join(", ");
  return [`📊 Bugün (${tarihSaat(simdi).slice(11, 16)}'e kadar):`, dur || "✅ Bütün botlar çalışıyor", await sorunRaporu(env, simdi).catch(() => ""), await bitmeyenIsler(env, simdi).catch(() => "")].filter(Boolean).join("\n");
}
// Sesli rapor (Patron onayıyla açıldıysa): OpenAI ses → Telegram sesli mesaj
export async function sesliGonder(env, metin, simdi) {
  if ((await env.KAYIT.get("venom:sesliAcik").catch(() => null)) !== "1" || !openaiVar(env)) return false;
  const duz = String(metin).replace(/[^\p{L}\p{N}\s.,:;!?%$()\-/]/gu, " ").replace(/\s+/g, " ").slice(0, 3000);
  const r = await openaiFetch(env, "/v1/audio/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: duz, response_format: "opus" }) }).catch(() => null);
  if (!r || !r.ok) return false;
  const f = new FormData();
  f.append("chat_id", patron(env)); f.append("voice", new Blob([await r.arrayBuffer()], { type: "audio/ogg" }), "rapor.ogg");
  await tgForm(env, "sendVoice", f, "rapor").catch(() => null);
  await venomHarcamaYaz(env, (duz.length / 1e6) * 15, simdi);
  return true;
}
export async function haftalikOzet(env, simdi) {
  const kodlar = await oku(env, "kodlar", {});
  const paylasim = Object.values(kodlar).flat().filter((g) => simdi - g.tarih < 7 * 86400).length;
  const engel = (await oku(env, "venom:kontrol:engel", [])).filter((x) => simdi - x.zaman < 7 * 86400).length;
  const hata = await hataSayilari(env, simdi, 7 * 86400);
  const sorunlu = Object.entries(hata).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 0);
  const cf = await oku(env, "venom:cfKullanim", null);
  return [`🗓 HAFTALIK ÖZET (${gunA(simdi - 7 * 86400)} – ${gunA(simdi)})`, `📣 Kanal paylaşımı: ${paylasim}`, `🛑 Venom kontrolünün durdurduğu: ${engel}`,
    `⚠️ Bot hataları: ${sorunlu.length ? sorunlu.map(([b, n]) => `${b} ${n}`).join(", ") : "yok"}${sorunlu.length ? ` — en sorunlu: ${sorunlu[0][0]}` : ""}`,
    `💵 Bu ay: Venom ${(await venomHarcanan(env, simdi)).toFixed(2)} $ · Cloudflare 5 $ (kullanım ${cf ? `en yüksek %${cf.kalemler[0].tahminYuzde} tahmin` : "ölçülemedi"})`,
    await bitmeyenIsler(env, simdi, 7 * 86400)].join("\n");
}
// Fikir kutusu: haftada bir, satışı artıracak 3 öneri (Venom'un mevcut yapay zekâ bütçesinden ~0,02 $)
export async function fikirKutusu(env, simdi) {
  if (!claudeVar(env) || (await venomHarcanan(env, simdi)) >= (await venomSinir(env))) return "💡 Fikir kutusu bu hafta atlandı (yapay zekâ bütçesi).";
  const veri = [await paylasilmayanlar(env, simdi), await stokBitiyor(env, simdi).catch(() => null) || "", `Videosuz modeller: ${(await siteVerisi(env)).filter((u) => !u.gizli && !(u.videolar || []).length).length}`].join("\n").slice(0, 3000);
  const client = claudeIstemci(env, { maxRetries: 1, timeout: 60_000 });
  const model = env.VENOM_MODEL || MODEL;
  const r = await client.messages.create({ model, max_tokens: 600, system: `${await kitapOku(env, "venom")}\nSen VOLONTE'nin satış danışmanısın. Kısa, uygulanabilir, sade Türkçe.`, messages: [{ role: "user", content: `Bu haftanın verisi:\n${veri}\n\nSatışı artıracak 3 somut öneri yaz (her biri tek satır, hangi model/ne yapılacak). Fiyat önerme.` }] });
  await venomHarcamaYaz(env, claudeUsd(model, r.usage), simdi);
  return `💡 FİKİR KUTUSU (haftalık):\n${r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()}`;
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
  const ym = await oku(env, `venom:yeniModelSayac:${gunAnahtari(simdi)}`, null);
  const yeniSatir = ym ? `🆕 Yeni model kartları (Merdan/Hemra): ${ym.soruldu || 0} soruldu · ${ym.onay || 0} paylaşıldı · ${ym.gec || 0} geçildi · ${ym.beklesin || 0} beklesin${ym.durdu ? ` · ${ym.durdu} Venom kontrolünde durdu` : ""}` : null;
  const metin = [`🌙 Günün özeti — ${tarihSaat(simdi).slice(0, 10)}`, ...(satir.length ? satir : ["• Bugün Venom üzerinden iş yapılmadı."]), await paraOzeti(env, simdi, venomAy).catch(() => `💵 Pelin bugün ${pelinBugun.toFixed(2)} $`), `   (Venom bu ay ${venomAy.toFixed(2).replace(".", ",")} $ / ${await venomSinir(env)} $)`, yeniSatir, await sorunRaporu(env, simdi).catch(() => null), await bitmeyenIsler(env, simdi).catch(() => null), await videoRaporu(env, simdi), bekleyen, "İyi akşamlar Patron."].filter(Boolean).join("\n");
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
      const u = await istek.json().catch(() => ({}));
      try { await guncelleme(u, env); } catch (e) { await hataYaz(env, "guncelleme", e); await cevapsizBildir(env, u).catch(() => null); }
      return new Response("ok");
    }
    const mm = url.pathname.match(/^\/medya\/([0-9a-f]{32})$/);
    if (istek.method === "GET" && mm) { const r = await env.KAYIT.getWithMetadata(`venommedya:${mm[1]}`, "arrayBuffer"); return r && r.value ? new Response(r.value, { headers: { "content-type": (r.metadata && r.metadata.tur) || "image/jpeg" } }) : new Response("yok", { status: 404 }); }
    return new Response("Venom çalışıyor.");
  },
  async scheduled(olay, env) {
    if (!env.BOT_TOKEN) return;
    try { await kitapOku(env, "venom"); } catch { /* 13 Kasım (kural 37): bot her çalışmada kitabın güncel sürümünü okur (ofis "kitap sürümü") */ }
    try { await venomCron(env, Math.floor(Date.now() / 1000)); } catch (e) { await hataYaz(env, "cron", e); }
  },
};
