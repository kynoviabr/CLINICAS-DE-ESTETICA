/** Endereço que a paciente abre para preencher a anamnese. */
export const anamneseLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/anamnese/${token}`;

/** Mensagem pronta para o WhatsApp. */
export function anamneseLinkMessage(fullName: string, clinicName: string | undefined, url: string) {
  const first = fullName.trim().split(/\s+/)[0] || '';
  return `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicName || 'clínica'}. Para agilizar seu atendimento, preencha sua ficha de anamnese pelo link abaixo (leva uns 5 minutos). Vai pedir sua data de nascimento para confirmar que é você.\n\n${url}\n\nO link é pessoal e vale por 7 dias.`;
}
