import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { useToast } from '@/hooks/use-toast';
import { getRenewalAlertLevel } from '@/lib/renewal/rules';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import { type PayerData } from '@/components/patient/PayerSection';
import { paymentConditionLabels, type PaymentCondition, type PaymentConfig, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';
import { defaultStages, normalizeStageCode, stageAppearance, lostReasons, normalizePhone, getSchemaMissingColumn, stripUnsupportedLeadFields, buildEvaluationScheduleLink, isSchedulableAppointmentStatus, isFollowUpDue, getPriorityRank, normalizeLeadSource, getLeadSourceMeta, type StageCode, type LeadRow, type RenewalTaskRow, type RenewalInteractionRow, type LeadProposalRow, type LeadProposalItem, type LeadProposalView, type CrmTreatmentRow } from '@/lib/crm/model';

export function useCrmPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [insightFilter, setInsightFilter] = useState<'all' | 'without_owner' | 'stalled' | 'scheduled' | 'proposal_open' | 'overdue_follow_up' | 'high_priority'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [renewalsExpanded, setRenewalsExpanded] = useState(true);
  const [renewalHistoryTaskId, setRenewalHistoryTaskId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [leadDrawer, setLeadDrawer] = useState<LeadRow | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [lossModal, setLossModal] = useState<{ lead: LeadRow; targetStage: StageCode } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAssignValue, setBulkAssignValue] = useState('unassigned');
  const [bulkStageValue, setBulkStageValue] = useState('none');
  const [quickForm, setQuickForm] = useState({
    full_name: '',
    phone: '',
    cpf: '',
    email: '',
    zip_code: '',
    address: '',
    city: '',
    state: '',
    source: '',
    priority_level: 'medium',
    assigned_to: 'unassigned',
    treatment: 'none',
    notes: '',
  });
  const [interactionForm, setInteractionForm] = useState({ type: 'call_made', notes: '' });
  const [lossForm, setLossForm] = useState({ reason: lostReasons[0], notes: '' });
  const [contractDialogProposal, setContractDialogProposal] = useState<LeadProposalRow | null>(null);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [proposalLead, setProposalLead] = useState<LeadRow | null>(null);
  const [proposalPatientId, setProposalPatientId] = useState('');
  const [proposalValidUntil, setProposalValidUntil] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalItems, setProposalItems] = useState<LeadProposalItem[]>([]);
  const [proposalViewDialog, setProposalViewDialog] = useState<LeadProposalView | null>(null);
  const prefillLeadId = searchParams.get('leadId');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['crm-leads', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('*')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as LeadRow[]).map((lead) => ({
        ...lead,
        kanban_stage: normalizeStageCode(lead.kanban_stage),
      }));
    },
    enabled: !!clinicId,
  });

  const { data: configuredStages = defaultStages } = useQuery({
    queryKey: ['crm-stage-settings', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_settings')
        .select('id, value')
        .eq('clinic_id', clinicId!)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return defaultStages;

      try {
        const parsed = JSON.parse(data.value);
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultStages;
        return parsed.map((stage: { code?: string; label?: string; description?: string }, index: number) =>
          stageAppearance({
            code: normalizeStageCode(stage.code),
            label: stage.label || stage.code,
            description: stage.description || '',
            isSystem: !!defaultStages.find((item) => item.code === normalizeStageCode(stage.code)),
          }, index)
        );
      } catch {
        return defaultStages;
      }
    },
    enabled: !!clinicId,
  });

  const { staff } = useStaffDirectory(clinicId, ['admin', 'sales', 'receptionist', 'professional']);

  const { data: treatments = [] } = useQuery({
    queryKey: ['crm-treatments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatments').select('id, name, price, min_price, default_price').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      if (error) throw error;
      return (data || []) as CrmTreatmentRow[];
    },
    enabled: !!clinicId,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['crm-all-proposals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, patient_id, created_at')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: renewalTasks = [] } = useQuery({
    queryKey: ['crm-renewal-tasks', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_renewal_tasks_active')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as RenewalTaskRow[];
    },
    enabled: !!clinicId,
  });

  const { data: renewalInteractions = [] } = useQuery({
    queryKey: ['crm-renewal-interactions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_interactions')
        .select('id, renewal_task_id, type, notes, performed_at')
        .eq('clinic_id', clinicId!)
        .order('performed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RenewalInteractionRow[];
    },
    enabled: !!clinicId,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['crm-interactions', clinicId, leadDrawer?.id],
    queryFn: async () => {
      if (!leadDrawer) return [];
      const { data, error } = await supabase.from('lead_interactions')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('lead_id', leadDrawer.id)
        .order('performed_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer,
  });

  const { data: leadAppointments = [] } = useQuery({
    queryKey: ['crm-appointments', clinicId, leadDrawer?.id],
    queryFn: async () => {
      if (!leadDrawer) return [];
      const { data, error } = await supabase.from('appointments')
        .select('id, status, scheduled_at, start_time, appointment_type')
        .eq('clinic_id', clinicId)
        .eq('lead_id', leadDrawer.id)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer,
  });

  const { data: leadProposals = [] } = useQuery({
    queryKey: ['crm-proposals', clinicId, leadDrawer?.patient_id],
    queryFn: async () => {
      if (!leadDrawer?.patient_id) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, patient_id, notes, created_at, patients(full_name, payer_id, is_self_payer)')
        .eq('clinic_id', clinicId!)
        .eq('patient_id', leadDrawer.patient_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LeadProposalRow[];
    },
    enabled: !!clinicId && !!leadDrawer?.patient_id,
  });

  const { data: leadContracts = [] } = useQuery({
    queryKey: ['crm-contracts', clinicId, leadDrawer?.patient_id],
    queryFn: async () => {
      if (!leadDrawer?.patient_id) return [];
      const { data, error } = await supabase
        .from('contracts')
        .select('id, contract_number, process_status, status, proposal_id, created_at')
        .eq('clinic_id', clinicId!)
        .eq('patient_id', leadDrawer.patient_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && !!leadDrawer?.patient_id,
  });

  const staffMap = useMemo(() => Object.fromEntries(staff.map((member) => [member.user_id, member.label])), [staff]);
  const staffRoleMap = useMemo(() => Object.fromEntries(staff.map((member) => [member.user_id, member.role])), [staff]);
  const treatmentMap = useMemo(() => Object.fromEntries(treatments.map((t) => [t.id, t.name])), [treatments]);
  const proposalMap = useMemo(() => Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  const stageMap = useMemo(() => Object.fromEntries(configuredStages.map((stage) => [stage.code, stage])), [configuredStages]);
  const availableSources = useMemo(
    () => Array.from(new Set(leads.map((lead) => normalizeLeadSource(lead.source))))
      .sort((a, b) => getLeadSourceMeta(a).label.localeCompare(getLeadSourceMeta(b).label)),
    [leads]
  );

  useEffect(() => {
    if (!prefillLeadId || !leads.length || leadDrawer?.id === prefillLeadId) return;
    const targetLead = leads.find((lead) => lead.id === prefillLeadId);
    if (!targetLead) return;

    setLeadDrawer(targetLead);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('leadId');
    setSearchParams(nextParams, { replace: true });
  }, [prefillLeadId, leads, leadDrawer, searchParams, setSearchParams]);

  const resetProposalDialog = () => {
    setProposalDialogOpen(false);
    setProposalLead(null);
    setProposalPatientId('');
    setProposalValidUntil('');
    setProposalNotes('');
    setProposalItems([]);
  };

  const generateProposalNumber = () => {
    const now = new Date();
    return `PROP-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
  };

  const defaultProposalItemForLead = (lead: LeadRow): LeadProposalItem[] => {
    const preferredTreatment = treatments.find((treatment) => lead.treatments_of_interest?.includes(treatment.id)) || treatments[0];
    if (!preferredTreatment) return [];
    return [{
      treatment_id: preferredTreatment.id,
      quantity: 1,
      unit_price: Number(preferredTreatment.default_price || preferredTreatment.price || 0),
    }];
  };

  const proposalTotal = proposalItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const addProposalItem = () => {
    if (treatments.length === 0) return;
    const treatment = treatments[0];
    setProposalItems((current) => [
      ...current,
      {
        treatment_id: treatment.id,
        quantity: 1,
        unit_price: Number(treatment.default_price || treatment.price || 0),
      },
    ]);
  };

  const openProposalFlow = async (lead: LeadRow) => {
    try {
      const patientId = await ensurePatientForLead(lead);
      const leadWithPatient = { ...lead, patient_id: patientId };
      setLeadDrawer((current) => current?.id === lead.id ? { ...current, patient_id: patientId } : current);
      setProposalLead(leadWithPatient);
      setProposalPatientId(patientId);
      setProposalValidUntil('');
      setProposalNotes('');
      setProposalItems(defaultProposalItemForLead(lead));
      setProposalDialogOpen(true);
    } catch (error) {
      toast({ title: 'Erro ao preparar proposta', description: error.message, variant: 'destructive' });
    }
  };

  const openExistingProposal = async (proposalId: string) => {
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('id, proposal_number, status, final_amount, patient_id, notes, created_at, patients(full_name, payer_id, is_self_payer)')
      .eq('clinic_id', clinicId!)
      .eq('id', proposalId)
      .single();
    if (error) {
      toast({ title: 'Erro ao abrir proposta', description: error.message, variant: 'destructive' });
      return;
    }

    const { data: items, error: itemsError } = await supabase
      .from('proposal_items')
      .select('id, treatment_id, quantity, unit_price, subtotal, treatments(name)')
      .eq('proposal_id', proposalId);
    if (itemsError) {
      toast({ title: 'Erro ao abrir itens', description: itemsError.message, variant: 'destructive' });
      return;
    }

    setProposalViewDialog({ ...(proposal as LeadProposalRow), items: (items || []) as LeadProposalItem[] });
  };

  const openExistingContract = (contractId: string, leadId?: string) => {
    const returnLeadId = leadId || leadDrawer?.id;
    navigate(
      returnLeadId
        ? `/clinic/contracts?contractId=${contractId}&view=1&returnTo=crm&returnLeadId=${returnLeadId}`
        : `/clinic/contracts?contractId=${contractId}&view=1`,
    );
  };

  const resetContractDialog = () => {
    setContractDialogProposal(null);
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
    setPayerData({ is_self_payer: true, payer_id: null });
  };

  const openLeadContractDialog = (proposal: LeadProposalRow) => {
    setContractDialogProposal(proposal);
    setPayerData({
      is_self_payer: proposal.patients?.is_self_payer ?? true,
      payer_id: proposal.patients?.payer_id || null,
      new_payer: proposal.patients?.is_self_payer === false ? { name: '', cpf: '', birth_date: '' } : undefined,
    });
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
  };

  const togglePaymentMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (selectedPaymentMethods.includes(method)) return;
      if (selectedPaymentMethods.length >= 2) {
        toast({
          title: 'Limite de formas de pagamento',
          description: 'Você pode selecionar no máximo 2 formas de pagamento.',
          variant: 'destructive',
        });
        return;
      }
      setSelectedPaymentMethods((current) => [...current, method]);
      return;
    }

    setSelectedPaymentMethods((current) => current.filter((item) => item !== method));
    setPaymentDetails((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
    setPaymentConfig((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
  };

  const clearQuickFilters = () => {
    setInsightFilter('all');
    setAssignedFilter('all');
    setStageFilter('all');
    setSourceFilter('all');
  };

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
      const matchesStage = stageFilter === 'all' || lead.kanban_stage === stageFilter;
      const leadSource = normalizeLeadSource(lead.source);
      const matchesSource = sourceFilter === 'all' || leadSource === sourceFilter;
      return matchesSearch && matchesAssignee && matchesStage && matchesSource;
    });
  }, [leads, search, assignedFilter, stageFilter, sourceFilter]);

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
    return configuredStages.map((stage) => {
      const items = filteredLeads.filter((lead) => lead.kanban_stage === stage.code);
      const totalValue = items.reduce((sum, lead) => {
        const matched = proposalMap[lead.proposal_id || ''];
        return sum + Number(matched?.final_amount || 0);
      }, 0);
      return { ...stage, items, totalValue };
    });
  }, [configuredStages, filteredLeads, proposalMap]);

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

  async function ensurePatientForLead(lead: LeadRow) {
    if (lead.patient_id) return lead.patient_id;

    const { data, error } = await supabase
      .from('patients')
      .insert({
        clinic_id: lead.clinic_id,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: lead.cpf,
        email: lead.email,
        date_of_birth: lead.birth_date,
        zip_code: lead.zip_code,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) throw error;

    const convertedAt = new Date().toISOString();

    await supabase.from('leads')
      .update({ patient_id: data.id, converted_at: convertedAt })
      .eq('id', lead.id);

    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['patients-list'] });
    qc.invalidateQueries({ queryKey: ['patients-select'] });

    if (leadDrawer?.id === lead.id) {
      setLeadDrawer({ ...leadDrawer, patient_id: data.id, converted_at: convertedAt });
    }

    return data.id as string;
  }

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
    const patch: Record<string, unknown> = {
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
      navigate(buildEvaluationScheduleLink(lead.id, lead.assigned_to || null));
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

      if ('assigned_to' in requestPayload && leadDrawer.appointment_id) {
        const professionalId = requestPayload.assigned_to || null;
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

      if (appointmentId) {
        const professionalId = assignedTo || null;
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

        if (lead.appointment_id) {
          const professionalId = assignedTo || null;
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

      const installmentMethods = selectedPaymentMethods.filter((method) => method === 'card' || method === 'boleto');
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
              patient_id: contractDialogProposal.patient_id,
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
