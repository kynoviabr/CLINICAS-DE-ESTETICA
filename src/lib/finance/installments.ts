export type InstallmentStatus = 'previsto' | 'pago' | 'cancelado';
export type InstallmentSituation = 'paga' | 'atrasada' | 'a_vencer' | 'cancelada';

export type ContractInstallment = {
  id: string;
  contract_id: string;
  installment_number: number;
  installments_count: number;
  payment_method: string | null;
  due_date: string | null;
  amount: number;
  status: InstallmentStatus | string;
  paid_at: string | null;
  paid_amount: number | null;
  paid_method: string | null;
  notes?: string | null;
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card: 'Cartão',
  boleto: 'Boleto',
  other: 'Outro',
};

export const SITUATION_LABELS: Record<InstallmentSituation, string> = {
  paga: 'Paga',
  atrasada: 'Atrasada',
  a_vencer: 'A vencer',
  cancelada: 'Cancelada',
};

export function paymentMethodLabel(method?: string | null) {
  return (method && PAYMENT_METHOD_LABELS[method]) || method || '—';
}

/** Data local no formato YYYY-MM-DD (vencimentos são datas sem fuso). */
export function todayIso(now: Date = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Atraso é derivado: parcela prevista com vencimento antes de hoje. */
export function installmentSituation(
  installment: Pick<ContractInstallment, 'status' | 'due_date'>,
  today: string = todayIso(),
): InstallmentSituation {
  if (installment.status === 'pago') return 'paga';
  if (installment.status === 'cancelado') return 'cancelada';
  if (installment.due_date && installment.due_date < today) return 'atrasada';
  return 'a_vencer';
}
