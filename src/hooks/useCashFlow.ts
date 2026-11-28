import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Movement } from '@/lib/finance/cashflow';

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const startOf = (iso: string) => new Date(`${iso}T00:00:00`).toISOString();
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999`).toISOString();
const name = (r: { contracts?: { patients?: { full_name?: string | null } | null } | null }) => r.contracts?.patients?.full_name || 'Paciente';

/**
 * Movimentos do caixa no período:
 * - Entradas: parcelas pagas em Pix/dinheiro/boleto/transferência (data do pagamento); cartão pelo que a maquininha
 *   deposita (líquido, na data real); sinais recebidos. Previstas: parcelas a receber e recebíveis das maquininhas.
 * - Saídas: contas pagas (data do pagamento) e a pagar (vencimento); devoluções a pacientes; sinais devolvidos.
 * Atrasados (vencidos e não pagos/recebidos) entram como previsão para hoje.
 */
export function useCashFlow(clinicId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['cash-flow', clinicId, from, to],
    enabled: !!clinicId,
    queryFn: async (): Promise<Movement[]> => {
      const id = clinicId!;
      const today = todayIso();
      const [paid, open, cardIn, cardExp, depIn, depOut, expPaid, expOpen, refPaid, refOpen] = await Promise.all([
        supabase.from('contract_installments').select('paid_at, paid_amount, paid_method, notes, contracts(patients(full_name))')
          .eq('clinic_id', id).eq('status', 'pago').gte('paid_at', from).lte('paid_at', to).limit(5000),
        supabase.from('contract_installments').select('due_date, amount, payment_method, contracts(patients(full_name))')
          .eq('clinic_id', id).eq('status', 'previsto').lte('due_date', to).limit(5000),
        supabase.from('card_receivables').select('received_at, net, terminal_name').eq('clinic_id', id).eq('status', 'received').gte('received_at', from).lte('received_at', to).limit(5000),
        supabase.from('card_receivables').select('expected_date, net, terminal_name').eq('clinic_id', id).eq('status', 'expected').lte('expected_date', to).limit(5000),
        supabase.from('appointment_deposits').select('paid_at, amount').eq('clinic_id', id).in('status', ['paid', 'retained', 'refunded'])
          .gte('paid_at', startOf(from)).lte('paid_at', endOf(to)).limit(5000),
        supabase.from('appointment_deposits').select('updated_at, amount').eq('clinic_id', id).eq('status', 'refunded')
          .gte('updated_at', startOf(from)).lte('updated_at', endOf(to)).limit(5000),
        supabase.from('expenses').select('paid_at, amount, category, supplier').eq('clinic_id', id).eq('paid', true).gte('paid_at', from).lte('paid_at', to).limit(5000),
        supabase.from('expenses').select('due_date, amount, category, supplier').eq('clinic_id', id).eq('paid', false).lte('due_date', to).limit(5000),
        supabase.from('contract_refunds').select('paid_at, amount, paid_method').eq('clinic_id', id).eq('status', 'paid').gte('paid_at', from).lte('paid_at', to).limit(5000),
        supabase.from('contract_refunds').select('amount').eq('clinic_id', id).eq('status', 'pending').limit(5000),
      ]);
      for (const r of [paid, open, cardIn, cardExp, depIn, depOut, expPaid, expOpen, refPaid, refOpen]) if (r.error) throw r.error;

      const forecastDate = (d: string) => (d < today ? today : d);
      const inRange = (d: string) => d >= from && d <= to;
      const out: Movement[] = [];
      // Venda registrada na maquininha entra pelo recebível (líquido), não pela parcela.
      (paid.data || []).filter((r) => !(r.notes || '').startsWith('Cartão (')).forEach((r) =>
        out.push({ date: r.paid_at!, amount: Number(r.paid_amount || 0), realized: true, source: 'installment', label: `${name(r)} · ${r.paid_method || ''}` }));
      (open.data || []).forEach((r) => { const d = forecastDate(r.due_date!); if (inRange(d)) out.push({ date: d, amount: Number(r.amount), realized: false, source: 'installment', label: `${name(r)}${r.due_date! < today ? ' (atrasada)' : ''}` }); });
      (cardIn.data || []).forEach((r) => out.push({ date: r.received_at!, amount: Number(r.net), realized: true, source: 'card', label: r.terminal_name }));
      (cardExp.data || []).forEach((r) => { const d = forecastDate(r.expected_date); if (inRange(d)) out.push({ date: d, amount: Number(r.net), realized: false, source: 'card', label: r.terminal_name }); });
      (depIn.data || []).forEach((r) => out.push({ date: r.paid_at!.slice(0, 10), amount: Number(r.amount), realized: true, source: 'deposit', label: 'Sinal' }));
      (depOut.data || []).forEach((r) => out.push({ date: r.updated_at.slice(0, 10), amount: -Number(r.amount), realized: true, source: 'refund', label: 'Sinal devolvido' }));
      (expPaid.data || []).forEach((r) => out.push({ date: r.paid_at!, amount: -Number(r.amount), realized: true, source: 'expense', label: r.supplier || r.category }));
      (expOpen.data || []).forEach((r) => { const d = forecastDate(r.due_date!); if (inRange(d)) out.push({ date: d, amount: -Number(r.amount), realized: false, source: 'expense', label: `${r.supplier || r.category}${r.due_date! < today ? ' (vencida)' : ''}` }); });
      // Estorno no cartão já sai pelos recebíveis (cancelados ou débito); aqui só devoluções em dinheiro/Pix/transferência.
      (refPaid.data || []).filter((r) => r.paid_method !== 'card_reversal').forEach((r) => out.push({ date: r.paid_at!, amount: -Number(r.amount), realized: true, source: 'refund', label: 'Devolução a paciente' }));
      if (inRange(today)) (refOpen.data || []).forEach((r) => out.push({ date: today, amount: -Number(r.amount), realized: false, source: 'refund', label: 'Devolução pendente' }));
      return out;
    },
  });
}
