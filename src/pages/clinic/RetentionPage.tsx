import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { whatsappLink } from '@/lib/proposals/sale';
import { formatBRL } from '@/lib/proposals/sale';
import ReferralsTab from '@/components/retention/ReferralsTab';
import { RETENTION_TABS, groupRetention, retentionMessage, type RetentionKind, type RetentionRow } from '@/lib/retention/lists';

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

/** Retorno de pacientes: quem chamar hoje e quanto as chamadas trouxeram de volta. */
export default function RetentionPage() {
  const { clinicId, clinicName } = useBranding();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<RetentionKind | 'referrals'>('maintenance');

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['retention-lists', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('retention_lists', { p_clinic_id: clinicId! });
      if (error) throw error;
      return (data || []) as RetentionRow[];
    },
  });
  const { data: results = [] } = useQuery({
    queryKey: ['retention-results', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('retention_results', { p_clinic_id: clinicId!, p_from: monthStart(), p_to: today() });
      if (error) throw error;
      return data || [];
    },
  });
  const groups = useMemo(() => groupRetention(rows), [rows]);
  const totals = results.reduce((a, r) => ({ contacted: a.contacted + Number(r.contacted), returned: a.returned + Number(r.returned), revenue: a.revenue + Number(r.revenue) }), { contacted: 0, returned: 0, revenue: 0 });

  const contact = useMutation({
    mutationFn: async (row: RetentionRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('retention_contacts').insert({
        clinic_id: clinicId!, patient_id: row.patient_id, kind: row.kind, treatment_id: row.treatment_id, contacted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retention-lists', clinicId] });
      qc.invalidateQueries({ queryKey: ['retention-results', clinicId] });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível registrar', description: e.message, variant: 'destructive' }),
  });

  const callWhatsapp = (row: RetentionRow) => {
    if (!row.phone) { toast({ title: 'Sem telefone', description: 'Cadastre o telefone do paciente.', variant: 'destructive' }); return; }
    window.open(whatsappLink(row.phone, retentionMessage(row, clinicName || 'nossa clínica')), '_blank', 'noopener,noreferrer');
    contact.mutate(row);
  };

  return (
    <div>
      <PageHeader title="Retorno de pacientes" description="Quem chamar hoje para voltar à clínica">
        <BrandButton variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </BrandButton>
      </PageHeader>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Chamados no mês', value: String(totals.contacted) },
          { label: 'Voltaram (agendaram)', value: String(totals.returned) },
          { label: 'Receita das propostas', value: formatBRL(totals.revenue) },
        ].map((s) => (
          <Card key={s.label} className="shadow-card"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold sm:text-2xl">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as RetentionKind | 'referrals')}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {RETENTION_TABS.map((t) => <TabsTrigger key={t.kind} value={t.kind}>{t.label} ({groups[t.kind].length})</TabsTrigger>)}
          <TabsTrigger value="referrals">Indicações</TabsTrigger>
        </TabsList>
        <TabsContent value="referrals"><ReferralsTab clinicId={clinicId} /></TabsContent>
        {RETENTION_TABS.map((t) => (
          <TabsContent key={t.kind} value={t.kind} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.hint} Quem você chamar some da lista por 30 dias.</p>
            {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : groups[t.kind].length === 0 ? (
              <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">Ninguém para chamar agora.</CardContent></Card>
            ) : (
              <Card className="shadow-card"><CardContent className="divide-y p-0">
                {groups[t.kind].map((r) => (
                  <div key={`${r.kind}-${r.patient_id}-${r.treatment_id || ''}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" className="min-w-0 text-left" onClick={() => navigate(`/clinic/patients/${r.patient_id}`)}>
                      <p className="truncate font-medium">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground">{r.detail}</p>
                      {r.phone && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {r.phone}</p>}
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <BrandButton size="sm" onClick={() => callWhatsapp(r)} disabled={contact.isPending}>
                        <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" onClick={() => contact.mutate(r)} disabled={contact.isPending}>Já falei</BrandButton>
                    </div>
                  </div>
                ))}
              </CardContent></Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
