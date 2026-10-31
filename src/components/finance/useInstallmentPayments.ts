import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ContractInstallment } from '@/lib/finance/installments';

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

async function undoInstallmentPayment(id: string) {
  const { error } = await supabase
    .from('contract_installments')
    .update({ status: 'previsto', paid_at: null, paid_amount: null, paid_method: null })
    .eq('id', id);
  if (error) throw error;
}

/** Estado e ações de baixa/estorno de parcelas, com atualização das telas que dependem delas. */
export function useInstallmentPayments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [paying, setPaying] = useState<ContractInstallment | null>(null);

  const refresh = () => {
    ['finance-contract-detail', 'finance-receivables', 'finance-contracts-matrix', 'dashboard-overdue', 'dashboard-growth', 'dashboard-funnel', 'dashboard-revenue-sessions-chart']
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };

  const register = useMutation({
    mutationFn: (payment: { paid_at: string; paid_amount: number; paid_method: string }) => {
      if (!paying) throw new Error('Nenhuma parcela selecionada');
      return registerInstallmentPayment(paying.id, payment);
    },
    onSuccess: () => {
      toast({ title: 'Pagamento registrado' });
      setPaying(null);
      refresh();
    },
    onError: (err: Error) => toast({ title: 'Erro ao registrar pagamento', description: err.message, variant: 'destructive' }),
  });

  const undo = useMutation({
    mutationFn: (installment: ContractInstallment) => undoInstallmentPayment(installment.id),
    onSuccess: () => {
      toast({ title: 'Pagamento estornado' });
      refresh();
    },
    onError: (err: Error) => toast({ title: 'Erro ao estornar', description: err.message, variant: 'destructive' }),
  });

  return { paying, setPaying, register, undo };
}
