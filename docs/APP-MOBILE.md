# App Klinova para iOS e Android (Capacitor)

O app usa o mesmo código do site, empacotado com o Capacitor. Pastas: `ios/` e `android/`.
Configuração: `capacitor.config.ts` (identificador `br.com.klinova.app`, que não muda depois de publicado).

## Android: testar no celular (sem conta Google)
1. GitHub > **Actions** > **App Android (teste)** > execução mais recente.
2. Em **Artifacts**, baixe `klinova-android-homolog` e descompacte (vem um `app-debug.apk`).
3. Mande o arquivo para o celular Android, toque nele e permita "instalar apps de fontes desconhecidas".

Cada merge na homolog gera um .apk novo.

## iPhone: testar pelo Mac (sem conta Apple paga)
Uma vez só:
1. Instale o **Xcode** pela App Store do Mac e abra uma vez para aceitar a licença.
2. No Terminal: `sudo gem install cocoapods` (ou `brew install cocoapods`).
3. Instale o Node 22 (https://nodejs.org) e clone o repositório.

Para cada teste:
```bash
cd CLINICAS-DE-ESTETICA
git checkout homolog && git pull
npm ci
cp .env.example .env   # ajuste para os valores da homologação
npm run build
npx cap sync ios
npx cap open ios
```
No Xcode: selecione o projeto **App** > **Signing & Capabilities** > **Team**: entre com seu Apple ID
(o gratuito serve). Conecte o iPhone pelo cabo, escolha-o no topo e clique em ▶.
No iPhone: Ajustes > Geral > VPN e Gerenciamento de Dispositivo > confie no seu Apple ID.
Com Apple ID gratuito o app para de abrir após 7 dias: é só rodar de novo pelo Xcode.

## Câmera e Face ID / digital
- Ficha do paciente > Fotos: no app, Tirar foto e Da galeria usam a câmera e a galeria nativas.
- Face ID / digital: oferecido após o primeiro login no app; liga/desliga no menu lateral.

## Links para pacientes
Dentro do app a página roda em `capacitor://localhost`. Links enviados a pacientes e retornos de login
usam `publicOrigin()` (`src/lib/publicOrigin.ts`), que aponta para `VITE_PUBLIC_APP_URL`.

## Notificações no celular
Todo aviso que vai para o sino do sistema (agendamento online, paciente confirmou, cancelou ou remarcou pelo link…)
também chega como notificação no celular de quem tem o app. Tocar na notificação abre a Agenda.
Funciona assim: tabela `push_devices` (aparelhos) → gatilho em `notifications` → função `push`.

### 1. Firebase (grátis; entrega no Android)
1. Acesse https://console.firebase.google.com com a conta Google da empresa > **Adicionar projeto** (ex.: "Klinova").
2. No projeto: **Adicionar app** > Android > nome do pacote `br.com.klinova.app` > baixe o **google-services.json**.
3. GitHub do repositório > Settings > Secrets and variables > Actions > **New repository secret**:
   nome `GOOGLE_SERVICES_JSON`, valor = todo o conteúdo do arquivo. O próximo .apk já sai com notificações.
4. Firebase > Configurações do projeto > **Contas de serviço** > **Gerar nova chave privada** (baixa um .json).
5. Supabase (projeto de homologação) > Edge Functions > **Secrets** > `FCM_SERVICE_ACCOUNT` = todo o conteúdo desse .json.

Não cole esses arquivos em conversas, e-mails ou no código: só nos campos de segredo acima.

### 2. Apple (iPhone; precisa da conta Apple paga)
1. developer.apple.com > Certificates, IDs & Profiles > **Keys** > + > marque **Apple Push Notifications service (APNs)** > baixe a chave **.p8** (só baixa uma vez).
2. Supabase > Edge Functions > Secrets: `APNS_KEY_P8` (conteúdo do .p8), `APNS_KEY_ID` (ID da chave), `APNS_TEAM_ID` (Team ID da conta).
   Para TestFlight/App Store, acrescente `APNS_PRODUCTION` = `true`.
3. No Xcode: projeto **App** > Signing & Capabilities > **+ Capability** > **Push Notifications** e
   **Background Modes** (marque *Remote notifications*). Com Apple ID gratuito essa opção não existe.
4. Gere o app iOS com `VITE_PUSH_ENABLED=1` no `.env`.

### Banco
A função `push` é chamada pelo banco usando os segredos `project_url` e `automations_runner_token` do Vault
(os mesmos das automações). Sem eles, o aviso continua só no sino.

## Próximas etapas
- Com as contas Apple e Google: TestFlight, teste interno e publicação.
