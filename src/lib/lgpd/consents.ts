export type ConsentKind = 'data_processing' | 'photos_clinical' | 'image_marketing';
export type ConsentRow = { kind: string; granted: boolean; source: string; note: string | null; created_at: string };

export const CONSENT_KINDS: { kind: ConsentKind; label: string }[] = [
  { kind: 'data_processing', label: 'Uso dos dados de saúde para o atendimento' },
  { kind: 'photos_clinical', label: 'Fotos clínicas (antes e depois, no prontuário)' },
  { kind: 'image_marketing', label: 'Uso de imagem em divulgação (redes sociais, site)' },
];

/** Registro vigente de cada tipo (o mais recente). */
export function currentConsents(rows: ConsentRow[]) {
  const out: Partial<Record<ConsentKind, ConsentRow>> = {};
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!(r.kind in out)) out[r.kind as ConsentKind] = r;
  }
  return out;
}
