# Clinova (Kynovia)

SaaS multi-clínica para gestão de clínicas de estética: Vite + React + TypeScript no frontend, Supabase (Postgres, Auth, Storage e Edge Functions) no backend, hospedado na Vercel.

- Produção: https://klinova.vercel.app
- Supabase: projeto `tunoirtswleljvyohdxp` (São Paulo)

## Rodar localmente

```bash
cp .env.example .env   # preencha a chave publishable
npm ci
npm run dev
```

## Verificações

```bash
npm run lint
npm test
npm run build
```

Testes de banco (migrations + isolamento entre clínicas) num Postgres vazio:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/db-test.sh
```

O CI (`.github/workflows/ci.yml`) roda tudo isso em cada pull request.

## Banco e Edge Functions

```bash
supabase link --project-ref tunoirtswleljvyohdxp
supabase db push
supabase functions deploy
```

Toda mudança de schema entra como nova migration em `supabase/migrations/`.

## E2E (Playwright)

```bash
cp .env.e2e.example .env.e2e.local   # usuário e senha de teste
npm run test:e2e:smoke
npm run test:e2e:flow
```
