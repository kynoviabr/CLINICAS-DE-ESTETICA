# Método de Trabalho — ChatGPT e Antigravity

## Papéis

### Dono do produto

- define prioridade, restrições, risco aceitável e aceite;
- fornece contexto de negócio e acesso a ambientes quando necessário;
- aprova alterações destrutivas, migrations e releases.

### ChatGPT

- mantém visão do produto, backlog e decisões;
- questiona ambiguidades que alteram escopo;
- transforma objetivos em PRD, UX, arquitetura e plano;
- gera prompts autocontidos para o Antigravity;
- revisa evidências e diffs, sem presumir sucesso.

### Antigravity

- inspeciona o repositório antes de editar;
- implementa somente o escopo aprovado;
- preserva alterações não relacionadas;
- testa e apresenta diff/evidências;
- não publica, migra produção ou envia mensagens sem autorização.

## Fluxo por feature

### 1. Descoberta

ChatGPT entrega uma página contendo problema, persona, resultado, métricas, restrições, hipóteses e dúvidas.

### 2. PRD enxuto

Incluir:

- escopo e não escopo;
- jornada feliz e exceções;
- regras/estados;
- critérios de aceite Given/When/Then;
- impacto em dados, segurança, UX, analytics e rollout.

### 3. Arquitetura

Antes do prompt de código, definir:

- arquivos/camadas afetados;
- modelo e contrato de dados;
- RLS/migration quando houver;
- estratégia de cache/estado;
- riscos e reversibilidade;
- testes.

Mudança estrutural relevante recebe ADR curto: contexto, decisão, alternativas, consequências e data.

### 4. UX/UI

Descrever:

- arquitetura da informação;
- sequência de telas/interações;
- loading/empty/error/success/permission;
- comportamento mobile e teclado;
- componentes/tokens existentes a reutilizar;
- microcopy.

### 5. Prompt de implementação

O prompt deve ser fechado o suficiente para evitar decisões acidentais, mas exigir inspeção do código antes de editar. Use o template em `07-PROMPTS-PRONTOS.md`.

### 6. Revisão

Antigravity devolve:

- resumo;
- arquivos alterados;
- decisões e desvios;
- comandos e resultados;
- riscos restantes;
- diff ou commit para revisão.

ChatGPT compara a entrega com PRD, arquitetura, Design System e Definition of Done.

### 7. Encerramento

Atualizar backlog, decisões, documentação e release notes. Não considerar concluído apenas porque o código compilou.

## Tamanho de lote

Um prompt de codificação deve produzir um diff revisável em uma sessão. Separar quando houver:

- migration + grande redesign + refatoração;
- mais de uma jornada independente;
- mudança transversal de Design System junto com feature;
- dependência de decisão de produto ainda aberta.

## Regras para prompts seguros

Sempre incluir:

1. caminho e branch esperados;
2. estado sujo conhecido e regra de preservação;
3. objetivo e não escopo;
4. arquivos a inspecionar, não necessariamente a editar;
5. critérios de aceite;
6. testes obrigatórios;
7. proibição de secrets e ações externas;
8. formato do relatório final.

## Git sugerido

- uma branch por item, prefixo `codex/` ou padrão definido pela equipe;
- commits pequenos e intencionais;
- nunca misturar formatação global com feature;
- migrations e tipos no mesmo PR da mudança de schema;
- PR com screenshots para UI e evidência de RLS para dados;
- não commitar `.env`, credenciais E2E, `dist/` gerado ou dados pessoais.

## Artefatos vivos no ChatGPT

### Backlog

| ID | Problema/resultado | Prioridade | Estado | Dependências | Evidência de aceite |
|---|---|---|---|---|---|

### Registro de decisões

| Data | Decisão | Motivo | Consequências | Revisar quando |
|---|---|---|---|---|

### Registro de riscos

| Risco | Probabilidade | Impacto | Dono | Mitigação | Estado |
|---|---|---|---|---|---|

### Release

| Mudança | Usuários afetados | Migration/config | Testes | Rollback | Status |
|---|---|---|---|---|---|

