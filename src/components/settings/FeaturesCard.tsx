import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useClinicFeatures } from '@/hooks/useClinicFeatures';
import { FEATURES, type FeatureName } from '@/lib/features';
import { upsertClinicSetting } from '@/lib/setup/clinicSetup';

/** Configurações › Geral: ligar/desligar Estoque e Despesas. Desligar só esconde; os dados ficam. */
export function FeaturesCard() {
  const { clinicId, role } = useUserRole();
  const { isEnabled } = useClinicFeatures();
  const { toast } = useToast();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ feature, on }: { feature: FeatureName; on: boolean }) => {
      await upsertClinicSetting(clinicId!, FEATURES[feature].key, on ? 'on' : 'off');
    },
    onSuccess: (_, { feature, on }) => {
      qc.invalidateQueries({ queryKey: ['clinic-features'] });
      toast({ title: `${FEATURES[feature].label} ${on ? 'ligado' : 'desligado'}` });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle>Funcionalidades</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(FEATURES) as FeatureName[]).map((feature) => (
          <label key={feature} className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">{FEATURES[feature].label}</span>
              <span className="block text-xs text-muted-foreground">{FEATURES[feature].description}</span>
            </span>
            <Switch
              checked={isEnabled(feature)}
              disabled={role !== 'admin' || toggle.isPending}
              onCheckedChange={(on) => toggle.mutate({ feature, on })}
            />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Desligado, some do menu e dos avisos. Os dados continuam guardados.</p>
      </CardContent>
    </Card>
  );
}
