import { addBusinessDays, format } from 'date-fns';
import { isInstallmentMethod, type PaymentConfig, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { onlyDigits } from '@/lib/patients/validation';
import { accentOf, buildLetterhead, escapeHtml, type ClinicLetterhead } from '@/lib/documents/letterhead';

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

export interface ProposalDocument {
  clinicName: string;
  clinicContact?: string | null;
  logoUrl?: string | null;
  accentColor?: string;
  /** Dados completos da clínica para o papel timbrado (CNPJ, endereço...). */
  clinic?: ClinicLetterhead | null;
  number: string;
  date: Date;
  validUntil?: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  items: SaleItem[];
  total: number;
  paymentSummary?: string;
  notes?: string;
}

/**
 * Orçamento (proposta) para PDF e impressão. Segue o art. 40 do CDC: serviços e valores discriminados,
 * condições de pagamento, validade e prazo. Todo texto digitado é escapado.
 */
export function buildProposalHtml(doc: ProposalDocument): string {
  const clinic: ClinicLetterhead = doc.clinic ?? { name: doc.clinicName, logoUrl: doc.logoUrl, accentColor: doc.accentColor };
  const accent = accentOf(clinic.accentColor ?? doc.accentColor);
  const td = 'padding:9px 10px;border-bottom:1px solid #e5e7eb';
  const rows = doc.items.map((item) => `
      <tr>
        <td style="${td}">${escapeHtml(item.name)}</td>
        <td style="${td};text-align:center">${item.num_sessions && item.num_sessions > 1 ? `${item.num_sessions}` : '1'}</td>
        <td style="${td};text-align:center">${item.quantity}</td>
        <td style="${td};text-align:right">${formatBRL(item.unit_price)}</td>
        <td style="${td};text-align:right">${formatBRL(item.quantity * item.unit_price)}</td>
      </tr>`).join('');
  const validity = doc.validUntil ? format(new Date(`${doc.validUntil}T12:00:00`), 'dd/MM/yyyy') : '';
  const contactLine = [doc.clientPhone, doc.clientEmail].filter(Boolean).join(' · ');
  const header = doc.clinic
    ? buildLetterhead(clinic)
    : `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:18px">
        <div><div style="font-size:22px;font-weight:bold">${escapeHtml(doc.clinicName)}</div>
        ${doc.clinicContact ? `<div style="color:#6b7280;font-size:12px">${escapeHtml(doc.clinicContact)}</div>` : ''}</div>
        ${clinic.logoUrl && /^https:\/\//.test(clinic.logoUrl) ? `<img src="${escapeHtml(clinic.logoUrl)}" alt="" style="height:48px;max-width:160px;object-fit:contain" crossorigin="anonymous">` : ''}
      </div>`;
  const conditions = [
    validity ? `Este orçamento é válido até <strong>${validity}</strong>. Após essa data, valores e condições podem ser revistos.` : 'Este orçamento é válido por 10 (dez) dias a contar da emissão.',
    'Os valores incluem os produtos e materiais utilizados nas sessões descritas.',
    'A realização dos procedimentos depende de avaliação e anamnese, que podem indicar ajustes no protocolo.',
    'O intervalo entre as sessões é definido pelo(a) profissional responsável. O tratamento começa após a assinatura do contrato e a confirmação do pagamento ou da primeira parcela.',
    'Este orçamento não constitui contrato. As condições completas (cancelamento, faltas, prazos e proteção de dados) constam do contrato de prestação de serviços.',
  ];
  return `
  <div style="font-family:Arial,sans-serif;color:#1f2937;max-width:720px">
    ${header}
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0;font-size:19px">Orçamento de tratamento</h2>
      <div style="color:#4b5563;font-size:12px">Nº ${escapeHtml(doc.number)} · Emitido em ${format(doc.date, 'dd/MM/yyyy')}${validity ? ` · Válido até ${validity}` : ''}</div>
    </div>
    <div style="margin:14px 0;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:13px">
      <div><strong>Cliente:</strong> ${escapeHtml(doc.clientName)}</div>
      ${contactLine ? `<div style="color:#4b5563">${escapeHtml(contactLine)}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:${accent};color:#fff">
        <th style="padding:9px 10px;text-align:left">Tratamento / procedimento</th><th style="padding:9px 10px">Sessões</th><th style="padding:9px 10px">Qtd</th>
        <th style="padding:9px 10px;text-align:right">Valor unit.</th><th style="padding:9px 10px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-size:20px;font-weight:bold;margin:14px 0">Total: ${formatBRL(doc.total)}</p>
    ${doc.paymentSummary ? `<div style="font-size:13px;margin:10px 0"><strong>Condições de pagamento:</strong> ${escapeHtml(doc.paymentSummary)}</div>` : ''}
    ${doc.notes ? `<div style="font-size:13px;white-space:pre-line;margin:10px 0"><strong>Observações:</strong> ${escapeHtml(doc.notes)}</div>` : ''}
    <div style="margin-top:16px;font-size:12px;color:#374151">
      <strong>Condições gerais</strong>
      <ul style="margin:6px 0 0 18px;padding:0">${conditions.map((c) => `<li style="margin:3px 0">${c}</li>`).join('')}</ul>
    </div>
    <div style="display:flex;gap:32px;margin-top:44px;font-size:12px">
      <div style="flex:1;border-top:1px solid #9ca3af;padding-top:6px">De acordo: ${escapeHtml(doc.clientName)}<br><span style="color:#6b7280">Data: ____/____/______</span></div>
      <div style="flex:1;border-top:1px solid #9ca3af;padding-top:6px">${escapeHtml(clinic.name)}</div>
    </div>
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
