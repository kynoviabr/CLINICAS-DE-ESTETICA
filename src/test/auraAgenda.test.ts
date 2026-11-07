import { describe, expect, it } from 'vitest';
import { computeSlots, isSlotFree, setupIssues, type AgendaInput } from '../../supabase/functions/_shared/agenda.ts';

const weekdays = [1, 2, 3, 4, 5];
// Sexta, 06/11/2026 às 15h em Brasília.
const NOW = Date.parse('2026-11-06T18:00:00Z');

function base(over: Partial<AgendaInput> = {}): AgendaInput {
  return {
    from: '2026-11-12', to: '2026-11-12', durationMin: 60, bufferMin: 0, minNoticeMin: 60, horizonDays: 30, now: NOW,
    clinicHours: weekdays.map((d) => ({ day_of_week: d, opens_at: '09:00', closes_at: '19:00' })),
    closures: [],
    pros: [{ id: 'rafa', name: 'Dra. Rafaela', showName: true }],
    availability: weekdays.map((d) => ({ professional_id: 'rafa', day_of_week: d, start_time: '13:00', end_time: '19:00' })),
    appointments: [], blocks: [],
    ...over,
  };
}
const times = (r: ReturnType<typeof computeSlots>) => r.slots.map((s) => s.start.slice(11, 16));

describe('horários livres', () => {
  it('quinta: o dia inteiro da profissional, com o nome dela', () => {
    const r = computeSlots(base());
    expect(times(r)).toEqual(['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00']);
    expect(r.slots[0]).toMatchObject({ start: '2026-11-12T13:00:00-03:00', professionalName: 'Dra. Rafaela' });
  });

  it('a agenda da profissional fica dentro do horário da clínica', () => {
    const r = computeSlots(base({ clinicHours: weekdays.map((d) => ({ day_of_week: d, opens_at: '09:00', closes_at: '16:00' })) }));
    expect(times(r).at(-1)).toBe('15:00');
  });

  it('clínica fechada no dia da semana ou em feriado: sem horários', () => {
    expect(computeSlots(base({ from: '2026-11-14', to: '2026-11-14' })).slots).toHaveLength(0); // sábado
    expect(computeSlots(base({ closures: ['2026-11-12'] })).slots).toHaveLength(0);
  });

  it('agendamento ocupa o horário e o intervalo entre atendimentos', () => {
    const appointments = [{ professional_id: 'rafa', start: '2026-11-12T14:00:00-03:00', end: '2026-11-12T15:00:00-03:00' }];
    expect(times(computeSlots(base({ appointments })))).toEqual(['13:00', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00']);
    expect(times(computeSlots(base({ appointments, bufferMin: 15 })))).toEqual(['15:30', '16:00', '16:30', '17:00', '17:30', '18:00']);
  });

  it('bloqueio da clínica toda vale para todos', () => {
    const blocks = [{ professional_id: null, start: '2026-11-12T13:00:00-03:00', end: '2026-11-12T17:00:00-03:00' }];
    expect(times(computeSlots(base({ blocks })))).toEqual(['17:00', '17:30', '18:00']);
  });

  it('antecedência mínima e limite de dias à frente', () => {
    expect(times(computeSlots(base({ from: '2026-11-06', to: '2026-11-06' })))).toEqual(['16:00', '16:30', '17:00', '17:30', '18:00']);
    expect(computeSlots(base({ horizonDays: 3 })).slots).toHaveLength(0);
  });

  it('período e horário exato', () => {
    expect(times(computeSlots(base({ period: 'morning' })))).toEqual([]);
    expect(times(computeSlots(base({ time: '17:00' })))).toEqual(['17:00']);
  });

  it('pausa para almoço (dois períodos no dia) não vira horário livre', () => {
    const availability = [
      { professional_id: 'rafa', day_of_week: 4, start_time: '09:00', end_time: '12:00' },
      { professional_id: 'rafa', day_of_week: 4, start_time: '13:00', end_time: '18:00' },
    ];
    const t = times(computeSlots(base({ availability })));
    expect(t).toContain('11:00');
    expect(t).not.toContain('11:30'); // terminaria 12:30, dentro do almoço
    expect(t).not.toContain('12:00');
    expect(t).toContain('13:00');
  });

  it('profissional que prefere não mostrar o nome', () => {
    expect(computeSlots(base({ pros: [{ id: 'rafa', name: 'Dra. Rafaela', showName: false }] })).slots[0].professionalName).toBeNull();
  });

  it('confere um horário exato antes de marcar', () => {
    const q = base();
    expect(isSlotFree(q, 'rafa', new Date('2026-11-12T13:00:00-03:00'))).toBe(true);
    expect(isSlotFree(q, 'rafa', new Date('2026-11-12T10:00:00-03:00'))).toBe(false); // fora da agenda dela
    expect(isSlotFree(q, 'outra', new Date('2026-11-12T13:00:00-03:00'))).toBe(false);
  });
});

describe('pendências para a IA agendar', () => {
  it('aponta o que falta', () => {
    const issues = setupIssues({
      clinicHours: [],
      treatments: [
        { id: 't1', name: 'Limpeza de pele', ai_bookable: true, requires_evaluation: false },
        { id: 't2', name: 'Botox', ai_bookable: true, requires_evaluation: true },
      ],
      pros: [{ id: 'rafa', name: 'Dra. Rafaela' }],
      links: [],
      availability: [],
      offersEvaluation: false,
    }).map((i) => i.code);
    expect(issues).toEqual(['no_clinic_hours', 'professional_without_hours', 'treatment_without_professional', 'evaluation_off']);
  });
});
