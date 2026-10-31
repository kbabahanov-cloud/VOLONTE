#!/usr/bin/env bash
# Köprü paketini üretir: ortak dosyalar (sami.ps1, .bat, .vbs) + o mağazanın ayar.json'u ve BENI-OKU.txt.
# Sunucu adresi, veritabanı, kullanıcı, firma/dönem depoda YOK: gizli kayıttan (Cloudflare KV venom:kopru-ayar) doldurulur.
# Kullanım: bash sami/paket.sh VOLONTE   ya da   bash sami/paket.sh BLACKROSE      (zip depoya konmaz)
set -euo pipefail
cd "$(dirname "$0")"
MAGAZA=${1:?"mağaza: VOLONTE ya da BLACKROSE"}
case "$MAGAZA" in VOLONTE) KAYNAK=. ; KLASOR=Sami ;; BLACKROSE) KAYNAK=blackrose ; KLASOR=Sami-BLACKROSE ;; *) echo "bilinmeyen mağaza"; exit 1 ;; esac
T=$(mktemp -d); mkdir "$T/$KLASOR"
cp sami.ps1 sami.vbs kurulum.bat deneme.bat satis-deneme.bat cari-deneme.bat cari-bakiye.bat baslat.bat durdur.bat durum.bat "$T/$KLASOR/"
cp "$KAYNAK/BENI-OKU.txt" "$T/$KLASOR/"
python3 ../araclar/gizli-kayit.py oku venom:kopru-ayar "$T/gizli.json"
python3 - "$T/gizli.json" "$MAGAZA" "$KAYNAK/ayar.json" "$T/$KLASOR/ayar.json" <<'PY'
import json, sys
gizli, magaza, sablon, hedef = sys.argv[1:]
g = json.load(open(gizli))[magaza]
a = json.load(open(sablon))
for k, v in a.items():
    if v == "GIZLI_KAYITTAN": a[k] = g[k]
if "GIZLI_KAYITTAN" in json.dumps(a): sys.exit("ayar eksik")
open(hedef, "w").write(json.dumps(a, ensure_ascii=False, indent=2) + "\n")
PY
rm -f "$T/gizli.json" "Sami-kopru-$MAGAZA.zip"
(cd "$T" && zip -qr - "$KLASOR") > "Sami-kopru-$MAGAZA.zip"
rm -rf "$T"
unzip -l "Sami-kopru-$MAGAZA.zip" | tail -n +4 | head -n -2
echo "→ sami/Sami-kopru-$MAGAZA.zip (depoya konmaz)"
