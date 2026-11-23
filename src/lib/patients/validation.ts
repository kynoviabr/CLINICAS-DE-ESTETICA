export const onlyDigits = (value: string | null | undefined) => (value || '').replace(/\D/g, '');

/** CPF válido pelos dígitos verificadores (aceita com ou sem pontuação). */
export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Telefone brasileiro com DDD: fixo (10 dígitos) ou celular (11 dígitos começando com 9). */
export function isValidPhone(value: string | null | undefined): boolean {
  let d = onlyDigits(value);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11 || d[0] === '0' || d[1] === '0') return false;
  if (d.length === 11) return d[2] === '9';
  return /[2-5]/.test(d[2]);
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export type PatientAddressParts = {
  address?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

/** "Rua X, 123, Apto 4 - Bairro..., Cidade/UF, CEP 00000-000" para ficha e contrato. */
export function formatPatientAddress(p: PatientAddressParts): string {
  const street = [p.address?.trim(), p.address_number?.trim(), p.address_complement?.trim()].filter(Boolean).join(', ');
  const cityUf = [p.city?.trim(), p.state?.trim()].filter(Boolean).join('/');
  const cep = p.zip_code?.trim() ? `CEP ${p.zip_code.trim()}` : '';
  return [street, cityUf, cep].filter(Boolean).join(', ');
}

export type PatientFieldErrors = Partial<Record<'cpf' | 'phone' | 'address_number', string>>;

/** Regras do cadastro completo de cliente. */
export function validatePatientFields(form: { cpf: string; phone: string; address: string; address_number: string }): PatientFieldErrors {
  const errors: PatientFieldErrors = {};
  if (!onlyDigits(form.cpf)) errors.cpf = 'CPF é obrigatório.';
  else if (!isValidCpf(form.cpf)) errors.cpf = 'CPF inválido. Confira os 11 dígitos.';
  if (!onlyDigits(form.phone)) errors.phone = 'Telefone é obrigatório.';
  else if (!isValidPhone(form.phone)) errors.phone = 'Telefone inválido. Use DDD + número, ex.: (13) 99702-1099.';
  if (form.address.trim() && !form.address_number.trim()) errors.address_number = 'Informe o número (ou "S/N").';
  return errors;
}

/** Traduz o bloqueio de CPF repetido do banco para uma mensagem clara. */
export function patientSaveErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; hint?: string } | null;
  if (e?.code === '23505' && (e.hint === 'cpf_duplicado' || e.message?.includes('CPF'))) {
    return e.message || 'CPF já cadastrado para outro cliente.';
  }
  return e?.message || 'Não foi possível salvar o cliente.';
}
