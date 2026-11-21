import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { leadSignupMessage, leadSignupUrl, localPhone, validateLeadSignup } from '@/lib/crm/signupLink';

// jsdom não tem ResizeObserver (usado pelo Checkbox).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import PublicLeadSignupPage from '@/pages/PublicLeadSignupPage';

const ok = { fullName: 'Maria da Silva', birthDate: '1990-05-10', cpf: '529.982.247-25', phone: '(13) 99123-4567', consent: true };

describe('regras do cadastro do lead', () => {
  it('aceita dados válidos', () => {
    expect(validateLeadSignup(ok, new Date('2026-11-21'))).toEqual({});
  });

  it('aponta cada campo inválido', () => {
    const e = validateLeadSignup({ fullName: 'Maria', birthDate: '2030-01-01', cpf: '111.111.111-11', phone: '123', consent: false }, new Date('2026-11-21'));
    expect(Object.keys(e).sort()).toEqual(['birthDate', 'consent', 'cpf', 'fullName', 'phone']);
  });

  it('monta link e mensagem; ignora o nome provisório do WhatsApp', () => {
    const url = leadSignupUrl('https://klinova-homolog.vercel.app/', 'abc');
    expect(url).toBe('https://klinova-homolog.vercel.app/cadastro/abc');
    expect(leadSignupMessage('Contato do WhatsApp', 'Aura', url)).toMatch(/^Olá! Aqui é da Aura\./);
    expect(leadSignupMessage('Maria Souza', 'Aura', url)).toMatch(/^Olá, Maria!/);
    expect(localPhone('5513991234567')).toBe('13991234567');
  });
});

describe('página de cadastro do lead', () => {
  beforeEach(() => rpc.mockReset());

  const renderPage = () => render(
    <MemoryRouter initialEntries={['/cadastro/tok123']}>
      <Routes><Route path="/cadastro/:token" element={<PublicLeadSignupPage />} /></Routes>
    </MemoryRouter>,
  );

  it('preenche o WhatsApp da conversa, valida e envia', async () => {
    rpc.mockImplementation(async (fn: string) => fn === 'lead_signup_status'
      ? { data: { status: 'ok', clinic_name: 'Aura Guarujá', first_name: null, phone: '5513991234567' }, error: null }
      : { data: { ok: true }, error: null });
    renderPage();

    expect(await screen.findByDisplayValue('(13) 99123-4567')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enviar cadastro/ }));
    expect(screen.getByText('Digite seu nome completo.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1); // não enviou

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria da Silva' } });
    fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '1990-05-10' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Enviar cadastro/ }));

    expect(await screen.findByText('Cadastro enviado!')).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith('lead_signup_submit', {
      p_token: 'tok123', p_full_name: 'Maria da Silva', p_birth_date: '1990-05-10',
      p_cpf: '529.982.247-25', p_phone: '(13) 99123-4567', p_consent: true,
    });
  });

  it('link usado ou vencido mostra o aviso, sem formulário', async () => {
    rpc.mockResolvedValue({ data: { status: 'expired', clinic_name: 'Aura' }, error: null });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Este link venceu/)).toBeInTheDocument());
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
  });
});
