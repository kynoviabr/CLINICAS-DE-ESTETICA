import { useCallback, useState } from 'react';
import { findPatientDuplicates, type PatientDuplicate } from '@/lib/patients/duplicates';
import { onlyDigits } from '@/lib/patients/validation';

/**
 * Checa CPF e telefone já usados na clínica.
 * - CPF repetido: bloqueia.
 * - Telefone repetido: avisa; salvar de novo com o mesmo número confirma.
 */
export function usePatientDuplicateCheck(clinicId: string | null | undefined, excludeId?: string | null) {
  const [cpfMatch, setCpfMatch] = useState<PatientDuplicate | null>(null);
  const [phoneMatches, setPhoneMatches] = useState<PatientDuplicate[]>([]);
  const [confirmedPhone, setConfirmedPhone] = useState('');

  const check = useCallback(async (cpf: string, phone: string) => {
    if (!clinicId || (!onlyDigits(cpf) && !onlyDigits(phone))) {
      setCpfMatch(null);
      setPhoneMatches([]);
      return { cpfMatch: null, phoneMatches: [] as PatientDuplicate[] };
    }
    const rows = await findPatientDuplicates(clinicId, cpf || null, phone || null, excludeId);
    const cpfRow = rows.find((r) => r.match_type === 'cpf') || null;
    const phoneRows = rows.filter((r) => r.match_type === 'phone');
    setCpfMatch(cpfRow);
    setPhoneMatches(phoneRows);
    return { cpfMatch: cpfRow, phoneMatches: phoneRows };
  }, [clinicId, excludeId]);

  /** Retorna true se pode salvar. Na 1ª vez com telefone repetido, só avisa. */
  const canSave = useCallback(async (cpf: string, phone: string) => {
    const result = await check(cpf, phone);
    if (result.cpfMatch) return false;
    const digits = onlyDigits(phone);
    if (result.phoneMatches.length > 0 && confirmedPhone !== digits) {
      setConfirmedPhone(digits);
      return false;
    }
    return true;
  }, [check, confirmedPhone]);

  const reset = useCallback(() => {
    setCpfMatch(null);
    setPhoneMatches([]);
    setConfirmedPhone('');
  }, []);

  return { cpfMatch, phoneMatches, check, canSave, reset };
}
