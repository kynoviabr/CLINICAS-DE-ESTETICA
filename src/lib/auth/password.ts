/** Regra de senha do Clinova: no mínimo 8 caracteres, com letras e números. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, com letras e números`;

/** Devolve o motivo da recusa, ou null quando a senha serve. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(password)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos um número.';
  return null;
}
