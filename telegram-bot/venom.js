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
  satir.push("", sorunlar.length ? "⚠️ Kontrollerde yakalananlar:" : "✅ Kontroller temiz: stoksuz paylaşım yok, sitede fiyatlar doğru.");
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
