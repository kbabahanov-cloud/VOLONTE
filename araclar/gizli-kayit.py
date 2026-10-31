#!/usr/bin/env python3
"""Gizli kayıt (Cloudflare KV, KAYIT) okuma/yazma. Depo herkese açık: notlar ve ekip bilgileri SADECE burada.
Kullanım:  python3 araclar/gizli-kayit.py oku venom:notlar [dosya]
           python3 araclar/gizli-kayit.py yaz venom:notlar dosya
Anahtarlar: venom:notlar, venom:ekip, venom:hedefler, venom:kimlikler, venom:kopru-ayar, venom:ortak-beyin, venom:claude
Kimlik doğrulama Cloudflare API bağlantısıyla (ortamın vekil sunucusu) yapılır; burada anahtar yok."""
import sys, urllib.request
HESAP = "9b7e7d56c7c591fb6c69d2e372b04e27"
KV = "cd4cd47b965142c6859bf702510166bb"
islem, anahtar = sys.argv[1], sys.argv[2]
url = f"https://api.cloudflare.com/client/v4/accounts/{HESAP}/storage/kv/namespaces/{KV}/values/{anahtar}"
if islem == "oku":
    veri = urllib.request.urlopen(url).read()
    if len(sys.argv) > 3: open(sys.argv[3], "wb").write(veri)
    else: sys.stdout.buffer.write(veri)
elif islem == "yaz":
    istek = urllib.request.Request(url, data=open(sys.argv[3], "rb").read(), method="PUT", headers={"content-type": "text/plain; charset=utf-8"})
    print(urllib.request.urlopen(istek).read().decode()[:200])
else:
    sys.exit("oku | yaz")
