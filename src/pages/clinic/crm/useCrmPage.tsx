import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import { paymentConditionLabels, isInstallmentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';
import { normalizePhone, getSchemaMissingColumn, stripUnsupportedLeadFields, buildEvaluationScheduleLink, isFollowUpDue, type StageCode, type LeadRow } from '@/lib/crm/model';

import { useCrmStatePart1 } from './crmStatePart1';
import { useCrmStatePart2 } from './crmStatePart2';
export function useCrmPage() {
  const part1 = useCrmStatePart1();
  const part2 = useCrmStatePart2(part1);
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
    configuredStages, visibleStages, displayStageOf, staff,
    professionalIdForUser, treatments, proposals, renewalTasks, renewalInteractions, interactions,
    leadAppointments, leadProposals, leadContracts, staffMap, staffRoleMap, treatmentMap, proposalMap,
    stageMap, availableSources, resetProposalDialog, generateProposalNumber, defaultProposalItemForLead,
    proposalTotal, addProposalItem, ensurePatientForLead, openProposalFlow, openExistingProposal,
    openExistingContract, resetContractDialog, openLeadContractDialog, togglePaymentMethod, clearQuickFilters,
    toggleInsightFilter, baseFilteredLeads, filteredLeads, stageGroups, selectedLeads, topKpis,
    commercialInsights, sortedRenewalTasks, renewalInteractionsByTask, insightFilterLabel, createLeadMutation,
    createProposalFromCrmMutation, updateRenewalMutation, registerLeadInteraction, transitionLeadStage,
  } = part2;
  const moveLeadMutation = useMutation({
    mutationFn: async ({ lead, targetStage, lostReason, lostReasonNotes }: { lead: LeadRow; targetStage: StageCode; lostReason?: string; lostReasonNotes?: string }) => {
      return transitionLeadStage({ lead, targetStage, lostReason, lostReasonNotes });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      if (leadDrawer?.id === variables.lead.id) {
        setLeadDrawer({ ...leadDrawer, kanban_stage: variables.targetStage });
      }
      toast({ title: 'Lead atualizado', description: `Movido para ${stageMap[variables.targetStage]?.label || variables.targetStage}.` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const requestLeadStageMove = (lead: LeadRow, targetStage: StageCode) => {
    if (targetStage === lead.kanban_stage) return;
    if (targetStage === 'scheduled' && !lead.appointment_id) {
      toast({
        title: 'Agende primeiro',
        description: 'Confirme data, hora e profissional na Agenda antes de mover o lead para Agendado.',
      });
      navigate(buildEvaluationScheduleLink(lead.id, professionalIdForUser(lead.assigned_to)));
      return;
    }
    if (targetStage === 'closed_lost') {
      setLossModal({ lead, targetStage });
      return;
    }
    moveLeadMutation.mutate({ lead, targetStage });
  };

  const handleQuickCepChange = async (value: string) => {
    const zipCode = formatCep(value);
    setQuickForm((current) => ({ ...current, zip_code: zipCode }));

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setQuickForm((current) => {
        if (current.zip_code.replace(/\D/g, '') !== zipCode.replace(/\D/g, '')) return current;
        return {
          ...current,
          zip_code: address.zip_code,
          address: address.address || current.address,
          city: address.city || current.city,
          state: address.state || current.state,
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível consultar o CEP.';
      toast({ title: 'Erro ao consultar CEP', description: message, variant: 'destructive' });
    }
  };

  const handleLeadCepChange = async (value: string) => {
    if (!leadDrawer) return;
    const zipCode = formatCep(value);
    setLeadDrawer({ ...leadDrawer, zip_code: zipCode });

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setLeadDrawer((current) => {
        if (!current || current.zip_code?.replace(/\D/g, '') !== zipCode.replace(/\D/g, '')) return current;
        return {
          ...current,
          zip_code: address.zip_code,
          address: address.address || current.address,
          city: address.city || current.city,
          state: address.state || current.state,
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível consultar o CEP.';
      toast({ title: 'Erro ao consultar CEP', description: message, variant: 'destructive' });
    }
  };

  const saveLeadMutation = useMutation({
    mutationFn: async (payload: Partial<LeadRow>) => {
      if (!leadDrawer) return;
      let requestPayload = payload;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await supabase.from('leads').update(requestPayload).eq('id', leadDrawer.id);
        if (!error) break;

        const missingColumn = getSchemaMissingColumn(error);
        if (!missingColumn) throw error;

        requestPayload = stripUnsupportedLeadFields(requestPayload, missingColumn);
        if (Object.keys(requestPayload).length === 0) return;
      }

      const drawerProfessionalId = professionalIdForUser(requestPayload.assigned_to as string | null | undefined);
      if ('assigned_to' in requestPayload && leadDrawer.appointment_id && drawerProfessionalId) {
        const professionalId = drawerProfessionalId;
        const { error: appointmentError } = await supabase.from('appointments')
          .update({ professional_id: professionalId })
          .eq('clinic_id', leadDrawer.clinic_id)
          .eq('id', leadDrawer.appointment_id);
        if (appointmentError) throw appointmentError;
      }

      if (leadDrawer.patient_id) {
        const patientPayload = {
          full_name: requestPayload.full_name ?? leadDrawer.full_name,
          phone: requestPayload.phone ?? leadDrawer.phone,
          cpf: requestPayload.cpf ?? leadDrawer.cpf,
          email: requestPayload.email ?? leadDrawer.email,
          zip_code: requestPayload.zip_code ?? leadDrawer.zip_code,
          address: requestPayload.address ?? leadDrawer.address,
          city: requestPayload.city ?? leadDrawer.city,
          state: requestPayload.state ?? leadDrawer.state,
          notes: requestPayload.notes ?? leadDrawer.notes,
        };
        const { error: patientError } = await supabase.from('patients')
          .update(patientPayload)
          .eq('clinic_id', leadDrawer.clinic_id)
          .eq('id', leadDrawer.patient_id);
        if (patientError) throw patientError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Lead atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const assignLeadMutation = useMutation({
    mutationFn: async ({ leadId, assignedTo, appointmentId, clinicId: targetClinicId }: { leadId: string; assignedTo: string | null; appointmentId: string | null; clinicId: string }) => {
      const { error } = await supabase.from('leads')
        .update({ assigned_to: assignedTo })
        .eq('clinic_id', targetClinicId)
        .eq('id', leadId);
      if (error) throw error;

      const professionalId = professionalIdForUser(assignedTo);
      if (appointmentId && professionalId) {
        const { error: appointmentError } = await supabase.from('appointments')
          .update({ professional_id: professionalId })
          .eq('clinic_id', targetClinicId)
          .eq('id', appointmentId);
        if (appointmentError) throw appointmentError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Responsável atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (assignedTo: string | null) => {
      for (const lead of selectedLeads) {
        const { error } = await supabase.from('leads')
          .update({ assigned_to: assignedTo })
          .eq('clinic_id', lead.clinic_id)
          .eq('id', lead.id);
        if (error) throw error;

        const professionalId = professionalIdForUser(assignedTo);
        if (lead.appointment_id && professionalId) {
          const { error: appointmentError } = await supabase.from('appointments')
            .update({ professional_id: professionalId })
            .eq('clinic_id', lead.clinic_id)
            .eq('id', lead.appointment_id);
          if (appointmentError) throw appointmentError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setSelectedLeadIds([]);
      setBulkAssignValue('unassigned');
      toast({ title: 'Responsável atualizado em lote' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkMoveStageMutation = useMutation({
    mutationFn: async (targetStage: StageCode) => {
      if (targetStage === 'closed_lost') {
        throw new Error('Perda em lote exige motivo. Faça essa ação lead por lead.');
      }

      for (const lead of selectedLeads) {
        if (lead.kanban_stage === targetStage) continue;
        await transitionLeadStage({ lead, targetStage });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setSelectedLeadIds([]);
      setBulkStageValue('none');
      toast({ title: 'Etapa atualizada em lote' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const createInteractionMutation = useMutation({
    mutationFn: async () => {
      if (!leadDrawer) return;
      const { error } = await supabase.from('lead_interactions').insert({
        clinic_id: leadDrawer.clinic_id,
        lead_id: leadDrawer.id,
        type: interactionForm.type,
        notes: interactionForm.notes.trim() || null,
        performed_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setInteractionOpen(false);
      setInteractionForm({ type: 'call_made', notes: '' });
      toast({ title: 'Interação registrada' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const quickInteractionMutation = useMutation({
    mutationFn: async ({ lead, type, notes, autoAdvance }: { lead: LeadRow; type: string; notes?: string; autoAdvance?: boolean }) => {
      await registerLeadInteraction({ lead, type, notes, autoAdvance });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Interação registrada' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const completeFollowUpMutation = useMutation({
    mutationFn: async (lead: LeadRow) => {
      await registerLeadInteraction({
        lead,
        type: 'note',
        notes: `Follow-up executado: ${lead.next_action || 'ação concluída'}.`,
        autoAdvance: true,
      });

      const { error } = await supabase.from('leads')
        .update({
          next_action: null,
          next_action_at: null,
        })
        .eq('clinic_id', lead.clinic_id)
        .eq('id', lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      toast({ title: 'Follow-up concluído' });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const bulkCompleteFollowUpMutation = useMutation({
    mutationFn: async () => {
      const dueLeads = selectedLeads.filter((lead) => isFollowUpDue(lead.next_action_at));
      if (dueLeads.length === 0) {
        throw new Error('Nenhum lead selecionado possui próxima ação vencida/para agora.');
      }

      for (const lead of dueLeads) {
        await registerLeadInteraction({
          lead,
          type: 'note',
          notes: `Follow-up executado em lote: ${lead.next_action || 'ação concluída'}.`,
          autoAdvance: true,
        });

        const { error } = await supabase.from('leads')
          .update({
            next_action: null,
            next_action_at: null,
          })
          .eq('clinic_id', lead.clinic_id)
          .eq('id', lead.id);
        if (error) throw error;
      }

      return dueLeads.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setSelectedLeadIds([]);
      toast({ title: 'Follow-up em lote concluído', description: `${count} lead(s) atualizado(s).` });
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const generateContractFromCrmMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !contractDialogProposal) throw new Error('Selecione uma proposta.');
      if (selectedPaymentMethods.length === 0) throw new Error('Selecione ao menos uma forma de pagamento.');

      const proposalAmount = Number(contractDialogProposal.final_amount || 0);
      const amounts = selectedPaymentMethods.map((method) => Number(paymentConfig[method]?.amount || 0));
      if (amounts.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('Informe um valor válido para cada forma selecionada.');
      }

      const installmentMethods = selectedPaymentMethods.filter((method) => isInstallmentMethod(method));
      if (installmentMethods.some((method) => Number(paymentConfig[method]?.installments || 0) <= 0)) {
        throw new Error('Cartão e boleto exigem quantidade de parcelas maior que zero.');
      }

      const totalInformed = amounts.reduce((sum, value) => sum + value, 0);
      if (totalInformed + 0.0001 < proposalAmount) {
        throw new Error(
          `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${proposalAmount.toFixed(2)}).`
        );
      }

      let resolvedPayerId: string | null = null;
      if (!payerData.is_self_payer) {
        if (payerData.payer_id) {
          resolvedPayerId = payerData.payer_id;
        } else if (payerData.new_payer) {
          if (!payerData.new_payer.name.trim()) throw new Error('Nome do pagador é obrigatório.');
          if (!payerData.new_payer.cpf.trim()) throw new Error('CPF do pagador é obrigatório.');
          const { data: newPayer, error: payerError } = await supabase
            .from('payers')
            .insert({
              clinic_id: clinicId,
              name: payerData.new_payer.name.trim(),
              cpf: payerData.new_payer.cpf.trim(),
              birth_date: payerData.new_payer.birth_date || null,
            })
            .select('id')
            .single();
          if (payerError) throw payerError;
          resolvedPayerId = (newPayer as { id: string }).id;
        } else {
          throw new Error('Selecione ou cadastre um pagador.');
        }
      }

      const now = new Date();
      const contractNumber = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
      const paymentNotes = buildContractPaymentNotes(
        selectedPaymentMethods,
        paymentConfig,
        paymentDetails,
        paymentConditionLabels[paymentCondition]
      );

      if (contractDialogProposal.status !== 'accepted') {
        const { error: proposalError } = await supabase
          .from('proposals')
          .update({ status: 'accepted' })
          .eq('clinic_id', clinicId)
          .eq('id', contractDialogProposal.id);
        if (proposalError) throw proposalError;
      }

      const { data: insertedContract, error } = await supabase
        .from('contracts')
        .insert({
          clinic_id: clinicId,
          patient_id: contractDialogProposal.patient_id,
          proposal_id: contractDialogProposal.id,
          contract_number: contractNumber,
          status: 'draft',
          created_by: user?.id || null,
          start_date: format(now, 'yyyy-MM-dd'),
          notes: paymentNotes,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (insertedContract?.id) {
        await upsertContractFinancialForecast(insertedContract.id);
      }

      const { error: patientError } = await supabase
        .from('patients')
        .update({
          is_self_payer: payerData.is_self_payer,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .eq('id', contractDialogProposal.patient_id)
        .eq('clinic_id', clinicId);
      if (patientError) throw patientError;

      if (leadDrawer) {
        const { error: leadError } = await supabase
          .from('leads')
          .update({ kanban_stage: 'closed_won', proposal_id: contractDialogProposal.id })
          .eq('clinic_id', clinicId)
          .eq('id', leadDrawer.id);
        if (leadError) throw leadError;
      }

      return contractNumber;
    },
    onSuccess: (contractNumber) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-contracts'] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato gerado!', description: `Nº ${contractNumber}` });
      setProposalViewDialog(null);
      resetContractDialog();
    },
    onError: (error: Error) => toast({ title: 'Erro', description: error.message, variant: 'destructive' }),
  });

  const canOpenWhatsApp = (lead: LeadRow) => !!normalizePhone(lead.phone);

  const latestLeadProposal = leadProposals[0];
  const latestLeadContract = leadContracts[0];

  return {
    professionalIdForUser,
    clinicId,
    user,
    role,
    toast,
    navigate,
    searchParams,
    setSearchParams,
    qc,
    search,
    setSearch,
    assignedFilter,
    setAssignedFilter,
    stageFilter,
    setStageFilter,
    sourceFilter,
    setSourceFilter,
    insightFilter,
    setInsightFilter,
    viewMode,
    setViewMode,
    detailsExpanded,
    setDetailsExpanded,
    renewalsExpanded,
    setRenewalsExpanded,
    renewalHistoryTaskId,
    setRenewalHistoryTaskId,
    dragLeadId,
    setDragLeadId,
    leadDrawer,
    setLeadDrawer,
    quickCreateOpen,
    setQuickCreateOpen,
    interactionOpen,
    setInteractionOpen,
    lossModal,
    setLossModal,
    selectedLeadIds,
    setSelectedLeadIds,
    bulkAssignValue,
    setBulkAssignValue,
    bulkStageValue,
    setBulkStageValue,
    quickForm,
    setQuickForm,
    interactionForm,
    setInteractionForm,
    lossForm,
    setLossForm,
    contractDialogProposal,
    setContractDialogProposal,
    paymentCondition,
    setPaymentCondition,
    selectedPaymentMethods,
    setSelectedPaymentMethods,
    paymentDetails,
    setPaymentDetails,
    paymentConfig,
    setPaymentConfig,
    payerData,
    setPayerData,
    proposalDialogOpen,
    setProposalDialogOpen,
    proposalLead,
    setProposalLead,
    proposalPatientId,
    setProposalPatientId,
    proposalValidUntil,
    setProposalValidUntil,
    proposalNotes,
    setProposalNotes,
    proposalItems,
    setProposalItems,
    proposalViewDialog,
    setProposalViewDialog,
    prefillLeadId,
    leads,
    isLoading,
    configuredStages,
    visibleStages,
    displayStageOf,
    staff,
    treatments,
    proposals,
    renewalTasks,
    renewalInteractions,
    interactions,
    leadAppointments,
    leadProposals,
    leadContracts,
    staffMap,
    staffRoleMap,
    treatmentMap,
    proposalMap,
    stageMap,
    availableSources,
    resetProposalDialog,
    generateProposalNumber,
    defaultProposalItemForLead,
    proposalTotal,
    addProposalItem,
    openProposalFlow,
    openExistingProposal,
    openExistingContract,
    resetContractDialog,
    openLeadContractDialog,
    togglePaymentMethod,
    clearQuickFilters,
    toggleInsightFilter,
    baseFilteredLeads,
    filteredLeads,
    stageGroups,
    selectedLeads,
    topKpis,
    commercialInsights,
    sortedRenewalTasks,
    renewalInteractionsByTask,
    insightFilterLabel,
    createLeadMutation,
    createProposalFromCrmMutation,
    updateRenewalMutation,
    ensurePatientForLead,
    registerLeadInteraction,
    transitionLeadStage,
    moveLeadMutation,
    requestLeadStageMove,
    handleQuickCepChange,
    handleLeadCepChange,
    saveLeadMutation,
    assignLeadMutation,
    bulkAssignMutation,
    bulkMoveStageMutation,
    createInteractionMutation,
    quickInteractionMutation,
    completeFollowUpMutation,
    bulkCompleteFollowUpMutation,
    generateContractFromCrmMutation,
    canOpenWhatsApp,
    latestLeadProposal,
    latestLeadContract,
  };
}

export type CrmPageController = ReturnType<typeof useCrmPage>;
