// 10 Kasım (Patron, ACİL): Telegram gönderimi DOĞRULANIR. Fotoğraf altı yazı 1024, mesaj 4096 karakteri aşarsa kısaltılır;
// Telegram düğme / yazı hatası verirse bir kez düzeltilip yeniden denenir; yine olmazsa hata KAYDEDİLİR (<bot>:tgHatalar) —
// sessizce düşmez. Kart bir bütündür: fotoğraf + yazı + düğmeler TEK mesaj (ayrı mesaj yok).
const SESSIZ_HATA = /message is not modified|query is too old|message to delete not found|message can't be deleted/i;
export const kisalt = (s, n) => { const t = String(s || ""); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
// Düğmeler: renk alanı (style) kaldırılır, en fazla 100 düğme, yazı 64 karakter
export function duzKlavye(rm) {
  if (!rm || !Array.isArray(rm.inline_keyboard)) return rm;
  let n = 0;
  const satirlar = [];
  for (const s of rm.inline_keyboard) {
    const yeni = [];
    for (const b of s || []) { if (!b || n >= 100) continue; const { style, ...x } = b; yeni.push({ ...x, text: String(x.text || "").slice(0, 64) }); n++; }
    if (yeni.length) satirlar.push(yeni);
  }
  return { ...rm, inline_keyboard: satirlar };
}
export async function guvenliGonder(env, bot, cagir, metod, govde) {
  if (!govde || typeof govde !== "object") return cagir(metod, govde);
  let g = govde;
  if (typeof g.caption === "string" && g.caption.length > 1024) g = { ...g, caption: kisalt(g.caption, 1024) };
  if (typeof g.text === "string" && g.text.length > 4096) g = { ...g, text: kisalt(g.text, 4096) };
  let r = await cagir(metod, g);
  if (r && r.ok === false && !SESSIZ_HATA.test(String(r.description || ""))) {
    const h = String(r.description || "");
    let g2 = null;
    if (/caption.*too long|too long.*caption/i.test(h) && g.caption) g2 = { ...g, caption: kisalt(g.caption, 900) };
    else if (/too long/i.test(h) && g.text) g2 = { ...g, text: kisalt(g.text, 3500) };
    else if (/button|keyboard|markup|style|field/i.test(h) && g.reply_markup) g2 = { ...g, reply_markup: duzKlavye(g.reply_markup) };
    else if (/parse entities|can't parse/i.test(h) && g.parse_mode) { const { parse_mode, ...y } = g; g2 = y; }
    if (g2) r = await cagir(metod, g2);
    if (r && r.ok === false) {
      const l = (await env.KAYIT.get(`${bot}:tgHatalar`, "json").catch(() => null)) || [];
      await env.KAYIT.put(`${bot}:tgHatalar`, JSON.stringify([...l, { zaman: Math.floor(Date.now() / 1000), metod, chat: g.chat_id != null ? String(g.chat_id) : null, hata: String(r.description || h).slice(0, 200), ozet: String(g.caption || g.text || "").split("\n")[0].slice(0, 80), dugme: Boolean(g.reply_markup) }].slice(-150)), { expirationTtl: 14 * 86400 }).catch(() => null);
    }
  }
  return r;
}
