import { describe, expect, it } from 'vitest';
import { missingSourcesText, type Suggestion } from '@/lib/whatsapp/auraInfo';

describe('informações para a IA', () => {
  it('avisa quando a IA não leu os dados da clínica', () => {
    const s: Suggestion = { id: '1', text: 'oi', outcome: 'ok', handoff: false, flags: [], sources: { catalog: 'ok', businessInfo: 'ok' } };
    expect(missingSourcesText(s)).toBeNull();
    expect(missingSourcesText({ ...s, sources: { catalog: 'error', businessInfo: 'ok' } })).toContain('confira');
  });
});
