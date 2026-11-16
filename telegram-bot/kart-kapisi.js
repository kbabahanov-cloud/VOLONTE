// TEK KAPI — EKİBE VE FABRİKAYA GİDEN KARTLAR (16 Kasım, Patron — kalıcı, kural 86)
// Sami'den çıkan BÜTÜN düğmeli kartlar (eksik listesi, fabrika siparişi, hatırlatma kartı, repete, eski kart, Venom'un emirleri)
// Sami'nin tek gönderim işlevinden (sami.js tg) geçer; o işlev göndermeden önce BU kapıya sorar. Başka kod yolu Telegram'a
// doğrudan kart gönderemez (sami.js'te kapıyı atlayan gönderim yoktur; test bunu doğrular).
// Kapı her kartta ortak defteri (StokDO "isd") okur: AYNI kişi + AYNI model + AYNI konu (kartın ilk iki satırı + düğme kalıbı;
// kayıt numaraları atılır) için son 7 gün içinde
//   • açık kart varsa → YENİ KART GİTMEZ; açık karta tek "hatırlatma" satırı (aynı karta en fazla saatte bir, sadece mesaide);
//   • kapanmış kart varsa (cevaplanmış, eskimiş, kapatılmış) → HİÇBİR ŞEY gitmez.
// 7 günden eski kart yeni iş sayılır (aynı model yeni hafta yeniden istenebilir). Patron'a giden kartlar kapıya girmez (onlar Venom'dan).
import { kodBulDefter, defterYaz } from "./is-defteri.js";
import { mesaiMi } from "./kart-tekrar.js";

export const KAPI_GUN = 7;
const kml = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
// Defterdeki özetle AYNI biçim (is-defteri.js defterTg): ilk iki dolu satır " · " ile, 200 harf
export const kartOzeti = (metin) => String(metin || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ").slice(0, 200).replace(/\s+/g, " ").trim();
// Düğme kalıbı: kayıt numaraları (rastgele harf+rakam) atılır; model kodu ve tarih kalır.
// "fc:g:3408-tohgq2j5" → "fc:g:3408" · "fe:k:2026-11-10:3408" → aynen · "rk:f8:3583-tohgx9uz" → "rk:f8:3583"
export function dugmeKalibi(cb) {
  return String(cb || "").split(":").map((p) => p.replace(/-[a-z0-9]{5,}$/i, "")).filter((p) => p && !(/^[a-z0-9]{6,}$/i.test(p) && /[a-z]/i.test(p) && /\d/.test(p))).join(":");
}
export const kalipSeti = (cbler) => [...new Set((cbler || []).filter((c) => c && c !== "gz:-").map(dugmeKalibi))].sort().join("|");
const govdeCbler = (g) => ((g && g.reply_markup && g.reply_markup.inline_keyboard) || []).flat().map((b) => b && b.callback_data).filter(Boolean);
const KONU = [[/^fc:|^fs:|^fy:/, "fabrika siparişi"], [/^rk:|^rp/, "repete"], [/^fe:|^fl:/, "eksik listesi kontrolü"], [/^fh:/, "fabrikada bitti kararı"], [/^vg:|^kt:|^gv:/, "görev"]];
export const konuAdi = (kalip) => (KONU.find(([re]) => String(kalip).split("|").some((k) => re.test(k))) || [null, "kart"])[1];
const ACIK = new Set([null, undefined, "", "bekliyor"]);
// Karar: { karar: "gonder" } | { karar: "acik", kayit } | { karar: "kapali", kayit }
export async function kapiKarari(env, metod, govde, simdi = Math.floor(Date.now() / 1000)) {
  if (!/^(send(Message|Photo|Video|Document|Animation)|copyMessage)$/.test(metod) || !govde || typeof govde !== "object" || govde.chat_id == null) return { karar: "gonder" };
  const cbler = govdeCbler(govde).filter((c) => c !== "gz:-");
  if (!cbler.length) return { karar: "gonder" }; // düğmesiz yazı kart değildir (hatırlatma satırı, bilgi)
  const chat = String(govde.chat_id);
  if (kml(env.MURAT_ID).includes(chat)) return { karar: "gonder" };
  const metin = String(govde.text || govde.caption || "");
  const kod = kodBulDefter(metin);
  if (!kod || !env.STOK) return { karar: "gonder" }; // modelsiz liste kartları (günlük, tarihli) kendi kontrolleriyle gider
  const ozet = kartOzeti(metin), kalip = kalipSeti(cbler);
  let l;
  try { l = await (await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/isd-kod", { method: "POST", body: JSON.stringify({ kod, basla: simdi - KAPI_GUN * 86400 }) })).json(); } catch { return { karar: "gonder" }; }
  const aday = (Array.isArray(l) ? l : []).filter((x) => x.bot === "sami" && x.tur === "kart" && String(x.kime) === chat && !x.deneme
    && kartOzeti(x.ozet) === ozet && kalipSeti(String(x.cb || "").split("|")) === kalip).sort((a, b) => b.zaman - a.zaman);
  // Kartın tam yazısı (Sami her kartın kopyasını 4 gün tutar): ilk iki satırı aynı ama devamı farklı kart (ör. ACİL kartının büyük /
  // küçük satırı) AYNI kart sayılmaz. Kopyası silinmiş (4 günden eski) kartta ilk iki satır + düğme kalıbı yeter.
  const tam = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const ayni = [];
  for (const x of aday) {
    const kp = x.mesaj ? await env.KAYIT.get(`kopya:${chat}:${x.mesaj}`, "json").catch(() => null) : null;
    if (kp && kp.metin != null && tam(kp.metin) !== tam(String(metin).slice(0, 3500))) continue;
    ayni.push(x);
  }
  if (!ayni.length) return { karar: "gonder" };
  const acik = ayni.find((x) => ACIK.has(x.durum) && !x.sonuc);
  if (acik) return { karar: "acik", kayit: acik, kod, konu: konuAdi(kalip) };
  // Akışın KENDİ sonraki adımı yeni kart sayılmaz (repete akışı korunur): alıcı "⏳ sonra dön" dediyse süre dolunca aynı kart yeniden
  // gider; Patron açıkça "tekrar aç" dediyse (env.__kapiIzin) gider. İkisi de deftere "izinli" diye yazılır.
  if (/sonra d[öo]n|tekrar sor/i.test(String(ayni[0].sonuc || ""))) return { karar: "gonder", izin: "alıcı \"sonra dön\" demişti", kod, konu: konuAdi(kalip) };
  if (env.__kapiIzin) return { karar: "gonder", izin: String(env.__kapiIzin), kod, konu: konuAdi(kalip) };
  return { karar: "kapali", kayit: ayni[0], kod, konu: konuAdi(kalip) };
}
// Sami'nin tg() katmanı çağırır. Dönen: null → gönder; değilse Telegram cevabı gibi (yeni kart GİTMEDİ)
export async function kartKapisi(env, metod, govde, gercek, simdi = Math.floor(Date.now() / 1000)) {
  const k = await kapiKarari(env, metod, govde, simdi).catch(() => ({ karar: "gonder" }));
  if (k.karar === "gonder") {
    if (k.izin) await defterYaz(env, { zaman: simdi, bot: "sami", tur: "is", kod: k.kod, kime: String(govde.chat_id), ozet: `TEK KAPI: ${k.kod} · ${k.konu} — aynı kart yeniden gitti (izinli: ${k.izin})` }).catch(() => null);
    return null;
  }
  const chat = String(govde.chat_id), mesaj = Number(k.kayit.mesaj) || null;
  if (k.karar === "acik" && mesaj && mesaiMi(simdi)) {
    const hk = `sami:kapiHat:${chat}:${mesaj}`;
    if (!(await env.KAYIT.get(hk).catch(() => null))) {
      await env.KAYIT.put(hk, String(simdi), { expirationTtl: 3600 }).catch(() => null);
      await gercek("sendMessage", { chat_id: chat, text: `🔔 Hatırlatma: cevap bekleyen kartınız var — ${k.kod} · ${k.konu}. En alttaki karta bakın.`, reply_to_message_id: mesaj, allow_sending_without_reply: true }).catch(() => null);
    }
  }
  await defterYaz(env, { zaman: simdi, bot: "sami", tur: "is", kod: k.kod, kime: chat, ozet: `TEK KAPI: ${k.kod} · ${k.konu} — aynı kart ${k.karar === "acik" ? "açık, yeni kart gönderilmedi (hatırlatma)" : `kapanmış (${k.kayit.durum || "cevaplandı"}), yeniden gönderilmedi`}` }).catch(() => null);
  return { ok: true, tekrar: true, kapi: k.karar, result: { message_id: mesaj, chat: { id: govde.chat_id } } };
}
