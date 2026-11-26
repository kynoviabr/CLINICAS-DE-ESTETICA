/** Aceite digital (proposta) e assinatura eletrônica (contrato): textos e regras de tela. */
export type IdentityCheck = 'birth_date' | 'cpf' | 'none';

export const identityLabel = (k: IdentityCheck) =>
  k === 'birth_date' ? 'Sua data de nascimento' : k === 'cpf' ? 'Os 3 primeiros números do seu CPF' : null;

export function identityReady(k: IdentityCheck, v: string) {
  if (k === 'birth_date') return /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (k === 'cpf') return v.replace(/\D/g, '').length === 3;
  return true;
}

export function signingError(reason: string | undefined, attemptsLeft?: number) {
  switch (reason) {
    case 'identity': return `Os dados não conferem com o cadastro na clínica.${attemptsLeft != null ? ` Restam ${attemptsLeft} tentativa(s).` : ''}`;
    case 'locked': return 'Link bloqueado por tentativas erradas. Peça um novo link à clínica.';
    case 'already_accepted': return 'Esta proposta já foi aceita.';
    case 'already_signed': return 'Este contrato já foi assinado.';
    case 'not_acceptable': return 'Esta proposta não pode mais ser aceita (venceu ou foi alterada). Fale com a clínica.';
    case 'not_signable': return 'Este contrato não pode ser assinado. Fale com a clínica.';
    case 'expired': return 'Este link venceu. Peça um novo à clínica.';
    case 'revoked': return 'Este link foi substituído pela clínica. Peça o mais recente.';
    default: return 'Link inválido ou erro inesperado. Tente de novo ou fale com a clínica.';
  }
}

/** Mensagem do WhatsApp para enviar o contrato. */
export function contractLinkMessage(firstName: string, clinicName: string, contractNumber: string, url: string) {
  return `Olá, ${firstName}! Aqui é da ${clinicName}. Seu contrato nº ${contractNumber} está pronto. Leia e assine pelo celular neste link seguro:\n\n${url}\n\nVai pedir seu nome completo e um dado do cadastro para confirmar que é você.`;
}

export function contractCopyMessage(firstName: string, clinicName: string, contractNumber: string, url: string) {
  return `Olá, ${firstName}! Aqui é da ${clinicName}. Segue a cópia do seu contrato nº ${contractNumber}. Você pode ler e baixar o PDF neste link seguro (vale 30 dias):\n\n${url}`;
}

export const contractCopyUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/contrato-copia/${token}`;

export const contractLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/contrato/${token}`;
