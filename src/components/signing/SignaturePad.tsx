import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';

export type SignaturePadHandle = {
  /** PNG em data URL, recortado na assinatura, ou null se nada foi desenhado. */
  toDataUrl: () => string | null;
  clear: () => void;
};

/** Quadro para a cliente assinar com o dedo ou a caneta (aparelho da clínica). */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  // Dentro de janelas que abrem com animação o tamanho só existe depois; refaz quando muda (e limpa).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    setup();
    const ro = new ResizeObserver(() => { setup(); setHasInk(false); onChange?.(false); });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const mark = (v: boolean) => { setHasInk(v); onChange?.(v); };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvas.current?.getContext('2d');
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = canvas.current?.getContext('2d');
    const p = point(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    if (!hasInk) mark(true);
  };

  const up = () => { drawing.current = false; last.current = null; };

  const clear = () => {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    mark(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    toDataUrl: () => {
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx || !hasInk) return null;
      // Recorta o espaço vazio em volta da assinatura e põe fundo branco (sai bem no PDF).
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) return null;
      const pad = 8;
      const w = Math.min(width, maxX - minX + pad * 2), h = Math.min(height, maxY - minY + pad * 2);
      const out = document.createElement('canvas');
      const scale = Math.min(1, 600 / w);
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const o = out.getContext('2d')!;
      o.fillStyle = '#fff';
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), w, h, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }));

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-muted-foreground/30 bg-white">
        <canvas
          ref={canvas}
          className="block h-44 w-full touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          aria-label="Quadro de assinatura"
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-muted-foreground/40" />
        {!hasInk && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Assine aqui com o dedo</p>}
      </div>
      <BrandButton type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
        <Eraser className="h-4 w-4" /> Limpar
      </BrandButton>
    </div>
  );
});
