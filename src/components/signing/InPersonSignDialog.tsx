import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, PenLine, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

export type InPersonKind = 'proposal' | 'contract' | 'anamnese';

const NOUN: Record<InPersonKind, string> = { proposal: 'a proposta', contract: 'o contrato', anamnese: 'a anamnese' };
const AGREE: Record<InPersonKind, string> = {
  proposal: 'Li a proposta e estou de acordo com os tratamentos, valores e condições.',
  contract: 'Li o contrato inteiro e estou de acordo com todas as cláusulas.',
  anamnese: 'Declaro que as informações da anamnese são verdadeiras e concordo com os termos.',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: InPersonKind;
  documentId: string;
  documentLabel: string;
  /** Nome no cadastro (a cliente digita igual para assinar). */
  patientName?: string | null;
  /** Gera o link do documento para o QR Code. Sem ele, só a assinatura na tela. */
  createLink?: () => Promise<{ url: string; token: string }>;
  onSigned: () => void;
};

/** Aceite na clínica: QR Code para o celular da cliente ou assinatura desenhada no aparelho da clínica. */
export function InPersonSignDialog({ open, onOpenChange, kind, documentId, documentLabel, patientName, createLink, onSigned }: Props) {
  const pad = useRef<SignaturePadHandle>(null);
  const [tab, setTab] = useState(createLink ? 'qr' : 'draw');
  const [qr, setQr] = useState<{ img: string; url: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [name, setName] = useState('');
  const [idChecked, setIdChecked] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setQr(null); setName(''); setIdChecked(false); setAgreed(false); setHasInk(false); setTab(createLink ? 'qr' : 'draw'); }
  }, [open, createLink]);

  const showQr = async () => {
    if (!createLink) return;
    setQrLoading(true);
    try {
      const { url, token } = await createLink();
      const { error } = await supabase.rpc('mark_link_in_person', { p_kind: kind, p_token: token });
      if (error) throw error;
      setQr({ img: await QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: 'M' }), url });
    } catch (e) {
      toast.error('Não foi possível gerar o QR Code', { description: e instanceof Error ? e.message : 'Tente de novo.' });
    } finally {
      setQrLoading(false);
    }
  };

  const sign = async () => {
    const image = pad.current?.toDataUrl();
    if (!image) { toast.error('Peça para a cliente assinar no quadro.'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('sign_in_person', {
      p_kind: kind, p_document_id: documentId, p_signer_name: name, p_signature_image: image,
    });
    setSaving(false);
    if (error) { toast.error('Assinatura não registrada', { description: error.message }); return; }
    const code = (data as { verification_code?: string } | null)?.verification_code;
    toast.success('Assinatura registrada', { description: code ? `Código de verificação ${code}.` : undefined });
    onOpenChange(false);
    onSigned();
  };

  const canSign = name.trim().length >= 3 && idChecked && agreed && hasInk && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assinar na clínica</DialogTitle>
          <DialogDescription>{documentLabel}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          {createLink && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="qr"><Smartphone className="mr-1.5 h-4 w-4" /> No celular dela</TabsTrigger>
              <TabsTrigger value="draw"><PenLine className="mr-1.5 h-4 w-4" /> Nesta tela</TabsTrigger>
            </TabsList>
          )}

          {createLink && (
            <TabsContent value="qr" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A cliente aponta a câmera do celular para o código, abre {NOUN[kind]}, confirma a identidade e aceita. É a prova mais forte:
                fica o aparelho e a rede dela.
              </p>
              {qr ? (
                <div className="space-y-2 text-center">
                  <img src={qr.img} alt="QR Code do documento" className="mx-auto h-64 w-64 rounded-lg border bg-white p-2" />
                  <p className="text-xs text-muted-foreground">Quando ela terminar, toque em "Já assinou" para atualizar.</p>
                  <BrandButton className="w-full" onClick={() => { onOpenChange(false); onSigned(); }}>
                    <ShieldCheck className="h-4 w-4" /> Já assinou
                  </BrandButton>
                </div>
              ) : (
                <BrandButton className="w-full" onClick={showQr} disabled={qrLoading}>
                  {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Mostrar QR Code
                </BrandButton>
              )}
            </TabsContent>
          )}

          <TabsContent value="draw" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Passe o aparelho para a cliente. Fica registrada a assinatura, a data e a hora, este aparelho e quem da equipe está logado.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="in-person-name">Nome completo da cliente</Label>
              <Input id="in-person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={patientName || 'Como está no cadastro'} autoComplete="off" />
            </div>
            <SignaturePad ref={pad} onChange={setHasInk} />
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <span>{AGREE[kind]}</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-sm">
              <Checkbox checked={idChecked} onCheckedChange={(v) => setIdChecked(v === true)} className="mt-0.5" />
              <span><strong>Equipe:</strong> conferi o documento de identidade da cliente.</span>
            </label>
            <BrandButton className="w-full" onClick={sign} disabled={!canSign}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Registrar assinatura
            </BrandButton>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
