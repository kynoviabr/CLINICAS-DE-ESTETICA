import { useEffect, useRef, useState } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, AlertTriangle, Check, CheckCheck, Clock, Loader2, Send, Sparkles, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BrandButton } from '@/components/ui/brand-button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsapp, useWhatsappMessages } from '@/hooks/useWhatsapp';
import { isWindowOpen, messageText, windowLeftLabel, type WaConversation, type WaMessage } from '@/lib/whatsapp/inbox';
import { missingSourcesText, type Suggestion } from '@/lib/whatsapp/auraInfo';
import TemplateSender from './TemplateSender';

function StatusIcon({ m }: { m: WaMessage }) {
  if (m.direction === 'incoming') return null;
  if (m.status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-rose-600" />;
  if (m.status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (m.status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (m.status === 'sending') return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
}

/** Mensagens de uma conversa + caixa de resposta. Usada na tela Conversas e na ficha do lead/paciente. */
export default function ConversationThread({ conversation, className = 'h-[60vh]' }: { conversation: WaConversation; className?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: messages, isLoading } = useWhatsappMessages(conversation.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const open = isWindowOpen(conversation.last_incoming_at);
  const leftLabel = windowLeftLabel(conversation.last_incoming_at);

  // Recalcula a janela de 24h a cada minuto.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Sugestão vale só para a conversa em que foi pedida.
  useEffect(() => { setSuggestion(null); setText(''); }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  useEffect(() => {
    if (conversation.unread_count > 0) {
      supabase.rpc('whatsapp_mark_read', { p_conversation_id: conversation.id }).then(() => {
        qc.invalidateQueries({ queryKey: ['wa-conversations', conversation.clinic_id] });
      });
    }
  }, [conversation.id, conversation.unread_count, conversation.clinic_id, qc]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await callWhatsapp('send_text', { conversationId: conversation.id, text: body, suggestionId: suggestion?.id || undefined });
      setText('');
      setSuggestion(null);
      qc.invalidateQueries({ queryKey: ['wa-messages', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations', conversation.clinic_id] });
    } catch (err) {
      toast({ title: 'Não foi possível enviar', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  /** Copiloto da Aura IA: preenche a caixa com uma sugestão; a pessoa revisa e envia. */
  const suggest = async () => {
    setSuggesting(true);
    try {
      const { suggestion: s } = await callWhatsapp<{ suggestion: Suggestion }>('suggest', { conversationId: conversation.id });
      setSuggestion(s);
      if (s.text) setText(s.text);
      else toast({ title: 'A IA não sugeriu resposta', description: 'Por segurança, escreva esta resposta manualmente.' });
    } catch (err) {
      toast({ title: 'Não foi possível sugerir', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSuggesting(false);
    }
  };
  const missing = suggestion ? missingSourcesText(suggestion) : null;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#efeae2] p-3">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : !messages?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((m, i) => {
            const at = parseISO(m.sent_at);
            const newDay = i === 0 || !isSameDay(parseISO(messages[i - 1].sent_at), at);
            const mine = m.direction === 'outgoing';
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-2 text-center"><span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm">{format(at, "d 'de' MMMM", { locale: ptBR })}</span></p>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${mine ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                    <p className="whitespace-pre-wrap break-words">{messageText(m)}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                      {format(at, 'HH:mm')} <StatusIcon m={m} />
                    </p>
                    {m.status === 'failed' && m.error && <p className="text-[11px] text-rose-700">{m.error}</p>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t bg-card p-3">
        {open ? (
          <>
            {suggestion && (suggestion.flags.length > 0 || suggestion.handoff || missing) && (
              <div className="mb-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                {suggestion.handoff && <p className="flex items-center gap-1.5 font-medium"><UserRound className="h-3.5 w-3.5" /> Atenção: a cliente precisa de uma pessoa da equipe.</p>}
                {suggestion.flags.filter((f) => f.code !== 'wants_human').map((f) => (
                  <p key={f.code} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.text}</p>
                ))}
                {missing && <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {missing}</p>}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-2">
              <BrandButton type="button" size="sm" variant="outline" onClick={suggest} disabled={suggesting || sending}>
                {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Sugerir resposta
              </BrandButton>
              {suggestion?.text && <span className="text-[11px] text-muted-foreground">Sugestão da IA: revise antes de enviar.</span>}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Digite sua resposta aqui…"
                rows={4}
                className="min-h-[88px] resize-y"
              />
              <BrandButton onClick={send} disabled={sending || !text.trim()} aria-label="Enviar">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </BrandButton>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Enter envia · Shift+Enter quebra linha{leftLabel ? ` · ${leftLabel}` : ''}</p>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {conversation.last_incoming_at
                ? 'Passaram 24h desde a última mensagem da cliente. Pelas regras do WhatsApp, agora só dá para enviar um modelo aprovado.'
                : 'Para começar a conversa, o WhatsApp exige um modelo aprovado.'}
            </p>
            <TemplateSender
              clinicId={conversation.clinic_id}
              conversationId={conversation.id}
              contactName={conversation.patients?.full_name || conversation.leads?.full_name || conversation.contact_name}
              onSent={() => qc.invalidateQueries({ queryKey: ['wa-messages', conversation.id] })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
