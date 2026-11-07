# VOLT ARENA — Robot savaş prototipi

Tarayıcıda (telefon ve bilgisayar) çalışan, özgün bir robot savaş oyunu denemesi.
War Robots türünden **ilham alır ama kopya değildir**: harita, kurallar, silahlar, isimler ve görseller bu proje için yeniden tasarlandı.

## Nasıl açılır?

Tarayıcı güvenlik kuralları yüzünden dosyaya çift tıklamak yerine küçük bir sunucu gerekir:

```
cd robot-oyun
python3 -m http.server 8080
```

Sonra tarayıcıda `http://localhost:8080` açılır. (Site GitHub Pages'e alınırsa adres `.../VOLONTE/robot-oyun/` olur.)

**Kontroller** — Telefon: sol başparmak hareket, sağ başparmak nişan + ateş, sağ üstte **AŞIRI YÜK** düğmesi.
Bilgisayar: WASD/ok tuşları hareket, fare nişan, sol tık ateş, Boşluk Aşırı Yük.

## Testler

```
npm test               # oyun mantığı: 14 test (Node 18+)
npm run test:tarayici  # gerçek Chromium'da telefon boyutunda uçtan uca test (Playwright)
```

---

## 1. Araştırma: War Robots ne yapıyor?

Kaynaklar: mağaza açıklamaları (App Store / Google Play arama özetleri), oyun wiki'leri ve bir oyuncu-yolculuğu analizi.
Not: warrobots.com, App Store ve Google Play sayfaları bu çalışma ortamının ağından doğrudan açılamadı; bilgiler arama sonuçlarındaki mağaza metinlerinden ve wiki sayfalarından derlendi.

- **Tür:** 6'ya 6 takım halinde, 3B dev robot (mech) nişancı oyunu (PvP).
- **Maç:** Haritada 5 işaret kulesi (beacon) var. Bir takım çoğunluğu tutarsa rakibin puanı erimeye başlar. Robotlar yok edilir, kuleler ele geçirilir.
- **Modlar:** Domination (ölünce üsten doğ), Beacon Rush (ele geçirilen kuleden doğ), ayrıca Arena ve Herkes Tek (FFA).
- **Garaj:** 5 robot yuvası. Bir robot yok olunca maça sıradaki robotla devam edilir. Yuvalar parayla açılır (yatay büyüme).
- **Yükseltme:** Gümüş ile robot ve silah seviyesi yükselir (dikey büyüme); ayrıca modüller ve pilotlar var.
- **Silahlar / robotlar:** 50+ robot; füzeler, plazma topları, dev pompalılar gibi silahlar; robota silah ve modül takılarak özelleştirilir.

**Oynanış döngüsü (özet):** Garajda robot + silah seç → maça gir → kule tut / düşman yok et → ödül (gümüş, altın) kazan → robot ve silah yükselt, yeni yuva aç → daha güçlü dön.

## 2. Özgün tasarım: VOLT ARENA'da ne farklı?

| Konu | War Robots | VOLT ARENA (bu prototip) |
|---|---|---|
| Bakış açısı | 3B, arkadan kamera | 2B, yukarıdan, tüm harita tek ekranda |
| Takım | 6'ya 6 | 3'e 3 (kısa, telefon dostu maç ~1,5 dk) |
| Hedef | 5 işaret kulesi, puan erir | 3 **enerji düğümü**; tutulan her düğüm puan verir, 100'e ilk ulaşan kazanır, süre 3 dk |
| Silah sınırı | Mermi / şarjör, yeniden doldurma | **Isı sistemi**: mermi bitmez ama silah ısınır; dolarsa %40'a soğuyana kadar kilitlenir |
| Harita ile ilişki | Kule = puan / doğma noktası | Kendi düğümünün üstünde **iki kat hızlı soğuma** → düğüm savunması ödüllenir |
| Özel güç | Robota/pilota bağlı yetenekler | Takımca dolan **Aşırı Yük** ölçeği (öldürme +25, düğüm başına sürekli dolum); 6 sn %50 hasar + %25 hız |
| Ölünce | Garajdaki sıradaki robot | 4 sn sonra aynı robotla üste dönüş |
| Gelişim | Gümüş/altın, seviye, modül, pilot | Maç sonu **hurda** → Atölyede 4 dal (Zırh, Motor, Soğutucu, Silah), her biri 5 seviye |

**Silahlar:** Kinetik Tüfek (hızlı, az hasar), Ray Topu (yavaş, yüksek hasar, uzun menzil), Saçma Top (5 saçma, kısa menzil).
Denge testi: 40 bilgisayar-bilgisayar maçında sonuç 19–21, ortalama maç süresi 83 sn.

## 3. Teknoloji seçimi

- **HTML5 Canvas + saf JavaScript** — kurulum yok, derleme yok; telefon tarayıcısında hemen açılır. Bu depo zaten GitHub Pages ile yayınlandığı için ücretsiz yayınlanabilir.
- Oyun mantığı (`src/engine.js`) çizimden tamamen ayrı → Node'da test edilir; ileride aynı mantık bir sunucuya taşınıp çok oyunculu yapılabilir.
- Dokunmatik çift sanal çubuk + klavye/fare.
- Test: Node'un kendi test aracı (`node --test`) + Playwright ile gerçek Chromium testi.

Neden Unity/Godot değil? Prototip için tarayıcı en hızlı yol: mağaza onayı, kurulum veya lisans gerekmez. Oyun beğenilirse bir sonraki adım Godot (ücretsiz, iOS/Android'e çıktı verir) olabilir.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `index.html`, `style.css` | Menü, atölye, maç ekranı |
| `src/engine.js` | Oyun kuralları: hareket, çarpışma, ateş, ısı, düğümler, yapay zekâ, yükseltmeler |
| `src/main.js` | Çizim, dokunmatik/klavye kontrolleri, kayıt (tarayıcı hafızası) |
| `tests/engine.test.js` | Kural testleri |
| `tests/tarayici.mjs` | Uçtan uca tarayıcı testi |

## Sonraki adımlar (öneri)

1. Gerçek çok oyunculu (WebSocket sunucu) — mantık zaten ayrı olduğu için mümkün.
2. Robot şasi çeşitleri (hafif/ağır) ve ikinci silah yuvası.
3. Ses efektleri ve basit robot çizimleri yerine hazır görseller.
