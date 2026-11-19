import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, CalendarCheck, CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useWhatsappChannel, useWhatsappTemplates } from '@/hooks/useWhatsapp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { HOURS_OPTIONS, previewReminder, summarizeRuns, type AutomationRun } from '@/lib/automations/reminders';

type Config = { reminder_enabled: boolean; reminder_hours_before: number; reminder_template: string; reminder_language: string };
const DEFAULT: Config = { reminder_enabled: false, reminder_hours_before: 24, reminder_template: 'aura_lembrete_horario', reminder_language: 'pt_BR' };

const STATUS = {
  sent: { label: 'Enviado', icon: CheckCircle2, tone: 'text-emerald-700' },
  failed: { label: 'Falhou', icon: XCircle, tone: 'text-red-700' },
  skipped: { label: 'Não enviado', icon: AlertCircle, tone: 'text-amber-700' },
} as const;

/** Configurações > Automações: lembrete automático pelo WhatsApp oficial, com link para confirmar, remarcar ou cancelar. */
export function AutomationsSettingsTab() {
  const { clinicId, clinicName } = useBranding();
  const { role } = useUserRole();
  const isAdmin = role === 'admin';
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: channel } = useWhatsappChannel(clinicId);
  const connected = channel?.status === 'connected';
  const { data: templates, isLoading: loadingTemplates } = useWhatsappTemplates(clinicId, connected);
  const [form, setForm] = useState<Config>(DEFAULT);
  const [testPhone, setTestPhone] = useState('');

  const { data: saved } = useQuery({
    queryKey: ['clinic-automations', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_automations').select('*').eq('clinic_id', clinicId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (saved) setForm({ ...DEFAULT, ...saved }); }, [saved]);

  const { data: runs = [] } = useQuery({
    queryKey: ['automation-runs', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_runs')
        .select('id, kind, status, detail, recipient_name, created_at, updated_at').eq('clinic_id', clinicId!)
        .order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []) as AutomationRun[];
    },
  });
  const stats = useMemo(() => summarizeRuns(runs), [runs]);

  const usable = (templates || []).filter((t) => t.variables === 3);
  const selectedTemplate = usable.find((t) => t.name === form.reminder_template && t.language === form.reminder_language);
  const blocker = !connected ? 'Conecte o WhatsApp em Configurações > WhatsApp para ligar o lembrete.'
    : !loadingTemplates && !selectedTemplate ? 'O modelo escolhido ainda não foi aprovado pela Meta. Escolha um modelo aprovado.'
      : null;

  const save = useMutation({
    mutationFn: async (next: Config) => {
      if (next.reminder_enabled && blocker) throw new Error(blocker);
      const { error } = await supabase.from('clinic_automations').upsert({ clinic_id: clinicId!, ...next, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ['clinic-automations', clinicId] });
      toast({ title: 'Automação salva', description: next.reminder_enabled ? `Lembrete ligado: ${next.reminder_hours_before} h antes de cada atendimento.` : 'Lembrete desligado.' });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('automacoes', { body: { action: 'test', clinicId, phone: testPhone, name: 'Teste' } });
      const body = (data || (await (error as { context?: Response } | null)?.context?.json?.().catch(() => null))) as { ok?: boolean; error?: string } | null;
      if (!body?.ok) throw new Error(body?.error || 'Não foi possível enviar o teste.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-runs', clinicId] });
      toast({ title: 'Teste enviado', description: 'Confira no WhatsApp do número informado.' });
    },
    onError: (e: Error) => toast({ title: 'Teste não enviado', description: e.message, variant: 'destructive' }),
  });

  const preview = previewReminder(selectedTemplate?.body, clinicName || 'sua clínica');

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="border-b pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4 text-primary" /> Lembrete de atendimento</CardTitle>
              <CardDescription className="text-xs">
                Antes de cada atendimento marcado, o paciente recebe no WhatsApp oficial da clínica um lembrete com o link para confirmar, remarcar ou cancelar.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch
                checked={form.reminder_enabled}
                disabled={!isAdmin || save.isPending}
                onCheckedChange={(v) => { const next = { ...form, reminder_enabled: v }; setForm(next); save.mutate(next); }}
                aria-label="Lembrete automático"
              />
              {form.reminder_enabled ? 'Ligado' : 'Desligado'}
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {blocker && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {blocker}</p>
          )}
          {!isAdmin && <p className="text-xs text-muted-foreground">Só a administração da clínica altera as automações.</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quando enviar</Label>
              <Select disabled={!isAdmin} value={String(form.reminder_hours_before)} onValueChange={(v) => setForm({ ...form, reminder_hours_before: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOURS_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Envia das 8h às 20h. Só para atendimentos ainda não confirmados.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo aprovado pela Meta</Label>
              <Select disabled={!isAdmin || !connected || !usable.length} value={selectedTemplate ? `${form.reminder_template}|${form.reminder_language}` : undefined}
                onValueChange={(v) => { const [name, language] = v.split('|'); setForm({ ...form, reminder_template: name, reminder_language: language }); }}>
                <SelectTrigger><SelectValue placeholder={loadingTemplates ? 'Carregando…' : 'Nenhum modelo aprovado'} /></SelectTrigger>
                <SelectContent>{usable.map((t) => <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Precisa ter 3 campos: nome, clínica e data com o link.</p>
            </div>
          </div>

          {preview && (
            <div className="space-y-1.5">
              <Label>Como o paciente recebe</Label>
              <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">{preview}</p>
            </div>
          )}

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <BrandButton size="sm" onClick={() => save.mutate(form)} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </BrandButton>
            </div>
          )}

          {isAdmin && connected && (
            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="test-phone">Enviar um teste para o seu WhatsApp</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="test-phone" inputMode="tel" placeholder="(11) 99999-9999" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="sm:max-w-xs" />
                <BrandButton size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending || testPhone.replace(/\D/g, '').length < 10 || !selectedTemplate}>
                  {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar teste
                </BrandButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-base">Histórico de envios</CardTitle>
          <CardDescription className="text-xs">Este mês: {stats.sent} enviados · {stats.failed} com falha · {stats.skipped} não enviados (sem telefone).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Nenhum envio ainda.</p>
          ) : (
            <ul className="divide-y">
              {runs.map((r) => {
                const s = STATUS[r.status];
                const Icon = s.icon;
                return (
                  <li key={r.id} className="flex items-start gap-3 p-3 text-sm">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate"><span className="font-medium">{r.recipient_name || 'Paciente'}</span>{r.kind === 'reminder_test' ? ' · teste' : ''}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.label}{r.detail ? ` · ${r.detail}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(r.updated_at || r.created_at), 'dd/MM HH:mm', { locale: ptBR })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
