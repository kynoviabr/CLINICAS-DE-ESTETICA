type Slot = { professional_id: string | null; day_of_week: number; start_time: string; end_time: string; is_active: boolean | null };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const DEFAULT_DAY_HOURS = { start: '08:00', end: '20:00' };

/**
 * Horário de atendimento do dia (do mais cedo ao mais tarde).
 * Sem configuração alguma: 08h às 20h. Com configuração, mas sem expediente
 * nesse dia: null (dia fechado).
 */
export function dayHours(availability: Slot[], weekday: number, professionalId: string) {
  const scoped = availability.filter((s) => s.is_active
    && (professionalId === 'all' || professionalId === 'unassigned' || s.professional_id === professionalId));
  const slots = scoped.filter((s) => s.day_of_week === weekday);
  if (slots.length === 0) return scoped.length > 0 ? null : DEFAULT_DAY_HOURS;
  return {
    start: toHHMM(Math.min(...slots.map((s) => toMinutes(s.start_time)))),
    end: toHHMM(Math.max(...slots.map((s) => toMinutes(s.end_time)))),
  };
}

/** Horário da semana: do mais cedo ao mais tarde entre os dias mostrados. */
export function weekHours(availability: Slot[], weekdays: number[], professionalId: string) {
  const days = new Set(weekdays);
  const slots = availability.filter((s) => s.is_active && days.has(s.day_of_week)
    && (professionalId === 'all' || professionalId === 'unassigned' || s.professional_id === professionalId));
  if (slots.length === 0) return DEFAULT_DAY_HOURS;
  return {
    start: toHHMM(Math.min(...slots.map((s) => toMinutes(s.start_time)))),
    end: toHHMM(Math.max(...slots.map((s) => toMinutes(s.end_time)))),
  };
}

/** Horário do dia somando várias profissionais (do mais cedo ao mais tarde). Sem horário: 08h às 20h. */
export function dayHoursForMany(availability: Slot[], weekday: number, professionalIds: string[]) {
  const ids = new Set(professionalIds);
  const scoped = availability.filter((s) => s.is_active && s.professional_id && ids.has(s.professional_id));
  const slots = scoped.filter((s) => s.day_of_week === weekday);
  if (slots.length === 0) return scoped.length > 0 ? null : DEFAULT_DAY_HOURS;
  return {
    start: toHHMM(Math.min(...slots.map((s) => toMinutes(s.start_time)))),
    end: toHHMM(Math.max(...slots.map((s) => toMinutes(s.end_time)))),
  };
}

/**
 * A profissional atende neste horário? Sem nenhum horário cadastrado para ela, considera que sim
 * (a clínica ainda não configurou).
 */
export function professionalWorksAt(availability: Slot[], weekday: number, professionalId: string, hhmm: string): boolean {
  const own = availability.filter((s) => s.is_active && s.professional_id === professionalId);
  if (own.length === 0) return true;
  const minutes = toMinutes(hhmm);
  return own.some((s) => s.day_of_week === weekday && toMinutes(s.start_time) <= minutes && toMinutes(s.end_time) > minutes);
}

export type AvailabilityState = 'unconfigured' | 'working' | 'pause' | 'closed';

/**
 * Estado do horário para as profissionais filtradas. Um intervalo entre dois
 * períodos do mesmo dia é uma pausa; antes/depois do expediente é fechado.
 * Sem filtro, basta uma profissional estar atendendo para o horário ficar livre.
 */
export function availabilityStateAt(availability: Slot[], weekday: number, professionalIds: string[], hhmm: string): AvailabilityState {
  const ids = new Set(professionalIds.filter((id) => id !== 'unassigned'));
  const active = availability.filter((s) => s.is_active && s.professional_id
    && (ids.size === 0 || ids.has(s.professional_id)));
  if (active.length === 0) return 'unconfigured';

  const day = active.filter((s) => s.day_of_week === weekday);
  if (day.length === 0) return 'closed';

  const minutes = toMinutes(hhmm);
  if (day.some((s) => toMinutes(s.start_time) <= minutes && toMinutes(s.end_time) > minutes)) return 'working';

  const firstStart = Math.min(...day.map((s) => toMinutes(s.start_time)));
  const lastEnd = Math.max(...day.map((s) => toMinutes(s.end_time)));
  return minutes >= firstStart && minutes < lastEnd ? 'pause' : 'closed';
}

/** Horário em que o agendamento cai na grade (arredonda para baixo). */
export const slotOf = (hhmm: string, step = 30) => toHHMM(Math.floor(toMinutes(hhmm) / step) * step);

/**
 * Linhas da grade do dia, de "step" em "step" minutos.
 * Agendamentos fora do horário de atendimento estendem a grade para aparecerem.
 */
export function daySlots(hours: { start: string; end: string } | null, appointmentTimes: string[] = [], step = 30): string[] {
  const times = appointmentTimes.map((t) => toMinutes(slotOf(t, step)));
  if (!hours && times.length === 0) return [];
  let start = hours ? Math.floor(toMinutes(hours.start) / step) * step : Math.min(...times);
  let end = hours ? toMinutes(hours.end) : Math.max(...times) + step;
  if (times.length) {
    start = Math.min(start, ...times);
    end = Math.max(end, Math.max(...times) + step);
  }
  const slots: string[] = [];
  for (let m = start; m < end; m += step) slots.push(toHHMM(m));
  return slots;
}
