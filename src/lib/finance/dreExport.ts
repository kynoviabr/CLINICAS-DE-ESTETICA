import type { DreTableRow } from '@/lib/finance/dre';

export type DreExport = {
  clinicName: string;
  title: string;
  columns: string[];
  rows: DreTableRow[];
  note: string;
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fileBase = (e: DreExport) => `DRE ${e.title}`.replace(/[\\/:*?"<>|]/g, '-');

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isBold = (kind: DreTableRow['kind']) => kind === 'subtotal' || kind === 'result' || kind === 'revenue' || kind === 'deduction';
const signed = (row: DreTableRow, v: number) => (['deduction', 'cost', 'expense'].includes(row.kind) && v !== 0 ? -v : v);

export async function exportDreExcel(e: DreExport) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DRE');
  ws.addRow([e.clinicName]).font = { bold: true, size: 14 };
  ws.addRow([`DRE simplificado · ${e.title}`]).font = { size: 12 };
  ws.addRow([]);
  const header = ws.addRow(['', ...e.columns]);
  header.font = { bold: true };
  e.rows.forEach((row) => {
    const r = ws.addRow([row.label, ...row.values.map((v) => signed(row, v))]);
    if (isBold(row.kind)) r.font = { bold: true };
    if (row.kind === 'deduction') r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E0' } };
    if (row.kind === 'info') r.font = { italic: true, color: { argb: 'FF666666' } };
  });
  ws.addRow([]);
  ws.addRow([e.note]).font = { italic: true, size: 9 };
  ws.getColumn(1).width = 46;
  e.columns.forEach((_, i) => {
    const col = ws.getColumn(i + 2);
    col.width = 20;
    col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  });
  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(e)}.xlsx`);
}

export async function exportDrePdf(e: DreExport) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(e.clinicName, 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`DRE simplificado · ${e.title}`, 14, 26);
  autoTable(doc, {
    startY: 32,
    head: [['', ...e.columns]],
    body: e.rows.map((row) => [row.label, ...row.values.map((v) => brl(signed(row, v)))]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [26, 122, 109] },
    columnStyles: Object.fromEntries(e.columns.map((_, i) => [i + 1, { halign: 'right' }])),
    didParseCell: (data) => {
      const row = e.rows[data.row.index];
      if (data.section === 'body' && row && isBold(row.kind)) data.cell.styles.fontStyle = 'bold';
      if (data.section === 'body' && row?.kind === 'deduction') data.cell.styles.fillColor = [255, 244, 224];
      if (data.section === 'body' && row?.kind === 'info') data.cell.styles.textColor = [120, 120, 120];
    },
  });
  const y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 40;
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(doc.splitTextToSize(e.note, 180), 14, y + 8);
  doc.save(`${fileBase(e)}.pdf`);
}
