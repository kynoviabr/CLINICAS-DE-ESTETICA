import { describe, expect, it } from 'vitest';
import { defaultAppUrl, HOMOLOG_APP_URL, PRODUCTION_APP_URL } from '@/lib/publicOrigin';

describe('endereço do site', () => {
  it('produção usa o domínio oficial; homologação usa o site de teste', () => {
    expect(defaultAppUrl('https://tunoirtswleljvyohdxp.supabase.co')).toBe(PRODUCTION_APP_URL);
    expect(PRODUCTION_APP_URL).toBe('https://app.estetica.kynovia.com.br');
    expect(defaultAppUrl('https://majqksguuwmjhuuwjltj.supabase.co')).toBe(HOMOLOG_APP_URL);
  });
});
