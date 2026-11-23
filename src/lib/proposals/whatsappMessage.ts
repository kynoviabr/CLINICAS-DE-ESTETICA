// Mensagem da proposta para o WhatsApp: curta, organizada e com um link só (ver e aprovar).
import { formatBRL } from './sale';

export type ProposalMessageInput = {
  clientName: string;
  clinicName?: string | null;
  number: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  standardTotal: number;
  finalTotal: number;
  discountAmount?: number;
  discountPercent?: number;
  paymentSummary?: string | null;
  validUntil?: string | null; // dd/MM/aaaa
  approveUrl: string;
  pdfAttached: boolean;
};

export function proposalWhatsAppMessage(p: ProposalMessageInput) {
  const first = p.clientName.trim().split(/\s+/)[0] || '';
  const lines: string[] = [];
  lines.push(`Olá${first ? `, ${first}` : ''}!`);
  lines.push(`Segue a sua proposta da *${p.clinicName || 'clínica'}* (nº ${p.number}).`);
  lines.push('');
  lines.push('*Tratamentos*');
  for (const i of p.items) {
    const qty = i.quantity > 1 ? ` (${i.quantity}x)` : '';
    lines.push(`• ${i.name}${qty}: ${formatBRL(i.unitPrice * i.quantity)}`);
  }
  lines.push('');
  if ((p.discountAmount || 0) > 0) {
    lines.push(`De ${formatBRL(p.standardTotal)} por *${formatBRL(p.finalTotal)}*${p.discountPercent ? ` (${p.discountPercent}% de desconto)` : ''}`);
  } else {
    lines.push(`*Total: ${formatBRL(p.finalTotal)}*`);
  }
  if (p.paymentSummary) lines.push(`Pagamento: ${p.paymentSummary}`);
  if (p.validUntil) lines.push(`Válida até ${p.validUntil}`);
  lines.push('');
  lines.push('Para ver os detalhes e *aprovar a proposta*, toque no link:');
  lines.push(p.approveUrl);
  lines.push('');
  lines.push(p.pdfAttached ? 'O PDF da proposta está anexado. Qualquer dúvida, é só responder aqui.' : 'Qualquer dúvida, é só responder aqui.');
  return lines.join('\n');
}
