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
  ChevronRight
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

  // Estados locais para demonstração visual
  const [reminderActive, setReminderActive] = useState(true);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [advanceNotice, setAdvanceNotice] = useState('1_day');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState(
    `Olá, {primeiro_nome}! 👋\n\nAqui é da {nome_da_clinica}. Passando para lembrar do seu atendimento agendado para amanhã ({data}) às {horario} com {profissional} ({tratamento}).\n\nPor favor, confirme sua presença respondendo:\n👉 1 para Confirmar\n👉 2 para Reagendar ou Cancelar\n\nQualquer dúvida, estamos à disposição!`
  );

  const handleSave = () => {
    toast({
      title: 'Configurações de automação salvas!',
      description: 'O lembrete diário com Aura IA está ativo e operando.',
    });
  };

  const handleTestSend = () => {
    toast({
      title: 'Simulação de disparo realizada!',
      description: 'Uma mensagem de teste foi gerada com dados de exemplo da Aura IA.',
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Modelo de Mensagem da Aura IA
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Texto do Lembrete</Label>
              <Textarea
                rows={7}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{primeiro_nome}'}</code>, <code className="bg-muted px-1 rounded">{'{nome_da_clinica}'}</code>, <code className="bg-muted px-1 rounded">{'{data}'}</code>, <code className="bg-muted px-1 rounded">{'{horario}'}</code>, <code className="bg-muted px-1 rounded">{'{profissional}'}</code>, <code className="bg-muted px-1 rounded">{'{tratamento}'}</code>.
              </p>
            </div>

            {/* Prévia simulada no WhatsApp */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Prévia de como o paciente recebe no WhatsApp:
              </Label>
              <div className="rounded-xl border bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                <div className="max-w-md bg-card p-3 rounded-xl rounded-tl-none border shadow-sm space-y-2 text-xs">
                  <p className="whitespace-pre-line text-foreground">
                    {messageTemplate
                      .replace('{primeiro_nome}', 'Maria')
                      .replace('{nome_da_clinica}', clinicName || 'Clinova')
                      .replace('{data}', '09/11/2026')
                      .replace('{horario}', '10:30')
                      .replace('{profissional}', 'Dra. Rafaela')
                      .replace('{tratamento}', 'Limpeza de pele premium')}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-right">08:00 ✓✓</p>
                </div>
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
