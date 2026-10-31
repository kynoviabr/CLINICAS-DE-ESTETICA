import { ArrowDown, ArrowUp, CalendarDays, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLeadSourceMeta } from '@/lib/crm/model';
import { useCrmPage } from './crm/useCrmPage';
import { CrmInsightsPanel } from './crm/CrmInsightsPanel';
import { CrmBoard } from './crm/CrmBoard';
import { QuickCreateLeadDialog } from './crm/QuickCreateLeadDialog';
import { InteractionDialog } from './crm/InteractionDialog';
import { LossReasonDialog } from './crm/LossReasonDialog';
import { LeadDrawerDialog } from './crm/LeadDrawerDialog';
import { ProposalDialog } from './crm/ProposalDialog';
import { ProposalViewDialog } from './crm/ProposalViewDialog';
import { ContractDialog } from './crm/ContractDialog';

export default function CrmPage() {
  const ctx = useCrmPage();
  const {
    navigate,
    search,
    setSearch,
    assignedFilter,
    setAssignedFilter,
    stageFilter,
    setStageFilter,
    sourceFilter,
    setSourceFilter,
    insightFilter,
    viewMode,
    setViewMode,
    detailsExpanded,
    setDetailsExpanded,
    setQuickCreateOpen,
    leads,
    configuredStages,
    staff,
    availableSources,
    clearQuickFilters,
    topKpis,
    insightFilterLabel,
  } = ctx;
  return (
    <div>
      <PageHeader title="CRM Kanban" description="Funil comercial de leads e avaliações da clínica">
        <div className="flex gap-2">
          <BrandButton variant="outline" onClick={() => navigate('/clinic/appointments')}>
            <CalendarDays className="w-4 h-4" />
            Agenda
          </BrandButton>
          <BrandButton onClick={() => setQuickCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Novo Lead
          </BrandButton>
        </div>
      </PageHeader>

      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leads no pipeline</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-xl font-semibold tracking-tight text-slate-900">{topKpis.total}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">Em aberto</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-600">Taxa de conversão</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-xl font-semibold tracking-tight text-slate-900">{topKpis.conversion}%</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-sky-700 shadow-sm">Fechamento</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50 via-white to-violet-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-600">Ticket médio</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-xl font-semibold tracking-tight text-slate-900">R$ {topKpis.ticket.toFixed(0)}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-violet-700 shadow-sm">Venda</span>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-600">Receita no pipeline</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-xl font-semibold tracking-tight text-slate-900">R$ {topKpis.pipelineValue.toFixed(0)}</p>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-emerald-700 shadow-sm">Potencial</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone ou CPF..."
                className="h-10 rounded-lg border-slate-200 bg-slate-50/80 pl-10 text-sm"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[620px] xl:grid-cols-4">
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos responsáveis</SelectItem>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas etapas</SelectItem>
                  {configuredStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {availableSources.map((source) => <SelectItem key={source} value={source}>{getLeadSourceMeta(source).label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'kanban' | 'list')}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kanban">Kanban</SelectItem>
                  <SelectItem value="list">Lista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setDetailsExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Detalhes</p>
              <p className="mt-0.5 text-sm text-slate-700">
                Radar comercial, origens e pendências da operação
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{detailsExpanded ? 'Ocultar' : 'Expandir'}</span>
              {detailsExpanded ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </div>
          </button>
        </CardContent>
      </Card>

      <CrmInsightsPanel ctx={ctx} />

      {(insightFilter !== 'all' || sourceFilter !== 'all') && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-sm text-slate-700">
            Filtro ativo:{' '}
            <span className="font-semibold text-slate-900">
              {[insightFilter !== 'all' ? insightFilterLabel : null, sourceFilter !== 'all' ? `Origem: ${getLeadSourceMeta(sourceFilter).label}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          <BrandButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={clearQuickFilters}>
            Limpar
          </BrandButton>
        </div>
      )}

      <CrmBoard ctx={ctx} />

      <QuickCreateLeadDialog ctx={ctx} />

      <InteractionDialog ctx={ctx} />

      <LossReasonDialog ctx={ctx} />

      <LeadDrawerDialog ctx={ctx} />

      <ProposalDialog ctx={ctx} />

      <ProposalViewDialog ctx={ctx} />

      <ContractDialog ctx={ctx} />
    </div>
  );
}
