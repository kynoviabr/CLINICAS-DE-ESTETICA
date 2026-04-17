import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generateContractPDF } from '@/lib/contractPDF';
import { useToast } from '@/hooks/use-toast';
import { FileSignature, Eye, Search, Filter, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContractStatusBadge, processStatusMap } from '@/components/contracts/ContractStatusBadge';
import { ComplianceDashboard } from '@/components/contracts/ComplianceDashboard';
import { ContractViewDialog } from '@/components/contracts/ContractViewDialog';
import { generateContractHTML } from '@/components/contracts/ContractTemplateGenerator';

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

  // Fetch contracts and auto-check overdue
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts', clinicId, filterStatus, search],
    queryFn: async () => {
      let q = supabase
        .from('contracts')
        .select('*, patients(full_name, cpf), proposals(proposal_number, final_amount), payers(name, cpf)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      if (filterStatus !== 'all') q = q.eq('process_status', filterStatus as any);
      if (search) q = q.ilike('contract_number', `%${search}%`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!clinicId,
  });

  // Auto-mark overdue contracts
  useEffect(() => {
    const now = new Date();
    const overdueIds = contracts
      .filter((c: any) => c.process_status === 'pending_confirmation' && c.confirmation_deadline && new Date(c.confirmation_deadline) < now)
      .map((c: any) => c.id);
    if (overdueIds.length > 0) {
      Promise.all(overdueIds.map((id: string) =>
        supabase.from('contracts').update({ process_status: 'overdue' as any }).eq('id', id)
      )).then(() => qc.invalidateQueries({ queryKey: ['contracts'] }));
    }
  }, [contracts, qc]);

  // Approved proposals without contracts
  const { data: approvedProposals = [] } = useQuery({
    queryKey: ['approved-proposals-no-contract', clinicId],
    queryFn: async () => {
      const { data: allContracts } = await supabase.from('contracts').select('proposal_id').eq('clinic_id', clinicId!);
      const linkedIds = (allContracts || []).map((c: any) => c.proposal_id).filter(Boolean);
      let q = supabase.from('proposals')
        .select('id, proposal_number, patient_id, final_amount, patients(full_name, cpf, date_of_birth, payer_id, is_self_payer)')
        .eq('clinic_id', clinicId!).eq('status', 'accepted');
      if (linkedIds.length > 0) q = q.not('id', 'in', `(${linkedIds.join(',')})`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!clinicId && createDialog,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const proposal = approvedProposals.find((p: any) => p.id === selectedProposal);
      if (!proposal) throw new Error('Selecione uma proposta');

      const patient = proposal.patients as any;

      // Fetch treatment info
      const { data: items } = await supabase.from('proposal_items')
        .select('quantity, treatments(name, num_sessions)')
        .eq('proposal_id', proposal.id);
      const treatmentNames = (items || []).map((i: any) => (i.treatments as any)?.name || '').filter(Boolean).join(', ');
      const totalSessions = (items || []).reduce((sum: number, i: any) => sum + ((i.treatments as any)?.num_sessions || 1) * (i.quantity || 1), 0);

      // Fetch payer
      let payerName: string | null = null;
      let payerCpf: string | null = null;
      let payerBirthDate: string | null = null;
      if (!patient?.is_self_payer && patient?.payer_id) {
        const { data: payer } = await supabase.from('payers').select('name, cpf, birth_date').eq('id', patient.payer_id).maybeSingle();
        if (payer) { payerName = payer.name; payerCpf = payer.cpf; payerBirthDate = payer.birth_date; }
      }

      // Fetch clinic settings for CNPJ
      const { data: clinicData } = await supabase.from('clinics').select('city').eq('id', clinicId!).maybeSingle();
      const { data: cnpjSetting } = await supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', 'cnpj').maybeSingle();
      const clinicCnpj = cnpjSetting?.value || '';
      const clinicCity = clinicData?.city || '';

      // Fetch latest anamnesis
      const { data: anamnesis } = await supabase.from('patient_anamneses')
        .select('id').eq('patient_id', proposal.patient_id).eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      const now = new Date();
      const num = `CONT-${format(now, 'yyyyMM')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
      const formattedDate = format(now, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

      const templateData = {
        clinicName: clinicName || 'Clínica',
        clinicCnpj,
        clinicCity,
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
        contractNumber: num,
        date: now.toISOString(),
      };

      // Generate HTML template
      const html = generateContractHTML(templateData);

      // Generate PDF and upload to storage
      const pdfBlob = generateContractPDF({ ...templateData, formattedDate });
      const pdfPath = `${clinicId}/${proposal.patient_id}/contratos/${num}.pdf`;
      const { error: uploadErr } = await supabase.storage.from('contracts').upload(pdfPath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(pdfPath);

      // Insert contract record
      const { error } = await supabase.from('contracts').insert({
        clinic_id: clinicId!,
        patient_id: proposal.patient_id,
        proposal_id: proposal.id,
        payer_id: patient?.payer_id || null,
        contract_number: num,
        status: 'draft' as any,
        process_status: 'pending_upload' as any,
        template_html: html,
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
      toast({ title: 'Contrato gerado com PDF!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader title="Contratos" description="Gestão de contratos e compliance">
        <BrandButton onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" /> Gerar Contrato
        </BrandButton>
      </PageHeader>

      <ComplianceDashboard contracts={contracts} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº do contrato..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[220px]">
            <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending_upload">Aguardando Upload</SelectItem>
            <SelectItem value="pending_confirmation">Confirmar Upload</SelectItem>
            <SelectItem value="overdue">Atrasados</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && contracts.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <FileSignature className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum contrato</h3>
          <p className="text-sm text-muted-foreground">Contratos são gerados a partir de propostas aprovadas</p>
        </div>
      )}

      {!isLoading && contracts.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nº Contrato</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contracts.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{c.contract_number}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{(c.patients as any)?.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">R$ {Number((c.proposals as any)?.final_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3"><ContractStatusBadge status={c.process_status} /></td>
                    <td className="px-4 py-3">
                      <BrandButton variant="ghost" size="sm" onClick={() => setViewContract(c)}><Eye className="w-3.5 h-3.5" /></BrandButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Gerar Contrato</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Selecione uma proposta aprovada:</p>
            {approvedProposals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma proposta aprovada disponível</p>
            ) : (
              <Select value={selectedProposal} onValueChange={setSelectedProposal}>
                <SelectTrigger><SelectValue placeholder="Selecionar proposta" /></SelectTrigger>
                <SelectContent>
                  {approvedProposals.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.proposal_number} - {(p.patients as any)?.full_name} (R$ {Number(p.final_amount).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-3">
              <BrandButton variant="outline" onClick={() => setCreateDialog(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton onClick={() => createMutation.mutate()} className="flex-1" disabled={!selectedProposal || createMutation.isPending}>
                {createMutation.isPending ? 'Gerando...' : 'Gerar Contrato'}
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
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
