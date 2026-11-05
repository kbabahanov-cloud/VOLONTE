// Selin'in Cloudflare giriş dosyası: selin.js'in hepsi + diğer botların ve sitenin iç bağlantıyla kullandığı depo okuyucu.
// (Testler selin.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { depoDosya } from "./depo-oku.js";
import { venomDugme, venomSelin } from "./selin.js";
export * from "./selin.js";
export { default } from "./selin.js";
export class SelinDepo extends WorkerEntrypoint {
  async dosya(yol) { return depoDosya(this.env, yol); }
}
export class VenomKapisi extends WorkerEntrypoint { // tek kapı (5 Kasım): Venom → Selin
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async durum(kod) { return venomSelin(this.env, "/venom/durum", kod); }
  async taslak(kod) { return venomSelin(this.env, "/venom/taslak", kod); }
}
