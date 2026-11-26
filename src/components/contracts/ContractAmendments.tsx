import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, History, UserPen } from 'lucide-react';
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
  changes: Record<string, unknown>;
};

export function useContractAmendments(contractId: string) {
  return useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from('contract_amendments')
        .select('id, kind, status, reason, created_at, created_by, changes')
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
              <p className="mt-1 text-muted-foreground">Motivo: {a.reason}</p>
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
