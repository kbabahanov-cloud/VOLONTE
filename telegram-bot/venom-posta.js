// VENOM POSTANESİ (9 Kasım, Patron: "Venom postacı gibi her şeyi aktarmasın"). Patron'a giden HER mesaj buradan karar alır:
//  • ANINDA: (a) Patron onayı / para gereken KART, (b) KRİTİK hata (bot çöktü, köprü sustu, yanlış paylaşım çıktı, para sınırı),
//    (c) Patron'un kendi sorusunun / isteğinin cevabı.
//  • Gerisi (paylaşıldı, onaylandı, durduruldu, raporlar, uyarılar) BİRİKİR: KV "venom:posta:<gün>" → 09:40 ve 20:00 TEK özet.
//  • Tavan: acil ve cevap hariç günde en fazla 10 mesaj; fazla kartlar saatte bir TEK mesajda birleşir.
//  • Kalıcı bildirim kuralları (Patron "bunu bana gönderme" der): KV "venom:bildirimKurallari"; kritik hiçbir zaman susturulmaz.
//  • Her gönderim kayıtlı: KV "venom:posta:gonderilen" (son 200) — sayım ve "bunu" hangi mesajdı.
export const POSTA_TAVAN = 10;
export const OZET_SATIR = 15;
const SAAT_FARKI = 3 * 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const oku = async (env, k, bos) => (await env.KAYIT.get(k, "json").catch(() => null)) ?? bos;
const kaydet = (env, k, v, ttl) => env.KAYIT.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined).catch(() => null);
const kucuk = (s) => String(s || "").toLocaleLowerCase("tr");

// Kritik: sadece gerçekten acil olanlar (Patron listesi). "durdu" tek başına kritik DEĞİL (Venom kontrolü durdurması bilgi).
export const KRITIK = /(çöktü|çalışmıyor \(3 hata|durduruldu \(.*hata|otomatik durduruldu|köprü[^\n]{0,40}(sustu|sinyal (yok|göndermedi)|kopuk)|yanlış paylaşım|kanalda sorun|yanlış marka|para sınırı|sınırı (doldu|aşıl)|bütçe[^\n]{0,20}(aşıl|doldu)|%80)/i;
export const kritikMi = (metin) => KRITIK.test(String(metin || ""));
// Bilgi türü (akşam/sabah özetinde sayı olarak)
const KATEGORI = [
  ["paylaşılamadı", /paylaşılamadı|gönderilemedi|yüklenemedi|gitmedi|kanala gitmedi|İLETİLMEDİ/i],
  ["durduruldu", /venom kontrolü|durdurdu|🛑/i],
  ["paylaşıldı", /paylaşıldı|kanala (kondu|gönderildi|gitti)|paylaştım|yayında|siteye eklendi|eklendi/i],
  ["onaylandı", /onayladı|onaylandı|✅ onay/i],
  ["rapor", /rapor|özet|sayım|mutabakat/i],
  ["uyarı", /⚠️|❌|uyarı|hata|bitti|bitiyor/i],
];
export function kategori(metin) {
  const t = String(metin || "");
  for (const [ad, re] of KATEGORI) if (re.test(t)) return ad;
  return "diğer";
}
const ilkSatir = (metin) => String(metin || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ").slice(0, 160);

// ---------- kalıcı bildirim kuralları ----------
const KURAL_ANAHTAR = "venom:bildirimKurallari";
export const kurallariOku = (env) => oku(env, KURAL_ANAHTAR, []);
const BOT_ADLARI = { kemal: "kemal", selin: "selin", sami: "sami", pelin: "pelin", nora: "pelin", venom: "venom" };
const DOLGU = new Set(["bana", "beni", "artık", "artik", "bunu", "şunu", "sunu", "bu", "şu", "su", "bunları", "şunları", "mesaj", "mesajı", "mesajları", "mesajlarını", "bildirim", "bildirimi", "bildirimleri", "gönderme", "gonderme", "getirme", "atma", "yollama", "bildirme", "iletme", "istemiyorum", "lütfen", "lutfen", "ve", "da", "de", "her", "hiç", "hic", "bir", "daha", "olan", "gibi", "kartı", "kartları", "kartlarını", "'nin", "nin", "nın", "in", "ın"]);
// "Kemal'in paylaşıldı mesajlarını bana gönderme" / "bunu bana gönderme" (son mesaj ya da yanıtlanan mesaj)
export const SUSTURMA = /\b(gönderme|gonderme|getirme|yollama|bildirme|iletme|atma)\b|istemiyorum/i;
export function kuralCoz(metin, ornek = null) {
  const t = kucuk(metin).replace(/[’'`]/g, "'");
  if (!SUSTURMA.test(t)) return null;
  const botlar = Object.keys(BOT_ADLARI).filter((b) => new RegExp(`(^|\\s)${b}('|\\s|$)`).test(t));
  const kelimeler = t.replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).map((w) => w.replace(/'.*$/, "")).filter((w) => w.length >= 3 && !DOLGU.has(w) && !BOT_ADLARI[w]);
  const isaret = /\b(bunu|şunu|sunu|bunları|şunları)\b/.test(t) || !kelimeler.length;
  if (isaret && ornek) {
    // tür belliyse (paylaşıldı, onaylandı…) bot + tür; değilse örnek mesajın ilk iki anlamlı kelimesi (çok geniş susturma olmasın)
    if (ornek.kategori && ornek.kategori !== "diğer") return { bot: ornek.kaynak || null, kategori: ornek.kategori, kelimeler: [], ornek: ornek.ozet || null };
    const k = kucuk(ornek.ozet).replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4 && !DOLGU.has(w) && !BOT_ADLARI[w]).slice(0, 2);
    return { bot: ornek.kaynak || null, kategori: null, kelimeler: k, ornek: ornek.ozet || null };
  }
  if (!kelimeler.length && !botlar.length) return null;
  return { bot: botlar.length === 1 ? BOT_ADLARI[botlar[0]] : null, kategori: null, kelimeler: kelimeler.slice(0, 4), ornek: null };
}
export async function kuralEkle(env, kural, ifade, simdi) {
  const l = await kurallariOku(env);
  const id = Math.random().toString(36).slice(2, 8);
  const yeni = { id, ...kural, ifade: String(ifade).slice(0, 200), zaman: simdi };
  await kaydet(env, KURAL_ANAHTAR, [...l, yeni].slice(-50));
  return yeni;
}
export async function kuralSil(env, id) {
  const l = await kurallariOku(env);
  await kaydet(env, KURAL_ANAHTAR, l.filter((x) => x.id !== id));
  return l.length !== l.filter((x) => x.id !== id).length;
}
export const kuralYazi = (k) => [k.bot ? `${k.bot[0].toUpperCase()}${k.bot.slice(1)}` : "Bütün botlar", k.kategori ? `"${k.kategori}" mesajları` : null, k.kelimeler && k.kelimeler.length ? `içinde "${k.kelimeler.join(" ")}" geçenler` : null].filter(Boolean).join(" · ");
export function kuralEslesir(kural, ileti) {
  if (kural.bot && kural.bot !== ileti.kaynak) return false;
  if (kural.kategori && kural.kategori !== ileti.kategori) return false;
  if (kural.kelimeler && kural.kelimeler.length) { const t = kucuk(ileti.metin); if (!kural.kelimeler.every((w) => t.includes(w))) return false; }
  return Boolean(kural.bot || kural.kategori || (kural.kelimeler && kural.kelimeler.length));
}

// 9 Kasım: Hemra/Merdan'ın karar kartları (stok sz:, fabrika fk:, Kemal günlük y1/yd/yg, yeni model/repete rp*) Patron'a anında GİTMEZ
// (kaynakta zaten onlara gidiyor; yine de Venom'a düşerse güvenlik ağı: özete sayı)
export const PERSONEL_KARTI = /^(sz|fk|y1|yd|yg|rp1|rpd|rpx|rpb):/;
// ---------- karar ----------
// ileti: { kaynak, metin, tur?: "kart"|"kritik"|"cevap"|"bilgi"|"rapor", kart?: boolean }
export function turBul(ileti) {
  if (ileti.tur) return ileti.tur;
  if (kritikMi(ileti.metin)) return "kritik";
  if (ileti.kart) return "kart";
  return "bilgi";
}
export async function bugunGonderilen(env, simdi) {
  const gun = gunAnahtari(simdi);
  return (await oku(env, "venom:posta:gonderilen", [])).filter((x) => gunAnahtari(x.zaman) === gun);
}
// Ne yapılacağına karar verir: "gonder" | "biriktir" | "sira" (tavan dolu kart → saatlik birleşik mesaj)
export async function postaKarar(env, ileti, simdi) {
  const tur = turBul(ileti);
  const kat = kategori(ileti.metin);
  if (tur === "kritik" || tur === "cevap") return { karar: "gonder", tur, kategori: kat };
  const kurallar = await kurallariOku(env);
  const kural = kurallar.find((k) => kuralEslesir(k, { ...ileti, kategori: kat }));
  if (kural) return { karar: "biriktir", tur, kategori: kat, kural: kural.id };
  if (tur === "kart") {
    // 9 Kasım (E11): aynı kart 12 saat içinde tekrar gelirse birleşir (ör. Fuat mutabakatı iki kez)
    const ilk = ilkSatir(ileti.metin), mut = /mutabakat/i.test(String(ileti.metin || ""));
    const son12 = (await oku(env, "venom:posta:gonderilen", [])).filter((x) => x.tur === "kart" && simdi - x.zaman < 12 * 3600);
    if (son12.some((x) => (x.kaynak === (ileti.kaynak || "venom") && x.ozet === ilk) || (mut && /mutabakat/i.test(x.ozet)))) return { karar: "biriktir", tur, kategori: "tekrar kart (birleştirildi)" };
    const n = (await bugunGonderilen(env, simdi)).filter((x) => x.tavan).length;
    return { karar: n < POSTA_TAVAN ? "gonder" : "sira", tur, kategori: kat };
  }
  if (tur === "ozet") return { karar: "gonder", tur, kategori: "rapor" };
  return { karar: "biriktir", tur, kategori: kat };
}
export async function gonderildiKaydet(env, { kaynak, tur, kategori: kat, metin, id = null }, simdi) {
  const l = await oku(env, "venom:posta:gonderilen", []);
  if (kaynak && kaynak !== "venom" && tur === "cevap") { // 9 Kasım (E10): bottan gelip kart/kritik olmadan geçen mesaj (sızıntı adayı)
    const d = new Date((simdi + 3 * 3600) * 1000), g = (d.getUTCDay() + 6) % 7, hk = `venom:posta:sizinti:${new Date(d.getTime() - g * 86400000).toISOString().slice(0, 10)}`;
    await env.KAYIT.put(hk, String((Number(await env.KAYIT.get(hk).catch(() => 0)) || 0) + 1), { expirationTtl: 14 * 86400 }).catch(() => null);
  }
  const tavan = !["kritik", "cevap"].includes(tur);
  await kaydet(env, "venom:posta:gonderilen", [...l, { zaman: simdi, kaynak: kaynak || "venom", tur, kategori: kat || kategori(metin), ozet: ilkSatir(metin), id, tavan }].slice(-200), 3 * 86400);
}
export async function biriktir(env, { kaynak, metin, tur, kategori: kat, kural = null }, simdi) {
  const k = `venom:posta:${gunAnahtari(simdi)}`;
  const l = await oku(env, k, []);
  await kaydet(env, k, [...l, { zaman: simdi, kaynak: kaynak || "venom", tur: tur || "bilgi", kategori: kat || kategori(metin), ozet: ilkSatir(metin), ...(kural ? { kural } : {}) }].slice(-300), 3 * 86400);
}
export async function siraya(env, { kaynak, metin, klavye, medya }, simdi) {
  const l = await oku(env, "venom:posta:kartSira", []);
  await kaydet(env, "venom:posta:kartSira", [...l, { zaman: simdi, kaynak, metin: String(metin || "").slice(0, 600), klavye: klavye || null, medya: (medya || [])[0] || null }].slice(-30), 3 * 86400);
}
// Saatte bir: tavan dolduktan sonra gelen kartlar TEK mesajda (her kartın düğmeleri numarasıyla)
export async function kartSiraMesaji(env) {
  const l = await oku(env, "venom:posta:kartSira", []);
  if (!l.length) return null;
  await env.KAYIT.delete("venom:posta:kartSira").catch(() => null);
  const parca = l.slice(0, 8);
  const satir = [`📋 Birleştirilmiş onaylar (${l.length}) — bugünkü 10 mesaj sınırı dolduğu için tek mesajda:`];
  const klavye = [];
  parca.forEach((x, i) => {
    satir.push(`${i + 1}. 🤖 ${x.kaynak}: ${ilkSatir(x.metin)}`);
    for (const r of (x.klavye && x.klavye.inline_keyboard) || []) klavye.push(r.map((b) => ({ ...b, text: `${i + 1}· ${b.text}` })));
    if (x.medya && x.medya.media && /^https?:/.test(x.medya.media)) klavye.push([{ text: `${i + 1}· 🖼 görsel`, url: x.medya.media }]);
  });
  if (l.length > parca.length) { satir.push(`…ve ${l.length - parca.length} kart daha (sıradaki saatte).`); await kaydet(env, "venom:posta:kartSira", l.slice(parca.length), 3 * 86400); }
  return { metin: satir.join("\n"), klavye: klavye.slice(0, 90) };
}

// ---------- özet ----------
// Biriken bilgilerin sayısı: "12 bilgi: 5 paylaşıldı · 2 onaylandı · …"
export function birikimSatiri(l) {
  if (!l.length) return null;
  const say = {};
  for (const x of l) say[x.kategori] = (say[x.kategori] || 0) + 1;
  const sira = ["paylaşıldı", "onaylandı", "durduruldu", "paylaşılamadı", "uyarı", "rapor", "diğer"];
  return `📨 Venom'da biriken ${l.length} bilgi: ${sira.filter((k) => say[k]).map((k) => `${say[k]} ${k}`).join(" · ")}`;
}
const SORUNLU = /❌|⚠️|🔴|🛑|sorun|hata|gitmedi|yapılamadı|gelmedi/i;
// bolumler: [{ satirlar: [...], enFazla }] öncelik sırasıyla. Sorunlu satırlar (❌ ⚠️) en üste; toplam OZET_SATIR'ı geçmez.
export function ozetKisalt(baslik, bolumler, sonNot = "Ayrıntı: /detay") {
  const temiz = (s) => String(s || "").replace(/^\s*[•-]\s*/, "• ").trim();
  const tum = bolumler.map((b) => ({ ...b, satirlar: (b.satirlar || []).map(temiz).filter((s) => s && !/^[─-]{3,}$/.test(s)) }));
  const sorunlu = [...new Set(tum.flatMap((b) => b.satirlar.filter((s) => SORUNLU.test(s))))].slice(0, 5);
  const out = [baslik, ...sorunlu];
  const kalan = OZET_SATIR - 1 - (sonNot ? 1 : 0);
  for (const b of tum) {
    let n = 0;
    for (const s of b.satirlar) {
      if (out.length >= kalan + 1) break;
      if (sorunlu.includes(s) || out.includes(s)) continue;
      if (n >= (b.enFazla || 3)) break;
      out.push(s); n++;
    }
  }
  if (sonNot) out.push(sonNot);
  return out.slice(0, OZET_SATIR).join("\n");
}
