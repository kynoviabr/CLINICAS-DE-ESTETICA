// Recebe os avisos da Aura IA (plataforma de WhatsApp e IA da Kynovia): mensagem recebida/enviada e status.
// Confere a assinatura (HMAC-SHA256 do corpo com AURA_WEBHOOK_SECRET), grava a cópia no Clinova
// e conta à Aura quem é o contato (paciente ou lead), para a IA saber com quem fala.
// Publicada sem login do Supabase: a proteção é a assinatura.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError } from "../_shared/monitoring.ts";

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

type IngestResult = {
  ok?: boolean; aura_contact_id?: string | null; patient_id?: string | null; lead_id?: string | null;
  known_ref?: string | null; name?: string | null;
};

/** Conta à Aura quem é o contato no Clinova (só quando mudou). Falha aqui não derruba o aviso. */
async function syncContactRef(r: IngestResult) {
  if (!r?.aura_contact_id) return;
  const ref = r.patient_id || r.lead_id;
  if (!ref || ref === r.known_ref) return;
  const base = (Deno.env.get("AURA_API_URL") || "").replace(/\/$/, "");
  const key = (Deno.env.get("AURA_API_KEY") || "").trim();
  if (!base || !key) return;
  try {
    const res = await fetch(`${base}/v1/contacts/${r.aura_contact_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ externalType: r.patient_id ? "patient" : "lead", externalRef: ref, ...(r.name ? { name: r.name } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn("aura contact sync", res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.warn("aura contact sync", (e as Error).message);
  }
}

/** Avisa a cliente que o "DE ACORDO" foi registrado. Falha aqui não derruba o aviso (o aceite já está gravado). */
async function confirmAcceptance(admin: ReturnType<typeof createClient>, clinicId: string, messageId: string) {
  try {
    const { data: req } = await admin.from("whatsapp_acceptance_requests")
      .select("conversation_id, document_label, acceptance_id, whatsapp_conversations(external_id)")
      .eq("clinic_id", clinicId).eq("accepted_message_id", messageId).eq("status", "accepted").maybeSingle();
    const conv = (req as { whatsapp_conversations?: { external_id?: string } } | null)?.whatsapp_conversations;
    if (!req || !conv?.external_id) return;
    const { data: acc } = await admin.from("document_acceptances").select("verification_code").eq("id", req.acceptance_id).maybeSingle();
    const base = (Deno.env.get("AURA_API_URL") || "").replace(/\/$/, "");
    const key = (Deno.env.get("AURA_API_KEY") || "").trim();
    if (!base || !key) return;
    const text = `Recebemos o seu DE ACORDO para ${req.document_label}. Ele ficou registrado como aceite eletrônico`
      + (acc?.verification_code ? `, código de verificação ${acc.verification_code}.` : ".") + " Obrigado!";
    const res = await fetch(`${base}/v1/conversations/${conv.external_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn("aura confirm acceptance", res.status, (await res.text()).slice(0, 200)); return; }
    const sent = await res.json().catch(() => ({})) as { message?: { id?: string } };
    await admin.rpc("whatsapp_record_outgoing", { p_conversation_id: req.conversation_id, p_external_id: sent.message?.id || null, p_body: text, p_user: null });
  } catch (e) {
    console.warn("aura confirm acceptance", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const secret = (Deno.env.get("AURA_WEBHOOK_SECRET") || "").trim();
  if (!secret) return json({ ok: false, reason: "secret_not_configured" }, 500);

  const raw = await req.text();
  const signature = (req.headers.get("x-aura-signature") || "").trim().toLowerCase();
  if (!signature || !safeEqual(signature, await hmacHex(secret, raw))) {
    console.warn("aura webhook: assinatura inválida", { hasSignature: !!signature, secretLength: secret.length });
    return json({ ok: false, reason: "invalid_signature" }, 401);
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(raw); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("whatsapp_ingest_aura_event", { p_event: event });
  if (error) {
    await captureError("aura-webhook", new Error(`whatsapp_ingest_aura_event: ${error.message}`), { event: event?.type });
    return json({ ok: false }, 500); // a Aura tenta de novo; o banco ignora repetição
  }
  const result = data as IngestResult;
  if (result?.ok === false) console.warn("aura webhook ignorado", event?.type, result);
  await syncContactRef(result);
  // Mensagem escrita pela IA da Aura: marca para a tela mostrar "Aura IA".
  const msg = (event.data as { message?: { id?: string; source?: string } } | undefined)?.message;
  const clinicId = (event.data as { workspace?: { external_id?: string } } | undefined)?.workspace?.external_id;
  if (event.type === "message.sent" && msg?.source === "ai" && msg.id && clinicId) {
    await admin.from("whatsapp_messages").update({ sent_by_ai: true }).eq("clinic_id", clinicId).eq("external_id", msg.id);
  }
  // Resposta "DE ACORDO" registrada pelo banco: confirma para a cliente com o código de verificação.
  if (event.type === "message.received" && msg?.id && clinicId) await confirmAcceptance(admin, clinicId, msg.id);
  return json({ ok: true });
});
