#!/usr/bin/env bash
# Black Rose köprü paketini üretir: ortak dosyalar (sami.ps1, .bat, .vbs) + blackrose/ayar.json ve BENI-OKU.txt.
# Firma/dönem (F????/D????) doldurulmadan kurulum çalışmaz (ayar.json denetimi).
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); mkdir "$T/Sami-BLACKROSE"
cp sami.ps1 sami.vbs kurulum.bat deneme.bat satis-deneme.bat baslat.bat durdur.bat durum.bat "$T/Sami-BLACKROSE/"
cp blackrose/ayar.json blackrose/BENI-OKU.txt "$T/Sami-BLACKROSE/"
rm -f Sami-kopru-BLACKROSE.zip
(cd "$T" && zip -qr - Sami-BLACKROSE) > Sami-kopru-BLACKROSE.zip
rm -rf "$T"
unzip -l Sami-kopru-BLACKROSE.zip | tail -n +4 | head -n -2
