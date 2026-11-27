import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ContractStatusBadge } from './ContractStatusBadge';
import { AmendmentHistory, ApproveReviewDialog, PatientDataAmendDialog, PaymentAmendDialog, PendingAmendmentCard, ItemsAmendDialog, useContractAmendments } from './ContractAmendments';
import ContractSignaturePanel from './ContractSignaturePanel';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Copy, ExternalLink, FileUp, TriangleAlert, UserPen, CreditCard, Package } from 'lucide-react';
import { DocumentOutputButtons } from '@/components/documents/DocumentOutputButtons';
import type { DocumentOutput } from '@/lib/documents/output';
import { buildSignatureSheet } from '@/lib/documents/signatureSheet';
import { loadAcceptances } from '@/lib/documents/acceptances';
import { sanitizeContractTemplate } from '@/lib/contractTemplateRenderer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type ContractDialogData = Database['public']['Tables']['contracts']['Row'] & {
  patients?: { full_name?: string | null } | null;
  proposals?: { proposal_number?: string | null; final_amount?: number | null } | null;
};

interface Props {
  contract: ContractDialogData;
  clinicName: string;
  onClose: () => void;
}

type AuditLogRow = {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

import { PAYMENT_METHOD_NAMES, isInstallmentMethod, paymentMethodOptions, type PaymentMethod } from '@/components/contracts/ContractPaymentConfigurator';
type PaymentCondition = 'cash' | 'installments';
type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'cabal' | 'diners' | 'outro';
type ReviewPaymentConfig = Partial<Record<PaymentMethod, { amount: string; installments?: string; installmentAmount?: string; brand?: CardBrand; last4?: string }>>;
type TimelineEvent = { key: string; label: string; date: Date; tone: string };

const paymentConditionLabels: Record<PaymentCondition, string> = {
  cash: 'À vista',
  installments: 'Parcelado',
};


const cardBrandOptions: Array<{ value: CardBrand; label: string }> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'Amex' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'cabal', label: 'Cabal' },
  { value: 'diners', label: 'Diners' },
  { value: 'outro', label: 'Outro' },
];

const parseContractNotes = (rawNotes?: string | null) => {
  const notes = rawNotes || '';
  const conditionMatch = notes.match(/Condição:\s*([^.\n]+)/i);
  const methodsMatch = notes.match(/Formas:\s*([^.\n]+)/i);

  const parsedCondition: PaymentCondition =
    conditionMatch?.[1]?.toLowerCase().includes('parcel') ? 'installments' : 'cash';

  const methodsPart = methodsMatch?.[1] || '';
  const selectedMethods: PaymentMethod[] = [];
  const details: Partial<Record<PaymentMethod, string>> = {};
  const config: ReviewPaymentConfig = {};

  methodsPart
    // Separa por forma ("| 3x de" continua na mesma forma).
    .split(/\s*\|\s*(?=(?:dinheiro|pix|cart[aã]o|boleto|transfer[eê]ncia|d[eé]bito|cr[eé]dito)\b)/i)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [labelPart, ...detailParts] = entry.split(':');
      const label = labelPart.trim().toLowerCase();
      const detail = detailParts.join(':').trim();

      const method = (Object.keys(PAYMENT_METHOD_NAMES) as PaymentMethod[]).find((m) => PAYMENT_METHOD_NAMES[m].toLowerCase() === label);
      if (!method) return;
      selectedMethods.push(method);
      if (detail) details[method] = detail;

      const amountMatch = entry.match(/R\$\s*([\d.,]+)/i);
      const installmentsMatch = entry.match(/(\d+)\s*x\s*de/i);
      if (amountMatch) {
        const normalized = amountMatch[1].replace(/\./g, '').replace(',', '.');
        config[method] = {
          ...(config[method] || {}),
          amount: Number(normalized).toString(),
          installments: installmentsMatch?.[1] || config[method]?.installments || '',
          installmentAmount: config[method]?.installmentAmount || '',
        };
      }
    });

  return {
    condition: parsedCondition,
    methods: [...new Set(selectedMethods)],
    details,
    config,
  };
};

export function ContractViewDialog({ contract, clinicName, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const c = contract;
  const [patientDlg, setPatientDlg] = useState(false);
  const [approveDlg, setApproveDlg] = useState(false);
  const [paymentDlg, setPaymentDlg] = useState(false);
  const [itemsDlg, setItemsDlg] = useState(false);
  const { data: amendments = [] } = useContractAmendments(c.id);
  const pendingAmendment = amendments.find((a) => a.status === 'pending_acceptance');
  const parsed = parseContractNotes(c.notes);
  const [isEditing, setIsEditing] = useState(false);
  const [reviewPaymentCondition, setReviewPaymentCondition] = useState<PaymentCondition>(parsed.condition);
  const [reviewMethods, setReviewMethods] = useState<PaymentMethod[]>(parsed.methods);
  const [reviewDetails, setReviewDetails] = useState<Partial<Record<PaymentMethod, string>>>(parsed.details);
  const [reviewConfig, setReviewConfig] = useState<ReviewPaymentConfig>(parsed.config);
  const [reviewNotes, setReviewNotes] = useState(c.notes || '');
  const [savingReview, setSavingReview] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [userNamesById, setUserNamesById] = useState<Record<string, string>>({});

  const refreshContracts = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    onClose();
  };

  useEffect(() => {
    let mounted = true;
    const loadAudit = async () => {
      setLoadingAudit(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, user_id, old_data, new_data')
        .eq('clinic_id', c.clinic_id)
        .eq('table_name', 'contracts')
        .eq('record_id', c.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        if (mounted) {
          setLoadingAudit(false);
        }
        return;
      }

      const rows = ((data || []) as unknown as AuditLogRow[]).map((row) => ({
        ...row,
        old_data: row.old_data || null,
        new_data: row.new_data || null,
      }));

      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: professionalsData } = await supabase
          .from('professionals')
          .select('user_id, full_name')
          .eq('clinic_id', c.clinic_id)
          .in('user_id', userIds);

        if (mounted) {
          const map = ((professionalsData || []) as Array<{ user_id: string; full_name: string }>).reduce<Record<string, string>>(
            (acc, item) => {
              acc[item.user_id] = item.full_name;
              return acc;
            },
            {}
          );
          setUserNamesById(map);
        }
      }

      if (mounted) {
        setAuditLogs(rows);
        setLoadingAudit(false);
      }
    };

    loadAudit();

    return () => {
      mounted = false;
    };
  }, [c.clinic_id, c.id]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${c.clinic_id}/${c.patient_id}/signed/${c.contract_number}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;


      const { error } = await supabase
        .from('contracts')
        .update({
          signed_pdf_url: path,
          signed_at: new Date().toISOString(),
          process_status: 'pending_confirmation',
        })
        .eq('id', c.id);

      if (error) throw error;

      toast({ title: 'Documento assinado arquivado!' });
      refreshContracts();
    } catch (err: unknown) {
      toast({ title: 'Erro no upload', description: err instanceof Error ? err.message : 'Falha inesperada', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const activateContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        upload_confirmed: true,
        confirmed_at: new Date().toISOString(),
        process_status: 'confirmed',
        status: 'active',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato ativado!' });
    refreshContracts();
  };

  const cancelContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'cancelled',
        process_status: 'cancelled',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato cancelado' });
    refreshContracts();
  };

  /** Contrato para "Baixar PDF" e "Imprimir" (com a assinatura eletrônica, se já houver). */
  const contractDocument = async (): Promise<DocumentOutput> => {
    const html = sanitizeContractTemplate(c.template_snapshot_html || c.template_html || '');
    const { records, documentHash } = await loadAcceptances('contract', c.id);
    const label = `Contrato nº ${c.contract_number || '(sem número)'}`;
    return {
      html: html + buildSignatureSheet({ documentLabel: label, documentHash: documentHash || c.document_hash, records, pendingText: 'Aguardando assinatura da cliente' }),
      title: `Contrato ${c.contract_number || ''}`.trim(),
      filename: `Contrato-${c.contract_number || 'minuta'}`,
    };
  };

  const toggleReviewMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (reviewMethods.includes(method)) return;
      setReviewMethods((current) => [...current, method]);
      return;
    }

    setReviewMethods((current) => current.filter((item) => item !== method));
    setReviewDetails((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
    setReviewConfig((current) => {
      const next = { ...current };
      delete next[method];
      return next;
    });
  };

  const saveReview = async () => {
    if (reviewMethods.length === 0) {
      toast({ title: 'Selecione ao menos uma forma de pagamento', variant: 'destructive' });
      return;
    }
    const hasInvalidAmount = reviewMethods.some((method) => Number(reviewConfig[method]?.amount || 0) <= 0);
    if (hasInvalidAmount) {
      toast({ title: 'Informe valor válido para cada forma selecionada', variant: 'destructive' });
      return;
    }
    const hasInvalidInstallments = reviewMethods
      .filter((method) => method === 'card' || method === 'boleto')
      .some((method) => Number(reviewConfig[method]?.installments || 0) <= 0);
    if (hasInvalidInstallments) {
      toast({ title: 'Cartão e boleto exigem número de parcelas', variant: 'destructive' });
      return;
    }
    if (reviewMethods.includes('card')) {
      const brand = reviewConfig.card?.brand;
      const last4 = (reviewConfig.card?.last4 || '').replace(/\D/g, '');
      if (!brand) {
        toast({ title: 'Selecione a bandeira do cartão', variant: 'destructive' });
        return;
      }
      if (last4.length !== 4) {
        toast({ title: 'Informe os 4 últimos dígitos do cartão', variant: 'destructive' });
        return;
      }
    }

    const paymentTermsDescription = reviewMethods
      .map((method) => {
        const label = PAYMENT_METHOD_NAMES[method] || method;
        const amount = Number(reviewConfig[method]?.amount || 0);
        const installments = Number(reviewConfig[method]?.installments || 0);
        const configuredInstallmentAmount = Number(reviewConfig[method]?.installmentAmount || 0);
        const installmentAmount = configuredInstallmentAmount > 0
          ? configuredInstallmentAmount
          : installments > 0
            ? amount / installments
            : 0;
        const details = reviewDetails[method]?.trim();
        if (method === 'card' || method === 'boleto') {
          const brandLabel = method === 'card'
            ? cardBrandOptions.find((option) => option.value === reviewConfig.card?.brand)?.label
            : '';
          const last4 = method === 'card' ? (reviewConfig.card?.last4 || '').replace(/\D/g, '') : '';
          const trace = method === 'card' ? ` · ${brandLabel || 'Bandeira'} · finais ${last4}` : '';
          const base = `${label}: valor R$ ${amount.toFixed(2)} | ${installments}x de R$ ${installmentAmount.toFixed(2)}${trace}`;
          return details ? `${base} (${details})` : base;
        }
        const base = `${label}: R$ ${amount.toFixed(2)}`;
        return details ? `${base} (${details})` : base;
      })
      .join(' | ');

    const paymentTermsText = `Condição: ${paymentConditionLabels[reviewPaymentCondition]}. Formas: ${paymentTermsDescription}.`;
    const mergedNotes = reviewNotes?.trim()
      ? `${paymentTermsText}\n${reviewNotes.trim()}`
      : paymentTermsText;

    setSavingReview(true);
    const { error } = await supabase
      .from('contracts')
      .update({
        notes: mergedNotes,
        process_status: c.process_status === 'confirmed' ? 'overdue' : c.process_status,
      })
      .eq('id', c.id);

    setSavingReview(false);
    if (error) {
      toast({ title: 'Erro ao salvar revisão', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Revisão salva', description: 'Parâmetros do contrato atualizados.' });
    refreshContracts();
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: successMessage });
    } catch {
      toast({ title: 'Não foi possível copiar agora', variant: 'destructive' });
    }
  };

  const reviewAuditLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        const newNotes = typeof log.new_data?.notes === 'string' ? log.new_data.notes : '';
        const oldNotes = typeof log.old_data?.notes === 'string' ? log.old_data.notes : '';
        return (
          newNotes.includes('Condição:') ||
          oldNotes.includes('Condição:') ||
          log.action.toLowerCase().includes('update')
        );
      }),
    [auditLogs]
  );

  const hasSignedFile = Boolean(c.signed_pdf_url);
  const isGenerated = c.process_status === 'pending_upload';
  const isReadyToActivate = c.process_status === 'pending_confirmation';
  const isCancelled = c.process_status === 'cancelled';
  const isActive = c.process_status === 'confirmed';
  const timelineEvents = [
    c.created_at
      ? {
          key: 'created',
          label: 'Contrato gerado',
          date: new Date(c.created_at),
          tone: 'bg-slate-100 text-slate-700',
        }
      : null,
    c.signed_at
      ? {
          key: 'signed',
          label: 'Arquivo assinado recebido',
          date: new Date(c.signed_at),
          tone: 'bg-amber-100 text-amber-700',
        }
      : null,
    c.confirmed_at
      ? {
          key: 'confirmed',
          label: 'Contrato ativado',
          date: new Date(c.confirmed_at),
          tone: 'bg-emerald-100 text-emerald-700',
        }
      : null,
    c.process_status === 'cancelled'
      ? {
          key: 'cancelled',
          label: 'Contrato cancelado',
          date: c.updated_at ? new Date(c.updated_at) : c.created_at ? new Date(c.created_at) : new Date(),
          tone: 'bg-rose-100 text-rose-700',
        }
      : null,
  ]
    .filter((event): event is TimelineEvent => event !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const displayHtml = contract?.template_snapshot_html || contract?.template_html;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* Topo: número, status e dados principais */}
        <div className="border-b px-5 pb-4 pt-5 sm:px-6">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-3 pr-8">
              <span>Contrato {c.contract_number}</span>
              <ContractStatusBadge status={c.process_status} />
            </DialogTitle>
          </DialogHeader>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Paciente</dt><dd className="truncate font-medium">{c.patients?.full_name || '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Proposta</dt><dd className="font-medium">{c.proposals?.proposal_number || '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="font-semibold">R$ {Number(c.proposals?.final_amount || 0).toFixed(2)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Criado em</dt><dd className="font-medium">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</dd></div>
          </dl>
        </div>

        {/* Corpo: à esquerda o que fazer agora; à direita o histórico */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {c.process_status === 'overdue' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
            <span className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> Este contrato precisa de revisão antes de seguir.</span>
            <BrandButton size="sm" onClick={() => setApproveDlg(true)}><CheckCircle2 className="h-4 w-4" /> Aprovar revisão</BrandButton>
          </div>
        )}
        <PatientDataAmendDialog contractId={c.id} patientId={c.patient_id} open={patientDlg} onOpenChange={setPatientDlg}
          onDone={() => qc.invalidateQueries({ queryKey: ['contracts'] })} />
        <ApproveReviewDialog contractId={c.id} open={approveDlg} onOpenChange={setApproveDlg} onDone={refreshContracts} />
        <PaymentAmendDialog contractId={c.id} open={paymentDlg} onOpenChange={setPaymentDlg} onDone={() => qc.invalidateQueries({ queryKey: ['contracts'] })} />
        <ItemsAmendDialog contractId={c.id} clinicId={c.clinic_id} open={itemsDlg} onOpenChange={setItemsDlg} onDone={() => qc.invalidateQueries({ queryKey: ['contracts'] })} />
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] first:mt-0">
            <div className="min-w-0 space-y-4">
              {pendingAmendment && (
                <PendingAmendmentCard amendment={pendingAmendment} contractId={c.id} patientId={c.patient_id} contractNumber={c.contract_number}
                  clinicName={clinicName} onChanged={() => qc.invalidateQueries({ queryKey: ['contracts'] })} />
              )}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Próximo passo</p>
            <p className="text-muted-foreground">
              {isGenerated && 'Gerar ou coletar o documento assinado e arquivá-lo no contrato.'}
              {isReadyToActivate && 'Revisar o arquivo assinado e ativar o contrato para seguir a operação.'}
              {isActive && 'Contrato ativo e pronto para ser usado no fluxo operacional da clínica.'}
              {isCancelled && 'Contrato encerrado, sem continuidade operacional.'}
              {c.process_status === 'overdue' && 'Revisar o documento e decidir se ele deve ser reenviado ou ativado.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
            {!isCancelled && !isActive && (
              <label className="cursor-pointer">
                <BrandButton size="sm" type="button" disabled={uploading}>
                  <FileUp className="w-4 h-4" />
                  {uploading ? 'Arquivando...' : hasSignedFile ? 'Substituir arquivo' : 'Arquivar assinado'}
                </BrandButton>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.[0]) handleUpload(event.target.files[0]);
                  }}
                />
              </label>
            )}

            {isReadyToActivate && (
              <BrandButton size="sm" onClick={activateContract}>
                <CheckCircle2 className="w-4 h-4" />
                Ativar contrato
              </BrandButton>
            )}

            </div>
          </div>

              <ContractSignaturePanel contract={c} />
          {!isCancelled && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Revisar contrato</p>
                <p className="text-xs text-muted-foreground">Toda revisão fica registrada com motivo, data e quem fez.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <BrandButton size="sm" variant="outline" onClick={() => setPatientDlg(true)}><UserPen className="h-4 w-4" /> Corrigir dados do paciente</BrandButton>
                <BrandButton size="sm" variant="outline" disabled={!!pendingAmendment} title={pendingAmendment ? 'Já existe uma revisão aguardando o aceite do paciente' : undefined} onClick={() => setPaymentDlg(true)}><CreditCard className="h-4 w-4" /> Alterar forma de pagamento</BrandButton>
                <BrandButton size="sm" variant="outline" disabled={!!pendingAmendment} title={pendingAmendment ? 'Já existe uma revisão aguardando o aceite do paciente' : undefined} onClick={() => setItemsDlg(true)}><Package className="h-4 w-4" /> Produtos e serviços</BrandButton>
              </div>
            </div>
          )}


            </div>
            <div className="min-w-0 space-y-4">
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">Linha do tempo</p>
            {timelineEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
            ) : (
              <div className="space-y-2">
                {timelineEvents.map((event) => (
                  <div key={event.key} className="flex items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${event.tone}`}>{event.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(event.date, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

              <AmendmentHistory amendments={amendments} userNames={userNamesById} />
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Alterações registradas</p>
            {loadingAudit ? (
              <p className="text-xs text-muted-foreground">Carregando histórico...</p>
            ) : reviewAuditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem revisões registradas ainda.</p>
            ) : (
              <div className="space-y-2">
                {reviewAuditLogs.map((log) => {
                  const actorName = log.user_id ? userNamesById[log.user_id] || `Usuário ${log.user_id.slice(0, 8)}` : 'Sistema';
                  const notesValue = typeof log.new_data?.notes === 'string' ? log.new_data.notes : null;
                  return (
                    <div key={log.id} className="rounded-md bg-secondary/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{actorName}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{log.action}</p>
                      {notesValue && (
                        <p className="text-xs mt-1 whitespace-pre-wrap text-foreground/80">{notesValue}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>

        {/* Rodapé: documento e ações gerais */}
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-2">
            {displayHtml && (
              <DocumentOutputButtons className="contents" getDocument={contractDocument} />
            )}



            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(c.contract_number || '', 'Número do contrato copiado!')}
              disabled={!c.contract_number}
            >
              <Copy className="w-4 h-4" />
              Copiar número
            </BrandButton>

          </div>
          <div className="flex flex-wrap gap-2">
            {!isCancelled && !isActive && (
              cancelConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3" />
                    Confirmar cancelamento?
                  </span>
                  <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={cancelContract}>
                    Sim
                  </BrandButton>
                  <BrandButton size="sm" variant="outline" onClick={() => setCancelConfirm(false)}>
                    Não
                  </BrandButton>
                </div>
              ) : (
                <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => setCancelConfirm(true)}>
                  Cancelar
                </BrandButton>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
