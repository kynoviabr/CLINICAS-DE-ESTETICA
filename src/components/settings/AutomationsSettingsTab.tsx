import { useState } from 'react';
import {
  Bot,
  CalendarCheck,
  Clock,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  Send,
  HelpCircle,
  ChevronRight,
  MousePointerClick,
  Check,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/contexts/BrandingContext';

export function AutomationsSettingsTab() {
  const { toast } = useToast();
  const { clinicName } = useBranding();

  // Estados locais para demonstração visual e configuração
  const [reminderActive, setReminderActive] = useState(true);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [advanceNotice, setAdvanceNotice] = useState('1_day');
  const [useInteractiveButtons, setUseInteractiveButtons] = useState(true);
  const [btnConfirm, setBtnConfirm] = useState('Confirmar presença');
  const [btnReschedule, setBtnReschedule] = useState('Reagendar ou Cancelar');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState(
    `Olá, {primeiro_nome}! Esperamos que você esteja bem.\n\nPassando para lembrar do seu atendimento na {nome_da_clinica}:\n\n✨ Procedimento: {tratamento}\n📅 Data: amanhã ({data}) às {horario}\n👩‍⚕️ Especialista: {profissional}\n\nPor gentileza, confirme sua presença clicando em um dos botões abaixo:`
  );

  const handleSave = () => {
    toast({
      title: 'Configurações salvas!',
      description: 'Modelo com botões interativos e horários atualizados para a Aura IA.',
    });
  };

  const handleTestSend = () => {
    toast({
      title: 'Simulação de disparo com Botões Interativos!',
      description: 'Mensagem formatada com botões nativos [Confirmar] e [Reagendar] gerada pela Aura IA.',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Banner / Header com Aura IA */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent shadow-card">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Bot className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-heading font-semibold text-foreground">
                Automações da Clínica com Aura IA
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3 w-3" /> Aura IA
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Configure réguas automáticas para envio de lembretes, pedidos de confirmação de agendamentos e acompanhamento de clientes via WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BrandButton variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="w-3.5 h-3.5 mr-1" /> Ver modelo da mensagem
            </BrandButton>
            <BrandButton size="sm" onClick={handleSave}>
              Salvar alterações
            </BrandButton>
          </div>
        </CardContent>
      </Card>

      {/* Tabela / Grid das Automações */}
      <Card className="shadow-card">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Réguas de Agendamento e Confirmação
              </CardTitle>
              <CardDescription className="text-xs">
                Mensagens enviadas automaticamente para os pacientes da sua agenda.
              </CardDescription>
            </div>
            <BrandBadge status={reminderActive ? 'approved' : 'draft'}>
              {reminderActive ? '1 Automação Ativa' : 'Pausada'}
            </BrandBadge>
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {/* Automação 1: Lembrete diário e confirmação */}
          <div className="p-5 space-y-4 hover:bg-muted/10 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm sm:text-base">
                    Lembrete diário com pedido de confirmação de agendamento
                  </span>
                  <span className="text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-3xl">
                  Envia diariamente via WhatsApp para cada paciente com consulta agendada, informando o dia, horário, tratamento e profissional, e solicitando confirmação de presença (Sim/Não). A resposta do paciente atualiza o status na Agenda para "Confirmado" automaticamente.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {reminderActive ? 'Ativado' : 'Desativado'}
                </span>
                <Switch
                  checked={reminderActive}
                  onCheckedChange={setReminderActive}
                  aria-label="Ativar lembrete diário"
                />
              </div>
            </div>

            {/* Parâmetros do Lembrete */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Horário de disparo
                </Label>
                <Select value={reminderTime} onValueChange={setReminderTime} disabled={!reminderActive}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="07:00">07:00 da manhã</SelectItem>
                    <SelectItem value="08:00">08:00 da manhã (Padrão)</SelectItem>
                    <SelectItem value="09:00">09:00 da manhã</SelectItem>
                    <SelectItem value="10:00">10:00 da manhã</SelectItem>
                    <SelectItem value="14:00">14:00 da tarde</SelectItem>
                    <SelectItem value="18:00">18:00 da tarde</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Sliders className="w-3.5 h-3.5" /> Antecedência do aviso
                </Label>
                <Select value={advanceNotice} onValueChange={setAdvanceNotice} disabled={!reminderActive}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1_day">1 dia antes do agendamento (Véspera)</SelectItem>
                    <SelectItem value="2_days">2 dias antes do agendamento</SelectItem>
                    <SelectItem value="same_day">No próprio dia do agendamento (manhã)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5" /> Canal de entrega
                </Label>
                <div className="h-8 rounded-md border bg-muted/40 px-3 flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> WhatsApp (Aura IA)
                  </span>
                  <span className="text-[10px] text-muted-foreground">Oficial</span>
                </div>
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  Próxima execução: <strong>Amanhã às {reminderTime}</strong> para os atendimentos agendados.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <BrandButton variant="ghost" size="sm" onClick={() => setPreviewOpen(true)} className="h-7 text-xs">
                  Editar mensagem
                </BrandButton>
                <BrandButton variant="outline" size="sm" onClick={handleTestSend} className="h-7 text-xs">
                  <Send className="w-3 h-3 mr-1" /> Testar envio
                </BrandButton>
              </div>
            </div>
          </div>

          {/* Automação 2 (Demonstrativo Roadmap): Pesquisa de Satisfação Pós-Atendimento */}
          <div className="p-5 space-y-3 opacity-75 bg-muted/5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    Pesquisa de satisfação e avaliação pós-sessão (NPS)
                  </span>
                  <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Em breve com Aura IA
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Envia mensagem 2 horas após a sessão ser marcada como "Atendida" solicitando a avaliação do atendimento de 1 a 5 estrelas e depoimento do cliente.
                </p>
              </div>
              <Switch checked={false} disabled aria-label="Em breve" />
            </div>
          </div>

          {/* Automação 3 (Demonstrativo Roadmap): Régua de Retorno / Renovação */}
          <div className="p-5 space-y-3 opacity-75 bg-muted/5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    Régua de retorno e manutenção (clientes há mais de 60 dias sem visita)
                  </span>
                  <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Em breve com Aura IA
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Aura IA identifica clientes que terminaram seus pacotes ou estão há mais de 60 dias sem agendar e convida para uma reavaliação personalizada.
                </p>
              </div>
              <Switch checked={false} disabled aria-label="Em breve" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas e Estatísticas Visuais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Lembretes enviados (este mês)</p>
            <p className="text-2xl font-bold font-heading text-foreground">142</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 100% entregues via WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Taxa de confirmação</p>
            <p className="text-2xl font-bold font-heading text-primary">89.4%</p>
            <p className="text-[11px] text-muted-foreground">
              Redução estimada de 75% nas faltas (no-show)
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Respostas processadas pela Aura IA</p>
            <p className="text-2xl font-bold font-heading text-foreground">127</p>
            <p className="text-[11px] text-muted-foreground">
              Status da agenda atualizados automaticamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Edição e Prévia da Mensagem */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Modelo de Mensagem e Botões da Aura IA
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Opção de Botões Interativos Nativos */}
            <div className="rounded-lg border bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="w-4 h-4 text-primary" />
                    <Label className="text-xs font-semibold text-foreground cursor-pointer" htmlFor="btn-toggle">
                      Botões Interativos Oficiais no WhatsApp (Aura IA)
                    </Label>
                    <span className="text-[10px] bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Utiliza a API Oficial do WhatsApp (Meta). O paciente recebe botões clicáveis nativos e não precisa digitar nada para confirmar.
                  </p>
                </div>
                <Switch
                  id="btn-toggle"
                  checked={useInteractiveButtons}
                  onCheckedChange={setUseInteractiveButtons}
                />
              </div>

              {useInteractiveButtons && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-primary/10">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Texto do Botão 1 (Confirmação)</Label>
                    <Input
                      size={1}
                      value={btnConfirm}
                      onChange={(e) => setBtnConfirm(e.target.value)}
                      placeholder="Ex: Confirmar presença"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Texto do Botão 2 (Reagendamento)</Label>
                    <Input
                      size={1}
                      value={btnReschedule}
                      onChange={(e) => setBtnReschedule(e.target.value)}
                      placeholder="Ex: Reagendar ou Cancelar"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Texto do Lembrete</Label>
              <Textarea
                rows={5}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{primeiro_nome}'}</code>, <code className="bg-muted px-1 rounded">{'{nome_da_clinica}'}</code>, <code className="bg-muted px-1 rounded">{'{data}'}</code>, <code className="bg-muted px-1 rounded">{'{horario}'}</code>, <code className="bg-muted px-1 rounded">{'{profissional}'}</code>, <code className="bg-muted px-1 rounded">{'{tratamento}'}</code>.
              </p>
            </div>

            {/* Prévia simulada no WhatsApp com Botões Nativos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Prévia de como o paciente recebe no WhatsApp:
                </Label>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> WhatsApp Business Cloud API
                </span>
              </div>

              <div className="rounded-xl border bg-emerald-50/40 dark:bg-emerald-950/20 p-4 flex flex-col items-start">
                <div className="max-w-sm w-full bg-card rounded-2xl rounded-tl-none border shadow-sm overflow-hidden text-xs">
                  {/* Corpo do balão da mensagem */}
                  <div className="p-3.5 space-y-2">
                    <p className="whitespace-pre-line text-foreground leading-relaxed">
                      {messageTemplate
                        .replace('{primeiro_nome}', 'Maria')
                        .replace('{nome_da_clinica}', clinicName || 'Clinova')
                        .replace('{data}', '09/11/2026')
                        .replace('{horario}', '10:30')
                        .replace('{profissional}', 'Dra. Rafaela')
                        .replace('{tratamento}', 'Limpeza de pele premium')}
                    </p>
                    <p className="text-[10px] text-muted-foreground text-right pt-1">08:00 ✓✓</p>
                  </div>

                  {/* Botões Interativos Nativos do WhatsApp Oficial */}
                  {useInteractiveButtons ? (
                    <div className="border-t border-border/80 divide-y divide-border/80 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => toast({ title: 'Simulação: Botão Confirmar clicado pelo paciente!', description: 'O agendamento seria confirmado automaticamente na agenda.' })}
                        className="w-full py-2.5 px-3 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        {btnConfirm || 'Confirmar presença'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toast({ title: 'Simulação: Botão Reagendar clicado!', description: 'A Aura IA abriria o fluxo interativo de remarcação de horário.' })}
                        className="w-full py-2.5 px-3 text-center text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        {btnReschedule || 'Reagendar ou Cancelar'}
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 border-t bg-muted/10 text-center text-[11px] text-muted-foreground">
                      Modo texto simples: paciente responde com 1 ou 2
                    </div>
                  )}
                </div>

                {useInteractiveButtons && (
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <strong>Aura IA com Botões Nativos:</strong> ao tocar no botão, a confirmação é registrada em tempo real no Clinova.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <BrandButton variant="outline" onClick={() => setPreviewOpen(false)}>
                Fechar
              </BrandButton>
              <BrandButton onClick={() => { setPreviewOpen(false); handleSave(); }}>
                Salvar Modelo
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
