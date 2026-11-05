import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ArrowDownToLine, History, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { useStock, type StockMaterial } from '@/hooks/useStock';
import { supabase } from '@/integrations/supabase/client';
import { STATUS_LABEL, formatQty, type ItemForecast, type ItemStatus } from '@/lib/stock/forecast';

const STATUS_STYLE: Record<ItemStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  baixo: 'bg-amber-50 text-amber-700',
  zerado: 'bg-slate-100 text-slate-600',
  vai_faltar: 'bg-rose-50 text-rose-700',
  sem_controle: 'bg-muted text-muted-foreground',
};

const toNumber = (v: string) => Number(v.replace(',', '.'));

type MaterialForm = { id: string | null; name: string; type: string; unit: string; unit_cost: string; stock_min: string };
type EntryForm = { itemId: string; quantity: string; unitCost: string; lot: string; expiresAt: string; notes: string };
type AdjustForm = { itemId: string; mode: 'perda' | 'contagem'; quantity: string; notes: string };

const emptyMaterial: MaterialForm = { id: null, name: '', type: 'supply', unit: 'un', unit_cost: '', stock_min: '' };

export default function StockPage() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const stock = useStock(clinicId);
  const [period, setPeriod] = useState<'week' | 'day'>('week');
  const [material, setMaterial] = useState<MaterialForm | null>(null);
  const [entry, setEntry] = useState<EntryForm | null>(null);
  const [adjust, setAdjust] = useState<AdjustForm | null>(null);
  const [historyItem, setHistoryItem] = useState<StockMaterial | null>(null);

  const rows: ItemForecast[] = period === 'week' ? stock.week : stock.day;
  const byId = new Map(stock.materials.map((m) => [m.id, m]));
  const counts = {
    vai_faltar: stock.week.filter((i) => i.status === 'vai_faltar').length,
    baixo: stock.week.filter((i) => i.status === 'baixo').length,
    zerado: stock.week.filter((i) => i.status === 'zerado').length,
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock'] });
    qc.invalidateQueries({ queryKey: ['stock-history'] });
  };
  const fail = (err: Error) => toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' });

  const saveMaterial = useMutation({
    mutationFn: async (f: MaterialForm) => {
      if (!f.name.trim()) throw new Error('Informe o nome do material.');
      const payload = {
        clinic_id: clinicId!, name: f.name.trim(), type: f.type, unit: f.unit.trim() || 'un',
        unit_cost: toNumber(f.unit_cost) || 0, stock_min: toNumber(f.stock_min) || 0, status: 'active',
      };
      const { error } = f.id
        ? await supabase.from('cost_items').update(payload).eq('id', f.id)
        : await supabase.from('cost_items').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setMaterial(null); toast({ title: 'Material salvo' }); },
    onError: fail,
  });

  const saveEntry = useMutation({
    mutationFn: async (f: EntryForm) => {
      const qty = toNumber(f.quantity);
      if (!f.itemId || !(qty > 0)) throw new Error('Escolha o material e a quantidade.');
      const { error } = await supabase.from('stock_movements').insert({
        clinic_id: clinicId!, cost_item_id: f.itemId, kind: 'entrada', quantity: qty,
        unit_cost: toNumber(f.unitCost) || null, lot: f.lot.trim() || null,
        expires_at: f.expiresAt || null, notes: f.notes.trim() || null, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setEntry(null); toast({ title: 'Entrada registrada' }); },
    onError: fail,
  });

  const saveAdjust = useMutation({
    mutationFn: async (f: AdjustForm) => {
      const item = byId.get(f.itemId);
      const qty = toNumber(f.quantity);
      if (!item || Number.isNaN(qty)) throw new Error('Escolha o material e a quantidade.');
      // Perda: tira a quantidade. Contagem: informa quanto tem de verdade; lança a diferença.
      const delta = f.mode === 'perda' ? -Math.abs(qty) : Math.round((qty - item.balance) * 1000) / 1000;
      if (delta === 0) return;
      const { error } = await supabase.from('stock_movements').insert({
        clinic_id: clinicId!, cost_item_id: f.itemId, kind: f.mode === 'perda' ? 'perda' : 'ajuste',
        quantity: delta, notes: f.notes.trim() || null, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setAdjust(null); toast({ title: 'Estoque ajustado' }); },
    onError: fail,
  });

  const history = useQuery({
    queryKey: ['stock-history', historyItem?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_movements')
        .select('id, kind, quantity, unit_cost, lot, expires_at, notes, created_at')
        .eq('cost_item_id', historyItem!.id).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!historyItem,
  });

  const unit = (id: string) => byId.get(id)?.unit || 'un';
  const kindLabel: Record<string, string> = { entrada: 'Entrada', consumo: 'Sessão', perda: 'Perda', ajuste: 'Contagem' };

  return (
    <div>
      <PageHeader title="Estoque" description="Material da clínica, o que a agenda vai usar e o que precisa comprar">
        {stock.canManage && (
          <>
            <BrandButton variant="outline" onClick={() => setMaterial(emptyMaterial)}>
              <PackagePlus className="w-4 h-4" /> Novo material
            </BrandButton>
            <BrandButton onClick={() => setEntry({ itemId: '', quantity: '', unitCost: '', lot: '', expiresAt: '', notes: '' })} disabled={stock.materials.length === 0}>
              <ArrowDownToLine className="w-4 h-4" /> Entrada
            </BrandButton>
          </>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Vai faltar na semana', value: counts.vai_faltar, tone: 'text-rose-700' },
          { label: 'Acabando', value: counts.baixo, tone: 'text-amber-700' },
          { label: 'Zerados', value: counts.zerado, tone: 'text-slate-700' },
          { label: 'Vencendo em 10 dias', value: stock.expiring.length, tone: 'text-orange-700' },
        ].map((c) => (
          <Card key={c.label} className="shadow-card"><CardContent className="p-3">
            <p className={`text-xl font-bold ${c.tone}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {stock.expiring.length > 0 && (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Vencendo em até 10 dias</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {stock.expiring.map((e, i) => (
              <li key={i}>{byId.get(e.cost_item_id)?.name} · {formatQty(e.quantity)} {unit(e.cost_item_id)} · vence {format(parseISO(e.expires_at!), 'dd/MM/yyyy')}</li>
            ))}
          </ul>
        </div>
      )}

      {!stock.hasRecipes && stock.materials.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Para a baixa automática e a previsão pela agenda, diga em cada tratamento o material que ele usa
          (Tratamentos › editar › Composição de Custo).
        </p>
      )}

      {stock.materials.some((m) => !m.tracked) && (
        <p className="mb-3 text-xs text-muted-foreground">
          Os materiais dos tratamentos do catálogo já vêm cadastrados com custo de referência de mercado. Ajuste o custo ao seu
          fornecedor e dê a primeira entrada: a partir daí o material entra na previsão e nos alertas.
        </p>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Agenda considerada:</p>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'week' | 'day')}>
          <TabsList>
            <TabsTrigger value="day">Hoje</TabsTrigger>
            <TabsTrigger value="week">Próximos 7 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {stock.isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : stock.materials.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium">Nenhum material cadastrado</p>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre o que a clínica usa (toxina, ácidos, luvas, agulhas…) para controlar o estoque.</p>
              {stock.canManage && (
                <BrandButton className="mt-4" onClick={() => setMaterial(emptyMaterial)}><PackagePlus className="w-4 h-4" /> Novo material</BrandButton>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <button type="button" className="truncate text-left text-sm font-medium hover:underline" onClick={() => stock.canManage && setMaterial({
                      id: item.id, name: item.name, type: byId.get(item.id)?.type || 'supply', unit: item.unit || 'un',
                      unit_cost: String(byId.get(item.id)?.unit_cost ?? ''), stock_min: String(item.stock_min || ''),
                    })}>
                      {item.name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Saldo <strong className="text-foreground">{formatQty(item.balance)} {item.unit || 'un'}</strong>
                      {item.stock_min > 0 && <> · mínimo {formatQty(item.stock_min)}</>}
                      {item.needed > 0 && <> · agenda usa {formatQty(item.needed)}</>}
                      {item.shortfall > 0 && <> · <span className="font-semibold text-rose-700">comprar {formatQty(item.shortfall)}</span></>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                  <div className="flex items-center gap-1">
                    {stock.canManage && (
                      <>
                        <BrandButton size="sm" variant="outline" title="Entrada" onClick={() => setEntry({ itemId: item.id, quantity: '', unitCost: '', lot: '', expiresAt: '', notes: '' })}>
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </BrandButton>
                        <BrandButton size="sm" variant="outline" title="Perda ou contagem" onClick={() => setAdjust({ itemId: item.id, mode: 'contagem', quantity: '', notes: '' })}>
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </BrandButton>
                      </>
                    )}
                    <BrandButton size="sm" variant="ghost" title="Histórico" onClick={() => setHistoryItem(byId.get(item.id) ?? null)}>
                      <History className="h-3.5 w-3.5" />
                    </BrandButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Material */}
      <Dialog open={!!material} onOpenChange={(o) => { if (!o) setMaterial(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{material?.id ? 'Editar material' : 'Novo material'}</DialogTitle></DialogHeader>
          {material && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMaterial.mutate(material); }}>
              <div className="space-y-1.5"><Label>Nome *</Label>
                <Input value={material.name} onChange={(e) => setMaterial({ ...material, name: e.target.value })} placeholder="Ex.: Toxina botulínica 100U" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Tipo</Label>
                  <Select value={material.type} onValueChange={(v) => setMaterial({ ...material, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supply">Insumo/Descartável</SelectItem>
                      <SelectItem value="medication">Medicamento/Produto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Unidade</Label>
                  <Input value={material.unit} onChange={(e) => setMaterial({ ...material, unit: e.target.value })} placeholder="un, ml, frasco, par" />
                </div>
                <div className="space-y-1.5"><Label>Custo por unidade (R$)</Label>
                  <Input inputMode="decimal" value={material.unit_cost} onChange={(e) => setMaterial({ ...material, unit_cost: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Estoque mínimo</Label>
                  <Input inputMode="decimal" value={material.stock_min} onChange={(e) => setMaterial({ ...material, stock_min: e.target.value })} placeholder="0" />
                </div>
              </div>
              <BrandButton type="submit" className="w-full" disabled={saveMaterial.isPending}>Salvar</BrandButton>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Entrada */}
      <Dialog open={!!entry} onOpenChange={(o) => { if (!o) setEntry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Entrada de material</DialogTitle>
            <DialogDescription>Chegou material: some ao saldo. O custo informado atualiza o custo médio.</DialogDescription>
          </DialogHeader>
          {entry && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveEntry.mutate(entry); }}>
              <div className="space-y-1.5"><Label>Material *</Label>
                <Select value={entry.itemId} onValueChange={(v) => v && setEntry({ ...entry, itemId: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{stock.materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Quantidade * {entry.itemId && `(${unit(entry.itemId)})`}</Label>
                  <Input inputMode="decimal" value={entry.quantity} onChange={(e) => setEntry({ ...entry, quantity: e.target.value })} required />
                </div>
                <div className="space-y-1.5"><Label>Custo por unidade (R$)</Label>
                  <Input inputMode="decimal" value={entry.unitCost} onChange={(e) => setEntry({ ...entry, unitCost: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Lote</Label>
                  <Input value={entry.lot} onChange={(e) => setEntry({ ...entry, lot: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Validade</Label>
                  <Input type="date" value={entry.expiresAt} onChange={(e) => setEntry({ ...entry, expiresAt: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Observação</Label>
                <Input value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} placeholder="Ex.: nota fiscal, fornecedor" />
              </div>
              <BrandButton type="submit" className="w-full" disabled={saveEntry.isPending}>Registrar entrada</BrandButton>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Perda / contagem */}
      <Dialog open={!!adjust} onOpenChange={(o) => { if (!o) setAdjust(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar estoque · {adjust && byId.get(adjust.itemId)?.name}</DialogTitle>
            <DialogDescription>Saldo no sistema: {adjust && formatQty(byId.get(adjust.itemId)?.balance ?? 0)} {adjust && unit(adjust.itemId)}</DialogDescription>
          </DialogHeader>
          {adjust && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveAdjust.mutate(adjust); }}>
              <Tabs value={adjust.mode} onValueChange={(v) => setAdjust({ ...adjust, mode: v as AdjustForm['mode'] })}>
                <TabsList className="w-full">
                  <TabsTrigger value="contagem" className="flex-1">Contagem</TabsTrigger>
                  <TabsTrigger value="perda" className="flex-1">Perda / vencido</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-1.5">
                <Label>{adjust.mode === 'contagem' ? 'Quanto tem de verdade' : 'Quanto perdeu'} ({unit(adjust.itemId)})</Label>
                <Input inputMode="decimal" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} required />
              </div>
              <div className="space-y-1.5"><Label>Motivo</Label>
                <Input value={adjust.notes} onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })} placeholder={adjust.mode === 'perda' ? 'Ex.: frasco quebrou, venceu' : 'Ex.: contagem do mês'} />
              </div>
              <BrandButton type="submit" className="w-full" disabled={saveAdjust.isPending}>Salvar ajuste</BrandButton>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!historyItem} onOpenChange={(o) => { if (!o) setHistoryItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico · {historyItem?.name}</DialogTitle></DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto text-sm">
            {(history.data || []).length === 0 && <li className="py-6 text-center text-muted-foreground">Sem movimentos ainda.</li>}
            {(history.data || []).map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{kindLabel[m.kind] || m.kind}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(m.created_at), 'dd/MM/yyyy HH:mm')}
                    {m.lot && ` · lote ${m.lot}`}
                    {m.expires_at && ` · vence ${format(parseISO(m.expires_at), 'dd/MM/yyyy')}`}
                    {m.notes && ` · ${m.notes}`}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold ${Number(m.quantity) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {Number(m.quantity) > 0 ? '+' : ''}{formatQty(Number(m.quantity))} {historyItem?.unit || 'un'}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
