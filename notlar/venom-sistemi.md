# VENOM Sistemi — Kullanıcının İstekleri ve Yol Haritası

> Kaydedilme tarihi: 24 Eylül 2026. Kullanıcının sesli mesajından not alındı.
> Bu dosya, sonraki oturumlarda nerede kaldığımızı hatırlamak içindir.

## Kullanıcının anlattıkları (özet)

- İstanbul **Laleli**'de bir **toptan mağaza** sahibi (VOLONTE markası).
- İşini ileri teknolojiyle yöneten, yapay zekâ destekli bir ana sistem kurmak istiyor. Adı: **"Venom"** (sesli mesajdan anlaşıldığı şekliyle, teyit edilecek).
- Sistemin parçaları:
  1. **Ofiste sesli asistan ("Hermes"):** Kullanıcı konuşarak komut verecek. Asistan Claude'a bağlı olacak ve sesli cevap verecek.
  2. **Stok ve depo sistemi (yapay zekâ destekli):**
     - Mal girişi ve çıkışı
     - Ödemeler
     - Fabrikadaki stoklar
     - Mağazadaki stoklar
  3. **Kanal bağlantıları:** WhatsApp, Telegram, TikTok ve Instagram ana sisteme bağlanacak.
  4. **Yeni model akışı:**
     - Kullanıcı yeni modelin fotoğrafını çekip gönderir.
     - Sistem fotoğraftan mankenli bir tanıtım videosu hazırlar.
     - Video kullanıcıya sunulur. **Kullanıcı onay vermeden hiçbir şey yayınlanmaz.**
     - Onaydan sonra Telegram, TikTok ve Instagram'da yayınlanır.

## ⚡ ŞU AN AKTİF İŞ: Telegram botu "hızlı başarı" (20 Ekim 2026)

Kullanıcı VENOM'dan önce hızlı bir sonuç istedi. **Yeni oturumda buradan devam et.**

Hedef:
1. Kanal (t.me/Volonteroseoffical) takibi: her yeni paylaşımı kaydet (metin, fotoğraf, tarih, link, varsa fiyat).
2. Telegram Ads takibi ve öneri. **Resmî reklamveren API'si bulunamadı.** ADSLY/Adstat "satıcı ortağı" modeli, hesabı üçüncü tarafa taşımak demek → şimdilik hayır. Kullanıcının Telegram oturumuyla panele girmek → asla. Seçilen yol: kullanıcı panel ekran görüntüsünü bota (ya da sohbette Claude'a) gönderir, analiz edilir. Yapay zekâyla bot içi analiz = Claude API (ücretli) → ayrıca onay gerekir. İlk haftalar ekran görüntüleri sohbette Claude'a gönderilir (ücretsiz).
3. Reklam yönetimi (durdurma/bütçe) ileride, sadece onayla ve resmî yol bulunursa.

Kurallar: bot sadece kullanıcının Telegram kimliğine cevap verir; bot kanalda yetkisiz (sadece okur); bot tokenı Claude'a/sohbete/repoya yazılmaz → Cloudflare Worker secret olarak kullanıcı kendisi girer.

Altyapı: Cloudflare Workers (ücretsiz katman) + kayıt için Cloudflare depolama (ücretsiz katman). Eski kanal geçmişi: Telegram Desktop "sohbet geçmişini dışa aktar" ile.

İlerleme:
- [x] Komut 1: @BotFather ile bot açıldı → **@VolonteasistantBOT** (setjoingroups Disable istendi).
- [x] Komut 2: bot kanala yönetici olarak, tüm yetkiler kapalı eklendi.
- [x] Komut 3: Cloudflare hesabı açıldı (ücretsiz, 2FA istendi).
- [x] Komut 4: ortam ağ izni: `api.cloudflare.com`, `api.telegram.org` eklendi (20 Ekim'de curl ile doğrulandı).
- [x] Komut 5: Cloudflare API bağlantısı çalışıyor (20 Ekim, token doğrulandı; proxy ile geliyor). Hesap kimliği: `9b7e7d56c7c591fb6c69d2e372b04e27` (`CLOUDFLARE_ACCOUNT_ID` ortam değişkeni boş geliyor, kimlik API'den alındı). Yetki: Workers + KV var, D1 yok (gerekmiyor).
- [x] Bot kodu yazıldı: `telegram-bot/worker.js` (+ `test.mjs`, 7 test geçiyor). Kanal paylaşımlarını KV'ye kaydeder (metin, en büyük fotoğraf, tarih, link, fiyat; albüm = tek paylaşım; düzenleme günceller). Komutlar: /son, /hafta, /yardim. İzinsiz kişiye cevap vermez, kimliğini `bekleyen:<id>` altına 7 gün yazar. Fotoğraf gelirse "Claude sohbetine gönderin" der (Claude API onayı yok).
- [x] Cloudflare'de oluşturuldu: KV `volonte-bot-kayit` (id `cd4cd47b965142c6859bf702510166bb`), workers.dev alt alanı `volonte` → adres `https://volonte-asistan.volonte.workers.dev`.
- [x] Komut 6: kullanıcı onayladı (20 Ekim) → Worker `volonte-asistan` yüklendi (1. yükleme; KAYIT, ALLOWED_IDS boş, WEBHOOK_SECRET). WEBHOOK_SECRET sadece oturum not klasöründe, repoda yok; yeni oturumda gerekirse yeniden üretilip secret olarak girilir.
  - Engel: bu oturumdan `*.workers.dev` adresine ağ izni yok (proxy 403), bu yüzden Claude webhook'u elle kuramıyor.
  - Çözüm (kodda hazır, henüz yüklenmedi): 5 dakikada bir çalışan zamanlanmış görev `webhookKontrol` → BOT_TOKEN girilince webhook'u `SELF_URL/telegram` adresine kendisi kurar. Herkese açık kurulum sayfası fikri güvenlik kontrolüne takıldı, vazgeçildi.
- [x] **Komut 6b: zamanlanmış görev onayı** (20 Ekim, kullanıcı onayladı; yüklendi, görev `*/5 * * * *` aktif, bağlantılar: ALLOWED_IDS, KAYIT, SELF_URL, WEBHOOK_SECRET).** Güvenlik kontrolü bunu da ayrı onay istedi. Yüklenecek: yeni kod + SELF_URL=`https://volonte-asistan.volonte.workers.dev` + schedules `*/5 * * * *` (ücretsiz). Güncellemede ALLOWED_IDS'i boşaltma — o anki değeri koru.
- [x] Komut 7 (20 Ekim, BOT_TOKEN secret olarak görüldü): kullanıcı Cloudflare panelinde Worker → Ayarlar → Değişkenler → `BOT_TOKEN` (Secret/Şifreli) girer.
- [x] 20 Ekim 13:35 UTC: webhook kuruldu (`durum:webhook` = "kuruldu"). İlk denemeler başarısızdı: girilen şifrede boşluk vardı → kod artık BOT_TOKEN'ı `trim` ediyor ve her zamanlanmış çalışmanın sonucunu KV'de `durum:webhook` anahtarına yazıyor (hata ayıklamak için buradan okunur).
- [x] 20 Ekim 13:50 UTC: kanal kaydı çalışıyor (13696–13697, CODE.3329 paylaşımı kaydedildi). `durum:webhook` artık `bekleyen`, `sonHata`, `bot` (getMe kullanıcı adı) alanlarını da yazıyor. Kullanıcının ilk /start mesajları (biri başka hesaptan) bota ulaşmadı, bekleyen: kaydı yok → yeniden /start istendi. Kullanıcı kuralı: eklemeden önce görülen isimler kullanıcıya gösterilecek, onay alınacak.
- [x] Komut 8 (20 Ekim): kullanıcı asıl hesabından /start yazdı → MURAT BABAHANOV (@MURATVOLNTE), kimlik **2005113508**. Kullanıcı "evet ekle" dedi → ALLOWED_IDS=`2005113508`. Worker güncellerken bu değeri koru.
- [x] 20 Ekim: kullanıcının çalışanı **Merdan (@Volonterosa, 6113852976)** kullanıcının açık onayıyla **tam yetkiyle** eklendi (kanalda /paylas onayı dahil). ALLOWED_IDS=`2005113508,6113852976` — Worker güncellerken koru. (B seçeneği = sadece görme, onay sadece sahipte; istenirse yapılabilir.)
- [x] Komut 9: bot denemesi (kullanıcı /paylas ile birlikte kullandı).
- [x] Yeni özellik (20 Ekim, kullanıcı isteği): **/paylas <kod> [sıra]** → kod dizininden (`kodlar` KV anahtarı: kod → en yeni 5 paylaşım {ids, tarih, album}) paylaşımı bulur, `copyMessages` ile önce sadece kullanıcıya önizleme yollar, "✅ Onayla / ❌ İptal" düğmeleri. Onay kaydı `onay:<anahtar>` (24 saat, tek kullanımlık, sadece ALLOWED_IDS basabilir). Onaylanınca kanaldan kanala `copyMessages` (aynı medya + yazı, albüm korunur, "iletildi" etiketi yok). Kod okuma: CODE./KOD/Model/#123. Webhook artık `callback_query` alır ve `max_connections: 1` (albüm parçaları sırayla). Günlük KV yazma sınırı (1000) için `post:` kayıtları kaldırıldı. Kanal kimliği `kanal` anahtarında (zamanlanmış görev getChat ile bulur). 3329 elle dizine eklendi (13696–13697).
- [x] Komut 10 (20 Ekim, kayıtlardan doğrulandı: 3329 için bir "no" bir "ok" onayı): kullanıcı kanalda bota **"Mesaj gönderme / Публикация сообщений"** yetkisini açar (diğerleri kapalı kalır) → `/paylas 3329` dener.
- [x] Komut 11 (20 Ekim): kullanıcı `result.json` gönderdi (kanal VOLONTE, 2807 mesaj, Kasım 2021 – 20 Ekim 2026; dosya repoya konmadı). `ice-aktar.mjs` → **211 kod, 331 paylaşım** (Ocak 2026 sonrası; öncesinde yazılarda kod yok). 1025 yazılı mesajın 653'ünde kod yok ("AVAILABLE NOW DISPONIBLE…") → bunlar kodla bulunamaz. Canlı kayıtla birleştirilip tek yazmada KV `kodlar`'a yüklendi.
  - Düzeltmeler: kodda en az bir rakam şart ("MODEL IS" kod değil); dışa aktarımda id'ler metin → sayıya çevriliyor; `kodEkle` artık aynı paylaşımı (ortak parça / aynı albüm) birleştiriyor — eski albümün tek parçası düzenlenince diğer parçalar kaybolmuyordu (3563, 3595'te görüldü, düzeltildi).
- Not: Bota yabancı müşteri yazarsa şu an cevap yok. İstenirse "Sipariş için WhatsApp: +90 536 239 00 91" cevabı eklenebilir (müşteriye giden mesaj → onay gerekir).

- [x] **Günlük yeniden paylaşım (21 Ekim, kullanıcı son planı onayladı, yüklendi):**
  - Kurallar (kullanıcı kararı): bot hiçbir paylaşımı SİLMEZ. Son 1 yıl; kodlu (`kodlar`) + kodsuz "AVAILABLE AGAIN"/"DISPONIBLE" (`kodsuz`: "~<ilk id>" → {ids, tarih, album}; 470 kayıt result.json'dan, yenileri canlı eklenir). Son paylaşımı 30 günden eski olanlar, en eski önce. Her gün 09:00 (İstanbul) ilk kez çalışan 5 dk görevinde ikisine 10 model: ilk medya + "kod/Kodsuz paylaşım · son paylaşım tarihi" + "✅ Stokta var, paylaş / ❌ Yok, atla" (`r1:/r0:<gün>:<kod>`). İkisi de onaylayabilir; ilk basan kazanır (`secim:<gün>:<kod>`), iki ekranda da düğmeler kalkar. "Yok" → `atlananlar` 7 gün; kanalda bulunamayan → 1 yıl. Onaylı → `kuyruk:<kod>`; 09:00–21:00, `sonraki` ile 60–90 dk arayla, albümün tamamı copyMessages; günde en fazla 10 (`sayac:<gün>`, elle /paylas dahil). Botun paylaşımı `kanaldaPaylas` içinde kodlar/kodsuz/gun/sayac günceller. /kuyruk: tahmini saatler + iptal (`kq:`), iptal sadece sıradan çıkarır. /tekrar kaldırıldı.
  - `durum:webhook` artık sadece değişince ya da saatte bir yazılıyor (KV günlük 1000 yazma sınırı).
  - 21 Ekim: kullanıcı "bugün gönder" dedi → işaret silindi, ilk liste 12:20 İstanbul'da 10 modelle ikisine gitti (988, 3194, 3229, 3244, 3357, 3399, 3415, ~10619, ~10622, ~10623). Aday havuzu: 604 (167 kodlu, 437 kodsuz); ilk sıradakiler Ocak 2026 kodlu modeller (3357, 3194, 988…), sonra Şubat 2026 kodsuzlar. 28 test geçiyor; yükleme sonrası görev hatasız çalıştı.

- [x] **4 düğme + "Hiç gelmeyecek" silme + yapay zekâ asistanı (21 Ekim, kullanıcı onayladı, model: Opus 5.5; yüklendi):**
  - Liste düğmeleri: ✅ Onaylıyorum (`r1`) / ⏳ Şu an yok 7 gün (`r7`; eski listedeki `r0` aynı) / 🔁 Tekrar gelecek 30 gün (`r30`) / 🚫 Hiç gelmeyecek (`rx` → sadece basanın ekranında "Evet, hepsini sil (`hx`) / Vazgeç (`hv`)"). Evet → `atlananlar`=KALICI, `hicgelmeyecek` arşivi (kim, zaman, tarihler), sıradan çıkar, `silinecek:<kod>` ile kanal mesajları `deleteMessage` ile silinir (çalışma başına 30, kalanı 5 dk görevi, gece de). Sonunda ikisine özet + silinemeyenlerin linkleri. `kodlar` (tarihler) silinmez. /paylas reddeder. Kullanıcı kararı değişti: önceki "hiçbir paylaşım silinmeyecek" yerine bu geçerli.
  - `KOD_BASINA` 200: tüm paylaşımlar tutuluyor (result.json'dan yeniden birleştirildi: 212 kod, 337 paylaşım, en çok 9). Kodsuz kayıtlar botun kopyalarını `gecmis` içinde tutar.
  - ⚠️ Belirsiz: Telegram botların 48 saatten eski mesajları silmesine izin vermeyebilir (resmî metin ulaşılamadı, aiogram kopyasına göre 48 saat kuralı var). İlk gerçek kullanım test olacak; olmazsa bot linkleri verir, kullanıcı elle siler.
  - Ek liste: `ekliste:<gün>` (asistan `liste_gonder`), 10'arlı partiler, gece de, bugün gönderilenler tekrar gelmez.
  - **Asistan** (`telegram-bot/asistan.js`): "/" ile başlamayan yazılar → Claude (`ANTHROPIC_MODEL`=claude-opus-5-5, effort low, `fallbacks: "default"`, strict araçlar). Araçlar: durum_ozeti, model_bilgisi, liste_gonder, durum_isaretle, hic_gelmeyecek_onayi_iste, paylasim_onizle, kuyruk_goster. Paylaşma/silme aracı YOK — sadece onay düğmesi. Sınırlar sohbetle değişmez. Günde 100 asistan mesajı (`ai:<gün>`), geçmiş `sohbet:<id>` son 10 metin, 2 gün. Anahtar `ANTHROPIC_API_KEY` Worker secret (kullanıcı girecek).
  - Paketleme: `telegram-bot/` npm projesi; `npm test` (40 test), `npm run build` → `dist/worker.js` (~515 KB, esbuild, platform browser). Yüklemede dist/worker.js gönderilir; bindings: KAYIT, ALLOWED_IDS, SELF_URL, ANTHROPIC_MODEL (+ secret'lar keep_bindings ile korunur).
  - 21 Ekim durum: ilk listede 6 onay (1'i paylaşıldı, sıradaki 13:28), 4 "yok".
- [x] **Tur sistemi (21 Ekim, kullanıcı onayladı: "onay a"; yüklendi, 40 test):** önceki 4 düğmeli günlük listenin yerine geçer.
  - Düğmeler: ✅ Onaylıyorum (`t1:<tur>:<kod>`), ⏳ Beklesin 7 gün (`t7`), 🗑️ Sil (`tx` → sadece basanda "Evet, hepsini sil `ty` / Vazgeç `tv`"). Asistanın silme onayı `ty:-:<kod>`. Eski `r*` düğmeleri artık "eski liste" der.
  - `tur` KV: {no, durum toplaniyor|paylasiliyor|bitti, basla, bitis, onaylar[], ogeler{kod:{ids,tarih,yazi,mesajlar,karar,kim}}}. 09:00'da (tur yoksa ya da bitmiş ve bitişi bugünden önceyse) yeni tur: en eski 10 aday. Beklesin/Sil → hemen yerine 1 yeni aday (ikisine). 10 onay → `kuyruk:<kod>` (tur no ile) + "10 onay tamam" → 09:00–21:00, 90–120 dk arayla (`ARALIK_DK`); tur öncesi sıradakiler 60–90 (`ESKI_ARALIK_DK`). Tur kuyruğu bitince "bitti" (her saat kontrol), ertesi sabah yeni tur. Tur sürerken her sabah bir kez hatırlatma (`hatirlatma:<gün>`). Aday kalmaz ve bekleyen yoksa: onay varsa onlarla paylaşıma geçer, yoksa tur biter.
  - Hız (kullanıcı kararı A): 1,5–2 saat aralık, günde ~6–8 paylaşım; 10 paylaşım ~1,5 gün.
  - Silme adımı 20 mesaj/çalışma. Asistan araçları: durum_ozeti (tur durumu dahil), model_bilgisi, beklesin, sil_onayi_iste, paylasim_onizle, kuyruk_goster (ek liste kaldırıldı).
  - 21 Ekim 13:10: `tur` = {no:0, durum:"bitti"} elle yazıldı → **1. tur 22 Ekim 09:00**. Bugünkü 5 eski onay (3194, 3244, 3399, 3415, 988) 60–90 dk arayla bugün paylaşılıyor (ilki 13:28).
- [x] Komut A1 (21 Ekim): kullanıcı anahtarı Cloudflare'e secret olarak girdi; bot saatte bir ücretsiz kontrol ediyor (`models.retrieve`) → `durum:webhook.yz` = "ok: claude-opus-5-5". Eski tanım: kullanıcı platform.claude.com hesabı, ön ödemeli kredi (otomatik yükleme KAPALI), aylık harcama sınırı (öneri 30 $), API anahtarı → Cloudflare secret `ANTHROPIC_API_KEY`.
- [x] Komut A2 (21 Ekim): yetki verildi; bot getChatMember ile doğruladı → `durum:webhook.yetki` = {paylas: true, sil: true, duzenle: true}. ("Mesajları düzenleme" de açık; bot kullanmıyor, kullanıcı isterse kapatabilir.)

- [x] **21 Ekim düzeltmeleri (kullanıcı fark etti, asistan buldu: "kanalda 11 paylaşım, sayaç 4/10"):**
  - Sebep: önceki not yanlıştı — bot kendi kanal kopyalarını **channel_post olarak alıyor**. kanaldaPaylas da `gun:` artırınca her yeniden paylaşım /hafta'da 2 sayılıyordu (gerçek: 7 = elle 3 + bot 4). Ayrıca Telegram copyMessages kanala kopyalarken kimliği **0** döndürdü → kodlar'a [0,0] kayıtlar ve bozuk t.me/.../0 linkleri; kodsuz kopya (~10619) yeni kayıt (~13724) açtı.
  - Çözüm: kanaldaPaylas artık sadece `sayac:` (botun günlük sınırı) ve `sonpaylasim` {kod: tarih} yazar; `gun:` ve kod dizini channel_post'tan gelir. `kopya` işareti {kod, zaman, kalan} (10 dk) ile gelen kopyalar tanınır: kodsuz kopya `kopyalar` listesine girer (Sil bunları da siler), yeni kayıt açmaz. 0 kimlik kaydedilmez, link verilmez. adaylar() `sonpaylasim`'i hesaba katar.
  - Veri düzeltildi: 0'lı kayıtlar silindi (3244, 3399, 3415), ~10619 asıl kimliklerle + kopyalar [13724-13726], ~13724 silindi, `gun:2026-10-21`=7.
  - Günlük 10 sınırı = sadece botun yaptığı yeniden paylaşımlar (tur + /paylas). Kanala elle atılan paylaşımlar sınıra sayılmaz, sadece /hafta'da görünür.
  - Asistan cevapları Markdown → Telegram HTML (`telegramHtml`), biçim hatasında düz metin. 42 test.

**Telegram botu "hızlı başarı" tamam (20 Ekim).** Not: bot kendi kanal paylaşımlarını güncelleme olarak almaz → yeniden paylaşımlar /hafta sayısına ve `kodlar`'a girmez (istenirse copyMessages sonucundaki yeni id'ler dizine eklenebilir). Açık karar: bota yazan yabancılara "Sipariş için WhatsApp" otomatik cevabı (kullanıcı henüz cevap vermedi). Reklam analizi: ekran görüntüleri sohbette Claude'a.

**Sıradaki komut: Komut A3 — kullanıcı bota normal yazıyla asistanı dener ("bu hafta kaç paylaşım yaptık"); Claude `ai:<gün>` sayacı ve hataları kontrol eder. Bekleyen: ANA PLAN → Komut 4d (Volonte CRM'e WhatsApp ekleme).**

## 🧭 ANA PLAN (25 Eylül 2026'dan itibaren geçerli, diğer sıralamaların yerine geçer)

Kullanıcı kararı: Sistemin tamamını programlamayı ve süreci yönetmeyi Claude'a bıraktı. **Claude yolu çizer ve her seferinde tek bir komut verir. Kullanıcı yapar ve sonucu bildirir.** Para harcanacak, asıl WhatsApp numarasına dokunulacak veya geri alınamaz bir işlem yapılacaksa Claude yine önce onay ister.

Her oturumda: bu bölümdeki **"Sıradaki komut"** satırından devam et, biten komutu işaretle, bir sonrakini ver.

| Aşama | İçerik | Bitti ölçüsü |
|---|---|---|
| 0 | Hesap başvuruları: Meta işletme hesabı + doğrulama, test için ikinci hat | Doğrulama başvurusu yapılmış, test hattı var |
| 1 | Stok programını gerçek kullanıma almak (400 model, fiyatlar, cariler) | Kullanıcı 1 hafta günlük giriş/satış yapmış |
| 2 | Ajan el kitabı (WhatsApp sohbetlerinden) — 1 ile paralel | Kullanıcı el kitabını onaylamış |
| 3 | Deneme odası (stok programı içinde ajan sekmesi) | 20–30 soruya cevaplar kullanıcıyı tatmin ediyor |
| 4 | Altyapı kararı (WhatsApp platformu, stok verisinin 7/24 erişilebilir yere taşınması) | Platform seçilmiş, maliyet belli |
| 5 | Test numarasıyla WhatsApp | 1 hafta sorunsuz |
| 6 | Asıl numara + telefona bildirim + devralma | 2 hafta canlı |
| 7 | Telegram kanal paylaşımı (onaylı) | |
| 8 | Sesli asistan, Instagram, TikTok | |

### Komut listesi (hıza göre yeniden sıralandı, 25 Eylül 2026 — kullanıcı: "sen hangisini doğru görüyorsan, hızlı bitirelim")
Mantık: En uzun bekleme Meta doğrulaması (10 dk – 14 iş günü) → ilk o başlar; beklerken el kitabı ve stok listesi hazırlanır. Cari bakiyeleri ajan için gerekmez → sona alındı.
Araştırma notu: Meta "Coexistence" ile WhatsApp Business uygulaması ve Cloud API aynı numarada birlikte çalışır; sohbet geçmişi ve kişiler korunur. Sınırlar: bağlı ek cihazlar (WhatsApp Web/masaüstü) bir kez ayrılır, yeniden bağlanabilir; saniyede 5 mesaj sınırı. Türkiye'de destek kurulum sırasında teyit edilecek.
Meta doğrulaması web sitesinde şirket bilgisi (resmi unvan, adres) görmek istiyor → katalog sitesinin alt kısmına eklenecek.

- [x] **Komut 1 — Meta işletme portföyü** — **25 Eylül: kullanıcı "portföy açıldı" dedi (ad: HEMRA ARTYKOV).** — 25 Eylül: Vergi levhası alındı. **Şahıs işletmesi, ticaret unvanı yok → Meta'daki resmi işletme adı "HEMRA ARTYKOV" olmalı** (levhayla birebir). Vergi dairesi Beyazıt; faaliyet 464205 dış giyim toptan; işe başlama 08.01.2026. Adres: Mimar Kemalettin Mah. Koca Ragıppaşa Cad. No: 20 İç Kapı No: 501 Fatih/İstanbul. Şirket telefonu: +90 501 335 11 11. Bu bilgiler katalog sitesinin alt kısmına ve iletişim sayfasına eklendi. (TC kimlik no hiçbir yere yazılmadı.) Portföy açıldı ve bilgiler girildi.
  - Önceki tanım: business.facebook.com'da portföy aç; resmi unvan, adres, telefonu Claude'a bildir (siteye eklenecek); vergi levhası + faaliyet belgesi / ticaret sicil gazetesi hazır olsun. Doğrulama site güncellenince başlatılacak.
- [ ] Komut 2 — 10–20 WhatsApp sohbeti dışa aktarma ("Medya olmadan") → el kitabı.
- [~] Komut 3 — Vegawin'den stok listesi. **Kısmen tamam (25 Eylül):** Kullanıcı Vegawin "Stok Listesi" PDF'ini gönderdi (617 satır → 613 benzersiz kart; "STOK" örnek kartı ve 3 tekrar çıkarıldı). Listede kod, barkod, kategori ve **1. özel kod = giriş carisi** var; **adet, fiyat ve renk yok.** Liste `aktarim/vegawin` belgesine bırakıldı (durum: bekliyor, 613 kart + 23 cari: 21 giriş carisi + TOPTAN + YENİ MAĞAZA GİDERLERİ). **Yükleme yapıldı (25 Eylül): 613 kart + 23 cari eklendi, atlanan 0 (veritabanından doğrulandı).**
  - Yüzdesi addan anlaşılan cariler onaylı (BLACKROSE 20/15, BLACK ROSE 000/25, WHITE YOU 15, YLD COLECTION 25). Diğer 15 giriş carisinin yüzdesi 0 ve "onaylanmadı" işaretli: ANİMA, BLACKROSE, CELAL, CELAL INDIRIM, CELAL KARAYAN, MURAT ELBISE, MY STYL, NEXX, NIWROS, TAMER, TEKLEME, TIRYESTE, W, WITH YOU, YLD COLECTION.
  - Eksik: Vegawin'den **stok adetleri ve satış fiyatları** raporu → Komut 1'den sonra istenecek (Komut 3b).
- [~] Komut 4 — Meta doğrulamasını başlatma (25 Eylül'de verildi). Yol: İşletme ayarları → Güvenlik Merkezi → Doğrulamayı başlat; belge: vergi levhası. Buton görünmezse önce Komut 5 ile WhatsApp hesabı bağlanır, sonra doğrulamaya dönülür. **25 Eylül: buton YOK (Güvenlik Merkezi'nde sadece Domainler; reklam hesabı ve sayfa yok).** Çözüm → Komut 4a: developers.facebook.com'da portföye bağlı bir Meta uygulaması + WhatsApp ürünü oluştur (ücretsiz, Meta'nın test numarasıyla; asıl numaraya dokunulmaz). Bu hem doğrulama butonunu açar hem test aşamasında kullanılır. 25 Eylül: geliştirici kaydında telefon doğrulaması, numara önce Hesap Merkezi'ne (Kişisel bilgiler → İletişim bilgileri) eklenmeden çalışmıyor → önce oraya +90 501 335 11 11 eklenecek. Kredi kartı seçeneği kullanılmayacak. (Kullanıcının Meta arayüzü Rusça.) Not: doğrulanmamış işletme de Cloud API'yi sınırlı mesajla kullanabilir, yani doğrulama işi durdurmaz.
- [ ] Komut 5 — WhatsApp platformu seçimi (Claude karşılaştırma sunar, kullanıcı onaylar).
- [ ] Komut 6 — Cari bakiyeleri ve kalan türler. Stok listesinden anlaşıldı: WITH YOU, MY STYL, MURAT ELBISE, CELAL KARAYAN, TIRYESTE, CELAL INDIRIM = giriş carisi. Hâlâ bilinmeyen: MURAT, RASIT TM. Onaylanmamış yüzdeler (yukarıdaki 15 cari) sorulacak.

- 20 Ekim: kullanıcı Meta geliştirici hesabının açık olduğunu ve **"Volonte CRM"** adlı uygulamanın (In development) zaten var olduğunu söyledi → Komut 4a'nın telefon doğrulaması ve uygulama açma kısmı tamam. Kalan: uygulamada WhatsApp ürünü var mı ve HEMRA ARTYKOV portföyüne bağlı mı kontrolü (4a-kontrol).

- 20 Ekim: kullanıcı bildirdi: VOLONTE **Instagram hesabı eski "спортивные костюмы из Турции" portföyüne** bağlı; **Live durumdaki bir uygulama da o portföyde**. Yani iki portföy var: eski (Instagram + Live uygulama) ve 25 Eylül'de açılan HEMRA ARTYKOV. Volonte CRM'in hangisinde olduğu henüz bilinmiyor.
  - Claude önerisi: **tek portföy**. WhatsApp hesabı (WABA) bir portföye bağlanınca taşımak zor → WhatsApp eklemeden önce karar. Kullanıcı tam yöneticiyse **eski portföy** kullanılsın (Instagram + Live uygulama orada, tek doğrulama hepsini kapsar, eski hesap). Portföy görünen adı "VOLONTE" yapılabilir; doğrulamada esas olan işletme bilgilerindeki resmi ad = HEMRA ARTYKOV (vergi levhası) + adres. Yeni HEMRA ARTYKOV portföyü boş bırakılır, silinmez. Karar kullanıcıda.

- [x] Komut 4b (20 Ekim): eski portföyde Murat Babahanov **tam erişimli**. **Volonte CRM** uygulaması bu portföyde, kimlik **884729331246890**, **Live**. Uygulamada tam erişimli 2 kişi: Murat Babahanov + **"Volonte API" sistem kullanıcısı** (kimin açtığı teyit edilecek). HEMRA ARTYKOV portföyü başka bir Facebook hesabından açılmış, kullanıcının hesabında görünmüyor → dokunulmayacak.
- **KARAR (kullanıcı, 20 Ekim): eski portföyde ("спортивные костюмы из Турции") devam.** WhatsApp, doğrulama ve ileride Instagram hepsi burada.
- [x] Komut 4c (20 Ekim): kullanıcı girdi ve kaydetti: resmi ad HEMRA ARTYKOV, adres, şehir, posta kodu, telefon, web sitesi, vergi numarası. **Portföy adı artık "Volonte".** Durum: Doğrulanmamış (beklenen; doğrulama ayrıca başlatılır). Eski tanım: eski portföyde İşletme bilgileri → resmi ad HEMRA ARTYKOV, adres, telefon +90 501 335 11 11, web sitesi; portföy adı → VOLONTE (isteğe bağlı, geri alınabilir).
- [ ] Sonra: Volonte CRM'e WhatsApp ürünü (test numarası) → Komut 4 (doğrulama, belge: vergi levhası).

- 20 Ekim: Volonte portföyü Güvenlik Merkezi'nde **"Doğrulamayı başlat" düğmesi yok** (kullanıcı ekran fotoğrafıyla bildirdi).
- [ ] Komut 4d: Volonte CRM (884729331246890) → WhatsApp ürünü / kullanım durumu ekle → portföy "Volonte" seç → Meta test numarası. Asıl numara EKLENMEZ, kart girilmez. Sonra Güvenlik Merkezi'ne dönülür.

**Sıradaki komut: Komut 4d (Volonte CRM'e WhatsApp ekleme, test numarası).**

## Kapsam kararı (24 Eylül 2026)

Kullanıcı kapsamı daralttı:
- **İptal (şimdilik):** mankenli video üretimi, Instagram, TikTok.
- **Şimdiki hedef:** WhatsApp ve Telegram'da müşterilere cevap veren bir **ajan (bot)**.
  - Müşteri bir ürünü sorunca stoğa bakar, var mı yok mu kontrol eder.
  - Müşteriye normal bir insan gibi, net ve doğal bir dille cevap verir.
  - Kullanıcı bota bir fotoğraf verince Telegram kanalında paylaşım yapar (onaydan sonra).

## Güncel sıralama (cevaplardan sonra, 24 Eylül 2026)

Müşteriler Telegram'dan yazmadığı için müşteriyle konuşan ajan **WhatsApp**'ta olacak. Telegram kanal paylaşımı ve kullanıcıya bildirim için kullanılacak.

| Sıra | Aşama | Neden bu sırada |
|---|---|---|
| 1 | Stok programından stok ve fiyat verisini almak | Ajan fiyat ve "var/yok" cevabını buradan verecek. |
| 2 | WhatsApp ajanı, test numarasıyla | Müşteri konuşmaları burada. Gerçek numaraya geçmeden önce ayrı bir test numarasında denenir. |
| 3 | Kullanıcının telefonuna bildirim | Sorun çıkınca veya müşteri sipariş vermek isteyince anında haber. |
| 4 | Ajanı gerçek WhatsApp numarasına bağlamak | Test başarılı olunca, sohbet geçmişini riske atmadan. |
| 5 | Fotoğraftan Telegram kanalı paylaşımı (onaylı) | Kanal zaten kullanılıyor, sonra eklenir. |
| 6 | Ofiste sesli asistan | Sonraya bırakıldı. |

## Tasarım ilkeleri (öneri, kullanıcı onayı bekliyor)

- Ajan stok ve ürün bilgisi verir. Sipariş kesinleştirme, ödeme, indirim ve pazarlık kullanıcıya devredilir.
- Emin olmadığı her durumda uydurmaz, "kontrol edip dönüyorum" der ve kullanıcıya haber verir.
- Müşterinin dilinde cevap verir (Fransızca, İngilizce, Portekizce; gerekirse Türkçe, Rusça).
- Her zaman sabırlı ve kibar. Müşteriyle asla tartışmaz.
- Kanal paylaşımları her zaman kullanıcı onayından sonra yapılır.

## Durum

- [x] Katalog sitesi yayında: https://kbabahanov-cloud.github.io/VOLONTE/
- [x] WhatsApp (+90 536 239 00 91) ve Telegram (t.me/Volonteroseoffical) siteye bağlandı.
- [x] Kapsam daraltıldı: video, Instagram, TikTok şimdilik iptal.
- [x] Soru listesi A–E cevaplandı (16. soru hariç).
- [x] Karar: Eski stok programı yerine yeni, sade bir stok programı yazılıyor. Kullandıkça hatalar düzeltilip geliştirilecek.
- [x] Stok programı 1. sürüm yayında: https://claude.ai/artifact/HE2rUVx7fiZpiAQnYm4Njh (sadece kullanıcıya açık)
  - Kaynak kod: `stok-programi/volonte-stok.html` (değişiklikten sonra aynı artifact adresine yeniden yayınlanır)
  - Veritabanı: `urunler/<stok kodu>` (ad, fiyat, renkler → mağaza/fabrika adedi), `gunluk/<YYYY-AA-GG>` (o günün hareket listesi), `cariler/<otomatik id>` (ad, tur: musteri/tedarikci/gider, tel, ulke, hareketler[] → her hareketin `etki` değeri; bakiye = etkilerin toplamı, pozitif = (A) cari alacaklı / biz ödeyeceğiz, negatif = (B) cari borçlu / bize ödeyecek), `ayarlar/genel` (paraBirimi, birim, azEsik)
- [x] 2. sürüm (25 Eylül 2026): Vegawin ekranlarına göre **Cariler** sekmesi eklendi: satış, tahsilat, alış, ödeme, açılış bakiyesi. Stoktan satış girerken müşteri seçilirse tutar (fiyat × miktar) cariye otomatik borç yazılır.
- [x] (A)/(B) kesinleşti (25 Eylül 2026, 4. sürümle): Vegawin gibi carinin tarafından. **(A) = cari alacaklı, biz ödeyeceğiz. (B) = cari borçlu, bize ödeyecek.** Programda harflerin yanında bu açıklama yazar. (Önceki "(A) = biz alacaklıyız" notu geçersiz; kullanıcı düzeltti.)
- [x] Para birimi: dolar.
  - Claude verileri ArtifactData aracıyla okuyup düzeltebilir.
- [ ] Kullanıcı ilk ürünleri girip denesin, geri bildirim versin.
- [ ] Sonraki sürüm adayları: kasa / banka, fatura çıktısı, beden takibi, Excel'e aktarma, ürün fotoğrafı.

## Kullanıcının tarif ettiği stok programı yapısı (25 Eylül 2026)

"Kapalı kutu" bir sistem: gelen mal, satışlar, girişler. Banka ile işi yok.
Her bölüm ayrı olacak, birbirine karışmayacak:

1. **Cari kartlar** ayrı bir bölüm (sadece hesap kartları).
2. **Satış** ayrı bir yerden yapılır: satış ekranı açılır, cari kodu seçilir (örneğin TOPTAN).
3. **Girişler (yüzdeli)** ayrı bir yerde: mal girişleri yüzdeye göre ayrılmış carilere yapılır. Örnek: BLACKROSE 20 (%20), BLACKROSE 15 (%15), BLACK ROSE 000.
4. **Stok girişi** ayrı sekmede: bir elbisenin koduna giriş yapılır ("giriş yeri").

Kullanıcının cevapları (25 Eylül 2026):
- **Yüzde girişte düşülür.** BLACKROSE 20'ye 100 $'lık mal → cariye 80 $ yazılır. "000" = yüzdesiz (%0).
- **Giriş ve stok girişi tek ekran.** "3394 geldi, %20'ye gir" denince stok artar ve tutar o carinin bakiyesinin üzerine eklenir.
- **Satış fiyatlarını kullanıcı belirler** (ürün kartında yazılır, satışta değiştirilebilir).
- **Fabrika ve mağaza stoğu ayrı.**
- **Para birimi: dolar.**

**4. sürüm (25 Eylül 2026) bu yapıyla kuruldu:** Satış · Giriş · Stok · Cariler · Geçmiş.
- Satış: satış carisi seçilir, sepete kod/renk/yer/adet/fiyat eklenir → stok düşer, cariye (B) yazılır.
- Giriş: giriş carisi seçilir (yüzdesi kartta), sepet → stok artar (yeni kod/renk otomatik açılır), cariye brüt × (1 − yüzde) (A) yazılır.
- Stok: arama, fiyat/ad düzenleme, transfer (fabrika → mağaza), sayım, ürün listesi.
- Cariler: tür (satış / giriş / gider), yüzde, tahsilat, ödeme, açılış bakiyesi.
- Bakiye işareti Vegawin'deki gibi carinin tarafından: giriş → (A), satış → (B), tahsilat (B)'yi, ödeme (A)'yı azaltır. Kullanıcıya (A)/(B) yanında açıklama yazılmıyor, sadece harf.
- Kullanıcı teyit etti: Vegawin'de de mal girişi (A)'yı, satış (B)'yi artırıyor. BLACKROSE 20'nin (A) bakiyesini VOLONTE ödeyecek.

## ⏸ STOK PROGRAMI BEKLEMEDE — KALDIĞIMIZ YER (25 Eylül 2026)

Kullanıcı stok programını bir kenara koydu, önce WhatsApp ajanına geçildi. Dönünce buradan devam:
- Program 6. sürümde, yayında, veritabanı **boş** (kullanıcı henüz kayıt girmedi).
- Yapılacaklar: fotoğraftaki 14 cariyi Vegawin bakiyeleriyle yüklemek (TOPTAN = satış; BLACKROSE 20/15/000 = giriş %20/%15/%0; YENİ MAĞAZA GİDERLERİ = gider; diğerlerinin türü kullanıcıdan öğrenilecek). "Yazar fişi" = bu satış fişi mi, yasal yazarkasa fişi mi, sorulacak.
- Kullanıcı birkaç gerçek giriş/satış yapıp geri bildirim verecek.

## 6. sürüm (25 Eylül 2026)

- Satış kaydedilince **satış fişi** çıkar (fiş no `S<YYYYAAGG>-<SSDDss>`, tarih, cari, kalemler, toplam, önceki/yeni bakiye). "Fişi indir / yazdır" 80 mm HTML dosyası indirir; dosya açılınca yazdırma penceresi açılır (program sayfası doğrudan yazdıramaz). Eski fişler cari kartındaki satış hareketinin "Fiş" düğmesinden açılır.
- Girişte birim fiyat ürünün satış fiyatından gelir. Yeni stok kartı girişle açılırsa girilen fiyat satış fiyatı olur. (Kullanıcı 100 $ satış fiyatı üzerinden girer; %20'lik caride 80 $ fabrikaya borç yazılır.)
- "Ürün" adı "Stok kartı" oldu (Vegawin'deki gibi).
- Yetenekler: `db` + `downloads`.

## 7. sürüm (25 Eylül 2026)

- Stok kodları Vegawin'deki gibi boşluklu olabilir ("3394 B 000"). Belge kimliği `kodId`: Türkçe harfler ASCII'ye, boşluk "_" (örn. `urunler/3394_B_000`). Ekranda ve `kod` alanında asıl kod durur.
- "3394" yazınca tek eşleşen kart bulunur; birden fazla varsa program listeyi gösterip tam kodu ister.
- Stok kartında `tedarikci` (giriş carisi adı) ve `kategori`. Girişte kod yazılınca (liste boşken) giriş carisi kendiliğinden seçilir; farklıysa uyarı verir.
- Renk isteğe bağlı: girişte renk boşsa "Standart". Vegawin renk tutmuyor.
- Carilerde `yuzdeOnay:false` ise girişte ve cari kartında uyarı. Cari kartından yüzde düzenlenebilir.
- Vegawin'den toplu yükleme: Claude `aktarim/vegawin` belgesine {durum:"bekliyor", kaynak, cariler:[{ad,tur,yuzde,yuzdeOnay}], urunler:[[kod,kategori,tedarikci,barkod]]} yazar; programın üstünde "Yükle" düğmesi çıkar. Var olanlar değiştirilmez; yarıda kalırsa tekrar basınca devam eder; bitince durum "tamam".
- Komutla işlem yaparken ürün belgesine `urunler/<kodId(kod)>` ile eriş (yoksa `_id` alanına bak).

## Claude'un sohbetten komutla işlem yapma yöntemi

Kullanıcı sohbette (yazılı veya sesli) komut verebilir. Örnek: "3394 Siyah 10 adet mağazaya BLACKROSE 20'ye gir" veya "TOPTAN'a 3394 Siyah 3 adet sat".
Claude ArtifactData ile programın veritabanına **sayfanın yaptığının aynısını** yazar:

1. Önce oku: `cariler` (adı eşleşen cari, türü ve yüzdesi), ilgili `urunler/<kod>`, bugünkü `gunluk/<YYYY-AA-GG>`.
2. Eksik veya belirsiz bir şey varsa (renk, yer, fiyat, cari adı) **yazmadan önce sor**. Satışta stok yetmiyorsa yazma, söyle.
3. Yaz (her dokümanı okuduğun `version` ile `if_version` vererek, mümkünse tek `batch`):
   - `urunler/<kod>`: `renkler.<renk>.magaza/fabrika` yeni değer, `guncelleme`. Girişte yeni kodsa `set` ile {kod, ad:"", fiyat: giriş fiyatı, renkler, olusturma, guncelleme}.
   - `gunluk/<bugün>`: `kayitlar` listesine her kalem için {saat, zaman, fisNo, kod, renk, tip: "giris"|"satis", yer, miktar, fiyat, once, sonra, cari, not}.
   - `cariler/<id>`: `hareketler` listesine {zaman, tarih, tip, fisNo, brut, yuzde, tutar, etki, aciklama, not, kalemler}. Giriş: tutar = brut × (1 − yuzde/100), etki = +tutar (A). Satış: tutar = brut, etki = −brut (B). Tahsilat: etki = +tutar. Ödeme: etki = −tutar.
4. Kullanıcıya özet ver: ne yazıldı, yeni stok, carinin yeni bakiyesi (A/B). Satışta fişin programda cari kartındaki "Fiş" düğmesinden açılabileceğini söyle.

Sınır: Claude sadece kullanıcı sohbetteyken çalışır; 7/24 kendiliğinden çalışan bir bot değildir.

## Ortak sözlük

| Kelime | Anlamı |
|---|---|
| Ajan | Müşteriye sizin adınıza cevap veren yapay zekâ programı |
| Stok listesi | Hangi üründen, hangi renk ve bedende kaç adet olduğunu gösteren tek liste |
| Test modu | Ajan sadece sizinle konuşur, gerçek müşteriye açılmaz |
| Devretme | Ajanın konuşmayı size bırakması (sipariş, ödeme, pazarlık, emin olmadığı durumlar) |
| Onay | Siz "tamam" demeden hiçbir şeyin yayınlanmaması veya gönderilmemesi |

## Soru listesi (cevaplar geldikçe doldurulacak)

### A. Stok
1. Stok şu an nasıl tutuluyor? — Cevap: **Vegawin A5** (Vega Yazılım), firma adı "VOLONTE-2023". Ekran fotoğraflarından görülen modüller: Finansman (cari kartlar, satış/alış faturası, iadeler, tahsilat, ödeme), Stok Yönetimi, İşlem Kasası, Banka Yönetimi. Cari bakiyeleri (A)/(B) ile gösteriliyor. Cari listesinde müşterilerin yanında gider hesapları da var.
2. Şu an kaç model var? — Cevap: Mağazada ortalama 400 model. Renkler modele göre değişiyor.
3. Stok nerede duruyor? — Cevap: Tek fabrika. Stok hem fabrikada hem mağazada var.
4. Stoğu kim güncelliyor? — Cevap: Kullanıcı kendisi, her gün, elle giriyor.
5. Ürün kodu var mı? — Cevap: Evet, her modelin stok kodu var. Örnek: 3394.

### B. Müşteriler
6. En sık soru? — Cevap: Fiyat ("how much").
7. Diller? — Cevap: Fransızca, İngilizce, Portekizce.
8. Ajan fiyat söyleyebilir mi? — Cevap: Evet. Fiyat herkese aynı.
9. Ajan kargo vb. anlatabilir mi? — Cevap: Evet, kargo gönderimini de anlatacak. (Kargo kuralları henüz alınmadı.)

### C. Kurallar
10. Ajanın asla yapmaması gerekenler? — Cevap: Müşteriye asla kötü davranmamalı. Her zaman sabırlı ve yumuşak olmalı ("her şeyi alttan almalı").
11. Sorun olunca haber? — Cevap: Kullanıcının telefonuna anında bildirim gelsin, bir insan konuşmaya baksın.
12. Çalışma saatleri? — Cevap: 7/24.

### D. Hesaplar
13. Telegram? — Cevap: Müşteriler Telegram'dan YAZMIYOR, kanalda sadece fotoğrafları görüyor. Telegram Premium var.
14. WhatsApp? — Cevap: WhatsApp Business uygulaması.

### E. Bütçe ve ekip
15. Bütçe? — Cevap: Sistemin sağlıklı çalışması için gereken neyse.
16. Ekipte bu işe yardım edebilecek biri var mı? — Cevap:
