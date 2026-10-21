// Aylık yapay zekâ harcama sınırı (Anthropic panelinde ayar bulunamadığı için botta).
// Her çağrının gerçek token kullanımından tahmini dolar maliyeti hesaplanır ve
// KV "harcama:<YYYY-AA>" (İstanbul ayı) altında mikro-dolar olarak toplanır.

export const AYLIK_SINIR_USD = 60;
export const UYARI_ORANI = 0.8;

// $ / milyon token: giriş, çıkış, önbellekten okuma (yazma = giriş × 1,25)
const FIYAT = {
  "claude-opus-5-5": { giris: 4, cikis: 20, okuma: 0.2 },
  "claude-sonnet-5-5": { giris: 2, cikis: 10, okuma: 0.2 },
  "claude-haiku-5-5": { giris: 0.1, cikis: 0.5, okuma: 0.01 },
};

export const ayAnahtari = (simdi) => `harcama:${new Date((simdi + 3 * 3600) * 1000).toISOString().slice(0, 7)}`;

export function maliyetUsd(model, usage) {
  const f = FIYAT[model] || FIYAT["claude-opus-5-5"];
  const u = usage || {};
  return ((u.input_tokens || 0) * f.giris
    + (u.cache_creation_input_tokens || 0) * f.giris * 1.25
    + (u.cache_read_input_tokens || 0) * f.okuma
    + (u.output_tokens || 0) * f.cikis) / 1e6;
}

export async function buAyHarcanan(env, simdi = Math.floor(Date.now() / 1000)) {
  return Number((await env.KAYIT.get(ayAnahtari(simdi))) || 0) / 1e6;
}

export async function sinirAsildiMi(env, simdi = Math.floor(Date.now() / 1000)) {
  return (await buAyHarcanan(env, simdi)) >= AYLIK_SINIR_USD;
}

export async function harcamaEkle(env, model, usage, simdi = Math.floor(Date.now() / 1000)) {
  const anahtar = ayAnahtari(simdi);
  const onceki = Number((await env.KAYIT.get(anahtar)) || 0);
  const ek = Math.round(maliyetUsd(model, usage) * 1e6);
  await env.KAYIT.put(anahtar, String(onceki + ek), { expirationTtl: 70 * 86400 });
  return (onceki + ek) / 1e6;
}

export const SINIR_MESAJI = `Bu ayın ${AYLIK_SINIR_USD} $ yapay zekâ harcama sınırına ulaşıldı. Komutlar ve turlar çalışmaya devam ediyor; yapay zekâ cevapları ve fotoğraf tanıma gelecek ay açılır.`;
