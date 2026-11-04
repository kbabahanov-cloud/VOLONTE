# SAYIM SAMİ — Vegawin → Venom stok köprüsü (VOLONTE)
#
# EN ÖNEMLİ KURAL: Vegawin'de ASLA silme, ekleme, düzenleme yok. Sadece SELECT.
# Kilitler: (1) her sorgu SadeceOku() denetiminden geçer, SELECT dışı her şey reddedilir;
# (2) bağlantı ApplicationIntent=ReadOnly ile açılır; (3) her sorgu bir işlem (transaction)
# içinde çalışır ve sonunda geri alınır (Rollback); (4) veritabanı kullanıcısı zaten sadece okuma.
# Stok: STOKKODU, MALINCINSI, adet (ENVANTER toplamı) ve SATISFIYATI1. Vergi no, TC kimlik no okunmaz.
# 3 Kasım (Patron onayı): ciro, gider ve kâr raporu için alış/satış fiyatı ve giderler de okunur — SADECE Patron'un
# Sami raporlarına gider; başka hiçbir bota, kanala, siteye, Fuat'a/Nuri'ye gitmez.
#
# Kullanım (çift tıklanan .bat dosyaları bunu çağırır):
#   sami.ps1 kurulum   şifreyi sorar (Windows kasasında şifreli saklanır), köprü anahtarı üretir
#   sami.ps1 deneme    bağlantı + tablo sütunları + 5 örnek ürün (Venom'a hiçbir şey göndermez)
#   sami.ps1 baslat    ilk gönderimi yapar, 5 dakikalık görevi kurar
#   sami.ps1 calistir  (görev çalıştırır) 09:00-19:00 arası değişen ürünleri gönderir
#   sami.ps1 durdur    5 dakikalık görevi kaldırır
#   sami.ps1 satis-deneme  bugünün satışlarını (belge tipi 21) okur ve ekrana yazar; hiçbir şey göndermez
#   sami.ps1 durum     görevin durumu + günlüğün son satırları (sorun olursa ekran fotoğrafı Claude'a)

param([string]$Mod = "calistir")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Klasor = $PSScriptRoot
$Ayar = Get-Content (Join-Path $Klasor "ayar.json") -Raw -Encoding UTF8 | ConvertFrom-Json
# Depodaki ayar.json şablondur (adres/kullanıcı gizli kayıtta); sadece paket.sh ile üretilen paketteki ayar çalışır.
if ((Get-Content (Join-Path $Klasor "ayar.json") -Raw -Encoding UTF8) -match 'GIZLI_KAYITTAN') { Write-Host "ayar.json eksik: paket.sh ile üretilen paketi kullanın." -ForegroundColor Red; exit 1 }
if ($Ayar.magaza -notmatch '^[A-Z0-9_]{2,20}$' -or $Ayar.firma -notmatch '^F\d{4}$' -or $Ayar.donem -notmatch '^D\d{4}$') {
  throw "ayar.json hatalı (magaza / firma / donem)."
}
$VeriKlasoru = Join-Path $env:LOCALAPPDATA "Sami"
New-Item -ItemType Directory -Force $VeriKlasoru | Out-Null
$GizliDosya = Join-Path $VeriKlasoru "gizli-$($Ayar.magaza).xml"
$SonDosya = Join-Path $VeriKlasoru "son-$($Ayar.magaza).json"
$Gunluk = Join-Path $VeriKlasoru "gunluk-$($Ayar.magaza).txt"
$GorevAdi = "Sami-$($Ayar.magaza)"

# Tablo adları sabit (firma ve dönem ayar.json'dan; Black Rose'da farklı olabilir).
$T_STOK = "$($Ayar.firma)TBLSTOKLAR"
$T_BIRIM = "$($Ayar.firma)TBLBIRIMLEREX"
$T_DEPO = "$($Ayar.firma)$($Ayar.donem)TBLDEPOENVANTER"
# Merkez depo numarası (VOLONTE: 1; Black Rose'da farklı olabilir → ayar.json "depo"). Sadece tam sayı.
$DEPO = if ($null -ne $Ayar.depo) { [int]$Ayar.depo } else { 1 }
$BAG_ADAYLARI = @("STOKNO", "STOKIND", "STOK_IND", "STOKID", "STOK_ID", "STOK")
$PARTI = 200   # bir gönderimde en fazla ürün
# Köprü sürümü (2 Kasım): kendini güncelleme bununla karşılaştırır. sami/yayinla.sh yeni sürümü Cloudflare'e koyar.
$SURUM = "2026110304"

function Gunluge([string]$m) {
  try {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $Gunluk -Encoding UTF8
    $satir = Get-Content $Gunluk -Encoding UTF8
    if ($satir.Count -gt 2000) { $satir | Select-Object -Last 1000 | Set-Content $Gunluk -Encoding UTF8 }
  } catch { }
}

function Duz([Security.SecureString]$s) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Gizliler {
  if (-not (Test-Path $GizliDosya)) { throw "Önce kurulum.bat çalıştırılmalı (şifre kayıtlı değil)." }
  return Import-Clixml $GizliDosya   # Windows (DPAPI) ile şifreli; sadece bu kullanıcı bu bilgisayarda açabilir
}

# ---- KİLİT 1: sadece SELECT ----
function SadeceOku([string]$sorgu) {
  $t = $sorgu.Trim()
  if ($t -notmatch '^(?i)SELECT\s') { throw "GÜVENLİK: sadece SELECT çalıştırılabilir." }
  $yasak = '(?i)\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|BACKUP|RESTORE|INTO|OPENROWSET|OPENQUERY|OPENDATASOURCE|DBCC|SHUTDOWN|KILL|WAITFOR|USE|DECLARE|SET|BULK|RECONFIGURE)\b'
  if ($t -match $yasak -or $t.Contains(";") -or $t.Contains("--") -or $t.Contains("/*")) { throw "GÜVENLİK: sorguda yasak komut var, çalıştırılmadı." }
}

function Baglanti([string]$sifre) {
  $b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $b["Data Source"] = "$($Ayar.sunucu),$($Ayar.port)"
  $b["Initial Catalog"] = $Ayar.veritabani
  $b["User ID"] = $Ayar.kullanici
  $b["Password"] = $sifre
  $b["Connect Timeout"] = 10
  $b["ApplicationIntent"] = "ReadOnly"   # KİLİT 2
  $b["Application Name"] = "Sami ($($Ayar.magaza), salt okuma)"
  return New-Object System.Data.SqlClient.SqlConnection $b.ConnectionString
}

function Sorgu([string]$sifre, [string]$sql, [hashtable]$p = @{}) {
  SadeceOku $sql
  $bag = Baglanti $sifre
  $bag.Open()
  # KİLİT 3: okuma bir işlem içinde; kasaya kilit koymaz (READ UNCOMMITTED) ve sonunda geri alınır.
  $tx = $bag.BeginTransaction([System.Data.IsolationLevel]::ReadUncommitted)
  try {
    $k = $bag.CreateCommand()
    $k.Transaction = $tx
    $k.CommandText = $sql
    $k.CommandTimeout = 120
    foreach ($ad in $p.Keys) { [void]$k.Parameters.AddWithValue("@$ad", $p[$ad]) }
    $tablo = New-Object System.Data.DataTable
    [void](New-Object System.Data.SqlClient.SqlDataAdapter $k).Fill($tablo)
    return , $tablo
  } finally {
    try { $tx.Rollback() } catch { }
    $bag.Close()
  }
}

function Sutunlar([string]$sifre, [string]$tablo) {
  $t = Sorgu $sifre "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION" @{ t = $tablo }
  return @($t.Rows | ForEach-Object { [string]$_.COLUMN_NAME })
}

function BagSutunu([string[]]$sutunlar, [string]$tablo) {
  foreach ($a in $BAG_ADAYLARI) { if ($sutunlar -contains $a) { return $a } }
  throw "$tablo tablosunda stok kartına bağlanan sütun bulunamadı (aranan: $($BAG_ADAYLARI -join ', '))."
}

function StokSorgusu([string]$sifre) {
  $s = Sutunlar $sifre $T_STOK; $b = Sutunlar $sifre $T_BIRIM; $d = Sutunlar $sifre $T_DEPO
  foreach ($gerekli in @(@($s, $T_STOK, @("IND", "STOKKODU", "MALINCINSI", "STATUS")), @($b, $T_BIRIM, @("SATISFIYATI1")), @($d, $T_DEPO, @("ENVANTER", "DEPO", "BELGETIPI")))) {
    foreach ($sutun in $gerekli[2]) { if ($gerekli[0] -notcontains $sutun) { throw "$($gerekli[1]) tablosunda $sutun sütunu yok." } }
  }
  $bb = BagSutunu $b $T_BIRIM
  $db = BagSutunu $d $T_DEPO
  $sql = "SELECT S.STOKKODU AS KOD, S.MALINCINSI AS AD, " +
    "(SELECT TOP 1 B.SATISFIYATI1 FROM $T_BIRIM B WHERE B.$bb = S.IND) AS FIYAT, " +
    "(SELECT SUM(E.ENVANTER) FROM $T_DEPO E WHERE E.$db = S.IND AND E.DEPO = $DEPO AND (E.BELGETIPI IS NULL OR E.BELGETIPI <> 67)) AS ADET " +
    "FROM $T_STOK S WHERE S.STATUS = 1 AND S.IND >= 100"
  return @{ sql = $sql; birimBag = $bb; depoBag = $db; stok = $s; birim = $b; depo = $d }
}

# ---- Günlük satış (fabrika eksik listesi, 29 Ekim) ----
# Belge tipi 21 = satış faturası. Stok hareketlerinden (depo envanter) o günün satış miktarı model başına toplanır.
# Sadece kod ve adet okunur; fiyat, maliyet, müşteri okunmaz. Yine sadece SELECT (aynı kilitler).
$TARIH_ADAYLARI = @("TARIH", "ISLEMTARIHI", "BELGETARIHI", "FISTARIHI", "EVRAKTARIHI", "KAYITTARIHI")
function SatisSorgusu([string]$sifre) {
  $d = Sutunlar $sifre $T_DEPO
  foreach ($sutun in @("ENVANTER", "DEPO", "BELGETIPI")) { if ($d -notcontains $sutun) { throw "$T_DEPO tablosunda $sutun sütunu yok." } }
  $tarih = $null
  foreach ($a in $TARIH_ADAYLARI) { if ($d -contains $a) { $tarih = $a; break } }
  if (-not $tarih) { throw "$T_DEPO tablosunda tarih sütunu bulunamadı. Sütunlar: $($d -join ', ')" }
  $db = BagSutunu $d $T_DEPO
  $sql = "SELECT S.STOKKODU AS KOD, SUM(E.ENVANTER) AS MIKTAR FROM $T_DEPO E INNER JOIN $T_STOK S ON E.$db = S.IND " +
    "WHERE E.BELGETIPI = 21 AND E.DEPO = $DEPO AND E.$tarih >= @bas AND E.$tarih < @bit GROUP BY S.STOKKODU"
  return @{ sql = $sql; tarih = $tarih; sutunlar = $d }
}
function Satislar([string]$sifre, [datetime]$gun) {
  $q = SatisSorgusu $sifre
  $tablo = Sorgu $sifre $q.sql @{ bas = $gun.Date; bit = $gun.Date.AddDays(1) }
  $sonuc = @{}
  foreach ($r in $tablo.Rows) {
    $kod = ModelKodu ([string]$r.KOD)
    if (-not $kod) { continue }
    $m = Num $r.MIKTAR; if ($null -eq $m) { continue }
    $m = [Math]::Abs($m)
    if ($sonuc.ContainsKey($kod)) { $sonuc[$kod] += $m } else { $sonuc[$kod] = $m }
  }
  return $sonuc
}
function SatisGonder([string]$anahtar, [hashtable]$satis, [datetime]$gun) {
  $kalemler = @($satis.Keys | ForEach-Object { @{ kod = $_; adet = $satis[$_] } })
  $govde = @{ gun = $gun.ToString("yyyy-MM-dd"); kalemler = [object[]]$kalemler } | ConvertTo-Json -Depth 4 -Compress
  Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/satis" -TimeoutSec 60 `
    -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" } `
    -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($govde)) | Out-Null
}

# ---- Cari hesap bakiyeleri (cuma mutabakatı, 31 Ekim; bağ düzeltmesi 2 Kasım) — SADECE SELECT ----
# Black Rose hesapları (adında BLACK ROSE / BLACKROSE geçen cari kartlar): kart BAKIYE sütunu + her dönemin cari hareket
# tablolarındaki BORC/ALACAK toplamları ayrı ayrı okunur; hangisinin doğru kaynak olduğu karşılaştırılarak seçilir.
# Hesap eşleştirme anahtarı: sondaki sayı (000 → 00, 15, 20, 25). Özel kodunda BLACK geçen hareketler (ör. ödemeler) ayrıca.
# 2 Kasım: Black Rose Vegawin'de kart BAKIYE hep 0 ve hareket tablolarında CARIIND yok (FIRMANO var). Bağ artık
# denenerek bulunur: hareket sütunu (FIRMANO …) × kart sütunu (IND, FIRMAKODU …) çiftlerinden Black Rose hesaplarına en çok
# hareket eşleşen seçilir; tek değerli sütun (ör. firma numarası) bağ sayılmaz. Para birimi dolar.
$CARI_BAG = @("CARIIND", "CARINO", "CARIID", "CARI_IND", "CARIKARTIND", "CARIKARTNO", "CARIKART", "CARI", "FIRMAIND", "FIRMANO", "FIRMAID", "FIRMA_IND", "HESAPIND", "HESAPNO")
# Hareket satırında (varsa) okunan ek sütunlar: özel kod, açıklama, evrak/belge türü (ödeme ↔ mal ayrımı için)
$HAREKET_EK = @("OZELKOD", "ACIKLAMA", "EVRAKNO", "BELGENO", "BELGEIND", "ISLEMIND", "BELGETIPI", "ISLEMTIPI")
$KART_ANAHTAR = @("IND", "FIRMANO", "FIRMAKODU", "CARIKODU", "CARINO", "KOD", "HESAPKODU")
function HesapAnahtari([string]$ad) {
  $a = $ad.ToUpperInvariant() -replace '\s', ''
  if ($a -notmatch 'BLACKROSE') { return $null }
  if ($a -match '(\d+)$') { return ('{0:D2}' -f [int]$Matches[1]) }
  return $null
}
function TarihYaz($v) { if ($null -eq $v -or $v -is [DBNull]) { return $null } return ([datetime]$v).ToString("yyyy-MM-dd") }
function Deger($v) { if ($null -eq $v -or $v -is [DBNull]) { return $null } $s = ([string]$v).Trim(); if ($s) { return $s } return $null }
# Hareket tablosunu cari karta bağlayan sütun çifti: { hareket = "FIRMANO"; kart = "IND"; n = eşleşen hareket; farkli = farklı değer }
function CariBagBul([string]$sifre, [string]$tablo, [string[]]$sut, $hesaplar) {
  $en = $null
  foreach ($a in $CARI_BAG) {
    if ($sut -notcontains $a) { continue }
    try { $farkli = [int]((Sorgu $sifre "SELECT COUNT(DISTINCT [$a]) AS D FROM [$tablo]").Rows[0].D) } catch { continue }
    if ($farkli -lt 2) { continue }
    foreach ($ks in $KART_ANAHTAR) {
      $degerler = @($hesaplar | ForEach-Object { $_.anahtarlar[$ks] } | Where-Object { $_ })
      if (-not $degerler.Count) { continue }
      $n = 0
      foreach ($d in $degerler) { try { $n += [int]((Sorgu $sifre "SELECT COUNT(*) AS N FROM [$tablo] WHERE [$a] = @i" @{ i = $d }).Rows[0].N) } catch { } }
      if ($n -gt 0 -and ($null -eq $en -or $n -gt $en.n)) { $en = @{ hareket = $a; kart = $ks; n = $n; farkli = $farkli } }
    }
  }
  return $en
}
function CariBakiyeleri([string]$sifre) {
  $T_CARI = "$($Ayar.firma)TBLCARI"
  $kartSutun = Sutunlar $sifre $T_CARI
  if ($kartSutun -notcontains "IND") { throw "$T_CARI tablosunda IND sütunu yok. Sütunlar: $($kartSutun -join ', ')" }
  $metinler = Sorgu $sifre "SELECT COLUMN_NAME AS C FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t AND DATA_TYPE IN ('varchar','nvarchar','char','nchar')" @{ t = $T_CARI }
  $adSutun = $null
  foreach ($c in $metinler.Rows) {
    $sutun = [string]$c.C
    try { $n = (Sorgu $sifre "SELECT COUNT(*) AS N FROM [$T_CARI] WHERE REPLACE([$sutun], ' ', '') LIKE @b" @{ b = "%BLACKROSE%" }).Rows[0].N } catch { $n = 0 }
    if ($n -gt 0) { $adSutun = $sutun; break }
  }
  if (-not $adSutun) { throw "$T_CARI tablosunda BLACK ROSE adlı hesap bulunamadı." }
  $bakiyeVar = $kartSutun -contains "BAKIYE"
  $kartAnahtar = @($KART_ANAHTAR | Where-Object { $kartSutun -contains $_ })
  $ekler = ($kartAnahtar | ForEach-Object { ", [$_] AS [K_$_]" }) -join ""
  $sec = "SELECT [$adSutun] AS AD$ekler" + $(if ($bakiyeVar) { ", BAKIYE" } else { "" }) + " FROM [$T_CARI] WHERE REPLACE([$adSutun], ' ', '') LIKE @b"
  $sonuc = @{}
  foreach ($k in (Sorgu $sifre $sec @{ b = "%BLACKROSE%" }).Rows) {
    $an = HesapAnahtari ([string]$k.AD)
    if (-not $an) { continue }
    $anahtarlar = @{}
    foreach ($s in $kartAnahtar) { $v = Deger $k["K_$s"]; if ($v) { $anahtarlar[$s] = $v } }
    $sonuc[$an] = @{ anahtar = $an; ad = ([string]$k.AD).Trim(); ind = $anahtarlar["IND"]; anahtarlar = $anahtarlar; kart = $(if ($bakiyeVar) { Num $k.BAKIYE } else { $null }); donemler = @{} }
  }
  $tablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a ORDER BY TABLE_NAME" @{ a = "$($Ayar.firma)D____TBLCARI%HAREKET%" }
  $notlar = @()
  $hareketler = @()
  $baglar = @()
  $ozel = @()
  foreach ($t in $tablolar.Rows) {
    $ad = [string]$t.AD
    $sut = Sutunlar $sifre $ad
    if (($sut -notcontains "BORC") -or ($sut -notcontains "ALACAK")) { $notlar += "${ad}: BORC/ALACAK sütunu yok (sütunlar: $($sut -join ', '))"; continue }
    $bag = CariBagBul $sifre $ad $sut @($sonuc.Values)
    if (-not $bag) {
      # Teşhis (sadece ekrana): aday sütunların kaç farklı değeri var, örnekler neler
      $ipucu = @()
      foreach ($a in $CARI_BAG) {
        if ($sut -notcontains $a) { continue }
        try {
          $farkli = [int]((Sorgu $sifre "SELECT COUNT(DISTINCT [$a]) AS D FROM [$ad]").Rows[0].D)
          $ornek = ((Sorgu $sifre "SELECT DISTINCT TOP 5 [$a] AS V FROM [$ad]").Rows | ForEach-Object { ([string]$_.V).Trim() }) -join ", "
          $ipucu += "$a $farkli farklı değer (örnek: $ornek)"
        } catch { $ipucu += "$a okunamadı" }
      }
      $notlar += "${ad}: Black Rose hesaplarına bağlanan hareket yok. $($ipucu -join '; ') · sütunlar: $($sut -join ', ')"
      continue
    }
    $etiket = $ad.Substring($Ayar.firma.Length)   # ör. D0005TBLCARIGENELHAREKET
    $baglar += @{ tablo = $etiket; hareket = $bag.hareket; kart = $bag.kart; n = $bag.n; farkli = $bag.farkli }
    $tarih = $null; foreach ($a in $TARIH_ADAYLARI) { if ($sut -contains $a) { $tarih = $a; break } }
    $sira = @(); if ($tarih) { $sira += "[$tarih] DESC" }; if ($sut -contains "IND") { $sira += "IND DESC" }
    foreach ($h in $sonuc.Values) {
      $d = $h.anahtarlar[$bag.kart]
      if (-not $d) { continue }
      $q = "SELECT COUNT(*) AS N, SUM(BORC) AS B, SUM(ALACAK) AS A" + $(if ($tarih) { ", MIN([$tarih]) AS ILK, MAX([$tarih]) AS SON" } else { "" }) + " FROM [$ad] WHERE [$($bag.hareket)] = @i"
      $r = (Sorgu $sifre $q @{ i = $d }).Rows[0]
      $don = @{ n = [int]$r.N; borc = (Num $r.B); alacak = (Num $r.A); ilk = $(if ($tarih) { TarihYaz $r.ILK } else { $null }); son = $(if ($tarih) { TarihYaz $r.SON } else { $null }) }
      # Hareket satırında yürüyen BAKIYE varsa son satırınki (karşılaştırma için)
      if ($sut -contains "BAKIYE" -and $sira.Count -and $don.n -gt 0) {
        try { $don.sonBakiye = Num (Sorgu $sifre "SELECT TOP 1 BAKIYE AS K FROM [$ad] WHERE [$($bag.hareket)] = @i ORDER BY $($sira -join ', ')" @{ i = $d }).Rows[0].K } catch { }
      }
      # Yıl yıl toplamlar (2 Kasım, Fuat'a "yapılan işin özeti"): sadece GENEL tablo; ödeme (özel kod/açıklama "BORC VERD")
      # ayrı toplanır; hesabın bu tablodaki ilk günü (devir kaydı) ayrıca gönderilir ki yıl toplamından düşülebilsin.
      if ($ad -like "*TBLCARIGENELHAREKET" -and $tarih -and $don.n -gt 0) {
        $kosul = @(); foreach ($s in @("OZELKOD", "ACIKLAMA")) { if ($sut -contains $s) { $kosul += "[$s] LIKE @o" } }
        $odeme = if ($kosul.Count) { $kosul -join " OR " } else { "1 = 0" }
        $yq = "SELECT YEAR([$tarih]) AS Y, COUNT(*) AS N, SUM(BORC) AS B, SUM(ALACAK) AS A, SUM(CASE WHEN $odeme THEN BORC ELSE 0 END) AS OB, SUM(CASE WHEN $odeme THEN ALACAK ELSE 0 END) AS OA FROM [$ad] WHERE [$($bag.hareket)] = @i GROUP BY YEAR([$tarih])"
        $don.yillar = @{}
        foreach ($y in (Sorgu $sifre $yq @{ i = $d; o = "%BOR_ VERD%" }).Rows) { $don.yillar[[string]$y.Y] = @{ n = [int]$y.N; b = (Num $y.B); a = (Num $y.A); ob = (Num $y.OB); oa = (Num $y.OA) } }
        $ilkG = (Sorgu $sifre "SELECT MIN([$tarih]) AS T FROM [$ad] WHERE [$($bag.hareket)] = @i" @{ i = $d }).Rows[0].T
        if ($ilkG -isnot [DBNull]) {
          $g0 = ([datetime]$ilkG).Date
          $ig = (Sorgu $sifre "SELECT COUNT(*) AS N, SUM(BORC) AS B, SUM(ALACAK) AS A FROM [$ad] WHERE [$($bag.hareket)] = @i AND [$tarih] >= @t1 AND [$tarih] < @t2" @{ i = $d; t1 = $g0; t2 = $g0.AddDays(1) }).Rows[0]
          $don.ilkGun = @{ tarih = $g0.ToString("yyyy-MM-dd"); n = [int]$ig.N; b = (Num $ig.B); a = (Num $ig.A) }
        }
      }
      $h.donemler[$etiket] = $don
    }
    # Son 60 günün tek tek hareketleri (2 Kasım): ödemeleri, gelen malı ve iki defter farkının sebebini Sami kendisi bulsun.
    # Sadece GENEL hareket tablosundan (HAREKETLERI ile birebir aynı); sadece Black Rose hesapları; sadece SELECT.
    if ($ad -like "*TBLCARIGENELHAREKET" -and $tarih) {
      $ek = @($HAREKET_EK | Where-Object { $sut -contains $_ })
      $secim = "IND, [$tarih] AS TARIH, BORC, ALACAK" + (($ek | ForEach-Object { ", [$_] AS [$_]" }) -join "")
      foreach ($h in $sonuc.Values) {
        $d = $h.anahtarlar[$bag.kart]
        if (-not $d) { continue }
        foreach ($x in (Sorgu $sifre "SELECT TOP 500 $secim FROM [$ad] WHERE [$($bag.hareket)] = @i AND [$tarih] >= @t ORDER BY [$tarih]" @{ i = $d; t = (Get-Date).Date.AddDays(-60) }).Rows) {
          $kayit = @{ hesap = $h.anahtar; tablo = $etiket; ind = [string]$x.IND; tarih = (TarihYaz $x.TARIH); borc = (Num $x.BORC); alacak = (Num $x.ALACAK) }
          foreach ($s in $ek) { $v = Deger $x[$s]; if ($v) { $kayit[$s.ToLowerInvariant()] = $v } }
          $hareketler += $kayit
        }
      }
    }
    if ($sut -contains "OZELKOD") {
      foreach ($x in (Sorgu $sifre "SELECT OZELKOD AS K, [$($bag.hareket)] AS C, COUNT(*) AS N, SUM(BORC) AS B, SUM(ALACAK) AS A FROM [$ad] WHERE OZELKOD LIKE @b GROUP BY OZELKOD, [$($bag.hareket)]" @{ b = "%BLACK%" }).Rows) {
        $cariAd = ""
        try { $cariAd = ([string](Sorgu $sifre "SELECT [$adSutun] AS AD FROM [$T_CARI] WHERE [$($bag.kart)] = @i" @{ i = [string]$x.C }).Rows[0].AD).Trim() } catch { }
        $ozel += @{ tablo = $etiket; kod = ([string]$x.K).Trim(); cari = $cariAd; n = [int]$x.N; borc = (Num $x.B); alacak = (Num $x.A) }
      }
    }
  }
  $liste = @($sonuc.Values | Sort-Object { $_.anahtar } | ForEach-Object { @{ anahtar = $_.anahtar; ad = $_.ad; ind = $_.ind; kart = $_.kart; donemler = $_.donemler } })
  $kartlar = @($sonuc.Values | Sort-Object { $_.anahtar } | ForEach-Object { $x = $_; "$($x.ad): " + (($x.anahtarlar.Keys | Sort-Object | ForEach-Object { "$_=$($x.anahtarlar[$_])" }) -join " ") })
  return @{ hesaplar = $liste; ozel = $ozel; notlar = $notlar; baglar = $baglar; kartlar = $kartlar; adSutun = $adSutun; kartBakiye = $bakiyeVar; hareketler = $hareketler }
}
# ---- Yıllık ciro (2 Kasım; Patron: her mağaza AYRI, toplam yok, sadece Patron görür) — SADECE SELECT ----
# Satış fatura başlıkları (adında SATFAT + BASLIK, tüm dönemler), iptaller hariç: yıl × belge türü × para birimi → adet, TUTAR,
# ARATOPLAM. Alış (ALF), fatura satırları, maliyet/alış fiyatı/kâr ASLA okunmaz. Türlerin anlamı (satış/iade) Venom'da belirlenir.
function CiroOku([string]$sifre) {
  $ciroTablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a ORDER BY TABLE_NAME" @{ a = "$($Ayar.firma)D____TBLSATFAT%BASLIK%" }
  $ciroSatir = @()
  foreach ($ct in $ciroTablolar.Rows) {
    $ctAd = [string]$ct.AD
    $ctSut = @(Sutunlar $sifre $ctAd | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
    if (($ctSut -notcontains "TARIH") -or ($ctSut -notcontains "BELGETIPI")) { continue }
    $ctTutar = @(@("TUTAR", "ARATOPLAM") | Where-Object { $ctSut -contains $_ })
    if (-not $ctTutar.Count) { continue }
    $ctDoviz = if ($ctSut -contains "PARABIRIMI") { "PARABIRIMI" } else { $null }
    $ctTopla = ($ctTutar | ForEach-Object { ", SUM(CAST([$_] AS FLOAT)) AS [$_]" }) -join ""
    # Sadece satış faturası (21); satış tablosundaki diğer türler (ör. 23 alıştan iade) alış tarafıdır → okunmaz
    $ctNerede = " WHERE BELGETIPI = 21" + $(if ($ctSut -contains "IPTAL") { " AND ISNULL(IPTAL, 0) = 0" } else { "" })
    $ctSorgu = "SELECT YEAR(TARIH) AS Y, BELGETIPI AS T" + $(if ($ctDoviz) { ", [$ctDoviz] AS D" } else { "" }) + ", COUNT(*) AS N$ctTopla FROM [$ctAd]$ctNerede GROUP BY YEAR(TARIH), BELGETIPI" + $(if ($ctDoviz) { ", [$ctDoviz]" } else { "" })
    foreach ($cx in (Sorgu $sifre $ctSorgu).Rows) {
      $ciroSatir += @{ tablo = $ctAd.Substring($Ayar.firma.Length); yil = [int]$cx.Y; tur = [string]$cx.T; doviz = $(if ($ctDoviz) { ([string]$cx.D).Trim() } else { "" }); n = [int]$cx.N
        tutar = $(if ($ctTutar -contains "TUTAR") { Num $cx.TUTAR } else { $null }); aratoplam = $(if ($ctTutar -contains "ARATOPLAM") { Num $cx.ARATOPLAM } else { $null }) }
    }
  }
  # Satıştan iade (2 Kasım): Vega iadeyi alış fatura tablosunda BELGETIPI 22 olarak tutar. SADECE 22 okunur;
  # alış faturaları (20), alış fiyatı ve maliyet ASLA okunmaz.
  $iadeTablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a ORDER BY TABLE_NAME" @{ a = "$($Ayar.firma)D____TBLALFAT%BASLIK%" }
  foreach ($it in $iadeTablolar.Rows) {
    $itAd = [string]$it.AD
    $itSut = @(Sutunlar $sifre $itAd | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
    if (($itSut -notcontains "TARIH") -or ($itSut -notcontains "BELGETIPI") -or ($itSut -notcontains "TUTAR")) { continue }
    $itDoviz = if ($itSut -contains "PARABIRIMI") { "PARABIRIMI" } else { $null }
    $itIptal = if ($itSut -contains "IPTAL") { " AND ISNULL(IPTAL, 0) = 0" } else { "" }
    $itSorgu = "SELECT YEAR(TARIH) AS Y" + $(if ($itDoviz) { ", [$itDoviz] AS D" } else { "" }) + ", COUNT(*) AS N, SUM(CAST(TUTAR AS FLOAT)) AS TUTAR FROM [$itAd] WHERE BELGETIPI = 22$itIptal GROUP BY YEAR(TARIH)" + $(if ($itDoviz) { ", [$itDoviz]" } else { "" })
    foreach ($ix in (Sorgu $sifre $itSorgu).Rows) {
      $ciroSatir += @{ tablo = $itAd.Substring($Ayar.firma.Length); yil = [int]$ix.Y; tur = "22"; kaynak = "iade"; doviz = $(if ($itDoviz) { ([string]$ix.D).Trim() } else { "" }); n = [int]$ix.N; tutar = (Num $ix.TUTAR); aratoplam = $null }
    }
  }
  return $ciroSatir
}
# ---- Gider keşfi (3 Kasım, Patron: giderler nerede?) — SADECE SELECT, sürüm başına bir kez ----
# Adında MASRAF/KASA/GIDER/BANKA/MUHASEBE/PERSONEL/MAAS/HESAP/ODEME/TEDIYE geçen tablolar: satır sayısı, sütun ADLARI, son 13
# ayın ay ay adet + tutar toplamları ve kısa kod sütunlarının (KOD/TIP/TUR/GRUP) dağılımı. Kişi adı, ünvan, açıklama, TC,
# telefon, adres sütunlarının İÇERİĞİ okunmaz; adında PERSONEL/MAAS geçen tablolarda hiçbir metin değeri okunmaz.
function GiderKesif([string]$sifre) {
  $gkDesen = @("%MASRAF%", "%KASA%", "%GIDER%", "%BANKA%", "%MUHASEBE%", "%PERSONEL%", "%MAAS%", "%HESAP%", "%ODEME%", "%TEDIYE%")
  $gkKosul = ($gkDesen | ForEach-Object { "TABLE_NAME LIKE '$($Ayar.firma)$_'" }) -join " OR "
  $gkTablolar = Sorgu $sifre "SELECT TOP 80 TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE $gkKosul ORDER BY TABLE_NAME"
  $gkTarihAday = @("TARIH", "ISLEMTARIHI", "BELGETARIHI", "FISTARIHI", "EVRAKTARIHI", "KAYITTARIHI")
  $gkTutarAday = @("TUTAR", "BORC", "ALACAK", "GIRIS", "CIKIS", "NETTUTAR", "TOPLAM", "DOVIZTUTAR")
  $gkYasak = '(AD|ADI|UNVAN|ACIKLAMA|ISIM|PERSONEL|TC|TEL|ADRES|MAIL|IBAN|SOYAD|NOT)'
  $gkSonuc = @()
  foreach ($gt in $gkTablolar.Rows) {
    $gtAd = [string]$gt.AD
    $gtKayit = @{ tablo = $gtAd.Substring($Ayar.firma.Length); satir = $null; sutunlar = @(); aylar = @(); kodlar = @() }
    try {
      $gtSut = @(Sutunlar $sifre $gtAd | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
      $gtKayit.sutunlar = $gtSut
      $gtKayit.satir = [int]((Sorgu $sifre "SELECT COUNT(*) AS N FROM [$gtAd]").Rows[0].N)
      $gtTarih = $gkTarihAday | Where-Object { $gtSut -contains $_ } | Select-Object -First 1
      $gtTutar = @($gkTutarAday | Where-Object { $gtSut -contains $_ })
      if ($gtKayit.satir -gt 0 -and $gtTarih) {
        $gtTopla = ($gtTutar | ForEach-Object { ", SUM(CAST([$_] AS FLOAT)) AS [$_]" }) -join ""
        foreach ($gx in (Sorgu $sifre "SELECT YEAR([$gtTarih]) AS Y, MONTH([$gtTarih]) AS M, COUNT(*) AS N$gtTopla FROM [$gtAd] WHERE [$gtTarih] >= @t GROUP BY YEAR([$gtTarih]), MONTH([$gtTarih]) ORDER BY YEAR([$gtTarih]), MONTH([$gtTarih])" @{ t = (Get-Date).Date.AddMonths(-13) }).Rows) {
          $gxKayit = @{ ay = ("{0}-{1:D2}" -f $gx.Y, [int]$gx.M); n = [int]$gx.N }
          foreach ($s in $gtTutar) { $gxKayit[$s.ToLowerInvariant()] = (Num $gx[$s]) }
          $gtKayit.aylar += $gxKayit
        }
        if ($gtAd -notmatch 'PERSONEL|MAAS') {
          $gtKod = @($gtSut | Where-Object { ($_ -match 'KOD|TIP|TUR|GRUP') -and ($_ -notmatch $gkYasak) } | Select-Object -First 6)
          foreach ($gk in $gtKod) {
            try {
              $gkSay = [int]((Sorgu $sifre "SELECT COUNT(DISTINCT [$gk]) AS D FROM [$gtAd] WHERE [$gtTarih] >= @t" @{ t = (Get-Date).Date.AddMonths(-13) }).Rows[0].D)
              if ($gkSay -lt 1 -or $gkSay -gt 40) { continue }
              $gkToplaSql = $(if ($gtTutar.Count) { ", SUM(CAST([$($gtTutar[0])] AS FLOAT)) AS T" } else { "" })
              $gkDeger = @()
              foreach ($gv in (Sorgu $sifre "SELECT [$gk] AS V, COUNT(*) AS N$gkToplaSql FROM [$gtAd] WHERE [$gtTarih] >= @t GROUP BY [$gk] ORDER BY COUNT(*) DESC" @{ t = (Get-Date).Date.AddMonths(-13) }).Rows) {
                $gkDeger += @{ v = ([string]$gv.V).Trim(); n = [int]$gv.N; t = $(if ($gtTutar.Count) { Num $gv.T } else { $null }) }
              }
              $gtKayit.kodlar += @{ sutun = $gk; tutarSutunu = $(if ($gtTutar.Count) { $gtTutar[0] } else { $null }); degerler = $gkDeger }
            } catch { }
          }
        }
      }
    } catch { $gtKayit.hata = $_.Exception.Message.Substring(0, [Math]::Min(150, $_.Exception.Message.Length)) }
    $gkSonuc += $gtKayit
  }
  return $gkSonuc
}
# ---- Mali keşif (3 Kasım, Patron onayı: alış fiyatı + satış fiyatı + gider → SADECE Patron'un /kar raporu) ----
# Stok kartı ve birim tablolarının sütun ADLARI + fiyat sütunlarının dolu kart sayısı/ortalaması (kart kart değer okunmaz);
# satış/alış fatura satırlarının başlığa hangi sütunla bağlandığı (eşleşme sayısı) ve yıllık miktar/tutar/alış-fiyatlı tutar.
function MaliKesif([string]$sifre) {
  $mk = @{ stokKart = @(); hareket = @() }
  foreach ($mt in @($T_STOK, $T_BIRIM)) {
    try {
      $mtSut = @(Sutunlar $sifre $mt | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
      $mtFiyat = @()
      foreach ($fs in @($mtSut | Where-Object { $_ -match 'ALIS|MALIYET|FIYAT|AFIYAT|MLYT' } | Select-Object -First 12)) {
        try { $fr = (Sorgu $sifre "SELECT COUNT(*) AS N, AVG(CAST([$fs] AS FLOAT)) AS O FROM [$mt] WHERE ISNULL([$fs], 0) <> 0").Rows[0]; $mtFiyat += @{ sutun = $fs; dolu = [int]$fr.N; ortalama = (Num $fr.O) } } catch { }
      }
      $mk.stokKart += @{ tablo = $mt.Substring($Ayar.firma.Length); sutunlar = $mtSut; fiyatSutunlari = $mtFiyat }
    } catch { }
  }
  $mhTablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a OR TABLE_NAME LIKE @b ORDER BY TABLE_NAME" @{ a = "$($Ayar.firma)D____TBLSATFATHAREKET"; b = "$($Ayar.firma)D____TBLALFATHAREKET" }
  foreach ($mh in $mhTablolar.Rows) {
    $mhAd = [string]$mh.AD
    $mhBas = $mhAd -replace 'HAREKET$', 'BASLIK'
    $mhKayit = @{ tablo = $mhAd.Substring($Ayar.firma.Length); baglar = @(); yillar = @() }
    try {
      $mhSut = @(Sutunlar $sifre $mhAd | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
      $mhKayit.satir = [int]((Sorgu $sifre "SELECT COUNT(*) AS N FROM [$mhAd]").Rows[0].N)
      if ($mhKayit.satir -eq 0) { $mk.hareket += $mhKayit; continue }
      foreach ($mb in @("EVRAKNO", "BELGEIND", "BASLIKIND", "FATURAIND", "FISIND", "DETAY", "BELGENO")) {
        if ($mhSut -notcontains $mb) { continue }
        try { $mkEs = [int]((Sorgu $sifre "SELECT COUNT(*) AS N FROM [$mhAd] H WHERE H.[$mb] IN (SELECT B.IND FROM [$mhBas] B)").Rows[0].N); $mhKayit.baglar += @{ sutun = $mb; eslesen = $mkEs } } catch { }
      }
      $mhPara = if ($mhSut -contains "PARABIRIMI") { "PARABIRIMI" } else { $null }
      $mhSec = "SELECT YEAR(TARIH) AS Y" + $(if ($mhPara) { ", [$mhPara] AS D" } else { "" }) + ", COUNT(*) AS N, SUM(CAST(MIKTAR AS FLOAT)) AS MIKTAR" +
        $(if ($mhSut -contains "GERCEKTOPLAM") { ", SUM(CAST(GERCEKTOPLAM AS FLOAT)) AS GERCEKTOPLAM" } else { "" }) +
        $(if ($mhSut -contains "FIYATI") { ", SUM(CAST(MIKTAR AS FLOAT) * CAST(FIYATI AS FLOAT)) AS MFIYATI" } else { "" }) +
        $(if ($mhSut -contains "AFIYATI") { ", SUM(CAST(MIKTAR AS FLOAT) * CAST(AFIYATI AS FLOAT)) AS MAFIYATI, SUM(CASE WHEN ISNULL(AFIYATI, 0) <> 0 THEN 1 ELSE 0 END) AS AFDOLU" } else { "" }) +
        " FROM [$mhAd] GROUP BY YEAR(TARIH)" + $(if ($mhPara) { ", [$mhPara]" } else { "" })
      foreach ($my in (Sorgu $sifre $mhSec).Rows) {
        $myK = @{ yil = [int]$my.Y; n = [int]$my.N; miktar = (Num $my.MIKTAR) }
        if ($mhPara) { $myK.doviz = ([string]$my.D).Trim() }
        foreach ($s in @("GERCEKTOPLAM", "MFIYATI", "MAFIYATI", "AFDOLU")) { if ($my.Table.Columns.Contains($s)) { $myK[$s.ToLowerInvariant()] = (Num $my[$s]) } }
        $mhKayit.yillar += $myK
      }
    } catch { $mhKayit.hata = $_.Exception.Message.Substring(0, [Math]::Min(150, $_.Exception.Message.Length)) }
    $mk.hareket += $mhKayit
  }
  return $mk
}
function GiderKesifGonder([string]$anahtar, $tablolar, $mali) {
  $gkGovde = @{ zaman = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()); surum = $SURUM; tablolar = [object[]]$tablolar; mali = $mali } | ConvertTo-Json -Depth 8 -Compress
  Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/gider-kesif" -TimeoutSec 90 `
    -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" } `
    -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($gkGovde)) | Out-Null
}

function CiroGonder([string]$anahtar, $satirlar) {
  $ciroGovde = @{ zaman = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()); satirlar = [object[]]$satirlar } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/ciro" -TimeoutSec 60 `
    -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" } `
    -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($ciroGovde)) | Out-Null
}

function CariGonder([string]$anahtar, $c) {
  $govde = @{ zaman = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()); hesaplar = [object[]]$c.hesaplar; ozel = [object[]]$c.ozel; baglar = [object[]]$c.baglar; hareketler = [object[]]$c.hareketler; kartBakiye = $c.kartBakiye; birim = "USD" } | ConvertTo-Json -Depth 8 -Compress
  Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/cari" -TimeoutSec 60 `
    -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" } `
    -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($govde)) | Out-Null
}

# ---- Kendini güncelleme (2 Kasım, Patron: "bir daha zip açılmasın") ----
# Saatte bir Venom'a (Cloudflare) "yeni sürüm var mı" diye sorar (köprü anahtarıyla, HTTPS). Varsa listedeki dosyaları indirir;
# her dosyanın SHA-256 özeti listedekiyle tutmazsa, dosya adı beklenmedikse ya da yeni sami.ps1'de yazım hatası varsa HİÇBİR
# şeyi değiştirmez. Kurulumda eski dosya ".eski" olarak saklanır. ayar.json ve şifre kaydına asla dokunmaz.
function KendiniGuncelle([string]$anahtar) {
  $basliklar = @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" }
  $govde = [Text.Encoding]::UTF8.GetBytes((@{ surum = $SURUM } | ConvertTo-Json -Compress))
  $liste = Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/surum" -TimeoutSec 30 -Headers $basliklar -ContentType "application/json; charset=utf-8" -Body $govde
  if (-not $liste -or -not $liste.surum -or [string]$liste.surum -le $SURUM) { return $null }
  $indirilen = @{}
  foreach ($dosya in $liste.dosyalar.PSObject.Properties) {
    $dad = [string]$dosya.Name
    if ($dad -notmatch '^[A-Za-z0-9._-]+\.(ps1|bat|vbs)$' -or $dad -like "ayar*") { throw "beklenmeyen dosya adı: $dad" }
    $istek = [Text.Encoding]::UTF8.GetBytes((@{ ad = $dad } | ConvertTo-Json -Compress))
    $cevap = Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru/dosya" -TimeoutSec 60 -Headers $basliklar -ContentType "application/json; charset=utf-8" -Body $istek
    $bayt = [Convert]::FromBase64String([string]$cevap.b64)
    $ozet = -join ((New-Object Security.Cryptography.SHA256Managed).ComputeHash($bayt) | ForEach-Object { $_.ToString("x2") })
    if ($ozet -ne [string]$dosya.Value) { throw "özet tutmadı: $dad" }
    $indirilen[$dad] = $bayt
  }
  if ($indirilen.ContainsKey("sami.ps1")) {
    $yeniMetin = [Text.Encoding]::UTF8.GetString($indirilen["sami.ps1"]); $yHata = $null; $yParca = $null
    [void][System.Management.Automation.Language.Parser]::ParseInput($yeniMetin, [ref]$yParca, [ref]$yHata)
    if ($yHata.Count) { throw "yeni sami.ps1 yazım hatası içeriyor, kurulmadı" }
  }
  foreach ($dad in $indirilen.Keys) {
    $hedef = Join-Path $Klasor $dad
    if (Test-Path $hedef) { Copy-Item $hedef "$hedef.eski" -Force }
    [IO.File]::WriteAllBytes("$hedef.yeni", $indirilen[$dad])
    Move-Item "$hedef.yeni" $hedef -Force
  }
  return [string]$liste.surum
}

# Vegawin kodundaki ek (ör. "3194B20" → "3194") iç bilgidir, dışarı gitmez.
function ModelKodu([string]$kod) {
  $k = "$kod".Trim().ToUpperInvariant()
  if ($k -match $Ayar.kodKalibi) {
    if ($Matches[1] -like "0*") { return $null }   # "0000", "001", "002" gibi iç kartlar model değil (30 Ekim)
    return $Matches[1]
  }
  return $null   # kalıba uymayan kod gönderilmez
}

function Num($v) { if ($v -is [DBNull] -or $null -eq $v) { return $null } return [double]$v }

# Aynı model koduna düşen kartlar birleşir: adet toplanır, fiyat en yüksek, ad ilk kart.
# Tedarikçi (29 Ekim): kodunda "CELAL" geçen kart Celal'in malıdır; dışarıya SADECE celal=true işareti gider
# (ek yazının kendisi gitmez). Aynı kodun hem normal hem CELAL kartı varsa model Celal'e sayılır, ikiKart=true.
function Urunler([string]$sifre) {
  $q = StokSorgusu $sifre
  $tablo = Sorgu $sifre $q.sql
  $sonuc = @{}
  $uymayan = 0
  foreach ($r in $tablo.Rows) {
    $kod = ModelKodu ([string]$r.KOD)
    if (-not $kod) { $uymayan++; continue }
    $adet = Num $r.ADET; if ($null -eq $adet) { $adet = 0 }
    $fiyat = Num $r.FIYAT
    $celalKart = ([string]$r.KOD) -match '(?i)CELAL'
    # Black Rose kartı (30 Ekim): Vegawin kodunda rakamlardan sonra (boşluklu ya da bitişik) "B" gelen kart: "3634 B 20",
    # "3634 B", "3634B", "3634B20". "B"den sonra harf gelirse (ör. "3634 BEJ") sayılmaz. Dışarıya SADECE adedi gider (brAdet);
    # "B 20" gibi ekler iç bilgidir, gitmez. Kodun başına göre ayrım yapılmaz (907 gibi kodlar da var).
    $brKart = ([string]$r.KOD).Trim().ToUpperInvariant() -cmatch '^\d{3,6}\s*B(?![A-Z])'
    if ($sonuc.ContainsKey($kod)) {
      $u = $sonuc[$kod]; $u.adet += $adet
      if ($null -ne $fiyat -and ($null -eq $u.fiyat -or $fiyat -gt $u.fiyat)) { $u.fiyat = $fiyat }
    } else {
      $u = @{ kod = $kod; ad = ([string]$r.AD).Trim(); adet = $adet; fiyat = $fiyat; nC = 0; nN = 0; brAdet = $null }
      $sonuc[$kod] = $u
    }
    if ($celalKart) { $u.nC++ } else { $u.nN++ }
    if ($brKart) { if ($null -eq $u.brAdet) { $u.brAdet = 0 }; $u.brAdet += $adet }
  }
  foreach ($u in $sonuc.Values) {
    $u.celal = ($u.nC -gt 0); $u.ikiKart = ($u.nC -gt 0 -and $u.nN -gt 0)
    $u.Remove("nC"); $u.Remove("nN")
  }
  return @{ urunler = $sonuc; uymayan = $uymayan; satir = $tablo.Rows.Count }
}

function Gonder([string]$anahtar, [object[]]$liste) {
  for ($i = 0; $i -lt $liste.Count; $i += $PARTI) {
    $parca = @($liste[$i..([Math]::Min($i + $PARTI, $liste.Count) - 1)])
    $govde = @{ urunler = [object[]]$parca } | ConvertTo-Json -Depth 4 -Compress
    Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru" -TimeoutSec 60 `
      -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $anahtar" } `
      -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($govde)) | Out-Null
  }
}

function Imza($u) { return "$($u.adet)|$($u.fiyat)|$($u.ad)|$($u.celal)|$($u.ikiKart)|$($u.brAdet)" }

# Sadece değişenleri gönderir. Gönderim başarılı olunca son durum kaydedilir; bilgisayar kapalıyken
# kaçan değişiklikler açılınca bu karşılaştırmayla gider (kaldığı yerden devam).
function Esitle([switch]$Zorla) {
  $saat = (Get-Date).Hour
  if (-not $Zorla -and ($saat -lt $Ayar.baslangicSaati -or $saat -ge $Ayar.bitisSaati)) { return "saat dışı" }
  $g = Gizliler
  $simdiki = (Urunler (Duz $g.Sifre)).urunler
  $son = @{}
  if (Test-Path $SonDosya) {
    (Get-Content $SonDosya -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $son[$_.Name] = $_.Value }
  }
  $degisen = New-Object System.Collections.ArrayList
  foreach ($kod in $simdiki.Keys) {
    $u = $simdiki[$kod]
    if ($son[$kod] -ne (Imza $u)) { [void]$degisen.Add($u) }
  }
  foreach ($kod in @($son.Keys)) { if (-not $simdiki.ContainsKey($kod)) { [void]$degisen.Add(@{ kod = $kod; yok = $true }) } }
  if ($degisen.Count -gt 0) { Gonder (Duz $g.Anahtar) $degisen.ToArray() }
  else {
    # Kalp atışı (29 Ekim): değişiklik yoksa boş liste gider; Sami köprünün çalıştığını görür.
    Invoke-RestMethod -Method Post -Uri "$($Ayar.venom)/kopru" -TimeoutSec 60 `
      -Headers @{ "X-Magaza" = $Ayar.magaza; "Authorization" = "Bearer $(Duz $g.Anahtar)" } `
      -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes('{"urunler":[]}')) | Out-Null
  }
  $yeni = @{}
  foreach ($kod in $simdiki.Keys) { $yeni[$kod] = Imza $simdiki[$kod] }
  $yeni | ConvertTo-Json -Compress | Set-Content -Path $SonDosya -Encoding UTF8
  # Günün satış toplamı (stok gönderiminden bağımsız; hata olursa stok etkilenmez)
  $satisNot = ""
  try { $sat = Satislar (Duz $g.Sifre) (Get-Date); SatisGonder (Duz $g.Anahtar) $sat (Get-Date); $satisNot = ", bugün satılan $($sat.Count) model" }
  catch { $satisNot = ", satış okunamadı: $($_.Exception.Message)" }
  # Cari bakiyeler (cuma mutabakatı): saatte bir; hata olursa stok ve satış etkilenmez
  $cariDosya = Join-Path $VeriKlasoru "cari-son-$($Ayar.magaza).txt"
  $cariSon = if (Test-Path $cariDosya) { [datetime]::Parse((Get-Content $cariDosya -Raw).Trim(), [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) } else { [datetime]::MinValue }
  if ($Zorla -or ((Get-Date) - $cariSon).TotalMinutes -ge 60) {
    try { CariGonder (Duz $g.Anahtar) (CariBakiyeleri (Duz $g.Sifre)); (Get-Date).ToString("o") | Set-Content $cariDosya; $satisNot += ", cari bakiyeler gönderildi" }
    catch { $satisNot += ", cari okunamadı: $($_.Exception.Message)" }
  }
  # Gider keşfi: bu sürümde bir kez (Patron'un gider raporu için hangi tabloda olduğunu bulmak)
  $gkDosya = Join-Path $VeriKlasoru "gider-kesif-$($Ayar.magaza)-$SURUM.txt"
  if (-not (Test-Path $gkDosya)) {
    try { GiderKesifGonder (Duz $g.Anahtar) @(GiderKesif (Duz $g.Sifre)) (MaliKesif (Duz $g.Sifre)); (Get-Date).ToString("o") | Set-Content $gkDosya; $satisNot += ", mali keşif gönderildi" }
    catch { $satisNot += ", gider keşfi yapılamadı: $($_.Exception.Message)" }
  }
  # Yıllık ciro: 6 saatte bir (sadece Patron'un raporu için); hata olursa diğer işler etkilenmez
  $ciroDosya = Join-Path $VeriKlasoru "ciro-son-$($Ayar.magaza).txt"
  $ciroSon = if (Test-Path $ciroDosya) { [datetime]::Parse((Get-Content $ciroDosya -Raw).Trim(), [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) } else { [datetime]::MinValue }
  if ($Zorla -or ((Get-Date) - $ciroSon).TotalMinutes -ge 360) {
    try { CiroGonder (Duz $g.Anahtar) @(CiroOku (Duz $g.Sifre)); (Get-Date).ToString("o") | Set-Content $ciroDosya; $satisNot += ", ciro gönderildi" }
    catch { $satisNot += ", ciro okunamadı: $($_.Exception.Message)" }
  }
  return "$($simdiki.Count) model, $($degisen.Count) değişiklik gönderildi$satisNot"
}

function Bekle { Write-Host ""; Read-Host "Kapatmak için Enter'a basın" | Out-Null }

switch ($Mod) {
  "kurulum" {
    Get-ChildItem -Path $Klasor | Unblock-File -ErrorAction SilentlyContinue   # internetten inen dosyaların uyarısını kaldır
    Write-Host "=== Sayım Sami kurulumu ($($Ayar.magaza)) ===" -ForegroundColor Cyan
    Write-Host "Vegawin'e SADECE OKUMA için bağlanacak. Şifre bu bilgisayarda şifreli saklanır, hiçbir yere gönderilmez."
    $sifre = Read-Host "$($Ayar.kullanici) kullanıcısının şifresini yazın" -AsSecureString
    try {
      $t = Sorgu (Duz $sifre) "SELECT COUNT(*) AS N FROM INFORMATION_SCHEMA.TABLES"
      Write-Host "✓ Vegawin'e bağlanıldı ($($t.Rows[0].N) tablo görünüyor)." -ForegroundColor Green
    } catch {
      Write-Host "✗ Bağlanılamadı: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "Şifreyi ve Vegawin'in açık olduğunu kontrol edip kurulum.bat'ı tekrar çalıştırın."
      Bekle; exit 1
    }
    $anahtar = $null
    if (Test-Path $GizliDosya) { try { $anahtar = Duz (Import-Clixml $GizliDosya).Anahtar } catch { } }
    if (-not $anahtar) {
      $harfler = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
      $rnd = New-Object byte[] 40
      [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rnd)
      $anahtar = -join ($rnd | ForEach-Object { $harfler[$_ % $harfler.Length] })
    }
    [pscustomobject]@{ Sifre = $sifre; Anahtar = (ConvertTo-SecureString $anahtar -AsPlainText -Force) } | Export-Clixml -Path $GizliDosya
    try { Set-Clipboard -Value $anahtar } catch { }
    Write-Host ""
    Write-Host "✓ Şifre kaydedildi." -ForegroundColor Green
    Write-Host ""
    Write-Host "KÖPRÜ ANAHTARI (panoya kopyalandı):" -ForegroundColor Yellow
    Write-Host $anahtar -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Bunu Cloudflare'de volonte-asistan > Settings > Variables and Secrets > Add içine yapıştırın:"
    Write-Host "  Type: Secret   Name: KOPRU_$($Ayar.magaza)   Value: (yapıştır)   → Deploy"
    Write-Host "Anahtarı sohbete yazmayın."
    Bekle
  }
  "deneme" {
    Write-Host "=== Sayım Sami deneme ($($Ayar.magaza)) — Venom'a hiçbir şey gönderilmez ===" -ForegroundColor Cyan
    try {
      $g = Gizliler; $sifre = Duz $g.Sifre
      Write-Host "Sütunlar:"
      foreach ($tb in @($T_STOK, $T_BIRIM, $T_DEPO)) { Write-Host "  $tb : $((Sutunlar $sifre $tb) -join ', ')" }
      Write-Host "✓ Bağlantı tamam." -ForegroundColor Green
      $q = StokSorgusu $sifre
      Write-Host "Bağ sütunları: $T_BIRIM.$($q.birimBag) ve $T_DEPO.$($q.depoBag) = $T_STOK.IND"
      $u = Urunler $sifre
      Write-Host ""
      Write-Host "Vegawin'de $($u.satir) stok kartı; $($u.urunler.Count) model koduna birleşti; kod kalıbına uymayan: $($u.uymayan)."
      $brl = @($u.urunler.Values | Where-Object { $null -ne $_.brAdet })
      $brsiz = @($u.urunler.Values | Where-Object { $null -eq $_.brAdet })
      Write-Host "Black Rose kartı (kodda rakamdan sonra 'B') olan model: $($brl.Count); örnek: $(($brl | Sort-Object { $_.kod } | Select-Object -First 5 | ForEach-Object { "$($_.kod) → $($_.brAdet) adet" }) -join ', ')"
      Write-Host "'B' kartı OLMAYAN model: $($brsiz.Count)"
      if ($brsiz.Count) {
        $ornekB = Sorgu $sifre "SELECT S.STOKKODU AS KOD, S.MALINCINSI AS AD FROM $T_STOK S WHERE S.STATUS = 1 AND S.IND >= 100"
        $brsizKod = @($brsiz | ForEach-Object { $_.kod })
        Write-Host "'B'siz kartlardan örnekler (Vegawin kodu | ad):"
        @($ornekB.Rows | Where-Object { $m = ModelKodu ([string]$_.KOD); $m -and ($brsizKod -contains $m) -and -not (([string]$_.KOD).Trim().ToUpperInvariant() -cmatch '^\d{3,6}\s*B(?![A-Z])') } | Select-Object -First 12) |
          ForEach-Object { Write-Host ("  {0} | {1}" -f ([string]$_.KOD).Trim(), ([string]$_.AD).Trim()) }
      }
      Write-Host ""
      Write-Host "5 örnek ürün (model kodu | ad | adet | satış fiyatı $):"
      $u.urunler.Values | Sort-Object { $_.kod } | Select-Object -First 5 | ForEach-Object {
        Write-Host ("  {0} | {1} | {2} | {3}" -f $_.kod, $_.ad, $_.adet, $_.fiyat)
      }
      $ornekUymayan = Sorgu $sifre "SELECT S.STOKKODU AS KOD, S.MALINCINSI AS AD FROM $T_STOK S WHERE S.STATUS = 1 AND S.IND >= 100"
      $liste = @($ornekUymayan.Rows | Where-Object { -not (ModelKodu ([string]$_.KOD)) } | Select-Object -First 20)
      if ($liste.Count) {
        Write-Host ""
        Write-Host "Kod kalıbına uymayan kartlardan örnekler (gönderilmez):"
        foreach ($r in $liste) { Write-Host ("  {0} | {1}" -f $r.KOD, $r.AD) }
      }
      Write-Host ""
      Write-Host "Kod örnekleri (Vegawin kodu → dışarı giden model kodu):"
      $ham = Sorgu $sifre "SELECT TOP 8 S.STOKKODU AS KOD FROM $T_STOK S WHERE S.STATUS = 1 AND S.IND >= 100 ORDER BY S.IND DESC"
      foreach ($r in $ham.Rows) { $m = ModelKodu ([string]$r.KOD); Write-Host ("  {0} → {1}" -f $r.KOD, $(if ($m) { $m } else { "(gönderilmez)" })) }
    } catch {
      Write-Host "✗ Hata: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını Claude'a gönderin."
    Bekle
  }
  "baslat" {
    Write-Host "=== Sayım Sami başlatılıyor ($($Ayar.magaza)) ===" -ForegroundColor Cyan
    try {
      Write-Host "İlk gönderim yapılıyor (biraz sürebilir)..."
      $r = Esitle -Zorla
      Write-Host "✓ $r" -ForegroundColor Green
      Gunluge "baslat: $r"
    } catch {
      Write-Host "✗ Gönderilemedi: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "Köprü anahtarını Cloudflare'e girdiğinizden emin olun (KOPRU_$($Ayar.magaza))."
      Bekle; exit 1
    }
    $eylem = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + (Join-Path $Klasor "sami.vbs") + '"')
    # Tetikler (29 Ekim): (1) bilgisayar açılıp oturum açılınca, (2) her gün 08:55'ten itibaren — ikisi de 5 dakikada bir.
    # Eski tek seferlik tetik bazı Windows sürümlerinde bir gün sonra duruyordu.
    $tekrar = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition
    $girisTetik = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $girisTetik.Repetition = $tekrar
    $gunTetik = New-ScheduledTaskTrigger -Daily -At "08:55"
    $gunTetik.Repetition = $tekrar
    $tetik = @($girisTetik, $gunTetik)
    $ayarlar = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $GorevAdi -Action $eylem -Trigger $tetik -Settings $ayarlar -Description "Sayım Sami: Vegawin stok köprüsü (sadece okuma), 5 dakikada bir" -Force | Out-Null
    Write-Host "✓ Görev kuruldu: $($Ayar.baslangicSaati):00-$($Ayar.bitisSaati):00 arası 5 dakikada bir çalışır; bilgisayar açılınca kendiliğinden başlar." -ForegroundColor Green
    Write-Host "Durdurmak için: durdur.bat"
    Bekle
  }
  "durdur" {
    try { Unregister-ScheduledTask -TaskName $GorevAdi -Confirm:$false; Write-Host "✓ Sami durduruldu." -ForegroundColor Green }
    catch { Write-Host "Görev zaten yok." }
    Bekle
  }
  "satis-deneme" {
    Write-Host "=== Sayım Sami satış denemesi ($($Ayar.magaza)) — Venom'a hiçbir şey gönderilmez ===" -ForegroundColor Cyan
    try {
      $g = Gizliler; $sifre = Duz $g.Sifre
      $q = SatisSorgusu $sifre
      Write-Host "Hareket tablosu: $T_DEPO  ·  tarih sütunu: $($q.tarih)"
      Write-Host "Sütunlar: $($q.sutunlar -join ', ')"
      Write-Host ""
      Write-Host "Son 7 gün belge tipleri (adet satır · toplam miktar):"
      $dag = Sorgu $sifre "SELECT TOP 15 E.BELGETIPI AS TIP, COUNT(*) AS SATIR, SUM(E.ENVANTER) AS TOPLAM FROM $T_DEPO E WHERE E.DEPO = $DEPO AND E.$($q.tarih) >= @bas GROUP BY E.BELGETIPI ORDER BY COUNT(*) DESC" @{ bas = (Get-Date).Date.AddDays(-7) }
      foreach ($r in $dag.Rows) { Write-Host ("  tip {0} · {1} satır · toplam {2}" -f $r.TIP, $r.SATIR, $r.TOPLAM) }
      foreach ($gunEk in @(0, -1)) {
        $gun = (Get-Date).Date.AddDays($gunEk)
        $sat = Satislar $sifre $gun
        Write-Host ""
        Write-Host "$($gun.ToString('dd.MM.yyyy')) satış (belge tipi 21): $($sat.Count) model, toplam $([Math]::Round(($sat.Values | Measure-Object -Sum).Sum, 0)) adet"
        $sat.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { Write-Host ("  {0} · {1} adet" -f $_.Key, $_.Value) }
      }
      # Bugün satılan kartların Vegawin kodu ve adı (30 Ekim): genel/çeşitli kodları (ör. 2000) ayırt etmek için. Sadece SELECT.
      $db = BagSutunu $q.sutunlar $T_DEPO
      $kart = Sorgu $sifre ("SELECT S.STOKKODU AS KOD, S.MALINCINSI AS AD, SUM(E.ENVANTER) AS MIKTAR FROM $T_DEPO E INNER JOIN $T_STOK S ON E.$db = S.IND " +
        "WHERE E.BELGETIPI = 21 AND E.DEPO = $DEPO AND E.$($q.tarih) >= @bas AND E.$($q.tarih) < @bit GROUP BY S.STOKKODU, S.MALINCINSI ORDER BY S.STOKKODU") @{ bas = (Get-Date).Date; bit = (Get-Date).Date.AddDays(1) }
      Write-Host ""
      Write-Host "Bugün satılan kartlar (Vegawin kodu | kart adı | adet):"
      foreach ($r in $kart.Rows) { Write-Host ("  {0} | {1} | {2}" -f ([string]$r.KOD).Trim(), ([string]$r.AD).Trim(), [Math]::Abs((Num $r.MIKTAR))) }
      Write-Host ""
      Write-Host "✓ Okuma tamam (hiçbir şey gönderilmedi)." -ForegroundColor Green
    } catch { Write-Host "✗ Hata: $($_.Exception.Message)" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını Claude'a gönderin."
    Bekle
  }
  "cari-bakiye" {
    # Black Rose hesaplarının bakiyesi: kart BAKIYE ve dönem dönem hareket toplamları (SADECE SELECT, hiçbir şey gönderilmez)
    Write-Host "=== Sayım Sami cari bakiye ($($Ayar.magaza)) — sadece okuma, hiçbir şey gönderilmez ===" -ForegroundColor Cyan
    try {
      $g = Gizliler
      $c = CariBakiyeleri (Duz $g.Sifre)
      Write-Host "Hesap adı sütunu: $($c.adSutun) · kartta BAKIYE sütunu: $(if ($c.kartBakiye) { 'var' } else { 'yok' }) · para birimi: dolar"
      foreach ($b in $c.baglar) { Write-Host ("  bağ: {0} → hareket.{1} = kart.{2}  ({3} Black Rose hareketi, sütunda {4} farklı hesap)" -f $b.tablo, $b.hareket, $b.kart, $b.n, $b.farkli) -ForegroundColor Green }
      foreach ($h in $c.hesaplar) {
        Write-Host ""
        Write-Host ("■ {0}  (anahtar {1})   KART BAKIYE: {2:N2} $" -f $h.ad, $h.anahtar, $h.kart) -ForegroundColor Yellow
        if (-not @($h.donemler.Values | Where-Object { $_.n -gt 0 }).Count) { Write-Host "  (hiçbir hareket tablosunda bu hesaba bağlı hareket bulunamadı)" }
        foreach ($d in ($h.donemler.Keys | Sort-Object)) {
          $x = $h.donemler[$d]
          if ($x.n -eq 0) { continue }
          Write-Host ("  {0}: {1} hareket · borç {2:N2} $ · alacak {3:N2} $ · borç−alacak {4:N2} $ · {5} → {6}{7}" -f $d, $x.n, $x.borc, $x.alacak, ([double]$x.borc - [double]$x.alacak), $x.ilk, $x.son, $(if ($null -ne $x.sonBakiye) { " · son satır BAKIYE {0:N2} $" -f $x.sonBakiye } else { "" }))
          if ($x.yillar) { foreach ($yy in ($x.yillar.Keys | Sort-Object)) { $v = $x.yillar[$yy]; Write-Host ("      {0}: borç {1:N2} $ · alacak {2:N2} $ · ödeme borç {3:N2} $ / alacak {4:N2} $ · {5} kayıt" -f $yy, $v.b, $v.a, $v.ob, $v.oa, $v.n) } }
          if ($x.ilkGun) { Write-Host ("      ilk gün {0}: borç {1:N2} $ · alacak {2:N2} $ ({3} kayıt; devir olabilir)" -f $x.ilkGun.tarih, $x.ilkGun.b, $x.ilkGun.a, $x.ilkGun.n) }
        }
      }
      if ($c.ozel.Count) {
        Write-Host ""
        Write-Host "Özel kodunda BLACK geçen hareketler:" -ForegroundColor Yellow
        foreach ($o in $c.ozel) { Write-Host ("  {0} · '{1}' · hesap: {2} · {3} hareket · borç {4:N2} $ · alacak {5:N2} $" -f $o.tablo, $o.kod, $o.cari, $o.n, $o.borc, $o.alacak) }
      }
      # Teşhis (2 Kasım): ödeme ↔ mal ↔ iade ayrımı için hareket türünü gösteren sütunu bul. Son dönemin GENEL tablosunda,
      # Black Rose hesaplarının hareketlerinde az sayıda farklı değeri olan her sütunun dağılımı (borç/alacak toplamıyla). Sadece ekrana.
      try {
        $son = @($c.baglar | Where-Object { $_.tablo -like "*TBLCARIGENELHAREKET" } | Sort-Object { $_.tablo } | Select-Object -Last 1)[0]
        if ($son -and $son.kart -eq "IND") {
          $tab = "$($Ayar.firma)$($son.tablo)"
          $kimlik = @($c.hesaplar | ForEach-Object { $_.ind } | Where-Object { $_ } | ForEach-Object { [int]$_ })
          $liste = ($kimlik -join ", ")
          $hs = @(Sutunlar (Duz $g.Sifre) $tab)
          Write-Host ""
          Write-Host "Hareket tablosu ($($son.tablo)) sütunları: $($hs -join ', ')" -ForegroundColor Yellow
          foreach ($s in $hs) {
            if (@("IND", "TARIH", "VADE", "BORC", "ALACAK", "BAKIYE", "EVRAKNO", "BELGEIND", "ISLEMIND", $son.hareket) -contains $s) { continue }
            try {
              $dg = Sorgu (Duz $g.Sifre) "SELECT TOP 25 [$s] AS V, COUNT(*) AS N, SUM(BORC) AS B, SUM(ALACAK) AS A FROM [$tab] WHERE [$($son.hareket)] IN ($liste) GROUP BY [$s] ORDER BY COUNT(*) DESC"
              if ($dg.Rows.Count -ge 2 -and $dg.Rows.Count -le 20) {
                Write-Host ("  {0}: {1}" -f $s, (($dg.Rows | ForEach-Object { "{0}={1} (borç {2:N0} / alacak {3:N0})" -f ([string]$_.V).Trim(), $_.N, (Num $_.B), (Num $_.A) }) -join " · "))
              }
            } catch { }
          }
        }
      } catch { Write-Host "  (tür teşhisi yapılamadı: $($_.Exception.Message))" }
      Write-Host ""
      Write-Host "Son 60 günün hareketleri: $($c.hareketler.Count) (son 8 tanesi):" -ForegroundColor Yellow
      foreach ($x in @($c.hareketler | Sort-Object { $_.tarih } | Select-Object -Last 8)) { Write-Host ("  {0} · Black Rose {1} · borç {2:N2} $ · alacak {3:N2} $ · {4} {5}" -f $x.tarih, $x.hesap, $x.borc, $x.alacak, $x.ozelkod, $x.aciklama) }
      foreach ($n in $c.notlar) { Write-Host "  not: $n" }
      if (-not $c.baglar.Count) { Write-Host ""; Write-Host "Hesap kartları (bağ bulunamadı, karşılaştırma için):"; foreach ($k in $c.kartlar) { Write-Host "  $k" } }
      Write-Host ""
      Write-Host "✓ Okuma tamam (hiçbir şey gönderilmedi, Vegawin'e hiçbir şey yazılmadı)." -ForegroundColor Green
    } catch { Write-Host "✗ Hata: $($_.Exception.Message)" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını Claude'a gönderin."
    Bekle
  }
  "ciro-deneme" {
    # Yıllık ciro (2 Kasım, düzeltme): SADECE satış fatura başlıkları (adında SATFAT + BASLIK geçen tablolar, tüm dönemler).
    # Alış faturaları (ALF), fatura satırları ve depo hareketleri okunmaz. Alış fiyatı, maliyet, kâr sütunları ASLA okunmaz.
    # Not: PowerShell'de değişken adları büyük/küçük harf ayırmaz ($tip = $TIP); önceki sürümdeki tanıma hatası buydu.
    Write-Host "=== Sayım Sami ciro denemesi ($($Ayar.magaza)) — sadece okuma, hiçbir şey gönderilmez ===" -ForegroundColor Cyan
    try {
      $g = Gizliler; $sifre = Duz $g.Sifre
      $ADAY_TUR = @("BELGETIPI", "FATURATIPI", "FISTIPI", "BELGETURU", "ISLEMTIPI", "TIP")
      $ADAY_TUTAR = @("GENELTOPLAM", "NETTOPLAM", "TOPLAM", "ARATOPLAM", "TOPLAMTUTAR", "TUTAR", "NETTUTAR", "FATURATUTARI", "DOVIZGENELTOPLAM", "DOVIZTOPLAM", "DOVIZTUTAR", "SATISTUTARI")
      $ADAY_DOVIZ = @("DOVIZCINSI", "DOVIZKODU", "DOVIZ", "PARABIRIMI", "DOVIZTIPI", "DOVIZIND")
      $ADAY_TARIH = @("TARIH", "FATURATARIHI", "BELGETARIHI", "FISTARIHI", "EVRAKTARIHI", "ISLEMTARIHI", "KAYITTARIHI")
      $bul = { param($liste, $sutunlar) foreach ($a in $liste) { if ($sutunlar -contains $a) { return $a } } return $null }
      $tablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a ORDER BY TABLE_NAME" @{ a = "$($Ayar.firma)D____TBLSATFAT%BASLIK%" }
      Write-Host "Satış fatura başlık tabloları: $($tablolar.Rows.Count) (her dönem ayrı tablo)"
      $ozet = @{}   # yıl|tür|döviz → { n, tutarlar }
      $kullanilan = $null
      foreach ($tb in $tablolar.Rows) {
        $ad = [string]$tb.AD
        $sut = @(Sutunlar $sifre $ad | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() })
        $turS = & $bul $ADAY_TUR $sut
        $tarS = & $bul $ADAY_TARIH $sut
        $dovS = & $bul $ADAY_DOVIZ $sut
        $tutS = @($ADAY_TUTAR | Where-Object { $sut -contains $_ })
        try { $n = (Sorgu $sifre "SELECT COUNT(*) AS N FROM [$ad]").Rows[0].N } catch { $n = "?" }
        Write-Host ""
        Write-Host "■ $ad  ($n satır)" -ForegroundColor Yellow
        Write-Host "  tür: $turS · tarih: $tarS · döviz: $dovS · tutar sütunları: $($tutS -join ', ')"
        if (-not $turS -or -not $tarS -or -not $tutS.Count) { Write-Host "  Sütunlar: $($sut -join ', ')"; Write-Host "  (tür/tarih/tutar sütunu bulunamadı, atlandı)"; continue }
        $kullanilan = $tutS
        $topla = ($tutS | ForEach-Object { ", SUM(CAST([$_] AS FLOAT)) AS [$_]" }) -join ""
        # İptal edilmiş faturalar ciroya girmez (IPTAL sütunu varsa); kaç tane olduğu ayrıca yazılır
        $iptalVar = $sut -contains "IPTAL"
        if ($iptalVar) { try { Write-Host ("  iptal edilmiş fatura: {0} (ciroya katılmadı)" -f (Sorgu $sifre "SELECT COUNT(*) AS N FROM [$ad] WHERE IPTAL = 1").Rows[0].N) } catch { Write-Host "  IPTAL okunamadı: $($_.Exception.Message)" } }
        $nerede = if ($iptalVar) { " WHERE ISNULL(IPTAL, 0) = 0" } else { "" }
        $sec = "SELECT YEAR([$tarS]) AS Y, [$turS] AS T" + $(if ($dovS) { ", [$dovS] AS D" } else { "" }) + ", COUNT(*) AS N$topla FROM [$ad]$nerede GROUP BY YEAR([$tarS]), [$turS]" + $(if ($dovS) { ", [$dovS]" } else { "" }) + " ORDER BY YEAR([$tarS]), [$turS]"
        try {
          foreach ($x in (Sorgu $sifre $sec).Rows) {
            $deger = ($tutS | ForEach-Object { "{0} {1:N2}" -f $_, (Num $x[$_]) }) -join " · "
            Write-Host ("  {0} · tür {1}{2} · {3} fatura · {4}" -f $x.Y, $x.T, $(if ($dovS) { " · döviz $($x.D)" } else { "" }), $x.N, $deger)
            $k = "$($x.Y)|$($x.T)|$(if ($dovS) { $x.D } else { '-' })"
            if (-not $ozet.ContainsKey($k)) { $ozet[$k] = @{ n = 0; t = @{}; donem = @() } }
            $ozet[$k].n += [int]$x.N; $ozet[$k].donem += $ad.Substring($Ayar.firma.Length, 5)
            foreach ($s in $tutS) { $ozet[$k].t[$s] = [double]$ozet[$k].t[$s] + [double](Num $x[$s]) }
          }
        } catch { Write-Host "  toplam okunamadı: $($_.Exception.Message)" }
      }
      # Tüm dönemler birlikte: yıl yıl, tür tür (aynı yıl iki dönemde görünürse işaretlenir → çift sayım kontrolü)
      Write-Host ""
      Write-Host "=== TÜM DÖNEMLER — yıl · tür · döviz ===" -ForegroundColor Cyan
      foreach ($k in ($ozet.Keys | Sort-Object)) {
        $p = $k.Split("|"); $o = $ozet[$k]
        $iki = if (@($o.donem | Sort-Object -Unique).Count -gt 1) { "  ⚠ iki dönemde: $((@($o.donem | Sort-Object -Unique)) -join '+')" } else { "" }
        Write-Host ("  {0} · tür {1} · döviz {2} · {3} fatura · {4}{5}" -f $p[0], $p[1], $p[2], $o.n, (($o.t.Keys | Sort-Object | ForEach-Object { "{0} {1:N2}" -f $_, $o.t[$_] }) -join " · "), $iki)
      }
      Write-Host ""
      Write-Host "Tür numaralarını fotoğrafa göre belirleyeceğiz (Vegawin'de alış 20 / alıştan iade 22 ise büyük olasılıkla satış 21, satıştan iade 23)."
      Write-Host "✓ Okuma tamam (hiçbir şey gönderilmedi, Vegawin'e hiçbir şey yazılmadı)." -ForegroundColor Green
    } catch { Write-Host "✗ Hata: $($_.Exception.Message)" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını (gerekirse birkaç parça) Claude'a gönderin."
    Bekle
  }
  "cari-deneme" {
    # Cuma mutabakatı (31 Ekim): Black Rose cari hesaplarının bakiyesi okunabiliyor mu? SADECE SELECT, hiçbir şey gönderilmez.
    Write-Host "=== Sayım Sami cari hesap denemesi ($($Ayar.magaza)) — sadece okuma, Venom'a hiçbir şey gönderilmez ===" -ForegroundColor Cyan
    try {
      $g = Gizliler; $sifre = Duz $g.Sifre
      $tablolar = Sorgu $sifre "SELECT TABLE_NAME AS AD FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @a ORDER BY TABLE_NAME" @{ a = "%CARI%" }
      Write-Host "Adında CARI geçen tablolar: $($tablolar.Rows.Count)"
      foreach ($t in $tablolar.Rows) {
        $ad = [string]$t.AD
        try { $n = (Sorgu $sifre "SELECT COUNT(*) AS N FROM [$ad]").Rows[0].N } catch { $n = "OKUNAMADI: $($_.Exception.Message)" }
        Write-Host ""
        Write-Host "■ $ad  ($n satır)" -ForegroundColor Yellow
        Write-Host "  Sütunlar: $((Sutunlar $sifre $ad) -join ', ')"
        if ($n -is [int] -and $n -gt 0 -and $n -lt 200000) {
          $metin = Sorgu $sifre "SELECT COLUMN_NAME AS C FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t AND DATA_TYPE IN ('varchar','nvarchar','char','nchar')" @{ t = $ad }
          foreach ($c in $metin.Rows) {
            $sutun = [string]$c.C
            try {
              $bul = Sorgu $sifre "SELECT DISTINCT TOP 12 [$sutun] AS V FROM [$ad] WHERE [$sutun] LIKE @b OR [$sutun] LIKE @c" @{ b = "%BLACK%"; c = "%ROSE%" }
              if ($bul.Rows.Count) { Write-Host ("  '{0}' sütununda: {1}" -f $sutun, (($bul.Rows | ForEach-Object { ([string]$_.V).Trim() }) -join " | ")) -ForegroundColor Green }
            } catch { Write-Host "  '$sutun' okunamadı: $($_.Exception.Message)" }
          }
        }
      }
      Write-Host ""
      Write-Host "✓ Okuma tamam (hiçbir şey gönderilmedi, Vegawin'e hiçbir şey yazılmadı)." -ForegroundColor Green
    } catch { Write-Host "✗ Hata: $($_.Exception.Message)" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını (gerekirse birkaç parça) Claude'a gönderin."
    Bekle
  }
  "durum" {
    Write-Host "=== Sayım Sami durumu ($($Ayar.magaza)) · sürüm $SURUM ===" -ForegroundColor Cyan
    try {
      $gorev = Get-ScheduledTask -TaskName $GorevAdi -ErrorAction Stop
      $bilgi = Get-ScheduledTaskInfo -TaskName $GorevAdi
      Write-Host "Görev: $($gorev.State)  ·  son çalışma: $($bilgi.LastRunTime)  ·  sonuç: $($bilgi.LastTaskResult)  ·  sıradaki: $($bilgi.NextRunTime)"
    } catch { Write-Host "✗ Görev YOK (baslat.bat çalıştırılmalı)." -ForegroundColor Red }
    Write-Host "Şifre kaydı: $(if (Test-Path $GizliDosya) { 'var ✓' } else { 'YOK ✗ (kurulum.bat gerekli)' })"
    Write-Host ""
    Write-Host "Günlüğün son satırları:"
    if (Test-Path $Gunluk) { Get-Content $Gunluk -Encoding UTF8 -Tail 15 | ForEach-Object { Write-Host "  $_" } } else { Write-Host "  (günlük yok)" }
    Write-Host ""
    Write-Host "Bu ekranın fotoğrafını Claude'a gönderin."
    Bekle
  }
  "calistir" {
    # Aynı anda iki kopya çalışmasın; hata olursa sessizce günlüğe yazılır (bilgisayar kapalı/ağ yok vb.).
    $kilit = New-Object System.Threading.Mutex($false, "Local\SamiKopru-$($Ayar.magaza)")
    if (-not $kilit.WaitOne(0)) { exit 0 }
    # Saatte bir yeni sürüm kontrolü (hata olursa stok/satış/cari etkilenmez; bir sonraki saatte tekrar dener)
    try {
      $gDosya = Join-Path $VeriKlasoru "guncelleme-son-$($Ayar.magaza).txt"
      $gSon = if (Test-Path $gDosya) { [datetime]::Parse((Get-Content $gDosya -Raw).Trim(), [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) } else { [datetime]::MinValue }
      if (((Get-Date) - $gSon).TotalMinutes -ge 60) {
        (Get-Date).ToString("o") | Set-Content $gDosya
        $yeniSurum = KendiniGuncelle (Duz (Gizliler).Anahtar)
        if ($yeniSurum) { Gunluge "kendini güncelledi: $SURUM → $yeniSurum (bir sonraki çalışmada yeni sürüm)" }
      }
    } catch { Gunluge "güncelleme denenemedi: $($_.Exception.Message)" }
    try { $r = Esitle; if ($r -ne "saat dışı") { Gunluge $r } }
    catch { Gunluge "HATA: $($_.Exception.Message)" }
    finally { $kilit.ReleaseMutex() }
    exit 0
  }
  default { Write-Host "Bilinmeyen mod: $Mod" }
}
