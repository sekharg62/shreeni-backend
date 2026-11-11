import type { InvoiceLine, InvoiceTotals } from './gst.js';

/** Everything printed on one invoice: built by InvoicesService, drawn by renderInvoicePdf. Amounts in paise. */
export type InvoiceDocument = {
  /** "Tax Invoice" with a GSTIN, otherwise "Bill of Supply". */
  title: 'Tax Invoice' | 'Bill of Supply';
  registered: boolean;
  intraState: boolean;
  seller: {
    brandName: string;
    legalName: string;
    addressLines: string[];
    state: string;
    stateCode: string | null;
    gstin: string | null;
    email: string;
    phone: string;
  };
  invoiceNumber: string;
  invoiceDate: Date;
  orderNumber: string;
  orderDate: Date;
  /** "West Bengal (19)". */
  placeOfSupply: string;
  buyer: { name: string; addressLines: string[]; phone: string; email: string | null };
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  discountCode: string | null;
  /** "Paid online on 10 Nov 2026", "Cash on delivery" … */
  paymentNote: string;
  /** e.g. the order was cancelled after invoicing. */
  notice: string | null;
};
