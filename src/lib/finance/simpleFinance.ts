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

// ---------- Previsto na agenda ----------

export interface ScheduledAppt {
  id: string;
  start_time: string;
  status: string;
  appointment_type: string | null;
  contract_id: string | null;
  treatment: { name: string | null; price: number | null; default_price: number | null } | null;
}

const OPEN_STATUSES = ['scheduled', 'confirmed', 'in_progress'];

/**
 * Valor dos atendimentos agendados que ainda vão virar faturamento.
 * - Sessão de pacote já vendido (com contrato) não soma: já está nas parcelas "a receber".
 * - Avaliação e atendimento sem tratamento não somam.
 * - Avulso agendado soma pelo preço do tratamento.
 */
export function summarizeScheduled(appts: ScheduledAppt[]) {
  let total = 0;
  let count = 0;
  let packageSessions = 0;
  const byTreatment = new Map<string, { name: string; count: number; total: number }>();
  for (const a of appts) {
    if (!OPEN_STATUSES.includes(a.status)) continue;
    if (a.contract_id) { packageSessions += 1; continue; }
    if (a.appointment_type === 'evaluation' || !a.treatment) continue;
    const value = Number(a.treatment.default_price ?? a.treatment.price ?? 0);
    if (value <= 0) continue;
    total += value;
    count += 1;
    const name = a.treatment.name || 'Tratamento';
    const cur = byTreatment.get(name) || { name, count: 0, total: 0 };
    byTreatment.set(name, { name, count: cur.count + 1, total: cur.total + value });
  }
  return {
    total: Math.round(total * 100) / 100,
    count,
    packageSessions,
    byTreatment: [...byTreatment.values()].sort((a, b) => b.total - a.total),
  };
}

/** Potencial do mês = recebido + a receber + previsto na agenda. */
export function monthPotential(received: number, toReceive: number, scheduled: number) {
  return Math.round((received + toReceive + scheduled) * 100) / 100;
}
