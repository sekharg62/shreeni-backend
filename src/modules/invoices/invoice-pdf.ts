import PDFDocument from 'pdfkit';
import { amountInWords } from './gst.js';
import type { InvoiceDocument } from './invoice-document.js';

/*
 * Draws an InvoiceDocument as an A4 PDF. Built-in PDF fonts only (Helvetica / Times), so nothing has to
 * be bundled; they have no "₹" glyph, so money is written "Rs." (the usual form on Indian invoices).
 */

const C = {
  brand: '#650f25',
  gold: '#b88646',
  ink: '#32151b',
  muted: '#786b63',
  line: '#e9dcc8',
  tint: '#f8f3ea',
  alert: '#b42318',
};

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;
/** Space kept free at the bottom of each page for the footer. */
const FOOTER_SPACE = 46;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** 209950 → "2,099.50" */
const num = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (paise: number) => `Rs. ${num(paise)}`;

type Col = { key: string; label: string; width: number; align: 'left' | 'right' | 'center' };

function columns(doc: InvoiceDocument): Col[] {
  if (!doc.registered) {
    return [
      { key: 'no', label: '#', width: 20, align: 'left' },
      { key: 'item', label: 'Item', width: 245, align: 'left' },
      { key: 'qty', label: 'Qty', width: 34, align: 'center' },
      { key: 'rate', label: 'Rate', width: 72, align: 'right' },
      { key: 'discount', label: 'Discount', width: 66, align: 'right' },
      { key: 'amount', label: 'Amount', width: CONTENT_W - 437, align: 'right' },
    ];
  }
  const tax: Col[] = doc.intraState
    ? [
        { key: 'cgst', label: 'CGST', width: 52, align: 'right' },
        { key: 'sgst', label: 'SGST', width: 52, align: 'right' },
      ]
    : [{ key: 'igst', label: 'IGST', width: 104, align: 'right' }];
  return [
    { key: 'no', label: '#', width: 18, align: 'left' },
    { key: 'item', label: 'Item', width: 168, align: 'left' },
    { key: 'hsn', label: 'HSN', width: 40, align: 'center' },
    { key: 'qty', label: 'Qty', width: 26, align: 'center' },
    { key: 'taxable', label: 'Taxable value', width: 66, align: 'right' },
    { key: 'rate', label: 'GST', width: 30, align: 'center' },
    ...tax,
    { key: 'amount', label: 'Amount', width: CONTENT_W - 452, align: 'right' },
  ];
}

export function renderInvoicePdf(inv: InvoiceDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      bufferPages: true, // page numbers are added at the end
      info: {
        Title: `${inv.title} ${inv.invoiceNumber}`,
        Author: inv.seller.legalName,
        Subject: `Order ${inv.orderNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const L = PAGE.margin;
    const R = PAGE.width - PAGE.margin;
    const bottom = PAGE.height - PAGE.margin - FOOTER_SPACE;
    const cols = columns(inv);

    const hr = (y: number, color = C.line, width = 0.75) =>
      pdf.moveTo(L, y).lineTo(R, y).lineWidth(width).strokeColor(color).stroke();

    /* ── Header: brand + seller (left), document title + numbers (right) ── */
    pdf.rect(0, 0, PAGE.width, 6).fill(C.brand);
    let y = 34;
    pdf.font('Times-Bold').fontSize(26).fillColor(C.brand).text(inv.seller.brandName, L, y);
    y = pdf.y + 2;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(inv.seller.legalName, L, y, { width: 270 });
    pdf.font('Helvetica').fontSize(8.5).fillColor(C.muted);
    for (const line of inv.seller.addressLines) pdf.text(line, { width: 270 });
    pdf.text([inv.seller.phone, inv.seller.email].filter(Boolean).join('  ·  '), { width: 270 });
    if (inv.seller.gstin) {
      pdf.moveDown(0.3).font('Helvetica-Bold').fillColor(C.ink).text(`GSTIN: ${inv.seller.gstin}`, { width: 270 });
    }
    const leftBottom = pdf.y;

    const metaX = 330;
    const metaW = R - metaX;
    pdf.font('Helvetica-Bold').fontSize(16).fillColor(C.ink).text(inv.title.toUpperCase(), metaX, 36, { width: metaW, align: 'right', characterSpacing: 1.5 });
    pdf.font('Helvetica').fontSize(7.5).fillColor(C.gold).text('ORIGINAL FOR RECIPIENT', metaX, pdf.y + 1, { width: metaW, align: 'right', characterSpacing: 1 });
    let my = pdf.y + 10;
    const meta: [string, string][] = [
      ['Invoice no.', inv.invoiceNumber],
      ['Invoice date', dateFmt.format(inv.invoiceDate)],
      ['Order no.', inv.orderNumber],
      ['Order date', dateFmt.format(inv.orderDate)],
      ['Place of supply', inv.placeOfSupply],
    ];
    for (const [k, v] of meta) {
      pdf.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(k, metaX, my, { width: 90 });
      pdf.font('Helvetica-Bold').fillColor(C.ink).text(v, metaX + 90, my, { width: metaW - 90, align: 'right' });
      my = pdf.y + 3;
    }

    y = Math.max(leftBottom, my) + 14;
    hr(y, C.gold, 1);
    y += 14;

    /* ── Bill to / Ship to (B2C: same person) ── */
    pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(C.gold).text('BILLED & SHIPPED TO', L, y, { characterSpacing: 1 });
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(inv.buyer.name, L, pdf.y + 4, { width: 300 });
    pdf.font('Helvetica').fontSize(8.5).fillColor(C.ink);
    for (const line of inv.buyer.addressLines) pdf.text(line, { width: 300 });
    pdf.fillColor(C.muted).text([inv.buyer.phone, inv.buyer.email].filter(Boolean).join('  ·  '), { width: 300 });
    const buyerBottom = pdf.y;

    pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(C.gold).text('PAYMENT', metaX, y, { width: metaW, align: 'right', characterSpacing: 1 });
    pdf.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(inv.paymentNote, metaX, pdf.y + 4, { width: metaW, align: 'right' });
    if (inv.registered) {
      pdf.fillColor(C.muted).text(`Tax: ${inv.intraState ? 'CGST + SGST (same state)' : 'IGST (inter-state)'}`, metaX, pdf.y + 2, { width: metaW, align: 'right' });
    }
    y = Math.max(buyerBottom, pdf.y) + 18;

    /* ── Items table ── */
    const drawHead = (top: number) => {
      pdf.rect(L, top, CONTENT_W, 20).fill(C.tint);
      let x = L;
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(C.ink);
      for (const c of cols) {
        pdf.text(c.label, x + 4, top + 6.5, { width: c.width - 8, align: c.align, lineBreak: false });
        x += c.width;
      }
      return top + 20;
    };
    y = drawHead(y);
    if (inv.registered) {
      pdf.font('Helvetica').fontSize(6.5).fillColor(C.muted).text('Amounts in Rs. Prices include GST; tax shown below is included in the amount.', L, y + 3, { width: CONTENT_W });
      y = pdf.y + 2;
    }

    inv.lines.forEach((line, i) => {
      const itemCol = cols.find((c) => c.key === 'item')!;
      const sub = [
        line.detail,
        line.quantity > 1 || line.discount > 0 ? `${rs(line.unitPrice)} × ${line.quantity}` : null,
        line.discount > 0 ? `Less discount ${rs(line.discount)}` : null,
      ].filter(Boolean).join('\n');
      pdf.font('Helvetica-Bold').fontSize(8.5);
      const nameH = pdf.heightOfString(line.description, { width: itemCol.width - 8 });
      pdf.font('Helvetica').fontSize(7);
      const subH = sub ? pdf.heightOfString(sub, { width: itemCol.width - 8 }) + 2 : 0;
      const rowH = Math.max(22, nameH + subH + 12);

      if (y + rowH > bottom) {
        pdf.addPage();
        y = drawHead(PAGE.margin);
      }

      const cells: Record<string, string> = {
        no: String(i + 1),
        hsn: line.hsnCode ?? '—',
        qty: String(line.quantity),
        taxable: num(line.taxable),
        rate: inv.registered ? `${line.gstRate}%` : num(line.unitPrice),
        cgst: num(line.cgst),
        sgst: num(line.sgst),
        igst: num(line.igst),
        discount: line.discount ? num(line.discount) : '—',
        amount: num(line.amount),
      };
      let x = L;
      for (const c of cols) {
        if (c.key === 'item') {
          pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(line.description, x + 4, y + 6, { width: c.width - 8 });
          if (sub) pdf.font('Helvetica').fontSize(7).fillColor(C.muted).text(sub, x + 4, pdf.y + 2, { width: c.width - 8 });
        } else {
          const bold = c.key === 'amount';
          pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(C.ink)
            .text(cells[c.key], x + 4, y + 6, { width: c.width - 8, align: c.align, lineBreak: false });
        }
        x += c.width;
      }
      y += rowH;
      hr(y);
    });

    /* ── Totals (right) + amount in words (left) ── */
    const totalRows: [string, string, boolean?][] = [];
    if (inv.registered) {
      totalRows.push(['Taxable value', rs(inv.totals.taxable)]);
      if (inv.intraState) {
        totalRows.push(['CGST', rs(inv.totals.cgst)], ['SGST', rs(inv.totals.sgst)]);
      } else {
        totalRows.push(['IGST', rs(inv.totals.igst)]);
      }
    }
    if (inv.totals.discount > 0) {
      totalRows.push([`Discount${inv.discountCode ? ` (${inv.discountCode})` : ''} — included above`, `- ${rs(inv.totals.discount)}`]);
    }
    totalRows.push(['Total', rs(inv.totals.total), true]);

    const blockH = totalRows.length * 16 + 60;
    if (y + 16 + blockH > bottom) {
      pdf.addPage();
      y = PAGE.margin;
    }
    y += 14;
    const tX = R - 250;
    let ty = y;
    for (const [label, value, strong] of totalRows) {
      if (strong) {
        pdf.rect(tX, ty - 3, 250, 24).fill(C.brand);
        pdf.font('Helvetica-Bold').fontSize(10.5).fillColor('#ffffff').text(label, tX + 10, ty + 4, { width: 120 });
        pdf.text(value, tX + 110, ty + 4, { width: 130, align: 'right' });
        ty += 26;
      } else {
        pdf.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(label, tX, ty, { width: 160 });
        pdf.font('Helvetica').fillColor(C.ink).text(value, tX + 150, ty, { width: 100, align: 'right' });
        ty = Math.max(pdf.y, ty + 12) + 4;
      }
    }

    pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(C.gold).text('AMOUNT IN WORDS', L, y, { characterSpacing: 1 });
    pdf.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(amountInWords(inv.totals.total), L, pdf.y + 4, { width: tX - L - 20 });
    if (inv.registered) {
      pdf.moveDown(0.6).fontSize(7.5).fillColor(C.muted).text('Tax payable on reverse charge: No', { width: tX - L - 20 });
    }
    if (inv.notice) {
      pdf.moveDown(0.6).font('Helvetica-Bold').fontSize(8).fillColor(C.alert).text(inv.notice, { width: tX - L - 20 });
    }
    y = Math.max(ty, pdf.y) + 24;

    /* ── Closing note ── */
    if (y + 40 > bottom) {
      pdf.addPage();
      y = PAGE.margin;
    }
    pdf.font('Times-Italic').fontSize(11).fillColor(C.brand).text(`Thank you for choosing ${inv.seller.brandName}.`, L, y, { width: CONTENT_W, align: 'center' });
    pdf.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(`For any help with this order, write to ${inv.seller.email || 'us'}${inv.seller.phone ? ` or call ${inv.seller.phone}` : ''}.`, L, pdf.y + 4, { width: CONTENT_W, align: 'center' });

    /* ── Footer on every page ── */
    const range = pdf.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      pdf.switchToPage(p);
      const fy = PAGE.height - PAGE.margin - 18;
      pdf.moveTo(L, fy - 8).lineTo(R, fy - 8).lineWidth(0.5).strokeColor(C.line).stroke();
      pdf.font('Helvetica').fontSize(7).fillColor(C.muted);
      pdf.text('This is a computer-generated invoice and does not need a signature.', L, fy, { width: CONTENT_W - 80, lineBreak: false });
      pdf.text(`${inv.invoiceNumber}  ·  Page ${p - range.start + 1} of ${range.count}`, L, fy, { width: CONTENT_W, align: 'right', lineBreak: false });
    }

    pdf.end();
  });
}
