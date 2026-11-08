import { useState, useEffect } from 'react';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X, AlertTriangle, ClipboardList, CalendarCheck2, Pencil, MessageCircle, FileText } from 'lucide-react';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { statusConfig, formatDurationMinutes } from '@/lib/agenda/model';
import { useBranding } from '@/contexts/BrandingContext';
import { useToast } from '@/hooks/use-toast';
import { whatsappLink } from '@/lib/proposals/sale';
import { supabase } from '@/integrations/supabase/client';
import { anamneseLinkMessage, anamneseLinkUrl } from '@/lib/anamnese/link';
import type { AgendaPageController } from './useAgendaPage';

export function AppointmentDetailsDialog({ ctx }: { ctx: AgendaPageController }) {
  const { clinicName } = useBranding();
  const { toast } = useToast();
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [anamneseLoading, setAnamneseLoading] = useState(false);

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
    updateAppointmentNoteMutation,
    openProposalFromEvaluation,
  } = ctx;

  useEffect(() => {
    if (viewAppt) {
      setNoteDraft(viewAppt.notes || '');
      setIsEditingNote(false);
    }
  }, [viewAppt]);

  const handleSendReminder = () => {
    if (!viewAppt) return;
    const patientData = getSelectedPatientData(viewAppt.patient_id);
    const recipientName = getAppointmentDisplayName(viewAppt);
    const phone =
      (viewAppt.leads as { phone?: string | null } | null)?.phone ||
      (patientData as { phone?: string | null } | undefined)?.phone ||
      (viewAppt.patients as { phone?: string | null } | null)?.phone;

    if (!phone) {
      toast({
        title: 'Telefone não encontrado',
        description: 'Este paciente não possui telefone cadastrado para envio do lembrete via WhatsApp.',
        variant: 'destructive',
      });
      return;
    }

    const clinicLabel = clinicName || 'nossa clínica';
    const recipientFirstName = recipientName.split(' ')[0] || recipientName;
    const dateLabel = format(getAppointmentStartDate(viewAppt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const treatmentLabel =
      (viewAppt.treatments as { name?: string | null } | null)?.name ||
      (viewAppt.appointment_type === 'evaluation' ? 'Avaliação' : 'Atendimento');
    const professionalLabel = getProfessionalLabel(viewAppt.professional_id);

    const reminderText = `Olá, ${recipientFirstName}! Esperamos que você esteja bem.\n\nPassando para lembrar do seu atendimento na *${clinicLabel}*:\n\n✨ *Procedimento:* ${treatmentLabel}\n📅 *Data:* ${dateLabel}\n👩‍⚕️ *Especialista:* ${professionalLabel}\n\nPor gentileza, poderia nos confirmar sua presença?\n👉 Responda *1* (ou *SIM*) para Confirmar\n👉 Responda *2* caso precise Reagendar ou Cancelar\n\nQualquer dúvida, estamos à sua disposição!`;

    const url = whatsappLink(phone, reminderText);
    window.open(url, '_blank', 'noopener,noreferrer');
    toast({
      title: 'WhatsApp aberto!',
      description: `Lembrete padrão preparado para envio para ${recipientFirstName}.`,
    });
  };

  const handleSendAnamnese = async () => {
    if (!viewAppt) return;
    if (!viewAppt.patient_id) {
      toast({
        title: 'Paciente não vinculado',
        description: 'Para enviar a ficha de anamnese por link, o agendamento precisa estar vinculado a um paciente cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    const patientData = getSelectedPatientData(viewAppt.patient_id);
    const recipientName = getAppointmentDisplayName(viewAppt);
    const phone =
      (viewAppt.leads as { phone?: string | null } | null)?.phone ||
      (patientData as { phone?: string | null } | undefined)?.phone ||
      (viewAppt.patients as { phone?: string | null } | null)?.phone;

    if (!phone) {
      toast({
        title: 'Telefone não encontrado',
        description: 'Este paciente não possui telefone cadastrado para envio da anamnese via WhatsApp.',
        variant: 'destructive',
      });
      return;
    }

    setAnamneseLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_anamnese_link', { p_patient_id: viewAppt.patient_id });
      if (error) throw error;

      const r = data as { token: string; expires_at: string };
      const url = anamneseLinkUrl(window.location.origin, r.token);
      const treatmentName = (viewAppt.treatments as { name?: string | null } | null)?.name;
      const clinicLabel = clinicName || 'nossa clínica';
      const first = recipientName.trim().split(/\s+/)[0] || recipientName;

      const message = treatmentName
        ? `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicLabel}. Para agilizar seu atendimento de *${treatmentName}*, preencha sua ficha de anamnese pelo link seguro abaixo (leva cerca de 5 minutos):\n\n${url}\n\nO link é pessoal, pede sua data de nascimento para confirmar e vale por 7 dias.`
        : anamneseLinkMessage(recipientName, clinicLabel, url);

      window.open(whatsappLink(phone, message), '_blank', 'noopener,noreferrer');
      toast({
        title: 'WhatsApp aberto com Anamnese!',
        description: `Link seguro de anamnese gerado e preparado para ${first}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar link de anamnese.';
      toast({ title: 'Erro ao gerar anamnese', description: msg, variant: 'destructive' });
    } finally {
      setAnamneseLoading(false);
    }
  };

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
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">
                    {format(getAppointmentStartDate(viewAppt), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(getAppointmentEndDate(viewAppt), 'HH:mm')}
                    {(() => {
                      const durMin = Math.round((getAppointmentEndDate(viewAppt).getTime() - getAppointmentStartDate(viewAppt).getTime()) / 60000);
                      const durLabel = formatDurationMinutes(durMin);
                      return durLabel ? <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary font-normal">{durLabel}</span> : null;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Status:</span><BrandBadge status={statusConfig[viewAppt.status]?.badge || 'default'}>{statusConfig[viewAppt.status]?.label || viewAppt.status}</BrandBadge></div>
              </div>

              {/* Seção de Notas */}
              <div className="space-y-2.5 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Notas e Observações
                  </span>
                  {isEditingNote ? (
                    <div className="flex gap-1.5">
                      <BrandButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setNoteDraft(viewAppt.notes || '');
                          setIsEditingNote(false);
                        }}
                      >
                        Cancelar
                      </BrandButton>
                      <BrandButton
                        type="button"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        disabled={updateAppointmentNoteMutation.isPending}
                        onClick={() => {
                          updateAppointmentNoteMutation.mutate({
                            appointmentId: viewAppt.id,
                            notes: noteDraft,
                          });
                          setIsEditingNote(false);
                        }}
                      >
                        {updateAppointmentNoteMutation.isPending ? 'Salvando...' : 'Salvar nota'}
                      </BrandButton>
                    </div>
                  ) : (
                    <BrandButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary hover:text-primary/90 flex items-center gap-1"
                      onClick={() => {
                        setNoteDraft(viewAppt.notes || '');
                        setIsEditingNote(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                      {viewAppt.notes ? 'Editar nota' : 'Adicionar nota'}
                    </BrandButton>
                  )}
                </div>

                {isEditingNote ? (
                  <div className="space-y-2">
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Escreva uma nota para este agendamento..."
                      rows={3}
                      className="text-sm"
                      autoFocus
                    />
                    <p className="text-[11px] text-muted-foreground">
                      A nota ficará visível diretamente no card da agenda.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {viewAppt.notes ? (
                      <div className="rounded-lg border border-blue-200/80 bg-blue-50/80 p-3 text-xs dark:border-blue-800/40 dark:bg-blue-950/30">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">Nota do Agendamento:</span>
                        <p className="mt-1 whitespace-pre-wrap break-words text-foreground font-normal leading-relaxed">
                          {viewAppt.notes}
                        </p>
                      </div>
                    ) : null}

                    {(viewAppt.patients as { notes?: string | null } | null)?.notes && (
                      <div className="rounded-lg border border-muted bg-muted/30 p-2.5 text-xs">
                        <span className="font-semibold text-muted-foreground">Nota do Cadastro do Paciente:</span>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90 font-normal leading-relaxed">
                          {(viewAppt.patients as { notes?: string | null } | null)?.notes}
                        </p>
                      </div>
                    )}

                    {(viewAppt.leads as { notes?: string | null } | null)?.notes && (
                      <div className="rounded-lg border border-muted bg-muted/30 p-2.5 text-xs">
                        <span className="font-semibold text-muted-foreground">Nota do Lead:</span>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90 font-normal leading-relaxed">
                          {(viewAppt.leads as { notes?: string | null } | null)?.notes}
                        </p>
                      </div>
                    )}

                    {!viewAppt.notes && !(viewAppt.patients as { notes?: string | null } | null)?.notes && !(viewAppt.leads as { notes?: string | null } | null)?.notes && (
                      <p className="text-xs text-muted-foreground italic py-1">Nenhuma nota registrada para este agendamento.</p>
                    )}
                  </div>
                )}
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
                          <SelectItem key={professional.id} value={professional.id}>
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
                {canAdjustAppointment && (
                  <>
                    <BrandButton
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-medium"
                      onClick={handleSendReminder}
                    >
                      <MessageCircle className="w-4 h-4 mr-1 text-emerald-600 dark:text-emerald-400" />
                      Enviar Lembrete
                    </BrandButton>

                    <BrandButton
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-primary/50 text-primary hover:bg-primary/5 font-medium"
                      onClick={handleSendAnamnese}
                      disabled={anamneseLoading || !viewAppt.patient_id}
                      title={!viewAppt.patient_id ? 'Vincule a um paciente para enviar a anamnese' : undefined}
                    >
                      <FileText className="w-4 h-4 mr-1 text-primary" />
                      {anamneseLoading ? 'Gerando link...' : 'Enviar Anamnese'}
                    </BrandButton>
                  </>
                )}
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
