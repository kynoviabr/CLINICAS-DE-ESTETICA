import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AgendaPageController } from './useAgendaPage';

export function BlocksDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    blocksDialogOpen,
    setBlocksDialogOpen,
    blockProfessional,
    setBlockProfessional,
    blockStartDate,
    setBlockStartDate,
    blockStartTime,
    setBlockStartTime,
    blockEndDate,
    setBlockEndDate,
    blockEndTime,
    setBlockEndTime,
    blockReason,
    setBlockReason,
    blockNotes,
    setBlockNotes,
    professionals,
    appointmentBlocks,
    getProfessionalLabel,
    createBlockMutation,
    deleteBlockMutation,
  } = ctx;
  return (
    <Dialog open={blocksDialogOpen} onOpenChange={setBlocksDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bloqueios de agenda</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-4">
          <div className="rounded-2xl border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Novo bloqueio</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={blockProfessional} onValueChange={setBlockProfessional}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Bloqueio geral</SelectItem>
                    {professionals.map((professional) => (
                      <SelectItem key={professional.user_id} value={professional.user_id}>
                        {professional.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: reunião interna, manutenção..." />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="date" value={blockStartDate} onChange={(event) => setBlockStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={blockStartTime} onChange={(event) => setBlockStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="date" value={blockEndDate} onChange={(event) => setBlockEndDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={blockEndTime} onChange={(event) => setBlockEndTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} rows={3} />
            </div>
            <div className="flex justify-end">
              <BrandButton onClick={() => createBlockMutation.mutate()} disabled={createBlockMutation.isPending}>
                {createBlockMutation.isPending ? 'Salvando...' : 'Criar bloqueio'}
              </BrandButton>
            </div>
          </div>
    
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Bloqueios cadastrados</h3>
            {appointmentBlocks.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum bloqueio encontrado para o período.
              </div>
            ) : (
              appointmentBlocks.map((block) => (
                <div key={block.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{block.reason || 'Bloqueio'}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(block.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - {format(new Date(block.end_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {block.professional_id ? getProfessionalLabel(block.professional_id) : 'Bloqueio geral'}
                    </p>
                    {block.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{block.notes}</p>}
                  </div>
                  <BrandButton size="sm" variant="outline" onClick={() => deleteBlockMutation.mutate(block.id)}>
                    <Trash2 className="w-4 h-4" />
                  </BrandButton>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
