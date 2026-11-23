import { describe, expect, it } from 'vitest';
import { methodOf, summarizeByMethod, variation } from '@/lib/finance/receiptsByMethod';

const paid = (paid_at: string, paid_amount: number, paid_method: string | null, payment_method: string | null = null) =>
  ({ paid_at, paid_amount, paid_method, payment_method });

describe('recebimentos por forma de pagamento', () => {
  const rows = [
    paid('2026-11-02', 500, 'pix'),
    paid('2026-11-03', 300, 'pix'),
    paid('2026-11-04', 1200, 'card'),
    paid('2026-11-05', 100, 'cash'),
    paid('2026-11-06', 400, null, 'boleto'),
    paid('2026-10-10', 1000, 'pix'),
  ];
  const open = [
    { due_date: '2026-11-20', amount: 600, payment_method: 'card' },
    { due_date: '2026-11-01', amount: 999, payment_method: 'pix' }, // atrasada: não conta como a receber
    { due_date: '2026-12-05', amount: 700, payment_method: 'boleto' },
  ];

  it('soma o mês por forma, maior primeiro, com %', () => {
    const r = summarizeByMethod(rows, open, '2026-11', '2026-10', '2026-11-05');
    expect(r.total).toBe(2500);
    expect(r.count).toBe(5);
    expect(r.methods.map((m) => [m.method, m.total, m.count, m.pct])).toEqual([
      ['card', 1200, 1, 48],
      ['pix', 800, 2, 32],
      ['boleto', 400, 1, 16],
      ['cash', 100, 1, 4],
    ]);
  });

  it('compara com o mês anterior e mostra o que ainda vai entrar', () => {
    const r = summarizeByMethod(rows, open, '2026-11', '2026-10', '2026-11-05');
    expect(r.methods.find((m) => m.method === 'pix')!.previousTotal).toBe(1000);
    expect(r.methods.find((m) => m.method === 'card')!.toReceive).toBe(600);
    expect(r.toReceive).toBe(600);
    expect(variation(800, 1000)).toBe(-20);
    expect(variation(800, 0)).toBeNull();
  });

  it('sem forma no pagamento usa a do contrato', () => {
    expect(methodOf({ paid_method: null, payment_method: 'boleto' })).toBe('boleto');
    expect(methodOf({ paid_method: null, payment_method: null })).toBe('other');
  });
});
