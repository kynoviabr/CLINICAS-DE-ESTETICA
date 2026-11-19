import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

/** Duas etapas: obrigatória para administradores; opção de exigir de toda a equipe. */
export default function TeamMfaCard({ clinicId, isAdmin }: { clinicId: string | null; isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: requiredAll } = useQuery({
    queryKey: ['clinic-mfa-all', clinicId],
    enabled: !!clinicId,
    queryFn: async () => !!(await supabase.from('clinics').select('mfa_required_all').eq('id', clinicId!).maybeSingle()).data?.mfa_required_all,
  });
  const toggle = async (v: boolean) => {
    const { error } = await supabase.rpc('set_clinic_mfa_required_all', { p_clinic_id: clinicId!, p_value: v });
    if (error) { toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['clinic-mfa-all', clinicId] });
    toast({ title: v ? 'Duas etapas exigida de toda a equipe' : 'Duas etapas só para administradores', description: v ? 'Cada pessoa cadastra o autenticador no próximo acesso.' : undefined });
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Verificação em duas etapas</p>
        <p className="text-xs text-muted-foreground">Sempre obrigatória para administradores (código do aplicativo autenticador além da senha). Quem perder o celular: use "Zerar duas etapas" na lista abaixo.</p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-sm">
        <Switch checked={!!requiredAll} disabled={!isAdmin} onCheckedChange={toggle} aria-label="Exigir de toda a equipe" />
        Exigir de toda a equipe
      </label>
    </div>
  );
}
