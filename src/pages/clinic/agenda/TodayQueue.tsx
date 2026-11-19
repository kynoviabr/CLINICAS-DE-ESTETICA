import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function TodayQueue({ ctx }: { ctx: AgendaPageController }) {
  const {
    navigate,
    setViewAppt,
    queueExpanded,
    setQueueExpanded,
    getAppointmentStartDate,
    getAppointmentDisplayName,
    getProfessionalLabel,
    todayQueue,
    updateStatusMutation,
    openProposalFromEvaluation,
  } = ctx;
  return (
    <>
    {todayQueue.length > 0 && (
      <div className="bg-card rounded-xl shadow-card p-4 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fila operacional de hoje</h3>
            <p className="text-xs text-muted-foreground">Os próximos atendimentos do dia para acompanhamento rápido.</p>
          </div>
          <BrandButton
            size="sm"
            variant="outline"
            onClick={() => setQueueExpanded((current) => !current)}
          >
            {queueExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Ocultar
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Expandir
              </>
            )}
          </BrandButton>
        </div>
        {!queueExpanded ? (
          <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3 text-sm text-muted-foreground">
            {todayQueue.length} atendimento(s) oculto(s) nesta fila.
          </div>
        ) : (
          <div className="space-y-2">
            {todayQueue.map((appointment) => (
              <div key={appointment.id} className="rounded-lg border bg-background px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{getAppointmentDisplayName(appointment)}</p>
                    <BrandBadge status={statusConfig[appointment.status]?.badge || 'default'}>
                      {statusConfig[appointment.status]?.label || appointment.status}
                    </BrandBadge>
                    {appointment.appointment_type === 'evaluation' && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        Avaliação
                      </span>
                    )}
                    {appointment.is_batch && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                        Lote
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(getAppointmentStartDate(appointment), "HH:mm", { locale: ptBR })} · {(appointment.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getProfessionalLabel(appointment.professional_id)}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <BrandButton size="sm" variant="outline" onClick={() => setViewAppt(appointment)}>
                    Ver
                  </BrandButton>
                  {appointment.status === 'scheduled' && (
                    <BrandButton
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Confirmar
                    </BrandButton>
                  )}
                  {appointment.status === 'confirmed' && (
                    <BrandButton
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'in_progress' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Iniciar
                    </BrandButton>
                  )}
                  {appointment.status === 'in_progress' && (
                    <BrandButton
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'completed' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Concluir
                    </BrandButton>
                  )}
                  {appointment.appointment_type === 'evaluation' && appointment.status === 'completed' && (
                    <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(appointment, false)}>
                      Proposta
                    </BrandButton>
                  )}
                  {(appointment.status === 'confirmed' || appointment.status === 'in_progress' || appointment.status === 'scheduled') && (
                    <BrandButton size="sm" onClick={() => navigate(`/clinic/sessions?appointmentId=${appointment.id}`)}>
                      <ClipboardList className="w-4 h-4" />
                      Sessão
                    </BrandButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </>
  );
}
