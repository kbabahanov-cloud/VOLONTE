"""Videodan en net kareleri seçer (GitHub Actions'ta, ücretsiz).

Kullanım:
  python kare.py isle     istekler/*.json → kareler/<kod>/aday-N.jpg + sonuc.json
  python kare.py bildir SHA   sonuc.json'daki her istek için Selin'e haber verir

Yapay zekâ yok: kare videonun kendisinden alınır, ürün olduğu gibi görünür.
Netlik: gri tonda Laplace varyansı (kenarlar ne kadar keskin). Çok karanlık/aydınlık kareler atlanır.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np

ORNEK_FPS = 4          # saniyede taranan kare
OLCEK = 480            # netlik ölçümü için genişlik (hız)
ADAY = 3               # onaya gidecek kare
ARA_SN = 1.0           # adaylar arasında en az bu kadar saniye
DEPO = os.environ.get("GITHUB_REPOSITORY", "kbabahanov-cloud/VOLONTE")


def indir(url, yol):
    istek = urllib.request.Request(url, headers={"user-agent": "volonte-kare"})
    with urllib.request.urlopen(istek, timeout=120) as r, open(yol, "wb") as f:
        while True:
            parca = r.read(1 << 20)
            if not parca:
                break
            f.write(parca)


def boyut(video):
    cikti = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                            "-of", "json", video], capture_output=True, text=True, check=True).stdout
    s = json.loads(cikti)["streams"][0]
    return int(s["width"]), int(s["height"])


def netlikler(video):
    g, y = boyut(video)
    w = OLCEK if g >= y else int(OLCEK * g / y) // 2 * 2
    h = int(w * y / g) // 2 * 2
    ham = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={ORNEK_FPS},scale={w}:{h}", "-f", "rawvideo",
                          "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    kareler = np.frombuffer(ham, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
    sonuc = []
    for i, k in enumerate(kareler):
        parlak = float(k.mean())
        if parlak < 35 or parlak > 235:
            continue
        lap = -4 * k[1:-1, 1:-1] + k[:-2, 1:-1] + k[2:, 1:-1] + k[1:-1, :-2] + k[1:-1, 2:]
        sonuc.append((float(lap.var()), i / ORNEK_FPS))
    return sonuc


def sec(puanlar):
    secilen = []
    en_iyi = max((p for p, _ in puanlar), default=0)
    for puan, t in sorted(puanlar, reverse=True):
        if puan < en_iyi * 0.5:  # en netin yarısından bulanık kare önerilmez
            break
        if all(abs(t - s) >= ARA_SN for _, s in secilen):
            secilen.append((puan, t))
        if len(secilen) == ADAY:
            break
    return sorted(secilen, key=lambda x: x[1])


def kare_al(video, t, cikis):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-q:v", "2", cikis], check=True)


def isle():
    sonuclar = []
    for dosya in sorted(glob.glob("istekler/*.json")):
        istek = json.load(open(dosya))
        kod = istek["kod"]
        sonuc = {"kod": kod, "t": istek["t"], "geri": istek["geri"], "dosyalar": [], "hata": None}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                video = os.path.join(tmp, "v.mp4")
                indir(istek["video"], video)
                secilen = sec(netlikler(video))
                if not secilen:
                    raise RuntimeError("net kare bulunamadı (video çok karanlık ya da bulanık)")
                os.makedirs(f"kareler/{kod}", exist_ok=True)
                for n, (puan, t) in enumerate(secilen, 1):
                    yol = f"kareler/{kod}/aday-{n}.jpg"
                    kare_al(video, t, yol)
                    sonuc["dosyalar"].append({"yol": yol, "saniye": round(t, 2), "netlik": round(puan, 1)})
        except Exception as e:  # hata Selin'e bildirilir
            sonuc["hata"] = str(e)[:300]
        os.remove(dosya)
        sonuclar.append(sonuc)
    json.dump(sonuclar, open("sonuc.json", "w"))
    print(json.dumps(sonuclar, ensure_ascii=False))


def bildir(sha):
    for s in json.load(open("sonuc.json")):
        govde = {"t": s["t"], "kod": s["kod"], "hata": s["hata"],
                 "dosyalar": [{**d, "url": f"https://raw.githubusercontent.com/{DEPO}/{sha}/{d['yol']}"} for d in s["dosyalar"]]}
        istek = urllib.request.Request(s["geri"], data=json.dumps(govde).encode(), method="POST",
                                       headers={"content-type": "application/json", "user-agent": "volonte-kare"})
        with urllib.request.urlopen(istek, timeout=60) as r:
            print(s["kod"], r.status)


if __name__ == "__main__":
    if sys.argv[1] == "isle":
        isle()
    else:
        bildir(sys.argv[2])
