import { describe, expect, it } from 'vitest';
import { passwordProblem } from '@/lib/auth/password';

describe('passwordProblem', () => {
  it('rejects short passwords', () => expect(passwordProblem('ab12')).toMatch(/8 caracteres/));
  it('requires a letter', () => expect(passwordProblem('12345678')).toMatch(/letra/));
  it('requires a number', () => expect(passwordProblem('abcdefgh')).toMatch(/número/));
  it('accepts letters and numbers', () => expect(passwordProblem('clinova2026')).toBeNull());
});
