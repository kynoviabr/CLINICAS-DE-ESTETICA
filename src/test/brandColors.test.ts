import { describe, expect, it } from 'vitest';
import { hexToHsl, isLightColor, navShades, readableTextHsl } from '@/lib/clinic/brandColors';

describe('cores do branding', () => {
  it('texto escuro sobre cores claras e branco sobre cores escuras', () => {
    expect(isLightColor('#f4a4c0')).toBe(true); // rosa da Aura: texto escuro
    expect(readableTextHsl('#ffe2d6')).toBe('0 0% 10%'); // pêssego claro
    expect(readableTextHsl('#f5f0e8')).toBe('0 0% 10%'); // creme
    expect(readableTextHsl('#1a7a6d')).toBe('0 0% 100%'); // verde escuro
  });

  it('menu lateral usa o tom da cor primária, sempre escuro', () => {
    const rosa = hexToHsl('#f4a4c0');
    const nav = navShades('#f4a4c0');
    expect(nav.background.startsWith(`${rosa.h} `)).toBe(true);
    expect(nav.background.endsWith(' 18%')).toBe(true);
    expect(navShades('#0a2540').background.endsWith(' 18%')).toBe(true);
  });
});
