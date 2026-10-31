import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, FileText, MessageSquare, UserRound } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandBadge } from '@/components/ui/brand-badge';
import { interactionTypes, relativeDate, normalizePhone, buildEvaluationScheduleLink, getRiskLabel, getFollowUpStatus, getPriorityBadge, normalizeLeadSource, getLeadSourceMeta, type StageCode } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function LeadDrawerDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    navigate,
    leadDrawer,
    setLeadDrawer,
    setInteractionOpen,
    configuredStages,
    staff,
    proposals,
    interactions,
    leadAppointments,
    leadProposals,
    leadContracts,
    staffMap,
    treatmentMap,
    stageMap,
    openProposalFlow,
    openExistingProposal,
    openExistingContract,
    openLeadContractDialog,
    requestLeadStageMove,
    handleLeadCepChange,
    saveLeadMutation,
    canOpenWhatsApp,
    latestLeadProposal,
    latestLeadContract,
  } = ctx;
  return (
    <Dialog open={!!leadDrawer} onOpenChange={(open) => !open && setLeadDrawer(null)}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl border-slate-200 p-0">
        {leadDrawer && (
          <>
            <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-3 text-left">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <UserRound className="w-5 h-5 text-primary" />
                {leadDrawer.full_name}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLeadSourceMeta(leadDrawer.source).className}`}>
                  {getLeadSourceMeta(leadDrawer.source).label}
                </span>
              </DialogTitle>
              <DialogDescription>
                {stageMap[leadDrawer.kanban_stage]?.label || leadDrawer.kanban_stage} · Responsável {leadDrawer.assigned_to ? staffMap[leadDrawer.assigned_to] || 'Equipe' : 'não atribuído'}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3">
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {leadDrawer.phone || 'Sem telefone'}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {relativeDate(leadDrawer.last_interaction_at || leadDrawer.stage_changed_at)}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getRiskLabel(leadDrawer.last_credit_risk_level).className}`}>
                  {getRiskLabel(leadDrawer.last_credit_risk_level).label}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPriorityBadge(leadDrawer.priority_level).className}`}>
                  {getPriorityBadge(leadDrawer.priority_level).label}
                </span>
                {leadDrawer.next_action_at && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getFollowUpStatus(leadDrawer.next_action_at).className}`}>
                    {getFollowUpStatus(leadDrawer.next_action_at).label}
                  </span>
                )}
                {leadDrawer.appointment_id && <BrandBadge status="scheduled" withDot={false}>Avaliação vinculada</BrandBadge>}
                {leadDrawer.treatments_of_interest?.[0] && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {treatmentMap[leadDrawer.treatments_of_interest[0]] || leadDrawer.treatments_of_interest[0]}
                  </span>
                )}
                {latestLeadProposal && (
                  <button
                    type="button"
                    onClick={() => openExistingProposal(latestLeadProposal.id)}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                  >
                    Proposta {latestLeadProposal.proposal_number} · {latestLeadProposal.status}
                  </button>
                )}
                {latestLeadContract && (
                  <button
                    type="button"
                    onClick={() => openExistingContract(latestLeadContract.id)}
                    className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                  >
                    Contrato {latestLeadContract.contract_number} · {latestLeadContract.process_status}
                  </button>
                )}
              </div>
    
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="space-y-2 flex-1">
                    <Label>Mover etapa</Label>
                    <Select
                      value={leadDrawer.kanban_stage}
                      onValueChange={(value) => {
                        const targetStage = value as StageCode;
                        requestLeadStageMove(leadDrawer, targetStage);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {configuredStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setInteractionOpen(true)}>
                      <MessageSquare className="w-4 h-4" />
                      Registrar interação
                    </BrandButton>
                    <BrandButton
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() =>
                        navigate(
                          buildEvaluationScheduleLink(
                            leadDrawer.id,
                            leadDrawer.assigned_to || null,
                          ),
                        )
                      }
                    >
                      <CalendarDays className="w-4 h-4" />
                      Agendar avaliação
                    </BrandButton>
                    {leadDrawer.kanban_stage === 'scheduled' && (
                      <BrandButton size="sm" className="h-8 px-3 text-xs" onClick={() => openProposalFlow(leadDrawer)}>
                        Nova proposta
                      </BrandButton>
                    )}
                    {leadDrawer.kanban_stage === 'proposal_sent' && (
                      <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => openProposalFlow(leadDrawer)}>
                        Criar proposta
                      </BrandButton>
                    )}
                    {leadDrawer.patient_id && (
                      <BrandButton size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => navigate(`/clinic/patients/${leadDrawer.patient_id}`)}>
                        Ver paciente
                      </BrandButton>
                    )}
                    {canOpenWhatsApp(leadDrawer) && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() => window.open(`https://wa.me/55${normalizePhone(leadDrawer.phone)}`, '_blank')}
                      >
                        Abrir WhatsApp
                      </BrandButton>
                    )}
                  </div>
                </div>
              </div>
    
              <Tabs defaultValue="general">
                <TabsList className="mb-3 w-full justify-start overflow-x-auto rounded-lg bg-slate-100/80 p-1">
                  <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                  <TabsTrigger value="interactions">Interações</TabsTrigger>
                  <TabsTrigger value="proposals">Propostas</TabsTrigger>
                  <TabsTrigger value="contracts">Contratos</TabsTrigger>
                  <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
                </TabsList>
                <TabsContent value="general" className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={leadDrawer.full_name} onChange={(event) => setLeadDrawer({ ...leadDrawer, full_name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={leadDrawer.phone || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, phone: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>CPF <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                      <Input value={leadDrawer.cpf || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, cpf: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input value={leadDrawer.email || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, email: event.target.value })} />
                    </div>
                    <div className="space-y-4 rounded-lg border p-4 md:col-span-2 xl:col-span-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                        <p className="text-xs text-muted-foreground mt-1">Mesma base usada no cadastro de Novo Paciente e na formalização do contrato.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>CEP</Label>
                          <Input value={leadDrawer.zip_code || ''} onChange={(event) => handleLeadCepChange(event.target.value)} placeholder="00000-000" />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Endereço completo</Label>
                          <Input value={leadDrawer.address || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, address: event.target.value })} placeholder="Rua, número, complemento e bairro" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Cidade</Label>
                          <Input value={leadDrawer.city || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, city: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>UF</Label>
                          <Input value={leadDrawer.state || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, state: event.target.value.toUpperCase().slice(0, 2) })} placeholder="SP" maxLength={2} />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Origem</Label>
                      <Select value={leadDrawer.source ? normalizeLeadSource(leadDrawer.source) : 'none'} onValueChange={(value) => setLeadDrawer({ ...leadDrawer, source: value === 'none' ? null : value })}>
                        <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não informado</SelectItem>
                          <SelectItem value="indicacao">Indicação</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="site">Site</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="whatsapp_ai">WhatsApp IA</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Responsável</Label>
                      <Select value={leadDrawer.assigned_to || 'unassigned'} onValueChange={(value) => setLeadDrawer({ ...leadDrawer, assigned_to: value === 'unassigned' ? null : value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Sem responsável</SelectItem>
                          {staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Select
                        value={leadDrawer.priority_level || 'medium'}
                        onValueChange={(value) => setLeadDrawer({ ...leadDrawer, priority_level: value as 'high' | 'medium' | 'low' })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">Alta prioridade</SelectItem>
                          <SelectItem value="medium">Média prioridade</SelectItem>
                          <SelectItem value="low">Baixa prioridade</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Próxima ação</Label>
                      <Input
                        value={leadDrawer.next_action || ''}
                        onChange={(event) => setLeadDrawer({ ...leadDrawer, next_action: event.target.value })}
                        placeholder="Ex: Retornar proposta, ligar amanhã..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data da próxima ação</Label>
                      <Input
                        type="datetime-local"
                        value={leadDrawer.next_action_at ? format(new Date(leadDrawer.next_action_at), "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(event) => setLeadDrawer({ ...leadDrawer, next_action_at: event.target.value ? new Date(event.target.value).toISOString() : null })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2 xl:col-span-2">
                    <Label>Observações</Label>
                      <Textarea value={leadDrawer.notes || ''} onChange={(event) => setLeadDrawer({ ...leadDrawer, notes: event.target.value })} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tratamentos de interesse</Label>
                      <div className="flex flex-wrap gap-2">
                        {leadDrawer.treatments_of_interest?.length ? leadDrawer.treatments_of_interest.map((item) => (
                          <span key={item} className="rounded-full bg-secondary px-2 py-1 text-xs text-foreground">
                            {treatmentMap[item] || item}
                          </span>
                        )) : <span className="text-xs text-muted-foreground">Nenhum tratamento selecionado.</span>}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="interactions">
                  <div className="space-y-3">
                    {interactions.length === 0 && (
                      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Nenhuma interação registrada.
                      </div>
                    )}
                    {interactions.map((interaction) => {
                      const typeLabel = interactionTypes.find((item) => item.value === interaction.type)?.label || interaction.type;
                      return (
                        <div key={interaction.id} className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-foreground text-sm">{typeLabel}</p>
                            <span className="text-xs text-muted-foreground">{relativeDate(interaction.performed_at)}</span>
                          </div>
                          {interaction.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{interaction.notes}</p>}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="proposals">
                  <div className="space-y-3">
                    {!leadDrawer.patient_id && (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        Este lead ainda não foi convertido em paciente. Feche a venda para vincular propostas e contratos.
                      </div>
                    )}
                    {leadDrawer.kanban_stage === 'proposal_sent' && (
                      <div className="flex justify-end">
                        <BrandButton size="sm" onClick={() => openProposalFlow(leadDrawer)}>
                          Criar nova proposta
                        </BrandButton>
                      </div>
                    )}
                    {leadDrawer.patient_id && leadProposals.length === 0 && (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        Nenhuma proposta vinculada a este paciente ainda.
                      </div>
                    )}
                    {leadProposals.map((proposal) => {
                      const hasLinkedContract = leadContracts.some((contract) => contract.proposal_id === proposal.id);
                      const canGenerateContract = !hasLinkedContract && (proposal.status === 'draft' || proposal.status === 'sent' || proposal.status === 'accepted');
                      return (
                        <div key={proposal.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <button
                                type="button"
                                onClick={() => openExistingProposal(proposal.id)}
                                className="text-left font-medium text-foreground text-sm underline-offset-4 hover:underline"
                              >
                                {proposal.proposal_number}
                              </button>
                              <p className="text-xs text-muted-foreground">{relativeDate(proposal.created_at)}</p>
                            </div>
                            <div className="text-right">
                              <BrandBadge status={proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'draft' ? 'draft' : 'sent'}>
                                {proposal.status}
                              </BrandBadge>
                              <p className="text-sm font-semibold text-foreground mt-1">R$ {Number(proposal.final_amount || 0).toFixed(0)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                            {hasLinkedContract ? (
                              <span className="text-xs text-muted-foreground">Contrato já gerado para esta proposta</span>
                            ) : canGenerateContract ? (
                              <BrandButton size="sm" onClick={() => openLeadContractDialog(proposal)}>
                                <FileText className="w-4 h-4" />
                                {proposal.status === 'accepted' ? 'Gerar contrato' : 'Aprovar e gerar contrato'}
                              </BrandButton>
                            ) : (
                              <span className="text-xs text-muted-foreground">Proposta sem ação de contrato</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="contracts">
                  <div className="space-y-3">
                    {!leadDrawer.patient_id && (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        Este lead ainda não foi convertido em paciente. Os contratos aparecem depois da conversão e da proposta aprovada.
                      </div>
                    )}
                    {leadDrawer.patient_id && leadContracts.length === 0 && (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        Nenhum contrato vinculado a este paciente ainda.
                      </div>
                    )}
                    {leadContracts.map((contract) => (
                      <div key={contract.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                        <div>
                          <button
                            type="button"
                            onClick={() => openExistingContract(contract.id)}
                            className="text-left font-medium text-foreground text-sm underline-offset-4 hover:underline"
                          >
                            {contract.contract_number}
                          </button>
                          <p className="text-xs text-muted-foreground">{relativeDate(contract.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <BrandBadge status={contract.process_status === 'confirmed' ? 'approved' : contract.process_status === 'pending_confirmation' ? 'sent' : contract.process_status === 'overdue' ? 'rejected' : 'draft'}>
                            {contract.process_status}
                          </BrandBadge>
                          {contract.proposal_id && (
                            <p className="mt-1 text-xs text-muted-foreground">Ligado a proposta</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="appointments">
                  <div className="space-y-3">
                    {leadAppointments.length === 0 && (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        Nenhum agendamento ligado a este lead.
                      </div>
                    )}
                    {leadAppointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground text-sm">{appointment.appointment_type === 'evaluation' ? 'Avaliação' : 'Agendamento'}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(appointment.scheduled_at || appointment.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <BrandBadge status={appointment.status === 'completed' ? 'completed' : appointment.status === 'confirmed' ? 'confirmed' : appointment.status === 'cancelled' ? 'cancelled' : appointment.status === 'no_show' ? 'no_show' : 'scheduled'}>
                          {appointment.status}
                        </BrandBadge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
              <div className="flex justify-end">
                <BrandButton size="sm" onClick={() => saveLeadMutation.mutate({
                  full_name: leadDrawer.full_name,
                  phone: leadDrawer.phone,
                  cpf: leadDrawer.cpf,
                  email: leadDrawer.email,
                  zip_code: leadDrawer.zip_code,
                  address: leadDrawer.address,
                  city: leadDrawer.city,
                  state: leadDrawer.state,
                  source: leadDrawer.source ? normalizeLeadSource(leadDrawer.source) : null,
                  notes: leadDrawer.notes,
                  assigned_to: leadDrawer.assigned_to,
                  priority_level: leadDrawer.priority_level,
                  next_action: leadDrawer.next_action,
                  next_action_at: leadDrawer.next_action_at,
                })}>
                  Salvar alterações
                </BrandButton>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
