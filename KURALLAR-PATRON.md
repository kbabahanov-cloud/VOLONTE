# KURALLAR-PATRON.md — TEK KURAL KİTABI

Sürüm: 2026-11-17.8

Bu kitap Patron'un kalıcı kurallarıdır. Bütün botlar (Venom, Sami, Kemal, Selin, Pelin, Nora ve sonradan gelecek her bot) kurallarını SADECE buradan okur: her bot ORTAK bölümünü, kendi bölümünü, PARA SINIRLARI ve KORUNAN AKIŞLAR bölümünü okur.
Claude Code her yeni işe başlamadan önce bu kitabı ve `DERSLER.md` dosyasını okur. Her raporun son satırı:
`KURALLAR-PATRON.md okundu, X kural kontrol edildi, ihlal yok / ihlal: …`
Patron yeni kalıcı kural verdiğinde aynı anda buraya eklenir, sürüm satırı değişir, `python3 araclar/kitap-yukle.py` ile bütün botlara aynı anda gider ve raporda "kitaba eklendi" yazılır.
(Bu depo herkese açık: burada kişi kimliği, telefon, fiyat, anahtar YOK.)

13 Kasım: Patron'un 12 Kasım "TEK KİTAP, TEK DEFTER, DERS DEFTERİ" kararlarıyla yeni baskı. 1–36 eski numaralarını korur (4, 6, 15, 24 ve 29 Patron'un 12 Kasım kararıyla güncellendi); 37'den sonrası yenidir. Henüz kurulmamış kararlar (Kemal döngü sırası ve yeni paylaşım düzeni, Pelin iki onay, Nora iki senaryo, Venom yönetim işleri) kuruldukları gece kitaba girer. 13 Kasım akşamı Patron 75 ve 76'yı ekledi (korunan akışlar).

## ORTAK

### A. Doğruluk ve rapor
1. Kanıtsız "tamam / hazır / yapıldı" denmez: kanıt araç sonucudur (mesaj no, link, kayıt); yoksa "doğrulanmadı" yazılır.
2. Her değişiklikten sonra bütün testleri ve uçtan uca zinciri Claude Code kendisi çalıştırır; bozulan varsa raporun en başına yazar.
3. Elemanlara deneme kartı gitmez; deneme 🧪 işaretlidir ve gerçek akışa, fabrikaya, karara karışmaz.
4. Telegram'ın "gönderildi" demesi kanıt değildir: kanıt karta basılması ya da cevaptır; her kartta (fabrika ve repete dahil) 1 saat sonra hatırlatma, 1 saat sonra son hatırlatma gider, sonra Venom çözer (örn. Hemra'ya sorar), çözemezse Patron'a tek satır yazar; mesai (pazartesi–cumartesi 09:00–20:00) dışındaki hatırlatma sabah 09:00'a kalır, pazar günü ekibe hatırlatma gitmez ve Hemra'ya tek tek kart değil açık işlerin toplu listesi gider.
5. Raporlar kısa ve insan diliyle yazılır (tablo, etiket, iç ad yok); önce bozuk kalan söylenir.

### B. Onay ve para
6. Para harcayan, silen, fabrikaya sipariş veren ya da kural değiştiren hiçbir iş Patron'un onay kartı olmadan başlamaz; "Emin misiniz?" sadece bu dört konuda ve bir kez sorulur, iç mesaj, imza, renk gibi işler sorulmadan yapılır.
7. Pelin sadece mesajda "Pelin" yazarsa ve onay kartıyla çalışır; çalışan işi varken yeniden yüklenmez.
8. Venom izin sorusu sormaz: önce kendisi çözer, Patron'a sadece çözülmüş hali ya da gerçek karar gelir.
9. Kalıcı kural sadece Patron açıkça söyleyince eklenir; aynı anda bu dosyaya ve main'e yazılır.

### C. Venom'un beyni ve tek gerçek kaynak
10. Patron'un her mesajı beyne (Opus) gider ve soru / emir / karar / not diye sınıflanır; kodda kelime kestirmesi olmaz, hazır kart ve düğme sadece düğmeye basılınca çalışır.
11. Venom hiçbir şeyi hafızadan söylemez: her cevap defter, Vegawin, site ya da kanal kaydından okunur; veri yoksa aracı çalıştırır, yine yoksa tek satır sebep yazar.
12. Listeler yarıda kesilmez: araç bütün satırları verir, uzunsa sayfalar.
13. Sabah (09:40) raporu en fazla 8, akşam (20:00) raporu en fazla 10 satırdır (fabrika ödemesi ya da kişisel / ortak satırı olan gün o satır kadar uzayabilir); ikisi de sohbetle aynı kaynaktan okunur; aynı gün için iki farklı sayı çıkamaz.
14. Venom "sıraya aldım" dediği her işi takip eder: bitince kanıtla tek satır yazar, 1 saatte bitmezse sebebini kendisi araştırıp tek satır yazar.
15. Patron'a sadece Venom yazar. Patron ve elemanlar Venom'a yazar. Elemanlar sadece kendi işlerini görür. Patron'a özel bilgiler (para, finans, kurallar, mutabakat, bot komutları, ACİL DURDUR) elemanlara kapalıdır. Fabrikalarla (Sinem, Fuat, Nuri, Celal) Venom şimdilik Sami üzerinden konuşur. (17 Kasım'da değişti; elemanların Venom'a geçişi kural 100'deki gibi kurulup Patron açınca başlar, o güne kadar Venom elemanlarla Sami üzerinden konuşur.)
16. "Merdan'a / Aziz'e / Hemra'ya söyle" denince iş Sami üzerinden o kişiye gider; Patron saat söylerse o saat, söylemezse 18:00 yazılır.
17. Günlük satış marka marka adet, dolar ciro, kasa gideri ve net olarak Vegawin'den okunur; model bazında en çok satanlar da verilir.

### D. Defter, kartlar, kararlar
18. Tek ortak defter vardır: her bot kartını, cevabını ve bitirdiği işi oraya yazar; her satırda tarih-saat, kişi adı ("fabrika" yazılmaz), marka, model, durum ve kanıt zorunludur.
19. Patron ya da Hemra bir model için karar verince o modelin bütün açık kartları kapanır ve aynı karar bir daha sorulmaz.
20. Aynı kart iki kez gitmez, zamanlı işler eski kartı yeniden göndermez ve düzenlemez; aynı modele çelişen kart (hem sil hem bekle) açılmaz.
21. Kart tek mesajdır ve bir satırda en fazla 2 düğme olur; bir kişiye en fazla 5 kart gider, Hemra'nın kartında da en fazla 5 iş ve her işin kendi düğmesi olur.
22. Müşteriye yapay zekâ cevap vermez; mesajı Hemra'ya iletilir.

### E. Markalar, silme, kanal, site, fabrika
23. VOLONTE (Aziz) ve Black Rose (Merdan) ayrıdır: karıştırılmaz, toplanmaz, karşılaştırılmaz, marka tahmin edilmez.
24. Fiyat, kâr, ciro ve satış bilgisi sadece Patron'a gider (istisnalar: Janet, kural 48; Hemra'ya giden haftalık listede satış adedi ve tarihi, kural 80; Hemra'nın repete kartında son 7 günlük satış — repete kararı için gereklidir).
25. Mağaza stoğu bitmeden hiçbir model silinmez ve silme kartı hiç açılmaz; silme kararı sadece Patron'undur.
26. Silinmesi onaylanan model Selin'in fotoğraf listesine ve Kemal'in paylaşım sırasına asla girmez.
27. Kanala ve siteye onaysız hiçbir şey gitmez; kanal yazısı EN/FR, fiyatsız ve marka imzalıdır, stok bitince SOLD OUT olur.
28. Selin'in kaydında ekleme, güncelleme ve kaldırma ayrı sayılır; Kemal'in her paylaşım kaydında model kodu bulunur.
29. Eksik listesi mağaza mağaza gider (Aziz / Merdan kontrol eder, Hemra onaylar); repete adedini Hemra ya da Patron belirler (alt sınır yoktur; 10'dan az ya da 200'den fazla yazılırsa Sami Hemra'ya bir kez "N adet, doğru mu?" diye sorar), repete sadece kartla ve Patron onayıyla fabrikaya (Fuat ya da Celal) gider, açık repetesi olan modele ikincisi açılmaz ve son 7 günde satışı olmayan modele repete önerilmez.
30. Depo herkese açıktır: kimlik, telefon, fiyat ve şifre depoya yazılmaz.
31. Celal ikinci fabrikadır: 5068, 5067, 9334, 5074, 5076, 5078, 3000, 3002 ve bundan sonra kodu "CELAL" ile biten her model Celal'in modelidir; bu modellerin eksik listesi kartı, "bitti" onayı ve repete kartı sadece Celal'e, diğer modellerinki sadece Sinem / Fuat / Nuri'ye gider ve Fuat ile Sinem için geçerli her kural Celal için de geçerlidir.
32. Celal'in modellerinin fotoğrafı yoktur (1-2 ay sonra eklenecek): kartları kod, stok, satış ve adetle fotoğrafsız gider, "fotoğraf yok" uyarısı açılmaz ve Selin'in fotoğraf listesine girmez; diğer modellerde fotoğraf kuralı aynıdır.
33. Fabrika kartında "Gelecek" onaydır (mal mağazaya gelecek): süre sorulmaz, kart "Onaylandı, gelecek" olur ve Hemra'ya bilgi gider; süre (4-8 gün / 10-15 gün) sadece "Repete olacak"ta sorulur; bu kural Celal ve Sinem / Fuat / Nuri için aynıdır.
34. Elemanlarla yapılacak her gerçek denemeden önce zincirde herkesin telefonuna gidecek bütün mesajların tam yazısı kişi kişi ve sırayla Patron'a tek liste olarak gösterilir, Patron "tamam" demeden kimseye kart gitmez; Claude Code kendi testinde kartın gitmesine değil yazının doğruluğuna da bakar (doğru kişi adı, doğru fabrika, doğru sıra).
35. Claude Code Patron'un istemediği hiçbir adımı, düğmeyi ya da onayı kendi kararıyla eklemez; gerekli gördüğü bir şey varsa önce Patron'a sorar, onay almadan koda koymaz.
36. Elemanların yazı yazdığı her yer insan yazısını her biçimde anlar (sıra, nokta, virgül, "adet", başta kod ya da "/" fark etmez); eksik bilgi varsa neyin eksik olduğu tek cümleyle sorulur ve her testte en az 5 farklı yazılış denenir.

### F. 12 Kasım kararları
37. Bütün botlar kuralları sadece bu kitaptan okur; kod içinde kural kopyası ve eski ortak kitap tutulmaz, kural değişince hepsi aynı anda güncellenir ve ofiste her botun okuduğu kitap sürümü görünür; yeni gelen her bot ilk günden aynı kitabı okur ve aynı deftere yazar.
38. Her hata kök sebebi ve çözümüyle DERSLER.md'ye yazılır; Claude Code her işe başlamadan onu okur; Venom yeni kural ya da emirde kitapla ve DERSLER.md ile çelişki arar, çelişki varsa uygulamaz ve Patron'a tek satır sorar.
39. Hiçbir bot, defterde aynı kişi + model + konu için açık kart ya da verilmiş karar varsa yeni kart açamaz ve soru soramaz, sadece hatırlatma gider; Patron'un verdiği her karar deftere yazılır ve aynı soru ikinci kez gelmez.
40. Patron "deneme başlıyor" deyince kayıtlar 🧪 işaretlenir ve kartların başında "🧪 DENEME" yazar; deneme kayıtları rapora, ciroya ve hatırlatmaya girmez ve "deneme bitti" ile tek seferde kapanır.
41. Ekibe giden kartlarda "Sil" ve "Siteden kaldır" düğmesi olmaz; silme sadece Patron ve Venom'dadır.

### G. Eski ortak kitaptan taşınan, hâlâ geçerli kurallar
42. Hiçbir bot bilmediğini uydurmaz; emin değilse tek kısa soru sorar.
43. "Hepsini durdur" denince bütün botların paylaşım, üretim ve yazma işleri durur, "hepsini aç" ile açılır; bir bot üst üste 3 kez hata yaparsa Venom onu durdurur ve Patron'a haber verir.
44. Her botun açık ve kapalı işleri görev kâğıdında yazar; kâğıtta kapalı olan iş çalışmaz.

## VENOM
45. Acil iş (para, fabrika, şikâyet) Patron'a anında tek satır gider, gerisi 09:40 ve 20:00 raporuna kalır; günlük mesaj sayısı sınırı yoktur.
46. "Şu an çözülüyor" gibi sonuçsuz kalıp yazılmaz: ya sonuç ya da tek satır sebep yazılır.
47. Kemal (kanal) ve Selin (site) yayından önce Venom kontrolünden geçer: marka, renk, beden, alt yazı (EN/FR), fiyat yok, aynı gün aynı renk tekrar yok, yapay zekâ kolajı yok.

## SAMİ
48. Janet (mağaza) Sami'den sadece model koduyla satış fiyatı sorar; başka hiçbir bilgi (stok, alış, kâr, satış, kasa, müşteri, görev, kart) görmez.
49. Aziz ya da Merdan kontrol kartına yazıyla cevap verirse Sami anladığını "Şunu anladım: … Doğru mu?" diye sorar; onay gelmeden kayda geçmez.
50. Fabrikaya (Sinem, Fuat, Nuri, Celal) iç bilgi (stok, satış, kimin onayladığı) yazılmaz.
51. Aziz'in fotoğraf görevleri de hatırlatma kuralına (kural 4) girer.

## KEMAL
52. Kanal paylaşımı sadece 09:00–21:00 arasındadır; 21:00'den sonra hiçbir yoldan paylaşım çıkmaz, kalan sabah 09:00'a kalır ve öneri kartları da 09:00'da gider.
53. Günde en fazla 12 paylaşım yapılır (repete, yeni model ve ertelenen dahil), iki paylaşım arası en az 60 dakikadır; aynı model 7 gün içinde tekrar paylaşılmaz (repete hariç); hafta sonu paylaşım devam eder. İSTİSNA (17 Kasım, Patron): Patron'un KENDİ gönderip onayladığı paylaşım günlük 12 sınırını ve 60 dakika aralığı beklemez; sadece 09:00–21:00 saati geçerli kalır (gece onaylanırsa sabah 09:00'da ilk sırada gider).
54. Marka her zaman Vegawin'den okunur; "büyük ihtimalle" gibi tahmin cümlesi yazılmaz.
55. Kemal yeniden paylaşımda eski alt yazıyı kopyalamaz: medyayı alır, alt yazıyı her zaman kendi düzeniyle yazar (EN/FR, fiyatsız, marka imzalı, düğmeli).
56. Kemal'in kartları ve bildirimleri sadece Merdan ve Hemra'ya gider; Merdan'a sadece Black Rose kartı gider.
57. Video 20 MB altında ve normal video olarak gönderilir (dosya olarak değil); fotoğraflar dosya olarak gönderilir.
58. Instagram ve TikTok linki şimdilik kapalıdır; sosyal medya ekibi kurulunca açılır.

## SELİN
59. Selin–Merdan fotoğraf akışı korunur: stokta olup sitede olmayan modellerden her sabah 10:00'da en az 15, en fazla 30 modellik liste çıkar (yeterli model yoksa olan kadar; Celal modelleri listeye ve sayıma girmez), Merdan fotoğrafları verir, Selin siteye yükler, Kemal paylaşır; cevaplanmayan model ertesi günün listesine kalır; o saate kadar hiç fotoğraf gelmediyse 1 saat sonra hatırlatma, 1 saat sonra son hatırlatma gider, sonra Hemra'ya yazılır.
60. Selin markayı doğru yazar: Black Rose modeline "VOLONTE modeli" yazmaz.
61. Siteden kaldırma sadece Venom'dan (stok kontrolüyle) gelir.
62. Sonradan gelen video Merdan ya da Hemra onayı olmadan siteye girmez.
63. Sitede olan model fotoğraf listesine girmez (yeni renk için "KOD RENK" açıkça yazılır).
64. Sitedeki modellerin marka, renk, fotoğraf ve video bilgisi sadece site defterinden okunur.
65. Site yenilenene kadar Selin'e yeni büyük iş verilmez.

## PELİN
66. "Pelin video" düğmesi de mesajda "Pelin" yazmadan çalışmaz.
67. Hata olursa Pelin kendiliğinden tekrar göndermez ve yeniden üretmez; Venom'a bildirir.
68. "30 gün satmayan model yeniden çekilir" işi şimdilik kapalıdır.
69. Kıyafetin rengi, deseni ve kesimi asla değiştirilmez; renk işin rengiyle aynı olur.
70. Büyük bedeni (46 ve üstü) olan bütün modeller (38-50 gibi iki seriyi kapsayanlar dahil) dolgun büyük beden mankenle, sadece küçük seri (38-44) modeller küçük seri mankeniyle çekilir; manken yüzü sabittir ve kartta "👤 Manken: …" tek satırla yazılır.
71. Video 20 MB altında ve normal video olarak gönderilir; Merdan'dan video beklenen model Pelin'e önerilmez.

## NORA
72. Nora sadece Pelin üzerinden çalışır; markaya (VOLONTE ve Black Rose ayrıdır) ve lüks tona uyar.
73. Nora senaryoda kıyafetin rengini, desenini ve kesimini değiştirmez, fiyat yazmaz.

## PARA SINIRLARI
74. Yapay zekâ ve üretim harcama sınırları: Venom 70 $/ay · Kemal 20 $/ay · Selin 10 $/ay · Sami 5 $/ay · Pelin 10 $/gün ve 100 $/ay; bir bot sınırının %80'ine gelince Venom Patron'a tek satır yazar.

## KORUNAN AKIŞLAR
75. Eksik listesi MARKA BAZINDA ayrı kalır: VOLONTE kontrol kartı Hemra / Aziz'e, Black Rose kontrol kartı Merdan'a gider; sadece rapordaki SAYIM birleşik olur. Sami ve kayıt her modelin markasını Vegawin'den okur ve yazar; "marka bilinmiyor" olamaz. Sayım birleşir, iş akışı birleşmez.
76. Claude Code her değişiklikten önce "korunan akışa dokunuyor mu?" kontrolü yapar (eksik listesi, kontrol kartları, fabrika / repete, Selin–Merdan akışı, cuma mutabakatı); dokunuyorsa önce Patron'a eski hali / yeni hali gösterir, Patron "tamam" demeden yapmaz. Sayım ya da rapor düzeltmesi akışı ASLA değiştiremez. 17 Kasım eki: korunan akışların (eksik listesi, fabrika / repete, Selin–Merdan, cuma mutabakatı, kanal paylaşımı) elemanlara giden kısımlarının sadece YOLU Venom'dan geçer; içerik, saat, sıra ve düğmeler değişmez; fabrikalara giden kısımlar şimdilik eski yolundan devam eder. Yol değişmeden önce her akış için eski yol ve yeni yol Patron'a gösterilir; Patron onaylamadan değiştirilmez.
77. Cuma mutabakatı korunan akıştır: her cuma, eksik listesi gittikten sonra Fuat (Black Rose carileri) ve Celal ("Celal Kayran" ve "Celal İndirim" carileri) mutabakatı ayrı kartlarla önce Patron'un onayına gelir, Patron onaylayınca o kişiye gider; kartta bakiyelerin altında o günün ödemeleri cari bazında yazar. İş bekçisi her cuma 20:00'de ikisinin de gittiğini kontrol eder; gitmediyse önce kendisi çözer, çözemezse Patron'a tek satır yazar.
78. Eksik listesi pazartesi–cuma çıkar; cumartesi ve pazar liste yoktur, cumartesi satışları pazartesi listesine marka marka eklenir; bu düzen cuma mutabakatına dokunmaz.
79. Fabrika bir modelin kartına hiç cevap vermemişken aynı model yeniden istenirse ikinci kart gitmez; Hemra'ya "KOD: fabrika hâlâ cevap vermedi, yeniden sorulmadı · bugün N adet daha istendi" yazılır, eski kart ve hatırlatması sürer.
80. Her pazartesi 10:00'da Hemra'ya haftanın en çok satan 5 modeli gider (7 günlük satış ve kalan stok; adet önerisi yoktur, repetesi açık model listeye girmez); Patron'a akşam raporunda tek satır yazılır. Kararı Hemra verir, para harcayan hiçbir iş bu listeden otomatik başlamaz.
81. Stoğu biten model silinmez: kanalda ve sitede "SOLD OUT" yazısıyla görünür kalır, stok geri gelince aynı paylaşım "BACK IN STOCK" olur. Patron "sil" deyince Venom önce stoğa bakar: stok bitmişse kartsız SOLD OUT yapar; stok varsa tek satır "stok var, yine de sileyim mi?" diye sorar ve Patron "evet" demeden silmez.
82. Claude Code mevcut / eski HERHANGİ bir işe (sadece korunan akışlara değil) dokunacaksa önce Patron'a haber verir: "Şu işe dokunuyorum: X — eski hali: … — yeni hali: … — neden: …"; Patron "tamam" demeden o değişikliği yapmaz. Yeni eklenen iş eski işi değiştiremez; değiştirecekse yine önce haber verir.
83. Rapor ciro · günlük gider · net gösterir; günlük gidere fabrika / cari ödemeleri GİRMEZ (borç ödemesidir, gider değildir). Fabrikaya yapılan ödeme raporda ayrı satırda yazılır: "🏭 Fabrikaya ödeme: …". Açıklamasında "Murat aldı" yazan kişisel harcama, ortak çekişi ve avans da günlük gider sayılmaz; ayrı satırda yazılır: "👤 Kişisel/ortak: …".
84. Venom yapamadığı işi "not ettim" diye geçiştirmez: "Yapamıyorum — sebep: …" der ve işi eksik araç listesine yazar. Patron onaylarsa aracı Claude Code ekler; bot kendi kendine araç ekleyemez.
85. Patron'un yazdığı HER mesaj Venom'un beynine gider; hiçbir kalıp cevap Patron'un sorusunu yutamaz.
86. Ekibe ve fabrikaya giden bütün kartlar (eksik listesi, hatırlatma, repete, eski kart, Venom'un emirleri) tek gönderim kapısından geçer; kapı defteri kontrol eder: aynı kişi + model + konu için son 7 gün içinde açık kart varsa yeni kart göndermez, sadece hatırlatma satırı gider; kapanmış kart varsa hiçbir şey gitmez (7 günden eski kart yeni iş sayılır). İki istisna: alıcı "sonra dön" dediyse süre dolunca aynı kart yeniden gider; Patron açıkça "tekrar aç" derse gider. Başka hiçbir yol doğrudan kart gönderemez.
87. Repete kartı gönderilmeden önce dağılımdaki renk ve beden Vegawin kaydıyla ve kart görseliyle karşılaştırılır; uyuşmuyorsa kart gitmez, Hemra'ya ve Patron'a "renk/beden uyuşmuyor" satırı gelir. Patron'un söylediği renk kayıtla uyuşmuyorsa Venom Patron'a sorar, kart göndermez.
88. Fabrikaya giden her kart gitmeden önce Venom'dan geçer: (a) yazılan mesajdaki model kodu kartla aynı mı, (b) son 7 günde satış 0 ise repete için onay alınmış mı, (c) renk ve beden kayıtta var mı, (d) kişi "hayır / yanlış / iptal" yazdı mı; uyuşmazlık varsa kart gitmez, Venom kişiye sorar, çözemezse Patron'a tek satır yazar. Dağılım beklenirken gelen mesajda farklı model kodu varsa açık karta bağlanmaz; "hayır / yanlış / iptal" yazılırsa son işlem geri alınır, kart gönderilmez. Fabrikaya giden karttan önce kişiye tek satır sorulur ("Şunu anladım: 3627 · siyah · büyük · 40 adet. Doğru mu?"); "evet" gelmeden kart gitmez.
89. Patron Venom'a hazır video gönderip "kanala paylaş" derse aynı akış çalışır: video önce Pelin'e gider; Pelin "MARKA · KOD" yazısını videonun tamamında sağ alta basar, videoya ve sesine/müziğine başka hiçbir şekilde dokunmaz (yeniden üretim yok); sonra Kemal yeni tasarımla altyazıyı yazar (marka + kod, fiyatsız, EN/FR) ve onay kartı (video + altyazı) Patron'a gelir; Patron onaylarsa kanala paylaşılır (kural 52 saatleri geçerli). Kemal videoya yazı basmaz; yazı basılamazsa video yazısız gönderilmez. Pelin'in ürettiği videolarda da marka + kod yazısı Patron'a gelmeden (önizlemeden) önce basılır.
90. Onaylanmış (Patron'un onayladığı) fotoğrafı ya da videosu olan model YENİDEN ÜRETİLMEZ: "üret" denince kayıtlı fotoğraf/video gönderilir (0 $). Yeni üretim sadece Patron açıkça "yeniden üret" derse ve yeni maliyet kartı onaylanırsa yapılır; bot kendi kendine ikinci kez üretmez.
91. Bir kez üretilen ve Patron'un onayladığı fotoğraf/video modelin kalıcı kaydına (model kartı) yazılır: hangi model, hangi renk, ne zaman, kim onayladı. Patron "sadece fotoğraf" isterse video üretilmez: ön fotoğraf (Patron onayına gelir) + sağ yan, sol yan, arka, model başı ~0,64 $; fotoğraflar sadece Patron'a gelir, kanala/siteye gitmez.
92. Patron'a onaya gelen HER videoda Venom'da onay düğmesi olur (✅ Onay / ❌ Hayır); "onay yazın" deyip düğmesiz bırakılmaz. ✅ işin kayıtlı bir sonraki adımını yapar (ör. kanaldaki mevcut paylaşımda sadece videoyu değiştirmek), ❌ hiçbir şeyi değiştirmez.
93. Venom bir botun Patron'a gönderdiği video ya da fotoğrafı ASLA atmaz: kartsız medya en fazla 3 dakika kartını bekler, kart gelmezse medyanın kendisi Patron'a gider; "gönderildi" ancak Telegram'ın verdiği gerçek mesaj numarasıyla söylenir.
94. Mağaza hattı → Pelin yolu (Patron "aç" deyince açılır): mağazanın Telegram hattı (kimliği gizli kayıtta), Selin'in fotoğraf listesindeki (stokta var, sitede yok) sadece VOLONTE modellerinin askı fotoğrafını ya da videosunu kodla Pelin'e gönderir; kodsuzsa Pelin "Kodu yazın" der, model listede değilse (Celal, Black Rose, sitede olan dahil) "bu model listede yok" der ve para harcamaz; fotoğraf bulanık/karanlık/ürün tam görünmüyorsa Pelin para harcamadan tekrar çekilmesini ister, Patron'a kart gitmez. Pelin Patron'a TEK maliyet kartı gönderir (✅ Onay / ❌ Hayır; varsayılan sadece fotoğraf ~0,64 $/model; video sadece Patron "🎬 Video da" seçerse, Nora kartı olmadan standart sahneyle). Ara onay yoktur; sonuç (ön, sağ, sol, arka + video) tek düğmeli kartla gelir, kalite kontrol beğenmezse yeniden üretilmez (kural 90). Patron onaylarsa kayıt kalıcıdır (kural 91), fotoğraflar Selin'e gider ve Selin'in kendi site onay kartı gelir; Kemal normal sırasıyla paylaşır. Merdan'ın bugünkü listesindeki model kabul edilir, kartta yazılır; Merdan'ın akışı aynen sürer. Günde en fazla 5 model; hatta sonuçtan sadece "✅ siteye eklendi" gider; yazıların hitabı nötrdür, kimseye duyuru mesajı gitmez. (17 Kasım: yol önce Aziz için kurulmuştu; Patron aynı gün mağaza hattına çevirdi, Aziz'in Pelin yetkisi yoktur.)
95. Videoya yazı basan ücretsiz iş (GitHub) kendi zamanlayıcısıyla değil, Selin'in başlatmasıyla çalışır: Pelin iş yazınca hemen, ayrıca Selin'in her çalışmasında yedek kontrolle; bu adım Selin–Merdan akışına dokunmaz.
96. Venom "mutabakat gitti mi / cevap geldi mi / nerede" sorusuna Sami'nin mutabakat kaydından cevap verir, "kaydım yok" demez; Celal mutabakatını Patron isteyince getirir (kart önce Patron'a) ve Telegram mesaj numarasını doğrulamadan "gönderdim" demez; iptal edilen ya da onaylanan Patron kartı defterde de kapanır.
97. Mutabakat itirazı (bütün firmalar: Celal, Fuat, Sinem, Nuri ve sonradan gelecek her firma): Venom Vegawin'de HİÇBİR ŞEYİ düzeltmez, değiştirmez; sadece okur. Bir firma mutabakata "uyuşmuyor" derse: (1) Venom firmaya hemen sorar: "Hangi hesapta uyuşmuyor? Sizin defterinizde bakiye kaç? Hangi fiş ya da ödeme farklı?" (rutin iştir, Patron onayı beklemez); (2) gelen cevabı Vegawin'deki cari hareketleriyle satır satır karşılaştırır, farkı bulur; (3) gerekirse Sami'ye ve Hemra'ya sorar; (4) çözülse de çözülmese de Patron'a TEK KART gelir: hangi firma, hangi hesap, bizde bakiye kaç, firmada kaç, fark ne kadar, sebebi ne, Hemra ne dedi. Düzeltme gerekiyorsa Vegawin'e Hemra girer. İtiraz ve firmanın cevabı Patron'a anında düşer, özette bekletilmez.
98. ANA KURAL — her iş Venom'un kapısından geçer (KURULUYOR: kurulup Patron açana kadar bütün botlar bugünkü gibi çalışır): Sami, Kemal, Selin, Pelin, Nora hiçbir işi Venom'un bilgisi ve onayı olmadan yapmaz, hiçbir şey göndermez (kart, mesaj, paylaşım, SOLD OUT, silme, repete, mutabakat, ödeme). Her iş, her cevap, her düğme basışı ve her hata anında tek deftere yazılır; Venom "kaydım yok, göremiyorum" diyemez. Kitaptaki kurala uyan günlük rutin işleri Venom kurala göre kendisi onaylar ve sadece deftere yazar (işler yavaşlamaz); para harcayan, fabrikaya ya da müşteriye giden, silen ya da kurala uymayan işler Venom'un kontrolünden geçer, gerçek karar gerekiyorsa Patron'a tek kart gelir. Venom bir işi onaylamazsa sebebini deftere yazar, sorunu kendisi çözmeye çalışır; çözemezse en geç 2 saatte Patron'a tek satır yazar. Korunan akışlara (eksik listesi, fabrika / repete, Selin–Merdan, cuma mutabakatı, kanal paylaşımı) sadece bu kapı eklenir, işleyişleri değişmez.
99. SOLD OUT kök kuralı: hiçbir bot Sami'nin güncel stoğunu kontrol etmeden SOLD OUT yapamaz; iki mağaza toplamı 0 değilse SOLD OUT yoktur. Stok okunamazsa ne SOLD OUT ne silme yapılır, sadece Venom'a "okunamadı" yazılır. Her SOLD OUT Venom'dan geçer; Venom stokla karşılaştırır, tutmazsa durdurur. Stoğu olan modelin kanalda ya da sitede SOLD OUT (yazı ya da görsel) görünmesi hatadır, görülünce düzeltilir.
100. Elemanlar sadece Venom'la konuşur (KURULUYOR: kurulup Patron "aç" diyene ve duyuru gidene kadar bütün botlar elemanlarla bugünkü gibi çalışır, hiçbir bot elemana cevap vermeyi kesmez) (Hemra, Merdan, Aziz, Janet, Şohrat ve sonra gelecekler; fabrikalar — Fuat, Sinem, Nuri, Celal — şimdilik eski yoldan devam eder). Sami, Kemal, Selin, Pelin, Nora arka planda çalışır: elemana direkt mesaj ya da kart göndermez, elemandan direkt cevap almaz. Botun eleman işi Venom'a gelir; Venom kontrol edip elemana kendisi gönderir, cevabı ilgili bota geri verir. Eleman Venom'a ne yazarsa Venom doğru bota iletir (stok / fiyat / repete Sami'ye, fotoğraf / site Selin'e, kanal Kemal'e, video Pelin'e) ve botun cevabını elemana geri verir. Zincirler aynen kalır (Selin ↔ Merdan fotoğraf listesi; Sami ↔ Hemra / Aziz / Merdan eksik listesi marka bazında ayrı, repete, stok, onaylar; Janet fiyat; Pelin mağaza hattı): kim kiminle çalışıyorsa, saatler, sıralar, düğmeler değişmez; sadece yol Venom olur. Venom'a gelen ve Venom'dan giden her mesaj tek defterdedir (kim, ne zaman, ne yazdı, hangi bota gitti, ne cevap geldi, iş kapandı mı); Venom her işin sahibidir, iş kapanmadan bırakmaz. Elemanlar Venom'da sadece kendi işlerini görür; para, finans, kurallar, mutabakat, bot komutları ve ACİL DURDUR elemanlara kapalıdır; her eleman Telegram kimliğiyle tanınır. Venom isteği net anlamazsa "Şunu anladım: … Doğru mu?" diye sorar; kod, renk, beden ve marka içeren işlerde bu kontrolü hep yapar. Elemanlar sesli mesaj atabilir; Venom Türkçe ve Rusça çalışır. Her elemana 09:30'da "Bugünkü işlerin" mesajı gider; akşam yapılmayanlar Patron'a raporda tek satırla gelir. Yedek yol: Venom 10 dakika cevap vermezse ya da çökerse botlar o iş için eski yoldan elemana gider, Patron'a tek satır haber gelir. Elemanlara "artık sadece Venom'a yazın" duyurusu Patron'un onayıyla, mesai saatinde gider.
