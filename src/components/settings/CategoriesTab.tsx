import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Tags } from 'lucide-react';

interface CategoryForm {
  name: string;
  status: string;
}

const emptyForm: CategoryForm = { name: '', status: 'active' };

export default function CategoriesTab() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['treatment-categories', clinicId, search],
    queryFn: async () => {
      if (!clinicId) return [];
      let q = supabase.from('treatment_categories' as any).select('*').eq('clinic_id', clinicId).order('name');
      if (search) q = q.ilike('name', `%${search}%`);
      const { data } = await q;
      return (data as any[]) || [];
    },
    enabled: !!clinicId,
  });

  // Check if category is in use
  const checkCategoryInUse = async (categoryId: string) => {
    const { count } = await supabase.from('treatments').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
    return (count || 0) > 0;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: CategoryForm) => {
      const payload = { name: data.name, status: data.status, clinic_id: clinicId! };
      if (editingId) {
        const { error } = await supabase.from('treatment_categories' as any).update(payload as any).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('treatment_categories' as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-categories'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? 'Categoria atualizada!' : 'Categoria criada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (cat: any) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, status: cat.status });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar categoria..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Categoria
        </BrandButton>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><Tags className="w-5 h-5" />Categorias de Tratamentos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <Tags className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhuma categoria cadastrada</h3>
              <p className="text-sm text-muted-foreground mb-4">Crie categorias para organizar seus tratamentos</p>
              <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
                <Plus className="w-4 h-4" /> Nova Categoria
              </BrandButton>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cat.status === 'active' ? 'default' : 'secondary'}
                      className={cat.status === 'active' ? 'bg-green-100 text-green-700' : ''}>
                      {cat.status === 'active' ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <BrandButton variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                      <Edit className="w-3 h-3" />
                    </BrandButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="flex items-center justify-between">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{form.status === 'active' ? 'Ativa' : 'Inativa'}</span>
                <Switch
                  checked={form.status === 'active'}
                  onCheckedChange={checked => setForm({ ...form, status: checked ? 'active' : 'inactive' })}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
