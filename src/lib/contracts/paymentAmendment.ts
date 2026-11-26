// Textos e contas da revisão de forma de pagamento (aditivo).
export const METHOD_LABEL: Record<string, string> = {
  pix: 'Pix', credit: 'Cartão de crédito', debit: 'Cartão de débito', cash: 'Dinheiro', boleto: 'Boleto', transfer: 'Transferência', card: 'Cartão', other: 'Outro',
};
export const splittable = (method: string) => method === 'credit' || method === 'boleto';
export const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brDate = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export type NewMethod = { method: string; amount: number; installments?: number; card_brand?: string; card_last4?: string };
export type OldInstallment = { method: string; number: number; count: number; due_date: string; amount: number };
export type PaymentChanges = { open_balance: number; before: OldInstallment[]; after: { methods: NewMethod[]; first_due: string } };

/** "Cartão de crédito: R$ 400,00 em 4x de R$ 100,00" */
export function describeMethod(m: NewMethod) {
  const n = m.installments && m.installments > 1 ? m.installments : 1;
  const card = m.card_brand || m.card_last4 ? ` (${[m.card_brand, m.card_last4 ? `final ${m.card_last4}` : ''].filter(Boolean).join(' ')})` : '';
  return `${METHOD_LABEL[m.method] || m.method}${card}: ${brl(m.amount)}${n > 1 ? ` em ${n}x de ${brl(m.amount / n)}` : ' à vista'}`;
}

/** "Boleto 2/3 · vence 10/12/2026 · R$ 300,00" */
export const describeInstallment = (i: OldInstallment) =>
  `${METHOD_LABEL[i.method] || i.method}${i.count > 1 ? ` ${i.number}/${i.count}` : ''} · vence ${brDate(i.due_date)} · ${brl(i.amount)}`;
