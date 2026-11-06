import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BrandButton } from '@/components/ui/brand-button';
import { useConversationFor, useWhatsappChannel } from '@/hooks/useWhatsapp';
import ConversationThread from './ConversationThread';
import TemplateSender from './TemplateSender';

type Props = {
  clinicId: string;
  leadId?: string | null;
  patientId?: string | null;
  phone?: string | null;
  name?: string | null;
};

/** Conversa do WhatsApp dentro da ficha do lead ou da paciente. */
export default function ContactWhatsappPanel({ clinicId, leadId, patientId, phone, name }: Props) {
  const navigate = useNavigate();
  const { data: channel, isLoading: loadingChannel } = useWhatsappChannel(clinicId);
  const { data: conversation, isLoading } = useConversationFor(clinicId, { leadId, patientId });

  if (isLoading || loadingChannel) {
    return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
  }
  if (conversation) {
    return (
      <div className="overflow-hidden rounded-lg border">
        <ConversationThread conversation={conversation} className="h-[340px] sm:h-[380px]" />
      </div>
    );
  }
  if (channel?.status !== 'connected') {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        O WhatsApp da clínica ainda não está conectado.{' '}
        <button type="button" className="text-primary hover:underline" onClick={() => navigate('/clinic/settings?aba=whatsapp')}>Conectar</button>
      </div>
    );
  }
  if (!phone) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Cadastre o telefone para conversar pelo WhatsApp.</p>;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">Ainda não há conversa com este número. Para começar, o WhatsApp exige um modelo aprovado.</p>
      <TemplateSender clinicId={clinicId} phone={phone} leadId={leadId} patientId={patientId} contactName={name} />
      <BrandButton variant="ghost" size="sm" onClick={() => navigate('/clinic/conversas')}>Ver todas as conversas</BrandButton>
    </div>
  );
}
