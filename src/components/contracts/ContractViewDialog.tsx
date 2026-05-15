import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { ContractStatusBadge } from './ContractStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Copy, ExternalLink, FileUp, Printer, TriangleAlert } from 'lucide-react';
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

  const refreshContracts = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    onClose();
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${c.clinic_id}/${c.patient_id}/signed/${c.contract_number}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(path);
      const { error } = await supabase
        .from('contracts')
        .update({
          signed_pdf_url: urlData.publicUrl,
          signed_at: new Date().toISOString(),
          process_status: 'pending_confirmation',
        })
        .eq('id', c.id);

      if (error) throw error;

      toast({ title: 'Documento assinado arquivado!' });
      refreshContracts();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const activateContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        upload_confirmed: true,
        confirmed_at: new Date().toISOString(),
        process_status: 'confirmed',
        status: 'active',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato ativado!' });
    refreshContracts();
  };

  const cancelContract = async () => {
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'cancelled',
        process_status: 'cancelled',
      })
      .eq('id', c.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Contrato cancelado' });
    refreshContracts();
  };

  const handlePrint = () => {
    if (!c.template_html) return;
    const windowRef = window.open('', '_blank');
    if (!windowRef) return;
    windowRef.document.write(c.template_html);
    windowRef.document.close();
    windowRef.print();
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: successMessage });
    } catch {
      toast({ title: 'Não foi possível copiar agora', variant: 'destructive' });
    }
  };

  const hasSignedFile = Boolean(c.signed_pdf_url);
  const isGenerated = c.process_status === 'pending_upload';
  const isReadyToActivate = c.process_status === 'pending_confirmation';
  const isCancelled = c.process_status === 'cancelled';
  const isActive = c.process_status === 'confirmed';
  const timelineEvents = [
    c.created_at
      ? {
          key: 'created',
          label: 'Contrato gerado',
          date: new Date(c.created_at),
          tone: 'bg-slate-100 text-slate-700',
        }
      : null,
    c.signed_at
      ? {
          key: 'signed',
          label: 'Arquivo assinado recebido',
          date: new Date(c.signed_at),
          tone: 'bg-amber-100 text-amber-700',
        }
      : null,
    c.confirmed_at
      ? {
          key: 'confirmed',
          label: 'Contrato ativado',
          date: new Date(c.confirmed_at),
          tone: 'bg-emerald-100 text-emerald-700',
        }
      : null,
    c.process_status === 'cancelled'
      ? {
          key: 'cancelled',
          label: 'Contrato cancelado',
          date: c.updated_at ? new Date(c.updated_at) : c.created_at ? new Date(c.created_at) : new Date(),
          tone: 'bg-rose-100 text-rose-700',
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Contrato {c.contract_number}</span>
            <ContractStatusBadge status={c.process_status} />
          </DialogTitle>
        </DialogHeader>

        {c.process_status === 'overdue' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
            <TriangleAlert className="w-4 h-4" />
            Este contrato precisa de revisão antes de seguir.
          </div>
        )}

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Paciente:</span>
              <br />
              <span className="font-medium">{(c.patients as any)?.full_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Proposta:</span>
              <br />
              <span className="font-medium">{(c.proposals as any)?.proposal_number || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Valor:</span>
              <br />
              <span className="font-bold">R$ {Number((c.proposals as any)?.final_amount || 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Criado em:</span>
              <br />
              <span className="font-medium">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
            {c.signed_at && (
              <div>
                <span className="text-muted-foreground">Arquivo recebido em:</span>
                <br />
                <span className="font-medium">{format(new Date(c.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>
            )}
            {c.confirmed_at && (
              <div>
                <span className="text-muted-foreground">Ativado em:</span>
                <br />
                <span className="font-medium">{format(new Date(c.confirmed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Próximo passo</p>
            <p className="text-muted-foreground">
              {isGenerated && 'Gerar ou coletar o documento assinado e arquivá-lo no contrato.'}
              {isReadyToActivate && 'Revisar o arquivo assinado e ativar o contrato para seguir a operação.'}
              {isActive && 'Contrato ativo e pronto para ser usado no fluxo operacional da clínica.'}
              {isCancelled && 'Contrato encerrado, sem continuidade operacional.'}
              {c.process_status === 'overdue' && 'Revisar o documento e decidir se ele deve ser reenviado ou ativado.'}
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">Timeline do contrato</p>
            {timelineEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
            ) : (
              <div className="space-y-2">
                {timelineEvents.map((event: any) => (
                  <div key={event.key} className="flex items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${event.tone}`}>{event.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(event.date, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {c.template_html && (
              <BrandButton variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4" />
                Imprimir minuta
              </BrandButton>
            )}

            {hasSignedFile && (
              <BrandButton variant="outline" size="sm" onClick={() => window.open(c.signed_pdf_url, '_blank')}>
                <ExternalLink className="w-4 h-4" />
                Ver arquivo
              </BrandButton>
            )}

            {hasSignedFile && (
              <BrandButton
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(c.signed_pdf_url, 'Link do contrato copiado!')}
              >
                <Copy className="w-4 h-4" />
                Copiar link
              </BrandButton>
            )}

            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(c.contract_number || '', 'Número do contrato copiado!')}
              disabled={!c.contract_number}
            >
              <Copy className="w-4 h-4" />
              Copiar número
            </BrandButton>

            {!isCancelled && !isActive && (
              <label className="cursor-pointer">
                <BrandButton size="sm" type="button" disabled={uploading}>
                  <FileUp className="w-4 h-4" />
                  {uploading ? 'Arquivando...' : hasSignedFile ? 'Substituir arquivo' : 'Arquivar assinado'}
                </BrandButton>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.[0]) handleUpload(event.target.files[0]);
                  }}
                />
              </label>
            )}

            {isReadyToActivate && (
              <BrandButton size="sm" onClick={activateContract}>
                <CheckCircle2 className="w-4 h-4" />
                Ativar contrato
              </BrandButton>
            )}

            {!isCancelled && !isActive && (
              cancelConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3" />
                    Confirmar cancelamento?
                  </span>
                  <BrandButton size="sm" variant="outline" className="text-destructive border-destructive" onClick={cancelContract}>
                    Sim
                  </BrandButton>
                  <BrandButton size="sm" variant="outline" onClick={() => setCancelConfirm(false)}>
                    Não
                  </BrandButton>
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
