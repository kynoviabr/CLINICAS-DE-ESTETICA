import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Estado simples (ex.: aba selecionada) guardado na URL (?chave=valor).
 * Assim a seleção sobrevive a recarregamentos, à volta para a aba do navegador
 * (inclusive quando o navegador descarta a aba em segundo plano) e pode ser compartilhada.
 */
export function useUrlState<T extends string>(key: string, defaultValue: T, allowed?: readonly T[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = (raw !== null && (!allowed || allowed.includes(raw as T)) ? raw : defaultValue) as T;

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === defaultValue) params.delete(key);
          else params.set(key, next);
          return params;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue] as const;
}
