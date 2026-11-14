# KURALLAR-PATRON.md — TEK KURAL KİTABI

Sürüm: 2026-11-14.3

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
13. Sabah (09:40) raporu en fazla 8, akşam (20:00) raporu en fazla 10 satırdır; ikisi de sohbetle aynı kaynaktan okunur; aynı gün için iki farklı sayı çıkamaz.
14. Venom "sıraya aldım" dediği her işi takip eder: bitince kanıtla tek satır yazar, 1 saatte bitmezse sebebini kendisi araştırıp tek satır yazar.
15. Patron'a sadece Venom yazar; Venom ekiple (Hemra, Aziz, Merdan, Sinem, Fuat, Nuri, Celal) Sami üzerinden konuşur.
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
24. Fiyat, kâr, ciro ve satış bilgisi sadece Patron'a gider (istisnalar: Janet, kural 48; Hemra'ya giden haftalık listede satış adedi ve tarihi, kural 80).
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
53. Günde en fazla 12 paylaşım yapılır (repete, yeni model ve ertelenen dahil), iki paylaşım arası en az 60 dakikadır; aynı model 7 gün içinde tekrar paylaşılmaz (repete hariç); hafta sonu paylaşım devam eder.
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
74. Yapay zekâ ve üretim harcama sınırları: Venom 50 $/ay · Kemal 20 $/ay · Selin 10 $/ay · Sami 5 $/ay · Pelin 10 $/gün ve 100 $/ay; bir bot sınırının %80'ine gelince Venom Patron'a tek satır yazar.

## KORUNAN AKIŞLAR
75. Eksik listesi MARKA BAZINDA ayrı kalır: VOLONTE kontrol kartı Hemra / Aziz'e, Black Rose kontrol kartı Merdan'a gider; sadece rapordaki SAYIM birleşik olur. Sami ve kayıt her modelin markasını Vegawin'den okur ve yazar; "marka bilinmiyor" olamaz. Sayım birleşir, iş akışı birleşmez.
76. Claude Code her değişiklikten önce "korunan akışa dokunuyor mu?" kontrolü yapar (eksik listesi, kontrol kartları, fabrika / repete, Selin–Merdan akışı, cuma mutabakatı); dokunuyorsa önce Patron'a eski hali / yeni hali gösterir, Patron "tamam" demeden yapmaz. Sayım ya da rapor düzeltmesi akışı ASLA değiştiremez.
77. Cuma mutabakatı korunan akıştır: her cuma, eksik listesi gittikten sonra Fuat (Black Rose carileri) ve Celal ("Celal Kayran" ve "Celal İndirim" carileri) mutabakatı ayrı kartlarla önce Patron'un onayına gelir, Patron onaylayınca o kişiye gider; kartta bakiyelerin altında o günün ödemeleri cari bazında yazar. İş bekçisi her cuma 20:00'de ikisinin de gittiğini kontrol eder; gitmediyse önce kendisi çözer, çözemezse Patron'a tek satır yazar.
78. Eksik listesi pazartesi–cuma çıkar; cumartesi ve pazar liste yoktur, cumartesi satışları pazartesi listesine marka marka eklenir; bu düzen cuma mutabakatına dokunmaz.
79. Fabrika bir modelin kartına hiç cevap vermemişken aynı model yeniden istenirse ikinci kart gitmez; Hemra'ya "KOD: fabrika hâlâ cevap vermedi, yeniden sorulmadı · bugün N adet daha istendi" yazılır, eski kart ve hatırlatması sürer.
80. Her pazartesi 10:00'da Hemra'ya haftanın en çok satan 5 modeli gider (7 günlük satış ve kalan stok; adet önerisi yoktur, repetesi açık model listeye girmez); Patron'a akşam raporunda tek satır yazılır. Kararı Hemra verir, para harcayan hiçbir iş bu listeden otomatik başlamaz.
81. Stoğu biten model silinmez: kanalda ve sitede "SOLD OUT" yazısıyla görünür kalır, stok geri gelince aynı paylaşım "BACK IN STOCK" olur. Patron "sil" deyince Venom önce stoğa bakar: stok bitmişse kartsız SOLD OUT yapar; stok varsa tek satır "stok var, yine de sileyim mi?" diye sorar ve Patron "evet" demeden silmez.
82. Claude Code mevcut / eski HERHANGİ bir işe (sadece korunan akışlara değil) dokunacaksa önce Patron'a haber verir: "Şu işe dokunuyorum: X — eski hali: … — yeni hali: … — neden: …"; Patron "tamam" demeden o değişikliği yapmaz. Yeni eklenen iş eski işi değiştiremez; değiştirecekse yine önce haber verir.
83. Rapor ciro · günlük gider · net gösterir; günlük gidere fabrika / cari ödemeleri GİRMEZ (borç ödemesidir, gider değildir). Fabrikaya yapılan ödeme raporda ayrı satırda yazılır: "🏭 Fabrikaya ödeme: …".
