import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { shiftMonth, type MonthKey } from '@/lib/finance/simpleFinance';
import type { MonthInput } from '@/lib/finance/dre';

const empty = (): MonthInput => ({ received: 0, materialUsed: 0, materialLost: 0, expenses: [] });

/**
 * Dados do DRE do mês escolhido, do mês anterior e de janeiro até o mês (acumulado do ano).
 * Recebido = parcelas pagas no mês (igual ao Financeiro). Material = baixas do estoque pelo custo da baixa.
 */
export function useDreData(clinicId: string | null | undefined, month: MonthKey) {
  return useQuery({
    queryKey: ['dre', clinicId, month],
    queryFn: async () => {
      const prev = shiftMonth(month, -1);
      const yearStart = `${month.slice(0, 4)}-01`;
      const from = prev < yearStart ? prev : yearStart;
      const fromDate = `${from}-01`;
      const toDate = format(endOfMonth(parseISO(`${month}-01`)), 'yyyy-MM-dd');

      await supabase.rpc('ensure_recurring_expenses', { p_clinic_id: clinicId!, p_month: `${month}-01` });
      const [paidRes, expRes, stockRes] = await Promise.all([
        supabase.from('contract_installments').select('paid_at, paid_amount')
          .eq('clinic_id', clinicId!).eq('status', 'pago').gte('paid_at', fromDate).lte('paid_at', toDate).limit(5000),
        supabase.from('expenses').select('category, amount, expense_date')
          .eq('clinic_id', clinicId!).gte('expense_date', fromDate).lte('expense_date', toDate).limit(5000),
        supabase.from('stock_movements').select('kind, quantity, unit_cost, created_at')
          .eq('clinic_id', clinicId!).in('kind', ['consumo', 'perda', 'ajuste'])
          .gte('created_at', `${fromDate}T00:00:00`).lte('created_at', `${toDate}T23:59:59`).limit(10000),
      ]);
      for (const res of [paidRes, expRes, stockRes]) if (res.error) throw res.error;

      const months = new Map<MonthKey, MonthInput>();
      const get = (m: MonthKey) => { if (!months.has(m)) months.set(m, empty()); return months.get(m)!; };
      (paidRes.data || []).forEach((r) => { if (r.paid_at) get(r.paid_at.slice(0, 7)).received += Number(r.paid_amount || 0); });
      (expRes.data || []).forEach((r) => get(r.expense_date.slice(0, 7)).expenses.push({ category: r.category, amount: Number(r.amount) }));
      (stockRes.data || []).forEach((r) => {
        const value = -Number(r.quantity) * Number(r.unit_cost || 0);
        if (value <= 0) return; // ajuste para mais não é custo
        const m = get(format(new Date(r.created_at), 'yyyy-MM'));
        if (r.kind === 'consumo') m.materialUsed += value;
        else m.materialLost += value;
      });

      const monthsOfYear: MonthKey[] = [];
      for (let m = yearStart; m <= month; m = shiftMonth(m, 1)) monthsOfYear.push(m);
      return {
        current: months.get(month) ?? empty(),
        previous: months.get(prev) ?? empty(),
        yearMonths: monthsOfYear.map((m) => months.get(m) ?? empty()),
      };
    },
    enabled: !!clinicId,
  });
}
