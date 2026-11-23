import { describe, expect, it } from 'vitest';
import {
  draftFromRows, hoursSummaryText, outsideClinicHours, rowsFromDraft, validateDraft,
} from '@/lib/agenda/professionalHours';

const clinic = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens_at: '09:00:00', closes_at: '18:00:00' }));

describe('horários do profissional', () => {
  it('sem horários: sugere o horário da clínica, sem almoço', () => {
    const d = draftFromRows([], clinic);
    expect(d.days[1]).toEqual({ isActive: true, start: '09:00', end: '18:00', pause: { enabled: false, start: '12:00', end: '13:00' } });
    expect(d.days[0].isActive).toBe(false);
    expect(d.days[6].isActive).toBe(false);
    expect(d.days[1].pause.enabled).toBe(false);
  });

  it('com horários: usa os do profissional e o resto fica desligado', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00:00', end_time: '19:00:00', is_active: true }], clinic);
    expect(d.days[4]).toEqual({ isActive: true, start: '13:00', end: '19:00', pause: { enabled: false, start: '12:00', end: '13:00' } });
    expect(d.days[1].isActive).toBe(false);
  });

  it('a pausa divide somente o dia configurado em dois períodos', () => {
    const d = draftFromRows([], clinic);
    d.days[1].pause = { enabled: true, start: '12:00', end: '13:00' };
    const rows = rowsFromDraft(d, 'c1', 'p1');
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 2)).toEqual([
      { clinic_id: 'c1', professional_id: 'p1', day_of_week: 1, start_time: '09:00', end_time: '12:00', is_active: true },
      { clinic_id: 'c1', professional_id: 'p1', day_of_week: 1, start_time: '13:00', end_time: '18:00', is_active: true },
    ]);
    expect(rows.filter((row) => row.day_of_week === 2)).toHaveLength(1);
  });

  it('lê de volta pausas diferentes em cada dia', () => {
    const d = draftFromRows([
      { day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      { day_of_week: 1, start_time: '13:00:00', end_time: '18:00:00' },
      { day_of_week: 2, start_time: '09:00:00', end_time: '12:30:00' },
      { day_of_week: 2, start_time: '14:00:00', end_time: '18:00:00' },
    ], clinic);
    expect(d.days[1].pause).toEqual({ enabled: true, start: '12:00', end: '13:00' });
    expect(d.days[2].pause).toEqual({ enabled: true, start: '12:30', end: '14:00' });
  });

  it('confere horários inválidos e fora da clínica', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00', end_time: '19:00' }, { day_of_week: 6, start_time: '09:00', end_time: '12:00' }], clinic);
    expect(validateDraft(d)).toBeNull();
    expect(validateDraft({ ...d, days: { ...d.days, 4: { ...d.days[4], start: '19:00', end: '13:00' } } })).toContain('Quinta-feira');
    expect(validateDraft({ ...d, days: { ...d.days, 4: { ...d.days[4], pause: { enabled: true, start: '16:00', end: '15:00' } } } })).toContain('fim da pausa');
    expect(validateDraft({ ...d, days: { ...d.days, 4: { ...d.days[4], pause: { enabled: true, start: '12:00', end: '14:00' } } } })).toContain('dentro do horário');
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
