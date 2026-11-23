import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { CLOSED_STAGES, FINAL_COLUMN_KEY, effectiveHidden } from '@/lib/crm/boardColumns';
import { upsertClinicSetting } from '@/lib/setup/clinicSetup';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type StageDefinition = {
  code: string;
  label: string;
  description: string;
  isSystem?: boolean;
  hidden?: boolean;
};

const defaultStages: StageDefinition[] = [
  { code: 'new_lead', label: 'Novo Lead', description: 'Entradas novas sem contato.', isSystem: true },
  { code: 'contacted', label: 'Contato Iniciado', description: 'Primeiro contato em andamento.', isSystem: true },
  { code: 'scheduled', label: 'Agendado', description: 'Avaliação marcada e acompanhada.', isSystem: true },
  { code: 'proposal_sent', label: 'Proposta', description: 'Proposta criada ou em negociação.', isSystem: true },
  { code: 'closed_won', label: 'Fechado', description: 'Venda convertida em paciente.', isSystem: true },
  { code: 'closed_lost', label: 'Perdido', description: 'Lead encerrado com motivo.', isSystem: true },
];

function slugifyStageCode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeStageCode(code?: string | null) {
  if (!code) return 'new_lead';
  if (code === 'attended' || code === 'negotiating') return 'proposal_sent';
  return code;
}

export default function KanbanStagesTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stageDraft, setStageDraft] = useState({ label: '', description: '' });

  const stageSettingsQuery = useQuery({
    queryKey: ['crm-stage-settings', clinicId],
    queryFn: async () => {
      if (!clinicId) return defaultStages;
      const { data, error } = await supabase
        .from('clinic_settings')
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return defaultStages;
      try {
        const parsed = JSON.parse(data.value);
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultStages;
        return parsed.map((stage: { code?: string; label?: string; description?: string; hidden?: boolean }) => ({
          code: normalizeStageCode(stage.code),
          label: stage.label || stage.code || 'Etapa',
          description: stage.description || '',
          isSystem: !!defaultStages.find((item) => item.code === normalizeStageCode(stage.code)),
          hidden: !!stage.hidden,
        }));
      } catch {
        return defaultStages;
      }
    },
    enabled: !!clinicId,
  });

  const stages = stageSettingsQuery.data || defaultStages;

  const leadUsageQuery = useQuery({
    queryKey: ['crm-stage-usage', clinicId],
    queryFn: async () => {
      if (!clinicId) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from('leads')
        .select('kanban_stage')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      return (data || []).reduce<Record<string, number>>((acc, row: { kanban_stage: string }) => {
        const stage = normalizeStageCode(row.kanban_stage);
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {});
    },
    enabled: !!clinicId,
  });

  const usageMap = useMemo(() => leadUsageQuery.data || {}, [leadUsageQuery.data]);

  const saveStagesMutation = useMutation({
    mutationFn: async (nextStages: StageDefinition[]) => {
      if (!clinicId) return;
      const payload = JSON.stringify(
        nextStages.map((stage) => ({
          code: stage.code,
          label: stage.label,
          description: stage.description,
          ...(stage.hidden ? { hidden: true } : {}),
        }))
      );

      const { data: existing, error: existingError } = await supabase
        .from('clinic_settings')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('key', 'crm_kanban_stages')
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from('clinic_settings')
          .update({ value: payload })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clinic_settings')
          .insert({ clinic_id: clinicId, key: 'crm_kanban_stages', value: payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-stage-settings'] });
      toast({ title: 'Etapas do Kanban atualizadas' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar etapas', description: error.message, variant: 'destructive' });
    },
  });

  const canEdit = role === 'admin';
  const [editing, setEditing] = useState<{ code: string; label: string } | null>(null);
  const isClosed = (code: string) => (CLOSED_STAGES as readonly string[]).includes(code);
  const hiddenNow = effectiveHidden(stages);
  const visibleOpenCount = stages.filter((stage) => !isClosed(stage.code) && !hiddenNow.has(stage.code)).length;

  const toggleStage = (stageCode: string, use: boolean) => {
    if (!canEdit) return;
    if (!use && visibleOpenCount <= 1) {
      toast({ title: 'Mantenha ao menos uma etapa em uso', variant: 'destructive' });
      return;
    }
    saveStagesMutation.mutate(stages.map((stage) => stage.code === stageCode ? { ...stage, hidden: !use } : stage));
  };

  const renameStage = () => {
    if (!canEdit || !editing) return;
    const label = editing.label.trim();
    if (!label) return;
    saveStagesMutation.mutate(stages.map((stage) => stage.code === editing.code ? { ...stage, label } : stage));
    setEditing(null);
  };

  // Fechado e Perdido numa coluna só ("Finalizado"), com etiqueta em cada card.
  const finalColumnQuery = useQuery({
    queryKey: ['crm-final-column', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('clinic_settings').select('value')
        .eq('clinic_id', clinicId!).eq('key', FINAL_COLUMN_KEY).maybeSingle();
      return data?.value?.trim() || null;
    },
    enabled: !!clinicId,
  });
  const finalColumn = finalColumnQuery.data ?? null;
  const [finalDraft, setFinalDraft] = useState<string | null>(null);
  const saveFinalColumn = useMutation({
    mutationFn: async (value: string) => {
      if (!clinicId) return;
      await upsertClinicSetting(clinicId, FINAL_COLUMN_KEY, value);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-final-column'] });
      setFinalDraft(null);
      toast({ title: 'Quadro do CRM atualizado' });
    },
    onError: (error: Error) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });

  const addStage = () => {
    if (!canEdit) return;
    const label = stageDraft.label.trim();
    if (!label) {
      toast({ title: 'Informe o nome da etapa', variant: 'destructive' });
      return;
    }
    const code = slugifyStageCode(label);
    if (!code) {
      toast({ title: 'Nome inválido', variant: 'destructive' });
      return;
    }
    if (stages.some((stage) => stage.code === code)) {
      toast({ title: 'Já existe uma etapa com esse nome', variant: 'destructive' });
      return;
    }
    saveStagesMutation.mutate([
      ...stages,
      {
        code,
        label,
        description: stageDraft.description.trim() || 'Etapa personalizada do processo comercial.',
        isSystem: false,
      },
    ]);
    setStageDraft({ label: '', description: '' });
  };

  const moveStage = (stageCode: string, direction: -1 | 1) => {
    if (!canEdit) return;
    const index = stages.findIndex((stage) => stage.code === stageCode);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= stages.length) return;
    const next = [...stages];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    saveStagesMutation.mutate(next);
  };

  const removeStage = (stageCode: string) => {
    if (!canEdit) return;
    const target = stages.find((stage) => stage.code === stageCode);
    if (!target || target.isSystem) return;
    if ((usageMap[stageCode] || 0) > 0) {
      toast({
        title: 'Etapa em uso',
        description: 'Mova os leads dessa etapa antes de removê-la.',
        variant: 'destructive',
      });
      return;
    }
    saveStagesMutation.mutate(stages.filter((stage) => stage.code !== stageCode));
  };

  const totalLeadsInPipeline = useMemo(
    () => Object.values(usageMap).reduce((acc, count) => acc + Number(count || 0), 0),
    [usageMap]
  );

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>CRM Kanban — Etapas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border bg-slate-50/70 p-4">
          <p className="text-sm font-medium text-slate-900">Padrão recomendado</p>
          <p className="mt-1 text-xs text-slate-500">
            Novo Lead · Contato Iniciado · Agendado · Proposta · Fechado · Perdido
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Quer algo mais simples? Desligue as etapas que não usa, renomeie (ex.: Proposta → Em negociação) e junte Fechado e Perdido em "Finalizado".
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Leads atualmente distribuídos nas etapas: <span className="font-semibold text-slate-700">{totalLeadsInPipeline}</span>
          </p>
        </div>

        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.code} className="flex items-center gap-2 rounded-xl border px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {editing?.code === stage.code ? (
                    <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); renameStage(); }}>
                      <Input autoFocus className="h-8 w-48" value={editing.label} onChange={(event) => setEditing({ code: stage.code, label: event.target.value })} />
                      <Button type="submit" size="sm" variant="outline" className="h-8 px-2"><Check className="h-3.5 w-3.5" /></Button>
                    </form>
                  ) : (
                    <p className={`text-sm font-medium ${hiddenNow.has(stage.code) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{stage.label}</p>
                  )}
                  {canEdit && editing?.code !== stage.code && (
                    <button type="button" className="text-slate-400 hover:text-slate-700" title="Renomear" onClick={() => setEditing({ code: stage.code, label: stage.label })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {stage.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      <Lock className="h-3 w-3" /> padrão
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {usageMap[stage.code] || 0} lead(s)
                  </span>
                </div>
                <p className="text-xs text-slate-500">{stage.description || 'Sem descrição.'}</p>
              </div>
              <div className="flex items-center gap-1">
                {!isClosed(stage.code) && (
                  <label className="mr-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <Switch
                      checked={!hiddenNow.has(stage.code)}
                      onCheckedChange={(use) => toggleStage(stage.code, use)}
                      disabled={!canEdit || saveStagesMutation.isPending}
                    />
                    {hiddenNow.has(stage.code) ? 'Oculta' : 'Em uso'}
                  </label>
                )}
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => moveStage(stage.code, -1)} disabled={!canEdit || index === 0 || saveStagesMutation.isPending}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => moveStage(stage.code, 1)} disabled={!canEdit || index === stages.length - 1 || saveStagesMutation.isPending}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                {!stage.isSystem && (
                  <Button size="sm" variant="outline" className="h-8 px-2 text-rose-600" onClick={() => removeStage(stage.code)} disabled={!canEdit || saveStagesMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Etapa oculta não aparece no quadro: os leads dela ficam na próxima etapa em uso. As automações continuam iguais
          (ex.: lead novo entra em "Novo Lead"; se ela estiver oculta, aparece na etapa seguinte).
        </p>

        <div className="rounded-xl border p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <Switch
              checked={!!finalColumn}
              onCheckedChange={(on) => saveFinalColumn.mutate(on ? (finalDraft?.trim() || 'Finalizado') : '')}
              disabled={!canEdit || saveFinalColumn.isPending}
            />
            Juntar Fechado e Perdido numa coluna só
          </label>
          <p className="text-xs text-slate-500">Cada card mostra a etiqueta Fechado ou Perdido. Ao soltar um lead nessa coluna, o sistema pergunta qual dos dois.</p>
          {finalColumn && (
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (finalDraft?.trim()) saveFinalColumn.mutate(finalDraft.trim()); }}>
              <Input className="max-w-xs" value={finalDraft ?? finalColumn} onChange={(event) => setFinalDraft(event.target.value)} placeholder="Finalizado" disabled={!canEdit} />
              <Button type="submit" variant="outline" disabled={!canEdit || !finalDraft?.trim() || saveFinalColumn.isPending}>Salvar nome</Button>
            </form>
          )}
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium text-slate-900">Adicionar nova etapa</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
            <Input
              value={stageDraft.label}
              onChange={(event) => setStageDraft((current) => ({ ...current, label: event.target.value }))}
              placeholder="Nome da etapa"
              disabled={!canEdit}
            />
            <Input
              value={stageDraft.description}
              onChange={(event) => setStageDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Descrição curta"
              disabled={!canEdit}
            />
            <Button onClick={addStage} disabled={!canEdit || saveStagesMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
