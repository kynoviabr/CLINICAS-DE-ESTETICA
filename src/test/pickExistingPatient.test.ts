import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { pickExistingPatient, type PatientDuplicate } from '@/lib/patients/duplicates';

const cpf = (id: string): PatientDuplicate => ({ match_type: 'cpf', patient_id: id, full_name: id });
const phone = (id: string): PatientDuplicate => ({ match_type: 'phone', patient_id: id, full_name: id });

describe('lead vira cliente sem duplicar', () => {
  it('mesmo CPF é a mesma cliente', () => {
    expect(pickExistingPatient([phone('a'), cpf('b')], true)).toBe('b');
  });

  it('lead sem CPF com o celular de uma cliente é ela', () => {
    expect(pickExistingPatient([phone('a')], false)).toBe('a');
  });

  it('celular de mais de uma cliente: cria nova', () => {
    expect(pickExistingPatient([phone('a'), phone('b')], false)).toBeNull();
  });

  it('lead com CPF diferente e mesmo celular: cria nova', () => {
    expect(pickExistingPatient([phone('a')], true)).toBeNull();
  });

  it('nada encontrado: cria nova', () => {
    expect(pickExistingPatient([], false)).toBeNull();
  });
});
