import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';

/** 404 if the product in the URL doesn't exist (used by every nested product route). */
export async function ensureProduct(prisma: PrismaService, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new NotFoundException(`Product ${productId} not found`);
}

/** 400 listing any ids that don't exist, e.g. ensureIds(prisma.tag, tagIds, 'Tag'). */
export async function ensureIds(
  delegate: { findMany(args: { where: { id: { in: string[] } }; select: { id: true } }): Promise<{ id: string }[]> },
  ids: string[],
  label: string,
) {
  if (ids.length === 0) return;
  const found = new Set((await delegate.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new BadRequestException(`${label} not found: ${missing.join(', ')}`);
  }
}

/** 400 if two primary/secondary colors are the same, etc. */
export function assertDistinct(values: (string | null | undefined)[], message: string) {
  const present = values.filter(Boolean);
  if (new Set(present).size !== present.length) throw new BadRequestException(message);
}
