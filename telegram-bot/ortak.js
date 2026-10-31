// ORTAK BEYİN — Kemal, Selin (ve ileride Defne) aynı KV deposunu (KAYIT) kullanır.
// Kural: herkes her şeyi OKUYABİLİR, ama her anahtarı SADECE sahibi YAZAR.
// Böylece bir eleman bozulursa diğerinin verisi bozulmaz. Ayrıntı: gizli kayıt venom:ortak-beyin
//
// Kemal'in yazdığı (kanal ve turlar):
//   kanal, kodlar, kodsuz, tarifler, hicgelmeyecek, atlananlar, sonpaylasim,
//   ozet, gun:<gün>, sayac:<gün>, tur, kuyruk:<kod>, istekler, tepki:<id>, ...
// Selin'in yazdığı (site):
//   selin:* (ör. selin:durum, selin:model:<kod>, selin:site)
// Herkesin YAZDIĞI tek ortak anahtar: harcama:<ay> (harcama.js, toplam aylık sınır).

const SAAT_FARKI = 3 * 60 * 60; // İstanbul, UTC+3
const SECENEK_EN_FAZLA = 8; // bir modelin düğmeyle seçilebilen en fazla paylaşımı

export const kodsuzMu = (kod) => kod.startsWith("~");
export const kodGoster = (kod) => (kodsuzMu(kod) ? "Kodsuz paylaşım" : kod);

export function tarihUzun(unix) {
  return new Date((unix + SAAT_FARKI) * 1000).toISOString().slice(0, 10).split("-").reverse().join(".");
}

// Bir modelin kanaldaki paylaşımları (en yeni önce). Kodlu: tüm kayıtlar; kodsuz: kaydın kendisi.
export function modelSecenekleri(kod, kodlar, kodsuz, enFazla = SECENEK_EN_FAZLA) {
  if (kodsuzMu(kod)) {
    const g = kodsuz[kod];
    return g ? [{ ids: g.ids.filter((id) => id > 0), tarih: g.tarih }] : [];
  }
  return (kodlar[kod] || [])
    .map((g) => ({ ids: g.ids.filter((id) => id > 0), tarih: g.tarih }))
    .filter((g) => g.ids.length)
    .sort((a, b) => b.tarih - a.tarih)
    .slice(0, enFazla);
}

// Diğer elemanların (Selin, Defne) Kemal'in bildiklerini tek seferde okuması için.
export async function kanalBilgisi(env) {
  const oku = async (anahtar, bos) => (await env.KAYIT.get(anahtar, "json")) || bos;
  return {
    kanal: await oku("kanal", null),
    kodlar: await oku("kodlar", {}),
    kodsuz: await oku("kodsuz", {}),
    tarifler: await oku("tarifler", {}),
    silinenler: await oku("hicgelmeyecek", {}),
    atlananlar: await oku("atlananlar", {}),
    sonpaylasim: await oku("sonpaylasim", {}),
  };
}

// Kanal yazısından model kodu (Kemal ve Sami aynı kuralı kullanır).
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

