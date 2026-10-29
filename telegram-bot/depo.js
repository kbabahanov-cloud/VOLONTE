// KARMA DEPO — sık yazılan kayıtlar KV yerine Durable Object deposunda.
//
// Cloudflare ücretsiz pakette KV'ye günde en fazla 1000 yazma yapılabiliyor (22 Ekim'de doldu).
// Bir botun sadece kendisinin kullandığı ve sık değişen kayıtları (tur, sıra, sayaçlar, sohbetler,
// Selin'in model listesi) artık o botun Durable Object deposunda; iki botun birlikte okuduğu
// kayıtlar (kanal, kodlar, katalog, harcama, kare:*) ve hata/rapor kayıtları KV'de kalır.
// Kod değişmez: env.KAYIT yerine aynı get/put/delete/list arayüzlü karma depo verilir.
//
// Taşıma (kullanıcı kararı, 27 Ekim): önce KOPYALA, sonra KONTROL ET, eski KV kayıtlarını SİLME.
// Kopya, nesnenin ilk isteğinde bir kez ve başka istek araya girmeden (blockConcurrencyWhile) yapılır;
// sonuç KV'de "goc:<ad>" raporuna yazılır.

export function karmaDepo(kv, storage, { anahtarlar = [], onekler = [], haric = [] }) {
  const tamlar = new Set(anahtarlar);
  const disarida = new Set(haric);
  const yerel = (k) => !disarida.has(k) && (tamlar.has(k) || onekler.some((o) => k.startsWith(o)));
  const simdi = () => Math.floor(Date.now() / 1000);
  const ad = (k) => `kv:${k}`;
  const oku = async (k) => {
    const kayit = await storage.get(ad(k));
    if (!kayit) return null;
    if (kayit.e && kayit.e <= simdi()) {
      await storage.delete(ad(k));
      return null;
    }
    return kayit.v;
  };
  return {
    yerelMi: yerel,
    async get(k, tur) {
      if (!yerel(k)) return kv.get(k, tur);
      const v = await oku(k);
      return v == null ? null : tur === "json" ? JSON.parse(v) : v;
    },
    async put(k, v, secenek = {}) {
      if (!yerel(k)) return kv.put(k, v, secenek);
      const e = secenek.expirationTtl ? simdi() + secenek.expirationTtl : secenek.expiration || null;
      await storage.put(ad(k), { v: String(v), e });
    },
    async delete(k) {
      if (!yerel(k)) return kv.delete(k);
      await storage.delete(ad(k));
    },
    async list({ prefix = "" } = {}) {
      if (!yerel(prefix)) return kv.list({ prefix });
      const t = simdi();
      const harita = await storage.list({ prefix: ad(prefix) });
      const keys = [];
      for (const [isim, kayit] of harita) if (!(kayit.e && kayit.e <= t)) keys.push({ name: isim.slice(3) });
      return { keys, list_complete: true };
    },
  };
}

// KV'deki ilgili kayıtları DO deposuna kopyalar (silmez), kontrol eder, raporu KV'ye yazar.
export async function kopyalaVeKontrolEt(kv, storage, kurallar, isim, simdi) {
  const bulunan = [];
  const listele = async (prefix) => {
    let cursor;
    do {
      const r = await kv.list({ prefix, cursor });
      for (const k of r.keys) bulunan.push(k);
      cursor = r.list_complete ? undefined : r.cursor;
    } while (cursor);
  };
  for (const o of kurallar.onekler || []) await listele(o);
  for (const a of kurallar.anahtarlar || []) {
    const r = await kv.list({ prefix: a });
    const k = r.keys.find((x) => x.name === a);
    if (k) bulunan.push(k);
  }
  const yerel = karmaDepo(kv, storage, kurallar).yerelMi;
  let kopyalanan = 0;
  for (const k of bulunan) {
    if (!yerel(k.name)) continue;
    if (k.expiration && k.expiration <= simdi) continue;
    if (await storage.get(`kv:${k.name}`)) continue; // zaten var (yeni kayıt): ezme
    const v = await kv.get(k.name);
    if (v == null) continue;
    await storage.put(`kv:${k.name}`, { v, e: k.expiration || null });
    kopyalanan += 1;
  }
  // Kontrol: her kaydın KV'deki değeriyle DO'daki değeri aynı mı?
  let esit = 0;
  const farkli = [];
  for (const k of bulunan) {
    if (!yerel(k.name) || (k.expiration && k.expiration <= simdi)) continue;
    const a = await kv.get(k.name);
    const b = await storage.get(`kv:${k.name}`);
    if (a != null && b && b.v === a) esit += 1;
    else if (a != null) farkli.push(k.name);
  }
  const rapor = { isim, zaman: simdi, bulunan: bulunan.length, kopyalanan, esit, farkli: farkli.slice(0, 30), farkliSayi: farkli.length, eskiKayitlarSilinmedi: true };
  await kv.put(`goc:${isim}`, JSON.stringify(rapor));
  await storage.put("goc:v1", rapor);
  return rapor;
}

// Nesnenin ilk isteğinde bir kez (başka istek araya girmeden).
export async function gocBirKez(state, kv, kurallar, isim) {
  if (await state.storage.get("goc:v1")) return;
  await state.blockConcurrencyWhile(async () => {
    if (await state.storage.get("goc:v1")) return;
    await kopyalaVeKontrolEt(kv, state.storage, kurallar, isim, Math.floor(Date.now() / 1000));
  });
}

// Kemal'in kendi kayıtları (Selin bunları okumaz). Ortak olanlar KV'de kalır:
// kanal, arsiv, kodlar, kodsuz, tarifler, hicgelmeyecek, atlananlar, sonpaylasim, harcama:*, kare:*,
// ve hata/durum kayıtları (katalogHata, altyaziHata, tarifhata, katalogHazir, durum:webhook).
export const KEMAL_YEREL = {
  anahtarlar: ["tur", "sonraki", "kopya", "ozet", "istekler", "marka", "altyaziSira", "altyaziNo", "bicim"],
  onekler: ["kuyruk:", "sayac:", "gun:", "gunsonu:", "rapor:", "hatirlatma:", "onay:", "oneri:", "iletim:", "silinecek:",
    "altyazi:", "katalog:", "ai:", "sohbet:", "m:", "mf:", "mtoplam:", "mftoplam:", "mhaber:", "msohbet:", "bekleyen:", "duzelt:"],
};

// Selin'in kayıtları; hata/durum kayıtları izlenebilsin diye KV'de kalır.
export const SELIN_YEREL = { anahtarlar: [], onekler: ["selin:"], haric: ["selin:hata", "selin:github", "selin:webhook", "selin:rapor"] };
