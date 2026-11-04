#!/usr/bin/env bash
# Defile denemesini (volonte-defile) Cloudflare'e yükler. Canlı siteye (www) dokunmaz. Gizli anahtar yok.
# Kullanım: bash site-taslak/defile/yukle.sh [kesik-klasörü]  → kesikler KV "defile:<ad>" olarak yüklenir (varsa).
set -euo pipefail
cd "$(dirname "$0")"
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
KV=cd4cd47b965142c6859bf702510166bb
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/volonte-defile
KESIK="${1:-}"
if [ -n "$KESIK" ] && [ -d "$KESIK" ]; then
  for f in "$KESIK"/*.webp; do
    ad=$(basename "$f" .webp)
    curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$HESAP/storage/kv/namespaces/$KV/values/defile:$ad" -H "content-type: application/octet-stream" --data-binary "@$f" | python3 -c 'import sys,json;print("kesik '"$ad"':",json.load(sys.stdin)["success"])'
  done
fi
# sayfa.html worker içine gömülür (import)
python3 - <<'PY'
import json, pathlib
h = pathlib.Path("sayfa.html").read_text(encoding="utf-8")
m = pathlib.Path("mankenler.json").read_text(encoding="utf-8") if pathlib.Path("mankenler.json").exists() else "[]"
h = h.replace("/*MANKENLER*/[]", "/*MANKENLER*/" + json.dumps(json.loads(m), ensure_ascii=False))
w = pathlib.Path("worker.js").read_text(encoding="utf-8").replace('import SAYFA from "./sayfa.html";', "const SAYFA = " + json.dumps(h, ensure_ascii=False) + ";")
pathlib.Path("defile.js").write_text(w, encoding="utf-8")
print("derlendi:", len(w.encode()), "bayt")
PY
ILK=$(curl -sS "$API/settings" | python3 -c 'import sys,json;print("evet" if not json.load(sys.stdin).get("success") else "hayir")')
META=$(mktemp)
cat > "$META" <<JSON
{"main_module":"defile.js","compatibility_date":"2026-10-01",
 "bindings":[{"type":"kv_namespace","name":"KAYIT","namespace_id":"$KV"}]}
JSON
curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "defile.js=@defile.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("yükleme:",d["success"],d["errors"])'
rm -f "$META" defile.js
if [ "$ILK" = "evet" ]; then
  curl -sS -X POST "$API/subdomain" -H 'content-type: application/json' -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import sys,json;print("adres:",json.load(sys.stdin)["success"])'
fi
echo "https://volonte-defile.volonte.workers.dev"
