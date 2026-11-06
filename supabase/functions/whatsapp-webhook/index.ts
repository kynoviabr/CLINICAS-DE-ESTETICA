// Recebe os avisos da Zernio (mensagens recebidas, enviadas, entregues, lidas, falhas).
// Confere a assinatura (HMAC-SHA256 do corpo com ZERNIO_WEBHOOK_SECRET) e grava pelo banco.
// Publicada sem exigir login (a Zernio não manda token do Supabase): a assinatura é a proteção.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const secret = Deno.env.get("ZERNIO_WEBHOOK_SECRET") || "";
  if (!secret) return json({ ok: false, reason: "secret_not_configured" }, 500);

  const raw = await req.text();
  const signature = (req.headers.get("x-zernio-signature") || req.headers.get("x-late-signature") || "").trim().toLowerCase();
  if (!signature || !safeEqual(signature, await hmacHex(secret, raw))) {
    return json({ ok: false, reason: "invalid_signature" }, 401);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("whatsapp_ingest_event", { p_event: event });
  if (error) {
    console.error("whatsapp_ingest_event", event?.event, error.message);
    // 500 faz a Zernio tentar de novo; o banco ignora repetições.
    return json({ ok: false }, 500);
  }
  if (data && (data as { ok?: boolean }).ok === false) console.warn("whatsapp webhook ignored", event?.event, data);
  return json({ ok: true });
});
