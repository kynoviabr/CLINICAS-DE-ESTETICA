import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

async function toFile(webPath: string, name: string): Promise<File> {
  const blob = await (await fetch(webPath)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * App iOS/Android: câmera e galeria nativas. Devolve os arquivos para o mesmo envio do site
 * (compressão e upload continuam iguais). Lista vazia = a pessoa cancelou.
 */
export async function nativePickPhotos(source: 'camera' | 'gallery'): Promise<File[]> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const stamp = Date.now();
  try {
    if (source === 'camera') {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 90,
        correctOrientation: true,
        saveToGallery: false, // foto clínica não vai para a galeria pessoal do celular
      });
      return photo.webPath ? [await toFile(photo.webPath, `foto-${stamp}.${photo.format || 'jpg'}`)] : [];
    }
    const { photos } = await Camera.pickImages({ quality: 90, limit: 20 });
    return Promise.all(photos.map((p, i) => toFile(p.webPath, `foto-${stamp}-${i}.${p.format || 'jpg'}`)));
  } catch (err) {
    // Cancelar a câmera/galeria não é erro.
    if (/cancel/i.test(String((err as Error)?.message ?? err))) return [];
    throw err;
  }
}
