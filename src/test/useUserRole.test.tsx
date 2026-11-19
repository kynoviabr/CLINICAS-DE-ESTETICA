import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let currentUser: { id: string } | null = null;
let roleRow: { role: string; clinic_id: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: table === 'user_roles' ? roleRow : null, error: null }),
    };
    return chain;
  };
  return { supabase: { from: builder } };
});

import { useUserRole } from '@/hooks/useUserRole';

describe('useUserRole', () => {
  beforeEach(() => {
    currentUser = null;
    roleRow = null;
  });

  it('logo após o login não diz "sem perfil" antes de consultar o banco', async () => {
    const renders: Array<{ userId: string | null; loading: boolean; resolved: boolean; role: string | null }> = [];
    const { result, rerender } = renderHook(() => {
      const value = useUserRole();
      renders.push({ userId: currentUser?.id ?? null, loading: value.loading, resolved: value.resolved, role: value.role });
      return value;
    });
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.role).toBeNull();

    // Login: o usuário chega, mas a consulta ainda não voltou.
    currentUser = { id: 'u1' };
    roleRow = { role: 'admin', clinic_id: 'c1' };
    rerender();

    await waitFor(() => expect(result.current.role).toBe('admin'));
    expect(result.current.clinicId).toBe('c1');

    // Em nenhum momento, já logado, a tela recebeu "pronto e sem perfil".
    const falsoSemPerfil = renders.filter((r) => r.userId === 'u1' && !r.loading && r.resolved && r.role === null);
    expect(falsoSemPerfil).toHaveLength(0);
  });

  it('usuário sem perfil termina como resolvido e sem papel', async () => {
    currentUser = { id: 'u2' };
    const { result } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.role).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
