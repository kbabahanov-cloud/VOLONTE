#!/usr/bin/env bash
# Siteyi Cloudflare'e yükler.
#   bash site-taslak/yukle.sh canli   → CANLI SİTE  https://www.volonte.workers.dev  (D · Sinema; veri Selin'in iç bağlantısıyla)
#   bash site-taslak/yukle.sh taslak  → taslaklar   https://volonte-taslak.volonte.workers.dev
set -euo pipefail
cd "$(dirname "$0")"
MOD=${1:-taslak}
python3 derle.py
../telegram-bot/node_modules/.bin/esbuild worker.js --bundle --format=esm --platform=browser --target=es2022 --external:cloudflare:workers --outfile=dist/worker.bundle.js --log-level=warning
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
if [ "$MOD" = "canli" ]; then
  AD=www
  EK=',{"type":"plain_text","name":"CANLI","text":"1"},{"type":"service","name":"SELIN_DEPO","service":"volonte-selin","entrypoint":"SelinDepo"}'
else
  AD=volonte-taslak
  EK=''
fi
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/$AD
ILK=$(curl -sS "$API/settings" | python3 -c 'import sys,json;print("evet" if not json.load(sys.stdin).get("success") else "hayir")')
GOC=""
[ "$ILK" = "evet" ] && GOC='"migrations":{"new_tag":"v1","new_sqlite_classes":["SayimDO"]},'
META=$(mktemp)
cat > "$META" <<JSON
{"main_module":"worker.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"], $GOC
 "bindings":[{"type":"images","name":"IMAGES"},{"type":"durable_object_namespace","name":"SAYIM","class_name":"SayimDO"}$EK]}
JSON
for bekle in 0 4 8 16; do
  sleep $bekle
  sonuc=$(curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "worker.js=@dist/worker.bundle.js;filename=worker.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["success"],d["errors"])')
  echo "yükleme: $sonuc"
  [[ "$sonuc" == True* ]] && break
done
rm -f "$META"
[ "$ILK" = "evet" ] && curl -sS -X POST "$API/subdomain" -H 'content-type: application/json' -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import sys,json;print("adres:",json.load(sys.stdin)["success"])'
echo "https://$AD.volonte.workers.dev"
