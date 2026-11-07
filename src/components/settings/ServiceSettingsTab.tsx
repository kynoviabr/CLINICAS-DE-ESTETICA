import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import { setupIssues } from '../../../supabase/functions/_shared/agenda.ts';
import ProfessionalHoursDialog from '@/components/professionals/ProfessionalHoursDialog';
import { useUrlState } from '@/hooks/useUrlState';
import {
  DAY_NAMES, PARKING_OPTIONS, PAYMENT_OPTIONS, PRICE_DISPLAY_OPTIONS, defaultServiceForm, formToRow, hoursFromRows, rowToForm, validateHours,
  type HoursByDay, type ServiceForm,
} from '@/lib/clinic/serviceSettings';

/** Configurações > Atendimento: dados organizados da clínica que a agenda, a equipe e a IA usam. */
export default function ServiceSettingsTab() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const canEdit = role === 'admin';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<ServiceForm>(defaultServiceForm());
  const [hours, setHours] = useState<HoursByDay>({});
  const [newClosure, setNewClosure] = useState({ date: '', reason: '' });
  const [hoursFor, setHoursFor] = useState<{ id: string; name: string } | null>(null);
  const [, setTab] = useUrlState<string>('aba', 'general');

  const { data } = useQuery({
    queryKey: ['service-settings', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const [settings, bh, closures, treatments, pros, links, avail] = await Promise.all([
        supabase.from('clinic_service_settings').select('*').eq('clinic_id', clinicId!).maybeSingle(),
        supabase.from('clinic_business_hours').select('day_of_week, opens_at, closes_at').eq('clinic_id', clinicId!).order('day_of_week').order('opens_at'),
        supabase.from('clinic_closures').select('id, closed_on, reason').eq('clinic_id', clinicId!).gte('closed_on', new Date().toISOString().slice(0, 10)).order('closed_on'),
        supabase.from('treatments').select('id, name, ai_bookable, requires_evaluation').eq('clinic_id', clinicId!).eq('is_active', true),
        supabase.from('professionals').select('id, full_name').eq('clinic_id', clinicId!).eq('status', 'active'),
        supabase.from('professional_treatments').select('professional_id, treatment_id, professionals!inner(clinic_id)').eq('professionals.clinic_id', clinicId!).eq('status', 'active'),
        supabase.from('professional_availability').select('professional_id, day_of_week, start_time, end_time').eq('clinic_id', clinicId!).eq('is_active', true),
      ]);
      return {
        settings: settings.data, hours: bh.data || [], closures: closures.data || [],
        treatments: treatments.data || [], pros: pros.data || [], links: (links.data || []) as { professional_id: string; treatment_id: string }[],
        availability: (avail.data || []).map((a) => ({ ...a, start_time: String(a.start_time), end_time: String(a.end_time) })),
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm(rowToForm(data.settings));
    setHours(hoursFromRows(data.hours));
  }, [data]);

  const issues = useMemo(() => (data ? setupIssues({
    clinicHours: data.hours.map((h) => ({ ...h, opens_at: String(h.opens_at), closes_at: String(h.closes_at) })),
    treatments: data.treatments, pros: data.pros.map((p) => ({ id: p.id, name: p.full_name })),
    links: data.links, availability: data.availability, offersEvaluation: form.offers_evaluation,
  }) : []), [data, form.offers_evaluation]);

  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fail = (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' });

  const save = useMutation({
    mutationFn: async () => {
      const hourError = validateHours(hours);
      if (hourError) throw new Error(hourError);
      const { error } = await supabase.from('clinic_service_settings').upsert({ clinic_id: clinicId!, ...formToRow(form), updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' });
      if (error) throw error;
      const { error: delError } = await supabase.from('clinic_business_hours').delete().eq('clinic_id', clinicId!);
      if (delError) throw delError;
      const rows = Object.entries(hours).flatMap(([day, list]) => list.map((h) => ({ clinic_id: clinicId!, day_of_week: Number(day), opens_at: h.opens, closes_at: h.closes })));
      if (rows.length) {
        const { error: insError } = await supabase.from('clinic_business_hours').insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-settings'] }); toast({ title: 'Atendimento salvo' }); },
    onError: fail,
  });

  const addClosure = useMutation({
    mutationFn: async () => {
      if (!newClosure.date) throw new Error('Escolha a data.');
      const { error } = await supabase.from('clinic_closures').upsert({ clinic_id: clinicId!, closed_on: newClosure.date, reason: newClosure.reason || null }, { onConflict: 'clinic_id,closed_on' });
      if (error) throw error;
    },
    onSuccess: () => { setNewClosure({ date: '', reason: '' }); qc.invalidateQueries({ queryKey: ['service-settings'] }); },
    onError: fail,
  });
  const removeClosure = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('clinic_closures').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-settings'] }),
    onError: fail,
  });

  const dayList = (d: number) => hours[d] || [];
  const setDay = (d: number, list: { opens: string; closes: string }[]) => setHours((h) => ({ ...h, [d]: list }));

  return (
    <div className="space-y-4">
      <Card className={`shadow-card ${issues.length ? 'border-amber-300' : 'border-emerald-300'}`}>
        <CardContent className="p-4">
          {issues.length ? (
            <>
              <p className="flex items-center gap-2 font-medium text-amber-800"><AlertTriangle className="h-4 w-4" /> Falta configurar para a agenda e a IA funcionarem direito</p>
              <ul className="mt-2 space-y-1.5 text-sm text-amber-900">{issues.map((i) => (
                <li key={i.text} className="flex flex-wrap items-center gap-2">
                  <span>• {i.text}</span>
                  {i.professionalId && canEdit && (
                    <BrandButton type="button" size="sm" variant="outline" onClick={() => setHoursFor({ id: i.professionalId!, name: data?.pros.find((p) => p.id === i.professionalId)?.full_name || 'Profissional' })}>
                      Definir horários
                    </BrandButton>
                  )}
                  {i.treatmentId && <BrandButton type="button" size="sm" variant="outline" onClick={() => setTab('treatments')}>Escolher profissionais</BrandButton>}
                  {i.code === 'no_professionals' && <BrandButton type="button" size="sm" variant="outline" onClick={() => setTab('professionals')}>Cadastrar profissional</BrandButton>}
                </li>
              ))}</ul>
            </>
          ) : (
            <p className="flex items-center gap-2 font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Tudo pronto: a agenda e a IA têm o que precisam.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Horário de funcionamento da clínica</CardTitle>
          <p className="text-sm text-muted-foreground">Quando a clínica está aberta. Cada profissional só atende dentro deste horário (a agenda de cada um fica em Profissionais/Agenda).</p></CardHeader>
        <CardContent className="space-y-2">
          {DAY_NAMES.map((name, d) => (
            <div key={d} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
              <div className="flex w-36 items-center gap-2">
                <Switch disabled={!canEdit} checked={dayList(d).length > 0} aria-label={`Aberto ${name}`}
                  onCheckedChange={(v) => setDay(d, v ? [{ opens: '09:00', closes: '18:00' }] : [])} />
                <span className="text-sm">{name}</span>
              </div>
              {dayList(d).length === 0 ? <span className="text-sm text-muted-foreground">Fechado</span> : dayList(d).map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input type="time" disabled={!canEdit} className="w-28" value={h.opens} onChange={(e) => setDay(d, dayList(d).map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))} />
                  <span className="text-sm">às</span>
                  <Input type="time" disabled={!canEdit} className="w-28" value={h.closes} onChange={(e) => setDay(d, dayList(d).map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))} />
                  {canEdit && dayList(d).length > 1 && <button type="button" aria-label="Remover intervalo" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => setDay(d, dayList(d).filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              {canEdit && dayList(d).length > 0 && dayList(d).length < 3 && (
                <button type="button" className="text-xs text-primary underline" onClick={() => setDay(d, [...dayList(d), { opens: '14:00', closes: '18:00' }])}>+ intervalo</button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Dias fechados</CardTitle><p className="text-sm text-muted-foreground">Feriados e recessos: ninguém agenda nesses dias.</p></CardHeader>
        <CardContent className="space-y-3">
          {data?.closures.length ? (
            <ul className="divide-y rounded-lg border">{data.closures.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{new Date(`${c.closed_on}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}{c.reason ? ` · ${c.reason}` : ''}</span>
                {canEdit && <button type="button" aria-label="Remover dia" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => removeClosure.mutate(c.id)}><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}</ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum dia fechado cadastrado.</p>}
          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label>Data</Label><Input type="date" value={newClosure.date} onChange={(e) => setNewClosure((c) => ({ ...c, date: e.target.value }))} /></div>
              <div className="min-w-[200px] flex-1 space-y-1"><Label>Motivo</Label><Input placeholder="Ex.: Natal" value={newClosure.reason} onChange={(e) => setNewClosure((c) => ({ ...c, reason: e.target.value }))} /></div>
              <BrandButton type="button" variant="outline" onClick={() => addClosure.mutate()} disabled={addClosure.isPending}><Plus className="h-4 w-4" /> Adicionar</BrandButton>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Formas de pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <Checkbox disabled={!canEdit} checked={form.payment_methods.includes(o.value)}
                    onCheckedChange={(v) => set('payment_methods', v ? [...form.payment_methods, o.value] : form.payment_methods.filter((x) => x !== o.value))} />
                  {o.label}
                </label>
              ))}
            </div>
            {form.payment_methods.includes('credito') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Parcelas no cartão (até)</Label><Input disabled={!canEdit} type="number" min={1} max={24} value={form.max_installments} onChange={(e) => set('max_installments', e.target.value)} /></div>
                <div className="space-y-1"><Label>Parcelar a partir de (R$)</Label><Input disabled={!canEdit} type="number" min={0} value={form.installments_min_value} onChange={(e) => set('installments_min_value', e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1"><Label>Observação</Label><Input disabled={!canEdit} placeholder="Ex.: sem juros até 10x" value={form.payment_notes} onChange={(e) => set('payment_notes', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Estacionamento e planos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Estacionamento</Label>
                <Select disabled={!canEdit} value={form.parking} onValueChange={(v) => set('parking', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PARKING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Observação</Label><Input disabled={!canEdit} placeholder="Ex.: no prédio, 1ª hora grátis" value={form.parking_notes} onChange={(e) => set('parking_notes', e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={form.accepts_insurance} onCheckedChange={(v) => set('accepts_insurance', v)} /> Aceita planos ou convênios</label>
            {form.accepts_insurance && (
              <div className="space-y-1"><Label>Quais (separe por vírgula)</Label><Input disabled={!canEdit} placeholder="Ex.: Unimed, Bradesco Saúde" value={form.insurance_plans} onChange={(e) => set('insurance_plans', e.target.value)} /></div>
            )}
            <div className="space-y-1"><Label>Observação sobre planos</Label><Input disabled={!canEdit} placeholder="Ex.: só para consultas dermatológicas" value={form.insurance_notes} onChange={(e) => set('insurance_notes', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Avaliação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={form.offers_evaluation} onCheckedChange={(v) => set('offers_evaluation', v)} /> A clínica faz avaliação</label>
            {form.offers_evaluation && (
              <>
                <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={form.evaluation_free} onCheckedChange={(v) => set('evaluation_free', v)} /> Avaliação gratuita</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Duração (min)</Label><Input disabled={!canEdit} type="number" min={10} max={240} value={form.evaluation_minutes} onChange={(e) => set('evaluation_minutes', e.target.value)} /></div>
                  {!form.evaluation_free && <div className="space-y-1"><Label>Valor (R$)</Label><Input disabled={!canEdit} type="number" min={0} value={form.evaluation_price} onChange={(e) => set('evaluation_price', e.target.value)} /></div>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Regras da agenda</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Antecedência mínima (horas)</Label><Input disabled={!canEdit} type="number" min={0} value={form.min_notice_hours} onChange={(e) => set('min_notice_hours', e.target.value)} /></div>
            <div className="space-y-1"><Label>Agendar até (dias à frente)</Label><Input disabled={!canEdit} type="number" min={1} max={365} value={form.booking_horizon_days} onChange={(e) => set('booking_horizon_days', e.target.value)} /></div>
            <div className="space-y-1"><Label>Intervalo entre atendimentos (min)</Label><Input disabled={!canEdit} type="number" min={0} max={120} value={form.buffer_minutes} onChange={(e) => set('buffer_minutes', e.target.value)} /></div>
            <div className="space-y-1"><Label>Remarcar com (horas de antecedência)</Label><Input disabled={!canEdit} type="number" min={0} value={form.reschedule_notice_hours} onChange={(e) => set('reschedule_notice_hours', e.target.value)} /></div>
            <div className="col-span-2 space-y-1"><Label>Como a IA fala de preço (padrão)</Label>
              <Select disabled={!canEdit} value={form.price_display} onValueChange={(v) => set('price_display', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRICE_DISPLAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cada tratamento pode ter a sua regra (Configurações &gt; Tratamentos).</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Outras informações</CardTitle><p className="text-sm text-muted-foreground">Só o que não cabe nos campos acima.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Regras e políticas</Label><Textarea disabled={!canEdit} rows={2} placeholder="Ex.: falta sem aviso conta como sessão realizada em pacotes." value={form.policies} onChange={(e) => set('policies', e.target.value)} /></div>
          <div className="space-y-1"><Label>Outras informações</Label><Textarea disabled={!canEdit} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Perguntas frequentes</Label>
            {form.faq.map((f, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[1fr_2fr_auto]">
                <Input disabled={!canEdit} placeholder="Pergunta" value={f.question} onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
                <Input disabled={!canEdit} placeholder="Resposta" value={f.answer} onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                {canEdit && <button type="button" aria-label="Remover pergunta" className="p-2 text-muted-foreground hover:text-destructive" onClick={() => set('faq', form.faq.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {canEdit && <BrandButton type="button" size="sm" variant="outline" onClick={() => set('faq', [...form.faq, { question: '', answer: '' }])}><Plus className="h-3.5 w-3.5" /> Adicionar pergunta</BrandButton>}
          </div>
        </CardContent>
      </Card>

      {canEdit && <BrandButton onClick={() => save.mutate()} disabled={save.isPending || !clinicId}><Save className="h-4 w-4" /> Salvar atendimento</BrandButton>}
      <ProfessionalHoursDialog professional={hoursFor} onClose={() => setHoursFor(null)} />
    </div>
  );
}
