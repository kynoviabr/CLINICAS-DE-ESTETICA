import { describe, expect, it } from 'vitest';
import { draftFromRows, outsideClinicHours, rowsFromDraft, validateDraft } from '@/lib/agenda/professionalHours';

const clinic = [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, opens_at: '09:00:00', closes_at: '18:00:00' }));

describe('horários do profissional', () => {
  it('sem horários: sugere o horário da clínica', () => {
    const d = draftFromRows([], clinic);
    expect(d[1]).toEqual({ isActive: true, start: '09:00', end: '18:00' });
    expect(d[0].isActive).toBe(false);
    expect(d[6].isActive).toBe(false);
  });

  it('com horários: usa os do profissional e o resto fica desligado', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00:00', end_time: '19:00:00', is_active: true }], clinic);
    expect(d[4]).toEqual({ isActive: true, start: '13:00', end: '19:00' });
    expect(d[1].isActive).toBe(false);
  });

  it('vira linhas só dos dias ativos', () => {
    const d = draftFromRows([], clinic);
    const rows = rowsFromDraft(d, 'c1', 'p1');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ clinic_id: 'c1', professional_id: 'p1', day_of_week: 1, start_time: '09:00', end_time: '18:00', is_active: true });
  });

  it('confere fim antes do início e horário fora da clínica', () => {
    const d = draftFromRows([{ day_of_week: 4, start_time: '13:00', end_time: '19:00' }, { day_of_week: 6, start_time: '09:00', end_time: '12:00' }], clinic);
    expect(validateDraft(d)).toBeNull();
    expect(validateDraft({ ...d, 4: { isActive: true, start: '19:00', end: '13:00' } })).toContain('Quinta-feira');
    expect(outsideClinicHours(d, clinic)).toEqual(['Quinta-feira (clínica 09:00–18:00)', 'Sábado (clínica fechada)']);
  });
});
