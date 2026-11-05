import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { dayHoursForMany, daySlots, professionalWorksAt, slotOf } from '@/lib/agenda/daySlots';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

/** Visão Dia com uma coluna por profissional escolhida (nome no topo). */
export function DayColumnsView({ ctx, professionalIds }: { ctx: AgendaPageController; professionalIds: string[] }) {
  const {
    currentDate,
    setViewAppt,
    getAppointmentStartDate,
    getAppointmentEndDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfColor,
    getApptsForDay,
    getProfessionalLabel,
    availability,
    resetForm,
    setSelectedDate,
    setSelectedTime,
    setSelectedProfessional,
    setDialogOpen,
  } = ctx;

  const weekday = currentDate.getDay();
  const dayAppts = getApptsForDay(currentDate);
  const dayBlocks = getBlocksForDay(currentDate);
  const hours = dayHoursForMany(availability, weekday, professionalIds);
  const slots = daySlots(hours, dayAppts.map((a) => format(getAppointmentStartDate(a), 'HH:mm')));
  const at = (time: string) => new Date(`${format(currentDate, 'yyyy-MM-dd')}T${time}:00`).getTime();

  const openNewAt = (professionalId: string, time: string) => {
    resetForm();
    setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
    setSelectedTime(time);
    setSelectedProfessional(professionalId);
    setDialogOpen(true);
  };

  const columns = `3.5rem repeat(${professionalIds.length}, minmax(9rem, 1fr))`;
  return (
    <div className="bg-card rounded-xl shadow-card overflow-x-auto animate-fade-in">
      <div className="min-w-fit">
        <div className="grid border-b bg-secondary/50" style={{ gridTemplateColumns: columns }}>
          <div />
          {professionalIds.map((id) => (
            <div key={id} className="flex items-center justify-center gap-2 border-l px-2 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getProfColor(id) }} />
              <span className="truncate text-sm font-semibold">{getProfessionalLabel(id)}</span>
            </div>
          ))}
        </div>

        {slots.map((time) => {
          const start = at(time);
          const block = dayBlocks.find((b) => new Date(b.start_at).getTime() <= start && new Date(b.end_at).getTime() > start);
          return (
            <div key={time} className="grid border-b border-border/60 last:border-b-0" style={{ gridTemplateColumns: columns }}>
              <div className="px-2 pt-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">{time}</div>
              {professionalIds.map((id) => {
                const mine = dayAppts.filter((a) => a.professional_id === id);
                const starting = mine.filter((a) => slotOf(format(getAppointmentStartDate(a), 'HH:mm')) === time);
                const busy = mine.some((a) => getAppointmentStartDate(a).getTime() <= start && getAppointmentEndDate(a).getTime() > start);
                const blocked = !!block && (!block.professional_id || block.professional_id === id);
                const works = professionalWorksAt(availability, weekday, id, time);
                const free = starting.length === 0 && !busy && !blocked && works;
                return (
                  <div key={id} className={`min-h-[44px] border-l p-0.5 space-y-0.5 ${!works && starting.length === 0 ? 'bg-muted/40' : ''}`}>
                    {blocked && starting.length === 0 && (
                      <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700" title={block?.reason}>Bloqueado</div>
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
                          {format(getAppointmentStartDate(a), 'HH:mm')}–{format(getAppointmentEndDate(a), 'HH:mm')}
                          {a.appointment_type === 'evaluation' && <span className="ml-1 rounded bg-white/20 px-1 text-[9px]">Avaliação</span>}
                        </div>
                        <div className="truncate">{getAppointmentDisplayName(a)}</div>
                        <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                      </button>
                    ))}
                    {free && (
                      <button
                        type="button"
                        onClick={() => openNewAt(id, time)}
                        className="flex h-full min-h-[40px] w-full items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-primary/5 hover:text-primary"
                        title={`Agendar com ${getProfessionalLabel(id)} às ${time}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
