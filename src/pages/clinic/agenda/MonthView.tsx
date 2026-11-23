import { format, isSameMonth, isSameDay } from 'date-fns';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function MonthView({ ctx }: { ctx: AgendaPageController }) {
  const {
    currentDate,
    viewMode,
    setDialogOpen,
    setViewAppt,
    setSelectedDate,
    calendarDays,
    getAppointmentStartDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfColor,
    resetForm,
    getApptsForDay,
    dayNames,
  } = ctx;
  return (
    <>
    {viewMode === 'month' && (
      <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
        <div className="grid grid-cols-7">
          {dayNames.map(d => (
            <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b bg-secondary/50">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayAppts = getApptsForDay(day);
            const dayBlocks = getBlocksForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={i}
                className={`min-h-[80px] md:min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-secondary/30 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
                onClick={() => { setSelectedDate(format(day, 'yyyy-MM-dd')); resetForm(); setDialogOpen(true); }}
              >
                <span className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${isToday ? 'gradient-primary text-primary-foreground' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                {dayBlocks.length > 0 && (
                  <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-700">
                    {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''}
                  </div>
                )}
                <div className="space-y-0.5 mt-1">
                  {dayAppts.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      className={`rounded px-1.5 py-1 text-[10px] text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                      style={{ backgroundColor: getProfColor(a.professional_id) }}
                      onClick={e => { e.stopPropagation(); setViewAppt(a); }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-medium">{format(getAppointmentStartDate(a), 'HH:mm')} {getAppointmentDisplayName(a).split(' ')[0]}</span>
                        <div className="flex gap-1 shrink-0">
                          {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1 text-[9px]">A</span>}
                          {a.is_batch && <span className="rounded bg-white/20 px-1 text-[9px]">L</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {dayAppts.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayAppts.length - 3} mais</span>}
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
