# Handoff Clinova — ChatGPT + Antigravity

Atualizado em: 24 de agosto de 2026  
Repositório local: `/Users/dempas/Documents/Clinicas de Estetica`  
Remoto Git: `https://github.com/kynoviabr/CLINICAS-DE-ESTETICA.git`  
Branch observada: `main`

## Objetivo deste pacote

Este diretório contém o contexto operacional necessário para usar o ChatGPT como gestor de produto e arquiteto, enquanto o Antigravity executa a codificação. Ele foi produzido a partir do código, das migrations, dos testes e dos documentos existentes no repositório.

## Ordem de leitura

1. `01-CONTEXTO-MESTRE.md`: identidade do produto, usuários, módulos e regras centrais.
2. `02-ARQUITETURA-E-DADOS.md`: stack, camadas, Supabase, segurança e convenções.
3. `03-PRODUTO-FLUXOS-E-REQUISITOS.md`: jornadas, estado funcional e critérios de aceite.
4. `04-DESIGN-SYSTEM-E-UX.md`: fundamentos visuais, componentes, conteúdo e acessibilidade.
5. `05-ESTADO-ATUAL-RISCOS-E-ROADMAP.md`: diagnóstico verificável e prioridades.
6. `06-METODO-DE-TRABALHO.md`: processo ChatGPT → prompt → Antigravity → revisão.
7. `07-PROMPTS-PRONTOS.md`: prompts reutilizáveis para planejamento, arquitetura, UX e código.

## Fonte de verdade

Quando houver conflito, use esta precedência:

1. Banco remoto Supabase e comportamento validado em runtime.
2. Migrations em `supabase/migrations/`.
3. Código em `src/` e Edge Functions em `supabase/functions/`.
4. Testes automatizados.
5. Este pacote de handoff.
6. PRDs, checklists e release notes históricos na raiz.

Documentação histórica pode descrever uma release como concluída mesmo quando o estado atual voltou a apresentar dívida técnica. Não assuma que um checkbox antigo substitui nova validação.

## Como entregar ao ChatGPT

Anexe os oito arquivos deste diretório e, quando a tarefa envolver código, anexe também os arquivos diretamente afetados. Nunca envie `.env`, tokens, chaves, dumps com dados pessoais ou credenciais de teste.

Comece uma conversa nova com o “Prompt de inicialização” de `07-PROMPTS-PRONTOS.md`. Peça ao ChatGPT para manter quatro artefatos vivos durante toda a conversa:

- decisões de produto e arquitetura;
- backlog priorizado;
- riscos e dúvidas abertas;
- registro das entregas e evidências de validação.

## Limites deste levantamento

- Não houve consulta ao Supabase remoto; o schema real pode divergir das migrations locais.
- Os testes E2E não foram executados porque dependem de credenciais e ambiente próprios.
- A pasta `shape-clinic-landing/` está fora do Git e não foi considerada parte estável do produto.
- Existe uma alteração local não commitada em `src/pages/clinic/SettingsPage.tsx`; ela foi preservada.

