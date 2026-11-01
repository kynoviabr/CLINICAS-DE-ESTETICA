export interface EvaluationInput {
  /** Vendedor responsável (lead.assigned_to, ou quem agendou). */
  sellerId: string | null;
  status: string;
  startTime: string;
  converted: boolean;
}

export interface SaleInput {
  sellerId: string | null;
  amount: number;
}

export interface SellerPerformanceRow {
  sellerId: string;
  evaluations: number;
  converted: number;
  /** % de avaliações realizadas que viraram venda. null quando não houve avaliação. */
  conversionRate: number | null;
  noShow: number;
  salesTotal: number;
  salesCount: number;
  goalAmount: number | null;
  goalPct: number | null;
}

const IGNORED = new Set(['cancelled', 'rescheduled']);

/**
 * Junta avaliações, vendas e metas por vendedor.
 * - Avaliações canceladas/remarcadas e as que ainda vão acontecer não contam.
 * - Falta (no_show) conta à parte e não entra na taxa de conversão.
 * - goals = null quando o período não é um mês fechado (metas são mensais).
 */
export function buildSellerPerformance(
  evaluations: EvaluationInput[],
  sales: SaleInput[],
  goals: Record<string, number> | null,
  now = new Date(),
): SellerPerformanceRow[] {
  const rows = new Map<string, SellerPerformanceRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { sellerId: id, evaluations: 0, converted: 0, conversionRate: null, noShow: 0, salesTotal: 0, salesCount: 0, goalAmount: null, goalPct: null };
      rows.set(id, r);
    }
    return r;
  };

  for (const ev of evaluations) {
    if (!ev.sellerId || IGNORED.has(ev.status)) continue;
    if (new Date(ev.startTime) > now) continue;
    const r = row(ev.sellerId);
    if (ev.status === 'no_show') {
      r.noShow += 1;
      continue;
    }
    r.evaluations += 1;
    if (ev.converted) r.converted += 1;
  }

  for (const s of sales) {
    if (!s.sellerId) continue;
    const r = row(s.sellerId);
    r.salesTotal += s.amount;
    r.salesCount += 1;
  }

  if (goals) {
    for (const [id, amount] of Object.entries(goals)) {
      if (amount > 0) row(id).goalAmount = amount;
    }
  }

  for (const r of rows.values()) {
    r.conversionRate = r.evaluations > 0 ? Math.round((r.converted / r.evaluations) * 100) : null;
    r.goalPct = r.goalAmount ? Math.round((r.salesTotal / r.goalAmount) * 100) : null;
  }

  return [...rows.values()].sort((a, b) => b.salesTotal - a.salesTotal || b.converted - a.converted);
}
