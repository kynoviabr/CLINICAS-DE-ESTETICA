import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export interface ClassEntity {
  id: string;
  clinic_id: string;
  name: string;
  abbreviation: string;
  status: string;
  created_at: string;
  updated_at: string;
}

type ClassEntityInsert = Omit<ClassEntity, 'id' | 'created_at' | 'updated_at' | 'clinic_id'>;
type ClassEntityUpdate = Partial<ClassEntityInsert>;

interface Filters {
  status?: string;
  search?: string;
}

export function useClassEntities() {
  const { clinicId } = useUserRole();
  const [items, setItems] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const list = useCallback(async (filters?: Filters) => {
    if (!clinicId) return;
    setLoading(true);
    let q = supabase.from('class_entities').select('*').eq('clinic_id', clinicId).order('name');
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
    const { data, error } = await q;
    if (error) { toast.error(error.message); } else { setItems(data || []); }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { list(); }, [list]);

  const create = async (input: ClassEntityInsert) => {
    if (!clinicId) return null;
    const { data, error } = await supabase.from('class_entities').insert({ ...input, clinic_id: clinicId }).select().single();
    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        toast.error('Já existe uma entidade com este nome ou sigla');
      } else {
        toast.error(error.message);
      }
      return null;
    }
    toast.success('Entidade de classe cadastrada com sucesso');
    await list();
    return data;
  };

  const update = async (id: string, input: ClassEntityUpdate) => {
    const { data, error } = await supabase.from('class_entities').update(input).eq('id', id).select().single();
    if (error) { toast.error(error.message); return null; }
    await list();
    return data;
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    const result = await update(id, { status: newStatus });
    if (result) {
      toast.success(newStatus === 'active' ? 'Entidade reativada com sucesso' : 'Entidade inativada com sucesso');
    }
    return result;
  };

  return { items, loading, list, create, update, toggleStatus };
}
