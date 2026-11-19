export type PatientNoteEntry = {
  id: string;
  date: string; // ISO string
  author_name: string;
  author_role: string;
  text: string;
};

const NOTES_HISTORY_TAG = '<!--PATIENT_NOTES_V1-->';

/**
 * Faz o parse do histórico de notas e observações do paciente.
 * Compatível tanto com o formato serializado V1 quanto com notas simples legadas.
 */
export function parsePatientNotes(rawNotes?: string | null): PatientNoteEntry[] {
  if (!rawNotes || !rawNotes.trim()) return [];
  const text = rawNotes.trim();

  if (text.startsWith(NOTES_HISTORY_TAG)) {
    try {
      const jsonStr = text.slice(NOTES_HISTORY_TAG.length).trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fallback caso haja JSON corrompido
    }
  }

  // Nota legada em texto puro: exibida como nota inicial cadastral
  return [
    {
      id: 'legacy-initial',
      date: new Date().toISOString(),
      author_name: 'Observação cadastral',
      author_role: 'Geral',
      text,
    },
  ];
}

/**
 * Serializa a lista de notas para persistência no campo `notes` do paciente.
 */
export function serializePatientNotes(entries: PatientNoteEntry[]): string {
  return `${NOTES_HISTORY_TAG}${JSON.stringify(entries)}`;
}

/**
 * Retorna o texto da nota mais recente para exibição concisa (cards da agenda, resumos, etc).
 */
export function getLatestPatientNoteText(rawNotes?: string | null): string {
  const entries = parsePatientNotes(rawNotes);
  if (entries.length === 0) return '';
  return entries[0]?.text?.trim() || '';
}
