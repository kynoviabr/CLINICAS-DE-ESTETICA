import { endOfMonth, format, parseISO, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** clinic_settings: meta mensal de dinheiro recebido (em reais). */
export const MONTHLY_GOAL_KEY = 'meta_recebido_mensal';

export type MonthKey = string; // 'yyyy-MM'

export function monthBounds(month: MonthKey) {
  const start = `${month}-01`;
  const end = format(endOfMonth(parseISO(start)), 'yyyy-MM-dd');
  return { start, end };
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return format(d, 'yyyy-MM');
}

export function monthLabel(month: MonthKey) {
  const label = format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface FinanceRow {
  id: string;
  status: string;
  due_date: string | null;
  amount: number;
  paid_at: string | null;
  paid_amount: number | null;
}

/**
 * Resumo do mês para a visão simples:
 * - recebido: pagas com data de pagamento no mês;
 * - aReceber: previstas que vencem no mês, de hoje em diante;
 * - atrasado: previstas vencidas (de qualquer mês até hoje).
 */
export function summarizeMonth(rows: FinanceRow[], month: MonthKey, today: string) {
  const { start, end } = monthBounds(month);
  let received = 0;
  let receivedCount = 0;
  let toReceive = 0;
  let toReceiveCount = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const r of rows) {
    if (r.status === 'pago') {
      if (r.paid_at && r.paid_at >= start && r.paid_at <= end) {
        received += Number(r.paid_amount ?? 0);
        receivedCount += 1;
      }
    } else if (r.status === 'previsto' && r.due_date) {
      if (r.due_date < today) {
        overdue += Number(r.amount || 0);
        overdueCount += 1;
      } else if (r.due_date >= start && r.due_date <= end) {
        toReceive += Number(r.amount || 0);
        toReceiveCount += 1;
      }
    }
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    received: round(received), receivedCount,
    toReceive: round(toReceive), toReceiveCount,
    overdue: round(overdue), overdueCount,
  };
}

/** Quanto da meta já entrou e o que falta. */
export function goalProgress(received: number, goal: number | null) {
  if (!goal || goal <= 0) return null;
  const pct = Math.min(100, Math.round((received / goal) * 100));
  return { pct, missing: Math.max(0, Math.round((goal - received) * 100) / 100) };
}

export function daysLate(dueDate: string, today: string) {
  return Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(dueDate)));
}

/** Mensagem gentil de cobrança para WhatsApp. */
export function chargeMessage(p: { clientName: string; clinicName: string; amount: number; dueDate: string; installment?: string }) {
  const first = p.clientName.trim().split(/\s+/)[0] || '';
  const value = p.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const due = format(parseISO(p.dueDate), 'dd/MM');
  return `Oi ${first}! Tudo bem? Aqui é da ${p.clinicName}. Passando para lembrar da parcela${p.installment ? ` ${p.installment}` : ''} de ${value} que venceu em ${due}. Posso te enviar a chave Pix?`;
}

export function parseGoal(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}
