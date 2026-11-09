// ONAY MERDİVENİ — KART TEKRARI (9 Kasım, Patron; kural kitabında):
// Merdan / Hemra'ya giden her kart (Kemal, Selin, Sami, görev kartları): mesai içinde 3 saat cevap yoksa KARTIN KENDİSİ
// (fotoğraf + yazı + düğmeler) bir kez yeniden gönderilir — sohbetin en altında görünsün. Eski kartın üstüne "⏩ Güncel kart aşağıda"
// eklenir; eski düğmeler aynen çalışır (aynı düğme verisi → aynı sonuç; bot zaten karar verildiyse ikinci kez işlemez).
// Birden fazla bekleyen kart → tek mesajda toplu (albüm + numaralı düğmeler). Aynı kart en fazla 2 kez gider. Hatırlatma sadece
// hafta içi 09:00–20:00. Yine cevap yoksa Patron'a ara mesaj YOK; akşam 20:00 özetinde tek satır "Cevapsız: kim, hangi kart".
// Sami'nin deposu (StokDO) — kendi küçük çağrısı (döngüsel içe aktarma olmasın)
const stokIsteOrtak = async (env, yol, govde = {}) => (await env.STOK.get(env.STOK.idFromName("stok")).fetch(`https://stok${yol}`, { method: "POST", body: JSON.stringify(govde) })).json();
const SAAT_FARKI = 3 * 3600;
const kml = (x) => String(x || "").split(",").map((y) => y.trim()).filter(Boolean);
// Merdan / Hemra (ve ekip) kimlikleri — Patron hariç (Patron'a kart tekrarı yok)
export const ekipKimlikleri = (env) => { const p = kml(env.MURAT_ID); return [...new Set([env.ALLOWED_IDS, env.EKIP_IDS, env.FABRIKA_SORUMLU, env.BR_SORUMLU, env.HEMRA_ID, env.SAHIP_IDS, env.AZIZ_ID].flatMap(kml))].filter((x) => !p.includes(x)); };
export const KART_TEKRAR_SN = 3 * 3600;
export const GUNCEL = "kt:-"; // "⏩ Güncel kart aşağıda" (işlevsiz düğme; botlar "Güncel kart aşağıda" der)
const gun = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay();
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
export const mesaiMi = (t) => gun(t) >= 1 && gun(t) <= 5 && saat(t) >= 9 && saat(t) < 20;
// İki an arasında geçen MESAİ süresi (hafta içi 09–20), saniye
export function mesaiSuresi(bas, son) {
  let s = 0;
  const gunBasi = (t) => t - ((t + SAAT_FARKI) % 86400);
  for (let g = gunBasi(bas); g < son && s < 30 * 86400; g += 86400) {
    if (gun(g + 43200) < 1 || gun(g + 43200) > 5) continue;
    const a = Math.max(bas, g + 9 * 3600), b = Math.min(son, g + 20 * 3600);
    if (b > a) s += b - a;
  }
  return s;
}
// İş günü süresi (cumartesi-pazar sayılmaz), saniye — fabrika 24 saat kuralı
export function isGunuSuresi(bas, son) {
  let s = 0;
  const gunBasi = (t) => t - ((t + SAAT_FARKI) % 86400);
  for (let g = gunBasi(bas); g < son && s < 60 * 86400; g += 86400) {
    if (gun(g + 43200) < 1 || gun(g + 43200) > 5) continue;
    const a = Math.max(bas, g), b = Math.min(son, g + 86400);
    if (b > a) s += b - a;
  }
  return s;
}
// Düğme yazısı bilinmeyen eski kartlar için (düğme verisinden)
const ETIKET = [[/^y1:/, "✅ Paylaş"], [/^yd:/, "✏️ Düzelt"], [/^yg:/, "❌ Geç"], [/^so:/, "✅ Onayla, siteye yükle"], [/^sd:/, "✏️ Düzelt"], [/^sx:/, "❌ Ekleme"],
  [/^sv:/, "✅ Mağazada var"], [/^sy:/, "❌ Yok"], [/^sz:b:/, "⏳ Beklesin"], [/^sz:r:/, "🔁 Repete olacak"], [/^sz:s:/, "🗑 Sil"], [/^fk:b:/, "⏳ Beklesin"],
  [/^fk:r:/, "🔁 Repete ver"], [/^fk:s:/, "🗑️ Sil"], [/^rp1:/, "✅ Onayla"], [/^rpd:/, "✏️ Düzelt"], [/^rpx:/, "⏭️ Geç"], [/^rpb:/, "⏳ Beklesin"],
  [/^kk:.*:0$/, "❌ Hiçbiri"], [/^kk:.*:(\d+)$/, null], [/^fc:g:/, "✅ Gelecek"], [/^fc:r:/, "🔁 Repete olacak"], [/^fc:b:/, "❌ Bitti, gelmeyecek"], [/^fc:k:/, "📦 Repete geldi"]];
export function etiket(cb, i) {
  for (const [re, ad] of ETIKET) { const m = String(cb).match(re); if (m) return ad || `🖼 ${m[1]}. kare`; }
  return `Seçenek ${i + 1}`;
}
const cbListe = (r) => String(r.cb || "").split("|").filter(Boolean);
export const kopyaAnahtar = (chat, mesaj) => `kopya:${chat}:${mesaj}`;
// Gönderilen kartın kopyası (defterTg çağırır): yazı + düğmeler + fotoğraf (file_id / adres) — 3 gün
export async function kopyaKaydet(env, metod, govde, sonuc) {
  const r = sonuc && sonuc.result;
  if (!r || Array.isArray(r) || !govde.reply_markup || !govde.reply_markup.inline_keyboard) return;
  const foto = (r.photo && r.photo.length && r.photo[r.photo.length - 1].file_id) || (typeof govde.photo === "string" ? govde.photo : null);
  const video = (r.video && r.video.file_id) || null;
  await env.KAYIT.put(kopyaAnahtar(govde.chat_id, r.message_id), JSON.stringify({ metod, metin: String(govde.text || govde.caption || "").slice(0, 3500), klavye: govde.reply_markup.inline_keyboard, foto, video, parse_mode: govde.parse_mode || null }), { expirationTtl: 4 * 86400 }).catch(() => null);
}
// Kartın güncel düğmeleri: görev kartı (Sami) ise güncel durumdan, yoksa kopyadan, yoksa düğme verisinden
async function kartBilgisi(env, r) {
  const k = await env.KAYIT.get(kopyaAnahtar(r.chat, r.mesaj), "json").catch(() => null);
  const cb = cbListe(r);
  const g = cb.find((x) => /^vg:[^:]+:\d+:/.test(x));
  if (g) { const [, gid, n] = g.split(":"); const gk = await env.KAYIT.get(`gorevklavye:${gid}:${Math.floor(Number(n) / 10)}`, "json").catch(() => null); if (gk) return { ...(k || {}), klavye: gk }; }
  if (k) return k;
  return { metin: r.ozet || "", klavye: cb.map((x, i) => [{ text: etiket(x, i), callback_data: x }]), eski: true };
}
const acik = (klavye) => (klavye || []).map((s) => s.filter((b) => b && (b.url || (b.callback_data && b.callback_data !== "vg:-" && b.callback_data !== GUNCEL)))).filter((s) => s.length);
// Her bot kendi cron'unda: kime = Merdan/Hemra kimlikleri; tg = botun telegram işlevi (defter kaydı atlanır: env.__kartTekrar)
export async function kartTekrarAdimi(env, bot, tg, simdi, { stokIste = stokIsteOrtak, kimler = ekipKimlikleri(env) } = {}) {
  if (!mesaiMi(simdi) || !env.STOK) return 0;
  const l = await stokIste(env, "/isd-bekleyen", { enEski: simdi - 3 * 86400, bot }).catch(() => []);
  const hedef = new Set((kimler || []).map(String).filter(Boolean));
  const vade = (Array.isArray(l) ? l : []).filter((r) => r.bot === bot && hedef.has(String(r.kime)) && !Number(r.hatirlatildi) && r.mesaj && mesaiSuresi(r.zaman, simdi) >= KART_TEKRAR_SN);
  if (!vade.length) return 0;
  const sessiz = { ...env, __kartTekrar: true };
  const kisiye = {};
  for (const r of vade) (kisiye[r.chat] = kisiye[r.chat] || []).push(r);
  let n = 0;
  for (const [chat, kartlar] of Object.entries(kisiye)) {
    const bilgiler = [];
    for (const r of kartlar.slice(0, 8)) { const b = await kartBilgisi(env, r); if (acik(b.klavye).length) bilgiler.push({ r, b }); }
    if (!bilgiler.length) { await stokIste(env, "/isd-isaretle", { idler: kartlar.map((r) => r.id), alan: "hatirlatildi" }).catch(() => null); continue; }
    if (bilgiler.length === 1) {
      const { r, b } = bilgiler[0];
      const bas = `🔁 Hatırlatma — cevabınızı bekliyor:\n`;
      if (b.foto) await tg(sessiz, "sendPhoto", { chat_id: chat, photo: b.foto, caption: (bas + b.metin).slice(0, 1024), reply_markup: { inline_keyboard: acik(b.klavye) } });
      else if (b.eski) await tg(sessiz, "copyMessage", { chat_id: chat, from_chat_id: chat, message_id: r.mesaj, reply_markup: { inline_keyboard: acik(b.klavye) } });
      else await tg(sessiz, "sendMessage", { chat_id: chat, text: (bas + b.metin).slice(0, 4000), reply_markup: { inline_keyboard: acik(b.klavye) }, disable_web_page_preview: true });
    } else {
      const fotolar = bilgiler.map(({ r, b }, i) => (b.foto ? { type: "photo", media: b.foto, caption: `${i + 1} · ${r.kod || ""}`.trim() } : null)).filter(Boolean).slice(0, 10);
      if (fotolar.length > 1) await tg(sessiz, "sendMediaGroup", { chat_id: chat, media: fotolar });
      else if (fotolar.length === 1) await tg(sessiz, "sendPhoto", { chat_id: chat, photo: fotolar[0].media, caption: fotolar[0].caption });
      const satir = [`🔁 Hatırlatma — ${bilgiler.length} kart cevabınızı bekliyor:`, ...bilgiler.map(({ r, b }, i) => `${i + 1}. ${String(b.eski ? r.ozet : b.metin.split("\n").filter(Boolean).slice(0, 2).join(" · ")).slice(0, 160)}`)];
      const klavye = bilgiler.flatMap(({ b }, i) => acik(b.klavye).map((s) => s.map((x) => ({ ...x, text: `${i + 1}· ${x.text}`.slice(0, 64) })))).slice(0, 90);
      await tg(sessiz, "sendMessage", { chat_id: chat, text: satir.join("\n").slice(0, 4000), reply_markup: { inline_keyboard: klavye }, disable_web_page_preview: true });
    }
    // eski kartlar: üstte "⏩ Güncel kart aşağıda", düğmeleri aynen (basılırsa aynı sonuç)
    for (const { r, b } of bilgiler) await tg(sessiz, "editMessageReplyMarkup", { chat_id: chat, message_id: r.mesaj, reply_markup: { inline_keyboard: [[{ text: "⏩ Güncel kart aşağıda", callback_data: GUNCEL }], ...acik(b.klavye)] } }).catch(() => null);
    await stokIste(env, "/isd-isaretle", { idler: kartlar.map((r) => r.id), alan: "hatirlatildi", deger: simdi }).catch(() => null);
    n += bilgiler.length;
  }
  return n;
}
// 9 Kasım (ekip düzeni): Hemra'nın seçtiği kişiye kartın KENDİSİ — StokDO kuyruğu "kartIlet:<bot>" ({ chat, mesaj, isdId, hedef, kim })
export async function kartIletAdimi(env, bot, tg, { stokIste = stokIsteOrtak } = {}) {
  const l = await stokIste(env, "/kuyruk-al", { ad: `kartIlet:${bot}` }).catch(() => []);
  for (const x of Array.isArray(l) ? l : []) {
    const b = await kartBilgisi(env, { chat: x.chat, mesaj: x.mesaj, cb: x.cb || "", ozet: x.ozet || "" });
    const kl = { inline_keyboard: acik(b.klavye) };
    const bas = `📋 ${x.kim || "Hemra"} sana verdi:\n`;
    if (b.foto) await tg(env, "sendPhoto", { chat_id: x.hedef, photo: b.foto, caption: (bas + b.metin).slice(0, 1024), reply_markup: kl });
    else if (b.eski && x.chat && x.mesaj) await tg(env, "copyMessage", { chat_id: x.hedef, from_chat_id: x.chat, message_id: x.mesaj, reply_markup: kl });
    else await tg(env, "sendMessage", { chat_id: x.hedef, text: (bas + (b.metin || x.ozet || "")).slice(0, 4000), reply_markup: kl, disable_web_page_preview: true });
    if (x.isdId) await stokIste(env, "/isd-isaretle", { idler: [x.isdId], alan: "durum", deger: "devredildi" }).catch(() => null);
  }
  return Array.isArray(l) ? l.length : 0;
}
// Akşam özeti (Venom): tekrar gönderildiği hâlde hâlâ cevapsız kartlar → "Cevapsız: kim, hangi kart"
export function cevapsizSatiri(bekleyen, adlar, simdi) {
  const kisi = {};
  for (const r of bekleyen || []) {
    const ad = adlar[String(r.kime)];
    if (!ad || !Number(r.hatirlatildi) || simdi - Number(r.hatirlatildi) < 1800) continue;
    (kisi[ad] = kisi[ad] || []).push(`${r.bot[0].toUpperCase()}${r.bot.slice(1)}${r.kod ? ` ${r.kod}` : ""}`);
  }
  const p = Object.entries(kisi).map(([a, l]) => `${a} — ${[...new Set(l)].slice(0, 8).join(", ")}${l.length > 8 ? " …" : ""}`);
  return p.length ? `📌 Cevapsız: ${p.join("; ")}` : null;
}
