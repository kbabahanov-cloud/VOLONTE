// VOLONTE yeni site — ortak çekirdek (üç taslakta aynı): veri, dil, vitrin, sayfalar, sipariş, istek listesi,
// beden rehberi, kargo, yakınlaştırma, ses, gizlilik dostu sayım. Görünüm ve giriş sahnesi tema dosyasından (TEMA).
// FİYAT YOK: sunucu veriden fiyatı zaten çıkarır; burada da hiçbir yerde gösterilmez.
(function () {
  "use strict";
  const AYAR = {
    siparisNo: "905362390091", // 🛒 Order (Kemal'deki ile aynı)
    bilgiNo: "905363448488", // 📞 Info
    telegram: "https://t.me/Volonteroseoffical",
    adres: "Mimar Kemalettin Mah. Koca Ragıppaşa Cad. No: 20 İç Kapı No: 501, Fatih / İstanbul, Türkiye",
    video: "https://volonte-selin.volonte.workers.dev",
    yildizlar: false, // "Stars in VOLONTE": ilk ünlü işbirliğinde true yapılır
    yeniGun: 21, // son 21 günde eklenen = "New"
  };
  // Tahmini kargo süreleri (iş günü, İstanbul'dan). FİYAT YOK. Murat/Hemra'nın onayıyla güncellenecek.
  const KARGO = [
    ["NG", "Nigeria", "5–10"], ["GH", "Ghana", "5–10"], ["KE", "Kenya", "5–9"], ["ZA", "South Africa", "5–9"],
    ["CI", "Côte d'Ivoire", "6–10"], ["SN", "Senegal", "6–10"], ["CM", "Cameroon", "6–12"], ["CD", "DR Congo", "7–14"],
    ["TZ", "Tanzania", "6–10"], ["UG", "Uganda", "6–10"], ["ET", "Ethiopia", "5–9"], ["RW", "Rwanda", "6–10"],
    ["US", "United States", "4–7"], ["CA", "Canada", "5–8"], ["AU", "Australia", "6–10"], ["FR", "France", "3–6"], ["GB", "United Kingdom", "3–6"],
  ];
  // Beden rehberi (EU → UK/Afrika, US; yaklaşık vücut ölçüleri cm). Murat kontrol edecek.
  const BEDENLER = [[38, 10, 6, 88, 72, 97], [40, 12, 8, 92, 76, 100], [42, 14, 10, 96, 80, 103], [44, 16, 12, 100, 84, 106], [46, 18, 14, 106, 90, 112], [48, 20, 16, 112, 96, 118], [50, 22, 18, 118, 102, 124]];
  const KUCUK = [38, 40, 42, 44];
  const BUYUK = [44, 46, 48, 50];

  const S = {
    en: {
      home: "Home", new: "New Collection", lookbook: "Lookbook", story: "Designer's Story", sizes: "Size Guide", shipping: "Shipping", wishlist: "Wishlist", privacy: "Privacy", stars: "Stars in VOLONTE",
      tap: "Tap to enter", discover: "Discover", all: "All", cat_dresses: "Dresses", cat_sets: "Sets", cat_evening: "Evening",
      lead: "Premium women's fashion, made in Istanbul. Wholesale to boutiques all over the world.",
      quality: "Quality is our foundation", qualityText: "Every model is cut, draped and finished in our Istanbul workshops. We sell by series to boutiques and resellers worldwide.",
      newBadge: "New", models: "models", order: "Order on WhatsApp", info: "Ask a question", sizesLbl: "Sizes", small: "Small", large: "Large", series: "series of 4 pieces",
      waOrder: "Hello VOLONTE, I would like to order model {k}.", waInfo: "Hello VOLONTE, I have a question about model {k}.",
      waList: "Hello VOLONTE, I would like to order these models: {l}", waHello: "Hello VOLONTE, I would like to see your wholesale collection.",
      wishEmpty: "Tap the heart on any model to add it to your list.", sendList: "Send my list on WhatsApp", wishText: "Choose models with the heart, then send the whole list to us in one message.",
      zoomHint: "Pinch or double-tap to see the fabric", soldBy: "Wholesale · sold by series", notFound: "This model is no longer on the site.", back: "Back",
      sizeTitle: "Find your size", sizeText: "Our models come in sizes 38 to 50, in two groups. Wholesale orders are by series (one piece of each size in the group).",
      sizeNote: "Body measurements are approximate. If you are unsure, ask us on WhatsApp.", bust: "Bust (cm)", waist: "Waist (cm)", hips: "Hips (cm)", ukAfrica: "UK / Africa",
      shipTitle: "Delivery to your country", shipText: "Choose your country to see the estimated delivery time from Istanbul.", chooseCountry: "Choose your country", estimate: "Estimated delivery",
      workDays: "working days", otherCountry: "Other country", shipOther: "We ship worldwide — ask us on WhatsApp for your country.",
      shipNote: "Times are estimates; they depend on the cargo company and customs. We confirm the best option for you on WhatsApp.",
      storyTitle: "From the first sketch to the final drape", storyText: "The VOLONTE atelier in Istanbul: designing, draping on the stand, fitting and finishing — the hands behind every model.",
      soon: "Coming soon", storyVideo: "Draping videos", storyAtelier: "The atelier", playFilm: "Play the film", pause: "Pause",
      lookText: "Each collection, told like a film.", film: ["Live your life.", "Made in Istanbul.", "Every drape, by hand.", "For the woman who leads.", "Quality is our foundation.", "Elegance, every day."],
      privacyBar: "We count visits anonymously — only the country and which models are viewed. No cookies, no personal data.", ok: "OK",
      privacyText: "VOLONTE does not collect personal data on this site. We do not use cookies or advertising trackers. To improve the collection we only count, anonymously: the number of visits per country (from the network, not your exact location) and how often each model is viewed. Your wishlist and language choice stay on your own device. When you contact us on WhatsApp, WhatsApp's own privacy policy applies.",
      starsText: "Our first collaborations are coming.", address: "Showroom", draft: "DRAFT",
    },
    fr: {
      home: "Accueil", new: "Nouvelle Collection", lookbook: "Lookbook", story: "L'histoire du créateur", sizes: "Guide des tailles", shipping: "Livraison", wishlist: "Ma liste", privacy: "Confidentialité", stars: "Stars in VOLONTE",
      tap: "Touchez pour entrer", discover: "Découvrir", all: "Tout", cat_dresses: "Robes", cat_sets: "Ensembles", cat_evening: "Soirée",
      lead: "Mode féminine haut de gamme, fabriquée à Istanbul. Vente en gros aux boutiques du monde entier.",
      quality: "La qualité est notre fondation", qualityText: "Chaque modèle est coupé, drapé et fini dans nos ateliers d'Istanbul. Nous vendons par série aux boutiques et revendeurs du monde entier.",
      newBadge: "Nouveau", models: "modèles", order: "Commander sur WhatsApp", info: "Poser une question", sizesLbl: "Tailles", small: "Petites", large: "Grandes", series: "série de 4 pièces",
      waOrder: "Bonjour VOLONTE, je souhaite commander le modèle {k}.", waInfo: "Bonjour VOLONTE, j'ai une question sur le modèle {k}.",
      waList: "Bonjour VOLONTE, je souhaite commander ces modèles : {l}", waHello: "Bonjour VOLONTE, je souhaite voir votre collection en gros.",
      wishEmpty: "Touchez le cœur d'un modèle pour l'ajouter à votre liste.", sendList: "Envoyer ma liste sur WhatsApp", wishText: "Choisissez des modèles avec le cœur, puis envoyez-nous toute la liste en un seul message.",
      zoomHint: "Pincez ou touchez deux fois pour voir le tissu", soldBy: "Vente en gros · par série", notFound: "Ce modèle n'est plus sur le site.", back: "Retour",
      sizeTitle: "Trouvez votre taille", sizeText: "Nos modèles vont du 38 au 50, en deux groupes. Les commandes en gros se font par série (une pièce de chaque taille du groupe).",
      sizeNote: "Les mesures sont approximatives. En cas de doute, demandez-nous sur WhatsApp.", bust: "Poitrine (cm)", waist: "Taille (cm)", hips: "Hanches (cm)", ukAfrica: "UK / Afrique",
      shipTitle: "Livraison dans votre pays", shipText: "Choisissez votre pays pour voir le délai de livraison estimé depuis Istanbul.", chooseCountry: "Choisissez votre pays", estimate: "Livraison estimée",
      workDays: "jours ouvrables", otherCountry: "Autre pays", shipOther: "Nous livrons dans le monde entier — demandez-nous sur WhatsApp pour votre pays.",
      shipNote: "Délais estimés ; ils dépendent du transporteur et de la douane. Nous confirmons la meilleure option sur WhatsApp.",
      storyTitle: "Du premier croquis au drapé final", storyText: "L'atelier VOLONTE à Istanbul : création, drapé sur mannequin, essayages et finitions — les mains derrière chaque modèle.",
      soon: "Bientôt", storyVideo: "Vidéos de drapé", storyAtelier: "L'atelier", playFilm: "Lancer le film", pause: "Pause",
      lookText: "Chaque collection, racontée comme un film.", film: ["Live your life.", "Fabriqué à Istanbul.", "Chaque drapé, à la main.", "Pour la femme qui avance.", "La qualité est notre fondation.", "L'élégance, chaque jour."],
      privacyBar: "Nous comptons les visites de façon anonyme — seulement le pays et les modèles consultés. Pas de cookies, pas de données personnelles.", ok: "OK",
      privacyText: "VOLONTE ne collecte aucune donnée personnelle sur ce site. Nous n'utilisons ni cookies ni traceurs publicitaires. Pour améliorer la collection, nous comptons seulement, de façon anonyme : le nombre de visites par pays (d'après le réseau, pas votre position exacte) et la fréquence de consultation de chaque modèle. Votre liste et votre langue restent sur votre appareil. Lorsque vous nous écrivez sur WhatsApp, la politique de confidentialité de WhatsApp s'applique.",
      starsText: "Nos premières collaborations arrivent.", address: "Showroom", draft: "BROUILLON",
    },
    tr: {
      home: "Ana Sayfa", new: "Yeni Koleksiyon", lookbook: "Lookbook", story: "Tasarımcının Hikâyesi", sizes: "Beden Rehberi", shipping: "Kargo", wishlist: "İstek Listesi", privacy: "Gizlilik", stars: "Stars in VOLONTE",
      tap: "Girmek için dokunun", discover: "Keşfet", all: "Tümü", cat_dresses: "Elbiseler", cat_sets: "Takımlar", cat_evening: "Abiye",
      lead: "İstanbul'da üretilen kaliteli kadın giyimi. Dünyanın her yerindeki butiklere toptan satış.",
      quality: "Kalite bizim temelimiz", qualityText: "Her model İstanbul'daki atölyelerimizde kesilir, drape edilir ve bitirilir. Dünya genelindeki butik ve satıcılara seri hâlinde satıyoruz.",
      newBadge: "Yeni", models: "model", order: "WhatsApp'tan sipariş ver", info: "Bilgi al", sizesLbl: "Bedenler", small: "Küçük", large: "Büyük", series: "4'lü seri",
      waOrder: "Merhaba VOLONTE, {k} modelini sipariş etmek istiyorum.", waInfo: "Merhaba VOLONTE, {k} modeli hakkında bilgi almak istiyorum.",
      waList: "Merhaba VOLONTE, şu modelleri sipariş etmek istiyorum: {l}", waHello: "Merhaba VOLONTE, toptan koleksiyonunuzu görmek istiyorum.",
      wishEmpty: "Listeye eklemek için modeldeki kalbe dokunun.", sendList: "Listemi WhatsApp'tan gönder", wishText: "Kalple modelleri seçin, listenin tamamını bize tek mesajla gönderin.",
      zoomHint: "Kumaşı görmek için iki parmakla büyütün ya da çift dokunun", soldBy: "Toptan · seri hâlinde", notFound: "Bu model artık sitede yok.", back: "Geri",
      sizeTitle: "Bedeninizi bulun", sizeText: "Modellerimiz 38'den 50'ye, iki grupta. Toptan sipariş seri hâlindedir (gruptaki her bedenden bir adet).",
      sizeNote: "Vücut ölçüleri yaklaşıktır. Emin değilseniz WhatsApp'tan sorun.", bust: "Göğüs (cm)", waist: "Bel (cm)", hips: "Kalça (cm)", ukAfrica: "UK / Afrika",
      shipTitle: "Ülkenize teslimat", shipText: "İstanbul'dan tahmini teslim süresini görmek için ülkenizi seçin.", chooseCountry: "Ülkenizi seçin", estimate: "Tahmini teslimat",
      workDays: "iş günü", otherCountry: "Diğer ülke", shipOther: "Dünyanın her yerine gönderiyoruz — ülkeniz için WhatsApp'tan sorun.",
      shipNote: "Süreler tahminidir; kargo firmasına ve gümrüğe göre değişir. En uygun seçeneği WhatsApp'ta teyit ederiz.",
      storyTitle: "İlk çizimden son drapeye", storyText: "İstanbul'daki VOLONTE atölyesi: tasarım, mankende drape, prova ve son dokunuşlar — her modelin arkasındaki eller.",
      soon: "Yakında", storyVideo: "Drape videoları", storyAtelier: "Atölye", playFilm: "Filmi oynat", pause: "Durdur",
      lookText: "Her koleksiyon, bir film gibi.", film: ["Live your life.", "İstanbul'da üretildi.", "Her drape, el emeği.", "Öne çıkan kadın için.", "Kalite bizim temelimiz.", "Her gün zarafet."],
      privacyBar: "Ziyaretleri anonim sayıyoruz — sadece ülke ve bakılan modeller. Çerez yok, kişisel veri yok.", ok: "Tamam",
      privacyText: "VOLONTE bu sitede kişisel veri toplamaz. Çerez ya da reklam takipçisi kullanmayız. Koleksiyonu geliştirmek için sadece anonim olarak sayarız: ülke başına ziyaret sayısı (ağdan, tam konumunuz değil) ve her modele kaç kez bakıldığı. İstek listeniz ve dil seçiminiz sadece kendi cihazınızda kalır. Bize WhatsApp'tan yazdığınızda WhatsApp'ın kendi gizlilik politikası geçerlidir.",
      starsText: "İlk işbirliklerimiz geliyor.", address: "Showroom", draft: "TASLAK",
    },
  };

  // ---------- Küçük yardımcılar ----------
  const $ = (s, k = document) => k.querySelector(s);
  const $$ = (s, k = document) => [...k.querySelectorAll(s)];
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sakla = { al(k, v) { try { const x = localStorage.getItem(k); return x == null ? v : JSON.parse(x); } catch { return v; } }, koy(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* özel pencere */ } } };
  const tarayiciDil = (navigator.language || "en").slice(0, 2);
  let dil = sakla.al("dil", ["fr", "tr"].includes(tarayiciDil) ? tarayiciDil : "en");
  const t = (k) => (S[dil] && S[dil][k] != null ? S[dil][k] : S.en[k]);
  const wa = (no, metin) => `https://wa.me/${no}?text=${encodeURIComponent(metin)}`;
  const img = (yol, w) => `/img/${String(yol).replace(/^\/+/, "")}?w=${w}`;
  const ag0 = navigator.connection || {};
  // Yavaş ağda (3G ve altı) ekran yoğunluğu 1 sayılır: fotoğraflar yarı boyutta iner
  const DPR = ag0.saveData || /(^|-)(2g|3g)/.test(ag0.effectiveType || "") ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const genislik = (css) => [320, 480, 720, 960, 1280, 1600].find((w) => w >= css * DPR) || 1600;
  const ag = navigator.connection || {};
  const agZayif = () => Boolean(ag.saveData || /(^|-)(2g|3g)/.test(ag.effectiveType || "")); // videolar sadece hızlı ağda
  const IKON = {
    kalp: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.3 4.5 6.8 4.5c2.2 0 3.6 1.3 5.2 3.2 1.6-1.9 3-3.2 5.2-3.2 3.5 0 5.4 3.5 4.1 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2.1.7 2.8.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    buyut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>',
  };

  // ---------- Veri (sunucu sayfaya gömer; yoksa /veri) ----------
  let MODELLER = [];
  async function veriAl() {
    let ham = window.VOLONTE_VERI;
    if (!Array.isArray(ham)) { try { ham = await (await fetch("/veri")).json(); } catch { ham = []; } }
    const sinir = Date.now() - AYAR.yeniGun * 86400000;
    MODELLER = ham.filter((u) => !u.gizli && (u.fotolar || []).length)
      .map((u) => ({ ...u, yeni: u.eklenme ? new Date(u.eklenme).getTime() > sinir : false }))
      .sort((a, b) => String(b.eklenme || "").localeCompare(String(a.eklenme || "")));
  }
  const modelBul = (kod) => MODELLER.find((u) => String(u.kod) === String(kod));
  const aciklama = (u) => (u.aciklama && (u.aciklama[dil] || u.aciklama.en)) || "";
  const katAdi = (k) => t(`cat_${k}`) || k;
  function gruplar(bedenler) {
    const s = (String(bedenler || "").match(/\d{2}/g) || []).map(Number);
    const g = [];
    if (KUCUK.every((n) => s.includes(n))) g.push({ ad: t("small"), aralik: "38–44" });
    if (BUYUK.every((n) => s.includes(n))) g.push({ ad: t("large"), aralik: "44–50" });
    return { g, duz: s.join(" · ") };
  }
  function videoAdresi(v) {
    const yeni = String(v).match(/^selin\/(\d{3,6})\/(\d+)$/);
    if (yeni) return `${AYAR.video}/v2/${yeni[1]}/${yeni[2]}`;
    const id = String(v).split("/").pop();
    return /^\d+$/.test(id) ? `${AYAR.video}/v/${id}` : "";
  }

  // ---------- İstek listesi (sadece bu cihazda) ----------
  let istek = sakla.al("istek", []);
  const istekte = (k) => istek.includes(String(k));
  function istekDegistir(k) {
    k = String(k);
    istek = istekte(k) ? istek.filter((x) => x !== k) : [...istek, k];
    sakla.koy("istek", istek);
    $$(`[data-kalp="${k}"]`).forEach((b) => b.setAttribute("aria-pressed", istekte(k)));
    sayacGuncelle();
  }
  function sayacGuncelle() { const b = $("#istek-sayi"); if (b) { b.textContent = istek.length; b.hidden = !istek.length; } }
  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kalp]");
    if (k) { e.preventDefault(); e.stopPropagation(); istekDegistir(k.dataset.kalp); }
  }, true);

  // ---------- Gizlilik dostu sayım (kişisel veri yok, çerez yok) ----------
  function say(tur, kod) {
    try {
      const govde = JSON.stringify({ t: tur, kod: kod || null, dil });
      if (navigator.sendBeacon) navigator.sendBeacon("/olcum", new Blob([govde], { type: "text/plain" }));
      else fetch("/olcum", { method: "POST", body: govde, keepalive: true });
    } catch { /* sayım olmazsa site yine çalışır */ }
  }

  // ---------- Videolar: sırayla, sıkıştırılmış Telegram akışı; zayıf ağda hiç yüklenmez ----------
  const videoSira = [];
  let videoYukleniyor = false;
  let videoSerbest = false;
  function videoKuyrugu(v) { videoSira.push(v); videoIlerle(); }
  function videoIlerle() {
    if (!videoSerbest || videoYukleniyor || agZayif()) return;
    const v = videoSira.shift();
    if (!v) return;
    if (!v.isConnected) return videoIlerle();
    videoYukleniyor = true;
    let bitti = false;
    const sonra = () => { if (bitti) return; bitti = true; videoYukleniyor = false; setTimeout(videoIlerle, 400); };
    v.addEventListener("loadeddata", () => { v.classList.add("hazir"); sonra(); }, { once: true });
    v.addEventListener("error", () => { v.remove(); sonra(); }, { once: true });
    setTimeout(sonra, 25000);
    v.preload = "auto";
    v.src = v.dataset.src;
    v.load();
  }
  function videoEtiketi(u, v, sinif = "", poster = false) {
    const src = videoAdresi(v);
    return src ? `<video class="${sinif}" muted playsinline loop preload="none" data-src="${esc(src)}"${poster ? ` poster="${esc(img(u.fotolar[0], genislik(window.innerWidth)))}"` : ""}></video>` : "";
  }
  // Tembel yükleme: ekrana 300 px yaklaşınca iner (yavaş ağda fotoğraflar birbirini beklemesin)
  const tembelGozcu = "IntersectionObserver" in window ? new IntersectionObserver((l) => l.forEach((g) => {
    if (!g.isIntersecting) return;
    const im = g.target; tembelGozcu.unobserve(im);
    if (im.dataset.tembel) { im.src = im.dataset.tembel; delete im.dataset.tembel; }
  }), { rootMargin: "300px 0px" }) : null;
  function tembelKur(kok = document) { $$("img[data-tembel]", kok).forEach((im) => { if (tembelGozcu) tembelGozcu.observe(im); else { im.src = im.dataset.tembel; } }); }

  // ---------- Vitrin: fotoğraf + video, kendiliğinden döner ----------
  function vitrinSlaytlari(n = 8) {
    const l = [];
    for (const u of MODELLER.slice(0, n)) {
      const v = (u.videolar || [])[0];
      l.push({ u, foto: u.fotolar[0], video: v && !agZayif() ? v : null });
    }
    return l;
  }
  let vitrinZamanlayici = null;
  function vitrinKur(kap) {
    clearInterval(vitrinZamanlayici);
    const slaytlar = vitrinSlaytlari();
    if (!slaytlar.length) return;
    const tur = (window.TEMA && TEMA.vitrin) || "solma";
    const w = genislik(tur === "serit" ? window.innerWidth * 0.8 : window.innerWidth);
    kap.classList.add(`vitrin-${tur}`);
    kap.innerHTML = slaytlar.map((s, i) => `
      <a class="slayt${i === 0 ? " gorunur" : ""}" href="#model/${esc(s.u.kod)}" data-i="${i}">
        <img ${i ? "data-" : ""}src="${esc(img(s.foto, w))}" alt="${esc(s.u.baslik)}" ${i ? "" : 'fetchpriority="high"'} decoding="async">
        ${s.video ? videoEtiketi(s.u, s.video, "slayt-video") : ""}
        <span class="slayt-yazi"><span class="slayt-kod">${esc(s.u.kod)}${s.u.yeni ? ` · ${esc(t("newBadge"))}` : ""}</span><span class="slayt-ad">${esc(s.u.baslik)}</span></span>
      </a>`).join("") + `<div class="noktalar">${slaytlar.map((_, i) => `<i class="${i === 0 ? "aktif" : ""}"></i>`).join("")}</div>`;
    $$(".slayt-video", kap).forEach(videoKuyrugu);
    // Fotoğraflar sırayla: ilki önce, sonrakiler gösterilmeden bir adım önce iner (yavaş ağda hepsi aynı anda inmesin)
    const hazirla = (i) => { const im = $$(".slayt img", kap)[i]; if (im && im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } };
    const ilk = $(".slayt img", kap);
    if (ilk.complete) hazirla(1); else ilk.addEventListener("load", () => hazirla(1), { once: true });
    if (tur === "serit") { hazirla(1); hazirla(2); }
    let aktif = 0;
    const goster = (i) => {
      const s = $$(".slayt", kap);
      if (!s.length) return;
      aktif = (i + s.length) % s.length;
      hazirla(aktif); hazirla((aktif + 1) % s.length); if (tur === "serit") hazirla((aktif + 2) % s.length);
      s.forEach((x, j) => {
        x.classList.toggle("gorunur", j === aktif);
        const v = $("video", x);
        if (v) { if (j === aktif && v.classList.contains("hazir")) v.play().catch(() => {}); else v.pause(); }
      });
      $$(".noktalar i", kap).forEach((x, j) => x.classList.toggle("aktif", j === aktif));
      if (tur === "serit") { const hedef = s[aktif]; kap.scrollTo({ left: hedef.offsetLeft - (kap.clientWidth - hedef.clientWidth) / 2, behavior: "smooth" }); }
      if (window.TEMA && TEMA.slaytDegisti) TEMA.slaytDegisti(s[aktif], aktif);
    };
    const sure = (window.TEMA && TEMA.slaytSure) || 4800;
    vitrinZamanlayici = setInterval(() => { if (!document.hidden) goster(aktif + 1); }, sure);
    if (tur === "serit") kap.addEventListener("scroll", () => { clearInterval(vitrinZamanlayici); vitrinZamanlayici = setInterval(() => goster(aktif + 1), sure * 1.6); }, { passive: true, once: true });
  }

  // ---------- Kartlar ----------
  function kart(u, w = genislik(window.innerWidth >= 760 ? 300 : window.innerWidth / 2)) {
    const g = gruplar(u.bedenler);
    return `<article class="kart">
      <button class="kalp" data-kalp="${esc(u.kod)}" aria-pressed="${istekte(u.kod)}" aria-label="${esc(t("wishlist"))}">${IKON.kalp}</button>
      <a href="#model/${esc(u.kod)}">
        <div class="kart-foto"><img data-tembel="${esc(img(u.fotolar[0], w))}" alt="${esc(u.baslik)}" decoding="async" onload="this.classList.add('yuklendi')">${u.yeni ? `<span class="kart-yeni">${esc(t("newBadge"))}</span>` : ""}</div>
        <div class="kart-alt"><span class="kart-kod">${esc(u.kod)}</span></div>
        <h3 class="kart-ad">${esc(u.baslik)}</h3>
        <p class="kart-beden">${esc(g.g.length ? g.g.map((x) => `${x.ad} ${x.aralik}`).join(" / ") : g.duz)}</p>
      </a></article>`;
  }

  // ---------- Sayfalar ----------
  const SAYFALAR = {
    home() {
      return `<section class="vitrin" id="vitrin" aria-label="${esc(t("new"))}"></section>
        <section class="bolum giris-metin"><p class="baslik-ust">VOLONTE · Istanbul</p><h2 class="baslik">${esc(t("quality"))}</h2><div class="cizgi"></div><p class="aciklama">${esc(t("qualityText"))}</p></section>
        <section class="bolum"><p class="baslik-ust">${esc(t("new"))}</p><h2 class="baslik">${esc(t("new"))}</h2><div class="cizgi"></div>
          <div class="izgara">${MODELLER.slice(0, 8).map((u) => kart(u)).join("")}</div>
          <p style="margin-top:28px"><a class="dugme" href="#new">${esc(t("discover"))} · ${MODELLER.length} ${esc(t("models"))}</a></p></section>
        <section class="bolum iki-sutun">
          <a class="koleksiyon" href="#lookbook"><img data-tembel="${esc(img((MODELLER[1] || MODELLER[0] || { fotolar: [""] }).fotolar[0], 720))}" alt="" loading="lazy"><span>${esc(t("lookbook"))}<small style="display:block;font:500 10px/1 var(--sans);letter-spacing:.3em;color:var(--altin);margin-top:8px">${esc(t("lookText"))}</small></span></a>
          <a class="koleksiyon" href="#story"><img data-tembel="${esc(img((MODELLER[2] || MODELLER[0] || { fotolar: [""] }).fotolar[0], 720))}" alt="" loading="lazy"><span>${esc(t("story"))}<small style="display:block;font:500 10px/1 var(--sans);letter-spacing:.3em;color:var(--altin);margin-top:8px">${esc(t("soon"))}</small></span></a>
        </section>`;
    },
    new() {
      const kategoriler = [...new Set(MODELLER.map((u) => u.kategori).filter(Boolean))];
      return `<section class="bolum"><p class="baslik-ust">VOLONTE</p><h1 class="baslik">${esc(t("new"))}</h1><p class="aciklama">${esc(t("lead"))}</p><div class="cizgi"></div>
        <div class="filtre" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px">${["all", ...kategoriler].map((k, i) => `<button class="dil-k ${i ? "" : "aktif"}" data-kat="${esc(k)}" style="padding:9px 14px;border:1px solid var(--cizgi);font-size:11px;letter-spacing:.16em;text-transform:uppercase">${esc(k === "all" ? t("all") : katAdi(k))}</button>`).join("")}</div>
        <div class="izgara" id="izgara">${MODELLER.map((u) => kart(u)).join("")}</div></section>`;
    },
    lookbook() {
      const yeni = MODELLER.slice(0, 12);
      return `<section class="bolum"><p class="baslik-ust">${esc(t("lookbook"))}</p><h1 class="baslik">${esc(t("lookText"))}</h1><div class="cizgi"></div>
        <div class="koleksiyonlar">
          <a class="koleksiyon" href="#film/new"><img src="${esc(img((yeni[0] || { fotolar: [""] }).fotolar[0], 720))}" alt="" loading="lazy"><span>${esc(t("new"))}<small style="display:block;font:500 10px/1 var(--sans);letter-spacing:.3em;color:var(--altin);margin-top:8px">▶ ${esc(t("playFilm"))}</small></span></a>
          <div class="koleksiyon yakinda yer-tutucu" style="aspect-ratio:4/5"><div><b>${esc(t("soon"))}</b>Collection II</div></div>
          <div class="koleksiyon yakinda yer-tutucu" style="aspect-ratio:4/5"><div><b>${esc(t("soon"))}</b>Collection III</div></div>
        </div></section>`;
    },
    film() {
      const satirlar = t("film");
      const kareler = [];
      MODELLER.slice(0, 12).forEach((u, i) => { kareler.push({ u, f: u.fotolar[0], s: satirlar[i % satirlar.length] }); if (u.fotolar[1] && i % 3 === 1) kareler.push({ u, f: u.fotolar[1], s: "" }); });
      return `<div class="film" id="film">${kareler.map((k) => `<a class="kare" href="#model/${esc(k.u.kod)}"><img data-src="${esc(img(k.f, genislik(window.innerWidth)))}" alt="${esc(k.u.baslik)}"><div class="kare-yazi">${k.s ? `<p>${esc(k.s)}</p>` : ""}<small>${esc(k.u.kod)} · ${esc(k.u.baslik)}</small></div></a>`).join("")}</div>
        <button class="dugme dolu film-oynat" id="oynat">▶ ${esc(t("playFilm"))}</button>`;
    },
    story() {
      return `<section class="bolum"><p class="baslik-ust">${esc(t("story"))}</p><h1 class="baslik">${esc(t("storyTitle"))}</h1><div class="cizgi"></div><p class="aciklama">${esc(t("storyText"))}</p>
        <div class="iki-sutun" style="margin-top:30px"><div class="yer-tutucu"><div><b>${esc(t("storyVideo"))}</b>${esc(t("soon"))}</div></div><div class="yer-tutucu"><div><b>${esc(t("storyAtelier"))}</b>${esc(t("soon"))}</div></div></div></section>`;
    },
    sizes() {
      const satir = (b) => `<tr><td><b>${b[0]}</b></td><td>${b[1]}</td><td>${b[2]}</td><td>${b[3]}</td><td>${b[4]}</td><td>${b[5]}</td></tr>`;
      return `<section class="bolum"><p class="baslik-ust">${esc(t("sizes"))}</p><h1 class="baslik">${esc(t("sizeTitle"))}</h1><div class="cizgi"></div><p class="aciklama">${esc(t("sizeText"))}</p>
        <div class="gruplar"><div class="grup"><b>${esc(t("small"))} · 38–44</b>${esc(t("series"))}</div><div class="grup"><b>${esc(t("large"))} · 44–50</b>${esc(t("series"))}</div></div>
        <div class="tablo-kap"><table><thead><tr><th>EU</th><th>${esc(t("ukAfrica"))}</th><th>US</th><th>${esc(t("bust"))}</th><th>${esc(t("waist"))}</th><th>${esc(t("hips"))}</th></tr></thead><tbody>
          <tr class="grup-satir"><td colspan="6">${esc(t("small"))} · 38–44</td></tr>${BEDENLER.slice(0, 4).map(satir).join("")}
          <tr class="grup-satir"><td colspan="6">${esc(t("large"))} · 44–50</td></tr>${BEDENLER.slice(3).map(satir).join("")}
        </tbody></table></div><p class="not">${esc(t("sizeNote"))}</p>
        <p style="margin-top:22px"><a class="dugme" target="_blank" rel="noopener" href="${esc(wa(AYAR.bilgiNo, t("waHello")))}">${IKON.wa} ${esc(t("info"))}</a></p></section>`;
    },
    shipping() {
      const ulke = sakla.al("ulke", window.VOLONTE_ULKE || "");
      return `<section class="bolum"><p class="baslik-ust">${esc(t("shipping"))}</p><h1 class="baslik">${esc(t("shipTitle"))}</h1><div class="cizgi"></div><p class="aciklama">${esc(t("shipText"))}</p>
        <p style="margin-top:22px"><select id="ulke" aria-label="${esc(t("chooseCountry"))}"><option value="">${esc(t("chooseCountry"))}</option>${KARGO.map((k) => `<option value="${k[0]}" ${k[0] === ulke ? "selected" : ""}>${esc(k[1])}</option>`).join("")}<option value="XX">${esc(t("otherCountry"))}</option></select></p>
        <div id="kargo-sonuc"></div><p class="not">${esc(t("shipNote"))}</p></section>`;
    },
    wishlist() {
      const l = istek.map(modelBul).filter(Boolean);
      return `<section class="bolum"><p class="baslik-ust">${esc(t("wishlist"))}</p><h1 class="baslik">${esc(t("wishlist"))}</h1><div class="cizgi"></div><p class="aciklama">${esc(t("wishText"))}</p>
        <div id="liste" style="margin-top:22px">${l.length ? l.map((u) => `<div class="liste-satir"><a href="#model/${esc(u.kod)}"><img src="${esc(img(u.fotolar[0], 160))}" alt="" loading="lazy"></a><a href="#model/${esc(u.kod)}"><span class="kart-kod">${esc(u.kod)}</span><span class="kart-ad" style="display:block">${esc(u.baslik)}</span></a><button class="sil" data-kalp="${esc(u.kod)}" aria-label="×">×</button></div>`).join("") : `<p class="bos">${esc(t("wishEmpty"))}</p>`}</div>
        ${l.length ? `<p style="margin-top:24px"><a class="dugme dolu" target="_blank" rel="noopener" href="${esc(wa(AYAR.siparisNo, t("waList").replace("{l}", l.map((u) => u.kod).join(", "))))}">${IKON.wa} ${esc(t("sendList"))} (${l.length})</a></p>` : ""}</section>`;
    },
    privacy() {
      return `<section class="bolum"><p class="baslik-ust">${esc(t("privacy"))}</p><h1 class="baslik">${esc(t("privacy"))}</h1><div class="cizgi"></div><p class="aciklama">${esc(t("privacyText"))}</p></section>`;
    },
    stars() {
      return `<section class="bolum"><p class="baslik-ust">VOLONTE</p><h1 class="baslik">${esc(t("stars"))}</h1><div class="cizgi"></div><div class="yer-tutucu"><div><b>${esc(t("soon"))}</b>${esc(t("starsText"))}</div></div></section>`;
    },
    model(kod) {
      const u = modelBul(kod);
      if (!u) return `<section class="bolum"><p class="bos">${esc(t("notFound"))}</p><p style="margin-top:20px"><a class="dugme" href="#new">${esc(t("new"))}</a></p></section>`;
      const g = gruplar(u.bedenler);
      const w = genislik(window.innerWidth >= 900 ? 640 : window.innerWidth);
      return `<section class="bolum model">
        <div><div class="galeri" id="galeri">${u.fotolar.map((f, i) => `<div><img src="${esc(img(f, w))}" alt="${esc(u.baslik)} ${i + 1}" ${i ? 'loading="lazy"' : ""} decoding="async" data-buyuk="${esc(img(f, 1600))}"><button class="buyut" data-zoom="${i}" aria-label="Zoom">${IKON.buyut}</button></div>`).join("")}${(u.videolar || []).map((v) => `<div>${videoEtiketi(u, v, "model-video", true)}</div>`).join("")}</div>
          <div class="kucukler">${u.fotolar.map((f, i) => `<button data-git="${i}" class="${i ? "" : "aktif"}"><img src="${esc(img(f, 120))}" alt="" loading="lazy"></button>`).join("")}</div></div>
        <div class="model-bilgi"><p class="kod-buyuk">${esc(u.kod)}${u.yeni ? ` · ${esc(t("newBadge"))}` : ""}</p><h1>${esc(u.baslik)}</h1><p>${esc(aciklama(u))}</p>
          <div class="gruplar">${g.g.length ? g.g.map((x) => `<div class="grup"><b>${esc(x.ad)} · ${x.aralik}</b>${esc(t("series"))}</div>`).join("") : `<div class="grup"><b>${esc(t("sizesLbl"))}</b>${esc(g.duz)}</div>`}</div>
          <p class="not">${esc(t("soldBy"))} · <a href="#sizes" style="border-bottom:1px solid var(--cizgi)">${esc(t("sizes"))}</a></p>
          <div class="siparis"><a class="dugme dolu" target="_blank" rel="noopener" href="${esc(wa(AYAR.siparisNo, t("waOrder").replace("{k}", u.kod)))}">${IKON.wa} ${esc(t("order"))}</a>
            <a class="dugme" target="_blank" rel="noopener" href="${esc(wa(AYAR.bilgiNo, t("waInfo").replace("{k}", u.kod)))}">${esc(t("info"))}</a>
            <button class="dugme" data-kalp="${esc(u.kod)}" aria-pressed="${istekte(u.kod)}">${IKON.kalp.replace("<svg", '<svg width="18" height="18" fill="none" stroke="currentColor"')} ${esc(t("wishlist"))}</button></div></div></section>
        <section class="bolum"><p class="baslik-ust">${esc(t("new"))}</p><div class="izgara">${MODELLER.filter((x) => x.kod !== u.kod).slice(0, 4).map((x) => kart(x)).join("")}</div></section>`;
    },
  };

  // Sayfa açıldıktan sonra bağlanan davranışlar
  const SONRA = {
    home() { vitrinKur($("#vitrin")); },
    new() {
      $$("[data-kat]").forEach((b) => b.addEventListener("click", () => {
        $$("[data-kat]").forEach((x) => x.classList.toggle("aktif", x === b));
        $$("[data-kat]").forEach((x) => { x.style.background = x === b ? "rgba(201,164,92,.16)" : ""; });
        const k = b.dataset.kat;
        $("#izgara").innerHTML = MODELLER.filter((u) => k === "all" || u.kategori === k).map((u) => kart(u)).join("");
        tembelKur($("#izgara"));
      }));
    },
    shipping() {
      const sec = $("#ulke");
      const yaz = () => {
        const k = KARGO.find((x) => x[0] === sec.value);
        if (sec.value) sakla.koy("ulke", sec.value);
        $("#kargo-sonuc").innerHTML = !sec.value ? "" : k
          ? `<div class="kargo-sonuc"><span class="baslik-ust">${esc(t("estimate"))} · ${esc(k[1])}</span><b>${esc(k[2])} ${esc(t("workDays"))}</b><a class="dugme" style="margin-top:12px" target="_blank" rel="noopener" href="${esc(wa(AYAR.bilgiNo, t("waHello")))}">${IKON.wa} ${esc(t("info"))}</a></div>`
          : `<div class="kargo-sonuc"><p>${esc(t("shipOther"))}</p><a class="dugme" style="margin-top:12px" target="_blank" rel="noopener" href="${esc(wa(AYAR.bilgiNo, t("waHello")))}">${IKON.wa} ${esc(t("info"))}</a></div>`;
      };
      sec.addEventListener("change", yaz);
      yaz();
    },
    film() {
      const film = $("#film");
      const gozcu = new IntersectionObserver((l) => l.forEach((g) => {
        if (!g.isIntersecting) return;
        const im = $("img", g.target);
        if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; }
        g.target.classList.add("gorundu");
        const sonraki = g.target.nextElementSibling && $("img", g.target.nextElementSibling);
        if (sonraki && sonraki.dataset.src) { sonraki.src = sonraki.dataset.src; delete sonraki.dataset.src; }
      }), { root: film, threshold: 0.55 });
      $$(".kare", film).forEach((k) => gozcu.observe(k));
      let oynuyor = null;
      const dugme = $("#oynat");
      dugme.addEventListener("click", () => {
        if (oynuyor) { clearInterval(oynuyor); oynuyor = null; dugme.textContent = `▶ ${t("playFilm")}`; return; }
        dugme.textContent = `❚❚ ${t("pause")}`;
        oynuyor = setInterval(() => { if (film.scrollTop + film.clientHeight >= film.scrollHeight - 4) film.scrollTo({ top: 0 }); else film.scrollBy({ top: film.clientHeight, behavior: "smooth" }); }, 4200);
      });
    },
    model(kod) {
      const u = modelBul(kod);
      if (!u) return;
      say("m", u.kod);
      const gal = $("#galeri");
      $$("[data-git]").forEach((b) => b.addEventListener("click", () => gal.children[Number(b.dataset.git)].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })));
      gal.addEventListener("scroll", () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); $$("[data-git]").forEach((b, j) => b.classList.toggle("aktif", j === i)); }, { passive: true });
      $$("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoomAc($("img", b.parentElement).dataset.buyuk)));
      $$("img[data-buyuk]", gal).forEach((im) => { let son = 0; im.addEventListener("click", () => { const s = Date.now(); if (s - son < 320) zoomAc(im.dataset.buyuk); son = s; }); });
      $$(".model-video", gal).forEach((v) => { v.controls = true; videoKuyrugu(v); });
    },
  };

  // ---------- Yakınlaştırma (kumaş dokusu, dikiş) ----------
  function zoomAc(src) {
    const kap = document.createElement("div");
    kap.className = "zoom";
    kap.innerHTML = `<button class="kapat" aria-label="×">×</button><img alt=""><span class="ipucu">${esc(t("zoomHint"))}</span>`;
    document.body.appendChild(kap);
    const im = $("img", kap);
    let s = 1, x = 0, y = 0, taban = 1;
    const ciz = () => { im.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
    const sinirla = () => {
      const w = im.naturalWidth * s, h = im.naturalHeight * s, W = innerWidth, H = innerHeight;
      x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x));
      y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, y));
    };
    const olcek = (yeni, cx, cy) => { yeni = Math.min(Math.max(yeni, taban), taban * 5); x = cx - (cx - x) * (yeni / s); y = cy - (cy - y) * (yeni / s); s = yeni; sinirla(); ciz(); };
    im.onload = () => { im.style.left = "0"; im.style.top = "0"; taban = Math.min(innerWidth / im.naturalWidth, innerHeight / im.naturalHeight); s = taban; sinirla(); ciz(); };
    im.src = src;
    const p = new Map();
    let onceki = null, sonDokunma = 0;
    kap.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".kapat")) return;
      kap.setPointerCapture(e.pointerId); p.set(e.pointerId, e);
      const n = Date.now();
      if (p.size === 1 && n - sonDokunma < 300) olcek(s > taban * 1.2 ? taban : taban * 2.6, e.clientX, e.clientY);
      sonDokunma = n; onceki = null;
    });
    kap.addEventListener("pointermove", (e) => {
      if (!p.has(e.pointerId)) return;
      const eski = p.get(e.pointerId); p.set(e.pointerId, e);
      if (p.size === 1) { x += e.clientX - eski.clientX; y += e.clientY - eski.clientY; sinirla(); ciz(); }
      else if (p.size === 2) {
        const [a, b] = [...p.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (onceki) olcek(s * (d / onceki), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        onceki = d;
      }
    });
    const birak = (e) => { p.delete(e.pointerId); if (p.size < 2) onceki = null; };
    kap.addEventListener("pointerup", birak); kap.addEventListener("pointercancel", birak);
    kap.addEventListener("wheel", (e) => { e.preventDefault(); olcek(s * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY); }, { passive: false });
    const kapat = () => { kap.remove(); removeEventListener("keydown", tus); };
    const tus = (e) => { if (e.key === "Escape") kapat(); };
    addEventListener("keydown", tus);
    $(".kapat", kap).addEventListener("click", kapat);
  }

  // ---------- Yönlendirme ----------
  const MENU = ["home", "new", "lookbook", "story", "sizes", "shipping"];
  function yol() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";
    const [ad, arg] = h.split("/");
    if (ad === "stars" && !AYAR.yildizlar) return ["home"];
    return SAYFALAR[ad] ? [ad, arg] : ["home"];
  }
  function sayfaGoster() {
    const [ad, arg] = yol();
    const ana = $("#sayfa");
    ana.innerHTML = SAYFALAR[ad](arg);
    ana.classList.remove("sayfa-gir"); void ana.offsetWidth; ana.classList.add("sayfa-gir");
    $(".alt").hidden = ad === "film";
    if (ad !== "film") window.scrollTo(0, 0);
    $$(".menu a, .cekmece a").forEach((a) => a.classList.toggle("aktif", a.getAttribute("href") === `#${ad}`));
    if (SONRA[ad]) SONRA[ad](arg);
    tembelKur(ana);
  }

  // ---------- İskelet ----------
  function iskelet() {
    const menuLink = (k) => `<a href="#${k}">${esc(t(k))}</a>`;
    $("#site").innerHTML = `
      <div class="isimler" aria-hidden="true"><span>VOLONTE</span><span>BLACK ROSE</span><span>VOLONTE</span><span>BLACK ROSE</span></div>
      <header class="ust"><a class="logo" href="#home">VOLONTE</a>
        <nav class="menu">${[...MENU, ...(AYAR.yildizlar ? ["stars"] : [])].map(menuLink).join("")}</nav>
        <div class="dil">${["en", "fr", "tr"].map((d) => `<button data-dil="${d}" class="${d === dil ? "aktif" : ""}">${d.toUpperCase()}</button>`).join("")}</div>
        <a class="kalp-dugme" href="#wishlist" aria-label="${esc(t("wishlist"))}">${IKON.kalp.replace("<svg", '<svg fill="none" stroke="currentColor" stroke-width="1.4"')}<b id="istek-sayi" hidden>0</b></a>
        <button class="hamburger" aria-label="Menu"><span></span></button></header>
      <div class="cekmece" hidden><button class="kapat" aria-label="×">×</button>${[...MENU, "wishlist", ...(AYAR.yildizlar ? ["stars"] : [])].map(menuLink).join("")}</div>
      <main id="sayfa"></main>
      <footer class="alt"><div class="logo">VOLONTE</div><p class="slogan-kucuk">Live your life</p>
        <p><a class="dugme dolu" target="_blank" rel="noopener" href="${esc(wa(AYAR.siparisNo, t("waHello")))}">${IKON.wa} ${esc(t("order"))}</a></p>
        <div class="alt-linkler"><a target="_blank" rel="noopener" href="${esc(wa(AYAR.bilgiNo, t("waHello")))}">${esc(t("info"))}</a><a target="_blank" rel="noopener" href="${AYAR.telegram}">Telegram</a><a href="#sizes">${esc(t("sizes"))}</a><a href="#shipping">${esc(t("shipping"))}</a><a href="#privacy">${esc(t("privacy"))}</a></div>
        <p>${esc(t("address"))}: ${esc(AYAR.adres)}</p><p style="margin-top:8px">© ${new Date().getFullYear()} VOLONTE · VOLONTE & BLACK ROSE</p></footer>`;
    $$("[data-dil]").forEach((b) => b.addEventListener("click", () => { dil = b.dataset.dil; sakla.koy("dil", dil); document.documentElement.lang = dil; iskelet(); sayfaGoster(); }));
    const cek = $(".cekmece");
    $(".hamburger").addEventListener("click", () => { cek.hidden = false; });
    cek.addEventListener("click", (e) => { if (e.target.closest("a, .kapat")) cek.hidden = true; });
    sayacGuncelle();
    if (window.TEMA && TEMA.isimler) TEMA.isimler($(".isimler"));
    // Gizlilik bildirimi ilk görüntüyü kapatmasın: ilk kaydırmada, sayfa değişince ya da 8 sn sonra çıkar
    if (!bantKuruldu) { bantKuruldu = true; addEventListener("scroll", gizlilikBandi, { once: true, passive: true }); addEventListener("hashchange", gizlilikBandi, { once: true }); setTimeout(gizlilikBandi, 8000); }
  }
  let bantKuruldu = false;
  function gizlilikBandi() {
    if (sakla.al("gizlilik", false) || $(".gizlilik-bant")) return;
    const b = document.createElement("div");
    b.className = "gizlilik-bant";
    b.innerHTML = `<span>${esc(t("privacyBar"))} <a href="#privacy" style="border-bottom:1px solid var(--cizgi)">${esc(t("privacy"))}</a></span><button>${esc(t("ok"))}</button>`;
    document.body.appendChild(b);
    $("button", b).addEventListener("click", () => { sakla.koy("gizlilik", true); b.remove(); });
  }

  // ---------- Ses: sadece dokununca; kapatma düğmesi ----------
  let sesAcik = sakla.al("ses", true);
  let ctx = null;
  let konusma = null;
  function sesDugmesi() {
    const b = document.createElement("button");
    b.className = "ses-dugme"; b.id = "ses";
    b.setAttribute("aria-label", "Sound"); b.setAttribute("aria-pressed", String(sesAcik));
    b.innerHTML = '<svg class="acik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><svg class="kapali" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      sesAcik = !sesAcik; sakla.koy("ses", sesAcik); b.setAttribute("aria-pressed", String(sesAcik));
      if (!sesAcik) sesiDurdur();
    });
    document.body.appendChild(b);
  }
  function sesiDurdur() {
    try { if (ctx) ctx.suspend(); } catch { /* */ }
    try { speechSynthesis.cancel(); } catch { /* */ }
    if (konusma) { konusma.pause(); konusma = null; }
  }
  // Kendi müziğimiz: tarayıcıda üretilen kısa, yumuşak akor + çan (hiçbir markanın müziği/jingle'ı değil).
  function muzik(notalar) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ctx = ctx || new A();
    ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    const ana = ctx.createGain(); ana.gain.value = 0.22;
    const yanki = ctx.createDelay(); yanki.delayTime.value = 0.32;
    const geri = ctx.createGain(); geri.gain.value = 0.38;
    yanki.connect(geri); geri.connect(yanki); yanki.connect(ana); ana.connect(ctx.destination);
    notalar.forEach((f, i) => {
      for (const [tip, carp, ses] of [["sine", 1, 0.5], ["triangle", 2, 0.12]]) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = tip; o.frequency.value = f * carp; o.detune.value = (i - 1) * 4;
        const bas = t0 + i * 0.16;
        g.gain.setValueAtTime(0, bas); g.gain.linearRampToValueAtTime(ses, bas + 0.5); g.gain.exponentialRampToValueAtTime(0.0008, bas + 4.2);
        o.connect(g); g.connect(ana); g.connect(yanki); o.start(bas); o.stop(bas + 4.4);
      }
    });
    const can = ctx.createOscillator(); const cg = ctx.createGain();
    can.type = "sine"; can.frequency.value = notalar[notalar.length - 1] * 4;
    cg.gain.setValueAtTime(0, t0 + 0.9); cg.gain.linearRampToValueAtTime(0.16, t0 + 0.92); cg.gain.exponentialRampToValueAtTime(0.0005, t0 + 3.4);
    can.connect(cg); cg.connect(ana); cg.connect(yanki); can.start(t0 + 0.9); can.stop(t0 + 3.6);
  }
  // Slogan: kendi ses kaydımız (/ses/slogan.mp3). Kayıt gelene kadar taslakta tarayıcının sesiyle okunur.
  function slogan() {
    const a = new Audio("/ses/slogan.mp3");
    a.volume = 0.9;
    const yedek = () => {
      if (!sesAcik || !window.speechSynthesis) return;
      const u1 = new SpeechSynthesisUtterance("Volonté"); u1.lang = "fr-FR"; u1.rate = 0.82;
      const u2 = new SpeechSynthesisUtterance("Live your life."); u2.lang = "en-GB"; u2.rate = 0.86; u2.pitch = 0.95;
      speechSynthesis.cancel(); speechSynthesis.speak(u1); speechSynthesis.speak(u2);
    };
    a.addEventListener("error", yedek, { once: true });
    setTimeout(() => { if (sesAcik) a.play().then(() => { konusma = a; }).catch(yedek); }, 1100);
  }

  // ---------- Giriş ----------
  async function basla() {
    document.documentElement.lang = dil;
    if (/[?&]taslak=/.test(location.search) || window.VOLONTE_TASLAK) { const e = document.createElement("div"); e.className = "taslak-etiket"; e.textContent = `${t("draft")} ${(window.TEMA && TEMA.ad) || ""}`; document.body.appendChild(e); }
    sesDugmesi();
    const giris = $("#giris");
    $(".dokun", giris).textContent = t("tap");
    const sahne = window.TEMA && TEMA.sahne ? TEMA.sahne($("canvas", giris)) : null;
    const veri = veriAl();
    // Giriş oynarken vitrinin ilk fotoğrafı arkada iner (dokununca hazır olsun)
    veri.then(() => { const u = MODELLER[0]; if (u) new Image().src = img(u.fotolar[0], genislik((window.TEMA && TEMA.vitrin) === "serit" ? innerWidth * 0.8 : innerWidth)); });
    let girildi = false;
    const gir = async () => {
      if (girildi) return; girildi = true;
      if (sesAcik) { try { muzik((window.TEMA && TEMA.notalar) || [220, 277.18, 329.63, 415.3]); } catch { /* ses yoksa sessiz devam */ } slogan(); }
      await veri;
      iskelet(); sayfaGoster();
      $("#site").hidden = false;
      giris.classList.add("kapaniyor");
      if (sahne && sahne.hizlan) sahne.hizlan();
      await (window.TEMA && TEMA.gecis ? TEMA.gecis(giris, $("#site")) : Promise.resolve());
      giris.classList.add("bitti");
      if (sahne && sahne.dur) sahne.dur();
      try { if (!sessionStorage.getItem("v")) { sessionStorage.setItem("v", "1"); say("v"); } } catch { say("v"); }
      // Videolar: sayfa tamamen yüklendikten sonra, sırayla
      const serbest = () => setTimeout(() => { videoSerbest = true; videoIlerle(); }, 4000);
      const ilkFoto = $(".slayt img");
      if (!ilkFoto || ilkFoto.complete) serbest(); else { ilkFoto.addEventListener("load", serbest, { once: true }); ilkFoto.addEventListener("error", serbest, { once: true }); }
    };
    giris.addEventListener("click", gir);
    giris.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") gir(); });
    addEventListener("hashchange", () => { if (girildi) sayfaGoster(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", basla); else basla();
})();
