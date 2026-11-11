// Sami'nin Cloudflare giriş dosyası: sami.js'in hepsi + Venom'un iç bağlantıyla kullandığı kapı (tek kapı, 5 Kasım).
import { WorkerEntrypoint } from "cloudflare:workers";
import { botSagligi, sonHata } from "./saglik.js";
import { venomDugme, venomMesaj, repeteAdim, gidenAdim } from "./sami.js";
export * from "./sami.js";
export { default } from "./sami.js";
export class VenomKapisi extends WorkerEntrypoint {
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
  async gidenAdim() { return gidenAdim(this.env); } // 11 Kasım: Venom'un ekibe verdiği iş HEMEN gider
  async repeteAdim() { return repeteAdim(this.env); } // 11 Kasım: Patron kararı / "tekrar aç" Sami'ye HEMEN
  async saglik() { return botSagligi(this.env, async () => { const r = await this.env.STOK.get(this.env.STOK.idFromName("stok")).fetch("https://stok/toplu", { method: "POST", body: JSON.stringify({ kodlar: ["3627"] }) }); if (!r.ok) return { sorun: `stok deposu cevap vermedi (${r.status})` }; await r.json(); const h = await sonHata(this.env, "sami:hata"); return h ? { sorun: h } : { bilgi: "stok okundu" }; }); } // 6 Kasım: 09:30 testi
}
