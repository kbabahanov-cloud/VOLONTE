// 6 Kasım (sağlamlaştırma haftası): botun kendi sağlık kontrolü. Venom'un 09:30 günlük testi iç bağlantıyla çağırır
// (VenomKapisi.saglik). Para harcamaz: Telegram webhook durumu + ortak kayıt okuma + bota özel küçük kontrol.
export async function botSagligi(env, ozel = async () => null) {
  const sorunlar = [], bilgi = [];
  try {
    const r = await fetch(`https://api.telegram.org/bot${String(env.BOT_TOKEN || "").trim()}/getWebhookInfo`).then((x) => x.json());
    if (!r.ok) sorunlar.push(`Telegram: ${String(r.description || "anahtar geçersiz").slice(0, 80)}`);
    else {
      const w = r.result || {};
      if (!w.url) sorunlar.push("webhook kurulu değil");
      if ((w.pending_update_count || 0) > 20) sorunlar.push(`${w.pending_update_count} Telegram mesajı işlenmeyi bekliyor`);
      if (w.last_error_date && Date.now() / 1000 - w.last_error_date < 86400) sorunlar.push(`son 24 saatte webhook hatası: ${String(w.last_error_message || "").slice(0, 80)}`);
    }
  } catch { sorunlar.push("Telegram'a ulaşılamadı"); }
  try { await env.KAYIT.get("kanal"); } catch { sorunlar.push("ortak kayıt okunamadı"); }
  try {
    const x = await ozel();
    if (x && x.sorun) sorunlar.push(x.sorun);
    if (x && x.bilgi) bilgi.push(x.bilgi);
  } catch (e) { sorunlar.push(String(e && e.message).slice(0, 100)); }
  return { ok: !sorunlar.length, sorunlar, bilgi: bilgi.join(" · ") || null };
}
// Son 24 saatte bot hata kaydı (KV "<bot>:hata" { zaman, hata })
export async function sonHata(env, anahtar) {
  const v = await env.KAYIT.get(anahtar, "json").catch(() => null);
  return v && v.zaman && Date.now() / 1000 - v.zaman < 86400 ? `son hata: ${String(v.hata || "").replace(/\d{9,}/g, "•••").slice(0, 90)}` : null;
}
