import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandStat } from '@/components/ui/brand-stat';

describe('BrandStat', () => {
  it('mostra o nome completo do card no hover (title), mesmo quando o rótulo é cortado', () => {
    const { container } = render(<BrandStat label="Renovações Geradas" value={12} />);
    expect(container.firstElementChild).toHaveAttribute('title', 'Renovações Geradas');
    expect(screen.getByText('Renovações Geradas')).toHaveClass('truncate');
  });
});
