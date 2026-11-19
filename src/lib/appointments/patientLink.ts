import { publicOrigin } from '@/lib/publicOrigin';
import { supabase } from '@/integrations/supabase/client';

/** Endereço que o paciente abre para confirmar, remarcar ou cancelar. */
export const appointmentLinkUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/agendamento/${token}`;

/** Equipe: gera o link (vale até o horário do atendimento). */
export async function createAppointmentLink(appointmentId: string, origin = publicOrigin()) {
  const { data, error } = await supabase.rpc('create_appointment_link', { p_appointment_id: appointmentId });
  if (error) throw error;
  const r = data as { token: string; expires_at: string };
  return { url: appointmentLinkUrl(origin, r.token), expiresAt: r.expires_at };
}

/** Mensagem do lembrete com o link. */
export function reminderMessage(p: { firstName: string; clinicName: string; service: string; when: string; professional?: string | null; url: string }) {
  return [
    `Olá, ${p.firstName}! Passando para lembrar do seu atendimento na *${p.clinicName}*:`,
    '',
    `✨ *Procedimento:* ${p.service}`,
    `📅 *Data:* ${p.when}`,
    ...(p.professional ? [`👩‍⚕️ *Com:* ${p.professional}`] : []),
    '',
    'Confirme sua presença, remarque ou cancele por este link:',
    `👉 ${p.url}`,
    '',
    'Qualquer dúvida, é só responder esta mensagem.',
  ].join('\n');
}

export type PatientView = {
  ok: true;
  clinic: { name: string; phone: string | null; address: string | null; city: string | null; state: string | null; logo_url: string | null; primary_color: string | null } | null;
  firstName: string;
  appointment: { start: string; end: string; status: string; serviceName: string; professionalName: string | null };
  state: 'ok' | 'expired' | 'closed';
  canConfirm: boolean;
  canChange: boolean;
  canReschedule: boolean;
  changeDeadline: string;
  lastDay: string;
};
export type PatientSlots = { ok: true; from: string; to: string; slots: { start: string; end: string }[]; until: string; lastDay: string };
export type Fail = { ok: false; reason: string };
export const isFail = (r: unknown): r is Fail => !!r && (r as Fail).ok === false;

/** Paciente (sem login): chama a função agendamento-paciente. */
export async function callPatientLink<T>(token: string, action: string, extra: Record<string, unknown> = {}): Promise<T | Fail> {
  const { data, error } = await supabase.functions.invoke('agendamento-paciente', { body: { token, action, ...extra } });
  if (data) return data as T | Fail;
  // Erros 4xx/5xx chegam como error, com o corpo dentro.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { return (await ctx.json()) as Fail; } catch { /* corpo não é JSON */ }
  }
  return { ok: false, reason: 'network' };
}

export function patientLinkError(reason: string): string {
  switch (reason) {
    case 'invalid': return 'Link inválido. Confira se copiou o endereço completo ou peça um novo à clínica.';
    case 'deadline': return 'O prazo para remarcar ou cancelar pelo link já passou. Fale com a clínica.';
    case 'slot_unavailable': return 'Esse horário acabou de ser ocupado. Escolha outro.';
    case 'no_professional': return 'Este atendimento não pode ser remarcado pelo link. Fale com a clínica.';
    case 'not_allowed': return 'Não dá para confirmar este atendimento agora.';
    case 'network': return 'Sem conexão. Verifique a internet e tente de novo.';
    default: return 'Algo deu errado. Tente de novo ou fale com a clínica.';
  }
}

/** "2026-11-20T14:30:00-03:00" -> partes no horário de Brasília, sem depender do fuso do celular. */
export function localParts(iso: string) {
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "quinta, 20 de nov" */
export function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const label = `${WEEK[wd]}, ${d} de ${MONTHS[m - 1]}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Agrupa horários por dia. */
export function groupByDay(slots: { start: string }[]) {
  const map = new Map<string, string[]>();
  for (const s of slots) {
    const { date, time } = localParts(s.start);
    map.set(date, [...(map.get(date) || []), time]);
  }
  return [...map.entries()].map(([date, times]) => ({ date, times }));
}

export const addDaysIso = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
