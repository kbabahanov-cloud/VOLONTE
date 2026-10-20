// Eski kanal paylaşımlarını kod dizinine çevirir.
// Girdi: Telegram Desktop → kanal → ⋮ → "Sohbet geçmişini dışa aktar" → biçim JSON
//        (fotoğraf/video işaretlemeye gerek yok) → result.json
// Çalıştırma: node telegram-bot/ice-aktar.mjs result.json > kodlar-eski.json
// Çıktı, botun "kodlar" kaydıyla aynı biçimdedir; Claude mevcut kayıtla birleştirip yükler.
import { readFileSync } from "node:fs";
import { kodBul, kodEkle } from "./worker.js";

export function metinAl(m) {
  if (typeof m.text === "string") return m.text;
  if (Array.isArray(m.text)) return m.text.map((p) => (typeof p === "string" ? p : p.text || "")).join("");
  return "";
}

const medyaVar = (m) => Boolean(m.photo || m.media_type || m.file);

// Albüm parçaları dışa aktarımda ayrı mesajlardır: arka arkaya, aynı saniyede, medyalı.
export function gruplaVeDizinle(mesajlar) {
  // Dışa aktarımda kimlik ve tarih bazen metin ("13696") olarak gelir.
  const liste = mesajlar
    .filter((m) => m.type === "message")
    .map((m) => ({ ...m, id: Number(m.id) }))
    .sort((a, b) => a.id - b.id);
  const gruplar = [];
  for (const m of liste) {
    const tarih = Number(m.date_unixtime);
    const son = gruplar[gruplar.length - 1];
    if (son && medyaVar(m) && son.medya && son.tarih === tarih && m.id - son.ids[son.ids.length - 1] <= 2) {
      son.ids.push(m.id);
      son.metin += metinAl(m);
    } else {
      gruplar.push({ ids: [m.id], tarih, medya: medyaVar(m), metin: metinAl(m) });
    }
  }
  const kodlar = {};
  for (const g of gruplar) {
    const kod = kodBul(g.metin);
    if (kod && g.medya) kodEkle(kodlar, kod, { ids: g.ids, tarih: g.tarih, album: null });
  }
  return kodlar;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const veri = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const kodlar = gruplaVeDizinle(veri.messages || []);
  console.error(`${Object.keys(kodlar).length} kod bulundu.`);
  process.stdout.write(JSON.stringify(kodlar));
}
