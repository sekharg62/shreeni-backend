import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PincodeDto } from './pincode.dto.js';
import { isPincode } from './pincode-normalize.js';

@Injectable()
export class PincodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** State (and district) of a PIN code, or null when it isn't in India Post's directory. */
  async find(pincode: string): Promise<PincodeDto | null> {
    if (!isPincode(pincode)) return null;
    const row = await this.prisma.pincode.findUnique({
      where: { pincode },
      select: {
        pincode: true,
        state: { select: { name: true } },
        district: { select: { name: true } },
      },
    });
    if (!row) return null;
    return { pincode: row.pincode, district: row.district?.name ?? null, state: row.state.name };
  }

  async lookup(pincode: string): Promise<PincodeDto> {
    if (!isPincode(pincode)) throw new BadRequestException('Enter a valid 6-digit pincode');
    const found = await this.find(pincode);
    if (!found) throw new NotFoundException('We couldn’t find this pincode');
    return found;
  }

  /**
   * Address check (same rule the storefront form applies live): the PIN code must exist in
   * India Post's directory, and the chosen state must be the PIN code's state.
   */
  async assertValidForState(pincode: string, state: string): Promise<void> {
    const found = await this.find(pincode);
    if (!found) {
      throw new BadRequestException(`We couldn\u2019t find pincode ${pincode}. Please check it.`);
    }
    if (found.state !== state) {
      throw new BadRequestException(
        `Pincode ${pincode} is in ${found.state}, not ${state}. Please check the pincode or the state.`,
      );
    }
  }
}
