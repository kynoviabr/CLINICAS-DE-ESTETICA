import { addDays, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { BadgeStatus } from '@/components/ui/brand-badge';
import type { Database } from '@/integrations/supabase/types';

export const professionalColors = [
  'hsl(var(--primary))', 'hsl(210 80% 50%)', 'hsl(280 60% 50%)',
  'hsl(30 80% 50%)', 'hsl(160 60% 40%)', 'hsl(350 70% 50%)',
  'hsl(190 70% 40%)', 'hsl(60 70% 40%)',
];

export const statusConfig: Record<string, { label: string; badge: BadgeStatus; style: string }> = {
  scheduled: { label: 'Agendado', badge: 'scheduled', style: 'border-l-4 border-l-info' },
  confirmed: { label: 'Confirmado', badge: 'confirmed', style: 'border-l-4 border-l-success' },
  completed: { label: 'Concluído', badge: 'completed', style: 'opacity-60 border-l-4 border-l-success' },
  cancelled: { label: 'Cancelado', badge: 'cancelled', style: 'opacity-50 line-through border-l-4 border-l-destructive' },
  no_show: { label: 'Não compareceu', badge: 'no_show', style: 'border-l-4 border-l-warning' },
  rescheduled: { label: 'Remarcado', badge: 'scheduled', style: 'border-l-4 border-l-sky-500 opacity-80' },
  in_progress: { label: 'Em andamento', badge: 'in_progress', style: 'border-l-4 border-l-info' },
};

export type ViewMode = 'month' | 'week' | 'day';
export type WaitlistWindowType = Database['public']['Enums']['waitlist_window_type'];
export type WaitlistPriority = Database['public']['Enums']['waitlist_priority'];
export type WaitlistContactPreference = Database['public']['Enums']['waitlist_contact_preference'];
export type WaitlistTargetType = 'lead' | 'patient';
export type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  appointment_type?: 'session' | 'evaluation' | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  lead_id?: string | null;
  is_batch?: boolean | null;
  patients?: {
    full_name?: string | null;
    dissatisfaction_flag?: boolean | null;
    dissatisfaction_level?: string | null;
    dissatisfaction_reason?: string | null;
  } | null;
  leads?: { full_name?: string | null; phone?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
export type WaitlistRow = Database['public']['Tables']['appointment_waitlist']['Row'] & {
  patients?: { full_name?: string | null } | null;
  leads?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
export type WaitlistNotificationRow = Database['public']['Tables']['waitlist_notifications']['Row'] & {
  appointment_waitlist?: WaitlistRow | null;
};
export type ReminderRow = Database['public']['Tables']['appointment_reminders']['Row'];
export type WhatsAppCommandLogRow = Database['public']['Tables']['whatsapp_command_logs']['Row'];
export type AgendaJobExecutionRow = Database['public']['Tables']['agenda_job_executions']['Row'];
export type ContractLite = Pick<Database['public']['Tables']['contracts']['Row'], 'id' | 'patient_id' | 'proposal_id' | 'status'>;
export type ProposalItemLite = Pick<Database['public']['Tables']['proposal_items']['Row'], 'proposal_id' | 'treatment_id'>;
export type SessionRecordLite = Pick<Database['public']['Tables']['session_records']['Row'], 'patient_id' | 'treatment_id'>;
export const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export function getWindowByType(type: WaitlistWindowType) {
  const now = new Date();
  if (type === 'this_week') {
    return {
      start: format(startOfWeek(now, { locale: ptBR }), 'yyyy-MM-dd'),
      end: format(endOfWeek(now, { locale: ptBR }), 'yyyy-MM-dd'),
    };
  }
  if (type === 'next_week') {
    const nextWeek = addWeeks(now, 1);
    return {
      start: format(startOfWeek(nextWeek, { locale: ptBR }), 'yyyy-MM-dd'),
      end: format(endOfWeek(nextWeek, { locale: ptBR }), 'yyyy-MM-dd'),
    };
  }
  if (type === 'this_month') {
    return {
      start: format(startOfMonth(now), 'yyyy-MM-dd'),
      end: format(endOfMonth(now), 'yyyy-MM-dd'),
    };
  }
  return {
    start: format(now, 'yyyy-MM-dd'),
    end: format(addDays(now, 7), 'yyyy-MM-dd'),
  };
}

export function waitlistPriorityLabel(priority: WaitlistPriority) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Alta';
  return 'Normal';
}

export function isMissingRelationError(message?: string | null) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('could not find the table') || normalized.includes('relation') && normalized.includes('does not exist');
}

export function waitlistStatusLabel(status: Database['public']['Enums']['waitlist_status']) {
  if (status === 'waiting') return 'Aguardando vaga';
  if (status === 'match_found') return 'Vaga encontrada';
  if (status === 'contact_attempted') return 'Contato iniciado';
  if (status === 'scheduled') return 'Agendado';
  if (status === 'expired') return 'Expirado';
  if (status === 'cancelled_by_patient') return 'Cancelado pelo paciente';
  return 'Cancelado pela clínica';
}
