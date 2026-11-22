import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { upsertClinicSetting } from '@/lib/setup/clinicSetup';

/**
 * "Primeiros passos" no Meu dia: o que falta para a clínica começar a atender, com o próximo passo
 * em destaque. Some sozinho quando tudo está pronto (ou quando a administradora oculta).
 */
export function OnboardingChecklist({ clinicId }: { clinicId: string | null | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useOnboardingStatus(clinicId);
  if (!data || data.hidden || data.complete) return null;
  const next = data.next;

  const hide = async () => {
    if (!clinicId) return;
    await upsertClinicSetting(clinicId, 'onboarding_hidden_at', new Date().toISOString());
    qc.invalidateQueries({ queryKey: ['onboarding-status', clinicId] });
  };

  return (
    <Card className="border-primary/30 shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Primeiros passos da sua clínica</h2>
            <p className="text-sm text-muted-foreground">{data.done} de {data.total} prontos. Faça um de cada vez: cada um leva poucos minutos.</p>
          </div>
          <button type="button" onClick={hide} aria-label="Ocultar primeiros passos" title="Ocultar"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label="Primeiros passos concluídos">
          <div className="h-full rounded-full bg-primary" style={{ width: `${data.percent}%` }} />
        </div>

        {next && (
          <div className="flex flex-col gap-3 rounded-xl bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Próximo passo</p>
              <p className="font-semibold">{next.title}</p>
              <p className="text-sm text-muted-foreground">{next.why}</p>
            </div>
            <BrandButton onClick={() => navigate(next.href)} className="shrink-0">{next.action} <ChevronRight className="h-4 w-4" /></BrandButton>
          </div>
        )}

        <ul className="grid gap-1.5 sm:grid-cols-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(item.href)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} aria-hidden="true">
                  {item.done && <Check className="h-3 w-3" />}
                </span>
                <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.title}</span>
                {item.optional && !item.done && <span className="text-xs text-muted-foreground">(opcional)</span>}
                <span className="sr-only">{item.done ? 'feito' : 'pendente'}</span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
