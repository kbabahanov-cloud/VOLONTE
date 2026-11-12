// REPETE RAPORU (9 Kasım, Patron): pazartesi, çarşamba, cuma 11:00 — Patron'a TEK rapor (fotoğraflı albüm + düğmeli liste).
// Bu dosya SADECE hesap ve yazı (saf, test edilebilir); gönderme Kemal'de (worker.js repeteRaporuGonder).
// Kurallar: VOLONTE ve BLACK ROSE asla toplanmaz — her model kendi markasının mağazasındaki stok/satışla hesaplanır.
// Fiyat yok. Renk bazlı satış Vegawin'de yok (tek kart): renkler son fabrika siparişinden gösterilir.
export const REPETE_EN_AZ = 40; // 13 Kasım (Patron, kural 29): SINIR DEĞİL — Sami'nin önerdiği başlangıç adedi; adedi Hemra / Patron belirler
export const HIZLI_SATIS14 = 6, BITTI_SATIS14 = 4, YAVAS_STOK = 20, ACIL_GUN = 3;
const GUN = 86400;
const MARKA_AD = { BLACKROSE: "BLACK ROSE", VOLONTE: "VOLONTE" };
const gunYaz = (t) => { const d = new Date((t + 3 * 3600) * 1000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
const gunStr = (g) => (g ? `${String(g).slice(8, 10)}.${String(g).slice(5, 7)}` : "?");

// veri: StokDO /repete-veri; markalar: { kod: "VOLONTE"|"BLACKROSE" } (kesin karar / tek mağaza); tepki: { kod: n }; simdi (unix)
export function repeteHesapla(veri, { markalar = {}, tepki = {}, simdi, defne = null, siteKodlar = null }) {
  const bugun = new Date((simdi + 3 * 3600) * 1000).toISOString().slice(0, 10);
  const veriGun = veri.ilkGun ? Math.max(1, Math.round((Date.parse(bugun) - Date.parse(veri.ilkGun)) / 864e5) + 1) : 14;
  const gun14 = Math.min(14, veriGun), gun7 = Math.min(7, veriGun);
  const satis = (l) => { const m = {}; for (const r of l || []) (m[r.kod] = m[r.kod] || {})[r.magaza] = Number(r.a) || 0; return m; };
  const s14 = satis(veri.s14), s7 = satis(veri.s7), sK = satis(veri.sKarar);
  const stok = {};
  for (const r of veri.urun || []) (stok[r.kod] = stok[r.kod] || {})[r.magaza] = Number(r.adet) || 0;
  const gizli = new Set((veri.gizli || []).filter((x) => x.durum === "gizli").map((x) => x.kod));
  // son karar (kod başına)
  const karar = {};
  for (const k of veri.kararlar || []) if (!karar[k.kod] || karar[k.kod].zaman < k.zaman) karar[k.kod] = k;
  const fsKod = {};
  for (const f of veri.fs || []) if (!fsKod[f.kod] || fsKod[f.kod].gonderim < f.gonderim) fsKod[f.kod] = f;
  const bakis = (veri.bakis && veri.bakis.modeller) || {};
  const satirlar = [];
  for (const kod of Object.keys(stok)) {
    if (/^2000/.test(kod) || gizli.has(kod)) continue; // indirimli mal ve silinen model yok
    const magazalar = Object.keys(stok[kod]);
    const marka = markalar[kod] || (magazalar.length === 1 ? magazalar[0] : magazalar.find((m) => stok[kod][m] > 0) || magazalar[0]);
    const st = stok[kod][marka] ?? 0, a14 = (s14[kod] || {})[marka] || 0, a7 = (s7[kod] || {})[marka] || 0;
    const hiz = a14 / gun14;
    const f = fsKod[kod] || null;
    satirlar.push({
      kod, marka, stok: st, s7: a7, s14: a14, hiz,
      bitisGun: hiz > 0 && st > 0 ? st / hiz : null,
      fabrika: f ? { ...f, cevapsiz: f.durum === "bekliyor" && simdi - (f.gonderim || simdi) > GUN } : null,
      bakis: bakis[kod] ?? null, tepki: tepki[kod] ?? null, karar: karar[kod] || null,
      istenen: defne ? defne[kod] ?? null : undefined, sitede: siteKodlar ? siteKodlar.has(kod) : true,
    });
  }
  const atla = (x) => x.karar && ((x.karar.karar === "b" && simdi - x.karar.zaman < 7 * GUN) || (x.karar.karar === "x" && simdi - x.karar.zaman < 30 * GUN) || (x.karar.karar === "r" && simdi - x.karar.zaman < 14 * GUN));
  const bekleyen = satirlar.filter(atla);
  const aday = satirlar.filter((x) => !atla(x));
  const hizli = aday.filter((x) => x.stok > 0 && x.s14 >= HIZLI_SATIS14 && x.bitisGun != null && x.bitisGun <= 14).sort((a, b) => a.bitisGun - b.bitisGun).slice(0, 6);
  const bitti = aday.filter((x) => x.stok <= 0 && x.s14 >= BITTI_SATIS14 && !(x.fabrika && ["gelecek", "repete", "bekliyor"].includes(x.fabrika.durum))).sort((a, b) => b.s14 - a.s14).slice(0, 10 - hizli.length > 4 ? 4 : 10 - hizli.length);
  const gelecek = (veri.fs || []).filter((f) => ["gelecek", "repete", "bekliyor"].includes(f.durum)).map((f) => ({ ...f, cevapsiz: f.durum === "bekliyor" && simdi - (f.gonderim || simdi) > GUN, marka: markalar[f.kod] || null }))
    .sort((a, b) => b.cevapsiz - a.cevapsiz || String(a.hazirGun || "9").localeCompare(String(b.hazirGun || "9"))).slice(0, 8);
  const yavas = satirlar.filter((x) => x.stok >= YAVAS_STOK && x.s14 <= 1 && x.sitede).sort((a, b) => b.stok - a.stok).slice(0, 8);
  const acil = hizli.filter((x) => x.bitisGun < ACIL_GUN);
  // aylık: geçen ay repete alınanlar karardan sonra ne kadar sattı
  const ay = (veri.kararlar || []).filter((k) => k.karar === "r" && simdi - k.zaman < 40 * GUN);
  const aylik = ay.map((k) => ({ kod: k.kod, zaman: k.zaman, sonra: Object.values(sK[k.kod] || {}).length ? (sK[k.kod][markalar[k.kod] || Object.keys(sK[k.kod])[0]] || 0) : 0 }));
  return { hizli, bitti, gelecek, yavas, acil, bekleyen: bekleyen.length, gun14, veriGun, aylik };
}

const fabrikaYazi = (f) => {
  if (!f) return "fabrika: sipariş yok";
  const ne = { bekliyor: "cevap bekliyor", gelecek: "gelecek", repete: "repete olacak", geldi: "geldi", kapandi: "kapandı", bitti: "fabrika bitti dedi" }[f.durum] || f.durum;
  return `fabrika: ${gunYaz(f.gonderim)} sipariş · ${ne}${f.hazirGun ? `, ${gunStr(f.hazirGun)} hazır` : ""}${f.cevapsiz ? " 🔴 cevap yok" : ""}`;
};
const renkYazi = (f) => (f && (f.renkler || []).length ? ` · renkler (son sipariş): ${f.renkler.map((r) => (typeof r === "string" ? r : `${r.renk}${r.adet ? ` ${r.adet}` : ""}`)).join(", ")}` : "");
export function modelSatiri(x, no) {
  return `${no}. ${x.kod} · ${MARKA_AD[x.marka] || x.marka}\n   7g ${x.s7} · 14g ${x.s14} · stok ${x.stok}${x.bitisGun != null ? ` · ~${Math.max(1, Math.round(x.bitisGun))} günde biter` : ""}\n   ${fabrikaYazi(x.fabrika)}${renkYazi(x.fabrika)}\n   sitede ${x.bakis ?? "—"} bakış · kanalda ${x.tepki ?? "—"} tepki${x.istenen != null ? ` · 🙋 ${x.istenen} kez istendi` : ""}`;
}
// Rapor metni + düğmeler. modeller: hizli + bitti sırası (fotoğraf albümüyle aynı numaralar)
export function repeteMetni(h, { simdi, defneVar = false }) {
  const modeller = [...h.hizli, ...h.bitti];
  const s = [`🔁 REPETE RAPORU — ${gunYaz(simdi)} (son ${h.gun14} günlük satışa göre${h.veriGun < 14 ? `; satış kaydı ${h.veriGun} günlük` : ""})`];
  let no = 0;
  s.push("", `🔥 HIZLI SATAN, BİTMEK ÜZERE (${h.hizli.length})`);
  if (!h.hizli.length) s.push("Yok.");
  for (const x of h.hizli) s.push(modelSatiri(x, ++no));
  s.push("", `📦 BİTTİ AMA HIZLI SATIYORDU — repete önerisi (${h.bitti.length})`);
  if (!h.bitti.length) s.push("Yok.");
  for (const x of h.bitti) s.push(modelSatiri(x, ++no));
  s.push("", `🚚 FABRİKADAN GELECEK (${h.gelecek.length})`);
  if (!h.gelecek.length) s.push("Açık sipariş yok.");
  for (const f of h.gelecek) s.push(`• ${f.kod}${f.marka ? ` · ${MARKA_AD[f.marka]}` : ""} — ${fabrikaYazi(f).replace(/^fabrika: /, "")}${f.cevaplayan ? ` (${f.cevaplayan})` : ""}`);
  if (h.yavas.length) s.push("", "🐢 YAVAŞ SATAN, STOKTA ÇOK — bunlara repete alma, kampanya düşün:", h.yavas.map((x) => `${x.kod} (stok ${x.stok}, 14g ${x.s14})`).join(" · "));
  if (h.bekleyen) s.push("", `⏳ Kararı verilmiş ${h.bekleyen} model bu raporda tekrar sorulmadı (bekle 7 gün / alma 30 gün / repete 14 gün).`);
  if (h.aylik && h.aylik.length) s.push("", "📅 Son 40 günde repete aldıklarımız — karardan sonra satış:", h.aylik.map((a) => `${a.kod} (${gunYaz(a.zaman)}): ${a.sonra}`).join(" · "));
  if (!defneVar) s.push("", "🙋 Defne kurulunca: \"istenen ama stokta olmayan\" sayıları da burada.");
  s.push("Renk bazlı satış Vegawin'de yok (model tek kart); renkler son fabrika siparişinden.");
  const klavye = [];
  modeller.forEach((x, i) => klavye.push([{ text: `${i + 1}· 🔁 Repete al`, callback_data: `rr:r:${x.kod}` }, { text: `${i + 1}· ⏳ Bekle`, callback_data: `rr:b:${x.kod}` }, { text: `${i + 1}· ❌ Alma`, callback_data: `rr:x:${x.kod}` }]));
  for (const f of h.gelecek.filter((y) => y.cevapsiz).slice(0, 4)) klavye.push([{ text: `🔔 ${f.kod}: Fuat'a hatırlat`, callback_data: `rr:h:${f.kod}` }]);
  return { metin: s.join("\n").slice(0, 4000), klavye, modeller };
}
// Fuat'a gidecek sipariş taslağı (Patron onayına; adet/renk ✏️ Düzelt ile değişir)
export function siparisTaslagi(x) {
  const renk = x.fabrika && (x.fabrika.renkler || []).length ? x.fabrika.renkler.map((r) => (typeof r === "string" ? r : `${r.renk}${r.adet ? ` ${r.adet}` : ""}`)).join(", ") : "önceki renkler";
  const adet = Math.max(REPETE_EN_AZ, Math.ceil((x.s14 || 0) / 2) * 2); // 10 Kasım (Patron): repete en az 40 adet
  return `Fuat Bey merhaba, ${x.kod} modelinden repete rica ediyoruz: ${renk}. Toplam yaklaşık ${adet} adet. Ne zaman hazır olur?`;
}
export const hatirlatmaTaslagi = (f) => `Fuat Bey merhaba, ${f.kod} siparişi (${gunYaz(f.gonderim)}) için cevabınızı bekliyoruz. Ne zaman hazır olur?`;
