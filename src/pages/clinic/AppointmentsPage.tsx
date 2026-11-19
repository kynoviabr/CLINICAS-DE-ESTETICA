import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ChevronLeft, ChevronRight, CalendarCog, Lock, BellRing, Search, MoreHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useClinicPlan } from '@/hooks/useClinicPlan';
import { isLeanPlan } from '@/lib/plans';
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
import { PatientSearchDialog } from './agenda/PatientSearchDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { type ViewMode } from '@/lib/agenda/model';
import { MiniCalendar } from './agenda/MiniCalendar';

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
  // No celular também abre no dia: o mês e a semana não cabem na tela.
  const isMobile = useIsMobile();
  useEffect(() => {
    if ((!lean && !isMobile) || openedOnDay.current) return;
    openedOnDay.current = true;
    if (!searchParams.get('visao')) setViewMode('day');
  }, [lean, isMobile, searchParams, setViewMode]);

  const openNew = () => {
    resetForm();
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    if (isProfessional && myProfessionalId) setSelectedProfessional(myProfessionalId);
    setDialogOpen(true);
  };

  const [patientSearchOpen, setPatientSearchOpen] = useState(false);

  const viewLabels: Record<ViewMode, string> = { day: 'Dia', week: 'Semana', month: 'Mês' };
  const summary = [
    { label: 'Avaliações', value: agendaSignals.evaluations, dot: 'bg-sky-500' },
    { label: 'Sessões em lote', value: agendaSignals.batches, dot: 'bg-violet-500' },
    { label: 'Bloqueios', value: agendaSignals.blocks, dot: 'bg-amber-500' },
    { label: 'Dias com restrição', value: agendaSignals.blockedDays, dot: 'bg-rose-500' },
    ...(!lean ? [{ label: 'Lista de espera', value: waitlistEntries.length, dot: 'bg-emerald-500' }] : []),
  ];

  return (
    <div>
      <PatientSearchDialog ctx={ctx} open={patientSearchOpen} onOpenChange={setPatientSearchOpen} />

      {/* Cabeçalho: título à esquerda, ações à direita */}
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <BrandButton variant="ghost" onClick={() => setAvailabilityDialogOpen(true)}>
          <CalendarCog className="w-4 h-4" /> Disponibilidade
        </BrandButton>
        <BrandButton variant="ghost" onClick={() => setBlocksDialogOpen(true)}>
          <Lock className="w-4 h-4" /> Bloqueios
        </BrandButton>
        {!lean && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BrandButton variant="outline" aria-label="Mais ações"><MoreHorizontal className="w-4 h-4" /> Mais</BrandButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => { resetWaitlistForm(); setWaitlistDialogOpen(true); }}>
                <BellRing className="mr-2 h-4 w-4" /> Lista de espera
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={sendReminderQueueMutation.isPending} onClick={() => sendReminderQueueMutation.mutate()}>Fila de lembretes WA</DropdownMenuItem>
              <DropdownMenuItem disabled={dispatchReminderMutation.isPending} onClick={() => dispatchReminderMutation.mutate()}>Disparar lembretes WA</DropdownMenuItem>
              <DropdownMenuItem disabled={generateDailySummaryMutation.isPending} onClick={() => generateDailySummaryMutation.mutate()}>Resumo diário WA</DropdownMenuItem>
              <DropdownMenuItem disabled={runAgendaJobsMutation.isPending} onClick={() => runAgendaJobsMutation.mutate('manual')}>Rodar jobs da agenda</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <BrandButton onClick={openNew}>
          <Plus className="w-4 h-4" /> Novo agendamento
        </BrandButton>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        {/* Lateral: mini calendário + resumo do período */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-4">
          <MiniCalendar ctx={ctx} />
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neste período</p>
            <ul className="space-y-2.5">
              {summary.map((item) => (
                <li key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${item.dot}`} />{item.label}</span>
                  <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="min-w-0">
          {/* Barra de navegação: hoje, setas, data | visão */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BrandButton variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</BrandButton>
              <div className="flex items-center">
                <button aria-label="Anterior" onClick={() => navigate_(-1)} className="rounded-full p-1.5 hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
                <button aria-label="Próximo" onClick={() => navigate_(1)} className="rounded-full p-1.5 hover:bg-secondary"><ChevronRight className="h-5 w-5" /></button>
              </div>
              <h2 className="text-lg font-semibold capitalize text-foreground sm:text-xl">{headerLabel}</h2>
            </div>
            <div role="tablist" aria-label="Visão da agenda" className="inline-flex rounded-lg border bg-muted/60 p-1">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {viewLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setPatientSearchOpen(true)}
              className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:border-primary/40 sm:max-w-sm"
            >
              <Search className="h-4 w-4" /> Buscar paciente na agenda…
            </button>
          {/* Várias profissionais: na visão Dia, cada uma vira uma coluna. */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex h-10 w-[210px] items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
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
            <SelectTrigger className="h-10 w-[170px]"><SelectValue placeholder="Todos status" /></SelectTrigger>
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

          <TodayQueue ctx={ctx} />

      {/* Calendar */}
      <MonthView ctx={ctx} />

      <WeekView ctx={ctx} />

      <DayView ctx={ctx} />
        </div>
      </div>

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
      {/* Celular: botão fixo para marcar sem rolar até o topo. */}
      <button type="button" onClick={openNew} aria-label="Novo agendamento"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg sm:hidden">
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
