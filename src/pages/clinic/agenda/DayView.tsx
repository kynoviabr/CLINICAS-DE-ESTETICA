import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { format } from 'date-fns';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

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
  } = ctx;
  return (
    <>
    {viewMode === 'day' && (
      <div className="bg-card rounded-xl shadow-card p-4 animate-fade-in">
        {getBlocksForDay(currentDate).length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">Dia com bloqueios operacionais</p>
            <div className="mt-2 space-y-1 text-xs text-amber-700">
              {getBlocksForDay(currentDate).map((block) => (
                <p key={block.id}>
                  {format(new Date(block.start_at), 'HH:mm')} - {format(new Date(block.end_at), 'HH:mm')} · {block.reason}
                </p>
              ))}
            </div>
          </div>
        )}
        {getApptsForDay(currentDate).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum agendamento neste dia</p>
        ) : (
          <div className="space-y-3">
            {getApptsForDay(currentDate).map((a) => {
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
          </div>
        )}
      </div>
    )}
    </>
  );
}
