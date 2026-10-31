import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

/** Conta entrou, mas nenhuma clínica liberou acesso para este e-mail. */
export default function NoAccessPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const provider = String(user?.app_metadata?.provider || 'email');
  const providerLabel = provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'e-mail e senha';

  const switchAccount = async () => {
    await signOut().catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-card p-8 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-xl font-semibold text-foreground">Ainda não há acesso para este e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Você entrou com {providerLabel} como <strong className="text-foreground">{user?.email || 'e-mail não informado'}</strong>.
          Nenhuma clínica liberou acesso para esse e-mail.
        </p>
        <ul className="text-sm text-left text-muted-foreground list-disc pl-5 space-y-1">
          <li>Se você recebeu um convite, entre com o mesmo e-mail do convite.</li>
          <li>Se é paciente, peça para a clínica conferir o e-mail do seu cadastro.</li>
          {!user?.email && <li>O Facebook não informou seu e-mail. Entre com e-mail e senha ou com Google.</li>}
        </ul>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={switchAccount}>Entrar com outro e-mail</Button>
          <Button variant="outline" onClick={() => navigate('/onboarding')}>Quero cadastrar minha clínica</Button>
        </div>
      </div>
    </div>
  );
}
