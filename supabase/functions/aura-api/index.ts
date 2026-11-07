// API padrão do produto para a Aura IA (docs/API.md da Aura, "API padrão do produto").
// A Aura pergunta, o Clinova responde com os dados da própria clínica:
//   GET /aura/catalog        -> tratamentos ativos e combos, com a regra de como falar do preço
//   GET /aura/business-info  -> dados da clínica, horário, pagamento, regras, profissionais e perguntas frequentes
//   GET /aura/availability   -> horários livres (disponibilidade semanal - agendamentos - bloqueios)
//   POST /aura/bookings      -> marca uma avaliação (revalida o horário; chave de repetição)
//   POST /aura/bookings/search, POST /aura/bookings/:id/cancel -> próximos horários do cliente e cancelamento
// Publicada sem login do Supabase: a proteção é a assinatura da Aura (HMAC com AURA_WEBHOOK_SECRET),
// com horário (no máximo 5 minutos de diferença). A clínica vem no cabeçalho X-Aura-Workspace (= clinic_id).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type PriceDisplay = "exact" | "from" | "hidden";
/** Informações para a IA, preenchidas pela clínica em Configurações (clinic_settings, chave aura_info). */
type AuraInfo = {
  hours?: string; payment?: string; policies?: string; parking?: string; notes?: string;
  faq?: { question: string; answer: string }[];
  priceDisplay?: PriceDisplay;
  priceOverrides?: Record<string, PriceDisplay>;
};

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

async function auraInfo(db: SupabaseClient, clinicId: string): Promise<AuraInfo> {
  const { data } = await db.from("clinic_settings").select("value").eq("clinic_id", clinicId).eq("key", "aura_info").maybeSingle();
  try { return data?.value ? JSON.parse(data.value) : {}; } catch { return {}; }
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function catalog(db: SupabaseClient, clinicId: string) {
  const [info, { data: treatments }, { data: combos }] = await Promise.all([
    auraInfo(db, clinicId),
    db.from("treatments").select("id, name, category, description, duration_minutes, num_sessions, price, default_price")
      .eq("clinic_id", clinicId).eq("is_active", true).order("name"),
    db.from("treatment_combos").select("id, name, promotional_price, items:treatment_combo_items(treatment:treatments(name))")
      .eq("clinic_id", clinicId).eq("active", true).order("name"),
  ]);
  const display = info.priceDisplay || "exact";
  return {
    services: (treatments || []).map((t) => {
      const price = Number(t.price || t.default_price || 0) || null;
      return {
        id: t.id, name: t.name, category: t.category, description: clean(t.description),
        durationMinutes: t.duration_minutes, sessions: t.num_sessions,
        priceDisplay: info.priceOverrides?.[t.id] || display,
        price,
      };
    }),
    packages: (combos || []).map((c) => ({
      name: c.name,
      price: display === "hidden" ? null : c.promotional_price,
      items: ((c.items || []) as { treatment?: { name?: string } | null }[]).map((i) => i.treatment?.name).filter(Boolean),
    })),
  };
}

async function businessInfo(db: SupabaseClient, clinicId: string) {
  const [info, { data: clinic }, { data: pros }] = await Promise.all([
    auraInfo(db, clinicId),
    db.from("clinics").select("name, address, city, state, phone, support_whatsapp").eq("id", clinicId).maybeSingle(),
    db.from("professionals").select("full_name, specialty").eq("clinic_id", clinicId).eq("status", "active").order("full_name"),
  ]);
  if (!clinic) return null;
  const address = [clinic.address, [clinic.city, clinic.state].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  return {
    name: clinic.name,
    address: address || null,
    phone: clinic.phone || clinic.support_whatsapp || null,
    hours: clean(info.hours), payment: clean(info.payment), policies: clean(info.policies),
    parking: clean(info.parking), notes: clean(info.notes),
    faq: (info.faq || []).filter((f) => clean(f.question) && clean(f.answer)),
    professionals: (pros || []).map((p) => ({ name: p.full_name, specialty: p.specialty })),
  };
}


// ---------- Agenda ----------
// Os horários da clínica são de Brasília (sem horário de verão desde 2019): UTC-3.
const OFFSET = "-03:00";
const SLOT_STEP_MIN = 30;
const MIN_NOTICE_MIN = 60;
const MAX_SLOTS = 120;
const BUSY = "(cancelled,rescheduled,no_show)";

type Contact = { type?: string | null; ref?: string | null; phone?: string; name?: string | null };

function phoneKey(phone: unknown) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d.length < 8 ? null : d;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const at = (date: string, hm: string) => new Date(`${date}T${hm.slice(0, 5)}:00${OFFSET}`);
const localIso = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19) + OFFSET;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const overlaps = (a1: Date, a2: Date, b1: Date, b2: Date) => a1 < b2 && a2 > b1;

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

/** Profissionais que fazem o serviço (ou todos os ativos, se o serviço não tiver profissional vinculado). */
async function professionalsFor(db: SupabaseClient, clinicId: string, treatmentId: string, only?: string | null) {
  const { data: pros } = await db.from("professionals").select("id, full_name").eq("clinic_id", clinicId).eq("status", "active");
  const { data: links } = await db.from("professional_treatments").select("professional_id").eq("treatment_id", treatmentId).eq("status", "active");
  const linked = new Set((links || []).map((l) => l.professional_id));
  let list = (pros || []).filter((p) => !linked.size || linked.has(p.id));
  if (only) list = list.filter((p) => p.id === only);
  return list;
}

type SlotQuery = { serviceId: string; from: string; to: string; professionalId?: string | null; period?: string | null; time?: string | null };

// Manhã antes das 12h, tarde das 12h às 18h, noite depois das 18h (hora de Brasília).
function inPeriod(localHm: string, period?: string | null) {
  if (!period) return true;
  const h = Number(localHm.slice(0, 2));
  if (period === "morning") return h < 12;
  if (period === "afternoon") return h >= 12 && h < 18;
  if (period === "evening") return h >= 18;
  return true;
}

async function freeSlots(db: SupabaseClient, clinicId: string, q: SlotQuery) {
  const { data: t } = await db.from("treatments").select("id, name, duration_minutes").eq("clinic_id", clinicId).eq("id", q.serviceId).eq("is_active", true).maybeSingle();
  if (!t) return null;
  const duration = Math.max(15, Number(t.duration_minutes) || 60);
  const to = q.to < q.from ? q.from : (q.to > addDays(q.from, 13) ? addDays(q.from, 13) : q.to);
  const pros = await professionalsFor(db, clinicId, t.id, q.professionalId);
  if (!pros.length) return { duration, slots: [] as Array<Record<string, string>>, truncated: false, until: q.to };
  const ids = pros.map((p) => p.id);
  const rangeStart = at(q.from, "00:00").toISOString();
  const rangeEnd = at(addDays(to, 1), "00:00").toISOString();
  const [{ data: avail }, { data: appts }, { data: blocks }] = await Promise.all([
    db.from("professional_availability").select("professional_id, day_of_week, start_time, end_time").in("professional_id", ids).eq("is_active", true),
    db.from("appointments").select("professional_id, start_time, end_time").eq("clinic_id", clinicId).in("professional_id", ids)
      .lt("start_time", rangeEnd).gt("end_time", rangeStart).not("status", "in", BUSY),
    db.from("appointment_blocks").select("professional_id, start_at, end_at").eq("clinic_id", clinicId).lt("start_at", rangeEnd).gt("end_at", rangeStart),
  ]);
  const earliest = Date.now() + MIN_NOTICE_MIN * 60_000;
  const slots: Array<Record<string, string>> = [];
  // Todos os horários livres do período pedido (até 120): a IA não pode concluir que um dia está cheio por falta de amostra.
  for (let date = q.from; date <= to && slots.length < MAX_SLOTS; date = addDays(date, 1)) {
    const dow = new Date(`${date}T12:00:00${OFFSET}`).getUTCDay();
    const perDay = new Map<string, Record<string, string>>();
    for (const p of pros) {
      for (const w of (avail || []).filter((a) => a.professional_id === p.id && a.day_of_week === dow)) {
        const wEnd = at(date, String(w.end_time));
        for (let s = at(date, String(w.start_time)); s.getTime() + duration * 60_000 <= wEnd.getTime(); s = new Date(s.getTime() + SLOT_STEP_MIN * 60_000)) {
          const e = new Date(s.getTime() + duration * 60_000);
          if (s.getTime() < earliest) continue;
          if ((appts || []).some((a) => a.professional_id === p.id && overlaps(s, e, new Date(a.start_time), new Date(a.end_time)))) continue;
          if ((blocks || []).some((b) => (!b.professional_id || b.professional_id === p.id) && overlaps(s, e, new Date(b.start_at), new Date(b.end_at)))) continue;
          const k = localIso(s);
          const hm = k.slice(11, 16);
          if (q.time && hm !== q.time) continue;
          if (!inPeriod(hm, q.period)) continue;
          if (!perDay.has(k)) perDay.set(k, { start: k, end: localIso(e), professionalId: p.id, professionalName: p.full_name });
        }
      }
    }
    slots.push(...[...perDay.values()].sort((a, b) => a.start.localeCompare(b.start)));
  }
  return { duration, slots: slots.slice(0, MAX_SLOTS), truncated: slots.length > MAX_SLOTS, until: to };
}

const BOOKING_FIELDS = "id, start_time, end_time, status, treatment:treatments(name), professional:professionals(full_name)";
// deno-lint-ignore no-explicit-any
const bookingJson = (a: any) => ({
  id: a.id, start: localIso(new Date(a.start_time)), end: localIso(new Date(a.end_time)), status: a.status,
  serviceName: a.treatment?.name ?? null, professionalName: a.professional?.full_name ?? null,
});

/** O horário cabe na disponibilidade do profissional e não bate com agendamento nem bloqueio? */
async function isFree(db: SupabaseClient, clinicId: string, t: { id: string; duration_minutes: number | null }, professionalId: string, start: Date) {
  if (start.getTime() < Date.now() + MIN_NOTICE_MIN * 60_000) return false;
  if (!(await professionalsFor(db, clinicId, t.id, professionalId)).length) return false;
  const end = new Date(start.getTime() + Math.max(15, Number(t.duration_minutes) || 60) * 60_000);
  const local = localIso(start);
  const date = local.slice(0, 10);
  const dow = new Date(`${date}T12:00:00${OFFSET}`).getUTCDay();
  const [{ data: avail }, { data: clash }, { data: blocks }] = await Promise.all([
    db.from("professional_availability").select("start_time, end_time").eq("professional_id", professionalId).eq("day_of_week", dow).eq("is_active", true),
    db.from("appointments").select("id").eq("clinic_id", clinicId).eq("professional_id", professionalId)
      .lt("start_time", end.toISOString()).gt("end_time", start.toISOString()).not("status", "in", BUSY).limit(1),
    db.from("appointment_blocks").select("professional_id").eq("clinic_id", clinicId).lt("start_at", end.toISOString()).gt("end_at", start.toISOString()),
  ]);
  const inWindow = (avail || []).some((w) => at(date, String(w.start_time)) <= start && end <= at(date, String(w.end_time)));
  const blocked = (blocks || []).some((x) => !x.professional_id || x.professional_id === professionalId);
  return inWindow && !clash?.length && !blocked;
}

async function createBooking(db: SupabaseClient, clinicId: string, b: { serviceId: string; start: string; professionalId: string; contact: Contact; idempotencyKey?: string }) {
  const start = new Date(b.start);
  if (Number.isNaN(start.getTime())) return json({ error: "invalid_start" }, 400);
  const { data: t } = await db.from("treatments").select("id, name, duration_minutes").eq("clinic_id", clinicId).eq("id", b.serviceId).eq("is_active", true).maybeSingle();
  if (!t) return json({ error: "service_not_found" }, 404);
  const who = await resolveContact(db, clinicId, b.contact || {});
  const tag = b.idempotencyKey ? `[aura:${String(b.idempotencyKey).slice(0, 120)}]` : "";

  // Mesmo pedido repetido (rede caiu, a IA tentou de novo): devolve o agendamento já feito.
  if (tag) {
    const { data: same } = await db.from("appointments").select(BOOKING_FIELDS).eq("clinic_id", clinicId).like("notes", `%${tag}%`).maybeSingle();
    if (same) return json({ booking: bookingJson(same) }, 200);
  }

  // Revalida: o horário precisa estar livre agora (pode ter sido ocupado depois da consulta).
  if (!(await isFree(db, clinicId, t, b.professionalId, start))) return json({ error: "slot_unavailable" }, 409);

  const duration = Math.max(15, Number(t.duration_minutes) || 60);
  const end = new Date(start.getTime() + duration * 60_000);
  const { data: appt, error } = await db.from("appointments").insert({
    clinic_id: clinicId, patient_id: who.patientId, lead_id: who.leadId, treatment_id: t.id, professional_id: b.professionalId,
    start_time: start.toISOString(), end_time: end.toISOString(), scheduled_at: start.toISOString(), duration_minutes: duration,
    appointment_type: "evaluation", status: "scheduled", credit_check_required: false, credit_check_status: "not_required",
    notes: `Agendado pela Aura IA (WhatsApp). ${tag}`.trim(),
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
  const { data: appt } = await db.from("appointments").select("id, patient_id, lead_id, status, start_time").eq("clinic_id", clinicId).eq("id", id).maybeSingle();
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
    if (req.method === "GET" && route === "/aura/availability") {
      const q = url.searchParams;
      const from = q.get("from") || "", to = q.get("to") || "";
      if (!q.get("serviceId") || !isDate(from) || !isDate(to)) return json({ error: "invalid_query" }, 400);
      const time = q.get("time");
      if (time && !/^\d{2}:\d{2}$/.test(time)) return json({ error: "invalid_time" }, 400);
      const r = await freeSlots(db, clinicId, {
        serviceId: q.get("serviceId")!, from, to, professionalId: q.get("professionalId"), period: q.get("period"), time,
      });
      return r
        ? json({ timezone: "America/Sao_Paulo", durationMinutes: r.duration, slots: r.slots, truncated: !!r.truncated, until: r.until ?? to })
        : json({ error: "service_not_found" }, 404);
    }
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
