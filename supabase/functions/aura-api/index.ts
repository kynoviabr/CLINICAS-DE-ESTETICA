// API padrão do produto para a Aura IA (docs/API.md da Aura, "API padrão do produto").
// A Aura pergunta, o Clinova responde com os dados organizados da própria clínica:
//   GET  /aura/catalog          -> tratamentos (preço, duração, exige avaliação, profissionais) + avaliação
//   GET  /aura/business-info    -> horário da clínica, dias fechados, pagamento, estacionamento, planos, avaliação, regras
//   GET  /aura/availability     -> horários livres (clínica ∩ profissional − agendamentos − bloqueios − dias fechados)
//   POST /aura/bookings         -> marca (revalida o horário; chave de repetição)
//   POST /aura/bookings/search, POST /aura/bookings/:id/cancel -> próximos horários do cliente e cancelamento
// Publicada sem login do Supabase: a proteção é a assinatura da Aura (HMAC com AURA_WEBHOOK_SECRET),
// com horário (no máximo 5 minutos de diferença). A clínica vem no cabeçalho X-Aura-Workspace (= clinic_id).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeSlots, isSlotFree, localIso, addDays, localDate, setupIssues, type AgendaInput, type Pro } from "../_shared/agenda.ts";

const EVALUATION_ID = "evaluation";
const BUSY = "(cancelled,rescheduled,no_show)";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const hm = (t: unknown) => String(t || "").slice(0, 5);

// ---------- Configuração do atendimento ----------
type Settings = {
  payment_methods: string[]; max_installments: number | null; installments_min_value: number | null; payment_notes: string | null;
  parking: string; parking_notes: string | null;
  accepts_insurance: boolean; insurance_plans: string[]; insurance_notes: string | null;
  offers_evaluation: boolean; evaluation_free: boolean; evaluation_minutes: number; evaluation_price: number | null;
  min_notice_minutes: number; booking_horizon_days: number; buffer_minutes: number; reschedule_notice_hours: number | null;
  price_display: "exact" | "from" | "hidden"; policies: string | null; notes: string | null; faq: { question: string; answer: string }[];
};

const DEFAULTS: Settings = {
  payment_methods: [], max_installments: null, installments_min_value: null, payment_notes: null,
  parking: "unknown", parking_notes: null, accepts_insurance: false, insurance_plans: [], insurance_notes: null,
  offers_evaluation: true, evaluation_free: true, evaluation_minutes: 30, evaluation_price: null,
  min_notice_minutes: 60, booking_horizon_days: 30, buffer_minutes: 0, reschedule_notice_hours: null,
  price_display: "exact", policies: null, notes: null, faq: [],
};

async function settings(db: SupabaseClient, clinicId: string): Promise<Settings> {
  const { data } = await db.from("clinic_service_settings").select("*").eq("clinic_id", clinicId).maybeSingle();
  return { ...DEFAULTS, ...(data || {}) } as Settings;
}

async function activePros(db: SupabaseClient, clinicId: string) {
  const { data } = await db.from("professionals").select("id, full_name, specialty, show_name_to_clients").eq("clinic_id", clinicId).eq("status", "active").order("full_name");
  return data || [];
}

async function treatmentLinks(db: SupabaseClient, clinicId: string) {
  const { data } = await db.from("professional_treatments").select("professional_id, treatment_id, professionals!inner(clinic_id)")
    .eq("professionals.clinic_id", clinicId).eq("status", "active");
  return (data || []) as { professional_id: string; treatment_id: string }[];
}

// ---------- Catálogo ----------
async function catalog(db: SupabaseClient, clinicId: string) {
  const [s, pros, links, { data: treatments }, { data: combos }] = await Promise.all([
    settings(db, clinicId), activePros(db, clinicId), treatmentLinks(db, clinicId),
    db.from("treatments").select("id, name, category, description, duration_minutes, num_sessions, price, default_price, price_display, requires_evaluation, ai_bookable")
      .eq("clinic_id", clinicId).eq("is_active", true).order("name"),
    db.from("treatment_combos").select("id, name, promotional_price, items:treatment_combo_items(treatment:treatments(name))")
      .eq("clinic_id", clinicId).eq("active", true).order("name"),
  ]);
  const visible = (id: string) => pros.find((p) => p.id === id && p.show_name_to_clients)?.full_name;
  const services = (treatments || []).map((t) => ({
    id: t.id, kind: "treatment", name: t.name, category: t.category, description: clean(t.description),
    durationMinutes: t.duration_minutes, sessions: t.num_sessions,
    price: Number(t.price || t.default_price || 0) || null,
    priceDisplay: t.price_display || s.price_display,
    requiresEvaluation: !!t.requires_evaluation,
    aiBookable: t.ai_bookable !== false,
    professionals: links.filter((l) => l.treatment_id === t.id).map((l) => visible(l.professional_id)).filter(Boolean),
  }));
  if (s.offers_evaluation) {
    services.unshift({
      id: EVALUATION_ID, kind: "evaluation", name: "Avaliação", category: null, description: null,
      durationMinutes: s.evaluation_minutes, sessions: 1,
      price: s.evaluation_free ? 0 : s.evaluation_price, priceDisplay: s.evaluation_free ? "exact" : (s.evaluation_price ? "exact" : "hidden"),
      requiresEvaluation: false, aiBookable: true, professionals: pros.filter((p) => p.show_name_to_clients).map((p) => p.full_name),
    });
  }
  return {
    services,
    packages: (combos || []).map((c) => ({
      name: c.name,
      price: s.price_display === "hidden" ? null : c.promotional_price,
      items: ((c.items || []) as { treatment?: { name?: string } | null }[]).map((i) => i.treatment?.name).filter(Boolean),
    })),
  };
}

// ---------- Dados da clínica ----------
async function businessInfo(db: SupabaseClient, clinicId: string) {
  const today = localDate(Date.now());
  const [s, pros, links, { data: clinic }, { data: hours }, { data: closures }, { data: treatments }, { data: avail }] = await Promise.all([
    settings(db, clinicId), activePros(db, clinicId), treatmentLinks(db, clinicId),
    db.from("clinics").select("name, address, city, state, phone, support_whatsapp").eq("id", clinicId).maybeSingle(),
    db.from("clinic_business_hours").select("day_of_week, opens_at, closes_at").eq("clinic_id", clinicId).order("day_of_week").order("opens_at"),
    db.from("clinic_closures").select("closed_on, reason").eq("clinic_id", clinicId).gte("closed_on", today).lte("closed_on", addDays(today, 90)).order("closed_on"),
    db.from("treatments").select("id, name, ai_bookable, requires_evaluation").eq("clinic_id", clinicId).eq("is_active", true),
    db.from("professional_availability").select("professional_id, day_of_week, start_time, end_time").eq("clinic_id", clinicId).eq("is_active", true),
  ]);
  if (!clinic) return null;
  const address = [clinic.address, [clinic.city, clinic.state].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  const names = new Map((treatments || []).map((t) => [t.id, t.name]));
  return {
    name: clinic.name,
    address: address || null,
    phone: clinic.phone || clinic.support_whatsapp || null,
    hours: (hours || []).map((h) => ({ day: h.day_of_week, opens: hm(h.opens_at), closes: hm(h.closes_at) })),
    closures: (closures || []).map((c) => ({ date: c.closed_on, reason: c.reason })),
    payment: { methods: s.payment_methods, maxInstallments: s.max_installments, installmentsMinValue: s.installments_min_value, notes: s.payment_notes },
    parking: { type: s.parking, notes: s.parking_notes },
    insurance: { accepts: s.accepts_insurance, plans: s.insurance_plans, notes: s.insurance_notes },
    evaluation: { offered: s.offers_evaluation, free: s.evaluation_free, durationMinutes: s.evaluation_minutes, price: s.evaluation_price },
    scheduling: { minNoticeMinutes: s.min_notice_minutes, horizonDays: s.booking_horizon_days, rescheduleNoticeHours: s.reschedule_notice_hours },
    policies: clean(s.policies), notes: clean(s.notes),
    faq: (s.faq || []).filter((f) => clean(f?.question) && clean(f?.answer)),
    professionals: pros.filter((p) => p.show_name_to_clients).map((p) => ({
      name: p.full_name, specialty: p.specialty,
      services: links.filter((l) => l.professional_id === p.id).map((l) => names.get(l.treatment_id)).filter(Boolean),
    })),
    setupIssues: setupIssues({
      clinicHours: hours || [], treatments: treatments || [], pros: pros.map((p) => ({ id: p.id, name: p.full_name })),
      links, availability: avail || [], offersEvaluation: s.offers_evaluation,
    }),
  };
}

// ---------- Agenda ----------
type Contact = { type?: string | null; ref?: string | null; phone?: string; name?: string | null };
type Service = { id: string; kind: "treatment" | "evaluation"; name: string; durationMin: number; pros: Pro[]; treatmentId: string | null };

function phoneKey(phone: unknown) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d.length < 8 ? null : d;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** O que pode ser agendado e com quem. Tratamento: só profissionais ligados a ele. Avaliação: qualquer profissional ativo. */
async function serviceFor(db: SupabaseClient, clinicId: string, serviceId: string, s: Settings): Promise<Service | { error: string; status: number }> {
  const pros = await activePros(db, clinicId);
  const toPro = (p: { id: string; full_name: string; show_name_to_clients: boolean }): Pro => ({ id: p.id, name: p.full_name, showName: p.show_name_to_clients });
  if (serviceId === EVALUATION_ID) {
    if (!s.offers_evaluation) return { error: "evaluation_not_offered", status: 409 };
    return { id: EVALUATION_ID, kind: "evaluation", name: "Avaliação", durationMin: s.evaluation_minutes, pros: pros.map(toPro), treatmentId: null };
  }
  const { data: t } = await db.from("treatments").select("id, name, duration_minutes, ai_bookable, requires_evaluation")
    .eq("clinic_id", clinicId).eq("id", serviceId).eq("is_active", true).maybeSingle();
  if (!t) return { error: "service_not_found", status: 400 };
  if (t.ai_bookable === false) return { error: "not_bookable", status: 409 };
  if (t.requires_evaluation) return { error: "requires_evaluation", status: 409 };
  const linked = new Set((await treatmentLinks(db, clinicId)).filter((l) => l.treatment_id === t.id).map((l) => l.professional_id));
  return { id: t.id, kind: "treatment", name: t.name, durationMin: Math.max(15, Number(t.duration_minutes) || 60), pros: pros.filter((p) => linked.has(p.id)).map(toPro), treatmentId: t.id };
}

/** Dados da agenda para o cálculo (sem filtro de dia/horário). */
async function agendaData(db: SupabaseClient, clinicId: string, svc: Service, s: Settings, from: string, to: string): Promise<Omit<AgendaInput, "from" | "to">> {
  const ids = svc.pros.map((p) => p.id);
  const start = new Date(`${from}T00:00:00-03:00`).toISOString();
  const end = new Date(`${addDays(to, 1)}T00:00:00-03:00`).toISOString();
  const [{ data: hours }, { data: closures }, { data: avail }, { data: appts }, { data: blocks }] = await Promise.all([
    db.from("clinic_business_hours").select("day_of_week, opens_at, closes_at").eq("clinic_id", clinicId),
    db.from("clinic_closures").select("closed_on").eq("clinic_id", clinicId).gte("closed_on", from).lte("closed_on", to),
    ids.length ? db.from("professional_availability").select("professional_id, day_of_week, start_time, end_time").in("professional_id", ids).eq("is_active", true) : { data: [] },
    ids.length ? db.from("appointments").select("professional_id, start_time, end_time").eq("clinic_id", clinicId).in("professional_id", ids)
      .lt("start_time", end).gt("end_time", start).not("status", "in", BUSY) : { data: [] },
    db.from("appointment_blocks").select("professional_id, start_at, end_at").eq("clinic_id", clinicId).lt("start_at", end).gt("end_at", start),
  ]);
  return {
    durationMin: svc.durationMin, bufferMin: s.buffer_minutes, minNoticeMin: s.min_notice_minutes, horizonDays: s.booking_horizon_days, now: Date.now(),
    clinicHours: (hours || []).map((h) => ({ day_of_week: h.day_of_week, opens_at: hm(h.opens_at), closes_at: hm(h.closes_at) })),
    closures: (closures || []).map((c) => c.closed_on),
    pros: svc.pros,
    availability: (avail || []).map((a) => ({ ...a, start_time: hm(a.start_time), end_time: hm(a.end_time) })),
    appointments: (appts || []).map((a) => ({ professional_id: a.professional_id, start: a.start_time, end: a.end_time })),
    blocks: (blocks || []).map((b) => ({ professional_id: b.professional_id, start: b.start_at, end: b.end_at })),
  };
}

async function availability(db: SupabaseClient, clinicId: string, q: URLSearchParams) {
  const from = q.get("from") || "", to = q.get("to") || "", time = q.get("time");
  const period = q.get("period") as AgendaInput["period"];
  if (!q.get("serviceId") || !isDate(from) || !isDate(to)) return json({ error: "invalid_query" }, 400);
  if (time && !/^\d{2}:\d{2}$/.test(time)) return json({ error: "invalid_time" }, 400);
  const s = await settings(db, clinicId);
  const svc = await serviceFor(db, clinicId, q.get("serviceId")!, s);
  if ("error" in svc) return json({ error: svc.error }, svc.status);
  if (q.get("professionalId")) svc.pros = svc.pros.filter((p) => p.id === q.get("professionalId"));
  if (!svc.pros.length) return json({ timezone: "America/Sao_Paulo", durationMinutes: svc.durationMin, slots: [], truncated: false, reason: "no_professional" });
  // Data além do prazo de agendamento: informa o limite (não é regra da clínica, é o prazo da agenda aberta).
  const lastDay = addDays(localDate(Date.now()), s.booking_horizon_days);
  if (from > lastDay) {
    return json({ timezone: "America/Sao_Paulo", durationMinutes: svc.durationMin, slots: [], truncated: false, reason: "beyond_horizon", until: lastDay, horizonDays: s.booking_horizon_days });
  }
  const data = await agendaData(db, clinicId, svc, s, from, to);
  const r = computeSlots({ ...data, from, to, period, time });
  return json({ timezone: "America/Sao_Paulo", durationMinutes: svc.durationMin, slots: r.slots, truncated: r.truncated, until: r.until });
}

/** Quem é o cliente no Clinova: paciente ou lead (acha pela conversa do WhatsApp ou cria o lead). */
async function resolveContact(db: SupabaseClient, clinicId: string, c: Contact): Promise<{ patientId: string | null; leadId: string | null }> {
  if (c.ref && c.type === "patient") {
    const { data } = await db.from("patients").select("id").eq("clinic_id", clinicId).eq("id", c.ref).maybeSingle();
    if (data) return { patientId: data.id, leadId: null };
  }
  if (c.ref && c.type === "lead") {
    const { data } = await db.from("leads").select("id, patient_id").eq("clinic_id", clinicId).eq("id", c.ref).is("deleted_at", null).maybeSingle();
    if (data) return data.patient_id ? { patientId: data.patient_id, leadId: null } : { patientId: null, leadId: data.id };
  }
  const key = phoneKey(c.phone);
  if (key) {
    const { data } = await db.from("whatsapp_conversations").select("patient_id, lead_id").eq("clinic_id", clinicId).eq("contact_key", key)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (data?.patient_id || data?.lead_id) return { patientId: data.patient_id, leadId: data.patient_id ? null : data.lead_id };
  }
  const { data: lead, error } = await db.from("leads").insert({
    clinic_id: clinicId, full_name: (c.name || "").trim() || "Contato do WhatsApp", phone: c.phone || null,
    source: "whatsapp", kanban_stage: "new_lead", last_interaction_at: new Date().toISOString(), notes: "Entrou pelo WhatsApp (Aura IA).",
  }).select("id").single();
  if (error) throw error;
  return { patientId: null, leadId: lead.id };
}

const BOOKING_FIELDS = "id, start_time, end_time, status, appointment_type, treatment:treatments(name), professional:professionals(full_name, show_name_to_clients)";
type BookingRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  appointment_type?: string | null;
  treatment?: { name?: string | null } | null;
  professional?: { full_name?: string | null; show_name_to_clients?: boolean | null } | null;
};
const bookingJson = (a: BookingRow) => ({
  id: a.id, start: localIso(new Date(a.start_time)), end: localIso(new Date(a.end_time)), status: a.status,
  serviceName: a.appointment_type === "evaluation" && !a.treatment?.name ? "Avaliação" : a.treatment?.name ?? null,
  professionalName: a.professional?.show_name_to_clients === false ? null : a.professional?.full_name ?? null,
});

async function createBooking(db: SupabaseClient, clinicId: string, b: { serviceId: string; interestServiceId?: string; start: string; professionalId: string; contact: Contact; idempotencyKey?: string }) {
  const start = new Date(b.start);
  if (Number.isNaN(start.getTime())) return json({ error: "invalid_start" }, 400);
  const s = await settings(db, clinicId);
  const svc = await serviceFor(db, clinicId, String(b.serviceId || ""), s);
  if ("error" in svc) return json({ error: svc.error }, svc.status);
  const tag = b.idempotencyKey ? `[aura:${String(b.idempotencyKey).slice(0, 120)}]` : "";

  // Mesmo pedido repetido (rede caiu, a IA tentou de novo): devolve o agendamento já feito.
  if (tag) {
    const { data: same } = await db.from("appointments").select(BOOKING_FIELDS).eq("clinic_id", clinicId).like("notes", `%${tag}%`).maybeSingle();
    if (same) return json({ booking: bookingJson(same) }, 200);
  }

  // Revalida com as mesmas regras do cálculo de horários (pode ter sido ocupado depois da consulta).
  const day = localIso(start).slice(0, 10);
  const data = await agendaData(db, clinicId, svc, s, day, day);
  if (!isSlotFree(data, b.professionalId, start)) return json({ error: "slot_unavailable" }, 409);

  // Avaliação pode vir com o tratamento de interesse (fica no agendamento para a equipe).
  let treatmentId = svc.treatmentId;
  if (svc.kind === "evaluation" && b.interestServiceId) {
    const { data: t } = await db.from("treatments").select("id").eq("clinic_id", clinicId).eq("id", b.interestServiceId).maybeSingle();
    treatmentId = t?.id ?? null;
  }
  const who = await resolveContact(db, clinicId, b.contact || {});
  const end = new Date(start.getTime() + svc.durationMin * 60_000);
  const { data: appt, error } = await db.from("appointments").insert({
    clinic_id: clinicId, patient_id: who.patientId, lead_id: who.leadId, treatment_id: treatmentId, professional_id: b.professionalId,
    start_time: start.toISOString(), end_time: end.toISOString(), scheduled_at: start.toISOString(), duration_minutes: svc.durationMin,
    appointment_type: "evaluation", status: "scheduled", credit_check_required: false, credit_check_status: "not_required",
    notes: `${svc.kind === "evaluation" ? "Avaliação" : `Atendimento: ${svc.name}`} agendado pela Aura IA (WhatsApp). ${tag}`.trim(),
  }).select(BOOKING_FIELDS).single();
  if (error) throw error;
  if (who.leadId) {
    await db.from("leads").update({ kanban_stage: "scheduled", appointment_id: appt.id, last_interaction_at: new Date().toISOString() })
      .eq("clinic_id", clinicId).eq("id", who.leadId);
  }
  return json({ booking: bookingJson(appt) }, 201);
}

async function contactBookings(db: SupabaseClient, clinicId: string, c: Contact) {
  const who = await resolveContact(db, clinicId, c);
  let q = db.from("appointments").select(BOOKING_FIELDS).eq("clinic_id", clinicId).gte("start_time", new Date().toISOString())
    .not("status", "in", BUSY).order("start_time").limit(10);
  q = who.patientId ? q.eq("patient_id", who.patientId) : q.eq("lead_id", who.leadId!);
  const { data } = await q;
  return { who, bookings: (data || []).map(bookingJson) };
}

async function cancelBooking(db: SupabaseClient, clinicId: string, id: string, c: Contact, reason: string) {
  const { who } = await contactBookings(db, clinicId, c);
  const { data: appt } = await db.from("appointments").select("id, patient_id, lead_id, status").eq("clinic_id", clinicId).eq("id", id).maybeSingle();
  const mine = appt && ((who.patientId && appt.patient_id === who.patientId) || (who.leadId && appt.lead_id === who.leadId));
  if (!mine) return json({ error: "booking_not_found" }, 404);
  if (["cancelled", "completed", "in_progress", "no_show"].includes(appt.status)) return json({ error: "not_cancellable" }, 409);
  const { data, error } = await db.from("appointments").update({ status: "cancelled", cancelled_reason: `${reason} (Aura IA, WhatsApp)`.slice(0, 300) })
    .eq("id", id).select(BOOKING_FIELDS).single();
  if (error) throw error;
  return json({ booking: bookingJson(data) });
}

Deno.serve(async (req) => {
  const secret = (Deno.env.get("AURA_WEBHOOK_SECRET") || "").trim();
  if (!secret) return json({ error: "secret_not_configured" }, 500);

  const url = new URL(req.url);
  const raw = req.method === "GET" ? "" : await req.text();
  const ts = req.headers.get("x-aura-timestamp") || "";
  const clinicId = req.headers.get("x-aura-workspace") || "";
  const signature = (req.headers.get("x-aura-signature") || "").trim().toLowerCase();
  // Dentro do Supabase o caminho chega sem "/functions/v1"; a Aura assina o caminho completo da URL pública.
  const paths = [url.pathname, url.pathname.startsWith("/functions/v1/") ? url.pathname : `/functions/v1${url.pathname}`];
  let valid = false;
  for (const p of new Set(paths)) {
    if (signature && safeEqual(signature, await hmacHex(secret, `${ts}.${req.method}.${p}${url.search}.${raw}`))) valid = true;
  }
  if (!valid || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    console.warn("aura-api: assinatura inválida", { path: url.pathname, hasSignature: !!signature });
    return json({ error: "invalid_signature" }, 401);
  }
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return json({ error: "invalid_workspace" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const route = url.pathname.replace(/^.*\/aura-api/, "");
  try {
    if (req.method === "GET" && route === "/aura/catalog") return json(await catalog(db, clinicId));
    if (req.method === "GET" && route === "/aura/business-info") {
      const info = await businessInfo(db, clinicId);
      return info ? json(info) : json({ error: "clinic_not_found" }, 404);
    }
    if (req.method === "GET" && route === "/aura/availability") return await availability(db, clinicId, url.searchParams);
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === "POST" && route === "/aura/bookings") return await createBooking(db, clinicId, body);
    if (req.method === "POST" && route === "/aura/bookings/search") return json({ bookings: (await contactBookings(db, clinicId, body.contact || {})).bookings });
    const cancel = route.match(/^\/aura\/bookings\/([0-9a-f-]{36})\/cancel$/i);
    if (req.method === "POST" && cancel) return await cancelBooking(db, clinicId, cancel[1], body.contact || {}, String(body.reason || "Pedido do cliente"));
    return json({ error: "not_supported" }, 501);
  } catch (e) {
    console.error("aura-api", route, e);
    return json({ error: "internal_error" }, 500);
  }
});
