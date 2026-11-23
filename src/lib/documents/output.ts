import { Capacitor } from '@capacitor/core';
import { generateContractPDF } from '@/lib/contractPDF';
import { escapeHtml } from '@/lib/documents/letterhead';

/**
 * Saída de documentos (proposta, contrato, anamnese, recibo...): um só caminho para "Baixar PDF" e
 * "Imprimir" em todas as telas.
 * - Computador e Android: imprime num quadro escondido, isolado dos estilos do sistema.
 * - App do iPhone: a impressão do navegador não funciona dentro do app; gera o PDF e abre o menu de
 *   compartilhar do iOS, que tem Imprimir (AirPrint), Salvar em Arquivos e WhatsApp.
 * - Safari do iPhone/iPad: imprimir um quadro escondido sai errado; gera o PDF e compartilha (ou baixa).
 */

export type DocumentOutput = {
  /** Corpo do documento em HTML (o mesmo usado no PDF). */
  html: string;
  /** Título da janela de impressão e do compartilhamento. Ex.: "Contrato CT-2026-0012". */
  title: string;
  /** Nome do arquivo, sem pasta. ".pdf" é acrescentado se faltar. */
  filename: string;
};

export type OutputResult = 'printed' | 'shared' | 'downloaded' | 'cancelled';

export const isNativeApp = () => Capacitor.isNativePlatform();

export function isIosBrowser(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Onde "Imprimir" passa pelo PDF em vez da impressão do navegador. */
export const printGoesThroughPdf = () => isNativeApp() || isIosBrowser();

/** Nome de arquivo seguro: sem acentos, barras ou espaços repetidos. */
export function pdfFileName(name: string) {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'documento'}.pdf`;
}

/** Documento completo para imprimir: A4, margens fixas, número de página e cores preservadas. */
export function printableDocument(bodyHtml: string, title: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{size:A4;margin:15mm 15mm 18mm;@bottom-right{content:"Página " counter(page) " de " counter(pages);font:9px Arial,sans-serif;color:#9ca3af}}
html,body{margin:0;background:#fff}
body{font-family:Arial,sans-serif;font-size:13px;color:#333;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
img{max-width:100%}
table{border-collapse:collapse;max-width:100%}
tr,img{break-inside:avoid}
h1,h2,h3,h4{break-after:avoid}
@media screen{body{padding:24px}}
</style></head><body>${bodyHtml}</body></html>`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || /cancel/i.test(e.message));

/** App do iPhone: grava o PDF no cache do app e abre o menu de compartilhar (tem Imprimir). */
async function shareNative(blob: Blob, filename: string, title: string): Promise<OutputResult> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title, url: uri, dialogTitle: title });
    return 'shared';
  } catch (e) {
    if (isAbort(e)) return 'cancelled';
    throw e;
  }
}

/** Entrega o PDF pronto: menu do iOS no app; compartilhar no Safari do iPhone (se der); senão baixa. */
export async function deliverPdf(blob: Blob, filename: string, title: string, preferShare = false): Promise<OutputResult> {
  const name = pdfFileName(filename);
  if (isNativeApp()) return shareNative(blob, name, title);
  if (preferShare && typeof navigator.share === 'function') {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (e) {
        if (isAbort(e)) return 'cancelled';
        // NotAllowedError: o navegador exige um toque recente. Cai para o download.
      }
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}

/** Imprime num quadro escondido (estilos do documento isolados dos do sistema). */
function printInFrame(doc: string): Promise<OutputResult> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    let removed = false;
    const remove = () => { if (!removed) { removed = true; frame.remove(); } };
    frame.onload = async () => {
      const w = frame.contentWindow;
      if (!w) { remove(); reject(new Error('Não foi possível abrir a impressão.')); return; }
      // Logo da clínica precisa carregar antes, senão sai em branco.
      await Promise.all(Array.from(w.document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
      w.addEventListener('afterprint', () => setTimeout(remove, 500));
      setTimeout(remove, 120_000);
      w.focus();
      w.print();
      resolve('printed');
    };
    frame.srcdoc = doc;
    document.body.appendChild(frame);
  });
}

/** Botão "Baixar PDF". */
export async function downloadDocumentPdf(d: DocumentOutput): Promise<OutputResult> {
  const blob = await generateContractPDF(d.html);
  return deliverPdf(blob, d.filename, d.title);
}

/** Botão "Imprimir". */
export async function printDocument(d: DocumentOutput): Promise<OutputResult> {
  if (printGoesThroughPdf()) {
    const blob = await generateContractPDF(d.html);
    return deliverPdf(blob, d.filename, d.title, true);
  }
  return printInFrame(printableDocument(d.html, d.title));
}
