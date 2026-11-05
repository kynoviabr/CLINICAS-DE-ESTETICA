import { format, isSameDay } from 'date-fns';
import { Plus } from 'lucide-react';
import { statusConfig } from '@/lib/agenda/model';
import { visibleWeekDays, workingWeekdays } from '@/lib/agenda/workDays';
import { daySlots, slotOf, weekHours } from '@/lib/agenda/daySlots';
import type { AgendaPageController } from './useAgendaPage';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
};

export function WeekView({ ctx }: { ctx: AgendaPageController }) {
  const {
    viewMode,
    setViewAppt,
    calendarDays,
    getAppointmentStartDate,
    getAppointmentEndDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfColor,
    getApptsForDay,
    dayNames,
    availability,
    filterProfessional,
    resetForm,
    setSelectedDate,
    setSelectedTime,
    setSelectedProfessional,
    setDialogOpen,
    isProfessional,
    myProfessionalId,
  } = ctx;

  const workdays = workingWeekdays(availability, filterProfessional);
  const days = visibleWeekDays(calendarDays, workdays, (day) => getApptsForDay(day).length > 0);
  const hours = weekHours(availability, days.map((d) => d.getDay()), filterProfessional);
  const slots = daySlots(hours, days.flatMap((day) => getApptsForDay(day).map((a) => format(getAppointmentStartDate(a), 'HH:mm'))));

  const forProfessional = (professionalId: string | null) =>
    filterProfessional === 'all' || filterProfessional === 'unassigned' || professionalId === filterProfessional;
  // Horário de atendimento daquele dia (sem horário cadastrado na clínica: tudo livre).
  const inWorkingHours = (day: Date, time: string) => {
    if (!workdays) return true;
    const minutes = toMinutes(time);
    return availability.some((s) => s.is_active && s.day_of_week === day.getDay() && forProfessional(s.professional_id)
      && toMinutes(s.start_time) <= minutes && toMinutes(s.end_time) > minutes);
  };
  const at = (day: Date, time: string) => new Date(`${format(day, 'yyyy-MM-dd')}T${time}:00`).getTime();

  // "+" na grade: abre o agendamento já com o dia e o horário.
  const openNewAt = (day: Date, time: string) => {
    resetForm();
    setSelectedDate(format(day, 'yyyy-MM-dd'));
    setSelectedTime(time);
    if (filterProfessional !== 'all' && filterProfessional !== 'unassigned') setSelectedProfessional(filterProfessional);
    else if (isProfessional && myProfessionalId) setSelectedProfessional(myProfessionalId);
    setDialogOpen(true);
  };

  if (viewMode !== 'week') return null;

  const columns = `3.5rem repeat(${days.length}, minmax(7rem, 1fr))`;
  return (
    <div className="bg-card rounded-xl shadow-card overflow-x-auto animate-fade-in">
      <div className="min-w-fit">
        {/* Cabeçalho dos dias */}
        <div className="grid border-b bg-secondary/50" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className={`px-2 py-2 text-center border-l ${isToday ? 'bg-primary/10' : ''}`}>
                <div className="text-xs text-muted-foreground">{dayNames[day.getDay()]}</div>
                <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
              </div>
            );
          })}
        </div>

        {/* Grade de horários */}
        {slots.map((time) => (
          <div key={time} className="grid border-b border-border/60 last:border-b-0" style={{ gridTemplateColumns: columns }}>
            <div className="px-2 pt-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">{time}</div>
            {days.map((day) => {
              const dayAppts = getApptsForDay(day);
              const starting = dayAppts.filter((a) => slotOf(format(getAppointmentStartDate(a), 'HH:mm')) === time);
              const start = at(day, time);
              const busy = dayAppts.some((a) => getAppointmentStartDate(a).getTime() <= start && getAppointmentEndDate(a).getTime() > start);
              const block = getBlocksForDay(day).find((b) => new Date(b.start_at).getTime() <= start && new Date(b.end_at).getTime() > start);
              const open = inWorkingHours(day, time);
              const free = starting.length === 0 && !busy && !block && open;
              return (
                <div key={day.toISOString()} className={`min-h-[44px] border-l p-0.5 space-y-0.5 ${!open && starting.length === 0 ? 'bg-muted/40' : ''}`}>
                  {block && starting.length === 0 && (
                    <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700" title={block.reason}>Bloqueado</div>
                  )}
                  {starting.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      className={`block w-full rounded p-1.5 text-left text-[11px] text-white ${statusConfig[a.status]?.style || ''}`}
                      style={{ backgroundColor: getProfColor(a.professional_id) }}
                      onClick={() => setViewAppt(a)}
                    >
                      <div className="font-semibold">
                        {format(getAppointmentStartDate(a), 'HH:mm')}
                        {a.appointment_type === 'evaluation' && <span className="ml-1 rounded bg-white/20 px-1 text-[9px]">Avaliação</span>}
                      </div>
                      <div className="truncate">{getAppointmentDisplayName(a)}</div>
                      <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                    </button>
                  ))}
                  {free && (
                    <button
                      type="button"
                      onClick={() => openNewAt(day, time)}
                      className="flex h-full min-h-[40px] w-full items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-primary/5 hover:text-primary"
                      title={`Agendar ${dayNames[day.getDay()]} ${format(day, 'dd/MM')} às ${time}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
