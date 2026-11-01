import { describe, expect, it } from 'vitest';
import { resolvePeriod } from '@/lib/commercial/period';
import { buildSellerPerformance } from '@/lib/commercial/sellerPerformance';

const today = new Date(2026, 10, 15, 10, 0); // 15/11/2026

describe('resolvePeriod', () => {
  it('mês atual tem meta mensal', () => {
    const p = resolvePeriod('mes', null, null, today);
    expect(p.goalMonth).toBe('2026-11');
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getDate()).toBe(30);
  });

  it('mês anterior', () => {
    expect(resolvePeriod('mes-anterior', null, null, today).goalMonth).toBe('2026-10');
  });

  it('últimos 7 dias não tem meta', () => {
    const p = resolvePeriod('7d', null, null, today);
    expect(p.goalMonth).toBeNull();
    expect(p.start.getDate()).toBe(9);
  });

  it('personalizado de mês inteiro usa a meta do mês', () => {
    expect(resolvePeriod('personalizado', '2026-09-01', '2026-09-30', today).goalMonth).toBe('2026-09');
    expect(resolvePeriod('personalizado', '2026-09-01', '2026-09-20', today).goalMonth).toBeNull();
  });

  it('personalizado inválido volta para o mês atual', () => {
    expect(resolvePeriod('personalizado', '2026-09-30', '2026-09-01', today).goalMonth).toBe('2026-11');
    expect(resolvePeriod('personalizado', 'xx', null, today).goalMonth).toBe('2026-11');
  });
});

describe('buildSellerPerformance', () => {
  const past = '2026-11-10T10:00:00Z';
  const future = '2026-11-20T10:00:00Z';

  it('calcula conversão por vendedor, ignorando canceladas, futuras e faltas', () => {
    const rows = buildSellerPerformance(
      [
        { sellerId: 'a', status: 'completed', startTime: past, converted: true },
        { sellerId: 'a', status: 'completed', startTime: past, converted: false },
        { sellerId: 'a', status: 'scheduled', startTime: past, converted: true },
        { sellerId: 'a', status: 'cancelled', startTime: past, converted: false },
        { sellerId: 'a', status: 'scheduled', startTime: future, converted: false },
        { sellerId: 'a', status: 'no_show', startTime: past, converted: false },
        { sellerId: null, status: 'completed', startTime: past, converted: true },
      ],
      [{ sellerId: 'a', amount: 1000 }, { sellerId: 'b', amount: 3000 }],
      { a: 2000 },
      today,
    );
    const a = rows.find((r) => r.sellerId === 'a')!;
    expect(a).toMatchObject({ evaluations: 3, converted: 2, conversionRate: 67, noShow: 1, salesTotal: 1000, goalAmount: 2000, goalPct: 50 });
    const b = rows.find((r) => r.sellerId === 'b')!;
    expect(b).toMatchObject({ evaluations: 0, conversionRate: null, salesTotal: 3000, goalAmount: null });
    expect(rows[0].sellerId).toBe('b');
  });

  it('sem metas (período não mensal) não mostra % de meta', () => {
    const rows = buildSellerPerformance([], [{ sellerId: 'a', amount: 500 }], null, today);
    expect(rows[0].goalPct).toBeNull();
  });

  it('vendedor só com meta aparece com zero', () => {
    const rows = buildSellerPerformance([], [], { c: 1000 }, today);
    expect(rows[0]).toMatchObject({ sellerId: 'c', salesTotal: 0, goalPct: 0 });
  });
});
