// ANAHTAR KÖPRÜSÜ (5 Kasım, Patron: "mevcut anahtarlar kullanılsın, yeni anahtar gerekmesin"): Venom, Pelin'deki
// ANTHROPIC_API_KEY ve OPENAI_API_KEY'i bu iç bağlantıyla kullanır. Anahtar Pelin'den ÇIKMAZ: istek buraya gelir, anahtar
// burada eklenir, sadece api.anthropic.com ve api.openai.com'a gider. İnternetten erişilemez (sadece servis bağlantısı).
export const KOPRU_HEDEF = { anthropic: "https://api.anthropic.com", openai: "https://api.openai.com" };
export async function kopruIstegi(env, istek) {
  const url = new URL(istek.url);
  const [, hedef, ...yol] = url.pathname.split("/");
  if (!KOPRU_HEDEF[hedef]) return new Response("izin yok", { status: 403 });
  const h = new Headers(istek.headers);
  for (const k of ["x-api-key", "authorization", "host", "cf-connecting-ip", "x-forwarded-for"]) h.delete(k);
  if (hedef === "anthropic") { if (!env.ANTHROPIC_API_KEY) return new Response("anahtar yok", { status: 503 }); h.set("x-api-key", String(env.ANTHROPIC_API_KEY).trim()); }
  if (hedef === "openai") { if (!env.OPENAI_API_KEY) return new Response("anahtar yok", { status: 503 }); h.set("authorization", `Bearer ${String(env.OPENAI_API_KEY).trim()}`); }
  return fetch(`${KOPRU_HEDEF[hedef]}/${yol.join("/")}${url.search}`, { method: istek.method, headers: h, body: ["GET", "HEAD"].includes(istek.method) ? undefined : await istek.arrayBuffer() });
}
