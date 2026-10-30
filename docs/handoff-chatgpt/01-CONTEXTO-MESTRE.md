# Contexto Mestre do Produto

## Resumo executivo

Clinova é um SaaS multi-clínica para operação e gestão de clínicas de estética. O produto conecta aquisição comercial, atendimento, prontuário operacional, agenda, contratos, cobrança, acompanhamento de resultados e relacionamento com o paciente.

O código também usa os nomes “Kynovia” e “Clinic OS”. Até uma decisão formal de marca, trate:

- **Clinova** como nome do produto neste planejamento;
- **Kynovia** como marca/empresa ou fallback visual legado;
- **Clinic OS** como descriptor exibido na navegação.

Essa ambiguidade deve ser resolvida antes de trabalho de identidade, site público ou publicação em lojas.

## Proposta de valor inferida

Centralizar a jornada de uma clínica de estética — do lead à renovação — em uma plataforma operacional única, personalizável por clínica, com automações para reduzir perdas comerciais, faltas e tarefas manuais.

## Perfis e permissões

Papéis legados observados:

| Papel | Objetivo principal | Acesso típico |
|---|---|---|
| `admin` | gerir clínica, equipe, indicadores e configuração | todos os módulos internos |
| `receptionist` | recepção, agenda, pacientes e cobrança operacional | CRM, pacientes, agenda, contratos e pagamentos |
| `professional` | executar atendimento e acompanhar evolução clínica | pacientes, agenda, sessões, evolução, fotos e feedback |
| `sales` | converter leads e acompanhar metas | CRM, propostas, contratos, metas, relatórios e WhatsApp IA |
| `patient` | consumir informações próprias | portal do paciente |

Além dos papéis, existe controle por grupos e chaves de menu (`access_groups`, `access_group_permissions`, `user_access_groups`). O frontend mantém fallback para permissões legadas se o grupo não estiver configurado. Isso evita lockout, mas pode conceder mais visibilidade do que uma configuração incompleta pretendia. Permissão visual nunca substitui RLS no banco.

## Módulos internos

| Módulo | Rota | Responsabilidade |
|---|---|---|
| Dashboard | `/clinic` | visão executiva e alertas acionáveis |
| CRM | `/clinic/crm` | leads, Kanban, interações, follow-up e renovação |
| WhatsApp IA | `/clinic/whatsapp-ai` | conversas, mensagens e operação assistida |
| Pacientes | `/clinic/patients` | cadastro, busca, filtros e acesso ao hub do paciente |
| Hub do paciente | `/clinic/patients/:id` | dados, tratamentos, propostas, contratos, anamnese e histórico |
| Tratamentos | `/clinic/treatments` | catálogo, categorias, custos, margens e combos |
| Propostas | `/clinic/proposals` | negociação comercial e itens propostos |
| Contratos | `/clinic/contracts` | formalização, documentos e condições comerciais |
| Pagamentos | `/clinic/payments` | planos, parcelas, status e baixa operacional |
| Financeiro de contratos | `/clinic/finance/contracts` | previsão e matriz financeira por período/vendedor |
| Metas | `/clinic/metas/*` | acompanhamento pessoal e de equipe |
| Agenda | `/clinic/appointments` | ciclo de agendamento, disponibilidade, bloqueios e espera |
| Sessões | `/clinic/sessions` | execução de sessões e gatilhos de renovação |
| Evolução | `/clinic/evolution` | métricas clínicas por paciente/tratamento |
| Fotos | `/clinic/photos` | antes/depois e gestão de mídia clínica |
| Feedbacks/NPS/Satisfação | rotas próprias | experiência do paciente e alertas negativos |
| Relatórios | `/clinic/reports` | análises gerenciais/comerciais |
| Configurações | `/clinic/settings` | clínica, marca, equipe, acessos, catálogo e parâmetros |

## Portal do paciente

Rotas sob `/portal`, exclusivas para o papel `patient`:

- início;
- contrato;
- pagamentos;
- sessões;
- evolução;
- fotos;
- feedback.

O vínculo de identidade do paciente migrou para `patient_users`, separado do cadastro `patients`. Esse vínculo deve ser tratado como relação sensível e sempre protegido por RLS.

## Capacidades transversais

- autenticação por e-mail/senha e OAuth Google/Facebook;
- onboarding de clínica;
- multi-tenant por `clinic_id`;
- branding dinâmico por clínica;
- notificações;
- auditoria de entidades críticas;
- documentos e fotos em Supabase Storage;
- Edge Functions para convites, criação de clínica e automações de agenda;
- geração de PDFs de contratos e relatórios no cliente;
- integração de CEP;
- WhatsApp para lembretes, comandos de agenda e agente de IA.

## Princípios de produto recomendados

1. **Fluxo completo acima de tela isolada:** toda feature deve ligar aquisição, atendimento ou retenção a um desfecho mensurável.
2. **Clareza operacional:** o usuário deve entender “o que precisa de ação agora”.
3. **Segurança por tenant:** nenhum dado pode atravessar clínicas ou pacientes.
4. **Automação auditável:** decisões automáticas precisam de status, logs, idempotência e intervenção humana.
5. **Progressive disclosure:** telas diárias simples; detalhes e configuração sob demanda.
6. **Uma linguagem de status:** o mesmo conceito deve ter a mesma cor, nome e regra em todos os módulos.

## Indicadores de sucesso sugeridos

Produto/comercial:

- conversão lead → avaliação → proposta → contrato;
- tempo médio até primeiro contato;
- follow-ups vencidos;
- taxa de renovação e valor renovado;
- receita contratada e prevista.

Operação:

- ocupação da agenda;
- confirmação e no-show;
- tempo para preencher cancelamentos via lista de espera;
- sessões executadas versus previstas;
- parcelas vencidas e inadimplência.

Experiência:

- NPS e satisfação por profissional/tratamento;
- tarefas críticas concluídas sem suporte;
- erros de formulário e abandono de fluxos;
- uso do portal do paciente.

