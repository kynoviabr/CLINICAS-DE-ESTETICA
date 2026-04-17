import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleBadge } from '@/components/RoleBadge';
import { Target, Plus, Loader2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const periodTypeLabels: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function goalStatusBadge(pct: number) {
  if (pct >= 100) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
      {pct > 100 ? <>🏆 Meta superada</> : 'Meta atingida'}
    </span>;
  }
  if (pct >= 70) return <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full border border-yellow-200">Em andamento</span>;
  return <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">Abaixo da meta</span>;
}

export default function SalesGoalsTab() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [sales, setSales] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);

  // Form
  const [formUserId, setFormUserId] = useState('');
  const [formPeriodType, setFormPeriodType] = useState('monthly');
  const [formPeriodRef, setFormPeriodRef] = useState(format(new Date(), 'yyyy-MM'));
  const [formAmount, setFormAmount] = useState('');

  // Filters
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterUser, setFilterUser] = useState('all');

  useEffect(() => { if (clinicId) loadData(); }, [clinicId]);

  const loadData = async () => {
    if (!clinicId) return;
    setLoading(true);

    const [goalsRes, staffRes, proposalsRes] = await Promise.all([
      supabase.from('sales_goals' as any).select('*').eq('clinic_id', clinicId).order('period_reference', { ascending: false }),
      supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId).eq('is_active', true),
      supabase.from('proposals').select('created_by, final_amount, status').eq('clinic_id', clinicId).eq('status', 'accepted' as any),
    ]);

    setGoals((goalsRes.data as any[]) || []);
    setStaff(staffRes.data || []);

    // Calculate realized amounts per user
    const salesMap: Record<string, number> = {};
    ((proposalsRes.data as any[]) || []).forEach((p: any) => {
      if (p.created_by) {
        salesMap[p.created_by] = (salesMap[p.created_by] || 0) + Number(p.final_amount || 0);
      }
    });
    setSales(salesMap);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !formUserId || !formAmount) return;
    setSaving(true);

    const { error } = await supabase.from('sales_goals' as any).insert({
      clinic_id: clinicId,
      user_id: formUserId,
      period_type: formPeriodType,
      period_reference: formPeriodRef,
      goal_amount: parseFloat(formAmount),
      created_by: user?.id,
    } as any);

    setSaving(false);
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        toast.error('Já existe uma meta para este usuário neste período');
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success('Meta criada com sucesso!');
    setDialogOpen(false);
    setFormAmount('');
    loadData();
  };

  const filteredStaffForDropdown = showAllRoles
    ? staff
    : staff.filter(s => ['sales', 'admin'].includes(s.role));

  const filteredGoals = goals.filter(g => {
    if (filterPeriod && !g.period_reference.startsWith(filterPeriod)) return false;
    if (filterUser && filterUser !== 'all' && g.user_id !== filterUser) return false;
    return true;
  });

  const getRealizedForGoal = (goal: any) => {
    // This is simplified - ideally filter by period too
    return sales[goal.user_id] || 0;
  };

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Input placeholder="Filtrar por período (YYYY-MM)" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="w-48" />
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {staff.map(s => (
                <SelectItem key={s.user_id} value={s.user_id}>
                  {s.user_id.slice(0, 8)}... ({s.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />Nova Meta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="w-5 h-5" />Nova Meta de Vendas</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Usuário</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {filteredStaffForDropdown.map(s => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.user_id.slice(0, 8)}... <RoleBadge role={s.role} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showAllRoles} onChange={e => setShowAllRoles(e.target.checked)} />
                  Mostrar todos os perfis
                </label>
              </div>
              <div className="space-y-2">
                <Label>Tipo de período</Label>
                <Select value={formPeriodType} onValueChange={setFormPeriodType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referência do período</Label>
                <Input
                  value={formPeriodRef}
                  onChange={e => setFormPeriodRef(e.target.value)}
                  placeholder={formPeriodType === 'monthly' ? 'YYYY-MM' : formPeriodType === 'quarterly' ? 'YYYY-Q1' : 'YYYY'}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor da Meta (R$)</Label>
                <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} required />
              </div>
              <Button type="submit" disabled={saving} className="w-full gradient-primary text-primary-foreground">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar Meta
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-5 h-5" />Metas de Vendas</CardTitle></CardHeader>
        <CardContent>
          {filteredGoals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma meta cadastrada. Clique em "Nova Meta" para começar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Usuário</th>
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Período</th>
                    <th className="pb-2 pr-4 text-right">Meta</th>
                    <th className="pb-2 pr-4 text-right">Realizado</th>
                    <th className="pb-2 pr-4 text-right">%</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredGoals.map((g: any) => {
                    const realized = getRealizedForGoal(g);
                    const pct = g.goal_amount > 0 ? Math.round((realized / g.goal_amount) * 100) : 0;
                    const staffMember = staff.find(s => s.user_id === g.user_id);
                    return (
                      <tr key={g.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-medium">{g.user_id.slice(0, 8)}...</span>
                            {staffMember && <RoleBadge role={staffMember.role} />}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{periodTypeLabels[g.period_type] || g.period_type}</td>
                        <td className="py-3 pr-4 font-mono">{g.period_reference}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(g.goal_amount)}</td>
                        <td className="py-3 pr-4 text-right">{formatCurrency(realized)}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{pct}%</td>
                        <td className="py-3">{goalStatusBadge(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
