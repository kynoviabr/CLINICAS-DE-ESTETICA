import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BrandButton } from '@/components/ui/brand-button';
import {
  loadWhatsappAcceptance, requestWhatsappAcceptance, whatsappAcceptanceStatusText, type WhatsappAcceptanceKind,
} from '@/lib/signing/whatsappAcceptance';

type Props = {
  kind: WhatsappAcceptanceKind;
  documentId: string;
  /** Gera o link do documento para a cliente ler antes de responder. */
  createLink: () => Promise<{ url: string }>;
  /** A cliente respondeu e o aceite foi registrado. */
  onAccepted?: () => void;
};

/** "Pedir DE ACORDO no WhatsApp": envia o link pela conversa da Aura e acompanha a resposta. */
export function WhatsappAcceptanceButton({ kind, documentId, createLink, onAccepted }: Props) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const key = ['whatsapp-acceptance', kind, documentId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const before = qc.getQueryData<{ status?: string } | null>(key)?.status;
      const r = await loadWhatsappAcceptance(kind, documentId);
      // Avisa só na passagem de "aguardando" para "aceito" (enquanto a tela está aberta).
      if (before === 'pending' && r?.status === 'accepted') onAccepted?.();
      return r;
    },
    // Enquanto aguarda a resposta, confere de tempos em tempos.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 20000 : false),
  });

  const send = async () => {
    setSending(true);
    try {
      const { url } = await createLink();
      const r = await requestWhatsappAcceptance(kind, documentId, url);
      toast.success('Enviado pelo WhatsApp', { description: `Quando a cliente responder "DE ACORDO ${r.code}", o aceite fica registrado sozinho.` });
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error('Não foi possível pedir o de acordo', { description: e instanceof Error ? e.message : 'Tente de novo.' });
    } finally {
      setSending(false);
    }
  };

  const status = data?.status === 'accepted' ? null : whatsappAcceptanceStatusText(data ?? null);
  return (
    <div className="flex flex-col gap-1">
      <BrandButton size="sm" variant="outline" onClick={send} disabled={sending}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {data?.status === 'pending' ? 'Pedir de novo no WhatsApp' : 'Pedir DE ACORDO no WhatsApp'}
      </BrandButton>
      {status && <p className="max-w-xs text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
