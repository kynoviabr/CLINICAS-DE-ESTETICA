// WhatsApp da clínica (provedor Zernio), chamado pelo app com o login da equipe.
// Ações: connect_start / connect_finish (admin), templates, send_text, send_template.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const ZERNIO = "https://zernio.com/api/v1";
const WINDOW_MS = 24 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function zernio(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("ZERNIO_API_KEY");
  if (!key) throw new HttpError(500, "WhatsApp ainda não configurado no servidor (chave da Zernio).");
  const res = await fetch(`${ZERNIO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    console.error("zernio", path, res.status, text.slice(0, 500));
    const message = String(data.error || data.message || `Erro ${res.status} no WhatsApp`);
    throw new HttpError(res.status === 402 ? 402 : 502, message, String(data.code || ""));
  }
  return data;
}

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Número para a API: só dígitos, com 55 quando vier sem o código do país. */
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

function renderTemplate(body: string, params: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);
}

async function requireStaff(admin: SupabaseClient, userId: string, clinicId: string) {
  const { data } = await admin.rpc("is_clinic_staff", { _user_id: userId, _clinic_id: clinicId });
  if (!data) throw new HttpError(403, "Sem acesso a esta clínica.");
}

async function requireAdmin(admin: SupabaseClient, userId: string, clinicId: string) {
  const { data } = await admin.rpc("has_clinic_role", { _user_id: userId, _clinic_id: clinicId, _role: "admin" });
  if (!data) throw new HttpError(403, "Só o administrador da clínica pode conectar o WhatsApp.");
}

async function channelOf(admin: SupabaseClient, clinicId: string) {
  const { data } = await admin.from("whatsapp_channels").select("*").eq("clinic_id", clinicId).maybeSingle();
  if (!data?.account_id || data.status !== "connected") throw new HttpError(409, "Conecte o WhatsApp da clínica em Configurações.", "not_connected");
  return data;
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
      if (!/^https?:\/\//.test(redirectUrl)) throw new HttpError(400, "Endereço de retorno inválido.");
      const { data: clinic } = await admin.from("clinics").select("name").eq("id", clinicId).single();
      const { data: channel } = await admin.from("whatsapp_channels").select("*").eq("clinic_id", clinicId).maybeSingle();

      let profileId: string | null = channel?.profile_id || null;
      if (!profileId) {
        const found = await zernio(`/profiles?externalId=${encodeURIComponent(clinicId)}`);
        profileId = ((found.profiles as Array<{ _id: string }>) || [])[0]?._id || null;
      }
      if (!profileId) {
        const created = await zernio("/profiles", {
          method: "POST",
          body: JSON.stringify({ name: (clinic?.name || "Clínica").slice(0, 80), externalId: clinicId, timezone: "America/Sao_Paulo" }),
        });
        profileId = (created.profile as { _id: string })?._id;
      }
      await admin.from("whatsapp_channels").upsert(
        { clinic_id: clinicId, profile_id: profileId, status: channel?.status === "connected" ? "connected" : "pending", updated_at: new Date().toISOString() },
        { onConflict: "clinic_id" },
      );
      const connect = await zernio(`/connect/whatsapp?profileId=${profileId}&redirect_url=${encodeURIComponent(redirectUrl)}`);
      return reply({ authUrl: connect.authUrl });
    }

    if (action === "connect_finish") {
      const clinicId = String(body.clinicId || "");
      await requireAdmin(admin, user.id, clinicId);
      const { data: channel } = await admin.from("whatsapp_channels").select("*").eq("clinic_id", clinicId).maybeSingle();
      if (!channel?.profile_id) throw new HttpError(409, "Comece a conexão pelo botão Conectar WhatsApp.");
      const list = await zernio(`/accounts?profileId=${channel.profile_id}&platform=whatsapp`);
      const accounts = (list.accounts as Array<Record<string, unknown>>) || [];
      const wanted = String(body.accountId || "");
      const account = accounts.find((a) => a._id === wanted) || (!wanted ? accounts[0] : undefined);
      if (!account) throw new HttpError(404, "Não encontramos o número conectado. Tente conectar de novo.");
      await admin.from("whatsapp_channels").update({
        account_id: account._id,
        phone_number: (account.metadata as Record<string, unknown>)?.displayPhoneNumber || account.username || null,
        display_name: account.displayName || null,
        status: "connected",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("clinic_id", clinicId);
      return reply({ ok: true });
    }

    // ---------- Modelos aprovados (para abrir conversa ou depois de 24h) ----------
    if (action === "templates") {
      const clinicId = String(body.clinicId || "");
      await requireStaff(admin, user.id, clinicId);
      const channel = await channelOf(admin, clinicId);
      const res = await zernio(`/whatsapp/templates?accountId=${channel.account_id}&status=APPROVED`);
      const templates = ((res.templates as Array<Record<string, unknown>>) || []).map((t) => {
        const comps = (t.components as Array<Record<string, unknown>>) || [];
        const text = String(comps.find((c) => c.type === "BODY")?.text || "");
        const vars = new Set(text.match(/\{\{\d+\}\}/g) || []).size;
        return { name: t.name, language: t.language, category: t.category, body: text, variables: vars };
      });
      return reply({ templates });
    }

    // ---------- Responder dentro da janela de 24h ----------
    if (action === "send_text") {
      const text = String(body.text || "").trim();
      if (!text) throw new HttpError(400, "Escreva a mensagem.");
      if (text.length > 4000) throw new HttpError(400, "Mensagem muito longa.");
      const { data: conv } = await admin.from("whatsapp_conversations").select("*").eq("id", String(body.conversationId || "")).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireStaff(admin, user.id, conv.clinic_id);
      const channel = await channelOf(admin, conv.clinic_id);
      if (!conv.last_incoming_at || Date.now() - new Date(conv.last_incoming_at).getTime() > WINDOW_MS) {
        throw new HttpError(409, "Passaram 24h desde a última mensagem da cliente. Envie um modelo aprovado.", "window_closed");
      }
      const sent = await zernio(`/inbox/conversations/${conv.external_id}/messages`, {
        method: "POST",
        body: JSON.stringify({ accountId: channel.account_id, message: text }),
      });
      const messageId = (sent.data as { messageId?: string })?.messageId || null;
      await admin.rpc("whatsapp_record_outgoing", { p_conversation_id: conv.id, p_external_id: messageId, p_body: text, p_user: user.id });
      return reply({ ok: true });
    }

    // ---------- Modelo aprovado: abre conversa nova ou reabre depois de 24h ----------
    if (action === "send_template") {
      const clinicId = String(body.clinicId || "");
      await requireStaff(admin, user.id, clinicId);
      const channel = await channelOf(admin, clinicId);
      const name = String(body.templateName || "");
      const language = String(body.language || "pt_BR");
      const params = ((body.params as unknown[]) || []).map((p) => String(p ?? "").slice(0, 500));
      const preview = renderTemplate(String(body.templateBody || `[modelo ${name}]`), params);
      if (!name) throw new HttpError(400, "Escolha o modelo.");

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

      let messageId: string | null = null;
      if (conv) {
        const sent = await zernio(`/inbox/conversations/${conv.external_id}/messages`, {
          method: "POST",
          body: JSON.stringify({
            accountId: channel.account_id,
            template: { elements: [{ name, language, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] }] },
          }),
        });
        messageId = (sent.data as { messageId?: string })?.messageId || null;
      } else {
        const phone = waNumber(body.phone);
        if (phone.length < 12) throw new HttpError(400, "Telefone inválido. Use DDD + número.");
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
        const opened = await zernio("/inbox/conversations", {
          method: "POST",
          body: JSON.stringify({ accountId: channel.account_id, participantId: phone, templateName: name, templateLanguage: language, templateParams: params }),
        });
        const data = opened.data as { conversationId?: string; messageId?: string };
        messageId = data?.messageId || null;
        if (!data?.conversationId) throw new HttpError(502, "O WhatsApp não devolveu a conversa.");
        const { data: upserted, error } = await admin.from("whatsapp_conversations").upsert({
          clinic_id: clinicId, external_id: data.conversationId, account_id: channel.account_id,
          contact_phone: phone, contact_key: phoneKey(phone), contact_name: body.contactName ? String(body.contactName) : null,
          ...(leadId ? { lead_id: leadId } : {}), ...(patientId ? { patient_id: patientId } : {}),
        }, { onConflict: "clinic_id,external_id", ignoreDuplicates: false }).select("*").single();
        if (error) throw new HttpError(500, error.message);
        conv = upserted;
      }
      await admin.rpc("whatsapp_record_outgoing", { p_conversation_id: conv!.id, p_external_id: messageId, p_body: preview, p_user: user.id });
      return reply({ ok: true, conversationId: conv!.id });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (err) {
    const e = err as HttpError;
    if (!(err instanceof HttpError)) console.error(err);
    return reply({ error: e.message || "Erro inesperado", code: e.code }, e.status || 500);
  }
});
