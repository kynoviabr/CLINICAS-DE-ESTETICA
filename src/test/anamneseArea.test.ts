import { describe, expect, it } from 'vitest';
import { buildAnamneseTemplate, buildAreaSection } from '@/lib/anamnese/templates';

describe('anamnese única: perguntas da área', () => {
  it('sem área escolhida, não acrescenta nada', () => {
    expect(buildAreaSection(null, {})).toEqual({});
  });

  it('grava o modelo e uma resposta por pergunta da área', () => {
    const template = buildAnamneseTemplate({ id: 'cat1', name: 'Peelings' });
    const [q1, q2] = template.specific_questions;
    const area = buildAreaSection(template, { [q1]: '  Não uso  ' });
    expect(area).toMatchObject({ template_id: template.id, template: { name: 'Anamnese Peelings', category: 'Peelings' } });
    expect((area as { area_questions: Record<string, string> }).area_questions[q1]).toBe('Não uso');
    expect((area as { area_questions: Record<string, string> }).area_questions[q2]).toBe('');
    expect(Object.keys((area as { area_questions: Record<string, string> }).area_questions)).toHaveLength(template.specific_questions.length);
  });
});
