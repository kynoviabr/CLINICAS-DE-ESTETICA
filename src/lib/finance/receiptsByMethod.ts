import { paymentMethodLabel } from '@/lib/finance/installments';

/** Pagamento recebido (parcela paga). */
export type PaidRow = { paid_at: string | null; paid_amount: number | null; paid_method: string | null; payment_method: string | null };
/** Parcela em aberto (prevista). */
export type OpenRow = { due_date: string | null; amount: number; payment_method: string | null };

export type MethodSummary = {
  method: string;
  label: string;
  count: number;
  total: number;
  /** % do total recebido no mês. */
  pct: number;
  previousTotal: number;
  /** Ainda a receber no mês por esta forma (parcelas previstas que vencem no mês). */
  toReceive: number;
};

const ORDER = ['pix', 'card', 'cash', 'boleto', 'other'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Forma de pagamento do recebimento: a informada no pagamento; se faltar, a combinada no contrato. */
export const methodOf = (row: { paid_method?: string | null; payment_method?: string | null }) =>
  row.paid_method || row.payment_method || 'other';

const inMonth = (date: string | null, month: string) => !!date && date.slice(0, 7) === month;

/**
 * Recebimentos do mês por forma de pagamento, com o mês anterior para comparar
 * e o que ainda vai entrar no mês por cada forma.
 */
export function summarizeByMethod(paid: PaidRow[], open: OpenRow[], month: string, previousMonth: string, today: string) {
  const map = new Map<string, MethodSummary>();
  const get = (method: string) => {
    if (!map.has(method)) map.set(method, { method, label: paymentMethodLabel(method), count: 0, total: 0, pct: 0, previousTotal: 0, toReceive: 0 });
    return map.get(method)!;
  };
  paid.forEach((p) => {
    const value = Number(p.paid_amount || 0);
    if (inMonth(p.paid_at, month)) {
      const s = get(methodOf(p));
      s.total += value;
      s.count += 1;
    } else if (inMonth(p.paid_at, previousMonth)) {
      get(methodOf(p)).previousTotal += value;
    }
  });
  open.forEach((o) => {
    if (inMonth(o.due_date, month) && o.due_date! >= today) get(o.payment_method || 'other').toReceive += Number(o.amount || 0);
  });
  const total = r2([...map.values()].reduce((s, m) => s + m.total, 0));
  const list = [...map.values()]
    .map((m) => ({ ...m, total: r2(m.total), previousTotal: r2(m.previousTotal), toReceive: r2(m.toReceive), pct: total > 0 ? Math.round((m.total / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total || ORDER.indexOf(a.method) - ORDER.indexOf(b.method));
  return {
    methods: list,
    total,
    count: list.reduce((s, m) => s + m.count, 0),
    previousTotal: r2(list.reduce((s, m) => s + m.previousTotal, 0)),
    toReceive: r2(list.reduce((s, m) => s + m.toReceive, 0)),
  };
}

/** Variação em % (null quando não dá para comparar). */
export function variation(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
