import { describe, expect, it } from 'vitest';
import { chargeMessage, daysLate, goalProgress, monthBounds, monthLabel, parseGoal, shiftMonth, summarizeMonth } from '@/lib/finance/simpleFinance';

describe('financeiro simples', () => {
  it('limites e navegação de mês', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-11')).toBe('Novembro de 2026');
  });

  it('resume recebido, a receber e atrasado', () => {
    const rows = [
      { id: '1', status: 'pago', due_date: '2026-10-30', amount: 300, paid_at: '2026-11-02', paid_amount: 300 },
      { id: '2', status: 'pago', due_date: '2026-11-05', amount: 200, paid_at: '2026-10-28', paid_amount: 200 }, // pago no mês anterior
      { id: '3', status: 'previsto', due_date: '2026-11-20', amount: 450, paid_at: null, paid_amount: null },
      { id: '4', status: 'previsto', due_date: '2026-11-03', amount: 150, paid_at: null, paid_amount: null }, // atrasada
      { id: '5', status: 'previsto', due_date: '2026-09-10', amount: 100, paid_at: null, paid_amount: null }, // atrasada antiga
      { id: '6', status: 'previsto', due_date: '2026-12-10', amount: 999, paid_at: null, paid_amount: null }, // outro mês
      { id: '7', status: 'cancelado', due_date: '2026-11-10', amount: 50, paid_at: null, paid_amount: null },
    ];
    expect(summarizeMonth(rows, '2026-11', '2026-11-05')).toEqual({
      received: 300, receivedCount: 1, toReceive: 450, toReceiveCount: 1, overdue: 250, overdueCount: 2,
    });
  });

  it('progresso da meta', () => {
    expect(goalProgress(11850, 16000)).toEqual({ pct: 74, missing: 4150 });
    expect(goalProgress(20000, 16000)).toEqual({ pct: 100, missing: 0 });
    expect(goalProgress(100, null)).toBeNull();
  });

  it('meta digitada em formato brasileiro', () => {
    expect(parseGoal('16.000')).toBe(16000);
    expect(parseGoal('15000,50')).toBe(15000.5);
    expect(parseGoal('')).toBeNull();
  });

  it('dias de atraso e mensagem de cobrança', () => {
    expect(daysLate('2026-10-31', '2026-11-05')).toBe(5);
    const msg = chargeMessage({ clientName: 'Carla Mendes', clinicName: 'Vive', amount: 450, dueDate: '2026-10-31', installment: '2/4' });
    expect(msg).toContain('Oi Carla!');
    expect(msg).toMatch(/R\$\s450,00/);
    expect(msg).toContain('venceu em 31/10');
  });
});
