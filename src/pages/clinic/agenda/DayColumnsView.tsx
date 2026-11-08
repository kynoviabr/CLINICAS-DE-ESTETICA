import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, GripVertical } from 'lucide-react';
import { availabilityStateAt, dayHoursForMany, daySlots, slotOf } from '@/lib/agenda/daySlots';
import { statusConfig, formatDurationMinutes } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

/** Visão Dia com uma coluna por profissional escolhida (nome no topo). */
export function DayColumnsView({ ctx, professionalIds }: { ctx: AgendaPageController; professionalIds: string[] }) {
  const [draggingApptId, setDraggingApptId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

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
    moveAppointmentMutation,
  } = ctx;

  const weekday = currentDate.getDay();
  const dayAppts = getApptsForDay(currentDate);
  const dayBlocks = getBlocksForDay(currentDate);
  const hours = dayHoursForMany(availability, weekday, professionalIds);
  const slots = daySlots(
    hours,
    dayAppts.flatMap((a) => [
      format(getAppointmentStartDate(a), 'HH:mm'),
      format(getAppointmentEndDate(a), 'HH:mm'),
    ])
  );
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
                const ongoing = mine.filter((a) => {
                  const aStart = getAppointmentStartDate(a).getTime();
                  const aEnd = getAppointmentEndDate(a).getTime();
                  return aStart < start && aEnd > start;
                });
                const busy = mine.some((a) => getAppointmentStartDate(a).getTime() <= start && getAppointmentEndDate(a).getTime() > start);
                const blocked = !!block && (!block.professional_id || block.professional_id === id);
                const availabilityState = availabilityStateAt(availability, weekday, [id], time);
                const works = availabilityState === 'working' || availabilityState === 'unconfigured';
                const free = starting.length === 0 && ongoing.length === 0 && !busy && !blocked && works;
                const cellKey = `${id}_${time}`;
                const isHovered = dragOverKey === cellKey;
                return (
                  <div
                    key={id}
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
                        newDate: format(currentDate, 'yyyy-MM-dd'),
                        newTime: time,
                        newProfessionalId: id,
                      });
                    }}
                    className={`min-h-[44px] border-l p-0.5 space-y-0.5 transition-colors ${
                      !works && starting.length === 0 && ongoing.length === 0 ? 'bg-muted/40' : ''
                    } ${isHovered ? 'bg-primary/10 ring-2 ring-primary/40 ring-dashed' : ''}`}
                  >
                    {blocked && starting.length === 0 && ongoing.length === 0 && (
                      <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700" title={block?.reason}>Bloqueado</div>
                    )}
                    {availabilityState === 'pause' && starting.length === 0 && ongoing.length === 0 && !blocked && (
                      <div className="truncate rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700">Pausa</div>
                    )}
                    {starting.map((a) => {
                      const canDrag = !['cancelled', 'completed', 'rescheduled'].includes(a.status);
                      const isDraggingThis = draggingApptId === a.id;
                      const note = (a.notes || (a.patients as { notes?: string | null } | null)?.notes || (a.leads as { notes?: string | null } | null)?.notes)?.trim();
                      const durMin = Math.round((getAppointmentEndDate(a).getTime() - getAppointmentStartDate(a).getTime()) / 60000);
                      const durLabel = formatDurationMinutes(durMin);
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
                          title={canDrag ? 'Arraste para mover horário ou profissional' : undefined}
                        >
                          <div className="font-semibold flex items-center justify-between">
                            <span>
                              {format(getAppointmentStartDate(a), 'HH:mm')}–{format(getAppointmentEndDate(a), 'HH:mm')}
                              {durLabel && <span className="ml-1 opacity-80 font-normal">({durLabel})</span>}
                              {a.appointment_type === 'evaluation' && <span className="ml-1 rounded bg-white/20 px-1 text-[9px]">Avaliação</span>}
                            </span>
                            {canDrag && <GripVertical className="h-3 w-3 opacity-70 shrink-0" />}
                          </div>
                          <div className="truncate">{getAppointmentDisplayName(a)}</div>
                          <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                          {note && (
                            <div className="mt-1 rounded bg-black/20 p-1 text-[10px]">
                              <span className="font-semibold text-sky-200">Nota:</span>
                              <p className="line-clamp-2 opacity-95 break-words whitespace-pre-wrap">
                                {note}
                              </p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {ongoing.map((a) => {
                      const canDrag = !['cancelled', 'completed', 'rescheduled'].includes(a.status);
                      const isDraggingThis = draggingApptId === a.id;
                      return (
                        <button
                          type="button"
                          key={`ongoing-${a.id}-${time}`}
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
                          className={`block w-full rounded p-1.5 text-left text-[11px] border border-dashed transition-all hover:brightness-105 ${
                            canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${isDraggingThis ? 'opacity-40 scale-[0.98] ring-2 ring-white/60' : ''}`}
                          style={{
                            backgroundColor: `${getProfColor(a.professional_id)}18`,
                            borderColor: getProfColor(a.professional_id),
                          }}
                          onClick={() => setViewAppt(a)}
                          title={`Continuação até ${format(getAppointmentEndDate(a), 'HH:mm')}: ${getAppointmentDisplayName(a)}`}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className="truncate">↳ {getAppointmentDisplayName(a)}</span>
                            <span className="text-[10px] opacity-75 shrink-0 ml-1">até {format(getAppointmentEndDate(a), 'HH:mm')}</span>
                          </div>
                          <div className="truncate text-[10px] opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                        </button>
                      );
                    })}
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
