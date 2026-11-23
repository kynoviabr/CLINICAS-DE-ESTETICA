type Slot = { professional_id: string | null; day_of_week: number; is_active: boolean | null };

/**
 * Dias da semana (0 = domingo) em que a clínica atende, pelo horário cadastrado.
 * Com um profissional filtrado, só os dias dele. Sem horário cadastrado: null (mostra todos).
 */
export function workingWeekdays(availability: Slot[], professionalId: string): Set<number> | null {
  const active = availability.filter((s) => s.is_active
    && (professionalId === 'all' || professionalId === 'unassigned' || s.professional_id === professionalId));
  if (active.length === 0) return null;
  return new Set(active.map((s) => s.day_of_week));
}

/** Dias que a semana mostra: os de atendimento e qualquer outro que tenha agendamento. */
export function visibleWeekDays(days: Date[], workdays: Set<number> | null, hasAppointments: (day: Date) => boolean): Date[] {
  if (!workdays) return days;
  return days.filter((day) => workdays.has(day.getDay()) || hasAppointments(day));
}
