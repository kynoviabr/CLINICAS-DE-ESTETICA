import { Capacitor } from '@capacitor/core';

/**
 * Endereço público do Klinova, usado em links mandados a pacientes e nos retornos de login.
 * No navegador é o próprio site. Dentro do app (iOS/Android) a página roda em
 * "capacitor://localhost", que não abre fora do app, então usa o endereço do site.
 */
export function publicOrigin(): string {
  if (Capacitor.isNativePlatform()) {
    return (import.meta.env.VITE_PUBLIC_APP_URL || 'https://klinova-homolog.vercel.app').replace(/\/$/, '');
  }
  return window.location.origin;
}
