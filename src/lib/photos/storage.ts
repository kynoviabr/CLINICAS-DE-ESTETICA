export const PHOTO_BUCKET = 'patient-photos';

/**
 * Caminho no armazenamento: clinica/paciente/arquivo. A segurança do banco usa as duas primeiras pastas
 * (equipe da clínica e a própria paciente).
 */
export function photoPath(clinicId: string, patientId: string, ext: string, suffix = '', now = Date.now(), rand = Math.random()) {
  return `${clinicId}/${patientId}/${now}-${rand.toString(36).slice(2, 8)}${suffix}.${ext}`;
}

/** Fotos antigas guardavam o link inteiro; as novas, só o caminho. Devolve sempre o caminho. */
export function storagePathOf(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//.test(stored)) return stored;
  const marker = `/${PHOTO_BUCKET}/`;
  const i = stored.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(stored.slice(i + marker.length).split('?')[0]);
}

export const PHOTO_LABELS: Record<string, string> = { before: 'Antes', after: 'Depois', during: 'Durante', progress: 'Evolução' };
export const PHOTO_LABEL_ORDER = ['before', 'after', 'progress', 'during'] as const;
