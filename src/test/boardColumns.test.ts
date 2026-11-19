import { describe, expect, it } from 'vitest';
import { buildBoardColumns, displayStageCode } from '@/lib/crm/boardColumns';

const base = [
  { code: 'new_lead', label: 'Novo Lead' },
  { code: 'contacted', label: 'Contato Iniciado' },
  { code: 'scheduled', label: 'Agendado' },
  { code: 'proposal_sent', label: 'Proposta' },
  { code: 'closed_won', label: 'Fechado' },
  { code: 'closed_lost', label: 'Perdido' },
];

describe('quadro do CRM com etapas escolhidas', () => {
  it('padrão: seis colunas', () => {
    expect(buildBoardColumns(base, null).map((c) => c.code)).toEqual(base.map((s) => s.code));
  });

  it('exemplo da clínica: sem Novo Lead, Proposta renomeada e Finalizado', () => {
    const stages = base.map((s) => s.code === 'new_lead' ? { ...s, hidden: true } : s.code === 'proposal_sent' ? { ...s, label: 'Em negociação' } : s);
    const cols = buildBoardColumns(stages, 'Finalizado');
    expect(cols.map((c) => c.label)).toEqual(['Contato Iniciado', 'Agendado', 'Em negociação', 'Finalizado']);
    expect(cols[0].stageCodes).toEqual(['contacted', 'new_lead']);
    expect(cols[3]).toMatchObject({ isFinal: true, stageCodes: ['closed_won', 'closed_lost'] });
    expect(displayStageCode(cols, 'new_lead')).toBe('contacted');
    expect(displayStageCode(cols, 'closed_lost')).toBe('closed_lost');
  });

  it('última etapa aberta oculta vai para a anterior', () => {
    const stages = base.map((s) => s.code === 'proposal_sent' ? { ...s, hidden: true } : s);
    const cols = buildBoardColumns(stages, null);
    expect(cols.find((c) => c.code === 'scheduled')!.stageCodes).toEqual(['scheduled', 'proposal_sent']);
  });

  it('Fechado e Perdido não somem e ao menos uma etapa aberta fica', () => {
    const stages = base.map((s) => ({ ...s, hidden: true }));
    expect(buildBoardColumns(stages, null).map((c) => c.code)).toEqual(base.map((s) => s.code));
  });
});
