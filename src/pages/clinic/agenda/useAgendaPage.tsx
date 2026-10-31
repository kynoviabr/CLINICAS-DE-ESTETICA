import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import { professionalColors, weekDays, getWindowByType, isMissingRelationError, type ViewMode, type WaitlistWindowType, type WaitlistPriority, type WaitlistContactPreference, type WaitlistTargetType, type AppointmentRow, type WaitlistRow, type WaitlistNotificationRow, type ReminderRow, type WhatsAppCommandLogRow, type AgendaJobExecutionRow, type ContractLite, type ProposalItemLite, type SessionRecordLite } from '@/lib/agenda/model';

export function useAgendaPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<AppointmentRow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [appointmentType, setAppointmentType] = useState<'session' | 'evaluation'>('session');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [filterProfessional, setFilterProfessional] = useState('all');
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
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<number, { isActive: boolean; start: string; end: string }>>({});
  const [blockProfessional, setBlockProfessional] = useState('all');
  const [blockStartDate, setBlockStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndDate, setBlockEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  const [blockNotes, setBlockNotes] = useState('');
  const [exceptionModal, setExceptionModal] = useState<{ mode: 'cancel' | 'no_show' | 'reschedule'; appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null } } | null>(null);
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
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason), leads!appointments_lead_id_fkey(full_name, phone), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at');
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!clinicId,
  });

  const selectedPatientLookupId = selectedPatient || prefillPatientId || '';
  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', clinicId, selectedPatientLookupId],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('id, full_name, current_anamnese_status, current_anamnese_expires_at')
        .eq('clinic_id', clinicId!)
        .order('full_name');
      query = selectedPatientLookupId
        ? query.or(`status.eq.active,id.eq.${selectedPatientLookupId}`)
        : query.eq('status', 'active');
      const { data } = await query;
      return data || [];
    },
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

  const { staff: professionals = [] } = useStaffDirectory(clinicId);

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
    return professionals.find((professional) => professional.user_id === professionalId)?.label || 'Profissional';
  };
  const hasAvailabilityWindow = (professionalId: string | null, startTime: Date, endTime: Date) => {
    if (!professionalId) return true;
    const dayOfWeek = startTime.getDay();
    const slots = availability.filter((slot) => slot.professional_id === professionalId && slot.day_of_week === dayOfWeek && slot.is_active);
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

  const openExceptionModal = (mode: 'cancel' | 'no_show' | 'reschedule', appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null }) => {
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

  useEffect(() => {
    if (!shouldOpenNewFromQuery) return;
    resetForm();
    if (prefillLeadId && leads.some((lead) => lead.id === prefillLeadId)) {
      setAppointmentType('evaluation');
      setSelectedLead(prefillLeadId);
      setSelectedPatient('');
    } else if (prefillPatientId) {
      setAppointmentType('session');
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

  useEffect(() => {
    if (appointmentType !== 'evaluation') return;
    if (!selectedLead) {
      if (!dialogOpen) {
        setSelectedProfessional('');
      }
      return;
    }

    const lead = getSelectedLeadData(selectedLead);
    if (!lead?.assigned_to) {
      if (!selectedProfessional && isProfessional && user?.id) {
        setSelectedProfessional(user.id);
      }
      return;
    }

    const hasProfessionalAssigned = professionals.some((professional) => professional.user_id === lead.assigned_to);
    setSelectedProfessional(hasProfessionalAssigned ? lead.assigned_to : (isProfessional && user?.id ? user.id : ''));
  }, [appointmentType, selectedLead, professionals, isProfessional, user, dialogOpen, selectedProfessional, getSelectedLeadData]);

  useEffect(() => {
    if (professionals.length > 0 && availabilityProfessional === 'unassigned') {
      setAvailabilityProfessional(professionals[0].user_id);
    }
  }, [professionals, availabilityProfessional]);

  useEffect(() => {
    if (!availabilityProfessional || availabilityProfessional === 'unassigned') return;
    const nextDraft = weekDays.reduce((acc, day) => {
      const slot = availability.find((item) => item.professional_id === availabilityProfessional && item.day_of_week === day.value && item.is_active);
      acc[day.value] = {
        isActive: !!slot,
        start: slot ? String(slot.start_time).slice(0, 5) : '09:00',
        end: slot ? String(slot.end_time).slice(0, 5) : '18:00',
      };
      return acc;
    }, {} as Record<number, { isActive: boolean; start: string; end: string }>);
    setAvailabilityDraft(nextDraft);
  }, [availabilityProfessional, availability]);

  useEffect(() => {
    if (waitlistWindowType !== 'custom') {
      const window = getWindowByType(waitlistWindowType);
      setWaitlistWindowStart(window.start);
      setWaitlistWindowEnd(window.end);
    }
  }, [waitlistWindowType]);

  const getProfColor = (profId: string | null) => {
    if (!profId) return professionalColors[0];
    const index = professionals.findIndex(p => p.user_id === profId);
    return professionalColors[(index >= 0 ? index : 0) % professionalColors.length];
  };

  const sessionTreatmentSummaryMap = useMemo(() => {
    const contractedByKey = new Map<string, number>();
    const performedByKey = new Map<string, number>();
    const treatmentMap = new Map(
      treatments.map((t) => [t.id, { id: t.id, name: t.name, duration: Number(t.duration_minutes || 60), sessionsPerContractItem: 1 }])
    );
    const proposalIdsByPatient = new Map<string, Set<string>>();
    contracts.forEach((contract) => {
      if (!contract.patient_id || !contract.proposal_id) return;
      if (!proposalIdsByPatient.has(contract.patient_id)) {
        proposalIdsByPatient.set(contract.patient_id, new Set<string>());
      }
      proposalIdsByPatient.get(contract.patient_id)!.add(contract.proposal_id);
    });
    const patientByProposal = new Map<string, string>();
    proposalIdsByPatient.forEach((proposalIds, patientId) => {
      proposalIds.forEach((proposalId) => patientByProposal.set(proposalId, patientId));
    });
    proposalItems.forEach((item) => {
      if (!item.treatment_id || !item.proposal_id) return;
      const patientId = patientByProposal.get(item.proposal_id);
      if (!patientId) return;
      const key = `${patientId}:${item.treatment_id}`;
      contractedByKey.set(key, (contractedByKey.get(key) || 0) + 1);
    });
    sessionRecords.forEach((session) => {
      if (!session.patient_id || !session.treatment_id) return;
      const key = `${session.patient_id}:${session.treatment_id}`;
      performedByKey.set(key, (performedByKey.get(key) || 0) + 1);
    });
    return { contractedByKey, performedByKey, treatmentMap };
  }, [contracts, proposalItems, sessionRecords, treatments]);

  const sessionTreatmentOptions = useMemo(() => {
    if (appointmentType !== 'session' || !selectedPatient) return [] as Array<{ id: string; name: string; duration: number; contracted: number; performed: number; balance: number }>;
    const { contractedByKey, performedByKey, treatmentMap } = sessionTreatmentSummaryMap;
    const rows = new Map<string, { id: string; name: string; duration: number; contracted: number; performed: number; balance: number }>();
    contractedByKey.forEach((contracted, key) => {
      const [patientId, treatmentId] = key.split(':');
      if (patientId !== selectedPatient) return;
      const treatment = treatmentMap.get(treatmentId);
      if (!treatment) return;
      const performed = performedByKey.get(key) || 0;
      rows.set(treatmentId, {
        id: treatmentId,
        name: treatment.name,
        duration: treatment.duration,
        contracted,
        performed,
        balance: Math.max(contracted - performed, 0),
      });
    });
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [appointmentType, selectedPatient, sessionTreatmentSummaryMap]);

  const selectedSessionTreatmentSummary = useMemo(() => {
    if (appointmentType !== 'session' || !selectedTreatment) return null;
    return sessionTreatmentOptions.find((item) => item.id === selectedTreatment) || null;
  }, [appointmentType, selectedTreatment, sessionTreatmentOptions]);

  const hasSessionBalance = selectedSessionTreatmentSummary ? selectedSessionTreatmentSummary.balance > 0 : false;

  useEffect(() => {
    if (appointmentType !== 'session') return;
    if (!selectedTreatment) return;
    const valid = sessionTreatmentOptions.some((item) => item.id === selectedTreatment);
    if (!valid) setSelectedTreatment('');
  }, [appointmentType, selectedTreatment, sessionTreatmentOptions]);

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    if (filterProfessional === 'unassigned') {
      filtered = filtered.filter((appointment) => !appointment.professional_id);
    } else if (filterProfessional !== 'all') {
      filtered = filtered.filter((a) => a.professional_id === filterProfessional);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessional, filterStatus]);

  const operationalSummary = useMemo(() => {
    const todayAppointments = filteredAppointments.filter((appointment) =>
      isSameDay(getAppointmentStartDate(appointment), new Date())
    );
    const readyForSession = todayAppointments.filter((appointment) =>
      appointment.status === 'confirmed' || appointment.status === 'in_progress'
    );

    return {
      totalInView: filteredAppointments.length,
      today: todayAppointments.length,
      readyForSession: readyForSession.length,
      noShow: filteredAppointments.filter((appointment) => appointment.status === 'no_show').length,
      unassigned: filteredAppointments.filter((appointment) => !appointment.professional_id).length,
    };
  }, [filteredAppointments]);

  const todayQueue = useMemo(() => {
    return filteredAppointments
      .filter((appointment) => isSameDay(getAppointmentStartDate(appointment), new Date()))
      .sort((a, b) => +getAppointmentStartDate(a) - +getAppointmentStartDate(b))
      .slice(0, 5);
  }, [filteredAppointments]);

  const agendaSignals = useMemo(() => {
    const evaluations = filteredAppointments.filter((appointment) => appointment.appointment_type === 'evaluation').length;
    const batches = filteredAppointments.filter((appointment) => appointment.is_batch).length;
    const blockedDays = calendarDays.filter((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = endOfDay(day).getTime();
      return appointmentBlocks.some((block) => {
        const blockStart = new Date(block.start_at).getTime();
        const blockEnd = new Date(block.end_at).getTime();
        return blockStart <= dayEnd && blockEnd >= dayStart;
      });
    }).length;

    return {
      evaluations,
      batches,
      blockedDays,
      blocks: appointmentBlocks.length,
    };
  }, [filteredAppointments, appointmentBlocks, calendarDays]);
  const whatsappOpsSummary = useMemo(() => {
    const pending = reminderQueue.filter((item) => item.status === 'pending').length;
    const sent = reminderQueue.filter((item) => item.status === 'sent').length;
    const failed = reminderQueue.filter((item) => item.status === 'failed').length;
    const inboundApplied = whatsappLogs.filter((log) => log.result_status === 'applied').length;
    const jobSuccess = agendaJobExecutions.filter((job) => job.status === 'completed').length;
    return {
      pending,
      sent,
      failed,
      inboundApplied,
      jobSuccess,
    };
  }, [reminderQueue, whatsappLogs, agendaJobExecutions]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setCreateFormError('');
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
      const endTime = new Date(startTime.getTime() + parseInt(duration) * 60000);
      const profId = selectedProfessional || (isProfessional ? user?.id || null : null);
      if (!profId) {
        throw new Error('Selecione um profissional para este agendamento.');
      }
      if (profId && !hasAvailabilityWindow(profId, startTime, endTime)) {
        throw new Error('Esse horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({ professionalId: profId, startTime, endTime });
      const lead = appointmentType === 'evaluation' ? getSelectedLeadData(selectedLead) : null;
      if (appointmentType === 'session') {
        if (!selectedTreatment) throw new Error('Selecione um tratamento.');
        const isAllowed = sessionTreatmentOptions.some((item) => item.id === selectedTreatment);
        if (!isAllowed) {
          throw new Error('Selecione um tratamento contratado para o paciente.');
        }
        const chosen = sessionTreatmentOptions.find((item) => item.id === selectedTreatment);
        if (!chosen || chosen.balance <= 0) {
          throw new Error('Este tratamento já foi finalizado (saldo 0).');
        }
      }
      const payload: Record<string, unknown> = {
        clinic_id: clinicId!,
        patient_id: appointmentType === 'session' ? selectedPatient : null,
        lead_id: appointmentType === 'evaluation' ? selectedLead : null,
        treatment_id: selectedTreatment || null,
        professional_id: profId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        scheduled_at: startTime.toISOString(),
        duration_minutes: parseInt(duration) || 60,
        appointment_type: appointmentType,
        credit_check_required: appointmentType === 'evaluation' ? !!lead?.cpf : false,
        credit_check_status: appointmentType === 'evaluation' && lead?.cpf ? 'pending' : 'not_required',
        notes: notes || null,
      };
      const { data: insertedAppointment, error } = await supabase.from('appointments')
        .insert(payload)
        .select('id, start_time, professional_id')
        .single();
      if (error) throw error;

      if (appointmentType === 'evaluation' && selectedLead) {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: insertedAppointment.id })
          .eq('clinic_id', clinicId!)
          .eq('id', selectedLead);
        if (leadError) throw leadError;
      }

      return {
        appointment: insertedAppointment,
        startTime,
        professionalId: profId,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      if (result?.startTime) {
        setCurrentDate(result.startTime);
      }
      if (result?.professionalId) {
        setFilterProfessional(result.professionalId);
      }
      setViewMode('day');
      setDialogOpen(false);
      resetForm();
      setCreateFormError('');
      toast({ title: 'Agendamento criado!' });
    },
    onError: (err: Error) => {
      const msg = err.message || 'Erro ao criar agendamento.';
      if (
        msg.includes('Já existe outro agendamento para esse horário.') ||
        msg.includes('Existe um bloqueio para esse horário.') ||
        msg.includes('fora da disponibilidade semanal do profissional')
      ) {
        setCreateFormError(msg);
        return;
      }
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const appointment = appointments.find((item) => item.id === id);
      const patch: Record<string, unknown> = { status };

      if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();
      if (status === 'in_progress') patch.checked_in_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();

      const { error } = await supabase.from('appointments').update(patch).eq('id', id);
      if (error) throw error;

      if (appointment?.lead_id && status === 'completed') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId!)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const appointmentExceptionMutation = useMutation({
    mutationFn: async () => {
      if (!exceptionModal || !clinicId) return;

      const appointment = exceptionModal.appointment;

      if (exceptionModal.mode === 'cancel' || exceptionModal.mode === 'no_show') {
        if (!exceptionReason.trim()) {
          throw new Error('Informe o motivo para continuar.');
        }

        const patch: Record<string, unknown> = {
          status: exceptionModal.mode === 'cancel' ? 'cancelled' : 'no_show',
        };

        if (exceptionModal.mode === 'cancel') patch.cancelled_reason = exceptionReason.trim();
        if (exceptionModal.mode === 'no_show') patch.no_show_reason = exceptionReason.trim();

        const { error } = await supabase.from('appointments')
          .update(patch)
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (error) throw error;

        if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
          const { error: leadError } = await supabase.from('leads')
            .update({ kanban_stage: 'contacted' })
            .eq('clinic_id', clinicId)
            .eq('id', appointment.lead_id);
          if (leadError) throw leadError;
        }

        return;
      }

      if (!rescheduleDate || !rescheduleTime) {
        throw new Error('Escolha a nova data e horário.');
      }

      const startTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const durationMinutes = parseInt(rescheduleDuration) || 60;
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      const nextProfessionalId = rescheduleProfessional === 'unassigned' ? null : rescheduleProfessional;
      if (nextProfessionalId && !hasAvailabilityWindow(nextProfessionalId, startTime, endTime)) {
        throw new Error('Esse novo horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({
        professionalId: nextProfessionalId,
        startTime,
        endTime,
        ignoreAppointmentId: appointment.id,
      });
      const mergedNotes = [appointment.notes, rescheduleNotes].filter(Boolean).join('\n\n');

      const { data: newAppointment, error: createError } = await supabase.from('appointments')
        .insert({
          clinic_id: clinicId,
          patient_id: appointment.patient_id,
          lead_id: appointment.lead_id,
          treatment_id: appointment.treatment_id,
          professional_id: nextProfessionalId,
          appointment_type: appointment.appointment_type,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          scheduled_at: startTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: mergedNotes || null,
          status: 'scheduled',
          credit_check_required: appointment.credit_check_required || false,
          credit_check_status: appointment.credit_check_status || 'not_required',
          rescheduled_from: appointment.id,
          created_by: user?.id || null,
        })
        .select('id')
        .single();
      if (createError) throw createError;

      const { error: updateError } = await supabase.from('appointments')
        .update({
          status: 'rescheduled',
          rescheduled_to: newAppointment.id,
          cancelled_reason: exceptionReason.trim() || 'Remarcado',
        })
        .eq('clinic_id', clinicId)
        .eq('id', appointment.id);
      if (updateError) throw updateError;

      if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: newAppointment.id })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      setExceptionModal(null);
      toast({ title: 'Agenda atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const reassignProfessionalMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      if ((viewAppt.professional_id || null) === nextProfessionalId) return;

      const start = getAppointmentStartDate(viewAppt);
      const end = getAppointmentEndDate(viewAppt);

      if (nextProfessionalId && !hasAvailabilityWindow(nextProfessionalId, start, end)) {
        throw new Error('O profissional selecionado não possui disponibilidade neste horário.');
      }

      await assertNoSchedulingConflicts({
        professionalId: nextProfessionalId,
        startTime: start,
        endTime: end,
        ignoreAppointmentId: viewAppt.id,
      });

      const { error } = await supabase
        .from('appointments')
        .update({ professional_id: nextProfessionalId })
        .eq('id', viewAppt.id)
        .eq('clinic_id', clinicId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!viewAppt) return;
      const nextProfessionalId = reassignProfessional === 'unassigned' ? null : reassignProfessional;
      setViewAppt({ ...viewAppt, professional_id: nextProfessionalId });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Profissional reatribuído!' });
    },
    onError: (error) => toast({ title: 'Não foi possível reatribuir', description: error.message, variant: 'destructive' }),
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !availabilityProfessional || availabilityProfessional === 'unassigned') {
        throw new Error('Selecione um profissional.');
      }

      const { error: deleteError } = await supabase.from('professional_availability')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('professional_id', availabilityProfessional);
      if (deleteError) throw deleteError;

      const rows = weekDays
        .map((day) => ({ day, config: availabilityDraft[day.value] }))
        .filter(({ config }) => config?.isActive)
        .map(({ day, config }) => ({
          clinic_id: clinicId,
          professional_id: availabilityProfessional,
          day_of_week: day.value,
          start_time: config.start,
          end_time: config.end,
          is_active: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('professional_availability').insert(rows);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professional-availability'] });
      setAvailabilityDialogOpen(false);
      toast({ title: 'Disponibilidade atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const createBlockMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !blockReason.trim()) {
        throw new Error('Informe pelo menos o motivo do bloqueio.');
      }

      const startAt = new Date(`${blockStartDate}T${blockStartTime}:00`);
      const endAt = new Date(`${blockEndDate}T${blockEndTime}:00`);
      if (endAt <= startAt) {
        throw new Error('O fim do bloqueio precisa ser depois do início.');
      }

      const { error } = await supabase.from('appointment_blocks').insert({
        clinic_id: clinicId,
        professional_id: blockProfessional === 'all' ? null : blockProfessional,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        reason: blockReason.trim(),
        notes: blockNotes.trim() || null,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      setBlockReason('');
      setBlockNotes('');
      toast({ title: 'Bloqueio criado' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('appointment_blocks').delete().eq('id', blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      toast({ title: 'Bloqueio removido' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });
  const sendReminderQueueMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminder', {
        body: { clinicId, lookAheadHours: 24, limit: 150 },
      });
      if (error) throw error;
      return data as { queued?: number; scanned?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Fila de lembretes atualizada',
        description: `${result?.queued || 0} lembrete(s) preparados de ${result?.scanned || 0} agendamento(s).`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro ao preparar lembretes', description: err.message, variant: 'destructive' }),
  });
  const dispatchReminderMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('dispatch-appointment-reminders', {
        body: { clinicId, limit: 100 },
      });
      if (error) throw error;
      return data as { processed?: number; sent?: number; failed?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Despacho de lembretes executado',
        description: `Processados: ${result?.processed || 0} · Enviados: ${result?.sent || 0} · Falhas: ${result?.failed || 0}`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro no despacho', description: err.message, variant: 'destructive' }),
  });
  const generateDailySummaryMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-daily-agenda-summary', {
        body: { clinicId },
      });
      if (error) throw error;
      return data as { generated?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Resumo diário gerado',
        description: `${result?.generated || 0} clínica(s) processada(s).`,
      });
    },
    onError: (err: Error) => toast({ title: 'Erro ao gerar resumo diário', description: err.message, variant: 'destructive' }),
  });
  const runAgendaJobsMutation = useMutation({
    mutationFn: async (mode: 'morning' | 'hourly' | 'manual') => {
      const { data, error } = await supabase.functions.invoke('run-agenda-jobs', {
        body: { clinicId, mode },
      });
      if (error) throw error;
      return data as { runKey?: string; skipped?: boolean; reason?: string };
    },
    onSuccess: (result) => {
      toast({
        title: result?.skipped ? 'Job já executado' : 'Orquestrador executado',
        description: result?.runKey ? `Run key: ${result.runKey}` : (result?.reason || 'Processo concluído'),
      });
    },
    onError: (err: Error) => toast({ title: 'Erro no orquestrador', description: err.message, variant: 'destructive' }),
  });
  const runWaitlistMutation = useMutation({
    mutationFn: async () => {
      if (!waitlistSchemaAvailable) {
        throw new Error('Lista de espera indisponível: rode as migrations de Agenda Avançada nesta base.');
      }
      const { data, error } = await supabase.functions.invoke('check-waitlist', {
        body: { clinicId },
      });
      if (error) throw error;
      return data as { matchesFound?: number; notificationsSent?: number };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      qc.invalidateQueries({ queryKey: ['waitlist-notifications'] });
      toast({
        title: 'Matching executado',
        description: `${result?.matchesFound || 0} vaga(s) encontrada(s), ${result?.notificationsSent || 0} notificação(ões).`,
      });
    },
    onError: (err: Error) => {
      if (isMissingRelationError(err.message)) {
        setWaitlistSchemaAvailable(false);
        toast({ title: 'Schema da lista de espera não aplicado', description: 'Aplique a migration de Agenda Avançada para habilitar este módulo.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Erro ao rodar o matching', description: err.message, variant: 'destructive' });
    },
  });

  const createAppointmentFromNotificationMutation = useMutation({
    mutationFn: async (notification: WaitlistNotificationRow) => {
      const waitlist = notification.appointment_waitlist;
      if (!clinicId || !waitlist) throw new Error('Dados da lista de espera inválidos.');

      const startTime = notification.matched_slot_start;
      const endTime = notification.matched_slot_end;
      const professionalId = notification.matched_professional_id;
      if (!professionalId) throw new Error('Profissional da vaga não identificado.');

      const appointmentPayload: Record<string, unknown> = {
        clinic_id: clinicId,
        patient_id: waitlist.patient_id,
        lead_id: waitlist.lead_id,
        treatment_id: waitlist.treatment_id,
        professional_id: professionalId,
        start_time: startTime,
        end_time: endTime,
        scheduled_at: startTime,
        duration_minutes: waitlist.min_duration_minutes,
        appointment_type: waitlist.lead_id ? 'evaluation' : 'session',
        status: 'scheduled',
        notes: waitlist.notes || null,
      };

      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert(appointmentPayload)
        .select('id')
        .single();
      if (appointmentError) throw appointmentError;

      const { error: notifError } = await supabase
        .from('waitlist_notifications')
        .update({
          action_taken: 'scheduled',
          action_taken_at: new Date().toISOString(),
          action_taken_by: user?.id || null,
          resulting_appointment_id: appointment.id,
        })
        .eq('id', notification.id);
      if (notifError) throw notifError;

      const waitlistUpdate: Record<string, unknown> = {
        status: 'scheduled',
        resulting_appointment_id: appointment.id,
      };
      if (waitlist.lead_id) waitlistUpdate['match_found_at'] = new Date().toISOString();

      const { error: waitlistError } = await supabase
        .from('appointment_waitlist')
        .update(waitlistUpdate)
        .eq('id', waitlist.id);
      if (waitlistError) throw waitlistError;

      if (waitlist.lead_id) {
        await supabase
          .from('leads')
          .update({ appointment_id: appointment.id, kanban_stage: 'scheduled' })
          .eq('id', waitlist.lead_id)
          .eq('clinic_id', clinicId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      qc.invalidateQueries({ queryKey: ['waitlist-notifications'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Agendamento criado a partir da lista de espera' });
    },
    onError: (err: Error) => toast({ title: 'Erro ao criar agendamento', description: err.message, variant: 'destructive' }),
  });

  const createWaitlistMutation = useMutation({
    mutationFn: async () => {
      if (!waitlistSchemaAvailable) {
        throw new Error('Lista de espera indisponível: rode as migrations de Agenda Avançada nesta base.');
      }
      if (!clinicId) throw new Error('Clínica não identificada.');
      if (waitlistTargetType === 'lead' && !waitlistLeadId) throw new Error('Selecione um lead.');
      if (waitlistTargetType === 'patient' && !waitlistPatientId) throw new Error('Selecione um paciente.');
      if (!waitlistWindowStart || !waitlistWindowEnd) throw new Error('Informe a janela de busca.');
      if (waitlistWindowEnd < waitlistWindowStart) throw new Error('A data final deve ser maior ou igual à data inicial.');

      const periods = waitlistPreferredPeriod === 'all'
        ? ['morning', 'afternoon', 'evening']
        : [waitlistPreferredPeriod];

      const payload: Database['public']['Tables']['appointment_waitlist']['Insert'] = {
        clinic_id: clinicId,
        lead_id: waitlistTargetType === 'lead' ? waitlistLeadId : null,
        patient_id: waitlistTargetType === 'patient' ? waitlistPatientId : null,
        preferred_professional_id: waitlistProfessionalId === 'any' ? null : waitlistProfessionalId,
        treatment_id: waitlistTreatmentId === 'none' ? null : waitlistTreatmentId,
        window_type: waitlistWindowType,
        window_start: waitlistWindowStart,
        window_end: waitlistWindowEnd,
        preferred_periods: periods,
        min_duration_minutes: parseInt(waitlistDuration, 10) || 60,
        priority: waitlistPriority,
        status: 'waiting',
        contact_preference: waitlistContactPreference,
        contact_phone: waitlistContactPhone.trim() || null,
        notes: waitlistNotes.trim() || null,
        created_by: user?.id || null,
      };

      const { error } = await supabase.from('appointment_waitlist').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-waitlist'] });
      toast({ title: 'Lead/paciente adicionado à lista de espera' });
      resetWaitlistForm();
    },
    onError: (err: Error) => {
      if (isMissingRelationError(err.message)) {
        setWaitlistSchemaAvailable(false);
        toast({ title: 'Schema da lista de espera não aplicado', description: 'Aplique a migration de Agenda Avançada para habilitar este módulo.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

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

  const resetWaitlistForm = () => {
    setWaitlistTargetType('lead');
    setWaitlistLeadId('');
    setWaitlistPatientId('');
    setWaitlistProfessionalId('any');
    setWaitlistTreatmentId('none');
    setWaitlistWindowType('this_week');
    const window = getWindowByType('this_week');
    setWaitlistWindowStart(window.start);
    setWaitlistWindowEnd(window.end);
    setWaitlistPreferredPeriod('all');
    setWaitlistDuration('60');
    setWaitlistPriority('normal');
    setWaitlistContactPreference('whatsapp');
    setWaitlistContactPhone('');
    setWaitlistNotes('');
  };

  const ensurePatientForLead = async (leadId: string) => {
    const { data: lead, error: leadError } = await supabase.from('leads')
      .select('*')
      .eq('clinic_id', clinicId!)
      .eq('id', leadId)
      .single();
    if (leadError) throw leadError;

    if (lead.patient_id) return lead.patient_id as string;

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: clinicId!,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: lead.cpf,
        email: lead.email,
        date_of_birth: lead.birth_date,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();
    if (patientError) throw patientError;

    const { error: updateLeadError } = await supabase.from('leads')
      .update({
        patient_id: patient.id,
        converted_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId!)
      .eq('id', leadId);
    if (updateLeadError) throw updateLeadError;

    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['patients'] });
    qc.invalidateQueries({ queryKey: ['patients-select'] });

    return patient.id as string;
  };

  const openProposalFromEvaluation = async (appointment: AppointmentRow, finalizeFirst = false) => {
    if (!clinicId || !appointment?.lead_id) return;

    setProposalLoadingId(appointment.id);
    try {
      if (finalizeFirst) {
        const { error: appointmentError } = await supabase.from('appointments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (appointmentError) throw appointmentError;

        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }

      const patientId = await ensurePatientForLead(appointment.lead_id);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      navigate(`/clinic/proposals?patientId=${patientId}&leadId=${appointment.lead_id}&openNew=1`);
    } catch (err) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível abrir a proposta.', variant: 'destructive' });
    } finally {
      setProposalLoadingId(null);
    }
  };

  const navigate_ = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const getApptsForDay = (day: Date) => filteredAppointments.filter((a) => isSameDay(getAppointmentStartDate(a), day));
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'week'
    ? `${format(rangeStart, 'dd/MM', { locale: ptBR })} - ${format(rangeEnd, 'dd/MM/yyyy', { locale: ptBR })}`
    : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return {
    clinicId,
    user,
    role,
    navigate,
    searchParams,
    setSearchParams,
    toast,
    qc,
    currentDate,
    setCurrentDate,
    viewMode,
    setViewMode,
    dialogOpen,
    setDialogOpen,
    viewAppt,
    setViewAppt,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    appointmentType,
    setAppointmentType,
    selectedPatient,
    setSelectedPatient,
    selectedLead,
    setSelectedLead,
    selectedTreatment,
    setSelectedTreatment,
    selectedProfessional,
    setSelectedProfessional,
    filterProfessional,
    setFilterProfessional,
    filterStatus,
    setFilterStatus,
    queueExpanded,
    setQueueExpanded,
    createFormError,
    setCreateFormError,
    duration,
    setDuration,
    notes,
    setNotes,
    quickPatientOpen,
    setQuickPatientOpen,
    availabilityDialogOpen,
    setAvailabilityDialogOpen,
    blocksDialogOpen,
    setBlocksDialogOpen,
    waitlistDialogOpen,
    setWaitlistDialogOpen,
    availabilityProfessional,
    setAvailabilityProfessional,
    availabilityDraft,
    setAvailabilityDraft,
    blockProfessional,
    setBlockProfessional,
    blockStartDate,
    setBlockStartDate,
    blockStartTime,
    setBlockStartTime,
    blockEndDate,
    setBlockEndDate,
    blockEndTime,
    setBlockEndTime,
    blockReason,
    setBlockReason,
    blockNotes,
    setBlockNotes,
    exceptionModal,
    setExceptionModal,
    exceptionReason,
    setExceptionReason,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    rescheduleDuration,
    setRescheduleDuration,
    rescheduleProfessional,
    setRescheduleProfessional,
    rescheduleNotes,
    setRescheduleNotes,
    reassignProfessional,
    setReassignProfessional,
    proposalLoadingId,
    setProposalLoadingId,
    waitlistTargetType,
    setWaitlistTargetType,
    waitlistLeadId,
    setWaitlistLeadId,
    waitlistPatientId,
    setWaitlistPatientId,
    waitlistProfessionalId,
    setWaitlistProfessionalId,
    waitlistTreatmentId,
    setWaitlistTreatmentId,
    waitlistWindowType,
    setWaitlistWindowType,
    waitlistWindowStart,
    setWaitlistWindowStart,
    waitlistWindowEnd,
    setWaitlistWindowEnd,
    waitlistPreferredPeriod,
    setWaitlistPreferredPeriod,
    waitlistDuration,
    setWaitlistDuration,
    waitlistPriority,
    setWaitlistPriority,
    waitlistContactPreference,
    setWaitlistContactPreference,
    waitlistContactPhone,
    setWaitlistContactPhone,
    waitlistNotes,
    setWaitlistNotes,
    waitlistSchemaAvailable,
    setWaitlistSchemaAvailable,
    prefillLeadId,
    prefillPatientId,
    prefillProfessionalId,
    prefillAppointmentType,
    prefillTreatmentId,
    shouldOpenNewFromQuery,
    isProfessional,
    rangeStart,
    rangeEnd,
    calendarDays,
    appointments,
    selectedPatientLookupId,
    patients,
    leads,
    treatments,
    contracts,
    proposalItems,
    sessionRecords,
    professionals,
    availability,
    appointmentBlocks,
    waitlistEntries,
    waitlistNotifications,
    reminderQueue,
    whatsappLogs,
    agendaJobExecutions,
    getSelectedPatientData,
    getSelectedLeadData,
    getAppointmentStartDate,
    getAppointmentEndDate,
    getAppointmentDisplayName,
    getBlocksForDay,
    getProfessionalLabel,
    hasAvailabilityWindow,
    assertNoSchedulingConflicts,
    openExceptionModal,
    getProfColor,
    sessionTreatmentSummaryMap,
    sessionTreatmentOptions,
    selectedSessionTreatmentSummary,
    hasSessionBalance,
    filteredAppointments,
    operationalSummary,
    todayQueue,
    agendaSignals,
    whatsappOpsSummary,
    createMutation,
    updateStatusMutation,
    appointmentExceptionMutation,
    reassignProfessionalMutation,
    saveAvailabilityMutation,
    createBlockMutation,
    deleteBlockMutation,
    sendReminderQueueMutation,
    dispatchReminderMutation,
    generateDailySummaryMutation,
    runAgendaJobsMutation,
    runWaitlistMutation,
    createAppointmentFromNotificationMutation,
    createWaitlistMutation,
    resetForm,
    resetWaitlistForm,
    ensurePatientForLead,
    openProposalFromEvaluation,
    navigate_,
    getApptsForDay,
    dayNames,
    headerLabel,
  };
}

export type AgendaPageController = ReturnType<typeof useAgendaPage>;
