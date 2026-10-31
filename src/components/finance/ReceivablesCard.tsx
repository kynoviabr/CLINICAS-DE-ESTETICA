import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { todayIso, type ContractInstallment } from '@/lib/finance/installments';
import { InstallmentsTable } from './InstallmentsTable';

type Props = {
  clinicId: string | null;
  onRegister: (installment: ContractInstallment) => void;
  busy?: boolean;
};

/** Parcelas em aberto vencidas ou vencendo nos próximos 30 dias, mais antigas primeiro. */
export function ReceivablesCard({ clinicId, onRegister, busy }: Props) {
  const today = todayIso();
  const until = format(addDays(new Date(`${today}T12:00:00`), 30), 'yyyy-MM-dd');

  const { data = [], isLoading } = useQuery({
    queryKey: ['finance-receivables', clinicId, today],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('contract_installments')
        .select('id, contract_id, installment_number, installments_count, payment_method, due_date, amount, status, paid_at, paid_amount, paid_method, contracts!inner(contract_number, patients(full_name))')
        .eq('clinic_id', clinicId!)
        .eq('status', 'previsto')
        .lte('due_date', until)
        .order('due_date')
        .limit(100);
      if (error) throw error;
      return (rows || []).map((row) => ({
        ...row,
        contract_number: row.contracts?.contract_number ?? null,
        patient_name: row.contracts?.patients?.full_name ?? null,
      }));
    },
    enabled: !!clinicId,
  });

  const overdue = data.filter((row) => row.due_date && row.due_date < today);
  const overdueTotal = overdue.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <Card className="mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Parcelas a receber</p>
            <p className="text-xs text-muted-foreground">Em atraso e vencendo nos próximos 30 dias</p>
          </div>
          {overdue.length > 0 && (
            <p className="text-sm font-semibold text-destructive">
              {overdue.length} em atraso · {overdueTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <InstallmentsTable
            installments={data}
            showContract
            onRegister={onRegister}
            busy={busy}
            emptyText="Nenhuma parcela em aberto nos próximos 30 dias."
          />
        )}
      </CardContent>
    </Card>
  );
}
