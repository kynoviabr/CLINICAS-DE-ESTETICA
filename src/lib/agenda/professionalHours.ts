/**
 * Horários de atendimento de um profissional (professional_availability).
 * Um período por dia da semana, com pausa opcional configurada individualmente:
 * com almoço, o dia vira dois períodos no banco (ex.: 09:00–12:00 e 13:00–18:00).
 */
import { weekDays } from '@/lib/agenda/model';

export type Pause = { enabled: boolean; start: string; end: string };
export type DayHours = { isActive: boolean; start: string; end: string; pause: Pause };
export type HoursDraft = { days: Record<number, DayHours> };

type AvailabilityRow = { day_of_week: number; start_time: unknown; end_time: unknown; is_active?: boolean | null };
type ClinicHoursRow = { day_of_week: number; opens_at: unknown; closes_at: unknown };

const hm = (v: unknown) => String(v || '').slice(0, 5);
const defaultPause = (): Pause => ({ enabled: false, start: '12:00', end: '13:00' });

/** Monta a tela a partir do banco. Sem horários cadastrados: sugere o horário da clínica (ou segunda a sexta, 9h às 18h). */
export function draftFromRows(rows: AvailabilityRow[], clinicHours: ClinicHoursRow[] = []): HoursDraft {
  const active = rows.filter((r) => r.is_active !== false);
  const days: Record<number, DayHours> = {};
  for (const d of weekDays) {
    const own = active.filter((r) => r.day_of_week === d.value).sort((a, b) => hm(a.start_time).localeCompare(hm(b.start_time)));
    if (own.length) {
      days[d.value] = {
        isActive: true,
        start: hm(own[0].start_time),
        end: hm(own[own.length - 1].end_time),
        pause: own.length >= 2
          ? { enabled: true, start: hm(own[0].end_time), end: hm(own[1].start_time) }
          : defaultPause(),
      };
      continue;
    }
    const clinic = clinicHours.filter((h) => h.day_of_week === d.value).sort((a, b) => hm(a.opens_at).localeCompare(hm(b.opens_at)));
    if (!active.length && clinic.length) {
      days[d.value] = { isActive: true, start: hm(clinic[0].opens_at), end: hm(clinic[clinic.length - 1].closes_at), pause: defaultPause() };
    } else {
      days[d.value] = { isActive: !active.length && !clinicHours.length && d.value >= 1 && d.value <= 5, start: '09:00', end: '18:00', pause: defaultPause() };
    }
  }
  return { days };
}

/** Linhas para o banco: com almoço dentro do horário do dia, o dia vira manhã e tarde. */
export function rowsFromDraft(draft: HoursDraft, clinicId: string, professionalId: string) {
  const rows: Array<{ clinic_id: string; professional_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }> = [];
  for (const d of weekDays) {
    const h = draft.days[d.value];
    if (!h?.isActive) continue;
    const base = { clinic_id: clinicId, professional_id: professionalId, day_of_week: d.value, is_active: true };
    if (h.pause.enabled && h.pause.start > h.start && h.pause.end < h.end) {
      rows.push({ ...base, start_time: h.start, end_time: h.pause.start }, { ...base, start_time: h.pause.end, end_time: h.end });
    } else {
      rows.push({ ...base, start_time: h.start, end_time: h.end });
    }
  }
  return rows;
}

/** Erros que impedem salvar. */
export function validateDraft(draft: HoursDraft): string | null {
  for (const d of weekDays) {
    const h = draft.days[d.value];
    if (h?.isActive && (!h.start || !h.end || h.end <= h.start)) return `${d.label}: o fim precisa ser depois do início.`;
    if (h?.isActive && h.pause.enabled) {
      if (!h.pause.start || !h.pause.end || h.pause.end <= h.pause.start) return `${d.label}: o fim da pausa precisa ser depois do início.`;
      if (h.pause.start <= h.start || h.pause.end >= h.end) return `${d.label}: a pausa precisa ficar dentro do horário de atendimento.`;
    }
  }
  return null;
}

/** Dias em que o profissional atende fora do horário da clínica (a agenda e a IA não oferecem esses horários). */
export function outsideClinicHours(draft: HoursDraft, clinicHours: ClinicHoursRow[]): string[] {
  if (!clinicHours.length) return [];
  const out: string[] = [];
  for (const d of weekDays) {
    const h = draft.days[d.value];
    if (!h?.isActive) continue;
    const windows = clinicHours.filter((c) => c.day_of_week === d.value);
    if (!windows.length) { out.push(`${d.label} (clínica fechada)`); continue; }
    const opens = windows.map((w) => hm(w.opens_at)).sort()[0];
    const closes = windows.map((w) => hm(w.closes_at)).sort().at(-1)!;
    if (h.start < opens || h.end > closes) out.push(`${d.label} (clínica ${opens}–${closes})`);
  }
  return out;
}

/** Resumo para o card do profissional: "Seg 09:00–12:00 e 13:00–18:00 · Ter …". */
export function hoursSummaryText(rows: AvailabilityRow[]): string {
  return weekDays.map((d) => {
    const list = rows.filter((r) => r.day_of_week === d.value).sort((a, b) => hm(a.start_time).localeCompare(hm(b.start_time)));
    return list.length ? `${d.label.slice(0, 3)} ${list.map((r) => `${hm(r.start_time)}–${hm(r.end_time)}`).join(' e ')}` : '';
  }).filter(Boolean).join(' · ');
}
