import { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Columns3, List, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLeadSourceMeta } from '@/lib/crm/model';
import { useClinicPlan } from '@/hooks/useClinicPlan';
import { isLeanPlan } from '@/lib/plans';
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

const formatBRL0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

export default function CrmPage() {
  const ctx = useCrmPage();
  // Essencial: CRM enxuto, sem o painel de detalhes (radar comercial, origens, pendências).
  const { modules } = useClinicPlan();
  const lean = isLeanPlan(modules);
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
    visibleStages,
    staff,
    availableSources,
    clearQuickFilters,
    topKpis,
    insightFilterLabel,
  } = ctx;
  // Filtros recolhidos por padrão; abrem sozinhos se algum estiver ligado.
  const activeFilters = [assignedFilter, stageFilter, sourceFilter].filter((v) => v !== 'all').length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showFilters = filtersOpen || activeFilters > 0;
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

      <Card className="mb-3 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone ou CPF"
                aria-label="Buscar lead"
                className="h-10 rounded-lg border-slate-200 bg-slate-50/80 pl-10 text-sm"
              />
            </div>
            <BrandButton
              variant="outline"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="crm-filtros"
              className={showFilters ? 'border-primary/40 bg-primary/5' : undefined}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {activeFilters > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </BrandButton>
            <div role="group" aria-label="Forma de ver" className="inline-flex h-10 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
              {([['kanban', 'Kanban', Columns3], ['list', 'Lista', List]] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === mode ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {showFilters && (
            <div id="crm-filtros" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,220px))_auto] lg:items-center">
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger aria-label="Responsável" className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os responsáveis</SelectItem>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger aria-label="Etapa" className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as etapas</SelectItem>
                  {visibleStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger aria-label="Origem" className="h-10 rounded-lg border-slate-200 bg-slate-50/80 text-sm"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {availableSources.map((source) => <SelectItem key={source} value={source}>{getLeadSourceMeta(source).label}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeFilters > 0 && (
                <button
                  type="button"
                  className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => { setAssignedFilter('all'); setStageFilter('all'); setSourceFilter('all'); }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Números do funil numa linha só: informam sem ocupar a tela. */}
          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2.5 text-sm text-slate-600">
            <div className="flex items-baseline gap-1.5"><dd className="font-semibold text-slate-900">{topKpis.total}</dd><dt>{topKpis.total === 1 ? 'lead em aberto' : 'leads em aberto'}</dt></div>
            <div className="flex items-baseline gap-1.5"><dt>Conversão</dt><dd className="font-semibold text-slate-900">{topKpis.conversion}%</dd></div>
            <div className="flex items-baseline gap-1.5"><dt>Ticket médio</dt><dd className="font-semibold text-slate-900">{formatBRL0(topKpis.ticket)}</dd></div>
            <div className="flex items-baseline gap-1.5"><dt>No funil</dt><dd className="font-semibold text-slate-900">{formatBRL0(topKpis.pipelineValue)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      {!lean && (
        <>
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
        </>
      )}

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
