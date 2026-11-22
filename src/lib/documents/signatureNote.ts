import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { escapeHtml } from '@/lib/documents/letterhead';

export type SignatureNote = { signerName: string; signedAt: string; documentHash?: string | null; label?: string };

/** Quadro "assinado eletronicamente" no fim do PDF e da impressão (até a folha de assinatura completa). */
export function signatureNoteHtml(s: SignatureNote | null | undefined) {
  if (!s) return '';
  const when = format(new Date(s.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const hash = s.documentHash ? `<div style="margin-top:4px;word-break:break-all;font-size:10px;color:#047857">Código de integridade (SHA-256): ${escapeHtml(s.documentHash)}</div>` : '';
  return `<div style="margin-top:24px;padding:10px 12px;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:8px;font:12px Arial,sans-serif;color:#065f46;break-inside:avoid">${escapeHtml(s.label || 'Assinado eletronicamente')} por <strong>${escapeHtml(s.signerName)}</strong> em ${when}.${hash}</div>`;
}
