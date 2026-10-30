# Estado Atual, Riscos e Roadmap

## Snapshot verificável — 24/08/2026

- Git: `main...origin/main`.
- Último commit observado: `a4d176c Fix patient avatar display`.
- Alteração local preservada: `src/pages/clinic/SettingsPage.tsx` (layout/reordenação das tabs e WhatsApp IA).
- Diretório não rastreado: `shape-clinic-landing/`.
- `npm run test`: **passou**, 9 arquivos e 25 testes.
- `npm run build`: **passou**.
- `npm run lint`: **falhou**, 37 erros.
- E2E: não executado neste levantamento; requer ambiente/credenciais.

## Achados técnicos

### P0 — antes de qualquer release

1. **Confirmar o schema remoto e RLS.** Migrations locais não provam que produção está sincronizada.
2. **Resolver ownership das mudanças locais.** Não sobrescrever `SettingsPage.tsx`; decidir se `shape-clinic-landing/` entra no produto, vira outro repositório ou é descartado pelo proprietário.
3. **Executar E2E/UAT no ambiente correto.** Checklists históricos não substituem regressão atual.
4. **Revisar secrets e configuração das automações de WhatsApp.** Fundação/MVP não equivale a operação produtiva.

### P1 — estabilização

1. Corrigir 37 erros de lint: 36 usos de `any` no domínio de anamnese e 1 `prefer-const` no CRM.
2. Regenerar tipos Supabase; eliminar casts `as unknown`/`any` no escopo migrado.
3. Alinhar README: ele ainda referencia o caminho antigo `/Users/dempas/Documents/remix-of-clinic-journey`.
4. Adicionar pipeline CI com lint, unit, build e E2E controlado.
5. Criar um runbook único de ambientes, migrations, seeds, deploy e rollback.
6. Auditar RLS e Storage com cenários de duas clínicas e paciente versus staff.

### P2 — arquitetura e performance

1. Dividir `CrmPage.tsx` (~3.369 linhas) e `AppointmentsPage.tsx` (~2.753).
2. Dividir outras páginas acima de 1.000 linhas: paciente, propostas, sessões e dashboard.
3. Implementar lazy loading por rota/feature.
4. Reduzir o bundle principal: ~2.456 KB minificado / ~668 KB gzip no build observado.
5. Atualizar base Browserslist; o build informa dados `caniuse-lite` com 14 meses.
6. Centralizar queries/mutations e contratos de dados por feature.
7. Definir modelo financeiro canônico e plano de migração do legado.

### P3 — maturidade de produto e UX

1. Resolver naming Clinova/Kynovia/Clinic OS.
2. Criar catálogo vivo de componentes e matriz de status.
3. Instrumentar funil, agenda, renovação, erros e performance.
4. Formalizar LGPD: finalidade, consentimento, retenção, exportação e exclusão.
5. Validar acessibilidade e responsividade sistematicamente.
6. Completar WhatsApp com observabilidade, handoff humano, custos, consentimento e fallback.

## Dívidas e riscos relevantes

| Risco | Evidência | Impacto | Tratamento |
|---|---|---|---|
| drift schema/tipos | migrations recentes ausentes nos tipos | bugs silenciosos e `any` | comparar remoto, regenerar tipos |
| páginas monolíticas | CRM/Agenda com milhares de linhas | regressão e baixa velocidade | decomposição incremental com testes |
| lint quebrado | 37 erros atuais | CI frágil e tipos inseguros | baseline zero antes de features grandes |
| bundle alto | chunk principal >500 KB | carregamento lento | lazy routes, split de PDF/charts |
| docs divergentes | README aponta pasta antiga; checklists históricos | onboarding incorreto | consolidar e manter handoff/README |
| permissão fallback | grupos vazios retornam acesso legado | excesso de visibilidade na UI | decisão explícita + RLS sempre forte |
| automação WhatsApp MVP | runbooks e checklists indicam fundação | falhas/compliance/custo | UAT real, métricas e kill switch |
| dados de saúde/estética | anamnese, fotos e evolução | LGPD e reputação | privacy-by-design e auditoria |

## Roadmap sugerido de 6 ciclos

### Ciclo 0 — baseline e governança

- congelar snapshot e proteger mudanças locais;
- estabelecer PRD/ADR/Definition of Done;
- corrigir README e documentar ambientes;
- configurar CI mínima.

### Ciclo 1 — segurança e schema

- audit de migrations, RLS, grants, Storage e funções;
- regeneração de tipos;
- testes de isolamento multi-tenant;
- corrigir lint do domínio de anamnese.

### Ciclo 2 — arquitetura frontend

- extrair domínio do CRM sem alterar comportamento;
- extrair domínio da Agenda;
- lazy loading de rotas e dependências pesadas;
- budgets de bundle.

### Ciclo 3 — confiabilidade das jornadas

- E2E completo comercial, atendimento, financeiro e portal;
- estados de erro/loading/empty padronizados;
- observabilidade e auditoria de automações;
- UAT por papel.

### Ciclo 4 — UX e Design System

- inventário visual;
- status map, formulários e tabelas canônicos;
- acessibilidade AA e responsividade;
- documentação de componentes.

### Ciclo 5 — crescimento e inteligência

- analytics do funil e retenção;
- automações de WhatsApp com guardrails;
- experimentos de redução de no-show e aumento de renovação;
- roadmap orientado por métricas reais.

## Decisões abertas para o dono do produto

1. Nome oficial e arquitetura de marca.
2. Clínica única por usuário ou múltiplas clínicas selecionáveis?
3. Modelo financeiro fonte de verdade.
4. WhatsApp IA: assistente interno, atendimento autônomo ou ambos?
5. Quais procedimentos e dados exigem assinatura/consentimento específico?
6. Política de retenção para fotos, documentos e anamnese.
7. Escopo do portal e estratégia mobile/PWA.
8. `shape-clinic-landing/` pertence a este repositório?

