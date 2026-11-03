import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Edit, Plus, Save, Sparkles } from 'lucide-react';
import {
  ANAMNESE_TEMPLATES_KEY,
  BASIC_HEALTH_QUESTIONS,
  buildAnamneseTemplate,
  questionsForCategory,
  type AnamneseTemplate,
  type TreatmentCategory,
} from '@/lib/anamnese/templates';

type TemplateForm = {
  id: string | null;
  name: string;
  category_id: string;
  active: boolean;
  basic_questions: string;
  specific_questions: string;
  notes: string;
};

const SETTINGS_KEY = ANAMNESE_TEMPLATES_KEY;
const buildTemplate = buildAnamneseTemplate;

function splitLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function joinLines(value: string[]) {
  return value.join('\n');
}

export default function AnamneseTemplatesTab() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [templates, setTemplates] = useState<AnamneseTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [form, setForm] = useState<TemplateForm>({
    id: null,
    name: '',
    category_id: '',
    active: true,
    basic_questions: joinLines(BASIC_HEALTH_QUESTIONS),
    specific_questions: '',
    notes: '',
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['anamnese-template-categories', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('treatment_categories')
        .select('id,name,description')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as TreatmentCategory[];
    },
    enabled: !!clinicId,
  });

  const { data: settingRows = [], isLoading } = useQuery({
    queryKey: ['clinic-settings', clinicId, SETTINGS_KEY],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('clinic_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('key', SETTINGS_KEY);
      if (error) throw error;
      return (data || []) as Array<{ id: string; value: string }>;
    },
    enabled: !!clinicId,
  });

  useEffect(() => {
    const currentSetting = settingRows[0];
    if (!currentSetting?.value) {
      setTemplates([]);
      return;
    }
    try {
      const parsed = JSON.parse(currentSetting.value);
      setTemplates(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTemplates([]);
    }
  }, [settingRows]);

  const saveMutation = useMutation({
    mutationFn: async (nextTemplates: AnamneseTemplate[]) => {
      if (!clinicId) throw new Error('Clínica não encontrada.');
      const value = JSON.stringify(nextTemplates);
      const { data: existing, error: lookupError } = await supabase
        .from('clinic_settings')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { error } = await supabase
          .from('clinic_settings')
          .update({ value })
          .eq('id', existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('clinic_settings').insert({
        clinic_id: clinicId,
        key: SETTINGS_KEY,
        value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-settings'] });
      qc.invalidateQueries({ queryKey: ['clinic-settings', clinicId, SETTINGS_KEY] });
      toast({ title: 'Modelos de anamnese salvos!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const visibleTemplates = useMemo(() => {
    if (categoryFilter === 'all') return templates;
    return templates.filter((template) => template.category_id === categoryFilter);
  }, [templates, categoryFilter]);

  const upsertTemplates = (nextTemplates: AnamneseTemplate[]) => {
    setTemplates(nextTemplates);
    saveMutation.mutate(nextTemplates);
  };

  const generateMissingTemplates = () => {
    const existingByCategory = new Set(templates.map((template) => template.category_id));
    const missing = categories.filter((category) => !existingByCategory.has(category.id)).map(buildTemplate);
    if (missing.length === 0) {
      toast({ title: 'Modelos já criados', description: 'Todas as categorias ativas já possuem modelo.' });
      return;
    }
    upsertTemplates([...templates, ...missing]);
  };

  const openNew = () => {
    const firstCategory = categories.find((category) => !templates.some((template) => template.category_id === category.id)) || categories[0];
    setForm({
      id: null,
      name: firstCategory ? `Anamnese ${firstCategory.name}` : '',
      category_id: firstCategory?.id || '',
      active: true,
      basic_questions: joinLines(BASIC_HEALTH_QUESTIONS),
      specific_questions: firstCategory ? joinLines(questionsForCategory(firstCategory.name)) : '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (template: AnamneseTemplate) => {
    setForm({
      id: template.id,
      name: template.name,
      category_id: template.category_id,
      active: template.active,
      basic_questions: joinLines(template.basic_questions),
      specific_questions: joinLines(template.specific_questions),
      notes: template.notes || '',
    });
    setDialogOpen(true);
  };

  const handleCategoryChange = (categoryId: string) => {
    const category = categories.find((item) => item.id === categoryId);
    setForm((current) => ({
      ...current,
      category_id: categoryId,
      name: current.name || (category ? `Anamnese ${category.name}` : ''),
      specific_questions: current.specific_questions || (category ? joinLines(questionsForCategory(category.name)) : ''),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const category = categories.find((item) => item.id === form.category_id);
    if (!category) {
      toast({ title: 'Categoria obrigatória', description: 'Selecione o tipo de tratamento.', variant: 'destructive' });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome do modelo.', variant: 'destructive' });
      return;
    }
    const nextTemplate: AnamneseTemplate = {
      id: form.id || `template-${category.id}-${Date.now()}`,
      name: form.name.trim(),
      category_id: category.id,
      category_name: category.name,
      active: form.active,
      basic_questions: splitLines(form.basic_questions),
      specific_questions: splitLines(form.specific_questions),
      notes: form.notes.trim(),
    };
    const withoutCurrent = templates.filter((template) => template.id !== nextTemplate.id);
    upsertTemplates([...withoutCurrent, nextTemplate].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    setDialogOpen(false);
  };

  const toggleActive = (template: AnamneseTemplate) => {
    upsertTemplates(templates.map((item) => item.id === template.id ? { ...item, active: !item.active } : item));
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Modelos de Anamnese
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <BrandButton type="button" variant="outline" onClick={generateMissingTemplates} disabled={saveMutation.isPending || categories.length === 0}>
              <Sparkles className="w-4 h-4" />
              Gerar por categoria
            </BrandButton>
            <BrandButton type="button" onClick={openNew} disabled={categories.length === 0}>
              <Plus className="w-4 h-4" />
              Novo modelo
            </BrandButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
          <div className="rounded-lg border bg-secondary/30 p-4 text-sm text-muted-foreground">
            Os dados básicos de saúde ficam iguais em todos os modelos. As perguntas específicas variam por tipo de tratamento.
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Cadastre categorias de tratamento antes de criar modelos de anamnese.
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Nenhum modelo cadastrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">Gere modelos iniciais para cada tipo de tratamento.</p>
            <BrandButton className="mt-4" onClick={generateMissingTemplates}>
              <Sparkles className="w-4 h-4" />
              Gerar modelos por categoria
            </BrandButton>
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum modelo encontrado para este tipo.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleTemplates.map((template) => (
              <div key={template.id} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{template.name}</h3>
                    <p className="text-xs text-muted-foreground">{template.category_name}</p>
                  </div>
                  <Badge variant={template.active ? 'default' : 'outline'}>{template.active ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg bg-secondary/30 p-3">
                    <p className="font-medium text-foreground">Dados básicos</p>
                    <p className="mt-1 text-xs text-muted-foreground">{template.basic_questions.length} perguntas comuns</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-3">
                    <p className="font-medium text-foreground">Específicas</p>
                    <p className="mt-1 text-xs text-muted-foreground">{template.specific_questions.length} perguntas do tratamento</p>
                  </div>
                </div>
                {template.specific_questions.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {template.specific_questions.slice(0, 3).map((question) => <li key={question}>- {question}</li>)}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
                  <BrandButton type="button" variant="outline" size="sm" onClick={() => toggleActive(template)} disabled={saveMutation.isPending}>
                    {template.active ? 'Desativar' : 'Ativar'}
                  </BrandButton>
                  <BrandButton type="button" size="sm" onClick={() => openEdit(template)}>
                    <Edit className="w-4 h-4" />
                    Editar
                  </BrandButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Editar modelo de anamnese' : 'Novo modelo de anamnese'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo de tratamento</Label>
                  <Select value={form.category_id} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nome do modelo</Label>
                  <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </div>
              </div>

              <div className="space-y-2 max-w-xs">
                <Label>Status</Label>
                <Select value={form.active ? 'active' : 'inactive'} onValueChange={(value) => setForm({ ...form, active: value === 'active' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Dados básicos de saúde</Label>
                  <Textarea
                    value={form.basic_questions}
                    onChange={(event) => setForm({ ...form, basic_questions: event.target.value })}
                    rows={12}
                  />
                  <p className="text-xs text-muted-foreground">Uma pergunta por linha. Este bloco normalmente se repete em todos os modelos.</p>
                </div>
                <div className="space-y-2">
                  <Label>Perguntas específicas do tratamento</Label>
                  <Textarea
                    value={form.specific_questions}
                    onChange={(event) => setForm({ ...form, specific_questions: event.target.value })}
                    rows={12}
                  />
                  <p className="text-xs text-muted-foreground">Uma pergunta por linha. Ajuste conforme protocolo e categoria.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas internas</Label>
                <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} />
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</BrandButton>
                <BrandButton type="submit" disabled={saveMutation.isPending}>
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar modelo'}
                </BrandButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
