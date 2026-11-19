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

import { groupRetention, retentionMessage } from '@/lib/retention/lists';

describe('rotinas de retorno', () => {
  it('mensagem por motivo', () => {
    expect(retentionMessage({ kind: 'maintenance', full_name: 'Ana Lima', treatment_name: 'Toxina' }, 'Clínica X')).toContain('manutenção do seu Toxina');
    expect(retentionMessage({ kind: 'birthday', full_name: 'Ana', treatment_name: null }, 'X')).toContain('Feliz aniversário');
  });
  it('agrupa por aba', () => {
    const base = { patient_id: 'p', full_name: 'A', phone: null, treatment_id: null, treatment_name: null, reference_date: '2026-11-20', detail: '' };
    const g = groupRetention([{ ...base, kind: 'inactive' }, { ...base, kind: 'birthday' }, { ...base, kind: 'inactive' }]);
    expect(g.inactive).toHaveLength(2);
    expect(g.birthday).toHaveLength(1);
    expect(g.maintenance).toHaveLength(0);
  });
});

import { referralError, referralShareText, referralUrl } from '@/lib/referral/referral';

describe('indicação de amigos', () => {
  it('link e mensagem', () => {
    const url = referralUrl('https://x/', 'ab12cd34');
    expect(url).toBe('https://x/indicar/ab12cd34');
    expect(referralShareText('Clínica X', url)).toContain(url);
    expect(referralError('invalid_phone')).toContain('DDD');
  });
});
