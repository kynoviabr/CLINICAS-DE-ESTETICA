import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Eye, FileSignature, Filter, Plus, Search, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { ContractViewDialog } from '@/components/contracts/ContractViewDialog';
import { generateContractHTML } from '@/components/contracts/ContractTemplateGenerator';
import { generateContractPDF } from '@/lib/contractPDF';
import { Card, CardContent } from '@/components/ui/card';

export default function ContractsPage() {
  const { clinicId, clinicName } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [viewContract, setViewContract] = useState<any>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState('');

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts', clinicId, filterStatus, search],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*, patients(full_name, cpf), proposals(proposal_number, final_amount), payers(name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') query = query.eq('process_status', filterStatus);
      if (search) query = query.or(`contract_number.ilike.%${search}%,patients.full_name.ilike.%${search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: approvedProposals = [] } = useQuery({
    queryKey: ['approved-proposals-no-contract', clinicId],
    queryFn: async () => {
      const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('proposal_id')
        .eq('clinic_id', clinicId!);

      if (contractsError) throw contractsError;

      const linkedIds = (allContracts || []).map((contract: any) => contract.proposal_id).filter(Boolean);
      let query = supabase
        .from('proposals')
        .select('id, proposal_number, patient_id, final_amount, patients(full_name, cpf, date_of_birth, payer_id, is_self_payer)')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted');

      if (linkedIds.length > 0) query = query.not('id', 'in', `(${linkedIds.join(',')})`);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId && createDialog,
  });

  const summary = useMemo(() => {
    return {
      generated: contracts.filter((contract: any) => contract.process_status === 'pending_upload').length,
      signedReceived: contracts.filter((contract: any) => contract.process_status === 'pending_confirmation').length,
      active: contracts.filter((contract: any) => contract.process_status === 'confirmed').length,
      needsReview: contracts.filter((contract: any) => contract.process_status === 'overdue').length,
    };
  }, [contracts]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const proposal = approvedProposals.find((item: any) => item.id === selectedProposal);
      if (!proposal) throw new Error('Selecione uma proposta');

      const patient = proposal.patients as any;
      const { data: items, error: itemsError } = await supabase
        .from('proposal_items')
        .select('quantity, treatments(name, num_sessions)')
        .eq('proposal_id', proposal.id);
      if (itemsError) throw itemsError;

      const treatmentNames = (items || [])
        .map((item: any) => (item.treatments as any)?.name || '')
        .filter(Boolean)
        .join(', ');
      const totalSessions = (items || []).reduce(
        (sum: number, item: any) => sum + ((item.treatments as any)?.num_sessions || 1) * (item.quantity || 1),
        0
      );

      let payerName: string | null = null;
      let payerCpf: string | null = null;
      let payerBirthDate: string | null = null;
      if (!patient?.is_self_payer && patient?.payer_id) {
        const { data: payer, error: payerError } = await supabase
          .from('payers')
          .select('name, cpf, birth_date')
          .eq('id', patient.payer_id)
          .maybeSingle();
        if (payerError) throw payerError;
        if (payer) {
          payerName = payer.name;
          payerCpf = payer.cpf;
          payerBirthDate = payer.birth_date;
        }
      }

      const [{ data: clinicData, error: clinicError }, { data: cnpjSetting, error: cnpjError }, { data: anamnesis, error: anamneseError }] =
        await Promise.all([
          supabase.from('clinics').select('city').eq('id', clinicId!).maybeSingle(),
          supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', 'cnpj').maybeSingle(),
          supabase
            .from('patient_anamneses')
            .select('id')
            .eq('patient_id', proposal.patient_id)
            .eq('clinic_id', clinicId!)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (clinicError) throw clinicError;
      if (cnpjError) throw cnpjError;
      if (anamneseError) throw anamneseError;

      const now = new Date();
      const contractNumber = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
      const formattedDate = format(now, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

      const templateData = {
        clinicName: clinicName || 'Clínica',
        clinicCnpj: cnpjSetting?.value || '',
        clinicCity: clinicData?.city || '',
        patientName: patient?.full_name || '',
        patientCpf: patient?.cpf || '',
        patientBirthDate: patient?.date_of_birth || null,
        payerName,
        payerCpf,
        payerBirthDate,
        isSelfPayer: patient?.is_self_payer ?? true,
        treatmentName: treatmentNames || 'Tratamento estético',
        sessions: totalSessions,
        proposalNumber: proposal.proposal_number,
        anamnesisId: anamnesis?.id ? anamnesis.id.substring(0, 8).toUpperCase() : null,
        totalValue: Number(proposal.final_amount),
        paymentTerms: 'Conforme condições acordadas entre as partes.',
        contractNumber,
        date: now.toISOString(),
      };

      const templateHtml = generateContractHTML(templateData);
      const pdfBlob = generateContractPDF({ ...templateData, formattedDate });
      const pdfPath = `${clinicId}/${proposal.patient_id}/drafts/${contractNumber}.pdf`;

      const { error: uploadError } = await supabase.storage.from('contracts').upload(pdfPath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(pdfPath);

      const { error } = await supabase.from('contracts').insert({
        clinic_id: clinicId!,
        patient_id: proposal.patient_id,
        proposal_id: proposal.id,
        payer_id: patient?.payer_id || null,
        contract_number: contractNumber,
        status: 'draft',
        process_status: 'pending_upload',
        template_html: templateHtml,
        signed_pdf_url: urlData.publicUrl,
        created_by: user?.id || null,
        start_date: format(now, 'yyyy-MM-dd'),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setCreateDialog(false);
      setSelectedProposal('');
      toast({ title: 'Contrato gerado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div>
      <PageHeader title="Contratos" description="Formalize a venda e acompanhe o ciclo do contrato">
        <BrandButton onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" />
          Gerar contrato
        </BrandButton>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <FileSignature className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.generated}</p>
            <p className="text-xs text-muted-foreground">Gerados</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Upload className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.signedReceived}</p>
            <p className="text-xs text-muted-foreground">Assinados recebidos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.active}</p>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-destructive mb-2" />
            <p className="text-2xl font-bold text-foreground">{summary.needsReview}</p>
            <p className="text-xs text-muted-foreground">Precisam de revisão</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contrato ou paciente..."
            className="pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[220px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending_upload">Gerados</SelectItem>
            <SelectItem value="pending_confirmation">Assinado recebido</SelectItem>
            <SelectItem value="confirmed">Ativos</SelectItem>
            <SelectItem value="overdue">Revisar documento</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, index) => <div key={index} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && contracts.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileSignature className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum contrato</h3>
          <p className="text-sm text-muted-foreground">Contratos são gerados a partir de propostas aprovadas.</p>
        </div>
      )}

      {!isLoading && contracts.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Contrato</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Proposta</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract: any) => (
                  <tr key={contract.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{contract.contract_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(contract.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{(contract.patients as any)?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{(contract.proposals as any)?.proposal_number || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                      R$ {Number((contract.proposals as any)?.final_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusBadge status={contract.process_status} />
                    </td>
                    <td className="px-4 py-3">
                      <BrandButton variant="ghost" size="sm" onClick={() => setViewContract(contract)}>
                        <Eye className="w-3.5 h-3.5" />
                      </BrandButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Selecione uma proposta aprovada para gerar a minuta:</p>
            {approvedProposals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma proposta aprovada disponível</p>
            ) : (
              <Select value={selectedProposal} onValueChange={setSelectedProposal}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar proposta" />
                </SelectTrigger>
                <SelectContent>
                  {approvedProposals.map((proposal: any) => (
                    <SelectItem key={proposal.id} value={proposal.id}>
                      {proposal.proposal_number} - {(proposal.patients as any)?.full_name} (R$ {Number(proposal.final_amount).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-3">
              <BrandButton variant="outline" onClick={() => setCreateDialog(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton onClick={() => createMutation.mutate()} className="flex-1" disabled={!selectedProposal || createMutation.isPending}>
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
    </div>
  );
}
