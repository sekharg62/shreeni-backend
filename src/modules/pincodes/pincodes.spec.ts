import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { INDIAN_STATES } from '../addresses/indian-states.js';
import { isPincode, normalizeState, parseCsvLine, titleCase } from './pincode-normalize.js';
import { PincodesService } from './pincodes.service.js';

describe('pincode normalisation', () => {
  it.each([
    ['WEST BENGAL', 'West Bengal'],
    ['west bengal', 'West Bengal'],
    ['ORISSA', 'Odisha'],
    ['PONDICHERRY', 'Puducherry'],
    ['UTTARANCHAL', 'Uttarakhand'],
    ['NCT OF DELHI', 'Delhi'],
    ['DAMAN & DIU', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['JAMMU & KASHMIR', 'Jammu and Kashmir'],
    ['ANDAMAN & NICOBAR ISLANDS', 'Andaman and Nicobar Islands'],
  ])('state %s → %s', (raw, expected) => {
    expect(normalizeState(raw)).toBe(expected);
  });

  it('recognises every state in the address form list, and rejects unknowns', () => {
    for (const s of INDIAN_STATES) expect(normalizeState(s.toUpperCase())).toBe(s);
    expect(normalizeState('ATLANTIS')).toBeNull();
    expect(normalizeState('')).toBeNull();
  });

  it('title-cases district names', () => {
    expect(titleCase('NORTH 24 PARGANAS')).toBe('North 24 Parganas');
    expect(titleCase('  SOUTH   ANDAMAN ')).toBe('South Andaman');
    expect(titleCase('PURBA BARDHAMAN (EAST)')).toBe('Purba Bardhaman (East)');
    expect(titleCase('ISLE OF MAN')).toBe('Isle of Man');
  });

  it('validates PIN codes', () => {
    expect(isPincode('743134')).toBe(true);
    expect(isPincode('043134')).toBe(false);
    expect(isPincode('74313')).toBe(false);
    expect(isPincode('7431345')).toBe(false);
  });

  it('parses CSV lines with quotes and commas', () => {
    expect(parseCsvLine('a,"b, c","d ""e""",  f ')).toEqual(['a', 'b, c', 'd "e"', 'f']);
  });
});

const row = (pincode: string, state: string, district: string | null) => ({
  pincode,
  state: { name: state },
  district: district === null ? null : { name: district },
});

describe('PincodesService', () => {
  const setup = (found: unknown) => {
    const prisma = { pincode: { findUnique: vi.fn().mockResolvedValue(found) } };
    return { prisma, service: new PincodesService(prisma as unknown as PrismaService) };
  };

  it('returns the state and district', async () => {
    const { service } = setup(row('743134', 'West Bengal', '24 Paraganas North'));
    await expect(service.lookup('743134')).resolves.toEqual({
      pincode: '743134',
      district: '24 Paraganas North',
      state: 'West Bengal',
    });
  });

  it('copes with a PIN code that has no district', async () => {
    const { service } = setup(row('795160', 'Manipur', null));
    await expect(service.lookup('795160')).resolves.toEqual({ pincode: '795160', district: null, state: 'Manipur' });
  });

  it('400s for a malformed PIN without touching the database', async () => {
    const { prisma, service } = setup(null);
    await expect(service.lookup('12ab56')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pincode.findUnique).not.toHaveBeenCalled();
  });

  it('404s for an unknown PIN', async () => {
    const { service } = setup(null);
    await expect(service.lookup('999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('assertValidForState (address validation)', () => {
    it('passes when the state matches', async () => {
      const { service } = setup(row('743134', 'West Bengal', '24 Paraganas North'));
      await expect(service.assertValidForState('743134', 'West Bengal')).resolves.toBeUndefined();
    });

    it('rejects a state that does not match the PIN code, naming the right one', async () => {
      const { service } = setup(row('743134', 'West Bengal', '24 Paraganas North'));
      const err = await service.assertValidForState('743134', 'Bihar').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain('743134 is in West Bengal, not Bihar');
    });

    it('rejects a PIN code that is not in the directory', async () => {
      const { service } = setup(null);
      const err = await service.assertValidForState('999999', 'Bihar').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain('couldn’t find pincode 999999');
    });
  });
});
