import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, LockKeyhole, ScanFace } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  authenticateBiometric, biometricLockAsked, biometricLockEnabled, biometryInfo, setBiometricLockEnabled, type BiometryInfo,
} from '@/lib/biometricLock';

const RELOCK_AFTER_MS = 60_000; // voltou ao app depois de 1 minuto fora: bloqueia de novo

/**
 * App iOS/Android: tela de bloqueio com Face ID / digital (como apps de banco).
 * Bloqueia ao abrir o app e ao voltar depois de 1 minuto fora. No navegador não aparece.
 */
export function BiometricLock() {
  const { user, signOut } = useAuth();
  const [bio, setBio] = useState<BiometryInfo | null>(null);
  const [locked, setLocked] = useState(false);
  const [offer, setOffer] = useState(false);
  const leftAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (!bio || prompting.current) return;
    prompting.current = true;
    const ok = await authenticateBiometric(bio.label);
    prompting.current = false;
    if (ok) setLocked(false);
  }, [bio]);

  // Descobre a biometria do aparelho e bloqueia na abertura.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;
    let alive = true;
    biometryInfo().then((info) => {
      if (!alive) return;
      setBio(info);
      if (!info.available) return;
      if (biometricLockEnabled()) setLocked(true);
      else if (!biometricLockAsked()) setOffer(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Volta ao app: bloqueia se passou de 1 minuto fora.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      const h = App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) { leftAt.current = Date.now(); return; }
        if (user && biometricLockEnabled() && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) setLocked(true);
      });
      remove = () => { void h.then((x) => x.remove()); };
    });
    return () => remove?.();
  }, [user]);

  // Ao bloquear, já pede a biometria.
  useEffect(() => { if (locked) void unlock(); }, [locked, unlock]);

  if (!user || !bio?.available) return null;
  const Icon = bio.label === 'Face ID' || bio.label === 'reconhecimento facial' ? ScanFace : Fingerprint;

  return (
    <>
      {locked && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-[hsl(var(--sidebar-background,210_60%_15%))] p-8 text-center text-white">
          <div className="rounded-full bg-white/10 p-5"><LockKeyhole className="h-10 w-10" /></div>
          <div className="space-y-1">
            <p className="text-xl font-semibold">Klinova bloqueado</p>
            <p className="text-sm text-white/70">Use {bio.label} para continuar.</p>
          </div>
          <BrandButton size="lg" onClick={() => void unlock()}><Icon className="h-5 w-5" /> Desbloquear com {bio.label}</BrandButton>
          <button type="button" className="text-sm text-white/70 underline-offset-4 hover:underline" onClick={() => { setLocked(false); void signOut(); }}>
            Entrar com e-mail e senha
          </button>
        </div>
      )}

      <Dialog open={offer} onOpenChange={(v) => { if (!v) { setBiometricLockEnabled(false); setOffer(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> Usar {bio.label}?</DialogTitle>
            <DialogDescription>
              O Klinova guarda dados de saúde dos pacientes. Com {bio.label}, o app fica bloqueado quando você sai dele e abre só com você.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <BrandButton onClick={async () => {
              if (await authenticateBiometric(bio.label)) setBiometricLockEnabled(true);
              setOffer(false);
            }}>
              Ativar {bio.label}
            </BrandButton>
            <BrandButton variant="ghost" onClick={() => { setBiometricLockEnabled(false); setOffer(false); }}>Agora não</BrandButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Liga/desliga o desbloqueio por biometria (aparece só no app). */
export function BiometricToggle({ className }: { className?: string }) {
  const [bio, setBio] = useState<BiometryInfo | null>(null);
  const [on, setOn] = useState(biometricLockEnabled());
  useEffect(() => { if (Capacitor.isNativePlatform()) biometryInfo().then(setBio).catch(() => {}); }, []);
  if (!bio?.available) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (on) { setBiometricLockEnabled(false); setOn(false); return; }
        if (await authenticateBiometric(bio.label)) { setBiometricLockEnabled(true); setOn(true); }
      }}
    >
      <Fingerprint className="w-4 h-4" />
      {bio.label}: {on ? 'ligado' : 'desligado'}
    </button>
  );
}
