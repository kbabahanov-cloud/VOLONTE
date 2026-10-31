# Botların kişi kimlikleri gizli kayıttan (Cloudflare KV venom:kimlikler) okunur; depoda kimlik yok.
# Kullanım (yükleme betiklerinde): KIMLIK=$(kimlik_bagla ALLOWED_IDS EKIP_IDS ...) → JSON bağlantı listesi parçası
kimlik_bagla() {
  local veri
  veri=$(curl -sS --fail "https://api.cloudflare.com/client/v4/accounts/9b7e7d56c7c591fb6c69d2e372b04e27/storage/kv/namespaces/cd4cd47b965142c6859bf702510166bb/values/venom:kimlikler") || { echo "GİZLİ KAYIT OKUNAMADI (venom:kimlikler) — yükleme durduruldu" >&2; return 1; }
  python3 -c '
import sys, json
d = json.loads(sys.argv[1])
eksik = [a for a in sys.argv[2:] if not str(d.get(a, "")).strip()]
if eksik: sys.exit("venom:kimlikler içinde eksik: " + ", ".join(eksik))
print(",".join(json.dumps({"type": "plain_text", "name": a, "text": str(d[a])}) for a in sys.argv[2:]))
' "$veri" "$@"
}
