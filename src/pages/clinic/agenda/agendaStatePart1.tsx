import { useState, useMemo, useEffect, useCallback } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAgendaProfessionals } from '@/hooks/useAgendaProfessionals';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isMissingRelationError, type ViewMode, type WaitlistWindowType, type WaitlistPriority, type WaitlistContactPreference, type WaitlistTargetType, type AppointmentRow, type WaitlistRow, type WaitlistNotificationRow, type ReminderRow, type WhatsAppCommandLogRow, type AgendaJobExecutionRow, type ContractLite, type ProposalItemLite, type SessionRecordLite, type AppointmentKind } from '@/lib/agenda/model';
import type { Tables } from '@/integrations/supabase/types';


/** Parte 1 de useAgendaPage (dividido por tamanho; a lógica é a mesma). */
export function useAgendaStatePart1() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useUrlState<ViewMode>('visao', 'month', ['month', 'week', 'day']);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<AppointmentRow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [appointmentType, setAppointmentType] = useState<AppointmentKind>('session');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  // Profissionais escolhidas no filtro (cadastro professionals.id; 'unassigned' = sem profissional). Vazio = todas.
  const [filterProfessionals, setFilterProfessionals] = useState<string[]>([]);
  // Compatível com quem usa uma só: a escolhida, ou 'all' quando são várias/nenhuma.
  const filterProfessional = filterProfessionals.length === 1 ? filterProfessionals[0] : 'all';
  const setFilterProfessional = (value: string) => setFilterProfessionals(value === 'all' ? [] : [value]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [queueExpanded, setQueueExpanded] = useState(true);
  const [createFormError, setCreateFormError] = useState('');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [blocksDialogOpen, setBlocksDialogOpen] = useState(false);
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false);
  const [availabilityProfessional, setAvailabilityProfessional] = useState('unassigned');
  const [blockProfessional, setBlockProfessional] = useState('all');
  const [blockStartDate, setBlockStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndDate, setBlockEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  const [blockNotes, setBlockNotes] = useState('');
  const [exceptionModal, setExceptionModal] = useState<{ mode: 'cancel' | 'no_show' | 'reschedule'; appointment: Partial<Tables<'appointments'>> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null } } | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [rescheduleDuration, setRescheduleDuration] = useState('60');
  const [rescheduleProfessional, setRescheduleProfessional] = useState('unassigned');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [reassignProfessional, setReassignProfessional] = useState('unassigned');
  const [proposalLoadingId, setProposalLoadingId] = useState<string | null>(null);
  const [waitlistTargetType, setWaitlistTargetType] = useState<WaitlistTargetType>('lead');
  const [waitlistLeadId, setWaitlistLeadId] = useState('');
  const [waitlistPatientId, setWaitlistPatientId] = useState('');
  const [waitlistProfessionalId, setWaitlistProfessionalId] = useState('any');
  const [waitlistTreatmentId, setWaitlistTreatmentId] = useState('none');
  const [waitlistWindowType, setWaitlistWindowType] = useState<WaitlistWindowType>('this_week');
  const [waitlistWindowStart, setWaitlistWindowStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [waitlistWindowEnd, setWaitlistWindowEnd] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [waitlistPreferredPeriod, setWaitlistPreferredPeriod] = useState<'morning' | 'afternoon' | 'evening' | 'all'>('all');
  const [waitlistDuration, setWaitlistDuration] = useState('60');
  const [waitlistPriority, setWaitlistPriority] = useState<WaitlistPriority>('normal');
  const [waitlistContactPreference, setWaitlistContactPreference] = useState<WaitlistContactPreference>('whatsapp');
  const [waitlistContactPhone, setWaitlistContactPhone] = useState('');
  const [waitlistNotes, setWaitlistNotes] = useState('');
  const [waitlistSchemaAvailable, setWaitlistSchemaAvailable] = useState(true);

  const prefillLeadId = searchParams.get('leadId');
  const prefillPatientId = searchParams.get('patientId');
  const prefillProfessionalId = searchParams.get('professionalId');
  const prefillAppointmentType = searchParams.get('appointmentType');
  const prefillTreatmentId = searchParams.get('treatmentId');
  const shouldOpenNewFromQuery = searchParams.get('openNew') === '1';

  const isProfessional = role === 'professional';

  // Get date range based on view
  const { rangeStart, rangeEnd, calendarDays } = useMemo(() => {
    if (viewMode === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const cs = startOfWeek(ms, { locale: ptBR });
      const ce = endOfWeek(me, { locale: ptBR });
      return { rangeStart: cs, rangeEnd: ce, calendarDays: eachDayOfInterval({ start: cs, end: ce }) };
    } else if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { locale: ptBR });
      const we = endOfWeek(currentDate, { locale: ptBR });
      return { rangeStart: ws, rangeEnd: we, calendarDays: eachDayOfInterval({ start: ws, end: we }) };
    } else {
      return { rangeStart: startOfDay(currentDate), rangeEnd: endOfDay(currentDate), calendarDays: [currentDate] };
    }
  }, [currentDate, viewMode]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name, phone, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason, notes), leads!appointments_lead_id_fkey(full_name, phone, notes), treatments(name), appointment_deposits(status, created_at)')
        .eq('clinic_id', clinicId!)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at');
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!clinicId,
  });

  // Só o paciente vindo pelo link entra na busca (pode estar inativo). Escolher na lista
  // não pode refazer a busca: a lista esvaziava e o campo perdia a escolha.
  const selectedPatientLookupId = prefillPatientId || '';
  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', clinicId, selectedPatientLookupId],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('id, full_name, phone, current_anamnese_status, current_anamnese_expires_at')
        .eq('clinic_id', clinicId!)
        .order('full_name');
      query = selectedPatientLookupId
        ? query.or(`status.eq.active,id.eq.${selectedPatientLookupId}`)
        : query.eq('status', 'active');
      const { data } = await query;
      return data || [];
    },
    placeholderData: (previous) => previous,
    enabled: !!clinicId,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-select', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('id, full_name, phone, cpf, kanban_stage, assigned_to, appointment_id')
        .eq('clinic_id', clinicId!)
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      return (data || []).filter((lead) => !['closed_won', 'closed_lost'].includes(lead.kanban_stage));
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, duration_minutes').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['appointments-contracts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, patient_id, proposal_id, status')
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelled');
      if (error) throw error;
      return (data || []) as ContractLite[];
    },
    enabled: !!clinicId,
  });
  const { data: proposalItems = [] } = useQuery({
    queryKey: ['appointments-proposal-items', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, treatment_id');
      if (error) throw error;
      return (data || []) as ProposalItemLite[];
    },
    enabled: !!clinicId,
  });
  const { data: sessionRecords = [] } = useQuery({
    queryKey: ['appointments-session-records', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_records')
        .select('patient_id, treatment_id')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      return (data || []) as SessionRecordLite[];
    },
    enabled: !!clinicId,
  });

  const { professionals, allProfessionals, myProfessionalId, professionalIdForUser } = useAgendaProfessionals(clinicId, user?.id);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .order('professional_id')
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const from = startOfDay(addDays(rangeStart, -14)).toISOString();
      const to = endOfDay(addDays(rangeEnd, 30)).toISOString();
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .gte('start_at', from)
        .lte('end_at', to)
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });
  const { data: waitlistEntries = [] } = useQuery({
    queryKey: ['appointment-waitlist', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_waitlist')
        .select('*, patients(full_name), leads(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .in('status', ['waiting', 'match_found', 'contact_attempted'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) {
        if (isMissingRelationError(error.message)) {
          setWaitlistSchemaAvailable(false);
          return [];
        }
        throw error;
      }
      setWaitlistSchemaAvailable(true);
      return (data || []) as WaitlistRow[];
    },
    enabled: !!clinicId,
  });
  const { data: waitlistNotifications = [] } = useQuery({
    queryKey: ['waitlist-notifications', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waitlist_notifications')
        .select('*, appointment_waitlist(*)')
        .eq('clinic_id', clinicId!)
        .eq('action_taken', 'none')
        .order('notification_sent_at', { ascending: false })
        .limit(20);
      if (error) {
        if (isMissingRelationError(error.message)) {
          setWaitlistSchemaAvailable(false);
          return [];
        }
        throw error;
      }
      return (data || []) as WaitlistNotificationRow[];
    },
    enabled: !!clinicId,
  });
  const { data: reminderQueue = [] } = useQuery({
    queryKey: ['appointment-reminders', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_reminders')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data || []) as ReminderRow[];
    },
    enabled: !!clinicId,
  });
  const { data: whatsappLogs = [] } = useQuery({
    queryKey: ['whatsapp-command-logs', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_command_logs')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as WhatsAppCommandLogRow[];
    },
    enabled: !!clinicId,
  });
  const { data: agendaJobExecutions = [] } = useQuery({
    queryKey: ['agenda-job-executions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agenda_job_executions')
        .select('*')
        .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AgendaJobExecutionRow[];
    },
    enabled: !!clinicId,
  });

  const getSelectedPatientData = (patientId: string) => patients.find((p) => p.id === patientId);
  const getSelectedLeadData = useCallback((leadId: string) => leads.find((lead) => lead.id === leadId), [leads]);
  const getAppointmentStartDate = (appointment) => new Date(appointment.start_time || appointment.scheduled_at);
  const getAppointmentEndDate = (appointment) => {
    if (appointment.end_time) return new Date(appointment.end_time);
    const start = getAppointmentStartDate(appointment);
    return new Date(start.getTime() + (appointment.duration_minutes || 60) * 60000);
  };
  const getAppointmentDisplayName = (appointment) => {
    return (appointment.patients as { full_name?: string | null } | null)?.full_name || (appointment.leads as { full_name?: string | null } | null)?.full_name || 'Lead sem paciente';
  };
  const getBlocksForDay = useCallback((day: Date) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    return appointmentBlocks.filter((block) => {
      const blockStart = new Date(block.start_at).getTime();
      const blockEnd = new Date(block.end_at).getTime();
      return blockStart <= dayEnd && blockEnd >= dayStart;
    });
  }, [appointmentBlocks]);
  const getProfessionalLabel = (professionalId?: string | null) => {
    if (!professionalId) return 'Não atribuído';
    return allProfessionals.find((professional) => professional.id === professionalId)?.label || 'Profissional';
  };
  const hasAvailabilityWindow = (professionalId: string | null, startTime: Date, endTime: Date) => {
    if (!professionalId) return true;
    const dayOfWeek = startTime.getDay();
    const own = availability.filter((slot) => slot.professional_id === professionalId && slot.is_active);
    if (own.length === 0) return true;
    const slots = own.filter((slot) => slot.day_of_week === dayOfWeek);
    if (slots.length === 0) return false;

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return slots.some((slot) => {
      const [startHour, startMinute] = String(slot.start_time).slice(0, 5).split(':').map(Number);
      const [endHour, endMinute] = String(slot.end_time).slice(0, 5).split(':').map(Number);
      const slotStartMinutes = startHour * 60 + startMinute;
      const slotEndMinutes = endHour * 60 + endMinute;
      return startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes;
    });
  };
  const assertNoSchedulingConflicts = async ({
    professionalId,
    startTime,
    endTime,
    ignoreAppointmentId,
  }: {
    professionalId: string | null;
    startTime: Date;
    endTime: Date;
    ignoreAppointmentId?: string;
  }) => {
    if (!clinicId) return;

    let appointmentsQuery = supabase.from('appointments')
      .select('id, start_time, end_time, status, professional_id')
      .eq('clinic_id', clinicId)
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString())
      .not('status', 'in', '(cancelled,rescheduled)');

    if (professionalId) {
      appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);
    }

    const { data: conflictingAppointments, error: appointmentError } = await appointmentsQuery;
    if (appointmentError) throw appointmentError;

    const realConflict = (conflictingAppointments || []).some((appointment) => appointment.id !== ignoreAppointmentId);
    if (realConflict) {
      throw new Error('Já existe outro agendamento para esse horário.');
    }

    let blocksQuery = supabase.from('appointment_blocks')
      .select('id, professional_id, start_at, end_at')
      .eq('clinic_id', clinicId)
      .lt('start_at', endTime.toISOString())
      .gt('end_at', startTime.toISOString());

    if (professionalId) {
      blocksQuery = blocksQuery.or(`professional_id.is.null,professional_id.eq.${professionalId}`);
    }

    const { data: conflictingBlocks, error: blockError } = await blocksQuery;
    if (blockError) throw blockError;
    if ((conflictingBlocks || []).length > 0) {
      throw new Error('Existe um bloqueio para esse horário.');
    }
  };

  const openExceptionModal = (mode: 'cancel' | 'no_show' | 'reschedule', appointment: Partial<Tables<'appointments'>> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null }) => {
    setExceptionReason('');
    setRescheduleDate(format(getAppointmentStartDate(appointment), 'yyyy-MM-dd'));
    setRescheduleTime(format(getAppointmentStartDate(appointment), 'HH:mm'));
    setRescheduleDuration(String(appointment.duration_minutes || Math.max(15, Math.round((getAppointmentEndDate(appointment).getTime() - getAppointmentStartDate(appointment).getTime()) / 60000))));
    setRescheduleProfessional(appointment.professional_id || 'unassigned');
    setRescheduleNotes(appointment.notes || '');
    setExceptionModal({ mode, appointment });
  };

  useEffect(() => {
    if (!viewAppt) {
      setReassignProfessional('unassigned');
      return;
    }
    setReassignProfessional(viewAppt.professional_id || 'unassigned');
  }, [viewAppt]);

  const resetForm = () => {
    setAppointmentType('session');
    setSelectedPatient('');
    setSelectedLead('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setDuration('60');
    setNotes('');
    setCreateFormError('');
  };

  useEffect(() => {
    if (!shouldOpenNewFromQuery) return;
    resetForm();
    if (prefillLeadId && leads.some((lead) => lead.id === prefillLeadId)) {
      setAppointmentType('evaluation');
      setSelectedLead(prefillLeadId);
      setSelectedPatient('');
    } else if (prefillPatientId) {
      setAppointmentType(prefillAppointmentType === 'single' ? 'single' : 'session');
      setSelectedPatient(prefillPatientId);
      setSelectedLead('');
    } else {
      return;
    }
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedProfessional(prefillProfessionalId || '');
    if (prefillTreatmentId && treatments.some((treatment) => treatment.id === prefillTreatmentId)) {
      setSelectedTreatment(prefillTreatmentId);
    }
    setDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openNew');
    nextParams.delete('leadId');
    nextParams.delete('patientId');
    nextParams.delete('professionalId');
    nextParams.delete('appointmentType');
    nextParams.delete('treatmentId');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenNewFromQuery, prefillLeadId, prefillPatientId, prefillAppointmentType, prefillTreatmentId, prefillProfessionalId, leads, patients, treatments, searchParams, setSearchParams]);

  return {
    clinicId, user, role, navigate, searchParams, setSearchParams, toast, qc, currentDate, setCurrentDate,
    viewMode, setViewMode, dialogOpen, setDialogOpen, viewAppt, setViewAppt, selectedDate, setSelectedDate,
    selectedTime, setSelectedTime, appointmentType, setAppointmentType, selectedPatient, setSelectedPatient,
    selectedLead, setSelectedLead, selectedTreatment, setSelectedTreatment, selectedProfessional,
    setSelectedProfessional, filterProfessionals, setFilterProfessionals, filterProfessional,
    setFilterProfessional, filterStatus, setFilterStatus, queueExpanded, setQueueExpanded, createFormError,
    setCreateFormError, duration, setDuration, notes, setNotes, quickPatientOpen, setQuickPatientOpen,
    availabilityDialogOpen, setAvailabilityDialogOpen, blocksDialogOpen, setBlocksDialogOpen,
    waitlistDialogOpen, setWaitlistDialogOpen, availabilityProfessional, setAvailabilityProfessional,
    blockProfessional, setBlockProfessional, blockStartDate, setBlockStartDate, blockStartTime,
    setBlockStartTime, blockEndDate, setBlockEndDate, blockEndTime, setBlockEndTime, blockReason,
    setBlockReason, blockNotes, setBlockNotes, exceptionModal, setExceptionModal, exceptionReason,
    setExceptionReason, rescheduleDate, setRescheduleDate, rescheduleTime, setRescheduleTime,
    rescheduleDuration, setRescheduleDuration, rescheduleProfessional, setRescheduleProfessional,
    rescheduleNotes, setRescheduleNotes, reassignProfessional, setReassignProfessional, proposalLoadingId,
    setProposalLoadingId, waitlistTargetType, setWaitlistTargetType, waitlistLeadId, setWaitlistLeadId,
    waitlistPatientId, setWaitlistPatientId, waitlistProfessionalId, setWaitlistProfessionalId,
    waitlistTreatmentId, setWaitlistTreatmentId, waitlistWindowType, setWaitlistWindowType,
    waitlistWindowStart, setWaitlistWindowStart, waitlistWindowEnd, setWaitlistWindowEnd,
    waitlistPreferredPeriod, setWaitlistPreferredPeriod, waitlistDuration, setWaitlistDuration,
    waitlistPriority, setWaitlistPriority, waitlistContactPreference, setWaitlistContactPreference,
    waitlistContactPhone, setWaitlistContactPhone, waitlistNotes, setWaitlistNotes, waitlistSchemaAvailable,
    setWaitlistSchemaAvailable, prefillLeadId, prefillPatientId, prefillProfessionalId,
    prefillAppointmentType, prefillTreatmentId, shouldOpenNewFromQuery, isProfessional, rangeStart, rangeEnd,
    calendarDays, appointments, selectedPatientLookupId, patients, leads, treatments, contracts,
    proposalItems, sessionRecords, professionals, allProfessionals, myProfessionalId, professionalIdForUser,
    availability, appointmentBlocks, waitlistEntries, waitlistNotifications, reminderQueue, whatsappLogs,
    agendaJobExecutions, getSelectedPatientData, getSelectedLeadData, getAppointmentStartDate,
    getAppointmentEndDate, getAppointmentDisplayName, getBlocksForDay, getProfessionalLabel,
    hasAvailabilityWindow, assertNoSchedulingConflicts, openExceptionModal, resetForm,
  };
}
export type AgendaStatePart1 = ReturnType<typeof useAgendaStatePart1>;
