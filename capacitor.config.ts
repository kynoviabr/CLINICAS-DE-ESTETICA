import type { CapacitorConfig } from '@capacitor/cli';

// App nativo (iOS e Android) do Klinova: empacota o mesmo build do site (pasta dist).
// O identificador (appId) não pode mudar depois de publicado nas lojas.
const config: CapacitorConfig = {
  appId: 'br.com.klinova.app',
  appName: 'Klinova',
  webDir: 'dist',
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto' },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0f2a3d', showSpinner: false },
  },
};

export default config;
