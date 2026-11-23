import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake, Check, Gift, Hourglass, Info, MessageCircle, PackageCheck, Phone, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
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

const KIND_ICON: Record<RetentionKind, LucideIcon> = {
  maintenance: Sparkles,
  package_ending: PackageCheck,
  inactive: Hourglass,
  birthday: Cake,
};

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// Motivo como "aba": ícone, nome, quantas pessoas e uma linha do que significa.
const tileClass = [
  'group flex h-auto min-w-0 flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left shadow-none whitespace-normal',
  'hover:border-primary/40',
  'data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:shadow-none',
].join(' ');

/** Retorno de clientes: quem chamar hoje e quanto as chamadas trouxeram de volta. */
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
  const returnRate = totals.contacted ? Math.round((totals.returned / totals.contacted) * 100) : 0;
  const toCall = rows.length;

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
    if (!row.phone) { toast({ title: 'Sem telefone', description: 'Cadastre o telefone da cliente para chamar no WhatsApp.', variant: 'destructive' }); return; }
    window.open(whatsappLink(row.phone, retentionMessage(row, clinicName || 'nossa clínica')), '_blank', 'noopener,noreferrer');
    contact.mutate(row);
  };

  return (
    <div>
      <PageHeader title="Retorno de clientes" description="Quem chamar hoje para voltar à clínica">
        <BrandButton variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </BrandButton>
      </PageHeader>

      {/* Resultado do mês numa linha só, como no CRM: informa sem ocupar a tela. */}
      <Card className="mb-4 border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="p-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <div className="flex items-baseline gap-1.5"><dd className="font-semibold text-slate-900">{toCall}</dd><dt>{toCall === 1 ? 'cliente para chamar' : 'clientes para chamar'}</dt></div>
            <div className="flex items-baseline gap-1.5"><dt>Chamadas no mês</dt><dd className="font-semibold text-slate-900">{totals.contacted}</dd></div>
            <div className="flex items-baseline gap-1.5">
              <dt>Voltaram</dt>
              <dd className="font-semibold text-slate-900">{totals.returned}{totals.contacted > 0 && <span className="ml-1 font-normal text-slate-500">({returnRate}%)</span>}</dd>
            </div>
            <div className="flex items-baseline gap-1.5"><dt>Em propostas</dt><dd className="font-semibold text-slate-900">{formatBRL(totals.revenue)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as RetentionKind | 'referrals')}>
        <TabsList aria-label="Motivo do retorno" className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-3 lg:grid-cols-5">
          {RETENTION_TABS.map((t) => {
            const Icon = KIND_ICON[t.kind];
            const count = groups[t.kind].length;
            return (
              <TabsTrigger key={t.kind} value={t.kind} className={tileClass}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Icon className="h-4 w-4 text-primary" aria-hidden /> {t.label}
                  </span>
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold ${count > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {count}
                  </span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">{t.short}</span>
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="referrals" className={tileClass}>
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Gift className="h-4 w-4 text-primary" aria-hidden /> Indicações
            </span>
            <span className="text-xs font-normal text-muted-foreground">Recompensas a entregar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="mt-4"><ReferralsTab clinicId={clinicId} /></TabsContent>

        {RETENTION_TABS.map((t) => {
          const list = groups[t.kind];
          const Icon = KIND_ICON[t.kind];
          return (
            <TabsContent key={t.kind} value={t.kind} className="mt-4 space-y-3">
              <p className="flex items-start gap-2 text-sm text-[hsl(var(--text-secondary))]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{t.hint} Depois que você chama, a cliente sai da lista por 30 dias.</span>
              </p>

              {isLoading ? (
                <Card className="shadow-card"><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>
              ) : list.length === 0 ? (
                <Card className="shadow-card">
                  <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10"><Icon className="h-5 w-5 text-primary" aria-hidden /></span>
                    <p className="font-medium text-foreground">Ninguém para chamar agora</p>
                    <p className="max-w-md text-sm text-muted-foreground">{t.empty}</p>
                    {t.kind === 'maintenance' && (
                      <Link to="/clinic/treatments" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Configurar prazos em Tratamentos</Link>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-card">
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {list.map((r) => (
                        <li key={`${r.kind}-${r.patient_id}-${r.treatment_id || ''}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => navigate(`/clinic/patients/${r.patient_id}`)}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {initials(r.full_name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">{r.full_name}</span>
                              <span className="block truncate text-sm text-muted-foreground">{r.detail}</span>
                              {r.phone ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" aria-hidden /> {r.phone}</span>
                              ) : (
                                <span className="text-xs font-medium text-warning">Sem telefone cadastrado</span>
                              )}
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-2">
                            <BrandButton className="flex-1 sm:flex-none" onClick={() => callWhatsapp(r)} disabled={contact.isPending || !r.phone}>
                              <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
                            </BrandButton>
                            <BrandButton variant="outline" onClick={() => contact.mutate(r)} disabled={contact.isPending}>
                              <Check className="h-4 w-4" /> Já falei
                            </BrandButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
