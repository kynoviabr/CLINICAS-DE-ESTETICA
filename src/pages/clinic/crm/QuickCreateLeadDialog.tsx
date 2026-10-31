import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CrmPageController } from './useCrmPage';

export function QuickCreateLeadDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    quickCreateOpen,
    setQuickCreateOpen,
    quickForm,
    setQuickForm,
    staff,
    treatments,
    createLeadMutation,
    handleQuickCepChange,
  } = ctx;
  return (
    <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader>
          <div className="border-b px-6 py-5">
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription className="mt-1">
              Cadastre os dados comerciais e, quando disponível, complete as informações usadas no contrato.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="space-y-5 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            createLeadMutation.mutate();
          }}
        >
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Dados do lead</h3>
              <p className="mt-1 text-xs text-muted-foreground">Informações mínimas para iniciar o atendimento comercial.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Nome completo *</Label>
                <Input value={quickForm.full_name} onChange={(event) => setQuickForm((current) => ({ ...current, full_name: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Telefone / WhatsApp *</Label>
                <Input value={quickForm.phone} onChange={(event) => setQuickForm((current) => ({ ...current, phone: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>CPF <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input value={quickForm.cpf} onChange={(event) => setQuickForm((current) => ({ ...current, cpf: event.target.value }))} />
                <p className="text-xs text-muted-foreground">Não é necessário pedir CPF no primeiro contato.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>E-mail</Label>
                <Input value={quickForm.email} onChange={(event) => setQuickForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
            </div>
          </section>
    
          <section className="rounded-lg border bg-card p-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                <p className="text-xs text-muted-foreground mt-1">Mesmos campos do cadastro de paciente, úteis para formalizar contrato depois.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input value={quickForm.zip_code} onChange={(event) => handleQuickCepChange(event.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Endereço completo</Label>
                  <Input value={quickForm.address} onChange={(event) => setQuickForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rua, número, complemento e bairro" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-3">
                  <Label>Cidade</Label>
                  <Input value={quickForm.city} onChange={(event) => setQuickForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input value={quickForm.state} onChange={(event) => setQuickForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
                </div>
              </div>
            </div>
          </section>
    
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Entrada comercial</h3>
              <p className="mt-1 text-xs text-muted-foreground">Origem, responsável e prioridade para organizar o CRM.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={quickForm.source || 'none'} onValueChange={(value) => setQuickForm((current) => ({ ...current, source: value === 'none' ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="whatsapp_ai">WhatsApp IA</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={quickForm.assigned_to} onValueChange={(value) => setQuickForm((current) => ({ ...current, assigned_to: value }))}>
                  <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={quickForm.priority_level} onValueChange={(value) => setQuickForm((current) => ({ ...current, priority_level: value }))}>
                  <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta prioridade</SelectItem>
                    <SelectItem value="medium">Média prioridade</SelectItem>
                    <SelectItem value="low">Baixa prioridade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tratamento de interesse</Label>
                <Select value={quickForm.treatment} onValueChange={(value) => setQuickForm((current) => ({ ...current, treatment: value }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    {treatments.map((treatment) => <SelectItem key={treatment.id} value={treatment.id}>{treatment.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label>Observações</Label>
              <Textarea value={quickForm.notes} onChange={(event) => setQuickForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
          </section>
    
          <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur">
            <BrandButton type="button" variant="outline" onClick={() => setQuickCreateOpen(false)}>Cancelar</BrandButton>
            <BrandButton type="submit" disabled={createLeadMutation.isPending}>
              {createLeadMutation.isPending ? 'Salvando...' : 'Salvar lead'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
