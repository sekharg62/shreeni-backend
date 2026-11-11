import { describe, expect, it } from 'vitest';
import {
  allocate,
  amountInWords,
  buildInvoiceLines,
  financialYear,
  formatInvoiceNumber,
  GSTIN_PATTERN,
  numberInWords,
  splitInclusive,
  stateCode,
} from './gst.js';

describe('financialYear (India time, April–March)', () => {
  it.each([
    ['2026-11-10T06:00:00Z', '26-27'],
    ['2027-03-31T18:00:00Z', '26-27'], // 31 Mar 23:30 IST
    ['2027-03-31T18:30:00Z', '27-28'], // 1 Apr 00:00 IST
    ['2026-04-01T00:00:00Z', '26-27'],
    ['2099-12-01T00:00:00Z', '99-00'],
  ])('%s → %s', (iso, fy) => {
    expect(financialYear(new Date(iso))).toBe(fy);
  });
});

describe('formatInvoiceNumber', () => {
  it('pads to 4 digits and stays within GST’s 16 characters', () => {
    expect(formatInvoiceNumber('SHR', '26-27', 7)).toBe('SHR/26-27/0007');
    expect(formatInvoiceNumber('ABCD', '26-27', 99999)).toHaveLength(16);
  });
});

describe('allocate', () => {
  it('splits exactly, in proportion', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [3000, 1000])).toEqual([750, 250]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    const parts = allocate(9999, [123456, 7890, 555]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9999);
  });
});

describe('splitInclusive', () => {
  it('works GST out of a tax-inclusive price', () => {
    expect(splitInclusive(105000, 5)).toEqual({ taxable: 100000, tax: 5000 });
    expect(splitInclusive(209900, 5)).toEqual({ taxable: 199905, tax: 9995 });
    expect(splitInclusive(5000, 0)).toEqual({ taxable: 5000, tax: 0 });
  });
});

describe('buildInvoiceLines', () => {
  const items = [
    { name: 'Red Saree', size: 'Free Size', sku: 'RS-1', hsnCode: '5007', gstRate: 5, unitPrice: 300000, quantity: 1 },
    { name: 'Tant Saree', size: null, sku: null, hsnCode: '5208', gstRate: 5, unitPrice: 100000, quantity: 2 },
  ];

  it('same state: CGST + SGST, discount spread by value, totals match what was paid', () => {
    const { lines, totals } = buildInvoiceLines({ items, discountTotal: 50000, shippingTotal: 0, intraState: true, registered: true });
    expect(lines.map((l) => l.discount)).toEqual([30000, 20000]);
    expect(totals.total).toBe(500000 - 50000);
    expect(totals.igst).toBe(0);
    expect(totals.taxable + totals.cgst + totals.sgst).toBe(totals.total);
    for (const l of lines) expect(Math.abs(l.cgst - l.sgst)).toBeLessThanOrEqual(1);
  });

  it('another state: IGST only', () => {
    const { totals } = buildInvoiceLines({ items, discountTotal: 0, shippingTotal: 0, intraState: false, registered: true });
    expect(totals).toMatchObject({ cgst: 0, sgst: 0, total: 500000 });
    expect(totals.taxable + totals.igst).toBe(500000);
  });

  it('delivery is its own line at the highest item rate', () => {
    const { lines, totals } = buildInvoiceLines({
      items: [{ ...items[0], gstRate: 12 }, items[1]],
      discountTotal: 0,
      shippingTotal: 9900,
      intraState: true,
      registered: true,
    });
    expect(lines.at(-1)).toMatchObject({ description: 'Delivery charges', gstRate: 12, amount: 9900 });
    expect(totals.total).toBe(509900);
  });

  it('unregistered seller (Bill of Supply): no GST at all', () => {
    const { lines, totals } = buildInvoiceLines({ items, discountTotal: 0, shippingTotal: 0, intraState: true, registered: false });
    expect(lines.every((l) => l.gstRate === 0)).toBe(true);
    expect(totals).toMatchObject({ cgst: 0, sgst: 0, igst: 0, taxable: 500000, total: 500000 });
  });
});

describe('amount in words', () => {
  it.each([
    [0, 'Zero'],
    [15, 'Fifteen'],
    [105, 'One Hundred Five'],
    [2099, 'Two Thousand Ninety Nine'],
    [150000, 'One Lakh Fifty Thousand'],
    [12345678, 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight'],
  ])('%i → %s', (n, words) => {
    expect(numberInWords(n)).toBe(words);
  });

  it('rupees and paise', () => {
    expect(amountInWords(209950)).toBe('Rupees Two Thousand Ninety Nine and Fifty Paise Only');
    expect(amountInWords(209900)).toBe('Rupees Two Thousand Ninety Nine Only');
  });
});

describe('states and GSTIN', () => {
  it('maps state names (any spacing/case, "&") to GST codes', () => {
    expect(stateCode('West Bengal')).toBe('19');
    expect(stateCode(' west  bengal ')).toBe('19');
    expect(stateCode('Andaman & Nicobar Islands')).toBe('35');
    expect(stateCode('Atlantis')).toBeNull();
  });

  it('accepts a well-formed GSTIN only', () => {
    expect(GSTIN_PATTERN.test('19AABCS1429B1Z5')).toBe(true);
    expect(GSTIN_PATTERN.test('19AABCS1429B1X5')).toBe(false);
  });
});
