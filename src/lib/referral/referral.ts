export const referralUrl = (origin: string, code: string) => `${origin.replace(/\/$/, '')}/indicar/${code}`;

/** Mensagem que o paciente compartilha com os amigos. */
export function referralShareText(clinicName: string, url: string) {
  return `Estou fazendo meus tratamentos na ${clinicName} e estou adorando! Se quiser conhecer, deixa seu contato por este link que eles te chamam: ${url}`;
}

export function referralError(reason: string | undefined) {
  if (reason === 'invalid_name') return 'Informe seu nome completo.';
  if (reason === 'invalid_phone') return 'Informe um WhatsApp com DDD.';
  if (reason === 'too_many') return 'Muitos pedidos por este link hoje. Tente amanhã.';
  if (reason === 'disabled') return 'Este link de indicação não está ativo.';
  return 'Algo deu errado. Tente de novo.';
}

export const STAGE_LABEL: Record<string, string> = {
  new_lead: 'Novo', contacted: 'Em contato', scheduled: 'Agendado', proposal_sent: 'Proposta enviada', closed_won: 'Fechou', closed_lost: 'Não fechou',
};
