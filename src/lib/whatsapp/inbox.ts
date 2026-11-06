/** Regras do WhatsApp que a tela precisa (janela de 24h, nomes, modelos). */

export const WINDOW_HOURS = 24;

export type WaConversation = {
  id: string;
  clinic_id: string;
  external_id: string;
  contact_phone: string | null;
  contact_name: string | null;
  lead_id: string | null;
  patient_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  last_incoming_at: string | null;
  unread_count: number;
  leads?: { full_name: string | null } | null;
  patients?: { full_name: string | null } | null;
};

export type WaMessage = {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  body: string | null;
  attachments: Array<{ type?: string }> | null;
  status: 'received' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  error: string | null;
  sent_at: string;
};

export type WaTemplate = { name: string; language: string; category: string; body: string; variables: number };

/** Pode responder com texto livre? Só até 24h depois da última mensagem da cliente. */
export function isWindowOpen(lastIncomingAt: string | null | undefined, now = new Date()): boolean {
  if (!lastIncomingAt) return false;
  return now.getTime() - new Date(lastIncomingAt).getTime() < WINDOW_HOURS * 3600 * 1000;
}

/** "Responda em até 5h" / "Responda em até 40 min". */
export function windowLeftLabel(lastIncomingAt: string | null | undefined, now = new Date()): string | null {
  if (!isWindowOpen(lastIncomingAt, now)) return null;
  const left = WINDOW_HOURS * 3600 * 1000 - (now.getTime() - new Date(lastIncomingAt!).getTime());
  const hours = Math.floor(left / 3600000);
  return hours >= 1 ? `Responda em até ${hours}h` : `Responda em até ${Math.max(1, Math.round(left / 60000))} min`;
}

/** (11) 95021-0668 a partir de 5511950210668 (o WhatsApp sempre manda com o código do país). */
export function displayPhone(phone: string | null | undefined): string {
  const raw = String(phone || '').replace(/\D/g, '');
  if (!((raw.length === 12 || raw.length === 13) && raw.startsWith('55'))) return raw ? `+${raw}` : '';
  const d = raw.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${raw}`;
}

/** Nome que aparece na lista: paciente > lead > nome do WhatsApp > telefone. */
export function conversationTitle(c: Pick<WaConversation, 'contact_name' | 'contact_phone' | 'leads' | 'patients'>): string {
  return c.patients?.full_name || c.leads?.full_name || c.contact_name || displayPhone(c.contact_phone) || 'Contato';
}

/** Troca {{1}}, {{2}}... pelos valores digitados. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, n) => params[Number(n) - 1] || match);
}

export function messageText(m: Pick<WaMessage, 'body' | 'attachments'>): string {
  if (m.body) return m.body;
  const type = m.attachments?.[0]?.type;
  const labels: Record<string, string> = { image: '📷 Foto', video: '🎬 Vídeo', audio: '🎤 Áudio', file: '📎 Arquivo', sticker: 'Figurinha' };
  return (type && labels[type]) || '📎 Anexo';
}
