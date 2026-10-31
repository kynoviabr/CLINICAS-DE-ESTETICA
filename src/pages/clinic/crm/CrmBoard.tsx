import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GripVertical } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { stageAppearance, relativeDate, normalizePhone, getRiskLabel, getFollowUpStatus, isFollowUpDue, getPriorityBadge, getLeadSourceMeta } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function CrmBoard({ ctx }: { ctx: CrmPageController }) {
  const {
    clinicId,
    viewMode,
    dragLeadId,
    setDragLeadId,
    setLeadDrawer,
    selectedLeadIds,
    setSelectedLeadIds,
    bulkAssignValue,
    setBulkAssignValue,
    bulkStageValue,
    setBulkStageValue,
    leads,
    configuredStages,
    staff,
    stageMap,
    filteredLeads,
    stageGroups,
    requestLeadStageMove,
    assignLeadMutation,
    bulkAssignMutation,
    bulkMoveStageMutation,
    completeFollowUpMutation,
    bulkCompleteFollowUpMutation,
    canOpenWhatsApp,
  } = ctx;
  return (
    <>
    {viewMode === 'kanban' ? (
      <div className="pb-2">
        <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {stageGroups.map((stage) => (
          <Card
            key={stage.code}
            className={`overflow-hidden border bg-gradient-to-b shadow-sm ${stage.surface}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragLeadId) return;
              const dragged = leads.find((lead) => lead.id === dragLeadId);
              if (!dragged || dragged.kanban_stage === stage.code) return;
              requestLeadStageMove(dragged, stage.code);
            }}
          >
            <CardHeader className="space-y-1.5 border-b border-black/5 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-800">
                    {stage.label}
                  </CardTitle>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {stage.items.length} {stage.items.length === 1 ? 'lead' : 'leads'} · R$ {stage.totalValue.toFixed(0)}
                  </p>
                </div>
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${stage.accent}`}>
                  {stage.items.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 p-1.5">
              {stage.items.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-4 text-center text-[11px] text-slate-500">
                  Nenhum lead nesta etapa.
                </div>
              )}
              {stage.items.map((lead) => {
                const isStale = Math.abs((Date.now() - new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24)) > 3;
                const followUp = getFollowUpStatus(lead.next_action_at);
                const priority = getPriorityBadge(lead.priority_level);
                const source = getLeadSourceMeta(lead.source);
                return (
                  <button
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragLeadId(lead.id)}
                    onClick={() => setLeadDrawer(lead)}
                    className={`w-full rounded-lg border bg-white/95 p-2 text-left shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-md ${isStale ? 'border-rose-300' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="truncate text-[13px] font-semibold tracking-tight text-slate-900">{lead.full_name}</p>
                        {lead.next_action && (
                          <p className="mt-0.5 truncate text-[10px] text-slate-500">{lead.next_action}</p>
                        )}
                      </div>
                      <div className="rounded-full bg-slate-100 p-1 text-slate-400">
                        <GripVertical className="w-3 h-3" />
                      </div>
                    </div>
                    {lead.next_action_at && (
                      <div className="mt-1 flex justify-start">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${followUp.className}`}>
                          {followUp.label}
                        </span>
                      </div>
                    )}
                    {isFollowUpDue(lead.next_action_at) && (
                      <div className="mt-1.5 flex justify-start">
                        <BrandButton
                          size="sm"
                          variant="outline"
                          className="h-6 rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            completeFollowUpMutation.mutate(lead);
                          }}
                          disabled={completeFollowUpMutation.isPending}
                        >
                          Concluir próxima ação
                        </BrandButton>
                      </div>
                    )}
                    <div className="mt-1 flex justify-start">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priority.className}`}>
                        {priority.label}
                      </span>
                    </div>
                    {(lead.source || '').trim() && (
                      <div className="mt-1 flex justify-start">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${source.className}`}>
                          {source.label}
                        </span>
                      </div>
                    )}
                    {canOpenWhatsApp(lead) && (
                      <div className="mt-2 flex justify-end">
                        <BrandButton
                          size="sm"
                          variant="outline"
                          className="h-6 rounded-md border-slate-200 bg-white px-2 text-[10px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(`https://wa.me/55${normalizePhone(lead.phone)}`, '_blank');
                          }}
                        >
                          WhatsApp
                        </BrandButton>
                      </div>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))}
        </div>
      </div>
    ) : (
      <Card className="shadow-card">
        <CardContent className="p-0">
          {selectedLeadIds.length > 0 && (
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{selectedLeadIds.length}</span> lead(s) selecionado(s)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
                  <SelectTrigger className="h-8 min-w-[220px] bg-white text-xs">
                    <SelectValue placeholder="Atribuir responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {staff.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <BrandButton
                  size="sm"
                  className="h-8"
                  disabled={bulkAssignMutation.isPending}
                  onClick={() => bulkAssignMutation.mutate(bulkAssignValue === 'unassigned' ? null : bulkAssignValue)}
                >
                  Aplicar responsável
                </BrandButton>
                <Select value={bulkStageValue} onValueChange={setBulkStageValue}>
                  <SelectTrigger className="h-8 min-w-[220px] bg-white text-xs">
                    <SelectValue placeholder="Mover etapa em lote" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecionar etapa</SelectItem>
                    {configuredStages.map((stage) => (
                      <SelectItem key={stage.code} value={stage.code}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <BrandButton
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={bulkMoveStageMutation.isPending || bulkStageValue === 'none'}
                  onClick={() => bulkMoveStageMutation.mutate(bulkStageValue)}
                >
                  Aplicar etapa
                </BrandButton>
                <BrandButton
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  disabled={bulkCompleteFollowUpMutation.isPending}
                  onClick={() => bulkCompleteFollowUpMutation.mutate()}
                >
                  {bulkCompleteFollowUpMutation.isPending ? 'Concluindo...' : 'Concluir follow-up em lote'}
                </BrandButton>
                <BrandButton size="sm" variant="outline" className="h-8" onClick={() => setSelectedLeadIds([])}>
                  Limpar seleção
                </BrandButton>
              </div>
            </div>
          )}
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="w-12 px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                  <Checkbox
                    checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.includes(lead.id))}
                    onCheckedChange={(checked) => setSelectedLeadIds(checked ? filteredLeads.map((lead) => lead.id) : [])}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Origem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Etapa</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Responsável</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Último contato</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Próxima ação</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Prioridade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Risco</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const stage = stageMap[lead.kanban_stage] || stageAppearance({ code: lead.kanban_stage, label: lead.kanban_stage, description: '' }, 0);
                const risk = getRiskLabel(lead.last_credit_risk_level);
                const followUp = getFollowUpStatus(lead.next_action_at);
                const priority = getPriorityBadge(lead.priority_level);
                const source = getLeadSourceMeta(lead.source);
                return (
                  <tr key={lead.id} className="border-b hover:bg-secondary/20 cursor-pointer" onClick={() => setLeadDrawer(lead)}>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedLeadIds.includes(lead.id)}
                        onCheckedChange={(checked) =>
                          setSelectedLeadIds((current) =>
                            checked ? [...current, lead.id] : current.filter((id) => id !== lead.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm text-foreground">{lead.full_name}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone || 'Sem telefone'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${source.className}`}>{source.label}</span>
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${stage.accent}`}>{stage.label}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                      <Select
                        value={lead.assigned_to || 'unassigned'}
                        onValueChange={(value) => assignLeadMutation.mutate({
                          leadId: lead.id,
                          clinicId: lead.clinic_id,
                          appointmentId: lead.appointment_id,
                          assignedTo: value === 'unassigned' ? null : value,
                        })}
                      >
                        <SelectTrigger className="h-8 min-w-[180px] text-xs">
                          <SelectValue placeholder="Delegar responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Sem responsável</SelectItem>
                          {staff.map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{relativeDate(lead.last_interaction_at || lead.stage_changed_at)}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{lead.next_action || 'Sem próxima ação'}</p>
                        {lead.next_action_at && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${followUp.className}`}>
                              {format(new Date(lead.next_action_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </span>
                            {isFollowUpDue(lead.next_action_at) && (
                              <BrandButton
                                size="sm"
                                variant="outline"
                                className="h-6 rounded-md border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-800"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  completeFollowUpMutation.mutate(lead);
                                }}
                                disabled={completeFollowUpMutation.isPending}
                              >
                                Concluir
                              </BrandButton>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${priority.className}`}>{priority.label}</span>
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${risk.className}`}>{risk.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    )}
    </>
  );
}
