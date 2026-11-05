// Yapay zekâ istemcisi (5 Kasım): botun KENDİ anahtarı varsa onu, yoksa Pelin'in anahtar köprüsünü (servis bağlantısı ANAHTAR) kullanır.
import Anthropic from "@anthropic-ai/sdk";
export const claudeVar = (env) => Boolean(env.ANTHROPIC_API_KEY || env.ANAHTAR);
export function claudeIstemci(env, secenek = {}) {
  if (env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...secenek });
  if (env.ANAHTAR) return new Anthropic({ apiKey: "kopru", baseURL: "https://kopru/anthropic", fetch: (u, i) => env.ANAHTAR.fetch(String(u), i), ...secenek });
  return null;
}
export const openaiVar = (env) => Boolean(env.OPENAI_API_KEY || env.ANAHTAR);
export function openaiFetch(env, yol, init = {}) {
  if (env.OPENAI_API_KEY) return fetch(`https://api.openai.com${yol}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}` } });
  if (env.ANAHTAR) return env.ANAHTAR.fetch(`https://kopru/openai${yol}`, init);
  return Promise.resolve(new Response("anahtar yok", { status: 503 }));
}
// 6 Kasım (Venom "Invalid signature in thinking block" 400'ü): araç döngüsünde Claude'un düşünme blokları konuşmaya bağlıdır;
// sistem metni/geçmiş istekler arasında değişirse API isteği REDDEDİYORDU → Patron'un mesajı cevapsız kalıyordu.
// Artık: (1) eşleşmeyen düşünme bloğu hata yerine düşürülür (drop_block), (2) yine de imza hatası gelirse düşünme blokları
// çıkarılıp bir kez daha denenir. Böylece mesaj asla bu sebeple cevapsız kalmaz.
export const DUSUNME_BETA = "thinking-binding-controls-2026-08-01";
const imzaHatasi = (e) => e && e.status === 400 && /signature/i.test(String(e.message || "")) && /thinking/i.test(String(e.message || ""));
const betaYok = (e) => e && e.status === 400 && /thinking-binding-controls|block_binding|anthropic-beta|unexpected beta|unknown beta/i.test(String(e.message || "")) && !/signature/i.test(String(e.message || ""));
export const dusunmesiz = (mesajlar) => mesajlar.map((m) => (Array.isArray(m.content) && m.role === "assistant" ? { ...m, content: m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking") } : m));
export async function claudeTur(client, istek) {
  const beta = () => client.beta.messages.create({ ...istek, betas: [DUSUNME_BETA], thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } });
  try { return await beta(); } catch (e) {
    if (betaYok(e)) { // beta kapalıysa eski çağrı, imza hatasında düşünmesiz tekrar
      try { return await client.messages.create(istek); } catch (e2) { if (imzaHatasi(e2)) return client.messages.create({ ...istek, messages: dusunmesiz(istek.messages) }); throw e2; }
    }
    if (imzaHatasi(e)) return client.beta.messages.create({ ...istek, betas: [DUSUNME_BETA], messages: dusunmesiz(istek.messages) });
    throw e;
  }
}
