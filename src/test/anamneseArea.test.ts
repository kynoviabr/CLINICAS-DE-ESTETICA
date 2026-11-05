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

import { questionsForCategory } from '@/lib/anamnese/templates';

describe('modelo de anamnese por área do catálogo', () => {
  const generic = questionsForCategory('Área qualquer');
  it.each([
    ['Estética Facial', 'facial'], ['Peelings', 'peeling'], ['Celulite e Flacidez', 'corporal'], ['Emagrecimento', 'emagrecimento'],
    ['Injetáveis', 'injetaveis'], ['Laser e Depilação', 'laser'], ['Massagens e Drenagem', 'corporal'], ['Sobrancelhas e Cílios', 'sobrancelhas'], ['Capilar', 'capilar'],
  ])('%s usa um modelo próprio, não o geral', (area) => {
    expect(questionsForCategory(area)).not.toEqual(generic);
  });
  it('Celulite e Flacidez usa o modelo corporal', () => {
    expect(questionsForCategory('Celulite e Flacidez')).toEqual(questionsForCategory('Corporal'));
  });
});
