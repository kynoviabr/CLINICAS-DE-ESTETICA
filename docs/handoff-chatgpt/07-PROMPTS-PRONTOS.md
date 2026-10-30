# Prompts Prontos

Substitua os campos entre colchetes. Não inclua secrets.

## 1. Inicializar o ChatGPT como gestor do projeto

```text
Você será meu Product Manager, arquiteto de software e líder de Design/UX para o projeto Clinova. A codificação será executada no Antigravity, e você deverá planejar, produzir prompts de implementação e revisar as evidências devolvidas.

Leia integralmente os arquivos de handoff anexos, respeitando a ordem indicada em 00-LEIA-ME.md. Trate-os como baseline, não como verdade absoluta: quando uma decisão depender do runtime ou do banco, peça evidência atual. Nunca solicite ou reproduza secrets, credenciais ou dados pessoais.

Suas responsabilidades permanentes:
1. manter backlog priorizado, decisões, riscos e histórico de entregas;
2. separar fatos verificados, inferências e decisões pendentes;
3. escrever PRDs e critérios de aceite antes de prompts de código;
4. proteger multi-tenancy, RLS, LGPD, acessibilidade e Design System;
5. dividir trabalho em diffs pequenos e revisáveis;
6. exigir testes e evidências; nunca aceitar “feito” sem validação;
7. preservar mudanças locais e evitar refatoração fora do escopo.

Primeiro, responda com:
- seu entendimento do produto em até 12 pontos;
- os 10 maiores riscos atuais;
- backlog inicial P0/P1/P2;
- decisões que precisam do dono do produto;
- proposta do primeiro ciclo, sem ainda gerar código.
```

## 2. Planejar uma feature

```text
Com base no handoff Clinova, planeje a feature: [DESCRIÇÃO].

Contexto de negócio: [CONTEXTO]
Resultado desejado: [RESULTADO]
Usuários: [PAPÉIS]
Restrições: [RESTRIÇÕES]

Entregue:
1. problema e hipótese;
2. escopo e não escopo;
3. jornada feliz e exceções;
4. regras, estados e permissões;
5. UX com loading/empty/error/success/mobile/a11y;
6. impacto em schema, RLS, Storage, Edge Functions e analytics;
7. critérios Given/When/Then;
8. plano de implementação em lotes pequenos;
9. testes e rollout/rollback;
10. dúvidas realmente bloqueantes.

Não invente tabelas ou componentes antes de pedir ao Antigravity que procure equivalentes existentes.
```

## 3. Prompt completo para implementação no Antigravity

```text
Trabalhe no repositório local `/Users/dempas/Documents/Clinicas de Estetica`.

Antes de editar:
- leia o handoff em `docs/handoff-chatgpt/` e as instruções locais do repositório;
- rode `git status` e preserve toda mudança que não pertença a esta tarefa;
- procure implementações, componentes, queries, tipos e migrations equivalentes;
- informe qualquer conflito que torne a implementação insegura.

Objetivo:
[OBJETIVO ÚNICO]

Contexto e regras:
[CONTEXTO/REGRAS]

Escopo:
- [ITEM]

Fora de escopo:
- [ITEM]

UX/UI:
- reutilize tokens e componentes do Design System;
- contemple loading, vazio inicial, vazio por filtro, erro, sucesso e permissão;
- valide desktop, 375 px, teclado, foco, labels e contraste;
- [DETALHES ESPECÍFICOS].

Dados e segurança:
- mantenha isolamento por `clinic_id`/ownership e RLS;
- não exponha service role, secrets ou dados pessoais;
- não edite migration aplicada; crie uma nova pelo fluxo oficial se necessário;
- regenere tipos se o schema mudar;
- [DETALHES ESPECÍFICOS].

Critérios de aceite:
1. [GIVEN/WHEN/THEN]
2. [GIVEN/WHEN/THEN]

Validação obrigatória:
- testes unitários para regras puras;
- E2E para a jornada alterada quando o ambiente permitir;
- `npm run lint`;
- `npm run test`;
- `npm run build`;
- verificação visual para UI.

Não faça commit, push, deploy, migration remota ou ação externa sem autorização explícita.

Ao terminar, entregue: resumo, arquivos alterados, decisões, comandos/resultados, critérios atendidos, riscos restantes e diff revisável. Se algum teste preexistente falhar, diferencie claramente baseline de regressão.
```

## 4. Revisar uma entrega do Antigravity

```text
Revise a entrega abaixo contra o handoff, o PRD e os critérios de aceite. Não presuma que o relato está correto.

[COLAR RESUMO, DIFF E RESULTADOS]

Classifique achados em P0 bloqueador, P1 importante, P2 melhoria. Verifique especialmente:
- quebra de fluxo ou regra de negócio;
- autorização somente no frontend;
- RLS/tenant/ownership e Storage;
- drift de tipos Supabase;
- condições de corrida, idempotência e erros parciais;
- datas/timezone e dinheiro;
- loading/empty/error/success;
- acessibilidade/responsividade;
- duplicação e crescimento de páginas monolíticas;
- cobertura de testes e evidências faltantes;
- secrets/dados pessoais.

Entregue primeiro os achados com arquivo/linha, depois dúvidas, e por último um veredito: aprovado, aprovado com ressalvas ou requer correções. Se requerer correções, gere um prompt mínimo para o Antigravity corrigir somente os achados.
```

## 5. Arquitetura/ADR

```text
Produza um ADR para a decisão: [DECISÃO].

Considere a arquitetura real do Clinova. Inclua contexto, forças, 2–4 alternativas, decisão, consequências positivas/negativas, impacto em migração/RLS/testes/rollback e sinais que exigiriam revisar a decisão. Separe fatos observados de hipóteses. Não proponha tecnologia nova sem benefício mensurável.
```

## 6. UX e Design System

```text
Faça uma revisão UX/UI da jornada [JORNADA/TELA] usando o Design System Clinova.

Analise arquitetura da informação, hierarquia, CTA, densidade, microcopy, formulários, tabelas/Kanban, estados remotos, mobile 375 px, teclado, foco, contraste e consistência de status. Identifique componentes existentes que devem ser reutilizados. Entregue problemas priorizados, fluxo proposto, especificação por estado e critérios visuais verificáveis. Não altere a identidade sem uma decisão explícita de marca.
```

## 7. Mudança Supabase

```text
Planeje a mudança Supabase para [OBJETIVO]. Antes de SQL, instrua o Antigravity a verificar changelog/documentação atual, versão do CLI, schema remoto, migrations e tipos.

Exija: modelo e invariantes; migration aditiva/reversível; índices; RLS por operação e papel; grants/Data API; impacto em views/functions/triggers/Storage; backfill; concorrência/idempotência; teste com duas clínicas e paciente/staff; advisors; regeneração de tipos; rollout e rollback. Proíba service role no frontend e `SECURITY DEFINER` como atalho de permissão.
```

## 8. Planejar um ciclo/sprint

```text
Monte um ciclo de [DURAÇÃO] para Clinova com capacidade [CAPACIDADE]. Use o backlog e priorize redução de risco antes de expansão. Para cada item, inclua objetivo, valor, dependências, tamanho relativo, critérios de aceite, evidência e dono. Limite WIP, reserve capacidade para bugs e apresente sequência crítica. Termine com meta do ciclo, riscos e itens explicitamente fora do ciclo.
```

## 9. Preparar release

```text
Prepare um release gate para [VERSÃO/ESCOPO]. Verifique Git limpo/escopo, migrations e tipos, RLS/Storage, lint/unit/build/E2E/UAT, variáveis e secrets, observabilidade, compatibilidade, backfill, performance, acessibilidade, release notes e rollback. Entregue checklist go/no-go, evidências faltantes, responsáveis e um plano de rollback executável. Não autorize produção com P0/P1 sem aceite explícito do dono.
```

