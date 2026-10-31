import { describe, expect, it } from 'vitest';
import { errorMessage, functionError } from '@/lib/errors';

describe('errorMessage', () => {
  it('uses Error.message', () => expect(errorMessage(new Error('boom'), 'x')).toBe('boom'));
  it('uses message of plain objects (supabase errors)', () => expect(errorMessage({ message: 'rls' }, 'x')).toBe('rls'));
  it('falls back otherwise', () => {
    expect(errorMessage(null, 'x')).toBe('x');
    expect(errorMessage({ message: '' }, 'x')).toBe('x');
    expect(errorMessage('str', 'x')).toBe('x');
  });
});

describe('functionError', () => {
  it('uses the error message from the function body', async () => {
    const err = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Este e-mail já está vinculado a outra clínica.' }), { status: 409 }),
    });
    expect((await functionError(err)).message).toBe('Este e-mail já está vinculado a outra clínica.');
  });
  it('keeps the original error otherwise', async () => {
    expect((await functionError(new Error('rede'))).message).toBe('rede');
  });
});
