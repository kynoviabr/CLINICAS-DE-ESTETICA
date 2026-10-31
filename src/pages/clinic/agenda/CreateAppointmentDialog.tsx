import { BrandButton } from '@/components/ui/brand-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, UserPlus } from 'lucide-react';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import type { AgendaPageController } from './useAgendaPage';

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
  } = ctx;
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo Agendamento</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
          {createFormError && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{createFormError}</AlertDescription>
            </Alert>
          )}
          {appointmentType === 'session' ? (
            <>
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={selectedPatient} onValueChange={(value) => {
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
            <Select value={appointmentType} onValueChange={value => setAppointmentType(value as 'session' | 'evaluation')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="session">Sessão de paciente</SelectItem>
                <SelectItem value="evaluation">Avaliação de lead</SelectItem>
              </SelectContent>
            </Select>
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
                {professionals.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {appointmentType === 'evaluation' && !selectedProfessional && (
              <p className="text-xs text-amber-700">Escolha quem fará a avaliação para ela aparecer na agenda correta.</p>
            )}
          </div>
    
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Horário *</Label>
              <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
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
              disabled={createMutation.isPending || (appointmentType === 'session' ? (!selectedPatient || !selectedTreatment || !hasSessionBalance) : !selectedLead) || !selectedProfessional}
            >
              {createMutation.isPending ? 'Criando...' : appointmentType === 'evaluation' ? 'Agendar avaliação' : 'Agendar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
