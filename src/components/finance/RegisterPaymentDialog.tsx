import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandButton } from '@/components/ui/brand-button';
import { PAYMENT_METHOD_LABELS, todayIso, type ContractInstallment } from '@/lib/finance/installments';

type Props = {
  installment: ContractInstallment | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (payment: { paid_at: string; paid_amount: number; paid_method: string }) => void;
};

export function RegisterPaymentDialog({ installment, saving, onClose, onConfirm }: Props) {
  const [paidAt, setPaidAt] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('pix');

  useEffect(() => {
    if (!installment) return;
    setPaidAt(todayIso());
    setAmount(String(Number(installment.amount || 0).toFixed(2)));
    setMethod(installment.payment_method && PAYMENT_METHOD_LABELS[installment.payment_method] ? installment.payment_method : 'pix');
  }, [installment]);

  const parsedAmount = Number(amount.replace(',', '.'));
  const valid = !!paidAt && Number.isFinite(parsedAmount) && parsedAmount >= 0;

  return (
    <Dialog open={!!installment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Registrar pagamento {installment ? `· parcela ${installment.installment_number}/${installment.installments_count}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="paid-at">Data do pagamento</Label>
            <Input id="paid-at" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="paid-amount">Valor recebido (R$)</Label>
            <Input id="paid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Forma</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <BrandButton variant="outline" onClick={onClose} disabled={saving}>Cancelar</BrandButton>
            <BrandButton
              disabled={!valid || saving}
              onClick={() => onConfirm({ paid_at: paidAt, paid_amount: Math.round(parsedAmount * 100) / 100, paid_method: method })}
            >
              {saving ? 'Salvando...' : 'Confirmar pagamento'}
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
