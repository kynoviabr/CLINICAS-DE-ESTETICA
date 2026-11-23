/** Endereço que a paciente abre para preencher a anamnese. */
export const anamneseLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/anamnese/${token}`;

/** "a", "a e b", "a, b e c". */
function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/**
 * Mensagem pronta para o WhatsApp. `names` diz o que foi escolhido
 * (ex.: ["inicial", "de Peelings"]); sem ele, fala só da ficha de anamnese.
 */
export function anamneseLinkMessage(fullName: string, clinicName: string | undefined, url: string, names: string[] = []) {
  const first = fullName.trim().split(/\s+/)[0] || '';
  const what = names.length > 1
    ? `suas fichas de anamnese (${joinNames(names)})`
    : names.length === 1
      ? `sua ficha de anamnese ${names[0]}`
      : 'sua ficha de anamnese';
  const time = names.length > 1 ? 'leva poucos minutos' : 'leva uns 5 minutos';
  return `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicName || 'clínica'}. Para agilizar seu atendimento, preencha ${what} pelo link abaixo (${time}). Vai pedir sua data de nascimento para confirmar que é você.\n\n${url}\n\nO link é pessoal e vale por 7 dias.`;
}
