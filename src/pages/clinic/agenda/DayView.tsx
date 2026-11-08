import { useState } from 'react';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { format } from 'date-fns';
import { Plus, GripVertical } from 'lucide-react';
import { availabilityStateAt, dayHours, daySlots, slotOf } from '@/lib/agenda/daySlots';
import { statusConfig, formatDurationMinutes } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';
import { DayColumnsView } from './DayColumnsView';

export function DayView({ ctx }: { ctx: AgendaPageController }) {
  const [draggingApptId, setDraggingApptId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const {
    currentDate,
    viewMode,
    setViewAppt,
    getAppointmentStartDate,
    getAppointmentEndDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfessionalLabel,
    getApptsForDay,
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

  const dayAppts = getApptsForDay(currentDate);
  const dayBlocks = getBlocksForDay(currentDate);
  const hours = dayHours(availability, currentDate.getDay(), filterProfessional);
  const slots = daySlots(
    hours,
    dayAppts.flatMap((a) => [
      format(getAppointmentStartDate(a), 'HH:mm'),
      format(getAppointmentEndDate(a), 'HH:mm'),
    ])
  );
  const professionalIsClosed = hours === null && dayAppts.length === 0;
  const visibleBlocks = professionalIsClosed ? [] : dayBlocks;
  const slotDate = (time: string) => new Date(`${format(currentDate, 'yyyy-MM-dd')}T${time}:00`);
  const isBusy = (time: string) => {
    const start = slotDate(time).getTime();
    return dayAppts.some((a) => getAppointmentStartDate(a).getTime() <= start && getAppointmentEndDate(a).getTime() > start);
  };
  const blockAt = (time: string) => {
    const start = slotDate(time).getTime();
    return visibleBlocks.find((b) => new Date(b.start_at).getTime() <= start && new Date(b.end_at).getTime() > start);
  };

  // "+" na grade: abre o agendamento já com o dia e o horário.
  const openNewAt = (time: string) => {
    resetForm();
    setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
    setSelectedTime(time);
    if (filterProfessional !== 'all' && filterProfessional !== 'unassigned') setSelectedProfessional(filterProfessional);
    else if (isProfessional && myProfessionalId) setSelectedProfessional(myProfessionalId);
    setDialogOpen(true);
  };

  // 2 ou mais profissionais escolhidas: uma coluna para cada.
  const columnProfessionals = filterProfessionals.filter((id) => id !== 'unassigned');
  if (viewMode === 'day' && columnProfessionals.length >= 2) {
    return <DayColumnsView ctx={ctx} professionalIds={columnProfessionals} />;
  }

  const isDraggable = (status: string) => !['cancelled', 'completed', 'rescheduled'].includes(status);

  return (
    <>
    {viewMode === 'day' && (
      <div className="bg-card rounded-xl shadow-card p-4 animate-fade-in">
        {professionalIsClosed && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Esta profissional não atende neste dia.
          </div>
        )}
        {visibleBlocks.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">Dia com bloqueios operacionais</p>
            <div className="mt-2 space-y-1 text-xs text-amber-700">
              {visibleBlocks.map((block) => (
                <p key={block.id}>
                  {format(new Date(block.start_at), 'HH:mm')} - {format(new Date(block.end_at), 'HH:mm')} · {block.reason}
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="divide-y divide-border/60">
          {slots.map((time) => {
            const slotStartTime = slotDate(time).getTime();
            const starting = dayAppts.filter((a) => slotOf(format(getAppointmentStartDate(a), 'HH:mm')) === time);
            const ongoing = dayAppts.filter((a) => {
              const start = getAppointmentStartDate(a).getTime();
              const end = getAppointmentEndDate(a).getTime();
              return start < slotStartTime && end > slotStartTime;
            });
            const block = blockAt(time);
            const availabilityState = availabilityStateAt(availability, currentDate.getDay(), filterProfessionals, time);
            const open = availabilityState === 'working' || availabilityState === 'unconfigured';
            const free = starting.length === 0 && ongoing.length === 0 && !block && !isBusy(time) && open;
            const isHovered = dragOverSlot === time;
            return (
              <div
                key={time}
                onDragOver={(e) => {
                  if (draggingApptId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverSlot !== time) setDragOverSlot(time);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  if (dragOverSlot === time) setDragOverSlot(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  const appointmentId = e.dataTransfer.getData('text/plain') || draggingApptId;
                  if (!appointmentId) return;
                  setDraggingApptId(null);
                  moveAppointmentMutation.mutate({
                    appointmentId,
                    newDate: format(currentDate, 'yyyy-MM-dd'),
                    newTime: time,
                  });
                }}
                className={`flex gap-3 py-1.5 min-h-[48px] rounded-lg transition-colors px-1 ${
                  isHovered ? 'bg-primary/10 ring-2 ring-primary/40 ring-dashed' : ''
                }`}
              >
                <div className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground tabular-nums">{time}</div>
                <div className="flex-1 min-w-0 space-y-2">
                  {isHovered && starting.length === 0 && ongoing.length === 0 && !block && (
                    <div className="rounded-md border border-dashed border-primary/50 bg-primary/5 py-1 px-3 text-xs font-medium text-primary text-center">
                      Mover agendamento para {time}
                    </div>
                  )}
                  {block && starting.length === 0 && ongoing.length === 0 && (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Bloqueado · {block.reason}</div>
                  )}
                  {availabilityState === 'pause' && starting.length === 0 && ongoing.length === 0 && !block && (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Pausa</div>
                  )}
                  {starting.map((a) => {
                    const sc = statusConfig[a.status];
                    const canDrag = isDraggable(a.status);
                    const isDraggingThis = draggingApptId === a.id;
                    const apptNote = a.notes?.trim();
                    const patientNote = (a.patients as { notes?: string | null } | null)?.notes?.trim();
                    const leadNote = (a.leads as { notes?: string | null } | null)?.notes?.trim();
                    const contactNote = patientNote || leadNote;
                    const contactNoteLabel = patientNote ? 'Nota do Paciente' : 'Nota do Lead';
                    const hasBothNotes = Boolean(apptNote && contactNote && apptNote !== contactNote);
                    const singleNote = apptNote || contactNote;
                    const durMin = Math.round((getAppointmentEndDate(a).getTime() - getAppointmentStartDate(a).getTime()) / 60000);
                    const durLabel = formatDurationMinutes(durMin);
                    return (
                      <div
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
                          setDragOverSlot(null);
                        }}
                        className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-all ${sc?.style || ''} ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${isDraggingThis ? 'opacity-40 scale-[0.99] border-dashed ring-2 ring-primary ring-offset-2' : ''}`}
                        onClick={() => setViewAppt(a)}
                        title={canDrag ? 'Arraste para mover para outro horário' : undefined}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {canDrag && (
                                <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0 hover:text-foreground" />
                              )}
                              <p className="font-semibold text-foreground">{getAppointmentDisplayName(a)}</p>
                              {a.appointment_type === 'evaluation' && (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                  Avaliação
                                </span>
                              )}
                              {a.is_batch && (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                                  Sessão em lote
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{(a.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}</p>
                            <p className="text-xs text-muted-foreground">{getProfessionalLabel(a.professional_id)}</p>

                            {hasBothNotes ? (
                              <div className="mt-2.5 space-y-1.5">
                                <div className="rounded-lg border border-blue-200/80 bg-blue-50/80 p-2.5 text-xs dark:border-blue-800/40 dark:bg-blue-950/30">
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">Nota</span>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-foreground/90 leading-relaxed font-normal">{apptNote}</p>
                                </div>
                                <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-2 text-xs dark:border-blue-800/30 dark:bg-blue-950/20">
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">{contactNoteLabel}</span>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90 leading-relaxed font-normal">{contactNote}</p>
                                </div>
                              </div>
                            ) : singleNote ? (
                              <div className="mt-2.5 rounded-lg border border-blue-200/80 bg-blue-50/80 p-2.5 text-xs dark:border-blue-800/40 dark:bg-blue-950/30">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">Nota</span>
                                <p className="mt-1 whitespace-pre-wrap break-words text-foreground/90 leading-relaxed font-normal">{singleNote}</p>
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-foreground flex items-center justify-end gap-1.5">
                              <span>{format(getAppointmentStartDate(a), 'HH:mm')} - {format(getAppointmentEndDate(a), 'HH:mm')}</span>
                              {durLabel && (
                                <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-semibold">
                                  {durLabel}
                                </span>
                              )}
                            </p>
                            <div className="mt-1 flex items-center justify-end gap-2">
                              <BrandBadge status={sc?.badge || 'default'}>{sc?.label || a.status}</BrandBadge>
                              <BrandButton
                                size="sm"
                                variant="outline"
                                draggable={false}
                                onDragStart={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setViewAppt(a);
                                }}
                              >
                                Ver
                              </BrandButton>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ongoing.map((a) => {
                    const sc = statusConfig[a.status];
                    const canDrag = isDraggable(a.status);
                    const isDraggingThis = draggingApptId === a.id;
                    const durMin = Math.round((getAppointmentEndDate(a).getTime() - getAppointmentStartDate(a).getTime()) / 60000);
                    const durLabel = formatDurationMinutes(durMin);
                    return (
                      <div
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
                          setDragOverSlot(null);
                        }}
                        onClick={() => setViewAppt(a)}
                        className={`px-4 py-2.5 rounded-lg border border-dashed bg-muted/40 hover:bg-muted/70 cursor-pointer transition-all flex items-center justify-between gap-4 ${sc?.style || ''} ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${isDraggingThis ? 'opacity-40 scale-[0.99] border-dashed ring-2 ring-primary ring-offset-2' : ''}`}
                        title={canDrag ? 'Arraste para mover para outro horário' : undefined}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {canDrag && (
                            <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0 hover:text-foreground" />
                          )}
                          <div className="flex items-center gap-2 flex-wrap min-w-0 text-sm">
                            <span className="text-xs font-semibold text-primary/80">↳ Continuação:</span>
                            <span className="font-semibold text-foreground truncate">{getAppointmentDisplayName(a)}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              · {(a.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              ({getProfessionalLabel(a.professional_id)})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            Término às <strong className="text-foreground">{format(getAppointmentEndDate(a), 'HH:mm')}</strong>
                            {durLabel && <span className="ml-1 text-[11px] text-muted-foreground">({durLabel})</span>}
                          </span>
                          <BrandBadge status={sc?.badge || 'default'} className="scale-90">{sc?.label || a.status}</BrandBadge>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            draggable={false}
                            onDragStart={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewAppt(a);
                            }}
                          >
                            Ver
                          </BrandButton>
                        </div>
                      </div>
                    );
                  })}
                  {free && (
                    <button
                      type="button"
                      onClick={() => openNewAt(time)}
                      className="group flex h-9 w-full items-center justify-center rounded-md border border-dashed border-transparent text-muted-foreground/50 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      title={`Agendar às ${time}`}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="ml-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">Agendar às {time}</span>
                    </button>
                  )}
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
