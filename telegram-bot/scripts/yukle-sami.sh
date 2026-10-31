#!/usr/bin/env bash
# Sayım Sami'nin botunu (volonte-sami) Cloudflare'e yükler. Gizli anahtarlar (BOT_TOKEN, WEBHOOK_SECRET) korunur;
# ilk kurulumda WEBHOOK_SECRET rastgele üretilir. Sami sadece okur: Vegawin'e hiçbir şey yazmaz.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test test-sami.mjs 2>&1 | grep -E "^# (pass|fail)"
node --test test-sami.mjs >/dev/null 2>&1 || { echo "TESTLER GEÇMEDİ, yüklenmedi"; exit 1; }
npm run build:sami >/dev/null
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/volonte-sami
ILK=$(curl -sS "$API/settings" | python3 -c 'import sys,json;print("evet" if not json.load(sys.stdin).get("success") else "hayir")')
source scripts/kimlikler.sh
KIMLIK=$(kimlik_bagla ALLOWED_IDS EKIP_IDS MURAT_ID FABRIKA_SORUMLU BR_SORUMLU)
META=$(mktemp)
GIZLI=""
if [ "$ILK" = "evet" ]; then
  GIZLI=",{\"type\":\"secret_text\",\"name\":\"WEBHOOK_SECRET\",\"text\":\"$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)\"}"
fi
cat > "$META" <<JSON
{"main_module":"sami.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],
 "placement":{"region":"aws:us-east-1"},
 "bindings":[{"type":"kv_namespace","name":"KAYIT","namespace_id":"cd4cd47b965142c6859bf702510166bb"},
             {"type":"durable_object_namespace","name":"STOK","class_name":"StokDO","script_name":"volonte-asistan"},
             $KIMLIK,
             {"type":"plain_text","name":"SELF_URL","text":"https://volonte-sami.volonte.workers.dev"},
             {"type":"plain_text","name":"GITHUB_REPO","text":"kbabahanov-cloud/VOLONTE"}$GIZLI]}
JSON
for bekle in 0 4 8 16; do
  sleep $bekle
  sonuc=$(curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "sami.js=@dist/sami.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["success"],d["errors"])')
  echo "yükleme: $sonuc"
  [[ "$sonuc" == True* ]] && break
done
rm -f "$META"
if [ "$ILK" = "evet" ]; then
  curl -sS -X POST "$API/subdomain" -H 'content-type: application/json' -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import sys,json;print("adres:",json.load(sys.stdin)["success"])'
  curl -sS -X PUT "$API/schedules" -H 'content-type: application/json' -d '[{"cron":"*/5 * * * *"}]' | python3 -c 'import sys,json;print("5 dk görev:",json.load(sys.stdin)["success"])'
fi
curl -sS "$API/settings" | python3 -c 'import sys,json;d=json.load(sys.stdin)["result"];print("bağlantılar:",sorted(b["name"] for b in d["bindings"]))'
