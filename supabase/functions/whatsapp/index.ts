// WhatsApp da clínica, chamado pelo app com o login da equipe.
// O canal é da Aura IA (plataforma de WhatsApp e IA da Kynovia): o Clinova não fala com a Zernio,
// fala com a API da Aura (AURA_API_URL + AURA_API_KEY). Cada clínica é uma "empresa" na Aura (id = clinic_id).
// Ações: connect_start / connect_finish (admin), templates, send_text, send_template, suggest (copiloto da Aura IA),
// ai_mode (admin: copilot = sugerir resposta, auto = IA responde sozinha), ai_status / ai_pause (IA numa conversa).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const WINDOW_MS = 24 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Chamada à API da Aura IA. Erros da Aura viram mensagem legível para a tela. */
async function aura(path: string, init: RequestInit = {}) {
  const base = (Deno.env.get("AURA_API_URL") || "").replace(/\/$/, "");
  const key = (Deno.env.get("AURA_API_KEY") || "").trim();
  if (!base || !key) throw new HttpError(500, "WhatsApp ainda não configurado no servidor (Aura IA).");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    console.error("aura", path, res.status, text.slice(0, 500));
    const err = (data.error || {}) as { code?: string; message?: string };
    throw new HttpError(res.status === 402 ? 402 : res.status === 409 ? 409 : 502, err.message || `Erro ${res.status} no WhatsApp`, err.code);
  }
  return data;
}

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Número para o WhatsApp: só dígitos, com 55 quando vier sem o código do país. */
function waNumber(phone: unknown) {
  const d = digits(phone);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/** Mesma chave do banco (private.phone_key): DDD + últimos 8 dígitos, para achar o número com ou sem o 9. */
function phoneKey(phone: unknown) {
  let d = digits(phone);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d.length < 8 ? null : d;
}

async function requireStaff(admin: SupabaseClient, userId: string, clinicId: string) {
  const { data } = await admin.rpc("is_clinic_staff", { _user_id: userId, _clinic_id: clinicId });
  if (!data) throw new HttpError(403, "Sem acesso a esta clínica.");
}

async function requireAdmin(admin: SupabaseClient, userId: string, clinicId: string) {
  const { data } = await admin.rpc("has_clinic_role", { _user_id: userId, _clinic_id: clinicId, _role: "admin" });
  if (!data) throw new HttpError(403, "Só o administrador da clínica pode conectar o WhatsApp.");
}

async function requireConnected(admin: SupabaseClient, clinicId: string) {
  const { data } = await admin.from("whatsapp_channels").select("status").eq("clinic_id", clinicId).maybeSingle();
  if (data?.status !== "connected") throw new HttpError(409, "Conecte o WhatsApp da clínica em Configurações.", "not_connected");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new HttpError(401, "Não autorizado");
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new HttpError(401, "Sessão expirada. Entre de novo.");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ---------- Conectar o número da clínica ----------
    if (action === "connect_start") {
      const clinicId = String(body.clinicId || "");
      await requireAdmin(admin, user.id, clinicId);
      const redirectUrl = String(body.redirectUrl || "");
      if (!/^https:\/\//.test(redirectUrl)) throw new HttpError(400, "Endereço de retorno inválido.");
      const { data: clinic } = await admin.from("clinics").select("name").eq("id", clinicId).single();
      await aura(`/v1/workspaces/${clinicId}`, { method: "PUT", body: JSON.stringify({ name: clinic?.name || "Clínica" }) });
      const { data: channel } = await admin.from("whatsapp_channels").select("status").eq("clinic_id", clinicId).maybeSingle();
      await admin.from("whatsapp_channels").upsert(
        { clinic_id: clinicId, provider: "aura", status: channel?.status === "connected" ? "connected" : "pending", updated_at: new Date().toISOString() },
        { onConflict: "clinic_id" },
      );
      const connect = await aura(`/v1/workspaces/${clinicId}/channel/connect`, { method: "POST", body: JSON.stringify({ redirectUrl }) });
      return reply({ authUrl: connect.authUrl });
    }

    if (action === "connect_finish") {
      const clinicId = String(body.clinicId || "");
      await requireAdmin(admin, user.id, clinicId);
      await aura(`/v1/workspaces/${clinicId}/channel/finish`, { method: "POST", body: JSON.stringify({ accountId: String(body.accountId || "") }) });
      const { channel } = await aura(`/v1/workspaces/${clinicId}/channel`) as { channel?: { phone_number?: string; display_name?: string } };
      await admin.from("whatsapp_channels").update({
        provider: "aura", phone_number: channel?.phone_number || null, display_name: channel?.display_name || null,
        status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("clinic_id", clinicId);
      return reply({ ok: true });
    }

    // ---------- Modelos aprovados (para abrir conversa ou depois de 24h) ----------
    if (action === "templates") {
      const clinicId = String(body.clinicId || "");
      await requireStaff(admin, user.id, clinicId);
      await requireConnected(admin, clinicId);
      const res = await aura(`/v1/workspaces/${clinicId}/templates`);
      return reply({ templates: res.templates || [] });
    }

    // ---------- Responder dentro da janela de 24h ----------
    if (action === "send_text") {
      const text = String(body.text || "").trim();
      if (!text) throw new HttpError(400, "Escreva a mensagem.");
      if (text.length > 4000) throw new HttpError(400, "Mensagem muito longa.");
      const { data: conv } = await admin.from("whatsapp_conversations").select("*").eq("id", String(body.conversationId || "")).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireStaff(admin, user.id, conv.clinic_id);
      await requireConnected(admin, conv.clinic_id);
      if (!conv.last_incoming_at || Date.now() - new Date(conv.last_incoming_at).getTime() > WINDOW_MS) {
        throw new HttpError(409, "Passaram 24h desde a última mensagem da cliente. Envie um modelo aprovado.", "window_closed");
      }
      const sent = await aura(`/v1/conversations/${conv.external_id}/messages`, {
        method: "POST", body: JSON.stringify({ text, sentBy: user.id, ...(body.suggestionId ? { suggestionId: String(body.suggestionId) } : {}) }),
      }) as { message?: { id?: string } };
      await admin.rpc("whatsapp_record_outgoing", { p_conversation_id: conv.id, p_external_id: sent.message?.id || null, p_body: text, p_user: user.id });
      return reply({ ok: true });
    }

    // ---------- Copiloto: a Aura IA sugere a resposta (a pessoa revisa e envia) ----------
    if (action === "suggest") {
      const { data: conv } = await admin.from("whatsapp_conversations").select("id, clinic_id, external_id").eq("id", String(body.conversationId || "")).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireStaff(admin, user.id, conv.clinic_id);
      await requireConnected(admin, conv.clinic_id);
      const res = await aura(`/v1/conversations/${conv.external_id}/suggest`, { method: "POST", body: "{}" });
      return reply({ suggestion: res.suggestion });
    }

    // ---------- Modo da IA da clínica (guardado no Clinova e na Aura) ----------
    if (action === "ai_mode") {
      const clinicId = String(body.clinicId || "");
      await requireAdmin(admin, user.id, clinicId);
      const mode = String(body.mode || "");
      if (!["copilot", "auto", "off"].includes(mode)) throw new HttpError(400, "Modo inválido.");
      if (mode === "auto") await requireConnected(admin, clinicId);
      const { data: clinic } = await admin.from("clinics").select("name").eq("id", clinicId).single();
      await aura(`/v1/workspaces/${clinicId}`, { method: "PUT", body: JSON.stringify({ name: clinic?.name || "Clínica" }) });
      await aura(`/v1/workspaces/${clinicId}/ai`, { method: "PUT", body: JSON.stringify({ mode }) });
      const { error } = await admin.from("clinic_settings").upsert({ clinic_id: clinicId, key: "aura_ai_mode", value: mode }, { onConflict: "clinic_id,key" });
      if (error) throw new HttpError(500, error.message);
      return reply({ mode });
    }

    // ---------- IA numa conversa: ver se está pausada, pausar ou devolver ----------
    if (action === "ai_status" || action === "ai_pause") {
      const { data: conv } = await admin.from("whatsapp_conversations").select("id, clinic_id, external_id").eq("id", String(body.conversationId || "")).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireStaff(admin, user.id, conv.clinic_id);
      if (action === "ai_pause") {
        const res = await aura(`/v1/conversations/${conv.external_id}/ai`, {
          method: "POST", body: JSON.stringify({ paused: body.paused !== false, hours: 24, reason: "Pausada pela equipe no Clinova" }),
        }) as { ai?: { ai_paused_until?: string | null; ai_pause_reason?: string | null } };
        return reply({ pausedUntil: res.ai?.ai_paused_until || null, reason: res.ai?.ai_pause_reason || null });
      }
      const res = await aura(`/v1/conversations/${conv.external_id}`) as { conversation?: { ai_paused_until?: string | null; ai_pause_reason?: string | null } };
      const until = res.conversation?.ai_paused_until || null;
      const active = until && new Date(until).getTime() > Date.now();
      return reply({ pausedUntil: active ? until : null, reason: active ? res.conversation?.ai_pause_reason || null : null });
    }

    // ---------- Modelo aprovado: abre conversa nova ou reabre depois de 24h ----------
    if (action === "send_template") {
      const clinicId = String(body.clinicId || "");
      await requireStaff(admin, user.id, clinicId);
      await requireConnected(admin, clinicId);
      const name = String(body.templateName || "");
      if (!name) throw new HttpError(400, "Escolha o modelo.");
      const params = ((body.params as unknown[]) || []).map((p) => String(p ?? "").slice(0, 500));

      let conv: Record<string, unknown> | null = null;
      if (body.conversationId) {
        const { data } = await admin.from("whatsapp_conversations").select("*").eq("id", String(body.conversationId)).eq("clinic_id", clinicId).maybeSingle();
        conv = data;
        if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      } else if (phoneKey(body.phone)) {
        // Já existe conversa com este número? Continua nela.
        const { data } = await admin.from("whatsapp_conversations").select("*").eq("clinic_id", clinicId)
          .eq("contact_key", phoneKey(body.phone)).order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        conv = data;
      }

      const leadId = body.leadId ? String(body.leadId) : null;
      const patientId = body.patientId ? String(body.patientId) : null;
      if (leadId) {
        const { data } = await admin.from("leads").select("id").eq("id", leadId).eq("clinic_id", clinicId).maybeSingle();
        if (!data) throw new HttpError(404, "Lead não encontrado.");
      }
      if (patientId) {
        const { data } = await admin.from("patients").select("id").eq("id", patientId).eq("clinic_id", clinicId).maybeSingle();
        if (!data) throw new HttpError(404, "Paciente não encontrada.");
      }

      const phone = conv ? null : waNumber(body.phone);
      if (!conv && (!phone || phone.length < 12)) throw new HttpError(400, "Telefone inválido. Use DDD + número.");
      const sent = await aura(`/v1/workspaces/${clinicId}/templates/send`, {
        method: "POST",
        body: JSON.stringify({
          ...(conv ? { conversationId: conv.external_id } : { phone }),
          templateName: name, language: String(body.language || "pt_BR"), params,
          templateBody: String(body.templateBody || ""), sentBy: user.id,
          contact: {
            name: body.contactName ? String(body.contactName) : undefined,
            externalType: patientId ? "patient" : leadId ? "lead" : undefined,
            externalRef: patientId || leadId || undefined,
          },
        }),
      }) as { conversationId: string; contactId?: string; message?: { id?: string; body?: string } };

      if (!conv) {
        const { data: upserted, error } = await admin.from("whatsapp_conversations").upsert({
          clinic_id: clinicId, external_id: sent.conversationId, contact_phone: phone, contact_key: phoneKey(phone),
          contact_name: body.contactName ? String(body.contactName) : null, aura_contact_id: sent.contactId || null,
          ...(leadId ? { lead_id: leadId } : {}), ...(patientId ? { patient_id: patientId } : {}),
        }, { onConflict: "clinic_id,external_id", ignoreDuplicates: false }).select("*").single();
        if (error) throw new HttpError(500, error.message);
        conv = upserted;
      }
      await admin.rpc("whatsapp_record_outgoing", {
        p_conversation_id: conv!.id, p_external_id: sent.message?.id || null,
        p_body: sent.message?.body || `[modelo ${name}]`, p_user: user.id,
      });
      return reply({ ok: true, conversationId: conv!.id });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (err) {
    const e = err as HttpError;
    if (!(err instanceof HttpError)) console.error(err);
    return reply({ error: e.message || "Erro inesperado", code: e.code }, e.status || 500);
  }
});
