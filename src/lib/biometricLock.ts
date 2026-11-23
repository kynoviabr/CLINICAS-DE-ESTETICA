import { Capacitor } from '@capacitor/core';

// Preferência guardada só neste aparelho.
const KEY = 'klinova.biometricLock';
const ASKED = 'klinova.biometricLock.asked';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export const biometricLockEnabled = () => read(KEY) === '1';
export const setBiometricLockEnabled = (on: boolean) => { write(KEY, on ? '1' : null); write(ASKED, '1'); };
export const biometricLockAsked = () => read(ASKED) === '1';

export type BiometryInfo = { available: boolean; label: string };

/** Face ID / Touch ID / digital disponível e cadastrado no aparelho? */
export async function biometryInfo(): Promise<BiometryInfo> {
  if (!Capacitor.isNativePlatform()) return { available: false, label: 'biometria' };
  const { BiometricAuth, BiometryType } = await import('@aparajita/capacitor-biometric-auth');
  const info = await BiometricAuth.checkBiometry();
  const label = info.biometryType === BiometryType.faceId ? 'Face ID'
    : info.biometryType === BiometryType.touchId ? 'Touch ID'
      : info.biometryType === BiometryType.faceAuthentication ? 'reconhecimento facial'
        : 'digital';
  return { available: info.isAvailable, label };
}

/** Pede o Face ID / digital. true = confirmou. */
export async function authenticateBiometric(label: string): Promise<boolean> {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  try {
    await BiometricAuth.authenticate({
      reason: 'Desbloquear o Kynovia Estética',
      cancelTitle: 'Cancelar',
      allowDeviceCredential: true, // se a biometria falhar, aceita o código do celular
      androidTitle: 'Desbloquear o Kynovia Estética',
      androidSubtitle: `Use ${label}`,
    });
    return true;
  } catch {
    return false;
  }
}
