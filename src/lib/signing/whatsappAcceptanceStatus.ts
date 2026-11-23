import { brasiliaDateTime } from '@/lib/documents/signatureSheet';

export type WhatsappAcceptanceRequest = {
  status: string;
  code: string;
  created_at: string;
  accepted_at: string | null;
  reply_text: string | null;
};

/** Frase da situação do pedido para a equipe (null quando não há o que mostrar). */
export function whatsappAcceptanceStatusText(r: WhatsappAcceptanceRequest | null): string | null {
  if (!r) return null;
  const sent = brasiliaDateTime(r.created_at).slice(0, 16).replace(' às ', ' ');
  if (r.status === 'pending') return `Enviado pelo WhatsApp em ${sent}. Aguardando a cliente responder "DE ACORDO ${r.code}".`;
  if (r.status === 'changed') return 'A cliente respondeu DE ACORDO, mas o documento mudou depois do envio. Envie de novo.';
  if (r.status === 'expired') return 'O pedido pelo WhatsApp venceu sem resposta. Envie de novo.';
  if (r.status === 'accepted' && r.accepted_at) return `A cliente respondeu "${r.reply_text ?? 'DE ACORDO'}" pelo WhatsApp em ${brasiliaDateTime(r.accepted_at)}.`;
  return null;
}
