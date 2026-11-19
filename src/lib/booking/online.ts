import { supabase } from '@/integrations/supabase/client';

export const publicBookingUrl = (origin: string, slug: string) => `${origin.replace(/\/$/, '')}/agendar/${slug}`;

export type OnlineSlot = { start: string; end: string; professionalId: string; professionalName: string | null };
export type Fail = { ok: false; reason: string };
export const isFail = (r: unknown): r is Fail => !!r && (r as Fail).ok === false;

/** Chama a função agendamento-online (com o login do portal, se houver). */
export async function callBooking<T>(body: Record<string, unknown>): Promise<T | Fail> {
  const { data, error } = await supabase.functions.invoke('agendamento-online', { body });
  if (data) return data as T | Fail;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { return (await ctx.json()) as Fail; } catch { /* sem corpo */ }
  }
  return { ok: false, reason: 'network' };
}

export function bookingError(reason: string) {
  switch (reason) {
    case 'disabled': return 'O agendamento online desta clínica está desligado. Fale com a clínica pelo WhatsApp.';
    case 'slot_unavailable': return 'Esse horário acabou de ser ocupado. Escolha outro.';
    case 'too_many': return 'Recebemos vários pedidos deste telefone hoje. A clínica vai entrar em contato.';
    case 'invalid_phone': return 'Informe um WhatsApp com DDD.';
    case 'invalid_name': return 'Informe seu nome completo.';
    case 'not_allowed': return 'Este tratamento não pode ser marcado por aqui. Fale com a clínica.';
    case 'network': return 'Sem conexão. Tente de novo.';
    default: return 'Algo deu errado. Tente de novo ou fale com a clínica.';
  }
}
