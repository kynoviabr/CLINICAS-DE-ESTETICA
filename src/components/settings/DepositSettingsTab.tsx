import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useDepositConfig } from '@/hooks/useDepositConfig';
import { upsertClinicSetting } from '@/lib/setup/clinicSetup';
import { DEPOSIT_CONFIG_KEY, defaultPolicyText, type DepositConfig } from '@/lib/finance/deposit';
import { PIX_KEY_TYPES, normalizePixKey, pixCopyPaste, type PixKeyType } from '@/lib/finance/pix';
import { errorMessage } from '@/lib/errors';

const toNumber = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.'));
const num = (v: number) => String(v).replace('.', ',');

/** Configurações › Pagamentos: chave Pix da clínica e regras do sinal para garantir o horário. */
export function DepositSettingsTab() {
  const { clinicId, role } = useUserRole();
  const { config, isLoading } = useDepositConfig(clinicId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<DepositConfig & { amountEval: string; amountProc: string }>({ ...config, amountEval: num(config.amount_evaluation), amountProc: num(config.amount_procedure) });
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'admin';

  useEffect(() => {
    if (!isLoading) setForm({ ...config, amountEval: num(config.amount_evaluation), amountProc: num(config.amount_procedure) });
  }, [isLoading, config]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const keyType = PIX_KEY_TYPES.find((t) => t.value === form.pix_key_type) ?? PIX_KEY_TYPES[0];
  const normalizedKey = normalizePixKey(form.pix_key_type, form.pix_key);
  const preview = useMemo(
    () => (normalizedKey && form.pix_name.trim() && form.pix_city.trim()
      ? pixCopyPaste({ key: normalizedKey, name: form.pix_name, city: form.pix_city, amount: toNumber(form.amountEval) || 0, txid: 'TESTE' })
      : null),
    [normalizedKey, form.pix_name, form.pix_city, form.amountEval],
  );

  const save = async () => {
    if (!clinicId) return;
    if (form.pix_key && !normalizedKey) { toast({ title: 'Confira a chave Pix', description: `Não parece um(a) ${keyType.label.toLowerCase()} válido(a).`, variant: 'destructive' }); return; }
    const amountEval = toNumber(form.amountEval);
    const amountProc = toNumber(form.amountProc);
    if (!(amountEval > 0) || !(amountProc > 0)) { toast({ title: 'Informe os valores do sinal', variant: 'destructive' }); return; }
    const value: DepositConfig = {
      pix_key_type: form.pix_key_type, pix_key: normalizedKey || '', pix_name: form.pix_name.trim(), pix_city: form.pix_city.trim(),
      amount_evaluation: amountEval, amount_procedure: amountProc,
      pay_hours: Math.max(1, Math.round(Number(form.pay_hours) || 24)),
      notice_hours: Math.max(0, Math.round(Number(form.notice_hours) || 0)),
      credit_days: Math.max(1, Math.round(Number(form.credit_days) || 90)),
      default_on: form.default_on, policy_text: form.policy_text.trim(),
    };
    setSaving(true);
    try {
      await upsertClinicSetting(clinicId, DEPOSIT_CONFIG_KEY, JSON.stringify(value));
      qc.invalidateQueries({ queryKey: ['deposit-config'] });
      toast({ title: 'Pagamentos salvos' });
    } catch (err) {
      toast({ title: 'Não foi possível salvar', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /> Pix da clínica</CardTitle>
          <CardDescription>O sinal cai direto na conta da clínica. O sistema só monta o QR Code e o código "copia e cola".</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label>Tipo de chave</Label>
              <Select value={form.pix_key_type} onValueChange={(v) => set('pix_key_type', v as PixKeyType)} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PIX_KEY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pix-key">Chave Pix</Label>
              <Input id="pix-key" value={form.pix_key} onChange={(e) => set('pix_key', e.target.value)} placeholder={keyType.placeholder} disabled={!canEdit}
                aria-invalid={!!form.pix_key && !normalizedKey} />
              {form.pix_key && !normalizedKey && <p className="text-xs text-destructive">Chave inválida para o tipo escolhido.</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pix-name">Nome do recebedor</Label>
              <Input id="pix-name" value={form.pix_name} onChange={(e) => set('pix_name', e.target.value)} placeholder="Como aparece no banco" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pix-city">Cidade</Label>
              <Input id="pix-city" value={form.pix_city} onChange={(e) => set('pix_city', e.target.value)} placeholder="Ex.: Guarujá" disabled={!canEdit} />
            </div>
          </div>
          {preview && (
            <p className="break-all rounded-lg bg-muted/60 px-3 py-2 font-mono text-[11px] text-muted-foreground" title="Código de teste">
              {preview}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Sinal para garantir o horário</CardTitle>
          <CardDescription>O valor é abatido do tratamento. Na falta, não é devolvido. Estes valores vêm preenchidos no agendamento e podem ser trocados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-eval">Sinal da avaliação (R$)</Label>
              <Input id="dep-eval" inputMode="decimal" value={form.amountEval} onChange={(e) => set('amountEval', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-proc">Sinal de procedimento (R$)</Label>
              <Input id="dep-proc" inputMode="decimal" value={form.amountProc} onChange={(e) => set('amountProc', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-pay">Prazo para pagar (horas)</Label>
              <Input id="dep-pay" type="number" min={1} value={form.pay_hours} onChange={(e) => set('pay_hours', Number(e.target.value))} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-notice">Aviso para remarcar (horas)</Label>
              <Input id="dep-notice" type="number" min={0} value={form.notice_hours} onChange={(e) => set('notice_hours', Number(e.target.value))} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-credit">Validade do crédito (dias)</Label>
              <Input id="dep-credit" type="number" min={1} value={form.credit_days} onChange={(e) => set('credit_days', Number(e.target.value))} disabled={!canEdit} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              Cobrar sinal por padrão
              <span className="block text-xs text-muted-foreground">No agendamento, "Cobrar sinal?" já vem marcado como Sim.</span>
            </span>
            <Switch checked={form.default_on} onCheckedChange={(v) => set('default_on', v)} disabled={!canEdit} />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="dep-policy">Condições mostradas à cliente</Label>
            <Textarea id="dep-policy" rows={3} value={form.policy_text} onChange={(e) => set('policy_text', e.target.value)}
              placeholder={defaultPolicyText(Number(form.notice_hours) || 24)} disabled={!canEdit} />
            <p className="text-xs text-muted-foreground">Em branco, usa o texto sugerido. O recibo traz as condições completas. Vale pedir ao advogado da clínica para revisar.</p>
          </div>
          {canEdit ? (
            <BrandButton onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar pagamentos'}</BrandButton>
          ) : (
            <p className="text-xs text-muted-foreground">Só a administradora altera estas configurações.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
