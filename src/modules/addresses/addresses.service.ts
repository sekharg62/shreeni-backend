import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizeIndianPhone } from '../auth/phone.js';
import { PincodesService } from '../pincodes/pincodes.service.js';
import type { AddressDto, CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

export const MAX_ADDRESSES = 10;

/** What the customer gets back — no userId or timestamps. */
const ADDRESS_SELECT = {
  id: true,
  label: true,
  receiverName: true,
  receiverPhone: true,
  flatHouseNo: true,
  apartmentSector: true,
  landmark: true,
  city: true,
  state: true,
  pincode: true,
  country: true,
  isDefault: true,
} as const;

/** Default first, then most recently added. */
const ADDRESS_ORDER = [{ isDefault: 'desc' as const }, { createdAt: 'desc' as const }];

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pincodes: PincodesService,
  ) {}

  list(userId: string): Promise<AddressDto[]> {
    return this.prisma.address.findMany({ where: { userId }, orderBy: ADDRESS_ORDER, select: ADDRESS_SELECT });
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressDto> {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`);
    }
    await this.pincodes.assertValidForState(dto.pincode, dto.state);
    return this.prisma.address.create({
      data: {
        ...this.clean(dto),
        receiverName: dto.receiverName,
        receiverPhone: this.phone(dto.receiverPhone),
        flatHouseNo: dto.flatHouseNo,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        userId,
        // The first address is the default automatically.
        isDefault: count === 0,
      },
      select: ADDRESS_SELECT,
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<AddressDto> {
    const current = await this.own(userId, id);
    if (dto.pincode !== undefined || dto.state !== undefined) {
      // Check the address as it will be after the edit.
      await this.pincodes.assertValidForState(dto.pincode ?? current.pincode, dto.state ?? current.state);
    }
    return this.prisma.address.update({
      where: { id },
      data: {
        ...this.clean(dto),
        ...(dto.receiverName !== undefined && { receiverName: dto.receiverName }),
        ...(dto.receiverPhone !== undefined && { receiverPhone: this.phone(dto.receiverPhone) }),
        ...(dto.flatHouseNo !== undefined && { flatHouseNo: dto.flatHouseNo }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode }),
      },
      select: ADDRESS_SELECT,
    });
  }

  /** Make one address the default; returns the updated list. */
  async setDefault(userId: string, id: string): Promise<AddressDto[]> {
    await this.own(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.list(userId);
  }

  /** Delete; if it was the default, the newest remaining address takes over. Returns the updated list. */
  async remove(userId: string, id: string): Promise<AddressDto[]> {
    const address = await this.own(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.list(userId);
  }

  /** 404 for someone else's address too, so ids can't be probed. */
  private async own(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true, isDefault: true, pincode: true, state: true },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  private phone(input: string): string {
    const phone = normalizeIndianPhone(input);
    if (!phone) throw new BadRequestException('Enter a valid 10-digit mobile number');
    return phone;
  }

  /** Label and the optional lines; blanks become null. */
  private clean(dto: UpdateAddressDto) {
    return {
      ...(dto.label !== undefined && { label: dto.label }),
      ...('apartmentSector' in dto && { apartmentSector: dto.apartmentSector ?? null }),
      ...('landmark' in dto && { landmark: dto.landmark ?? null }),
    };
  }
}
