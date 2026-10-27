"""Fotoğraf karışıklığı kontrolü (GitHub Actions, ücretsiz).

Selin istekler/kontrol/<sürüm>.json yazar (geçici jetonlu adres). Bu betik toplu listedeki her modelin
kanal paylaşım gruplarındaki bütün mesajları indirir: kontrol/<sürüm>/<kod>/<mesaj>.jpg + liste.json
(her mesajın yazısı, albüm kimliği, taslağa girip girmediği). Hiçbir şey değiştirmez; siteye yazmaz.
"""
import glob
import json
import os
import time
import urllib.parse
import urllib.request

ARA = 3.2  # Telegram kanal iletme sınırı (dakikada ~20) için bekleme


def al(url):
    istek = urllib.request.Request(url, headers={"user-agent": "volonte-kontrol"})
    for deneme in range(3):
        try:
            with urllib.request.urlopen(istek, timeout=120) as r:
                return r.status, dict(r.headers), r.read()
        except Exception as e:  # geçici ağ hatası
            if deneme == 2:
                raise
            time.sleep(10)


def isle(dosya):
    istek = json.load(open(dosya))
    surum, kok = istek["surum"], istek["kok"]
    hedef = f"kontrol/{surum}"
    if os.path.exists(f"{hedef}/liste.json"):
        return
    _, _, govde = al(f"{kok}/json")
    liste = json.loads(govde)
    gorulen = {}
    for m in liste:
        os.makedirs(f"{hedef}/{m['kod']}", exist_ok=True)
        m["mesajlar"] = []
        idler = sorted({i for g in m["gruplar"] for i in g["ids"]})
        if os.path.exists("kontrol/k1/liste.json") and surum != "k1":
            onceki = {x["id"]: x["tur"] for k in json.load(open("kontrol/k1/liste.json")) for x in k["mesajlar"]}
            idler = [i for i in idler if onceki.get(i) == "video"]
        for id_ in idler:
            if id_ not in gorulen:
                durum, basliklar, veri = al(f"{kok}/m/{id_}")
                b = {k.lower(): v for k, v in basliklar.items()}
                kayit = {"id": id_, "tur": b.get("x-tur", "?"), "yazi": urllib.parse.unquote(b.get("x-yazi", "")),
                         "albumId": b.get("x-grup", ""), "benzersiz": b.get("x-benzersiz", "")}
                if durum == 200 and veri and kayit["tur"] == "video":
                    # Videodan 4 kare (başı, 1/3, 2/3, sonu) yan yana tek resim
                    open("/tmp/v.mp4", "wb").write(veri)
                    kayit["dosya"] = f"{m['kod']}/{id_}-video.jpg"
                    os.system(f"ffmpeg -v error -y -i /tmp/v.mp4 -vf \"thumbnail=60,scale=-2:480,tile=4x1\" -frames:v 1 {hedef}/{kayit['dosya']} || true")
                    if not os.path.exists(f"{hedef}/{kayit['dosya']}"):
                        kayit.pop("dosya")
                elif durum == 200 and veri:
                    kayit["dosya"] = f"{m['kod']}/{id_}.jpg"
                    open(f"{hedef}/{kayit['dosya']}", "wb").write(veri)
                gorulen[id_] = kayit
                time.sleep(ARA)
            k = dict(gorulen[id_])
            k["taslakta"] = any(f["id"] == id_ for f in m["fotolar"])
            m["mesajlar"].append(k)
    json.dump(liste, open(f"{hedef}/liste.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    for d in sorted(glob.glob("istekler/kontrol/*.json")):
        isle(d)
