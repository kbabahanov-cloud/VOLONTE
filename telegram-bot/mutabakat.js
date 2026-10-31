// CUMA MUTABAKATI — Fuat (Black Rose) ile haftalık stok ve bakiye mutabakatı (kullanıcı kararı 31 Ekim). Sayım Sami.
//  • Her cuma 17:00 önce PATRON'a önizleme: [✅ Fuat'a gönder] [🔄 Yenile] [❌ İptal]. /mutabakat ile istediği an.
//  • Onaylanınca Fuat'a "📋 Cuma mutabakatı – tarih": [✅ Mutabıkım] [❌ Uyuşmuyor] [⏳ Sonra kontrol edeceğim].
//    Mutabıkım → Patron'a "Fuat mutabık ✅". Uyuşmuyor → Fuat'a "Fark ne?"; yazdığı açıklama Patron'a gider.
//    Sonra → her gün 12:00 (pazar hariç) aynı düğmelerle sorulur; 3 gün cevap yoksa Patron'a bilgi.
//  • İçerik: BÖLÜM 1 Black Rose mağazası, BÖLÜM 2 VOLONTE mağazası — SADECE Black Rose kodlarının stoğu (kod sade);
//    BÖLÜM 3 bakiyeler (Black Rose 15/20/25/00 + toplam; köprünün cari okuması). VOLONTE modeli, fiyat, maliyet, satış,
//    kâr YOK; 2000 yok. Mutabakat SADECE Patron ve Fuat'a gider.
//  • Her mutabakat ve Fuat'ın cevabı Sami'nin deposunda saklanır ("mt:<id>", liste "mt:liste").
import { stokIste } from "./stokbot.js";
import { murat, muratMi } from "./fabrika.js";

const SAAT_FARKI = 3 * 3600;
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
const gunAnahtari = (t) => new Date((t + SAAT_FARKI) * 1000).toISOString().slice(0, 10);
const haftaGunu = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay(); // 0 pazar, 5 cuma
const tarihYaz = (g) => g.split("-").reverse().join(".");
const ayarOku = async (env, k, bos) => { const v = (await stokIste(env, "/ayar-oku", { k })).v; return v == null ? bos : JSON.parse(v); };
const ayarYaz = (env, k, v) => stokIste(env, "/ayar-yaz", { k, v: JSON.stringify(v) });
export const fuat = (env) => String(env.FUAT_ID || "");
// Hesaplar (Patron eşleştirmesi 31 Ekim): Black Rose Vegawin "BLACK ROSE 00/15/20/25" ↔ VOLONTE Vegawin "BLACK ROSE 000 /
// BLACKROSE 15 / BLACKROSE 20 / BLACK ROSE 25" — köprü sondaki sayıyla eşler (000 → 00).
const HESAPLAR = ["15", "20", "25", "00"];
const para = (x) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Vegawin işareti: borç − alacak; artı = (B) borçlu, eksi = (A) alacaklı
const tutar = (x) => (x == null ? "—" : `${para(Math.abs(x))}${Math.abs(x) < 0.005 ? "" : x > 0 ? " (B)" : " (A)"}`);
// Bakiye kaynağı (ayar "cari:yontem"): { tur: "kart" } = cari kartındaki BAKIYE (varsayılan) ya da
// { tur: "donem", tablolar: ["D0005TBLCARIGENELHAREKET", …] } = seçilen dönem tablolarındaki borç − alacak toplamı
export function bakiyeDegeri(h, yontem = { tur: "kart" }) {
  if (!h) return null;
  if (yontem.tur === "donem") {
    const l = (yontem.tablolar || []).map((t) => h.donemler && h.donemler[t]).filter(Boolean);
    return l.length ? l.reduce((s, x) => s + (Number(x.borc) || 0) - (Number(x.alacak) || 0), 0) : null;
  }
  return h.kart == null ? null : Number(h.kart);
}
export function bakiyeBolumu(br, vl, yontem = { tur: "kart" }) {
  const bul = (c, a) => c && (c.hesaplar || []).find((h) => h.anahtar === a);
  const satirlar = HESAPLAR.map((a) => ({ a, br: bakiyeDegeri(bul(br, a), yontem), vl: bakiyeDegeri(bul(vl, a), yontem) }));
  const top = (k) => (satirlar.some((x) => x[k] != null) ? satirlar.reduce((s, x) => s + (x[k] || 0), 0) : null);
  const fark = (x, y) => (x == null || y == null ? null : Math.abs(x) - Math.abs(y));
  const isaret = (f) => (f == null ? "❔" : Math.abs(f) < 0.005 ? "✅" : "⚠️");
  const kaynak = yontem.tur === "kart" ? "cari kart bakiyesi" : `dönem toplamı (${(yontem.tablolar || []).join(", ")})`;
  const fuat = br ? [...satirlar.map((x) => `Black Rose ${x.a}: ${tutar(x.br)}`), `TOPLAM: ${tutar(top("br"))}`] : ["Bakiyeler henüz okunamıyor."];
  const tb = top("br"), tv = top("vl"), tf = fark(tb, tv);
  const patron = br || vl ? [
    ...satirlar.map((x) => { const f = fark(x.br, x.vl); return `${isaret(f)} Black Rose ${x.a}: Black Rose kaydı ${tutar(x.br)} · VOLONTE kaydı ${tutar(x.vl)} · fark ${f == null ? "—" : para(f)}`; }),
    `${isaret(tf)} TOPLAM: Black Rose kaydı ${tutar(tb)} · VOLONTE kaydı ${tutar(tv)} · fark ${tf == null ? "—" : para(tf)}`,
    `(kaynak: ${kaynak}; (B) borçlu, (A) alacaklı; fark = tutar farkı)`,
  ] : ["Bakiyeler henüz okunamıyor (köprüler cari bakiyeyi göndermedi)."];
  const farkVar = satirlar.some((x) => { const f = fark(x.br, x.vl); return f != null && Math.abs(f) >= 0.005; });
  return { fuat, patron, farkVar };
}

// Fuat'a giden metin: stok bölümleri + SADECE Black Rose tarafının bakiyesi ve toplamı. Patron'unki: iki taraf yan yana + fark.
export async function mutabakatMetni(env, gun) {
  const s = await stokIste(env, "/br-stoklar");
  const [br, vl, yontem] = await Promise.all([ayarOku(env, "cari:BLACKROSE", null), ayarOku(env, "cari:VOLONTE", null), ayarOku(env, "cari:yontem", { tur: "kart" })]);
  const b = bakiyeBolumu(br, vl, yontem);
  const bolum = (l) => (l.length ? l.map(([k, a]) => `${k} · ${a}`).join("\n") : "—");
  const toplam = (l) => l.reduce((t, [, a]) => t + a, 0);
  const ust = [
    `📋 Cuma mutabakatı – ${tarihYaz(gun)}`,
    "",
    `📦 BÖLÜM 1 – BLACK ROSE MAĞAZASI (${s.BLACKROSE.length} model, ${toplam(s.BLACKROSE)} adet)`,
    bolum(s.BLACKROSE),
    "",
    `📦 BÖLÜM 2 – VOLONTE MAĞAZASI (Black Rose kodları; ${s.VOLONTE.length} model, ${toplam(s.VOLONTE)} adet)`,
    bolum(s.VOLONTE),
    "",
    "💰 BÖLÜM 3 – BAKİYELER",
  ];
  return { fuat: [...ust, ...b.fuat].join("\n"), patron: [...ust, ...b.patron].join("\n"), farkVar: b.farkVar };
}

const onizlemeKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Fuat'a gönder", callback_data: `mt:g:${id}` }, { text: "🔄 Yenile", callback_data: `mt:y:${id}` }, { text: "❌ İptal", callback_data: `mt:x:${id}` }]] });
const fuatKlavye = (id) => ({ inline_keyboard: [[{ text: "✅ Mutabıkım", callback_data: `mt:m:${id}` }, { text: "❌ Uyuşmuyor", callback_data: `mt:u:${id}` }], [{ text: "⏳ Sonra kontrol edeceğim", callback_data: `mt:s:${id}` }]] });
const kayitYaz = async (env, r) => {
  await ayarYaz(env, `mt:${r.id}`, r);
  const l = await ayarOku(env, "mt:liste", []);
  if (!l.includes(r.id)) await ayarYaz(env, "mt:liste", [...l, r.id]);
};
// Telegram mesajı 4096 karakter: uzun liste parçalara bölünür (düğmeler son parçada)
function parcala(metin, sinir = 3800) {
  const p = [];
  let k = "";
  for (const satir of metin.split("\n")) {
    if ((k + satir).length > sinir) { p.push(k); k = ""; }
    k += `${k ? "\n" : ""}${satir}`;
  }
  return [...p, k];
}
async function gonder(env, tg, chat, metin, klavye) {
  const p = parcala(metin);
  let son = null;
  for (let i = 0; i < p.length; i++) son = await tg(env, "sendMessage", { chat_id: chat, text: p[i], ...(i === p.length - 1 ? { reply_markup: klavye } : {}) });
  return son && son.ok ? son.result.message_id : null;
}

// Patron önizlemesi: iki taraf yan yana; fark varsa en üstte ⚠️. Fuat'a SADECE Black Rose tarafı gider.
const onizlemeYazi = (m, ek = "") => `👁 ÖNİZLEME${ek ? ` (${ek})` : ""} — sadece siz görüyorsunuz${m.farkVar ? "\n⚠️ BAKİYELERDE FARK VAR (aşağıda ⚠️ satırlar)" : ""}\nFuat'a giden mesajda VOLONTE tarafı ve farklar YOK; sadece Black Rose kaydı ve toplamı.\n\n${m.patron}`;

export async function onizlemeGonder(env, tg, simdi, kaynak = "cuma") {
  const gun = gunAnahtari(simdi);
  const id = `${gun}-${simdi.toString(36)}`;
  const m = await mutabakatMetni(env, gun);
  const r = { id, gun, kaynak, olusturma: simdi, metin: m.fuat, patronMetin: m.patron, durum: "onizleme", gecmis: [[simdi, `önizleme (${kaynak})`]] };
  r.onizlemeMesaj = await gonder(env, tg, murat(env), onizlemeYazi(m), onizlemeKlavye(id));
  await kayitYaz(env, r);
  return r;
}

// /mutabakat — sadece Patron (ve Murat'ın diğer hesabı)
export async function mutabakatKomutu(env, m, tg, simdi) {
  if (!muratMi(env, m.from.id)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Bu komut sadece Patron'da." });
  if (!fuat(env)) return tg(env, "sendMessage", { chat_id: m.chat.id, text: "Fuat'ın kimliği kayıtlı değil (venom:kimlikler FUAT_ID)." });
  await onizlemeGonder(env, tg, simdi, "elle");
}

export async function mutabakatDugmesi(env, cq, tg, simdi) {
  const [, islem, id] = String(cq.data).split(":");
  const cevapla = (text) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const r = await ayarOku(env, `mt:${id}`, null);
  if (!r) return cevapla("Bu mutabakat bulunamadı.");
  const kim = String(cq.from.id);
  if ("gyx".includes(islem)) { // Patron düğmeleri
    if (!muratMi(env, kim)) return cevapla("Bu düğme Patron'da.");
    if (r.durum !== "onizleme") return cevapla("Bu önizleme artık geçerli değil.");
    if (islem === "x") {
      Object.assign(r, { durum: "iptal" }); r.gecmis.push([simdi, "iptal (Patron)"]);
      await kayitYaz(env, r); await cevapla("İptal edildi");
      return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: "❌ İptal edildi", callback_data: "mt:-" }]] } });
    }
    if (islem === "y") {
      const m = await mutabakatMetni(env, r.gun);
      Object.assign(r, { metin: m.fuat, patronMetin: m.patron }); r.gecmis.push([simdi, "yenilendi"]);
      await kayitYaz(env, r); await cevapla("Yenilendi");
      return gonder(env, tg, cq.message.chat.id, onizlemeYazi(m, "yenilendi"), onizlemeKlavye(id));
    }
    // g: Fuat'a gönder
    r.fuatMesaj = await gonder(env, tg, fuat(env), r.metin, fuatKlavye(id));
    if (!r.fuatMesaj) return cevapla("Fuat'a gönderilemedi (Sami'ye /start yazmamış olabilir).");
    Object.assign(r, { durum: "gonderildi", gonderim: simdi }); r.gecmis.push([simdi, "Fuat'a gönderildi"]);
    await kayitYaz(env, r); await cevapla("Fuat'a gönderildi");
    return tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: "✅ Fuat'a gönderildi", callback_data: "mt:-" }]] } });
  }
  // Fuat'ın düğmeleri
  if (kim !== fuat(env)) return cevapla("Bu düğme Fuat'ta.");
  if (!["gonderildi", "sonra", "fark"].includes(r.durum)) return cevapla("Bu mutabakat kapandı.");
  const kapat = () => tg(env, "editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (islem === "m") {
    Object.assign(r, { durum: "mutabik", cevapZaman: simdi }); r.gecmis.push([simdi, "Fuat: mutabıkım"]);
    await kayitYaz(env, r); await cevapla("Teşekkürler"); await kapat();
    await tg(env, "sendMessage", { chat_id: fuat(env), text: "✅ Teşekkürler, mutabakat kaydedildi." });
    return tg(env, "sendMessage", { chat_id: murat(env), text: `Fuat mutabık ✅ (${tarihYaz(r.gun)} mutabakatı)` });
  }
  if (islem === "u") {
    Object.assign(r, { durum: "fark", cevapZaman: simdi }); r.gecmis.push([simdi, "Fuat: uyuşmuyor"]);
    await kayitYaz(env, r); await ayarYaz(env, `mt:fark:${kim}`, id);
    await cevapla("Farkı yazın"); await kapat();
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Fark ne? Lütfen kısaca yazın (model kodu ve adet, ya da bakiye farkı)." });
  }
  if (islem === "s") {
    Object.assign(r, { durum: "sonra", sonraBas: r.sonraBas || simdi, sorulanGun: gunAnahtari(simdi) }); r.gecmis.push([simdi, "Fuat: sonra kontrol edeceğim"]);
    await kayitYaz(env, r); await cevapla("Tamam"); await kapat();
    return tg(env, "sendMessage", { chat_id: fuat(env), text: "Tamam. Yarın 12:00'de tekrar soracağım." });
  }
}

// Fuat "Uyuşmuyor" dedikten sonra yazdığı açıklama → Patron'a
export async function mutabakatFarkMesaji(env, m, tg, simdi) {
  const kim = String(m.from.id);
  if (kim !== fuat(env) || !m.text || m.text.startsWith("/")) return false;
  const id = await ayarOku(env, `mt:fark:${kim}`, null);
  if (!id) return false;
  const r = await ayarOku(env, `mt:${id}`, null);
  await stokIste(env, "/ayar-yaz", { k: `mt:fark:${kim}`, v: "null" });
  if (!r) return false;
  Object.assign(r, { fark: String(m.text).slice(0, 2000), farkZaman: simdi }); r.gecmis.push([simdi, `Fuat fark: ${r.fark}`]);
  await kayitYaz(env, r);
  await tg(env, "sendMessage", { chat_id: fuat(env), text: "Teşekkürler, açıklamanız iletildi." });
  await tg(env, "sendMessage", { chat_id: murat(env), text: `❌ Fuat mutabakatta uyuşmuyor (${tarihYaz(r.gun)}):\n${r.fark}` });
  return true;
}

// Görev (5 dakikada bir): cuma 17:00 önizleme; "sonra" diyene her gün 12:00 (pazar hariç) hatırlatma; 3 gün cevapsız → Patron
export async function mutabakatAdimi(env, simdi, tg) {
  if (!fuat(env)) return;
  const gun = gunAnahtari(simdi);
  const s = saat(simdi);
  if (haftaGunu(simdi) === 5 && s >= 17 && !(await ayarOku(env, `mt:cuma:${gun}`, null))) {
    await ayarYaz(env, `mt:cuma:${gun}`, 1);
    await onizlemeGonder(env, tg, simdi, "cuma");
    return;
  }
  if (haftaGunu(simdi) === 0 || s < 12) return;
  for (const id of (await ayarOku(env, "mt:liste", [])).slice(-6)) {
    const r = await ayarOku(env, `mt:${id}`, null);
    if (!r || r.durum !== "sonra" || r.sorulanGun === gun) continue;
    r.sorulanGun = gun;
    r.hatirlatma = (r.hatirlatma || 0) + 1;
    await gonder(env, tg, fuat(env), `⏳ Mutabakatı kontrol ettiniz mi? (${tarihYaz(r.gun)})`, fuatKlavye(id));
    r.gecmis.push([simdi, `hatırlatma ${r.hatirlatma}`]);
    if (r.hatirlatma >= 3 && !r.patronBilgi) {
      r.patronBilgi = true;
      await tg(env, "sendMessage", { chat_id: murat(env), text: `ℹ️ Fuat ${tarihYaz(r.gun)} mutabakatına 3 gündür cevap vermedi.` });
    }
    await kayitYaz(env, r);
  }
}
