// Pelin'in Cloudflare giriş dosyası: pelin.js'in hepsi + Venom'un iç bağlantıyla kullandığı anahtar köprüsü.
// (Testler pelin.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { kopruIstegi } from "./anahtar-kopru.js";
export * from "./pelin.js";
export { default } from "./pelin.js";
export class AnahtarKopru extends WorkerEntrypoint {
  async fetch(istek) { return kopruIstegi(this.env, istek); }
}
