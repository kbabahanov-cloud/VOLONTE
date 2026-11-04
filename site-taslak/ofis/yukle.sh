#!/usr/bin/env bash
# VOLONTE SANAL OFİS (volonte-ofis) — Cloudflare'e yükler. Botlara ve canlı siteye dokunmaz; sadece okur.
# İlk kurulumda OFIS_SIFRE (Patron şifresi) rastgele üretilir ve EKRANA BİR KEZ yazılır; sonra Cloudflare'de değiştirilebilir.
# Kullanım: bash site-taslak/ofis/yukle.sh
set -euo pipefail
cd "$(dirname "$0")"
node --check worker.js
HESAP=9b7e7d56c7c591fb6c69d2e372b04e27
KV=cd4cd47b965142c6859bf702510166bb
API=https://api.cloudflare.com/client/v4/accounts/$HESAP/workers/scripts/volonte-ofis
python3 - <<'PY'
import json, pathlib
h = pathlib.Path("sayfa.html").read_text(encoding="utf-8")
w = pathlib.Path("worker.js").read_text(encoding="utf-8").replace('import SAYFA from "./sayfa.html";', "const SAYFA = " + json.dumps(h, ensure_ascii=False) + ";")
pathlib.Path("ofis.js").write_text(w, encoding="utf-8")
print("derlendi:", len(w.encode()), "bayt")
PY
ILK=$(curl -sS "$API/settings" | python3 -c 'import sys,json;print("evet" if not json.load(sys.stdin).get("success") else "hayir")')
# Şifre ZATEN kayıtlıysa asla yeniden üretilmez (yeniden yüklemede Patron'un şifresi değişmesin)
VAR=$(curl -sS "$API/secrets" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("evet" if d.get("success") and any(x["name"]=="OFIS_SIFRE" for x in d["result"]) else "hayir")' 2>/dev/null || echo hayir)
[ "$VAR" = "evet" ] && ILK_SIFRE=hayir || ILK_SIFRE=$ILK
GIZLI=""
SIFRE=""
if [ "$ILK_SIFRE" = "evet" ]; then
  SIFRE=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-HJ-NP-Z2-9' | head -c 8)
  GIZLI=",{\"type\":\"secret_text\",\"name\":\"OFIS_SIFRE\",\"text\":\"$SIFRE\"}"
fi
META=$(mktemp)
cat > "$META" <<JSON
{"main_module":"ofis.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],
 "bindings":[{"type":"kv_namespace","name":"KAYIT","namespace_id":"$KV"},
             {"type":"durable_object_namespace","name":"STOK","class_name":"StokDO","script_name":"volonte-asistan"},
             {"type":"service","name":"KEMAL","service":"volonte-asistan"},
             {"type":"plain_text","name":"SELF_URL","text":"https://volonte-ofis.volonte.workers.dev"}$GIZLI]}
JSON
for bekle in 0 4 8; do
  sleep $bekle
  sonuc=$(curl -sS -X PUT "$API" -F "metadata=@$META;type=application/json" -F "ofis.js=@ofis.js;type=application/javascript+module" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["success"],d["errors"])')
  echo "yükleme: $sonuc"
  [[ "$sonuc" == True* ]] && break
done
rm -f "$META" ofis.js
if [ "$ILK" = "evet" ]; then
  curl -sS -X POST "$API/subdomain" -H 'content-type: application/json' -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import sys,json;print("adres:",json.load(sys.stdin)["success"])'
  # Not: hesapta ücretsiz cron hakkı dolu (5/5); anlık görüntüler sayfa açıkken /api/durum üzerinden alınır.
  echo "OFIS_SIFRE (bir kez gösterilir): $SIFRE"
fi
curl -sS "$API/settings" | python3 -c 'import sys,json;d=json.load(sys.stdin)["result"];print("bağlantılar:",sorted(b["name"] for b in d["bindings"]))'
echo "https://volonte-ofis.volonte.workers.dev"
