// Sami'nin Cloudflare giriş dosyası: sami.js'in hepsi + Venom'un iç bağlantıyla kullandığı kapı (tek kapı, 5 Kasım).
import { WorkerEntrypoint } from "cloudflare:workers";
import { venomDugme, venomMesaj } from "./sami.js";
export * from "./sami.js";
export { default } from "./sami.js";
export class VenomKapisi extends WorkerEntrypoint {
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
}
