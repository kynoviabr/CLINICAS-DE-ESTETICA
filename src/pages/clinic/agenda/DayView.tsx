import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { availabilityStateAt, dayHours, daySlots, slotOf } from '@/lib/agenda/daySlots';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';
import { DayColumnsView } from './DayColumnsView';

export function DayView({ ctx }: { ctx: AgendaPageController }) {
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
  } = ctx;

  const dayAppts = getApptsForDay(currentDate);
  const dayBlocks = getBlocksForDay(currentDate);
  const hours = dayHours(availability, currentDate.getDay(), filterProfessional);
  const slots = daySlots(hours, dayAppts.map((a) => format(getAppointmentStartDate(a), 'HH:mm')));
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
            const starting = dayAppts.filter((a) => slotOf(format(getAppointmentStartDate(a), 'HH:mm')) === time);
            const block = blockAt(time);
            const availabilityState = availabilityStateAt(availability, currentDate.getDay(), filterProfessionals, time);
            const open = availabilityState === 'working' || availabilityState === 'unconfigured';
            const free = starting.length === 0 && !block && !isBusy(time) && open;
            return (
              <div key={time} className="flex gap-3 py-1.5 min-h-[48px]">
                <div className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground tabular-nums">{time}</div>
                <div className="flex-1 min-w-0 space-y-2">
                  {block && starting.length === 0 && (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Bloqueado · {block.reason}</div>
                  )}
                  {availabilityState === 'pause' && starting.length === 0 && !block && (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Pausa</div>
                  )}
                  {starting.map((a) => {
                    const sc = statusConfig[a.status];
                    return (
                      <div
                        key={a.id}
                        className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${sc?.style || ''}`}
                        onClick={() => setViewAppt(a)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
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
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">{format(getAppointmentStartDate(a), 'HH:mm')} - {format(getAppointmentEndDate(a), 'HH:mm')}</p>
                            <div className="mt-1 flex items-center justify-end gap-2">
                              <BrandBadge status={sc?.badge || 'default'}>{sc?.label || a.status}</BrandBadge>
                              <BrandButton
                                size="sm"
                                variant="outline"
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
