import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBranding } from '@/contexts/BrandingContext';
import { useUrlState } from '@/hooks/useUrlState';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2 } from 'lucide-react';
import { useAuraMode } from '@/hooks/useAuraMode';
import { callWhatsapp } from '@/hooks/useWhatsapp';

/** Liga/desliga o atendimento automático da Aura IA. Os dados que a IA usa ficam em Configurações > Atendimento. */
export default function AuraInfoCard() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setTab] = useUrlState<string>('aba', 'general');
  const mode = useAuraMode(clinicId);
  const changeMode = useMutation({
    mutationFn: (auto: boolean) => callWhatsapp('ai_mode', { clinicId, mode: auto ? 'auto' : 'copilot' }),
    onSuccess: (_d, auto) => {
      qc.invalidateQueries({ queryKey: ['aura-mode'] });
      toast({ title: auto ? 'Atendimento automático ligado' : 'Atendimento automático desligado', description: auto ? 'A IA responde sozinha e marca horários na agenda.' : 'A equipe responde, com o botão Sugerir resposta.' });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível mudar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card className="mt-4 shadow-card">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4" /> Atendimento automático</p>
          <p className="text-sm text-muted-foreground">
            Ligado: a IA responde sozinha no WhatsApp, consulta a agenda dos profissionais, oferece horários, confirma com o cliente e marca.
            Se alguém da equipe responder numa conversa, a IA pausa nela por 12 horas. Desligado: a equipe responde, com o botão "Sugerir resposta".
          </p>
          <p className="text-sm text-muted-foreground">
            A IA usa os dados de{' '}
            <button type="button" className="text-primary underline" onClick={() => setTab('atendimento')}>Configurações &gt; Atendimento</button>
            , dos tratamentos e da agenda de cada profissional.
          </p>
        </div>
        {changeMode.isPending ? <Loader2 className="mt-1 h-5 w-5 animate-spin" /> : (
          <Switch aria-label="Atendimento automático" checked={mode.data === 'auto'} disabled={!clinicId || mode.isLoading}
            onCheckedChange={(v) => changeMode.mutate(v)} />
        )}
      </CardContent>
    </Card>
  );
}
