// VENOM köprüsü (3 Kasım): Venom'un onaylanan işleri diğer botlara bu kuyruklarla gider; sonuçlar Venom'a döner.
//  • "giden"   → Sami (mesaj Fuat/Nuri/Merdan/Hemra'ya, Fuat'a mutabakat)
//  • "pelinIs" → Pelin (foto + video üretimi)
//  • "sonuc"   → Venom ("✅ yapıldı" / "⚠️ olmadı" Patron'a)
// Kuyruklar StokDO'da (ekle/al tek adım; KV gibi gecikmeli değil → iş kaybolmaz, iki kez gitmez).
import { ekipSuzgec } from "./venom-yonetim.js";
import { stokIste } from "./stokbot.js";
import { fuatSuzgec, arsiv, venomMutabakatGonder } from "./mutabakat.js";

const kimlikler = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

// Kişiler (rol → Telegram kimliği; kimlikler gizli kayıtta). dis: güvenlik süzgecinden geçer.
export const KISILER = {
  fuat: { ad: "Fuat", e: "Fuat'a", in: "Fuat'ın", dis: true, id: (env) => kimlikler(env.FUAT_ID)[0] },
  nuri: { ad: "Nuri", e: "Nuri'ye", in: "Nuri'nin", dis: true, id: (env) => kimlikler(env.NURI_ID)[0] },
  merdan: { ad: "Merdan", e: "Merdan'a", in: "Merdan'ın", dis: false, id: (env) => kimlikler(env.BR_SORUMLU)[0] },
  aziz: { ad: "Aziz", e: "Aziz'e", in: "Aziz'in", dis: false, id: (env) => kimlikler(env.AZIZ_ID)[0] }, // 9 Kasım: VOLONTE stoğu
  hemra: { ad: "Hemra", e: "Hemra'ya", in: "Hemra'nın", dis: false, id: (env) => kimlikler(env.HEMRA_ID)[0] || kimlikler(env.FABRIKA_SORUMLU)[0] },
};

export const kuyrugaEkle = (env, ad, kayit) => stokIste(env, "/kuyruk-ekle", { ad, kayit });
export const kuyruguAl = async (env, ad) => { const l = await stokIste(env, "/kuyruk-al", { ad }); return Array.isArray(l) ? l : []; };
export const sonucBildir = (env, id, ok, aciklama) => kuyrugaEkle(env, "sonuc", { id: `${id}:${ok ? 1 : 0}`, isId: id, ok, aciklama: String(aciklama).slice(0, 1500) });

// 9 Kasım (sert müdür C): görev kartının kopyaları (Hemra + Merdan) — biri basınca ikisi de güncellenir (venom-gorev.js)
async function gorevMesajiKaydet(env, is, r, hedef) {
  const anahtar = is.gorev ? `gorevmsg:vg:${is.gorev}:${is.parca || 0}` : `gorevmsg:${String(is.id).replace(/-[a-z]+$/, "")}`;
  const l = (await env.KAYIT.get(anahtar, "json").catch(() => null)) || [];
  await env.KAYIT.put(anahtar, JSON.stringify([...l, [(r.result.chat && r.result.chat.id) || hedef, r.result.message_id]].slice(-6)), { expirationTtl: 14 * 86400 });
  if (is.gorev && !(await env.KAYIT.get(`gorevklavye:${is.gorev}:${is.parca || 0}`).catch(() => null))) await env.KAYIT.put(`gorevklavye:${is.gorev}:${is.parca || 0}`, JSON.stringify(is.klavye.inline_keyboard), { expirationTtl: 14 * 86400 });
}
// Sami: Venom'dan gelen dış mesajları gönderir (Patron kartı onaylamış ve "Emin misiniz?" demiş olarak gelir)
export async function venomGidenAdimi(env, simdi, tg) {
  const isler = await kuyruguAl(env, "giden");
  for (const is of isler) {
    try {
      const k = KISILER[is.kime];
      if (!k) { await sonucBildir(env, is.id, false, `Kişi tanınmadı (${is.kime}).`); continue; }
      if (is.tur === "mutabakat") {
        const s = await venomMutabakatGonder(env, tg, is.icerik, is.onaylayan, simdi);
        await sonucBildir(env, is.id, s === true, s === true ? "Mutabakat Fuat'a gönderildi (Sami). Cevabını bildireceğim." : s === false ? "Mutabakat gönderilmedi: güvenlik süzgeci durdurdu." : "Mutabakat gönderilemedi: Fuat, Sami'ye /start yazmamış olabilir.");
        continue;
      }
      const hedef = k.id(env);
      if (!hedef) { await sonucBildir(env, is.id, false, `${k.in} Telegram kimliği kayıtlı değil.`); continue; }
      { // 6 Kasım (Patron): fiyat/satış/kâr bilgisi Patron dışında KİMSEYE gitmez (ekip dahil)
        const yasak = k.dis ? fuatSuzgec(is.metin) : ekipSuzgec(is.metin);
        if (yasak) { await arsiv(env, "venom-engel", is.id, { kime: is.kime, neden: yasak }, simdi); await sonucBildir(env, is.id, false, `${k.e} mesaj GİTMEDİ: gizli bilgi içeriyor (${yasak.join(", ")}).`); continue; }
      }
      // 11 Kasım (Patron, ACİL): fabrikaya (Fuat / Nuri) "test" / "deneme" içerikli mesaj DENEME başlığı olmadan ASLA gitmez
      if (k.dis && /\b(test|deneme)\b/i.test(String(is.metin)) && !/^🧪 DENEME/.test(String(is.metin))) is.metin = `🧪 DENEME — Bu bir deneme, üretim yapmayın.\n${is.metin}`;
      // 11 Kasım (Patron, ACİL): AYNI kişiye AYNI mesaj 24 saat içinde ikinci kez gitmez (kart her seferinde yeni olsa bile)
      const izK = `giden:son:${is.kime}`, iz = String(is.metin).replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
      const gecmis = ((await stokIste(env, "/ayar-oku", { k: izK }).catch(() => ({}))).v || "[]");
      const l = (() => { try { return JSON.parse(gecmis).filter((x) => simdi - x.zaman < 86400); } catch { return []; } })();
      const once = !is.klavye && l.find((x) => x.iz === iz);
      if (once) { await arsiv(env, "venom-engel", is.id, { kime: is.kime, neden: ["aynı mesaj 24 saat içinde gitmişti"] }, simdi); await sonucBildir(env, is.id, false, `${k.e} aynı mesaj ${new Date((once.zaman + 3 * 3600) * 1000).toISOString().slice(11, 16)}'de zaten gitmişti; ikinci kez GÖNDERİLMEDİ.`); continue; }
      const r = await tg(env, "sendMessage", { chat_id: hedef, text: String(is.metin).slice(0, 4000), disable_web_page_preview: true, ...(is.klavye ? { reply_markup: is.klavye } : {}) });
      if (r && r.ok && !is.klavye) await stokIste(env, "/ayar-yaz", { k: izK, v: JSON.stringify([...l, { zaman: simdi, iz }].slice(-50)) }).catch(() => null);
      if (r && r.ok) await arsiv(env, "venom-gitti", is.id, { kime: is.kime, metin: is.metin, mesaj: r.result.message_id }, simdi);
      if (r && r.ok && is.klavye) await gorevMesajiKaydet(env, is, r, hedef).catch(() => null); // 9 Kasım: görev kartı kopyaları (Hemra + Merdan)
      await sonucBildir(env, is.id, Boolean(r && r.ok), r && r.ok ? `${is.tur === "hatirlatma" ? "Hatırlatma" : "Mesaj"} ${k.e} gitti (Sami).` : `${k.e} gönderilemedi (Sami'ye /start yazmamış olabilir).`);
    } catch (e) {
      await sonucBildir(env, is.id, false, `İş yapılamadı (${is.kime || is.tur}); hata Claude Code'a iletildi.`).catch(() => null);
      await hataEkle(env, "sami:giden", e);
    }
  }
  return isler.length;
}

// Pelin: Venom'dan gelen üretim işleri
export async function venomPelinAdimi(env, simdi, uretimBaslat) {
  const isler = await kuyruguAl(env, "pelinIs");
  for (const is of isler) {
    try {
      const s = await uretimBaslat(env, { kodlar: is.kodlar, test: Boolean(is.test), sablonAd: null }, simdi);
      const ok = Boolean(s && s.ok);
      await sonucBildir(env, is.id, ok, ok ? (s.mesaj || `Pelin ${is.test ? "maliyet testine" : "üretime"} başladı: ${is.kodlar.join(", ")}. Hazır olanlar onayınıza gelecek.`) : `Pelin başlamadı: ${(s && s.hata) || "bilinmeyen sorun"}. Para harcanmadı.`);
    } catch (e) {
      await sonucBildir(env, is.id, false, "Pelin üretime başlayamadı; hata Claude Code'a iletildi.").catch(() => null);
      await hataEkle(env, "pelin:venomIs", e);
    }
  }
  return isler.length;
}

// Bot hataları Patron'a değil, Claude Code'a (KV "venom:bot:hata")
export async function hataEkle(env, yer, e) {
  const l = (await env.KAYIT.get("venom:bot:hata", "json")) || [];
  l.push({ zaman: Math.floor(Date.now() / 1000), yer, hata: String((e && (e.stack || e.message)) || e).slice(0, 600) });
  await env.KAYIT.put("venom:bot:hata", JSON.stringify(l.slice(-30)), { expirationTtl: 14 * 86400 });
}
