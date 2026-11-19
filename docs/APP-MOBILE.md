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

## Links para pacientes
Dentro do app a página roda em `capacitor://localhost`. Links enviados a pacientes e retornos de login
usam `publicOrigin()` (`src/lib/publicOrigin.ts`), que aponta para `VITE_PUBLIC_APP_URL`.

## Próximas etapas
- Notificações (push), câmera para fotos clínicas e login com Face ID / digital.
- Com as contas Apple e Google: TestFlight, teste interno e publicação.
