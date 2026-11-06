import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ArrowLeft, ExternalLink, MessageCircle, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useUserRole } from '@/hooks/useUserRole';
import { useWhatsappChannel, useWhatsappConversations } from '@/hooks/useWhatsapp';
import { conversationTitle, displayPhone, type WaConversation } from '@/lib/whatsapp/inbox';
import ConversationThread from '@/components/whatsapp/ConversationThread';

function when(iso: string | null) {
  if (!iso) return '';
  const d = parseISO(iso);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM');
}

function ContactTag({ c }: { c: WaConversation }) {
  if (c.patient_id) return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">Paciente</span>;
  if (c.lead_id) return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">Lead</span>;
  return null;
}

/** Caixa de entrada do WhatsApp da clínica: todas as conversas, ligadas ao lead ou à paciente. */
export default function ConversationsPage() {
  const navigate = useNavigate();
  const { clinicId, role } = useUserRole();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('c');
  const [search, setSearch] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data: channel, isLoading: loadingChannel } = useWhatsappChannel(clinicId);
  const { data: conversations, isLoading } = useWhatsappConversations(clinicId);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return (conversations || []).filter((c) => {
      if (onlyUnread && c.unread_count === 0) return false;
      if (!term) return true;
      return conversationTitle(c).toLowerCase().includes(term) || (digits.length >= 3 && (c.contact_phone || '').includes(digits));
    });
  }, [conversations, search, onlyUnread]);
  const selected = conversations?.find((c) => c.id === selectedId) || null;
  const unreadTotal = (conversations || []).reduce((sum, c) => sum + (c.unread_count > 0 ? 1 : 0), 0);
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id); else next.delete('c');
    setParams(next, { replace: true });
  };

  if (!loadingChannel && channel?.status !== 'connected' && !(conversations || []).length) {
    return (
      <div>
        <PageHeader title="Conversas" description="O WhatsApp da clínica dentro do Clinova." />
        <Card className="shadow-card"><CardContent className="space-y-3 p-6 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="font-medium">Conecte o WhatsApp da clínica</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            As mensagens chegam aqui, ligadas ao lead ou à paciente. Número novo vira lead no funil automaticamente.
          </p>
          {role === 'admin'
            ? <BrandButton onClick={() => navigate('/clinic/settings?aba=whatsapp')}>Conectar WhatsApp</BrandButton>
            : <p className="text-sm text-muted-foreground">Peça ao administrador da clínica para conectar em Configurações.</p>}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Conversas" description={channel?.phone_number ? `WhatsApp ${displayPhone(String(channel.phone_number).replace(/\D/g, '')) || channel.phone_number}` : 'WhatsApp da clínica'} />

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <Card className={`shadow-card ${selected ? 'hidden lg:block' : ''}`}><CardContent className="p-0">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou telefone" className="pl-8" />
            </div>
            <div className="flex gap-1 text-xs">
              <button type="button" onClick={() => setOnlyUnread(false)} className={`rounded-full px-3 py-1 ${!onlyUnread ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Todas</button>
              <button type="button" onClick={() => setOnlyUnread(true)} className={`rounded-full px-3 py-1 ${onlyUnread ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Não lidas{unreadTotal ? ` (${unreadTotal})` : ''}</button>
            </div>
          </div>
          {isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{conversations?.length ? 'Nada encontrado.' : 'Nenhuma conversa ainda. Quando alguém mandar mensagem, aparece aqui.'}</p>
          ) : (
            <ul className="max-h-[70vh] divide-y overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => select(c.id)}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 ${c.id === selectedId ? 'bg-muted' : ''}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                      {conversationTitle(c).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-sm ${c.unread_count ? 'font-semibold' : 'font-medium'}`}>{conversationTitle(c)}</p>
                        <ContactTag c={c} />
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{when(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs text-muted-foreground">{c.last_message_direction === 'outgoing' ? 'Você: ' : ''}{c.last_message_preview}</p>
                        {c.unread_count > 0 && <span className="ml-auto rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">{c.unread_count}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>

        {selected ? (
          <Card className="overflow-hidden shadow-card"><CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <button type="button" className="rounded p-1 hover:bg-muted lg:hidden" aria-label="Voltar" onClick={() => select(null)}><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{conversationTitle(selected)} <ContactTag c={selected} /></p>
                <p className="text-xs text-muted-foreground">{displayPhone(selected.contact_phone)}</p>
              </div>
              {selected.patient_id ? (
                <BrandButton variant="outline" size="sm" onClick={() => navigate(`/clinic/patients/${selected.patient_id}`)}><ExternalLink className="h-3.5 w-3.5" /> Ficha</BrandButton>
              ) : selected.lead_id ? (
                <BrandButton variant="outline" size="sm" onClick={() => navigate(`/clinic/crm?leadId=${selected.lead_id}`)}><ExternalLink className="h-3.5 w-3.5" /> Lead</BrandButton>
              ) : null}
            </div>
            <ConversationThread key={selected.id} conversation={selected} className="h-[calc(100vh-260px)] min-h-[420px]" />
          </CardContent></Card>
        ) : (
          <Card className="hidden shadow-card lg:block"><CardContent className="flex h-full min-h-[420px] items-center justify-center p-6 text-sm text-muted-foreground">
            Escolha uma conversa.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
