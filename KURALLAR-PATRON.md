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
29. **Fabrika zinciri:** "Bitti" → Fuat onayı → Hemra karar kartı → Venom'dan Patron'a. "Bitti" kartı Merdan/Aziz'e gitmez. Her karar kanıt defterine (tarih/saat/kim/aynen metin; Patron kararında hangi düğme).
30. **Fabrikaya giden listeler** mağaza mağaza ayrı, başı/sonu yazılı; liste bitmeden "emin misin?" özeti.

## H. Gizlilik
31. **Depo herkese açık:** Telegram kimliği, telefon, kullanıcı adı, fiyat, şifre depoya yazılmaz; gizli kayıtta durur. Şifre asla yazdırılmaz. Kişisel bilgi dış servislere gönderilmez.

## I. Pelin
32. **Pelin sadece Patron açıkça isterse üretir;** kendiliğinden / otomatik yeniden üretim yok. Büyük beden modelde dolgun manken, onaylı yüz. 3 saatte bitmezse Patron'a sorar. Çalışan işi varken Pelin yeniden yüklenmez.

## J. Dosyalar
36. **KURALLAR-PATRON.md ve VOLONTE-BILGI.md her güncellendiğinde main dalına da AYNI ANDA yazılır** (Claude projesi bu dosyaları main'den okur). Main'de sadece bu dosyalar değişir; kod ve site dosyalarına dokunulmaz.
