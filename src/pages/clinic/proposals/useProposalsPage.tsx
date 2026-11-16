import { buildProposalHtml, defaultValidUntil, formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { generateContractPDF } from '@/lib/contractPDF';
import { useClinicLetterhead } from '@/hooks/useClinicLetterhead';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createProposalLink } from '@/lib/proposals/publicLink';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import {
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod, isInstallmentMethod
} from '@/components/contracts/ContractPaymentConfigurator';
import { buildPaymentPresetSummary, composeProposalNotesPayload, parseProposalNotesPayload } from '@/lib/proposals/paymentPreset';


interface ProposalItem {
  treatment_id: string;
  quantity: number;
  unit_price: number;
  is_combo?: boolean;
  combo_id?: string;
}

type ProposalStatus = Database['public']['Enums']['proposal_status'];
type ProposalRow = Database['public']['Tables']['proposals']['Row'];
type ProposalInsert = Database['public']['Tables']['proposals']['Insert'];
type ProposalItemRow = Database['public']['Tables']['proposal_items']['Row'];
type PatientLite = Pick<Database['public']['Tables']['patients']['Row'], 'id' | 'full_name' | 'payer_id' | 'is_self_payer' | 'phone'>;
type TreatmentLite = Pick<Database['public']['Tables']['treatments']['Row'], 'id' | 'name' | 'price' | 'min_price' | 'default_price'>;
type LeadLite = Pick<Database['public']['Tables']['leads']['Row'], 'id' | 'full_name' | 'kanban_stage' | 'patient_id' | 'proposal_id'>;
type ProposalWithPatient = ProposalRow & { patients?: { full_name?: string | null; cpf?: string | null } | null };
type ProposalItemWithTreatment = ProposalItemRow & { treatments?: { name?: string | null } | null };
type ComboItem = { treatment_id: string | null; quantity: number | null; treatments?: { id?: string | null; name?: string | null; price?: number | null } | null };
type ComboLite = { id: string; name: string; promotional_price: number | null; treatment_combo_items?: ComboItem[] | null };

/** Estado, dados e ações da tela (a tela em ProposalsPage.tsx só desenha). */
export function useProposalsPage() {
  const { clinicId, clinicName } = useBranding();
  const { data: letterhead } = useClinicLetterhead(clinicId);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState<(ProposalWithPatient & { items?: ProposalItemWithTreatment[] }) | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'draft' | 'sent' | 'accepted'>('all');
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('busca') || '');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState('treatment');
  const [discountType, setDiscountType] = useState<'nominal' | 'percent'>('nominal');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [approvedPrompt, setApprovedPrompt] = useState<ProposalWithPatient | null>(null);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [proposalPaymentEnabled, setProposalPaymentEnabled] = useState(false);
  const [proposalPaymentCondition, setProposalPaymentCondition] = useState<PaymentCondition>('cash');
  const [proposalSelectedPaymentMethods, setProposalSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [proposalPaymentDetails, setProposalPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [proposalPaymentConfig, setProposalPaymentConfig] = useState<PaymentConfig>({});
  const prefillPatientId = searchParams.get('patientId');
  const prefillLeadId = searchParams.get('leadId');
  const shouldOpenNewFromQuery = searchParams.get('openNew') === '1';
  const prefillProposalId = searchParams.get('proposalId');
  const shouldOpenViewFromQuery = searchParams.get('view') === '1';
  const shouldOpenEditFromQuery = searchParams.get('edit') === '1';
  const returnTo = searchParams.get('returnTo');
  const returnLeadId = searchParams.get('returnLeadId');
  const crmReturnUrl = returnTo === 'crm' && returnLeadId ? `/clinic/crm?leadId=${returnLeadId}` : null;

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals', clinicId, filterStatus, quickFilter, search],
    queryFn: async () => {
      const activeStatus = quickFilter !== 'all' ? quickFilter : filterStatus;
      let q = supabase
        .from('proposals')
        .select('*, patients(full_name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (activeStatus !== 'all') q = q.eq('status', activeStatus as ProposalStatus);
      const { data } = await q;
      return ((data || []) as ProposalWithPatient[]);
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name, payer_id, is_self_payer, phone').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return ((data || []) as PatientLite[]);
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, price, min_price, default_price').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return ((data || []) as TreatmentLite[]);
    },
    enabled: !!clinicId,
  });

  const { data: combos = [] } = useQuery({
    queryKey: ['combos-list', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatment_combos').select('*, treatment_combo_items(*, treatments(id, name, price, min_price))').eq('clinic_id', clinicId!).eq('active', true);
      return ((data || []) as unknown as ComboLite[]);
    },
    enabled: !!clinicId,
  });

  const { data: crmLead } = useQuery({
    queryKey: ['crm-lead-context', clinicId, prefillLeadId],
    queryFn: async () => {
      if (!prefillLeadId) return null;
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, kanban_stage, patient_id, proposal_id')
        .eq('clinic_id', clinicId)
        .eq('id', prefillLeadId)
        .single();
      if (error) throw error;
      return data as LeadLite;
    },
    enabled: !!clinicId && !!prefillLeadId,
  });

  const standardTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const numDiscountValue = parseFloat(discountValue.replace(',', '.')) || 0;
  let discountAmount = 0;
  let discountPercent = 0;

  if (numDiscountValue > 0) {
    if (discountType === 'nominal') {
      discountAmount = Math.min(standardTotal, numDiscountValue);
      discountPercent = standardTotal > 0 ? (discountAmount / standardTotal) * 100 : 0;
    } else {
      discountPercent = Math.min(100, numDiscountValue);
      discountAmount = (standardTotal * discountPercent) / 100;
    }
  }
  const finalTotal = Math.max(0, Math.round((standardTotal - discountAmount) * 100) / 100);
  const total = finalTotal;

  const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedSearchDigits = normalizeDigits(search);
  const handleStatusFilterChange = (value: string) => {
    setFilterStatus(value);
    setQuickFilter('all');
  };

  const visibleProposals = proposals.filter((proposal) => {
    const proposalNumber = (proposal.proposal_number || '').toLowerCase();
    const patientCpf = normalizeDigits(proposal.patients?.cpf);
    const patientName = (proposal.patients?.full_name || '').toLowerCase();

    const matchesSearch = !normalizedSearch ||
      proposalNumber.includes(normalizedSearch) ||
      patientName.includes(normalizedSearch) ||
      (normalizedSearchDigits.length >= 3 && patientCpf.includes(normalizedSearchDigits));
    if (!matchesSearch) return false;

    if (dateStart && proposal.created_at < `${dateStart}T00:00:00`) return false;
    if (dateEnd && proposal.created_at > `${dateEnd}T23:59:59`) return false;
    return true;
  });

  useEffect(() => {
    if (!shouldOpenNewFromQuery || dialogOpen || !!editingId) return;

    resetForm();
    const targetPatientId = prefillPatientId || crmLead?.patient_id;
    if (targetPatientId && patients.some((patient) => patient.id === targetPatientId)) {
      setSelectedPatient(targetPatientId);
    }
    setDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openNew');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenNewFromQuery, prefillPatientId, crmLead?.patient_id, dialogOpen, editingId, patients, searchParams, setSearchParams]);

  useEffect(() => {
    if (!shouldOpenViewFromQuery || !prefillProposalId || proposals.length === 0 || !!viewDialog) return;
    const targetProposal = proposals.find((proposal) => proposal.id === prefillProposalId);
    if (!targetProposal) return;

    openView(targetProposal);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('proposalId');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenViewFromQuery, prefillProposalId, proposals, viewDialog, searchParams, setSearchParams]);

  useEffect(() => {
    if (!shouldOpenEditFromQuery || !prefillProposalId || proposals.length === 0 || dialogOpen) return;
    const targetProposal = proposals.find((proposal) => proposal.id === prefillProposalId);
    if (!targetProposal) return;

    openEdit(targetProposal);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('proposalId');
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenEditFromQuery, prefillProposalId, proposals, dialogOpen, searchParams, setSearchParams]);

  const generateProposalNumber = () => {
    const now = new Date();
    const yymm = format(now, 'yyyyMM');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `PROP-${yymm}-${seq}`;
  };

  const validatePaymentPreset = (targetTotal: number) => {
    if (!proposalPaymentEnabled) return { ok: true as const };
    if (proposalSelectedPaymentMethods.length === 0) {
      return { ok: false as const, message: 'Selecione pelo menos uma forma de pagamento na proposta ou desative a seção opcional.' };
    }

    const totalInformed = proposalSelectedPaymentMethods.reduce(
      (sum, method) => sum + Number(proposalPaymentConfig[method]?.amount || 0),
      0
    );

    const hasInvalidAmount = proposalSelectedPaymentMethods.some(
      (method) => Number(proposalPaymentConfig[method]?.amount || 0) <= 0
    );
    if (hasInvalidAmount) {
      return { ok: false as const, message: 'Informe um valor maior que zero para cada forma de pagamento selecionada.' };
    }

    const installmentMethods = proposalSelectedPaymentMethods.filter((method) => isInstallmentMethod(method));
    const invalidInstallments = installmentMethods.some((method) => Number(proposalPaymentConfig[method]?.installments || 0) <= 0);
    if (invalidInstallments) {
      return { ok: false as const, message: 'Informe número de parcelas válido para cartão/boleto.' };
    }

    if (totalInformed < targetTotal) {
      return {
        ok: false as const,
        message: `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor da proposta (R$ ${targetTotal.toFixed(2)}).`,
      };
    }

    return { ok: true as const };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const num = editingId ? undefined : generateProposalNumber();
      const presetValidation = validatePaymentPreset(finalTotal);
      if (!presetValidation.ok) {
        throw new Error(presetValidation.message);
      }
      const notesPayload = composeProposalNotesPayload(
        notes,
        proposalPaymentEnabled
          ? {
              condition: proposalPaymentCondition,
              methods: proposalSelectedPaymentMethods,
              config: proposalPaymentConfig,
              details: proposalPaymentDetails,
            }
          : null
      );
      
      if (editingId) {
        const { error } = await supabase.from('proposals').update({
          patient_id: selectedPatient,
          total_amount: standardTotal,
          discount_percent: discountPercent > 0 ? discountPercent : null,
          discount_amount: discountAmount > 0 ? discountAmount : null,
          final_amount: finalTotal,
          notes: notesPayload,
          valid_until: validUntil || null,
        }).eq('id', editingId);
        if (error) throw error;

        await supabase.from('proposal_items').delete().eq('proposal_id', editingId);
        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: editingId,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }
      } else {
        const proposalPayload: ProposalInsert = {
          clinic_id: clinicId!,
          patient_id: selectedPatient,
          proposal_number: num!,
          total_amount: standardTotal,
          discount_percent: discountPercent > 0 ? discountPercent : null,
          discount_amount: discountAmount > 0 ? discountAmount : null,
          final_amount: finalTotal,
          notes: notesPayload,
          valid_until: validUntil || null,
          created_by: user?.id || null,
        };
        const { data: proposal, error } = await supabase.from('proposals').insert(proposalPayload).select().single();
        if (error) throw error;

        if (items.length > 0) {
          const { error: ie } = await supabase.from('proposal_items').insert(
            items.map(i => ({
              proposal_id: proposal.id,
              treatment_id: i.treatment_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              subtotal: i.quantity * i.unit_price,
            }))
          );
          if (ie) throw ie;
        }

        if (prefillLeadId) {
          const { error: leadError } = await supabase
            .from('leads')
            .update({
              patient_id: selectedPatient,
              proposal_id: proposal.id,
              kanban_stage: 'proposal_sent',
            })
            .eq('clinic_id', clinicId!)
            .eq('id', prefillLeadId);
          if (leadError) throw leadError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-lead-context'] });
      setDialogOpen(false);
      resetForm();
      if (prefillLeadId || prefillPatientId) {
        // Keep CRM return context so approving a proposal can navigate back to the lead.
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('patientId');
        nextParams.delete('leadId');
        nextParams.delete('openNew');
        setSearchParams(nextParams, { replace: true });
      }
      toast({ title: editingId ? 'Proposta atualizada!' : 'Proposta criada!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('proposals').update({ status: status as ProposalStatus }).eq('id', id);
      if (error) throw error;

      if (status === 'sent' || status === 'accepted') {
        const nextStage = status === 'accepted' ? 'closed_won' : 'proposal_sent';
        const { error: leadError } = await supabase
          .from('leads')
          .update({ kanban_stage: nextStage })
          .eq('clinic_id', clinicId!)
          .eq('proposal_id', id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['crm-lead-context'] });
      setViewDialog(null);
      if (variables.status === 'accepted') {
        // Logo após aprovar, oferece emitir o contrato (pagamento já vem da proposta).
        const approved = proposals.find((item) => item.id === variables.id) || null;
        setApprovedPrompt(approved);
        if (!approved && crmReturnUrl) navigate(crmReturnUrl);
        return;
      }
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedPatient('');
    setNotes('');
    setValidUntil(defaultValidUntil());
    setItems([]);
    setEditingId(null);
    setDiscountType('nominal');
    setDiscountValue('');
    setProposalPaymentEnabled(false);
    setProposalPaymentCondition('cash');
    setProposalSelectedPaymentMethods([]);
    setProposalPaymentDetails({});
    setProposalPaymentConfig({});
  };

  const addTreatmentItem = () => {
    if (treatments.length > 0) {
      const t = treatments[0];
      setItems([...items, { treatment_id: t.id, quantity: 1, unit_price: Number(t.default_price || t.price) }]);
    }
  };

  const addComboItem = (combo: ComboLite) => {
    const comboItems = combo.treatment_combo_items || [];
    const newItems: ProposalItem[] = comboItems.map((ci) => ({
      treatment_id: ci.treatments?.id || ci.treatment_id,
      quantity: ci.quantity || 1,
      unit_price: combo.promotional_price
        ? Number(combo.promotional_price) / comboItems.length
        : Number(ci.treatments?.price || 0),
      is_combo: true,
      combo_id: combo.id,
    }));
    setItems([...items, ...newItems]);
  };

  const getMinPriceWarning = (item: ProposalItem) => {
    const t = treatments.find((tr) => tr.id === item.treatment_id);
    if (t?.min_price && item.unit_price < Number(t.min_price)) {
      return `Abaixo do mínimo (R$ ${Number(t.min_price).toFixed(2)})`;
    }
    return null;
  };

  const openEdit = async (proposal: ProposalWithPatient) => {
    const parsed = parseProposalNotesPayload(proposal.notes);
    setEditingId(proposal.id);
    setSelectedPatient(proposal.patient_id);
    setNotes(parsed.plainNotes);
    setValidUntil(proposal.valid_until || '');

    if (proposal.discount_percent && Number(proposal.discount_percent) > 0) {
      setDiscountType('percent');
      setDiscountValue(String(proposal.discount_percent));
    } else if (proposal.discount_amount && Number(proposal.discount_amount) > 0) {
      setDiscountType('nominal');
      setDiscountValue(String(proposal.discount_amount));
    } else {
      setDiscountType('nominal');
      setDiscountValue('');
    }

    if (parsed.paymentPreset) {
      setProposalPaymentEnabled(true);
      setProposalPaymentCondition(parsed.paymentPreset.condition);
      setProposalSelectedPaymentMethods(parsed.paymentPreset.methods);
      setProposalPaymentDetails(parsed.paymentPreset.details);
      setProposalPaymentConfig(parsed.paymentPreset.config);
    } else {
      setProposalPaymentEnabled(false);
      setProposalPaymentCondition('cash');
      setProposalSelectedPaymentMethods([]);
      setProposalPaymentDetails({});
      setProposalPaymentConfig({});
    }

    const { data: pItems } = await supabase.from('proposal_items').select('*').eq('proposal_id', proposal.id);
    setItems(((pItems || []) as ProposalItemRow[]).map((pi) => ({
      treatment_id: pi.treatment_id,
      quantity: pi.quantity,
      unit_price: Number(pi.unit_price),
    })));
    setDialogOpen(true);
  };

  const openView = async (proposal: ProposalWithPatient) => {
    const { data: pItems } = await supabase.from('proposal_items').select('*, treatments(name)').eq('proposal_id', proposal.id);
    setViewDialog({ ...proposal, items: (pItems || []) as ProposalItemWithTreatment[] });
  };

  const handlePrint = (proposal: ProposalWithPatient & { items?: ProposalItemWithTreatment[] }) => {
    const patient = patients.find((p) => p.id === proposal.patient_id);
    const printItems = proposal.items || [];
    const parsed = parseProposalNotesPayload(proposal.notes);
    const paymentSummary = buildPaymentPresetSummary(parsed.paymentPreset);
    const w = window.open('', '_blank');
    if (!w) return;
    const body = buildProposalHtml({
      clinicName,
      clinic: letterhead ?? null,
      number: proposal.proposal_number,
      date: new Date(proposal.created_at),
      validUntil: proposal.valid_until,
      clientName: patient?.full_name || proposal.patients?.full_name || '—',
      clientPhone: patient?.phone ?? null,
      items: printItems.map((i) => ({
        treatment_id: i.treatment_id, name: i.treatments?.name || '—', quantity: i.quantity,
        unit_price: Number(i.unit_price), min_price: null,
      })),
      total: Number(proposal.final_amount),
      standardTotal: Number(proposal.total_amount || proposal.final_amount),
      discountAmount: Number(proposal.discount_amount || 0),
      discountPercent: Number(proposal.discount_percent || 0),
      paymentSummary,
      notes: parsed.plainNotes || undefined,
    });
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Orçamento ${proposal.proposal_number}</title>
      <style>body{padding:32px;margin:0}@media print{body{padding:0}}</style></head><body>${body}</body></html>`);
    w.document.close();
    w.print();
  };

  const handleSendWhatsApp = async (proposal: ProposalWithPatient & { items?: ProposalItemWithTreatment[] }) => {
    const patient = patients.find((p) => p.id === proposal.patient_id);
    const clientName = patient?.full_name || proposal.patients?.full_name || 'Cliente';
    let clientPhone = patient?.phone;
    if (!clientPhone && proposal.patient_id) {
      const { data: pData } = await supabase.from('patients').select('phone').eq('id', proposal.patient_id).maybeSingle();
      if (pData?.phone) clientPhone = pData.phone;
    }

    if (!clientPhone) {
      toast({
        title: 'Telefone não cadastrado',
        description: `O paciente ${clientName} não possui telefone cadastrado para envio via WhatsApp.`,
        variant: 'destructive',
      });
      return;
    }

    setSendingWhatsAppId(proposal.id);
    try {
      let printItems = proposal.items;
      if (!printItems || printItems.length === 0) {
        const { data: pItems } = await supabase
          .from('proposal_items')
          .select('*, treatments(name)')
          .eq('proposal_id', proposal.id);
        printItems = (pItems || []) as ProposalItemWithTreatment[];
      }

      const parsed = parseProposalNotesPayload(proposal.notes);
      const paymentSummary = buildPaymentPresetSummary(parsed.paymentPreset);

      const body = buildProposalHtml({
        clinicName,
        clinic: letterhead ?? null,
        number: proposal.proposal_number,
        date: new Date(proposal.created_at),
        validUntil: proposal.valid_until,
        clientName,
        clientPhone: clientPhone ?? null,
        items: printItems.map((i) => ({
          treatment_id: i.treatment_id,
          name: i.treatments?.name || '—',
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          min_price: null,
        })),
        total: Number(proposal.final_amount),
        standardTotal: Number(proposal.total_amount || proposal.final_amount),
        discountAmount: Number(proposal.discount_amount || 0),
        discountPercent: Number(proposal.discount_percent || 0),
        paymentSummary,
        notes: parsed.plainNotes || undefined,
      });

      // 1. Converter HTML para PDF Blob oficial
      const pdfBlob = await generateContractPDF(body);

      // 2. Disparar download do arquivo PDF automaticamente
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = downloadUrl;
      downloadAnchor.download = `Proposta-${proposal.proposal_number}.pdf`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);

      // 3. Tentar gerar link assinado de 7 dias via storage (caminho seguro com RLS)
      let signedPdfUrl: string | null = null;
      try {
        const storagePath = `${clinicId}/${proposal.patient_id}/proposta-${proposal.proposal_number}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('contracts')
          .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

        if (!uploadError) {
          const { data: signedData } = await supabase.storage
            .from('contracts')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
          if (signedData?.signedUrl) {
            signedPdfUrl = signedData.signedUrl;
          }
        }
      } catch (e) {
        console.warn('Storage link fallback:', e);
      }

      // Link público web para carregar diretamente no celular do cliente
      const { url: proposalWebUrl } = await createProposalLink(proposal.id);

      const firstName = clientName.trim().split(/\s+/)[0] || clientName;
      const validityText = proposal.valid_until
        ? format(new Date(`${proposal.valid_until}T12:00:00`), 'dd/MM/yyyy')
        : '10 dias';

      const itemsList = printItems
        .map((i) => `• *${i.treatments?.name || 'Tratamento'}* (x${i.quantity}) - ${formatBRL(Number(i.unit_price) * i.quantity)}`)
        .join('\n');

      const discountAmount = Number(proposal.discount_amount || 0);
      const discountPercent = Number(proposal.discount_percent || 0);
      const standardTotal = Number(proposal.total_amount || proposal.final_amount);
      const finalTotal = Number(proposal.final_amount);

      let financeSummary = `*Valor Total: ${formatBRL(finalTotal)}*`;
      if (discountAmount > 0) {
        financeSummary = `Valor padrão: ${formatBRL(standardTotal)}\nDesconto Especial: - ${formatBRL(discountAmount)}${discountPercent ? ` (${discountPercent}%)` : ''}\n*Valor Final com Desconto: ${formatBRL(finalTotal)}*`;
      }

      let msg = `Olá, ${firstName}! Esperamos que você esteja muito bem.\n\nPassando para enviar a sua proposta comercial da *${clinicName || 'nossa clínica'}* (Nº *${proposal.proposal_number}*):\n\n📋 *Tratamentos planejados:*\n${itemsList}\n\n💰 *Valores:*\n${financeSummary}\n`;

      if (paymentSummary) {
        msg += `\n💳 *Condições sugeridas:* ${paymentSummary}\n`;
      }

      msg += `\n⏳ *Validade:* até ${validityText}\n`;
      msg += `\n✨ *Acesse sua proposta completa com todos os detalhes pelo link:*\n👉 ${proposalWebUrl}\n`;

      if (signedPdfUrl) {
        msg += `\n📥 *Ou baixe o documento PDF oficial direto por aqui:*\n${signedPdfUrl}\n`;
      }

      msg += `\nFicamos à total disposição para tirar qualquer dúvida ou agendarmos seu início!`;

      // 4. Compartilhar arquivo PDF nativamente se suportado (mobile) ou abrir WhatsApp
      const pdfFile = new File([pdfBlob], `Proposta-${proposal.proposal_number}.pdf`, { type: 'application/pdf' });
      let sharedViaNavigator = false;
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: `Proposta ${proposal.proposal_number} - ${clinicName || 'Clinova'}`,
            text: msg,
          });
          sharedViaNavigator = true;
        } catch (shareErr) {
          // Usuário cancelou ou navegador preferiu WhatsApp web
          sharedViaNavigator = false;
        }
      }

      if (!sharedViaNavigator) {
        const waUrl = whatsappLink(clientPhone, msg);
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

      // 5. Se estiver em rascunho, atualiza automaticamente para enviada
      if (proposal.status === 'draft') {
        await supabase
          .from('proposals')
          .update({ status: 'sent' })
          .eq('id', proposal.id);
        qc.invalidateQueries({ queryKey: ['proposals'] });
        if (viewDialog && viewDialog.id === proposal.id) {
          setViewDialog({ ...viewDialog, status: 'sent' });
        }
      }

      toast({
        title: 'Proposta em PDF gerada com sucesso!',
        description: `O arquivo PDF foi baixado e o WhatsApp de ${firstName} foi aberto com a proposta.`,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao processar PDF da proposta.';
      toast({
        title: 'Erro ao gerar proposta para WhatsApp',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  // Emissão completa (modelo, PDF e forma de pagamento) fica na tela de Contratos,
  // que abre direto com esta proposta escolhida e o pagamento preenchido.
  const goEmitContract = (proposal: Pick<ProposalWithPatient, 'id'>) => {
    const params = new URLSearchParams({ emitir: proposal.id });
    if (crmReturnUrl && returnLeadId) {
      params.set('returnTo', 'crm');
      params.set('returnLeadId', returnLeadId);
    } else {
      params.set('returnTo', 'proposals');
    }
    setApprovedPrompt(null);
    navigate(`/clinic/contracts?${params.toString()}`);
  };

  const approveAndEmit = async (proposal: ProposalWithPatient) => {
    try {
      await statusMutation.mutateAsync({ id: proposal.id, status: 'accepted' });
      goEmitContract(proposal);
    } catch {
      // erro já mostrado pelo statusMutation
    }
  };

  const toggleProposalPaymentMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (proposalSelectedPaymentMethods.includes(method)) return;
      setProposalSelectedPaymentMethods((current) => [...current, method]);
      return;
    }
    setProposalSelectedPaymentMethods((current) => current.filter((item) => item !== method));
    setProposalPaymentDetails((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
    setProposalPaymentConfig((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
  };

  const proposalPaymentSum = proposalSelectedPaymentMethods.reduce(
    (sum, method) => sum + Number(proposalPaymentConfig[method]?.amount || 0),
    0
  );
  const proposalPaymentValidation = validatePaymentPreset(total);
  const canSaveProposal = !proposalPaymentEnabled || proposalPaymentValidation.ok;


  return {
    clinicId,
    clinicName,
    letterhead,
    user,
    toast,
    qc,
    navigate,
    searchParams,
    setSearchParams,
    dialogOpen,
    setDialogOpen,
    viewDialog,
    setViewDialog,
    filterStatus,
    setFilterStatus,
    quickFilter,
    setQuickFilter,
    search,
    setSearch,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    selectedPatient,
    setSelectedPatient,
    notes,
    setNotes,
    validUntil,
    setValidUntil,
    items,
    setItems,
    editingId,
    setEditingId,
    itemTab,
    setItemTab,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    approvedPrompt,
    setApprovedPrompt,
    sendingWhatsAppId,
    setSendingWhatsAppId,
    quickPatientOpen,
    setQuickPatientOpen,
    proposalPaymentEnabled,
    setProposalPaymentEnabled,
    proposalPaymentCondition,
    setProposalPaymentCondition,
    proposalSelectedPaymentMethods,
    setProposalSelectedPaymentMethods,
    proposalPaymentDetails,
    setProposalPaymentDetails,
    proposalPaymentConfig,
    setProposalPaymentConfig,
    prefillPatientId,
    prefillLeadId,
    shouldOpenNewFromQuery,
    prefillProposalId,
    shouldOpenViewFromQuery,
    shouldOpenEditFromQuery,
    returnTo,
    returnLeadId,
    crmReturnUrl,
    proposals,
    isLoading,
    patients,
    treatments,
    combos,
    crmLead,
    standardTotal,
    numDiscountValue,
    discountAmount,
    discountPercent,
    finalTotal,
    total,
    normalizeDigits,
    normalizedSearch,
    normalizedSearchDigits,
    handleStatusFilterChange,
    visibleProposals,
    generateProposalNumber,
    validatePaymentPreset,
    createMutation,
    statusMutation,
    resetForm,
    addTreatmentItem,
    addComboItem,
    getMinPriceWarning,
    openEdit,
    openView,
    handlePrint,
    handleSendWhatsApp,
    goEmitContract,
    approveAndEmit,
    toggleProposalPaymentMethod,
    proposalPaymentSum,
    proposalPaymentValidation,
    canSaveProposal,
  };
}
