import PDFDocument from 'pdfkit';
import { logoImage, LOGO_RATIO } from './pdf-assets.js';

/*
 * Shipping labels: A6 (105 × 148 mm) each, four to an A4 page (2 × 2) with dashed cut lines,
 * so they print on any office printer. Built-in fonts only, so money is "Rs." (no "₹" glyph).
 */

export type ShippingLabel = {
  orderNumber: string;
  orderDate: Date;
  itemCount: number;
  invoiceNumber: string | null;
  to: { name: string; addressLines: string[]; cityState: string; pincode: string; phone: string };
  /** Cash on delivery still to collect (paise); null = prepaid / already paid. */
  codAmount: number | null;
  courier: string | null;
  awb: string | null;
};

export type LabelSender = {
  brandName: string;
  legalName: string;
  addressLines: string[];
  phone: string;
};

/**
 * pdfkit's opened-image object. `openImage` exists at runtime but is missing from @types/pdfkit;
 * `image()` accepts the object and then embeds it only once per document.
 */
type OpenedImage = { width: number; height: number };
type WithOpenImage = { openImage(src: Buffer): OpenedImage };

const C = { ink: '#1a1a1a', muted: '#555555', gold: '#8a6230', line: '#bbbbbb', cut: '#9a9a9a' };

const A4 = { width: 595.28, height: 841.89 };
const CELL = { width: A4.width / 2, height: A4.height / 2 };
/** Inner padding: printers can't print to the edge, and it leaves room to cut. */
const PAD = 18;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const rs = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "+919283730153" → "+91 92837 30153"; anything else unchanged. */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone.replace(/\s+/g, ''));
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Order number with a space every 4 characters, easier to read aloud: "OD26 1108 4967 92". */
const spaced = (s: string) => s.replace(/(.{4})(?=.)/g, '$1 ');

export function renderShippingLabelsPdf(labels: ShippingLabel[], sender: LabelSender): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // margin 0: every position is set by hand, and pdfkit must never start a page on its own.
    const pdf = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: 'Shipping labels', Author: sender.legalName } });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Opened once and reused: pdfkit embeds a raw Buffer again on every draw, which would put a copy of the
    // logo on each label (100 labels ≈ 3.5 MB, near Vercel's 4.5 MB response limit). Once ≈ 35 KB in total.
    const raw = logoImage();
    const logo = raw ? (pdf as unknown as WithOpenImage).openImage(raw) : null;

    labels.forEach((label, i) => {
      const slot = i % 4;
      if (slot === 0) {
        pdf.addPage();
        drawCutLines(pdf);
      }
      drawLabel(pdf, label, sender, logo, (slot % 2) * CELL.width, Math.floor(slot / 2) * CELL.height);
    });

    pdf.end();
  });
}

function drawCutLines(pdf: PDFKit.PDFDocument) {
  pdf.save().lineWidth(0.6).strokeColor(C.cut).dash(4, { space: 4 });
  pdf.moveTo(CELL.width, 0).lineTo(CELL.width, A4.height).stroke();
  pdf.moveTo(0, CELL.height).lineTo(A4.width, CELL.height).stroke();
  pdf.undash().restore();
}

function drawLabel(
  pdf: PDFKit.PDFDocument,
  l: ShippingLabel,
  sender: LabelSender,
  logo: OpenedImage | null,
  x0: number,
  y0: number,
) {
  const x = x0 + PAD;
  const w = CELL.width - PAD * 2;
  let y = y0 + PAD;

  const small = (text: string, yy: number) =>
    pdf.font('Helvetica-Bold').fontSize(7).fillColor(C.gold).text(text, x, yy, { width: w, characterSpacing: 1.2, lineBreak: false });

  /* ── Deliver to ── */
  small('DELIVER TO', y);
  y += 11;
  // Big, because it's what the courier reads most; long names/addresses are capped so the label never overflows.
  pdf.font('Helvetica-Bold').fontSize(17).fillColor(C.ink).text(l.to.name, x, y, { width: w, height: 42, ellipsis: true });
  y = pdf.y + 4;
  pdf.font('Helvetica').fontSize(11.5).fillColor(C.ink).text(l.to.addressLines.join('\n'), x, y, { width: w, height: 72, ellipsis: true, lineGap: 1.5 });
  y = pdf.y + 3;
  pdf.font('Helvetica-Bold').fontSize(12).text(l.to.cityState, x, y, { width: w, height: 30, ellipsis: true });
  y = pdf.y + 10;

  // PIN code, big: the first thing a sorter looks for.
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('PIN', x, y + 7, { lineBreak: false });
  pdf.rect(x + 24, y, 104, 26).lineWidth(1.2).strokeColor(C.ink).stroke();
  pdf.font('Helvetica-Bold').fontSize(18).fillColor(C.ink).text(l.to.pincode, x + 24, y + 5, { width: 104, align: 'center', characterSpacing: 2, lineBreak: false });
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('PHONE', x + 140, y + 1, { lineBreak: false });
  pdf.font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(formatPhone(l.to.phone), x + 140, y + 11, { width: w - 140, lineBreak: false });
  y += 38;

  /* ── Payment: what the courier must (not) collect ── */
  if (l.codAmount !== null) {
    pdf.rect(x, y, w, 36).fill(C.ink);
    pdf.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text('CASH ON DELIVERY', x + 10, y + 7, { width: w - 20, characterSpacing: 1, lineBreak: false });
    pdf.fontSize(13).text(`COLLECT ${rs(l.codAmount)}`, x + 10, y + 18, { width: w - 20, lineBreak: false });
  } else {
    pdf.rect(x, y, w, 36).lineWidth(1.5).strokeColor(C.ink).stroke();
    pdf.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text('PREPAID', x + 10, y + 7, { width: w - 20, characterSpacing: 1.5, lineBreak: false });
    pdf.font('Helvetica').fontSize(8.5).text('Do not collect any cash', x + 10, y + 22, { width: w - 20, lineBreak: false });
  }
  y += 46;

  /* ── Order facts ── */
  const facts: [string, string][] = [
    ['ORDER NO.', spaced(l.orderNumber)],
    ['ORDER DATE', dateFmt.format(l.orderDate)],
    ['ITEMS', `${l.itemCount} piece${l.itemCount === 1 ? '' : 's'}`],
    ['INVOICE NO.', l.invoiceNumber ?? '—'],
  ];
  if (l.courier) facts.push(['COURIER', l.courier], ['TRACKING NO.', l.awb ?? '—']);
  const colW = w / 2;
  facts.forEach(([k, v], i) => {
    const fx = x + (i % 2) * colW;
    const fy = y + Math.floor(i / 2) * 24;
    pdf.font('Helvetica-Bold').fontSize(6.5).fillColor(C.muted).text(k, fx, fy, { width: colW - 6, characterSpacing: 0.8, lineBreak: false });
    pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(v, fx, fy + 9, { width: colW - 6, height: 12, ellipsis: true, lineBreak: false });
  });
  y += Math.ceil(facts.length / 2) * 24 + 4;

  /* ── Return address (pinned to the bottom of the label) ── */
  const logoH = 20;
  const fromTop = y0 + CELL.height - PAD - 66;
  pdf.save().lineWidth(0.6).strokeColor(C.line).dash(3, { space: 3 });
  pdf.moveTo(x, fromTop - 8).lineTo(x + w, fromTop - 8).stroke();
  pdf.undash().restore();
  small('IF UNDELIVERED, RETURN TO', fromTop);
  let fy = fromTop + 11;
  let textX = x;
  if (logo) {
    pdf.image(logo as unknown as Buffer, x, fy, { height: logoH });
    textX = x + logoH * LOGO_RATIO + 10;
  }
  const textW = x + w - textX;
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text(logo ? sender.legalName : `${sender.brandName} · ${sender.legalName}`, textX, fy, { width: textW, lineBreak: false, ellipsis: true });
  fy = pdf.y + 1;
  pdf.font('Helvetica').fontSize(7.5).fillColor(C.muted).text([...sender.addressLines, sender.phone ? `Ph: ${sender.phone}` : ''].filter(Boolean).join('\n'), textX, fy, { width: textW, height: 44, ellipsis: true });
}
