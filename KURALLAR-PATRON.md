# KURALLAR-PATRON.md — Patron'un kalıcı kuralları

Her yeni işe başlamadan önce bu dosya okunur. Her raporun son satırı:
`KURALLAR-PATRON.md okundu, X kural kontrol edildi, ihlal yok / ihlal: …`
Patron yeni kalıcı kural verdiğinde aynı anda buraya eklenir ve raporda "dosyaya eklendi" yazılır.
(Bu depo herkese açık: burada kişi kimliği, telefon, fiyat, anahtar YOK.)

## A. Doğruluk ve rapor
1. **Kanıtsız tamam yok.** "Tamam" demeden önce kişinin telefonuna giden mesaj Telegram'dan geri okunur ve raporda aynen gösterilir (resim/yazı/düğmeler). Kanıt yoksa "doğrulanmadı".
2. **Zincir testi.** Her değişiklikten sonra: kart → cevap → bir sonraki kişi → son durak (Hemra / Patron / fabrika). Her halkada telefona giden mesaj geri okunur. Bir halka eksikse "tamam" denmez.
3. **Gerileme kontrolü.** Her değişiklikten sonra bütün testler; bozulan varsa raporun EN BAŞINA.
33. **Test sadece kolay örnekle yapılmaz;** elemanların gerçek yazım şekilleriyle yapılır (Türkçe harfsiz, sıra serbest, bitişik, kısaltma, iki beden, çok renk, Türkmence/Rusça karışık, belirsiz/tuzak yazılar).
4. **"X basmadı" denmeden önce** kartın X'e gerçekten gittiği doğrulanır.
5. **Bot yapamazsa** "yapamadı, sebebi şu" der; "verdim / hallettim" diye yalan rapor yok.
6. **Rapor kısa, insan dili;** Telegram'da tablo yok. Önce bozuk kalanlar, sonra tamamlananlar.

## B. Düzen
7. **Dondurma:** büyük düzen bitene kadar yeni özellik yok; sadece kâğıda uydurma ve hata düzeltme.
8. **Günde en fazla 2 büyük değişiklik;** fazlası sıraya.
9. **Her bot SADECE kendi görev kâğıdındaki işi yapar;** kâğıtta olmayan otomatik iş, zamanlayıcı, hatırlatma ve kart kapalı (yeniden açma Patron onayıyla).
10. **Para harcama** Patron onayı olmadan yok. Geri alınamaz işler, asıl WhatsApp numarası, fabrikaya sipariş, kural değişikliği için onay alınır.

## C. Tek kapı ve kişiler
11. **Tek kapı:** hiçbir bot Patron'a doğrudan yazmaz; Patron'a sadece Venom yazar.
12. **Venom Patron'a sadece:** para, repete/stok kararı, silme/kural değişikliği, çözemediği iş, Patron'un sorusu, kritik acil. Rapor 09:40 ve 20:00, en fazla 10 satır; günde en fazla 10 mesaj. Robot satırları ("mesaj X'e gitti") Patron'a gitmez.
46. **Venom sadece Patron'a cevap verir;** ekiple (Hemra, Aziz, Merdan, fabrika) Sami üzerinden konuşur.
13. **Sohbetten kalıcı kural çıkarılmaz;** kalıcı kural sadece Patron açıkça söyleyince.
14. **Hemra koordinatör;** sorunlar önce bot/ekip ile çözülür.
15. **Fiyat, kâr ve satış sadece Patron'a.** Janet sadece kodla satış fiyatını görür. Fabrikaya fiyat/stok gitmez.
16. **Müşteriye yapay zekâ cevabı kapalı;** müşteri mesajı Hemra'ya iletilir.

## D. Marka ve deneme
17. **Marka ayrımı:** VOLONTE → Aziz, BLACK ROSE → Merdan. İki marka asla karışmaz, toplanmaz, karşılaştırılmaz; marka tahmin edilmez. Kemal'in öneri kartı Merdan'a sadece Black Rose.
18. **Deneme ayrı:** 🧪 DENEME asla gerçek akışa, deftere, kanıt defterine, fabrikaya, Hemra'ya ya da Patron'a karar olarak gitmez (Patron bir deneme zincirini açıkça isterse 🧪 işaretiyle gider, fabrikaya yine gitmez).

## E. Kart
19. **Kart = tek mesaj:** resim + yazı + düğmeler. Satırda en fazla 2 düğme; yazılar kesilmez.
20. **Bir kişiye aynı anda en fazla 5 kart;** cevap verdikçe yenisi gelir.
21. **Eski kart yenisiyle değiştirilir;** geçersiz kart kapatılır.
22. **Aziz/Merdan kendi kontrol kartına yazıyla renk/adet girebilir** (sadece kendilerine gelen kart); kart "✅ … – kaydedildi" diye kapanır, Geri al kalır. Beden talimatı tek mesaj. Kendi kartındaki model için "sadece Hemra ya da Murat girebilir" mesajı ASLA gitmez.
34. **Anlaşılan yazı her zaman teyit edilir:** "Şunu anladım: … Doğru mu?" [✅ Evet] [✏️ Düzelt]. Anlaşılmazsa örnekle yeniden sorulur; tahmin yok.
35. **Sami'nin beyin modeli Patron izni olmadan değiştirilmez.** Patron kararı (10 Kasım): kalıba uymayan yazıyı Opus anlar. (Not: Sami'nin genel sohbet beyni 29 Ekim'den beri Haiku; Opus'a geçiş Patron'un onayını bekliyor.)

## F. Stok, silme, kanal, site
23. **Silme kararı sadece Patron'un.** "Sil" düğmesi Patron dışında kimseye gitmez.
24. **Mağaza stoğu bitmeden** hiçbir model siteden ve kanaldan kaldırılmaz.
25. **SOLD OUT:** sadece Vegawin mağaza stoğu 0 olunca (fabrikada bitmesi sebep değil); mesaj silinmez, yazıya SOLD OUT eklenir.
26. **Kanal ve siteye onaysız hiçbir şey gitmez.** Kanal yazısı her zaman kendi düzeninde: EN/FR, fiyatsız, marka imzalı; eski yazı asla kopyalanmaz. Yeni renk → "NEW COLOR / NOUVELLE COULEUR".
27. **Kemal kendiliğinden toplu geri koyma / yeniden paylaşma yapmaz;** günde 10 onaylı paylaşım, 09:00–21:00, arası 60–90 dk.

## G. Fabrika ve repete
28. **Repete her zaman taslak, en az 40 adet;** Patron onayıyla fabrikaya.
29. **Fabrika zinciri:** "Bitti" → Fuat onayı → Hemra karar kartı → Venom'dan Patron'a. "Bitti" kartı Merdan/Aziz'e gitmez. Her karar kanıt defterine (tarih/saat/kim/aynen metin; Patron kararında hangi düğme). (11 Kasım: Hemra kartının ve repete yolunun son hali kural 51, 44, 45'te.)
30. **Fabrikaya giden listeler** mağaza mağaza ayrı, başı/sonu yazılı; liste bitmeden "emin misin?" özeti.
43. **Açık repete varken aynı modele yeni repete verilmez:** bir modelin repetesi fabrikadayken (mal gelmeden) o modele ikinci repete açılmaz.
44. **Fuat'ın repete kartı (Patron onayından sonra):** fotoğraf + kod + renk / beden dağılımı; dağılımı biz belirleriz, fabrika değiştirmez. Düğmeler sadece: [4-8 gün] [10-15 gün] [2 gün sonra dön] [Yapamam]. Fuat yazıyla da cevap verebilir ("3419 onaylıyorum 10 gün"); Sami anlar ve kaydeder. Patron'un kartı sade: dağılım + [Onaylıyorum] [Reddediyorum].
45. **Repete takibi:** Fuat süre seçince repete kaydı açılır ve Patron'a tek satır gelir ("3419 · 40 adet · Fuat onayladı · teslim: tarih"; aralıkta teslim = aralığın son günü). "2 gün sonra dön": Sami 2 gün sonra kartı Fuat'a yeniden gönderir, Hemra'ya sormaz. "Yapamam": Sami Fuat'a sadece "Tamam, teşekkürler" der, soru sormaz; Hemra'ya bildirir; Patron'a mesaj gitmez; kayıt "beklemede" kalır (kapanmaz, kural 43 bu modeli kilitlemez). Patron (Venom'a) ya da Hemra (Sami'ye) "3419 repete tekrar aç" derse kart Fuat'a yeniden gider. Fuat 24 saat cevap vermezse önce Fuat'a, sonra Hemra'ya hatırlatılır; teslim günü geçerse Fuat'a sorulur; mal gelince kayıt kendiliğinden kapanır.
49. **Akşam eksik listesi (Aziz → VOLONTE, Merdan → Black Rose):** her kartta son 7 günde satılan adet + yıllık satış yazar. [Depoda var] düğmesi: Vegawin'de 0 görünüp rafta mal varsa repete istenmez. 1 saat cevap yoksa Sami bir kez hatırlatır; yine cevap yoksa liste o haliyle Hemra'ya gider.
50. **Hemra'nın liste onayı:** VOLONTE ve Black Rose listeleri AYRI gelir. 1 saat onay yoksa Sami hatırlatır; 1 saat daha cevap yoksa liste Patron'a gelir. Onaylanınca liste fabrikaya (Sinem, Fuat, Nuri) gider.
51. **Sinem "Bitti" basınca** Sami hemen Hemra'ya kart gönderir: fotoğraf + kod + mağazada kalan adet + son 7 gün ve yıllık satış + Sami'nin önerisi. Düğmeler: [Repete] [Bitene kadar bekle] [Sil]. Repete → Hemra dağılımı onaylar → Patron'a kart (dağılım + [Onaylıyorum] [Reddediyorum]) → Fuat'ın repete kartı. Bitene kadar bekle → model site ve kanalda kalır, stok bitince SOLD OUT. Sil → Hemra silemez, karar Patron'a gelir. Repete Fuat'a düz yazıyla gitmez; sadece kartla.

## H. Gizlilik
31. **Depo herkese açık:** Telegram kimliği, telefon, kullanıcı adı, fiyat, şifre depoya yazılmaz; gizli kayıtta durur. Şifre asla yazdırılmaz. Kişisel bilgi dış servislere gönderilmez.

## I. Pelin
32. **Pelin sadece Patron açıkça isterse üretir;** kendiliğinden / otomatik yeniden üretim yok. Büyük beden modelde dolgun manken, onaylı yüz. 3 saatte bitmezse Patron'a sorar. Çalışan işi varken Pelin yeniden yüklenmez.

## J. Dosyalar
36. **KURALLAR-PATRON.md ve VOLONTE-BILGI.md her güncellendiğinde main dalına da AYNI ANDA yazılır** (Claude projesi bu dosyaları main'den okur). Main'de sadece bu dosyalar değişir; kod ve site dosyalarına dokunulmaz.

## K. Venom rapor ve mesaj düzeni (11 Kasım)
37. **Sabah (09:40) ve akşam (20:00) raporu EN FAZLA 8 satır, sabit sıra, her satır tek kez:** başlık · genel durum ("Her şey çalışıyor" / "N sorun var: …") · Patron kararı bekleyen (sadece para, repete, silme; yoksa satır yok) · satış (VOLONTE X, Black Rose Y) · kanal (X paylaşım) · site (X model, Y eklendi) · fabrika (eksik listesi gitti mi, kaç model) · Venom'un kendi çözdükleri (tek satır). Tekrar, yarım satır, kart sayısı, iç ayrıntı yok; ayrıntı sadece /detay.
38. **Mesajlarda <b> gibi kod etiketi görünmez;** biçimsiz gönderimde etiketler temizlenir.
39. **Venom Patron'a "kontrol edeyim mi?", "yazayım mı?" diye sormaz;** kontrol eder, çözer, sonucu tek mesajla bildirir.
40. **Çelişkili mesaj yasak:** bot "yapamadım" deyip Venom "düzeltildi" diyemez. Venom önce kanıtla doğrular (kanal mesaj numarası, site linki), sonra TEK mesaj: "Tamam, kanıt: …" ya da "Yapılamadı, sebep: …, şu an çözülüyor". Sıraya alınan iş "tamam" sayılmaz.
41. **Köprü alarmı Patron'a doğrudan gelmez:** bilgisayardan sinyal yoksa Venom önce mağazanın sorumlusuna (VOLONTE → Aziz, Black Rose → Merdan) ve Hemra'ya yazar ("Mağaza bilgisayarı açık mı, Sami köprüsü çalışıyor mu?"); 30 dakikada düzelmezse Patron'a tek satır. Cumartesi, pazar ve 09:00–10:30 açılışta alarm yok. Sinyal varsa Venom soru sormaz: Vegawin'e giriş olmaması normaldir.
42. **Kontrol ilkesi:** Venom önce kendisi çözer; Patron'a sadece çözülmüş hali ya da gerçek karar gelir.
47. **Venom listeleri temiz:** biten ya da 3 günden eski iş listeden kendiliğinden düşer (şüpheliyse Venom önce kanıtla kontrol eder); aynı iş iki kez yazılmaz; satır yarım kesilmez; iç kod adı Patron'a gösterilmez.
48. **"Bekleyenler"de sadece Patron kararı bekleyen işler olur,** her birinin altında kendi düğmesi; bilgi satırı (ör. "Sitede 165 model") olmaz. Ne olduğu belli olmayan iş tek cümleyle açıklanır.

## L. Deneme (11 Kasım)
52. **Elemanlara deneme kartı gitmez.** Claude Code zinciri önce kendisi baştan sona çalıştırır: Sami ve Venom'un gerçek kodu, sahte Telegram ile; düğmelere sahte basılır, her adımda giden mesaj okunur (Sinem → Hemra → Patron → Fuat [2 gün sonra dön] → Fuat [Yapamam] → "tekrar aç" → Fuat [4-8 gün] → Patron'a sonuç satırı; dosya telegram-bot/test-zincir.mjs). Uçtan uca hatasız geçmeden Patron'a "hazır" denmez. Sadece hatasız geçerse elemanlarla TEK bir son deneme yapılır (Patron onayıyla).
53. **Aynı mesaj tekrar gitmez:** aynı kişiye aynı mesaj için ikinci onay kartı açılmaz; onaylanmış mesaj 24 saat içinde ikinci kez gönderilmez. Fabrikaya (Fuat, Nuri) "test" / "deneme" içerikli mesaj "🧪 DENEME" başlığı olmadan asla gitmez.
54. **Patron "geldi mi?" diye hiç sormaz.** Telegram'ın "gönderildi" demesi kanıt sayılmaz; asıl kanıt kişinin karta basması ya da cevap vermesidir. Elemana giden her kartı Sami takip eder: 30 dakika (mesai) içinde basılmazsa kişiye bir kez "Size kart geldi, en alttaki karta bakın" diye hatırlatır. 1 saat sonra hâlâ basılmamışsa Venom Hemra'ya bildirir ve sebebini kendisi araştırır (kart yanlış hesaba mı gitti, kişi botu engelledi mi?). Patron'a sadece Venom'un çözemediği durum gelir.
