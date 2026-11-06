import { addBusinessDays, format } from 'date-fns';
import { isInstallmentMethod, type PaymentConfig, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { onlyDigits } from '@/lib/patients/validation';

export interface SaleItem {
  treatment_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  num_sessions?: number;
  min_price?: number | null;
}

/** Validade padrão da proposta: 5 dias úteis (seg a sex; feriados não entram na conta). */
export const DEFAULT_VALIDITY_BUSINESS_DAYS = 5;

export const saleTotal = (items: SaleItem[]) =>
  Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100) / 100;

export const defaultValidUntil = (today = new Date()) => format(addBusinessDays(today, DEFAULT_VALIDITY_BUSINESS_DAYS), 'yyyy-MM-dd');

export function proposalNumber(now = new Date()) {
  return `PROP-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
}

export const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Itens abaixo do preço mínimo do tratamento (desconto fora da política). */
export function itemsBelowMinimum(items: SaleItem[]) {
  return items.filter((item) => item.min_price != null && item.unit_price < Number(item.min_price));
}

/** Confere a forma de pagamento da venda. Retorna a mensagem de erro ou null. */
export function validateSalePayment(methods: PaymentMethod[], config: PaymentConfig, total: number): string | null {
  if (methods.length === 0) return 'Escolha a forma de pagamento.';
  if (methods.some((m) => Number(config[m]?.amount || 0) <= 0)) return 'Informe o valor de cada forma de pagamento.';
  if (methods.filter(isInstallmentMethod).some((m) => Number(config[m]?.installments || 0) <= 0)) {
    return 'Crédito e boleto precisam do número de parcelas.';
  }
  const informed = methods.reduce((sum, m) => sum + Number(config[m]?.amount || 0), 0);
  if (informed + 0.009 < total) {
    return `A soma das formas de pagamento (${formatBRL(informed)}) precisa cobrir o total (${formatBRL(total)}).`;
  }
  return null;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface ProposalDocument {
  clinicName: string;
  clinicContact?: string | null;
  logoUrl?: string | null;
  accentColor?: string;
  number: string;
  date: Date;
  validUntil?: string | null;
  clientName: string;
  items: SaleItem[];
  total: number;
  paymentSummary?: string;
  notes?: string;
}

/** HTML da proposta (para PDF e impressão). Todo texto digitado é escapado. */
export function buildProposalHtml(doc: ProposalDocument): string {
  const accent = /^#[0-9a-f]{6}$/i.test(doc.accentColor || '') ? doc.accentColor : '#1a7a6d';
  const rows = doc.items.map((item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(item.name)}${item.num_sessions && item.num_sessions > 1 ? `<br><span style="color:#6b7280;font-size:12px">${item.num_sessions} sessões</span>` : ''}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${formatBRL(item.unit_price)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${formatBRL(item.quantity * item.unit_price)}</td>
      </tr>`).join('');
  const logo = doc.logoUrl && /^https:\/\//.test(doc.logoUrl)
    ? `<img src="${escapeHtml(doc.logoUrl)}" alt="" style="height:48px;max-width:160px;object-fit:contain" crossorigin="anonymous">`
    : '';
  const validity = doc.validUntil ? format(new Date(`${doc.validUntil}T12:00:00`), 'dd/MM/yyyy') : '';
  return `
  <div style="font-family:Arial,sans-serif;color:#1f2937;max-width:720px">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accent};padding-bottom:14px">
      <div>
        <div style="font-size:22px;font-weight:bold">${escapeHtml(doc.clinicName)}</div>
        ${doc.clinicContact ? `<div style="color:#6b7280;font-size:12px">${escapeHtml(doc.clinicContact)}</div>` : ''}
      </div>
      ${logo}
    </div>
    <h2 style="margin:20px 0 4px;font-size:18px">Proposta de tratamento</h2>
    <div style="color:#4b5563;font-size:13px">Nº ${escapeHtml(doc.number)} · ${format(doc.date, 'dd/MM/yyyy')}${validity ? ` · Válida até ${validity}` : ''}</div>
    <p style="margin:16px 0">Para: <strong>${escapeHtml(doc.clientName)}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:10px;text-align:left">Tratamento</th><th style="padding:10px">Qtd</th>
        <th style="padding:10px;text-align:right">Valor</th><th style="padding:10px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-size:20px;font-weight:bold;margin:16px 0">Total: ${formatBRL(doc.total)}</p>
    ${doc.paymentSummary ? `<p style="font-size:13px"><strong>Pagamento:</strong> ${escapeHtml(doc.paymentSummary)}</p>` : ''}
    ${doc.notes ? `<p style="font-size:13px;white-space:pre-line"><strong>Observações:</strong> ${escapeHtml(doc.notes)}</p>` : ''}
    <p style="margin-top:32px;color:#6b7280;font-size:12px">Os valores valem até a data de validade. Para aceitar, é só responder a mensagem ou falar com a clínica.</p>
  </div>`;
}

/** Mensagem curta para WhatsApp/e-mail. */
export function proposalShareText(p: { clientName: string; clinicName: string; number: string; total: number; validUntil?: string | null; items: SaleItem[] }) {
  const first = p.clientName.trim().split(/\s+/)[0] || '';
  const list = p.items.map((i) => `• ${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join('\n');
  const validity = p.validUntil ? ` Ela vale até ${format(new Date(`${p.validUntil}T12:00:00`), 'dd/MM')}.` : '';
  return `Oi ${first}! Segue sua proposta da ${p.clinicName} (nº ${p.number}):\n${list}\nTotal: ${formatBRL(p.total)}.${validity}\nQualquer dúvida, estou à disposição!`;
}

/** Link do WhatsApp com a mensagem pronta. Telefone brasileiro sem DDI ganha 55. */
export function whatsappLink(phone: string | null | undefined, text: string) {
  let digits = onlyDigits(phone);
  if (digits && digits.length <= 11) digits = `55${digits}`;
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string) {
  return `mailto:${encodeURIComponent((email || '').trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
