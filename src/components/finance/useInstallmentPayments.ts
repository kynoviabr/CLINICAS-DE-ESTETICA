import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ContractInstallment } from '@/lib/finance/installments';
import type { PaymentInput } from './RegisterPaymentDialog';

async function registerInstallmentPayment(
  id: string,
  payment: { paid_at: string; paid_amount: number; paid_method: string },
) {
  const { error } = await supabase
    .from('contract_installments')
    .update({ status: 'pago', ...payment })
    .eq('id', id);
  if (error) throw error;
}

/** Corrigir baixa lançada por engano: volta para "a receber", com motivo no histórico. */
async function correctInstallmentPayment(id: string, reason: string) {
  const { error } = await supabase.rpc('correct_installment_payment', { p_installment_id: id, p_reason: reason });
  if (error) throw error;
}

/** Estado e ações de baixa/estorno de parcelas, com atualização das telas que dependem delas. */
export function useInstallmentPayments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [paying, setPaying] = useState<ContractInstallment | null>(null);
  const [correcting, setCorrecting] = useState<ContractInstallment | null>(null);

  const refresh = () => {
    ['card-receivables', 'simple-finance', 'finance-contract-detail', 'finance-receivables', 'finance-contracts-matrix', 'dashboard-overdue', 'dashboard-growth', 'dashboard-funnel', 'dashboard-revenue-sessions-chart']
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };

  const register = useMutation({
    mutationFn: async (payment: PaymentInput) => {
      if (!paying) throw new Error('Nenhuma parcela selecionada');
      if (payment.kind === 'card') {
        const { error } = await supabase.rpc('register_card_sale', {
          p_installment_id: paying.id, p_terminal_id: payment.terminal_id, p_card_type: payment.card_type,
          p_installments: payment.installments, p_sale_date: payment.sale_date,
        });
        if (error) throw error;
        return;
      }
      const { kind: _kind, ...simple } = payment;
      return registerInstallmentPayment(paying.id, simple);
    },
    onSuccess: () => {
      toast({ title: 'Pagamento registrado' });
      setPaying(null);
      refresh();
    },
    onError: (err: Error) => toast({ title: 'Erro ao registrar pagamento', description: err.message, variant: 'destructive' }),
  });

  const undo = useMutation({
    mutationFn: (reason: string) => {
      if (!correcting) throw new Error('Nenhuma parcela selecionada');
      return correctInstallmentPayment(correcting.id, reason);
    },
    onSuccess: () => {
      toast({ title: 'Baixa corrigida', description: 'A parcela voltou para "a receber". A correção ficou no histórico.' });
      setCorrecting(null);
      refresh();
    },
    onError: (err: Error) => toast({ title: 'Erro ao corrigir a baixa', description: err.message, variant: 'destructive' }),
  });

  return { paying, setPaying, correcting, setCorrecting, register, undo };
}
