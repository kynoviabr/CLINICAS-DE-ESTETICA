import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { formatBRL } from '@/lib/proposals/sale';

// ---------- Funil de interessadas (4 colunas fixas sobre as etapas do CRM) ----------

export const FUNNEL_COLUMNS = [
  { key: 'interessada', label: 'Interessada', stages: ['new_lead', 'contacted'] },
  { key: 'avaliacao', label: 'Avaliação marcada', stages: ['scheduled'] },
  { key: 'proposta', label: 'Proposta enviada', stages: ['proposal_sent', 'negotiating', 'attended'] },
  { key: 'fechou', label: 'Fechou no mês', stages: ['closed_won'] },
] as const;
export type FunnelColumnKey = (typeof FUNNEL_COLUMNS)[number]['key'];

export function funnelColumnOf(stage: string | null | undefined): FunnelColumnKey | null {
  const s = stage || 'new_lead';
  return FUNNEL_COLUMNS.find((c) => (c.stages as readonly string[]).includes(s))?.key ?? null;
}

/** Dias sem contato: último contato registrado, ou a última mudança de etapa, ou a criação. */
export function daysWithoutContact(
  lead: { last_interaction_at?: string | null; stage_changed_at?: string | null; created_at?: string | null },
  now: Date,
) {
  const ref = lead.last_interaction_at || lead.stage_changed_at || lead.created_at;
  return ref ? Math.max(0, differenceInCalendarDays(now, new Date(ref))) : 0;
}

// ---------- Horários livres ----------

type Window = { start_time: string; end_time: string };
type Busy = { start: Date; end: Date };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Horários livres de um dia (início de cada bloco de `slotMinutes`) dentro das janelas de atendimento,
 * sem conflitar com atendimentos marcados.
 */
export function freeSlots(windows: Window[], busy: Busy[], slotMinutes = 60): string[] {
  const busyRanges = busy.map((b) => [minutesOf(b.start), minutesOf(b.end)] as const);
  const result = new Set<number>();
  for (const w of windows) {
    const end = toMinutes(w.end_time);
    for (let t = toMinutes(w.start_time); t + slotMinutes <= end; t += slotMinutes) {
      const overlaps = busyRanges.some(([bs, be]) => t < be && t + slotMinutes > bs);
      if (!overlaps) result.add(t);
    }
  }
  return [...result].sort((a, b) => a - b).map((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
}

// ---------- Manutenção: quem está na hora de voltar ----------

export const RENEWAL_DAYS = 60;

/**
 * Clientes cuja última sessão realizada foi há mais de `days` dias e que não têm nada marcado à frente.
 * Retorna do mais antigo para o mais recente.
 */
export function clientsToRenew(
  appts: Array<{ patient_id: string | null; start_time: string; status: string }>,
  now: Date,
  days = RENEWAL_DAYS,
) {
  const last = new Map<string, Date>();
  const hasFuture = new Set<string>();
  for (const a of appts) {
    if (!a.patient_id) continue;
    const when = new Date(a.start_time);
    if (when > now && !['cancelled', 'no_show', 'rescheduled'].includes(a.status)) hasFuture.add(a.patient_id);
    if (a.status === 'completed' && when <= now) {
      const prev = last.get(a.patient_id);
      if (!prev || when > prev) last.set(a.patient_id, when);
    }
  }
  return [...last.entries()]
    .filter(([id, when]) => !hasFuture.has(id) && differenceInCalendarDays(now, when) > days)
    .map(([patientId, when]) => ({ patientId, lastVisit: when, days: differenceInCalendarDays(now, when) }))
    .sort((a, b) => b.days - a.days);
}

// ---------- O que fazer hoje ----------

export type TaskKind = 'confirmar' | 'retomar' | 'proposta' | 'cobrar' | 'renovar';
export interface DayTask {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  phone: string | null;
  message: string;
  priority: number; // menor = mais importante
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || '';

export function buildDayTasks(input: {
  now: Date;
  clinicName: string;
  tomorrowUnconfirmed: Array<{ id: string; name: string; phone: string | null; start_time: string; service: string | null }>;
  coldLeads: Array<{ id: string; name: string; phone: string | null; days: number; interest: string | null }>;
  expiringProposals: Array<{ id: string; name: string; phone: string | null; valid_until: string; total: number; number: string }>;
  overdue: Array<{ id: string; name: string; phone: string | null; amount: number; due_date: string }>;
  toRenew: Array<{ patientId: string; name: string; phone: string | null; days: number }>;
  limitPerKind?: number;
}): DayTask[] {
  const limit = input.limitPerKind ?? 3;
  const tasks: DayTask[] = [];
  input.tomorrowUnconfirmed.slice(0, limit).forEach((a) => {
    const hour = format(new Date(a.start_time), 'HH:mm');
    tasks.push({
      id: `confirmar-${a.id}`, kind: 'confirmar', priority: 1,
      title: `Confirmar ${a.name} amanhã às ${hour}`,
      detail: a.service ? `${a.service} · ainda não confirmou` : 'Ainda não confirmou',
      phone: a.phone,
      message: `Oi ${firstName(a.name)}! Tudo bem? Confirmando seu horário amanhã às ${hour}${a.service ? ` (${a.service})` : ''} aqui na ${input.clinicName}. Posso contar com você?`,
    });
  });
  input.expiringProposals.slice(0, limit).forEach((p) => {
    const due = format(parseISO(p.valid_until), 'dd/MM');
    tasks.push({
      id: `proposta-${p.id}`, kind: 'proposta', priority: 2,
      title: `Proposta de ${p.name} vence ${due}`,
      detail: `${formatBRL(p.total)} · nº ${p.number}`,
      phone: p.phone,
      message: `Oi ${firstName(p.name)}! Sua proposta na ${input.clinicName} vale até ${due}. Quer que eu já reserve seus horários?`,
    });
  });
  input.coldLeads.slice(0, limit).forEach((l) => {
    tasks.push({
      id: `retomar-${l.id}`, kind: 'retomar', priority: 3,
      title: `Retomar ${l.name}`,
      detail: `${l.days} dias sem contato${l.interest ? ` · ${l.interest}` : ''}`,
      phone: l.phone,
      message: `Oi ${firstName(l.name)}! Passando para saber se ficou alguma dúvida${l.interest ? ` sobre ${l.interest}` : ''}. Tenho horários para avaliação esta semana. Quer que eu reserve um?`,
    });
  });
  input.overdue.slice(0, limit).forEach((o) => {
    const due = format(parseISO(o.due_date), 'dd/MM');
    tasks.push({
      id: `cobrar-${o.id}`, kind: 'cobrar', priority: 4,
      title: `Parcela atrasada: ${o.name}`,
      detail: `${formatBRL(o.amount)} · venceu ${due}`,
      phone: o.phone,
      message: `Oi ${firstName(o.name)}! Aqui é da ${input.clinicName}. Lembrando da parcela de ${formatBRL(o.amount)} que venceu em ${due}. Posso te enviar a chave Pix?`,
    });
  });
  input.toRenew.slice(0, limit).forEach((r) => {
    tasks.push({
      id: `renovar-${r.patientId}`, kind: 'renovar', priority: 5,
      title: `Hora de voltar: ${r.name}`,
      detail: `Última sessão há ${r.days} dias · nada marcado`,
      phone: r.phone,
      message: `Oi ${firstName(r.name)}! Faz um tempinho desde sua última sessão aqui na ${input.clinicName}. Que tal agendar a manutenção para manter o resultado?`,
    });
  });
  return tasks.sort((a, b) => a.priority - b.priority);
}

// ---------- A frase do dinheiro ----------

export function moneyInsight(p: { received: number; goal: number | null; toReceive: number; negotiating: number; negotiatingCount: number; scheduled?: number }) {
  if (!p.goal) return 'Defina a meta do mês no Financeiro para acompanhar quanto falta.';
  const missing = p.goal - p.received;
  if (missing <= 0) return 'Meta do mês batida! Tudo o que entrar agora é extra.';
  const afterInstallments = missing - p.toReceive;
  if (afterInstallments <= 0) return `Faltam ${formatBRL(missing)}. As parcelas que vencem neste mês já cobrem a meta: acompanhe os recebimentos.`;
  const scheduled = p.scheduled ?? 0;
  if (scheduled > 0 && afterInstallments - scheduled <= 0) {
    return `Faltam ${formatBRL(missing)}. Com as parcelas do mês e os ${formatBRL(scheduled)} já agendados, você bate a meta: foque em confirmar a agenda.`;
  }
  if (p.negotiating >= afterInstallments && p.negotiatingCount > 0) {
    return `Recebendo as parcelas do mês, faltam ${formatBRL(afterInstallments)}. As ${p.negotiatingCount} propostas em aberto (${formatBRL(p.negotiating)}) cobrem isso: vale retomar hoje.`;
  }
  return `Recebendo as parcelas do mês, ainda faltam ${formatBRL(afterInstallments)}. Chame interessadas e clientes para renovar.`;
}
