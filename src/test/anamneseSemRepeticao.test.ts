import { describe, expect, it } from 'vitest';
import { defaultRiskTerms, templateRiskTerms, visibleTemplateQuestions } from '@/lib/anamnese/templates';

const injetaveis = {
  specific_questions: [],
  questions: [
    { text: 'Possui alergia conhecida a anestésicos, medicamentos ou substâncias injetáveis?', type: 'yes_no' as const },
    { text: 'Usa anticoagulantes, anti-inflamatórios ou medicação que aumente risco de sangramento?', type: 'yes_no' as const },
    { text: 'Possui doença autoimune, infecção ativa ou imunossupressão?', type: 'yes_no' as const },
    { text: 'Qual área será tratada e qual resultado espera?', type: 'text' as const },
    { text: 'Foi orientado sobre riscos, cuidados pós-procedimento e tempo de recuperação?', type: 'yes_no' as const },
  ],
};

describe('anamnese do tratamento sem repetir a básica', () => {
  it('junto com a básica: some o que a básica já pergunta e a pergunta de riscos', () => {
    expect(visibleTemplateQuestions(injetaveis, true).map((q) => q.text)).toEqual(['Possui doença autoimune, infecção ativa ou imunossupressão?']);
  });
  it('sozinha (básica já respondida antes): mantém as perguntas, só tira a de riscos', () => {
    expect(visibleTemplateQuestions(injetaveis, false)).toHaveLength(4);
  });
  it('riscos detalhados: modelo antigo com texto curto passa a usar o detalhado', () => {
    const old = { category_name: 'Injetáveis', risk_terms: 'Declaro que fui informada sobre como funciona o tratamento de Injetáveis, seus riscos…' };
    expect(templateRiskTerms(old)).toBe(defaultRiskTerms('Injetáveis'));
    expect(templateRiskTerms(old)).toContain('Contraindicações:');
    expect(templateRiskTerms({ category_name: 'X', risk_terms: 'Texto próprio da clínica' })).toBe('Texto próprio da clínica');
  });
});
