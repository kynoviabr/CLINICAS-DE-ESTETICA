import { supabase } from '@/integrations/supabase/client';
import { PHOTO_BUCKET, storagePathOf } from '@/lib/photos/storage';

type Stored = { photo_url: string; thumbnail_url: string | null };

/** Links temporários (1 h) para fotos do armazenamento privado. */
export async function withSignedUrls<T extends Stored>(rows: T[]): Promise<Array<T & { fullUrl: string | null; thumbUrl: string | null }>> {
  const paths = [...new Set(rows.flatMap((r) => [storagePathOf(r.photo_url), storagePathOf(r.thumbnail_url)]).filter(Boolean) as string[])];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
    (data || []).forEach((u) => { if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl); });
  }
  return rows.map((r) => {
    const fullUrl = signed.get(storagePathOf(r.photo_url) ?? '') ?? null;
    return { ...r, fullUrl, thumbUrl: signed.get(storagePathOf(r.thumbnail_url) ?? '') ?? fullUrl };
  });
}
