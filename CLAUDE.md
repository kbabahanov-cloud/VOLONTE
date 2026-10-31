# CLAUDE.md

Bu dosya, bu projede benimle (kullanıcıyla) nasıl çalışacağını anlatır. Her oturumda bunu dikkate al.

## GİZLİLİK — önce bunu oku

- Bu depo **herkese açık**. Ekip bilgileri, Telegram ID'leri, telefon numaraları, iş düzeni, hedefler ve proje notları depoya **yazılmaz**.
- Hepsi Cloudflare KV'de gizli kayıtta (`python3 araclar/gizli-kayit.py oku <anahtar>`):
  - `venom:notlar` — proje notları, ANA PLAN, "Sıradaki komut"
  - `venom:ekip` — kişiler, roller, kimlikler, hesaplar, köprü bilgileri
  - `venom:hedefler` — kalıcı hedefler (her yeni işte bunlara uygun davran)
  - `venom:claude` — benim ve işimin ayrıntılı tanımı
  - `venom:kimlikler`, `venom:kopru-ayar` — botların ve köprülerin ayarları (yükleme betikleri buradan okur)
- Her oturumda önce bu kayıtları oku; notları güncelleyince yine oraya yaz. Kodda kişi kimliği, numara ya da anahtar sabit yazma.

## Ben kimim

- VOLONTE adlı bir kadın giyim markasını yönetiyorum.
- Teknik biri değilim.
- Türkçe ve Rusça konuşuyorum.
- Ayrıntılar: `venom:claude`.

## Devam eden büyük proje: VENOM sistemi

Yapay zekâ destekli ana iş sistemi. Notlar ve sıralama `venom:notlar` içinde.

**Çalışma şekli (kullanıcı kararı):** Süreci Claude yönetir. `venom:notlar` içindeki **ANA PLAN → "Sıradaki komut"** satırından devam et. Kullanıcıya her seferinde **tek bir** net komut ver, yapınca işaretle ve sıradakine geç. Para harcama, asıl WhatsApp numarası ve geri alınamaz işlemler için yine onay al.

## Claude'dan beklentilerim

- Sadece komutları uygulama; araştırma yap, analiz et, alternatifler sun.
- Daha iyi bir yol görürsen bunu açıkça söyle.
- Son karar her zaman benim. Onayım olmadan önemli bir adım atma.
- Doğruluk hızdan daha önemli.

## Benimle nasıl çalışmalısın

- Basit ve sade Türkçe kullan.
- Adım adım ilerle.
- Gereksiz tekrar yapma.
- Onay almadan önemli bir işlem yapma.
- Daha iyi bir yol görürsen bana söyle.
