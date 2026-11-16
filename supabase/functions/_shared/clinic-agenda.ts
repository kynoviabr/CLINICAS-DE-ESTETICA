// Dados da agenda da clínica para o cálculo de horários livres (_shared/agenda.ts).
// Usado pela aura-api (IA) e pela agendamento-paciente (link de confirmar/remarcar).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays, offsetFor, offsetText, type AgendaInput, type Pro } from "./agenda.ts";

export const BUSY = "(cancelled,rescheduled,no_show)";
export const hm = (t: unknown) => String(t || "").slice(0, 5);

export type Settings = {
  payment_methods: string[]; max_installments: number | null; installments_min_value: number | null; payment_notes: string | null;
  parking: string; parking_notes: string | null;
  accepts_insurance: boolean; insurance_plans: string[]; insurance_notes: string | null;
  offers_evaluation: boolean; evaluation_free: boolean; evaluation_minutes: number; evaluation_price: number | null;
  min_notice_minutes: number; booking_horizon_days: number; buffer_minutes: number; reschedule_notice_hours: number | null;
  price_display: "exact" | "from" | "hidden"; policies: string | null; notes: string | null; faq: { question: string; answer: string }[];
  /** Fuso da clínica em minutos (vem de clinics.timezone). */
  offsetMin: number;
};

export const DEFAULTS: Settings = {
  payment_methods: [], max_installments: null, installments_min_value: null, payment_notes: null,
  parking: "unknown", parking_notes: null, accepts_insurance: false, insurance_plans: [], insurance_notes: null,
  offers_evaluation: true, evaluation_free: true, evaluation_minutes: 30, evaluation_price: null,
  min_notice_minutes: 60, booking_horizon_days: 30, buffer_minutes: 0, reschedule_notice_hours: null,
  price_display: "exact", policies: null, notes: null, faq: [], offsetMin: -180,
};

export async function loadSettings(db: SupabaseClient, clinicId: string): Promise<Settings> {
  const [{ data }, { data: clinic }] = await Promise.all([
    db.from("clinic_service_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
    db.from("clinics").select("timezone").eq("id", clinicId).maybeSingle(),
  ]);
  return { ...DEFAULTS, ...(data || {}), offsetMin: offsetFor(clinic?.timezone) } as Settings;
}

/** Dados da agenda para o cálculo (sem filtro de dia/horário). excludeAppointmentId: ignora o próprio agendamento ao remarcar. */
export async function loadAgenda(
  db: SupabaseClient, clinicId: string, pros: Pro[], durationMin: number, s: Settings, from: string, to: string, excludeAppointmentId?: string,
): Promise<Omit<AgendaInput, "from" | "to">> {
  const ids = pros.map((p) => p.id);
  const tz = offsetText(s.offsetMin);
  const start = new Date(`${from}T00:00:00${tz}`).toISOString();
  const end = new Date(`${addDays(to, 1)}T00:00:00${tz}`).toISOString();
  let apptQ = ids.length ? db.from("appointments").select("id, professional_id, start_time, end_time").eq("clinic_id", clinicId).in("professional_id", ids)
    .lt("start_time", end).gt("end_time", start).not("status", "in", BUSY) : null;
  if (apptQ && excludeAppointmentId) apptQ = apptQ.neq("id", excludeAppointmentId);
  const [{ data: hours }, { data: closures }, { data: avail }, { data: appts }, { data: blocks }] = await Promise.all([
    db.from("clinic_business_hours").select("day_of_week, opens_at, closes_at").eq("clinic_id", clinicId),
    db.from("clinic_closures").select("closed_on").eq("clinic_id", clinicId).gte("closed_on", from).lte("closed_on", to),
    ids.length ? db.from("professional_availability").select("professional_id, day_of_week, start_time, end_time").in("professional_id", ids).eq("is_active", true) : { data: [] },
    apptQ ?? { data: [] },
    db.from("appointment_blocks").select("professional_id, start_at, end_at").eq("clinic_id", clinicId).lt("start_at", end).gt("end_at", start),
  ]);
  return {
    offsetMin: s.offsetMin, durationMin, bufferMin: s.buffer_minutes, minNoticeMin: s.min_notice_minutes, horizonDays: s.booking_horizon_days, now: Date.now(),
    clinicHours: (hours || []).map((h) => ({ day_of_week: h.day_of_week, opens_at: hm(h.opens_at), closes_at: hm(h.closes_at) })),
    closures: (closures || []).map((c) => c.closed_on),
    pros,
    availability: (avail || []).map((a) => ({ ...a, start_time: hm(a.start_time), end_time: hm(a.end_time) })),
    appointments: (appts || []).map((a) => ({ professional_id: a.professional_id, start: a.start_time, end: a.end_time })),
    blocks: (blocks || []).map((b) => ({ professional_id: b.professional_id, start: b.start_at, end: b.end_at })),
  };
}
