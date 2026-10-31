import { format, isSameDay } from 'date-fns';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function WeekView({ ctx }: { ctx: AgendaPageController }) {
  const {
    viewMode,
    setViewAppt,
    calendarDays,
    getAppointmentStartDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfessionalLabel,
    getProfColor,
    getApptsForDay,
    dayNames,
  } = ctx;
  return (
    <>
    {viewMode === 'week' && (
      <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayAppts = getApptsForDay(day);
            const dayBlocks = getBlocksForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className="border-r min-h-[300px]">
                <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-primary/10' : 'bg-secondary/50'}`}>
                  <div className="text-xs text-muted-foreground">{dayNames[i]}</div>
                  <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
                </div>
                <div className="p-1 space-y-1">
                  {dayBlocks.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                      {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''} neste dia
                    </div>
                  )}
                  {dayAppts.map((a) => (
                    <div
                      key={a.id}
                      className={`rounded p-2 text-xs text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                      style={{ backgroundColor: getProfColor(a.professional_id) }}
                      onClick={() => setViewAppt(a)}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="font-semibold">{format(getAppointmentStartDate(a), 'HH:mm')}</div>
                        <div className="flex gap-1">
                          {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Avaliação</span>}
                          {a.is_batch && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Lote</span>}
                        </div>
                      </div>
                      <div className="truncate">{getAppointmentDisplayName(a)}</div>
                      <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                      <div className="truncate opacity-80">{getProfessionalLabel(a.professional_id)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}
