import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { cleanCode, decideMfaGate } from '@/lib/auth/mfa';

describe('duas etapas', () => {
  it('pede código quando já cadastrou e a sessão ainda não passou pela segunda etapa', () => {
    expect(decideMfaGate({ required: false, hasVerifiedFactor: true, currentLevel: 'aal1', nextLevel: 'aal2' })).toBe('challenge');
  });
  it('pede cadastro quando é obrigatório e não cadastrou', () => {
    expect(decideMfaGate({ required: true, hasVerifiedFactor: false, currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('enroll');
  });
  it('libera quando já validou ou não é obrigatório', () => {
    expect(decideMfaGate({ required: true, hasVerifiedFactor: true, currentLevel: 'aal2', nextLevel: 'aal2' })).toBe('ok');
    expect(decideMfaGate({ required: false, hasVerifiedFactor: false, currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('ok');
  });
  it('código só com 6 números', () => {
    expect(cleanCode('12 34-567')).toBe('123456');
  });
});
