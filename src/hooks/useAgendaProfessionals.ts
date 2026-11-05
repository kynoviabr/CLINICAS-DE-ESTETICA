import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Profissionais da agenda. A identidade é o cadastro (professionals.id), não o login:
 * a parceira sem acesso ao sistema também tem agenda. `user_id` só existe para quem entra.
 */
export interface AgendaProfessional {
  id: string;
  user_id: string | null;
  full_name: string;
  label: string;
  specialty: string | null;
  status: string;
}

export function useAgendaProfessionals(clinicId?: string | null, currentUserId?: string | null) {
  const { data: all = [], isLoading } = useQuery({
    queryKey: ['agenda-professionals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('id, user_id, full_name, specialty, status')
        .eq('clinic_id', clinicId!)
        .order('full_name');
      if (error) throw error;
      return (data || []).map((p) => ({ ...p, label: p.full_name || 'Profissional' })) as AgendaProfessional[];
    },
    enabled: !!clinicId,
  });

  return useMemo(() => {
    const active = all.filter((p) => p.status !== 'inactive');
    const byId = Object.fromEntries(all.map((p) => [p.id, p]));
    const byUserId = Object.fromEntries(all.filter((p) => p.user_id).map((p) => [p.user_id as string, p]));
    return {
      /** Ativos: os que aparecem para escolher na agenda. */
      professionals: active,
      /** Todos (inclusive inativos), para mostrar nomes no histórico. */
      allProfessionals: all,
      byId,
      /** Cadastro de profissional de um login (ex.: responsável pelo lead). */
      professionalIdForUser: (userId?: string | null) => (userId ? byUserId[userId]?.id ?? null : null),
      /** Cadastro de profissional de quem está usando o sistema. */
      myProfessionalId: currentUserId ? byUserId[currentUserId]?.id ?? null : null,
      isLoading,
    };
  }, [all, currentUserId, isLoading]);
}
