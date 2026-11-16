import { findPatientDuplicates } from '@/lib/patients/duplicates';
import { onlyDigits } from '@/lib/patients/validation';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';
import { getWindowByType, isMissingRelationError, type AppointmentRow, type WaitlistNotificationRow } from '@/lib/agenda/model';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

import { useAgendaStatePart1 } from './agendaStatePart1';
import { useAgendaStatePart2 } from './agendaStatePart2';
export function useAgendaPage() {
  const part1 = useAgendaStatePart1();
  const part2 = useAgendaStatePart2(part1);
  const {
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
    proposalItems, sessionRecords, professionals, myProfessionalId, 
    availability, appointmentBlocks, waitlistEntries, waitlistNotifications, reminderQueue, whatsappLogs,
    agendaJobExecutions, getSelectedPatientData, getSelectedLeadData, getAppointmentStartDate,
    getAppointmentEndDate, getAppointmentDisplayName, getBlocksForDay, getProfessionalLabel,
    hasAvailabilityWindow, assertNoSchedulingConflicts, openExceptionModal, resetForm, getProfColor,
    sessionTreatmentSummaryMap, sessionTreatmentOptions, selectedSessionTreatmentSummary, hasSessionBalance,
    filteredAppointments, operationalSummary, todayQueue, agendaSignals, whatsappOpsSummary, createMutation,
    updateStatusMutation, appointmentExceptionMutation, reassignProfessionalMutation, moveAppointmentMutation,
  } = part2;
  const updateAppointmentNoteMutation = useMutation({
    mutationFn: async ({ appointmentId, notes }: { appointmentId: string; notes: string }) => {
      if (!clinicId) throw new Error('Clínica não encontrada.');
      const trimmed = notes.trim() || null;
      const { error } = await supabase
        .from('appointments')
        .update({ notes: trimmed })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId);
      if (error) throw error;

      const appt = appointments.find((a) => a.id === appointmentId);
      if (appt?.patient_id && trimmed) {
        await supabase
          .from('patients')
          .update({ notes: trimmed })
          .eq('id', appt.patient_id)
          .eq('clinic_id', clinicId);
      } else if (appt?.lead_id && trimmed) {
        await supabase
          .from('leads')
          .update({ notes: trimmed })
          .eq('id', appt.lead_id)
          .eq('clinic_id', clinicId);
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt((prev) => (prev && prev.id === variables.appointmentId ? { ...prev, notes: variables.notes.trim() || null } : prev));
      toast({ title: 'Nota salva com sucesso!' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Não foi possível salvar a nota',
        description: err.message,
        variant: 'destructive',
      });
    },
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

      const appointmentPayload: TablesInsert<'appointments'> = {
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

      const waitlistUpdate: TablesUpdate<'appointment_waitlist'> = {
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

    // Mesmo CPF de um cliente já cadastrado: liga o lead a ele em vez de duplicar.
    const sameCpf = lead.cpf
      ? (await findPatientDuplicates(clinicId!, lead.cpf, null)).find((d) => d.match_type === 'cpf')
      : undefined;

    const { data: insertedPatient, error: patientError } = sameCpf
      ? { data: { id: sameCpf.patient_id }, error: null }
      : await supabase
      .from('patients')
      .insert({
        clinic_id: clinicId!,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: onlyDigits(lead.cpf) || null,
        email: lead.email,
        date_of_birth: lead.birth_date,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();
    if (patientError) throw patientError;
    const patient = insertedPatient!;

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
    filterProfessionals,
    setFilterProfessionals,
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
    myProfessionalId,
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
    moveAppointmentMutation,
    updateAppointmentNoteMutation,
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
