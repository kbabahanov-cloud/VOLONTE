// Aylık yapay zekâ harcama sınırı (Anthropic panelinde ayar bulunamadığı için botta).
// Her çağrının gerçek token kullanımından tahmini dolar maliyeti hesaplanır ve
// KV "harcama:<YYYY-AA>" (İstanbul ayı) altında mikro-dolar olarak toplanır.

import { botSiniri } from "./kitap.js";
// 13 Kasım (Patron, kural 74): sınırlar TEK TABLODA (kitap): Kemal 20 $/ay, Selin 10 $/ay — bot başına ayrı sayılır.
// AYLIK_SINIR_USD artık sadece eski raporlardaki "ikisi birlikte" satırı içindir (20 + 10).
export const AYLIK_SINIR_USD = 30;
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

// Bot başına sayım: günlük KV "harcama-gun:<bot>:<gün>", aylık KV "harcama-ay:<bot>:<ay>" (mikro-dolar). Test / deneme ayrı
// sayılır (KV "harcama:denemeBitis" = unix zamanı; o zamana kadar yapılan çağrılar bot bütçesine yazılmaz).
const gunA = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(0, 10);
export const botAdi = (env) => env.BOT_ADI || (env.SELIN ? "selin" : "kemal");
export const gunlukAnahtar = (bot, simdi, deneme = false) => `harcama-${deneme ? "deneme" : "gun"}:${bot}:${gunA(simdi)}`;
export const gunlukHarcanan = async (env, bot, simdi = Math.floor(Date.now() / 1000)) => Number((await env.KAYIT.get(gunlukAnahtar(bot, simdi)).catch(() => 0)) || 0) / 1e6;
export const botAyAnahtari = (bot, simdi) => `harcama-ay:${bot}:${gunA(simdi).slice(0, 7)}`;
// Botun bu ayki harcaması (USD). Aylık sayaç yoksa (13 Kasım'dan önce) o ayın günlük kayıtlarından kurulur.
export async function botAyHarcanan(env, bot, simdi = Math.floor(Date.now() / 1000)) {
  const k = botAyAnahtari(bot, simdi);
  const v = await env.KAYIT.get(k).catch(() => null);
  if (v != null) return Number(v) / 1e6;
  let toplam = 0;
  try { for (const a of ((await env.KAYIT.list({ prefix: `harcama-gun:${bot}:${gunA(simdi).slice(0, 7)}` })).keys || [])) toplam += Number(await env.KAYIT.get(a.name)) || 0; } catch { toplam = 0; }
  await env.KAYIT.put(k, String(toplam), { expirationTtl: 70 * 86400 }).catch(() => null);
  return toplam / 1e6;
}
const denemeMi = async (env, simdi) => Boolean(env.__deneme) || simdi < (Number(await env.KAYIT.get("harcama:denemeBitis").catch(() => 0)) || 0);
export async function sinirAsildiMi(env, simdi = Math.floor(Date.now() / 1000)) {
  if (await denemeMi(env, simdi)) return false;
  const bot = botAdi(env);
  return (await botAyHarcanan(env, bot, simdi)) >= (await botSiniri(env, bot, simdi)).ay;
}

export async function harcamaEkle(env, model, usage, simdi = Math.floor(Date.now() / 1000)) {
  const anahtar = ayAnahtari(simdi);
  const onceki = Number((await env.KAYIT.get(anahtar)) || 0);
  const ek = Math.round(maliyetUsd(model, usage) * 1e6);
  await env.KAYIT.put(anahtar, String(onceki + ek), { expirationTtl: 70 * 86400 });
  // günlük (bot başına) + model başına çağrı sayısı ve tutar — "hangi bot, hangi model, kaç çağrı" için
  try {
    const bot = botAdi(env), dn = await denemeMi(env, simdi);
    const gk = gunlukAnahtar(bot, simdi, dn);
    const ayOnce = dn ? 0 : Math.round((await botAyHarcanan(env, bot, simdi)) * 1e6); // günlük yazılmadan ÖNCE okunur (ilk kurulumda günlüklerden toplanır; çift sayılmasın)
    await env.KAYIT.put(gk, String((Number(await env.KAYIT.get(gk)) || 0) + ek), { expirationTtl: 40 * 86400 });
    if (!dn) await env.KAYIT.put(botAyAnahtari(bot, simdi), String(ayOnce + ek), { expirationTtl: 70 * 86400 });
    const dk = `harcama-detay:${bot}:${gunA(simdi)}`;
    const d = (await env.KAYIT.get(dk, "json")) || {};
    const ad = `${model}${dn ? " (deneme)" : ""}${env.__is ? ` · ${env.__is}` : ""}`;
    d[ad] = { n: ((d[ad] || {}).n || 0) + 1, usd: Math.round((((d[ad] || {}).usd || 0) + ek / 1e6) * 1e6) / 1e6 };
    await env.KAYIT.put(dk, JSON.stringify(d), { expirationTtl: 40 * 86400 });
  } catch { /* sayım yazılamazsa iş durmaz */ }
  return (onceki + ek) / 1e6;
}

export const SINIR_MESAJI = "Bu ayın yapay zekâ harcama sınırı doldu (kitap, kural 74). Komutlar ve turlar çalışmaya devam ediyor; yapay zekâ cevapları ve fotoğraf tanıma gelecek ay açılır.";
