import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { storagePathFrom } from '@/lib/storedFile';

describe('arquivos de espaço privado', () => {
  it('caminho salvo direto', () => {
    expect(storagePathFrom('c1/p1/docs/a.pdf', 'patient-files')).toBe('c1/p1/docs/a.pdf');
  });
  it('extrai o caminho do link público antigo', () => {
    expect(storagePathFrom('https://x.supabase.co/storage/v1/object/public/patient-anamneses/p1/a1/123.webp', 'patient-anamneses')).toBe('p1/a1/123.webp');
    expect(storagePathFrom('https://x.supabase.co/storage/v1/object/public/patient-files/c1/p1/docs/anamnese%201.pdf', 'patient-files')).toBe('c1/p1/docs/anamnese 1.pdf');
  });
  it('link de outro espaço ou vazio não vale', () => {
    expect(storagePathFrom('https://x.supabase.co/storage/v1/object/public/contracts/a.pdf', 'patient-files')).toBeNull();
    expect(storagePathFrom(null, 'patient-files')).toBeNull();
  });
});
