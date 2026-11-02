import { supabase } from '@/integrations/supabase/client';
import { onlyDigits } from '@/lib/patients/validation';

export type PatientDuplicate = { match_type: 'cpf' | 'phone'; patient_id: string; full_name: string };

/** Clientes da clínica com o mesmo CPF ou telefone (ignora pontuação). */
export async function findPatientDuplicates(
  clinicId: string,
  cpf: string | null,
  phone: string | null,
  excludeId?: string | null,
): Promise<PatientDuplicate[]> {
  const { data, error } = await supabase.rpc('find_patient_duplicates', {
    p_clinic_id: clinicId,
    p_cpf: cpf ? onlyDigits(cpf) : null,
    p_phone: phone ? onlyDigits(phone) : null,
    p_exclude_id: excludeId ?? null,
  });
  if (error) throw error;
  return (data || []) as PatientDuplicate[];
}
