import { format } from 'date-fns';
import { choiceLabel } from '@/lib/anamnese/choices';
import { ptBR } from 'date-fns/locale';
import { buildLetterhead, documentFooter, escapeHtml, type ClinicLetterhead } from '@/lib/documents/letterhead';
import { buildSignatureSheet, type AcceptanceRecord } from '@/lib/documents/signatureSheet';

/** Nomes das seções, campos e origens da anamnese (tela e PDF). */
export const sourceLabels: Record<string, string> = {
  digital: 'Digital',
  portal: 'Portal do paciente',
  patient_link: 'Link enviado à paciente',
  manual_upload: 'Upload manual',
  internal_manual: 'Preenchimento interno',
};

export const sectionLabels: Record<string, string> = {
  identification: 'Identificação',
  health_history: 'Histórico de Saúde',
  medications: 'Medicamentos',
  allergies: 'Alergias',
  aesthetic_history: 'Histórico Estético',
  objectives: 'Objetivos',
  habits: 'Hábitos de Vida',
  template: 'Modelo da área',
  area_questions: 'Perguntas da área',
  treatment_answers: 'Perguntas do tratamento',
  risk: 'Ciência dos riscos',
  consent: 'Consentimento',
  submission: 'Envio',
};

export const fieldLabels: Record<string, string> = {
  name: 'Modelo',
  category: 'Área',
  occupation: 'Profissão',
  marital_status: 'Estado civil',
  emergency_contact: 'Contato de emergência',
  emergency_phone: 'Telefone de emergência',
  has_chronic_disease: 'Doença crônica',
  chronic_diseases: 'Doenças crônicas',
  has_previous_surgery: 'Cirurgias anteriores',
  surgeries: 'Cirurgias',
  has_skin_conditions: 'Condições de pele',
  skin_conditions: 'Condições',
  is_pregnant: 'Gestante',
  is_breastfeeding: 'Amamentando',
  has_pacemaker: 'Marca-passo',
  has_metal_implants: 'Implantes metálicos',
  additional_info: 'Informações adicionais',
  takes_medication: 'Toma medicamentos',
  medications_list: 'Medicamentos',
  takes_supplements: 'Usa suplementos',
  supplements_list: 'Suplementos',
  has_allergies: 'Possui alergias',
  allergies_list: 'Alergias',
  has_product_sensitivity: 'Sensibilidade a produtos',
  sensitivities: 'Sensibilidades',
  previous_treatments: 'Tratamentos anteriores',
  has_active_treatment: 'Tratamento ativo',
  active_treatment_details: 'Detalhes do tratamento ativo',
  uses_acids_retinoids: 'Usa ácidos/retinóides',
  acids_details: 'Ácidos em uso',
  recent_sun_exposure: 'Exposição solar recente',
  skin_type: 'Tipo de pele',
  main_concern: 'Principal queixa',
  body_areas: 'Áreas do corpo',
  expectations: 'Expectativas',
  timeline: 'Prazo desejado',
  smoking: 'Fumante',
  alcohol_frequency: 'Consumo de álcool',
  exercise_frequency: 'Atividade física',
  water_intake: 'Ingestão de água',
  sleep_quality: 'Qualidade do sono',
  diet_description: 'Alimentação',
  sun_protection: 'Protetor solar',
  agrees_terms: 'Termos aceitos',
  agrees_photos: 'Fotos autorizadas',
  agrees_data_usage: 'Uso de dados autorizado',
  signature_date: 'Data de assinatura',
  signature_name: 'Assinatura',
  agrees_photos_marketing: 'Fotos em divulgação',
  terms: 'Texto',
  acknowledged: 'Li e concordo',
  filled_by: 'Preenchida por',
  via: 'Canal',
  at: 'Enviada em',
  ip: 'IP',
  user_agent: 'Aparelho',
};

export const detailDependencies: Record<string, string> = {
  chronic_diseases: 'has_chronic_disease',
  surgeries: 'has_previous_surgery',
  skin_conditions: 'has_skin_conditions',
  medications_list: 'takes_medication',
  supplements_list: 'takes_supplements',
  allergies_list: 'has_allergies',
  sensitivities: 'has_product_sensitivity',
  active_treatment_details: 'has_active_treatment',
  acids_details: 'uses_acids_retinoids',
};

export const highlightedBooleanFields = new Set([
  'has_allergies',
  'has_product_sensitivity',
  'has_chronic_disease',
  'takes_medication',
  'has_previous_surgery',
  'is_pregnant',
  'is_breastfeeding',
  'has_pacemaker',
  'has_metal_implants',
]);

export function formatValue(value: unknown, field?: string): string {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value === null || value === undefined || value === '') return '—';
  // Resposta Sim/Não da anamnese de tratamento: { value, detail }.
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const { value: v, detail } = value as { value: boolean | null; detail?: string };
    const base = v === true ? 'Sim' : v === false ? 'Não' : '—';
    return v === true && detail?.trim() ? `${base}: ${detail.trim()}` : base;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  // Data guardada como 2026-11-21: mostra no formato brasileiro.
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (date) return `${date[3]}/${date[2]}/${date[1]}`;
  return field ? choiceLabel(field, text) : text;
}

/** Resposta "Sim" de uma pergunta de tratamento (para destacar, como os riscos da inicial). */
export const isYesAnswer = (value: unknown) =>
  typeof value === 'object' && value !== null && (value as { value?: unknown }).value === true;

export type FormSection = { key: string; entries: Array<[string, unknown]> };

/** Seções do formulário com pelo menos uma resposta para mostrar. */
export function visibleSections(formData: Record<string, Record<string, unknown>> | null): FormSection[] {
  if (!formData) return [];
  return Object.entries(formData).flatMap(([key, sectionData]) => {
    if (!sectionData || typeof sectionData !== 'object') return [];
    const entries = Object.entries(sectionData).filter(([field, value]) => {
      if (value === '' || value === null || value === undefined) return false;
      const dependency = detailDependencies[field];
      if (dependency && sectionData[dependency] !== true) return false;
      return true;
    });
    return entries.length > 0 ? [{ key, entries }] : [];
  });
}


export type AnamneseDocumentInput = {
  clinic: ClinicLetterhead;
  patientName: string;
  number: string;
  title?: string | null;
  createdAt: string;
  filledAt?: string | null;
  validatedAt?: string | null;
  expiresAt?: string | null;
  source: string;
  formData: Record<string, Record<string, unknown>> | null;
  /** Aceites do registro único (com código de verificação). Sem eles, a folha usa o registro do envio. */
  acceptances?: { records: AcceptanceRecord[]; documentHash: string | null } | null;
};

const when = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—');
const day = (d?: string | null) => (d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—');

/** Anamnese para PDF e impressão: dados da cliente, respostas por seção e o registro do envio. Todo texto é escapado. */
export function buildAnamneseHtml(a: AnamneseDocumentInput): string {
  const sections = visibleSections(a.formData).filter((s) => s.key !== 'submission');
  const sub = a.formData?.submission as Record<string, unknown> | undefined;
  const consent = a.formData?.consent as Record<string, unknown> | undefined;
  const cell = 'padding:6px 8px;border-bottom:1px solid #eef0f2;vertical-align:top';

  const body = sections.map(({ key, entries }) => {
    const rows = entries.map(([field, value]) => {
      const alert = (highlightedBooleanFields.has(field) && value === true) || (key === 'treatment_answers' && isYesAnswer(value));
      const bg = alert ? 'background:#fffbeb;' : '';
      return `<tr><td style="${cell};${bg}width:42%;color:#6b7280">${escapeHtml(fieldLabels[field] || field)}</td><td style="${cell};${bg}font-weight:600;white-space:pre-wrap">${escapeHtml(formatValue(value, field))}</td></tr>`;
    }).join('');
    return `<h3 style="margin:18px 0 6px;font-size:14px;color:#111827">${escapeHtml(sectionLabels[key] || key)}</h3><table style="width:100%;font-size:12px">${rows}</table>`;
  }).join('') || '<p style="color:#6b7280">Nenhuma resposta digital registrada.</p>';

  const note = 'Declarou que as informações são verdadeiras e concordou com os termos da anamnese.';
  const signer = typeof consent?.signature_name === 'string' ? consent.signature_name.trim() : '';
  const registered = a.acceptances?.records.length ? a.acceptances.records.map((r) => ({ ...r, note })) : null;
  const records: AcceptanceRecord[] = registered ?? (signer && sub?.at ? [{
    signerName: signer,
    acceptedAt: String(sub.at),
    method: sub.via === 'link' ? 'link' : sub.via === 'portal' ? 'portal' : null,
    ip: typeof sub.ip === 'string' ? sub.ip : null,
    userAgent: typeof sub.user_agent === 'string' ? sub.user_agent : null,
    note,
  }] : []);
  const sheet = buildSignatureSheet({
    documentLabel: `Anamnese ${a.number}`,
    documentHash: registered ? a.acceptances?.documentHash : null,
    records,
    pendingText: a.source === 'internal_manual' || a.source === 'manual_upload'
      ? 'Preenchida pela clínica, sem aceite eletrônico da cliente'
      : 'Aguardando aceite da cliente',
  });

  return `${buildLetterhead(a.clinic)}
  <div style="font-family:Arial,sans-serif;color:#1f2937">
    <h1 style="margin:0 0 4px;font-size:20px">Anamnese ${escapeHtml(a.number)}</h1>
    ${a.title ? `<div style="color:#4b5563;font-size:13px;margin-bottom:10px">${escapeHtml(a.title)}</div>` : ''}
    <table style="width:100%;font-size:12px;margin:8px 0 6px">
      <tr><td style="${cell};color:#6b7280;width:42%">Cliente</td><td style="${cell};font-weight:600">${escapeHtml(a.patientName)}</td></tr>
      <tr><td style="${cell};color:#6b7280">Preenchida em</td><td style="${cell}">${escapeHtml(when(a.filledAt))}</td></tr>
      <tr><td style="${cell};color:#6b7280">Origem</td><td style="${cell}">${escapeHtml(sourceLabels[a.source] || a.source)}</td></tr>
      ${a.validatedAt ? `<tr><td style="${cell};color:#6b7280">Validada pela clínica em</td><td style="${cell}">${escapeHtml(when(a.validatedAt))}</td></tr>` : ''}
      <tr><td style="${cell};color:#6b7280">Vale até</td><td style="${cell}">${escapeHtml(day(a.expiresAt))}</td></tr>
    </table>
    ${body}
  </div>
  ${documentFooter(`Documento gerado em ${when(new Date().toISOString())}. Informações de saúde: uso restrito da clínica e da cliente (LGPD, art. 11).`)}
  ${sheet}`;
}
