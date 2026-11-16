import { defaultValidUntil } from '@/lib/proposals/sale';
import { useEffect, useMemo, useState } from 'react';
import { findPatientDuplicates } from '@/lib/patients/duplicates';
import { onlyDigits } from '@/lib/patients/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { useAgendaProfessionals } from '@/hooks/useAgendaProfessionals';
import { useToast } from '@/hooks/use-toast';
import { type PayerData } from '@/components/patient/PayerSection';
import { type PaymentCondition, type PaymentConfig, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { defaultStages, normalizeStageCode, stageAppearance, lostReasons, normalizeLeadSource, getLeadSourceMeta, type StageCode, type LeadRow, type RenewalTaskRow, type RenewalInteractionRow, type LeadProposalRow, type LeadProposalItem, type LeadProposalView, type CrmTreatmentRow } from '@/lib/crm/model';
import { buildBoardColumns, displayStageCode, effectiveHidden, FINAL_COLUMN_KEY } from '@/lib/crm/boardColumns';


/** Parte 1 de useCrmPage (dividido por tamanho; a lógica é a mesma). */
export function useCrmStatePart1() {
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
  const [proposalValidUntil, setProposalValidUntil] = useState(defaultValidUntil());
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
        return parsed.map((stage: { code?: string; label?: string; description?: string; hidden?: boolean }, index: number) => ({
          ...stageAppearance({
            code: normalizeStageCode(stage.code),
            label: stage.label || stage.code,
            description: stage.description || '',
            isSystem: !!defaultStages.find((item) => item.code === normalizeStageCode(stage.code)),
          }, index),
          hidden: !!stage.hidden,
        }));
      } catch {
        return defaultStages;
      }
    },
    enabled: !!clinicId,
  });

  const { data: finalColumnLabel = null } = useQuery({
    queryKey: ['crm-final-column', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('clinic_settings').select('value')
        .eq('clinic_id', clinicId!).eq('key', FINAL_COLUMN_KEY).maybeSingle();
      return data?.value?.trim() || null;
    },
    enabled: !!clinicId,
  });

  // Colunas do quadro: etapas ocultas somem (leads vão para a próxima) e Fechado/Perdido podem virar "Finalizado".
  const boardColumns = useMemo(() => buildBoardColumns(configuredStages, finalColumnLabel), [configuredStages, finalColumnLabel]);
  const visibleStages = useMemo(() => {
    const hidden = effectiveHidden(configuredStages);
    return configuredStages.filter((stage) => !hidden.has(stage.code));
  }, [configuredStages]);
  const displayStageOf = (code: string) => displayStageCode(boardColumns, code);

  const { staff } = useStaffDirectory(clinicId, ['admin', 'sales', 'receptionist', 'professional']);
  // Responsável do lead é um login; na agenda vale o cadastro de profissional dele (se tiver).
  const { professionalIdForUser } = useAgendaProfessionals(clinicId);

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
    setProposalValidUntil(defaultValidUntil());
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

  async function ensurePatientForLead(lead: LeadRow) {
    if (lead.patient_id) return lead.patient_id;

    // Mesmo CPF de um cliente já cadastrado: liga o lead a ele em vez de duplicar.
    const sameCpf = lead.cpf
      ? (await findPatientDuplicates(lead.clinic_id, lead.cpf, null)).find((d) => d.match_type === 'cpf')
      : undefined;

    const { data: insertedPatient, error } = sameCpf
      ? { data: { id: sameCpf.patient_id }, error: null }
      : await supabase
      .from('patients')
      .insert({
        clinic_id: lead.clinic_id,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: onlyDigits(lead.cpf) || null,
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
    const data = insertedPatient!;

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

  const openProposalFlow = async (lead: LeadRow) => {
    try {
      const patientId = await ensurePatientForLead(lead);
      const leadWithPatient = { ...lead, patient_id: patientId };
      setLeadDrawer((current) => current?.id === lead.id ? { ...current, patient_id: patientId } : current);
      setProposalLead(leadWithPatient);
      setProposalPatientId(patientId);
      setProposalValidUntil(defaultValidUntil());
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
  };
}
export type CrmStatePart1 = ReturnType<typeof useCrmStatePart1>;
