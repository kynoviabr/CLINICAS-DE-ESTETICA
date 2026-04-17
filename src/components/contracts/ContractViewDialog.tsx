import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { ContractStatusBadge } from './ContractStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Printer, ExternalLink, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  contract: any;
  clinicName: string;
  onClose: () => void;
}

export function ContractViewDialog({ contract, clinicName, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const c = contract;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${c.clinic_id}/${c.patient_id}/docs/contrato_${c.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('patient-files').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('patient-files').getPublicUrl(path);
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 24);

      const { error } = await supabase.from('contracts').update({
        signed_pdf_url: urlData.publicUrl,
        signed_at: new Date().toISOString(),
        process_status: 'pending_confirmation' as any,
        confirmation_deadline: deadline.toISOString(),
      }).eq('id', c.id);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Arquivo enviado! Confirme o upload em até 24h.' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const confirmUpload = async () => {
    const { error } = await supabase.from('contracts').update({
      upload_confirmed: true,
      confirmed_at: new Date().toISOString(),
      process_status: 'confirmed' as any,
      status: 'active' as any,
    }).eq('id', c.id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Upload confirmado! Contrato ativo.' });
      onClose();
    }
  };

  const cancelContract = async () => {
    const { error } = await supabase.from('contracts').update({
      status: 'cancelled' as any,
      process_status: 'cancelled' as any,
    }).eq('id', c.id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato cancelado' });
      onClose();
    }
  };

  const handlePrint = () => {
    if (c.template_html) {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(c.template_html);
      w.document.close();
      w.print();
    }
  };

  const isOverdue = c.process_status === 'overdue';
  const needsConfirmation = c.process_status === 'pending_confirmation';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Contrato {c.contract_number}</span>
            <ContractStatusBadge status={c.process_status} />
          </DialogTitle>
        </DialogHeader>

        {isOverdue && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
            <AlertTriangle className="w-4 h-4" />
            Prazo de confirmação expirado. Confirme ou reenvie o documento.
          </div>
        )}

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Paciente:</span><br /><span className="font-medium">{(c.patients as any)?.full_name}</span></div>
            <div><span className="text-muted-foreground">Proposta:</span><br /><span className="font-medium">{(c.proposals as any)?.proposal_number || '—'}</span></div>
            <div><span className="text-muted-foreground">Valor:</span><br /><span className="font-bold">R$ {Number((c.proposals as any)?.final_amount || 0).toFixed(2)}</span></div>
            <div><span className="text-muted-foreground">Data:</span><br /><span className="font-medium">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
            {c.signed_at && <div><span className="text-muted-foreground">Upload em:</span><br /><span className="font-medium">{format(new Date(c.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span></div>}
            {c.confirmed_at && <div><span className="text-muted-foreground">Confirmado em:</span><br /><span className="font-medium">{format(new Date(c.confirmed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span></div>}
            {c.confirmation_deadline && !c.upload_confirmed && (
              <div><span className="text-muted-foreground">Prazo:</span><br /><span className="font-medium text-amber-600">{format(new Date(c.confirmation_deadline), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span></div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {c.template_html && (
              <BrandButton variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4" /> Imprimir
              </BrandButton>
            )}

            {c.signed_pdf_url && (
              <BrandButton variant="outline" size="sm" onClick={() => window.open(c.signed_pdf_url, '_blank')}>
                <ExternalLink className="w-4 h-4" /> Ver Documento
              </BrandButton>
            )}

            {(c.process_status === 'pending_upload' || isOverdue) && (
              <label className="cursor-pointer">
                <BrandButton size="sm" type="button" disabled={uploading}>
                  <Upload className="w-4 h-4" /> {uploading ? 'Enviando...' : 'Upload Assinado'}
                </BrandButton>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => {
                  if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                }} />
              </label>
            )}

            {needsConfirmation && (
              <BrandButton size="sm" onClick={confirmUpload}>
                <CheckCircle2 className="w-4 h-4" /> Confirmar Upload
              </BrandButton>
            )}

            {c.process_status !== 'cancelled' && c.process_status !== 'confirmed' && (
              cancelConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Confirmar?</span>
                  <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={cancelContract}>Sim</BrandButton>
                  <BrandButton size="sm" variant="outline" onClick={() => setCancelConfirm(false)}>Não</BrandButton>
                </div>
              ) : (
                <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => setCancelConfirm(true)}>
                  Cancelar
                </BrandButton>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
