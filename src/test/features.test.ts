import { describe, expect, it } from 'vitest';
import { featureEnabled } from '@/lib/features';

describe('funcionalidades liga/desliga', () => {
  it('ligada por padrão, desliga com off', () => {
    expect(featureEnabled({}, 'stock')).toBe(true);
    expect(featureEnabled({ feature_stock: 'off' }, 'stock')).toBe(false);
    expect(featureEnabled({ feature_stock: 'off' }, 'expenses')).toBe(true);
    expect(featureEnabled({ feature_expenses: 'on' }, 'expenses')).toBe(true);
  });
});
