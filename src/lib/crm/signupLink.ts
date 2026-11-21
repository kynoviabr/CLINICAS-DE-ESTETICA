// Cadastro feito pelo próprio lead: link, mensagem do WhatsApp, validação e avisos para a equipe.
import { isValidCpf, isValidPhone, onlyDigits } from '@/lib/patients/validation';

/** Endereço que o lead abre para se cadastrar. */
export const leadSignupUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/cadastro/${token}`;

/** Mensagem pronta para o WhatsApp. */
export function leadSignupMessage(fullName: string | null | undefined, clinicName: string | undefined, url: string) {
  const raw = (fullName || '').trim();
  const first = raw && raw !== 'Contato do WhatsApp' ? raw.split(/\s+/)[0] : '';
  return `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicName || 'clínica'}. Para agilizar seu agendamento, faça seu cadastro rapidinho pelo link abaixo (nome completo, data de nascimento, CPF e WhatsApp):\n\n${url}\n\nO link é pessoal e vale por 7 dias.`;
}

export type LeadSignupForm = { fullName: string; birthDate: string; cpf: string; phone: string; consent: boolean };
export type LeadSignupErrors = Partial<Record<keyof LeadSignupForm, string>>;

/** Mesmas regras do banco (lead_signup_submit), para avisar antes de enviar. */
export function validateLeadSignup(f: LeadSignupForm, today = new Date()): LeadSignupErrors {
  const e: LeadSignupErrors = {};
  const name = f.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 5 || !name.includes(' ')) e.fullName = 'Digite seu nome completo.';
  const iso = today.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) || f.birthDate < '1900-01-01' || f.birthDate > iso) e.birthDate = 'Confira a data de nascimento.';
  if (!isValidCpf(f.cpf)) e.cpf = 'CPF inválido. Confira os números.';
  if (!isValidPhone(f.phone)) e.phone = 'Confira o WhatsApp com DDD.';
  if (!f.consent) e.consent = 'Para continuar, autorize o uso dos seus dados.';
  return e;
}

/** WhatsApp sem o 55 do país, para comparar e preencher o campo. */
export function localPhone(value: string | null | undefined) {
  const d = onlyDigits(value);
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

/** Avisos do cadastro que a equipe precisa ver. */
export const SIGNUP_FLAG_LABELS: Record<string, string> = {
  cpf_duplicate: 'CPF já usado em outro cadastro: confira se é a mesma pessoa.',
  phone_changed: 'Informou outro WhatsApp no cadastro.',
};
