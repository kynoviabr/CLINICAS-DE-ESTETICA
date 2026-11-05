import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, ClipboardList, FileSignature, Sparkles, Stethoscope, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useUrlState } from '@/hooks/useUrlState';
import { useToast } from '@/hooks/use-toast';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCep, lookupCepAddress } from '@/lib/cep';
import { formatPhone } from '@/lib/patients/validation';
import { errorMessage, functionError } from '@/lib/errors';
import {
  SETUP_COMPLETED_KEY,
  SETUP_STEPS,
  WEEK_DAYS,
  buildAvailabilityRows,
  ensureAnamneseTemplates,
  formatDocument,
  isValidDocument,
  readClinicSetting,
  upsertClinicSetting,
  validHours,
  type SetupStep,
} from '@/lib/setup/clinicSetup';

const STEP_LABELS: Record<SetupStep, string> = {
  clinica: 'Sua clínica',
  atendimento: 'Seu atendimento',
  tratamentos: 'Tratamentos',
  documentos: 'Anamnese e contrato',
  equipe: 'Equipe',
  pronto: 'Pronto',
};

type CatalogItem = { category_name: string; name: string; price: number; num_sessions: number };

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function SetupPage() {
  const { user } = useAuth();
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useUrlState<SetupStep>('passo', 'clinica', SETUP_STEPS);
  const stepIndex = SETUP_STEPS.indexOf(step);
  const [saving, setSaving] = useState(false);

  // 1. Clínica
  const [clinic, setClinic] = useState({ name: '', document: '', phone: '', email: '', zip: '', street: '', number: '', city: '', state: '' });
  // 2. Atendimento
  const ownerDefaultName = (user?.user_metadata?.full_name as string | undefined) || '';
  const [attends, setAttends] = useState(true);
  const [pro, setPro] = useState({ name: ownerDefaultName, specialty: '', registration: '' });
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hours, setHours] = useState({ start: '09:00', end: '18:00' });
  // 3. Tratamentos
  const [categories, setCategories] = useState<string[]>([]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  // 5. Equipe
  const [invite, setInvite] = useState({ email: '', role: 'receptionist' });
  const [invited, setInvited] = useState<string[]>([]);
  // Resumo
  const [summary, setSummary] = useState<{ treatments: number; anamneses: number }>({ treatments: 0, anamneses: 0 });

  const { data: loaded } = useQuery({
    queryKey: ['setup-prefill', clinicId, user?.id],
    queryFn: async () => {
      const [clinicRes, documentValue, proRes, , catsRes, contractRes] = await Promise.all([
        supabase.from('clinics').select('name, phone, email, address, city, state, zip_code').eq('id', clinicId!).maybeSingle(),
        readClinicSetting(clinicId!, 'cnpj'),
        supabase.from('professionals').select('id, full_name, specialty, registration_number').eq('clinic_id', clinicId!).eq('user_id', user!.id).maybeSingle(),
        Promise.resolve(null),
        supabase.from('treatment_categories').select('name').eq('clinic_id', clinicId!).eq('status', 'active'),
        supabase.from('contract_templates').select('id').eq('clinic_id', clinicId!).eq('status', 'active').limit(1),
      ]);
      // Horários ficam no cadastro de profissional (não no login).
      const availRes = proRes.data
        ? await supabase.from('professional_availability').select('day_of_week, start_time, end_time')
          .eq('clinic_id', clinicId!).eq('professional_id', proRes.data.id).eq('is_active', true)
        : { data: [] as Array<{ day_of_week: number; start_time: string; end_time: string }> };
      return {
        clinic: clinicRes.data,
        document: documentValue,
        professional: proRes.data,
        availability: availRes.data || [],
        categories: (catsRes.data || []).map((c) => c.name),
        hasContract: (contractRes.data || []).length > 0,
      };
    },
    enabled: !!clinicId && !!user,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['treatment-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatment_catalog').select('category_name, name, price, num_sessions').order('category_name').order('price');
      if (error) throw error;
      return (data || []) as CatalogItem[];
    },
    staleTime: Infinity,
  });

  // Preenche com o que já existe (quem volta ao assistente continua de onde parou).
  useEffect(() => {
    if (!loaded) return;
    const c = loaded.clinic;
    if (c) {
      const [street, ...rest] = (c.address || '').split(/,\s*(?=\d|s\/n)/i);
      setClinic((cur) => ({
        ...cur,
        name: c.name || '',
        phone: c.phone ? formatPhone(c.phone) : '',
        email: c.email || user?.email || '',
        zip: c.zip_code || '',
        street: street || '',
        number: rest.join(', '),
        city: c.city || '',
        state: c.state || '',
        document: loaded.document ? formatDocument(loaded.document) : '',
      }));
    }
    if (loaded.professional) {
      setPro({
        name: loaded.professional.full_name || ownerDefaultName,
        specialty: loaded.professional.specialty || '',
        registration: loaded.professional.registration_number || '',
      });
    }
    if (loaded.availability.length > 0) {
      setDays(loaded.availability.map((a) => a.day_of_week));
      setHours({ start: String(loaded.availability[0].start_time).slice(0, 5), end: String(loaded.availability[0].end_time).slice(0, 5) });
    }
    setCategories((cur) => (cur.length ? cur : loaded.categories.filter((name) => catalog.some((item) => item.category_name === name))));
  }, [loaded, catalog, user?.email, ownerDefaultName]);

  const catalogByCategory = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    catalog.forEach((item) => map.set(item.category_name, [...(map.get(item.category_name) || []), item]));
    return [...map.entries()];
  }, [catalog]);

  const go = (next: SetupStep) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const nextStep = () => go(SETUP_STEPS[Math.min(stepIndex + 1, SETUP_STEPS.length - 1)]);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } catch (err) {
      toast({ title: 'Não foi possível salvar', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCep = async (value: string) => {
    const zip = formatCep(value);
    setClinic((cur) => ({ ...cur, zip }));
    if (zip.replace(/\D/g, '').length !== 8) return;
    try {
      const found = await lookupCepAddress(zip);
      if (!found) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setClinic((cur) => ({ ...cur, zip: found.zip_code, street: found.address || cur.street, city: found.city || cur.city, state: found.state || cur.state }));
    } catch {
      // Sem internet para o CEP: a pessoa preenche à mão.
    }
  };

  const saveClinic = () => run(async () => {
    if (!clinic.name.trim()) throw new Error('Informe o nome da clínica.');
    if (!isValidDocument(clinic.document)) throw new Error('Informe um CNPJ (ou CPF, se você é autônoma). Ele aparece no contrato.');
    const address = [clinic.street.trim(), clinic.number.trim()].filter(Boolean).join(', ');
    const { error } = await supabase.from('clinics').update({
      name: clinic.name.trim(),
      phone: clinic.phone.trim() || null,
      support_whatsapp: clinic.phone.trim() || null,
      email: clinic.email.trim() || null,
      zip_code: clinic.zip.trim() || null,
      address: address || null,
      city: clinic.city.trim() || null,
      state: clinic.state.trim().toUpperCase() || null,
    }).eq('id', clinicId!);
    if (error) throw error;
    await upsertClinicSetting(clinicId!, 'cnpj', clinic.document.replace(/\D/g, ''));
    qc.invalidateQueries({ queryKey: ['setup-prefill'] });
    nextStep();
  });

  const saveAttendance = () => run(async () => {
    if (attends) {
      if (!pro.name.trim()) throw new Error('Informe seu nome como profissional.');
      if (days.length === 0) throw new Error('Escolha ao menos um dia de atendimento.');
      if (!validHours(hours.start, hours.end)) throw new Error('Confira o horário: use HH:MM e o fim depois do início.');
      const payload = {
        full_name: pro.name.trim(),
        specialty: pro.specialty.trim() || null,
        registration_number: pro.registration.trim() || null,
        status: 'active',
      };
      let professionalId = loaded?.professional?.id ?? null;
      if (professionalId) {
        const { error } = await supabase.from('professionals').update(payload).eq('id', professionalId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase.from('professionals')
          .insert({ ...payload, clinic_id: clinicId!, user_id: user!.id, email: user?.email || null })
          .select('id').single();
        if (error) throw error;
        professionalId = created.id;
      }
      const { error: delError } = await supabase.from('professional_availability').delete().eq('clinic_id', clinicId!).eq('professional_id', professionalId);
      if (delError) throw delError;
      const { error: insError } = await supabase.from('professional_availability').insert(buildAvailabilityRows(clinicId!, professionalId, days, hours.start, hours.end));
      if (insError) throw insError;
      qc.invalidateQueries({ queryKey: ['professional-availability'] });
      qc.invalidateQueries({ queryKey: ['staff-directory'] });
      qc.invalidateQueries({ queryKey: ['agenda-professionals'] });
    }
    qc.invalidateQueries({ queryKey: ['setup-prefill'] });
    nextStep();
  });

  const saveTreatments = () => run(async () => {
    if (categories.length > 0) {
      const { data, error } = await supabase.rpc('setup_clinic_defaults', { p_clinic_id: clinicId!, p_categories: categories });
      if (error) throw error;
      const result = (data || {}) as { treatments?: number };
      const anamneses = await ensureAnamneseTemplates(clinicId!);
      setSummary({ treatments: result.treatments ?? 0, anamneses });
      qc.invalidateQueries({ queryKey: ['treatments'] });
      qc.invalidateQueries({ queryKey: ['treatments-list'] });
    }
    qc.invalidateQueries({ queryKey: ['setup-prefill'] });
    nextStep();
  });

  const sendInvite = () => run(async () => {
    const email = invite.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    const cargoName = invite.role === 'receptionist' ? 'Recepção' : invite.role === 'professional' ? 'Profissional' : 'Comercial';
    const { data, error } = await supabase.functions.invoke('invite-team-member', {
      body: { email, role: invite.role, clinicId, cargoName },
    });
    if (error) throw await functionError(error);
    if (data?.error) throw new Error(data.error);
    setInvited((cur) => [...cur, email]);
    setInvite({ email: '', role: invite.role });
    toast({ title: 'Convite enviado!', description: data?.message });
  });

  const finish = () => run(async () => {
    await upsertClinicSetting(clinicId!, SETUP_COMPLETED_KEY, new Date().toISOString());
    qc.invalidateQueries({ queryKey: ['setup-status'] });
    go('pronto');
  });

  if (role && role !== 'admin') {
    return (
      <Card className="max-w-xl"><CardContent className="p-6 text-sm text-muted-foreground">A implantação da clínica é feita pela administradora.</CardContent></Card>
    );
  }

  const field = 'space-y-1.5';
  const toggleDay = (value: number) => setDays((cur) => (cur.includes(value) ? cur.filter((d) => d !== value) : [...cur, value]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Implantação da clínica · cerca de 5 minutos</p>
        <h1 className="mt-1 text-2xl font-heading font-semibold text-foreground">Vamos deixar sua clínica pronta para atender</h1>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Etapas">
        {SETUP_STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i <= stepIndex && go(s)}
              disabled={i > stepIndex}
              aria-current={s === step ? 'step' : undefined}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
                s === step ? 'bg-primary text-primary-foreground' : i < stepIndex ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>

      <Card className="shadow-card">
        <CardContent className="space-y-5 p-6">
          {step === 'clinica' && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Sua clínica</h2>
                <p className="text-sm text-muted-foreground">Esses dados aparecem nas propostas e nos contratos.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className={`${field} sm:col-span-2`}><Label htmlFor="s-name">Nome da clínica *</Label><Input id="s-name" value={clinic.name} onChange={(e) => setClinic({ ...clinic, name: e.target.value })} /></div>
                <div className={field}><Label htmlFor="s-doc">CNPJ (ou CPF, se autônoma) *</Label><Input id="s-doc" inputMode="numeric" value={clinic.document} onChange={(e) => setClinic({ ...clinic, document: formatDocument(e.target.value) })} placeholder="00.000.000/0000-00" /></div>
                <div className={field}><Label htmlFor="s-phone">WhatsApp da clínica</Label><Input id="s-phone" inputMode="tel" value={clinic.phone} onChange={(e) => setClinic({ ...clinic, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-9999" /></div>
                <div className={`${field} sm:col-span-2`}><Label htmlFor="s-email">E-mail</Label><Input id="s-email" type="email" value={clinic.email} onChange={(e) => setClinic({ ...clinic, email: e.target.value })} /></div>
                <div className={field}><Label htmlFor="s-zip">CEP</Label><Input id="s-zip" inputMode="numeric" value={clinic.zip} onChange={(e) => handleCep(e.target.value)} placeholder="00000-000" /></div>
                <div className={field}><Label htmlFor="s-number">Número</Label><Input id="s-number" value={clinic.number} onChange={(e) => setClinic({ ...clinic, number: e.target.value })} placeholder="123 ou S/N" /></div>
                <div className={`${field} sm:col-span-2`}><Label htmlFor="s-street">Rua e bairro</Label><Input id="s-street" value={clinic.street} onChange={(e) => setClinic({ ...clinic, street: e.target.value })} /></div>
                <div className={field}><Label htmlFor="s-city">Cidade</Label><Input id="s-city" value={clinic.city} onChange={(e) => setClinic({ ...clinic, city: e.target.value })} /></div>
                <div className={field}><Label htmlFor="s-uf">UF</Label><Input id="s-uf" maxLength={2} value={clinic.state} onChange={(e) => setClinic({ ...clinic, state: e.target.value.toUpperCase() })} placeholder="SP" /></div>
              </div>
              <div className="flex justify-end"><BrandButton onClick={saveClinic} disabled={saving}>{saving ? 'Salvando...' : 'Salvar e continuar'} <ChevronRight className="h-4 w-4" /></BrandButton></div>
            </>
          )}

          {step === 'atendimento' && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Seu atendimento</h2>
                <p className="text-sm text-muted-foreground">Com seus dias e horários, a agenda já fica pronta para marcar clientes.</p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="s-attends" className="text-sm font-semibold">Eu também atendo clientes</Label>
                  <p className="text-xs text-muted-foreground">Desligue se você só administra e outra pessoa atende.</p>
                </div>
                <Switch id="s-attends" checked={attends} onCheckedChange={setAttends} />
              </div>
              {attends && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className={`${field} sm:col-span-2`}><Label htmlFor="s-pro">Seu nome (como aparece na agenda) *</Label><Input id="s-pro" value={pro.name} onChange={(e) => setPro({ ...pro, name: e.target.value })} /></div>
                    <div className={field}><Label htmlFor="s-spec">Especialidade</Label><Input id="s-spec" value={pro.specialty} onChange={(e) => setPro({ ...pro, specialty: e.target.value })} placeholder="Ex.: Esteticista, Biomédica" /></div>
                    <div className={field}><Label htmlFor="s-reg">Registro profissional</Label><Input id="s-reg" value={pro.registration} onChange={(e) => setPro({ ...pro, registration: e.target.value })} placeholder="Opcional" /></div>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Dias de atendimento</legend>
                    <div className="flex flex-wrap gap-2">
                      {WEEK_DAYS.map((d) => (
                        <button key={d.value} type="button" aria-pressed={days.includes(d.value)} onClick={() => toggleDay(d.value)}
                          className={`min-h-11 min-w-14 rounded-lg border px-3 text-sm font-semibold ${days.includes(d.value) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}>
                          {d.short}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid max-w-sm grid-cols-2 gap-4">
                    <div className={field}><Label htmlFor="s-start">Das</Label><Input id="s-start" type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} /></div>
                    <div className={field}><Label htmlFor="s-end">Até</Label><Input id="s-end" type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Horários diferentes por dia, pausas e folgas você ajusta depois na Agenda.</p>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <BrandButton variant="outline" onClick={() => go('clinica')}><ChevronLeft className="h-4 w-4" /> Voltar</BrandButton>
                <BrandButton onClick={saveAttendance} disabled={saving}>{saving ? 'Salvando...' : 'Salvar e continuar'} <ChevronRight className="h-4 w-4" /></BrandButton>
              </div>
            </>
          )}

          {step === 'tratamentos' && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Tratamentos que você oferece</h2>
                <p className="text-sm text-muted-foreground">Escolha as áreas e trazemos os tratamentos prontos, com preço sugerido, sessões e custo. Você ajusta preços e remove o que não faz depois.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {catalogByCategory.map(([name, items]) => {
                  const checked = categories.includes(name);
                  const prices = items.map((i) => Number(i.price));
                  return (
                    <div key={name} className={`rounded-xl border p-4 ${checked ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox id={`cat-${name}`} checked={checked} className="mt-0.5"
                          onCheckedChange={(v) => setCategories((cur) => (v ? [...cur, name] : cur.filter((c) => c !== name)))} />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`cat-${name}`} className="font-semibold">{name}</Label>
                          <p className="text-xs text-muted-foreground">{items.length} tratamentos · {money(Math.min(...prices))} a {money(Math.max(...prices))}</p>
                          <button type="button" className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                            onClick={() => setOpenCategory(openCategory === name ? null : name)} aria-expanded={openCategory === name}>
                            {openCategory === name ? 'Esconder lista' : 'Ver tratamentos'}
                          </button>
                          {openCategory === name && (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {items.map((i) => <li key={i.name}>{i.name} · {money(Number(i.price))}{i.num_sessions > 1 ? ` · ${i.num_sessions} sessões` : ''}</li>)}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <BrandButton variant="outline" onClick={() => go('atendimento')}><ChevronLeft className="h-4 w-4" /> Voltar</BrandButton>
                <div className="flex flex-wrap gap-2">
                  {categories.length === 0 && <BrandButton variant="ghost" onClick={nextStep}>Cadastrar depois</BrandButton>}
                  <BrandButton onClick={saveTreatments} disabled={saving || categories.length === 0}>{saving ? 'Preparando...' : 'Trazer tratamentos'} <ChevronRight className="h-4 w-4" /></BrandButton>
                </div>
              </div>
            </>
          )}

          {step === 'documentos' && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Anamnese e contrato</h2>
                <p className="text-sm text-muted-foreground">Já deixamos os documentos padrão prontos para usar.</p>
              </div>
              <ul className="space-y-3">
                <li className="flex gap-3 rounded-lg border p-4">
                  <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">Anamnese por área de tratamento</p>
                    <p className="text-sm text-muted-foreground">
                      {summary.anamneses > 0 ? `${summary.anamneses} modelo(s) criado(s)` : 'Modelos criados para as áreas escolhidas'}: perguntas de saúde comuns a todos e perguntas específicas de cada área.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3 rounded-lg border p-4">
                  <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">Contrato padrão</p>
                    <p className="text-sm text-muted-foreground">
                      {loaded?.hasContract ? 'Ativo e preenchido com os dados da clínica, da cliente e da venda.' : 'Ainda não ativo: ative em Configurações > Contrato Padrão.'}
                    </p>
                  </div>
                </li>
                {summary.treatments > 0 && (
                  <li className="flex gap-3 rounded-lg border p-4">
                    <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold">{summary.treatments} tratamentos cadastrados</p>
                      <p className="text-sm text-muted-foreground">Revise os preços quando puder em Configurações &gt; Tratamentos.</p>
                    </div>
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground">Você pode editar perguntas e cláusulas depois em Configurações.</p>
              <div className="flex justify-between gap-2">
                <BrandButton variant="outline" onClick={() => go('tratamentos')}><ChevronLeft className="h-4 w-4" /> Voltar</BrandButton>
                <BrandButton onClick={nextStep}>Continuar <ChevronRight className="h-4 w-4" /></BrandButton>
              </div>
            </>
          )}

          {step === 'equipe' && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Sua equipe</h2>
                <p className="text-sm text-muted-foreground">Tem secretária ou outra profissional? Convide agora. Se trabalha sozinha, pode pular.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <div className={field}><Label htmlFor="s-inv">E-mail</Label><Input id="s-inv" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="secretaria@email.com" /></div>
                <div className={field}>
                  <Label htmlFor="s-inv-role">Função</Label>
                  <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                    <SelectTrigger id="s-inv-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receptionist">Recepção / Secretária</SelectItem>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="sales">Comercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <BrandButton onClick={sendInvite} disabled={saving}><UserPlus className="h-4 w-4" /> Convidar</BrandButton>
              </div>
              {invited.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {invited.map((email) => <li key={email} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{email} · convite enviado</li>)}
                </ul>
              )}
              <div className="flex justify-between gap-2">
                <BrandButton variant="outline" onClick={() => go('documentos')}><ChevronLeft className="h-4 w-4" /> Voltar</BrandButton>
                <BrandButton onClick={finish} disabled={saving}>{invited.length ? 'Concluir' : 'Pular e concluir'} <ChevronRight className="h-4 w-4" /></BrandButton>
              </div>
            </>
          )}

          {step === 'pronto' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Sparkles className="h-7 w-7 text-primary" /></div>
              <div>
                <h2 className="text-xl font-semibold">Sua clínica está pronta para atender</h2>
                <p className="mt-1 text-sm text-muted-foreground">Comece marcando o primeiro atendimento. Tudo o que você preencheu pode ser ajustado em Configurações.</p>
              </div>
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <BrandButton onClick={() => navigate('/clinic/appointments')}>Agendar primeiro atendimento</BrandButton>
                <BrandButton variant="outline" onClick={() => navigate('/clinic')}>Ir para o início</BrandButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
