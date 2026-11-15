# Monitoramento de erros (Sentry)

Desligado até configurar o DSN. Nada de paciente é enviado: só a mensagem do erro, a tela,
o id da clínica e o papel do usuário. E-mails, CPFs, telefones e códigos de link são mascarados;
corpo de requisição, cookies e o que é digitado nos campos nunca saem.

## Ligar
1. Criar conta em sentry.io e um projeto **React** (ex.: `klinova`). Copiar o **DSN**.
2. Vercel > projeto do Klinova > Settings > Environment Variables:
   - `VITE_SENTRY_DSN` = DSN
   - `VITE_APP_ENV` = `homolog` (Preview) e `production` (Production)
   - Refazer o deploy.
3. Supabase > Edge Functions > Secrets (homolog e produção):
   - `SENTRY_DSN` = mesmo DSN
   - `SENTRY_ENVIRONMENT` = `homolog` ou `production`
4. Sentry > Alerts > criar alerta "A new issue is created" com aviso por e-mail, filtrado por `environment:production`.

## O que é capturado
- App: qualquer tela que quebre (mostra "Algo deu errado nesta tela" em vez de tela branca) e erros não tratados.
- Funções: erro inesperado de todas as funções do servidor, com o nome da função e a rota.
