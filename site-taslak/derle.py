#!/usr/bin/env python3
"""Taslakları derler: kaynak/ → dist/sayfalar.js (her taslak tek HTML; CSS ve JS içine gömülü, ek istek yok)."""
import json, pathlib
K = pathlib.Path(__file__).parent / "kaynak"
D = pathlib.Path(__file__).parent / "dist"
D.mkdir(exist_ok=True)
oku = lambda a: (K / a).read_text(encoding="utf-8")
sablon = oku("sablon.html")
sayfalar = {}
for t in "abcd":
    h = sablon
    for yer, icerik in [("/*ORTAK_CSS*/", oku("ortak.css")), ("/*TEMA_CSS*/", oku(f"{t}.css")),
                        ("/*TEMA_JS*/", oku(f"{t}.js")), ("/*ORTAK_JS*/", oku("ortak.js")), ("/*TEMA_AD*/", t)]:
        h = h.replace(yer, icerik)
    sayfalar[t] = h
    (D / f"{t}.html").write_text(h, encoding="utf-8")
sayfalar["secim"] = oku("secim.html")
(D / "sayfalar.js").write_text("export const SAYFALAR = " + json.dumps(sayfalar, ensure_ascii=False) + ";\n", encoding="utf-8")
for t in "abcd":
    print(t, len(sayfalar[t].encode()), "bayt")
