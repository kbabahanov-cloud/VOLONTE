// Venom'un Cloudflare giriş dosyası: venom-bot.js'in hepsi + diğer botların Patron'a giden her şeyi aktardığı iç kapı (5 Kasım).
// İnternetten erişilemez; sadece servis bağlantısıyla (Kemal, Selin, Pelin, Sami).
import { WorkerEntrypoint } from "cloudflare:workers";
import { aktarilanGonder, venomSesYazi, venomFabrikaKontrol, venomSoldOutKontrol, venomElemanCagri, venomIsKapisi, sorunKuyrugu } from "./venom-bot.js";
export * from "./venom-bot.js";
export { default } from "./venom-bot.js";
export class VenomKapi extends WorkerEntrypoint {
  async aktar(kayit) { await aktarilanGonder(this.env, kayit); return true; }
  async sesYazi(bayt, sure) { return venomSesYazi(this.env, bayt, sure); } // 10 Kasım: Sami'deki fabrika kişilerinin sesli mesajı
  async fabrikaKontrol(g) { return venomFabrikaKontrol(this.env, g); } // 16 Kasım (Patron): fabrikaya giden her kart önce Venom'dan geçer
  async elemanCagri(g) { return venomElemanCagri(this.env, g); } // 18 Kasım (kural 100, KAPALI): botun elemana giden çağrısı Venom'un botundan aynen gider
  async sorunSimdi() { return sorunKuyrugu(this.env, Math.floor(Date.now() / 1000)); } // 18 Kasım (kural 97): bot sorun yazınca Venom HEMEN alır (Patron'a anında satır); araştırma zamanlı işte
  async isKapisi(g) { return venomIsKapisi(this.env, g); } // 18 Kasım (kural 98, KURULUYOR): genel kapı — rutin / kontrol / Patron (korunan akışlara henüz bağlı değil)
  async soldOutKontrol(g) { return venomSoldOutKontrol(this.env, g); } // 18 Kasım (kural 99): her SOLD OUT Venom'dan geçer; Venom stokla karşılaştırır
  async selinDurum(kod) { return this.env.SELIN_W && typeof this.env.SELIN_W.durum === "function" ? this.env.SELIN_W.durum(String(kod)) : null; } // 17 Kasım: Pelin (mağaza hattı yolu) "Merdan'ın bugünkü listesinde mi?" (salt okuma)
}
