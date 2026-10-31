// SİTE HAFTALIK ÖZETİ (kullanıcı kararı 31 Ekim): her pazartesi 09:35'te SADECE Murat'a — geçen haftanın ziyaretleri,
// ülkeler, diller, en çok bakılan modeller. Veri sitenin sayımından (kişisel veri yok) iç bağlantıyla (SITE_IC) okunur.
// Tek seferlik "sami:siteDeneme" bayrağı: Selin bağlantısı + yeni sitenin sayfaları denenir, sonuç "sami:siteDenemeSonuc".
import { siteVerisi } from "./depo-oku.js";

const SAAT_FARKI = 3 * 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunGoster = (g) => `${g.slice(8, 10)}.${g.slice(5, 7)}`;
const ULKE = { NG: "Nijerya", GH: "Gana", KE: "Kenya", ZA: "Güney Afrika", CI: "Fildişi Sahili", SN: "Senegal", CM: "Kamerun", CD: "Kongo DC", TZ: "Tanzanya", UG: "Uganda", ET: "Etiyopya", RW: "Ruanda", TR: "Türkiye", US: "ABD", CA: "Kanada", AU: "Avustralya", FR: "Fransa", GB: "İngiltere", DE: "Almanya", BE: "Belçika", BJ: "Benin", TG: "Togo", ML: "Mali", GA: "Gabon", CG: "Kongo", AO: "Angola", ZM: "Zambiya", ZW: "Zimbabve", XX: "bilinmiyor" };

export function siteOzetMetni(satirlar, bas, bit) {
  const tur = (t) => satirlar.filter((r) => r.tur === t).sort((a, b) => b.n - a.n);
  const toplam = tur("ulke").reduce((s, r) => s + r.n, 0);
  const dil = tur("dil");
  const dilToplam = dil.reduce((s, r) => s + r.n, 0) || 1;
  return [
    `🌐 Site haftalık özet — ${gunGoster(bas)}–${gunGoster(bit)}`,
    `Ziyaret: ${toplam}`,
    `Ülkeler: ${tur("ulke").slice(0, 8).map((r) => `${ULKE[r.anahtar] || r.anahtar} ${r.n}`).join(" · ") || "—"}`,
    `Dil: ${dil.map((r) => `${r.anahtar.toUpperCase()} %${Math.round((100 * r.n) / dilToplam)}`).join(" · ") || "—"}`,
    `En çok bakılan modeller: ${tur("model").slice(0, 10).map((r) => `${r.anahtar} (${r.n})`).join(", ") || "—"}`,
    "(Kişisel veri yok; sadece ülke ve model sayıları.)",
  ].join("\n");
}

export async function siteHaftalik(env, simdi, tg, murat) {
  if (!env.SITE_IC) return;
  const g = gunAnahtari(simdi);
  if (new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() !== 1 || saat(simdi) < 9 + 35 / 60) return;
  if (await env.KAYIT.get(`sami:siteHaftalik:${g}`)) return;
  await env.KAYIT.put(`sami:siteHaftalik:${g}`, "1", { expirationTtl: 30 * 86400 });
  const bas = gunAnahtari(simdi - 7 * 86400), bit = gunAnahtari(simdi - 86400);
  const satirlar = await env.SITE_IC.ozet(bas, bit);
  await tg(env, "sendMessage", { chat_id: murat, text: siteOzetMetni(satirlar, bas, bit) });
}

export async function siteDenemesi(env) {
  if (!(await env.KAYIT.get("sami:siteDeneme"))) return;
  await env.KAYIT.delete("sami:siteDeneme");
  const sonuc = { zaman: Math.floor(Date.now() / 1000) };
  try { const l = await siteVerisi(env); sonuc.selin = { bagli: Boolean(env.SELIN_DEPO), model: l.length, fiyatAlani: l.some((u) => "fiyat" in u) }; } catch (e) { sonuc.selin = { hata: String(e.message || e) }; }
  try {
    sonuc.site = env.SITE_IC ? await env.SITE_IC.dene(["/", "/veri", "/img/galeri/3609/2.jpg?w=480", "/galeri/3609/2.jpg", "/css/style.css", "/urun.html?kod=3609", "/VOLONTE/urunler.html", "/robots.txt", "/olmayan"]) : "SITE_IC bağlı değil";
    sonuc.sayim = env.SITE_IC ? await env.SITE_IC.ozet("0000", "9999") : null;
  } catch (e) { sonuc.site = { hata: String(e.message || e) }; }
  await env.KAYIT.put("sami:siteDenemeSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
}
