import { supabase } from '@/integrations/supabase/client';

export type MfaGate = 'ok' | 'enroll' | 'challenge';

/** Decide o que falta: cadastrar o autenticador, digitar o código ou nada. */
export function decideMfaGate(p: { required: boolean; hasVerifiedFactor: boolean; currentLevel: string | null; nextLevel: string | null }): MfaGate {
  if (p.hasVerifiedFactor && p.currentLevel !== 'aal2') return 'challenge';
  if (p.required && !p.hasVerifiedFactor) return 'enroll';
  return 'ok';
}

export async function loadMfaGate(): Promise<MfaGate> {
  const [{ data: aal }, { data: factors }, { data: policy }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
    supabase.rpc('my_mfa_policy'),
  ]);
  const verified = (factors?.totp || []).some((f) => f.status === 'verified');
  return decideMfaGate({
    required: !!(policy as { required?: boolean } | null)?.required,
    hasVerifiedFactor: verified,
    currentLevel: aal?.currentLevel ?? null,
    nextLevel: aal?.nextLevel ?? null,
  });
}

export const cleanCode = (v: string) => v.replace(/\D/g, '').slice(0, 6);
