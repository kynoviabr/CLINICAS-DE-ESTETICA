import { supabase } from '@/integrations/supabase/client';

export type AccessAction = 'record_view' | 'anamnese_view' | 'anamnese_document' | 'photos_view' | 'contract_view' | 'file_view' | 'data_export' | 'data_anonymize';

export const ACCESS_LABEL: Record<string, string> = {
  record_view: 'Abriu a ficha',
  anamnese_view: 'Viu a anamnese',
  anamnese_document: 'Abriu documento da anamnese',
  photos_view: 'Viu as fotos',
  contract_view: 'Abriu o contrato',
  file_view: 'Abriu arquivo',
  data_export: 'Exportou os dados',
  data_anonymize: 'Anonimizou o cadastro',
};

/** Registra o acesso (não trava a tela se falhar). O banco ignora repetições em 5 minutos. */
export function logAccess(patientId: string | null | undefined, action: AccessAction, detail?: string) {
  if (!patientId || !/^[0-9a-f-]{36}$/i.test(patientId)) return;
  void supabase.rpc('log_patient_access', { p_patient_id: patientId, p_action: action, p_detail: detail ?? null }).then(() => undefined, () => undefined);
}

/** Paciente dono do arquivo, pelo caminho no armazenamento. */
export function patientFromPath(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.split('/');
  const id = bucket === 'patient-anamneses' ? parts[0] : parts[1];
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
