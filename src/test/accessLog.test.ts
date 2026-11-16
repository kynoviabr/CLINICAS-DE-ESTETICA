import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { ACCESS_LABEL, patientFromPath } from '@/lib/accessLog';

const P = '70000000-0000-0000-0000-0000000000a1';
describe('registro de acessos', () => {
  it('acha o paciente pelo caminho do arquivo', () => {
    expect(patientFromPath('patient-anamneses', `${P}/a1/123.pdf`)).toBe(P);
    expect(patientFromPath('patient-files', `c1/${P}/docs/x.pdf`)).toBe(P);
    expect(patientFromPath('contracts', `c1/${P}/C-1.pdf`)).toBe(P);
    expect(patientFromPath('contracts', 'lixo')).toBeNull();
  });
  it('tem texto para cada ação', () => {
    expect(ACCESS_LABEL.record_view).toBe('Abriu a ficha');
  });
});
