import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { proposalLinkErrorMessage, proposalLinkUrl, summarizeLinks } from '@/lib/proposals/publicLink';

describe('link seguro da proposta', () => {
  it('monta a URL pelo código', () => {
    expect(proposalLinkUrl('a'.repeat(64), 'https://app.x')).toBe(`https://app.x/proposta/${'a'.repeat(64)}`);
  });

  it('mensagens para o cliente', () => {
    expect(proposalLinkErrorMessage('expired')).toContain('venceu');
    expect(proposalLinkErrorMessage('revoked')).toContain('substituído');
    expect(proposalLinkErrorMessage(undefined)).toContain('inválido');
  });

  it('resume links: ativos, última abertura e total de aberturas', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const s = summarizeLinks([
      { created_at: '2026-11-01', expires_at: '2026-11-16T00:00:00Z', revoked_at: null, first_opened_at: '2026-11-02T10:00:00Z', last_opened_at: '2026-11-03T10:00:00Z', open_count: 2 },
      { created_at: '2026-11-18', expires_at: '2026-12-03T00:00:00Z', revoked_at: null, first_opened_at: null, last_opened_at: null, open_count: 0 },
      { created_at: '2026-11-19', expires_at: '2026-12-04T00:00:00Z', revoked_at: '2026-11-19T13:00:00Z', first_opened_at: null, last_opened_at: null, open_count: 0 },
    ], now);
    expect(s).toEqual({ total: 3, active: 1, activeUntil: '2026-12-03T00:00:00Z', lastOpened: '2026-11-03T10:00:00Z', opens: 2 });
  });
});
