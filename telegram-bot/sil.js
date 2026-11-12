// "SİL" KURALI (Patron, 2 Kasım — tek onay): Patron Sami'ye "Sil" dediğinde başka onay istenmez.
// Sıra: Sami → "venom:siteSil" (Selin siteden kaldırır, kaydı saklar) → Selin → "venom:kanalSil" (Kemal VOLONTE kanalındaki
// BÜTÜN paylaşımları — kodlu + görsel eşleşen kodsuz — önce arşive kopyalar, sonra siler) → Patron'a tek mesaj.
// "/geri <kod>" (Patron): "venom:siteGeri" → Selin siteye geri koyar → "venom:kanalGeri" → Kemal arşivden kanala geri koyar.
export const patronMu = (env, id) => String(env.MURAT_ID || "").split(",").map((x) => x.trim()).filter(Boolean).includes(String(id));
async function kuyruk(env, anahtar, kayit) {
  const l = (await env.KAYIT.get(anahtar, "json")) || [];
  if (l.some((x) => String(x.kod) === String(kayit.kod))) return false; // aynı kod zaten sırada
  l.push(kayit);
  await env.KAYIT.put(anahtar, JSON.stringify(l.slice(-50)));
  return true;
}
// 10 Kasım (Patron, KESİN KURAL — kural kitabının en üstü): mağaza stoğu (Vegawin, iki mağaza ayrı ayrı sayılır) bitmeden model
// siteden ve Telegram'dan ASLA kaldırılmaz. Fabrikada bitmesi kaldırma sebebi değildir. Bütün silme yolları buradan geçer.
// Dönüş: mağaza mağaza kalan adet (VOLONTE ve BLACK ROSE AYRI yazılır, toplanmaz). yazi boşsa stok yok → silinebilir.
export async function magazaStoklari(env, kod) {
  const bos = { var: false, yazi: "", magazalar: {} };
  if (!env || !env.STOK) return bos;
  try {
    const r = await env.STOK.get(env.STOK.idFromName("stok"), { locationHint: "enam" }).fetch("https://stok/bilgi", { method: "POST", body: JSON.stringify({ kod: String(kod) }) });
    const m = {};
    for (const x of ((await r.json()) || {}).satirlar || []) m[x.magaza] = (m[x.magaza] || 0) + (Number(x.adet) || 0);
    const dolu = Object.entries(m).filter(([, n]) => n > 0);
    return { var: dolu.length > 0, magazalar: m, yazi: dolu.map(([g, n]) => `${g === "BLACKROSE" ? "BLACK ROSE" : g} ${n} adet`).join(" · ") };
  } catch { return bos; }
}
export const magazaStogu = async (env, kod) => { const s = await magazaStoklari(env, kod); return s.var ? s.yazi : 0; };
export const STOK_KURALI = (kod, yazi) => `⛔ ${kod} mağazada stokta (${yazi}) — mağaza stoğu bitmeden model siteden ve Telegram'dan kaldırılmaz (kural kitabı, en üst kural). Stok bitince yeniden sorulur.`;
// Stok varsa kuyruğa girmez: { engel: adet } döner (çağıran kişiye STOK_KURALI yazar)
export async function silKuyrugu(env, kod, kim, simdi) {
  const adet = await magazaStogu(env, kod);
  if (adet) {
    const l = (await env.KAYIT.get("venom:silEngel", "json").catch(() => null)) || [];
    await env.KAYIT.put("venom:silEngel", JSON.stringify([...l, { kod: String(kod), kim, zaman: simdi, adet }].slice(-100))).catch(() => null);
    return { engel: adet };
  }
  await silOnayliYaz(env, kod, kim, simdi);
  return kuyruk(env, "venom:siteSil", { kod: String(kod), kim, zaman: simdi, kanal: true });
}
// 12 Kasım (Patron): silinmesi ONAYLANAN model, silme bitmesini beklemeden, Selin'in fotoğraf listesine ve Kemal'in paylaşım sırasına ASLA girmez.
// Kayıt: KV "silme:onayli" = { kod: { kim, zaman } }. "/geri" ile geri alınınca kayıttan çıkar.
export async function silOnayli(env) { try { return (await env.KAYIT.get("silme:onayli", "json")) || {}; } catch { return {}; } }
export async function silOnayliYaz(env, kod, kim, simdi, sil = false) {
  const l = await silOnayli(env);
  if (sil) delete l[String(kod)]; else l[String(kod)] = { kim, zaman: simdi };
  await env.KAYIT.put("silme:onayli", JSON.stringify(l)).catch(() => null);
  return l;
}
export const geriKuyrugu = async (env, kod, kim, simdi) => { await silOnayliYaz(env, kod, kim, simdi, true); return kuyruk(env, "venom:siteGeri", { kod: String(kod), kim, zaman: simdi }); };
