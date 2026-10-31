// Çalıştırma: node --test test-uretim.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { uretimAdimi, isPlani, aracOzeti, ARACLAR, DENEME_SINIR_USD } from "./uretim.js";

function ortam() {
  const depo = new Map();
  const env = { FAL_KEY: "k", URETIM_TEST: "1", KAYIT: { async get(k, t) { const v = depo.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { depo.set(k, v); }, async delete(k) { depo.delete(k); } } };
  const gonderim = [];
  globalThis.fetch = async (url, istek = {}) => {
    const u = String(url);
    if (u.startsWith("https://queue.fal.run/")) {
      const uc = u.replace("https://queue.fal.run/", "");
      const id = `r${gonderim.length}`;
      gonderim.push({ uc, govde: JSON.parse(istek.body) });
      return Response.json({ request_id: id, status_url: `https://q/${id}/status`, response_url: `https://q/${id}` });
    }
    if (u.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (u.startsWith("https://q/")) {
      const id = u.split("/").pop();
      const g = gonderim[Number(id.slice(1))];
      return Response.json(ARACLAR[Object.keys(ARACLAR).find((a) => ARACLAR[a].uc === g.uc)].tur === "video" ? { video: { url: `https://cdn/${id}.mp4` } } : { images: [{ url: `https://cdn/${id}.png` }] });
    }
    throw new Error("beklenmeyen " + u);
  };
  return { env, depo, gonderim };
}

test("üretim: anahtar yoksa hiçbir şey yapılmaz; varsa deneme planı (2 model) araç araç gönderilir, FASHN Nano pozunun üstüne orijinal kıyafeti giydirir; bitince bildirim; bütçe sınırı aşılmaz", async () => {
  const o = ortam();
  const bildirim = [];
  const yardim = { referansAl: async () => [{ rol: "aski", url: "data:image/jpeg;base64,AAA" }, { rol: "manken", url: "data:image/jpeg;base64,BBB" }], bildir: async (u) => bildirim.push(u) };
  await uretimAdimi({ ...o.env, FAL_KEY: undefined }, 1000, yardim);
  assert.equal(o.depo.size, 0);
  for (let i = 0; i < 80 && !bildirim.length; i++) await uretimAdimi(o.env, 1000 + i * 300, yardim);
  assert.equal(bildirim.length, 1);
  const u = JSON.parse(o.depo.get("selin:uretim"));
  assert.equal(u.durum, "bitti");
  assert.equal(u.isler.length, 2 * isPlani("x").length);
  const fashn = o.gonderim.find((g) => g.uc === ARACLAR.fashn.uc);
  assert.match(fashn.govde.model_image, /^https:\/\/cdn\/r\d+\.png$/); // Nano'nun ürettiği poz
  assert.equal(fashn.govde.garment_image, "data:image/jpeg;base64,AAA"); // orijinal kıyafet
  const nano = o.gonderim.find((g) => g.uc === ARACLAR.nano.uc);
  assert.match(nano.govde.prompt, /EXACTLY identical[\s\S]*No text, no logo/);
  const h = JSON.parse(o.depo.get("selin:uretimHarcama"));
  assert.ok(h.deneme <= DENEME_SINIR_USD);
  const oz = aracOzeti(u);
  assert.ok(oz.kling.uretilen >= 1 && oz.nano.uretilen >= 1);
});

test("üretim: kullanıcı onayladı (28 Ekim); fal.ai anahtarı ya da askı/manken fotoğrafı yokken hiçbir araca istek gitmez", async () => {
  const { URETIM_ONAYLI, PELIN_AYLIK_SINIR_USD } = await import("./uretim.js");
  assert.equal(URETIM_ONAYLI, false); // eski Selin denemesi kapalı (Pelin'e taşınıyor)
  assert.equal(PELIN_AYLIK_SINIR_USD, 150);
  const o = ortam();
  delete o.env.URETIM_TEST;
  await uretimAdimi({ ...o.env, FAL_KEY: undefined }, 1000, { referansAl: async () => [{ rol: "aski", url: "x" }], bildir: async () => {} });
  await uretimAdimi(o.env, 1000, { referansAl: async () => [], bildir: async () => {} });
  assert.equal(o.gonderim.length, 0);
  assert.ok(!o.depo.has("selin:uretimHarcama"));
});
