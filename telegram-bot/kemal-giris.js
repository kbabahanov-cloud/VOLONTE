// Kemal'in Cloudflare giriş dosyası: worker.js'in hepsi + Venom'un iç bağlantıyla kullandığı kapı (tek kapı, 5 Kasım).
// (Testler worker.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { botSagligi, sonHata } from "./saglik.js";
import { venomDugme, venomMesaj } from "./worker.js";
export * from "./worker.js";
export { default } from "./worker.js";
export class VenomKapisi extends WorkerEntrypoint {
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
  async saglik() { return botSagligi(this.env, async () => { const k = await this.env.KAYIT.get("kanal", "json"); if (!k || !k.id) return { sorun: "kanal kaydı yok" }; const h = (await sonHata(this.env, "kemal:sonHata")) || (await sonHata(this.env, "kemal:pelinTeslimHata")); return h ? { sorun: h } : { bilgi: "kanal bağlı, iletim çalışıyor" }; }); } // 6 Kasım: 09:30 testi
}
