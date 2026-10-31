import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X, AlertTriangle, ClipboardList, CalendarCheck2 } from 'lucide-react';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function AppointmentDetailsDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    navigate,
    viewAppt,
    setViewAppt,
    reassignProfessional,
    setReassignProfessional,
    proposalLoadingId,
    isProfessional,
    professionals,
    getSelectedPatientData,
    getAppointmentStartDate,
    getAppointmentEndDate,
    getAppointmentDisplayName,
    getProfessionalLabel,
    openExceptionModal,
    updateStatusMutation,
    reassignProfessionalMutation,
    openProposalFromEvaluation,
  } = ctx;
  return (
    <Dialog open={!!viewAppt} onOpenChange={() => setViewAppt(null)}>
      <DialogContent className="max-w-md">
        {viewAppt && (
          <>
            <DialogHeader>
              <DialogTitle>Agendamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {(() => {
                const p = getSelectedPatientData(viewAppt.patient_id);
                return p ? <AnamneseAlertBanner status={p?.current_anamnese_status} expiresAt={p?.current_anamnese_expires_at} patientId={viewAppt.patient_id} patientName={(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.full_name} showActions={false} /> : null;
              })()}
              {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_flag && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive bg-destructive/5">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Paciente insatisfeito — {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_level || 'N/A'}</p>
                    {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason && <p className="text-xs text-muted-foreground">{(viewAppt.patients as { dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason}</p>}
                  </div>
                </div>
              )}
              <div className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Paciente:</span><span className="font-medium">{getAppointmentDisplayName(viewAppt)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{viewAppt.appointment_type === 'evaluation' ? 'Avaliação' : 'Sessão'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Profissional:</span><span className="font-medium">{getProfessionalLabel(viewAppt.professional_id)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tratamento:</span><span className="font-medium">{(viewAppt.treatments as { name?: string | null } | null)?.name || '—'}</span></div>
                {(viewAppt.leads as { phone?: string | null } | null)?.phone && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Contato do lead:</span><span className="font-medium">{(viewAppt.leads as { phone?: string | null } | null)?.phone}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Horário:</span><span className="font-medium">{format(getAppointmentStartDate(viewAppt), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(getAppointmentEndDate(viewAppt), 'HH:mm')}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Status:</span><BrandBadge status={statusConfig[viewAppt.status]?.badge || 'default'}>{statusConfig[viewAppt.status]?.label || viewAppt.status}</BrandBadge></div>
                {viewAppt.notes && <div><span className="text-muted-foreground">Notas:</span><p className="mt-1">{viewAppt.notes}</p></div>}
              </div>
    
              {!isProfessional && (
                <div className="space-y-2 pt-3 border-t">
                  <Label>Reatribuir profissional</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={reassignProfessional} onValueChange={setReassignProfessional}>
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder="Selecionar profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Sem profissional</SelectItem>
                        {professionals.map((professional) => (
                          <SelectItem key={professional.user_id} value={professional.user_id}>
                            {professional.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <BrandButton
                      type="button"
                      variant="outline"
                      disabled={reassignProfessionalMutation.isPending || ['completed', 'cancelled', 'no_show'].includes(viewAppt.status)}
                      onClick={() => reassignProfessionalMutation.mutate()}
                    >
                      {reassignProfessionalMutation.isPending ? 'Salvando...' : 'Salvar responsável'}
                    </BrandButton>
                  </div>
                  {['completed', 'cancelled', 'no_show'].includes(viewAppt.status) && (
                    <p className="text-xs text-muted-foreground">Este status não permite reatribuição de profissional.</p>
                  )}
                </div>
              )}
    
              <div className="space-y-3 pt-4 border-t">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ações do agendamento
                </div>
                {(() => {
                  const canAdjustAppointment = !['completed', 'cancelled', 'no_show'].includes(viewAppt.status);
                  return (
                <div className="flex flex-wrap gap-2">
                {viewAppt.status === 'scheduled' && (
                  <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'confirmed' })}>
                    <Check className="w-4 h-4" /> Confirmar
                  </BrandButton>
                )}
                {viewAppt.status === 'confirmed' && (
                  <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'in_progress' })}>
                    <Check className="w-4 h-4" /> Iniciar atendimento
                  </BrandButton>
                )}
                {viewAppt.status === 'in_progress' && (
                  <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'completed' })}>
                    <Check className="w-4 h-4" /> Concluir atendimento
                  </BrandButton>
                )}
                {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'in_progress' && (
                  <BrandButton size="sm" onClick={() => openProposalFromEvaluation(viewAppt, true)} disabled={proposalLoadingId === viewAppt.id}>
                    <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Finalizar e abrir proposta'}
                  </BrandButton>
                )}
                {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'completed' && (
                  <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(viewAppt, false)} disabled={proposalLoadingId === viewAppt.id}>
                    <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Abrir proposta'}
                  </BrandButton>
                )}
                {canAdjustAppointment && (
                  <>
                    <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('reschedule', viewAppt)}>
                      Remarcar agendamento
                    </BrandButton>
                    <BrandButton size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => openExceptionModal('cancel', viewAppt)}>
                      <X className="w-4 h-4" /> Cancelar agendamento
                    </BrandButton>
                    <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('no_show', viewAppt)}>
                      <AlertTriangle className="w-4 h-4" /> Registrar não comparecimento
                    </BrandButton>
                  </>
                )}
                {(viewAppt.status === 'confirmed' || viewAppt.status === 'scheduled' || viewAppt.status === 'in_progress') && (
                  <BrandButton size="sm" variant="outline" onClick={() => {
                    setViewAppt(null);
                    navigate(`/clinic/sessions?appointmentId=${viewAppt.id}`);
                  }}>
                    <ClipboardList className="w-4 h-4" /> Ir para Sessão
                  </BrandButton>
                )}
                </div>
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
