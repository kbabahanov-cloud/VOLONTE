#!/usr/bin/env python3
"""Cloudflare aylık kullanım (Workers Paid, 5 $/ay; Patron kuralı 5 Kasım: fatura 5 $'ı geçmesin, %80'de Venom uyarsın).
Bu ayın başından bugüne kullanımı ölçer, ay sonu tahminini plana DAHİL limitlerle karşılaştırır ve KV "venom:cfKullanim"e yazar.
Venom her gün bakar: herhangi bir kalem %80'i geçerse (gerçek ya da ay sonu tahmini) Patron'a uyarı gönderir.
Kullanım: python3 araclar/cf-kullanim.py   (kimlik doğrulama ortamın vekil sunucusuyla; burada anahtar yok)"""
import json, urllib.request, datetime, calendar
HESAP = "9b7e7d56c7c591fb6c69d2e372b04e27"
KV = "cd4cd47b965142c6859bf702510166bb"
# Workers Paid'e dahil aylık limitler (aşan kısım ücretli)
DAHIL = {
    "Worker istekleri": 10_000_000, "Worker CPU (ms)": 30_000_000,
    "KV okuma": 10_000_000, "KV yazma": 1_000_000, "KV silme": 1_000_000, "KV listeleme": 1_000_000,
    "DO istekleri": 1_000_000, "DO süre (GB-sn)": 400_000, "DO satır okuma": 25_000_000_000, "DO satır yazma": 50_000_000,
}
simdi = datetime.datetime.now(datetime.timezone.utc)
bas = simdi.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
gun_gecen = max((simdi - bas).total_seconds() / 86400, 0.5)
ay_gun = calendar.monthrange(simdi.year, simdi.month)[1]
q = """query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
 w:workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests cpuTimeUs}}
 kv:kvOperationsAdaptiveGroups(limit:20,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{actionType}}
 do:durableObjectsInvocationsAdaptiveGroups(limit:20,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests}}
 dop:durableObjectsPeriodicGroups(limit:20,filter:{datetime_geq:$s,datetime_leq:$e}){sum{activeTime rowsRead rowsWritten}}
}}}"""
v = {"a": HESAP, "s": bas.strftime("%Y-%m-%dT%H:%M:%SZ"), "e": simdi.strftime("%Y-%m-%dT%H:%M:%SZ")}
istek = urllib.request.Request("https://api.cloudflare.com/client/v4/graphql", data=json.dumps({"query": q, "variables": v}).encode(), headers={"content-type": "application/json"})
d = json.load(urllib.request.urlopen(istek))
if d.get("errors"):
    raise SystemExit(json.dumps(d["errors"])[:500])
a = d["data"]["viewer"]["accounts"][0]
kv = {x["dimensions"]["actionType"]: x["sum"]["requests"] for x in a["kv"]}
dop = (a["dop"] or [{"sum": {}}])[0]["sum"]
olcum = {
    "Worker istekleri": sum(x["sum"]["requests"] for x in a["w"]),
    "Worker CPU (ms)": sum(x["sum"].get("cpuTimeUs", 0) for x in a["w"]) / 1000,
    "KV okuma": kv.get("read", 0), "KV yazma": kv.get("write", 0), "KV silme": kv.get("delete", 0), "KV listeleme": kv.get("list", 0),
    "DO istekleri": sum(x["sum"]["requests"] for x in a["do"]),
    "DO süre (GB-sn)": (dop.get("activeTime") or 0) / 1e6 * 0.125,  # 128 MB
    "DO satır okuma": dop.get("rowsRead") or 0, "DO satır yazma": dop.get("rowsWritten") or 0,
}
kalemler = []
for ad, sinir in DAHIL.items():
    deger = olcum.get(ad, 0)
    tahmin = deger / gun_gecen * ay_gun
    kalemler.append({"ad": ad, "deger": round(deger), "tahmin": round(tahmin), "sinir": sinir, "yuzde": round(100 * deger / sinir, 1), "tahminYuzde": round(100 * tahmin / sinir, 1)})
kalemler.sort(key=lambda k: -k["tahminYuzde"])
sonuc = {"zaman": int(simdi.timestamp()), "ay": simdi.strftime("%Y-%m"), "gun": round(gun_gecen, 1), "kalemler": kalemler}
url = f"https://api.cloudflare.com/client/v4/accounts/{HESAP}/storage/kv/namespaces/{KV}/values/venom:cfKullanim"
r = urllib.request.Request(url, data=json.dumps(sonuc, ensure_ascii=False).encode(), method="PUT", headers={"content-type": "application/json"})
print(urllib.request.urlopen(r).read().decode()[:120])
for k in kalemler[:5]:
    print(f"{k['ad']}: {k['deger']:,} (şimdi %{k['yuzde']}, ay sonu tahmini %{k['tahminYuzde']})")
