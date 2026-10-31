// VENOM EKİP — sabah raporları ("Venom Ekip" Telegram grubu).
// 09:05 Sami (stok + kontroller) · 09:15 Kemal (kanal) · 09:25 Selin (site) · 09:40 toplu rapor (Kemal'in
// botundan, kısa yapay zekâ yorumuyla). Botlar Telegram'da birbirinin mesajını göremez; arka planda ortak
// hafıza üzerinden haberleşir: her biri raporunun özetini KV'de "venom:rapor:<bot>:<gün>" olarak bırakır.

import Anthropic from "@anthropic-ai/sdk";
import { sinirAsildiMi, harcamaEkle } from "./harcama.js";

const SAAT_FARKI = 3 * 3600;
export const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
export const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const kimlikler = (y) => String(y || "").split(",").map((x) => x.trim()).filter(Boolean);
const gunGoster = (t) => gunAnahtari(t).split("-").reverse().join(".");

// Grup kaydı (bot gruba yönetici tarafından eklenince). Yoksa yöneticilere özel mesaj.
export async function grubaGonder(env, bot, metin, tgf) {
  const grup = await env.KAYIT.get(`venom:grup:${bot}`);
  const hedefler = grup ? [Number(grup)] : kimlikler(env.ALLOWED_IDS);
  for (const h of hedefler) await tgf(env, "sendMessage", { chat_id: h, text: metin.slice(0, 4000), disable_web_page_preview: true });
}

export async function grupUyeligi(m, env, bot, adi, tgf) {
  if (!m.chat || !["group", "supergroup"].includes(m.chat.type)) return false;
  const durum = m.new_chat_member && m.new_chat_member.status;
  const yonetici = kimlikler(env.ALLOWED_IDS).includes(String(m.from && m.from.id));
  if (["member", "administrator"].includes(durum) && yonetici) {
    await env.KAYIT.put(`venom:grup:${bot}`, String(m.chat.id));
    await tgf(env, "sendMessage", { chat_id: m.chat.id, text: `${adi} gruba katıldı. Her sabah raporumu buraya yazacağım.` });
  } else if (["left", "kicked"].includes(durum) && (await env.KAYIT.get(`venom:grup:${bot}`)) === String(m.chat.id)) {
    await env.KAYIT.delete(`venom:grup:${bot}`);
  }
  return true;
}

// Rapor saati geldi mi ve bugün gönderildi mi? (bayrak botun kendi deposunda)
export async function raporZamani(env, simdi, [s, d], bayrak) {
  const su = saat(simdi);
  if (su < s + d / 60 || su >= 10.5) return false;
  const anahtar = `${bayrak}:${gunAnahtari(simdi)}`;
  if (await env.KAYIT.get(anahtar)) return false;
  await env.KAYIT.put(anahtar, "1", { expirationTtl: 3 * 86400 });
  return true;
}

export async function raporuBirak(env, bot, simdi, { ozet, sorunlar = [], yapilacak = [] }) {
  await env.KAYIT.put(`venom:rapor:${bot}:${gunAnahtari(simdi)}`, JSON.stringify({ ozet, sorunlar, yapilacak }), { expirationTtl: 3 * 86400 });
}

// 09:40 — toplu rapor: üç botun özetleri + kontrollerde yakalananlar + yapay zekâ yorumu.
export async function topluRapor(env, simdi, tgf) {
  const gun = gunAnahtari(simdi);
  const oku = async (bot) => (await env.KAYIT.get(`venom:rapor:${bot}:${gun}`, "json")) || null;
  const r = { sami: await oku("sami"), kemal: await oku("kemal"), selin: await oku("selin") };
  const ad = { sami: "📦 Sami", kemal: "🤖 Kemal", selin: "🌸 Selin" };
  const satir = [`🧭 VENOM — ${gunGoster(simdi)} toplu rapor`, ""];
  for (const b of ["sami", "kemal", "selin"]) satir.push(`${ad[b]}: ${r[b] ? r[b].ozet : "rapor gelmedi ⚠️"}`);
  const sorunlar = ["sami", "kemal", "selin"].flatMap((b) => (r[b] ? r[b].sorunlar.map((x) => `${ad[b]} → ${x}`) : []));
  const yapilacak = ["sami", "kemal", "selin"].flatMap((b) => (r[b] ? r[b].yapilacak : []));
  satir.push("", sorunlar.length ? "⚠️ Kontrollerde yakalananlar:" : "✅ Kontroller temiz: stoksuz paylaşım yok, sitede fiyat görünmüyor.");
  for (const x of sorunlar) satir.push(`• ${x}`);
  if (yapilacak.length) satir.push("", "📋 Bugün yapılacaklar:", ...yapilacak.map((x) => `• ${x}`));
  const yorum = await yapayZekaYorumu(env, simdi, satir.join("\n")).catch(() => null);
  if (yorum) satir.push("", `💬 ${yorum}`);
  await grubaGonder(env, "kemal", satir.join("\n"), tgf);
}

async function yapayZekaYorumu(env, simdi, metin) {
  if (!env.ANTHROPIC_API_KEY || (await sinirAsildiMi(env, simdi))) return null;
  const model = env.MUSTERI_MODEL || "claude-sonnet-5-5"; // kısa yorum: ekonomik model
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 40_000 });
  const r = await client.messages.create({
    model, max_tokens: 400,
    messages: [{ role: "user", content: `VOLONTE (İstanbul, toptan kadın giyim) iş sisteminin bugünkü toplu raporu aşağıda. Sahibine sade Türkçe ile en fazla 3 kısa cümlelik yorum yaz: en önemli konu ne, bugün neye öncelik vermeli. Uydurma bilgi ekleme, sadece rapordakileri kullan. Vegawin'de bir şey değiştirmeyi asla önerme (sadece okunur).\n\n${metin}` }],
  });
  await harcamaEkle(env, model, r.usage, simdi);
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim().slice(0, 600) || null;
}

// Her ayın 1'i 09:45 — aylık harcama raporu (kullanıcı kararı 28 Ekim: 60 $ kasa kaldırıldı, her ay rapor verilecek).
// Claude (Kemal + Selin + Defne, aylık sınır harcama.js) ve üretim araçları (fal.ai, uretim.js) ayrı ayrı.
export function aylikRaporMetni(simdi, { claude, uretim, claudeSinir }) {
  const ay = new Date((simdi + SAAT_FARKI - 86400) * 1000).toISOString().slice(0, 7);
  const [y, a] = ay.split("-");
  const toplam = claude + uretim;
  return [
    `💰 VENOM — ${a}.${y} aylık harcama raporu`,
    "",
    `• Claude (Kemal, Selin, Sami raporları, kontroller): ${claude.toFixed(2)} $ (aylık sınır ${claudeSinir} $)`,
    `• Üretim araçları (fal.ai: fotoğraf/video): ${uretim.toFixed(2)} $`,
    `• Cloudflare, GitHub, Telegram: 0 $ (ücretsiz paket)`,
    "",
    `Toplam: ${toplam.toFixed(2)} $`,
    "Not: fal.ai tutarı Selin'in tahminidir; kesin tutar fal.ai panelinde.",
  ].join("\n");
}

export async function aylikRapor(env, simdi, tgf, claudeSinir) {
  if (gunAnahtari(simdi).slice(8) !== "01") return;
  if (!(await raporZamani(env, simdi, [9, 45], "venom:aylikRapor"))) return;
  const gecenAy = new Date((simdi + SAAT_FARKI - 86400) * 1000).toISOString().slice(0, 7);
  const claude = Number((await env.KAYIT.get(`harcama:${gecenAy}`)) || 0) / 1e6;
  const uretim = Number((await env.KAYIT.get(`uretim-harcama:${gecenAy}`)) || 0);
  await grubaGonder(env, "kemal", aylikRaporMetni(simdi, { claude, uretim, claudeSinir }), tgf);
}

// ---------- Birikmiş mesaj koruması (28 Ekim) ----------
// Cloudflare sınırı yüzünden işlenemeyen mesajları Telegram sonradan toplu gönderir. Koruma açıkken
// ("venom:birikim:<bot>"): eski mesajlara HİÇBİR otomatik cevap gitmez; ekipten gelenler atlanır, müşteri
// mesajları "venom:birikmis:<bot>" listesine yazılır ve kuyruk boşalınca liste yöneticilere gönderilir
// (cevaplar sahibin onayıyla). Kanal paylaşımları ve üyelik olayları normal işlenir (cevap değil, kayıt).
// kesim: botların veritabanı yeniden çalıştığı an; ondan önceki her mesaj "birikmiş" sayılır.
export async function birikimSuzgeci(env, bot, u, izinliMi, tgf) {
  const bayrak = await env.KAYIT.get(`venom:birikim:${bot}`, "json");
  if (!bayrak) return false;
  if (u.callback_query) {
    await tgf(env, "answerCallbackQuery", { callback_query_id: u.callback_query.id, text: "Bu düğmeye bot dururken basılmış. Lütfen birkaç dakika sonra yeniden basın.", show_alert: true }).catch(() => {});
    return true;
  }
  const m = u.message || u.edited_message;
  if (!m) return false; // kanal paylaşımı, üyelik, tepki: normal işlenir
  if (bayrak.kesim && m.date >= bayrak.kesim) return false; // yeni mesaj
  if (m.from && izinliMi(m.from.id)) return true; // ekip: sessizce atlanır (gerekirse yeniden yazar)
  const liste = (await env.KAYIT.get(`venom:birikmis:${bot}`, "json")) || [];
  liste.push({
    zaman: m.date, sohbet: m.chat.id, tur: m.chat.type, mesaj: m.message_id,
    ad: m.from ? [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") : (m.chat.title || ""),
    kullanici: (m.from && m.from.username) || null,
    metin: String(m.text || m.caption || "").slice(0, 300), medya: Boolean(m.photo || m.video || m.document || m.voice),
  });
  await env.KAYIT.put(`venom:birikmis:${bot}`, JSON.stringify(liste.slice(-200)), { expirationTtl: 14 * 86400 });
  return true;
}

// 5 dakikalık görevde: veritabanı çalışınca "kesim" konur; Telegram kuyruğu boşalınca koruma kalkar ve
// (Kemal için) biriken müşteri mesajları listesi yöneticilere gider.
export async function birikimAdimi(env, bot, simdi, tgf) {
  const bayrak = await env.KAYIT.get(`venom:birikim:${bot}`, "json");
  if (!bayrak) return;
  if (!bayrak.kesim) {
    if (!env.STOK) return;
    const r = await env.STOK.get(env.STOK.idFromName("stok")).fetch("https://stok/ayar-oku", { method: "POST", body: JSON.stringify({ k: "saglik" }) }).catch(() => null);
    if (!r || !r.ok) return; // Cloudflare sınırı sürüyor
    bayrak.kesim = simdi;
    await env.KAYIT.put(`venom:birikim:${bot}`, JSON.stringify(bayrak));
    return;
  }
  if (simdi - bayrak.kesim < 120) return;
  const w = await tgf(env, "getWebhookInfo", {});
  if (!w || !w.ok || (w.result.pending_update_count || 0) > 0) return;
  await env.KAYIT.delete(`venom:birikim:${bot}`);
  if (bot !== "kemal") return;
  const liste = (await env.KAYIT.get(`venom:birikmis:${bot}`, "json")) || [];
  const saatYaz = (t) => { const d = new Date((t + SAAT_FARKI) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`; };
  const satirlar = liste.map((x, i) => `${i + 1}) ${saatYaz(x.zaman)} ${x.ad}${x.kullanici ? ` (@${x.kullanici})` : ""}${x.tur !== "private" ? " [grup]" : ""}: ${x.metin || (x.medya ? "[fotoğraf/video]" : "[boş]")}`);
  const metin = liste.length
    ? `✅ Kemal, Selin ve Sami yeniden çalışıyor.\n\n📨 Bot dururken gelen ${liste.length} müşteri mesajı (HİÇBİRİNE otomatik cevap gitmedi):\n\n${satirlar.join("\n")}\n\nHangilerine ne cevap gidecekse söyleyin; onayınız olmadan kimseye yazılmaz.`
    : "✅ Kemal, Selin ve Sami yeniden çalışıyor. Bot dururken müşteriden mesaj gelmemiş.";
  for (const k of kimlikler(env.ALLOWED_IDS)) {
    for (let i = 0; i < metin.length; i += 3900) await tgf(env, "sendMessage", { chat_id: k, text: metin.slice(i, i + 3900), disable_web_page_preview: true });
  }
}

// Tek seferlik deneme (31 Ekim): KV "venom:patronDeneme:<bot>" varsa Patron hesabına "Patron hesabı bağlandı ✅" gider;
// sonuç "venom:patronDeneme:<bot>:sonuc" (Telegram'ın cevabı). Patron = MURAT_ID'nin ilki (yoksa ALLOWED_IDS'in ilki).
export async function patronDenemesi(env, bot, tgf) {
  const k = `venom:patronDeneme:${bot}`;
  if (!(await env.KAYIT.get(k))) return;
  await env.KAYIT.delete(k);
  const id = String(env.MURAT_ID || env.ALLOWED_IDS || "").split(",")[0].trim();
  const r = await tgf(env, "sendMessage", { chat_id: id, text: `Patron hesabı bağlandı ✅ — ${bot}` }).catch((e) => ({ ok: false, description: String(e.message || e) }));
  await env.KAYIT.put(`${k}:sonuc`, JSON.stringify({ ok: Boolean(r && r.ok), hata: (r && r.description) || null }), { expirationTtl: 7 * 86400 });
}
