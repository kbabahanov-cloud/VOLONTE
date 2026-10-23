# SAYIM SAMİ — Vegawin → Venom stok köprüsü (VOLONTE)
#
# EN ÖNEMLİ KURAL: Vegawin'de ASLA silme, ekleme, düzenleme yok. Sadece SELECT.
# Kilitler: (1) her sorgu SadeceOku() denetiminden geçer, SELECT dışı her şey reddedilir;
# (2) bağlantı ApplicationIntent=ReadOnly ile açılır; (3) her sorgu bir işlem (transaction)
# içinde çalışır ve sonunda geri alınır (Rollback); (4) veritabanı kullanıcısı zaten sadece okuma.
# Okunan alanlar SADECE: STOKKODU, MALINCINSI, adet (ENVANTER toplamı) ve SATISFIYATI1.
# Alış fiyatı, maliyet, kâr oranı, vergi no, TC kimlik no okunmaz.
#
# Kullanım (çift tıklanan .bat dosyaları bunu çağırır):
#   sami.ps1 kurulum   şifreyi sorar (Windows kasasında şifreli saklanır), köprü anahtarı üretir
#   sami.ps1 deneme    bağlantı + tablo sütunları + 5 örnek ürün (Venom'a hiçbir şey göndermez)
#   sami.ps1 baslat    ilk gönderimi yapar, 5 dakikalık görevi kurar
#   sami.ps1 calistir  (görev çalıştırır) 09:00-19:00 arası değişen ürünleri gönderir
#   sami.ps1 durdur    5 dakikalık görevi kaldırır

param([string]$Mod = "calistir")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Klasor = $PSScriptRoot
$Ayar = Get-Content (Join-Path $Klasor "ayar.json") -Raw -Encoding UTF8 | ConvertFrom-Json
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
$BAG_ADAYLARI = @("STOKNO", "STOKIND", "STOK_IND", "STOKID", "STOK_ID", "STOK")
$PARTI = 200   # bir gönderimde en fazla ürün

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
  $b["Application Name"] = "Sami (VOLONTE, salt okuma)"
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
    "(SELECT SUM(E.ENVANTER) FROM $T_DEPO E WHERE E.$db = S.IND AND E.DEPO = 1 AND (E.BELGETIPI IS NULL OR E.BELGETIPI <> 67)) AS ADET " +
    "FROM $T_STOK S WHERE S.STATUS = 1 AND S.IND >= 100"
  return @{ sql = $sql; birimBag = $bb; depoBag = $db; stok = $s; birim = $b; depo = $d }
}

# Vegawin kodundaki ek (ör. "3194B20" → "3194") iç bilgidir, dışarı gitmez.
function ModelKodu([string]$kod) {
  $k = "$kod".Trim().ToUpperInvariant()
  if ($k -match $Ayar.kodKalibi) { return $Matches[1] }
  return $null   # kalıba uymayan kod gönderilmez
}

function Num($v) { if ($v -is [DBNull] -or $null -eq $v) { return $null } return [double]$v }

# Aynı model koduna düşen kartlar birleşir: adet toplanır, fiyat en yüksek, ad ilk kart.
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
    if ($sonuc.ContainsKey($kod)) {
      $u = $sonuc[$kod]; $u.adet += $adet
      if ($null -ne $fiyat -and ($null -eq $u.fiyat -or $fiyat -gt $u.fiyat)) { $u.fiyat = $fiyat }
    } else {
      $sonuc[$kod] = @{ kod = $kod; ad = ([string]$r.AD).Trim(); adet = $adet; fiyat = $fiyat }
    }
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

function Imza($u) { return "$($u.adet)|$($u.fiyat)|$($u.ad)" }

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
  $yeni = @{}
  foreach ($kod in $simdiki.Keys) { $yeni[$kod] = Imza $simdiki[$kod] }
  $yeni | ConvertTo-Json -Compress | Set-Content -Path $SonDosya -Encoding UTF8
  return "$($simdiki.Count) model, $($degisen.Count) değişiklik gönderildi"
}

function Bekle { Write-Host ""; Read-Host "Kapatmak için Enter'a basın" | Out-Null }

switch ($Mod) {
  "kurulum" {
    Get-ChildItem -Path $Klasor | Unblock-File -ErrorAction SilentlyContinue   # internetten inen dosyaların uyarısını kaldır
    Write-Host "=== Sayım Sami kurulumu ($($Ayar.magaza)) ===" -ForegroundColor Cyan
    Write-Host "Vegawin'e SADECE OKUMA için bağlanacak. Şifre bu bilgisayarda şifreli saklanır, hiçbir yere gönderilmez."
    $sifre = Read-Host "volonte_okuma kullanıcısının şifresini yazın" -AsSecureString
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
      Write-Host ""
      Write-Host "5 örnek ürün (model kodu | ad | adet | satış fiyatı $):"
      $u.urunler.Values | Sort-Object { $_.kod } | Select-Object -First 5 | ForEach-Object {
        Write-Host ("  {0} | {1} | {2} | {3}" -f $_.kod, $_.ad, $_.adet, $_.fiyat)
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
    $tetik = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $ayarlar = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $GorevAdi -Action $eylem -Trigger $tetik -Settings $ayarlar -Description "Sayım Sami: Vegawin stok köprüsü (sadece okuma), 5 dakikada bir" -Force | Out-Null
    Write-Host "✓ Görev kuruldu: $($Ayar.baslangicSaati):00-$($Ayar.bitisSaati):00 arası 5 dakikada bir çalışır." -ForegroundColor Green
    Write-Host "Durdurmak için: durdur.bat"
    Bekle
  }
  "durdur" {
    try { Unregister-ScheduledTask -TaskName $GorevAdi -Confirm:$false; Write-Host "✓ Sami durduruldu." -ForegroundColor Green }
    catch { Write-Host "Görev zaten yok." }
    Bekle
  }
  "calistir" {
    # Aynı anda iki kopya çalışmasın; hata olursa sessizce günlüğe yazılır (bilgisayar kapalı/ağ yok vb.).
    $kilit = New-Object System.Threading.Mutex($false, "Local\SamiKopru-$($Ayar.magaza)")
    if (-not $kilit.WaitOne(0)) { exit 0 }
    try { $r = Esitle; if ($r -ne "saat dışı") { Gunluge $r } }
    catch { Gunluge "HATA: $($_.Exception.Message)" }
    finally { $kilit.ReleaseMutex() }
    exit 0
  }
  default { Write-Host "Bilinmeyen mod: $Mod" }
}
