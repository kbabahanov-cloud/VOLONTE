// Kemal'in Cloudflare giriş dosyası: worker.js'in hepsi + Venom'un iç bağlantıyla kullandığı kapı (tek kapı, 5 Kasım).
// (Testler worker.js'i doğrudan kullanır; "cloudflare:workers" sadece burada.)
import { WorkerEntrypoint } from "cloudflare:workers";
import { botSagligi, sonHata } from "./saglik.js";
import { venomDugme, venomMesaj, akisDenemesi } from "./worker.js";
export * from "./worker.js";
export { default } from "./worker.js";
export class VenomKapisi extends WorkerEntrypoint {
  async dugme(data, rid) { return venomDugme(this.env, data, rid); }
  async mesaj(metin) { return venomMesaj(this.env, metin); }
  async saglik() { return botSagligi(this.env, async () => { const k = await this.env.KAYIT.get("kanal", "json"); if (!k || !k.id) return { sorun: "kanal kaydı yok" }; const h = (await sonHata(this.env, "kemal:sonHata")) || (await sonHata(this.env, "kemal:pelinTeslimHata")); if (h) return { sorun: h }; const a = await akisDenemesi(this.env).catch((e) => ({ ok: false, sorun: `akış denemesi: ${String(e && e.message).slice(0, 80)}` })); return a.ok ? { bilgi: `kanal bağlı · ${a.bilgi}` } : { sorun: a.sorun }; }); } // 6 Kasım: 09:30 testi
}
