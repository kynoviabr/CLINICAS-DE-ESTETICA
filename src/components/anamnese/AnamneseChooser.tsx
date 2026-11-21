import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { AnamneseTemplate } from '@/lib/anamnese/templates';
import type { AnamneseSelection, AnamneseState } from '@/lib/anamnese/selection';

const STATE_LABEL: Record<AnamneseState, { text: string; className: string }> = {
  valid: { text: 'Válida', className: 'text-emerald-700' },
  expired: { text: 'Vencida', className: 'text-amber-700' },
  pending: { text: 'Aguardando', className: 'text-amber-700' },
  none: { text: 'Não respondida', className: 'text-muted-foreground' },
};

type Props = {
  templates: AnamneseTemplate[];
  generalState: AnamneseState;
  categoryStates: Map<string, AnamneseState>;
  /** Categorias que a paciente vai fazer (contrato, proposta ou agendamento). */
  categoryIds: Set<string>;
  value: AnamneseSelection;
  onChange: (value: AnamneseSelection) => void;
};

/** Lista para a Dra marcar quais anamneses a paciente vai responder. */
export function AnamneseChooser({ templates, generalState, categoryStates, categoryIds, value, onChange }: Props) {
  const toggleTemplate = (id: string, checked: boolean) => {
    const ids = checked ? [...value.templateIds, id] : value.templateIds.filter((x) => x !== id);
    onChange({ ...value, templateIds: ids });
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
        <Checkbox
          checked={value.general}
          onCheckedChange={(v) => onChange({ ...value, general: v === true })}
          aria-label="Anamnese inicial"
          className="mt-0.5"
        />
        <span className="flex-1">
          <span className="block text-sm font-medium">Anamnese inicial</span>
          <span className="block text-xs text-muted-foreground">Saúde geral, medicamentos, alergias e hábitos.</span>
        </span>
        <span className={`text-xs ${STATE_LABEL[generalState].className}`}>{STATE_LABEL[generalState].text}</span>
      </label>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Anamneses de tratamento</Label>
        {templates.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            Nenhum modelo ativo. Crie em Configurações &gt; Anamnese.
          </p>
        ) : (
          templates.map((t) => {
            const state = categoryStates.get(t.category_id) || 'none';
            const willDo = categoryIds.has(t.category_id);
            return (
              <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  checked={value.templateIds.includes(t.id)}
                  onCheckedChange={(v) => toggleTemplate(t.id, v === true)}
                  aria-label={t.category_name || t.name}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{t.category_name || t.name}</span>
                  {willDo && <span className="block text-xs text-primary">Tratamento da paciente</span>}
                </span>
                <span className={`text-xs ${STATE_LABEL[state].className}`}>{STATE_LABEL[state].text}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
