import { describe, expect, it } from 'vitest';
import { groupTotals } from '@/lib/finance/breakdown';

describe('groupTotals', () => {
  it('soma por rótulo, ordena do maior para o menor e ignora zeros', () => {
    const rows = [
      { c: 'Aluguel', v: 2000 }, { c: 'Anúncios', v: 300 }, { c: 'Anúncios', v: 450 }, { c: 'Outros', v: 0 },
    ];
    expect(groupTotals(rows, (r) => r.c, (r) => r.v)).toEqual([['Aluguel', 2000], ['Anúncios', 750]]);
  });
});
