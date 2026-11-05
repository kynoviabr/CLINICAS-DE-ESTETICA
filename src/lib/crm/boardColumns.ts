/**
 * Etapas do funil como a clínica quer ver no quadro.
 * Os códigos das etapas não mudam (as automações dependem deles); só a exibição:
 * - etapa oculta: os leads dela aparecem na próxima etapa visível (ou na anterior, se for a última);
 * - "Finalizado": Fechado e Perdido numa coluna só, cada card com a etiqueta.
 */
export const CLOSED_STAGES = ['closed_won', 'closed_lost'] as const;
export const FINAL_COLUMN_CODE = 'finalizado';
/** clinic_settings: nome da coluna que junta Fechado e Perdido. Vazio/ausente = colunas separadas. */
export const FINAL_COLUMN_KEY = 'crm_kanban_finalizado';

export type StageConf = { code: string; label: string; hidden?: boolean };

export type BoardColumn<S extends StageConf> = {
  code: string;
  label: string;
  /** Etapa que dá a aparência da coluna. */
  stage: S;
  /** Etapas cujos leads ficam nesta coluna. */
  stageCodes: string[];
  isFinal: boolean;
};

const isClosed = (code: string) => (CLOSED_STAGES as readonly string[]).includes(code);

/** Fechado e Perdido sempre aparecem; das demais, pelo menos uma tem de ficar visível. */
export function effectiveHidden<S extends StageConf>(stages: S[]): Set<string> {
  const open = stages.filter((s) => !isClosed(s.code));
  const hidden = new Set(open.filter((s) => s.hidden).map((s) => s.code));
  return hidden.size >= open.length ? new Set() : hidden;
}

export function buildBoardColumns<S extends StageConf>(stages: S[], finalLabel: string | null): BoardColumn<S>[] {
  const hidden = effectiveHidden(stages);
  const merged = !!finalLabel?.trim();
  const columns: BoardColumn<S>[] = [];
  let finalColumn: BoardColumn<S> | null = null;

  for (const stage of stages) {
    if (hidden.has(stage.code)) continue;
    if (merged && isClosed(stage.code)) {
      if (!finalColumn) {
        finalColumn = { code: FINAL_COLUMN_CODE, label: finalLabel!.trim(), stage, stageCodes: [], isFinal: true };
        columns.push(finalColumn);
      }
      finalColumn.stageCodes.push(stage.code);
      continue;
    }
    columns.push({ code: stage.code, label: stage.label, stage, stageCodes: [stage.code], isFinal: false });
  }

  // Leads de etapa oculta vão para a próxima etapa aberta visível (ou a anterior).
  stages.forEach((stage, index) => {
    if (!hidden.has(stage.code)) return;
    const visibleOpen = (s: S) => !hidden.has(s.code) && !isClosed(s.code);
    const target = stages.slice(index + 1).find(visibleOpen) ?? [...stages.slice(0, index)].reverse().find(visibleOpen);
    const column = target && columns.find((c) => c.code === target.code);
    column?.stageCodes.push(stage.code);
  });

  return columns;
}

/** Etapa visível que representa o código (para filtros e rótulos). Fechado/Perdido ficam como estão. */
export function displayStageCode<S extends StageConf>(columns: BoardColumn<S>[], code: string): string {
  if (isClosed(code)) return code;
  return columns.find((c) => c.stageCodes.includes(code))?.code ?? code;
}
