// TASLAK C — "ALTIN İPEK": karanlıkta yavaşça dalgalanan altın ipek şeritler; sahne yavaşça yaklaşır.
// Dokununca sis yoğunlaşır ve dağılırken site buğulu hâlden netleşir.
window.TEMA = {
  ad: "C · Altın İpek",
  vitrin: "editoryal",
  slaytSure: 5600,
  notalar: [233.08, 293.66, 349.23, 440],
  slaytDegisti(s) { const y = s.querySelector(".slayt-yazi"); if (y && y.animate) y.animate([{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "none" }], { duration: 1200, delay: 300, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }); },
  sahne(c) {
    const az = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const x = c.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let W, H, hiz = 1, hedef = 1, calis = true, zaman = 0, toz = [];
    const boyut = () => {
      W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr;
      toz = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: Math.random() * 0.3 + 0.1, p: Math.random() * 6 }));
    };
    addEventListener("resize", boyut);
    boyut();
    const SERIT = [
      { y: 0.34, a: 0.11, f: 1.1, s: 0.35, n: 22, r: [236, 217, 166] },
      { y: 0.6, a: 0.13, f: 0.8, s: -0.28, n: 26, r: [201, 164, 92] },
      { y: 0.8, a: 0.08, f: 1.6, s: 0.22, n: 14, r: [143, 111, 51] },
    ];
    const kare = () => {
      if (!calis) return;
      zaman += 0.012 * hiz;
      hiz += (hedef - hiz) * 0.03;
      x.clearRect(0, 0, W, H);
      const yak = 1 + 0.06 * Math.sin(zaman * 0.2) + (hiz - 1) * 0.05;
      x.save(); x.translate(W / 2, H / 2); x.scale(yak, yak); x.translate(-W / 2, -H / 2);
      x.globalCompositeOperation = "lighter";
      for (const s of SERIT) {
        for (let j = 0; j < s.n; j++) {
          const k = j / s.n;
          x.beginPath();
          for (let px = -20; px <= W + 20; px += 10 * dpr) {
            const u = px / W;
            const y = H * s.y + Math.sin(u * 6.283 * s.f + zaman * s.s * 3 + k * 1.2) * H * s.a + Math.sin(u * 3.1 + zaman * 0.7 + k * 2.4) * H * s.a * 0.5 + (k - 0.5) * H * 0.07;
            if (px <= -20) x.moveTo(px, y); else x.lineTo(px, y);
          }
          const g = x.createLinearGradient(0, 0, W, 0);
          const al = 0.05 + 0.07 * Math.sin(k * 3.1416);
          g.addColorStop(0, `rgba(${s.r},0)`); g.addColorStop(0.5, `rgba(${s.r},${al})`); g.addColorStop(1, `rgba(${s.r},0)`);
          x.strokeStyle = g; x.lineWidth = dpr; x.stroke();
        }
      }
      x.restore();
      x.globalCompositeOperation = "source-over";
      for (const d of toz) {
        d.y -= d.v * dpr * hiz; if (d.y < 0) d.y = H;
        x.fillStyle = `rgba(236,217,166,${0.25 + 0.3 * Math.sin(zaman * 2 + d.p)})`;
        x.fillRect(d.x, d.y, 1.4 * dpr, 1.4 * dpr);
      }
      if (!az) requestAnimationFrame(kare);
    };
    kare();
    return { hizlan() { hedef = 2.6; }, dur() { calis = false; removeEventListener("resize", boyut); } };
  },
  gecis(giris, site) {
    const sis = giris.querySelector(".sis");
    [...sis.children].forEach((b, i) => { b.style.left = `${(i * 23) % 70 - 5}%`; b.style.top = `${(i * 31) % 70}%`; b.style.background = "radial-gradient(closest-side, rgba(236,217,166,.35), rgba(201,164,92,.1) 60%, transparent)"; });
    giris.querySelector(".giris-yazi").animate([{ opacity: 1 }, { opacity: 0, filter: "blur(10px)", transform: "scale(.96)" }], { duration: 1200, fill: "forwards" });
    const s = sis.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 2600, easing: "ease-in-out", fill: "forwards" });
    giris.animate([{ backgroundColor: "rgba(5,6,11,1)" }, { backgroundColor: "rgba(5,6,11,1)", offset: 0.35 }, { backgroundColor: "rgba(5,6,11,0)" }], { duration: 2600, fill: "forwards" });
    giris.querySelector("canvas").animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 2600, fill: "forwards" });
    site.animate([{ filter: "blur(18px)", transform: "scale(1.04)", opacity: 0 }, { filter: "blur(18px)", opacity: 0.6, offset: 0.4 }, { filter: "blur(0)", transform: "none", opacity: 1 }], { duration: 2600, easing: "ease-out" });
    return s.finished;
  },
  // İsimler kenarlarda dikey, çok yavaş akar.
  isimler(kap) {
    [...kap.children].forEach((s, i) => {
      s.style.writingMode = "vertical-rl";
      s.style.fontSize = "clamp(54px, 11vw, 150px)";
      s.style[i % 2 ? "right" : "left"] = "-0.18em";
      s.animate([{ transform: "translateY(100vh)" }, { transform: "translateY(-120%)" }], { duration: 90000, delay: -i * 22000 - (i % 2) * 11000, iterations: Infinity, direction: i % 2 ? "reverse" : "normal" });
    });
  },
};
