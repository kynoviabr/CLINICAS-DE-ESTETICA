import { describe, expect, it } from 'vitest';
import { activeTemplates, anamneseState, selectionNames, suggestSelection } from '@/lib/anamnese/selection';
import { guessQuestionType, templateQuestions, templateRiskTerms, type AnamneseTemplate } from '@/lib/anamnese/templates';
import { anamneseLinkMessage } from '@/lib/anamnese/link';

const tpl = (id: string, category_id: string, category_name: string, extra: Partial<AnamneseTemplate> = {}): AnamneseTemplate => ({
  id, name: `Anamnese ${category_name}`, category_id, category_name, active: true,
  basic_questions: [], specific_questions: ['Usa ácidos?'], notes: '', ...extra,
});

describe('escolha das anamneses', () => {
  const peeling = tpl('t1', 'c1', 'Peelings');
  const facial = tpl('t2', 'c2', 'Estética Facial');
  const laser = tpl('t3', 'c3', 'Laser');

  it('sugere a inicial quando não está válida e os tratamentos da paciente sem anamnese válida', () => {
    const s = suggestSelection({ templates: [peeling, facial, laser], categoryIds: ['c1', 'c2'], validCategoryIds: ['c2'], generalState: 'expired' });
    expect(s).toEqual({ general: true, templateIds: ['t1'] });
  });

  it('não sugere a inicial quando ela está válida', () => {
    expect(suggestSelection({ templates: [peeling], categoryIds: [], validCategoryIds: [], generalState: 'valid' }))
      .toEqual({ general: false, templateIds: [] });
  });

  it('lê só modelos ativos e com perguntas, em ordem de categoria', () => {
    const raw = JSON.stringify([laser, tpl('x', 'c9', 'Sem perguntas', { specific_questions: [] }), tpl('y', 'c8', 'Inativo', { active: false }), facial]);
    expect(activeTemplates(raw).map((t) => t.id)).toEqual(['t2', 't3']);
    expect(activeTemplates('não é json')).toEqual([]);
  });

  it('situação da anamnese segue status e vencimento', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    expect(anamneseState({ status: 'validated', expires_at: '2027-01-01T00:00:00Z' }, now)).toBe('valid');
    expect(anamneseState({ status: 'filled', expires_at: '2026-11-01T00:00:00Z' }, now)).toBe('expired');
    expect(anamneseState({ status: 'pending', expires_at: null }, now)).toBe('pending');
    expect(anamneseState(null, now)).toBe('none');
  });

  it('mensagem do WhatsApp cita o que foi escolhido', () => {
    const names = selectionNames([peeling, facial], { general: true, templateIds: ['t1', 't2'] });
    expect(names).toEqual(['inicial', 'de Peelings', 'de Estética Facial']);
    expect(anamneseLinkMessage('Joana Silva', 'Aura', 'https://x/anamnese/a', names))
      .toContain('suas fichas de anamnese (inicial, de Peelings e de Estética Facial)');
  });
});

describe('modelos de tratamento', () => {
  it('converte modelos antigos (só texto) em perguntas com tipo', () => {
    const old = tpl('t', 'c', 'Peelings', { specific_questions: ['Possui herpes?', 'Qual objetivo principal?'] });
    expect(templateQuestions(old)).toEqual([
      { text: 'Possui herpes?', type: 'yes_no' },
      { text: 'Qual objetivo principal?', type: 'text' },
    ]);
    expect(guessQuestionType('Teve exposição solar recente?')).toBe('yes_no');
    expect(templateRiskTerms(old)).toContain('Peelings');
  });
});
