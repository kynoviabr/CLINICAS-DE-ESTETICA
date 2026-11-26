import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, CreditCard, History, Link2, Loader2, MessageCircle, Plus, Trash2, UserPen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { publicOrigin } from '@/lib/publicOrigin';
import { whatsappLink } from '@/lib/proposals/sale';
import { METHOD_LABEL, brDate, brl, describeInstallment, describeMethod, splittable, type NewMethod, type PaymentChanges } from '@/lib/contracts/paymentAmendment';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const AMENDMENT_KIND_LABEL: Record<string, string> = {
  patient_data: 'Dados do paciente corrigidos',
  review_approved: 'Revisão aprovada',
  payment: 'Forma de pagamento alterada',
  items: 'Produtos e serviços alterados',
  cancellation: 'Contrato cancelado',
};

const FIELDS: { key: string; label: string; type?: string; wide?: boolean }[] = [
  { key: 'full_name', label: 'Nome completo', wide: true },
  { key: 'cpf', label: 'CPF' },
  { key: 'date_of_birth', label: 'Data de nascimento', type: 'date' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'zip_code', label: 'CEP' },
  { key: 'address', label: 'Endereço', wide: true },
  { key: 'address_number', label: 'Número' },
  { key: 'address_complement', label: 'Complemento' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'UF' },
];
const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

export type ContractAmendment = {
  id: string; kind: string; status: string; reason: string; created_at: string; created_by: string | null;
  changes: Record<string, unknown>; accepted_at?: string | null; accepted_name?: string | null; accepted_verified_by?: string | null;
};

export function useContractAmendments(contractId: string) {
  return useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from('contract_amendments')
        .select('id, kind, status, reason, created_at, created_by, changes, accepted_at, accepted_name, accepted_verified_by')
        .eq('contract_id', contractId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ContractAmendment[];
    },
  });
}

const showValue = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Histórico de revisões (aditivos) do contrato: o quê, quando, quem, motivo e antes → depois. */
export function AmendmentHistory({ amendments, userNames }: { amendments: ContractAmendment[]; userNames?: Record<string, string> }) {
  if (!amendments.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground"><History className="h-4 w-4" /> Histórico de revisões</p>
      <ul className="space-y-2">
        {amendments.map((a) => {
          const patient = (a.changes?.patient || {}) as Record<string, { before: unknown; after: unknown }>;
          return (
            <li key={a.id} className="rounded-md bg-secondary/30 px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-medium text-foreground">{AMENDMENT_KIND_LABEL[a.kind] || a.kind}</span>
                <span className="text-muted-foreground">
                  {format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {a.created_by && userNames?.[a.created_by] ? ` · ${userNames[a.created_by]}` : ''}
                </span>
              </div>
              {a.status === 'pending_acceptance' && <p className="mt-1 font-medium text-amber-700">Aguardando aceite do paciente</p>}
              {a.status === 'discarded' && <p className="mt-1 text-muted-foreground">Desistência da equipe (não foi aplicada)</p>}
              <p className="mt-1 text-muted-foreground">Motivo: {a.reason}</p>
              {a.kind === 'payment' && <PaymentChangeSummary changes={a.changes as unknown as PaymentChanges} />}
              {a.accepted_at && (
                <p className="mt-1 text-emerald-700">Aceito por {a.accepted_name} em {format(new Date(a.accepted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} ({a.accepted_verified_by === 'birth_date' ? 'data de nascimento conferida' : a.accepted_verified_by === 'cpf' ? 'CPF conferido' : 'nome conferido'})</p>
              )}
              {Object.keys(patient).length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(patient).map(([k, v]) => (
                    <li key={k}><span className="text-muted-foreground">{FIELD_LABEL[k] || k}:</span> <s className="text-muted-foreground">{showValue(v.before)}</s> → <span className="font-medium">{showValue(v.after)}</span></li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Corrigir dados do paciente a partir do contrato (não exige novo aceite; fica no histórico). */
export function PatientDataAmendDialog({ contractId, patientId, open, onOpenChange, onDone }: {
  contractId: string; patientId: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    supabase.from('patients').select(FIELDS.map((f) => f.key).join(', ')).eq('id', patientId).maybeSingle().then(({ data }) => {
      const row = (data || {}) as unknown as Record<string, unknown>;
      const vals = Object.fromEntries(FIELDS.map((f) => [f.key, row[f.key] == null ? '' : String(row[f.key])]));
      setOriginal(vals);
      setForm(vals);
    });
  }, [open, patientId]);

  const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v.trim() !== (original[k] ?? '').trim()));
  const canSave = Object.keys(changed).length > 0 && reason.trim().length >= 5 && !saving;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('amend_contract_patient_data', { p_contract_id: contractId, p_changes: changed, p_reason: reason.trim() });
    setSaving(false);
    if (error) { toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Dados do paciente corrigidos', description: 'A revisão ficou registrada no histórico do contrato.' });
    qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
    qc.invalidateQueries({ queryKey: ['patients'] });
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPen className="h-5 w-5 text-primary" /> Corrigir dados do paciente</DialogTitle>
          <DialogDescription>Para erros de cadastro (telefone, endereço, CPF digitado errado). Não muda valores nem itens e não precisa de novo aceite do paciente.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className={`space-y-1 ${f.wide ? 'col-span-2' : 'col-span-2 sm:col-span-1'}`}>
              <Label className="text-xs">{f.label}{changed[f.key] !== undefined && <span className="ml-1 text-primary">• alterado</span>}</Label>
              <Input type={f.type || 'text'} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Motivo da revisão (obrigatório)</Label>
            <Textarea rows={2} placeholder="Ex.: telefone digitado errado no cadastro" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <BrandButton variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</BrandButton>
          <BrandButton disabled={!canSave} onClick={save}>{saving ? 'Salvando…' : `Salvar ${Object.keys(changed).length || ''} alteração(ões)`}</BrandButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Contrato em "Precisam de revisão": aprovar e voltar para Ativo, com motivo. */
export function ApproveReviewDialog({ contractId, open, onOpenChange, onDone }: {
  contractId: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setReason(''); }, [open]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('approve_contract_review', { p_contract_id: contractId, p_reason: reason.trim() });
    setSaving(false);
    if (error) { toast({ title: 'Não foi possível aprovar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Revisão aprovada', description: 'O contrato voltou para Ativo.' });
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Aprovar revisão</DialogTitle>
          <DialogDescription>O contrato volta para Ativo. Use quando o ajuste não muda o que foi combinado com o paciente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Motivo (obrigatório)</Label>
          <Textarea rows={3} placeholder="Ex.: conferido com a paciente, sem mudança de valores" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <BrandButton variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</BrandButton>
          <BrandButton disabled={reason.trim().length < 5 || saving} onClick={save}>{saving ? 'Aprovando…' : 'Aprovar e ativar'}</BrandButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Antes (parcelas em aberto) → depois (novas formas). */
export function PaymentChangeSummary({ changes }: { changes: PaymentChanges }) {
  if (!changes?.after) return null;
  return (
    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
      <div>
        <p className="font-medium text-muted-foreground">Antes (em aberto: {brl(changes.open_balance)})</p>
        <ul className="mt-0.5 space-y-0.5">{(changes.before || []).map((i, n) => <li key={n} className="text-muted-foreground line-through">{describeInstallment(i)}</li>)}</ul>
      </div>
      <div>
        <p className="font-medium text-foreground">Depois (1º vencimento {brDate(changes.after.first_due)})</p>
        <ul className="mt-0.5 space-y-0.5">{changes.after.methods.map((m, n) => <li key={n} className="font-medium">{describeMethod(m)}</li>)}</ul>
      </div>
    </div>
  );
}

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Alterar a forma de pagamento do saldo em aberto (vira aditivo; vale depois do aceite do paciente). */
export function PaymentAmendDialog({ contractId, open, onOpenChange, onDone }: {
  contractId: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<NewMethod[]>([]);
  const [firstDue, setFirstDue] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: open_ = [], isLoading } = useQuery({
    queryKey: ['contract-open-installments', contractId, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('contract_installments').select('payment_method, installment_number, installments_count, due_date, amount')
        .eq('contract_id', contractId).eq('status', 'previsto').order('due_date');
      if (error) throw error;
      return data || [];
    },
  });
  const openBalance = Math.round(open_.reduce((s, i) => s + Number(i.amount), 0) * 100) / 100;

  useEffect(() => {
    if (!open) return;
    setReason(''); setFirstDue(todayIso());
  }, [open]);
  useEffect(() => { if (open && !isLoading) setRows([{ method: 'pix', amount: openBalance, installments: 1 }]); }, [open, isLoading, openBalance]);

  const sum = Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100;
  const diff = Math.round((openBalance - sum) * 100) / 100;
  const canSave = openBalance > 0 && rows.length > 0 && Math.abs(diff) < 0.01 && rows.every((r) => r.amount > 0) && reason.trim().length >= 5 && !!firstDue && !saving;
  const setRow = (i: number, patch: Partial<NewMethod>) => setRows((cur) => cur.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    const payload = rows.map((r) => ({ ...r, installments: splittable(r.method) ? Math.max(1, Number(r.installments || 1)) : 1 }));
    const { error } = await supabase.rpc('propose_contract_payment_amendment', { p_contract_id: contractId, p_methods: payload, p_first_due: firstDue, p_reason: reason.trim() });
    setSaving(false);
    if (error) { toast({ title: 'Não foi possível criar a revisão', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Revisão criada', description: 'Agora envie ao paciente para ele aceitar. Nada muda no financeiro antes disso.' });
    qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Alterar forma de pagamento</DialogTitle>
          <DialogDescription>Reorganiza só o que ainda não foi pago. Parcelas pagas não mudam. A mudança vale depois que o paciente aceitar pelo link.</DialogDescription>
        </DialogHeader>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando parcelas…</p> : openBalance <= 0 ? (
          <p className="rounded-md bg-muted p-3 text-sm">Este contrato não tem parcelas em aberto para reorganizar.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Em aberto hoje: {brl(openBalance)}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {open_.map((i, n) => <li key={n}>{describeInstallment({ method: i.payment_method, number: i.installment_number, count: i.installments_count, due_date: i.due_date, amount: Number(i.amount) })}</li>)}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Nova forma de pagamento</p>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-2 sm:grid-cols-[1.4fr_1fr_0.8fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Forma</Label>
                    <Select value={r.method} onValueChange={(v) => setRow(i, { method: v, installments: splittable(v) ? r.installments || 1 : 1 })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['pix', 'credit', 'debit', 'cash', 'boleto', 'transfer'].map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input type="number" min={0} step="0.01" value={r.amount || ''} onChange={(e) => setRow(i, { amount: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Input type="number" min={1} max={48} disabled={!splittable(r.method)} value={splittable(r.method) ? r.installments || 1 : 1} onChange={(e) => setRow(i, { installments: Number(e.target.value) })} />
                  </div>
                  <BrandButton variant="ghost" size="sm" aria-label="Remover forma" disabled={rows.length === 1} onClick={() => setRows((cur) => cur.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></BrandButton>
                  {(r.method === 'credit' || r.method === 'debit') && (
                    <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-4">
                      <Input placeholder="Bandeira (opcional)" value={r.card_brand || ''} onChange={(e) => setRow(i, { card_brand: e.target.value })} />
                      <Input placeholder="4 últimos dígitos (opcional)" maxLength={4} value={r.card_last4 || ''} onChange={(e) => setRow(i, { card_last4: e.target.value.replace(/\D/g, '') })} />
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BrandButton variant="outline" size="sm" disabled={rows.length >= 4} onClick={() => setRows((cur) => [...cur, { method: 'pix', amount: Math.max(0, diff), installments: 1 }])}><Plus className="h-4 w-4" /> Adicionar forma</BrandButton>
                <p className={`text-sm font-medium ${Math.abs(diff) < 0.01 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {Math.abs(diff) < 0.01 ? `Soma confere: ${brl(sum)}` : diff > 0 ? `Faltam ${brl(diff)}` : `Passou ${brl(-diff)}`}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <div className="space-y-1">
                <Label className="text-xs">1º vencimento</Label>
                <Input type="date" min={todayIso()} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motivo da revisão (obrigatório)</Label>
                <Textarea rows={2} placeholder="Ex.: paciente pediu para passar o restante para o cartão" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <BrandButton variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</BrandButton>
          <BrandButton disabled={!canSave} onClick={save}>{saving ? 'Criando…' : 'Criar revisão e enviar ao paciente'}</BrandButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Revisão aguardando o aceite do paciente: enviar link ou desistir. */
export function PendingAmendmentCard({ amendment, contractId, patientId, contractNumber, clinicName, onChanged }: {
  amendment: ContractAmendment; contractId: string; patientId: string; contractNumber: string; clinicName?: string; onChanged: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'wa' | 'copy' | 'discard' | null>(null);

  const makeLink = async () => {
    const { data, error } = await supabase.rpc('create_amendment_link', { p_amendment_id: amendment.id });
    if (error) throw error;
    return `${publicOrigin()}/aditivo/${(data as { token: string }).token}`;
  };
  const sendWa = async () => {
    const tab = window.open('', '_blank');
    setBusy('wa');
    try {
      const { data: p } = await supabase.from('patients').select('full_name, phone').eq('id', patientId).maybeSingle();
      if (!p?.phone) throw new Error('O paciente não tem telefone cadastrado.');
      const url = await makeLink();
      const msg = `Olá, ${p.full_name.split(' ')[0]}! Aqui é da ${clinicName || 'clínica'}. Conforme combinamos, preparamos a alteração na forma de pagamento do seu contrato nº ${contractNumber}. Confira e aceite neste link seguro:\n\n${url}\n\nVai pedir seu nome completo e a data de nascimento para confirmar que é você.`;
      const wa = whatsappLink(p.phone, msg);
      if (tab) tab.location.href = wa; else window.location.href = wa;
      toast({ title: 'WhatsApp aberto', description: 'Link do aceite pronto para enviar. Vale 15 dias.' });
    } catch (e) {
      tab?.close();
      toast({ title: 'Não foi possível gerar o link', description: e instanceof Error ? e.message : 'Tente de novo.', variant: 'destructive' });
    } finally { setBusy(null); }
  };
  const copy = async () => {
    setBusy('copy');
    try { await navigator.clipboard.writeText(await makeLink()); toast({ title: 'Link copiado', description: 'Vale 15 dias.' }); }
    catch (e) { toast({ title: 'Não foi possível copiar', description: e instanceof Error ? e.message : '', variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const discard = async () => {
    if (!window.confirm('Desistir desta revisão? O link enviado ao paciente deixa de funcionar e nada muda no contrato.')) return;
    setBusy('discard');
    const { error } = await supabase.rpc('discard_contract_amendment', { p_amendment_id: amendment.id });
    setBusy(null);
    if (error) { toast({ title: 'Não foi possível desistir', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
    onChanged();
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">Revisão aguardando aceite do paciente</p>
      <p className="text-xs text-amber-800">{AMENDMENT_KIND_LABEL[amendment.kind] || amendment.kind} · criada em {format(new Date(amendment.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. Nada muda no financeiro até o aceite.</p>
      {amendment.kind === 'payment' && <div className="text-xs"><PaymentChangeSummary changes={amendment.changes as unknown as PaymentChanges} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <BrandButton size="sm" onClick={sendWa} disabled={!!busy}>{busy === 'wa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Enviar ao paciente</BrandButton>
        <BrandButton size="sm" variant="outline" onClick={copy} disabled={!!busy}><Link2 className="h-4 w-4" /> Copiar link</BrandButton>
        <BrandButton size="sm" variant="ghost" className="text-destructive" onClick={discard} disabled={!!busy}>Desistir da revisão</BrandButton>
      </div>
    </div>
  );
}
