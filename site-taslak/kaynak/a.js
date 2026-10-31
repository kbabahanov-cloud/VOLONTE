// TASLAK A — "EVREN": uzayan bir evren; yıldızlar yavaşça yaklaşır. Dokununca hızlanır, bulutlar açılır.
window.TEMA = {
  ad: "A · Evren",
  vitrin: "solma",
  slaytSure: 5200,
  notalar: [196, 246.94, 293.66, 369.99],
  sahne(c) {
    const az = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const x = c.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let W, H, yildiz = [], hiz = 0.0016, hedef = 0.0016, calis = true;
    const boyut = () => {
      W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr;
      const n = Math.round(Math.min(340, (innerWidth * innerHeight) / 2600));
      yildiz = Array.from({ length: n }, () => yeni(Math.random()));
    };
    const yeni = (z) => ({ x: (Math.random() * 2 - 1) * 1.4, y: (Math.random() * 2 - 1) * 1.4, z: z || 1, a: Math.random() < 0.28 });
    addEventListener("resize", boyut);
    boyut();
    const kare = () => {
      if (!calis) return;
      x.clearRect(0, 0, W, H);
      hiz += (hedef - hiz) * 0.04;
      const f = Math.min(W, H) * 0.55;
      for (const s of yildiz) {
        const z0 = s.z;
        s.z -= hiz;
        if (s.z <= 0.02) Object.assign(s, yeni(1));
        const px = W / 2 + (s.x / s.z) * f, py = H / 2 + (s.y / s.z) * f;
        if (px < -50 || px > W + 50 || py < -50 || py > H + 50) { Object.assign(s, yeni(1)); continue; }
        const r = Math.max(0.3, (1 - s.z) * 2.2) * dpr;
        const parlak = Math.min(1, (1 - s.z) * 1.6);
        x.strokeStyle = x.fillStyle = s.a ? `rgba(236,217,166,${parlak})` : `rgba(220,228,255,${parlak * 0.9})`;
        if (hiz > 0.006) {
          const ox = W / 2 + (s.x / z0) * f, oy = H / 2 + (s.y / z0) * f;
          x.lineWidth = r; x.beginPath(); x.moveTo(ox, oy); x.lineTo(px, py); x.stroke();
        } else { x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill(); }
      }
      if (!az) requestAnimationFrame(kare);
    };
    kare();
    return { hizlan() { hedef = 0.028; }, dur() { calis = false; removeEventListener("resize", boyut); } };
  },
  // Bulutlar/sis toplanır, sonra dışarı doğru açılır; site arkadan belirir.
  gecis(giris) {
    const sis = giris.querySelector(".sis");
    const bulutlar = [...sis.children];
    const yerler = [[-5, -5], [45, -10], [-10, 40], [40, 35], [10, 70], [55, 65], [25, 20]];
    bulutlar.forEach((b, i) => { b.style.left = `${yerler[i][0]}%`; b.style.top = `${yerler[i][1]}%`; b.style.background = "radial-gradient(closest-side, rgba(235,238,250,.8), rgba(170,182,215,.32) 55%, transparent)"; });
    sis.style.opacity = 1;
    const yazi = giris.querySelector(".giris-yazi");
    yazi.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.25)", filter: "blur(8px)" }], { duration: 1100, easing: "ease-in", fill: "forwards" });
    const anim = bulutlar.map((b, i) => {
      const dx = (yerler[i][0] - 25) * 2.4, dy = (yerler[i][1] - 30) * 2.4;
      return b.animate([
        { opacity: 0, transform: "scale(.6)" },
        { opacity: 1, transform: "scale(1.1)", offset: 0.35 },
        { opacity: 0, transform: `translate(${dx}vw, ${dy}vh) scale(2.2)` },
      ], { duration: 2300, delay: i * 40, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" });
    });
    giris.animate([{ backgroundColor: "rgba(5,6,11,1)" }, { backgroundColor: "rgba(5,6,11,1)", offset: 0.4 }, { backgroundColor: "rgba(5,6,11,0)" }], { duration: 2300, fill: "forwards" });
    giris.querySelector("canvas").animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 2300, fill: "forwards" });
    return Promise.all(anim.map((a) => a.finished));
  },
  // İsimler çok yavaş süzülür (sağdan sola), çok soluk.
  isimler(kap) {
    [...kap.children].forEach((s, i) => {
      s.style.top = `${12 + i * 22}%`;
      s.animate([{ transform: "translateX(100vw)" }, { transform: "translateX(-110%)" }], { duration: 70000 + i * 9000, delay: -i * 17000, iterations: Infinity });
    });
  },
};
