import { describe, expect, it } from 'vitest';
import { buildDayTasks, clientsToRenew, daysWithoutContact, freeSlots, funnelColumnOf, moneyInsight } from '@/lib/home/meuDia';

const now = new Date(2026, 10, 5, 9, 0); // 05/11/2026 09:00

describe('Meu dia', () => {
  it('funil de 4 colunas sobre as etapas do CRM', () => {
    expect(funnelColumnOf('new_lead')).toBe('interessada');
    expect(funnelColumnOf('contacted')).toBe('interessada');
    expect(funnelColumnOf(null)).toBe('interessada');
    expect(funnelColumnOf('scheduled')).toBe('avaliacao');
    expect(funnelColumnOf('proposal_sent')).toBe('proposta');
    expect(funnelColumnOf('closed_won')).toBe('fechou');
    expect(funnelColumnOf('closed_lost')).toBeNull();
  });

  it('dias sem contato', () => {
    expect(daysWithoutContact({ last_interaction_at: '2026-11-01T10:00:00', created_at: '2026-10-01T10:00:00' }, now)).toBe(4);
    expect(daysWithoutContact({ stage_changed_at: '2026-11-04T10:00:00' }, now)).toBe(1);
  });

  it('horários livres dentro do expediente, sem conflitar', () => {
    const windows = [{ start_time: '09:00:00', end_time: '13:00:00' }];
    const busy = [{ start: new Date(2026, 10, 6, 10, 0), end: new Date(2026, 10, 6, 11, 30) }];
    expect(freeSlots(windows, busy, 60)).toEqual(['09:00', '12:00']);
    expect(freeSlots([], busy)).toEqual([]);
  });

  it('clientes para renovar: última sessão há mais de 60 dias e nada marcado', () => {
    const appts = [
      { patient_id: 'a', start_time: '2026-08-01T10:00:00', status: 'completed' }, // 96 dias
      { patient_id: 'b', start_time: '2026-08-10T10:00:00', status: 'completed' },
      { patient_id: 'b', start_time: '2026-11-20T10:00:00', status: 'scheduled' }, // tem futuro
      { patient_id: 'c', start_time: '2026-10-20T10:00:00', status: 'completed' }, // recente
      { patient_id: 'd', start_time: '2026-07-01T10:00:00', status: 'completed' },
      { patient_id: 'd', start_time: '2026-11-10T10:00:00', status: 'cancelled' }, // cancelado não conta
    ];
    expect(clientsToRenew(appts, now).map((r) => r.patientId)).toEqual(['d', 'a']);
  });

  it('tarefas do dia em ordem de prioridade, com mensagem pronta', () => {
    const tasks = buildDayTasks({
      now, clinicName: 'Vive',
      tomorrowUnconfirmed: [{ id: '1', name: 'Gabriela Souza', phone: '13999990000', start_time: '2026-11-06T09:00:00', service: 'Limpeza de pele' }],
      coldLeads: [{ id: '2', name: 'Juliana Costa', phone: null, days: 4, interest: 'melasma' }],
      expiringProposals: [{ id: '3', name: 'Marina Alves', phone: null, valid_until: '2026-11-07', total: 2380, number: 'PROP-1' }],
      overdue: [{ id: '4', name: 'Carla Mendes', phone: null, amount: 450, due_date: '2026-10-31' }],
      toRenew: [{ patientId: '5', name: 'Fernanda Lima', phone: null, days: 62 }],
    });
    expect(tasks.map((t) => t.kind)).toEqual(['confirmar', 'proposta', 'retomar', 'cobrar', 'renovar']);
    expect(tasks[0].message).toContain('Oi Gabriela!');
    expect(tasks[0].message).toContain('amanhã às 09:00');
    expect(tasks[1].title).toBe('Proposta de Marina Alves vence 07/11');
  });

  it('frase do dinheiro', () => {
    expect(moneyInsight({ received: 0, goal: null, toReceive: 0, negotiating: 0, negotiatingCount: 0 })).toMatch(/Defina a meta/);
    expect(moneyInsight({ received: 17000, goal: 16000, toReceive: 0, negotiating: 0, negotiatingCount: 0 })).toMatch(/batida/);
    expect(moneyInsight({ received: 11850, goal: 16000, toReceive: 3200, negotiating: 6480, negotiatingCount: 3 })).toMatch(/3 propostas em aberto/);
    expect(moneyInsight({ received: 1000, goal: 16000, toReceive: 1000, negotiating: 0, negotiatingCount: 0 })).toMatch(/Chame interessadas/);
  });
});

describe('frase do dinheiro com previsto na agenda', () => {
  it('considera o que já está agendado', () => {
    expect(moneyInsight({ received: 10000, goal: 16000, toReceive: 2000, negotiating: 0, negotiatingCount: 0, scheduled: 4800 })).toMatch(/já agendados, você bate a meta/);
  });
});
