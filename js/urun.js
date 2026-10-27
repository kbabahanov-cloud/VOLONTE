// =====================================================
//  VOLONTE — MODEL SAYFASI (urun.html?kod=3194)
//  Veriyi Selin doldurur: veri/urunler.json
//  Fotoğraflar: galeri/<kod>/<n>.jpg · Videolar: Telegram gönderisi olarak gömülür.
// =====================================================

(function () {
  const DILLER = [
    { id: "en", ad: "English" },
    { id: "fr", ad: "Français" },
    { id: "pt", ad: "Português" }
  ];

  function telegramGomulu(gonderi) {
    return '<div class="model-video"><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-post="' +
      yaziTemizle(gonderi) + '" data-width="100%"></' + "script></div>";
  }

  function ciz(alan, u) {
    document.title = (u.baslik || u.kod) + " — " + u.kod + " — VOLONTE";
    const fotolar = (u.fotolar || []).map(function (f, i) {
      return '<a class="model-foto" href="' + yaziTemizle(f) + '" target="_blank" rel="noopener"><img src="' + yaziTemizle(f) +
        '" alt="' + yaziTemizle(u.baslik || u.kod) + " — " + (i + 1) + '" loading="' + (i < 2 ? "eager" : "lazy") + '"></a>';
    }).join("");
    const videolar = (u.videolar || []).map(telegramGomulu).join("");
    const sekmeler = DILLER.filter(function (d) { return u.aciklama && u.aciklama[d.id]; }).map(function (d, i) {
      return '<button type="button" class="chip' + (i === 0 ? " active" : "") + '" data-dil="' + d.id + '">' + d.ad + "</button>";
    }).join("");
    const mesaj = u.fiyat && !u.gizli
      ? "Hello VOLONTE, I would like to order " + u.kod + " – " + (u.baslik || "") + " ($" + u.fiyat + "). Which colours are available?"
      : "Hello VOLONTE, I am interested in " + u.kod + " – " + (u.baslik || "") + ". Could you send me the price and available colours?";
    alan.innerHTML =
      '<div class="model-galeri">' + fotolar + videolar + "</div>" +
      '<div class="model-bilgi">' +
        '<p class="product-code">' + yaziTemizle(u.kod) + "</p>" +
        "<h1>" + yaziTemizle(u.baslik || u.kod) + "</h1>" +
        (u.bedenler ? '<p class="product-meta">Sizes: ' + yaziTemizle(u.bedenler) + " · sold by series (mixed sizes)</p>" : "") +
        (u.gizli ? '<p class="model-fiyat">Currently out of stock</p>'
          : u.fiyat ? '<p class="model-fiyat">Wholesale price: $' + yaziTemizle(String(u.fiyat)) + "</p>" : "") +
        '<div class="chips model-diller">' + sekmeler + "</div>" +
        '<p class="model-aciklama" id="aciklama"></p>' +
        '<a class="btn" target="_blank" rel="noopener" href="' + whatsappLink(mesaj) + '">' + (u.fiyat && !u.gizli ? "Order on WhatsApp" : "Ask on WhatsApp") + "</a>" +
      "</div>";
    const aciklama = alan.querySelector("#aciklama");
    function dilSec(d) {
      aciklama.textContent = (u.aciklama && u.aciklama[d]) || "";
      alan.querySelectorAll("[data-dil]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-dil") === d); });
    }
    alan.querySelector(".model-diller").addEventListener("click", function (e) {
      const b = e.target.closest("[data-dil]");
      if (b) dilSec(b.getAttribute("data-dil"));
    });
    dilSec("en");
    // Telegram oynatıcı betikleri innerHTML ile çalışmaz; yeniden ekle.
    alan.querySelectorAll(".model-video script").forEach(function (eski) {
      const yeni = document.createElement("script");
      Array.prototype.forEach.call(eski.attributes, function (a) { yeni.setAttribute(a.name, a.value); });
      eski.replaceWith(yeni);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const alan = document.getElementById("model");
    if (!alan) return;
    const kod = new URLSearchParams(location.search).get("kod");
    fetch("veri/urunler.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (liste) {
        const u = (liste || []).find(function (x) { return x.kod === kod; });
        if (u) ciz(alan, u);
        else alan.innerHTML = '<p class="empty">This model is not on the site yet. <a href="urunler.html">Back to the collection</a>.</p>';
      })
      .catch(function () { alan.innerHTML = '<p class="empty">Could not load the model.</p>'; });
  });
})();
