import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'receptionist' | 'professional' | 'patient' | 'sales';

interface UserRoleData {
  role: AppRole | null;
  clinicId: string | null;
  loading: boolean;
  resolved: boolean;
}

interface RoleState extends UserRoleData {
  // De qual usuário é este resultado. Logo após o login, o estado ainda é o
  // de "sem usuário"; sem isso, a tela via "sem perfil" e mandava para /sem-acesso.
  userId: string | null;
}

export function useUserRole(): UserRoleData {
  const { user } = useAuth();
  const [data, setData] = useState<RoleState>({ role: null, clinicId: null, loading: true, resolved: false, userId: null });
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    if (!user) {
      setData({ role: null, clinicId: null, loading: false, resolved: true, userId: null });
      return;
    }
    const userId = user.id;

    const fetch = async () => {
      // Só mostra carregamento se o papel deste usuário ainda não foi resolvido. Em revalidações
      // (ex.: refresh de token ao voltar para a aba) mantemos o estado atual para
      // não desmontar a tela e perder a subseção em que a usuária estava.
      setData((current) =>
        current.resolved && current.userId === userId ? current : { ...current, loading: true, resolved: false, userId },
      );
      // Check staff roles first
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, clinic_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (roleData) {
        setData({ role: roleData.role as AppRole, clinicId: roleData.clinic_id, loading: false, resolved: true, userId });
        return;
      }

      // Check patient app access
      const { data: portalData } = await supabase
        .from('patient_users')
        .select('clinic_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (portalData) {
        setData({ role: 'patient', clinicId: (portalData).clinic_id, loading: false, resolved: true, userId });
      } else {
        setData({ role: null, clinicId: null, loading: false, resolved: true, userId });
      }
    };

    fetch();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resultado de outro usuário (ou de antes do login) ainda não vale: segue carregando.
  if (data.userId !== currentUserId) {
    return { role: null, clinicId: null, loading: true, resolved: false };
  }

  return { role: data.role, clinicId: data.clinicId, loading: data.loading, resolved: data.resolved };
}
