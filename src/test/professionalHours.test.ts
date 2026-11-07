import { describe, expect, it } from 'vitest';
import {
  draftFromRows, hoursSummaryText, lunchOutsideDays, outsideClinicHours, rowsFromDraft, validateDraft,
} from '@/lib/agenda/professionalHours';

const clinic = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens_at: '09:00:00', closes_at: '18:00:00' }));

describe('horários do profissional', () => {
  it('sem horários: sugere o horário da clínica, sem almoço', () => {
    const d = draftFromRows([], clinic);
    expect(d.days[1]).toEqual({ isActive: true, start: '09:00', end: '18:00' });
    expect(d.days[0].isActive).toBe(false);
    expect(d.days[6].isActive).toBe(false);
    expect(d.lunch.enabled).toBe(false);
  });

  it('com horários: usa os do profissional e o resto fica desligado', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00:00', end_time: '19:00:00', is_active: true }], clinic);
    expect(d.days[4]).toEqual({ isActive: true, start: '13:00', end: '19:00' });
    expect(d.days[1].isActive).toBe(false);
  });

  it('almoço vira dois períodos em todos os dias de atendimento', () => {
    const d = draftFromRows([], clinic);
    d.lunch = { enabled: true, start: '12:00', end: '13:00' };
    const rows = rowsFromDraft(d, 'c1', 'p1');
    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 2)).toEqual([
      { clinic_id: 'c1', professional_id: 'p1', day_of_week: 1, start_time: '09:00', end_time: '12:00', is_active: true },
      { clinic_id: 'c1', professional_id: 'p1', day_of_week: 1, start_time: '13:00', end_time: '18:00', is_active: true },
    ]);
  });

  it('lê de volta o almoço a partir dos dois períodos', () => {
    const d = draftFromRows([
      { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      { day_of_week: 1, start_time: '13:00:00', end_time: '18:00:00' },
    ], clinic);
    expect(d.days[1]).toEqual({ isActive: true, start: '09:00', end: '18:00' });
    expect(d.lunch).toEqual({ enabled: true, start: '12:00', end: '13:00' });
  });

  it('almoço fora do horário do dia não é aplicado naquele dia', () => {
    const d = draftFromRows([{ day_of_week: 2, start_time: '14:00', end_time: '18:00' }, { day_of_week: 3, start_time: '09:00', end_time: '18:00' }]);
    d.lunch = { enabled: true, start: '12:00', end: '13:00' };
    expect(lunchOutsideDays(d)).toEqual(['Terça-feira']);
    expect(rowsFromDraft(d, 'c', 'p').filter((r) => r.day_of_week === 2)).toHaveLength(1);
  });

  it('confere horários inválidos e fora da clínica', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00', end_time: '19:00' }, { day_of_week: 6, start_time: '09:00', end_time: '12:00' }], clinic);
    expect(validateDraft(d)).toBeNull();
    expect(validateDraft({ ...d, days: { ...d.days, 4: { isActive: true, start: '19:00', end: '13:00' } } })).toContain('Quinta-feira');
    expect(validateDraft({ ...d, lunch: { enabled: true, start: '13:00', end: '12:00' } })).toContain('Almoço');
    expect(outsideClinicHours(d, clinic)).toEqual(['Quinta-feira (clínica 09:00–18:00)', 'Sábado (clínica fechada)']);
  });

  it('resumo junta os períodos do dia', () => {
    expect(hoursSummaryText([
      { day_of_week: 1, start_time: '13:00:00', end_time: '18:00:00' },
      { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      { day_of_week: 2, start_time: '09:00:00', end_time: '18:00:00' },
    ])).toBe('Seg 09:00–12:00 e 13:00–18:00 · Ter 09:00–18:00');
  });
});
