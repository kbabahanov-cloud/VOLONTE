#!/usr/bin/env python3
"""Gece yedeğinden geri yükleme (6 Kasım). Yedekler KV'de 8 gün: "yedek:<gün>:kv" (Venom: notlar, ekip, kanal dizini, model kartları...),
"yedek:<gün>:selin" (Selin iç kayıtları), "yedek:<gün>:pelin" (Pelin işleri, ürün fotoğrafları).
Kullanım:
  python3 araclar/yedek-geri.py liste                       → hangi günlerin yedeği var
  python3 araclar/yedek-geri.py goster 2026-11-06 kv         → o yedekteki anahtarlar
  python3 araclar/yedek-geri.py geri 2026-11-06 kv kodlar    → tek KV anahtarını geri yaz ("hepsi" = bütün KV yedeği)
  python3 araclar/yedek-geri.py geri 2026-11-06 selin        → Selin'e geri yükleme komutu (5 dk içinde kendi yazar); pelin için de aynı
Kimlik doğrulama ortamın vekil sunucusuyla; burada anahtar yok."""
import sys, json, urllib.request
H = "9b7e7d56c7c591fb6c69d2e372b04e27"; K = "cd4cd47b965142c6859bf702510166bb"
U = f"https://api.cloudflare.com/client/v4/accounts/{H}/storage/kv/namespaces/{K}"
oku = lambda a: urllib.request.urlopen(f"{U}/values/{a}").read()
def yaz(a, v):
    r = urllib.request.Request(f"{U}/values/{a}", data=v if isinstance(v, bytes) else v.encode(), method="PUT")
    return json.load(urllib.request.urlopen(r))["success"]
k = sys.argv[1:]
if k[:1] == ["liste"]:
    d = json.load(urllib.request.urlopen(f"{U}/keys?prefix=yedek:"))
    print("\n".join(x["name"] for x in d["result"]))
elif k[:1] == ["goster"]:
    print("\n".join(json.loads(oku(f"yedek:{k[1]}:{k[2]}"))["veri"].keys()))
elif k[:1] == ["geri"] and k[2] == "kv":
    veri = json.loads(oku(f"yedek:{k[1]}:kv"))["veri"]
    for a in (veri if k[3] == "hepsi" else [k[3]]): print(a, yaz(a, veri[a]))
elif k[:1] == ["geri"] and k[2] in ("selin", "pelin"):
    print(yaz(f"venom:yedekGeriYukle:{k[2]}", k[1]), "— 5 dk içinde bot kendi geri yükler; sonuç: venom:yedekGeriYukleSonuc:" + k[2])
else:
    print(__doc__)
