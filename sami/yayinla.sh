#!/usr/bin/env bash
# Köprünün yeni sürümünü Cloudflare'e koyar (2 Kasım): köprüler saatte bir bakar, yeni sürümü kendileri indirip kurar.
# Ortak dosyalar (sami.ps1, .bat, .vbs) KV "kopru:dosya:<ad>" (base64) + liste/özetler "kopru:surum".
# ayar.json ve BENI-OKU mağazaya özel; yayınlanmaz. Sürüm numarası sami.ps1'deki $SURUM'dan okunur (her yayında artırılmalı).
# Kullanım: bash sami/yayinla.sh
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import base64, hashlib, json, re, urllib.request
HESAP = "9b7e7d56c7c591fb6c69d2e372b04e27"; KV = "cd4cd47b965142c6859bf702510166bb"
DOSYALAR = ["sami.ps1", "sami.vbs", "kurulum.bat", "deneme.bat", "satis-deneme.bat", "cari-deneme.bat", "cari-bakiye.bat", "ciro-deneme.bat", "baslat.bat", "durdur.bat", "durum.bat"]
def yaz(anahtar, veri):
    url = f"https://api.cloudflare.com/client/v4/accounts/{HESAP}/storage/kv/namespaces/{KV}/values/{anahtar}"
    r = urllib.request.urlopen(urllib.request.Request(url, data=veri.encode(), method="PUT", headers={"content-type": "text/plain; charset=utf-8"})).read().decode()
    if '"success":true' not in r: raise SystemExit(f"{anahtar}: {r[:200]}")
surum = re.search(r'^\$SURUM = "(\d+)"', open("sami.ps1", encoding="utf-8-sig").read(), re.M).group(1)
liste = {}
for ad in DOSYALAR:
    b = open(ad, "rb").read()
    liste[ad] = hashlib.sha256(b).hexdigest()
    yaz(f"kopru:dosya:{ad}", base64.b64encode(b).decode())
yaz("kopru:surum", json.dumps({"surum": surum, "dosyalar": liste}))  # liste en son: dosyalar hazır olmadan sürüm görünmesin
print(f"yayında: sürüm {surum}, {len(liste)} dosya")
PY
