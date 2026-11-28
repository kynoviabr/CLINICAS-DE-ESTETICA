import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandButton } from '@/components/ui/brand-button';
import { useBranding } from '@/contexts/BrandingContext';
import { PAYMENT_METHOD_LABELS, RECEIPT_METHODS, todayIso, type ContractInstallment } from '@/lib/finance/installments';
import { cardSalePreview } from '@/lib/finance/terminals';
import { useTerminals } from './TerminalsDialog';

export type PaymentInput =
  | { kind: 'simple'; paid_at: string; paid_amount: number; paid_method: string }
  | { kind: 'card'; sale_date: string; terminal_id: string; card_type: 'credit' | 'debit'; installments: number };

type Props = {
  installment: ContractInstallment | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (payment: PaymentInput) => void;
  onOpenTerminals?: () => void;
};

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');

export function RegisterPaymentDialog({ installment, saving, onClose, onConfirm, onOpenTerminals }: Props) {
  const { clinicId } = useBranding();
  const { data: terminals = [] } = useTerminals(clinicId);
  const active = terminals.filter((t) => t.active);
  const [paidAt, setPaidAt] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('pix');
  const [terminalId, setTerminalId] = useState('');
  const [parts, setParts] = useState(1);

  useEffect(() => {
    if (!installment) return;
    setPaidAt(todayIso());
    setAmount(String(Number(installment.amount || 0).toFixed(2)));
    setMethod(installment.payment_method && PAYMENT_METHOD_LABELS[installment.payment_method] ? installment.payment_method : 'pix');
    setParts(Math.max(1, installment.installments_count || 1));
  }, [installment]);
  useEffect(() => { if (!terminalId && active.length === 1) setTerminalId(active[0].id); }, [active, terminalId]);

  // A venda no cartão quita todas as parcelas em aberto da mesma forma de pagamento do contrato.
  const { data: cardTotal } = useQuery({
    queryKey: ['card-sale-total', installment?.id],
    enabled: !!installment,
    queryFn: async () => {
      const { data: me } = await supabase.from('contract_installments').select('contract_id, payment_method_id').eq('id', installment!.id).maybeSingle();
      if (!me?.payment_method_id) return Number(installment!.amount || 0);
      const { data } = await supabase.from('contract_installments').select('amount').eq('contract_id', me.contract_id).eq('payment_method_id', me.payment_method_id).eq('status', 'previsto');
      return (data || []).reduce((sum, r) => sum + Number(r.amount), 0);
    },
  });
  const isCard = (method === 'credit' || method === 'debit') && active.length > 0;
  const terminal = active.find((t) => t.id === terminalId);
  const gross = Number(cardTotal || installment?.amount || 0);
  const preview = isCard && terminal ? cardSalePreview(terminal, method as 'credit' | 'debit', method === 'debit' ? 1 : parts, gross, paidAt) : null;

  const parsedAmount = Number(amount.replace(',', '.'));
  const valid = isCard ? !!terminal && !!paidAt : !!paidAt && Number.isFinite(parsedAmount) && parsedAmount >= 0;

  const confirm = () => {
    if (isCard && terminal) onConfirm({ kind: 'card', sale_date: paidAt, terminal_id: terminal.id, card_type: method as 'credit' | 'debit', installments: method === 'debit' ? 1 : parts });
    else onConfirm({ kind: 'simple', paid_at: paidAt, paid_amount: Math.round(parsedAmount * 100) / 100, paid_method: method });
  };

  return (
    <Dialog open={!!installment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Registrar pagamento {installment ? `· parcela ${installment.installment_number}/${installment.installments_count}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Forma</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[...RECEIPT_METHODS, ...(method === 'card' ? ['card'] : [])].map((value) => (
                  <SelectItem key={value} value={value}>{PAYMENT_METHOD_LABELS[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="paid-at">{isCard ? 'Data da venda na maquininha' : 'Data do pagamento'}</Label>
            <Input id="paid-at" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
          </div>

          {isCard ? (
            <>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div className="space-y-1">
                  <Label>Maquininha</Label>
                  <Select value={terminalId} onValueChange={setTerminalId}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{active.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Parcelas</Label>
                  <Input type="number" min={1} max={24} disabled={method === 'debit'} value={method === 'debit' ? 1 : parts} onChange={(e) => setParts(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p>Venda no cartão de <b>{brl(gross)}</b>{method === 'credit' ? ` em ${parts}x` : ' no débito'}. Quita as parcelas em aberto desta forma de pagamento.</p>
                {preview && (
                  <>
                    <p className="mt-1">Taxa da maquininha ({preview.feePct}%): − {brl(preview.fee)}</p>
                    <p className="font-semibold text-emerald-700">A clínica recebe {brl(preview.net)}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.dates.length === 1 ? `Cai em ${br(preview.dates[0])}.` : `Cai em ${preview.dates.length} parcelas: ${preview.dates.map(br).join(', ')}.`}
                    </p>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="paid-amount">Valor recebido (R$)</Label>
              <Input id="paid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {(method === 'credit' || method === 'debit') && (
                <p className="text-xs text-muted-foreground">
                  Cadastre suas maquininhas para ver a taxa e quando o dinheiro cai.{' '}
                  {onOpenTerminals && <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={onOpenTerminals}>Cadastrar maquininha</button>}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <BrandButton variant="outline" onClick={onClose} disabled={saving}>Cancelar</BrandButton>
            <BrandButton disabled={!valid || saving} onClick={confirm}>{saving ? 'Salvando...' : isCard ? 'Registrar venda no cartão' : 'Confirmar pagamento'}</BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
