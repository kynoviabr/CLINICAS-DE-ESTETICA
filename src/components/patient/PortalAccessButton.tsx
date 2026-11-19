import { publicOrigin } from '@/lib/publicOrigin';
import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/contexts/BrandingContext';
import { whatsappLink } from '@/lib/proposals/sale';
import { portalLinkMessage, portalLinkUrl } from '@/lib/portal/access';

/** Envia pelo WhatsApp o link pessoal de acesso ao portal (sem senha, vale 30 dias). */
export default function PortalAccessButton({ patient, active }: { patient: { id: string; full_name: string; phone?: string | null }; active: boolean }) {
  const { clinicName } = useBranding();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!patient.phone) { toast.error('Cadastre o telefone do paciente para enviar o acesso.'); return; }
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_portal_link', { p_patient_id: patient.id });
      if (error) throw error;
      const url = portalLinkUrl(publicOrigin(), (data as { token: string }).token);
      const wa = whatsappLink(patient.phone, portalLinkMessage(patient.full_name, clinicName || 'nossa clínica', url));
      if (tab) tab.location.href = wa; else window.location.href = wa;
      toast.success('WhatsApp aberto com o link de acesso ao portal.');
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={send} disabled={busy}>
      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ExternalLink className="mr-1 h-3 w-3" />}
      {active ? 'Reenviar acesso ao portal' : 'Enviar acesso ao portal'}
    </Button>
  );
}
