import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { loadMfaGate, type MfaGate } from '@/lib/auth/mfa';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading, resolved: roleResolved } = useUserRole();
  const location = useLocation();
  const isStaff = !!role && role !== 'patient';
  const [mfa, setMfa] = useState<MfaGate | null>(null);

  // Equipe: confere a verificação em duas etapas (paciente do portal não usa).
  useEffect(() => {
    if (!user || !isStaff) { setMfa('ok'); return; }
    let alive = true;
    setMfa(null);
    loadMfaGate().then((g) => { if (alive) setMfa(g); }).catch(() => { if (alive) setMfa('ok'); });
    return () => { alive = false; };
  }, [user, isStaff]);

  if (authLoading || roleLoading || (!!user && !roleResolved)) return <Spinner />;

  if (!user) return <Navigate to="/login" replace />;

  // Logado, mas sem clínica: explica o motivo em vez de cair direto no cadastro de clínica.
  if (allowedRoles && !role) {
    return <Navigate to="/sem-acesso" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={role === 'patient' ? '/portal' : '/clinic'} replace />;
  }

  if (isStaff && mfa === null) return <Spinner />;
  if (isStaff && mfa !== 'ok') {
    return <Navigate to={`/duas-etapas?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
}
