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

/**
 * Qual cliente já existente é a mesma pessoa do lead.
 * - Mesmo CPF: é ela.
 * - Lead sem CPF e um único cliente com o mesmo celular: é ela.
 * - Lead com CPF que não bate, ou celular de mais de um cliente (ex.: mãe e filha): cliente novo.
 */
export function pickExistingPatient(duplicates: PatientDuplicate[], leadHasCpf: boolean): string | null {
  const byCpf = duplicates.find((d) => d.match_type === 'cpf');
  if (byCpf) return byCpf.patient_id;
  if (leadHasCpf) return null;
  const byPhone = [...new Set(duplicates.filter((d) => d.match_type === 'phone').map((d) => d.patient_id))];
  return byPhone.length === 1 ? byPhone[0] : null;
}
