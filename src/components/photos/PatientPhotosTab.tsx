import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Camera, Columns2, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePatientPhotos, type PatientPhoto, type PhotoMeta } from '@/hooks/usePatientPhotos';
import { formatBytes } from '@/lib/photos/compress';
import { PHOTO_LABELS, PHOTO_LABEL_ORDER } from '@/lib/photos/storage';

const LABEL_STYLE: Record<string, string> = {
  before: 'bg-sky-600 text-white',
  after: 'bg-emerald-600 text-white',
  progress: 'bg-violet-600 text-white',
  during: 'bg-amber-500 text-white',
};
const NONE = '__none__';
const today = () => format(new Date(), 'yyyy-MM-dd');
const metaOf = (p: PatientPhoto): PhotoMeta => ({
  date: format(new Date(p.taken_at), 'yyyy-MM-dd'), type: p.photo_type, description: p.description ?? '', treatmentId: p.treatment_id,
});

/** Fotos da paciente: tirar pelo celular ou escolher da galeria, comprimir, rotular (antes/depois) e comparar. */
export function PatientPhotosTab({ clinicId, patientId }: { clinicId: string; patientId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { photos, isLoading, upload, update, remove } = usePatientPhotos(clinicId, patientId, user?.id);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<{ files: File[]; previews: string[] } | null>(null);
  const [meta, setMeta] = useState<PhotoMeta>({ date: today(), type: 'before', description: '', treatmentId: null });
  const [progress, setProgress] = useState<{ done: number; saved: number } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<PatientPhoto | null>(null);
  const [editMeta, setEditMeta] = useState<PhotoMeta | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compare, setCompare] = useState<PatientPhoto[]>([]);

  const { data: treatments = [] } = useQuery({
    queryKey: ['photo-treatments', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name').eq('clinic_id', clinicId).eq('is_active', true).order('name');
      return data || [];
    },
  });
  const treatmentName = (id: string | null) => treatments.find((t) => t.id === id)?.name;

  const shown = useMemo(() => (filter ? photos.filter((p) => p.photo_type === filter) : photos), [photos, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    photos.forEach((p) => { c[p.photo_type] = (c[p.photo_type] ?? 0) + 1; });
    return c;
  }, [photos]);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setPending({ files, previews: files.map((f) => URL.createObjectURL(f)) });
    setMeta((m) => ({ ...m, date: today(), description: '' }));
  };
  const closePending = () => {
    pending?.previews.forEach((u) => URL.revokeObjectURL(u));
    setPending(null);
    setProgress(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const send = () => {
    if (!pending) return;
    setProgress({ done: 0, saved: 0 });
    upload.mutate(
      { files: pending.files, meta, onProgress: (done, saved) => setProgress({ done, saved }) },
      {
        onSuccess: ({ count, saved }) => {
          toast({ title: `${count} foto(s) salva(s)`, description: saved > 0 ? `Comprimidas: economizou ${formatBytes(saved)}.` : undefined });
          closePending();
        },
        onError: (err) => {
          toast({ title: 'Não foi possível enviar', description: (err as Error).message, variant: 'destructive' });
          setProgress(null);
        },
      },
    );
  };

  const clickPhoto = (p: PatientPhoto) => {
    if (!compareMode) { setOpen(p); setEditMeta(metaOf(p)); return; }
    setCompare((cur) => {
      if (cur.some((c) => c.id === p.id)) return cur.filter((c) => c.id !== p.id);
      return cur.length >= 2 ? [cur[1], p] : [...cur, p];
    });
  };

  // Comparação: mais antiga à esquerda.
  const pair = [...compare].sort((a, b) => a.taken_at.localeCompare(b.taken_at));

  return (
    <div className="space-y-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files)} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />

      <div className="flex flex-wrap items-center gap-2">
        <BrandButton onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" /> Tirar foto</BrandButton>
        <BrandButton variant="outline" onClick={() => galleryRef.current?.click()}><ImagePlus className="h-4 w-4" /> Da galeria</BrandButton>
        {photos.length >= 2 && (
          <BrandButton variant={compareMode ? 'primary' : 'outline'} onClick={() => { setCompareMode(!compareMode); setCompare([]); }}>
            <Columns2 className="h-4 w-4" /> {compareMode ? 'Cancelar comparação' : 'Comparar antes × depois'}
          </BrandButton>
        )}
      </div>

      {compareMode && (
        <p className="text-sm text-muted-foreground">Toque em 2 fotos para comparar lado a lado ({compare.length}/2).</p>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-xs ${!filter ? 'border-primary bg-primary/10 font-medium' : ''}`}>Todas ({photos.length})</button>
          {PHOTO_LABEL_ORDER.filter((t) => counts[t]).map((t) => (
            <button key={t} type="button" onClick={() => setFilter(t)} className={`rounded-full border px-3 py-1 text-xs ${filter === t ? 'border-primary bg-primary/10 font-medium' : ''}`}>
              {PHOTO_LABELS[t]} ({counts[t]})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando fotos…</p>
      ) : photos.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <Camera className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
          <p className="font-medium">Nenhuma foto ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">Tire a foto do "antes" no primeiro atendimento. As fotos são comprimidas no aparelho e ficam guardadas com segurança.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => {
            const selected = compare.some((c) => c.id === p.id);
            return (
              <button type="button" key={p.id} onClick={() => clickPhoto(p)}
                className={`overflow-hidden rounded-xl border bg-card text-left shadow-card transition-all hover:shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}>
                <div className="relative aspect-square bg-muted">
                  {p.thumbUrl ? <img src={p.thumbUrl} alt={p.description || PHOTO_LABELS[p.photo_type]} loading="lazy" className="h-full w-full object-cover" /> : null}
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LABEL_STYLE[p.photo_type]}`}>{PHOTO_LABELS[p.photo_type]}</span>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium">{format(new Date(p.taken_at), 'dd/MM/yyyy')}{treatmentName(p.treatment_id) ? ` · ${treatmentName(p.treatment_id)}` : ''}</p>
                  {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Novas fotos */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !upload.isPending) closePending(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pending?.files.length === 1 ? 'Nova foto' : `${pending?.files.length} novas fotos`}</DialogTitle>
            <DialogDescription>As fotos são reduzidas no aparelho antes de enviar (ocupam bem menos espaço).</DialogDescription>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto">
                {pending.previews.map((src, i) => <img key={i} src={src} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Data</Label>
                  <Input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Rótulo</Label>
                  <Select value={meta.type} onValueChange={(v) => v && setMeta({ ...meta, type: v as PhotoMeta['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PHOTO_LABEL_ORDER.map((t) => <SelectItem key={t} value={t}>{PHOTO_LABELS[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Tratamento (opcional)</Label>
                <Select value={meta.treatmentId ?? NONE} onValueChange={(v) => v && setMeta({ ...meta, treatmentId: v === NONE ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem tratamento</SelectItem>
                    {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Comentário</Label>
                <Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Ex.: região frontal, sem maquiagem" />
              </div>
              {progress && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Comprimindo e enviando {Math.min(progress.done + 1, pending.files.length)} de {pending.files.length}…
                </p>
              )}
              <BrandButton className="w-full" onClick={send} disabled={upload.isPending}>
                {upload.isPending ? 'Enviando…' : `Salvar ${pending.files.length > 1 ? `${pending.files.length} fotos` : 'foto'}`}
              </BrandButton>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ver / editar */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); setEditMeta(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open ? `${PHOTO_LABELS[open.photo_type]} · ${format(new Date(open.taken_at), 'dd/MM/yyyy')}` : ''}</DialogTitle></DialogHeader>
          {open && editMeta && (
            <div className="space-y-3">
              {open.fullUrl && <img src={open.fullUrl} alt="" className="max-h-[60vh] w-full rounded-xl bg-muted object-contain" />}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Data</Label>
                  <Input type="date" value={editMeta.date} onChange={(e) => setEditMeta({ ...editMeta, date: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Rótulo</Label>
                  <Select value={editMeta.type} onValueChange={(v) => v && setEditMeta({ ...editMeta, type: v as PhotoMeta['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PHOTO_LABEL_ORDER.map((t) => <SelectItem key={t} value={t}>{PHOTO_LABELS[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Comentário</Label>
                <Textarea rows={2} value={editMeta.description} onChange={(e) => setEditMeta({ ...editMeta, description: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <BrandButton variant="outline" className="text-destructive" disabled={remove.isPending}
                  onClick={() => { if (window.confirm('Excluir esta foto? Não dá para desfazer.')) remove.mutate(open, { onSuccess: () => { setOpen(null); toast({ title: 'Foto excluída' }); } }); }}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </BrandButton>
                <BrandButton className="flex-1" disabled={update.isPending}
                  onClick={() => update.mutate({ id: open.id, meta: editMeta }, {
                    onSuccess: () => { setOpen(null); toast({ title: 'Foto atualizada' }); },
                    onError: (err) => toast({ title: 'Não foi possível salvar', description: (err as Error).message, variant: 'destructive' }),
                  })}>
                  Salvar alterações
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comparar lado a lado */}
      <Dialog open={compare.length === 2} onOpenChange={(o) => { if (!o) setCompare([]); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Comparação</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {pair.map((p) => (
              <div key={p.id} className="space-y-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_STYLE[p.photo_type]}`}>{PHOTO_LABELS[p.photo_type]}</span>
                {p.fullUrl && <img src={p.fullUrl} alt="" className="aspect-[3/4] w-full rounded-xl bg-muted object-cover" />}
                <p className="text-sm font-medium">{format(parseISO(p.taken_at), 'dd/MM/yyyy')}</p>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
