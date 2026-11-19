# Publicação automática (banco e funções)

O workflow `.github/workflows/deploy.yml` publica sozinho:
- **merge na `homolog`** → aplica as migrations e publica as funções no Supabase de homologação;
- **merge na `main`** → o mesmo em produção, **só depois da sua aprovação** no GitHub.

Ele para antes de aplicar se o banco tiver alguma migration que não existe no repositório.

## Configurar uma vez (no GitHub do repositório)

1. **Settings > Environments**: crie `homolog` e `production`. Em `production`, marque **Required reviewers** e escolha você.
2. **Settings > Secrets and variables > Actions > Secrets**:
   - `SUPABASE_ACCESS_TOKEN`: Supabase > avatar > Account preferences > Access Tokens > Generate new token.
   - `SUPABASE_DB_PASSWORD_HOMOLOG`: Supabase (homologação) > Project Settings > Database > senha do banco (se não souber, "Reset database password").
   - `SUPABASE_DB_PASSWORD_PROD`: o mesmo no projeto de produção.
3. **Mesma tela, aba Variables**:
   - `SUPABASE_PROJECT_HOMOLOG` = `majqksguuwmjhuuwjltj`
   - `SUPABASE_PROJECT_PROD` = `tunoirtswleljvyohdxp`

Depois disso, cada merge publica sozinho. Para rodar à mão: Actions > "Publicar banco e funções" > Run workflow.

## Observações
- `supabase/config.toml` não aponta mais para produção (`project_id = "klinova-local"`); o projeto remoto vem do workflow.
- Antes da primeira publicação em produção, confira que o histórico de migrations de produção bate com o repositório (o passo "Confere migrations" avisa se não bater).
