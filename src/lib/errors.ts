/** Mensagem legível de um erro desconhecido (catch), com texto padrão. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message || fallback;
  }
  return fallback;
}

/**
 * Erro de uma Edge Function com a mensagem que ela devolveu no corpo.
 * O supabase-js só diz "non-2xx status code"; a explicação útil vem em { error }.
 */
export async function functionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context;
  if (typeof Response !== 'undefined' && context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error) return new Error(body.error);
    } catch {
      // corpo não é JSON: cai na mensagem padrão
    }
  }
  return error instanceof Error ? error : new Error(errorMessage(error, 'Erro inesperado.'));
}
