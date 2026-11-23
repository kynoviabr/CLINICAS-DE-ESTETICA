import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WaConversation, WaMessage, WaTemplate } from '@/lib/whatsapp/inbox';

const CONV_SELECT = 'id, clinic_id, external_id, contact_phone, contact_name, lead_id, patient_id, last_message_at, last_message_preview, last_message_direction, last_incoming_at, unread_count, leads(full_name), patients(full_name)';

export class WhatsappError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

/** Chama a função do servidor `whatsapp` e devolve a mensagem de erro dela. */
export async function callWhatsapp<T = Record<string, unknown>>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp', { body: { action, ...payload } });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null) as { error?: string; code?: string } | null;
      if (body?.error) throw new WhatsappError(body.error, body.code);
    }
    throw new WhatsappError(error.message);
  }
  if (data?.error) throw new WhatsappError(data.error, data.code);
  return data as T;
}

/** Atualiza as consultas quando chega mensagem nova (tempo real). */
function useRealtime(clinicId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clinicId) return;
    const channel = supabase
      .channel(`wa-${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `clinic_id=eq.${clinicId}` }, () => {
        qc.invalidateQueries({ queryKey: ['wa-conversations', clinicId] });
        qc.invalidateQueries({ queryKey: ['wa-conversation-for'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `clinic_id=eq.${clinicId}` }, (payload) => {
        const convId = (payload.new as { conversation_id?: string })?.conversation_id;
        if (convId) qc.invalidateQueries({ queryKey: ['wa-messages', convId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinicId, qc]);
}

export function useWhatsappChannel(clinicId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa-channel', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_channels').select('*').eq('clinic_id', clinicId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });
}

export function useWhatsappConversations(clinicId: string | null | undefined) {
  useRealtime(clinicId);
  return useQuery({
    queryKey: ['wa-conversations', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_conversations').select(CONV_SELECT)
        .eq('clinic_id', clinicId!).order('last_message_at', { ascending: false, nullsFirst: false }).limit(300);
      if (error) throw error;
      return (data || []) as unknown as WaConversation[];
    },
    enabled: !!clinicId,
    refetchInterval: 60_000,
  });
}

/** Conversa de um lead ou paciente (para o painel dentro da ficha). */
export function useConversationFor(clinicId: string | null | undefined, ref: { leadId?: string | null; patientId?: string | null }) {
  useRealtime(clinicId);
  return useQuery({
    queryKey: ['wa-conversation-for', ref.leadId || null, ref.patientId || null],
    queryFn: async () => {
      let q = supabase.from('whatsapp_conversations').select(CONV_SELECT).eq('clinic_id', clinicId!);
      if (ref.patientId && ref.leadId) q = q.or(`patient_id.eq.${ref.patientId},lead_id.eq.${ref.leadId}`);
      else if (ref.patientId) q = q.eq('patient_id', ref.patientId);
      else q = q.eq('lead_id', ref.leadId!);
      const { data, error } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as WaConversation | null;
    },
    enabled: !!clinicId && !!(ref.leadId || ref.patientId),
  });
}

export function useWhatsappMessages(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa-messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_messages')
        .select('id, conversation_id, direction, body, attachments, status, error, sent_at, sent_by_ai')
        .eq('conversation_id', conversationId!).order('sent_at', { ascending: true }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    enabled: !!conversationId,
  });
}

export function useWhatsappTemplates(clinicId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['wa-templates', clinicId],
    queryFn: async () => (await callWhatsapp<{ templates: WaTemplate[] }>('templates', { clinicId })).templates,
    enabled: !!clinicId && enabled,
    staleTime: 10 * 60 * 1000,
  });
}
