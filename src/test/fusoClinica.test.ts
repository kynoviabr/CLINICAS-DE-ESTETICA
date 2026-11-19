import { describe, expect, it } from 'vitest';
import { computeSlots, localDate, localIso, offsetFor, offsetText } from '../../supabase/functions/_shared/agenda';
import { canSendNow, whenLabel } from '../../supabase/functions/_shared/reminders';
import { CLINIC_TIMEZONES } from '@/lib/clinic/timezones';

describe('fuso por clínica', () => {
  it('deslocamentos do Brasil', () => {
    expect(offsetFor('America/Sao_Paulo')).toBe(-180);
    expect(offsetFor('America/Manaus')).toBe(-240);
    expect(offsetFor('America/Rio_Branco')).toBe(-300);
    expect(offsetFor('America/Noronha')).toBe(-120);
    expect(offsetFor(null)).toBe(-180);
    expect(offsetText(-240)).toBe('-04:00');
    for (const t of CLINIC_TIMEZONES) expect(offsetFor(t.value)).toBeLessThan(0);
  });
  it('hora local muda com o fuso', () => {
    const d = new Date('2026-11-20T13:00:00Z');
    expect(localIso(d)).toBe('2026-11-20T10:00:00-03:00');
    expect(localIso(d, -240)).toBe('2026-11-20T09:00:00-04:00');
    expect(localDate(Date.parse('2026-11-21T02:30:00Z'), -180)).toBe('2026-11-20');
    expect(whenLabel('2026-11-27T17:00:00Z', -240)).toBe('sexta, 27/11 às 13:00');
  });
  it('horários livres no fuso de Manaus', () => {
    const r = computeSlots({
      from: '2026-11-23', to: '2026-11-23', durationMin: 60, bufferMin: 0, minNoticeMin: 0, horizonDays: 30,
      now: Date.parse('2026-11-20T12:00:00Z'), clinicHours: [{ day_of_week: 1, opens_at: '09:00', closes_at: '11:00' }], closures: [],
      pros: [{ id: 'p', name: 'P', showName: true }], availability: [{ professional_id: 'p', day_of_week: 1, start_time: '09:00', end_time: '11:00' }],
      appointments: [], blocks: [], offsetMin: -240,
    });
    expect(r.slots.map((s) => s.start)).toEqual(['2026-11-23T09:00:00-04:00', '2026-11-23T09:30:00-04:00', '2026-11-23T10:00:00-04:00']);
  });
  it('janela de envio respeita o fuso', () => {
    const t = Date.parse('2026-11-20T11:30:00Z'); // 08:30 Brasília, 07:30 Manaus
    expect(canSendNow(t, -180)).toBe(true);
    expect(canSendNow(t, -240)).toBe(false);
  });
});
