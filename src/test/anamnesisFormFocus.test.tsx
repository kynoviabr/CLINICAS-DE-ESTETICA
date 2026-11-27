import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import AnamnesisFormModal from '@/components/patient/AnamnesisFormModal';

// O CI não tem .env: sem isto, carregar o cliente do Supabase quebra o teste.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

describe('AnamnesisFormModal', () => {
  it('mantém o foco na caixa de detalhe enquanto a paciente digita', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AnamnesisFormModal
          variant="page"
          open
          onOpenChange={() => undefined}
          patientId=""
          clinicId=""
          validityDays={180}
          chosen={{ general: true, templates: [] }}
          onSubmitForm={async () => undefined}
        />
      </QueryClientProvider>,
    );

    screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole('button', { name: /Concordo e quero começar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    fireEvent.click(screen.getByLabelText('Sim', { selector: '#Já\\ fez\\ cirurgias\\ anteriores\\?-yes' }));

    const box = screen.getByPlaceholderText(/cirurgia/i) as HTMLTextAreaElement;
    box.focus();
    fireEvent.change(box, { target: { value: 'P' } });
    fireEvent.change(screen.getByPlaceholderText(/cirurgia/i), { target: { value: 'Pr' } });

    const after = screen.getByPlaceholderText(/cirurgia/i);
    expect(after).toBe(box);
    expect(document.activeElement).toBe(box);
    expect((after as HTMLTextAreaElement).value).toBe('Pr');
  });
});
