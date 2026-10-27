# Ortak beyin (VENOM)

Kemal, Selin ve ileride Defne aynı Cloudflare KV deposunu kullanır (`volonte-bot-kayit`, id `cd4cd47b965142c6859bf702510166bb`, her Worker'da `KAYIT` adıyla bağlı).
Her eleman **ayrı bir Worker**'dır: biri bozulursa ya da yeniden yüklenirse diğerleri çalışmaya devam eder.

**Kural:** Herkes her şeyi okuyabilir. Her anahtarı sadece sahibi yazar. Tek istisna: `harcama:<YYYY-AA>` (aylık toplam yapay zekâ harcaması, sınır 80 $, uyarı 64 $) — herkes kendi çağrılarını ekler.

| Anahtar | Sahibi | İçerik |
|---|---|---|
| `kanal` | Kemal | Telegram kanalının kimliği ve kullanıcı adı |
| `kodlar` | Kemal | kod → kanaldaki paylaşımlar [{ids, tarih, album}] |
| `kodsuz` | Kemal | "~<ilk id>" → kodsuz paylaşım {ids, tarih, kopyalar} |
| `tarifler` | Kemal | kod → {t: tarif, f: 320 px dosya kimliği, m: mesaj} (fotoğraf tanıma kataloğu) |
| `hicgelmeyecek` | Kemal | silinen modeller (kim, ne zaman, tarihler) |
| `atlananlar` | Kemal | kod → bu tarihe kadar önerme (Beklesin 7 gün, silinen = kalıcı) |
| `sonpaylasim` | Kemal | kod → Kemal'in son yeniden paylaşım tarihi |
| `tur`, `kuyruk:<kod>`, `sayac:<gün>`, `gun:<gün>`, `ozet` | Kemal | turlar, sıra, günlük sayaçlar |
| `istekler` | Kemal | müşteri istek defteri |
| `selin:*` | Selin | site hazırlığı, sitedeki modeller |
| `harcama:<ay>` | herkes (ekleme) | aylık yapay zekâ harcaması (mikro-dolar) |

Ortak okuma yardımcıları: `telegram-bot/ortak.js` (`kanalBilgisi`, `modelSecenekleri`, `kodsuzMu`, `tarihUzun`) ve `telegram-bot/harcama.js`.

## Vegawin'de olmayan modeller (kullanıcı kararı, 27 Ekim) — BÜTÜN ELEMANLAR

Telegram kanalında VOLONTE ve Black Rose modelleri birlikte. Sayım Sami şimdilik sadece VOLONTE'nin Vegawin'ini okur
(Black Rose köprüsü sonra kurulacak). Vegawin'de kaydı olmayan (ya da kartı pasif olan) model **hata değildir**:
- Kemal: turda sorulmaya devam eder (stok bilinmiyor diye gizlenmez).
- Selin: sitede kalır, fiyat yoksa "Ask price" gösterilir, **gizlenmez**; "mağazada var mı?" sorusu sorulabilir.
- Sadece Vegawin'de kaydı olup toplam adedi 0/eksi olan model gizlenir.
- Sami'nin kod kuralı değişmez (^(\d{3,6}), 0 ile başlayan iç kartlar alınmaz).
Örnek: 3279 (Vegawin'de pasif), 3595 (kartı yok, büyük ihtimalle Black Rose).
