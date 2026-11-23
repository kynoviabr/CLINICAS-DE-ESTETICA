/**
 * Respostas de escolha da anamnese inicial. O formulário grava o código (ex.: "rarely");
 * a tela, o PDF e a impressão mostram sempre o texto em português.
 */
export const ANAMNESE_CHOICES: Record<string, Array<{ value: string; label: string }>> = {
  marital_status: [
    { value: 'single', label: 'Solteiro(a)' },
    { value: 'married', label: 'Casado(a)' },
    { value: 'divorced', label: 'Divorciado(a)' },
    { value: 'widowed', label: 'Viúvo(a)' },
    { value: 'other', label: 'Outro' },
  ],
  skin_type: [
    { value: 'normal', label: 'Normal' },
    { value: 'oily', label: 'Oleosa' },
    { value: 'dry', label: 'Seca' },
    { value: 'combination', label: 'Mista' },
    { value: 'sensitive', label: 'Sensível' },
  ],
  alcohol_frequency: [
    { value: 'never', label: 'Nunca' },
    { value: 'rarely', label: 'Raramente' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'daily', label: 'Diário' },
  ],
  exercise_frequency: [
    { value: 'none', label: 'Sedentário' },
    { value: '1-2x', label: '1-2x/semana' },
    { value: '3-4x', label: '3-4x/semana' },
    { value: '5+', label: '5+ vezes/semana' },
  ],
  sleep_quality: [
    { value: 'good', label: 'Boa' },
    { value: 'regular', label: 'Regular' },
    { value: 'poor', label: 'Ruim' },
    { value: 'insomnia', label: 'Insônia' },
  ],
};

/** Texto em português da resposta de escolha; outros campos voltam como vieram. */
export function choiceLabel(field: string, value: string): string {
  return ANAMNESE_CHOICES[field]?.find((o) => o.value === value)?.label ?? value;
}
