import { describe, expect, it } from 'vitest';
import { dayHours, daySlots, slotOf, weekHours } from '@/lib/agenda/daySlots';

const av = (professional_id: string, day_of_week: number, start_time: string, end_time: string) =>
  ({ professional_id, day_of_week, start_time, end_time, is_active: true });

describe('grade de horários do dia', () => {
  it('usa o horário de atendimento do dia', () => {
    const hours = dayHours([av('p1', 4, '09:00:00', '12:00:00'), av('p2', 4, '13:00:00', '18:00:00')], 4, 'all');
    expect(hours).toEqual({ start: '09:00', end: '18:00' });
    expect(dayHours([av('p1', 4, '09:00:00', '12:00:00'), av('p2', 4, '13:00:00', '18:00:00')], 4, 'p1')).toEqual({ start: '09:00', end: '12:00' });
  });

  it('sem horário cadastrado: 08h às 20h', () => {
    expect(dayHours([], 0, 'all')).toEqual({ start: '08:00', end: '20:00' });
  });

  it('linhas de 30 em 30 minutos', () => {
    expect(daySlots({ start: '09:00', end: '11:00' })).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('agendamento fora do horário estende a grade', () => {
    expect(daySlots({ start: '09:00', end: '10:00' }, ['08:15', '10:40'])).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '10:30']);
    expect(slotOf('10:45')).toBe('10:30');
  });

  it('semana usa do mais cedo ao mais tarde entre os dias', () => {
    const list = [av('p1', 1, '09:00', '17:00'), av('p1', 6, '08:00', '12:00'), av('p1', 3, '10:00', '19:00')];
    expect(weekHours(list, [1, 3], 'all')).toEqual({ start: '09:00', end: '19:00' });
    expect(weekHours(list, [1, 3, 6], 'all')).toEqual({ start: '08:00', end: '19:00' });
    expect(weekHours([], [1], 'all')).toEqual({ start: '08:00', end: '20:00' });
  });
});
