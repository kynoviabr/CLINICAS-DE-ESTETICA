import { escapeHtml } from '@/lib/documents/letterhead';
import { deviceLabel } from '@/lib/documents/device';

/** Um aceite do documento (da tabela document_acceptances ou de outra prova já guardada). */
export type AcceptanceRecord = {
  signerName: string;
  acceptedAt: string;
  /** Quem é: "Cliente", "Responsável"... */
  role?: string;
  method?: 'link' | 'whatsapp' | 'in_person_link' | 'in_person_drawn' | string | null;
  verifiedBy?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  phone?: string | null;
  geo?: { lat?: number; lng?: number; accuracy?: number } | null;
  verificationCode?: string | null;
  /** Texto extra (ex.: o que foi aceito). */
  note?: string | null;
};

export type SignatureSheetInput = {
  /** Ex.: "Contrato nº CT-2026-0012". */
  documentLabel: string;
  documentHash?: string | null;
  records: AcceptanceRecord[];
  /** Linha da clínica (ex.: "Emitido por Clínica Aura; recebimento confirmado por Dra. Paula em ..."). */
  issuer?: string | null;
  /** Texto quando ainda não há aceite. */
  pendingText?: string;
};

const BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Data e hora no horário de Brasília, com segundos. Ex.: "22/11/2026 às 14:54:13". */
export function brasiliaDateTime(iso: string) {
  const parts = Object.fromEntries(BRT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}:${parts.second}`;
}

export const METHOD_LABELS: Record<string, string> = {
  link: 'Link pessoal enviado pela clínica',
  whatsapp: 'Resposta "DE ACORDO" pelo WhatsApp',
  in_person_link: 'Na clínica, pelo celular da própria cliente',
  in_person_drawn: 'Na clínica, assinatura desenhada na tela',
  portal: 'Portal da cliente (com login)',
};

export const VERIFIED_LABELS: Record<string, string> = {
  birth_date: 'Data de nascimento conferida com o cadastro',
  cpf: 'Início do CPF conferido com o cadastro',
  none: 'Nome completo conferido com o cadastro',
};

/** Linha de um aceite com os campos da tabela document_acceptances (ou da folha pública). */
export function acceptanceFromRow(r: {
  signer_name: string; accepted_at: string; method?: string | null; verified_by?: string | null; ip?: string | null;
  user_agent?: string | null; phone?: string | null; geo?: unknown; verification_code?: string | null;
}): AcceptanceRecord {
  return {
    signerName: r.signer_name, acceptedAt: r.accepted_at, method: r.method, verifiedBy: r.verified_by, ip: r.ip,
    userAgent: r.user_agent, phone: r.phone, geo: (r.geo as AcceptanceRecord['geo']) ?? null, verificationCode: r.verification_code,
  };
}

const LEGAL = 'Documento assinado eletronicamente nos termos da Lei 14.063/2020 e da MP 2.200-2/2001, art. 10, § 2º. '
  + 'Data e hora registradas pelo servidor, no horário de Brasília.';
const LEGAL_HASH = ' O código de integridade (SHA-256) muda se uma única letra do documento for alterada.';

function row(label: string, value: string) {
  return `<tr><td style="padding:3px 8px 3px 0;color:#6b7280;width:34%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:3px 0;color:#111827;word-break:break-word">${escapeHtml(value)}</td></tr>`;
}

function recordHtml(r: AcceptanceRecord, i: number) {
  const rows = [
    row('Nome', r.signerName),
    r.verifiedBy ? row('Identidade', VERIFIED_LABELS[r.verifiedBy] || r.verifiedBy) : '',
    row('Meio', (r.method && METHOD_LABELS[r.method]) || r.method || 'Eletrônico'),
    row('Data e hora', `${brasiliaDateTime(r.acceptedAt)} (horário de Brasília)`),
    r.ip ? row('Endereço de rede (IP)', r.ip) : '',
    r.userAgent ? row('Aparelho', deviceLabel(r.userAgent)) : '',
    r.phone ? row('Telefone', r.phone) : '',
    r.geo?.lat != null && r.geo?.lng != null ? row('Localização aproximada', `${r.geo.lat.toFixed(4)}, ${r.geo.lng.toFixed(4)}${r.geo.accuracy ? ` (±${Math.round(r.geo.accuracy)} m)` : ''}`) : '',
    r.note ? row('Aceite', r.note) : '',
    r.verificationCode ? row('Código de verificação', r.verificationCode) : '',
  ].join('');
  const technical = r.userAgent ? `<div style="margin-top:4px;font-size:9px;color:#9ca3af;word-break:break-all">Identificação técnica do aparelho: ${escapeHtml(r.userAgent)}</div>` : '';
  return `<div style="border:1px solid #d1fae5;border-left:4px solid #059669;border-radius:6px;padding:10px 12px;margin:10px 0;break-inside:avoid;page-break-inside:avoid">
    <div style="font-weight:700;color:#065f46;margin-bottom:4px">${i + 1}. ${escapeHtml(r.role || 'Cliente')}: de acordo</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">${rows}</table>${technical}
  </div>`;
}

/** Folha de assinatura: última página do PDF e da impressão. Todo texto é escapado. */
export function buildSignatureSheet(s: SignatureSheetInput): string {
  const signed = s.records.length > 0;
  const status = signed
    ? `<div style="display:inline-block;padding:3px 10px;border-radius:999px;background:#d1fae5;color:#065f46;font-weight:700;font-size:11px">Assinado eletronicamente</div>`
    : `<div style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;font-size:11px">${escapeHtml(s.pendingText || 'Aguardando aceite')}</div>`;
  const hash = s.documentHash
    ? `<div style="margin-top:6px;font-size:10px;color:#4b5563;word-break:break-all">Código de integridade (SHA-256): ${escapeHtml(s.documentHash)}</div>`
    : '';
  const issuer = s.issuer ? `<div style="margin-top:6px;font-size:11px;color:#374151">${escapeHtml(s.issuer)}</div>` : '';
  return `<div class="html2pdf__page-break" style="page-break-before:always;break-before:page"></div>
  <section style="font-family:Arial,sans-serif;color:#1f2937;font-size:12px">
    <h2 style="margin:0 0 6px;font-size:16px;color:#111827">Folha de assinatura</h2>
    <div style="color:#4b5563;margin-bottom:8px">${escapeHtml(s.documentLabel)}</div>
    ${status}${issuer}${hash}
    ${s.records.map(recordHtml).join('')}
    ${signed ? `<p style="margin-top:12px;font-size:9.5px;color:#6b7280;line-height:1.5">${escapeHtml(LEGAL + (s.documentHash ? LEGAL_HASH : ''))}</p>` : ''}
  </section>`;
}
