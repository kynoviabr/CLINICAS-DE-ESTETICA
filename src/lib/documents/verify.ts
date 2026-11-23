import { METHOD_LABELS } from '@/lib/documents/signatureSheet';

/** Resposta de verify_document (sem dados pessoais). */
export type VerifyResult =
  | { found: false; reason: 'format' | 'not_found' }
  | {
    found: true;
    verification_code: string;
    document_kind: string;
    document_label: string;
    clinic_name: string | null;
    accepted_at: string;
    method: string | null;
    signer_initials: string | null;
    document_hash: string;
    integrity: 'same' | 'changed' | 'unavailable';
    hash_matches: boolean | null;
  };

/** "c22d0 e777d" -> "C22D0-E777D"; null quando não tem 10 letras e números do código. */
export function normalizeVerificationCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-F]/g, '');
  return raw.length === 10 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : null;
}

export const verifyPath = (code: string) => `/verificar/${code}`;

/** Frases da página de conferência. */
export function verifyTexts(r: VerifyResult) {
  if (!r.found) {
    const reason = (r as { reason: string }).reason;
    return {
      ok: false,
      title: reason === 'format' ? 'Código incompleto' : 'Código não encontrado',
      detail: reason === 'format'
        ? 'O código de verificação tem 10 letras e números, como C22D0-E777D. Ele fica na folha de assinatura, no fim do documento.'
        : 'Não há aceite registrado com este código. Confira se digitou igual ao que está na folha de assinatura.',
    };
  }
  const f = r as Extract<VerifyResult, { found: true }>;
  const integrity = {
    same: 'O documento guardado pela clínica é o mesmo que foi aceito.',
    changed: 'Atenção: o documento guardado pela clínica foi alterado depois do aceite. Vale o texto que foi aceito na data acima.',
    unavailable: 'O documento não está mais disponível no sistema da clínica; o registro do aceite continua guardado.',
  }[f.integrity];
  const hash = f.hash_matches === null ? null
    : f.hash_matches ? 'O código de integridade (SHA-256) informado é o mesmo do registro.'
      : 'O código de integridade (SHA-256) informado é diferente do registro: o arquivo pode ter sido alterado.';
  return {
    ok: f.integrity !== 'changed' && f.hash_matches !== false,
    title: 'Aceite registrado',
    detail: integrity,
    hash,
    method: (f.method && METHOD_LABELS[f.method]) || 'Eletrônico',
  };
}
