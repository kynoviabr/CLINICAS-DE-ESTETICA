import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, CalendarCheck2, Clock3, CheckCircle2, CalendarCog, Lock, BellRing } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { format } from 'date-fns';
import { type ViewMode } from '@/lib/agenda/model';
import { useAgendaPage } from './agenda/useAgendaPage';
import { TodayQueue } from './agenda/TodayQueue';
import { MonthView } from './agenda/MonthView';
import { WeekView } from './agenda/WeekView';
import { DayView } from './agenda/DayView';
import { CreateAppointmentDialog } from './agenda/CreateAppointmentDialog';
import { AppointmentDetailsDialog } from './agenda/AppointmentDetailsDialog';
import { ScheduleExceptionDialog } from './agenda/ScheduleExceptionDialog';
import { AvailabilityDialog } from './agenda/AvailabilityDialog';
import { BlocksDialog } from './agenda/BlocksDialog';
import { WaitlistDialog } from './agenda/WaitlistDialog';

export default function AppointmentsPage() {
  const ctx = useAgendaPage();
  const {
    user,
    viewMode,
    setViewMode,
    setDialogOpen,
    setSelectedDate,
    setSelectedPatient,
    setSelectedProfessional,
    filterProfessional,
    setFilterProfessional,
    filterStatus,
    setFilterStatus,
    quickPatientOpen,
    setQuickPatientOpen,
    setAvailabilityDialogOpen,
    setBlocksDialogOpen,
    setWaitlistDialogOpen,
    isProfessional,
    professionals,
    waitlistEntries,
    operationalSummary,
    agendaSignals,
    whatsappOpsSummary,
    sendReminderQueueMutation,
    dispatchReminderMutation,
    generateDailySummaryMutation,
    runAgendaJobsMutation,
    resetForm,
    resetWaitlistForm,
    navigate_,
    headerLabel,
  } = ctx;
  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <div className="flex flex-wrap gap-2">
          <>
            <BrandButton variant="outline" onClick={() => setAvailabilityDialogOpen(true)}>
              <CalendarCog className="w-4 h-4" /> Disponibilidade
            </BrandButton>
            <BrandButton variant="outline" onClick={() => setBlocksDialogOpen(true)}>
              <Lock className="w-4 h-4" /> Bloqueios
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => {
                resetWaitlistForm();
                setWaitlistDialogOpen(true);
              }}
            >
              <BellRing className="w-4 h-4" /> Lista de Espera
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => sendReminderQueueMutation.mutate()}
              disabled={sendReminderQueueMutation.isPending}
            >
              {sendReminderQueueMutation.isPending ? 'Processando...' : 'Fila Lembretes WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => dispatchReminderMutation.mutate()}
              disabled={dispatchReminderMutation.isPending}
            >
              {dispatchReminderMutation.isPending ? 'Enviando...' : 'Disparar Lembretes WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => generateDailySummaryMutation.mutate()}
              disabled={generateDailySummaryMutation.isPending}
            >
              {generateDailySummaryMutation.isPending ? 'Gerando...' : 'Resumo Diário WA'}
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => runAgendaJobsMutation.mutate('manual')}
              disabled={runAgendaJobsMutation.isPending}
            >
              {runAgendaJobsMutation.isPending ? 'Executando...' : 'Rodar Jobs Agenda'}
            </BrandButton>
          </>
          <BrandButton onClick={() => {
            resetForm();
            setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
            if (isProfessional && user?.id) {
              setSelectedProfessional(user.id);
            }
            setDialogOpen(true);
          }}>
            <Plus className="w-4 h-4" /> Novo Agendamento
          </BrandButton>
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CalendarCheck2 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.totalInView}</p>
            <p className="text-xs text-muted-foreground">Agendamentos no período</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Clock3 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.today}</p>
            <p className="text-xs text-muted-foreground">Atendimentos de hoje</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.readyForSession}</p>
            <p className="text-xs text-muted-foreground">Prontos para sessão</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.noShow}</p>
            <p className="text-xs text-muted-foreground">Não compareceu</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in border-warning/30 cursor-pointer" onClick={() => setFilterProfessional('unassigned')}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.unassigned}</p>
            <p className="text-xs text-muted-foreground">Não atribuído</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-5 mb-6">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA pendente</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.pending}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA enviado</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.sent}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">WA falhou</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.failed}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Inbound aplicado</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.inboundApplied}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Jobs concluídos</p>
            <p className="text-xl font-semibold">{whatsappOpsSummary.jobSuccess}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate_(-1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[200px] text-center">{headerLabel}</h2>
          <button onClick={() => navigate_(1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3">
          <Select value={filterProfessional} onValueChange={setFilterProfessional}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos profissionais" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Todos status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="rescheduled">Remarcado</SelectItem>
              <SelectItem value="no_show">Não compareceu</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="day">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <TodayQueue ctx={ctx} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.evaluations} avaliações
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.batches} sessões em lote
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blocks} bloqueios
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blockedDays} dias com restrição
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {waitlistEntries.length} em lista de espera
          </span>
        </div>
      </div>

      {/* Calendar */}
      <MonthView ctx={ctx} />

      <WeekView ctx={ctx} />

      <DayView ctx={ctx} />

      {/* Create dialog */}
      <CreateAppointmentDialog ctx={ctx} />

      {/* View appointment */}
      <AppointmentDetailsDialog ctx={ctx} />

      <ScheduleExceptionDialog ctx={ctx} />

      <AvailabilityDialog ctx={ctx} />

      <BlocksDialog ctx={ctx} />

      <WaitlistDialog ctx={ctx} />

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={(patient) => setSelectedPatient(patient.id)}
      />
    </div>
  );
}
