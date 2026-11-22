// Cores derivadas do branding da clínica. Usadas pelo app (BrandingContext) e pela
// pré-visualização em Configurações > Branding, para as duas mostrarem o mesmo resultado.

export type Hsl = { h: number; s: number; l: number };

const DEFAULT_HSL: Hsl = { h: 174, s: 58, l: 28 };

export function hexToHsl(hex: string): Hsl {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return DEFAULT_HSL;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Luminosidade percebida (0 = preto, 1 = branco). */
export function luminance(hex: string): number {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;
  const [r, g, b] = [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Cor clara pede texto escuro; cor escura pede texto branco. */
export const isLightColor = (hex: string) => luminance(hex) > 0.6;

/** Texto legível sobre a cor (componentes HSL, para variáveis CSS). */
export const readableTextHsl = (hex: string) => (isLightColor(hex) ? '0 0% 10%' : '0 0% 100%');

/** Texto legível sobre a cor (CSS pronto). */
export const readableText = (hex: string) => `hsl(${readableTextHsl(hex)})`;

/**
 * Menu lateral e topo: o tom da cor primária, escurecido para o texto branco ficar legível
 * qualquer que seja a cor escolhida.
 */
export function navShades(primaryHex: string) {
  const p = hexToHsl(primaryHex);
  const s = Math.min(p.s, 60);
  return {
    background: `${p.h} ${s}% 18%`,
    accent: `${p.h} ${s}% 25%`,
    border: `${p.h} ${Math.min(s, 45)}% 28%`,
  };
}
