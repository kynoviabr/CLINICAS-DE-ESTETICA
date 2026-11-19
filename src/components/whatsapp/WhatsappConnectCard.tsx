import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { callWhatsapp, useWhatsappChannel } from '@/hooks/useWhatsapp';

/** Configurações › WhatsApp: conecta o número da clínica (cadastro oficial da Meta, pela Zernio). */
export default function WhatsappConnectCard() {
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: channel, isLoading } = useWhatsappChannel(clinicId);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);

  // Volta da tela da Meta/Zernio: ?wa=retorno&accountId=...
  useEffect(() => {
    if (!clinicId || params.get('wa') !== 'retorno' || finishing.current) return;
    finishing.current = true;
    const accountId = params.get('accountId') || '';
    const error = params.get('error');
    const next = new URLSearchParams(params);
    ['wa', 'accountId', 'error', 'error_message', 'platform', 'connected', 'profileId', 'username'].forEach((k) => next.delete(k));
    if (error) {
      toast({ title: 'A conexão não terminou', description: params.get('error_message') || error, variant: 'destructive' });
      setParams(next, { replace: true });
      return;
    }
    setBusy(true);
    callWhatsapp('connect_finish', { clinicId, accountId })
      .then(() => {
        toast({ title: 'WhatsApp conectado!', description: 'As mensagens novas já chegam em Conversas.' });
        qc.invalidateQueries({ queryKey: ['wa-channel', clinicId] });
      })
      .catch((err) => toast({ title: 'Não foi possível concluir', description: (err as Error).message, variant: 'destructive' }))
      .finally(() => { setBusy(false); setParams(next, { replace: true }); });
  }, [clinicId, params, setParams, toast, qc]);

  const start = async () => {
    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}/clinic/settings?aba=whatsapp&wa=retorno`;
      const { authUrl } = await callWhatsapp<{ authUrl: string }>('connect_start', { clinicId, redirectUrl });
      window.location.href = authUrl;
    } catch (err) {
      toast({ title: 'Não foi possível iniciar', description: (err as Error).message, variant: 'destructive' });
      setBusy(false);
    }
  };

  const connected = channel?.status === 'connected';
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp da clínica</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : connected ? (
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="text-sm">
              <p className="font-medium text-emerald-900">Conectado{channel?.phone_number ? `: ${channel.phone_number}` : ''}</p>
              <p className="text-emerald-900/80">As mensagens chegam em Conversas e na ficha do lead/paciente. Número novo vira lead no funil.</p>
            </div>
          </div>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Clique em <strong>Conectar WhatsApp</strong> e entre com o Facebook de quem administra a clínica.</li>
              <li>Escolha ou crie a conta empresarial e informe o número da clínica.</li>
              <li>Se o número já usa o app <strong>WhatsApp Business</strong>, escolha manter o app e leia o QR code com o celular: o app continua funcionando e as conversas aparecem nos dois.</li>
            </ol>
            <BrandButton onClick={start} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} {busy ? 'Aguarde…' : 'Conectar WhatsApp'}
            </BrandButton>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Regras do WhatsApp: a clínica responde com texto livre até 24h depois da última mensagem da cliente. Depois disso, ou para iniciar conversa, usa um modelo aprovado pela Meta.
        </p>
      </CardContent>
    </Card>
  );
}
