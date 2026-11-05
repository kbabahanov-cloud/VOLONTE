// Pelin'in Cloudflare giriş dosyası: pelin.js'in hepsi + Venom'un iç bağlantıyla kullandığı anahtar köprüsü.
// (Testler pelin.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { botSagligi, sonHata } from "./saglik.js";
import { kopruIstegi } from "./anahtar-kopru.js";
import { venomDugme, venomMesaj, venomFotoKaydet } from "./pelin.js";
export * from "./pelin.js";
export { default } from "./pelin.js";
export class AnahtarKopru extends WorkerEntrypoint {
  async fetch(istek) { return kopruIstegi(this.env, istek); }
}
export class VenomKapisi extends WorkerEntrypoint { // tek kapı (5 Kasım): Venom → Pelin/Nora düğmesi
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
  async foto(g) { return venomFotoKaydet(this.env, g); }
  async saglik() { return botSagligi(this.env, async () => { const d = await this.env.KAYIT.get("venom:pelinDurum", "json").catch(() => null); const h = await sonHata(this.env, "pelin:hata"); return h ? { sorun: h } : { bilgi: `çalışan iş: ${(d && d.calisan) || 0}` }; }); } // 6 Kasım: 09:30 testi
}
