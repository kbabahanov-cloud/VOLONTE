// STOK BOTU — stok soruları (🔁 Repete / 🗑 Sil / ⏳ Beklesin) ve /stok komutu. Stok bilgisinin TEK kaynağı
// Sayım Sami'nin deposu (StokDO). Bu dosyayı hem Sami'nin botu (sami.js) hem Kemal (eski düğmeler için) kullanır;
// sorular Sami'nin botu açıksa ("sami:aktif") Sami'den gider. Vegawin'e hiçbir şey yazılmaz.

import { stokKodu, BEKLESIN_STOK_GUN } from "./stok.js";
import { modelSecenekleri } from "./ortak.js";

const SAAT_FARKI = 3 * 3600;
const kimlikler = (yazi) => String(yazi || "").split(",").map((x) => x.trim()).filter(Boolean);
export const kisiler = (env) => [...new Set([...kimlikler(env.ALLOWED_IDS), ...kimlikler(env.EKIP_IDS)])];
export const kisiAdi = (from) => [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Biri";
export function tarihYaz(unix) {
  const s = new Date((unix + SAAT_FARKI) * 1000).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

const stokNesne = (env) => env.STOK.get(env.STOK.idFromName("stok"), { locationHint: "enam" });
export async function stokIste(env, yol, govde = {}) {
  const r = await stokNesne(env).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(govde) });
  return r.json();
}

const STOK_SORU_PARTI = 6; // bir çalışmada en fazla soru (istek sınırı)
const stokKlavye = (kod) => ({ inline_keyboard: [[
  { text: "🔁 Repete olacak", callback_data: `sz:r:${kod}` },
  { text: "🗑 Sil", callback_data: `sz:s:${kod}` },
  { text: "⏳ Beklesin", callback_data: `sz:b:${kod}` },
]] });

export async function stokSorulariGonder(env, simdi, tg) {
  if (!env.STOK) return;
  const sorular = await stokIste(env, "/sorular", { simdi, enFazla: STOK_SORU_PARTI });
  if (!sorular.length) return;
  const kanal = await env.KAYIT.get("kanal", "json");
  const kodlar = (await env.KAYIT.get("kodlar", "json")) || {};
  for (const s of sorular) {
    const metin = [
      `📦 ${s.kod}${s.ad ? ` — ${s.ad}` : ""}`,
      `Vegawin: stok bitti (adet ${s.adet}). Ne yapalım?`,
      "🔁 Repete olacak → gizli bekler, stok gelince kendiliğinden geri döner",
      "🗑 Sil → siteden ve Telegram turlarından kaldırılır (kanal paylaşımlarına ve Vegawin'e dokunulmaz)",
      `⏳ Beklesin → ${BEKLESIN_STOK_GUN} gün sonra hâlâ stok yoksa tekrar sorarım`,
    ].join("\n");
    const sec = kanal && modelSecenekleri(s.kod, kodlar, {})[0];
    const mesajlar = [];
    for (const kisi of kisiler(env)) {
      let r = sec ? await tg(env, "copyMessage", { chat_id: kisi, from_chat_id: kanal.id, message_id: sec.ids[0], caption: metin, reply_markup: stokKlavye(s.kod) }) : { ok: false };
      let tur = "c";
      if (!r.ok) {
        r = await tg(env, "sendMessage", { chat_id: kisi, text: metin, reply_markup: stokKlavye(s.kod) });
        tur = "t";
      }
      if (r.ok) mesajlar.push([kisi, r.result.message_id, tur, metin]);
    }
    await stokIste(env, "/soru-gonderildi", { kod: s.kod, mesajlar });
  }
}

export async function stokKarari(cq, env, tg) {
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const [, islem, kod] = String(cq.data).split(":");
  const kim = kisiAdi(cq.from);
  if (!env.STOK) return cevapla("Stok köprüsü bağlı değil.");
  const r = await stokIste(env, "/karar", { kod, islem, kim, simdi: Math.floor(Date.now() / 1000) });
  if (!r.ok) return cevapla(r.kim ? `${r.kim} zaten karar verdi.` : "Bu soru artık geçerli değil.");
  const ek = r.durum === "repete" ? `🔁 ${kim}: repete olacak — gizli bekliyor, stok gelince geri döner.`
    : r.durum === "gizli" ? `🗑 ${kim}: sil — siteden ve Telegram turlarından kaldırıldı (kanal ve Vegawin'e dokunulmadı).`
    : `⏳ ${kim}: beklesin — ${BEKLESIN_STOK_GUN} gün sonra tekrar sorulacak.`;
  await cevapla("Tamam");
  for (const [kisi, id, tur, metin] of r.mesajlar) {
    const yeni = `${metin}\n\n${ek}`;
    if (tur === "c") await tg(env, "editMessageCaption", { chat_id: kisi, message_id: id, caption: yeni.slice(0, 1024), reply_markup: { inline_keyboard: [] } });
    else await tg(env, "editMessageText", { chat_id: kisi, message_id: id, text: yeni, reply_markup: { inline_keyboard: [] } });
  }
}

export async function stokGoster(msg, env, tg) {
  const yaz = (text) => tg(env, "sendMessage", { chat_id: msg.chat.id, text, disable_web_page_preview: true });
  if (!env.STOK) return yaz("Stok köprüsü henüz bağlı değil.");
  const kod = stokKodu((msg.text || "").split(/\s+/)[1] || "");
  if (!kod) {
    const o = await stokIste(env, "/ozet");
    if (!o.kopruler.length) return yaz("📦 Vegawin köprüsünden henüz veri gelmedi.");
    const durum = { soru: "cevap bekleyen soru", repete: "repete bekleyen", gizli: "silinen (gizli)", beklesin: "beklesin" };
    return yaz([
      "📦 Vegawin stok köprüsü",
      ...o.kopruler.map((k) => `• ${k.magaza}: ${k.adet} ürün · son veri ${tarihYaz(k.son)}`),
      `Stokta: ${o.stokta} model · stoksuz (gizli): ${o.stoksuz}`,
      ...o.kararlar.map((k) => `• ${durum[k.durum] || k.durum}: ${k.n}`),
    ].join("\n"));
  }
  const b = await stokIste(env, "/bilgi", { kod });
  if (!b.satirlar.length) return yaz(`${kod}: Vegawin'de bu kodla stok kaydı yok.`);
  const karar = b.karar ? { soru: "stok bitti, cevap bekliyor", repete: `repete olacak (${b.karar.kim})`, gizli: `silindi/gizli (${b.karar.kim})`, beklesin: `beklesin (${b.karar.kim})` }[b.karar.durum] : null;
  return yaz([
    `📦 ${kod} — ${b.satirlar[0].ad || ""}`,
    ...b.satirlar.map((x) => `• ${x.magaza}: ${x.adet} adet${x.fiyat != null ? ` · ${x.fiyat} $` : ""} (${tarihYaz(x.guncel)})`),
    `Toplam: ${b.toplam} → ${b.toplam > 0 && !(b.karar && b.karar.durum === "gizli") ? "görünür" : "gizli (sitede ve Telegram'da görünmez)"}`,
    karar ? `Durum: ${karar}` : null,
  ].filter(Boolean).join("\n"));
}

