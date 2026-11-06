import { describe, expect, it } from 'vitest';
import { missingSourcesText, parseAuraInfo, type Suggestion } from '@/lib/whatsapp/auraInfo';

describe('informações para a IA', () => {
  it('lê o que foi salvo e completa o que falta', () => {
    expect(parseAuraInfo(null)).toEqual({ priceDisplay: 'exact', faq: [], priceOverrides: {} });
    expect(parseAuraInfo('{"hours":"9h às 19h","priceDisplay":"from"}')).toMatchObject({ hours: '9h às 19h', priceDisplay: 'from', faq: [] });
    expect(parseAuraInfo('não é json').priceDisplay).toBe('exact');
  });

  it('avisa quando a IA não leu os dados da clínica', () => {
    const s: Suggestion = { id: '1', text: 'oi', outcome: 'ok', handoff: false, flags: [], sources: { catalog: 'ok', businessInfo: 'ok' } };
    expect(missingSourcesText(s)).toBeNull();
    expect(missingSourcesText({ ...s, sources: { catalog: 'error', businessInfo: 'ok' } })).toContain('confira');
  });
});
