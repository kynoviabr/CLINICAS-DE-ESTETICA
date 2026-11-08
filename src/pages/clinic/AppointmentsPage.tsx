import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, CalendarCheck2, Clock3, CheckCircle2, CalendarCog, Lock, BellRing, CalendarDays, CalendarRange } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
import { useClinicPlan } from '@/hooks/useClinicPlan';
import { isLeanPlan } from '@/lib/plans';
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
    filterProfessionals,
    setFilterProfessionals,
    filterStatus,
    setFilterStatus,
    quickPatientOpen,
    setQuickPatientOpen,
    setAvailabilityDialogOpen,
    setBlocksDialogOpen,
    setWaitlistDialogOpen,
    isProfessional,
    myProfessionalId,
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
    setCurrentDate,
    searchParams,
  } = ctx;
  const { modules } = useClinicPlan();
  // Essencial: agenda simples, sem lista de espera nem disparos manuais de WhatsApp.
  const lean = isLeanPlan(modules);

  // Essencial abre direto no dia de hoje (se a URL não pediu outra visão).
  const openedOnDay = useRef(false);
  useEffect(() => {
    if (!lean || openedOnDay.current) return;
    openedOnDay.current = true;
    if (!searchParams.get('visao')) setViewMode('day');
  }, [lean, searchParams, setViewMode]);

  const goToday = () => {
    setCurrentDate(new Date());
    setViewMode('day');
  };

  const goThisWeek = () => {
    setCurrentDate(new Date());
    setViewMode('week');
  };

  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <div className="flex flex-wrap gap-2">
          <BrandButton variant="outline" onClick={goToday}>
            <CalendarDays className="w-4 h-4" /> Hoje
          </BrandButton>
          <BrandButton variant="outline" onClick={goThisWeek}>
            <CalendarRange className="w-4 h-4" /> Semana
          </BrandButton>
          <BrandButton variant="outline" onClick={() => setAvailabilityDialogOpen(true)}>
            <CalendarCog className="w-4 h-4" /> Disponibilidade
          </BrandButton>
          <BrandButton variant="outline" onClick={() => setBlocksDialogOpen(true)}>
            <Lock className="w-4 h-4" /> Bloqueios
          </BrandButton>
          {!lean && (
          <>
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
          )}
          <BrandButton onClick={() => {
            resetForm();
            setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
            if (isProfessional && myProfessionalId) {
              setSelectedProfessional(myProfessionalId);
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

      {!lean && (
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
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate_(-1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[200px] text-center">{headerLabel}</h2>
          <button onClick={() => navigate_(1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3">
          {/* Várias profissionais: na visão Dia, cada uma vira uma coluna. */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex h-10 w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
                <span className="truncate">
                  {filterProfessionals.length === 0
                    ? 'Todas as profissionais'
                    : filterProfessionals.length === 1
                      ? (filterProfessional === 'unassigned' ? 'Não atribuído' : professionals.find((p) => p.id === filterProfessional)?.label || '1 profissional')
                      : `${filterProfessionals.length} selecionadas`}
                </span>
                <ChevronRight className="h-4 w-4 rotate-90 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <button
                type="button"
                className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${filterProfessionals.length === 0 ? 'font-semibold' : ''}`}
                onClick={() => setFilterProfessionals([])}
              >
                Todas as profissionais
              </button>
              {[...professionals.map((p) => ({ id: p.id, label: p.label })), { id: 'unassigned', label: 'Não atribuído' }].map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox
                    checked={filterProfessionals.includes(option.id)}
                    onCheckedChange={(checked) => setFilterProfessionals((current) => (checked
                      ? [...current.filter((id) => id !== option.id), option.id]
                      : current.filter((id) => id !== option.id)))}
                  />
                  {option.label}
                </label>
              ))}
              <p className="px-2 pt-1 text-[11px] text-muted-foreground">Escolha 2 ou mais para ver as agendas lado a lado no dia.</p>
            </PopoverContent>
          </Popover>
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
          {!lean && (
            <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              {waitlistEntries.length} em lista de espera
            </span>
          )}
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
        onCreated={(patient) => {
          ctx.setAppointmentType('session');
          ctx.setSelectedLead('');
          setSelectedPatient(patient.id);
        }}
      />
    </div>
  );
}
