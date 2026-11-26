import { useEffect, useMemo, useState } from 'react';
import { buildLetterhead, documentFooter } from '@/lib/documents/letterhead';
import { loadClinicLetterhead } from '@/hooks/useClinicLetterhead';
import { describeDueDates, describePaymentMethods } from '@/lib/documents/contractPayment';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CalendarRange, CheckCircle2, Eye, ExternalLink, FileSignature, Filter, Plus, Search, Upload, UserCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MobileFilters } from '@/components/ui/mobile-filters';
import { format } from 'date-fns';
import { getSignedContractUrl } from '@/lib/storageHelper';
import { generateContractPDF } from '@/lib/contractPDF';
import { renderContractTemplate, type ContractTemplateData } from '@/lib/contractTemplateRenderer';
import { ptBR } from 'date-fns/locale';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { ContractViewDialog } from '@/components/contracts/ContractViewDialog';


import { Card, CardContent } from '@/components/ui/card';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parseProposalNotesPayload } from '@/lib/proposals/paymentPreset';
import type { Database, Json } from '@/integrations/supabase/types';
import PayerSection, { type PayerData } from '@/components/patient/PayerSection';
import {
  ContractPaymentConfigurator,
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod, isInstallmentMethod } from '@/components/contracts/ContractPaymentConfigurator';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';
import { usePatientDepositCredit } from '@/hooks/usePatientDepositCredit';
import { advanceDetailsText, withAdvance } from '@/lib/finance/deposit';
import { ContractAdvanceSummary } from '@/components/deposits/ContractAdvanceSummary';
import { formatCpf, formatPatientAddress } from '@/lib/patients/validation';

type ContractRow = Database['public']['Tables']['contracts']['Row'];
type ContractStatus = Database['public']['Enums']['contract_status'];
type ProposalStatus = Database['public']['Enums']['proposal_status'];
type ContractWithRelations = ContractRow & {
  process_status?: string | null;
  signed_pdf_url?: string | null;
  template_html?: string | null;
  patients?: { full_name?: string | null; cpf?: string | null } | null;
  proposals?: { proposal_number?: string | null; final_amount?: number | null } | null;
  payers?: { name?: string | null; cpf?: string | null } | null;
};
type ApprovedProposal = {
  id: string;
  proposal_number: string;
  patient_id: string;
  final_amount: number | null;
  patients?: {
    full_name?: string | null;
    cpf?: string | null;
    date_of_birth?: string | null;
    payer_id?: string | null;
    is_self_payer?: boolean | null;
    address?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  } | null;
};
type ProposalItemLite = { quantity: number; treatments?: { name?: string | null; num_sessions?: number | null } | null };
type ProposalItemFilterRow = {
  proposal_id: string | null;
  treatment_id: string | null;
  treatments?: { name?: string | null } | null;
};

async function computeSHA256(text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ContractsPage() {
  const { clinicId, clinicName } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const quickParam = searchParams.get('quick');
  const [filterStatus, setFilterStatus] = useState(() =>
    statusParam && ['all', 'pending_upload', 'pending_confirmation', 'confirmed', 'overdue', 'cancelled'].includes(statusParam)
      ? statusParam
      : 'all'
  );
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [viewContract, setViewContract] = useState<ContractWithRelations | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [previewContract, setPreviewContract] = useState<{
    html: string;
    pdfPath: string;
    renderData: ContractTemplateData;
    templateId: string;
    templateVersion: number;
    contractNumber: string;
    issuanceKey: string;
    payerIdForContract: string | null;
    paymentTermsText: string;
    proposal: ApprovedProposal;
    depositIds: string[];
  } | null>(null);
  const [confirmingEmission, setConfirmingEmission] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const [selectedProposal, setSelectedProposal] = useState('');
  const [birthDateInput, setBirthDateInput] = useState('');
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('pending_confirmation');
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine_today' | 'pending_signature' | 'overdue'>(() =>
    quickParam && ['all', 'mine_today', 'pending_signature', 'overdue'].includes(quickParam)
      ? (quickParam as 'all' | 'mine_today' | 'pending_signature' | 'overdue')
      : 'all'
  );
  const prefillContractId = searchParams.get('contractId');
  const shouldOpenViewFromQuery = searchParams.get('view') === '1';
  const returnTo = searchParams.get('returnTo');
  const returnLeadId = searchParams.get('returnLeadId');
  const crmReturnUrl = returnTo === 'crm' && returnLeadId ? `/clinic/crm?leadId=${returnLeadId}` : null;
  // Vindo de Propostas: ?emitir=<id da proposta> abre a emissão já com ela escolhida.
  const emitirProposalId = searchParams.get('emitir');
  const proposalsReturnUrl = returnTo === 'proposals' ? '/clinic/proposals' : null;

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts', clinicId, filterStatus, search],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*, patients(full_name, cpf), proposals(proposal_number, final_amount), payers(name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') query = query.eq('process_status', filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ContractWithRelations[];
    },
    enabled: !!clinicId,
  });

  // Contagem por status (independe do filtro escolhido, para as abas mostrarem sempre o total de cada uma).
  const { data: statusRows = [] } = useQuery({
    queryKey: ['contracts', clinicId, 'status-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contracts').select('process_status').eq('clinic_id', clinicId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: proposalItemsFilterMap = [] } = useQuery({
    queryKey: ['proposal-items-filter-map', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, treatment_id, treatments(name), proposals!inner(clinic_id)')
        .eq('proposals.clinic_id', clinicId!);
      if (error) throw error;
      return ((data || []) as ProposalItemFilterRow[]);
    },
    enabled: !!clinicId,
  });

  const { data: approvedProposals = [], isFetched: approvedProposalsFetched } = useQuery({
    queryKey: ['approved-proposals-no-contract', clinicId],
    queryFn: async () => {
      const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('proposal_id')
        .eq('clinic_id', clinicId!);

      if (contractsError) throw contractsError;

      const linkedIds = (allContracts || []).map((contract) => contract.proposal_id).filter(Boolean);
      let query = supabase
        .from('proposals')
        .select('id, proposal_number, patient_id, final_amount, patients(full_name, cpf, date_of_birth, payer_id, is_self_payer, address, address_number, address_complement, city, state, zip_code)')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted' as ProposalStatus);

      if (linkedIds.length > 0) query = query.not('id', 'in', `(${linkedIds.join(',')})`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovedProposal[];
    },
    enabled: !!clinicId && createDialog,
  });

  const selectedProposalData = approvedProposals.find((proposal) => proposal.id === selectedProposal) || null;
  // Sinais pagos da cliente (crédito): entram como entrada já paga e reduzem o que falta pagar.
  const [applyDeposits, setApplyDeposits] = useState(true);
  const patientDeposits = usePatientDepositCredit(clinicId, selectedProposalData?.patient_id);
  const depositCredit = applyDeposits ? patientDeposits.reduce((sum, d) => sum + Number(d.amount), 0) : 0;
  const linkedPayerId = selectedProposalData?.patients?.payer_id || null;
  const { data: linkedPayerOption } = useQuery({
    queryKey: ['contract-linked-payer', clinicId, linkedPayerId],
    queryFn: async () => {
      if (!linkedPayerId) return null;
      const { data, error } = await supabase
        .from('payers')
        .select('id, name, cpf')
        .eq('clinic_id', clinicId!)
        .eq('id', linkedPayerId)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string; name: string; cpf?: string | null } | null) || null;
    },
    enabled: !!clinicId && !!linkedPayerId && createDialog,
  });

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = { all: statusRows.length };
    for (const row of statusRows) acc[row.process_status] = (acc[row.process_status] || 0) + 1;
    return acc;
  }, [statusRows]);

  const visibleContracts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedSearchDigits = normalizeDigits(search);
    const treatmentByProposal = proposalItemsFilterMap.reduce<Record<string, Set<string>>>((acc, item) => {
      if (!item.proposal_id || !item.treatment_id) return acc;
      if (!acc[item.proposal_id]) acc[item.proposal_id] = new Set<string>();
      acc[item.proposal_id].add(item.treatment_id);
      return acc;
    }, {});

    return contracts.filter((contract) => {
      const contractNumber = (contract.contract_number || '').toLowerCase();
      const patientName = (contract.patients?.full_name || '').toLowerCase();
      const patientCpf = normalizeDigits(contract.patients?.cpf);
      const payerCpf = normalizeDigits(contract.payers?.cpf);

      const matchesSearch = !normalizedSearch ||
        contractNumber.includes(normalizedSearch) ||
        patientName.includes(normalizedSearch) ||
        patientCpf.includes(normalizedSearchDigits) ||
        payerCpf.includes(normalizedSearchDigits);
      if (!matchesSearch) return false;

      if (dateStart && contract.created_at < `${dateStart}T00:00:00`) return false;
      if (dateEnd && contract.created_at > `${dateEnd}T23:59:59`) return false;
      if (treatmentFilter !== 'all') {
        if (!contract.proposal_id) return false;
        const treatmentSet = treatmentByProposal[contract.proposal_id];
        if (!treatmentSet || !treatmentSet.has(treatmentFilter)) return false;
      }

      if (quickFilter === 'pending_signature') return contract.process_status === 'pending_confirmation';
      if (quickFilter === 'overdue') return contract.process_status === 'overdue';
      if (quickFilter === 'mine_today') {
        const createdAt = contract.created_at ? format(new Date(contract.created_at), 'yyyy-MM-dd') : '';
        return contract.created_by === user?.id && createdAt === today;
      }
      return true;
    });
  }, [contracts, quickFilter, user?.id, search, dateStart, dateEnd, treatmentFilter, proposalItemsFilterMap]);

  const treatmentOptions = proposalItemsFilterMap.reduce<Array<{ id: string; name: string }>>((acc, item) => {
    if (!item.treatment_id || !item.treatments?.name) return acc;
    if (acc.some((row) => row.id === item.treatment_id)) return acc;
    acc.push({ id: item.treatment_id, name: item.treatments.name });
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name));

  const createMutation = useMutation({
    mutationFn: async () => {
      setGeneratingPreview(true);
      try {
      const now = new Date();
      const formattedDate = format(now, 'dd/MM/yyyy');
      const contractNumber = `CT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const proposal = approvedProposals.find((item) => item.id === selectedProposal);
      // Data de nascimento é obrigatória: o paciente confirma a identidade com ela ao assinar pelo celular.
      if (proposal && !proposal.patients?.date_of_birth) {
        const today = new Date().toISOString().slice(0, 10);
        if (!birthDateInput || birthDateInput >= today || birthDateInput < '1900-01-01') {
          throw new Error('Informe a data de nascimento do paciente. Ela é usada para confirmar a identidade na assinatura pelo celular.');
        }
        const { error: dobError } = await supabase.from('patients').update({ date_of_birth: birthDateInput }).eq('id', proposal.patient_id);
        if (dobError) throw dobError;
        proposal.patients = { ...proposal.patients, date_of_birth: birthDateInput } as typeof proposal.patients;
      }
      if (!proposal) throw new Error('Selecione uma proposta');
      if (selectedPaymentMethods.length === 0) throw new Error('Selecione ao menos uma forma de pagamento.');
      const proposalAmount = Math.max(0, Number(proposal.final_amount || 0) - depositCredit);

      const amounts = selectedPaymentMethods.map((method) => Number(paymentConfig[method]?.amount || 0));
      const hasInvalidAmount = amounts.some((value) => !Number.isFinite(value) || value <= 0);
      if (hasInvalidAmount) throw new Error('Informe um valor válido para cada forma selecionada.');

      const requiresInstallments = selectedPaymentMethods.filter((method) => isInstallmentMethod(method));
      const hasInvalidInstallments = requiresInstallments.some((method) => Number(paymentConfig[method]?.installments || 0) <= 0);
      if (hasInvalidInstallments) throw new Error('Cartão e boleto exigem quantidade de parcelas maior que zero.');
      const totalInformed = amounts.reduce((sum, value) => sum + value, 0);
      if (totalInformed + 0.0001 < proposalAmount) {
        throw new Error(`A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor ${depositCredit > 0 ? 'que falta pagar' : 'da proposta'} (R$ ${proposalAmount.toFixed(2)}).`);
      }

      const usedDeposits = applyDeposits ? patientDeposits : [];
      const paymentTermsText = [
        buildContractPaymentNotes(
          selectedPaymentMethods,
          paymentConfig,
          paymentDetails,
          paymentConditionLabels[paymentCondition]
        ),
        ...(usedDeposits.length ? [`${advanceDetailsText(usedDeposits)}. Abatido do valor total.`] : []),
      ].join('\n');

      const patient = proposal.patients;
      let payerIdForContract = null;

      if (!payerData.is_self_payer) {
        if (!payerData.payer_id) throw new Error('Selecione o pagador');
        payerIdForContract = payerData.payer_id;
      }

      const { data: payerRaw } = payerIdForContract
        ? await supabase.from('payers').select('name, cpf, birth_date').eq('id', payerIdForContract).single()
        : { data: null };

      // Re-fetch clinic data properly
      const { data: clinicData, error: clinicError } = await supabase.from('clinics').select('name, address, city, state, phone, email').eq('id', clinicId!).single();
      if (clinicError) throw clinicError;
      const { data: cnpjSetting } = await supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId).eq('key', 'cnpj').single();

      const { data: proposalItems, error: proposalItemsError } = await supabase
        .from('proposal_items')
        .select('quantity, treatments(name, num_sessions)')
        .eq('proposal_id', proposal.id);
      if (proposalItemsError) throw proposalItemsError;
      const typedItems = (proposalItems || []) as ProposalItemLite[];
      const treatmentNames = typedItems.map((item) => item.treatments?.name).filter(Boolean).join(', ');
      const totalSessions = typedItems.reduce((total, item) => total + item.quantity * (item.treatments?.num_sessions || 1), 0);

      const { data: anamnesis } = await supabase.from('patient_anamneses').select('id').eq('patient_id', proposal.patient_id).order('created_at', { ascending: false }).limit(1).maybeSingle();

      const { data: templateDataRaw, error: templateError } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .single();

      if (templateError || !templateDataRaw) {
        throw new Error('Nenhum modelo de contrato ativo encontrado para a clínica. Acesse Configurações > Contrato padrão para ativar um modelo.');
      }

      const renderData: ContractTemplateData = {
        clinic: {
          name: clinicData?.name || '',
          cnpj: typeof cnpjSetting?.value === 'string' ? cnpjSetting.value : '',
          address: clinicData?.address || '',
          city: clinicData?.city || '',
          state: clinicData?.state || '',
          phone: clinicData?.phone || '',
          email: clinicData?.email || '',
        },
        patient: {
          name: patient?.full_name || '',
          cpf: patient.cpf ? formatCpf(patient.cpf) : '',
          birth_date: patient?.date_of_birth || '',
          address: formatPatientAddress(patient ?? {})
        },
        payer: !payerData.is_self_payer && payerRaw ? {
          name: payerRaw.name || '',
          cpf: payerRaw.cpf || '',
          birth_date: payerRaw.birth_date || ''
        } : undefined,
        contract: {
          number: contractNumber,
          date: formattedDate,
          start_date: formattedDate,
          end_date: ''
        },
        treatments: {
          summary: treatmentNames || 'Tratamento estético',
          total_sessions: totalSessions
        },
        payment: withAdvance({
          total_value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(proposal.final_amount)),
          condition: paymentConditionLabels[paymentCondition],
          methods: describePaymentMethods(selectedPaymentMethods, paymentConfig),
          installments: selectedPaymentMethods.reduce((acc: number, m: PaymentMethod) => acc + (Number(paymentConfig[m]?.installments) || 1), 0),
          due_dates: describeDueDates(selectedPaymentMethods, paymentConfig, formattedDate)
        }, Number(proposal.final_amount || 0), usedDeposits, templateDataRaw.content_html || ''),
        proposal: {
          number: proposal.proposal_number
        },
        anamnesis: {
          number: anamnesis?.id ? anamnesis.id.substring(0, 8).toUpperCase() : ''
        }
      };

      const rendered = renderContractTemplate(templateDataRaw.content_html, renderData);

      if (rendered.missingRequired.length > 0 || rendered.unknownPlaceholders.length > 0) {
        throw new Error(`Erros no modelo: Ausentes [${rendered.missingRequired.join(', ')}]. Desconhecidos [${rendered.unknownPlaceholders.join(', ')}]. Corrija no Contrato Padrão.`);
      }

      const pdfPath = `${clinicId}/${proposal.patient_id}/${contractNumber}.pdf`;
      const issuanceKey = `proposal:${proposal.id}`;

      // Papel timbrado da clínica (logo, CNPJ, endereço) no topo; o texto vem do modelo.
      const letterhead = await loadClinicLetterhead(clinicId!);
      const documentHtml = buildLetterhead(letterhead) + rendered.html
        + documentFooter(`${letterhead.name} · Contrato ${contractNumber} · Modelo v${templateDataRaw.version}`);

      // Open the preview modal
      setPreviewContract({
        html: documentHtml,
        pdfPath,
        renderData,
        templateId: templateDataRaw.id,
        templateVersion: templateDataRaw.version,
        contractNumber,
        issuanceKey,
        payerIdForContract,
        paymentTermsText,
        proposal,
        depositIds: usedDeposits.map((d) => d.id),
      });

      } finally {
        setGeneratingPreview(false);
      }
      // Return null, the actual emission happens in confirmEmission
      return null;
    },
    onSuccess: (res) => {
       if(res === null) return; // Prevent closing the main modal yet

      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setCreateDialog(false);
      setSelectedProposal('');
      setBirthDateInput('');
      setPaymentCondition('cash');
      setSelectedPaymentMethods([]);
      setPaymentDetails({});
      setPaymentConfig({});
      setPayerData({ is_self_payer: true, payer_id: null });
      toast({ title: 'Contrato gerado!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const handleConfirmEmission = async () => {
    if (!previewContract || !clinicId || !user || confirmingEmission) return;
    setConfirmingEmission(true);
    let uploaded = false;
    try {
      const documentHash = await computeSHA256(previewContract.html);
      const pdf = await generateContractPDF(previewContract.html);
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(previewContract.pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;

      const proposal = previewContract.proposal;
      const { data: contract, error: insertError } = await supabase.from('contracts').insert({
        clinic_id: clinicId,
        patient_id: proposal.patient_id,
        payer_id: previewContract.payerIdForContract,
        proposal_id: proposal.id,
        contract_number: previewContract.contractNumber,
        issuance_key: previewContract.issuanceKey,
        status: 'active',
        process_status: 'pending_confirmation',
        notes: previewContract.paymentTermsText,
        template_html: previewContract.html,
        contract_template_id: previewContract.templateId,
        contract_template_version: previewContract.templateVersion,
        template_snapshot_html: previewContract.html,
        contract_data_snapshot: previewContract.renderData as unknown as Json,
        generated_at: new Date().toISOString(),
        generated_by: user.id,
        document_hash: documentHash,
        pdf_storage_path: previewContract.pdfPath,
        signed_pdf_url: previewContract.pdfPath,
        created_by: user.id,
      }).select('id').single();
      if (insertError) throw insertError;

      await upsertContractFinancialForecast(contract.id);
      if (previewContract.depositIds.length) {
        const { error: depError } = await supabase.rpc('deposit_apply_to_contract', { p_contract_id: contract.id, p_deposit_ids: previewContract.depositIds });
        if (depError) toast({ title: 'Contrato emitido, mas o sinal não foi abatido', description: depError.message, variant: 'destructive' });
        qc.invalidateQueries({ queryKey: ['deposits'] });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['contracts'] }),
        qc.invalidateQueries({ queryKey: ['patients'] }),
      ]);
      setPreviewContract(null);
      setCreateDialog(false);
      setSelectedProposal('');
      setBirthDateInput('');
      toast({ title: 'Contrato emitido com sucesso!' });
    } catch (error) {
      if (uploaded) await supabase.storage.from('contracts').remove([previewContract.pdfPath]);
      const { data: existing } = await supabase
        .from('contracts')
        .select('id, document_hash')
        .eq('clinic_id', clinicId)
        .eq('issuance_key', previewContract.issuanceKey)
        .maybeSingle();
      if (existing) {
        const attemptedHash = await computeSHA256(previewContract.html);
        if (existing.document_hash !== attemptedHash) {
          toast({ title: 'Conflito de emissão', description: 'Já existe uma emissão para esta proposta com conteúdo diferente.', variant: 'destructive' });
          return;
        }
        await qc.invalidateQueries({ queryKey: ['contracts'] });
        setPreviewContract(null);
        setCreateDialog(false);
        toast({ title: 'Contrato já emitido', description: 'A emissão existente foi mantida; nenhuma duplicata foi criada.' });
      } else {
        toast({ title: 'Erro ao emitir contrato', description: error instanceof Error ? error.message : 'Falha inesperada', variant: 'destructive' });
      }
    } finally {
      setConfirmingEmission(false);
    }
  };

  const bulkStatusMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || selectedContractIds.length === 0) return;
      const { error } = await supabase
        .from('contracts')
        .update({ process_status: bulkStatus as ContractStatus })
        .eq('clinic_id', clinicId)
        .in('id', selectedContractIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setSelectedContractIds([]);
      toast({ title: 'Status atualizado em lote!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (!shouldOpenViewFromQuery || !prefillContractId || contracts.length === 0 || !!viewContract) return;
    const targetContract = contracts.find((contract) => contract.id === prefillContractId);
    if (!targetContract) return;

    setViewContract(targetContract);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('contractId');
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenViewFromQuery, prefillContractId, contracts, viewContract, searchParams, setSearchParams]);

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

  const selectedProposalAmount = Math.max(0, Number(selectedProposalData?.final_amount || 0) - depositCredit);
  const selectedAmountSum = selectedPaymentMethods.reduce(
    (sum, method) => sum + Number(paymentConfig[method]?.amount || 0),
    0
  );
  const canGenerateContract =
    !!selectedProposal &&
    !createMutation.isPending &&
    selectedPaymentMethods.length > 0 &&
    selectedPaymentMethods.every((method) => Number(paymentConfig[method]?.amount || 0) > 0) &&
    selectedPaymentMethods
      .filter((method) => isInstallmentMethod(method))
      .every((method) => Number(paymentConfig[method]?.installments || 0) > 0) &&
    selectedAmountSum + 0.0001 >= selectedProposalAmount;

  useEffect(() => {
    if (!selectedProposalData) {
      setPayerData({ is_self_payer: true, payer_id: null });
      return;
    }
    setPayerData({
      is_self_payer: selectedProposalData.patients?.is_self_payer ?? true,
      payer_id: selectedProposalData.patients?.payer_id || null,
      new_payer: selectedProposalData.patients?.is_self_payer
        ? undefined
        : { name: '', cpf: '', birth_date: '' },
    });
  }, [selectedProposalData]);

  useEffect(() => {
    if (emitirProposalId) setCreateDialog(true);
  }, [emitirProposalId]);

  useEffect(() => {
    if (!emitirProposalId || !createDialog || !approvedProposalsFetched) return;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('emitir');
      setSearchParams(next, { replace: true });
    };
    const target = approvedProposals.find((proposal) => proposal.id === emitirProposalId);
    if (!target) {
      clearParam();
      setCreateDialog(false);
      const existing = contracts.find((contract) => contract.proposal_id === emitirProposalId);
      if (existing) {
        setViewContract(existing);
        toast({ title: 'Esta proposta já tem contrato', description: existing.contract_number || undefined });
      } else {
        toast({ title: 'Proposta indisponível', description: 'Para emitir, a proposta precisa estar aprovada e sem contrato.', variant: 'destructive' });
      }
      return;
    }
    setSelectedProposal(target.id);
    clearParam();
    // Traz a forma de pagamento combinada na proposta.
    supabase.from('proposals').select('notes').eq('id', target.id).maybeSingle().then(({ data }) => {
      const preset = parseProposalNotesPayload(data?.notes).paymentPreset;
      if (!preset) return;
      setPaymentCondition(preset.condition);
      setSelectedPaymentMethods(preset.methods);
      setPaymentDetails(preset.details);
      setPaymentConfig(preset.config);
    });
  }, [emitirProposalId, createDialog, approvedProposalsFetched, approvedProposals, contracts, searchParams, setSearchParams, toast]);

  return (
    <div>
      <PageHeader title="Contratos" description="Formalize a venda e acompanhe o ciclo do contrato">
        {proposalsReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(proposalsReturnUrl)}>
            Voltar para Propostas
          </BrandButton>
        )}
        {crmReturnUrl && (
          <BrandButton variant="outline" onClick={() => navigate(crmReturnUrl)}>
            Voltar ao CRM
          </BrandButton>
        )}
        <BrandButton onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" />
          Gerar contrato
        </BrandButton>
      </PageHeader>

      {/* Filtros: busca + tratamento + período + "meus de hoje" */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por contrato, paciente ou CPF"
            className="h-10 pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <MobileFilters activeCount={(treatmentFilter !== 'all' ? 1 : 0) + (dateStart || dateEnd ? 1 : 0) + (quickFilter === 'mine_today' ? 1 : 0)}>
        <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
          <SelectTrigger className="h-10 w-full sm:w-52">
            <SelectValue placeholder="Tratamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tratamentos</SelectItem>
            {treatmentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm sm:w-auto ${dateStart || dateEnd ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-input bg-background text-muted-foreground'}`}
            >
              <CalendarRange className="h-4 w-4" />
              {dateStart || dateEnd
                ? `${dateStart ? dateStart.split('-').reverse().join('/') : '…'} – ${dateEnd ? dateEnd.split('-').reverse().join('/') : '…'}`
                : 'Período'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <p className="text-sm font-medium">Contratos gerados entre</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">De
                <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">Até
                <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
              </label>
            </div>
            {(dateStart || dateEnd) && (
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { setDateStart(''); setDateEnd(''); }}>
                Limpar período
              </button>
            )}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          aria-pressed={quickFilter === 'mine_today'}
          onClick={() => setQuickFilter(quickFilter === 'mine_today' ? 'all' : 'mine_today')}
          className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium ${quickFilter === 'mine_today' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:text-foreground'}`}
        >
          <UserCheck className="h-4 w-4" /> Meus de hoje
        </button>
        </MobileFilters>
      </div>

      {/* Status: abas compactas com contagem (substituem os cartões grandes) */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Filtrar por status" className="inline-flex min-w-max gap-1.5">
          {([
            { value: 'all', label: 'Todos', dot: 'bg-muted-foreground/40', alert: '' },
            { value: 'pending_upload', label: 'Gerados', dot: 'bg-sky-500', alert: '' },
            { value: 'pending_confirmation', label: 'Assinatura recebida', dot: 'bg-amber-500', alert: 'bg-amber-100 text-amber-800' },
            { value: 'confirmed', label: 'Ativos', dot: 'bg-emerald-500', alert: '' },
            { value: 'overdue', label: 'Precisam de revisão', dot: 'bg-rose-500', alert: 'bg-rose-100 text-rose-700' },
            { value: 'cancelled', label: 'Cancelados', dot: 'bg-slate-400', alert: '' },
          ]).map((tab) => {
            const active = filterStatus === tab.value && (quickFilter === 'all' || quickFilter === 'mine_today');
            const count = statusCounts[tab.value] || 0;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setFilterStatus(tab.value); if (quickFilter !== 'mine_today') setQuickFilter('all'); }}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                {!active && <span className={`h-2 w-2 rounded-full ${tab.dot}`} />}
                {tab.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : tab.alert && count > 0 ? tab.alert : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedContractIds.length > 0 && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground">
              {selectedContractIds.length} contrato(s) selecionado(s)
            </p>
            <div className="flex gap-2">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_upload">Gerado</SelectItem>
                  <SelectItem value="pending_confirmation">Assinado recebido</SelectItem>
                  <SelectItem value="confirmed">Ativo</SelectItem>
                  <SelectItem value="overdue">Revisão</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <BrandButton size="sm" onClick={() => bulkStatusMutation.mutate()} disabled={bulkStatusMutation.isPending}>
                {bulkStatusMutation.isPending ? 'Atualizando...' : 'Aplicar em lote'}
              </BrandButton>
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && contracts.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileSignature className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum contrato</h3>
          <p className="text-sm text-muted-foreground">Contratos são gerados a partir de propostas aprovadas.</p>
        </div>
      )}

      {!isLoading && visibleContracts.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={visibleContracts.length > 0 && visibleContracts.every((item) => selectedContractIds.includes(item.id))}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedContractIds(Array.from(new Set([...selectedContractIds, ...visibleContracts.map((item) => item.id)])));
                        } else {
                          const visibleSet = new Set(visibleContracts.map((item) => item.id));
                          setSelectedContractIds(selectedContractIds.filter((id) => !visibleSet.has(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Contrato</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Proposta</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => (
                  <tr key={contract.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedContractIds.includes(contract.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedContractIds((current) => Array.from(new Set([...current, contract.id])));
                          } else {
                            setSelectedContractIds((current) => current.filter((id) => id !== contract.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewContract(contract)}
                        className="rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={`Abrir contrato ${contract.contract_number}`}
                      >
                        {contract.contract_number}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(contract.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{contract.patients?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{contract.proposals?.proposal_number || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                      R$ {Number(contract.proposals?.final_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusBadge status={contract.process_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {contract.signed_pdf_url && (
                          <BrandButton
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const url = await getSignedContractUrl(contract.pdf_storage_path || contract.signed_pdf_url);
                                window.open(url, '_blank', 'noopener,noreferrer');
                              } catch (e) {
                                toast({ title: 'Erro de acesso', description: 'Não foi possível carregar o arquivo.', variant: 'destructive' });
                              }
                            }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </BrandButton>
                        )}
                        <BrandButton variant="ghost" size="sm" onClick={() => setViewContract(contract)}>
                          <Eye className="w-3.5 h-3.5" />
                        </BrandButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && contracts.length > 0 && visibleContracts.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum contrato encontrado para o filtro rápido selecionado.
        </div>
      )}

      <Dialog
        open={createDialog}
        onOpenChange={(open) => {
          setCreateDialog(open);
          if (!open) {
            setSelectedProposal('');
      setBirthDateInput('');
            setPaymentCondition('cash');
            setSelectedPaymentMethods([]);
            setPaymentDetails({});
            setPaymentConfig({});
            setPayerData({ is_self_payer: true, payer_id: null });
          }
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Selecione uma proposta aprovada para gerar a minuta:</p>
              {approvedProposals.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
                  <p className="font-medium text-foreground">Nenhuma proposta aprovada ainda</p>
                  <p className="max-w-md text-sm text-muted-foreground">O contrato sai de uma proposta aprovada. Monte a proposta da cliente, aprove e volte aqui para gerar o contrato.</p>
                  <BrandButton className="mt-2" onClick={() => { setCreateDialog(false); navigate('/clinic/proposals?openNew=1'); }}>
                    <Plus className="h-4 w-4" /> Criar proposta
                  </BrandButton>
                </div>
              ) : (
                <Select value={selectedProposal} onValueChange={setSelectedProposal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar proposta" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedProposals.map((proposal) => (
                      <SelectItem key={proposal.id} value={proposal.id}>
                        {proposal.proposal_number} - {proposal.patients?.full_name} (R$ {Number(proposal.final_amount).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {approvedProposals.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  A cliente ainda não tem proposta?{' '}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => { setCreateDialog(false); navigate('/clinic/proposals?openNew=1'); }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Criar proposta
                  </button>
                </p>
              )}
            </div>

            {selectedProposalData && !selectedProposalData.patients?.date_of_birth && (
              <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <Label htmlFor="contract-birth-date" className="text-sm font-medium text-amber-900">Data de nascimento do paciente (obrigatória)</Label>
                <Input id="contract-birth-date" type="date" max={new Date().toISOString().slice(0, 10)} value={birthDateInput}
                  onChange={(e) => setBirthDateInput(e.target.value)} className="max-w-[220px] bg-white" />
                <p className="text-xs text-amber-800">O cadastro de {selectedProposalData.patients?.full_name || 'paciente'} está sem data de nascimento. Ela é usada para confirmar a identidade na assinatura pelo celular e fica salva no cadastro.</p>
              </div>
            )}

            {approvedProposals.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <ContractPaymentConfigurator
                paymentCondition={paymentCondition}
                setPaymentCondition={setPaymentCondition}
                selectedPaymentMethods={selectedPaymentMethods}
                togglePaymentMethod={togglePaymentMethod}
                paymentConfig={paymentConfig}
                setPaymentConfig={(updater) => setPaymentConfig((current) => updater(current))}
                paymentDetails={paymentDetails}
                setPaymentDetails={(updater) => setPaymentDetails((current) => updater(current))}
              />

              <div className="space-y-4 rounded-lg border p-4 bg-card">
                {selectedProposalData && (
                  <PayerSection
                    value={payerData}
                    onChange={setPayerData}
                    patientName={selectedProposalData.patients?.full_name || undefined}
                    payerOptionsOverride={linkedPayerOption ? [linkedPayerOption] : []}
                  />
                )}
                {selectedProposal && selectedProposalData && (
                  <ContractAdvanceSummary
                    total={Number(selectedProposalData.final_amount || 0)}
                    deposits={patientDeposits}
                    apply={applyDeposits}
                    onApplyChange={setApplyDeposits}
                    informed={selectedAmountSum}
                  />
                )}
              </div>
            </div>
            )}

            <div className="flex gap-3">
              <BrandButton variant="outline" onClick={() => setCreateDialog(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton
                onClick={() => createMutation.mutate()}
                className="flex-1"
                disabled={!canGenerateContract}
              >
                {createMutation.isPending ? 'Gerando...' : 'Gerar'}
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewContract && (
        <ContractViewDialog
          contract={viewContract}
          clinicName={clinicName || ''}
          onClose={() => setViewContract(null)}
        />
      )}

      {/* PREVIEW MODAL */}
      <Dialog open={!!previewContract} onOpenChange={(open) => !open && setPreviewContract(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Revisão do Contrato: {previewContract?.contractNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-gray-100 p-8 rounded">
            <div className="bg-white mx-auto shadow max-w-3xl min-h-[800px] p-10 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewContract?.html || '' }} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <BrandButton variant="outline" onClick={() => setPreviewContract(null)} disabled={confirmingEmission}>Cancelar</BrandButton>
            <BrandButton onClick={handleConfirmEmission} disabled={confirmingEmission}>
              {confirmingEmission ? 'Emitindo...' : 'Confirmar e Emitir'}
            </BrandButton>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
