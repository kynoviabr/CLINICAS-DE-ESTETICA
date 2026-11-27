import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Receivable = {
  id: string; sale_id: string; terminal_name: string; card_type: string; kind: string; sale_date: string; installments_count: number; number: number;
  gross: number; fee_amount: number; net: number; expected_date: string; status: string; received_at: string | null; contract_id: string | null;
  contracts?: { contract_number: string | null; patients?: { full_name: string | null } | null } | null;
};

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** O que a operadora vai depositar (líquido, na data real) e o que já caiu. */
export function CardReceivablesCard({ clinicId, onOpenTerminals }: { clinicId: string; onOpenTerminals: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reverse, setReverse] = useState<{ saleId: string; label: string } | null>(null);
  const [kind, setKind] = useState<'refund' | 'chargeback'>('refund');
  const [reason, setReason] = useState('');

  const { data: rows = [] } = useQuery({
    queryKey: ['card-receivables', clinicId],
    queryFn: async () => {
      const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('card_receivables')
        .select('id, sale_id, terminal_name, card_type, kind, sale_date, installments_count, number, gross, fee_amount, net, expected_date, status, received_at, contract_id, contracts(contract_number, patients(full_name))')
        .eq('clinic_id', clinicId).neq('status', 'cancelled').or(`status.eq.expected,expected_date.gte.${since}`)
        .order('expected_date').limit(200);
      if (error) throw error;
      return (data || []) as unknown as Receivable[];
    },
  });
  const expected = rows.filter((r) => r.status === 'expected');
  const totals = useMemo(() => {
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return {
      next30: expected.filter((r) => r.expected_date <= in30).reduce((s, r) => s + Number(r.net), 0),
      all: expected.reduce((s, r) => s + Number(r.net), 0),
    };
  }, [expected]);
  const reversedSales = new Set(rows.filter((r) => r.kind === 'reversal').map((r) => r.sale_id));

  const refresh = () => ['card-receivables', 'dre', 'simple-finance', 'contract-refunds'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const received = async (r: Receivable) => {
    const { error } = await supabase.rpc('mark_card_receivable_received', { p_receivable_id: r.id, p_received_at: today() });
    if (error) { toast({ title: 'Não foi possível marcar', description: error.message, variant: 'destructive' }); return; }
    refresh();
  };
  const doReverse = async () => {
    if (!reverse) return;
    const { error } = await supabase.rpc('reverse_card_sale', { p_sale_id: reverse.saleId, p_kind: kind, p_reason: reason.trim() });
    if (error) { toast({ title: 'Não foi possível estornar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: kind === 'refund' ? 'Estorno registrado' : 'Contestação registrada', description: 'O que não caiu foi cancelado; o que já caiu virou débito da operadora.' });
    setReverse(null); setReason('');
    refresh();
  };

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-primary" /> A receber das maquininhas</p>
            <p className="text-xs text-muted-foreground">Valor líquido (já sem a taxa), na data em que a operadora deposita.</p>
          </div>
          <BrandButton size="sm" variant="outline" onClick={onOpenTerminals}>Maquininhas</BrandButton>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Próximos 30 dias</p><p className="font-semibold">{brl(totals.next30)}</p></div>
          <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Total a receber</p><p className="font-semibold">{brl(totals.all)}</p></div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no cartão registrada com maquininha ainda.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className={`font-medium ${Number(r.net) < 0 ? 'text-rose-700' : ''}`}>
                    {brl(Number(r.net))} · {br(r.expected_date)}
                    {r.status === 'received' && <span className="ml-2 text-xs font-normal text-emerald-700">caiu em {br(r.received_at)}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.kind === 'reversal' ? 'Débito por estorno/contestação' : `${r.terminal_name} · ${r.card_type === 'debit' ? 'débito' : `crédito ${r.number}/${r.installments_count}`} · bruto ${brl(Number(r.gross))} · taxa ${brl(Number(r.fee_amount))}`}
                    {r.contracts?.patients?.full_name ? ` · ${r.contracts.patients.full_name}` : ''}{r.contracts?.contract_number ? ` (${r.contracts.contract_number})` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  {r.status === 'expected' && <BrandButton size="sm" variant="outline" onClick={() => received(r)}>Caiu na conta</BrandButton>}
                  {r.kind === 'sale' && r.number === 1 && !reversedSales.has(r.sale_id) && (
                    <BrandButton size="sm" variant="ghost" title="Estorno no cartão ou contestação" onClick={() => setReverse({ saleId: r.sale_id, label: `${r.terminal_name} · venda de ${br(r.sale_date)}` })}><Undo2 className="h-4 w-4" /></BrandButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!reverse} onOpenChange={(v) => { if (!v) setReverse(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Estorno ou contestação no cartão</DialogTitle>
            <DialogDescription>{reverse?.label}. O que ainda não caiu é cancelado; o que já caiu vira débito no próximo repasse. O valor volta ao paciente e entra como devolução no DRE. A taxa da operadora, em geral, não volta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'refund' | 'chargeback')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refund">Estorno pedido pela clínica</SelectItem>
                  <SelectItem value="chargeback">Contestação do cliente (chargeback)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo (obrigatório)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: paciente desistiu antes da primeira sessão" />
            </div>
            <div className="flex justify-end gap-2">
              <BrandButton variant="ghost" onClick={() => setReverse(null)}>Voltar</BrandButton>
              <BrandButton disabled={reason.trim().length < 5} onClick={doReverse}>Registrar</BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
