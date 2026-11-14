// VOLONTE SANAL OFİS — AŞAMA 1 (4 Kasım 2026, Patron isteği): canlı izleme, kuş bakışı. Ayrı worker "volonte-ofis".
// SADECE OKUR: ortak kayıt (KV), Stok deposu (StokDO, okuma uçları), açık site verisi. Botlara, siteye, kuyruklara dokunmaz.
// Tek yazdığı: kendi anlık görüntüleri "ofis:an:<zaman>" (zaman geri sarma için, 7 gün).
// Giriş: sadece Patron — Cloudflare secret OFIS_SIFRE; çerez = HMAC(OFIS_SIFRE). Depoya kimlik, numara, fiyat, ciro yazılmaz;
// bu sayfanın verisinde de fiyat/ciro/kişi kimliği yoktur (satış panosu sadece adet, iki mağaza AYRI).
import SAYFA from "./sayfa.html";

const SAAT = 3 * 3600; // İstanbul
const SITE_VERI = "https://raw.githubusercontent.com/kbabahanov-cloud/VOLONTE/main/veri/urunler.json";
const SITE_FOTO = "https://kbabahanov-cloud.github.io/VOLONTE/";
const BOT_LINK = { pelin: "https://t.me/VolontePelinBot", kemal: "https://t.me/VolonteasistantBOT" };
const AYLIK_SINIR_USD = 150;

const gun = (t) => new Date((t + SAAT) * 1000).toISOString().slice(0, 10);
const gunBasi = (g) => Math.floor(Date.parse(`${g}T00:00:00+03:00`) / 1000);
const saat = (t) => new Date((t + SAAT) * 1000).toISOString().slice(11, 16);
const json = (o, ek = {}) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...ek } });
const sayi = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// ---------- Giriş ----------
async function imza(env, metin) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.OFIS_SIFRE || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(metin));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function esit(a, b) { if (!a || !b || a.length !== b.length) return false; let f = 0; for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i); return f === 0; }
const cerez = (istek) => ((istek.headers.get("cookie") || "").match(/(?:^|;\s*)ofis=([a-f0-9]{64})/) || [])[1] || "";
async function girisli(istek, env) { return env.OFIS_SIFRE ? esit(cerez(istek), await imza(env, "ofis-giris-v1")) : false; }

// ---------- Okuma yardımcıları ----------
const oku = async (env, k) => { try { return await env.KAYIT.get(k, "json"); } catch { const t = await env.KAYIT.get(k); return t == null ? null : { metin: t }; } };
const okuMetin = (env, k) => env.KAYIT.get(k);
async function stok(env, yol, g = {}) {
  if (!env.STOK) return null;
  try {
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(g) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
const kuyruk = async (env, ad) => { const r = await stok(env, "/ayar-oku", { k: `kuyruk:${ad}` }); try { const l = JSON.parse((r && r.v) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
const hataKaydi = (h, simdi) => (h && h.zaman && simdi - h.zaman < 2 * 3600 ? { zaman: h.zaman, metin: String(h.hata || h.metin || "").replace(/\d{9,}/g, "•••").slice(0, 160) } : null);
const temiz = (s, n = 200) => String(s || "").replace(/\d{9,}/g, "•••").replace(/\+?\d[\d ]{8,}\d/g, "•••").slice(0, n); // kimlik/numara sızmasın

// ---------- Canlı durum ----------
async function durum(env, simdi) {
  const bugun = gun(simdi), dun = gun(simdi - 86400), ay = bugun.slice(0, 7);
  const [kemalW, selinW, samiW, pelinW, kemalHata, selinHata, samiHata, pelinHata, venomHata, venomAktif, samiAktif,
    rKemal, rSami, rSelin, selinRapor, sayac, sonPaylasim, hfAnahtar, pelinTeshis, pelinHfSonuc,
    hFal, hClaude, hOpenai, hHf, venomHarcama, venomSinir] = await Promise.all([
    oku(env, "durum:webhook"), oku(env, "selin:webhook"), oku(env, "sami:webhook"), oku(env, "pelin:webhook"),
    oku(env, "kemal:sonHata"), oku(env, "selin:hata"), oku(env, "sami:hata"), oku(env, "pelin:hata"), oku(env, "venom:bot:hata"),
    okuMetin(env, "venom:bot:aktif"), okuMetin(env, "sami:aktif"),
    oku(env, `venom:rapor:kemal:${bugun}`), oku(env, `venom:rapor:sami:${bugun}`), oku(env, `venom:rapor:selin:${bugun}`),
    oku(env, "selin:rapor"), okuMetin(env, `sayac:${bugun}`), oku(env, "sonpaylasim"), oku(env, "venom:hfAnahtar"),
    oku(env, "venom:pelinDurum"), oku(env, "venom:pelinHfSonuc"),
    okuMetin(env, `uretim-harcama:${ay}`), okuMetin(env, `pelin-claude:${ay}`), okuMetin(env, `pelin-openai:${ay}`), okuMetin(env, `pelin-hf:${ay}`),
    okuMetin(env, `venom-harcama:${ay}`), okuMetin(env, "venom:bot:sinir"),
  ]);
  const [ozet, satisBugun, olaylarBugun, paylasimlarBugun, kPelinKanal, kPelinSite, kGiden, kPelinIs, kSonuc] = await Promise.all([
    stok(env, "/ozet"), stok(env, "/satislar", { gun: bugun }), stok(env, "/olaylar", { basla: gunBasi(bugun), bitis: simdi + 60 }),
    stok(env, "/paylasimlar", { basla: gunBasi(bugun), bitis: simdi + 60 }),
    kuyruk(env, "pelinKanal"), kuyruk(env, "pelinSite"), kuyruk(env, "giden"), kuyruk(env, "pelinIs"), kuyruk(env, "sonuc"),
  ]);
  // Venom bekleyen işleri (KV liste; sadece sayı + başlık)
  let venomIsler = [];
  try { const l = await env.KAYIT.list({ prefix: "venom:bot:is:", limit: 50 }); for (const k of l.keys) { const x = await oku(env, k.name); if (x && ["bekliyor", "emin", "yapiliyor"].includes(x.durum)) venomIsler.push({ id: x.id, baslik: temiz(x.baslik || x.tur || "iş"), durum: x.durum, zaman: x.zaman }); } } catch { /* yok */ }

  // Pelin işleri: CANLI ayna (Pelin her 2 dk, değişince yazar: "venom:pelinDurum")
  const ayna = pelinTeshis && Array.isArray(pelinTeshis.isler) ? pelinTeshis : null;
  const pelinIsler = ayna ? ayna.isler.map((x) => ({ ...x, sorunlar: (x.sorunlar || []).map(temiz) })) : [];
  const pelinKaynakZaman = ayna ? ayna.zaman : null;
  pelinIsler.sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
  const ASAMA = { foto_onay: 30, set_gonder: 40, set_bekle: 50, grup_bekle: 30, kart: 5, senaryo_yaz: 8, senaryo_onay: 10, foto_gonder: 20, foto_bekle: 35, sahne_gonder: 45, sahne_bekle: 55, video_gonder: 65, video_bekle: 80, kare_bekle: 90, muzik_gonder: 92, muzik_bekle: 95, onay: 100, uyari: 100, onaylandi: 100, iptal: 0, hata: 0, deneme_begenildi: 100 };
  const ASAMA_AD = { foto_onay: "ön fotoğraf onayınızda", set_gonder: "fotoğraf seti üretiliyor", set_bekle: "fotoğraf seti bekleniyor", grup_bekle: "liderin fotoğrafını bekliyor", kart: "maliyet onayı bekliyor", senaryo_yaz: "Nora senaryo yazıyor", senaryo_onay: "senaryo onayı bekliyor", foto_gonder: "katalog fotoğrafı üretiliyor", foto_bekle: "fotoğraf bekleniyor", sahne_gonder: "video karesi üretiliyor", sahne_bekle: "video karesi bekleniyor", video_gonder: "video üretiliyor", video_bekle: "video bekleniyor", kare_bekle: "kareler kontrol ediliyor", muzik_gonder: "müzik ekleniyor", muzik_bekle: "müzik bekleniyor", onay: "önizleme Patron'da", uyari: "kontrolden geçmedi — Patron'da", onaylandi: "onaylandı, teslimde", iptal: "iptal", hata: "hata", deneme_begenildi: "deneme beğenildi" };
  for (const x of pelinIsler) { x.yuzde = ASAMA[x.durum] ?? 0; x.asama = ASAMA_AD[x.durum] || x.durum; }
  const pelinCalisan = pelinIsler.filter((x) => ["foto_gonder", "foto_bekle", "sahne_gonder", "sahne_bekle", "set_gonder", "set_bekle", "video_gonder", "video_bekle", "kare_bekle", "muzik_gonder", "muzik_bekle"].includes(x.durum));
  // Patron masası: SADECE gerçekten bekleyenler — son 24 saat, deneme olmayan, geçersiz kart değil (açık kartlar aynadan)
  const pelinOnay = pelinIsler.filter((x) => ["senaryo_onay", "foto_onay", "onay", "uyari"].includes(x.durum) && !x.deneme && simdi - (x.zaman || 0) < 86400);
  const pelinKartlar = ayna ? (ayna.acikKartlar || []) : [];
  const noraCalisan = pelinIsler.filter((x) => x.durum === "senaryo_yaz");
  const noraOnay = pelinIsler.filter((x) => x.durum === "senaryo_onay");

  // Onay bekleyenler (Patron masası)
  const onaylar = [
    ...pelinKartlar.map((k) => ({ kim: "pelin", baslik: temiz(k.baslik), zaman: k.zaman, link: BOT_LINK.pelin, ayrinti: "maliyet/araç kartı — Telegram'da seçip onaylayın" })),
    ...pelinOnay.map((x) => ({ kim: x.durum === "senaryo_onay" ? "nora" : "pelin", baslik: `${x.kod}${x.marka ? ` (${x.marka === "BLACKROSE" ? "BLACK ROSE" : x.marka})` : ""}: ${x.asama}`, zaman: x.zaman, link: BOT_LINK.pelin, ayrinti: x.sorunlar.join("; ") || null })),
    ...venomIsler.filter((x) => x.durum !== "yapiliyor").map((x) => ({ kim: "venom", baslik: x.baslik, zaman: x.zaman, link: null, ayrinti: null })),
  ].sort((a, b) => (b.zaman || 0) - (a.zaman || 0));

  // Taşımalar (kuyruklarda bekleyen dosyalar)
  const tasima = [
    ...kPelinKanal.map((x) => ({ dan: "pelin", a: "kemal", ne: `${x.kod} video → kanal` })),
    ...kPelinSite.map((x) => ({ dan: "kemal", a: "selin", ne: `${x.kod} video → site` })),
    ...kGiden.map((x) => ({ dan: "venom", a: "sami", ne: "mesaj" })),
    ...kPelinIs.map((x) => ({ dan: "venom", a: "pelin", ne: "üretim isteği" })),
    ...kSonuc.map(() => ({ dan: "sami", a: "venom", ne: "sonuç" })),
  ];

  // Bot durumları: yeşil = son 20 dk kalp atışı/iş var; sarı = Patron onayı bekliyor; kırmızı = son 2 saatte hata; gri = sessiz
  const kalp = (w, alan = "zaman") => (w && w[alan] ? simdi - w[alan] < 20 * 60 : false);
  const bot = (ad, { canli, onay, hata, balon, son }) => ({ ad, durum: hata ? "kirmizi" : onay ? "sari" : canli ? "yesil" : "gri", balon: temiz(balon), son: son || null, hata: hata || null, onay: onay || 0 });
  // 13 Kasım (Patron — TEK SAYIM): aynı modelin aynı anda çıkan mesajları (albüm + kod yazısı / video) TEK paylaşımdır.
  // Venom'un raporu (venom-veri.js gunVerisi) ile aynı kural: aynı kod, 30 dakika içinde → tek satır.
  const kemalPaylasim = [];
  for (const p of [...(paylasimlarBugun || [])].sort((a, b) => a.zaman - b.zaman)) { if (!kemalPaylasim.some((y) => y.kod === p.kod && Math.abs(p.zaman - y.zaman) <= 1800)) kemalPaylasim.push({ kod: p.kod, zaman: p.zaman }); } // fiyat alınmaz
  // Onaylayanlar: Kemal'in günlük turu (KV "tur": öğe başına onaylayan kişi; Merdan, Hemra, Patron…) + Selin'in site onayları
  const tur = await oku(env, "tur").catch(() => null);
  const onaylayan = {};
  if (tur && tur.ogeler && (!tur.gun || tur.gun === bugun)) for (const o of Object.values(tur.ogeler)) if (o && o.kim) { const ad = temiz(String(o.kim).replace(/^(\S+)\s+\1$/, "$1")); onaylayan[ad] = (onaylayan[ad] || 0) + 1; }
  const selinModeller = await oku(env, "selin:modeller").catch(() => null);
  const siteOnay = {};
  for (const m of Object.values(selinModeller || {})) if (m && m.onaylayan && m.zaman && gun(m.zaman) === bugun) siteOnay[temiz(m.onaylayan)] = (siteOnay[temiz(m.onaylayan)] || 0) + 1;
  const sonPaylasimlar = Object.entries(sonPaylasim || {}).filter(([k]) => /^\d{3,6}$/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([kod, z]) => ({ kod, zaman: z, foto: `${SITE_FOTO}galeri/${kod}/1.jpg` }));
  const botlar = {
    kemal: bot("Kemal", { canli: kalp(kemalW) || kalp(kemalW, "yzZaman"), onay: sayi(kemalW && kemalW.bekleyen), hata: hataKaydi(kemalHata, simdi) || (kemalW && kemalW.sonHataZamani && simdi - kemalW.sonHataZamani < 7200 ? { zaman: kemalW.sonHataZamani, metin: temiz(kemalW.sonHata) } : null),
      balon: kPelinKanal.length ? `${kPelinKanal[0].kod} videosunu kanala alıyorum` : kemalPaylasim.length ? `Bugün kanalda ${kemalPaylasim.length} paylaşım` : rKemal ? rKemal.ozet : "Kanalı izliyorum", son: kemalW && kemalW.zaman }),
    selin: bot("Selin", { canli: kalp(selinW) || Boolean(selinRapor && simdi - (selinRapor.son || 0) < 1200), onay: 0, hata: hataKaydi(selinHata, simdi),
      balon: kPelinSite.length ? `${kPelinSite[0].kod} siteye ekleniyor` : rSelin ? rSelin.ozet : "Siteyi düzenliyorum", son: Math.max(sayi(selinW && selinW.zaman), sayi(selinRapor && selinRapor.son)) || null }),
    sami: bot("Sami", { canli: kalp(samiW) || Boolean(samiAktif), onay: 0, hata: hataKaydi(samiHata, simdi),
      balon: kGiden.length ? "Venom'dan gelen mesajı gönderiyorum" : rSami ? rSami.ozet : "Stoku sayıyorum", son: samiW && samiW.zaman }),
    pelin: bot("Pelin", { canli: pelinCalisan.length > 0 || kalp(pelinW) || Boolean(ayna && simdi - ayna.zaman < 1800), onay: pelinOnay.length + pelinKartlar.length, hata: (ayna && ayna.hata && simdi - ayna.hata.zaman < 7200 ? { zaman: ayna.hata.zaman, metin: temiz(`${ayna.hata.metin} (${ayna.hata.yol})`) } : null) || hataKaydi(pelinHata, simdi),
      balon: pelinCalisan.length ? `${pelinCalisan[0].kod}: ${pelinCalisan[0].asama}` : pelinOnay.length ? `${pelinOnay[0].kod}: ${pelinOnay[0].asama}` : "Stüdyo hazır", son: pelinIsler[0] ? pelinIsler[0].zaman : null }),
    nora: bot("Nora", { canli: noraCalisan.length > 0, onay: noraOnay.length, hata: null,
      balon: noraCalisan.length ? `${noraCalisan[0].kod} için senaryo yazıyorum` : noraOnay.length ? `${noraOnay[0].kod} senaryosu onayınızı bekliyor` : "Yeni sahne fikirleri düşünüyorum", son: null }),
    venom: bot("Venom", { canli: Boolean(venomAktif), onay: venomIsler.filter((x) => x.durum !== "yapiliyor").length, hata: hataKaydi(venomHata, simdi),
      balon: venomAktif ? "Ekibi yönetiyorum" : "Müdür odası hazırlanıyor (yakında)", son: venomAktif ? sayi(venomAktif) : null }),
  };

  // Her bot için son 5 iş (ayrıntı penceresi)
  const son5 = {
    pelin: pelinIsler.slice(0, 5).map((x) => ({ zaman: x.zaman, metin: `${x.kod}${x.sablon ? ` · ${x.sablon}` : ""}${x.aracAd ? ` · ${x.aracAd}` : ""} → ${x.asama}${x.maliyet ? ` (${Math.round(x.maliyet * 100) / 100} $)` : ""}` })),
    nora: pelinIsler.filter((x) => /senaryo/.test(x.durum)).slice(0, 5).map((x) => ({ zaman: x.zaman, metin: `${x.kod} → ${x.asama}` })),
    kemal: [...kemalPaylasim].sort((a, b) => b.zaman - a.zaman).slice(0, 5).map((p) => ({ zaman: p.zaman, metin: `${p.kod} kanalda paylaşıldı` })),
    sami: [...(olaylarBugun || [])].sort((a, b) => b.zaman - a.zaman).slice(0, 5).map((o) => ({ zaman: o.zaman, metin: o.tur === "geldi" ? `${o.kod} stoğa geldi` : o.tur === "bitti" ? `${o.kod} bitti` : `${o.kod} ${o.tur}` })),
    selin: Object.entries(selinModeller || {}).filter(([, m]) => m && m.durum === "sitede" && m.zaman).sort((a, b) => b[1].zaman - a[1].zaman).slice(0, 5).map(([k, m]) => ({ zaman: m.zaman, metin: `${k} siteye eklendi${m.onaylayan ? ` (onay: ${temiz(m.onaylayan)})` : ""}` })),
    venom: venomIsler.slice(0, 5).map((x) => ({ zaman: x.zaman, metin: `${x.baslik} → ${x.durum}` })),
  };
  // Olaylar (bugün): stok olayları, paylaşımlar, hatalar, Pelin iş geçmişi (sadece zaman + kısa metin)
  const olaylar = [
    ...(olaylarBugun || []).map((o) => ({ zaman: o.zaman, kim: "sami", metin: o.tur === "geldi" ? `${o.kod} stoğa geldi` : o.tur === "bitti" ? `${o.kod} bitti` : `${o.kod} ${o.tur}` })),
    ...kemalPaylasim.map((p) => ({ zaman: p.zaman, kim: "kemal", metin: `${p.kod} kanalda paylaşıldı` })),
    ...pelinIsler.filter((x) => x.zaman >= gunBasi(bugun)).map((x) => ({ zaman: (x.son && x.son.t) || x.zaman, kim: "pelin", metin: `${x.kod} → ${x.asama}${x.maliyet ? ` · ${Math.round(x.maliyet * 100) / 100} $` : ""}` })),
    ...Object.entries({ kemal: kemalHata, selin: selinHata, sami: samiHata, pelin: pelinHata, venom: venomHata }).filter(([, h]) => h && h.zaman >= gunBasi(bugun)).map(([kim, h]) => ({ zaman: h.zaman, kim, metin: `⚠️ ${temiz(h.hata || h.metin)}`, tur: "hata" })),
  ].sort((a, b) => b.zaman - a.zaman).slice(0, 60);

  // Satış panosu: iki mağaza AYRI, sadece adet (fiyat/ciro yok). Mağaza adı StokDO kaydından.
  // 10 Kasım (Patron): satış sayısı Sami ile AYNI kaynaktan ve yöntemle (StokDO /satis-sayim): toplam BÜTÜN modellerden, liste ilk 8 (ekranda 5)
  const satis = { volonte: [], blackrose: [], toplam: { volonte: null, blackrose: null }, model: { volonte: 0, blackrose: 0 }, indirimli: { volonte: 0, blackrose: 0 } };
  for (const m of ["VOLONTE", "BLACKROSE"]) {
    const a = m === "VOLONTE" ? "volonte" : "blackrose";
    const x = await stok(env, "/satis-sayim", { gun: bugun, magaza: m });
    if (x && Array.isArray(x.liste)) { satis[a] = x.liste.slice(0, 8); satis.toplam[a] = x.toplam; satis.model[a] = x.model; satis.indirimli[a] = x.indirimliAdet; }
  }
  if (satis.toplam.volonte != null || satis.toplam.blackrose != null) await env.KAYIT.put(`ofis:satisGosterilen:${bugun}`, JSON.stringify({ zaman: simdi, VOLONTE: satis.toplam.volonte, BLACKROSE: satis.toplam.blackrose }), { expirationTtl: 3 * 86400 }).catch(() => null);

  // Site (Selin ekranı): son eklenen modeller
  let site = { toplam: null, bugun: 0, son: [] };
  try {
    const r = await fetch(SITE_VERI, { cf: { cacheTtl: 300 } });
    const l = await r.json();
    const g = l.filter((u) => !u.gizli);
    site = { toplam: g.length, bugun: g.filter((u) => u.eklenme === bugun).length, son: g.sort((a, b) => String(b.eklenme).localeCompare(String(a.eklenme))).slice(0, 6).map((u) => ({ kod: u.kod, foto: u.fotolar && u.fotolar[0] ? SITE_FOTO + u.fotolar[0] : null, video: Boolean(u.videolar && u.videolar.length) })) };
  } catch { /* site okunamadı */ }

  // 13 Kasım (Patron, TEK KİTAP — kural 37): kitabın sürümü ve her botun okuduğu sürüm
  const KITAP_BOTLARI = ["venom", "sami", "kemal", "selin", "pelin", "nora"];
  const [kitapSurum, ...kitapOkudu] = await Promise.all([oku(env, "kitap:surum"), ...KITAP_BOTLARI.map((b) => oku(env, `kitap:okudu:${b}`))]);
  const kitap = { surum: kitapSurum ? kitapSurum.surum : null, kural: kitapSurum ? kitapSurum.kural : null, botlar: Object.fromEntries(KITAP_BOTLARI.map((b, i) => [b, kitapOkudu[i] ? { surum: kitapOkudu[i].surum, zaman: kitapOkudu[i].zaman } : null])) };
  const harcama = { fal: sayi(hFal), claude: sayi(hClaude), openai: sayi(hOpenai), hf: sayi(hHf) };
  harcama.toplam = Math.round((harcama.fal + harcama.claude + harcama.openai + harcama.hf) * 100) / 100;
  // 13 Kasım (Patron): PARA SINIRLARI tek tablo — sınırlar kitaptan (kural 74), harcama her botun aylık sayacından (mikro-dolar)
  const kemalSayimKaydi = await oku(env, "kemal:sayim").catch(() => null); // 14 Kasım: öneri kartı sayısı — Venom raporu ve iş bekçisiyle AYNI kaynak (Kemal'in tur kaydı)
  const [kitapMetni, donguKaydi, ...botAy] = await Promise.all([okuMetin(env, "kitap:metin"), oku(env, "kemal:dongu"), ...["venom", "kemal", "selin", "sami", "pelin"].map((b) => okuMetin(env, `harcama-ay:${b}:${ay}`))]);
  const paraBolumu = (String(kitapMetni || "").split(/^## PARA SINIRLARI\s*$/m)[1] || "").split(/^## /m)[0];
  const sinirOf = (ad, vars) => { const m = new RegExp(`${ad}\\s+([^·;]+)`).exec(paraBolumu); const a = m && /(\d+(?:[.,]\d+)?)\s*\$\s*\/\s*ay/.exec(m[1]); return a ? Number(a[1].replace(",", ".")) : vars; };
  const sinirlar = { venom: sinirOf("Venom", 50), kemal: sinirOf("Kemal", 20), selin: sinirOf("Selin", 10), sami: sinirOf("Sami", 5), pelin: sinirOf("Pelin", 100) };
  const para = ["venom", "kemal", "selin", "sami", "pelin"].map((b, i) => ({ bot: b, harcanan: Math.round((Number(botAy[i]) || 0) / 1e4) / 100, sinir: sinirlar[b] }));
  // 13 Kasım (Patron): Higgsfield bakiyesi gerçek hesaptan okunamıyor → sabit 20 $ hesabı ve tahmini bakiye KALDIRILDI (sadece bu ayki harcama görünür)
  const hf = { bitis: hfAnahtar && hfAnahtar.bitis ? hfAnahtar.bitis : null, bagli: Boolean(pelinHfSonuc && pelinHfSonuc.anahtar && pelinHfSonuc.anahtar.var) };
  return {
    zaman: simdi, gun: bugun, saat: saat(simdi), botlar, onaylar, tasima, olaylar, son5, kitap,
    para,
    uyarilar: [...(ayna && ayna.bugun >= (ayna.gunlukSinir || 10) * 0.8 ? [`Pelin bugün ${ayna.bugun} $ harcadı (günlük sınır ${ayna.gunlukSinir} $)`] : [])],
    panolar: {
      satis, stok: ozet ? { stokta: ozet.stokta, biten30: ozet.biten30 == null ? null : ozet.biten30, kopruler: (ozet.kopruler || []).map((k) => ({ magaza: k.magaza, son: k.son, adet: k.adet })), uyari: rSami ? rSami.yapilacak || [] : [] } : null,
      kemal: { sayim: kemalSayimKaydi && kemalSayimKaydi.gun === bugun ? { soruldu: sayi(kemalSayimKaydi.soruldu), bekleyen: sayi(kemalSayimKaydi.bekleyen), sira: sayi(kemalSayimKaydi.sira) } : null, dongu: donguKaydi ? { no: donguKaydi.no, x: donguKaydi.x, y: donguKaydi.y } : null, bugunPaylasim: kemalPaylasim.length, turPaylasim: sayi(sayac), onaylayan, siteOnay, son: sonPaylasimlar, rapor: rKemal || null },
      selin: { site, rapor: rSelin || null },
      pelin: { isler: pelinIsler.slice(0, 12), kaynakZaman: pelinKaynakZaman, harcama, sinir: sinirlar.pelin, hf, bugun: ayna ? ayna.bugun : null, gunlukSinir: ayna ? ayna.gunlukSinir : 10 },
      venom: { isler: venomIsler, harcama: sayi(venomHarcama), sinir: sinirlar.venom },
    },
    raporlar: { kemal: rKemal, sami: rSami, selin: rSelin },
    sohbet: { bugun: sayi(await env.KAYIT.get(`ofis:sohbetUsd:${bugun}`)), sinir: SOHBET_GUNLUK_USD, acik: Object.keys(SOHBET_BOTLARI) },
    acil: { bagli: false, not: "Aşama 1: ACİL DURDUR bağlı değil (sadece izleme). Aşama 2'de botlar bu düğmeyle duraklatılacak." },
  };
}

// 10 Kasım (kanıtsız tamam yok): KV "ofis:kanitIste" varsa Patron'un ekranındaki veri bir kez "ofis:durumKanit"a yazılır (ekran kanıtı için)
async function durumKanit(env, simdi, d) {
  if (!(await env.KAYIT.get("ofis:kanitIste"))) return;
  await env.KAYIT.delete("ofis:kanitIste");
  await env.KAYIT.put("ofis:durumKanit", JSON.stringify({ zaman: simdi, d }), { expirationTtl: 2 * 86400 });
}
// Anlık görüntü (en az 5 dakika arayla; sayfa açıkken her /api/durum çağrısında kontrol edilir — hesapta cron hakkı kalmadı,
// ücretsiz planda 5 cron sınırı): zaman geri sarma için küçük kayıt
async function anlikGoruntu(env, simdi, d = null) {
  const son = sayi(await env.KAYIT.get("ofis:sonAn"));
  if (simdi - son < 300) return;
  await env.KAYIT.put("ofis:sonAn", String(simdi), { expirationTtl: 86400 });
  d = d || await durum(env, simdi);
  const kucuk = { zaman: simdi, botlar: Object.fromEntries(Object.entries(d.botlar).map(([k, b]) => [k, { durum: b.durum, balon: b.balon }])), onay: d.onaylar.length, tasima: d.tasima, satis: { volonte: d.panolar.satis.toplam ? d.panolar.satis.toplam.volonte : d.panolar.satis.volonte.reduce((t, x) => t + x.satilan, 0), blackrose: d.panolar.satis.toplam ? d.panolar.satis.toplam.blackrose : d.panolar.satis.blackrose.reduce((t, x) => t + x.satilan, 0) }, harcama: d.panolar.pelin.harcama.toplam };
  await env.KAYIT.put(`ofis:an:${simdi}`, JSON.stringify(kucuk), { expirationTtl: 7 * 86400 });
}

// Geçmiş: bir günün olayları (StokDO) + anlık görüntüler
async function gecmis(env, g, simdi) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return { hata: "gün?" };
  const b = gunBasi(g), s = Math.min(b + 86400, simdi + 60);
  const [olaylar, paylasimlar, satisV, satisB] = await Promise.all([stok(env, "/olaylar", { basla: b, bitis: s }), stok(env, "/paylasimlar", { basla: b, bitis: s }), stok(env, "/satis-sayim", { gun: g, magaza: "VOLONTE" }), stok(env, "/satis-sayim", { gun: g, magaza: "BLACKROSE" })]);
  const anlar = [];
  try { const l = await env.KAYIT.list({ prefix: "ofis:an:", limit: 1000 }); for (const k of l.keys) { const t = Number(k.name.slice(8)); if (t >= b && t < s) { const x = await oku(env, k.name); if (x) anlar.push(x); } } } catch { /* yok */ }
  const liste = [
    ...(olaylar || []).map((o) => ({ zaman: o.zaman, kim: "sami", metin: o.tur === "geldi" ? `${o.kod} stoğa geldi` : o.tur === "bitti" ? `${o.kod} bitti` : `${o.kod} ${o.tur}`, tur: o.tur })),
    ...(paylasimlar || []).map((p) => ({ zaman: p.zaman, kim: "kemal", metin: `${p.kod} kanalda paylaşıldı`, tur: "paylasim" })),
    ...anlar.map((a) => ({ zaman: a.zaman, kim: "ofis", metin: `anlık görüntü: ${Object.values(a.botlar).filter((x) => x.durum === "yesil").length} çalışıyor, ${a.onay} onay bekliyor`, tur: "an", an: a })),
  ].sort((a, b2) => a.zaman - b2.zaman);
  const raporlar = {}; for (const k of ["kemal", "sami", "selin"]) raporlar[k] = await oku(env, `venom:rapor:${k}:${g}`);
  return { gun: g, olaylar: liste, satis: { volonte: satisV && satisV.toplam != null ? satisV.toplam : null, blackrose: satisB && satisB.toplam != null ? satisB.toplam : null }, raporlar };
}

// ---------- SESLİ/YAZILI KONUŞMA (4 Kasım, Patron onaylı) ----------
// Bot ucuna servis bağlantısıyla (internete açık değil) + gizli OFIS_KOPRU anahtarıyla gidilir; Patron çerezi şart.
// Sadece bilgi ve komut: para harcayan / kanala giden işler botun Telegram onay kartına düşer. Günlük konuşma sınırı 2 $.
const SOHBET_GUNLUK_USD = 2;
const SOHBET_BOTLARI = { kemal: { baglanti: "KEMAL", yol: "https://kemal/ofis-sohbet" } }; // önce Kemal; çalışınca diğerleri
async function sohbetEt(istek, env, simdi) {
  const g = await istek.json().catch(() => ({}));
  const bot = String(g.bot || ""), metin = String(g.metin || "").trim().slice(0, 2000);
  const b = SOHBET_BOTLARI[bot];
  if (!b) return json({ hata: "Bu botla konuşma henüz açılmadı (önce Kemal deneniyor)." });
  if (!metin) return json({ hata: "Boş mesaj." });
  if (!env[b.baglanti] || !env.OFIS_KOPRU) return json({ hata: "Bot bağlantısı kurulmamış." });
  const gk = `ofis:sohbetUsd:${gun(simdi)}`;
  const bugun = sayi(await env.KAYIT.get(gk));
  if (bugun >= SOHBET_GUNLUK_USD) return json({ hata: `Bugünkü konuşma sınırı (${SOHBET_GUNLUK_USD} $) doldu. Telegram'dan devam edebilirsiniz.`, bugun, sinir: SOHBET_GUNLUK_USD });
  const r = await env[b.baglanti].fetch(b.yol, { method: "POST", headers: { "content-type": "application/json", "X-Ofis-Anahtar": String(env.OFIS_KOPRU) }, body: JSON.stringify({ metin }) }).catch((e) => ({ ok: false, status: 0, hata: String(e.message) }));
  if (!r.ok) return json({ hata: `Bot cevap vermedi (${r.status || r.hata}).` });
  const c = await r.json().catch(() => ({}));
  const maliyet = sayi(c.maliyet);
  const yeni = Math.round((bugun + maliyet) * 10000) / 10000;
  await env.KAYIT.put(gk, String(yeni), { expirationTtl: 3 * 86400 });
  return json({ cevap: temiz(String(c.cevap || c.hata || "…"), 3000) || "…", maliyet, bugun: yeni, sinir: SOHBET_GUNLUK_USD, model: c.model || null });
}

const GIRIS = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>VOLONTE Ofis</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#e8dcc0;font-family:Georgia,"Times New Roman",serif}form{width:min(92vw,360px);padding:36px 28px;border:1px solid #6b5a2a;background:linear-gradient(180deg,#0d0b07,#070604);box-shadow:0 0 60px rgba(201,162,74,.15)}h1{font-weight:400;letter-spacing:.35em;text-align:center;margin:0 0 4px;color:#c9a24a;font-size:22px}p{text-align:center;margin:0 0 24px;font-size:12px;letter-spacing:.2em;color:#8a7a52}input{width:100%;box-sizing:border-box;padding:12px;background:#000;border:1px solid #3d3417;color:#f3e9d2;font-size:18px;letter-spacing:.3em;text-align:center}button{width:100%;margin-top:14px;padding:12px;background:#c9a24a;border:0;color:#120e05;font-weight:700;letter-spacing:.2em;cursor:pointer}.h{color:#d66;text-align:center;font-size:13px;margin-top:10px}</style></head>
<body><form method="post" action="/giris"><h1>VOLONTE</h1><p>SANAL OFİS · SADECE PATRON</p><input name="sifre" type="password" autocomplete="current-password" placeholder="şifre" autofocus required><button>GİRİŞ</button>%HATA%</form></body></html>`;

export default {
  async fetch(istek, env, ctx) {
    const url = new URL(istek.url);
    const simdi = Math.floor(Date.now() / 1000);
    const basliklar = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
    if (url.pathname === "/giris" && istek.method === "POST") {
      const f = await istek.formData().catch(() => null);
      const s = String((f && f.get("sifre")) || "");
      const deneme = sayi(await env.KAYIT.get("ofis:deneme"));
      if (deneme >= 8) return new Response(GIRIS.replace("%HATA%", '<div class="h">Çok deneme; 15 dakika sonra.</div>'), { status: 429, headers: basliklar });
      // 4 Kasım (Patron): büyük/küçük harf ve boşluk farkı önemsenmez
      const sade = (x) => String(x || "").replace(/\s+/g, "").toLocaleUpperCase("tr").replace(/İ/g, "I");
      if (!env.OFIS_SIFRE || !esit(sade(s), sade(env.OFIS_SIFRE))) { await env.KAYIT.put("ofis:deneme", String(deneme + 1), { expirationTtl: 900 }); return new Response(GIRIS.replace("%HATA%", '<div class="h">Şifre yanlış.</div>'), { status: 401, headers: basliklar }); }
      const c = await imza(env, "ofis-giris-v1");
      return new Response(null, { status: 303, headers: { location: "/", "set-cookie": `ofis=${c}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax` } });
    }
    if (url.pathname === "/api/sohbet" && istek.method === "POST") {
      if (!(await girisli(istek, env))) return new Response(JSON.stringify({ hata: "giriş gerekli" }), { status: 401, headers: { "content-type": "application/json; charset=utf-8" } });
      const kaynak = istek.headers.get("origin");
      if (kaynak && kaynak !== url.origin) return new Response(JSON.stringify({ hata: "izin yok" }), { status: 403, headers: { "content-type": "application/json; charset=utf-8" } });
      try { return await sohbetEt(istek, env, simdi); } catch (e) { return json({ hata: String(e && e.message).slice(0, 200) }); }
    }
    if (url.pathname === "/cikis") return new Response(null, { status: 303, headers: { location: "/", "set-cookie": "ofis=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
    if (istek.method !== "GET") return new Response("yok", { status: 405 });
    const g = await girisli(istek, env);
    if (url.pathname === "/" || url.pathname === "/index.html") return new Response(g ? SAYFA : GIRIS.replace("%HATA%", env.OFIS_SIFRE ? "" : '<div class="h">OFIS_SIFRE henüz ayarlı değil.</div>'), { headers: basliklar });
    if (!g) return new Response(JSON.stringify({ hata: "giriş gerekli" }), { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/api/durum") { try { const d = await durum(env, simdi); ctx.waitUntil(anlikGoruntu(env, simdi, d).catch(() => {})); ctx.waitUntil(durumKanit(env, simdi, d).catch(() => {})); return json(d); } catch (e) { return json({ hata: String(e && e.message).slice(0, 200) }); } }
    if (url.pathname === "/api/gecmis") { try { return json(await gecmis(env, url.searchParams.get("gun") || gun(simdi - 86400), simdi)); } catch (e) { return json({ hata: String(e && e.message).slice(0, 200) }); } }
    if (url.pathname === "/api/acil") return json({ yapildi: false, not: "Aşama 1: ACİL DURDUR bağlı değil. Botlara dokunulmadı." });
    return new Response("yok", { status: 404 });
  },
  async scheduled(olay, env, ctx) {
    ctx.waitUntil(anlikGoruntu(env, Math.floor(Date.now() / 1000)).catch((e) => env.KAYIT.put("ofis:hata", JSON.stringify({ zaman: Date.now(), hata: String(e && e.message).slice(0, 300) }), { expirationTtl: 86400 })));
  },
};
