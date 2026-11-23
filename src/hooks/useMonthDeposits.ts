import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEPOSIT_RECEIVED } from '@/lib/finance/deposit';

export type MonthDeposit = {
  id: string; amount: number; paid_at: string | null; status: string; receipt_number: string | null; client_name: string | null;
};

/** Sinais recebidos no período (pagos ou retidos). Os abatidos já estão nas parcelas pagas dos contratos. */
export function useMonthDeposits(clinicId: string | null | undefined, start: string, end: string) {
  const { data = [] } = useQuery({
    queryKey: ['deposits', 'month', clinicId, start],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('appointment_deposits')
        .select('id, amount, paid_at, status, receipt_number, patients(full_name), leads(full_name)')
        .eq('clinic_id', clinicId!).in('status', DEPOSIT_RECEIVED)
        .gte('paid_at', new Date(`${start}T00:00:00`).toISOString()).lte('paid_at', new Date(`${end}T23:59:59.999`).toISOString())
        .order('paid_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (rows || []).map((r) => {
        const rel = r as unknown as { patients?: { full_name?: string } | null; leads?: { full_name?: string } | null };
        return {
          id: r.id, amount: Number(r.amount), paid_at: r.paid_at, status: r.status, receipt_number: r.receipt_number,
          client_name: rel.patients?.full_name || rel.leads?.full_name || null,
        } as MonthDeposit;
      });
    },
    enabled: !!clinicId,
  });
  return data;
}
