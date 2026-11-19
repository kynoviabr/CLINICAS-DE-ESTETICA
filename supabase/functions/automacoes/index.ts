// Automações da clínica (Configurações > Automações).
// - action "run": chamado a cada 15 min pelo agendador do banco (x-runner-token = segredo automations_runner_token do Vault).
//   Para cada clínica com o lembrete ligado e WhatsApp conectado, manda o modelo aprovado com o link de confirmar/remarcar.
// - action "test": a administradora manda um lembrete de exemplo para o próprio número (precisa estar logada).
// O envio passa pela API da Aura (AURA_API_URL + AURA_API_KEY), como o resto do WhatsApp do Clinova.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canSendNow, reminderParams, reminderWindow, shortError } from "../_shared/reminders.ts";
import { sha256Hex } from "../_shared/patient-link.ts";
import { offsetFor } from "../_shared/agenda.ts";
import { captureError } from "../_shared/monitoring.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function aura(path: string, init: RequestInit = {}) {
  const base = (Deno.env.get("AURA_API_URL") || "").replace(/\/$/, "");
  const key = (Deno.env.get("AURA_API_KEY") || "").trim();
  if (!base || !key) throw new Error("Aura não configurada (AURA_API_URL / AURA_API_KEY).");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = (data.error || {}) as { code?: string; message?: string };
    throw new Error(err.message || err.code || `Aura respondeu ${res.status}`);
  }
  return data;
}

function waNumber(phone: unknown) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 ? d : null;
}

function phoneKey(phone: unknown) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d.length < 8 ? null : d;
}

/** Link do épico 6 (mesmo formato do create_appointment_link). */
async function createLink(db: SupabaseClient, clinicId: string, appointmentId: string, startIso: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await db.from("appointment_links").insert({
    clinic_id: clinicId, appointment_id: appointmentId, token_hash: await sha256Hex(token), expires_at: startIso, created_by: null,
  });
  if (error) throw error;
  const origin = (Deno.env.get("APP_URL") || "https://klinova-homolog.vercel.app").replace(/\/$/, "");
  return `${origin}/agendamento/${token}`;
}

type Who = { name: string; phone: string | null; patientId: string | null; leadId: string | null };

/** Manda o modelo e registra a mensagem na conversa do Clinova (aparece em Conversas). */
async function sendTemplate(db: SupabaseClient, clinicId: string, who: Who, template: string, language: string, params: string[]) {
  const phone = waNumber(who.phone);
  if (!phone) throw new Error("Telefone inválido.");
  const { data: existing } = await db.from("whatsapp_conversations").select("id, external_id").eq("clinic_id", clinicId)
    .eq("contact_key", phoneKey(phone)).order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const sent = await aura(`/v1/workspaces/${clinicId}/templates/send`, {
    method: "POST",
    body: JSON.stringify({
      ...(existing ? { conversationId: existing.external_id } : { phone }),
      templateName: template, language, params, sentBy: "automacao",
      contact: { name: who.name, externalType: who.patientId ? "patient" : who.leadId ? "lead" : undefined, externalRef: who.patientId || who.leadId || undefined },
    }),
  }) as { conversationId: string; contactId?: string; message?: { id?: string; body?: string } };
  let convId = existing?.id;
  if (!convId) {
    const { data, error } = await db.from("whatsapp_conversations").upsert({
      clinic_id: clinicId, external_id: sent.conversationId, contact_phone: phone, contact_key: phoneKey(phone), contact_name: who.name,
      aura_contact_id: sent.contactId || null, ...(who.leadId ? { lead_id: who.leadId } : {}), ...(who.patientId ? { patient_id: who.patientId } : {}),
    }, { onConflict: "clinic_id,external_id", ignoreDuplicates: false }).select("id").single();
    if (error) throw error;
    convId = data.id;
  }
  await db.rpc("whatsapp_record_outgoing", { p_conversation_id: convId, p_external_id: sent.message?.id || null, p_body: sent.message?.body || `[modelo ${template}]`, p_user: null });
}

const APPT = "id, clinic_id, start_time, patient_id, lead_id, patient:patients!appointments_patient_id_fkey(full_name, phone), lead:leads!appointments_lead_id_fkey(full_name, phone)";

async function runClinic(db: SupabaseClient, cfg: { clinic_id: string; reminder_hours_before: number; reminder_template: string; reminder_language: string }, clinicName: string, offsetMin: number) {
  const w = reminderWindow(Date.now(), cfg.reminder_hours_before);
  const { data: appts, error } = await db.from("appointments").select(APPT).eq("clinic_id", cfg.clinic_id).eq("status", "scheduled")
    .gte("start_time", w.from).lte("start_time", w.to).lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString()).order("start_time").limit(100);
  if (error) throw error;
  const ids = (appts || []).map((a) => a.id);
  if (!ids.length) return { sent: 0, failed: 0, skipped: 0 };
  const { data: done } = await db.from("automation_runs").select("appointment_id, status, attempts").eq("kind", "reminder").in("appointment_id", ids);
  const byId = new Map((done || []).map((r) => [r.appointment_id, r]));
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const a of appts as unknown as Array<{ id: string; start_time: string; patient_id: string | null; lead_id: string | null; patient: { full_name: string; phone: string | null } | null; lead: { full_name: string; phone: string | null } | null }>) {
    const prev = byId.get(a.id);
    if (prev && (prev.status !== "failed" || prev.attempts >= 3)) continue;
    const who: Who = { name: a.patient?.full_name || a.lead?.full_name || "Paciente", phone: a.patient?.phone || a.lead?.phone || null, patientId: a.patient_id, leadId: a.patient_id ? null : a.lead_id };
    let status: "sent" | "failed" | "skipped" = "sent";
    let detail = `Modelo ${cfg.reminder_template}`;
    if (!waNumber(who.phone)) { status = "skipped"; detail = "Sem telefone válido no cadastro."; }
    else {
      try {
        const url = await createLink(db, cfg.clinic_id, a.id, a.start_time);
        await sendTemplate(db, cfg.clinic_id, who, cfg.reminder_template, cfg.reminder_language, reminderParams(who.name, clinicName, a.start_time, url, offsetMin));
      } catch (e) { status = "failed"; detail = shortError(e); }
    }
    out[status] += 1;
    const row = { clinic_id: cfg.clinic_id, appointment_id: a.id, kind: "reminder", status, detail, recipient_name: who.name, attempts: (prev?.attempts || 0) + 1, updated_at: new Date().toISOString() };
    if (prev) await db.from("automation_runs").update(row).eq("appointment_id", a.id).eq("kind", "reminder");
    else await db.from("automation_runs").insert(row);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    if (body.action === "run") {
      const given = req.headers.get("x-runner-token") || "";
      const expected = (Deno.env.get("AUTOMATIONS_RUNNER_TOKEN") || "").trim();
      const ok = expected ? given === expected : !!(await db.rpc("automations_token_ok", { p_token: given })).data;
      if (!ok) return json({ ok: false, reason: "unauthorized" }, 401);
      const { data: cfgs } = await db.from("clinic_automations").select("clinic_id, reminder_hours_before, reminder_template, reminder_language").eq("reminder_enabled", true);
      const results: Record<string, unknown> = {};
      for (const cfg of cfgs || []) {
        const [{ data: ch }, { data: clinic }] = await Promise.all([
          db.from("whatsapp_channels").select("status").eq("clinic_id", cfg.clinic_id).maybeSingle(),
          db.from("clinics").select("name, timezone").eq("id", cfg.clinic_id).maybeSingle(),
        ]);
        const off = offsetFor(clinic?.timezone);
        if (!canSendNow(Date.now(), off)) { results[cfg.clinic_id] = "quiet_hours"; continue; }
        if (ch?.status !== "connected") { results[cfg.clinic_id] = "whatsapp_not_connected"; continue; }
        try { results[cfg.clinic_id] = await runClinic(db, cfg, clinic?.name || "clínica", off); }
        catch (e) { await captureError("automacoes", e, { route: "run" }); results[cfg.clinic_id] = "error"; }
      }
      return json({ ok: true, results });
    }

    if (body.action === "test") {
      const auth = req.headers.get("Authorization") || "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ ok: false, error: "Faça login de novo." }, 401);
      const clinicId = String(body.clinicId || "");
      const { data: isAdmin } = await db.rpc("has_clinic_role", { _user_id: user.id, _clinic_id: clinicId, _role: "admin" });
      if (!isAdmin) return json({ ok: false, error: "Só a administração da clínica pode testar." }, 403);
      const { data: ch } = await db.from("whatsapp_channels").select("status").eq("clinic_id", clinicId).maybeSingle();
      if (ch?.status !== "connected") return json({ ok: false, error: "Conecte o WhatsApp em Configurações antes de testar." }, 409);
      const { data: cfg } = await db.from("clinic_automations").select("*").eq("clinic_id", clinicId).maybeSingle();
      const { data: clinic } = await db.from("clinics").select("name, timezone").eq("id", clinicId).maybeSingle();
      const origin = (Deno.env.get("APP_URL") || "https://klinova-homolog.vercel.app").replace(/\/$/, "");
      const sample = new Date(Date.now() + 26 * 3600_000).toISOString();
      const params = reminderParams(String(body.name || "Teste"), clinic?.name || "clínica", sample, `${origin}/agendamento/exemplo`, offsetFor(clinic?.timezone));
      try {
        await sendTemplate(db, clinicId, { name: String(body.name || "Teste"), phone: String(body.phone || ""), patientId: null, leadId: null },
          cfg?.reminder_template || "aura_lembrete_horario", cfg?.reminder_language || "pt_BR", params);
      } catch (e) { return json({ ok: false, error: shortError(e) }, 502); }
      await db.from("automation_runs").insert({ clinic_id: clinicId, kind: "reminder_test", status: "sent", detail: "Teste enviado pela administração", recipient_name: String(body.name || "Teste") });
      return json({ ok: true });
    }
    return json({ ok: false, reason: "invalid_action" }, 400);
  } catch (e) {
    await captureError("automacoes", e, { route: String(body.action || "") });
    return json({ ok: false, error: "Erro inesperado." }, 500);
  }
});
