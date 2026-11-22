import { useParams, useNavigate } from 'react-router-dom';
import { usePatientDepositCredit } from '@/hooks/usePatientDepositCredit';
import { advanceDetailsText, contractAmounts } from '@/lib/finance/deposit';
import { compressImage } from '@/lib/photos/compress';
import { logAccess } from '@/lib/accessLog';
import { useUrlState } from '@/hooks/useUrlState';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { parsePatientNotes, getLatestPatientNoteText, serializePatientNotes, type PatientNoteEntry } from '@/lib/patients/notesHistory';
import { type PayerData } from '@/components/patient/PayerSection';
import {
  paymentConditionLabels,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod, isInstallmentMethod
} from '@/components/contracts/ContractPaymentConfigurator';
import type { Database } from '@/integrations/supabase/types';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import { onlyDigits, patientSaveErrorMessage, type PatientFieldErrors } from '@/lib/patients/validation';
import { usePatientDuplicateCheck } from '@/hooks/usePatientDuplicateCheck';
import { buildContractPaymentNotes, upsertContractFinancialForecast } from '@/lib/contractFinance';
import { functionError } from '@/lib/errors';
import { useClinicPlan } from '@/hooks/useClinicPlan';
import { isLeanPlan } from '@/lib/plans';

const PATIENT_FILES_BUCKET = 'patient-files';

type PatientEditForm = {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  date_of_birth: string;
  gender: string;
  zip_code: string;
  address: string;
  address_number: string;
  address_complement: string;
  city: string;
  state: string;
  notes: string;
};

function getPatientFilePath(value?: string | null) {
  if (!value) return null;
  if (!value.startsWith('http')) return value.replace(/^patient-files:/, '');

  try {
    const marker = `/storage/v1/object/public/${PATIENT_FILES_BUCKET}/`;
    const url = new URL(value);
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return value;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return value;
  }
}

type MetricRow = Database['public']['Tables']['patient_metrics']['Row'];
type ProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'proposal_number' | 'status' | 'final_amount' | 'created_at' | 'valid_until' | 'patient_id'>;

/** Estado, dados e ações da tela (a tela em PatientDetailPage.tsx só desenha). */
export function usePatientDetailPage() {
  const [patientTab, setPatientTab] = useUrlState<string>('aba', 'data');
  // Essencial: sem Satisfação/Feedback.
  const { modules } = useClinicPlan();
  const lean = isLeanPlan(modules);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clinicId, role } = useUserRole();
  useEffect(() => { logAccess(id, 'record_view'); }, [id]);
  const queryClient = useQueryClient();
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PatientEditForm>({
    full_name: '',
    email: '',
    phone: '',
    cpf: '',
    date_of_birth: '',
    gender: '',
    zip_code: '',
    address: '',
    address_number: '',
    address_complement: '',
    city: '',
    state: '',
    notes: '',
  });
  const [editErrors, setEditErrors] = useState<PatientFieldErrors>({});
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const duplicates = usePatientDuplicateCheck(clinicId, id);
  const [contractDialogProposal, setContractDialogProposal] = useState<ProposalRow | null>(null);
  // Sinal pago (Pix) entra no contrato como adiantamento: valor a pagar = total - adiantamento.
  const depositCredit = usePatientDepositCredit(clinicId, id);
  const [applyDeposits, setApplyDeposits] = useState(true);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>('cash');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({});
  const [payerData, setPayerData] = useState<PayerData>({ is_self_payer: true, payer_id: null });
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['patient-appointments', id],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*, treatments(name)')
        .eq('patient_id', id!).order('start_time', { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['patient-sessions', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_records').select('*, treatments(name)')
        .eq('patient_id', id!).order('performed_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['patient-photos', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_photos').select('*')
        .eq('patient_id', id!).order('taken_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['patient-metrics', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_metrics').select('*')
        .eq('patient_id', id!).order('recorded_at', { ascending: true });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['patient-feedbacks', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback').select('*, session_records(performed_at, treatments(name))')
        .eq('patient_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['patient-proposals', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, created_at, valid_until, patient_id')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['patient-contracts', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contracts')
        .select('id, proposal_id, contract_number, process_status, status, created_at, signed_pdf_url, pdf_storage_path, proposals(proposal_number, final_amount)')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: portalAccess } = useQuery({
    queryKey: ['patient-portal-access', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_users').select('*')
        .eq('patient_id', id!).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    let active = true;

    const resolveAvatar = async () => {
      if (!patient?.avatar_url) {
        setAvatarDisplayUrl(null);
        return;
      }

      const filePath = getPatientFilePath(patient.avatar_url);
      if (!filePath) {
        setAvatarDisplayUrl(null);
        return;
      }

      if (filePath.startsWith('http') && !filePath.includes(`/storage/v1/object/public/${PATIENT_FILES_BUCKET}/`)) {
        setAvatarDisplayUrl(filePath);
        return;
      }

      const { data, error } = await supabase.storage
        .from(PATIENT_FILES_BUCKET)
        .createSignedUrl(filePath, 60 * 60);

      if (!active) return;
      setAvatarDisplayUrl(error ? null : data?.signedUrl || null);
    };

    void resolveAvatar();

    return () => {
      active = false;
    };
  }, [patient?.avatar_url]);

  const handleGrantPortalAccess = async () => {
    if (!patient?.email || !clinicId || !id) {
      toast.error('Paciente precisa ter um e-mail cadastrado');
      return;
    }
    setGrantingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-patient', {
        body: { patientId: id, clinicId },
      });
      if (error) throw await functionError(error);
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Acesso ao portal concedido!');
      queryClient.invalidateQueries({ queryKey: ['patient-portal-access', id] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao conceder acesso';
      toast.error(message);
    } finally {
      setGrantingAccess(false);
    }
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!file || !clinicId || !id) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem');
      return;
    }

    setUploadingAvatar(true);
    try {
      const img = await compressImage(file, 512);
      const filePath = `${clinicId}/${id}/avatar-${Date.now()}.${img.ext}`;
      const { error: uploadError } = await supabase.storage.from(PATIENT_FILES_BUCKET).upload(filePath, img.blob, {
        contentType: img.type,
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('patients')
        .update({ avatar_url: filePath })
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (updateError) throw updateError;

      const { data: signedData } = await supabase.storage
        .from(PATIENT_FILES_BUCKET)
        .createSignedUrl(filePath, 60 * 60);
      setAvatarDisplayUrl(signedData?.signedUrl || null);
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      toast.success('Foto do paciente atualizada');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar foto';
      toast.error(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openEditPatient = () => {
    if (!patient) return;
    setEditForm({
      full_name: patient.full_name || '',
      email: patient.email || '',
      phone: patient.phone || '',
      cpf: patient.cpf || '',
      date_of_birth: patient.date_of_birth || '',
      gender: patient.gender || '',
      zip_code: patient.zip_code || '',
      address: patient.address || '',
      address_number: patient.address_number || '',
      address_complement: patient.address_complement || '',
      city: patient.city || '',
      state: patient.state || '',
      notes: getLatestPatientNoteText(patient.notes) || '',
    });
    setEditErrors({});
    duplicates.reset();
    setEditOpen(true);
  };

  const updatePatientMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !id) throw new Error('Paciente não encontrado');
      if (!editForm.full_name.trim()) throw new Error('Nome é obrigatório');

      const trimmedNotes = editForm.notes.trim();
      let updatedNotesPayload = patient?.notes || null;
      if (trimmedNotes !== getLatestPatientNoteText(patient?.notes)) {
        if (!trimmedNotes) {
          updatedNotesPayload = null;
        } else {
          const existingNotes = parsePatientNotes(patient?.notes);
          const newEntry: PatientNoteEntry = {
            id: crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}`,
            date: new Date().toISOString(),
            author_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Atendente',
            author_role: role === 'professional' ? 'Profissional' : role === 'admin' ? 'Administrador' : 'Recepção',
            text: trimmedNotes,
          };
          updatedNotesPayload = serializePatientNotes([newEntry, ...existingNotes]);
        }
      }

      const payload = {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        cpf: onlyDigits(editForm.cpf) || null,
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        zip_code: editForm.zip_code.trim() || null,
        address: editForm.address.trim() || null,
        address_number: editForm.address_number.trim() || null,
        address_complement: editForm.address_complement.trim() || null,
        city: editForm.city.trim() || null,
        state: editForm.state.trim() || null,
        notes: updatedNotesPayload,
      };

      const { error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (error) throw error;

      await supabase
        .from('leads')
        .update({
          full_name: payload.full_name,
          phone: payload.phone,
          cpf: payload.cpf,
          email: payload.email,
          birth_date: payload.date_of_birth,
          zip_code: payload.zip_code,
          address: payload.address,
          city: payload.city,
          state: payload.state,
          notes: payload.notes,
        })
        .eq('clinic_id', clinicId)
        .eq('patient_id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['crm-leads'] });
      setEditOpen(false);
      toast.success('Dados do paciente atualizados');
    },
    onError: (err: Error) => {
      toast.error(patientSaveErrorMessage(err));
    },
  });

  const resetContractDialog = () => {
    setContractDialogProposal(null);
    setPaymentCondition('cash');
    setSelectedPaymentMethods([]);
    setPaymentDetails({});
    setPaymentConfig({});
    setPayerData({ is_self_payer: true, payer_id: null });
  };

  const openContractDialog = (proposal: ProposalRow) => {
    setContractDialogProposal(proposal);
    setPayerData({
      is_self_payer: patient?.is_self_payer ?? true,
      payer_id: patient?.payer_id || null,
      new_payer: patient?.is_self_payer === false ? { name: '', cpf: '', birth_date: '' } : undefined,
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

  const generateContractMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !id || !contractDialogProposal) throw new Error('Selecione uma proposta aprovada.');
      if (selectedPaymentMethods.length === 0) throw new Error('Selecione ao menos uma forma de pagamento.');

      const usedDeposits = applyDeposits ? depositCredit : [];
      const proposalAmount = contractAmounts(Number(contractDialogProposal.final_amount || 0), usedDeposits).due;
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
          `A soma das formas de pagamento (R$ ${totalInformed.toFixed(2)}) deve ser igual ou maior ao valor ${usedDeposits.length ? 'a pagar' : 'da proposta'} (R$ ${proposalAmount.toFixed(2)}).`
        );
      }

      const existingContract = contracts.find((contract) => contract.proposal_id === contractDialogProposal.id);
      if (existingContract) {
        throw new Error('Esta proposta já possui contrato vinculado.');
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
      const paymentNotes = [
        buildContractPaymentNotes(
          selectedPaymentMethods,
          paymentConfig,
          paymentDetails,
          paymentConditionLabels[paymentCondition]
        ),
        ...(usedDeposits.length ? [`${advanceDetailsText(usedDeposits)}. Abatido do valor total.`] : []),
      ].join('\n');

      const { data: insertedContract, error } = await supabase
        .from('contracts')
        .insert({
          clinic_id: clinicId,
          patient_id: id,
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
        if (usedDeposits.length) {
          const { error: depError } = await supabase.rpc('deposit_apply_to_contract', {
            p_contract_id: insertedContract.id, p_deposit_ids: usedDeposits.map((d) => d.id),
          });
          if (depError) toast.error(`Contrato gerado, mas o sinal não foi abatido: ${depError.message}`);
        }
      }

      const { error: patientError } = await supabase
        .from('patients')
        .update({
          is_self_payer: payerData.is_self_payer,
          payer_id: payerData.is_self_payer ? null : resolvedPayerId,
        })
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (patientError) throw patientError;

      return contractNumber;
    },
    onSuccess: (contractNumber) => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patient-contracts', id] });
      queryClient.invalidateQueries({ queryKey: ['patient-proposals', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      toast.success(`Contrato ${contractNumber} gerado`);
      resetContractDialog();
    },
    onError: (err: Error) => {
      const message = err instanceof Error ? err.message : 'Erro ao gerar contrato';
      toast.error(message);
    },
  });

  const handleEditCepChange = async (value: string) => {
    const zipCode = formatCep(value);
    setEditForm((current) => ({ ...current, zip_code: zipCode }));

    if (zipCode.replace(/\D/g, '').length !== 8) return;

    try {
      const address = await lookupCepAddress(zipCode);
      if (!address) {
        toast.error('CEP não encontrado');
        return;
      }
      setEditForm((current) => {
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
      toast.error(message);
    }
  };

  // Group metrics by type for evolution chart
  const metricTypes = [...new Set(metrics.map((m: MetricRow) => m.metric_type))];
  const metricLabels: Record<string, string> = {
    weight: 'Peso', waist: 'Cintura', hip: 'Quadril', arm: 'Braço',
    thigh: 'Coxa', abdomen: 'Abdômen',
  };

  return {
    depositCredit,
    applyDeposits,
    setApplyDeposits,
    patientTab,
    setPatientTab,
    modules,
    lean,
    id,
    navigate,
    user,
    clinicId,
    role,
    queryClient,
    grantingAccess,
    setGrantingAccess,
    uploadingAvatar,
    setUploadingAvatar,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    editErrors,
    setEditErrors,
    checkingDuplicates,
    setCheckingDuplicates,
    duplicates,
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
    avatarDisplayUrl,
    setAvatarDisplayUrl,
    avatarInputRef,
    patient,
    isLoading,
    appointments,
    sessions,
    photos,
    metrics,
    feedbacks,
    proposals,
    contracts,
    portalAccess,
    handleGrantPortalAccess,
    handleAvatarUpload,
    openEditPatient,
    updatePatientMutation,
    resetContractDialog,
    openContractDialog,
    togglePaymentMethod,
    generateContractMutation,
    handleEditCepChange,
    metricTypes,
    metricLabels,
  };
}
