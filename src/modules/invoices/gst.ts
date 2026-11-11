/*
 * GST invoice maths: plain functions (no database), so they're easy to test.
 * All amounts are paise. Shop prices INCLUDE GST, so tax is worked out backwards from each price:
 *   taxable value = price × 100 / (100 + rate),   GST = price − taxable value.
 * Same state as the seller → CGST + SGST (half each); another state → IGST.
 */

/** IST is UTC+5:30 all year. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** GST state codes (first two digits of a GSTIN), keyed by the state names the shop uses. */
export const GST_STATE_CODES: Record<string, string> = {
  'Jammu and Kashmir': '01',
  'Himachal Pradesh': '02',
  Punjab: '03',
  Chandigarh: '04',
  Uttarakhand: '05',
  Haryana: '06',
  Delhi: '07',
  Rajasthan: '08',
  'Uttar Pradesh': '09',
  Bihar: '10',
  Sikkim: '11',
  'Arunachal Pradesh': '12',
  Nagaland: '13',
  Manipur: '14',
  Mizoram: '15',
  Tripura: '16',
  Meghalaya: '17',
  Assam: '18',
  'West Bengal': '19',
  Jharkhand: '20',
  Odisha: '21',
  Chhattisgarh: '22',
  'Madhya Pradesh': '23',
  Gujarat: '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Maharashtra: '27',
  Karnataka: '29',
  Goa: '30',
  Lakshadweep: '31',
  Kerala: '32',
  'Tamil Nadu': '33',
  Puducherry: '34',
  'Andaman and Nicobar Islands': '35',
  Telangana: '36',
  'Andhra Pradesh': '37',
  Ladakh: '38',
};

const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');

/** "west bengal " → "19"; null if unknown. */
export function stateCode(state: string): string | null {
  const wanted = norm(state);
  for (const [name, code] of Object.entries(GST_STATE_CODES)) if (norm(name) === wanted) return code;
  return null;
}

/** "19" → "West Bengal". */
export function stateName(code: string): string | null {
  return Object.entries(GST_STATE_CODES).find(([, c]) => c === code)?.[0] ?? null;
}

/** 15-character GSTIN: 2-digit state code, PAN, entity number, "Z", check character. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Indian financial year (April–March) of a date, India time: 10 Nov 2026 → "26-27", 5 Mar 2027 → "26-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1; // April = month 3
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}

/**
 * "SHR", "26-27", 7 → "SHR/26-27/0007". GST allows at most 16 characters, so the prefix is
 * kept to 4 and the counter to 5 digits ("ABCD/26-27/99999" is exactly 16).
 */
export function formatInvoiceNumber(prefix: string, fy: string, n: number): string {
  return `${prefix}/${fy}/${String(n).padStart(4, '0')}`;
}

export const MAX_PREFIX_LENGTH = 4;

/**
 * Split `total` across `weights` in proportion, in whole paise, with the parts adding up exactly
 * (largest remainders get the leftover paise). Used to spread an order discount over its items.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

/** Tax-inclusive amount → taxable value + GST at `rate` %. */
export function splitInclusive(amount: number, rate: number): { taxable: number; tax: number } {
  if (rate <= 0) return { taxable: amount, tax: 0 };
  const taxable = Math.round((amount * 100) / (100 + rate));
  return { taxable, tax: amount - taxable };
}

export type InvoiceItemInput = {
  name: string;
  size: string | null;
  sku: string | null;
  hsnCode: string | null;
  gstRate: number;
  unitPrice: number;
  quantity: number;
};

export type InvoiceLine = {
  description: string;
  detail: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  /** Price × quantity, before the order discount. */
  gross: number;
  /** This line's share of the order discount. */
  discount: number;
  /** What the customer pays for this line (GST included). */
  amount: number;
  taxable: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type InvoiceTotals = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  /** Equals the order's grand total. */
  total: number;
};

/** Split GST between CGST+SGST (same state) or IGST (another state). */
function taxSplit(tax: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

/**
 * Invoice lines and totals for an order. The order discount is spread over the items in
 * proportion to their value; delivery (if charged) is its own line, taxed at the highest item
 * rate (it's part of a composite supply of the goods). `registered` = the seller has a GSTIN;
 * if not, it's a Bill of Supply and no GST is shown.
 */
export function buildInvoiceLines(input: {
  items: InvoiceItemInput[];
  discountTotal: number;
  shippingTotal: number;
  intraState: boolean;
  registered: boolean;
}): { lines: InvoiceLine[]; totals: InvoiceTotals } {
  const gross = input.items.map((i) => i.unitPrice * i.quantity);
  const discounts = allocate(input.discountTotal, gross);

  const line = (
    base: Omit<InvoiceLine, 'taxable' | 'cgst' | 'sgst' | 'igst' | 'amount' | 'gstRate'>,
    rate: number,
  ): InvoiceLine => {
    const amount = base.gross - base.discount;
    const gstRate = input.registered ? rate : 0;
    const { taxable, tax } = splitInclusive(amount, gstRate);
    return { ...base, amount, gstRate, taxable, ...taxSplit(tax, input.intraState) };
  };

  const lines = input.items.map((i, k) =>
    line(
      {
        description: i.name,
        detail: [i.size && `Size: ${i.size}`, i.sku && `SKU: ${i.sku}`].filter(Boolean).join(' · ') || null,
        hsnCode: i.hsnCode,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        gross: gross[k],
        discount: discounts[k],
      },
      i.gstRate,
    ),
  );

  if (input.shippingTotal > 0) {
    const rate = Math.max(0, ...input.items.map((i) => i.gstRate));
    lines.push(
      line(
        { description: 'Delivery charges', detail: null, hsnCode: null, quantity: 1, unitPrice: input.shippingTotal, gross: input.shippingTotal, discount: 0 },
        rate,
      ),
    );
  }

  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'amount') => lines.reduce((n, l) => n + l[k], 0);
  return {
    lines,
    totals: {
      taxable: sum('taxable'),
      cgst: sum('cgst'),
      sgst: sum('sgst'),
      igst: sum('igst'),
      discount: input.discountTotal,
      total: sum('amount'),
    },
  };
}

/* ───────────── Amount in words (Indian numbering: lakh, crore) ───────────── */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** 12345 → "Twelve Thousand Three Hundred Forty Five" (whole numbers, Indian grouping). */
export function numberInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** 209950 paise → "Rupees Two Thousand Ninety Nine and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${numberInWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}
