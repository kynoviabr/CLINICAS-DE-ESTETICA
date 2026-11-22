// Sinal para garantir o horário (docs/SINAL.md): configuração, situações, mensagens e recibo.
import { buildLetterhead, documentFooter, escapeHtml, formatClinicDocument, type ClinicLetterhead } from '@/lib/documents/letterhead';
import { formatBRL } from '@/lib/proposals/sale';
import type { PixKeyType } from '@/lib/finance/pix';
import { brasiliaDateTime, buildSignatureSheet } from '@/lib/documents/signatureSheet';

export const DEPOSIT_CONFIG_KEY = 'deposit_config';

export type DepositConfig = {
  pix_key_type: PixKeyType;
  pix_key: string;          // já normalizada (ver normalizePixKey)
  pix_name: string;         // nome do recebedor, como no banco
  pix_city: string;
  amount_evaluation: number;
  amount_procedure: number;
  pay_hours: number;        // prazo para pagar
  notice_hours: number;     // antecedência para remarcar/cancelar sem perder o sinal
  credit_days: number;      // validade do crédito após remarcar/cancelar no prazo
  default_on: boolean;      // "Cobrar sinal?" já vem marcado
  policy_text: string;      // vazio = texto padrão
};

export const DEFAULT_DEPOSIT_CONFIG: DepositConfig = {
  pix_key_type: 'cpf_cnpj', pix_key: '', pix_name: '', pix_city: '',
  amount_evaluation: 50, amount_procedure: 100,
  pay_hours: 24, notice_hours: 24, credit_days: 90,
  default_on: false, policy_text: '',
};

export function parseDepositConfig(raw: string | null | undefined): DepositConfig {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_DEPOSIT_CONFIG, ...(v && typeof v === 'object' ? v : {}) };
  } catch {
    return { ...DEFAULT_DEPOSIT_CONFIG };
  }
}

export const depositReady = (c: DepositConfig) => !!(c.pix_key && c.pix_name.trim() && c.pix_city.trim());

export const defaultPolicyText = (noticeHours: number) =>
  `O sinal é abatido do seu atendimento ou tratamento. Em caso de falta, ou cancelamento com menos de ${noticeHours} horas de antecedência, ele não é devolvido.`;

export type DepositStatus = 'pending' | 'paid' | 'applied' | 'retained' | 'refunded' | 'cancelled';

export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; tone: string }> = {
  pending: { label: 'Aguardando sinal', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  paid: { label: 'Sinal pago', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  applied: { label: 'Sinal abatido', tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  retained: { label: 'Sinal retido', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  refunded: { label: 'Sinal devolvido', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelled: { label: 'Cobrança cancelada', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** Sinais que contam como dinheiro recebido pela clínica (o abatido já está na parcela do contrato). */
export const DEPOSIT_RECEIVED: DepositStatus[] = ['paid', 'retained'];

/** Valor padrão conforme o tipo do agendamento. */
export const defaultDepositAmount = (c: DepositConfig, appointmentType: string) =>
  appointmentType === 'evaluation' ? c.amount_evaluation : c.amount_procedure;

export const depositUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/sinal/${token}`;

// ---------- valor por extenso ----------

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function upTo999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]);
    else parts.push([TENS[Math.floor(rest / 10)], UNITS[rest % 10]].filter(Boolean).join(' e '));
  }
  return parts.join(' e ');
}

function integerWords(n: number): string {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'um milhão' : `${upTo999(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${upTo999(thousands)} mil`);
  if (rest) parts.push(upTo999(rest));
  if (parts.length === 1) return parts[0];
  // "mil e cem", "mil duzentos e trinta": "e" antes do último grupo só quando ele é redondo ou menor que 100.
  const last = parts.pop()!;
  const joinWithE = rest > 0 && (rest < 100 || rest % 100 === 0);
  return `${parts.join(' ')}${joinWithE ? ' e ' : ' '}${last}`;
}

/** R$ 1.250,50 -> "mil duzentos e cinquenta reais e cinquenta centavos". */
export function brlInWords(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const w = integerWords(reais);
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${w}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (c > 0) parts.push(`${integerWords(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
  return parts.length ? parts.join(' e ') : 'zero reais';
}

// ---------- mensagens ----------

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "terça-feira, 25/11/2026, às 14:00" no fuso do navegador. */
export function appointmentWhen(iso: string, withYear = true) {
  const d = new Date(iso);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${withYear ? `/${d.getFullYear()}` : ''}`;
  return `${WEEKDAYS[d.getDay()]}, ${date}, às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const appointmentWhat = (kind: string | null | undefined, treatment: string | null | undefined) =>
  kind === 'evaluation' ? `avaliação${treatment ? ` (${treatment})` : ''}` : treatment || 'atendimento';

const firstName = (name: string | null | undefined) => {
  const n = (name || '').trim();
  return n && n !== 'Contato do WhatsApp' ? n.split(/\s+/)[0] : '';
};

export function depositRequestMessage(p: {
  clientName: string | null | undefined; clinicName: string; amount: number; startTime: string;
  kind: string | null | undefined; treatment: string | null | undefined; url: string; dueAt: string | null; noticeHours: number;
}) {
  const first = firstName(p.clientName);
  const due = p.dueAt ? appointmentWhen(p.dueAt).replace(/^[^,]+, /, '') : null;
  return [
    `Olá${first ? `, ${first}` : ''}! Aqui é da ${p.clinicName}.`,
    `Seu horário está reservado: *${appointmentWhen(p.startTime)}*, ${appointmentWhat(p.kind, p.treatment)}.`,
    '',
    `Para garantir a reserva, pedimos um sinal de *${formatBRL(p.amount)}* pelo Pix${due ? `, até ${due}` : ''}. Ele é abatido do seu atendimento.`,
    '',
    'No link abaixo estão o QR Code, o código "copia e cola" e as condições:',
    p.url,
    '',
    `Se precisar remarcar, é só avisar com pelo menos ${p.noticeHours} horas de antecedência.`,
  ].join('\n');
}

export function depositReceiptMessage(p: {
  clientName: string | null | undefined; amount: number; startTime: string; kind: string | null | undefined;
  treatment: string | null | undefined; noticeHours: number; url: string; pdfAttached: boolean;
}) {
  const first = firstName(p.clientName);
  return [
    `Olá${first ? `, ${first}` : ''}! Recebemos seu sinal de ${formatBRL(p.amount)} 💚`,
    `Seu horário está *confirmado*: ${appointmentWhen(p.startTime, false)}, ${appointmentWhat(p.kind, p.treatment)}.`,
    '',
    `${p.pdfAttached ? 'Segue o recibo.' : `Seu recibo: ${p.url}`} O valor será abatido do seu atendimento. Se precisar remarcar, avise com pelo menos ${p.noticeHours} horas de antecedência e o sinal fica como crédito para o novo horário.`,
    ...(p.pdfAttached ? ['', `Recibo também neste link: ${p.url}`] : []),
    '',
    'Até lá!',
  ].join('\n');
}

// ---------- recibo ----------

export type DepositReceiptData = {
  clinic: ClinicLetterhead;
  number: string;
  amount: number;
  paidAt: string;
  payerName: string;
  payerCpf?: string | null;
  clientName: string;
  kind: string | null | undefined;
  treatment: string | null | undefined;
  startTime: string;
  professional?: string | null;
  noticeHours: number;
  creditDays: number;
  policyAcceptedAt?: string | null;
  policyAcceptedIp?: string | null;
  policyAcceptedUserAgent?: string | null;
  confirmedBy?: string | null;
};

const dateBr = (iso: string) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const dateTimeBr = (iso: string) => { const d = new Date(iso); return `${dateBr(iso)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Recibo do sinal em HTML (vira PDF com generateContractPDF). Todo texto vindo do banco é escapado. */
export function buildDepositReceiptHtml(r: DepositReceiptData): string {
  const e = escapeHtml;
  const doc = formatClinicDocument(r.clinic.document);
  const docLabel = doc.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ';
  const place = [r.clinic.city, r.clinic.state].filter(Boolean).join('/');
  const address = [r.clinic.address, place].filter(Boolean).join(', ');
  const payerCpf = r.payerCpf ? formatClinicDocument(r.payerCpf) : '';
  const what = r.kind === 'evaluation' ? `Avaliação${r.treatment ? ` (${r.treatment})` : ''}` : r.treatment || 'Atendimento';
  const n = r.noticeHours;
  const accepted = r.policyAcceptedAt ? `, aceitas pela cliente em ${e(dateTimeBr(r.policyAcceptedAt))}` : '';
  const li = (title: string, text: string) => `<li style="margin-bottom:6px"><strong>${title}</strong> ${text}</li>`;
  return `
  ${buildLetterhead(r.clinic)}
  <div style="font-family:Arial,sans-serif;color:#111827;font-size:13px;line-height:1.55">
    <h1 style="font-size:18px;margin:0 0 4px">Recibo de sinal nº ${e(r.number)}</h1>
    <p style="margin:0 0 14px;color:#4b5563">Valor: <strong style="color:#111827">${e(formatBRL(r.amount))}</strong></p>
    <p style="margin:0 0 12px">
      <strong>${e(r.clinic.name)}</strong>${doc ? `, inscrita no ${docLabel} sob o nº ${e(doc)}` : ''}${address ? `, com endereço em ${e(address)}` : ''},
      declara que recebeu de <strong>${e(r.payerName)}</strong>${payerCpf ? `, CPF ${e(payerCpf)}` : ''}, a quantia de
      <strong>${e(formatBRL(r.amount))} (${e(brlInWords(r.amount))})</strong>, paga via Pix em ${e(dateBr(r.paidAt))},
      a título de <strong>sinal para garantia de reserva de horário</strong>, conforme abaixo:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 14px;font-size:13px">
      <tr><td style="padding:4px 0;color:#4b5563;width:38%">Cliente atendida</td><td style="padding:4px 0">${e(r.clientName)}</td></tr>
      <tr><td style="padding:4px 0;color:#4b5563">Atendimento reservado</td><td style="padding:4px 0">${e(what)}</td></tr>
      <tr><td style="padding:4px 0;color:#4b5563">Data e horário</td><td style="padding:4px 0">${e(appointmentWhen(r.startTime))}</td></tr>
      ${r.professional ? `<tr><td style="padding:4px 0;color:#4b5563">Profissional</td><td style="padding:4px 0">${e(r.professional)}</td></tr>` : ''}
    </table>
    <p style="margin:0 0 6px"><strong>Condições do sinal</strong>${accepted}:</p>
    <ol style="margin:0 0 12px;padding-left:20px">
      ${li('Abatimento.', 'O valor deste sinal será integralmente abatido do valor do atendimento reservado ou do tratamento contratado a partir dele. O sinal não é uma cobrança a mais.')}
      ${li('Comparecimento.', 'Comparecendo no horário reservado, o sinal é usado conforme o item 1.')}
      ${li('Remarcação ou cancelamento com antecedência.', `Avisando a clínica com pelo menos ${n} horas de antecedência, a cliente pode remarcar o atendimento. O sinal fica como crédito para o novo horário, válido por ${r.creditDays} dias.`)}
      ${li('Falta ou cancelamento fora do prazo.', `Não comparecendo, ou cancelando com menos de ${n} horas de antecedência, o sinal não será devolvido. Ele compensa a reserva do horário e da profissional, que deixou de ser oferecido a outras clientes.`)}
      ${li('Cancelamento pela clínica.', 'Se a clínica cancelar ou não puder realizar o atendimento, a cliente escolhe entre remarcar, mantendo o crédito, ou receber o valor de volta integralmente.')}
      ${li('Contraindicação.', 'Se, na avaliação, a profissional indicar que o procedimento não é recomendado para a cliente, o sinal será devolvido integralmente ou mantido como crédito para outro tratamento, à escolha da cliente.')}
      ${li('Natureza do sinal.', 'O pagamento do sinal não obriga a cliente a contratar outros tratamentos além do atendimento reservado.')}
    </ol>
    <p style="margin:0 0 14px;color:#4b5563">Este sinal tem natureza de arras confirmatórias, nos termos dos arts. 417 e 418 do Código Civil.</p>
    <p style="margin:0">${e(r.clinic.city || '')}${r.clinic.city ? ', ' : ''}${e(dateBr(r.paidAt))}.</p>
  </div>
  ${documentFooter(`Recibo emitido eletronicamente por ${r.clinic.name}${r.confirmedBy ? `, confirmado por ${r.confirmedBy}` : ''} em ${dateTimeBr(r.paidAt)}.${r.clinic.phone ? ` Dúvidas: ${r.clinic.phone}.` : ''}`)}
  ${buildSignatureSheet({
    documentLabel: `Recibo de sinal nº ${r.number}`,
    issuer: `Emitido por ${r.clinic.name}. Recebimento confirmado${r.confirmedBy ? ` por ${r.confirmedBy}` : ''} em ${brasiliaDateTime(r.paidAt)} (horário de Brasília).`,
    records: r.policyAcceptedAt ? [{
      signerName: r.clientName,
      acceptedAt: r.policyAcceptedAt,
      method: 'link',
      ip: r.policyAcceptedIp,
      userAgent: r.policyAcceptedUserAgent,
      note: 'Leu e concordou com as condições do sinal antes de pagar ("Li e concordo").',
    }] : [],
    pendingText: 'Condições sem aceite registrado pela cliente',
  })}`;
}

// ---------- dados da página pública (RPC deposit_public) ----------

export type DepositPublic = {
  status: DepositStatus | 'expired' | 'invalid';
  amount?: number;
  due_at?: string | null;
  txid?: string;
  policy_text?: string;
  notice_hours?: number;
  credit_days?: number;
  policy_accepted_at?: string | null;
  first_name?: string | null;
  appointment?: { start_time: string; kind: string | null; treatment: string | null; professional: string | null };
  pix?: { key: string; name: string; city: string } | null;
  clinic?: {
    name: string; logo_url: string | null; primary_color: string | null; document: string | null; address: string | null;
    city: string | null; state: string | null; zip_code: string | null; phone: string | null; email: string | null;
  };
  receipt?: {
    number: string; client_name: string; payer_name: string; payer_cpf: string | null; paid_at: string;
    confirmed_by: string | null; policy_accepted: { at?: string; ip?: string; user_agent?: string } | null;
  } | null;
};

/** Monta os dados do recibo a partir do que a página pública recebe (mesma fonte para equipe e cliente). */
export function receiptDataFromPublic(p: DepositPublic): DepositReceiptData | null {
  if (!p.receipt || !p.clinic || !p.appointment) return null;
  return {
    clinic: {
      name: p.clinic.name, document: p.clinic.document, address: p.clinic.address, city: p.clinic.city, state: p.clinic.state,
      zipCode: p.clinic.zip_code, phone: p.clinic.phone, email: p.clinic.email, logoUrl: p.clinic.logo_url, accentColor: p.clinic.primary_color,
    },
    number: p.receipt.number,
    amount: Number(p.amount || 0),
    paidAt: p.receipt.paid_at,
    payerName: p.receipt.payer_name,
    payerCpf: p.receipt.payer_cpf,
    clientName: p.receipt.client_name,
    kind: p.appointment.kind,
    treatment: p.appointment.treatment,
    startTime: p.appointment.start_time,
    professional: p.appointment.professional,
    noticeHours: Number(p.notice_hours ?? 24),
    creditDays: Number(p.credit_days ?? 90),
    policyAcceptedAt: p.receipt.policy_accepted?.at ?? null,
    policyAcceptedIp: p.receipt.policy_accepted?.ip ?? null,
    policyAcceptedUserAgent: p.receipt.policy_accepted?.user_agent ?? null,
    confirmedBy: p.receipt.confirmed_by,
  };
}

/** Situação do sinal mostrada no cartão da agenda (a cobrança mais recente que não foi cancelada). */
export function appointmentDepositState(rows: Array<{ status: string; created_at?: string }> | null | undefined): 'pending' | 'paid' | null {
  const live = (rows || []).filter((r) => r.status !== 'cancelled')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
  if (!live) return null;
  if (live.status === 'pending') return 'pending';
  return live.status === 'paid' ? 'paid' : null;
}

// ---------- adiantamento no contrato ----------

export type CreditDeposit = { id: string; amount: number; paid_at: string | null; payer_name: string | null; receipt_number: string | null };

const brl = (v: number) => formatBRL(v);

/** "Adiantamento (sinal pago via Pix) de R$ 50,00 em 22/11/2026, por Maria Lima, recibo nº RS-2026-0001". */
export function advanceDetailsText(deposits: CreditDeposit[]): string {
  return deposits.map((d) => [
    `Adiantamento (sinal pago via Pix) de ${brl(Number(d.amount))}`,
    d.paid_at ? ` em ${dateBr(d.paid_at)}` : '',
    d.payer_name ? `, por ${d.payer_name}` : '',
    d.receipt_number ? `, recibo nº ${d.receipt_number}` : '',
  ].join('')).join('; ');
}

/** Valor total, adiantamento e valor a pagar (total - adiantamento, nunca negativo). */
export function contractAmounts(total: number, deposits: CreditDeposit[]) {
  const advance = Math.round(deposits.reduce((s, d) => s + Number(d.amount), 0) * 100) / 100;
  return { total, advance, due: Math.max(0, Math.round((total - advance) * 100) / 100) };
}

/**
 * Campos de pagamento do contrato com o adiantamento. Modelos antigos não têm {{payment.advance...}}:
 * nesses o adiantamento e o saldo entram no início de "Forma(s) de pagamento", para sempre aparecer.
 */
export function withAdvance<T extends { methods: string }>(payment: T, total: number, deposits: CreditDeposit[], templateHtml: string) {
  const { advance, due } = contractAmounts(total, deposits);
  if (advance <= 0) return { ...payment, advance: '', advance_details: '', amount_due: brl(total) };
  const details = advanceDetailsText(deposits);
  const usesPlaceholders = /\{\{\s*payment\.(advance|advance_details|amount_due)\s*\}\}/.test(templateHtml || '');
  return {
    ...payment,
    methods: usesPlaceholders ? payment.methods : `${details}. Valor a pagar: ${brl(due)}, por ${payment.methods}`,
    advance: brl(advance),
    advance_details: details,
    amount_due: brl(due),
  };
}
