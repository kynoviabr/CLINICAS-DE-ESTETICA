import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { buildAvailabilityRows, formatDocument, isValidDocument, mergeAnamneseTemplates, validHours } from '@/lib/setup/clinicSetup';

describe('implantação guiada', () => {
  it('aceita CNPJ ou CPF para o contrato', () => {
    expect(isValidDocument('12.345.678/0001-95')).toBe(true);
    expect(isValidDocument('529.982.247-25')).toBe(true);
    expect(isValidDocument('123')).toBe(false);
    expect(isValidDocument('00000000000000')).toBe(false);
  });

  it('formata CPF e CNPJ enquanto digita', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('12345678000195')).toBe('12.345.678/0001-95');
  });

  it('horário de atendimento válido', () => {
    expect(validHours('09:00', '18:00')).toBe(true);
    expect(validHours('18:00', '09:00')).toBe(false);
    expect(validHours('9h', '18:00')).toBe(false);
  });

  it('um horário por dia escolhido, sem repetir', () => {
    const rows = buildAvailabilityRows('c1', 'u1', [5, 1, 1, 3], '09:00', '18:00');
    expect(rows.map((r) => r.day_of_week)).toEqual([1, 3, 5]);
    expect(rows[0]).toMatchObject({ clinic_id: 'c1', professional_id: 'u1', start_time: '09:00', end_time: '18:00', is_active: true });
  });

  it('anamnese padrão só para categorias sem modelo', () => {
    const first = mergeAnamneseTemplates([], [{ id: 'a', name: 'Estética Facial' }, { id: 'b', name: 'Peelings' }]);
    expect(first.added).toBe(2);
    expect(first.templates[0].specific_questions.length).toBeGreaterThan(0);
    const second = mergeAnamneseTemplates(first.templates, [{ id: 'a', name: 'Estética Facial' }, { id: 'c', name: 'Emagrecimento' }]);
    expect(second.added).toBe(1);
    expect(second.templates).toHaveLength(3);
  });
});
