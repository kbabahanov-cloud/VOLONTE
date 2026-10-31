#!/usr/bin/env bash
# Kemal'i (volonte-asistan) Cloudflare'e yükler: test → paket → yükleme.
# Gizli anahtarlar (BOT_TOKEN, WEBHOOK_SECRET, ANTHROPIC_API_KEY) korunur.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test 2>&1 | grep -E "^# (pass|fail)"
npm test >/dev/null 2>&1 || { echo "TESTLER GEÇMEDİ, yüklenmedi"; exit 1; }
npm run build >/dev/null
sed 's#from "./worker.js"#from "./dist/worker.js"#; s#import("./worker.js")#import("./dist/worker.js")#' test.mjs > test-dist.mjs
node --test test-dist.mjs >/dev/null 2>&1 || { rm -f test-dist.mjs; echo "PAKET TESTİ GEÇMEDİ"; exit 1; }
rm -f test-dist.mjs
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/volonte-asistan
source scripts/kimlikler.sh
KIMLIK=$(kimlik_bagla ALLOWED_IDS EKIP_IDS MURAT_ID FABRIKA_SORUMLU)
META=$(mktemp)
# StokDO (Sayım Sami, SQLite) ilk kez eklenirken göç (v1 → v2) bir kez gönderilir.
ETIKET=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts" | python3 -c 'import sys,json;print(next((s.get("migration_tag") or "") for s in json.load(sys.stdin)["result"] if s["id"]=="volonte-asistan"))')
GOC=""
[ "$ETIKET" = "v1" ] && GOC='"migrations":{"old_tag":"v1","new_tag":"v2","new_sqlite_classes":["StokDO"]},'
cat > "$META" <<JSON
{"main_module":"worker.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],
 "placement":{"region":"aws:us-east-1"}, $GOC
 "bindings":[{"type":"kv_namespace","name":"KAYIT","namespace_id":"cd4cd47b965142c6859bf702510166bb"},
             {"type":"durable_object_namespace","name":"KATALOG","class_name":"KatalogDO"},
             {"type":"durable_object_namespace","name":"STOK","class_name":"StokDO"},
             {"type":"images","name":"IMAGES"},
             {"type":"service","name":"SELIN_DEPO","service":"volonte-selin","entrypoint":"SelinDepo"},
             $KIMLIK,
             {"type":"plain_text","name":"SELF_URL","text":"https://volonte-asistan.volonte.workers.dev"},
             {"type":"plain_text","name":"ANTHROPIC_MODEL","text":"claude-opus-5-5"},
             {"type":"plain_text","name":"MUSTERI_MODEL","text":"claude-sonnet-5-5"}]}
JSON
for bekle in 0 4 8 16; do
  sleep $bekle
  sonuc=$(curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "worker.js=@dist/worker.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["success"],d["errors"])')
  echo "yükleme: $sonuc"
  [[ "$sonuc" == True* ]] && break
done
rm -f "$META"
curl -sS "$API/settings" | python3 -c 'import sys,json;d=json.load(sys.stdin)["result"];print("bağlantılar:",sorted(b["name"] for b in d["bindings"]))'
