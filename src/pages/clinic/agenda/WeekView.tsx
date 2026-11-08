import { useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { Plus, GripVertical } from 'lucide-react';
import { statusConfig } from '@/lib/agenda/model';
import { visibleWeekDays, workingWeekdays } from '@/lib/agenda/workDays';
import { availabilityStateAt, daySlots, slotOf, weekHours } from '@/lib/agenda/daySlots';
import type { AgendaPageController } from './useAgendaPage';

export function WeekView({ ctx }: { ctx: AgendaPageController }) {
  const [draggingApptId, setDraggingApptId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

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
    filterProfessionals,
    resetForm,
    setSelectedDate,
    setSelectedTime,
    setSelectedProfessional,
    setDialogOpen,
    isProfessional,
    myProfessionalId,
    moveAppointmentMutation,
  } = ctx;

  const workdays = workingWeekdays(availability, filterProfessional);
  const days = visibleWeekDays(calendarDays, workdays, (day) => getApptsForDay(day).length > 0);
  const hours = weekHours(availability, days.map((d) => d.getDay()), filterProfessional);
  const slots = daySlots(hours, days.flatMap((day) => getApptsForDay(day).map((a) => format(getAppointmentStartDate(a), 'HH:mm'))));

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
              const availabilityState = availabilityStateAt(availability, day.getDay(), filterProfessionals, time);
              const open = availabilityState === 'working' || availabilityState === 'unconfigured';
              const free = starting.length === 0 && !busy && !block && open;
              const cellKey = `${format(day, 'yyyy-MM-dd')}_${time}`;
              const isHovered = dragOverKey === cellKey;
              return (
                <div
                  key={day.toISOString()}
                  onDragOver={(e) => {
                    if (draggingApptId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    if (dragOverKey === cellKey) setDragOverKey(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    const appointmentId = e.dataTransfer.getData('text/plain') || draggingApptId;
                    if (!appointmentId) return;
                    setDraggingApptId(null);
                    moveAppointmentMutation.mutate({
                      appointmentId,
                      newDate: format(day, 'yyyy-MM-dd'),
                      newTime: time,
                    });
                  }}
                  className={`min-h-[44px] border-l p-0.5 space-y-0.5 transition-colors ${
                    !open && starting.length === 0 ? 'bg-muted/40' : ''
                  } ${isHovered ? 'bg-primary/10 ring-2 ring-primary/40 ring-dashed' : ''}`}
                >
                  {block && starting.length === 0 && (
                    <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700" title={block.reason}>Bloqueado</div>
                  )}
                  {availabilityState === 'pause' && starting.length === 0 && !block && (
                    <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700">Pausa</div>
                  )}
                  {starting.map((a) => {
                    const canDrag = !['cancelled', 'completed', 'rescheduled'].includes(a.status);
                    const isDraggingThis = draggingApptId === a.id;
                    return (
                      <button
                        type="button"
                        key={a.id}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          e.dataTransfer.setData('text/plain', a.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingApptId(a.id);
                        }}
                        onDragEnd={() => {
                          setDraggingApptId(null);
                          setDragOverKey(null);
                        }}
                        className={`block w-full rounded p-1.5 text-left text-[11px] text-white transition-all ${
                          statusConfig[a.status]?.style || ''
                        } ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${
                          isDraggingThis ? 'opacity-40 scale-[0.98] ring-2 ring-white/60' : ''
                        }`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={() => setViewAppt(a)}
                        title={canDrag ? 'Arraste para mover para outro horário ou dia' : undefined}
                      >
                        <div className="font-semibold flex items-center justify-between">
                          <span>
                            {format(getAppointmentStartDate(a), 'HH:mm')}
                            {a.appointment_type === 'evaluation' && <span className="ml-1 rounded bg-white/20 px-1 text-[9px]">Avaliação</span>}
                          </span>
                          {canDrag && <GripVertical className="h-3 w-3 opacity-70 shrink-0" />}
                        </div>
                        <div className="truncate">{getAppointmentDisplayName(a)}</div>
                        <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                      </button>
                    );
                  })}
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
