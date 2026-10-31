import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type StageCode = string;

export type StageDefinition = {
  code: StageCode;
  label: string;
  accent: string;
  surface: string;
  description: string;
  isSystem?: boolean;
};

export interface LeadRow {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string | null;
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  zip_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  kanban_stage: StageCode;
  assigned_to: string | null;
  source: string | null;
  next_action: string | null;
  next_action_at: string | null;
  priority_level: 'high' | 'medium' | 'low' | null;
  treatments_of_interest: string[] | null;
  notes: string | null;
  lost_reason: string | null;
  lost_reason_notes: string | null;
  patient_id: string | null;
  appointment_id: string | null;
  proposal_id: string | null;
  last_credit_risk_level: string | null;
  last_boleto_eligible: boolean | null;
  last_recommended_payment: string | null;
  last_credit_check_at: string | null;
  last_interaction_at: string | null;
  stage_changed_at: string;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenewalTaskRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  treatment_id: string;
  contract_id: string | null;
  status: 'pending' | 'contacted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded';
  patient_name: string;
  patient_phone: string | null;
  treatment_name: string;
  suggested_treatment_name: string | null;
  suggested_treatment_id: string | null;
  patient_ltv: number | null;
  avg_rating: number | null;
  patient_created_at: string | null;
  sessions_completed: number | null;
  sessions_total: number | null;
  days_since_last_action: number | null;
  created_at: string;
}

export interface RenewalInteractionRow {
  id: string;
  renewal_task_id: string;
  type: string;
  notes: string | null;
  performed_at: string;
}

export type LeadProposalRow = {
  id: string;
  proposal_number: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  final_amount: number | null;
  patient_id: string;
  created_at: string;
  notes?: string | null;
  patients?: {
    full_name?: string | null;
    payer_id?: string | null;
    is_self_payer?: boolean | null;
  } | null;
};

export type LeadProposalItem = {
  id?: string;
  treatment_id: string;
  quantity: number;
  unit_price: number;
  subtotal?: number | null;
  treatments?: { name?: string | null } | null;
};

export type LeadProposalView = LeadProposalRow & { items?: LeadProposalItem[] };

export type CrmTreatmentRow = {
  id: string;
  name: string;
  price: number | null;
  min_price?: number | null;
  default_price?: number | null;
};

export const proposalStatusLabel: Record<LeadProposalRow['status'], string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  accepted: 'Aprovada',
  rejected: 'Reprovada',
  expired: 'Expirada',
};

export const defaultStages: StageDefinition[] = [
  { code: 'new_lead', label: 'Novo Lead', accent: 'bg-slate-100 text-slate-700', surface: 'from-slate-50 to-white border-slate-200', description: 'Entradas novas sem contato.', isSystem: true },
  { code: 'contacted', label: 'Contato Iniciado', accent: 'bg-sky-100 text-sky-700', surface: 'from-sky-50 to-white border-sky-200', description: 'Primeiro contato em andamento.', isSystem: true },
  { code: 'scheduled', label: 'Agendado', accent: 'bg-cyan-100 text-cyan-700', surface: 'from-cyan-50 to-white border-cyan-200', description: 'Avaliação marcada e acompanhada.', isSystem: true },
  { code: 'proposal_sent', label: 'Proposta', accent: 'bg-amber-100 text-amber-700', surface: 'from-amber-50 to-white border-amber-200', description: 'Proposta criada ou em negociação.', isSystem: true },
  { code: 'closed_won', label: 'Fechado', accent: 'bg-emerald-100 text-emerald-700', surface: 'from-emerald-50 to-white border-emerald-200', description: 'Venda convertida em paciente.', isSystem: true },
  { code: 'closed_lost', label: 'Perdido', accent: 'bg-rose-100 text-rose-700', surface: 'from-rose-50 to-white border-rose-200', description: 'Lead encerrado com motivo.', isSystem: true },
];

export const stageAppearanceMap = Object.fromEntries(defaultStages.map((stage) => [stage.code, stage])) as Record<string, StageDefinition>;

export function normalizeStageCode(code?: string | null) {
  if (!code) return 'new_lead';
  if (code === 'attended' || code === 'negotiating') return 'proposal_sent';
  return code;
}

export function stageAppearance(stage: Pick<StageDefinition, 'code' | 'label' | 'description' | 'isSystem'>, index: number): StageDefinition {
  const preset = stageAppearanceMap[stage.code];
  if (preset) return { ...preset, ...stage };

  const customPalette = [
    { accent: 'bg-indigo-100 text-indigo-700', surface: 'from-indigo-50 to-white border-indigo-200' },
    { accent: 'bg-fuchsia-100 text-fuchsia-700', surface: 'from-fuchsia-50 to-white border-fuchsia-200' },
    { accent: 'bg-teal-100 text-teal-700', surface: 'from-teal-50 to-white border-teal-200' },
    { accent: 'bg-lime-100 text-lime-700', surface: 'from-lime-50 to-white border-lime-200' },
  ][index % 4];

  return {
    ...stage,
    ...customPalette,
  };
}

export const lostReasons = [
  'Preço acima do orçamento',
  'Optou por concorrente',
  'Não compareceu à avaliação',
  'Perdeu interesse no tratamento',
  'Sem condições financeiras no momento',
  'Não respondeu após múltiplos contatos',
  'Outro',
];

export const interactionTypes = [
  { value: 'call_made', label: 'Ligação realizada' },
  { value: 'call_missed', label: 'Ligação não atendida' },
  { value: 'whatsapp', label: 'WhatsApp enviado' },
  { value: 'email', label: 'E-mail enviado' },
  { value: 'in_person', label: 'Contato presencial' },
  { value: 'note', label: 'Observação interna' },
];

export function relativeDate(value?: string | null) {
  if (!value) return 'Sem registro';
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
}

export function normalizePhone(phone?: string | null) {
  return phone?.replace(/\D/g, '') || '';
}

export function getSchemaMissingColumn(error) {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || null;
}

export function stripUnsupportedLeadFields<T extends Record<string, unknown>>(payload: T, missingColumn: string | null) {
  if (!missingColumn || !(missingColumn in payload)) return payload;
  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

export function buildEvaluationScheduleLink(leadId: string, professionalId?: string | null) {
  const params = new URLSearchParams({
    leadId,
    openNew: '1',
  });

  if (professionalId) {
    params.set('professionalId', professionalId);
  }

  return `/clinic/appointments?${params.toString()}`;
}

export function isSchedulableAppointmentStatus(status?: string | null) {
  return status === 'scheduled' || status === 'confirmed';
}

export function getRiskLabel(risk?: string | null) {
  if (risk === 'high') return { label: 'Risco alto', className: 'bg-rose-100 text-rose-700' };
  if (risk === 'medium') return { label: 'Risco médio', className: 'bg-amber-100 text-amber-700' };
  if (risk === 'low') return { label: 'Risco baixo', className: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Sem análise', className: 'bg-slate-100 text-slate-600' };
}

export function getFollowUpStatus(nextActionAt?: string | null) {
  if (!nextActionAt) {
    return { label: 'Sem próxima ação', className: 'bg-slate-100 text-slate-600' };
  }

  const now = Date.now();
  const dueAt = new Date(nextActionAt).getTime();

  if (dueAt < now) {
    return { label: 'Follow-up atrasado', className: 'bg-rose-100 text-rose-700' };
  }

  if (dueAt - now <= 1000 * 60 * 60 * 24) {
    return { label: 'Follow-up hoje', className: 'bg-amber-100 text-amber-700' };
  }

  return { label: 'Próxima ação agendada', className: 'bg-sky-100 text-sky-700' };
}

export function isFollowUpDue(nextActionAt?: string | null) {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() <= Date.now();
}

export function getPriorityBadge(priority?: string | null) {
  if (priority === 'high') return { label: 'Alta prioridade', className: 'bg-rose-100 text-rose-700' };
  if (priority === 'low') return { label: 'Baixa prioridade', className: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Média prioridade', className: 'bg-amber-100 text-amber-700' };
}

export function getPriorityRank(priority?: string | null) {
  if (priority === 'high') return 0;
  if (priority === 'medium' || !priority) return 1;
  return 2;
}

export function normalizeLeadSource(source?: string | null) {
  const normalized = source?.trim().toLowerCase();
  if (!normalized || normalized === 'sem origem' || normalized === 'nao informado' || normalized === 'não informado') return 'Sem origem';
  if (['google ads', 'ads google'].includes(normalized)) return 'google';
  if (['whatsapp ia', 'whatsapp-ai', 'whatsapp_ai'].includes(normalized)) return 'whatsapp_ai';
  if (['indicação', 'indicacao'].includes(normalized)) return 'indicacao';
  return normalized;
}

export function getLeadSourceMeta(source?: string | null) {
  const normalized = normalizeLeadSource(source);
  if (normalized === 'whatsapp_ai') {
    return {
      label: 'WhatsApp IA',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    };
  }
  if (normalized === 'whatsapp') {
    return {
      label: 'WhatsApp',
      className: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    };
  }
  if (!normalized) {
    return {
      label: 'Sem origem',
      className: 'bg-slate-100 text-slate-600',
    };
  }
  if (normalized === 'Sem origem') {
    return {
      label: 'Sem origem',
      className: 'bg-slate-100 text-slate-600',
    };
  }
  if (normalized === 'google') {
    return {
      label: 'Google',
      className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    };
  }
  if (normalized === 'instagram') {
    return {
      label: 'Instagram',
      className: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
    };
  }
  if (normalized === 'site') {
    return {
      label: 'Site',
      className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    };
  }
  if (normalized === 'indicacao') {
    return {
      label: 'Indicação',
      className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    };
  }
  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    className: 'bg-slate-100 text-slate-700',
  };
}
