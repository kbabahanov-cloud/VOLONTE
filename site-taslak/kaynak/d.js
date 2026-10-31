// TASLAK D — "SİNEMA": saf siyah perde, ışık çizgisi, ritimli model kesitleri, büyük başlık.
// Arka planda sahne yok (en sade ve en hızlı); site ışık açılır gibi, hafif uzaklaşarak belirir. İçerisi en ferah düzen.
window.TEMA = {
  ad: "D · Sinema",
  vitrin: "solma",
  slaytSure: 4600,
  sahne() { return null; },
  gecis(giris, site) {
    giris.querySelector(".giris-yazi").animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.35)", filter: "blur(12px)" }], { duration: 1100, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" });
    site.animate([{ opacity: 0, transform: "scale(1.06)" }, { opacity: 0, transform: "scale(1.06)", offset: 0.25 }, { opacity: 1, transform: "none" }], { duration: 1500, easing: "cubic-bezier(.2,.7,.2,1)" });
    return giris.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1500, fill: "forwards" }).finished;
  },
  // İsimler: ekranın ortasında çok soluk, sırayla belirip kaybolur
  isimler(kap) {
    [...kap.children].forEach((s, i) => {
      s.style.left = "50%"; s.style.top = `${[30, 62, 30, 62][i]}%`;
      s.animate([{ opacity: 0, transform: "translate(-50%, 0) scale(.97)" }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: "translate(-50%, 0) scale(1.03)" }], { duration: 20000, delay: i * 5000, iterations: Infinity, fill: "both" });
    });
  },
};
