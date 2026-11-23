import type { CapacitorConfig } from '@capacitor/cli';

// App nativo (iOS e Android) do Klinova: empacota o mesmo build do site (pasta dist).
// O identificador (appId) não pode mudar depois de publicado nas lojas.
const config: CapacitorConfig = {
  appId: 'br.com.kynovia.estetica',
  appName: 'Kynovia',
  webDir: 'dist',
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'force' },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#000b29', showSpinner: false },
  },
};

export default config;
