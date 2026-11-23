import { describe, expect, it } from 'vitest';
import { visibleWeekDays, workingWeekdays } from '@/lib/agenda/workDays';

const slot = (professional_id: string, day_of_week: number, is_active = true) => ({ professional_id, day_of_week, is_active });
// Semana de 1 (domingo) a 7 (sábado) de novembro de 2026
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 1 + i));

describe('dias de atendimento na semana', () => {
  it('seg a sex esconde sábado e domingo', () => {
    const work = workingWeekdays([1, 2, 3, 4, 5].map((d) => slot('p1', d)), 'all');
    expect(visibleWeekDays(week, work, () => false).map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
  });

  it('dia fora do horário aparece se tiver agendamento', () => {
    const work = workingWeekdays([slot('p1', 1)], 'all');
    const sat = (d: Date) => d.getDay() === 6;
    expect(visibleWeekDays(week, work, sat).map((d) => d.getDay())).toEqual([1, 6]);
  });

  it('filtra pelo profissional e ignora horário inativo', () => {
    const av = [slot('p1', 1), slot('p2', 6), slot('p1', 2, false)];
    expect([...workingWeekdays(av, 'p1')!]).toEqual([1]);
    expect([...workingWeekdays(av, 'all')!].sort()).toEqual([1, 6]);
  });

  it('sem horário cadastrado mostra a semana toda', () => {
    expect(workingWeekdays([], 'all')).toBeNull();
    expect(visibleWeekDays(week, null, () => false)).toHaveLength(7);
  });
});
