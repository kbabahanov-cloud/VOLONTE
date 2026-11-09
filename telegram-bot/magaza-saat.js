// MAĞAZA SAATLERİ (9 Kasım, Patron): köprü (mağaza bilgisayarı) sadece hafta içi 09:00–20:00 izlenir.
// Cumartesi ve pazar izlenmez, uyarı verilmez. Sessizlik sadece AÇIK saatlerde sayılır: cuma 20:00'den pazartesi 09:30'a kadar
// sinyal olmaması normaldir (pazartesi bilgisayar açılınca Sami kendiliğinden başlar: oturum açılınca + her gün 08:55).
export const ACILIS = 9, KAPANIS = 20;
const SAAT_FARKI = 3 * 3600;
const gun = (t) => new Date((t + SAAT_FARKI) * 1000).getUTCDay(); // 0 pazar … 6 cumartesi
const saat = (t) => ((t + SAAT_FARKI) % 86400) / 3600;
export const haftaIci = (t) => gun(t) >= 1 && gun(t) <= 5;
export const magazaAcik = (t) => haftaIci(t) && saat(t) >= ACILIS && saat(t) < KAPANIS;
const gunBasi = (t) => t - ((t + SAAT_FARKI) % 86400);
// Bugünün açılışından (09:00) beri sinyal yok süresi (mağaza kapalıyken 0). Dün akşam erken kapanış sayılmaz.
export function bugunSessizlik(sonTemas, simdi) {
  if (!magazaAcik(simdi)) return 0;
  return Math.max(0, simdi - Math.max(sonTemas || 0, gunBasi(simdi) + ACILIS * 3600));
}
// Son sinyalden bu yana TAMAMI geçmiş bir iş günü (09–20) var mı? (köprü günlerdir ölü)
export function tamGunYok(sonTemas, simdi) {
  for (let g = gunBasi(simdi) - 86400; g > gunBasi(simdi) - 8 * 86400; g -= 86400) {
    if (!haftaIci(g + 12 * 3600)) continue;
    return (sonTemas || 0) < g + ACILIS * 3600; // en yakın geçmiş iş günü açılmadan önceki sinyal
  }
  return false;
}
// Raporda gösterilecek sessizlik (saniye): bugünkü açık süre ya da tam iş günü kaybı
export const acikSessizlik = (sonTemas, simdi) => (tamGunYok(sonTemas, simdi) ? Math.max(11 * 3600, bugunSessizlik(sonTemas, simdi)) : bugunSessizlik(sonTemas, simdi));
// Uyarı: mağaza şu an açık ve (bugün açılıştan beri 1 saatten uzun sinyal yok ya da bir önceki iş günü hiç sinyal yoktu)
export const kopruSustu = (sonTemas, simdi, esik = 3600) => magazaAcik(simdi) && (bugunSessizlik(sonTemas, simdi) > esik || tamGunYok(sonTemas, simdi));
