/**
 * Exporta relatórios simples (uma ou mais tabelas) para Excel e PDF.
 * Bibliotecas carregadas só na hora de exportar.
 */
export type ExportCell = string | number;
export type ExportSection = { title: string; head: string[]; rows: ExportCell[][]; moneyColumns?: number[]; boldLastRow?: boolean };
export type ExportReport = { clinicName: string; title: string; subtitle?: string; sections: ExportSection[]; note?: string; fileName: string };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportReportExcel(report: ExportReport) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.clinicName]).font = { bold: true, size: 14 };
  ws.addRow([report.title + (report.subtitle ? ` · ${report.subtitle}` : '')]).font = { size: 12 };
  let widest = 1;
  report.sections.forEach((section) => {
    ws.addRow([]);
    ws.addRow([section.title]).font = { bold: true, size: 12 };
    ws.addRow(section.head).font = { bold: true };
    widest = Math.max(widest, section.head.length);
    section.rows.forEach((cells, i) => {
      const row = ws.addRow(cells);
      (section.moneyColumns ?? []).forEach((c) => { row.getCell(c + 1).numFmt = '"R$" #,##0.00'; });
      if (section.boldLastRow && i === section.rows.length - 1) row.font = { bold: true };
    });
  });
  if (report.note) {
    ws.addRow([]);
    ws.addRow([report.note]).font = { italic: true, size: 9 };
  }
  for (let c = 1; c <= widest; c += 1) ws.getColumn(c).width = c === 1 ? 32 : 18;
  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safe(report.fileName)}.xlsx`);
}

export async function exportReportPdf(report: ExportReport) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(report.clinicName, 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(report.title + (report.subtitle ? ` · ${report.subtitle}` : ''), 14, 26);
  let y = 32;
  report.sections.forEach((section) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, 14, y + 4);
    autoTable(doc, {
      startY: y + 7,
      head: [section.head],
      body: section.rows.map((cells) => cells.map((v, i) => ((section.moneyColumns ?? []).includes(i) && typeof v === 'number' ? brl(v) : String(v)))),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [26, 122, 109] },
      columnStyles: Object.fromEntries((section.moneyColumns ?? []).map((c) => [c, { halign: 'right' }])),
      didParseCell: (data) => {
        if (section.boldLastRow && data.section === 'body' && data.row.index === section.rows.length - 1) data.cell.styles.fontStyle = 'bold';
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 8;
  });
  if (report.note) {
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(doc.splitTextToSize(report.note, 180), 14, y + 2);
  }
  doc.save(`${safe(report.fileName)}.pdf`);
}
