import html2pdf from 'html2pdf.js';

/**
 * Generates a PDF blob from a raw HTML string.
 * This is the SINGLE SOURCE OF TRUTH for contract text, matching the web view exactly.
 */
export async function generateContractPDF(htmlContent: string): Promise<Blob> {
  // Create a hidden container to hold the HTML for rendering
  const container = document.createElement('div');

  // We apply some styling to ensure it renders like a document
  container.innerHTML = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; padding: 20px;">
      ${htmlContent}
    </div>
  `;

  // Style the container so it doesn't mess up the visible DOM but can be rendered
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px'; // fixed width for A4 proportion
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  try {
    const opt = {
      margin:       15,
      filename:     'contrato.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    // html2pdf returns a promise that resolves to the worker
    // We want the output as a blob to upload it to Supabase
    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    return pdfBlob;
  } finally {
    // Always cleanup the hidden container
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
