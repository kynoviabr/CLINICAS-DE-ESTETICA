import { describe, expect, it } from 'vitest';
import { installmentSituation, todayIso } from '@/lib/finance/installments';

describe('installmentSituation', () => {
  const today = '2026-10-31';
  it('parcela paga é paga mesmo vencida', () => {
    expect(installmentSituation({ status: 'pago', due_date: '2026-01-01' }, today)).toBe('paga');
  });
  it('prevista vencida antes de hoje é atrasada', () => {
    expect(installmentSituation({ status: 'previsto', due_date: '2026-10-30' }, today)).toBe('atrasada');
  });
  it('vencendo hoje ainda não está atrasada', () => {
    expect(installmentSituation({ status: 'previsto', due_date: today }, today)).toBe('a_vencer');
  });
  it('cancelada', () => {
    expect(installmentSituation({ status: 'cancelado', due_date: '2026-01-01' }, today)).toBe('cancelada');
  });
});

describe('todayIso', () => {
  it('usa a data local', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
