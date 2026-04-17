import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, FileText, Trash2, Search, Eye, Send, Check, X, Printer, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  draft: { label: 'Rascunho', badge: 'draft' },
  sent: { label: 'Enviada', badge: 'sent' },
  accepted: { label: 'Aprovada', badge: 'approved' },
  expired: { label: 'Expirada', badge: 'expired' },
  rejected: { label: 'Reprovada', badge: 'rejected' },
};

interface ProposalItem {
  treatment_id: string;
  quantity: number;
  unit_price: number;
  is_combo?: boolean;
  combo_id?: string;
}

export default function ProposalsPage() {
  const { clinicId, clinicName } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState('treatment');

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals', clinicId, filterStatus, search],
    queryFn: async () => {
      let q = supabase
        .from('proposals')
        .select('*, patients(full_name)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (filterStatus !== 'all') q = q.eq('status', filterStatus as any);
      if (search) q = q.ilike('proposal_number', `%${search}%`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, price, min_price, default_price').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: combos = [] } = useQuery({
    queryKey: ['combos-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatment_combos' as any).select('*, treatment_combo_items(*, treatments(id, name, price, min_price))').eq('clinic_id', clinicId!).eq('active', true);
      return (data as any[]) || [];
    },
    enabled: !!clinicId,
  });

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const generateProposalNumber = () => {
    const now = new Date();
    const yymm = format(now, 'yyyyMM');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `PROP-${yymm}-${seq}`;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const num = editingId ? undefined : generateProposalNumber();
      
      if (editingId) {
        const { error } = await supabase.from('proposals').update({
          patient_id: selectedPatient,
          total_amount: total,
          final_amount: total,
          notes: notes || null,
          valid_until: validUntil || null,
        }).eq('id', editingId);
        if (error) throw error;

        await supabase.from('proposal_items').delete().eq('proposal_id', editingId);
        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: editingId,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }
      } else {
        const { data: proposal, error } = await supabase.from('proposals').insert({
          clinic_id: clinicId!,
          patient_id: selectedPatient,
          proposal_number: num!,
          total_amount: total,
          final_amount: total,
          notes: notes || null,
          valid_until: validUntil || null,
          created_by: user?.id || null,
        }).select().single();
        if (error) throw error;

        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: proposal.id,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingId ? 'Proposta atualizada!' : 'Proposta criada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('proposals').update({ status: status as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setViewDialog(null);
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedPatient('');
    setNotes('');
    setValidUntil('');
    setItems([]);
    setEditingId(null);
  };

  const addTreatmentItem = () => {
    if (treatments.length > 0) {
      const t = treatments[0];
      setItems([...items, { treatment_id: t.id, quantity: 1, unit_price: Number(t.default_price || t.price) }]);
    }
  };

  const addComboItem = (combo: any) => {
    const comboItems = combo.treatment_combo_items || [];
    const newItems: ProposalItem[] = comboItems.map((ci: any) => ({
      treatment_id: ci.treatments?.id || ci.treatment_id,
      quantity: ci.quantity || 1,
      unit_price: combo.promotional_price
        ? Number(combo.promotional_price) / comboItems.length
        : Number(ci.treatments?.price || 0),
      is_combo: true,
      combo_id: combo.id,
    }));
    setItems([...items, ...newItems]);
  };

  const getMinPriceWarning = (item: ProposalItem) => {
    const t = treatments.find((tr: any) => tr.id === item.treatment_id);
    if (t?.min_price && item.unit_price < Number(t.min_price)) {
      return `Abaixo do mínimo (R$ ${Number(t.min_price).toFixed(2)})`;
    }
    return null;
  };

  const openEdit = async (proposal: any) => {
    setEditingId(proposal.id);
    setSelectedPatient(proposal.patient_id);
    setNotes(proposal.notes || '');
    setValidUntil(proposal.valid_until || '');

    const { data: pItems } = await supabase.from('proposal_items').select('*').eq('proposal_id', proposal.id);
    setItems((pItems || []).map((pi: any) => ({
      treatment_id: pi.treatment_id,
      quantity: pi.quantity,
      unit_price: Number(pi.unit_price),
    })));
    setDialogOpen(true);
  };

  const openView = async (proposal: any) => {
    const { data: pItems } = await supabase.from('proposal_items').select('*, treatments(name)').eq('proposal_id', proposal.id);
    setViewDialog({ ...proposal, items: pItems || [] });
  };

  const handlePrint = (proposal: any) => {
    const patient = patients.find((p: any) => p.id === proposal.patient_id);
    const printItems = proposal.items || [];
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Proposta ${proposal.proposal_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}
      h1{font-size:24px;margin-bottom:4px}h2{font-size:14px;color:#666;margin-top:0}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:13px}
      th{background:#f5f5f5;font-weight:600}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}
      .signature{margin-top:80px;border-top:1px solid #333;width:300px;text-align:center;padding-top:8px;font-size:12px}
      </style></head><body>
      <h1>${clinicName}</h1><h2>Proposta Comercial</h2>
      <p><strong>Nº:</strong> ${proposal.proposal_number}</p>
      <p><strong>Paciente:</strong> ${patient?.full_name || (proposal.patients as any)?.full_name || '—'}</p>
      <p><strong>Data:</strong> ${format(new Date(proposal.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
      ${proposal.valid_until ? `<p><strong>Validade:</strong> ${format(new Date(proposal.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</p>` : ''}
      <table><thead><tr><th>Tratamento</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead><tbody>
      ${printItems.map((i: any) => `<tr><td>${(i.treatments as any)?.name || '—'}</td><td>${i.quantity}</td><td>R$ ${Number(i.unit_price).toFixed(2)}</td><td>R$ ${Number(i.subtotal).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      <p class="total">Total: R$ ${Number(proposal.final_amount).toFixed(2)}</p>
      ${proposal.notes ? `<p style="margin-top:20px"><strong>Observações:</strong> ${proposal.notes}</p>` : ''}
      <div class="signature">Assinatura do paciente</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const generateContract = async (proposal: any) => {
    const now = new Date();
    const num = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
    const { error } = await supabase.from('contracts').insert({
      clinic_id: clinicId!,
      patient_id: proposal.patient_id,
      proposal_id: proposal.id,
      contract_number: num,
      status: 'draft' as any,
      created_by: user?.id || null,
      start_date: format(now, 'yyyy-MM-dd'),
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato gerado!', description: `Nº ${num}` });
      setViewDialog(null);
    }
  };

  return (
    <div>
      <PageHeader title="Propostas" description="Geração e gestão de propostas comerciais">
        <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </BrandButton>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº da proposta..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
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
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && proposals.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma proposta encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira proposta comercial</p>
          <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nova Proposta
          </BrandButton>
        </div>
      )}

      {!isLoading && proposals.length > 0 && (
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
                {proposals.map((p: any) => {
                  const sm = statusMap[p.status] || { label: p.status, badge: 'default' as BadgeStatus };
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{p.proposal_number}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{(p.patients as any)?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.valid_until ? format(new Date(p.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">R$ {Number(p.final_amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><BrandBadge status={sm.badge}>{sm.label}</BrandBadge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <BrandButton variant="ghost" size="sm" onClick={() => openView(p)} title="Ver"><Eye className="w-3.5 h-3.5" /></BrandButton>
                          {p.status === 'draft' && (
                            <BrandButton variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar"><FileText className="w-3.5 h-3.5" /></BrandButton>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div>
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
                      {combos.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between p-2 border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(c.treatment_combo_items || []).map((ci: any) => ci.treatments?.name).filter(Boolean).join(', ')}
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
                          const t = treatments.find((tr: any) => tr.id === v);
                          const newItems = [...items];
                          newItems[idx] = { ...item, treatment_id: v, unit_price: t ? Number(t.default_price || t.price) : item.unit_price };
                          setItems(newItems);
                        }}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {treatments.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
                      <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-destructive p-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {warning && <p className="text-xs text-destructive mt-1">{warning}</p>}
                  </div>
                );
              })}
              {items.length > 0 && (
                <p className="text-right font-bold text-foreground mt-2">Total: R$ {total.toFixed(2)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient}>
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
                  <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{(viewDialog.patients as any)?.full_name}</span></div>
                  <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{format(new Date(viewDialog.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
                  {viewDialog.valid_until && <div><span className="text-muted-foreground">Validade:</span> <span className="font-medium">{format(new Date(viewDialog.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</span></div>}
                  <div><span className="text-muted-foreground">Valor Total:</span> <span className="font-bold">R$ {Number(viewDialog.final_amount).toFixed(2)}</span></div>
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
                        {viewDialog.items.map((i: any) => (
                          <tr key={i.id} className="border-b">
                            <td className="px-3 py-2">{(i.treatments as any)?.name || '—'}</td>
                            <td className="px-3 py-2 text-center">{i.quantity}</td>
                            <td className="px-3 py-2 text-right">R$ {Number(i.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">R$ {Number(i.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {viewDialog.notes && <p className="text-sm text-muted-foreground"><strong>Obs:</strong> {viewDialog.notes}</p>}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <BrandButton variant="outline" size="sm" onClick={() => handlePrint(viewDialog)}>
                    <Printer className="w-4 h-4" /> Imprimir
                  </BrandButton>

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
                      <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'rejected' })}>
                        <X className="w-4 h-4" /> Reprovar
                      </BrandButton>
                    </>
                  )}

                  {viewDialog.status === 'accepted' && (
                    <BrandButton size="sm" onClick={() => generateContract(viewDialog)}>
                      <FileText className="w-4 h-4" /> Gerar Contrato
                    </BrandButton>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
