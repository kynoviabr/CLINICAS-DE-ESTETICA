import { format, startOfDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Clock3, MessageSquare, Phone, TrendingUp, UserCheck2 } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { getRenewalAlertLevel, getSnoozeLimitDays } from '@/lib/renewal/rules';
import { getLeadSourceMeta } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function CrmInsightsPanel({ ctx }: { ctx: CrmPageController }) {
  const {
    navigate,
    sourceFilter,
    setSourceFilter,
    insightFilter,
    detailsExpanded,
    renewalsExpanded,
    setRenewalsExpanded,
    renewalHistoryTaskId,
    setRenewalHistoryTaskId,
    proposals,
    interactions,
    toggleInsightFilter,
    commercialInsights,
    sortedRenewalTasks,
    renewalInteractionsByTask,
    updateRenewalMutation,
  } = ctx;
  return (
    <>
    {detailsExpanded && (
    <div className="mb-4 grid gap-3 xl:grid-cols-[1.28fr_0.72fr]">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Radar comercial</p>
              <h3 className="mt-1 text-sm font-semibold tracking-tight text-slate-900">Onde a operação precisa agir agora</h3>
            </div>
            <div className="rounded-xl bg-slate-100 p-2 text-slate-500">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => toggleInsightFilter('stalled')}
              className={`rounded-xl border border-rose-200 bg-rose-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'stalled' ? 'ring-2 ring-rose-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-rose-900">Parados há mais de 3 dias</p>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.stalledLeads.length}</p>
              <p className="mt-0.5 text-[11px] text-rose-700">Leads sem avanço recente</p>
            </button>
            <button
              type="button"
              onClick={() => toggleInsightFilter('scheduled')}
              className={`rounded-xl border border-sky-200 bg-sky-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'scheduled' ? 'ring-2 ring-sky-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-sky-900">Avaliações agendadas</p>
                <CalendarDays className="h-4 w-4 text-sky-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.nextEvaluations}</p>
              <p className="mt-0.5 text-[11px] text-sky-700">Leads aguardando comparecimento</p>
            </button>
            <button
              type="button"
              onClick={() => toggleInsightFilter('high_priority')}
              className={`rounded-xl border border-fuchsia-200 bg-fuchsia-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'high_priority' ? 'ring-2 ring-fuchsia-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-fuchsia-900">Alta prioridade</p>
                <TrendingUp className="h-4 w-4 text-fuchsia-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.highPriority}</p>
              <p className="mt-0.5 text-[11px] text-fuchsia-700">Leads que precisam de atenção especial</p>
            </button>
            <button
              type="button"
              onClick={() => toggleInsightFilter('overdue_follow_up')}
              className={`rounded-xl border border-orange-200 bg-orange-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'overdue_follow_up' ? 'ring-2 ring-orange-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-orange-900">Follow-up atrasado</p>
                <MessageSquare className="h-4 w-4 text-orange-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.overdueFollowUps}</p>
              <p className="mt-0.5 text-[11px] text-orange-700">Leads com próxima ação vencida</p>
            </button>
            <button
              type="button"
              onClick={() => toggleInsightFilter('proposal_open')}
              className={`rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'proposal_open' ? 'ring-2 ring-amber-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-amber-900">Propostas abertas</p>
                <MessageSquare className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.awaitingProposalResponse}</p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                {commercialInsights.overdueFollowUps > 0
                  ? `${commercialInsights.overdueFollowUps} follow-up${commercialInsights.overdueFollowUps > 1 ? 's' : ''} atrasado${commercialInsights.overdueFollowUps > 1 ? 's' : ''}`
                  : 'Leads com proposta em andamento'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => toggleInsightFilter('without_owner')}
              className={`rounded-xl border border-emerald-200 bg-emerald-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${insightFilter === 'without_owner' ? 'ring-2 ring-emerald-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-emerald-900">Sem responsável definido</p>
                <UserCheck2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.withoutOwner.length}</p>
              <p className="mt-0.5 text-[11px] text-emerald-700">Leads sem dono atribuído</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-violet-200 bg-violet-50/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-violet-900">Renovações sem ação</p>
                <Clock3 className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{commercialInsights.renewalWithoutAction}</p>
              <p className="mt-0.5 text-[11px] text-violet-700">Tarefas de renovação com SLA de 3+ dias</p>
            </button>
          </div>
    
          {sortedRenewalTasks.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <button
                type="button"
                onClick={() => setRenewalsExpanded((current) => !current)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left hover:bg-white/70"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Renovações pendentes</p>
                  <p className="text-sm font-semibold text-slate-900">🔄 Renovações pendentes ({sortedRenewalTasks.length})</p>
                </div>
                <div className="text-slate-500">{renewalsExpanded ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</div>
              </button>
    
              {renewalsExpanded && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {sortedRenewalTasks.map((task) => {
                    const alertLevel = getRenewalAlertLevel(task.days_since_last_action || 0);
                    const alertClasses = alertLevel === 'critical'
                      ? 'border-rose-300 bg-rose-50/70'
                      : alertLevel === 'warning'
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-slate-200 bg-white';
                    const interactions = renewalInteractionsByTask.get(task.id) || [];
                    return (
                      <div key={task.id} className={`rounded-xl border p-2 ${alertClasses}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{task.patient_name}</p>
                            <p className="truncate text-xs text-slate-600">{task.treatment_name}</p>
                          </div>
                          <span className="text-[10px] text-slate-500">há {task.days_since_last_action || 0}d</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">
                          Sessão {task.sessions_completed || 0} de {task.sessions_total || 0} · LTV R$ {Number(task.patient_ltv || 0).toFixed(0)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600">
                          Sugestão: {task.suggested_treatment_name || task.treatment_name}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              if (!task.patient_phone) return;
                              const digits = task.patient_phone.replace(/\D/g, '');
                              window.open(`https://wa.me/55${digits}`, '_blank', 'noopener,noreferrer');
                              updateRenewalMutation.mutate({ task, actionType: 'whatsapp_sent' });
                            }}
                          >
                            WhatsApp
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              if (task.patient_phone) {
                                window.location.href = `tel:${task.patient_phone}`;
                              }
                              updateRenewalMutation.mutate({ task, actionType: 'call_attempted' });
                            }}
                          >
                            <Phone className="mr-1 h-3 w-3" /> Ligar
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              navigate(`/clinic/appointments?openNew=1&patientId=${task.patient_id}&appointmentType=return&treatmentId=${task.treatment_id}`);
                              updateRenewalMutation.mutate({ task, actionType: 'revaluation_scheduled', patch: { status: 'revaluation_scheduled' } });
                            }}
                          >
                            Agendar reavaliação
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              const snoozeDays = 7;
                              const until = addDays(startOfDay(new Date()), Math.min(snoozeDays, getSnoozeLimitDays())).toISOString();
                              updateRenewalMutation.mutate({
                                task,
                                actionType: 'snoozed',
                                patch: {
                                  status: 'snoozed',
                                  snoozed_until: until,
                                  snooze_count: ((task as unknown as { snooze_count?: number }).snooze_count || 0) + 1,
                                },
                              });
                            }}
                          >
                            Snooze 7d
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              navigate(`/clinic/proposals?patientId=${task.patient_id}&openNew=1&treatmentId=${task.suggested_treatment_id || task.treatment_id}&renewalTaskId=${task.id}`);
                              updateRenewalMutation.mutate({ task, actionType: 'converted', patch: { status: 'converted' } });
                            }}
                          >
                            Converter
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-rose-700"
                            onClick={() => {
                              const reason = window.prompt('Motivo do descarte:');
                              if (!reason) return;
                              updateRenewalMutation.mutate({
                                task,
                                actionType: 'discarded',
                                notes: reason,
                                patch: { status: 'discarded', discarded_reason: reason },
                              });
                            }}
                          >
                            Descartar
                          </BrandButton>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setRenewalHistoryTaskId((current) => (current === task.id ? null : task.id))}
                          >
                            {renewalHistoryTaskId === task.id ? 'Ocultar histórico' : 'Ver histórico'}
                          </BrandButton>
                        </div>
                        {renewalHistoryTaskId === task.id && (
                          <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 p-2">
                            {interactions.length === 0 ? (
                              <p className="text-[11px] text-slate-500">Sem interações registradas ainda.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {interactions.slice(0, 5).map((interaction) => (
                                  <div key={interaction.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                                    <p className="font-medium text-slate-700">{interaction.type}</p>
                                    <p className="text-slate-500">
                                      {format(new Date(interaction.performed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </p>
                                    {interaction.notes && <p className="text-slate-600">{interaction.notes}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leitura rápida</p>
          <div className="mt-2.5 space-y-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Origens que mais geram entrada</p>
              <div className="mt-2 space-y-1.5">
                {commercialInsights.topSources.length === 0 && (
                  <p className="text-sm text-slate-500">Sem origem registrada ainda.</p>
                )}
                {commercialInsights.topSources.map(([source, count], index) => (
                  <button
                    type="button"
                    key={source}
                    onClick={() => setSourceFilter((current) => current === source ? 'all' : source)}
                    className={`flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-left ring-1 ring-black/5 transition-colors hover:bg-slate-50 ${sourceFilter === source ? 'ring-sky-300' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                        {index + 1}
                      </span>
                      <span className="text-[13px] font-medium text-slate-800">{getLeadSourceMeta(source).label}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-slate-900">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    )}
    </>
  );
}
