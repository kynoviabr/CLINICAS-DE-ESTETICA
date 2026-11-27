// Maquininhas da clínica: taxa e prazo que ela fechou com a operadora, e a conta do que realmente cai na conta.
export type Terminal = {
  id: string; name: string; active: boolean; credit_mode: 'flow' | 'advance' | string; advance_days: number; debit_days: number;
  debit_fee: number; credit_1_fee: number; credit_2_6_fee: number; credit_7_12_fee: number;
};

export function terminalFee(t: Terminal, type: 'credit' | 'debit', n: number) {
  if (type === 'debit') return Number(t.debit_fee);
  if (n <= 1) return Number(t.credit_1_fee);
  if (n <= 6) return Number(t.credit_2_6_fee);
  return Number(t.credit_7_12_fee);
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Prévia: quanto a clínica recebe e quando (igual ao cálculo do banco). */
export function cardSalePreview(t: Terminal, type: 'credit' | 'debit', n: number, gross: number, saleDate: string) {
  const parts = type === 'debit' ? 1 : Math.max(1, n);
  const feePct = terminalFee(t, type, parts);
  const fee = Math.round(gross * feePct) / 100;
  const net = Math.round((gross - fee) * 100) / 100;
  const dates = type === 'debit'
    ? [addDays(saleDate, t.debit_days)]
    : t.credit_mode === 'advance'
      ? [addDays(saleDate, t.advance_days)]
      : Array.from({ length: parts }, (_, i) => addDays(saleDate, 30 * (i + 1)));
  return { feePct, fee, net, dates };
}

export const describeTerminal = (t: Terminal) =>
  t.credit_mode === 'advance' ? `crédito antecipado em D+${t.advance_days}` : 'crédito no fluxo (30/60/90…)';
