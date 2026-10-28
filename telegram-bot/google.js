// Google Sheets bağlantısı (Sayım Sami). Hizmet hesabı anahtarı Cloudflare'de gizli değişken GOOGLE_SA (JSON).
// Ücretsiz: Google Cloud'da faturalandırma gerekmez; Sheets API kotası (dakikada 300 istek) 5 dakikada bir yazmaya fazlasıyla yeter.
// Tablolar kullanıcının kendi Drive'ında durur; kullanıcı hizmet hesabının e-postasıyla "Düzenleyen" olarak paylaşır.
// Kimin göreceğini kullanıcı Google'da kendisi belirler (stok: ekip "Görüntüleyen", harcama: sadece kendisi).

const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlYazi = (s) => b64url(new TextEncoder().encode(s));

export function hizmetHesabi(env) {
  if (!env.GOOGLE_SA) return null;
  try {
    const j = JSON.parse(env.GOOGLE_SA);
    return j.client_email && j.private_key ? j : null;
  } catch {
    return null;
  }
}

// Erişim anahtarı (1 saat geçerli): 50 dakika saklanır.
export async function googleAnahtar(env, simdi = Math.floor(Date.now() / 1000)) {
  const kayit = await env.KAYIT.get("sami:googleAnahtar", "json");
  if (kayit && kayit.bitis - simdi > 300) return kayit.anahtar;
  const sa = hizmetHesabi(env);
  if (!sa) throw new Error("GOOGLE_SA yok ya da bozuk");
  const ust = b64urlYazi(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const govde = b64urlYazi(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: simdi, exp: simdi + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const anahtar = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const imza = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", anahtar, new TextEncoder().encode(`${ust}.${govde}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${ust}.${govde}.${b64url(imza)}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Google anahtar: ${JSON.stringify(j).slice(0, 200)}`);
  await env.KAYIT.put("sami:googleAnahtar", JSON.stringify({ anahtar: j.access_token, bitis: simdi + (j.expires_in || 3600) }), { expirationTtl: 3600 });
  return j.access_token;
}

async function sheets(env, yol, secenek = {}) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${yol}`, {
    ...secenek, headers: { authorization: `Bearer ${await googleAnahtar(env)}`, "content-type": "application/json", ...(secenek.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Sheets ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  return j;
}

// Link ya da kimlik → kimlik
export const tabloKimligi = (s) => (String(s || "").match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(s || "").match(/^([a-zA-Z0-9_-]{20,})$/) || [])[1] || null;

// Tablonun ilk sayfasını hazırlar (ad, başlık satırları sabit, kalın) — bir kez.
export async function sayfaHazirla(env, id, ad, sabitSatir) {
  const t = await sheets(env, `${id}?fields=sheets.properties`);
  const sayfa = t.sheets[0].properties;
  if (sayfa.title !== ad || (sayfa.gridProperties || {}).frozenRowCount !== sabitSatir) {
    await sheets(env, `${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [
      { updateSheetProperties: { properties: { sheetId: sayfa.sheetId, title: ad, gridProperties: { frozenRowCount: sabitSatir } }, fields: "title,gridProperties.frozenRowCount" } },
      { repeatCell: { range: { sheetId: sayfa.sheetId, startRowIndex: 0, endRowIndex: sabitSatir }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    ] }) });
  }
  return ad;
}

// Sayfanın tamamını verilen satırlarla değiştirir (önce temizler).
export async function sayfayaYaz(env, id, ad, satirlar) {
  await sheets(env, `${id}/values/${encodeURIComponent(ad)}:clear`, { method: "POST", body: "{}" });
  await sheets(env, `${id}/values/${encodeURIComponent(`${ad}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: satirlar }) });
}
