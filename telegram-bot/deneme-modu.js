// DENEME MODU (13 Kasım, Patron — kitap kural 40): Patron "deneme başlıyor" der → o andan itibaren başlatılan özel liste ve
// repete kayıtları 🧪 işaretlenir (kayıtta "mod"), kartlarının başında "🧪 DENEME" yazar; zincir GERÇEK kişilerle aynen çalışır
// (doğru fabrika, doğru sıra) ama kayıtlar rapora, ciroya, hatırlatmaya ve tek deftere girmez. "deneme bitti" → hepsi tek
// seferde SESSİZCE kapanır (kimseye mesaj gitmez). Günün otomatik eksik listesi deneme sayılmaz (gerçek iş karışmasın).
// Eski "deneme" işareti (TEST- modelleri; fabrikaya gitmeyen iç testler) ayrıdır ve değişmedi.
export const MOD_SATIR = "🧪 DENEME — bu kart denemedir, gerçek sipariş değildir.\n";
const ANAHTAR = "deneme:modu";
export async function modOku(env) { try { const m = await env.KAYIT.get(ANAHTAR, "json"); return m && m.basla ? m : null; } catch { return null; } }
export const modAcik = async (env) => Boolean(await modOku(env));
export async function modBasla(env, simdi, kim = "Patron") {
  const eski = await modOku(env);
  if (eski) return { zaten: true, basla: eski.basla };
  await env.KAYIT.put(ANAHTAR, JSON.stringify({ basla: simdi, kim }));
  return { zaten: false, basla: simdi };
}
export async function modBitir(env) { const m = await modOku(env); if (m) await env.KAYIT.delete(ANAHTAR); return m; }
// Kayıt deneme mi (eski iç test ya da deneme modu)? Raporlar ve hatırlatmalar buna bakar.
export const denemeKaydiMi = (x) => Boolean(x && (x.deneme || x.mod));
