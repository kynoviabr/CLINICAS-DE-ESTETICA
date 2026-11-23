import { describe, expect, it } from 'vitest';
import { defaultServiceForm, formToRow, hoursFromRows, rowToForm, validateHours } from '@/lib/clinic/serviceSettings';

describe('configurações de atendimento', () => {
  it('formulário vira linha do banco e volta igual', () => {
    const f = { ...defaultServiceForm(), payment_methods: ['pix', 'credito'], max_installments: '10', installments_min_value: '1000',
      accepts_insurance: true, insurance_plans: 'Unimed, Bradesco ', min_notice_hours: '2', evaluation_free: false, evaluation_price: '50' };
    const row = formToRow(f);
    expect(row).toMatchObject({ payment_methods: ['pix', 'credito'], max_installments: 10, installments_min_value: 1000,
      insurance_plans: ['Unimed', 'Bradesco'], min_notice_minutes: 120, evaluation_free: false, evaluation_price: 50 });
    expect(rowToForm(row as unknown as Record<string, unknown>)).toMatchObject({ insurance_plans: 'Unimed, Bradesco', min_notice_hours: '2', max_installments: '10' });
  });

  it('sem crédito não guarda parcelas; plano desligado não guarda lista', () => {
    const row = formToRow({ ...defaultServiceForm(), max_installments: '10', insurance_plans: 'Unimed' });
    expect(row.max_installments).toBeNull();
    expect(row.insurance_plans).toEqual([]);
  });

  it('horário: agrupa por dia e confere intervalos', () => {
    const h = hoursFromRows([{ day_of_week: 1, opens_at: '09:00:00', closes_at: '12:00:00' }, { day_of_week: 1, opens_at: '13:00:00', closes_at: '18:00:00' }]);
    expect(h[1]).toEqual([{ opens: '09:00', closes: '12:00' }, { opens: '13:00', closes: '18:00' }]);
    expect(validateHours(h)).toBeNull();
    expect(validateHours({ 2: [{ opens: '18:00', closes: '09:00' }] })).toContain('Terça');
    expect(validateHours({ 3: [{ opens: '09:00', closes: '13:00' }, { opens: '12:00', closes: '18:00' }] })).toContain('sobrepõem');
  });
});
