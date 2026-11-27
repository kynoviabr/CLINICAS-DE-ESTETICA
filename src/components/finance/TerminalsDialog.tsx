import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeTerminal, type Terminal } from '@/lib/finance/terminals';

const EMPTY: Omit<Terminal, 'id'> = { name: '', active: true, credit_mode: 'advance', advance_days: 1, debit_days: 1, debit_fee: 0, credit_1_fee: 0, credit_2_6_fee: 0, credit_7_12_fee: 0 };

export function useTerminals(clinicId: string | null | undefined) {
  return useQuery({
    queryKey: ['payment-terminals', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_terminals').select('*').eq('clinic_id', clinicId!).order('name');
      if (error) throw error;
      return (data || []) as Terminal[];
    },
  });
}

/** Maquininhas da clínica: o que ela fechou com cada operadora (taxa e prazo). */
export function TerminalsDialog({ clinicId, open, onOpenChange }: { clinicId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: terminals = [] } = useTerminals(clinicId);
  const [editing, setEditing] = useState<(Omit<Terminal, 'id'> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing || editing.name.trim().length < 2) return;
    setSaving(true);
    const row = { ...editing, name: editing.name.trim(), clinic_id: clinicId, updated_at: new Date().toISOString() };
    const { error } = editing.id
      ? await supabase.from('payment_terminals').update(row).eq('id', editing.id)
      : await supabase.from('payment_terminals').insert(row);
    setSaving(false);
    if (error) { toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Maquininha salva' });
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['payment-terminals', clinicId] });
  };
  const num = (key: keyof Terminal) => (e: React.ChangeEvent<HTMLInputElement>) => setEditing((c) => c && ({ ...c, [key]: Number(e.target.value.replace(',', '.')) || 0 }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setEditing(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Maquininhas</DialogTitle>
          <DialogDescription>Cadastre o que a clínica fechou com cada operadora. Assim o sistema mostra quanto você recebe de verdade e quando.</DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="space-y-2">
            {terminals.length === 0 && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Nenhuma maquininha cadastrada ainda.</p>}
            {terminals.map((t) => (
              <div key={t.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${t.active ? '' : 'opacity-60'}`}>
                <div>
                  <p className="font-medium">{t.name}{!t.active && ' (desativada)'}</p>
                  <p className="text-xs text-muted-foreground">
                    Débito {t.debit_fee}% em D+{t.debit_days} · Crédito à vista {t.credit_1_fee}% · 2–6x {t.credit_2_6_fee}% · 7–12x {t.credit_7_12_fee}% · {describeTerminal(t)}
                  </p>
                </div>
                <BrandButton size="sm" variant="outline" onClick={() => setEditing({ ...t })}><Pencil className="h-4 w-4" /> Editar</BrandButton>
              </div>
            ))}
            <BrandButton size="sm" onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" /> Nova maquininha</BrandButton>
          </div>
        )}

        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input placeholder="Ex.: Stone da recepção" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Situação</Label>
                <Select value={editing.active ? 'on' : 'off'} onValueChange={(v) => setEditing({ ...editing, active: v === 'on' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="on">Ativa</SelectItem><SelectItem value="off">Desativada</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Taxas (%) que a clínica fechou</p>
              <p className="text-xs text-muted-foreground">Se você tem antecipação automática, coloque a taxa total (já com a antecipação).</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1"><Label className="text-xs">Débito</Label><Input inputMode="decimal" value={editing.debit_fee} onChange={num('debit_fee')} /></div>
                <div className="space-y-1"><Label className="text-xs">Crédito à vista</Label><Input inputMode="decimal" value={editing.credit_1_fee} onChange={num('credit_1_fee')} /></div>
                <div className="space-y-1"><Label className="text-xs">Crédito 2 a 6x</Label><Input inputMode="decimal" value={editing.credit_2_6_fee} onChange={num('credit_2_6_fee')} /></div>
                <div className="space-y-1"><Label className="text-xs">Crédito 7 a 12x</Label><Input inputMode="decimal" value={editing.credit_7_12_fee} onChange={num('credit_7_12_fee')} /></div>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Quando o dinheiro cai na conta</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Crédito</Label>
                  <Select value={editing.credit_mode} onValueChange={(v) => setEditing({ ...editing, credit_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advance">Antecipado (tudo de uma vez)</SelectItem>
                      <SelectItem value="flow">No fluxo (uma parcela a cada 30 dias)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Antecipação: dias para cair (D+)</Label>
                  <Input type="number" min={0} max={90} disabled={editing.credit_mode !== 'advance'} value={editing.advance_days} onChange={num('advance_days')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Débito: dias para cair (D+)</Label>
                  <Input type="number" min={0} max={30} value={editing.debit_days} onChange={num('debit_days')} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <BrandButton variant="ghost" onClick={() => setEditing(null)}>Voltar</BrandButton>
              <BrandButton disabled={editing.name.trim().length < 2 || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar maquininha'}</BrandButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
