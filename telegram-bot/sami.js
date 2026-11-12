// SAYIM SAMİ — Telegram botu (ayrı Cloudflare Worker "volonte-sami").
//
// Stok bilgisinin TEK kaynağı Sami: Vegawin köprüsünden gelen veri Sami'nin deposunda (StokDO).
// Kemal ve Selin stoğu her zaman buradan okur. VEGAWIN'E HİÇBİR ŞEY YAZILMAZ: mağaza bilgisayarındaki köprü
// sadece okur; bu bot da sadece Sami'nin deposunu okur ve raporlar.
//
// Görevleri:
//  - Stok bitince ekibe soru (🔁 Repete / ⏳ Beklesin; 13 Kasım: "Sil" yok) — Kemal'den devraldı ("sami:aktif").
//  - /stok, /stok 3194
//  - Kanalı izler: her paylaşımı, o andaki stok ve fiyatla kaydeder (kontrol için).
//  - Her sabah 09:05 "Venom Ekip" grubuna rapor: köprü, biten/gelen/fiyatı değişen modeller, kontroller
//    (stoksuz paylaşım, sitede yanlış fiyat, sitede görünen ama stoğu biten model).
//
// Ayarlar: BOT_TOKEN, WEBHOOK_SECRET (secret) · ALLOWED_IDS, EKIP_IDS, SELF_URL, GITHUB_REPO (düz metin) ·
// KAYIT (ortak KV, okuma + birkaç kayıt) · STOK (Kemal'in betiğindeki StokDO).

import { kitapOku } from "./kitap.js";
import { defterTg, defterKarar, defterIs } from "./is-defteri.js";
import { acikSessizlik } from "./magaza-saat.js";
import { durdurulduMu } from "./durdurma.js";
import { patronaGider, venomaAktar, venomCevabi, sahteDugme, sahteMesaj } from "./tek-kapi.js";
import { kodBul } from "./ortak.js";
import { siteVerisi } from "./depo-oku.js";
import { siteHaftalik, siteDenemesi } from "./site-ozet.js";
import { gunDokumu, raporTekrar, cariDokumu } from "./gun-dokum.js";
import { paylasimTakip } from "./paylasim-takip.js";
import { indirimliMi } from "./stok.js";
import { kisiler, tarihYaz, stokIste, stokSorulariGonder, stokKarari, stokGoster, kisiAdi } from "./stokbot.js";
import { grubaGonder, grupUyeligi, raporuBirak, birikimSuzgeci, birikimAdimi, patronDenemesi } from "./venom.js";
import { hizmetHesabi, tabloKimligi, sayfaHazirla, sayfayaYaz } from "./google.js";
import { beyinCevapla, beyinDenemesi, yaziYorumla } from "./sami-beyin.js";
import { kagitAcik } from "./gorev-kagidi.js";
import { stokSorguMesaji, stokSorguDugmesi, stokSorguTakip, stokYetkiKomutu, stokYetkiDugmesi, sorgularKomutu, brSayKomutu } from "./stoksorgu.js";
import { mutabakatKomutu, mutabakatDugmesi, mutabakatFarkMesaji, mutabakatAdimi, odemeMesaji, bakiyeKomutu, isOzetiKomutu, isOzetiDugmesi, adetKomutu, adetDugmesi, nuriStokKomutu } from "./mutabakat.js";
import { borcLimitKomutu } from "./cari-takip.js";
import { patronMu, geriKuyrugu } from "./sil.js";
import { guvenliGonder } from "./tg-guvenli.js";
import { ciroKomutu } from "./ciro.js";
import { venomGidenAdimi } from "./venom-kopru.js";
import { gorevDugmesi, gorevAciklamaMesaji } from "./venom-gorev.js";
import { rkDugme, rkYazi, rkHemraYazi, repeteKartAdimi, TEST_RESIM_YOLU } from "./repete-kart.js"; // 11 Kasım: repete kartı (önce deneme yolunda)
import { testResimBayt } from "./repete-test-resim.js";
import { kartIzle, kartBasildi, kartTakipAdimi } from "./kart-takip.js"; // 11 Kasım (kural 54): kart takibi
import { hemraDugmesi } from "./venom-ekip.js";
import { kartTekrarAdimi, kartTamamlaAdimi, kartIletAdimi, kisiKontrolAdimi, GUNCEL } from "./kart-tekrar.js";
import { fabrikaAdimi, eksikKomutu, fabrikaCevabi, fabrikaDugmesi, yabanciMesaji, siparisDugmesi, kararDugmesi, repeteMetni, siparisTakip, fabrikaDenemesi, fabrikaKisisiMi, aramaNotuMesaji, fiyatKisisiMi, fiyatCevabi, fabrikaYaziMesaji, fabrikaSesMesaji, zincirDugmesi, fabrikaZincirAdimi, teyitDugmesi } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const GUNCELLEMELER = ["message", "callback_query", "my_chat_member", "channel_post"];
const RAPOR_SAATI = [9, 5]; // 09:05
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const kimlikler = (y) => String(y || "").split(",").map((x) => x.trim()).filter(Boolean);
const yoneticiMi = (id, env) => kimlikler(env.ALLOWED_IDS).includes(String(id));
const izinli = (id, env) => kisiler(env).includes(String(id));

async function tg(env, metod, govde) {
  if (govde && venomCevabi(metod, govde)) return govde.text ? venomaAktar(env, "sami", "sendMessage", { chat_id: env.MURAT_ID, text: `ℹ️ ${govde.text}` }) : { ok: true, result: true };
  if (govde && (await patronaGider(env, govde.chat_id))) { const r = await venomaAktar(env, "sami", metod, govde, (m, g) => tgGercek(env, m, g)); await defterTg(env, "sami", metod, govde, r); return r; }
  const r = await tgGercek(env, metod, govde);
  await kartIzle(env, metod, govde, r); // 11 Kasım (kural 54): elemana giden her kart takip edilir (basılmazsa hatırlatma → Venom)
  await defterTg(env, "sami", metod, govde, r); // 9 Kasım: iş defteri (Venom her şeyi bilir)
  await gercekKanit(env, metod, govde, r);
  return r;
}
// 10 Kasım (kanıtsız tamam yok): GERÇEK eksik listesi zincirinde telefona giden mesajın Telegram'ın döndürdüğü hali → StokDO "kanit:gercek:<gün>"
// (deneme 🧪 ayrı: sami:kanit). Sadece kart / liste / teyit mesajları.
async function gercekKanit(env, metod, govde, r) {
  try {
    if (!r || !r.ok || !govde || typeof govde !== "object" || govde instanceof FormData || !/^(send|edit|copy)/.test(metod)) return;
    const m = r.result && typeof r.result === "object" ? r.result : null;
    const yazi = String((m && (m.caption || m.text)) || govde.caption || govde.text || "");
    if (!yazi || /🧪 DENEME/.test(yazi)) return;
    if (!(govde.reply_markup || /LİSTESİ|Gidecek liste|Göndereyim mi|Şunu anladım|fabrikaya gönderildi|Kaydedildi|kaydedildi|Hemra onayladı|Onaylandı/.test(yazi))) return;
    const k = `kanit:gercek:${gunAnahtari(Math.floor(Date.now() / 1000))}`;
    const l = JSON.parse((await stokIste(env, "/ayar-oku", { k })).v || "[]");
    const dg = (rm) => ((rm && rm.inline_keyboard) || []).map((s) => s.map((b) => b.text));
    l.push({ zaman: Math.floor(Date.now() / 1000), metod, chat: String(govde.chat_id), mesaj: (m && m.message_id) || govde.message_id || null, resim: Boolean(m && (m.photo || m.video)) || /copy|Photo/.test(metod), yazi: yazi.slice(0, 700), dugmeler: dg(m && m.reply_markup) .length ? dg(m.reply_markup) : dg(govde.reply_markup) });
    await stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(l.slice(-400)) });
  } catch { /* kanıt yazılamazsa iş durmaz */ }
}
async function tgGercek(env, metod, govde) {
  // 10 Kasım (ACİL): her gönderim doğrulanır, sınır aşımı kısaltılır, hata bir kez düzeltilip denenir, olmazsa "sami:tgHatalar"
  return guvenliGonder(env, "sami", async (m, g) => {
    const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/${m}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(g),
    });
    return r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  }, metod, govde);
}

function gizliEsit(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

// TEK KAPI (5 Kasım): Venom'dan Sami düğmesi (sami-giris.js "VenomKapisi")
export async function venomDugme(env, data, rid) { await guncelleme(sahteDugme(env, data, rid), env); return true; }
export async function repeteAdim(env) { await repeteKartAdimi(env, Math.floor(Date.now() / 1000), tg); return true; } // 11 Kasım: Venom → hemen (5 dk bekleme yok)
export async function gidenAdim(env) { await venomGidenAdimi(env, Math.floor(Date.now() / 1000), tg); return true; } // 11 Kasım: "Merdan'a söyle" → kart HEMEN (5 dk bekleme yok)
export async function venomMesaj(env, metin) { await guncelleme(sahteMesaj(env, metin), env); return true; }

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    if (istek.method === "POST" && url.pathname === "/telegram") {
      if (!gizliEsit(istek.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) return new Response("yetkisiz", { status: 401 });
      const u = await istek.json();
      if (await birikimSuzgeci(env, "sami", u, (id) => izinli(id, env), tg)) return new Response("ok");
      await guncelleme(u, env);
      return new Response("ok");
    }
    if (istek.method === "GET" && url.pathname === TEST_RESIM_YOLU) return new Response(testResimBayt(), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } }); // deneme repete kartının yer tutucu resmi
    return new Response("Sayım Sami çalışıyor (sadece okur).");
  },
  async scheduled(olay, env) {
    if (!env.STOK) return;
    const simdi = Math.floor(Date.now() / 1000);
    try { await kitapOku(env, "sami"); } catch { /* 13 Kasım (kural 37): bot her çalışmada kitabın güncel sürümünü okur (ofis "kitap sürümü") */ }
    if (env.BOT_TOKEN) try { await patronDenemesi(env, "Sami", tg); } catch { /* */ }
    if (env.BOT_TOKEN) try { await birikimAdimi(env, "sami", simdi, tg); } catch { /* bir sonraki çalışmada */ }
    try { if (await kagitAcik(env, "sami", "kisiKontrol")) await kisiKontrolAdimi(env, "sami", tg); } catch { /* 9 Kasım: kişi /start kontrolü */ }
    if (env.BOT_TOKEN) try { if (await kagitAcik(env, "sami", "kartIlet")) await kartIletAdimi(env, "sami", tg); } catch { /* 9 Kasım: Hemra'nın seçtiği kişiye kart */ }
    if (env.BOT_TOKEN) try { if (await kagitAcik(env, "sami", "kartTamamla")) await kartTamamlaAdimi(env, "sami", tg, simdi); } catch { /* 10 Kasım: yarım giden kartları tamamla (bir kerelik) */ }
    if (env.BOT_TOKEN) try { if (await kagitAcik(env, "sami", "kartTekrar")) await kartTekrarAdimi(env, "sami", tg, simdi); } catch { /* 9 Kasım: onay merdiveni (görev kartları dahil) */ }
    if (await durdurulduMu(env, "sami")) return; // 6 Kasım: durduruldu → zamanlı işler (mesaj/yazma) bekler
    // Bot anahtarı yokken (BotFather adımı bekliyor) Telegram işleri yapılmaz; sabah raporu ve kontroller
    // yine hazırlanır ve ortak hafızaya bırakılır (toplu rapora girer).
    const fabrika = (e, t) => fabrikaAdimi(e, t, tg);
    const siparis = (e, t) => siparisTakip(e, t, tg);
    const repeteKart = (e, t) => repeteKartAdimi(e, t, tg);
    const kartTakip = (e, t) => kartTakipAdimi(e, t, tg); // 11 Kasım (kural 54): 30 dk hatırlatma, 1 saat → Venom // 11 Kasım: repete kartı — Patron kararı, hatırlatma, teslim günü, mal geldi
    const zincir = (e, t) => fabrikaZincirAdimi(e, t, tg); // 10 Kasım: Patron kararı, toplu cevap, Sinem 18:00 özeti, bir kerelik işler
    const beyinDeneme = (e, t) => beyinDenemesi(e, t, tg);
    const stokSorgu = async (e, t) => { if (await kagitAcik(e, "sami", "stokSorgu")) await stokSorguTakip(e, t, tg); };
    const dokum = async (e) => { await gunDokumu(e); await raporTekrar(e, tg); await cariDokumu(e, tg); };
    const paylasilmamis = async (e, t) => { if (await kagitAcik(e, "sami", "paylasimTakip")) await paylasimTakip(e, t, tg); };
    const mutabakat = async (e, t) => { if (await kagitAcik(e, "sami", "mutabakat")) await mutabakatAdimi(e, t, tg); };
    const venomGiden = (e, t) => venomGidenAdimi(e, t, tg); // Venom'un onaylanan dış mesajları (3 Kasım)
    const siteOzet = async (e, t) => { await siteDenemesi(e); if (await kagitAcik(e, "sami", "siteHaftalik")) await siteHaftalik(e, t, tg, String(e.MURAT_ID || "").split(",")[0].trim()); };
    const siteBakis = (e, t) => siteBakisYaz(e, t); // 9 Kasım: repete raporu için model başına sitede bakılma (günde bir)
    const satisKontrol = (e, t) => satisSayimKontrol(e, t); // 10 Kasım (Patron): ofis ile Sami'nin satış sayısı her gün karşılaştırılır
    const isler = env.BOT_TOKEN ? { webhookKur, repeteKart, kartTakip, satisKontrol, sorular, sabahRaporu, stokTablosu, harcamaTablosu, fabrika, siparis, zincir, beyinDeneme, stokSorgu, siteOzet, siteBakis, dokum, paylasilmamis, mutabakat, venomGiden } : { sabahRaporu, stokTablosu, harcamaTablosu };
    for (const [ad, f] of Object.entries(isler)) {
      try {
        await f(env, simdi);
      } catch (e) {
        const hata = `${ad}: ${String(e && e.message).slice(0, 300)}`;
        const eski = await env.KAYIT.get("sami:hata", "json");
        if (!eski || eski.hata !== hata || simdi - eski.zaman > 3600) await env.KAYIT.put("sami:hata", JSON.stringify({ zaman: simdi, hata }), { expirationTtl: 7 * 86400 });
      }
    }
  },
};

// 9 Kasım (Patron, repete raporu): son 14 günde sitede model sayfasına bakılma sayısı → Sami'nin deposu "site:modelBakis" (günde bir).
// Site sayımı gizlilik dostudur (IP/çerez yok); burada sadece model kodu → sayı.
export async function siteBakisYaz(env, simdi) {
  if (!env.SITE_IC || !env.STOK) return;
  const gun = gunAnahtari(simdi);
  const eski = (await stokIste(env, "/ayar-oku", { k: "site:modelBakis" }).catch(() => ({}))).v;
  if (eski && JSON.parse(eski).gun === gun) return;
  const l = await env.SITE_IC.ozet(gunAnahtari(simdi - 14 * 86400), gun).catch(() => null);
  if (!Array.isArray(l)) return;
  const modeller = Object.fromEntries(l.filter((x) => x.tur === "model").map((x) => [String(x.anahtar), Number(x.n) || 0]));
  await stokIste(env, "/ayar-yaz", { k: "site:modelBakis", v: JSON.stringify({ gun, gunSayisi: 14, modeller }) });
}

async function webhookKur(env) {
  if (!env.SELF_URL) return;
  const hedef = `${env.SELF_URL}/telegram`;
  const b = await tg(env, "getWebhookInfo", {});
  const kurulu = b.ok && b.result.url === hedef && GUNCELLEMELER.every((g) => (b.result.allowed_updates || []).includes(g));
  if (!kurulu) {
    const r = await tg(env, "setWebhook", { url: hedef, secret_token: env.WEBHOOK_SECRET, allowed_updates: GUNCELLEMELER, max_connections: 1 });
    await env.KAYIT.put("sami:webhook", JSON.stringify({ zaman: Math.floor(Date.now() / 1000), ok: r.ok, hata: r.description || null }));
    if (!r.ok) return;
  }
  // Sami'nin botu açık: stok sorularını artık Kemal değil Sami gönderir.
  if (!(await env.KAYIT.get("sami:aktif"))) await env.KAYIT.put("sami:aktif", "1");
}

async function sorular(env, simdi) {
  if (!(await kagitAcik(env, "sami", "stokSorulari"))) return; // 10 Kasım görev kâğıdı
  const s = saat(simdi);
  if (s < 8 || s >= 21) return; // gece soru yok
  await stokSorulariGonder(env, simdi, tg);
}

export async function guncelleme(u, env) {
  if (u.callback_query) {
    const cq = u.callback_query;
    await defterKarar(env, "sami", cq); // 9 Kasım: iş defteri
    if (cq.message && cq.message.chat) await kartBasildi(env, cq.message.chat.id, cq.message.message_id); // 11 Kasım (kural 54): asıl kanıt = basış
    const simdiD = Math.floor(Date.now() / 1000);
    // Fabrika düğmeleri: fabrika kişileri de basabilir (sadece bunlar)
    if (cq.data === GUNCEL) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "⏩ Güncel kart aşağıda" });
    if (String(cq.data || "").startsWith("fc:")) return siparisDugmesi(env, cq, tg, simdiD, izinli(cq.from.id, env) || (await fabrikaKisisiMi(env, cq.from.id)));
    if (String(cq.data || "").startsWith("fk:")) return kararDugmesi(env, cq, tg, simdiD);
    if (/^f[oh]:/.test(String(cq.data || ""))) return zincirDugmesi(env, cq, tg, simdiD); // 10 Kasım: Fuat onayı / Hemra önerisi
    if (String(cq.data || "").startsWith("ft:")) return teyitDugmesi(env, cq, tg); // 10 Kasım: "Şunu anladım … Doğru mu?" (yazan kişi; içeride kontrol)
    if (String(cq.data || "").startsWith("mt:")) return mutabakatDugmesi(env, cq, tg, simdiD); // Patron ve Fuat (yetki içeride)
    if (String(cq.data || "").startsWith("oz:")) return isOzetiDugmesi(env, cq, tg, simdiD); // Fuat'a iş özeti (sadece Patron)
    if (String(cq.data || "").startsWith("ad:")) return adetDugmesi(env, cq, tg, simdiD); // Fuat'a adet listesi (sadece Patron)
    if (String(cq.data || "").startsWith("rk:")) return rkDugme(env, cq, tg, simdiD); // 11 Kasım: repete kartı (Hemra / Fuat; yetki içeride)
    if (/^v[gd]:/.test(String(cq.data || ""))) return gorevDugmesi(env, cq, tg);
    if (/^hl:/.test(String(cq.data || ""))) return hemraDugmesi(env, cq, tg); // 9 Kasım: Hemra'nın toplu listesi // 9 Kasım: Venom görev kartı (Hemra / Merdan)
    if (!izinli(cq.from.id, env)) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Yetkiniz yok." });
    if (String(cq.data || "").startsWith("sz:")) return stokKarari(cq, env, tg);
    if (String(cq.data || "").startsWith("sq:")) return stokSorguDugmesi(env, cq, tg, simdiD);
    if (String(cq.data || "").startsWith("sy:")) return stokYetkiDugmesi(env, cq, tg);
    if (/^f[bae]:/.test(String(cq.data || ""))) return fabrikaDugmesi(env, cq, tg, Math.floor(Date.now() / 1000));
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Geçersiz düğme." });
  }
  if (u.my_chat_member) return uyelik(u.my_chat_member, env);
  if (u.channel_post) return kanalPaylasimi(u.channel_post, env);
  const m = u.message;
  if (!m || !m.from || m.chat.type !== "private") return;
  await kartBasildi(env, m.chat.id); // 11 Kasım (kural 54): kişi yazdı → kartını gördü
  if (await odemeMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // Patron: /odeme + dekont (sadece Patron)
  if (await fiyatKisisiMi(env, m.from.id)) return fiyatCevabi(env, m, tg); // 9 Kasım: Janet — SADECE fiyat, başka hiçbir şey
  if (await rkYazi(env, m, tg, Math.floor(Date.now() / 1000))) return; // 11 Kasım: Fuat "3419 onaylıyorum 10 gün" / "yapamam …" (repete kartı)
  if (await rkHemraYazi(env, m, tg, Math.floor(Date.now() / 1000))) return; // 11 Kasım: Hemra "3419 repete tekrar aç" / repete dağılımı yazısı
  if (await gorevAciklamaMesaji(env, m, tg)) return; // 9 Kasım: Venom görevi — ✏️ açıklama
  if (!izinli(m.from.id, env)) {
    if (await mutabakatFarkMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // Fuat: mutabakat farkı açıklaması
    if (/^\/stok(@\w+)?\b/i.test(String(m.text || "").trim()) && !(await kagitAcik(env, "sami", "stokSorgu")) && (await fabrikaKisisiMi(env, m.from.id))) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Stok bilgisi fabrikaya verilmiyor." }); // 10 Kasım görev kâğıdı
    if (await stokSorguMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // Fuat/Nuri: Black Rose stok sorgusu (Hemra onaylı)
    if (await fabrikaSesMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // 10 Kasım: Sinem sesli mesaj ("3394 bitti")
    if (await fabrikaYaziMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // 10 Kasım: "3394 bitti / az kaldı / 5 gün", "hepsi 5 gün", ✏️ tarih
    return yabanciMesaji(env, m, tg); // fabrika kişisi ya da /start → Murat'a sorulur
  }
  if (await aramaNotuMesaji(env, m, tg)) return; // 9 Kasım: "📞 Aradım, şu cevap geldi"
  if (await fabrikaYaziMesaji(env, m, tg, Math.floor(Date.now() / 1000))) return; // 10 Kasım: 📦 gelen adet (Aziz/Merdan), ✏️ tarih
  if (await fabrikaCevabi(env, m, tg, Math.floor(Date.now() / 1000), { yorumla: yaziYorumla })) return; // Hemra'nın eksik listesi; Aziz/Merdan kendi kartı (teyitli)
  if (await repeteMetni(env, m, tg, Math.floor(Date.now() / 1000))) return; // "3394 repete geldi …"
  const komut = (m.text || "").trim().split(/[\s@]/)[0].toLowerCase();
  if (komut === "/stok") return stokGoster(m, env, tg);
  if (komut === "/tablo") return tabloKomutu(m, env);
  if (komut === "/stokyetki") return stokYetkiKomutu(env, m, tg);
  if (komut === "/mutabakat") return mutabakatKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/ciro") return ciroKomutu(env, m, tg);
  if (komut === "/geri") return geriKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/nuristok") return nuriStokKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/adet") return adetKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/isozeti") return isOzetiKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/bakiye") return bakiyeKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/borclimit") return borcLimitKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/brsay") return brSayKomutu(env, m, tg);
  if (komut === "/sorgular") return sorgularKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/eksik") return eksikKomutu(env, m, tg, Math.floor(Date.now() / 1000));
  if (komut === "/fabrikadeneme") return fabrikaDenemesi(env, m, tg, Math.floor(Date.now() / 1000));
  // Komut değilse beyin (Haiku): normal cümleyle soru / eksik listesine serbest yazı.
  if (m.text && !m.text.trim().startsWith("/")) return beyinCevapla(env, m, tg, Math.floor(Date.now() / 1000));
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: [
    "📦 Ben Sayım Sami. Vegawin stoklarını okurum (hiçbir şeyi değiştirmem).",
    "/stok — köprünün durumu",
    "/stok 3194 — o modelin adedi, fiyatı ve durumu",
    "Stok bitince 🔁 Repete / ⏳ Beklesin sorusunu ben sorarım (silme sadece Patron ve Venom'dadır). Her sabah 09:05'te Venom Ekip grubuna rapor veririm.",
    "Stok tablosunu (Google Sheets) 5 dakikada bir güncellerim. /tablo — tablo durumu (yönetici).",
    "Bana normal cümleyle de yazabilirsiniz: \"3596'dan kaç tane kaldı?\", \"bugün en çok ne sattı?\", \"Hemra listeyi onayladı mı?\"",
  ].join("\n") });
}

// 10 Kasım (Patron): OFİS ve SAMİ satış sayısı AYNI kaynaktan (StokDO /satis-sayim). Kalıcı kontrol: ofisin gösterdiği sayı (sayfa açıldıkça
// KV "ofis:satisGosterilen:<gün>") Sami'nin sayımıyla karşılaştırılır; ofis değeri taze (≤10 dk) iken İKİ ardışık kontrolde fark varsa Venom'a hata.
export async function satisSayimKontrol(env, simdi) {
  const g = gunAnahtari(simdi);
  const ofis = await env.KAYIT.get(`ofis:satisGosterilen:${g}`, "json").catch(() => null);
  if (!ofis || simdi - (ofis.zaman || 0) > 600) return null;
  const fark = [];
  for (const m of ["VOLONTE", "BLACKROSE"]) {
    if (ofis[m] == null) continue;
    const x = await stokIste(env, "/satis-sayim", { gun: g, magaza: m }).catch(() => null);
    if (x && x.toplam !== ofis[m]) fark.push(`${m === "BLACKROSE" ? "BLACK ROSE" : "VOLONTE"}: ofis ${ofis[m]}, Sami ${x.toplam}`);
  }
  const k = "satis:kontrolFark";
  const once = JSON.parse((await stokIste(env, "/ayar-oku", { k })).v || "null");
  if (!fark.length) { if (once) await stokIste(env, "/ayar-yaz", { k, v: "null" }); return { ok: true }; }
  const metin = `⚠️ Satış sayısı uyuşmuyor (${g}): ${fark.join(" · ")}`;
  if (once && once.metin === metin) {
    if (!once.bildirildi) {
      const l = (await env.KAYIT.get("venom:yetenekIstekleri", "json").catch(() => null)) || [];
      await env.KAYIT.put("venom:yetenekIstekleri", JSON.stringify([...l, { zaman: simdi, istek: `${metin}. Ofis ve Sami aynı kaynaktan saymalı (StokDO /satis-sayim); farkın sebebini bul.` }].slice(-100)));
      await env.KAYIT.put("sami:hata", JSON.stringify({ zaman: simdi, hata: metin }), { expirationTtl: 7 * 86400 });
      await stokIste(env, "/ayar-yaz", { k, v: JSON.stringify({ ...once, bildirildi: simdi }) });
    }
    return { ok: false, metin };
  }
  await stokIste(env, "/ayar-yaz", { k, v: JSON.stringify({ metin, zaman: simdi }) }); // ilk görüş: bir sonraki kontrolde de varsa bildirilir
  return { ok: false, metin, ilk: true };
}

// "Venom Ekip" grubuna yönetici ekleyince grup kaydedilir (raporlar oraya gider).
const uyelik = (m, env) => grupUyeligi(m, env, "sami", "📦 Sayım Sami (stok, sadece okur)", tg);

// Kanal izleme: model kodlu her paylaşım, o andaki stok ve fiyatla kaydedilir.
async function kanalPaylasimi(p, env) {
  const kanal = await env.KAYIT.get("kanal", "json");
  if (!kanal || p.chat.id !== kanal.id) return;
  const kod = kodBul(p.caption || p.text || "");
  if (!kod) return;
  await stokIste(env, "/paylasim-kaydet", { mesaj: p.message_id, kod, zaman: p.date });
}

const siteUrunleri = (env) => siteVerisi(env); // Selin'in iç bağlantısıyla (depo gizli olsa da çalışır)

const liste = (kodlar, n = 15) => (kodlar.length > n ? `${kodlar.slice(0, n).join(", ")} … (+${kodlar.length - n})` : kodlar.join(", "));

// Saf rapor: test edilebilir.
export function samiRaporu({ simdi, ozet, olaylar, paylasimlar, tum, site, kodlar, sonpaylasim, siteFiyat = null }) {
  const dun = gunAnahtari(simdi - 86400);
  const satir = [`📦 Sayım Sami — ${gunAnahtari(simdi).split("-").reverse().join(".")} sabah raporu`, ""];
  const sorunlar = [];
  // Son değişiklik ile köprünün son çalışması ayrı (29 Ekim): eski köprü sadece değişiklik olunca gönderdiği için
  // "son veri" eski görünüp yanlış alarm veriyordu. Uyarı sadece "çalışıyorum" sinyali gönderen yeni köprüde verilir.
  for (const k of ozet.kopruler) {
    satir.push(`Köprü ${k.magaza}: son değişiklik ${tarihYaz(k.degisim || k.son)} · ${k.adet} model`);
    if (k.kalp) {
      const sonTemas = Math.max(k.son || 0, k.kalp || 0);
      // 9 Kasım (Patron): sadece hafta içi 09–20 sayılır; hafta sonu ve gece boşluğu normal (pazartesi bilgisayar açılınca başlar)
      const sessiz = acikSessizlik(sonTemas, simdi), durdu = sessiz > 3600;
      satir.push(`Köprü son çalışma: ${tarihYaz(sonTemas)} ${durdu ? `⚠️ ${sessiz >= 11 * 3600 ? "önceki iş günü hiç sinyal yok" : `mağaza açıkken ${Math.round(sessiz / 3600)} saattir sinyal yok`} (mağaza bilgisayarı kapalı olabilir)` : "✅"}`);
      if (durdu) sorunlar.push(`Köprü ${k.magaza}: ${sessiz >= 11 * 3600 ? "önceki iş günü hiç sinyal yok" : `mağaza açıkken ${Math.round(sessiz / 3600)} saattir sinyal yok`}`);
    } else satir.push("Köprü son çalışma: yeni köprü kurulunca görünecek (eski köprü sadece değişiklik olunca veri gönderir)");
  }
  if (!ozet.kopruler.length) satir.push("⚠️ Köprüden hiç veri gelmedi.");
  satir.push(`Stokta: ${ozet.stokta} model · stoksuz: ${ozet.stoksuz}`);
  const tur = (t) => [...new Set(olaylar.filter((o) => o.tur === t).map((o) => o.kod))];
  const biten = tur("bitti");
  const gelen = tur("geldi");
  const fiyat = olaylar.filter((o) => o.tur === "fiyat");
  satir.push(`Dün biten (${biten.length}): ${biten.length ? liste(biten) : "yok"}`);
  satir.push(`Dün gelen (${gelen.length}): ${gelen.length ? liste(gelen) : "yok"}`);
  if (fiyat.length) satir.push(`Fiyatı değişen: ${fiyat.slice(0, 10).map((o) => `${o.kod} ${o.onceki}→${o.sonraki} $`).join(", ")}`);
  const paylasilmamis = Object.entries(tum).filter(([k, x]) => x.toplam > 0 && x.fiyat != null && !kodlar[k] && !indirimliMi(k)).map(([k]) => k).sort();
  satir.push(`Stokta ama Telegram'da hiç paylaşılmamış (${paylasilmamis.length}): ${paylasilmamis.length ? liste(paylasilmamis) : "yok"}`);

  satir.push("", "🔎 Kontroller:");
  // 1) Stokta olmayan model paylaşıldı mı? (Vegawin'de olmayan = Black Rose/pasif: kontrol dışı)
  const stoksuzPaylasim = paylasimlar.filter((p) => p.toplam != null && p.toplam <= 0);
  if (stoksuzPaylasim.length) {
    for (const p of stoksuzPaylasim) {
      const kemal = sonpaylasim[p.kod] && Math.abs(sonpaylasim[p.kod] - p.zaman) < 900;
      const metin = `${p.kod} stokta yokken paylaşıldı (${tarihYaz(p.zaman)}, ${kemal ? "Kemal" : "elle"})`;
      satir.push(`• ⚠️ ${metin}`);
      sorunlar.push(metin);
    }
  } else satir.push(`• ✅ Dün (${dun}) stoksuz model paylaşılmadı (${paylasimlar.length} paylaşım kontrol edildi)`);
  // 2) Yeni sitede fiyat GÖRÜNMEMELİ (kullanıcı kararı 31 Ekim; sitenin kendi sayfaları iç bağlantıyla denenir)
  // 3) Sitede görünen ama stoğu biten var mı?
  if (siteFiyat === false) satir.push("• ✅ Sitede fiyat görünmüyor");
  else if (siteFiyat === true) { satir.push("• ⚠️ Sitede fiyat görünüyor!"); sorunlar.push("Sitede fiyat görünüyor"); }
  else satir.push("• ❔ Sitede fiyat kontrolü yapılamadı (site bağlantısı yok)");
  const gorunenStoksuz = [];
  for (const u of site) {
    const x = tum[u.kod];
    if (x && x.gizli && !u.gizli) gorunenStoksuz.push(u.kod);
  }
  if (gorunenStoksuz.length) { satir.push(`• ⚠️ Sitede görünüyor ama stoğu bitmiş: ${liste(gorunenStoksuz)}`); sorunlar.push(`Sitede görünen stoksuz: ${gorunenStoksuz.join(", ")}`); }
  else satir.push("• ✅ Sitede stoğu bitmiş model görünmüyor");
  return {
    metin: satir.join("\n"),
    ozet: `Stokta ${ozet.stokta} model; dün ${biten.length} bitti, ${gelen.length} geldi; Telegram'da paylaşılmamış ${paylasilmamis.length}.`,
    sorunlar,
    yapilacak: paylasilmamis.length ? [`Stokta olup kanala hiç paylaşılmamış ${paylasilmamis.length} model var (${liste(paylasilmamis, 8)})`] : [],
  };
}

// Sami kanala eklenmeden önce (ya da paylaşım kaydı yoksa) dünkü paylaşımlar Kemal'in kanal dizininden
// ("kodlar") çıkarılır; paylaşım anındaki stok, o andan sonraki ilk bitti/geldi olayından bulunur.
export function kanaldanPaylasimlar(kodlar, tum, olaylar, basla, bitis) {
  const sonuc = [];
  for (const [kod, gruplar] of Object.entries(kodlar)) {
    for (const g of gruplar) {
      if (!(g.tarih >= basla && g.tarih < bitis)) continue;
      const x = tum[kod];
      let toplam = x ? x.toplam : null;
      const sonraki = olaylar.filter((o) => o.kod === kod && o.zaman > g.tarih && ["bitti", "geldi"].includes(o.tur)).sort((a, b) => a.zaman - b.zaman)[0];
      if (x && sonraki) toplam = sonraki.tur === "bitti" ? 1 : 0;
      sonuc.push({ kod, zaman: g.tarih, toplam, mesaj: g.ids[0] });
    }
  }
  return sonuc.sort((a, b) => a.zaman - b.zaman);
}

async function sabahRaporu(env, simdi) {
  const s = saat(simdi);
  const elle = await env.KAYIT.get("sami:elleRapor"); // elle istenen rapor: saat ve günlük sınır yok, Telegram'a gitmez
  const gun = gunAnahtari(simdi);
  if (!elle) {
    if (s < RAPOR_SAATI[0] + RAPOR_SAATI[1] / 60 || s >= 10) return;
    if ((await stokIste(env, "/ayar-oku", { k: `rapor:${gun}` })).v) return;
    await stokIste(env, "/ayar-yaz", { k: `rapor:${gun}`, v: "1" });
  } else await env.KAYIT.delete("sami:elleRapor");
  const dunBasi = simdi - (simdi + SAAT_FARKI) % 86400 - 86400; // dün 00:00 (İstanbul)
  const tum = await stokIste(env, "/tum");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  let paylasimlar = await stokIste(env, "/paylasimlar", { basla: dunBasi, bitis: dunBasi + 86400 });
  if (!paylasimlar.length) paylasimlar = kanaldanPaylasimlar(kodlar, tum, await stokIste(env, "/olaylar", { basla: dunBasi, bitis: simdi }), dunBasi, dunBasi + 86400);
  const rapor = samiRaporu({
    simdi,
    ozet: await stokIste(env, "/ozet"),
    olaylar: await stokIste(env, "/olaylar", { basla: dunBasi, bitis: dunBasi + 86400 }),
    paylasimlar,
    tum,
    site: await siteUrunleri(env),
    kodlar,
    sonpaylasim: (await env.KAYIT.get("sonpaylasim", "json")) || {},
    siteFiyat: env.SITE_IC ? await env.SITE_IC.dene(["/", "/veri"]).then((l) => l.some((r) => r.fiyat)).catch(() => null) : null,
  });
  await env.KAYIT.put(`venom:samiMetin:${gun}`, rapor.metin, { expirationTtl: 7 * 86400 }); // tam metin (kontrol için)
  if (elle) return;
  await raporuBirak(env, "sami", simdi, rapor);
  if (env.BOT_TOKEN && (await kagitAcik(env, "sami", "grupRaporu"))) await grubaGonder(env, "sami", rapor.metin, tg);
}

// ---------- Google Sheets (kullanıcı kararı, 28 Ekim) ----------
// Stok tablosu: Sami'nin deposunun (StokDO) birebir aynası; 5 dakikada bir, değişiklik varsa (en geç saatte bir) yazılır.
// Botlar stoğu yine Sami'nin deposundan okur (hızlı, sınırsız); tablo aynı veriden yazıldığı için bire bir aynıdır.
// Sadece: model kodu, adet, satış fiyatı, sitede, Telegram'da, Telegram'da son paylaşım tarihi. Alış fiyatı / maliyet / kâr / koddaki ek (B20) YOK —
// köprü bunları zaten okumaz. Harcama tablosu ayrıdır (yalnız kullanıcı görür; paylaşımı kullanıcı Google'da yapar).
const ayGoster = (ay) => ay.split("-").reverse().join(".");
const zamanYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`; };

const gunYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`; };
// tg: Telegram son paylaşım tarihleri (Sami'nin deposu, Kemal yazar) — Kemal günlük modelleri buna göre seçer.
export function stokTablosuSatirlari(tum, site, kodlar, tg = {}) {
  const sitede = new Set(site.filter((u) => !u.gizli).map((u) => String(u.kod)));
  return Object.entries(tum)
    .sort(([ka, a], [kb, b]) => (b.toplam > 0) - (a.toplam > 0) || ka.localeCompare(kb, "tr", { numeric: true }))
    .map(([kod, x]) => [kod, Math.max(0, Number(x.toplam) || 0), x.fiyat != null ? Number(x.fiyat) : "", sitede.has(kod) ? "Var" : "Yok", kodlar[kod] || tg[kod] ? "Var" : "Yok", tg[kod] ? gunYaz(tg[kod]) : ""]);
}

async function tabloKimlik(env, tur) {
  return tabloKimligi(env[tur === "stok" ? "STOK_TABLO_ID" : "HARCAMA_TABLO_ID"]) || (await env.KAYIT.get(`sami:tablo:${tur}`));
}

async function sha(metin) {
  const o = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return [...new Uint8Array(o)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Tablo yazma güvenli sarmalı (29 Ekim): son yazma ve son hata Sami'nin deposunda (/tablo gösterir); Google hata
// verirse 30 dakika beklenir (her 5 dakikada boşuna denenmez, hata kaydı KV yazma sınırını tüketmez).
async function tabloDurum(env, tur) { return JSON.parse((await stokIste(env, "/ayar-oku", { k: `tablo:durum:${tur}` })).v || "{}"); }
function tabloGuvenli(tur, yaz) {
  return async (env, simdi) => {
    if (!hizmetHesabi(env) || !(await tabloKimlik(env, tur))) return;
    const d = await tabloDurum(env, tur);
    const hemen = await env.KAYIT.get("sami:tabloYeniden"); // elle "hemen dene" (beklemeyi atlar)
    if (hemen) await env.KAYIT.delete("sami:tabloYeniden");
    if (!hemen && d.bekle && simdi < d.bekle) return;
    // Durum değişince ortak kayda da yazılır (dışarıdan kontrol için; sadece değişince → KV sınırı)
    const dis = async (x) => { const k = `sami:tabloDurum:${tur}`; const e = await env.KAYIT.get(k); const v = JSON.stringify(x); if (e !== v) await env.KAYIT.put(k, v); };
    try {
      const yazdi = await yaz(env, simdi);
      if (yazdi || d.sonHata) await stokIste(env, "/ayar-yaz", { k: `tablo:durum:${tur}`, v: JSON.stringify({ ...d, ...(yazdi ? { sonYazma: simdi } : {}), sonHata: null, bekle: null }) });
      if (yazdi || d.sonHata) await dis({ durum: "tamam", ilkYazma: d.sonYazma ? undefined : simdi });
    } catch (e) {
      await stokIste(env, "/ayar-yaz", { k: `tablo:durum:${tur}`, v: JSON.stringify({ ...d, sonHata: String(e && e.message).slice(0, 300), hataZaman: simdi, bekle: simdi + 1800 }) });
      await dis({ durum: "hata", hata: String(e && e.message).slice(0, 300) });
    }
  };
}
export const stokTablosu = tabloGuvenli("stok", stokTablosuYaz);
export const harcamaTablosu = tabloGuvenli("harcama", harcamaTablosuYaz);

// Google hata mesajını sade Türkçeye çevirir
export function googleHataAciklama(m) {
  const t = String(m || "");
  if (/has not been used in project|is disabled/i.test(t)) return `Google Sheets API bu Google projesinde kapalı → console.cloud.google.com'da aynı projede "Google Sheets API" → Etkinleştir.${(t.match(/project (\d+)/) || [])[1] ? ` (proje no: ${t.match(/project (\d+)/)[1]})` : ""}`;
  if (/403|PERMISSION_DENIED|does not have permission/i.test(t)) return "Tabloya erişim yok → tabloyu hizmet hesabının e-postasıyla \"Düzenleyen\" olarak paylaşın.";
  if (/404|not found/i.test(t)) return "Tablo bulunamadı → linki kontrol edin (/tablo stok <link>).";
  if (/GOOGLE_SA|invalid_grant|private key/i.test(t)) return "Google anahtarı (GOOGLE_SA) hatalı → JSON dosyasının tamamı yapıştırılmalı.";
  return t.slice(0, 200);
}

async function stokTablosuYaz(env, simdi) {
  if (!hizmetHesabi(env)) return;
  const id = await tabloKimlik(env, "stok");
  if (!id) return;
  const satirlar = stokTablosuSatirlari(await stokIste(env, "/tum"), await siteUrunleri(env), (await env.KAYIT.get("kodlar", "json")) || {}, await stokIste(env, "/tg-hepsi").catch(() => ({})));
  const iz = await sha(JSON.stringify(satirlar));
  const onceki = JSON.parse((await stokIste(env, "/ayar-oku", { k: "tablo:stok" })).v || "{}");
  if (onceki.id === id && onceki.iz === iz && simdi - onceki.zaman < 3600) return false;
  if (onceki.id !== id) await sayfaHazirla(env, id, "Stok", 2);
  const stokta = satirlar.filter((r) => r[1] > 0).length;
  await sayfayaYaz(env, id, "Stok", [
    [`VOLONTE stok — son güncelleme ${zamanYaz(simdi)} · Sayım Sami (Vegawin'den, sadece okuma) · stokta ${stokta} model`, "", "", "", "", ""],
    ["Model kodu", "Adet", "Satış fiyatı ($)", "Sitede", "Telegram'da", "Telegram'da son paylaşım"],
    ...satirlar,
  ]);
  await stokIste(env, "/ayar-yaz", { k: "tablo:stok", v: JSON.stringify({ id, iz, zaman: simdi }) });
  return true;
}

// Harcama tablosu: ay ay Claude + üretim (fal.ai). Aylık değerler Sami'nin deposunda da saklanır (KV kaydı 70 günde silinir).
async function harcamaTablosuYaz(env, simdi) {
  const id = await tabloKimlik(env, "harcama");
  const ay = new Date((simdi + SAAT_FARKI) * 1000).toISOString().slice(0, 7);
  const kayit = JSON.parse((await stokIste(env, "/ayar-oku", { k: "tablo:harcama" })).v || "{}");
  if (kayit.id === id && simdi - (kayit.zaman || 0) < 3600) return false; // saatte bir
  const aylar = kayit.aylar || {};
  aylar[ay] = {
    claude: Number((await env.KAYIT.get(`harcama:${ay}`)) || 0) / 1e6,
    uretim: Number((await env.KAYIT.get(`uretim-harcama:${ay}`)) || 0),
  };
  if (kayit.id !== id) await sayfaHazirla(env, id, "Harcama", 2);
  const satirlar = Object.keys(aylar).sort().reverse().map((a) => {
    const x = aylar[a];
    return [ayGoster(a), Math.round(x.claude * 100) / 100, Math.round(x.uretim * 100) / 100, Math.round((x.claude + x.uretim) * 100) / 100];
  });
  await sayfayaYaz(env, id, "Harcama", [
    [`VOLONTE harcama — son güncelleme ${zamanYaz(simdi)} · sadece sahibi görür`, "", "", ""],
    ["Ay", "Claude ($)", "Üretim fal.ai ($)", "Toplam ($)"],
    ...satirlar,
  ]);
  await stokIste(env, "/ayar-yaz", { k: "tablo:harcama", v: JSON.stringify({ id, zaman: simdi, aylar }) });
  return true;
}

// /tablo — hizmet hesabının e-postası ve tabloların durumu; /tablo stok <link>, /tablo harcama <link> (sadece yönetici)
async function tabloKomutu(m, env) {
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text, disable_web_page_preview: true });
  if (!yoneticiMi(m.from.id, env)) return yaz("Bu ayar sadece Murat ve Merdan'da.");
  const [, tur, link] = (m.text || "").trim().split(/\s+/);
  const sa = hizmetHesabi(env);
  if (tur === "stok" || tur === "harcama") {
    const id = tabloKimligi(link);
    if (!id) return yaz(`Örnek: /tablo ${tur} https://docs.google.com/spreadsheets/d/...`);
    await env.KAYIT.put(`sami:tablo:${tur}`, id);
    return yaz(`✅ ${tur === "stok" ? "Stok" : "Harcama"} tablosu kaydedildi. 5 dakika içinde yazmaya başlarım.${sa ? "" : "\n⚠️ Google anahtarı (GOOGLE_SA) henüz girilmedi."}`);
  }
  const durum = async (t) => {
    if (!(await tabloKimlik(env, t))) return "yok";
    const d = await tabloDurum(env, t);
    return `bağlı ✅\n   son yazma: ${d.sonYazma ? zamanYaz(d.sonYazma) : "henüz yok"}\n   son hata: ${d.sonHata ? `${zamanYaz(d.hataZaman)} — ${googleHataAciklama(d.sonHata)}` : "yok"}`;
  };
  return yaz([
    "📊 Google tabloları",
    sa ? `Hizmet hesabı: ${sa.client_email}\n(Tabloyu bu e-postayla "Düzenleyen" olarak paylaşın.)` : "⚠️ Google anahtarı (GOOGLE_SA) henüz girilmedi.",
    `Stok tablosu: ${await durum("stok")}`,
    `Harcama tablosu: ${await durum("harcama")}`,
    "",
    "Bağlamak için: /tablo stok <link> · /tablo harcama <link>",
  ].join("\n"));
}

// /geri <kod> (Patron): "Sil" ile kaldırılan modeli siteye (Selin) ve kanala (Kemal, arşivdeki kopyalardan) geri koyar.
async function geriKomutu(env, m, tg, simdi) {
  if (!patronMu(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  const kod = String((m.text || "").trim().split(/\s+/)[1] || "").replace(/[^0-9A-Za-z~]/g, "");
  if (!kod) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Kullanım: /geri 3608" });
  const yeni = await geriKuyrugu(env, kod, kisiAdi(m.from), simdi);
  return tg(env, "sendMessage", { chat_id: m.chat.id, text: yeni ? `↩️ ${kod} geri konuyor: önce siteye (Selin), sonra arşivdeki paylaşımlar VOLONTE kanalına (Kemal). Bitince haber veririm.` : `${kod} zaten geri konma sırasında.` });
}
