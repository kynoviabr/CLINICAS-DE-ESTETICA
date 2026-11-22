import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CreditDeposit } from '@/lib/finance/deposit';

/** Sinais pagos da cliente (inclusive os pagos quando ela ainda era lead): o crédito que entra como adiantamento. */
export function usePatientDepositCredit(clinicId: string | null | undefined, patientId: string | null | undefined) {
  const { data = [] } = useQuery({
    queryKey: ['deposits', 'credit', clinicId, patientId],
    queryFn: async () => {
      const { data: leadRows } = await supabase.from('leads').select('id').eq('clinic_id', clinicId!).eq('patient_id', patientId!);
      const leadIds = (leadRows || []).map((l) => l.id);
      let q = supabase.from('appointment_deposits').select('id, amount, paid_at, payer_name, receipt_number')
        .eq('clinic_id', clinicId!).eq('status', 'paid');
      q = leadIds.length ? q.or(`patient_id.eq.${patientId},lead_id.in.(${leadIds.join(',')})`) : q.eq('patient_id', patientId!);
      const { data: rows, error } = await q.order('paid_at');
      if (error) throw error;
      return (rows || []).map((r) => ({ ...r, amount: Number(r.amount) })) as CreditDeposit[];
    },
    enabled: !!clinicId && !!patientId,
  });
  return data;
}
