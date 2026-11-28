import { describe, expect, it } from 'vitest';
import { cardSalePreview, type Terminal } from '@/lib/finance/terminals';

const base: Terminal = { id: 't', name: 'Stone', active: true, credit_mode: 'advance', advance_days: 1, debit_days: 1, debit_fee: 1.5, credit_1_fee: 3, credit_2_6_fee: 5, credit_7_12_fee: 7 };

describe('maquininhas: quanto e quando a clínica recebe', () => {
  it('antecipada: tudo em D+1 com a taxa da faixa', () => {
    const p = cardSalePreview(base, 'credit', 6, 1200, '2026-12-01');
    expect(p).toMatchObject({ feePct: 5, fee: 60, net: 1140, dates: ['2026-12-02'] });
  });
  it('no fluxo: uma data a cada 30 dias', () => {
    const p = cardSalePreview({ ...base, credit_mode: 'flow' }, 'credit', 3, 300, '2026-12-01');
    expect(p.dates).toEqual(['2026-12-31', '2027-01-30', '2027-03-01']);
    expect(p.net).toBe(285);
  });
  it('débito: taxa de débito e prazo de débito', () => {
    expect(cardSalePreview(base, 'debit', 1, 100, '2026-12-01')).toMatchObject({ feePct: 1.5, net: 98.5, dates: ['2026-12-02'] });
  });
});
