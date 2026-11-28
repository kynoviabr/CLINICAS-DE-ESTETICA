import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBranding } from '@/contexts/BrandingContext';
import { useToast } from '@/hooks/use-toast';
import { useCashFlow } from '@/hooks/useCashFlow';
import { buildCashFlow, type Group } from '@/lib/finance/cashflow';
import { readClinicSetting, upsertClinicSetting } from '@/lib/setup/clinicSetup';

const OPENING_KEY = 'cash_opening_balance';
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const br = (s: string) => s.split('-').reverse().join('/');

type Preset = 'next30' | 'next90' | 'thisMonth' | 'lastMonth';
const PRESETS: Record<Preset, { label: string; range: () => [string, string]; forward: boolean }> = {
  next30: { label: 'Próximos 30 dias', range: () => [iso(new Date()), addDays(30)], forward: true },
  next90: { label: 'Próximos 90 dias', range: () => [iso(new Date()), addDays(90)], forward: true },
  thisMonth: { label: 'Este mês', range: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }, forward: false },
  lastMonth: { label: 'Mês passado', range: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; }, forward: false },
};

/** Fluxo de caixa: o que entrou e saiu e o que vai entrar e sair, com saldo projetado. */
export default function CashFlowPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<Preset>('next30');
  const [group, setGroup] = useState<Group>('week');
  const [from, to] = useMemo(() => PRESETS[preset].range(), [preset]);
  const { data: movements = [], isLoading } = useCashFlow(clinicId, from, to);

  const { data: opening } = useQuery({
    queryKey: ['cash-opening', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const raw = await readClinicSetting(clinicId!, OPENING_KEY);
      try { return raw ? (JSON.parse(raw) as { amount: number; date: string }) : null; } catch { return null; }
    },
  });
  const [openingInput, setOpeningInput] = useState('');
  const forward = PRESETS[preset].forward;
  const startBalance = forward && opening ? Number(opening.amount) : 0;
  const { rows, totals } = useMemo(() => buildCashFlow(movements, group, startBalance), [movements, group, startBalance]);

  const saveOpening = async () => {
    const amount = Number(openingInput.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(amount)) { toast({ title: 'Informe o saldo em reais', variant: 'destructive' }); return; }
    await upsertClinicSetting(clinicId!, OPENING_KEY, JSON.stringify({ amount, date: iso(new Date()) }));
    setOpeningInput('');
    qc.invalidateQueries({ queryKey: ['cash-opening', clinicId] });
    toast({ title: 'Saldo em conta salvo' });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Fluxo de caixa" description="Entradas e saídas realizadas e previstas, com saldo projetado.">
        <Link to="/clinic/financeiro"><BrandButton variant="outline"><ArrowLeft className="h-4 w-4" /> Financeiro</BrandButton></Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/60 p-1">
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <button key={p} type="button" onClick={() => setPreset(p)} className={`rounded-md px-3 py-1.5 text-sm ${preset === p ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>{PRESETS[p].label}</button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border bg-muted/60 p-1">
          {([['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']] as [Group, string][]).map(([g, l]) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={`rounded-md px-3 py-1.5 text-sm ${group === g ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>

      {forward && (
        <Card className="shadow-card"><CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> Saldo em conta</p>
            <p className="text-xs text-muted-foreground">
              {opening ? `${brl(Number(opening.amount))} informado em ${br(opening.date)}. Atualize quando quiser para a projeção ficar certa.` : 'Informe quanto a clínica tem hoje na conta para ver o saldo projetado.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Input className="w-40" inputMode="decimal" placeholder="Saldo hoje (R$)" value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} />
            <BrandButton variant="outline" disabled={!openingInput.trim()} onClick={saveOpening}>Salvar</BrandButton>
          </div>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas</p><p className="text-lg font-bold text-emerald-700">{brl(totals.inRealized + totals.inForecast)}</p><p className="text-[11px] text-muted-foreground">{brl(totals.inRealized)} realizadas · {brl(totals.inForecast)} previstas</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas</p><p className="text-lg font-bold text-rose-700">{brl(totals.outRealized + totals.outForecast)}</p><p className="text-[11px] text-muted-foreground">{brl(totals.outRealized)} realizadas · {brl(totals.outForecast)} previstas</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Resultado do período</p><p className={`text-lg font-bold ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{brl(totals.net)}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{forward ? 'Saldo projetado no fim' : 'Acumulado no período'}</p><p className={`text-lg font-bold ${totals.balance >= 0 ? '' : 'text-rose-700'}`}>{brl(totals.balance)}</p></CardContent></Card>
      </div>

      <Card className="shadow-card"><CardContent className="overflow-x-auto p-0">
        {isLoading ? <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Sem entradas ou saídas neste período.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Período</th><th className="px-3 py-2 text-right">Entradas</th><th className="px-3 py-2 text-right">Saídas</th>
              <th className="px-3 py-2 text-right">Resultado</th><th className="px-3 py-2 text-right">{forward ? 'Saldo' : 'Acumulado'}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{brl(r.inRealized + r.inForecast)}{r.inForecast > 0 && <span className="block text-[11px] text-muted-foreground">{brl(r.inForecast)} previsto</span>}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{brl(r.outRealized + r.outForecast)}{r.outForecast > 0 && <span className="block text-[11px] text-muted-foreground">{brl(r.outForecast)} previsto</span>}</td>
                  <td className={`px-3 py-2 text-right font-medium ${r.net >= 0 ? '' : 'text-rose-700'}`}>{brl(r.net)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${r.balance >= 0 ? '' : 'text-rose-700'}`}>{brl(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">
        Cartão entra pelo valor que a maquininha deposita (já sem a taxa), na data em que cai. Parcelas e contas vencidas aparecem como previstas para hoje.
      </p>
    </div>
  );
}
