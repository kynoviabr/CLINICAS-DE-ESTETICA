/** Link pessoal de entrada no portal (sem senha). */
export const portalLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/portal/entrar/${token}`;

export function portalLinkMessage(fullName: string, clinicName: string, url: string) {
  const first = fullName.trim().split(/\s+/)[0] || '';
  return `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicName}. Este é o seu acesso ao portal do paciente: veja suas sessões, contrato, pagamentos e fotos, e preencha sua anamnese.\n\n${url}\n\nNão precisa de senha. O link é pessoal e vale por 30 dias.`;
}

/** Próximo passo mostrado no topo do portal. */
export function nextPortalStep(s: { anamnese_status: string | null; has_birth_date: boolean; contracts_to_sign: number } | null | undefined) {
  if (!s) return null;
  if (s.anamnese_status !== 'valid') return { kind: 'anamnese' as const, title: 'Preencha sua anamnese', text: 'Leva uns 5 minutos e deixa seu atendimento mais seguro.', canAct: s.has_birth_date };
  if (s.contracts_to_sign > 0) return { kind: 'contract' as const, title: 'Contrato aguardando assinatura', text: 'A clínica vai te enviar o link para assinar pelo celular.', canAct: false };
  return null;
}
