import { buildProposalHtml, defaultValidUntil, formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { generateContractPDF } from '@/lib/contractPDF';
import { useClinicLetterhead } from '@/hooks/useClinicLetterhead';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, FileText, Trash2, Search, Eye, Send, Check, X, Printer, Filter, DollarSign, Pencil, MessageCircle, Loader2, UserPlus, Sparkles } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  paymentMethodOptions,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod, isInstallmentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { buildPaymentPresetSummary, composeProposalNotesPayload, parseProposalNotesPayload, type PaymentPresetSnapshot } from '@/lib/proposals/paymentPreset';

const statusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  draft: { label: 'Rascunho', badge: 'draft' },
  sent: { label: 'Enviada', badge: 'sent' },
  accepted: { label: 'Aprovada', badge: 'approved' },
  expired: { label: 'Expirada', badge: 'expired' },
  rejected: { label: 'Reprovada', badge: 'rejected' },
};

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

export default function ProposalsPage() {
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
  const [quickFilter, setQuickFilter] = useState<'all' | 'draft' | 'sent' | 'accepted'>('draft');
  const [search, setSearch] = useState('');
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

    const matchesSearch = !normalizedSearch ||
      proposalNumber.includes(normalizedSearch) ||
      patientCpf.includes(normalizedSearchDigits);
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
      const proposalWebUrl = `${window.location.origin}/proposta/${proposal.id}`;

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


  return (
    <div>
      <PageHeader title="Propostas" description="Geração e gestão de propostas comerciais">
        {crmReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(crmReturnUrl)}>
            Voltar ao CRM
          </BrandButton>
        )}
        <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </BrandButton>
      </PageHeader>

      {crmLead && (
        <Card className="mb-6 shadow-card border-primary/15 bg-primary/5">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Fluxo vindo do CRM</p>
              <p className="text-sm text-muted-foreground">
                Lead <span className="font-medium text-foreground">{crmLead.full_name}</span> pronto para proposta comercial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrandBadge status="scheduled" withDot={false}>
                {crmLead.kanban_stage}
              </BrandBadge>
              {prefillPatientId && (
                <BrandButton
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setSelectedPatient(prefillPatientId);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Criar proposta deste lead
                </BrandButton>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº da proposta ou CPF..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aprovada</SelectItem>
            <SelectItem value="rejected">Reprovada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="w-[170px]" />
        <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="w-[170px]" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <BrandButton size="sm" variant={quickFilter === 'all' ? 'primary' : 'outline'} onClick={() => setQuickFilter('all')}>
          Todas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'draft' ? 'primary' : 'outline'} onClick={() => setQuickFilter('draft')}>
          Rascunhos
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'sent' ? 'primary' : 'outline'} onClick={() => setQuickFilter('sent')}>
          Enviadas
        </BrandButton>
        <BrandButton size="sm" variant={quickFilter === 'accepted' ? 'primary' : 'outline'} onClick={() => setQuickFilter('accepted')}>
          Aprovadas
        </BrandButton>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && visibleProposals.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma proposta encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira proposta comercial</p>
          <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nova Proposta
          </BrandButton>
        </div>
      )}

      {!isLoading && visibleProposals.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nº</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Validade</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor Total</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleProposals.map((p) => {
                  const sm = statusMap[p.status] || { label: p.status, badge: 'default' as BadgeStatus };
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{p.proposal_number}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{p.patients?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.valid_until ? format(new Date(p.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">R$ {Number(p.final_amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><BrandBadge status={sm.badge}>{sm.label}</BrandBadge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <BrandButton variant="ghost" size="sm" onClick={() => openView(p)} title="Ver"><Eye className="w-3.5 h-3.5" /></BrandButton>
                          <BrandButton
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendWhatsApp(p)}
                            disabled={sendingWhatsAppId === p.id}
                            title="Converter em PDF e Enviar por WhatsApp"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          >
                            {sendingWhatsAppId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5" />
                            )}
                          </BrandButton>
                          {p.status !== 'accepted' && (p.status as string) !== 'converted' && (
                            <BrandButton variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar"><Pencil className="w-3.5 h-3.5" /></BrandButton>
                          )}
                          {(p.status === 'draft' || p.status === 'sent') && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => statusMutation.mutate({ id: p.id, status: 'accepted' })}
                              title="Aprovar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                          {p.status === 'accepted' && (
                            <BrandButton
                              variant="ghost"
                              size="sm"
                              onClick={() => goEmitContract(p)}
                              title="Emitir contrato"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </BrandButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Paciente *</Label>
                  <BrandButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary hover:text-primary/90 flex items-center gap-1 px-1.5 font-medium"
                    onClick={() => setQuickPatientOpen(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Novo cliente
                  </BrandButton>
                </div>
                <div className="flex gap-2">
                  <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-1 border-b">
                        <button
                          type="button"
                          className="w-full text-left text-xs font-semibold text-primary px-2 py-1.5 rounded hover:bg-primary/10 flex items-center gap-1.5 transition-colors"
                          onClick={() => setQuickPatientOpen(true)}
                        >
                          <UserPlus className="w-3.5 h-3.5" /> + Cadastrar novo cliente
                        </button>
                      </div>
                      {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <BrandButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 text-xs shrink-0"
                    onClick={() => setQuickPatientOpen(true)}
                    title="Cadastrar novo cliente"
                  >
                    <UserPlus className="w-4 h-4 mr-1 text-primary" /> Novo
                  </BrandButton>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <div className="space-y-4 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <Label>Itens da proposta</Label>
                </div>

                <Tabs value={itemTab} onValueChange={setItemTab} className="mb-3">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="treatment">Tratamento Individual</TabsTrigger>
                    <TabsTrigger value="combo">Combo</TabsTrigger>
                  </TabsList>
                  <TabsContent value="treatment" className="pt-2">
                    <BrandButton type="button" size="sm" variant="outline" onClick={addTreatmentItem}>
                      <Plus className="w-3 h-3" /> Adicionar Tratamento
                    </BrandButton>
                  </TabsContent>
                  <TabsContent value="combo" className="pt-2">
                    {combos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum combo disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {combos.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-2 border rounded-lg">
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(c.treatment_combo_items || []).map((ci) => ci.treatments?.name).filter(Boolean).join(', ')}
                              </p>
                              {c.promotional_price && <p className="text-xs font-semibold text-primary">R$ {Number(c.promotional_price).toFixed(2)}</p>}
                            </div>
                            <BrandButton type="button" size="sm" variant="outline" onClick={() => addComboItem(c)}>
                              <Plus className="w-3 h-3" /> Adicionar
                            </BrandButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {items.map((item, idx) => {
                  const warning = getMinPriceWarning(item);
                  return (
                    <div key={idx} className="mb-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Select value={item.treatment_id} onValueChange={v => {
                            const t = treatments.find((tr) => tr.id === v);
                            const newItems = [...items];
                            newItems[idx] = { ...item, treatment_id: v, unit_price: t ? Number(t.default_price || t.price) : item.unit_price };
                            setItems(newItems);
                          }}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input type="number" min={1} value={item.quantity} className="w-16" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, quantity: parseInt(e.target.value) || 1 };
                          setItems(newItems);
                        }} />
                        <Input type="number" step="0.01" value={item.unit_price} className="w-28" onChange={e => {
                          const newItems = [...items];
                          newItems[idx] = { ...item, unit_price: parseFloat(e.target.value) || 0 };
                          setItems(newItems);
                        }} />
                        <button
                          type="button"
                          onClick={() => { const min = Number(treatments.find((t) => t.id === item.treatment_id)?.min_price || 0); if (min) setItems(items.map((row, i) => (i === idx ? { ...row, unit_price: min } : row))); }}
                          disabled={!(treatments.find((t) => t.id === item.treatment_id)?.min_price)}
                          title={(treatments.find((t) => t.id === item.treatment_id)?.min_price) ? `Usar preço mínimo (R$ ${Number(treatments.find((t) => t.id === item.treatment_id)?.min_price).toFixed(2)})` : 'Tratamento sem preço mínimo'}
                          aria-label="Usar preço mínimo"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-destructive p-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {warning && <p className="text-xs text-destructive mt-1">{warning}</p>}
                    </div>
                  );
                })}
                {items.length > 0 && (
                  <div className="space-y-3 rounded-lg border p-3 bg-secondary/15 mt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-foreground">Desconto Especial</Label>
                      <div className="inline-flex rounded-md border p-0.5 bg-background">
                        <button
                          type="button"
                          onClick={() => setDiscountType('nominal')}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition ${discountType === 'nominal' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          R$ (Nominal)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiscountType('percent')}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition ${discountType === 'percent' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          % (Porcentagem)
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground w-8 text-right">
                        {discountType === 'nominal' ? 'R$' : '%'}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={discountType === 'nominal' ? '0,00' : '0'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="h-9 flex-1"
                      />
                    </div>
                    <div className="text-xs space-y-1.5 text-muted-foreground pt-2 border-t">
                      <div className="flex justify-between">
                        <span>Valor padrão:</span>
                        <span className="font-medium text-foreground">R$ {standardTotal.toFixed(2)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-success font-semibold">
                          <span>
                            Desconto especial ({discountType === 'percent' ? `${discountPercent.toFixed(1)}%` : `R$ ${discountAmount.toFixed(2)}`}):
                          </span>
                          <span>- R$ {discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-foreground font-bold text-sm pt-1 border-t">
                        <span>Valor final:</span>
                        <span className="text-primary text-base">R$ {finalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t">
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4 bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Condições de pagamento na proposta (opcional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Se preencher aqui, o contrato já abre pré-carregado para confirmar/editar.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex h-6 w-11 items-center rounded-full transition ${proposalPaymentEnabled ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => setProposalPaymentEnabled((current) => !current)}
                    aria-pressed={proposalPaymentEnabled}
                    aria-label="Habilitar condições de pagamento na proposta"
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white transition ${proposalPaymentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
                {proposalPaymentEnabled ? (
                  <div className="space-y-3">
                    <ContractPaymentConfigurator
                      paymentCondition={proposalPaymentCondition}
                      setPaymentCondition={setProposalPaymentCondition}
                      selectedPaymentMethods={proposalSelectedPaymentMethods}
                      togglePaymentMethod={toggleProposalPaymentMethod}
                      paymentConfig={proposalPaymentConfig}
                      setPaymentConfig={setProposalPaymentConfig}
                      paymentDetails={proposalPaymentDetails}
                      setPaymentDetails={setProposalPaymentDetails}
                    />
                    <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                      Valor da proposta: <span className="font-semibold text-foreground">R$ {finalTotal.toFixed(2)}</span> ·
                      Soma informada: <span className="font-semibold text-foreground">R$ {proposalPaymentSum.toFixed(2)}</span>
                      {!proposalPaymentValidation.ok && (
                        <span className="block text-destructive mt-1">
                          {proposalPaymentValidation.message}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                    Ative para informar as condições comerciais já na proposta.
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient || !canSaveProposal}>
                {createMutation.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Proposta'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Proposta {viewDialog.proposal_number}</span>
                  <BrandBadge status={statusMap[viewDialog.status]?.badge || 'default'}>
                    {statusMap[viewDialog.status]?.label || viewDialog.status}
                  </BrandBadge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{viewDialog.patients?.full_name}</span></div>
                  <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{format(new Date(viewDialog.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
                  {viewDialog.valid_until && <div><span className="text-muted-foreground">Validade:</span> <span className="font-medium">{format(new Date(viewDialog.valid_until + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}</span></div>}
                  <div><span className="text-muted-foreground">Valor Padrão:</span> <span className="font-medium">R$ {Number(viewDialog.total_amount || viewDialog.final_amount).toFixed(2)}</span></div>
                  {Number(viewDialog.discount_amount || 0) > 0 && (
                    <div className="text-success font-medium col-span-2 sm:col-span-1">
                      <span>Desconto Especial{Number(viewDialog.discount_percent || 0) > 0 ? ` (${viewDialog.discount_percent}%)` : ''}:</span>{' '}
                      <span>- R$ {Number(viewDialog.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div><span className="text-muted-foreground">Valor Final:</span> <span className="font-bold text-primary">R$ {Number(viewDialog.final_amount).toFixed(2)}</span></div>
                </div>

                {viewDialog.items?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-secondary/50">
                          <th className="text-left px-3 py-2">Tratamento</th>
                          <th className="text-center px-3 py-2">Qtd</th>
                          <th className="text-right px-3 py-2">Valor Unit.</th>
                          <th className="text-right px-3 py-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewDialog.items.map((i) => (
                          <tr key={i.id} className="border-b">
                            <td className="px-3 py-2">{i.treatments?.name || '—'}</td>
                            <td className="px-3 py-2 text-center">{i.quantity}</td>
                            <td className="px-3 py-2 text-right">R$ {Number(i.unit_price).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">R$ {Number(i.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {parseProposalNotesPayload(viewDialog.notes).plainNotes && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Obs:</strong> {parseProposalNotesPayload(viewDialog.notes).plainNotes}
                  </p>
                )}
                {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset) && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Condições comerciais sugeridas:</strong>{' '}
                    {buildPaymentPresetSummary(parseProposalNotesPayload(viewDialog.notes).paymentPreset)}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <BrandButton
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm flex items-center gap-1.5"
                    disabled={sendingWhatsAppId === viewDialog.id}
                    onClick={() => handleSendWhatsApp(viewDialog)}
                  >
                    {sendingWhatsAppId === viewDialog.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Convertendo PDF...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
                      </>
                    )}
                  </BrandButton>

                  <BrandButton variant="outline" size="sm" onClick={() => handlePrint(viewDialog)}>
                    <Printer className="w-4 h-4" /> Imprimir
                  </BrandButton>

                  {viewDialog.status !== 'accepted' && (viewDialog.status as string) !== 'converted' && (
                    <BrandButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const target = viewDialog;
                        setViewDialog(null);
                        openEdit(target);
                      }}
                    >
                      <Pencil className="w-4 h-4" /> Editar
                    </BrandButton>
                  )}

                  {viewDialog.status === 'draft' && (
                    <BrandButton size="sm" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'sent' })}>
                      <Send className="w-4 h-4" /> Marcar como Enviada
                    </BrandButton>
                  )}

                  {(viewDialog.status === 'draft' || viewDialog.status === 'sent') && (
                    <>
                      <BrandButton size="sm" className="bg-success hover:bg-success/90" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'accepted' })}>
                        <Check className="w-4 h-4" /> Aprovar
                      </BrandButton>
                      <BrandButton size="sm" onClick={() => approveAndEmit(viewDialog)} disabled={statusMutation.isPending}>
                        <FileText className="w-4 h-4" /> Aprovar e emitir contrato
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => statusMutation.mutate({ id: viewDialog.id, status: 'rejected' })}>
                        <X className="w-4 h-4" /> Reprovar
                      </BrandButton>
                    </>
                  )}

                  {viewDialog.status === 'accepted' && (
                    <BrandButton size="sm" onClick={() => goEmitContract(viewDialog)}>
                      <FileText className="w-4 h-4" /> Emitir contrato
                    </BrandButton>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvedPrompt} onOpenChange={(open) => { if (!open) { setApprovedPrompt(null); if (crmReturnUrl) navigate(crmReturnUrl); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="w-5 h-5 text-success" />Proposta aprovada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {approvedPrompt?.proposal_number} · {approvedPrompt?.patients?.full_name} · R$ {Number(approvedPrompt?.final_amount || 0).toFixed(2)}
          </p>
          <p className="text-sm text-foreground">
            Emita o contrato agora para não esquecer. A forma de pagamento combinada na proposta já vem preenchida.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <BrandButton variant="outline" onClick={() => { setApprovedPrompt(null); if (crmReturnUrl) navigate(crmReturnUrl); }}>
              Emitir depois
            </BrandButton>
            <BrandButton onClick={() => approvedPrompt && goEmitContract(approvedPrompt)}>
              <FileText className="w-4 h-4" /> Emitir contrato agora
            </BrandButton>
          </div>
        </DialogContent>
      </Dialog>

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={(patient) => {
          setSelectedPatient(patient.id);
          qc.invalidateQueries({ queryKey: ['patients-list'] });
          toast({
            title: 'Cliente cadastrado com sucesso!',
            description: `${patient.full_name} foi selecionado(a) para esta proposta.`,
          });
        }}
      />
    </div>
  );
}
