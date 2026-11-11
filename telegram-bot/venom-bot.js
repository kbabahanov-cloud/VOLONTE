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
import { ORTAK_KURALLAR, BOT_YETENEKLERI, VENOM_KURALLARI, MARKA_KARARLARI } from "./kurallar.js";
import { isKaydet, isCevap, isHatirlat, bitmeyenIsler, hataAlarmi, hataSayilari, geriAlBul, satisUyarisi, stokBitiyor, paylasilmayanlar, paraOzeti, hatirlaticiEkle, vadesiGelenler, yedekAl, gunA } from "./venom-yonetim.js";
import { durYaz, durDurumu, _durOnbellekSifirla } from "./durdurma.js";
import { IZINLER, postaKarar, gonderildiKaydet, biriktir, siraya, kartSiraMesaji, birikimSatiri, ozetKisalt, kuralCoz, kuralEkle, kuralSil, kurallariOku, kuralYazi, POSTA_TAVAN, PERSONEL_KARTI, kategori as postaKategori } from "./venom-posta.js";
import { kopruSustu, haftaIci } from "./magaza-saat.js";
import { kodlariBul, modelSorusuMu, fotoSorusuMu, kartSatirlari, kartDugmeleri } from "./venom-model.js";
import { markaKesin } from "./yayin-kontrol.js";
import { siparisTaslagi } from "./repete-rapor.js";
import { kanitGecmisi, kanitMetni, kanitTarih, MAGAZA_BASLIK } from "./fabrika.js";
import { kisiSorusu, kisiCevabi, botOzeti, kartListe } from "./venom-defter.js";
import { donemAraligi, soruParcalari, raporMetni, kodSayili, usd } from "./venom-rapor.js";
import { seriBul } from "./manken.js";
import { botSorusu, botCevabi, herkesCevabi, canliSatirlar, takilanlar, hedefSatiri, BOTLAR as DEFTER_BOTLAR, kisiAdi as defterKisi } from "./venom-defter.js";
import { defterYaz } from "./is-defteri.js";
import { cevapsizSatiri } from "./kart-tekrar.js";
import { listeyeEkle, hemraListesiGonder, hemraKararAdimi, hemraSatirlari, kisiId, markaSorumlusu, LISTE_SAATLERI } from "./venom-ekip.js";
import { cozumDevret } from "./venom-gorev.js";
import { gorevAc, gorevAdimi, cozumAdimi, yapilmayanSatiri, patronKarari, haftaSayilari, sayac as mudurSayac, sonSaat } from "./venom-gorev.js";
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
export async function tg(env, metod, govde) {
  if (govde && typeof govde === "object" && !(govde instanceof FormData)) {
    const { izin, ...temiz } = govde;
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
async function yaz(env, text, ek = {}) {
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
  { name: "karar_kaydet", description: "Patron yeni bir KALICI karar/kural söylediğinde (ör. 'bundan sonra …', 'her zaman …', 'asla …') Venom'un hafızasına yazar; sonraki her konuşmada uygulanır. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["metin"], properties: { metin: { type: "string" } } } },
  { name: "selin_durum", description: "Selin'de bir modelin durumu: neden taslak çıkmadı (fotoğraf gelmedi mi, hata mı, onayda mı, sitede mi), bugünkü listede mi, kaç gündür gelmiyor, stok. Onaysız.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "selin_taslak", description: "Selin'e bir model için site taslağı (başlık + EN/FR/PT açıklama) hazırlatır; fotoğrafı Selin'e gelmiş olmalı. Küçük yapay zekâ maliyeti (~0,05 $): önce onay kartı.", input_schema: { type: "object", additionalProperties: false, required: ["kod"], properties: { kod: { type: "string" } } } },
  { name: "bota_yaz", description: "Patron'un söylediği işi/cevabı ilgili bota Patron yazmış gibi iletir (yazı). Pelin: fotoğraf/video üretimi ve Nora senaryo; Kemal: kanal paylaşımı ve düzeltme metni; Selin: site; Sami: stok/ekip. Bir bot az önce yazı bekleyen bir soru sorduysa (ör. 'nasıl düzelteyim, yazın') Patron'un cevabını AYNEN o bota ilet. Para harcayan işlerde bot kendi maliyet kartını getirir.", input_schema: { type: "object", additionalProperties: false, required: ["bot", "metin"], properties: { bot: { type: "string", enum: ["pelin", "kemal", "selin", "sami"] }, metin: { type: "string" } } } },
  { name: "kanal_paylasimlari", description: "VOLONTE Telegram kanalındaki son paylaşımlar (Venom kanalda yönetici, sadece okur): zaman, model kodu, medya, yazı ve bulunan sorunlar. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" }, gun: { type: "integer", description: "kaç günlük (varsayılan 1)" } } } },
  { name: "site_kontrol", description: "wearvolonte.com'u okur (değiştirmez): model sayısı, fotoğrafsız/videosuz, yapay zekâ (Pelin) fotoğrafı olanlar, stoğu bitmiş ama sitede görünenler; kod verilirse o modelin ayrıntısı. Onaysız.", input_schema: { type: "object", additionalProperties: false, properties: { kod: { type: "string" } } } },
  { name: "site_duzelt", description: "Sitede bir düzeltmeyi Selin'e verir (önce Patron onay kartı). yapay_zeka_fotolarini_kaldir SADECE Patron açıkça 'yapay zekâ / Pelin fotoğraflarını kaldır' derse — kendin önerme, başka bir isteği buna çevirme (9 Kasım). İşlemler: yapay zekâ (Pelin) fotoğraflarını kaldır, fotoğrafları yenile (önbellekteki eski görsel), taslağı yeniden hazırla, açıklamadaki renkleri yaz (renkler). Yeni renk Pelin'den siteye eklenince renk satırı kendiliğinden güncellenir; bu araç ilk rengi kaydetmek/düzeltmek için.", input_schema: { type: "object", additionalProperties: false, required: ["kod", "islem"], properties: { kod: { type: "string" }, islem: { type: "string", enum: ["yapay_zeka_fotolarini_kaldir", "fotolari_yenile", "taslak_yeniden", "renkler"] }, renkler: { type: "array", items: { type: "string" }, description: "islem=renkler: modelin sitedeki BÜTÜN renkleri, Türkçe, sırayla (ör. [\"siyah\", \"koyu bordo\"]); açıklamanın sonundaki renk satırı (EN/FR/PT) buna göre yazılır" } } } },
  { name: "yetenek_istegi", description: "Venom'un henüz yapamadığı bir iş için Claude Code'a not bırakır (yeni yetenek isteği).", input_schema: { type: "object", additionalProperties: false, required: ["istek"], properties: { istek: { type: "string" } } } },
];

// Onay kartı: [✅ Onayla] [✏️ Düzelt] [❌ İptal] → "Emin misiniz?" → çalıştır
const kartKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Onayla", callback_data: `vb:o:${id}` }, { text: "✏️ Düzelt", callback_data: `vb:d:${id}` }, { text: "❌ İptal", callback_data: `vb:x:${id}` }]] });
async function kartAc(env, is, metin, simdi) {
  const id = kisaId();
  await kaydet(env, `venom:bot:is:${id}`, { id, ...is, metin, durum: "bekliyor", zaman: simdi }, 7 * 86400);
  if (is.patronIstedi || env.__sohbette) await yaz(env, metin, { reply_markup: kartKlavye(id), posta: { tur: "cevap" } }); // Patron'un kendi isteğinin kartı: hemen
  else await bildir(env, metin, { simdi, tur: "kart", ek: { reply_markup: kartKlavye(id) } });
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
  if (ad === "bot_raporu") return botRaporuMetni(env, g.bot, DONEM_ARAC[g.donem] || "bugün", simdi);
  if (ad === "is_defteri") {
    const gun = g.gun === "dun" ? "dün" : "bugün";
    if (g.kisi) return (await kisiCevabiMetni(env, `${g.kisi} ${gun} ne cevap verdi`, simdi)) || `${g.kisi}: kayıtlı kişi değil.`;
    const { satirlar, canlilar } = await defterVerisi(env, simdi, gun);
    return g.bot && g.bot !== "hepsi" ? botCevabi(env, g.bot, satirlar, canlilar[g.bot], { gun }) : herkesCevabi(env, satirlar, canlilar, { gun });
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
  if (ad === "kanal_paylasim_sil") return kanalSilYap(env, (g.kodlar || []).map((k) => String(k).replace(/\D/g, "")).filter(Boolean), g.mesaj_no || [], simdi);
  if (ad === "kanal_paylasim_duzelt") {
    const r = await botaSor(env, "kemal", "paylasimDuzelt", { kod: String(g.kod).replace(/\D/g, ""), ids: g.mesaj_no || null, kim: "Patron (Venom)" });
    if (!r) return "Kemal'e ULAŞILAMADI — 'yapıldı' deme.";
    await biriktir(env, { kaynak: "kemal", metin: `🧹 ${g.kod} yazı düzeltme: ${r.ok ? (r.yerinde ? "yazı yerinde düzeltildi" : r.ertelendi ? `eski silindi, doğru yazıyla sıraya alındı (${tarihSaat(r.saat).slice(11, 16)})` : "eski silindi, doğru yazıyla tek albüm paylaşıldı") : `olmadı (${r.hata})`}`, tur: "bilgi" }, simdi);
    return r.ok ? `Kemal yaptı: ${r.yerinde ? "yazı yerinde düzeltildi" : r.ertelendi ? `eski paylaşım silindi, doğru yazıyla sıraya alındı (${tarihSaat(r.saat).slice(11, 16)} civarı)` : `eski paylaşım silindi, doğru yazıyla tek albüm paylaşıldı ${r.link || ""}`}. Patron'a tek satır yeter.` : `KEMAL YAPAMADI: ${r.hata}. Patron'a açıkça "yapamadı, sebebi şu" de.`;
  }
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
    if (g.bot === "pelin" && /üret|uret|video|fotoğraf çek|maliyet/i.test(String(g.metin || "")) && !env.__sohbette && env.__izin !== "cevap") return "Pelin'e para gerektiren üretim emri Patron onayı olmadan verilmez (pelin_uret kartı).";
    const r = await botaSor(env, g.bot, "mesaj", String(g.metin || ""));
    if (r) await isKaydet(env, g.bot, String(g.metin || ""), simdi);
    if (r) await emirKaydet(env, g.bot, String(g.metin || ""), simdi); // 9 Kasım: 10 dk sonra yapıldı mı kontrol
    await kaydet(env, "venom:bot:sonBot", { bot: g.bot, zaman: simdi, metin: `(Venom iletti) ${String(g.metin).slice(0, 200)}` }, 3600);
    if (!r) return `${BOT_AD[g.bot]}'e ULAŞILAMADI. Patron'a "${BOT_AD[g.bot]}'e ulaşamadım" de; "verdim" DEME.`;
    // 10 Kasım (Patron): botun GERÇEK cevabı — yapamadıysa Patron'a açıkça "yapamadı, sebebi şu"; asla "verdim/hallettim"
    const cevap = await botunSonCevabi(env, g.bot, simdi);
    if (cevap && YAPAMADI.test(cevap)) {
      await yaz(env, `⚠️ ${BOT_AD[g.bot]} yapamadı. Sebebi: ${cevap.replace(/\s+/g, " ").slice(0, 300)}`, { posta: { izin: "cevap" } });
      return `${BOT_AD[g.bot].toUpperCase()} YAPAMADI. Cevabı: «${cevap.slice(0, 400)}». Patron'a "yapamadı, sebebi şu" zaten yazıldı. ASLA "verdim / hallettim / yapılıyor" deme; başka yolun varsa (ör. kanal_paylasim_sil, kanal_paylasim_duzelt) onu kullan, yoksa ne gerektiğini söyle.`;
    }
    return cevap ? `${BOT_AD[g.bot]}'in cevabı: «${cevap.slice(0, 400)}». Bu iş YAPILDI demek değil; Patron'a sadece bu cevabı aktar, "verdim/hallettim" deme.` : `${BOT_AD[g.bot]}'e iletildi, henüz cevap yok. Patron'a "ilettim, sonucu gelince söylerim" de; "verdim/hallettim" DEME.`;
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
  if (/^vmk:/.test(String(cq.data))) return modelKartDugmesi(env, cq, simdi, cevap); // 9 Kasım: kısa model kartı
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
export function uretNiyeti(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
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
    const link = kanal && kanal.kullanici ? `https://t.me/${kanal.kullanici}/${post.message_id}` : `#${post.message_id}`;
    await yaz(env, `⚠️ Kanalda sorun — ${kod || "kodsuz"}${duzenlendi ? " (düzenleme)" : ""}: ${sorunlar.join("; ")}\n${link}\nDüzeltmek için Kemal'e yaptırabilirim.`, { posta: { tur: "kritik" } }); // yanlış paylaşım çıktı = kritik (izin f)
  }
}

// ---------- Sohbet ----------
const SISTEM = `Sen VENOM'sun: VOLONTE'nin (İstanbul Laleli, kadın giyim toptan; iki AYRI mağaza: VOLONTE ve BLACK ROSE) komuta merkezi. Sadece Patron'la konuşursun; ona "Patron" diye hitap edersin. Kısa, net, sade Türkçe (Rusça yazarsa Rusça).
Görevin: Patron'un isteğini anlayıp ilgili bota yaptırmak (araçlarla), sonucu kısa göstermek.
${VENOM_KURALLARI}
${ORTAK_KURALLAR}
${BOT_YETENEKLERI}
Ek Venom kuralları:
- Patron'un kendi yazdığı metni değiştirmeden gönder; düzeltme isterse uygula.
- Sohbeti hatırla ("ona tekrar yaz", "dünkü gibi yap").
- Diğer botların Patron'a mesajları ve onay kartları "🤖 Kemal/Selin/Pelin/Sami" başlığıyla buraya gelir; düğmeleri Patron burada basar.
- Site onayı 0091 ve Merdan'dadır; Selin'in taslak kartları Patron'a gelmez. Selin'i sadece bilgi olarak takip et (selin_durum, site_kontrol).
- Patron fotoğraf/video gönderip "paylaş" derse kemal_paylas kullan: TÜM dosyalar Kemal'e (Pelin'e DEĞİL), renk/beden Patron ne yazdıysa (renk, beden alanları), video sesi/müziği korunur; yayın SON YAYIN ONAYI kartıyla, onaydan sonra kanal + site. Kod + renk + "paylaş" varsa SORU SORMA, başlat. Patron "en son gönderdiğim gibi" derse son_set=true.
- Patron bir kartı reddettikten sonra yeni dosya gönderip paylaş derse bu YENİ bir paylaşımdır; eski kartı bekleme, kemal_paylas'ı yeniden çağır.
- Bu hafta SAĞLAMLAŞTIRMA haftası: yeni özellik önerme; Pelin'e üretim işi sadece Patron açıkça isterse.
- Aşağıdaki HAFIZA, depodaki notlar ve Patron kararlarıdır; her cevapta uygula.`;

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
  env.__sohbette = true; // 9 Kasım: bu sırada açılan kartlar Patron'un kendi isteği → hemen gider (tavana sayılmaz)
  if (!claudeVar(env)) return yaz(env, "Yapay zekâ anahtarı bağlı değil (Claude Code'a haber verin).");
  const client = claudeIstemci(env, { maxRetries: 1, timeout: 60_000 });
  let cevapMetni = "";
  // 5 Kasım: sistem metni konuşma boyunca SABİT (araç hafızayı değiştirse bile) — değişirse Claude'un düşünme bloğu geçersiz sayılıyordu (400)
  const sonBot = await oku(env, "venom:bot:sonBot", null);
  const sistem = [{ type: "text", text: SISTEM }, { type: "text", text: await hafizaMetni(env), cache_control: { type: "ephemeral" } }, { type: "text", text: `Şimdi: ${tarihSaat(simdi)} (İstanbul).${sonBot && simdi - sonBot.zaman < 1800 ? `\nSON BOT MESAJI (${Math.round((simdi - sonBot.zaman) / 60)} dk önce, ${BOT_AD[sonBot.bot] || sonBot.bot}): "${sonBot.metin}". Bu mesaj Patron'dan yazı bekliyorsa (ör. "nasıl düzelteyim, yazın") ve Patron'un yeni mesajı ona cevapsa, bota_yaz ile AYNEN ${sonBot.bot} botuna ilet.` : ""}` }];
  for (let tur = 0; tur < 4; tur++) {
    const model = env.VENOM_MODEL || MODEL;
    const r = await claudeTur(client, { model, max_tokens: 1500, system: sistem, tools: ARACLAR, output_config: { effort: "low" }, messages: mesajlar });
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
  if (cevapMetni) cevapMetni = tabloyuListeyeCevir(cevapMetni); // 6 Kasım: Telegram'da tablo yok
  if (cevapMetni) await yaz(env, cevapMetni);
  await kaydet(env, "venom:bot:sohbet", [...gecmis, { role: "user", content: girdi.slice(0, 1500) }, { role: "assistant", content: (cevapMetni || "…").slice(0, 1500) }].slice(-20), 7 * 86400);
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
  const ks = kanalSilNiyeti(metin, m && m.reply_to_message ? String(m.reply_to_message.text || m.reply_to_message.caption || "") : ""); // 10 Kasım: Patron "sil" → hemen
  if (ks) return yaz(env, await kanalSilYap(env, ks.kodlar, ks.ids, simdi), { disable_web_page_preview: true });
  const pk = await postaKomut(env, m, metin, simdi); // 9 Kasım: /kurallarım, /detay, "bunu bana gönderme"
  if (pk) return pk === true ? null : yaz(env, pk);
  const komut = await sabitKomut(env, metin, simdi);
  if (komut) return komut === true ? null : yaz(env, komut);
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
    if (r) await isKaydet(env, "pelin", `${un.kod}${un.renk ? ` ${un.renk}` : ""} üretim kartı`, simdi);
    return yaz(env, `🧭 Anladım: ${un.kod}${un.renk ? ` ${un.renk}` : ""} → Pelin'e fotoğraf + video üretimi. ${r ? "Pelin'in kartı (anlama / maliyet) buraya gelecek; onaylamadan para harcanmaz." : "⚠️ Pelin'e ulaşılamadı."}`);
  }
  // 6 Kasım: "3627 beyaz paylaş" → soru sormadan Kemal'e (renk yoksa tek soru + düğme); bekleyen renk sorusuna cevap
  const soru = await oku(env, "venom:bot:paylasSoru", null);
  if (soru && renkBilinir(String(m.text || m.caption || "").trim())) { await env.KAYIT.delete("venom:bot:paylasSoru").catch(() => null); return yaz(env, await paylasBaslat(env, { ...soru, renk: String(m.text || m.caption).trim() }, simdi)); }
  const niyet = paylasNiyeti(m.text || m.caption || metin);
  if (niyet) return hizliPaylas(env, niyet, simdi, m.text || m.caption || metin);
  const rl = String(m.text || "").trim().match(/^\/rol\s+(\S+)\s+(fiyat|stok|fabrika|celal|sil|çıkar)\b/i); // 9 Kasım: "/rol Janet fiyat" — Sami'deki kişinin rolü
  if (rl) return yaz(env, await rolDegistir(env, rl[1], rl[2].toLocaleLowerCase("tr"), simdi));
  if (/^\/ekip\b/i.test(String(m.text || "").trim())) return yaz(env, await ekipMetni(env)); // 9 Kasım: herkesin rolü
  if (/hemra\S*\s+(?:bugün\s+)?izinli/i.test(metin)) { await env.KAYIT.put("venom:hemraIzinli", gunAnahtari(simdi), { expirationTtl: 2 * 86400 }); return yaz(env, "Tamam: bugün koordinasyon Merdan'da; listeler ona gider."); } // 9 Kasım (ekip düzeni): yedek
  const yk = yuklemeCoz(metin); // 9 Kasım: "Higgsfield'a 50 $ yükledim" → bakiye takibi
  if (yk) {
    const ay9 = gunAnahtari(simdi).slice(0, 7);
    const harcanan = Number((await env.KAYIT.get(yk.tur === "hf" ? `pelin-hf:${ay9}` : `uretim-harcama:${ay9}`).catch(() => 0)) || 0);
    const l = (await oku(env, "venom:pelinBakiye", {})) || {};
    l[yk.tur] = { tutar: yk.tutar, aylar: [ay9], oncekiHarcama: harcanan, zaman: simdi }; // bundan sonra harcanan düşülür
    await kaydet(env, "venom:pelinBakiye", l);
    return yaz(env, `Tamam: ${yk.tur === "hf" ? "Higgsfield" : "fal"} bakiyesi ${usd(yk.tutar)} olarak kaydedildi. Harcandıkça düşerim; 5 $ altına inince önceden uyarırım.`);
  }
  const fkk = String(metin || "").match(/\b(\d{4,6})\b[^\n]*fabrika\s*kayd/i) || String(metin || "").match(/fabrika\s*kayd\S*\s*(\d{4,6})\b/i); // 10 Kasım: "3394 fabrika kaydı" → kanıt defteri
  if (fkk) return yaz(env, kanitMetni(fkk[1], await kanitGecmisi(env, fkk[1])));
  const kc = await kisiCevabiMetni(env, metin, simdi).catch(() => null); // 9 Kasım: "Sinem bugün hangi kartlara ne cevap verdi?"
  if (kc) return yaz(env, kc);
  const bs = botSorusu(metin); // 9 Kasım: "Kemal bugün ne yaptı?" / "herkes ne yaptı?" → iş defterinden (ücretsiz)
  if (bs && !soruParcalari(metin).neden) { // 9 Kasım: sorunun TAMAMI — dönem + bütün kaynaklar (iş defteri yetmezse botun kendi kayıtları)
    if (bs.herkes && bs.gun === "bugün") { const { satirlar, canlilar } = await defterVerisi(env, simdi, bs.gun); return yaz(env, herkesCevabi(env, satirlar, canlilar, { gun: bs.gun })); }
    const l = []; for (const b of bs.botlar) l.push(await botRaporuMetni(env, b, bs.gun, simdi).catch((e) => `${b}: rapor hazırlanamadı (${String(e && e.message).slice(0, 80)})`));
    return yaz(env, l.join("\n\n"));
  }
  const mkod = modelSorusuMu(metin); // 9 Kasım: "3629 kaç adet var?" / sesli "36 29" → kısa model kartı (ücretsiz, Claude'a gitmez)
  if (mkod) return modelKarti(env, mkod, simdi);
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
  // 10 Kasım (Patron): eksik listesi fabrikaya ulaşınca TEK satır ("Bugünkü eksik listesi fabrikaya gitti: VOLONTE X model, Black Rose Y model.")
  for (const f of await kuyruguAl(env, "fabrikaGitti")) {
    const r = await yaz({ ...env, __izin: "cevap" }, f.metin, { posta: { kaynak: "sami", tur: "cevap", izin: "cevap" } }).catch(() => null);
    await kaydet(env, "venom:fabrikaGittiKanit", { zaman: simdi, metin: f.metin, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null }, 7 * 86400).catch(() => null);
  }
  // 11 Kasım (Patron): deneme zinciri — gecikende Venom kişiye (Merdan/Aziz/Hemra) yazar; Patron'a sadece sonuç (Sami takip eder)
  for (const h of await kuyruguAl(env, "zincirHatirlat")) {
    const r = await tg(env, "sendMessage", { chat_id: h.kime, text: String(h.metin).slice(0, 4000) }).catch(() => null);
    await kaydet(env, `venom:zincirKanit:${h.id}`, { zaman: simdi, ad: h.ad, metin: h.metin, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null, hata: r && !r.ok ? String(r.description || "").slice(0, 120) : null }, 3 * 86400).catch(() => null);
  }
  for (const z of await kuyruguAl(env, "zincirSonuc")) {
    const r = await yaz({ ...env, __izin: "cevap" }, z.metin, { posta: { kaynak: "sami", tur: "cevap", izin: "cevap" } }).catch(() => null);
    await kaydet(env, `venom:zincirKanit:${z.id}`, { zaman: simdi, metin: z.metin, ok: Boolean(r && r.ok), mesaj: r && r.result ? r.result.message_id : null, yazi: r && r.result ? r.result.text : null }, 3 * 86400).catch(() => null);
  }
  // Diğer botların sonuçları → "✅ yapıldı"
  for (const s of await kuyruguAl(env, "sonuc")) { if (s.ok && /^(Mesaj|Hatırlatma) .* gitti \(Sami\)\.?$/.test(String(s.aciklama || ""))) continue; /* 10 Kasım: "Mesaj X'e gitti" özete girmez */ await bildir(env, `${s.ok ? "✅" : "⚠️"} ${s.aciklama}`, { simdi, kaynak: /^(pp|kys|kms|kv|kid)-/.test(String(s.id || "")) ? "kemal" : "venom", tur: "bilgi" }); if (/^(pp|kys|kms|kv)-/.test(String(s.id || ""))) await isCevap(env, "kemal", simdi).catch(() => null); }
  try { await paylasimGonder(env, simdi); } catch (e) { await hataYaz(env, "paylas", e); }
  // 9 Kasım (sert müdür): görevler (Hemra + Merdan), çözüm kuyruğu, bota verilen emirlerin kontrolü
  try { await gorevAdimi(env, simdi, mudurAraclari(env, simdi)); } catch (e) { await hataYaz(env, "gorev", e); }
  try { await cozumAdimi(env, simdi, mudurAraclari(env, simdi)); } catch (e) { await hataYaz(env, "cozum", e); }
  try { await emirAdimi(env, simdi); } catch (e) { await hataYaz(env, "emir", e); }
  // 9 Kasım (ekip düzeni): Hemra'nın seçimleri her çalışmada; toplu liste hafta içi 11:00 ve 16:00
  try { await hemraKararAdimi(env, simdi, hemraAraclari(env, simdi)); } catch (e) { await hataYaz(env, "hemraKarar", e); }
  for (const h of LISTE_SAATLERI) if (saat(simdi) >= h && saat(simdi) < h + 1 && (await ilkKezBugun(env, `hemraListe:${h}:${gunAnahtari(simdi)}`))) { try { await hemraListesiGonder(env, simdi, { stokIste, biriktir: (m) => biriktir(env, { kaynak: "venom", metin: m, tur: "bilgi" }, simdi) }); } catch (e) { await hataYaz(env, "hemraListe", e); } }
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
      try { for (const t of rt.slice(0, 5)) await aracCalistir(env, "mesaj_taslagi", { kime: "fuat", metin: t.metin }, simdi); } finally { env.__sohbette = false; }
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
export async function sabahOzeti(env, simdi) {
  let test = ""; try { test = await gunlukTest(env, simdi); } catch (e) { test = `❌ Sabah testi çalışmadı: ${String(e && e.message).slice(0, 120)}`; }
  const toplu = await topluRaporMetni(env, simdi).catch(() => "");
  const bekleyen = await bekleyenlerMetni(env, simdi).catch(() => "");
  const bir = await birikenler(env, simdi);
  const pazartesi = new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() === 1;
  const hafta = pazartesi ? [await haftalikOzet(env, simdi).catch(() => ""), await paylasilmayanlar(env, simdi).catch(() => ""), await fikirKutusu(env, simdi).catch(() => "")].filter(Boolean) : [];
  const testSatir = satirlar(test).slice(1);
  const bozuk = testSatir.filter((x) => /❌/.test(x));
  const cf = testSatir.find((x) => /^☁️/.test(x) && /⚠️/.test(x));
  const onem = bir.filter((x) => ["paylaşılamadı", "uyarı"].includes(x.kategori)).slice(-3).map((x) => `⚠️ ${x.ozet}`);
  const metin = ozetKisalt(`☀️ Günaydın Patron — ${tarihSaat(simdi).slice(0, 10)}`, [
    { satirlar: bozuk.length ? bozuk : ["✅ Sabah testi: bütün botlar çalışıyor"], enFazla: 3 },
    { satirlar: cf ? [cf] : [], enFazla: 1 },
    { satirlar: satirlar(bekleyen).slice(0, 4), enFazla: 3 },
    { satirlar: satirlar(toplu).slice(1).filter((x) => !/^(✅ Kontroller temiz|📋 Bugün yapılacaklar)/.test(x)), enFazla: 4 },
    { satirlar: [birikimSatiri(bir), ...onem].filter(Boolean), enFazla: 3 },
    { satirlar: hafta.length ? [`📅 Haftalık özet hazır (geçen hafta): ${satirlar(hafta[0])[1] || ""}`] : [], enFazla: 1 },
    { satirlar: satirlar(((await oku(env, `venom:botRapor:${gunAnahtari(simdi)}:sabah`, null)) || {}).metin).slice(1).map((x) => `📒 ${x}`), enFazla: 5 },
  ]);
  await ozetKaydet(env, "sabah", [test, toplu, bekleyen, ...hafta, ozetDetay(bir)], simdi);
  return metin;
}
export async function aksamOzeti(env, simdi) {
  const gunluk = await gunOzeti(env, simdi);
  const bir = await birikenler(env, simdi);
  const engel = (await oku(env, "venom:kontrol:engel", [])).filter((x) => simdi - x.zaman < 86400 && gunAnahtari(x.zaman) === gunAnahtari(simdi));
  const duz = (await oku(env, "venom:kontrol:duzeltme", [])).filter((x) => gunAnahtari(x.zaman) === gunAnahtari(simdi));
  const satir = satirlar(gunluk);
  const kontrol = engel.length || duz.length ? [`🛡 Venom kontrolü: ${duz.length} gönderiyi kendim düzelttim · ${engel.length} gönderi durdu (düzeltemediklerim Hemra/Merdan'a gitti)`] : [];
  const botRap = satirlar(((await oku(env, `venom:botRapor:${gunAnahtari(simdi)}:aksam`, null)) || {}).metin).slice(1).map((x) => `📒 ${x}`);
  const cuma = new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() === 5 ? [await saglikSatiri(env, simdi).catch(() => null), await mudurSatiri(env, simdi).catch(() => null), await kartHataSatiri(env, simdi).catch(() => null)].filter(Boolean) : [];
  const hedef = hedefSatiri(await botaSor(env, "kemal", "ozet").catch(() => null), gunAnahtari(simdi)); // 9 Kasım: günlük 10 onay hedefi
  const yapilmayan = yapilmayanSatiri(await oku(env, "venom:gorevler", [])); // 9 Kasım (sert müdür C)
  const cevapsiz = await merdivenSatirlari(env, simdi).catch(() => []); // 9 Kasım (onay merdiveni): Cevapsız kartlar + fabrika
  cevapsiz.unshift(...hemraSatirlari(await oku(env, "venom:hemraListe", []), simdi)); // 9 Kasım (ekip düzeni)
  const oz = await oku(env, `venom:ozTest:${gunAnahtari(simdi)}`, null); // 9 Kasım: Venom öz-testi (09:30)
  if (oz && oz.bos && oz.bos.length) cevapsiz.push(`🧪 Venom öz-testi: ${oz.bos.length} soru boş kaldı (${oz.bos.slice(0, 3).map((x) => x.soru).join(", ")}) — eksik kaynak Claude Code'da`);
  const metin = ozetKisalt(satir[0] || `🌙 Günün özeti — ${tarihSaat(simdi).slice(0, 10)}`, [
    { satirlar: [hedef].filter(Boolean), enFazla: 1 },
    { satirlar: [yapilmayan, ...cevapsiz].filter(Boolean), enFazla: 6 },
    { satirlar: cuma, enFazla: 3 },
    { satirlar: [birikimSatiri(bir)].filter(Boolean), enFazla: 1 },
    { satirlar: kontrol, enFazla: 1 },
    { satirlar: botRap, enFazla: 5 },
    { satirlar: satir.slice(1).filter((x) => !/^• 🛑/.test(x)), enFazla: 10 },
  ], "Ayrıntı: /detay", 10); // 10 Kasım (Patron): akşam özeti en fazla 10 satır
  await ozetKaydet(env, "aksam", [gunluk, ozetDetay(bir)], simdi);
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
    `${x.deneme ? "🧪 DENEME – üretim yapmayın\n" : ""}🏭 ${x.tur === "az" ? "Fabrikada bitmek üzere" : x.tur === "stokBitti" ? "Mağaza stoğu bitti" : "Fabrikada bitti"} — ${MAGAZA_BASLIK[x.magaza] || "mağaza yazılmamış"} · ${x.kod}`,
    x.fabrika ? `Fabrika: ${x.fabrika.kim} "${x.fabrika.ne}" dedi${x.fabrika.zaman ? ` (${kanitTarih(x.fabrika.zaman)})` : ""}` : null,
    x.fuat ? `Fuat onayladı (${kanitTarih(x.fuat.zaman)})` : null,
    `Mağaza stoğu: ${x.stok}`,
    `Hemra önerisi: ${ONERI_AD[x.oneri] || x.oneri}${x.not ? ` — ${x.not}` : ""}`,
    "Kural: mağaza stoğu bitmeden siteden ve Telegram'dan kaldırılmaz.",
    "Onaylıyor musun?",
  ].filter(Boolean).join("\n");
}
async function bittiOneriAdimi(env, simdi) {
  for (const x of await kuyruguAl(env, "bittiOneri")) {
    if (x.deneme && !x.zincir) { await kaydet(env, `venom:bittiDeneme:${x.sip}`, x, 3 * 86400); continue; } // zincir denemesi (Patron istedi): 🧪 işaretli kart gelir // 10 Kasım kural 5: DENEME Patron'a karar olarak GİTMEZ
    await kaydet(env, `venom:bittiKart:${x.sip}`, x, 30 * 86400);
    const metin = bittiKartMetni(x);
    const kl = { inline_keyboard: x.oneri === "sor" ? [[{ text: "🔁 Repete", callback_data: `vbo:r:${x.sip}` }, { text: "🗑 Sil", callback_data: `vbo:s:${x.sip}` }], [{ text: "⏳ Bekle", callback_data: `vbo:w:${x.sip}` }]]
      : [[{ text: "✅ Onayla", callback_data: `vbo:o:${x.sip}` }, { text: "🔁 Repete", callback_data: `vbo:r:${x.sip}` }], [{ text: "🗑 Sil", callback_data: `vbo:s:${x.sip}` }, { text: "⏳ Bekle", callback_data: `vbo:w:${x.sip}` }]] };
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
  x.karar = karar;
  x.kararKim = [cq.from && cq.from.first_name, cq.from && cq.from.last_name].filter(Boolean).join(" ") || "?"; // 10 Kasım: kanıt — kim, ne zaman, hangi düğme
  x.kararZaman = simdi;
  x.kararDugme = { o: "✅ Onayla", r: "🔁 Repete", s: "🗑 Sil", w: "⏳ Bekle" }[h] || h;
  await kaydet(env, `venom:bittiKart:${sip}`, x, 30 * 86400);
  await kuyrugaEkle(env, "bittiKarar", { id: `${sip}:${simdi}`, sip, karar, kim: x.kararKim, dugme: x.kararDugme, zaman: simdi });
  await cevap(karar === "repete" ? "Repete taslağı hazırlanıyor" : karar === "sil" ? "Sil — stok kuralıyla" : "Bekle");
  const foto = Boolean(cq.message && cq.message.photo);
  const ek = `\n\n✅ Kararınız: ${ONERI_AD[karar]}${karar === "sil" ? " (mağaza stoğu varsa stok bitince kaldırılır)" : karar === "repete" ? (x.deneme ? " (DENEME: taslak hazırlanmadı)" : " — taslak aşağıda, onayınızla Fuat'a gider") : ""}`;
  await tg(env, foto ? "editMessageCaption" : "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, [foto ? "caption" : "text"]: `${bittiKartMetni(x).replace("\nOnaylıyor musun?", "")}${ek}`.slice(0, foto ? 1024 : 4000), reply_markup: { inline_keyboard: [] } }).catch(() => null);
  if (karar === "repete" && !x.deneme) { // ASLA doğrudan sipariş: Fuat'a gidecek TASLAK Patron onayına (en az 40 adet, ✏️ Düzelt)
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
async function kopruIzle(env, simdi) {
  if (!env.STOK) return;
  const o = await stokIste(env, "/ozet", {}).catch(() => null);
  for (const k of (o && o.kopruler) || []) {
    if (!k.kalp) continue; // eski köprü (sadece değişiklikte gönderir) izlenmez
    const son = Math.max(k.son || 0, k.kalp || 0), anahtar = `venom:kopruAlarm:${k.magaza}`;
    const alarm = Number(await env.KAYIT.get(anahtar).catch(() => 0)) || 0;
    if (alarm && son > alarm) { await env.KAYIT.delete(anahtar).catch(() => null); await biriktir(env, { kaynak: "sami", metin: `✅ Köprü ${k.magaza} yeniden sinyal gönderiyor`, tur: "bilgi" }, simdi); continue; }
    if (!alarm && kopruSustu(son, simdi)) {
      await env.KAYIT.put(anahtar, String(son), { expirationTtl: 7 * 86400 }).catch(() => null);
      await bildir(env, `🔴 Köprü ${k.magaza === "BLACKROSE" ? "BLACK ROSE" : k.magaza} sustu: mağaza açık ama 1 saatten uzun sinyal yok (son: ${tarihSaat(son).slice(0, 16)}). Mağaza bilgisayarı kapalı ya da Sami durmuş olabilir.`, { simdi, kaynak: "sami", tur: "kritik" });
    }
  }
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
  for (const bot of ["kemal", "selin"]) {
    if (h[bot] >= 2 && (await ilkKezBugun(env, `paraTavan:${bot}:${gun}`))) await bildir(env, `⛔ ${ad[bot]} bugünkü yapay zekâ tavanına ulaştı: ${usd2(h[bot])} / 2,00 $. Yapay zekâ işleri yarına kadar durdu (komutlar çalışıyor).`, { simdi, tur: "kart", izin: "para" });
    else if (h[bot] >= 1.6 && h[bot] < 2 && (await ilkKezBugun(env, `para80:${bot}:${gun}`))) await bildir(env, `⚠️ ${ad[bot]} bugün ${usd2(h[bot])} harcadı (günlük tavan 2 $, %80). Tavanda yapay zekâ işi durur.`, { simdi, tur: "kart", izin: "para" });
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
    if (!v.foto) { v.fotoYok = true; if (!v.sitede) await selinFotoIste(env, v.kod, simdi); }
  }
  const pm = (x) => ({ posta: { tur: "cevap" }, protect_content: true });
  if (veriler.length === 1) {
    const v = veriler[0];
    const metin = [...temizSatir(kartSatirlari(v)), ...(bilinmeyen.length ? [`(${bilinmeyen.join(", ")} bulunamadı)`] : [])].join("\n");
    const kl = { inline_keyboard: kartDugmeleri(v.kod) };
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
  const metin = [`📦 ${veriler.length} model:`, ...veriler.flatMap((v, i) => temizSatir(kartSatirlari(v)).slice(0, 3).map((x, j) => (j === 0 ? `${i + 1}. ${x.replace(/^📦 /, "")}` : `   ${x}`))), ...(veriler.some((v) => v.fotoYok && !v.sitede) ? ["📷 Fotoğrafı olmayanları Selin'in fotoğraf listesine ekledim."] : []), ...(bilinmeyen.length ? [`(${bilinmeyen.join(", ")} bulunamadı)`] : [])].join("\n");
  return yaz(env, metin, { reply_markup: { inline_keyboard: veriler.flatMap((v, i) => kartDugmeleri(v.kod, `${i + 1}· `)) }, ...pm() });
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
  if (islem === "p") { await cevap("Kemal'e"); return hizliPaylas(env, { kod }, simdi, `${kod} paylaş`); } // Venom kontrolü + 09–21 kuralı Kemal'de
  if (islem === "v") {
    await cevap("Pelin'e");
    const r = await botaSor(env, "pelin", "mesaj", `/uret ${kod}`);
    if (r) await isKaydet(env, "pelin", `${kod} üretim kartı`, simdi);
    return yaz(env, `🎬 ${kod} → Pelin. ${r ? "Önce maliyet kartı gelecek; onaylamadan para harcanmaz." : "Pelin'e ulaşılamadı."}`);
  }
  if (islem === "r") { // ASLA doğrudan sipariş: Fuat'a gidecek TASLAK Patron onayına (✏️ Düzelt ile adet/renk)
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
  "Gerisi Venom'da birikir: sabah 09:40 ve akşam 20:00 TEK özet (en fazla 15 satır). Ayrıntı: /detay",
  `Acil ve cevap hariç günde en fazla ${POSTA_TAVAN} mesaj; fazla kartlar saatte bir tek mesajda birleşir.`,
  "Köprü sadece hafta içi 09:00–20:00 izlenir; cumartesi/pazar uyarı yok.",
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
export async function sabitKomut(env, metin, simdi) {
  const t = String(metin || "").trim().toLocaleLowerCase("tr");
  if (t === "📋 bekleyenler") return bekleyenlerMetni(env, simdi);
  if (t === "📊 bugün ne oldu") return [await gunOzetiKisa(env, simdi)].join("\n");
  if (t === "⛔ durdur") { await tg(env, "sendMessage", { chat_id: patron(env), text: "⛔ Bütün botların paylaşım / üretim / site yazma işleri durdurulsun mu?", reply_markup: { inline_keyboard: [[{ text: "⛔ Evet, hepsini durdur", callback_data: "vd:e" }, { text: "Vazgeç", callback_data: "vd:x" }]] } }); return true; }
  if (/^hepsini durdur(?=\s|$|[.!])/.test(t)) { await durYaz(env, { hepsi: true, neden: { hepsi: "Patron: hepsini durdur" } }, simdi); return "⛔ HEPSİ DURDURULDU: Kemal (paylaşım), Selin (site yazma), Pelin (üretim), Sami (zamanlı işler). Açmak için \"hepsini aç\"."; }
  if (/^hepsini a[çc](?=\s|$|[.!])/.test(t)) { await durYaz(env, { hepsi: false, kemal: false, selin: false, pelin: false, sami: false }, simdi); return "✅ Hepsi AÇILDI; botlar kaldıkları yerden devam ediyor."; }
  const m = t.match(/^(kemal|selin|pelin|sami)['’]?(?:i|ı|yi|yı|u|ü|yu|yü)?\s+(a[çc]|durdur)(?=\s|$|[.!])/);
  if (m) { const ac = /^a/.test(m[2]); await durYaz(env, { [BOT_ADLAR[m[1]]]: !ac, neden: { [m[1]]: ac ? "" : "Patron durdurdu" } }, simdi); return `${ac ? "✅" : "⛔"} ${m[1][0].toUpperCase() + m[1].slice(1)} ${ac ? "AÇILDI" : "DURDURULDU"}.`; }
  if (/^sesli\s+(rapor|a[çc])/.test(t)) { await tg(env, "sendMessage", { chat_id: patron(env), text: "🔊 Sesli rapor için OpenAI ses servisi gerekir (ÜCRETLİ): rapor başına ≈0,02 $, sabah + akşam ≈1,2 $/ay. Açayım mı?", reply_markup: { inline_keyboard: [[{ text: "✅ Aç (≈1,2 $/ay)", callback_data: "vs:a" }, { text: "❌ Hayır", callback_data: "vs:x" }]] } }); return true; }
  if (/^sesli kapat/.test(t)) { await env.KAYIT.put("venom:sesliAcik", "0"); return "Sesli rapor kapatıldı."; }
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
  const r = await client.messages.create({ model, max_tokens: 600, system: `${ORTAK_KURALLAR}\nSen VOLONTE'nin satış danışmanısın. Kısa, uygulanabilir, sade Türkçe.`, messages: [{ role: "user", content: `Bu haftanın verisi:\n${veri}\n\nSatışı artıracak 3 somut öneri yaz (her biri tek satır, hangi model/ne yapılacak). Fiyat önerme.` }] });
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
    try { await venomCron(env, Math.floor(Date.now() / 1000)); } catch (e) { await hataYaz(env, "cron", e); }
  },
};
