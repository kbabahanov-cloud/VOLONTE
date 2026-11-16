// DURDURMA (6 Kasım, Patron): "hepsini durdur" → bütün botların paylaşım/üretim/yazma işleri durur; "hepsini aç" → açılır.
// Bir bot 3 kez üst üste hata yaparsa Venom yalnız o botu durdurur. Kayıt KV "venom:dur" = { hepsi, kemal, selin, pelin, sami, neden: {}, zaman }.
// Her bot zamanlı işinin başında ve yayın/üretim kapısında bakar (30 sn önbellek; okuma ucuz, yazma yok).
let onbellek = { t: 0, v: null };
export async function durDurumu(env) {
  if (Date.now() - onbellek.t < 30000 && onbellek.v) return onbellek.v;
  const v = (await env.KAYIT.get("venom:dur", "json").catch(() => null)) || {};
  onbellek = { t: Date.now(), v };
  return v;
}
export const _durOnbellekSifirla = () => { onbellek = { t: 0, v: null }; }; // testler için
export async function durdurulduMu(env, bot) { const d = await durDurumu(env); return Boolean(d.hepsi || d[bot]); }
export async function durMesaji(env, bot) {
  const d = await durDurumu(env);
  return d.hepsi ? "⛔ Patron bütün botları durdurdu (\"hepsini aç\" ile açılır)" : d[bot] ? `⛔ ${bot} durduruldu: ${(d.neden || {})[bot] || "Patron/Venom"}` : null;
}
export async function durYaz(env, degisim, simdi = Math.floor(Date.now() / 1000)) {
  const d = (await env.KAYIT.get("venom:dur", "json").catch(() => null)) || {};
  const yeni = { ...d, ...degisim, neden: { ...(d.neden || {}), ...(degisim.neden || {}) }, zaman: simdi };
  await env.KAYIT.put("venom:dur", JSON.stringify(yeni));
  onbellek = { t: Date.now(), v: yeni };
  return yeni;
}
// 16 Kasım (Patron): Pelin'in YENİ üretim durdurması TEK kaynaktan — "hepsini durdur" / "pelin durdur" (venom:dur) ya da Patron'un
// duraklatma anahtarı (KV "venom:pelinUretimAcik" = "0"; kim / ne zaman: "venom:pelinUretimDurum"). Mesajdaki kelimeye BAKILMAZ (kural 10):
// eskiden "üret / video / çek …" geçen mesaj durdurmayı deliyordu (3394 kartı açıldı, "Pelin 3271" durdu). Anahtar yoksa AÇIK sayılır
// (5 Kasım "sağlamlaştırma haftası" varsayılanı "kapalı"ydı; hafta bitince açılmadığı için durdurma kendiliğinden sürmüştü).
// Dönen: null (açık) ya da Patron'a tek satır (kim, ne zaman, nasıl açılır).
export async function pelinUretimDurdu(env) {
  if (await durdurulduMu(env, "pelin")) return `${await durMesaji(env, "pelin")} — yeni üretim kartı açılmadı.`;
  const v = await env.KAYIT.get("venom:pelinUretimAcik").catch(() => null);
  if (v !== "0") return null;
  const k = await env.KAYIT.get("venom:pelinUretimDurum", "json").catch(() => null);
  const ne = k && k.zaman ? `${k.kim || "Patron"} · ${new Date((Number(k.zaman) + 3 * 3600) * 1000).toISOString().slice(5, 16).replace(/(\d\d)-(\d\d)T/, "$2.$1 ")}` : "kaydı yok";
  return `⏸ Pelin'in yeni üretimi durdurulmuş (${ne}) — maliyet kartı açılmadı, para harcanmadı. Açmak için: "Pelin üretimini aç".`;
}