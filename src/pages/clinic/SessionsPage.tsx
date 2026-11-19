import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Filter,
  Package,
  Plus,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import { useSessionsPage } from './sessions/useSessionsPage';

type SessionForm = {
  appointment_id: string;
  patient_id: string;
  treatment_id: string;
  notes: string;
  products_used: string;
  observations: string;
};

type SessionRecordRow = Database['public']['Tables']['session_records']['Row'] & {
  patients?: { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null } | null;
  treatments?: { name?: string | null } | null;
  appointments?: { start_time?: string | null } | null;
};
type PatientRow = Pick<Database['public']['Tables']['patients']['Row'], 'id' | 'full_name' | 'current_anamnese_status' | 'current_anamnese_expires_at'>;
type AppointmentRow = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'patient_id' | 'treatment_id' | 'professional_id' | 'start_time' | 'status'> & {
  patients?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};



export default function SessionsPage() {
  const {
    dialogOpen,
    setDialogOpen,
    plannerOpen,
    setPlannerOpen,
    search,
    setSearch,
    balanceFilter,
    setBalanceFilter,
    form,
    setForm,
    plannerTarget,
    plannerStartDate,
    setPlannerStartDate,
    plannerTime,
    setPlannerTime,
    plannerIntervalDays,
    setPlannerIntervalDays,
    plannerCount,
    setPlannerCount,
    plannerProfessional,
    setPlannerProfessional,
    plannerNotes,
    setPlannerNotes,
    renewalOnly,
    sessions,
    isLoading,
    patients,
    professionals,
    renewalTasks,
    availableAppointments,
    summaryRows,
    filteredSummaryRows,
    selectedPatientId,
    selectedPatient,
    manualTreatmentOptions,
    currentFlowSummary,
    getProfessionalLabel,
    createMutation,
    plannerMutation,
    openDialog,
    registerFromSummary,
    openPlanner,
  } = useSessionsPage();

  return (
    <div>
      <PageHeader title="Sessões" description="Acompanhe saldo contratado, sessões realizadas e registro operacional">
        <BrandButton onClick={openDialog}>
          <Plus className="w-4 h-4" /> Registrar Sessão
        </BrandButton>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CalendarCheck2 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{availableAppointments.length}</p>
            <p className="text-xs text-muted-foreground">Agendamentos prontos para registrar</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Package className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{summaryRows.reduce((sum, row) => sum + row.contracted, 0)}</p>
            <p className="text-xs text-muted-foreground">Sessões contratadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{summaryRows.reduce((sum, row) => sum + row.performed, 0)}</p>
            <p className="text-xs text-muted-foreground">Sessões realizadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {summaryRows.filter((row) => row.balance > 0).reduce((sum, row) => sum + row.balance, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Saldo pendente de execução</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            'shadow-card animate-fade-in cursor-pointer',
            renewalOnly ? 'border-primary bg-primary/5' : 'border-border/60'
          )}
          onClick={() => setBalanceFilter((current) => (current === 'renewal_window' ? 'all' : 'renewal_window'))}
        >
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{renewalTasks.length}</p>
            <p className="text-xs text-muted-foreground">Renovação</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo por paciente e tratamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente ou tratamento..."
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={balanceFilter} onValueChange={setBalanceFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar resumo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with_balance">Com saldo pendente</SelectItem>
                <SelectItem value="completed">Pacotes concluídos</SelectItem>
                <SelectItem value="no_contract">Sem contrato associado</SelectItem>
                <SelectItem value="renewal_window">Janela de renovação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredSummaryRows.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhum resumo encontrado</h3>
              <p className="text-sm text-muted-foreground">
                O resumo aparece quando existem contratos ou sessões registradas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSummaryRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border bg-background p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{row.patientName}</p>
                      <BrandBadge
                        status={
                          row.balance > 0 ? 'pending' : row.contracted > 0 ? 'completed' : 'draft'
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{row.treatmentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.lastPerformedAt
                        ? `Última sessão em ${format(new Date(row.lastPerformedAt), 'dd/MM/yyyy', { locale: ptBR })}`
                        : 'Nenhuma sessão registrada ainda'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 min-w-[280px]">
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Contratadas</p>
                      <p className="text-lg font-semibold">{row.contracted}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Realizadas</p>
                      <p className="text-lg font-semibold">{row.performed}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={cn('text-lg font-semibold', row.balance > 0 ? 'text-warning' : 'text-success')}>
                        {row.balance}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {row.balance > 0 && (
                      <BrandButton variant="outline" onClick={() => openPlanner(row)}>
                        <CalendarRange className="w-4 h-4" />
                        Planejar
                      </BrandButton>
                    )}
                    <BrandButton onClick={() => registerFromSummary(row)}>
                      <Plus className="w-4 h-4" />
                      Registrar
                    </BrandButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card animate-fade-in">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico recente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-20 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && sessions.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhuma sessão registrada</h3>
              <p className="text-sm text-muted-foreground">
                Registre sessões a partir da agenda ou manualmente quando necessário.
              </p>
            </div>
          )}

          {!isLoading && sessions.length > 0 && (
            <div className="space-y-3">
              {sessions.map((session: SessionRecordRow) => (
                <Card key={session.id} className="shadow-card border-border/60">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{session.patients?.full_name}</p>
                          {session.patients?.dissatisfaction_flag && (
                            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Insatisfeito
                            </span>
                          )}
                          {session.appointment_id && <BrandBadge status={'scheduled' as BadgeStatus} />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {session.treatments?.name || 'Tratamento não informado'} · Sessão {session.session_number}/{session.total_sessions}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Realizada em {format(new Date(session.performed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          {session.appointments?.start_time ? ' via agenda' : ' em registro manual'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Observações operacionais</p>
                        <p className="text-sm text-foreground max-w-md">
                          {session.notes || session.observations || 'Sem observações registradas'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar sessão</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label>Origem do registro</Label>
              <Select
                value={form.appointment_id}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    appointment_id: value,
                    patient_id: value === 'manual' ? current.patient_id : '',
                    treatment_id: value === 'manual' ? current.treatment_id : '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar agendamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Registro manual (sem agendamento)</SelectItem>
                  {availableAppointments.map((appointment: AppointmentRow) => (
                    <SelectItem key={appointment.id} value={appointment.id}>
                      {format(new Date(appointment.start_time), 'dd/MM HH:mm', { locale: ptBR })} ·{' '}
                      {appointment.patients?.full_name} · {appointment.treatments?.name || 'Sem tratamento'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.appointment_id === 'manual' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Paciente *</Label>
                  <Select
                    value={form.patient_id}
                    onValueChange={(value) => setForm((current) => ({ ...current, patient_id: value, treatment_id: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient: PatientRow) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tratamento *</Label>
                  <Select
                    value={form.treatment_id}
                    onValueChange={(value) => setForm((current) => ({ ...current, treatment_id: value }))}
                    disabled={!form.patient_id || manualTreatmentOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!form.patient_id ? 'Selecione um paciente' : manualTreatmentOptions.length === 0 ? 'Paciente sem tratamento contratado' : 'Selecionar tratamento'} />
                    </SelectTrigger>
                    <SelectContent>
                      {manualTreatmentOptions.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedPatient && (
              <AnamneseAlertBanner
                status={selectedPatient.current_anamnese_status}
                expiresAt={selectedPatient.current_anamnese_expires_at}
                patientId={selectedPatient.id}
                patientName={selectedPatient.full_name}
              />
            )}

            {currentFlowSummary && (
              <div className="rounded-xl border bg-secondary/30 p-4">
                <p className="text-sm font-medium text-foreground mb-2">Resumo operacional do tratamento</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Contratadas</p>
                    <p className="text-lg font-semibold">{currentFlowSummary.contracted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Realizadas</p>
                    <p className="text-lg font-semibold">{currentFlowSummary.performed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Próxima sessão</p>
                    <p className="text-lg font-semibold">
                      {currentFlowSummary.performed + 1}
                      {currentFlowSummary.contracted > 0 ? ` / ${currentFlowSummary.contracted}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas do procedimento</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Produtos utilizados</Label>
              <Input
                value={form.products_used}
                onChange={(event) => setForm((current) => ({ ...current, products_used: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações / recomendações</Label>
              <Textarea
                value={form.observations}
                onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || (!selectedPatientId && !form.patient_id)}
              >
                {createMutation.isPending ? 'Salvando...' : 'Registrar sessão'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Planejar sessões</DialogTitle>
          </DialogHeader>

          {plannerTarget && (
            <div className="space-y-5 mt-4">
              <div className="rounded-xl border bg-secondary/30 p-4">
                <p className="font-semibold text-foreground">{plannerTarget.patientName}</p>
                <p className="text-sm text-muted-foreground">{plannerTarget.treatmentName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo pendente: {plannerTarget.balance} sessão{plannerTarget.balance === 1 ? '' : 'ões'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profissional *</Label>
                  <Select value={plannerProfessional} onValueChange={setPlannerProfessional}>
                    <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Selecionar</SelectItem>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.id} value={professional.id}>
                          {professional.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de sessões</Label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, plannerTarget.balance)}
                    value={plannerCount}
                    onChange={(event) => setPlannerCount(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Data inicial</Label>
                  <Input type="date" value={plannerStartDate} onChange={(event) => setPlannerStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={plannerTime} onChange={(event) => setPlannerTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo em dias</Label>
                  <Input type="number" min={1} value={plannerIntervalDays} onChange={(event) => setPlannerIntervalDays(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas para todos os agendamentos</Label>
                <Textarea
                  value={plannerNotes}
                  onChange={(event) => setPlannerNotes(event.target.value)}
                  rows={3}
                  placeholder="Ex.: pacote pós-operatório, manter mesmo horário semanal, etc."
                />
              </div>

              {plannerProfessional !== 'unassigned' && (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Sessões serão criadas para <span className="font-medium text-foreground">{getProfessionalLabel(plannerProfessional)}</span>,
                  respeitando disponibilidade semanal e bloqueios já cadastrados.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setPlannerOpen(false)}>
                  Cancelar
                </BrandButton>
                <BrandButton className="flex-1" onClick={() => plannerMutation.mutate()} disabled={plannerMutation.isPending}>
                  {plannerMutation.isPending ? 'Planejando...' : 'Criar agenda das sessões'}
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
