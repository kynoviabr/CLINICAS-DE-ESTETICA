import { BrandButton } from '@/components/ui/brand-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import { TreatmentAnamneseAlert } from '@/components/anamnese/TreatmentAnamneseAlert';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useDepositConfig } from '@/hooks/useDepositConfig';
import { defaultDepositAmount } from '@/lib/finance/deposit';
import { errorMessage } from '@/lib/errors';
import { WhatsAppSendDialog, type WhatsAppSend } from '@/components/deposits/WhatsAppSendDialog';
import { prepareDepositRequest } from '@/components/deposits/depositSend';
import type { AgendaPageController } from './useAgendaPage';
import type { AppointmentKind } from '@/lib/agenda/model';

export function CreateAppointmentDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    dialogOpen,
    setDialogOpen,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    appointmentType,
    setAppointmentType,
    selectedPatient,
    setSelectedPatient,
    selectedLead,
    setSelectedLead,
    selectedTreatment,
    setSelectedTreatment,
    selectedProfessional,
    setSelectedProfessional,
    createFormError,
    duration,
    setDuration,
    notes,
    setNotes,
    setQuickPatientOpen,
    patients,
    leads,
    treatments,
    professionals,
    getSelectedPatientData,
    getSelectedLeadData,
    sessionTreatmentOptions,
    selectedSessionTreatmentSummary,
    hasSessionBalance,
    createMutation,
    clinicId,
    toast,
  } = ctx;
  const { config: depositConfig, ready: depositReady } = useDepositConfig(clinicId);
  const [chargeDeposit, setChargeDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositSend, setDepositSend] = useState<WhatsAppSend | null>(null);

  // Ao abrir: "Cobrar sinal?" vem como a clínica configurou; o valor acompanha o tipo do agendamento.
  useEffect(() => {
    if (dialogOpen) setChargeDeposit(depositReady && depositConfig.default_on);
  }, [dialogOpen, depositReady, depositConfig.default_on]);
  useEffect(() => {
    setDepositAmount(String(defaultDepositAmount(depositConfig, appointmentType)).replace('.', ','));
  }, [appointmentType, depositConfig]);

  const submit = () => {
    const amount = Number(depositAmount.replace(/\./g, '').replace(',', '.'));
    const wantsDeposit = chargeDeposit && depositReady;
    if (wantsDeposit && !(amount > 0)) { toast({ title: 'Informe o valor do sinal', variant: 'destructive' }); return; }
    // Guarda quem é antes do formulário ser limpo.
    const person = selectedPatient ? getSelectedPatientData(selectedPatient) : getSelectedLeadData(selectedLead);
    const clientName = person?.full_name || 'Cliente';
    const phone = (person as { phone?: string | null } | undefined)?.phone || null;
    createMutation.mutate(undefined, {
      onSuccess: async (result) => {
        if (!wantsDeposit || !result?.appointment?.id) return;
        const title = `Enviar o Pix do sinal para ${clientName.split(/\s+/)[0]}`;
        setDepositSend({ title, phone, status: 'preparing', message: '' });
        try {
          const { data, error } = await supabase.rpc('deposit_create', { p_appointment_id: result.appointment.id, p_amount: amount });
          if (error) throw error;
          const dep = data as { id: string; token: string };
          const message = await prepareDepositRequest(dep.id, clientName, dep.token);
          setDepositSend({ title, phone, status: 'ready', message });
        } catch (err) {
          setDepositSend({ title, phone, status: 'error', message: '', error: `O horário foi criado, mas o sinal não: ${errorMessage(err, 'tente pelo detalhe do agendamento.')}` });
        }
      },
    });
  };
  const isPatientAppointment = appointmentType !== 'evaluation' || Boolean(selectedPatient);
  const evaluationLabel = selectedPatient ? 'Avaliação do paciente' : 'Avaliação de lead';
  return (
    <>
    <WhatsAppSendDialog send={depositSend} onClose={() => setDepositSend(null)} />
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo Agendamento</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4 mt-4">
          {createFormError && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{createFormError}</AlertDescription>
            </Alert>
          )}
          {isPatientAppointment ? (
            <>
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={selectedPatient} onValueChange={(value) => {
                      if (!value) return;
                      setSelectedPatient(value);
                      setSelectedTreatment('');
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                      <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <BrandButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickPatientOpen(true)}
                    title="Cadastrar novo paciente"
                  >
                    <UserPlus className="w-4 h-4" />
                  </BrandButton>
                </div>
              </div>
              {selectedPatient && (() => {
                const p = getSelectedPatientData(selectedPatient);
                return p ? <AnamneseAlertBanner status={p.current_anamnese_status} expiresAt={p.current_anamnese_expires_at} patientId={p.id} patientName={p.full_name} /> : null;
              })()}
            </>
          ) : (
            <div className="space-y-2">
              <Label>Lead *</Label>
              <Select value={selectedLead} onValueChange={setSelectedLead}>
                <SelectTrigger><SelectValue placeholder="Selecionar lead para avaliação" /></SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLead && getSelectedLeadData(selectedLead)?.phone && (
                <p className="text-xs text-muted-foreground">
                  Contato: {getSelectedLeadData(selectedLead)?.phone}
                </p>
              )}
            </div>
          )}
    
          <div className="space-y-2">
            <Label>Tipo de agendamento</Label>
            <Select value={appointmentType} onValueChange={value => setAppointmentType(value as AppointmentKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="session">Sessão contratada</SelectItem>
                <SelectItem value="single">Sessão avulsa</SelectItem>
                <SelectItem value="evaluation">{evaluationLabel}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {appointmentType === 'session'
                ? 'Usa uma sessão de um tratamento que a paciente já contratou.'
                : appointmentType === 'single'
                  ? 'Atendimento pontual, fora de contrato: escolha qualquer tratamento ativo. Fica como valor a receber.'
                  : 'Primeira conversa com quem ainda não fechou tratamento.'}
            </p>
          </div>
    
          <div className="space-y-2">
            <Label>{appointmentType === 'evaluation' ? 'Tratamento de interesse' : 'Tratamento'}</Label>
              <Select value={selectedTreatment} onValueChange={v => {
              setSelectedTreatment(v);
              const source = appointmentType === 'session' ? sessionTreatmentOptions : treatments.map((t) => ({ id: t.id, name: t.name, duration: Number(t.duration_minutes || 60) }));
              const t = source.find((tr) => tr.id === v);
              if (t) setDuration(String(t.duration));
            }} disabled={appointmentType === 'session' && (!selectedPatient || sessionTreatmentOptions.length === 0)}>
              <SelectTrigger><SelectValue placeholder={appointmentType === 'session' && !selectedPatient ? 'Selecione um paciente' : appointmentType === 'session' && sessionTreatmentOptions.length === 0 ? 'Paciente sem tratamento contratado' : 'Selecionar tratamento'} /></SelectTrigger>
              <SelectContent>
                {(appointmentType === 'session' ? sessionTreatmentOptions : treatments.map((t) => ({ id: t.id, name: t.name, duration_minutes: t.duration_minutes }))).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {appointmentType === 'session' && selectedSessionTreatmentSummary && (
              <div className="rounded-xl border bg-secondary/30 p-4 mt-2">
                <p className="text-sm font-medium text-foreground mb-2">Resumo operacional do tratamento</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Contratadas</p>
                    <p className="text-lg font-semibold">{selectedSessionTreatmentSummary.contracted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Realizadas</p>
                    <p className="text-lg font-semibold">{selectedSessionTreatmentSummary.performed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p className={`text-lg font-semibold ${selectedSessionTreatmentSummary.balance > 0 ? 'text-warning' : 'text-success'}`}>
                      {selectedSessionTreatmentSummary.balance}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {selectedPatient && selectedTreatment && (
              <TreatmentAnamneseAlert patientId={selectedPatient} treatmentId={selectedTreatment} />
            )}
            {appointmentType === 'session' && selectedPatient && sessionTreatmentOptions.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Sem tratamento contratado.{' '}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAppointmentType('single')}>
                  Agendar como sessão avulsa
                </button>
              </p>
            )}
            {appointmentType === 'session' && selectedTreatment && selectedSessionTreatmentSummary?.balance === 0 && (
              <p className="text-xs text-destructive mt-1">
                Este tratamento está finalizado (saldo 0). Escolha outro tratamento com saldo para agendar.
              </p>
            )}
          </div>
    
          <div className="space-y-2">
            <Label>Profissional</Label>
            <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
              <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
              <SelectContent>
                {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {appointmentType === 'evaluation' && !selectedProfessional && (
              <p className="text-xs text-amber-700">Escolha quem fará a avaliação para ela aparecer na agenda correta.</p>
            )}
          </div>
    
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-2 min-w-0">
              <Label>Data *</Label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required />
            </div>
            <div className="space-y-2 min-w-0">
              <Label>Horário *</Label>
              <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} required />
            </div>
            <div className="space-y-2 min-w-0 col-span-2 sm:col-span-1">
              <Label>Duração (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="font-medium">Cobrar sinal?</Label>
              <div role="group" aria-label="Cobrar sinal" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                {([['Sim', true], ['Não', false]] as const).map(([label, value]) => (
                  <button key={label} type="button" aria-pressed={chargeDeposit === value} disabled={!depositReady && value}
                    onClick={() => setChargeDeposit(value)}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:opacity-50 ${chargeDeposit === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {!depositReady ? (
              <p className="text-xs text-muted-foreground">
                Para cobrar sinal pelo Pix, cadastre a chave em{' '}
                <Link to="/clinic/settings?aba=pagamentos" className="font-medium text-primary underline-offset-2 hover:underline">Configurações › Pagamentos</Link>.
              </p>
            ) : chargeDeposit ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="new-dep-amount" className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input id="new-dep-amount" inputMode="decimal" className="h-9 w-28" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Abatido do tratamento. O horário fica aguardando o sinal.</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Dá para cobrar depois, pelo detalhe do agendamento.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
            <BrandButton
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || (appointmentType === 'session'
                ? (!selectedPatient || !selectedTreatment || !hasSessionBalance)
                : appointmentType === 'single'
                  ? (!selectedPatient || !selectedTreatment)
                  : (!selectedPatient && !selectedLead)) || !selectedProfessional}
            >
              {createMutation.isPending ? 'Criando...' : appointmentType === 'evaluation'
                ? (selectedPatient ? 'Agendar avaliação do paciente' : 'Agendar avaliação')
                : 'Agendar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
