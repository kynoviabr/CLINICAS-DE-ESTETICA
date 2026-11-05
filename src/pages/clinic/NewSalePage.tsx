import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Download, FileSignature, Mail, MessageCircle, Plus, Printer, Search, Send, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import {
  ContractPaymentConfigurator,
  type PaymentCondition,
  type PaymentConfig,
  type PaymentMethod,
} from '@/components/contracts/ContractPaymentConfigurator';
import { buildPaymentPresetSummary, composeProposalNotesPayload, type PaymentPresetSnapshot } from '@/lib/proposals/paymentPreset';
import {
  buildProposalHtml, defaultValidUntil, formatBRL, itemsBelowMinimum, mailtoLink, proposalShareText, saleTotal,
  validateSalePayment, whatsappLink, type SaleItem,
} from '@/lib/proposals/sale';
import { createSale, ensurePatientFromLead, type LeadForSale } from '@/lib/proposals/createSale';
import { generateContractPDF } from '@/lib/contractPDF';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/patients/validation';

type PatientOption = { id: string; full_name: string; phone: string | null; email: string | null; cpf: string | null };
type TreatmentOption = { id: string; name: string; price: number; default_price: number | null; min_price: number | null; num_sessions: number };
type Customer =
  | { kind: 'patient'; id: string; name: string; phone: string | null; email: string | null }
  | { kind: 'lead'; lead: LeadForSale; name: string; phone: string | null; email: string | null };

type SavedSale = {
  id: string;
  number: string;
  total: number;
  customer: Customer;
  items: SaleItem[];
  validUntil: string | null;
  paymentSummary: string;
  notes: string;
};

const normalize = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function NewSalePage() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();
  const branding = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [treatmentToAdd, setTreatmentToAdd] = useState('');
  const [condition, setCondition] = useState<PaymentCondition>('cash');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [config, setConfig] = useState<PaymentConfig>({});
  const [details, setDetails] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState<'send' | 'close' | null>(null);
  const [saved, setSaved] = useState<SavedSale | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ['sale-patients', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('id, full_name, phone, email, cpf')
        .eq('clinic_id', clinicId!).order('full_name').limit(1000);
      if (error) throw error;
      return (data || []) as PatientOption[];
    },
    enabled: !!clinicId,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['sale-leads', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id, full_name, phone, email, cpf, patient_id')
        .eq('clinic_id', clinicId!).is('deleted_at', null)
        .not('kanban_stage', 'in', '(closed_won,closed_lost)')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as LeadForSale[];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['sale-treatments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatments').select('id, name, price, default_price, min_price, num_sessions')
        .eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      if (error) throw error;
      return (data || []) as TreatmentOption[];
    },
    enabled: !!clinicId,
  });

  const { data: clinicInfo } = useQuery({
    queryKey: ['sale-clinic', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('clinics').select('phone, email, city, state').eq('id', clinicId!).maybeSingle();
      return data;
    },
    enabled: !!clinicId,
  });

  // Vindo do CRM ou da ficha: ?leadId= ou ?patientId= já escolhe a cliente.
  useEffect(() => {
    if (customer) return;
    const leadId = searchParams.get('leadId');
    const patientId = searchParams.get('patientId');
    if (leadId) {
      const lead = leads.find((l) => l.id === leadId);
      if (lead) setCustomer(lead.patient_id
        ? { kind: 'patient', id: lead.patient_id, name: lead.full_name, phone: lead.phone, email: lead.email }
        : { kind: 'lead', lead, name: lead.full_name, phone: lead.phone, email: lead.email });
    } else if (patientId) {
      const p = patients.find((x) => x.id === patientId);
      if (p) setCustomer({ kind: 'patient', id: p.id, name: p.full_name, phone: p.phone, email: p.email });
    }
  }, [searchParams, leads, patients, customer]);

  const results = useMemo(() => {
    const q = normalize(search.trim());
    const digits = search.replace(/\D/g, '');
    if (q.length < 2) return [];
    const match = (name: string, phone: string | null, cpf: string | null) =>
      normalize(name).includes(q) || (digits.length >= 3 && ((phone || '').replace(/\D/g, '').includes(digits) || (cpf || '').replace(/\D/g, '').includes(digits)));
    const leadOnly = leads.filter((l) => !l.patient_id && match(l.full_name, l.phone, l.cpf)).slice(0, 4);
    const pts = patients.filter((p) => match(p.full_name, p.phone, p.cpf)).slice(0, 6);
    return [
      ...pts.map((p) => ({ key: `p-${p.id}`, label: p.full_name, sub: p.phone ? formatPhone(p.phone) : 'Cliente', tag: 'Cliente',
        pick: () => setCustomer({ kind: 'patient', id: p.id, name: p.full_name, phone: p.phone, email: p.email }) })),
      ...leadOnly.map((l) => ({ key: `l-${l.id}`, label: l.full_name, sub: l.phone ? formatPhone(l.phone) : 'Interessada', tag: 'Interessada',
        pick: () => setCustomer({ kind: 'lead', lead: l, name: l.full_name, phone: l.phone, email: l.email }) })),
    ];
  }, [search, patients, leads]);

  const total = saleTotal(items);
  const belowMin = itemsBelowMinimum(items);
  const paymentError = items.length > 0 ? validateSalePayment(methods, config, total) : null;

  const addTreatment = (id: string) => {
    const t = treatments.find((x) => x.id === id);
    if (!t) return;
    setItems((cur) => {
      const existing = cur.find((i) => i.treatment_id === id);
      if (existing) return cur.map((i) => (i.treatment_id === id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...cur, { treatment_id: t.id, name: t.name, quantity: 1, unit_price: Number(t.default_price ?? t.price), min_price: t.min_price, num_sessions: t.num_sessions }];
    });
    setTreatmentToAdd('');
  };

  const togglePaymentMethod = (method: PaymentMethod, checked: boolean) => {
    if (checked) {
      if (methods.includes(method)) return;
      if (methods.length >= 2) {
        toast({ title: 'No máximo 2 formas de pagamento', variant: 'destructive' });
        return;
      }
      setMethods((cur) => [...cur, method]);
      // Uma forma só: já preenche com o total.
      if (methods.length === 0) setConfig((cur) => ({ ...cur, [method]: { ...cur[method], amount: total ? total.toFixed(2) : '' } }));
      return;
    }
    setMethods((cur) => cur.filter((m) => m !== method));
    setConfig((cur) => { const next = { ...cur }; delete next[method]; return next; });
    setDetails((cur) => { const next = { ...cur }; delete next[method]; return next; });
  };

  const quickPix = () => {
    setCondition('cash');
    setMethods(['pix']);
    setConfig({ pix: { amount: total.toFixed(2) } });
    setDetails({});
  };

  const preset: PaymentPresetSnapshot | null = methods.length ? { condition, methods, config, details } : null;

  const save = async (closeNow: boolean) => {
    if (!clinicId) return;
    if (!customer) { toast({ title: 'Escolha a cliente', variant: 'destructive' }); return; }
    if (items.length === 0) { toast({ title: 'Adicione ao menos um tratamento', variant: 'destructive' }); return; }
    if (paymentError) { toast({ title: 'Confira o pagamento', description: paymentError, variant: 'destructive' }); return; }
    setSaving(closeNow ? 'close' : 'send');
    try {
      const patientId = customer.kind === 'patient' ? customer.id : await ensurePatientFromLead(clinicId, customer.lead);
      const proposal = await createSale({
        clinicId,
        userId: user?.id ?? null,
        patientId,
        leadId: customer.kind === 'lead' ? customer.lead.id : searchParams.get('leadId'),
        items,
        notesPayload: composeProposalNotesPayload(notes, preset),
        validUntil: validUntil || null,
        closeNow,
      });
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['sale-leads'] });
      if (closeNow) {
        toast({ title: 'Venda fechada!', description: 'Agora é só conferir e emitir o contrato.' });
        navigate(`/clinic/contracts?emitir=${proposal.id}&returnTo=proposals`);
        return;
      }
      setSaved({
        id: proposal.id,
        number: proposal.proposal_number,
        total,
        customer: customer.kind === 'lead' ? { ...customer } : customer,
        items,
        validUntil: validUntil || null,
        paymentSummary: buildPaymentPresetSummary(preset),
        notes: notes.trim(),
      });
      toast({ title: 'Proposta salva', description: 'Envie para a cliente pelo WhatsApp, e-mail ou PDF.' });
    } catch (err) {
      toast({ title: 'Não foi possível salvar a venda', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const proposalHtml = (s: SavedSale) => buildProposalHtml({
    clinicName: branding.clinicName,
    clinicContact: [clinicInfo?.phone, clinicInfo?.email, [clinicInfo?.city, clinicInfo?.state].filter(Boolean).join('/')].filter(Boolean).join(' · '),
    logoUrl: branding.logoUrl,
    accentColor: branding.primaryColor,
    number: s.number,
    date: new Date(),
    validUntil: s.validUntil,
    clientName: s.customer.name,
    items: s.items,
    total: s.total,
    paymentSummary: s.paymentSummary,
    notes: s.notes,
  });

  const downloadPdf = async () => {
    if (!saved) return;
    setDownloading(true);
    try {
      const blob = await generateContractPDF(proposalHtml(saved));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Proposta-${saved.number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast({ title: 'Não foi possível gerar o PDF', description: errorMessage(err, 'Tente imprimir.'), variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const printProposal = () => {
    if (!saved) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proposta ${saved.number}</title></head><body style="margin:32px">${proposalHtml(saved)}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const reset = () => {
    setSaved(null); setCustomer(null); setSearch(''); setItems([]); setMethods([]); setConfig({}); setDetails({});
    setCondition('cash'); setNotes(''); setValidUntil(defaultValidUntil());
  };

  if (saved) {
    const text = proposalShareText({ clientName: saved.customer.name, clinicName: branding.clinicName, number: saved.number, total: saved.total, validUntil: saved.validUntil, items: saved.items });
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Proposta pronta" description={`Nº ${saved.number} · ${saved.customer.name} · ${formatBRL(saved.total)}`} />
        <Card className="shadow-card">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start gap-3 rounded-lg bg-success/10 p-4">
              <Check className="mt-0.5 h-5 w-5 text-success" />
              <p className="text-sm">A proposta está salva e a interessada foi para <strong>Proposta enviada</strong>. Envie agora para não esfriar.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a href={whatsappLink(saved.customer.phone, text)} target="_blank" rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-btn bg-[#0e7a45] px-4 font-semibold text-white hover:opacity-90">
                <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
              </a>
              <a href={mailtoLink(saved.customer.email, `Sua proposta - ${branding.clinicName}`, text)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border bg-card px-4 font-semibold text-foreground hover:bg-muted">
                <Mail className="h-4 w-4" /> Enviar por e-mail
              </a>
              <BrandButton variant="outline" onClick={downloadPdf} disabled={downloading}>
                <Download className="h-4 w-4" /> {downloading ? 'Gerando PDF...' : 'Baixar PDF'}
              </BrandButton>
              <BrandButton variant="outline" onClick={printProposal}>
                <Printer className="h-4 w-4" /> Imprimir
              </BrandButton>
            </div>
            <p className="text-xs text-muted-foreground">Dica: baixe o PDF e anexe na conversa do WhatsApp junto com a mensagem.</p>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <BrandButton variant="ghost" onClick={() => navigate(`/clinic/contracts?emitir=${saved.id}&returnTo=proposals`)} title="Use quando a cliente aceitar">
                <FileSignature className="h-4 w-4" /> Cliente aceitou? Emitir contrato
              </BrandButton>
              <BrandButton onClick={reset}><Plus className="h-4 w-4" /> Nova venda</BrandButton>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nova venda" description="Cliente, tratamentos e pagamento. Feche na hora ou envie a proposta." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">1. Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.kind === 'lead' ? 'Interessada · vira cliente ao salvar' : 'Cliente'}{customer.phone ? ` · ${formatPhone(customer.phone)}` : ''}
                    </p>
                  </div>
                  <BrandButton variant="ghost" size="sm" onClick={() => setCustomer(null)}>Trocar</BrandButton>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar cliente" />
                  </div>
                  {results.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {results.map((r) => (
                        <li key={r.key}>
                          <button type="button" onClick={r.pick} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted">
                            <span><span className="font-medium">{r.label}</span><span className="block text-xs text-muted-foreground">{r.sub}</span></span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{r.tag}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {search.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">Ninguém encontrado.</p>}
                  <BrandButton variant="outline" size="sm" onClick={() => setQuickPatientOpen(true)}><UserPlus className="h-4 w-4" /> Cadastrar nova cliente</BrandButton>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">2. Tratamentos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={treatmentToAdd} onValueChange={addTreatment}>
                <SelectTrigger aria-label="Adicionar tratamento"><SelectValue placeholder={treatments.length ? 'Adicionar tratamento' : 'Nenhum tratamento cadastrado'} /></SelectTrigger>
                <SelectContent>
                  {treatments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} · {formatBRL(Number(t.default_price ?? t.price))}{t.num_sessions > 1 ? ` · ${t.num_sessions} sessões` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {items.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {items.map((item) => {
                    const low = item.min_price != null && item.unit_price < Number(item.min_price);
                    return (
                      <li key={item.treatment_id} className="grid grid-cols-[minmax(0,1fr)_64px_110px_auto] items-center gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
                          {low && <p className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" />Abaixo do mínimo ({formatBRL(Number(item.min_price))})</p>}
                        </div>
                        <Input type="number" min={1} aria-label={`Quantidade de ${item.name}`} value={item.quantity}
                          onChange={(e) => setItems((cur) => cur.map((i) => (i.treatment_id === item.treatment_id ? { ...i, quantity: Math.max(1, Number(e.target.value) || 1) } : i)))} />
                        <Input type="number" min={0} step="0.01" aria-label={`Valor de ${item.name}`} value={item.unit_price}
                          onChange={(e) => setItems((cur) => cur.map((i) => (i.treatment_id === item.treatment_id ? { ...i, unit_price: Math.max(0, Number(e.target.value) || 0) } : i)))} />
                        <button type="button" aria-label={`Remover ${item.name}`} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                          onClick={() => setItems((cur) => cur.filter((i) => i.treatment_id !== item.treatment_id))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">3. Pagamento</CardTitle>
                <BrandButton variant="ghost" size="sm" onClick={quickPix} disabled={total <= 0}>À vista no Pix</BrandButton>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ContractPaymentConfigurator
                paymentCondition={condition}
                setPaymentCondition={setCondition}
                selectedPaymentMethods={methods}
                togglePaymentMethod={togglePaymentMethod}
                paymentConfig={config}
                setPaymentConfig={setConfig}
                paymentDetails={details}
                setPaymentDetails={setDetails}
              />
              {paymentError && methods.length > 0 && <p className="text-sm text-destructive">{paymentError}</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="shadow-card">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-3xl font-heading font-semibold">{formatBRL(total)}</p>
                <p className="text-xs text-muted-foreground">{items.length} tratamento(s){belowMin.length ? ` · ${belowMin.length} abaixo do mínimo` : ''}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-valid">Proposta válida até</Label>
                <Input id="sale-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-notes">Observações</Label>
                <Textarea id="sale-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <BrandButton className="w-full" onClick={() => save(true)} disabled={!!saving}>
                  <FileSignature className="h-4 w-4" /> {saving === 'close' ? 'Fechando...' : 'Fechar agora e emitir contrato'}
                </BrandButton>
                <BrandButton className="w-full" variant="outline" onClick={() => save(false)} disabled={!!saving}>
                  <Send className="h-4 w-4" /> {saving === 'send' ? 'Salvando...' : 'Enviar proposta'}
                </BrandButton>
              </div>
              <p className="text-xs text-muted-foreground">“Fechar agora” aprova e abre o contrato com o pagamento preenchido. “Enviar proposta” gera PDF e mensagem para WhatsApp ou e-mail.</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={async (p) => {
          qc.invalidateQueries({ queryKey: ['sale-patients'] });
          const { data } = await supabase.from('patients').select('phone, email').eq('id', p.id).maybeSingle();
          setCustomer({ kind: 'patient', id: p.id, name: p.full_name, phone: data?.phone ?? null, email: data?.email ?? null });
        }}
      />
    </div>
  );
}
