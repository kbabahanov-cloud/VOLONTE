// VENOM – HER SORUYA TAM CEVAP (9 Kasım, Patron): bot sorusunda dönem (bugün / dün / bu hafta / geçen hafta / bu ay) + BÜTÜN kaynaklar.
// Sadece iş defteri değil: kanal kaydı (Kemal), site defteri (Selin), fabrika kayıtları + Vegawin (Sami), üretim arşivi / harcama /
// bakiye (Pelin), senaryolar (Nora). "Bilmiyorum" sadece hiçbir kaynakta yoksa — o zaman da hangi kaynaklara bakıldığı yazılır.
// Bu dosya saf: dönem hesabı + soru çözümü + metin. Veriyi venom-bot.js toplar.
const SAAT_FARKI = 3 * 3600;
const gunBasi = (t) => t - ((t + SAAT_FARKI) % 86400);
export const DONEMLER = ["bugün", "dün", "bu hafta", "geçen hafta", "bu ay"];
export function donemAraligi(simdi, donem = "bugün") {
  const b = gunBasi(simdi);
  const hg = (new Date((simdi + SAAT_FARKI) * 1000).getUTCDay() + 6) % 7; // pazartesi = 0
  const ayBasi = b - (new Date((simdi + SAAT_FARKI) * 1000).getUTCDate() - 1) * 86400;
  if (donem === "dün") return [b - 86400, b - 1];
  if (donem === "bu hafta") return [b - hg * 86400, simdi];
  if (donem === "geçen hafta") return [b - (hg + 7) * 86400, b - hg * 86400 - 1];
  if (donem === "bu ay") return [ayBasi, simdi];
  return [b, simdi];
}
export function donemBul(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  if (/geçen\s*hafta|gecen\s*hafta/.test(t)) return "geçen hafta";
  if (/bu\s*hafta|haftalık|hafta\s*boyunca|son\s*7\s*gün/.test(t)) return "bu hafta";
  if (/bu\s*ay|aylık|ay\s*boyunca/.test(t)) return "bu ay";
  if (/\bdün\b/.test(t)) return "dün";
  return "bugün";
}
// Sorunun parçaları (her biri ayrı satırla cevaplanır)
export function soruParcalari(metin) {
  const t = String(metin || "").toLocaleLowerCase("tr");
  return {
    ne: /ne\s*yapt|neler\s*yapt|ne\s*iş|rapor|ne\s*durumda|hangi\s*model/.test(t),
    para: /harca|para|maliyet|ne\s*kadar\s*tuttu|\$|dolar|masraf/.test(t),
    bakiye: /bakiye|kredi|kaldı\s*mı|higgsfield|\bfal\b/.test(t),
    bekleyen: /bekleyen|yarım|bitmemiş|bekliyor|takıl/.test(t),
    senaryo: /senaryo|nora/.test(t),
    neden: /neden|niye|niçin|nasıl\s*oldu/.test(t),
  };
}
const ad = { kemal: "Kemal", selin: "Selin", pelin: "Pelin", nora: "Nora", sami: "Sami" };
export const usd = (n) => `${(Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(".", ",")} $`;
// bolumler: [{ baslik, satirlar: [] }]; bakilan: kaynak adları. Boş bölümler yazılmaz; hepsi boşsa "hiçbir kaynakta kayıt yok".
export function raporMetni(bot, donem, bolumler, bakilan) {
  const dolu = bolumler.filter((b) => b && (b.satirlar || []).filter(Boolean).length);
  if (!dolu.length) return `${ad[bot] || bot} ${donem}: hiçbir kaynakta kayıt yok — bilmiyorum. Baktığım kaynaklar: ${bakilan.join(", ")}.`;
  const s = [`${ad[bot] || bot} — ${donem}:`];
  for (const b of dolu) { s.push(`${b.baslik}:`); for (const x of b.satirlar.filter(Boolean)) s.push(`• ${x}`); }
  s.push(`(Kaynaklar: ${bakilan.join(", ")})`);
  return s.join("\n");
}
// Kod listesi (sayı = liste): ["3627","3627","3629"] → "3627 (2), 3629"
export function kodSayili(kodlar, n = 15) {
  const m = new Map();
  for (const k of kodlar.filter(Boolean)) m.set(String(k), (m.get(String(k)) || 0) + 1);
  const l = [...m].map(([k, c]) => (c > 1 ? `${k} (${c})` : k));
  return `${l.slice(0, n).join(", ")}${l.length > n ? ` +${l.length - n} model` : ""}`;
}
