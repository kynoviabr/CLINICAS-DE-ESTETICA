import { describe, expect, it } from 'vitest';
import { formatDateOnly } from '@/lib/dateOnly';

describe('formatDateOnly', () => {
  it('mostra o mesmo dia salvo, sem voltar um dia por fuso horário', () => {
    expect(formatDateOnly('1968-06-21')).toBe('21/06/1968');
    expect(formatDateOnly('2000-01-01')).toBe('01/01/2000');
  });

  it('aceita valor com horário e ignora o horário', () => {
    expect(formatDateOnly('1968-06-21T00:00:00+00:00')).toBe('21/06/1968');
  });

  it('devolve null para vazio ou inválido', () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
    expect(formatDateOnly('')).toBeNull();
    expect(formatDateOnly('21/06/1968')).toBeNull();
  });
});
