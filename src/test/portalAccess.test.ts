import { describe, expect, it } from 'vitest';
import { nextPortalStep, portalLinkMessage, portalLinkUrl } from '@/lib/portal/access';

describe('portal sem senha', () => {
  it('link e mensagem', () => {
    const url = portalLinkUrl('https://x/', 'b'.repeat(64));
    expect(url).toBe(`https://x/portal/entrar/${'b'.repeat(64)}`);
    expect(portalLinkMessage('Ana Lima', 'Clínica', url)).toContain('Não precisa de senha');
  });
  it('próximo passo: anamnese, depois contrato', () => {
    expect(nextPortalStep({ anamnese_status: 'none', has_birth_date: true, contracts_to_sign: 1 })?.kind).toBe('anamnese');
    expect(nextPortalStep({ anamnese_status: 'expired', has_birth_date: false, contracts_to_sign: 0 })?.canAct).toBe(false);
    expect(nextPortalStep({ anamnese_status: 'valid', has_birth_date: true, contracts_to_sign: 1 })?.kind).toBe('contract');
    expect(nextPortalStep({ anamnese_status: 'valid', has_birth_date: true, contracts_to_sign: 0 })).toBeNull();
  });
});
