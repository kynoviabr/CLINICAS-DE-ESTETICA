import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { waitlistPriorityLabel, waitlistStatusLabel, type WaitlistWindowType, type WaitlistPriority, type WaitlistContactPreference, type WaitlistTargetType } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function WaitlistDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    waitlistDialogOpen,
    setWaitlistDialogOpen,
    waitlistTargetType,
    setWaitlistTargetType,
    waitlistLeadId,
    setWaitlistLeadId,
    waitlistPatientId,
    setWaitlistPatientId,
    waitlistProfessionalId,
    setWaitlistProfessionalId,
    waitlistTreatmentId,
    setWaitlistTreatmentId,
    waitlistWindowType,
    setWaitlistWindowType,
    waitlistWindowStart,
    setWaitlistWindowStart,
    waitlistWindowEnd,
    setWaitlistWindowEnd,
    waitlistPreferredPeriod,
    setWaitlistPreferredPeriod,
    waitlistDuration,
    setWaitlistDuration,
    waitlistPriority,
    setWaitlistPriority,
    waitlistContactPreference,
    setWaitlistContactPreference,
    waitlistContactPhone,
    setWaitlistContactPhone,
    waitlistNotes,
    setWaitlistNotes,
    waitlistSchemaAvailable,
    patients,
    leads,
    treatments,
    professionals,
    waitlistEntries,
    waitlistNotifications,
    getProfessionalLabel,
    runWaitlistMutation,
    createAppointmentFromNotificationMutation,
    createWaitlistMutation,
    resetWaitlistForm,
  } = ctx;
  return (
    <Dialog open={waitlistDialogOpen} onOpenChange={setWaitlistDialogOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lista de Espera Inteligente</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-4">
          {!waitlistSchemaAvailable && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">Schema da lista de espera não está aplicado nesta base</p>
              <p className="text-xs text-muted-foreground mt-1">
                Rode a migration `20260515231500_agenda_avancada_waitlist.sql` no Supabase e recarregue a tela.
              </p>
            </div>
          )}
          <div className="rounded-xl border border-dashed p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Monitorar vagas agora</p>
              <p className="text-xs text-muted-foreground">Roda o agente e procura encaixes usando disponibilidade, bloqueios e conflitos.</p>
            </div>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => runWaitlistMutation.mutate()}
              disabled={runWaitlistMutation.isPending || !waitlistSchemaAvailable}
            >
              {runWaitlistMutation.isPending ? 'Processando...' : 'Buscar vagas'}
            </BrandButton>
          </div>
    
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createWaitlistMutation.mutate();
            }}
            className="rounded-2xl border p-4 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de cadastro</Label>
                <Select value={waitlistTargetType} onValueChange={(value) => setWaitlistTargetType(value as WaitlistTargetType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="patient">Paciente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {waitlistTargetType === 'lead' ? (
                <div className="space-y-2">
                  <Label>Lead *</Label>
                  <Select value={waitlistLeadId} onValueChange={setWaitlistLeadId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar lead" /></SelectTrigger>
                    <SelectContent>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>{lead.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Paciente *</Label>
                  <Select value={waitlistPatientId} onValueChange={setWaitlistPatientId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>{patient.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
    
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Profissional preferido</Label>
                <Select value={waitlistProfessionalId} onValueChange={setWaitlistProfessionalId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Qualquer profissional</SelectItem>
                    {professionals.map((professional) => (
                      <SelectItem key={professional.user_id} value={professional.user_id}>{professional.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tratamento</Label>
                <Select value={waitlistTreatmentId} onValueChange={setWaitlistTreatmentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Qualquer tratamento</SelectItem>
                    {treatments.map((treatment) => (
                      <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Período preferido</Label>
                <Select value={waitlistPreferredPeriod} onValueChange={(value) => setWaitlistPreferredPeriod(value as 'morning' | 'afternoon' | 'evening' | 'all')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer horário</SelectItem>
                    <SelectItem value="morning">Manhã</SelectItem>
                    <SelectItem value="afternoon">Tarde</SelectItem>
                    <SelectItem value="evening">Noite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
    
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Janela</Label>
                <Select value={waitlistWindowType} onValueChange={(value) => setWaitlistWindowType(value as WaitlistWindowType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">Esta semana</SelectItem>
                    <SelectItem value="next_week">Próxima semana</SelectItem>
                    <SelectItem value="this_month">Este mês</SelectItem>
                    <SelectItem value="custom">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="date" value={waitlistWindowStart} onChange={(event) => setWaitlistWindowStart(event.target.value)} disabled={waitlistWindowType !== 'custom'} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="date" value={waitlistWindowEnd} onChange={(event) => setWaitlistWindowEnd(event.target.value)} disabled={waitlistWindowType !== 'custom'} />
              </div>
              <div className="space-y-2">
                <Label>Duração mínima (min)</Label>
                <Input type="number" min={15} step={5} value={waitlistDuration} onChange={(event) => setWaitlistDuration(event.target.value)} />
              </div>
            </div>
    
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={waitlistPriority} onValueChange={(value) => setWaitlistPriority(value as WaitlistPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Canal de contato</Label>
                <Select value={waitlistContactPreference} onValueChange={(value) => setWaitlistContactPreference(value as WaitlistContactPreference)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="phone">Ligação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefone de contato</Label>
                <Input value={waitlistContactPhone} onChange={(event) => setWaitlistContactPhone(event.target.value)} placeholder="Opcional" />
              </div>
            </div>
    
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={waitlistNotes} onChange={(event) => setWaitlistNotes(event.target.value)} placeholder="Preferências extras do paciente/lead" />
            </div>
    
            <div className="flex justify-end gap-2">
              <BrandButton type="button" variant="outline" onClick={resetWaitlistForm}>Limpar</BrandButton>
              <BrandButton type="submit" disabled={createWaitlistMutation.isPending || !waitlistSchemaAvailable}>
                {createWaitlistMutation.isPending ? 'Salvando...' : 'Adicionar à lista'}
              </BrandButton>
            </div>
          </form>
    
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Entradas ativas da lista de espera</h3>
            {waitlistEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma entrada ativa na lista de espera.
              </div>
            ) : (
              <div className="space-y-2">
                {waitlistEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {entry.patients?.full_name || entry.leads?.full_name || 'Cadastro sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Janela: {format(new Date(`${entry.window_start}T00:00:00`), 'dd/MM/yyyy')} - {format(new Date(`${entry.window_end}T00:00:00`), 'dd/MM/yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.treatments?.name || 'Qualquer tratamento'} · {entry.min_duration_minutes} min · {getProfessionalLabel(entry.preferred_professional_id)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <BrandBadge status={entry.priority === 'urgent' ? 'overdue' : entry.priority === 'high' ? 'pending' : 'default'}>
                        {waitlistPriorityLabel(entry.priority)}
                      </BrandBadge>
                      <BrandBadge status="scheduled">{waitlistStatusLabel(entry.status)}</BrandBadge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
    
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Vagas encontradas (pendentes de ação)</h3>
            {waitlistNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma vaga encontrada pendente.
              </div>
            ) : (
              <div className="space-y-2">
                {waitlistNotifications.map((notification) => (
                  <div key={notification.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {notification.appointment_waitlist?.patient_id ? 'Paciente' : 'Lead'} · {notification.appointment_waitlist?.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(notification.matched_slot_start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - {format(new Date(notification.matched_slot_end), "HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getProfessionalLabel(notification.matched_professional_id)}
                      </p>
                    </div>
                    <BrandButton
                      size="sm"
                      onClick={() => createAppointmentFromNotificationMutation.mutate(notification)}
                      disabled={createAppointmentFromNotificationMutation.isPending}
                    >
                      Agendar esta vaga
                    </BrandButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
