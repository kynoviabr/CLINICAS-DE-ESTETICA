import { Capacitor } from '@capacitor/core';

const PRODUCTION_PROJECT_REF = 'tunoirtswleljvyohdxp';
export const PRODUCTION_APP_URL = 'https://app.estetica.kynovia.com.br';
export const HOMOLOG_APP_URL = 'https://klinova-homolog.vercel.app';

/** Site padrão do app instalado: produção quando o app aponta para o Supabase de produção. */
export function defaultAppUrl(supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''): string {
  return supabaseUrl.includes(PRODUCTION_PROJECT_REF) ? PRODUCTION_APP_URL : HOMOLOG_APP_URL;
}

/**
 * Endereço público da Kynovia Estética, usado em links mandados a pacientes e nos retornos de login.
 * No navegador é o próprio site. Dentro do app (iOS/Android) a página roda em
 * "capacitor://localhost", que não abre fora do app, então usa o endereço do site.
 */
export function publicOrigin(): string {
  if (Capacitor.isNativePlatform()) {
    return (import.meta.env.VITE_PUBLIC_APP_URL || defaultAppUrl()).replace(/\/$/, '');
  }
  return window.location.origin;
}
