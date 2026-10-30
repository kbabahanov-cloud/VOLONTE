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

- [x] **Kemal güncellemesi (21 Ekim, kullanıcı onayı: "Onay. 2: B ve a evet. 4: evet, sınır 60."; yüklendi, 50 test):**
  - İsim: Kemal (sistem istemi, /yardim, tur mesajları). Telegram görünen adı kullanıcı BotFather'dan değiştirecek (Komut K2); kullanıcı adı @VolonteasistantBOT aynı.
  - Tüm paylaşımlar: tur mesajında modelin kanaldaki bütün paylaşımları (en fazla 8, en yeni önce) tarih + medya sayısı + link; her tarih için "✅ <tarih>" (`t1:<tur>:<kod>:<sıra>`), seçilen paylaşım sıraya girer; "🖼 Hepsini göster" (`tg:`) sadece basana copyMessages. Kodsuz: tek paylaşım (+ "Kemal bunu yeniden paylaştı" notu).
  - Hız (B + a): pencere 08:00–23:00, aralık 90–100 dk (günde 10). Bir tur 10 onaya ulaşınca sıraya girer ve **sonraki tur hemen açılır** (onaylar önceden toplanır). Turun son paylaşımında "🏁 N. turun paylaşımları tamamlandı". Aday kalmazsa tur "bitti", ertesi gün 08:00 yeni tur. Hatırlatma 08:00.
  - **Fotoğraf tanıma** (`telegram-bot/tanima.js`): katalog = her modelin en yeni paylaşımının ilk medyası gizli arşiv kanalına forwardMessage → 320 px dosya → Claude (8 görsel/çağrı, structured output) → KV `tarifler` {kod: {t, f, m}}; 5 dk görevi, günde en fazla 150 çağrı (`katalog:<gün>`), bulunamayan → `tarifhata`=3. Arşiv: bot bir kanala yönetici eklenince (`my_chat_member`, ekleyen izinli kişiyse) KV `arsiv`. Tanıma: izinli kişi fotoğraf gönderir → 800 px → adım 1 tarif listesi (system, cache) en fazla 5 aday → adım 2 müşteri + aday görselleri karşılaştırma {en_iyi, guven, siralama, aciklama} → "büyük ihtimalle X" + modelin fotoğrafı, ya da "emin değilim" + 2–3 aday. `ai:<gün>` sınırına sayılır.
  - Güvenlik düzeltmesi: sadece VOLONTE kanalının paylaşımları kaydedilir (`anaKanalMi`), arşiv/başka kanal karışmaz.
  - Maliyet tahmini (görsel ≈ 28×28 piksel başına 1 token; 320 px ≈ 175 token): katalog bir kerelik ~1–2 $; tanıma başına ~3–8 sent (tarif listesi önbellekte değilse üst sınır).
- [x] Komut K1 (21 Ekim 18:03): arşiv kanalı bağlandı (KV `arsiv` id -1004432627125, başlık "Kemal"). İlk katalog çağrısı (15:05 UTC) hatayla bitti, kaydı yoktu → hata artık KV `katalogHata`ya yazılıyor; sonraki çağrılar sorunsuz (15:20 UTC: 16 tarif, tarifler kaliteli). Hız: 8 model / 5 dk → ~680 model ~7 saat. CPU çalışma başına 30–80 ms (ücretsiz plan 10 ms; şimdilik hata yok, `exceededCpu` görülürse Workers Paid 5 $/ay için kullanıcıya sorulacak). Eski tanım: kullanıcı gizli "Kemal arşiv" kanalı açar, @VolonteasistantBOT'u yönetici ekler (Mesaj gönderme). Bağlanınca bot ikisine haber verir, katalog başlar.
- [x] Komut K2 (21 Ekim): kullanıcı BotFather'da adı Kemal yaptı. Eski tanım: BotFather → /mybots → @VolonteasistantBOT → Edit Bot → Edit Name → Kemal.
- [x] K3 (21 Ekim): kullanıcı Anthropic panelinde harcama sınırı ayarını bulamadı; kart ekli değil, otomatik yükleme kapalı, kredi 99,75 $ (ön ödemeli bakiye = doğal üst sınır). Kullanıcı "botun içindeki 60 $ sınırı" dedi — öyle bir sınır yoktu → **eklendi** (`telegram-bot/harcama.js`): her Anthropic çağrısının `usage`'ından tahmini maliyet (Opus 5.5: 4/20 $, önbellek okuma 0,20, yazma ×1,25) → KV `harcama:<YYYY-AA>` (mikro-dolar). 60 $ dolunca asistan, fotoğraf tanıma ve katalog durur (turlar/komutlar çalışır); %80'de bir kez uyarı (`harcama:<ay>:uyari`). durum_ozeti harcamayı gösterir. Başlangıç değeri 0,50 $ yazıldı (panelde 0,25 $ + katalog).
- [x] **403 sorunu (21 Ekim):** katalog çağrıları aralıklı "403 Request not allowed" aldı. Sebep: zamanlanmış görev farklı ülkelerdeki veri merkezlerinde çalışıyor (KIX, HKG...), Anthropic bazı bölgeleri reddediyor. `placement: {region: "aws:us-east-1"}` sadece fetch (webhook) için geçerli, cron'a uygulanmıyor. Çözüm: katalog adımı **Durable Object `KatalogDO`** içinde (`locationHint: "enam"`, ücretsiz SQLite DO; binding `KATALOG`, migration v1). Sonrası 3 parti üst üste hatasız. Yükleme metadata'sında `placement` + `migrations` + `KATALOG` binding'i olmalı.
- Katalog maliyeti gerçek: parti (8 görsel) başına ~0,04 $ (düşünme tokenları) → ~680 model ≈ 3,5 $ (önceki 1–2 $ tahmini düşüktü). Bitiş tahmini ~01:40 İstanbul.

- [x] **VENOM – Kemal + Selin (22 Ekim; kullanıcı kararı: "Onay. K1: Sonnet, tüm müşteriler için günde 30 mesaj. K2: A." + Selin ilk hafta 30/gün sonra 10, ortak sınır 80 $ uyarı 64 $):**
  - Ortak beyin: `notlar/ortak-beyin.md`, `telegram-bot/ortak.js`. Her eleman ayrı Worker; herkes okur, sahibi yazar; `harcama:<ay>` ortak (80 $).
  - Kemal: 08–20, 50–60 dk; istek defteri (`istekler`), tepki sayıları (KatalogDO deposu), 20:00 raporu (`rapor:<gün>`); alt yazı önerisi (`altyazi.js`, `altyaziSira`, `oneri:<n>`, ✅ Değiştir/❌ Kalsın; kod/beden/fiyat/iletişim eski yazıdan); marka (`marka.js`, Cloudflare Images binding `IMAGES`, `/marka`, KV `marka` = acik/kapali — KAPALI, kullanıcı önizleyip açacak); müşteri modu (`musteri.js`, `MUSTERI_MODEL` = Sonnet 5.5, kişi 15 mesaj + 3 foto, toplam 30 mesaj + 10 foto, `iletim:<admin>:<mesaj>` yanıt köprüsü). Yükleme: `telegram-bot/scripts/yukle-kemal.sh`.
  - Tur önerisindeki "eski/yeni yazıyla" yerine: paylaşım kanala düşünce alt yazı önerisi gelir (✅ Değiştir / ❌ Kalsın) — daha basit ve eski yazıdaki bedenler korunur.
  - Selin (`telegram-bot/selin.js`, Worker `volonte-selin`, `https://volonte-selin.volonte.workers.dev`, DO `SelinDO`, 5 dk görev): rehber onayı (`selin:rehberOnay`) olmadan başlamaz; 09–21 arası liste (✅ Mağazada var / ❌ Yok), hazırlık (arşive iletip en büyük foto, tekrarsız, netlik + açıklama TR/EN/FR/PT, bedenler alt yazıdan), onay kartı (✅ Onayla, siteye yükle / ✏️ Düzelt / ❌ Ekleme), GitHub Git Data API ile main'e tek commit (`galeri/<kod>/<n>.jpg` + `veri/urunler.json`), `/site` + 🗑 kaldır (onaylı), `/beden`. Fiyat alanı `null` (Vegawin sonra). Yükleme: `telegram-bot/scripts/yukle-selin.sh`.
  - Site: `urun.html` + `js/urun.js` (pozlar, Telegram video gömme, EN/FR/PT, WhatsApp), `js/site.js` `veri/urunler.json`'dan gerçek modelleri okur (boşsa örnekler). **main'e birleşmesi gerekiyor** (PR, kullanıcı onayı).
  - Yazı rehberi taslağı: `notlar/yazi-rehberi.md` (kullanıcı onayı bekliyor).
  - Bekleyen kullanıcı işleri: rehber onayı; Selin botu (BotFather) + kanal ve arşivde yönetici; Selin secret'ları (BOT_TOKEN, ANTHROPIC_API_KEY, GITHUB_TOKEN); GitHub ince ayarlı token; site PR onayı; `/marka 3194` denemesi.

**Telegram botu "hızlı başarı" tamam (20 Ekim).** Not: bot kendi kanal paylaşımlarını güncelleme olarak almaz → yeniden paylaşımlar /hafta sayısına ve `kodlar`'a girmez (istenirse copyMessages sonucundaki yeni id'ler dizine eklenebilir). Açık karar: bota yazan yabancılara "Sipariş için WhatsApp" otomatik cevabı (kullanıcı henüz cevap vermedi). Reklam analizi: ekran görüntüleri sohbette Claude'a.

- ✅ S1 (22 Ekim): rehber onaylandı (KV selin:rehberOnay=1), bot açıldı: @VolonteSelinBot.

- ✅ S2 (22 Ekim): kanal/arşiv yöneticiliği + secret'lar girildi, webhook bağlandı. Düzeltme: mesaj kimseye ulaşmazsa model 'soruldu' sayılmıyor.

- ✅ S2b (22 Ekim): Selin listesi çalışıyor (Murat ve Hemra cevaplıyor).
- ✅ Ekip yetkisi (22 Ekim, kullanıcı kararı): Hemra (6448681578) ve Aziz (8369444291) → EKIP_IDS (Kemal + Selin). Bildirimleri görür, düğmelere basar (tur onay/beklesin/sil, alt yazı, Selin var/yok/onayla/düzelt/siteden kaldır), /son /hafta /kuyruk /paylas, Selin /site /beden. YOK: /marka ayarı, Selin /liste, yapay zekâ sohbeti, fotoğraf tanıma, harcama uyarısı, müşteri iletileri (sadece ALLOWED_IDS = Murat, Merdan). İlk basan geçerli, diğerlerinde düğmeler kapanır. Sonradan eklenen / geç /start yazan kişiye bekleyen modeller otomatik gönderilir.
- ⚠️ Ders: Cloudflare ücretsiz paket çalışma başına 50 dış istek. 4 kişiyle 4. tur boş açıldı → tur modelleri ve Selin listesi artık parça parça (çalışma başına ~24 Telegram çağrısı), paylaşım/silme yapılan çalışmada tur mesajı yok. Kişi sayısı artarsa bunu hatırla.

- ✅ S3 (22 Ekim): GitHub anahtarı (SELİN, 1 yıl, sadece VOLONTE, Contents + Actions RW) volonte-selin'de. Kontrol: KV selin:github → okuma/yazma/actions true.
- ✅ Kullanıcı kararları (22 Ekim akşam):
  - Selin ilk hafta günde 50 model, sonra 10. Kategoriler: Elbise, Abiye, Takım, Tulum, Bluz/Gömlek/Tunik, Etek, Pantolon, Ceket/Kaban (kartta Türkçe, Düzelt ile değişir).
  - Beden düğmeleri: Küçük = 38-40-42-44, Büyük = 44-46-48-50, İkisi de. Alt yazıdaki beden öneri (✓), seçilen grup paylaşımda (beden satırı değişir) ve sitede yazılır. Bedensiz model seçilmeden onaylanmaz. (altyazi.js BEDEN_GRUPLARI)
  - Kemal: GÜNDE TEK TUR. Sabah 08:00'de 10 model, her kişiye art arda (kişi başı ayrı DO çağrısı, 1 sn arayla). 10 onay beklenmez: onaylanan hemen sıraya girer, aynı gün 50–60 dk arayla. Beklesin/Sil yerine yeni model gelmez. 20:00'de paylaşılamayan onaylılar sıradan çıkar (ileride yeniden sorulur), tur kapanır; akşam raporu söyler.
  - Videodan kare: ücretsiz yol onaylı. Ücretli araçlar KAPALI (Claid ~0,06–0,35 $/foto netleştirme; Gemini/Imagen ~0,02–0,04 $/foto üretim — ürünü değiştirebilir, önerilmedi).
- Videodan kare düzeni: Selin isteği `kareler` dalına (istekler/<kod>.json) yazar → GitHub Actions (telegram-bot/kare/kare.yml + kare.py, ffmpeg + Laplace netlik) videoyu Selin'in tek kullanımlık /video?t= bağlantısından indirir (≤20 MB, Telegram bot sınırı), en net ≤3 kareyi kareler/<kod>/ altına kaydeder, /kare'ye bildirir → Telegram'da "✅ N. kare / ❌ Hiçbiri" → KV kare:<kod> (Selin yazar). Selin sitede, Kemal kanal paylaşımında (videolarla, başa) kullanır. Bir model için bir kez. Elle: Selin'de /kare 3104. KV selin:kareSira.
  - ⏳ BEKLİYOR: `kareler` dalını açmak için kullanıcı izni (dal + .github/workflows/kare.yml + kare.py). İzin gelince 3104 ve 3204 selin:kareSira'ya eklenecek.

- ⚠️ 22 Ekim: KV günlük yazma sınırı doldu (1639 yazma; dün 637). Selin kodla 23 Ekim 08:00'e kadar duraklatıldı (selin.js DURAKLAT_BITIS; KV'ye yazmaz, mesaj göndermez, düğmeye sadece uyarı). 08:00'de kendiliğinden devam; "fotoğraf yok" 13 model bir kez yeniden hazırlığa alınır (selin:goc:fotografyok). Kalıcı çözüm önerisi: sık yazılan durumları Durable Object deposuna taşıma (kullanıcı onayı bekliyor). `kareler` dalı açıldı (kullanıcı izniyle).

- 🆕 23 Ekim: SAYIM SAMİ — Vegawin stok köprüsü (kullanıcı onayı). Kurallar: Vegawin'e ASLA yazma (sadece SELECT; köprüde 4 kilit). Okunan: STOKKODU, MALINCINSI, adet (F0101D0005TBLDEPOENVANTER SUM(ENVANTER), DEPO=1, BELGETIPI≠67), SATISFIYATI1 (F0101TBLBIRIMLEREX); stok kartı F0101TBLSTOKLAR STATUS=1, IND≥100. Kod eki (B20) köprüde silinir (ayar.json kodKalibi ^(\d{3,6})). 09–19 arası 5 dk, sadece değişenler. Şifre mağaza PC'sinde DPAPI. Venom: Kemal'de POST /kopru (X-Magaza + Bearer KOPRU_<MAĞAZA> secret) → StokDO (SQLite, KV değil). Stok ≤0 → gizli (Kemal turunda sorulmaz). >0'dan ≤0'a düşünce ekibe 🔁 Repete / 🗑 Sil (sadece gizle, kanal ve Vegawin'e dokunma) / ⏳ Beklesin (7 gün). İlk veride soru yok. /stok, /stok <kod>. Dosyalar: sami/ (indirme: sami/Sami-kopru.zip). Black Rose: ayar.json magaza/firma/donem değiştirilip ikinci kopya + KOPRU_BLACKROSE. 2. aşama satış analizi (belge 20/21/22/23), vergi no/TC asla.
  - ⏳ Bekliyor: köprü kurulum + deneme fotoğrafı (bağ sütunu STOKNO vb. doğrulanacak). Selin durdurulmuş; site fiyat/gizleme Selin açılınca bağlanacak.

- ✅ SAMİ-1 (27 Ekim 17:01): Sami canlı. Deneme: STOKNO bağı doğru, 623 kart → 506 model, 92 kod kalıba uymuyor (gönderilmez; örnekleri yeni deneme.bat gösterir). 0 ile başlayan iç kartlar (000000, 001 TEKLEME, 0002 TRS) Venom'da alınmıyor. baslat.bat: 506 model gönderildi, görev kuruldu. /stok 3569 → 32 adet, 69 $, görünür.

- ✅ D1 (27 Ekim 18:30): Karma depo (depo.js). Kemal'in işleri KatalogDO "kemal" nesnesinde (/kemal/guncelleme, /kemal/cron, /kemal/adim), Selin'in SelinDO "selin"de (/guncelleme, /cron, /hazirla, /kare, /video, /kare-geldi, /goc). Sık yazılan kayıtlar DO'da (KEMAL_YEREL, SELIN_YEREL); ortak olanlar (kanal, kodlar, kodsuz, tarifler, hicgelmeyecek, atlananlar, sonpaylasim, arsiv, harcama:*, kare:*) ve hata/durum kayıtları KV'de. Taşıma: kopyala + kontrol, eski KV silinmedi. Rapor: goc:kemal 56/56 eşit, goc:selin 7/7 eşit. NOT: DO'daki kayıtları Cloudflare panelinden/API'den okuyamam; izleme KV'deki hata/rapor kayıtlarından.

- ✅ Kemal yeni depoyla çalışıyor (/kuyruk doğrulandı, 27 Ekim).
- ✅ Selin yeniden başlatma hazırlığı (27 Ekim, Selin hâlâ DURAKLATILMIŞ — kullanıcı "başlat" demeden açılmaz):
  - Vegawin bağlantısı: Selin, Kemal'in StokDO'suna (script_name volonte-asistan) bağlı; /toplu → kod: {toplam, fiyat, gizli}.
  - Liste: stokta olan sorulmadan hazırlığa; stoğu biten/gizli hiç sorulmaz; Vegawin'de olmayan "sorulacak".
  - Mesaj azaltma: Selin kendiliğinden SADECE 11:00 ve 16:00'da tek özet gönderir (taslak/kare/soru sayıları + notlar). Ayrıntı "🖼 Taslaklar / 🎞 Kareler / ❓ Sorular" ile sadece basana 5'er. Uyarılar özete not olarak düşer. Kare adayları arşiv kanalına gider.
  - Fiyat: taslak kartında "Fiyat: 69 $ (Vegawin)", siteye fiyat + gizli alanı. Saatlik (09–20) site eşitlemesi: stoğu biten sitede gizlenir (silinmez), stok gelince görünür, fiyat güncellenir; değişiklik yoksa commit yok.
  - Site: site.js gizli olanı göstermez; urun.js "Wholesale price: $X" / "Currently out of stock". (S4 birleşince canlı.)

- ✅ 27 Ekim 18:55: Selin BAŞLATILDI (DURAKLAT_BITIS = 0). Fiyat sitede herkese açık (kullanıcı kararı). İlk cron sorunsuz (selin:github ok, yeni hata yok).
- Kullanıcının sıradaki işleri (her biri için ÖNCE kısa plan + maliyet, onaysız başlama):
  1) S4: ürün sayfasını yayına al (fiyat + stok sitede). Not: main'de Selin'in eklediği 4 ürün var (3563, 3279, 3595, 3448) — birleştirirken main'deki veri/urunler.json ve galeri korunmalı.
  2) Site görünüşünü Claude Design becerisiyle yenile, önce taslak.
  3) Pelin (video): Selin fotoğrafı inceler, senaryo + yazı; OpenAI video aracı üretir, OpenAI modeli kontrol eder, onaylarsa kullanıcıya.
  4) Analizci Arda: Instagram/internetteki benzer firmaların en çok tutan videoları, neden tuttuğu, fikirler Pelin'e.
  5) Video + analiz için aylık toplam 60 $ sınırı (Anthropic 80 $ sınırından ayrı).

- ✅ İş 1 (S4) tamam: PR #21 (ürün sayfası, fiyat, stok gizleme), #22 (3563 tekrar fotoğraflar; Selin SHA-256 + yapay zekâ "tekrar"), #23 (yazısız video oynatıcı deneme ?video=yeni; Selin /v/<id>; envanter taraması).
- Bilgi (27 Ekim): Vegawin'de olmayan model hata değil (Black Rose / pasif kart) → gizlenmez, "Ask price". 3279 pasif, 3595 kartı yok. Sami kuralı değişmez.
- 60 $ TEK KASA: Pelin (video) + Arda (analiz) + ChatGPT görsel. ChatGPT şimdilik BAĞLANMADI.
- HD denemesi: FSRCNN/EDSR (ücretsiz) renk korur (ΔE≈0.8) ama netlik kazancı yok denecek kadar az (Telegram fotoğrafları 960×1280). Öneri: video-yalnız modellerde 1080p video karesi; yeni çekimleri Telegram'a "Dosya olarak" (sıkıştırmasız) gönderme alışkanlığı.
- Envanter taraması (27 Ekim 20:45): Vegawin stok+fiyat 87; Telegram'da 62; sitede 2; fotoğraflı 24 (3183, 3186, 3322, 3335, 3360, 3403, 3407, 3411, 3429, 3439, 3475, 3481, 3506, 3520, 3558, 3565, 3567, 3577, 3578, 3583, 3592, 3593, 3618, 4211); son 2 paylaşımında sadece video 36.

- ✅ Kullanıcı onayları (27 Ekim akşam): (1) 24 fotoğraflı modelin TOPLU yüklemesi başladı (selin:toplu; tek liste + "✅ Hepsini siteye yükle", /cikar; onaydan sonra 5 dk'da 2 model). (2) Yazısız video oynatıcı VARSAYILAN (eski görünüm ?video=telegram). (3) Yeni çekimler Telegram'a "Dosya olarak" (sıkıştırmasız) gönderilecek — Selin belge-fotoğrafları okur, Cloudflare Images ile yapay zekâya 1024, siteye 2048 px küçültür.

### Venom Ekip + Sayım Sami botu (27 Ekim 2026 gecesi hazırlandı, kullanıcı onaylı)
- Stoğun TEK kaynağı Sami (StokDO). Kemal ve Selin stoğu her zaman Sami'den alır. Vegawin'de sadece okuma.
- Yeni worker: volonte-sami (yüklendi, BOT_TOKEN bekliyor). Token girilince "stok bitti" soruları Kemal'den Sami'ye geçer (`sami:aktif`).
- Üç bot da kanala eklenecek; Sami kanal paylaşımlarını o anki stokla kaydeder (`paylasim` tablosu).
- Sabah raporları: 09:05 Sami (stok, dünkü biten/gelen/fiyat, kontroller) · 09:15 Kemal (kanal) · 09:25 Selin (site) · 09:40 toplu rapor + kısa yapay zekâ yorumu.
- Kontroller: stokta olmayan model paylaşıldı mı (Kemal mi elle mi), sitede yanlış fiyat, sitede görünen ama stoğu biten model. Vegawin'de olmayan (Black Rose) hata sayılmaz.
- Grup kurulana kadar raporlar Murat ve Merdan'a özel mesajla gider.
- Yarın sabah BotFather adımları (tek tek): 1) /newbot "Sayım Sami" 2) token → Cloudflare volonte-sami Secret BOT_TOKEN 3) herkes Sami'ye /start 4) Sami'yi kanala yönetici ekle 5) "Venom Ekip" grubu, Kemal+Selin+Sami+ekip (botları yönetici eklesin).

### Fotoğraf karışıklığı kontrolü + yeni üretim sistemi (28 Ekim gecesi)
- Siteye yükleme KİLİTLİ (selin.js SITE_KILIDI). Kullanıcı açmadan hiçbir şey çıkmaz.
- 24 modelin bütün fotoğrafları ve videoları tek tek incelendi (kareler dalı kontrol/k1, k2).
  Sebep: Selin kanalda yazısında kodu geçen her paylaşımı alıyor; kanalda yanlış koda yazılmış video (3618'de çizgili korse-etek),
  aynı kodla iki farklı kıyafet (3322: BLACK ROSE saçaklı ceket vs VOLONTE dantel takım), aynı modelin farklı renkleri (3567) ve eski
  farklı baskılı görseller. Çıkarıldı: HARIC_MESAJ. Soruldu: 3322, 3567 (FOTO_SORUSU).
- Sitedeki 4 model: karışıklık yok; kullanıcı kararı: yeni sistemle silinip baştan yüklenecek (henüz silinmedi).
- Yeni görev (kullanıcı kararı): Selin, gerçek fotoğraf/videodan kıyafeti öğrenip aynı manken + aynı kıyafetle HD 3-4 fotoğraf + video ÜRETECEK.
  Kural: renk/desen/kesim birebir; her üretim orijinalle yan yana onaya. Araçlar karşılaştırılacak (OpenAI görsel, Google Veo/Nano Banana,
  Kling, Runway, FASHN). Sora API 24 Eylül 2026'da kapandı. 60 $ kasa; önce 1-2 model deneme.

- 28 Ekim: Üretim atölyesi kodu hazır ve yüklendi (telegram-bot/uretim.js). FAL_KEY girilince 3618 + 3592 ile deneme otomatik başlar: Nano Banana 2.1, Nano Banana Pro, FASHN (Nano pozu + orijinal kıyafet), Kling, Veo 3.1 Fast. Deneme sınırı 15 $, kasa 60 $. Claude orijinalle puanlar (8 altı elenir). Sayfa: önizleme linki + /uretim. Kullanıcı askı videolarını göndermeyi teklif etti (kıyafet referansı olarak kullanılacak).

- 28 Ekim kullanıcı kararları: araçlar 1-7 onaylı (fal.ai, Nano Banana 2.1, Nano Banana Pro, FASHN, Kling, Veo 3.1 Fast, Claude kontrolü). Deneme 3618 + 3592; askı/manken fotoğraflarını Merdan veya Hemra Selin'e özelden gönderecek ("3618 askı" / "3618 manken"). Kanal fotoğrafı üretimde KULLANILMAZ. URETIM_ONAYLI=true (anahtar + fotoğraf gelince başlar), deneme sınırı 15 $.
- 60 $ kasa KALDIRILDI. Büyük harcama / yeni abonelik → önce sor. Her ayın 1'i 09:45 aylık harcama raporu (venom.js aylikRapor). Claude 80 $ aylık sınırı aynen duruyor.
- Üretim ileride Pelin'in işi: Pelin botu açılınca uretim.js bölümü Pelin'e taşınacak.

- 28 Ekim kullanıcı kararı: BUGÜN SAMİ BİTİYOR (fal.ai/üretim bekliyor). Sami Google Sheets'e yazar (google.js; hizmet hesabı anahtarı GOOGLE_SA, ücretsiz).
  Stok tablosu (kod, adet, satış fiyatı, sitede, Telegram'da) ekip sadece görür; harcama tablosu ayrı, sadece kullanıcı. Alış/maliyet/kâr/B20 hiçbir tabloya yazılmaz.
  Tek kaynak: Sami'nin deposu (StokDO); tablo aynı veriden 5 dk'da bir yazılan birebir ayna; botlar depodan okur (Google'ı okumak yavaş/sınırlı).
  Tablolar kullanıcının Drive'ında; bağlama: Sami'ye /tablo stok <link>, /tablo harcama <link>.

- 28 Ekim: Sami botu açıldı (token girildi, webhook 12:15, stok soruları Sami'de).
- 28 Ekim YENİ AKIŞ (kullanıcı kararı): kanal alt yazıları (kod/fiyat) kullanılmaz, Selin kanala bağlanmaz. Her gün 10:00 Sami'nin
  stoğundan 15 model sahibe (0091 hesabı, SAHIP_IDS ya da /sahip) istenir; sahip "Dosya olarak" fotoğraf + video, yazı "3503 Küçük/Büyük/İkisi de".
  Selin başlık/açıklama/kategori, fiyat+stok Vegawin'den; taslak sahibe; onayla siteye (site kilidi yeni akışı engellemez). 20:00 özet;
  gelmeyenler "gonderilemedi" (sonra fal.ai). Öncelik: karışık 24 + sitedeki 4. Video sitede /v2/<kod>/<n> (PR #25).

- 29 Ekim FABRİKA EKSİK LİSTESİ (onaylı): köprü günlük satış (belge tipi 21, depo envanter, sadece SELECT) → /kopru/satis → StokDO satis.
  Sami 20:05 Hemra'ya (6448681578) satılanlar + renk hafızası; Hemra yazar → Onayla/Düzelt → Nuri/Sinem/Fuat'a SADECE kod/renk/adet, Murat'a (2005113508) kopya.
  21:00 hatırlatma, 22:00 Murat'a "Hemra onaylamadı". Fabrika kişileri /start → Murat onayı (fa:e). sami:satisAcik=1 satış denemesi doğrulanınca açılacak.
  Köprü artık 08:55–20:55 (ayar bitisSaati 21), kalp atışı; bu akşam kurulacak (satis-deneme.bat fotoğrafı bekleniyor).

- 30 Ekim PELİN kararları: bütçe ekibin 80 $'ından AYRI, aylık 150 $ (%80 uyarı), Defne de ayrı. Hedef günde 3 model (foto+video+tüm boyutlar), kalite öncelik.
  fal.ai (20 $ yükleme, anahtar volonte-pelin Secret FAL_KEY), arşiv Cloudflare R2. Video aracı karşılaştırma denemesiyle kullanıcı seçecek:
  Veo 3.1 Lite / Kling 3.0 Pro / Seedance 2.0, 2 model (desenli 3592 + düz siyah 3577 önerildi), askı fotoğrafıyla yan yana + renk/desen puanı + maliyet.
  Kurallar: manken yüzü ünlüye benzemesin; Meta "AI info" etiketi (fotogerçekçi video için zorunlu); sessiz izlemede kod/beden/sipariş net;
  paket sonunda gerçek askı fotoğrafı. Temel aşamaya ek: eleman geri bildirimi, pazartesi özeti, "beğenmedim çünkü" öğrenme, tarz şablonları
  (Şık/Enerjik/Lüks), "acil" iş. Selin'deki eski otomatik deneme kapatıldı (URETIM_ONAYLI=false).

**Sıradaki komut: 0091 hesabından Selin'e /kimim → izinliyse /sahip; değilse kimlik SAHIP_IDS'e eklenir. Sonra Sami kanala yönetici + Google B1-B9. fal.ai bekliyor.**

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

- 29 Ekim KEMAL YENİ KANAL DÜZENİ (kullanıcı kararı; yüklendi, 124 test): telegram-bot/duzen.js.
  Alt yazı sırası: durum etiketi (🆕 NEW / 🔁 BACK IN STOCK / 🔥 BEST SELLER / ⚡ LAST SERIES; hiçbiri değilse ✅ AVAILABLE / DISPONIBLE),
  <b>✅ CODE</b>, 🎨 renkler (sadece onaylıysa), 📏 beden, 📦 seri (Küçük/Büyük 4'lü), 🧵 kumaş (sadece biliniyorsa), 🇬🇧 + 🇫🇷 tek satır, imza.
  FİYAT ASLA YOK; TR/PT yok. Düğmeler: Order wa.me/905362390091, Info wa.me/905363448488, All models (site). Biçim: A tek medya+düğme / B albüm + "👆 CODE" mesajı
  (KV/DO "bicim", varsayılan B; denemede kullanıcı seçer). Medya siteden (galeri + Selin /v2 videoları); eski kanal yazısı kullanılmaz.
  Etiket önceliği: stoğa döndü (14 gün) > yeni (ilk paylaşım yok/21 gün) > son seriler (stok ≤ 2 seri) > çok satan (14 günde ≥12 adet, ilk 10) > mevcut.
  Renkler + EN/FR: Claude (Opus 5.5) site fotoğraflarından bir kez (KV yazi:<kod>); emin değilse renk satırı yok ve ✅ Paylaş kilitli → ✏️ Düzelt.
  Seçim: Sami'nin stoğu (stokta) + sitede + ≥14 gün paylaşılmamış, en eski önce, günde 10. Telegram son paylaşım: StokDO "tg" tablosu (kanal kayıtlarından
  dolduruldu; her kanal paylaşımında yazılır) → Google stok tablosunda "Telegram'da son paylaşım" sütunu.
  Önizleme Murat + Hemra: ✅ Paylaş (sıraya) / ✏️ Düzelt ("renk: …", "kumaş: …", "durum: …", "en: …", "fr: …") / ❌ Geç (7 gün). Onaylananlar 08–20, 50–60 dk;
  akşam onaylanan ertesi güne kalır, paylaşırken stok yeniden kontrol edilir. Eski düzen tur kodu ESKI_TUR=1 ile (sadece test).
  Eski alt yazı önerisi (TR/EN/FR/PT + fiyat) KAPALI (ALTYAZI_ACIK). /paylas yeni düzende. Repete paylaşımı yeni düzende 🔁, önizlemede fiyat yok.
  Deneme (29 Ekim 18:00): (a) 3558, 3520, 3429, 3475, 3481 · (b) kuralla 5 (3403 hariç: bilgi kartında "BLACK ROSE COLLECTION" yazıyor → kullanıcıya soruldu).

- 29 Ekim akşam kullanıcı kararları (yüklendi, 125 test): biçim B (albüm + "👆 CODE" mesajı). Düğme "🛒 Order" (yan yana kesiliyordu) + "📞 Info".
  Size satırı telefon linki olmasın: her "-" sonrasına görünmez U+200B. BLACK ROSE HARİÇ TUTULMAZ: VOLONTE ve Black Rose her yerde (Telegram, site,
  WhatsApp, Instagram) tek mağaza gibi; müşteriye ayrım görünmez (yapay zekâ yazısında marka/koleksiyon adı yazılmaz). Stok/satış Vegawin'de ayrı.
  Black Rose köprüsü yokken: VOLONTE Vegawin'de kartı olmayan site modeli = Black Rose → stok şartı yok, önizlemede "⚠️ Black Rose – stok kontrol
  edilemedi" (kanala gitmez). Önceki "Black Rose modellerine dokunma" kuralının yerine bu geçerli.
  SIRADAKİ İŞ: Black Rose köprüsü (KOPRU_BLACKROSE).

- 29 Ekim: BLACK ROSE KÖPRÜSÜ hazırlığı (kullanıcı: "bugün başka bir şey yapma"; hiçbir şey yüklenmedi). Kodlar iki mağazada asla çakışmaz (ek kural yok).
  Black Rose Vegawin AYRI bilgisayarda → köprü oraya ayrı kurulur. Paket: sami/Sami-kopru-BLACKROSE.zip (sami/blackrose/paket.sh ile üretilir;
  ayar: magaza BLACKROSE, kullanıcı sami_okuma, firma/dönem F????/D???? → doldurulmadan kurulum çalışmaz). sami.ps1: merkez depo no ayar.json "depo"
  (varsayılan 1, VOLONTE değişmedi); şifre sorusu ve uygulama adı ayardan. Vegawin programcısı için sami/blackrose/okuma-kullanicisi.sql (db_datareader + DENY yazma).
  Venom tarafı hazır: /kopru X-Magaza BLACKROSE + secret KOPRU_BLACKROSE (kullanıcı girer). Açık soru: Black Rose satışları 20:05 fabrika eksik listesine girsin mi?

- 29 Ekim KARAR (yarın Black Rose köprüsüyle birlikte açılacak; bugün kod/yükleme YOK): eksik listesi mağazaya göre ikiye ayrılır.
  VOLONTE satışları → Hemra (6448681578) onaylar (eskisi gibi); Black Rose satışları → Merdan (6113852976) onaylar. İki ayrı liste, akış aynı
  (renk sorma, ✅ Onayla / ✏️ Düzelt, hatırlatmalar, fabrikaya/Celal'e dağıtım). Onaylanmazsa Murat'a giden uyarıda KİMİN onaylamadığı yazar.
  Uygulama notu: satis tablosunda magaza sütunu var (ayrım mümkün); fabrika.js liste/hatırlatma/onay kayıtları mağaza başına (fabrika:<gun>:<magaza>);
  Merdan'ın Sami botuna /start yazmış olduğu kontrol edilecek.

- 29 Ekim PELİN KURULDU (volonte-pelin yüklendi, 132 test; telegram-bot/pelin.js, test-pelin.mjs, scripts/yukle-pelin.sh). @VolontePelinBot.
  Beyin Sonnet 5.5 (/beyin opus — sadece Murat), komutsuz sohbet (araç: sadece maliyet önizlemesi gönderir). Bütçe ayrı 150 $/ay (fal → uretim-harcama:<ay>,
  Claude → pelin-claude:<ay>), 120 $'da Murat'a uyarı; her üretimden önce maliyet kartı ✅/❌ (sadece Murat); "fal hazır" (Murat) yazılmadan üretim yok.
  Deneme: (a) 3 yüz (beyaz/siyahi/dolgun) × 2 aday, Nano Banana Pro, yazıyla (gerçek kişi referansı yok) → Murat seçer (Claude yüzden kişi tanıyamaz —
  ünlü benzerliği kontrolü kullanıcının gözü). (b) askı fotoğrafı ("3592 askı", "3577 askı" yazılı, Pelin'e) + seçilen yüz → Nano Banana Pro edit başlangıç karesi
  (3592 siyahi, 3577 beyaz manken) → Murat onayı. (c) aynı kare, 6 sn, 9:16: Veo 3.1 Lite (720p) / Kling 3.0 Pro / Seedance 2.0 (720p) → fal kare çıkarma (3 kare)
  → Claude Sonnet renk/desen/kesim puanı → kör test (harfler karışık; gerçek kanal videosu Kemal'in /kanal-video/<anahtar> adresinden, kanalda yoksa düşer)
  Murat + Hemra'ya; araç adı ve maliyet oylamadan sonra açılır. Tahmin: yüz 0,90 $, kare 0,30 $, video+puan ~5,70 $ (toplam ~7 $).
  Kod/VOLONTE yazısı paketlemede (ham karede yazı yok, video aracı bozar); AI notu basılmaz. R2 arşivi henüz yok (R2 için Cloudflare'de ödeme yöntemi gerekir → sorulacak).
  Kullanıcının gireceği secret'lar (volonte-pelin): BOT_TOKEN, FAL_KEY, ANTHROPIC_API_KEY. Selin kontrolü: üretim kapatıldıktan sonra da siteye ekleme çalışıyor (3403, 17:24).

- 29 Ekim 19:07 EKSİK LİSTESİ YENİ KURALLAR (önceki iki mesajın yerine; VOLONTE yüklendi, 132 test): saat şartı YOK. Günün ilk VOLONTE satışı gelince izlenir;
  satış listesi 10 dk değişmezse giriş bitti → Hemra'ya (saat kaç olursa olsun). Satış yoksa liste yok (köprü 20:55'te durur). Günde tek liste; sonradan yeni
  model satılırsa (10 dk sabit) sadece yeni modeller EK liste (fabrika:<gün>-e<n>), Hemra'nın cevabı en son açık listeye. Hatırlatma listenin gidişine göre:
  Hemra +1 saat, Murat +2 saat ("VOLONTE eksik listesi: Hemra onaylamadı"). /eksik aynı. Liste sadece VOLONTE mağazası (StokDO /satislar magaza).
  BLACK ROSE (yarın köprüyle açılacak, kod YOK): gün içinde Merdan'a hiçbir stok/eksik mesajı gitmez; her gün 19:05'ten sonra günün tüm BR satışlarıyla
  tek liste Merdan'a (6113852976); onay akışı aynı; onaylanmazsa Murat'a "Merdan onaylamadı" (kimin onaylamadığı yazar).

- 29 Ekim 19:22 EKSİK LİSTESİ FOTOĞRAF + EKLER (yüklendi, 132 test; önceki mesajların yerine): Vegawin'de renk yok, renkleri Hemra yazar.
  Hemra'ya önce özet (model sayısı, toplam satış), sonra her model ayrı mesaj: site fotoğrafı + "kod · satılan · stok" (stok 0 🔴, fotoğraf yoksa "📷 fotoğraf yok",
  günde 10+ satan "🔥 hızlı gidiyor, fazla iste" — sadece Hemra/Murat), "Son istenen: …" (fabrika:sonIstek, onayda kaydedilir), düğmeler [🔁 Önceki gibi iste]
  (sadece kaydı varsa) [⏭ Bu sefer isteme] (fe:o|x:<liste>:<kod>). Yazı + düğmeler birlikte; bütün modeller karara bağlanınca onay kartı. Model mesajları ve
  fabrikaya gönderim parça parça (fabrika:kuyruk; 20 / 4 model, Cloudflare istek sınırı). Fabrikaya/Celal'e: "3183 · siyah 10 · bej 6" + site fotoğrafı
  (yoksa kanal fotoğrafı, yazısı değiştirilerek); stok/satış/fiyat/maliyet/VOLONTE yazısı YOK. ✅ Gelecek → basana "Kaç günde hazır olur?" (1/2/3/5/7/10)
  → o gün 10:00'dan sonra Murat + Hemra'ya "bugün hazır olmalıydı, geldi mi?" [📦 Geldi]; repete süresi için de. Sipariş kaydı tek çağrı (StokDO /fs-yaz:
  fs:<id>, fs:acik, fs:takip zamanlı işler dizini, fs:hafta:<pazartesi>). Pazartesi 09:30 Murat'a haftalık özet (istenen, geldi, bekleniyor, gecikiyor).

- 29 Ekim 19:30: bugünün eski düzende giden listesi iptal edildi (Hemra'ya not), 13 model / 77 adet yeni düzende yeniden gönderildi (bir kerelik KV fabrika:yenidenGonder; sonuç fabrika:yenidenSonuc). Günde tek liste kuralı aynen.

- 29 Ekim 19:40: "📷 fotoğraf yok" sebebi: sitede sadece 15 model var, bugünün 13 modelinin hiçbiri sitede değil (kod eşleşmesi doğru). Düzeltme: sitede yoksa kanaldaki en yeni paylaşım (copyMessage, yazısı değiştirilerek). 13 modelin hepsi kanal fotoğrafıyla Hemra'ya yeniden gitti; Hemra'nın 3628 seçimi korundu (fabrika:fotoTamamla bir kerelik).

- 29 Ekim SAMİ'NİN BEYNİ (yüklendi, 137 test; telegram-bot/sami-beyin.js): Claude Haiku 5.5 (SAMI_MODEL ile değişir), komutsuz sohbet; sadece Murat, Merdan,
  Hemra, Aziz (fabrika/Celal sadece düğme). Araçlar: stok_bilgisi (fiyatsız), satislar, stoksuz_modeller, eksik_listesi_durumu, siparis_durumu, eksik_listesine_isle
  (sadece Hemra + Murat; renk/adet, isteme, önceki gibi, hepsini önceki gibi → hepsi bitince Hemra'ya onay kartı). Silme/sipariş/fabrikaya gönderme aracı YOK.
  Düz liste ("3183 siyah 10 bej 6") eski yoldan; ekli/serbest yazı (siyahtan, isteme, önceki gibi) beyne (duzListeMi). Bütçe ayrı 10 $/ay (StokDO beyin:harcama:<ay>),
  8 $'da Murat'a uyarı, dolunca beyin durur. Geçmiş StokDO beyin:sohbet:<id> (6 saat, son 8). ⏳ ANTHROPIC_API_KEY volonte-sami'ye girilecek; girilince
  KV sami:beyinDeneme'deki 3 soru otomatik denenir, cevaplar Murat'a + sami:beyinDenemeSonuc.

- 29 Ekim 19:51 BEDEN SEÇİMİ (yüklendi, 139 test): Hemra'nın her model mesajında [Küçük 38-44] [Büyük 44-50] [İkisi de] (fe:k|b|i). Yazıyla "3254 küçük siyah 10 bej 6",
  "3254 büyük siyah 5" (listeCozBeden); bedensiz yazılan renk bedeni bekler. İkisi de → küçük ve büyük ayrı sorulur. Beden seçilmeden model karta geçmez ("beden seçilmedi").
  Seçim: { beden k|b|i, gruplar {k,b}, bekleyen } | { isteme }. Renk hafızası bedenle (sonIstek {beden, gruplar}; "Son istenen: Küçük · siyah 10, bej 6").
  Fabrikaya/Celal'e: "3254 · Küçük (38-44) · siyah 10 · bej 6" (İkisi de → iki ayrı mesaj/sipariş). Beyin aracı beden alanıyla. Bugünkü listeye bir kerelik
  (fabrika:bedenEkle) 12 modele beden düğmeli mesaj gitti; 3607 Hemra'nın "isteme" kararıyla atlandı; 3628'in yazılanı korundu (bedeni bekliyor).

- 29 Ekim 20:05: Hemra'ya her model TEK mesaj (fotoğraf + bilgi + beden düğmeleri + Bu sefer isteme + durum); bugünkü 13 model kanal fotoğrafıyla yeniden gitti (fabrika:tekMesaj), seçimler korundu; bugün fabrikaya giden sipariş yoktu. Fabrikaya/Celal'e fotoğraf ZORUNLU: site → kanal (4 aday mesaj, yazısı değiştirilerek); bulunamazsa mesaj gitmez, Murat'a "📷 <kod> fotoğraf bulunamadı" (deneme hariç).

## 🏢 UZUN VADELİ HEDEF: ÇOK KİRACILI (TENANT) SATIŞ (kullanıcı, 30 Ekim)
Sistem ileride başka firmalara abonelikle satılacak. Şu anki kod TEK FİRMA (VOLONTE) için yazıldı; tenant'a hazır DEĞİL.
Sabit yazılanlar: kişi kimlikleri (Murat, Hemra, Merdan…), kanal adı, WhatsApp numaraları, site/GitHub adresi, marka metinleri ("VOLONTE – Premium…"),
beden grupları, Vegawin tablo adları (F0101/D0005), bütçeler, yapay zekâ istemlerindeki firma bilgisi; KV anahtarları firma öneksiz; StokDO tek nesne ("stok").
İyi taraf: mimari (Worker + Durable Object + yerel köprü) tenant'a uygun → firma başına DO (idFromName(firma)), KV önek, firma ayar kaydı, firma başına bot.
Kural (bundan sonra): yeni kodda firma bilgisi sabit yazılmaz, ayar/ortam değişkeninden okunur. Sıra önerisi: (1) firma ayar kaydına taşıma (VOLONTE çalışırken,
düşük risk), (2) ilk dış müşteri gelmeden: veri ayrımı, bot yönlendirme, kurulum sihirbazı, ödeme, yönetim paneli, KVKK/GDPR, firma başına bütçe, güvenlik incelemesi.

- 30 Ekim KEMAL REPETE PAYLAŞIMI (yüklendi, 142 test): Hemra/Murat/Merdan Kemal'e "/repete 3394" ya da "3394, 3490 repete geldi" (tek kodda renk: "… geldi siyah 10 bej 6"). Medya site → kanal son paylaşım (yazısız). Alt yazı yeni düzen, 🔁 BACK IN STOCK. Önizleme Hemra'ya (+ yazana): ✅ Onayla / ✏️ Düzelt / ❌ İptal (rpt:<id>, rp1/rpd/rpx). Onay → hemen kanala, günlük 10'a sayılmaz, stok kontrolü yok (Vegawin gecikebilir; önizlemede uyarı), tg tarihi tabloya. Medya yoksa "fotoğraf/video bulunamadı". Sami'den gelen repete de sayaca dahil değil.

- 30 Ekim SELİN LİSTESİ (yüklendi, 143 test): günde 30 model (GUNLUK_ISTEK), 10:00; 30 normal sırayla seçilir, liste içinde Celal'in modelleri (StokDO tedarikci CELAL) en sonda ayrı satırda. Liste Merdan'a da (SAHIP_IDS 6113852976) + 0091 hesabı. Bugün 14:25 bir kerelik ek liste (venom:selinEkIstek): 15 model, Celal'siz, sitede olmayan: 3633, 3631, 3626, 3623, 3622, 3607, 3606, 3604, 3599, 3598, 3596, 3582, 3581, 3573, 3569. Onay akışı aynı.

- 30 Ekim BLACK ROSE KÖPRÜSÜ PAKETİ TAMAM + MERDAN LİSTESİ (Sami yüklendi, 144 test): sunucu 192.168.1.192:1433, VEGADB, sami_okuma, F0101/D0005, depo 1.
  Köprü VOLONTE bilgisayarına AYRI klasöre (Sami-BLACKROSE) kurulur, ağdan bağlanır; şifre/son durum/günlük/görev/kilit mağaza adıyla ayrı (gizli-BLACKROSE.xml,
  Sami-BLACKROSE görevi), anahtar KOPRU_BLACKROSE. Eksik listesi mağazaya göre (fabrika.js MAGAZALAR): VOLONTE → Hemra (saat şartı yok), BLACKROSE → Merdan
  (BR_SORUMLU, 19:05'ten önce hiçbir mesaj yok; 19:05 sonrası 10 dk sabit → tek liste, sonra yeni model olursa ek); kayıt fabrika:<gün>-BR; onay/düzelt sadece Merdan;
  hatırlatma Merdan +1 saat, Murat +2 saat "Black Rose eksik listesi: Merdan onaylamadı"; sipariş bildirimleri Murat + liste sorumlusu.
  ⏳ Kurulum adımları kullanıcıda: kurulum.bat → KOPRU_BLACKROSE → deneme.bat + satis-deneme.bat fotoğrafı → onay → baslat.bat.

**Sıradaki komut: Black Rose köprüsü — VOLONTE bilgisayarına Sami-BLACKROSE klasörü, kurulum.bat (sami_okuma şifresi) → Cloudflare KOPRU_BLACKROSE → deneme.bat ve satis-deneme.bat fotoğrafları Claude'a → onayla baslat.bat. Bekleyen: Sami ANTHROPIC_API_KEY, Pelin secret'ları + fal hazır.**

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
