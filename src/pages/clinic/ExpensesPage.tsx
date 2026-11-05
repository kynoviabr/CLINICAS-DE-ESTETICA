import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, FileBarChart, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useClinicFeatures } from '@/hooks/useClinicFeatures';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { EXPENSE_CATEGORIES } from '@/lib/finance/dre';
import { monthBounds, monthLabel, shiftMonth } from '@/lib/finance/simpleFinance';
import { formatBRL } from '@/lib/proposals/sale';

type Expense = Tables<'expenses'>;
type Form = { id: string | null; amount: string; date: string; category: string; otherCategory: string; description: string; paid: boolean; recurring: boolean; isCopy: boolean };

const OTHER = '__outra__';
const toNumber = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

export default function ExpensesPage() {
  const { clinicId } = useUserRole();
  const { isEnabled } = useClinicFeatures();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [form, setForm] = useState<Form | null>(null);
  const { start, end } = monthBounds(month);

  // Despesas fixas ("repete todo mês") aparecem sozinhas ao abrir o mês.
  useEffect(() => {
    if (!clinicId) return;
    supabase.rpc('ensure_recurring_expenses', { p_clinic_id: clinicId, p_month: start }).then(({ data }) => {
      if (Number(data) > 0) qc.invalidateQueries({ queryKey: ['expenses'] });
    });
  }, [clinicId, start, qc]);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', clinicId, month],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*')
        .eq('clinic_id', clinicId!).gte('expense_date', start).lte('expense_date', end).order('expense_date');
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!clinicId,
  });

  const { data: usedCategories = [] } = useQuery({
    queryKey: ['expense-categories', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('category').eq('clinic_id', clinicId!).limit(1000);
      return [...new Set((data || []).map((r) => r.category))];
    },
    enabled: !!clinicId,
  });
  const categories = useMemo(
    () => [...EXPENSE_CATEGORIES, ...usedCategories.filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c)).sort()],
    [usedCategories],
  );

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const toPay = expenses.filter((e) => !e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expense-categories'] });
    qc.invalidateQueries({ queryKey: ['dre'] });
  };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const amount = toNumber(f.amount);
      const category = (f.category === OTHER ? f.otherCategory : f.category).trim();
      if (!(amount > 0)) throw new Error('Informe o valor.');
      if (!category) throw new Error('Escolha a categoria.');
      if (!f.date) throw new Error('Informe a data.');
      const payload = {
        clinic_id: clinicId!, amount, category, description: f.description.trim() || null,
        expense_date: f.date, paid: f.paid, recurring: f.isCopy ? false : f.recurring,
      };
      const { error } = f.id
        ? await supabase.from('expenses').update(payload).eq('id', f.id)
        : await supabase.from('expenses').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setForm(null); toast({ title: 'Despesa salva' }); },
    onError: (err: Error) => toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' }),
  });

  const togglePaid = useMutation({
    mutationFn: async (e: Expense) => {
      const { error } = await supabase.from('expenses').update({ paid: !e.paid }).eq('id', e.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (e: Expense) => {
      const { error } = await supabase.from('expenses').delete().eq('id', e.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: 'Despesa excluída' }); },
    onError: (err: Error) => toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' }),
  });

  const openNew = () => setForm({
    id: null, amount: '', date: month === format(new Date(), 'yyyy-MM') ? format(new Date(), 'yyyy-MM-dd') : start,
    category: '', otherCategory: '', description: '', paid: true, recurring: false, isCopy: false,
  });
  const openEdit = (e: Expense) => setForm({
    id: e.id, amount: String(e.amount).replace('.', ','), date: e.expense_date,
    category: categories.includes(e.category) ? e.category : OTHER, otherCategory: categories.includes(e.category) ? '' : e.category,
    description: e.description ?? '', paid: e.paid, recurring: e.recurring, isCopy: !!e.recurrence_parent,
  });

  if (!isEnabled('expenses')) {
    return (
      <div>
        <PageHeader title="Despesas" />
        <p className="text-sm text-muted-foreground">Despesas está desligado. Para usar, ligue em Configurações › Geral › Funcionalidades.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Despesas" description="O que a clínica gastou no mês: aluguel, anúncios, contador, material...">
        <Link to="/clinic/financeiro/dre"><BrandButton variant="outline"><FileBarChart className="w-4 h-4" /> DRE</BrandButton></Link>
        <BrandButton onClick={openNew}><Plus className="w-4 h-4" /> Nova despesa</BrandButton>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
        <h2 className="min-w-[180px] text-center text-lg font-semibold">{monthLabel(month)}</h2>
        <button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-xl font-bold">{formatBRL(total)}</p><p className="text-xs text-muted-foreground">Despesas do mês</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-xl font-bold text-amber-700">{formatBRL(toPay)}</p><p className="text-xs text-muted-foreground">A pagar</p>
        </CardContent></Card>
        <Card className="col-span-2 shadow-card sm:col-span-1"><CardContent className="p-3">
          <p className="text-xl font-bold">{expenses.length}</p><p className="text-xs text-muted-foreground">Lançamentos</p>
        </CardContent></Card>
      </div>

      {byCategory.length > 0 && (
        <Card className="mb-4 shadow-card"><CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">Por categoria</p>
          {byCategory.map(([cat, value]) => (
            <div key={cat} className="text-sm">
              <div className="flex justify-between"><span>{cat}</span><span className="font-medium">{formatBRL(value)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (value / total) * 100)}%` }} /></div>
            </div>
          ))}
        </CardContent></Card>
      )}

      <Card className="shadow-card"><CardContent className="p-0">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Nenhuma despesa em {monthLabel(month).toLowerCase()}</p>
            <p className="mt-1 text-sm text-muted-foreground">Lance aluguel, contador e outras fixas com "repete todo mês" e elas aparecem sozinhas nos próximos meses.</p>
            <BrandButton className="mt-4" onClick={openNew}><Plus className="w-4 h-4" /> Nova despesa</BrandButton>
          </div>
        ) : (
          <ul className="divide-y">
            {expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="w-12 text-xs text-muted-foreground">{format(parseISO(e.expense_date), 'dd/MM')}</div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {e.category}
                    {(e.recurring || e.recurrence_parent) && <span title="Repete todo mês"><Repeat className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                  </p>
                  {e.description && <p className="truncate text-xs text-muted-foreground">{e.description}</p>}
                </div>
                <span className="font-semibold">{formatBRL(Number(e.amount))}</span>
                <button
                  type="button"
                  onClick={() => togglePaid.mutate(e)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  title="Clique para mudar"
                >
                  {e.paid ? 'Pago' : 'A pagar'}
                </button>
                <BrandButton size="sm" variant="ghost" aria-label="Editar" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5" /></BrandButton>
                <BrandButton size="sm" variant="ghost" aria-label="Excluir" onClick={() => { if (window.confirm('Excluir esta despesa?')) remove.mutate(e); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </BrandButton>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? 'Editar despesa' : 'Nova despesa'}</DialogTitle></DialogHeader>
          {form && (
            <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); save.mutate(form); }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Valor (R$) *</Label>
                  <Input inputMode="decimal" autoFocus value={form.amount} onChange={(ev) => setForm({ ...form, amount: ev.target.value })} placeholder="0,00" required />
                </div>
                <div className="space-y-1.5"><Label>Data *</Label>
                  <Input type="date" value={form.date} onChange={(ev) => setForm({ ...form, date: ev.target.value })} required />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Categoria *</Label>
                <Select value={form.category} onValueChange={(v) => v && setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value={OTHER}>Outra categoria…</SelectItem>
                  </SelectContent>
                </Select>
                {form.category === OTHER && (
                  <Input value={form.otherCategory} onChange={(ev) => setForm({ ...form, otherCategory: ev.target.value })} placeholder="Nome da categoria" />
                )}
              </div>
              <div className="space-y-1.5"><Label>Descrição</Label>
                <Input value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} placeholder="Ex.: Instagram Ads, conta de luz" />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Já foi pago</span>
                <Switch checked={form.paid} onCheckedChange={(v) => setForm({ ...form, paid: v })} />
              </label>
              {!form.isCopy && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Repete todo mês <span className="block text-xs text-muted-foreground">Aluguel, contador, internet… entra sozinha nos próximos meses.</span></span>
                  <Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} />
                </label>
              )}
              <BrandButton type="submit" className="w-full" disabled={save.isPending}>Salvar</BrandButton>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
