import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { matchCatalogArea, syncMessage } from '@/lib/setup/categorySync';

describe('categoria ligada ao catálogo de tratamentos', () => {
  const areas = ['Estética Facial', 'Injetáveis', 'Peelings'];

  it('acha a área do catálogo sem ligar para acento e maiúsculas', () => {
    expect(matchCatalogArea('estetica facial ', areas)).toBe('Estética Facial');
    expect(matchCatalogArea('INJETÁVEIS', areas)).toBe('Injetáveis');
    expect(matchCatalogArea('Meu protocolo', areas)).toBeNull();
  });

  it('mensagem resume o que mudou no rol', () => {
    expect(syncMessage({ added: 10, reactivated: 0, deactivated: 0 })).toBe('10 tratamento(s) do catálogo adicionados.');
    expect(syncMessage({ added: 0, reactivated: 0, deactivated: 3 })).toBe('3 tratamento(s) saíram do rol.');
    expect(syncMessage({ added: 0, reactivated: 0, deactivated: 0 })).toBeNull();
  });
});
