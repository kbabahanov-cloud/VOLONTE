// TASLAK B — "GECE DENİZİ": ay ışığında sakin bir gece denizi; dalgalar yavaşça yaklaşır.
// Dokununca denizden sis yükselir ve iki yana açılır.
window.TEMA = {
  ad: "B · Gece Denizi",
  vitrin: "serit",
  slaytSure: 4200,
  notalar: [174.61, 220, 261.63, 329.63],
  sahne(c) {
    const az = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const x = c.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let W, H, ufuk, yildiz = [], hiz = 1, hedef = 1, calis = true, zaman = 0;
    const boyut = () => {
      W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; ufuk = H * 0.56;
      yildiz = Array.from({ length: Math.round(W / (14 * dpr)) }, () => ({ x: Math.random() * W, y: Math.random() * ufuk * 0.95, r: Math.random() * 1.1 + 0.3, p: Math.random() * 6 }));
    };
    addEventListener("resize", boyut);
    boyut();
    const SATIR = 34;
    const kare = () => {
      if (!calis) return;
      zaman += 0.016 * hiz;
      hiz += (hedef - hiz) * 0.03;
      x.clearRect(0, 0, W, H);
      for (const s of yildiz) { x.fillStyle = `rgba(230,235,255,${0.35 + 0.35 * Math.sin(zaman * 1.3 + s.p)})`; x.fillRect(s.x, s.y, s.r * dpr, s.r * dpr); }
      // Ay ve ışıltısı
      const ax = W / 2, ay = ufuk * 0.42, ar = Math.min(W, H) * 0.055;
      const hale = x.createRadialGradient(ax, ay, ar * 0.6, ax, ay, ar * 6);
      hale.addColorStop(0, "rgba(236,217,166,.35)"); hale.addColorStop(1, "rgba(236,217,166,0)");
      x.fillStyle = hale; x.beginPath(); x.arc(ax, ay, ar * 6, 0, 6.283); x.fill();
      x.fillStyle = "#f3e7c4"; x.beginPath(); x.arc(ax, ay, ar, 0, 6.283); x.fill();
      // Deniz: satırlar ufuktan izleyiciye doğru akar
      for (let i = 0; i < SATIR; i++) {
        const p = ((i + zaman * 0.9) % SATIR) / SATIR;
        const y0 = ufuk + p * p * (H - ufuk);
        const genlik = (1 + p * 9) * dpr;
        x.beginPath();
        for (let px = -10; px <= W + 10; px += 8 * dpr) {
          const y = y0 + Math.sin(px * 0.012 / (0.25 + p) + zaman * 1.6 + i) * genlik * 0.5 + Math.sin(px * 0.031 / (0.3 + p) - zaman + i * 2) * genlik * 0.25;
          if (px <= -10) x.moveTo(px, y); else x.lineTo(px, y);
        }
        x.strokeStyle = `rgba(90,120,200,${0.08 + p * 0.22})`; x.lineWidth = (0.6 + p * 1.6) * dpr; x.stroke();
        // Ay yolu: ortada altın pırıltı
        const gen = (40 + p * 260) * dpr;
        for (let k = 0; k < 3; k++) {
          const ox = ax + Math.sin(zaman * 2.1 + i * 3.7 + k * 2) * gen * 0.5;
          const g = Math.max(0, Math.sin(zaman * 3 + i * 1.3 + k));
          x.strokeStyle = `rgba(236,217,166,${(0.15 + 0.5 * g) * (1 - p * 0.35)})`;
          x.lineWidth = (0.8 + p * 2) * dpr;
          x.beginPath(); x.moveTo(ox - gen * 0.12, y0); x.lineTo(ox + gen * 0.12, y0); x.stroke();
        }
      }
      const sis = x.createLinearGradient(0, ufuk - 30 * dpr, 0, ufuk + 40 * dpr);
      sis.addColorStop(0, "rgba(40,60,110,0)"); sis.addColorStop(0.5, "rgba(60,80,130,.25)"); sis.addColorStop(1, "rgba(40,60,110,0)");
      x.fillStyle = sis; x.fillRect(0, ufuk - 30 * dpr, W, 70 * dpr);
      if (!az) requestAnimationFrame(kare);
    };
    kare();
    return { hizlan() { hedef = 3.2; }, dur() { calis = false; removeEventListener("resize", boyut); } };
  },
  gecis(giris) {
    const sis = giris.querySelector(".sis");
    const bulutlar = [...sis.children];
    bulutlar.forEach((b, i) => { b.style.left = `${(i % 2 ? 48 : -8) + (i * 7) % 18}%`; b.style.top = `${30 + (i * 13) % 50}%`; b.style.width = "80%"; });
    sis.style.opacity = 1;
    giris.querySelector(".giris-yazi").animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-30px)", filter: "blur(6px)" }], { duration: 1000, fill: "forwards" });
    const anim = bulutlar.map((b, i) => b.animate([
      { opacity: 0, transform: "translate(0, 40vh) scale(.8)" },
      { opacity: 1, transform: "translate(0, 0) scale(1.1)", offset: 0.4 },
      { opacity: 0, transform: `translate(${i % 2 ? 70 : -70}vw, -6vh) scale(1.6)` },
    ], { duration: 2500, delay: i * 50, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" }));
    giris.animate([{ backgroundColor: "rgba(5,6,11,1)" }, { backgroundColor: "rgba(5,6,11,1)", offset: 0.42 }, { backgroundColor: "rgba(5,6,11,0)" }], { duration: 2500, fill: "forwards" });
    giris.querySelector("canvas").animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 2500, fill: "forwards" });
    return Promise.all(anim.map((a) => a.finished));
  },
  // İsimler deniz üstündeki yansımalar gibi: biri belirir, söner, başka yerde öteki.
  isimler(kap) {
    const l = [...kap.children];
    l.forEach((s, i) => {
      s.style.left = `${[4, 30, 12, 40][i]}%`; s.style.top = `${[14, 40, 66, 86][i]}%`;
      s.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.6 }, { opacity: 0, transform: "translateY(-10px)" }], { duration: 16000, delay: i * 4000, iterations: Infinity });
    });
  },
};
