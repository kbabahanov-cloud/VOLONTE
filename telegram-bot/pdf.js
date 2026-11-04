// Basit PDF üretici (2 Kasım, mutabakat arşivi): satır satır metin, A4, eş aralıklı yazı (DejaVu Sans Mono alt kümesi
// gömülü → Türkçe harfler doğru). Dış kütüphane yok; yazı tipi PDF'e "FontFile2" olarak gömülür, metin glif numarasıyla
// yazılır (Identity-H) ve kopyalanabilsin diye ToUnicode eşlemesi eklenir. Emoji gibi yazı tipinde olmayan işaretler atılır.
import { MONO_TTF } from "./fontlar/mono.js";

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const i16 = (b, o) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function bayt(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// TrueType: tablo yeri, birim, kutu, yükseklikler, genişlik ve karakter → glif eşlemesi (cmap biçim 4)
export function yaziTipiOku(b) {
  const tablolar = {};
  for (let i = 0, n = u16(b, 4); i < n; i++) {
    const o = 12 + i * 16;
    tablolar[String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])] = { yer: u32(b, o + 8), boy: u32(b, o + 12) };
  }
  const head = tablolar.head.yer, hhea = tablolar.hhea.yer, hmtx = tablolar.hmtx.yer, cmap = tablolar.cmap.yer;
  const birim = u16(b, head + 18);
  const olc = (v) => Math.round((v * 1000) / birim);
  const harita = new Map();
  for (let i = 0, n = u16(b, cmap + 2); i < n; i++) {
    const r = cmap + 4 + i * 8;
    const alt = cmap + u32(b, r + 4);
    if (u16(b, r) !== 3 || u16(b, r + 2) !== 1 || u16(b, alt) !== 4) continue;
    const seg = u16(b, alt + 6) / 2;
    const son = alt + 14, bas = son + seg * 2 + 2, fark = bas + seg * 2, aralik = fark + seg * 2;
    for (let s = 0; s < seg; s++) {
      const e = u16(b, son + s * 2), st = u16(b, bas + s * 2), d = i16(b, fark + s * 2), ro = u16(b, aralik + s * 2);
      for (let c = st; c <= e && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + d) & 0xffff;
        else { const yer = aralik + s * 2 + ro + (c - st) * 2; g = u16(b, yer); if (g) g = (g + d) & 0xffff; }
        if (g) harita.set(c, g);
      }
    }
    break;
  }
  return {
    harita,
    genislik: olc(u16(b, hmtx)),
    kutu: [olc(i16(b, head + 36)), olc(i16(b, head + 38)), olc(i16(b, head + 40)), olc(i16(b, head + 42))],
    yukari: olc(i16(b, hhea + 4)), asagi: olc(i16(b, hhea + 6)),
  };
}

async function sikistir(veri) {
  if (typeof CompressionStream === "undefined") return null;
  const akis = new Blob([veri]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");

// satirlar: dizi (her biri bir satır). Uzun satır sayfa genişliğinde bölünür. Döner: Uint8Array (PDF).
export async function pdfOlustur(satirlar, { baslik = "Mutabakat", boyut = 9 } = {}) {
  const font = bayt(MONO_TTF);
  const yt = yaziTipiOku(font);
  const soru = yt.harita.get(63);
  const kullanilan = new Map();
  const kodla = (metin) => {
    let h = "";
    for (const ch of metin) {
      const c = ch.codePointAt(0);
      let g = yt.harita.get(c);
      if (!g) { if (c > 0xffff || c === 0xfe0f || c === 0x200d) continue; g = soru; }
      kullanilan.set(g, c);
      h += hex4(g);
    }
    return `<${h}>`;
  };
  // Sayfa düzeni: A4, kenar 40 pt
  const [gen, yuk, kenar, satirAra] = [595, 842, 40, boyut * 1.35];
  const sigan = Math.floor((gen - 2 * kenar) / ((yt.genislik / 1000) * boyut));
  const sayfaSatir = Math.floor((yuk - 2 * kenar) / satirAra);
  const duz = [];
  for (const s of satirlar.map(String)) {
    const yazilir = (ch) => yt.harita.has(ch.codePointAt(0)) || ch.codePointAt(0) < 0x2000;
    let temiz = [...s].filter(yazilir).join("").replace(/\s+$/, "");
    if (s.length && !yazilir([...s][0])) temiz = temiz.replace(/^\s+/, ""); // baştaki emoji atılınca boşluk kalmasın
    if (!temiz.length) { duz.push(""); continue; }
    for (let i = 0; i < temiz.length; i += sigan) duz.push(temiz.slice(i, i + sigan));
  }
  const sayfalar = [];
  for (let i = 0; i < Math.max(duz.length, 1); i += sayfaSatir) sayfalar.push(duz.slice(i, i + sayfaSatir));

  const nesneler = []; // [no] = Uint8Array parçaları
  const metin = (s) => new TextEncoder().encode(s);
  const ekle = (parcalar) => { nesneler.push(parcalar); return nesneler.length; };
  const akisNesne = async (sozluk, veri) => {
    const sik = await sikistir(veri);
    const v = sik || veri;
    return ekle([metin(`<< ${sozluk} /Length ${v.length}${sik ? " /Filter /FlateDecode" : ""} >>\nstream\n`), v, metin("\nendstream")]);
  };
  // 1 katalog, 2 sayfalar (sonra doldurulur)
  ekle(null); ekle(null);
  const icerikler = [];
  for (const [n, sayfa] of sayfalar.entries()) {
    const govde = [`BT /F1 ${boyut} Tf ${satirAra.toFixed(2)} TL ${kenar} ${yuk - kenar - boyut} Td`];
    for (const s of sayfa) govde.push(`${kodla(s)} Tj T*`);
    govde.push("ET");
    govde.push(`BT /F1 7 Tf ${kenar} 20 Td ${kodla(`${baslik} · sayfa ${n + 1}/${sayfalar.length}`)} Tj ET`);
    icerikler.push(await akisNesne("", metin(govde.join("\n"))));
  }
  const fontDosya = await akisNesne(`/Length1 ${font.length}`, font);
  const tanim = ekle([metin(`<< /Type /FontDescriptor /FontName /DejaVuSansMono /Flags 33 /FontBBox [${yt.kutu.join(" ")}] /ItalicAngle 0 /Ascent ${yt.yukari} /Descent ${yt.asagi} /CapHeight ${yt.yukari} /StemV 80 /FontFile2 ${fontDosya} 0 R >>`)]);
  const cid = ekle([metin(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSansMono /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${tanim} 0 R /DW ${yt.genislik} /CIDToGIDMap /Identity >>`)]);
  const eslesme = [...kullanilan.entries()].sort((a, b) => a[0] - b[0]);
  const bf = [];
  for (let i = 0; i < eslesme.length; i += 100) {
    const p = eslesme.slice(i, i + 100);
    bf.push(`${p.length} beginbfchar\n${p.map(([g, c]) => `<${hex4(g)}> <${hex4(c)}>`).join("\n")}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n${bf.join("\n")}\nendcmap CMapName currentdict /CMap defineresource pop end end`;
  const touni = await akisNesne("", metin(cmap));
  const f1 = ekle([metin(`<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSansMono /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${touni} 0 R >>`)]);
  const sayfaNo = icerikler.map((ic) => ekle([metin(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${gen} ${yuk}] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${ic} 0 R >>`)]));
  nesneler[0] = [metin("<< /Type /Catalog /Pages 2 0 R >>")];
  nesneler[1] = [metin(`<< /Type /Pages /Kids [${sayfaNo.map((n) => `${n} 0 R`).join(" ")}] /Count ${sayfaNo.length} >>`)];
  const bilgi = ekle([metin(`<< /Title ${kodlaBilgi(baslik)} /Producer (Sayim Sami) >>`)]);

  const parca = [metin("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let yer = parca[0].length;
  const yerler = [];
  for (const [i, p] of nesneler.entries()) {
    yerler.push(yer);
    const tum = [metin(`${i + 1} 0 obj\n`), ...p, metin("\nendobj\n")];
    for (const x of tum) { parca.push(x); yer += x.length; }
  }
  const xref = `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n${yerler.map((y) => `${String(y).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R /Info ${bilgi} 0 R >>\nstartxref\n${yer}\n%%EOF\n`;
  parca.push(metin(xref));
  const cikti = new Uint8Array(parca.reduce((t, x) => t + x.length, 0));
  let o = 0;
  for (const x of parca) { cikti.set(x, o); o += x.length; }
  return cikti;
}

// Bilgi sözlüğündeki başlık: UTF-16BE (Türkçe harfler için)
function kodlaBilgi(s) {
  let h = "FEFF";
  for (const ch of s) { const c = ch.codePointAt(0); if (c <= 0xffff) h += hex4(c); }
  return `<${h}>`;
}
