import { Capacitor } from '@capacitor/core';

/** Ajustes que só valem dentro do app iOS/Android. No navegador não faz nada. */
export async function initNativeApp() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);
  document.documentElement.classList.add('native-app', `native-${Capacitor.getPlatform()}`);
  // Botão "voltar" do Android: volta uma tela; na primeira tela, minimiza o app.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.minimizeApp();
  });
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* indisponível em alguns aparelhos */ }
  await SplashScreen.hide();
}
