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
export const silKuyrugu = (env, kod, kim, simdi) => kuyruk(env, "venom:siteSil", { kod: String(kod), kim, zaman: simdi, kanal: true });
export const geriKuyrugu = (env, kod, kim, simdi) => kuyruk(env, "venom:siteGeri", { kod: String(kod), kim, zaman: simdi });
