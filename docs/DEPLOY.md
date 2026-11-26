# Publicação automática (banco e funções)

O workflow `.github/workflows/deploy.yml` publica sozinho:
- **merge na `homolog`** → aplica as migrations e publica as funções no Supabase de homologação;
- **merge na `main`** → o mesmo em produção, **só depois da sua aprovação** no GitHub.

Ele para antes de aplicar se o banco tiver alguma migration que não existe no repositório.

## Configurar uma vez (no GitHub do repositório)

1. **Settings > Environments**: crie `homolog` e `production`. Em `production`, marque **Required reviewers** e escolha você.
2. **Settings > Secrets and variables > Actions > Secrets**:
   - `SUPABASE_ACCESS_TOKEN`: Supabase > avatar > Account preferences > Access Tokens > Generate new token.
   - Não precisa da senha do banco: com o token, a publicação cria um acesso temporário ao banco.
3. **Mesma tela, aba Variables**:
   - `SUPABASE_PROJECT_HOMOLOG` = `majqksguuwmjhuuwjltj`
   - `SUPABASE_PROJECT_PROD` = `tunoirtswleljvyohdxp`

Depois disso, cada merge publica sozinho. Para rodar à mão: Actions > "Publicar banco e funções" > Run workflow.

## Observações
- `supabase/config.toml` não aponta mais para produção (`project_id = "klinova-local"`); o projeto remoto vem do workflow.
- Antes da primeira publicação em produção, confira que o histórico de migrations de produção bate com o repositório (o passo "Confere migrations" avisa se não bater).

## Site (Vercel) pelo Deploy Hook
O aviso automático do GitHub para a Vercel deixou de chegar (nov/2026). O site agora é publicado pelo próprio fluxo
"Publicar banco e funções", no passo **site**, logo depois do banco:
1. Vercel > projeto clinicas-de-estetica > Settings > Git > **Deploy Hooks**: crie um hook para a branch `homolog`
   e outro para `main`.
2. GitHub > Settings > Secrets and variables > Actions: salve como `VERCEL_DEPLOY_HOOK_HOMOLOG` e
   `VERCEL_DEPLOY_HOOK_PRODUCTION`.
Sem o segredo, o passo só avisa e não publica. Se o banco falhar, o site não é publicado.
