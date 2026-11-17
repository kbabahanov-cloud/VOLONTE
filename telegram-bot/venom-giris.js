// Venom'un Cloudflare giriş dosyası: venom-bot.js'in hepsi + diğer botların Patron'a giden her şeyi aktardığı iç kapı (5 Kasım).
// İnternetten erişilemez; sadece servis bağlantısıyla (Kemal, Selin, Pelin, Sami).
import { WorkerEntrypoint } from "cloudflare:workers";
import { aktarilanGonder, venomSesYazi, venomFabrikaKontrol } from "./venom-bot.js";
export * from "./venom-bot.js";
export { default } from "./venom-bot.js";
export class VenomKapi extends WorkerEntrypoint {
  async aktar(kayit) { await aktarilanGonder(this.env, kayit); return true; }
  async sesYazi(bayt, sure) { return venomSesYazi(this.env, bayt, sure); } // 10 Kasım: Sami'deki fabrika kişilerinin sesli mesajı
  async fabrikaKontrol(g) { return venomFabrikaKontrol(this.env, g); } // 16 Kasım (Patron): fabrikaya giden her kart önce Venom'dan geçer
  async selinDurum(kod) { return this.env.SELIN_W && typeof this.env.SELIN_W.durum === "function" ? this.env.SELIN_W.durum(String(kod)) : null; } // 17 Kasım: Pelin (mağaza hattı yolu) "Merdan'ın bugünkü listesinde mi?" (salt okuma)
}
