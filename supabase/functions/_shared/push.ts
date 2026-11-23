// Envio de notificações para celulares: Firebase (Android) e Apple (iPhone).
// Segredos (Supabase > Edge Functions > Secrets). Sem eles, a plataforma correspondente fica desligada.
//   FCM_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase (Android)
//   APNS_KEY_P8          conteúdo da chave .p8 da Apple; APNS_KEY_ID; APNS_TEAM_ID
//   APNS_BUNDLE_ID       padrão br.com.kynovia.estetica;  APNS_PRODUCTION "true" para App Store/TestFlight

export type PushMessage = { title: string; body: string; url?: string };
export type PushResult = "sent" | "invalid_token" | "not_configured" | "error";

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, key: CryptoKey, algo: AlgorithmIdentifier | EcdsaParams) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(algo, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

// ---------- Android (Firebase Cloud Messaging v1) ----------
let fcmCache: { token: string; exp: number; project: string } | null = null;

async function fcmAccess() {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) return null;
  if (fcmCache && fcmCache.exp > Date.now() + 60_000) return fcmCache;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: "RS256", typ: "JWT" }, {
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }, key, { name: "RSASSA-PKCS1-v1_5" });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Firebase recusou a conta de serviço (${res.status})`);
  const data = await res.json() as { access_token: string; expires_in: number };
  fcmCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000, project: sa.project_id };
  return fcmCache;
}

async function sendAndroid(token: string, msg: PushMessage): Promise<PushResult> {
  const auth = await fcmAccess();
  if (!auth) return "not_configured";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token,
      notification: { title: msg.title, body: msg.body },
      data: { url: msg.url || "" },
      android: { priority: "HIGH", notification: { sound: "default" } },
    } }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) return "sent";
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) return "invalid_token";
  return "error";
}

// ---------- iPhone (Apple Push Notification service) ----------
let apnsCache: { jwt: string; exp: number } | null = null;

async function apnsJwt() {
  const p8 = Deno.env.get("APNS_KEY_P8"), keyId = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APNS_TEAM_ID");
  if (!p8 || !keyId || !team) return null;
  if (apnsCache && apnsCache.exp > Date.now()) return apnsCache.jwt;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(p8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const jwt = await signJwt({ alg: "ES256", kid: keyId }, { iss: team, iat: Math.floor(Date.now() / 1000) }, key, { name: "ECDSA", hash: "SHA-256" });
  apnsCache = { jwt, exp: Date.now() + 50 * 60_000 }; // a Apple aceita o mesmo token por até 1 hora
  return jwt;
}

async function sendIos(token: string, msg: PushMessage): Promise<PushResult> {
  const jwt = await apnsJwt();
  if (!jwt) return "not_configured";
  const host = Deno.env.get("APNS_PRODUCTION") === "true" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": Deno.env.get("APNS_BUNDLE_ID") || "br.com.kynovia.estetica",
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default" }, url: msg.url || "" }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) return "sent";
  const text = await res.text();
  if (res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) return "invalid_token";
  return "error";
}

export function sendPush(platform: "ios" | "android", token: string, msg: PushMessage): Promise<PushResult> {
  return platform === "ios" ? sendIos(token, msg) : sendAndroid(token, msg);
}
