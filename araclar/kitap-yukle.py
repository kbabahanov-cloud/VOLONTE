#!/usr/bin/env python3
"""TEK KİTAP yükleyici (kural 37): KURALLAR-PATRON.md'yi ve DERSLER.md'yi bütün botların okuduğu kayda (KV) yazar.
Kural değişince: 1) KURALLAR-PATRON.md'yi düzelt, "Sürüm:" satırını değiştir  2) python3 araclar/kitap-yukle.py
Botlar birkaç dakika içinde yeni kitabı okur; yeniden yükleme gerekmez. Aynı metin pakete gömülü yedeğe de yazılır
(telegram-bot/kitap-yedek.js). "--sadece-yedek": KV'ye dokunmadan sadece gömülü yedeği üretir."""
import json, os, re, sys, urllib.request
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HESAP = "9b7e7d56c7c591fb6c69d2e372b04e27"; KV = "cd4cd47b965142c6859bf702510166bb"
TABAN = f"https://api.cloudflare.com/client/v4/accounts/{HESAP}/storage/kv/namespaces/{KV}/values/"

def yaz(anahtar, deger):
    istek = urllib.request.Request(TABAN + anahtar, data=deger.encode("utf-8"), method="PUT")
    return json.load(urllib.request.urlopen(istek)).get("success")

kitap = open(os.path.join(KOK, "KURALLAR-PATRON.md"), encoding="utf-8").read()
dersler = open(os.path.join(KOK, "DERSLER.md"), encoding="utf-8").read()
surum = (re.search(r"^Sürüm:\s*(\S+)", kitap, re.M) or [None, "?"])[1]
kural = len(re.findall(r"^\d+\. ", kitap, re.M))
open(os.path.join(KOK, "telegram-bot", "kitap-yedek.js"), "w", encoding="utf-8").write(
    "// araclar/kitap-yukle.py üretir — ELLE DÜZELTME. Kaynak: KURALLAR-PATRON.md ve DERSLER.md\n"
    f"export const KITAP_YEDEK = {json.dumps(kitap, ensure_ascii=False)};\n"
    f"export const DERSLER_YEDEK = {json.dumps(dersler, ensure_ascii=False)};\n")
print(f"gömülü yedek yazıldı: sürüm {surum}, {kural} kural")
if "--sadece-yedek" not in sys.argv:
    print("kitap:metin", yaz("kitap:metin", kitap))
    print("kitap:dersler", yaz("kitap:dersler", dersler))
    print("kitap:surum", yaz("kitap:surum", json.dumps({"surum": surum, "kural": kural})))
