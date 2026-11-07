/**
 * Cálculo dos horários livres da clínica (usado pela API da Aura IA). Sem acesso ao banco: recebe os dados e calcula.
 * Horário livre = horário da clínica ∩ disponibilidade do profissional − agendamentos (com intervalo) − bloqueios − dias fechados,
 * respeitando a duração do atendimento, a antecedência mínima e até quantos dias à frente pode marcar.
 * Horários da clínica são de Brasília (UTC-3, sem horário de verão desde 2019).
 */

export const OFFSET = '-03:00';
const OFFSET_MS = 3 * 3600_000;

export type Pro = { id: string; name: string; showName: boolean };
export type ClinicHours = { day_of_week: number; opens_at: string; closes_at: string };
export type Availability = { professional_id: string; day_of_week: number; start_time: string; end_time: string };
export type Busy = { professional_id: string | null; start: string; end: string };

export type AgendaInput = {
  from: string;            // AAAA-MM-DD
  to: string;              // AAAA-MM-DD
  durationMin: number;
  bufferMin: number;
  minNoticeMin: number;
  horizonDays: number;
  now: number;             // Date.now()
  clinicHours: ClinicHours[];
  closures: string[];      // AAAA-MM-DD
  pros: Pro[];
  availability: Availability[];
  appointments: Busy[];
  blocks: Busy[];          // professional_id null = clínica toda
  period?: 'morning' | 'afternoon' | 'evening' | null;
  time?: string | null;    // HH:MM
  stepMin?: number;
  maxSlots?: number;
};

export type Slot = { start: string; end: string; professionalId: string; professionalName: string | null };

export const at = (date: string, hm: string) => new Date(`${date}T${hm.slice(0, 5)}:00${OFFSET}`);
export const localIso = (d: Date) => new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 19) + OFFSET;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const localDate = (ms: number) => new Date(ms - OFFSET_MS).toISOString().slice(0, 10);
const dayOfWeek = (date: string) => new Date(`${date}T12:00:00${OFFSET}`).getUTCDay();
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && a2 > b1;

function inPeriod(hm: string, period?: string | null) {
  if (!period) return true;
  const h = Number(hm.slice(0, 2));
  if (period === 'morning') return h < 12;
  if (period === 'afternoon') return h >= 12 && h < 18;
  if (period === 'evening') return h >= 18;
  return true;
}

export function computeSlots(q: AgendaInput): { slots: Slot[]; truncated: boolean; until: string } {
  const step = q.stepMin ?? 30;
  const max = q.maxSlots ?? 120;
  const duration = Math.max(10, q.durationMin) * 60_000;
  const buffer = Math.max(0, q.bufferMin) * 60_000;
  const earliest = q.now + Math.max(0, q.minNoticeMin) * 60_000;
  const lastDay = addDays(localDate(q.now), q.horizonDays);
  const to = [q.to, addDays(q.from, 13), lastDay].sort()[0];
  const closed = new Set(q.closures);
  const hasClinicHours = q.clinicHours.length > 0;
  const slots: Slot[] = [];
  let truncated = false;

  for (let date = q.from; date <= to; date = addDays(date, 1)) {
    if (closed.has(date)) continue;
    const dow = dayOfWeek(date);
    const clinicWindows = q.clinicHours.filter((h) => h.day_of_week === dow).map((h) => [at(date, h.opens_at).getTime(), at(date, h.closes_at).getTime()]);
    if (hasClinicHours && !clinicWindows.length) continue; // clínica fechada neste dia da semana
    const perDay = new Map<string, Slot>();
    for (const p of q.pros) {
      for (const w of q.availability.filter((a) => a.professional_id === p.id && a.day_of_week === dow)) {
        const wEnd = at(date, w.end_time).getTime();
        for (let s = at(date, w.start_time).getTime(); s + duration <= wEnd; s += step * 60_000) {
          const e = s + duration;
          if (s < earliest) continue;
          if (hasClinicHours && !clinicWindows.some(([o, c]) => s >= o && e <= c)) continue;
          const hm = localIso(new Date(s)).slice(11, 16);
          if (q.time && hm !== q.time) continue;
          if (!inPeriod(hm, q.period)) continue;
          if (q.appointments.some((a) => a.professional_id === p.id
            && overlaps(s - buffer, e + buffer, Date.parse(a.start), Date.parse(a.end)))) continue;
          if (q.blocks.some((b) => (!b.professional_id || b.professional_id === p.id) && overlaps(s, e, Date.parse(b.start), Date.parse(b.end)))) continue;
          const key = localIso(new Date(s));
          if (!perDay.has(key)) {
            perDay.set(key, { start: key, end: localIso(new Date(e)), professionalId: p.id, professionalName: p.showName ? p.name : null });
          }
        }
      }
    }
    for (const sl of [...perDay.values()].sort((a, b) => a.start.localeCompare(b.start))) {
      if (slots.length >= max) { truncated = true; break; }
      slots.push(sl);
    }
    if (truncated) break;
  }
  return { slots, truncated, until: to };
}

/** O horário exato está livre para este profissional? (mesmas regras do cálculo acima) */
export function isSlotFree(q: Omit<AgendaInput, 'from' | 'to' | 'time' | 'period'>, professionalId: string, start: Date): boolean {
  const local = localIso(start);
  const r = computeSlots({ ...q, from: local.slice(0, 10), to: local.slice(0, 10), time: local.slice(11, 16), pros: q.pros.filter((p) => p.id === professionalId) });
  return r.slots.some((s) => s.start === local && s.professionalId === professionalId);
}

/** Pendências que impedem a IA de agendar (mostradas também na tela de configuração). */
export type Issue = { code: string; text: string };
export function setupIssues(input: {
  clinicHours: ClinicHours[];
  treatments: Array<{ id: string; name: string; ai_bookable: boolean; requires_evaluation: boolean }>;
  pros: Array<{ id: string; name: string }>;
  links: Array<{ professional_id: string; treatment_id: string }>;
  availability: Availability[];
  offersEvaluation: boolean;
}): Issue[] {
  const issues: Issue[] = [];
  if (!input.clinicHours.length) issues.push({ code: 'no_clinic_hours', text: 'Cadastre o horário de funcionamento da clínica.' });
  if (!input.pros.length) issues.push({ code: 'no_professionals', text: 'Cadastre pelo menos um profissional.' });
  for (const p of input.pros) {
    if (!input.availability.some((a) => a.professional_id === p.id)) {
      issues.push({ code: 'professional_without_hours', text: `${p.name} não tem horários de atendimento.` });
    }
  }
  for (const t of input.treatments.filter((x) => x.ai_bookable && !x.requires_evaluation)) {
    if (!input.links.some((l) => l.treatment_id === t.id && input.pros.some((p) => p.id === l.professional_id))) {
      issues.push({ code: 'treatment_without_professional', text: `${t.name} não tem profissional que atende.` });
    }
  }
  if (input.treatments.some((t) => t.requires_evaluation) && !input.offersEvaluation) {
    issues.push({ code: 'evaluation_off', text: 'Há tratamentos que exigem avaliação, mas a clínica não oferece avaliação.' });
  }
  return issues;
}
