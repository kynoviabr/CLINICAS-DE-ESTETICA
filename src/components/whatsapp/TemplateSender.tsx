import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { callWhatsapp, useWhatsappTemplates } from '@/hooks/useWhatsapp';
import { prefillTemplateParams, renderTemplate, templateFieldLabel, templateLabel } from '@/lib/whatsapp/inbox';
import { useBranding } from '@/contexts/BrandingContext';

type Props = {
  clinicId: string;
  conversationId?: string | null;
  phone?: string | null;
  leadId?: string | null;
  patientId?: string | null;
  contactName?: string | null;
  onSent?: (conversationId: string) => void;
};

/** Envia um modelo aprovado pela Meta: abre conversa nova ou retoma depois de 24h. */
export default function TemplateSender({ clinicId, conversationId, phone, leadId, patientId, contactName, onSent }: Props) {
  const { toast } = useToast();
  const { data: templates, isLoading, error } = useWhatsappTemplates(clinicId, true);
  const [selected, setSelected] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const template = templates?.find((t) => `${t.name}|${t.language}` === selected);
  const { clinicName } = useBranding();

  const pick = (value: string) => {
    setSelected(value);
    const t = templates?.find((x) => `${x.name}|${x.language}` === value);
    setParams(t ? prefillTemplateParams(t.name, t.variables, { contactName, clinicName }) : []);
  };

  const send = async () => {
    if (!template) return;
    setSending(true);
    try {
      const res = await callWhatsapp<{ conversationId: string }>('send_template', {
        clinicId, conversationId, phone, leadId, patientId, contactName,
        templateName: template.name, language: template.language, templateBody: template.body, params,
      });
      toast({ title: 'Mensagem enviada' });
      setSelected('');
      onSent?.(res.conversationId);
    } catch (err) {
      toast({ title: 'Não foi possível enviar', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando modelos…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!templates?.length) {
    return <p className="text-sm text-muted-foreground">Nenhum modelo aprovado ainda. Os modelos são criados e aprovados pela Meta (pode levar algumas horas).</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Modelo aprovado</Label>
        <Select value={selected} onValueChange={pick}>
          <SelectTrigger><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{templateLabel(t.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {template && (
        <>
          {params.map((value, i) => (
            <div key={i} className="space-y-1.5">
              <Label>{templateFieldLabel(template.name, i)}</Label>
              <Input value={value} onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))} />
            </div>
          ))}
          <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">{renderTemplate(template.body, params)}</p>
          <BrandButton onClick={send} disabled={sending || params.some((p) => !p.trim())} className="w-full">
            <Send className="h-4 w-4" /> {sending ? 'Enviando…' : 'Enviar modelo'}
          </BrandButton>
        </>
      )}
    </div>
  );
}
