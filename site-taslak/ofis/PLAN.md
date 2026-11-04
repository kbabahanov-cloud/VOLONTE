# VOLONTE SANAL OFİS — Plan (4 Kasım 2026)

Ayrı worker `volonte-ofis`, ayrı önizleme adresi. Canlı siteye ve botlara dokunmaz.
Sadece Patron girer (şifre, Cloudflare secret `OFIS_SIFRE`). Depoda kişi kimliği, numara, fiyat, ciro yok.

## Aşama 1 — Canlı izleme (bu demo)

**Ne okur (hepsi SADECE OKUMA):**
- Ortak kayıt (KV): bot kalp atışları (`durum:webhook`, `selin:webhook`, `sami:webhook`, `pelin:webhook`), hata kayıtları
  (`kemal:sonHata`, `selin:hata`, `sami:hata`, `pelin:hata`, `venom:bot:hata`), günlük raporlar (`venom:rapor:<bot>:<gün>`),
  Kemal'in bugünkü paylaşım sayacı, son paylaşımlar (`sonpaylasim`), Selin'in tarama raporu, Pelin harcamaları
  (`uretim-harcama`, `pelin-claude`, `pelin-openai`, `pelin-hf`), Higgsfield anahtar bitişi (`venom:hfAnahtar`),
  Venom bekleyen işleri (`venom:bot:is:*`).
- Stok deposu (StokDO, Kemal'in worker'ı; sadece okuma uçları): `/ozet` (stokta/stoksuz, Vegawin köprüleri),
  `/satislar` (bugün satılan adet — iki mağaza AYRI, fiyat yok), `/olaylar` (geldi/bitti), `/paylasimlar`,
  `/ayar-oku` ile botlar arası kuyruklar (`pelinKanal`, `pelinSite`, `giden`, `pelinIs`, `sonuc`) → "dosya taşıma" animasyonu.
- Site verisi (açık depo `veri/urunler.json`) → Selin'in ekranı.
- Pelin'in işleri: Pelin kayıtları kendi deposunda (DO). Aşama 1'de **son teşhis anlık görüntüsü** okunur
  (`venom:pelinTeshisSonuc`; "son bilinen: saat" yazar). CANLI olması için Pelin'e 3 satırlık ayna gerekir
  (her 2 dk `venom:pelinDurum` yazar) → Patron onayıyla eklenecek.

**Ne yazar:** sadece kendi anlık görüntülerini (`ofis:an:<zaman>`, 7 gün) — zaman geri sarma için. Başka hiçbir şey.

**Ekran:** kuş bakışı ofis (SVG), siyah-altın. Odalar: Pelin stüdyosu + Nora masası, Sami depo/stok odası,
Kemal kanal masası, Selin vitrin masası, ortada Patron masası, Venom müdür odası (yakında), ziyaretçi kapısı (Defne açılınca).
Karakterler: iş varken masada çalışır (yeşil), onay beklerken Patron masasına gelir (sarı, kâğıt yığını büyür),
hata varsa kırmızı + ünlem. Kuyrukta iş varsa dosyayı taşıyarak yürür (Pelin → Kemal → Selin; Venom → Sami).
Duvar ekranları: satış panosu (iki mağaza ayrı, adet), Kemal'in son paylaşımları, Selin'in son eklediği modeller,
Pelin'in iş ilerleme çubuğu + biten önizleme. Yan panel: son olaylar, onay bekleyenler, Pelin harcaması,
Higgsfield bakiyesi (tahmini: 20 $ − harcanan). 09:30 toplantı sahnesi (günlük raporlar balonlarda), 20:00 gün sonu özeti.
Zaman geri sarma: gün seç → olaylar sırayla oynar. ACİL DURDUR düğmesi var; Aşama 1'de BAĞLI DEĞİL (sadece gösterir).

**Aşama 1'de olmayanlar (bilerek):** web'den onay verme (onaylar Telegram'da, kart linki verilir), botları durdurma,
telefona bildirim (Telegram zaten bildiriyor; sonraki aşamada ofis kendi bildirimini de ekler).

## Aşama 2 — Tek botla sesli konuşma
Karaktere tıkla → yüzlü pencere; yazılı/sesli konuşma. Ses: tarayıcı mikrofonu → metin (Web Speech / Whisper),
cevap → ses (tarayıcı TTS ücretsiz; ileride marka sesi). Beyin: o botun kendi worker'ına **yeni bir `/sohbet` ucu**
(Patron şifresiyle) — aynı araçlar, aynı onay kartları, aynı güvenlik süzgeçleri. Hiçbir onay web'den geçmez; kartlar
yine Telegram'a düşer (ya da Aşama 2'de ofiste aynı kartlar, aynı "Emin misiniz?").
Maliyet: konuşma başına Claude bedeli (Sonnet ≈ 0,01–0,03 $), ses ücretsiz.

## Aşama 3 — Sanal toplantı odası
"Hepsini çağır" → 5 bot masaya gelir (farklı yüz + farklı ses). Patron sesli sorar; sıra yöneticisi (Venom beyni)
söz verir: her bot kısa konuşur (kendi verisiyle), itiraz hakkı 1 tur; Patron karar verir; karar özeti + görev dağılımı
(onaylı işler Venom kuyruğuna). Maliyet tahmini TOPLANTI ÖNCESİ karta yazılır: 5 bot × 2 tur × Sonnet ≈ 0,15–0,40 $;
Opus ile ≈ 0,6–1,5 $. Ses: 5 ayrı tarayıcı sesi ücretsiz; marka sesleri (ElevenLabs vb.) dakika başı ücretli → ayrıca onay.

## Sıra
1. Aşama 1 demo (bu) → Patron bakar, düzeltmeler.
2. Pelin aynası (3 satır) → Pelin canlı.
3. Kendi bildirimi (telefona) + Venom açılınca müdür odası.
4. Aşama 2 → 3.
