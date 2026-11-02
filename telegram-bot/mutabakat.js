// MUTABAKAT — Fuat (Black Rose) ile haftalık stok ve bakiye mutabakatı (31 Ekim; düzen + güvenlik 2 Kasım). Sayım Sami.
//  • Her cuma 17:00 önce PATRON'a önizleme (/mutabakat ile istediği an). Patron onaylamadan Fuat'a HİÇBİR ŞEY gitmez;
//    Önizlemede iki mağazanın bakiyesi ayrı ayrı; tek düğme [✅ Fuat'a gönder].
//  • Mesaj (SON DÜZEN, Patron 2 Kasım): İKİ AYRI MESAJ. 1) "📊 BLACK ROSE – Sami / Fuat Bey," + 📦 BLACK ROSE MAĞAZASI (3 sütun)
//    + 💰 Bakiyeler (Black Rose Vegawin). 2) "📊 VOLONTE – Sami / Fuat Bey," + 📦 VOLONTE MAĞAZASI (sadece Black Rose kodları)
//    + 💰 Bakiyeler (VOLONTE Vegawin'deki Black Rose hesapları) + kapanış. Fark/genel toplam/uyarı yok.
//  • Fuat'a ASLA: VOLONTE'nin kendi modelleri, satış, fiyat, fark, ödemeler (fuatSuzgec gönderimden önce denetler).
//  • Değiştirilemez arşiv (StokDO "arsiv", zincir mühürlü): önizleme, onay, Fuat'a giden mesajın tamamı, Fuat'ın cevabı
//    (tarih/saat), fark açıklaması, ödemeler, haftalık karşılaştırma. PDF kopyası sadece Patron'a ve arşive.
//  • Fuat "Mutabıkım" → kayıt (tarih, saat, toplam bakiye, tam mesaj) + Patron'a "Fuat X $ bakiyeyi onayladı".
//  • (Perşembe karşılaştırması 2 Kasım'da kaldırıldı: iki mağaza ayrı, defterler karşılaştırılmaz.) Her gece 23:00 arşiv Patron'un
//    Google tablosuna ("Mutabakat Arşivi" sekmesi; harcama tablosu, paylaşılmaz).
//  • /odeme 5000$ [hesap] [not] + dekont fotoğrafı (sadece Patron) → kayıt; mutabakatta "son ödemeler" sadece Patron'da.
import { stokIste } from "./stokbot.js";
import { murat, muratMi } from "./fabrika.js";
import { pdfOlustur } from "./pdf.js";
import { hizmetHesabi, tabloKimligi, sekmeHazirla, sayfayaYaz } from "./google.js";
import { odemeler as vegawinOdemeleri, tutarOf, odemeTakip, borcLimitKontrol, haftalikOzet } from "./cari-takip.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const haftaGunu = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay(); // 0 pazar, 5 cuma
const tarihYaz = (g) => g.split("-").reverse().join(".");
const ayarOku = async (env, k, bos) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); };
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });
export const fuat = (env) => String(env.FUAT_ID || "");
// Hesaplar (Patron eşleştirmesi 31 Ekim): Black Rose Vegawin "BLACK ROSE 00/15/20/25" ↔ VOLONTE Vegawin "BLACK ROSE 000 /
// BLACKROSE 15 / BLACKROSE 20 / BLACK ROSE 25" — köprü sondaki sayıyla eşler (000 → 00).
const HESAPLAR = ["15", "20", "25", "00"];
const para = (x) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Vegawin işareti: borç − alacak; artı = (B) borçlu, eksi = (A) alacaklı
// Black Rose cari hesapları dolar tutuluyor (kullanıcı, 2 Kasım) → her bakiyenin yanında $
const dolar = (x) => `${para(x)} $`;
const tutar = (x) => (x == null ? "—" : `${dolar(Math.abs(x))}${Math.abs(x) < 0.005 ? "" : x > 0 ? " (B)" : " (A)"}`);
// Bakiye kaynağı (ayar "cari:yontem"): { tur: "kart" } = cari kartındaki BAKIYE (varsayılan) ya da
// { tur: "donem", tablolar: ["D0005TBLCARIGENELHAREKET", …] } = seçilen dönem tablolarındaki borç − alacak toplamı
// { tur: "sondonem", tablo: "CARIGENELHAREKET" } (2 Kasım) = her hesapta, o türden hareketi olan EN SON dönem tablosunun
// borç − alacak toplamı. Yeni dönem önceki dönemin bakiyesini devir kaydıyla taşıdığı için dönemler toplanmaz (çift sayılır).
export function sonDonem(h, tablo) {
  const l = Object.entries((h && h.donemler) || {}).map(([d, x]) => ({ d, x, m: /^D(\d{4})TBL(.+)$/.exec(d) })).filter((o) => o.m && o.m[2] === tablo);
  if (!l.length) return null;
  const dolu = l.filter((o) => o.x && o.x.n > 0).sort((a, b) => b.m[1].localeCompare(a.m[1]));
  return dolu.length ? dolu[0] : { d: null, x: { borc: 0, alacak: 0 } };
}
export function bakiyeDegeri(h, yontem = { tur: "kart" }) {
  if (!h) return null;
  if (yontem.tur === "sondonem") {
    const s = sonDonem(h, yontem.tablo || "CARIGENELHAREKET");
    return s ? (Number(s.x.borc) || 0) - (Number(s.x.alacak) || 0) : null;
  }
  if (yontem.tur === "donem") {
    const l = (yontem.tablolar || []).map((t) => h.donemler && h.donemler[t]).filter(Boolean);
    return l.length ? l.reduce((s, x) => s + (Number(x.borc) || 0) - (Number(x.alacak) || 0), 0) : null;
  }
  return h.kart == null ? null : Number(h.kart);
}
// 2 Kasım (Patron düzeltmesi): VOLONTE ve BLACK ROSE iki AYRI mağaza; VOLONTE Vegawin'deki "BLACK ROSE 000/15/20/25" hesapları
// Black Rose Vegawin'deki hesapların karşılığı DEĞİL (sadece isim benzerliği). İki defter KARŞILAŞTIRILMAZ, fark hesaplanmaz;
// bakiyeler ayrı ayrı gösterilir. Fuat'a SADECE Black Rose bakiyesi gider.
export function bakiyeBolumu(br, vl, yontem = { tur: "kart" }) {
  const bul = (c, a) => c && (c.hesaplar || []).find((h) => h.anahtar === a);
  const hesaplar = (c) => HESAPLAR.map((a) => ({ a, ad: (bul(c, a) || {}).ad || null, v: bakiyeDegeri(bul(c, a), yontem) }));
  const top = (l) => (l.some((x) => x.v != null) ? l.reduce((s, x) => s + (x.v || 0), 0) : null);
  const kaynak = yontem.tur === "kart" ? "cari kart bakiyesi" : yontem.tur === "sondonem" ? "son dönem hareketleri, devir dahil" : `dönem toplamı (${(yontem.tablolar || []).join(", ")})`;
  const bl = hesaplar(br), vll = hesaplar(vl);
  const tb = top(bl), tv = top(vll);
  // Hizalı satırlar (eş aralıklı blok): ad · tutar (sağa hizalı) · (B)/(A)
  const parca = (v) => (v == null ? ["—", ""] : [dolar(Math.abs(v)), Math.abs(v) < 0.005 ? "" : v > 0 ? " (B)" : " (A)"]);
  const hizala = (satirlar) => {
    const sol = Math.max(...satirlar.map(([a]) => a.length)), sag = Math.max(...satirlar.map(([, b]) => b.length));
    return satirlar.map(([a, b, c]) => `${a.padEnd(sol)}  ${b.padStart(sag)}${c}`);
  };
  const brSatir = hizala([...bl.map((x) => [`Black Rose ${x.a}`, ...parca(x.v)]), ["TOPLAM", ...parca(tb)]]);
  const vlSatir = hizala([...vll.filter((x) => x.ad || x.v != null).map((x) => [x.ad || `BLACK ROSE ${x.a}`, ...parca(x.v)]), ["TOPLAM", ...parca(tv)]]);
  const okuma = (c) => (!c ? "köprü bakiyeyi henüz göndermedi" : c.zaman ? `son okuma ${tarihSaat(c.zaman)}` : "okundu");
  const fuat = br ? brSatir : ["Bakiyeler henüz okunamıyor."];
  // Patron: iki ayrı blok (her biri eş aralıklı) — karşılaştırma yok
  const patronBloklar = [
    { ust: "💰 <b>BLACK ROSE bakiyesi</b> (Black Rose Vegawin)", blok: br ? brSatir : null, alt: [br ? `(${okuma(br)})` : "Black Rose köprüsü bakiyeyi henüz göndermedi."] },
    { ust: "💰 <b>VOLONTE bakiyesi</b> (VOLONTE Vegawin)", blok: vl ? vlSatir : null, alt: [vl ? `(${okuma(vl)}; kaynak: ${kaynak}; (B) borçlu, (A) alacaklı)` : "VOLONTE köprüsü bakiyeyi henüz göndermedi."] },
  ];
  const patron = patronBloklar.flatMap((b) => [duzYaziBaslik(b.ust), ...(b.blok || []), ...b.alt]);
  return { fuat, patron, patronBloklar, farkVar: false, karsilastirmaYok: false, brToplam: tb, vlToplam: tv, brToplamYazi: tutar(tb), vlToplamYazi: tutar(tv) };
}
const duzYaziBaslik = (s) => String(s).replace(/<[^>]+>/g, "");

// Güncel iki ayrı defter (Patron için; karşılaştırma yok)
export async function bakiyeOku(env) {
  const [br, vl, yontem] = await Promise.all([ayarOku(env, "cari:BLACKROSE", null), ayarOku(env, "cari:VOLONTE", null), ayarOku(env, "cari:yontem", { tur: "kart" })]);
  return { ...bakiyeBolumu(br, vl, yontem), br, vl };
}

// ---- Biçim yardımcıları ----
export const tarihSaat = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`; };
const kacis = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const duzYazi = (html) => String(html).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const sayi = (n) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
// "3557 · 200 adet" — 3 sütun yan yana (soldan sağa, sonra alt satır), kod ve adet hizalı
export function ucSutun(liste, sutun = 3) {
  if (!liste.length) return ["—"];
  const kodG = Math.max(...liste.map(([k]) => String(k).length)), adetG = Math.max(...liste.map(([, a]) => sayi(a).length));
  const oge = liste.map(([k, a]) => `${String(k).padEnd(kodG)} · ${sayi(a).padStart(adetG)} adet`);
  const cikti = [];
  for (let i = 0; i < oge.length; i += sutun) cikti.push(oge.slice(i, i + sutun).join("   "));
  return cikti;
}
// Bölüm: { ust: başlık (HTML), blok: eş aralıklı satırlar | null, alt: düz satırlar }
const bolumHtml = (b, blok = b.blok) => [b.ust, ...(blok ? [`<pre>${kacis(blok.join("\n"))}</pre>`] : []), ...(b.alt || []).map(kacis)].join("\n");
const bolumDuz = (b) => [duzYazi(b.ust), ...(b.blok || []), ...(b.alt || [])].join("\n");
// Mesajlar: hepsi sığarsa tek mesaj; sığmazsa her bölüm ayrı mesaj; tek bölüm sığmazsa bloğu satır satır bölünür
export function mesajlara(bolumler, sinir = 3800) {
  const parcalar = [];
  for (const b of bolumler) {
    const h = bolumHtml(b);
    if (h.length <= sinir || !b.blok) { parcalar.push(h.slice(0, 4000)); continue; }
    let parca = [], ilk = true;
    const ust = () => (ilk ? b.ust : `${b.ust} (devam)`);
    for (const s of b.blok) {
      if (bolumHtml({ ...b, ust: ust(), alt: [] }, [...parca, s]).length > sinir && parca.length) {
        parcalar.push(bolumHtml({ ...b, ust: ust(), alt: [] }, parca)); parca = []; ilk = false;
      }
      parca.push(s);
    }
    parcalar.push(bolumHtml({ ...b, ust: ust() }, parca));
  }
  // Küçük bölümler aynı mesajda kalır; sığmayan bölüm yeni mesaja geçer
  const cikti = [];
  for (const p of parcalar) {
    if (cikti.length && (cikti[cikti.length - 1] + "\n\n" + p).length <= sinir) cikti[cikti.length - 1] += "\n\n" + p;
    else cikti.push(p);
  }
  return cikti;
}

// Fuat'a giden metinde VOLONTE defteri, fark, ödeme, fiyat, satış ASLA olmaz (son kapı; bozuksa gönderilmez)
const YASAK_FUAT = [/VOLONTE kaydı/i, /\bfark\b/i, /ödeme/i, /dekont/i, /fiyat/i, /satış/i, /maliyet/i, /kâr\b/i, /Patron/i];
export function fuatSuzgec(duz) {
  const bulunan = YASAK_FUAT.filter((r) => r.test(duz));
  return bulunan.length ? bulunan.map(String) : null;
}

const odemeYazi = (o) => `${tarihSaat(o.zaman).slice(0, 10)} · ${dolar(o.tutar)}${o.hesap ? ` · Black Rose ${o.hesap}` : ""}${o.not ? ` · ${o.not}` : ""}${o.foto ? " · 📎 dekont" : ""}`;

// Mutabakat içeriği: Fuat'ın ve Patron'un mesajları (HTML) + düz metin (PDF/arşiv) + özet bilgiler
// SON DÜZEN (Patron kararı 2 Kasım, değişmeyecek): mesaj birebir; iki ayrı bölüm, karşılaştırma/fark/uyarı YOK.
// Fuat'a ve Patron önizlemesine AYNI mesaj gider (Patron'a ayrıca sadece kendisinin gördüğü üst bilgi).
const MT_HESAPLAR = ["00", "15", "20", "25"];
export function bakiyeSatirlari(c, yontem) {
  if (!c) return ["(bakiye henüz okunamadı)"];
  const bul = (a) => (c.hesaplar || []).find((h) => h.anahtar === a);
  const l = MT_HESAPLAR.map((a) => ({ a, v: bul(a) ? bakiyeDegeri(bul(a), yontem) : 0 }));
  const top = l.reduce((s, x) => s + (x.v || 0), 0);
  const yaz = (v) => (v == null ? "—" : dolar(Math.abs(v)));
  // Toplamla ters yöndeki hesaba (B)/(A) işareti eklenir; yoksa satırların toplamı "Toplam"ı tutmuyor gibi görünür
  const ters = (v) => (v != null && Math.abs(v) >= 0.005 && Math.abs(top) >= 0.005 && Math.sign(v) !== Math.sign(top) ? (v > 0 ? " (B)" : " (A)") : "");
  return [...l.map((x) => `Black Rose ${x.a}: ${yaz(x.v)}${ters(x.v)}`), `Toplam: ${yaz(top)}`];
}
// Tek mesaj: başlık + eş aralıklı liste + alt satırlar; sığmazsa liste "(devam)" mesajlarına bölünür, alt satırlar sonda
export function mesajKur(ust, listeBaslik, liste, alt, sinir = 3800) {
  const pre = (l) => `<pre>${kacis(l.join("\n"))}</pre>`;
  const tam = [kacis(ust), kacis(listeBaslik), pre(liste), ...alt.map(kacis)].join("\n");
  if (tam.length <= sinir) return [tam];
  const cikti = [];
  let parca = [], bas = [kacis(ust), kacis(listeBaslik)];
  for (const s of liste) {
    if ([...bas, pre([...parca, s])].join("\n").length > sinir && parca.length) { cikti.push([...bas, pre(parca)].join("\n")); parca = []; bas = [kacis(`${listeBaslik} (devam)`)]; }
    parca.push(s);
  }
  const son = [...bas, pre(parca), ...alt.map(kacis)].join("\n");
  if (son.length <= sinir) cikti.push(son); else { cikti.push([...bas, pre(parca)].join("\n")); cikti.push(alt.map(kacis).join("\n")); }
  return cikti;
}
// SON DÜZEN (Patron, 2 Kasım): İKİ AYRI MESAJ — 1) BLACK ROSE, 2) VOLONTE. Karşılaştırma/fark/genel toplam/uyarı YOK.
// Fuat'a ve Patron önizlemesine AYNI mesajlar gider (Patron'a ayrıca sadece kendisinin gördüğü üst bilgi).
export async function mutabakatMetni(env, gun) {
  const s = await stokIste(env, "/br-stoklar");
  const [b, odemeler, yontem] = await Promise.all([bakiyeOku(env), ayarOku(env, "odeme:liste", []), ayarOku(env, "cari:yontem", { tur: "kart" })]);
  const toplam = (l) => l.reduce((t, [, a]) => t + a, 0);
  const m1 = mesajKur("📊 BLACK ROSE – Sami\nFuat Bey,", `📦 BLACK ROSE MAĞAZASI – ${s.BLACKROSE.length} model · ${sayi(toplam(s.BLACKROSE))} adet`, ucSutun(s.BLACKROSE),
    ["💰 Bakiyeler:", ...bakiyeSatirlari(b.br, yontem)]);
  const m2 = mesajKur("📊 VOLONTE – Sami\nFuat Bey,", `📦 VOLONTE MAĞAZASI – ${s.VOLONTE.length} model · ${sayi(toplam(s.VOLONTE))} adet`, ucSutun(s.VOLONTE),
    ["💰 Bakiyeler:", ...bakiyeSatirlari(b.vl, yontem), "", "Bundan sonra tüm hesaplar sistem üzerinden, şeffaf ve kayıt altında yürüyecek.", "İyi çalışmalar.", "– Sami"]);
  const mesaj = [...m1, ...m2];
  // Patron'a özel üst bilgi (Fuat görmez): okuma saatleri + son ödemeler (Patron'un /odeme kayıtları; Vegawin ödemesi teşhis bekliyor)
  const okuma = (c, ad) => `${ad}: ${c && c.zaman ? `son okuma ${tarihSaat(c.zaman)}` : "köprü bakiyeyi henüz göndermedi"}`;
  const veg = vegawinOdemeleri(b.vl).map((h) => ({ zaman: Date.UTC(+h.tarih.slice(0, 4), +h.tarih.slice(5, 7) - 1, +h.tarih.slice(8, 10), 9) / 1000, tutar: tutarOf(h), hesap: h.hesap, not: "Vegawin" }));
  const sonOdeme = [...veg, ...odemeler.map((o) => ({ ...o, not: o.not ? `elle · ${o.not}` : "elle" }))].sort((x, y) => y.zaman - x.zaman).slice(0, 5);
  const patronBilgi = [okuma(b.br, "Black Rose Vegawin"), okuma(b.vl, "VOLONTE Vegawin"), ...(sonOdeme.length ? ["💵 Son ödemeler (sadece siz):", ...sonOdeme.map(odemeYazi)] : [])];
  return {
    fuat: mesaj, patron: mesaj, patronBilgi,
    duzFuat: mesaj.map(duzYazi).join("\n\n— — —\n\n"), duzPatronBakiye: patronBilgi.join("\n"),
    brToplam: b.brToplam, brToplamYazi: b.brToplamYazi,
  };
}

// ---- Arşiv (değiştirilemez) ----
export const arsiv = (env, tur, mt, icerik, zaman) => stokIste(env, "/arsiv-ekle", { tur, mt, icerik, zaman });
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

async function belgeGonder(env, chat, bayt, ad, aciklama, tur = "application/pdf") {
  const f = new FormData();
  f.append("chat_id", String(chat));
  f.append("caption", String(aciklama).slice(0, 1000));
  f.append("document", new Blob([bayt], { type: tur }), ad);
  const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/sendDocument`, { method: "POST", body: f });
  return r.json().catch(() => null);
}

// PDF: Fuat'a giden mesaj (birebir) + Patron görünümü (iki defter, ödemeler) + geçmiş + arşiv mührü → SADECE Patron'a
async function pdfArsivle(env, r, tur, simdi) {
  const muhur = await stokIste(env, "/arsiv-dogrula").catch(() => null);
  const satirlar = [
    "VOLONTE – Black Rose mutabakatı",
    `Mutabakat: ${tarihYaz(r.gun)} · kayıt ${r.id}`,
    `Belge: ${tur} · ${tarihSaat(simdi)} (İstanbul saati)`,
    "",
    "=== FUAT'A GİDEN MESAJ (birebir) ===",
    ...String(r.duzFuat || "").split("\n"),
    "",
    "=== SADECE PATRON: İKİ DEFTER + SON ÖDEMELER ===",
    ...String(r.duzPatronBakiye || "").split("\n"),
    "",
    "=== GEÇMİŞ ===",
    ...(r.gecmis || []).map(([t, n]) => `${tarihSaat(t)} · ${n}`),
    ...(r.fark ? ["", "Fuat'ın fark açıklaması:", ...String(r.fark).split("\n")] : []),
    "",
    muhur && muhur.tamam ? `Arşiv zinciri sağlam: ${muhur.kayit} kayıt · son mühür ${muhur.son}` : `Arşiv zinciri: ${muhur ? `BOZUK (kayıt ${muhur.bozuk})` : "okunamadı"}`,
  ];
  const pdf = await pdfOlustur(satirlar, { baslik: `Mutabakat ${tarihYaz(r.gun)}` });
  const d = await stokIste(env, "/arsiv-dosya-ekle", { mt: r.id, tur: `pdf:${tur}`, veri: b64(pdf), zaman: simdi });
  await arsiv(env, "pdf", r.id, { tur, sha256: d.muhur, boyut: pdf.length }, simdi);
  const g = await belgeGonder(env, murat(env), pdf, `mutabakat-${r.gun}-${tur}.pdf`, `📄 Mutabakat ${tarihYaz(r.gun)} — ${tur} (arşiv kopyası, sadece sizde)`);
  return Boolean(g && g.ok);
}

// Tek düğme (Patron düzeltmesi 2 Kasım): fark kontrolü yok; Patron basmadan hiçbir şey gitmez
const onizlemeKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Fuat'a gönder", callback_data: `mt:g:${id}` }]] });
const fuatKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Mutabıkım", callback_data: `mt:m:${id}` }, { text: "❌ Uyuşmuyor", callback_data: `mt:u:${id}` }], [{ text: "⏳ Sonra kontrol edeceğim", callback_data: `mt:s:${id}` }]] });
const kayitYaz = async (env, r) => {
  await ayarYaz(env, `mt:${r.id}`, r);
  const l = await ayarOku(env, "mt:liste", []);
  if (!l.includes(r.id)) await ayarYaz(env, "mt:liste", [...l, r.id]);
};
// Mesaj listesi gönderilir (HTML); düğmeler son mesajda. Eski kayıtlar (düz metin) düz gider.
async function gonder(env, tg, chat, mesajlar, klavye, html = true) {
  const l = Array.isArray(mesajlar) ? mesajlar : [String(mesajlar)];
  let son = null;
  for (let i = 0; i < l.length; i++) {
    son = await tg(env, "sendMessage", { chat_id: chat, text: l[i], ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: true, ...(i === l.length - 1 && klavye ? { reply_markup: klavye } : {}) });
  }
  return son && son.ok ? son.result.message_id : null;
}
const fuatMesajlari = (r) => (r.fuatMesajlar ? [r.fuatMesajlar, true] : [[r.metin], false]);

const onizlemeUst = (m, ek = "") => [`👁 <b>ÖNİZLEME${ek ? ` (${ek})` : ""}</b> — sadece siz görüyorsunuz. Siz onaylamadan Fuat'a hiçbir şey gitmez.`,
  "Aşağıdaki iki mesaj (1: BLACK ROSE, 2: VOLONTE) Fuat'a BİREBİR böyle gidecek; tek onayla ikisi birlikte gider.", ...(m.patronBilgi || []).map(kacis)].join("\n");

const icerikAl = (m) => ({ fuatMesajlar: m.fuat, patronMesajlar: m.patron, duzFuat: m.duzFuat, duzPatronBakiye: m.duzPatronBakiye, brToplam: m.brToplam, brToplamYazi: m.brToplamYazi });

export async function onizlemeGonder(env, tg, simdi, kaynak = "cuma") {
  const gun = gunAnahtari(simdi);
  const id = `${gun}-${simdi.toString(36)}`;
  const m = await mutabakatMetni(env, gun);
  // Yeni önizleme eskileri geçersiz kılar: Patron sadece en son gördüğünü onaylayabilir
  for (const eskiId of (await ayarOku(env, "mt:liste", [])).slice(-10)) {
    const e = await ayarOku(env, `mt:${eskiId}`, null);
    if (e && e.durum === "onizleme") { e.durum = "eskidi"; e.gecmis.push([simdi, "yeni önizleme geldi, geçersiz"]); await kayitYaz(env, e); }
  }
  const r = { id, gun, kaynak, olusturma: simdi, ...icerikAl(m), durum: "onizleme", gecmis: [[simdi, `önizleme (${kaynak})`]] };
  await gonder(env, tg, murat(env), [onizlemeUst(m)], null);
  r.onizlemeMesaj = await gonder(env, tg, murat(env), m.patron, onizlemeKlavye(id));
  await kayitYaz(env, r);
  await arsiv(env, "onizleme", id, { kaynak, fuat: m.duzFuat, patron: m.duzPatronBakiye }, simdi);
  return r;
}

// /mutabakat — sadece Patron (ve Murat'ın diğer hesabı)
export async function mutabakatKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  if (!fuat(env)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Fuat'ın kimliği kayıtlı değil (venom:kimlikler FUAT_ID)." });
  await onizlemeGonder(env, tg, simdi, "elle");
}

async function fuataGonder(env, tg, r, kim, simdi) {
  const [mesajlar, html] = fuatMesajlari(r);
  const yasak = fuatSuzgec(html ? mesajlar.map(duzYazi).join("\n") : mesajlar.join("\n"));
  if (yasak) { // son kapı: Fuat'a VOLONTE/ödeme/fark bilgisi gidemez
    await arsiv(env, "engel", r.id, { neden: yasak }, simdi);
    await tg(env, "sendMessage", { chat_id: murat(env), text: `⛔ Mutabakat Fuat'a GÖNDERİLMEDİ: mesajda Fuat'ın görmemesi gereken bilgi var (${yasak.join(", ")}). Claude'a bildirin.` });
    return false;
  }
  r.fuatMesaj = await gonder(env, tg, fuat(env), mesajlar, fuatKlavye(r.id), html);
  if (!r.fuatMesaj) return null;
  Object.assign(r, { durum: "gonderildi", gonderim: simdi, onaylayan: String(kim) }); r.gecmis.push([simdi, "Patron onayladı → Fuat'a gönderildi"]);
  await kayitYaz(env, r);
  await arsiv(env, "gonderim", r.id, { onaylayan: String(kim), zaman: tarihSaat(simdi), fuatMesaji: r.duzFuat || mesajlar.join("\n") }, simdi);
  try { await pdfArsivle(env, r, "Fuat'a gönderilen", simdi); } catch (e) { await arsiv(env, "pdf-hata", r.id, String(e && e.message), simdi); }
  return true;
}

export async function mutabakatDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data).split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const r = await ayarOku(env, `mt:${id}`, null);
  if (!r) return cevapla("Bu mutabakat bulunamadı.");
  const kim = String(cq.from.id);
  const dugmeYaz = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "mt:-" }]] } });
  if ("gGyxfv".includes(islem)) { // Patron düğmeleri
    if (!muratMi(env, kim)) return cevapla("Bu düğme Patron'da.");
    if (islem === "f") { // Fuat'a gidecek mesajın birebir aynısı (sadece Patron'a)
      const [mesajlar, html] = fuatMesajlari(r);
      await cevapla("Fuat'ın göreceği mesaj");
      await gonder(env, tg, cq.message.chat.id, ["👁 <b>Fuat'a gidecek mesaj (birebir):</b>"], null);
      return gonder(env, tg, cq.message.chat.id, mesajlar, null, html);
    }
    if (r.durum !== "onizleme") return cevapla("Bu önizleme artık geçerli değil.");
    if (islem === "v") { r.gecmis.push([simdi, "Patron: fark uyarısında vazgeçti"]); await kayitYaz(env, r); await cevapla("Gönderilmedi"); return dugmeYaz("Gönderilmedi"); }
    if (islem === "x") {
      Object.assign(r, { durum: "iptal" }); r.gecmis.push([simdi, "iptal (Patron)"]);
      await kayitYaz(env, r); await arsiv(env, "iptal", id, { kim }, simdi); await cevapla("İptal edildi");
      return dugmeYaz("❌ İptal edildi");
    }
    if (islem === "y") {
      const m = await mutabakatMetni(env, r.gun);
      Object.assign(r, icerikAl(m)); r.gecmis.push([simdi, "yenilendi"]);
      await kayitYaz(env, r); await arsiv(env, "yenile", id, { fuat: m.duzFuat, patron: m.duzPatronBakiye }, simdi);
      await cevapla("Yenilendi");
      await gonder(env, tg, cq.message.chat.id, [onizlemeUst(m, "yenilendi")], null);
      return gonder(env, tg, cq.message.chat.id, m.patron, onizlemeKlavye(id));
    }
    // g (ve eski önizlemelerdeki G): Fuat'a gönder
    const sonuc = await fuataGonder(env, tg, r, kim, simdi);
    if (sonuc === null) return cevapla("Fuat'a gönderilemedi (Sami'ye /start yazmamış olabilir).");
    if (sonuc === false) return cevapla("Gönderilmedi (güvenlik).");
    await cevapla("Fuat'a gönderildi");
    return dugmeYaz("✅ Fuat'a gönderildi");
  }
  // Fuat'ın düğmeleri
  if (kim !== fuat(env)) return cevapla("Bu düğme Fuat'ta.");
  if (!["gonderildi", "sonra", "fark"].includes(r.durum)) return cevapla("Bu mutabakat kapandı.");
  const kapat = () => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (islem === "m") {
    Object.assign(r, { durum: "mutabik", cevapZaman: simdi }); r.gecmis.push([simdi, `Fuat: mutabıkım (toplam bakiye ${r.brToplamYazi || "—"})`]);
    await kayitYaz(env, r);
    const k = await arsiv(env, "mutabik", id, { fuat: kim, tarihSaat: tarihSaat(simdi), toplamBakiye: r.brToplam ?? null, toplamBakiyeYazi: r.brToplamYazi || null, mesaj: r.duzFuat || r.metin }, simdi);
    await cevapla("Teşekkürler"); await kapat();
    await tg(env, "sendMessage", { chat_id: fuat(env), text: "✅ Teşekkürler, mutabakat kaydedildi." });
    await tg(env, "sendMessage", { chat_id: murat(env), text: `✅ Fuat ${r.brToplamYazi || "—"} bakiyeyi onayladı — ${tarihSaat(simdi)} (${tarihYaz(r.gun)} mutabakatı). Arşiv kaydı #${k && k.sira} mühürlendi.` });
    try { await pdfArsivle(env, r, "Fuat mutabık", simdi); } catch (e) { await arsiv(env, "pdf-hata", id, String(e && e.message), simdi); }
    return;
  }
  if (islem === "u") {
    Object.assign(r, { durum: "fark", cevapZaman: simdi }); r.gecmis.push([simdi, "Fuat: uyuşmuyor"]);
    await kayitYaz(env, r); await ayarYaz(env, `mt:fark:${kim}`, id);
    await arsiv(env, "uyusmuyor", id, { fuat: kim, tarihSaat: tarihSaat(simdi) }, simdi);
    await cevapla("Farkı yazın"); await kapat();
    await tg(env, "sendMessage", { chat_id: murat(env), text: `❌ Fuat ${tarihYaz(r.gun)} mutabakatında "Uyuşmuyor" dedi (${tarihSaat(simdi)}). Açıklamasını yazınca iletirim.` });
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Ne uyuşmuyor? Lütfen kısaca yazın (model kodu ve adet, ya da bakiye)." });
  }
  if (islem === "s") {
    Object.assign(r, { durum: "sonra", sonraBas: r.sonraBas || simdi, sorulanGun: gunAnahtari(simdi) }); r.gecmis.push([simdi, "Fuat: sonra kontrol edeceğim"]);
    await kayitYaz(env, r); await arsiv(env, "sonra", id, { fuat: kim, tarihSaat: tarihSaat(simdi) }, simdi);
    await cevapla("Tamam"); await kapat();
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Tamam. Yarın 12:00'de tekrar soracağım." });
  }
}

// Fuat "Uyuşmuyor" dedikten sonra yazdığı açıklama → arşiv + Patron
export async function mutabakatFarkMesaji(env, m, tg, simdi) {
  const kim = String(m.from.id);
  if (kim !== fuat(env) || !m.text || m.text.startsWith("/")) return false;
  const id = await ayarOku(env, `mt:fark:${kim}`, null);
  if (!id) return false;
  const r = await ayarOku(env, `mt:${id}`, null);
  await stokIste(env, "/ayar-yaz", { k: `mt:fark:${kim}`, v: "null" });
  if (!r) return false;
  Object.assign(r, { fark: String(m.text).slice(0, 2000), farkZaman: simdi }); r.gecmis.push([simdi, "Fuat açıklama yazdı"]);
  await kayitYaz(env, r);
  await arsiv(env, "fark-aciklama", id, { fuat: kim, tarihSaat: tarihSaat(simdi), aciklama: r.fark }, simdi);
  await tg(env, "sendMessage", { chat_id: fuat(env), text: "Teşekkürler, açıklamanız iletildi." });
  await tg(env, "sendMessage", { chat_id: murat(env), text: `❌ Fuat mutabakatta uyuşmuyor (${tarihYaz(r.gun)}, ${tarihSaat(simdi)}):\n${r.fark}` });
  try { await pdfArsivle(env, r, "Fuat uyuşmuyor", simdi); } catch (e) { await arsiv(env, "pdf-hata", id, String(e && e.message), simdi); }
  return true;
}

// ---- Ödeme kanıtı (sadece Patron): "/odeme 5000$ [hesap 15/20/25/00] [not]" + dekont fotoğrafı/dosyası ----
export function odemeCoz(metin) {
  const m = /^\/odeme(?:@\S+)?\s+\$?\s*([\d][\d.,]*)\s*\$?\s*(.*)$/is.exec(String(metin || "").trim());
  if (!m) return null;
  let s = m[1];
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const tutar = Number(s);
  if (!Number.isFinite(tutar) || tutar <= 0) return null;
  let kalan = m[2].trim(), hesap = null;
  const h = /^(?:hesap\s*)?(000|00|15|20|25)\b\s*/i.exec(kalan);
  if (h) { hesap = h[1] === "000" ? "00" : h[1]; kalan = kalan.slice(h[0].length); }
  return { tutar: Math.round(tutar * 100) / 100, hesap, not: kalan.slice(0, 200) || null };
}
const dosyaKimligi = (m) => (m.photo && m.photo.length ? { id: m.photo[m.photo.length - 1].file_id, boy: m.photo[m.photo.length - 1].file_size, tur: "image/jpeg" } : m.document ? { id: m.document.file_id, boy: m.document.file_size, tur: m.document.mime_type || "application/octet-stream" } : null);
async function dekontSakla(env, odemeId, dosya, simdi) {
  if (!dosya || (dosya.boy && dosya.boy > 1200000)) return false; // büyük dosya: Telegram kimliği yeter
  const f = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/getFile?file_id=${encodeURIComponent(dosya.id)}`).then((r) => r.json()).catch(() => null);
  if (!f || !f.ok || !f.result.file_path) return false;
  const v = await fetch(`https://api.telegram.org/file/bot${String(env.BOT_TOKEN || "").trim()}/${f.result.file_path}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  if (!v || v.byteLength > 1200000) return false;
  await stokIste(env, "/arsiv-dosya-ekle", { mt: `odeme:${odemeId}`, tur: `dekont:${dosya.tur}`, veri: b64(new Uint8Array(v)), zaman: simdi });
  return true;
}
export async function odemeMesaji(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return false;
  const metin = m.text || m.caption || "";
  const dosya = dosyaKimligi(m);
  const yaz = (text) => tg(env, "sendMessage", { chat_id: m.chat.id, text });
  if (/^\/odeme\b/i.test(metin.trim())) {
    const o = odemeCoz(metin);
    if (!o) { await yaz("Kullanım: /odeme 5000$  (isterseniz hesap ve not: /odeme 5000$ 20 nakit)\nDekont fotoğrafını aynı mesajda (açıklama olarak) ya da hemen ardından gönderin. Ödemeler sadece size görünür."); return true; }
    const kayit = { id: simdi.toString(36), zaman: simdi, ...o, foto: dosya ? dosya.id : null, kim: String(m.from.id) };
    const liste = await ayarOku(env, "odeme:liste", []);
    await ayarYaz(env, "odeme:liste", [...liste, kayit].slice(-200));
    const saklandi = dosya ? await dekontSakla(env, kayit.id, dosya, simdi).catch(() => false) : false;
    const k = await arsiv(env, "odeme", `odeme:${kayit.id}`, { ...kayit, tarihSaat: tarihSaat(simdi), dekontArsivde: saklandi }, simdi);
    if (!dosya) await ayarYaz(env, `odeme:bekle:${m.from.id}`, { id: kayit.id, son: simdi + 600 });
    await yaz(`💵 Ödeme kaydedildi (#${k && k.sira}): ${odemeYazi(kayit)}\n${dosya ? "Dekont eklendi." : "Dekont fotoğrafını 10 dakika içinde gönderin, bu ödemeye eklerim."}\nMutabakatta "son ödemeler" olarak sadece size görünür; Fuat görmez.`);
    return true;
  }
  if (!dosya || metin.trim()) return false;
  const b = await ayarOku(env, `odeme:bekle:${m.from.id}`, null);
  if (!b || b.son < simdi) return false;
  const liste = await ayarOku(env, "odeme:liste", []);
  const o = liste.find((x) => x.id === b.id);
  if (!o) return false;
  o.foto = dosya.id;
  await ayarYaz(env, "odeme:liste", liste);
  await stokIste(env, "/ayar-yaz", { k: `odeme:bekle:${m.from.id}`, v: "null" });
  const saklandi = await dekontSakla(env, o.id, dosya, simdi).catch(() => false);
  await arsiv(env, "odeme-dekont", `odeme:${o.id}`, { odeme: o.id, foto: dosya.id, dekontArsivde: saklandi, tarihSaat: tarihSaat(simdi) }, simdi);
  await yaz(`📎 Dekont ödemeye eklendi: ${odemeYazi(o)}`);
  return true;
}

// /bakiye — Patron: iki mağazanın güncel bakiyesi AYRI AYRI (karşılaştırma yok)
export async function bakiyeKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  const b = await bakiyeOku(env);
  const limit = await ayarOku(env, "cari:limit", null);
  return gonder(env, tg, m.chat.id, [[`💰 <b>Güncel bakiyeler</b> — ${tarihSaat(simdi)}`, "", ...b.patronBloklar.map((x) => bolumHtml(x)).join("\n\n").split("\n"),
    ...(limit ? ["", `Borç sınırı (her mağaza ayrı): ${dolar(limit.tutar)}${limit.asildi ? " — AŞILDI 🚨" : ""}`] : [])].join("\n")], null);
}

// ---- Gece yedeği: arşivin tamamı Patron'un Google tablosuna ("Mutabakat Arşivi" sekmesi) ----
export async function geceYedegi(env) {
  const id = tabloKimligi(env.HARCAMA_TABLO_ID) || (await env.KAYIT.get("sami:tablo:harcama"));
  if (!hizmetHesabi(env) || !id) throw new Error("Patron'un Google tablosu bağlı değil");
  const kayitlar = [];
  for (let bas = 0; ;) { const p = await stokIste(env, "/arsiv-liste", { basla: bas, enFazla: 2000 }); if (!p.length) break; kayitlar.push(...p); bas = p[p.length - 1].sira; if (p.length < 2000) break; }
  const dogrula = await stokIste(env, "/arsiv-dogrula");
  const ad = await sekmeHazirla(env, id, "Mutabakat Arşivi", 2);
  await sayfayaYaz(env, id, ad, [
    [`Değiştirilemez mutabakat arşivi — yedek ${tarihSaat(Math.floor(Date.now() / 1000))}`, dogrula.tamam ? `zincir sağlam (${dogrula.kayit} kayıt)` : `ZİNCİR BOZUK: kayıt ${dogrula.bozuk}`],
    ["Sıra", "Tarih saat", "Tür", "Mutabakat", "İçerik", "Önceki mühür", "Mühür"],
    ...kayitlar.map((k) => [k.sira, tarihSaat(k.zaman), k.tur, k.mt || "", String(k.icerik).slice(0, 45000), k.onceki, k.muhur]),
  ]);
  return kayitlar.length;
}

// Görev (5 dakikada bir): cuma 17:00 önizleme; perşembe 11:00 karşılaştırma; 23:00 gece yedeği;
// "sonra" diyene her gün 12:00 (pazar hariç) hatırlatma; 3 gün cevapsız → Patron
export async function mutabakatAdimi(env, simdi, tg) {
  // Kendiliğinden takip (Patron'a): Vegawin ödemeleri, borç sınırı, pazartesi 09:30 haftalık özet
  for (const is of [() => odemeTakip(env, simdi, tg), () => borcLimitKontrol(env, simdi, tg, bakiyeOku), () => haftalikOzet(env, simdi, tg, bakiyeOku), () => isOzetiHazirMi(env, simdi, tg)]) {
    try { await is(); } catch (e) { await arsiv(env, "takip-hata", null, String(e && e.message).slice(0, 300), simdi).catch(() => {}); }
  }
  if (!fuat(env)) return;
  const gun = gunAnahtari(simdi);
  const s = saat(simdi);
  if (s >= 23 && !(await ayarOku(env, `mt:yedek:${gun}`, null))) {
    try { const n = await geceYedegi(env); await ayarYaz(env, `mt:yedek:${gun}`, { n, zaman: simdi }); }
    catch (e) {
      if (s >= 23.9 && !(await ayarOku(env, `mt:yedekHata:${gun}`, null))) {
        await ayarYaz(env, `mt:yedekHata:${gun}`, 1);
        await tg(env, "sendMessage", { chat_id: murat(env), text: `⚠️ Mutabakat gece yedeği Google tablosuna yazılamadı: ${String(e && e.message).slice(0, 200)}` });
      }
    }
  }
  if (haftaGunu(simdi) === 5 && s >= 17 && !(await ayarOku(env, `mt:cuma:${gun}`, null))) {
    await ayarYaz(env, `mt:cuma:${gun}`, 1);
    await onizlemeGonder(env, tg, simdi, "cuma");
    return;
  }
  if (haftaGunu(simdi) === 0 || s < 12) return;
  for (const id of (await ayarOku(env, "mt:liste", [])).slice(-6)) {
    const r = await ayarOku(env, `mt:${id}`, null);
    if (!r || r.durum !== "sonra" || r.sorulanGun === gun) continue;
    r.sorulanGun = gun;
    r.hatirlatma = (r.hatirlatma || 0) + 1;
    await gonder(env, tg, fuat(env), [`⏳ Mutabakatı kontrol ettiniz mi? (${tarihYaz(r.gun)})`], fuatKlavye(id), false);
    r.gecmis.push([simdi, `hatırlatma ${r.hatirlatma}`]);
    await arsiv(env, "hatirlatma", id, { sayi: r.hatirlatma }, simdi);
    if (r.hatirlatma >= 3 && !r.patronBilgi) {
      r.patronBilgi = true;
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fuat ${tarihYaz(r.gun)} mutabakatına 3 gündür cevap vermedi.` });
    }
    await kayitYaz(env, r);
  }
}

// ==== FUAT'A İŞ ÖZETİ (2 Kasım, kullanıcı kararı "a"): SADECE VOLONTE ile Black Rose arasındaki iş = Black Rose
// hesaplarından yıllık gelen mal tutarı (VOLONTE defteri; ödemeler hariç, dönem başı devir kaydı düşülür).
// Patron önizlemesi: [👁 Fuat'ın göreceği] [✅ Fuat'a gönder] [❌ İptal]. Patron onaylamadan ASLA gitmez.
// Gönderim değiştirilemez arşive; PDF kopyası sadece Patron'a.
export function yillikIs(defter) {
  const sonuc = { yillar: {}, uyarilar: [], taraf: null };
  if (!defter) return sonuc;
  let ob = 0, oa = 0;
  const genel = [];
  for (const h of defter.hesaplar || []) {
    const donemler = Object.entries(h.donemler || {}).map(([d, x]) => ({ d, x, m: /^D(\d{4})TBL(.+)$/.exec(d) })).filter((o) => o.m && o.m[2] === "CARIGENELHAREKET" && o.x.n > 0).sort((a, b) => a.m[1].localeCompare(b.m[1]));
    donemler.forEach((o, i) => { genel.push({ h, o, onceki: donemler[i - 1] || null }); for (const v of Object.values(o.x.yillar || {})) { ob += v.ob || 0; oa += v.oa || 0; } });
  }
  if (!genel.some((g) => g.o.x.yillar)) { sonuc.uyarilar.push("Köprü yıl toplamlarını henüz göndermedi."); return sonuc; }
  if (ob + oa < 0.005) { sonuc.uyarilar.push("Bu defterde ödeme kaydı (BORC VERDIM) görülmedi; gelen mal tarafı belirlenemedi."); return sonuc; }
  const taraf = ob >= oa ? "a" : "b"; // ödemeler borçtaysa gelen mal alacak tarafıdır (ya da tersi)
  sonuc.taraf = taraf === "a" ? "alacak" : "borç";
  for (const { h, o, onceki } of genel) {
    for (const [y, v] of Object.entries(o.x.yillar || {})) {
      const mal = (v[taraf] || 0) - (v[`o${taraf}`] || 0);
      sonuc.yillar[y] = (sonuc.yillar[y] || 0) + mal;
    }
    // Dönem başı devir: hesabın bu dönemdeki ilk günü, önceki dönemin kapanışına eşitse o gün mal sayılmaz
    const ig = o.x.ilkGun;
    if (onceki && ig) {
      const kapanis = Math.abs((Number(onceki.x.borc) || 0) - (Number(onceki.x.alacak) || 0));
      const net = Math.abs((ig.b || 0) - (ig.a || 0));
      if (Math.abs(kapanis - net) < 0.01) { const y = ig.tarih.slice(0, 4); sonuc.yillar[y] = (sonuc.yillar[y] || 0) - (ig[taraf] || 0); }
      else if (ig.n > 0) sonuc.uyarilar.push(`Black Rose ${h.anahtar}: ${tarihYaz(ig.tarih)} dönem başı devri ayrılamadı (o gün başka kayıt da var); bu yılın tutarı biraz fazla olabilir.`);
    }
    // İlk dönemin ilk günü: Vegawin'e geçişteki açılış bakiyesi olabilir → Patron'a (sadece önizlemede) gösterilir
    if (!onceki && ig && (ig[taraf] || 0) >= 0.005) sonuc.uyarilar.push(`Black Rose ${h.anahtar}: ilk kayıt ${tarihYaz(ig.tarih)} · ${dolar(ig[taraf])} gelen mal sayıldı; bu bir açılış bakiyesiyse ${ig.tarih.slice(0, 4)} tutarından düşülmeli (Claude'a söyleyin).`);
  }
  for (const y of Object.keys(sonuc.yillar)) sonuc.yillar[y] = Math.round(sonuc.yillar[y] * 100) / 100;
  return sonuc;
}

export function isOzetiMetni(yillar) {
  const yl = Object.keys(yillar).sort().filter((y) => Math.abs(yillar[y]) >= 0.005);
  const toplam = yl.reduce((t, y) => t + yillar[y], 0);
  return [
    "📊 VOLONTE – Sami", "", "Fuat Bey,", "",
    `${yl[0] || new Date().getUTCFullYear()}'ten bugüne yapılan işin özeti:`,
    ...yl.map((y) => `${y}: ${dolar(yillar[y])}`),
    `Toplam: ${dolar(toplam)}`, "",
    "Bundan sonra tüm hesaplar sistem üzerinden, şeffaf ve kayıt altında yürüyecek.", "",
    "İyi çalışmalar.", "", "– Sami",
  ].join("\n");
}

const ozKlavye = (id) => ({ inline_keyboard: [[{ text: "👁 Fuat'ın göreceği", callback_data: `oz:f:${id}` }, { text: "✅ Fuat'a gönder", callback_data: `oz:g:${id}` }], [{ text: "❌ İptal", callback_data: `oz:x:${id}` }]] });

export async function isOzetiOnizleme(env, tg, simdi, kaynak = "elle") {
  const vl = await ayarOku(env, "cari:VOLONTE", null);
  const v = yillikIs(vl);
  const kapsam = kapsamEksik(vl);
  if (kapsam) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `Fuat'a iş özeti hazırlanmadı: ${kapsam} Eksik rakam Fuat'a gitmesin diye bekliyorum.` });
    return null;
  }
  if (!Object.keys(v.yillar).length) {
    await tg(env, "sendMessage", { chat_id: murat(env), text: `Fuat'a iş özeti henüz hazır değil: VOLONTE defterinden yıl toplamları okunamadı.${v.uyarilar.length ? `\n${v.uyarilar.join("\n")}` : ""}` });
    return null;
  }
  const metin = isOzetiMetni(v.yillar);
  const id = `oz-${simdi.toString(36)}`;
  const kontrol = Object.keys(v.yillar).sort().map((y) => `${y}: ${dolar(v.yillar[y])}`);
  const ust = [
    "👁 <b>ÖNİZLEME — Fuat'a iş özeti</b> (sadece siz görüyorsunuz; siz onaylamadan gitmez)",
    `Kaynak: VOLONTE defterindeki Black Rose hesapları — gelen mal (${v.taraf} tarafı), ödemeler hariç, dönem başı devirleri düşüldü.`,
    ...v.uyarilar.map((x) => `⚠️ ${kacis(x)}`),
  ].join("\n");
  await gonder(env, tg, murat(env), [ust], null);
  const r = { id, olusturma: simdi, kaynak, metin, yillar: v.yillar, durum: "onizleme", gecmis: [[simdi, `önizleme (${kaynak})`]] };
  r.onizlemeMesaj = await gonder(env, tg, murat(env), [metin], ozKlavye(id), false);
  await ayarYaz(env, `oz:${id}`, r);
  await arsiv(env, "is-ozeti-onizleme", id, { metin, kontrol, uyarilar: v.uyarilar }, simdi);
  return r;
}

export async function isOzetiKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  return isOzetiOnizleme(env, tg, simdi, "elle");
}

export async function isOzetiDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data).split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!muratMi(env, cq.from.id)) return cevapla("Bu düğme Patron'da.");
  const r = await ayarOku(env, `oz:${id}`, null);
  if (!r) return cevapla("Bu önizleme bulunamadı.");
  const dugmeYaz = (text) => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: "oz:-" }]] } });
  if (islem === "f") { await cevapla("Fuat'ın göreceği"); return gonder(env, tg, cq.message.chat.id, [r.metin], null, false); }
  if (r.durum !== "onizleme") return cevapla("Bu önizleme artık geçerli değil.");
  if (islem === "x") {
    r.durum = "iptal"; r.gecmis.push([simdi, "iptal (Patron)"]);
    await ayarYaz(env, `oz:${id}`, r); await arsiv(env, "is-ozeti-iptal", id, { kim: String(cq.from.id) }, simdi);
    await cevapla("İptal edildi"); return dugmeYaz("❌ İptal edildi");
  }
  if (islem !== "g") return cevapla("?");
  const yasak = fuatSuzgec(r.metin);
  if (yasak || !fuat(env)) { await cevapla("Gönderilmedi"); return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `⛔ Gönderilmedi: ${yasak ? `metinde Fuat'ın görmemesi gereken bilgi var (${yasak.join(", ")})` : "Fuat'ın kimliği kayıtlı değil"}.` }); }
  const s = await tg(env, "sendMessage", { chat_id: fuat(env), text: r.metin });
  if (!s || !s.ok) return cevapla("Fuat'a gönderilemedi (Sami'ye /start yazmamış olabilir).");
  Object.assign(r, { durum: "gonderildi", gonderim: simdi, onaylayan: String(cq.from.id) }); r.gecmis.push([simdi, "Patron onayladı → Fuat'a gönderildi"]);
  await ayarYaz(env, `oz:${id}`, r);
  const k = await arsiv(env, "is-ozeti-gonderim", id, { onaylayan: String(cq.from.id), tarihSaat: tarihSaat(simdi), fuatMesaji: r.metin, yillar: r.yillar }, simdi);
  await cevapla("Fuat'a gönderildi"); await dugmeYaz("✅ Fuat'a gönderildi");
  try {
    const pdf = await pdfOlustur(["VOLONTE – Fuat'a iş özeti", `Gönderim: ${tarihSaat(simdi)} (İstanbul saati) · kayıt ${id}`, "", "=== FUAT'A GİDEN MESAJ (birebir) ===", ...r.metin.split("\n"), "", "=== GEÇMİŞ ===", ...r.gecmis.map(([t, n]) => `${tarihSaat(t)} · ${n}`), "", `Arşiv kaydı #${k && k.sira} · mühür ${k && k.muhur}`], { baslik: "Fuat'a iş özeti" });
    const d = await stokIste(env, "/arsiv-dosya-ekle", { mt: id, tur: "pdf:is-ozeti", veri: b64(pdf), zaman: simdi });
    await arsiv(env, "pdf", id, { tur: "is-ozeti", sha256: d.muhur, boyut: pdf.length }, simdi);
    await belgeGonder(env, murat(env), pdf, `fuat-is-ozeti-${gunAnahtari(simdi)}.pdf`, "📄 Fuat'a giden iş özeti (arşiv kopyası, sadece sizde)");
  } catch (e) { await arsiv(env, "pdf-hata", id, String(e && e.message), simdi); }
  return tg(env, "sendMessage", { chat_id: cq.message.chat.id, text: `✅ İş özeti Fuat'a gönderildi (${tarihSaat(simdi)}). Arşiv kaydı #${k && k.sira}.` });
}

// Kapsam: VOLONTE defterinde Black Rose hesaplarının hareketi olan her GENEL dönem tablosu yıl toplamı göndermiş olmalı
// (eksik dönem varsa özet eksik kalır → hazırlanmaz). Döner: eksikse açıklama, tamamsa null.
export function kapsamEksik(vl) {
  const donem = [];
  for (const h of (vl && vl.hesaplar) || []) for (const [k, x] of Object.entries(h.donemler || {})) if (/CARIGENELHAREKET$/.test(k) && x.n > 0) donem.push({ k, yillar: Boolean(x.yillar) });
  if (!donem.length) return "VOLONTE defterinden Black Rose hareketi okunamadı.";
  const eksik = [...new Set(donem.filter((d) => !d.yillar).map((d) => d.k.slice(0, 5)))];
  return eksik.length ? `VOLONTE defterinde ${eksik.join(", ")} dönemlerinin yıl toplamları henüz gelmedi (köprüye son paket kurulmalı).` : null;
}

// Rakamlar hazır olunca (VOLONTE defterinden yıl toplamları, tam kapsamla) önizleme Patron'a bir kez kendiliğinden gider
export async function isOzetiHazirMi(env, simdi, tg) {
  if (await ayarOku(env, "oz:otomatik", null)) return;
  const vl = await ayarOku(env, "cari:VOLONTE", null);
  if (!Object.keys(yillikIs(vl).yillar).length || kapsamEksik(vl)) return;
  await ayarYaz(env, "oz:otomatik", simdi);
  await isOzetiOnizleme(env, tg, simdi, "otomatik");
}
