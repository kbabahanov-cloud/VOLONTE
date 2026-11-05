// Venom'un Cloudflare giriş dosyası: venom-bot.js'in hepsi + diğer botların Patron'a giden her şeyi aktardığı iç kapı (5 Kasım).
// İnternetten erişilemez; sadece servis bağlantısıyla (Kemal, Selin, Pelin, Sami).
import { WorkerEntrypoint } from "cloudflare:workers";
import { aktarilanGonder } from "./venom-bot.js";
export * from "./venom-bot.js";
export { default } from "./venom-bot.js";
export class VenomKapi extends WorkerEntrypoint {
  async aktar(kayit) { await aktarilanGonder(this.env, kayit); return true; }
}
