import { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getRenewalAlertLevel } from '@/lib/renewal/rules';
import { normalizePhone, getSchemaMissingColumn, stripUnsupportedLeadFields, isSchedulableAppointmentStatus, getPriorityRank, normalizeLeadSource, type StageCode, type LeadRow, type RenewalTaskRow, type RenewalInteractionRow, type LeadProposalRow } from '@/lib/crm/model';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { displayStageCode } from '@/lib/crm/boardColumns';

import type { CrmStatePart1 } from './crmStatePart1';

/** Parte 2 de useCrmPage (dividido por tamanho; a lógica é a mesma). */
export function useCrmStatePart2(p: CrmStatePart1) {
  const {
    clinicId, user, role, toast, navigate, searchParams, setSearchParams, qc, search, setSearch,
    assignedFilter, setAssignedFilter, stageFilter, setStageFilter, sourceFilter, setSourceFilter,
    insightFilter, setInsightFilter, viewMode, setViewMode, detailsExpanded, setDetailsExpanded,
    renewalsExpanded, setRenewalsExpanded, renewalHistoryTaskId, setRenewalHistoryTaskId, dragLeadId,
    setDragLeadId, leadDrawer, setLeadDrawer, quickCreateOpen, setQuickCreateOpen, interactionOpen,
    setInteractionOpen, lossModal, setLossModal, selectedLeadIds, setSelectedLeadIds, bulkAssignValue,
    setBulkAssignValue, bulkStageValue, setBulkStageValue, quickForm, setQuickForm, interactionForm,
    setInteractionForm, lossForm, setLossForm, contractDialogProposal, setContractDialogProposal,
    paymentCondition, setPaymentCondition, selectedPaymentMethods, setSelectedPaymentMethods, paymentDetails,
    setPaymentDetails, paymentConfig, setPaymentConfig, payerData, setPayerData, proposalDialogOpen,
    setProposalDialogOpen, proposalLead, setProposalLead, proposalPatientId, setProposalPatientId,
    proposalValidUntil, setProposalValidUntil, proposalNotes, setProposalNotes, proposalItems,
    setProposalItems, proposalViewDialog, setProposalViewDialog, prefillLeadId, leads, isLoading,
    configuredStages, finalColumnLabel, boardColumns, visibleStages, displayStageOf, staff,
    professionalIdForUser, treatments, proposals, renewalTasks, renewalInteractions, interactions,
    leadAppointments, leadProposals, leadContracts, staffMap, staffRoleMap, treatmentMap, proposalMap,
    stageMap, availableSources, resetProposalDialog, generateProposalNumber, defaultProposalItemForLead,
    proposalTotal, addProposalItem, ensurePatientForLead, openProposalFlow, openExistingProposal,
    openExistingContract, resetContractDialog, openLeadContractDialog, togglePaymentMethod, clearQuickFilters,
  } = p;
  const toggleInsightFilter = (filter: 'without_owner' | 'stalled' | 'scheduled' | 'proposal_open' | 'overdue_follow_up' | 'high_priority') => {
    const nextValue = insightFilter === filter ? 'all' : filter;
    setInsightFilter(nextValue);
    if (nextValue === 'all') {
      setAssignedFilter('all');
      setStageFilter('all');
      return;
    }
    if (filter === 'without_owner') {
      setAssignedFilter('unassigned');
      setStageFilter('all');
      return;
    }
    if (filter === 'scheduled') {
      setStageFilter('scheduled');
      return;
    }
    if (filter === 'overdue_follow_up') {
      setStageFilter('all');
      return;
    }
    if (filter === 'high_priority') {
      setStageFilter('all');
      return;
    }
    if (filter === 'proposal_open') {
      setStageFilter('proposal_sent');
    }
  };

  const baseFilteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = !search || [lead.full_name, lead.phone, lead.cpf]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search.toLowerCase()));
      const matchesAssignee =
        assignedFilter === 'all' ||
        (assignedFilter === 'unassigned' ? !lead.assigned_to : lead.assigned_to === assignedFilter);
      const matchesStage = stageFilter === 'all' || lead.kanban_stage === stageFilter || displayStageCode(boardColumns, lead.kanban_stage) === stageFilter;
      const leadSource = normalizeLeadSource(lead.source);
      const matchesSource = sourceFilter === 'all' || leadSource === sourceFilter;
      return matchesSearch && matchesAssignee && matchesStage && matchesSource;
    });
  }, [leads, search, assignedFilter, stageFilter, sourceFilter, boardColumns]);

  const filteredLeads = useMemo(() => {
    const isStalledLead = (lead: LeadRow) => {
      const lastTouch = new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime();
      const daysWithoutProgress = (Date.now() - lastTouch) / (1000 * 60 * 60 * 24);
      return !['closed_won', 'closed_lost'].includes(lead.kanban_stage) && daysWithoutProgress > 3;
    };

    return baseFilteredLeads.filter((lead) => {
      if (insightFilter === 'without_owner') return !lead.assigned_to && !['closed_won', 'closed_lost'].includes(lead.kanban_stage);
      if (insightFilter === 'stalled') return isStalledLead(lead);
      if (insightFilter === 'scheduled') return lead.kanban_stage === 'scheduled';
      if (insightFilter === 'overdue_follow_up') return !!lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now();
      if (insightFilter === 'high_priority') return lead.priority_level === 'high';
      if (insightFilter === 'proposal_open') return lead.kanban_stage === 'proposal_sent';
      return true;
    }).sort((a, b) => {
      const priorityDiff = getPriorityRank(a.priority_level) - getPriorityRank(b.priority_level);
      if (priorityDiff !== 0) return priorityDiff;

      const aFollowUp = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bFollowUp = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (aFollowUp !== bFollowUp) return aFollowUp - bFollowUp;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [baseFilteredLeads, insightFilter]);

  const stageGroups = useMemo(() => {
    return boardColumns.map((column) => {
      const items = filteredLeads.filter((lead) => column.stageCodes.includes(lead.kanban_stage));
      const totalValue = items.reduce((sum, lead) => {
        const matched = proposalMap[lead.proposal_id || ''];
        return sum + Number(matched?.final_amount || 0);
      }, 0);
      return { ...column.stage, code: column.code, label: column.label, isFinal: column.isFinal, stageCodes: column.stageCodes, items, totalValue };
    });
  }, [boardColumns, filteredLeads, proposalMap]);

  const selectedLeads = useMemo(
    () => filteredLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [filteredLeads, selectedLeadIds]
  );

  const topKpis = useMemo(() => {
    const activePipeline = filteredLeads.filter((lead) => !['closed_won', 'closed_lost'].includes(lead.kanban_stage));
    const closedWon = filteredLeads.filter((lead) => lead.kanban_stage === 'closed_won');
    const closedLost = filteredLeads.filter((lead) => lead.kanban_stage === 'closed_lost');
    const acceptedValues = closedWon.reduce((sum, lead) => {
      const proposal = proposalMap[lead.proposal_id || ''];
      return sum + Number(proposal?.final_amount || 0);
    }, 0);
    const pipelineValue = filteredLeads
      .filter((lead) => lead.kanban_stage === 'proposal_sent')
      .reduce((sum, lead) => {
        const proposal = proposalMap[lead.proposal_id || ''];
        return sum + Number(proposal?.final_amount || 0);
      }, 0);

    return {
      total: activePipeline.length,
      conversion: closedWon.length + closedLost.length > 0 ? Math.round((closedWon.length / (closedWon.length + closedLost.length)) * 100) : 0,
      ticket: closedWon.length ? acceptedValues / closedWon.length : 0,
      pipelineValue,
    };
  }, [filteredLeads, proposalMap]);

  const commercialInsights = useMemo(() => {
    const now = Date.now();
    const stalledLeads = baseFilteredLeads.filter((lead) => {
      const lastTouch = new Date(lead.last_interaction_at || lead.stage_changed_at || lead.created_at).getTime();
      const daysWithoutProgress = (now - lastTouch) / (1000 * 60 * 60 * 24);
      return !['closed_won', 'closed_lost'].includes(lead.kanban_stage) && daysWithoutProgress > 3;
    });

    const withoutOwner = baseFilteredLeads.filter((lead) =>
      !lead.assigned_to && !['closed_won', 'closed_lost'].includes(lead.kanban_stage)
    );

    const nextEvaluations = baseFilteredLeads.filter((lead) => lead.kanban_stage === 'scheduled').length;
    const highPriority = baseFilteredLeads.filter((lead) => lead.priority_level === 'high').length;
    const awaitingProposalResponse = baseFilteredLeads.filter((lead) => lead.kanban_stage === 'proposal_sent').length;
    const overdueFollowUps = baseFilteredLeads.filter((lead) => !!lead.next_action_at && new Date(lead.next_action_at).getTime() < now).length;

    const topSources = Object.entries(
      baseFilteredLeads.reduce<Record<string, number>>((acc, lead) => {
        const source = normalizeLeadSource(lead.source);
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const ownerCoverage = baseFilteredLeads.length
      ? Math.round(((baseFilteredLeads.length - withoutOwner.length) / baseFilteredLeads.length) * 100)
      : 0;

    const renewalWithoutAction = renewalTasks.filter((task) => (task.days_since_last_action || 0) >= 3).length;

    return {
      stalledLeads,
      withoutOwner,
      nextEvaluations,
      highPriority,
      awaitingProposalResponse,
      overdueFollowUps,
      topSources,
      ownerCoverage,
      renewalWithoutAction,
    };
  }, [baseFilteredLeads, renewalTasks]);

  const sortedRenewalTasks = useMemo(() => {
    const score = (task: RenewalTaskRow) => {
      const level = getRenewalAlertLevel(task.days_since_last_action || 0);
      if (level === 'critical') return 0;
      if (level === 'warning') return 1;
      return 2;
    };

    return [...renewalTasks].sort((a, b) => {
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [renewalTasks]);

  const renewalInteractionsByTask = useMemo(() => {
    const map = new Map<string, RenewalInteractionRow[]>();
    renewalInteractions.forEach((interaction) => {
      const list = map.get(interaction.renewal_task_id) || [];
      list.push(interaction);
      map.set(interaction.renewal_task_id, list);
    });
    return map;
  }, [renewalInteractions]);

  useEffect(() => {
    if (renewalTasks.length === 0) return;
    setRenewalsExpanded(true);
  }, [renewalTasks.length]);

  const insightFilterLabel = useMemo(() => {
    if (insightFilter === 'without_owner') return 'Sem responsável definido';
    if (insightFilter === 'stalled') return 'Parados há mais de 3 dias';
    if (insightFilter === 'scheduled') return 'Avaliações agendadas';
    if (insightFilter === 'overdue_follow_up') return 'Follow-up atrasado';
    if (insightFilter === 'high_priority') return 'Alta prioridade';
    if (insightFilter === 'proposal_open') return 'Propostas abertas';
    return '';
  }, [insightFilter]);

  const createLeadMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !quickForm.full_name.trim() || !quickForm.phone.trim()) {
        throw new Error('Nome e telefone são obrigatórios.');
      }

      const normalizedPhone = normalizePhone(quickForm.phone);
      const duplicate = leads.find((lead) =>
        normalizePhone(lead.phone) === normalizedPhone ||
        (!!quickForm.cpf && !!lead.cpf && lead.cpf === quickForm.cpf)
      );

      if (duplicate) {
        throw new Error(`Já existe um lead com esse telefone/CPF: ${duplicate.full_name}.`);
      }

      const payload = {
        clinic_id: clinicId,
        full_name: quickForm.full_name.trim(),
        phone: quickForm.phone.trim(),
        cpf: quickForm.cpf.trim() || null,
        email: quickForm.email.trim() || null,
        zip_code: quickForm.zip_code.trim() || null,
        address: quickForm.address.trim() || null,
        city: quickForm.city.trim() || null,
        state: quickForm.state.trim() || null,
        source: quickForm.source ? normalizeLeadSource(quickForm.source) : null,
        priority_level: quickForm.priority_level,
        assigned_to: quickForm.assigned_to === 'unassigned' ? null : quickForm.assigned_to,
        treatments_of_interest: quickForm.treatment === 'none' ? [] : [quickForm.treatment],
        notes: quickForm.notes.trim() || null,
        created_by: user?.id || null,
      };

      let requestPayload = payload;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase.from('leads').insert(requestPayload).select('*').single();
        if (!error) return data as LeadRow;

        const missingColumn = getSchemaMissingColumn(error);
        if (!missingColumn) throw error;

        requestPayload = stripUnsupportedLeadFields(requestPayload, missingColumn);
      }

      throw new Error('Não foi possível criar o lead com a estrutura atual do banco.');
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setQuickCreateOpen(false);
      setQuickForm({ full_name: '', phone: '', cpf: '', email: '', zip_code: '', address: '', city: '', state: '', source: '', priority_level: 'medium', assigned_to: 'unassigned', treatment: 'none', notes: '' });
      toast({ title: 'Lead criado', description: `${lead.full_name} entrou em Novo Lead.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const createProposalFromCrmMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !proposalLead || !proposalPatientId) {
        throw new Error('Selecione um lead válido para criar a proposta.');
      }
      if (proposalItems.length === 0) {
        throw new Error('Inclua ao menos um tratamento na proposta.');
      }
      if (proposalItems.some((item) => !item.treatment_id || item.quantity <= 0 || item.unit_price <= 0)) {
        throw new Error('Revise tratamento, quantidade e valor dos itens.');
      }

      const proposalNumber = generateProposalNumber();
      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert({
          clinic_id: clinicId,
          patient_id: proposalPatientId,
          proposal_number: proposalNumber,
          total_amount: proposalTotal,
          final_amount: proposalTotal,
          notes: proposalNotes.trim() || null,
          valid_until: proposalValidUntil || null,
          created_by: user?.id || null,
        })
        .select('id, proposal_number, status, final_amount, patient_id, notes, created_at')
        .single();
      if (error) throw error;

      const proposalItemPayload = proposalItems.map((item) => ({
        proposal_id: proposal.id,
        treatment_id: item.treatment_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
      }));
      const { error: itemsError } = await supabase.from('proposal_items').insert(proposalItemPayload);
      if (itemsError) throw itemsError;

      const { error: leadError } = await supabase
        .from('leads')
        .update({
          patient_id: proposalPatientId,
          proposal_id: proposal.id,
          kanban_stage: 'proposal_sent',
        })
        .eq('clinic_id', clinicId)
        .eq('id', proposalLead.id);
      if (leadError) throw leadError;

      const itemsWithNames = proposalItems.map((item) => ({
        ...item,
        subtotal: item.quantity * item.unit_price,
        treatments: { name: treatmentMap[item.treatment_id] || 'Tratamento' },
      }));

      return {
        ...(proposal as LeadProposalRow),
        patients: { full_name: proposalLead.full_name, payer_id: null, is_self_payer: true },
        items: itemsWithNames,
        leadId: proposalLead.id,
      };
    },
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-all-proposals'] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setLeadDrawer((current) => current?.id === proposal.leadId
        ? { ...current, patient_id: proposal.patient_id, proposal_id: proposal.id, kanban_stage: 'proposal_sent' }
        : current
      );
      resetProposalDialog();
      setProposalViewDialog(proposal);
      toast({ title: 'Proposta criada', description: `${proposal.proposal_number} aberta para negociação.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const updateRenewalMutation = useMutation({
    mutationFn: async ({
      task,
      actionType,
      notes,
      patch,
    }: {
      task: RenewalTaskRow;
      actionType: 'whatsapp_sent' | 'call_attempted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded' | 'note';
      notes?: string;
      patch?: Record<string, unknown>;
    }) => {
      const updatePayload = {
        last_action_at: new Date().toISOString(),
        last_action_type: actionType,
        ...patch,
      };

      const { error: updateError } = await supabase
        .from('renewal_tasks')
        .update(updatePayload)
        .eq('id', task.id);
      if (updateError) throw updateError;

      const { error: interactionError } = await supabase.from('renewal_interactions').insert({
        clinic_id: task.clinic_id,
        renewal_task_id: task.id,
        patient_id: task.patient_id,
        type: actionType,
        notes: notes || null,
        performed_by: user?.id || null,
      });
      if (interactionError) throw interactionError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-renewal-tasks'] });
      toast({ title: 'Renovação atualizada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });


  async function registerLeadInteraction({
    lead,
    type,
    notes,
    autoAdvance,
  }: {
    lead: LeadRow;
    type: string;
    notes?: string | null;
    autoAdvance?: boolean;
  }) {
    const { error } = await supabase.from('lead_interactions').insert({
      clinic_id: lead.clinic_id,
      lead_id: lead.id,
      type,
      notes: notes || null,
      performed_by: user?.id || null,
    });
    if (error) throw error;

    if (autoAdvance && lead.kanban_stage === 'new_lead') {
      const { error: updateError } = await supabase.from('leads')
        .update({ kanban_stage: 'contacted' })
        .eq('clinic_id', lead.clinic_id)
        .eq('id', lead.id);
      if (updateError) throw updateError;
    }
  }

  async function transitionLeadStage({
    lead,
    targetStage,
    lostReason,
    lostReasonNotes,
  }: {
    lead: LeadRow;
    targetStage: StageCode;
    lostReason?: string;
    lostReasonNotes?: string;
  }) {
    if (['closed_won', 'closed_lost'].includes(lead.kanban_stage) && role !== 'admin' && targetStage !== lead.kanban_stage) {
      throw new Error('Apenas admin pode reabrir lead fechado ou perdido.');
    }

    if (targetStage === 'proposal_sent' && !lead.proposal_id) {
      throw new Error('Crie ou vincule uma proposta antes de mover para Proposta Enviada.');
    }

    let nextPatientId = lead.patient_id;
    const nextAppointmentId = lead.appointment_id;
    const patch: TablesUpdate<'leads'> = {
      kanban_stage: targetStage,
    };

    if (targetStage === 'scheduled') {
      if (!lead.appointment_id) {
        throw new Error('Para mover para Agendado, primeiro confirme data, hora e profissional na Agenda.');
      }

      const { data: appointment, error } = await supabase.from('appointments')
        .select('id, professional_id, start_time, scheduled_at, status')
        .eq('clinic_id', lead.clinic_id)
        .eq('lead_id', lead.id)
        .eq('id', lead.appointment_id)
        .maybeSingle();

      if (error) throw error;
      if (!appointment) {
        throw new Error('Agendamento vinculado não encontrado. Abra a Agenda e confirme data, hora e profissional antes de mover.');
      }
      if (!appointment.professional_id || !(appointment.start_time || appointment.scheduled_at)) {
        throw new Error('O agendamento precisa ter profissional, data e hora confirmados antes de mover para Agendado.');
      }
      if (!isSchedulableAppointmentStatus(appointment.status)) {
        throw new Error('O agendamento vinculado precisa estar com status Agendado ou Confirmado.');
      }
    }

    if (targetStage === 'proposal_sent' && lead.appointment_id) {
      const { error } = await supabase.from('appointments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', lead.appointment_id);
      if (error) throw error;
    }

    if (targetStage === 'closed_won') {
      if (!lead.proposal_id) {
        throw new Error('Vincule uma proposta antes de fechar o lead.');
      }
      nextPatientId = await ensurePatientForLead(lead);
      patch.patient_id = nextPatientId;
      patch.converted_at = new Date().toISOString();
    }

    if (targetStage === 'closed_lost') {
      if (!lostReason) {
        throw new Error('Informe o motivo da perda.');
      }
      patch.lost_reason = lostReason;
      patch.lost_reason_notes = lostReasonNotes || null;
    }

    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (error) throw error;

    return { nextPatientId, nextAppointmentId };
  }

  return {
    clinicId, user, role, toast, navigate, searchParams, setSearchParams, qc, search, setSearch,
    assignedFilter, setAssignedFilter, stageFilter, setStageFilter, sourceFilter, setSourceFilter,
    insightFilter, setInsightFilter, viewMode, setViewMode, detailsExpanded, setDetailsExpanded,
    renewalsExpanded, setRenewalsExpanded, renewalHistoryTaskId, setRenewalHistoryTaskId, dragLeadId,
    setDragLeadId, leadDrawer, setLeadDrawer, quickCreateOpen, setQuickCreateOpen, interactionOpen,
    setInteractionOpen, lossModal, setLossModal, selectedLeadIds, setSelectedLeadIds, bulkAssignValue,
    setBulkAssignValue, bulkStageValue, setBulkStageValue, quickForm, setQuickForm, interactionForm,
    setInteractionForm, lossForm, setLossForm, contractDialogProposal, setContractDialogProposal,
    paymentCondition, setPaymentCondition, selectedPaymentMethods, setSelectedPaymentMethods, paymentDetails,
    setPaymentDetails, paymentConfig, setPaymentConfig, payerData, setPayerData, proposalDialogOpen,
    setProposalDialogOpen, proposalLead, setProposalLead, proposalPatientId, setProposalPatientId,
    proposalValidUntil, setProposalValidUntil, proposalNotes, setProposalNotes, proposalItems,
    setProposalItems, proposalViewDialog, setProposalViewDialog, prefillLeadId, leads, isLoading,
    configuredStages, finalColumnLabel, boardColumns, visibleStages, displayStageOf, staff,
    professionalIdForUser, treatments, proposals, renewalTasks, renewalInteractions, interactions,
    leadAppointments, leadProposals, leadContracts, staffMap, staffRoleMap, treatmentMap, proposalMap,
    stageMap, availableSources, resetProposalDialog, generateProposalNumber, defaultProposalItemForLead,
    proposalTotal, addProposalItem, ensurePatientForLead, openProposalFlow, openExistingProposal,
    openExistingContract, resetContractDialog, openLeadContractDialog, togglePaymentMethod, clearQuickFilters,
    toggleInsightFilter, baseFilteredLeads, filteredLeads, stageGroups, selectedLeads, topKpis,
    commercialInsights, sortedRenewalTasks, renewalInteractionsByTask, insightFilterLabel, createLeadMutation,
    createProposalFromCrmMutation, updateRenewalMutation, registerLeadInteraction, transitionLeadStage,
  };
}
export type CrmStatePart2 = ReturnType<typeof useCrmStatePart2>;
