import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'receptionist' | 'professional' | 'patient' | 'sales';

interface UserRoleData {
  role: AppRole | null;
  clinicId: string | null;
  loading: boolean;
}

export function useUserRole(): UserRoleData {
  const { user } = useAuth();
  const [data, setData] = useState<UserRoleData>({ role: null, clinicId: null, loading: true });

  useEffect(() => {
    if (!user) {
      setData({ role: null, clinicId: null, loading: false });
      return;
    }

    const fetch = async () => {
      // Check staff roles first
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, clinic_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (roleData) {
        setData({ role: roleData.role as AppRole, clinicId: roleData.clinic_id, loading: false });
        return;
      }

      // Check patient portal access
      const { data: portalData } = await supabase
        .from('patient_portal_access' as unknown)
        .select('clinic_id')
        .eq('auth_user_id', user.id)
        .eq('access_status', 'active')
        .limit(1)
        .maybeSingle();

      if (portalData) {
        setData({ role: 'patient', clinicId: (portalData as unknown).clinic_id, loading: false });
      } else {
        setData({ role: null, clinicId: null, loading: false });
      }
    };

    fetch();
  }, [user]);

  return data;
}
