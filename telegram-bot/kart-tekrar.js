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
export async function kartTekrarAdimi(env, bot, tg, simdi, { stokIste = stokIsteOrtak, kimler = ekipKimlikleri(env), zorla = false } = {}) {
  // 12 Kasım (Patron, C11): zamanlı iş eski kartı YENİDEN GÖNDERMEZ ve düzenlemez (3372 iki kez gitmişti). Cevapsız kartı Sami'nin kart
  // takibi tek satır yazıyla hatırlatır (30 dk), 1 saat sonra Venom araştırır. Bu adım sadece açıkça istenirse (zorla) çalışır.
  if (!zorla) return 0;
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
    // 10 Kasım (Patron): bir kişiye aynı anda en fazla 5 kart — hatırlatılıp hâlâ cevapsız olanlar sayılır, kalanlar cevap verdikçe
    const zatenAcik = (Array.isArray(l) ? l : []).filter((r) => r.bot === bot && String(r.chat) === String(chat) && Number(r.hatirlatildi) > simdi - 86400).length;
    const yer = Math.max(0, 5 - zatenAcik);
    if (!yer) continue;
    const bilgiler = [];
    for (const r of kartlar.slice(0, 8)) { if (bilgiler.length >= yer) break; const b = await kartBilgisi(env, r); if (acik(b.klavye).length) bilgiler.push({ r, b }); }
    if (!bilgiler.length) { await stokIste(env, "/isd-isaretle", { idler: kartlar.map((r) => r.id), alan: "hatirlatildi" }).catch(() => null); continue; }
    // 10 Kasım (Patron, ACİL): her kart TEK mesaj — fotoğraf + altında yazı + düğmeler (albüm + ayrı düğme mesajı YOK: düğme
    // mesajı düşünce fotoğraf yarım kalıyordu). Gönderim doğrulanır; olmazsa yazıyla yeniden; yine olmazsa Venom'a hata.
    if (bilgiler.length > 1 || kartlar.length > bilgiler.length) await tg(sessiz, "sendMessage", { chat_id: chat, text: `🔁 Hatırlatma — toplam ${kartlar.length} kart cevabınızı bekliyor${kartlar.length > bilgiler.length ? ` (ilk ${bilgiler.length} aşağıda; kalanlar cevap verdikçe gelir)` : " (aşağıda, her biri ayrı kart)"}:` });
    const giden = [];
    for (const [i, { r, b }] of bilgiler.entries()) {
      const bas = bilgiler.length > 1 ? `🔁 ${i + 1}/${bilgiler.length} — cevabınızı bekliyor:\n` : `🔁 Hatırlatma — cevabınızı bekliyor:\n`;
      const ok = await tamKartGonder(env, tg, sessiz, chat, r, b, bas, bot);
      if (ok) giden.push({ r, b });
    }
    // eski kartlar: üstte "⏩ Güncel kart aşağıda", düğmeleri aynen (basılırsa aynı sonuç)
    for (const { r, b } of giden) await tg(sessiz, "editMessageReplyMarkup", { chat_id: chat, message_id: r.mesaj, reply_markup: { inline_keyboard: [[{ text: "⏩ Güncel kart aşağıda", callback_data: GUNCEL }], ...acik(b.klavye)] } }).catch(() => null);
    if (giden.length) await stokIste(env, "/isd-isaretle", { idler: giden.map(({ r }) => r.id), alan: "hatirlatildi", deger: simdi }).catch(() => null);
    const dugmesiz = []; // düğmesi kalmamış kartlar: hatırlatma yok (sırası gelmeyenler beklemede kalır)
    for (const r of kartlar.filter((r) => !bilgiler.some((x) => x.r.id === r.id)).slice(0, 8)) { const b = await kartBilgisi(env, r); if (!acik(b.klavye).length) dugmesiz.push(r); }
    if (dugmesiz.length) await stokIste(env, "/isd-isaretle", { idler: dugmesiz.map((r) => r.id), alan: "hatirlatildi", deger: simdi }).catch(() => null);
    n += giden.length;
  }
  return n;
}
const KISI_AD = (env, chat) => ([["BR_SORUMLU", "Merdan"], ["HEMRA_ID", "Hemra"], ["FABRIKA_SORUMLU", "Hemra"], ["AZIZ_ID", "Aziz"]].find(([k]) => kml(env[k]).includes(String(chat))) || [null, "kişi"])[1];
// Kartın TAMAMI tek mesajda; Telegram "ok" dönmezse yazıyla bir kez daha; yine olmazsa Venom'a "X'e kart gitmedi" (kendi hata kaydı)
export async function tamKartGonder(env, tg, sessiz, chat, r, b, bas, bot) {
  const kl = { inline_keyboard: acik(b.klavye) };
  let s = null;
  if (b.foto) s = await tg(sessiz, "sendPhoto", { chat_id: chat, photo: b.foto, caption: (bas + b.metin).slice(0, 1024), reply_markup: kl, ...(b.parse_mode ? { parse_mode: b.parse_mode } : {}) });
  else if (b.video) s = await tg(sessiz, "sendVideo", { chat_id: chat, video: b.video, caption: (bas + b.metin).slice(0, 1024), reply_markup: kl });
  else if (b.eski && r.mesaj) s = await tg(sessiz, "copyMessage", { chat_id: chat, from_chat_id: chat, message_id: r.mesaj, reply_markup: kl });
  if (!(s && s.ok)) s = await tg(sessiz, "sendMessage", { chat_id: chat, text: (bas + (b.metin || r.ozet || "")).slice(0, 4000), reply_markup: kl, disable_web_page_preview: true });
  if (s && s.ok) {
    const l = (await env.KAYIT.get(`${bot}:tekrarGiden`, "json").catch(() => null)) || [];
    await env.KAYIT.put(`${bot}:tekrarGiden`, JSON.stringify([...l, { zaman: Math.floor(Date.now() / 1000), chat: String(chat), mesaj: s.result && s.result.message_id, kod: r.kod || null, ozet: String(b.metin || r.ozet || "").split("\n")[0].slice(0, 60) }].slice(-200)), { expirationTtl: 14 * 86400 }).catch(() => null);
    return true;
  }
  const hata = `${KISI_AD(env, chat)}'a kart gitmedi (${bot}${r.kod ? ` · ${r.kod}` : ""}): ${String((s && s.description) || "Telegram cevap vermedi").slice(0, 160)}`;
  await env.KAYIT.put(`${bot}:hata`, JSON.stringify({ zaman: Math.floor(Date.now() / 1000), hata }), { expirationTtl: 7 * 86400 }).catch(() => null);
  const y = (await env.KAYIT.get("venom:yetenekIstekleri", "json").catch(() => null)) || [];
  await env.KAYIT.put("venom:yetenekIstekleri", JSON.stringify([...y, { zaman: Math.floor(Date.now() / 1000), istek: `KART GİTMEDİ: ${hata}` }].slice(-100))).catch(() => null);
  return false;
}
// Bir kez (Claude Code, 10 Kasım ACİL): KV "<bot>:kartTamamla" = { kim: "BR_SORUMLU", bas, bit } → o kişinin cevapsız kartlarından
// toplu hatırlatmada YARIM kalanlar (hatirlatildi bas–bit arası) TEK mesaj tam kart olarak yeniden. Sonuç "<bot>:kartTamamlaSonuc".
export async function kartTamamlaAdimi(env, bot, tg, simdi, { stokIste = stokIsteOrtak } = {}) {
  const is = await env.KAYIT.get(`${bot}:kartTamamla`, "json").catch(() => null);
  if (!is) return 0;
  await env.KAYIT.delete(`${bot}:kartTamamla`).catch(() => null);
  const kime = kml(env[is.kim])[0] || String(is.kim || "");
  const l = await stokIste(env, "/isd-bekleyen", { enEski: simdi - 3 * 86400, bot }).catch(() => []);
  const hedef = (Array.isArray(l) ? l : []).filter((r) => r.bot === bot && String(r.kime) === kime && r.mesaj && (is.hepsi || (Number(r.hatirlatildi) >= (is.bas || 0) && Number(r.hatirlatildi) <= (is.bit || simdi))));
  const sessiz = { ...env, __kartTekrar: true };
  const sonuc = [];
  if (hedef.length) await tg(sessiz, "sendMessage", { chat_id: kime, text: `📋 ${hedef.length} kart cevabınızı bekliyor — önceki hatırlatma yarım gitmişti, kartlar aşağıda tam haliyle:` });
  for (const [i, r] of hedef.slice(0, 5).entries()) { // 10 Kasım: en fazla 5
    const b = await kartBilgisi(env, r);
    if (!acik(b.klavye).length) { sonuc.push({ kod: r.kod, ozet: String(r.ozet || "").slice(0, 60), sonuc: "düğmesi yok (kapanmış)" }); continue; }
    const ok = await tamKartGonder(env, tg, sessiz, kime, r, b, `📋 ${i + 1}/${hedef.length}\n`, bot);
    sonuc.push({ kod: r.kod, ozet: String(r.ozet || "").slice(0, 60), sonuc: ok ? "tam gitti" : "gitmedi" });
  }
  await env.KAYIT.put(`${bot}:kartTamamlaSonuc`, JSON.stringify({ zaman: simdi, kime: is.kim, sonuc }), { expirationTtl: 7 * 86400 }).catch(() => null);
  return sonuc.length;
}
// 9 Kasım (ekip düzeni): Hemra'nın seçtiği kişiye kartın KENDİSİ — StokDO kuyruğu "kartIlet:<bot>" ({ chat, mesaj, isdId, hedef, kim })
// 12 Kasım (Patron, C10): karar verilen modelin kartları telefonlarda da kapanır — düğmeler tek "✔ Karar verildi" satırına iner (yazı aynen kalır)
export async function kartKapatAdimi(env, bot, tg, { stokIste = stokIsteOrtak } = {}) {
  const l = await stokIste(env, "/kuyruk-al", { ad: `kartKapat:${bot}` }).catch(() => []);
  let n = 0;
  for (const x of Array.isArray(l) ? l : []) {
    const r = await tg(env, "editMessageReplyMarkup", { chat_id: x.chat, message_id: x.mesaj, reply_markup: { inline_keyboard: [[{ text: String(x.yazi || "✔ Karar verildi").slice(0, 60), callback_data: "vg:-" }]] } }).catch(() => null);
    if (r && r.ok) n++;
  }
  return n;
}
export async function kartIletAdimi(env, bot, tg, { stokIste = stokIsteOrtak } = {}) {
  await kartKapatAdimi(env, bot, tg, { stokIste }).catch(() => 0);
  const l = await stokIste(env, "/kuyruk-al", { ad: `kartIlet:${bot}` }).catch(() => []);
  for (const x of Array.isArray(l) ? l : []) {
    const b = await kartBilgisi(env, { chat: x.chat, mesaj: x.mesaj, cb: x.cb || "", ozet: x.ozet || "" });
    const kl = { inline_keyboard: acik(b.klavye) };
    const bas = `📋 ${x.kim || "Hemra"} sana verdi:\n`;
    if (b.eski && x.chat && x.mesaj && !b.foto) { const s2 = await tg(env, "copyMessage", { chat_id: x.hedef, from_chat_id: x.chat, message_id: x.mesaj, reply_markup: kl }); if (!(s2 && s2.ok)) await tamKartGonder(env, tg, env, x.hedef, { kod: x.kod || null, ozet: x.ozet || "" }, { ...b, eski: false }, bas, bot); }
    else await tamKartGonder(env, tg, env, x.hedef, { kod: x.kod || null, ozet: x.ozet || "", mesaj: x.mesaj }, { ...b, eski: false }, bas, bot); // 10 Kasım: doğrulanır
    if (x.isdId) await stokIste(env, "/isd-isaretle", { idler: [x.isdId], alan: "durum", deger: "devredildi" }).catch(() => null);
  }
  return Array.isArray(l) ? l.length : 0;
}
// Bir kez (Claude Code): KV "venom:kisiKontrol:<bot>" = ["AZIZ_ID", …] → bu bot o kişiye ulaşabiliyor mu (kişi /start yazmış mı)?
// Sonuç "venom:kisiKontrolSonuc:<bot>" = { AZIZ_ID: true|false } (kimlik yazılmaz)
export async function kisiKontrolAdimi(env, bot, tg) {
  const l = await env.KAYIT.get(`venom:kisiKontrol:${bot}`, "json").catch(() => null);
  if (!Array.isArray(l)) return;
  await env.KAYIT.delete(`venom:kisiKontrol:${bot}`).catch(() => null);
  const c = {};
  for (const ad of l.slice(0, 8)) { const id = kml(env[ad])[0]; if (!id) { c[ad] = "kayıt yok"; continue; } const r = await tg({ ...env, __kartTekrar: true }, "sendChatAction", { chat_id: id, action: "typing" }).catch(() => null); c[ad] = Boolean(r && r.ok); }
  await env.KAYIT.put(`venom:kisiKontrolSonuc:${bot}`, JSON.stringify({ zaman: Math.floor(Date.now() / 1000), c }), { expirationTtl: 86400 });
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
