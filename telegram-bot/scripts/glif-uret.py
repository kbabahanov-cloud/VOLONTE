# Marka etiketi için harf şekillerini (alfa maskesi) üretir → marka-glifler.js
# Çalıştırma: python3 scripts/glif-uret.py  (Inter Display SemiBold gerekir)
import base64, json, math
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf"
BOYUT = 40
KARAKTERLER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./·~ "
font = ImageFont.truetype(FONT, BOYUT)
yukari, asagi = font.getmetrics()
H = yukari + asagi
glifler = {}
for ch in KARAKTERLER:
    w = max(1, math.ceil(font.getlength(ch)))
    im = Image.new("L", (w, H), 0)
    ImageDraw.Draw(im).text((0, yukari), ch, font=font, fill=255, anchor="ls")
    glifler[ch] = {"w": w, "a": base64.b64encode(im.tobytes()).decode()}
with open("marka-glifler.js", "w") as f:
    f.write("// Üretildi: scripts/glif-uret.py (Inter Display SemiBold, %d px). Elle düzenlemeyin.\n" % BOYUT)
    f.write("export const GLIF_YUKSEKLIK = %d;\nexport const GLIFLER = %s;\n" % (H, json.dumps(glifler, separators=(",", ":"))))
print("yükseklik", H, "boyut", sum(len(g["a"]) for g in glifler.values()))
