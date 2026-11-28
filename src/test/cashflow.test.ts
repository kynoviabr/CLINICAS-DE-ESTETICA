import { describe, expect, it } from 'vitest';
import { buildCashFlow, groupKey, type Movement } from '@/lib/finance/cashflow';

const mv: Movement[] = [
  { date: '2026-12-01', amount: 1140, realized: true, source: 'card', label: 'Stone' },
  { date: '2026-12-01', amount: -2000, realized: true, source: 'expense', label: 'Aluguel' },
  { date: '2026-12-03', amount: 300, realized: false, source: 'installment', label: 'Pix' },
  { date: '2026-12-10', amount: -500, realized: false, source: 'expense', label: 'Equipamento 1/10' },
];

describe('fluxo de caixa', () => {
  it('separa realizado e previsto e acumula o saldo a partir do saldo inicial', () => {
    const { rows, totals } = buildCashFlow(mv, 'day', 5000);
    expect(rows.map((r) => [r.key, r.net, r.balance])).toEqual([['2026-12-01', -860, 4140], ['2026-12-03', 300, 4440], ['2026-12-10', -500, 3940]]);
    expect(totals).toMatchObject({ inRealized: 1140, inForecast: 300, outRealized: 2000, outForecast: 500, net: -1060, balance: 3940 });
  });
  it('agrupa por semana (segunda a domingo) e por mês', () => {
    expect(groupKey('2026-12-03', 'week').key).toBe('2026-11-30');
    expect(buildCashFlow(mv, 'month').rows).toHaveLength(1);
    expect(groupKey('2026-12-03', 'month').label).toBe('dez/2026');
  });
});
