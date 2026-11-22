import html2pdf from 'html2pdf.js';

/**
 * Gera o PDF (A4) a partir do HTML do documento. Fonte única do texto: o mesmo HTML da tela.
 *
 * O conteúdo fica num quadro fora da tela, mas o html2pdf recebe o elemento de dentro: ele copia o
 * elemento que recebe, e se a cópia levasse o "fora da tela" o PDF saía em branco.
 */
export async function generateContractPDF(htmlContent: string): Promise<Blob> {
  const holder = document.createElement('div');
  Object.assign(holder.style, { position: 'absolute', left: '-10000px', top: '0', width: '800px' });
  const page = document.createElement('div');
  page.style.cssText = 'box-sizing:border-box;padding:8px;background:#fff;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6';
  page.innerHTML = htmlContent;
  holder.appendChild(page);
  document.body.appendChild(holder);

  try {
    const opt = {
      margin: [12, 12, 16, 12] as [number, number, number, number],
      filename: 'documento.pdf',
      image: { type: 'jpeg' as const, quality: 0.85 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] },
    };
    const worker = html2pdf().set(opt).from(page).toPdf();
    const pdf = await worker.get('pdf');
    // Número da página no rodapé (Página X de Y).
    const total = pdf.internal.getNumberOfPages();
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`Página ${i} de ${total}`, w - 12, h - 7, { align: 'right' });
    }
    return pdf.output('blob') as Blob;
  } finally {
    holder.remove();
  }
}
