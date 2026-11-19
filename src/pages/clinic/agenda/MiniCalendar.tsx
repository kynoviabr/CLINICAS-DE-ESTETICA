import { useEffect, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgendaPageController } from './useAgendaPage';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Mini calendário do mês: clicar num dia abre a agenda nele. */
export function MiniCalendar({ ctx }: { ctx: AgendaPageController }) {
  const { currentDate, setCurrentDate, setViewMode } = ctx;
  const [month, setMonth] = useState(startOfMonth(currentDate));
  useEffect(() => { setMonth(startOfMonth(currentDate)); }, [currentDate]);

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });

  return (
    <div className="w-full rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={() => setMonth(subMonths(month, 1))} className="rounded p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</span>
        <button type="button" aria-label="Próximo mês" onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((d, i) => <span key={i} className="py-0.5">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {days.map((d) => {
          const selected = isSameDay(d, currentDate);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => { setCurrentDate(d); setViewMode('day'); }}
              className={`h-8 rounded-md ${selected ? 'bg-primary text-primary-foreground font-semibold' : isToday(d) ? 'border border-primary text-primary font-semibold' : 'hover:bg-muted'} ${isSameMonth(d, month) ? '' : 'text-muted-foreground/50'}`}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
