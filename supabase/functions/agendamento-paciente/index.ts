// Link do paciente para confirmar, remarcar ou cancelar um atendimento, sem login.
// POST { token, action: "view" | "slots" | "confirm" | "cancel" | "reschedule", from?, start?, reason? }
// O código do link (64 caracteres) só existe com o paciente; o banco guarda o hash (appointment_links).
// Remarcar usa o mesmo cálculo de horários livres da agenda e da IA, com o mesmo profissional e a mesma duração.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays, computeSlots, isSlotFree, localDate, localIso } from "../_shared/agenda.ts";
import { loadAgenda, loadSettings } from "../_shared/clinic-agenda.ts";
import { changeDeadline, isToken, linkPermissions, sha256Hex } from "../_shared/patient-link.ts";
import { captureError } from "../_shared/monitoring.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const APPT = "id, clinic_id, patient_id, lead_id, treatment_id, professional_id, appointment_type, start_time, end_time, duration_minutes, status, notes, credit_check_required, credit_check_status, "
  + "treatment:treatments(name), professional:professionals(id, full_name, show_name_to_clients), patient:patients!appointments_patient_id_fkey(full_name), lead:leads!appointments_lead_id_fkey(full_name)";

type Appt = {
  id: string; clinic_id: string; patient_id: string | null; lead_id: string | null; treatment_id: string | null; professional_id: string | null;
  appointment_type: string; start_time: string; end_time: string; duration_minutes: number | null; status: string; notes: string | null;
  credit_check_required: boolean; credit_check_status: string;
  treatment: { name: string | null } | null; professional: { id: string; full_name: string; show_name_to_clients: boolean } | null;
  patient: { full_name: string | null } | null; lead: { full_name: string | null } | null;
};

async function loadLink(db: SupabaseClient, token: string) {
  const { data: link } = await db.from("appointment_links").select("id, clinic_id, appointment_id, expires_at").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!link) return null;
  const { data: appt } = await db.from("appointments").select(APPT).eq("id", link.appointment_id).maybeSingle();
  if (!appt) return null;
  return { link, appt: appt as unknown as Appt };
}

const durationOf = (a: Appt) => a.duration_minutes || Math.max(15, Math.round((Date.parse(a.end_time) - Date.parse(a.start_time)) / 60_000));
const personName = (a: Appt) => a.patient?.full_name || a.lead?.full_name || "Paciente";

async function view(db: SupabaseClient, a: Appt) {
  const [{ data: clinic }, s] = await Promise.all([
    db.from("clinics").select("name, phone, address, city, state, logo_url, primary_color").eq("id", a.clinic_id).maybeSingle(),
    loadSettings(db, a.clinic_id),
  ]);
  const perms = linkPermissions({ start: a.start_time, status: a.status }, s.reschedule_notice_hours);
  return {
    ok: true,
    clinic,
    firstName: personName(a).trim().split(/\s+/)[0],
    appointment: {
      start: localIso(new Date(a.start_time), s.offsetMin), end: localIso(new Date(a.end_time), s.offsetMin), status: a.status,
      serviceName: a.treatment?.name || (a.appointment_type === "evaluation" ? "Avaliação" : "Atendimento"),
      professionalName: a.professional?.show_name_to_clients === false ? null : a.professional?.full_name ?? null,
    },
    ...perms,
    canReschedule: perms.canChange && !!a.professional_id,
    changeDeadline: localIso(changeDeadline(a.start_time, s.reschedule_notice_hours), s.offsetMin),
    lastDay: addDays(localDate(Date.now(), s.offsetMin), s.booking_horizon_days),
  };
}

/** Avisa a recepção e os administradores da clínica (sininho). */
async function notifyStaff(db: SupabaseClient, a: Appt, title: string, message: string) {
  const { data: staff } = await db.from("user_roles").select("user_id").eq("clinic_id", a.clinic_id).eq("is_active", true).in("role", ["admin", "receptionist"]);
  const rows = [...new Set((staff || []).map((r) => r.user_id))].map((user_id) => ({
    clinic_id: a.clinic_id, user_id, patient_id: a.patient_id, title, message, channel: "in_app", status: "sent", sent_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await db.from("notifications").insert(rows);
    if (error) console.warn("notify", error.message);
  }
}

const when = (iso: string, off?: number) => {
  const l = localIso(new Date(iso), off);
  return `${l.slice(8, 10)}/${l.slice(5, 7)} às ${l.slice(11, 16)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid" }, 400); }
  const action = String(body.action || "view");
  try {
    if (!isToken(body.token)) return json({ ok: false, reason: "invalid" });
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const found = await loadLink(db, body.token);
    if (!found) return json({ ok: false, reason: "invalid" });
    const { link, appt } = found;
    const s = await loadSettings(db, appt.clinic_id);
    const perms = linkPermissions({ start: appt.start_time, status: appt.status }, s.reschedule_notice_hours);
    const nowIso = new Date().toISOString();

    if (action === "view") {
      await db.from("appointment_links").update({ last_opened_at: nowIso }).eq("id", link.id);
      await db.from("appointment_links").update({ first_opened_at: nowIso }).eq("id", link.id).is("first_opened_at", null);
      return json(await view(db, appt));
    }

    if (action === "confirm") {
      if (appt.status === "confirmed") return json(await view(db, appt));
      if (!perms.canConfirm) return json({ ok: false, reason: "not_allowed" }, 409);
      await db.from("appointments").update({ status: "confirmed", confirmed_at: nowIso, confirmed_via: "patient_link" }).eq("id", appt.id);
      await db.from("appointment_links").update({ last_action: "confirmed", last_action_at: nowIso }).eq("id", link.id);
      await notifyStaff(db, appt, "Atendimento confirmado pelo paciente", `${personName(appt)} confirmou ${when(appt.start_time, s.offsetMin)}.`);
      return json(await view(db, { ...appt, status: "confirmed" }));
    }

    if (action === "cancel") {
      if (!perms.canChange) return json({ ok: false, reason: "deadline" }, 409);
      const reason = String(body.reason || "").trim().slice(0, 200);
      await db.from("appointments").update({ status: "cancelled", cancelled_reason: `Cancelado pelo paciente pelo link${reason ? `: ${reason}` : ""}` }).eq("id", appt.id);
      await db.from("appointment_links").update({ last_action: "cancelled", last_action_at: nowIso }).eq("id", link.id);
      await notifyStaff(db, appt, "Atendimento cancelado pelo paciente", `${personName(appt)} cancelou ${when(appt.start_time, s.offsetMin)}${reason ? ` (${reason})` : ""}. O horário ficou livre.`);
      return json(await view(db, { ...appt, status: "cancelled" }));
    }

    if (action === "slots" || action === "reschedule") {
      if (!perms.canChange || !appt.professional || !appt.professional_id) return json({ ok: false, reason: perms.canChange ? "no_professional" : "deadline" }, 409);
      const pros = [{ id: appt.professional.id, name: appt.professional.full_name, showName: appt.professional.show_name_to_clients }];
      const duration = durationOf(appt);

      if (action === "slots") {
        const today = localDate(Date.now(), s.offsetMin);
        const from = isDate(body.from) && body.from > today ? body.from : today;
        const to = addDays(from, 6);
        const data = await loadAgenda(db, appt.clinic_id, pros, duration, s, from, to, appt.id);
        const r = computeSlots({ ...data, from, to });
        return json({ ok: true, from, to, slots: r.slots.map((x) => ({ start: x.start, end: x.end })), until: r.until, lastDay: addDays(today, s.booking_horizon_days) });
      }

      const start = new Date(String(body.start || ""));
      if (Number.isNaN(start.getTime())) return json({ ok: false, reason: "invalid_start" }, 400);
      const day = localIso(start, s.offsetMin).slice(0, 10);
      const data = await loadAgenda(db, appt.clinic_id, pros, duration, s, day, day, appt.id);
      if (!isSlotFree(data, appt.professional_id, start)) return json({ ok: false, reason: "slot_unavailable" }, 409);
      const end = new Date(start.getTime() + duration * 60_000);
      const { data: created, error } = await db.from("appointments").insert({
        clinic_id: appt.clinic_id, patient_id: appt.patient_id, lead_id: appt.lead_id, treatment_id: appt.treatment_id, professional_id: appt.professional_id,
        appointment_type: appt.appointment_type, start_time: start.toISOString(), end_time: end.toISOString(), scheduled_at: start.toISOString(),
        duration_minutes: duration, status: "confirmed", confirmed_at: nowIso, confirmed_via: "patient_link", notes: appt.notes,
        credit_check_required: appt.credit_check_required, credit_check_status: appt.credit_check_status, rescheduled_from: appt.id,
      }).select(APPT).single();
      if (error) throw error;
      await db.from("appointments").update({ status: "rescheduled", rescheduled_to: created.id, cancelled_reason: "Remarcado pelo paciente pelo link" }).eq("id", appt.id);
      if (appt.lead_id && appt.appointment_type === "evaluation") {
        await db.from("leads").update({ appointment_id: created.id }).eq("clinic_id", appt.clinic_id).eq("id", appt.lead_id);
      }
      await db.from("appointment_links").update({ appointment_id: created.id, expires_at: start.toISOString(), last_action: "rescheduled", last_action_at: nowIso }).eq("id", link.id);
      await notifyStaff(db, appt, "Atendimento remarcado pelo paciente", `${personName(appt)} remarcou de ${when(appt.start_time, s.offsetMin)} para ${when(start.toISOString(), s.offsetMin)}.`);
      return json(await view(db, created as unknown as Appt));
    }

    return json({ ok: false, reason: "invalid_action" }, 400);
  } catch (e) {
    await captureError("agendamento-paciente", e, { route: action });
    return json({ ok: false, reason: "internal_error" }, 500);
  }
});
