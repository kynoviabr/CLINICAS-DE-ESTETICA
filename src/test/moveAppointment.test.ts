import { describe, expect, it } from 'vitest';

describe('lógica de remanejamento e drag-and-drop da agenda', () => {
  const calculateNewTimes = (
    currentStartStr: string,
    currentEndStr: string,
    newDate: string,
    newTime: string
  ) => {
    const currentStart = new Date(currentStartStr);
    const currentEnd = new Date(currentEndStr);
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const durationMinutes = Math.max(15, Math.round(durationMs / 60000));

    const newStartTime = new Date(`${newDate}T${newTime}:00`);
    const newEndTime = new Date(newStartTime.getTime() + durationMinutes * 60000);

    return {
      newStartTime,
      newEndTime,
      durationMinutes,
    };
  };

  it('preserva a duração do agendamento de 30 minutos ao arrastar para outro horário', () => {
    const { newStartTime, newEndTime, durationMinutes } = calculateNewTimes(
      '2026-11-07T09:00:00',
      '2026-11-07T09:30:00',
      '2026-11-07',
      '11:30'
    );

    expect(durationMinutes).toBe(30);
    expect(newStartTime.getHours()).toBe(11);
    expect(newStartTime.getMinutes()).toBe(30);
    expect(newEndTime.getHours()).toBe(12);
    expect(newEndTime.getMinutes()).toBe(0);
  });

  it('preserva a duração do agendamento de 60 minutos ao arrastar para outro horário', () => {
    const { newStartTime, newEndTime, durationMinutes } = calculateNewTimes(
      '2026-11-07T10:00:00',
      '2026-11-07T11:00:00',
      '2026-11-07',
      '14:00'
    );

    expect(durationMinutes).toBe(60);
    expect(newStartTime.getHours()).toBe(14);
    expect(newStartTime.getMinutes()).toBe(0);
    expect(newEndTime.getHours()).toBe(15);
    expect(newEndTime.getMinutes()).toBe(0);
  });

  it('impede arrastar agendamentos com status finalizado ou cancelado', () => {
    const isDraggable = (status: string) => !['cancelled', 'completed', 'rescheduled'].includes(status);

    expect(isDraggable('scheduled')).toBe(true);
    expect(isDraggable('confirmed')).toBe(true);
    expect(isDraggable('in_progress')).toBe(true);
    expect(isDraggable('completed')).toBe(false);
    expect(isDraggable('cancelled')).toBe(false);
    expect(isDraggable('rescheduled')).toBe(false);
  });

  it('detecta quando o agendamento foi solto no mesmo horário e com o mesmo profissional', () => {
    const isSameSlot = (
      currentStart: Date,
      newStart: Date,
      currentProf: string | null,
      targetProf: string | null
    ) => currentStart.getTime() === newStart.getTime() && (currentProf || null) === (targetProf || null);

    const timeA = new Date('2026-11-07T09:00:00');
    const timeB = new Date('2026-11-07T09:00:00');
    const timeC = new Date('2026-11-07T10:00:00');

    expect(isSameSlot(timeA, timeB, 'prof1', 'prof1')).toBe(true);
    expect(isSameSlot(timeA, timeC, 'prof1', 'prof1')).toBe(false);
    expect(isSameSlot(timeA, timeB, 'prof1', 'prof2')).toBe(false);
  });
});
