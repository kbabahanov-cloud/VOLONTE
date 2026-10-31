// TEK SEFERLİK GÜN DÖKÜMÜ (31 Ekim, sadece OKUMA): KV "sami:gunDokum" = "YYYY-AA-GG" → o günün eksik listeleri
// (VOLONTE + Black Rose + ekler), fabrikaya gidenler, stok sorguları, satışlar ve köprü durumu "sami:gunDokumSonuc"a yazılır.
// KV "sami:raporTekrar" = "YYYY-AA-GG" → o günün otomatik rapor metinleri Patron'a (MURAT_ID'nin ilki) yeniden gönderilir.
import { stokIste } from "./stokbot.js";

const ayar = async (env, k) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? null : JSON.parse(v); };
const SAAT_FARKI = 3 * 3600;
const pazartesi = (g) => { const t = Date.UTC(+g.slice(0, 4), +g.slice(5, 7) - 1, +g.slice(8, 10)) / 1000; const gun = (new Date(t * 1000).getUTCDay() + 6) % 7; return new Date((t - gun * 86400) * 1000).toISOString().slice(0, 10); };
const gunOf = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);

export async function gunDokumu(env) {
  const g = await env.KAYIT.get("sami:gunDokum");
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(g)) return;
  await env.KAYIT.delete("sami:gunDokum");
  const sonuc = { gun: g, zaman: Math.floor(Date.now() / 1000), listeler: {} };
  for (const ana of [g, `${g}-BR`]) {
    const d = await ayar(env, `fabrika:${ana}`);
    sonuc.listeler[ana] = d;
    for (const e of (d && d.ekler) || []) sonuc.listeler[e] = await ayar(env, `fabrika:${e}`);
  }
  const hafta = (await ayar(env, `fs:hafta:${pazartesi(g)}`)) || {};
  sonuc.fabrikaya = Object.values(hafta).filter((x) => x && x.gonderim && gunOf(x.gonderim) === g);
  sonuc.sorgular = await stokIste(env, "/sorgu-liste", { basla: g, bitis: g }).catch(() => []);
  sonuc.satisVOLONTE = await stokIste(env, "/satislar", { gun: g, magaza: "VOLONTE" }).catch(() => []);
  sonuc.satisBLACKROSE = await stokIste(env, "/satislar", { gun: g, magaza: "BLACKROSE" }).catch(() => []);
  sonuc.kopru = await stokIste(env, "/ozet").catch(() => null);
  await env.KAYIT.put("sami:gunDokumSonuc", JSON.stringify(sonuc), { expirationTtl: 7 * 86400 });
}

export async function raporTekrar(env, tg) {
  const g = await env.KAYIT.get("sami:raporTekrar");
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(g)) return;
  await env.KAYIT.delete("sami:raporTekrar");
  const patron = String(env.MURAT_ID || "").split(",")[0].trim();
  const ozet = async (bot) => (await env.KAYIT.get(`venom:rapor:${bot}:${g}`, "json")) || null;
  const satir = (ad, o) => (o ? [`${ad}: ${o.ozet}`, ...(o.sorunlar || []).map((x) => `  ⚠️ ${x}`), ...(o.yapilacak || []).map((x) => `  → ${x}`)].join("\n") : `${ad}: (rapor yok)`);
  const gGoster = `${g.slice(8, 10)}.${g.slice(5, 7)}`;
  const mesajlar = [
    `📋 ${gGoster} otomatik raporları (tekrar gönderim)`,
    (await env.KAYIT.get(`venom:samiMetin:${g}`)) || "📦 Sami sabah raporu bulunamadı.",
    [`🤝 ${gGoster} Venom toplu özet`, satir("📦 Sami", await ozet("sami")), satir("📣 Kemal", await ozet("kemal")), satir("🖼 Selin", await ozet("selin"))].join("\n\n"),
  ];
  const sonuc = [];
  for (const m of mesajlar) { const r = await tg(env, "sendMessage", { chat_id: patron, text: m.slice(0, 4000), disable_web_page_preview: true }); sonuc.push(Boolean(r && r.ok)); }
  await env.KAYIT.put("sami:raporTekrarSonuc", JSON.stringify({ gun: g, sonuc }), { expirationTtl: 7 * 86400 });
}
