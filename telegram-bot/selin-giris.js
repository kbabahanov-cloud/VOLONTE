// Selin'in Cloudflare giriş dosyası: selin.js'in hepsi + diğer botların ve sitenin iç bağlantıyla kullandığı depo okuyucu.
// (Testler selin.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { botSagligi, sonHata } from "./saglik.js";
import { siteVerisi } from "./depo-oku.js";
import { siteKontrol } from "./yayin-kontrol.js";
import { depoDosya } from "./depo-oku.js";
import { venomDugme, venomMesaj, venomSelin } from "./selin.js";
export * from "./selin.js";
export { default } from "./selin.js";
export class SelinDepo extends WorkerEntrypoint {
  async dosya(yol) { return depoDosya(this.env, yol); }
}
export class VenomKapisi extends WorkerEntrypoint { // tek kapı (5 Kasım): Venom → Selin
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
  async durum(kod) { return venomSelin(this.env, "/venom/durum", kod); }
  async ozet() { return venomSelin(this.env, "/venom/ozet", null); } // 9 Kasım: Venom'un canlı sorusu
  async taslak(kod) { return venomSelin(this.env, "/venom/taslak", kod); }
  async saglik() { return botSagligi(this.env, async () => { const l = await siteVerisi(this.env); const h = await sonHata(this.env, "selin:hata"); if (!Array.isArray(l) || !l.length) return { sorun: "site verisi okunamadı" }; if (h) return { sorun: h }; const k = siteKontrol(l, []); return k.ok ? { bilgi: `site okundu (${l.length} model) · akış denemesi: site kontrolü ${k.notlar.length ? `${k.notlar.length} tekrar/kolaj bulur` : "temiz"} (yazılmadı)` } : { sorun: `akış denemesi: ${k.sorunlar.join("; ")}` }; }); } // 6 Kasım: 09:30 testi
}
