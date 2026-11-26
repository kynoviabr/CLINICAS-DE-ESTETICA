import { publicOrigin } from '@/lib/publicOrigin';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileSignature, Loader2, PenLine, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/contexts/BrandingContext';
import { whatsappLink } from '@/lib/proposals/sale';
import { contractLinkMessage, contractLinkUrl } from '@/lib/signing/acceptance';
import { deviceLabel } from '@/lib/documents/device';
import { InPersonSignDialog } from '@/components/signing/InPersonSignDialog';
import { WhatsappAcceptanceButton } from '@/components/signing/WhatsappAcceptanceButton';

/** Assinatura digital do contrato: enviar o link pelo WhatsApp e ver a prova da assinatura. */
export default function ContractSignaturePanel({ contract }: {
  contract: { id: string; patient_id: string; contract_number: string; process_status: string; template_snapshot_html?: string | null; template_html?: string | null };
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { clinicName } = useBranding();
  const [sending, setSending] = useState(false);
  const [inPerson, setInPerson] = useState(false);
  const key = ['contract-signature', contract.id];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [{ data: sig }, { data: links }] = await Promise.all([
        supabase.from('contract_signatures').select('signer_name, signed_at, ip, user_agent, document_hash, verified_by').eq('contract_id', contract.id).maybeSingle(),
        supabase.from('contract_links').select('created_at, first_opened_at, last_opened_at').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(1),
      ]);
      const { data: patient } = await supabase.from('patients').select('full_name').eq('id', contract.patient_id).maybeSingle();
      return { sig, link: links?.[0] || null, patientName: patient?.full_name ?? null };
    },
  });

  const hasDocument = Boolean(contract.template_snapshot_html || contract.template_html);
  const cancelled = contract.process_status === 'cancelled';

  // Assinatura pelo celular confirma a identidade pela data de nascimento: sem ela, não gera o link.
  const requireBirthDate = async () => {
    const { data } = await supabase.from('patients').select('date_of_birth').eq('id', contract.patient_id).maybeSingle();
    if (!data?.date_of_birth) {
      throw new Error('Cadastre a data de nascimento do paciente antes (Revisar contrato > Corrigir dados do paciente). Ela é usada para confirmar a identidade na assinatura.');
    }
  };

  const send = async () => {
    const tab = window.open('', '_blank');
    setSending(true);
    try {
      const { data: p } = await supabase.from('patients').select('full_name, phone').eq('id', contract.patient_id).maybeSingle();
      if (!p?.phone) throw new Error('O paciente não tem telefone cadastrado.');
      await requireBirthDate();
      const { data: r, error } = await supabase.rpc('create_contract_link', { p_contract_id: contract.id });
      if (error) throw error;
      const url = contractLinkUrl(publicOrigin(), (r as { token: string }).token);
      const wa = whatsappLink(p.phone, contractLinkMessage(p.full_name.split(' ')[0], clinicName || 'nossa clínica', contract.contract_number, url));
      if (tab) tab.location.href = wa; else window.location.href = wa;
      qc.invalidateQueries({ queryKey: key });
      toast({ title: 'WhatsApp aberto', description: 'Link de assinatura pronto para enviar. Vale 15 dias.' });
    } catch (e) {
      tab?.close();
      toast({ title: 'Não foi possível gerar o link', description: e instanceof Error ? e.message : 'Tente de novo.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (data?.sig) {
    const s = data.sig;
    return (
      <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Assinado digitalmente pelo paciente</p>
        <p>{s.signer_name} · {format(new Date(s.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {s.verified_by === 'in_person_document' ? 'assinado na clínica, documento conferido pela equipe' : s.verified_by === 'whatsapp_phone' ? 'respondeu DE ACORDO pelo WhatsApp do cadastro' : `identidade conferida por ${s.verified_by === 'birth_date' ? 'data de nascimento' : s.verified_by === 'cpf' ? 'CPF' : 'nome'}`}</p>
        {s.verified_by !== 'whatsapp_phone' && <p className="break-all text-xs text-emerald-800">Rede: {s.ip || '—'} · Aparelho: {deviceLabel(s.user_agent)}</p>}
        <p className="break-all text-xs text-emerald-800">Código de integridade (SHA-256): {s.document_hash}</p>
      </div>
    );
  }

  if (cancelled || !hasDocument) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium">Assinatura digital</p>
        <p className="text-xs text-muted-foreground">
          {data?.link
            ? data.link.first_opened_at ? `Link enviado; o paciente abriu em ${format(new Date(data.link.last_opened_at || data.link.first_opened_at), 'dd/MM HH:mm')}, ainda sem assinar.` : 'Link enviado; o paciente ainda não abriu.'
            : 'O paciente lê e assina pelo celular. Não precisa imprimir nem escanear.'}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <WhatsappAcceptanceButton
          kind="contract"
          documentId={contract.id}
          createLink={async () => {
            await requireBirthDate();
      const { data: r, error } = await supabase.rpc('create_contract_link', { p_contract_id: contract.id });
            if (error) throw error;
            return { url: contractLinkUrl(publicOrigin(), (r as { token: string }).token) };
          }}
          onAccepted={() => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['contracts'] }); }}
        />
        <BrandButton size="sm" variant="outline" onClick={() => setInPerson(true)}>
          <PenLine className="h-4 w-4" /> Assinar na clínica
        </BrandButton>
        <BrandButton size="sm" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} {data?.link ? 'Reenviar link' : 'Enviar para assinar'}
        </BrandButton>
      </div>
      <InPersonSignDialog
        open={inPerson}
        onOpenChange={setInPerson}
        kind="contract"
        documentId={contract.id}
        documentLabel={`Contrato nº ${contract.contract_number}`}
        patientName={data?.patientName}
        createLink={async () => {
          await requireBirthDate();
      const { data: r, error } = await supabase.rpc('create_contract_link', { p_contract_id: contract.id });
          if (error) throw error;
          const token = (r as { token: string }).token;
          return { token, url: contractLinkUrl(publicOrigin(), token) };
        }}
        onSigned={() => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['contracts'] }); }}
      />
    </div>
  );
}
