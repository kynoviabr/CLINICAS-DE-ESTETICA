import { supabase } from '@/integrations/supabase/client';
import { callWhatsapp } from '@/hooks/useWhatsapp';
import type { WhatsappAcceptanceRequest } from '@/lib/signing/whatsappAcceptanceStatus';

export { whatsappAcceptanceStatusText, type WhatsappAcceptanceRequest } from '@/lib/signing/whatsappAcceptanceStatus';

export type WhatsappAcceptanceKind = 'proposal' | 'contract';

/**
 * Pede o "DE ACORDO" pelo WhatsApp da Aura: o banco cria o pedido e devolve a mensagem exata
 * (link do documento + "Responda DE ACORDO 1234"); a função whatsapp envia na conversa da cliente.
 * Se o envio falhar, o pedido é cancelado para uma resposta antiga não valer.
 */
export async function requestWhatsappAcceptance(kind: WhatsappAcceptanceKind, documentId: string, linkUrl: string) {
  const { data, error } = await supabase.rpc('create_whatsapp_acceptance', { p_kind: kind, p_document_id: documentId, p_link_url: linkUrl });
  if (error) throw new Error(error.message);
  const req = data as { request_id: string; conversation_id: string; message: string; code: string };
  try {
    await callWhatsapp('send_text', { conversationId: req.conversation_id, text: req.message });
  } catch (e) {
    await supabase.rpc('cancel_whatsapp_acceptance', { p_request_id: req.request_id });
    throw e;
  }
  return req;
}

/** Último pedido do documento (a tela mostra se está aguardando a resposta). */
export async function loadWhatsappAcceptance(kind: WhatsappAcceptanceKind, documentId: string): Promise<WhatsappAcceptanceRequest | null> {
  const { data } = await supabase.from('whatsapp_acceptance_requests')
    .select('status, code, created_at, accepted_at, reply_text')
    .eq('document_kind', kind).eq('document_id', documentId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as WhatsappAcceptanceRequest | null) ?? null;
}
