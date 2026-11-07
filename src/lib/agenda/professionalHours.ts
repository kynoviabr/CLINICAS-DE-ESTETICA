/** Horários de atendimento de um profissional (professional_availability), um intervalo por dia da semana. */
import { weekDays } from '@/lib/agenda/model';

export type DayHours = { isActive: boolean; start: string; end: string };
export type HoursDraft = Record<number, DayHours>;

type AvailabilityRow = { day_of_week: number; start_time: unknown; end_time: unknown; is_active?: boolean | null };
type ClinicHoursRow = { day_of_week: number; opens_at: unknown; closes_at: unknown };

const hm = (v: unknown) => String(v || '').slice(0, 5);

/** Sem horários cadastrados: sugere o horário da clínica (ou segunda a sexta, 9h às 18h). */
export function draftFromRows(rows: AvailabilityRow[], clinicHours: ClinicHoursRow[] = []): HoursDraft {
  const draft: HoursDraft = {};
  const active = rows.filter((r) => r.is_active !== false);
  for (const d of weekDays) {
    const own = active.find((r) => r.day_of_week === d.value);
    if (own) { draft[d.value] = { isActive: true, start: hm(own.start_time), end: hm(own.end_time) }; continue; }
    const clinic = clinicHours.filter((h) => h.day_of_week === d.value);
    if (!active.length && clinic.length) {
      draft[d.value] = { isActive: true, start: hm(clinic[0].opens_at), end: hm(clinic[clinic.length - 1].closes_at) };
    } else {
      draft[d.value] = { isActive: !active.length && !clinicHours.length && d.value >= 1 && d.value <= 5, start: '09:00', end: '18:00' };
    }
  }
  return draft;
}

export function rowsFromDraft(draft: HoursDraft, clinicId: string, professionalId: string) {
  return weekDays.filter((d) => draft[d.value]?.isActive).map((d) => ({
    clinic_id: clinicId, professional_id: professionalId, day_of_week: d.value,
    start_time: draft[d.value].start, end_time: draft[d.value].end, is_active: true,
  }));
}

/** Erros que impedem salvar (fim antes do início). */
export function validateDraft(draft: HoursDraft): string | null {
  for (const d of weekDays) {
    const h = draft[d.value];
    if (h?.isActive && (!h.start || !h.end || h.end <= h.start)) return `${d.label}: o fim precisa ser depois do início.`;
  }
  return null;
}

/** Dias em que o profissional atende fora do horário da clínica (a agenda e a IA não oferecem esses horários). */
export function outsideClinicHours(draft: HoursDraft, clinicHours: ClinicHoursRow[]): string[] {
  if (!clinicHours.length) return [];
  const out: string[] = [];
  for (const d of weekDays) {
    const h = draft[d.value];
    if (!h?.isActive) continue;
    const windows = clinicHours.filter((c) => c.day_of_week === d.value);
    if (!windows.length) { out.push(`${d.label} (clínica fechada)`); continue; }
    const opens = windows.map((w) => hm(w.opens_at)).sort()[0];
    const closes = windows.map((w) => hm(w.closes_at)).sort().at(-1)!;
    if (h.start < opens || h.end > closes) out.push(`${d.label} (clínica ${opens}–${closes})`);
  }
  return out;
}
