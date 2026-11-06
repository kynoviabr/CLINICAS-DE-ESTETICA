import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { type AuraInfo, type PriceDisplay, PRICE_DISPLAY_LABEL, parseAuraInfo } from '@/lib/whatsapp/auraInfo';

const SETTING_KEY = 'aura_info';

/** Informações que a IA da Aura pode usar ao sugerir respostas no WhatsApp. */
export default function AuraInfoCard() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [info, setInfo] = useState<AuraInfo>({ priceDisplay: 'exact', faq: [], priceOverrides: {} });

  const { data } = useQuery({
    queryKey: ['aura-info', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const [{ data: setting }, { data: treatments }] = await Promise.all([
        supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', SETTING_KEY).maybeSingle(),
        supabase.from('treatments').select('id, name, price').eq('clinic_id', clinicId!).eq('is_active', true).order('name'),
      ]);
      return { info: parseAuraInfo(setting?.value), treatments: treatments || [] };
    },
  });
  useEffect(() => { if (data) setInfo(data.info); }, [data]);

  const set = <K extends keyof AuraInfo>(k: K, v: AuraInfo[K]) => setInfo((p) => ({ ...p, [k]: v }));
  const faq = info.faq || [];

  const save = useMutation({
    mutationFn: async () => {
      const clean: AuraInfo = { ...info, faq: faq.filter((f) => f.question.trim() && f.answer.trim()) };
      const { error } = await supabase.from('clinic_settings')
        .upsert({ clinic_id: clinicId!, key: SETTING_KEY, value: JSON.stringify(clean) }, { onConflict: 'clinic_id,key' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aura-info'] }); toast({ title: 'Informações para a IA salvas' }); },
    onError: (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card className="mt-4 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Informações para a IA</CardTitle>
        <p className="text-sm text-muted-foreground">
          A IA usa estes dados, os tratamentos ativos e os profissionais para sugerir respostas em Conversas.
          O que não estiver aqui ela não inventa: diz que vai confirmar com a equipe.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Horário de funcionamento" placeholder="Seg a sex, 9h às 19h; sáb, 9h às 13h" value={info.hours} onChange={(v) => set('hours', v)} />
          <Field label="Formas de pagamento" placeholder="Pix, débito, crédito em até 10x sem juros acima de R$ 1.000" value={info.payment} onChange={(v) => set('payment', v)} />
          <Field label="Estacionamento" placeholder="Conveniado no prédio" value={info.parking} onChange={(v) => set('parking', v)} />
          <div className="space-y-1.5">
            <Label>Como a IA fala de preço</Label>
            <Select value={info.priceDisplay || 'exact'} onValueChange={(v) => set('priceDisplay', v as PriceDisplay)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRICE_DISPLAY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Regras e políticas</Label>
          <Textarea rows={2} placeholder="Remarcação com 24h de antecedência; falta sem aviso conta como sessão em pacotes." value={info.policies || ''} onChange={(e) => set('policies', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Outras informações</Label>
          <Textarea rows={2} placeholder="Avaliação gratuita de 30 minutos com a Dra. Carla." value={info.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Perguntas frequentes</Label>
          {faq.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_2fr_auto]">
              <Input placeholder="Pergunta" value={f.question} onChange={(e) => set('faq', faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
              <Input placeholder="Resposta" value={f.answer} onChange={(e) => set('faq', faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
              <button type="button" aria-label="Remover pergunta" className="rounded-btn p-2 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => set('faq', faq.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <BrandButton type="button" size="sm" variant="outline" onClick={() => set('faq', [...faq, { question: '', answer: '' }])}><Plus className="h-3.5 w-3.5" /> Adicionar pergunta</BrandButton>
        </div>

        {!!data?.treatments.length && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Preço por tratamento (opcional)</summary>
            <ul className="mt-3 divide-y">
              {data.treatments.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{t.name}</span>
                  <Select value={info.priceOverrides?.[t.id] || 'default'} onValueChange={(v) => {
                    const next = { ...(info.priceOverrides || {}) };
                    if (v === 'default') delete next[t.id]; else next[t.id] = v as PriceDisplay;
                    set('priceOverrides', next);
                  }}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Igual ao padrão</SelectItem>
                      {Object.entries(PRICE_DISPLAY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </details>
        )}

        <BrandButton onClick={() => save.mutate()} disabled={save.isPending || !clinicId}><Save className="h-4 w-4" /> Salvar informações</BrandButton>
      </CardContent>
    </Card>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5"><Label>{label}</Label><Input placeholder={placeholder} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>
  );
}
