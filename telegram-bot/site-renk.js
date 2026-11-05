// Site açıklamasındaki RENK satırı (5 Kasım, Patron kuralı): modele yeni renk eklenince açıklamadaki renkler de güncellenir.
// Ürün kaydında "renkler" (Türkçe, sıra korunur) tutulur; her dilin açıklamasının SONUNA tek renk satırı yazılır
// (eskisi silinip yenisi konur). Bilinmeyen renk UYDURULMAZ: çevrilemeyen renk varsa satır yazılmaz (null).
const R = {
  siyah: ["black", "noir", "preto"], beyaz: ["white", "blanc", "branco"], bordo: ["burgundy", "bordeaux", "bordô"],
  "kırmızı": ["red", "rouge", "vermelho"], lacivert: ["navy", "bleu marine", "azul-marinho"], mavi: ["blue", "bleu", "azul"],
  "yeşil": ["green", "vert", "verde"], bej: ["beige", "beige", "bege"], krem: ["cream", "crème", "creme"], ekru: ["ecru", "écru", "cru"],
  pembe: ["pink", "rose", "rosa"], pudra: ["powder pink", "rose poudré", "rosa empoeirado"], mor: ["purple", "violet", "roxo"],
  lila: ["lilac", "lilas", "lilás"], gri: ["grey", "gris", "cinza"], antrasit: ["anthracite", "anthracite", "antracite"],
  kahverengi: ["brown", "marron", "marrom"], kahve: ["brown", "marron", "marrom"], vizon: ["mink", "vison", "vison"], taba: ["tan", "camel", "caramelo"],
  haki: ["khaki", "kaki", "cáqui"], "zümrüt": ["emerald", "émeraude", "esmeralda"], mint: ["mint", "menthe", "menta"],
  "fuşya": ["fuchsia", "fuchsia", "fúcsia"], "sarı": ["yellow", "jaune", "amarelo"], hardal: ["mustard", "moutarde", "mostarda"],
  turuncu: ["orange", "orange", "laranja"], somon: ["salmon", "saumon", "salmão"], mercan: ["coral", "corail", "coral"],
  "altın": ["gold", "doré", "dourado"], "gümüş": ["silver", "argenté", "prateado"], petrol: ["teal", "bleu pétrole", "azul-petróleo"],
  turkuaz: ["turquoise", "turquoise", "turquesa"], nude: ["nude", "nude", "nude"], ten: ["nude", "nude", "nude"],
};
const ON = { koyu: ["dark", "foncé", "escuro"], "açık": ["light", "clair", "claro"], acik: ["light", "clair", "claro"] };
const DIL = ["en", "fr", "pt"];
const BASLIK = { en: "Colors: ", fr: "Couleurs : ", pt: "Cores: " };
export const renkAdi = (r) => String(r || "").toLocaleLowerCase("tr").trim().replace(/\s+/g, " ");
// "koyu bordo" → { en: "dark burgundy", fr: "bordeaux foncé", pt: "bordô escuro" }; bilinmiyorsa null
export function renkDilleri(r) {
  const t = renkAdi(r);
  if (R[t]) return Object.fromEntries(DIL.map((d, i) => [d, R[t][i]]));
  const m = t.match(/^(koyu|açık|acik) (.+)$/);
  if (m && R[m[2]]) return { en: `${ON[m[1]][0]} ${R[m[2]][0]}`, fr: `${R[m[2]][1]} ${ON[m[1]][1]}`, pt: `${R[m[2]][2]} ${ON[m[1]][2]}` };
  return null;
}
export const renkBilinir = (r) => Boolean(renkDilleri(r));
const SATIR = /\s*(?:Colors|Couleurs|Cores)\s?:[^\n]*$/;
// Ürüne renk(ler) ekler ve açıklamaları günceller. Döner: { urun, degisti, eklenen, bilinmeyen }
export function renkleriUygula(urun, yeniler) {
  const eski = (urun.renkler || []).map(renkAdi);
  const eklenen = [], bilinmeyen = [];
  for (const r of (yeniler || []).map(renkAdi).filter(Boolean)) {
    if (!renkBilinir(r)) { bilinmeyen.push(r); continue; }
    if (!eski.includes(r) && !eklenen.includes(r)) eklenen.push(r);
  }
  const renkler = [...eski, ...eklenen];
  const ceviri = renkler.map(renkDilleri);
  if (!renkler.length || ceviri.some((c) => !c)) return { urun, degisti: false, eklenen: [], bilinmeyen };
  const aciklama = { ...(urun.aciklama || {}) };
  for (const d of DIL) {
    if (typeof aciklama[d] !== "string") continue;
    const govde = aciklama[d].replace(SATIR, "").trimEnd();
    aciklama[d] = `${govde}${govde ? " " : ""}${BASLIK[d]}${ceviri.map((c) => c[d]).join(", ")}.`;
  }
  const yeni = { ...urun, renkler, aciklama };
  const degisti = JSON.stringify(yeni) !== JSON.stringify(urun);
  return { urun: yeni, degisti, eklenen, bilinmeyen };
}
