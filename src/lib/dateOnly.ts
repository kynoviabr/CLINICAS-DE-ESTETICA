/**
 * Formata uma data sem horário vinda do banco ("1968-06-21") como dd/mm/aaaa.
 *
 * Não use `new Date("1968-06-21")`: o JavaScript lê essa string como meia-noite
 * UTC, e no Brasil (UTC-3) ela vira 20/06 às 21h, mostrando um dia antes.
 */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
