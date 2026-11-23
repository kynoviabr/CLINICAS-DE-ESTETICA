import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { compressPhoto } from '@/lib/photos/compress';
import { PHOTO_BUCKET, photoPath, storagePathOf } from '@/lib/photos/storage';
import { withSignedUrls } from '@/lib/photos/sign';

type PhotoType = Database['public']['Enums']['photo_type'];
export type PatientPhoto = Database['public']['Tables']['patient_photos']['Row'] & { fullUrl: string | null; thumbUrl: string | null };
export type PhotoMeta = { date: string; type: PhotoType; description: string; treatmentId: string | null };

const noonIso = (date: string) => new Date(`${date}T12:00:00`).toISOString();

/** Fotos de uma paciente: o armazenamento é privado, então a tela usa links temporários (1 h). */
export function usePatientPhotos(clinicId: string | null | undefined, patientId: string | null | undefined, userId?: string | null) {
  const qc = useQueryClient();
  const key = ['patient-photos', patientId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<PatientPhoto[]> => {
      const { data, error } = await supabase.from('patient_photos').select('*')
        .eq('patient_id', patientId!).order('taken_at', { ascending: false });
      if (error) throw error;
      return withSignedUrls(data || []);
    },
    enabled: !!patientId,
    staleTime: 30 * 60 * 1000,
  });

  const upload = useMutation({
    mutationFn: async ({ files, meta, onProgress }: { files: File[]; meta: PhotoMeta; onProgress?: (done: number, savedBytes: number) => void }) => {
      let saved = 0;
      for (let i = 0; i < files.length; i += 1) {
        const photo = await compressPhoto(files[i]);
        const fullPath = photoPath(clinicId!, patientId!, photo.ext);
        const thumbPath = fullPath.replace(`.${photo.ext}`, `-thumb.${photo.ext}`);
        const contentType = photo.ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const up1 = await supabase.storage.from(PHOTO_BUCKET).upload(fullPath, photo.full, { contentType, upsert: false });
        if (up1.error) throw up1.error;
        const up2 = await supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, photo.thumb, { contentType, upsert: false });
        if (up2.error) throw up2.error;
        const { error } = await supabase.from('patient_photos').insert({
          clinic_id: clinicId!, patient_id: patientId!, photo_url: fullPath, thumbnail_url: thumbPath,
          photo_type: meta.type, description: meta.description.trim() || null, taken_at: noonIso(meta.date),
          treatment_id: meta.treatmentId, uploaded_by: userId ?? null,
        });
        if (error) {
          await supabase.storage.from(PHOTO_BUCKET).remove([fullPath, thumbPath]);
          throw error;
        }
        saved += Math.max(0, photo.originalSize - photo.full.size - photo.thumb.size);
        onProgress?.(i + 1, saved);
      }
      return { count: files.length, saved };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, meta }: { id: string; meta: PhotoMeta }) => {
      const { error } = await supabase.from('patient_photos').update({
        photo_type: meta.type, description: meta.description.trim() || null, taken_at: noonIso(meta.date), treatment_id: meta.treatmentId,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (photo: PatientPhoto) => {
      const { error } = await supabase.from('patient_photos').delete().eq('id', photo.id);
      if (error) throw error;
      const paths = [storagePathOf(photo.photo_url), storagePathOf(photo.thumbnail_url)].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { photos: query.data ?? [], isLoading: query.isLoading, upload, update, remove };
}
