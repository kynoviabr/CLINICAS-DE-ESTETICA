import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreakdownBars } from '@/components/finance/BreakdownBars';
import { groupTotals } from '@/lib/finance/breakdown';
import { paymentMethodLabel } from '@/lib/finance/installments';
import { monthBounds } from '@/lib/finance/simpleFinance';
import { formatBRL } from '@/lib/proposals/sale';

type Received = { paid_method?: string | null; payment_method?: string | null; paid_amount?: number | null; amount: number | string };

/**
 * Financeiro: receitas (recebidas, por forma de pagamento) e despesas (por categoria) do mês, lado a lado,
 * com o resultado do mês. Mesmas barras da tela de Despesas.
 */
export function MonthCashPanel({ clinicId, month, received, showExpenses }: {
  clinicId: string; month: string; received: Received[]; showExpenses: boolean;
}) {
  const qc = useQueryClient();
  const { start, end } = monthBounds(month);

  // Despesas fixas ("repete todo mês") entram sozinhas no mês, como na tela de Despesas.
  useEffect(() => {
    if (!showExpenses) return;
    supabase.rpc('ensure_recurring_expenses', { p_clinic_id: clinicId, p_month: start }).then(({ data }) => {
      if (Number(data) > 0) qc.invalidateQueries({ queryKey: ['expenses'] });
    });
  }, [clinicId, start, showExpenses, qc]);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', clinicId, month],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*')
        .eq('clinic_id', clinicId).gte('expense_date', start).lte('expense_date', end).order('expense_date');
      if (error) throw error;
      return data;
    },
    enabled: showExpenses,
  });

  const incomeRows = useMemo(
    () => groupTotals(received, (r) => paymentMethodLabel(r.paid_method || r.payment_method || null), (r) => Number(r.paid_amount ?? r.amount)),
    [received],
  );
  const expenseRows = useMemo(() => groupTotals(expenses, (e) => e.category, (e) => Number(e.amount)), [expenses]);
  const income = incomeRows.reduce((s, [, v]) => s + v, 0);
  const spent = expenseRows.reduce((s, [, v]) => s + v, 0);
  const toPay = expenses.filter((e) => !e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const result = income - spent;

  return (
    <section aria-label="Receitas e despesas do mês" className="space-y-3">
      {showExpenses && (
        <Card className="border-slate-200 bg-white/95 shadow-sm">
          <CardContent className="p-3">
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-600">
              <div className="flex items-baseline gap-1.5"><dt>Receitas</dt><dd className="font-semibold text-slate-900">{formatBRL(income)}</dd></div>
              <div className="flex items-baseline gap-1.5"><dt>Despesas</dt><dd className="font-semibold text-slate-900">{formatBRL(spent)}</dd></div>
              <div className="flex items-baseline gap-1.5">
                <dt>Resultado do mês</dt>
                <dd className={`font-semibold ${result < 0 ? 'text-destructive' : 'text-emerald-700'}`}>{formatBRL(result)}</dd>
              </div>
              <p className="text-xs text-slate-500">Recebido no mês menos as despesas lançadas (pagas e a pagar).</p>
            </dl>
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-1 gap-3 ${showExpenses ? 'lg:grid-cols-2' : ''}`}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" aria-hidden /> Receitas do mês
              </CardTitle>
              <Link to={`/clinic/financeiro/recebimentos?mes=${month}`} className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ver recebimentos</Link>
            </div>
            <p className="text-2xl font-heading font-semibold">{formatBRL(income)}</p>
            <p className="text-xs text-muted-foreground">Parcelas recebidas, por forma de pagamento</p>
          </CardHeader>
          <CardContent>
            {incomeRows.length === 0
              ? <p className="text-sm text-muted-foreground">Nenhum recebimento neste mês ainda. Ao marcar uma parcela como "Recebi", ela entra aqui.</p>
              : <BreakdownBars rows={incomeRows} barClassName="bg-emerald-500" />}
          </CardContent>
        </Card>

        {showExpenses && (
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowDownRight className="h-4 w-4 text-destructive" aria-hidden /> Despesas do mês
                </CardTitle>
                <Link to={`/clinic/despesas?mes=${month}`} className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ver despesas</Link>
              </div>
              <p className="text-2xl font-heading font-semibold">{formatBRL(spent)}</p>
              <p className="text-xs text-muted-foreground">
                Por categoria{toPay > 0 && <> · <span className="font-medium text-amber-700">{formatBRL(toPay)} ainda a pagar</span></>}
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
                : expenseRows.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhuma despesa lançada neste mês. Lance aluguel, contador e anúncios em Despesas.</p>
                  : <BreakdownBars rows={expenseRows} barClassName="bg-rose-400" />}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
