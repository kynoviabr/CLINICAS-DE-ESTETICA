// Agendamento feito pelo paciente (épico 21). Só com "Agendamento online" ligado na clínica.
// Público (sem login): public_slots / public_book -> avaliação pelo link /agendar/<slug>; cria o lead no CRM.
// Portal (login do paciente): portal_options / portal_slots / portal_book -> próxima sessão dos tratamentos do contrato.
// Horários: mesmo cálculo da agenda e da IA (_shared/agenda.ts + _shared/clinic-agenda.ts).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays, computeSlots, isSlotFree, localDate, localIso, type Pro } from "../_shared/agenda.ts";
import { loadAgenda, loadSettings, type Settings } from "../_shared/clinic-agenda.ts";
import { captureError } from "../_shared/monitoring.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (reason: string, status = 200) => json({ ok: false, reason }, status);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const EVALUATION = "evaluation";

type Service = { id: string; name: string; durationMin: number; pros: Pro[]; treatmentId: string | null; kind: "evaluation" | "treatment" };

async function activePros(db: SupabaseClient, clinicId: string): Promise<Pro[]> {
  const { data } = await db.from("professionals").select("id, full_name, show_name_to_clients").eq("clinic_id", clinicId).eq("status", "active");
  return (data || []).map((p) => ({ id: p.id, name: p.full_name, showName: p.show_name_to_clients }));
}

async function serviceFor(db: SupabaseClient, clinicId: string, serviceId: string, s: Settings): Promise<Service | null> {
  const pros = await activePros(db, clinicId);
  if (serviceId === EVALUATION) {
    if (!s.offers_evaluation) return null;
    return { id: EVALUATION, name: "Avaliação", durationMin: s.evaluation_minutes, pros, treatmentId: null, kind: "evaluation" };
  }
  const { data: t } = await db.from("treatments").select("id, name, duration_minutes").eq("clinic_id", clinicId).eq("id", serviceId).eq("is_active", true).maybeSingle();
  if (!t) return null;
  const { data: links } = await db.from("professional_treatments").select("professional_id").eq("treatment_id", t.id).eq("status", "active");
  const ids = new Set((links || []).map((l) => l.professional_id));
  return { id: t.id, name: t.name, durationMin: Math.max(15, Number(t.duration_minutes) || 60), pros: pros.filter((p) => ids.has(p.id)), treatmentId: t.id, kind: "treatment" };
}

async function slots(db: SupabaseClient, clinicId: string, svc: Service, s: Settings, fromRaw: unknown) {
  const today = localDate(Date.now(), s.offsetMin);
  const from = isDate(fromRaw) && fromRaw > today ? fromRaw : today;
  const to = addDays(from, 6);
  const lastDay = addDays(today, s.booking_horizon_days);
  if (!svc.pros.length) return { ok: true, from, to, lastDay, slots: [] };
  const data = await loadAgenda(db, clinicId, svc.pros, svc.durationMin, s, from, to);
  const r = computeSlots({ ...data, from, to });
  return { ok: true, from, to, lastDay, slots: r.slots };
}

async function notify(db: SupabaseClient, clinicId: string, patientId: string | null, title: string, message: string) {
  const { data: staff } = await db.from("user_roles").select("user_id").eq("clinic_id", clinicId).eq("is_active", true).in("role", ["admin", "receptionist"]);
  const rows = [...new Set((staff || []).map((r) => r.user_id))].map((user_id) => ({ clinic_id: clinicId, user_id, patient_id: patientId, title, message, channel: "in_app", status: "sent", sent_at: new Date().toISOString() }));
  if (rows.length) await db.from("notifications").insert(rows);
}

const when = (iso: string, off?: number) => { const l = localIso(new Date(iso), off); return `${l.slice(8, 10)}/${l.slice(5, 7)} às ${l.slice(11, 16)}`; };
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function book(db: SupabaseClient, clinicId: string, svc: Service, s: Settings, startRaw: unknown, professionalId: unknown, who: { patientId: string | null; leadId: string | null }, note: string) {
  const start = new Date(String(startRaw || ""));
  if (Number.isNaN(start.getTime())) return { error: "invalid_start" };
  const pro = svc.pros.find((p) => p.id === professionalId);
  if (!pro) return { error: "slot_unavailable" };
  const day = localIso(start, s.offsetMin).slice(0, 10);
  const data = await loadAgenda(db, clinicId, svc.pros, svc.durationMin, s, day, day);
  if (!isSlotFree(data, pro.id, start)) return { error: "slot_unavailable" };
  const end = new Date(start.getTime() + svc.durationMin * 60_000);
  const { data: appt, error } = await db.from("appointments").insert({
    clinic_id: clinicId, patient_id: who.patientId, lead_id: who.leadId, treatment_id: svc.treatmentId, professional_id: pro.id,
    start_time: start.toISOString(), end_time: end.toISOString(), scheduled_at: start.toISOString(), duration_minutes: svc.durationMin,
    appointment_type: svc.kind === "evaluation" ? "evaluation" : "session", status: "scheduled",
    credit_check_required: false, credit_check_status: "not_required", notes: note,
  }).select("id, start_time").single();
  if (error) throw error;
  return { appointment: appt, professionalName: pro.showName ? pro.name : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    // ---------- Público: avaliação pelo link ----------
    if (action === "public_slots" || action === "public_book") {
      const { data: clinic } = await db.from("clinics").select("id, name").eq("slug", String(body.slug || "")).maybeSingle();
      if (!clinic) return fail("not_found", 404);
      const s = await loadSettings(db, clinic.id);
      const enabled = (s as Settings & { online_booking_enabled?: boolean }).online_booking_enabled === true;
      const svc = enabled ? await serviceFor(db, clinic.id, EVALUATION, s) : null;
      if (!svc) return fail("disabled");
      if (action === "public_slots") return json(await slots(db, clinic.id, svc, s, body.from));

      const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
      const phone = digits(body.phone);
      if (name.split(" ").length < 2) return fail("invalid_name");
      if (phone.length < 10 || phone.length > 13) return fail("invalid_phone");
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).eq("source", "agendamento_online").eq("phone", phone).gte("created_at", since);
      if ((count || 0) >= 3) return fail("too_many");
      const { data: lead, error } = await db.from("leads").insert({
        clinic_id: clinic.id, full_name: name, phone, source: "agendamento_online", kanban_stage: "scheduled",
        last_interaction_at: new Date().toISOString(), notes: body.interest ? `Interesse: ${String(body.interest).slice(0, 200)}` : "Marcou avaliação pelo link público.",
      }).select("id").single();
      if (error) throw error;
      const r = await book(db, clinic.id, svc, s, body.start, body.professionalId, { patientId: null, leadId: lead.id }, "Avaliação marcada pelo link público (Instagram/site).");
      if ("error" in r) { await db.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", lead.id); return fail(r.error!); }
      await db.from("leads").update({ appointment_id: r.appointment.id }).eq("id", lead.id);
      await notify(db, clinic.id, null, "Nova avaliação pelo link", `${name} marcou avaliação para ${when(r.appointment.start_time, s.offsetMin)}. Já está no CRM.`);
      return json({ ok: true, start: localIso(new Date(r.appointment.start_time), s.offsetMin), professionalName: r.professionalName, clinicName: clinic.name });
    }

    // ---------- Portal: paciente logado ----------
    if (action.startsWith("portal_")) {
      const auth = req.headers.get("Authorization") || "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return fail("login", 401);
      const { data: pu } = await db.from("patient_users").select("patient_id, clinic_id").eq("auth_user_id", user.id).eq("status", "active").limit(1).maybeSingle();
      if (!pu) return fail("login", 403);
      const s = await loadSettings(db, pu.clinic_id);
      if ((s as Settings & { online_booking_enabled?: boolean }).online_booking_enabled !== true) return fail("disabled");

      // Tratamentos dos contratos do paciente (pela proposta de cada contrato) + avaliação.
      const { data: contracts } = await db.from("contracts").select("proposal_id, status, process_status").eq("patient_id", pu.patient_id).neq("status", "cancelled");
      const proposalIds = (contracts || []).filter((c) => c.process_status !== "cancelled" && c.proposal_id).map((c) => c.proposal_id);
      const { data: items } = proposalIds.length ? await db.from("proposal_items").select("treatment_id, treatments(id, name)").in("proposal_id", proposalIds) : { data: [] };
      const allowed = new Map<string, string>();
      for (const i of (items || []) as Array<{ treatment_id: string; treatments: { id: string; name: string } | null }>) if (i.treatments) allowed.set(i.treatments.id, i.treatments.name);

      if (action === "portal_options") {
        const options = [...allowed.entries()].map(([id, name]) => ({ id, name }));
        if (s.offers_evaluation) options.push({ id: EVALUATION, name: "Avaliação" });
        return json({ ok: true, options });
      }
      const serviceId = String(body.serviceId || "");
      if (serviceId !== EVALUATION && !allowed.has(serviceId)) return fail("not_allowed");
      const svc = await serviceFor(db, pu.clinic_id, serviceId, s);
      if (!svc) return fail("not_allowed");
      if (action === "portal_slots") return json(await slots(db, pu.clinic_id, svc, s, body.from));
      if (action === "portal_book") {
        const r = await book(db, pu.clinic_id, svc, s, body.start, body.professionalId, { patientId: pu.patient_id, leadId: null }, `${svc.name} marcado pelo paciente no portal.`);
        if ("error" in r) return fail(r.error!);
        const { data: p } = await db.from("patients").select("full_name").eq("id", pu.patient_id).maybeSingle();
        await notify(db, pu.clinic_id, pu.patient_id, "Paciente marcou pelo portal", `${p?.full_name || "Paciente"} marcou ${svc.name} para ${when(r.appointment.start_time, s.offsetMin)}.`);
        return json({ ok: true, start: localIso(new Date(r.appointment.start_time), s.offsetMin), professionalName: r.professionalName });
      }
    }
    return fail("invalid_action", 400);
  } catch (e) {
    await captureError("agendamento-online", e, { route: action });
    return fail("internal_error", 500);
  }
});
