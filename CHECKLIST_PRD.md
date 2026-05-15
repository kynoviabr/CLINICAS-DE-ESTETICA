# Checklist PRD - CRM + Kanban + Agenda (Clinova)

Última atualização: 2026-05-15

## 1) Rastreabilidade de Requisitos

- [x] Kanban CRM com etapas padrão: `Novo Lead`, `Contato Iniciado`, `Agendado`, `Proposta`, `Fechado`, `Perdido`.
- [x] Gestão de etapas do Kanban (adicionar, remover e reordenar).
- [x] Cards do Kanban compactos com abertura de detalhe ao clicar.
- [x] Delegação de responsável no lead.
- [x] Filtros operacionais de CRM (sem responsável, parado, follow-up atrasado, prioridade etc.).
- [x] Ações rápidas no CRM (registrar interação, abrir WhatsApp, agendar avaliação, abrir proposta, abrir paciente).
- [x] Agendamento de avaliação a partir do CRM com vínculo no lead.
- [x] Agenda com ciclo operacional (`scheduled` -> `confirmed` -> `in_progress` -> `completed`) e exceções (remarcar, cancelar, não compareceu).
- [x] Avaliação agendada aparecendo corretamente na agenda do profissional responsável.
- [x] Criação de proposta a partir do lead com navegação CRM <-> Propostas.
- [x] Geração de contrato a partir da proposta com navegação de retorno ao CRM.
- [x] Hub do Paciente com abas de `Contratos` e `Propostas`.
- [x] Dashboard com alertas operacionais e deep links filtrados para módulos.
- [x] Follow-up em 1 clique no CRM (individual).
- [x] Follow-up em lote para leads selecionados (quando elegíveis).

## 2) Cobertura de Fluxos de Teste

- [x] Smoke dos módulos principais.
- [x] Fluxo E2E CRM -> Proposta -> Contrato.
- [x] Golden Path comercial completo (Dashboard -> CRM -> Proposta -> Contrato -> CRM).
- [x] Fluxo E2E de Kanban (movimentação de etapas).
- [x] Fluxo E2E de Agenda (agendar, confirmar, remarcar e cancelar).
- [x] Fluxo E2E do Hub do Paciente.
- [x] Guardrails E2E (erros esperados em criação/validação).
- [x] Deep link de filtros em Contratos.

## 3) Pendências Conhecidas (antes de release final)

- [ ] Rodada final de UAT manual com roteiro único (comercial + recepção + gestão).
- [ ] Revisão global de lint/type safety legado (`any` em múltiplos arquivos históricos).
- [ ] Consolidar script de seed único para homologação (opcional por ambiente).
- [ ] Definir tag de release e congelar baseline de regressão.

## 4) Critério de Pronto para Encerramento Técnico

Considerar pronto quando:

- [ ] `npm run test` passar
- [ ] `npm run test:e2e:smoke` passar
- [ ] `npm run test:e2e:flow` passar
- [ ] UAT manual assinado
- [ ] Pendências críticas classificadas como resolvidas ou aceitas formalmente

