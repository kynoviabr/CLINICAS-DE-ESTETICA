// Pix "copia e cola" (BR Code estático do Banco Central): chave, nome, cidade, valor e identificador.
// Montado no navegador, sem banco intermediário e sem taxa. O QR Code é este mesmo texto.
import { isValidCpf, onlyDigits } from '@/lib/patients/validation';

export type PixKeyType = 'cpf_cnpj' | 'phone' | 'email' | 'random';

export const PIX_KEY_TYPES: Array<{ value: PixKeyType; label: string; placeholder: string }> = [
  { value: 'cpf_cnpj', label: 'CPF ou CNPJ', placeholder: '00.000.000/0001-00' },
  { value: 'phone', label: 'Celular', placeholder: '(11) 91234-5678' },
  { value: 'email', label: 'E-mail', placeholder: 'financeiro@clinica.com.br' },
  { value: 'random', label: 'Chave aleatória', placeholder: '123e4567-e89b-12d3-a456-426614174000' },
];

/** Chave no formato que o Pix espera (celular com +55, documento só com números...). Null se inválida. */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (type === 'cpf_cnpj') {
    const d = onlyDigits(v);
    if (d.length === 11) return isValidCpf(d) ? d : null;
    return d.length === 14 ? d : null;
  }
  if (type === 'phone') {
    let d = onlyDigits(v);
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? `+55${d}` : null;
  }
  if (type === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v.toLowerCase() : null;
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
}

/** Sem acentos e só caracteres aceitos pelo BR Code, cortado no tamanho máximo. */
export function pixText(value: string, max: number) {
  return (value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .toUpperCase();
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do BR Code. */
export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type PixPayload = { key: string; name: string; city: string; amount: number; txid?: string };

/** Texto "copia e cola" (também vai dentro do QR Code). */
export function pixCopyPaste({ key, name, city, amount, txid }: PixPayload) {
  const account = field('00', 'br.gov.bcb.pix') + field('01', key);
  const ref = (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amount > 0 ? field('54', amount.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', pixText(name, 25) || 'CLINICA') +
    field('60', pixText(city, 15) || 'BRASIL') +
    field('62', field('05', ref)) +
    '6304';
  return body + crc16(body);
}
