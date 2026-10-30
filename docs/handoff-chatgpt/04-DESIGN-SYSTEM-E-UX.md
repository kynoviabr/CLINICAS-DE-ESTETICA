# Design System e UX

## Direção visual existente

O sistema adota uma interface administrativa inspirada em Stripe:

- sidebar navy de 220 px;
- superfícies claras, bordas discretas e sombra baixa;
- roxo como primary default, substituído pelo branding da clínica;
- DM Sans para títulos e Inter para corpo;
- Lucide para ícones;
- layout de página com header, filtros, KPIs e conteúdo operacional.

O arquivo canônico de tokens é `src/index.css`, refletido em `tailwind.config.ts`. `DESIGN_SYSTEM_CLINOVA.md` explica a intenção, mas os tokens implementados vencem em caso de divergência.

## Princípios UX

1. Priorizar a próxima ação, não apenas exibir dados.
2. Manter contexto ao navegar entre CRM, paciente, proposta, contrato e agenda.
3. Evitar modais excessivamente longos; usar passos quando houver decisões distintas.
4. Mostrar impacto antes de ações irreversíveis.
5. Usar linguagem clínica/comercial brasileira consistente.
6. Não comunicar estado apenas por cor.
7. Preservar filtros/deep links ao retornar a uma lista.

## Tokens essenciais

### Cor

- fundos: `background`, `bg-page`, `bg-subtle`, `card`;
- texto: `foreground`, `muted-foreground`, `text-muted`;
- marca: `primary`, `primary-dark`, `primary-light`, `accent`;
- estados: `success`, `warning`, `info`, `destructive` e respectivos backgrounds;
- navegação: família `sidebar-*`.

Não usar hex arbitrário em páginas. Branding dinâmico substitui primary, ring, accent e variações por clínica.

### Tipografia

- heading: DM Sans, semibold;
- body: Inter;
- mono: IDs, contratos e valores técnicos;
- H1 recomendado: 30–36 px;
- H2: 24–28 px;
- H3: 20–22 px;
- corpo: 14–16 px;
- auxiliar: 12–14 px.

### Forma, profundidade e motion

- radius base 10 px; botão 6 px; modal 20 px; pill completo;
- sombras `stripe-sm` a `stripe-xl` e focus ring dedicado;
- transições 150–250 ms;
- respeitar `prefers-reduced-motion`.

## Componentes canônicos

Reutilizar primeiro `src/components/ui/`:

- `PageHeader` para título, descrição e ações;
- `BrandButton`/`Button` com hierarquia consistente;
- `BrandBadge`/badges de estado;
- `Card` e `StatCard` para superfícies/KPIs;
- inputs, select, textarea, checkbox e switch;
- tabs para submódulos;
- table para listagens;
- dialog/drawer/sheet conforme profundidade do fluxo;
- toast apenas para feedback transitório.

Não criar um segundo componente equivalente sem demonstrar lacuna no componente existente.

## Padrão de página

1. `PageHeader` com uma ação primária, no máximo duas ações secundárias visíveis.
2. KPIs somente quando ajudam a decidir/agir.
3. Busca e filtros próximos da lista.
4. Resumo de filtros ativos e ação de limpar.
5. Tabela/cards com ação principal previsível e menu para ações raras.
6. Paginação e contagem quando o volume crescer.

## Estados obrigatórios

Cada experiência remota precisa desenhar:

- skeleton/loading local;
- vazio inicial com explicação e CTA;
- vazio por filtro com opção de limpar;
- erro acionável com retry;
- sucesso e atualização otimista segura;
- indisponível por permissão;
- offline/integração degradada quando aplicável.

## Formulários

- labels sempre visíveis;
- campo obrigatório indicado;
- validação próxima do campo;
- máscara não pode corromper o valor persistido;
- CTA desabilitado deve ter motivo compreensível;
- proteger contra duplo envio;
- confirmar saída com alterações não salvas em fluxos longos;
- CPF, telefone, moeda, data e CEP devem ter padrão brasileiro consistente;
- erro crítico não pode existir somente em toast.

## Tabelas e Kanban

Tabelas:

- identificação primeiro; estado e datas depois; ações no fim;
- ordenação visualmente indicada;
- densidade consistente;
- coluna fixa apenas quando necessário;
- versão mobile por cards ou prioridade de colunas.

Kanban:

- card deve mostrar somente os dados necessários à decisão;
- arrastar precisa de alternativa acessível;
- movimento otimista deve reverter em erro;
- etapa, responsável, prioridade e follow-up devem ser semanticamente consistentes.

## Vocabulário de status

Usar um mapa centralizado por domínio. Base visual:

| Semântica | Uso | Aparência |
|---|---|---|
| neutro | rascunho/inativo | muted |
| informação | programado/em análise | info |
| atenção | pendente/vencendo | warning |
| sucesso | confirmado/concluído/pago | success |
| perigo | cancelado/erro/vencido | destructive |

Não mapear “cancelado” e “vencido” para a mesma mensagem de negócio apenas porque compartilham cor.

## Conteúdo e tom

- direto, respeitoso e sem jargão técnico;
- botões com verbo: “Criar proposta”, “Confirmar agendamento”;
- confirmação explica objeto e efeito;
- erro explica o que aconteceu e o que fazer;
- evitar “Ops!” em situações sensíveis clínicas/financeiras;
- datas em `dd/MM/yyyy`, horários em 24 h, moeda `R$` e timezone explícito quando relevante.

## Acessibilidade mínima

- WCAG AA para contraste;
- foco visível;
- navegação integral por teclado;
- nome acessível para botões de ícone;
- dialogs com foco inicial, trap e retorno correto;
- tabelas com headers semânticos;
- mensagens associadas aos campos;
- targets de toque adequados;
- testes com zoom e largura mobile.

## Checklist para qualquer tela nova

- [ ] usa tokens e componentes existentes;
- [ ] funciona com branding claro/escuro de primary;
- [ ] contempla todos os estados;
- [ ] possui hierarquia e CTA inequívocos;
- [ ] responde em 375 px e desktop;
- [ ] teclado, foco, labels e contraste revisados;
- [ ] textos seguem vocabulário do domínio;
- [ ] não duplica padrão já existente;
- [ ] captura visual comparada com a intenção antes do aceite.

