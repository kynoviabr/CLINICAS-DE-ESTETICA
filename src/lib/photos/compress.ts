/**
 * Compressão de foto no aparelho, antes de enviar: foto de celular (3–6 MB) vira ~200–400 KB.
 * Lado maior até 1600 px (boa para comparar antes/depois) e miniatura de 400 px para as listas.
 * WebP quando o navegador gera; senão JPEG. A orientação da câmera (EXIF) é respeitada.
 */
export const PHOTO_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;

/** Tamanho final mantendo a proporção; nunca aumenta a imagem. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type CompressedPhoto = { full: Blob; thumb: Blob; ext: 'webp' | 'jpg'; width: number; height: number; originalSize: number };

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // cai para <img> abaixo
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(source: ImageBitmap | HTMLImageElement, maxSide: number, type: string, quality: number): Promise<Blob> {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const size = fitWithin(w, h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem neste aparelho.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir a imagem.'))), type, quality);
  });
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new Error(`${file.name} não é uma imagem.`);
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error(`Não foi possível abrir ${file.name}. Se for HEIC do iPhone, envie pelo próprio celular ou em JPG.`);
  }
  let full = await render(source, PHOTO_MAX_SIDE, 'image/webp', 0.8);
  let ext: 'webp' | 'jpg' = 'webp';
  if (full.type !== 'image/webp') {
    full = await render(source, PHOTO_MAX_SIDE, 'image/jpeg', 0.82);
    ext = 'jpg';
  }
  const thumb = await render(source, THUMB_MAX_SIDE, ext === 'webp' ? 'image/webp' : 'image/jpeg', 0.7);
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if ('close' in source) source.close();
  const final = fitWithin(w, h, PHOTO_MAX_SIDE);
  return { full, thumb, ext, width: final.width, height: final.height, originalSize: file.size };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
