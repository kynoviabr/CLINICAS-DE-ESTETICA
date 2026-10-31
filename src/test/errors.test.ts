import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/lib/errors';

describe('errorMessage', () => {
  it('uses Error.message', () => expect(errorMessage(new Error('boom'), 'x')).toBe('boom'));
  it('uses message of plain objects (supabase errors)', () => expect(errorMessage({ message: 'rls' }, 'x')).toBe('rls'));
  it('falls back otherwise', () => {
    expect(errorMessage(null, 'x')).toBe('x');
    expect(errorMessage({ message: '' }, 'x')).toBe('x');
    expect(errorMessage('str', 'x')).toBe('x');
  });
});
