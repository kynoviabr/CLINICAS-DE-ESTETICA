import { supabase } from '@/integrations/supabase/client';
import { logAccess, patientFromPath } from '@/lib/accessLog';

/**
 * Arquivos de espaços privados (patient-files, patient-anamneses) não abrem por link público.
 * O banco guarda o caminho; para abrir, gera um link temporário.
 * Registros antigos guardaram o "link público": o caminho é extraído dele.
 */
export function storagePathFrom(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value.replace(new RegExp(`^${bucket}:`), '');
  try {
    const url = new URL(value);
    const m = url.pathname.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Abre o arquivo numa nova aba com link válido por 5 minutos. */
export async function openStoredFile(value: string | null | undefined, bucket: string) {
  const path = storagePathFrom(value, bucket);
  // Abre a aba antes do await: no celular, abrir depois é bloqueado como pop-up.
  const tab = window.open('', '_blank');
  try {
    if (!path) throw new Error('Arquivo não encontrado.');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw error || new Error('Não foi possível abrir o arquivo.');
    logAccess(patientFromPath(bucket, path), bucket === 'patient-anamneses' ? 'anamnese_document' : 'file_view', path.split('/').pop());
    if (tab) tab.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
