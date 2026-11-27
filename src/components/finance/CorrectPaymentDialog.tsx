import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ContractInstallment } from '@/lib/finance/installments';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Corrigir baixa: para pagamento registrado por engano (parcela errada, valor errado).
 * Não é devolução de dinheiro ao paciente: devolução fica no cancelamento do contrato ou no sinal.
 */
export function CorrectPaymentDialog({ installment, busy, onCancel, onConfirm }: {
  installment: ContractInstallment | null; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (installment) setReason(''); }, [installment]);
  return (
    <Dialog open={!!installment} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Corrigir baixa</DialogTitle>
          <DialogDescription>
            Use quando o pagamento foi registrado por engano. A parcela volta para "a receber" e a correção fica no histórico.
            Para devolver dinheiro ao paciente, use o cancelamento do contrato.
          </DialogDescription>
        </DialogHeader>
        {installment && (
          <p className="rounded-md bg-muted p-3 text-sm">
            Parcela {installment.installment_number}/{installment.installments_count} · pago {brl(Number(installment.paid_amount || 0))}
            {installment.paid_at ? ` em ${installment.paid_at.split('-').reverse().join('/')}` : ''}
          </p>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Motivo (obrigatório)</Label>
          <Textarea rows={2} placeholder="Ex.: baixa lançada na parcela errada" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <BrandButton variant="ghost" onClick={onCancel}>Voltar</BrandButton>
          <BrandButton disabled={reason.trim().length < 5 || busy} onClick={() => onConfirm(reason.trim())}>{busy ? 'Corrigindo…' : 'Corrigir baixa'}</BrandButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
