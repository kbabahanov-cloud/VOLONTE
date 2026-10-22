#!/usr/bin/env bash
# Selin'i (volonte-selin) Cloudflare'e yükler. Gizli anahtarlar (BOT_TOKEN, ANTHROPIC_API_KEY,
# GITHUB_TOKEN, WEBHOOK_SECRET) korunur; ilk kurulumda WEBHOOK_SECRET rastgele üretilir.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test test-selin.mjs 2>&1 | grep -E "^# (pass|fail)"
node --test test-selin.mjs >/dev/null 2>&1 || { echo "TESTLER GEÇMEDİ, yüklenmedi"; exit 1; }
npm run build:selin >/dev/null
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/volonte-selin
ILK=$(curl -sS "$API/settings" | python3 -c 'import sys,json;print("evet" if not json.load(sys.stdin).get("success") else "hayir")')
META=$(mktemp)
GOC=""
GIZLI=""
if [ "$ILK" = "evet" ]; then
  GOC='"migrations":{"new_tag":"v1","new_sqlite_classes":["SelinDO"]},'
  GIZLI=",{\"type\":\"secret_text\",\"name\":\"WEBHOOK_SECRET\",\"text\":\"$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)\"}"
fi
cat > "$META" <<JSON
{"main_module":"selin.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],
 "placement":{"region":"aws:us-east-1"}, $GOC
 "bindings":[{"type":"kv_namespace","name":"KAYIT","namespace_id":"cd4cd47b965142c6859bf702510166bb"},
             {"type":"durable_object_namespace","name":"SELIN","class_name":"SelinDO"},
             {"type":"plain_text","name":"ALLOWED_IDS","text":"2005113508,6113852976"},
             {"type":"plain_text","name":"EKIP_IDS","text":"6448681578,8369444291"},
             {"type":"plain_text","name":"SELF_URL","text":"https://volonte-selin.volonte.workers.dev"},
             {"type":"plain_text","name":"ANTHROPIC_MODEL","text":"claude-opus-5-5"},
             {"type":"plain_text","name":"GITHUB_REPO","text":"kbabahanov-cloud/VOLONTE"},
             {"type":"plain_text","name":"SITE_URL","text":"https://kbabahanov-cloud.github.io/VOLONTE"}$GIZLI]}
JSON
for bekle in 0 4 8 16; do
  sleep $bekle
  sonuc=$(curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "selin.js=@dist/selin.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["success"],d["errors"])')
  echo "yükleme: $sonuc"
  [[ "$sonuc" == True* ]] && break
done
rm -f "$META"
if [ "$ILK" = "evet" ]; then
  curl -sS -X POST "$API/subdomain" -H 'content-type: application/json' -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import sys,json;print("adres:",json.load(sys.stdin)["success"])'
  curl -sS -X PUT "$API/schedules" -H 'content-type: application/json' -d '[{"cron":"*/5 * * * *"}]' | python3 -c 'import sys,json;print("5 dk görev:",json.load(sys.stdin)["success"])'
fi
curl -sS "$API/settings" | python3 -c 'import sys,json;d=json.load(sys.stdin)["result"];print("bağlantılar:",sorted(b["name"] for b in d["bindings"]))'
