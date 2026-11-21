import { useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isSameDay, startOfDay, endOfDay } from 'date-fns';
import { professionalColors, getWindowByType, appointmentTypeValue } from '@/lib/agenda/model';
import type { Enums, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

import type { AgendaStatePart1 } from './agendaStatePart1';

/** Parte 2 de useAgendaPage (dividido por tamanho; a lógica é a mesma). */
export function useAgendaStatePart2(p: AgendaStatePart1) {
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
    proposalItems, sessionRecords, professionals, allProfessionals, myProfessionalId, professionalIdForUser,
    availability, appointmentBlocks, waitlistEntries, waitlistNotifications, reminderQueue, whatsappLogs,
    agendaJobExecutions, getSelectedPatientData, getSelectedLeadData, getAppointmentStartDate,
    getAppointmentEndDate, getAppointmentDisplayName, getBlocksForDay, getProfessionalLabel,
    hasAvailabilityWindow, assertNoSchedulingConflicts, openExceptionModal, resetForm,
  } = p;
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
      if (!selectedProfessional && isProfessional && myProfessionalId) {
        setSelectedProfessional(myProfessionalId);
      }
      return;
    }

    // O responsável pelo lead é um login; na agenda vale o cadastro de profissional dele, se tiver.
    const assignedProfessionalId = professionalIdForUser(lead.assigned_to);
    setSelectedProfessional(assignedProfessionalId || (isProfessional && myProfessionalId ? myProfessionalId : ''));
  }, [appointmentType, selectedLead, isProfessional, myProfessionalId, professionalIdForUser, dialogOpen, selectedProfessional, getSelectedLeadData]);

  useEffect(() => {
    if (professionals.length > 0 && availabilityProfessional === 'unassigned') {
      setAvailabilityProfessional(professionals[0].id);
    }
  }, [professionals, availabilityProfessional]);


  useEffect(() => {
    if (waitlistWindowType !== 'custom') {
      const window = getWindowByType(waitlistWindowType);
      setWaitlistWindowStart(window.start);
      setWaitlistWindowEnd(window.end);
    }
  }, [waitlistWindowType]);

  const getProfColor = (profId: string | null) => {
    if (!profId) return professionalColors[0];
    const index = allProfessionals.findIndex(p => p.id === profId);
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
    if (filterProfessionals.length > 0) {
      filtered = filtered.filter((a) => (a.professional_id
        ? filterProfessionals.includes(a.professional_id)
        : filterProfessionals.includes('unassigned')));
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessionals, filterStatus]);

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
      const profId = selectedProfessional || (isProfessional ? myProfessionalId : null);
      if (!profId) {
        throw new Error('Selecione um profissional para este agendamento.');
      }
      if (profId && !hasAvailabilityWindow(profId, startTime, endTime)) {
        throw new Error('Esse horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({ professionalId: profId, startTime, endTime });
      const lead = appointmentType === 'evaluation' ? getSelectedLeadData(selectedLead) : null;
      if (appointmentType === 'evaluation' && !selectedPatient && !selectedLead) {
        throw new Error('Selecione um paciente ou lead para a avaliação.');
      }
      if (appointmentType === 'single') {
        if (!selectedPatient) throw new Error('Selecione o paciente da sessão avulsa.');
        if (!selectedTreatment) throw new Error('Selecione o tratamento da sessão avulsa.');
      }
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
      const payload: TablesInsert<'appointments'> = {
        clinic_id: clinicId!,
        patient_id: appointmentType !== 'evaluation' || selectedPatient ? selectedPatient : null,
        lead_id: appointmentType === 'evaluation' && !selectedPatient ? selectedLead : null,
        treatment_id: selectedTreatment || null,
        professional_id: profId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        scheduled_at: startTime.toISOString(),
        duration_minutes: parseInt(duration) || 60,
        appointment_type: appointmentTypeValue(appointmentType),
        credit_check_required: appointmentType === 'evaluation' ? !!lead?.cpf : false,
        credit_check_status: appointmentType === 'evaluation' && lead?.cpf ? 'pending' : 'not_required',
        notes: notes || null,
      };
      const { data: insertedAppointment, error } = await supabase.from('appointments')
        .insert(payload)
        .select('id, start_time, professional_id')
        .single();
      if (error) throw error;

      if (appointmentType === 'evaluation' && selectedLead && !selectedPatient) {
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
      const patch: TablesUpdate<'appointments'> = { status: status as Enums<'appointment_status'> };

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

        const patch: TablesUpdate<'appointments'> = {
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

  const moveAppointmentMutation = useMutation({
    mutationFn: async ({
      appointmentId,
      newDate,
      newTime,
      newProfessionalId,
    }: {
      appointmentId: string;
      newDate: string;
      newTime: string;
      newProfessionalId?: string | null;
    }) => {
      if (!clinicId) throw new Error('Clínica não encontrada.');
      const appointment = appointments.find((a) => a.id === appointmentId);
      if (!appointment) throw new Error('Agendamento não encontrado.');

      if (['cancelled', 'completed', 'rescheduled'].includes(appointment.status)) {
        throw new Error('Não é possível mover um agendamento finalizado ou cancelado.');
      }

      const currentStart = getAppointmentStartDate(appointment);
      const currentEnd = getAppointmentEndDate(appointment);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const durationMinutes = Math.max(15, Math.round(durationMs / 60000));

      const newStartTime = new Date(`${newDate}T${newTime}:00`);
      const newEndTime = new Date(newStartTime.getTime() + durationMinutes * 60000);

      const targetProfessionalId = newProfessionalId !== undefined ? newProfessionalId : appointment.professional_id;

      // Se soltou no mesmo horário e com o mesmo profissional, não faz nada
      if (
        currentStart.getTime() === newStartTime.getTime() &&
        (appointment.professional_id || null) === (targetProfessionalId || null)
      ) {
        return;
      }

      if (targetProfessionalId && !hasAvailabilityWindow(targetProfessionalId, newStartTime, newEndTime)) {
        throw new Error('Esse novo horário está fora da disponibilidade semanal do profissional.');
      }

      await assertNoSchedulingConflicts({
        professionalId: targetProfessionalId,
        startTime: newStartTime,
        endTime: newEndTime,
        ignoreAppointmentId: appointment.id,
      });

      const patch: TablesUpdate<'appointments'> = {
        start_time: newStartTime.toISOString(),
        end_time: newEndTime.toISOString(),
        scheduled_at: newStartTime.toISOString(),
        duration_minutes: durationMinutes,
      };

      if (newProfessionalId !== undefined) {
        patch.professional_id = newProfessionalId;
      }

      const { error } = await supabase
        .from('appointments')
        .update(patch)
        .eq('id', appointment.id)
        .eq('clinic_id', clinicId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Agendamento remanejado com sucesso!' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Não foi possível mover o agendamento',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

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
    hasAvailabilityWindow, assertNoSchedulingConflicts, openExceptionModal, resetForm, getProfColor,
    sessionTreatmentSummaryMap, sessionTreatmentOptions, selectedSessionTreatmentSummary, hasSessionBalance,
    filteredAppointments, operationalSummary, todayQueue, agendaSignals, whatsappOpsSummary, createMutation,
    updateStatusMutation, appointmentExceptionMutation, reassignProfessionalMutation, moveAppointmentMutation,
  };
}
export type AgendaStatePart2 = ReturnType<typeof useAgendaStatePart2>;
