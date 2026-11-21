import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnamneseDetailDrawer from '@/components/anamnese/AnamneseDetailDrawer';

// O CI não tem .env: sem isto, carregar o cliente do Supabase quebra o teste.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const anamnese = {
  id: 'a1',
  anamnese_number: 'ANM-2026-000001',
  status: 'validated',
  title: null,
  description: null,
  notes: null,
  document_url: null,
  document_name: null,
  created_at: '2026-11-21T22:00:00Z',
  filled_at: '2026-11-21T22:27:00Z',
  expires_at: '2027-02-19T00:00:00Z',
  validated_at: null,
  archived_at: null,
  validity_days: 90,
  source_type: 'patient_link',
  form_data: {
    health_history: { has_previous_surgery: true, surgeries: 'Prótese de mama' },
    habits: { smoking: false, water_intake: '2 litros' },
  },
} as unknown as Parameters<typeof AnamneseDetailDrawer>[0]['anamnese'];

describe('AnamneseDetailDrawer', () => {
  it('expande e recolhe todas as seções de uma vez', () => {
    render(<AnamneseDetailDrawer open onOpenChange={() => undefined} anamnese={anamnese} />);

    expect(screen.getByText('Link enviado à paciente')).toBeInTheDocument();
    expect(screen.queryByText('Prótese de mama')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expandir todos/ }));
    expect(screen.getByText('Prótese de mama')).toBeInTheDocument();
    expect(screen.getByText('2 litros')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Recolher todos/ }));
    expect(screen.queryByText('Prótese de mama')).not.toBeInTheDocument();
  });
});
