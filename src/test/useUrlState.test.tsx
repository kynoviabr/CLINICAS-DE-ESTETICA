import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useUrlState } from '@/hooks/useUrlState';

const wrapper = (url: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };

describe('useUrlState', () => {
  it('lê o valor da URL', () => {
    const { result } = renderHook(() => useUrlState('aba', 'a', ['a', 'b'] as const), { wrapper: wrapper('/x?aba=b') });
    expect(result.current[0]).toBe('b');
  });

  it('volta ao padrão quando o valor da URL não é permitido', () => {
    const { result } = renderHook(() => useUrlState('subaba', 'treatments', ['treatments', 'combos'] as const), {
      wrapper: wrapper('/x?subaba=groups-permissions'),
    });
    expect(result.current[0]).toBe('treatments');
  });

  it('chaves diferentes não interferem entre si (Configurações + Tratamentos embutido)', () => {
    const { result } = renderHook(
      () => ({ settings: useUrlState<string>('aba', 'general'), inner: useUrlState('subaba', 'treatments', ['treatments', 'combos'] as const) }),
      { wrapper: wrapper('/settings?aba=treatments') },
    );
    act(() => result.current.inner[1]('combos'));
    expect(result.current.settings[0]).toBe('treatments');
    expect(result.current.inner[0]).toBe('combos');
  });
});
