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
