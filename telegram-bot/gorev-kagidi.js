// 10 Kasım (Patron) — BÜYÜK DÜZEN, GÖREV KÂĞITLARI: her bot SADECE kendi kâğıdındaki işleri yapar.
// Kâğıtta olmayan otomatik işler, zamanlayıcılar, hatırlatmalar ve kartlar burada KAPALI.
// Kapı sadece yüklemede KAGIT=1 bağlıysa çalışır (testler eski davranışı görür).
// Bir işi yeniden açmak (Patron onayıyla): KV "kagit:ac" = ["kemal:katalog", ...]
export const KAPALI = {
  kemal: {
    katalog: "fotoğraf tanıma kataloğu (arka planda yapay zekâ)",
    altyazi: "arşiv alt yazısı yazdırma (arka planda yapay zekâ)",
    kartTekrar: "cevapsız kartları yeniden gönderme (hatırlatma)",
    kartTamamla: "yarım kartları tamamlama (yeniden gönderme)",
    kartIlet: "kartı başka kişiye iletme",
    kisiKontrol: "/start kontrol hatırlatması",
    grupRaporu: "sabah 09:15 grup raporu (Venom'a not bırakma açık)",
    topluRapor: "09:40 toplu rapor (Venom'un işi)",
    aylikRapor: "aylık rapor",
    aksamRaporu: "akşam raporu",
    yzUyari: "yapay zekâ %80 harcama uyarısı (para alarmı Venom'da)",
    stokSorulari: "stok soruları (Sami'nin işi)",
    repeteRaporu: "Pzt/Çar/Cum repete raporu Patron'a (Sami/Venom'un işi)",
    repeteAcil: "saatlik acil repete kartı Patron'a (Sami/Venom'un işi)",
    turEksikleri: "sonradan gelene eski tur kartları",
    musteriYZ: "müşteriye yapay zekâ cevabı (Patron 10 Kasım: KAPALI; mesajlar Hemra'ya)",
  },
};

export async function kagitAcik(env, bot, is) {
  if (!(KAPALI[bot] || {})[is]) return true;
  if (String(env.KAGIT || "") !== "1") return true;
  const ac = await env.KAYIT.get("kagit:ac", "json").catch(() => null);
  return Array.isArray(ac) && ac.includes(`${bot}:${is}`);
}

export const kapaliListe = (bot) => Object.entries(KAPALI[bot] || {}).map(([k, v]) => `${k}: ${v}`);
