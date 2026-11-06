import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClinicLetterhead } from '@/lib/documents/letterhead';

/** Dados da clínica para o papel timbrado (orçamento e contrato). */
export async function loadClinicLetterhead(clinicId: string): Promise<ClinicLetterhead> {
  const [clinicRes, cnpjRes] = await Promise.all([
    supabase.from('clinics').select('name, address, city, state, zip_code, phone, email, logo_url, primary_color').eq('id', clinicId).maybeSingle(),
    supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId).eq('key', 'cnpj').maybeSingle(),
  ]);
  const c = clinicRes.data;
  return {
    name: c?.name || 'Clínica',
    document: typeof cnpjRes.data?.value === 'string' ? cnpjRes.data.value : null,
    address: c?.address, city: c?.city, state: c?.state, zipCode: c?.zip_code,
    phone: c?.phone, email: c?.email, logoUrl: c?.logo_url, accentColor: c?.primary_color,
  };
}

export function useClinicLetterhead(clinicId: string | null | undefined) {
  return useQuery({
    queryKey: ['clinic-letterhead', clinicId],
    queryFn: () => loadClinicLetterhead(clinicId!),
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  });
}
