// TEK KİTAP testleri (13 Kasım, Patron — kural 37, 38, 74)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { kitapOku, kitapMetni, kitapBolumu, kitapBolumleri, kitapSurumu, paraSinirlari, derslerOzeti, derslerOku, kitapBellegiSil, KITAP_BOTLARI } from "./kitap.js";
import { KITAP_YEDEK, DERSLER_YEDEK } from "./kitap-yedek.js";

const kitapDosya = readFileSync(new URL("../KURALLAR-PATRON.md", import.meta.url), "utf8");
const derslerDosya = readFileSync(new URL("../DERSLER.md", import.meta.url), "utf8");
const kvEnv = (ilk = {}) => { const m = new Map(Object.entries(ilk)); return { m, KAYIT: { get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); } } }; };

test("TEK KİTAP: pakete gömülü yedek KURALLAR-PATRON.md ve DERSLER.md ile birebir aynı (kitap-yukle.py çalıştırılmış)", () => {
  assert.equal(KITAP_YEDEK, kitapDosya);
  assert.equal(DERSLER_YEDEK, derslerDosya);
});

test("TEK KİTAP: kurallar 1'den başlar, atlamasız ve tekrarsız numaralıdır; her kural tek satırdır", () => {
  const no = [...kitapDosya.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.ok(no.length >= 76);
  no.forEach((n, i) => assert.equal(n, i + 1));
  assert.match(kitapDosya, /^Sürüm: \d{4}-\d{2}-\d{2}\.\d+$/m);
});

test("TEK KİTAP: her bot ORTAK + kendi bölümü + PARA SINIRLARI + KORUNAN AKIŞLAR'ı okur; başka botun bölümünü okumaz; Venom hepsini okur", async () => {
  kitapBellegiSil();
  const env = kvEnv();
  const ad = { sami: "SAMİ", kemal: "KEMAL", selin: "SELİN", pelin: "PELİN", nora: "NORA" };
  for (const [bot, baslik] of Object.entries(ad)) {
    const t = await kitapOku(env, bot, 1000);
    const basliklar = t.split("\n").filter((x) => x.startsWith("## "));
    assert.deepEqual(basliklar, ["## ORTAK", `## ${baslik}`, "## PARA SINIRLARI", "## KORUNAN AKIŞLAR"], bot);
    assert.match(t, /75\. Eksik listesi MARKA BAZINDA ayrı kalır/); // 13 Kasım (Patron): korunan akışları her bot okur
    assert.match(t, /76\. Claude Code her değişiklikten önce "korunan akışa dokunuyor mu\?" kontrolü yapar/);
    assert.match(t, /Kanıtsız "tamam \/ hazır \/ yapıldı" denmez/);
    assert.match(t, /907 = VOLONTE/); // Patron'un kesin marka kararları da gelir
  }
  const v = await kitapOku(env, "venom", 1000);
  for (const b of ["ORTAK", "VENOM", "SAMİ", "KEMAL", "SELİN", "PELİN", "NORA", "PARA SINIRLARI", "KORUNAN AKIŞLAR"]) assert.ok(v.includes(`## ${b}\n`), b);
  assert.deepEqual(KITAP_BOTLARI, ["venom", "sami", "kemal", "selin", "pelin", "nora"]);
});

test("TEK KİTAP: kural değişince (KV'deki kitap) bütün botlar yeni kitabı okur ve okuduğu sürümü kayda yazar; KV boşsa gömülü yedek", async () => {
  kitapBellegiSil();
  const yeni = kitapDosya.replace(/^Sürüm: .+$/m, "Sürüm: 2099-01-01.1").replace("## KEMAL\n", "## KEMAL\n999. Deneme kuralı: mavi paylaşılmaz.\n");
  const env = kvEnv({ "kitap:metin": yeni });
  const k = await kitapOku(env, "kemal", 5000);
  assert.match(k, /sürüm 2099-01-01\.1/);
  assert.match(k, /999\. Deneme kuralı/);
  assert.doesNotMatch(await kitapOku(env, "sami", 5000), /999\. Deneme kuralı/);
  assert.deepEqual(JSON.parse(env.m.get("kitap:okudu:kemal")), { surum: "2099-01-01.1", zaman: 5000 });
  assert.equal(JSON.parse(env.m.get("kitap:okudu:sami")).surum, "2099-01-01.1");
  kitapBellegiSil();
  const bos = kvEnv();
  assert.equal(kitapSurumu(await kitapMetni(bos, 1)), kitapSurumu(kitapDosya));
  kitapBellegiSil();
  const bozuk = kvEnv({ "kitap:metin": "bozuk kayıt" }); // bölümsüz metin kitap sayılmaz → yedek
  assert.equal(await kitapMetni(bozuk, 1), KITAP_YEDEK);
  kitapBellegiSil();
});

test("PARA SINIRLARI (kural 74): tablo kitaptan okunur — Venom 50, Kemal 20, Selin 10, Sami 5 $/ay; Pelin 10 $/gün ve 100 $/ay", () => {
  assert.deepEqual(paraSinirlari(kitapDosya), { venom: { ay: 50 }, kemal: { ay: 20 }, selin: { ay: 10 }, sami: { ay: 5 }, pelin: { gun: 10, ay: 100 } });
  assert.deepEqual(paraSinirlari(kitapDosya.replace("Venom 50 $/ay", "Venom 65 $/ay")).venom, { ay: 65 });
});

test("DERS DEFTERİ (kural 38): 27 çelişki + 12 Kasım hataları; her ders hata + kök sebep + çözüm + durum taşır; Venom özetini okur", async () => {
  const satirlar = derslerDosya.split("\n").filter((x) => /^\d+\. /.test(x));
  assert.ok(satirlar.length >= 32);
  satirlar.forEach((x, i) => { assert.ok(x.startsWith(`${i + 1}. `), x.slice(0, 30)); assert.match(x, /Hata: .+Kök sebep: .+Çözüm: .+\((ÇÖZÜLDÜ|KURULUYOR|KISMEN|AÇIK)/, x.slice(0, 40)); });
  const o = derslerOzeti(derslerDosya);
  assert.equal(o.split("\n").length - 1, satirlar.length);
  assert.match(o, /2\. KANAL PAYLAŞIM SAATİ → tek saat 09:00–21:00/);
  kitapBellegiSil();
  assert.equal(await derslerOku(kvEnv(), 1), o);
  kitapBellegiSil();
});

test("TEK KİTAP: kodda eski kural kitabı ve bilinen çelişkili cümleler kalmadı", () => {
  const dosyalar = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".js") && !f.startsWith("test") && f !== "kitap-yedek.js");
  for (const f of dosyalar) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(s, /ORTAK_KURALLAR|VENOM_KURALLARI|KURAL_SURUM/, f);
    assert.doesNotMatch(s, /büyük ihtimalle Black Rose|\(Black Rose olabilir\)/, f);
  }
  const k = kitapBolumleri(kitapDosya);
  assert.match(k.KEMAL, /09:00–21:00/);
  assert.match(k.ORTAK, /1 saat sonra hatırlatma, 1 saat sonra son hatırlatma/);
  assert.match(kitapBolumu(kitapDosya, "selin"), /Black Rose modeline "VOLONTE modeli" yazmaz/);
});

test("PARA SINIRLARI: kodda kalan sabitler kitaptaki tabloyla AYNI (Pelin 10 $/gün, 100 $/ay; Sami 5; Venom 50); kitap okunamazsa kullanılan değerler de aynı", async () => {
  const { SINIR_VARSAYILAN, botSiniri } = await import("./kitap.js");
  const tablo = paraSinirlari(kitapDosya);
  assert.deepEqual(SINIR_VARSAYILAN, tablo);
  const P = await import("./pelin.js");
  assert.deepEqual([P.GUNLUK_SINIR_USD, P.AYLIK_SINIR_USD], [tablo.pelin.gun, tablo.pelin.ay]);
  assert.equal((await import("./uretim.js")).PELIN_AYLIK_SINIR_USD, tablo.pelin.ay);
  assert.equal((await import("./sami-beyin.js")).AYLIK_SINIR_USD, tablo.sami.ay);
  assert.equal((await import("./venom-bot.js")).VENOM_SINIR_VARSAYILAN, tablo.venom.ay);
  kitapBellegiSil();
  // kitapta rakam değişince botun sınırı kod değişmeden değişir
  const env = kvEnv({ "kitap:metin": kitapDosya.replace("Kemal 20 $/ay", "Kemal 35 $/ay") });
  assert.deepEqual(await botSiniri(env, "kemal", 1), { ay: 35 });
  assert.deepEqual(await botSiniri(env, "selin", 1), { ay: 10 });
  kitapBellegiSil();
  assert.deepEqual(await botSiniri(kvEnv(), "pelin", 1), { gun: 10, ay: 100 });
  kitapBellegiSil();
});

test("PARA: botun aylık sayacı yoksa o ayın günlük kayıtlarından kurulur (13 Kasım'dan önceki günler kaybolmaz)", async () => {
  const H = await import("./harcama.js");
  const m = new Map([["harcama-gun:selin:2026-11-10", "1500000"], ["harcama-gun:selin:2026-11-12", "2500000"], ["harcama-gun:selin:2026-10-30", "9000000"], ["harcama-gun:kemal:2026-11-12", "700000"]]);
  const env = { BOT_ADI: "selin", KAYIT: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) } };
  const t = Date.UTC(2026, 10, 12, 9) / 1000;
  assert.equal(await H.botAyHarcanan(env, "selin", t), 4);
  assert.equal(m.get("harcama-ay:selin:2026-11"), "4000000");
  await H.harcamaEkle(env, "claude-opus-5-5", { input_tokens: 250000 }, t); // 1 $
  assert.equal(await H.botAyHarcanan(env, "selin", t), 5);
  assert.equal(await H.gunlukHarcanan(env, "selin", t), 3.5);
});
