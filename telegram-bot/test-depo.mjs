// Çalıştırma: node --test test-depo.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { karmaDepo, kopyalaVeKontrolEt, gocBirKez, KEMAL_YEREL, SELIN_YEREL } from "./depo.js";

function sahteKV(baslangic = {}) {
  const m = new Map(Object.entries(baslangic).map(([k, v]) => [k, typeof v === "object" ? v : { v }]));
  let yazma = 0;
  return {
    m, yazmaSayisi: () => yazma,
    async get(k, tur) { const x = m.get(k); return x == null ? null : tur === "json" ? JSON.parse(x.v) : x.v; },
    async put(k, v, o = {}) { yazma++; m.set(k, { v: String(v), expiration: o.expirationTtl ? 9e9 : undefined }); },
    async delete(k) { yazma++; m.delete(k); },
    async list({ prefix = "", cursor } = {}) {
      const hepsi = [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, ...(m.get(name).expiration ? { expiration: m.get(name).expiration } : {}) }));
      const bas = Number(cursor || 0);
      const parca = hepsi.slice(bas, bas + 2); // sayfalamayı da dene
      return bas + 2 < hepsi.length ? { keys: parca, list_complete: false, cursor: String(bas + 2) } : { keys: parca, list_complete: true };
    },
  };
}
function sahteDepo() {
  const m = new Map();
  return {
    m,
    async get(k) { if (Array.isArray(k)) return new Map(k.filter((x) => m.has(x)).map((x) => [x, m.get(x)])); return m.get(k); },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
    async list({ prefix = "" } = {}) { return new Map([...m.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1))); },
  };
}

test("karma depo: Kemal'in kendi kayıtları DO'ya, ortak kayıtlar KV'ye yazılır", async () => {
  const kv = sahteKV();
  const depo = sahteDepo();
  const k = karmaDepo(kv, depo, KEMAL_YEREL);
  await k.put("tur", JSON.stringify({ no: 5 }));
  await k.put("kuyruk:3194", "x", { expirationTtl: 60 });
  await k.put("kodlar", "{}");
  await k.put("harcama:2026-10", "5");
  await k.put("kare:3300", "{}");
  assert.deepEqual([...kv.m.keys()].sort(), ["harcama:2026-10", "kare:3300", "kodlar"]);
  assert.deepEqual([...depo.m.keys()].sort(), ["kv:kuyruk:3194", "kv:tur"]);
  assert.deepEqual(await k.get("tur", "json"), { no: 5 });
  assert.deepEqual((await k.list({ prefix: "kuyruk:" })).keys.map((x) => x.name), ["kuyruk:3194"]);
  await k.delete("kuyruk:3194");
  assert.equal(await k.get("kuyruk:3194"), null);
  // süre dolunca okunmaz
  await depo.put("kv:sayac:2026-10-01", { v: "3", e: 1 });
  assert.equal(await k.get("sayac:2026-10-01"), null);
  // marka (tam ad) ile m: (önek) karışmaz
  await k.put("marka", "acik");
  await k.put("m:999:2026-10-27", "1");
  assert.ok(depo.m.has("kv:marka") && depo.m.has("kv:m:999:2026-10-27"));
});

test("karma depo: Selin'in hata/rapor kayıtları KV'de kalır, gerisi DO'da", async () => {
  const kv = sahteKV();
  const depo = sahteDepo();
  const k = karmaDepo(kv, depo, SELIN_YEREL);
  await k.put("selin:modeller", "{}");
  await k.put("selin:hata", "{}");
  await k.put("selin:github", "{}");
  await k.put("kanal", "{}");
  assert.deepEqual([...kv.m.keys()].sort(), ["kanal", "selin:github", "selin:hata"]);
  assert.deepEqual([...depo.m.keys()], ["kv:selin:modeller"]);
});

test("taşıma: önce kopyalar, sonra kontrol eder; ESKİ KV KAYITLARI SİLİNMEZ; rapor KV'ye yazılır; bir kez çalışır", async () => {
  const kv = sahteKV({
    tur: JSON.stringify({ no: 4 }), "kuyruk:3194": "a", "kuyruk:3100": "b", "kuyruk:3200": "c", "sohbet:111": "[]",
    kodlar: "{}", kanal: "{}", "harcama:2026-10": "7",
  });
  const once = new Map([...kv.m.entries()].map(([k, v]) => [k, v.v]));
  const depo = sahteDepo();
  let engel = 0;
  const state = { storage: depo, async blockConcurrencyWhile(f) { engel++; return f(); } };
  await gocBirKez(state, kv, KEMAL_YEREL, "kemal");
  const rapor = JSON.parse(await kv.get("goc:kemal"));
  assert.equal(rapor.kopyalanan, 5);
  assert.equal(rapor.esit, 5);
  assert.equal(rapor.farkliSayi, 0);
  assert.equal(rapor.eskiKayitlarSilinmedi, true);
  for (const [k, v] of once) assert.equal(kv.m.get(k).v, v, `${k} KV'de aynen duruyor`);
  assert.equal(depo.m.get("kv:kuyruk:3100").v, "b");
  // ikinci kez çalışmaz, yeni kaydı ezmez
  await depo.put("kv:tur", { v: JSON.stringify({ no: 5 }), e: null });
  await gocBirKez(state, kv, KEMAL_YEREL, "kemal");
  assert.equal(engel, 1);
  assert.equal(JSON.parse(depo.m.get("kv:tur").v).no, 5);
});
