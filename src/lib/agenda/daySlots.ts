type Slot = { professional_id: string | null; day_of_week: number; start_time: string; end_time: string; is_active: boolean | null };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const DEFAULT_DAY_HOURS = { start: '08:00', end: '20:00' };

/** Horário de atendimento do dia (do mais cedo ao mais tarde). Sem horário cadastrado: 08h às 20h. */
export function dayHours(availability: Slot[], weekday: number, professionalId: string) {
  const slots = availability.filter((s) => s.is_active && s.day_of_week === weekday
    && (professionalId === 'all' || professionalId === 'unassigned' || s.professional_id === professionalId));
  if (slots.length === 0) return DEFAULT_DAY_HOURS;
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

/** Horário em que o agendamento cai na grade (arredonda para baixo). */
export const slotOf = (hhmm: string, step = 30) => toHHMM(Math.floor(toMinutes(hhmm) / step) * step);

/**
 * Linhas da grade do dia, de "step" em "step" minutos.
 * Agendamentos fora do horário de atendimento estendem a grade para aparecerem.
 */
export function daySlots(hours: { start: string; end: string }, appointmentTimes: string[] = [], step = 30): string[] {
  const times = appointmentTimes.map((t) => toMinutes(slotOf(t, step)));
  let start = Math.floor(toMinutes(hours.start) / step) * step;
  let end = toMinutes(hours.end);
  if (times.length) {
    start = Math.min(start, ...times);
    end = Math.max(end, Math.max(...times) + step);
  }
  const slots: string[] = [];
  for (let m = start; m < end; m += step) slots.push(toHHMM(m));
  return slots;
}
