import { describe, expect, it } from 'vitest';
import { fitWithin, formatBytes } from '@/lib/photos/compress';
import { photoPath, storagePathOf } from '@/lib/photos/storage';

describe('fotos da paciente', () => {
  it('reduz mantendo proporção e nunca aumenta', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('caminho começa pela clínica e pela paciente', () => {
    expect(photoPath('c1', 'p1', 'webp', '-thumb', 1700000000000, 0.123456789)).toMatch(/^c1\/p1\/1700000000000-[a-z0-9]+-thumb\.webp$/);
  });

  it('aceita foto antiga gravada com link inteiro', () => {
    expect(storagePathOf('https://x.supabase.co/storage/v1/object/public/patient-photos/c1/p1/a%20b.jpg')).toBe('c1/p1/a b.jpg');
    expect(storagePathOf('c1/p1/x.webp')).toBe('c1/p1/x.webp');
    expect(storagePathOf('https://outro.com/foto.jpg')).toBeNull();
    expect(storagePathOf(null)).toBeNull();
  });

  it('tamanho legível', () => {
    expect(formatBytes(350 * 1024)).toBe('350 KB');
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4,2 MB');
  });
});
