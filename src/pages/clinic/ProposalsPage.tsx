import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, Trash2, Search, Eye, Send, Check, X, Printer, Filter, DollarSign, Pencil, MessageCircle, Loader2, UserPlus } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import ProposalLinkPanel from '@/components/proposals/ProposalLinkPanel';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ContractPaymentConfigurator
} from '@/components/contracts/ContractPaymentConfigurator';
import { buildPaymentPresetSummary, parseProposalNotesPayload } from '@/lib/proposals/paymentPreset';
import { useProposalsPage } from './proposals/useProposalsPage';

const statusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  draft: { label: 'Rascunho', badge: 'draft' },
  sent: { label: 'Enviada', badge: 'sent' },
  accepted: { label: 'Aprovada', badge: 'approved' },
  expired: { label: 'Expirada', badge: 'expired' },
  rejected: { label: 'Reprovada', badge: 'rejected' },
};



export default function ProposalsPage() {
  const {
    toast,
    qc,
    navigate,
    dialogOpen,
    setDialogOpen,
    viewDialog,
    setViewDialog,
    filterStatus,
    quickFilter,
    setQuickFilter,
    search,
    setSearch,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    selectedPatient,
    setSelectedPatient,
    notes,
    setNotes,
    validUntil,
    setValidUntil,
    items,
    setItems,
    editingId,
    itemTab,
    setItemTab,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    approvedPrompt,
    setApprovedPrompt,
    sendingWhatsAppId,
    quickPatientOpen,
    setQuickPatientOpen,
    proposalPaymentEnabled,
    setProposalPaymentEnabled,
    proposalPaymentCondition,
    setProposalPaymentCondition,
    proposalSelectedPaymentMethods,
    proposalPaymentDetails,
    setProposalPaymentDetails,
    proposalPaymentConfig,
    setProposalPaymentConfig,
    prefillPatientId,
    crmReturnUrl,
    isLoading,
    patients,
    treatments,
    combos,
    crmLead,
    standardTotal,
    discountAmount,
    discountPercent,
    finalTotal,
    handleStatusFilterChange,
    visibleProposals,
    createMutation,
    statusMutation,
    resetForm,
    addTreatmentItem,
    addComboItem,
    getMinPriceWarning,
    openEdit,
    openView,
    handlePrint,
    handleSendWhatsApp,
    goEmitContract,
    approveAndEmit,
    toggleProposalPaymentMethod,
    proposalPaymentSum,
    proposalPaymentValidation,
    canSaveProposal,
  } = useProposalsPage();

  return (
    <div>
      <PageHeader title="Propostas" description="Geração e gestão de propostas comerciais">
        {crmReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(crmReturnUrl)}>
            Voltar ao CRM
          </BrandButton>
        )}
        <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </BrandButton>
      </PageHeader>

      {crmLead && (
        <Card className="mb-6 shadow-card border-primary/15 bg-primary/5">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Fluxo vindo do CRM</p>
              <p className="text-sm text-muted-foreground">
                Lead <span className="font-medium text-foreground">{crmLead.full_name}</span> pronto para proposta comercial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrandBadge status="scheduled" withDot={false}>
                {crmLead.kanban_stage}
              </BrandBadge>
              {prefillPatientId && (
                <BrandButton
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setSelectedPatient(prefillPatientId);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Criar proposta deste lead
                </BrandButton>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº da proposta, nome ou CPF..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aprovada</SelectItem>
            <SelectItem value="rejected">Reprovada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="w-[170px]" />
        <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="w-[170px]" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <BrandButton size="sm" variant={quickFilter === 'all' ? 'primary' : 'outline'} onClick={() => setQuickFilter('all')}>
          Todas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'draft' ? 'primary' : 'outline'} onClick={() => setQuickFilter('draft')}>
          Rascunhos
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'sent' ? 'primary' : 'outline'} onClick={() => setQuickFilter('sent')}>
          Enviadas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'accepted' ? 'primary' : 'outline'} onClick={() => setQuickFilter('accepted')}>
          Aprovadas
        </BrandButton>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && visibleProposals.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma proposta encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira proposta comercial</p>
          <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nova Proposta
          </BrandButton>
        </div>
      )}

      {!isLoading && visibleProposals.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nº</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Validade</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor Total</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleProposals.map((p) => {
                  const sm = statusMap[p.status] || { label: p.status, badge: 'default' as BadgeStatus };
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => openView(p)}
                          className="text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                          title={`Abrir proposta ${p.proposal_number}`}
                        >
                          {p.proposal_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{p.patients?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.valid_until ? format(new Date(p.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">R$ {Number(p.final_amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><BrandBadge status={sm.badge}>{sm.label}</BrandBadge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <BrandButton variant="ghost" size="sm" onClick={() => openView(p)} title="Ver"><Eye className="w-3.5 h-3.5" /></BrandButton>
                          <BrandButton
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendWhatsApp(p)}
                            disabled={sendingWhatsAppId === p.id}
                            title="Converter em PDF e Enviar por WhatsApp"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          >
                            {sendingWhatsAppId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5" />
                            )}
                          </BrandButton>
                          {p.status !== 'accepted' && (p.status as string) !== 'converted' && (
                            <BrandButton variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar"><Pencil className="w-3.5 h-3.5" /></BrandButton>
                          )}
                          {(p.status === 'draft' || p.status === 'sent') && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => statusMutation.mutate({ id: p.id, status: 'accepted' })}
                              title="Aprovar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                          {p.status === 'accepted' && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => goEmitContract(p)}
                              title="Emitir contrato"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Paciente *</Label>
                  <BrandButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary hover:text-primary/90 flex items-center gap-1 px-1.5 font-medium"
                    onClick={() => setQuickPatientOpen(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Novo cliente
                  </BrandButton>
                </div>
                <div className="flex gap-2">
                  <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-1 border-b">
                        <button
                          type="button"
                          className="w-full text-left text-xs font-semibold text-primary px-2 py-1.5 rounded hover:bg-primary/10 flex items-center gap-1.5 transition-colors"
                          onClick={() => setQuickPatientOpen(true)}
                        >
                          <UserPlus className="w-3.5 h-3.5" /> + Cadastrar novo cliente
                        </button>
                      </div>
                      {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <BrandButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 text-xs shrink-0"
                    onClick={() => setQuickPatientOpen(true)}
                    title="Cadastrar novo cliente"
                  >
                    <UserPlus className="w-4 h-4 mr-1 text-primary" /> Novo
                  </BrandButton>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <div className="space-y-4 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <Label>Itens da proposta</Label>
                </div>

                <Tabs value={itemTab} onValueChange={setItemTab} className="mb-3">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="treatment">Tratamento Individual</TabsTrigger>
                    <TabsTrigger value="combo">Combo</TabsTrigger>
                  </TabsList>
                  <TabsContent value="treatment" className="pt-2">
                    <BrandButton type="button" size="sm" variant="outline" onClick={addTreatmentItem}>
                      <Plus className="w-3 h-3" /> Adicionar Tratamento
                    </BrandButton>
                  </TabsContent>
                  <TabsContent value="combo" className="pt-2">
                    {combos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum combo disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {combos.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-2 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(c.treatment_combo_items || []).map((ci) => ci.treatments?.name).filter(Boolean).join(', ')}
                              </p>
                              {c.promotional_price && <p className="text-xs font-semibold text-primary">R$ {Number(c.promotional_price).toFixed(2)}</p>}
                            </div>
                            <BrandButton type="button" size="sm" variant="outline" onClick={() => addComboItem(c)}>
                              <Plus className="w-3 h-3" /> Adicionar
                            </BrandButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {items.map((item, idx) => {
                  const warning = getMinPriceWarning(item);
                  return (
                    <div key={idx} className="mb-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Select value={item.treatment_id} onValueChange={v => {
                            const t = treatments.find((tr) => tr.id === v);
                            const newItems = [...items];
                            newItems[idx] = { ...item, treatment_id: v, unit_price: t ? Number(t.default_price || t.price) : item.unit_price };
                            setItems(newItems);
                          }}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input type="number" min={1} value={item.quantity} className="w-16" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, quantity: parseInt(e.target.value) || 1 };
                          setItems(newItems);
                        }} />
                        <Input type="number" step="0.01" value={item.unit_price} className="w-28" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, unit_price: parseFloat(e.target.value) || 0 };
                          setItems(newItems);
                        }} />
                        <button
                          type="button"
                          onClick={() => { const min = Number(treatments.find((t) => t.id === item.treatment_id)?.min_price || 0); if (min) setItems(items.map((row, i) => (i === idx ? { ...row, unit_price: min } : row))); }}
                          disabled={!(treatments.find((t) => t.id === item.treatment_id)?.min_price)}
                          title={(treatments.find((t) => t.id === item.treatment_id)?.min_price) ? `Usar preço mínimo (R$ ${Number(treatments.find((t) => t.id === item.treatment_id)?.min_price).toFixed(2)})` : 'Tratamento sem preço mínimo'}
                          aria-label="Usar preço mínimo"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-destructive p-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {warning && <p className="text-xs text-destructive mt-1">{warning}</p>}
                    </div>
                  );
                })}
                {items.length > 0 && (
                  <div className="space-y-3 rounded-lg border p-3 bg-secondary/15 mt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-foreground">Desconto Especial</Label>
                      <div className="inline-flex rounded-md border p-0.5 bg-background">
                        <button
                          type="button"
                          onClick={() => setDiscountType('nominal')}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition ${discountType === 'nominal' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          R$ (Nominal)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiscountType('percent')}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition ${discountType === 'percent' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          % (Porcentagem)
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground w-8 text-right">
                        {discountType === 'nominal' ? 'R$' : '%'}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={discountType === 'nominal' ? '0,00' : '0'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="h-9 flex-1"
                      />
                    </div>
                    <div className="text-xs space-y-1.5 text-muted-foreground pt-2 border-t">
                      <div className="flex justify-between">
                        <span>Valor padrão:</span>
                        <span className="font-medium text-foreground">R$ {standardTotal.toFixed(2)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-success font-semibold">
                          <span>
                            Desconto especial ({discountType === 'percent' ? `${discountPercent.toFixed(1)}%` : `R$ ${discountAmount.toFixed(2)}`}):
                          </span>
                          <span>- R$ {discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-foreground font-bold text-sm pt-1 border-t">
                        <span>Valor final:</span>
                        <span className="text-primary text-base">R$ {finalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t">
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Condições de pagamento na proposta (opcional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Se preencher aqui, o contrato já abre pré-carregado para confirmar/editar.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex h-6 w-11 items-center rounded-full transition ${proposalPaymentEnabled ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => setProposalPaymentEnabled((current) => !current)}
                    aria-pressed={proposalPaymentEnabled}
                    aria-label="Habilitar condições de pagamento na proposta"
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white transition ${proposalPaymentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
                {proposalPaymentEnabled ? (
                  <div className="space-y-3">
                    <ContractPaymentConfigurator
                      paymentCondition={proposalPaymentCondition}
                      setPaymentCondition={setProposalPaymentCondition}
                      selectedPaymentMethods={proposalSelectedPaymentMethods}
                      togglePaymentMethod={toggleProposalPaymentMethod}
                      paymentConfig={proposalPaymentConfig}
                      setPaymentConfig={setProposalPaymentConfig}
                      paymentDetails={proposalPaymentDetails}
                      setPaymentDetails={setProposalPaymentDetails}
                    />
                    <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                      Valor da proposta: <span className="font-semibold text-foreground">R$ {finalTotal.toFixed(2)}</span> ·
                      Soma informada: <span className="font-semibold text-foreground">R$ {proposalPaymentSum.toFixed(2)}</span>
                      {!proposalPaymentValidation.ok && (
                        <span className="block text-destructive mt-1">
                          {proposalPaymentValidation.message}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                    Ative para informar as condições comerciais já na proposta.
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient || !canSaveProposal}>
                {createMutation.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Proposta'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Proposta {viewDialog.proposal_number}</span>
                  <BrandBadge status={statusMap[viewDialog.status]?.badge || 'default'}>
                    {statusMap[viewDialog.status]?.label || viewDialog.status}
                  </BrandBadge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{viewDialog.patients?.full_name}</span></div>
                  <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{format(new Date(viewDialog.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
                  {viewDialog.valid_until && <div><span className="text-muted-foreground">Validade:</span> <span className="font-medium">{format(new Date(viewDialog.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</span></div>}
                  <div><span className="text-muted-foreground">Valor Padrão:</span> <span className="font-medium">R$ {Number(viewDialog.total_amount || viewDialog.final_amount).toFixed(2)}</span></div>
                  {Number(viewDialog.discount_amount || 0) > 0 && (
                    <div className="text-success font-medium col-span-2 sm:col-span-1">
                      <span>Desconto Especial{Number(viewDialog.discount_percent || 0) > 0 ? ` (${viewDialog.discount_percent}%)` : ''}:</span>{' '}
                      <span>- R$ {Number(viewDialog.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div><span className="text-muted-foreground">Valor Final:</span> <span className="font-bold text-primary">R$ {Number(viewDialog.final_amount).toFixed(2)}</span></div>
                </div>

                {viewDialog.items?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-secondary/50">
                          <th className="text-left px-3 py-2">Tratamento</th>
                          <th className="text-center px-3 py-2">Qtd</th>
                          <th className="text-right px-3 py-2">Valor Unit.</th>
                          <th className="text-right px-3 py-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewDialog.items.map((i) => (
                          <tr key={i.id} className="border-b">
                            <td className="px-3 py-2">{i.treatments?.name || '—'}</td>
                            <td className="px-3 py-2 text-center">{i.quantity}</td>
                            <td className="px-3 py-2 text-right">R$ {Number(i.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">R$ {Number(i.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {parseProposalNotesPayload(viewDialog.notes).plainNotes && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Obs:</strong> {parseProposalNotesPayload(viewDialog.notes).plainNotes}
                  </p>
                )}
                {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset) && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Condições comerciais sugeridas:</strong>{' '}
                    {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset)}
                  </p>
                )}

                <ProposalLinkPanel proposalId={viewDialog.id} />

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <BrandButton
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm flex items-center gap-1.5"
                    disabled={sendingWhatsAppId === viewDialog.id}
                    onClick={() => handleSendWhatsApp(viewDialog)}
                  >
                    {sendingWhatsAppId === viewDialog.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Convertendo PDF...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
                      </>
                    )}
                  </BrandButton>

                  <BrandButton variant="outline" size="sm" onClick={() => handlePrint(viewDialog)}>
                    <Printer className="w-4 h-4" /> Imprimir
                  </BrandButton>

                  {viewDialog.status !== 'accepted' && (viewDialog.status as string) !== 'converted' && (
                    <BrandButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const target = viewDialog;
                        setViewDialog(null);
                        openEdit(target);
                      }}
                    >
                      <Pencil className="w-4 h-4" /> Editar
                    </BrandButton>
                  )}

                  {viewDialog.status === 'draft' && (
                    <BrandButton size="sm" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'sent' })}>
                      <Send className="w-4 h-4" /> Marcar como Enviada
                    </BrandButton>
                  )}

                  {(viewDialog.status === 'draft' || viewDialog.status === 'sent') && (
                    <>
                      <BrandButton size="sm" className="bg-success hover:bg-success/90" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'accepted' })}>
                        <Check className="w-4 h-4" /> Aprovar
                      </BrandButton>
                      <BrandButton size="sm" onClick={() => approveAndEmit(viewDialog)} disabled={statusMutation.isPending}>
                        <FileText className="w-4 h-4" /> Aprovar e emitir contrato
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'rejected' })}>
                        <X className="w-4 h-4" /> Reprovar
                      </BrandButton>
                    </>
                  )}

                  {viewDialog.status === 'accepted' && (
                    <BrandButton size="sm" onClick={() => goEmitContract(viewDialog)}>
                      <FileText className="w-4 h-4" /> Emitir contrato
                    </BrandButton>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvedPrompt} onOpenChange={(open) => { if (!open) { setApprovedPrompt(null); if (crmReturnUrl) navigate(crmReturnUrl); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="w-5 h-5 text-success" />Proposta aprovada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {approvedPrompt?.proposal_number} · {approvedPrompt?.patients?.full_name} · R$ {Number(approvedPrompt?.final_amount || 0).toFixed(2)}
          </p>
          <p className="text-sm text-foreground">
            Emita o contrato agora para não esquecer. A forma de pagamento combinada na proposta já vem preenchida.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <BrandButton variant="outline" onClick={() => { setApprovedPrompt(null); if (crmReturnUrl) navigate(crmReturnUrl); }}>
              Emitir depois
            </BrandButton>
            <BrandButton onClick={() => approvedPrompt && goEmitContract(approvedPrompt)}>
              <FileText className="w-4 h-4" /> Emitir contrato agora
            </BrandButton>
          </div>
        </DialogContent>
      </Dialog>

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={(patient) => {
          setSelectedPatient(patient.id);
          qc.invalidateQueries({ queryKey: ['patients-list'] });
          toast({
            title: 'Cliente cadastrado com sucesso!',
            description: `${patient.full_name} foi selecionado(a) para esta proposta.`,
          });
        }}
      />
    </div>
  );
}
