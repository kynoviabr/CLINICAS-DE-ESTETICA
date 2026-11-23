import { describe, expect, it } from 'vitest';
import { appointmentTypeValue } from '@/lib/agenda/model';

describe('tipo de agendamento', () => {
  it('sessão avulsa é gravada como single_session; os demais como já eram', () => {
    expect(appointmentTypeValue('single')).toBe('single_session');
    expect(appointmentTypeValue('session')).toBe('session');
    expect(appointmentTypeValue('evaluation')).toBe('evaluation');
  });
});
